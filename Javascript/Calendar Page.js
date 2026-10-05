// Calendar Page: the home page. Search bar and results, "Lowest in bank after today", Dave,
// Upcoming, the calendar's day cells, and the new-entry / entry-options panels.
// Zooming a day is handled in Process Budget.js (LAYOUT FUNCTIONS); tapping an entry inside a
// zoomed day opens its options here.

// =====================================================================
// #region SETUP
// =====================================================================

// The search bar works right away (a search before the budget loads says it's still loading)
wireSearch();

window.workspaceReady.then((loaded) => {
  if (!loaded) {
    const dave = document.getElementById("daveMessage");
    if (dave) dave.textContent = "Couldn't load your budget data. Please refresh to try again.";
    return;
  }
  renderHome();
  wireCalendar();
  document.getElementById("addEntryButton")?.addEventListener("click", (event) => openNewEntryPanel(event.currentTarget));
  document.getElementById("quickEntryButton")?.addEventListener("click", (event) => openQuickEntrySetup(event.currentTarget));
});

document.addEventListener("budget:updated", () => {
  if (workspaceLoaded) renderHome();
});

function renderHome() {
  renderCalendar();
  renderInfoRow();
  fillTrackerRowTitles();
}

//#endregion

// =====================================================================
// #region CALENDAR
// =====================================================================

// Draw each day: date, system lines, then entries (one element per line so entries are tappable)
function renderCalendar() {
  const cells = document.querySelectorAll(".elastic-table td");
  cells.forEach((td, index) => {
    const r = Math.floor(index / 7);
    const c = index % 7;
    const content = td.querySelector(".cell-content");
    if (!content || !calendarData[r]) return;

    const fragment = document.createDocumentFragment();
    String(calendarData[r][c] ?? "").split("\n").forEach((line, l) => {
      if (l === 0 || line.trim()) fragment.appendChild(BudgetUI.renderEntryLine(line, l));
    });

    // Closes the zoomed day (handled in Process Budget.js)
    const closeButton = document.createElement("button");
    closeButton.className = "cell-action-btn";
    closeButton.type = "button";
    closeButton.textContent = "v";
    closeButton.setAttribute("aria-label", "Close day");
    content.replaceChildren(fragment, closeButton);

    td.dataset.row = r;
    td.dataset.col = c;
    td.classList.toggle("isToday", gridDates[r][c].getTime() === today.getTime());
    // The last day also turns red when the 28 days after the calendar go negative (its "Lowest" line)
    const isLastDay = r === 3 && c === 6;
    td.classList.toggle("isNegative", (readInBank(calendarData[r][c]) ?? 0) < 0 || (isLastDay && nextFourNegative));
  });
}

function wireCalendar() {
  const calendarTable = document.querySelector(".elastic-table");
  if (!calendarTable) return;

  // While a date field is waiting, tapping a day fills it in instead of zooming the day
  calendarTable.addEventListener("click", (event) => {
    if (!BudgetUI.datePickActive()) return;
    const td = event.target.closest("td");
    if (!td || td.dataset.row === undefined) return;
    event.stopPropagation();
    event.preventDefault();
    BudgetUI.pickDate(gridDates[td.dataset.row][td.dataset.col], td);
  }, true);

  // Tapping an entry inside a zoomed day opens its options
  calendarTable.addEventListener("click", (event) => {
    const lineEl = event.target.closest(".lineEntry");
    if (!lineEl) return;
    const td = lineEl.closest("td");
    if (!td || !td.classList.contains("is-editing")) return;
    openEntryOptions(lineEl, Number(td.dataset.row), Number(td.dataset.col), Number(lineEl.dataset.line));
  });
}

//#endregion

// =====================================================================
// #region INFO ROW (lowest in bank, Dave, upcoming)
// =====================================================================

