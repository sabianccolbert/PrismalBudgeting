// Budget Pages: the menu data pages (Recurring, History, Other Accounts, Tracker, Paycheck Calculator,
// Change Logs). Recurring and Tracker: New Entry, tap a row to change it, and an Edit mode with section
// buttons between rows, delete checkboxes, and a move bar to drag rows. Other Accounts: tap an account
// to change it, and an Edit mode to add, delete, and drag accounts.
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

function renderCurrentPage() {
  const render = PAGE_RENDERERS[window.PAGE];
  const view = document.getElementById("dataView");
  if (render && view) render(view);
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

  const summary = recurringData[0] || [];
  const monthly = String(summary[2] || "").trim();
  const yearly = String(summary[5] || "").trim();
  if (monthly || yearly) {
    const summaryLine = BudgetUI.element("p", "dataSummary", [
      monthly ? "Monthly: " + monthly : "",
      yearly ? "Yearly: " + yearly : ""
    ].filter(Boolean).join("   •   "));
    view.appendChild(summaryLine);
  }

  const rows = indexedRows(recurringData, 2);
  if (rows.length === 0 && !editMode) {
    view.appendChild(emptyMessage("No recurring entries yet. Tap New Entry to add one."));
    return;
  }

  const tableEl = buildRowTable({
    tableName: "recurring",
    columns: ["Type", "Title", "Amount", "Start Date", "Frequency", "End Date"],
    rows,
    renderEntry(tr, row) {
      tr.appendChild(cell(row[5], "typeCell"));
      tr.appendChild(cell(row[0], "titleCell"));
      tr.appendChild(cell(row[1], "amountCell"));
      tr.appendChild(cell(row[2]));
      tr.appendChild(cell(describeFrequency(row[3])));
      tr.appendChild(cell(row[4]));
    },
    onEntryClick: (index, origin) => openRecurringPanel(origin, index)
  });
  view.appendChild(wrapScroll(tableEl));
}

