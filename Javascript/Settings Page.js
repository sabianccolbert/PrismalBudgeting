// Settings Page: connected spreadsheets first (their entries land on the calendar: add one, change it, turn
// it on or off, delete it, and see what's wrong with any of its cells; see CONNECTED SPREADSHEETS in Process
// Budget.js, and Spreadsheets.js for the reading). Connecting one needs a verified email. Then the daily
// "🗓️ Check Budget" reminder (the spreadsheet's Google Calendar notification). Pick the reminder time, then
// turn on push notifications (per device) and/or a calendar link for Google or Apple Calendar. Both are
// optional. Which days get a reminder comes from the budget (buildReminderPlan in Process Budget.js); the API
// sends and serves them.
// Then the account: the email (change it, which needs the password, and verify it), the age (18 or older:
// fix one typed wrong), and the password (change it, or email a reset link); passkeys (Face ID, Touch ID,
// Windows Hello: add or remove them, and turn passkey sign-in on or off; see Passkeys.js); signed-in devices
// (turn off Quick Entry icons, Sign Out Everywhere); your data and privacy (Download My Data, analytics on or
// off for this device); and deleting the account (needs the password). Emails go out through Resend (see
// account.js in the API).

// =====================================================================
// #region SETUP
// =====================================================================

let reminderSettings = null; // From the API: { time, timezone, calendarUrl, push: { available, publicKey, devices } }
let pushSubscription = null; // This device's push subscription, while push is on here
let timeSaveTimer = null;
let account = null;          // From the API: { username, email, emailVerified, age, canEmail (emails are set up), quickIcons }
let passkeyInfo = null;      // From the API: { on, userHandle, passkeys: [{ id, name, site, synced, createdAt, lastUsedAt }] }
let passkeyLoadStatus = 0;   // The list's HTTP status, when it didn't load (404: the API doesn't have passkeys yet)
let passkeyAdd = null;       // { options, at }: a password-checked challenge, kept so trying again starts right away

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const PUSH_BLOCKED_TEXT = "Notifications are blocked for this site. Allow them in your browser's site settings, then come back here to turn them on.";

wireDateFormat(); // This device's choice, so it works before (and without) the server

window.workspaceReady.then(async (loaded) => {
  if (loaded) {
    wireSheets();
    renderSheets();
  }
  // Account settings don't need the budget, so they show even when it didn't load
  const [reminders, accountResult, passkeyResult] = await Promise.all([
    loaded ? budgetApi("/api/notify/settings") : null,
    budgetApi("/api/account"),
    budgetApi("/api/passkey/list")
  ]);
  const accountLoaded = accountResult.ok && !!accountResult.data;
  if (accountLoaded) {
    account = accountResult.data;
    if (passkeyResult.ok && passkeyResult.data) passkeyInfo = passkeyResult.data;
    else passkeyLoadStatus = passkeyResult.status;
    wireAccount();
    renderAccount();
    renderPasskeys();
    if (loaded) renderSheets(); // Now that it's known whether the email is verified
    document.getElementById("accountView").hidden = false;
  }

  const remindersLoaded = !!reminders && reminders.ok && !!reminders.data;
  const missing = [];
  if (!loaded) missing.push("your budget data");
  else if (!remindersLoaded) missing.push("your reminder settings");
  if (!accountLoaded) missing.push("your account settings");
  const status = document.getElementById("dataStatus");
  if (missing.length > 0) status.textContent = `Couldn't load ${missing.join(" or ")}. Please refresh to try again.`;
  else status.hidden = true;
  if (!remindersLoaded) return;

  reminderSettings = reminders.data;
  document.getElementById("settingsView").hidden = false;

  wireReminderTime();
  renderReminderTime();
  renderCalendarLink();
  renderPush();
  await refreshPushState();
});

//#endregion

// =====================================================================
// #region CONNECTED SPREADSHEETS
// =====================================================================
// Each spreadsheet is a button (it opens the spreadsheet's panel to change it), an On/Off switch, and Delete,
// with a box under it when something needs a look. Add Spreadsheet opens a panel that asks for the link, then
// grows into the entry form once the spreadsheet opens: each part of an entry has a yellow ➕ that opens a
// second panel to pick its tab and cells, and all but the date can be typed in instead.

const SHEET_FIELD_KEYS = ["date", "title", "amount", "type", "account"];
const SHEET_SIGNS = [{ key: "written", label: "As Written" }, { key: "costs", label: "All Costs" }, { key: "gains", label: "All Gains" }];
const MAX_SHEET_CONNECTIONS = 10;
const SHEET_PREVIEW_LINES = 8;
const SHARING_EMAIL = "prismalbudget@gmail.com";

// Add Spreadsheet, the verification note's button, and redrawing after every change
function wireSheets() {
  document.getElementById("addSheetButton").addEventListener("click", (event) => openSheetPanel(null, event.currentTarget));
  document.getElementById("sheetsVerifyButton").addEventListener("click", sendVerification);
  document.addEventListener("budget:updated", renderSheets);
}

// The connected spreadsheets, and whether one can be added (a verified email, and fewer than 10)
function renderSheets() {
  const view = document.getElementById("sheetsView");
  if (!view || !sheetsData) return;
  view.hidden = false;
  const list = document.getElementById("sheetList");
  list.replaceChildren();
  if (sheetsData.list.length === 0) list.append(BudgetUI.element("li", "sheetEmpty panelHint", "No spreadsheets connected yet."));
  for (const connection of sheetsData.list) list.append(sheetItem(connection));
  // Connecting one needs a verified email (until the account loads, the server says so if it isn't)
  const unverified = !!account && !account.emailVerified;
  const note = document.getElementById("sheetsVerify");
  note.hidden = !unverified;
  if (unverified) {
    document.getElementById("sheetsVerifyText").textContent = !account.email
      ? "Connecting a spreadsheet needs a verified email. Add your email under Email below, then open the link we send it."
      : `Connecting a spreadsheet needs a verified email. Open the link we emailed to ${account.email} (check your spam folder too), or send a new one.`;
    document.getElementById("sheetsVerifyButton").hidden = !account.email || !account.canEmail;
  }
  document.getElementById("addSheetButton").disabled = unverified || sheetsData.list.length >= MAX_SHEET_CONNECTIONS;
}

// One spreadsheet: its button, On/Off, Delete, and its problems
function sheetItem(connection) {
  const item = BudgetUI.element("li", `sheetItem${connection.on ? "" : " isOff"}`);
  const row = BudgetUI.element("div", "sheetRow");

  const open = settingsButton("", "sheetButton", (event) => openSheetPanel(connection.id, event.currentTarget));
  const { landing: upcoming, keptOff } = sheetLanding(connection.entries);
  open.append(
    BudgetUI.noTranslate(BudgetUI.element("span", "sheetName", `➕ ${connection.name}`)),
    BudgetUI.element("span", "sheetCount", connection.on ? `${upcoming} ${upcoming === 1 ? "entry" : "entries"} from today on` : "Off")
  );
  open.setAttribute("aria-label", `Change ${connection.name}`);

  const toggle = BudgetUI.element("input", "pillSwitch sheetSwitch");
  toggle.type = "checkbox";
  toggle.setAttribute("role", "switch");
  toggle.checked = connection.on;
  toggle.setAttribute("aria-label", `${connection.name}: on or off`);
  toggle.title = connection.on ? "On: its entries are on your calendar" : "Off: its entries aren't on your calendar";
  toggle.addEventListener("change", async () => {
    toggle.disabled = true;
    const on = toggle.checked;
    const result = await turnSheetConnection(connection.id, on);
    if (!result.ok) {
      toggle.disabled = false;
      toggle.checked = !on;
      return BudgetUI.showToast(result.message || "That didn't work. Please try again.", true);
    }
    BudgetUI.warnIfUnsaved(result);
    BudgetUI.showToast(on ? `${connection.name} is on. Reading it now...` : `${connection.name} is off. Its entries are off your calendar until you turn it back on.`);
    if (on) Spreadsheets.refresh({ force: true });
  });

  const remove = settingsButton("Delete", "danger sheetDelete", async (event) => {
    if (!window.confirm(`Delete ${connection.name}? Its entries come off your calendar from today on. Days that already passed keep theirs, and days you changed become plain entries. The spreadsheet itself isn't touched.`)) return;
    event.currentTarget.disabled = true;
    const result = await deleteSheetConnection(connection.id);
    if (!result.ok) {
      event.currentTarget.disabled = false;
      return BudgetUI.showToast(result.message || "That didn't work. Please try again.", true);
    }
    BudgetUI.warnIfUnsaved(result);
    BudgetUI.showToast(`${connection.name} was deleted.`);
  });
  remove.setAttribute("aria-label", `Delete ${connection.name}`);

  row.append(open, toggle, remove);
  item.append(row);

  // What needs a look: cells that couldn't be read, and entries a recurring entry keeps off
  const problems = [...connection.problems];
  if (connection.on && keptOff.length > 0) problems.push(keptOffProblem(keptOff));
  if (problems.length > 0) item.append(problemBox(problems));
  return item;
}

