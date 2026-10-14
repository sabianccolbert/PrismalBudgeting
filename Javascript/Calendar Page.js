// Calendar Page: the home page. "Lowest in bank after today", Dave,
// Upcoming, the calendar's day cells, and the new-entry / entry-options panels.
// Zooming a day is handled in Process Budget.js (LAYOUT FUNCTIONS); tapping an entry inside a
// zoomed day opens its options here.

// =====================================================================
// #region SETUP
// =====================================================================

window.workspaceReady.then((loaded) => {
  if (!loaded) {
    const dave = document.getElementById("daveMessage");
    if (dave) dave.textContent = "Couldn't load your budget data. Please refresh to try again.";
    // The calendar's first day says "Loading..." until the budget is there
    const firstDay = document.querySelector(".elastic-table .cell-content");
    if (firstDay) firstDay.textContent = "Couldn't load your budget";
    return;
  }
  startDaveVisit(); // Dave's tip for this visit, if there is one (Process Budget.js DAVE'S TIPS)
  renderHome();
  wireCalendar();
  wireGettingStarted();
  wireUndoButtons();
  document.getElementById("addEntryButton")?.addEventListener("click", (event) => openNewEntryPanel(event.currentTarget));
  document.getElementById("quickEntryButton")?.addEventListener("click", (event) => openQuickEntrySetup(event.currentTarget));
});

document.addEventListener("budget:updated", () => {
  if (workspaceLoaded) renderHome();
});

// Draw everything on Home from the budget
function renderHome() {
  renderGettingStarted();
  renderCalendar();
  renderInfoRow();
  renderUndoButtons();
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
// (like typing it on Other Accounts: no entry, so it isn't counted as a gain). The card only shows on the
// account's first sign-in (GETTING_STARTED_KEY in Process Budget.js), until the starting balance and a
// recurring entry are there or it's hidden with ×.

const STARTING_BALANCE = "Starting Balance";

// Is this the account's first sign-in, with the card not done or hidden yet?
function isGettingStarted() {
  try { return localStorage.getItem(GETTING_STARTED_KEY) === "1"; } catch (e) { return false; }
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

// The card's × and its starting balance form
function wireGettingStarted() {
  document.getElementById("gettingStartedHide")?.addEventListener("click", () => {
    finishGettingStarted();
    document.getElementById("gettingStarted").hidden = true;
  });
  document.getElementById("startBalanceForm")?.addEventListener("submit", setStartingBalance);
}

// "1,500.00", "$1500", or "1500,50" -> the amount (to the cent); null when it isn't an amount
function readStartAmount(text) {
  const amount = readMoneyInput(text);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : null;
}

// Set: today's ⭕️ Starting Balance, and savings as the default account's balance today
async function setStartingBalance(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const balance = readStartAmount(document.getElementById("startBalance").value);
  const savingsText = document.getElementById("startSavings").value.trim();
  const savings = savingsText ? readStartAmount(savingsText) : 0;
  if (balance === null) return BudgetUI.showToast("Enter what's in your bank account, like 1500.00 (or -25.00 if it's overdrawn).", true);
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
      // The first line is the day, shown in this device's date format
      if (l === 0 || line.trim()) fragment.appendChild(BudgetUI.renderEntryLine(l === 0 ? showDay(gridDates[r][c]) : line, l));
    });

    // Its v closes the zoomed day (handled in Process Budget.js)
    content.replaceChildren(fragment, zoomCloseButton());

    td.dataset.row = r;
    td.dataset.col = c;
    td.classList.toggle("isToday", gridDates[r][c].getTime() === today.getTime());
    // The last day also turns red when the 28 days after the calendar go negative (its "Lowest" line)
    const isLastDay = r === 3 && c === 6;
    td.classList.toggle("isNegative", (readInBank(calendarData[r][c]) ?? 0) < 0 || (isLastDay && nextFourNegative));
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
    if (lineEl.classList.contains("lineInBank")) openInBankOptions(lineEl, Number(td.dataset.row), Number(td.dataset.col));
    else openEntryOptions(lineEl, Number(td.dataset.row), Number(td.dataset.col), Number(lineEl.dataset.line));
  });
}

