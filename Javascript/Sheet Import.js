// =====================================================================
// SPREADSHEET IMPORT (temporary: once the last Google Sheets budget is brought over, delete this file, the
// #sheetImport card at the bottom of index.html, its line in Boot.js, its styles in budgetStyle.css, How It
// Works' #sheet-import section, and the API's sheetimport.js with its route)
// =====================================================================
// Brings a Prismal Budget Google Sheet into this account. The API downloads the sheet's tabs (the sheet has
// to be shared as "anyone with the link can view"), and this turns them into the website's tables, which hold
// the same things the same way:
//   Budget (its 4-week calendar) -> the calendar     Recurring -> recurring entries   History -> History
//   Tracker -> the tracker   Future Dates -> Upcoming   Paycheck Calculator
//   Form Entries, then the Change Logs tab's answers from before Form Entries was added -> Change Logs
// Left out: Search Results, the Done cell, Dave's message, the notification time, and Savings (an account's
// balance here comes from its entries; the tab's total is compared after the import).
//
// The spreadsheet's endings ("rent-" costs only, "paycheck+" gains only, "food=" a whole tracker row) never
// show here: tracker aliases keep them inside the tracker table, where the site reads them (parseAlias) and
// shows them as words, and the searches in the logs come over in words.
//
// Real tabs and display copies: the sheet's code keeps each part of the budget in a hidden "C" tab (C Budget,
// C Recurring, C History, ...), hidden so a stray tap can't change it, and shows a copy of it under the plain
// name (Budget, Recurring, History, ...). It only refreshes a copy when it changes that part, so a copy can
// lag behind (its totals do), and a sheet that's just been set up has no copies yet. The API reads each part
// from its C tab, and from the copy only when there's no C tab (its answer's `from` says which).
//
// The sheet's ways, turned into the website's:
//   - Savings: the sheet stores an entry titled Savings from the savings account's side: a $100 Money Move
//     into savings is "⭕️ $100.00 Savings", and In Bank goes down $100. Here a Transfer is stored from In
//     Bank's side, and the account gets the opposite (accountChange), so that's "⭕️ -$100.00 Savings": each
//     Savings transfer flips sign, and In Bank and Savings come out the same. A Hidden one is the account's
//     own amount in both, so it stays as it is. Both are written "→ Savings" here (the Savings account picked
//     under Other Account), since a title alone doesn't link an entry to an account.
//   - Amounts are written the website's way ("$274" is $274.00, "$-29.98" is -$29.98), and types the
//     standard way (a recurring entry's ✔️ comes first, a temp's second).
//   - The daily update brings the budget up to today from the calendar's first day (sheetTables says why).
//
// Nothing is saved until everything checks out: every recurring entry's amount, dates, frequency, and type
// can be read, every day on the calendar, in History, and in Upcoming is a real date, the calendar's days
// follow each other, and every line on the calendar is an entry. Anything that can't be read is listed instead
// of being guessed at. Then the person sees what's about to come over (with anything worth knowing, like a
// History week that's missing) and says yes, it's saved, and it's read back from the server and compared,
// table by table, before the page reloads.

const SHEET_IMPORT_NOTE = "prismal_sheet_import"; // What the import found, to compare once the page reloads
const SHEET_TABLES = ["calendar", "recurring", "history", "tracker", "future", "logs", "calculator"];

window.workspaceReady.then((loaded) => {
  if (!loaded) return;
  document.getElementById("sheetImportForm")?.addEventListener("submit", importSheet);
  reportSheetImport();
});

// The card's status line (red for a problem); an empty message hides it
function sheetImportSay(message, isWarning = false) {
  const status = document.getElementById("sheetImportStatus");
  if (!status) return;
  status.textContent = message;
  status.hidden = !message;
  status.classList.toggle("negative", isWarning);
}

// Import: read the sheet through the API, check it, show what's about to come over, then save it
async function importSheet(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const link = document.getElementById("sheetImportLink").value.trim();
  if (!link) return sheetImportSay("Paste the spreadsheet's link first.", true);

  const setBusy = (busy) => form.querySelectorAll("input, button").forEach(control => { control.disabled = busy; });
  setBusy(true);
  sheetImportSay("Reading the spreadsheet...");
  const result = await budgetApi("/api/import/sheet", { url: link });
  if (!result.ok || !result.data || !result.data.sheets) {
    setBusy(false);
    return sheetImportSay(result.data?.error || (result.status === 0 ? "Couldn't reach the server. Please try again." : "Couldn't read the spreadsheet. Please try again."), true);
  }
  console.info("Spreadsheet import: each part read from", result.data.from);

  let tables;
  try {
    tables = sheetTables(result.data);
  } catch (err) {
    setBusy(false);
    return sheetImportSay(err.message, true);
  }

  if (!window.confirm(sheetImportSummary(tables))) {
    setBusy(false);
    return sheetImportSay("Nothing was imported.");
  }

  sheetImportSay("Saving your budget...");
  if (!(await saveSheetTables(tables))) {
    setBusy(false);
    return sheetImportSay("Couldn't save all of it. Please check your connection and import again (it replaces what's there, so trying again is safe).", true);
  }
  sheetImportSay("Checking what was saved...");
  const problem = await checkSavedSheet(tables);
  if (problem) {
    setBusy(false);
    return sheetImportSay(`${problem} Please import again (it replaces what's there, so trying again is safe).`, true);
  }
  try { sessionStorage.setItem(SHEET_IMPORT_NOTE, JSON.stringify(tables.note)); } catch (e) {}
  writeUndoHistory({ undo: [], redo: [] }); // Nothing from before the import can be undone
  window.location.reload();
}

