// Calendars: connected calendars (set up on the Spreadsheets & Calendars page, in the menu), whose shifts become
// paychecks. The API downloads a calendar by its subscription link (its calendars.js), and it's read and worked out here;
// the paychecks it finds land on the calendar like a connected spreadsheet's entries, behind a ➕ (CONNECTED SPREADSHEETS
// in Process Budget.js says how, and keeps them).
//   - readCalendarFile(link): the calendar's text, through the API
//   - parseCalendar(text): its events, as an iCalendar file has them (the .ics kind that Apple's iCloud, Google, Outlook,
//     and most work scheduling apps share), with repeating events and time zones
//   - workOut(calendar, connection): its shifts, the paychecks they make (pay, deductions, and taxes, paycheck by
//     paycheck), the entries those make, and what's wrong with any of it
//   - Home and the Spreadsheets & Calendars page read every calendar that's on again when they open (Home at most every
//     15 minutes per calendar, on this device), and the budget only changes when the paychecks did

const Calendars = (() => {

  // =====================================================================
  // #region READING A CALENDAR
  // =====================================================================

  // A problem reading a calendar. lasting: the server answered (like "not a calendar", or the email isn't verified yet),
  // so it's worth showing on the page; a dropped connection isn't (the next read tries again).
  class CalendarReadError extends Error {
    constructor(message, lasting = false) {
      super(message);
      this.lasting = lasting;
    }
  }

  // The calendar behind a link, as text. Throws CalendarReadError.
  async function readCalendarFile(link) {
    let token = null;
    try { token = localStorage.getItem("prismal_jwt"); } catch (e) {}
    if (!token) throw new CalendarReadError("You've been signed out. Please log in again.");
    let response;
    try {
      response = await fetch(`${window.API_BASE_URL}/api/calendars/read`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ link })
      });
    } catch (err) {
      throw new CalendarReadError("Couldn't reach the server. Please try again.");
    }
    if (response.status === 401) {
      signedOutElsewhere();
      throw new CalendarReadError("You've been signed out. Please log in again.");
    }
    if (!response.ok) {
      let message = "";
      try { message = (await response.json()).error || ""; } catch (e) {}
      const lasting = response.status === 400 || response.status === 403 || response.status === 413;
      throw new CalendarReadError(message || "Couldn't read that calendar just now. Please try again.", lasting);
    }
    return response.text();
  }

  //#endregion

  // =====================================================================
  // #region ICALENDAR FILES
  // =====================================================================
  // An .ics file is lines of NAME;PARAM=VALUE:VALUE (a long line goes on in lines that start with a space) inside
  // BEGIN:/END: blocks. Only events (VEVENT) and the time zones their times are in (VTIMEZONE) are read. A time is UTC
  // (ending in Z), in a named time zone (TZID), or "floating" (the calendar's own zone, or this device's), and an all-day
  // event has a date alone. Repeating events (RRULE, with RDATE and EXDATE) are counted out only across the days being
  // worked out, and a repeat that was changed or canceled for one day (RECURRENCE-ID) takes that day's place.

  const MAX_EVENTS = 20000;
  const MAX_REPEATS = 3000; // Times one repeating event is counted in the days being worked out, at most
  const MAX_REPEAT_STEPS = 100000; // Days, weeks, months, or years a repeat is followed, at most
  const WEEKDAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
  const DAY_MS = 86400000;
  const HOUR_MS = 3600000;

  // One line: { name, params: { NAME: value }, value }, or null when it isn't one (a quoted value can hold ; and :)
  function contentLine(text) {
    const n = text.length;
    let i = 0;
    while (i < n && text[i] !== ";" && text[i] !== ":") i++;
    const name = text.slice(0, i).trim().toUpperCase();
    const params = {};
    while (i < n && text[i] === ";") {
      i++;
      let start = i;
      while (i < n && text[i] !== "=" && text[i] !== ";" && text[i] !== ":") i++;
      const key = text.slice(start, i).trim().toUpperCase();
      const values = [];
      if (text[i] === "=") {
        i++;
        for (;;) {
          if (text[i] === '"') {
            const close = text.indexOf('"', i + 1);
            if (close < 0) return null;
            values.push(text.slice(i + 1, close));
            i = close + 1;
          } else {
            start = i;
            while (i < n && text[i] !== "," && text[i] !== ";" && text[i] !== ":") i++;
            values.push(text.slice(start, i));
          }
          if (text[i] !== ",") break;
          i++;
        }
      }
      if (key && key !== "__PROTO__") params[key] = values.join(",");
    }
    if (!name || text[i] !== ":") return null;
    return { name, params, value: text.slice(i + 1) };
  }

  // A TEXT value as it reads (\n, \, and \; written out; line breaks become spaces)
  const unescapeText = (value) => String(value).replace(/\\([\\;,nN])/g, (match, char) => (char === "n" || char === "N" ? " " : char)).replace(/\s+/g, " ").trim();

  // "20261103T080000Z", "20261103T080000", or "20261103" -> { y, m (0-11), d, hh, mi, ss, utc, date (no time) }, or null
  function dateParts(value) {
    const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/i.exec(String(value).trim());
    if (!match) return null;
    const parts = { y: Number(match[1]), m: Number(match[2]) - 1, d: Number(match[3]), hh: Number(match[4] || 0), mi: Number(match[5] || 0), ss: Number(match[6] || 0), utc: !!match[7], date: match[4] === undefined };
    if (parts.m > 11 || parts.d < 1 || parts.d > 31 || parts.hh > 23 || parts.mi > 59 || parts.ss > 60) return null;
    return parts;
  }

  // "PT8H30M", "P1D", "-PT15M", "P1W" -> milliseconds, or null
  function durationMs(value) {
    const match = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i.exec(String(value).trim());
    if (!match || !/\d/.test(value)) return null;
    const ms = ((Number(match[2] || 0) * 7 + Number(match[3] || 0)) * 24 * 3600 + Number(match[4] || 0) * 3600 + Number(match[5] || 0) * 60 + Number(match[6] || 0)) * 1000;
    return match[1] === "-" ? -ms : ms;
  }

  // ---- Time zones ----
  // A zone is "utc", "local" (this device's), { intl: an IANA name like America/Chicago } (the browser knows its rules),
  // or { observances } (a VTIMEZONE's own rules, for a name the browser doesn't know, like Outlook's).

  // Outlook's (Windows') names for common zones
  const WINDOWS_ZONES = {
    "eastern standard time": "America/New_York", "us eastern standard time": "America/Indiana/Indianapolis",
    "central standard time": "America/Chicago", "mountain standard time": "America/Denver",
    "us mountain standard time": "America/Phoenix", "pacific standard time": "America/Los_Angeles",
    "alaskan standard time": "America/Anchorage", "hawaiian standard time": "Pacific/Honolulu",
    "atlantic standard time": "America/Halifax", "newfoundland standard time": "America/St_Johns",
    "canada central standard time": "America/Regina", "central standard time (mexico)": "America/Mexico_City",
    "sa pacific standard time": "America/Bogota", "gmt standard time": "Europe/London", "greenwich standard time": "Atlantic/Reykjavik",
    "w. europe standard time": "Europe/Berlin", "romance standard time": "Europe/Paris", "central europe standard time": "Europe/Budapest",
    "central european standard time": "Europe/Warsaw", "e. europe standard time": "Europe/Chisinau", "fle standard time": "Europe/Kiev",
    "south africa standard time": "Africa/Johannesburg", "india standard time": "Asia/Kolkata", "china standard time": "Asia/Shanghai",
    "tokyo standard time": "Asia/Tokyo", "korea standard time": "Asia/Seoul", "singapore standard time": "Asia/Singapore",
    "aus eastern standard time": "Australia/Sydney", "e. australia standard time": "Australia/Brisbane",
    "w. australia standard time": "Australia/Perth", "new zealand standard time": "Pacific/Auckland",
    "utc": "UTC", "coordinated universal time": "UTC"
  };

  const zoneFormats = new Map();
  // An IANA zone's formatter (null when the browser doesn't know the name)
  function zoneFormat(name) {
    if (zoneFormats.has(name)) return zoneFormats.get(name);
    let format = null;
    try {
      format = new Intl.DateTimeFormat("en-US", { timeZone: name, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" });
    } catch (e) {}
    zoneFormats.set(name, format);
    return format;
  }

  // The zone a TZID names: the browser's own zone for an IANA name (some calendars put a path before it), a Windows
  // name's zone, the calendar's VTIMEZONE for it, or else this device's zone
  function zoneFor(tzid, calendar) {
    const name = String(tzid || "").replace(/^"|"$/g, "").trim();
    if (!name) return calendar.floating;
    if (/^(utc|gmt|z|etc\/utc|etc\/gmt)$/i.test(name)) return "utc";
    if (calendar.zoneCache.has(name)) return calendar.zoneCache.get(name);
    let zone = null;
    const iana = /([A-Za-z]+\/[A-Za-z0-9_+-]+(?:\/[A-Za-z0-9_+-]+)?)$/.exec(name);
    if (zoneFormat(name)) zone = { intl: name };
    else if (iana && zoneFormat(iana[1])) zone = { intl: iana[1] };
    else if (WINDOWS_ZONES[name.toLowerCase()]) zone = { intl: WINDOWS_ZONES[name.toLowerCase()] };
    else if (calendar.zones.has(name) && calendar.zones.get(name).length > 0) zone = { observances: calendar.zones.get(name) };
    else zone = "local";
    calendar.zoneCache.set(name, zone);
    return zone;
  }

  // How far ahead of UTC a zone's clocks are (milliseconds) at an instant
  function zoneOffset(zone, ms) {
    if (zone === "utc") return 0;
    if (zone === "local") return -new Date(ms).getTimezoneOffset() * 60000;
    if (zone.intl) {
      const format = zoneFormat(zone.intl);
      const parts = {};
      for (const part of format.formatToParts(new Date(ms))) parts[part.type] = part.value;
      const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour) % 24, Number(parts.minute), Number(parts.second));
      return asUtc - Math.floor(ms / 1000) * 1000;
    }
    return observanceOffset(zone.observances, ms);
  }

  // A clock time in a zone (dateParts) -> its instant (ms). A time the clocks skip (springing forward) moves an hour on.
  function zonedInstant(parts, zone) {
    const wall = Date.UTC(parts.y, parts.m, parts.d, parts.hh, parts.mi, parts.ss);
    if (zone === "utc") return wall;
    if (zone === "local") return new Date(parts.y, parts.m, parts.d, parts.hh, parts.mi, parts.ss).getTime();
    const first = zoneOffset(zone, wall);
    const second = zoneOffset(zone, wall - first);
    return wall - second;
  }

  // A time value with its TZID -> { ms, date (a day alone, as local midnight), allDay }, or null
  function readTime(line, calendar) {
    if (!line) return null;
    const parts = dateParts(line.value);
    if (!parts) return null;
    if (parts.date || /^date$/i.test(line.params.VALUE || "")) return { allDay: true, date: new Date(parts.y, parts.m, parts.d), parts };
    const zone = parts.utc ? "utc" : zoneFor(line.params.TZID, calendar);
    return { allDay: false, ms: zonedInstant(parts, zone), parts, zone };
  }

  // A VTIMEZONE's STANDARD or DAYLIGHT part -> { from, to (offsets, ms), start (dateParts), rule, dates }
  function readObservance(props) {
    const offset = (text) => {
      const match = /^([+-])(\d{2})(\d{2})(\d{2})?$/.exec(String(text || "").trim());
      if (!match) return null;
      const ms = (Number(match[2]) * 3600 + Number(match[3]) * 60 + Number(match[4] || 0)) * 1000;
      return match[1] === "-" ? -ms : ms;
    };
    const to = offset(props.TZOFFSETTO?.value);
    const start = dateParts(props.DTSTART?.value || "");
    if (to === null || !start) return null;
    const from = offset(props.TZOFFSETFROM?.value);
    return {
      from: from === null ? to : from,
      to,
      start,
      rule: props.RRULE ? readRule(props.RRULE.value) : null,
      dates: (props.RDATE || []).flatMap(line => line.value.split(",")).map(dateParts).filter(Boolean)
    };
  }
  // (RDATE can repeat in an observance, so it's kept as a list)
  const OBSERVANCE_LISTS = ["RDATE"];

  // The offset a VTIMEZONE's rules give at an instant: the one its latest change before then started
  function observanceOffset(observances, ms) {
    const year = new Date(ms).getUTCFullYear();
    let best = null;
    for (const observance of observances) {
      const walls = [Date.UTC(observance.start.y, observance.start.m, observance.start.d, observance.start.hh, observance.start.mi, observance.start.ss)];
      for (const parts of observance.dates) walls.push(Date.UTC(parts.y, parts.m, parts.d, parts.hh, parts.mi, parts.ss));
      if (observance.rule && observance.rule.freq === "YEARLY") {
        for (const y of [year - 1, year]) {
          if (y < observance.start.y) continue;
          const day = yearlyChangeDay(observance.rule, y, observance.start);
          if (day !== null) walls.push(day * DAY_MS + (observance.start.hh * 3600 + observance.start.mi * 60 + observance.start.ss) * 1000);
        }
      }
      for (const wall of walls) {
        const at = wall - observance.from;
        if (at <= ms && (!best || at > best.at)) best = { at, offset: observance.to };
      }
    }
    if (best) return best.offset;
    return observances[0].from;
  }

  // The day (a day number, see dayNumber) a yearly time zone change lands on in a year (like the 2nd Sunday of March),
  // or null when the rule ended
  function yearlyChangeDay(rule, year, start) {
    if (rule.until) {
      const until = dateParts(rule.until);
      if (until && year > until.y) return null;
    }
    const month = rule.byMonth.length > 0 ? rule.byMonth[0] - 1 : start.m;
    const days = monthDays(year, month, rule, start.d);
    return days.length > 0 ? days[0] : null;
  }

  // ---- Repeating events (RRULE) ----

  // An RRULE -> { freq, interval, count, until (text), byDay: [{ n, day }], byMonthDay, byMonth, bySetPos, weekStart,
  // other (it uses parts this doesn't follow) }
  function readRule(text) {
    const rule = { freq: "", interval: 1, count: null, until: null, byDay: [], byMonthDay: [], byMonth: [], bySetPos: [], weekStart: 1, other: false };
    const numbers = (value, low, high) => value.split(",").map(Number).filter(number => Number.isInteger(number) && number !== 0 && number >= low && number <= high);
    for (const part of String(text).split(";")) {
      const [rawKey, value = ""] = part.split("=");
      const key = rawKey.trim().toUpperCase();
      if (key === "FREQ") rule.freq = value.trim().toUpperCase();
      else if (key === "INTERVAL") rule.interval = Math.max(1, Math.min(1000, parseInt(value, 10) || 1));
      else if (key === "COUNT") rule.count = Math.max(0, parseInt(value, 10) || 0);
      else if (key === "UNTIL") rule.until = value.trim();
      else if (key === "BYDAY") {
        rule.byDay = value.split(",").map(code => /^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/i.exec(code.trim())).filter(Boolean)
          .map(match => ({ n: match[1] ? Number(match[1]) : 0, day: WEEKDAY_CODES.indexOf(match[2].toUpperCase()) }));
      }
      else if (key === "BYMONTHDAY") rule.byMonthDay = numbers(value, -31, 31);
      else if (key === "BYMONTH") rule.byMonth = numbers(value, 1, 12);
      else if (key === "BYSETPOS") rule.bySetPos = numbers(value, -366, 366);
      else if (key === "WKST") rule.weekStart = Math.max(0, WEEKDAY_CODES.indexOf(value.trim().toUpperCase()));
      else if (["BYYEARDAY", "BYWEEKNO", "BYHOUR", "BYMINUTE", "BYSECOND"].includes(key)) rule.other = true;
    }
    if (!["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(rule.freq)) rule.other = true;
    return rule;
  }

  // Days as whole numbers (days since 1970-01-01), so date math never meets a time zone
  const dayNumber = (y, m, d) => Math.round(Date.UTC(y, m, d) / DAY_MS);
  const dayOfWeek = (day) => (((day + 4) % 7) + 7) % 7;
  const dayDate = (day) => new Date(day * DAY_MS);
  const monthLength = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

  // The days of one month a rule picks (sorted): its BYMONTHDAY and BYDAY (every such weekday, or the nth one, from the
  // end when it's below 0), both when both are given, or else the start's own day of the month. BYSETPOS then picks
  // among them.
  function monthDays(y, m, rule, startDay) {
    const length = monthLength(y, m);
    const first = dayNumber(y, m, 1);
    let days = null;
    if (rule.byMonthDay.length > 0) {
      days = new Set(rule.byMonthDay.map(md => (md > 0 ? md : length + md + 1)).filter(md => md >= 1 && md <= length).map(md => first + md - 1));
    }
    if (rule.byDay.length > 0) {
      const picked = new Set();
      for (const { n, day } of rule.byDay) {
        const matching = [];
        for (let d = 0; d < length; d++) if (dayOfWeek(first + d) === day) matching.push(first + d);
        if (n === 0) matching.forEach(found => picked.add(found));
        else if (n > 0 && matching[n - 1] !== undefined) picked.add(matching[n - 1]);
        else if (n < 0 && matching[matching.length + n] !== undefined) picked.add(matching[matching.length + n]);
      }
      days = days ? new Set([...days].filter(found => picked.has(found))) : picked;
    }
    if (!days) days = new Set(startDay <= length ? [first + startDay - 1] : []);
    return setPositions([...days].sort((a, b) => a - b), rule.bySetPos);
  }

  // BYSETPOS: the 1st, 2nd, ..., or (below 0) the last ones of a set
  function setPositions(days, positions) {
    if (positions.length === 0) return days;
    const kept = new Set(positions.map(position => days[position > 0 ? position - 1 : days.length + position]).filter(day => day !== undefined));
    return days.filter(day => kept.has(day));
  }

  // The days a repeating event lands on (day numbers, sorted), from its first day through lastDay at most, with COUNT
  // counted from its first. { days, capped (it went past MAX_REPEAT_STEPS or MAX_REPEATS) }
  function repeatDays(start, rule, lastDay, firstDayWanted) {
    const startDay = dayNumber(start.y, start.m, start.d);
    const days = [];
    let counted = 0;
    let capped = false;
    const take = (day) => {
      if (day < startDay) return true;
      if (rule.count !== null && counted >= rule.count) return false;
      if (day > lastDay) return false;
      counted++;
      if (day >= firstDayWanted) {
        days.push(day);
        if (days.length >= MAX_REPEATS) { capped = true; return false; }
      }
      return true;
    };
    const monthOk = (day) => rule.byMonth.length === 0 || rule.byMonth.includes(dayDate(day).getUTCMonth() + 1);

    // (The first day always counts, even when the rule wouldn't pick it)
    if (!take(startDay)) return { days, capped };
    for (let step = 1; step <= MAX_REPEAT_STEPS; step++) {
      let found = [];
      if (rule.freq === "DAILY") {
        const day = startDay + step * rule.interval;
        const date = dayDate(day);
        const dayOk = rule.byDay.length === 0 || rule.byDay.some(entry => entry.day === dayOfWeek(day));
        const monthDayOk = rule.byMonthDay.length === 0 || rule.byMonthDay.some(md => (md > 0 ? md : monthLength(date.getUTCFullYear(), date.getUTCMonth()) + md + 1) === date.getUTCDate());
        if (dayOk && monthDayOk && monthOk(day)) found = [day];
      } else if (rule.freq === "WEEKLY") {
        const weekFirst = startDay - ((dayOfWeek(startDay) - rule.weekStart + 7) % 7);
        const week = weekFirst + (step - 1) * 7 * rule.interval;
        const weekdays = rule.byDay.length > 0 ? rule.byDay.map(entry => entry.day) : [dayOfWeek(startDay)];
        found = [...new Set(weekdays.map(day => week + ((day - rule.weekStart + 7) % 7)))].sort((a, b) => a - b).filter(monthOk);
      } else if (rule.freq === "MONTHLY") {
        const months = start.m + (step - 1) * rule.interval;
        const y = start.y + Math.floor(months / 12);
        const m = ((months % 12) + 12) % 12;
        found = rule.byMonth.length === 0 || rule.byMonth.includes(m + 1) ? monthDays(y, m, rule, start.d) : [];
      } else {
        const y = start.y + (step - 1) * rule.interval;
        const ordinalDays = rule.byMonth.length === 0 && rule.byDay.some(entry => entry.n !== 0);
        if (ordinalDays) {
          // (Like the 20th Monday of the year)
          const all = [];
          const first = dayNumber(y, 0, 1);
          const length = dayNumber(y + 1, 0, 1) - first;
          for (const { n, day } of rule.byDay) {
            const matching = [];
            for (let d = 0; d < length; d++) if (dayOfWeek(first + d) === day) matching.push(first + d);
            if (n > 0 && matching[n - 1] !== undefined) all.push(matching[n - 1]);
            if (n < 0 && matching[matching.length + n] !== undefined) all.push(matching[matching.length + n]);
            if (n === 0) all.push(...matching);
          }
          found = setPositions([...new Set(all)].sort((a, b) => a - b), rule.bySetPos);
        } else {
          const months = rule.byMonth.length > 0 ? rule.byMonth.map(month => month - 1) : [start.m];
          const noSetPos = { ...rule, bySetPos: [] };
          found = setPositions(months.flatMap(month => monthDays(y, month, noSetPos, start.d)).sort((a, b) => a - b), rule.bySetPos);
        }
      }
      // (A weekly or monthly step starts again from the first one's own week or month, so it's taken out here)
      for (const day of found) {
        if (day === startDay) continue;
        if (!take(day)) return { days, capped };
      }
      if (step > 1 && rule.freq !== "DAILY" && found.length === 0) {
        // Stop once the steps are past the last day
        const probe = rule.freq === "WEEKLY" ? startDay + step * 7 * rule.interval
          : rule.freq === "MONTHLY" ? dayNumber(start.y, start.m + step * rule.interval, 1) : dayNumber(start.y + step * rule.interval, 0, 1);
        if (probe > lastDay + 400) return { days, capped };
      }
      if (rule.freq === "DAILY" && startDay + step * rule.interval > lastDay) return { days, capped };
    }
    return { days, capped: true };
  }

  // ---- The file ----

  // An .ics file's text -> { name, events: [{ uid, title, start, end (times, see readTime), rule, dates (RDATE),
  // except (EXDATE), recurrenceId, cancelled }], zones, floating, problems }
  function parseCalendar(text) {
    const calendar = { name: "", events: [], zones: new Map(), zoneCache: new Map(), floating: "local", problems: [], tooMany: false };
    const lines = String(text || "").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").replace(/\n[ \t]/g, "").split("\n");
    const stack = [];
    let props = null; // The open VEVENT's or observance's properties: { NAME: line } (EXDATE and RDATE: [line])
    let zone = null; // The open VTIMEZONE: { id, observances }
    const rawEvents = [];
    let calendarZone = "";

    for (const raw of lines) {
      if (!raw.trim()) continue;
      const line = contentLine(raw);
      if (!line) continue;
      if (line.name === "BEGIN") {
        const what = line.value.trim().toUpperCase();
        stack.push(what);
        if (what === "VEVENT" && stack.length === 2) props = {};
        else if (what === "VTIMEZONE") zone = { id: "", observances: [] };
        else if ((what === "STANDARD" || what === "DAYLIGHT") && zone) props = {};
        continue;
      }
      if (line.name === "END") {
        const what = stack.pop();
        if (what === "VEVENT" && props && stack.length === 1) {
          if (rawEvents.length < MAX_EVENTS) rawEvents.push(props);
          else calendar.tooMany = true;
          props = null;
        } else if ((what === "STANDARD" || what === "DAYLIGHT") && zone && props) {
          const observance = readObservance(props);
          if (observance) zone.observances.push(observance);
          props = null;
        } else if (what === "VTIMEZONE" && zone) {
          if (zone.id) calendar.zones.set(zone.id, zone.observances);
          zone = null;
        }
        continue;
      }
      const where = stack[stack.length - 1];
      if (where === "VCALENDAR") {
        if (line.name === "X-WR-CALNAME" && !calendar.name) calendar.name = unescapeText(line.value).slice(0, 80);
        if (line.name === "X-WR-TIMEZONE") calendarZone = line.value.trim();
      } else if (where === "VTIMEZONE" && zone && line.name === "TZID") {
        zone.id = line.value.trim();
      } else if (props && (where === "VEVENT" || where === "STANDARD" || where === "DAYLIGHT")) {
        if (line.name === "EXDATE" || OBSERVANCE_LISTS.includes(line.name)) (props[line.name] = props[line.name] || []).push(line);
        else if (!(line.name in props)) props[line.name] = line;
      }
    }

    // Floating times are in the calendar's own zone (Google names one), or else this device's
    if (calendarZone) calendar.floating = zoneFor(calendarZone, calendar);

    for (const props of rawEvents) {
      const start = readTime(props.DTSTART, calendar);
      if (!start) continue;
      let end = readTime(props.DTEND, calendar);
      if (!end && props.DURATION) {
        const length = durationMs(props.DURATION.value);
        if (length !== null) end = start.allDay ? { allDay: true, date: addDays(start.date, Math.max(1, Math.round(length / DAY_MS))) } : { allDay: false, ms: start.ms + length };
      }
      // (An end that isn't the same kind as the start, a day for a time or the other way, is one day, or no time at all)
      if (!end || end.allDay !== start.allDay) end = start.allDay ? { allDay: true, date: addDays(start.date, 1) } : { allDay: false, ms: start.ms };
      const exceptLines = props.EXDATE || [];
      calendar.events.push({
        uid: props.UID ? props.UID.value.trim() : "",
        title: props.SUMMARY ? unescapeText(props.SUMMARY.value).slice(0, 200) : "",
        start,
        end,
        rule: props.RRULE ? readRule(props.RRULE.value) : null,
        dates: (props.RDATE || []).flatMap(line => line.value.split(",").map(value => readTime({ ...line, value }, calendar))).filter(Boolean),
        except: exceptLines.flatMap(line => line.value.split(",").map(value => readTime({ ...line, value }, calendar))).filter(Boolean),
        recurrenceId: props["RECURRENCE-ID"] ? readTime(props["RECURRENCE-ID"], calendar) : null,
        cancelled: /^cancel/i.test(props.STATUS?.value || "")
      });
    }
    if (calendar.tooMany) calendar.problems.push(`The calendar has more than ${MAX_EVENTS.toLocaleString()} events, so only the first ${MAX_EVENTS.toLocaleString()} are read. Connect a calendar with just your shifts.`);
    return calendar;
  }

  // Every time the calendar's events happen between two days (local midnights, the last one included): [{ title,
  // allDay, start, end (ms), date and days (an all-day one: its first day, and how many) }], and the titles of
  // repeating events that repeat in a way this can't follow (only their first time counts)
  function eventsBetween(calendar, fromDate, toDate) {
    const fromMs = fromDate.getTime();
    const toMs = addDays(toDate, 1).getTime();
    const firstWanted = dayNumber(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate()) - 1;
    const lastDay = dayNumber(toDate.getFullYear(), toDate.getMonth(), toDate.getDate()) + 1;
    const found = [];
    const unfollowed = new Set();
    const keyOf = (time) => (time.allDay ? `d${formatToYMD(time.date)}` : `t${Math.round(time.ms / 1000)}`);

    // Repeats changed or canceled for one day: "uid|that day's original start"
    const changed = new Set();
    for (const event of calendar.events) {
      if (event.recurrenceId && event.uid) changed.add(`${event.uid}|${keyOf(event.recurrenceId)}`);
    }

    const add = (event, start, end) => {
      if (event.cancelled) return;
      if (start.allDay) {
        const days = Math.max(1, Math.round((end.date - start.date) / DAY_MS));
        if (start.date < addDays(toDate, 1) && addDays(start.date, days) > fromDate) found.push({ title: event.title, allDay: true, date: start.date, days });
      } else if (start.ms < toMs && Math.max(end.ms, start.ms) > fromMs) {
        found.push({ title: event.title, allDay: false, start: start.ms, end: Math.max(end.ms, start.ms) });
      }
    };

    for (const event of calendar.events) {
      const masterOf = event.recurrenceId && event.uid ? null : event;
      if (!masterOf) {
        // A changed day of a repeating event: it's its own event now (a canceled one is just left out)
        add(event, event.start, event.end);
        continue;
      }
      if (!event.rule && event.dates.length === 0) {
        add(event, event.start, event.end);
        continue;
      }
      const length = event.start.allDay ? Math.round((event.end.date - event.start.date) / DAY_MS) : event.end.ms - event.start.ms;
      const times = [];
      if (event.rule && !event.rule.other) {
        const startParts = event.start.parts;
        const { days } = repeatDays(startParts, event.rule, lastDay, firstWanted);
        let untilMs = null;
        let untilDay = null;
        if (event.rule.until) {
          const until = dateParts(event.rule.until);
          if (until && until.date) untilDay = dayNumber(until.y, until.m, until.d);
          else if (until) untilMs = until.utc ? Date.UTC(until.y, until.m, until.d, until.hh, until.mi, until.ss) : zonedInstant(until, event.start.zone || calendar.floating);
        }
        for (const day of days) {
          const date = dayDate(day);
          const parts = { y: date.getUTCFullYear(), m: date.getUTCMonth(), d: date.getUTCDate(), hh: startParts.hh, mi: startParts.mi, ss: startParts.ss };
          if (untilDay !== null && day > untilDay) break;
          if (event.start.allDay) {
            times.push({ allDay: true, date: new Date(parts.y, parts.m, parts.d) });
          } else {
            const ms = zonedInstant(parts, event.start.zone || "local");
            if (untilMs !== null && ms > untilMs) break;
            if (untilDay !== null && untilMs === null && day > untilDay) break;
            times.push({ allDay: false, ms });
          }
        }
      } else {
        if (event.rule && event.rule.other && event.title) unfollowed.add(event.title);
        times.push(event.start);
      }
      for (const extra of event.dates) times.push(extra.allDay === event.start.allDay ? extra : event.start);
      const except = new Set(event.except.map(keyOf));
      const exceptDays = new Set(event.except.filter(time => time.allDay).map(time => formatToYMD(time.date)));
      const seen = new Set();
      for (const time of times) {
        const key = keyOf(time);
        if (seen.has(key) || except.has(key) || changed.has(`${event.uid}|${key}`)) continue;
        if (!time.allDay && exceptDays.has(formatToYMD(new Date(time.ms)))) continue;
        seen.add(key);
        if (time.allDay) add(event, time, { allDay: true, date: addDays(time.date, Math.max(1, length)) });
        else add(event, time, { allDay: false, ms: time.ms + length });
      }
    }
    return { events: found, unfollowed: [...unfollowed] };
  }

  //#endregion

  // =====================================================================
  // #region PAY SETTINGS
  // =====================================================================
  // A calendar's pay settings (the connection's pay): { versions, rules, lookAhead, only, skip, bonusWord }.
  //   - versions: the pay as it is from one paycheck on, oldest first ([{ from: "YYYY-MM-DD", ...PAY_DEFAULTS' keys }]).
  //     The first one's from is the first paycheck counted; each later one takes over from the first paycheck on or after
  //     its from, so older paychecks never change. A later one only has what changed: anything it leaves out is the one
  //     before it's.
  //   - rules: pay by event title ([{ contains, kind, rate, night, extraHour, extraShift, shiftTaxFree, multiplier,
  //     breakMinutes, from, to }]): a shift whose title has contains in it is paid this way (the first one that matches)
  //   - lookAhead: { count, unit: "days" | "weeks" | "months" }: paychecks paid further past today aren't counted yet
  //   - only and skip: words (comma-separated) an event's title needs to have to be a shift, or that leave it out
  //   - bonusWord: an all-day event with this word and an amount (like Bonus $25) is a bonus in that week
  // Amounts are numbers (blank is null: the one before it's, or for the first version, PAY_DEFAULTS').

  const PAY_DEFAULTS = {
    payEvery: "2weeks", payWeekday: 5, payAnchor: "", payDays: [15, 31], weekend: "none", period: "weeks", periodLag: 0,
    basePay: 0, nightPay: null, nightFrom: "", nightTo: "",
    overtimeMultiplier: 1.5, otRate: "blended", otWeekly: 40, otDaily: 0, dtDaily: 0, dtMultiplier: 2,
    premiumWord: "", premiumMultiplier: 2,
    weekStart: 0, overnight: "start", breakMinutes: 0, breakAfter: 0,
    taxableAllowances: 0,
    preTaxMedicalPercent: 0, preTaxMedicalFixed: 0, preTaxRetirementPercent: 0, preTaxRetirementFixed: 0, retirementBeforeState: true,
    ficaPercent: 7.65,
    fedMode: "percent", federalPercent: 0, fedFiling: "single", fedStep2: false, fedDependents: 0, fedOtherIncome: 0, fedDeductions: 0, fedExtra: 0,
    stateMode: "percent", statePercent: 0, stateTable: "", stateFiling: "single", stateAllowances: 0, stateExtra: 0,
    otFederal: "taxed", otState: "taxed",
    postTaxPercent: 0, postTaxFixed: 0, nontaxableReimbursements: 0
  };
  const CHOICES = {
    payEvery: ["week", "2weeks", "twiceMonth", "month"], weekend: ["none", "before", "after"], period: ["weeks", "days"],
    otRate: ["blended", "own"], overnight: ["start", "split"], fedMode: ["percent", "w4", "none"], fedFiling: ["single", "married", "head"],
    stateMode: ["percent", "table", "none"], stateFiling: ["single", "married"], otFederal: ["taxed", "extra", "none"], otState: ["taxed", "extra", "none"]
  };
  const RULE_KINDS = ["worked", "paidOff"];
  const MAX_RULES = 40;
  const MAX_VERSIONS = 41; // The first paycheck's pay and 40 pay changes
  const MAX_WORDS = 300;
  const MAX_HOURLY = 100000;
  const MAX_LOOK_AHEAD_DAYS = 366;

  // The Paycheck Calculator's boxes a crystal can fill in, and the pay settings each one is (the same names, so a crystal
  // fills in its own; the hours come from the calendar, so those three aren't used)
  const CRYSTAL_KEYS = ["basePay", "overtimeMultiplier", "premiumMultiplier", "taxableAllowances", "preTaxMedicalPercent", "preTaxMedicalFixed",
    "preTaxRetirementPercent", "preTaxRetirementFixed", "ficaPercent", "federalPercent", "statePercent", "postTaxPercent", "postTaxFixed", "nontaxableReimbursements"];

  // A crystal's boxes as pay settings: { key: value } for the ones it keeps (a federal or state percent picks that way
  // to work its tax out)
  function crystalSettings(values) {
    const settings = {};
    for (const key of CRYSTAL_KEYS) {
      const value = values?.[key];
      if (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= MAX_AMOUNT) settings[key] = value;
    }
    if ("federalPercent" in settings) settings.fedMode = "percent";
    if ("statePercent" in settings) settings.stateMode = "percent";
    return settings;
  }

  const isDay = (text) => typeof text === "string" && /^\d{4}-\d{2}-\d{2}$/.test(text) && !isNaN(createSafeMidnight(text, true).getTime());
  const isTime = (text) => typeof text === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(text);

  // One setting checked: its value, or undefined when it isn't one (left out)
  function readSetting(key, value) {
    if (value === null || value === undefined || value === "") return undefined;
    if (CHOICES[key]) return CHOICES[key].includes(value) ? value : undefined;
    if (key === "payWeekday" || key === "weekStart") return Number.isInteger(value) && value >= 0 && value <= 6 ? value : undefined;
    if (key === "payAnchor") return isDay(value) ? value : undefined;
    if (key === "payDays") {
      if (!Array.isArray(value)) return undefined;
      const days = value.map(Number).filter(day => Number.isInteger(day) && day >= 1 && day <= 31).slice(0, 2);
      return days.length > 0 ? days : undefined;
    }
    if (key === "nightFrom" || key === "nightTo") return isTime(value) ? value : undefined;
    if (key === "premiumWord") return String(value).replace(/\s+/g, " ").trim().slice(0, 60) || undefined;
    if (key === "stateTable") return Object.prototype.hasOwnProperty.call(STATE_TABLES, value) ? value : undefined;
    if (key === "retirementBeforeState" || key === "fedStep2") return typeof value === "boolean" ? value : undefined;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return undefined;
    if (key === "periodLag") return Math.min(60, Math.round(value));
    if (key === "otWeekly") return Math.min(168, value);
    if (key === "otDaily" || key === "dtDaily" || key === "breakAfter") return Math.min(24, value);
    if (key === "breakMinutes") return Math.min(600, Math.round(value));
    if (key === "stateAllowances") return Math.min(99, Math.round(value));
    if (/Multiplier$/.test(key)) return Math.min(100, value);
    if (/Percent$/.test(key)) return Math.min(100, value);
    if (key === "basePay" || key === "nightPay") return Math.min(MAX_HOURLY, value);
    return Math.min(MAX_AMOUNT, value);
  }

  // Pay settings checked and tidied (unknown keys and values dropped), with versions in order by their from
  function normalizePay(pay) {
    const source = pay && typeof pay === "object" ? pay : {};
    const versions = (Array.isArray(source.versions) ? source.versions : []).slice(0, MAX_VERSIONS).map(version => {
      const tidy = {};
      if (!version || typeof version !== "object" || !isDay(version.from)) return null;
      tidy.from = version.from;
      for (const key of Object.keys(PAY_DEFAULTS)) {
        const value = readSetting(key, version[key]);
        if (value !== undefined) tidy[key] = value;
      }
      return tidy;
    }).filter(Boolean).sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
    // (Two on the same day: the later one in the list wins)
    const unique = [];
    for (const version of versions) {
      if (unique.length > 0 && unique[unique.length - 1].from === version.from) unique[unique.length - 1] = version;
      else unique.push(version);
    }
    const money = (value, max = MAX_HOURLY) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.min(max, value) : null);
    const rules = (Array.isArray(source.rules) ? source.rules : []).slice(0, MAX_RULES).map(rule => {
      if (!rule || typeof rule !== "object") return null;
      const contains = String(rule.contains ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_TITLE);
      if (!contains) return null;
      return {
        contains,
        kind: RULE_KINDS.includes(rule.kind) ? rule.kind : "worked",
        rate: money(rule.rate),
        night: money(rule.night),
        extraHour: money(rule.extraHour),
        extraShift: money(rule.extraShift, MAX_AMOUNT),
        shiftTaxFree: rule.shiftTaxFree === true,
        multiplier: money(rule.multiplier, 100),
        breakMinutes: typeof rule.breakMinutes === "number" && Number.isFinite(rule.breakMinutes) && rule.breakMinutes >= 0 ? Math.min(600, Math.round(rule.breakMinutes)) : null,
        from: isDay(rule.from) ? rule.from : "",
        to: isDay(rule.to) ? rule.to : ""
      };
    }).filter(Boolean);
    const ahead = source.lookAhead && typeof source.lookAhead === "object" ? source.lookAhead : {};
    const unit = ["days", "weeks", "months"].includes(ahead.unit) ? ahead.unit : "days";
    const count = Number.isInteger(ahead.count) && ahead.count >= 0 ? Math.min(unit === "months" ? 12 : unit === "weeks" ? 52 : MAX_LOOK_AHEAD_DAYS, ahead.count) : 21;
    const words = (value) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_WORDS);
    return {
      versions: unique,
      rules,
      lookAhead: { count, unit },
      only: words(source.only),
      skip: words(source.skip),
      bonusWord: source.bonusWord === undefined ? "bonus" : words(source.bonusWord).slice(0, 40)
    };
  }

  // Every version with what it leaves out filled in from the one before it (and the first one's from PAY_DEFAULTS):
  // [{ from (a Date), ...settings }]. Every other week's paydays line up with the first version's first paycheck unless a
  // version picks one of its own.
  function resolvedVersions(pay) {
    const resolved = [];
    let current = { ...PAY_DEFAULTS };
    for (const version of pay.versions) {
      current = { ...current, ...version };
      if (resolved.length === 0 && !version.payAnchor) current.payAnchor = version.from;
      if (resolved.length === 0 && version.payWeekday === undefined) current.payWeekday = createSafeMidnight(version.from).getDay();
      resolved.push({ ...current, fromDate: createSafeMidnight(version.from) });
    }
    return resolved;
  }

  // The last day paychecks are counted through: today plus the look ahead
  function lookAheadEnd(pay) {
    const { count, unit } = pay.lookAhead;
    if (unit === "months") return addMonths(today, count);
    return addDays(today, unit === "weeks" ? count * 7 : count);
  }

  // The same for a connection's kept pay settings, as a Date (it moves on with each day, so it isn't kept)
  const lookAheadDay = (pay) => lookAheadEnd(normalizePay(pay));

  //#endregion

  // =====================================================================
  // #region PAYDAYS
  // =====================================================================
  // Each version's paydays run from its from until the next version's: every week (on a weekday), every other week
  // (lined up with one of its paydays), twice a month, or once a month (on days of the month: 31 is the last day of any
  // month). A payday on a weekend can move to the Friday before or the Monday after. Each paycheck pays a pay period:
  // the full workweeks that ended before the week its payday is in (period "weeks"), or the days up to periodLag days
  // before its payday (period "days"), from the day after the period before it.

  const PAY_PERIODS_PER_YEAR = { week: 52, "2weeks": 26, twiceMonth: 24, month: 12 };

  // A version's paydays (as their schedule has them, before a weekend moves them) from day from (a Date) up to until
  // (not included), with the one before the first: { days: [Date], before: Date }
  function paydaysOf(version, from, until) {
    const days = [];
    const before = [];
    if (version.payEvery === "week" || version.payEvery === "2weeks") {
      const step = version.payEvery === "week" ? 7 : 14;
      let first;
      if (version.payEvery === "week") {
        first = addDays(from, (version.payWeekday - from.getDay() + 7) % 7);
      } else {
        const anchor = createSafeMidnight(version.payAnchor || formatToYMD(from));
        const apart = Math.round((from - anchor) / DAY_MS);
        first = addDays(anchor, Math.ceil(apart / step) * step);
      }
      for (let day = first; day < until && days.length < 2000; day = addDays(day, step)) days.push(day);
      before.push(addDays(first, -step));
    } else {
      const picks = version.payEvery === "month" ? [version.payDays[0]] : [...new Set(version.payDays.slice(0, 2))].sort((a, b) => a - b);
      const inMonth = (y, m) => picks.map(pick => new Date(y, m, Math.min(pick, new Date(y, m + 1, 0).getDate())));
      let y = from.getFullYear();
      let m = from.getMonth();
      const earlier = [...inMonth(y, m - 1), ...inMonth(y, m)].filter(day => day < from);
      before.push(earlier.length > 0 ? earlier[earlier.length - 1] : inMonth(y, m - 2).pop());
      for (let guard = 0; guard < 400; guard++) {
        for (const day of inMonth(y, m)) {
          if (day >= from && day < until) days.push(day);
        }
        m++;
        if (m > 11) { m = 0; y++; }
        if (new Date(y, m, 1) >= until) break;
      }
    }
    return { days, before: before[0] };
  }

  // A payday moved off a weekend (weekend: "before" the Friday before, "after" the Monday after)
  function movedPayday(day, weekend) {
    const weekday = day.getDay();
    if (weekend === "before" && (weekday === 6 || weekday === 0)) return addDays(day, weekday === 6 ? -1 : -2);
    if (weekend === "after" && (weekday === 6 || weekday === 0)) return addDays(day, weekday === 6 ? 2 : 1);
    return day;
  }

  // The first day of the workweek a day is in
  const weekStartOf = (day, weekStart) => addDays(day, -((day.getDay() - weekStart + 7) % 7));

  // Every paycheck from the first version's first one through lastPayday: [{ payDate, scheduled, from, to (Dates: the pay
  // period, both included), version }], in order. Periods follow one another with no gaps or overlaps.
  function paySchedule(versions, lastPayday) {
    const scheduled = [];
    let before = null;
    for (let i = 0; i < versions.length; i++) {
      const version = versions[i];
      const until = i + 1 < versions.length ? versions[i + 1].fromDate : addDays(lastPayday, 1);
      if (until <= version.fromDate) continue;
      const found = paydaysOf(version, version.fromDate, until);
      if (scheduled.length === 0) before = found.before;
      for (const day of found.days) scheduled.push({ scheduled: day, version });
    }
    const checks = [];
    let lastEnd = null;
    for (let i = 0; i < scheduled.length; i++) {
      const { scheduled: day, version } = scheduled[i];
      const payDate = movedPayday(day, version.weekend);
      if (payDate > lastPayday) break;
      let to;
      let from;
      if (version.period === "days") {
        to = addDays(day, -version.periodLag);
        from = lastEnd ? addDays(lastEnd, 1) : addDays(before, -version.periodLag + 1);
      } else {
        to = addDays(weekStartOf(day, version.weekStart), -1);
        from = lastEnd ? addDays(lastEnd, 1) : weekStartOf(before, version.weekStart);
      }
      if (to < from) continue;
      checks.push({ payDate, scheduled: day, from, to, version });
      lastEnd = to;
    }
    return checks;
  }

  //#endregion

  // =====================================================================
  // #region SHIFTS
  // =====================================================================
  // Every timed event is a shift (unless only or skip leave it out), and all-day events are left out, except bonuses.
  // Events that overlap are one shift (their titles joined with +), so time is never counted twice. A shift counts on
  // the day it starts (overnight "start"), and one over 24 hours is split into 24-hour pieces from its start, each on
  // its own day (so each can land in a different paycheck); or with overnight "split", it's split at midnight, each
  // day's hours on that day. An unpaid break comes out of a shift of breakAfter hours or more, spread across all of it.

  // Words from a comma-separated list, as compared (lowercase)
  const wordList = (text) => String(text || "").split(",").map(word => word.trim().toLowerCase()).filter(Boolean);
  const has = (title, word) => String(title).toLowerCase().includes(word);

  // The calendar's shifts and bonuses: { shifts: [{ start, end (ms), title }], bonuses: [{ date, amount, title }],
  // missingAmounts: [titles and days] }
  function shiftsFrom(events, pay) {
    const only = wordList(pay.only);
    const skip = wordList(pay.skip);
    const bonusWord = String(pay.bonusWord || "").toLowerCase();
    const timed = events.filter(event => !event.allDay && event.end > event.start)
      .filter(event => (only.length === 0 || only.some(word => has(event.title, word))) && !skip.some(word => has(event.title, word)))
      .sort((a, b) => a.start - b.start || a.end - b.end);
    const shifts = [];
    for (const event of timed) {
      const last = shifts[shifts.length - 1];
      if (last && event.start < last.end) {
        last.end = Math.max(last.end, event.end);
        if (event.title && !last.titles.includes(event.title)) last.titles.push(event.title);
      } else {
        shifts.push({ start: event.start, end: event.end, titles: event.title ? [event.title] : [] });
      }
    }
    for (const shift of shifts) {
      shift.title = shift.titles.join(" + ") || "Shift";
      delete shift.titles;
    }

    const bonuses = [];
    const missingAmounts = [];
    if (bonusWord) {
      for (const event of events) {
        if (!event.allDay || !has(event.title, bonusWord)) continue;
        // (A dollar amount first, so "Bonus 2026 $50" is $50; or else the first number)
        const written = /\$\s*(\d[\d,]*(?:\.\d{1,2})?)/.exec(event.title) || /(\d[\d,]*(?:\.\d{1,2})?)/.exec(event.title) || [];
        const amount = readMoneyInput(written[1] || "");
        if (Number.isFinite(amount) && amount > 0 && amount <= MAX_AMOUNT) bonuses.push({ date: event.date, amount: Math.round(amount * 100) / 100, title: event.title });
        else missingAmounts.push(`"${event.title}" on ${showDay(event.date)}`);
      }
    }
    return { shifts, bonuses, missingAmounts };
  }

  // A shift's pieces: [{ start, end (ms), day (the Date it counts on), part, parts }]
  function shiftPieces(shift, overnight) {
    const pieces = [];
    if (overnight === "split") {
      let at = shift.start;
      while (at < shift.end && pieces.length < 400) {
        const day = createSafeMidnight(new Date(at));
        const next = Math.min(shift.end, addDays(day, 1).getTime());
        pieces.push({ start: at, end: next, day });
        at = next;
      }
    } else {
      for (let at = shift.start; at < shift.end && pieces.length < 400; at += 24 * HOUR_MS) {
        pieces.push({ start: at, end: Math.min(shift.end, at + 24 * HOUR_MS), day: createSafeMidnight(new Date(at)) });
      }
    }
    pieces.forEach((piece, index) => { piece.part = index + 1; piece.parts = pieces.length; });
    return pieces;
  }

  // The rule a shift's title (on a day) is paid by: the first one whose words are in it, while it's on; or null
  function ruleFor(title, day, rules) {
    const key = formatToYMD(day);
    return rules.find(rule => has(title, rule.contains.toLowerCase()) && (!rule.from || rule.from <= key) && (!rule.to || rule.to >= key)) || null;
  }

  // Night hours (in clock hours) between two instants: the times between nightFrom and nightTo each day (past midnight
  // when nightTo is earlier, like 10:00 PM to 6:00 AM)
  function nightHours(start, end, version) {
    if (!version.nightFrom || !version.nightTo || version.nightFrom === version.nightTo) return 0;
    const [fromHour, fromMinute] = version.nightFrom.split(":").map(Number);
    const [toHour, toMinute] = version.nightTo.split(":").map(Number);
    const overnight = toHour * 60 + toMinute <= fromHour * 60 + fromMinute;
    let total = 0;
    const first = addDays(createSafeMidnight(new Date(start)), -1);
    for (let day = first; day.getTime() < end; day = addDays(day, 1)) {
      const windowStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), fromHour, fromMinute).getTime();
      const windowEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate() + (overnight ? 1 : 0), toHour, toMinute).getTime();
      total += Math.max(0, Math.min(end, windowEnd) - Math.max(start, windowStart));
    }
    return total / HOUR_MS;
  }

  //#endregion

  // =====================================================================
  // #region PAY
  // =====================================================================
  // Within each workweek, hours count in the order they're worked. With a daily limit, a day's hours past otDaily are
  // overtime (and past dtDaily double time); the rest count toward the week's limit, and the week's hours past otWeekly
  // are overtime (the week's last hours). Each hour is paid at its shift rate: the rule's hourly rate (or base pay) plus
  // its extra per hour, times its multiplier, or its night rate in the night hours (base pay's night rate is nightPay).
  // Overtime adds (overtimeMultiplier - 1) x the week's blended rate (every worked hour's pay, the week's bonuses, and
  // its taxable per-shift extras, over the hours: the regular rate of pay the law uses), or with otRate "own", it's the
  // hour's own rate x overtimeMultiplier. Shifts with premiumWord in their title are paid base pay x premiumMultiplier
  // instead (they count toward the limits, but are never overtime too), and a rule's paid time off (like vacation) is
  // paid at its rate without counting toward overtime.

  // (To 12 digits first, so 28.345 stored as 28.34499... still rounds up, like payroll's)
  const roundCents = (amount) => Math.round(Number((amount * 100).toPrecision(12))) / 100;
  const roundHours = (hours) => Math.round(hours * 100) / 100;

  // A piece's hours split by the limits, in the order they're worked: [{ kind: "regular" | "overtime" | "double",
  // offset, hours }]. counts: { week (hours toward the weekly limit), days: Map(day -> hours that day) }
  function splitHours(hours, day, version, counts) {
    const segments = [];
    const push = (kind, offset, amount) => {
      if (amount <= 1e-9) return;
      const last = segments[segments.length - 1];
      if (last && last.kind === kind) last.hours += amount;
      else segments.push({ kind, offset, hours: amount });
    };
    const daily = version.otDaily > 0 ? version.otDaily : Infinity;
    const double = version.dtDaily > 0 ? Math.max(version.dtDaily, version.otDaily > 0 ? version.otDaily : 0) : Infinity;
    const weekly = version.otWeekly > 0 ? version.otWeekly : Infinity;
    const key = day.getTime();
    let dayCount = counts.days.get(key) || 0;
    let offset = 0;
    let left = hours;
    while (left > 1e-9) {
      let kind;
      let room;
      if (dayCount >= double) { kind = "double"; room = left; }
      else if (dayCount >= daily) { kind = "overtime"; room = Math.min(left, double - dayCount); }
      else {
        room = Math.min(left, daily - dayCount, double - dayCount);
        // (Within the day's limit, the week's limit decides)
        if (counts.week >= weekly) kind = "overtime";
        else { kind = "regular"; room = Math.min(room, weekly - counts.week); }
        counts.week += room;
      }
      push(kind, offset, room);
      dayCount += room;
      offset += room;
      left -= room;
    }
    counts.days.set(key, dayCount);
    return segments;
  }

  // Everything worked out from the calendar's events for a connection's pay settings, through lastPayday: { checks
  // (paychecks with their pieces, bonuses, and totals), pieces, shifts, from (the first day counted) }
  function payFor(events, pay, versions, lastPayday, scheduleEnd) {
    const checks = paySchedule(versions, lastPayday);
    const countFrom = checks.length > 0 ? checks[0].from : null;
    const { shifts, bonuses, missingAmounts } = shiftsFrom(events, pay);
    const checkFor = (day) => checks.find(check => day >= check.from && day <= check.to) || null;
    // (The version for a day past the last paycheck, for the schedule: the latest one)
    const versionFor = (day) => checkFor(day)?.version || [...versions].reverse().find(version => version.fromDate <= day) || versions[0];

    const pieces = [];
    for (const shift of shifts) {
      const firstDay = createSafeMidnight(new Date(shift.start));
      if (countFrom && addDays(firstDay, 1) < countFrom && shift.end <= countFrom.getTime()) continue;
      if (firstDay > scheduleEnd) continue;
      const version = versionFor(firstDay);
      const rule = ruleFor(shift.title, firstDay, pay.rules);
      const clockHours = (shift.end - shift.start) / HOUR_MS;
      const breakMinutes = rule && rule.breakMinutes !== null ? rule.breakMinutes : version.breakMinutes;
      const breakHours = breakMinutes > 0 && clockHours >= version.breakAfter ? Math.min(clockHours, breakMinutes / 60) : 0;
      shift.scale = clockHours > 0 ? (clockHours - breakHours) / clockHours : 0;
      shift.breakHours = breakHours;
      shift.premium = !!version.premiumWord && has(shift.title, version.premiumWord.toLowerCase());
      shift.pieces = [];
      for (const piece of shiftPieces(shift, version.overnight)) {
        if (countFrom && piece.day < countFrom) continue;
        const pieceVersion = versionFor(piece.day);
        const pieceRule = ruleFor(shift.title, piece.day, pay.rules);
        const entry = {
          shift, ...piece, version: pieceVersion, rule: pieceRule,
          hours: ((piece.end - piece.start) / HOUR_MS) * shift.scale,
          kind: shift.premium ? "premium" : pieceRule && pieceRule.kind === "paidOff" ? "paidOff" : "worked",
          check: checkFor(piece.day)
        };
        shift.pieces.push(entry);
        pieces.push(entry);
      }
    }

    // Hours by workweek, in the order they're worked
    const weeks = new Map();
    const weekOf = (day, version) => weekStartOf(day, version.weekStart).getTime();
    for (const piece of pieces) {
      const key = weekOf(piece.day, piece.version);
      if (!weeks.has(key)) weeks.set(key, { pieces: [], bonuses: 0, extras: 0, counts: { week: 0, days: new Map() } });
      weeks.get(key).pieces.push(piece);
    }
    for (const week of weeks.values()) {
      week.pieces.sort((a, b) => a.start - b.start);
      for (const piece of week.pieces) {
        piece.segments = piece.kind === "paidOff" ? [{ kind: "paidOff", offset: 0, hours: piece.hours }] : splitHours(piece.hours, piece.day, piece.version, week.counts);
      }
    }
    for (const bonus of bonuses) {
      const version = versionFor(bonus.date);
      const key = weekOf(bonus.date, version);
      if (!weeks.has(key)) weeks.set(key, { pieces: [], bonuses: 0, extras: 0, counts: { week: 0, days: new Map() } });
      weeks.get(key).bonuses += bonus.amount;
      bonus.check = checkFor(bonus.date);
    }
    // A rule's extra per shift goes with the shift's first piece
    for (const shift of shifts) {
      const first = shift.pieces?.[0];
      if (!first || !first.rule || !first.rule.extraShift) continue;
      first.extraShift = first.rule.extraShift;
      first.extraTaxFree = first.rule.shiftTaxFree;
      if (!first.extraTaxFree) weeks.get(weekOf(first.day, first.version)).extras += first.extraShift;
    }

    // Each piece's pay: its segments at their rates
    for (const week of weeks.values()) {
      let straight = 0;
      let workedHours = 0;
      for (const piece of week.pieces) {
        const base = piece.version.basePay;
        const rule = piece.rule;
        const multiplier = rule && rule.multiplier !== null ? rule.multiplier : 1;
        const extra = rule && rule.extraHour !== null ? rule.extraHour : 0;
        const dayRate = rule ? ((rule.rate ?? base) + extra) * multiplier : base;
        const nightRate = rule ? ((rule.night ?? rule.rate ?? base) + extra) * multiplier : (piece.version.nightPay ?? base);
        piece.dayRate = dayRate;
        piece.nightRate = nightRate;
        for (const segment of piece.segments) {
          const clockStart = piece.start + (segment.offset / piece.shift.scale) * HOUR_MS;
          const clockEnd = piece.start + ((segment.offset + segment.hours) / piece.shift.scale) * HOUR_MS;
          const night = piece.kind === "paidOff" ? 0 : Math.min(segment.hours, nightHours(clockStart, clockEnd, piece.version) * piece.shift.scale);
          segment.night = night;
          segment.straight = (segment.hours - night) * dayRate + night * nightRate;
          if (piece.kind === "worked") {
            straight += segment.straight;
            workedHours += segment.hours;
          }
        }
      }
      week.blended = workedHours > 0 ? (straight + week.bonuses + week.extras) / workedHours : 0;
      for (const piece of week.pieces) {
        const version = piece.version;
        piece.pay = { regular: 0, overtime: 0, overtimeExtra: 0, premium: 0, paidOff: 0, hours: { regular: 0, overtime: 0, double: 0, premium: 0, paidOff: 0 } };
        for (const segment of piece.segments) {
          if (piece.kind === "premium") {
            piece.pay.premium += segment.hours * version.basePay * version.premiumMultiplier;
            piece.pay.hours.premium += segment.hours;
          } else if (piece.kind === "paidOff") {
            piece.pay.paidOff += segment.hours * piece.dayRate;
            piece.pay.hours.paidOff += segment.hours;
          } else if (segment.kind === "regular") {
            piece.pay.regular += segment.straight;
            piece.pay.hours.regular += segment.hours;
          } else {
            const multiplier = segment.kind === "double" ? version.dtMultiplier : version.overtimeMultiplier;
            const extra = version.otRate === "own" ? segment.straight * (multiplier - 1) : (multiplier - 1) * week.blended * segment.hours;
            piece.pay.overtime += segment.straight + extra;
            piece.pay.overtimeExtra += extra;
            piece.pay.hours[segment.kind] += segment.hours;
          }
        }
        // (Each piece's pay is rounded to the cent, like a paystub's lines)
        for (const key of ["regular", "overtime", "overtimeExtra", "premium", "paidOff"]) piece.pay[key] = roundCents(piece.pay[key]);
      }
    }
    return { checks, pieces, shifts, bonuses, missingAmounts, from: countFrom };
  }

  //#endregion

  // =====================================================================
  // #region TAXES
  // =====================================================================
  // FICA is Social Security and Medicare, each worked out and rounded on its own (the Medicare part is 1.45%, Social
  // Security the rest of ficaPercent), on gross pay less pre-tax medical (a retirement plan still pays it). Federal and
  // state taxes are a percent of the pay left after pre-tax deductions, or worked out like payroll does: federal from
  // the Form W-4 (the IRS's percentage method for automated payroll, Publication 15-T, with bonuses at the flat
  // supplemental rate), and a state from its own withholding tables. Overtime can be left out of federal or state tax
  // (all of it, or just its extra over straight time), for places that don't tax it. These are estimates of what's
  // withheld, not a tax return.

  // The IRS's annual percentage method tables (Publication 15-T, Worksheet 1A, for a Form W-4 from 2020 or later):
  // [at least, tentative amount, percent over at least]. A year without its own uses the closest year there is.
  const FEDERAL_TABLES = {
    2026: {
      standard: {
        married: [[0, 0, 0], [19300, 0, 10], [44100, 2480, 12], [120100, 11600, 22], [230700, 35932, 24], [422850, 82048, 32], [531750, 116896, 35], [788000, 206583.5, 37]],
        single: [[0, 0, 0], [7500, 0, 10], [19900, 1240, 12], [57900, 5800, 22], [113200, 17966, 24], [209275, 41024, 32], [263725, 58448, 35], [648100, 192979.25, 37]],
        head: [[0, 0, 0], [15550, 0, 10], [33250, 1770, 12], [83000, 7740, 22], [121250, 16155, 24], [217300, 39207, 32], [271750, 56631, 35], [656150, 191171, 37]]
      },
      step2: {
        married: [[0, 0, 0], [16100, 0, 10], [28500, 1240, 12], [66500, 5800, 22], [121800, 17966, 24], [217875, 41024, 32], [272325, 58448, 35], [400450, 103291.75, 37]],
        single: [[0, 0, 0], [8050, 0, 10], [14250, 620, 12], [33250, 2900, 22], [60900, 8983, 24], [108938, 20512, 32], [136163, 29224, 35], [328350, 96489.63, 37]],
        head: [[0, 0, 0], [12075, 0, 10], [20925, 885, 12], [45800, 3870, 22], [64925, 8077.5, 24], [112950, 19603.5, 32], [140175, 28315.5, 35], [332375, 95585.5, 37]]
      },
      // Worksheet 1A, step 1(g): taken off the year's pay when Step 2 isn't checked
      allowance: { married: 12900, other: 8600 },
      supplemental: 22
    }
  };

  // States' withholding tables, by their postal code: { name, years: { year: { allowance (per allowance), single,
  // married: [at least, tax at that amount, percent over it] } }, round: "dollar" (the state says to round to the dollar) }
  const STATE_TABLES = {
    OK: {
      name: "Oklahoma",
      round: "dollar",
      years: {
        2026: {
          allowance: 1000,
          single: [[0, 0, 0], [10100, 0, 2.5], [11250, 28.75, 3.5], [13550, 109.25, 4.5]],
          married: [[0, 0, 0], [20200, 0, 2.5], [22500, 57.5, 3.5], [27100, 218.5, 4.5]]
        }
      }
    }
  };

  // A table's year: the paycheck's own, or the closest one there is
  function tableYear(years, year) {
    const known = Object.keys(years).map(Number).sort((a, b) => a - b);
    const earlier = known.filter(y => y <= year);
    return years[earlier.length > 0 ? earlier[earlier.length - 1] : known[0]];
  }

  // A bracket table's tax on an amount
  function bracketTax(table, amount) {
    let row = table[0];
    for (const candidate of table) if (amount >= candidate[0]) row = candidate;
    return row[1] + (amount - row[0]) * row[2] / 100;
  }

  // A paycheck's taxes and deductions from its gross pay and its parts: { medical, retirement, fica, federal, state, post,
  // reimbursed, takeHome }
  function paycheckTaxes(check, version, year) {
    const gross = check.gross;
    const medical = roundCents(gross * version.preTaxMedicalPercent / 100 + version.preTaxMedicalFixed);
    const retirement = roundCents(gross * version.preTaxRetirementPercent / 100 + version.preTaxRetirementFixed);
    const ficaBase = Math.max(0, gross - medical);
    const medicarePercent = Math.min(version.ficaPercent, 1.45);
    const fica = roundCents(roundCents(ficaBase * (version.ficaPercent - medicarePercent) / 100) + roundCents(ficaBase * medicarePercent / 100));
    const overtimeOut = (choice) => (choice === "none" ? check.overtime : choice === "extra" ? check.overtimeExtra : 0);
    const periods = PAY_PERIODS_PER_YEAR[version.payEvery];

    // Federal
    let federal = 0;
    const federalBase = Math.max(0, gross - medical - retirement - overtimeOut(version.otFederal));
    if (version.fedMode === "percent") {
      federal = roundCents(federalBase * version.federalPercent / 100);
    } else if (version.fedMode === "w4") {
      const tables = tableYear(FEDERAL_TABLES, year);
      // Bonuses are supplemental pay, withheld at the flat rate, on their share of the pay after pre-tax deductions
      const supplemental = gross > 0 ? Math.min(federalBase, check.bonuses * (gross - medical - retirement) / gross) : 0;
      const regular = Math.max(0, federalBase - supplemental);
      const allowance = version.fedStep2 ? 0 : (version.fedFiling === "married" ? tables.allowance.married : tables.allowance.other);
      const adjusted = Math.max(0, regular * periods + version.fedOtherIncome - version.fedDeductions - allowance);
      const table = (version.fedStep2 ? tables.step2 : tables.standard)[version.fedFiling];
      const tentative = bracketTax(table, adjusted) / periods;
      federal = roundCents(roundCents(Math.max(0, tentative - version.fedDependents / periods) + version.fedExtra) + roundCents(supplemental * tables.supplemental / 100));
    }

    // State
    let state = 0;
    const stateBase = Math.max(0, gross - medical - (version.retirementBeforeState ? retirement : 0) - overtimeOut(version.otState));
    if (version.stateMode === "percent") {
      state = roundCents(stateBase * version.statePercent / 100 + version.stateExtra);
    } else if (version.stateMode === "table" && STATE_TABLES[version.stateTable]) {
      const tables = STATE_TABLES[version.stateTable];
      const yearTable = tableYear(tables.years, year);
      const annual = Math.max(0, stateBase * periods - version.stateAllowances * yearTable.allowance);
      const perCheck = bracketTax(yearTable[version.stateFiling], annual) / periods;
      state = tables.round === "dollar" ? Math.round(perCheck) + Math.round(version.stateExtra) : roundCents(perCheck + version.stateExtra);
    }

    const post = roundCents(gross * version.postTaxPercent / 100 + version.postTaxFixed);
    const reimbursed = roundCents(version.nontaxableReimbursements + check.extrasFree);
    const takeHome = roundCents(gross - medical - retirement - fica - federal - state - post + reimbursed);
    return { medical, retirement, fica, federal, state, post, reimbursed, takeHome };
  }

  //#endregion

  // =====================================================================
  // #region PAYCHECKS AND ENTRIES
  // =====================================================================

  const KEEP_DAYS_BEFORE = 100; // Paychecks' entries kept from before today, like a spreadsheet's
  const KEEP_PAYCHECKS_DAYS = 400; // Paychecks kept for the page (this year's and last year's end)
  const SCHEDULE_DAYS = 35; // The schedule shows shifts this far past today, even past the look ahead
  const DEFAULT_TITLE = "Paycheck";

  // The connection's entries' title, refraction type, and Other Account (typed in, like a spreadsheet's typed parts), and
  // what's wrong with them (any problem here keeps every entry off: they'd land in the wrong place)
  function entryParts(connection) {
    const fields = connection.fields || {};
    const typed = (field) => String(field?.value ?? "").replace(/\s+/g, " ").trim();
    const type = ["❗️", "✖️", "⭕️"].includes(fields.type?.value) ? fields.type.value : "❗️";
    const accounts = new Map(accountRows().map(account => [account.clean, account.name]));
    const typedAccount = typed(fields.account);
    const account = typedAccount ? accounts.get(cleanString(typedAccount)) : "";
    const problems = [];
    if (account === undefined) problems.push(`The Other Account "${typedAccount}" isn't one of yours anymore. Pick another, or add it on the Other Accounts page.`);
    if (account && type === "❗️") problems.push(`Its paychecks go to ${account}, but they're Regular. Make them Hidden or Transfer, so they can change the account.`);
    const ownTitle = capitalize(splitAccount(typed(fields.title) || (account ? "" : DEFAULT_TITLE)).title.replace(/\s*[←→]\s*/g, " ").trim()).slice(0, MAX_TITLE);
    return { type, title: withAccount(ownTitle, account || ""), problems };
  }

  // Everything a calendar (parseCalendar's) comes to with a connection's settings: { entries ([[MM/DD/YYYY, type, amount,
  // title]], like a spreadsheet's), problems, blocked (a problem keeps the entries off), paychecks (summaries, kept with
  // the connection), checked ({ shifts, paychecks, from }), shifts and paychecks with their pieces (for the page), from
  // (the first day counted) }. A problem that stops everything (like no base pay) leaves no entries and checked null.
  function workOut(calendar, connection) {
    const pay = normalizePay(connection.pay);
    const stop = (problem) => ({ entries: [], problems: [problem], blocked: true, paychecks: [], checked: null, shifts: [], details: [], bonuses: [], from: null });
    if (pay.versions.length === 0) return stop("Pick the day of the first paycheck to count, under Pay.");
    const versions = resolvedVersions(pay);
    if (!versions.some(version => version.basePay > 0)) return stop("Fill in Base Pay, under Pay.");
    const ahead = lookAheadEnd(pay);
    const scheduleEnd = addDays(today, SCHEDULE_DAYS);
    // (The calendar is read through the last period counted, and the schedule's days past it)
    const checksAhead = paySchedule(versions, ahead);
    const first = paySchedule(versions, addDays(versions[0].fromDate, 400))[0];
    if (!first) return stop("No paycheck lands on or after the first paycheck's day. Check Paydays, under Pay.");
    const readFrom = addDays(first.from, -2);
    const readTo = checksAhead.length > 0 && checksAhead[checksAhead.length - 1].to > scheduleEnd ? checksAhead[checksAhead.length - 1].to : scheduleEnd;
    const { events, unfollowed } = eventsBetween(calendar, readFrom, addDays(readTo, 1));
    const worked = payFor(events, pay, versions, ahead, readTo);
    const { type, title, problems } = entryParts(connection);
    const blocked = problems.length > 0;
    problems.push(...calendar.problems);
    if (unfollowed.length > 0) problems.push(`${unfollowed.slice(0, 3).map(name => `"${name}"`).join(", ")}${unfollowed.length > 3 ? ` and ${unfollowed.length - 3} more` : ""} repeat${unfollowed.length === 1 ? "s" : ""} in a way that can't be followed here (like by week number), so only the first time counts. Make each one its own event, or a simpler repeat.`);
    if (worked.missingAmounts.length > 0) problems.push(`${worked.missingAmounts.slice(0, 3).join(", ")}${worked.missingAmounts.length > 3 ? ` and ${worked.missingAmounts.length - 3} more` : ""} ${worked.missingAmounts.length === 1 ? "has" : "have"} "${pay.bonusWord}" in ${worked.missingAmounts.length === 1 ? "its" : "their"} title but no amount, like ${capitalize(pay.bonusWord)} $25, so ${worked.missingAmounts.length === 1 ? "it isn't" : "they aren't"} counted.`);
    if (versions.some(version => version.nightPay !== null || pay.rules.some(rule => rule.night !== null)) && versions.some(version => !version.nightFrom || !version.nightTo)) {
      problems.push("A night rate is filled in, but not the night hours it's for. Fill in Night hours (from and to), under Pay.");
    }

    // Each paycheck's totals
    const details = [];
    for (const check of worked.checks) {
      const pieces = worked.pieces.filter(piece => piece.check === check);
      const bonuses = worked.bonuses.filter(bonus => bonus.check === check);
      const sum = (pick) => pieces.reduce((total, piece) => total + pick(piece), 0);
      const hours = {
        regular: roundHours(sum(piece => piece.pay?.hours.regular || 0)),
        overtime: roundHours(sum(piece => piece.pay?.hours.overtime || 0)),
        double: roundHours(sum(piece => piece.pay?.hours.double || 0)),
        premium: roundHours(sum(piece => piece.pay?.hours.premium || 0)),
        paidOff: roundHours(sum(piece => piece.pay?.hours.paidOff || 0))
      };
      const totalHours = hours.regular + hours.overtime + hours.double + hours.premium + hours.paidOff;
      const bonusTotal = roundCents(bonuses.reduce((total, bonus) => total + bonus.amount, 0));
      const extras = roundCents(sum(piece => (piece.extraShift && !piece.extraTaxFree ? piece.extraShift : 0)));
      const extrasFree = roundCents(sum(piece => (piece.extraShift && piece.extraTaxFree ? piece.extraShift : 0)));
      if (totalHours <= 0 && bonusTotal <= 0 && extras <= 0 && extrasFree <= 0) continue;
      const version = check.version;
      const parts = {
        regular: roundCents(sum(piece => piece.pay?.regular || 0)),
        overtime: roundCents(sum(piece => piece.pay?.overtime || 0)),
        overtimeExtra: roundCents(sum(piece => piece.pay?.overtimeExtra || 0)),
        premium: roundCents(sum(piece => piece.pay?.premium || 0)),
        paidOff: roundCents(sum(piece => piece.pay?.paidOff || 0)),
        bonuses: bonusTotal,
        extras,
        extrasFree,
        allowances: roundCents(version.taxableAllowances)
      };
      parts.gross = roundCents(parts.regular + parts.overtime + parts.premium + parts.paidOff + parts.bonuses + parts.extras + parts.allowances);
      const taxes = paycheckTaxes(parts, version, check.payDate.getFullYear());
      let takeHome = taxes.takeHome;
      if (takeHome < 0) {
        problems.push(`The paycheck on ${showDate(check.payDate)} comes to less than $0 after its deductions, so it counts as $0.00. Check the fixed amounts under Pay.`);
        takeHome = 0;
      }
      details.push({ check, pieces, bonuses, hours, parts, taxes: { ...taxes, takeHome } });
    }

    // What's kept: paychecks (the last 400 days' and those ahead), and the entries they make
    const keepFrom = addDays(today, -KEEP_PAYCHECKS_DAYS);
    const paychecks = details.filter(detail => detail.check.payDate >= keepFrom).map(detail => summary(detail));
    const entryFrom = addDays(today, -KEEP_DAYS_BEFORE);
    const entries = blocked ? [] : details
      .filter(detail => detail.check.payDate >= entryFrom && detail.taxes.takeHome > 0)
      .map(detail => [formatToMMDDYYYY(detail.check.payDate), type, detail.taxes.takeHome, title]);
    const shiftCount = worked.shifts.filter(shift => shift.pieces && shift.pieces.some(piece => piece.check)).length;
    return {
      entries,
      problems: [...new Set(problems)],
      blocked,
      paychecks,
      checked: { shifts: shiftCount, paychecks: details.length, from: worked.from ? formatToYMD(worked.from) : "" },
      shifts: worked.shifts.filter(shift => shift.pieces && shift.pieces.length > 0),
      details,
      bonuses: worked.bonuses,
      from: worked.from
    };
  }

  // A paycheck as it's kept with the connection (amounts and hours, rounded)
  function summary({ check, hours, parts, taxes }) {
    return {
      date: formatToYMD(check.payDate), from: formatToYMD(check.from), to: formatToYMD(check.to),
      hours, base: check.version.basePay,
      regular: parts.regular, overtime: parts.overtime, premium: parts.premium, paidOff: parts.paidOff, bonuses: parts.bonuses,
      extras: parts.extras, allowances: parts.allowances, gross: parts.gross,
      medical: taxes.medical, retirement: taxes.retirement, fica: taxes.fica, federal: taxes.federal, state: taxes.state,
      post: taxes.post, reimbursed: taxes.reimbursed, takeHome: taxes.takeHome
    };
  }

  // A kept paycheck summary, checked (one that doesn't read is null)
  function readPaycheck(item) {
    if (!item || typeof item !== "object" || !isDay(item.date) || !isDay(item.from) || !isDay(item.to)) return null;
    const number = (value) => (typeof value === "number" && Number.isFinite(value) ? Math.round(value * 100) / 100 : 0);
    const hours = item.hours && typeof item.hours === "object" ? item.hours : {};
    const kept = { date: item.date, from: item.from, to: item.to, hours: {} };
    for (const key of ["regular", "overtime", "double", "premium", "paidOff"]) kept.hours[key] = number(hours[key]);
    for (const key of ["base", "regular", "overtime", "premium", "paidOff", "bonuses", "extras", "allowances", "gross", "medical", "retirement", "fica", "federal", "state", "post", "reimbursed", "takeHome"]) {
      kept[key] = number(item[key]);
    }
    return kept;
  }

  //#endregion

  // =====================================================================
  // #region STAYING UP TO DATE
  // =====================================================================

  const READ_GAP_MS = 15 * 60 * 1000;
  const READS_KEY = "prismal_calendar_reads"; // When this device last read each calendar: { id: time }
  const lastWorkedOut = new Map(); // Each calendar's last read on this page: id -> { calendar, result, at }

  // { connection id: when this device last read it (ms) }
  function lastReads() {
    try { return JSON.parse(localStorage.getItem(READS_KEY) || "{}") || {}; } catch (e) { return {}; }
  }

  // Read one calendar and work it out: { id, basis, entries, problems, paychecks, checked }, or { id, basis, failed } when
  // the server said why it couldn't be read (a dropped connection is null: it keeps what it has, and is read next time).
  // basis: the settings it was worked out with (see connectionBasis). Only the page keeps the calendar itself, for its
  // shifts.
  async function readConnection(connection) {
    const basis = connectionBasis(connection);
    try {
      const text = await readCalendarFile(connection.link);
      const calendar = parseCalendar(text);
      const result = workOut(calendar, connection);
      if (window.PAGE === "spreadsheets") lastWorkedOut.set(connection.id, { calendar, result, at: Date.now() });
      return { id: connection.id, basis, entries: result.entries, problems: result.problems, paychecks: result.paychecks, checked: result.checked };
    } catch (err) {
      if (err instanceof CalendarReadError) return err.lasting ? { id: connection.id, basis, failed: err.message } : null;
      console.error("Couldn't work out a calendar:", err);
      return { id: connection.id, basis, failed: "That calendar couldn't be read. Check that its link is the calendar's subscription link (.ics), and try again." };
    }
  }

  // Read the calendars that are on again (all of them with force, or only those this device hasn't read in 15 minutes),
  // and update the budget when what they come to changed. Resolves to the budget's result, or null.
  let refreshing = null;
  function refresh({ force = false } = {}) {
    if (refreshing) return refreshing;
    refreshing = refreshNow(force).finally(() => { refreshing = null; });
    return refreshing;
  }

  // The reading itself (see refresh)
  async function refreshNow(force) {
    if (typeof workspaceLoaded === "undefined" || !workspaceLoaded || !sheetsData) return null;
    const reads = lastReads();
    const now = Date.now();
    const due = sheetsData.list.filter(connection => connection.kind === "calendar" && connection.on && (force || !(now - (reads[connection.id] || 0) < READ_GAP_MS)));
    if (due.length === 0) return null;
    const results = await Promise.all(due.map(readConnection));
    // (A read that dropped isn't counted, so the next visit tries it again)
    const kept = lastReads();
    due.forEach((connection, index) => { if (results[index]) kept[connection.id] = now; });
    try { localStorage.setItem(READS_KEY, JSON.stringify(kept)); } catch (e) {}

    // Only what's different changes the budget (and not a read of settings changed since it started)
    const changed = results.filter(Boolean).filter(result => {
      const connection = sheetConnectionById(result.id);
      if (!connection || connectionBasis(connection) !== result.basis) return false;
      if (result.failed) return !(connection.problems.length === 1 && connection.problems[0] === result.failed);
      const updated = normalizeSheetConnection({ ...connection, entries: result.entries, problems: result.problems, paychecks: result.paychecks, checked: result.checked });
      return JSON.stringify(updated) !== JSON.stringify(connection);
    });
    document.dispatchEvent(new CustomEvent("calendars:read"));
    if (changed.length === 0) return null;
    return updateSheetReads(changed);
  }

  // When this device last read a calendar (ms), or 0
  const lastReadAt = (id) => lastReads()[id] || 0;

  // A calendar the page just read and worked out itself (its panel's Save): kept like a read, so its shifts show
  function remember(id, calendar, result) {
    if (!id) return;
    lastWorkedOut.set(id, { calendar, result, at: Date.now() });
    const kept = lastReads();
    kept[id] = Date.now();
    try { localStorage.setItem(READS_KEY, JSON.stringify(kept)); } catch (e) {}
  }

  // Home and the Spreadsheets & Calendars page keep them up to date: when they open, and when they come back into view
  const KEEPS_UP = ["home", "spreadsheets"];
  if (KEEPS_UP.includes(window.PAGE) && window.workspaceReady) {
    window.workspaceReady.then((loaded) => {
      if (loaded) refresh({ force: window.PAGE === "spreadsheets" });
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") refresh();
    });
  }

  //#endregion

  return {
    CalendarReadError,
    readCalendarFile,
    parseCalendar,
    eventsBetween,
    workOut,
    normalizePay,
    resolvedVersions,
    lookAheadDay,
    readPaycheck,
    crystalSettings,
    refresh,
    lastWorkedOut,
    lastReadAt,
    remember,
    PAY_DEFAULTS,
    MAX_RULES,
    MAX_VERSIONS,
    CRYSTAL_KEYS,
    STATE_TABLES,
    FEDERAL_TABLES,
    PAY_PERIODS_PER_YEAR,
    DEFAULT_TITLE
  };
})();