// The title of the entry that makes a day's In Bank match the bank's (search() and the spending numbers know it
// as "catch up" in any spelling)
const CATCHUP_TITLE = "Catchup";

// In Bank tapped on a zoomed day: type what the bank says, and the difference goes on that day as a Transfer
// titled Catchup, with no Other Account (adding into one that's already there), so that day and the ones after
// it follow. A Transfer changes In Bank without being a cost or gain, so the fix isn't counted as spending.
function openInBankOptions(lineEl, r, c) {
  const date = gridDates[r][c];
  const current = readInBank(calendarData[r][c]);
  if (current === null) return;
  BudgetUI.openPanel({
    origin: lineEl,
    size: "small",
    title: `${showDay(date)} In Bank`,
    build(form, panel) {
      const balance = BudgetUI.textField({
        label: "In Bank",
        value: current.toFixed(2),
        placeholder: "0.00",
        hint: `What your bank says for this day. The difference goes on it as a ⭕️ Transfer titled ${CATCHUP_TITLE} (with no Other Account), and the days after it follow.`
      });
      balance.input.inputMode = "decimal";
      form.append(balance.el, BudgetUI.buttonRow([
        { label: "Save", kind: "primary", type: "submit" },
        { label: "Cancel", onClick: () => panel.close() }
      ]));
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const typed = readMoneyInput(balance.value());
        if (!Number.isFinite(typed)) return panel.setError("Enter what's in the bank, like 1250.00 (or -40.00 when it's below zero).");
        if (Math.abs(typed) > MAX_AMOUNT) return panel.setError(AMOUNT_TOO_BIG);
        const difference = Math.round((typed - current) * 100) / 100;
        if (difference === 0) return panel.close(); // Already right
        BudgetUI.submit(panel, () => addCalendarEntry({ title: CATCHUP_TITLE, sprite: "⭕️", amount: difference, date }));
      });
    }
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

  renderDave();

  const list = document.getElementById("upcomingList");
  if (!list) return;
  list.replaceChildren();
  if (upcomingEntries.length === 0) {
    list.appendChild(BudgetUI.element("li", "upcomingEmpty", "Nothing scheduled past this calendar."));
    return;
  }
  for (const upcoming of upcomingEntries) {
    const item = BudgetUI.noTranslate(BudgetUI.element("li", "upcomingItem"));
    item.appendChild(BudgetUI.element("span", "upcomingDate", showDate(upcoming.date)));
    const entry = BudgetUI.element("span", "upcomingEntry", `${upcoming.sprite} ${formatMoney(upcoming.amount)} ${upcoming.title}`);
    if (upcoming.amount > 0) entry.classList.add("positive");
    item.appendChild(entry);
    list.appendChild(item);
  }
}

