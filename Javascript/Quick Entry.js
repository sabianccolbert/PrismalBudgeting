// Quick Entry: the page a home screen icon opens (quick.html?key=...). It's the calendar's New Entry
// form with no login. The key in the link comes from Home's Quick Entry button (made
// while signed in) and can only queue entries, which the budget adds the next time it opens on the device that made
// the icon, or which wait on its Home to be added or deleted on another device (see holdQuickEntries in Process
// Budget.js), and change or delete the ones it queued until a budget has
// loaded them (see WAITING ENTRIES). Besides those, it only gets In Bank today and the lowest it gets (shown at the top), the Other Accounts'
// names and balances, for the account picker, and the account's prisms (preset entries, see PRISMS), which it can
// change. Keys stop working when the password changes. Nothing on the site links here. Opened without a key, or with
// one that stopped working, it goes to the sign-in page. Opened on an Apple Watch (a link tapped in Messages or Mail
// there), it shows only In Bank today and the lowest it gets.
// Process Budget.js is only loaded for its helpers: it skips loading a budget here.

// =====================================================================
// #region SETUP
// =====================================================================

const quickParams = new URLSearchParams(location.search);
const quickKey = quickParams.get("key") || "";
// The API stores refraction types by name: "✖️" -> "hidden"
const QUICK_TYPE_NAMES = Object.fromEntries(Object.entries(QUICK_ENTRY_TYPES).map(([name, sprite]) => [sprite, name]));
let quickUsername = null;
let quickAccounts = []; // The budget's Other Accounts for the account picker: [{ name, balance }] (see showQuickAccounts)
let quickPrisms = [];   // The account's prisms, in order: [{ title, amount, type }] (see PRISMS)
let quickPurposes = false; // The form asks Needs, Wants, Or Future (Bob's card for it is on; the API's check says)
const QUICK_NOTE_MAX = 20000; // The longest note an entry from here can have (the API keeps the same limit)
let quickQueued = [];   // The entries this icon added that are still waiting: [{ id, title, type, amount, date, joining }]
let quickForm = null;   // The form on the page: { panel, fields, mode: "entry" (New Entry) | "prism" (New Prism) |
                        // "change" (Change Entry, a waiting one), changing (that entry) }
let quickFormDay = null; // This phone's date when the form opened (see moveFormToNewDay)
// Undo and Redo for entries added on this page: [{ id, entry }] (id: the API's, while it waits; see the end)
const quickUndo = [];
const quickRedo = [];

// An Apple Watch (its browser says "Watch" in its name; or any screen too small for the form) shows only In Bank today
// and the lowest it gets
const onWatch = /\bWatch(\d|\b)|watchOS|Watch OS/i.test(navigator.userAgent) || Math.min(screen.width, screen.height) < 250;
document.documentElement.classList.toggle("watchView", onWatch);

// Just set up from the calendar page: show how to add it to the home screen, and drop setup=1 from the
// link so the saved icon opens straight to the form
if (quickKey && quickParams.has("setup")) {
  document.getElementById("setupCard").hidden = false;
  history.replaceState(null, "", `${location.pathname}?key=${encodeURIComponent(quickKey)}`);
}

// Home goes to the budget when this browser is signed in, and straight to the login page when it isn't (not the
// front page)
let quickSignedIn = false;
try { quickSignedIn = !!localStorage.getItem("prismal_jwt"); } catch (e) {}
const quickHomeLink = document.querySelector('.navButtons a[href="/"]');
if (quickHomeLink && !quickSignedIn) quickHomeLink.href = "/login.html";

checkQuickKey();

// Help's Copy Link: this page's link (its key in it), for an iPhone shortcut that opens it from the Lock Screen
document.getElementById("copyQuickLink")?.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(location.href);
    BudgetUI.showToast("Link copied. Paste it into the shortcut's Open URLs action.");
  } catch (e) {
    BudgetUI.showToast("Couldn't copy it here. Tap Share in Safari, then Copy, instead.", true);
  }
});

//#endregion

// =====================================================================
// #region KEY + FORM
// =====================================================================