// "Netflix on 10/18 is left out: ..." (up to three named)
function keptOffProblem(keptOff) {
  const named = keptOff.slice(0, 3).join(", ") + (keptOff.length > 3 ? `, and ${keptOff.length - 3} more` : "");
  return `${named} ${keptOff.length === 1 ? "is" : "are"} left out: a recurring entry with the same title and refraction type lands that day. Give one of them another title.`;
}

// A "Needs a look" box listing what's wrong
function problemBox(problems) {
  const box = BudgetUI.element("div", "sheetProblems");
  box.setAttribute("role", "status");
  box.append(BudgetUI.element("strong", "", "Needs a look"));
  const list = BudgetUI.element("ul");
  for (const problem of problems) list.append(BudgetUI.noTranslate(BudgetUI.element("li", "", problem)));
  box.append(list);
  return box;
}

// Add a spreadsheet (id null), or change one. The panel asks for the link first, then grows into the entry
// form once the spreadsheet opens (one that's being changed opens right away).
function openSheetPanel(id, origin) {
  const existing = id ? sheetConnectionById(id) : null;
  if (id && !existing) return;
  BudgetUI.openPanel({
    origin,
    size: "large",
    title: existing ? existing.name : "Add Spreadsheet",
    build(form, panel) {
      const draft = {
        workbook: null,
        access: existing ? existing.access : "public",
        openedLink: "",
        fields: JSON.parse(JSON.stringify(existing ? existing.fields : {}))
      };

      // ---- The link (its main button opens it, and once it's open, saves) ----
      const link = BudgetUI.textField({ label: "Spreadsheet link", value: existing ? existing.link : "", placeholder: "https://docs.google.com/spreadsheets/d/..." });
      link.input.classList.add("sheetLinkInput");
      link.input.autocomplete = "off";
      link.input.spellcheck = false;
      link.input.addEventListener("input", showPrimary);
      BudgetUI.addFieldHelp(link.el, "How to share a spreadsheet", sharingHelp());
      const openedNote = BudgetUI.element("p", "panelHint sheetOpened");
      openedNote.setAttribute("role", "status");
      const buttons = BudgetUI.buttonRow([
        { label: "Open Spreadsheet", kind: "primary", type: "submit" },
        { label: "Cancel", onClick: () => panel.close() }
      ]);
      const primary = buttons.querySelector("button[type=submit]");

      // ---- The entry form (shown once the spreadsheet opens) ----
      const section = BudgetUI.element("div", "sheetForm");
      section.hidden = !existing;
      const name = BudgetUI.textField({ label: "Name", value: existing ? existing.name : "", placeholder: "Bills, Paychecks..." });
      name.input.maxLength = 60;

      const rows = {};
      const accountNames = otherAccounts().map(account => account.name);

      // Title, typed: one for every entry
      const titleInput = BudgetUI.element("input", "textInput");
      titleInput.type = "text";
      titleInput.placeholder = "Rent, paycheck...";
      // Amount, typed, with Cost / Gain
      const amount = BudgetUI.amountField({ amount: typeof draft.fields.amount?.value === "number" ? draft.fields.amount.value : null });
      const amountControl = amount.el.querySelector(".amountRow");
      // How cell amounts read
      const sign = BudgetUI.segmented(SHEET_SIGNS, draft.fields.amount?.sign || "written", () => updatePreview());
      // Refraction type, picked: one for every entry
      const type = BudgetUI.segmented(BudgetUI.REFRACTION_TYPES, ["❗️", "✖️", "⭕️"].includes(draft.fields.type?.value) ? draft.fields.type.value : "❗️", () => {
        showAccountRow();
        updatePreview();
      });
      // Other Account, picked: one for every entry
      const account = BudgetUI.element("select", "selectInput accountSelect");
      account.append(new Option("None", ""), ...accountNames.map(accountName => new Option(accountName, accountName)));
      account.value = accountNames.includes(draft.fields.account?.value) ? draft.fields.account.value : "";

      if (!Spreadsheets.isLinked(draft.fields.title)) titleInput.value = String(draft.fields.title?.value || "");

      rows.date = sheetFieldRow("date", null, "Always from the spreadsheet: the day each entry lands. Empty cells are skipped.");
      rows.title = sheetFieldRow("title", titleInput, "Each entry's title, or type one for all of them.");
      rows.amount = sheetFieldRow("amount", amountControl, "Each entry's amount, or type one for all of them.", sign.el);
      rows.type = sheetFieldRow("type", type.el, "Regular, Hidden, or Transfer (an empty cell is Regular), or pick one for all of them.");
      rows.account = sheetFieldRow("account", account, "An Other Account's name (an empty cell is none), or pick one for all of them. For Hidden and Transfer entries.");
      BudgetUI.addFieldHelp(rows.type.el, "What the refraction types do", refractionTypesHelp());

      const preview = BudgetUI.element("div", "sheetPreview");
      preview.setAttribute("aria-live", "polite");

      section.append(name.el, ...SHEET_FIELD_KEYS.map(key => rows[key].el), preview);
      form.append(link.el, openedNote, section, buttons);

      [titleInput, amount.input].forEach(input => input.addEventListener("input", updatePreview));
      amountControl.addEventListener("click", () => setTimeout(updatePreview)); // Cost / Gain
      account.addEventListener("change", updatePreview);
      for (const key of SHEET_FIELD_KEYS) showFieldRow(key);
      showAccountRow();
      updatePreview();

      form.addEventListener("submit", (event) => {
        event.preventDefault();
        if (!draft.workbook || link.value() !== draft.openedLink) return openLink();
        save();
      });
      if (existing) openLink();

      // Open Spreadsheet until it's open (and again when the link changes), then Save
      function showPrimary() {
        const opened = !!draft.workbook && link.value() === draft.openedLink;
        primary.textContent = !opened ? "Open Spreadsheet" : (existing ? "Save" : "Save Spreadsheet");
      }

      // A part of an entry: its ➕, then what's typed (or the cells it comes from, once picked)
      function sheetFieldRow(key, typedControl, hint, linkedExtra = null) {
        const label = Spreadsheets.LABELS[key];
        const plus = BudgetUI.element("button", "sheetPick", "➕");
        plus.type = "button";
        plus.setAttribute("aria-label", `Pick the ${label} cells from the spreadsheet`);
        plus.title = `Pick the ${label} cells from the spreadsheet`;
        plus.addEventListener("click", () => openCellPicker(key, plus));
        const chip = BudgetUI.noTranslate(BudgetUI.element("button", "sheetCells"));
        chip.type = "button";
        chip.addEventListener("click", () => openCellPicker(key, plus));
        const typed = BudgetUI.element("div", "sheetTyped");
        if (typedControl) typed.append(typedControl);
        else typed.append(BudgetUI.element("span", "panelHint", "Tap ➕ to pick the cells with the dates."));
        const line = BudgetUI.element("div", "sheetLine");
        line.append(plus, typed, chip);
        const el = BudgetUI.field(label, line, { hint });
        if (linkedExtra) {
          linkedExtra.classList.add("sheetSign");
          linkedExtra.setAttribute("aria-label", "How the amounts in the cells read");
          el.insertBefore(linkedExtra, line.nextSibling);
        }
        return { el, plus, chip, typed, line, linkedExtra };
      }

      // Show a part as typed, or as its cells
      function showFieldRow(key) {
        const row = rows[key];
        const field = draft.fields[key];
        const linked = Spreadsheets.isLinked(field);
        row.plus.classList.toggle("isLinked", linked);
        row.typed.hidden = linked;
        row.chip.hidden = !linked;
        row.chip.textContent = linked ? `${field.tab} · ${field.range}` : "";
        row.chip.title = linked ? "Change the cells" : "";
        if (row.linkedExtra) row.linkedExtra.hidden = !linked;
      }

      // Other Account shows for Hidden and Transfer (or when either comes from cells)
      function showAccountRow() {
        const typeLinked = Spreadsheets.isLinked(draft.fields.type);
        const accountLinked = Spreadsheets.isLinked(draft.fields.account);
        rows.account.el.hidden = !(typeLinked || accountLinked || BudgetUI.isAccountType(type.value())) || (accountNames.length === 0 && !accountLinked);
      }

      // Every part as it's set now: cells, or what's typed
      function currentFields() {
        const fields = {};
        for (const key of SHEET_FIELD_KEYS) {
          const field = draft.fields[key];
          if (Spreadsheets.isLinked(field)) {
            fields[key] = { tab: field.tab, range: field.range, ...(key === "amount" ? { sign: sign.value() } : {}) };
          }
        }
        if (!fields.title) fields.title = { value: titleInput.value.replace(/\s+/g, " ").trim() };
        if (!fields.amount) {
          const value = amount.value();
          fields.amount = { value: value === null || Number.isNaN(value) ? null : value };
        }
        if (!fields.type) fields.type = { value: type.value() };
        if (!fields.account) fields.account = { value: rows.account.el.hidden ? "" : account.value };
        return fields;
      }

      // What reading it with these settings finds: entries from today on, and problems
      function updatePreview() {
        preview.replaceChildren();
        if (!draft.workbook) {
          if (existing) preview.append(BudgetUI.element("p", "panelHint", "Opening the spreadsheet..."));
          return;
        }
        if (!Spreadsheets.isLinked(draft.fields.date)) {
          preview.append(BudgetUI.element("p", "panelHint", "Tap ➕ next to Date to pick the cells with the dates. Then the entries it finds show here."));
          return;
        }
        const read = Spreadsheets.readConnection(currentFields(), draft.workbook);
        // From today on, without the ones a recurring entry keeps off
        const upcoming = read.entries.filter(entry => createSafeMidnight(entry[0], true) >= today &&
          recurringHits(entry[3], createSafeMidnight(entry[0], true), entry[1]) === false);
        const { keptOff } = sheetLanding(read.entries);
        const heading = BudgetUI.element("p", "sheetPreviewHeading", upcoming.length === 0
          ? "Entries: none from today on yet."
          : `Entries: ${upcoming.length} from today on${upcoming.length > SHEET_PREVIEW_LINES ? `, starting with` : ""}`);
        preview.append(heading);
        if (upcoming.length > 0) {
          const list = BudgetUI.noTranslate(BudgetUI.element("ul", "sheetPreviewList"));
          for (const [dateText, special, entryAmount, title] of upcoming.slice(0, SHEET_PREVIEW_LINES)) {
            const line = BudgetUI.element("li", entryAmount > 0 ? "positive" : "");
            line.append(BudgetUI.element("span", "sheetPreviewDate", showDay(createSafeMidnight(dateText, true))), ` ➕${special} ${formatMoney(entryAmount)} ${title}`);
            list.append(line);
          }
          preview.append(list);
        }
        const problems = [...read.problems, ...(keptOff.length > 0 ? [keptOffProblem(keptOff)] : [])];
        if (problems.length > 0) preview.append(problemBox(problems));
      }

      // Open Spreadsheet: download and read it, then show the entry form
      async function openLink() {
        const typed = link.value();
        panel.setError("");
        if (!typed) return panel.setError("Paste the spreadsheet's link.");
        openedNote.textContent = "Opening the spreadsheet...";
        panel.setBusy(true);
        let file;
        try {
          file = await Spreadsheets.readSheetFile(typed);
        } catch (err) {
          openedNote.textContent = "";
          panel.setBusy(false);
          panel.setError(err.message || "Couldn't open that spreadsheet. Please try again.");
          return;
        }
        panel.setBusy(false);
        draft.workbook = file.workbook;
        draft.access = file.access;
        draft.openedLink = typed;
        if (!name.value()) name.input.value = (file.name || "Spreadsheet").slice(0, 60);
        const tabCount = file.workbook.tabs.length;
        openedNote.textContent = `Opened${file.name ? ` "${file.name}"` : ""}: ${tabCount} ${tabCount === 1 ? "tab" : "tabs"}, ${file.access === "shared" ? `shared with ${SHARING_EMAIL}` : "shared by its link"}.`;
        showPrimary();
        if (section.hidden) {
          section.hidden = false;
          section.classList.add("isOpening"); // It grows in (budgetStyle.css)
          setTimeout(() => section.classList.remove("isOpening"), 600);
          rows.date.plus.focus({ preventScroll: true });
        }
        updatePreview();
      }

      // Save Spreadsheet: check the form, read the spreadsheet with it, and save the connection
      function save() {
        panel.setError("");
        const fields = currentFields();
        if (!name.value()) return panel.setError("Give the spreadsheet a name.");
        if (!Spreadsheets.isLinked(fields.date)) return panel.setError("Tap ➕ next to Date to pick the cells with the dates.");
        if (!Spreadsheets.isLinked(fields.title) && !fields.title.value && !fields.account.value) return panel.setError("Type a title, or tap ➕ next to Title to pick its cells.");
        if (!Spreadsheets.isLinked(fields.amount)) {
          const value = amount.value();
          if (value === null || Number.isNaN(value)) return panel.setError("Type an amount, like 25.00, or tap ➕ next to Amount to pick its cells.");
        }
        const read = Spreadsheets.readConnection(fields, draft.workbook);
        if (read.entries.length === 0 && read.problems.length > 0) return panel.setError("Fix what's under Needs a look first: nothing can be added from it yet.");
        BudgetUI.submit(panel, () => saveSheetConnection(
          { name: name.value(), link: draft.openedLink, fields },
          { entries: read.entries, problems: read.problems, tabs: read.tabs, access: draft.access },
          existing ? existing.id : null
        )).then(result => {
          const { landing } = sheetLanding(read.entries);
          if (result.ok) BudgetUI.showToast(existing ? `${name.value()} is saved.` : `${name.value()} is connected: ${landing} ${landing === 1 ? "entry" : "entries"} from today on.`);
        });
      }

      // The second panel: a tab (typed, or picked from the spreadsheet's), and its cells
      function openCellPicker(key, plusButton) {
        if (!draft.workbook) return panel.setError("Open the spreadsheet first.");
        const label = Spreadsheets.LABELS[key];
        const field = draft.fields[key];
        const current = Spreadsheets.isLinked(field) ? Spreadsheets.parseRange(field.range) : null;
        const lastTab = SHEET_FIELD_KEYS.map(other => draft.fields[other]).find(Spreadsheets.isLinked)?.tab;
        BudgetUI.openPanel({
          origin: plusButton,
          size: "large",
          stacked: true,
          title: `${label} Cells`,
          build(pickForm, picker) {
            const tab = BudgetUI.textField({ label: "Tab", value: Spreadsheets.isLinked(field) ? field.tab : (lastTab || draft.workbook.tabs.find(t => !t.hidden)?.name || ""), placeholder: "The tab's name" });
            const tabList = BudgetUI.element("div", "sheetTabs");
            tabList.setAttribute("role", "group");
            tabList.setAttribute("aria-label", "Tabs in the spreadsheet");
            for (const found of draft.workbook.tabs) {
              const button = BudgetUI.noTranslate(BudgetUI.element("button", "budgetButton sheetTab", found.name));
              button.type = "button";
              if (found.hidden) button.title = "A hidden tab";
              button.addEventListener("click", () => {
                tab.input.value = found.name;
                describe();
              });
              tabList.append(button);
            }
            const tabField = BudgetUI.field("Found in the spreadsheet", tabList, { hint: "Tap one, or type its name above." });

            const box = (labelText, value, numeric) => {
              const input = BudgetUI.element("input", `rangeInput${numeric ? " rangeRow" : " rangeColumn"}`);
              input.type = "text";
              input.inputMode = numeric ? "numeric" : "text";
              input.autocomplete = "off";
              input.spellcheck = false;
              input.maxLength = numeric ? 7 : 5;
              input.value = value;
              input.setAttribute("aria-label", labelText);
              input.placeholder = numeric ? "2" : "B";
              return input;
            };
            const fromCol = box("From column", current ? Spreadsheets.columnLetters(current.fromCol) : "", false);
            const fromRow = box("From row", current ? String(current.fromRow) : "", true);
            const toCol = box("To column (optional)", current && (current.toCol !== current.fromCol || current.toRow !== current.fromRow) ? Spreadsheets.columnLetters(current.toCol) : "", false);
            const toRow = box("To row (optional)", current && (current.toCol !== current.fromCol || current.toRow !== current.fromRow) ? String(current.toRow) : "", true);
            const cellRow = (words, col, row) => {
              const line = BudgetUI.element("div", "rangeLine");
              line.append(BudgetUI.element("span", "rangeWord", words), BudgetUI.element("span", "rangeWord", "Column"), col, BudgetUI.element("span", "rangeWord", "Row"), row);
              return line;
            };
            const cells = BudgetUI.element("div", "rangeBoxes");
            cells.append(cellRow("From", fromCol, fromRow), cellRow("To", toCol, toRow));
            const cellsField = BudgetUI.field("Cells", cells, { hint: key === "date" ? "Like column B row 2 to column B row 50. Pick more rows than you use: empty ones are skipped." : "Like column A row 2 to column A row 50 (as many cells as Date), or just one cell (leave \"to\" empty) for all of them." });
            const found = BudgetUI.noTranslate(BudgetUI.element("p", "sheetRangeFound"));
            found.setAttribute("aria-live", "polite");

            const buttons = [{ label: "Use These Cells", kind: "primary", type: "submit" }];
            if (key !== "date" && Spreadsheets.isLinked(field)) buttons.push({ label: "Type It Instead", onClick: () => {
              draft.fields[key] = null;
              picker.close();
              showFieldRow(key);
              showAccountRow();
              updatePreview();
            } });
            buttons.push({ label: "Cancel", onClick: () => picker.close() });
            pickForm.append(tab.el, tabField, cellsField, found, BudgetUI.buttonRow(buttons));

            // Typing "B2:B50" (or "B2") in the first column box fills in all four
            fromCol.addEventListener("input", () => {
              const parts = Spreadsheets.parseRange(fromCol.value.trim());
              if (parts && /\d/.test(fromCol.value)) {
                fromCol.value = Spreadsheets.columnLetters(parts.fromCol);
                fromRow.value = String(parts.fromRow);
                const one = parts.fromCol === parts.toCol && parts.fromRow === parts.toRow;
                toCol.value = one ? "" : Spreadsheets.columnLetters(parts.toCol);
                toRow.value = one ? "" : String(parts.toRow);
              }
            });
            [fromCol, toCol].forEach(input => input.addEventListener("input", () => {
              if (/^[a-z]+$/.test(input.value)) input.value = input.value.toUpperCase();
            }));
            [tab.input, fromCol, fromRow, toCol, toRow].forEach(input => input.addEventListener("input", describe));
            describe();

            // "= Bills!B2:B50: 49 cells, like Rent, Phone, Internet" (or what's wrong)
            function describe() {
              found.classList.remove("isProblem");
              const range = Spreadsheets.rangeFromParts({ fromCol: fromCol.value, fromRow: fromRow.value, toCol: toCol.value, toRow: toRow.value });
              const sheetTab = Spreadsheets.findTab(draft.workbook, tab.value());
              if (!fromCol.value.trim() && !fromRow.value.trim()) {
                found.textContent = "";
                return null;
              }
              if (range.error) {
                found.textContent = range.error;
                found.classList.add("isProblem");
                return null;
              }
              if (!sheetTab) {
                found.textContent = tab.value() ? `= ${range.range}, but there's no tab called "${tab.value()}". Tap one above.` : `= ${range.range}. Pick its tab above.`;
                found.classList.add("isProblem");
                return null;
              }
              const all = Spreadsheets.rangeCells(range.range);
              const filled = all.map(cell => Spreadsheets.cellText(sheetTab.cells.get(cell.row)?.get(cell.col))).filter(Boolean);
              const like = filled.length > 0 ? `, like ${filled.slice(0, 3).join(", ")}` : ", all empty right now";
              found.textContent = `= ${sheetTab.name}!${range.range}: ${all.length} ${all.length === 1 ? "cell" : "cells"}${like}`;
              return { tab: sheetTab.name, range: range.range };
            }

            pickForm.addEventListener("submit", (event) => {
              event.preventDefault();
              picker.setError("");
              if (!tab.value()) return picker.setError("Pick a tab, or type its name.");
              const range = Spreadsheets.rangeFromParts({ fromCol: fromCol.value, fromRow: fromRow.value, toCol: toCol.value, toRow: toRow.value });
              if (range.error) return picker.setError(range.error);
              const picked = describe();
              if (!picked) return picker.setError(`There's no tab called "${tab.value()}" in the spreadsheet. Tap one of its tabs.`);
              draft.fields[key] = key === "amount" ? { ...picked, sign: sign.value() } : picked;
              picker.close();
              showFieldRow(key);
              showAccountRow();
              updatePreview();
            });
          }
        });
      }
    }
  });
}

