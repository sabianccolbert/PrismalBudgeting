// Calendar Page: the home page. "Lowest in bank after today", Bob's message (his card opens his page, and shows his
// warnings over the calendar, see BOB'S WARNINGS), Upcoming, the calendar's day cells, and the new-entry / entry-options
// panels. The calendar shows any four weeks, from a year before the budget began to five years from today (THE CALENDAR'S
// HEADER moves it), with the budget's entries, the calendar's (Fractals.js), or both.
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
  wireCalendarHeader();
  wireGettingStarted();
  wireUndoButtons();
  wireQuickWaiting();
  wireBobWarnings();
  // (New Entry starts as a budget entry; its two long buttons switch to a calendar entry)
  document.getElementById("addEntryButton")?.addEventListener("click", (event) => BudgetUI.openNewEntry(event.currentTarget, { kind: "budget" }));
  document.getElementById("quickEntryButton")?.addEventListener("click", (event) => openQuickEntrySetup(event.currentTarget));
  document.getElementById("quickCalendarButton")?.addEventListener("click", (event) => openQuickCalendarSetup(event.currentTarget));
  // The calendar's entries come in after the budget's, so the budget never waits on them
  window.Fractals.load().then((calendar) => {
    if (!calendar) BudgetUI.showToast("Couldn't load your calendar's entries. Refresh to try again.", true);
  });
  // Right after a sign-in: turn notifications on here? (once, above the Welcome card and the calendar)
  window.PushNotifications?.askAfterSignIn(document.getElementById("gettingStarted")).catch(error => console.warn("Couldn't check notifications on this device:", error));
});

document.addEventListener("budget:updated", () => {
  if (workspaceLoaded) renderHome();
});

// The calendar's entries, the fractals checked, or what the calendar shows changed: the days draw again (a zoomed one
// too, at its new size)
document.addEventListener("fractals:changed", () => {
  if (!workspaceLoaded) return;
  renderCalendar();
  renderCalendarWaiting();
  if (activeEditCell) {
    refreshGuestDay();
    refitZoomedDay();
  }
});

// Coming back to the page shows what another device (or someone sharing an entry) changed on the calendar meanwhile
document.addEventListener("visibilitychange", () => {
  if (workspaceLoaded && document.visibilityState === "visible") window.Fractals.load(true);
});

