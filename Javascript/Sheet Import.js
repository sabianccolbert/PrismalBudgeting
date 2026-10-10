// =====================================================================
// SPREADSHEET IMPORT (temporary: once the last Google Sheets budget is brought over, delete this file, the
// #sheetImport card at the bottom of index.html, its line in Boot.js, its styles in budgetStyle.css, and the
// API's sheetimport.js with its route)
// =====================================================================
// Brings a Prismal Budget Google Sheet into this account. The API downloads the sheet's tabs (the sheet has
// to be shared as "anyone with the link can view"), and this turns them into the website's tables, which hold
// the same things the same way:
//   Budget (its 4-week calendar) -> the calendar     Recurring -> recurring entries   History -> History
//   Tracker -> the tracker   Future Dates -> Upcoming   Form Entries -> Change Logs   Paycheck Calculator
// Left out: Search Results, the Change Logs tab (the form's raw answers), the Done cell, Dave's message, and
// Savings (an account's balance here comes from its entries; the tab's total is compared after the import).
// Everything is saved as the sheet had it, then the page reloads, and the daily update brings it up to today
// like any budget (the sheet's last Daily Update, in Form Entries, says which days it already did).

const SHEET_IMPORT_NOTE = "prismal_sheet_import"; // What the import found, to compare once the page reloads

window.workspaceReady.then((loaded) => {
  if (!loaded) return;
  document.getElementById("sheetImportForm")?.addEventListener("submit", importSheet);
  reportSheetImport();
});

function sheetImportSay(message, isWarning = false) {
  const status = document.getElementById("sheetImportStatus");
  if (!status) return;
  status.textContent = message;
  status.hidden = !message;
  status.classList.toggle("negative", isWarning);
}

async function importSheet(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const link = document.getElementById("sheetImportLink").value.trim();
  if (!link) return sheetImportSay("Paste the spreadsheet's link first.", true);
  if (budgetHasEntries() && !window.confirm("This budget already has entries. Importing replaces its calendar, History, recurring entries, tracker, Upcoming, and Change Logs with the spreadsheet's. Import anyway?")) return;

  const setBusy = (busy) => form.querySelectorAll("input, button").forEach(control => { control.disabled = busy; });
  setBusy(true);
  sheetImportSay("Reading the spreadsheet...");
  const result = await budgetApi("/api/import/sheet", { url: link });
  if (!result.ok || !result.data || !result.data.sheets) {
    setBusy(false);
    return sheetImportSay(result.data?.error || (result.status === 0 ? "Couldn't reach the server. Please try again." : "Couldn't read the spreadsheet. Please try again."), true);
  }

  let tables;
  try {
    tables = sheetTables(result.data.sheets);
  } catch (err) {
    setBusy(false);
    return sheetImportSay(err.message, true);
  }

  sheetImportSay("Saving your budget...");
  if (!(await saveSheetTables(tables))) {
    setBusy(false);
    return sheetImportSay("Couldn't save all of it. Please check your connection and import again.", true);
  }
  try { sessionStorage.setItem(SHEET_IMPORT_NOTE, JSON.stringify(tables.note)); } catch (e) {}
  writeUndoHistory({ undo: [], redo: [] }); // Nothing from before the import can be undone
  window.location.reload();
}

// Anything in this budget already (a new account has none)
function budgetHasEntries() {
  const filled = (rows, from) => rows.slice(from).some(row => row.some(cell => String(cell ?? "").trim() !== ""));
  return filled(historyData, 1) || filled(recurringData, 2) || filled(futureData, 1) ||
    calendarData.some(row => row.some(cell => ownEntryLines(cell).length > 0));
}

/* ---------- The sheet's tabs -> the website's tables ---------- */