// The link's "?": the two ways to share a spreadsheet, and keeping the rest of one private
function sharingHelp() {
  const content = document.createDocumentFragment();
  const list = BudgetUI.element("ul");
  const item = (strong, text) => {
    const li = BudgetUI.element("li");
    li.append(BudgetUI.element("strong", "", strong), text);
    list.append(li);
  };
  item("Anyone with the link: ", "in Google Sheets, tap Share, then set General access to Anyone with the link (Viewer). In Excel (OneDrive), tap Share and pick Anyone with the link can view. Dropbox links work too. Then copy the link here.");
  item(`Or share it with ${SHARING_EMAIL}: `, `in Google Sheets (or a file in Google Drive), tap Share and add ${SHARING_EMAIL} as a Viewer, from the Google account that uses your Prismal Budget email. Then only you can connect it, and it doesn't need to be public.`);
  item("Keep the rest private: ", "anyone with a public link can see the whole spreadsheet. So make a separate spreadsheet with just what Prismal Budget needs, filled from your main one (in Google Sheets, =IMPORTRANGE(\"main spreadsheet's link\", \"Bills!A2:C50\") brings those cells over and keeps them up to date), and connect that one.");
  item("Apple Numbers: ", "it can't share a spreadsheet other sites can read, so keep it in Google Sheets or Excel (in Numbers, File > Export To > Excel).");
  content.append(list);
  return content;
}

