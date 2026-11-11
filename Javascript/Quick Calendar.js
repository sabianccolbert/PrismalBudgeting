// Quick Calendar: the page a home screen icon opens (/quickcal.html?key=...), with no login. The key in its link (made
// by Home's Quick Calendar button, while signed in) reads the account's calendar and adds entries to it; it never sees
// the budget. An entry added here waits (the API's fractal_waiting) until Prismal Planning opens on the device that made
// the icon, where it joins the calendar by itself, or until someone adds it from Home's card on another device. Until
// then it shows here with a dashed edge, and can be changed or deleted here. Entries already on the calendar only show.
// The page borrows the day zooming from Process Budget.js (which loads no budget here) and the calendar from Fractals.js.

(() => {
  "use strict";

  const params = new URLSearchParams(location.search);
  const key = params.get("key") || "";
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const WAITING = "waiting:"; // How a waiting entry's id starts here (the calendar's own ids never do)
  const status = document.getElementById("dataStatus");
  // The calendar goes from the Sunday a year before today through the Saturday five years after it
  const yearAgo = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
  const fiveYears = new Date(today.getFullYear() + 5, today.getMonth(), today.getDate());
  const range = { first: addDays(yearAgo, -yearAgo.getDay()), last: addDays(fiveYears, 6 - fiveYears.getDay()) };
  let viewAnchor = today;
  let viewStart = addDays(today, -today.getDay());

  // Just set up from Home: show how to add it to the home screen, and drop setup=1 from the address (so the icon's link
  // is only the page and its key)
  if (key && params.has("setup")) {
    document.getElementById("setupCard").hidden = false;
    history.replaceState(null, "", `${location.pathname}?key=${encodeURIComponent(key)}`);
  }

  // One request with the key: { ok, status, data }, where data is the calendar as Fractals.js takes it (the entries this
  // icon added that are still waiting shown with the rest, each marked waiting)
  async function ask(route, body = {}) {
    const result = await window.Fractals.call(`/api/quickcal/${route}`, { key, ...body });
    if (!result.ok || !result.data || !Array.isArray(result.data.fractals)) return result;
    const answer = result.data;
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

  // The calendar is read and added to with the key: a new entry waits, a waiting one can be changed or deleted, and
  // the ones already on the calendar stay as they are
  window.Fractals.useStore({
    quick: true,
    load: () => ask("check"),
    save: (id, fractal, event) => {
      if (!id) return ask("entry", { fractal, event });
      if (id.startsWith(WAITING)) return ask("change", { id: Number(id.slice(WAITING.length)), fractal, event });
      return Promise.resolve({ ok: false, status: 403, data: { error: "Sign in to Prismal Planning to change an entry that's already on your calendar." } });
    },
    remove: (id) => (id.startsWith(WAITING)
      ? ask("unqueue", { id: Number(id.slice(WAITING.length)) })
      : Promise.resolve({ ok: false, status: 403, data: { error: "Sign in to Prismal Planning to delete an entry that's already on your calendar." } }))
  });

  // Move the calendar so a day is in its first week (kept inside its range). A zoomed day closes first.
  function moveCalendar(date) {
    const anchor = date < range.first ? range.first : date > range.last ? range.last : createSafeMidnight(date);
    const latest = addDays(range.last, -27);
    const start = addDays(anchor, -anchor.getDay());
    viewAnchor = anchor;
    viewStart = start > latest ? latest : start;
    if (activeEditCell) closeZoomedDay(true);
    renderCalendar();
  }

  // Draw the four weeks showing: each day's date and its calendar entries (fillGuestDay in Process Budget.js draws a day
  // with no budget lines the same way Home does), the header's month and year, and how many entries are waiting
  function renderCalendar() {
    window.Fractals.prepare(formatToYMD(viewStart), formatToYMD(addDays(viewStart, 27)));
    document.querySelectorAll(".elastic-table:not(.guestDays) td").forEach((td, index) => {
      const date = addDays(viewStart, index);
      fillGuestDay(td, { date, text: formatToMMDD(date), kind: "blank" });
    });
    document.getElementById("calendarMonth").textContent = MONTHS[viewAnchor.getMonth()];
    document.getElementById("calendarYear").value = String(viewAnchor.getFullYear());
    document.getElementById("calendarPrev").disabled = new Date(viewAnchor.getFullYear(), viewAnchor.getMonth(), 0) < range.first;
    document.getElementById("calendarNext").disabled = new Date(viewAnchor.getFullYear(), viewAnchor.getMonth() + 1, 1) > range.last;
    document.getElementById("calendarToday").classList.toggle("isCurrent", viewStart.getTime() === addDays(today, -today.getDay()).getTime());
    const waiting = window.Fractals.data().events.filter(event => event.waiting).length;
    const note = document.getElementById("waitingNote");
    note.hidden = waiting === 0;
    note.textContent = `${waiting} ${waiting === 1 ? "entry is" : "entries are"} waiting to join your calendar (the ${waiting === 1 ? "one" : "ones"} with a dashed edge). ${waiting === 1 ? "It joins" : "They join"} the next time Prismal Planning opens on the device that made this icon. Tap one to change it or delete it.`;
  }

  // The header: Calendar Fractals, Today, the month's ‹ and ›, the year, and the date box with its calendar button
  function wireHeader() {
    window.Fractals.wirePicker(document.getElementById("fractalPicker"));
    const stepMonth = (step) => moveCalendar(new Date(viewAnchor.getFullYear(), viewAnchor.getMonth() + step, 1));
    document.getElementById("calendarPrev").addEventListener("click", () => stepMonth(-1));
    document.getElementById("calendarNext").addEventListener("click", () => stepMonth(1));
    const jump = document.getElementById("calendarJump");
    document.getElementById("calendarToday").addEventListener("click", () => {
      jump.value = "";
      moveCalendar(today);
    });
    const year = document.getElementById("calendarYear");
    for (let y = range.first.getFullYear(); y <= range.last.getFullYear(); y++) year.appendChild(new Option(String(y), String(y)));
    year.addEventListener("change", () => {
      const lastDay = new Date(Number(year.value), viewAnchor.getMonth() + 1, 0).getDate();
      moveCalendar(new Date(Number(year.value), viewAnchor.getMonth(), Math.min(viewAnchor.getDate(), lastDay)));
    });
    jump.placeholder = datePattern();
    jump.translate = false;
    jump.after(BudgetUI.datePickerButton(jump, "date to go to", { min: range.first, max: range.last }));
    const goToTyped = () => {
      if (!jump.value.trim()) return;
      const typed = parseTypedDate(jump.value);
      if (isNaN(typed.getTime())) return BudgetUI.showToast("That isn't a date. Type one like the box shows, or use the calendar button.", true);
      moveCalendar(typed);
    };
    jump.addEventListener("change", goToTyped);
    jump.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      goToTyped();
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

  // Coming back to the page shows what changed on the calendar meanwhile (and which waiting entries joined it)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && window.Fractals.data()) window.Fractals.load(true);
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
    status.hidden = true;
    document.getElementById("quickCalendarControls").hidden = false;
    document.getElementById("calendarCard").hidden = false;
    // (This device used the icon: on Home here, what it adds joins the calendar by itself)
    window.Fractals.rememberIcon(key);
    wireHeader();
    renderCalendar();
  })();
})();
