// Budget Search: Home's Search. It finds entries by title in History,
// the calendar, Upcoming, and (with a To date after the calendar) recurring entries and connected spreadsheets'
// entries still to come; see search() in Process Budget.js. Its header's three buttons (like the calendar's) pick the
// budget, the calendar's entries (Calendar Fractals, searchCalendar below, between times too), or both. The Search
// button opens it, floating over the page, and its results show under it. Tapping a result opens its options, like an
// entry on a zoomed day, and the results follow every change.

wireSearch(); // Works right away (a search before the budget loads says it's still loading)

// The query whose results are showing (null for none), to look again after a change
let shownSearch = null;

// Suggestions for a title's Tracker button follow the tracker's rows, and the Equity account filter the accounts
window.workspaceReady.then((loaded) => { if (loaded) { fillTrackerRowTitles(); fillAccountFilter(); } });
document.addEventListener("budget:updated", () => {
  if (!workspaceLoaded) return;
  fillTrackerRowTitles();
  fillAccountFilter();
  refreshSearchResults();
});
// (A calendar entry changed: results with the calendar in them follow it)
document.addEventListener("fractals:changed", () => {
  if (workspaceLoaded && shownSearch && shownSearch.scope !== "budget") refreshSearchResults();
});

// The results showing are found again after a change (or another device's), so they show the budget as it is now. Not a
// search of its own: the change's log row (being written while the page redraws) is left as it was.
function refreshSearchResults() {
  const container = document.getElementById("searchResults");
  if (!shownSearch || !container || container.hidden) return;
  if (shownSearch.scope !== "budget" && !window.Fractals.data()) return; // (The calendar's results wait for it to load)
  const logRow = [...formEntryRow];
  try {
    const budget = shownSearch.scope === "calendar" ? null : search(shownSearch);
    const calendar = shownSearch.scope === "budget" ? null : searchCalendar(shownSearch);
    renderSearchResults(budget, calendar);
  } catch (error) {
    if (!(error instanceof BudgetInputError)) console.warn("Search couldn't look again:", error);
  } finally {
    formEntryRow = logRow;
  }
}

// What Search looks through (its header's three buttons, like the calendar's: Calendar Page.js wireCalendarHeader). As
// Search opens (follow), they start as the calendar shows, until one is picked here; a page without the calendar (it
// loads after this script) or the Quick Calendar page only searches the budget, with no buttons. With the calendar in it,
// From time and To time show under the dates; with only the calendar, the budget's own filters and each title's All,
// Costs, Gains, and Tracker go (#searchBox.calendarOnly). { value(), times() ({ from, to }: "HH:MM", or "" for none),
// follow() }
function wireSearchScope(box, form, submitButton) {
  const header = box.querySelector(".panelHeader");
  const times = BudgetUI.element("div", "searchTimes");
  const timeBox = (label) => {
    const input = BudgetUI.element("input", "dateInput timeInput");
    input.type = "time";
    input.setAttribute("aria-label", label);
    const wrap = BudgetUI.element("label", "searchTime");
    wrap.append(BudgetUI.element("span", "fieldLabel", label), input);
    times.appendChild(wrap);
    return input;
  };
  const fromTime = timeBox("From time");
  const toTime = timeBox("To time");
  times.appendChild(BudgetUI.element("span", "panelHint searchTimesHint", "Optional: only calendar entries during these times (all-day ones always count)."));
  submitButton.before(times);
  const show = (key) => {
    box.classList.toggle("calendarOnly", key === "calendar");
    times.hidden = key === "budget";
    form.querySelector(".searchDates")?.classList.toggle("withTimes", key !== "budget");
  };
  let picked = false;
  const scope = BudgetUI.segmented([
    { key: "budget", label: "$", name: "Search the budget only" },
    { key: "both", label: "$", name: "Search the budget and the calendar" },
    { key: "calendar", label: "", name: "Search the calendar only" }
  ], "budget", (key) => {
    picked = true;
    show(key);
  });
  scope.el.classList.add("calendarView", "searchScope");
  scope.el.setAttribute("aria-label", "What to search");
  for (const button of [scope.el.children[1], scope.el.children[2]]) {
    const icon = BudgetUI.element("span", "buttonIcon iconCalendar");
    icon.setAttribute("aria-hidden", "true");
    button.append(icon);
  }
  header.querySelector(".panelClose").before(scope.el);
  const follow = () => {
    const calendar = !!window.Fractals && typeof window.Fractals.view === "function" && !window.Fractals.isQuick();
    scope.el.hidden = !calendar;
    if (!calendar) scope.set("budget");
    else if (!picked) scope.set(window.Fractals.view());
    show(scope.value());
  };
  follow();
  return { value: () => scope.value(), times: () => ({ from: fromTime.value, to: toTime.value }), follow };
}