// What's about to come over, what's worth knowing about it, and what it replaces
function sheetImportSummary({ note }) {
  const lines = [
    "Ready to import:",
    `- ${note.weeks} weeks of History${note.weeks ? ` (${note.historyFrom} to ${note.historyTo})` : ""}`,
    `- The calendar (${note.calendarFrom} to ${note.calendarTo})`,
    `- ${note.recurring} recurring entries${note.sections ? ` in ${note.sections} sections` : ""}`,
    `- ${note.upcoming} Upcoming`,
    `- ${note.trackerRows} tracker rows`,
    `- ${note.logs} change logs${note.olderLogs ? ` (${note.olderLogs} of them from the Change Logs tab, from before Form Entries started)` : ""}`,
    `- ${note.calculator ? "The paycheck calculator" : "No paycheck calculator numbers"}`
  ];
  if (note.lastUpdate) lines.push(`The spreadsheet's last Daily Update was on ${note.lastUpdate}.`);
  if (note.missingTabs.length) lines.push(`Not in the spreadsheet (left as they are here): ${note.missingTabs.join(", ")}.`);
  if (note.warnings.length) lines.push("", "Good to know:", ...note.warnings.map(warning => `- ${warning}`));
  if (budgetHasEntries()) lines.push("", "This budget already has entries: they'll be replaced.");
  lines.push("", "Import it now?");
  return lines.join("\n");
}

// Anything in this budget already (a new account has none)
function budgetHasEntries() {
  const filled = (rows, from) => rows.slice(from).some(row => row.some(cell => String(cell ?? "").trim() !== ""));
  return filled(historyData, 1) || filled(recurringData, 2) || filled(futureData, 1) ||
    calendarData.some(row => row.some(cell => ownEntryLines(cell).length > 0));
}

/* ---------- The sheet's tabs -> the website's tables ---------- */

// The sheet's emoji the website reads (❗️ ✖️ ⭕️ ✔️ ⛔️ ✴️ ❇️) always end with the invisible "show as emoji"
// character here; a copy without it (✔ instead of ✔️) wouldn't be recognized, so it's added back
const SHEET_EMOJI = new RegExp(`([${String.fromCodePoint(0x2757, 0x2716, 0x2B55, 0x2714, 0x26D4, 0x2734, 0x2747)}])${String.fromCodePoint(0xFE0F)}?`, "g");
const sheetText = (cell) => String(cell ?? "").replace(/\r\n?/g, "\n").replace(SHEET_EMOJI, `$1${String.fromCodePoint(0xFE0F)}`);

// The parts a budget is made of: every one has to be there (hidden is fine). Paycheck Calculator and Savings
// are only brought over (or compared) when the sheet has them.
const SHEET_REQUIRED_TABS = ["Budget", "Recurring", "History", "Tracker", "Future Dates", "Form Entries"];

// What an entry can start with: a type (❗️ Regular, ✖️ Hidden, ⭕️ Transfer), a temp's type and ✔️, or a
// recurring entry's ✔️ and type
const SHEET_SPRITES = new Set(["❗️", "✖️", "⭕️", "❗️✔️", "✖️✔️", "⭕️✔️", "✔️", "✔️✖️", "✔️⭕️"]);
const SHEET_RECURRING_TYPES = { "❗️": "✔️", "✖️": "✔️✖️", "⭕️": "✔️⭕️" };

