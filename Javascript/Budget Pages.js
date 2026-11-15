// Budget Pages: the menu data pages (Recurring, Equity, Paycheck Calculator, Accrual Calculator, Change Logs).
// Recurring: New Entry, tap a row to change it, and an Edit mode with section buttons between rows, delete
// checkboxes, and a move bar to drag rows. Equity: tap an account to change it, and an Edit mode to add, delete,
// and drag accounts. Change Logs: a Search that looks through its own rows (Home's Search is in Budget Search.js).
// Bob's page loads it too, for the tracker, in his Data card's Tracker window (Bob Page.js): the same table, New Row,
// and Edit mode, drawn in the window instead of the page (renderCurrentPage draws it again there).
// Every change goes through Process Budget.js (runBudgetAction), which saves and then fires
// "budget:updated" so the page re-renders.

// =====================================================================
// #region SETUP
// =====================================================================

// Which renderer each page uses (pages without a layout yet just load/save data)
const PAGE_RENDERERS = {
  recurring: renderRecurringPage,
  logs: renderLogsPage,
  calculator: renderCalculatorPage,
  payments: renderPaymentsPage,
  accounts: renderAccountsPage
};

let editMode = false;          // Recurring's (or Bob's Tracker window's) edit mode
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

// Draw this page from the budget (and its open Search results). On Bob's page and the Snapshot page, that's the tracker,
// while its window is open (its Edit and Done draw it again here too).
function renderCurrentPage() {
  const render = PAGE_RENDERERS[window.PAGE];
  const view = document.getElementById("dataView");
  if (render && view) render(view);
  else if ((window.PAGE === "bob" || window.PAGE === "snapshot") && typeof drawTrackerWindow === "function") drawTrackerWindow();
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

// "Needs a look" over the table: recurring entries that match another one in title, Equity account, and refraction type,
// which can't be made here (see recurringDuplicates in Process Budget.js)
function recurringProblems(duplicates) {
  const box = BudgetUI.element("div", "recurringProblems");
  box.setAttribute("role", "status");
  const list = BudgetUI.element("ul");
  for (const name of duplicates) list.append(noTranslate(BudgetUI.element("li", "", name)));
  box.append(
    BudgetUI.element("strong", "", "Needs a look"),
    BudgetUI.element("p", "panelText", `${RECURRING_RULE}, but ${duplicates.length === 1 ? "this one is" : "these are"} here more than once. Give one of each another title, refraction type, or Equity account, or delete one. Until then, on a day they both land on, only the first one in the list does.`),
    list
  );
  return box;
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
  // (One with more to show, or open, is a stop for the Tab key that Enter or Space opens or closes)
  const reachable = (box) => {
    const can = box.classList.contains("isClipped") || box.classList.contains("isOpen");
    if (can) {
      box.tabIndex = 0;
      box.setAttribute("role", "button");
      box.setAttribute("aria-expanded", String(box.classList.contains("isOpen")));
    } else {
      box.removeAttribute("tabindex");
      box.removeAttribute("role");
      box.removeAttribute("aria-expanded");
    }
  };
  requestAnimationFrame(() => {
    for (const box of table.querySelectorAll(".aliasBox")) {
      box.classList.toggle("isClipped", !box.classList.contains("isOpen") && box.scrollHeight > box.clientHeight + 1);
      reachable(box);
    }
    for (const box of table.querySelectorAll(".clipText")) {
      box.classList.toggle("isClipped", !box.classList.contains("isOpen") && textCutShort(box));
      reachable(box);
    }
  });
}

// Equity: [0] column titles, then [name, balance, "default" | "cash" | "", starting amount, interest rate,
// interest since, max] (see Equity in Process Budget.js). Balances are each account's starting amount plus its
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
      tr.appendChild(noTranslate(balanceCell(summary ? summary.today : 0, row, summary?.interest?.separate ? summary.owed ?? 0 : null)));
      tr.appendChild(noTranslate(cell(formatMoney(ahead.accounts.get(index) ?? 0), "amountCell")));
    },
    onEntryClick: (index, origin) => openAccountPanel(origin, index)
  });
  view.appendChild(wrapScroll(tableEl));
  if (!editMode) view.appendChild(BudgetUI.element("p", "dataHint", `Balances come from each account's Hidden and Transfer entries (and its interest, when it has some). ${AHEAD_LABEL} counts the ones still to come: on the calendar, in Upcoming, and from your recurring entries and connected spreadsheets. Tap an account to rename it, set its balance, interest, or max, or see every entry for it, and tap an entry to change it.`));
}

// An account's balance today, with its max after it when it has one ("$500.00/$2000.00"). On a narrow screen the max can
// go under the balance, each staying whole. owed: with Separate Interest, the part that's interest, which shows under the
// rest on a line of its own (null without it).
function balanceCell(balance, row, owed = null) {
  const rest = owed === null ? balance : Math.round((balance - owed) * 100) / 100;
  const td = cell(formatMoney(rest), "amountCell");
  const max = accountMax(row);
  if (max !== null) {
    td.classList.add("withMax");
    td.replaceChildren(BudgetUI.element("span", "", formatMoney(rest)), document.createElement("wbr"), BudgetUI.element("span", "", `/${formatMoney(max)}`));
  }
  if (owed !== null) {
    td.classList.add("withInterest");
    td.append(BudgetUI.element("span", "interestLine", `Interest ${formatMoney(owed)}`));
  }
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
  const date = BudgetUI.element("span", "accountEntryDate");
  date.append(noTranslate(BudgetUI.element("span", "", showDate(entry.date))), coming ? " (coming up)" : "");
  button.append(date, noTranslate(line));
  // (What it did to the account, for an account's list)
  if (typeof entry.change === "number") button.append(noTranslate(BudgetUI.element("span", `accountEntryAmount ${BudgetUI.amountClass(entry.change)}`, (entry.change > 0 ? "+" : "") + formatMoney(entry.change))));
  button.addEventListener("click", () => BudgetUI.openEntryOptions(button, entry.line, entry.date, { inHistory: entry.place === "history", stacked: true }));
  item.appendChild(button);
  return item;
}

// A month's interest, or the escrow a payment paid (credit.escrow), in an account's entries, laid out like an entry
// (neither is one, so it doesn't open)
function accountInterestRow(credit) {
  const item = BudgetUI.element("li", `accountEntryItem ${credit.escrow ? "isEscrow" : "isInterest"}`);
  const row = BudgetUI.element("div", "accountEntryButton");
  const date = BudgetUI.element("span", "accountEntryDate");
  date.append(noTranslate(BudgetUI.element("span", "", showDate(credit.date))), credit.date > today ? " (coming up)" : "");
  row.append(date, BudgetUI.element("span", "accountEntryLine", credit.escrow ? "Escrow (taxes and insurance)" : "% Interest"),
    noTranslate(BudgetUI.element("span", `accountEntryAmount ${BudgetUI.amountClass(credit.change)}`, (credit.change > 0 ? "+" : "") + formatMoney(credit.change))));
  item.appendChild(row);
  return item;
}

// The figures six months ahead (AHEAD_MONTHS)
const AHEAD_LABEL = `In ${AHEAD_MONTHS} Months`;

// Over the accounts: everything together, In Bank (the budget's own account) and every Equity account, today and in 6
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
// [time, duration, action, detail, detail, detail, detail, status, what it changed (for its Undo, see CHANGE LOG UNDO in
// Process Budget.js), who made it]. In a shared budget, each row's details say who made it.
function renderLogsPage(view) {
  renderSearchToolbar();
  // (Looking at them here sets Home's count of other devices' edits back to 0: markLogsSeen in Process Budget.js)
  markLogsSeen();
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

const LOG_COLUMNS = ["Time", "Took", { label: "Action", className: "actionHead" }, "Details", { label: "Undo", className: "undoHead" }];

// One Change Logs row (the page's table, and its Search results), with Undo at its right while its change can be taken
// back ("Undone" once it was)
function logRow(row) {
  const tr = document.createElement("tr");
  if (row[7] === "Error") tr.className = "errorRow";
  if (row[7] === "Not Found") tr.className = "notFoundRow";
  tr.appendChild(noTranslate(cell(row[0], "timeCell")));
  tr.appendChild(noTranslate(cell(String(row[1]).replace(" Seconds", "s"), "timeCell")));
  tr.appendChild(clippedCell(row[2], "actionCell"));
  const details = row.slice(3, 7).filter(detail => String(detail).trim() !== "");
  if (row[7]) details.push("Status: " + row[7]);
  if (row[9] && budgetIsShared()) details.push("By: " + row[9]);
  const detailsCell = cell("", "detailsCell");
  detailsCell.appendChild(aliasBox(details.join("\n"), "detailsBox"));
  tr.appendChild(noTranslate(detailsCell)); // Titles, amounts, and dates
  const undoCell = cell("", "undoCell");
  const record = logRecord(row);
  if (record && !record.undone) {
    const button = BudgetUI.element("button", "budgetButton logUndo", "Undo");
    button.type = "button";
    button.setAttribute("aria-label", `Undo ${String(row[2]).trim()} (${String(row[0]).trim()})`);
    button.addEventListener("click", () => undoFromLogs(row, record, button));
    undoCell.appendChild(button);
  } else if (record) {
    undoCell.appendChild(BudgetUI.element("span", "logUndone", "Undone"));
  }
  tr.appendChild(undoCell);
  return tr;
}

// A row's Undo was tapped: after asking, its change is taken back (and logged), or a note says why it can't be
async function undoFromLogs(row, record, button) {
  const what = `${String(row[2]).trim()} (${String(row[0]).trim()})`;
  if (!window.confirm(`Undo this change? ${what}`)) return;
  button.disabled = true;
  const result = await undoLogRow(record.id);
  if (button.isConnected) button.disabled = false;
  // (Its own row is written once the page has drawn the change, so it's drawn again to show it)
  renderCurrentPage();
  if (!result.ok) return BudgetUI.showToast(result.message || "That didn't work. Please try again.", true);
  if (result.saved === false) return BudgetUI.warnIfUnsaved(result);
  BudgetUI.showToast(`Undone: ${result.undoneLog}. It's in the Change Logs too, with an Undo of its own.`);
}

// Paycheck Calculator: the last calculation's results and how they add up, its crystals (see CRYSTALS AND GEMS), then the
// inputs (filled in with the last calculation's values) to calculate again. A form being typed in (or made into a
// crystal) stays as it is when the page draws again.
function renderCalculatorPage(view) {
  const typing = view.querySelector("form.calculatorForm[data-typing]");
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
  const form = typing || calculatorForm(inputs);
  view.append(crystalShelf(form), form);
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
    if (form.classList.contains("presetDraft")) return; // (Making a crystal: its own Save keeps it)
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
    delete form.dataset.typing; // (Calculated: the page draws the form again from what was saved)
    const result = await savePaycheck(values);
    button.disabled = false;
    if (!result.ok) {
      error.textContent = result.message || "That didn't work. Please try again.";
      error.hidden = false;
      return;
    }
    BudgetUI.warnIfUnsaved(result);
    // The page has redrawn with the new results; bring them into view
    const reducedMotion = window.lessMotion();
    document.querySelector(".paycheckResults")?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
  });
  return form;
}

// The Paycheck Calculator's boxes as they're filled in now: { box: number } for each one that isn't blank ("$25",
// "7.65%", and "1.5×" read as numbers), or { error } for one that isn't a number
function calculatorBoxes(form) {
  const values = {};
  for (const field of CALCULATOR_INPUTS) {
    const text = String(form.elements[field.key]?.value ?? "").replace(/%/g, "").replace(/[x×]\s*$/i, "").trim();
    if (!text) continue;
    const number = readMoneyInput(text);
    if (!Number.isFinite(number) || number < 0 || number > MAX_AMOUNT) return { error: `${field.label} needs to be a number (0 or more).` };
    values[field.key] = number;
  }
  return { values };
}

// The Paycheck Calculator's crystals, over its form
function crystalShelf(form) {
  const field = (key) => CALCULATOR_INPUTS.find(input => input.key === key);
  const shown = (key, value) => (field(key).unit.startsWith("$") ? formatMoney(value) : `${value}${field(key).unit === "%" ? "%" : field(key).unit === "×" ? "×" : ""}`);
  return presetShelf({
    store: "crystals",
    noun: "Crystal",
    form,
    help: [
      "Crystals are paychecks you calculate often, like a regular week and one with overtime, saved so you don't have to type them each time. A crystal keeps the boxes that are filled in when it's saved.",
      "Add Crystal turns the calculator into a new crystal: fill in only what it should keep (what's already filled in counts too), give it a name if you like, then tap Save Crystal.",
      "Tap a crystal to put what it keeps into the calculator, then fill in the rest, or just tap Calculate. Change any box, then tap Save Changes To it to keep the new boxes in that crystal.",
      "Edit Crystals lets you drag crystals into order by their ≡, or delete them with ×. They're saved with your budget, so every device has the same ones."
    ],
    read: () => calculatorBoxes(form),
    fill(values) {
      for (const [key, value] of Object.entries(values)) {
        const input = form.elements[key];
        if (!input || !field(key) || typeof value !== "number") continue;
        input.value = value ? (field(key).unit.startsWith("$") ? value.toFixed(2) : String(value)) : "";
      }
      form.dataset.typing = "1";
    },
    describe: (values) => Object.entries(values).filter(([key]) => field(key)).map(([key, value]) => `${field(key).label} ${shown(key, value)}`)
  });
}

// Accrual Calculator (menu/payments.html): how a balance changes with the same payment (or deposit) on a schedule and its
// interest, worked out like an Equity account's. For what's owed (a loan, a credit card): when it's paid off (payOff in
// Process Budget.js). For what's saved (a savings account, In Bank): what it grows to, and when it reaches a goal amount
// (growTo). Picking In Bank or an Equity account fills in what it holds, its interest, and which it is (below $0 is owed),
// works out its own pace from the budget (accountReach, inBankReach), and for an account lists its entries before and after
// today, each one tapped to change it. It's worked out again as anything is typed, and a change to the budget (another
// device's too) only works the account's part out again. Its boxes are kept as they're left (a moment after the typing
// stops: saveDebtFields), and start it the next time, and its gems fill them in (see CRYSTALS AND GEMS). Add To Goals
// opens a new goal on Bob's page that follows a gem: the one put in (while the boxes still match it), or a new one kept
// from the boxes first.
let paymentsPage = null; // { el, refresh } while the page shows

