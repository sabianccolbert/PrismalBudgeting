// Dates: how a day is stored, shown, and typed (in this device's date format), and the calendar that picks one (the
// calendar button beside a date box). The login page uses it for the birth date, and every budget page (before
// Process Budget.js, which keeps the budget's own day, today) for its date boxes.

// =====================================================================
// #region STORED DAYS
// =====================================================================
// Stored dates never depend on the device's language, region, or time zone: a day is always stored as MM/DD/YYYY
// (MM/DD on a calendar day's first line, YYYY-MM-DD for the API) and read back as that same calendar day wherever the
// device is.

// A day (a Date, or stored text: "MM/DD", "MM/DD/YYYY", or "YYYY-MM-DD") as local midnight in this device's
// time zone. Text it can't read is today, or an invalid Date when failable.
function createSafeMidnight(input, failable = false) {
  if (!input) input = new Date();

  const getLocalMidnight = (year, monthIndex, day) => {
    return new Date(year, monthIndex, day, 0, 0, 0, 0);
  };

  if (input instanceof Date) {
    if (isNaN(input)) {
      return failable ? new Date("invalid") : getLocalMidnight(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
    }
    return getLocalMidnight(input.getFullYear(), input.getMonth(), input.getDate());
  }

  if (typeof input === 'string') {
    let trimmed = input.trim();

    // "MM/DD" (a calendar day's first line): the nearest year, around New Year's too
    if (/^\d{1,2}\/\d{1,2}$/.test(trimmed)) {
      let [m, d] = trimmed.split("/").map(Number);
      let now = new Date();
      let currentYear = now.getFullYear();
      let currentMonth = now.getMonth() + 1;

      let targetYear = currentYear;
      if (m === 12 && currentMonth === 1) targetYear--;
      else if (m === 1 && currentMonth === 12) targetYear++;

      return getLocalMidnight(targetYear, m - 1, d);
    }

    // "MM/DD/YYYY" (or "M/D/YYYY")
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmed)) {
      let [m, d, y] = trimmed.split("/").map(Number);
      return getLocalMidnight(y, m - 1, d);
    }

    // "YYYY-MM-DD"
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      let [y, m, d] = trimmed.split("-").map(Number);
      return getLocalMidnight(y, m - 1, d);
    }

    // Words, like "Oct 12, 2026"
    let parsedDate = new Date(trimmed);
    if (!isNaN(parsedDate.getTime())) {
      return getLocalMidnight(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate());
    }
  }

  // (A caller that can fail says so itself, like a spreadsheet cell that isn't a date)
  if (failable) return new Date("invalid");
  console.warn("createSafeMidnight couldn't read:", input);

  let now = new Date();
  return getLocalMidnight(now.getFullYear(), now.getMonth(), now.getDate());
}

