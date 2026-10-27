// Budget Pages: the menu data pages (Recurring, History, Other Accounts, Tracker, Paycheck Calculator,
// Change Logs). Recurring and Tracker: New Entry, tap a row to change it, and an Edit mode with section
// buttons between rows, delete checkboxes, and a move bar to drag rows. Other Accounts: tap an account
// to change it, and an Edit mode to add, delete, and drag accounts. Tracker and Change Logs: a Search that
// looks through their own rows (History's Search is Home's, in Budget Search.js).
// Every change goes through Process Budget.js (runBudgetAction), which saves and then fires
// "budget:updated" so the page re-renders.

// =====================================================================
// #region SETUP
// =====================================================================

// Which renderer each page uses (pages without a layout yet just load/save data)
const PAGE_RENDERERS = {
  recurring: renderRecurringPage,
  history: renderHistoryPage,
  tracker: renderTrackerPage,
  logs: renderLogsPage,
  calculator: renderCalculatorPage,
  accounts: renderAccountsPage
};

let editMode = false;          // Recurring/Tracker edit mode
let selectedRows = new Set();  // Row indexes checked for deletion in edit mode

window.workspaceReady.then((loaded) => {
  const status = document.getElementById("dataStatus");
  if (!loaded) {
    if (status) status.textContent = "Couldn't load your budget data. Please refresh to try again.";
    return;
  }
  if (status) status.hidden = true;
  renderCurrentPage();
});

document.addEventListener("budget:updated", () => {
  if (workspaceLoaded) renderCurrentPage();
});

// Draw this page from the budget (and its open Search results)
function renderCurrentPage() {
  const render = PAGE_RENDERERS[window.PAGE];
  const view = document.getElementById("dataView");
  if (render && view) render(view);
  if (pageSearch && pageSearch.isOpen) renderPageSearch(); // Open results follow the change
}

//#endregion

// =====================================================================
// #region PAGE RENDERERS
// =====================================================================

// Recurring tab: [0] summary row, [1] column titles, then
// [title, amount, start MM/DD/YYYY, frequency ("Every 2 Weeks"), end date or "None", type emoji]
// Separator rows: ["-", category title, "", "", "", "-"]
function renderRecurringPage(view) {
  renderToolbar("recurring", (origin) => openRecurringPanel(origin, null));
  view.replaceChildren();

  // Monthly and Yearly, under the card's title (each stays on one line, so a minus sign isn't left behind)
  const summary = recurringData[0] || [];
  const monthly = String(summary[2] || "").trim();
  const yearly = String(summary[5] || "").trim();
  const subtitle = document.getElementById("pageSubtitle");
  if (subtitle) {
    const parts = [monthly ? "Monthly: " + monthly : "", yearly ? "Yearly: " + yearly : ""].filter(Boolean).map((text) => {
      const part = document.createElement("span");
      part.className = "keepTogether";
      part.textContent = text;
      return part;
    });
    subtitle.replaceChildren(...parts.flatMap((part, i) => (i ? [" • ", part] : [part])));
    subtitle.hidden = !monthly && !yearly;
  }

  const rows = indexedRows(recurringData, 2);
  if (rows.length === 0 && !editMode) {
    view.appendChild(emptyMessage("No recurring entries yet. Tap New Entry to add one."));
    return;
  }
  const duplicates = recurringDuplicates();
  if (duplicates.length > 0) view.appendChild(recurringProblems(duplicates));

  // The whole table fits the screen: the title column gets the room that's left (a long title is cut short; tapping it
  // shows it whole), and dates and frequencies can take two lines
  const tableEl = buildRowTable({
    tableName: "recurring",
    columns: ["Type", { label: "Title", className: "titleHead" }, "Amount", "Start Date", "Frequency", "End Date"],
    rows,
    extraClass: "recurringTable",
    renderEntry(tr, row) {
      // (A placeholder's row is yellow, its type without the ⏳ it's stored with. A % entry shows its percent: each day
      // it lands works out its own amount. A title with a note of its own is underlined.)
      if (isPlaceholder(row[5])) tr.classList.add("isPlaceholder");
      tr.appendChild(cell(baseSprite(row[5]), "typeCell"));
      const titleCell = clippedCell(row[0], "titleCell");
      if (recurringNote(row[0], row[5])) titleCell.firstChild.classList.add("hasNote");
      tr.appendChild(noTranslate(titleCell));
      const percent = percentOf(row[5]);
      tr.appendChild(noTranslate(cell(percent !== null ? `${percent < 0 ? "-" : ""}${showPercent(percent)}` : row[1], "amountCell")));
      tr.appendChild(noTranslate(dateCell(row[2])));
      tr.appendChild(cell(describeFrequency(row[3]), "frequencyCell"));
      tr.appendChild(noTranslate(dateCell(row[4])));
    },
    onEntryClick: (index, origin) => openRecurringPanel(origin, index)
  });
  view.appendChild(wrapScroll(tableEl));
  markClipped(tableEl);
}

// "Needs a look" over the table: recurring entries that match another one in title, Other Account, and refraction type,
// which can't be made here (see recurringDuplicates in Process Budget.js)
function recurringProblems(duplicates) {
  const box = BudgetUI.element("div", "recurringProblems");
  box.setAttribute("role", "status");
  const list = BudgetUI.element("ul");
  for (const name of duplicates) list.append(noTranslate(BudgetUI.element("li", "", name)));
  box.append(
    BudgetUI.element("strong", "", "Needs a look"),
    BudgetUI.element("p", "panelText", `${RECURRING_RULE}, but ${duplicates.length === 1 ? "this one is" : "these are"} here more than once. Give one of each another title, refraction type, or Other Account, or delete one. Until then, on a day they both land on, only the first one in the list does.`),
    list
  );
  return box;
}

// History tab: [0] column titles, then one row per week (Sunday-Saturday), newest first.
// Each cell is "MM/DD/YYYY\n✅ $X In Bank\nentries..."
// Each day shows just its date, big, until it's tapped: then it zooms in with its In Bank and entries, the same
// way (and with the same gestures) as Home's days (Process Budget.js LAYOUT FUNCTIONS), and its entries can be changed
// like Home's, without changing any balances.
function renderHistoryPage(view) {
  // A zoomed day is zoomed again once the days are drawn again (after a change), in the same spot on the page
  const zoomedDate = view.querySelector("td.is-editing:not(.isZoomClosing)")?.dataset.date;
  const anchor = zoomAnchor;
  if (zoomedDate) closeZoomedDay(true);
  view.replaceChildren();
  const weeks = historyData.slice(1);
  if (weeks.length === 0) {
    view.appendChild(emptyMessage("No history yet. Weeks move here as they pass."));
    return;
  }

  const tableEl = document.createElement("table");
  tableEl.className = "elastic-table historyGrid";
  const head = tableEl.createTHead().insertRow();
  for (const day of ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]) head.appendChild(BudgetUI.element("th", "", day));
  const body = tableEl.createTBody();
  for (const week of weeks) {
    const tr = body.insertRow();
    for (let c = 0; c < 7; c++) tr.appendChild(historyDay(week[c]));
  }

  // While a Search date box is waiting (the table has a dashed outline), tapping a day fills it in instead of zooming it
  tableEl.addEventListener("click", (event) => {
    if (!BudgetUI.datePickActive()) return;
    const td = event.target.closest("td");
    const date = td && td.dataset.date && createSafeMidnight(td.dataset.date, true);
    if (!date || isNaN(date.getTime())) return;
    event.stopPropagation();
    event.preventDefault();
    BudgetUI.pickDate(date, td);
  }, true);
  // Tapping an entry on a zoomed day opens its options, like on Home (not while the day shrinks back: a tap then zooms it
  // in again). Changing a day in History keeps the balances (changeHistoryEntry).
  tableEl.addEventListener("click", (event) => {
    const lineEl = event.target.closest(".lineEntry");
    const td = lineEl && lineEl.closest("td");
    if (!td || !td.classList.contains("is-editing") || td.classList.contains("isZoomClosing")) return;
    const date = createSafeMidnight(td.dataset.date, true);
    const spot = isNaN(date.getTime()) ? null : historySpot(date);
    const line = spot && String(historyData[spot.r][spot.c]).split("\n")[Number(lineEl.dataset.line)];
    if (line) BudgetUI.openEntryOptions(lineEl, line, date, { lineIndex: Number(lineEl.dataset.line), inHistory: true });
  });
  view.appendChild(tableEl);
  wireElasticTable(tableEl);
  const zoomed = zoomedDate && [...tableEl.querySelectorAll("td")].find(td => td.dataset.date === zoomedDate);
  if (zoomed) {
    zoomAnchor = anchor;
    zoomDay(zoomed, false);
  }
}