// answer: the API's { sheets: { part: rows }, from: { part: tab name }, tabs: [every tab's name] }
function sheetTables({ sheets = {}, tabs = [] }) {
  // The business (LLC) version keeps its savings and equity its own way
  if (tabs.some(name => /\bllc\b/i.test(name))) {
    throw new Error("Nothing was imported: this looks like the business (LLC) version of the spreadsheet, which the website can't bring over.");
  }
  const absent = SHEET_REQUIRED_TABS.filter(name => !Array.isArray(sheets[name]));
  if (absent.length > 0) {
    throw new Error(`Nothing was imported: couldn't find ${absent.length === 1 ? "the tab" : "the tabs"} ${absent.map(name => `"${name}"`).join(", ")} in the spreadsheet. Check ${absent.length === 1 ? "it's" : "they're"} still there and named like that, then import again.`);
  }
  const missingTabs = [];
  const tab = (name) => {
    if (Array.isArray(sheets[name])) return sheets[name].map(row => (Array.isArray(row) ? row : []).map(sheetText));
    missingTabs.push(name);
    return null;
  };
  const problems = [];
  const warnings = [];
  const flips = { count: 0 }; // Savings transfers turned the website's way

  // History first: its newest week says which year the calendar's days are in
  const history = sheetHistory(tab("History"), problems, warnings, flips);
  const historyDays = history.slice(1).flat().map(cell => createSafeMidnight(cell.split("\n")[0], true)).filter(date => !isNaN(date.getTime()));
  historyDays.sort((a, b) => a - b);
  const newestHistoryDay = historyDays.at(-1) || null;

  const rawCalendar = findSheetCalendar(tab("Budget"));
  const calendarStart = sheetCalendarStart(rawCalendar, newestHistoryDay);
  const calendar = sheetCalendar(rawCalendar, calendarStart, problems, flips);
  if (newestHistoryDay && newestHistoryDay >= calendarStart) {
    problems.push(`History has ${formatToMMDDYYYY(newestHistoryDay)}, which is on the calendar too (it starts ${formatToMMDDYYYY(calendarStart)})`);
  } else if (newestHistoryDay && getDayDifference(calendarStart, newestHistoryDay) !== 1) {
    warnings.push(`History ends on ${showDate(newestHistoryDay)}, but the calendar starts on ${showDate(calendarStart)}, so the days between aren't anywhere. They come over that way.`);
  }
  if (history.length === 1) {
    warnings.push("History is empty, so In Bank starts at $0.00. Set your starting balance with the Welcome card at the top of Home (or add a Transfer entry titled Starting Balance on today).");
  }

  const recurring = sheetRecurring(tab("Recurring"), problems, flips);
  const tracker = sheetTracker(tab("Tracker"), warnings);
  const future = sheetFuture(tab("Future Dates"), problems, flips);
  // (The Change Logs tab only adds to Change Logs, so a sheet without it isn't missing anything)
  const formAnswers = Array.isArray(sheets["Change Logs"]) ? sheets["Change Logs"].map(row => (Array.isArray(row) ? row : []).map(sheetText)) : null;
  const { logs, older: olderLogs } = sheetLogs(tab("Form Entries"), formAnswers, warnings);
  const calculator = sheetCalculator(tab("Paycheck Calculator"), warnings);
  const savingsTotal = sheetAmount(tab("Savings")?.[1]?.[0]);

  if (problems.length > 0) {
    const shown = problems.slice(0, 6).join("; ");
    throw new Error(`Nothing was imported, because some of the spreadsheet couldn't be read: ${shown}${problems.length > 6 ? `, and ${problems.length - 6} more` : ""}. Fix those in the spreadsheet, then import again.`);
  }
  if (flips.count > 0) {
    warnings.push(`${flips.count} Savings ${flips.count === 1 ? "transfer comes" : "transfers come"} over the website's way: a transfer into savings is negative here (the spreadsheet showed it as positive), so In Bank and Savings come out the same.`);
  }

  // The last day the sheet's daily update ran on, for people (its newest Daily Update in Form Entries)
  const update = logs.slice(1).find(row => row[2].includes("Daily Update"));
  const logged = update && update[0].match(/(\d{1,2}\/\d{1,2}\/\d{2,4})\s*$/);
  const lastUpdate = logged ? sheetDate(logged[1]) : "";

  return {
    calendar, recurring, history, tracker, future, logs, calculator,
    // The day the website's daily update counts from. The sheet's update ran on a day in the calendar's first
    // week (each run starts the calendar on the week of the day it ran), so starting from the first day is
    // never too late: it turns each day before today's recurring entries into temps, and a day the sheet
    // already did that for has nothing left to turn.
    processedDate: formatToMMDDYYYY(calendarStart),
    note: {
      savingsTotal,
      // The sheet's In Bank on each calendar day, to compare once the website has worked it out again
      inBank: rawCalendar.flat().map((cell, i) => ({ date: formatToMMDDYYYY(addDays(calendarStart, i)), amount: readInBank(cell) })).filter(day => day.amount !== null),
      weeks: history.length - 1,
      historyFrom: historyDays.length ? showDate(historyDays[0]) : "none",
      historyTo: historyDays.length ? showDate(historyDays.at(-1)) : "none",
      calendarFrom: showDate(calendarStart),
      calendarTo: showDate(addDays(calendarStart, 27)),
      recurring: recurring.slice(2).filter(row => String(row[0]).trim() !== "-").length,
      sections: recurring.slice(2).filter(row => String(row[0]).trim() === "-").length,
      upcoming: future.length - 1,
      trackerRows: tracker.slice(1).filter(row => String(row[0]).trim() !== "-").length,
      logs: logs.length - 1,
      olderLogs,
      calculator: !!calculator,
      lastUpdate: lastUpdate ? showStoredDate(lastUpdate) : "",
      missingTabs,
      warnings
    }
  };
}