// A day as stored: MM/DD/YYYY
function formatToMMDDYYYY(dateObj) {
  const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
  const dd = String(dateObj.getDate()).padStart(2, '0');
  const yyyy = dateObj.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

// "YYYY-MM-DD" (local date), the API's format
function formatToYMD(dateObj) {
  const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
  const dd = String(dateObj.getDate()).padStart(2, '0');
  return `${dateObj.getFullYear()}-${mm}-${dd}`;
}

// Local midnight N days after date (handles month/year/DST rollover)
function addDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

// The same day, this many months later (the 31st goes to a shorter month's last day)
function addMonths(date, months = 1) {
  const lastDay = new Date(date.getFullYear(), date.getMonth() + months + 1, 0).getDate();
  return new Date(date.getFullYear(), date.getMonth() + months, Math.min(date.getDate(), lastDay));
}

//#endregion

// =====================================================================
// #region DATES PEOPLE SEE AND TYPE
// =====================================================================
// Only what people see and type follows their date format: this device's own (from its language and region), or the
// one picked in Settings. So 05/10/2026 is October 5 to someone who writes the day first, and YYYY-MM-DD can always be
// typed too.

const DATE_FORMATS = {
  mdy: { pattern: "MM/DD/YYYY" },
  dmy: { pattern: "DD/MM/YYYY" },
  ymd: { pattern: "YYYY-MM-DD" }
};
const DATE_FORMAT_KEY = "prismal_date_format"; // This device's pick ("mdy", "dmy", "ymd"); none = its own

// The device's own order, from its language and region (en-US: mdy, en-GB and most of the world: dmy,
// ja, zh, ko, sv, and others: ymd)
let deviceFormatCache = null;
function deviceDateFormat() {
  if (deviceFormatCache) return deviceFormatCache;
  deviceFormatCache = "mdy";
  try {
    const order = new Intl.DateTimeFormat(undefined, { year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(new Date(2026, 9, 5))
      .map(part => part.type)
      .filter(type => type === "year" || type === "month" || type === "day");
    if (order[0] === "year") deviceFormatCache = "ymd";
    else if (order[0] === "day") deviceFormatCache = "dmy";
  } catch (e) {}
  return deviceFormatCache;
}

// "mdy", "dmy", or "ymd": picked in Settings on this device, or the device's own
function dateFormat() {
  let picked = null;
  try { picked = localStorage.getItem(DATE_FORMAT_KEY); } catch (e) {}
  return Object.prototype.hasOwnProperty.call(DATE_FORMATS, picked) ? picked : deviceDateFormat();
}

// What a date box asks for, like "DD/MM/YYYY"
function datePattern() {
  return DATE_FORMATS[dateFormat()].pattern;
}

// A day as people read it: "10/05/2026", "05/10/2026", or "2026-10-05"
function showDate(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) return "";
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const format = dateFormat();
  if (format === "ymd") return `${date.getFullYear()}-${mm}-${dd}`;
  return format === "dmy" ? `${dd}/${mm}/${date.getFullYear()}` : `${mm}/${dd}/${date.getFullYear()}`;
}

// A day without its year: "10/05", "05/10", or "10-05"
function showDay(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) return "";
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const format = dateFormat();
  if (format === "ymd") return `${mm}-${dd}`;
  return format === "dmy" ? `${dd}/${mm}` : `${mm}/${dd}`;
}

// A stored date ("10/05/2026", or "10/05" on a calendar day) as people read it. Anything that isn't a
// date (like "None") is shown as it is.
function showStoredDate(text) {
  const trimmed = String(text ?? "").trim();
  if (/^\d{1,2}\/\d{1,2}$/.test(trimmed)) return showDay(createSafeMidnight(trimmed));
  if (!/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmed)) return trimmed;
  const date = createSafeMidnight(trimmed, true);
  return isNaN(date.getTime()) ? trimmed : showDate(date);
}

// A typed date as local midnight, or an invalid Date when it isn't a real day (31/02 doesn't quietly roll
// over into March). Numbers go in this device's date order (dateFormat), split by /, ., -, or spaces, or as digits
// alone, the way a phone's number pad types them (it has no / or -): 8 digits are the whole date, 6 the same with a
// 2-digit year, and 4 just the month and the day. A 4-digit year first is always year-month-day. Without a year, it's
// the nearest one (12/30 typed in January is last December). A 2-digit year is in the 2000s, or with pastYears (a birth
// date) the latest one that isn't after this year (90 is 1990). Month names work too, either way around and with or
// without a year or a weekday ("Oct 5", "5 October 2026", "Mon, Oct 5, 2026"), the same in every browser.
function parseTypedDate(text, { pastYears = false } = {}) {
  const trimmed = String(text || "").trim();
  const invalid = new Date("invalid");
  if (!trimmed) return invalid;
  let year, month, day;
  let numbers = trimmed.match(/^(\d{4})[\/.\-\s](\d{1,2})[\/.\-\s](\d{1,2})$/);
  const named = numbers ? null : namedDate(trimmed);
  if (numbers) {
    [year, month, day] = numbers.slice(1).map(Number);
  } else if (named) {
    ({ month, day } = named);
    year = named.year ?? nearestYear(month);
  } else {
    const parts = trimmed.match(/^(\d{1,2})[\/.\-\s](\d{1,2})(?:[\/.\-\s](\d{2}|\d{4}))?\.?$/)?.slice(1) || splitDigits(trimmed);
    if (!parts) {
      // Anything else only when it says its year (browsers guess one differently, like 2001)
      if (/^[\d\s\/.\-]+$/.test(trimmed) || !/\d{4}/.test(trimmed)) return invalid;
      return createSafeMidnight(trimmed, true);
    }
    const [first, second] = [Number(parts[0]), Number(parts[1])];
    [month, day] = dateFormat() === "dmy" ? [second, first] : [first, second];
    year = parts[2] ? fullYear(parts[2], pastYears) : nearestYear(month);
  }
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return invalid;
  return createSafeMidnight(date);
}