// One day of History: its date, big (with its year under it), and the day as it was (its full date, In Bank, and
// entries), which shows once it's zoomed. A day the budget didn't have yet stays empty.
function historyDay(cellText) {
  const td = document.createElement("td");
  const content = BudgetUI.element("div", "cell-content");
  td.appendChild(content);
  const lines = String(cellText ?? "").split("\n");
  const stored = lines[0].trim();
  const date = createSafeMidnight(stored, true);
  if (!stored || isNaN(date.getTime())) return td;

  td.dataset.date = stored;
  const day = noTranslate(BudgetUI.element("div", "historyDate", showDay(date)));
  day.appendChild(BudgetUI.element("span", "historyYear", String(date.getFullYear())));
  content.appendChild(day);
  lines.forEach((line, l) => {
    if (l === 0 || line.trim()) content.appendChild(BudgetUI.renderEntryLine(l === 0 ? showDate(date) : line, l, date));
  });
  content.appendChild(zoomDayButtons());
  td.classList.toggle("isNegative", (readInBank(cellText) ?? 0) < 0);
  return td;
}

// Tracker tab: [0] column titles, then
// [title, last 4 weeks, last 3 months, last year, aliases ("rent-, paycheck+, atm", see parseAlias)]
// Separator rows: ["-", category title, "", "", "-"]
// Titles starting with ⭕️ also count Transfers
function renderTrackerPage(view) {
  renderToolbar("tracker", (origin) => openTrackerPanel(origin, null), { search: true });
  view.replaceChildren();

  const rows = indexedRows(trackerData, 1);
  if (rows.length === 0 && !editMode) {
    view.appendChild(emptyMessage("No tracker rows yet. Tap New Entry to add one."));
    return;
  }

  const tableEl = buildRowTable({
    tableName: "tracker",
    columns: TRACKER_COLUMNS,
    rows,
    extraClass: "trackerTable",
    canSelect: (row) => !TRACKER_AUTO_ROWS.includes(cleanString(row[0])),
    lockedNote: (row) => `${String(row[0]).trim()} fills in by itself, so it can't be deleted.`,
    renderEntry: trackerCells,
    onEntryClick: (index, origin) => openTrackerPanel(origin, index)
  });
  view.appendChild(wrapScroll(tableEl));
  markClipped(tableEl);
}

// The tracker's columns (on the narrowest phones, Edit leaves out the aliases: budgetStyle.css .aliasHead)
const TRACKER_COLUMNS = ["Type", "Last 4 Weeks", "Last 3 Months", "Last 365 Days", { label: "Aliases", className: "aliasHead" }];

// A tracker row's cells (the page's table, and its Search results)
function trackerCells(tr, row) {
  // Costs, Gains, and Undefined are the budget's own words (they translate); other rows are the person's
  const isAuto = TRACKER_AUTO_ROWS.includes(cleanString(row[0]));
  tr.appendChild(isAuto ? cell(row[0], "titleCell") : noTranslate(cell(row[0], "titleCell")));
  tr.appendChild(noTranslate(cell(row[1], "amountCell")));
  tr.appendChild(noTranslate(cell(row[2], "amountCell")));
  tr.appendChild(noTranslate(cell(row[3], "amountCell")));
  const aliases = cell("", "aliasCell");
  aliases.appendChild(aliasBox(trackerAliasText(row)));
  // (Undefined and Transfers list entry titles, which are the person's words)
  tr.appendChild(isAuto && !["undefined", "transfers"].includes(cleanString(row[0])) ? aliases : noTranslate(aliases));
}

// A row's aliases scroll in a short box, so a long list doesn't make its row tall. Tapping a box with more in it than
// shows opens it all the way (no scrolling), and tapping it again closes it; tapping one that shows everything opens
// the row, like the rest of it (in Edit, a tap always checks the row instead). Change Logs' details use it too.
function aliasBox(text, className = "") {
  const box = BudgetUI.element("div", `aliasBox ${className}`.trim(), text);
  box.addEventListener("click", (event) => {
    const open = box.classList.contains("isOpen");
    if (editMode || (!open && box.scrollHeight <= box.clientHeight + 1)) return;
    event.stopPropagation();
    box.classList.toggle("isOpen", !open);
    box.scrollTop = 0;
    markClipped(box.closest("table"));
  });
  return box;
}

// A cell whose text stays on one line, cut short with "..." when its column is too narrow for it (Recurring Entries'
// titles, Change Logs' actions). Tapping one that's cut short shows it whole, and tapping it again cuts it short again;
// tapping one that shows everything opens its row, like the rest of it (in Edit, a tap checks the row instead). The
// same as an alias box, sideways.
function clippedCell(text, className) {
  const td = cell("", className);
  const box = BudgetUI.element("div", "clipText", text ?? "");
  box.addEventListener("click", (event) => {
    const open = box.classList.contains("isOpen");
    if (editMode || (!open && !textCutShort(box))) return;
    event.stopPropagation();
    box.classList.toggle("isOpen", !open);
    markClipped(box.closest("table"));
  });
  td.appendChild(box);
  return td;
}

// Is a cut-short cell's text cut short? (on its one line, or, where it gets two, Recurring Entries' titles, after its second)
function textCutShort(box) {
  return box.scrollWidth > box.clientWidth + 1 || box.scrollHeight > box.clientHeight + 1;
}

// A stored date in a cell, as people read it, which can break onto two lines after its day and month ("10/05/" over
// "2026", or "2026-" over "10-05") when the table needs the room
function dateCell(stored) {
  const td = cell("", "dateCell");
  const text = showStoredDate(stored);
  const parts = text.match(/^(\d{1,2}[\/.]\d{1,2}[\/.])(\d{4})$/) || text.match(/^(\d{4}-)(\d{1,2}-\d{1,2})$/);
  if (parts) td.append(parts[1], document.createElement("wbr"), parts[2]);
  else td.textContent = text;
  return td;
}

// Alias boxes with more in them than they show get a fade at the bottom, and cut-short cells their "...", so it's clear
// there's more (and a tap shows it)
function markClipped(table) {
  if (!table) return;
  requestAnimationFrame(() => {
    for (const box of table.querySelectorAll(".aliasBox")) {
      box.classList.toggle("isClipped", !box.classList.contains("isOpen") && box.scrollHeight > box.clientHeight + 1);
    }
    for (const box of table.querySelectorAll(".clipText")) {
      box.classList.toggle("isClipped", !box.classList.contains("isOpen") && textCutShort(box));
    }
  });
}

// Other Accounts: [0] column titles, then [name, balance, "default" | "cash" | "", starting amount, interest rate,
// interest since, max] (see Other Accounts in Process Budget.js). Balances are each account's starting amount plus its
// entries (Hidden and Transfer entries with it picked): today (over its max, when it has one: "$500.00/$2000.00"), and
// in 6 months (AHEAD_MONTHS, see budgetAhead). Tapping an account opens it, with every entry for it to change. Savings
// and Cash can't be deleted.
function renderAccountsPage(view) {
  renderToolbar("accounts", (origin) => openAccountPanel(origin, null), { newLabel: "New Account", newInEditMode: true });
  view.replaceChildren();
  const summaries = new Map(accountSummaries().map(summary => [summary.index, summary]));
  const ahead = budgetAhead([...summaries.values()]);
  view.appendChild(accountsTotal([...summaries.values()], ahead));

  const tableEl = buildRowTable({
    tableName: "accounts",
    columns: ["Account", "Balance", AHEAD_LABEL],
    rows: indexedRows(accountsData.list, 1),
    extraClass: "accountsTable",
    sections: false,
    canSelect: (row) => !isMandatoryAccount(row),
    lockedNote: (row) => mandatoryAccountNote(row[0]),
    renderEntry(tr, row, index) {
      const summary = summaries.get(index);
      tr.appendChild(noTranslate(cell(row[0], "titleCell")));
      tr.appendChild(noTranslate(balanceCell(summary ? summary.today : 0, row)));
      tr.appendChild(noTranslate(cell(formatMoney(ahead.accounts.get(index) ?? 0), "amountCell")));
    },
    onEntryClick: (index, origin) => openAccountPanel(origin, index)
  });
  view.appendChild(wrapScroll(tableEl));
  if (!editMode) view.appendChild(BudgetUI.element("p", "dataHint", `Balances come from each account's Hidden and Transfer entries (and its interest, when it has some). ${AHEAD_LABEL} counts the ones still to come: on the calendar, in Upcoming, and from your recurring entries and connected spreadsheets. Tap an account to rename it, set its balance, interest, or max, or see every entry for it, and tap an entry to change it.`));
}

