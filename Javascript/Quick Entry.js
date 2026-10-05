// Quick Entry: the page a home screen icon opens (quick.html?key=...). It's the calendar's New Entry
// form with no login. The key in the link comes from the calendar page's Quick Entry Icon button (made
// while signed in) and can only queue entries, which join the budget the next time it opens (see
// applyQuickEntries in Process Budget.js). Besides that, it only gets the Other Accounts' names, for the
// account picker. Keys stop working when the password changes. Nothing on the site links here.
// Process Budget.js is only loaded for its helpers: it skips loading a budget here.

// =====================================================================
// #region SETUP
// =====================================================================

const quickParams = new URLSearchParams(location.search);
const quickKey = quickParams.get("key") || "";
// The API stores refraction types by name: "✖️" -> "hidden"
const QUICK_TYPE_NAMES = Object.fromEntries(Object.entries(QUICK_ENTRY_TYPES).map(([name, sprite]) => [sprite, name]));
let quickUsername = null;
let quickAccounts = []; // The budget's Other Accounts names, for the account picker (from /api/quick/check)

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
  if (!quickKey) {
    showQuickStatus("This page needs a Quick Entry link. In Prismal Budget, tap Quick Entry Icon on the calendar page to make one.");
    return;
  }
  const result = await quickApi("/api/quick/check", { key: quickKey });
  if (result.status === 401) return showKeyStopped();
  // Offline, or the server is down: the form still shows, and adding an entry says what went wrong
  if (result.ok && result.data) {
    quickUsername = result.data.username;
    if (Array.isArray(result.data.accounts)) quickAccounts = result.data.accounts.filter(name => typeof name === "string" && name.trim());
  }
  showQuickStatus(result.ok && result.data ? accountLine(result.data.waiting) : "");
  openQuickEntryForm();
}

function openQuickEntryForm() {
  BudgetUI.openPanel({
    size: "large",
    title: "New Entry",
    closable: false,
    build(form, panel) {
      const fields = BudgetUI.newEntryFields({ date: createSafeMidnight(new Date()), accounts: quickAccounts });
      form.append(...fields.els, BudgetUI.buttonRow([{ label: "Add Entry", kind: "primary", type: "submit" }]));

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const { entry, error } = fields.read();
        if (error) return panel.setError(error);

        panel.setError("");
        panel.setBusy(true);
        const result = await quickApi("/api/quick/entry", {
          key: quickKey,
          entry: { title: entry.title, type: QUICK_TYPE_NAMES[entry.sprite] || "auto", amount: entry.amount, date: formatToYMD(entry.date) }
        });
        panel.setBusy(false);
        if (result.status === 401) return showKeyStopped();
        if (!result.ok) {
          return panel.setError((result.data && result.data.error) ||
            (result.status === 0 ? "Couldn't reach Prismal Budget. Check your connection and try again." : "That didn't work. Please try again."));
        }
        BudgetUI.showToast(`Added ${capitalize(entry.title)}, ${formatMoney(entry.amount)} on ${formatToMMDDYYYY(entry.date)}.`);
        showQuickStatus(accountLine(result.data.waiting));
        openQuickEntryForm(); // A fresh form for the next one
      });
    }
  });
}

// The password changed or the icon was replaced, so this icon can't add entries anymore
function showKeyStopped() {
  BudgetUI.closePanel(true);
  document.getElementById("setupCard").hidden = true;
  showQuickStatus("This Quick Entry icon doesn't work anymore, because your password changed or the icon was replaced. Delete it, then in Prismal Budget tap Quick Entry Icon on the calendar page to make a new one.");
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
