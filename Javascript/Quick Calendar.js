// Quick Calendar: the page a home screen icon opens (/quickcal.html?key=...), with no login. The key in its link (made
// by Home's Quick Calendar button, while signed in) reads the account's calendar and adds entries to it; it never sees
// the budget. An entry added here waits (the API's fractal_waiting) until Prismal Planning opens on the device that made
// the icon, where it joins the calendar by itself, or until someone adds it from Home's card on another device. Until
// then it shows here with a dashed edge, and can be changed or deleted here. Entries already on the calendar only show.
// The page borrows the day zooming from Process Budget.js (which loads no budget here) and the calendar from Fractals.js.
// Its budget's meals show in the Meals fractal (Kitchen.js, from the icon's answer: never the Pantry), and New Entry's Meal
// adds one that waits the same way, filled in from the budget's recipes if you like (Kitchen UI.js).

(() => {
  "use strict";

  const params = new URLSearchParams(location.search);
  const key = params.get("key") || "";
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const WAITING = "waiting:"; // How a waiting entry's id starts here (the calendar's own ids never do)
  const WAITING_MEAL = "waiting"; // How a waiting meal's id starts here (a meal's own id never does: Kitchen.js isWaiting)
  const CALENDAR_DAYS = 35; // Five weeks, like Home's calendar
  const status = document.getElementById("dataStatus");
  // The calendar goes from the Sunday a year before today through the Saturday five years after it
  const yearAgo = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
  const fiveYears = new Date(today.getFullYear() + 5, today.getMonth(), today.getDate());
  const range = { first: addDays(yearAgo, -yearAgo.getDay()), last: addDays(fiveYears, 6 - fiveYears.getDay()) };
  let viewAnchor = today;
  let viewStart = addDays(today, -today.getDay());

  // Just set up from Home: show how to add it to the home screen, and drop setup=1 from the address (so the icon's link
  // is only the page, its key, and this device's theme: a phone's home screen app can keep its own storage, and starts
  // from this link)
  if (key && params.has("setup")) {
    document.getElementById("setupCard").hidden = false;
    const look = window.Themes ? Themes.lookQuery() : "";
    history.replaceState(null, "", `${location.pathname}?key=${encodeURIComponent(key)}${look ? `&${look}` : ""}`);
  }

  // Home goes on when this browser is signed in, and straight to the login page when it isn't, keeping this page's theme
  // on the way (Themes.lookQuery in Boot.js), like Quick Budget's (Quick Entry.js). Worked out as it's tapped, since this
  // page can stay open for days. In a home screen icon's app too, so the app stays where it was left (Layout.js): on a
  // phone whose apps keep their own storage, that's a sign-in of the app's own.
  const homeLink = document.querySelector('.navButtons a[href="/"]');
  const loginLink = () => {
    const look = window.Themes ? Themes.lookQuery() : "";
    return look ? `/login.html?${look}` : "/login.html";
  };
  if (homeLink && !signedInNow()) homeLink.setAttribute("href", loginLink());
  homeLink?.addEventListener("click", () => {
    homeLink.setAttribute("href", signedInNow() ? "/" : loginLink());
  });

  // One request with the key: { ok, status, data }, where data is the calendar as Fractals.js takes it (the entries this
  // icon added that are still waiting shown with the rest, each marked waiting). Its budget's meals go to Kitchen.js, with
  // the meals this icon added that are still waiting.
  async function ask(route, body = {}) {
    const result = await window.Fractals.call(`/api/quickcal/${route}`, { key, ...body });
    if (!result.ok || !result.data || !Array.isArray(result.data.fractals)) return result;
    const answer = result.data;
    const queued = Array.isArray(answer.meals) ? answer.meals : [];
    window.Kitchen.useData(answer.kitchen, queued.map(item => ({ ...item.meal, id: `${WAITING_MEAL}${item.id}`, waiting: item.id })));
    const fallback = answer.fractals[0] ? answer.fractals[0].id : null;
    const waiting = answer.waiting.map(item => ({
      ...item.event,
      id: `${WAITING}${item.id}`,
      fractal: answer.fractals.some(fractal => fractal.id === item.fractal) ? item.fractal : fallback,
      owned: true,
      waiting: true,
      people: []
    }));
    return { ...result, data: { ...answer, events: [...answer.events, ...waiting], waiting: [], waitingHere: waiting.length, saved: null } };
  }

  // A new entry or meal that's waiting: once the entries waiting come near how many can (LIMITS.waitingEntries), a toast says so
  function nearWaiting(result) {
    if (result.ok && result.data) Limits.near("waitingEntries", result.data.waitingCount);
    return result;
  }

  // The calendar is read and added to with the key: a new entry waits, a waiting one can be changed or deleted, and
  // the ones already on the calendar stay as they are
  window.Fractals.useStore({
    quick: true,
    load: () => ask("check"),
    save: (id, fractal, event) => {
      if (!id) return ask("entry", { fractal, event }).then(nearWaiting);
      if (id.startsWith(WAITING)) return ask("change", { id: Number(id.slice(WAITING.length)), fractal, event });
      return Promise.resolve({ ok: false, status: 403, data: { error: "Sign in to Prismal Planning to change an entry that's already on your calendar." } });
    },
    remove: (id) => (id.startsWith(WAITING)
      ? ask("unqueue", { id: Number(id.slice(WAITING.length)) })
      : Promise.resolve({ ok: false, status: 403, data: { error: "Sign in to Prismal Planning to delete an entry that's already on your calendar." } })),
    // A linked Calendar Fractal of the icon's budget (a calendar shared from elsewhere), read by the API with the key: its
    // calendar file, or a problem to show (one the server named waits, like Home's: Calendars.CalendarReadError)
    async readLinked(id) {
      const result = await window.Fractals.call("/api/quickcal/linked", { key, id });
      if (result.ok && result.data && typeof result.data.text === "string") return result.data.text;
      const words = window.Fractals.problem(result, "Couldn't read that calendar just now.");
      throw new window.Calendars.CalendarReadError(words, result.status >= 400 && result.status < 500 && result.status !== 429);
    }
  });

  // Meals: one added here waits (the API's fractal_waiting) like a calendar entry, and can be changed or deleted here until
  // it joins the budget; the budget's own only show. What's sent is checked the way the budget will check it.
  window.KitchenUI.useStore({
    locked: (meal) => !window.Kitchen.isWaiting(meal),
    async save(fields, options, meal) {
      let checked;
      try {
        checked = window.Kitchen.checkMeal(fields);
      } catch (error) {
        return { ok: false, message: error.message };
      }
      const shown = window.Kitchen.mealView(checked);
      const sent = { title: shown.title, start: checked.start, repeat: checked.repeat || null, until: checked.until || null, foods: shown.foods, notes: shown.notes, recipe: checked.recipe || null };
      const result = meal ? await ask("mealchange", { id: meal.waiting, meal: sent }) : nearWaiting(await ask("meal", { meal: sent }));
      if (!result.ok || !result.data) return { ok: false, message: window.Fractals.problem(result, "Couldn't save it. Please try again.") };
      if (Array.isArray(result.data.fractals)) window.Fractals.took(result.data);
      if (result.data.error) return { ok: false, message: result.data.error };
      return { ok: true, toast: `${meal ? "Saved" : "Added"} ${shown.title}. It joins your calendar the next time Prismal Planning opens.` };
    },
    async remove(meal) {
      const result = await ask("unqueue", { id: meal.waiting });
      if (!result.ok || !result.data) return { ok: false, message: window.Fractals.problem(result, "Couldn't delete it. Please try again.") };
      if (Array.isArray(result.data.fractals)) window.Fractals.took(result.data);
      return result.data.error ? { ok: false, message: result.data.error } : { ok: true };
    }
  });

  // Move the calendar so a day is in its first week (kept inside its range). A zoomed day closes first.
  function moveCalendar(date) {
    const anchor = date < range.first ? range.first : date > range.last ? range.last : createSafeMidnight(date);
    const latest = addDays(range.last, -(CALENDAR_DAYS - 1));
    const start = addDays(anchor, -anchor.getDay());
    viewAnchor = anchor;
    viewStart = start > latest ? latest : start;
    if (activeEditCell) closeZoomedDay(true);
    renderCalendar();
  }

  // Draw the five weeks showing: each day's date and its calendar entries (fillGuestDay in Process Budget.js draws a day
  // with no budget lines the same way Home does), the header's month and year, and how many entries are waiting
  function renderCalendar() {
    window.Fractals.prepare(formatToYMD(viewStart), formatToYMD(addDays(viewStart, CALENDAR_DAYS - 1)));
    document.querySelectorAll(".elastic-table:not(.guestDays) td").forEach((td, index) => {
      const date = addDays(viewStart, index);
      fillGuestDay(td, { date, text: formatToMMDD(date), kind: "blank" });
    });
    document.getElementById("calendarMonth").value = String(viewAnchor.getMonth());
    document.getElementById("calendarYear").value = String(viewAnchor.getFullYear());
    document.getElementById("calendarPrev").disabled = new Date(viewAnchor.getFullYear(), viewAnchor.getMonth(), 0) < range.first;
    document.getElementById("calendarNext").disabled = new Date(viewAnchor.getFullYear(), viewAnchor.getMonth() + 1, 1) > range.last;
    document.getElementById("calendarToday").classList.toggle("isCurrent", viewStart.getTime() === addDays(today, -today.getDay()).getTime());
    const waiting = window.Fractals.data().events.filter(event => event.waiting).length + window.Kitchen.data().meals.filter(window.Kitchen.isWaiting).length;
    const note = document.getElementById("waitingNote");
    note.hidden = waiting === 0;
    note.textContent = `${waiting} ${waiting === 1 ? "entry is" : "entries are"} waiting to join your calendar (the ${waiting === 1 ? "one" : "ones"} with a dashed edge). ${waiting === 1 ? "It joins" : "They join"} the next time Prismal Planning opens on the device that made this icon. Tap one to change it or delete it.`;
  }

  // The header: Calendar Fractals, Today, the month (a list) with its ‹ and ›, and the year (like Home's)
  function wireHeader() {
    window.Fractals.wirePicker(document.getElementById("fractalPicker"));
    const stepMonth = (step) => moveCalendar(new Date(viewAnchor.getFullYear(), viewAnchor.getMonth() + step, 1));
    document.getElementById("calendarPrev").addEventListener("click", () => stepMonth(-1));
    document.getElementById("calendarNext").addEventListener("click", () => stepMonth(1));
    document.getElementById("calendarToday").addEventListener("click", () => moveCalendar(today));
    const month = document.getElementById("calendarMonth");
    MONTHS.forEach((name, index) => month.appendChild(new Option(name, String(index))));
    month.addEventListener("change", () => moveCalendar(new Date(viewAnchor.getFullYear(), Number(month.value), 1)));
    const year = document.getElementById("calendarYear");
    for (let y = range.first.getFullYear(); y <= range.last.getFullYear(); y++) year.appendChild(new Option(String(y), String(y)));
    year.addEventListener("change", () => {
      const lastDay = new Date(Number(year.value), viewAnchor.getMonth() + 1, 0).getDate();
      moveCalendar(new Date(Number(year.value), viewAnchor.getMonth(), Math.min(viewAnchor.getDate(), lastDay)));
    });
    document.getElementById("addEventButton").addEventListener("click", (event) => window.Fractals.openNewEvent(event.currentTarget, { date: today }));
    // While a date box is waiting, tapping a day fills it in instead of zooming the day (like on Home)
    document.querySelector(".elastic-table").addEventListener("click", (event) => {
      if (!BudgetUI.datePickActive()) return;
      const td = event.target.closest("td");
      const time = td ? dayTime(td) : null;
      if (time === null) return;
      event.stopPropagation();
      event.preventDefault();
      BudgetUI.pickDate(new Date(time), td);
    }, true);
  }

  // The calendar's entries or the fractals checked changed: the days draw again (a zoomed one too, at its new size)
  document.addEventListener("fractals:changed", () => {
    if (!window.Fractals.data()) return;
    renderCalendar();
    if (activeEditCell) refitZoomedDay();
  });

  // Coming back to the page shows what changed on the calendar meanwhile (and which waiting entries joined it), and reads
  // the linked calendars again when it's been 15 minutes
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && window.Fractals.data()) window.Fractals.load(true).then(() => window.Fractals.readLinked());
  });

  // Start: the key checks out (its calendar shows), or the page says why not
  (async () => {
    if (!/^[A-Za-z0-9_-]{43}$/.test(key)) {
      status.textContent = "This page opens from a Quick Calendar icon. Sign in, then use the Quick Calendar button on Home to make one.";
      return;
    }
    const result = await ask("check");
    if (!result.ok || !result.data || !Array.isArray(result.data.fractals)) {
      status.textContent = result.status === 401 || result.status === 429
        ? `${window.Fractals.problem(result, "This Quick Calendar link doesn't work anymore.")} Sign in, then use the Quick Calendar button on Home to make a new icon.`
        : "Couldn't reach the server. Check your connection, then open this page again.";
      return;
    }
    window.Fractals.took(result.data);
    // (Its budget's linked Calendar Fractals: calendars shared from elsewhere, read through the key)
    window.Fractals.readLinked();
    status.hidden = true;
    // This icon's own look (a calendar until another is picked), in the links a phone reads when the page is added to its
    // home screen, and its Customize button
    window.QuickIcon?.wirePage({ kind: "calendar", look: result.data.look, send: (look) => window.Fractals.call("/api/quickcal/look", { key, look }) });
    document.getElementById("quickCalendarControls").hidden = false;
    document.getElementById("calendarCard").hidden = false;
    // (This device used the icon: on Home here, what it adds joins the calendar by itself)
    window.Fractals.rememberIcon(key);
    wireHeader();
    renderCalendar();
  })();
})();