// The calendar's entries a search finds: each one that happens from its From day through its To day (the same days the
// budget's search uses: without a From day, from the calendar's first day, a year before the budget began; without a To
// day, a month ahead) whose title one of its titles finds (All, Costs, and Gains each find any; Tracker is for the
// budget's tracker rows, so it finds none; no title finds every entry), and, with times, that's on during them (a To
// time before the From time goes past midnight, like 10:00 PM to 2:00 AM).
// { results: [{ event, day, start (minutes, 0 for all day) }] newest first, from, to (as shown) }
function searchCalendar(query) {
  const rawFrom = String(query.from || "").trim();
  const rawTo = String(query.to || "").trim();
  let fromDate = rawFrom ? parseTypedDate(rawFrom) : null;
  let toDate = rawTo ? parseTypedDate(rawTo) : null;
  if ((fromDate && isNaN(fromDate.getTime())) || (toDate && isNaN(toDate.getTime()))) {
    throw new BudgetInputError(`Search dates should look like ${datePattern()}.`);
  }
  if (!toDate) toDate = addMonths(fromDate && fromDate > today ? fromDate : today, 1);
  if (!fromDate) fromDate = calendarRange().first;
  if (fromDate > toDate) [fromDate, toDate] = [toDate, fromDate];
  const fromMinutes = searchMinutes(query.fromTime);
  const toMinutes = searchMinutes(query.toTime);

  const terms = (Array.isArray(query.terms) ? query.terms : []).map(term => ({ clean: cleanString(term.title || ""), match: term.match, exact: !!term.exact }));
  const titled = terms.filter(term => term.clean !== "");
  const finds = (title) => {
    if (titled.length === 0) return !terms.length || terms[0].match !== "category";
    const clean = cleanString(title);
    return titled.some(term => term.match !== "category" && (term.exact ? clean === term.clean : clean.includes(term.clean)));
  };
  // On during the times: an all-day or multi-day entry always is; one inside a day overlaps them (one that ends as they
  // start doesn't, and one that starts as they end does)
  const overlaps = (start, end, from, to) => (end > from || (end === start && start >= from)) && start <= to;
  const during = (event, day, last) => {
    if (fromMinutes === null && toMinutes === null) return true;
    if (event.allDay || day !== last) return true;
    const start = searchMinutes(event.startTime);
    const end = searchMinutes(event.endTime);
    const from = fromMinutes ?? 0;
    const to = toMinutes ?? 24 * 60;
    return from <= to ? overlaps(start, end, from, to) : overlaps(start, end, from, 24 * 60) || overlaps(start, end, 0, to);
  };

  const found = window.Fractals && window.Fractals.data()
    ? window.Fractals.occurrencesBetween(formatToYMD(fromDate), formatToYMD(toDate))
      .filter(({ event, day, last }) => finds(event.title) && during(event, day, last))
      .map(({ event, day }) => ({ event, day, start: event.allDay ? 0 : searchMinutes(event.startTime) }))
    : [];
  found.sort((a, b) => (a.day === b.day ? b.start - a.start : a.day < b.day ? 1 : -1));
  return { results: found, from: showDate(fromDate), to: showDate(toDate) };
}

// A time box's "HH:MM" (or an entry's start or end) as minutes into the day, or null for none
function searchMinutes(time) {
  return /^\d{2}:\d{2}$/.test(time || "") ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)) : null;
}