// An account's balance today, with its max after it when it has one ("$500.00/$2000.00"). On a narrow screen the max can
// go under the balance, each staying whole.
function balanceCell(balance, row) {
  const td = cell(formatMoney(balance), "amountCell");
  const max = accountMax(row);
  if (max === null) return td;
  td.classList.add("withMax");
  td.replaceChildren(BudgetUI.element("span", "", formatMoney(balance)), document.createElement("wbr"), BudgetUI.element("span", "", `/${formatMoney(max)}`));
  return td;
}

// One of an account's entries in its panel: a button with its day, the entry, and what the account got, which opens the
// entry's options over the panel, the same as on a zoomed day (on a day in History, changing it keeps the balances)
function accountEntryRow(entry) {
  const item = BudgetUI.element("li", "accountEntryItem");
  const button = BudgetUI.element("button", "accountEntryButton");
  button.type = "button";
  const sprite = getParts(entry.line)[0];
  const coming = entry.date > today;
  const line = BudgetUI.element("span", `accountEntryLine ${BudgetUI.amountClass(parseAmount(getParts(entry.line)[1]))}`, shownLine(entry.line));
  if (isPlaceholder(sprite)) line.classList.add("isPlaceholder");
  if (lineHasNote(entry.date, entry.line)) line.classList.add("hasNote");
  const change = BudgetUI.element("span", `accountEntryAmount ${BudgetUI.amountClass(entry.change)}`, (entry.change > 0 ? "+" : "") + formatMoney(entry.change));
  const date = BudgetUI.element("span", "accountEntryDate");
  date.append(noTranslate(BudgetUI.element("span", "", showDate(entry.date))), coming ? " (coming up)" : "");
  button.append(date, noTranslate(line), noTranslate(change));
  button.addEventListener("click", () => BudgetUI.openEntryOptions(button, entry.line, entry.date, { inHistory: entry.place === "history", stacked: true }));
  item.appendChild(button);
  return item;
}

// A month's interest in an account's entries, laid out like an entry (it isn't one, so it doesn't open)
function accountInterestRow(credit) {
  const item = BudgetUI.element("li", "accountEntryItem isInterest");
  const row = BudgetUI.element("div", "accountEntryButton");
  const date = BudgetUI.element("span", "accountEntryDate");
  date.append(noTranslate(BudgetUI.element("span", "", showDate(credit.date))), credit.date > today ? " (coming up)" : "");
  row.append(date, BudgetUI.element("span", "accountEntryLine", "% Interest"),
    noTranslate(BudgetUI.element("span", `accountEntryAmount ${BudgetUI.amountClass(credit.change)}`, (credit.change > 0 ? "+" : "") + formatMoney(credit.change))));
  item.appendChild(row);
  return item;
}

// The figures six months ahead (AHEAD_MONTHS)
const AHEAD_LABEL = `In ${AHEAD_MONTHS} Months`;

// Over the accounts: everything together, In Bank (the budget's own account) and every Other Account, today and in 6
// months (ahead: budgetAhead), and In Bank on its own
function accountsTotal(summaries, ahead) {
  const todaySpot = calendarSpot(today);
  const inBankToday = (todaySpot && readInBank(calendarData[todaySpot.r][todaySpot.c])) ?? 0;
  const sum = (key) => summaries.reduce((total, summary) => total + summary[key], 0);
  const aheadTotal = [...ahead.accounts.values()].reduce((total, balance) => total + balance, 0);
  const box = BudgetUI.element("div", "accountsTotal");
  const figure = (label, amount, main = false) => {
    const part = BudgetUI.element("div", main ? "totalFigure main" : "totalFigure");
    const value = noTranslate(BudgetUI.element("span", "totalAmount", formatMoney(amount)));
    if (amount < 0) value.classList.add("negative");
    part.append(BudgetUI.element("span", "infoLabel", label), value);
    return part;
  };
  box.append(
    figure("Total today, with In Bank", inBankToday + sum("today"), true),
    figure(`Total in ${AHEAD_MONTHS} Months`, ahead.inBank + aheadTotal),
    figure("In Bank today", inBankToday)
  );
  return box;
}

// Change Logs (the spreadsheet's "Form Entries" tab), newest first:
// [time, duration, action, detail, detail, detail, detail, status]
function renderLogsPage(view) {
  renderSearchToolbar();
  view.replaceChildren();
  const rows = logsData.slice(1).filter(row => !isBlankRow(row));
  if (rows.length === 0) {
    view.appendChild(emptyMessage("No changes logged yet."));
    return;
  }

  // The whole table fits the screen: the time takes two lines, the action is cut short (tap it to see it whole), and the
  // details scroll in a box about two lines tall (tap it to open it all the way), like the tracker's aliases
  const tableEl = createDataTable(LOG_COLUMNS);
  tableEl.classList.add("logsTable");
  const fragment = document.createDocumentFragment();
  for (let row of rows) fragment.appendChild(logRow(row));
  tableEl.tBodies[0].appendChild(fragment);
  view.appendChild(wrapScroll(tableEl));
  markClipped(tableEl);
}

const LOG_COLUMNS = ["Time", "Took", { label: "Action", className: "actionHead" }, "Details"];

// One Change Logs row (the page's table, and its Search results)
function logRow(row) {
  const tr = document.createElement("tr");
  if (row[7] === "Error") tr.className = "errorRow";
  if (row[7] === "Not Found") tr.className = "notFoundRow";
  tr.appendChild(noTranslate(cell(row[0], "timeCell")));
  tr.appendChild(noTranslate(cell(String(row[1]).replace(" Seconds", "s"), "timeCell")));
  tr.appendChild(clippedCell(row[2], "actionCell"));
  const details = row.slice(3, 7).filter(detail => String(detail).trim() !== "");
  if (row[7]) details.push("Status: " + row[7]);
  const detailsCell = cell("", "detailsCell");
  detailsCell.appendChild(aliasBox(details.join("\n"), "detailsBox"));
  tr.appendChild(noTranslate(detailsCell)); // Titles, amounts, and dates
  return tr;
}

// Paycheck Calculator: the last calculation's results and how they add up, then the inputs
// (filled in with the last calculation's values) to calculate again
function renderCalculatorPage(view) {
  view.replaceChildren();
  const inputs = readCalculatorInputs();
  const saved = readCalculatorResults();

  const results = BudgetUI.element("section", "paycheckResults");
  results.setAttribute("aria-label", "Paycheck results");
  for (const { key, label } of CALCULATOR_RESULTS) {
    const card = BudgetUI.element("div", `infoCard paycheckResult${key === "takeHome" ? " takeHome" : ""}`);
    card.appendChild(BudgetUI.element("span", "infoLabel", label));
    const amount = BudgetUI.element("span", "paycheckAmount", saved ? formatMoney(saved[key]) : "--");
    if (saved && key === "takeHome") amount.classList.add(saved.takeHome < 0 ? "negative" : "positive");
    card.appendChild(amount);
    results.appendChild(card);
  }
  view.appendChild(results);

  if (saved) view.appendChild(paycheckBreakdown(computePaycheck(inputs), inputs));
  else view.appendChild(emptyMessage("Fill in your pay below, then tap Calculate."));
  view.appendChild(calculatorForm(inputs));
}

// How the take-home pay adds up ($0 lines are left out)
function paycheckBreakdown(paycheck, inputs) {
  const lines = [
    ["Regular Pay", paycheck.regPay],
    ["Overtime Pay", paycheck.otPay],
    ["Premium Pay", paycheck.premPay],
    ["Taxable Allowances", inputs.taxableAllowances],
    ["Gross", paycheck.grossPay, true],
    ["Pre-tax Medical", -paycheck.medicalDed],
    ["Pre-tax Retirement", -paycheck.retirementDed],
    ["FICA", -paycheck.ficaTax],
    ["Federal", -paycheck.federalTax],
    ["State", -paycheck.stateTax],
    ["Post-tax Deductions", -paycheck.postTaxDed],
    ["Non-taxable Reimbursements", inputs.nontaxableReimbursements],
    ["Take Home", paycheck.netPay, true]
  ];
  const card = BudgetUI.element("section", "budgetCard paycheckBreakdown");
  card.appendChild(BudgetUI.element("h3", "", "How It Adds Up"));
  const list = BudgetUI.element("dl", "breakdownList");
  for (const [label, amount, isTotal] of lines) {
    if (!isTotal && Math.round(amount * 100) === 0) continue;
    const row = BudgetUI.element("div", `breakdownRow${isTotal ? " total" : ""}`);
    row.appendChild(BudgetUI.element("dt", "", label));
    const value = BudgetUI.element("dd", "", formatMoney(amount));
    if (amount < 0) value.classList.add("negative");
    row.appendChild(value);
    list.appendChild(row);
  }
  card.appendChild(list);
  return card;
}