function renderInfoRow() {
  const lowest = document.getElementById("lowestAmount");
  if (lowest) {
    lowest.textContent = formatMoney(lowestInBank);
    lowest.classList.toggle("negative", lowestInBank < 0);
  }

  const dave = document.getElementById("daveMessage");
  if (dave) dave.textContent = daveMessage;

  const list = document.getElementById("upcomingList");
  if (!list) return;
  list.replaceChildren();
  if (upcomingEntries.length === 0) {
    list.appendChild(BudgetUI.element("li", "upcomingEmpty", "Nothing scheduled past this calendar."));
    return;
  }
  for (const upcoming of upcomingEntries) {
    const item = BudgetUI.element("li", "upcomingItem");
    item.appendChild(BudgetUI.element("span", "upcomingDate", formatToMMDDYYYY(upcoming.date)));
    const entry = BudgetUI.element("span", "upcomingEntry", `${upcoming.sprite} ${formatMoney(upcoming.amount)} ${upcoming.title}`);
    if (upcoming.amount > 0) entry.classList.add("positive");
    item.appendChild(entry);
    list.appendChild(item);
  }
}

//#endregion

// =====================================================================
// #region ENTRY PANELS
// =====================================================================

// New entry: title, amount (cost or gain), date, optional refraction type, and for Hidden or Transfer,
// an Other Account. Same title + refraction type on that day combines with what's there.
function openNewEntryPanel(origin) {
  BudgetUI.openPanel({
    origin,
    size: "large",
    title: "New Entry",
    build(form, panel) {
      const fields = BudgetUI.newEntryFields({ accounts: otherAccountNames() });
      form.append(...fields.els, BudgetUI.buttonRow([
        { label: "Add Entry", kind: "primary", type: "submit" },
        { label: "Cancel", onClick: () => panel.close() }
      ]));

      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const { entry, error } = fields.read();
        if (error) return panel.setError(error);
        BudgetUI.submit(panel, () => addCalendarEntry(entry));
      });
    }
  });
}

// Quick Entry Icon: makes a key (only while signed in) and opens the Quick Entry page with it in the
// link, ready to add to the home screen. The icon then opens that New Entry form with no login. The key
// can only add entries (they join the budget the next time it opens), and stops working when the
// password changes.
function openQuickEntrySetup(origin) {
  BudgetUI.openPanel({
    origin,
    size: "large",
    title: "Quick Entry Icon",
    build(form, panel) {
      const text = (line) => BudgetUI.element("p", "panelText", line);
      form.append(
        text("Put an icon on your phone's home screen that opens a New Entry form, with no login needed."),
        text("The icon can only add entries. It never sees your budget, just the names of your Other Accounts (so you can pick one). Its entries show up here the next time you open Prismal Budget. If your password changes, it stops working."),
        text("On the next page, add it to your home screen: on iPhone, tap Share, then Add to Home Screen. On Android, tap ⋮, then Add to Home screen."),
        BudgetUI.buttonRow([
          { label: "Set It Up", kind: "primary", type: "submit" },
          { label: "Cancel", onClick: () => panel.close() }
        ])
      );

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        panel.setError("");
        panel.setBusy(true);
        const result = await budgetApi("/api/quick/key", {});
        if (!result.ok || !result.data || !result.data.key) {
          panel.setBusy(false);
          panel.setError(result.status === 0 ? "Couldn't reach the server. Please try again." : "Couldn't set it up. Please try again.");
          return;
        }
        const url = `/quick.html?key=${encodeURIComponent(result.data.key)}&setup=1`;
        if (typeof window.transitionTo === "function") window.transitionTo(url);
        else window.location.href = url;
      });
    }
  });
}

