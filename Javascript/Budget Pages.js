// Budget Pages: the menu data pages (Recurring, History, Tracker, Change Logs, ...).
// Recurring and Tracker: New Entry, tap a row to change it, and an Edit mode with section
// buttons between rows, delete checkboxes, and a move bar to drag rows.
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
  accounts: null,
  calculator: null
};

const FREQUENCIES = ["Weekly", "Biweekly", "Semi-Monthly", "Monthly", "3 Month", "6 Month", "Yearly"];

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
// [title, amount, start MM/DD/YYYY, frequency, end date or "None", type emoji]
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
      tr.appendChild(cell(row[3]));
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
// [title, last 4 weeks, last 3 months, last year, aliases]
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
      tr.appendChild(cell(row[4], "aliasCell"));
    },
    onEntryClick: (index, origin) => openTrackerPanel(origin, index)
  });
  view.appendChild(wrapScroll(tableEl));
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

//#endregion

// =====================================================================
// #region TOOLBAR + EDIT MODE TABLE
// =====================================================================

// New Entry + Edit normally; Delete Selected + Done in edit mode
function renderToolbar(tableName, openNewEntry) {
  const bar = document.getElementById("pageToolbar");
  if (!bar) return;
  bar.replaceChildren();

  if (!editMode) {
    bar.append(toolbarButton("New Entry", "primary", (event) => openNewEntry(event.currentTarget)));
    bar.append(toolbarButton("Edit", "", () => {
      editMode = true;
      selectedRows.clear();
      BudgetUI.closePanel(true);
      renderCurrentPage();
    }));
    return;
  }

  const deleteButton = toolbarButton("Delete Selected", "danger", () => deleteSelected(tableName));
  deleteButton.id = "deleteSelectedButton";
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

async function deleteSelected(tableName) {
  const count = selectedRows.size;
  if (!count) return;
  const note = tableName === "recurring" ? " Recurring entries stop from today on; days that already passed keep theirs." : "";
  if (!window.confirm(`Delete ${count} row${count > 1 ? "s" : ""}?${note}`)) return;
  const result = await deleteBudgetRows(tableName, [...selectedRows]);
  if (!result.ok) return BudgetUI.showToast(result.message, true);
  selectedRows.clear();
  BudgetUI.warnIfUnsaved(result);
}

// Rows for a table: entries and sections, with a move bar + delete checkbox in edit mode,
// and "+ Section" buttons between rows
function buildRowTable({ tableName, columns, rows, renderEntry, onEntryClick, extraClass }) {
  const headers = editMode ? ["", "", ...columns] : columns;
  const tableEl = createDataTable(headers);
  if (extraClass) tableEl.classList.add(extraClass);
  if (editMode) tableEl.classList.add("isEditing");
  const body = tableEl.tBodies[0];

  for (const { index, row } of rows) {
    if (editMode) body.appendChild(sectionButtonRow(index, headers.length));

    const tr = document.createElement("tr");
    tr.dataset.index = index;
    if (editMode) {
      tr.appendChild(moveBarCell());
      tr.appendChild(selectCell(index));
      if (selectedRows.has(index)) tr.classList.add("selected");
    }
    if (isSeparatorRow(row)) {
      tr.classList.add("categoryRow");
      const td = document.createElement("td");
      td.colSpan = columns.length;
      td.textContent = row[1] ?? "";
      tr.appendChild(td);
    } else {
      renderEntry(tr, row);
    }
    tr.classList.add("clickable");
    body.appendChild(tr);
  }
  if (editMode) body.appendChild(sectionButtonRow(ROW_TABLES[tableName].get().length, headers.length));

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

function selectCell(index) {
  const td = document.createElement("td");
  td.className = "selectCell";
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

// New recurring entry (index null) or change the tapped one. A new entry whose title (and
// refraction type, when picked) already exists changes that entry, keeping anything left alone.
function openRecurringPanel(origin, index) {
  const existing = index === null ? null : recurringData[index];
  BudgetUI.openPanel({
    origin,
    size: "large",
    title: existing ? "Change Recurring Entry" : "New Recurring Entry",
    build(form, panel) {
      const existingEnd = existing && String(existing[4]).trim().toLowerCase() !== "none" ? parseTypedDate(existing[4]) : null;
      const frequencies = existing && !FREQUENCIES.includes(existing[3]) ? [...FREQUENCIES, existing[3]] : FREQUENCIES;

      const title = BudgetUI.textField({ label: "Title", value: existing ? existing[0] : "", placeholder: "Rent, paycheck, phone..." });
      const amount = BudgetUI.amountField({ amount: existing ? parseAmount(existing[1]) : null });
      const frequency = BudgetUI.selectField({ label: "Frequency", options: frequencies, value: existing ? existing[3] : "Monthly" });
      const start = BudgetUI.dateField({ label: "Start Date", date: existing ? parseTypedDate(existing[2]) : today });
      const end = BudgetUI.dateField({ label: "End Date", date: existingEnd && !isNaN(existingEnd) ? existingEnd : null, optional: true });
      const refraction = BudgetUI.refractionField({ value: existing ? getSpecialType(existing[5]) : "", allowAuto: !existing });
      let frequencyTouched = false;
      frequency.input.addEventListener("change", () => { frequencyTouched = true; });

      const buttons = existing
        ? [{ label: "Save", kind: "primary", type: "submit" }, { label: "Delete", kind: "danger", onClick: deleteEntry }, { label: "Cancel", onClick: () => panel.close() }]
        : [{ label: "Add Entry", kind: "primary", type: "submit" }, { label: "Cancel", onClick: () => panel.close() }];
      form.append(title.el, amount.el, frequency.el, start.el, end.el, refraction.el, BudgetUI.buttonRow(buttons));

      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const fields = { title: title.value(), amount: amount.value(), startDate: start.value(), endDate: end.value() };
        if (!fields.title) return panel.setError("Give the recurring entry a title.");
        if (Number.isNaN(fields.amount)) return panel.setError("Enter an amount, like 12.50.");
        if (!existing && fields.amount === null) return panel.setError("Enter an amount, like 12.50.");
        if (fields.startDate === undefined || fields.endDate === undefined) return panel.setError("That date isn't a real day. Use MM/DD/YYYY.");
        const refractionValue = refraction.value();
        fields.sprite = refractionValue ? BudgetUI.RECURRING_SPRITES[refractionValue] : "";

        if (existing) {
          fields.frequency = frequency.value();
          fields.endDate = fields.endDate || "None";
        } else {
          // Left alone = keep whatever a same-title entry already has (new entries get the defaults)
          fields.frequency = frequencyTouched ? frequency.value() : "";
          if (!start.touched()) fields.startDate = null;
        }
        BudgetUI.submit(panel, () => saveRecurringEntry(fields, index));
      });

      function deleteEntry() {
        if (!window.confirm(`Delete ${existing[0]}? It stops from today on; days that already passed keep it.`)) return;
        BudgetUI.submit(panel, () => deleteBudgetRows("recurring", [index]));
      }
    }
  });
}

// New tracker row (index null) or change the tapped one
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
      const aliasHint = isAuto
        ? (cleanString(existing[0]) === "undefined" ? "Filled in automatically: entry titles no other row tracks." : "Counts every entry automatically.")
        : "Entry titles to count, separated by commas. rent- counts only costs, paycheck+ only gains.";
      const aliases = BudgetUI.textField({ label: "Aliases", value: existing ? existing[4] : "", placeholder: "rent-, paycheck+, atm", multiline: true, hint: aliasHint, disabled: isAuto, optional: !isAuto });
      const transfers = BudgetUI.checkboxField({ label: "Also count ⭕️ Transfers", checked: existing ? String(existing[0]).startsWith("⭕️") : false, disabled: isAuto });

      const buttons = existing
        ? [...(isAuto ? [] : [{ label: "Save", kind: "primary", type: "submit" }]), { label: "Delete", kind: "danger", onClick: deleteRow }, { label: isAuto ? "Close" : "Cancel", onClick: () => panel.close() }]
        : [{ label: "Add Row", kind: "primary", type: "submit" }, { label: "Cancel", onClick: () => panel.close() }];
      form.append(title.el, aliases.el, transfers.el, BudgetUI.buttonRow(buttons));

      form.addEventListener("submit", (event) => {
        event.preventDefault();
        if (isAuto) return;
        const fields = { title: title.value(), aliases: aliases.input.value, tracksTransfers: transfers.value() };
        if (!fields.title) return panel.setError("Give the tracker row a title.");
        BudgetUI.submit(panel, () => saveTrackerEntry(fields, index));
      });

      function deleteRow() {
        const note = isAuto ? " It comes back automatically." : "";
        if (!window.confirm(`Delete ${existing[0]}?${note}`)) return;
        BudgetUI.submit(panel, () => deleteBudgetRows("tracker", [index]));
      }
    }
  });
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

function isBlankRow(row) {
  return row.every(value => String(value ?? "").trim() === "");
}

//#endregion
