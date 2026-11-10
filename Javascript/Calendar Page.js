// Calendar Page: the home page. "Lowest in bank after today", Bob's message (his card opens his page, and shows his
// warnings over the calendar, see BOB'S WARNINGS), Upcoming, the calendar's day cells, and the new-entry / entry-options
// panels.
// Zooming a day is handled in Process Budget.js (LAYOUT FUNCTIONS); tapping an entry inside a
// zoomed day opens its options here.

// =====================================================================
// #region SETUP
// =====================================================================

window.workspaceReady.then((loaded) => {
  if (!loaded) {
    const bob = document.getElementById("bobMessage");
    if (bob) bob.textContent = "Couldn't load your budget data. Please refresh to try again.";
    // The calendar's first day says "Loading..." until the budget is there
    const firstDay = document.querySelector(".elastic-table .cell-content");
    if (firstDay) firstDay.textContent = "Couldn't load your budget";
    return;
  }
  renderHome();
  wireCalendar();
  wireGettingStarted();
  wireUndoButtons();
  wireQuickWaiting();
  wireBobWarnings();
  document.getElementById("addEntryButton")?.addEventListener("click", (event) => BudgetUI.openNewEntry(event.currentTarget));
  document.getElementById("quickEntryButton")?.addEventListener("click", (event) => openQuickEntrySetup(event.currentTarget));
  wireLowestCard();
  // Right after a sign-in: turn notifications on here? (once, above the Welcome card and the calendar)
  window.PushNotifications?.askAfterSignIn(document.getElementById("gettingStarted")).catch(error => console.warn("Couldn't check notifications on this device:", error));
});

document.addEventListener("budget:updated", () => {
  if (workspaceLoaded) renderHome();
});

// Draw everything on Home from the budget
function renderHome() {
  renderGettingStarted();
  renderQuickWaiting();
  renderCalendar();
  renderInfoRow();
  renderUndoButtons();
}

//#endregion

// =====================================================================
// #region QUICK ENTRIES TO ADD (from other devices' Quick Entry icons; see holdQuickEntries in Process Budget.js)
// =====================================================================
// Each waiting entry with Add (it goes into the budget like a New Entry, and Undo can take it back) and Delete (it's
// gone, never added), and Add All when there are more than one. The card goes away once none are waiting.

let quickWaitingBusy = false; // Add All is adding them, one at a time

// Add All adds each waiting entry in turn, then says how many went in (and the first that couldn't)
function wireQuickWaiting() {
  document.getElementById("quickWaitingAll")?.addEventListener("click", async () => {
    if (quickWaitingBusy) return;
    quickWaitingBusy = true;
    renderQuickWaiting();
    let added = 0;
    let firstProblem = null;
    for (const quick of [...waitingQuickEntries]) {
      const result = await addWaitingQuickEntry(quick.id);
      if (result.ok) added++;
      else if (!firstProblem) firstProblem = `${describeQuickEntry(quick.entry)}: ${result.message}`;
    }
    quickWaitingBusy = false;
    renderQuickWaiting();
    if (added > 0) BudgetUI.showToast(`Added ${added} quick ${added === 1 ? "entry" : "entries"}.`);
    if (firstProblem) BudgetUI.showToast(`Couldn't add ${firstProblem}`, true);
  });
}

// The card's list, drawn again whenever what's waiting changes (hidden while nothing is)
function renderQuickWaiting() {
  const card = document.getElementById("quickWaiting");
  const list = document.getElementById("quickWaitingList");
  if (!card || !list) return;
  card.hidden = waitingQuickEntries.length === 0;
  list.replaceChildren(...waitingQuickEntries.map(quickWaitingRow));
  const all = document.getElementById("quickWaitingAll");
  all.hidden = waitingQuickEntries.length < 2;
  all.disabled = quickWaitingBusy;
}