// The row whose first cell is this column title (like "Title"), or fallback when there isn't one (the sheet's
// own code reads its tables by position, so that's where it would be)
function headerRow(rows, title, fallback) {
  const found = rows.findIndex(row => String(row[0] ?? "").trim().toLowerCase() === title);
  return found === -1 ? fallback : found;
}

// Rows padded (or cut) to cols cells, keeping the header rows, without blank rows after them
function sheetTable(rows, cols, headerRows) {
  const table = rows.map(row => padSheetRow(row, cols));
  while (table.length < headerRows) table.push(padSheetRow([], cols));
  return table.filter((row, i) => i < headerRows || row.some(cell => cell.trim() !== ""));
}

// One row as exactly cols cells of text
function padSheetRow(row, cols) {
  return Array.from({ length: cols }, (_, c) => String((row || [])[c] ?? ""));
}

// An amount as the sheet can show it ("-$1,200.00", "$274", "$-29.98", "($150.00)", "12.5") as a number, or
// null when it isn't one
function sheetAmount(text) {
  const trimmed = String(text ?? "").trim();
  if (!/\d/.test(trimmed) || !/^\(?[-+]?\$?[-+]?(?:\d{1,3}(?:,\d{3})+|\d+)?(?:\.\d+)?\)?$/.test(trimmed)) return null;
  const amount = parseAmount(trimmed);
  return /^\(.*\)$/.test(trimmed) ? -Math.abs(amount) : amount;
}