function renderPaymentsPage(view) {
  if (paymentsPage && view.contains(paymentsPage.el)) {
    paymentsPage.refresh();
    return;
  }
  paymentsPage = paymentCalculator();
  view.replaceChildren(paymentsPage.el);
}

// How often payments come (PAYMENT_FREQUENCIES in Process Budget.js)
const PAYMENT_CHOICES = [
  { value: "monthly", label: "Every month" },
  { value: "biweekly", label: "Every 2 weeks" },
  { value: "weekly", label: "Every week" }
];

// What the balance is: owed (it counts down to $0.00) or saved (it counts up)
const ACCRUAL_KINDS = [{ key: "owed", label: "Owed (a loan or card)" }, { key: "saved", label: "Saved (savings, In Bank)" }];
const GROW_YEARS = 5; // Without a goal amount, what's saved is worked out this far ahead

// Each kind's words for its boxes and results
const ACCRUAL_WORDS = {
  owed: {
    heading: "Paying It Off", amount: "Balance owed", payments: "Payments", payment: "Payment", first: "First payment",
    extra: "Extra each payment", extraHint: "What paying this much more each time does.",
    by: "Pay it off by", byHint: "The payment it takes to be done by then.",
    results: "When It's Paid Off", graph: "What's Owed Over Time"
  },
  saved: {
    heading: "Saving Up", amount: "Balance now", payments: "Deposits", payment: "Deposit", first: "First deposit",
    extra: "Extra each deposit", extraHint: "What putting this much more in each time does.",
    by: "Reach it by", byHint: "The deposit it takes to reach the goal amount by then.",
    results: "When It's Reached", graph: "The Balance Over Time"
  }
};

// A dollar box typed like a cash register. value(): the amount (0 for blank), NaN when it can't be read
function moneyField({ label, hint = "", optional = false }) {
  const box = BudgetUI.textField({ label, placeholder: "0.00", hint, optional });
  box.input.inputMode = "decimal";
  BudgetUI.cashRegister(box.input);
  return {
    el: box.el,
    value: () => (box.value() ? readMoneyInput(box.value()) : 0),
    set(amount) { box.input.value = amount > 0 ? amount.toFixed(2) : ""; }
  };
}

// "2 years, 3 months" from one day to another (whole months; "less than a month" under one)
function howLong(from, to) {
  let months = (to.getFullYear() - from.getFullYear()) * 12 + to.getMonth() - from.getMonth();
  if (to.getDate() < from.getDate()) months--;
  if (months < 1) return "less than a month";
  const years = Math.floor(months / 12);
  const parts = [years ? `${years} ${years === 1 ? "year" : "years"}` : "", months % 12 ? `${months % 12} ${months % 12 === 1 ? "month" : "months"}` : ""];
  return parts.filter(Boolean).join(", ");
}

// In Bank today, from the calendar
function inBankNow() {
  const spot = calendarSpot(today);
  return (spot && readInBank(calendarData[spot.r][spot.c])) ?? 0;
}

// Two sets of boxes keep the same thing (a gem from before the calculator did both is for what's owed)
function sameBoxes(a, b) {
  const tidy = (values) => {
    const all = { kind: gemSaves(values) ? "saved" : "owed", ...values };
    return JSON.stringify(Object.keys(all).sort().map(key => [key, all[key]]));
  };
  return tidy(a) === tidy(b);
}