// History tab: [0] column titles, then one row per week (Sunday-Saturday), newest first.
// Each cell is "MM/DD/YYYY\n✅ $X In Bank\nentries..."
function renderHistoryPage(view) {
  view.replaceChildren();
  const weeks = historyData.slice(1);
  if (weeks.length === 0) {
    view.appendChild(emptyMessage("No history yet. Weeks move here as they pass."));
    return;
  }

  const tableEl = createDataTable(["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]);
  tableEl.classList.add("historyTable");
  const fragment = document.createDocumentFragment();

  for (let week of weeks) {
    const tr = document.createElement("tr");
    for (let c = 0; c < 7; c++) {
      const td = document.createElement("td");
      td.className = "historyCell";
      String(week[c] ?? "").split("\n").forEach((line, l) => {
        if (l === 0 || line.trim()) td.appendChild(BudgetUI.renderEntryLine(line, l));
      });
      tr.appendChild(td);
    }
    fragment.appendChild(tr);
  }
  tableEl.tBodies[0].appendChild(fragment);
  view.appendChild(wrapScroll(tableEl));
}

// Tracker tab: [0] column titles, then
// [title, last 4 weeks, last 3 months, last year, aliases ("rent-, paycheck+, atm", see parseAlias)]
// Separator rows: ["-", category title, "", "", "-"]
// Titles starting with ⭕️ also count Transfers
function renderTrackerPage(view) {
  renderToolbar("tracker", (origin) => openTrackerPanel(origin, null));
  view.replaceChildren();

  const rows = indexedRows(trackerData, 1);
  if (rows.length === 0 && !editMode) {
    view.appendChild(emptyMessage("No tracker rows yet. Tap New Entry to add one."));
    return;
  }

  const tableEl = buildRowTable({
    tableName: "tracker",
    columns: ["Type", "Last 4 Weeks", "Last 3 Months", "Last 365 Days", "Aliases"],
    rows,
    extraClass: "trackerTable",
    renderEntry(tr, row) {
      tr.appendChild(cell(row[0], "titleCell"));
      tr.appendChild(cell(row[1], "amountCell"));
      tr.appendChild(cell(row[2], "amountCell"));
      tr.appendChild(cell(row[3], "amountCell"));
      tr.appendChild(cell(trackerAliasText(row), "aliasCell"));
    },
    onEntryClick: (index, origin) => openTrackerPanel(origin, index)
  });
  view.appendChild(wrapScroll(tableEl));
}

// Other Accounts: [0] column titles, then [name, balance, "default" | ""] (see Other Accounts in Process
// Budget.js). Balances come from each account's entries (Hidden and Transfer entries titled with its
// name): today, and on the calendar's last day. Savings can't be deleted.
function renderAccountsPage(view) {
  renderToolbar("accounts", (origin) => openAccountPanel(origin, null), { newLabel: "New Account", newInEditMode: true });
  view.replaceChildren();
  const summaries = new Map(accountSummaries().map(summary => [summary.index, summary]));

  const tableEl = buildRowTable({
    tableName: "accounts",
    columns: ["Account", "Balance", `By ${formatToMMDD(gridEndDate)}`],
    rows: indexedRows(accountsData.list, 1),
    extraClass: "accountsTable",
    sections: false,
    canSelect: (row) => !isDefaultAccount(row),
    lockedNote: (row) => `${row[0]} is your default account, so it can't be deleted.`,
    renderEntry(tr, row, index) {
      const summary = summaries.get(index);
      tr.appendChild(cell(row[0], "titleCell"));
      tr.appendChild(cell(formatMoney(summary ? summary.today : 0), "amountCell"));
      tr.appendChild(cell(formatMoney(summary ? summary.calendarEnd : 0), "amountCell"));
    },
    onEntryClick: (index, origin) => openAccountPanel(origin, index)
  });
  view.appendChild(wrapScroll(tableEl));
  if (!editMode) view.appendChild(BudgetUI.element("p", "dataHint", "Balances come from each account's Hidden and Transfer entries. Tap an account to see them or rename it."));
}

// Change Logs (the spreadsheet's "Form Entries" tab), newest first:
// [time, duration, action, detail, detail, detail, detail, status]
function renderLogsPage(view) {
  view.replaceChildren();
  const rows = logsData.slice(1).filter(row => !isBlankRow(row));
  if (rows.length === 0) {
    view.appendChild(emptyMessage("No changes logged yet."));
    return;
  }

  const tableEl = createDataTable(["Time", "Took", "Action", "Details"]);
  tableEl.classList.add("logsTable");
  const fragment = document.createDocumentFragment();
  for (let row of rows) {
    const tr = document.createElement("tr");
    if (row[7] === "Error") tr.className = "errorRow";
    if (row[7] === "Not Found") tr.className = "notFoundRow";
    tr.appendChild(cell(row[0], "timeCell"));
    tr.appendChild(cell(String(row[1]).replace(" Seconds", "s"), "timeCell"));
    tr.appendChild(cell(row[2], "actionCell"));
    const details = row.slice(3, 7).filter(detail => String(detail).trim() !== "");
    if (row[7]) details.push("Status: " + row[7]);
    tr.appendChild(cell(details.join("\n"), "detailsCell"));
    fragment.appendChild(tr);
  }
  tableEl.tBodies[0].appendChild(fragment);
  view.appendChild(wrapScroll(tableEl));
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

// The calculator inputs, grouped like the spreadsheet's. Blank counts as 0.
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
    input.type = "text";
    input.inputMode = "decimal";
    input.placeholder = "0";
    input.name = field.key;
    input.value = inputs[field.key] ? String(inputs[field.key]) : "";
    const wrapper = BudgetUI.element("div", "unitInput");
    wrapper.append(input, BudgetUI.element("span", "inputUnit", field.unit));
    section.appendChild(BudgetUI.field(field.label, wrapper));
    fields[field.key] = input;
  }

  const error = BudgetUI.element("p", "panelError");
  error.hidden = true;
  error.setAttribute("role", "alert");
  form.append(error, BudgetUI.buttonRow([{ label: "Calculate", kind: "primary", type: "submit" }]));

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    error.hidden = true;
    const values = {};
    for (const field of CALCULATOR_INPUTS) {
      // "$25", "7.65%", "1.5×", or "12,50" (a decimal comma) all read as numbers
      const text = fields[field.key].value.replace(/%/g, "").replace(/[x×]\s*$/i, "").trim();
      const number = text === "" ? 0 : readMoneyInput(text);
      if (!Number.isFinite(number) || number < 0) {
        error.textContent = `${field.label} needs to be a number (0 or more).`;
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
// #region TOOLBAR + EDIT MODE TABLE
// =====================================================================

// New Entry + Edit normally; Delete Selected + Done in edit mode. Other Accounts adds accounts in edit
// mode instead (newLabel: the add button's label, newInEditMode: show it in edit mode).
function renderToolbar(tableName, openNew, { newLabel = "New Entry", newInEditMode = false } = {}) {
  const bar = document.getElementById("pageToolbar");
  if (!bar) return;
  bar.replaceChildren();
  const newButton = (kind) => toolbarButton(newLabel, kind, (event) => openNew(event.currentTarget));

  if (!editMode) {
    if (!newInEditMode) bar.append(newButton("primary"));
    bar.append(toolbarButton("Edit", newInEditMode ? "primary" : "", () => {
      editMode = true;
      selectedRows.clear();
      BudgetUI.closePanel(true);
      renderCurrentPage();
    }));
    return;
  }

  const deleteButton = toolbarButton("Delete Selected", "danger", () => deleteSelected(tableName));
  deleteButton.id = "deleteSelectedButton";
  if (newInEditMode) bar.append(newButton(""));
  bar.append(deleteButton, toolbarButton("Done", "primary", () => {
    editMode = false;
    selectedRows.clear();
    BudgetUI.closePanel(true);
    renderCurrentPage();
  }));
  updateDeleteButton();
}

function toolbarButton(label, kind, onClick) {
  const button = BudgetUI.element("button", `budgetButton ${kind}`.trim(), label);
  button.type = "button";
  button.addEventListener("click", onClick);
  return button;
}

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

async function deleteSelected(tableName) {
  const count = selectedRows.size;
  if (!count) return;
  const note = DELETE_NOTES[tableName] || "";
  if (!window.confirm(`Delete ${count} row${count > 1 ? "s" : ""}?${note}`)) return;
  const result = await deleteBudgetRows(tableName, [...selectedRows]);
  if (!result.ok) return BudgetUI.showToast(result.message, true);
  selectedRows.clear();
  BudgetUI.warnIfUnsaved(result);
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

  body.addEventListener("click", (event) => {
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

function toggleSelected(index, checked, tr) {
  if (checked) selectedRows.add(index);
  else selectedRows.delete(index);
  tr.classList.toggle("selected", checked);
  updateDeleteButton();
}

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
// while the pointer is in the top or bottom 25% of the screen, faster closer to the edge.

const EDGE_ZONE = 0.25;  // Fraction of the screen height at each edge that scrolls
const MAX_SCROLL = 22;   // Pixels per frame at the very edge

function startRowDrag(event, bar, tableEl, tableName) {
  event.preventDefault();
  const row = bar.closest("tr");
  const body = tableEl.tBodies[0];
  const startOrder = rowOrder(body);
  let pointerY = event.clientY;
  let frame = null;

  tableEl.classList.add("isDragging");
  row.classList.add("dragRow");
  try { bar.setPointerCapture(event.pointerId); } catch {}

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
    pointerY = moveEvent.clientY;
    placeRow();
  };

  const onEnd = () => {
    cancelAnimationFrame(frame);
    bar.removeEventListener("pointermove", onMove);
    bar.removeEventListener("pointerup", onEnd);
    bar.removeEventListener("pointercancel", onEnd);
    tableEl.classList.remove("isDragging");
    row.classList.remove("dragRow");

    const order = rowOrder(body);
    if (order.join() === startOrder.join()) return;
    moveBudgetRows(tableName, order, Number(row.dataset.index)).then((result) => {
      if (!result.ok) {
        BudgetUI.showToast(result.message, true);
        renderCurrentPage(); // Put the rows back where they really are
      } else {
        BudgetUI.warnIfUnsaved(result);
      }
    });
  };

  bar.addEventListener("pointermove", onMove);
  bar.addEventListener("pointerup", onEnd);
  bar.addEventListener("pointercancel", onEnd);
  frame = requestAnimationFrame(autoScroll);
}

function rowOrder(body) {
  return [...body.querySelectorAll("tr[data-index]")].map(tr => Number(tr.dataset.index));
}

//#endregion

// =====================================================================
// #region PANELS
// =====================================================================

// New recurring entry (index null) or change the tapped one. A title can have one recurring entry per
// refraction type, so one that matches an existing title and type is refused with a message saying so.
function openRecurringPanel(origin, index) {
  const existing = index === null ? null : recurringData[index];
  BudgetUI.openPanel({
    origin,
    size: "large",
    title: existing ? "Change Recurring Entry" : "New Recurring Entry",
    build(form, panel) {
      const existingEnd = existing && String(existing[4]).trim().toLowerCase() !== "none" ? parseTypedDate(existing[4]) : null;

      const title = BudgetUI.textField({ label: "Title", value: existing ? existing[0] : "", placeholder: "Rent, paycheck, phone..." });
      const amount = BudgetUI.amountField({ amount: existing ? parseAmount(existing[1]) : null });
      const frequency = BudgetUI.frequencyField({ value: existing ? existing[3] : "Every Month" });
      const start = BudgetUI.dateField({ label: "Start Date", date: existing ? parseTypedDate(existing[2]) : today });
      const end = BudgetUI.dateField({ label: "End Date", date: existingEnd && !isNaN(existingEnd) ? existingEnd : null, optional: true });
      // Hidden and Transfer entries can move money into or out of an Other Account (like a savings transfer)
      const account = BudgetUI.accountField({ accounts: otherAccounts(), title, amount });
      const refraction = BudgetUI.refractionField({
        value: existing ? getSpecialType(existing[5]) : "❗️",
        allowAuto: false,
        onChange: (key) => account.setVisible(BudgetUI.isAccountType(key))
      });
      account.setVisible(BudgetUI.isAccountType(refraction.value()));

      const buttons = existing
        ? [{ label: "Save", kind: "primary", type: "submit" }, { label: "Delete", kind: "danger", onClick: deleteEntry }, { label: "Cancel", onClick: () => panel.close() }]
        : [{ label: "Add Entry", kind: "primary", type: "submit" }, { label: "Cancel", onClick: () => panel.close() }];
      form.append(title.el, amount.el, frequency.el, start.el, end.el, refraction.el, account.el, BudgetUI.buttonRow(buttons));

      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const fields = { title: title.value(), amount: amount.value(), startDate: start.value(), endDate: end.value() };
        if (!fields.title) return panel.setError("Give the recurring entry a title.");
        if (Number.isNaN(fields.amount)) return panel.setError("Enter an amount, like 12.50.");
        if (!existing && fields.amount === null) return panel.setError("Enter an amount, like 12.50.");
        if (fields.startDate === undefined || fields.endDate === undefined) return panel.setError("That date isn't a real day. Use MM/DD/YYYY.");
        fields.frequency = frequency.value();
        if (!fields.frequency) return panel.setError(`How often should it land? Use a whole number from 1 to ${MAX_FREQUENCY_COUNT}, like every 2 weeks.`);
        fields.sprite = BudgetUI.RECURRING_SPRITES[refraction.value()];
        fields.endDate = fields.endDate || "None";
        BudgetUI.submit(panel, () => saveRecurringEntry(fields, index));
      });

      function deleteEntry() {
        if (!window.confirm(`Delete ${existing[0]}? It stops from today on; days that already passed keep it.`)) return;
        BudgetUI.submit(panel, () => deleteBudgetRows("recurring", [index]));
      }
    }
  });
}

// New tracker row (index null) or change the tapped one. Each alias gets All / Costs / Gains buttons.
// Costs, Gains, and Undefined fill in by themselves, so their panels only say what they count.
function openTrackerPanel(origin, index) {
  const existing = index === null ? null : trackerData[index];
  const isAuto = !!existing && TRACKER_AUTO_ROWS.includes(cleanString(existing[0]));
  BudgetUI.openPanel({
    origin,
    size: "large",
    title: existing ? "Change Tracker Row" : "New Tracker Row",
    build(form, panel) {
      const existingTitle = existing ? String(existing[0]).replace("⭕️", "") : "";
      const title = BudgetUI.textField({ label: "Title", value: existingTitle, placeholder: "Groceries, car stuff...", disabled: isAuto });
      const aliases = isAuto ? null : BudgetUI.aliasField({ aliases: existing ? aliasList(existing[4]) : [] });
      const transfers = BudgetUI.checkboxField({ label: "Also count ⭕️ Transfers", checked: existing ? String(existing[0]).startsWith("⭕️") : false });
      const fields = isAuto
        ? [title.el, BudgetUI.field("Counts", BudgetUI.element("p", "panelText", autoRowNote(existing)))]
        : [title.el, aliases.el, transfers.el];

      const buttons = existing
        ? [...(isAuto ? [] : [{ label: "Save", kind: "primary", type: "submit" }]), { label: "Delete", kind: "danger", onClick: deleteRow }, { label: isAuto ? "Close" : "Cancel", onClick: () => panel.close() }]
        : [{ label: "Add Row", kind: "primary", type: "submit" }, { label: "Cancel", onClick: () => panel.close() }];
      form.append(...fields, BudgetUI.buttonRow(buttons));

      form.addEventListener("submit", (event) => {
        event.preventDefault();
        if (isAuto) return;
        const changes = { title: title.value(), aliases: aliases.value(), tracksTransfers: transfers.value() };
        if (!changes.title) return panel.setError("Give the tracker row a title.");
        BudgetUI.submit(panel, () => saveTrackerEntry(changes, index));
      });

      function deleteRow() {
        const note = isAuto ? " It comes back automatically." : "";
        if (!window.confirm(`Delete ${existing[0]}?${note}`)) return;
        BudgetUI.submit(panel, () => deleteBudgetRows("tracker", [index]));
      }
    }
  });
}

// New account (index null, from edit mode) or rename the tapped one, with its balance and the entries
// that changed it. Balances come only from entries (there's no balance to type in).
function openAccountPanel(origin, index) {
  const existing = index === null ? null : accountsData.list[index];
  const summary = existing ? accountSummaries().find(account => account.index === index) : null;
  const isDefault = !!existing && isDefaultAccount(existing);
  BudgetUI.openPanel({
    origin,
    size: "large",
    title: existing ? "Change Account" : "New Account",
    build(form, panel) {
      const name = BudgetUI.textField({ label: "Name", value: existing ? existing[0] : "", placeholder: "Cash, investments, HSA..." });
      const fields = [name.el];
      const howToSet = "To put what's already in the account here, add a Hidden entry for it on the calendar: a cost of that amount, with this account picked under Other Account.";
      if (summary) {
        const balance = BudgetUI.element("p", "panelText accountBalance", formatMoney(summary.today));
        if (summary.today < 0) balance.classList.add("negative");
        if (summary.today > 0) balance.classList.add("positive");
        fields.push(BudgetUI.field("Balance today", balance, { hint: `It comes from this account's entries. ${howToSet}` }));
      } else {
        fields.push(BudgetUI.element("p", "panelHint", `It starts at $0.00, and its entries add up to its balance. ${howToSet}`));
      }
      if (isDefault) fields.push(BudgetUI.element("p", "panelHint", `${existing[0]} is your default account, so it can't be deleted.`));
      if (summary) fields.push(accountEntriesField(summary));
      const buttons = existing
        ? [{ label: "Save", kind: "primary", type: "submit" }, ...(isDefault ? [] : [{ label: "Delete", kind: "danger", onClick: deleteAccount }]), { label: "Cancel", onClick: () => panel.close() }]
        : [{ label: "Add Account", kind: "primary", type: "submit" }, { label: "Cancel", onClick: () => panel.close() }];
      form.append(...fields, BudgetUI.buttonRow(buttons));

      form.addEventListener("submit", (event) => {
        event.preventDefault();
        if (!name.value()) return panel.setError("Give the account a name.");
        BudgetUI.submit(panel, () => saveAccount({ name: name.value() }, index));
      });

      function deleteAccount() {
        if (!window.confirm(`Delete ${existing[0]}? Its entries stay on your calendar, but they won't change an account anymore.`)) return;
        BudgetUI.submit(panel, () => deleteBudgetRows("accounts", [index]));
      }
    }
  });
}

// An account's entries for its panel: the ones still to come on the calendar, then the latest ones.
// Amounts are what the account gets (the opposite of the entry's amount).
const ACCOUNT_ENTRIES_SHOWN = 8;

function accountEntriesField(summary) {
  const upcoming = summary.entries.filter(entry => entry.date > today);
  const latest = summary.entries.filter(entry => entry.date <= today).slice(0, ACCOUNT_ENTRIES_SHOWN);
  if (upcoming.length === 0 && latest.length === 0) {
    return BudgetUI.field("Entries", BudgetUI.element("p", "panelText", `None yet. Hidden and Transfer entries titled ${summary.name} change it.`));
  }
  const list = BudgetUI.element("ul", "accountEntries");
  for (const entry of [...upcoming, ...latest]) {
    const item = BudgetUI.element("li", entry.date > today ? "accountEntry upcomingChange" : "accountEntry");
    item.appendChild(BudgetUI.element("span", "accountEntryDate", formatToMMDDYYYY(entry.date)));
    const amount = BudgetUI.element("span", "accountEntryAmount", (entry.change > 0 ? "+" : "") + formatMoney(entry.change));
    if (entry.change > 0) amount.classList.add("positive");
    if (entry.change < 0) amount.classList.add("negative");
    item.appendChild(amount);
    const type = getSpecialType(entry.sprite) === "⭕️" ? "⭕️ Transfer" : "✖️ Hidden";
    item.appendChild(BudgetUI.element("span", "accountEntryType", entry.date > today ? `${type}, coming up` : type));
    list.appendChild(item);
  }
  return BudgetUI.field("Entries", list, { hint: "What each entry put in or took out. Upcoming ones are on the calendar after today." });
}

// New section (index null, inserted at atIndex) or rename/delete the tapped one
function openCategoryPanel(tableName, origin, index, atIndex) {
  const existing = index === null ? null : ROW_TABLES[tableName].get()[index];
  BudgetUI.openPanel({
    origin,
    size: "large",
    title: existing ? "Change Section" : "New Section",
    build(form, panel) {
      const title = BudgetUI.textField({ label: "Section Title", value: existing ? existing[1] : "", placeholder: "Bills, income, fun..." });
      const buttons = existing
        ? [{ label: "Save", kind: "primary", type: "submit" }, { label: "Delete", kind: "danger", onClick: deleteSection }, { label: "Cancel", onClick: () => panel.close() }]
        : [{ label: "Add Section", kind: "primary", type: "submit" }, { label: "Cancel", onClick: () => panel.close() }];
      form.append(title.el, BudgetUI.buttonRow(buttons));

      form.addEventListener("submit", (event) => {
        event.preventDefault();
        if (!title.value()) return panel.setError("Give the section a title.");
        BudgetUI.submit(panel, () => existing
          ? renameCategoryRow(tableName, index, title.value())
          : addCategoryRow(tableName, atIndex, title.value()));
      });

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

function createDataTable(headers) {
  const tableEl = document.createElement("table");
  tableEl.className = "dataTable";
  const headRow = tableEl.createTHead().insertRow();
  for (let header of headers) {
    const th = document.createElement("th");
    th.textContent = header;
    headRow.appendChild(th);
  }
  tableEl.createTBody();
  return tableEl;
}

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
  return describeAliases(row[4]);
}

// What Costs, Gains, or Undefined counts, for its panel
function autoRowNote(row) {
  const rowType = cleanString(row[0]);
  if (rowType === "costs") return "Every cost, except transfers. This row fills in by itself.";
  if (rowType === "gains") return "Every gain, except transfers. This row fills in by itself.";
  const titles = trackerAliasText(row);
  return `Entries that no other row counts${titles ? ": " + titles : " (there aren't any right now)"}. This row fills in by itself.`;
}

function isBlankRow(row) {
  return row.every(value => String(value ?? "").trim() === "");
}

//#endregion
