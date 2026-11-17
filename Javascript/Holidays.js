// The Holidays Calendar Fractal's days (Fractals.js shows them as a fractal of their own, all day, which can't be added
// to, changed, or taken out). This is the only file that names them: nothing else on the site may (see the PPP).
//   - The United States' federal holidays, each with the day it's observed when it falls on a weekend (a Saturday's is
//     the Friday before, a Sunday's the Monday after), and some days widely kept that aren't days off.
//   - Holidays.inYear(year): [{ day: "YYYY-MM-DD", title }] for one year, in order (an observed day can be in the year
//     before, like a Saturday January 1st's). Holidays.between(from, to): the ones from one day through another (each
//     "YYYY-MM-DD", both counted), in order.

(() => {
  "use strict";

  const two = (number) => String(number).padStart(2, "0");
  const ymd = (date) => `${date.getUTCFullYear()}-${two(date.getUTCMonth() + 1)}-${two(date.getUTCDate())}`;
  const on = (year, month, day) => new Date(Date.UTC(year, month - 1, day));

  // The nth weekday (0 Sunday to 6 Saturday) of a month; nth -1 is its last
  function nthWeekday(year, month, weekday, nth) {
    if (nth === -1) {
      const last = on(year, month + 1, 0);
      return on(year, month, last.getUTCDate() - ((last.getUTCDay() - weekday + 7) % 7));
    }
    const first = on(year, month, 1);
    return on(year, month, 1 + ((weekday - first.getUTCDay() + 7) % 7) + 7 * (nth - 1));
  }

  // The Sunday of the spring holiday that moves (the Gregorian calendar's rule, worked out the usual way)
  function springSunday(year) {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return on(year, month, day);
  }

  // The federal holidays on a set day of the year: [month, day, title]
  const FIXED_FEDERAL = [
    [1, 1, "New Year's Day"],
    [6, 19, "Juneteenth"],
    [7, 4, "Independence Day"],
    [11, 11, "Veterans Day"],
    [12, 25, "Christmas Day"]
  ];
  // The ones on a set weekday: [month, weekday, nth (-1: the last), title]
  const MOVING_FEDERAL = [
    [1, 1, 3, "Martin Luther King Jr. Day"],
    [2, 1, 3, "Presidents' Day"],
    [5, 1, -1, "Memorial Day"],
    [9, 1, 1, "Labor Day"],
    [10, 1, 2, "Columbus Day (Indigenous Peoples' Day)"],
    [11, 4, 4, "Thanksgiving Day"]
  ];
  // Days widely kept that aren't days off
  const FIXED_KEPT = [
    [2, 14, "Valentine's Day"],
    [3, 17, "St. Patrick's Day"],
    [10, 31, "Halloween"],
    [12, 24, "Christmas Eve"],
    [12, 31, "New Year's Eve"]
  ];
  const MOVING_KEPT = [
    [5, 0, 2, "Mother's Day"],
    [6, 0, 3, "Father's Day"]
  ];

  // One year's days, in order (an observed day can be in the year before)
  function inYear(year) {
    const list = [];
    for (const [month, day, title] of FIXED_FEDERAL) {
      const date = on(year, month, day);
      list.push({ day: ymd(date), title });
      const weekday = date.getUTCDay();
      if (weekday === 6) list.push({ day: ymd(on(year, month, day - 1)), title: `${title} (observed)` });
      if (weekday === 0) list.push({ day: ymd(on(year, month, day + 1)), title: `${title} (observed)` });
    }
    for (const [month, weekday, nth, title] of MOVING_FEDERAL) list.push({ day: ymd(nthWeekday(year, month, weekday, nth)), title });
    for (const [month, day, title] of FIXED_KEPT) list.push({ day: ymd(on(year, month, day)), title });
    for (const [month, weekday, nth, title] of MOVING_KEPT) list.push({ day: ymd(nthWeekday(year, month, weekday, nth)), title });
    list.push({ day: ymd(springSunday(year)), title: "Easter Sunday" });
    return list.sort((a, b) => a.day.localeCompare(b.day) || a.title.localeCompare(b.title));
  }

  // The ones from one day through another ("YYYY-MM-DD"), in order (at most 50 years of them)
  function between(from, to) {
    const first = Number(from.slice(0, 4));
    const last = Math.min(Number(to.slice(0, 4)) + 1, first + 50);
    const list = [];
    for (let year = first; year <= last; year++) list.push(...inYear(year).filter(item => item.day >= from && item.day <= to));
    return list;
  }

  window.Holidays = { inYear, between };
})();