async function checkQuickKey() {
  // Without a key there's nothing this page can do: sign in instead (Home's Quick Entry button makes one)
  if (!quickKey) {
    transitionTo("/login.html", true);
    return;
  }
  const result = await quickApi("/api/quick/check", { key: quickKey, today: quickToday() });
  if (result.status === 401) return keyStopped();
  // Offline, or the server is down: the form still shows, and adding an entry says what went wrong
  if (result.ok && result.data) {
    // This device's own icon (where the page shares the budget's storage): the budget adds its entries when it opens here
    rememberQuickIcon(quickKey);
    quickUsername = result.data.username;
    quickPurposes = result.data.purposes === true;
    showQuickAnswer(result.data);
    // Prisms need the server, so they show once the key is known to work
    quickPrisms = Array.isArray(result.data.prisms) ? result.data.prisms : [];
    document.getElementById("prismSection").hidden = false;
    renderPrisms();
  } else {
    showQuickStatus("");
  }
  openQuickEntryForm();
}

// The form: New Entry; New Prism (mode "prism", from Add Prism), which glows and keeps only what's filled in or picked
// (no date); or Change Entry (mode "change", from Waiting), one of this icon's waiting entries. fill: { title, amount,
// sprite, account } to start with (what was already in the form, or the waiting entry's). changing: that waiting entry.
function openQuickEntryForm(mode = "entry", fill = null, changing = null) {
  const makingPrism = mode === "prism";
  const changingEntry = mode === "change" && !!changing;
  quickFormDay = createSafeMidnight(new Date());
  BudgetUI.openPanel({
    size: "large",
    title: makingPrism ? "New Prism" : changingEntry ? "Change Entry" : "New Entry",
    closable: false,
    inline: true, // The form is the page here, not something on top of it
    build(form, panel) {
      const day = changingEntry ? createSafeMidnight(changing.date, true) : quickFormDay;
      // (Needs, Wants, Or Future starts with nothing picked: the page can't see which one a title has)
      const fields = BudgetUI.newEntryFields({ date: day, accounts: quickAccounts, purposes: quickPurposes, purposeLookup: null, noteMax: QUICK_NOTE_MAX });
      if (makingPrism) {
        form.append(BudgetUI.element("p", "panelHint prismDraftHint", "Fill in or pick only what this prism should keep: a title, an amount, a type, or an account. Then tap Save Prism."));
        panel.panel.classList.add("prismDraft");
      }
      if (changingEntry) {
        form.append(BudgetUI.element("p", "panelHint prismDraftHint", "Change what you like, then tap Save Changes. It's still waiting to join your budget."));
        panel.panel.classList.add("changeDraft");
      }
      const buttons = makingPrism
        ? [{ label: "Save Prism", kind: "primary", type: "submit" }, { label: "Cancel", onClick: () => openQuickEntryForm("entry", fields.values()) }]
        : changingEntry
          ? [{ label: "Save Changes", kind: "primary", type: "submit" }, { label: "Cancel", onClick: backToNewEntry }]
          : [{ label: "Add Entry", kind: "primary", type: "submit" }];
      // A prism never keeps a date, a title's Needs, Wants, Or Future, or a note, so New Prism has none of them
      form.append(...fields.els.filter(el => !makingPrism || (el !== fields.dateEl && el !== fields.purposeEl)), BudgetUI.buttonRow(buttons));
      if (!makingPrism) form.append(fields.noteEl);
      if (fill) fields.fill(fill);
      quickForm = { panel, fields, mode: changingEntry ? "change" : makingPrism ? "prism" : "entry", changing: changingEntry ? changing : null };

      form.addEventListener("submit", (event) => {
        event.preventDefault();
        if (makingPrism) savePrismFromForm(panel, fields);
        else if (changingEntry) saveWaitingChange(panel, fields, changing);
        else addQuickEntry(panel, fields);
      });
    }
  });
}

// Add Entry: queue it with the API, then a fresh form (Undo can take it back while it waits)
async function addQuickEntry(panel, fields) {
  const { entry, error } = fields.read();
  if (error) return panel.setError(error);

  panel.setError("");
  panel.setBusy(true);
  const queued = toQueued(entry);
  const result = await quickApi("/api/quick/entry", { key: quickKey, entry: queued, today: quickToday() });
  panel.setBusy(false);
  if (result.status === 401) return keyStopped();
  if (!result.ok) return panel.setError(quickProblem(result));
  BudgetUI.showToast(`Added ${describeQueued(queued)}.`);
  showQuickAnswer(result.data);
  if (Number.isInteger(result.data.id)) {
    quickUndo.push({ id: result.data.id, entry: queued });
    quickRedo.length = 0;
  }
  renderQuickUndo();
  openQuickEntryForm(); // A fresh form for the next one
}