// The Accrual Calculator's form, results, and (for In Bank or an Equity account) its own pace and entries: { el, refresh }
function paymentCalculator() {
  const el = BudgetUI.element("div", "paymentsPage");
  const form = BudgetUI.element("form", "budgetCard calculatorForm paymentsForm");
  form.noValidate = true;
  form.autocomplete = "off";
  form.addEventListener("submit", (event) => event.preventDefault());
  const heading = BudgetUI.element("h3", "", ACCRUAL_WORDS.owed.heading);
  form.appendChild(heading);

  let kind = "owed";
  const kindPicker = BudgetUI.segmented(ACCRUAL_KINDS, kind, (key) => {
    setKind(key);
    update();
    keepBoxes();
  });
  const kindField = BudgetUI.field("It's", kindPicker.el, { hint: "Owed counts down to $0.00 (paid off). Saved counts up, toward a goal amount if you give one." });
  const account = BudgetUI.selectField({ label: "Account", options: [], value: "", hint: "Pick In Bank or an Equity account to fill in what it holds and its interest, and to see its own pace below." });
  const owed = moneyField({ label: ACCRUAL_WORDS.owed.amount, hint: "What it holds today." }); // (The hint shows only for what's picked: showBalance)
  const target = moneyField({ label: "Goal amount", optional: true, hint: `What it should reach. Leave it blank to see what it grows to in 1 and ${GROW_YEARS} years.` });
  const rate = BudgetUI.textField({ label: "Interest rate (APR, % a year)", placeholder: "Like 6.5", optional: true });
  rate.input.inputMode = "decimal";
  const compound = BudgetUI.selectField({ label: "Compounds", options: COMPOUNDING_CHOICES, value: "monthly", hint: COMPOUNDING_HINT });
  const every = BudgetUI.selectField({ label: "Interest added", options: ADDED_CHOICES, value: 1 });
  const day = BudgetUI.selectField({ label: "On day", options: DAY_CHOICES, value: today.getDate(), hint: "The day of the month interest is added (a shorter month uses its last day)." });
  const payment = moneyField({ label: ACCRUAL_WORDS.owed.payment });
  const frequency = BudgetUI.selectField({ label: "Every", options: PAYMENT_CHOICES, value: "monthly" });
  const first = BudgetUI.dateField({ label: ACCRUAL_WORDS.owed.first, date: addMonths(today, 1) });
  const firstHint = first.el.querySelector(":scope > .panelHint")?.textContent || "";
  const extra = moneyField({ label: ACCRUAL_WORDS.owed.extra, optional: true, hint: ACCRUAL_WORDS.owed.extraHint });
  const payBy = BudgetUI.dateField({ label: ACCRUAL_WORDS.owed.by, optional: true, hint: ACCRUAL_WORDS.owed.byHint });
  const section = (title, fields) => {
    const set = BudgetUI.element("fieldset", "calculatorSection");
    const legend = BudgetUI.element("legend", "", title);
    set.append(legend, ...fields);
    return { el: set, legend };
  };
  const balanceSection = section("The Balance", [kindField, account.el, owed.el, target.el, rate.el, compound.el, every.el, day.el]);
  const paymentSection = section(ACCRUAL_WORDS.owed.payments, [payment.el, frequency.el, first.el, extra.el, payBy.el]);
  form.append(balanceSection.el, paymentSection.el);

  const results = BudgetUI.element("section", "budgetCard paymentsResults");
  results.setAttribute("aria-live", "polite");
  const pace = BudgetUI.element("section", "budgetCard paymentsAccount");
  pace.hidden = true;
  // The balance after each payment, as what's typed comes to (with what paying extra does, when that's typed)
  let payoffLines = [];
  const graph = LineGraph.create({
    label: ACCRUAL_WORDS.owed.graph,
    level: 2,
    pickDay: false,
    dashAhead: false,
    from: () => addDays(today, -1),
    series: () => payoffLines,
    emptyNote: "Type the balance and the payment (or deposit), and how it changes with each one shows here."
  });
  const graphCard = BudgetUI.element("section", "budgetCard paymentsGraph");
  graphCard.setAttribute("aria-label", ACCRUAL_WORDS.owed.graph);
  graphCard.append(graph.el);
  const gems = presetShelf({
    store: "gems",
    noun: "Gem",
    form,
    help: [
      "Gems are balances you look at often, like a car loan, a credit card's payoff, or savings for a trip, saved so you don't have to type them each time. A gem keeps the boxes that are filled in when it's saved (never the days).",
      "Add Gem turns the calculator into a new gem: fill in only what it should keep (what's already filled in counts too), give it a name if you like, then tap Save Gem. With In Bank or an Equity account picked, it keeps that, and its balance and interest come from it each time.",
      "Tap a gem to put what it keeps into the calculator. Change any box, then tap Save Changes To it to keep the new boxes in that gem (a goal following it changes too).",
      "Edit Gems lets you drag gems into order by their ≡, or delete them with ×. They're saved with your budget, so every device has the same ones.",
      "A goal on Bob's page can follow a gem: Add To Goals, under the results, starts one."
    ],
    read: () => ({ values: debtBoxes(true) }),
    fill: (values) => fillDebt(values),
    describe: describeDebt
  });
  el.append(graphCard, gems, form, results, pace);

  // What's picked: In Bank, an Equity account ({ summary, name, balance, interest }), or null for none
  const pickedSource = () => {
    if (account.input.value === "inBank") return { inBank: true, name: "In Bank", balance: inBankNow(), interest: null };
    const summary = accountSummaries().find(item => String(item.index) === account.input.value);
    return summary ? { summary, name: summary.name, balance: summary.today, interest: summary.interest } : null;
  };

  // In Bank and the Equity accounts to pick from, each with what it holds today (the one picked stays picked while it's there)
  const fillAccounts = () => {
    const picked = account.input.value;
    const choices = [{ value: "", label: "None (type it in)" }, { value: "inBank", label: `In Bank (${formatMoney(inBankNow())})` }, ...accountSummaries().map(summary => {
      const max = accountMax(accountsData.list[summary.index]);
      return { value: String(summary.index), label: `${summary.name} (${formatMoney(summary.today)}${max ? `/${formatMoney(max)}` : ""})` };
    })];
    account.input.replaceChildren(...choices.map(choice => {
      const option = BudgetUI.element("option", "", choice.label);
      option.value = choice.value;
      return option;
    }));
    account.input.value = choices.some(choice => choice.value === picked) ? picked : "";
  };
  // The budget ahead (projectBudget) and the picked account's entries (paymentsEntries), worked out again only when
  // another one is picked or the budget changes, not as the rest is typed
  let projection = null;
  let entries = null;

  // Owed or saved: the boxes' words, and the Goal amount box (only for what's saved)
  function setKind(next) {
    kind = next === "saved" ? "saved" : "owed";
    kindPicker.set(kind);
    const words = ACCRUAL_WORDS[kind];
    heading.textContent = words.heading;
    paymentSection.legend.textContent = words.payments;
    showBalance();
    relabel(payment.el, words.payment, "");
    relabel(first.el, words.first, firstHint);
    relabel(extra.el, words.extra, words.extraHint);
    relabel(payBy.el, words.by, words.byHint);
    target.el.hidden = kind !== "saved";
    graph.el.querySelector(".lineGraphTitle").textContent = words.graph;
    graphCard.setAttribute("aria-label", words.graph);
  }

  // The balance box: typed in, or with In Bank or an account picked, what that holds today, as owed or saved counts it (a
  // balance below $0 picked as saved starts there; one above it picked as owed has nothing owed), which can't be typed over
  const balanceInput = owed.el.querySelector("input");
  function showBalance() {
    const source = pickedSource();
    const words = ACCRUAL_WORDS[kind];
    balanceInput.disabled = !!source;
    if (!source) return relabel(owed.el, words.amount, "");
    const value = kind === "saved" ? source.balance : -source.balance;
    balanceInput.value = value.toFixed(2);
    const why = value >= 0 ? "" : kind === "saved" ? ": it's below $0, so it starts there" : ": it isn't below $0, so nothing is owed";
    relabel(owed.el, words.amount, `What ${source.name} holds today${why}.`);
  }

  // One picked: what it holds, its interest, and which it is (below $0 is owed) go in the boxes
  account.input.addEventListener("change", () => {
    const source = pickedSource();
    if (!source) showBalance();
    if (source) {
      setKind(source.balance < 0 ? "owed" : "saved");
      rate.input.value = source.interest ? String(source.interest.rate) : "";
      compound.input.value = source.interest ? source.interest.compound : "monthly";
      every.input.value = String(source.interest ? source.interest.every : 1);
      day.input.value = String(source.interest ? source.interest.day : today.getDate());
    }
    projection = null;
  });

  // What's typed: { problem } when something can't be read, or { kind, options (see payOff and growTo), extra, payBy }
  const read = () => {
    const source = pickedSource();
    const amount = source ? (kind === "saved" ? source.balance : -source.balance) : owed.value();
    const paymentAmount = payment.value();
    const extraAmount = extra.value();
    const goal = kind === "saved" ? target.value() : 0;
    const rateText = rate.value().replace(/%/g, "");
    const rateNumber = rateText ? readMoneyInput(rateText) : 0;
    const firstDay = first.value();
    const byDay = payBy.value();
    // (What's picked can be below $0; a typed balance can't)
    if (![paymentAmount, extraAmount, goal, ...(source ? [] : [amount])].every(value => Number.isFinite(value) && value >= 0 && value <= MAX_AMOUNT)) return { problem: "Amounts are typed like 250.00 (up to $1,000,000,000)." };
    if (!Number.isFinite(rateNumber) || rateNumber < 0 || rateNumber > MAX_INTEREST_RATE) return { problem: `Enter the interest rate for a year, like 6.5 (up to ${MAX_INTEREST_RATE}).` };
    if (!(firstDay instanceof Date) || firstDay < today) return { problem: `Enter the first ${kind === "saved" ? "deposit" : "payment"}'s day, today or later (${datePattern()}).` };
    if (byDay === undefined) return { problem: `That ${ACCRUAL_WORDS[kind].by} date isn't a real day. Use ${datePattern()}.` };
    const interest = rateNumber > 0 ? { rate: rateNumber, compound: compound.value(), every: Number(every.value()), day: Number(day.value()) } : null;
    const common = { interest, payment: paymentAmount, frequency: frequency.value(), first: firstDay, from: today };
    const options = kind === "saved" ? { ...common, balance: amount, target: goal > 0 ? goal : null } : { ...common, owed: amount };
    return { kind, options, extra: extraAmount, payBy: byDay, picked: source ? source.name : "" };
  };

  // The results: when it's paid off (or reached, or what it grows to), the interest, what paying extra does, the payment to
  // be done by a day, and each payment; then Add To Goals
  const line = (text, className = "") => BudgetUI.element("p", `paymentsLine ${className}`.trim(), text);
  const showResults = (typed) => {
    results.replaceChildren(BudgetUI.element("h3", "", !typed.problem && typed.kind === "saved" && typed.options.target === null ? "What It Grows To" : ACCRUAL_WORDS[kind].results));
    payoffLines = [];
    if (typed.problem) return results.append(line(typed.problem, "negative"));
    if (typed.kind === "saved") showSaved(typed);
    else showOwed(typed);
    results.append(BudgetUI.element("p", "panelHint", "An estimate from what's typed here: a bank's or lender's own figures can differ (its fees, how it counts days, and rounding)."));
    const goalButton = BudgetUI.element("button", "budgetButton paymentsGoal", "Add To Goals");
    goalButton.type = "button";
    goalButton.addEventListener("click", () => addToGoals(goalButton));
    const goalRow = BudgetUI.element("div", "panelButtons");
    goalRow.append(goalButton);
    results.append(goalRow, BudgetUI.element("p", "panelHint", "Add To Goals starts a goal on Bob's page that follows these boxes as a gem (kept as a new one first, unless they're a gem's already)."));
  };

  // What's owed: when it's paid off, and the rest
  const showOwed = (typed) => {
    const { options, extra: extraAmount, payBy: byDay } = typed;
    if (options.owed <= 0) return results.append(line(typed.picked ? `${typed.picked} isn't below $0 today, so there's nothing to pay off. Pick Saved to see what it grows to.` : "Type what's owed, or pick In Bank or an Equity account that's below $0."));
    if (options.payment <= 0 && !byDay) return results.append(line("Type the payment, or a day to pay it off by."));
    let shown = null;
    if (options.payment > 0) {
      const base = payOff(options);
      results.append(line(describePayoff(base, options)));
      shown = base;
      if (extraAmount > 0) {
        const withExtra = { ...options, payment: options.payment + extraAmount };
        const more = payOff(withExtra);
        if (more.paidOff) {
          const fewer = base.schedule.length - more.schedule.length;
          const saved = formatMoney(Math.max(0, base.interest - more.interest));
          const sooner = !base.paidOff ? "" : fewer > 0 ? `, with ${fewer} fewer ${fewer === 1 ? "payment" : "payments"} and ${saved} less interest` : `, with ${saved} less interest`;
          results.append(line(`With ${formatMoney(extraAmount)} more each payment: paid off on ${showDate(more.paidOff)}${sooner}.`, "positive"));
        } else {
          results.append(line(`With ${formatMoney(extraAmount)} more each payment: ${describePayoff(more, withExtra)}`));
        }
        shown = more;
      }
    }
    if (byDay) {
      const needed = paymentToPayOffBy(options, byDay);
      const why = byDay < options.first
        ? "pick a day on or after the first payment"
        : byDay > addMonths(options.from, PAYOFF_YEARS * 12) ? `pick a day within ${PAYOFF_YEARS} years` : "its interest adds up faster than any payment pays";
      results.append(line(needed === null ? `It can't be paid off by ${showDate(byDay)}: ${why}.` : `To be done by ${showDate(byDay)}: ${formatMoney(needed)} each payment.`));
    }
    if (shown && shown.schedule.length > 0) results.append(scheduleTable(shown.schedule, extraAmount > 0, "owed"));
    // (Today's balance first, then what's left after each payment)
    const owedLine = (name, schedule) => ({ name, points: [{ date: options.from, value: options.owed }, ...schedule.map(row => ({ date: row.date, value: row.owed }))] });
    if (options.payment > 0) {
      const base = payOff(options);
      payoffLines = [owedLine(extraAmount > 0 ? "As it is" : "Owed", base.schedule)];
      if (extraAmount > 0) payoffLines.push(owedLine("With the extra", payOff({ ...options, payment: options.payment + extraAmount }).schedule));
    }
  };

  // What's saved: when it reaches the goal amount (or without one, what it grows to), and the rest
  const showSaved = (typed) => {
    const { options, extra: extraAmount, payBy: byDay } = typed;
    const goal = options.target;
    if (options.payment <= 0 && !options.interest && !(byDay && goal !== null)) return results.append(line("Type the deposit (or the interest it earns), or a goal amount and a day to reach it by."));
    if (goal !== null && options.balance >= goal) {
      results.append(line(`It has ${formatMoney(options.balance)}: it's at the goal of ${formatMoney(goal)} already.`, "positive"));
    }
    // The way it goes with a deposit: to the goal amount, or without one, through GROW_YEARS
    const runWith = (deposit) => growTo(goal !== null ? { ...options, payment: deposit } : { ...options, payment: deposit, target: null, until: addMonths(today, 12 * GROW_YEARS) });
    let base = null;
    let more = null;
    if (goal === null || options.balance < goal) {
      base = runWith(options.payment);
      more = extraAmount > 0 ? runWith(options.payment + extraAmount) : null;
    }
    if (goal !== null && base) {
      results.append(line(describeGrowth(base, options)));
      if (more) {
        const deposits = (result) => result.schedule.filter(row => row.payment > 0).length;
        const fewer = base.reached && more.reached ? deposits(base) - deposits(more) : 0;
        results.append(more.reached
          ? line(`With ${formatMoney(extraAmount)} more each deposit: reaches it on ${showDate(more.reached)}${base.reached && more.reached < base.reached ? `, ${howLong(more.reached, base.reached)} sooner` : ""}${fewer > 0 ? `, with ${fewer} fewer ${fewer === 1 ? "deposit" : "deposits"}` : ""}.`, "positive")
          : line(`With ${formatMoney(extraAmount)} more each deposit: ${describeGrowth(more, { ...options, payment: options.payment + extraAmount })}`));
      }
    } else if (goal === null) {
      for (const years of [1, GROW_YEARS]) {
        const until = addMonths(today, 12 * years);
        const grown = growTo({ ...options, target: null, until });
        results.append(line(`In ${years} ${years === 1 ? "year" : "years"} (${showDate(until)}): ${formatMoney(grown.balance)}, with ${formatMoney(grown.paid)} put in and ${formatMoney(grown.interest)} in interest.`));
        if (extraAmount > 0) results.append(line(`With ${formatMoney(extraAmount)} more each deposit: ${formatMoney(growTo({ ...options, payment: options.payment + extraAmount, target: null, until }).balance)}.`, "positive"));
      }
    }
    if (byDay) {
      if (goal === null) results.append(line(`Type a goal amount to work out the deposit it takes to reach it by ${showDate(byDay)}.`));
      else if (options.balance < goal) {
        const needed = paymentToReachBy(options, byDay);
        const why = byDay < options.first
          ? "pick a day on or after the first deposit"
          : byDay > addMonths(options.from, PAYOFF_YEARS * 12) ? `pick a day within ${PAYOFF_YEARS} years` : "it would take more than $1,000,000,000 each deposit";
        results.append(line(needed === null ? `It can't reach ${formatMoney(goal)} by ${showDate(byDay)}: ${why}.`
          : needed === 0 ? `It reaches ${formatMoney(goal)} by ${showDate(byDay)} from its interest alone.`
            : `To reach ${formatMoney(goal)} by ${showDate(byDay)}: ${formatMoney(needed)} each deposit.`));
      }
    }
    const shown = more || base;
    if (shown && shown.schedule.length > 0) results.append(scheduleTable(shown.schedule, !!more, "saved"));
    // (Today's balance first, then the balance after each deposit)
    const balanceLine = (name, result) => ({ name, points: [{ date: options.from, value: options.balance }, ...result.schedule.map(row => ({ date: row.date, value: row.balance }))] });
    if (base) {
      payoffLines = [balanceLine(more ? "As it is" : "Balance", base)];
      if (more) payoffLines.push(balanceLine("With the extra", more));
    }
  };

  // In Bank's or an Equity account's own pace, with the budget's entries still to come, and an account's entries before and
  // after today (the list stays put as the rest is typed, so it keeps its place)
  const paceText = BudgetUI.element("div", "paymentsPace");
  pace.append(paceText);
  const showPace = (typed) => {
    const source = pickedSource();
    pace.hidden = !source;
    if (!source) return;
    if (!projection) {
      projection = projectBudget(addMonths(today, 12 * ACCOUNT_PAYOFF_YEARS));
      entries?.remove();
      entries = source.summary ? paymentsEntries(source.summary, projection) : null;
      if (entries) pace.append(entries);
    }
    const options = typed.problem ? null : typed.options;
    const extraAmount = typed.problem ? 0 : typed.extra;
    const saving = kind === "saved";
    const name = source.name;
    paceText.replaceChildren(BudgetUI.element("h3", "", `${name} At Your Budget's Pace`));
    const how = options ? { extra: extraAmount, frequency: options.frequency, first: options.first } : {};
    const goal = saving ? options?.target ?? null : 0;
    if (saving && goal === null) {
      const yearOut = addMonths(today, 12);
      const then = source.summary ? projection.accountOn(source.summary.index, yearOut) : projection.inBankOn(yearOut);
      paceText.append(line(`${name} has ${formatMoney(source.balance)} today, and with its own entries and the ones your budget has coming, ${formatMoney(then)} on ${showDate(yearOut)}. Type a goal amount to see when it gets there.`));
      return;
    }
    const result = source.summary ? accountReach(source.summary.index, projection, { target: goal, ...how }) : inBankReach(projection, { target: goal, ...how });
    if (!result) return;
    const fromNow = (reached) => `${showDate(reached)} (in ${howLong(today, reached)})`;
    if (saving) {
      if (result.start >= goal) return paceText.append(line(`${name} has ${formatMoney(result.start)} today: it's at ${formatMoney(goal)} already.`));
      const earned = (interest) => (interest > 0 ? `, with ${formatMoney(interest)} in interest from today` : "");
      paceText.append(line(result.now.reached
        ? `${name} has ${formatMoney(result.start)} today. With its own entries and the ones your budget has coming, it reaches ${formatMoney(goal)} on ${fromNow(result.now.reached)}${earned(result.now.interest)}.`
        : `${name} has ${formatMoney(result.start)} today, and with its own entries and the ones your budget has coming, it doesn't reach ${formatMoney(goal)} within ${ACCOUNT_PAYOFF_YEARS} years.`));
      if (result.withExtra) {
        paceText.append(line(result.withExtra.reached
          ? `With ${formatMoney(extraAmount)} more each deposit (from the first deposit's day): it reaches it on ${showDate(result.withExtra.reached)}${result.now.reached ? `, ${howLong(result.withExtra.reached, result.now.reached)} sooner` : ""}.`
          : `With ${formatMoney(extraAmount)} more each deposit, it still doesn't reach it within ${ACCOUNT_PAYOFF_YEARS} years.`, "positive"));
      }
      return;
    }
    if (result.start >= 0) return paceText.append(line(`${name} isn't below $0 today, so there's nothing to pay off.`));
    const owes = source.inBank ? `In Bank is ${formatMoney(result.start)} today` : `${name} owes ${formatMoney(-result.start)} today`;
    paceText.append(line(result.now.reached
      ? `${owes}. With its own entries and the ones your budget has coming (like a recurring payment), it's back to $0 on ${fromNow(result.now.reached)}${source.inBank ? "" : `, with ${formatMoney(-result.now.interest)} in interest from today`}.`
      : `${owes}, and with its own entries and the ones your budget has coming, it isn't back to $0 within ${ACCOUNT_PAYOFF_YEARS} years.`));
    if (result.withExtra) {
      paceText.append(line(result.withExtra.reached
        ? `With ${formatMoney(extraAmount)} more each payment (from the first payment's day): back to $0 on ${showDate(result.withExtra.reached)}${result.now.reached ? `, ${howLong(result.withExtra.reached, result.now.reached)} sooner` : ""}${source.inBank ? "" : `, with ${formatMoney(Math.max(0, result.withExtra.interest - result.now.interest))} less interest`}.`
        : `With ${formatMoney(extraAmount)} more each payment, it still isn't back to $0 within ${ACCOUNT_PAYOFF_YEARS} years.`, "positive"));
    }
  };

  let pending = 0;
  const update = () => {
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(() => {
      const typed = read();
      showResults(typed);
      showPace(typed);
      graph.draw();
    });
  };
  // The boxes as they are now: { box: value }, with whether it's owed or saved (kind), and with In Bank or an Equity account
  // picked, that (inBank, or the account) instead of its balance (and an account's interest: they come from it each time).
  // For a gem (forGem), only the ones filled in, and never the days; otherwise (to start the calculator next time) every
  // box, days too.
  function debtBoxes(forGem = false) {
    const values = { kind };
    const source = pickedSource();
    if (source?.inBank) values.inBank = 1;
    else if (source) values.account = source.name;
    const rateText = rate.value().replace(/%/g, "");
    const rateNumber = rateText ? readMoneyInput(rateText) : NaN;
    if (!source && owed.value() > 0) values[kind === "saved" ? "balance" : "owed"] = owed.value();
    if (!source?.summary) {
      if (Number.isFinite(rateNumber) && rateNumber > 0) values.rate = rateNumber;
      if (!forGem || values.rate) Object.assign(values, { compound: compound.value(), every: Number(every.value()), day: Number(day.value()) });
    }
    if (kind === "saved" && target.value() > 0) values.target = target.value();
    if (payment.value() > 0) values.payment = payment.value();
    if (!forGem || values.payment) values.frequency = frequency.value();
    if (extra.value() > 0) values.extra = extra.value();
    if (!forGem) {
      const firstDay = first.value();
      const byDay = payBy.value();
      if (firstDay instanceof Date) values.first = formatToMMDDYYYY(firstDay);
      if (byDay instanceof Date) values.payBy = formatToMMDDYYYY(byDay);
    }
    return values;
  }

  // Put boxes in (a gem's, or the ones kept from last time): In Bank or an account picked fills in what it holds and its
  // interest, like picking it does; then owed or saved, as they say (a gem from before the calculator did both is for
  // what's owed, unless its account is above $0); a day that's passed is left as it is
  function fillDebt(values) {
    const choose = (select, value, choices) => {
      if (choices.some(choice => String(choice.value) === String(value))) select.input.value = String(value);
    };
    if (values.inBank) {
      account.input.value = "inBank";
      account.input.dispatchEvent(new Event("change", { bubbles: true }));
    } else if (typeof values.account === "string") {
      const summary = accountSummaries().find(item => cleanString(item.name) === cleanString(values.account));
      if (summary) {
        account.input.value = String(summary.index);
        account.input.dispatchEvent(new Event("change", { bubbles: true }));
      } else {
        BudgetUI.showToast(`${values.account} isn't one of your Equity accounts anymore, so pick one, or type the balance.`, true);
      }
    } else if ("owed" in values || "balance" in values) {
      account.input.value = "";
    }
    if (values.kind === "saved" || values.kind === "owed") setKind(values.kind);
    else if (!pickedSource()) setKind(typeof values.balance === "number" ? "saved" : "owed");
    if (typeof values.owed === "number") owed.set(values.owed);
    if (typeof values.balance === "number") owed.set(values.balance);
    if (typeof values.target === "number") target.set(values.target);
    if (typeof values.rate === "number") rate.input.value = String(values.rate);
    choose(compound, values.compound, COMPOUNDING_CHOICES);
    choose(every, values.every, ADDED_CHOICES);
    choose(day, values.day, DAY_CHOICES);
    if (typeof values.payment === "number") payment.set(values.payment);
    choose(frequency, values.frequency, PAYMENT_CHOICES);
    if (typeof values.extra === "number") extra.set(values.extra);
    for (const [key, box] of [["first", first], ["payBy", payBy]]) {
      const date = typeof values[key] === "string" ? createSafeMidnight(values[key], true) : null;
      if (date && !isNaN(date.getTime()) && date >= today) box.input.value = showDate(date);
    }
    projection = null;
    update();
  }

  // The boxes are kept a moment after they stop changing (when they changed), and start it the next time
  let kept = JSON.stringify(calculatorStore("debt"));
  let keeping = 0;
  const keepNow = async () => {
    clearTimeout(keeping);
    if (form.classList.contains("presetDraft")) return;
    const values = debtBoxes();
    if (JSON.stringify(values) === kept) return;
    kept = JSON.stringify(values);
    const result = await saveDebtFields(values);
    if (!result.ok) kept = null;
  };
  const keepBoxes = () => {
    clearTimeout(keeping);
    keeping = setTimeout(keepNow, DEBT_KEEP_MS);
  };

  // Add To Goals: Bob's page, with a new goal following the gem these boxes are (or, kept as a new gem first, after asking
  // for its name), and the Pay it off by (or Reach it by) day as the goal's day
  const openGoalFor = async (id) => {
    await keepNow();
    const by = payBy.value();
    const url = `/menu/bob.html?goalGem=${encodeURIComponent(id)}${by instanceof Date ? `&by=${formatToYMD(by)}` : ""}#goalsCard`;
    if (typeof window.transitionTo === "function") window.transitionTo(url);
    else location.href = url;
  };
  function addToGoals(origin) {
    const values = debtBoxes(true);
    const match = calculatorStore("gems").find(gem => sameBoxes(gem.values, values));
    if (match) return openGoalFor(match.id);
    BudgetUI.openPanel({
      origin,
      size: "small",
      title: "Keep It As A Gem",
      build(panelForm, panel) {
        const name = BudgetUI.textField({ label: "Name", placeholder: "Car loan, trip savings...", optional: true, maxLength: MAX_PRESET_NAME });
        panelForm.append(BudgetUI.element("p", "panelHint", "A goal follows a gem, so these boxes are kept as a new gem first (with your gems, over the calculator). Then the goal opens on Bob's page."),
          name.el, BudgetUI.buttonRow([{ label: "Save Gem And Add Goal", kind: "primary", type: "submit" }, { label: "Cancel", onClick: () => panel.close() }]));
        panelForm.addEventListener("submit", async (event) => {
          event.preventDefault();
          const saved = calculatorStore("gems");
          if (saved.length >= MAX_PRESETS) return panel.setError(`You can have up to ${MAX_PRESETS} gems. Delete one in Edit Gems first.`);
          const result = await BudgetUI.submit(panel, () => saveCalculatorPresets("gems", [...saved, { name: name.value(), values }]));
          if (!result.ok) return;
          gems.refresh();
          const made = calculatorStore("gems").at(-1);
          if (made) openGoalFor(made.id);
        });
      }
    });
  }

  form.addEventListener("input", update);
  form.addEventListener("change", update);
  form.addEventListener("input", keepBoxes);
  form.addEventListener("change", keepBoxes);
  fillAccounts();
  setKind(kind);
  const last = calculatorStore("debt");
  if (last) fillDebt(last);
  update();
  return {
    el,
    refresh() {
      fillAccounts();
      showBalance();
      gems.refresh();
      projection = null;
      update();
    }
  };
}