// One waiting entry: its type and title over its amount and day, with Add and Delete (a placeholder's words are yellow)
function quickWaitingRow(quick) {
  const entry = quick.entry;
  const row = BudgetUI.element("li", `waitingItem${entry.placeholder ? " isPlaceholder" : ""}`);
  const sprite = QUICK_ENTRY_TYPES[entry.type] || "";
  const day = createSafeMidnight(entry.date, true);
  const shown = formatMoney(entry.amount) + (typeof entry.percent === "number" ? ` (${showPercent(entry.percent)})` : "");
  const amount = BudgetUI.element("span", `waitingAmount${entry.amount < 0 ? " negative" : entry.amount > 0 ? " positive" : ""}`, shown);
  const details = BudgetUI.element("span", "waitingDetails");
  details.append(amount, ` on ${isNaN(day.getTime()) ? entry.date : showDate(day)}${entry.placeholder ? " (a placeholder)" : ""}`);
  const text = BudgetUI.noTranslate(BudgetUI.element("span", "waitingText"));
  text.append(BudgetUI.element("span", `waitingTitle${String(entry.note ?? "").trim() ? " hasNote" : ""}`, `${sprite ? sprite + " " : ""}${capitalize(String(entry.title || ""))}`), details);
  const add = BudgetUI.element("button", "budgetButton primary waitingAdd", "Add");
  add.type = "button";
  add.setAttribute("aria-label", `Add ${describeQuickEntry(entry)}`);
  add.disabled = quickWaitingBusy;
  add.addEventListener("click", async () => {
    if (quickWaitingBusy) return;
    quickWaitingBusy = true;
    renderQuickWaiting();
    const result = await addWaitingQuickEntry(quick.id);
    quickWaitingBusy = false;
    renderQuickWaiting();
    if (result.ok) BudgetUI.showToast(`Added ${describeQuickEntry(entry)}.`);
    else BudgetUI.showToast(result.message, true);
  });
  const remove = BudgetUI.element("button", "budgetButton danger waitingDelete", "Delete");
  remove.type = "button";
  remove.setAttribute("aria-label", `Delete ${describeQuickEntry(entry)}`);
  remove.disabled = quickWaitingBusy;
  remove.addEventListener("click", async () => {
    if (quickWaitingBusy || !window.confirm(`Delete ${describeQuickEntry(entry)}? It won't be added to your budget.`)) return;
    quickWaitingBusy = true;
    renderQuickWaiting();
    const result = await deleteWaitingQuickEntry(quick.id);
    quickWaitingBusy = false;
    renderQuickWaiting();
    if (result.ok) BudgetUI.showToast(`Deleted ${describeQuickEntry(entry)}.`);
    else BudgetUI.showToast(result.message, true);
  });
  row.append(text, add, remove);
  return row;
}

//#endregion

// =====================================================================
// #region UNDO + REDO (calendar entries and quick entries; the steps are in Process Budget.js)
// =====================================================================

// Each button says what it would do ("Undo: added Coffee (-$4.50) on 10/05"), or is off with nothing to do
function renderUndoButtons() {
  const info = undoInfo();
  for (const [id, label, verb] of [["undoButton", info.undo, "Undo"], ["redoButton", info.redo, "Redo"]]) {
    const button = document.getElementById(id);
    if (!button) continue;
    button.disabled = historyBusy || !label;
    button.title = label ? `${verb}: ${label}` : `Nothing to ${verb.toLowerCase()}`;
    button.setAttribute("aria-label", button.title);
  }
}

// The Undo and Redo buttons, and their keyboard shortcuts
function wireUndoButtons() {
  document.getElementById("undoButton")?.addEventListener("click", () => takeHistoryStep("undo"));
  document.getElementById("redoButton")?.addEventListener("click", () => takeHistoryStep("redo"));
  // Ctrl+Z (⌘Z on a Mac) undoes, and Ctrl+Shift+Z (⌘⇧Z) or Ctrl+Y redoes, except while typing in a box
  // (where they undo the typing) or with a panel open
  document.addEventListener("keydown", (event) => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    const redo = (key === "z" && event.shiftKey) || (key === "y" && !event.shiftKey);
    if (key !== "z" && !redo) return;
    if (event.target.closest?.("input, textarea, select, [contenteditable]") || document.querySelector(".budgetPanel")) return;
    event.preventDefault();
    takeHistoryStep(redo ? "redo" : "undo");
  });
}