// The form's entry as the API keeps it: { title (with its Other Account), type, amount, date: "YYYY-MM-DD", and
// placeholder: true for a placeholder, percent for a % amount (see PERCENT_MARK in Process Budget.js), whose amount is
// what it comes to with the account's balance today; the budget works it out again for its day, purpose: its title's
// Needs, Wants, Or Future, when one was picked (see ENTRY PURPOSES), which the budget gives the title as it's added, and
// note: its note, when it has one (see ENTRY NOTES) }
function toQueued(entry) {
  const hasPercent = typeof entry.percent === "number";
  const account = quickAccounts.find(known => cleanString(known.name) === cleanString(splitAccount(entry.title).account));
  const amount = hasPercent ? percentValue(entry.percent, account?.balance ?? 0) : entry.amount;
  return { title: entry.title, type: QUICK_TYPE_NAMES[entry.sprite] || "auto", amount, date: formatToYMD(entry.date), ...(entry.placeholder ? { placeholder: true } : {}), ...(hasPercent ? { percent: entry.percent } : {}), ...(entry.purpose ? { purpose: entry.purpose } : {}), ...(entry.note && entry.note.trim() ? { note: entry.note } : {}) };
}

// A home screen icon's page often stays open in the background for days. Looked at again on a later day, New
// Entry starts on the new day: the form opens again with what's in it, unless a date was typed in it.
function moveFormToNewDay() {
  if (!quickForm || !quickFormDay || createSafeMidnight(new Date()).getTime() === quickFormDay.getTime()) return;
  if (quickForm.mode !== "entry") return; // New Prism has no date, and New Entry starts on the new day after it
  const dateInput = quickForm.fields.dateEl.querySelector("input.dateInput");
  if (dateInput && dateInput.dataset.touched === "1" && dateInput.value.trim()) return;
  openQuickEntryForm("entry", quickForm.fields.values());
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") moveFormToNewDay();
});
window.addEventListener("pageshow", moveFormToNewDay);
window.addEventListener("focus", moveFormToNewDay);

// The password changed or the icon was replaced, so this icon can't add entries anymore: on to the sign-in
// page, which says why (Login.js SIGNED_OUT_REASONS). Signed in already, that goes straight on to Home.
function keyStopped() {
  try {
    if (!localStorage.getItem("prismal_jwt")) sessionStorage.setItem("prismal_signed_out", "quickKey");
  } catch (e) {}
  transitionTo("/login.html", true);
}

//#endregion

// =====================================================================
// #region PRISMS (preset entries)
// =====================================================================
// A prism is an entry someone adds often, saved with the budget (the API's /api/quick/prisms, one list per
// account, so every icon has the same ones). It keeps any of a title, an amount, and a refraction type (an
// Other Account is its title with Hidden or Transfer), but at least one. Tapping it puts those into New
// Entry and leaves the rest to fill in. Add Prism turns New Entry into New Prism; Edit Prisms drags them
// into order (≡) and deletes them (×). Every change saves the whole list.

const MAX_PRISMS = 30;
let editingPrisms = false;

document.getElementById("addPrismButton").addEventListener("click", () => {
  if (editingPrisms) setPrismEditing(false);
  // What's already in New Entry counts toward the prism (or, while a waiting entry is being changed, what New Entry had)
  const current = !quickForm ? null : quickForm.mode === "entry" ? quickForm.fields.values() : quickForm.mode === "change" ? stashedEntry : null;
  stashedEntry = null;
  openQuickEntryForm("prism", current);
  highlightForm();
});

document.getElementById("prismHelpButton").addEventListener("click", (event) => {
  const help = document.getElementById("prismHelp");
  help.hidden = !help.hidden;
  event.currentTarget.setAttribute("aria-expanded", String(!help.hidden));
});

document.getElementById("editPrismsButton").addEventListener("click", () => setPrismEditing(!editingPrisms));

// Edit Prisms on or off (only with prisms to edit)
function setPrismEditing(editing) {
  editingPrisms = editing && quickPrisms.length > 0;
  renderPrisms();
}

// Each prism is one button; in Edit Prisms, a row with ≡ to drag it and × to delete it
function renderPrisms() {
  const list = document.getElementById("prismList");
  list.classList.toggle("isEditing", editingPrisms);
  list.replaceChildren(...quickPrisms.map((prism, index) => (editingPrisms ? prismEditRow(prism, index) : prismButton(prism))));
  document.getElementById("prismEmpty").hidden = quickPrisms.length > 0;
  const edit = document.getElementById("editPrismsButton");
  edit.hidden = quickPrisms.length === 0;
  edit.textContent = editingPrisms ? "Done" : "Edit Prisms";
  edit.classList.toggle("primary", editingPrisms);
}