// The type's "?": what each refraction type does
function refractionTypesHelp() {
  const list = BudgetUI.element("ul");
  const item = (sprite, name, text) => {
    const li = BudgetUI.element("li", "", `${sprite} `);
    li.append(BudgetUI.element("strong", "", name), `: ${text}`);
    list.append(li);
  };
  item("❗️", "Regular", "a normal cost or gain. It changes In Bank.");
  item("✖️", "Hidden", "spent or received outside your budget's account, like cash. In Bank stays the same; an Other Account changes by its amount.");
  item("⭕️", "Transfer", "money moving between your own accounts. It changes In Bank, but isn't a cost or gain; an Other Account gets the opposite amount.");
  return list;
}

//#endregion

// =====================================================================
// #region REMINDER TIME
// =====================================================================

function wireReminderTime() {
  const input = document.getElementById("reminderTime");
  // Some browsers report every finished part of a typed time, so save once the typing stops
  input.addEventListener("change", () => {
    clearTimeout(timeSaveTimer);
    timeSaveTimer = setTimeout(() => saveReminderTime(input.value), 700);
  });
}

// Save a new reminder time (with this device's time zone)
async function saveReminderTime(time) {
  if (time === reminderSettings.time) return;
  if (!TIME_PATTERN.test(time)) {
    BudgetUI.showToast("Pick a time like 8:00 AM.", true);
    renderReminderTime();
    return;
  }
  const input = document.getElementById("reminderTime");
  input.disabled = true;
  const result = await budgetApi("/api/notify/settings", { time, timezone: currentTimeZone() });
  input.disabled = false;
  if (result.ok && result.data) {
    reminderSettings = result.data;
    BudgetUI.showToast(`Reminder time set to ${formatTime12(time)}.`);
  } else {
    BudgetUI.showToast("Couldn't save the reminder time. Please try again.", true);
  }
  renderReminderTime();
}