let historyBusy = false;
// Undo or Redo one step, with a note saying what it did (or why it couldn't)
async function takeHistoryStep(direction) {
  if (historyBusy || !undoInfo()[direction]) return;
  historyBusy = true;
  renderUndoButtons();
  const result = await (direction === "undo" ? undoCalendarChange() : redoCalendarChange());
  historyBusy = false;
  renderUndoButtons();
  if (!result.ok) return BudgetUI.showToast(result.message || "That didn't work. Please try again.", true);
  if (result.saved === false) return BudgetUI.warnIfUnsaved(result);
  BudgetUI.showToast(`${direction === "undo" ? "Undone" : "Redone"}: ${result.historyStep.label}.`);
}

//#endregion

// =====================================================================
// #region GETTING STARTED (a new budget's first steps)
// =====================================================================
// A new budget starts at $0, so its first step says what's in the bank: a ⭕️ Transfer titled Starting
// Balance on today (it changes In Bank, but isn't a gain), and for savings, the default account's balance
// (like typing it on Equity: no entry, so it isn't counted as a gain). The card only shows the first time a
// budget opens (the account's first sign-in, or a new budget: GETTING_STARTED_KEY in Process Budget.js), until the
// starting balance and a recurring entry are there or it's hidden with ×.

const STARTING_BALANCE = "Starting Balance";

// Is this budget's first time open (the account's first sign-in, or a new budget), with the card not done or hidden yet?
function isGettingStarted() {
  let stored = null;
  try { stored = localStorage.getItem(GETTING_STARTED_KEY); } catch (e) { return false; }
  if (!stored || !budgetInfo) return false;
  return stored === String(budgetInfo.id) || (stored === "1" && budgetInfo.first && budgetInfo.owned);
}

// The card is done for good (both steps are done, or it was hidden)
function finishGettingStarted() {
  try { localStorage.removeItem(GETTING_STARTED_KEY); } catch (e) {}
}

// Which of Getting Started's steps are done: { balance, recurring }
function gettingStartedSteps() {
  const hasHistory = historyData.slice(1).some(row => row.some(cell => String(cell ?? "").trim() !== ""));
  const hasStartingBalance = calendarData.some(row => row.some(cell =>
    String(cell ?? "").split("\n").some(line => extractTitle(line) === cleanString(STARTING_BALANCE))));
  const hasRecurring = recurringData.slice(2).some(row => !["", "-"].includes(String(row[0] ?? "").trim()));
  return { balance: hasHistory || hasStartingBalance, recurring: hasRecurring };
}

// On the first sign-in, the card shows (its done steps marked) until both are done or it's hidden
function renderGettingStarted() {
  const card = document.getElementById("gettingStarted");
  if (!card) return;
  const steps = gettingStartedSteps();
  if (isGettingStarted() && steps.balance && steps.recurring) finishGettingStarted();
  card.hidden = !isGettingStarted();
  if (card.hidden) return;
  document.getElementById("startBalanceStep").classList.toggle("done", steps.balance);
  document.getElementById("startBalanceForm").hidden = steps.balance;
  const done = document.getElementById("startBalanceDone");
  done.hidden = !steps.balance;
  done.textContent = "Done. It's a ⭕️ Starting Balance entry on today, so tap today to change it.";
  document.getElementById("startRecurringStep").classList.toggle("done", steps.recurring);
}

// The card's × and its starting balance form. Its boxes are typed like a cash register (Budget UI.js), and the bank's
// has − and + beside it for an account that's overdrawn.
let startBalanceSign = 1;
function wireGettingStarted() {
  document.getElementById("gettingStartedHide")?.addEventListener("click", () => {
    finishGettingStarted();
    document.getElementById("gettingStarted").hidden = true;
  });
  document.getElementById("startBalanceForm")?.addEventListener("submit", setStartingBalance);
  const bank = document.getElementById("startBalance");
  if (bank) {
    const signs = BudgetUI.segmented([{ key: -1, label: "−", name: "Overdrawn" }, { key: 1, label: "+", name: "Not overdrawn" }], 1, (key) => { startBalanceSign = key; });
    signs.el.classList.add("startSign");
    signs.el.setAttribute("aria-label", "Overdrawn (−) or not (+)");
    bank.after(signs.el);
    BudgetUI.cashRegister(bank, (key) => {
      startBalanceSign = key;
      signs.set(key);
    });
  }
  const savings = document.getElementById("startSavings");
  if (savings) BudgetUI.cashRegister(savings);
}

