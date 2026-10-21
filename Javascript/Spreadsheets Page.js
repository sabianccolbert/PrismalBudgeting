// Spreadsheets Page (Menu > Spreadsheets): connected spreadsheets, whose entries land on the calendar. Add one,
// change it, turn it on or off, delete it, and see what's wrong with any of its cells (see CONNECTED SPREADSHEETS
// in Process Budget.js, and Spreadsheets.js for the reading). Connecting one needs a verified email, so until it
// is, the page says so and can email a new link. (Other emails, for spreadsheets shared from a Google account with
// another email, are added in Settings, under Email.)

// =====================================================================
// #region SETUP
// =====================================================================

let account = null; // From the API: { username, email, emailVerified, canEmail (emails are set up) }

window.workspaceReady.then(async (loaded) => {
  const status = document.getElementById("dataStatus");
  if (!loaded) {
    status.textContent = "Couldn't load your budget data. Please refresh to try again.";
    return;
  }
  status.hidden = true;
  wireSheets();
  renderSheets();
  // Whether the email is verified (until it's known, the server says so if it isn't)
  const result = await budgetApi("/api/account");
  if (result.ok && result.data) {
    account = result.data;
    renderSheets();
  }
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
const SHEET_PREVIEW_LINES = 8;
const SHARING_EMAIL = "admin@prismalbudget.org";

// Add Spreadsheet, the verification note's button, and redrawing after every change
function wireSheets() {
  document.getElementById("addSheetButton").addEventListener("click", (event) => openSheetPanel(null, event.currentTarget));
  document.getElementById("sheetsVerifyButton").addEventListener("click", sendSheetVerification);
  document.addEventListener("budget:updated", renderSheets);
}

// The connected spreadsheets, and whether one can be added (a verified email, and fewer than MAX_SHEETS)
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
      ? "Connecting a spreadsheet needs a verified email. Add your email in Settings, then open the link we send it (check your spam folder too)."
      : `Connecting a spreadsheet needs a verified email. Open the link we emailed to ${account.email} (check your spam folder too), or send a new one.`;
    document.getElementById("sheetsVerifyButton").hidden = !account.email || !account.canEmail;
  }
  document.getElementById("addSheetButton").disabled = unverified || sheetsData.list.length >= MAX_SHEETS;
}