function sheetTables(sheets) {
  const tab = (name, required = false) => {
    const rows = sheets[name];
    if (Array.isArray(rows) && rows.length > 0) return rows.map(row => (Array.isArray(row) ? row : []).map(cell => String(cell ?? "").replace(/\r\n?/g, "\n")));
    if (required) throw new Error(`Couldn't find a tab called "${name}", so it doesn't look like a Prismal Budget spreadsheet (or that tab is hidden).`);
    return null;
  };

  // The calendar: the Budget tab's rows 4 to 7, one day in each cell ("10/04\n✅ $318.63 In Bank\n...").
  // In Bank, Gains, Costs, and the last day's extra lines are worked out again once it loads.
  const calendar = tab("Budget", true).slice(3, 7).map(row => Array.from({ length: 7 }, (_, c) => String(row[c] ?? "").trim()));
  if (calendar.length !== 4 || calendar.some(row => row.some(cell => !/^\d{1,2}\/\d{1,2}(\n|$)/.test(cell)))) {
    throw new Error("Couldn't find the calendar on the Budget tab (rows 4 to 7, with a day in each cell).");
  }

  const recurring = sheetTable(tab("Recurring", true), 6, 2).map((row, i) => (i < 2 || String(row[0]).trim() === "-") ? row : [
    row[0].trim(), sheetMoney(row[1]), sheetDate(row[2]), row[3].trim(), sheetDate(row[4]) || "None", row[5].trim()
  ]);
  const history = sheetTable(tab("History", true), 7, 1);
  const tracker = sheetTable(tab("Tracker") || [["Type", "Last 4 Weeks", "Last 3 Months", "Last 365 Days", "Aliases"]], 5, 1);
  const future = sheetTable(tab("Future Dates") || [["Title", "Amount", "Day", "Type"]], 4, 1)
    .map((row, i) => i === 0 ? row : [row[0].trim(), sheetMoney(row[1]), sheetDate(row[2]), row[3].trim()]);

  // Change Logs: newest first, like Form Entries (its old column titles at the bottom are left out). The
  // import's own row goes on top, so one less fits.
  const logRows = tab("Form Entries") || [["Time", "Duration", "Action", "Details"]];
  const logs = [padSheetRow(logRows[0], 8), ...logRows.slice(1)
    .filter(row => row.some(cell => cell.trim() !== "") && row[0].trim() !== "Date & Time Submitted")
    .map(row => [...padSheetRow(row, 7).slice(0, 7), ""])
    .slice(0, MAX_LOG_ROWS - 1)];

  // The paycheck calculator, when it has numbers in it (rows 0-2 results, 4-20 inputs, like here)
  const calculatorRows = tab("Paycheck Calculator");
  const calculator = calculatorRows && calculatorRows.slice(0, 21).some(row => parseAmount(row[1]) !== 0)
    ? Array.from({ length: Math.max(TABLE_SHAPES.calculator.minRows, calculatorRows.length) }, (_, r) => padSheetRow(calculatorRows[r] || [], 2))
    : null;

  const processedDate = sheetProcessedDate(logs, calendar);
  const savingsTotal = parseAmount(tab("Savings")?.[1]?.[0]);
  return {
    calendar, recurring, history, tracker, future, logs, calculator,
    processedDate: formatToMMDDYYYY(processedDate),
    note: {
      savingsTotal,
      inBank: sheetInBank(calendar, processedDate),
      weeks: history.slice(1).length,
      recurring: recurring.slice(2).filter(row => String(row[0]).trim() !== "-").length,
      upcoming: future.length - 1,
      logs: logs.length - 1
    }
  };
}

// Rows padded (or cut) to cols cells, keeping the header rows, without blank rows after them
function sheetTable(rows, cols, headerRows) {
  const table = rows.map(row => padSheetRow(row, cols));
  while (table.length < headerRows) table.push(padSheetRow([], cols));
  return table.filter((row, i) => i < headerRows || row.some(cell => cell.trim() !== ""));
}

function padSheetRow(row, cols) {
  return Array.from({ length: cols }, (_, c) => String(row[c] ?? ""));
}

// "-$1,200" -> "-$1200.00" (blank stays blank)
function sheetMoney(text) {
  return String(text ?? "").trim() === "" ? "" : formatMoney(parseAmount(text));
}

// "1/4/2026" -> "01/04/2026"; "" when there's no date (like "None")
function sheetDate(text) {
  const trimmed = String(text ?? "").trim();
  if (!/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmed)) return "";
  return formatToMMDDYYYY(createSafeMidnight(trimmed));
}

// The last day the sheet's daily update ran on (its newest Daily Update in Form Entries). Without one: the
// first day on its calendar that still has recurring entries (the update turns a day's into temps once it
// passes), or today.
function sheetProcessedDate(logs, calendar) {
  const update = logs.slice(1).find(row => row[2].includes("Daily Update"));
  const logged = update && update[0].match(/(\d{1,2}\/\d{1,2}\/\d{4})\s*$/);
  if (logged) return createSafeMidnight(logged[1]);
  const start = sheetGridStart(calendar, pageDay);
  for (let i = 0; i < 28; i++) {
    const lines = calendar[Math.floor(i / 7)][i % 7].split("\n");
    if (lines.some(line => line.trim().startsWith("✔️"))) return addDays(start, i);
  }
  return pageDay;
}