// Draw everything on Home from the budget
function renderHome() {
  renderGettingStarted();
  renderQuickWaiting();
  renderCalendarWaiting();
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

// The four weeks showing. They start as the budget's own (this week's Sunday on, which the budget keeps as its
// calendar); the calendar's header moves them to any four weeks in its range (calendarRange in Process Budget.js), where
// each day is drawn from wherever the budget has it: History, its calendar, or the days after it as the daily update
// will fill them in. viewAnchor: the day they were moved to show (it's in their first week); viewStart: their Sunday.
let viewAnchor = null;
let viewStart = null;

// Are the four weeks showing the budget's own?
const showsOwnWeeks = () => !viewStart || viewStart.getTime() === gridStartDate.getTime();

// The day in one of the calendar's 28 spots
const dayAt = (index) => (showsOwnWeeks() ? gridDates[Math.floor(index / 7)][index % 7] : addDays(viewStart, index));

// Move the calendar so a day is in its first week (kept inside the calendar's range). A zoomed day closes first.
function moveCalendar(date) {
  const range = calendarRange();
  const anchor = date < range.first ? range.first : date > range.last ? range.last : createSafeMidnight(date);
  const latest = addDays(range.last, -27);
  const start = addDays(anchor, -anchor.getDay());
  viewAnchor = anchor;
  viewStart = start > latest ? latest : start;
  if (activeEditCell) closeZoomedDay(true);
  renderCalendar();
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

// Draw each day: date, system lines, then entries (one element per line so entries are tappable), then the calendar's
// entries (Fractals.js). The weekdays over the days come from the days themselves. The budget's own four weeks are
// drawn from its calendar; moved anywhere else, each day is drawn from wherever the budget has it (fillGuestDay in
// Process Budget.js), and its taps work the way that day's do there.
function renderCalendar() {
  const own = showsOwnWeeks();
  const mode = window.Fractals.view();
  const card = document.querySelector(".calendarCard");
  if (card) card.dataset.view = mode;
  if (!gridDates[0]) return;
  window.Fractals.prepare(formatToYMD(dayAt(0)), formatToYMD(dayAt(27)));
  document.querySelectorAll(".elastic-table:not(.guestDays) thead th").forEach((th, c) => {
    th.textContent = WEEKDAYS[dayAt(c).getDay()];
  });

  const cells = document.querySelectorAll(".elastic-table:not(.guestDays) td");
  cells.forEach((td, index) => {
    const r = Math.floor(index / 7);
    const c = index % 7;
    const content = td.querySelector(".cell-content");
    const date = dayAt(index);
    if (!content) return;
    if (!own) {
      delete td.dataset.row;
      delete td.dataset.col;
      fillGuestDay(td, budgetDayAt(date) || { date, text: formatToMMDD(date), kind: "blank" });
      return;
    }
    if (!calendarData[r]) return;
    delete td.dataset.date;
    delete td.dataset.kind;
    const isLastDay = r === 3 && c === 6;

    const fragment = document.createDocumentFragment();
    String(calendarData[r][c] ?? "").split("\n").forEach((line, l) => {
      if (isLastDay && afterCalendarLine(line)) return; // In the Lowest card instead
      // The first line is the day, shown in this device's date format
      if (l === 0 || line.trim()) fragment.appendChild(BudgetUI.renderEntryLine(l === 0 ? showDay(date) : line, l, date));
    });

    // Its round + (New Entry on that day) and × (close) show once it's zoomed (handled in Process Budget.js)
    content.replaceChildren(fragment, zoomDayButtons());

    td.dataset.row = r;
    td.dataset.col = c;
    td.classList.toggle("isToday", date.getTime() === today.getTime());
    td.classList.toggle("isPast", date < today);
    // (The 28 days after the calendar going below $0 turns the Lowest card red instead, see renderAfterCalendar. A day
    // isn't red while the calendar shows only its own entries: the day's In Bank is hidden then.)
    td.classList.toggle("isNegative", (readInBank(calendarData[r][c]) ?? 0) < 0 && mode !== "calendar");
    labelDay(td, date, calendarData[r][c]);
    window.Fractals.renderDay(td, date);
  });
  renderCalendarNav();
}

// Taps on the calendar: filling a waiting date box, and an entry on a zoomed day
function wireCalendar() {
  const calendarTable = document.querySelector(".elastic-table");
  if (!calendarTable) return;

  // While a date field is waiting, tapping a day fills it in instead of zooming the day
  calendarTable.addEventListener("click", (event) => {
    if (!BudgetUI.datePickActive()) return;
    const td = event.target.closest("td");
    const time = td ? dayTime(td) : null;
    if (time === null) return;
    event.stopPropagation();
    event.preventDefault();
    BudgetUI.pickDate(new Date(time), td);
  }, true);

  // Tapping an entry inside a zoomed day opens its options (not while the day shrinks back: a tap then zooms it
  // in again, see Process Budget.js). A day the calendar was moved to works like one zoomed in as a guest.
  calendarTable.addEventListener("click", (event) => {
    const lineEl = event.target.closest(".lineEntry, .lineInBank");
    if (!lineEl) return;
    const td = lineEl.closest("td");
    if (!td || !td.classList.contains("is-editing") || td.classList.contains("isZoomClosing")) return;
    if (td.dataset.row === undefined) return guestEntryTap(event);
    if (lineEl.classList.contains("lineInBank")) BudgetUI.openInBankOptions(lineEl, gridDates[Number(td.dataset.row)][Number(td.dataset.col)]);
    else openEntryOptions(lineEl, Number(td.dataset.row), Number(td.dataset.col), Number(lineEl.dataset.line));
  });
}

//#endregion

// =====================================================================
// #region THE CALENDAR'S HEADER (what it shows, the fractals, and moving it)
// =====================================================================
// At the left: three buttons for what the calendar shows ($ the budget, the calendar's entries, or both between them;
// kept on this device), and Calendar Fractals, the list of calendars to check (Fractals.js). At the right: Today, the
// month with ‹ and › (each moves to a month's first week), the year, and a date box with its calendar button (the
// calendar moves so that day is in its first week).

// The small calendar on a button (stylesheet.css .iconCalendar)
function calendarIcon() {
  const icon = BudgetUI.element("span", "buttonIcon iconCalendar");
  icon.setAttribute("aria-hidden", "true");
  return icon;
}

// The header's buttons: what the calendar shows, the fractal list, and the ways to move it (the year list runs over the
// calendar's range)
function wireCalendarHeader() {
  const viewBox = document.getElementById("calendarView");
  if (!viewBox) return;
  const view = BudgetUI.segmented([
    { key: "budget", label: "$", name: "Show the budget only" },
    { key: "both", label: "$", name: "Show the budget and the calendar" },
    { key: "calendar", label: "", name: "Show the calendar only" }
  ], window.Fractals.view(), (key) => window.Fractals.setView(key));
  view.el.setAttribute("aria-label", "What the calendar shows");
  view.el.children[1].append(calendarIcon());
  view.el.children[2].append(calendarIcon());
  viewBox.replaceWith(view.el);
  view.el.id = "calendarView";
  view.el.classList.add("calendarView");
  window.Fractals.wirePicker(document.getElementById("fractalPicker"));

  const range = calendarRange();
  const stepMonth = (step) => {
    const anchor = viewAnchor || today;
    moveCalendar(new Date(anchor.getFullYear(), anchor.getMonth() + step, 1));
  };
  document.getElementById("calendarPrev").addEventListener("click", () => stepMonth(-1));
  document.getElementById("calendarNext").addEventListener("click", () => stepMonth(1));
  document.getElementById("calendarToday").addEventListener("click", () => {
    document.getElementById("calendarJump").value = "";
    moveCalendar(today);
  });
  const year = document.getElementById("calendarYear");
  for (let y = range.first.getFullYear(); y <= range.last.getFullYear(); y++) year.appendChild(new Option(String(y), String(y)));
  year.addEventListener("change", () => {
    const anchor = viewAnchor || today;
    const lastDay = new Date(Number(year.value), anchor.getMonth() + 1, 0).getDate();
    moveCalendar(new Date(Number(year.value), anchor.getMonth(), Math.min(anchor.getDate(), lastDay)));
  });
  const jump = document.getElementById("calendarJump");
  jump.placeholder = datePattern();
  jump.translate = false;
  jump.after(BudgetUI.datePickerButton(jump, "date to go to", { min: range.first, max: range.last }));
  const goToTyped = () => {
    if (!jump.value.trim()) return;
    const typed = parseTypedDate(jump.value);
    if (isNaN(typed.getTime())) return BudgetUI.showToast("That isn't a date. Type one like the box shows, or use the calendar button.", true);
    if (typed < range.first || typed > range.last) BudgetUI.showToast(`The calendar goes from ${showDate(range.first)} to ${showDate(range.last)}.`, true);
    moveCalendar(typed);
  };
  jump.addEventListener("change", goToTyped);
  jump.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    goToTyped();
  });
  renderCalendarNav();
}