// A prism's button: tapping it fills in New Entry (a placeholder's is yellow)
function prismButton(prism) {
  const item = BudgetUI.element("li", "prismItem");
  const button = BudgetUI.noTranslate(BudgetUI.element("button", `budgetButton prismButton${prism.placeholder ? " isPlaceholder" : ""}`, prismLabel(prism)));
  button.type = "button";
  button.addEventListener("click", () => applyPrism(prism));
  item.appendChild(button);
  return item;
}

// A prism in Edit Prisms: ≡ to drag it, and × to delete it
function prismEditRow(prism, index) {
  const label = prismLabel(prism);
  const item = BudgetUI.element("li", "prismItem prismEditRow");
  item.dataset.index = index;
  const handle = BudgetUI.element("span", "prismHandle", "≡");
  handle.title = "Hold and drag to move";
  handle.setAttribute("aria-label", `Move ${label}`);
  handle.addEventListener("pointerdown", (event) => startPrismDrag(event, item));
  const remove = BudgetUI.element("button", "panelClose prismDelete", "×");
  remove.type = "button";
  remove.setAttribute("aria-label", `Delete ${label}`);
  remove.addEventListener("click", () => deletePrism(index));
  item.append(handle, BudgetUI.noTranslate(BudgetUI.element("span", `prismLabel${prism.placeholder ? " isPlaceholder" : ""}`, label)), remove);
  return item;
}

// "❗️ Coffee -$4.50", "Rent", "⭕️ Payday → Savings", or just "⭕️ Transfer". inWords: "Coffee -$4.50 (Regular)"
// instead, for a dialog, which can't show the type's image (only the device's own emoji); a placeholder's then ends in
// "(Placeholder)" (its button is yellow)
function prismLabel(prism, inWords = false) {
  const sprite = prism.type ? QUICK_ENTRY_TYPES[prism.type] : "";
  const type = sprite ? REFRACTION_NAMES.get(sprite) : "";
  const amount = typeof prism.percent === "number" ? showPercent(prism.percent) : prism.amount === null ? "" : formatMoney(prism.amount);
  const parts = [inWords ? "" : sprite, withAccount(prism.title, prism.account), amount].filter(Boolean);
  if (!prism.title && !prism.account && !amount) parts.push(type);
  else if (inWords && type) parts.push(`(${type})`);
  if (inWords && prism.placeholder) parts.push("(Placeholder)");
  return parts.join(" ");
}

// Tapping a prism: what it keeps goes into New Entry (or Change Entry, while a waiting entry is being changed), which
// comes into view with the first thing still to fill in ready to type
function applyPrism(prism) {
  if (!quickForm || quickForm.mode === "prism") openQuickEntryForm("entry");
  const { fields } = quickForm;
  fields.fill({ title: prism.title, amount: prism.amount, percent: prism.percent ?? null, sprite: prism.type ? QUICK_ENTRY_TYPES[prism.type] : "", account: prism.account || "", placeholder: !!prism.placeholder });
  // An account renamed or deleted since the prism was saved isn't in the list, so it says to pick one
  if (prism.account && !quickAccounts.some(account => cleanString(account.name) === cleanString(prism.account))) {
    BudgetUI.showToast(`${prism.account} isn't one of your Other Accounts anymore. Pick one under Other Account, or leave it as None.`, true);
  }
  highlightForm();
  const next = [fields.inputs.title, fields.inputs.amount].find(input => !input.value.trim());
  if (next) next.focus({ preventScroll: true });
}

// Scroll the form into view and make it glow for a moment
function highlightForm() {
  const panel = quickForm && quickForm.panel.panel;
  if (!panel) return;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  panel.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
  panel.classList.remove("prismFlash");
  void panel.offsetWidth; // Restart the glow
  panel.classList.add("prismFlash");
  setTimeout(() => panel.classList.remove("prismFlash"), 1200);
}

