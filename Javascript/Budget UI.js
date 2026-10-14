// Budget UI: shared pieces for the budget pages. Panels that expand out of the button or entry
// that opened them (like a cell zoom), form fields, the refraction type picker, date fields
// (type a date, or tap a day on the calendar), toasts, and entry line rendering.

const BudgetUI = (() => {

  // =====================================================================
  // #region REFRACTION TYPES
  // =====================================================================
  // "Refraction type" is the emoji each entry starts with (the spreadsheet's "special type")

  const REFRACTION_TYPES = [
    { key: "❗️", label: "❗️ Regular" },
    { key: "✖️", label: "✖️ Hidden" },
    { key: "⭕️", label: "⭕️ Transfer" }
  ];

  // Recurring entries store the same types behind a checkmark
  const RECURRING_SPRITES = { "❗️": "✔️", "✖️": "✔️✖️", "⭕️": "✔️⭕️" };

  // Lines the budget writes itself (In Bank, Costs, Gains, next-28 lines)
  const isSystemLine = (sprite) => systemEmojis.includes(sprite);

  //#endregion

  // =====================================================================
  // #region PANELS
  // =====================================================================

  let currentPanel = null;
  const panelsUnder = []; // Panels with another one open over them (stacked), newest last
  const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Open a panel. "large" panels float over the top of the screen: nothing on the page moves, and the
  // page under them can still be scrolled and tapped (like a calendar day for a date field). "small"
  // floats next to its origin. inline: true puts a large one in the page's #panelSlot instead, for a page
  // that is just the panel (Quick Entry). build(form, panel) adds the fields and buttons.
  // closable: false leaves out the × and Escape. stacked: true opens it over the open panel (which waits
  // under it, and comes back when it closes) instead of closing that one.
  function openPanel({ origin, size = "large", title, build, closable = true, inline = false, stacked = false }) {
    if (stacked && currentPanel) {
      currentPanel.panel.inert = true;
      currentPanel.panel.classList.add("isUnder");
      panelsUnder.push(currentPanel);
      currentPanel = null;
    } else {
      closeAllPanels(true);
    }

    const floating = size === "large" && !inline;
    const panel = element("section", `budgetPanel ${size}${floating ? " floating" : ""}${panelsUnder.length > 0 ? " stacked" : ""}`);
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", title);

    const header = element("header", "panelHeader");
    header.appendChild(element("h3", "", title));
    const closeButton = element("button", "panelClose", "×");
    closeButton.type = "button";
    closeButton.setAttribute("aria-label", "Close");
    if (closable) header.appendChild(closeButton);

    const form = element("form", "panelBody");
    form.noValidate = true;
    form.autocomplete = "off";
    const error = element("p", "panelError");
    error.hidden = true;
    error.setAttribute("role", "alert");

    panel.append(header, form);
    const api = {
      panel,
      form,
      origin,
      closable,
      close: () => closePanel(),
      setError(message) {
        error.textContent = message || "";
        error.hidden = !message;
      },
      setBusy(busy) {
        panel.classList.toggle("isBusy", busy);
        panel.querySelectorAll("button, input, select, textarea").forEach(control => {
          if (busy) {
            control.dataset.wasDisabled = control.disabled ? "1" : "";
            control.disabled = true;
          } else {
            control.disabled = control.dataset.wasDisabled === "1";
          }
        });
      }
    };

    build(form, api);
    const buttons = form.querySelector(".panelButtons");
    if (buttons) buttons.parentNode.insertBefore(error, buttons);
    else form.append(error);
    closeButton.addEventListener("click", () => closePanel());

    // Floating panels go in <body>: the page's #transitionContainer is transformed, which would make a
    // fixed-position panel scroll with the page
    if (inline) {
      (document.getElementById("panelSlot") || document.querySelector("main") || document.body).appendChild(panel);
    } else {
      document.body.appendChild(panel);
      if (size === "small") positionNear(panel, origin);
    }
    // It grows out of what opened it (the same zoom as Help and Search: FloatingWindows in Layout.js)
    window.FloatingWindows?.zoomOpen(panel, origin);
    if (inline) panel.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" });

    // Date fields fill from calendar taps right away (no keyboard needed on phones)
    const firstDate = form.querySelector("input.dateInput");
    if (firstDate && hasCalendar()) setPickTarget(firstDate);
    if (window.matchMedia("(pointer: fine)").matches) {
      const firstField = form.querySelector("input:not([type=checkbox]):not(:disabled), textarea:not(:disabled), select:not(:disabled)");
      if (firstField) firstField.focus({ preventScroll: true });
    }

    currentPanel = api;
    return api;
  }

  // Close the open panel (the top one); a panel it was opened over comes back
  function closePanel(immediate = false) {
    const api = currentPanel;
    if (!api) return;
    currentPanel = null;
    if (pickTarget && api.panel.contains(pickTarget)) setPickTarget(null);

    const panel = api.panel;
    panel.classList.add("isClosing");
    panel.inert = true; // A closing panel can't be clicked, typed in, or picked into
    // It shrinks back into what opened it, then goes (right away when it can't, or shouldn't, zoom)
    if (immediate || !window.FloatingWindows) panel.remove();
    else window.FloatingWindows.zoomClose(panel, api.origin, () => panel.remove());

    const under = panelsUnder.pop();
    if (under) {
      under.panel.inert = false;
      under.panel.classList.remove("isUnder");
      currentPanel = under;
      if (api.origin && under.panel.contains(api.origin) && api.origin.isConnected) api.origin.focus({ preventScroll: true });
    }
  }

  // Close every open panel, stacked ones too
  function closeAllPanels(immediate = false) {
    while (currentPanel) closePanel(immediate);
  }

  // Small panels sit just below their origin (or above it near the bottom of the screen)
  function positionNear(panel, origin) {
    const margin = 8;
    const rect = origin.getBoundingClientRect();
    const box = panel.getBoundingClientRect();
    let left = rect.left + rect.width / 2 - box.width / 2;
    left = Math.min(Math.max(left, margin), window.innerWidth - box.width - margin);
    let top = rect.bottom + margin;
    if (top + box.height > window.innerHeight - margin && rect.top - box.height - margin > margin) {
      top = rect.top - box.height - margin;
    }
    panel.style.left = `${left + window.scrollX}px`;
    panel.style.top = `${top + window.scrollY}px`;
  }

  // Run a budget change from a panel: busy while it runs, the error stays in the panel,
  // success closes it. Resolves to the change's result.
  async function submit(panel, change) {
    panel.setError("");
    panel.setBusy(true);
    const result = await change();
    panel.setBusy(false);
    if (!result.ok) {
      panel.setError(result.message || "That didn't work. Please try again.");
    } else if (result.notFound) {
      panel.setError("That entry couldn't be found. It may have already changed.");
    } else {
      panel.close();
      warnIfUnsaved(result);
    }
    return result;
  }

  // A change that worked but couldn't reach the server yet (offline) says it'll be sent when it can
  function warnIfUnsaved(result) {
    if (result && result.ok && result.saved === false) {
      showToast("Couldn't reach the server, so that change isn't saved yet. It'll be saved as soon as the connection comes back (leaving the page before then asks first).", true);
    }
  }

  // Escape closes the panel
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && currentPanel && currentPanel.closable) closePanel();
  });

  // Leaving the page closes the panel, any date box's waiting for a day, and notes, right away, so the
  // browser's Back button never brings the page back with them still up (see FloatingWindows in Layout.js)
  window.FloatingWindows?.closeOnPageExit(() => {
    closeAllPanels(true);
    setPickTarget(null);
    if (toastStack) toastStack.replaceChildren();
  });

  //#endregion

  // =====================================================================
  // #region FIELDS
  // =====================================================================

  function element(tag, className = "", text = "") {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text) el.textContent = text;
    return el;
  }

  // A labeled field: caption, the control, and an optional hint underneath
  function field(labelText, control, { optional = false, hint = "" } = {}) {
    const wrapper = element("div", "panelField");
    const caption = element("span", "fieldLabel", labelText);
    if (optional) caption.appendChild(element("span", "optional", " (optional)"));
    wrapper.append(caption, control);
    if (hint) wrapper.appendChild(element("span", "panelHint", hint));
    const input = control.matches("input, select, textarea") ? control : control.querySelector("input, select, textarea");
    if (input && !input.getAttribute("aria-label")) input.setAttribute("aria-label", labelText);
    return wrapper;
  }

  // A text box with its label. value(): what's typed, tidied (single spaces, trimmed). maxLength: the most
  // characters it takes (titles: MAX_TITLE)
  function textField({ label, value = "", placeholder = "", optional = false, multiline = false, hint = "", disabled = false, maxLength = 0 }) {
    const input = element(multiline ? "textarea" : "input", "textInput");
    if (!multiline) input.type = "text";
    if (multiline) input.rows = 3;
    input.value = value;
    input.placeholder = placeholder;
    input.disabled = disabled;
    if (maxLength) input.maxLength = maxLength;
    return { el: field(label, input, { optional, hint }), input, value: () => input.value.replace(/\s+/g, " ").trim() };
  }

  // Amount with a Cost/Gain toggle. value(): signed number, null when blank, NaN when unreadable.
  function amountField({ label = "Amount", amount = null, optional = false } = {}) {
    const input = element("input", "amountInput");
    input.type = "text";
    input.inputMode = "decimal";
    input.placeholder = "0.00";
    if (amount !== null) input.value = Math.abs(amount).toFixed(2);

    let sign = amount !== null && amount > 0 ? 1 : -1;
    const toggle = segmented([{ key: -1, label: "− Cost" }, { key: 1, label: "+ Gain" }], sign, (key) => setSign(key));
    // Cost (-1) or Gain (1); a gain's box shows green
    function setSign(key) {
      sign = key;
      toggle.set(key);
      input.classList.toggle("positive", sign > 0); // Positive entries show green
    }
    setSign(sign);

    // Typing a leading - or + flips the toggle instead
    input.addEventListener("input", () => {
      const match = input.value.match(/^\s*([-+])/);
      if (!match) return;
      setSign(match[1] === "+" ? 1 : -1);
      input.value = input.value.replace(/^\s*[-+]/, "");
    });

    const row = element("div", "amountRow");
    row.append(input, toggle.el);
    return {
      el: field(label, row, { optional }),
      input,
      setSign,
      value() {
        if (input.value.trim() === "") return null;
        const number = readMoneyInput(input.value); // "4,50" is 4.50 (see Process Budget.js)
        return Number.isFinite(number) ? sign * Math.abs(number) : NaN;
      }
    };
  }

  // Refraction type picker. value(): "" (Auto), "❗️", "✖️", or "⭕️". onChange(key) runs when one is tapped.
  // A tiny ? next to its label shows what each type does.
  function refractionField({ value = "", allowAuto = true, optional = allowAuto, onChange = null } = {}) {
    const options = allowAuto ? [{ key: "", label: "Auto" }, ...REFRACTION_TYPES] : REFRACTION_TYPES;
    const picker = segmented(options, value || (allowAuto ? "" : "❗️"), onChange);
    const hint = allowAuto ? "Auto matches an entry that's already there, or uses Regular." : "";
    const el = field("Refraction Type", picker.el, { optional, hint });
    addFieldHelp(el, "What the refraction types do", refractionHelp(allowAuto));
    // set(key) picks a type the way a tap does (onChange runs too)
    const set = (key) => {
      picker.set(key);
      if (onChange) onChange(key);
    };
    return { el, value: () => picker.value(), set };
  }

  // What each refraction type does (the same as Home's Help, in short)
  function refractionHelp(allowAuto) {
    const list = element("ul");
    const item = (sprite, name, text) => {
      const li = element("li", "", sprite ? `${sprite} ` : "");
      li.append(element("strong", "", name), `: ${text}`);
      list.appendChild(li);
    };
    item("❗️", "Regular", "a normal cost or gain. It changes In Bank, and the tracker counts it.");
    item("✖️", "Hidden", "money spent or received outside your budget's account, like spending cash. It's a cost or gain (the day's Gains and Costs show it, and the tracker counts it), but In Bank stays the same. With an Other Account picked, that account changes by the same amount: a cost takes from it, and a gain adds to it.");
    item("⭕️", "Transfer", "money moving between your own accounts, like depositing cash. It changes In Bank, but it isn't a cost or gain, so the day's Gains and Costs leave it out, and in the tracker only the Transfers row (and rows set to count transfers) count it. With an Other Account picked, that account gets the opposite: a cost here adds to it, and a gain takes from it.");
    if (allowAuto) item("", "Auto", "uses the type of an entry with this title already on that day, or Regular if there isn't one.");
    else list.appendChild(element("li", "", "Recurring entries show these behind a ✔️ (✔️ is Regular), and connected spreadsheets' entries behind a ➕."));
    return list;
  }

  // A tiny ? button after a field's label that shows (or hides) a short explanation under the field
  let fieldHelpCount = 0;
  function addFieldHelp(fieldEl, label, content) {
    const help = element("div", "fieldHelp");
    help.id = `fieldHelp${++fieldHelpCount}`;
    help.hidden = true;
    help.appendChild(content);
    const button = element("button", "fieldHelpButton", "?");
    button.type = "button";
    button.setAttribute("aria-label", label);
    button.setAttribute("aria-controls", help.id);
    button.setAttribute("aria-expanded", "false");
    button.title = label;
    button.addEventListener("click", () => {
      help.hidden = !help.hidden;
      button.setAttribute("aria-expanded", String(!help.hidden));
    });
    fieldEl.querySelector(".fieldLabel").appendChild(button);
    fieldEl.insertBefore(help, fieldEl.children[1].nextSibling);
  }

  // The Other Account an entry moves money into or out of, shown while Hidden or Transfer is picked. It's picked on
  // its own and never changes the title: the entry is saved as "Title → Account" (withAccount in Process Budget.js).
  // Only a picked account links the entry: a title that's an account's name doesn't pick it. A Transfer changes the
  // account by the opposite of its amount (the money moved from or to In Bank), a Hidden entry by its own amount
  // (accountChange).
  // accounts: in order, [{ name, balance }] (each shows its balance today), or just names.
  // amount: the form's amountField. type(): the picked refraction type. account: picked to start.
  function accountField({ accounts = [], amount, type = () => "⭕️", account = "" }) {
    let list = [];
    let shown = false; // Hidden or Transfer is picked (see setVisible)
    const select = element("select", "selectInput accountSelect");
    const wrapper = field("Other Account", select, { optional: true });
    const hint = element("span", "panelHint");
    wrapper.appendChild(hint);
    wrapper.hidden = true;

    const accountTitled = (text) => list.find(account => cleanString(account.name) === cleanString(text))?.name || "";

    // The accounts to pick from, each with its balance; the one picked stays picked while it's still there
    function setAccounts(accounts) {
      const picked = select.value;
      list = accounts.map(account => (typeof account === "string" ? { name: account, balance: null } : account));
      select.replaceChildren(new Option("None", ""), ...list.map(({ name, balance }) =>
        new Option(typeof balance === "number" ? `${name} (${formatMoney(balance)})` : name, name)));
      select.value = accountTitled(picked);
      wrapper.hidden = !shown || list.length === 0;
      if (shown) describe();
    }
    setAccounts(accounts);

    // The hint under the picker: what the entry does to the account
    function describe() {
      const name = select.value;
      const value = amount.value();
      const isTransfer = type() === "⭕️";
      if (!name) hint.textContent = "Pick an account if this money moves into or out of it.";
      else if (value === null || Number.isNaN(value) || value === 0) {
        hint.textContent = isTransfer
          ? `A cost moves money from In Bank into ${name}, and a gain moves it back.`
          : `A cost takes from ${name}, and a gain adds to it (In Bank stays the same).`;
      } else if (isTransfer) {
        hint.textContent = value < 0 ? `Moves ${formatMoney(-value)} from In Bank into ${name}.` : `Moves ${formatMoney(value)} from ${name} into In Bank.`;
      } else {
        hint.textContent = value < 0 ? `Takes ${formatMoney(-value)} out of ${name}.` : `Adds ${formatMoney(value)} to ${name}.`;
      }
    }

    // Pick an account by name (any capitals), or none
    const pick = (name) => { select.value = accountTitled(name); };
    pick(account);

    select.addEventListener("change", describe);
    amount.el.addEventListener("input", describe);
    amount.el.addEventListener("click", describe); // The Cost / Gain buttons

    return {
      el: wrapper,
      select,
      pick,
      setAccounts,
      // Shown for Hidden and Transfer (when there are accounts to pick)
      setVisible(visible) {
        shown = visible;
        wrapper.hidden = !visible || list.length === 0;
        describe();
      },
      value: () => (wrapper.hidden ? "" : select.value)
    };
  }

  const isAccountType = (key) => key === "✖️" || key === "⭕️";

  // Date field. value(): Date, null when blank, undefined when it isn't a real date. 📅 opens the device's
  // own date picker. With the calendar on the page, tapping a day while the box is waiting fills it too.
  function dateField({ label = "Date", date = null, optional = false } = {}) {
    const input = element("input", "dateInput");
    input.type = "text";
    input.inputMode = "numeric";
    input.placeholder = datePattern(); // This device's date format, like DD/MM/YYYY
    input.translate = false;
    if (date) input.value = showDate(date);
    input.addEventListener("focus", () => setPickTarget(input));
    const control = element("div", "dateRow");
    control.append(input, datePickerButton(input, label));
    const hint = hasCalendar() ? "Type a date, tap 📅, or tap a day on the calendar." : "Type a date, or tap 📅 to pick one.";
    return {
      el: field(label, control, { optional, hint }),
      input,
      touched: () => input.dataset.touched === "1",
      value() {
        const text = input.value.trim();
        if (!text) return null;
        const parsed = parseTypedDate(text);
        return isNaN(parsed.getTime()) ? undefined : parsed;
      }
    };
  }

  // How often a recurring entry lands: "Every [number] [Days / Weeks / Months]". value(): the stored text
  // ("Every 2 Weeks"), or null when the number isn't a whole number from 1 to 999. A row with the
  // spreadsheet's Semi-Monthly keeps it as an extra choice (the 1st and 15th have no every-N version).
  const FREQUENCY_UNITS = [{ key: "days", label: "Days" }, { key: "weeks", label: "Weeks" }, { key: "months", label: "Months" }];

  function frequencyField({ value = "Every Month" } = {}) {
    const current = parseFrequency(value) || { count: 1, unit: "months" };
    const count = element("input", "frequencyCount");
    count.type = "text";
    count.inputMode = "numeric";
    count.value = String(current.count);
    count.setAttribute("aria-label", "How many days, weeks, or months");
    const unit = element("select", "selectInput frequencyUnit");
    for (const option of FREQUENCY_UNITS) unit.appendChild(new Option(option.label, option.key));
    if (current.unit === "semimonthly") unit.appendChild(new Option("1st and 15th", "semimonthly"));
    unit.value = current.unit;
    unit.setAttribute("aria-label", "Days, weeks, or months");
    const showUnit = () => { count.disabled = unit.value === "semimonthly"; };
    unit.addEventListener("change", showUnit);
    showUnit();

    const row = element("div", "frequencyRow");
    row.append(element("span", "frequencyEvery", "Every"), count, unit);
    return {
      el: field("Frequency", row, { hint: "Like every 2 weeks, every month, or every 12 months for once a year." }),
      value() {
        if (unit.value === "semimonthly") return "Semi-Monthly";
        const number = Number(count.value.trim());
        if (!Number.isInteger(number) || number < 1 || number > MAX_FREQUENCY_COUNT) return null;
        return formatFrequency({ count: number, unit: unit.value });
      }
    };
  }

  // A drop-down list of plain text options
  function selectField({ label, options, value }) {
    const select = element("select", "selectInput");
    for (const option of options) {
      const optionEl = element("option", "", option);
      optionEl.value = option;
      select.appendChild(optionEl);
    }
    select.value = value;
    return { el: field(label, select), input: select, value: () => select.value };
  }

  // An on/off choice: a pill switch (stylesheet.css .pillSwitch) and its words, which turn it on and off too
  function checkboxField({ label, checked = false, disabled = false }) {
    const wrapper = element("label", "checkboxField");
    const input = element("input", "pillSwitch");
    input.type = "checkbox";
    input.setAttribute("role", "switch");
    input.checked = checked;
    input.disabled = disabled;
    wrapper.append(input, element("span", "", label));
    return { el: wrapper, input, value: () => input.checked };
  }

  // A list of titles, one per line, each with its own buttons (like All / Costs / Gains) and an ×.
  // The tracker's aliases and the search bar use it. A comma starts the next line (so a pasted list
  // splits up), and Enter adds a line. Only the buttons pick what a line finds: a title is kept as it's
  // typed, so one like "Disney+" stays a title.
  //   items: [{ title, mode }]. options: [{ key, label }] (the first is the default for new lines).
  //   placeholder and suggestions (a datalist id) can be functions of the line's mode. onEnterEmpty: runs
  //   when Enter is pressed on an empty line.
  // Returns { el (the lines and the add button), lines, addButton, items(): [{ title, mode }] for
  // every line, blank ones too }
  function termList({ items = [], options, label, lineLabel, addLabel, placeholder = "", suggestions = null, onEnterEmpty = null }) {
    const list = element("div", "termList");
    list.setAttribute("role", "group");
    list.setAttribute("aria-label", label);
    const lines = [];
    const defaultMode = options[0].key;
    const forMode = (setting, mode) => (typeof setting === "function" ? setting(mode) : setting);
    const tidy = (text) => String(text ?? "").replace(/\s+/g, " ").trim();

    // A line goes after the line `after`, or at the end
    function addLine(item = { title: "", mode: defaultMode }, after = null) {
      const row = element("div", "termRow");
      const input = element("input", "termInput");
      input.type = "text";
      input.value = item.title;
      input.setAttribute("aria-label", lineLabel);
      const modes = segmented(options, item.mode, (mode) => showMode(mode));
      modes.el.setAttribute("aria-label", `${lineLabel}: find`);
      const remove = element("button", "panelClose termRemove", "×");
      remove.type = "button";
      remove.setAttribute("aria-label", `Remove ${lineLabel.toLowerCase()}`);
      // The buttons and × stay together, × right after the last button, when the line wraps
      const controls = element("div", "termControls");
      controls.append(modes.el, remove);
      row.append(input, controls);

      // Placeholder and suggestions for the line's button (the search bar's Tracker suggests rows)
      function showMode(mode) {
        input.placeholder = forMode(placeholder, mode);
        const listId = suggestions ? suggestions(mode) : null;
        if (listId) input.setAttribute("list", listId);
        else input.removeAttribute("list");
      }
      showMode(item.mode);

      const line = { input, modes };
      if (after) {
        lines.splice(lines.indexOf(after) + 1, 0, line);
        after.input.closest(".termRow").after(row);
      } else {
        lines.push(line);
        list.appendChild(row);
      }

      input.addEventListener("input", () => {
        if (!input.value.includes(",")) return;
        const [first, ...rest] = input.value.split(",");
        if (!input.value.replace(/,/g, "").trim()) {
          input.value = ""; // Just commas: nothing to split
          return;
        }
        input.value = first.trim();
        let last = line;
        rest.forEach((piece, i) => {
          if (!piece.trim() && i < rest.length - 1) return; // ",," leaves no empty line
          last = addLine({ title: tidy(piece), mode: defaultMode }, last);
        });
        last.input.focus();
        last.input.setSelectionRange(last.input.value.length, last.input.value.length);
      });

      // Enter starts the next line instead of sending the form
      input.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" || event.isComposing) return;
        event.preventDefault();
        if (!input.value.trim()) {
          if (onEnterEmpty) onEnterEmpty();
          return;
        }
        const next = lines[lines.indexOf(line) + 1];
        (next && !next.input.value.trim() ? next : addLine(undefined, line)).input.focus();
      });

      remove.addEventListener("click", () => {
        lines.splice(lines.indexOf(line), 1);
        row.remove();
        if (lines.length === 0) addLine();
        addButton.focus();
      });
      return line;
    }

    const addButton = element("button", "budgetButton termAdd", addLabel);
    addButton.type = "button";
    addButton.addEventListener("click", () => {
      (lines.find(line => !line.input.value.trim()) || addLine()).input.focus();
    });

    for (const item of items) addLine(item);
    if (lines.length === 0) addLine();

    const el = element("div", "termField");
    el.append(list, addButton);
    return {
      el,
      lines: list,
      addButton,
      items: () => lines.map(line => ({ title: tidy(line.input.value), mode: line.modes.value() }))
    };
  }

  // Tracker row aliases: one entry title per line, each counting All of its amounts, only Costs, or
  // only Gains.
  // aliases: [{ title, count }]. value(): [{ title, count }] (blank lines left out)
  const ALIAS_COUNTS = [{ key: "all", label: "All" }, { key: "costs", label: "Costs" }, { key: "gains", label: "Gains" }];

  function aliasField({ aliases = [], hint = "Entry titles this row counts. All counts every amount, Costs only costs, and Gains only gains." } = {}) {
    const terms = termList({
      items: aliases.map(alias => ({ title: alias.title, mode: alias.count })),
      options: ALIAS_COUNTS,
      label: "Aliases",
      lineLabel: "Alias",
      addLabel: "+ Add Alias",
      placeholder: "Entry title"
    });
    return {
      el: field("Aliases", terms.el, { optional: true, hint }),
      value: () => terms.items()
        .filter(item => cleanString(item.title))
        .map(item => ({ title: item.title, count: item.mode }))
    };
  }

  // Pill buttons where exactly one is chosen
  function segmented(options, value, onChange) {
    const group = element("div", "segmented");
    group.setAttribute("role", "radiogroup");
    let current = value;
    const buttons = options.map(option => {
      const button = element("button", "budgetButton", option.label);
      button.type = "button";
      button.setAttribute("role", "radio");
      button.addEventListener("click", () => {
        set(option.key);
        if (onChange) onChange(option.key);
      });
      group.appendChild(button);
      return [option.key, button];
    });
    // Pick one (without running onChange)
    function set(key) {
      current = key;
      for (const [optionKey, button] of buttons) button.setAttribute("aria-checked", String(optionKey === key));
    }
    set(value);
    return { el: group, value: () => current, set };
  }

  // The New Entry form's fields: title, amount (cost or gain), date, optional refraction type, and for
  // Hidden or Transfer, the Other Account it moves money into or out of (accounts: their names).
  // The calendar's New Entry panel and the Quick Entry page share it, so they always match.
  // read(): { entry: { title, amount, date, sprite } } when it's filled in right, otherwise { error }. The title
  //   carries the Other Account picked: "Title → Account" (or just the account's name when no title is typed).
  // values(): what's in it now, filled in or not: { title, amount (signed, null when blank, NaN when
  //   unreadable), sprite ("" for Auto), account ("" for none) }
  // fill({ title, amount, sprite, account }): puts these in, leaving the fields they don't have as they are
  //   (the Quick Entry page's prisms). dateEl: the date field, for a form that doesn't need one.
  // setAccounts(accounts): new balances for the Other Account list (the Quick Entry page's, after an Undo or Redo)
  function newEntryFields({ date = today, accounts = [] } = {}) {
    const title = textField({ label: "Title", placeholder: "Coffee, paycheck, gas...", maxLength: MAX_TITLE });
    const amount = amountField();
    const dateInput = dateField({ label: "Date", date });
    const account = accountField({ accounts, amount, type: () => refraction.value() });
    const refraction = refractionField({ onChange: (key) => account.setVisible(isAccountType(key)) });
    return {
      els: [title.el, amount.el, dateInput.el, refraction.el, account.el],
      dateEl: dateInput.el,
      inputs: { title: title.input, amount: amount.input },
      values: () => ({ title: title.value(), amount: amount.value(), sprite: refraction.value(), account: account.value() }),
      setAccounts: account.setAccounts,
      fill({ title: newTitle = "", amount: newAmount = null, sprite = "", account: newAccount = "" } = {}) {
        if (newTitle) title.input.value = newTitle;
        if (typeof newAmount === "number" && Number.isFinite(newAmount)) {
          amount.input.value = Math.abs(newAmount).toFixed(2);
          amount.setSign(newAmount > 0 ? 1 : -1);
        }
        if (sprite) refraction.set(sprite);
        if (newAccount) account.pick(newAccount);
        title.input.dispatchEvent(new Event("input", { bubbles: true }));
        account.setVisible(isAccountType(refraction.value())); // Shown for Hidden or Transfer
      },
      read() {
        if (title.value().includes(ACCOUNT_ARROW)) return { error: TITLE_ARROW };
        const entry = { title: withAccount(title.value(), account.value()), amount: amount.value(), date: dateInput.value(), sprite: refraction.value() };
        if (!entry.title) return { error: "Give the entry a title." };
        if (entry.amount === null || Number.isNaN(entry.amount)) return { error: "Enter an amount, like 12.50." };
        if (Math.abs(entry.amount) > MAX_AMOUNT) return { error: AMOUNT_TOO_BIG };
        if (entry.date === undefined) return { error: `That date isn't a real day. Use ${datePattern()}.` };
        entry.date = entry.date || date;
        return { entry };
      }
    };
  }

  // Buttons: [{ label, kind: "primary" | "danger" | "", type: "submit" | "button", onClick }]
  function buttonRow(buttons) {
    const row = element("div", "panelButtons");
    for (const config of buttons) {
      const button = element("button", `budgetButton ${config.kind || ""}`.trim(), config.label);
      button.type = config.type || "button";
      if (config.onClick) button.addEventListener("click", config.onClick);
      row.appendChild(button);
    }
    return row;
  }

  //#endregion

  // =====================================================================
  // #region DATE PICKING
  // =====================================================================
  // 📅 next to a date box opens the device's own date picker. And with the calendar (or History) on the
  // page, while a date box is the "pick target", tapping a day fills it in: panels (and the search box) keep
  // their date box as the target while they're open; other date boxes stop when you tap somewhere else.

  const DAY_TABLES = ".elastic-table, .historyTable"; // Tables whose days can be tapped to pick them
  let pickTarget = null;
  const hasCalendar = () => !!document.querySelector(DAY_TABLES);

  // 📅 for a typed date box: a see-through date input fills the button, so a tap lands right on it and the
  // device's picker opens (showPicker opens it on a click elsewhere on the button, where browsers allow it).
  // The picker starts on the typed date, and the picked one is written back in this device's date format.
  function datePickerButton(textInput, label = "Date") {
    const button = element("span", "budgetButton pickDay", "📅");
    button.title = "Pick a date";
    const picker = element("input", "nativeDate");
    picker.type = "date";
    picker.tabIndex = -1;
    picker.setAttribute("aria-label", `Pick the ${label.toLowerCase()}`);
    button.appendChild(picker);

    const startOnTyped = () => {
      const typed = parseTypedDate(textInput.value);
      picker.value = formatToYMD(isNaN(typed.getTime()) ? today : typed);
    };
    button.addEventListener("pointerdown", startOnTyped);
    button.addEventListener("click", (event) => {
      startOnTyped();
      if (typeof picker.showPicker !== "function") return;
      try {
        picker.showPicker();
        event.preventDefault();
      } catch (e) {} // Then the tap on the date input itself opens it
    });
    picker.addEventListener("change", () => {
      if (!picker.value) return;
      textInput.value = showDate(createSafeMidnight(picker.value, true));
      textInput.dispatchEvent(new Event("input", { bubbles: true }));
      textInput.dispatchEvent(new Event("change", { bubbles: true }));
    });
    return button;
  }

  // The date box a calendar tap fills: it glows, and the calendar gets a dashed outline, so it's clear
  // tapping a day works
  function setPickTarget(input) {
    if (pickTarget) pickTarget.classList.remove("isPickTarget");
    pickTarget = input && input.isConnected && !input.closest(".isClosing") ? input : null;
    if (pickTarget) pickTarget.classList.add("isPickTarget");
    document.body.classList.toggle("datePicking", !!pickTarget && hasCalendar());
  }

  // Is a date box waiting for a day to be tapped?
  function datePickActive() {
    return !!pickTarget && pickTarget.isConnected && hasCalendar();
  }

  // A calendar day was tapped while picking
  function pickDate(date, cellEl) {
    if (!datePickActive()) return false;
    const input = pickTarget;
    input.value = showDate(date);
    input.dataset.touched = "1";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    if (cellEl) {
      cellEl.classList.remove("pickedFlash");
      void cellEl.offsetWidth; // Restart the flash animation
      cellEl.classList.add("pickedFlash");
      setTimeout(() => cellEl.classList.remove("pickedFlash"), 750);
    }
    // e.g. search From -> To
    const next = input.dataset.nextPick && document.getElementById(input.dataset.nextPick);
    if (next && !next.value.trim()) setPickTarget(next);
    return true;
  }

  document.addEventListener("input", (event) => {
    if (event.target.matches && event.target.matches("input.dateInput")) event.target.dataset.touched = "1";
  });

  document.addEventListener("pointerdown", (event) => {
    if (!pickTarget) return;
    if (event.target.closest(DAY_TABLES)) return;
    const owner = pickTarget.closest(".budgetPanel, .searchBox");
    if (owner) return; // Open panels (and the search box) keep picking
    setPickTarget(null);
  }, true);

  //#endregion

  // =====================================================================
  // #region ENTRY LINES + TOASTS
  // =====================================================================

  // One line of a day cell: the date (as people read it: the caller passes it shown), a system line (In
  // Bank, Costs, Gains), or an entry. Entries with a positive amount show green.
  // A browser translating the page leaves entries, amounts, and dates as they are (they're the person's
  // own words and numbers); only the budget's own words, like In Bank, get translated.
  function renderEntryLine(line, lineIndex) {
    if (lineIndex === 0) return noTranslate(element("div", "lineDate", line));
    const parts = getParts(line);
    const amount = parseAmount(parts[1]);
    if (isSystemLine(parts[0])) {
      const el = element("div", "lineSystem");
      if (amount < 0) el.classList.add("negative");
      // "✅ $812.40 Lowest: 11/14": the day shows in this device's date format
      const words = parts.slice(2).join(" ");
      // The day's In Bank can be tapped on a zoomed day to set it (Calendar Page.js openInBankOptions)
      if (lineIndex === 1 && words === "In Bank") el.classList.add("lineInBank");
      const day = words.match(/^(.*?)(\d{1,2}\/\d{1,2})$/);
      el.append(noTranslate(element("span", "", `${parts[0]} ${parts[1]} `)), day ? day[1] : words);
      if (day) el.appendChild(noTranslate(element("span", "", showStoredDate(day[2]))));
      return el;
    }
    const el = noTranslate(element("div", "lineEntry", line));
    el.dataset.line = lineIndex;
    if (amount > 0) el.classList.add("positive");
    return el;
  }

  // A table's red-orange bar under its column titles runs as one gradient across the whole row (see .dataTable
  // th in budgetStyle.css): each title gets the row's width and its own spot in it. Measured from the layout
  // (offsetLeft and offsetWidth, which a zoom animation's transform doesn't change), and again whenever the
  // table changes size. A table can be passed in before it's on the page.
  const headerBarObserver = typeof ResizeObserver === "function"
    ? new ResizeObserver(entries => entries.forEach(entry => placeHeaderBar(entry.target)))
    : null;

  // Measure one table's column titles and give each its piece of the bar
  function placeHeaderBar(table) {
    if (!table.isConnected) {
      headerBarObserver?.unobserve(table); // Gone from the page (redrawn)
      return;
    }
    const titles = [...(table.tHead?.rows[0]?.cells || [])];
    if (titles.length === 0) return;
    const start = titles[0].offsetLeft;
    const last = titles[titles.length - 1];
    const width = last.offsetLeft + last.offsetWidth - start;
    for (const title of titles) {
      title.style.setProperty("--barWidth", `${width}px`);
      title.style.setProperty("--barX", `${start - title.offsetLeft}px`);
    }
  }

  // One bar across a table's column titles, placed now and whenever the table changes size
  function spanHeaderBar(table) {
    if (headerBarObserver) headerBarObserver.observe(table);
    else requestAnimationFrame(() => placeHeaderBar(table));
    return table;
  }

  // Kept out of the browser's translation: entries, names, amounts, and dates show as they are
  function noTranslate(el) {
    el.translate = false;
    return el;
  }

  // Notes at the bottom of the screen. Two at once stack (newest at the bottom) instead of one covering
  // the other. A longer note stays longer, so there's time to read it (4.5 to 12 seconds).
  let toastStack = null;
  function showToast(message, isWarning = false) {
    if (!toastStack || !toastStack.isConnected) {
      toastStack = element("div", "toastStack");
      document.body.appendChild(toastStack);
    }
    const toast = element("div", `budgetToast${isWarning ? " warning" : ""}`, message);
    toast.setAttribute("role", "status");
    toastStack.appendChild(toast);
    const shownMs = Math.min(12000, Math.max(4500, String(message).length * 60));
    setTimeout(() => toast.classList.add("leaving"), shownMs);
    setTimeout(() => toast.remove(), shownMs + 500);
  }

  //#endregion

  return {
    REFRACTION_TYPES,
    RECURRING_SPRITES,
    isSystemLine,
    openPanel,
    closePanel,
    closeAllPanels,
    submit,
    warnIfUnsaved,
    element,
    field,
    textField,
    amountField,
    refractionField,
    addFieldHelp,
    dateField,
    selectField,
    checkboxField,
    frequencyField,
    accountField,
    isAccountType,
    termList,
    aliasField,
    segmented,
    newEntryFields,
    buttonRow,
    setPickTarget,
    datePickerButton,
    datePickActive,
    pickDate,
    renderEntryLine,
    noTranslate,
    spanHeaderBar,
    showToast
  };
})();