// The calculator inputs, grouped like the spreadsheet's. Blank counts as 0. Dollar amounts are typed like a cash register
// (Budget UI.js cashRegister); hours, multipliers, and percentages are typed as they are.
function calculatorForm(inputs) {
  const form = BudgetUI.element("form", "budgetCard calculatorForm");
  form.noValidate = true;
  form.autocomplete = "off";
  form.appendChild(BudgetUI.element("h3", "", "Calculate a Paycheck"));

  const fields = {};
  let section = null;
  for (const field of CALCULATOR_INPUTS) {
    if (!section || section.dataset.section !== field.section) {
      section = BudgetUI.element("fieldset", "calculatorSection");
      section.dataset.section = field.section;
      section.appendChild(BudgetUI.element("legend", "", field.section));
      form.appendChild(section);
    }
    const input = BudgetUI.element("input", "calculatorInput");
    const isMoney = field.unit.startsWith("$");
    input.type = "text";
    input.inputMode = "decimal";
    input.placeholder = isMoney ? "0.00" : "0";
    input.name = field.key;
    input.value = inputs[field.key] ? (isMoney ? Math.abs(inputs[field.key]).toFixed(2) : String(inputs[field.key])) : "";
    if (isMoney) BudgetUI.cashRegister(input);
    const wrapper = BudgetUI.element("div", "unitInput");
    wrapper.append(input, BudgetUI.element("span", "inputUnit", field.unit));
    section.appendChild(BudgetUI.field(field.label, wrapper));
    fields[field.key] = input;
  }

  const error = BudgetUI.element("p", "panelError");
  error.hidden = true;
  error.setAttribute("role", "alert");
  form.append(error, BudgetUI.buttonRow([{ label: "Calculate", kind: "primary", type: "submit" }]));
  // (Typed in and not calculated yet: another device's change doesn't draw the page again over it, see liveUpdateWaits)
  form.addEventListener("input", () => { form.dataset.typing = "1"; });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    error.hidden = true;
    const values = {};
    for (const field of CALCULATOR_INPUTS) {
      // "$25", "7.65%", "1.5×", or "12,50" (a decimal comma) all read as numbers
      const text = fields[field.key].value.replace(/%/g, "").replace(/[x×]\s*$/i, "").trim();
      const number = text === "" ? 0 : readMoneyInput(text);
      if (!Number.isFinite(number) || number < 0 || number > MAX_AMOUNT) {
        error.textContent = number > MAX_AMOUNT ? `${field.label} can be up to 1,000,000,000.` : `${field.label} needs to be a number (0 or more).`;
        error.hidden = false;
        fields[field.key].focus();
        return;
      }
      values[field.key] = number;
    }

    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    const result = await savePaycheck(values);
    button.disabled = false;
    if (!result.ok) {
      error.textContent = result.message || "That didn't work. Please try again.";
      error.hidden = false;
      return;
    }
    BudgetUI.warnIfUnsaved(result);
    // The page has redrawn with the new results; bring them into view
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.querySelector(".paycheckResults")?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
  });
  return form;
}

//#endregion

// =====================================================================
// #region PAGE SEARCH (Tracker and Change Logs)
// =====================================================================
// Search on the Tracker and Change Logs pages looks through that page's own rows. It floats over the page
// like Home's Search (×, Escape, or the button again closes it), and as you type, it lists the rows that have
// every word you typed, in any column. On the tracker, tapping a found row opens it.

const PAGE_SEARCHES = {
  tracker: {
    placeholder: "A row or an alias, like food",
    noun: ["row", "rows"],
    tableClass: "trackerTable",
    columns: TRACKER_COLUMNS,
    rows: () => indexedRows(trackerData, 1).filter(({ row }) => !isSeparatorRow(row)),
    text: (row) => [row[0], row[4], trackerAliasText(row)].join(" "),
    render: (row) => {
      const tr = document.createElement("tr");
      trackerCells(tr, row);
      return tr;
    },
    open: (index) => openTrackerPanel(document.querySelector(`#dataView tr[data-index="${index}"]`) || document.getElementById("pageSearchButton"), index)
  },
  logs: {
    placeholder: "A title, an action, or a date",
    noun: ["change", "changes"],
    tableClass: "logsTable",
    columns: LOG_COLUMNS,
    rows: () => logsData.map((row, index) => ({ index, row })).slice(1).filter(({ row }) => !isBlankRow(row)),
    text: (row) => row.join(" "),
    render: logRow,
    open: null
  }
};

let pageSearch = null; // { box, input, results, isOpen }, made the first time it opens

// The Search button on the Tracker and Change Logs toolbars (its magnifying glass is a CSS image, .iconSearch)
function pageSearchButton() {
  const button = toolbarButton("Search", "", () => setPageSearchOpen(!(pageSearch && pageSearch.isOpen)));
  const icon = BudgetUI.element("span", "buttonIcon iconSearch");
  icon.setAttribute("aria-hidden", "true");
  button.prepend(icon);
  button.id = "pageSearchButton";
  button.setAttribute("aria-haspopup", "dialog");
  button.setAttribute("aria-controls", "pageSearchBox");
  button.setAttribute("aria-expanded", String(!!pageSearch && pageSearch.isOpen));
  return button;
}

// A toolbar with only Search (Change Logs)
function renderSearchToolbar() {
  const bar = document.getElementById("pageToolbar");
  if (bar) bar.replaceChildren(pageSearchButton());
}

// It zooms out of the Search button, and back into it (immediately: right away, like when the page is left
// or Edit mode starts)
function setPageSearchOpen(open, immediately = false) {
  if (!open && (!pageSearch || !pageSearch.isOpen)) return;
  const search = pageSearch || makePageSearch();
  const button = document.getElementById("pageSearchButton");
  search.isOpen = open;
  button?.setAttribute("aria-expanded", String(open));
  if (open) {
    search.box.hidden = false;
    renderPageSearch();
    window.FloatingWindows?.zoomOpen(search.box, button);
    search.input.focus({ preventScroll: true });
    return;
  }
  if (immediately || !button || !window.FloatingWindows) {
    search.box.zoomAnimation?.cancel();
    search.box.hidden = true;
    return;
  }
  window.FloatingWindows.zoomClose(search.box, button, () => { search.box.hidden = true; });
}

// The floating box, in the screen layer (Layout.js; the page's #transitionContainer is transformed, which would make a
// fixed box scroll with it)
function makePageSearch() {
  const config = PAGE_SEARCHES[window.PAGE];
  const box = BudgetUI.element("section", "searchBar searchBox pageSearch");
  box.id = "pageSearchBox";
  box.hidden = true;
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-labelledby", "pageSearchTitle");

  const header = BudgetUI.element("header", "panelHeader");
  const title = BudgetUI.element("h3", "", "Search");
  title.id = "pageSearchTitle";
  const close = BudgetUI.element("button", "panelClose", "×");
  close.type = "button";
  close.setAttribute("aria-label", "Close search");
  close.addEventListener("click", () => {
    setPageSearchOpen(false);
    document.getElementById("pageSearchButton")?.focus({ preventScroll: true });
  });
  header.append(title, close);

  const input = BudgetUI.element("input", "pageSearchInput");
  input.type = "text";
  input.placeholder = config.placeholder;
  input.autocomplete = "off";
  input.setAttribute("aria-label", "Search for");
  input.addEventListener("input", renderPageSearch);

  const results = BudgetUI.element("div", "searchResults");
  results.setAttribute("aria-live", "polite");
  results.hidden = true;
  box.append(header, input, results);
  (window.ScreenLayer ? window.ScreenLayer.element : document.body).appendChild(box);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && pageSearch.isOpen && !document.querySelector(".budgetPanel")) setPageSearchOpen(false);
  });
  window.FloatingWindows?.closeOnPageExit(() => setPageSearchOpen(false, true));
  pageSearch = { box, input, results, isOpen: false };
  return pageSearch;
}

