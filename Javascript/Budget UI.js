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
  const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Open a panel. size "large" goes into the page's #panelSlot (right above the calendar/table),
  // "small" floats next to its origin. build(form, panel) adds the fields and buttons.
  // closable: false leaves out the × and Escape (for a page that is just the panel, like Quick Entry).
  function openPanel({ origin, size = "large", title, build, closable = true }) {
    closePanel(true);

    const panel = element("section", `budgetPanel ${size}`);
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
    form.insertBefore(error, form.querySelector(".panelButtons"));
    closeButton.addEventListener("click", () => closePanel());

    if (size === "large") {
      (document.getElementById("panelSlot") || document.querySelector("main") || document.body).appendChild(panel);
    } else {
      document.body.appendChild(panel);
      positionNear(panel, origin);
    }
    animateFromOrigin(panel, origin);
    if (size === "large") panel.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" });

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

  function closePanel(immediate = false) {
    const api = currentPanel;
    if (!api) return;
    currentPanel = null;
    if (pickTarget && api.panel.contains(pickTarget)) setPickTarget(null);

    const panel = api.panel;
    panel.classList.add("isClosing");
    panel.inert = true; // A closing panel can't be clicked, typed in, or picked into
    if (immediate || prefersReducedMotion() || !api.origin || !api.origin.isConnected || !panel.animate) {
      panel.remove();
      return;
    }
    animateToOrigin(panel, api.origin);
    setTimeout(() => panel.remove(), 210); // Right after the close animation
  }

  // The panel grows out of its origin's spot on screen
  function animateFromOrigin(panel, origin) {
    if (!origin || prefersReducedMotion() || !panel.animate) return;
    panel.animate([
      { transformOrigin: "0 0", transform: originTransform(panel, origin), opacity: 0.35 },
      { transformOrigin: "0 0", transform: "none", opacity: 1 }
    ], { duration: 320, easing: "cubic-bezier(0.25, 0.8, 0.25, 1)" });
  }

  function animateToOrigin(panel, origin) {
    return panel.animate([
      { transformOrigin: "0 0", transform: "none", opacity: 1 },
      { transformOrigin: "0 0", transform: originTransform(panel, origin), opacity: 0 }
    ], { duration: 200, easing: "ease-in", fill: "forwards" });
  }

  function originTransform(panel, origin) {
    const from = origin.getBoundingClientRect();
    const to = panel.getBoundingClientRect();
    const scaleX = Math.max(from.width / (to.width || 1), 0.05);
    const scaleY = Math.max(from.height / (to.height || 1), 0.05);
    return `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${scaleX}, ${scaleY})`;
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

  function warnIfUnsaved(result) {
    if (result && result.ok && result.saved === false) {
      showToast("Couldn't reach the server, so that change isn't saved yet. It'll retry with your next change.", true);
    }
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && currentPanel && currentPanel.closable) closePanel();
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

  function textField({ label, value = "", placeholder = "", optional = false, multiline = false, hint = "", disabled = false }) {
    const input = element(multiline ? "textarea" : "input", "textInput");
    if (!multiline) input.type = "text";
    if (multiline) input.rows = 3;
    input.value = value;
    input.placeholder = placeholder;
    input.disabled = disabled;
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
        const text = input.value.replace(/[$,\s]/g, "");
        if (text === "") return null;
        const number = Number(text);
        return Number.isFinite(number) ? sign * Math.abs(number) : NaN;
      }
    };
  }

  // Refraction type picker. value(): "" (Auto), "❗️", "✖️", or "⭕️". onChange(key) runs when one is tapped.
  function refractionField({ value = "", allowAuto = true, optional = allowAuto, onChange = null } = {}) {
    const options = allowAuto ? [{ key: "", label: "Auto" }, ...REFRACTION_TYPES] : REFRACTION_TYPES;
    const picker = segmented(options, value || (allowAuto ? "" : "❗️"), onChange);
    const hint = allowAuto ? "Auto matches an entry that's already there, or uses Regular." : "";
    return { el: field("Refraction Type", picker.el, { optional, hint }), value: () => picker.value() };
  }

  // The Other Account an entry moves money into or out of, shown while Hidden or Transfer is picked.
  // An entry changes an account when it's titled with the account's name, so picking one fills in the
  // title (and typing an account's name picks it). The account gets the opposite of the entry's amount.
  // accounts: names in order. title, amount: the form's textField and amountField.
  function accountField({ accounts = [], title, amount }) {
    const select = element("select", "selectInput accountSelect");
    select.appendChild(new Option("None", ""));
    for (const name of accounts) select.appendChild(new Option(name, name));
    const wrapper = field("Other Account", select, { optional: true });
    const hint = element("span", "panelHint");
    wrapper.appendChild(hint);
    wrapper.hidden = true;

    const accountTitled = (text) => accounts.find(name => cleanString(name) === cleanString(text)) || "";
    function describe() {
      const name = select.value;
      const value = amount.value();
      if (!name) hint.textContent = "Pick an account if this money moves into or out of it.";
      else if (value === null || Number.isNaN(value) || value === 0) hint.textContent = `A cost adds to ${name}, and a gain takes from it.`;
      else if (value < 0) hint.textContent = `Adds ${formatMoney(-value)} to ${name}.`;
      else hint.textContent = `Takes ${formatMoney(value)} out of ${name}.`;
    }

    select.addEventListener("change", () => {
      if (select.value) {
        title.input.value = select.value;
      } else if (accountTitled(title.input.value)) {
        // Titled with an account's name, it would still change that account
        title.input.value = "";
        title.input.focus();
      }
      describe();
    });
    title.input.addEventListener("input", () => {
      select.value = accountTitled(title.input.value);
      describe();
    });
    amount.el.addEventListener("input", describe);
    amount.el.addEventListener("click", describe); // The Cost / Gain buttons

    return {
      el: wrapper,
      select,
      // Shown for Hidden and Transfer (when there are accounts to pick)
      setVisible(visible) {
        wrapper.hidden = !visible || accounts.length === 0;
        select.value = accountTitled(title.input.value);
        describe();
      },
      value: () => (wrapper.hidden ? "" : select.value)
    };
  }

  const isAccountType = (key) => key === "✖️" || key === "⭕️";

  // Date field. value(): Date, null when blank, undefined when it isn't a real date.
  function dateField({ label = "Date", date = null, optional = false } = {}) {
    const input = element("input", "dateInput");
    input.type = "text";
    input.inputMode = "numeric";
    input.placeholder = "MM/DD/YYYY";
    if (date) input.value = formatToMMDDYYYY(date);
    input.addEventListener("focus", () => setPickTarget(input));
    const hint = hasCalendar() ? "Type a date, or tap a day on the calendar." : "";
    return {
      el: field(label, input, { optional, hint }),
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

  function checkboxField({ label, checked = false, disabled = false }) {
    const wrapper = element("label", "checkboxField");
    const input = element("input");
    input.type = "checkbox";
    input.checked = checked;
    input.disabled = disabled;
    wrapper.append(input, element("span", "", label));
    return { el: wrapper, input, value: () => input.checked };
  }

  // A list of titles, one per line, each with its own buttons (like All / Costs / Gains) and an ×.
  // The tracker's aliases and the search bar use it. A comma starts the next line (so a pasted list
  // splits up), Enter adds a line, and a title typed with an ending (rent-, paycheck+) picks its button.
  //   items: [{ title, mode }]. options: [{ key, label }] (the first is the default for new lines).
  //   endings: { "-": mode, ... }. placeholder and suggestions (a datalist id) can be functions of the
  //   line's mode. onEnterEmpty: runs when Enter is pressed on an empty line.
  // Returns { el (the lines and the add button), lines, addButton, items(): [{ title, mode }] for
  // every line, blank ones too }
  function termList({ items = [], options, endings = {}, label, lineLabel, addLabel, placeholder = "", suggestions = null, onEnterEmpty = null }) {
    const list = element("div", "termList");
    list.setAttribute("role", "group");
    list.setAttribute("aria-label", label);
    const lines = [];
    const defaultMode = options[0].key;
    const forMode = (setting, mode) => (typeof setting === "function" ? setting(mode) : setting);

    // "rent-" -> { title: "rent", mode: endings["-"], ended: true }; without an ending, the line keeps its mode
    const readTyped = (text, mode) => {
      const trimmed = String(text ?? "").replace(/\s+/g, " ").trim();
      const ending = trimmed.slice(-1);
      if (ending && Object.prototype.hasOwnProperty.call(endings, ending)) {
        return { title: trimmed.slice(0, -1).trim(), mode: endings[ending], ended: true };
      }
      return { title: trimmed, mode, ended: false };
    };

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
      row.append(input, modes.el, remove);

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

      const readEnding = () => {
        const typed = readTyped(input.value, modes.value());
        if (!typed.ended) return;
        input.value = typed.title;
        modes.set(typed.mode);
        showMode(typed.mode);
      };
      input.addEventListener("change", readEnding);

      input.addEventListener("input", () => {
        if (!input.value.includes(",")) return;
        const [first, ...rest] = input.value.split(",");
        if (!input.value.replace(/,/g, "").trim()) {
          input.value = ""; // Just commas: nothing to split
          return;
        }
        input.value = first.trim();
        readEnding();
        let last = line;
        rest.forEach((piece, i) => {
          if (!piece.trim() && i < rest.length - 1) return; // ",," leaves no empty line
          last = addLine(readTyped(piece, defaultMode), last);
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
        readEnding();
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
      items: () => lines.map(line => {
        const { title, mode } = readTyped(line.input.value, line.modes.value());
        return { title, mode };
      })
    };
  }

  // Tracker row aliases: one entry title per line, each counting All of its amounts, only Costs, or
  // only Gains (rent-, paycheck+, and atm= pick them too).
  // aliases: [{ title, count }]. value(): [{ title, count }] (blank lines left out)
  const ALIAS_COUNTS = [{ key: "all", label: "All" }, { key: "costs", label: "Costs" }, { key: "gains", label: "Gains" }];

  function aliasField({ aliases = [], hint = "Entry titles this row counts. All counts every amount, Costs only costs, and Gains only gains." } = {}) {
    const terms = termList({
      items: aliases.map(alias => ({ title: alias.title, mode: alias.count })),
      options: ALIAS_COUNTS,
      endings: { "-": "costs", "+": "gains", "=": "all" },
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
  // read(): { entry: { title, amount, date, sprite } } when it's filled in right, otherwise { error }
  function newEntryFields({ date = today, accounts = [] } = {}) {
    const title = textField({ label: "Title", placeholder: "Coffee, paycheck, gas..." });
    const amount = amountField();
    const dateInput = dateField({ label: "Date", date });
    const account = accountField({ accounts, title, amount });
    const refraction = refractionField({ onChange: (key) => account.setVisible(isAccountType(key)) });
    return {
      els: [title.el, amount.el, dateInput.el, refraction.el, account.el],
      read() {
        const entry = { title: title.value(), amount: amount.value(), date: dateInput.value(), sprite: refraction.value() };
        if (!entry.title) return { error: "Give the entry a title." };
        if (entry.amount === null || Number.isNaN(entry.amount)) return { error: "Enter an amount, like 12.50." };
        if (entry.date === undefined) return { error: "That date isn't a real day. Use MM/DD/YYYY." };
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
  // While a date field is the "pick target", tapping a calendar day fills it in. Panels keep
  // their date field as the target while they're open; other date fields (the search bar)
  // stop picking when you tap somewhere else.

  let pickTarget = null;
  const hasCalendar = () => !!document.querySelector(".elastic-table");

  function setPickTarget(input) {
    if (pickTarget) pickTarget.classList.remove("isPickTarget");
    pickTarget = input && input.isConnected && !input.closest(".isClosing") ? input : null;
    if (pickTarget) pickTarget.classList.add("isPickTarget");
    document.body.classList.toggle("datePicking", !!pickTarget && hasCalendar());
  }

  function datePickActive() {
    return !!pickTarget && pickTarget.isConnected && hasCalendar();
  }

  // A calendar day was tapped while picking
  function pickDate(date, cellEl) {
    if (!datePickActive()) return false;
    const input = pickTarget;
    input.value = formatToMMDDYYYY(date);
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
    if (event.target.closest(".elastic-table")) return;
    const owner = pickTarget.closest(".budgetPanel, .searchBar");
    if (owner && owner.contains(event.target)) return;
    if (owner && owner.classList.contains("budgetPanel")) return; // Open panels keep picking
    setPickTarget(null);
  }, true);

  //#endregion

  // =====================================================================
  // #region ENTRY LINES + TOASTS
  // =====================================================================

  // One line of a day cell: the date, a system line (In Bank, Costs, Gains), or an entry.
  // Entries with a positive amount show green.
  function renderEntryLine(line, lineIndex) {
    const el = element("div", "", line);
    if (lineIndex === 0) {
      el.className = "lineDate";
      return el;
    }
    const parts = getParts(line);
    const amount = parseAmount(parts[1]);
    if (isSystemLine(parts[0])) {
      el.className = "lineSystem";
      if (amount < 0) el.classList.add("negative");
    } else {
      el.className = "lineEntry";
      el.dataset.line = lineIndex;
      if (amount > 0) el.classList.add("positive");
    }
    return el;
  }

  function showToast(message, isWarning = false) {
    const toast = element("div", `budgetToast${isWarning ? " warning" : ""}`, message);
    toast.setAttribute("role", "status");
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add("leaving"), 4500);
    setTimeout(() => toast.remove(), 5000);
  }

  //#endregion

  return {
    REFRACTION_TYPES,
    RECURRING_SPRITES,
    isSystemLine,
    openPanel,
    closePanel,
    submit,
    warnIfUnsaved,
    element,
    field,
    textField,
    amountField,
    refractionField,
    dateField,
    selectField,
    checkboxField,
    accountField,
    isAccountType,
    termList,
    aliasField,
    segmented,
    newEntryFields,
    buttonRow,
    setPickTarget,
    datePickActive,
    pickDate,
    renderEntryLine,
    showToast
  };
})();