// "1,500.00", "$1500", or "1500,50" -> the amount (to the cent); null when it isn't an amount. Blank is 0.
function readStartAmount(text) {
  if (!String(text).trim()) return 0;
  const amount = readMoneyInput(text);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : null;
}

// Set: today's ⭕️ Starting Balance, and savings as the default account's balance today
async function setStartingBalance(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const typedBalance = readStartAmount(document.getElementById("startBalance").value);
  const balance = typedBalance === null ? null : startBalanceSign * Math.abs(typedBalance);
  const savings = readStartAmount(document.getElementById("startSavings").value);
  if (balance === null) return BudgetUI.showToast("Enter what's in your bank account, like 1500.00 (tap − first if it's overdrawn).", true);
  if (savings === null || savings < 0) return BudgetUI.showToast("Enter what's in savings, like 3000.00, or leave it blank.", true);
  if (Math.abs(balance) > MAX_AMOUNT || savings > MAX_AMOUNT) return BudgetUI.showToast(AMOUNT_TOO_BIG, true);

  form.querySelectorAll("input, button").forEach(control => { control.disabled = true; });
  const savingsAccount = accountRows().find(account => isDefaultAccount(account.row)) || accountRows()[0];
  let result = await addCalendarEntry({ title: STARTING_BALANCE, sprite: "⭕️", amount: balance, date: today });
  if (result.ok && savings > 0 && savingsAccount) {
    result = await saveAccount({ name: savingsAccount.name, balance: savings }, savingsAccount.index);
  }
  form.querySelectorAll("input, button").forEach(control => { control.disabled = false; });
  if (!result.ok) return BudgetUI.showToast(result.message || "Couldn't set the starting balance. Please try again.", true);
  if (result.saved === false) return BudgetUI.warnIfUnsaved(result);
  BudgetUI.showToast(savings > 0 && savingsAccount
    ? `Starting balance set: ${formatMoney(balance)} in the bank, and ${formatMoney(savings)} in ${savingsAccount.name}.`
    : `Starting balance set: ${formatMoney(balance)}.`);
}

//#endregion

// =====================================================================
// #region CALENDAR
// =====================================================================

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// The months the calendar covers, for its card: "October 2026", "October - November 2026", or
// "December 2026 - January 2027"
function calendarMonths() {
  const first = gridDates[0][0];
  const last = gridDates[3][6];
  const month = (date, withYear) => MONTHS[date.getMonth()] + (withYear ? ` ${date.getFullYear()}` : "");
  if (first.getFullYear() !== last.getFullYear()) return `${month(first, true)} - ${month(last, true)}`;
  if (first.getMonth() !== last.getMonth()) return `${month(first, false)} - ${month(last, true)}`;
  return month(first, true);
}

// The last day's two lines about the 28 days after the calendar (writeBudgetMath in Process Budget.js writes them
// under its In Bank: "✅ $812.40 Lowest: 11/14" and "✅ $905.10 Day 28 In Bank"). Home shows them in the Lowest card
// instead of on the day. { kind: "lowest" | "day28", amount, date (MM/DD, for "lowest") }, or null for any other line.
function afterCalendarLine(line) {
  const parts = getParts(line);
  if (!BudgetUI.isSystemLine(parts[0])) return null;
  const words = parts.slice(2).join(" ");
  const lowest = words.match(/^Lowest: (\d{1,2}\/\d{1,2})$/);
  if (lowest) return { kind: "lowest", amount: parseAmount(parts[1]), date: lowest[1] };
  if (words === "Day 28 In Bank") return { kind: "day28", amount: parseAmount(parts[1]) };
  return null;
}