// How long the Accrual Calculator's boxes stay as they are before they're kept
const DEBT_KEEP_MS = 2500;

// What a gem keeps, in words, for one without a name: ["Car Loan", "Owed $12000.00", "Payment $350.00"], or ["Savings",
// "Goal $5000.00", "Deposit $200.00"]
function describeDebt(values) {
  const words = [];
  const saves = gemSaves(values);
  if (values.inBank) words.push("In Bank");
  else if (values.account) words.push(values.account);
  if (typeof values.owed === "number") words.push(`Owed ${formatMoney(values.owed)}`);
  if (typeof values.balance === "number") words.push(`Balance ${formatMoney(values.balance)}`);
  if (typeof values.target === "number") words.push(`Goal ${formatMoney(values.target)}`);
  if (typeof values.rate === "number") words.push(`${values.rate}% APR`);
  if (typeof values.payment === "number") words.push(`${saves ? "Deposit" : "Payment"} ${formatMoney(values.payment)}`);
  if (typeof values.extra === "number") words.push(`Extra ${formatMoney(values.extra)}`);
  return words;
}

// Reaching a goal amount in words: "Reaches $5000.00 on 03/01/2028: 16 deposits (1 year, 4 months), $123.45 in interest,
// $3,200.00 put in."
function describeGrowth(result, options) {
  const deposits = result.schedule.filter(row => row.payment > 0).length;
  if (result.reached) {
    return deposits === 0
      ? `Reaches ${formatMoney(options.target)} on ${showDate(result.reached)} (${howLong(today, result.reached)}) from its interest alone: ${formatMoney(result.interest)} of it.`
      : `Reaches ${formatMoney(options.target)} on ${showDate(result.reached)}: ${deposits} ${deposits === 1 ? "deposit" : "deposits"} (${howLong(today, result.reached)}), ${formatMoney(result.interest)} in interest, ${formatMoney(result.paid)} put in.`;
  }
  return options.payment > 0 ? `It doesn't reach ${formatMoney(options.target)} within ${PAYOFF_YEARS} years.` : `Its interest alone doesn't get it to ${formatMoney(options.target)} within ${PAYOFF_YEARS} years: type a deposit.`;
}

// A payoff in words: "Paid off on 03/01/2029: 28 payments (2 years, 4 months), $812.40 in interest, $10,812.40 paid in
// all."
function describePayoff(result, options) {
  if (result.paidOff) {
    return `Paid off on ${showDate(result.paidOff)}: ${result.schedule.length} ${result.schedule.length === 1 ? "payment" : "payments"} (${howLong(today, result.paidOff)}), ${formatMoney(result.interest)} in interest, ${formatMoney(result.paid)} paid in all.`;
  }
  const last = result.schedule.at(-1);
  if (last && last.owed >= options.owed) return `${formatMoney(options.payment)} each payment never pays it off: the interest it adds is as much or more.`;
  return `It isn't paid off within ${PAYOFF_YEARS} years.`;
}

// Each payment, in a box that scrolls: its day, the payment, the interest since the one before, and what's owed after
// it (kind "saved": each deposit, the interest earned since the one before, and the balance after it)
function scheduleTable(schedule, withExtra, kind = "owed") {
  const saved = kind === "saved";
  const table = createDataTable(saved ? ["Date", "Deposit", "Interest", "Balance After"] : ["Date", "Payment", "Interest", "Owed After"]);
  table.classList.add("scheduleTable");
  const fragment = document.createDocumentFragment();
  for (const row of schedule) {
    const tr = document.createElement("tr");
    tr.append(noTranslate(cell(showDate(row.date), "dateCell")), noTranslate(cell(formatMoney(row.payment), "amountCell")), noTranslate(cell(formatMoney(row.interest), "amountCell")), noTranslate(cell(formatMoney(saved ? row.balance : row.owed), "amountCell")));
    fragment.appendChild(tr);
  }
  table.tBodies[0].appendChild(fragment);
  const box = BudgetUI.element("div", "paymentsSchedule");
  box.appendChild(table);
  const title = saved ? "Each Deposit" : "Each Payment";
  return BudgetUI.field(withExtra ? `${title} (with the extra)` : title, box);
}

// An account's entries for the Accrual Calculator, in a box that scrolls: the ones coming up (soonest first: on the
// calendar, in Upcoming, and the budget's still to come for a year, with its interest), then today and before (newest
// first). Each one opens its options when tapped, like in the account's own window.
function paymentsEntries(summary, projection) {
  const yearOut = addMonths(today, 12);
  const parts = projection.accountParts(summary.index);
  const known = accountEntryLines(summary.index);
  // (Upcoming's entries are in both: the budget's own are kept)
  const sameEntry = (date, change, title) => `${date.getTime()}|${change}|${cleanString(title)}`;
  const listed = new Set(known.map(entry => sameEntry(entry.date, entry.change, readLine(entry.line).title)));
  const projected = (parts ? parts.entries : []).filter(entry => entry.coming && entry.date <= yearOut && !listed.has(sameEntry(entry.date, entry.change, entry.title)));
  const coming = projected.map(entry => ({
    date: entry.date,
    line: `${entry.sprite} ${formatMoney(entry.amount ?? accountChange(entry.sprite, entry.change))} ${entry.title}`,
    change: entry.change,
    place: "upcoming"
  }));
  const extras = accountExtras(parts, yearOut);
  const interest = extras.credits.map(credit => ({ ...credit, interest: true }));
  const escrow = extras.escrow.map(paid => ({ ...paid, escrow: true }));
  const all = [...known, ...coming, ...interest, ...escrow];
  const ahead = all.filter(entry => entry.date > today).sort((a, b) => a.date - b.date);
  const before = all.filter(entry => entry.date <= today).sort((a, b) => b.date - a.date);
  const list = BudgetUI.element("ul", "accountEntries");
  const heading = (text) => BudgetUI.element("li", "accountEntriesHeading", text);
  const row = (entry) => (entry.interest || entry.escrow ? accountInterestRow(entry) : accountEntryRow(entry));
  if (ahead.length) list.append(heading("Coming up"), ...ahead.map(row));
  if (before.length) list.append(heading("Today and before"), ...before.map(row));
  if (!ahead.length && !before.length) list.append(heading("No entries yet."));
  return BudgetUI.field("Its Entries", list, { hint: "Tap one to change it. At the right: what it put in or took out." });
}

//#endregion

// =====================================================================
// #region CRYSTALS AND GEMS (presets for the calculators' boxes)
// =====================================================================
// A calculator's presets, like Quick Budget's prisms are for its form: the Paycheck Calculator's crystals and the Accrual
// Calculator's gems (kept in the calculator table, see CALCULATOR_STORES in Process Budget.js). Each keeps the boxes that
// were filled in when it was saved, and a name if it was given one, and tapping it puts those in (the rest stay as they
// are, and nothing is worked out or saved until it's calculated). Add turns the calculator into a new one (it glows, and
// what's filled in already counts), and Save keeps it; once one's been put in, Save Changes To it keeps the boxes as they
// are now in it (its id and name stay, so a goal following a gem follows the change); Edit drags them into order (≡) and
// deletes them (×).

const presetEditing = { crystals: false, gems: false }; // Edit is on (kept while the page draws again)