// The reminder time, and the time zone it goes by
function renderReminderTime() {
  document.getElementById("reminderTime").value = reminderSettings.time;
  const zone = (reminderSettings.timezone || currentTimeZone()).replace(/_/g, " ");
  document.getElementById("timeZoneNote").textContent = `Time zone: ${zone}. Reminders go out within 5 minutes of this time.`;
}

// "08:00" -> "8:00 AM"
function formatTime12(hhmm) {
  const [hour, minute] = hhmm.split(":").map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
}

//#endregion

// =====================================================================
// #region LANGUAGE AND DATES (this device)
// =====================================================================
// Translating is the browser's own (the card says how). The date format is this device's own (from its
// language and region) unless one is picked here; it's kept on this device, even after signing out, and
// decides how dates show and how typed ones are read (see "Dates people see and type" in Process Budget.js).

function wireDateFormat() {
  const select = document.getElementById("dateFormat");
  if (!select) return;
  let picked = "";
  try { picked = localStorage.getItem(DATE_FORMAT_KEY) || ""; } catch (e) {}
  select.append(
    new Option(`This device's own (${DATE_FORMATS[deviceDateFormat()].pattern})`, ""),
    ...Object.entries(DATE_FORMATS).map(([key, format]) => new Option(format.pattern, key))
  );
  select.value = Object.prototype.hasOwnProperty.call(DATE_FORMATS, picked) ? picked : "";
  renderDateFormatNote();
  select.addEventListener("change", () => {
    try {
      if (select.value) localStorage.setItem(DATE_FORMAT_KEY, select.value);
      else localStorage.removeItem(DATE_FORMAT_KEY);
    } catch (e) {
      BudgetUI.showToast("This browser isn't keeping site data, so the date format can't be saved.", true);
    }
    renderDateFormatNote();
    BudgetUI.showToast(`Dates show like ${showDate(new Date(2026, 9, 5))} now.`);
  });
}

// An example of how dates show (and are read) in the format in use
function renderDateFormatNote() {
  document.getElementById("dateFormatNote").textContent =
    `October 5, 2026 shows as ${showDate(new Date(2026, 9, 5))}, and dates you type are read the same way (${DATE_FORMATS.ymd.pattern} always works too).`;
}

//#endregion

// =====================================================================
// #region PUSH NOTIFICATIONS (this device)
// =====================================================================

const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

// iPhones and iPads only allow push notifications for sites added to the Home Screen
function needsHomeScreen() {
  const appleMobile = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  return appleMobile && !standalone;
}

// Check whether this device already has push on, and make sure the server knows about it
async function refreshPushState() {
  pushSubscription = null;
  if (pushSupported() && reminderSettings.push.available) {
    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      let subscription = await registration.pushManager.getSubscription();
      // The server's keys changed (push setup ran again), so this subscription can't be used
      if (subscription && !usesServerKey(subscription)) {
        await subscription.unsubscribe().catch(() => {});
        subscription = null;
      }
      if (subscription && Notification.permission === "granted") {
        const result = await budgetApi("/api/notify/push/subscribe", { subscription: subscription.toJSON(), timezone: currentTimeZone() });
        if (result.ok && result.data) {
          reminderSettings = result.data;
          pushSubscription = subscription;
        }
      }
    } catch (err) {
      console.warn("Couldn't check push notifications on this device:", err);
    }
  }
  renderPush();
}

// On or off for this device, always with a Turn On / Turn Off button. Where push can't work here (the server
// isn't set up, the browser can't, an iPhone not opened from its Home Screen, or notifications are blocked),
// the status says why, and so does Turn On.
function renderPush() {
  const status = document.getElementById("pushStatus");
  const buttons = document.getElementById("pushButtons");
  buttons.replaceChildren();

  const otherDevices = reminderSettings.push.devices - (pushSubscription ? 1 : 0);
  const others = otherDevices > 0 ? ` They're also on for ${otherDevices} other device${otherDevices > 1 ? "s" : ""}.` : "";
  if (pushSubscription) {
    status.textContent = "On for this device. You'll get a notification at your reminder time on days that need one." + others;
    buttons.append(settingsButton("Turn Off", "danger", turnOffPush), settingsButton("Send Test", "", sendTestPush));
    return;
  }
  const blocked = pushBlockedReason();
  status.textContent = (blocked ? `Off for this device. ${blocked}` : "Off for this device.") + others;
  buttons.append(settingsButton("Turn On", "primary", blocked ? () => BudgetUI.showToast(blocked, true) : turnOnPush));
}

// Why push can't be turned on here, or "" when it can
function pushBlockedReason() {
  if (!reminderSettings.push.available) return "Push notifications aren't set up on the server yet.";
  if (!pushSupported()) {
    return needsHomeScreen()
      ? "On iPhone and iPad, add Prismal Budget to your Home Screen first (tap Share, then Add to Home Screen), then open it from there to turn these on."
      : "This browser doesn't support push notifications.";
  }
  return Notification.permission === "denied" ? PUSH_BLOCKED_TEXT : "";
}

// Turn On: allow notifications, subscribe this device, and tell the server
async function turnOnPush(event) {
  event.currentTarget.disabled = true;
  try {
    // Ask first, while the tap still counts (browsers only show the prompt right after a tap)
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      BudgetUI.showToast(permission === "denied" ? PUSH_BLOCKED_TEXT : "Notifications weren't allowed, so push is still off.", true);
      return;
    }
    const registration = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (subscription && !usesServerKey(subscription)) {
      await subscription.unsubscribe();
      subscription = null;
    }
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToBytes(reminderSettings.push.publicKey)
      });
    }
    const result = await budgetApi("/api/notify/push/subscribe", { subscription: subscription.toJSON(), timezone: currentTimeZone() });
    if (!result.ok || !result.data) throw new Error((result.data && result.data.error) || `Server responded with status: ${result.status}`);
    reminderSettings = result.data;
    pushSubscription = subscription;
    queueReminderPlanSync(true); // Make sure the server has the latest reminder days
    BudgetUI.showToast("Push notifications are on for this device.");
  } catch (err) {
    console.error("Couldn't turn on push notifications:", err);
    BudgetUI.showToast("Couldn't turn on push notifications. Please try again.", true);
  } finally {
    renderPush();
  }
}

// Turn Off: drop this device's subscription, here and on the server
async function turnOffPush(event) {
  event.currentTarget.disabled = true;
  const subscription = pushSubscription;
  const result = await budgetApi("/api/notify/push/unsubscribe", { endpoint: subscription.endpoint });
  if (result.ok && result.data) reminderSettings = result.data;
  // Even if the server missed this, an unsubscribed device is removed the next time a push bounces
  await subscription.unsubscribe().catch(() => {});
  pushSubscription = null;
  BudgetUI.showToast("Push notifications are off for this device.");
  renderPush();
}

// Send Test: a notification to this device now
async function sendTestPush(event) {
  const button = event.currentTarget;
  button.disabled = true;
  const result = await budgetApi("/api/notify/push/test", { endpoint: pushSubscription.endpoint });
  button.disabled = false;
  if (result.ok && result.data && result.data.sent > 0) {
    BudgetUI.showToast("Test sent. It should show up in a few seconds.");
  } else {
    BudgetUI.showToast((result.data && result.data.error) || "The test didn't go through. Try turning push off and back on.", true);
  }
}

// Was this subscription made with the server's current key?
function usesServerKey(subscription) {
  const key = subscription.options && subscription.options.applicationServerKey;
  if (!key) return true; // The browser doesn't say, so keep it
  return bytesToBase64Url(new Uint8Array(key)) === reminderSettings.push.publicKey;
}

//#endregion

// =====================================================================
// #region CALENDAR LINK
// =====================================================================