// The Equity account filter: any, none, or one of the accounts (keeping the one picked while it's still there)
function fillAccountFilter() {
  const select = document.getElementById("searchAccount");
  if (!select) return;
  const picked = select.value;
  const names = typeof accountsData !== "undefined" && accountsData ? accountRows().map(account => account.name) : [];
  select.replaceChildren(new Option("Any account", ""), new Option("No Equity Account", "none"), ...names.map(name => new Option(name, name)));
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
      scope.follow(); // (What it looks through starts as the calendar shows)
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
    help: { label: "What All, Costs, Gains, Tracker, and the buttons at the top find", content: searchHelp() }
  });
  // The page has a first line already (so nothing moves while the page loads); the working list
  // looks the same. The ? before its All shows what the buttons do, under the titles.
  slot.replaceChildren(terms.lines, terms.helpBox);
  const pageAddButton = document.getElementById("searchAdd");
  terms.addButton.id = "searchAdd";
  if (pageAddButton) pageAddButton.replaceWith(terms.addButton);
  else form.querySelector(".searchDates")?.prepend(terms.addButton);

  // Filters: one refraction type, and one Equity account (or entries with none). A list can't show the type's
  // image (only the device's own emoji), so types are in words.
  const filters = BudgetUI.element("div", "searchFilters");
  const typeFilter = BudgetUI.element("select", "selectInput");
  typeFilter.id = "searchType";
  typeFilter.setAttribute("aria-label", "Refraction type");
  typeFilter.append(new Option("Any type", ""), ...[...REFRACTION_NAMES].map(([sprite, name]) => new Option(name, sprite)));
  const accountFilter = BudgetUI.element("select", "selectInput");
  accountFilter.id = "searchAccount";
  accountFilter.setAttribute("aria-label", "Equity Account");
  filters.append(typeFilter, accountFilter);
  form.querySelector(".searchDates")?.before(filters);
  fillAccountFilter();

  const scope = wireSearchScope(box, form, submitButton);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    submitButton.disabled = true;
    const query = {
      terms: terms.items().map(({ title, mode, exact }) => ({ title, match: mode, exact })),
      from: document.getElementById("searchFrom").value,
      to: document.getElementById("searchTo").value,
      type: typeFilter.value,
      account: accountFilter.value,
      scope: scope.value(),
      fromTime: scope.value() === "budget" ? "" : scope.times().from,
      toTime: scope.value() === "budget" ? "" : scope.times().to
    };
    // (A search that can't go ahead says why, in the results)
    const stop = (message) => {
      submitButton.disabled = false;
      BudgetUI.setPickTarget(null);
      shownSearch = null;
      showSearchMessage(message);
    };
    let budget = null;
    if (query.scope !== "calendar") {
      const result = await searchBudget(query);
      BudgetUI.warnIfUnsaved(result);
      if (!result.ok) return stop(result.message);
      budget = result.search;
    }
    // (A calendar that hasn't loaded, or couldn't, isn't searched: alone, the search waits for it; with the budget, its
    // results say so)
    let calendar = null;
    if (query.scope !== "budget" && !window.Fractals.data()) {
      if (!budget) return stop("Your calendar hasn't loaded yet. Please try again in a moment.");
      calendar = { results: [], from: budget.from, to: budget.to, missing: true };
    } else if (query.scope !== "budget") {
      try {
        calendar = searchCalendar(query);
      } catch (error) {
        if (error instanceof BudgetInputError) return stop(error.message);
        submitButton.disabled = false;
        throw error;
      }
    }
    submitButton.disabled = false;
    BudgetUI.setPickTarget(null);
    shownSearch = query;
    renderSearchResults(budget, calendar);
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
  item("$, $ and the calendar, or the calendar", "the three buttons by Search's title pick what it looks through: your budget, both, or only your calendar's entries (Calendar Fractals). With the calendar in it, From time and To time (both optional) find only calendar entries during those times (a To time before the From time goes past midnight), and All, Costs, and Gains each find a calendar entry by its title (Tracker is for the budget only).");
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