// Digits alone as [first, second, year], the way they'd be typed with / between them (in this device's order), or null:
// 10052026, 100526, or 1005 (20261005 where the year comes first)
function splitDigits(text) {
  if (!/^(\d{4}|\d{6}|\d{8})$/.test(text)) return null;
  const yearDigits = text.length - 4;
  if (yearDigits && dateFormat() === "ymd") return [text.slice(yearDigits, yearDigits + 2), text.slice(yearDigits + 2), text.slice(0, yearDigits)];
  return [text.slice(0, 2), text.slice(2, 4), text.slice(4)];
}

// A typed year as a number: a 2-digit one is in the 2000s, or with pastYears the latest one that isn't after this year
function fullYear(text, pastYears = false) {
  const year = Number(text);
  if (text.length !== 2) return year;
  return pastYears && 2000 + year > currentDay().getFullYear() ? 1900 + year : 2000 + year;
}

// The year a date typed without one is in: this one, or next or last year around New Year's (month: 1-12)
function nearestYear(month) {
  const now = currentDay();
  if (month === 12 && now.getMonth() === 0) return now.getFullYear() - 1;
  if (month === 1 && now.getMonth() === 11) return now.getFullYear() + 1;
  return now.getFullYear();
}

// Today: the budget's (today, in Process Budget.js) where there's a budget, and the device's otherwise
function currentDay() {
  return typeof today !== "undefined" && today instanceof Date ? today : new Date();
}

// "Oct 5", "October 5th, 2026", "5 Oct 2026", or "Monday, Oct 5" -> { month (1-12), day, year (or null) };
// null when it isn't a date written with its month's name
const MONTH_NAMES = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
function namedDate(text) {
  const words = text.replace(/^(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,?\s+/i, "");
  const monthFirst = words.match(/^([a-z]{3,})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?$/i);
  const dayFirst = monthFirst ? null : words.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,})\.?,?(?:\s+(\d{4}))?$/i);
  if (!monthFirst && !dayFirst) return null;
  const [name, dayText] = monthFirst ? [monthFirst[1], monthFirst[2]] : [dayFirst[2], dayFirst[1]];
  const month = MONTH_NAMES.findIndex(full => full.startsWith(name.toLowerCase())) + 1;
  if (month === 0) return null;
  const yearText = (monthFirst || dayFirst)[3];
  return { month, day: Number(dayText), year: yearText ? Number(yearText) : null };
}

//#endregion

// =====================================================================
// #region THE CALENDAR THAT PICKS A DAY (the calendar button beside a date box)
// =====================================================================
// The calendar button opens a small calendar under its date box, drawn like Home's: a month of square days, each with
// its number (today glowing, the picked day in red), under the month and the year. Each of those is a box to type in,
// with a list that drops down under it while it's being typed in (or tapped), which scrolls on its own, and ‹ and ›
// step a month. Picking a month or a year shows it, and the calendar stays open. Tapping a day writes it into the date
// box in this device's date format and closes the calendar; so do Today, a tap outside it, Close, and Escape. It
// starts on the date typed in the box (or this month), and lives in the screen layer (Layout.js), so it stays in view
// however the page is zoomed or scrolled.

