// Quick Entry: the page a home screen icon opens (quick.html?key=...). It's the calendar's New Entry
// form with no login. The key in the link comes from Home's Quick Entry button (made
// while signed in) and can only queue entries, which join the budget the next time it opens (see
// applyQuickEntries in Process Budget.js). Besides that, it only gets the Other Accounts' names and
// balances, for the account picker, and the account's prisms (preset entries, see PRISMS), which it can
// change. Keys stop working when the password changes. Nothing on the site links here. Opened without a key,
// or with one that stopped working, it goes to the sign-in page.
// Process Budget.js is only loaded for its helpers: it skips loading a budget here.

// =====================================================================
// #region SETUP
// =====================================================================

const quickParams = new URLSearchParams(location.search);
const quickKey = quickParams.get("key") || "";
// The API stores refraction types by name: "✖️" -> "hidden"
const QUICK_TYPE_NAMES = Object.fromEntries(Object.entries(QUICK_ENTRY_TYPES).map(([name, sprite]) => [sprite, name]));
let quickUsername = null;
let quickAccounts = []; // The budget's Other Accounts for the account picker: [{ name, balance }] (from /api/quick/check)
let quickPrisms = [];   // The account's prisms, in order: [{ title, amount, type }] (see PRISMS)
let quickForm = null;   // The form on the page: { panel, fields, mode: "entry" (New Entry) | "prism" (New Prism) }
// Undo and Redo for entries added on this page: [{ id, entry }] (id: the API's, while it waits; see the end)
const quickUndo = [];
const quickRedo = [];

// Just set up from the calendar page: show how to add it to the home screen, and drop setup=1 from the
// link so the saved icon opens straight to the form
if (quickKey && quickParams.has("setup")) {
  document.getElementById("setupCard").hidden = false;
  history.replaceState(null, "", `${location.pathname}?key=${encodeURIComponent(quickKey)}`);
}

checkQuickKey();

//#endregion

// =====================================================================
// #region KEY + FORM
// =====================================================================

async function checkQuickKey() {
  // Without a key there's nothing this page can do: sign in instead (Home's Quick Entry button makes one)
  if (!quickKey) {
    window.location.replace("/login.html");
    return;
  }
  const result = await quickApi("/api/quick/check", { key: quickKey });
  if (result.status === 401) return keyStopped();
  // Offline, or the server is down: the form still shows, and adding an entry says what went wrong
  if (result.ok && result.data) {
    quickUsername = result.data.username;
    // The account picker's accounts: each one's name and balance (null when it isn't known)
    if (Array.isArray(result.data.accounts)) {
      quickAccounts = result.data.accounts
        .filter(account => account && typeof account.name === "string" && account.name.trim())
        .map(account => ({ name: account.name, balance: typeof account.balance === "number" ? account.balance : null }));
    }
    // Prisms need the server, so they show once the key is known to work
    quickPrisms = Array.isArray(result.data.prisms) ? result.data.prisms : [];
    document.getElementById("prismSection").hidden = false;
    renderPrisms();
  }
  showQuickStatus(result.ok && result.data ? accountLine(result.data.waiting) : "");
  openQuickEntryForm();
}

