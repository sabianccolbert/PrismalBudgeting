// Budget Search: Home's and History's Search (the same one on both). It finds entries by title in History,
// the calendar, Upcoming, and (with a To date after the calendar) recurring entries and connected spreadsheets'
// entries still to come; see search() in Process Budget.js. The Search button opens it, floating over the
// page, and its results show under it.

wireSearch(); // Works right away (a search before the budget loads says it's still loading)

// Suggestions for a title's Tracker button follow the tracker's rows, and the Other Account filter the accounts
window.workspaceReady.then((loaded) => { if (loaded) { fillTrackerRowTitles(); fillAccountFilter(); } });
document.addEventListener("budget:updated", () => { if (workspaceLoaded) { fillTrackerRowTitles(); fillAccountFilter(); } });

// The Other Account filter: any, none, or one of the accounts (keeping the one picked while it's still there)
function fillAccountFilter() {
  const select = document.getElementById("searchAccount");
  if (!select) return;
  const picked = select.value;
  const names = typeof accountsData !== "undefined" && accountsData ? accountRows().map(account => account.name) : [];
  select.replaceChildren(new Option("Any account", ""), new Option("No Other Account", "none"), ...names.map(name => new Option(name, name)));
  select.value = picked === "none" || names.includes(picked) ? picked : "";
}

// The Search button opens the search box, floating over the page (× , Escape, or Search again closes it). It
// has a list of titles, one per line, each with its own buttons (Enter adds the next line, and Enter on an
// empty line searches), and optional From / To dates; the results show under it.
function wireSearch() {
  const form = document.getElementById("searchForm");
  const slot = document.getElementById("searchTerms");
  const box = document.getElementById("searchBox");
  const openButton = document.getElementById("searchButton");
  if (!form || !slot || !box || !openButton) return;
  // In the screen layer (Layout.js): it stays on the visible screen, out of the page's #transitionContainer, which is
  // transformed and would make a fixed box scroll with it
  (window.ScreenLayer ? window.ScreenLayer.element : document.body).appendChild(box);
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
    input.after(BudgetUI.datePickerButton(input, `${word} date`)); // The calendar button: a calendar to pick a day (Dates.js)
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
    onEnterEmpty: () => submitButton.click(),
    // Exact: only entries with just this title; off, any title with it in it ("gas" finds Gas Station too). A
    // tracker row is always found by its own title.
    exact: true,
    noExact: ["category"],
    help: { label: "What All, Costs, Gains, and Tracker find", content: searchHelp() }
  });
  // The page has a first line already (so nothing moves while the page loads); the working list
  // looks the same. The ? before its All shows what the buttons do, under the titles.
  slot.replaceChildren(terms.lines, terms.helpBox);
  const pageAddButton = document.getElementById("searchAdd");
  terms.addButton.id = "searchAdd";
  if (pageAddButton) pageAddButton.replaceWith(terms.addButton);
  else form.querySelector(".searchDates")?.prepend(terms.addButton);

  // Filters: one refraction type, and one Other Account (or entries with none). A list can't show the type's
  // image (only the device's own emoji), so types are in words.
  const filters = BudgetUI.element("div", "searchFilters");
  const typeFilter = BudgetUI.element("select", "selectInput");
  typeFilter.id = "searchType";
  typeFilter.setAttribute("aria-label", "Refraction type");
  typeFilter.append(new Option("Any type", ""), ...[...REFRACTION_NAMES].map(([sprite, name]) => new Option(name, sprite)));
  const accountFilter = BudgetUI.element("select", "selectInput");
  accountFilter.id = "searchAccount";
  accountFilter.setAttribute("aria-label", "Other Account");
  filters.append(typeFilter, accountFilter);
  form.querySelector(".searchDates")?.before(filters);
  fillAccountFilter();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    submitButton.disabled = true;
    const result = await searchBudget({
      terms: terms.items().map(({ title, mode, exact }) => ({ title, match: mode, exact })),
      from: document.getElementById("searchFrom").value,
      to: document.getElementById("searchTo").value,
      type: typeFilter.value,
      account: accountFilter.value
    });
    submitButton.disabled = false;
    BudgetUI.setPickTarget(null);
    BudgetUI.warnIfUnsaved(result);
    if (!result.ok) return showSearchMessage(result.message);
    renderSearchResults(result.search);
  });
}

// What a title's buttons find (the ? before the first title's All)
function searchHelp() {
  const list = BudgetUI.element("ul");
  const item = (name, text) => {
    const li = BudgetUI.element("li");
    li.append(BudgetUI.element("strong", "", name), `: ${text}`);
    list.appendChild(li);
  };
  item("All", "every entry with this title, its costs and its gains.");
  item("Costs", "only this title's costs.");
  item("Gains", "only this title's gains.");
  item("Tracker", "the title is one of your tracker rows (like Food), and it finds the entries that row counts: the titles in its aliases, each counting All, Costs, or Gains the way the row does, and transfers too when the row counts them. The Costs, Gains, and Transfers rows find every cost, gain, or transfer.");
  item("Exact", "on, only entries with this exact title. Off, any title with these words in it (gas finds Gas Station too). Tracker always finds the row with this title.");
  list.appendChild(BudgetUI.element("li", "", "With no title, All, Costs, or Gains finds every entry, cost, or gain between the dates."));
  return list;
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
  // Entries after today come first, under "Coming up", and a line sets them apart from today and before
  const dividerRow = (text) => {
    const tr = body.insertRow();
    tr.className = "searchDivider";
    const td = tr.insertCell();
    td.colSpan = 4;
    td.textContent = text;
  };
  const hasComing = results.some(result => result.date > today);
  let pastShown = false;
  if (hasComing) dividerRow("Coming up");
  const checkboxes = results.map(result => {
    if (hasComing && !pastShown && result.date <= today) {
      pastShown = true;
      dividerRow("Today and before");
    }
    const tr = body.insertRow();
    if (result.date > today) tr.classList.add("searchComing");
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
    const percent = percentOf(result.sprite);
    const entryCell = BudgetUI.element("td", "", `${baseSprite(result.sprite)} ${result.title}${percent !== null ? ` (${showPercent(percent)})` : ""}`);
    tr.appendChild(entryCell);
    // (A placeholder's amount and entry are yellow)
    if (isPlaceholder(result.sprite)) [amountCell, entryCell].forEach(td => td.classList.add("isPlaceholder"));
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

