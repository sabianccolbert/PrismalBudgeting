// Snapshot Page: the Snapshot page (snapshot.html, the header's Snapshot button): cards picked from across the site, in the
// order they're put in, side by side on a wide screen and one under another on a narrow one. Edit adds cards (a + at the
// top and one after the last card open what can go on it: each part of the site, most with more inside, down to a raw
// number like In Bank), drags them into order by their ≡, and takes them off with ×. The cards are kept with the budget
// (accountsData.snapshot: see The Snapshot page in Process Budget.js), so every device shows the same page; it starts
// with a few. Each card works its figures out the way the page it comes from does (Bob Page.js's cards, Data, tracker,
// and graphs; Line Graph.js; Fractals.js; Process Budget.js), and the page draws again with every change to the budget.
// Add To Home Screen makes a no-login icon of the page (after saying who can see it), or shows how to put the page on a
// phone's home screen as it is, with the login. Opened with an icon's key (window.SNAPSHOT_KEY), the page only shows its
// cards: nothing on it changes the budget.

(function snapshotPage() {
  "use strict";

  // =====================================================================
  // #region SETUP
  // =====================================================================

  // The cards it starts with, until it's changed
  const START = [
    { id: "start1", type: "home.inBank", ref: "" },
    { id: "start2", type: "home.lowest", ref: "" },
    { id: "start3", type: "home.upcoming", ref: "" },
    { id: "start4", type: "graph.inBank", ref: "" }
  ];
  const LIST_MOST = 8; // The most lines a list card shows

  const el = (tag, className = "", text = "") => BudgetUI.element(tag, className, text);
  let editing = false;
  let shared = null; // What more than one card works from (Bob Page.js sharedFigures), once per drawing
  let saving = false;

  // The cards as kept (or the ones it starts with)
  const cards = () => (Array.isArray(accountsData?.snapshot?.cards) ? accountsData.snapshot.cards : START);

  // (An icon whose key stopped working: turned off in Settings, a new password, or its budget gone)
  let keyGone = null;
  document.addEventListener("snapshot:gone", (event) => {
    keyGone = event.detail.gone
      ? "The budget this icon shows was deleted, or isn't shared with you anymore."
      : "This Snapshot icon doesn't work anymore: it was turned off in Settings, or the password changed. Log in to Prismal Planning and make a new one from Snapshot.";
    const status = document.getElementById("dataStatus");
    if (status) status.textContent = keyGone;
  });

  window.workspaceReady.then((loaded) => {
    const status = document.getElementById("dataStatus");
    if (!loaded) {
      if (status) status.textContent = keyGone || "Couldn't load your budget data. Please refresh to try again.";
      return;
    }
    if (status) status.hidden = true;
    if (window.SNAPSHOT_KEY) {
      startKeyed();
    } else {
      document.getElementById("snapshotEdit").addEventListener("click", () => {
        editing = !editing;
        draw();
      });
      document.getElementById("snapshotHomeScreen").addEventListener("click", (event) => openHomeScreenSetup(event.currentTarget));
    }
    draw();
    // (Once the calendar is in, its cards draw again: fractals:changed, below)
    if (window.Fractals && !window.SNAPSHOT_KEY) window.Fractals.load();
  });

  // How to put the page on a home screen (with the login, or an icon's, just made)
  function showHomeScreenSteps() {
    const homeCard = document.getElementById("homeScreenCard");
    homeCard.hidden = false;
    document.getElementById("snapshotHomeScreen").setAttribute("aria-expanded", "true");
    homeCard.scrollIntoView({ block: "nearest", behavior: window.lessMotion() ? "auto" : "smooth" });
  }

  // Add To Home Screen: how the icon looks first (Quick Icon.js's Customize window, starting from Snapshot's own), then what
  // a no-login icon means (anyone with it sees this budget's Snapshot), then its key with that look, and the page opened
  // with it, showing how to add it. Or Keep The Login: the steps for the page as it is, with that look in its icon links.
  function openHomeScreenSetup(origin) {
    QuickIcon.openEditor({
      origin,
      kind: "snapshot",
      title: "Snapshot Icon",
      saveLabel: "Next",
      intro: "First, how the icon looks on your home screen. Tap Next to keep this one, or pick its picture and colors. A no-login icon's own page has Customize at the bottom to change it later.",
      onSave: (look) => {
        showHomeScreenChoice(origin, look);
        return { ok: true, keepOpen: true }; // (The next window takes this one's place)
      }
    });
  }

  // Its second window: what a no-login icon means, then Make A No-Login Icon (its key, with that look) or Keep The Login
  function showHomeScreenChoice(origin, look) {
    BudgetUI.openPanel({
      origin,
      size: "large",
      title: "Snapshot Icon",
      build(form, panel) {
        const text = (line) => el("p", "panelText", line);
        const whose = budgetInfo?.name ? `${budgetInfo.name}'s` : "this budget's";
        form.append(
          text("Put an icon on your phone's home screen that opens this Snapshot, with no login needed."),
          text(`It shows ${whose} Snapshot, and it can read everything your cards are worked out from: the budget's entries, recurring entries, Upcoming entries, History, tracker, Equity accounts, goals, and calculators. It can't change anything, and it never reads your Change Logs, notes, Calendar Fractals, or the links of your connected spreadsheets and calendars.`),
          text("Anyone holding the phone, or anyone its link reaches, can see your budget this way, so only make one on a phone you keep locked, and never send its link to anyone."),
          text("Settings turns Snapshot icons off whenever you like, and so do a new password and Sign Out Everywhere. Keep The Login puts this page on your home screen with your login instead."),
          BudgetUI.buttonRow([
            { label: "Make A No-Login Icon", kind: "primary", type: "submit" },
            { label: "Keep The Login", onClick: () => { panel.close(); QuickIcon.apply(look.picture); showHomeScreenSteps(); } },
            { label: "Cancel", onClick: () => panel.close() }
          ])
        );
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          panel.setError("");
          panel.setBusy(true);
          const result = await budgetApi("/api/snapshot/key", { look });
          if (!result.ok || !result.data || !result.data.key) {
            panel.setBusy(false);
            panel.setError(result.status === 0 ? "Couldn't reach the server. Please try again." : "Couldn't make the icon. Please try again.");
            return;
          }
          Limits.nearNext("snapshotIcons", result.data.icons);
          const url = `/snapshot.html?key=${encodeURIComponent(result.data.key)}&setup=1`;
          if (typeof window.transitionTo === "function") window.transitionTo(url);
          else window.location.href = url;
        });
      }
    });
  }

  // The page opened with an icon's key: only its cards, no Edit, and which budget they're from. Just made (setup=1), it
  // shows how to add it to the home screen, and setup=1 comes off the address, so the icon's link is only the page, its
  // key, and this device's theme (a phone's home screen app can keep its own storage, and starts from this link).
  function startKeyed() {
    document.getElementById("snapshotEdit").hidden = true;
    document.getElementById("snapshotHomeScreen").hidden = true;
    document.getElementById("snapshotKeyNote").hidden = false;
    document.getElementById("snapshotKeyBudget").textContent = budgetInfo?.name || "your budget";
    // This icon's own look, in the links a phone reads when the page is added to its home screen, and its Customize button
    window.QuickIcon?.wirePage({
      kind: "snapshot",
      look: window.snapshotLook,
      send: async (look) => {
        try {
          const response = await fetch(`${window.API_BASE_URL}/api/snapshotkey/look`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: window.SNAPSHOT_KEY, look }) });
          let data = null;
          try { data = await response.json(); } catch (e) {}
          return { ok: response.ok, status: response.status, data };
        } catch (e) {
          return { ok: false, status: 0, data: null };
        }
      }
    });
    if (new URLSearchParams(location.search).has("setup")) {
      document.getElementById("homeScreenLogin").hidden = true;
      document.getElementById("homeScreenKeyed").hidden = false;
      showHomeScreenSteps();
      const look = window.Themes ? Themes.lookQuery() : "";
      history.replaceState(null, "", `${location.pathname}?key=${encodeURIComponent(window.SNAPSHOT_KEY)}${look ? `&${look}` : ""}`);
    }
  }

  document.addEventListener("budget:updated", () => {
    if (workspaceLoaded) draw();
  });
  // (Only the calendar's own cards show it, so only they're drawn again)
  document.addEventListener("fractals:changed", () => {
    if (!workspaceLoaded) return;
    const list = cards();
    list.forEach((card, index) => {
      if (card.type.startsWith("calendar.") && built.has(card.id)) cardEl(card, index, list);
    });
  });
  // (New From and To days in the Tracker window: Data's Tracker row and the tracker cards follow them)
  document.addEventListener("tracker:range", () => {
    if (workspaceLoaded) draw();
  });

  //#endregion

  // =====================================================================
  // #region WHAT A CARD CAN BE
  // =====================================================================
  // Each kind of card: title(ref) (its name), and render(body, ref) (draws it in the card's body). One whose account, goal,
  // gem, or row is gone throws Gone, and says so in its card.

  class Gone extends Error {}

  // A number, big, with a note under it (red below $0). open: what tapping its More opens (given the button).
  function numberBody(body, value, note = "", { amount = null, open = null } = {}) {
    const figure = BudgetUI.noTranslate(el("p", "snapshotNumber", value));
    if (amount !== null && amount < 0) figure.classList.add("negative");
    body.append(figure);
    if (note) body.append(BudgetUI.noTranslate(el("p", "snapshotNote", note)));
    if (open) {
      const more = el("button", "budgetButton snapshotMore", "More ›");
      more.type = "button";
      more.addEventListener("click", () => open(more));
      body.append(more);
    }
  }

  // Lines, each with its words at the left and its figure at the right: [{ text, figure, amount }]
  function listBody(body, items, empty) {
    if (items.length === 0) return body.append(el("p", "panelHint", empty));
    const list = el("ul", "snapshotList");
    for (const item of items.slice(0, LIST_MOST)) {
      const row = el("li");
      row.append(BudgetUI.noTranslate(el("span", "snapshotListText", item.text)));
      if (item.figure) {
        const figure = BudgetUI.noTranslate(el("span", "snapshotListFigure", item.figure));
        if (typeof item.amount === "number") figure.classList.add(item.amount < 0 ? "negative" : "positive");
        row.append(figure);
      }
      list.append(row);
    }
    body.append(list);
    if (items.length > LIST_MOST) body.append(el("p", "panelHint", `And ${items.length - LIST_MOST} more.`));
  }

  // A day's entries, as list lines (its budget lines, without In Bank, Gains, and Costs)
  function entryItems(text) {
    return String(text ?? "").split("\n").slice(1).map(line => readLine(line)).filter(line => !line.blank && !line.system && line.title)
      .map(line => ({ text: `${line.sprite} ${line.title}`, figure: formatMoney(line.amount), amount: line.amount }));
  }

  // A Bob card (Bob Page.js CARDS), drawn the way his page draws it, with what it keeps (like its date boxes) over it. Like
  // on his page, it's made once (keep.card), and what it shows is drawn again with every change, so a day picked in it stays.
  // A Wavelength Planning card's days are its own on each device (waveKey: by its id on this page, see WAVELENGTH DAYS).
  function bobCardType(id) {
    return {
      keeps: true,
      title: () => (CARDS.find(def => def.id === id) || {}).title || "Bob",
      render(body, ref, keep, cardId) {
        const def = CARDS.find(item => item.id === id);
        if (!def) throw new Gone();
        if (!keep.card) {
          const card = { def, el: body, toggle: null, state: null, warning: null, body, results: el("div", "sectionResults"), highlight: null, waveKey: `snapshot:${cardId}` };
          const controls = def.setup ? def.setup(card) : null;
          keep.card = card;
          body.replaceChildren(...[controls, card.results].filter(Boolean));
        }
        def.render(keep.card, shared);
      }
    };
  }

  // A graph (Line Graph.js) from one of Bob's (make: makes it), its title left to the card. It's made once and drawn again
  // with every change (keep.graph), so its days and the way each line is drawn stay, unless key(ref) says it's become a
  // different one (like a tracker row that moved). cache false: made again every time (a graph that works its lines out
  // only once).
  function graphType(title, make, { cache = true, key = () => "" } = {}) {
    return {
      keeps: true,
      title: (ref) => (typeof title === "function" ? title(ref) : title),
      render(body, ref, keep, id) {
        const now = key(ref, id);
        if (cache && keep.graph && keep.key === now) {
          keep.graph.draw();
          if (keep.graph.el.parentNode !== body) body.replaceChildren(keep.graph.el);
          return;
        }
        const graph = make(ref, id);
        if (!graph) throw new Gone();
        keep.graph = graph;
        keep.key = now;
        body.replaceChildren(graph.el); // (It draws itself, and again once it has a width)
      }
    };
  }

  // The tracker row with this title (as kept: "⭕️Food" is the one that counts transfers), or -1
  const trackerIndexOf = (title) => trackerData.findIndex((row, index) => index > 0 && !isSeparatorRow(row) && String(row[0]).trim() === title);
  // A tracker card's own days on this device (Bob Page.js trackerDays), by the card's id
  const trackerDaysKey = (id) => `snapshot:${id}`;
  const TRACKER_CARDS = ["tracker.row", "graph.tracker"];

  // A single wavelength's card: whether its wavelength is still there (by its id, "none" for Undefined), its name, and
  // the card Bob Page.js's days work with (kept with the card between drawings: its own days on this device, and a redraw)
  const waveKnown = (id) => id === "none" || wavelengthList().some(wave => wave.id === id);
  const waveTitle = (id) => (id === "none" ? "Undefined" : waveKnown(id) ? wavelengthName(id) : "A Wavelength");
  function waveCardOf(keep, id) {
    if (!keep.waveCard) keep.waveCard = { waveKey: `snapshot:${id}`, redraw: () => draw() };
    keep.waveCard.waveDays = waveDaysOf(keep.waveCard.waveKey);
    return keep.waveCard;
  }

  // A single recurring entry's card: its ref ([title, type] as JSON) read, and its row now (by its title and type), or null
  const RECURRING_NEXT_DAYS = 366; // How far ahead its card looks for the next day it lands
  function readRecurringRef(ref) {
    try {
      const parts = JSON.parse(ref);
      return Array.isArray(parts) && typeof parts[0] === "string" && typeof parts[1] === "string" ? parts : null;
    } catch {
      return null;
    }
  }
  function recurringOf(ref) {
    const parts = readRecurringRef(ref);
    if (!parts) return null;
    return getParsedRecurringRows().find(row => cleanString(row.title) === cleanString(parts[0]) && baseSprite(row.sprite) === baseSprite(parts[1])) || null;
  }
  // The goal a card is for: its place and its name ("2:Savings"), found at its place, or by its name if it moved
  function goalFor(ref) {
    const goals = accountsData?.goals || [];
    const [place, ...rest] = String(ref).split(":");
    const name = rest.join(":");
    const index = Number(place);
    if (goals[index] && goalName(goals[index]) === name) return { goal: goals[index], index };
    const found = goals.findIndex(goal => goalName(goal) === name);
    return found === -1 ? null : { goal: goals[found], index: found };
  }
  const gemFor = (id) => calculatorStore("gems").find(gem => gem.id === id) || null;
  const crystalFor = (id) => calculatorStore("crystals").find(crystal => crystal.id === id) || null;
  const presetName = (preset, describe) => preset.name || describe(preset.values).join(", ") || "One without a name";

  // A gem as the Accrual Calculator works it out: { balance (signed), interest, payment, frequency, saves, target, source }
  function gemPlan(gem) {
    const values = gem.values;
    const saves = gemSaves(values);
    let balance = saves ? values.balance ?? 0 : -(values.owed ?? 0);
    let interest = typeof values.rate === "number" && values.rate > 0 ? { rate: values.rate, compound: values.compound || "monthly", every: values.every || 1, day: values.day || today.getDate() } : null;
    let source = "";
    if (values.inBank) {
      const spot = calendarSpot(today);
      balance = (spot && readInBank(calendarData[spot.r][spot.c])) ?? 0;
      source = "In Bank";
    } else if (values.account) {
      const summary = accountSummaries().find(item => cleanString(item.name) === cleanString(values.account));
      if (!summary) throw new Gone();
      balance = summary.today;
      interest = summary.interest ? { rate: summary.interest.rate, compound: summary.interest.compound, every: summary.interest.every, day: summary.interest.day, debt: summary.interest.debt } : null;
      source = summary.name;
    }
    const frequency = values.frequency in PAYMENT_FREQUENCIES ? values.frequency : "monthly";
    const apart = PAYMENT_FREQUENCIES[frequency];
    return {
      balance, interest, saves, source, frequency,
      payment: Math.round(((values.payment || 0) + (values.extra || 0)) * 100) / 100,
      first: apart ? addDays(today, apart) : addMonths(today, 1),
      target: saves ? (typeof values.target === "number" ? values.target : null) : 0
    };
  }

  // Bob's Data rows (Bob Page.js dataFigures), once per drawing
  let figures = null;
  const dataRows = () => figures || (figures = dataFigures(shared));

  const TYPES = {
    // Home's figures
    "home.inBank": {
      title: () => "In Bank Today",
      render(body) {
        const amount = inBankToday();
        numberBody(body, formatMoney(amount), showWeekdayDate(today), { amount, open: (origin) => openGraphWindow(origin, "In Bank", "In Bank at the end of each day, from History and the calendar. Pick a later day to see what your budget expects.", inBankGraph("In Bank Over Time")) });
      }
    },
    "home.lowest": {
      title: () => "Lowest In Bank After Today",
      // (Its own until, picked in Edit, kept as its ref: or as far as this device's Lowest looks)
      render(body, ref) {
        const ahead = snapshotUntil(ref);
        const lowest = ahead ? lowestThrough(lookAheadEnd(ahead)) : shared.lowest();
        numberBody(body, formatMoney(lowest.amount), `On ${showWeekdayDate(lowest.date)}${ahead ? `, looking ${lookAheadWords(ahead)} past the calendar` : ""}`, { amount: lowest.amount });
      }
    },
    "home.lastDay": {
      title: () => "In Bank At The Last Day Ahead",
      render(body) {
        const last = predictedInBank[predictedInBank.length - 1];
        if (!last) return body.append(el("p", "panelHint", "Nothing worked out past the calendar yet."));
        numberBody(body, formatMoney(last[1]), `On ${showWeekdayDate(last[0])}, the last day Lowest looks at (${lookAheadWords()} past the calendar)`, { amount: last[1] });
      }
    },
    "home.today": {
      title: () => "Today's Entries",
      render(body) {
        const spot = calendarSpot(today);
        listBody(body, spot ? entryItems(calendarData[spot.r][spot.c]) : [], "Nothing on today yet.");
      }
    },
    "home.upcoming": {
      title: () => "Upcoming",
      render(body) {
        const rows = (futureData || []).slice(1).map(row => ({ date: createSafeMidnight(String(row[2] ?? ""), true), line: readLine(`${row[3] || "❗️"} ${row[1]} ${row[0]}`), title: String(row[0] ?? "").trim() }))
          .filter(row => row.title && !isNaN(row.date.getTime())).sort((a, b) => a.date - b.date);
        listBody(body, rows.map(row => ({ text: `${showDay(row.date)} ${row.line.sprite} ${row.title}`, figure: formatMoney(row.line.amount), amount: row.line.amount })), "Nothing scheduled past the calendar.");
      }
    },
    "home.bob": {
      title: () => "Bob Says",
      render(body) {
        body.append(el("p", "snapshotText", bobMessage || "Nothing to say yet."));
      }
    },

    // Bob's page
    "bob.highlights": {
      title: () => "Bob's Highlights",
      render(body) {
        const items = [];
        for (const def of CARDS) {
          if (!bobCardOn(def.id) || def.id === "spectrum") continue;
          const card = { def, el: el("section"), toggle: null, state: null, warning: null, body: el("div"), results: el("div"), highlight: null };
          try {
            if (def.setup) def.setup(card);
            const highlight = def.render(card, shared);
            if (highlight) items.push({ title: def.title, ...highlight });
          } catch (error) {
            console.error(`Bob's ${def.title} card couldn't be worked out:`, error);
          }
        }
        const list = el("ul", "bobHighlights");
        for (const item of items) {
          const line = el("li", item.warn ? "bobHighlight isWarning" : "bobHighlight");
          line.append(el("strong", "", `${item.title}: `), item.text);
          list.append(line);
        }
        body.append(items.length > 0 ? list : el("p", "panelHint", "Turn on Bob's cards on his page to see what they have to say."));
      }
    },
    "bob.goal": {
      title: (ref) => goalFor(ref) ? `🎯 ${goalName(goalFor(ref).goal)}` : "A Goal",
      render(body, ref) {
        const found = goalFor(ref);
        if (!found) throw new Gone();
        const list = el("ul", "goalList");
        list.append(goalRow(found.goal, found.index, goalPlan(found.goal, shared)));
        body.append(list);
      }
    },
    "bob.data": {
      title: (ref) => (typeof DATA_RENAMED !== "undefined" && DATA_RENAMED[ref]) || ref,
      render(body, ref) {
        const label = typeof DATA_RENAMED !== "undefined" && DATA_RENAMED[ref] ? DATA_RENAMED[ref] : ref;
        const row = dataRows().find(item => item.label === label);
        if (!row) throw new Gone();
        numberBody(body, row.value, row.note, { amount: row.amount, open: row.open });
      }
    },
    // (Each tracker card adds up its own days on this device, picked in Edit: see trackerDaysKey)
    "tracker.row": {
      title: (ref) => ref,
      render(body, ref, keep, id) {
        const index = trackerIndexOf(ref);
        if (index === -1) throw new Gone();
        const key = trackerDaysKey(id);
        const { from, to } = trackerDays(key);
        const figure = trackerTotals(from, to).get(index) || { total: 0 };
        numberBody(body, formatMoney(figure.total), `From ${showDay(from)} through ${showDay(to)}`, { amount: figure.total, open: (origin) => openTrackerRowWindow(origin, index, key) });
      }
    },
    // One wavelength: what it came to in its own days on this device (like a Wavelength Planning card's: picked in Edit),
    // its share of everything on a wavelength, and its max (orange near it, red past it: Bob Page.js waveMaxStanding)
    "bob.wavelength": {
      title: (ref) => waveTitle(ref),
      render(body, ref, keep, id) {
        if (!waveKnown(ref)) throw new Gone();
        const card = waveCardOf(keep, id);
        const range = purposeRangeOf(card);
        const totals = purposeTotals(range.from, range.to);
        const sum = totals.slices.reduce((all, slice) => all + slice.total, 0);
        const standing = waveMaxStanding(ref, totals.slices.find(slice => slice.key === ref)?.total ?? 0, sum);
        numberBody(body, standing.amount, `${standing.share} of the spending on a wavelength, from ${showDay(range.from)} through ${showDay(range.to)}`, { open: (origin) => openPurposeWindow(origin, ref, card) });
        if (standing.level) body.querySelector(".snapshotNumber")?.classList.add(standing.level);
      }
    },
    // One recurring entry (ref: [its title, its type] as JSON): its amount, how often, and the next day it lands
    "recurring.entry": {
      title: (ref) => recurringOf(ref)?.title || readRecurringRef(ref)?.[0] || "A Recurring Entry",
      render(body, ref) {
        const row = recurringOf(ref);
        if (!row) throw new Gone();
        const next = recurringHitDays(row.parsed, today, addDays(today, RECURRING_NEXT_DAYS))[0];
        const amount = row.percent !== null ? `${row.percent < 0 ? "-" : ""}${showPercent(row.percent)}` : formatMoney(row.amt);
        const words = [describeFrequency(formatFrequency(row.parsed.frequency)), next ? `next on ${showDay(next)}` : "not in the next year"];
        numberBody(body, amount, words.join(", "), { amount: row.percent !== null ? row.percent : row.amt });
      }
    },
    // One Calendar Fractal's next 7 days (ref: its id)
    "calendar.fractal": {
      title: (ref) => `${(window.Fractals && window.Fractals.nameOf(ref)) || "A Calendar"}: The Next 7 Days`,
      render(body, ref) {
        calendarBody(body, today, addDays(today, 6), ref);
      }
    },
    "equity.total": {
      title: () => "Total",
      render(body) {
        const summaries = shared.summaries();
        const accounts = Math.round(summaries.reduce((sum, summary) => sum + summary.today, 0) * 100) / 100;
        const total = Math.round((inBankToday() + accounts) * 100) / 100;
        numberBody(body, formatMoney(total), `In Bank and every Equity account today (the accounts: ${formatMoney(accounts)})`, { amount: total, open: (origin) => openEquityWindow(origin) });
      }
    },
    "equity.account": {
      title: (ref) => ref,
      render(body, ref) {
        const summary = shared.summaries().find(item => cleanString(item.name) === cleanString(ref));
        if (!summary) throw new Gone();
        const later = addMonths(today, AHEAD_MONTHS);
        const then = shared.projection().accountOn(summary.index, later);
        const max = accountMax(accountsData.list[summary.index]);
        numberBody(body, `${formatMoney(summary.today)}${max ? `/${formatMoney(max)}` : ""}`, `On ${showDate(later)}: ${formatMoney(then)}`, { amount: summary.today, open: (origin) => openEquityWindow(origin) });
      }
    },
    "recurring.month": {
      title: () => "Recurring Entries Each Month",
      render(body) {
        const recurring = recurringEachMonth();
        numberBody(body, formatMoney(recurring.costs), `In bills, and ${formatMoney(recurring.gains)} in gains`, { amount: recurring.costs, open: (origin) => openRecurringWindow(origin, recurring) });
      }
    },
    "gem": {
      title: (ref) => (gemFor(ref) ? `💠 ${presetName(gemFor(ref), describeDebt)}` : "A Gem"),
      render(body, ref) {
        const gem = gemFor(ref);
        if (!gem) throw new Gone();
        const plan = gemPlan(gem);
        const each = `${formatMoney(plan.payment)} ${PAYMENT_CHOICES.find(choice => choice.value === plan.frequency).label.toLowerCase()}`;
        const from = plan.source ? `${plan.source}: ${formatMoney(plan.balance)} today` : `${formatMoney(plan.balance)} to start`;
        // (Worked out the way the Accrual Calculator works it out, so it's an estimate too: a bank's own figures can differ)
        if (plan.target === null) {
          const later = addMonths(today, 12);
          const grown = growTo({ balance: plan.balance, interest: plan.interest, payment: plan.payment, frequency: plan.frequency, first: plan.first, from: today, target: null, until: later });
          return numberBody(body, formatMoney(grown.balance), `In a year, with ${each} (${from}). An estimate.`, { amount: grown.balance });
        }
        if (plan.balance >= plan.target) return numberBody(body, plan.saves ? "Reached" : "Paid off", from);
        if (plan.payment <= 0 && !plan.interest) return numberBody(body, "--", `It keeps no ${plan.saves ? "deposit" : "payment"} (${from})`);
        const result = growTo({ balance: plan.balance, interest: plan.interest, payment: plan.payment, frequency: plan.frequency, first: plan.first, from: today, target: plan.target });
        numberBody(body, result.reached ? showDate(result.reached) : `Not in ${PAYOFF_YEARS} years`,
          `${plan.saves ? `Reaches ${formatMoney(plan.target)}` : "Paid off"}${result.reached ? ` in ${howLong(today, result.reached)}` : ""}, with ${each} (${from}). An estimate.`);
      }
    },
    "crystal": {
      title: (ref) => (crystalFor(ref) ? `💎 ${presetName(crystalFor(ref), describeCrystal)}` : "A Crystal"),
      render(body, ref) {
        const crystal = crystalFor(ref);
        if (!crystal) throw new Gone();
        const inputs = { ...readCalculatorInputs() };
        for (const [key, value] of Object.entries(crystal.values)) if (key in inputs && typeof value === "number") inputs[key] = value;
        const paycheck = computePaycheck(inputs);
        numberBody(body, formatMoney(paycheck.netPay), `Take home, from ${formatMoney(paycheck.grossPay)} gross and ${formatMoney(paycheck.totalTaxes)} in taxes (the Paycheck Calculator's other boxes as they are). An estimate.`, { amount: paycheck.netPay });
      }
    },
    "calendar.today": {
      title: () => "Today's Calendar",
      render(body) {
        calendarBody(body, today, today);
      }
    },
    "calendar.week": {
      title: () => "The Next 7 Days' Calendar",
      render(body) {
        calendarBody(body, today, addDays(today, 6));
      }
    },

    // Graphs
    "graph.inBank": graphType("In Bank Over Time", () => inBankGraph("In Bank Over Time")),
    "graph.equity": graphType("Equity Over Time", () => equityGraph()),
    "graph.goals": graphType("Goals Over Time", () => goalsGraph(accountsData?.goals || [])),
    "graph.spent": graphType("Spent Each Week", () => spentGraph()),
    "graph.paydays": graphType("Spent After Each Payday", () => paydaysGraph(shared.payday().span || 14)),
    "graph.recurring": graphType("Recurring Entries Each Month", () => recurringGraph()),
    "graph.wavelengths": graphType("Each Wavelength, Week By Week", () => wavelengthsGraph()),
    "graph.catchups": graphType("Catchup Entries, Added Up", () => runningGraph("Catchup Entries, Added Up", "Catchups", CATCHUP_DAYS, catchupsBetween, "None in these days.")),
    "graph.purchases": graphType("Purchases, Added Up", () => runningGraph("Purchases, Added Up", "Purchases", REFUND_DAYS, purchasesBetween, "None in these days.")),
    "graph.bills": graphType("Big Bills, Added Up", () => runningGraph("Big Bills, Added Up", "Big bills", 0, (first, until) => bigBills().filter(bill => bill.date >= first && bill.date <= until), `Pick a later day, up to ${BILL_DAYS} days from today, to see the bills ahead added up.`)),
    "graph.spectrum": graphType("Spectrum Graph", () => {
      const spectrum = spectrumGraph();
      spectrum.draw();
      return spectrum;
    }),
    "graph.wavelength": graphType((ref) => `${waveTitle(ref)}, Week By Week`, (ref) => (waveKnown(ref) ? wavelengthGraph(ref) : null), { key: (ref) => `${ref}|${waveTitle(ref)}` }),
    // (Made again when the row moves, since the graph works from its place in the tracker, and when its days are picked)
    "graph.tracker": graphType((ref) => `${ref}, Added Up`, (ref, id) => {
      const index = trackerIndexOf(ref);
      return index === -1 ? null : trackerGraph(index, ref, trackerDaysKey(id));
    }, { key: (ref, id) => { const days = trackerDays(trackerDaysKey(id)); return `${trackerIndexOf(ref)}|${days.from.getTime()}|${days.to.getTime()}`; } }),
    "graph.gem": graphType((ref) => (gemFor(ref) ? `${presetName(gemFor(ref), describeDebt)} Over Time` : "A Gem Over Time"), (ref) => {
      const gem = gemFor(ref);
      if (!gem) return null;
      const plan = gemPlan(gem);
      const until = addMonths(today, 12 * 5);
      const result = plan.target === null || plan.payment > 0 || plan.interest
        ? growTo({ balance: plan.balance, interest: plan.interest, payment: plan.payment, frequency: plan.frequency, first: plan.first, from: today, target: plan.target, until })
        : { schedule: [] };
      const points = [{ date: today, value: plan.balance }, ...result.schedule.map(row => ({ date: row.date, value: row.balance }))];
      return LineGraph.create({ label: "The Balance Over Time", pickDay: false, dashAhead: false, from: () => addDays(today, -1), series: () => [{ name: plan.saves ? "Balance" : "Balance (below $0 is owed)", points }], emptyNote: "Nothing to draw: it keeps no payment.", note: "An estimate, worked out like the Accrual Calculator's." });
    }, { cache: false }) // (Its line is worked out once, as it's made: so it's made again with every change)
  };
  // (Each of Bob's cards, Data and the Spectrum Graph too)
  for (const def of CARDS) TYPES[`bob.card.${def.id}`] = bobCardType(def.id);

  // A crystal's boxes, in words, for one without a name
  function describeCrystal(values) {
    return Object.entries(values).slice(0, 3).map(([key, value]) => {
      const field = CALCULATOR_INPUTS.find(item => item.key === key);
      return field ? `${field.label} ${field.unit && field.unit.startsWith("$") ? formatMoney(value) : value}` : "";
    }).filter(Boolean);
  }

  // The calendar's entries (Fractals.js) from one day through another, each day's under it
  function calendarBody(body, from, to, fractalId = null) {
    if (window.SNAPSHOT_KEY) return body.append(el("p", "panelHint", "Your calendar's entries show here when you're logged in (a no-login icon doesn't read your calendar)."));
    if (!window.Fractals || !window.Fractals.data()) return body.append(el("p", "panelHint", "Loading your calendar..."));
    if (fractalId && !window.Fractals.nameOf(fractalId)) throw new Gone();
    const items = [];
    for (let day = from; day <= to; day = addDays(day, 1)) {
      for (const part of window.Fractals.eventsOn(day)) {
        if (fractalId && part.event.fractal !== fractalId) continue;
        items.push({ text: `${from.getTime() === to.getTime() ? "" : `${showDay(day)} `}${window.Fractals.partWords(part, false)}: ${part.event.title}`, figure: "" });
      }
    }
    listBody(body, items, from.getTime() === to.getTime() ? "Nothing on your calendar today." : "Nothing on your calendar these days.");
  }

  //#endregion

  // =====================================================================
  // #region THE PAGE
  // =====================================================================

  // Every card, in order (in Edit: a + at the top, ≡ and × on each, and a + after the last)
  function draw() {
    const view = document.getElementById("snapshotView");
    if (!view || !accountsData) return;
    shared = sharedFigures();
    figures = null;
    const list = cards();
    document.getElementById("snapshotEdit").textContent = editing ? "Done" : "Edit";
    document.getElementById("snapshotEdit").classList.toggle("primary", editing);
    view.classList.toggle("isEditing", editing);
    const parts = [];
    if (editing) parts.push(addTile(0, "Add a card at the top"));
    list.forEach((card, index) => parts.push(cardEl(card, index, list)));
    if (editing || list.length === 0) parts.push(addTile(list.length, list.length === 0 ? "Add your first card" : "Add a card here"));
    view.replaceChildren(...parts);
    // (A card taken off is forgotten)
    for (const id of [...built.keys()]) if (!list.some(card => card.id === id)) built.delete(id);
    // (An icon's page has no Edit, so it never says to tap it)
    document.getElementById("snapshotStartNote").hidden = !!window.SNAPSHOT_KEY || Array.isArray(accountsData?.snapshot?.cards);
  }

  // Each card as it's drawn, by its id: { key (its type and which one), section, body, keep (what its kind keeps between
  // drawings: a graph, or a Bob card) }. A card is made once and drawn again with every change, so what's picked in it (a
  // graph's days, how its lines are drawn, a Bob card's boxes) stays.
  const built = new Map();

  // One card: its title (in Edit, with ≡ to drag it and × to take it off) and what it shows
  // A Lowest card's own until, as its ref keeps it ("6months"): { count, unit } past the calendar, or null for as far as
  // this device's Lowest looks
  const SNAPSHOT_UNTILS = [{ count: 2, unit: "weeks" }, { count: 1, unit: "months" }, { count: 2, unit: "months" }, { count: 3, unit: "months" }, { count: 6, unit: "months" }, { count: 12, unit: "months" }];
  function snapshotUntil(ref) {
    const found = /^(\d{1,3})(days|weeks|months)$/.exec(String(ref ?? ""));
    return found ? normalizeLookAhead({ count: Number(found[1]), unit: found[2] }) : null;
  }

  // In Edit, a Lowest card's Until: as this device's Lowest, or a set time past the calendar, saved with the card
  function untilPicker(card, list, title) {
    const pick = el("select", "selectInput snapshotUntil");
    const choices = [["", `As this device's Lowest (${lookAheadWords()})`], ...SNAPSHOT_UNTILS.map(ahead => [`${ahead.count}${ahead.unit}`, `${lookAheadWords(ahead)} past the calendar`])];
    const own = snapshotUntil(card.ref);
    if (own && !choices.some(([value]) => value === card.ref)) choices.push([card.ref, `${lookAheadWords(own)} past the calendar`]);
    for (const [value, label] of choices) pick.append(new Option(label, value));
    pick.value = own ? card.ref : "";
    pick.addEventListener("change", () => {
      const ahead = snapshotUntil(pick.value);
      save(list.map(other => (other.id === card.id ? { ...other, ref: pick.value } : other)), `${title}: ${ahead ? `${lookAheadWords(ahead)} past the calendar` : "as this device's Lowest"}`);
    });
    const field = BudgetUI.field("Until", pick);
    field.classList.add("snapshotUntilField");
    return field;
  }

  function cardEl(card, index, list) {
    const type = TYPES[card.type];
    const key = `${card.type}|${card.ref}`;
    let entry = built.get(card.id);
    if (!entry || entry.key !== key) {
      const made = el("section", "budgetCard snapshotCard");
      made.dataset.id = card.id;
      entry = { key, section: made, body: el("div", "snapshotBody"), keep: {} };
      built.set(card.id, entry);
    }
    const { section, body } = entry;
    let title = "A card";
    try { title = type ? type.title(card.ref) : "A card"; } catch {}
    const head = el("div", "snapshotHead");
    const heading = BudgetUI.noTranslate(el("h3", "snapshotTitle", title));
    head.append(heading);
    if (editing) {
      const handle = el("span", "snapshotHandle", "≡");
      handle.tabIndex = 0;
      handle.setAttribute("role", "button");
      handle.setAttribute("aria-label", `Move ${title} (or the arrow keys)`);
      handle.title = "Hold and drag to move";
      handle.addEventListener("pointerdown", (event) => startDrag(event, section));
      handle.addEventListener("keydown", (event) => {
        const by = { ArrowUp: -1, ArrowLeft: -1, ArrowDown: 1, ArrowRight: 1 }[event.key];
        if (!by) return;
        event.preventDefault();
        const to = index + by;
        if (to < 0 || to >= list.length) return;
        const next = [...list];
        next.splice(to, 0, next.splice(index, 1)[0]);
        save(next, `Moved ${title}`).then(() => document.querySelector(`.snapshotCard[data-id="${card.id}"] .snapshotHandle`)?.focus({ preventScroll: true }));
      });
      const remove = el("button", "panelClose snapshotRemove", "×");
      remove.type = "button";
      remove.setAttribute("aria-label", `Take ${title} off the Snapshot page`);
      remove.addEventListener("click", () => {
        if (!window.confirm(`Take ${title} off your Snapshot page?`)) return;
        save(list.filter(other => other.id !== card.id), `Took off ${title}`);
      });
      head.prepend(handle);
      head.append(remove);
    }
    // (A Lowest card's own until, in Edit: how far past the calendar it looks, or as far as this device's Lowest does; a
    // tracker card's own From and To, kept from one drawing to the next so a box being typed in stays)
    const untilField = editing && card.type === "home.lowest" ? untilPicker(card, list, title) : null;
    let daysField = null;
    if (editing && TRACKER_CARDS.includes(card.type)) {
      if (!entry.days) entry.days = trackerDateBoxes(trackerDaysKey(card.id));
      entry.days.show();
      daysField = entry.days.el;
      daysField.classList.add("snapshotDays");
    }
    // (A single wavelength's own Days, the same way: Past, Since Last Paycheck, or From And To)
    if (editing && card.type === "bob.wavelength" && waveKnown(card.ref)) {
      const waveCard = waveCardOf(entry.keep, card.id);
      if (!entry.days) entry.days = purposeDaysControl(waveCard);
      entry.days.show(purposeRangeOf(waveCard));
      daysField = entry.days.el;
      daysField.classList.add("snapshotDays");
    }
    if (daysField && daysField.parentNode === section) {
      // (Left where it is: taken out and put back, a box loses its focus)
      for (const child of [...section.children]) if (child !== daysField) child.remove();
      section.insertBefore(head, daysField);
      section.append(body);
    } else section.replaceChildren(head, ...(untilField ? [untilField] : []), ...(daysField ? [daysField] : []), body);
    try {
      if (!type) throw new Gone();
      if (!type.keeps) body.replaceChildren();
      type.render(body, card.ref, entry.keep, card.id);
    } catch (error) {
      entry.keep = {}; // (Made again from the start next time)
      body.replaceChildren(el("p", "panelHint", error instanceof Gone
        ? "What this card showed isn't in your budget anymore (it was deleted or renamed). Take it off in Edit, and add it again."
        : "This card couldn't be worked out. Please refresh to try again."));
      if (!(error instanceof Gone)) console.error(`The Snapshot card ${card.type} couldn't be drawn:`, error);
    }
    return section;
  }

  // A dashed + tile: opens what can be added, to go in at this place
  function addTile(at, words) {
    const tile = el("button", "snapshotAdd");
    tile.type = "button";
    tile.append(el("span", "snapshotAddPlus", "+"), el("span", "", words));
    tile.addEventListener("click", () => openAdd(tile, at));
    return tile;
  }

  // Keep the cards (in their new order, with one more, or one less), and draw again
  async function save(list, words) {
    if (saving) return;
    saving = true;
    const result = await setSnapshotCards(list.map(card => ({ id: card.id.startsWith("start") ? null : card.id, type: card.type, ref: card.ref })), words);
    saving = false;
    if (!result.ok) BudgetUI.showToast(result.message || "That didn't work. Please try again.", true);
    else BudgetUI.warnIfUnsaved(result);
    draw();
  }

  // Hold a card's ≡ and drag it: it goes before (or after) the card the pointer is over, and the new order is kept when it's
  // let go. The pointer is followed on the whole page (moving the card would make the browser let go of a capture). Held
  // near the top or bottom of the screen, the page scrolls that way (faster nearer the edge), so a card can go anywhere on
  // a long page.
  const DRAG_EDGE = 70; // Pixels from the screen's top or bottom where the page scrolls
  function startDrag(event, section) {
    event.preventDefault();
    const view = section.parentElement;
    const pointerId = event.pointerId;
    const startOrder = () => [...view.querySelectorAll(".snapshotCard")].map(item => item.dataset.id);
    const before = startOrder().join();
    section.classList.add("isDragging");
    let x = event.clientX;
    let y = event.clientY;
    let frame = 0;
    // The card goes by the one under the pointer
    const place = () => {
      const over = [...view.querySelectorAll(".snapshotCard")].find(item => {
        if (item === section) return false;
        const box = item.getBoundingClientRect();
        return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
      });
      if (!over) return;
      const box = over.getBoundingClientRect();
      if (y > box.top + box.height / 2) over.after(section);
      else over.before(section);
    };
    // Scrolling while the pointer is held near an edge
    const scrollStep = () => {
      frame = 0;
      const height = window.visualViewport ? window.visualViewport.height : window.innerHeight;
      const speed = y < DRAG_EDGE ? -(DRAG_EDGE - y) / 4 : y > height - DRAG_EDGE ? (y - (height - DRAG_EDGE)) / 4 : 0;
      if (!speed) return;
      window.scrollBy(0, Math.round(speed));
      place();
      frame = requestAnimationFrame(scrollStep);
    };
    const onMove = (moveEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      x = moveEvent.clientX;
      y = moveEvent.clientY;
      place();
      if (!frame) frame = requestAnimationFrame(scrollStep);
    };
    const onEnd = (endEvent) => {
      if (endEvent.pointerId !== pointerId) return;
      cancelAnimationFrame(frame);
      frame = 0;
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onEnd);
      document.removeEventListener("pointercancel", onEnd);
      section.classList.remove("isDragging");
      const order = startOrder();
      if (order.join() === before) return;
      const list = cards();
      save(order.map(id => list.find(card => card.id === id)).filter(Boolean), "New order");
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onEnd);
    document.addEventListener("pointercancel", onEnd);
  }

  //#endregion

  // =====================================================================
  // #region ADDING A CARD
  // =====================================================================
  // + opens a window of the site's parts; tapping one opens a window of what's in it (over the first), and a part with more
  // inside (like Bob's Goals: all of them, or one) opens another. Tapping a card adds it where the + was.

  // What can be added: [{ label, about, items: [{ label, type, ref, items (more inside, instead of a type), note }] }]. The
  // Spectrum Graph comes first, added straight from the list (a part with a type instead of items).
  function sections() {
    const goals = accountsData?.goals || [];
    const gems = calculatorStore("gems");
    const crystals = calculatorStore("crystals");
    const rows = trackerData.slice(1).map(row => String(row[0] ?? "").trim()).filter(title => title && title !== "-");
    const accounts = shared.summaries();
    const bobDef = (id) => CARDS.find(def => def.id === id);
    const card = (label, type, ref = "") => ({ label, type, ref });
    // (One of each: a wavelength, Undefined too; a recurring entry, by its title and type; a Calendar Fractal of the account's
    // or the budget's, or one linked from elsewhere)
    const waves = [...wavelengthList(), { id: "none", name: "Undefined" }];
    const recurring = getParsedRecurringRows();
    const fractals = window.Fractals && window.Fractals.data() && !window.SNAPSHOT_KEY ? [...window.Fractals.data().fractals, ...window.Fractals.linkedFractals()] : [];
    return [
      { label: "Spectrum Graph", about: "Bob's one graph to compare anything: In Bank, accounts, tracker rows, and more", type: "graph.spectrum" },
      { label: "Main Budget", about: "Home's numbers: In Bank, the lowest it gets, and what's coming", items: [
        card("In Bank today", "home.inBank"), card("Lowest in bank after today", "home.lowest"), card("In Bank at the last day ahead", "home.lastDay"),
        card("Today's entries", "home.today"), card("Upcoming", "home.upcoming"), card("Bob says (his card on Home)", "home.bob")
      ] },
      { label: "Bob", about: "His highlights, his cards, and his Data's numbers", items: [
        card("Bob's Highlights", "bob.highlights"),
        card("Spectrum Graph", "bob.card.spectrum"),
        { label: "Goals", items: [card("All of your goals", "bob.card.goals"), ...goals.map((goal, index) => card(`🎯 ${goalName(goal)}`, "bob.goal", `${index}:${goalName(goal)}`))] },
        ...["purposes", "payday", "pace", "bills", "weekly", "catchup", "refund"].map(id => card(bobDef(id).title, `bob.card.${id}`)),
        { label: "One wavelength", items: waves.map(wave => card(`🌈 ${wave.name}`, "bob.wavelength", wave.id)) },
        { label: "Data", items: [card("All of Data", "bob.card.data"), ...dataRows().map(row => card(row.label, "bob.data", row.label))] }
      ] },
      { label: "Tracker", about: "What each row came to in the last 3 months, or the days you pick for its card in Edit", items: rows.map(title => card(title, "tracker.row", title)) },
      { label: "Equity", about: "Your accounts, and the Total", items: [card("Total (In Bank and every account)", "equity.total"), ...accounts.map(summary => card(summary.name, "equity.account", summary.name))] },
      { label: "Recurring Entries", about: "What they come to each month, or one of them", items: [card("Each month", "recurring.month"), ...recurring.map(row => card(`${baseSprite(row.sprite)} ${row.title}`, "recurring.entry", JSON.stringify([row.title, baseSprite(row.sprite)])))] },
      { label: "Gems", about: "The Accrual Calculator's gems: when each is paid off or reached", items: gems.map(gem => card(`💠 ${presetName(gem, describeDebt)}`, "gem", gem.id)), empty: "No gems yet: save one in the Accrual Calculator (Menu)." },
      { label: "Crystals", about: "The Paycheck Calculator's crystals: each one's take-home pay", items: crystals.map(crystal => card(`💎 ${presetName(crystal, describeCrystal)}`, "crystal", crystal.id)), empty: "No crystals yet: save one in the Paycheck Calculator (Menu)." },
      { label: "Calendar", about: "Your calendar's entries, or one Calendar Fractal's", items: [card("Today", "calendar.today"), card("The next 7 days", "calendar.week"), ...fractals.map(fractal => card(`📅 ${fractal.name}: the next 7 days`, "calendar.fractal", fractal.id))] },
      { label: "Graphs", about: "Every graph on the site", items: [
        card("Spectrum Graph", "graph.spectrum"), card("In Bank over time", "graph.inBank"), card("Equity over time", "graph.equity"), card("Goals over time", "graph.goals"),
        card("Spent each week", "graph.spent"), card("Spent after each payday", "graph.paydays"), card("Recurring entries each month", "graph.recurring"),
        card("Each wavelength, week by week", "graph.wavelengths"), card("Catchup entries, added up", "graph.catchups"), card("Purchases, added up", "graph.purchases"),
        card("Big bills, added up", "graph.bills"),
        { label: "One wavelength, week by week", items: waves.map(wave => card(`🌈 ${wave.name}`, "graph.wavelength", wave.id)) },
        { label: "Tracker rows", items: rows.map(title => card(title, "graph.tracker", title)), empty: "No tracker rows yet." },
        { label: "Gems", items: gems.map(gem => card(`💠 ${presetName(gem, describeDebt)}`, "graph.gem", gem.id)), empty: "No gems yet." }
      ] }
    ];
  }

  // + tapped: the site's parts, each opening what's in it
  function openAdd(origin, at) {
    BudgetUI.openPanel({
      origin,
      size: "small",
      title: "Add A Card",
      build(form, panel) {
        form.addEventListener("submit", (event) => event.preventDefault());
        const list = el("ul", "snapshotChoices");
        for (const section of sections()) {
          const item = el("li");
          const button = el("button", "snapshotChoice");
          button.type = "button";
          button.append(el("span", "snapshotChoiceName", section.label), el("span", "snapshotChoiceAbout", section.about));
          if (section.type) button.addEventListener("click", () => add(section, at));
          else {
            button.append(el("span", "snapshotChoiceMore", "›"));
            button.addEventListener("click", () => openItems(button, section, at));
          }
          item.append(button);
          list.append(item);
        }
        form.append(el("p", "panelHint", "Pick a part of the site, then what to show from it."), list, BudgetUI.buttonRow([{ label: "Cancel", onClick: () => panel.close() }]));
      }
    });
  }

  // What's in a part (over the window it was picked in): a card to add, or more inside (›)
  function openItems(origin, section, at) {
    BudgetUI.openPanel({
      origin,
      size: "small",
      stacked: true,
      title: section.label,
      build(form, panel) {
        form.addEventListener("submit", (event) => event.preventDefault());
        const list = el("ul", "snapshotChoices");
        for (const choice of section.items) {
          const item = el("li");
          const button = el("button", "snapshotChoice");
          button.type = "button";
          button.append(BudgetUI.noTranslate(el("span", "snapshotChoiceName", choice.label)));
          if (choice.items) {
            button.append(el("span", "snapshotChoiceMore", "›"));
            button.addEventListener("click", () => openItems(button, choice, at));
          } else {
            button.addEventListener("click", () => add(choice, at));
          }
          item.append(button);
          list.append(item);
        }
        form.append(section.items.length > 0 ? list : el("p", "panelHint", section.empty || "Nothing here yet."), BudgetUI.buttonRow([{ label: "Back", onClick: () => panel.close() }]));
      }
    });
  }

  // Add a card where its + was, and close the windows
  function add(choice, at) {
    const list = [...cards()];
    if (list.length >= MAX_SNAPSHOT_CARDS) return BudgetUI.showToast(`The Snapshot page can have up to ${MAX_SNAPSHOT_CARDS} cards. Take one off first.`, true);
    list.splice(Math.min(at, list.length), 0, { id: newPresetId(), type: choice.type, ref: choice.ref || "" });
    BudgetUI.closeAllPanels();
    save(list, `Added ${choice.label}`);
  }

  //#endregion
})();