const DatePicker = (() => {
  const MONTH_LABELS = MONTH_NAMES.map(name => name[0].toUpperCase() + name.slice(1));
  const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const YEARS_AROUND = 10; // Years listed before and after this one, without a min or max of its own
  const MARGIN = 8;        // Space kept between the calendar and the edges of the screen
  let shown = null;        // The open calendar: { el, input, button, options, view: { year, month }, days, monthBox, yearBox }

  const make = (tag, className = "", text = "") => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text) el.textContent = text;
    return el;
  };
  const midnight = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // The calendar button for a typed date box: a glass button with the site's calendar icon (stylesheet.css
  // .iconCalendar). options: { label (what the box is, like "End Date"), min, max (Dates, or null), today (false leaves
  // out the Today button, like for a birth date), pastYears (the box reads a 2-digit year as a past one, see
  // parseTypedDate) }
  function button(input, options = {}) {
    const el = make("button", "budgetButton pickDay");
    const icon = make("span", "buttonIcon iconCalendar");
    icon.setAttribute("aria-hidden", "true");
    el.append(icon);
    el.type = "button";
    el.title = "Pick a date";
    el.setAttribute("aria-label", `Pick the ${String(options.label || "date").toLowerCase()}`);
    el.setAttribute("aria-haspopup", "dialog");
    el.setAttribute("aria-expanded", "false");
    el.addEventListener("click", () => (shown && shown.input === input ? close() : open(input, el, options)));
    return el;
  }

  // Open the calendar for a date box, under it (above it when there's no room below)
  function open(input, opener, options = {}) {
    close(true);
    const min = options.min ? midnight(options.min) : null;
    const max = options.max ? midnight(options.max) : null;
    const typed = input.value.trim() ? parseTypedDate(input.value, { pastYears: !!options.pastYears }) : new Date(NaN);
    const picked = isNaN(typed.getTime()) ? null : typed;
    let start = picked || midnight(new Date());
    if (max && start > max) start = max;
    if (min && start < min) start = min;

    const el = make("div", "datePicker");
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", `Pick the ${String(options.label || "date").toLowerCase()}`);
    shown = { el, input, opener, options: { ...options, min, max }, picked, view: { year: start.getFullYear(), month: start.getMonth() } };

    // The month and the year, each typed or picked from its list, between ‹ and ›
    const step = (by, label, text) => {
      const stepButton = make("button", "pickerStep", text);
      stepButton.type = "button";
      stepButton.setAttribute("aria-label", label);
      stepButton.addEventListener("click", () => showMonth(shown.view.year, shown.view.month + by));
      return stepButton;
    };
    shown.monthBox = choiceBox({
      className: "pickerMonth",
      label: "Month",
      items: monthItems,
      pick: (month) => showMonth(shown.view.year, month),
      text: () => MONTH_LABELS[shown.view.month]
    });
    shown.yearBox = choiceBox({
      className: "pickerYear",
      label: "Year",
      inputMode: "numeric",
      items: yearItems,
      pick: (year) => showMonth(year, shown.view.month),
      text: () => String(shown.view.year)
    });
    const head = make("div", "pickerHead");
    head.append(step(-1, "Month before", "‹"), shown.monthBox.el, shown.yearBox.el, step(1, "Next month", "›"));

    const weekdays = make("div", "pickerWeekdays");
    weekdays.setAttribute("aria-hidden", "true");
    for (const day of WEEKDAYS) weekdays.append(make("span", "", day));

    // Six weeks of days, always, so the calendar keeps its size from month to month
    const grid = make("div", "pickerDays");
    grid.setAttribute("role", "grid");
    shown.days = [];
    for (let i = 0; i < 42; i++) {
      const day = make("button", "pickerDay");
      day.type = "button";
      day.addEventListener("click", () => choose(day.date));
      grid.append(day);
      shown.days.push(day);
    }
    grid.addEventListener("keydown", moveWithKeys);

    const foot = make("div", "pickerFoot");
    const now = midnight(new Date());
    if (options.today !== false && (!min || now >= min) && (!max || now <= max)) {
      const todayButton = make("button", "budgetButton", "Today");
      todayButton.type = "button";
      todayButton.addEventListener("click", () => choose(now));
      foot.append(todayButton);
    }
    const closeButton = make("button", "budgetButton", "Close");
    closeButton.type = "button";
    closeButton.addEventListener("click", () => close());
    foot.append(closeButton);

    el.append(head, weekdays, grid, foot);
    (window.ScreenLayer ? window.ScreenLayer.element : document.body).append(el);
    opener.setAttribute("aria-expanded", "true");
    showMonth(shown.view.year, shown.view.month);
    place();
    window.FloatingWindows?.zoomOpen(el, opener);
    // A keyboard starts on the picked day (or today); a finger shouldn't get a phone's keyboard
    if (window.matchMedia("(pointer: fine)").matches) (grid.querySelector(".isPicked") || grid.querySelector(".isToday") || shown.days[0]).focus({ preventScroll: true });
  }

  // Close it (immediately: with no shrinking back into its button)
  function close(immediately = false) {
    if (!shown) return;
    const { el, opener } = shown;
    shown = null;
    opener.setAttribute("aria-expanded", "false");
    el.inert = true;
    if (immediately || !window.FloatingWindows || reducedMotion()) el.remove();
    else window.FloatingWindows.zoomClose(el, opener, () => el.remove());
  }

  // Show a month (it rolls into the year before or after), and mark today, the picked day, and days that can't be picked
  function showMonth(year, month) {
    const first = new Date(year, month, 1);
    shown.view = { year: first.getFullYear(), month: first.getMonth() };
    shown.monthBox.refresh();
    shown.yearBox.refresh();
    const { min, max } = shown.options;
    const now = midnight(new Date());
    const start = addDays(first, -first.getDay());
    shown.days.forEach((day, i) => {
      const date = addDays(start, i);
      day.date = date;
      // (A number is only written when it changes: Safari drops a tap on a day whose text was swapped under the finger)
      if (day.textContent !== String(date.getDate())) day.textContent = String(date.getDate());
      day.disabled = (!!min && date < min) || (!!max && date > max);
      day.classList.toggle("isOtherMonth", date.getMonth() !== shown.view.month);
      day.classList.toggle("isToday", date.getTime() === now.getTime());
      const isPicked = !!shown.picked && date.getTime() === shown.picked.getTime();
      day.classList.toggle("isPicked", isPicked);
      day.setAttribute("aria-pressed", String(isPicked));
      day.setAttribute("aria-label", showDate(date));
      day.tabIndex = -1;
    });
    const focusable = shown.days.find(day => day.classList.contains("isPicked") && !day.classList.contains("isOtherMonth"))
      || shown.days.find(day => day.classList.contains("isToday") && !day.classList.contains("isOtherMonth"))
      || shown.days.find(day => !day.classList.contains("isOtherMonth"));
    focusable.tabIndex = 0;
  }

  // A day was picked: into the date box, in this device's date format (an "input" and a "change" go with it, like typing)
  function choose(date) {
    if (!shown || !(date instanceof Date)) return;
    const { input } = shown;
    const text = showDate(date);
    close();
    if (input.value === text) return;
    input.value = text;
    input.dataset.touched = "1";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // The keyboard on the days: arrows move a day or a week, Page Up and Page Down a month, Home and End to the week's
  // ends, and Enter or Space picks (the browser's own for a button)
  function moveWithKeys(event) {
    const moves = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    const from = event.target.date;
    if (!from) return;
    let to = null;
    if (event.key in moves) to = addDays(from, moves[event.key]);
    else if (event.key === "PageUp") to = addMonths(from, -1);
    else if (event.key === "PageDown") to = addMonths(from, 1);
    else if (event.key === "Home") to = addDays(from, -from.getDay());
    else if (event.key === "End") to = addDays(from, 6 - from.getDay());
    if (!to) return;
    event.preventDefault();
    if (to.getMonth() !== shown.view.month || to.getFullYear() !== shown.view.year) showMonth(to.getFullYear(), to.getMonth());
    const target = shown.days.find(day => day.date.getTime() === to.getTime());
    if (!target) return;
    shown.days.forEach(day => { day.tabIndex = day === target ? 0 : -1; });
    target.focus();
  }

  // The months that match what's typed: by name ("oc" is October) or number ("10")
  function monthItems(text) {
    const typed = text.trim().toLowerCase();
    return MONTH_LABELS.map((label, month) => ({ value: month, label, current: month === shown.view.month }))
      .filter(item => !typed || item.label.toLowerCase().startsWith(typed) || String(item.value + 1).startsWith(typed.replace(/^0/, "")));
  }

  // The years that match what's typed (the years it can show, or any four-digit year typed in full)
  function yearItems(text) {
    const typed = text.trim();
    const { min, max } = shown.options;
    const thisYear = new Date().getFullYear();
    const first = min ? min.getFullYear() : Math.min(thisYear - YEARS_AROUND, shown.view.year);
    const last = max ? max.getFullYear() : Math.max(thisYear + YEARS_AROUND, shown.view.year);
    const items = [];
    for (let year = first; year <= last; year++) {
      if (!typed || String(year).startsWith(typed)) items.push({ value: year, label: String(year), current: year === shown.view.year });
    }
    if (/^\d{4}$/.test(typed) && items.length === 0 && Number(typed) >= 1000) items.push({ value: Number(typed), label: typed, current: false });
    return items;
  }

  // A box to type the month or the year in, with the list that drops down under it while it's in use. items(text): the
  // choices that match ([{ value, label, current }]); pick(value): one was chosen; text(): what it says otherwise. Enter
  // (or leaving it with just one match, or an exact one) picks; the arrow keys move through the list; Escape puts it back.
  let choiceCount = 0;
  function choiceBox({ className, label, inputMode = "", items, pick, text }) {
    const wrap = make("div", "pickerChoice");
    const input = make("input", `pickerInput ${className}`);
    input.type = "text";
    input.autocomplete = "off";
    input.spellcheck = false;
    if (inputMode) input.inputMode = inputMode;
    input.setAttribute("aria-label", label);
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-expanded", "false");
    const list = make("ul", "pickerList");
    list.id = `pickerList${++choiceCount}`;
    list.setAttribute("role", "listbox");
    list.hidden = true;
    input.setAttribute("aria-controls", list.id);
    let options = [];
    let active = -1;
    let pressedWith = ""; // What pressed the list last: "mouse", "touch", or "pen"
    list.addEventListener("pointerdown", (event) => {
      pressedWith = event.pointerType;
      event.preventDefault(); // (The box keeps its focus, so its list stays open)
    });

    const mark = () => {
      [...list.children].forEach((item, i) => item.classList.toggle("isActive", i === active));
      const item = list.children[active];
      if (item) item.scrollIntoView({ block: "nearest" });
    };
    const fill = (typed) => {
      options = items(typed);
      active = typed ? (options.length ? 0 : -1) : options.findIndex(option => option.current);
      list.replaceChildren(...options.map(option => {
        const item = make("li", "pickerOption", option.label);
        item.setAttribute("role", "option");
        // A tap picks it (a finger sliding through the list scrolls it instead), and the calendar stays open on that
        // month or year. Picked with a finger, the box lets go too, so the phone's keyboard goes away.
        item.addEventListener("click", () => {
          done(option.value);
          if (pressedWith && pressedWith !== "mouse") input.blur();
        });
        return item;
      }));
      list.hidden = options.length === 0;
      input.setAttribute("aria-expanded", String(!list.hidden));
      mark();
    };
    const done = (value) => {
      list.hidden = true;
      input.setAttribute("aria-expanded", "false");
      if (value !== undefined) pick(value);
      input.value = text();
      input.select();
    };

    // (Nothing to do once the calendar is closed: a box taken off the page can still lose its focus)
    input.addEventListener("focus", () => {
      if (!shown) return;
      fill("");
      requestAnimationFrame(() => { if (document.activeElement === input) input.select(); });
    });
    input.addEventListener("input", () => { if (shown) fill(input.value); });
    input.addEventListener("keydown", (event) => {
      if (!shown) return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        if (list.hidden) fill("");
        if (options.length) active = (active + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
        mark();
      } else if (event.key === "Enter") {
        event.preventDefault();
        done(options[active]?.value);
      } else if (event.key === "Escape" && !list.hidden) {
        event.stopPropagation(); // Only the list closes
        done();
      }
    });
    input.addEventListener("blur", () => {
      if (!shown) return;
      const typed = input.value.trim().toLowerCase();
      const exact = options.find(option => option.label.toLowerCase() === typed);
      list.hidden = true;
      input.setAttribute("aria-expanded", "false");
      // (Only a different one: the calendar is left as it is otherwise, so a day tapped as this box lets go still counts)
      const chosen = typed ? exact || (options.length === 1 ? options[0] : null) : null;
      if (chosen && !chosen.current) pick(chosen.value);
      input.value = text();
    });
    wrap.append(input, list);
    return {
      el: wrap,
      // Say what the calendar shows (not while it's being typed in)
      refresh() { if (document.activeElement !== input) input.value = text(); }
    };
  }

  // Under the date box (its row, with the calendar button), at the left of it, or above it when it doesn't fit below. In the screen
  // layer's own pixels (Layout.js). Its own size is its layout's, not its box on the screen, which is still small while it
  // zooms open.
  function place() {
    if (!shown) return;
    const { el, input } = shown;
    const layer = window.ScreenLayer;
    const anchor = input.closest(".dateRow") || input;
    const area = layer ? layer.size() : { width: document.documentElement.clientWidth, height: window.innerHeight };
    const rect = layer ? layer.rectOf(anchor) : anchor.getBoundingClientRect();
    const box = { width: el.offsetWidth, height: el.offsetHeight };
    const left = Math.min(Math.max(rect.left, MARGIN), Math.max(MARGIN, area.width - box.width - MARGIN));
    let top = rect.bottom + 6;
    if (top + box.height > area.height - MARGIN) {
      top = rect.top - box.height - 6 >= MARGIN ? rect.top - box.height - 6 : Math.max(MARGIN, area.height - box.height - MARGIN);
    }
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }

  // A tap anywhere else closes it (the button that opened it toggles it itself), and Escape does too (only the calendar,
  // not a box it's over)
  document.addEventListener("pointerdown", (event) => {
    if (shown && !shown.el.contains(event.target) && !shown.opener.contains(event.target)) close();
  }, true);
  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !shown) return;
    // (A month or year list that's open closes by itself first: choiceBox)
    if (event.target.matches?.(".pickerInput[aria-expanded='true']")) return;
    event.stopImmediatePropagation();
    const opener = shown.opener;
    close();
    opener.focus({ preventScroll: true });
  }, true);
  // Leaving the page closes it right away (see FloatingWindows in Layout.js); the screen moving, or the page (or the panel
  // the box is in) scrolling, keeps it by its box
  window.FloatingWindows?.closeOnPageExit(() => close(true));
  window.ScreenLayer?.onChange(place);
  document.addEventListener("scroll", (event) => {
    if (shown && !shown.el.contains(event.target)) place();
  }, { capture: true, passive: true });

  return { button, open, close, isOpen: () => !!shown };
})();

window.DatePicker = DatePicker;

//#endregion