// Draw each day: date, system lines, then entries (one element per line so entries are tappable). The weekdays
// over the days, and the months in the card's heading, come from the days themselves.
function renderCalendar() {
  const months = document.getElementById("calendarMonths");
  if (months && gridDates[0]) months.textContent = calendarMonths();
  document.querySelectorAll(".elastic-table thead th").forEach((th, c) => {
    if (gridDates[0] && gridDates[0][c]) th.textContent = WEEKDAYS[gridDates[0][c].getDay()];
  });

  const cells = document.querySelectorAll(".elastic-table td");
  cells.forEach((td, index) => {
    const r = Math.floor(index / 7);
    const c = index % 7;
    const content = td.querySelector(".cell-content");
    if (!content || !calendarData[r]) return;
    const isLastDay = r === 3 && c === 6;

    const fragment = document.createDocumentFragment();
    String(calendarData[r][c] ?? "").split("\n").forEach((line, l) => {
      if (isLastDay && afterCalendarLine(line)) return; // In the Lowest card instead
      // The first line is the day, shown in this device's date format
      if (l === 0 || line.trim()) fragment.appendChild(BudgetUI.renderEntryLine(l === 0 ? showDay(gridDates[r][c]) : line, l, gridDates[r][c]));
    });

    // Its round + (New Entry on that day) and × (close) show once it's zoomed (handled in Process Budget.js)
    content.replaceChildren(fragment, zoomDayButtons());

    td.dataset.row = r;
    td.dataset.col = c;
    td.classList.toggle("isToday", gridDates[r][c].getTime() === today.getTime());
    // (The 28 days after the calendar going below $0 turns the Lowest card red instead, see renderAfterCalendar)
    td.classList.toggle("isNegative", (readInBank(calendarData[r][c]) ?? 0) < 0);
    labelDay(td, gridDates[r][c], calendarData[r][c]);
  });
}

// Taps on the calendar: filling a waiting date box, and an entry on a zoomed day
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

  // Tapping an entry inside a zoomed day opens its options (not while the day shrinks back: a tap then zooms it
  // in again, see Process Budget.js)
  calendarTable.addEventListener("click", (event) => {
    const lineEl = event.target.closest(".lineEntry, .lineInBank");
    if (!lineEl) return;
    const td = lineEl.closest("td");
    if (!td || !td.classList.contains("is-editing") || td.classList.contains("isZoomClosing")) return;
    if (lineEl.classList.contains("lineInBank")) BudgetUI.openInBankOptions(lineEl, gridDates[Number(td.dataset.row)][Number(td.dataset.col)]);
    else openEntryOptions(lineEl, Number(td.dataset.row), Number(td.dataset.col), Number(lineEl.dataset.line));
  });
}

//#endregion

// =====================================================================
// #region INFO ROW (lowest in bank, Bob, upcoming)
// =====================================================================

function renderInfoRow() {
  const lowest = document.getElementById("lowestAmount");
  if (lowest) {
    lowest.textContent = formatMoney(lowestInBank);
    lowest.classList.toggle("negative", lowestInBank < 0);
  }
  renderAfterCalendar();

  const bob = document.getElementById("bobMessage");
  if (bob) bob.textContent = bobMessage;
  queueBobWarnings();

  const list = document.getElementById("upcomingList");
  if (!list) return;
  list.replaceChildren();
  if (upcomingEntries.length === 0) {
    list.appendChild(BudgetUI.element("li", "upcomingEmpty", "Nothing scheduled past this calendar."));
    return;
  }
  // Each one opens its options when tapped, like an entry on a zoomed day (change it, move it, or delete it)
  for (const upcoming of upcomingEntries) {
    const item = BudgetUI.noTranslate(BudgetUI.element("li", "upcomingItem"));
    const button = BudgetUI.element("button", "upcomingButton");
    button.type = "button";
    const line = `${upcoming.sprite} ${formatMoney(upcoming.amount)} ${upcoming.title}`;
    button.appendChild(BudgetUI.element("span", "upcomingDate", showDate(upcoming.date)));
    const entry = BudgetUI.element("span", `upcomingEntry ${BudgetUI.amountClass(upcoming.amount)}`, shownLine(line));
    if (isPlaceholder(upcoming.sprite)) entry.classList.add("isPlaceholder");
    if (lineHasNote(upcoming.date, line)) entry.classList.add("hasNote");
    button.appendChild(entry);
    button.addEventListener("click", () => BudgetUI.openEntryOptions(button, line, upcoming.date));
    item.appendChild(button);
    list.appendChild(item);
  }
}

// The Lowest card opens the 28 days after the calendar (a tap, or Enter or Space)
function wireLowestCard() {
  const card = document.querySelector(".lowestCard");
  if (!card) return;
  card.addEventListener("click", () => openAheadDays(card));
  card.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    openAheadDays(card);
  });
}