// The header's month and year (the month of the day the calendar was moved to, or today's), and which of its buttons
// can still go further
function renderCalendarNav() {
  const month = document.getElementById("calendarMonth");
  if (!month) return;
  const range = calendarRange();
  const anchor = viewAnchor || today;
  month.textContent = MONTHS[anchor.getMonth()];
  document.getElementById("calendarYear").value = String(anchor.getFullYear());
  document.getElementById("calendarPrev").disabled = new Date(anchor.getFullYear(), anchor.getMonth(), 0) < range.first;
  document.getElementById("calendarNext").disabled = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1) > range.last;
  document.getElementById("calendarToday").classList.toggle("isCurrent", showsOwnWeeks());
}

//#endregion

// =====================================================================
// #region QUICK CALENDAR ENTRIES TO ADD (from other devices' Quick Calendar icons)
// =====================================================================
// A calendar entry made with a Quick Calendar icon joins the calendar by itself on the device that made the icon. From
// any other device's icon it waits here, with Add (it goes on the calendar) and Delete (it's gone, never added).

function renderCalendarWaiting() {
  const card = document.getElementById("calendarWaiting");
  const list = document.getElementById("calendarWaitingList");
  if (!card || !list) return;
  const calendar = window.Fractals.data();
  const waiting = calendar ? calendar.waiting : [];
  card.hidden = waiting.length === 0;
  list.replaceChildren(...waiting.map(calendarWaitingRow));
}