// Save Prism: whatever's filled in or picked (Auto counts as nothing picked), and at least one thing (Placeholder alone
// doesn't count: it goes with what the prism fills in)
async function savePrismFromForm(panel, fields) {
  const { title, amount: typedAmount, percent, sprite, account, placeholder } = fields.values();
  if (title.includes(ACCOUNT_ARROW)) return panel.setError(TITLE_ARROW);
  // (A % box left empty keeps no amount, like an empty amount box)
  if (Number.isNaN(percent)) return panel.setError("Enter the percent as a number, like 3 or 12.5, or leave it blank.");
  if (percent !== null && Math.abs(percent) > MAX_PERCENT) return panel.setError(`A percent can be up to ${MAX_PERCENT}%.`);
  const amount = percent !== null ? null : typedAmount;
  if (Number.isNaN(amount)) return panel.setError("Enter an amount, like 12.50, or leave it blank.");
  if (amount !== null && Math.abs(amount) > MAX_AMOUNT) return panel.setError(AMOUNT_TOO_BIG);
  // The title and the Other Account are kept apart, so the title is never the account's name unless it was typed
  const prism = { title, amount, type: sprite ? QUICK_TYPE_NAMES[sprite] : null, account: account || null, ...(placeholder ? { placeholder: true } : {}), ...(percent ? { percent } : {}) };
  if (!prism.title && prism.amount === null && !prism.percent && !prism.type && !prism.account) {
    return panel.setError("Fill in or pick at least one thing for this prism: a title, an amount, a type, or an account.");
  }
  if (quickPrisms.length >= MAX_PRISMS) return panel.setError(`You can have up to ${MAX_PRISMS} prisms. Delete one in Edit Prisms first.`);
  panel.setError("");
  panel.setBusy(true);
  const saved = await savePrisms([...quickPrisms, prism]);
  panel.setBusy(false);
  if (!saved) return;
  BudgetUI.showToast(`Prism saved: ${prismLabel(prism)}.`);
  openQuickEntryForm(); // Back to New Entry
}

// Delete a prism (after asking)
async function deletePrism(index) {
  const prism = quickPrisms[index];
  if (!prism || !window.confirm(`Delete the prism ${prismLabel(prism, true)}?`)) return;
  if (await savePrisms(quickPrisms.filter((_, i) => i !== index))) {
    BudgetUI.showToast(`Deleted the prism ${prismLabel(prism)}.`);
    if (quickPrisms.length === 0) setPrismEditing(false);
  }
}

// Save the whole list. Resolves to true when it's saved; otherwise says why and shows the list as it was.
async function savePrisms(list) {
  const result = await quickApi("/api/quick/prisms", { key: quickKey, prisms: list });
  if (result.status === 401) {
    keyStopped();
    return false;
  }
  if (!result.ok || !result.data || !Array.isArray(result.data.prisms)) {
    BudgetUI.showToast((result.data && result.data.error) ||
      (result.status === 0 ? "Couldn't reach Prismal Budget, so the prisms weren't saved. Check your connection and try again." : "Couldn't save the prisms. Please try again."), true);
    renderPrisms();
    return false;
  }
  quickPrisms = result.data.prisms;
  renderPrisms();
  return true;
}

// Hold a prism's ≡ and drag it up or down; the new order saves when it's let go. The pointer is followed
// on the whole page: moving the row in the list makes the browser let go of a pointer capture.
function startPrismDrag(event, item) {
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
    if (order().join() !== startOrder) savePrisms(order().map(i => quickPrisms[i]));
  };
  document.addEventListener("pointermove", onMove);
  document.addEventListener("pointerup", onEnd);
  document.addEventListener("pointercancel", onEnd);
}

//#endregion

// =====================================================================
// #region UNDO + REDO (entries added on this page)
// =====================================================================
// Undo takes back the newest entry added here, while it's still waiting to join the budget (the API only
// lets this icon take back entries it added). Once the budget has added it, it's undone from the calendar
// instead. Redo adds it again.

document.getElementById("quickUndoButton").addEventListener("click", undoQuickEntry);
document.getElementById("quickRedoButton").addEventListener("click", redoQuickEntry);

// Undo and Redo show while there's something to take back or add again (or entries waiting, for Waiting beside them),
// and say what
function renderQuickUndo() {
  const undoButton = document.getElementById("quickUndoButton");
  const redoButton = document.getElementById("quickRedoButton");
  const last = quickUndo.at(-1);
  const next = quickRedo.at(-1);
  document.getElementById("quickUndo").hidden = !last && !next && quickQueued.length === 0;
  undoButton.disabled = !last;
  redoButton.disabled = !next;
  undoButton.title = last ? `Undo: ${describeQueued(last.entry)}` : "Nothing to undo";
  redoButton.title = next ? `Redo: ${describeQueued(next)}` : "Nothing to redo";
  undoButton.setAttribute("aria-label", undoButton.title);
  redoButton.setAttribute("aria-label", redoButton.title);
}

