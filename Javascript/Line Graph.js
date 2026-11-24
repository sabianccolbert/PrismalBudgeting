// Line Graph: a line graph that can go in any window or page (Bob's page, the top of the Accrual Calculator). It's given what to
// draw for a stretch of days, and has its own date boxes: Start date (the first day drawn) and Show through (on today to start:
// a later day adds what the budget expects, drawn dashed after today). Pointing at it (or the arrow keys, once it's focused)
// shows each line's value on the nearest day. "See the numbers" opens the same figures as a table.
//
// More than one line has a legend: each line's name is a button that goes, one tap at a time, Separate (its own line and
// color), Red, Blue, Hidden, and back to Separate. Every line set to Red is added together into one thicker red line, and every
// one set to Blue into a blue one, so a few lines can be seen as one (like Coffee, Coffees, and Drinks) next to others. A "?"
// first in the legend says so, and All after it sets every line the same way at once (it's grey while the lines differ).
// Past MAX_LINES lines (as many as there are colors), the rest start Hidden.
//
// LineGraph.create({ label, from, series, note, money, min, max, pickDay, start, until, dashAhead, emptyNote, level }):
//   label: what it shows, for the title over it and for screen readers
//   from(until): the first day to show when it runs through until (until a Start date is picked)
//   series(first, until): the lines, [{ name, points: [{ date, value }] }] (oldest first; every line's days need not match)
//   note: words under it. money: its values are dollars (true to start). min, max: the Show through box's limits.
//   pickDay: false for a graph that isn't about days ahead, or that takes its days from elsewhere (no date boxes)
//   start, until: the days it starts on (start: a Start date of its own, instead of from(until); until: today without one)
//   dashAhead: false to draw days after today like the rest (a graph that's all ahead)
//   emptyNote: said when there's nothing to draw. level: its title's heading level (3 to start, for under a window's title)
// Returns { el, draw(), until(), lines() }. draw() works it out again (after a change to the budget); lines() is what was
// worked out last, [{ name, points }].