// Dave's tip, highlighted, while it has its 10 minutes (see DAVE'S TIPS in Process Budget.js); otherwise his
// everyday message. When the tip's time is up on an open page, he goes back to the everyday one.
let daveTipTimer = 0;
function renderDave() {
  const dave = document.getElementById("daveMessage");
  if (!dave) return;
  const tip = currentDaveTip();
  dave.textContent = tip ? tip.text : daveMessage;
  dave.closest(".daveCard")?.classList.toggle("daveTip", !!tip);
  const label = document.getElementById("daveTipLabel");
  if (label) label.hidden = !tip;
  clearTimeout(daveTipTimer);
  if (tip) daveTipTimer = setTimeout(renderDave, Math.max(0, tip.until - Date.now()) + 100);
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
      const fields = BudgetUI.newEntryFields({ accounts: otherAccounts() });
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
        text("The icon can only add entries. It never sees your budget, just your Other Accounts and their balances (so you can pick one) and your prisms (entries you save there to fill in quickly). Its entries show up here the next time you open Prismal Budget (and until then, its own Undo can take one back). If your password changes, or you turn icons off in Settings, it stops working."),
        text("On the next page, add it to your home screen: on iPhone, in Safari, tap Share, then Add to Home Screen. On Android, in Chrome, tap ⋮, then Add to Home screen. Use Safari or Chrome itself, not Prismal Budget opened inside another app (like Gmail or Instagram)."),
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
    title: `${showDay(date)} Entry`,
    build(form, panel) {
      const display = BudgetUI.renderEntryLine(line, lineIndex);
      display.classList.add("panelEntry");
      // An entry for an Other Account changes it: a Transfer by the opposite amount, a Hidden entry by its own
      const account = linkedAccount(parts[0], title);
      const accountNote = account ? BudgetUI.element("p", "panelHint", refraction === "⭕️"
        ? `${account.name} (Other Accounts) gets the opposite of this entry's amount, since the money moves between it and In Bank.`
        : `${account.name} (Other Accounts) changes by this entry's amount, and In Bank doesn't.`) : null;

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

      // Its refraction type and Other Account can change too. Then it comes off as it is and goes on as the new
      // one, adding into an entry already on that day with the same title and type (changeEntryKind).
      const { title: ownTitle } = splitAccount(title);
      const type = BudgetUI.refractionField({ value: refraction, allowAuto: false, onChange: (key) => accountPicker.setVisible(BudgetUI.isAccountType(key)) });
      const accountPicker = BudgetUI.accountField({ accounts: otherAccounts(), amount, type: () => type.value(), account: account ? account.name : "" });
      accountPicker.setVisible(BudgetUI.isAccountType(refraction));
      const startAccount = accountPicker.value();

      form.append(display, ...(accountNote ? [accountNote] : []), type.el, accountPicker.el, BudgetUI.field("Change the amount", modeToggle.el), amount.el, moveTo.el, BudgetUI.buttonRow([
        { label: "Save", kind: "primary", type: "submit" },
        { label: "Delete", kind: "danger", onClick: deleteEntry },
        { label: "Cancel", onClick: () => panel.close() }
      ]));

      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const newAmount = amount.value();
        const move = moveTo.value();
        if (Number.isNaN(newAmount)) return panel.setError("Enter an amount, like 12.50.");
        if (newAmount !== null && Math.abs(newAmount) > MAX_AMOUNT) return panel.setError(AMOUNT_TOO_BIG);
        if (move === undefined) return panel.setError(`That date isn't a real day. Use ${datePattern()}.`);

        const newSprite = type.value();
        const newAccount = accountPicker.value();
        if (newSprite !== refraction || newAccount !== startAccount) {
          const total = mode === "set" ? (newAmount === null ? currentAmount : newAmount) : currentAmount + (newAmount || 0);
          if (Math.abs(total) > MAX_AMOUNT) return panel.setError(AMOUNT_TOO_BIG);
          const newTitle = withAccount(ownTitle, newAccount);
          // "→ Savings" has no title of its own, so it can't leave its account (this box doesn't change titles)
          if (!newTitle) return panel.setError("This entry has no title of its own, so it needs an Other Account. To take it off, tap Delete.");
          const kind = { title, sprite: refraction, date, newTitle, newSprite, amount: total };
          if (move && move.getTime() !== date.getTime()) kind.moveDate = move;
          return BudgetUI.submit(panel, () => changeEntryKind(kind));
        }

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

      // Delete: it comes off its day (one that landed there by itself leaves a $0.00 temp)
      function deleteEntry() {
        if (!window.confirm(`Delete ${title} on ${showDay(date)}?`)) return;
        BudgetUI.submit(panel, () => changeCalendarEntry({ title, sprite: refraction, date, action: "delete" }));
      }
    }
  });
}

//#endregion
