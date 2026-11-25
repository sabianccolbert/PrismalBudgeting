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
  const COLORS = BudgetUI.CARD_COLORS;
  const MAX_TITLE = LIMITS.title;
  const MAX_NOTES = LIMITS.note;
  const MAX_ALERTS = LIMITS.alerts;
  const DAY_MINUTES = 1440;
  const HOUR_EM = 2.2;         // How tall an hour is beside a zoomed day's times
  const MIN_BLOCK_MINUTES = 30; // The shortest a block is drawn (so its title fits)
  const SHORT_BLOCK_MINUTES = 60; // A block shorter than this has a line for its title and no more (no time under it)
  const SIDE_BY_SIDE = 3;      // Blocks that overlap share the day's width up to this many across...
  const OVERLAP_EM = 0.9;      // ...and past it, a block over another in its lane sits this much to the right of it...
  const OVERLAP_MOST = 3;      // ...up to this many deep (more go over at the same place)
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

  // One request (a POST of JSON with a body, a GET without): { ok, status, data }, never throwing (status 0: no answer).
  // The calendar's requests name the budget this page has open, whose Calendar Fractals show with the account's own.
  async function call(path, body) {
    const token = read("prismal_jwt");
    const address = path.startsWith("/api/fractals") && window.Budgets ? `${path}${path.includes("?") ? "&" : "?"}${window.Budgets.query()}` : path;
    try {
      const response = await fetch(`${window.API_BASE_URL}${address}`, {
        method: body === undefined ? "GET" : "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      let answer = null;
      try { answer = await response.json(); } catch {}
      if (response.status === 401 && !store.quick && typeof signedOutElsewhere === "function") signedOutElsewhere();
      // (Near the account's calendar reads for now, from a Quick Calendar icon's linked fractals: Limits.fromApi)
      if (answer && answer.limitNote) Limits.fromApi(answer.limitNote);
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
      // (Whole fractals shared with the account, for it to join)
      fractalInvitations: Array.isArray(answer.fractalInvitations) ? answer.fractalInvitations : [],
      waiting: Array.isArray(answer.waiting) ? answer.waiting : [],
      links: answer.links || { all: null, fractals: {} },
      icons: answer.icons || 0,
      // (How many entries are kept under the account, for Limits.near)
      kept: Number.isInteger(answer.kept) ? answer.kept : null,
      // (A Quick Calendar icon's answer: its budget's linked fractals, Holidays, and order, see budgetSheets)
      sheets: answer.sheets && typeof answer.sheets === "object" ? answer.sheets : null
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
    const before = data ? counts(data) : null;
    const result = await call(`/api/fractals/${route}`, body);
    if (result.ok && result.data && Array.isArray(result.data.fractals)) {
      took(result.data);
      if (before) nearLimits(before, counts(data));
    }
    return result;
  }

  // What the calendar has that has limits (LIMITS), counted: the entries kept under the account (the API's count), its
  // own fractals and its budget's, and who each of its own fractals and entries is shared with
  function counts(calendar) {
    const shared = (list) => Object.fromEntries(list.filter(item => Array.isArray(item.people)).map(item => [item.id, item.people.length]));
    return {
      events: Number.isInteger(calendar.kept) ? calendar.kept : null,
      own: calendar.fractals.filter(fractal => !fractal.perBudget && !fractal.sharedBy).length,
      budget: calendar.fractals.filter(fractal => fractal.perBudget).length,
      fractalPeople: shared(calendar.fractals),
      eventPeople: shared(calendar.events)
    };
  }

  // After a change, a toast for each that grew near its limit (Limits.near says so once a page for each)
  function nearLimits(before, after) {
    if (after.events !== null && before.events !== null && after.events > before.events) Limits.near("events", after.events);
    if (after.own > before.own) Limits.near("fractals", after.own);
    if (after.budget > before.budget) Limits.near("fractals", after.budget, "this budget");
    for (const kind of ["fractalPeople", "eventPeople"]) {
      for (const [id, count] of Object.entries(after[kind])) if (count > (before[kind][id] || 0)) Limits.near(kind, count);
    }
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

  let shownKept = null; // (What shownSettings read, for the work at hand)

  // What this device keeps about what the calendar shows ({ view, off }), read once for the work at hand and again after
  // it (a microtask, so another tab's change is seen): every day and entry drawn asks
  function shownSettings() {
    if (!shownKept) {
      let off = [];
      try {
        const list = JSON.parse(read(OFF_KEY) || "[]");
        if (Array.isArray(list)) off = list.map(String);
      } catch {}
      shownKept = { view: read(VIEW_KEY), off };
      Promise.resolve().then(() => { shownKept = null; });
    }
    return shownKept;
  }

  // What Home's calendar shows: the budget, the calendar, or both (the Quick Calendar page only has the calendar)
  function view() {
    if (store.quick) return "calendar";
    const stored = shownSettings().view;
    return VIEWS.includes(stored) ? stored : "both";
  }

  // Show the budget, the calendar, or both (kept on this device), and draw again
  function setView(mode) {
    write(VIEW_KEY, VIEWS.includes(mode) ? mode : "both");
    shownKept = null;
    document.dispatchEvent(new CustomEvent("fractals:changed"));
  }

  // The fractals unchecked on this device
  function hidden() {
    return [...shownSettings().off];
  }

  const isShown = (fractalId) => !shownSettings().off.includes(String(fractalId));

  // Check or uncheck a fractal on this device (its entries show while it's checked)
  function setShown(fractalId, on) {
    const rest = hidden().filter(id => id !== String(fractalId));
    write(OFF_KEY, JSON.stringify(on ? rest : [...rest, String(fractalId)]));
    shownKept = null;
    dayCache = new Map();
    document.dispatchEvent(new CustomEvent("fractals:changed"));
  }

  // Does a zoomed day list its calendar entries (instead of drawing them beside the hours)?
  const listMode = () => read(LIST_KEY) === "1";

  // A fractal by its id: the account's or the budget's, a linked one, Holidays, or Meals (null for none)
  function fractalById(fractalId) {
    return (data && data.fractals.find(item => item.id === fractalId)) || (String(fractalId).startsWith("linked:") ? linkedFractal(fractalId) : null)
      || (fractalId === HOLIDAYS_ID ? holidayFractals()[0] || null : null) || (fractalId === MEALS_ID ? mealFractals()[0] || null : null);
  }

  // A fractal's color (Shared With You's is grey; a linked fractal's is its own)
  function colorOf(fractalId) {
    if (fractalId === SHARED) return SHARED_COLOR;
    const fractal = fractalById(fractalId);
    return fractal ? fractal.color : SHARED_COLOR;
  }

  // A fractal's name (Shared With You for entries shared with the account)
  function nameOf(fractalId) {
    if (fractalId === SHARED) return "Shared With You";
    const fractal = fractalById(fractalId);
    return fractal ? fractal.name : "";
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
  const minutesOf = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
  // (Worked out in Dates.js, which meals share: occurrenceDay, firstOccurrenceFrom, occurrences)
  const { occurrenceDay, firstOccurrenceFrom, occurrences, plusDays, daysBetween } = Repeats;

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

  // An entry's occurrences from one day through another, as this device shows them. One with times kept in another time
  // zone (made in one, and this device is in another: Dates.js Zones) is shown at this device's time, each occurrence on
  // its own (so a change of clocks in either zone moves it as it should), on the days that come to here: [{ event (a copy
  // with this device's times, and shownFrom, its own zone), day, last, zoneDay (its day in its own zone, which taps and
  // changes go by) }]. Any other is as occurrences gives it.
  function shownOccurrences(event, from, to) {
    if (event.allDay || !event.startTime || !Zones.differs(event.zone)) return occurrences(event, from, to);
    const shown = [];
    for (const occurrence of occurrences(event, plusDays(from, -1), plusDays(to, 1))) {
      const start = Zones.toDevice(occurrence.day, minutesOf(event.startTime), event.zone);
      const end = Zones.toDevice(occurrence.last, minutesOf(event.endTime), event.zone);
      if (end.ymd < from || start.ymd > to) continue;
      shown.push({ event: { ...event, startTime: clock(start.minutes), endTime: clock(end.minutes), shownFrom: event.zone }, day: start.ymd, last: end.ymd, zoneDay: occurrence.day });
    }
    return shown;
  }

  // A page left open while its device moves to another time zone (a trip): when it comes back into view there, its
  // calendar's times are worked out again for the new one, and it says so (the budget's own days follow the device's
  // date: Process Budget.js deviceDayChanged)
  let zoneShown = Zones.device();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || Zones.device() === zoneShown) return;
    zoneShown = Zones.device();
    dayCache = new Map();
    document.dispatchEvent(new CustomEvent("fractals:changed"));
    if (data && data.events.some(event => !event.allDay && Zones.differs(event.zone))) toast(`You're in ${Zones.place(zoneShown)} time now, so your calendar shows its entries at the times they are here.`);
  });

  // Work out the entries on each day from one through another, once (a window of the calendar)
  function prepare(from, to) {
    if (!data) return;
    const days = new Map();
    for (let day = from; day <= to; day = plusDays(day, 1)) days.set(day, []);
    const off = hidden();
    // (A linked fractal's entries, and Holidays', are worked out for just these days: see LINKED FRACTALS and HOLIDAYS)
    const linked = otherFractals().filter(fractal => !off.includes(fractal.id)).flatMap(fractal => otherEventsIn(fractal, from, to));
    for (const event of [...data.events, ...linked]) {
      if (off.includes(String(event.fractal))) continue;
      for (const occurrence of shownOccurrences(event, from, to)) {
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

  // Every entry that happens from one day through another (YYYY-MM-DD), checked here or not, linked fractals' and
  // Holidays' too: [{ event, day, last }] (Home's Search)
  function occurrencesBetween(from, to) {
    if (!data) return [];
    const linked = otherFractals().flatMap(fractal => otherEventsIn(fractal, from, to));
    return [...data.events, ...linked].flatMap(event => shownOccurrences(event, from, to));
  }

  // Each fractal's hours from one day through another (YYYY-MM-DD), checked or not, linked fractals' too: the time its
  // entries with a time take on those days (an entry past midnight counts each day's part; all-day ones don't count).
  // Map: a fractal's id (as text) -> hours
  function hoursBetween(from, to) {
    const minutes = new Map();
    for (const occurrence of occurrencesBetween(from, to)) {
      for (let day = occurrence.day < from ? from : occurrence.day; day <= occurrence.last && day <= to; day = plusDays(day, 1)) {
        const part = partOn(occurrence, day);
        if (!part || part.whole) continue;
        const id = String(part.event.fractal);
        minutes.set(id, (minutes.get(id) || 0) + Math.max(0, part.end - part.start));
      }
    }
    return new Map([...minutes].map(([id, total]) => [id, Math.round((total / 60) * 100) / 100]));
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

  // Are times shown as 1:00 PM (not 13:00)? Settings' Time Format on this device, or the device's own (Dates.js)
  const twelveHour = () => twelveHourClock();

  // A time of day: "9:30 AM" or "09:30" (short: "9:30a", for a day's small lines)
  function timeText(minutes, short = false) {
    const hour = Math.floor(minutes / 60) % 24;
    const minute = minutes % 60;
    if (!twelveHour()) return minutes === DAY_MINUTES ? "24:00" : `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
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

  // An entry's times when they're kept in another time zone than this device's, as they come to here: "Its times are New
  // York time (EST). Here, that's 8:00 AM to 9:00 AM on Thu 11/12/2026." ("" for any other: its zone is only shown then)
  function zoneWords(event, day = event.start) {
    if (event.allDay || !event.startTime || !Zones.differs(event.zone)) return "";
    const last = plusDays(day, daysBetween(event.start, event.end));
    const start = Zones.toDevice(day, minutesOf(event.startTime), event.zone);
    const end = Zones.toDevice(last, minutesOf(event.endTime), event.zone);
    const when = start.ymd === end.ymd
      ? `${timeText(start.minutes)} to ${timeText(end.minutes)} on ${showWeekdayDate(dayOf(start.ymd))}`
      : `${showWeekdayDate(dayOf(start.ymd))}, ${timeText(start.minutes)} to ${showWeekdayDate(dayOf(end.ymd))}, ${timeText(end.minutes)}`;
    return `Its times are ${Zones.place(event.zone)} time (${Zones.shortName(event.zone, Zones.instant(day, minutesOf(event.startTime), event.zone))}). Here, that's ${when}.`;
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
    // (One from another time zone is opened and changed by its day there)
    node.dataset.day = part.zoneDay || part.day;
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

  // The entries with a time, laid out beside the hours, with each one's travel time counted as part of it. Entries that
  // overlap (one starting before another ends, through a chain of them) are a group. A group that needs SIDE_BY_SIDE
  // columns or fewer goes side by side: each block in its group's first column that's free when it starts, every column as
  // wide as the others, so no block covers another. A group that would need more has SIDE_BY_SIDE lanes instead: each
  // block goes in a lane that's free when it starts, or else the one with the fewest blocks still going, over them and a
  // little to the right (depth), so the left edge and title of each one under it still show. Either way, a block also
  // takes the columns to its right that nothing else is in while it's there (span), so it's only as narrow as it has to be.
  // { blocks: [{ part, column, columns (its group's, at most SIDE_BY_SIDE), span, depth, from (with its travel time), start,
  // end }] }
  function layOut(parts) {
    const blocks = parts.map(part => ({
      part,
      from: Math.max(0, part.start - (part.on === part.day ? part.event.travel || 0 : 0)),
      start: part.start,
      end: Math.min(DAY_MINUTES, Math.max(part.end, part.start + MIN_BLOCK_MINUTES))
    })).sort((a, b) => a.from - b.from || b.end - a.end);
    let group = [];
    let ends = [];
    let groupEnd = -1;
    const close = () => {
      if (ends.length <= SIDE_BY_SIDE) {
        for (const block of group) {
          block.columns = ends.length;
          block.depth = 0;
        }
      } else {
        const lanes = Array.from({ length: SIDE_BY_SIDE }, () => []);
        for (const block of group) {
          let lane = 0;
          let going = Infinity;
          lanes.forEach((blocksIn, at) => {
            const still = blocksIn.filter(other => other.end > block.from).length;
            if (still < going) {
              lane = at;
              going = still;
            }
          });
          block.column = lane;
          block.columns = SIDE_BY_SIDE;
          block.depth = going;
          lanes[lane].push(block);
        }
      }
      for (const block of group) {
        block.span = 1;
        for (let column = block.column + 1; column < block.columns; column++) {
          if (group.some(other => other !== block && other.column === column && other.from < block.end && block.from < other.end)) break;
          block.span++;
        }
      }
      group = [];
      ends = [];
    };
    for (const block of blocks) {
      if (block.from >= groupEnd && group.length > 0) close();
      let column = ends.findIndex(taken => taken <= block.from);
      if (column === -1) column = ends.length;
      ends[column] = block.end;
      block.column = column;
      group.push(block);
      groupEnd = Math.max(group.length === 1 ? 0 : groupEnd, block.end);
    }
    if (group.length > 0) close();
    return { blocks };
  }

  // The time now, in minutes since midnight, when DATE is today on this device (or null): where the now-line goes. It's
  // the time the day was drawn (each change to the page draws it again, and so does a refresh).
  function nowOn(date) {
    const now = new Date();
    if (formatToYMD(now) !== formatToYMD(date)) return null;
    return now.getHours() * 60 + now.getMinutes();
  }

  // The now-line: a line across the day at the time now, with the time at its left
  function nowLine(minutes) {
    const line = el("div", "nowLine fractalPart");
    line.setAttribute("role", "note");
    line.setAttribute("aria-label", `Now, ${timeText(minutes)}`);
    line.append(el("span", "nowTime", timeText(minutes, true)));
    return line;
  }

  // A zoomed day's times: the hours down the left (midnight to midnight), and a block for each entry with a time, in its
  // fractal's color with a little of the page showing through, its travel time dimmer above it (over anything under it).
  // Blocks share the width up to SIDE_BY_SIDE across, and past that go over one another (see layOut); a title that doesn't
  // fit shows more of itself once the day has its size (fitTitles). On today, a line across it at the time now. It's as tall
  // as its hours, so the page scrolls, never the day.
  function timesBlock(parts, date) {
    const { blocks } = layOut(parts);
    const scroller = el("div", "dayTimesScroll");
    const grid = el("div", "dayTimesGrid");
    grid.style.height = `${24 * HOUR_EM}em`;
    const hours = el("div", "dayHours");
    for (let hour = 0; hour <= 24; hour++) {
      const label = el("span", "dayHour");
      label.append(el("span", "", twelveHour() ? `${((hour + 11) % 12) + 1} ${hour % 24 < 12 ? "AM" : "PM"}` : `${String(hour).padStart(2, "0")}:00`));
      label.style.top = `${hour * HOUR_EM}em`;
      hours.append(label);
    }
    const area = el("div", "dayBlocks");
    for (const block of blocks) {
      // (Its columns' place and width, a share of the day, moved right by how deep it is over others in its lane)
      const inset = Math.min(block.depth, OVERLAP_MOST) * OVERLAP_EM;
      const share = `${(block.column / block.columns) * 100}%`;
      const wide = `${(block.span / block.columns) * 100}%`;
      const left = inset ? `calc(${share} + ${inset}em)` : share;
      const width = inset ? `calc(${wide} - ${inset}em)` : wide;
      const color = colorOf(block.part.event.fractal);
      if (block.from < block.start) {
        const travel = el("div", "timeTravel");
        travel.style.top = `${(block.from / 60) * HOUR_EM}em`;
        travel.style.height = `${((block.start - block.from) / 60) * HOUR_EM}em`;
        travel.style.left = left;
        travel.style.width = width;
        travel.style.background = seeThrough(color, 0.35);
        travel.setAttribute("aria-hidden", "true");
        area.append(travel);
      }
      const node = BudgetUI.noTranslate(el("div", "timeBlock"));
      mark(node, block.part);
      // (A little of the day shows through; solid while it reaches over other blocks, so its words read as they're colored)
      node.style.background = node.dataset.fill = seeThrough(color, 0.86);
      node.dataset.solid = seeThrough(color, 1);
      node.style.top = `${(block.start / 60) * HOUR_EM}em`;
      node.style.height = `${((block.end - block.start) / 60) * HOUR_EM}em`;
      node.style.left = node.dataset.left = left;
      node.style.width = node.dataset.width = width;
      if (block.depth > 0) {
        node.classList.add("isOver");
        node.style.zIndex = node.dataset.z = String(1 + block.depth);
      }
      node.setAttribute("role", "button");
      node.tabIndex = 0;
      node.setAttribute("aria-label", `${block.part.event.title}, ${partWords(block.part, false)}`);
      node.append(el("span", "timeBlockTitle", block.part.event.title));
      if (block.end - block.start >= SHORT_BLOCK_MINUTES) node.append(el("span", "timeBlockTime", partWords(block.part, false)));
      else node.dataset.short = "1";
      area.append(node);
    }
    const now = nowOn(date);
    if (now !== null) {
      const line = nowLine(now);
      line.classList.remove("fractalPart");
      line.style.top = `${(now / 60) * HOUR_EM}em`;
      area.append(line);
    }
    grid.append(hours, area);
    scroller.append(grid);
    watchTitles(area);
    return scroller;
  }

  // A zoomed day's blocks get their titles fitted (fitTitles) once the day has its size, and again whenever that changes
  // (a phone's zoomed day is laid out at the screen's size after it's drawn, and its text can change size). Days that left
  // the page are let go.
  const TITLE_AREAS = new Set();
  const titleSizes = typeof ResizeObserver === "function" ? new ResizeObserver((entries) => {
    for (const entry of entries) {
      if (entry.target.isConnected) fitTitles(entry.target);
      else letGoOfTitles(entry.target);
    }
  }) : null;

  // Stop watching a day's blocks once they've left the page
  function letGoOfTitles(area) {
    titleSizes?.unobserve(area);
    TITLE_AREAS.delete(area);
  }

  // A zoomed day's blocks, watched for their size (or, without a ResizeObserver, fitted on the next frame)
  function watchTitles(area) {
    for (const old of TITLE_AREAS) if (!old.isConnected) letGoOfTitles(old);
    TITLE_AREAS.add(area);
    if (titleSizes) titleSizes.observe(area);
    else requestAnimationFrame(() => fitTitles(area));
  }

  // A block whose title doesn't fit shows more of it. A short one (a line for its title and no more) reaches over the
  // columns beside it, to the right and then, for what's left, to the left, as far as its title needs, unless something
  // there has to stay in sight: another block's title (one starting while it's there), a title that runs down its block,
  // or another short block's reach. A taller one turns its title sideways, down the block, when the block is taller than
  // it is wide, or else lets it wrap onto the lines the block has. Past that, its title ends in "..." as always. Each block
  // starts again from where layOut put it.
  function fitTitles(area) {
    const areaWidth = area.clientWidth;
    if (!areaWidth) return;
    const nodes = [...area.querySelectorAll(".timeBlock")];
    for (const node of nodes) {
      node.classList.remove("isReaching", "isUpright", "isWrapped");
      node.style.left = node.dataset.left;
      node.style.width = node.dataset.width;
      node.style.zIndex = node.dataset.z || "";
      node.style.background = node.dataset.fill;
      node.style.removeProperty("--lines");
    }
    // (Everything measured at once, as layOut put it, then changed, then measured once more for the reaches)
    const blocks = nodes.map((node) => {
      const title = node.querySelector(".timeBlockTitle");
      const style = getComputedStyle(node);
      return {
        node, title,
        short: node.dataset.short === "1",
        more: title ? title.scrollWidth - title.clientWidth : 0,
        left: node.offsetLeft, top: node.offsetTop, width: node.offsetWidth, height: node.offsetHeight,
        room: node.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom),
        line: title ? parseFloat(getComputedStyle(title).lineHeight) || title.offsetHeight : 0
      };
    });
    for (const block of blocks) {
      if (block.short || block.more <= 1) continue;
      if (block.height > block.width) {
        block.node.classList.add("isUpright");
        block.upright = true;
      } else if (block.line > 0) {
        block.node.style.setProperty("--lines", String(Math.max(1, Math.floor(block.room / block.line))));
        block.node.classList.add("isWrapped");
      }
    }
    for (const block of blocks) block.titleBottom = block.title ? block.title.offsetTop + block.title.offsetHeight : 0;
    const reaches = [];
    const reaching = blocks.filter(block => block.short && block.more > 1).sort((a, b) => a.top - b.top || a.left - b.left);
    for (const block of reaching) {
      const right = block.left + block.width;
      const bottom = block.top + block.height;
      // (How far it can go each way: up to what has to stay in sight beside it, while they're both there)
      let most = areaWidth;
      let least = 0;
      const inSight = blocks.filter(other => other !== block && (other.upright || other.top + other.titleBottom > block.top))
        .map(other => ({ left: other.left, right: other.left + other.width, top: other.top, bottom: other.top + other.height }));
      for (const other of [...inSight, ...reaches]) {
        if (other.top >= bottom || other.bottom <= block.top) continue;
        if (other.left >= right - 1) most = Math.min(most, other.left);
        else if (other.right <= block.left + 1) least = Math.max(least, other.right);
        else {
          most = right;
          least = block.left;
        }
      }
      const wanted = block.width + block.more + 2;
      const to = Math.min(Math.max(most, right), block.left + wanted);
      const from = Math.max(Math.min(least, block.left), to - wanted);
      if (to - from <= block.width + 1) continue;
      block.node.style.left = `${(from / areaWidth) * 100}%`;
      block.node.style.width = `${((to - from) / areaWidth) * 100}%`;
      block.node.style.zIndex = ""; // (Over whatever it reaches across: budgetStyle.css .isReaching)
      block.node.style.background = block.node.dataset.solid;
      block.node.classList.add("isReaching");
      reaches.push({ left: from, right: to, top: block.top, bottom });
    }
  }

  // Where the now-line goes among a day's entries as lines, on today: before the first one that starts later (all-day
  // ones come first), or after the last. Returns the index to put it at, or null for any other day.
  function nowIndex(parts, date) {
    const now = nowOn(date);
    if (now === null || parts.length === 0) return null;
    const later = parts.findIndex(part => !part.whole && part.start > now);
    return later === -1 ? parts.length : later;
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
    const zoomed = td.classList.contains("is-editing");
    // (On a zoomed day, today's lines have the now-line among them)
    const nowAt = zoomed ? nowIndex(parts, date) : null;
    parts.forEach((part, index) => {
      if (index === nowAt) add(nowLine(nowOn(date)));
      add(eventLine(part));
    });
    if (nowAt === parts.length) add(nowLine(nowOn(date)));
    if (!zoomed) return;

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
      if (timed.length > 0) times.append(timesBlock(timed, date));
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

  // The entry a tapped line or block is: { event, day }, or null (a linked fractal's, Holidays', or a meal, from the days
  // drawn)
  function tapped(node) {
    const event = (data && data.events.find(item => item.id === node.dataset.event)) || linkedEvents.get(node.dataset.event) || mealEvents.get(node.dataset.event);
    return event ? { event, day: node.dataset.day } : null;
  }

  // Home's List Mode (Calendar Page.js): a day's calendar entries as lines, each a stop for the Tab key (none while the
  // calendar shows only the budget), and a tapped one opened
  function listLines(date) {
    if (!data || view() === "budget") return [];
    const parts = eventsOn(date);
    const lines = parts.map((part) => {
      const line = eventLine(part);
      line.tabIndex = 0;
      line.setAttribute("role", "button");
      return line;
    });
    // (Today's have the now-line among them)
    const nowAt = nowIndex(parts, date);
    if (nowAt !== null) lines.splice(nowAt, 0, nowLine(nowOn(date)));
    return lines;
  }
  function openLine(node) {
    const found = tapped(node);
    if (found) openEvent(node, found.event, found.day);
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
  // #region LINKED FRACTALS (calendars from somewhere else, shown as fractals)
  // =====================================================================
  // A linked fractal shows another calendar's entries in its own name and color, and they can't be changed here: they come
  // from that calendar. It's kept with the budget (sheetsData.linked: see Linked Calendar Fractals in Process Budget.js),
  // as a calendar's subscription link or one of the connected calendars on the Budgets, Calendars & Spreadsheets page.
  // Calendars.js reads it through the API (at most every 15 minutes on this device, which keeps what it read for then, and
  // forgets it when it signs out) and works its repeating entries out for just the days being drawn. Home, that page, and
  // the Quick Calendar page show them (they load Calendars.js; the Quick Calendar page reads them through its key, never
  // seeing a link: budgetSheets); Settings doesn't. Linked entries have no alerts.

  const LINKED_PREFIX = "linked:";
  const LINKED_READ_MS = 15 * 60 * 1000;
  const LINKED_CACHE_KEY = "prismal_linked_reads"; // { id: { at, link, text } }: what this device read last of each
  const LINKED_CACHE_MAX = 1500000;               // A calendar's text is kept only when it's no longer than this
  const linkedReads = new Map(); // A linked fractal's id -> { calendar (parsed), at, link, problem }
  let linkedEvents = new Map();  // The linked entries worked out for the days drawn, by their id (for a tap)

  // The budget's Calendar Fractals settings (linked fractals, Holidays' color, the order): its sheetsData, or on the Quick
  // Calendar page, what the icon's answer says of them (no links: the API reads a linked one for it, store.readLinked)
  function budgetSheets() {
    if (store.quick) return data && data.sheets ? data.sheets : null;
    return typeof sheetsData !== "undefined" && sheetsData ? sheetsData : null;
  }

  // Can this page show linked fractals?
  const canLink = () => typeof Calendars !== "undefined" && !!budgetSheets();

  // The linked fractals, as fractals: [{ id ("linked:" and its own), name, color, linked (as it's kept) }]
  function linkedFractals() {
    if (!canLink()) return [];
    return (budgetSheets().linked || []).filter(item => !store.quick || item.readable).map(item => ({ id: LINKED_PREFIX + item.id, name: item.name, color: item.color, linked: item }));
  }
  const linkedFractal = (id) => linkedFractals().find(fractal => fractal.id === id) || null;

  // The link a linked fractal reads: its own, or its connected calendar's ("" when that's gone). On the Quick Calendar
  // page, which never has a link, a name for it ("quick:" and its id), which store.readLinked reads.
  function linkedSource(fractal) {
    const item = fractal.linked;
    if (store.quick) return `quick:${item.id}`;
    if (item.connection) return (typeof sheetConnectionById === "function" && sheetConnectionById(item.connection)?.link) || "";
    return item.link || "";
  }

  // Where it comes from, in words: a connected calendar's name, or "Its own link"
  function linkedFrom(fractal) {
    const connection = fractal.linked.connection && typeof sheetConnectionById === "function" ? sheetConnectionById(fractal.linked.connection) : null;
    return connection ? `The connected calendar ${connection.name}` : "Its own subscription link";
  }

  // What this device kept of its last reads
  function linkedCache() {
    try {
      const kept = JSON.parse(read(LINKED_CACHE_KEY) || "{}");
      return kept && typeof kept === "object" ? kept : {};
    } catch {
      return {};
    }
  }

  // Read the linked fractals (each one read in the last 15 minutes keeps that, unless force), then draw again. A read that
  // fails keeps the entries read before, and its fractal says what went wrong.
  let linkedReading = null;
  function readLinked({ force = false } = {}) {
    if (!canLink()) return Promise.resolve();
    if (linkedReading) return linkedReading;
    linkedReading = (async () => {
      // (What this device kept is read only when a fractal needs it, and written only when it changed: it can be large, and
      // this runs with every change to the budget)
      let cache = null;
      let cacheChanged = false;
      const keptReads = () => cache || (cache = linkedCache());
      const fractals = linkedFractals();
      const ids = new Set(fractals.map(fractal => fractal.id));
      let changed = false;
      for (const fractal of fractals) {
        const link = linkedSource(fractal);
        const known = linkedReads.get(fractal.id);
        const now = Date.now();
        if (!link) {
          if (!known || known.problem !== "gone") changed = true;
          linkedReads.set(fractal.id, { calendar: null, at: now, link, problem: "gone" });
          continue;
        }
        if (!force && known && known.link === link && now - known.at < LINKED_READ_MS) continue;
        const kept = keptReads()[fractal.id];
        if (!force && !known && kept && kept.link === link && now - kept.at < LINKED_READ_MS && typeof kept.text === "string") {
          try {
            linkedReads.set(fractal.id, { calendar: Calendars.parseCalendar(kept.text), at: kept.at, link, problem: "" });
            changed = true;
            continue;
          } catch {}
        }
        try {
          const text = store.quick ? await store.readLinked(fractal.linked.id) : await Calendars.readCalendarFile(link);
          const calendar = Calendars.parseCalendar(text);
          linkedReads.set(fractal.id, { calendar, at: now, link, problem: "" });
          if (text.length <= LINKED_CACHE_MAX) keptReads()[fractal.id] = { at: now, link, text };
          else delete keptReads()[fractal.id];
          cacheChanged = true;
        } catch (err) {
          // (A dropped connection is tried again next time; a problem the server named waits the 15 minutes)
          const lasting = !!(err && err.lasting);
          linkedReads.set(fractal.id, { calendar: known && known.link === link ? known.calendar : null, at: lasting ? now : 0, link, problem: (err && err.message) || "Couldn't read that calendar just now." });
        }
        changed = true;
      }
      // (One that's no longer linked goes, and so does what was kept of it)
      for (const id of [...linkedReads.keys()]) {
        if (ids.has(id)) continue;
        linkedReads.delete(id);
        changed = true;
        keptReads();
      }
      if (cache) {
        for (const id of Object.keys(cache)) {
          if (ids.has(id)) continue;
          delete cache[id];
          cacheChanged = true;
        }
      }
      if (cacheChanged) {
        try { localStorage.setItem(LINKED_CACHE_KEY, JSON.stringify(cache)); } catch { try { localStorage.removeItem(LINKED_CACHE_KEY); } catch {} }
      }
      if (changed) {
        dayCache = new Map();
        linkedEvents = new Map();
        document.dispatchEvent(new CustomEvent("fractals:changed"));
      }
    })().finally(() => { linkedReading = null; });
    return linkedReading;
  }

  // What a linked fractal's last read says went wrong, in words ("" for nothing)
  function linkedProblem(fractal) {
    const known = linkedReads.get(fractal.id);
    if (!known || !known.problem) return "";
    return known.problem === "gone" ? "Its connected calendar isn't there anymore. Edit it to pick another, or unlink it." : known.problem;
  }

  // A linked fractal's entries that are on any of the days from one through another, as entries (each happening once)
  const hhmm = (date) => `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  function linkedEventsIn(fractal, from, to) {
    const known = linkedReads.get(fractal.id);
    if (!known || !known.calendar) return [];
    let found = [];
    try {
      found = Calendars.eventsBetween(known.calendar, dayOf(from), dayOf(to)).events;
    } catch (err) {
      console.error("Couldn't work out a linked calendar's entries:", err);
      return [];
    }
    const seen = new Map();
    return found.map(item => {
      let start;
      let end;
      let startTime = null;
      let endTime = null;
      if (item.allDay) {
        start = formatToYMD(item.date);
        end = formatToYMD(addDays(item.date, Math.max(1, item.days) - 1));
      } else {
        const begins = new Date(item.start);
        const ends = new Date(item.end);
        start = formatToYMD(begins);
        end = formatToYMD(ends);
        startTime = hhmm(begins);
        endTime = hhmm(ends);
      }
      const key = `${fractal.id}|${start}|${startTime || ""}|${item.title}`;
      const count = (seen.get(key) || 0) + 1;
      seen.set(key, count);
      const event = {
        id: count > 1 ? `${key}|${count}` : key, fractal: fractal.id, title: item.title || "(No title)", allDay: !!item.allDay, start, end, startTime, endTime,
        travel: 0, location: item.location ? { text: item.location } : null, notes: item.notes || "", linked: fractal.name
      };
      linkedEvents.set(event.id, event);
      return event;
    });
  }

  // Read a calendar before it's linked, so a link that doesn't open says so first: { ok } or { error }
  async function tryLink(link) {
    try {
      Calendars.parseCalendar(await Calendars.readCalendarFile(link));
      return { ok: true };
    } catch (err) {
      return { error: (err && err.message) || "Couldn't read that calendar. Check its link and try again." };
    }
  }

  // A color for a new fractal, linked or not: the next one in COLORS after the ones there
  function nextColor() {
    return COLORS[data ? (data.fractals.length + linkedFractals().length) % COLORS.length : 0];
  }

  // A linked fractal's window: its name, color, where it comes from, Read Again, Share, Save, and Unlink
  function openLinkedFractal(origin, fractal) {
    BudgetUI.openPanel({
      origin,
      size: "small",
      stacked: !!(origin && origin.closest(".budgetPanel")),
      title: `Edit ${fractal.name}`,
      build(form, panel) {
        const name = BudgetUI.textField({ label: "Name", value: fractal.name, maxLength: LIMITS.fractalName });
        const color = colorField(fractal.color);
        const from = BudgetUI.field("Comes from", BudgetUI.noTranslate(el("p", "panelText", linkedFrom(fractal))), { hint: "Its entries can't be changed here: change them in that calendar, and they change here the next time it's read (at most 15 minutes later)." });
        const trouble = linkedProblem(fractal);
        form.append(name.el, color.el, from);
        if (trouble) form.append(el("p", "panelError linkedProblem", trouble));
        form.append(BudgetUI.buttonRow([
          { label: "Save", kind: "primary", type: "submit" },
          { label: "Read Again", onClick: async () => {
            panel.setBusy(true);
            await readLinked({ force: true });
            panel.setBusy(false);
            const problemNow = linkedProblem(fractal);
            if (problemNow) panel.setError(problemNow);
            else toast(`Read ${fractal.name} again.`);
          } },
          { label: "Share", onClick: (event) => openShare(event.currentTarget, fractal) },
          { label: "Unlink", kind: "danger", onClick: async () => {
            if (!window.confirm(`Unlink ${fractal.name}? Its entries leave your calendar (the calendar they come from stays as it is).`)) return;
            panel.setBusy(true);
            const result = await deleteLinkedFractal(fractal.linked.id);
            panel.setBusy(false);
            if (!result.ok) return panel.setError(result.message || "That didn't work. Please try again.");
            panel.close();
            toast(`${fractal.name} was unlinked.`);
            readLinked();
          } },
          { label: "Cancel", onClick: () => panel.close() }
        ]));
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          panel.setError("");
          if (!name.value()) return panel.setError("Give the calendar fractal a name.");
          panel.setBusy(true);
          const result = await saveLinkedFractal({ name: name.value(), color: color.value(), link: fractal.linked.link, connection: fractal.linked.connection }, fractal.linked.id);
          panel.setBusy(false);
          if (!result.ok) return panel.setError(result.message || "Couldn't save it. Please try again.");
          panel.close();
          toast(`${name.value()} was saved.`);
          document.dispatchEvent(new CustomEvent("fractals:changed"));
        });
      }
    });
  }

  // Home and the Budgets, Calendars & Spreadsheets page read the linked fractals once the budget's in, when it changes (one
  // linked or unlinked), and when the page comes back into view
  if (window.workspaceReady && (window.PAGE === "home" || window.PAGE === "spreadsheets")) {
    window.workspaceReady.then((loaded) => { if (loaded) readLinked(); });
    document.addEventListener("budget:updated", () => readLinked());
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") readLinked(); });
  }

  //#endregion

  // =====================================================================
  // #region HOLIDAYS (a fractal of the year's holidays, on every budget's calendar)
  // =====================================================================
  // Holidays shows the days in Holidays.js, all day, every year. Its entries can't be added to, changed, or taken out, and
  // it's never the default; its color is the budget's (sheetsData.holidays: Process Budget.js saveHolidays), it moves in
  // the order like any fractal, and it's checked on Home or not (this device). It shows where linked fractals do.

  const HOLIDAYS_ID = "holidays";
  const HOLIDAYS_COLOR = "#c98a5a";
  const canHolidays = () => canLink() && typeof window.Holidays !== "undefined";

  // [Holidays, as a fractal: { id, name, color, holidays: true }], or [] where it doesn't show
  function holidayFractals() {
    if (!canHolidays()) return [];
    const sheets = budgetSheets();
    const kept = sheets.holidays && /^#[0-9a-f]{6}$/.test(sheets.holidays.color || "") ? sheets.holidays.color : HOLIDAYS_COLOR;
    return [{ id: HOLIDAYS_ID, name: "Holidays", color: kept, holidays: true }];
  }

  // Its entries on the days from one through another, as entries (each happening once, read only like a linked one's)
  function holidayEventsIn(from, to) {
    return window.Holidays.between(from, to).map(item => {
      const event = {
        id: `${HOLIDAYS_ID}|${item.day}|${item.title}`, fractal: HOLIDAYS_ID, title: item.title, allDay: true, start: item.day, end: item.day,
        startTime: null, endTime: null, travel: 0, location: null, notes: "", linked: "Holidays", holiday: true
      };
      linkedEvents.set(event.id, event);
      return event;
    });
  }

  // Its window: its color (its name and days are as they are), Save, and Cancel
  function openHolidays(origin, fractal) {
    BudgetUI.openPanel({
      origin,
      size: "small",
      stacked: !!(origin && origin.closest(".budgetPanel")),
      title: "Edit Holidays",
      build(form, panel) {
        const color = colorField(fractal.color);
        form.append(
          el("p", "panelText", "The United States' federal holidays (with the day each is observed, when it falls on a weekend) and other days widely kept, every year, all day."),
          color.el,
          el("p", "panelHint", "Its days can't be added to, changed, or taken out. To hide them on this device, uncheck Holidays in Home's Calendar Fractals. Its color is kept with the budget."),
          BudgetUI.buttonRow([{ label: "Save", kind: "primary", type: "submit" }, { label: "Cancel", onClick: () => panel.close() }])
        );
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          panel.setError("");
          panel.setBusy(true);
          const result = await saveHolidays({ color: color.value() });
          panel.setBusy(false);
          if (!result.ok) return panel.setError(result.message || "Couldn't save it. Please try again.");
          panel.close();
          toast("Holidays was saved.");
          dayCache = new Map();
          document.dispatchEvent(new CustomEvent("fractals:changed"));
        });
      }
    });
  }

  //#endregion

  // =====================================================================
  // #region MEALS (the budget's meals, from the Kitchen tab and New Entry's Meal: Kitchen.js)
  // =====================================================================
  // Meals is on every budget's calendar where Kitchen.js is (and on the Quick Calendar page, from its icon's answer). Its
  // entries are the budget's meals, all day, each on the days it lands on, and tapping one opens it (Kitchen UI.js). It
  // can't be deleted and is never the default; its color is the budget's (kitchenData.color: Kitchen.saveColor), it moves
  // in the order like any fractal, and it's checked on Home or not (this device).

  const MEALS_ID = "meals";
  let mealEvents = new Map(); // The meals as entries, by their id (for a tap)

  // (The meals are the budget's: a change to it can change which days have them)
  document.addEventListener("budget:updated", () => { dayCache = new Map(); });

  // [Meals, as a fractal: { id, name, color, meals: true }], or [] where it doesn't show
  function mealFractals() {
    if (!window.Kitchen) return [];
    return [{ id: MEALS_ID, name: "Meals", color: window.Kitchen.data().color, meals: true }];
  }

  // Its entries: every meal, as an entry that repeats the way the meal does (the days drawn are worked out from them). A
  // meal from a Quick Calendar icon that hasn't joined the budget yet is waiting (a dashed edge), like a calendar entry.
  function mealEventsIn() {
    mealEvents = new Map();
    return window.Kitchen.data().meals.map((meal) => {
      const shown = window.Kitchen.mealView(meal);
      const event = {
        id: `meal:${meal.id}`, fractal: MEALS_ID, title: shown.title, allDay: true, start: meal.start, end: meal.start, startTime: null,
        endTime: null, travel: 0, location: null, notes: shown.notes, repeat: meal.repeat || null, until: meal.until || null,
        skip: meal.skip || [], meal: meal.id, owned: true, ...(window.Kitchen.isWaiting(meal) ? { waiting: true } : {})
      };
      mealEvents.set(event.id, event);
      return event;
    });
  }

  // Its window: its color (its entries are the meals), Save, and Cancel
  function openMealsFractal(origin, fractal) {
    BudgetUI.openPanel({
      origin,
      size: "small",
      stacked: !!(origin && origin.closest(".budgetPanel")),
      title: "Edit Meals",
      build(form, panel) {
        const color = colorField(fractal.color);
        form.append(
          el("p", "panelText", "Your budget's meal entries, from the Kitchen tab and New Entry's Meal."),
          color.el,
          el("p", "panelHint", "It can't be deleted. To hide its meals on this device, uncheck Meals in Home's Calendar Fractals. Its color is kept with the budget."),
          BudgetUI.buttonRow([{ label: "Save", kind: "primary", type: "submit" }, { label: "Cancel", onClick: () => panel.close() }])
        );
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          panel.setError("");
          panel.setBusy(true);
          const result = await window.Kitchen.saveColor(color.value());
          panel.setBusy(false);
          if (!result.ok) return panel.setError(result.message || "Couldn't save it. Please try again.");
          panel.close();
          toast("Meals was saved.");
          dayCache = new Map();
          document.dispatchEvent(new CustomEvent("fractals:changed"));
        });
      }
    });
  }

  // The fractals that aren't the account's or the budget's Calendar Fractals: the linked ones, Holidays, and Meals
  const otherFractals = () => [...linkedFractals(), ...holidayFractals(), ...mealFractals()];
  const otherEventsIn = (fractal, from, to) => (fractal.meals ? mealEventsIn() : fractal.holidays ? holidayEventsIn(from, to) : linkedEventsIn(fractal, from, to));

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
    // (A linked one says so, and what went wrong reading it, if anything did)
    if (fractal.linked) label.append(el("span", "budgetDetail fractalLinkedNote", linkedProblem(fractal) ? "Linked: couldn't read it" : "Linked"));
    // (One that's the budget's says so; one shared with the account says whose, and whether it can change it)
    if (fractal.perBudget) label.append(el("span", "budgetDetail fractalLinkedNote", fractal.canChange === false ? "The budget's, to look at" : "The budget's"));
    if (fractal.sharedBy) label.append(BudgetUI.noTranslate(el("span", "budgetDetail fractalLinkedNote", `${fractal.sharedBy}'s${fractal.canChange === false ? ", to look at" : ""}`)));
    item.append(label);
    if (fractal.linked) item.append(button("Edit", "budgetShare", (event) => openLinkedFractal(event.currentTarget, fractal), `Edit ${fractal.name}`));
    else if (fractal.sharedBy && !store.quick) item.append(button("Leave", "budgetShare", () => leaveShared(fractal), `Take ${fractal.name} off your calendar`));
    else if (fractal.id !== SHARED && !store.quick && fractal.canChange !== false) item.append(button("Edit", "budgetShare", (event) => openFractal(event.currentTarget, fractal), `Edit ${fractal.name}`));
    return item;
  }

  // A fractal shared with the account, taken off its calendar (its owner can share it again)
  async function leaveShared(fractal) {
    if (!window.confirm(`Take ${fractal.name} off your calendar? ${fractal.sharedBy} can share it with you again.`)) return;
    const result = await change("people/decline", { fractal: fractal.id });
    if (!result.ok) return toast(problem(result, "That didn't work. Please try again."), true);
    if (result.data.error) return toast(result.data.error, true);
    toast(`${fractal.name} is off your calendar.`);
  }

  // A whole fractal someone shared with the account: whose, and Join or Decline
  function fractalInvitationItem(invitation) {
    const item = el("li", "budgetItem isInvitation");
    const about = el("div", "budgetOpen");
    const name = el("span", "budgetName", invitation.name);
    name.translate = false;
    about.append(name, BudgetUI.noTranslate(el("span", "budgetDetail", `${invitation.owner}'s calendar fractal${invitation.canEdit ? "" : ", to look at"}, for you to join`)));
    const buttons = el("div", "budgetInvitationButtons");
    const answer = async (route) => {
      const result = await change(route, { fractal: invitation.id });
      if (!result.ok) return toast(problem(result, "That didn't work. Please try again."), true);
      if (result.data.error) return toast(result.data.error, true);
      toast(route === "people/join" ? `${invitation.name} is on your calendar.` : `You declined ${invitation.name}.`);
    };
    buttons.append(button("Join", "primary", () => answer("people/join"), `Join ${invitation.name}`), button("Decline", "", () => answer("people/decline"), `Decline ${invitation.name}`));
    item.append(about, buttons);
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
    section("Yours", inOrder([...data.fractals.filter(fractal => !fractal.sharedBy), ...holidayFractals(), ...mealFractals()]).map(fractalItem));
    section("Linked", inOrder(linkedFractals()).map(fractalItem));
    section("Shared With You", [...inOrder(data.fractals.filter(fractal => fractal.sharedBy)), ...(hasShared() ? [{ id: SHARED, name: "Shared With You", color: SHARED_COLOR }] : [])].map(fractalItem));
    section("Invitations", [...data.fractalInvitations.map(fractalInvitationItem), ...data.invitations.map(invitationItem)]);
  }

  // The picker's words: how many fractals show, and a dot while invitations wait
  function showPicker(picker) {
    if (!picker) return;
    const linked = otherFractals();
    const all = data ? data.fractals.length + linked.length + (hasShared() ? 1 : 0) : 0;
    const shown = data ? data.fractals.filter(fractal => isShown(fractal.id)).length + linked.filter(fractal => isShown(fractal.id)).length + (hasShared() && isShown(SHARED) ? 1 : 0) : 0;
    const invitations = data ? data.invitations.length + data.fractalInvitations.length : 0;
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

  // A color to pick: the site's swatches, and a box for any other (Budget UI.js, which prisms' cards use too)
  function colorField(value) {
    return BudgetUI.colorField(value, { hint: "Its entries show in this color on the calendar." });
  }

  // A fractal's window: its name and color (and for one that's there already, Share and Delete). A calendar from somewhere
  // else is linked from Automated Calendars & Paychecks instead (Calendars Page.js), and a linked one opens its own window.
  function openFractal(origin, fractal) {
    if (fractal && fractal.linked) return openLinkedFractal(origin, fractal);
    if (fractal && fractal.holidays) return openHolidays(origin, fractal);
    if (fractal && fractal.meals) return openMealsFractal(origin, fractal);
    BudgetUI.openPanel({
      origin,
      size: "small",
      stacked: !!(origin && origin.closest(".budgetPanel")),
      title: fractal ? `Edit ${fractal.name}` : "New Calendar Fractal",
      build(form, panel) {
        const name = BudgetUI.textField({ label: "Name", value: fractal ? fractal.name : "", placeholder: "Like Work or Family", maxLength: LIMITS.fractalName });
        const color = colorField(fractal ? fractal.color : nextColor());
        // (A new one is the budget's to start, or the account's own: the switch on each in the manager changes it later)
        const perBudget = fractal ? null : perBudgetSwitch(true);
        const buttons = [{ label: fractal ? "Save" : "Make It", kind: "primary", type: "submit" }, { label: "Cancel", onClick: () => panel.close() }];
        if (fractal) buttons.splice(1, 0, { label: "Share", onClick: (event) => openShare(event.currentTarget, fractal) });
        if (fractal && data.fractals.filter(item => !item.sharedBy).length > 1) {
          buttons.push({ label: "Delete", kind: "danger", onClick: async () => {
            const count = data.events.filter(event => event.fractal === fractal.id).length;
            const everyone = fractal.perBudget && typeof budgetInfo !== "undefined" && budgetInfo && budgetInfo.shared ? ", for everyone in this budget" : "";
            if (!window.confirm(`Delete ${fractal.name}${count > 0 ? ` and its ${count} ${count === 1 ? "entry" : "entries"}` : ""}${everyone}? This can't be undone.`)) return;
            panel.setBusy(true);
            const result = await change("delete", { id: fractal.id });
            panel.setBusy(false);
            if (!result.ok) return panel.setError(problem(result, "Couldn't delete it. Please try again."));
            panel.close();
            toast(`${fractal.name} was deleted.`);
          } });
        }
        form.append(name.el, color.el, ...(perBudget ? [perBudget.el] : []), BudgetUI.buttonRow(buttons));
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          panel.setError("");
          if (!name.value()) return panel.setError("Give the calendar fractal a name.");
          panel.setBusy(true);
          if (perBudget && perBudget.value() && !(await sharedBudgetOkay(true))) return panel.setBusy(false);
          const result = await change("save", { ...(fractal ? { id: fractal.id } : { perBudget: perBudget.value() }), name: name.value(), color: color.value() });
          panel.setBusy(false);
          if (!result.ok) return panel.setError(problem(result, "Couldn't save it. Please try again."));
          panel.close();
          toast(fractal ? `${name.value()} was saved.` : `${name.value()} is in your calendar fractals.`);
        });
      }
    });
  }

  // The Per Budget switch (on: the budget's, which everyone it's shared with sees and changes, only while it's open; off:
  // the account's own, in every budget, which only it sees), with its ?
  function perBudgetSwitch(on) {
    const toggle = BudgetUI.checkboxField({ label: "Per Budget", checked: on });
    const box = el("div", "perBudgetSwitch");
    box.append(toggle.el); // (Its ? goes beside it, so it needs a place first)
    const help = el("div", "");
    help.append(
      el("p", "", "On, it's this budget's: it shows only while this budget is open, and everyone the budget is shared with sees it and can add to it, change it, or delete it. Its entries' alerts go to all of them."),
      el("p", "", "Off, it's your own: it shows in every budget you open, and only you see it."),
      el("p", "", "Turning it off takes it out of the budget for everyone else (it's yours from then on).")
    );
    BudgetUI.addSwitchHelp(toggle.el, "What Per Budget does", help);
    return { el: box, input: toggle.input, value: toggle.value };
  }

  // In a budget that's shared, a fractal going in or out of it is everyone's business: ask first (true: go ahead)
  async function sharedBudgetOkay(on, fractalName = "") {
    const shared = typeof budgetInfo !== "undefined" && budgetInfo && budgetInfo.shared;
    if (!shared) return true;
    return window.confirm(on
      ? `Everyone this budget is shared with will see ${fractalName || "this fractal"} and its entries, and can change them. Go ahead?`
      : `${fractalName} will be yours alone, so it leaves this budget for everyone else. Go ahead?`);
  }

  // A fractal becomes the budget's (on) or the account's own (off): { ok }
  async function setPerBudget(fractal, on) {
    if (!(await sharedBudgetOkay(on, fractal.name))) return { ok: false, asked: true };
    const result = await change("budget", { id: fractal.id, on });
    if (!result.ok || result.data?.error) {
      toast(result.data?.error || problem(result, "Couldn't change it. Please try again."), true);
      return { ok: false };
    }
    toast(on ? `${fractal.name} is this budget's now.` : `${fractal.name} is your own now, in every budget.`);
    return { ok: true };
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
    const field = BudgetUI.textField({ label: "Location", value: location ? location.text : "", placeholder: "An address or a place", optional: true, maxLength: LIMITS.location });
    field.input.autocomplete = "off";
    return { el: field.el, value: () => (field.value() ? { text: field.value() } : null) };
  }

  // Alerts: push notifications some minutes, days, weeks, or months before the entry starts, or after it starts (while it's
  // on), as many as wanted, each one an alarm if its Alarm switch is on (it stays on the screen until it's dismissed,
  // vibrates where the device allows, and rings while a Prismal page is open: sw.js and Sounds.js). value(): [{ count,
  // unit, after (only when on), alarm (only when on) }], or null when a number can't be read.
  function alertsField(alerts) {
    const rows = el("div", "alertRows");
    const addRow = (alert) => {
      const row = el("div", "alertRow");
      const timing = el("div", "frequencyRow alertTiming");
      const count = el("input", "frequencyCount");
      count.type = "text";
      count.inputMode = "numeric";
      count.maxLength = String(LIMITS.frequencyCount).length;
      count.value = String(alert.count);
      count.setAttribute("aria-label", "How long");
      const unit = el("select", "selectInput frequencyUnit");
      for (const option of ALERT_UNITS) unit.appendChild(new Option(option.label, option.value));
      unit.value = alert.unit;
      unit.setAttribute("aria-label", "Minutes, days, weeks, or months");
      const when = el("select", "selectInput alertWhen");
      when.append(new Option("before it starts", "before"), new Option("after it starts", "after"));
      when.value = alert.after ? "after" : "before";
      when.setAttribute("aria-label", "Before or after it starts");
      const remove = el("button", "panelClose termRemove", "×");
      remove.type = "button";
      remove.setAttribute("aria-label", "Remove alert");
      remove.addEventListener("click", () => row.remove());
      timing.append(count, unit, when, remove);
      const alarm = BudgetUI.checkboxField({ label: "Alarm", checked: !!alert.alarm });
      alarm.el.classList.add("alertAlarm");
      alarm.input.classList.add("alertAlarmSwitch");
      row.append(timing, alarm.el);
      rows.append(row);
    };
    alerts.forEach(addRow);
    const add = button("+ Add Alert", "termAdd", () => {
      if (rows.childElementCount >= MAX_ALERTS) return toast(`An entry can have up to ${MAX_ALERTS} alerts.`, true);
      addRow({ count: 15, unit: "minutes" });
      Limits.near("alerts", rows.childElementCount);
    });
    const box = el("div", "alertBox");
    box.append(rows, add);
    return {
      el: BudgetUI.field("Alerts", box, { optional: true, hint: "Push notifications before it starts, or after it starts (while it's on), on your devices with notifications on (Settings turns them on). Alarm: it stays on the screen until you dismiss it, vibrates where the phone allows, and rings a loud chime while Prismal is open. A phone's own alert sound can't be changed by a website, so a locked phone gives its usual notification sound." }),
      value() {
        const list = [];
        for (const row of rows.children) {
          const count = Number(row.querySelector("input").value.trim() || "0");
          if (!Number.isInteger(count) || count < 0 || count > LIMITS.frequencyCount) return null;
          const after = row.querySelector(".alertWhen").value === "after" && count > 0;
          const alarm = row.querySelector(".alertAlarmSwitch").checked;
          list.push({ count, unit: row.querySelector(".frequencyUnit").value, ...(after ? { after: true } : {}), ...(alarm ? { alarm: true } : {}) });
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
    typed.maxLength = LIMITS.email;
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
  function eventFields({ event = null, day = null, title = "", repeat = false } = {}) {
    // (Only the fractals it can add to: not one shared with it, or a budget's, that it can only look at)
    const fractals = data ? inOrder(data.fractals.filter(fractal => fractal.canChange !== false)) : [];
    const startDay = day || (event ? event.start : formatToYMD(today));
    const span = event ? daysBetween(event.start, event.end) : 0;
    const now = new Date();
    const nextHour = startDay === formatToYMD(createSafeMidnight(now)) ? Math.min(23, now.getHours() + 1) * 60 : 9 * 60;

    const titleField = BudgetUI.textField({ label: "Title", value: event ? event.title : title, placeholder: "Like Dentist or Lunch with Sam", maxLength: MAX_TITLE });
    const fractalField = BudgetUI.selectField({
      label: "Calendar Fractal",
      options: fractals.map(fractal => ({ value: fractal.id, label: fractal.name })),
      // (A new one starts in the default fractal, or without one, the first one showing)
      value: event && fractals.some(fractal => fractal.id === event.fractal) ? event.fractal : (fractals.find(fractal => fractal.isDefault) || fractals.find(fractal => isShown(fractal.id)) || fractals[0] || { id: "" }).id
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

    const repeats = BudgetUI.checkboxField({ label: "Repeat", checked: event ? !!event.repeat : repeat });
    const count = el("input", "frequencyCount");
    count.type = "text";
    count.inputMode = "numeric";
    count.maxLength = String(LIMITS.frequencyCount).length;
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
      repeatEls: [repeats.el, repeatBox], // (Repeat, and its Frequency and End repeat)
      noteEl: notes.el,
      titleInput: titleField.input,
      // What's typed so far, for another kind of New Entry: { title, date (a Date, or null) }
      typed: () => ({ title: titleField.value(), date: starts.value() || null }),
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
          if (!Number.isInteger(number) || number < 1 || number > LIMITS.frequencyCount) return { error: `Pick how often it repeats: every 1 to ${LIMITS.frequencyCount} days, weeks, or months.` };
          repeat = { count: number, unit: unit.value };
          const stop = until.value();
          if (stop === undefined) return { error: "End repeat isn't a date. Clear it, or pick a day." };
          if (stop && formatToYMD(stop) < start) return { error: "It can stop repeating on its first day or any day after." };
          last = stop ? formatToYMD(stop) : null;
        }
        const alertList = alerts.value();
        if (!alertList) return { error: `Each alert is 0 to ${LIMITS.frequencyCount} minutes, days, weeks, or months before or after it starts.` };
        const fractal = Number(fractalField.value());
        if (!fractal) return { error: "Pick a calendar fractal for it." };
        return {
          fractal,
          event: {
            title: titleField.value(), allDay: whole, start, startTime: whole ? null : startTime.value.slice(0, 5), end, endTime: whole ? null : endTime.value.slice(0, 5),
            // (One being changed keeps its own time zone, whose times the form shows; a new one is this device's)
            zone: (event && event.zone) || timeZone(), location: location.value(), travel: whole ? 0 : Number(travel.value()), repeat, until: last,
            skip: repeat && event && event.repeat ? event.skip || [] : [], alerts: alertList, notes: notes.value().trim()
          }
        };
      }
    };
  }

  // Save a new entry, or a changed one (id), then send a new one's invitations, noting the change for Undo (UNDO, below).
  // sharesFrom: see store.save. Resolves to { ok, message }.
  async function saveEvent(id, fractal, event, invites = [], sharesFrom = null) {
    const before = id ? entryNow(id) : null;
    const result = await store.save(id, fractal, event, sharesFrom);
    if (!result.ok || !result.data) return { ok: false, message: problem(result, "Couldn't save it. Please try again.") };
    if (Array.isArray(result.data.fractals)) took(result.data);
    if (result.data.error) return { ok: false, message: result.data.error };
    noteChange(result.data.saved, before, entryNow(result.data.saved), sharesFrom);
    const problems = [];
    for (const who of invites) {
      const shared = await change("share", { event: result.data.saved, to: who });
      if (!shared.ok) problems.push(`${who}: ${problem(shared, "couldn't be invited")}`);
    }
    if (problems.length > 0) toast(`Saved, but ${problems.join(" ")}`, true);
    return { ok: true, id: result.data.saved };
  }

  // The long buttons across the top of New Entry: a budget entry (not on the Quick Calendar page, which has no budget), a
  // calendar entry, or a meal (where Kitchen UI.js is: Home and the Quick Calendar page)
  function kindSwitch(kind, onPick) {
    const kinds = [
      ...(store.quick ? [] : [{ key: "budget", label: "Budget Entry" }]),
      { key: "calendar", label: "Calendar Entry" },
      ...(window.KitchenUI ? [{ key: "meal", label: "Meal" }] : [])
    ];
    const picker = BudgetUI.segmented(kinds, kind, onPick);
    picker.el.classList.add("entryKind");
    picker.el.classList.toggle("threeKinds", kinds.length === 3);
    picker.el.setAttribute("aria-label", "What kind of entry");
    return picker.el;
  }

  // New Entry as a calendar entry (date: the day it starts; title: what was typed in the other kind's form; repeat: it
  // starts with Repeat on, from the Recurring page). Its other buttons go to those forms.
  function openNewEvent(origin, { date = today, title = "", repeat = false } = {}) {
    BudgetUI.openPanel({
      origin,
      size: "large",
      title: "New Entry",
      build(form, panel) {
        panel.panel.classList.add("eventPanel");
        const fields = eventFields({ day: formatToYMD(date), title, repeat });
        const switchable = !store.quick || window.KitchenUI;
        const kinds = switchable && window.PAGE !== "recurring" ? [kindSwitch("calendar", (kind) => {
          const typed = fields.typed();
          if (kind === "budget") BudgetUI.openNewEntry(origin, { date: typed.date || date, kind: "budget" });
          if (kind === "meal") window.KitchenUI.openNewMeal(origin, { date: typed.date || date, title: typed.title });
        })] : [];
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
          const result = await undoable(`added ${event.title} on ${showDay(dayOf(event.start))} to your calendar`, () => saveEvent(null, fractal, event, fields.pendingShares()));
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

  // A repeating entry's Delete, Just this day: the days before it keep the entry, which now stops repeating the day
  // before (with none before, it goes), and a new one starts on its next day, repeating the same way through the same
  // last day, with its alerts, notes, and people (shared with whoever the old one is). One with no next day only stops.
  // A monthly one whose next day a shorter month moved (the 31st, on April 30th) would go on repeating on that day, so
  // that day is only left out instead. When the new one can't be saved, the old one goes back to how it was. Resolves to
  // { ok, message }.
  async function deleteOneDay(event, day) {
    const stored = storedOf(event);
    const span = daysBetween(event.start, event.end);
    const earlier = occurrences(event, event.start, plusDays(day, -1)).some(item => item.day < day);
    let next = null;
    let index = firstOccurrenceFrom(event, plusDays(day, 1));
    for (let tries = 0; tries < 4000; tries++, index++) {
      const candidate = occurrenceDay(event, index);
      if (event.until && candidate > event.until) break;
      if (candidate <= day || (event.skip && event.skip.includes(candidate))) continue;
      next = candidate;
      break;
    }
    const after = (from) => (event.skip || []).filter(skipped => skipped > from);
    if (!earlier && !next) {
      const result = await removeEvent(event.id);
      if (!result.ok || !result.data) return { ok: false, message: problem(result, "Couldn't delete it. Please try again.") };
      return result.data.error ? { ok: false, message: result.data.error } : { ok: true };
    }
    if (next && event.repeat.unit === "months" && next.slice(8) !== event.start.slice(8)) {
      return saveEvent(event.id, event.fractal, { ...stored, skip: [...(event.skip || []), day] });
    }
    if (!earlier) return saveEvent(event.id, event.fractal, { ...stored, start: next, end: plusDays(next, span), skip: after(next) });
    const ended = await saveEvent(event.id, event.fractal, { ...stored, until: plusDays(day, -1), skip: (event.skip || []).filter(skipped => skipped < day) });
    if (!ended.ok || !next) return ended;
    const made = await saveEvent(null, event.fractal, { ...stored, start: next, end: plusDays(next, span), until: event.until || null, skip: after(next) }, [], event.id);
    if (made.ok) return made;
    const restored = await saveEvent(event.id, event.fractal, stored);
    return { ok: false, message: restored.ok ? made.message : `It ends before ${showDate(dayOf(day))} now, but its days after couldn't be saved. Check your connection, then change its end back.` };
  }

  // A tapped entry's window. One shared with the account (or, on the Quick Calendar page, one already on the calendar)
  // only shows; the account's own can be changed or deleted, and a repeating one asks whether that's for the tapped day
  // or every time (every: it starts on Every time, from the Recurring page). It says it opened ("entry:opened"), so Home
  // can give it ‹ and › to the entries around it. A meal opens the meal's own window (Kitchen UI.js).
  function openEvent(origin, event, day = event.start, { every = false } = {}) {
    if (event.meal && window.KitchenUI && window.Kitchen) {
      const meal = window.Kitchen.data().meals.find(item => item.id === event.meal);
      return meal ? window.KitchenUI.openMeal(origin, { meal, day: every ? null : day }) : null;
    }
    // (A linked fractal's entry only shows, too: it comes from another calendar. So does a meal on a page without its window)
    const locked = !event.owned || !!event.linked || !!event.meal || (store.quick && !event.waiting);
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
          const lines = [whenWords(event, day), zoneWords(event, day), repeatWords(event), event.location ? event.location.text : "", event.meal ? "Meals" : event.linked ? event.linked : event.owner ? `Shared by ${event.owner}` : (fractal ? fractal.name : "")];
          for (const line of lines.filter(Boolean)) form.append(BudgetUI.noTranslate(el("p", "panelText", line)));
          if (event.notes) form.append(BudgetUI.noTranslate(el("p", "panelText eventNotes", event.notes)));
          if (store.quick) form.append(el("p", "panelHint", "Sign in to Prismal Planning to change it."));
          // (A calendar it can see but not change: shared with it, or a budget's, without Can Edit)
          else if (fractal && fractal.canChange === false) form.append(el("p", "panelHint", "You can see this calendar, but not change it. Ask its owner to turn on Can Edit for you."));
          if (event.meal) form.append(el("p", "panelHint", "It's a meal: change it on Home, or on the Recurring Entries page when it repeats."));
          else if (event.holiday) form.append(el("p", "panelHint", "It's one of the Holidays fractal's, so it can't be changed or taken out."));
          else if (event.linked) form.append(el("p", "panelHint", "It comes from a linked calendar, so it can't be changed here. Change it in that calendar, and it changes here the next time that's read (at most 15 minutes later)."));
          form.append(BudgetUI.buttonRow([
            ...(event.owned || event.linked ? [] : [{ label: "Remove From My Calendar", kind: "danger", onClick: async () => {
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
        // (Its times are in another time zone than this device's: the form shows them as they are there)
        const zoneNote = zoneWords(event, day);
        if (zoneNote) form.append(el("p", "panelHint eventZoneNote", zoneNote));
        const repeating = !!event.repeat;
        // Just this day to start, so a change or Delete only reaches the other days when that's picked. Changing how it
        // repeats (Repeat, Frequency, End repeat) is about every time, so that picks Every time by itself.
        const scope = BudgetUI.segmented([{ key: "one", label: "Just this day" }, { key: "all", label: "Every time" }], every ? "all" : "one");
        const scopeField = BudgetUI.field("Change or delete", scope.el, { hint: `It repeats (${repeatWords(event).toLowerCase()}). Just this day leaves the rest as they are; changing how it repeats changes every time.` });
        scopeField.hidden = !repeating;
        if (repeating) {
          for (const part of fields.repeatEls) {
            for (const type of ["input", "change"]) part.addEventListener(type, () => scope.set("all"));
          }
        }
        form.append(...fields.els, scopeField, BudgetUI.buttonRow([
          { label: "Save", kind: "primary", type: "submit" },
          { label: "Delete", kind: "danger", onClick: async () => {
            const one = repeating && scope.value() === "one";
            if (!window.confirm(one ? `Delete ${event.title} on ${showDate(dayOf(day))} only?` : `Delete ${event.title}${repeating ? ", every time it repeats" : ""}?${store.quick ? " This can't be undone." : ""}`)) return;
            panel.setBusy(true);
            const deleted = await undoable(one ? `deleted ${event.title} (just ${showDay(dayOf(day))}) from your calendar` : `deleted ${event.title} from your calendar`, async () => {
              if (one) return deleteOneDay(event, day);
              const result = await removeEvent(event.id);
              return result.ok && result.data && !result.data.error ? { ok: true } : { ok: false, message: (result.data && result.data.error) || problem(result, "Couldn't delete it. Please try again.") };
            });
            panel.setBusy(false);
            if (!deleted.ok) return panel.setError(deleted.message || "Couldn't delete it. Please try again.");
            panel.close();
            toast(`Deleted ${event.title}${one ? ` on ${showDate(dayOf(day))}` : ""}.`);
          } },
          { label: "Copy", onClick: (clicked) => copyEvent(clicked.currentTarget) },
          { label: "Cancel", onClick: () => panel.close() }
        ]), fields.noteEl);

        // Copy: the entry as the form has it now goes on another day too, once (it doesn't repeat), at the same times and
        // for as many days, in the fractal picked, with its alerts (not who it's shared with)
        function copyEvent(button) {
          BudgetUI.openCopyTo(button, {
            hint: `A copy of ${event.title}, as this window has it now, goes on the day you pick: at the same times, once (it doesn't repeat), with its alerts. It's a copy: changing one later doesn't change the other.`,
            copy: async (target) => {
              const { event: shown, fractal: picked, error } = fields.read();
              if (error) return { ok: false, message: error };
              const start = formatToYMD(target);
              return undoable(`copied ${shown.title} to ${showDay(target)} on your calendar`, () => saveEvent(null, picked, { ...shown, start, end: plusDays(start, daysBetween(shown.start, shown.end)), repeat: null, until: null, skip: [] }));
            }
          });
        }

        form.addEventListener("submit", async (submitted) => {
          submitted.preventDefault();
          panel.setError("");
          const { event: changed, fractal: picked, error } = fields.read();
          if (error) return panel.setError(error);
          panel.setBusy(true);
          const one = repeating && scope.value() === "one";
          const result = await undoable(one ? `changed ${event.title} (just ${showDay(dayOf(day))}) on your calendar` : `changed ${event.title} on your calendar`, async () => {
            if (one) {
              // The tapped day comes out of the repeating entry, and goes on by itself as the form has it (shared with
              // the same people)
              const left = await saveEvent(event.id, event.fractal, { ...storedOf(event), skip: [...(event.skip || []), day] });
              return left.ok ? saveEvent(null, picked, { ...changed, repeat: null, until: null, skip: [] }, [], event.id) : left;
            }
            if (repeating && changed.repeat) {
              // The form shows the tapped day: the days it moved by move the whole entry (its first day, and the days
              // left out of it)
              const moved = daysBetween(day, changed.start);
              const first = plusDays(event.start, moved);
              const skip = (changed.skip || []).map(skipped => plusDays(skipped, moved));
              return saveEvent(event.id, picked, { ...changed, start: first, end: plusDays(first, daysBetween(changed.start, changed.end)), skip });
            }
            // One that happens once (or stops repeating): it's on the days the form shows
            return saveEvent(event.id, picked, changed);
          });
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

  // A calendar entry held down or right-clicked (node: its line or block, see tapped; point: where): Edit (its window), Move,
  // Copy, and Delete, each the way its window does them, as Undo steps. A repeating one's Move and Delete ask whether it's
  // just that day or every time. One that can't be changed here (shared with the account, linked, a holiday, a meal, or
  // on the Quick Calendar page) just opens, as a tap opens it.
  function quickMenu(node, point = null) {
    const found = tapped(node);
    if (!found) return;
    const { event, day } = found;
    if (!event.owned || event.linked || event.meal || event.holiday || store.quick) return openEvent(node, event, day);
    const repeating = !!event.repeat;
    const span = daysBetween(event.start, event.end);
    const when = showDay(dayOf(day));
    BudgetUI.quickMenu(node, [
      { label: "Edit", onClick: () => openEvent(node, event, day) },
      { label: "Move", onClick: () => {
        const scope = repeating ? BudgetUI.segmented([{ key: "one", label: "Just this day" }, { key: "all", label: "Every time" }], "one") : null;
        BudgetUI.openMoveTo(node, {
          hint: repeating
            ? `${event.title} repeats (${repeatWords(event).toLowerCase()}). Just this day moves only ${when}'s to the day you pick, at the same times; Every time moves every one by as many days.`
            : `${event.title} moves to the day you pick, at the same times.`,
          scope: scope ? BudgetUI.field("Move", scope.el) : null,
          move: (target) => {
            const to = formatToYMD(target);
            if (to === day) return Promise.resolve({ ok: true });
            const one = repeating && scope.value() === "one";
            return undoable(one ? `moved ${event.title} (just ${when}) to ${showDay(target)} on your calendar` : `moved ${event.title} to ${showDay(target)} on your calendar`, async () => {
              const stored = storedOf(event);
              if (one) {
                // (The day comes out of the repeating entry, and goes on by itself on the new day, shared with the same people)
                const left = await saveEvent(event.id, event.fractal, { ...stored, skip: [...(event.skip || []), day] });
                return left.ok ? saveEvent(null, event.fractal, { ...stored, start: to, end: plusDays(to, span), repeat: null, until: null, skip: [] }, [], event.id) : left;
              }
              const moved = daysBetween(day, to);
              const first = plusDays(event.start, moved);
              return saveEvent(event.id, event.fractal, { ...stored, start: first, end: plusDays(first, span),
                ...(repeating ? { skip: (event.skip || []).map(skipped => plusDays(skipped, moved)), until: event.until ? plusDays(event.until, moved) : null } : {}) });
            });
          }
        });
      } },
      { label: "Copy", onClick: () => BudgetUI.openCopyTo(node, {
        hint: `A copy of ${event.title} goes on the day you pick: at the same times, once (it doesn't repeat), with its alerts. It's a copy: changing one later doesn't change the other.`,
        copy: (target) => {
          const start = formatToYMD(target);
          return undoable(`copied ${event.title} to ${showDay(target)} on your calendar`, () => saveEvent(null, event.fractal, { ...storedOf(event), start, end: plusDays(start, span), repeat: null, until: null, skip: [] }));
        }
      }) },
      { label: "Delete", danger: true, onClick: () => deleteFromMenu(node, event, day) }
    ], { label: `${event.title} on ${when}`, point });
  }

  // A calendar entry's Delete from its quick menu: one that happens once after asking, and a repeating one in a small window
  // with Just This Day and Every Time
  function deleteFromMenu(node, event, day) {
    const when = showDate(dayOf(day));
    const run = async (one) => {
      const result = await undoable(one ? `deleted ${event.title} (just ${showDay(dayOf(day))}) from your calendar` : `deleted ${event.title} from your calendar`, async () => {
        if (one) return deleteOneDay(event, day);
        const removed = await removeEvent(event.id);
        return removed.ok && removed.data && !removed.data.error ? { ok: true } : { ok: false, message: (removed.data && removed.data.error) || problem(removed, "Couldn't delete it. Please try again.") };
      });
      if (!result.ok) return toast(result.message || "Couldn't delete it. Please try again.", true);
      toast(`Deleted ${event.title}${one ? ` on ${when}` : ""}.`);
    };
    if (!event.repeat) {
      if (window.confirm(`Delete ${event.title}?`)) run(false);
      return;
    }
    BudgetUI.openPanel({
      origin: node,
      size: "small",
      title: `Delete ${event.title}`,
      build(form, panel) {
        form.addEventListener("submit", (submitted) => submitted.preventDefault());
        form.append(BudgetUI.noTranslate(el("p", "panelHint", `It repeats (${repeatWords(event).toLowerCase()}). Delete only ${when}'s, or every time?`)), BudgetUI.buttonRow([
          { label: "Just This Day", kind: "danger", onClick: () => { panel.close(); run(true); } },
          { label: "Every Time", kind: "danger", onClick: () => {
            if (!window.confirm(`Delete ${event.title}, every time it repeats?`)) return;
            panel.close();
            run(false);
          } },
          { label: "Cancel", onClick: () => panel.close() }
        ]));
      }
    });
  }

  //#endregion

  // =====================================================================
  // #region UNDO (changes to calendar entries, as steps of Home's and the Kitchen tab's Undo)
  // =====================================================================
  // An entry added, changed, or deleted (a repeating entry's day changed or deleted by itself is two such changes, and a
  // Copy is one) is noted while the action is made, and becomes one step in the same list as the budget's (Process
  // Budget.js, UNDO + REDO): { label, calendar: [{ id, before, after, people, sharesFrom }] }, each side the entry as the
  // API keeps it, { fractal, event } (storedOf), read back once it's saved, or null (before: it was added; after: it was
  // deleted). Undo puts each back, newest first, while each is still as the action left it (when one changed since, it
  // says so and lets the step go, like the budget's); Redo makes the action again. An entry back after a delete, or
  // added again by Redo, is a new one (its new id goes in the step), shared again with the people it had, who are invited
  // again. The Quick Calendar page records none (it has no Undo).

  let recording = null; // The changes being noted, while an action that can be undone is being made

  // An entry of the account's as it is now: { fractal, event, people (their names) }, or null when it isn't there
  function entryNow(id) {
    const found = data && data.events.find(event => event.id === id && !event.waiting);
    return found ? { fractal: found.fractal, event: storedOf(found), people: (found.people || []).map(person => person.name).filter(Boolean) } : null;
  }

  // An entry's two versions compared as the API keeps them (the order of their keys doesn't count)
  const sortedJson = (value) => JSON.stringify(value, (key, part) => (part && typeof part === "object" && !Array.isArray(part) ? Object.fromEntries(Object.keys(part).sort().map(name => [name, part[name]])) : part));
  const sameEntry = (a, b) => (!a || !b ? !a && !b : sortedJson({ fractal: a.fractal, event: a.event }) === sortedJson({ fractal: b.fractal, event: b.event }));

  // Note one entry's change, once it's saved (before and after: entryNow's, or null)
  function noteChange(id, before, after, sharesFrom = null) {
    if (!recording) return;
    recording.push({ id, before: before && { fractal: before.fractal, event: before.event }, after: after && { fractal: after.fractal, event: after.event }, people: before ? before.people : [], ...(sharesFrom ? { sharesFrom } : {}) });
  }

  // Delete an entry, noted for Undo. Resolves to the request's result.
  async function removeEvent(id) {
    const before = entryNow(id);
    const result = await store.remove(id);
    if (result.ok && result.data && !result.data.error) {
      if (Array.isArray(result.data.fractals)) took(result.data);
      noteChange(id, before, null);
    }
    return result;
  }

  // Make an action that changes entries one Undo step, once it works (label: what it did, as Undo's button says it, like
  // "added Lunch on 12/01 to your calendar"). work resolves to { ok, ... }, which this resolves to.
  async function undoable(label, work) {
    if (store.quick || typeof rememberUndoStep !== "function") return work();
    const changes = [];
    recording = changes;
    let result = null;
    try {
      result = await work();
    } finally {
      recording = null;
      if (changes.length > 0 && result && result.ok) {
        rememberUndoStep({ label, calendar: changes });
        BudgetUI.renderUndoButtons();
      }
    }
    return result;
  }

  // Put one entry to a version: { fractal, event }, or null to delete it (made: it isn't there now, so it's added).
  // Resolves to { ok, id, message }.
  async function putEntry(item, version, made) {
    const result = !version ? await store.remove(item.id) : await store.save(made ? null : item.id, version.fractal, version.event, made && item.sharesFrom ? item.sharesFrom : null);
    if (!result.ok || !result.data || result.data.error) return { ok: false, message: (result.data && result.data.error) || problem(result, "Couldn't reach your calendar. Check your connection, then try again.") };
    if (Array.isArray(result.data.fractals)) took(result.data);
    return { ok: true, id: version && made ? result.data.saved : item.id };
  }

  // Take a step of calendar changes back (undo) or forward again (redo). Resolves to { ok, message, stale (it can't be
  // taken anymore), step (as it is now: entries made again have new ids) }. When one change of several can't be saved,
  // the ones already taken go back, so the step stays whole.
  async function takeStep(step, direction) {
    const undoing = direction === "undo";
    await load(true);
    if (!data) return { ok: false, message: "Couldn't reach your calendar. Check your connection, then try again." };
    const changed = step.calendar.find(item => !sameEntry(entryNow(item.id), undoing ? item.after : item.before));
    if (changed) {
      const title = (changed.after || changed.before).event.title;
      return { ok: false, stale: true, message: `That (${step.label}) can't be ${undoing ? "undone" : "redone"} anymore, because ${title} changed since.` };
    }
    const now = step.calendar.map(item => ({ ...item }));
    const order = undoing ? [...now].reverse() : now;
    const taken = [];
    for (const item of order) {
      const to = undoing ? item.before : item.after;
      const from = undoing ? item.after : item.before;
      const done = await putEntry(item, to, !from);
      if (!done.ok) {
        // (Back as they were, newest first)
        for (const back of taken.reverse()) {
          const put = await putEntry(back, undoing ? back.after : back.before, !(undoing ? back.before : back.after));
          if (put.ok) back.id = put.id;
        }
        return { ok: false, message: done.message };
      }
      item.id = done.id;
      taken.push(item);
      // (Made again after a delete: shared with whoever it was then)
      if (to && !from) for (const name of item.people || []) await change("share", { event: item.id, to: name });
    }
    return { ok: true, step: { ...step, calendar: now } };
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

  const HOURS_MOST_DAYS = LIMITS.hoursDays; // The most days the hours are added up over

  // Every fractal with its color, how many entries it has, its hours between the two days over the list (this week to
  // start), and Edit. container: the card's list; it's drawn again whenever the calendar changes.
  function renderManager(container) {
    // The two days the hours are added up between (both included)
    const weekStart = addDays(today, -today.getDay());
    const fromBox = BudgetUI.dateField({ label: "Hours from", date: weekStart, hint: " " });
    const toBox = BudgetUI.dateField({ label: "To", date: addDays(weekStart, 6), hint: " " });
    const range = el("div", "fractalHoursRange");
    range.append(fromBox.el, toBox.el);
    range.querySelectorAll(".panelHint").forEach(hint => hint.remove()); // (The note under both says what they're for)
    const rangeNote = el("p", "panelHint fractalHoursNote");
    rangeNote.setAttribute("aria-live", "polite");
    for (const box of [fromBox, toBox]) box.input.addEventListener("change", () => draw());
    const days = () => {
      let from = fromBox.value();
      let to = toBox.value();
      if (!from || !to) return null;
      if (from > to) [from, to] = [to, from];
      if (to > addDays(from, HOURS_MOST_DAYS - 1)) to = addDays(from, HOURS_MOST_DAYS - 1);
      return { from: formatToYMD(from), to: formatToYMD(to) };
    };
    // (The two days' boxes stay where they are while the list is drawn again, so one being typed in keeps its focus)
    const draw = () => {
      if (!data) {
        container.replaceChildren(el("p", "panelHint", "Couldn't load your calendar. Please refresh to try again."));
        return;
      }
      if (range.parentElement !== container) container.replaceChildren(range, rangeNote);
      const picked = days();
      const hours = picked ? hoursBetween(picked.from, picked.to) : new Map();
      rangeNote.textContent = picked
        ? "Each fractal's hours between these days (both included): the time its entries with a time take. All-day entries don't count."
        : "Type or pick both days to add up each fractal's hours.";
      const hoursOf = (id) => {
        const figure = el("span", "fractalHoursFigure", picked ? `${hours.get(String(id)) || 0} ${hours.get(String(id)) === 1 ? "hour" : "hours"}` : "");
        figure.hidden = !picked;
        return figure;
      };
      const list = el("ul", "budgetList budgetManager fractalManagerList");
      const ownItem = (fractal) => {
        const item = el("li", "budgetItem");
        const about = el("div", "budgetOpen");
        const name = el("span", "budgetName");
        name.translate = false;
        name.append(swatch(fractal.color), fractal.name);
        const count = data.events.filter(event => event.fractal === fractal.id).length;
        about.append(name, hoursOf(fractal.id), el("span", "budgetDetail", `${count} ${count === 1 ? "entry" : "entries"}${data.links.fractals[fractal.id] ? " · calendar link on" : ""}`));
        const buttons = el("div", "budgetInvitationButtons");
        // Default: new entries start in it (pressed on the one that is)
        const isDefault = !!fractal.isDefault;
        const defaultButton = button(isDefault ? "Default ✓" : "Default", isDefault ? "primary" : "", async (event) => {
          if (isDefault) return toast(`${fractal.name} is already where new entries start.`);
          const pressed = event.currentTarget;
          pressed.disabled = true;
          const result = await change("default", { id: fractal.id });
          if (!result.ok || result.data?.error) {
            pressed.disabled = false;
            return toast(result.data?.error || problem(result, "Couldn't change the default. Please try again."), true);
          }
          toast(`New calendar entries start in ${fractal.name} now.`);
        }, isDefault ? `${fractal.name} is the default: new entries start in it` : `Make ${fractal.name} the default, where new entries start`);
        defaultButton.setAttribute("aria-pressed", String(isDefault));
        buttons.append(defaultButton, button("Edit", "", (event) => openFractal(event.currentTarget, fractal), `Edit ${fractal.name}`));
        // Per Budget: the budget's, or the account's own
        const perBudget = perBudgetSwitch(!!fractal.perBudget);
        perBudget.input.setAttribute("aria-label", `Per Budget: ${fractal.name}`);
        perBudget.input.addEventListener("change", async () => {
          const on = perBudget.input.checked;
          perBudget.input.disabled = true;
          const result = await setPerBudget(fractal, on);
          if (!result.ok) {
            perBudget.input.checked = !on;
            perBudget.input.disabled = false;
          }
        });
        about.append(perBudget.el);
        item.append(about, buttons);
        return item;
      };
      // (Holidays: its days, and Edit for its color)
      const holidaysItem = (fractal) => {
        const item = el("li", "budgetItem");
        const about = el("div", "budgetOpen");
        const name = el("span", "budgetName");
        name.append(swatch(fractal.color), fractal.name);
        about.append(name, el("span", "budgetDetail", "Every year's holidays, all day (they can't be changed)"));
        const buttons = el("div", "budgetInvitationButtons");
        buttons.append(button("Edit", "", (event) => openHolidays(event.currentTarget, fractal), "Edit Holidays"));
        item.append(about, buttons);
        return item;
      };
      // (Meals: the budget's meals, and Edit for its color)
      const mealsItem = (fractal) => {
        const item = el("li", "budgetItem");
        const about = el("div", "budgetOpen");
        const name = el("span", "budgetName");
        name.append(swatch(fractal.color), fractal.name);
        const count = window.Kitchen.data().meals.length;
        about.append(name, el("span", "budgetDetail", `${count} meal ${count === 1 ? "entry" : "entries"} (from the Kitchen tab and New Entry's Meal)`));
        const buttons = el("div", "budgetInvitationButtons");
        buttons.append(button("Edit", "", (event) => openMealsFractal(event.currentTarget, fractal), "Edit Meals"));
        item.append(about, buttons);
        return item;
      };
      // (Linked ones: where each comes from, and what went wrong reading it, if anything did)
      const linkedItem = (fractal) => {
        const item = el("li", "budgetItem");
        const about = el("div", "budgetOpen");
        const name = el("span", "budgetName");
        name.translate = false;
        name.append(swatch(fractal.color), fractal.name);
        const trouble = linkedProblem(fractal);
        about.append(name, hoursOf(fractal.id), BudgetUI.noTranslate(el("span", "budgetDetail", `Linked: ${linkedFrom(fractal).replace(/^The connected calendar /, "")}${trouble ? ` · ${trouble}` : ""}`)));
        const buttons = el("div", "budgetInvitationButtons");
        buttons.append(button("Edit", "", (event) => openLinkedFractal(event.currentTarget, fractal), `Edit ${fractal.name}`));
        item.append(about, buttons);
        return item;
      };
      // Every fractal in the order kept with the budget, each with ≡ to move it (dragged, or with the arrow keys)
      const ordered = inOrder([...data.fractals, ...otherFractals()]);
      const save = (ids) => saveOrder(ids);
      ordered.forEach((fractal, at) => {
        const item = fractal.meals ? mealsItem(fractal) : fractal.holidays ? holidaysItem(fractal) : fractal.linked ? linkedItem(fractal) : ownItem(fractal);
        item.dataset.fractal = String(fractal.id);
        const handle = el("span", "prismHandle fractalHandle", "≡");
        handle.title = "Hold and drag to move, or use the up and down arrow keys";
        handle.setAttribute("aria-label", `Move ${fractal.name}`);
        if (ordered.length > 1) {
          handle.addEventListener("pointerdown", (event) => dragToOrder(event, item, save));
          BudgetUI.keyMoves(handle, at, ordered.length, (to) => {
            const ids = ordered.map(other => String(other.id));
            ids.splice(to, 0, ids.splice(at, 1)[0]);
            save(ids).then(() => container.querySelector(`[data-fractal="${CSS.escape(String(fractal.id))}"] .fractalHandle`)?.focus({ preventScroll: true }));
          });
        } else {
          handle.hidden = true;
        }
        item.prepend(handle);
        list.append(item);
      });
      for (const invitation of data.invitations) list.append(invitationItem(invitation));
      const drawn = container.querySelector(":scope > .fractalManagerList");
      if (drawn) drawn.replaceWith(list);
      else container.append(list);
    };
    draw();
    document.addEventListener("fractals:changed", draw);
    // (The order, Holidays' color, and linked fractals are the budget's: another device's change to them comes this way)
    document.addEventListener("budget:updated", draw);
  }

  // The fractals (own, the budget's, linked, Holidays, and Meals, any of them) in the order kept with the budget
  // (sheetsData.fractalOrder, their ids: Process Budget.js saveFractalOrder; the icon's answer's on Quick Calendar), the rest
  // after them as they come
  function inOrder(list) {
    const sheets = budgetSheets();
    const order = sheets && Array.isArray(sheets.fractalOrder) ? sheets.fractalOrder.map(String) : [];
    if (order.length === 0) return list;
    const place = (fractal) => {
      const at = order.indexOf(String(fractal.id));
      return at === -1 ? order.length : at;
    };
    return list.map((fractal, at) => ({ fractal, at })).sort((a, b) => place(a.fractal) - place(b.fractal) || a.at - b.at).map(item => item.fractal);
  }

  // Keep a new order (the fractals' ids, top to bottom), and draw again: { ok }
  async function saveOrder(ids) {
    if (typeof saveFractalOrder !== "function") return { ok: false };
    const result = await saveFractalOrder(ids);
    if (!result.ok) toast(result.message || "Couldn't keep the new order. Please try again.", true);
    else BudgetUI.warnIfUnsaved(result);
    document.dispatchEvent(new CustomEvent("fractals:changed"));
    return result;
  }

  // Hold a fractal's ≡ and drag it up or down; save(ids) runs with the new order when it's let go. The pointer is followed
  // on the whole page (moving the item in the list would make the browser let go of a pointer capture).
  function dragToOrder(event, item, save) {
    event.preventDefault();
    const pointerId = event.pointerId;
    const list = item.parentElement;
    const order = () => [...list.querySelectorAll("li[data-fractal]")].map(other => other.dataset.fractal);
    const startOrder = order().join();
    item.classList.add("dragging");
    const onMove = (moveEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      const others = [...list.querySelectorAll("li[data-fractal]")].filter(other => other !== item);
      const before = others.find(other => moveEvent.clientY < other.getBoundingClientRect().top + other.getBoundingClientRect().height / 2);
      if (before && item.nextElementSibling !== before) list.insertBefore(item, before);
      if (!before && others.length > 0 && others[others.length - 1].nextElementSibling !== item) others[others.length - 1].after(item);
    };
    const onEnd = (endEvent) => {
      if (endEvent.pointerId !== pointerId) return;
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onEnd);
      document.removeEventListener("pointercancel", onEnd);
      item.classList.remove("dragging");
      if (order().join() !== startOrder) save(order());
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onEnd);
    document.addEventListener("pointercancel", onEnd);
  }

  // A link in a box, with Copy, Share (the device's own share sheet, where it has one), and (calendar: true) buttons that
  // add it to Apple Calendar and Google Calendar
  function linkBox(link, label, { calendar = true } = {}) {
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
    links.append(box, copy);
    if (typeof navigator.share === "function") {
      links.append(button("Share", "", async () => {
        try { await navigator.share({ title: `${label} calendar`, url: link }); } catch {}
      }, `Share the calendar link for ${label}`));
    }
    if (calendar) {
      const webcal = link.replace(/^https?:\/\//, "webcal://");
      const apple = el("a", "budgetButton", "Apple Calendar");
      apple.href = webcal;
      const google = el("a", "budgetButton", "Google Calendar");
      google.href = `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`;
      google.target = "_blank";
      google.rel = "noopener noreferrer";
      links.append(apple, google);
    }
    return links;
  }

  // A fractal's calendar link (fractalId null: every calendar's), as a list item: its name, whether its link is on, Make A
  // Link (or New Link and Turn Off), and the link with its buttons. Settings' list and a fractal's Share window use it.
  function linkRow(fractalId, label, color, link) {
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
    // (Each name starts with the button's own words, so a screen reader and voice control both find it)
    if (!link) buttons.append(button("Make A Link", "", () => turn(true), `Make A Link: a calendar link for ${label}`));
    else buttons.append(button("New Link", "", () => turn(true), `New Link: a new calendar link for ${label}`), button("Turn Off", "danger", () => turn(false), `Turn Off the calendar link for ${label}`));
    item.append(about, buttons);
    if (link) item.append(linkBox(link, label));
    return item;
  }

  // A fractal's Share window (from its Edit window): its calendar link, to add it to a calendar app or send it to someone,
  // drawn again as the link changes, and for one of the account's own, the people it's shared with (peopleBox). A linked
  // fractal shares the link it comes from.
  function openShare(origin, fractal) {
    let redraw = null;
    let people = null;
    const panelApi = BudgetUI.openPanel({
      origin,
      size: "small",
      stacked: true,
      title: `Share ${fractal.name}`,
      build(form, panel) {
        // (Made once, beside the link's part, so a name being typed stays as the list changes)
        people = !fractal.perBudget && !fractal.linked && !fractal.sharedBy && !fractal.holidays && !fractal.meals ? peopleBox(fractal, panel) : null;
        const box = el("div", "fractalShare");
        const draw = () => {
          const linked = linkedFractal(fractal.id);
          if (linked) {
            const source = linkedSource(linked);
            box.replaceChildren(el("p", "panelHint", "This fractal comes from another calendar, so sharing it shares that calendar's own link: anyone with it can see everything on that calendar."),
              source ? linkBox(source, fractal.name, { calendar: true }) : el("p", "panelText", "Its calendar's link couldn't be found."));
            return;
          }
          const list = el("ul", "budgetList budgetManager");
          list.append(linkRow(fractal.id, fractal.name, fractal.color, data?.links.fractals[fractal.id] || null));
          box.replaceChildren(el("p", "panelHint", "Its calendar link lets Apple Calendar, Google Calendar, Outlook, or anyone you send it to see this fractal's entries (they can't change them). Make A Link, then copy it, share it, or add it to a calendar app. New Link turns the old link off, and Turn Off stops it working. (To share one entry with another Prismal account, use Share with in that entry.)"), list);
        };
        draw();
        redraw = draw;
        document.addEventListener("fractals:changed", draw);
        form.append(...(people ? [people.el] : []), box, BudgetUI.buttonRow([{ label: "Close", onClick: () => panel.close() }]));
      }
    });
    watchClosed(panelApi, () => {
      document.removeEventListener("fractals:changed", redraw);
      if (people) people.stop();
    });
  }

  // One of the account's own fractals shared with other accounts, as a whole: a box for someone's username or email with
  // Can Edit (off to start: they see every entry, live, once they join; on, they add, change, and delete its entries too),
  // and each person it's shared with, with their Can Edit switch and Remove. Only its owner renames, deletes, or shares
  // it. { el, stop() (when its window closes) }
  function peopleBox(fractal, panel) {
    const wrap = el("div", "fractalPeople");
    const typed = BudgetUI.textField({ label: "Share with someone", placeholder: "Their username or email" });
    typed.input.maxLength = LIMITS.email;
    typed.input.autocomplete = "off";
    typed.input.spellcheck = false;
    typed.input.setAttribute("autocapitalize", "none");
    const canEdit = BudgetUI.checkboxField({ label: "Can Edit", checked: false });
    const list = el("ul", "budgetList budgetPeople");
    const invite = button("Share", "primary", async () => {
      panel.setError("");
      const to = typed.value();
      if (!to) return panel.setError("Type their username or email.");
      invite.disabled = true;
      const result = await change("people/share", { fractal: fractal.id, to, canEdit: canEdit.input.checked });
      invite.disabled = false;
      if (!result.ok) return panel.setError(problem(result, "Couldn't share it. Please try again."));
      if (result.data.error) return panel.setError(result.data.error);
      typed.input.value = "";
      toast(result.data.already === "joined" ? "It's already shared with them." : result.data.already === "invited" ? "They're already invited." : `Invited ${result.data.invited}. It shows in their Calendar Fractals for them to join.`);
    }, `Share ${fractal.name}`);
    const show = () => {
      const now = data ? data.fractals.find(item => item.id === fractal.id) : null;
      list.replaceChildren(...(now && now.people ? now.people : []).map(person => personRow(fractal, person, panel)));
      list.hidden = list.childElementCount === 0;
    };
    const row = el("div", "shareRow");
    row.append(typed.input, invite);
    typed.el.append(row);
    wrap.append(el("p", "panelHint", "Share the whole calendar with someone's Prismal Planning account: once they join, it's on their calendar, and they see every entry as you change it. With Can Edit, they can add, change, and delete its entries too. Only you can rename it, delete it, or share it."), typed.el, canEdit.el, list);
    show();
    document.addEventListener("fractals:changed", show);
    return { el: wrap, stop: () => document.removeEventListener("fractals:changed", show) };
  }

  // Someone one of the account's own fractals is shared with: their name, whether they joined, their Can Edit switch, and
  // Remove (or Cancel Invite). panel: the window it's in, which says what went wrong. Settings' Shared Users uses it too.
  function personRow(fractal, person, panel) {
    const item = el("li", "budgetItem");
    const about = el("div", "budgetOpen");
    about.append(BudgetUI.noTranslate(el("span", "budgetName", person.name)), el("span", "budgetDetail", `${person.joined ? "Joined" : "Invited, hasn't joined yet"}${person.canEdit ? "" : ", can only look"}`));
    item.append(about);
    if (window.Budgets && window.Budgets.canEditSwitch) {
      item.append(window.Budgets.canEditSwitch(person, async (on) => {
        const result = await change("people/edit", { fractal: fractal.id, person: person.id, canEdit: on });
        if (!result.ok || result.data.error) {
          panel.setError(result.ok ? result.data.error : problem(result, "That didn't work. Please try again."));
          return false;
        }
        return true;
      }));
    }
    item.append(button(person.joined ? "Remove" : "Cancel Invite", "danger budgetShare", async () => {
      if (!window.confirm(person.joined ? `Stop sharing ${fractal.name} with ${person.name}? It goes off their calendar.` : `Take back the invitation to ${person.name}?`)) return;
      const result = await change("people/remove", { fractal: fractal.id, person: person.id });
      if (!result.ok) panel.setError(problem(result, "That didn't work. Please try again."));
    }, `${person.joined ? "Remove" : "Cancel Invite for"} ${person.name}`));
    return item;
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
      const row = linkRow;
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
    takeStep,
    isQuick: () => store.quick,
    rememberIcon,
    ownIcons,
    view,
    setView,
    isShown,
    listMode,
    colorOf,
    nameOf,
    textOn,
    MEALS_ID,
    prepare,
    eventsOn,
    renderDay,
    listLines,
    openLine,
    dayZoomed,
    wirePicker,
    openList,
    openFractal,
    openNewEvent,
    openEvent,
    quickMenu,
    openShare,
    personRow,
    kindSwitch,
    addSteps,
    whenWords,
    partWords,
    timeText,
    renderManager,
    renderLinks,
    readLinked,
    linkedFractals,
    linkedFractal,
    openLinkedFractal,
    colorField,
    nextColor,
    tryLink,
    swatch,
    occurrences,
    occurrencesBetween,
    nameOf
  };
})();
