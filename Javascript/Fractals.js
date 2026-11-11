// Fractals: the account's calendar. Calendar Fractals are its calendars (each a name and a color), and their entries show
// on Home's days with the budget's, in their fractal's color: a line each on a day that isn't zoomed, and on a zoomed day,
// blocks beside the hours (or the same lines, with its List switch on). This file keeps the calendar as the API sends it
// (the API's fractals.js), works out which entries land on which days (repeating ones too, the same way the API does for
// their alerts), draws them into a day, and has the calendar's windows: the fractal list, a fractal's name and color, and
// a calendar entry's form (New Entry's Calendar Entry, and a tapped entry's). Home (Calendar Page.js), the Budgets,
// Calendars & Spreadsheets page, Settings, and the Quick Calendar page use it.

window.Fractals = (() => {
  "use strict";

  // What this device keeps (Layout.js keeps them through a sign-out, like its other choices)
  const VIEW_KEY = "prismal_calendar_view";   // What Home's calendar shows: "budget", "both", or "calendar"
  const OFF_KEY = "prismal_fractals_off";     // The fractals unchecked here: [id, ...] ("shared" for Shared With You)
  const LIST_KEY = "prismal_calendar_list";   // "1": a zoomed day lists its calendar entries instead of drawing blocks
  const ICONS_KEY = "prismal_quickcal_icons"; // The Quick Calendar icons this device made or used (the starts of their keys' hashes)
  const VIEWS = ["budget", "both", "calendar"];

  const SHARED = "shared";          // The fractal an entry shared with the account shows under
  const SHARED_COLOR = "#8a8fa8";
  const COLORS = ["#4f8cff", "#00b8a9", "#3fbf5f", "#b8c400", "#f5a623", "#ff6b35", "#ff4d6d", "#d94fd3", "#9b6bff", "#5b6cff", "#8a8fa8", "#c98a5a"];
  const MAX_TITLE = 100;
  const MAX_NOTES = 20000;
  const MAX_ALERTS = 30;
  const DAY_MINUTES = 1440;
  const HOUR_EM = 2.2;         // How tall an hour is beside a zoomed day's times
  const MIN_BLOCK_MINUTES = 30; // The shortest a block is drawn (so its title fits)
  const INDENT_EM = 1.5;       // How far each overlapping block starts to the right of the one before
  const LAST_BLOCK_EM = 7;     // The least room the rightmost block keeps (more blocks than fit scroll sideways)
  const TRAVEL_CHOICES = [0, 5, 10, 15, 20, 30, 45, 60, 90, 120];
  const REPEAT_UNITS = [{ value: "days", label: "Days" }, { value: "weeks", label: "Weeks" }, { value: "months", label: "Months" }];
  const ALERT_UNITS = [{ value: "minutes", label: "Minutes" }, { value: "days", label: "Days" }, { value: "weeks", label: "Weeks" }, { value: "months", label: "Months" }];

  const el = (tag, className = "", text = "") => BudgetUI.element(tag, className, text);
  const read = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
  const write = (key, value) => { try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch {} };
  const toast = (message, warning = false) => BudgetUI.showToast(message, warning);

  // =====================================================================
  // #region THE CALENDAR'S DATA
  // =====================================================================

  let data = null;    // { fractals, events, invitations, waiting, links, icons }, once it's in
  let loading = null; // That request, while it's on its way
  let dayCache = new Map();

  // How the calendar is read and saved. The Quick Calendar page swaps in its own (its key instead of a sign-in), where
  // entries wait to be added and nothing else changes. save's sharesFrom: a new entry is shared with the people another
  // of the account's entries is (a repeating entry's day changed by itself).
  let store = {
    quick: false,
    load: () => call(`/api/fractals${iconsQuery()}`),
    save: (id, fractal, event, sharesFrom = null) => call("/api/fractals/event", { ...(id ? { id } : {}), fractal, event, ...(sharesFrom ? { sharesFrom } : {}) }),
    remove: (id) => call("/api/fractals/event/delete", { id })
  };

  // One request (a POST of JSON with a body, a GET without): { ok, status, data }, never throwing (status 0: no answer)
  async function call(path, body) {
    const token = read("prismal_jwt");
    try {
      const response = await fetch(`${window.API_BASE_URL}${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      let answer = null;
      try { answer = await response.json(); } catch {}
      if (response.status === 401 && !store.quick && typeof signedOutElsewhere === "function") signedOutElsewhere();
      return { ok: response.ok, status: response.status, data: answer };
    } catch {
      return { ok: false, status: 0, data: null };
    }
  }

  // What went wrong with a request, in words
  function problem(result, fallback) {
    if (result.status === 0) return "Couldn't reach the server. Please check your connection and try again.";
    return (result.data && result.data.error) || fallback;
  }

  // A new copy of the calendar from the API (every route about it answers with one)
  function took(answer) {
    data = {
      fractals: answer.fractals,
      events: Array.isArray(answer.events) ? answer.events : [],
      invitations: Array.isArray(answer.invitations) ? answer.invitations : [],
      waiting: Array.isArray(answer.waiting) ? answer.waiting : [],
      links: answer.links || { all: null, fractals: {} },
      icons: answer.icons || 0
    };
    dayCache = new Map();
    document.dispatchEvent(new CustomEvent("fractals:changed"));
  }

  // The calendar, from the API (again, when fresh); resolves to it, or null when it couldn't load
  function load(fresh = false) {
    if (data && !fresh) return Promise.resolve(data);
    if (loading) return loading;
    loading = store.load().then((result) => {
      if (result.ok && result.data && Array.isArray(result.data.fractals)) took(result.data);
      return data;
    }).finally(() => { loading = null; });
    return loading;
  }

  // A change to the calendar: the answer is the calendar as it is now. Resolves to the request's result.
  async function change(route, body) {
    const result = await call(`/api/fractals/${route}`, body);
    if (result.ok && result.data && Array.isArray(result.data.fractals)) took(result.data);
    return result;
  }

  // This device's own Quick Calendar icons, for the API: what they queued joins the calendar as it loads here
  function ownIcons() {
    try {
      const list = JSON.parse(read(ICONS_KEY) || "[]");
      return Array.isArray(list) ? list.filter(id => /^[0-9a-f]{16}$/.test(id)) : [];
    } catch {
      return [];
    }
  }
  const iconsQuery = () => (ownIcons().length > 0 ? `?icons=${ownIcons().join(",")}` : "");

  // Keep an icon's id as this device's own (the start of its key's SHA-256, the way the API names it)
  async function rememberIcon(key) {
    if (!key || !window.crypto || !crypto.subtle) return;
    try {
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(key)));
      const id = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("").slice(0, 16);
      write(ICONS_KEY, JSON.stringify([id, ...ownIcons().filter(known => known !== id)].slice(0, 20)));
    } catch {}
  }

  //#endregion

  // =====================================================================
  // #region WHAT THIS DEVICE SHOWS
  // =====================================================================

  // What Home's calendar shows: the budget, the calendar, or both (the Quick Calendar page only has the calendar)
  function view() {
    if (store.quick) return "calendar";
    const stored = read(VIEW_KEY);
    return VIEWS.includes(stored) ? stored : "both";
  }

  // Show the budget, the calendar, or both (kept on this device), and draw again
  function setView(mode) {
    write(VIEW_KEY, VIEWS.includes(mode) ? mode : "both");
    document.dispatchEvent(new CustomEvent("fractals:changed"));
  }

  // The fractals unchecked on this device
  function hidden() {
    try {
      const list = JSON.parse(read(OFF_KEY) || "[]");
      return Array.isArray(list) ? list.map(String) : [];
    } catch {
      return [];
    }
  }

  const isShown = (fractalId) => !hidden().includes(String(fractalId));

  // Check or uncheck a fractal on this device (its entries show while it's checked)
  function setShown(fractalId, on) {
    const rest = hidden().filter(id => id !== String(fractalId));
    write(OFF_KEY, JSON.stringify(on ? rest : [...rest, String(fractalId)]));
    dayCache = new Map();
    document.dispatchEvent(new CustomEvent("fractals:changed"));
  }

  // Does a zoomed day list its calendar entries (instead of drawing them beside the hours)?
  const listMode = () => read(LIST_KEY) === "1";

  // A fractal's color (Shared With You's is grey)
  function colorOf(fractalId) {
    if (fractalId === SHARED) return SHARED_COLOR;
    const fractal = data && data.fractals.find(item => item.id === fractalId);
    return fractal ? fractal.color : SHARED_COLOR;
  }

  // Black or white, whichever reads better on a color (by its contrast with each)
  function textOn(hex) {
    const channel = (index) => {
      const value = parseInt(hex.slice(1 + 2 * index, 3 + 2 * index), 16) / 255;
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    };
    const luminance = 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
    return (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05) ? "#000000" : "#ffffff";
  }

  // A color with some of the page showing through it
  const seeThrough = (hex, alpha) => `rgba(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)}, ${alpha})`;

  //#endregion

  // =====================================================================
  // #region WHEN AN ENTRY HAPPENS (the API's fractals.js works these out the same way)
  // =====================================================================

  const dayOf = (ymd) => createSafeMidnight(ymd, true);
  const plusDays = (ymd, days) => formatToYMD(addDays(dayOf(ymd), days));
  const daysBetween = (from, to) => Math.round((dayOf(to) - dayOf(from)) / 86400000);
  const minutesOf = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

  // The day an entry's occurrence starts (0: its first). A monthly one on the 31st lands on a shorter month's last day.
  function occurrenceDay(event, index) {
    if (!event.repeat || index === 0) return event.start;
    const steps = event.repeat.count * index;
    if (event.repeat.unit === "months") return formatToYMD(addMonths(dayOf(event.start), steps));
    return plusDays(event.start, event.repeat.unit === "weeks" ? steps * 7 : steps);
  }

  // The first occurrence that starts on or after a day
  function firstOccurrenceFrom(event, ymd) {
    if (!event.repeat || ymd <= event.start) return 0;
    if (event.repeat.unit !== "months") {
      const period = event.repeat.count * (event.repeat.unit === "weeks" ? 7 : 1);
      return Math.ceil(daysBetween(event.start, ymd) / period);
    }
    const months = (Number(ymd.slice(0, 4)) - Number(event.start.slice(0, 4))) * 12 + Number(ymd.slice(5, 7)) - Number(event.start.slice(5, 7));
    let index = Math.max(0, Math.floor(months / event.repeat.count) - 1);
    while (occurrenceDay(event, index) < ymd) index++;
    return index;
  }

  // Each time an entry happens on the days from one through another: [{ event, day (it starts), last (it ends) }]
  function occurrences(event, from, to) {
    const span = daysBetween(event.start, event.end);
    const list = [];
    let index = firstOccurrenceFrom(event, plusDays(from, -span));
    for (let tries = 0; tries < 4000; tries++, index++) {
      if (!event.repeat && index > 0) break;
      const day = occurrenceDay(event, index);
      if (day > to || (event.until && day > event.until)) break;
      if (event.skip && event.skip.includes(day)) continue;
      list.push({ event, day, last: span ? plusDays(day, span) : day });
    }
    return list;
  }

  // The part of an occurrence that's on one day: { event, day, last, whole (all of that day), start, end (minutes) }, or
  // null when none of it is (one that ends at midnight isn't on the day after)
  function partOn(occurrence, ymd) {
    const { event, day, last } = occurrence;
    if (event.allDay) return { ...occurrence, on: ymd, whole: true, start: 0, end: DAY_MINUTES };
    const start = ymd === day ? minutesOf(event.startTime) : 0;
    const end = ymd === last ? minutesOf(event.endTime) : DAY_MINUTES;
    if (end <= start && ymd !== day) return null;
    return { ...occurrence, on: ymd, whole: start === 0 && end === DAY_MINUTES, start, end: Math.max(end, start) };
  }

  // Work out the entries on each day from one through another, once (a window of the calendar)
  function prepare(from, to) {
    if (!data) return;
    const days = new Map();
    for (let day = from; day <= to; day = plusDays(day, 1)) days.set(day, []);
    const off = hidden();
    for (const event of data.events) {
      if (off.includes(String(event.fractal))) continue;
      for (const occurrence of occurrences(event, from, to)) {
        for (let day = occurrence.day < from ? from : occurrence.day; day <= occurrence.last && day <= to; day = plusDays(day, 1)) {
          const part = partOn(occurrence, day);
          if (part) days.get(day).push(part);
        }
      }
    }
    for (const [day, parts] of days) {
      parts.sort((a, b) => (b.whole - a.whole) || (a.start - b.start) || (b.end - a.end) || a.event.title.localeCompare(b.event.title));
      dayCache.set(day, parts);
    }
  }

  // The calendar entries on a day (a Date), in order: the ones all day, then by when they start
  function eventsOn(date) {
    if (!data) return [];
    const ymd = formatToYMD(date);
    if (!dayCache.has(ymd)) prepare(ymd, ymd);
    return dayCache.get(ymd) || [];
  }

  //#endregion

  // =====================================================================
  // #region TIMES AS PEOPLE READ THEM
  // =====================================================================

  // Does this device show times as 1:00 PM (not 13:00)?
  const twelveHour = (() => {
    try { return new Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions().hour12 !== false; } catch { return true; }
  })();

  // A time of day: "9:30 AM" or "09:30" (short: "9:30a", for a day's small lines)
  function timeText(minutes, short = false) {
    const hour = Math.floor(minutes / 60) % 24;
    const minute = minutes % 60;
    if (!twelveHour) return minutes === DAY_MINUTES ? "24:00" : `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    const shown = `${((hour + 11) % 12) + 1}${minute || !short ? `:${String(minute).padStart(2, "0")}` : ""}`;
    return short ? `${shown}${hour < 12 ? "a" : "p"}` : `${shown} ${hour < 12 ? "AM" : "PM"}`;
  }

  // When a day's part of an entry is, in a few words: "All day", "9:30a", or "until 5p" (the last day of a long one)
  function partWords(part, short = true) {
    if (part.whole) return "All day";
    if (part.on !== part.day) return `until ${timeText(part.end, short)}`;
    return short ? timeText(part.start, true) : `${timeText(part.start)} to ${part.on === part.last ? timeText(part.end) : "midnight"}`;
  }

  // An entry's days and times in full, for its window: "Thu 11/12/2026, 12:00 PM to 1:00 PM"
  function whenWords(event, day = event.start) {
    const last = plusDays(day, daysBetween(event.start, event.end));
    const first = showWeekdayDate(dayOf(day));
    if (event.allDay) return day === last ? `${first}, all day` : `${first} to ${showWeekdayDate(dayOf(last))}`;
    const start = timeText(minutesOf(event.startTime));
    const end = timeText(minutesOf(event.endTime));
    return day === last ? `${first}, ${start} to ${end}` : `${first}, ${start} to ${showWeekdayDate(dayOf(last))}, ${end}`;
  }

  // "Every 2 weeks until 12/31/2026"
  function repeatWords(event) {
    if (!event.repeat) return "";
    const unit = event.repeat.count === 1 ? event.repeat.unit.slice(0, -1) : `${event.repeat.count} ${event.repeat.unit}`;
    return `Every ${unit}${event.until ? ` until ${showDate(dayOf(event.until))}` : ""}`;
  }

  //#endregion

  // =====================================================================
  // #region A DAY'S CALENDAR ENTRIES
  // =====================================================================

  // The small calendar before an entry's words (drawn in the words' own color: budgetStyle.css .eventSprite)
  function sprite() {
    const mark = el("span", "eventSprite");
    mark.setAttribute("aria-hidden", "true");
    return mark;
  }

  // What every drawn entry carries, so a tap knows which one it is and which day's
  function mark(node, part) {
    node.classList.add("fractalEvent");
    node.dataset.event = part.event.id;
    node.dataset.day = part.day;
    // (One a Quick Calendar icon added that hasn't joined the calendar yet has a dashed edge)
    node.classList.toggle("isWaiting", !!part.event.waiting);
    const color = colorOf(part.event.fractal);
    node.style.color = textOn(color);
    return color;
  }

  // An entry as a line: its calendar mark, when it is, and its title, in a block of its fractal's color
  function eventLine(part) {
    const line = BudgetUI.noTranslate(el("div", "lineEvent fractalPart"));
    line.style.background = mark(line, part);
    line.append(sprite(), el("span", "eventTime", partWords(part)), ` ${part.event.title}`);
    line.setAttribute("aria-label", `${part.event.title}, ${partWords(part, false)}`);
    return line;
  }

  // The entries with a time, laid out beside the hours: each in the first column that's free when it starts (so they go
  // left to right, and start at the left again once the first ones end), with its travel time counted as part of it.
  // { blocks: [{ part, column, from (with its travel time), start, end, dot }], columns }
  function layOut(parts) {
    const ends = [];
    const blocks = parts.map(part => {
      const from = Math.max(0, part.start - (part.on === part.day ? part.event.travel || 0 : 0));
      const end = Math.min(DAY_MINUTES, Math.max(part.end, part.start + MIN_BLOCK_MINUTES));
      let column = ends.findIndex(taken => taken <= from);
      if (column === -1) column = ends.length;
      ends[column] = end;
      return { part, column, from, start: part.start, end };
    });
    // A block's title is covered when one to its right starts within the hour after it: it shows a dot instead
    for (const block of blocks) {
      block.dot = blocks.some(other => other.column > block.column && other.from >= block.start && other.from - block.start < 60 && other.from < block.end);
    }
    return { blocks, columns: ends.length };
  }

  // A zoomed day's times: the hours down the left (midnight to midnight), and a block for each entry with a time, in its
  // fractal's color with a little of the page showing through, its travel time dimmer above it. More blocks side by side
  // than fit scroll sideways inside it; it's as tall as its hours, so the page scrolls, never the day.
  function timesBlock(parts) {
    const { blocks, columns } = layOut(parts);
    const scroller = el("div", "dayTimesScroll");
    const grid = el("div", "dayTimesGrid");
    grid.style.height = `${24 * HOUR_EM}em`;
    const hours = el("div", "dayHours");
    for (let hour = 0; hour <= 24; hour++) {
      const label = el("span", "dayHour");
      label.append(el("span", "", twelveHour ? `${((hour + 11) % 12) + 1} ${hour % 24 < 12 ? "AM" : "PM"}` : `${String(hour).padStart(2, "0")}:00`));
      label.style.top = `${hour * HOUR_EM}em`;
      hours.append(label);
    }
    const area = el("div", "dayBlocks");
    area.style.minWidth = `${(columns - 1) * INDENT_EM + LAST_BLOCK_EM}em`;
    for (const block of blocks) {
      const left = `${block.column * INDENT_EM}em`;
      const color = colorOf(block.part.event.fractal);
      if (block.from < block.start) {
        const travel = el("div", "timeTravel");
        travel.style.top = `${(block.from / 60) * HOUR_EM}em`;
        travel.style.height = `${((block.start - block.from) / 60) * HOUR_EM}em`;
        travel.style.left = left;
        travel.style.background = seeThrough(color, 0.35);
        travel.setAttribute("aria-hidden", "true");
        area.append(travel);
      }
      const node = BudgetUI.noTranslate(el("div", "timeBlock"));
      mark(node, block.part);
      node.style.background = seeThrough(color, 0.86);
      node.style.top = `${(block.start / 60) * HOUR_EM}em`;
      node.style.height = `${((block.end - block.start) / 60) * HOUR_EM}em`;
      node.style.left = left;
      node.setAttribute("role", "button");
      node.tabIndex = 0;
      node.setAttribute("aria-label", `${block.part.event.title}, ${partWords(block.part, false)}`);
      node.append(el("span", "timeBlockTitle", block.dot ? "•" : block.part.event.title));
      if (!block.dot && block.end - block.start >= 60) node.append(el("span", "timeBlockTime", partWords(block.part, false)));
      area.append(node);
    }
    grid.append(hours, area);
    scroller.append(grid);
    return scroller;
  }

  // Draw a day's calendar entries into its cell (a day of Home's calendar, or a guest day), after the budget's lines: a
  // line for each, and for a zoomed day, its List switch and its times. Nothing while the calendar shows only the budget.
  function renderDay(td, date) {
    const content = td.querySelector(".cell-content");
    if (!content) return;
    content.querySelectorAll(".fractalPart").forEach(node => node.remove());
    td.classList.remove("hasEvents");
    if (!data || view() === "budget") return;
    const parts = eventsOn(date);
    if (parts.length === 0) return;
    td.classList.add("hasEvents");
    const before = content.querySelector(".cell-action-btn");
    const add = (node) => content.insertBefore(node, before);
    for (const part of parts) add(eventLine(part));
    if (!td.classList.contains("is-editing")) return;

    // The zoomed day: List (the lines above) or blocks (the all-day ones in a row, then the times)
    const listSwitch = BudgetUI.checkboxField({ label: "List", checked: listMode() });
    listSwitch.el.classList.add("dayListSwitch", "fractalPart");
    listSwitch.input.addEventListener("change", () => {
      write(LIST_KEY, listSwitch.input.checked ? "1" : null);
      document.dispatchEvent(new CustomEvent("fractals:changed"));
    });
    content.insertBefore(listSwitch.el, content.querySelector(".lineEvent"));
    td.classList.toggle("eventsAsList", listMode());
    if (!listMode()) {
      const timed = parts.filter(part => !part.whole);
      const times = el("div", "dayTimes fractalPart");
      for (const part of parts.filter(item => item.whole)) {
        const chip = eventLine(part);
        chip.classList.remove("fractalPart");
        chip.classList.add("dayChip");
        times.append(chip);
      }
      if (timed.length > 0) times.append(timesBlock(timed));
      add(times);
    }
    // Each line (a List's, or an all-day one over the times) is a stop for the Tab key that Enter or Space opens, like
    // the budget's entries and the blocks (a line hidden behind the blocks is skipped)
    content.querySelectorAll(".lineEvent").forEach(line => {
      line.tabIndex = 0;
      line.setAttribute("role", "button");
    });
  }

  // A day just zoomed in (Process Budget.js zoomDay): its switch and times go in before it's measured. While the
  // calendar shows only its own entries, the page then scrolls to the day's first block when it's below the screen (the
  // hours start at midnight, and most days start later).
  function dayZoomed(td) {
    const time = typeof dayTime === "function" ? dayTime(td) : null;
    if (time === null) return;
    renderDay(td, new Date(time));
    if (view() !== "calendar") return;
    setTimeout(() => {
      const first = td.classList.contains("is-editing") ? td.querySelector(".timeBlock") : null;
      if (!first) return;
      const top = first.getBoundingClientRect().top;
      if (top > window.innerHeight * 0.7) window.scrollBy({ top: top - window.innerHeight * 0.35, behavior: window.lessMotion && window.lessMotion() ? "auto" : "smooth" });
    }, 520);
  }

  // The entry a tapped line or block is: { event, day }, or null
  function tapped(node) {
    const event = data && data.events.find(item => item.id === node.dataset.event);
    return event ? { event, day: node.dataset.day } : null;
  }

  // A tap on an entry of a zoomed day opens it (not the tap that zooms the day, or one while it shrinks back)
  document.addEventListener("click", (event) => {
    const node = event.target.closest && event.target.closest(".elastic-table .fractalEvent");
    const td = node && node.closest("td");
    if (!td || !td.classList.contains("is-editing") || td.classList.contains("isZoomClosing")) return;
    const found = tapped(node);
    if (found) openEvent(node, found.event, found.day);
  });

  //#endregion

  // =====================================================================
  // #region THE FRACTAL LIST (the dropdown beside the calendar's buttons)
  // =====================================================================

  // A small button
  function button(label, kind, onClick, ariaLabel = "") {
    const node = el("button", `budgetButton ${kind}`.trim(), label);
    node.type = "button";
    if (ariaLabel) node.setAttribute("aria-label", ariaLabel);
    node.addEventListener("click", onClick);
    return node;
  }

  // A fractal's color as a small round swatch
  function swatch(color) {
    const dot = el("span", "fractalSwatch");
    dot.style.background = color;
    dot.setAttribute("aria-hidden", "true");
    return dot;
  }

  // One fractal in the list: a checkbox (it shows on the calendar while it's checked), its color and name, and Edit
  function fractalItem(fractal) {
    const item = el("li", "budgetItem fractalItem");
    const label = el("label", "fractalCheck");
    const box = el("input");
    box.type = "checkbox";
    box.checked = isShown(fractal.id);
    box.addEventListener("change", () => setShown(fractal.id, box.checked));
    const name = el("span", "budgetName", fractal.name);
    name.translate = false;
    label.append(box, swatch(fractal.color), name);
    item.append(label);
    if (fractal.id !== SHARED && !store.quick) item.append(button("Edit", "budgetShare", (event) => openFractal(event.currentTarget, fractal), `Edit ${fractal.name}`));
    return item;
  }

  // An entry someone shared with the account: whose, when, and Join or Decline
  function invitationItem(invitation) {
    const item = el("li", "budgetItem isInvitation");
    const about = el("div", "budgetOpen");
    const name = el("span", "budgetName", invitation.title);
    name.translate = false;
    const when = invitation.start ? ` on ${showDate(dayOf(invitation.start))}` : "";
    about.append(name, el("span", "budgetDetail", `From ${invitation.owner}${when}, for you to join`));
    const buttons = el("div", "budgetInvitationButtons");
    const answer = async (route) => {
      const result = await change(route, { event: invitation.id });
      if (!result.ok) return toast(problem(result, "That didn't work. Please try again."), true);
      if (result.data.error) return toast(result.data.error, true);
      toast(route === "join" ? `${invitation.title} is on your calendar, under Shared With You.` : `You declined ${invitation.title}.`);
    };
    buttons.append(button("Join", "primary", () => answer("join"), `Join ${invitation.title}`), button("Decline", "", () => answer("decline"), `Decline ${invitation.title}`));
    item.append(about, buttons);
    return item;
  }

  // Does the account have entries shared with it?
  const hasShared = () => !!data && data.events.some(event => event.fractal === SHARED);

  // The list's sections (the account's fractals, Shared With You, and invitations), into a box
  function fillList(box) {
    box.replaceChildren();
    if (!data) {
      box.append(el("p", "panelHint", "Loading your calendar..."));
      return;
    }
    const section = (heading, items) => {
      if (items.length === 0) return;
      box.append(el("h4", "budgetListHeading", heading));
      const list = el("ul", "budgetList");
      list.append(...items);
      box.append(list);
    };
    section("Yours", data.fractals.map(fractalItem));
    section("Shared With You", hasShared() ? [fractalItem({ id: SHARED, name: "Shared With You", color: SHARED_COLOR })] : []);
    section("Invitations", data.invitations.map(invitationItem));
  }

  // The picker's words: how many fractals show, and a dot while invitations wait
  function showPicker(picker) {
    if (!picker) return;
    const all = data ? data.fractals.length + (hasShared() ? 1 : 0) : 0;
    const shown = data ? data.fractals.filter(fractal => isShown(fractal.id)).length + (hasShared() && isShown(SHARED) ? 1 : 0) : 0;
    const invitations = data ? data.invitations.length : 0;
    picker.querySelector(".budgetPickerName").textContent = "Calendar Fractals";
    picker.querySelector(".budgetPickerDot").hidden = invitations === 0;
    picker.setAttribute("aria-label", `Calendar Fractals: ${shown} of ${all} showing.${invitations > 0 ? ` ${invitations} invitation${invitations === 1 ? "" : "s"}.` : ""} Pick which show`);
  }

  // Wire the dropdown button beside the calendar's buttons
  function wirePicker(picker) {
    picker.innerHTML = '<span class="budgetPickerName"></span><span class="budgetPickerDot" hidden></span><span class="budgetPickerArrow" aria-hidden="true">▾</span>';
    picker.setAttribute("aria-haspopup", "dialog");
    picker.setAttribute("aria-expanded", "false");
    picker.addEventListener("click", () => openList(picker));
    showPicker(picker);
    document.addEventListener("fractals:changed", () => showPicker(picker));
  }

  let listPanel = null;

  // The list drops down under the picker: check the fractals to show, edit one, answer invitations, or make a new one
  function openList(picker) {
    if (listPanel && listPanel.panel.isConnected && !listPanel.panel.classList.contains("isClosing")) {
      BudgetUI.closeAllPanels();
      return;
    }
    let refill = null;
    listPanel = BudgetUI.openPanel({
      origin: picker,
      size: "small",
      title: "Calendar Fractals",
      build(form, panel) {
        panel.panel.classList.add("budgetsPanel", "fractalsPanel");
        const box = el("div", "budgetLists");
        fillList(box);
        form.append(el("p", "panelHint", "Checked ones show on the calendar."), box);
        if (!store.quick) {
          form.append(BudgetUI.buttonRow([
            { label: "New Calendar Fractal", kind: "primary", onClick: (event) => openFractal(event.currentTarget, null) },
            { label: "Manage", onClick: () => { window.location.href = "/menu/spreadsheets.html#fractals"; } }
          ]));
        }
        refill = () => fillList(box);
        document.addEventListener("fractals:changed", refill);
      }
    });
    picker.setAttribute("aria-expanded", "true");
    watchClosed(listPanel, () => {
      picker.setAttribute("aria-expanded", "false");
      document.removeEventListener("fractals:changed", refill);
    });
    load(true); // (Shown as it was, then as it is now)
  }

  // Run done once a panel has closed (Budget UI.js takes it off the page)
  function watchClosed(panelApi, done) {
    const watcher = new MutationObserver(() => {
      if (panelApi.panel.isConnected && !panelApi.panel.classList.contains("isClosing")) return;
      watcher.disconnect();
      done();
    });
    watcher.observe(panelApi.panel, { attributes: true, attributeFilter: ["class"] });
    if (panelApi.panel.parentNode) watcher.observe(panelApi.panel.parentNode, { childList: true });
  }

  // A color to pick: the site's swatches, and a box for any other (the device's own color picker, where it has one)
  function colorField(value) {
    let current = value;
    const row = el("div", "fractalColors");
    row.setAttribute("role", "radiogroup");
    row.setAttribute("aria-label", "Color");
    const custom = el("input", "fractalColorBox");
    custom.type = "color";
    custom.value = value;
    custom.setAttribute("aria-label", "Another color");
    const choices = COLORS.map(color => {
      const choice = el("button", "fractalColor");
      choice.type = "button";
      choice.style.background = color;
      choice.setAttribute("role", "radio");
      choice.setAttribute("aria-label", `Color ${color}`);
      choice.addEventListener("click", () => set(color));
      return [color, choice];
    });
    function set(color) {
      current = color.toLowerCase();
      custom.value = current;
      for (const [color2, choice] of choices) choice.setAttribute("aria-checked", String(color2 === current));
    }
    custom.addEventListener("input", () => set(custom.value));
    row.append(...choices.map(([, choice]) => choice), custom);
    set(value);
    return { el: BudgetUI.field("Color", row, { hint: "Its entries show in this color on the calendar." }), value: () => current };
  }

  // A fractal's window: its name and color (and for one that's there already, Delete)
  function openFractal(origin, fractal) {
    BudgetUI.openPanel({
      origin,
      size: "small",
      stacked: !!(origin && origin.closest(".budgetPanel")),
      title: fractal ? `Edit ${fractal.name}` : "New Calendar Fractal",
      build(form, panel) {
        const name = BudgetUI.textField({ label: "Name", value: fractal ? fractal.name : "", placeholder: "Like Work or Family", maxLength: 30 });
        const color = colorField(fractal ? fractal.color : COLORS[data ? data.fractals.length % COLORS.length : 0]);
        const buttons = [{ label: fractal ? "Save" : "Make It", kind: "primary", type: "submit" }, { label: "Cancel", onClick: () => panel.close() }];
        if (fractal && data.fractals.length > 1) {
          buttons.push({ label: "Delete", kind: "danger", onClick: async () => {
            const count = data.events.filter(event => event.fractal === fractal.id).length;
            if (!window.confirm(`Delete ${fractal.name}${count > 0 ? ` and its ${count} ${count === 1 ? "entry" : "entries"}` : ""}? This can't be undone.`)) return;
            panel.setBusy(true);
            const result = await change("delete", { id: fractal.id });
            panel.setBusy(false);
            if (!result.ok) return panel.setError(problem(result, "Couldn't delete it. Please try again."));
            panel.close();
            toast(`${fractal.name} was deleted.`);
          } });
        }
        form.append(name.el, color.el, BudgetUI.buttonRow(buttons));
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          panel.setError("");
          if (!name.value()) return panel.setError("Give the calendar fractal a name.");
          panel.setBusy(true);
          const result = await change("save", { ...(fractal ? { id: fractal.id } : {}), name: name.value(), color: color.value() });
          panel.setBusy(false);
          if (!result.ok) return panel.setError(problem(result, "Couldn't save it. Please try again."));
          panel.close();
          toast(fractal ? `${name.value()} was saved.` : `${name.value()} is in your calendar fractals.`);
        });
      }
    });
  }

  //#endregion

  // =====================================================================
  // #region A CALENDAR ENTRY'S FORM
  // =====================================================================

  // This device's time zone (kept with an entry, for its alerts and the calendar link)
  function timeZone() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; }
  }

  // "HH:MM" for some minutes after midnight
  const clock = (minutes) => `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

  // A time box (the device's own time picker)
  function timeBox(value, label) {
    const input = el("input", "textInput timeInput");
    input.type = "time";
    input.step = 300;
    input.value = value;
    input.setAttribute("aria-label", label);
    return input;
  }

  // Where an entry is, as typed. value(): { text } or null.
  function locationField(location) {
    const field = BudgetUI.textField({ label: "Location", value: location ? location.text : "", placeholder: "An address or a place", optional: true, maxLength: 200 });
    field.input.autocomplete = "off";
    return { el: field.el, value: () => (field.value() ? { text: field.value() } : null) };
  }

  // Alerts: push notifications some minutes, days, weeks, or months before the entry starts, as many as wanted.
  // value(): [{ count, unit }], or null when a number can't be read.
  function alertsField(alerts) {
    const rows = el("div", "alertRows");
    const addRow = (alert) => {
      const row = el("div", "frequencyRow alertRow");
      const count = el("input", "frequencyCount");
      count.type = "text";
      count.inputMode = "numeric";
      count.maxLength = 3;
      count.value = String(alert.count);
      count.setAttribute("aria-label", "How long before");
      const unit = el("select", "selectInput frequencyUnit");
      for (const option of ALERT_UNITS) unit.appendChild(new Option(option.label, option.value));
      unit.value = alert.unit;
      unit.setAttribute("aria-label", "Minutes, days, weeks, or months");
      const remove = el("button", "panelClose termRemove", "×");
      remove.type = "button";
      remove.setAttribute("aria-label", "Remove alert");
      remove.addEventListener("click", () => row.remove());
      row.append(count, unit, el("span", "rangeWord", "before"), remove);
      rows.append(row);
    };
    alerts.forEach(addRow);
    const add = button("+ Add Alert", "termAdd", () => {
      if (rows.childElementCount >= MAX_ALERTS) return toast(`An entry can have up to ${MAX_ALERTS} alerts.`, true);
      addRow({ count: 15, unit: "minutes" });
    });
    const box = el("div", "alertBox");
    box.append(rows, add);
    return {
      el: BudgetUI.field("Alerts", box, { optional: true, hint: "Push notifications before it starts, on your devices with notifications on (Settings turns them on)." }),
      value() {
        const list = [];
        for (const row of rows.children) {
          const count = Number(row.querySelector("input").value.trim() || "0");
          if (!Number.isInteger(count) || count < 0 || count > 999) return null;
          list.push({ count, unit: row.querySelector("select").value });
        }
        return list;
      }
    };
  }

  // Everyone the account has shared a budget with, or had one shared from, for the sharing list (from Budgets.js)
  async function knownPeople() {
    if (!window.Budgets || store.quick) return [];
    const listed = await window.Budgets.list();
    const me = read("prismal_username") || "";
    const names = new Set();
    for (const budget of listed ? listed.budgets : []) {
      if (!budget.owned && budget.owner) names.add(budget.owner);
      for (const person of budget.people || []) if (person.name && (budget.owned ? person.joined : true)) names.add(person.name);
    }
    names.delete(me);
    return [...names].sort((a, b) => a.localeCompare(b));
  }

  // Sharing: the accounts an entry is shared with (each with Remove), and a box for another's username or email, with
  // the people the account shares budgets with in a list to pick from. For an entry that's saved already, each change
  // happens at once; a new entry's invitations go out once it's saved (pending()).
  function shareField(event) {
    const saved = !!(event && event.id);
    const pending = [];
    const people = el("ul", "budgetList budgetPeople");
    const typed = el("input", "textInput");
    typed.type = "text";
    typed.maxLength = 254;
    typed.placeholder = "Their username or email";
    typed.autocomplete = "off";
    typed.spellcheck = false;
    typed.setAttribute("autocapitalize", "none");
    typed.setAttribute("aria-label", "Username or email to share with");
    const known = el("select", "selectInput");
    known.setAttribute("aria-label", "Someone you share a budget with");
    known.hidden = true;
    knownPeople().then(names => {
      if (names.length === 0) return;
      known.append(new Option("Someone you share a budget with...", ""), ...names.map(name => new Option(name, name)));
      known.hidden = false;
    });
    known.addEventListener("change", () => {
      if (known.value) typed.value = known.value;
      known.value = "";
    });
    const error = el("p", "panelError");
    error.hidden = true;
    const say = (message) => {
      error.textContent = message || "";
      error.hidden = !message;
    };
    const show = () => {
      const now = saved && data ? data.events.find(item => item.id === event.id) : null;
      const list = saved ? (now ? now.people || [] : []) : pending.map(name => ({ name, joined: false, pending: true }));
      people.replaceChildren(...list.map(person => {
        const item = el("li", "budgetItem");
        const about = el("div", "budgetOpen");
        const name = el("span", "budgetName", person.name);
        name.translate = false;
        about.append(name, el("span", "budgetDetail", person.pending ? "Invited once it's saved" : person.joined ? "Joined" : "Invited, hasn't joined yet"));
        item.append(about, button("Remove", "danger budgetShare", async () => {
          if (person.pending) {
            pending.splice(pending.indexOf(person.name), 1);
            return show();
          }
          const result = await change("unshare", { event: event.id, person: person.id });
          if (!result.ok) say(problem(result, "That didn't work. Please try again."));
          show();
        }, `Stop sharing with ${person.name}`));
        return item;
      }));
      people.hidden = people.childElementCount === 0;
    };
    const invite = button("Share", "", async () => {
      say("");
      const who = typed.value.replace(/\s+/g, " ").trim();
      if (!who) return say("Type their username or email.");
      if (!saved) {
        if (!pending.includes(who)) pending.push(who);
        typed.value = "";
        return show();
      }
      invite.disabled = true;
      const result = await change("share", { event: event.id, to: who });
      invite.disabled = false;
      if (!result.ok) return say(problem(result, "Couldn't share it. Please try again."));
      typed.value = "";
      show();
    });
    const row = el("div", "shareRow");
    row.append(typed, invite);
    const box = el("div", "shareBox");
    box.append(known, row, error, people);
    show();
    return {
      el: BudgetUI.field("Share with", box, { optional: true, hint: "They see it on their calendar once they join it, and get its alerts. Only you can change it." }),
      pending: () => [...pending]
    };
  }

  // The form's fields for a calendar entry. event: the one being changed (null for a new one); day: the day of it that
  // was tapped (a repeating one's), or the day a new one starts. read(): { event, fractal } as the API takes them, or
  // { error }. noteEl goes under the form's buttons, like a budget entry's note.
  function eventFields({ event = null, day = null, title = "" } = {}) {
    const fractals = data ? data.fractals : [];
    const startDay = day || (event ? event.start : formatToYMD(today));
    const span = event ? daysBetween(event.start, event.end) : 0;
    const now = new Date();
    const nextHour = startDay === formatToYMD(createSafeMidnight(now)) ? Math.min(23, now.getHours() + 1) * 60 : 9 * 60;

    const titleField = BudgetUI.textField({ label: "Title", value: event ? event.title : title, placeholder: "Like Dentist or Lunch with Sam", maxLength: MAX_TITLE });
    const fractalField = BudgetUI.selectField({
      label: "Calendar Fractal",
      options: fractals.map(fractal => ({ value: fractal.id, label: fractal.name })),
      value: event && fractals.some(fractal => fractal.id === event.fractal) ? event.fractal : (fractals.find(fractal => isShown(fractal.id)) || fractals[0] || { id: "" }).id
    });
    const allDay = BudgetUI.checkboxField({ label: "All day", checked: event ? event.allDay : false });
    const starts = BudgetUI.dateField({ label: "Starts", date: dayOf(startDay), hint: " " });
    const startTime = timeBox(event && !event.allDay ? event.startTime : clock(nextHour), "Start time");
    starts.el.querySelector(".dateRow").append(startTime);
    const ends = BudgetUI.dateField({ label: "Ends", date: dayOf(plusDays(startDay, span)), hint: " " });
    const endTime = timeBox(event && !event.allDay ? event.endTime : clock(Math.min(nextHour + 60, DAY_MINUTES - 5)), "End time");
    ends.el.querySelector(".dateRow").append(endTime);
    for (const field of [starts, ends]) field.el.querySelector(".panelHint")?.remove();

    const travel = BudgetUI.selectField({
      label: "Travel time",
      options: TRAVEL_CHOICES.map(minutes => ({ value: minutes, label: minutes === 0 ? "None" : minutes < 60 ? `${minutes} minutes` : `${minutes / 60} ${minutes === 60 ? "hour" : "hours"}` })),
      value: event && TRAVEL_CHOICES.includes(event.travel) ? event.travel : 0,
      hint: "Shows dimmer above its time on a zoomed day."
    });
    const location = locationField(event ? event.location : null);

    const repeats = BudgetUI.checkboxField({ label: "Repeat", checked: !!(event && event.repeat) });
    const count = el("input", "frequencyCount");
    count.type = "text";
    count.inputMode = "numeric";
    count.maxLength = 3;
    count.value = String(event && event.repeat ? event.repeat.count : 1);
    count.setAttribute("aria-label", "How many days, weeks, or months");
    const unit = el("select", "selectInput frequencyUnit");
    for (const option of REPEAT_UNITS) unit.appendChild(new Option(option.label, option.value));
    unit.value = event && event.repeat ? event.repeat.unit : "weeks";
    unit.setAttribute("aria-label", "Days, weeks, or months");
    const every = el("div", "frequencyRow");
    every.append(el("span", "frequencyEvery", "Every"), count, unit);
    const everyField = BudgetUI.field("Frequency", every, { hint: "Like every 2 weeks, every month, or every 12 months for once a year." });
    const until = BudgetUI.dateField({ label: "End repeat", date: event && event.until ? dayOf(event.until) : null, optional: true, hint: "The last day it can land on. Blank: it keeps repeating." });
    const repeatBox = el("div", "repeatBox");
    repeatBox.append(everyField, until.el);

    const share = store.quick || (event && !event.owned) ? null : shareField(event);
    const alerts = alertsField(event ? event.alerts || [] : []);
    const notes = BudgetUI.noteField({ note: event ? event.notes || "" : "", maxLength: MAX_NOTES });

    const showParts = () => {
      startTime.hidden = endTime.hidden = allDay.input.checked;
      travel.el.hidden = allDay.input.checked;
      repeatBox.hidden = !repeats.input.checked;
    };
    allDay.input.addEventListener("change", showParts);
    repeats.input.addEventListener("change", showParts);
    // A start moved past the end takes the end with it
    starts.input.addEventListener("input", () => {
      const from = starts.value();
      const to = ends.value();
      if (from && (!to || to < from)) ends.input.value = showDate(from);
    });
    showParts();

    return {
      els: [titleField.el, fractalField.el, allDay.el, starts.el, ends.el, travel.el, location.el, repeats.el, repeatBox, ...(share ? [share.el] : []), alerts.el],
      noteEl: notes.el,
      titleInput: titleField.input,
      pendingShares: () => (share ? share.pending() : []),
      read() {
        const from = starts.value();
        const to = ends.value();
        if (!titleField.value()) return { error: "Give the entry a title." };
        if (!from || !to) return { error: "Pick the day it starts and the day it ends." };
        const whole = allDay.input.checked;
        if (!whole && (!/^\d{2}:\d{2}/.test(startTime.value) || !/^\d{2}:\d{2}/.test(endTime.value))) return { error: "Pick the time it starts and the time it ends." };
        const start = formatToYMD(from);
        const end = formatToYMD(to);
        if (end < start || (!whole && end === start && endTime.value.slice(0, 5) <= startTime.value.slice(0, 5))) return { error: "It has to end after it starts." };
        let repeat = null;
        let last = null;
        if (repeats.input.checked) {
          const number = Number(count.value.trim());
          if (!Number.isInteger(number) || number < 1 || number > 999) return { error: "Pick how often it repeats: every 1 to 999 days, weeks, or months." };
          repeat = { count: number, unit: unit.value };
          const stop = until.value();
          if (stop === undefined) return { error: "End repeat isn't a date. Clear it, or pick a day." };
          if (stop && formatToYMD(stop) < start) return { error: "It can stop repeating on its first day or any day after." };
          last = stop ? formatToYMD(stop) : null;
        }
        const alertList = alerts.value();
        if (!alertList) return { error: "Each alert is 0 to 999 minutes, days, weeks, or months before." };
        const fractal = Number(fractalField.value());
        if (!fractal) return { error: "Pick a calendar fractal for it." };
        return {
          fractal,
          event: {
            title: titleField.value(), allDay: whole, start, startTime: whole ? null : startTime.value.slice(0, 5), end, endTime: whole ? null : endTime.value.slice(0, 5),
            zone: timeZone(), location: location.value(), travel: whole ? 0 : Number(travel.value()), repeat, until: last,
            skip: repeat && event && event.repeat ? event.skip || [] : [], alerts: alertList, notes: notes.value().trim()
          }
        };
      }
    };
  }

  // Save a new entry, or a changed one (id), then send a new one's invitations. sharesFrom: see store.save. Resolves to
  // { ok, message }.
  async function saveEvent(id, fractal, event, invites = [], sharesFrom = null) {
    const result = await store.save(id, fractal, event, sharesFrom);
    if (!result.ok || !result.data) return { ok: false, message: problem(result, "Couldn't save it. Please try again.") };
    if (Array.isArray(result.data.fractals)) took(result.data);
    if (result.data.error) return { ok: false, message: result.data.error };
    const problems = [];
    for (const who of invites) {
      const shared = await change("share", { event: result.data.saved, to: who });
      if (!shared.ok) problems.push(`${who}: ${problem(shared, "couldn't be invited")}`);
    }
    if (problems.length > 0) toast(`Saved, but ${problems.join(" ")}`, true);
    return { ok: true, id: result.data.saved };
  }

  // The two long buttons across the top of New Entry: a budget entry, or a calendar entry
  function kindSwitch(kind, onPick) {
    const picker = BudgetUI.segmented([{ key: "budget", label: "Budget Entry" }, { key: "calendar", label: "Calendar Entry" }], kind, onPick);
    picker.el.classList.add("entryKind");
    picker.el.setAttribute("aria-label", "A budget entry or a calendar entry");
    return picker.el;
  }

  // New Entry as a calendar entry (date: the day it starts; title: what was typed in the budget entry's form). Its
  // Budget Entry button goes back to that form.
  function openNewEvent(origin, { date = today, title = "" } = {}) {
    BudgetUI.openPanel({
      origin,
      size: "large",
      title: "New Entry",
      build(form, panel) {
        panel.panel.classList.add("eventPanel");
        const fields = eventFields({ day: formatToYMD(date), title });
        const kinds = store.quick ? [] : [kindSwitch("calendar", (kind) => {
          if (kind === "budget") BudgetUI.openNewEntry(origin, { date, kind: "budget" });
        })];
        form.append(...kinds, ...fields.els, BudgetUI.buttonRow([
          { label: "Add Entry", kind: "primary", type: "submit" },
          { label: "Cancel", onClick: () => panel.close() }
        ]), fields.noteEl);
        form.addEventListener("submit", async (submitted) => {
          submitted.preventDefault();
          panel.setError("");
          const { event, fractal, error } = fields.read();
          if (error) return panel.setError(error);
          panel.setBusy(true);
          const result = await saveEvent(null, fractal, event, fields.pendingShares());
          panel.setBusy(false);
          if (!result.ok) return panel.setError(result.message);
          panel.close();
          toast(store.quick ? `Added ${event.title}. It joins your calendar the next time Prismal Planning opens.` : `Added ${event.title} to your calendar.`);
        });
      }
    });
  }

  // An entry as the API stores it (without what the list adds to it: its id, fractal, and who it's shared with)
  function storedOf(event) {
    const stored = { ...event };
    for (const added of ["id", "fractal", "owned", "owner", "people", "waiting"]) delete stored[added];
    return stored;
  }

  // A tapped entry's window. One shared with the account (or, on the Quick Calendar page, one already on the calendar)
  // only shows; the account's own can be changed or deleted, and a repeating one asks whether that's for the tapped day
  // or every time. It says it opened ("entry:opened"), so Home can give it ‹ and › to the entries around it.
  function openEvent(origin, event, day = event.start) {
    const locked = !event.owned || (store.quick && !event.waiting);
    const panelApi = BudgetUI.openPanel({
      origin,
      size: "large",
      title: "Calendar Entry",
      build(form, panel) {
        panel.panel.classList.add("eventPanel");
        const fractal = data.fractals.find(item => item.id === event.fractal);
        const heading = BudgetUI.noTranslate(el("p", "panelText eventHeading", event.title));
        heading.style.background = colorOf(event.fractal);
        heading.style.color = textOn(colorOf(event.fractal));
        form.append(heading);
        if (locked) {
          const lines = [whenWords(event, day), repeatWords(event), event.location ? event.location.text : "", event.owned ? (fractal ? fractal.name : "") : `Shared by ${event.owner}`];
          for (const line of lines.filter(Boolean)) form.append(BudgetUI.noTranslate(el("p", "panelText", line)));
          if (event.notes) form.append(BudgetUI.noTranslate(el("p", "panelText eventNotes", event.notes)));
          if (store.quick) form.append(el("p", "panelHint", "Sign in to Prismal Planning to change it."));
          form.append(BudgetUI.buttonRow([
            ...(event.owned ? [] : [{ label: "Remove From My Calendar", kind: "danger", onClick: async () => {
              if (!window.confirm(`Take ${event.title} off your calendar? ${event.owner} can share it with you again.`)) return;
              panel.setBusy(true);
              const result = await change("decline", { event: event.id });
              panel.setBusy(false);
              if (!result.ok) return panel.setError(problem(result, "That didn't work. Please try again."));
              panel.close();
            } }]),
            { label: "Close", onClick: () => panel.close() }
          ]));
          return;
        }

        const fields = eventFields({ event, day });
        fields.titleInput.dataset.skipFocus = "1";
        const repeating = !!event.repeat;
        const scope = BudgetUI.segmented([{ key: "all", label: "Every time" }, { key: "one", label: "Just this day" }], "all");
        const scopeField = BudgetUI.field("Change or delete", scope.el, { hint: `It repeats (${repeatWords(event).toLowerCase()}). Just this day leaves the rest as they are.` });
        scopeField.hidden = !repeating;
        form.append(...fields.els, scopeField, BudgetUI.buttonRow([
          { label: "Save", kind: "primary", type: "submit" },
          { label: "Delete", kind: "danger", onClick: async () => {
            const one = repeating && scope.value() === "one";
            if (!window.confirm(one ? `Delete ${event.title} on ${showDate(dayOf(day))} only?` : `Delete ${event.title}${repeating ? ", every time it repeats" : ""}? This can't be undone.`)) return;
            panel.setBusy(true);
            const result = one ? await store.save(event.id, event.fractal, { ...storedOf(event), skip: [...(event.skip || []), day] }) : await store.remove(event.id);
            panel.setBusy(false);
            if (!result.ok) return panel.setError(problem(result, "Couldn't delete it. Please try again."));
            if (result.data && Array.isArray(result.data.fractals)) took(result.data);
            panel.close();
            toast(`Deleted ${event.title}${one ? ` on ${showDate(dayOf(day))}` : ""}.`);
          } },
          { label: "Cancel", onClick: () => panel.close() }
        ]), fields.noteEl);

        form.addEventListener("submit", async (submitted) => {
          submitted.preventDefault();
          panel.setError("");
          const { event: changed, fractal: picked, error } = fields.read();
          if (error) return panel.setError(error);
          panel.setBusy(true);
          let result;
          if (repeating && scope.value() === "one") {
            // The tapped day comes out of the repeating entry, and goes on by itself as the form has it (shared with
            // the same people)
            result = await saveEvent(event.id, event.fractal, { ...storedOf(event), skip: [...(event.skip || []), day] });
            if (result.ok) result = await saveEvent(null, picked, { ...changed, repeat: null, until: null, skip: [] }, [], event.id);
          } else if (repeating && changed.repeat) {
            // The form shows the tapped day: the days it moved by move the whole entry (its first day, and the days
            // left out of it)
            const moved = daysBetween(day, changed.start);
            const first = plusDays(event.start, moved);
            const skip = (changed.skip || []).map(skipped => plusDays(skipped, moved));
            result = await saveEvent(event.id, picked, { ...changed, start: first, end: plusDays(first, daysBetween(changed.start, changed.end)), skip });
          } else {
            // One that happens once (or stops repeating): it's on the days the form shows
            result = await saveEvent(event.id, picked, changed);
          }
          panel.setBusy(false);
          if (!result.ok) return panel.setError(result.message);
          panel.close();
          toast(`Saved ${changed.title}.`);
        });
      }
    });
    document.dispatchEvent(new CustomEvent("entry:opened", { detail: { panel: panelApi, kind: "event", id: event.id, day } }));
    return panelApi;
  }

  //#endregion

  // =====================================================================
  // #region ONE ENTRY AFTER ANOTHER (a window's ‹ and ›, and swiping it)
  // =====================================================================

  // An entry's window gets ‹ and › beside its ×, and a sideways swipe on it does the same: onStep(-1) for the entry
  // before, onStep(1) for the next. Typing in a box, or sliding inside something that scrolls sideways, isn't a swipe.
  function addSteps(panelApi, onStep) {
    const header = panelApi.panel.querySelector(".panelHeader");
    if (!header || header.querySelector(".panelStep")) return;
    const close = header.querySelector(".panelClose");
    for (const [step, mark, label] of [[-1, "‹", "The entry before"], [1, "›", "The next entry"]]) {
      const stepButton = el("button", "panelClose panelStep", mark);
      stepButton.type = "button";
      stepButton.setAttribute("aria-label", label);
      stepButton.addEventListener("click", () => onStep(step));
      header.insertBefore(stepButton, close);
    }
    let from = null;
    panelApi.panel.addEventListener("touchstart", (event) => {
      from = event.touches.length === 1 && !event.target.closest("input, textarea, select, .dayTimesScroll, .pickerList") ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null;
    }, { passive: true });
    panelApi.panel.addEventListener("touchend", (event) => {
      const touch = event.changedTouches[0];
      if (!from || !touch) return;
      const dx = touch.clientX - from.x;
      const dy = touch.clientY - from.y;
      from = null;
      if (Math.abs(dx) >= 60 && Math.abs(dx) >= Math.abs(dy) * 1.5) onStep(dx < 0 ? 1 : -1);
    });
  }

  //#endregion

  // =====================================================================
  // #region THE FRACTALS, TO MANAGE (the Budgets, Calendars & Spreadsheets page) AND THEIR LINKS (Settings)
  // =====================================================================

  // Every fractal with its color, how many entries it has, and Edit. container: the card's list; it's drawn again
  // whenever the calendar changes.
  function renderManager(container) {
    const draw = () => {
      container.replaceChildren();
      if (!data) {
        container.append(el("p", "panelHint", "Couldn't load your calendar. Please refresh to try again."));
        return;
      }
      const list = el("ul", "budgetList budgetManager");
      for (const fractal of data.fractals) {
        const item = el("li", "budgetItem");
        const about = el("div", "budgetOpen");
        const name = el("span", "budgetName");
        name.translate = false;
        name.append(swatch(fractal.color), fractal.name);
        const count = data.events.filter(event => event.fractal === fractal.id).length;
        about.append(name, el("span", "budgetDetail", `${count} ${count === 1 ? "entry" : "entries"}${data.links.fractals[fractal.id] ? " · calendar link on" : ""}`));
        const buttons = el("div", "budgetInvitationButtons");
        buttons.append(button("Edit", "", (event) => openFractal(event.currentTarget, fractal), `Edit ${fractal.name}`));
        item.append(about, buttons);
        list.append(item);
      }
      for (const invitation of data.invitations) list.append(invitationItem(invitation));
      container.append(list);
    };
    draw();
    document.addEventListener("fractals:changed", draw);
  }

  // Settings' calendar links: one for every calendar, and one for each fractal, each turned on (a private link other
  // calendar apps can subscribe to) or off (the link stops working). container: the card's list.
  function renderLinks(container) {
    const draw = () => {
      container.replaceChildren();
      if (!data) {
        container.append(el("p", "panelHint", "Couldn't load your calendar. Please refresh to try again."));
        return;
      }
      const list = el("ul", "budgetList budgetManager");
      const row = (fractalId, label, color, link) => {
        const item = el("li", "budgetItem fractalLink");
        const about = el("div", "budgetOpen");
        const name = el("span", "budgetName");
        name.translate = false;
        if (color) name.append(swatch(color));
        name.append(label);
        about.append(name, el("span", "budgetDetail", link ? "Its link is on" : "No link"));
        const buttons = el("div", "budgetInvitationButtons");
        const turn = async (on) => {
          if (!on && !window.confirm(`Turn off the calendar link for ${label}? Calendars that added it stop getting it.`)) return;
          const result = await change("link", { fractal: fractalId, on });
          if (!result.ok) toast(problem(result, "That didn't work. Please try again."), true);
        };
        if (!link) buttons.append(button("Make A Link", "", () => turn(true), `Make a calendar link for ${label}`));
        else buttons.append(button("New Link", "", () => turn(true), `Make a new calendar link for ${label}`), button("Turn Off", "danger", () => turn(false), `Turn off the calendar link for ${label}`));
        item.append(about, buttons);
        if (link) {
          const webcal = link.replace(/^https?:\/\//, "webcal://");
          const links = el("div", "fractalLinkBox");
          const box = el("input", "textInput");
          box.type = "text";
          box.readOnly = true;
          box.value = link;
          box.setAttribute("aria-label", `The calendar link for ${label}`);
          box.addEventListener("focus", () => box.select());
          const copy = button("Copy", "", async () => {
            try {
              await navigator.clipboard.writeText(link);
              toast("Copied the calendar link.");
            } catch {
              box.select();
              toast("Couldn't copy it. Select the link and copy it yourself.", true);
            }
          }, `Copy the calendar link for ${label}`);
          const apple = el("a", "budgetButton", "Apple Calendar");
          apple.href = webcal;
          const google = el("a", "budgetButton", "Google Calendar");
          google.href = `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`;
          google.target = "_blank";
          google.rel = "noopener noreferrer";
          links.append(box, copy, apple, google);
          item.append(links);
        }
        return item;
      };
      list.append(row(null, "Every calendar", "", data.links.all));
      for (const fractal of data.fractals) list.append(row(fractal.id, fractal.name, fractal.color, data.links.fractals[fractal.id] || null));
      container.append(list);
    };
    draw();
    document.addEventListener("fractals:changed", draw);
  }

  //#endregion

  return {
    SHARED,
    load,
    change,
    call,
    took,
    problem,
    data: () => data,
    useStore(other) { store = { ...store, ...other }; },
    isQuick: () => store.quick,
    rememberIcon,
    view,
    setView,
    isShown,
    listMode,
    colorOf,
    textOn,
    prepare,
    eventsOn,
    renderDay,
    dayZoomed,
    wirePicker,
    openList,
    openFractal,
    openNewEvent,
    openEvent,
    kindSwitch,
    addSteps,
    whenWords,
    partWords,
    renderManager,
    renderLinks,
    occurrences
  };
})();