// The Sunday the sheet's calendar starts on (its first cell says the month and day; the year is the one
// that puts it nearest near)
function sheetGridStart(calendar, near) {
  const [month, day] = calendar[0][0].split("\n")[0].split("/").map(Number);
  let best = null;
  for (let year = near.getFullYear() - 1; year <= near.getFullYear() + 1; year++) {
    const candidate = new Date(year, month - 1, day);
    if (!best || Math.abs(candidate - near) < Math.abs(best - near)) best = candidate;
  }
  return best;
}

// The sheet's In Bank on the last day its update ran (compared after the import, since the website works
// In Bank out again), or null when that day isn't on its calendar
function sheetInBank(calendar, processedDate) {
  const start = sheetGridStart(calendar, processedDate);
  const index = getDayDifference(processedDate, start);
  if (index < 0 || index > 27) return null;
  const amount = readInBank(calendar[Math.floor(index / 7)][index % 7]);
  return amount === null ? null : { date: formatToMMDDYYYY(processedDate), amount };
}

/* ---------- Saving ---------- */

// Every table the sheet had, in line with any other change, then the day the sheet's update ran
function saveSheetTables(tables) {
  const run = budgetQueue.then(async () => {
    const startedAt = performance.now();
    calendarData = tables.calendar;
    recurringData = tables.recurring;
    historyData = tables.history;
    trackerData = tables.tracker;
    futureData = tables.future;
    logsData = tables.logs;
    if (tables.calculator) calculatorData = tables.calculator;
    calendarEdited = recurringEdited = historyEdited = trackerEdited = futureEdited = calculatorEdited = true;

    beginChangeLog("📥 Spreadsheet Import", startedAt);
    formEntryRow[3] = "Weeks Of History: " + tables.note.weeks;
    formEntryRow[4] = "Recurring Entries: " + tables.note.recurring;
    formEntryRow[5] = "Upcomings: " + tables.note.upcoming;
    formEntryRow[6] = "Change Logs: " + tables.note.logs;
    finishChangeLog();

    if (!(await saveChanges())) return false;
    return saveProcessedDate(tables.processedDate);
  });
  budgetQueue = run.catch(() => false);
  return run.catch(() => false);
}

/* ---------- After the reload: what came over, and what's different ---------- */

function reportSheetImport() {
  let note = null;
  try {
    note = JSON.parse(sessionStorage.getItem(SHEET_IMPORT_NOTE) || "null");
    sessionStorage.removeItem(SHEET_IMPORT_NOTE);
  } catch (e) {}
  if (!note) return;

  const messages = [`Imported: ${note.weeks} weeks of History, ${note.recurring} recurring entries, ${note.upcoming} Upcoming, and ${note.logs} change logs.`];

  // The website leaves ✖️ Hidden entries out of In Bank; the sheet counted Hidden costs back in, so days
  // since its last History week can differ
  const day = note.inBank && createSafeMidnight(note.inBank.date, true);
  const spot = day && !isNaN(day.getTime()) ? calendarSpot(day) : null;
  const here = spot ? readInBank(calendarData[spot.r][spot.c]) : null;
  if (here !== null && Math.abs(here - note.inBank.amount) >= 0.005) {
    messages.push(`In Bank on ${showDay(day)} was ${formatMoney(note.inBank.amount)} in the spreadsheet and is ${formatMoney(here)} here, since ✖️ Hidden entries never change In Bank here (the spreadsheet added Hidden costs back in). Compare it with your bank, and add a Catchup entry if they don't match.`);
  }

  const savings = accountSummaries().find(summary => isDefaultAccount(accountsData.list[summary.index]));
  if (savings && Math.abs(savings.today - note.savingsTotal) >= 0.005) {
    messages.push(`The spreadsheet's Savings tab said ${formatMoney(note.savingsTotal)}, and ${savings.name} here is ${formatMoney(savings.today)} (it adds up Hidden and Transfer entries titled ${savings.name}). To match, add a ✖️ Hidden entry titled ${savings.name} for the difference.`);
  }

  sheetImportSay(messages.join(" "));
  BudgetUI.showToast("Your spreadsheet is imported. The details are at the bottom of the page.");
}