// The rows with every typed word (in any order, any column, upper or lower case)
function renderPageSearch() {
  const config = PAGE_SEARCHES[window.PAGE];
  const { input, results } = pageSearch;
  const words = input.value.normalize("NFKC").toLowerCase().split(/\s+/).filter(Boolean);
  results.replaceChildren();
  results.hidden = words.length === 0;
  if (words.length === 0) return;

  const rows = config.rows();
  const found = rows.filter(({ row }) => {
    const text = config.text(row).normalize("NFKC").toLowerCase();
    return words.every(word => text.includes(word));
  });
  const [one, many] = config.noun;
  results.appendChild(BudgetUI.element("p", "searchSummary", `${found.length} of ${rows.length} ${rows.length === 1 ? one : many} found${config.open && found.length && !editMode ? ". Tap one to open it." : ""}`));
  if (found.length === 0) return;

  // (Laid out like the page's own table, so it fits the same way)
  const tableEl = createDataTable(config.columns);
  tableEl.classList.add(config.tableClass, "pageSearchTable");
  for (const { index, row } of found) {
    const tr = config.render(row);
    if (config.open && !editMode) {
      tr.classList.add("clickable");
      tr.addEventListener("click", () => {
        setPageSearchOpen(false, true);
        config.open(index);
      });
    }
    tableEl.tBodies[0].appendChild(tr);
  }
  const scroll = BudgetUI.element("div", "dataScroll searchScroll");
  scroll.appendChild(tableEl);
  results.appendChild(scroll);
  markClipped(tableEl);
}

//#endregion

// =====================================================================
// #region TOOLBAR + EDIT MODE TABLE
// =====================================================================

// New Entry + Edit normally; Delete Selected + Done in edit mode. Other Accounts adds accounts in edit
// mode instead (newLabel: the add button's label, newInEditMode: show it in edit mode). search: a Search
// button too, outside edit mode (see PAGE SEARCH).
function renderToolbar(tableName, openNew, { newLabel = "New Entry", newInEditMode = false, search = false } = {}) {
  const bar = document.getElementById("pageToolbar");
  if (!bar) return;
  bar.replaceChildren();
  const newButton = (kind) => toolbarButton(newLabel, kind, (event) => openNew(event.currentTarget));

  if (!editMode) {
    if (!newInEditMode) bar.append(newButton("primary"));
    bar.append(toolbarButton("Edit", newInEditMode ? "primary" : "", () => {
      editMode = true;
      selectedRows.clear();
      BudgetUI.closeAllPanels(true);
      setPageSearchOpen(false, true);
      renderCurrentPage();
    }));
    if (search) bar.append(pageSearchButton());
    return;
  }

  const deleteButton = toolbarButton("Delete Selected", "danger", () => deleteSelected(tableName));
  deleteButton.id = "deleteSelectedButton";
  if (newInEditMode) bar.append(newButton(""));
  bar.append(deleteButton, toolbarButton("Done", "primary", () => {
    editMode = false;
    selectedRows.clear();
    BudgetUI.closeAllPanels(true);
    renderCurrentPage();
  }));
  updateDeleteButton();
}

// One button for the page's toolbar
function toolbarButton(label, kind, onClick) {
  const button = BudgetUI.element("button", `budgetButton ${kind}`.trim(), label);
  button.type = "button";
  button.addEventListener("click", onClick);
  return button;
}

// Delete Selected says how many rows are checked, and is off with none
function updateDeleteButton() {
  const button = document.getElementById("deleteSelectedButton");
  if (!button) return;
  button.textContent = selectedRows.size ? `Delete Selected (${selectedRows.size})` : "Delete Selected";
  button.disabled = selectedRows.size === 0;
}

const DELETE_NOTES = {
  recurring: " Recurring entries stop from today on; days that already passed keep theirs.",
  accounts: " Their entries stay on your calendar, but they won't change an account anymore."
};

// Edit mode's Delete Selected: delete the checked rows (after asking)
async function deleteSelected(tableName) {
  const indexes = [...selectedRows];
  if (indexes.length === 0) return;
  const note = DELETE_NOTES[tableName] || "";
  if (!window.confirm(`Delete ${indexes.length} row${indexes.length > 1 ? "s" : ""}?${note}`)) return;
  // The page redraws as part of the change, with the rows below the deleted ones moved up, so nothing may
  // still be checked by then
  selectedRows.clear();
  const result = await deleteBudgetRows(tableName, indexes);
  if (!result.ok) {
    indexes.forEach(index => selectedRows.add(index)); // Nothing was deleted, so they're still checked
    renderCurrentPage();
    return BudgetUI.showToast(result.message, true);
  }
  BudgetUI.warnIfUnsaved(result);
}

// Checked rows stay checked when rows move: moved(index) is the row's new index. The page redraws as part
// of each change, so this happens before it starts; undo() puts them back when the change didn't happen.
function followCheckedRows(moved) {
  const before = new Set(selectedRows);
  selectedRows = new Set([...before].map(moved));
  return () => { selectedRows = before; };
}

// Rows for a table: entries and sections, with a move bar + delete checkbox in edit mode,
// and "+ Section" buttons between rows (sections: false leaves those out). canSelect(row) false
// locks a row out of deleting; lockedNote(row) says why when it's tapped in edit mode.
function buildRowTable({ tableName, columns, rows, renderEntry, onEntryClick, extraClass, sections = true, canSelect = () => true, lockedNote = null }) {
  const headers = editMode ? ["", "", ...columns] : columns;
  const tableEl = createDataTable(headers);
  if (extraClass) tableEl.classList.add(extraClass);
  if (editMode) tableEl.classList.add("isEditing");
  const body = tableEl.tBodies[0];

  for (const { index, row } of rows) {
    if (editMode && sections) body.appendChild(sectionButtonRow(index, headers.length));

    const tr = document.createElement("tr");
    tr.dataset.index = index;
    if (editMode) {
      tr.appendChild(moveBarCell());
      tr.appendChild(selectCell(index, canSelect(row)));
      if (selectedRows.has(index)) tr.classList.add("selected");
    }
    if (isSeparatorRow(row)) {
      tr.classList.add("categoryRow");
      const td = document.createElement("td");
      td.colSpan = columns.length;
      td.textContent = row[1] ?? "";
      tr.appendChild(td);
    } else {
      renderEntry(tr, row, index);
    }
    tr.classList.add("clickable");
    body.appendChild(tr);
  }
  if (editMode && sections) body.appendChild(sectionButtonRow(ROW_TABLES[tableName].get().length, headers.length));

  // Where a press started: a swipe that starts on a row scrolls the page, and only a tap (one that barely moved,
  // with the page still in place) opens the row
  let pressed = null;
  body.addEventListener("pointerdown", (event) => {
    pressed = { x: event.clientX, y: event.clientY, scrollY: window.scrollY };
  }, { passive: true });

  body.addEventListener("click", (event) => {
    const swiped = event.detail > 0 && pressed &&
      (Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) > 10 || Math.abs(window.scrollY - pressed.scrollY) > 10);
    if (swiped) return;
    const sectionButton = event.target.closest(".sectionButton");
    if (sectionButton) {
      openCategoryPanel(tableName, sectionButton, null, Number(sectionButton.dataset.insertAt));
      return;
    }
    const tr = event.target.closest("tr[data-index]");
    if (!tr || event.target.closest(".moveBar")) return;
    const index = Number(tr.dataset.index);

    if (editMode) {
      // Tapping a row (or its checkbox) toggles it for deletion
      const checkbox = tr.querySelector(".selectRow");
      if (!checkbox) {
        if (lockedNote) BudgetUI.showToast(lockedNote(ROW_TABLES[tableName].get()[index]));
        return;
      }
      if (event.target !== checkbox) checkbox.checked = !checkbox.checked;
      toggleSelected(index, checkbox.checked, tr);
      return;
    }
    if (tr.classList.contains("categoryRow")) openCategoryPanel(tableName, tr, index, null);
    else onEntryClick(index, tr);
  });

  body.addEventListener("pointerdown", (event) => {
    const bar = event.target.closest(".moveBar");
    if (bar && editMode) startRowDrag(event, bar, tableEl, tableName);
  });
  return tableEl;
}

// Check or uncheck a row for deleting
function toggleSelected(index, checked, tr) {
  if (checked) selectedRows.add(index);
  else selectedRows.delete(index);
  tr.classList.toggle("selected", checked);
  updateDeleteButton();
}

// Edit mode's "+ Section" button, as its own row, before row insertAt
function sectionButtonRow(insertAt, span) {
  const tr = document.createElement("tr");
  tr.className = "sectionInsertRow";
  const td = document.createElement("td");
  td.colSpan = span;
  const button = BudgetUI.element("button", "budgetButton sectionButton", "+ Section");
  button.type = "button";
  button.dataset.insertAt = insertAt;
  td.appendChild(button);
  tr.appendChild(td);
  return tr;
}

// Edit mode's ≡ bar, held to drag a row
function moveBarCell() {
  const td = document.createElement("td");
  td.className = "moveBar";
  td.textContent = "≡";
  td.title = "Hold and drag to move";
  td.setAttribute("aria-label", "Move row");
  return td;
}