// Undo: take back the newest entry added here, while it's still waiting
async function undoQuickEntry() {
  const last = quickUndo.at(-1);
  if (!last) return;
  setQuickUndoBusy(true);
  const result = await quickApi("/api/quick/unqueue", { key: quickKey, id: last.id, today: quickToday() });
  setQuickUndoBusy(false);
  if (result.status === 401) return keyStopped();
  if (result.ok) {
    quickUndo.pop();
    quickRedo.push(last.entry);
    BudgetUI.showToast(`Took back ${describeQueued(last.entry)}.`);
    showQuickAnswer(result.data);
    leaveChangeOf(last.id);
  } else if (result.data && result.data.joined) {
    quickUndo.pop(); // It's in the budget now: undo it there
    showWaiting(result.data);
    BudgetUI.showToast(result.data.error, true);
  } else {
    BudgetUI.showToast(quickProblem(result), true);
  }
  renderQuickUndo();
}

// Redo: add the entry Undo took back again
async function redoQuickEntry() {
  const next = quickRedo.at(-1);
  if (!next) return;
  setQuickUndoBusy(true);
  const result = await quickApi("/api/quick/entry", { key: quickKey, entry: next, today: quickToday() });
  setQuickUndoBusy(false);
  if (result.status === 401) return keyStopped();
  if (result.ok) {
    quickRedo.pop();
    if (Number.isInteger(result.data.id)) quickUndo.push({ id: result.data.id, entry: next });
    BudgetUI.showToast(`Added ${describeQueued(next)} again.`);
    showQuickAnswer(result.data);
  } else {
    BudgetUI.showToast(quickProblem(result), true);
  }
  renderQuickUndo();
}

// Undo and Redo off while one is on its way
function setQuickUndoBusy(busy) {
  document.getElementById("quickUndoButton").disabled = busy || !quickUndo.length;
  document.getElementById("quickRedoButton").disabled = busy || !quickRedo.length;
}

// "Coffee, -$4.50 on 10/05/2026" (the day in this device's date format), "(a placeholder)" for one, and a % entry's percent
function describeQueued(entry) {
  const percent = typeof entry.percent === "number" ? ` (${showPercent(entry.percent)})` : "";
  return `${capitalize(entry.title)}, ${formatMoney(entry.amount)}${percent} on ${showDate(createSafeMidnight(entry.date, true))}${entry.placeholder ? " (a placeholder)" : ""}`;
}

//#endregion

// =====================================================================
// #region WAITING ENTRIES (the ones this icon added, still waiting)
// =====================================================================
// Waiting (beside Undo and Redo) lists the entries added with this icon that haven't joined the budget yet, newest
// first: Change puts one in the form (Change Entry) to fix it, and × deletes it. Other icons' entries are only
// counted. Once a budget has loaded one, it's being added there (or waits on its Home, where whoever has it open adds
// it or deletes it), so it can't be changed here anymore, and it just says so.

let showingWaiting = false; // The list is open
let stashedEntry = null;    // What New Entry had when Change was tapped ({ title, amount, sprite, account }), to put back

document.getElementById("waitingButton").addEventListener("click", () => {
  showingWaiting = !showingWaiting;
  renderWaiting();
});

// The API's answer: { waiting (every icon's), queued (this icon's: [{ id, title, type, amount, date, joining }]) }
function showWaiting(data) {
  if (!data || !Array.isArray(data.queued)) return;
  quickQueued = data.queued.filter(item => item && Number.isInteger(item.id) && typeof item.title === "string" &&
    typeof item.amount === "number" && typeof item.date === "string");
  const others = (Number.isInteger(data.waiting) ? data.waiting : 0) - quickQueued.length;
  const note = document.getElementById("waitingNote");
  note.hidden = others <= 0;
  note.textContent = `${others} more ${others === 1 ? "entry is" : "entries are"} waiting from your other Quick Entry icons.`;
  // One being changed that isn't waiting here anymore (the budget has it now) can't be saved
  if (quickForm && quickForm.mode === "change" && !quickQueued.some(item => item.id === quickForm.changing.id && !item.joining)) {
    BudgetUI.showToast("That entry is in your budget now (or waiting on its Home to be added), so it can only be changed there.", true);
    backToNewEntry();
  }
  renderWaiting();
}

// Waiting (with how many) and its list
function renderWaiting() {
  const button = document.getElementById("waitingButton");
  if (quickQueued.length === 0) showingWaiting = false;
  button.hidden = quickQueued.length === 0;
  button.textContent = `Waiting (${quickQueued.length})`;
  button.setAttribute("aria-expanded", String(showingWaiting));
  button.classList.toggle("primary", showingWaiting);
  document.getElementById("waitingSection").hidden = !showingWaiting;
  document.getElementById("waitingList").replaceChildren(...[...quickQueued].reverse().map(waitingRow));
  renderQuickUndo();
}