// "$1235" or "-$40": In Bank to the dollar, short enough for a day in the window's small squares
function wholeDollars(amount) {
  const dollars = Math.round(amount);
  return `${dollars < 0 ? "-" : ""}$${Math.abs(dollars)}`;
}

// The Lowest card's window: the 28 days after the calendar (aheadDays in Process Budget.js), four weeks from Sunday like
// History, each day with its date and In Bank as the daily update will have it (to the dollar; the lowest one ringed,
// and one below $0 red), and the lowest and the 28th day's In Bank over them. Tapping a day closes it and zooms that day
// in over the calendar, like any day there, to see its entries, add one, or change one (a change goes into Upcoming),
// and to swipe on to the days before it.
function openAheadDays(origin) {
  const days = aheadDays();
  if (days.length === 0) return;
  BudgetUI.openPanel({
    origin,
    size: "large",
    title: "The 28 Days After The Calendar",
    build(form, panel) {
      const lowest = days.reduce((low, day) => (day.inBank < low.inBank ? day : low), days[0]);
      const last = days[days.length - 1];
      const summary = BudgetUI.element("p", "panelText aheadSummary");
      const amount = (value) => BudgetUI.noTranslate(BudgetUI.element("span", value < 0 ? "negative" : "", formatMoney(value)));
      summary.append("Lowest: ", amount(lowest.inBank), ` on ${showDay(lowest.date)}. Day 28: `, amount(last.inBank), ".");
      const table = BudgetUI.element("table", "aheadGrid");
      const head = table.createTHead().insertRow();
      for (let c = 0; c < 7; c++) head.appendChild(BudgetUI.element("th", "", ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][(days[0].date.getDay() + c) % 7]));
      const body = table.createTBody();
      let row = null;
      days.forEach((day, index) => {
        if (index % 7 === 0) row = body.insertRow();
        const td = row.insertCell();
        const button = BudgetUI.element("button", "aheadDay");
        button.type = "button";
        button.classList.toggle("isNegative", day.inBank < 0);
        button.classList.toggle("isLowest", day === lowest);
        button.setAttribute("aria-label", `${showDay(day.date)}: In Bank ${formatMoney(day.inBank)}${day === lowest ? ", the lowest" : ""}`);
        button.append(BudgetUI.noTranslate(BudgetUI.element("span", "aheadDate", showDay(day.date))), BudgetUI.noTranslate(BudgetUI.element("span", "aheadInBank", wholeDollars(day.inBank))));
        button.addEventListener("click", () => {
          panel.close();
          zoomBudgetDay(day.date);
        });
        td.appendChild(button);
      });
      form.append(summary, table, BudgetUI.element("p", "panelHint", "In Bank at the end of each day, counting your recurring entries, connected spreadsheets' and calendars' entries, and Upcoming entries (not Hidden ones). Tap a day to see its entries, add one, or change one."), BudgetUI.buttonRow([{ label: "Close", onClick: () => panel.close() }]));
    }
  });
}

// The Lowest card's look past the calendar, from the last day's two lines (see afterCalendarLine): the day In Bank is
// lowest in the 28 days after the calendar and how low, and In Bank on the 28th day. Red below $0, and the whole card
// turns red when any of its amounts is below $0.
function renderAfterCalendar() {
  const box = document.getElementById("afterCalendar");
  if (!box || !calendarData[3]) return;
  const found = {};
  for (const line of String(calendarData[3][6] ?? "").split("\n")) {
    const after = afterCalendarLine(line);
    if (after) found[after.kind] = after;
  }
  const belowZero = lowestInBank < 0 || [found.lowest, found.day28].some(after => after && after.amount < 0);
  box.closest(".lowestCard")?.classList.toggle("isNegative", belowZero);
  box.hidden = !found.lowest && !found.day28;
  const show = (id, after) => {
    const el = document.getElementById(id);
    el.textContent = after ? formatMoney(after.amount) : "--";
    el.classList.toggle("negative", !!after && after.amount < 0);
  };
  document.getElementById("afterLowestDay").textContent = found.lowest ? `Lowest is on ${showStoredDate(found.lowest.date)}` : "Lowest is on --";
  show("afterLowest", found.lowest);
  show("afterDay28", found.day28);
}

//#endregion