// "1/4/2026" (or "1/4/26") -> "01/04/2026"; "" when it isn't a real day
function sheetDate(text) {
  const match = String(text ?? "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!match) return "";
  const [month, day] = [Number(match[1]), Number(match[2])];
  const year = Number(match[3]) + (match[3].length === 2 ? 2000 : 0);
  const date = new Date(year, month - 1, day);
  if (date.getMonth() !== month - 1 || date.getDate() !== day) return "";
  return formatToMMDDYYYY(date);
}

// A Transfer titled Savings (the sheet's savings account): stored from the other side here (see the top)
function isSheetSavingsTransfer(sprite, title) {
  return getSpecialType(sprite) === "⭕️" && cleanString(title) === "savings";
}

// The sheet's Hidden and Transfer entries titled Savings are for its savings account, so here they're for the
// Savings account: "→ Savings" (only an entry with an Other Account picked changes one, see linkedAccount)
function sheetTitle(sprite, title) {
  const special = getSpecialType(sprite);
  return (special === "✖️" || special === "⭕️") && cleanString(title) === "savings" ? withAccount("", title) : title;
}

// One line of a day's cell, the website's way: kind "entry" ("❗️ -$5.00 Coffee"), "system" (a line the budget
// writes itself: In Bank, Gains, Costs, the last day's extra lines, all worked out again once it loads), or "odd"
// (anything else, kept as it is)
function sheetLine(line, flips) {
  const parts = getParts(line);
  if (systemEmojis.includes(parts[0])) return { text: line, kind: "system" };
  const amount = sheetAmount(parts[1]);
  if (!SHEET_SPRITES.has(parts[0]) || parts.length < 3 || amount === null) return { text: line, kind: "odd" };
  const title = parts.slice(2).join(" ");
  const flip = isSheetSavingsTransfer(parts[0], title);
  if (flip) flips.count++;
  return { text: `${parts[0]} ${formatMoney(flip ? -amount : amount)} ${sheetTitle(parts[0], title)}`, kind: "entry" };
}

// A day's cell: header first (the website's way), then its lines without stray spaces or blank lines.
// Lines that aren't entries go in odd, for the caller.
function sheetDay(cell, header, flips, odd) {
  const lines = String(cell ?? "").split("\n").map(line => line.trim()).filter(Boolean).slice(1);
  return [header, ...lines.map(line => {
    const read = sheetLine(line, flips);
    if (read.kind === "odd") odd.push(line);
    return read.text;
  })].join("\n");
}

// The calendar: four rows with a day in each of the first seven cells ("10/04\n✅ $318.63 In Bank\n..."): the
// first four rows of C Budget, or rows 4-7 of its display copy (Budget)
function findSheetCalendar(budget) {
  const dayCell = (cell) => /^\d{1,2}\/\d{1,2}(\n|$)/.test(String(cell ?? "").trim());
  const at = budget.findIndex((row, r) => r + 4 <= budget.length && budget.slice(r, r + 4).every(week => week.length >= 7 && week.slice(0, 7).every(dayCell)));
  if (at === -1) throw new Error("Nothing was imported: couldn't find the calendar on the Budget tab (four rows with a day in each of the first seven cells). Has the spreadsheet been set up?");
  return budget.slice(at, at + 4).map(row => row.slice(0, 7).map(cell => String(cell).trim()));
}

// The calendar's first day. Its cells only say the month and day: the year is the one that makes it the day
// after History's newest one, or else the year that makes it a Sunday nearest today.
function sheetCalendarStart(calendar, newestHistoryDay) {
  const [month, day] = calendar[0][0].split("\n")[0].split("/").map(Number);
  if (newestHistoryDay) {
    const next = addDays(newestHistoryDay, 1);
    if (next.getMonth() + 1 === month && next.getDate() === day) return next;
  }
  const candidates = [-1, 0, 1].map(offset => new Date(today.getFullYear() + offset, month - 1, day))
    .filter(date => date.getMonth() === month - 1 && date.getDate() === day)
    .sort((a, b) => (a.getDay() === 0 ? 0 : 1) - (b.getDay() === 0 ? 0 : 1) || Math.abs(a - today) - Math.abs(b - today));
  if (candidates.length === 0) throw new Error(`Nothing was imported: the Budget tab's calendar starts on ${month}/${day}, which isn't a real day.`);
  return candidates[0];
}

// Every calendar day, in order from start, with only entries on it: a line the website can't read would be
// dropped the first time the budget is worked out again (the sheet's own code drops one too), so it's listed
function sheetCalendar(rawCalendar, start, problems, flips) {
  if (start.getDay() !== 0) problems.push(`the Budget tab's calendar starts on ${formatToMMDD(start)}, which isn't a Sunday`);
  return rawCalendar.map((week, r) => week.map((cell, c) => {
    const expected = addDays(start, r * 7 + c);
    const [month, day] = cell.split("\n")[0].split("/").map(Number);
    if (expected.getMonth() + 1 !== month || expected.getDate() !== day) {
      problems.push(`the Budget tab's calendar: ${cell.split("\n")[0]} should be ${formatToMMDD(expected)}`);
    }
    const odd = [];
    const text = sheetDay(cell, formatToMMDD(expected), flips, odd);
    odd.forEach(line => problems.push(`the Budget tab's calendar, ${formatToMMDD(expected)}: "${line}" isn't an entry (like "❗️ -$5.00 Coffee")`));
    return text;
  }));
}

// History: the column titles, then one row per week, newest first. Each day's date and its In Bank line come
// over as the sheet has them (the newest Saturday's In Bank is where the calendar's In Bank starts from).
// A line that isn't an entry comes over as it is (the sheet counted it the same way the website does).
function sheetHistory(rows, problems, warnings, flips) {
  const table = sheetTable(rows.slice(headerRow(rows, "sunday", 0)), 7, 1);
  const seen = new Set();
  const odd = [];
  const history = table.map((week, r) => {
    if (r === 0) return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    return week.map(cell => {
      const header = cell.split("\n")[0].trim();
      if (!header) return "";
      const date = sheetDate(header);
      if (!date) {
        problems.push(`History: "${header}" isn't a date`);
        return cell;
      }
      if (seen.has(date)) problems.push(`History has ${date} twice`);
      seen.add(date);
      return sheetDay(cell, date, flips, odd);
    });
  });
  if (odd.length > 0) {
    warnings.push(`${odd.length} ${odd.length === 1 ? "line" : "lines"} in History ${odd.length === 1 ? "isn't" : "aren't"} the usual "❗️ -$5.00 Coffee" kind, and ${odd.length === 1 ? "comes" : "come"} over as ${odd.length === 1 ? "it is" : "they are"}: ${odd.slice(0, 3).map(line => `"${line}"`).join(", ")}${odd.length > 3 ? ", ..." : ""}.`);
  }
  if (history.length > 1 && readInBank(history[1][6]) === null) {
    problems.push(`History's newest Saturday${history[1][6] ? ` (${history[1][6].split("\n")[0]})` : ""} has no In Bank line, which the calendar's In Bank starts from`);
  }
  // Weeks that don't follow each other (the website reads them by date, so they still work)
  const gaps = [];
  for (let r = 1; r < history.length; r++) {
    const days = history[r].map(cell => createSafeMidnight(cell.split("\n")[0], true));
    const broken = days.some((date, c) => isNaN(date.getTime()) || date.getDay() !== c || (c > 0 && getDayDifference(date, days[c - 1]) !== 1));
    const next = history[r + 1] && createSafeMidnight(history[r + 1][6].split("\n")[0], true);
    if (broken) gaps.push(`the week of ${history[r][0].split("\n")[0] || history[r].find(Boolean)?.split("\n")[0] || "?"} isn't a whole Sunday-Saturday week`);
    else if (next && !isNaN(next.getTime()) && getDayDifference(days[0], next) !== 1) gaps.push(`it skips from ${formatToMMDDYYYY(next)} to ${formatToMMDDYYYY(days[0])}`);
  }
  if (gaps.length > 0) warnings.push(`History ${gaps.slice(0, 3).join("; ")}${gaps.length > 3 ? `, and ${gaps.length - 3} more` : ""}. It comes over that way.`);
  return history;
}

// Recurring: the summary row (worked out again here), the column titles, then the entries and "-" section rows
function sheetRecurring(rows, problems, flips) {
  const titlesAt = headerRow(rows, "title", 1);
  return [
    padSheetRow(titlesAt > 0 ? rows[titlesAt - 1] : [], 6),
    padSheetRow(rows[titlesAt], 6),
    ...sheetTable(rows.slice(titlesAt + 1), 6, 0).map(row => (row[0].trim() === "-" ? ["-", row[1].trim(), "", "", "", "-"] : sheetRecurringRow(row, problems, flips)))
  ];
}

// One recurring entry the website's way. Anything that can't be read goes in problems instead of being
// guessed at (a frequency it doesn't know would land monthly, and a start date it can't read would be today).
function sheetRecurringRow(row, problems, flips) {
  const title = row[0].trim();
  const name = `Recurring "${title || "(no title)"}"`;
  if (!title) problems.push(`${name}: it has no title`);
  const amount = sheetAmount(row[1]);
  if (amount === null) problems.push(`${name}: "${row[1]}" isn't an amount`);
  const start = sheetDate(row[2]);
  if (!start) problems.push(`${name}: the start date "${row[2]}" isn't a date`);
  const endText = row[4].trim();
  const end = /^(none)?$/i.test(endText) ? "None" : sheetDate(endText);
  if (!end) problems.push(`${name}: the end date "${endText}" isn't a date (or None)`);
  const frequency = parseFrequency(row[3]);
  if (!frequency) problems.push(`${name}: the frequency "${row[3]}" isn't one the website knows (like Weekly, Biweekly, Semi-Monthly, Monthly, 3 Month, 6 Month, or Yearly)`);
  const type = row[5].trim();
  if (!type.includes("✔️")) problems.push(`${name}: the type "${type}" isn't a recurring type (✔️, ✔️✖️, or ✔️⭕️)`);
  const sprite = SHEET_RECURRING_TYPES[getSpecialType(type)];
  const flip = isSheetSavingsTransfer(sprite, title);
  if (flip) flips.count++;
  return [sheetTitle(sprite, title), amount === null ? row[1].trim() : formatMoney(flip ? -amount : amount), start, frequency ? formatFrequency(frequency) : row[3].trim(), end || endText, sprite];
}

// Tracker: the column titles, then its rows and "-" sections. Its sums (and what Undefined lists) are worked out
// again here. This site's Transfers row counts every transfer by itself, so a row of the sheet's own called
// Transfers keeps its aliases under another name.
function sheetTracker(rows, warnings) {
  return sheetTable(rows.slice(headerRow(rows, "type", 0)), 5, 1).map((row, i) => {
    if (i === 0) return row;
    const cells = row.map(cell => cell.trim());
    if (cells[0] === "-") return ["-", cells[1], "", "", "-"];
    if (cleanString(cells[0]) === "transfers") {
      const renamed = cells[0].replace(/transfers/i, "My Transfers");
      warnings.push(`Your tracker row "${cells[0]}" comes over as "${renamed}", since the website's own Transfers row counts every transfer.`);
      cells[0] = renamed;
    }
    return cells;
  });
}

// Future Dates (Upcoming): [title, amount, MM/DD/YYYY, type]. A row without a title is left out (the sheet
// never lands one either).
function sheetFuture(rows, problems, flips) {
  return sheetTable(rows.slice(headerRow(rows, "title", 0)), 4, 1).flatMap((row, i) => {
    if (i === 0) return [row];
    const title = row[0].trim();
    if (!title) return [];
    const date = sheetDate(row[2]);
    if (!date) problems.push(`Future Dates "${title}": "${row[2]}" isn't a date`);
    const amount = sheetAmount(row[1]);
    if (amount === null) problems.push(`Future Dates "${title}": "${row[1]}" isn't an amount`);
    // The type, with a temp's ✔️ second (a blank one is Regular, like the sheet's)
    const typed = row[3].trim();
    const sprite = getSpecialType(typed) + (typed.includes("✔️") ? "✔️" : "");
    const flip = isSheetSavingsTransfer(sprite, title);
    if (flip) flips.count++;
    return [[sheetTitle(sprite, title), amount === null ? row[1].trim() : formatMoney(flip ? -amount : amount), date, sprite]];
  });
}

// Change Logs: Form Entries' rows, newest first (its old column titles at the bottom are left out), then the
// form's answers from before Form Entries was added to the sheet (sheetFormAnswers). The import's own row goes
// on top, so one less fits. A Search's terms come over in words, the way this site says them.
function sheetLogs(rows, formAnswers, warnings) {
  const start = headerRow(rows, "time", 0);
  const entries = rows.slice(start + 1)
    .filter(row => row.some(cell => cell.trim() !== "") && row[0].trim() !== "Date & Time Submitted")
    .map(row => {
      const cells = padSheetRow(row, 7).slice(0, 7);
      if (cells[2].includes("Search")) {
        for (let c = 3; c < 7; c++) cells[c] = cells[c].replace(/^Aliases:\s*(.*)$/s, (_, terms) => `For: ${sheetSearchWords(terms)}`);
      }
      return [...cells, ""];
    });
  const times = entries.map(row => sheetLogTime(row[0])).filter(Boolean);
  const firstLogged = times.length ? new Date(Math.min(...times)) : null;
  const older = sheetFormAnswers(formAnswers, firstLogged, warnings);
  return { logs: [padSheetRow(rows[start], 8), ...[...entries, ...older].slice(0, MAX_LOG_ROWS - 1)], older: older.length };
}

// The form's answers (the Change Logs tab, which the sheet's setup names) that Form Entries doesn't have:
// Form Entries was added to the sheet later, so the earliest changes are only here. Each answer from before
// Form Entries' first row (a couple of minutes' leeway, since a row's time is when it was worked on) becomes a
// Change Logs row, newest first: its time, what was asked for, and each answer ("Amount: 28.53"). They can't
// say how long they took or how they turned out, since the sheet didn't keep that.
function sheetFormAnswers(rows, firstLogged, warnings) {
  if (!rows || rows.length < 2) return [];
  const headers = rows[0].map(cell => cell.trim());
  const timeAt = headers.findIndex(title => title.toLowerCase() === "timestamp");
  if (timeAt === -1) return [];
  const askedAt = headers.findIndex(title => /^not creating\/changing a unique entry/i.test(title));
  const until = firstLogged ? firstLogged.getTime() - 2 * 60000 : Infinity;
  const answers = [];
  let unreadable = 0;
  for (const row of rows.slice(1)) {
    if (!row.some(cell => cell.trim() !== "")) continue;
    const when = sheetLogTime(row[timeAt]);
    if (!when) {
      unreadable++;
      continue;
    }
    if (when >= until) continue;
    const details = [];
    row.forEach((cell, c) => {
      const answer = cell.trim();
      if (answer && c !== timeAt && c !== askedAt && headers[c]) details.push(`${headers[c].replace(/[\s?:]+$/, "")}: ${sheetAnswerWords(headers[c], answer)}`);
    });
    const shown = [...details.slice(0, 3), details.slice(3).join("; ")];
    while (shown.length < 4) shown.push("");
    const date = new Date(when);
    const action = (askedAt !== -1 && row[askedAt]?.trim()) || "❗️Create/Change A Unique Entry";
    answers.push({ when, row: [`${date.getHours()}:${String(date.getMinutes()).padStart(2, "0")} ${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`, "", action, ...shown, ""] });
  }
  if (unreadable > 0) warnings.push(`${unreadable} ${unreadable === 1 ? "answer" : "answers"} in the Change Logs tab ${unreadable === 1 ? "has" : "have"} no time that can be read, so ${unreadable === 1 ? "it's" : "they're"} left out of Change Logs.`);
  return answers.sort((a, b) => b.when - a.when).map(answer => answer.row);
}

// A log's time as the sheet writes it ("10:32 9/13/2026" in Form Entries, "9/12/2026 6:30:50" in the Change
// Logs tab), in milliseconds, or null
function sheetLogTime(text) {
  const value = String(text ?? "").trim();
  let match = value.match(/^(\d{1,2}):(\d{2})\s+(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) return new Date(+match[5], match[3] - 1, +match[4], +match[1], +match[2]).getTime();
  match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (match) return new Date(+match[3], match[1] - 1, +match[2], +match[4], +match[5], +(match[6] || 0)).getTime();
  return null;
}

// An answer in the sheet's form, said the way this site says it: a search's terms and a tracker row's aliases
// are typed the spreadsheet's way ("rent-, food="), and come over in words
function sheetAnswerWords(header, answer) {
  if (/^aliases$/i.test(header)) return sheetSearchWords(answer);
  if (/aliases|^add this|^remove these/i.test(header)) return describeAliases(answer) || answer;
  return answer;
}

// A search's terms the spreadsheet's way ("rent-, paycheck+, food=") in this site's words: "rent (costs only),
// paycheck (gains only), the food tracker row" (see searchTargets)
function sheetSearchWords(text) {
  const terms = String(text ?? "").split(",").map(term => term.replace(/\s+/g, " ").trim()).filter(Boolean);
  if (terms.length === 0 || (terms.length === 1 && /^all$/i.test(terms[0]))) return "everything";
  return terms.map(term => {
    const ending = /[-+=]$/.test(term) ? term.slice(-1) : "";
    const title = ending ? term.slice(0, -1).trim() : term;
    if (!title) return { "-": "every cost", "+": "every gain" }[ending] || "everything";
    if (ending === "=") return `the ${title} tracker row`;
    return title + (ending === "-" ? " (costs only)" : ending === "+" ? " (gains only)" : "");
  }).join(", ");
}

// The paycheck calculator, when it has numbers in it, written the website's way: rows 1-3 the last results,
// 5-21 the inputs (the sheet's rows are the same; its labels are checked, so a moved row can't land in the
// wrong box)
function sheetCalculator(rows, warnings) {
  if (!rows || !rows.slice(0, 21).some(row => parseAmount(row?.[1]) !== 0)) return null;
  const fields = [...CALCULATOR_RESULTS, ...CALCULATOR_INPUTS];
  const moved = fields.find(field => cleanString(rows[field.row]?.[0]) !== cleanString(field.label));
  if (moved) {
    warnings.push(`The Paycheck Calculator's rows aren't where they should be (row ${moved.row + 1} isn't ${moved.label}), so its numbers are left out. Fill it in on the Paycheck Calculator page.`);
    return null;
  }
  const calculator = Array.from({ length: TABLE_SHAPES.calculator.minRows }, (_, r) => padSheetRow(rows[r], 2));
  for (const field of fields) {
    const value = String(rows[field.row][1] ?? "").trim();
    const isResult = CALCULATOR_RESULTS.includes(field);
    calculator[field.row] = [field.label, value === "" ? "" : (isResult ? formatMoney(parseAmount(value)) : String(parseAmount(value)))];
  }
  return calculator;
}

/* ---------- Saving, and checking what was saved ---------- */

// Every table the sheet had, in line with any other change, then the day the daily update counts from
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

    if (!(await saveChanges()) || logsEdited) return false; // (Change Logs count here: they're part of the sheet)
    return saveProcessedDate(tables.processedDate);
  });
  budgetQueue = run.catch(() => false);
  return run.catch(() => false);
}