// One waiting entry: its type and title over its amount and day, with Change and × (or, once the budget has it, a note).
// A placeholder's words are yellow.
function waitingRow(item) {
  const row = BudgetUI.element("li", `waitingItem${item.placeholder ? " isPlaceholder" : ""}`);
  const sprite = QUICK_ENTRY_TYPES[item.type] || "";
  const day = createSafeMidnight(item.date, true);
  const shown = formatMoney(item.amount) + (typeof item.percent === "number" ? ` (${showPercent(item.percent)})` : "");
  const amount = BudgetUI.element("span", `waitingAmount${item.amount < 0 ? " negative" : item.amount > 0 ? " positive" : ""}`, shown);
  const details = BudgetUI.element("span", "waitingDetails");
  details.append(amount, ` on ${isNaN(day.getTime()) ? item.date : showDate(day)}`);
  const text = BudgetUI.noTranslate(BudgetUI.element("span", "waitingText"));
  text.append(BudgetUI.element("span", `waitingTitle${String(item.note ?? "").trim() ? " hasNote" : ""}`, `${sprite ? sprite + " " : ""}${capitalize(item.title)}`), details);
  row.append(text);
  if (item.joining) {
    row.classList.add("isJoining");
    row.append(BudgetUI.element("span", "waitingJoining", "Picked up by your budget"));
    return row;
  }
  const change = BudgetUI.element("button", "budgetButton waitingChange", "Change");
  change.type = "button";
  change.setAttribute("aria-label", `Change ${describeQueued(item)}`);
  change.addEventListener("click", () => changeWaiting(item));
  const remove = BudgetUI.element("button", "panelClose waitingDelete", "×");
  remove.type = "button";
  remove.setAttribute("aria-label", `Delete ${describeQueued(item)}`);
  remove.addEventListener("click", () => deleteWaiting(item, row));
  row.append(change, remove);
  return row;
}

// Change: the waiting entry goes into the form (Change Entry), which comes into view
function changeWaiting(item) {
  if (quickForm && quickForm.mode === "entry") stashedEntry = quickForm.fields.values();
  const { title, account } = splitAccount(item.title);
  openQuickEntryForm("change", { title, amount: item.amount, percent: item.percent ?? null, sprite: QUICK_ENTRY_TYPES[item.type] || "", account, placeholder: !!item.placeholder, purpose: item.purpose, note: typeof item.note === "string" ? item.note : "" }, item);
  // An account renamed or deleted since isn't in the list, so it says to pick one
  if (account && !quickAccounts.some(known => cleanString(known.name) === cleanString(account))) {
    BudgetUI.showToast(`${account} isn't one of your Other Accounts anymore. Pick one under Other Account, or leave it as None.`, true);
  }
  highlightForm();
}

// Save Changes: the waiting entry as the form has it now, then back to New Entry
async function saveWaitingChange(panel, fields, changing) {
  const { entry, error } = fields.read();
  if (error) return panel.setError(error);
  panel.setError("");
  panel.setBusy(true);
  const queued = toQueued(entry);
  const result = await quickApi("/api/quick/change", { key: quickKey, id: changing.id, entry: queued, today: quickToday() });
  panel.setBusy(false);
  if (result.status === 401) return keyStopped();
  if (!result.ok && !(result.data && result.data.joined)) return panel.setError(quickProblem(result));
  if (!result.ok) {
    // A budget loaded it meanwhile, so it's on Home now (showWaiting goes back to New Entry, and says so)
    forgetUndo(changing.id);
    showWaiting(result.data);
    leaveChangeOf(changing.id);
    renderQuickUndo();
    return;
  }
  const step = quickUndo.find(undo => undo.id === changing.id);
  if (step) step.entry = queued; // Undo takes back the entry as it is now
  BudgetUI.showToast(`Changed it to ${describeQueued(queued)}.`);
  showQuickAnswer(result.data);
  leaveChangeOf(changing.id);
  renderQuickUndo();
}