// Results: the budget's (budget, from search() in Process Budget.js), then the calendar's (calendar, from searchCalendar),
// either one null when the search left it out.
// The budget's: newest first, each with a checkbox and a running total of the checked amounts. Transfers start unchecked,
// unless a tracker row that counts transfers found them. Tapping a result (anywhere but its checkbox) opens its options,
// the same as on a zoomed day: one in History keeps the balances, and one that would land by itself after the calendar
// (a recurring entry's or a connected spreadsheet's, still to come) goes into Upcoming for its day once it's changed. A
// search that looks past today ends with Go To Equity (goToEquity).
function renderSearchResults(budget, calendar = null) {
  const container = document.getElementById("searchResults");
  container.replaceChildren();
  container.hidden = false;

  const header = BudgetUI.element("div", "searchHeader");
  const { from, to } = budget || calendar;
  const searchingFor = budget ? budget.searchingFor : calendarSearchWords(shownSearch);
  const where = budget && calendar ? " (your budget and your calendar)" : calendar ? " (your calendar)" : "";
  header.appendChild(BudgetUI.element("p", "searchSummary", `Searching from ${from} to ${to} for: ${searchingFor}${where}`));
  const closeButton = BudgetUI.element("button", "panelClose", "×");
  closeButton.type = "button";
  closeButton.setAttribute("aria-label", "Close search results");
  closeButton.addEventListener("click", () => {
    shownSearch = null;
    container.hidden = true;
    container.replaceChildren();
  });
  header.appendChild(closeButton);
  container.appendChild(header);
  if (budget) renderBudgetResults(container, budget, !!calendar);
  if (calendar) renderCalendarResults(container, calendar, !!budget);
}

// What a calendar-only search looks for, in words (the budget's search says it for the rest)
function calendarSearchWords(query) {
  const titles = (query?.terms || []).filter(term => String(term.title || "").trim() && term.match !== "category").map(term => `${term.title.trim()}${term.exact ? " (exact)" : ""}`);
  const shown = (time) => window.Fractals.timeText(searchMinutes(time));
  const times = [query?.fromTime ? `from ${shown(query.fromTime)}` : "", query?.toTime ? `to ${shown(query.toTime)}` : ""].filter(Boolean).join(" ");
  return `${titles.length ? titles.join(", ") : "every entry"}${times ? `, ${times}` : ""}`;
}

// The budget's results (under "Your budget" when the calendar's follow)
function renderBudgetResults(container, { results, toDay }, titled) {
  if (titled) container.appendChild(BudgetUI.element("h4", "searchSection", "Your Budget"));
  if (results.length === 0) {
    container.appendChild(BudgetUI.element("p", "searchMessage", "No entries found."));
    goToEquity(container, toDay);
    return;
  }

  const total = BudgetUI.element("p", "searchTotal");
  container.append(total, BudgetUI.element("p", "searchHint", "Tap a result to change it."));

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
    tr.appendChild(BudgetUI.element("td", "searchDate", showWeekdayDate(result.date)));
    const amountCell = BudgetUI.element("td", "amountCell", formatMoney(result.amount));
    if (result.amount > 0) amountCell.classList.add("positive");
    if (result.amount < 0) amountCell.classList.add("negative");
    tr.appendChild(amountCell);
    const percent = percentOf(result.sprite);
    const entryCell = BudgetUI.element("td", "searchEntry", `${baseSprite(result.sprite)} ${result.title}${percent !== null ? ` (${showPercent(percent)})` : ""}`);
    tr.appendChild(entryCell);
    const line = `${result.sprite} ${formatMoney(result.amount)} ${result.title}`;
    // (A placeholder's amount and entry are yellow, and an entry with a note is underlined)
    if (isPlaceholder(result.sprite)) [amountCell, entryCell].forEach(td => td.classList.add("isPlaceholder"));
    if (lineHasNote(result.date, line)) entryCell.classList.add("hasNote");
    BudgetUI.noTranslate(tr); // Dates, amounts, and entries show as they are
    tr.classList.add("clickable");
    BudgetUI.makePressable(tr);
    tr.addEventListener("click", (event) => {
      if (event.target.closest("input, td:first-child")) return; // (Its checkbox)
      BudgetUI.openEntryOptions(entryCell, line, result.date, { inHistory: result.date < gridStartDate });
    });
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
  goToEquity(container, toDay);
}