// Options for an entry tapped inside a zoomed day: set or add to the amount, move it, or delete it
function openEntryOptions(lineEl, r, c, lineIndex) {
  const line = String(calendarData[r][c]).split("\n")[lineIndex];
  if (!line) return;
  const parts = getParts(line);
  const refraction = getSpecialType(parts[0]);
  const currentAmount = parseAmount(parts[1]);
  const title = parts.slice(2).join(" ");
  const date = gridDates[r][c];

  BudgetUI.openPanel({
    origin: lineEl,
    size: "small",
    title: `${formatToMMDD(date)} Entry`,
    build(form, panel) {
      const display = BudgetUI.renderEntryLine(line, lineIndex);
      display.classList.add("panelEntry");
      // An entry for an Other Account changes it by the opposite amount
      const account = linkedAccount(parts[0], cleanString(title));
      const accountNote = account ? BudgetUI.element("p", "panelHint", `${account.name} (Other Accounts) changes by the opposite of this entry's amount.`) : null;

      let mode = "set";
      const amount = BudgetUI.amountField({ label: "Amount", amount: currentAmount });
      const modeToggle = BudgetUI.segmented(
        [{ key: "set", label: "Set to" }, { key: "add", label: "Add to it" }],
        "set",
        (key) => {
          mode = key;
          amount.input.value = key === "set" ? Math.abs(currentAmount).toFixed(2) : "";
          amount.setSign(key === "set" && currentAmount > 0 ? 1 : -1);
        }
      );
      const moveTo = BudgetUI.dateField({ label: "Move to", optional: true });

      form.append(display, ...(accountNote ? [accountNote] : []), BudgetUI.field("Change the amount", modeToggle.el), amount.el, moveTo.el, BudgetUI.buttonRow([
        { label: "Save", kind: "primary", type: "submit" },
        { label: "Delete", kind: "danger", onClick: deleteEntry },
        { label: "Cancel", onClick: () => panel.close() }
      ]));

      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const newAmount = amount.value();
        const move = moveTo.value();
        if (Number.isNaN(newAmount)) return panel.setError("Enter an amount, like 12.50.");
        if (move === undefined) return panel.setError("That date isn't a real day. Use MM/DD/YYYY.");

        const change = { title, sprite: refraction, date, action: "set", amount: "" };
        const amountChanged = newAmount !== null && (mode === "set" ? newAmount !== currentAmount : newAmount !== 0);
        if (amountChanged) {
          change.action = mode === "set" ? "set" : (newAmount > 0 ? "add" : "subtract");
          change.amount = mode === "set" ? String(newAmount) : String(Math.abs(newAmount));
        }
        if (move && move.getTime() !== date.getTime()) change.moveDate = move;
        if (!amountChanged && !change.moveDate) return panel.close(); // Nothing changed

        BudgetUI.submit(panel, () => changeCalendarEntry(change));
      });

      function deleteEntry() {
        if (!window.confirm(`Delete ${title} on ${formatToMMDD(date)}?`)) return;
        BudgetUI.submit(panel, () => changeCalendarEntry({ title, sprite: refraction, date, action: "delete" }));
      }
    }
  });
}

//#endregion

// =====================================================================
// #region SEARCH
// =====================================================================

// A list of titles, one per line, each with its own buttons (Enter adds the next line, and Enter on an
// empty line searches), and optional From / To dates
function wireSearch() {
  const form = document.getElementById("searchForm");
  const slot = document.getElementById("searchTerms");
  if (!form || !slot) return;
  // What each title finds (the spreadsheet typed rent-, rent+ and car stuff= instead, which still pick
  // these): All, Costs, Gains, or Tracker (the title is a tracker row: find what it counts)
  const searchButtons = [
    { key: "all", label: "All" },
    { key: "costs", label: "Costs" },
    { key: "gains", label: "Gains" },
    { key: "category", label: "Tracker" }
  ];
  for (const id of ["searchFrom", "searchTo"]) {
    document.getElementById(id)?.addEventListener("focus", (event) => BudgetUI.setPickTarget(event.target));
  }

  const submitButton = form.querySelector("button[type=submit]");
  const typedEarly = slot.querySelector("input")?.value || ""; // Typed before this script loaded
  const terms = BudgetUI.termList({
    items: [{ title: typedEarly, mode: "all" }],
    options: searchButtons,
    endings: { "-": "costs", "+": "gains", "=": "category" },
    label: "Titles to search for",
    lineLabel: "Title",
    addLabel: "+ Add Title",
    // Tracker looks for tracker rows by title, so those get suggested
    placeholder: (mode) => (mode === "category" ? "Tracker row, like Food" : "Title, like rent"),
    suggestions: (mode) => (mode === "category" ? "trackerRowTitles" : null),
    onEnterEmpty: () => submitButton.click()
  });
  // The page has a first line already (so nothing moves while the page loads); the working list
  // looks the same
  slot.replaceChildren(terms.lines);
  const pageAddButton = document.getElementById("searchAdd");
  terms.addButton.id = "searchAdd";
  if (pageAddButton) pageAddButton.replaceWith(terms.addButton);
  else form.querySelector(".searchDates")?.prepend(terms.addButton);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    submitButton.disabled = true;
    const result = await searchBudget({
      terms: terms.items().map(({ title, mode }) => ({ title, match: mode })),
      from: document.getElementById("searchFrom").value,
      to: document.getElementById("searchTo").value
    });
    submitButton.disabled = false;
    BudgetUI.setPickTarget(null);
    BudgetUI.warnIfUnsaved(result);
    if (!result.ok) return showSearchMessage(result.message);
    renderSearchResults(result.search);
  });
}