window.LineGraph = (function () {
  const NS = "http://www.w3.org/2000/svg";
  const HEIGHT = 230;
  const MAX_POINTS = 420;     // More days than this are drawn every few days (the day picked is always the last)
  const MAX_TABLE_ROWS = 60;  // The most days "See the numbers" lists (spread across the stretch)
  const MAX_LINES = 8;        // As many colors as there are to tell lines apart (--SERIES_n): past this many, the rest start Hidden
  const MODES = ["separate", "red", "blue", "hidden"]; // What a tap on a line's name goes through, in order
  const MODE_WORDS = { separate: "Separate", red: "Red", blue: "Blue", hidden: "Hidden" };
  const GROUP_COLORS = { red: "var(--GRAPH_RED)", blue: "var(--GRAPH_BLUE)" };
  const MODES_HELP = [
    "Tap a line's name to change how it's drawn. Each tap goes to the next: Separate (its own line, in its own color), Red, Blue, Hidden, then back to Separate.",
    "Every line set to Red is added together into one thicker red line, and every line set to Blue into one blue line. That way a few lines can be seen as one, like Coffee, Coffees, and Drinks in red, next to Groceries in blue.",
    "All sets every line at once, going through the same four. It's grey while the lines are set differently; tap it then to set them all back to Separate.",
    `Point at the graph (or tap it) to read each line on that day. A graph with more than ${MAX_LINES} lines starts with the rest Hidden.`
  ];
  const WIDE_ENOUGH = 460;    // Pixels wide before each line's name fits at its right end
  const LONG_STRETCH = 300 * 86400000; // Past this much time, the days along the bottom say the month and year instead
  const REVEAL_MS = 850;      // How long the lines take to draw in, left to right, when a graph first shows (and for new days)
  let count = 0;

  const svgEl = (name, attrs = {}, parent = null) => {
    const el = document.createElementNS(NS, name);
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
    if (parent) parent.append(el);
    return el;
  };

  // Short money for the axis: "$1.2K", "-$450", "$1.5M"
  function shortMoney(value) {
    const size = Math.abs(value);
    const sign = value < 0 ? "-" : "";
    if (size >= 1e6) return `${sign}$${(size / 1e6).toFixed(size >= 1e7 ? 0 : 1)}M`;
    if (size >= 1e4) return `${sign}$${Math.round(size / 1000)}K`;
    if (size >= 1000) return `${sign}$${(size / 1000).toFixed(1)}K`;
    return `${sign}$${Math.round(size)}`;
  }

  // A month and its year, for days along the bottom of a stretch longer than a year: "11/2026", or "2026-11"
  function monthAndYear(date) {
    const month = String(date.getMonth() + 1).padStart(2, "0");
    return dateFormat() === "ymd" ? `${date.getFullYear()}-${month}` : `${month}/${date.getFullYear()}`;
  }

  // Round numbers to mark from low to high: about count of them, one step apart
  function niceTicks(low, high, count) {
    const span = high - low || Math.abs(high) || 1;
    const rough = span / Math.max(1, count - 1);
    const power = 10 ** Math.floor(Math.log10(rough));
    const unit = [1, 2, 2.5, 5, 10].map(share => share * power).find(step => step >= rough) || 10 * power;
    const ticks = [];
    for (let tick = Math.floor(low / unit) * unit; tick <= high + unit * 0.999; tick += unit) ticks.push(Math.round(tick * 100) / 100);
    return ticks;
  }

  // Every few points when there are too many, always keeping the last
  function thinned(points) {
    if (points.length <= MAX_POINTS) return points;
    const step = Math.ceil(points.length / MAX_POINTS);
    const kept = points.filter((_, at) => at % step === 0);
    if (kept[kept.length - 1] !== points[points.length - 1]) kept.push(points[points.length - 1]);
    return kept;
  }

  // Lines added together, each day's values summed (a day only some of them have counts what they have)
  function addedUp(members) {
    const byDay = new Map();
    for (const line of members) {
      for (const point of line.points) {
        const time = point.date.getTime();
        byDay.set(time, (byDay.get(time) || 0) + point.value);
      }
    }
    return [...byDay].sort((a, b) => a[0] - b[0]).map(([time, value]) => ({ date: new Date(time), value: Math.round(value * 100) / 100 }));
  }

  function create({ label, from, series, note = "", money = true, min = null, max = null, pickDay = true, start = null, until: firstUntil = null, dashAhead = true, emptyNote = "Nothing to draw for these days yet.", level = 3 }) {
    const id = ++count;
    const el = BudgetUI.element("div", "lineGraph");
    const heading = BudgetUI.element("div", "lineGraphTitle", label);
    heading.id = `lineGraphTitle${id}`;
    heading.setAttribute("role", "heading");
    heading.setAttribute("aria-level", String(level));
    el.append(heading);

    let until = firstUntil || today;
    let picked = start; // The Start date picked (null: from(until))
    const firstDay = () => (picked && picked < until ? picked : from(until));
    const startBox = pickDay ? BudgetUI.dateField({ label: "Start date", date: firstDay(), max, hint: "The first day drawn." }) : null;
    const day = pickDay ? BudgetUI.dateField({ label: "Show through", date: until, min, max, hint: "On today to start. Pick a later day to see what your budget expects, drawn dashed." }) : null;
    if (day) {
      const days = BudgetUI.element("div", "lineGraphDays");
      days.append(startBox.el, day.el);
      el.append(days);
    }
    const problem = BudgetUI.element("p", "panelError");
    problem.hidden = true;
    problem.setAttribute("role", "alert");

    const plot = BudgetUI.element("div", "lineGraphPlot");
    plot.tabIndex = 0;
    plot.setAttribute("role", "group");
    plot.setAttribute("aria-labelledby", heading.id);
    plot.setAttribute("aria-describedby", `lineGraphHelp${id}`);
    const svg = svgEl("svg", { class: "lineGraphSvg", "aria-hidden": "true", focusable: "false" });
    const tip = BudgetUI.element("div", "lineGraphTip");
    tip.hidden = true;
    plot.append(svg, tip);
    const keyboard = BudgetUI.element("p", "srOnly", "Use the left and right arrow keys to read each day.");
    keyboard.id = `lineGraphHelp${id}`;
    const spoken = BudgetUI.element("p", "srOnly");
    spoken.setAttribute("aria-live", "polite");
    const empty = BudgetUI.element("p", "panelHint lineGraphEmpty");
    empty.hidden = true;
    const legend = BudgetUI.element("ul", "lineGraphLegend");
    // The legend's first item: a "?" that opens (and closes) what its names do, under it
    const modesHelp = BudgetUI.element("div", "lineGraphHelp");
    modesHelp.id = `lineGraphModes${id}`;
    modesHelp.hidden = true;
    for (const words of MODES_HELP) modesHelp.append(BudgetUI.element("p", "panelHint", words));
    const helpItem = BudgetUI.element("li", "lineGraphHelpItem");
    const helpButton = BudgetUI.element("button", "fieldHelpButton lineGraphHelpButton", "?");
    helpButton.type = "button";
    helpButton.title = "What tapping a name does";
    helpButton.setAttribute("aria-label", helpButton.title);
    helpButton.setAttribute("aria-controls", modesHelp.id);
    helpButton.setAttribute("aria-expanded", "false");
    helpButton.addEventListener("click", () => {
      modesHelp.hidden = !modesHelp.hidden;
      helpButton.setAttribute("aria-expanded", String(!modesHelp.hidden));
    });
    helpItem.append(helpButton);
    const tableBox = BudgetUI.element("details", "lineGraphTable");
    const tableLabel = BudgetUI.element("summary", "", "See the numbers");
    const tableHolder = BudgetUI.element("div", "bobScroll");
    tableBox.append(tableLabel, tableHolder);
    el.append(problem, plot, keyboard, spoken, empty, legend, modesHelp, tableBox);
    if (note) el.append(BudgetUI.element("p", "panelHint", note));

    const modes = new Map();     // Each line's mode (MODES), by its name: it keeps it however the others change
    const slots = new Map();     // Each line's color, by its name, the same way
    let lines = [];              // The lines worked out: [{ name, points, byDay }]
    let drawn = [];              // What's drawn: the Separate lines, then Red's and Blue's (see drawnLines)
    let dates = [];              // Every day drawn, oldest first
    let layout = null;           // Where things are: { x(index) }
    let pointed = -1;            // The day being read (an index into dates), or -1
    let revealing = true;        // The lines draw in on the next paint that has them (the first, and after new days)
    let revealFrom = null;       // When they started drawing in (performance.now()), while they are

    const show = (value) => (money ? formatMoney(value) : String(Math.round(value * 100) / 100));
    const slotOf = (name) => {
      if (!slots.has(name)) slots.set(name, slots.size % MAX_LINES);
      return slots.get(name);
    };
    const colorOf = (name) => (lines.length === 1 ? "var(--GRAPH_ONE)" : `var(--SERIES_${slotOf(name) + 1})`);
    const modeOf = (name) => modes.get(name) || "separate";
    const valueOn = (line, date) => line.byDay.get(date.getTime());
    const withDays = (points) => ({ points, byDay: new Map(points.map(point => [point.date.getTime(), point.value])) });

    // The lines for the stretch, from the page's numbers (a line seen for the first time past the first MAX_LINES starts Hidden)
    function work() {
      const first = firstDay();
      lines = series(first < until ? first : addDays(until, -1), until).filter(line => line.points.length > 0)
        .map(line => ({ name: line.name, ...withDays(thinned(line.points)) }));
      lines.forEach((line, at) => { if (!modes.has(line.name)) modes.set(line.name, at < MAX_LINES ? "separate" : "hidden"); });
      const times = new Set();
      for (const line of lines) for (const point of line.points) times.add(point.date.getTime());
      dates = [...times].sort((a, b) => a - b).map(time => new Date(time));
      drawn = drawnLines();
    }

    // What's drawn: each Separate line in its own color, then the Red lines added together as one, and the Blue ones
    function drawnLines() {
      const shown = lines.filter(line => modeOf(line.name) === "separate").map(line => ({ ...line, color: colorOf(line.name), group: false }));
      for (const mode of ["red", "blue"]) {
        const members = lines.filter(line => modeOf(line.name) === mode);
        if (members.length === 0) continue;
        shown.push({ name: `${MODE_WORDS[mode]}: ${members.map(line => line.name).join(" + ")}`, ...withDays(addedUp(members)), color: GROUP_COLORS[mode], group: true });
      }
      return shown;
    }

    // The picture, at the width it has
    function paint() {
      svg.replaceChildren();
      tip.hidden = true;
      pointed = -1;
      const hasData = dates.length >= 2 && drawn.length > 0;
      plot.hidden = !hasData;
      empty.hidden = hasData;
      if (!hasData) {
        empty.textContent = dates.length >= 2 ? "Every line is Hidden. Tap a name below to show it again." : emptyNote;
        return;
      }
      const width = plot.clientWidth;
      if (width === 0) return; // (Not on the screen yet: drawn when it is)
      svg.setAttribute("viewBox", `0 0 ${width} ${HEIGHT}`);
      svg.setAttribute("width", String(width));
      svg.setAttribute("height", String(HEIGHT));
      const values = drawn.flatMap(line => line.points.map(point => point.value));
      let low = Math.min(...values);
      let high = Math.max(...values);
      if (low === high) {
        low -= 1;
        high += 1;
      }
      const ticks = niceTicks(low, high, width < 360 ? 4 : 5);
      low = Math.min(low, ticks[0]);
      high = Math.max(high, ticks[ticks.length - 1]);
      const directLabels = drawn.length >= 2 && drawn.length <= 4 && width >= WIDE_ENOUGH;
      const room = { left: 8 + Math.max(...ticks.map(tick => (money ? shortMoney(tick) : String(tick)).length)) * 6.6, right: directLabels ? 92 : 12, top: 12, bottom: 26 };
      const firstTime = dates[0].getTime();
      const span = dates[dates.length - 1].getTime() - firstTime || 1;
      const inside = width - room.left - room.right;
      const xOf = (date) => room.left + ((date.getTime() - firstTime) / span) * inside;
      const yOf = (value) => room.top + (1 - (value - low) / (high - low)) * (HEIGHT - room.top - room.bottom);
      layout = { x: (at) => xOf(dates[at]) };

      for (const tick of ticks) {
        const y = yOf(tick);
        svgEl("line", { x1: room.left, x2: width - room.right, y1: y, y2: y, class: tick === 0 ? "lineGraphZero" : "lineGraphGrid" }, svg);
        svgEl("text", { x: room.left - 6, y: y + 4, class: "lineGraphAxis", "text-anchor": "end" }, svg).textContent = money ? shortMoney(tick) : String(tick);
      }
      // Days along the bottom: the first and last, and as many between as fit
      const marks = Math.max(2, Math.min(6, Math.floor(inside / 74)));
      const axisDay = dates[dates.length - 1] - dates[0] > LONG_STRETCH ? monthAndYear : showDay;
      for (let mark = 0; mark < marks; mark++) {
        const at = Math.round((mark / (marks - 1)) * (dates.length - 1));
        const anchor = mark === 0 ? "start" : mark === marks - 1 ? "end" : "middle";
        svgEl("text", { x: xOf(dates[at]), y: HEIGHT - 8, class: "lineGraphAxis", "text-anchor": anchor }, svg).textContent = axisDay(dates[at]);
      }
      if (today > dates[0] && today < dates[dates.length - 1]) {
        const x = xOf(today);
        svgEl("line", { x1: x, x2: x, y1: room.top, y2: HEIGHT - room.bottom, class: "lineGraphToday" }, svg);
        svgEl("text", { x: x + 4, y: room.top + 9, class: "lineGraphAxis" }, svg).textContent = "Today";
      }

      // (The lines and their names in one group, which draws in from the left: see revealLines)
      const group = svgEl("g", { class: "lineGraphLines" }, svg);
      for (const line of drawn) {
        const color = line.color;
        const lineClass = line.group ? "lineGraphLine isGroup" : "lineGraphLine";
        const path = (points) => points.map((point, at) => `${at ? "L" : "M"}${xOf(point.date).toFixed(1)} ${yOf(point.value).toFixed(1)}`).join(" ");
        const past = line.points.filter(point => point.date <= today);
        const ahead = line.points.filter(point => point.date >= today);
        // (With the days thinned out, no point may land on today: the dashes start from the last point before it)
        if (past.length > 0 && ahead.length > 0 && past[past.length - 1].date < ahead[0].date) ahead.unshift(past[past.length - 1]);
        if (past.length >= 2) svgEl("path", { d: path(past), class: lineClass, stroke: color }, group);
        if (ahead.length >= 2) svgEl("path", { d: path(ahead), class: dashAhead ? `${lineClass} isAhead` : lineClass, stroke: color }, group);
        if (past.length < 2 && ahead.length < 2 && line.points.length === 1) svgEl("circle", { cx: xOf(line.points[0].date), cy: yOf(line.points[0].value), r: 4, fill: color }, group);
      }

      // Each line's name at its right end, moved apart where they'd land on each other
      if (directLabels) {
        const ends = drawn.map(line => ({ line, y: yOf(line.points[line.points.length - 1].value) })).sort((a, b) => a.y - b.y);
        for (let at = 1; at < ends.length; at++) ends[at].y = Math.max(ends[at].y, ends[at - 1].y + 14);
        for (const end of ends) {
          const words = end.line.name.length > 13 ? `${end.line.name.slice(0, 12)}…` : end.line.name;
          svgEl("text", { x: width - room.right + 6, y: Math.min(end.y + 4, HEIGHT - room.bottom), class: "lineGraphLabel" }, group).textContent = words;
        }
      }
      svgEl("line", { class: "lineGraphCrosshair", y1: room.top, y2: HEIGHT - room.bottom, x1: -9, x2: -9 }, svg);
      revealLines(group, room.left, width);
    }

    // The lines draw in from left to right (REVEAL_MS, easing out) the first time they're painted, and after new days are
    // picked: a clip that widens from where the days start. A paint while they're drawing in (a new width) carries on
    // from where it was. Reduced Motion draws them whole.
    function revealLines(group, left, width) {
      if (revealing) {
        revealing = false;
        revealFrom = window.lessMotion && window.lessMotion() ? null : performance.now();
      }
      if (revealFrom === null) return;
      const clipId = `lineGraphReveal${id}`;
      const clip = svgEl("clipPath", { id: clipId }, svg);
      const edge = svgEl("rect", { x: 0, y: 0, width: left, height: HEIGHT }, clip);
      group.setAttribute("clip-path", `url(#${clipId})`);
      const step = (now) => {
        if (!edge.isConnected) return; // (Painted again: that paint carries on)
        const done = Math.min(1, (now - revealFrom) / REVEAL_MS);
        edge.setAttribute("width", String(left + (width - left) * (1 - Math.pow(1 - done, 3))));
        if (done < 1) return requestAnimationFrame(step);
        revealFrom = null;
        group.removeAttribute("clip-path");
        clip.remove();
      };
      requestAnimationFrame(step);
    }

    // Reads the day at an index: the line down it, a dot on each line, and each line's value in the box
    function point(at) {
      if (!layout || at < 0 || at >= dates.length) return;
      pointed = at;
      const date = dates[at];
      const x = layout.x(at);
      const cross = svg.querySelector(".lineGraphCrosshair");
      if (cross) {
        cross.setAttribute("x1", String(x));
        cross.setAttribute("x2", String(x));
      }
      const rows = drawn.map(line => ({ name: line.name, value: valueOn(line, date), color: line.color })).filter(row => row.value !== undefined);
      tip.replaceChildren(BudgetUI.element("div", "lineGraphTipDay", `${showWeekdayDate(date)}${date > today ? " (expected)" : ""}`));
      for (const row of rows) {
        const item = BudgetUI.element("div", "lineGraphTipRow");
        const key = BudgetUI.element("span", "lineGraphKey");
        key.style.background = row.color;
        item.append(key, BudgetUI.noTranslate(BudgetUI.element("span", "lineGraphTipName", row.name)), BudgetUI.noTranslate(BudgetUI.element("span", "lineGraphTipValue", show(row.value))));
        tip.append(item);
      }
      tip.hidden = false;
      const room = plot.clientWidth;
      const box = tip.offsetWidth;
      tip.style.left = `${Math.max(0, Math.min(room - box, x > room / 2 ? x - box - 12 : x + 12))}px`;
      spoken.textContent = `${showWeekdayDate(date)}: ${rows.map(row => `${row.name} ${show(row.value)}`).join(", ")}`;
    }

    function stopPointing() {
      tip.hidden = true;
      pointed = -1;
      const cross = svg.querySelector(".lineGraphCrosshair");
      if (cross) {
        cross.setAttribute("x1", "-9");
        cross.setAttribute("x2", "-9");
      }
    }

    // The day nearest where the pointer is
    const nearest = (clientX) => {
      const x = clientX - plot.getBoundingClientRect().left;
      let best = 0;
      for (let at = 0; at < dates.length; at++) if (Math.abs(layout.x(at) - x) < Math.abs(layout.x(best) - x)) best = at;
      return best;
    };
    plot.addEventListener("pointermove", (event) => { if (layout && !plot.hidden) point(nearest(event.clientX)); });
    plot.addEventListener("pointerdown", (event) => { if (layout && !plot.hidden) point(nearest(event.clientX)); });
    plot.addEventListener("pointerleave", (event) => { if (event.pointerType === "mouse") stopPointing(); });
    plot.addEventListener("blur", stopPointing);
    plot.addEventListener("keydown", (event) => {
      const last = dates.length - 1;
      const next = { ArrowLeft: Math.max(0, (pointed < 0 ? last + 1 : pointed) - 1), ArrowRight: Math.min(last, pointed + 1), Home: 0, End: last }[event.key];
      if (next === undefined) return;
      event.preventDefault();
      point(next);
    });

    // The legend (with two lines or more): its "?", All (every line's mode at once: the next one after the mode they all
    // share, or Separate while they differ, when it's grey), then each line's key and name, a button that goes to the line's
    // next mode (MODES), saying the one it's on unless that's Separate
    function allButton() {
      const shared = lines.every(line => modeOf(line.name) === modeOf(lines[0].name)) ? modeOf(lines[0].name) : null;
      const next = shared ? MODES[(MODES.indexOf(shared) + 1) % MODES.length] : "separate";
      const item = BudgetUI.element("li");
      const button = BudgetUI.element("button", `lineGraphAll ${shared ? `is${MODE_WORDS[shared]}` : "isMixed"}`);
      button.type = "button";
      button.title = shared ? `Every line: ${MODE_WORDS[shared]}. Tap to set them all to ${MODE_WORDS[next]}.` : "The lines are set differently. Tap to set them all to Separate.";
      button.setAttribute("aria-label", button.title);
      button.append(BudgetUI.element("span", "", "All"));
      if (shared && shared !== "separate") button.append(BudgetUI.element("span", "lineGraphMode", MODE_WORDS[shared]));
      button.addEventListener("click", () => {
        for (const line of lines) modes.set(line.name, next);
        drawn = drawnLines();
        drawLegend();
        paint();
        fillTable();
        legend.querySelector(".lineGraphAll")?.focus({ preventScroll: true });
      });
      item.append(button);
      return item;
    }

    function drawLegend() {
      legend.hidden = lines.length < 2;
      if (legend.hidden) {
        modesHelp.hidden = true;
        helpButton.setAttribute("aria-expanded", "false");
        return legend.replaceChildren();
      }
      legend.replaceChildren(helpItem, allButton(), ...lines.map((line, at) => {
        const mode = modeOf(line.name);
        const next = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
        const item = BudgetUI.element("li");
        const button = BudgetUI.element("button", `lineGraphLegendButton is${MODE_WORDS[mode]}`);
        button.type = "button";
        button.title = `${line.name}: ${MODE_WORDS[mode]}. Tap for ${MODE_WORDS[next]}.`;
        button.setAttribute("aria-label", button.title);
        const key = BudgetUI.element("span", "lineGraphKey");
        key.style.background = GROUP_COLORS[mode] || colorOf(line.name);
        button.append(key, BudgetUI.noTranslate(BudgetUI.element("span", "", line.name)));
        if (mode !== "separate") button.append(BudgetUI.element("span", "lineGraphMode", MODE_WORDS[mode]));
        button.addEventListener("click", () => {
          modes.set(line.name, next);
          drawn = drawnLines();
          drawLegend();
          paint();
          fillTable();
          // (The button was drawn again: the focus stays on this line's, after the "?" and All)
          legend.children[at + 2]?.querySelector("button")?.focus({ preventScroll: true });
        });
        item.append(button);
        return item;
      }));
    }

    // "See the numbers": the same figures in a table, newest day first, spread across the stretch when there are many days
    function fillTable() {
      tableBox.hidden = dates.length < 2 || drawn.length === 0;
      if (tableBox.hidden) return tableHolder.replaceChildren();
      const step = Math.max(1, Math.ceil(dates.length / MAX_TABLE_ROWS));
      const shown = dates.filter((_, at) => (dates.length - 1 - at) % step === 0).reverse();
      const table = BudgetUI.element("table", "dataTable bobTable");
      const head = table.createTHead().insertRow();
      head.append(BudgetUI.element("th", "", "Day"), ...drawn.map(line => BudgetUI.noTranslate(BudgetUI.element("th", "", line.name))));
      const body = table.createTBody();
      for (const date of shown) {
        const row = body.insertRow();
        row.append(BudgetUI.noTranslate(BudgetUI.element("td", "", `${showWeekdayDate(date)}${date > today ? " (expected)" : ""}`)));
        for (const line of drawn) {
          const value = valueOn(line, date);
          row.append(BudgetUI.noTranslate(BudgetUI.element("td", "amountCell", value === undefined ? "--" : show(value))));
        }
      }
      tableHolder.replaceChildren(table);
    }

    function draw() {
      work();
      drawLegend();
      paint();
      fillTable();
    }

    const showProblem = (words) => {
      problem.textContent = words;
      problem.hidden = !words;
    };

    // A new day in a box. A Start date on or after the Show through day goes back to the usual one, and so does an
    // emptied Start date box.
    if (day) {
      day.input.addEventListener("change", () => {
        const value = day.value();
        if (!(value instanceof Date)) return showProblem(`Enter a day to show through (${datePattern()}).`);
        if ((min && value < min) || (max && value > max)) return showProblem(`Pick a day from ${min ? showDate(min) : "the start"} through ${max ? showDate(max) : "today"}.`);
        showProblem("");
        until = createSafeMidnight(value);
        if (picked && picked >= until) picked = null;
        startBox.input.value = showDate(firstDay());
        revealing = true;
        draw();
      });
      startBox.input.addEventListener("change", () => {
        const value = startBox.value();
        if (value === undefined) return showProblem(`Enter a start date (${datePattern()}).`);
        const date = value ? createSafeMidnight(value) : null;
        if (date && date >= until) return showProblem(`Pick a start date before ${showDate(until)}.`);
        showProblem("");
        picked = date;
        startBox.input.value = showDate(firstDay());
        revealing = true;
        draw();
      });
    }

    // Drawn again when it gets a width, or a new one
    let lastWidth = 0;
    if (typeof ResizeObserver === "function") {
      // (Next frame: drawing changes its height, and Safari reports a change made right here as an error)
      new ResizeObserver(() => requestAnimationFrame(() => {
        if (plot.clientWidth === lastWidth) return;
        lastWidth = plot.clientWidth;
        paint();
      })).observe(el);
    }
    draw();
    return { el, draw, until: () => until, lines: () => lines };
  }

  return { create };
})();