// A delete checkbox, or a lock for a row that can't be deleted
function selectCell(index, selectable = true) {
  const td = document.createElement("td");
  td.className = "selectCell";
  if (!selectable) {
    const lock = BudgetUI.element("span", "lockedRow", "🔒");
    lock.title = "Can't be deleted";
    lock.setAttribute("role", "img");
    lock.setAttribute("aria-label", "Can't be deleted");
    td.appendChild(lock);
    return td;
  }
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "selectRow";
  checkbox.checked = selectedRows.has(index);
  checkbox.setAttribute("aria-label", "Select row for deletion");
  td.appendChild(checkbox);
  return td;
}

//#endregion

// =====================================================================
// #region DRAG TO MOVE
// =====================================================================
// Hold a row's move bar and drag. Rows reorder live under the pointer. The page scrolls only
// while the pointer is in the top or bottom 25% of the screen, faster closer to the edge. The pointer is
// followed on the whole page, not with a pointer capture: moving the row in the table makes the browser let
// go of one, which would stop the drag after the first row it passed.

const EDGE_ZONE = 0.25;  // Fraction of the screen height at each edge that scrolls
const MAX_SCROLL = 22;   // Pixels per frame at the very edge

// Start dragging a row by its ≡ bar; the new order saves when it's let go
function startRowDrag(event, bar, tableEl, tableName) {
  event.preventDefault();
  const row = bar.closest("tr");
  const body = tableEl.tBodies[0];
  const startOrder = rowOrder(body);
  const pointerId = event.pointerId;
  let pointerY = event.clientY;
  let frame = null;

  tableEl.classList.add("isDragging");
  row.classList.add("dragRow");

  // Put the dragged row before the first row whose middle is below the pointer
  const placeRow = () => {
    const others = [...body.querySelectorAll("tr[data-index]")].filter(other => other !== row);
    for (const other of others) {
      const rect = other.getBoundingClientRect();
      if (pointerY < rect.top + rect.height / 2) {
        if (row.nextElementSibling !== other) other.before(row);
        return;
      }
    }
    const last = others[others.length - 1];
    if (last && last.nextElementSibling !== row) last.after(row);
  };

  const autoScroll = () => {
    const zone = window.innerHeight * EDGE_ZONE;
    let speed = 0;
    if (pointerY < zone) speed = -MAX_SCROLL * Math.pow(1 - pointerY / zone, 2);
    else if (pointerY > window.innerHeight - zone) speed = MAX_SCROLL * Math.pow(1 - (window.innerHeight - pointerY) / zone, 2);
    if (speed) {
      window.scrollBy(0, speed);
      placeRow();
    }
    frame = requestAnimationFrame(autoScroll);
  };

  const onMove = (moveEvent) => {
    if (moveEvent.pointerId !== pointerId) return;
    pointerY = moveEvent.clientY;
    placeRow();
  };

  const onEnd = (endEvent) => {
    if (endEvent.pointerId !== pointerId) return;
    cancelAnimationFrame(frame);
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onEnd);
    document.removeEventListener("pointercancel", onEnd);
    tableEl.classList.remove("isDragging");
    row.classList.remove("dragRow");

    const order = rowOrder(body);
    if (order.join() === startOrder.join()) return;
    // The rows land in this order right after the table's header rows (see reorderTableRows)
    const firstRow = ROW_TABLES[tableName].headerRows;
    const undoChecks = followCheckedRows(index => (order.includes(index) ? firstRow + order.indexOf(index) : index));
    moveBudgetRows(tableName, order, Number(row.dataset.index)).then((result) => {
      if (!result.ok) {
        undoChecks();
        BudgetUI.showToast(result.message, true);
        renderCurrentPage(); // Put the rows back where they really are
      } else {
        BudgetUI.warnIfUnsaved(result);
      }
    });
  };

  document.addEventListener("pointermove", onMove);
  document.addEventListener("pointerup", onEnd);
  document.addEventListener("pointercancel", onEnd);
  frame = requestAnimationFrame(autoScroll);
}

// The rows' indexes, top to bottom, as the table shows them now
function rowOrder(body) {
  return [...body.querySelectorAll("tr[data-index]")].map(tr => Number(tr.dataset.index));
}

//#endregion

// =====================================================================
// #region PANELS
// =====================================================================

// New recurring entry (index null) or change the tapped one. Two can share a title only when their refraction type
// or Other Account is different, so one that matches another in all three is refused with a message saying so.
function openRecurringPanel(origin, index) {
  const existing = index === null ? null : recurringData[index];
  BudgetUI.openPanel({
    origin,
    size: "large",
    title: existing ? "Change Recurring Entry" : "New Recurring Entry",
    build(form, panel) {
      // Stored dates are always MM/DD/YYYY (the boxes show them in this device's date format)
      const existingEnd = existing && String(existing[4]).trim().toLowerCase() !== "none" ? createSafeMidnight(existing[4], true) : null;
      const existingStart = existing ? createSafeMidnight(existing[2], true) : null;

      // Its title and its Other Account ("Payday → Savings") are separate boxes
      const existingTitle = splitAccount(existing ? String(existing[0]).trim() : "");
      const title = BudgetUI.textField({ label: "Title", value: existingTitle.title, placeholder: "Rent, paycheck, phone...", maxLength: MAX_TITLE });
      const amount = BudgetUI.amountField({ amount: existing ? parseAmount(existing[1]) : null, percent: existing ? percentOf(existing[5]) : null });
      const frequency = BudgetUI.frequencyField({ value: existing ? existing[3] : "Every Month" });
      const start = BudgetUI.dateField({ label: "Start Date", date: existing ? (isNaN(existingStart) ? null : existingStart) : today });
      const end = BudgetUI.dateField({ label: "End Date", date: existingEnd && !isNaN(existingEnd) ? existingEnd : null, optional: true });
      // Hidden and Transfer entries can move money into or out of an Other Account (like a savings transfer). The type and
      // account come before the amount, which can be a % of the account picked.
      const account = BudgetUI.accountField({ accounts: otherAccounts(), amount, type: () => refraction.value(), account: existingTitle.account });
      const refraction = BudgetUI.refractionField({
        value: existing ? getSpecialType(existing[5]) : "❗️",
        allowAuto: false,
        onChange: (key) => account.setVisible(BudgetUI.isAccountType(key))
      });
      account.setVisible(BudgetUI.isAccountType(refraction.value()));
      // Every day it lands on gets a placeholder (offered while it can still land: no End Date, or one from today on)
      const placeholder = BudgetUI.placeholderField({
        checked: !!existing && isPlaceholder(existing[5]),
        hint: "Every day it lands on gets a placeholder: a stand-in for an entry you expect, like an estimate. It counts like any entry and shows in yellow, and it's deleted once its day passes."
      });
      const showPlaceholder = () => placeholder.setDate(end.value() ?? null);
      end.input.addEventListener("input", showPlaceholder);
      end.input.addEventListener("change", showPlaceholder);
      showPlaceholder();
      // Needs, Wants, Or Future (once Bob's card for it is on): its title's, following a new title as it's typed
      const purpose = BudgetUI.purposeField({ shown: bobCardOn("purposes"), title: existing ? String(existing[0]) : "" });
      const followTitle = () => purpose.follow(withAccount(title.value(), account.value()));
      title.input.addEventListener("input", followTitle);
      account.el.addEventListener("click", followTitle);
      // Its own note, under the buttons (each day it lands on can have one of its own too)
      const currentNote = existing ? recurringNote(existing[0], existing[5]) : "";
      const note = BudgetUI.noteField({ note: currentNote });

      const buttons = existing
        ? [{ label: "Save", kind: "primary", type: "submit" }, { label: "Delete", kind: "danger", onClick: deleteEntry }, { label: "Cancel", onClick: () => panel.close() }]
        : [{ label: "Add Entry", kind: "primary", type: "submit" }, { label: "Cancel", onClick: () => panel.close() }];
      form.append(title.el, refraction.el, account.el, amount.el, frequency.el, start.el, end.el, placeholder.el, purpose.el, BudgetUI.buttonRow(buttons), note.el);

      form.addEventListener("submit", (event) => {
        event.preventDefault();
        if (title.value().includes(ACCOUNT_ARROW)) return panel.setError(TITLE_ARROW);
        // (A blank amount is $0.00)
        const { percent, error: percentError } = BudgetUI.readPercentField(amount);
        if (percentError) return panel.setError(percentError);
        const fields = { title: withAccount(title.value(), account.value()), amount: percent !== null ? undefined : amount.value() ?? 0, percent, startDate: start.value(), endDate: end.value() };
        if (!fields.title) return panel.setError("Give the recurring entry a title.");
        if (percent === null && Number.isNaN(fields.amount)) return panel.setError("Enter an amount, like 12.50.");
        if (percent === null && Math.abs(fields.amount) > MAX_AMOUNT) return panel.setError(AMOUNT_TOO_BIG);
        if (fields.startDate === undefined || fields.endDate === undefined) return panel.setError(`That date isn't a real day. Use ${datePattern()}.`);
        fields.frequency = frequency.value();
        if (!fields.frequency) return panel.setError(`How often should it land? Use a whole number from 1 to ${MAX_FREQUENCY_COUNT}, like every 2 weeks.`);
        fields.sprite = BudgetUI.RECURRING_SPRITES[refraction.value()];
        fields.endDate = fields.endDate || "None";
        // (Left as it was when the switch isn't there: an End Date before today)
        if (!placeholder.el.hidden) fields.placeholder = placeholder.value();
        fields.purpose = purpose.value();
        if (note.value() !== currentNote) fields.note = note.value();
        BudgetUI.submit(panel, () => saveRecurringEntry(fields, index));
      });

      // Delete: it stops from today on (it ends yesterday), and days that passed keep it
      function deleteEntry() {
        if (!window.confirm(`Delete ${existing[0]}? It stops from today on; days that already passed keep it.`)) return;
        BudgetUI.submit(panel, () => deleteBudgetRows("recurring", [index]));
      }
    }
  });
}