// The form: New Entry, or (mode "prism", from Add Prism) New Prism, which glows and keeps only what's filled
// in or picked (no date). fill: { title, amount, sprite } to start with (what was already in the form).
function openQuickEntryForm(mode = "entry", fill = null) {
  const makingPrism = mode === "prism";
  BudgetUI.openPanel({
    size: "large",
    title: makingPrism ? "New Prism" : "New Entry",
    closable: false,
    inline: true, // The form is the page here, not something on top of it
    build(form, panel) {
      const fields = BudgetUI.newEntryFields({ date: createSafeMidnight(new Date()), accounts: quickAccounts });
      if (makingPrism) {
        form.append(BudgetUI.element("p", "panelHint prismDraftHint", "Fill in or pick only what this prism should keep: a title, an amount, a type, or an account. Then tap Save Prism."));
        fields.dateEl.hidden = true;
        panel.panel.classList.add("prismDraft");
      }
      form.append(...fields.els, BudgetUI.buttonRow(makingPrism
        ? [{ label: "Save Prism", kind: "primary", type: "submit" }, { label: "Cancel", onClick: () => openQuickEntryForm("entry", fields.values()) }]
        : [{ label: "Add Entry", kind: "primary", type: "submit" }]));
      if (fill) fields.fill(fill);
      quickForm = { panel, fields, mode };

      form.addEventListener("submit", (event) => {
        event.preventDefault();
        if (makingPrism) savePrismFromForm(panel, fields);
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
  const queued = { title: entry.title, type: QUICK_TYPE_NAMES[entry.sprite] || "auto", amount: entry.amount, date: formatToYMD(entry.date) };
  const result = await quickApi("/api/quick/entry", { key: quickKey, entry: queued });
  panel.setBusy(false);
  if (result.status === 401) return keyStopped();
  if (!result.ok) {
    return panel.setError((result.data && result.data.error) ||
      (result.status === 0 ? "Couldn't reach Prismal Budget. Check your connection and try again." : "That didn't work. Please try again."));
  }
  BudgetUI.showToast(`Added ${describeQueued(queued)}.`);
  showQuickStatus(accountLine(result.data.waiting));
  if (Number.isInteger(result.data.id)) {
    quickUndo.push({ id: result.data.id, entry: queued });
    quickRedo.length = 0;
  }
  renderQuickUndo();
  openQuickEntryForm(); // A fresh form for the next one
}

// The password changed or the icon was replaced, so this icon can't add entries anymore: on to the sign-in
// page, which says why (Login.js SIGNED_OUT_REASONS). Signed in already, that goes straight on to Home.
function keyStopped() {
  try {
    if (!localStorage.getItem("prismal_jwt")) sessionStorage.setItem("prismal_signed_out", "quickKey");
  } catch (e) {}
  window.location.replace("/login.html");
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
  // What's already in New Entry counts toward the prism
  const current = quickForm && quickForm.mode === "entry" ? quickForm.fields.values() : null;
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

// A prism's button: tapping it fills in New Entry
function prismButton(prism) {
  const item = BudgetUI.element("li", "prismItem");
  const button = BudgetUI.noTranslate(BudgetUI.element("button", "budgetButton prismButton", prismLabel(prism)));
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
  item.append(handle, BudgetUI.noTranslate(BudgetUI.element("span", "prismLabel", label)), remove);
  return item;
}

// "❗️ Coffee -$4.50", "Rent", "✖️ Savings", or just "⭕️ Transfer". inWords: "Coffee -$4.50 (Regular)" instead,
// for a dialog, which can't show the type's image (only the device's own emoji)
function prismLabel(prism, inWords = false) {
  const sprite = prism.type ? QUICK_ENTRY_TYPES[prism.type] : "";
  const type = sprite ? REFRACTION_NAMES.get(sprite) : "";
  const parts = [inWords ? "" : sprite, prism.title, prism.amount === null ? "" : formatMoney(prism.amount)].filter(Boolean);
  if (!prism.title && prism.amount === null) parts.push(type);
  else if (inWords && type) parts.push(`(${type})`);
  return parts.join(" ");
}

// Tapping a prism: what it keeps goes into New Entry, which comes into view with the first thing still to
// fill in ready to type
function applyPrism(prism) {
  if (!quickForm || quickForm.mode !== "entry") openQuickEntryForm("entry");
  const { fields } = quickForm;
  fields.fill({ title: prism.title, amount: prism.amount, sprite: prism.type ? QUICK_ENTRY_TYPES[prism.type] : "" });
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

// Save Prism: whatever's filled in or picked (Auto counts as nothing picked), and at least one thing
async function savePrismFromForm(panel, fields) {
  const { title, amount, sprite } = fields.values();
  if (Number.isNaN(amount)) return panel.setError("Enter an amount, like 12.50, or leave it blank.");
  if (amount !== null && Math.abs(amount) > MAX_AMOUNT) return panel.setError(AMOUNT_TOO_BIG);
  const prism = { title, amount, type: sprite ? QUICK_TYPE_NAMES[sprite] : null };
  if (!prism.title && prism.amount === null && !prism.type) {
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

// Undo and Redo show while there's something to take back or add again, and say what
function renderQuickUndo() {
  const undoButton = document.getElementById("quickUndoButton");
  const redoButton = document.getElementById("quickRedoButton");
  const last = quickUndo.at(-1);
  const next = quickRedo.at(-1);
  document.getElementById("quickUndo").hidden = !last && !next;
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
  const result = await quickApi("/api/quick/unqueue", { key: quickKey, id: last.id });
  setQuickUndoBusy(false);
  if (result.status === 401) return keyStopped();
  if (result.ok) {
    quickUndo.pop();
    quickRedo.push(last.entry);
    BudgetUI.showToast(`Took back ${describeQueued(last.entry)}.`);
    showQuickStatus(accountLine(result.data.waiting));
  } else if (result.data && result.data.joined) {
    quickUndo.pop(); // It's in the budget now: undo it there
    BudgetUI.showToast(result.data.error, true);
  } else {
    BudgetUI.showToast((result.data && result.data.error) || "Couldn't reach Prismal Budget. Check your connection and try again.", true);
  }
  renderQuickUndo();
}

// Redo: add the entry Undo took back again
async function redoQuickEntry() {
  const next = quickRedo.at(-1);
  if (!next) return;
  setQuickUndoBusy(true);
  const result = await quickApi("/api/quick/entry", { key: quickKey, entry: next });
  setQuickUndoBusy(false);
  if (result.status === 401) return keyStopped();
  if (result.ok) {
    quickRedo.pop();
    if (Number.isInteger(result.data.id)) quickUndo.push({ id: result.data.id, entry: next });
    BudgetUI.showToast(`Added ${describeQueued(next)} again.`);
    showQuickStatus(accountLine(result.data.waiting));
  } else {
    BudgetUI.showToast((result.data && result.data.error) || "Couldn't reach Prismal Budget. Check your connection and try again.", true);
  }
  renderQuickUndo();
}

// Undo and Redo off while one is on its way
function setQuickUndoBusy(busy) {
  document.getElementById("quickUndoButton").disabled = busy || !quickUndo.length;
  document.getElementById("quickRedoButton").disabled = busy || !quickRedo.length;
}

// "Coffee, -$4.50 on 10/05/2026" (the day in this device's date format)
function describeQueued(entry) {
  return `${capitalize(entry.title)}, ${formatMoney(entry.amount)} on ${showDate(createSafeMidnight(entry.date, true))}`;
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