function showSearchMessage(message) {
  const container = document.getElementById("searchResults");
  container.replaceChildren(BudgetUI.element("p", "searchMessage", message));
  container.hidden = false;
}

// Suggestions for a search title's Tracker button: the tracker's row titles
function fillTrackerRowTitles() {
  const list = document.getElementById("trackerRowTitles");
  if (!list) return;
  const rowTitles = trackerData.slice(1)
    .filter(row => !["", "-"].includes(String(row[0] ?? "").trim()))
    .map(row => String(row[0]).replace(/⭕️/g, "").trim());
  list.replaceChildren(...[...new Set(rowTitles)].map(title => {
    const option = document.createElement("option");
    option.value = title;
    return option;
  }));
}

// Results: newest first, each with a checkbox and a running total of the checked amounts, like the
// spreadsheet's Search tab. Transfers (and entries for Other Accounts) start unchecked, unless a tracker
// row that counts transfers found them.
function renderSearchResults({ results, from, to, searchingFor }) {
  const container = document.getElementById("searchResults");
  container.replaceChildren();
  container.hidden = false;

  const header = BudgetUI.element("div", "searchHeader");
  header.appendChild(BudgetUI.element("p", "searchSummary", `Searching from ${from} to ${to} for: ${searchingFor}`));
  const closeButton = BudgetUI.element("button", "panelClose", "×");
  closeButton.type = "button";
  closeButton.setAttribute("aria-label", "Close search results");
  closeButton.addEventListener("click", () => {
    container.hidden = true;
    container.replaceChildren();
  });
  header.appendChild(closeButton);
  container.appendChild(header);

  if (results.length === 0) {
    container.appendChild(BudgetUI.element("p", "searchMessage", "No entries found."));
    return;
  }

  const total = BudgetUI.element("p", "searchTotal");
  container.appendChild(total);

  const tableEl = document.createElement("table");
  tableEl.className = "dataTable searchTable";
  const headRow = tableEl.createTHead().insertRow();
  const masterCell = document.createElement("th");
  const master = document.createElement("input");
  master.type = "checkbox";
  master.setAttribute("aria-label", "Check all");
  masterCell.appendChild(master);
  headRow.appendChild(masterCell);
  for (const label of ["Date", "Amount", "Entry"]) headRow.appendChild(BudgetUI.element("th", "", label));

  const body = tableEl.createTBody();
  const checkboxes = results.map(result => {
    const tr = body.insertRow();
    const checkCell = tr.insertCell();
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = result.checked;
    checkbox.dataset.amount = result.amount;
    checkbox.setAttribute("aria-label", `Count ${result.title}`);
    checkCell.appendChild(checkbox);
    tr.appendChild(BudgetUI.element("td", "", formatToMMDDYYYY(result.date)));
    const amountCell = BudgetUI.element("td", "amountCell", formatMoney(result.amount));
    if (result.amount > 0) amountCell.classList.add("positive");
    if (result.amount < 0) amountCell.classList.add("negative");
    tr.appendChild(amountCell);
    tr.appendChild(BudgetUI.element("td", "", `${result.sprite} ${result.title}`));
    return checkbox;
  });

  const updateTotal = () => {
    const checked = checkboxes.filter(box => box.checked);
    const sum = checked.reduce((runningTotal, box) => runningTotal + Number(box.dataset.amount), 0);
    total.textContent = `${results.length} found · ${checked.length} checked · Total: ${formatMoney(sum)}`;
    total.classList.toggle("positive", sum > 0);
    total.classList.toggle("negative", sum < 0);
    master.checked = checked.length === checkboxes.length;
    master.indeterminate = checked.length > 0 && checked.length < checkboxes.length;
  };
  body.addEventListener("change", updateTotal);
  master.addEventListener("change", () => {
    checkboxes.forEach(box => { box.checked = master.checked; });
    updateTotal();
  });
  updateTotal();

  const scroll = BudgetUI.element("div", "dataScroll searchScroll");
  scroll.appendChild(tableEl);
  container.appendChild(scroll);
}

//#endregion