function renderCalendarLink() {
  const status = document.getElementById("calendarStatus");
  const input = document.getElementById("calendarUrl");
  const buttons = document.getElementById("calendarButtons");
  buttons.replaceChildren();
  const url = reminderSettings.calendarUrl;
  input.hidden = !url;

  if (!url) {
    input.value = "";
    status.textContent = "Off. Turn it on for a private link to add to Google Calendar, Apple Calendar, or most calendar apps. Each reminder shows up as a 30-minute \"Check Budget\" event with an alert.";
    buttons.append(settingsButton("Turn On", "primary", () => setCalendarLink("on")));
    return;
  }

  input.value = url;
  status.textContent = "On. Add this link to your calendar app, and keep it private. In Google Calendar you can also paste it under Other calendars, From URL. Google only checks it every several hours, so changes can take a while to show up there.";
  const webcal = url.replace(/^https?:\/\//, "webcal://");
  buttons.append(
    settingsButton("Copy Link", "primary", copyCalendarLink),
    settingsLink("Apple Calendar", webcal, false),
    settingsLink("Google Calendar", "https://calendar.google.com/calendar/render?cid=" + encodeURIComponent(webcal), true),
    settingsButton("New Link", "", () => {
      if (window.confirm("Make a new link? The old one stops working, so you'd add the new one to your calendar again.")) setCalendarLink("reset");
    }),
    settingsButton("Turn Off", "danger", () => {
      if (window.confirm("Turn off the calendar link? Calendars using it stop getting reminders.")) setCalendarLink("off");
    })
  );
}

// action: "on" | "reset" (new link, the old one stops working) | "off"
async function setCalendarLink(action) {
  document.querySelectorAll("#calendarButtons button").forEach(button => { button.disabled = true; });
  const result = await budgetApi("/api/notify/calendar", { action });
  if (result.ok && result.data) {
    reminderSettings = result.data;
    if (action !== "off") queueReminderPlanSync(true); // Make sure the feed has the latest reminder days
    BudgetUI.showToast(action === "off" ? "Calendar link turned off." : action === "reset" ? "New calendar link made." : "Calendar link is on.");
  } else {
    BudgetUI.showToast("Couldn't change the calendar link. Please try again.", true);
  }
  renderCalendarLink();
}

// Copy Link (or select it where copying isn't allowed)
async function copyCalendarLink() {
  const input = document.getElementById("calendarUrl");
  try {
    await navigator.clipboard.writeText(input.value);
    BudgetUI.showToast("Link copied.");
  } catch (err) {
    input.select(); // Copying wasn't allowed, so select it for the user to copy
    BudgetUI.showToast("Copy the selected link.", true);
  }
}

//#endregion

// =====================================================================
// #region ACCOUNT (email, password, reset link, delete account)
// =====================================================================

function wireAccount() {
  document.getElementById("emailForm").addEventListener("submit", changeEmail);
  document.getElementById("ageForm").addEventListener("submit", changeAge);
  document.getElementById("passwordForm").addEventListener("submit", changePassword);
  document.getElementById("passkeyForm").addEventListener("submit", addPasskey);
  document.getElementById("signOutEverywhereButton").addEventListener("click", signOutEverywhere);
  document.getElementById("downloadDataButton").addEventListener("click", downloadMyData);
  document.getElementById("deleteForm").addEventListener("submit", deleteAccount);
}

// The account cards: email (and whether it's verified), age, the reset link, Quick Entry icons, and analytics
function renderAccount() {
  document.getElementById("emailStatus").textContent = account.email
    ? `Signed in as ${account.username}, with the email ${account.email}. Password reset links go there.`
    : `Signed in as ${account.username}. Your account doesn't have an email yet. Add one so you can reset your password if you forget it.`;
  document.getElementById("emailButton").textContent = account.email ? "Change Email" : "Add Email";
  document.getElementById("passwordFormUsername").value = account.username;
  renderVerification();
  renderAge();

  const status = document.getElementById("passwordStatus");
  const buttons = document.getElementById("passwordButtons");
  buttons.replaceChildren();
  if (!account.canEmail) {
    status.textContent = "Password reset emails aren't set up on the server yet.";
  } else if (!account.email) {
    status.textContent = "Add an email above first. That's where the reset link goes.";
  } else {
    status.textContent = `Get a link at ${account.email} to choose a new password. It works once, for an hour. A reset signs you out on every device, and turns passkey sign-in off until you turn it back on.`;
    buttons.append(settingsButton("Email Me A Reset Link", "primary", sendResetLink));
  }
  renderQuickIcons();
  renderAnalytics();
}

// A new password: the other devices are signed out and Quick Entry icons stop; this one gets a new session
async function changePassword(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const newPassword = document.getElementById("newPassword").value;
  // The API's rule (passwords.js): 8 to 256 characters, any at all, an emoji counting as one
  const length = [...newPassword.normalize("NFKC")].length;
  if (length < 8 || length > 256) {
    BudgetUI.showToast(length < 8 ? "Your new password must be at least 8 characters." : "Your new password can be at most 256 characters.", true);
    return;
  }
  if (newPassword !== document.getElementById("newPasswordAgain").value) {
    BudgetUI.showToast("The two new passwords don't match.", true);
    return;
  }
  setFormBusy(form, true);
  const result = await budgetApi("/api/account/password", { password: document.getElementById("currentPassword").value, newPassword });
  setFormBusy(form, false);
  if (!result.ok || !result.data || !result.data.token) {
    BudgetUI.showToast(accountError(result, "Couldn't change your password. Please try again."), true);
    return;
  }
  localStorage.setItem("prismal_jwt", result.data.token);
  localStorage.setItem("prismal_last_activity", Date.now().toString());
  const hadIcons = account.quickIcons > 0;
  account.quickIcons = 0;
  form.reset();
  renderAccount();
  const noted = account.email && account.canEmail ? " We emailed you a note about it." : "";
  BudgetUI.showToast(`Password changed. Your other devices were signed out${hadIcons ? ", and your Quick Entry icons were turned off" : ""}.${noted}`);
}

// Change Email (needs the password): the new one gets a link to verify it
async function changeEmail(event) {
  event.preventDefault();
  const form = event.currentTarget;
  setFormBusy(form, true);
  const result = await budgetApi("/api/account/email", {
    email: document.getElementById("newEmail").value.trim(),
    password: document.getElementById("emailPassword").value
  });
  setFormBusy(form, false);
  if (!result.ok || !result.data) {
    BudgetUI.showToast(accountError(result, "Couldn't change the email. Please try again."), true);
    return;
  }
  const added = !account.email;
  const changed = result.data.email !== account.email;
  account = result.data;
  form.reset();
  renderAccount();
  renderSheets();
  // A new email needs verifying: the API emails it a link (and the old one a note that it changed)
  const verify = !changed ? "" : account.verificationSent
    ? " We emailed it a link to verify it (it works for 24 hours)."
    : " Verify it with Send Verification Email above.";
  BudgetUI.showToast(added ? `Email added: ${account.email}.${verify}` : `Email changed to ${account.email}.${verify}`);
}

// Whether the email is verified, and Send Verification Email while it isn't (connecting spreadsheets needs it)
function renderVerification() {
  const status = document.getElementById("verifyStatus");
  const buttons = document.getElementById("verifyButtons");
  buttons.replaceChildren();
  status.hidden = !account.email;
  if (!account.email) return;
  if (account.emailVerified) {
    status.textContent = "Your email is verified.";
    return;
  }
  if (!account.canEmail) {
    status.textContent = "Your email isn't verified yet, and verification emails aren't set up on the server yet.";
    return;
  }
  status.textContent = "Your email isn't verified yet. Connecting spreadsheets needs a verified email, so open the link we emailed you (check your spam folder too), or send a new one. It works for 24 hours.";
  buttons.append(settingsButton("Send Verification Email", "primary", sendVerification));
}

// Email a new verification link (Email's button, or the one on Connected Spreadsheets)
async function sendVerification(event) {
  const button = event.currentTarget;
  button.disabled = true;
  const result = await budgetApi("/api/account/verify-email", {});
  button.disabled = false;
  if (!result.ok || !result.data) {
    BudgetUI.showToast(accountError(result, "Couldn't send the verification email. Please try again."), true);
    return;
  }
  account = result.data;
  renderVerification();
  renderSheets();
  BudgetUI.showToast(account.alreadyVerified ? "Your email is already verified." : `Verification link sent to ${account.email}. It works for 24 hours.`);
}

// Back on this page after opening the link (another tab or app): check whether the email is verified now
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState !== "visible" || !account || !account.email || account.emailVerified) return;
  const result = await budgetApi("/api/account");
  if (!result.ok || !result.data || !result.data.emailVerified) return;
  account = result.data;
  renderVerification();
  renderSheets();
  BudgetUI.showToast("Your email is verified, so you can connect spreadsheets now.");
});