// One waiting calendar entry: its title over when it is, with Add and Delete
function calendarWaitingRow(waiting) {
  const row = BudgetUI.element("li", "waitingItem");
  const text = BudgetUI.noTranslate(BudgetUI.element("span", "waitingText"));
  text.append(BudgetUI.element("span", "waitingTitle", waiting.event.title), BudgetUI.element("span", "waitingDetails", window.Fractals.whenWords(waiting.event)));
  const answer = async (add) => {
    if (!add && !window.confirm(`Delete ${waiting.event.title}? It won't be added to your calendar.`)) return;
    row.querySelectorAll("button").forEach(control => { control.disabled = true; });
    const result = await window.Fractals.change("waiting", { id: waiting.id, add });
    if (!result.ok) return BudgetUI.showToast(window.Fractals.problem(result, "That didn't work. Please try again."), true);
    if (result.data.error) return BudgetUI.showToast(result.data.error, true);
    BudgetUI.showToast(`${add ? "Added" : "Deleted"} ${waiting.event.title}.`);
  };
  const add = BudgetUI.element("button", "budgetButton primary waitingAdd", "Add");
  add.type = "button";
  add.setAttribute("aria-label", `Add ${waiting.event.title}`);
  add.addEventListener("click", () => answer(true));
  const remove = BudgetUI.element("button", "budgetButton danger waitingDelete", "Delete");
  remove.type = "button";
  remove.setAttribute("aria-label", `Delete ${waiting.event.title}`);
  remove.addEventListener("click", () => answer(false));
  row.append(text, add, remove);
  return row;
}

//#endregion

// =====================================================================
// #region ONE ENTRY AFTER ANOTHER (an entry's window: its ‹ and ›, and swiping it)
// =====================================================================
// An entry's window (a budget entry's options, or a calendar entry's) moves on to the entry before it or after it, in
// the order they show: a day's budget entries, then its calendar entries, then the next day's (whichever the calendar is
// showing). The day of the entry it moves to zooms in under it.

// A day's entries in the order they show: [{ kind: "budget", date, line, lineIndex, inHistory } | { kind: "event",
// date, event, day (the day that occurrence starts) }]
function entriesInOrder(date) {
  const entries = [];
  const mode = window.Fractals.view();
  const day = mode === "calendar" ? null : budgetDayAt(date);
  if (day && day.kind !== "blank") {
    String(day.text).split("\n").forEach((line, lineIndex) => {
      if (lineIndex === 0 || !line.trim() || isAfterCalendarLine(line)) return;
      const parsed = readLine(line);
      if (!parsed.blank && !parsed.system) entries.push({ kind: "budget", date, line, lineIndex, inHistory: day.kind === "history" });
    });
  }
  if (mode !== "budget") {
    for (const part of window.Fractals.eventsOn(date)) entries.push({ kind: "event", date, event: part.event, day: part.day });
  }
  return entries;
}

// Is this the entry a window was opened for?
function isOpenEntry(entry, opened) {
  if (entry.kind !== opened.kind) return false;
  return entry.kind === "budget" ? entry.line === opened.line : entry.event.id === opened.id && entry.day === opened.day;
}

