// Budget UI: shared pieces for the budget pages. Panels that expand out of the button or entry
// that opened them (like a cell zoom), form fields, the refraction type picker, date fields
// (type a date, pick one with the calendar button, or tap a day on the calendar), an entry's options (Home's and
// History's), toasts, and entry line rendering.

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

    api.inline = inline;
    build(form, api);
    const buttons = form.querySelector(".panelButtons");
    if (buttons) buttons.parentNode.insertBefore(error, buttons);
    else form.append(error);
    closeButton.addEventListener("click", () => closePanel());

    // Floating panels go in the screen layer (Layout.js): each opens on the part of the page that's on the screen, then
    // stays put on the page, which can be scrolled and pinch-zoomed with it (the layer isn't in the page's
    // #transitionContainer, which is transformed). A small one is placed again when its size changes (its error
    // showing, say), so it never runs past the screen's bottom.
    if (inline) {
      (document.getElementById("panelSlot") || document.querySelector("main") || document.body).appendChild(panel);
    } else {
      onScreen(panel);
      if (size === "small") {
        positionNear(panel, origin);
        if (typeof ResizeObserver === "function") {
          api.resizes = new ResizeObserver(() => { if (panel.isConnected && !panel.classList.contains("isClosing")) positionNear(panel, api.origin); });
          api.resizes.observe(panel);
        }
      }
    }
    // It grows out of what opened it (the same zoom as Help and Search: FloatingWindows in Layout.js)
    window.FloatingWindows?.zoomOpen(panel, origin);
    if (inline) panel.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" });

    // Date fields fill from calendar taps right away (no keyboard needed on phones)
    const firstDate = form.querySelector("input.dateInput");
    if (firstDate && hasCalendar()) setPickTarget(firstDate);
    // (A computer starts in the first box, except one marked data-skip-focus, like an entry's Title, which a stray key
    // would rename)
    if (window.matchMedia("(pointer: fine)").matches) {
      const firstField = form.querySelector("input:not([type=checkbox]):not(:disabled):not([data-skip-focus]), textarea:not(:disabled), select:not(:disabled)");
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
    api.resizes?.disconnect();
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

  // Into the screen layer (Layout.js), or the page's <body> without one. notes: the layer for notes, which always stays on
  // the screen (Layout.js's ScreenLayer.notes)
  function onScreen(el, notes = false) {
    const layer = window.ScreenLayer;
    (layer ? (notes && layer.notes) || layer.element : document.body).appendChild(el);
    return el;
  }

  // Small panels sit just below their origin (or above it near the bottom of the screen), kept on the screen: in the
  // screen layer's own pixels, placed again when the screen moves (like a phone's keyboard coming up). The panel's size
  // is its layout's (offsetWidth and offsetHeight), not its box on the screen, which is still small while it zooms open.
  function positionNear(panel, origin) {
    const margin = 8;
    const layer = window.ScreenLayer;
    const area = layer ? layer.size() : { width: document.documentElement.clientWidth, height: window.innerHeight };
    const box = { left: panel.offsetLeft, top: panel.offsetTop, width: panel.offsetWidth, height: panel.offsetHeight };
    // (An origin that's gone, like a redrawn day's entry, leaves the panel where it is, kept on the screen)
    const rect = !origin || !origin.isConnected ? { ...box, bottom: box.top - margin, top: box.top - margin, width: box.width }
      : layer ? layer.rectOf(origin) : origin.getBoundingClientRect();
    let left = rect.left + rect.width / 2 - box.width / 2;
    left = Math.max(margin, Math.min(left, area.width - box.width - margin));
    let top = rect.bottom + margin;
    if (top + box.height > area.height - margin) {
      top = rect.top - box.height - margin > margin ? rect.top - box.height - margin : Math.max(margin, area.height - box.height - margin);
    }
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  }

  // The open small panel follows the screen (it stays by its origin while that's still there)
  window.ScreenLayer?.onChange(() => {
    if (currentPanel && currentPanel.panel.classList.contains("small") && currentPanel.origin) positionNear(currentPanel.panel, currentPanel.origin);
  });

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

  // Leaving the page closes the floating panels, any date box's waiting for a day, and notes, right away, so the
  // browser's Back button never brings the page back with them still up (see FloatingWindows in Layout.js). A panel
  // that's part of the page (inline: the Quick Entry page's form) stays, so coming back (Back, or a phone closing the
  // page it opened over this one) finds it there.
  window.FloatingWindows?.closeOnPageExit(() => {
    while (currentPanel && !currentPanel.inline) closePanel(true);
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

  // Amount with a Cost/Gain toggle (or another pair of names for the two signs: BALANCE_SIGNS for a balance, which
  // starts on + instead). It's typed like a cash register (cashRegister below), and an amount of 0 shows as a blank
  // box with 0.00 as its hint. value(): signed number, null when blank (callers count that as 0), NaN when unreadable.
  // An entry's amount can be a % of the Other Account picked instead (see PERCENT_MARK in Process Budget.js): a $ / %
  // switch shows while the account field allows it (setPercentAllowed; never with allowPercent false, like for a day
  // that passed), and percent starts it on % (signed). isPercent(): % is picked. percent(): the signed percent typed,
  // null when blank, NaN when unreadable.
  const ENTRY_SIGNS = ["− Cost", "+ Gain"];
  const BALANCE_SIGNS = ["− Negative", "+ Positive"];

  function amountField({ label = "Amount", amount = null, percent = null, allowPercent = true, optional = false, hint = "", signs = ENTRY_SIGNS, startSign = signs === ENTRY_SIGNS ? -1 : 1 } = {}) {
    const input = element("input", "amountInput");
    input.type = "text";
    input.placeholder = "0.00";
    input.autocomplete = "off";
    if (amount !== null && Math.round(amount * 100) !== 0) input.value = Math.abs(amount).toFixed(2);

    let sign = amount !== null && Math.round(amount * 100) !== 0 ? Math.sign(amount) : startSign;
    if (percent) sign = Math.sign(percent);
    const toggle = segmented([{ key: -1, label: signs[0] }, { key: 1, label: signs[1] }], sign, (key) => setSign(key));
    const percentInput = element("input", "amountInput percentInput");
    // Cost (-1) or Gain (1); a gain's box shows green
    function setSign(key) {
      sign = key;
      toggle.set(key);
      input.classList.toggle("positive", sign > 0); // Positive entries show green
      percentInput.classList.toggle("positive", sign > 0);
    }
    setSign(sign);
    cashRegister(input, setSign); // Typing - or + flips the toggle instead

    // The % box: typed as it reads ("3", "12.5"), with - or + flipping the toggle too
    percentInput.type = "text";
    percentInput.inputMode = "decimal";
    percentInput.placeholder = "0%";
    percentInput.autocomplete = "off";
    percentInput.setAttribute("aria-label", "Percent");
    if (percent) percentInput.value = String(Math.abs(percent));
    percentInput.addEventListener("input", (event) => {
      if (event.isComposing) return;
      const typedSigns = percentInput.value.match(/[-+]/g);
      if (typedSigns) setSign(typedSigns[typedSigns.length - 1] === "+" ? 1 : -1);
      const [whole, ...rest] = percentInput.value.replace(/,/g, ".").replace(/[^\d.]/g, "").split(".");
      percentInput.value = (rest.length > 0 ? `${whole}.${rest.join("").slice(0, 2)}` : whole).slice(0, 8);
    });
    // $ or % (picked), shown as % only while the switch is allowed
    let unit = percent ? "%" : "$";
    const unitToggle = segmented([{ key: "$", label: "$" }, { key: "%", label: "%" }], unit, (key) => setUnit(key));
    unitToggle.el.classList.add("unitToggle");
    unitToggle.el.setAttribute("aria-label", "Dollars or a percent of the Other Account");
    unitToggle.el.hidden = true;
    const isPercent = () => unit === "%" && !unitToggle.el.hidden;
    function showUnit() {
      input.hidden = isPercent();
      percentInput.hidden = !isPercent();
    }
    function setUnit(key) {
      unit = key;
      unitToggle.set(key);
      showUnit();
    }
    showUnit();

    const row = element("div", "amountRow");
    row.append(unitToggle.el, input, percentInput, toggle.el);
    return {
      el: field(label, row, { optional, hint }),
      input,
      setSign,
      value() {
        if (input.value.trim() === "") return null;
        const number = readMoneyInput(input.value); // "4,50" is 4.50 (see Process Budget.js)
        return Number.isFinite(number) ? sign * Math.abs(number) : NaN;
      },
      isPercent,
      percentShown: () => !unitToggle.el.hidden,
      percent() {
        if (percentInput.value.trim() === "") return null;
        const number = Number(percentInput.value);
        return Number.isFinite(number) ? sign * Math.abs(number) : NaN;
      },
      // A % to put in (signed), picking %; null empties the % box
      setPercent(value) {
        percentInput.value = value ? String(Math.abs(value)) : "";
        if (!value) return;
        setSign(value > 0 ? 1 : -1);
        setUnit("%");
      },
      // The $ / % switch shows (allowed) or not (the amount is in $ then)
      setPercentAllowed(allowed) {
        unitToggle.el.hidden = !allowed || !allowPercent;
        showUnit();
      }
    };
  }

  // An amount field's % for a change, checked: { percent } (null when it's on $), or { error }
  function readPercentField(amount) {
    if (!amount.isPercent()) return { percent: null };
    const percent = amount.percent();
    if (percent === null || percent === 0) return { error: "Enter the percent, like 3 or 12.5." };
    if (Number.isNaN(percent)) return { error: "Enter the percent as a number, like 3 or 12.5." };
    if (Math.abs(percent) > MAX_PERCENT) return { error: `A percent can be up to ${MAX_PERCENT}%.` };
    return { percent };
  }

  // A money box typed like a cash register: digits fill in from the cents, so the decimal point never needs typing
  // ("5" is 0.05, "1234" is 12.34, and each digit after moves it along). A pasted or filled-in amount ("12.50",
  // "$1,200") is read as it is. Nothing but zero shows as a blank box. A - or + typed anywhere goes to onSign(-1 or
  // 1) instead (a box with no sign of its own just drops it). Tapping into a box with an amount in it selects it,
  // so typing replaces it. A keyboard still putting a character together (composing) is left to finish first.
  const MAX_DIGITS = 12; // $1,000,000,000.00
  function cashRegister(input, onSign = null) {
    input.inputMode = "numeric";
    const digits = (text) => String(text).replace(/\D/g, "").replace(/^0+/, "").slice(0, MAX_DIGITS);
    const tidy = (inputType = "") => {
      const typedSigns = input.value.match(/[-+]/g);
      if (typedSigns && onSign) onSign(typedSigns[typedSigns.length - 1] === "+" ? 1 : -1);
      const text = input.value.replace(/[-+]/g, "");
      let cents = Number(digits(text) || 0);
      if (/^insert(FromPaste|FromDrop|ReplacementText)$/.test(inputType)) {
        const pasted = readMoneyInput(text);
        if (Number.isFinite(pasted)) cents = Math.round(Math.abs(pasted) * 100);
      }
      input.value = cents ? (cents / 100).toFixed(2) : "";
      try { input.setSelectionRange(input.value.length, input.value.length); } catch (e) {}
    };
    input.addEventListener("input", (event) => {
      if (!event.isComposing) tidy(event.inputType);
    });
    input.addEventListener("compositionend", () => tidy());
    input.addEventListener("focus", () => {
      if (!input.value) return;
      requestAnimationFrame(() => {
        try { if (document.activeElement === input) input.setSelectionRange(0, input.value.length); } catch (e) {}
      });
    });
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

  // Buttons where exactly one is picked (like segmented's), each with its words and, when it has one, a second line under
  // them (an account's balance). options: [{ key, label, detail (the second line, or none), negative (the detail is below
  // $0, so it's red), own (the person's words, kept out of the browser's translation) }]. onChange(key) runs when one is
  // tapped. set(key) picks one (without onChange); setOptions(options) puts in new ones, keeping the pick.
  function choiceList(options, value, onChange, label = "") {
    const group = element("div", "choiceList");
    group.setAttribute("role", "radiogroup");
    if (label) group.setAttribute("aria-label", label);
    let current = value;
    let buttons = [];
    function set(key) {
      current = key;
      for (const [optionKey, button] of buttons) button.setAttribute("aria-checked", String(optionKey === key));
    }
    function setOptions(list) {
      buttons = list.map(option => {
        const button = element("button", "budgetButton choice");
        button.type = "button";
        button.setAttribute("role", "radio");
        const name = element("span", "choiceName", option.label);
        button.appendChild(option.own ? noTranslate(name) : name);
        if (option.detail) button.appendChild(noTranslate(element("span", `choiceDetail${option.negative ? " negative" : ""}`, option.detail)));
        button.addEventListener("click", () => {
          set(option.key);
          if (onChange) onChange(option.key);
        });
        return [option.key, button];
      });
      group.replaceChildren(...buttons.map(([, button]) => button));
      set(current);
    }
    setOptions(options);
    return { el: group, value: () => current, set, setOptions };
  }

  // An Other Account in a choiceList: its name, with its balance today under it (and the most it can hold, when it has a
  // max: "$500.00/$2000.00"), or just its name when there's no balance to show (Quick Entry with balances off)
  function accountChoice({ name, balance = null, max = null }, key = name) {
    const hasBalance = typeof balance === "number";
    const detail = hasBalance ? formatMoney(balance) + (max ? `/${formatMoney(max)}` : "") : "";
    return { key, label: name, own: true, detail, negative: hasBalance && balance < 0 };
  }

  // A dropdown for choices with a second line (an Other Account's balance, see accountChoice), which a select box can't
  // show: a box with the picked one in it and, under it while it's open, the list of them, each its words over its
  // second line. A tap or a click (or Enter, Space, or an arrow key) opens it, and a tap, Enter, or Space picks;
  // Escape, Tab, or a tap anywhere else closes it, and typing a name's first letters moves to it. options, onChange,
  // set, and setOptions work like choiceList's, and a pick (any way) sends a "pick" event from el too.
  let dropdownCount = 0;
  function dropdownList(options, value, onChange, label = "") {
    const wrap = element("div", "dropdown");
    const box = element("button", "dropdownBox");
    box.type = "button";
    box.setAttribute("role", "combobox");
    box.setAttribute("aria-haspopup", "listbox");
    box.setAttribute("aria-expanded", "false");
    const list = element("ul", "pickerList dropdownList");
    list.id = `dropdownList${++dropdownCount}`;
    list.setAttribute("role", "listbox");
    list.hidden = true;
    box.setAttribute("aria-controls", list.id);
    if (label) {
      box.setAttribute("aria-label", label);
      list.setAttribute("aria-label", label);
    }
    wrap.append(box, list);
    let current = value;
    let choices = [];
    let active = -1;
    let typed = "";
    let typedAt = 0;

    // A choice's words, over its second line (red below $0)
    const lines = (option) => {
      const name = element("span", "choiceName", option.label);
      const parts = [option.own ? noTranslate(name) : name];
      if (option.detail) parts.push(noTranslate(element("span", `choiceDetail${option.negative ? " negative" : ""}`, option.detail)));
      return parts;
    };
    const mark = () => {
      [...list.children].forEach((item, i) => item.classList.toggle("isActive", i === active));
      const item = list.children[active];
      if (item) box.setAttribute("aria-activedescendant", item.id);
      else box.removeAttribute("aria-activedescendant");
      if (item) item.scrollIntoView({ block: "nearest" });
    };
    const outside = (event) => {
      if (!wrap.contains(event.target)) close();
    };
    const open = () => {
      if (!list.hidden || choices.length === 0) return;
      list.hidden = false;
      box.setAttribute("aria-expanded", "true");
      active = Math.max(0, choices.findIndex(choice => choice.key === current));
      mark();
      document.addEventListener("pointerdown", outside, true);
    };
    function close() {
      if (list.hidden) return;
      list.hidden = true;
      box.setAttribute("aria-expanded", "false");
      box.removeAttribute("aria-activedescendant");
      document.removeEventListener("pointerdown", outside, true);
    }
    const choose = (index) => {
      const option = choices[index];
      close();
      box.focus({ preventScroll: true });
      if (!option) return;
      set(option.key);
      if (onChange) onChange(option.key);
      wrap.dispatchEvent(new CustomEvent("pick", { bubbles: true }));
    };

    function set(key) {
      current = key;
      [...list.children].forEach((item, i) => item.setAttribute("aria-selected", String(choices[i].key === key)));
      const picked = choices.find(choice => choice.key === key) || choices[0];
      const arrow = element("span", "dropdownArrow", "▾");
      arrow.setAttribute("aria-hidden", "true");
      const words = element("span", "dropdownPicked");
      if (picked) words.append(...lines(picked));
      box.replaceChildren(words, arrow);
    }
    function setOptions(next) {
      choices = next;
      list.replaceChildren(...choices.map((option, i) => {
        const item = element("li", "pickerOption dropdownOption");
        item.id = `${list.id}-${i}`;
        item.setAttribute("role", "option");
        item.append(...lines(option));
        item.addEventListener("click", () => choose(i));
        return item;
      }));
      set(current);
      if (!list.hidden) {
        active = Math.max(0, choices.findIndex(choice => choice.key === current));
        mark();
      }
    }

    box.addEventListener("click", () => (list.hidden ? open() : close()));
    // (The box keeps its focus while the list is pressed, so the keys keep working after a tap)
    list.addEventListener("pointerdown", (event) => event.preventDefault());
    box.addEventListener("keydown", (event) => {
      const isOpen = !list.hidden;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        if (!isOpen) return open();
        active = Math.min(choices.length - 1, Math.max(0, active + (event.key === "ArrowDown" ? 1 : -1)));
        mark();
      } else if ((event.key === "Home" || event.key === "End") && isOpen) {
        event.preventDefault();
        active = event.key === "Home" ? 0 : choices.length - 1;
        mark();
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault(); // (Not the button's own click as well)
        if (isOpen) choose(active);
        else open();
      } else if (event.key === "Escape" && isOpen) {
        event.preventDefault();
        event.stopPropagation(); // Only the list closes, not the box it's in
        close();
      } else if (event.key === "Tab") {
        close();
      } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        // The first one (after the one it's on, for a first letter) whose name starts with what's typed
        const now = Date.now();
        typed = now - typedAt < 700 ? typed + event.key.toLocaleLowerCase() : event.key.toLocaleLowerCase();
        typedAt = now;
        const from = typed.length === 1 ? active + 1 : Math.max(active, 0);
        const order = choices.map((_, i) => (from + i) % choices.length);
        const found = order.find(i => choices[i].label.toLocaleLowerCase().startsWith(typed));
        if (found === undefined) return;
        open();
        active = found;
        mark();
      }
    });

    setOptions(options);
    return { el: wrap, value: () => current, set, setOptions, close };
  }

  // The Other Account an entry moves money into or out of, shown while Hidden or Transfer is picked. It's picked on
  // its own and never changes the title: the entry is saved as "Title → Account" (withAccount in Process Budget.js).
  // Only a picked account links the entry: a title that's an account's name doesn't pick it. A Transfer changes the
  // account by the opposite of its amount (the money moved from or to In Bank), a Hidden entry by its own amount
  // (accountChange). It's a dropdown of the accounts, each with its balance today on a second line (accountChoice).
  // accounts: in order, [{ name, balance, max }], or just names.
  // amount: the form's amountField. type(): the picked refraction type. account: picked to start.
  function accountField({ accounts = [], amount, type = () => "⭕️", account = "" }) {
    let list = [];
    let shown = false; // Hidden or Transfer is picked (see setVisible)
    const choices = dropdownList([], "", () => describe(), "Other Account");
    choices.el.classList.add("accountDropdown");
    const wrapper = field("Other Account", choices.el, { optional: true });
    const hint = element("span", "panelHint");
    wrapper.appendChild(hint);
    wrapper.hidden = true;

    const accountTitled = (text) => list.find(account => cleanString(account.name) === cleanString(text))?.name || "";

    // The accounts to pick from, each with its balance; the one picked stays picked while it's still there
    function setAccounts(accounts) {
      const picked = choices.value();
      list = accounts.map(account => (typeof account === "string" ? { name: account, balance: null } : account));
      choices.setOptions([{ key: "", label: "None" }, ...list.map(account => accountChoice(account))]);
      choices.set(accountTitled(picked));
      wrapper.hidden = !shown || list.length === 0;
      if (shown) describe();
    }
    setAccounts(accounts);

    // The hint under the picker: what the entry does to the account. With an account picked, the amount can be a % of
    // its balance instead.
    function describe() {
      const name = choices.value();
      amount.setPercentAllowed?.(shown && !wrapper.hidden && !!name);
      const value = amount.value();
      const isTransfer = type() === "⭕️";
      const percent = amount.isPercent?.() ? amount.percent() : null;
      if (!name) hint.textContent = "Pick an account if this money moves into or out of it.";
      else if (amount.isPercent?.()) {
        const share = `${Math.abs(percent)}% of what's in ${name} as that day starts`;
        if (!percent || Number.isNaN(percent)) hint.textContent = `A percent of what's in ${name} as that day starts, worked out again whenever it changes. Once the day passes, it stays what it came to.`;
        else if (isTransfer) hint.textContent = percent < 0 ? `Moves ${share}, from In Bank into ${name}.` : `Moves ${share}, from ${name} into In Bank.`;
        else hint.textContent = percent < 0 ? `Takes ${share}, out of ${name}.` : `Adds ${share}, to ${name}.`;
      } else if (value === null || Number.isNaN(value) || value === 0) {
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
    const pick = (name) => choices.set(accountTitled(name));
    pick(account);

    amount.el.addEventListener("input", describe);
    amount.el.addEventListener("click", describe); // The Cost / Gain and $ / % buttons

    return {
      el: wrapper,
      pick,
      setAccounts,
      // Shown for Hidden and Transfer (when there are accounts to pick)
      setVisible(visible) {
        shown = visible;
        wrapper.hidden = !visible || list.length === 0;
        if (wrapper.hidden) choices.close();
        describe();
      },
      value: () => (wrapper.hidden ? "" : choices.value())
    };
  }

  const isAccountType = (key) => key === "✖️" || key === "⭕️";

  // Date field. value(): Date, null when blank, undefined when it isn't a real date. The calendar button opens a calendar to pick one
  // (Dates.js), from min to max when they're given. With the calendar (or History) on the page, tapping a day while the
  // box is waiting fills it too. hint: what's under it (it says how to fill it in, unless one is given).
  function dateField({ label = "Date", date = null, optional = false, min = null, max = null, hint = "" } = {}) {
    const input = element("input", "dateInput");
    input.type = "text";
    input.inputMode = "numeric";
    input.placeholder = datePattern(); // This device's date format, like DD/MM/YYYY
    input.translate = false;
    if (date) input.value = showDate(date);
    input.addEventListener("focus", () => setPickTarget(input));
    const control = element("div", "dateRow");
    control.append(input, datePickerButton(input, label, { min, max }));
    if (!hint) hint = hasCalendar() ? "Type a date, use the calendar button, or tap a day on the calendar." : "Type a date, or use the calendar button to pick one.";
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
  // A list to pick one from. options: words (each its own value), or { value, label }; hint: words under it
  function selectField({ label, options, value, hint = "" }) {
    const select = element("select", "selectInput");
    for (const option of options) {
      const optionEl = element("option", "", typeof option === "object" ? option.label : option);
      optionEl.value = typeof option === "object" ? String(option.value) : option;
      select.appendChild(optionEl);
    }
    select.value = String(value);
    return { el: field(label, select, hint ? { hint } : undefined), input: select, value: () => select.value };
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

  // The Placeholder switch: a placeholder stands in for an entry that's expected (like an estimate). It counts like any
  // entry and shows in yellow, and the daily update deletes it once its day has passed (see PLACEHOLDER_MARK in Process
  // Budget.js), so it's only offered for a day from today on: setDate(date) hides it for a day before today (date: a
  // Date, or null for today). value(): on and shown.
  const PLACEHOLDER_HINT = "A stand-in for an entry you expect, like an estimate. It counts like any entry and shows in yellow, and it's deleted once its day passes.";
  function placeholderField({ checked = false, hint = PLACEHOLDER_HINT } = {}) {
    const toggle = checkboxField({ label: "Placeholder", checked });
    const el = element("div", "panelField placeholderField");
    el.append(toggle.el, element("span", "panelHint", hint));
    return {
      el,
      input: toggle.input,
      setDate(date) { el.hidden = date instanceof Date && !isNaN(date.getTime()) && date < today; },
      set(on) { toggle.input.checked = !!on; },
      value: () => !el.hidden && toggle.input.checked
    };
  }

  // Wavelength: what an entry's money is for (its purpose, one of the budget's wavelengths: see WAVELENGTH PLANNING in
  // Process Budget.js), at the bottom of every form that makes or changes an entry once Bob's Wavelength Planning card
  // is on (shown), with a button for each wavelength and None. It's kept for the entry's title, so it starts on the
  // title's (lookup: purposeOf) and follows the title as it's typed (follow), until one is tapped. With no budget to
  // look in (the Quick Entry page: lookup null, and wavelengths from the API), nothing's picked to start, which leaves
  // the title's as it is. value(): a wavelength's id or "none"; undefined when it isn't shown or nothing's picked.
  function purposeField({ shown = false, title = "", lookup = purposeOf, wavelengths = null } = {}) {
    let touched = false;
    const choices = [{ key: "none", label: "None" }, ...(wavelengths || wavelengthList()).map(wave => ({ key: wave.id, label: wave.name }))];
    const picker = segmented(choices, lookup ? lookup(title) : "", () => { touched = true; });
    picker.el.classList.add("purposeChoices");
    noTranslate(picker.el); // (Their own names)
    const hint = lookup
      ? "Every entry with this title shares it. Bob's Wavelength Planning card adds up what each one costs."
      : "Every entry with this title shares it. Left unpicked, the title keeps the one it has.";
    const el = field("Wavelength", picker.el, { hint });
    el.classList.add("purposeField");
    el.hidden = !shown;
    return {
      el,
      follow(newTitle) {
        if (!touched && lookup) picker.set(lookup(newTitle));
      },
      has: (purpose) => choices.some(choice => choice.key === purpose),
      set(purpose) {
        touched = true;
        picker.set(purpose);
      },
      value: () => (el.hidden || !picker.value() ? undefined : picker.value())
    };
  }

  // An entry's note (see ENTRY NOTES in Process Budget.js), as long as it needs to be: the very last thing in its form,
  // under the form's buttons, a button that shows or hides it, with the note right under it (so the button stays put as
  // it opens and closes). It starts closed, and the button says whether there's one. maxLength: 0 for none (the Quick
  // Entry page has one). value(): the note ("" for none).
  let noteCount = 0;
  function noteField({ note = "", maxLength = 0 } = {}) {
    const el = element("div", "noteField");
    const button = element("button", "budgetButton noteToggle");
    button.type = "button";
    const box = element("textarea", "noteBox");
    box.id = `entryNote${++noteCount}`;
    box.value = note;
    box.rows = 5;
    box.placeholder = "Anything to remember about it";
    box.setAttribute("aria-label", "Note");
    if (maxLength) box.maxLength = maxLength;
    box.hidden = true;
    button.setAttribute("aria-controls", box.id);
    const show = () => {
      button.textContent = !box.hidden ? "Hide Note ▴" : box.value.trim() ? "Show Note ▾" : "Add A Note ▾";
      button.setAttribute("aria-expanded", String(!box.hidden));
    };
    button.addEventListener("click", () => {
      box.hidden = !box.hidden;
      show();
      if (!box.hidden && window.matchMedia("(pointer: fine)").matches) box.focus();
    });
    show();
    el.append(button, box);
    return {
      el,
      input: box,
      value: () => box.value,
      set(text) {
        box.value = String(text ?? "");
        show();
      }
    };
  }

  // A list of titles, one per line, each with its own buttons (like All / Costs / Gains) and an ×.
  // The tracker's aliases and the search bar use it. A comma starts the next line (so a pasted list
  // splits up), and Enter adds a line. Only the buttons pick what a line finds: a title is kept as it's
  // typed, so one like "Disney+" stays a title.
  //   items: [{ title, mode, exact }]. options: [{ key, label }] (the first is the default for new lines).
  //   placeholder and suggestions (a datalist id) can be functions of the line's mode. onEnterEmpty: runs
  //   when Enter is pressed on an empty line. exact: each line gets an Exact switch beside its box (Search: off
  //   finds titles with the words in them, on only the title itself), except for the modes in noExact.
  //   help: { label, content }, a tiny ? before the first line's buttons that shows (or hides) what they do, in a box
  //   that goes wherever the caller puts it (helpBox)
  // Returns { el (the lines, the help box, and the add button), lines, helpBox (or null), addButton, items():
  // [{ title, mode, exact }] for every line, blank ones too }
  function termList({ items = [], options, label, lineLabel, addLabel, placeholder = "", suggestions = null, onEnterEmpty = null, exact = false, noExact = [], help = null }) {
    const list = element("div", "termList");
    list.setAttribute("role", "group");
    list.setAttribute("aria-label", label);
    const lines = [];
    const defaultMode = options[0].key;
    const forMode = (setting, mode) => (typeof setting === "function" ? setting(mode) : setting);
    const tidy = (text) => String(text ?? "").replace(/\s+/g, " ").trim();

    // The explanation the ? shows (every line has one, but only the first line's shows: see .termHelpButton)
    const helpBox = help ? element("div", "fieldHelp termHelp") : null;
    const helpButtons = [];
    if (helpBox) {
      helpBox.id = `fieldHelp${++fieldHelpCount}`;
      helpBox.hidden = true;
      helpBox.appendChild(help.content);
    }
    const helpButton = () => {
      const button = element("button", "fieldHelpButton termHelpButton", "?");
      button.type = "button";
      button.title = help.label;
      button.setAttribute("aria-label", help.label);
      button.setAttribute("aria-controls", helpBox.id);
      button.setAttribute("aria-expanded", String(!helpBox.hidden));
      button.addEventListener("click", () => {
        helpBox.hidden = !helpBox.hidden;
        helpButtons.forEach(each => each.setAttribute("aria-expanded", String(!helpBox.hidden)));
      });
      helpButtons.push(button);
      return button;
    };

    // A line goes after the line `after`, or at the end
    function addLine(item = { title: "", mode: defaultMode, exact: false }, after = null) {
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
      // The buttons and × stay together, × right after the last button, when the line wraps (and the ? before them)
      const controls = element("div", "termControls");
      controls.append(...(helpBox ? [helpButton()] : []), modes.el, remove);
      const exactSwitch = exact ? checkboxField({ label: "Exact", checked: !!item.exact }) : null;
      if (exactSwitch) {
        exactSwitch.el.classList.add("termExact");
        exactSwitch.input.setAttribute("aria-label", `${lineLabel}: exact match`);
        exactSwitch.el.title = "On: only this exact title. Off: any title with these words in it.";
      }
      row.append(input, ...(exactSwitch ? [exactSwitch.el] : []), controls);

      // Placeholder and suggestions for the line's button (the search bar's Tracker suggests rows), and its Exact
      // switch only where it means something
      function showMode(mode) {
        input.placeholder = forMode(placeholder, mode);
        const listId = suggestions ? suggestions(mode) : null;
        if (listId) input.setAttribute("list", listId);
        else input.removeAttribute("list");
        if (exactSwitch) exactSwitch.el.hidden = noExact.includes(mode);
      }
      showMode(item.mode);

      const line = { input, modes, exactSwitch };
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
        const helpAt = helpButtons.indexOf(controls.querySelector(".termHelpButton"));
        if (helpAt >= 0) helpButtons.splice(helpAt, 1);
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
    el.append(list, ...(helpBox ? [helpBox] : []), addButton);
    return {
      el,
      lines: list,
      helpBox,
      addButton,
      items: () => lines.map(line => ({ title: tidy(line.input.value), mode: line.modes.value(), exact: !!line.exactSwitch?.value() }))
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

  // The New Entry form's fields: title, optional refraction type, for Hidden or Transfer the Other Account it moves money
  // into or out of (accounts: [{ name, balance, max }], or names), then the amount (cost or gain: with an account, it can
  // be a % of it, which is why the account comes first), date, Placeholder (for a day from today on), and its
  // Wavelength (purposes: whether to ask, see purposeField; purposeLookup: null where there's no budget to look in,
  // with the wavelengths passed in). The calendar's New Entry panel and the Quick Entry page share it, so they always
  // match. Its note (noteEl, see noteField) goes under the form's buttons. noteMax: the longest a note can be (0 for no
  // limit). read(): { entry: { title, amount, date, sprite, placeholder, purpose, note } } when it's filled in right,
  // otherwise
  //   { error }. The title carries the Other Account picked: "Title → Account" (or just the account's name when no title
  //   is typed).
  // values(): what's in it now, filled in or not: { title, amount (signed, null when blank, NaN when
  //   unreadable), sprite ("" for Auto), account ("" for none), date (null when blank, undefined when it isn't a day),
  //   placeholder, purpose, note }
  // fill({ title, amount, sprite, account, placeholder, purpose, note }): puts these in, leaving the fields they don't
  //   have as they are (the Quick Entry page's prisms). dateEl and purposeEl: those fields, for a form that doesn't need
  //   them.
  // setAccounts(accounts): new balances for the Other Account list (the Quick Entry page's, after an Undo or Redo)
  function newEntryFields({ date = today, accounts = [], purposes = bobCardOn("purposes"), purposeLookup = purposeOf, wavelengths = null, noteMax = 0 } = {}) {
    const title = textField({ label: "Title", placeholder: "Coffee, paycheck, gas...", maxLength: MAX_TITLE });
    const amount = amountField();
    const dateInput = dateField({ label: "Date", date });
    const account = accountField({ accounts, amount, type: () => refraction.value() });
    const refraction = refractionField({ onChange: (key) => { account.setVisible(isAccountType(key)); followTitle(); } });
    const placeholder = placeholderField();
    const purpose = purposeField({ shown: purposes, lookup: purposeLookup, wavelengths });
    const note = noteField({ maxLength: noteMax });
    const showPlaceholder = () => placeholder.setDate(dateInput.value() ?? date);
    dateInput.input.addEventListener("input", showPlaceholder);
    dateInput.input.addEventListener("change", showPlaceholder);
    showPlaceholder();
    // The purpose shown is the title's (one with no title of its own goes by its account's name)
    const followTitle = () => purpose.follow(withAccount(title.value(), account.value()));
    title.input.addEventListener("input", followTitle);
    account.el.addEventListener("pick", followTitle);
    return {
      els: [title.el, refraction.el, account.el, amount.el, dateInput.el, placeholder.el, purpose.el],
      dateEl: dateInput.el,
      purposeEl: purpose.el,
      noteEl: note.el,
      inputs: { title: title.input, amount: amount.input },
      values: () => ({ title: title.value(), amount: amount.value(), percent: amount.isPercent() ? amount.percent() : null, sprite: refraction.value(), account: account.value(), date: dateInput.value(), placeholder: placeholder.value(), purpose: purpose.value(), note: note.value() }),
      setAccounts: account.setAccounts,
      fill({ title: newTitle = "", amount: newAmount = null, percent = null, sprite = "", account: newAccount = "", placeholder: newPlaceholder = false, purpose: newPurpose, note: newNote } = {}) {
        if (newTitle) title.input.value = newTitle;
        if (typeof newAmount === "number" && Number.isFinite(newAmount)) {
          amount.input.value = Math.round(newAmount * 100) !== 0 ? Math.abs(newAmount).toFixed(2) : "";
          amount.setSign(newAmount > 0 ? 1 : -1);
        }
        if (sprite) refraction.set(sprite);
        if (newAccount) account.pick(newAccount);
        if (newPlaceholder) placeholder.set(true);
        title.input.dispatchEvent(new Event("input", { bubbles: true }));
        account.setVisible(isAccountType(refraction.value())); // Shown for Hidden or Transfer
        if (typeof percent === "number" && percent !== 0) amount.setPercent(percent);
        if (purpose.has(newPurpose)) purpose.set(newPurpose);
        if (typeof newNote === "string") note.set(newNote);
      },
      read() {
        if (title.value().includes(ACCOUNT_ARROW)) return { error: TITLE_ARROW };
        const entry = { title: withAccount(title.value(), account.value()), amount: amount.value() ?? 0, date: dateInput.value(), sprite: refraction.value(), purpose: purpose.value(), note: note.value() };
        if (!entry.title) return { error: "Give the entry a title." };
        const { percent, error } = readPercentField(amount);
        if (error) return { error };
        if (percent !== null) {
          entry.percent = percent;
          entry.amount = 0;
        }
        if (Number.isNaN(entry.amount)) return { error: "Enter an amount, like 12.50." };
        if (Math.abs(entry.amount) > MAX_AMOUNT) return { error: AMOUNT_TOO_BIG };
        if (entry.date === undefined) return { error: `That date isn't a real day. Use ${datePattern()}.` };
        entry.date = entry.date || date;
        if (percent !== null && entry.date < today) return { error: PERCENT_PAST_DAY };
        entry.placeholder = placeholder.value() && entry.date >= today;
        return { entry };
      }
    };
  }

  // An entry's options (an entry tapped on a zoomed day on Home or History, in Upcoming, an account's Entries, or Search's
  // results): line is the entry as its day stores it ("❗️ -$4.50 Coffee") on date. Its title (see renameEntry in Process
  // Budget.js: any entry before today, and from today on one that doesn't land by itself from a recurring entry or a
  // connected spreadsheet), its refraction type and Other Account, Set to or Add to it, Move to another day, whether it's a
  // placeholder (for a day from today on), its title's Wavelength (once Bob's card for it is on), Delete,
  // and its note (under the buttons). Changing its type or account takes it off as it is and puts it on as the new one,
  // adding into an entry already on that day with the same title and type (changeEntryKind). One that lands
  // by itself on a day after the calendar (Search's, which isn't in the budget yet) goes into Upcoming for that day once
  // it's changed, the way a changed day on the calendar does. inHistory: a day in History, where the same changes keep
  // the balances (In Bank, and the Other Accounts'; see changeHistoryEntry) and it only moves to another day in History.
  // stacked: it opens over the panel that's open (an account's Entries), which comes back when it closes. The panel
  // shows the whole entry, however long its title.
  function openEntryOptions(origin, line, date, { lineIndex = 1, inHistory = false, stacked = false } = {}) {
    const parts = getParts(line);
    const refraction = getSpecialType(parts[0]);
    const wasPlaceholder = isPlaceholder(parts[0]);
    const currentAmount = parseAmount(parts[1]);
    const currentPercent = percentOf(parts[0]); // A % entry's (see PERCENT_MARK)
    const title = parts.slice(2).join(" ");
    const changeEntry = inHistory ? changeHistoryEntry : changeCalendarEntry;
    const changeKind = inHistory ? changeHistoryEntry : changeEntryKind;
    const renamable = canRenameEntry(parts[0], date);

    openPanel({
      origin,
      size: "small",
      stacked,
      title: `${inHistory ? showDate(date) : showDay(date)} Entry`,
      build(form, panel) {
        const display = renderEntryLine(line, lineIndex, date);
        display.classList.add("panelEntry");
        // An entry for an Other Account changes it: a Transfer by the opposite amount, a Hidden entry by its own
        const account = linkedAccount(parts[0], title);
        const accountNote = account ? element("p", "panelHint", refraction === "⭕️"
          ? `${account.name} (Other Accounts) gets the opposite of this entry's amount, since the money moves between it and In Bank.`
          : `${account.name} (Other Accounts) changes by this entry's amount, and In Bank doesn't.`) : null;
        const historyNote = inHistory
          ? element("p", "panelHint", "This day is in History, so changing this entry doesn't change In Bank or your Other Accounts' balances. The tracker and Search count the change.")
          : null;

        let mode = "set";
        const amount = amountField({ label: "Amount", amount: currentAmount, percent: currentPercent, allowPercent: !inHistory && date >= today });
        const modeToggle = segmented(
          [{ key: "set", label: "Set to" }, { key: "add", label: "Add to it" }],
          "set",
          (key) => {
            mode = key;
            amount.input.value = key === "set" && Math.round(currentAmount * 100) !== 0 ? Math.abs(currentAmount).toFixed(2) : "";
            amount.setSign(key === "set" && currentAmount > 0 ? 1 : -1);
            amount.setPercent(key === "set" ? currentPercent : null);
          }
        );
        const moveTo = inHistory
          ? dateField({ label: "Move to", optional: true, min: oldestHistoryDay(), max: addDays(gridStartDate, -1), hint: "Another day in History: type it, or use the calendar button to pick one." })
          : dateField({ label: "Move to", optional: true });

        // Its title of its own (the Other Account stays after it), where it can change
        const { title: ownTitle, account: ownAccount } = splitAccount(title);
        const titleBox = renamable
          ? textField({ label: "Title", value: ownTitle, placeholder: ownAccount ? "None of its own" : "Coffee, paycheck, gas...", maxLength: MAX_TITLE })
          : null;
        if (titleBox) titleBox.input.dataset.skipFocus = "1";
        const titleNote = renamable ? null : element("p", "panelHint", "Its title comes from its recurring entry or connected spreadsheet, so from today on it's changed there.");

        // Its refraction type and Other Account can change too. Then it comes off as it is and goes on as the new
        // one, adding into an entry already on that day with the same title and type.
        const type = refractionField({ value: refraction, allowAuto: false, onChange: (key) => accountPicker.setVisible(isAccountType(key)) });
        const accountPicker = accountField({ accounts: otherAccounts(), amount, type: () => type.value(), account: account ? account.name : "" });
        accountPicker.setVisible(isAccountType(refraction));
        const startAccount = accountPicker.value();
        // A placeholder (only for a day from today on, so never in History): it follows Move to's day
        const placeholder = placeholderField({ checked: wasPlaceholder });
        const showPlaceholder = () => {
          const move = moveTo.value();
          placeholder.setDate(move instanceof Date ? move : date);
          if (inHistory) placeholder.el.hidden = true;
        };
        moveTo.input.addEventListener("input", showPlaceholder);
        moveTo.input.addEventListener("change", showPlaceholder);
        showPlaceholder();
        // Its Wavelength (once Bob's card for it is on): its title's, following a new title as it's typed
        const purpose = purposeField({ shown: bobCardOn("purposes"), title });
        const newTitleNow = () => withAccount(titleBox ? titleBox.value() : ownTitle, accountPicker.value());
        titleBox?.input.addEventListener("input", () => purpose.follow(newTitleNow()));
        accountPicker.el.addEventListener("pick", () => purpose.follow(newTitleNow()));
        // Its note, under the buttons (it goes wherever the entry goes)
        const currentNote = entryNote(date, title, refraction);
        const note = noteField({ note: currentNote });

        form.append(display, ...[accountNote, historyNote, titleBox?.el, titleNote].filter(Boolean), type.el, accountPicker.el, field("Change the amount", modeToggle.el), amount.el, moveTo.el, placeholder.el, purpose.el, buttonRow([
          { label: "Save", kind: "primary", type: "submit" },
          { label: "Delete", kind: "danger", onClick: deleteEntry },
          { label: "Cancel", onClick: () => panel.close() }
        ]), note.el);

        form.addEventListener("submit", (event) => {
          event.preventDefault();
          const newOwn = titleBox ? titleBox.value() : ownTitle;
          if (newOwn.includes(ACCOUNT_ARROW)) return panel.setError(TITLE_ARROW);
          const renamed = newOwn !== ownTitle;
          const { percent: newPercent, error: percentError } = readPercentField(amount);
          if (percentError) return panel.setError(percentError);
          const newAmount = newPercent !== null ? 0 : amount.value() ?? 0; // A blank box is 0 (Set to 0, or nothing added)
          const move = moveTo.value();
          if (Number.isNaN(newAmount)) return panel.setError("Enter an amount, like 12.50.");
          if (Math.abs(newAmount) > MAX_AMOUNT) return panel.setError(AMOUNT_TOO_BIG);
          if (move === undefined) return panel.setError(`That date isn't a real day. Use ${datePattern()}.`);
          if (newPercent !== null && (move instanceof Date ? move : date) < today) return panel.setError(PERCENT_PAST_DAY);
          // (Left as it is when the switch isn't there: a day before today never has one)
          const newPlaceholder = placeholder.el.hidden ? undefined : placeholder.value();
          const newPurpose = purpose.value();
          // (Left out when it didn't change, so the entry keeps its own wherever it goes)
          const newNote = note.value() !== currentNote ? note.value() : undefined;

          const newSprite = type.value();
          const newAccount = accountPicker.value();
          if (newSprite !== refraction || newAccount !== startAccount) {
            if (newPercent !== null && mode === "add") return panel.setError("To add a percent to it, save its new type or account first.");
            const total = mode === "set" ? newAmount : currentAmount + newAmount;
            if (Math.abs(total) > MAX_AMOUNT) return panel.setError(AMOUNT_TOO_BIG);
            const newTitle = withAccount(newOwn, newAccount);
            // "→ Savings" has no title of its own, so it can't leave its account without one
            if (!newTitle) return panel.setError(titleBox ? "Give the entry a title, or keep its Other Account." : "This entry has no title of its own, so it needs an Other Account. To take it off, tap Delete.");
            const kind = { title, sprite: refraction, date, newTitle, newSprite, amount: total, percent: newPercent, placeholder: newPlaceholder, purpose: newPurpose, note: newNote };
            if (move && move.getTime() !== date.getTime()) kind.moveDate = move;
            return submit(panel, () => changeKind(kind));
          }

          const change = { title, sprite: refraction, date, action: "set", amount: "", placeholder: newPlaceholder, purpose: newPurpose, note: newNote };
          // (A % entry set to dollars becomes a plain amount, even the same one)
          const amountChanged = mode === "set"
            ? (newPercent !== null ? newPercent !== currentPercent : newAmount !== currentAmount || (currentPercent !== null && amount.percentShown()))
            : (newPercent !== null || newAmount !== 0);
          if (amountChanged) {
            const signed = newPercent ?? newAmount;
            change.action = mode === "set" ? "set" : (signed > 0 ? "add" : "subtract");
            change.amount = newPercent !== null ? "" : mode === "set" ? String(newAmount) : String(Math.abs(newAmount));
            change.percent = newPercent;
          }
          if (move && move.getTime() !== date.getTime()) change.moveDate = move;
          const placeholderChanged = newPlaceholder !== undefined && newPlaceholder !== wasPlaceholder;
          if (renamed) {
            if (!withAccount(newOwn, ownAccount)) return panel.setError("Give the entry a title.");
            change.renameTo = newOwn;
          }
          if (!renamed && !amountChanged && !change.moveDate && !placeholderChanged) {
            // Only its title's purpose or its note changed, or nothing did
            const purposeChanged = newPurpose !== undefined && newPurpose !== purposeOf(title);
            if (purposeChanged || newNote !== undefined) {
              return submit(panel, () => saveEntryExtras(date, title, refraction, { purpose: purposeChanged ? newPurpose : undefined, note: newNote }));
            }
            return panel.close();
          }

          submit(panel, () => changeEntry(change));
        });

        // Delete: it comes off its day (one that landed there by itself leaves a $0.00 temp)
        function deleteEntry() {
          if (!window.confirm(`Delete ${title} on ${showDay(date)}?`)) return;
          submit(panel, () => changeEntry({ title, sprite: refraction, date, action: "delete" }));
        }
      }
    });
  }

  // New Entry (Home's button, and a zoomed day's + on Home or History, with that day in its date box): title, refraction
  // type (Auto to start), for Hidden or Transfer an Other Account, the amount (cost or gain), date, Placeholder, once
  // Bob's card for it is on, its Wavelength, and a note under its buttons. A day has one entry per title, type,
  // and Other Account, so when one is already there (its own, or a recurring or connected spreadsheet's entry landing
  // there), the form says so and asks whether to add the new amount to it or set it to the new amount. Either way a
  // recurring or spreadsheet entry becomes a temp for that day (like ❗️✔️), the same as changing it on the calendar.
  function openNewEntry(origin, { date = today } = {}) {
    openPanel({
      origin,
      size: "large",
      title: "New Entry",
      build(form, panel) {
        const fields = newEntryFields({ date, accounts: otherAccounts() });
        let mode = "add";
        const modeToggle = segmented([{ key: "add", label: "Add to it" }, { key: "set", label: "Set to this" }], mode, (key) => { mode = key; });
        const matchNote = element("div", "panelText matchNote");
        const matchBox = element("div", "matchBox");
        matchBox.append(matchNote, modeToggle.el);
        const matchField = field("Already on that day", matchBox);
        matchField.hidden = true;
        form.append(...fields.els, matchField, buttonRow([
          { label: "Add Entry", kind: "primary", type: "submit" },
          { label: "Cancel", onClick: () => panel.close() }
        ]), fields.noteEl);

        // The entry already there, if there's one (looked up again as the form changes; not while it's being added, when
        // it would find the new entry itself)
        let match = null;
        const findMatch = () => {
          if (panel.panel.classList.contains("isBusy")) return;
          const { title, sprite, account, date: picked } = fields.values();
          const day = picked || date;
          match = title && !title.includes(ACCOUNT_ARROW) ? entryOnDay(withAccount(title, account), sprite, day) : null;
          matchField.hidden = !match;
          if (!match) return;
          const mark = entryMark(match.sprite);
          const from = mark === RECURRING_MARK ? " (a recurring entry)" : mark === SHEET_MARK ? " (from a connected spreadsheet)" : "";
          matchNote.replaceChildren(renderEntryLine(`${match.sprite} ${formatMoney(match.amount)} ${capitalize(withAccount(title, account))}`, 1, day), ` is already on ${showDay(day)}${from}. Add this amount to it, or set it to this amount?`);
        };
        let pending = 0;
        const queueFind = () => {
          cancelAnimationFrame(pending);
          pending = requestAnimationFrame(findMatch);
        };
        form.addEventListener("input", queueFind);
        form.addEventListener("change", queueFind);
        form.addEventListener("click", queueFind); // The refraction type's and account's buttons
        findMatch();

        form.addEventListener("submit", (event) => {
          event.preventDefault();
          const { entry, error } = fields.read();
          if (error) return panel.setError(error);
          findMatch();
          if (match && mode === "set") {
            const sprite = entry.sprite || getSpecialType(match.sprite);
            const amount = typeof entry.percent === "number" ? { amount: "", percent: entry.percent } : { amount: String(entry.amount) };
            // (A note goes after the one the entry has, like adding to it does)
            const note = entry.note.trim() ? joinNotes(entryNote(entry.date, entry.title, sprite), entry.note) : undefined;
            return submit(panel, () => changeCalendarEntry({ title: entry.title, sprite, date: entry.date, action: "set", ...amount, placeholder: entry.placeholder, purpose: entry.purpose, note }));
          }
          submit(panel, () => addCalendarEntry(entry));
        });
      }
    });
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
  // The calendar button next to a date box opens a calendar to pick a day (DatePicker, in Dates.js). And with the calendar (or History)
  // on the page, while a date box is the "pick target", tapping a day fills it in: panels (and the search box) keep
  // their date box as the target while they're open; other date boxes stop when you tap somewhere else.

  const DAY_TABLES = ".elastic-table"; // Tables whose days can be tapped to pick them (Home's and History's)
  let pickTarget = null;
  const hasCalendar = () => !!document.querySelector(DAY_TABLES);

  // The calendar button for a typed date box: it opens a calendar on the typed date (or this month), and the day picked is written into
  // the box in this device's date format. options: { min, max } (Dates) when only those days can be picked.
  function datePickerButton(textInput, label = "Date", options = {}) {
    return DatePicker.button(textInput, { label, ...options });
  }

  // The date box a calendar tap fills: the calendar gets a dashed outline, so it's clear
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
  // Bank, Costs, Gains, in the day's own light grey), or an entry. Entries with a cost show red, a gain green, and $0.00 a
  // darker grey, and placeholders yellow whatever their amount (without their ⏳, which is only how they're stored).
  // Given its day, an entry with a note is underlined. A browser translating the page leaves entries, amounts, and
  // dates as they are (they're the person's own words and numbers); only the budget's own words, like In Bank, get
  // translated.
  function renderEntryLine(line, lineIndex, date = null) {
    if (lineIndex === 0) return noTranslate(element("div", "lineDate", line));
    const parts = getParts(line);
    const amount = parseAmount(parts[1]);
    if (isSystemLine(parts[0])) {
      const el = element("div", "lineSystem");
      // "✅ $812.40 Lowest: 11/14": the day shows in this device's date format
      const words = parts.slice(2).join(" ");
      // The day's In Bank can be tapped on a zoomed day to set it (Calendar Page.js openInBankOptions)
      if (lineIndex === 1 && words === "In Bank") el.classList.add("lineInBank");
      const day = words.match(/^(.*?)(\d{1,2}\/\d{1,2})$/);
      el.append(noTranslate(element("span", "", `${parts[0]} ${parts[1]} `)), day ? day[1] : words);
      if (day) el.appendChild(noTranslate(element("span", "", showStoredDate(day[2]))));
      return el;
    }
    const el = noTranslate(element("div", "lineEntry", shownLine(line)));
    el.dataset.line = lineIndex;
    el.classList.add(amountClass(amount));
    if (isPlaceholder(parts[0])) el.classList.add("isPlaceholder");
    if (date && lineHasNote(date, line)) el.classList.add("hasNote");
    return el;
  }

  // An entry's color by its amount: "negative" (red) for a cost, "positive" (green) for a gain, "isZero" (darker grey) for
  // $0.00
  function amountClass(amount) {
    const cents = Math.round(amount * 100);
    return cents < 0 ? "negative" : cents > 0 ? "positive" : "isZero";
  }

  // A table's neon bar under its column titles runs as one gradient across the whole row (see .dataTable
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
    if (!toastStack || !toastStack.isConnected) toastStack = onScreen(element("div", "toastStack"), true);
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
    readPercentField,
    BALANCE_SIGNS,
    cashRegister,
    refractionField,
    addFieldHelp,
    dateField,
    selectField,
    checkboxField,
    placeholderField,
    purposeField,
    noteField,
    frequencyField,
    accountField,
    accountChoice,
    choiceList,
    dropdownList,
    isAccountType,
    termList,
    aliasField,
    segmented,
    newEntryFields,
    openNewEntry,
    openEntryOptions,
    buttonRow,
    setPickTarget,
    datePickerButton,
    datePickActive,
    pickDate,
    renderEntryLine,
    amountClass,
    noTranslate,
    spanHeaderBar,
    showToast
  };
})();