// New tracker row (index null) or change the tapped one. Each alias gets All / Costs / Gains buttons.
// Costs, Gains, Transfers, and Undefined fill in by themselves, so their panels only say what they count (and
// they can't be deleted).
function openTrackerPanel(origin, index) {
  const existing = index === null ? null : trackerData[index];
  const isAuto = !!existing && TRACKER_AUTO_ROWS.includes(cleanString(existing[0]));
  BudgetUI.openPanel({
    origin,
    size: "large",
    title: existing ? "Change Tracker Row" : "New Tracker Row",
    build(form, panel) {
      const existingTitle = existing ? String(existing[0]).replace("⭕️", "") : "";
      const title = BudgetUI.textField({ label: "Title", value: existingTitle, placeholder: "Groceries, car stuff...", disabled: isAuto, maxLength: MAX_TITLE });
      const aliases = isAuto ? null : BudgetUI.aliasField({ aliases: existing ? aliasList(existing[4]) : [] });
      // Whether the row counts transfers too (its title then starts with ⭕️): an on/off switch
      const transferSwitch = BudgetUI.checkboxField({ label: "Count ⭕️ Transfers in this row", checked: existing ? String(existing[0]).startsWith("⭕️") : false });
      const transfers = {
        el: BudgetUI.field("Transfers", transferSwitch.el, { hint: "Rows leave transfers out unless this is on (the Transfers row has every one either way)." }),
        value: transferSwitch.value
      };
      const fields = isAuto
        ? [title.el, BudgetUI.field("Counts", BudgetUI.element("p", "panelText", autoRowNote(existing))), BudgetUI.element("p", "panelHint", `${existingTitle.trim()} fills in by itself, so it can't be deleted.`)]
        : [title.el, aliases.el, transfers.el];

      const buttons = !existing
        ? [{ label: "Add Row", kind: "primary", type: "submit" }, { label: "Cancel", onClick: () => panel.close() }]
        : isAuto
          ? [{ label: "Close", onClick: () => panel.close() }]
          : [{ label: "Save", kind: "primary", type: "submit" }, { label: "Delete", kind: "danger", onClick: deleteRow }, { label: "Cancel", onClick: () => panel.close() }];
      form.append(...fields, BudgetUI.buttonRow(buttons));

      form.addEventListener("submit", (event) => {
        event.preventDefault();
        if (isAuto) return;
        const changes = { title: title.value(), aliases: aliases.value(), tracksTransfers: transfers.value() };
        if (!changes.title) return panel.setError("Give the tracker row a title.");
        BudgetUI.submit(panel, () => saveTrackerEntry(changes, index));
      });

      // (A dialog can't show the ⭕️ image, so a row that counts transfers says so in words)
      function deleteRow() {
        const counts = String(existing[0]).startsWith("⭕️") ? " (the one that counts transfers)" : "";
        if (!window.confirm(`Delete the ${existingTitle.trim()} row${counts}?`)) return;
        BudgetUI.submit(panel, () => deleteBudgetRows("tracker", [index]));
      }
    }
  });
}

// New account (index null, from edit mode) or change the tapped one: its name, its balance today (typing one sets
// its starting amount, so no entry is made), its interest, its max (optional: the most it can hold, like a credit card's
// limit, shown after its balance), and every entry for it, to change. A change to one of its entries while it's open
// redraws them, and the balance follows it unless a new one was typed (Save only sets the balance when one was).
function openAccountPanel(origin, index) {
  const existing = index === null ? null : accountsData.list[index];
  const summary = existing ? accountSummaries().find(account => account.index === index) : null;
  const isMandatory = !!existing && isMandatoryAccount(existing);
  BudgetUI.openPanel({
    origin,
    size: "large",
    title: existing ? "Change Account" : "New Account",
    build(form, panel) {
      const name = BudgetUI.textField({ label: "Name", value: existing ? existing[0] : "", placeholder: "Investments, HSA, a credit card...", maxLength: MAX_ACCOUNT_NAME });
      // Negative: money owed, like on a credit card
      const balance = BudgetUI.amountField({
        label: "Balance today",
        amount: summary ? summary.today : null,
        signs: BudgetUI.BALANCE_SIGNS,
        hint: "What's in the account today (Negative for money owed, like a credit card's). Changing it doesn't add an entry: Hidden and Transfer entries with this account picked add to it from here."
      });
      const interest = interestFields(summary ? summary.interest : null);
      // Max: typed like a cash register (blank for none)
      const currentMax = existing ? accountMax(existing) : null;
      const max = BudgetUI.textField({
        label: "Max",
        value: currentMax ? currentMax.toFixed(2) : "",
        placeholder: "0.00",
        optional: true,
        hint: "The most it can hold, like a credit card's limit. Its balance then shows over it, like $500.00/$2000.00."
      });
      BudgetUI.cashRegister(max.input);
      const fields = [name.el, balance.el, interest.el, max.el];
      if (isMandatory) fields.push(BudgetUI.element("p", "panelHint", mandatoryAccountNote(existing[0])));
      const entries = summary ? accountEntriesField(index, existing[0]) : null;
      if (entries) fields.push(entries.el);
      // The balance shown, to tell a typed one from one that only followed its entries
      let shownBalance = summary ? summary.today : null;
      const showBalance = (amount) => {
        shownBalance = amount;
        balance.input.value = Math.round(amount * 100) !== 0 ? Math.abs(amount).toFixed(2) : "";
        balance.setSign(amount < 0 ? -1 : 1);
      };
      // (Its entries and balance are drawn again after each change while it's open)
      const follow = () => {
        if (!panel.panel.isConnected || panel.panel.classList.contains("isClosing")) return document.removeEventListener("budget:updated", follow);
        entries?.draw();
        const now = accountSummaries().find(account => account.index === index);
        const typed = balance.value();
        if (now && (typed === null ? 0 : typed) === Math.round((shownBalance ?? 0) * 100) / 100) showBalance(now.today);
      };
      if (summary) document.addEventListener("budget:updated", follow);
      const buttons = existing
        ? [{ label: "Save", kind: "primary", type: "submit" }, ...(isMandatory ? [] : [{ label: "Delete", kind: "danger", onClick: deleteAccount }]), { label: "Cancel", onClick: () => panel.close() }]
        : [{ label: "Add Account", kind: "primary", type: "submit" }, { label: "Cancel", onClick: () => panel.close() }];
      form.append(...fields, BudgetUI.buttonRow(buttons));

      form.addEventListener("submit", (event) => {
        event.preventDefault();
        if (!name.value()) return panel.setError("Give the account a name.");
        const amount = balance.value() ?? 0; // Blank is $0.00
        if (!Number.isFinite(amount)) return panel.setError("Enter the balance, like 3000.00.");
        if (Math.abs(amount) > MAX_AMOUNT) return panel.setError(AMOUNT_TOO_BIG);
        const rate = interest.value();
        if (Number.isNaN(rate)) return panel.setError(`Enter the interest rate for a year, like 24.99 (up to ${MAX_INTEREST_RATE}), or turn Interest off.`);
        const most = max.value() ? readMoneyInput(max.value()) : null;
        if (most !== null && (!Number.isFinite(most) || most > MAX_AMOUNT)) return panel.setError("Enter the most it can hold, like 2000.00, or leave Max blank.");
        // (A balance that wasn't typed is left out, so it keeps whatever its entries make it)
        const typedBalance = !existing || Math.round(amount * 100) !== Math.round((shownBalance ?? 0) * 100);
        BudgetUI.submit(panel, () => saveAccount({ name: name.value(), ...(typedBalance ? { balance: amount } : {}), interest: rate ? { rate } : null, max: most || null }, index));
      });

      // Delete: the account goes, and its entries stay where they are
      function deleteAccount() {
        if (!window.confirm(`Delete ${existing[0]}? Its entries stay on your calendar, but they won't change an account anymore.`)) return;
        BudgetUI.submit(panel, () => deleteBudgetRows("accounts", [index]));
      }
    }
  });
}