// The calendar's results: newest first, like the budget's, each its day and time, its color, and its title with its Calendar
// Fractal. Tapping one opens it, the same as on a zoomed day.
function renderCalendarResults(container, { results, missing }, titled) {
  if (titled) container.appendChild(BudgetUI.element("h4", "searchSection", "Your Calendar"));
  if (missing) {
    container.appendChild(BudgetUI.element("p", "searchMessage", "Your calendar hasn't loaded yet, so it wasn't searched. Search again in a moment."));
    return;
  }
  if (results.length === 0) {
    container.appendChild(BudgetUI.element("p", "searchMessage", "No calendar entries found."));
    return;
  }
  container.append(BudgetUI.element("p", "searchTotal", `${results.length} found`), BudgetUI.element("p", "searchHint", "Tap one to open it."));
  const tableEl = document.createElement("table");
  tableEl.className = "dataTable searchTable searchCalendarTable";
  const headRow = tableEl.createTHead().insertRow();
  for (const label of ["When", "Entry"]) headRow.appendChild(BudgetUI.element("th", "", label));
  BudgetUI.spanHeaderBar(tableEl);
  const body = tableEl.createTBody();
  const todayYmd = formatToYMD(today);
  const hasComing = results.some(result => result.day > todayYmd);
  let pastShown = false;
  const dividerRow = (text) => {
    const tr = body.insertRow();
    tr.className = "searchDivider";
    const td = tr.insertCell();
    td.colSpan = 2;
    td.textContent = text;
  };
  if (hasComing) dividerRow("Coming up");
  for (const result of results) {
    if (hasComing && !pastShown && result.day <= todayYmd) {
      pastShown = true;
      dividerRow("Today and before");
    }
    const tr = body.insertRow();
    if (result.day > todayYmd) tr.classList.add("searchComing");
    tr.appendChild(BudgetUI.element("td", "searchDate", window.Fractals.whenWords(result.event, result.day)));
    const entryCell = BudgetUI.element("td", "searchEntry");
    const dot = BudgetUI.element("span", "searchFractalDot");
    dot.style.background = window.Fractals.colorOf(result.event.fractal);
    dot.setAttribute("aria-hidden", "true");
    const fractal = window.Fractals.nameOf(result.event.fractal);
    entryCell.append(dot, result.event.title || "(No title)", fractal ? BudgetUI.element("span", "searchFractal", ` · ${fractal}`) : "");
    tr.appendChild(entryCell);
    BudgetUI.noTranslate(tr);
    tr.classList.add("clickable");
    BudgetUI.makePressable(tr); // (Enter and Space press it too: Layout.js)
    tr.addEventListener("click", () => window.Fractals.openEvent(entryCell, result.event, result.day));
  }
  const scroll = BudgetUI.element("div", "dataScroll searchScroll");
  scroll.appendChild(tableEl);
  container.appendChild(scroll);
}

// A search that looks past today ends with Go To Equity: the Equity window on Bob's page, with every balance on the search's
// To day (up to the 10 years it looks ahead)
function goToEquity(container, toDay) {
  if (!(toDay instanceof Date) || isNaN(toDay.getTime()) || toDay <= today) return;
  const furthest = addMonths(today, 120);
  const link = BudgetUI.element("a", "budgetButton searchAccounts", "Go To Equity");
  link.href = `/menu/bob.html?day=${formatToYMD(toDay > furthest ? furthest : toDay)}&open=equity#balancesCard`;
  link.title = `Every account's balance on ${showDate(toDay > furthest ? furthest : toDay)}, in the Equity window on Bob's page`;
  const row = BudgetUI.element("div", "panelButtons searchAccountsRow");
  row.append(link);
  container.append(row);
}