// Reads the budget back from the server and compares each table with what was sent. "" when it all matches.
async function checkSavedSheet(tables) {
  const saved = await budgetApi("/api/data/load");
  if (!saved.ok || !saved.data) return "Couldn't read the budget back to check it.";
  const expected = { calendar: calendarData, recurring: recurringData, history: historyData, tracker: trackerData, future: futureData, logs: logsData, calculator: calculatorData };
  for (const name of SHEET_TABLES) {
    let stored = null;
    try { stored = JSON.parse(saved.data[name]?.[0]?.content ?? "null"); } catch (e) {}
    if (JSON.stringify(stored) !== JSON.stringify(expected[name])) return `The ${name === "future" ? "Upcoming" : name} table didn't save the way it was sent.`;
  }
  if (saved.data.last_processed_date !== tables.processedDate) return "The day the spreadsheet's calendar starts on didn't save.";
  return "";
}

/* ---------- After the reload: what came over, and what's different ---------- */

function reportSheetImport() {
  let note = null;
  try {
    note = JSON.parse(sessionStorage.getItem(SHEET_IMPORT_NOTE) || "null");
    sessionStorage.removeItem(SHEET_IMPORT_NOTE);
  } catch (e) {}
  if (!note) return;

  const messages = [`Imported: ${note.weeks} weeks of History, ${note.recurring} recurring entries, ${note.upcoming} Upcoming, ${note.trackerRows} tracker rows, and ${note.logs} change logs.`];
  if (note.missingTabs?.length) messages.push(`The spreadsheet had no ${note.missingTabs.join(", ")} tab, so ${note.missingTabs.length === 1 ? "that was" : "those were"} left as ${note.missingTabs.length === 1 ? "it was" : "they were"}.`);
  if (note.warnings?.length) messages.push(...note.warnings);

  // In Bank on the latest day that was on the sheet's calendar and is still on this one (up to today). The
  // website never counts ✖️ Hidden entries in In Bank; the sheet counted Hidden costs back in, so days after
  // History's last week can differ.
  const compared = (note.inBank || [])
    .map(day => ({ ...day, date: createSafeMidnight(day.date, true) }))
    .filter(day => !isNaN(day.date.getTime()) && day.date <= today && calendarSpot(day.date))
    .at(-1);
  if (compared) {
    const spot = calendarSpot(compared.date);
    const here = readInBank(calendarData[spot.r][spot.c]);
    if (here !== null && Math.abs(here - compared.amount) >= 0.005) {
      messages.push(`In Bank on ${showDay(compared.date)} was ${formatMoney(compared.amount)} in the spreadsheet and is ${formatMoney(here)} here, since ✖️ Hidden entries never change In Bank here (the spreadsheet added Hidden costs back in). Compare it with your bank, and add a Catchup entry if they don't match.`);
    }
  }

  const savings = accountSummaries().find(summary => isDefaultAccount(accountsData.list[summary.index]));
  if (savings && typeof note.savingsTotal === "number" && Math.abs(savings.today - note.savingsTotal) >= 0.005) {
    messages.push(`The spreadsheet's Savings tab said ${formatMoney(note.savingsTotal)}, and ${savings.name} here is ${formatMoney(savings.today)} (it adds up Hidden and Transfer entries for it). To match, tap ${savings.name} on the Other Accounts page and type in its balance.`);
  }

  sheetImportSay(messages.join(" "));
  BudgetUI.showToast("Your spreadsheet is imported. The details are at the bottom of the page.");
}