// Prismal Budget is for people 18 and older. The age given when signing up can be fixed here (like a typo),
// never to under 18.
const MIN_AGE = 18;
const MAX_AGE = 120;

// The Age card
function renderAge() {
  document.getElementById("ageStatus").textContent = `Prismal Budget is for people ${MIN_AGE} and older. Typed the wrong age when you signed up? Fix it here.`;
  document.getElementById("ageInput").value = Number.isInteger(account.age) ? String(account.age) : "";
}

// Save Age (18 to 120)
async function changeAge(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const text = document.getElementById("ageInput").value.trim();
  const age = /^\d{1,3}$/.test(text) ? Number(text) : NaN;
  if (!Number.isInteger(age) || age > MAX_AGE) return BudgetUI.showToast("Enter your age in years, like 34.", true);
  if (age < MIN_AGE) return BudgetUI.showToast(`Prismal Budget is for people ${MIN_AGE} and older.`, true);
  if (age === account.age) return;
  setFormBusy(form, true);
  const result = await budgetApi("/api/account/age", { age });
  setFormBusy(form, false);
  if (!result.ok || !result.data) {
    BudgetUI.showToast(accountError(result, "Couldn't save your age. Please try again."), true);
    return;
  }
  account = result.data;
  renderAge();
  BudgetUI.showToast(`Your age is saved: ${account.age}.`);
}

// Email Me A Reset Link
async function sendResetLink(event) {
  const button = event.currentTarget;
  button.disabled = true;
  const result = await budgetApi("/api/account/password-reset", {});
  button.disabled = false;
  if (result.ok) {
    BudgetUI.showToast(`Reset link sent to ${account.email}. It works for 1 hour.`);
  } else {
    BudgetUI.showToast(accountError(result, "Couldn't send the reset link. Please try again."), true);
  }
}

// Delete Account (with the password and a confirmation), then off to the login page
async function deleteAccount(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!window.confirm("Delete your account and everything in your budget? This can't be undone.")) return;
  setFormBusy(form, true);
  const result = await budgetApi("/api/account/delete", { password: document.getElementById("deletePassword").value });
  if (!result.ok) {
    setFormBusy(form, false);
    BudgetUI.showToast(accountError(result, "Couldn't delete the account. Please try again."), true);
    return;
  }
  // The account is gone: this device stops its push notifications, stops offering the account's
  // passkeys (where the browser supports it), and forgets the session (keeping its own choices, like
  // analytics off)
  if (pushSubscription) await pushSubscription.unsubscribe().catch(() => {});
  if (passkeyInfo) Passkeys.syncList(passkeyInfo.userHandle, []);
  clearSignedInData();
  window.location.replace("/login.html?deleted=1");
}

// The API's message, or a fallback (401: signed out, like after a password reset on another device)
function accountError(result, fallback) {
  if (result.status === 401) return "You've been signed out. Please log in again.";
  if (result.status === 0) return "Couldn't reach the server. Please try again.";
  return (result.data && result.data.error) || fallback;
}

// A form's boxes and buttons off while it sends (and back on after)
function setFormBusy(form, busy) {
  form.querySelectorAll("input, button").forEach(control => { control.disabled = busy; });
}

//#endregion

// =====================================================================
// #region SIGNED-IN DEVICES (Quick Entry icons, Sign Out Everywhere)
// =====================================================================

function renderQuickIcons() {
  const status = document.getElementById("quickIconStatus");
  const buttons = document.getElementById("quickIconButtons");
  buttons.replaceChildren();
  const count = account.quickIcons || 0;
  if (count === 0) {
    status.textContent = "Quick Entry icons: none right now. The Quick Entry button on Home makes one for a phone's home screen.";
    return;
  }
  status.textContent = `Quick Entry icons: ${count} on home screens. Each one can add entries without signing in, see your Other Accounts' balances (for its account picker), and keep your prisms, but nothing else.`;
  buttons.append(settingsButton(count === 1 ? "Turn Off The Icon" : "Turn Off Icons", "danger", turnOffQuickIcons));
}

// Turn Off Icons (after asking): every Quick Entry icon stops working
async function turnOffQuickIcons(event) {
  const count = account.quickIcons;
  if (!window.confirm(`Turn off ${count === 1 ? "your Quick Entry icon" : `all ${count} of your Quick Entry icons`}? ${count === 1 ? "It stops" : "They stop"} working right away (entries already made with ${count === 1 ? "it" : "them"} still get added). You can make a new one on Home.`)) return;
  event.currentTarget.disabled = true;
  const result = await budgetApi("/api/quick/off", {});
  if (result.ok && result.data) {
    account.quickIcons = 0;
    BudgetUI.showToast(count === 1 ? "Your Quick Entry icon is off." : "Your Quick Entry icons are off.");
  } else {
    BudgetUI.showToast(accountError(result, "Couldn't turn off the icons. Please try again."), true);
  }
  renderQuickIcons();
}

// Every device and browser (this one too) is signed out, and Quick Entry icons stop
async function signOutEverywhere(event) {
  if (!window.confirm("Sign out every device and browser, this one too? Your Quick Entry icons will stop working, and you'll sign in again here.")) return;
  const button = event.currentTarget;
  button.disabled = true;
  const result = await budgetApi("/api/account/sign-out-everywhere", {});
  if (!result.ok) {
    button.disabled = false;
    BudgetUI.showToast(accountError(result, "Couldn't sign out everywhere. Please try again."), true);
    return;
  }
  clearSignedInData();
  try { sessionStorage.setItem("prismal_signed_out", "everywhere"); } catch (e) {} // The login page says so
  window.location.replace("/login.html");
}

//#endregion

// =====================================================================
// #region YOUR DATA AND PRIVACY (Download My Data, analytics on this device)
// =====================================================================