// =====================================================================
// #region BOB'S WARNINGS (his cards with their Warnings switch on, from Bob Page.js)
// =====================================================================
// What Bob's cards say when they need a look (bobWarnings in Bob Page.js, for each card that's on with its Warnings on)
// shows on his card, which moves over the calendar while there's one. Okay puts them away (and the card back under the
// calendar) until tomorrow, on every device (okayBobWarnings). They're worked out a moment after the page draws, so the
// calendar never waits on them.

let bobWarningsQueued = 0;

// Okay on his card
function wireBobWarnings() {
  document.getElementById("bobOkay")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    const result = await okayBobWarnings();
    button.disabled = false;
    if (!result.ok) BudgetUI.showToast(result.message || "That didn't work. Please try again.", true);
    else BudgetUI.warnIfUnsaved(result);
  });
}

// Work them out once the page has drawn (again after each change)
function queueBobWarnings() {
  clearTimeout(bobWarningsQueued);
  bobWarningsQueued = setTimeout(renderBobWarnings, 50);
}

// His card's warnings, and where the card goes (over the calendar while there's one)
function renderBobWarnings() {
  const card = document.getElementById("bobCard");
  const box = document.getElementById("bobWarnings");
  const above = document.getElementById("bobAbove");
  const row = document.querySelector(".infoRow");
  if (!card || !box || !above || !row || !workspaceLoaded) return;
  const warnings = typeof bobWarnings === "function" && !bobWarningsOkayed() ? bobWarnings() : [];
  const list = document.getElementById("bobWarningList");
  list.replaceChildren(...warnings.map(warning => {
    const item = BudgetUI.element("li", "bobHighlight isWarning");
    item.append(BudgetUI.element("strong", "", `${warning.title}: `), warning.text);
    return item;
  }));
  box.hidden = warnings.length === 0;
  card.classList.toggle("isWarning", warnings.length > 0);
  row.classList.toggle("bobAway", warnings.length > 0);
  // Over the calendar while there's one, and back in its place (before Upcoming) after
  if (warnings.length > 0 && card.parentElement !== above) above.appendChild(card);
  if (warnings.length === 0 && card.parentElement !== row) row.insertBefore(card, row.querySelector(".upcomingCard"));
}

//#endregion

// =====================================================================
// #region ENTRY PANELS
// =====================================================================

// (New Entry is BudgetUI.openNewEntry: History's days open it too)

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
      // (An account with more than one budget hears which one the icon adds to)
      const named = budgetInfo && (budgetInfo.shared || !budgetInfo.owned || !budgetInfo.first) ? ` It adds to this budget, ${budgetInfo.name}.` : "";
      form.append(
        text(`Put an icon on your phone's home screen that opens a New Entry form, with no login needed.${named}`),
        text("The icon can only add entries. Besides In Bank today and the lowest it gets, it never sees your budget, just your Equity accounts and their balances (so you can pick one) and your prisms (entries you save there to fill in quickly). Its entries show up here the next time you open Prismal Planning (and until then, its own Undo can take one back). If your password changes, you turn icons off in Settings, or this budget is deleted or stops being shared with you, it stops working."),
        text("The next page shows how to add it to your home screen on your phone (iPhone, Samsung, Pixel, OnePlus, and more), and its Help shows how to open it from an iPhone's Lock Screen or check In Bank on an Apple Watch. Use your browser itself, not Prismal Planning opened inside another app (like Gmail or Instagram)."),
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
        // (This device's own icon: its entries are added as soon as the budget opens here, see holdQuickEntries)
        await rememberQuickIcon(result.data.key);
        const url = `/quick.html?key=${encodeURIComponent(result.data.key)}&setup=1`;
        if (typeof window.transitionTo === "function") window.transitionTo(url);
        else window.location.href = url;
      });
    }
  });
}

// Options for an entry tapped inside a zoomed day: set or add to the amount, change its type or account, move it, or
// delete it (BudgetUI.openEntryOptions, which History shares)
function openEntryOptions(lineEl, r, c, lineIndex) {
  const line = String(calendarData[r][c]).split("\n")[lineIndex];
  if (line) BudgetUI.openEntryOptions(lineEl, line, gridDates[r][c], { lineIndex });
}

//#endregion