// ×: delete a waiting entry (after asking), so it never joins the budget
async function deleteWaiting(item, row) {
  if (!window.confirm(`Delete ${describeQueued(item)}? It won't be added to your budget.`)) return;
  row.querySelectorAll("button").forEach(button => { button.disabled = true; });
  const result = await quickApi("/api/quick/unqueue", { key: quickKey, id: item.id, today: quickToday() });
  if (result.status === 401) return keyStopped();
  if (result.ok) {
    forgetUndo(item.id);
    BudgetUI.showToast(`Deleted ${describeQueued(item)}.`);
    showQuickAnswer(result.data);
    leaveChangeOf(item.id);
  } else if (result.data && result.data.joined) {
    forgetUndo(item.id);
    showWaiting(result.data);
    BudgetUI.showToast("That entry is in your budget now (or waiting on its Home to be added), so it can only be deleted there.", true);
  } else {
    row.querySelectorAll("button").forEach(button => { button.disabled = false; });
    BudgetUI.showToast(quickProblem(result), true);
  }
  renderQuickUndo();
}

// Back to New Entry from Change Entry, with what New Entry had before
function backToNewEntry() {
  const fill = stashedEntry;
  stashedEntry = null;
  openQuickEntryForm("entry", fill);
}

// The form was changing this entry, which is gone now: back to New Entry
function leaveChangeOf(id) {
  if (quickForm && quickForm.mode === "change" && quickForm.changing.id === id) backToNewEntry();
}

// An entry that isn't waiting anymore can't be undone here
function forgetUndo(id) {
  const at = quickUndo.findIndex(step => step.id === id);
  if (at >= 0) quickUndo.splice(at, 1);
}

//#endregion

// =====================================================================
// #region HELPERS
// =====================================================================

function showQuickStatus(text) {
  const status = document.getElementById("dataStatus");
  status.textContent = text;
  status.hidden = !text;
}

// What the API answers after the icon is checked, or an entry is added, changed, or taken back: how many entries are
// waiting (and the ones this icon added), and the balances with them counted
function showQuickAnswer(data) {
  showQuickStatus(accountLine(data.waiting));
  showQuickAccounts(data.accounts);
  showQuickBalances(data.inBank);
  showWaiting(data);
}

// Why a request didn't work: what the API said, or that it couldn't be reached
function quickProblem(result) {
  return (result.data && result.data.error) ||
    (result.status === 0 ? "Couldn't reach Prismal Budget. Check your connection and try again." : "That didn't work. Please try again.");
}

// The account picker's accounts as the API sent them, each with its balance (null when it isn't known). The API
// counts a waiting entry for an account from its day on, so they come back after every entry added or taken back,
// and the open form's list follows.
function showQuickAccounts(accounts) {
  if (!Array.isArray(accounts)) return;
  quickAccounts = accounts
    .filter(account => account && typeof account.name === "string" && account.name.trim())
    .map(account => ({ name: account.name, balance: typeof account.balance === "number" ? account.balance : null }));
  if (quickForm) quickForm.fields.setAccounts(quickAccounts);
}

// In Bank today and the lowest it gets from today on (with its day), as the API sent them ({ today, lowest, lowestDate },
// each null when it isn't known; none at all before the budget has been opened since this came out). Red below $0.
function showQuickBalances(inBank) {
  const card = document.getElementById("quickBalances");
  if (!card || inBank === undefined) return;
  const known = !!inBank && (typeof inBank.today === "number" || typeof inBank.lowest === "number");
  card.hidden = !known;
  if (!known) return;
  const show = (id, amount) => {
    const el = document.getElementById(id);
    el.textContent = typeof amount === "number" ? formatMoney(amount) : "--";
    el.classList.toggle("negative", typeof amount === "number" && amount < 0);
  };
  show("quickInBank", inBank.today);
  show("quickLowest", inBank.lowest);
  const lowestDay = inBank.lowestDate ? createSafeMidnight(inBank.lowestDate, true) : null;
  document.getElementById("quickLowestLabel").textContent = lowestDay && !isNaN(lowestDay.getTime()) ? `Lowest, on ${showDay(lowestDay)}` : "Lowest";
}

// This phone's date, "YYYY-MM-DD" (the API counts waiting entries in the balances up to it)
function quickToday() {
  return formatToYMD(createSafeMidnight(new Date()));
}

// "Adding to sam's budget. 2 entries are waiting to show up there the next time you open it."
function accountLine(waiting) {
  if (!quickUsername) return "";
  const line = `Adding to ${quickUsername}'s budget.`;
  if (!waiting) return line;
  return `${line} ${waiting} ${waiting === 1 ? "entry is" : "entries are"} waiting to show up there the next time you open it.`;
}

// A request to the API without a login (the key goes in the body). Resolves to { ok, status, data };
// status 0 = the server couldn't be reached.
async function quickApi(endpoint, payload) {
  try {
    const res = await fetch(`${window.API_BASE_URL}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    let data = null;
    try { data = await res.json(); } catch (e) {}
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 0, data: null };
  }
}

//#endregion