// Everything stored for the account, saved as a JSON file
async function downloadMyData(event) {
  const button = event.currentTarget;
  button.disabled = true;
  const result = await budgetApi("/api/account/export");
  button.disabled = false;
  if (!result.ok || !result.data) {
    BudgetUI.showToast(accountError(result, "Couldn't get your data. Please try again."), true);
    return;
  }
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([JSON.stringify(result.data, null, 2)], { type: "application/json" }));
  link.download = `prismal-budget-${account.username.replace(/[^\p{L}\p{N}._-]+/gu, "-")}-${formatToYMD(today)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 10000);
  BudgetUI.showToast("Your data is downloading.");
}

// Google Analytics loads only when this device hasn't turned it off and the browser doesn't ask sites
// not to track it (see Analytics.js)
function renderAnalytics() {
  const status = document.getElementById("analyticsStatus");
  const buttons = document.getElementById("analyticsButtons");
  buttons.replaceChildren();
  let deviceOff = false;
  try { deviceOff = localStorage.getItem("prismal_analytics") === "off"; } catch (e) {}
  const browserSaysNo = navigator.globalPrivacyControl === true || navigator.doNotTrack === "1" || window.doNotTrack === "1";
  if (browserSaysNo) {
    status.textContent = "Off: this browser asks sites not to track it (Global Privacy Control or Do Not Track), so Google Analytics never loads here.";
  } else if (deviceOff) {
    status.textContent = "Off for this device. Google Analytics doesn't load here.";
    buttons.append(settingsButton("Turn On", "primary", () => setAnalytics(true)));
  } else {
    status.textContent = "On. Google Analytics counts page visits, which helps improve Prismal Budget. It never sees your budget, and links' private codes are left out. You can turn it off for this device.";
    buttons.append(settingsButton("Turn Off", "danger", () => setAnalytics(false)));
  }
}

// Analytics on or off for this device
function setAnalytics(on) {
  try {
    if (on) localStorage.removeItem("prismal_analytics");
    else localStorage.setItem("prismal_analytics", "off");
  } catch (e) {}
  // Off stops it on this page right away; on starts with the next page
  if (!on && window.ANALYTICS_ID) window[`ga-disable-${window.ANALYTICS_ID}`] = true;
  BudgetUI.showToast(on ? "Analytics is on for this device, starting with the next page." : "Analytics is off for this device.");
  renderAnalytics();
}

//#endregion

// =====================================================================
// #region PASSKEYS (Face ID, Touch ID, Windows Hello)
// =====================================================================

// On or off, the account's passkeys, and the form that adds one. Off keeps the passkeys but they
// can't sign in. With none yet, adding the first one is what turns it on.
function renderPasskeys() {
  const status = document.getElementById("passkeyStatus");
  const buttons = document.getElementById("passkeyButtons");
  const list = document.getElementById("passkeyList");
  const form = document.getElementById("passkeyForm");
  buttons.replaceChildren();
  list.replaceChildren();
  if (!passkeyInfo) {
    status.textContent = passkeyLoadStatus === 404
      ? "Passkeys aren't set up on the server yet."
      : "Couldn't load your passkeys. Please refresh to try again.";
    list.hidden = true;
    form.hidden = true;
    return;
  }

  const count = passkeyInfo.passkeys.length;
  if (passkeyInfo.on) {
    status.textContent = "On. Sign in with any passkey below instead of typing your password. Your password keeps working too.";
    buttons.append(settingsButton("Turn Off", "danger", () => turnPasskeys(false)));
  } else if (count > 0) {
    status.textContent = "Off. Your passkeys are kept, but they can't sign you in until you turn this back on. Resetting your password turns it off too, so first make sure each passkey below is yours.";
    buttons.append(settingsButton("Turn On", "primary", () => turnPasskeys(true)));
  } else {
    status.textContent = "Off. Turn it on to sign in with Face ID, Touch ID, Windows Hello, a fingerprint, or your device's PIN instead of typing your password. Your password keeps working too, and your face or fingerprint never leaves your device.";
  }

  list.hidden = count === 0;
  passkeyInfo.passkeys.forEach(passkey => list.append(passkeyItem(passkey)));

  form.hidden = false;
  const hint = document.getElementById("passkeyFormHint");
  document.getElementById("passkeyFields").hidden = !Passkeys.usable;
  if (!Passkeys.usable) {
    hint.textContent = Passkeys.onIpAddress
      ? Passkeys.IP_ADDRESS_TEXT
      : "This browser can't make passkeys. Try a newer browser, or add one from another device.";
    return;
  }
  hint.textContent = count === 0
    ? "Turning it on makes a passkey for this device: enter your password, then confirm with your face, fingerprint, or PIN when your device asks."
    : "Add a passkey for another device or password manager: enter your password, then confirm with your face, fingerprint, or PIN when your device asks.";
  document.getElementById("passkeyAddButton").textContent = count === 0 ? "Turn On" : "Add Passkey";
  const nameInput = document.getElementById("passkeyName");
  if (!nameInput.value) nameInput.value = Passkeys.deviceName();
}

// One passkey: its name, when it was added and last used, and Remove
function passkeyItem(passkey) {
  const item = BudgetUI.element("li", "passkeyItem");
  const about = BudgetUI.element("div", "passkeyAbout");
  const details = [`Added ${formatDay(passkey.createdAt)}`, passkey.lastUsedAt ? `last used ${formatDay(passkey.lastUsedAt)}` : "not used yet"];
  if (passkey.synced) details.push("synced across your devices");
  if (passkey.site !== location.hostname) details.push(`made on ${passkey.site}`); // Only works there
  about.append(BudgetUI.element("strong", "", passkey.name), BudgetUI.element("span", "panelHint", details.join(" · ")));
  item.append(about, settingsButton("Remove", "danger", () => removePasskey(passkey)));
  return item;
}

// The form: check the password, have the device make a passkey, then save it
async function addPasskey(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = document.getElementById("passkeyAddButton").textContent;
  const name = document.getElementById("passkeyName").value.trim() || Passkeys.deviceName();
  // A challenge already checked against the password starts the device's check right away (Safari
  // wants that to happen right after the tap), so trying again doesn't wait on the server
  if (!passkeyAdd || Date.now() - passkeyAdd.at >= Passkeys.FRESH_MS) {
    setFormBusy(form, true);
    const result = await budgetApi("/api/passkey/add/options", { password: document.getElementById("passkeyPassword").value });
    setFormBusy(form, false);
    if (!result.ok || !result.data || !result.data.options) {
      BudgetUI.showToast(accountError(result, "Couldn't start adding the passkey. Please try again."), true);
      return;
    }
    passkeyAdd = { options: result.data.options, at: Date.now() };
  }

  let credential;
  try {
    credential = await navigator.credentials.create({ publicKey: Passkeys.addRequest(passkeyAdd.options) });
  } catch (error) {
    if (error.name === "InvalidStateError") passkeyAdd = null;
    const message = Passkeys.problem(error, true);
    if (message) BudgetUI.showToast(error.name === "NotAllowedError" ? `${message} Press ${button} to try again.` : message, true);
    return;
  }
  passkeyAdd = null;
  setFormBusy(form, true);
  const result = await budgetApi("/api/passkey/add", { name, credential: Passkeys.addAnswer(credential) });
  setFormBusy(form, false);
  if (!result.ok || !result.data) {
    BudgetUI.showToast(accountError(result, "Couldn't add the passkey. Please try again."), true);
    return;
  }
  passkeyInfo = result.data;
  form.reset();
  renderPasskeys();
  // The API emails the account a note whenever a passkey is added
  const noted = account.email && account.canEmail ? " We emailed you a note about it." : "";
  BudgetUI.showToast(`Passkey added: ${passkeyInfo.added}. Passkey sign-in is on.${noted}`);
}

// Passkey sign-in on or off for the account
async function turnPasskeys(on) {
  document.querySelectorAll("#passkeyButtons button").forEach(button => { button.disabled = true; });
  const result = await budgetApi("/api/passkey/turn", { on });
  if (result.ok && result.data) {
    passkeyInfo = result.data;
    BudgetUI.showToast(on ? "Passkey sign-in is on." : "Passkey sign-in is off. Your passkeys are kept for when you turn it back on.");
  } else {
    BudgetUI.showToast(accountError(result, "Couldn't change passkey sign-in. Please try again."), true);
  }
  renderPasskeys();
}

// Remove a passkey (after asking), and tell the browser it's gone where it can
async function removePasskey(passkey) {
  if (!window.confirm(`Remove the passkey "${passkey.name}"? It won't be able to sign in anymore. To clear it off the device too, delete it in that device's passwords (or passkeys) settings.`)) return;
  document.querySelectorAll("#passkeyList button").forEach(button => { button.disabled = true; });
  const result = await budgetApi("/api/passkey/remove", { id: passkey.id });
  if (result.ok && result.data) {
    passkeyInfo = result.data;
    Passkeys.syncList(passkeyInfo.userHandle, passkeyInfo.passkeys); // Browsers that support it stop offering it
    BudgetUI.showToast(`Passkey removed: ${passkey.name}.`);
  } else {
    BudgetUI.showToast(accountError(result, "Couldn't remove the passkey. Please try again."), true);
  }
  renderPasskeys();
}

// A stored time (ms) -> "Oct 5, 2026"
function formatDay(time) {
  return new Date(time).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

//#endregion

// =====================================================================
// #region HELPERS
// =====================================================================

function settingsButton(label, kind, onClick) {
  const button = BudgetUI.element("button", `budgetButton ${kind}`.trim(), label);
  button.type = "button";
  button.addEventListener("click", onClick);
  return button;
}

// A link styled like a button (calendar apps open from these)
function settingsLink(label, href, newTab) {
  const link = BudgetUI.element("a", "budgetButton", label);
  link.href = href;
  if (newTab) {
    link.target = "_blank";
    link.rel = "noopener";
  }
  return link;
}

// Bytes <-> base64url text (push keys)
function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(text) {
  const base64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

//#endregion