// One spreadsheet: its button, On/Off, Delete, and its problems
function sheetItem(connection) {
  const item = BudgetUI.element("li", `sheetItem${connection.on ? "" : " isOff"}`);
  const row = BudgetUI.element("div", "sheetRow");

  const open = settingsButton("", "sheetButton", (event) => openSheetPanel(connection.id, event.currentTarget));
  const { landing: upcoming, keptOff } = sheetLanding(connection.entries);
  const count = `${upcoming} ${connection.placeholder ? (upcoming === 1 ? "placeholder" : "placeholders") : (upcoming === 1 ? "entry" : "entries")} from today on`;
  open.append(
    BudgetUI.noTranslate(BudgetUI.element("span", "sheetName", `➕ ${connection.name}`)),
    BudgetUI.element("span", `sheetCount${connection.placeholder && connection.on ? " isPlaceholder" : ""}`, connection.on ? count : "Off")
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

  const remove = settingsButton("Delete", "danger sheetDelete", async () => {
    if (!window.confirm(`Delete ${connection.name}? Its entries come off your calendar from today on. Days that already passed keep theirs, and days you changed become plain entries. The spreadsheet itself isn't touched.`)) return;
    remove.disabled = true;
    const result = await deleteSheetConnection(connection.id);
    if (!result.ok) {
      remove.disabled = false;
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
      const name = BudgetUI.textField({ label: "Name", value: existing ? existing.name : "", placeholder: "Bills, Paychecks...", maxLength: MAX_SHEET_NAME });

      const rows = {};
      const accountNames = otherAccounts().map(account => account.name);

      // Title, typed: one for every entry
      const titleInput = BudgetUI.element("input", "textInput");
      titleInput.type = "text";
      titleInput.placeholder = "Rent, paycheck...";
      titleInput.maxLength = MAX_TITLE;
      // Amount, typed, with Cost / Gain (or a % of the Other Account picked, see PERCENT_MARK in Process Budget.js)
      const typedValue = typeof draft.fields.amount?.value === "number" ? draft.fields.amount.value : null;
      const typedPercent = draft.fields.amount?.percent === true;
      const amount = BudgetUI.amountField({ amount: typedPercent ? null : typedValue, percent: typedPercent ? typedValue : null });
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

      // Its entries can all be placeholders (they land from today on, so it's always offered)
      const placeholder = BudgetUI.placeholderField({
        checked: !!existing?.placeholder,
        hint: "Every entry it adds is a placeholder: a stand-in for an entry you expect, like an estimate. They count like any entry and show in yellow, and each is deleted once its day passes."
      });
      placeholder.input.addEventListener("change", () => updatePreview());

      const preview = BudgetUI.element("div", "sheetPreview");
      preview.setAttribute("aria-live", "polite");

      section.append(name.el, ...SHEET_FIELD_KEYS.map(key => rows[key].el), placeholder.el, preview);
      form.append(link.el, openedNote, section, buttons);

      [titleInput, amountControl].forEach(input => input.addEventListener("input", updatePreview));
      amountControl.addEventListener("click", () => setTimeout(updatePreview)); // Cost / Gain, $ / %
      account.addEventListener("change", () => {
        showAccountRow();
        updatePreview();
      });
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
        // (A typed amount can be a % of the account's balance once there's one)
        amount.setPercentAllowed(!rows.account.el.hidden && (accountLinked || !!account.value));
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
          const value = amount.isPercent() ? amount.percent() : amount.value();
          fields.amount = { value: value === null || Number.isNaN(value) ? null : value, ...(amount.isPercent() ? { percent: true } : {}) };
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
          recurringHits(entry[3], createSafeMidnight(entry[0], true), getSpecialType(entry[1])) === false);
        const { keptOff } = sheetLanding(read.entries);
        const heading = BudgetUI.element("p", "sheetPreviewHeading", upcoming.length === 0
          ? "Entries: none from today on yet."
          : `Entries: ${upcoming.length} from today on${upcoming.length > SHEET_PREVIEW_LINES ? `, starting with` : ""}`);
        preview.append(heading);
        if (upcoming.length > 0) {
          const list = BudgetUI.noTranslate(BudgetUI.element("ul", `sheetPreviewList${placeholder.value() ? " isPlaceholder" : ""}`));
          for (const [dateText, special, entryAmount, title] of upcoming.slice(0, SHEET_PREVIEW_LINES)) {
            const line = BudgetUI.element("li", entryAmount > 0 ? "positive" : "");
            const percent = percentOf(special);
            line.append(BudgetUI.element("span", "sheetPreviewDate", showDay(createSafeMidnight(dateText, true))), ` ➕${baseSprite(special)} ${formatMoney(entryAmount)}${percent !== null ? ` (${showPercent(percent)})` : ""} ${title}`);
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
        if (!name.value()) name.input.value = (file.name || "Spreadsheet").slice(0, MAX_SHEET_NAME);
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
        if (!Spreadsheets.isLinked(fields.title) && String(fields.title.value || "").includes(ACCOUNT_ARROW)) return panel.setError(TITLE_ARROW);
        if (!Spreadsheets.isLinked(fields.title) && !fields.title.value && !fields.account.value) return panel.setError("Type a title, or tap ➕ next to Title to pick its cells.");
        if (!Spreadsheets.isLinked(fields.amount) && amount.isPercent()) {
          const { error } = BudgetUI.readPercentField(amount);
          if (error) return panel.setError(error);
        } else if (!Spreadsheets.isLinked(fields.amount)) {
          const value = amount.value();
          if (value === null || Number.isNaN(value)) return panel.setError("Type an amount, like 25.00, or tap ➕ next to Amount to pick its cells.");
          if (Math.abs(value) > MAX_AMOUNT) return panel.setError(AMOUNT_TOO_BIG);
        }
        const read = Spreadsheets.readConnection(fields, draft.workbook);
        if (read.entries.length === 0 && read.problems.length > 0) return panel.setError("Fix what's under Needs a look first: nothing can be added from it yet.");
        BudgetUI.submit(panel, () => saveSheetConnection(
          { name: name.value(), link: draft.openedLink, fields, placeholder: placeholder.value() },
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
  item(`Or share it with ${SHARING_EMAIL}: `, `in Google Sheets (or a file in Google Drive), tap Share and add ${SHARING_EMAIL} as a Viewer, from the Google account that uses your Prismal Budget email (or one whose email you added under Other Emails, in Settings under Email). Then only you can connect it, and it doesn't need to be public.`);
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
// #region EMAIL VERIFICATION
// =====================================================================

// Email a new verification link (the note's button)
async function sendSheetVerification(event) {
  const button = event.currentTarget;
  button.disabled = true;
  const result = await budgetApi("/api/account/verify-email", {});
  button.disabled = false;
  if (!result.ok || !result.data) {
    BudgetUI.showToast(accountError(result, "Couldn't send the verification email. Please try again."), true);
    return;
  }
  account = result.data;
  renderSheets();
  BudgetUI.showToast(account.alreadyVerified
    ? "Your email is already verified."
    : `Verification link sent to ${account.email}. It works for 24 hours. If it isn't in your inbox, check your spam folder.`);
}

// Back on this page after opening the link (another tab or app): check whether the email is verified now
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState !== "visible" || !account || !account.email || account.emailVerified) return;
  const result = await budgetApi("/api/account");
  if (!result.ok || !result.data || !result.data.emailVerified) return;
  account = result.data;
  renderSheets();
  BudgetUI.showToast("Your email is verified, so you can connect spreadsheets now.");
});

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

// What went wrong with an account request, in words (the server's own message when it sent one)
function accountError(result, fallback) {
  if (result.status === 401) return "You've been signed out. Please log in again.";
  if (result.status === 0) return "Couldn't reach the server. Please try again.";
  return (result.data && result.data.error) || fallback;
}

//#endregion