// store: "crystals" or "gems"; noun: "Crystal" or "Gem"; form: the calculator's form (it glows while one is being made);
// help: the lines its ? shows; read(): { values } (the boxes filled in now) or { error }; fill(values): puts a preset's
// boxes in; describe(values): words for each box it keeps, for one without a name. Returns the shelf (a card) with
// refresh() (its presets as the budget has them now).
function presetShelf({ store, noun, form, help, read, fill, describe }) {
  const plural = `${noun}s`;
  const shelf = BudgetUI.element("section", "budgetCard presetShelf");
  shelf.setAttribute("aria-label", plural);
  const title = BudgetUI.element("h3", "", plural);
  const add = BudgetUI.element("button", "budgetButton primary", `Add ${noun}`);
  add.type = "button";
  const helpBox = BudgetUI.element("div", "fieldHelp prismHelp");
  helpBox.id = `${store}Help`;
  helpBox.hidden = true;
  const helpList = BudgetUI.element("ul");
  helpList.append(...help.map(line => BudgetUI.element("li", "", line)));
  helpBox.append(helpList);
  const helpButton = BudgetUI.element("button", "fieldHelpButton", "?");
  helpButton.type = "button";
  helpButton.title = `What are ${plural.toLowerCase()}?`;
  helpButton.setAttribute("aria-label", helpButton.title);
  helpButton.setAttribute("aria-controls", helpBox.id);
  helpButton.setAttribute("aria-expanded", "false");
  helpButton.addEventListener("click", () => {
    helpBox.hidden = !helpBox.hidden;
    helpButton.setAttribute("aria-expanded", String(!helpBox.hidden));
  });
  const edit = BudgetUI.element("button", "budgetButton presetEdit", `Edit ${plural}`);
  edit.type = "button";
  // Save Changes To (the one put in last), shown once one's been put in
  const change = BudgetUI.element("button", "budgetButton presetChange");
  change.type = "button";
  change.hidden = true;
  let applied = null; // The id of the one put in last
  const toolbar = BudgetUI.element("div", "prismToolbar");
  toolbar.append(add, helpButton, change, edit);

  // Making one: its name, what to do, and Save or Cancel (the form glows meanwhile)
  const draft = BudgetUI.element("div", "presetDraftBox");
  draft.hidden = true;
  const name = BudgetUI.textField({ label: "Name", placeholder: noun === "Crystal" ? "Regular week, overtime week..." : "Car loan, card payoff...", optional: true, maxLength: MAX_PRESET_NAME });
  const error = BudgetUI.element("p", "panelError");
  error.hidden = true;
  draft.append(name.el, BudgetUI.element("p", "panelHint", `Fill in only the boxes this ${noun.toLowerCase()} should keep, then tap Save ${noun}.`), error,
    BudgetUI.buttonRow([{ label: `Save ${noun}`, kind: "primary", onClick: () => saveDraft() }, { label: "Cancel", onClick: () => endDraft() }]));
  const list = BudgetUI.element("ul", "prismList");
  const empty = BudgetUI.element("p", "panelHint prismEmpty", `No ${plural.toLowerCase()} yet. Fill in the calculator, then tap Add ${noun} to keep it.`);
  shelf.append(title, toolbar, helpBox, draft, list, empty);

  // A preset's words: its name, or what it keeps
  const label = (preset) => {
    if (preset.name) return preset.name;
    const words = describe(preset.values);
    return words.length > 2 ? `${words.slice(0, 2).join(", ")}, and ${words.length - 2} more` : words.join(", ") || noun;
  };
  const setError = (message) => {
    error.textContent = message || "";
    error.hidden = !message;
  };

  // Making one: the form glows, and it isn't drawn again under it (data-typing) while it's being made
  let wasTyping = false;
  let typed = false;
  const noteTyping = () => { typed = true; };
  // Add was tapped: the name box shows, and the form glows
  function startDraft() {
    if (!draft.hidden) return;
    wasTyping = "typing" in form.dataset;
    typed = false;
    form.dataset.typing = "1";
    form.addEventListener("input", noteTyping);
    form.classList.add("presetDraft");
    draft.hidden = false;
    add.disabled = true;
    setError("");
    if (window.matchMedia("(pointer: fine)").matches) name.input.focus({ preventScroll: true });
  }
  // Saved or cancelled: the form is just the calculator again
  function endDraft() {
    form.removeEventListener("input", noteTyping);
    form.classList.remove("presetDraft");
    if (!wasTyping && !typed) delete form.dataset.typing;
    draft.hidden = true;
    add.disabled = false;
    name.input.value = "";
    setError("");
    refresh();
  }
  // Keep what the boxes hold as a new one, under the name typed
  async function saveDraft() {
    const { values, error: problem } = read();
    if (problem) return setError(problem);
    if (Object.keys(values).length === 0) return setError(`Fill in at least one box for this ${noun.toLowerCase()} to keep.`);
    const presets = calculatorStore(store);
    if (presets.length >= MAX_PRESETS) return setError(`You can have up to ${MAX_PRESETS} ${plural.toLowerCase()}. Delete one in Edit ${plural} first.`);
    const preset = { name: name.value(), values };
    draft.querySelectorAll("button, input").forEach(control => { control.disabled = true; });
    const result = await saveCalculatorPresets(store, [...presets, preset]);
    draft.querySelectorAll("button, input").forEach(control => { control.disabled = false; });
    if (!result.ok) return setError(result.message || "That didn't work. Please try again.");
    endDraft();
    if (result.saved === false) BudgetUI.warnIfUnsaved(result);
    else BudgetUI.showToast(`${noun} saved: ${label(preset)}.`);
    refresh();
  }

  // Tapping one puts what it keeps in the calculator, which comes into view with a short glow
  function apply(preset) {
    applied = preset.id;
    fill(preset.values);
    refresh();
    const reducedMotion = window.lessMotion();
    form.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
    form.classList.remove("prismFlash");
    void form.offsetWidth; // Restart the glow
    form.classList.add("prismFlash");
    setTimeout(() => form.classList.remove("prismFlash"), 1200);
  }

  // Save the list as it is after a change in Edit (a rename, a new order, or a delete), and draw it again
  async function savePresets(next) {
    const result = await saveCalculatorPresets(store, next);
    if (!result.ok) BudgetUI.showToast(result.message || "That didn't work. Please try again.", true);
    else BudgetUI.warnIfUnsaved(result);
    refresh();
    return result.ok;
  }

  // Each one a button; in Edit, a row with ≡ to drag it and × to delete it
  function refresh() {
    const presets = calculatorStore(store);
    if (presets.length === 0) presetEditing[store] = false;
    const editing = presetEditing[store];
    list.classList.toggle("isEditing", editing);
    list.replaceChildren(...presets.map((preset, index) => {
      const item = BudgetUI.element("li", "prismItem");
      if (!editing) {
        const button = BudgetUI.noTranslate(BudgetUI.element("button", "budgetButton prismButton", label(preset)));
        button.type = "button";
        button.title = describe(preset.values).join(", ");
        button.addEventListener("click", () => apply(preset));
        item.append(button);
        return item;
      }
      item.classList.add("prismEditRow");
      item.dataset.index = index;
      const handle = BudgetUI.element("span", "prismHandle", "≡");
      handle.title = "Hold and drag to move";
      handle.setAttribute("aria-label", `Move ${label(preset)}`);
      handle.addEventListener("pointerdown", (event) => startPresetDrag(event, item, (order) => savePresets(order.map(i => presets[i]))));
      BudgetUI.keyMoves(handle, index, presets.length, async (to) => {
        const next = [...presets];
        next.splice(to, 0, next.splice(index, 1)[0]);
        await savePresets(next);
        list.querySelectorAll(".prismHandle")[to]?.focus({ preventScroll: true });
      });
      const remove = BudgetUI.element("button", "panelClose prismDelete", "×");
      remove.type = "button";
      remove.setAttribute("aria-label", `Delete ${label(preset)}`);
      remove.addEventListener("click", () => {
        if (!window.confirm(`Delete the ${noun.toLowerCase()} ${label(preset)}?`)) return;
        savePresets(presets.filter((_, i) => i !== index));
      });
      item.append(handle, BudgetUI.noTranslate(BudgetUI.element("span", "prismLabel", label(preset))), remove);
      return item;
    }));
    empty.hidden = presets.length > 0;
    const last = presets.find(preset => preset.id === applied);
    change.hidden = !last || editing || !draft.hidden;
    if (last) change.textContent = `Save Changes To ${label(last)}`;
    edit.hidden = presets.length === 0;
    edit.textContent = editing ? "Done" : `Edit ${plural}`;
    edit.classList.toggle("primary", editing);
  }

  add.addEventListener("click", () => {
    presetEditing[store] = false;
    refresh();
    startDraft();
    change.hidden = true;
  });
  // The boxes as they are now go into the one put in last (keeping its name and id)
  change.addEventListener("click", async () => {
    const presets = calculatorStore(store);
    const at = presets.findIndex(preset => preset.id === applied);
    if (at === -1) return refresh();
    const { values, error: problem } = read();
    if (problem) return BudgetUI.showToast(problem, true);
    if (Object.keys(values).length === 0) return BudgetUI.showToast(`Fill in at least one box for this ${noun.toLowerCase()} to keep.`, true);
    if (JSON.stringify(values) === JSON.stringify(presets[at].values)) return BudgetUI.showToast(`${label(presets[at])} keeps these boxes already.`);
    change.disabled = true;
    const ok = await savePresets(presets.map((preset, index) => (index === at ? { ...preset, values } : preset)));
    change.disabled = false;
    if (!ok) return;
    const following = store === "gems" ? (accountsData?.goals || []).filter(goal => goal.gem === presets[at].id).length : 0;
    const goalsToo = following === 0 ? "" : following === 1 ? " The goal following it changed too." : ` The ${following} goals following it changed too.`;
    BudgetUI.showToast(`${noun} changed: ${label(presets[at])}.${goalsToo}`);
  });
  edit.addEventListener("click", () => {
    presetEditing[store] = !presetEditing[store];
    refresh();
  });
  refresh();
  shelf.refresh = refresh;
  return shelf;
}

// Hold a preset's ≡ and drag it up or down; save(order) runs with the new order (the presets' indexes) when it's let go.
// The pointer is followed on the whole page: moving the row in the list makes the browser let go of a pointer capture.
function startPresetDrag(event, item, save) {
  event.preventDefault();
  const pointerId = event.pointerId;
  const list = item.parentElement;
  const order = () => [...list.children].map(row => Number(row.dataset.index));
  const startOrder = order().join();
  item.classList.add("dragging");
  const onMove = (moveEvent) => {
    if (moveEvent.pointerId !== pointerId) return;
    const before = [...list.children].find(row => row !== item && moveEvent.clientY < row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2);
    if (before && item.nextElementSibling !== before) list.insertBefore(item, before);
    if (!before && list.lastElementChild !== item) list.appendChild(item);
  };
  const onEnd = (endEvent) => {
    if (endEvent.pointerId !== pointerId) return;
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onEnd);
    document.removeEventListener("pointercancel", onEnd);
    item.classList.remove("dragging");
    if (order().join() !== startOrder) save(order());
  };
  document.addEventListener("pointermove", onMove);
  document.addEventListener("pointerup", onEnd);
  document.addEventListener("pointercancel", onEnd);
}

//#endregion

// =====================================================================
// #region PAGE SEARCH (Change Logs)
// =====================================================================
// Search on the Change Logs page looks through the page's own rows. It floats over the page like Home's Search
// (×, Escape, or the button again closes it), and as you type, it lists the rows that have every word you typed,
// in any column. (Bob's Tracker window has a search of its own, Bob Page.js.)

const PAGE_SEARCHES = {
  logs: {
    placeholder: "A title, an action, or a date",
    noun: ["change", "changes"],
    tableClass: "logsTable",
    columns: LOG_COLUMNS,
    rows: () => logsData.map((row, index) => ({ index, row })).slice(1).filter(({ row }) => !isBlankRow(row)),
    text: (row) => row.slice(0, LOG_UNDO_COLUMN).join(" "),
    render: logRow,
    open: null
  }
};

let pageSearch = null; // { box, input, results, isOpen }, made the first time it opens

// The Search button on a page's toolbar (its magnifying glass is a CSS image, .iconSearch)
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
      BudgetUI.makePressable(tr);
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