// An account's Interest: a pill switch, and while it's on, the rate for a year (APR). Each month (on the day of the
// month it was turned on, or the balance was last typed) the account changes by a twelfth of it (interestCredits in
// Process Budget.js). value(): the rate (a number above 0), 0 when it's off, NaN when the rate can't be read.
function interestFields(current) {
  const toggle = BudgetUI.checkboxField({ label: "Add interest each month", checked: !!current });
  const rate = BudgetUI.textField({
    label: "Interest rate (APR, % a year)",
    value: current ? String(current.rate) : "",
    placeholder: "Like 24.99",
    hint: "Like a credit card's APR. Once a month (on the day of the month you turn it on or last set the balance), the balance changes by a twelfth of it: one below $0 (money owed) goes further below, and one above $0 grows."
  });
  rate.input.inputMode = "decimal";
  rate.el.hidden = !current;
  toggle.input.addEventListener("change", () => {
    rate.el.hidden = !toggle.value();
    if (toggle.value() && window.matchMedia("(pointer: fine)").matches) rate.input.focus();
  });
  const el = BudgetUI.element("div", "interestFields");
  el.append(BudgetUI.field("Interest", toggle.el), rate.el);
  return {
    el,
    value() {
      if (!toggle.value()) return 0;
      const number = readMoneyInput(rate.value().replace(/%/g, ""));
      return Number.isFinite(number) && number > 0 && number <= MAX_INTEREST_RATE ? number : NaN;
    }
  };
}

// An account's entries for its panel, newest first, in a box that scrolls: every entry for it (on the calendar, in
// History, and in Upcoming; see accountEntryLines), each one tapped to change it, and its interest through the calendar.
// Amounts at the right are what the account got (a Transfer's opposite amount, or a Hidden entry's own; see
// accountChange). { el, draw } (draw lists them again, after a change)
function accountEntriesField(index, name) {
  const list = BudgetUI.element("ul", "accountEntries");
  const none = BudgetUI.element("p", "panelText", `None yet. Hidden and Transfer entries with ${name} picked under Other Account change it.`);
  const draw = () => {
    const summary = accountSummaries().find(account => account.index === index);
    const interest = (summary ? summary.interestCredits : []).filter(credit => credit.date <= gridEndDate);
    const entries = [...accountEntryLines(index), ...interest.map(credit => ({ ...credit, interest: true }))].sort((a, b) => b.date - a.date);
    list.replaceChildren(...entries.map(entry => (entry.interest ? accountInterestRow(entry) : accountEntryRow(entry))));
    list.hidden = entries.length === 0;
    none.hidden = entries.length > 0;
  };
  draw();
  const box = BudgetUI.element("div", "accountEntriesBox");
  box.append(none, list);
  return { el: BudgetUI.field("Entries", box, { hint: "Tap one to change it. At the right: what it put in or took out." }), draw };
}

// New section (index null, inserted at atIndex) or rename/delete the tapped one
function openCategoryPanel(tableName, origin, index, atIndex) {
  const existing = index === null ? null : ROW_TABLES[tableName].get()[index];
  BudgetUI.openPanel({
    origin,
    size: "large",
    title: existing ? "Change Section" : "New Section",
    build(form, panel) {
      const title = BudgetUI.textField({ label: "Section Title", value: existing ? existing[1] : "", placeholder: "Bills, income, fun...", maxLength: MAX_TITLE });
      const buttons = existing
        ? [{ label: "Save", kind: "primary", type: "submit" }, { label: "Delete", kind: "danger", onClick: deleteSection }, { label: "Cancel", onClick: () => panel.close() }]
        : [{ label: "Add Section", kind: "primary", type: "submit" }, { label: "Cancel", onClick: () => panel.close() }];
      form.append(title.el, BudgetUI.buttonRow(buttons));

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!title.value()) return panel.setError("Give the section a title.");
        if (existing) return BudgetUI.submit(panel, () => renameCategoryRow(tableName, index, title.value()));
        // Rows from the new section on move down one (in Edit, where rows can be checked)
        const undoChecks = followCheckedRows(row => (row >= atIndex ? row + 1 : row));
        const result = await BudgetUI.submit(panel, () => addCategoryRow(tableName, atIndex, title.value()));
        if (!result.ok) {
          undoChecks();
          renderCurrentPage();
        }
      });

      // Delete the section heading (the rows under it stay)
      function deleteSection() {
        if (!window.confirm(`Delete the ${existing[1]} section? The entries under it stay.`)) return;
        BudgetUI.submit(panel, () => deleteBudgetRows(tableName, [index]));
      }
    }
  });
}

//#endregion

// =====================================================================
// #region TABLE HELPERS
// =====================================================================

// A table with its column titles: each a title, or { label, className } for one its column's styles go by
function createDataTable(headers) {
  const tableEl = document.createElement("table");
  tableEl.className = "dataTable";
  const headRow = tableEl.createTHead().insertRow();
  for (let header of headers) {
    const th = document.createElement("th");
    th.textContent = typeof header === "string" ? header : header.label;
    if (header && header.className) th.className = header.className;
    headRow.appendChild(th);
  }
  tableEl.createTBody();
  return BudgetUI.spanHeaderBar(tableEl);
}

// Kept out of the browser's translation: the person's titles, names, amounts, and dates show as they are
const noTranslate = (el) => BudgetUI.noTranslate(el);

// textContent only: cell text comes from user data and must never be parsed as HTML
function cell(value, className) {
  const td = document.createElement("td");
  td.textContent = value ?? "";
  if (className) td.className = className;
  if (className === "amountCell") {
    const amount = parseAmount(value);
    if (amount < 0) td.classList.add("negative");
    if (amount > 0) td.classList.add("positive");
  }
  return td;
}

// [{ index, row }] for every non-blank row after the header rows
function indexedRows(table, headerRows) {
  const rows = [];
  for (let i = headerRows; i < table.length; i++) {
    if (!isBlankRow(table[i])) rows.push({ index: i, row: table[i] });
  }
  return rows;
}

// A page's message when it has nothing to show yet
function emptyMessage(text) {
  return BudgetUI.element("p", "dataEmpty", text);
}

// Wide tables scroll sideways inside the page instead of stretching it
function wrapScroll(tableEl) {
  const wrapper = document.createElement("div");
  wrapper.className = "dataScroll";
  wrapper.appendChild(tableEl);
  return wrapper;
}

// A section heading row: ["-", heading, ...]
function isSeparatorRow(row) {
  return String(row[0] ?? "").trim() === "-";
}

// A tracker row's stored aliases ("rent-, paycheck+, atm") as [{ title, clean, count }]
function aliasList(text) {
  return String(text ?? "").split(",").map(alias => parseAlias(alias)).filter(alias => alias.clean);
}

// The Aliases column in words: "rent (costs), paycheck (gains), atm"
function trackerAliasText(row) {
  const rowType = cleanString(row[0]);
  if (rowType === "costs") return "Every cost";
  if (rowType === "gains") return "Every gain";
  if (rowType === "transfers") return String(row[4] ?? "").trim() ? `Every transfer: ${describeAliases(row[4])}` : "Every transfer";
  return describeAliases(row[4]);
}

// What Costs, Gains, or Undefined counts, for its panel
function autoRowNote(row) {
  const rowType = cleanString(row[0]);
  if (rowType === "costs") return "Every cost (✖️ Hidden ones too), except transfers. This row fills in by itself.";
  if (rowType === "gains") return "Every gain (✖️ Hidden ones too), except transfers. This row fills in by itself.";
  if (rowType === "transfers") return `Every ⭕️ Transfer${String(row[4] ?? "").trim() ? ": " + describeAliases(row[4]) : " (there aren't any right now)"}, so they never land in Undefined. This row fills in by itself.`;
  const titles = trackerAliasText(row);
  return `Entries that no other row counts${titles ? ": " + titles : " (there aren't any right now)"}. This row fills in by itself.`;
}

// A row with nothing in any of its cells
function isBlankRow(row) {
  return row.every(value => String(value ?? "").trim() === "");
}

//#endregion