// Move from the entry a window is open for to the one before it (step -1) or after it (1), across days
function stepEntry(opened, step) {
  const range = calendarRange();
  let date = activeEditCell && dayTime(activeEditCell) !== null ? new Date(dayTime(activeEditCell)) : opened.kind === "budget" ? opened.date : createSafeMidnight(opened.day);
  let entries = entriesInOrder(date);
  let index = entries.findIndex(entry => isOpenEntry(entry, opened));
  if (index === -1) index = step > 0 ? -1 : entries.length;
  index += step;
  for (let tries = 0; index < 0 || index >= entries.length; tries++) {
    date = addDays(date, step);
    if (tries > 400 || date < range.first || date > range.last) return BudgetUI.showToast(`That's the ${step > 0 ? "last" : "first"} entry for a while.`);
    entries = entriesInOrder(date);
    index = step > 0 ? 0 : entries.length - 1;
  }
  const next = entries[index];
  BudgetUI.closeAllPanels(true);
  if (!activeEditCell || dayTime(activeEditCell) !== next.date.getTime()) zoomBudgetDay(next.date);
  const cell = activeEditCell;
  const shown = (node) => node.getClientRects().length > 0;
  if (next.kind === "budget") {
    const lineEl = cell ? [...cell.querySelectorAll(".lineEntry")].find(node => Number(node.dataset.line) === next.lineIndex) : null;
    BudgetUI.openEntryOptions(lineEl || cell, next.line, next.date, { lineIndex: next.lineIndex, inHistory: next.inHistory });
  } else {
    const node = cell ? [...cell.querySelectorAll(".fractalEvent")].find(found => found.dataset.event === next.event.id && shown(found)) : null;
    window.Fractals.openEvent(node || cell, next.event, next.day);
  }
}

document.addEventListener("entry:opened", (event) => {
  const opened = event.detail;
  if (opened && opened.panel) window.Fractals.addSteps(opened.panel, (step) => stepEntry(opened, step));
});

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

// (New Entry is BudgetUI.openNewEntry: a zoomed day's + opens it too)

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

// Quick Calendar Icon: makes a key (only while signed in) and opens the Quick Calendar page with it in the link, ready
// to add to the home screen. The icon then opens the calendar with no login: it shows the calendar's entries and adds
// new ones, which join the calendar the next time Prismal Planning opens on this device (or from Home's card on another).
function openQuickCalendarSetup(origin) {
  BudgetUI.openPanel({
    origin,
    size: "large",
    title: "Quick Calendar Icon",
    build(form, panel) {
      const text = (line) => BudgetUI.element("p", "panelText", line);
      form.append(
        text("Put an icon on your phone's home screen that opens your calendar, with no login needed."),
        text("The icon shows your calendar's entries (every Calendar Fractal, and the entries shared with you) and can add new ones. It never sees your budget. What it adds shows up here the next time you open Prismal Planning (and until then, the icon can still change one or take it back). If your password changes, or you turn icons off in Settings, it stops working."),
        text("Anyone holding the phone can open it, so only make one on a phone you keep locked."),
        BudgetUI.buttonRow([
          { label: "Set It Up", kind: "primary", type: "submit" },
          { label: "Cancel", onClick: () => panel.close() }
        ])
      );

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        panel.setError("");
        panel.setBusy(true);
        const result = await window.Fractals.call("/api/fractals/key", {});
        if (!result.ok || !result.data || !result.data.key) {
          panel.setBusy(false);
          panel.setError(result.status === 0 ? "Couldn't reach the server. Please try again." : "Couldn't set it up. Please try again.");
          return;
        }
        // (This device's own icon: its entries join the calendar as soon as it loads here)
        await window.Fractals.rememberIcon(result.data.key);
        const url = `/quickcal.html?key=${encodeURIComponent(result.data.key)}&setup=1`;
        if (typeof window.transitionTo === "function") window.transitionTo(url);
        else window.location.href = url;
      });
    }
  });
}

// Options for an entry tapped inside a zoomed day: set or add to the amount, change its type or account, move it, or
// delete it (BudgetUI.openEntryOptions, which a day drawn from History shares)
function openEntryOptions(lineEl, r, c, lineIndex) {
  const line = String(calendarData[r][c]).split("\n")[lineIndex];
  if (line) BudgetUI.openEntryOptions(lineEl, line, gridDates[r][c], { lineIndex });
}

//#endregion