// New Entry + Edit normally; Delete Selected + Done in edit mode. Equity adds accounts in edit
// mode instead (newLabel: the add button's label, newInEditMode: show it in edit mode). search: a Search
// button too, outside edit mode (see PAGE SEARCH). inWindow: the toolbar is in a window (Bob's Tracker window),
// which starting or ending Edit leaves open (closing the rest of the open windows is for a page's own toolbar).
function renderToolbar(tableName, openNew, { newLabel = "New Entry", newInEditMode = false, search = false, inWindow = false } = {}) {
  const bar = document.getElementById("pageToolbar");
  if (!bar) return;
  bar.replaceChildren();
  const newButton = (kind) => toolbarButton(newLabel, kind, (event) => openNew(event.currentTarget));

  if (!editMode) {
    if (!newInEditMode) bar.append(newButton("primary"));
    bar.append(toolbarButton("Edit", newInEditMode ? "primary" : "", () => {
      editMode = true;
      selectedRows.clear();
      if (!inWindow) BudgetUI.closeAllPanels(true);
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
    if (!inWindow) BudgetUI.closeAllPanels(true);
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
    BudgetUI.makePressable(tr);
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
  body.addEventListener("keydown", (event) => {
    const bar = event.target.closest(".moveBar");
    if (bar && editMode) moveRowWithKey(event, bar, tableEl, tableName);
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
  td.title = "Hold and drag to move, or use the up and down arrow keys";
  td.setAttribute("aria-label", "Move row, with the up and down arrow keys");
  td.setAttribute("role", "button");
  td.tabIndex = 0;
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
    if (order.join() !== startOrder.join()) saveRowOrder(tableName, order, Number(row.dataset.index));
  };

  document.addEventListener("pointermove", onMove);
  document.addEventListener("pointerup", onEnd);
  document.addEventListener("pointercancel", onEnd);
  frame = requestAnimationFrame(autoScroll);
}

// Save a new order of a table's rows: the rows land in it right after the table's header rows (see reorderTableRows). Resolves
// to where the moved row ended up (its row in the table), or null when it couldn't be saved.
async function saveRowOrder(tableName, order, movedIndex) {
  const firstRow = ROW_TABLES[tableName].headerRows;
  const undoChecks = followCheckedRows(index => (order.includes(index) ? firstRow + order.indexOf(index) : index));
  const result = await moveBudgetRows(tableName, order, movedIndex);
  if (!result.ok) {
    undoChecks();
    BudgetUI.showToast(result.message, true);
    renderCurrentPage(); // Put the rows back where they really are
    return null;
  }
  BudgetUI.warnIfUnsaved(result);
  return firstRow + order.indexOf(movedIndex);
}

// The up and down arrow keys on a row's ≡ bar move it a row, and the focus stays on it
async function moveRowWithKey(event, bar, tableEl, tableName) {
  if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
  event.preventDefault();
  const row = bar.closest("tr");
  const body = tableEl.tBodies[0];
  const rows = [...body.querySelectorAll("tr[data-index]")];
  const other = rows[rows.indexOf(row) + (event.key === "ArrowUp" ? -1 : 1)];
  if (!other) return;
  if (event.key === "ArrowUp") other.before(row);
  else other.after(row);
  const landed = await saveRowOrder(tableName, rowOrder(body), Number(row.dataset.index));
  if (landed !== null) document.querySelector(`tr[data-index="${landed}"] .moveBar`)?.focus({ preventScroll: true });
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
// or Equity account is different, so one that matches another in all three is refused with a message saying so. fill: what a
// new one starts with: { title, account, sprite, amount, frequency, start } (see askAddRecurring).
function openRecurringPanel(origin, index, fill = null) {
  const existing = index === null ? null : recurringData[index];
  BudgetUI.openPanel({
    origin,
    size: "large",
    title: existing ? "Change Recurring Entry" : "New Recurring Entry",
    build(form, panel) {
      // Stored dates are always MM/DD/YYYY (the boxes show them in this device's date format)
      const existingEnd = existing && String(existing[4]).trim().toLowerCase() !== "none" ? createSafeMidnight(existing[4], true) : null;
      const existingStart = existing ? createSafeMidnight(existing[2], true) : null;

      // Its title and its Equity account ("Payday → Savings") are separate boxes
      const existingTitle = fill ? { title: fill.title, account: fill.account, from: "" } : splitAccount(existing ? String(existing[0]).trim() : "");
      const title = BudgetUI.textField({ label: "Title", value: existingTitle.title, placeholder: "Rent, paycheck, phone...", maxLength: MAX_TITLE });
      const amount = BudgetUI.amountField({ amount: existing ? parseAmount(existing[1]) : fill?.amount ?? null, percent: existing ? percentOf(existing[5]) : null });
      const frequency = BudgetUI.frequencyField({ value: existing ? existing[3] : fill?.frequency ?? "Every Month" });
      const start = BudgetUI.dateField({ label: "Start Date", date: existing ? (isNaN(existingStart) ? null : existingStart) : fill?.start ?? today });
      const end = BudgetUI.dateField({ label: "End Date", date: existingEnd && !isNaN(existingEnd) ? existingEnd : null, optional: true });
      // Hidden and Transfer entries can move money into or out of an Equity account (like a savings transfer). The type and
      // account come before the amount, which can be a % of the account picked.
      const account = BudgetUI.accountField({ accounts: otherAccounts(), amount, type: () => refraction.value(), account: existingTitle.account, from: existingTitle.from });
      const refraction = BudgetUI.refractionField({
        value: existing ? getSpecialType(existing[5]) : fill?.sprite ?? "❗️",
        allowAuto: false,
        onChange: (key) => account.setVisible(BudgetUI.isAccountType(key))
      });
      account.setVisible(BudgetUI.isAccountType(refraction.value()));
      // Every day it lands on gets a placeholder (offered while it can still land: no End Date, or one from today on), each
      // deleted once its day passes, or with days picked, that many days behind or ahead of the current day
      const keeps = existing ? placeholderKeeps(existing[5]) : null;
      const placeholder = BudgetUI.placeholderField({
        checked: !!existing && isPlaceholder(existing[5]),
        until: typeof keeps === "number" ? keeps : null,
        days: true,
        hint: "Every day it lands on gets a placeholder: a stand-in for an entry you expect, like an estimate. It counts like any entry and shows in yellow, and it's deleted once its day passes (or, with days picked under it, that many days behind or ahead of the current day)."
      });
      const showPlaceholder = () => placeholder.setDate(end.value() ?? null);
      end.input.addEventListener("input", showPlaceholder);
      end.input.addEventListener("change", showPlaceholder);
      showPlaceholder();
      // Its Wavelength (once Bob's card for it is on): its title's, following a new title as it's typed
      const purpose = BudgetUI.purposeField({ shown: bobCardOn("purposes"), title: existing ? String(existing[0]) : "" });
      const followTitle = () => purpose.follow(withAccount(title.value(), account.value(), account.from()));
      title.input.addEventListener("input", followTitle);
      account.el.addEventListener("pick", followTitle);
      // Its own note, under the buttons (each day it lands on can have one of its own too)
      const currentNote = existing ? recurringNote(existing[0], existing[5]) : "";
      const note = BudgetUI.noteField({ note: currentNote });
      // The days it's on, each to change on its own (drawn again after each change while it's open)
      const days = existing ? recurringEntriesField(existing[0], existing[5]) : null;
      if (days) {
        const follow = () => {
          if (!panel.panel.isConnected || panel.panel.classList.contains("isClosing")) return document.removeEventListener("budget:updated", follow);
          days.draw();
        };
        document.addEventListener("budget:updated", follow);
      }

      const buttons = existing
        ? [{ label: "Save", kind: "primary", type: "submit" }, { label: "Delete", kind: "danger", onClick: deleteEntry }, { label: "Cancel", onClick: () => panel.close() }]
        : [{ label: "Add Entry", kind: "primary", type: "submit" }, { label: "Cancel", onClick: () => panel.close() }];
      form.append(title.el, refraction.el, account.el, amount.el, frequency.el, start.el, end.el, placeholder.el, purpose.el, ...(days ? [days.el] : []), BudgetUI.buttonRow(buttons), note.el);

      form.addEventListener("submit", (event) => {
        event.preventDefault();
        if (hasTitleArrow(title.value())) return panel.setError(TITLE_ARROW);
        // (A blank amount is $0.00)
        const { percent, error: percentError } = BudgetUI.readPercentField(amount);
        if (percentError) return panel.setError(percentError);
        const fields = { title: withAccount(title.value(), account.value(), account.from()), amount: percent !== null ? undefined : amount.value() ?? 0, percent, startDate: start.value(), endDate: end.value() };
        if (!fields.title) return panel.setError("Give the recurring entry a title.");
        if (account.from() && cleanString(account.from()) === cleanString(account.value())) return panel.setError(SAME_ACCOUNT);
        if (percent === null && Number.isNaN(fields.amount)) return panel.setError("Enter an amount, like 12.50.");
        if (percent === null && Math.abs(fields.amount) > MAX_AMOUNT) return panel.setError(AMOUNT_TOO_BIG);
        if (fields.startDate === undefined || fields.endDate === undefined) return panel.setError(`That date isn't a real day. Use ${datePattern()}.`);
        fields.frequency = frequency.value();
        if (!fields.frequency) return panel.setError(`How often should it land? Use a whole number from 1 to ${MAX_FREQUENCY_COUNT}, like every 2 weeks.`);
        fields.sprite = BudgetUI.RECURRING_SPRITES[refraction.value()];
        fields.endDate = fields.endDate || "None";
        // (Left as it was when the switch isn't there: an End Date before today)
        if (!placeholder.el.hidden) fields.placeholder = placeholder.value();
        if (fields.placeholder) {
          fields.until = placeholder.until();
          if (Number.isNaN(fields.until) || Math.abs(fields.until) > MAX_PLACEHOLDER_DAYS) return panel.setError(`Enter how many days behind or ahead of the current day each placeholder is deleted: a whole number from 0 to ${MAX_PLACEHOLDER_DAYS}.`);
        }
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

// What each kind of account changes in its window: tips (what it is, and how to fill it in), its words, which boxes show
// (max and escrow; the kinds that aren't Other have their interest's compounding, how often it's added, and whether it's
// kept apart set for them), and its usual settings, which go in when the kind is picked. payment: its recurring entry's title
// (see askAddRecurring), and it asks for the payment.
const ACCOUNT_KINDS = {
  car: {
    label: "Car",
    namePlaceholder: "Car loan, the truck...",
    owes: true,
    balanceLabel: "Still owed",
    balanceHint: "What's left to pay on the loan, from your statement or the lender's site (Negative: it's money owed). Not what the car is worth.",
    max: false,
    escrow: false,
    payment: "Car Payment",
    interest: { fixed: true, on: true, compound: "simple", every: 1, separate: true, rateLabel: "Interest rate (% a year)", rateHint: "From your loan papers (the APR is usually close to it).", dayLabel: "Payment due on day", dayHint: "The day of the month your payment is due (a shorter month uses its last day).", owedLabel: "Interest built up so far", owedHint: "Interest owed since your last payment (Negative), usually $0.00 right after one." },
    tips: [
      ["What it's for: ", "a loan on a vehicle, paid back with a set payment each month."],
      ["Still owed: ", "the payoff balance, as a Negative amount. Each payment moves it toward $0.00."],
      ["Interest: ", "most car loans use simple interest, worked out on what's still owed as the days go by, so paying early or paying extra saves money. That's how this tracks it."],
      ["A precomputed loan: ", "some loans set all the interest at the start, and paying extra doesn't lower it. Your contract says which you have. For one of those, use Other and leave Interest off, with the total owed as the balance."],
      ["Payments: ", "each one pays the interest that's built up first, and the rest lowers what's owed. Add it as a Transfer with this account picked (the question after you save can do that for you)."]
    ]
  },
  mortgage: {
    label: "Mortgage",
    namePlaceholder: "Mortgage, the house...",
    owes: true,
    balanceLabel: "Principal still owed",
    balanceHint: "The unpaid principal on your latest statement (Negative: it's money owed). Not what the home is worth.",
    max: false,
    escrow: true,
    payment: "Mortgage Payment",
    day: 1,
    interest: { fixed: true, on: true, compound: "monthly", every: 1, separate: true, rateLabel: "Interest rate (% a year, not the APR)", rateHint: "The rate on your note or statement. The APR also counts fees and points, so it's higher, and interest isn't charged at it.", dayLabel: "Payment due on day", dayHint: "The day of the month your payment is due, usually the 1st (a shorter month uses its last day).", owedLabel: "Interest owed today", owedHint: "Interest owed since your last payment (Negative), usually $0.00 right after one." },
    tips: [
      ["What it's for: ", "a loan on a home, paid back with a set payment each month."],
      ["The balance: ", "the principal still owed, as a Negative amount, from your statement."],
      ["The rate: ", "use your interest rate, not the APR. The APR is for comparing loans, since it also counts the lender's fees."],
      ["Interest: ", "each month it's the balance times the rate, divided by 12, and it's added on the day the payment is due."],
      ["Escrow: ", "if your payment includes property taxes and insurance (homeowners, and mortgage insurance like PMI), turn on Escrow and type that part of the payment. It usually changes once a year."],
      ["Payments: ", "each one pays the interest, then the escrow, and only what's left lowers the principal, so the balance shows just the principal paid off. Use the whole payment for the recurring entry."]
    ]
  },
  credit: {
    label: "Credit Card",
    namePlaceholder: "Rewards card, store card...",
    owes: true,
    balanceLabel: "Balance owed today",
    balanceHint: "What you owe on the card right now (Negative: it's money owed).",
    maxLabel: "Credit limit",
    maxHint: "The most the card can hold. Its balance then shows over it, like -$500.00/$2000.00.",
    escrow: false,
    payment: "Credit Card Payment",
    interest: { fixed: true, on: false, compound: "daily", every: 1, separate: false, rateLabel: "Purchase APR (% a year)", rateHint: "From your statement. Interest builds each day at the APR divided by 365.", dayLabel: "Statement closing day", dayHint: "The day of the month your statement closes, when the month's interest is added (a shorter month uses its last day).", owedLabel: "Interest today", owedHint: "" },
    tips: [
      ["What it's for: ", "a card you borrow on and pay back. Purchases are Hidden costs with this account picked, and payments are Transfers."],
      ["Paying in full: ", "pay the whole statement by its due date each month and most cards charge no interest on purchases, so leave Add interest off."],
      ["Carrying a balance: ", "turn on Add interest. Interest builds every day at the APR divided by 365 (a few cards use 360) and is added when the statement closes. Once you carry a balance, new purchases usually build interest right away too, until it's paid off."],
      ["Cash advances: ", "usually have a higher APR and no grace period, so interest starts the same day."],
      ["Credit limit: ", "shows beside the balance, so you can see how much of it you're using."]
    ]
  },
  debit: {
    label: "Debit",
    namePlaceholder: "Checking at another bank, debit card...",
    owes: false,
    balanceLabel: "Balance today",
    balanceHint: "What's in the account today. Your bank's current balance is the closest match: its available balance also takes out purchases and holds that haven't finished yet.",
    max: false,
    escrow: false,
    payment: "",
    interest: { fixed: true, on: false, compound: "daily", every: 1, separate: false, rateLabel: "Interest rate (% a year, not the APY)", rateHint: "Only for an account that pays interest. Use its interest rate: the APY already counts the compounding.", dayLabel: "Paid on day", dayHint: "The day of the month the bank pays it (a shorter month uses its last day).", owedLabel: "Interest today", owedHint: "" },
    tips: [
      ["What it's for: ", "a checking account or debit card besides the one your budget follows, where the money is already yours."],
      ["Spending from it: ", "add purchases as Hidden costs with this account picked: they come out of it and leave In Bank alone. Moving money in from In Bank is a Transfer."],
      ["Its balance: ", "use your bank's current balance. Pending card purchases and holds can make the available balance lower for a few days."],
      ["Going below $0: ", "an overdraft shows as a Negative balance here. Your bank may charge a fee for it, which you'd add as its own entry."],
      ["Interest: ", "most checking accounts pay none. If yours does, turn on Add interest and use the rate, not the APY."]
    ]
  },
  other: {
    label: "Other",
    tips: [],
    interest: {}
  }
};
const ACCOUNT_KIND_CHOICES = Object.entries(ACCOUNT_KINDS).map(([key, kind]) => ({ key, label: kind.label }));

// Change a field's words (its caption, what a screen reader calls it, and its hint)
function relabel(fieldEl, label, hint) {
  fieldEl.querySelector(".fieldLabel").firstChild.textContent = label;
  fieldEl.querySelector("input, select")?.setAttribute("aria-label", label);
  const note = fieldEl.querySelector(":scope > .panelHint");
  if (note) {
    note.textContent = hint;
    note.hidden = !hint;
  }
}

// New account (index null, from edit mode) or change the tapped one: its kind (Car, Mortgage, Credit Card, Debit, or Other: see
// ACCOUNT_KINDS), with tips on it, and a new one can start from an Accrual Calculator gem; its name, its balance today (typing
// one sets its starting amount, so no entry is made), its max (optional: the most it can hold, like a credit card's limit,
// shown after its balance), then under a line its interest (with Separate Interest, Interest today under it), then under
// another its escrow, and every entry for it, to change. A change to one of its entries while it's open redraws them, and
// the balance follows it unless a new one was typed (Save only sets the balance when one was). Once a new one is made, it asks
// about adding a recurring entry for it (askAddRecurring).
function openAccountPanel(origin, index) {
  const existing = index === null ? null : accountsData.list[index];
  const summary = existing ? accountSummaries().find(account => account.index === index) : null;
  const isMandatory = !!existing && isMandatoryAccount(existing);
  BudgetUI.openPanel({
    origin,
    size: "large",
    title: existing ? "Change Account" : "New Account",
    build(form, panel) {
      const OTHER_NAME = "Investments, HSA, a loan...";
      const BALANCE_HINT = "What's in the account today (Negative for money owed, like a credit card's or a loan's). Changing it doesn't add an entry: Hidden and Transfer entries with this account picked add to it from here.";
      const name = BudgetUI.textField({ label: "Name", value: existing ? existing[0] : "", placeholder: OTHER_NAME, maxLength: MAX_ACCOUNT_NAME });
      // With Separate Interest, the interest owed (or earned) is a balance of its own, beside the rest (Balance today)
      const owedNow = summary?.interest?.separate ? summary.owed ?? 0 : 0;
      // Negative: money owed, like on a credit card
      const balance = BudgetUI.amountField({
        label: "Balance today",
        amount: summary ? Math.round((summary.today - owedNow) * 100) / 100 : null,
        signs: BudgetUI.BALANCE_SIGNS,
        hint: BALANCE_HINT
      });
      // Max: typed like a cash register (blank for none)
      const currentMax = existing ? accountMax(existing) : null;
      const MAX_HINT = "The most it can hold, like a credit card's limit. Its balance then shows over it, like $500.00/$2000.00.";
      const max = BudgetUI.textField({
        label: "Max",
        value: currentMax ? currentMax.toFixed(2) : "",
        placeholder: "0.00",
        optional: true,
        hint: MAX_HINT
      });
      BudgetUI.cashRegister(max.input);
      const OWED_HINT = "The interest owed (Negative) or earned, kept apart from the balance. A payment toward the account pays it first.";
      const owedBox = BudgetUI.amountField({
        label: "Interest today",
        amount: owedNow,
        signs: BudgetUI.BALANCE_SIGNS,
        hint: OWED_HINT
      });
      owedBox.el.classList.add("owedField");
      // (Interest goes with the balance: owed on money owed. It follows the balance's sign until one's typed or picked.)
      const followBalanceSign = () => { if (!owedBox.input.value) owedBox.setSign(balance.sign()); };
      balance.onSign(followBalanceSign);
      followBalanceSign();
      BudgetUI.addFieldHelp(owedBox.el, "What Interest today is", BudgetUI.helpList(INTEREST_TODAY_HELP));
      const interest = interestFields(summary ? summary.interest : null, owedBox.el);
      const escrow = escrowFields(summary ? summary.escrow : null, summary?.escrowDue ?? 0, () => interest.day() ?? today.getDate());
      const line = () => BudgetUI.element("hr", "panelLine");
      const escrowLine = line();
      // The payment, for a new account: it goes in the recurring entry it asks about after (it isn't kept with the account)
      const PAYMENT_HINT = "If you know it, it goes in the recurring entry this asks about once the account is made.";
      const payment = moneyField({ label: "Payment each month", optional: true, hint: PAYMENT_HINT });
      let gemFrequency = "monthly"; // How often the gem it was filled in from pays
      payment.el.hidden = true;

      // Its kind: the tips, words, and boxes for it (fill: put in its usual settings too, when it was just picked)
      const tips = BudgetUI.element("div", "fieldHelp accountKindTips");
      const showKind = (key, fill) => {
        const kind = ACCOUNT_KINDS[key];
        tips.replaceChildren(BudgetUI.helpList(kind.tips));
        tips.hidden = kind.tips.length === 0;
        name.input.placeholder = kind.namePlaceholder || OTHER_NAME;
        relabel(balance.el, kind.balanceLabel || "Balance today", kind.balanceHint || BALANCE_HINT);
        relabel(max.el, kind.maxLabel || "Max", kind.maxHint || MAX_HINT);
        max.el.hidden = kind.max === false;
        escrow.el.hidden = kind.escrow === false;
        escrowLine.hidden = escrow.el.hidden;
        relabel(owedBox.el, kind.interest.owedLabel || "Interest today", kind.interest.owedHint || OWED_HINT);
        interest.tailor(kind.interest, fill, kind.day);
        payment.el.hidden = !!existing || !kind.payment;
        // (A kind that's money owed is below $0 whatever's been typed so far; one that's already made keeps its balance)
        if (fill && !existing && kind.owes) balance.setSign(-1);
        else if (fill && !balance.input.value) balance.setSign(kind.owes ? -1 : 1);
      };
      let kindKey = existing ? accountKind(existing) : "other";
      const kindPicker = BudgetUI.segmented(ACCOUNT_KIND_CHOICES, kindKey, (key) => {
        kindKey = key;
        showKind(key, true);
      });
      const kindField = BudgetUI.field("Kind", kindPicker.el);
      kindField.append(tips);

      // A new account can start from one of the Accrual Calculator's gems
      const gems = existing ? [] : calculatorStore("gems");
      const gemField = gems.length === 0 ? null : BudgetUI.selectField({
        label: "Fill in from a gem",
        options: [{ value: "", label: "None" }, ...gems.map((gem, at) => ({ value: String(at), label: gem.name || describeDebt(gem.values).join(", ") || "Gem" }))],
        value: "",
        hint: "Optional: one of your Accrual Calculator's gems, to fill in what it keeps."
      });
      gemField?.input.addEventListener("change", () => {
        const gem = gems[Number(gemField.input.value)];
        if (!gem || gemField.input.value === "") return;
        const values = { ...gem.values };
        // (A gem that keeps an account takes its balance and interest from it, as the calculator does)
        const linked = typeof values.account === "string" ? accountSummaries().find(item => cleanString(item.name) === cleanString(values.account)) : null;
        if (linked) {
          if (gemSaves(values)) values.balance = Math.max(0, linked.today);
          else values.owed = Math.max(0, -linked.today);
          if (linked.interest) Object.assign(values, { rate: linked.interest.rate, compound: linked.interest.compound, every: linked.interest.every, day: linked.interest.day });
        }
        if (gem.name) name.input.value = gem.name;
        if (typeof values.owed === "number") {
          balance.input.value = values.owed > 0 ? values.owed.toFixed(2) : "";
          balance.setSign(values.owed > 0 ? -1 : 1);
        }
        // (A gem for what's saved: its balance is above $0)
        if (typeof values.balance === "number") {
          balance.input.value = values.balance > 0 ? values.balance.toFixed(2) : "";
          balance.setSign(1);
        }
        if (typeof values.rate === "number") interest.fill(values);
        if (typeof values.payment === "number") {
          payment.set(values.payment);
          payment.el.hidden = false;
        }
        if (typeof values.frequency === "string") {
          gemFrequency = values.frequency;
          relabel(payment.el, { weekly: "Payment each week", biweekly: "Payment every 2 weeks" }[gemFrequency] || "Payment each month", PAYMENT_HINT);
        }
      });

      const fields = [
        ...(isMandatory ? [] : [kindField]),
        ...(gemField ? [gemField.el] : []),
        name.el,
        ...(isMandatory ? [BudgetUI.element("p", "panelHint", mandatoryAccountNote(existing[0]))] : []),
        balance.el, max.el, payment.el, line(), interest.el, escrowLine, escrow.el
      ];
      const entries = summary ? accountEntriesField(index, existing[0]) : null;
      if (entries) fields.push(entries.el);
      showKind(kindKey, false);
      // The balances shown (with Separate Interest, the rest and the interest), to tell typed ones from ones that only
      // followed its entries
      let shownBalance = summary ? summary.today - owedNow : null;
      let shownOwed = owedNow;
      const showAmount = (box, amount) => {
        box.input.value = Math.round(amount * 100) !== 0 ? Math.abs(amount).toFixed(2) : "";
        box.setSign(amount < 0 ? -1 : amount > 0 ? 1 : box === owedBox ? balance.sign() : 1);
      };
      const showBalance = (amount, owed = 0) => {
        shownBalance = Math.round((amount - owed) * 100) / 100;
        shownOwed = owed;
        showAmount(balance, shownBalance);
        showAmount(owedBox, owed);
      };
      // The Interest today box shows while Separate Interest is on. Turned on, the balance stays as it shows (and the
      // interest starts at $0.00); turned off, the interest goes back into it (still counting as typed, if either was).
      const showOwed = () => { owedBox.el.hidden = !interest.separate(); };
      showOwed();
      interest.onSeparate((on) => {
        const typed = balance.value() ?? 0;
        const owed = owedBox.value() ?? 0;
        if (on) {
          showAmount(owedBox, 0);
        } else {
          const untouched = typed === Math.round((shownBalance ?? 0) * 100) / 100 && owed === shownOwed;
          const together = Math.round((typed + owed) * 100) / 100;
          showAmount(balance, together);
          showAmount(owedBox, 0);
          if (untouched) shownBalance = together;
          shownOwed = 0;
        }
        showOwed();
      });
      // (Its entries and balance are drawn again after each change while it's open)
      const follow = () => {
        if (!panel.panel.isConnected || panel.panel.classList.contains("isClosing")) return document.removeEventListener("budget:updated", follow);
        entries?.draw();
        const now = accountSummaries().find(account => account.index === index);
        const typed = balance.value();
        const typedOwed = owedBox.value();
        const untouched = (typed === null ? 0 : typed) === Math.round((shownBalance ?? 0) * 100) / 100 && (typedOwed === null ? 0 : typedOwed) === shownOwed;
        if (now && untouched) showBalance(now.today, interest.separate() && now.interest?.separate ? now.owed ?? 0 : 0);
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
        const interestSet = interest.value();
        if (Number.isNaN(interestSet)) return panel.setError(`Enter the interest rate for a year, like 24.99 (up to ${MAX_INTEREST_RATE}), or turn Interest off.`);
        const most = !max.el.hidden && max.value() ? readMoneyInput(max.value()) : null;
        if (most !== null && (!Number.isFinite(most) || most > MAX_AMOUNT)) return panel.setError("Enter the most it can hold, like 2000.00, or leave Max blank.");
        const owed = interestSet && interestSet.separate ? owedBox.value() ?? 0 : null;
        if (owed !== null && (!Number.isFinite(owed) || Math.abs(owed) > MAX_AMOUNT)) return panel.setError("Enter the interest, like 512.40 (Negative for interest owed).");
        const escrowSet = escrow.el.hidden ? null : escrow.value();
        const paymentAmount = payment.el.hidden ? 0 : payment.value();
        if (!Number.isFinite(paymentAmount) || paymentAmount > MAX_AMOUNT) return panel.setError("Enter the payment, like 350.00, or leave it blank.");
        if (Number.isNaN(escrowSet)) return panel.setError("Enter the escrow due each month, like 412.50, or turn Escrow off.");
        if (escrowSet && escrowSet.amount > MAX_AMOUNT) return panel.setError(AMOUNT_TOO_BIG);
        // (A balance that wasn't typed is left out, so it keeps whatever its entries make it)
        const typedBalance = !existing || Math.round(amount * 100) !== Math.round((shownBalance ?? 0) * 100);
        const typedOwed = owed !== null && (!existing || Math.round(owed * 100) !== Math.round(shownOwed * 100));
        const kindSaved = isMandatory ? {} : { kind: kindKey };
        const saved = BudgetUI.submit(panel, () => saveAccount({ name: name.value(), ...(typedBalance ? { balance: amount } : {}), interest: interestSet || null, ...(typedOwed ? { owed } : {}), max: most || null, escrow: escrowSet, ...kindSaved }, index));
        if (!existing) saved.then(result => { if (result.ok) askAddRecurring(origin, { account: capitalize(name.value()), kind: kindKey, payment: paymentAmount, frequency: gemFrequency, day: interestSet ? interestSet.day : null }); });
      });

      // Delete: the account goes, and its entries stay where they are
      function deleteAccount() {
        if (!window.confirm(`Delete ${existing[0]}? Its entries stay on your calendar, but they won't change an account anymore.`)) return;
        BudgetUI.submit(panel, () => deleteBudgetRows("accounts", [index]));
      }
    }
  });
}

// A new account was made: asks whether to add a recurring entry for it, and fills the form in with what's known. plan: { account
// (its name), kind, payment (0 for not known), frequency (a key of PAYMENT_FREQUENCIES), day (of the month it's due, or null) }
function askAddRecurring(origin, plan) {
  const kind = ACCOUNT_KINDS[plan.kind];
  BudgetUI.openPanel({
    origin,
    size: "small",
    title: "Add Recurring Entry?",
    build(form, panel) {
      form.append(BudgetUI.element("p", "panelText", `A payment or deposit that repeats keeps ${plan.account} up to date by itself.`), BudgetUI.buttonRow([
        { label: "Add Recurring Entry", kind: "primary", type: "submit" },
        { label: "Not Now", onClick: () => panel.close() }
      ]));
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        panel.close();
        const next = plan.day ? nextMonthDay(plan.day) : today;
        const frequency = { weekly: "Every Week", biweekly: "Every 2 Weeks", monthly: "Every Month" }[plan.frequency] || "Every Month";
        openRecurringPanel(origin, null, { title: kind.payment || "", account: plan.account, sprite: "⭕️", amount: plan.payment > 0 ? -plan.payment : null, frequency, start: next });
      });
    }
  });
}

// The next time a day of the month comes, after today (a shorter month's last day for one past it)
function nextMonthDay(dayOfMonth) {
  const inMonth = (year, month) => new Date(year, month, Math.min(dayOfMonth, new Date(year, month + 1, 0).getDate()));
  const thisMonth = inMonth(today.getFullYear(), today.getMonth());
  return thisMonth > today ? thisMonth : inMonth(today.getFullYear(), today.getMonth() + 1);
}

// The choices for how interest compounds and how often it's added (INTEREST_COMPOUNDING and INTEREST_EVERY in Process
// Budget.js), shared by an account's Interest and the Accrual Calculator
const COMPOUNDING_CHOICES = [
  { value: "daily", label: "Daily" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Every 3 months" },
  { value: "yearly", label: "Yearly" },
  { value: "simple", label: "Doesn't compound" }
];
const ADDED_CHOICES = [
  { value: 1, label: "Every month" },
  { value: 3, label: "Every 3 months" },
  { value: 6, label: "Every 6 months" },
  { value: 12, label: "Every year" }
];
const COMPOUNDING_HINT = "How often interest starts earning interest of its own. Daily: every day (most credit cards and savings). Monthly and the rest: on the day it's added. Doesn't compound: only the balance earns it, never the interest added to it.";
const DAY_CHOICES = Array.from({ length: 31 }, (_, i) => ({ value: i + 1, label: String(i + 1) }));

// What the "?"s in an account's window explain: its Interest (how to set it up for each kind of account), Interest
// today, and Escrow (each item a [lead, text] pair or plain text, see BudgetUI.helpList)
const INTEREST_HELP = [
  ["A credit card: ", "its purchase APR, Compounds Daily, added every month on its statement's closing day. Paid in full by the due date each month, most cards charge no interest at all, so leave Interest off for one you always pay off."],
  ["A mortgage: ", "its interest rate, Compounds Monthly, added every month on the day its payment is due, with Separate Interest on, and its escrow under Escrow."],
  ["A car or student loan: ", "its rate, Doesn't compound (interest builds a day at a time on what's still owed), added every month on the payment's due day, with Separate Interest on."],
  ["Savings: ", "its interest rate, not its APY (the APY already counts the compounding, so it would add a little too much), usually Compounds Daily, added every month on the day it's paid."],
  "Typing the balance again partway through a month keeps that month's interest counting from its start, the way a bank adds it."
];
const INTEREST_TODAY_HELP = [
  ["What it is: ", "with Separate Interest on, the interest added is kept here, apart from the balance, the way a mortgage or loan keeps it: owed (Negative), or earned for savings."],
  ["What it does: ", "each time interest is added, it goes here instead of into the balance, so it never earns interest of its own. A payment toward the account pays it first, and only what's left lowers the balance."],
  ["How to use it: ", "type the interest your statement says is owed today (Negative for owed), usually $0.00 right after a payment. From then on it follows the account's interest and payments by itself."]
];
const ESCROW_HELP = [
  ["What it is: ", "the part of a mortgage payment (or some other loans') the lender keeps in an escrow account to pay the home's property taxes and insurance (homeowners, and mortgage insurance like PMI) when they're due."],
  ["What it does: ", "each month on its day, the escrow amount comes due. A payment toward the account pays the interest owed first (with Separate Interest), then the escrow due, and only what's left lowers the balance, so the balance shows just the principal paid off. The escrow part leaves the account for the taxes and insurance."],
  ["How to use it: ", "type the escrow part of the monthly payment from the mortgage statement, and the day the payment is due. It usually changes once a year, after the lender's escrow review: change it here when it does."],
  "A payment that's less than the interest and escrow due pays what it can, in that order. The escrow still due shows here until a payment covers it."
];

// An account's Interest: a pill switch (with a "?" on how to set it up), and while it's on, the rate for a year (APR),
// how it compounds, how often it's added, the day of the month it's added (see interestStepper in Process Budget.js; a
// new one starts on today's day), and Separate Interest (a pill switch: off, interest is added to the balance, like a
// credit card's; on, it's a balance of its own, like a mortgage's, see accountState), with owedEl (Interest today) under
// it while it's on. value(): { rate (above 0), compound, every, day, separate }, 0 when it's off, NaN when the rate can't
// be read. day(): the day picked (null while it's off). separate(): Separate Interest is on (and Interest is).
// onSeparate(listener): listener(on) runs when that changes. fill(values): puts in a gem's { rate, compound, every, day }, each
// when it has one, and turns Interest on. tailor(kind's interest, fill, its usual day): fits the fields to a kind of account (see
// ACCOUNT_KINDS), and with fill, puts in its usual settings.
function interestFields(current, owedEl = null) {
  const toggle = BudgetUI.checkboxField({ label: "Add interest", checked: !!current });
  const RATE_LABEL = "Interest rate (APR, % a year)";
  const RATE_HINT = "Like a credit card's or a loan's APR, or the rate savings earn (not the APY). A balance below $0 (money owed) goes further below, and one above $0 grows.";
  const rate = BudgetUI.textField({
    label: RATE_LABEL,
    value: current ? String(current.rate) : "",
    placeholder: "Like 24.99",
    hint: RATE_HINT
  });
  rate.input.inputMode = "decimal";
  const compound = BudgetUI.selectField({ label: "Compounds", options: COMPOUNDING_CHOICES, value: current ? current.compound : "monthly", hint: COMPOUNDING_HINT });
  const every = BudgetUI.selectField({ label: "Added", options: ADDED_CHOICES, value: current ? current.every : 1 });
  const DAY_HINT = "The day of the month it's added (a shorter month uses its last day).";
  const day = BudgetUI.selectField({ label: "On day", options: DAY_CHOICES, value: current ? current.day : today.getDate(), hint: DAY_HINT });
  const separateSwitch = BudgetUI.checkboxField({ label: "Separate Interest", checked: !!current?.separate });
  const separate = BudgetUI.field("Kept apart", separateSwitch.el, { hint: "Off: interest is added to the balance, like a credit card's. On: it's a balance of its own (Interest today), like a mortgage's: payments pay it first, and only the rest earns interest." });
  const details = BudgetUI.element("div", "interestDetails");
  details.append(rate.el, compound.el, every.el, day.el, separate, ...(owedEl ? [owedEl] : []));
  details.hidden = !current;
  const listeners = [];
  const isSeparate = () => toggle.value() && separateSwitch.value();
  let wasSeparate = isSeparate();
  const told = () => {
    if (isSeparate() === wasSeparate) return;
    wasSeparate = isSeparate();
    listeners.forEach(listener => listener(wasSeparate));
  };
  toggle.input.addEventListener("change", () => {
    details.hidden = !toggle.value();
    if (toggle.value() && window.matchMedia("(pointer: fine)").matches) rate.input.focus({ preventScroll: true });
    told();
  });
  separateSwitch.input.addEventListener("change", told);
  const el = BudgetUI.element("div", "interestFields");
  const switchField = BudgetUI.field("Interest", toggle.el);
  BudgetUI.addFieldHelp(switchField, "How to set up interest", BudgetUI.helpList(INTEREST_HELP));
  el.append(switchField, details);
  return {
    el,
    value() {
      if (!toggle.value()) return 0;
      const number = readMoneyInput(rate.value().replace(/%/g, ""));
      if (!Number.isFinite(number) || number <= 0 || number > MAX_INTEREST_RATE) return NaN;
      return { rate: number, compound: compound.value(), every: Number(every.value()), day: Number(day.value()), separate: separateSwitch.value() };
    },
    day: () => (toggle.value() ? Number(day.value()) : null),
    separate: isSeparate,
    onSeparate: (listener) => listeners.push(listener),
    fill(values) {
      toggle.input.checked = true;
      details.hidden = false;
      if (typeof values.rate === "number") rate.input.value = String(values.rate);
      if (COMPOUNDING_CHOICES.some(choice => choice.value === values.compound)) compound.input.value = values.compound;
      if (ADDED_CHOICES.some(choice => choice.value === values.every)) every.input.value = String(values.every);
      if (DAY_CHOICES.some(choice => choice.value === values.day)) day.input.value = String(values.day);
      told();
    },
    tailor(kind, fill, usualDay) {
      relabel(rate.el, kind.rateLabel || RATE_LABEL, kind.rateHint || RATE_HINT);
      relabel(day.el, kind.dayLabel || "On day", kind.dayHint || DAY_HINT);
      compound.el.hidden = !!kind.fixed;
      every.el.hidden = !!kind.fixed;
      separate.hidden = !!kind.fixed;
      if (!fill || !kind.fixed) return;
      // (A rate that's already in it stays on)
      const on = !!kind.on || !!rate.value();
      toggle.input.checked = on;
      details.hidden = !on;
      compound.input.value = kind.compound;
      every.input.value = String(kind.every);
      separateSwitch.input.checked = !!kind.separate;
      if (usualDay) day.input.value = String(usualDay);
      told();
    }
  };
}

// An account's Escrow (see accountEscrow in Process Budget.js): a pill switch (with a "?" on what it is), and while it's
// on, the amount due each month and the day it's due (to start: the day interest is added, or today's), with what's
// still due (due) under them. value(): { amount, day }, null when it's off, NaN when the amount can't be read.
function escrowFields(current, due, startDay) {
  const toggle = BudgetUI.checkboxField({ label: "Take out escrow", checked: !!current });
  const amount = BudgetUI.textField({
    label: "Escrow each month",
    value: current ? current.amount.toFixed(2) : "",
    placeholder: "0.00",
    hint: "The escrow part of each month's payment, from the mortgage statement."
  });
  BudgetUI.cashRegister(amount.input);
  const day = BudgetUI.selectField({ label: "Due on day", options: DAY_CHOICES, value: current ? current.day : startDay(), hint: "The day of the month the payment is due (a shorter month uses its last day)." });
  const details = BudgetUI.element("div", "escrowDetails");
  details.append(amount.el, day.el);
  if (current && due > 0) details.append(BudgetUI.element("p", "panelHint", `Escrow due now: ${formatMoney(due)}. The next payment pays it, after the interest owed.`));
  details.hidden = !current;
  toggle.input.addEventListener("change", () => {
    details.hidden = !toggle.value();
    if (!toggle.value()) return;
    if (!current) day.input.value = String(startDay());
    if (window.matchMedia("(pointer: fine)").matches) amount.input.focus({ preventScroll: true });
  });
  const switchField = BudgetUI.field("Escrow", toggle.el);
  BudgetUI.addFieldHelp(switchField, "What escrow is", BudgetUI.helpList(ESCROW_HELP));
  const el = BudgetUI.element("div", "escrowFields");
  el.append(switchField, details);
  return {
    el,
    value() {
      if (!toggle.value()) return null;
      const number = readMoneyInput(amount.value());
      if (!Number.isFinite(number) || number <= 0) return NaN;
      return { amount: Math.round(number * 100) / 100, day: Number(day.value()) };
    }
  };
}

// An account's entries for its panel, newest first, in a box that scrolls: every entry for it (on the calendar, in
// History, and in Upcoming; see accountEntryLines), each one tapped to change it, and its interest through the calendar.
// Amounts at the right are what the account got (a Transfer's opposite amount, or a Hidden entry's own; see
// accountChange). { el, draw } (draw lists them again, after a change)
function accountEntriesField(index, name) {
  const list = BudgetUI.element("ul", "accountEntries");
  const none = BudgetUI.element("p", "panelText", `None yet. Hidden and Transfer entries with ${name} picked under Equity Account change it.`);
  const draw = () => {
    const summary = accountSummaries().find(account => account.index === index);
    const interest = (summary ? summary.interestCredits : []).filter(credit => credit.date <= gridEndDate);
    const escrow = (summary ? summary.escrowPaid : []).filter(paid => paid.date <= gridEndDate);
    const entries = [...accountEntryLines(index), ...interest.map(credit => ({ ...credit, interest: true })), ...escrow.map(paid => ({ ...paid, escrow: true }))].sort((a, b) => b.date - a.date);
    list.replaceChildren(...entries.map(entry => (entry.interest || entry.escrow ? accountInterestRow(entry) : accountEntryRow(entry))));
    list.hidden = entries.length === 0;
    none.hidden = entries.length > 0;
  };
  draw();
  const box = BudgetUI.element("div", "accountEntriesBox");
  box.append(none, list);
  return { el: BudgetUI.field("Entries", box, { hint: "Tap one to change it. At the right: what it put in or took out." }), draw };
}

// A recurring entry's days for its panel, newest first, in a box that scrolls: every entry with its title and type on the
// calendar, in History, and in Upcoming (see titleEntryLines), each tapped to change just that day. { el, draw } (draw
// lists them again, after a change)
function recurringEntriesField(titleText, sprite) {
  const list = BudgetUI.element("ul", "accountEntries");
  const none = BudgetUI.element("p", "panelText", "None yet. It shows here on the days it lands, once they're on your calendar.");
  const draw = () => {
    const entries = titleEntryLines(titleText, sprite);
    list.replaceChildren(...entries.map(accountEntryRow));
    list.hidden = entries.length === 0;
    none.hidden = entries.length > 0;
  };
  draw();
  const box = BudgetUI.element("div", "accountEntriesBox");
  box.append(none, list);
  return { el: BudgetUI.field("Its Days", box, { hint: "Tap one to change just that day." }), draw };
}

// New section (index null, inserted at atIndex) or rename/delete the tapped one
function openCategoryPanel(tableName, origin, index, atIndex) {
  const existing = index === null ? null : ROW_TABLES[tableName].get()[index];
  BudgetUI.openPanel({
    origin,
    size: "large",
    stacked: !!origin?.closest?.(".budgetPanel"), // (From a window, like Bob's Tracker window: over it, which comes back after)
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

// A row with nothing in any of its cells
function isBlankRow(row) {
  return row.every(value => String(value ?? "").trim() === "");
}

//#endregion
