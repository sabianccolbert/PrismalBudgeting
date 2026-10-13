// Budget Search: Home's and History's Search (the same one on both). It finds entries by title in History,
// the calendar, Upcoming, and (with a To date after the calendar) recurring entries and connected spreadsheets'
// entries still to come; see search() in Process Budget.js. The 🔎 Search button opens it, floating over the
// page, and its results show under it.

wireSearch(); // Works right away (a search before the budget loads says it's still loading)

// Suggestions for a title's Tracker button follow the tracker's rows
window.workspaceReady.then((loaded) => { if (loaded) fillTrackerRowTitles(); });
document.addEventListener("budget:updated", () => { if (workspaceLoaded) fillTrackerRowTitles(); });

// The Search button opens the search box, floating over the page (× , Escape, or Search again closes it). It
// has a list of titles, one per line, each with its own buttons (Enter adds the next line, and Enter on an
// empty line searches), and optional From / To dates; the results show under it.
function wireSearch() {
  const form = document.getElementById("searchForm");
  const slot = document.getElementById("searchTerms");
  const box = document.getElementById("searchBox");
  const openButton = document.getElementById("searchButton");
  if (!form || !slot || !box || !openButton) return;
  // In <body>: the page's #transitionContainer is transformed, which would make a fixed box scroll with it
  document.body.appendChild(box);
  // It zooms out of the Search button, and back into it (immediately: right away, when the page is left)
  let isOpen = false;
  const setOpen = (open, immediately = false) => {
    isOpen = open;
    openButton.setAttribute("aria-expanded", String(open));
    if (open) {
      box.hidden = false;
      window.FloatingWindows?.zoomOpen(box, openButton);
      if (window.matchMedia("(pointer: fine)").matches) box.querySelector(".termInput")?.focus({ preventScroll: true });
      return;
    }
    BudgetUI.setPickTarget(null);
    if (immediately || !window.FloatingWindows) {
      box.zoomAnimation?.cancel();
      box.hidden = true;
      return;
    }
    openButton.focus({ preventScroll: true });
    window.FloatingWindows.zoomClose(box, openButton, () => { box.hidden = true; });
  };
  openButton.addEventListener("click", () => setOpen(!isOpen));
  document.getElementById("searchClose").addEventListener("click", () => setOpen(false));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isOpen && !document.querySelector(".budgetPanel")) setOpen(false);
  });
  window.FloatingWindows?.closeOnPageExit(() => setOpen(false, true));
  // What each title finds (the spreadsheet typed rent-, rent+ and car stuff= instead, which still pick
  // these): All, Costs, Gains, or Tracker (the title is a tracker row: find what it counts)
  const searchButtons = [
    { key: "all", label: "All" },
    { key: "costs", label: "Costs" },
    { key: "gains", label: "Gains" },
    { key: "category", label: "Tracker" }
  ];
  for (const [id, word] of [["searchFrom", "From"], ["searchTo", "To"]]) {
    const input = document.getElementById(id);
    if (!input) continue;
    input.placeholder = `${word} ${datePattern()}`; // This device's date format, like From DD/MM/YYYY
    input.translate = false;
    input.addEventListener("focus", (event) => BudgetUI.setPickTarget(event.target));
    input.after(BudgetUI.datePickerButton(input, `${word} date`)); // 📅: the device's own date picker
  }

  const submitButton = form.querySelector("button[type=submit]");
  const typedEarly = slot.querySelector("input")?.value || ""; // Typed before this script loaded
  const terms = BudgetUI.termList({
    items: [{ title: typedEarly, mode: "all" }],
    options: searchButtons,
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

// Say something in place of the results (like why a search couldn't run)
function showSearchMessage(message) {
  const container = document.getElementById("searchResults");
  container.replaceChildren(BudgetUI.element("p", "searchMessage", message));
  container.hidden = false;
}

// Suggestions for a search title's Tracker button: the tracker's row titles. A row that counts transfers is
// "Food (counts transfers)", since a title can have one of each, and a suggestion list can only show the
// device's own ⭕️, not the site's (searchTargets in Process Budget.js reads it back)
function fillTrackerRowTitles() {
  const list = document.getElementById("trackerRowTitles");
  if (!list) return;
  const rowTitles = trackerData.slice(1)
    .filter(row => !["", "-"].includes(String(row[0] ?? "").trim()))
    .map(row => String(row[0]).trim())
    .map(title => (/^⭕/.test(title) ? `${title.replace(/^⭕️?\s*/, "")} ${COUNTS_TRANSFERS}` : title));
  list.replaceChildren(...[...new Set(rowTitles)].map(title => {
    const option = document.createElement("option");
    option.value = title;
    return option;
  }));
}

// Results: newest first, each with a checkbox and a running total of the checked amounts, like the
// spreadsheet's Search tab. Transfers start unchecked, unless a tracker
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
  BudgetUI.spanHeaderBar(tableEl);

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
    tr.appendChild(BudgetUI.element("td", "", showDate(result.date)));
    const amountCell = BudgetUI.element("td", "amountCell", formatMoney(result.amount));
    if (result.amount > 0) amountCell.classList.add("positive");
    if (result.amount < 0) amountCell.classList.add("negative");
    tr.appendChild(amountCell);
    tr.appendChild(BudgetUI.element("td", "", `${result.sprite} ${result.title}`));
    BudgetUI.noTranslate(tr); // Dates, amounts, and entries show as they are
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

