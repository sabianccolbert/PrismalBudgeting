// Line Graph: a line graph that can go in any window or page (Bob's Data windows, the top of the Debt Calculator). It's given
// what to draw for a stretch of days, and has its own date box, on today to start: a later day adds what the budget expects, drawn
// dashed after today. Pointing at it (or the arrow keys, once it's focused) shows each line's value on the nearest day. More than
// one line has a legend whose buttons hide or show each one; "See the numbers" opens the same figures as a table.
//
// LineGraph.create({ label, from, series, note, money, moneyKeys, min, max, pickDay, emptyNote }):
//   label: what it shows, for the title over it and for screen readers
//   from(until): the first day to show when it runs through until
//   series(first, until): the lines, [{ name, points: [{ date, value }] }] (oldest first; every line's days need not match)
//   note: words under it. money: its values are dollars (true to start). min, max: the date box's limits.
//   pickDay: false for a graph that isn't about days ahead, or that takes its days from elsewhere (no date box)
//   dashAhead: false to draw days after today like the rest (a graph that's all ahead)
//   emptyNote: said when there's nothing to draw. level: its title's heading level (3 to start, for under a window's title)
// Returns { el, draw(), until() }. draw() works it out again (after a change to the budget).

window.LineGraph = (function () {
  const NS = "http://www.w3.org/2000/svg";
  const HEIGHT = 230;
  const MAX_POINTS = 420;     // More days than this are drawn every few days (the day picked is always the last)
  const MAX_TABLE_ROWS = 60;  // The most days "See the numbers" lists (spread across the stretch)
  const MAX_LINES = 8;        // Past this the last lines are added together as Other: there are only so many colors to tell apart
  const WIDE_ENOUGH = 460;    // Pixels wide before each line's name fits at its right end
  const LONG_STRETCH = 300 * 86400000; // Past this much time, the days along the bottom say the month and year instead
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

  // Lines past MAX_LINES as one more line, Other, each day's value added together
  function foldedLines(lines) {
    if (lines.length <= MAX_LINES) return lines;
    const rest = lines.slice(MAX_LINES - 1);
    const byDay = new Map();
    for (const line of rest) {
      for (const point of line.points) {
        const time = point.date.getTime();
        byDay.set(time, (byDay.get(time) || 0) + point.value);
      }
    }
    const points = [...byDay].sort((a, b) => a[0] - b[0]).map(([time, value]) => ({ date: new Date(time), value: Math.round(value * 100) / 100 }));
    return [...lines.slice(0, MAX_LINES - 1), { name: `Other (${rest.length})`, points }];
  }

  function create({ label, from, series, note = "", money = true, min = null, max = null, pickDay = true, dashAhead = true, emptyNote = "Nothing to draw for these days yet.", level = 3 }) {
    const id = ++count;
    const el = BudgetUI.element("div", "lineGraph");
    const heading = BudgetUI.element("div", "lineGraphTitle", label);
    heading.id = `lineGraphTitle${id}`;
    heading.setAttribute("role", "heading");
    heading.setAttribute("aria-level", String(level));
    el.append(heading);

    const day = pickDay ? BudgetUI.dateField({ label: "Show through", date: today, min, max, hint: "On today to start. Pick a later day to see what your budget expects, drawn dashed." }) : null;
    if (day) el.append(day.el);
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
    const tableBox = BudgetUI.element("details", "lineGraphTable");
    const tableLabel = BudgetUI.element("summary", "", "See the numbers");
    const tableHolder = BudgetUI.element("div", "bobScroll");
    tableBox.append(tableLabel, tableHolder);
    el.append(problem, plot, keyboard, spoken, empty, legend, tableBox);
    if (note) el.append(BudgetUI.element("p", "panelHint", note));

    const hidden = new Set();    // The names of the lines hidden with the legend
    const slots = new Map();     // Each line's color, by its name: it keeps it however the others change
    let until = today;
    let lines = [];
    let dates = [];              // Every day drawn, oldest first
    let layout = null;           // Where things are: { x(index) }
    let pointed = -1;            // The day being read (an index into dates), or -1

    const show = (value) => (money ? formatMoney(value) : String(Math.round(value * 100) / 100));
    const slotOf = (name) => {
      if (!slots.has(name)) slots.set(name, slots.size % MAX_LINES);
      return slots.get(name);
    };
    const colorOf = (name) => (lines.length === 1 ? "var(--GRAPH_ONE)" : `var(--SERIES_${slotOf(name) + 1})`);
    const valueOn = (line, date) => line.byDay.get(date.getTime());
    const shownLines = () => lines.filter(line => !hidden.has(line.name));

    // The lines for the stretch, from the page's numbers
    function work() {
      const first = from(until);
      lines = foldedLines(series(first < until ? first : addDays(until, -1), until).filter(line => line.points.length > 0))
        .map(line => {
          const points = thinned(line.points);
          return { name: line.name, points, byDay: new Map(points.map(point => [point.date.getTime(), point.value])) };
        });
      const times = new Set();
      for (const line of lines) for (const point of line.points) times.add(point.date.getTime());
      dates = [...times].sort((a, b) => a - b).map(time => new Date(time));
    }

    // The picture, at the width it has
    function paint() {
      svg.replaceChildren();
      tip.hidden = true;
      pointed = -1;
      const hasData = dates.length >= 2 && shownLines().length > 0;
      plot.hidden = !hasData;
      empty.hidden = hasData;
      if (!hasData) {
        empty.textContent = dates.length >= 2 ? "Every line is hidden. Tap a name below to show it." : emptyNote;
        return;
      }
      const width = plot.clientWidth;
      if (width === 0) return; // (Not on the screen yet: drawn when it is)
      svg.setAttribute("viewBox", `0 0 ${width} ${HEIGHT}`);
      svg.setAttribute("width", String(width));
      svg.setAttribute("height", String(HEIGHT));
      const drawn = shownLines();
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

      for (const line of drawn) {
        const color = colorOf(line.name);
        const path = (points) => points.map((point, at) => `${at ? "L" : "M"}${xOf(point.date).toFixed(1)} ${yOf(point.value).toFixed(1)}`).join(" ");
        const past = line.points.filter(point => point.date <= today);
        const ahead = line.points.filter(point => point.date >= today);
        // (With the days thinned out, no point may land on today: the dashes start from the last point before it)
        if (past.length > 0 && ahead.length > 0 && past[past.length - 1].date < ahead[0].date) ahead.unshift(past[past.length - 1]);
        if (past.length >= 2) svgEl("path", { d: path(past), class: "lineGraphLine", stroke: color }, svg);
        if (ahead.length >= 2) svgEl("path", { d: path(ahead), class: dashAhead ? "lineGraphLine isAhead" : "lineGraphLine", stroke: color }, svg);
        if (past.length < 2 && ahead.length < 2 && line.points.length === 1) svgEl("circle", { cx: xOf(line.points[0].date), cy: yOf(line.points[0].value), r: 4, fill: color }, svg);
      }

      // Each line's name at its right end, moved apart where they'd land on each other
      if (directLabels) {
        const ends = drawn.map(line => ({ line, y: yOf(line.points[line.points.length - 1].value) })).sort((a, b) => a.y - b.y);
        for (let at = 1; at < ends.length; at++) ends[at].y = Math.max(ends[at].y, ends[at - 1].y + 14);
        for (const end of ends) {
          const words = end.line.name.length > 13 ? `${end.line.name.slice(0, 12)}…` : end.line.name;
          svgEl("text", { x: width - room.right + 6, y: Math.min(end.y + 4, HEIGHT - room.bottom), class: "lineGraphLabel" }, svg).textContent = words;
        }
      }
      svgEl("line", { class: "lineGraphCrosshair", y1: room.top, y2: HEIGHT - room.bottom, x1: -9, x2: -9 }, svg);
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
      const rows = shownLines().map(line => ({ name: line.name, value: valueOn(line, date), color: colorOf(line.name) })).filter(row => row.value !== undefined);
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

    // The legend (with two lines or more): a line key and its name, each a button that hides or shows it
    function drawLegend() {
      legend.hidden = lines.length < 2;
      legend.replaceChildren(...(lines.length < 2 ? [] : lines.map(line => {
        const item = BudgetUI.element("li");
        const button = BudgetUI.element("button", "lineGraphLegendButton");
        button.type = "button";
        button.setAttribute("aria-pressed", String(!hidden.has(line.name)));
        button.title = `Show or hide ${line.name}`;
        const key = BudgetUI.element("span", "lineGraphKey");
        key.style.background = colorOf(line.name);
        button.append(key, BudgetUI.noTranslate(BudgetUI.element("span", "", line.name)));
        button.addEventListener("click", () => {
          if (hidden.has(line.name)) hidden.delete(line.name);
          else hidden.add(line.name);
          drawLegend();
          paint();
          fillTable();
        });
        item.append(button);
        return item;
      })));
    }

    // "See the numbers": the same figures in a table, newest day first, spread across the stretch when there are many days
    function fillTable() {
      const drawn = shownLines();
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

    // A new day in the box
    if (day) {
      const onDay = () => {
        const picked = day.value();
        problem.hidden = true;
        if (!(picked instanceof Date)) {
          problem.textContent = `Enter a day to show through (${datePattern()}).`;
          problem.hidden = false;
          return;
        }
        if ((min && picked < min) || (max && picked > max)) {
          problem.textContent = `Pick a day from ${min ? showDate(min) : "the start"} through ${max ? showDate(max) : "today"}.`;
          problem.hidden = false;
          return;
        }
        until = createSafeMidnight(picked);
        draw();
      };
      day.input.addEventListener("change", onDay);
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
    return { el, draw, until: () => until };
  }

  return { create };
})();
