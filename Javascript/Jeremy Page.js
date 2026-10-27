// Jeremy Page: Jeremy's own page (Menu > Jeremy, or tap his card on Home). His message on Home stays quick and in plain
// words; everything heavier he works out waits for this page, and only runs while it's open.
//
// PROGRAMMING NOTE, for every change to this page:
//   - The very top card, the one with Jeremy's picture, gives a breakdown of the highlights from every card on the page
//     that's on. Each card's render returns its highlight (see CARDS), and a new card needs one too.
//   - Every card has a help button (a "?" in a circle) to the right of its title, with a short, clear note on what the
//     card is for (its help, see CARDS). A new card needs one too.
//   - Data and Accounts always run. Every other card has an on/off switch, starts off, and works nothing out while it's
//     off. Which are on is kept with the budget (Jeremy's page in Process Budget.js), so every device shows the same.
//   - Anything that shows from a tap (a table, a list) opens in a floating window (BudgetUI.openPanel), not in the page.
//
// The cards, top to bottom: Jeremy's highlights; Data (what every card below works from); Accounts (each account now and
// on a day picked, interest too); Goals; Needs, Wants, And Future (a pie chart of what each purpose cost); then one for
// each of his tips: Payday, Spending Pace, Big Bills, Weekly Check, Catchup Entries, and Refunds.

// =====================================================================
// #region SETUP
// =====================================================================

const BIG_BILL = 200;           // Big Bills: a cost of at least this much...
const BILL_DAYS = 60;           // ...in the next this many days
const HISTORY_MONTHS = 4;       // Payday and Spending Pace look this far back, and need this much History
const PAYDAY_GAP = 4;           // Paychecks fewer days apart than this (like two people's, a day apart) are one payday
const PAYDAY_LOOK = 62;         // How far ahead the next payday is looked for
const PACE_OVER = 50;           // Spending Pace speaks up when the last 7 days are at least this much over a usual week...
const PACE_RATIO = 1.25;        // ...and at least this many times it
const CATCHUP_LIMIT = 100;      // Catchup Entries speaks up when the last 30 days' add up to at least this much
const CATCHUP_DAYS = 30;
const REFUND_DAYS = 30;         // Refunds looks this far back for purchases
const REFUNDS_SHOWN = 5;
const AHEAD_YEARS = 10;         // Accounts and Goals look up to this far ahead
const PURPOSE_DAYS = 30;        // Needs, Wants, And Future starts on this many days, through today...
const PURPOSE_AHEAD_DAYS = 730; // ...and looks up to two years ahead, like Search
const ACCOUNTS_DAY_KEY = "prismal_jeremy_accounts_day"; // The day this device picked for Accounts (Layout.js keeps it)

// Each card under the highlights: its id (its switch's, see JEREMY_CARDS in Process Budget.js), title, help (what its "?"
// shows), setup(card) (what it keeps while the page is open, like its date boxes: returned to go above what it shows), and
// render(card, shared) (draws it, and returns its highlight: { text, warn } or null)
const CARDS = [
  {
    id: "data",
    title: "Data",
    help: "What Jeremy works everything out from: your History, paydays, spending, and bills ahead. The cards below use these numbers. Tap a row with › to see what's behind it.",
    render: renderDataCard
  },
  {
    id: "accounts",
    title: "Accounts",
    help: "What In Bank, each Other Account, and the Total hold now, and what your budget says they'll hold on the day picked at the top (counting recurring entries, connected spreadsheets, Upcoming, and interest). This device remembers the day.",
    setup: setupAccountsCard,
    render: renderAccountsCard
  },
  {
    id: "goals",
    title: "Goals",
    help: "Amounts for In Bank, the Total, or an Other Account to reach, by a day if you like. Jeremy works out what to set aside from each payday to get there, and warns you when one is in danger. A credit card's can be $0.00: paid off.",
    setup: setupGoalsCard,
    render: renderGoalsCard
  },
  {
    id: "purposes",
    title: "Needs, Wants, And Future",
    help: "Once it's on, every entry form asks what a title's money is for: Needs (like rent and groceries), Wants (like eating out), or Future (like savings, or paying down a card). The pie chart adds up what each cost between the days picked; tap a slice to see its entries.",
    setup: setupPurposesCard,
    render: renderPurposesCard
  },
  {
    id: "payday",
    title: "Payday",
    help: `About how much usually goes out between paychecks besides your recurring bills, from your last ${HISTORY_MONTHS} months (it needs ${HISTORY_MONTHS} months of History), and on a payday, a heads-up to spend carefully.`,
    render: renderPaydayCard
  },
  {
    id: "pace",
    title: "Spending Pace",
    help: `The last 7 days' spending besides recurring bills, next to a usual week from the ${HISTORY_MONTHS} months before (it needs ${HISTORY_MONTHS} months of History). Jeremy speaks up at $${PACE_OVER} and ${Math.round((PACE_RATIO - 1) * 100)}% over.`,
    render: renderPaceCard
  },
  {
    id: "bills",
    title: "Big Bills",
    help: `Bills of $${BIG_BILL} or more in the next ${BILL_DAYS} days that don't come every month (like a yearly insurance bill, or a one-time cost added for a later day), and what to set aside from each paycheck for the next one.`,
    render: renderBillsCard
  },
  {
    id: "weekly",
    title: "Weekly Check",
    help: "A Sunday reminder to compare today's In Bank with what your bank really has, and add what's missing (or let a Catchup entry make up the difference).",
    render: renderWeeklyCard
  },
  {
    id: "catchup",
    title: "Catchup Entries",
    help: `Your Catchup entries (the ones that fix In Bank to match your bank) from the last ${CATCHUP_DAYS} days, added up. $${CATCHUP_LIMIT} or more means purchases are slipping by.`,
    render: renderCatchupCard
  },
  {
    id: "refund",
    title: "Refunds",
    help: `When Lowest in bank after today goes below $0, Jeremy looks for purchases from the last ${REFUND_DAYS} days (or still to come before that day) that a refund, or skipping one, would cover it with.`,
    render: renderRefundCard
  }
];

const TOP_HELP = "A quick look at what every card that's on has to say, one line each. Turn a card on or off with the switch at its right.";

let pageCards = [];    // The cards as made: [{ def, el, toggle, state, body, results, highlight }] (see buildCard)
let highlightList = null;
let switching = false; // A card's switch is being saved

window.workspaceReady.then((loaded) => {
  const status = document.getElementById("dataStatus");
  if (!loaded) {
    if (status) status.textContent = "Couldn't load your budget data. Please refresh to try again.";
    return;
  }
  if (status) status.hidden = true;
  buildPage();
  renderPage();
});

document.addEventListener("budget:updated", () => {
  if (workspaceLoaded && pageCards.length > 0) renderPage();
});

//#endregion

// =====================================================================
// #region THE PAGE
// =====================================================================

// The cards, made once: their titles, help, switches, and boxes stay while the page is open (so a box being typed in or a
// switch just tapped stays put), and what they show is drawn again with every change
function buildPage() {
  const top = document.getElementById("jeremyTop");
  const { head, help } = cardHead("Jeremy's Highlights", TOP_HELP, "jeremyTop");
  highlightList = BudgetUI.element("ul", "jeremyHighlights");
  top.querySelector(".jeremyTopText").append(head, help, highlightList);
  top.hidden = false;
  pageCards = CARDS.map(buildCard);
  document.getElementById("dataView").replaceChildren(...pageCards.map(card => card.el));
}

// One card: its title and help, its switch (when it has one), and what it shows
function buildCard(def) {
  const el = BudgetUI.element("section", "budgetCard jeremySection");
  el.id = `${def.id}Card`;
  const { head, help, title } = cardHead(def.title, def.help, def.id);
  el.setAttribute("aria-labelledby", title.id);
  const card = { def, el, toggle: null, state: null, body: BudgetUI.element("div", "sectionBody"), results: BudgetUI.element("div", "sectionResults"), highlight: null };
  if (JEREMY_CARDS.has(def.id)) {
    const label = BudgetUI.element("label", "sectionSwitch");
    const toggle = BudgetUI.element("input", "pillSwitch");
    toggle.type = "checkbox";
    toggle.setAttribute("role", "switch");
    toggle.setAttribute("aria-label", `${def.title} on or off`);
    toggle.addEventListener("change", () => switchCard(card, toggle.checked));
    card.state = BudgetUI.element("span", "sectionState", "Off");
    label.append(card.state, toggle);
    head.append(label);
    card.toggle = toggle;
  }
  const controls = def.setup ? def.setup(card) : null;
  card.body.append(...[controls, card.results].filter(Boolean));
  el.append(head, help, card.body);
  return card;
}

// A card's title, with its help button (a "?" in a circle) right after it, and the note that shows under the title
function cardHead(text, helpText, id) {
  const head = BudgetUI.element("div", "sectionHead");
  const title = BudgetUI.element("h2", "sectionTitle", text);
  title.id = `${id}Title`;
  const help = BudgetUI.element("p", "sectionHelp", helpText);
  help.id = `${id}Help`;
  help.hidden = true;
  const button = BudgetUI.element("button", "fieldHelpButton sectionHelpButton", "?");
  button.type = "button";
  button.title = `What ${text} is for`;
  button.setAttribute("aria-label", button.title);
  button.setAttribute("aria-controls", help.id);
  button.setAttribute("aria-expanded", "false");
  button.addEventListener("click", () => {
    help.hidden = !help.hidden;
    button.setAttribute("aria-expanded", String(!help.hidden));
  });
  head.append(title, button);
  return { head, help, title };
}

// Draw every card that's on (one that's off shows only its title and switch), then the highlights from them
function renderPage() {
  const shared = sharedFigures();
  for (const card of pageCards) drawCard(card, shared);
  renderHighlights();
}

// Draw one card, keeping its highlight for the top card
function drawCard(card, shared = sharedFigures()) {
  const on = jeremyCardOn(card.def.id);
  showSwitch(card, on);
  card.el.classList.toggle("isOff", !on);
  card.body.hidden = !on;
  card.highlight = null;
  if (!on) {
    card.results.replaceChildren();
    return;
  }
  try {
    card.highlight = card.def.render(card, shared) || null;
  } catch (error) {
    console.error(`Jeremy's ${card.def.title} card couldn't be worked out:`, error);
    card.results.replaceChildren(BudgetUI.element("p", "panelHint", "Jeremy couldn't work this card out. Please refresh to try again."));
  }
}

// A card's switch as the budget has it (off while one is saving)
function showSwitch(card, on) {
  if (!card.toggle) return;
  card.toggle.checked = on;
  card.toggle.disabled = switching;
  card.state.textContent = on ? "On" : "Off";
}

// A card's switch was tapped: it's saved with the budget (so every device follows), and the page is drawn again
async function switchCard(card, on) {
  if (switching) return;
  switching = true;
  for (const other of pageCards) if (other.toggle) other.toggle.disabled = true;
  card.state.textContent = on ? "On" : "Off";
  const result = await turnJeremyCard(card.def.id, on);
  switching = false;
  for (const other of pageCards) showSwitch(other, jeremyCardOn(other.def.id));
  if (!result.ok) BudgetUI.showToast(result.message || "That didn't work. Please try again.", true);
  else BudgetUI.warnIfUnsaved(result);
}

// The top card: a line from each card that's on (red-orange for one that needs a look), and how many are off
function renderHighlights() {
  const items = [];
  for (const card of pageCards) {
    if (!card.highlight) continue;
    const item = BudgetUI.element("li", card.highlight.warn ? "jeremyHighlight isWarning" : "jeremyHighlight");
    item.append(BudgetUI.element("strong", "", `${card.def.title}: `), card.highlight.text);
    items.push(item);
  }
  const off = pageCards.filter(card => card.toggle && !jeremyCardOn(card.def.id)).length;
  if (off > 0) {
    items.push(BudgetUI.element("li", "jeremyHighlight isQuiet", off === 1
      ? "One more card is off. Turn it on below to see what it has to say here."
      : `${off} more cards are off. Turn any of them on below to see what they have to say here.`));
  }
  highlightList.replaceChildren(...items);
}

// What more than one card works from, each worked out the first time a card asks for it (once per drawing of the page)
function sharedFigures() {
  const made = new Map();
  const once = (key, make) => () => {
    if (!made.has(key)) made.set(key, make());
    return made.get(key);
  };
  const shared = {
    spending: once("spending", spendingByDay),
    lowest: once("lowest", lowestAhead),
    payday: once("payday", () => paydayFigures(shared.spending())),
    bills: once("bills", bigBills),
    catchup: once("catchup", catchupEntries),
    summaries: once("summaries", () => accountSummaries()),
    projection: once("projection", () => projectBudget(furthestDay(), shared.summaries()))
  };
  return shared;
}

//#endregion

// =====================================================================
// #region DATA
// =====================================================================
// Everything the cards work from, as a list: each row's figure, with a note under it, and the rows with more behind them
// open it in a window.

function renderDataCard(card, shared) {
  const spending = shared.spending();
  const payday = shared.payday();
  const lowest = shared.lowest();
  const bills = shared.bills();
  const catchup = shared.catchup();
  const purchases = purchasesBetween(addDays(today, -(REFUND_DAYS - 1)), today);
  const recurring = recurringEachMonth();
  const oldest = oldestHistoryDay();
  const pace = paceFigures(spending);
  const inBank = inBankToday();
  const spent = purchases.reduce((total, purchase) => total - purchase.amount, 0);
  const dayCount = (date) => getDayDifference(date, today);

  const list = BudgetUI.element("ul", "jeremyData");
  list.append(
    dataRow("History", oldest ? `From ${showDate(oldest)}` : "None yet",
      oldest ? (spending.enough ? `${HISTORY_MONTHS} months or more: enough for every card` : `Payday and Spending Pace need ${HISTORY_MONTHS} months of it`) : "Each week moves into History as it passes"),
    dataRow("In Bank today", formatMoney(inBank), "", { amount: inBank }),
    dataRow("Lowest in bank after today", formatMoney(lowest.amount), `On ${showDay(lowest.date)}`, { amount: lowest.amount }),
    dataRow("Recurring entries each month", formatMoney(recurring.costs), `In bills, and ${formatMoney(recurring.gains)} in gains`, { open: (origin) => openRecurringWindow(origin, recurring) }),
    dataRow("Paydays", payday.next ? showDay(payday.next) : "None coming", payday.next ? `The next one, in ${dayCount(payday.next)} ${dayCount(payday.next) === 1 ? "day" : "days"}` : `No paycheck in the next ${PAYDAY_LOOK} days`,
      { open: (origin) => openPaydaysWindow(origin, spending, payday) }),
    dataRow("Spent besides recurring bills", formatMoney(pace ? pace.thisWeek : lastWeekSpent(spending)), pace ? `In the last 7 days (a usual week: ${formatMoney(pace.usualWeek)})` : "In the last 7 days",
      { open: (origin) => openWeeksWindow(origin, spending) }),
    dataRow("Usually spent between paychecks", payday.average === null ? "--" : formatMoney(payday.average),
      payday.average === null ? `Needs ${HISTORY_MONTHS} months of History` : `In the ${payday.span} days from a payday, besides recurring bills`),
    dataRow(`Catchup entries, last ${CATCHUP_DAYS} days`, formatMoney(catchup.total), `${catchup.entries.length} ${catchup.entries.length === 1 ? "entry" : "entries"}`,
      { open: (origin) => openEntriesWindow(origin, `Catchup Entries, Last ${CATCHUP_DAYS} Days`, catchup.entries, `None in the last ${CATCHUP_DAYS} days.`) }),
    dataRow(`Big bills, next ${BILL_DAYS} days`, String(bills.length), bills[0] ? `The first: ${capitalize(bills[0].title)} on ${showDay(bills[0].date)}` : "None",
      { open: (origin) => openEntriesWindow(origin, `Big Bills, Next ${BILL_DAYS} Days`, bills, `None in the next ${BILL_DAYS} days.`) }),
    dataRow(`Purchases, last ${REFUND_DAYS} days`, formatMoney(spent), `${purchases.length} Regular ${purchases.length === 1 ? "cost" : "costs"} added by hand or with Quick Entry`,
      { open: (origin) => openEntriesWindow(origin, `Purchases, Last ${REFUND_DAYS} Days`, purchases, `None in the last ${REFUND_DAYS} days.`) })
  );
  card.results.replaceChildren(list);
  return { text: `In Bank is ${formatMoney(inBank)} today, and the lowest it gets is ${formatMoney(lowest.amount)} on ${showDay(lowest.date)}.`, warn: lowest.amount < 0 };
}

// One of Data's rows: what it is (and a note under it), and its figure. One with more behind it (open: opens it, given
// the row) is a button with a ›.
function dataRow(label, value, note = "", { amount = null, open = null } = {}) {
  const item = BudgetUI.element("li", "jeremyDataItem");
  const row = BudgetUI.element(open ? "button" : "div", "jeremyDataRow");
  if (open) {
    row.type = "button";
    row.addEventListener("click", () => open(row));
  }
  const text = BudgetUI.element("span", "jeremyDataText");
  text.append(BudgetUI.element("span", "jeremyDataLabel", label));
  if (note) text.append(BudgetUI.element("span", "jeremyDataNote", note));
  const figure = BudgetUI.noTranslate(BudgetUI.element("span", "jeremyDataValue", value));
  if (amount !== null && amount < 0) figure.classList.add("negative");
  row.append(text, figure);
  if (open) row.append(BudgetUI.element("span", "jeremyDataMore", "›"));
  item.append(row);
  return item;
}

// In Bank today
function inBankToday() {
  const spot = calendarSpot(today);
  return (spot && readInBank(calendarData[spot.r][spot.c])) ?? 0;
}

// The lowest In Bank from today through the 28 days after the calendar (Lowest in bank after today), and its day
function lowestAhead() {
  let lowest = null;
  const consider = (date, amount) => {
    if (amount !== null && (!lowest || amount < lowest.amount)) lowest = { amount, date };
  };
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 7; c++) if (gridDates[r][c] >= today) consider(gridDates[r][c], readInBank(calendarData[r][c]));
  }
  for (const [date, amount] of predictedInBank) consider(date, amount);
  return lowest || { amount: 0, date: today };
}

// Each day in History and on the calendar from `from` through `to`: visit(date, its lines, the day's own line left off)
function eachDay(from, to, visit) {
  for (let r = 1; r < historyData.length; r++) {
    for (let c = 0; c < 7; c++) {
      const text = String(historyData[r][c] ?? "");
      if (!text.trim()) continue;
      const lines = text.split("\n");
      const date = createSafeMidnight(lines[0].trim(), true);
      if (!isNaN(date.getTime()) && date >= from && date <= to) visit(date, lines.slice(1));
    }
  }
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 7; c++) {
      if (gridDates[r][c] >= from && gridDates[r][c] <= to) visit(gridDates[r][c], String(calendarData[r][c] ?? "").split("\n").slice(1));
    }
  }
}

// Each day from 4 months ago through today, from History and the calendar: { spent, payday }, where spent is what went
// out of In Bank besides recurring bills (Regular costs that didn't come from a recurring entry or a connected
// spreadsheet). enough: History reaches back the whole 4 months. { days: Map(day's time -> day), enough }
function spendingByDay() {
  const from = addMonths(today, -HISTORY_MONTHS);
  const days = new Map();
  eachDay(from, today, (date, lines) => {
    const day = { spent: 0, payday: false };
    for (const text of lines) {
      const line = readLine(text);
      if (line.blank || line.system) continue;
      if (isPaycheckLine(text)) day.payday = true;
      if (line.amount < 0 && getSpecialType(line.sprite) === "❗️" && !entryMark(line.sprite)) day.spent -= line.amount;
    }
    days.set(date.getTime(), day);
  });
  const oldest = oldestHistoryDay();
  return { days, enough: !!oldest && oldest <= from };
}

// What went out in the last 7 days (today too), besides recurring bills
function lastWeekSpent(spending) {
  const weekStart = addDays(today, -6).getTime();
  let spent = 0;
  for (const [time, day] of spending.days) if (time >= weekStart) spent += day.spent;
  return spent;
}

// A paycheck: a gain from a recurring entry or a connected spreadsheet (its line has a ✔️ or ➕) that's Regular (not
// Hidden or a transfer)
function isPaycheckLine(line) {
  const { sprite, amount } = readLine(line);
  return !!entryMark(sprite) && getSpecialType(sprite) === "❗️" && amount > 0;
}

// The days that land a paycheck from a recurring entry or a connected spreadsheet, from first through last
function paycheckDays(first, last) {
  const paychecks = getParsedRecurringRows().filter(row => row.amt > 0 && row.parsed.special === "❗️");
  const sheetDays = sheetEntriesByDay(first, last);
  const found = [];
  for (let day = first; day <= last; day = addDays(day, 1)) {
    const fromSheet = [...(sheetDays.get(day.getTime())?.values() || [])].some(entry => entry.special === "❗️" && entry.amount > 0);
    if (fromSheet || paychecks.some(row => recurringRowHits(row.parsed, day))) found.push(day);
  }
  return found;
}

// Paydays from first through last: the paycheck days, with one fewer than PAYDAY_GAP days after the one before counted as
// that one (two people's paychecks a day apart are one payday)
function paydaysBetween(first, last) {
  const paydays = [];
  for (const day of paycheckDays(first, last)) {
    if (paydays.length === 0 || getDayDifference(day, paydays[paydays.length - 1]) >= PAYDAY_GAP) paydays.push(day);
  }
  return paydays;
}

// What Payday works from: { isPayday (today has a paycheck), next (the next payday: on a payday, the next one a few days
// off or more), span (the days from a payday to the next: from today to next on a payday, otherwise from next to the one
// after it; 14 without them), average (what usually goes out in that many days from a payday, besides recurring bills;
// null without 4 months of History), counted (how many paydays it averaged) }
function paydayFigures(spending) {
  const spot = calendarSpot(today);
  const isPayday = !!spot && String(calendarData[spot.r][spot.c]).split("\n").slice(1).some(isPaycheckLine);
  const next = paydaysBetween(addDays(today, isPayday ? PAYDAY_GAP : 1), addDays(today, PAYDAY_LOOK))[0] || null;
  let span = 14;
  if (isPayday && next) span = getDayDifference(next, today);
  if (!isPayday && next) {
    const after = paydaysBetween(addDays(next, PAYDAY_GAP), addDays(next, PAYDAY_LOOK))[0];
    if (after) span = getDayDifference(after, next);
  }
  if (!spending.enough) return { isPayday, next, span, average: null, counted: 0 };

  // What went out in the span from each payday in those 4 months, on average (or, with none to go by, a day's average
  // times the span)
  const sums = [];
  let total = 0;
  let pastDays = 0;
  for (const [time, day] of spending.days) {
    if (time >= today.getTime()) continue;
    total += day.spent;
    pastDays++;
    const start = new Date(time);
    if (!day.payday || addDays(start, span) > today) continue;
    let sum = 0;
    for (let d = 0; d < span; d++) sum += spending.days.get(addDays(start, d).getTime())?.spent || 0;
    sums.push(sum);
  }
  const average = sums.length > 0 ? sums.reduce((a, b) => a + b, 0) / sums.length : (pastDays ? total / pastDays * span : 0);
  return { isPayday, next, span, average: Math.round(average * 100) / 100, counted: sums.length };
}

// Spending Pace's figures: the last 7 days (today too), besides recurring bills, and a usual week in the 4 months before
// them: { thisWeek, usualWeek, over, flagged (at least $50 and 25% over) }, or null without 4 months of History
function paceFigures(spending) {
  if (!spending.enough) return null;
  const weekStart = addDays(today, -6).getTime();
  let thisWeek = 0;
  let before = 0;
  let beforeDays = 0;
  for (const [time, day] of spending.days) {
    if (time >= weekStart) {
      thisWeek += day.spent;
    } else {
      before += day.spent;
      beforeDays++;
    }
  }
  if (beforeDays < 28) return null;
  const usualWeek = before / beforeDays * 7;
  const over = thisWeek - usualWeek;
  return { thisWeek, usualWeek, over, flagged: over >= PACE_OVER && thisWeek >= usualWeek * PACE_RATIO };
}

// Recurring entries each month: what the bills and the gains come to (transfers left out), and each one's share:
// { costs, gains, rows: [{ title, frequency, amount, monthly }] }
function recurringEachMonth() {
  const rows = [];
  let costs = 0;
  let gains = 0;
  for (const row of getParsedRecurringRows()) {
    if (isTransferEntry(row.sprite) || (row.parsed.endDate && row.parsed.endDate < today)) continue;
    const monthly = Math.round(row.amt * timesPerMonth(row.parsed.frequency) * 100) / 100;
    if (monthly < 0) costs += monthly;
    else gains += monthly;
    rows.push({ title: row.title, frequency: formatFrequency(row.parsed.frequency), amount: row.amt, monthly });
  }
  return { costs: Math.round(costs * 100) / 100, gains: Math.round(gains * 100) / 100, rows: rows.sort((a, b) => a.monthly - b.monthly) };
}

// Catchup entries (titled Catchup or Catch Up, as costs; never Hidden, which doesn't change In Bank) in the last 30 days:
// { total (what they took, above $0), entries: [{ date, title, amount }] newest first }
function catchupEntries() {
  const entries = [];
  eachDay(addDays(today, -(CATCHUP_DAYS - 1)), today, (date, lines) => {
    for (const text of lines) {
      const line = readLine(text);
      if (line.blank || line.system || line.amount >= 0 || getSpecialType(line.sprite) === "✖️") continue;
      if (/^catch ?up$/.test(line.clean)) entries.push({ date, title: line.title, amount: line.amount });
    }
  });
  entries.sort((a, b) => b.date - a.date);
  return { total: Math.round(-entries.reduce((sum, entry) => sum + entry.amount, 0) * 100) / 100, entries };
}

// Purchases from `from` through `to`: Regular costs added by hand or with a Quick Entry icon (not from a recurring entry or
// a connected spreadsheet, and not placeholders), on History's days, the calendar's, and in Upcoming. [{ date, title,
// amount }], newest first.
function purchasesBetween(from, to) {
  const found = [];
  const add = (date, text) => {
    const line = readLine(text);
    if (line.blank || line.system || !line.title || line.amount >= 0) return;
    if (getSpecialType(line.sprite) !== "❗️" || entryMark(line.sprite) || isPlaceholder(line.sprite)) return;
    found.push({ date, title: line.title, amount: line.amount });
  };
  eachDay(from, to, (date, lines) => lines.forEach(text => add(date, text)));
  for (const row of futureData.slice(1)) {
    const date = createSafeMidnight(row[2], true);
    if (!String(row[0] ?? "").trim() || isNaN(date.getTime()) || date <= gridEndDate || date < from || date > to) continue;
    add(date, `${String(row[3]).trim()} ${formatMoney(parseAmount(row[1]))} ${String(row[0]).trim()}`);
  }
  return found.sort((a, b) => b.date - a.date);
}

// The big bills in the next 60 days: recurring costs of $200 or more that land every 3 months or less often, a connected
// spreadsheet's cost of $200 or more with no other like it within 90 days, and one-time costs of $200 or more added for a
// later day (on the calendar or in Upcoming), never transfers. A recurring entry that lands more often (like every month)
// is never one: not as it lands, not changed for its day (a temp, on the calendar or in Upcoming), and not an entry with
// its title and type added for a day by hand. [{ date, title, amount }], soonest first.
function bigBills() {
  const lastDay = addDays(today, BILL_DAYS);
  const recurringRows = getParsedRecurringRows();
  const uncommon = recurringRows.filter(row => row.amt <= -BIG_BILL && !isTransferEntry(row.sprite) && isUncommonFrequency(row.parsed.frequency));
  const uncommonKeys = new Set(uncommon.map(row => row.parsed.cleanTitle + "|" + row.parsed.special));
  const frequentKeys = new Set(recurringRows.filter(row => !isUncommonFrequency(row.parsed.frequency)).map(row => row.parsed.cleanTitle + "|" + row.parsed.special));
  const uncommonSheets = uncommonSheetKeys(); // A spreadsheet's cost with no other like it within 90 days
  // Is this cost (title and type as compared, on its day) a big bill?
  const isUncommonBill = (key, mark, day) => !frequentKeys.has(key) &&
    (!mark || (mark === RECURRING_MARK ? uncommonKeys.has(key) : uncommonSheets.has(day.getTime() + "|" + key)));
  const bills = [];

  // On the calendar after today: uncommon recurring and spreadsheet ones as they are there (one changed for its day
  // counts as changed), and one-time costs added for those days
  for (let day = addDays(today, 1); day <= gridEndDate && day <= lastDay; day = addDays(day, 1)) {
    const spot = calendarSpot(day);
    for (const line of String(calendarData[spot.r][spot.c]).split("\n").slice(1)) {
      const parts = getParts(line);
      const amount = parseAmount(parts[1]);
      if (amount > -BIG_BILL || systemEmojis.includes(parts[0]) || isTransferEntry(parts[0])) continue;
      if (isUncommonBill(extractTitle(line) + "|" + getSpecialType(parts[0]), entryMark(parts[0]), day)) {
        bills.push({ date: day, title: parts.slice(2).join(" "), amount });
      }
    }
  }

  // After the calendar: where they'll land (unless an Upcoming entry changed that day), and Upcoming costs
  const upcoming = futureData.slice(1)
    .map(row => ({ date: createSafeMidnight(row[2], true), title: String(row[0] ?? "").trim(), amount: parseAmount(row[1]), sprite: String(row[3] ?? "") }))
    .filter(row => row.title && !isNaN(row.date.getTime()));
  const changed = new Set(upcoming.filter(row => entryMark(row.sprite)).map(row => row.date.getTime() + "|" + cleanString(row.title) + "|" + getSpecialType(row.sprite)));
  if (uncommon.length > 0) {
    for (let day = nextFourStart; day <= lastDay; day = addDays(day, 1)) {
      for (const row of uncommon) {
        if (recurringRowHits(row.parsed, day) && !changed.has(day.getTime() + "|" + row.parsed.cleanTitle + "|" + row.parsed.special)) {
          bills.push({ date: day, title: row.title, amount: row.amt });
        }
      }
    }
  }
  for (const [time, day] of sheetEntriesByDay(nextFourStart, lastDay)) {
    for (const entry of day.values()) {
      const key = time + "|" + entry.clean + "|" + entry.special;
      if (entry.amount <= -BIG_BILL && entry.special !== "⭕️" && isUncommonBill(entry.clean + "|" + entry.special, SHEET_MARK, new Date(time)) && !changed.has(key)) {
        bills.push({ date: new Date(time), title: entry.title, amount: entry.amount });
      }
    }
  }
  for (const row of upcoming) {
    if (row.date <= gridEndDate || row.date > lastDay || row.amount > -BIG_BILL || isTransferEntry(row.sprite)) continue;
    if (isUncommonBill(cleanString(row.title) + "|" + getSpecialType(row.sprite), entryMark(row.sprite), row.date)) {
      bills.push({ date: row.date, title: row.title, amount: row.amount });
    }
  }
  return bills.sort((a, b) => a.date - b.date);
}

//#endregion

// =====================================================================
// #region WINDOWS (what's behind a figure, floating over the page)
// =====================================================================

// A floating window with a table in a box that scrolls, and a note over it: columns (titles), rows (each a list of
// cells: text, or { text, amount } for an amount, red or green by its sign)
function openTableWindow(origin, { title, intro = "", columns, rows, empty = "Nothing to show." }) {
  BudgetUI.openPanel({
    origin,
    size: "large",
    title,
    build(form, panel) {
      form.addEventListener("submit", (event) => event.preventDefault()); // (Nothing to send)
      if (intro) form.append(BudgetUI.element("p", "panelHint", intro));
      form.append(rows.length > 0 ? tableBox(columns, rows) : BudgetUI.element("p", "panelText", empty));
      form.append(BudgetUI.buttonRow([{ label: "Close", onClick: () => panel.close() }]));
    }
  });
}

// A table in a box that scrolls up and down (see openTableWindow)
function tableBox(columns, rows) {
  const table = BudgetUI.element("table", "dataTable jeremyTable");
  const head = table.createTHead().insertRow();
  for (const column of columns) head.appendChild(BudgetUI.element("th", "", column));
  const body = table.createTBody();
  for (const row of rows) {
    const tr = body.insertRow();
    for (const value of row) {
      const isAmount = !!value && typeof value === "object";
      const td = BudgetUI.element("td", isAmount ? `amountCell ${BudgetUI.amountClass(value.amount)}` : "", isAmount ? value.text : String(value ?? ""));
      tr.appendChild(BudgetUI.noTranslate(td));
    }
  }
  const box = BudgetUI.element("div", "jeremyScroll");
  box.append(BudgetUI.spanHeaderBar(table));
  return box;
}

// An amount's cell (see tableBox)
const amountCell = (amount) => ({ text: formatMoney(amount), amount });

// Entries in a window: each one's day, title, and amount
function openEntriesWindow(origin, title, entries, empty) {
  openTableWindow(origin, {
    title,
    columns: ["Day", "Entry", "Amount"],
    rows: entries.map(entry => [showDate(entry.date), capitalize(String(entry.title)), amountCell(entry.amount)]),
    empty
  });
}

// Recurring entries each month: each one, how often, its amount, and what it comes to in a month
function openRecurringWindow(origin, recurring) {
  openTableWindow(origin, {
    title: "Recurring Entries Each Month",
    intro: `About ${formatMoney(recurring.costs)} a month in bills and ${formatMoney(recurring.gains)} in gains (transfers left out), from how often each one lands.`,
    columns: ["Entry", "How Often", "Amount", "A Month"],
    rows: recurring.rows.map(row => [capitalize(row.title), row.frequency, amountCell(row.amount), amountCell(row.monthly)]),
    empty: "No recurring entries yet. Add them on the Recurring Entries page."
  });
}

// Paydays: the last 4 months' (each with what went out in the days after it, besides recurring bills) and the next ones
function openPaydaysWindow(origin, spending, payday) {
  const rows = [];
  for (const day of paydaysBetween(addDays(today, 1), addDays(today, PAYDAY_LOOK))) rows.push([showDay(day), "Coming up", ""]);
  const past = [...spending.days].filter(([time, day]) => day.payday && time <= today.getTime()).sort((a, b) => b[0] - a[0]);
  for (const [time] of past) {
    const start = new Date(time);
    const done = addDays(start, payday.span) <= today;
    let sum = 0;
    for (let d = 0; d < payday.span; d++) sum += spending.days.get(addDays(start, d).getTime())?.spent || 0;
    rows.push([showDate(start), done ? `In the ${payday.span} days after` : "So far", amountCell(-sum)]);
  }
  openTableWindow(origin, {
    title: "Paydays",
    intro: "A payday is a Regular gain from a recurring entry or a connected spreadsheet. The amount is what went out from it, besides recurring bills.",
    columns: ["Payday", "", "Spent"],
    rows,
    empty: `No paydays in the last ${HISTORY_MONTHS} months or the next ${PAYDAY_LOOK} days.`
  });
}

// What went out each week of the last 4 months, besides recurring bills, newest first
function openWeeksWindow(origin, spending) {
  const rows = [];
  for (let end = today; end >= addMonths(today, -HISTORY_MONTHS); end = addDays(end, -7)) {
    const start = addDays(end, -6);
    let spent = 0;
    let known = false;
    for (let day = start; day <= end; day = addDays(day, 1)) {
      const found = spending.days.get(day.getTime());
      if (found) {
        spent += found.spent;
        known = true;
      }
    }
    if (known) rows.push([`${showDate(start)} - ${showDate(end)}`, amountCell(-spent)]);
  }
  openTableWindow(origin, {
    title: "Spent Each Week",
    intro: "Regular costs that didn't come from a recurring entry or a connected spreadsheet, 7 days at a time.",
    columns: ["Days", "Spent"],
    rows,
    empty: "Nothing in History or on the calendar yet."
  });
}

//#endregion

// =====================================================================
// #region ACCOUNTS
// =====================================================================
// A table of In Bank, each Other Account, and the Total: what each holds now, what it will on the day in the box at the
// top of its column (this device remembers it), and the interest from now to then (a column that only shows when an
// account has interest).

function setupAccountsCard(card) {
  const table = BudgetUI.element("table", "dataTable jeremyAccounts");
  const head = table.createTHead().insertRow();
  const input = BudgetUI.element("input", "dateInput");
  input.type = "text";
  input.inputMode = "numeric";
  input.placeholder = datePattern();
  input.translate = false;
  input.value = showDate(readAccountsDay());
  input.setAttribute("aria-label", "The day to work the balances out to");
  const dayRow = BudgetUI.element("div", "dateRow");
  dayRow.append(input, BudgetUI.datePickerButton(input, "Balances On", { min: addDays(today, 1), max: aheadLimit() }));
  const dayHead = BudgetUI.element("th", "dayHead");
  dayHead.append(dayRow);
  head.append(BudgetUI.element("th", "", "Account"), BudgetUI.element("th", "", "Now"), dayHead, BudgetUI.element("th", "interestHead", "Interest"));
  table.createTBody();
  const note = BudgetUI.element("p", "panelHint jeremyAccountsNote");
  input.addEventListener("change", () => {
    const day = parseTypedDate(input.value);
    if (isNaN(day.getTime()) || day <= today || day > aheadLimit()) {
      note.textContent = `Pick a day after today, up to ${showDate(aheadLimit())}.`;
      note.classList.add("isError");
      return;
    }
    try { localStorage.setItem(ACCOUNTS_DAY_KEY, formatToMMDDYYYY(createSafeMidnight(day))); } catch (e) {}
    renderPage();
  });
  card.accounts = { table, input, note };
  const box = BudgetUI.element("div", "jeremyAccountsBox");
  box.append(BudgetUI.spanHeaderBar(table));
  const wrap = BudgetUI.element("div", "jeremyAccountsWrap");
  wrap.append(box, note);
  return wrap;
}

// The table's rows as the budget stands, and the highlight: In Bank and the Total on the day picked
function renderAccountsCard(card, shared) {
  const { table, input, note } = card.accounts;
  const day = readAccountsDay();
  if (document.activeElement !== input) input.value = showDate(day);
  const projection = shared.projection();
  const summaries = new Map(shared.summaries().map(summary => [summary.index, summary]));
  const hasInterest = [...summaries.values()].some(summary => summary.interest);
  const round = (amount) => Math.round(amount * 100) / 100;

  const rows = [{ name: "In Bank", now: inBankToday(), then: projection.inBankOn(day), interest: null }];
  for (const account of accountRows()) {
    const summary = summaries.get(account.index);
    rows.push({
      name: account.name,
      now: summary ? summary.today : 0,
      max: accountMax(account.row),
      then: projection.accountOn(account.index, day),
      interest: summary?.interest ? projection.interestBetween(account.index, today, day) : null,
      rate: summary?.interest?.rate
    });
  }
  const total = {
    name: "Total",
    now: round(rows.reduce((sum, row) => sum + row.now, 0)),
    then: round(rows.reduce((sum, row) => sum + row.then, 0)),
    interest: hasInterest ? round(rows.reduce((sum, row) => sum + (row.interest || 0), 0)) : null,
    isTotal: true
  };

  const body = table.tBodies[0];
  body.replaceChildren(...[...rows, total].map(row => {
    const tr = BudgetUI.element("tr", row.isTotal ? "totalRow" : "");
    tr.append(BudgetUI.noTranslate(BudgetUI.element("td", "titleCell", row.name)));
    const now = BudgetUI.noTranslate(BudgetUI.element("td", `amountCell ${BudgetUI.amountClass(row.now)}`, formatMoney(row.now)));
    if (row.max) now.append(BudgetUI.element("span", "accountMax", `/${formatMoney(row.max)}`));
    const interest = BudgetUI.noTranslate(BudgetUI.element("td", `amountCell interestCell${row.interest === null ? "" : " " + BudgetUI.amountClass(row.interest)}`, row.interest === null ? "--" : formatMoney(row.interest)));
    if (row.rate) interest.append(BudgetUI.element("span", "interestRate", `${row.rate}% a year`));
    tr.append(now, BudgetUI.noTranslate(BudgetUI.element("td", `amountCell ${BudgetUI.amountClass(row.then)}`, formatMoney(row.then))), interest);
    return tr;
  }));
  table.classList.toggle("noInterest", !hasInterest);
  note.classList.remove("isError");
  note.textContent = hasInterest
    ? `The day at the top of its column counts everything planned until then. Interest is what each account gets (or pays, below $0) from today through ${showDate(day)}.`
    : "The day at the top of its column counts everything planned until then: recurring entries, connected spreadsheets, and Upcoming.";
  const interestNote = hasInterest && total.interest !== 0 ? `, with ${formatMoney(total.interest)} in interest by then` : "";
  return { text: `On ${showDate(day)}, In Bank will be ${formatMoney(rows[0].then)} and the Total ${formatMoney(total.then)}${interestNote}.`, warn: rows[0].then < 0 };
}

// The day Accounts works the balances out to: the one this device picked (while it's still after today), or 6 months
// from today, like Other Accounts' In 6 Months
function readAccountsDay() {
  let stored = null;
  try { stored = localStorage.getItem(ACCOUNTS_DAY_KEY); } catch (e) {}
  const day = stored ? createSafeMidnight(stored, true) : null;
  if (day && !isNaN(day.getTime()) && day > today && day <= aheadLimit()) return day;
  return addMonths(today, AHEAD_MONTHS);
}

// The furthest Accounts and Goals look
function aheadLimit() {
  return addMonths(today, 12 * AHEAD_YEARS);
}

// The furthest day Accounts and Goals need the budget worked out through: Accounts' day, and each goal still to reach's
// day (or as far as they look, for one without a day)
function furthestDay() {
  let furthest = readAccountsDay();
  if (jeremyCardOn("goals")) {
    for (const goal of accountsData?.goals || []) {
      const balance = goal.kind === "none" ? null : goalBalance(goal);
      if (balance === null || balance >= goal.amount) continue;
      const date = goal.date ? createSafeMidnight(goal.date, true) : null;
      const day = date && !isNaN(date.getTime()) ? date : aheadLimit();
      if (day > furthest) furthest = day;
    }
  }
  return furthest > aheadLimit() ? aheadLimit() : furthest;
}

//#endregion

// =====================================================================
// #region GOALS (see Goals in Process Budget.js)
// =====================================================================
// Each goal with how far along it is (tap one to change or delete it), and what Jeremy says reaching it takes: with a
// day, what to set aside from each payday until then beyond what the budget already gets there (a credit card's interest
// counted as it shrinks), and that it's in danger when doing so would take In Bank below $0, when it's more than usually
// goes out between paychecks, or when no paycheck lands before its day; without one, when the budget gets it there, or
// what a year would take.

function setupGoalsCard() {
  const box = BudgetUI.element("div", "panelButtons sectionButtons");
  const button = BudgetUI.element("button", "budgetButton primary", "New Goal");
  button.type = "button";
  button.addEventListener("click", () => openGoalPanel(button));
  box.append(button);
  return box;
}

// Each goal with what Jeremy says about it, and the highlight: how many are reached, on track, short, or in danger
function renderGoalsCard(card, shared) {
  const goals = accountsData?.goals || [];
  if (goals.length === 0) {
    card.results.replaceChildren(BudgetUI.element("p", "panelHint", "No goals yet. Tap New Goal to set one, like $2000.00 in Savings by June, or a credit card at $0.00."));
    return { text: "No goals yet. Tap New Goal to set one.", warn: false };
  }
  const plans = goals.map(goal => goalPlan(goal, shared));
  const list = BudgetUI.element("ul", "goalList");
  list.append(...goals.map((goal, index) => goalRow(goal, index, plans[index])));
  card.results.replaceChildren(list);

  const count = (tone) => plans.filter(plan => plan.tone === tone).length;
  const danger = goals.filter((goal, index) => plans[index].tone === "danger");
  const parts = [[count("reached"), "reached"], [count("onTrack"), "on track"], [count("short"), "needing more set aside"], [danger.length, "in danger"]]
    .filter(([number]) => number > 0).map(([number, words]) => `${number} ${words}`);
  if (parts.length === 0) return { text: "Tap each goal to pick what it's for, and Jeremy works out how to get there.", warn: false };
  const named = danger.length > 0 ? ` (${danger.map(goalName).join(", ")})` : "";
  return { text: `${goals.length} ${goals.length === 1 ? "goal" : "goals"}: ${parts.join(", ")}${named}.`, warn: danger.length > 0 };
}

// What Jeremy says about a goal: { tone: "reached" | "onTrack" | "short" | "danger" | "" , status (the word at its right),
// note, balance (what it's for holds now, or null) }
function goalPlan(goal, shared) {
  const balance = goal.kind === "none" ? null : goalBalance(goal);
  if (goal.kind === "none") return { tone: "", status: "", balance, note: "Tap it to pick what it's for, and Jeremy works out how to get there." };
  if (balance === null) return { tone: "", status: "", balance, note: `${goal.account} isn't one of your Other Accounts anymore. Tap it to pick another.` };
  if (balance >= goal.amount) return { tone: "reached", status: "Reached", balance, note: `${goalTarget(goal)} has ${formatMoney(balance)}: it's there.` };

  const projection = shared.projection();
  const date = goal.date ? createSafeMidnight(goal.date, true) : null;
  if (date && !isNaN(date.getTime())) {
    if (date < today) return { tone: "danger", status: "Missed", balance, note: `Its day, ${showDate(date)}, passed with it ${formatMoney(goal.amount - balance)} short.` };
    const planned = goalValueOn(goal, projection, date);
    if (planned >= goal.amount) return { tone: "onTrack", status: "On track", balance, note: `As your budget stands, it gets to ${formatMoney(planned)} by ${showDate(date)}.` };
    const short = goal.amount - planned;
    const paydays = paydaysBetween(addDays(today, 1), date);
    if (paydays.length === 0) {
      return { tone: "danger", status: "In danger", balance, note: `As your budget stands, it's ${formatMoney(short)} short on ${showDate(date)}, and no paycheck lands before then to set anything aside from.` };
    }
    const per = neededEachPayday(goal, short, paydays, date, projection);
    const months = Math.max(1, getDayDifference(date, today) / (365.25 / 12));
    const danger = goalDanger(goal, per, paydays, date, projection, shared);
    const note = `As your budget stands, it's ${formatMoney(short)} short on ${showDate(date)}. ${setAsideWords(goal, per, paydays.length)} until then (about ${formatMoney(per * paydays.length / months)} a month).${danger ? " " + danger : ""}`;
    return { tone: danger ? "danger" : "short", status: danger ? "In danger" : "", balance, note };
  }

  // No day: when the budget gets it there by itself, or what a year would take
  const reached = firstDayReached(goal, projection);
  if (reached) return { tone: "onTrack", status: "On track", balance, note: `As your budget stands, it gets there around ${showDate(reached)}.` };
  const yearOut = addMonths(today, 12);
  const short = goal.amount - goalValueOn(goal, projection, yearOut);
  const paydays = paydaysBetween(addDays(today, 1), yearOut);
  const notThere = `As your budget stands, it doesn't get there in the next ${AHEAD_YEARS} years.`;
  if (paydays.length === 0) return { tone: "short", status: "", balance, note: notThere };
  const per = neededEachPayday(goal, short, paydays, yearOut, projection);
  return { tone: "short", status: "", balance, note: `${notThere} ${setAsideWords(goal, per, paydays.length)} would get it there in a year (by ${showDate(yearOut)}).` };
}

// "Setting aside about $45.00 from each of your 12 paydays": what reaching a goal takes, in words for what it's for (more
// toward a credit card below $0, spending less for In Bank or the Total)
function setAsideWords(goal, per, paydays) {
  const each = paydays === 1 ? "your one payday" : `each of your ${paydays} paydays`;
  if (goal.kind !== "account") return `Spending about ${formatMoney(per)} less from ${each}`;
  if ((goalBalance(goal) ?? 0) < 0) return `Paying about ${formatMoney(per)} more toward it from ${each}`;
  return `Setting aside about ${formatMoney(per)} from ${each}`;
}

// The first day a goal's account (or In Bank, or the Total) holds its amount as the budget stands, or null when it doesn't
// as far as the budget's worked out. It's looked for a week at a time (at each week's end, so a day it only touches
// doesn't count), then the day in that week.
function firstDayReached(goal, projection) {
  const days = projection.inBank;
  const reaches = (at) => goalValueOn(goal, projection, days[at].date) >= goal.amount;
  for (let at = 0; at < days.length; at += 7) {
    const end = Math.min(at + 6, days.length - 1);
    if (!reaches(end)) continue;
    for (let day = at; day <= end; day++) if (reaches(day)) return days[day].date;
  }
  return null;
}

// What a goal's account (or In Bank, or the Total) holds at the end of a day, as the budget stands
function goalValueOn(goal, projection, day) {
  if (goal.kind === "inBank") return projection.inBankOn(day);
  const accounts = accountRows();
  if (goal.kind === "total") return Math.round((projection.inBankOn(day) + accounts.reduce((sum, account) => sum + projection.accountOn(account.index, day), 0)) * 100) / 100;
  const account = accounts.find(known => known.clean === cleanString(goal.account));
  return account ? projection.accountOn(account.index, day) : 0;
}

// The least to add on each payday (to the cent, rounded up) so the goal's amount is there on its day. An account with
// interest is worked out again with the extra in it (each month's interest follows the balance, so a credit card paid
// down faster pays less interest); anything else is the shortfall split over the paydays.
function neededEachPayday(goal, short, paydays, until, projection) {
  const even = Math.ceil(short / paydays.length * 100) / 100;
  if (goal.kind !== "account") return even;
  const account = accountRows().find(known => known.clean === cleanString(goal.account));
  const parts = account ? projection.accountParts(account.index) : null;
  if (!parts || !parts.interest) return even;
  const balanceWith = (extra) => {
    const entries = [...parts.entries, ...paydays.map(date => ({ date, change: extra }))];
    const credits = interestCredits(parts.start, entries, parts.interest, until);
    return [...entries, ...credits].reduce((sum, item) => (item.date <= until ? sum + item.change : sum), parts.start);
  };
  let low = 0;
  let high = Math.max(even, 0.01);
  while (balanceWith(high) < goal.amount && high < MAX_AMOUNT) high *= 2;
  for (let step = 0; step < 50 && high - low > 0.005; step++) {
    const middle = (low + high) / 2;
    if (balanceWith(middle) >= goal.amount) high = middle;
    else low = middle;
  }
  return Math.ceil(high * 100) / 100;
}

// Why a goal is in danger, or "": setting aside for an Other Account would take In Bank below $0 (the money comes out of
// it), or spending that much less is more than usually goes out between paychecks (for In Bank or the Total)
function goalDanger(goal, per, paydays, until, projection, shared) {
  if (goal.kind === "account") {
    let setAside = 0;
    let next = 0;
    for (const day of projection.inBank) {
      if (day.date > until) break;
      while (next < paydays.length && paydays[next] <= day.date) {
        setAside += per;
        next++;
      }
      if (setAside > 0 && day.amount - setAside < 0) {
        return day.amount < 0
          ? `In Bank is below $0 on ${showDate(day.date)} even before setting anything aside (${formatMoney(day.amount)}), so this goal is in danger.`
          : `Setting that aside would take In Bank to ${formatMoney(day.amount - setAside)} on ${showDate(day.date)}, so this goal is in danger.`;
      }
    }
    return "";
  }
  const usual = shared.payday().average;
  if (usual !== null && per > usual) return `That's more than usually goes out between paychecks besides your bills (${formatMoney(usual)}), so this goal is in danger.`;
  return "";
}

// A goal: its name and status, what it's for and its amount ("Savings: $1200.00 of $2000.00 by 06/01/2027"), how far
// along it is (a bar), and what Jeremy says. Tapping it opens it to change or delete.
function goalRow(goal, index, plan) {
  const date = goal.date ? createSafeMidnight(goal.date, true) : null;
  const target = goalTarget(goal);
  const amount = formatMoney(goal.amount) + (goal.percent !== null ? ` (${showPercent(goal.percent)} when set)` : "");
  const by = date && !isNaN(date.getTime()) ? ` by ${showDate(date)}` : "";
  const details = plan.balance !== null ? `${target}: ${formatMoney(plan.balance)} of ${amount}${by}` : `${target ? target + ": " : ""}${amount}${by}`;
  const share = plan.balance === null ? null : goalShare(goal, plan.balance);

  const item = BudgetUI.element("li", `goalItem${plan.tone === "reached" ? " isReached" : ""}${plan.tone === "danger" ? " isDanger" : ""}`);
  const button = BudgetUI.element("button", "goalButton");
  button.type = "button";
  button.setAttribute("aria-label", `Change the goal ${goalName(goal)}`);
  const top = BudgetUI.element("span", "goalTop");
  top.append(BudgetUI.noTranslate(BudgetUI.element("span", "goalTitle", `🎯 ${goalName(goal)}`)));
  const status = plan.status || (share !== null ? `${share}%` : "");
  if (status) top.append(BudgetUI.element("span", "goalStatus", status));
  button.append(top, BudgetUI.noTranslate(BudgetUI.element("span", "goalDetails", details)));
  if (share !== null) {
    const bar = BudgetUI.element("span", "goalBar");
    const fill = BudgetUI.element("span", "goalFill");
    fill.style.width = `${share}%`;
    bar.append(fill);
    button.append(bar);
  }
  if (plan.note) button.append(BudgetUI.element("span", "goalPlan", plan.note));
  button.addEventListener("click", () => openGoalPanel(button, index));
  item.append(button);
  return item;
}

// How far along a goal is, 0 to 100: from what it was for held when it was set (or $0, for one set before that was kept)
// to its amount, so a credit card climbing from -$2000.00 to $0.00 shows how much is paid off. null when it can't say.
function goalShare(goal, balance) {
  if (balance >= goal.amount) return 100;
  const from = Number.isFinite(goal.start) && goal.start < goal.amount ? goal.start : Math.min(0, balance);
  if (goal.amount <= from) return null;
  return Math.max(0, Math.min(99, Math.floor((balance - from) / (goal.amount - from) * 100)));
}

// New goal (index null) or change one: a title of its own if you like, what it's for (In Bank, the Total, or an Other
// Account, each with what it holds under its name), its amount (or a % of what it's for today, which stays that amount),
// and a day to reach it by, if it has one
function openGoalPanel(origin, index = null) {
  const existing = index === null ? null : (accountsData?.goals || [])[index];
  BudgetUI.openPanel({
    origin,
    size: "small",
    title: existing ? "Change Goal" : "New Goal",
    build(form, panel) {
      const intro = BudgetUI.element("p", "panelHint", "An amount for In Bank, the Total, or an Other Account to reach, like $2000.00 in Savings, or a credit card at $0.00 (a blank amount). Jeremy works out what reaching it takes.");
      const title = BudgetUI.textField({ label: "Title", value: existing ? existing.title : "", placeholder: "Vacation, emergency fund...", optional: true, maxLength: MAX_TITLE });
      const amount = BudgetUI.amountField({ label: "Amount", amount: existing ? existing.amount : null, percent: existing ? existing.percent : null, signs: BudgetUI.BALANCE_SIGNS });
      const accounts = otherAccounts();
      const savings = accountRows().find(account => isDefaultAccount(account.row));
      const kept = existing && (existing.kind === "inBank" || existing.kind === "total" || (existing.kind === "account" && accounts.some(account => account.name === existing.account)));
      const picked = kept ? (existing.kind === "account" ? `account:${existing.account}` : existing.kind) : savings ? `account:${savings.name}` : "inBank";
      const todayIn = (kind) => formatMoney(goalBalance({ kind, account: "" }) ?? 0);
      const target = BudgetUI.choiceList([
        { key: "inBank", label: "In Bank", detail: todayIn("inBank") },
        { key: "total", label: "Total", detail: `${todayIn("total")}, In Bank and every Other Account` },
        ...accounts.map(account => BudgetUI.accountChoice(account, `account:${account.name}`))
      ], picked, null, "What it's for");
      target.el.classList.add("accountChoices");
      const targetField = BudgetUI.field("For", target.el, { hint: "A % goal is that percent of it today, and stays that amount." });
      amount.setPercentAllowed(true);
      const date = BudgetUI.dateField({ label: "By", date: existing && existing.date ? createSafeMidnight(existing.date, true) : null, optional: true, hint: "Leave it blank for no day: Jeremy says when your budget gets there." });

      const buttons = existing
        ? [{ label: "Save", kind: "primary", type: "submit" }, { label: "Delete", kind: "danger", onClick: removeIt }, { label: "Cancel", onClick: () => panel.close() }]
        : [{ label: "Add Goal", kind: "primary", type: "submit" }, { label: "Cancel", onClick: () => panel.close() }];
      form.append(...(existing ? [] : [intro]), title.el, targetField, amount.el, date.el, BudgetUI.buttonRow(buttons));

      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const { percent, error } = BudgetUI.readPercentField(amount);
        if (error) return panel.setError(error);
        const value = amount.value() ?? 0; // (A blank amount is $0.00, like a credit card paid off)
        if (percent === null && Number.isNaN(value)) return panel.setError("Enter the amount, like 2000.00.");
        if (percent === null && Math.abs(value) > MAX_AMOUNT) return panel.setError(AMOUNT_TOO_BIG);
        const by = date.value();
        if (by === undefined) return panel.setError(`That date isn't a real day. Use ${datePattern()}.`);
        const [kind, ...name] = target.value().split(":");
        const fields = { title: title.value(), kind, account: name.join(":"), amount: value, percent, date: by };
        BudgetUI.submit(panel, () => saveGoal(fields, index));
      });

      function removeIt() {
        if (!window.confirm(`Delete the goal ${goalName(existing)}?`)) return;
        BudgetUI.submit(panel, () => deleteGoal(index));
      }
    }
  });
}

//#endregion

// =====================================================================
// #region NEEDS, WANTS, AND FUTURE (see ENTRY PURPOSES in Process Budget.js)
// =====================================================================
// A pie chart (a ring, with the total in the middle) of what each purpose's titles cost between two days, a legend with
// each one's amount and share (tap one, or a slice, for its titles), and what the costs with no purpose yet come to (tap
// it to give titles one, right there). The days are the card's From and To, which its windows share.

let purposeRange = null; // { from, to }: the days the chart adds up
const purposeBoxes = new Set(); // Every From and To pair showing them (the card's, and an open window's)

// The card's From and To, on the last 30 days to start
function setupPurposesCard(card) {
  purposeRange = { from: addDays(today, -(PURPOSE_DAYS - 1)), to: today };
  card.purposes = purposeDateBoxes();
  return card.purposes.el;
}

// The chart (or a note while nothing in these days has a purpose) and what has no purpose yet, and the highlight: each
// purpose's share
function renderPurposesCard(card) {
  const totals = purposeTotals(purposeRange.from, purposeRange.to);
  const sum = totals.slices.reduce((all, slice) => all + slice.total, 0);
  const parts = [];
  if (sum > 0) parts.push(purposeChart(totals, sum));
  else parts.push(BudgetUI.element("p", "panelHint", "Nothing with Needs, Wants, or Future in these days yet. Pick one at the bottom of an entry's form (tap an entry on a zoomed day, or add a new one), or give titles one below."));
  if (totals.none > 0) {
    const unsorted = BudgetUI.element("button", "budgetButton purposeUnsorted", `${formatMoney(totals.none)} has no purpose yet ›`);
    unsorted.type = "button";
    unsorted.addEventListener("click", () => openUnsortedWindow(unsorted));
    parts.push(unsorted);
  }
  card.results.replaceChildren(...parts);
  const days = `from ${showDate(purposeRange.from)} to ${showDate(purposeRange.to)}`;
  if (sum === 0) return { text: `Nothing with a purpose ${days} yet.`, warn: false };
  const shares = totals.slices.filter(slice => slice.total > 0).map(slice => `${PURPOSE_NAMES.get(slice.key)} ${sharePercent(slice.total, sum)}%`);
  return { text: `${shares.join(", ")} ${days}.`, warn: false };
}

// A part's share of the whole, as a whole number of percent
function sharePercent(part, whole) {
  return whole > 0 ? Math.round(part / whole * 100) : 0;
}

// What each purpose's titles cost from `from` through `to`: { slices: [{ key, total, titles: [{ title, total, count }]
// biggest first }] (Needs, Wants, then Future), none (what titles with no purpose cost), unsorted: [{ title, total, count
// }] }. A title counts by what its entries come to together (a refund takes off what it cost), when that's a cost.
function purposeTotals(from, to) {
  const byTitle = new Map(); // titleKey -> { title, total, count }
  eachEntryBetween(from, to, (date, text) => {
    const line = readLine(text);
    if (line.blank || line.system || !line.title || line.amount === 0) return;
    const key = titleKey(line.title);
    if (!key) return;
    const { title, account } = splitAccount(line.title);
    const known = byTitle.get(key) || { title: capitalize(title || account), total: 0, count: 0, purpose: purposeOf(line.title) };
    known.total += line.amount;
    known.count++;
    byTitle.set(key, known);
  });
  const slices = ENTRY_PURPOSES.map(key => ({ key, total: 0, titles: [] }));
  const unsorted = [];
  for (const item of byTitle.values()) {
    if (item.total >= -0.005) continue;
    const entry = { title: item.title, total: Math.round(-item.total * 100) / 100, count: item.count };
    const slice = slices.find(candidate => candidate.key === item.purpose);
    if (slice) {
      slice.total += entry.total;
      slice.titles.push(entry);
    } else {
      unsorted.push(entry);
    }
  }
  for (const slice of slices) {
    slice.total = Math.round(slice.total * 100) / 100;
    slice.titles.sort((a, b) => b.total - a.total);
  }
  unsorted.sort((a, b) => b.total - a.total);
  return { slices, none: Math.round(unsorted.reduce((sum, entry) => sum + entry.total, 0) * 100) / 100, unsorted };
}

// Every entry line from `from` through `to`: History's days and the calendar's as they are, and after the calendar the
// way the budget fills those days in (Upcoming, recurring entries, and connected spreadsheets'), up to two years ahead
function eachEntryBetween(from, to, visit) {
  eachDay(from, to, (date, lines) => lines.forEach(text => visit(date, text)));
  const limit = addDays(today, PURPOSE_AHEAD_DAYS);
  const last = to < limit ? to : limit;
  const first = from > nextFourStart ? from : nextFourStart;
  if (last < first) return;
  const recurringRows = getParsedRecurringRows();
  const futureByDate = groupFutureRowsByDate();
  const sheetDays = sheetEntriesByDay(first, last);
  for (let day = first; day <= last; day = addDays(day, 1)) {
    for (const text of dayAfterCalendar(day, recurringRows, futureByDate, sheetDays).split("\n").slice(1)) visit(day, text);
  }
}

const SVG_NS = "http://www.w3.org/2000/svg"; // The chart's ring and words are SVG

// The chart and its legend. The ring has a slice for each purpose with something in it, in Needs, Wants, Future order
// from the top, with a gap between slices, and the total in the middle; pointing at a slice (or tabbing to it) shows its
// amount and share there instead, and tapping it (or Enter) opens its titles. The legend says each one's name, amount,
// and share (so the colors never have to), and opens the same.
function purposeChart(totals, sum) {
  const box = BudgetUI.element("div", "purposeChartBox");
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 200 200");
  svg.setAttribute("class", "purposeChart");
  svg.setAttribute("role", "group");
  svg.setAttribute("aria-label", "Needs, Wants, and Future, as a pie chart");
  const center = (tag, className, text, y) => {
    const node = document.createElementNS(SVG_NS, tag);
    node.setAttribute("class", className);
    node.setAttribute("x", "100");
    node.setAttribute("y", String(y));
    node.setAttribute("text-anchor", "middle");
    node.textContent = text;
    return node;
  };
  const amountText = center("text", "purposeCenterAmount", formatMoney(sum), 104);
  const labelText = center("text", "purposeCenterLabel", "Spent", 126);
  const showCenter = (amount, label) => {
    amountText.textContent = amount;
    labelText.textContent = label;
  };

  const slices = totals.slices.filter(slice => slice.total > 0);
  let angle = -Math.PI / 2;
  for (const slice of slices) {
    const sweep = slice.total / sum * Math.PI * 2;
    const name = PURPOSE_NAMES.get(slice.key);
    const share = `${sharePercent(slice.total, sum)}%`;
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", ringSlice(angle, angle + sweep));
    if (slices.length === 1) path.setAttribute("fill-rule", "evenodd");
    path.setAttribute("class", `purposeSlice ${slice.key}`);
    path.setAttribute("tabindex", "0");
    path.setAttribute("role", "button");
    path.setAttribute("aria-label", `${name}: ${formatMoney(slice.total)}, ${share}. Open its titles.`);
    const show = () => showCenter(formatMoney(slice.total), `${name} · ${share}`);
    const reset = () => showCenter(formatMoney(sum), "Spent");
    path.addEventListener("pointerenter", show);
    path.addEventListener("focus", show);
    path.addEventListener("pointerleave", reset);
    path.addEventListener("blur", reset);
    path.addEventListener("click", () => openPurposeWindow(path, slice.key));
    path.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openPurposeWindow(path, slice.key);
    });
    svg.append(path);
    angle += sweep;
  }
  svg.append(amountText, labelText);

  const legend = BudgetUI.element("ul", "purposeLegend");
  for (const slice of totals.slices) {
    const item = BudgetUI.element("li", "purposeLegendItem");
    const button = BudgetUI.element("button", "purposeLegendButton");
    button.type = "button";
    button.disabled = slice.total === 0;
    button.append(
      BudgetUI.element("span", `purposeSwatch ${slice.key}`),
      BudgetUI.element("span", "purposeName", PURPOSE_NAMES.get(slice.key)),
      BudgetUI.noTranslate(BudgetUI.element("span", "purposeAmount", formatMoney(slice.total))),
      BudgetUI.element("span", "purposeShare", `${sharePercent(slice.total, sum)}%`)
    );
    button.addEventListener("click", () => openPurposeWindow(button, slice.key));
    item.append(button);
    legend.append(item);
  }
  box.append(svg, legend);
  return box;
}

// A slice of the ring from angle a to angle b (radians, clockwise, 0 at the right), with a small gap at each end (the
// whole ring for a slice that's all of it)
function ringSlice(a, b) {
  const OUTER = 96;
  const INNER = 64;
  const GAP = 1.2; // Half the gap between slices, at the ring's edge
  const point = (radius, angle) => `${(100 + radius * Math.cos(angle)).toFixed(3)} ${(100 + radius * Math.sin(angle)).toFixed(3)}`;
  if (b - a >= Math.PI * 2 - 1e-6) {
    return `M 100 ${100 - OUTER} A ${OUTER} ${OUTER} 0 1 1 100 ${100 + OUTER} A ${OUTER} ${OUTER} 0 1 1 100 ${100 - OUTER} Z ` +
      `M 100 ${100 - INNER} A ${INNER} ${INNER} 0 1 0 100 ${100 + INNER} A ${INNER} ${INNER} 0 1 0 100 ${100 - INNER} Z`;
  }
  const padOuter = Math.min(GAP / OUTER, (b - a) / 4);
  const padInner = Math.min(GAP / INNER, (b - a) / 4);
  const large = b - a > Math.PI ? 1 : 0;
  return `M ${point(OUTER, a + padOuter)} A ${OUTER} ${OUTER} 0 ${large} 1 ${point(OUTER, b - padOuter)} ` +
    `L ${point(INNER, b - padInner)} A ${INNER} ${INNER} 0 ${large} 0 ${point(INNER, a + padInner)} Z`;
}

// From and To boxes for the days the chart adds up (each a date box with its calendar button). The card has a pair, and a
// slice's window has its own; picking a day in any of them changes them all, the card, and an open window.
function purposeDateBoxes() {
  const el = BudgetUI.element("div", "purposeDates");
  const boxes = {};
  for (const [key, label] of [["from", "From"], ["to", "To"]]) {
    const input = BudgetUI.element("input", "dateInput");
    input.type = "text";
    input.inputMode = "numeric";
    input.placeholder = datePattern();
    input.translate = false;
    input.value = showDate(purposeRange[key]);
    input.setAttribute("aria-label", `${label} date`);
    input.addEventListener("change", () => {
      const date = parseTypedDate(input.value);
      if (isNaN(date.getTime())) {
        BudgetUI.showToast(`That date isn't a real day. Use ${datePattern()}.`, true);
        input.value = showDate(purposeRange[key]);
        return;
      }
      setPurposeRange({ ...purposeRange, [key]: createSafeMidnight(date) });
    });
    const row = BudgetUI.element("div", "dateRow");
    row.append(input, BudgetUI.datePickerButton(input, label));
    const part = BudgetUI.element("div", "purposeDate");
    part.append(BudgetUI.element("span", "fieldLabel", label), row);
    el.append(part);
    boxes[key] = input;
  }
  const pair = {
    el,
    show() {
      for (const key of ["from", "to"]) if (document.activeElement !== boxes[key]) boxes[key].value = showDate(purposeRange[key]);
    }
  };
  purposeBoxes.add(pair);
  return pair;
}

// New days for the chart (From after To swaps them): every pair of boxes shows them, and the card and any open window
// add up the new days
function setPurposeRange({ from, to }) {
  purposeRange = from > to ? { from: to, to: from } : { from, to };
  for (const pair of purposeBoxes) {
    if (pair.el.isConnected) pair.show();
    else purposeBoxes.delete(pair);
  }
  const card = pageCards.find(item => item.def.id === "purposes");
  if (card) {
    drawCard(card);
    renderHighlights();
  }
  document.dispatchEvent(new CustomEvent("jeremy:purposes"));
}

// A purpose's window: the days (From and To), what it came to and its share, and each title in it, biggest first, with
// what it cost, its share of the purpose, and how many entries it has, in a box that scrolls
function openPurposeWindow(origin, key) {
  const name = PURPOSE_NAMES.get(key);
  BudgetUI.openPanel({
    origin,
    size: "large",
    title: name,
    build(form, panel) {
      const dates = purposeDateBoxes();
      const summary = BudgetUI.element("p", "panelText");
      const list = BudgetUI.element("ul", "purposeTitles");
      const box = BudgetUI.element("div", "jeremyScroll purposeTitlesBox");
      box.append(list);
      // (Drawn again when the days or the budget change while it's open)
      const follow = () => {
        if (panel.panel.isConnected && !panel.panel.classList.contains("isClosing")) return draw();
        document.removeEventListener("jeremy:purposes", follow);
        document.removeEventListener("budget:updated", follow);
      };
      const draw = () => {
        const totals = purposeTotals(purposeRange.from, purposeRange.to);
        const slice = totals.slices.find(item => item.key === key);
        const all = totals.slices.reduce((sum, item) => sum + item.total, 0);
        summary.textContent = slice.total > 0
          ? `${formatMoney(slice.total)} from ${showDate(purposeRange.from)} to ${showDate(purposeRange.to)}: ${sharePercent(slice.total, all)}% of everything with a purpose. Each title's entries are added together.`
          : `Nothing with ${name} from ${showDate(purposeRange.from)} to ${showDate(purposeRange.to)}.`;
        list.replaceChildren(...slice.titles.map(title => {
          const item = BudgetUI.element("li", "purposeTitle");
          const words = BudgetUI.element("span", "purposeTitleText");
          words.append(BudgetUI.noTranslate(BudgetUI.element("span", "purposeTitleName", title.title)), BudgetUI.element("span", "purposeTitleCount", `${title.count} ${title.count === 1 ? "entry" : "entries"}`));
          item.append(words, BudgetUI.noTranslate(BudgetUI.element("span", "purposeTitleAmount negative", formatMoney(-title.total))), BudgetUI.element("span", "purposeTitleShare", `${sharePercent(title.total, slice.total)}%`));
          return item;
        }));
        box.hidden = slice.titles.length === 0;
      };
      document.addEventListener("jeremy:purposes", follow);
      document.addEventListener("budget:updated", follow);
      form.addEventListener("submit", (event) => event.preventDefault()); // (Enter in a date box: nothing to send)
      form.append(dates.el, summary, box, BudgetUI.buttonRow([{ label: "Close", onClick: () => panel.close() }]));
      draw();
    }
  });
}

// Titles with no purpose yet (what they cost in the chart's days, biggest first), each with Needs, Wants, and Future
// buttons that give it one right there (every entry with the title gets it)
function openUnsortedWindow(origin) {
  BudgetUI.openPanel({
    origin,
    size: "large",
    title: "No Purpose Yet",
    build(form, panel) {
      const summary = BudgetUI.element("p", "panelText");
      const list = BudgetUI.element("ul", "purposeTitles");
      const box = BudgetUI.element("div", "jeremyScroll purposeTitlesBox");
      box.append(list);
      let busy = false;
      // (Drawn again when the budget changes while it's open)
      const follow = () => {
        if (panel.panel.isConnected && !panel.panel.classList.contains("isClosing")) return draw();
        document.removeEventListener("budget:updated", follow);
      };
      const draw = () => {
        const totals = purposeTotals(purposeRange.from, purposeRange.to);
        summary.textContent = totals.unsorted.length > 0
          ? `What these titles cost from ${showDate(purposeRange.from)} to ${showDate(purposeRange.to)}. Tap Needs, Wants, or Future to give one its purpose (every entry with that title gets it).`
          : "Every title in these days has a purpose.";
        list.replaceChildren(...totals.unsorted.map(title => {
          const item = BudgetUI.element("li", "purposeTitle hasChoices");
          const words = BudgetUI.element("span", "purposeTitleText");
          words.append(BudgetUI.noTranslate(BudgetUI.element("span", "purposeTitleName", title.title)), BudgetUI.noTranslate(BudgetUI.element("span", "purposeTitleCount", `${formatMoney(-title.total)}, ${title.count} ${title.count === 1 ? "entry" : "entries"}`)));
          const choices = BudgetUI.element("span", "purposeTitleChoices");
          for (const key of ENTRY_PURPOSES) {
            const button = BudgetUI.element("button", "budgetButton", PURPOSE_NAMES.get(key));
            button.type = "button";
            button.disabled = busy;
            button.addEventListener("click", async () => {
              if (busy) return;
              busy = true;
              list.querySelectorAll("button").forEach(other => { other.disabled = true; });
              const result = await saveEntryPurpose(title.title, key);
              busy = false;
              if (!result.ok) BudgetUI.showToast(result.message || "That didn't work. Please try again.", true);
              else BudgetUI.warnIfUnsaved(result);
              follow();
            });
            choices.append(button);
          }
          item.append(words, choices);
          return item;
        }));
        box.hidden = totals.unsorted.length === 0;
      };
      document.addEventListener("budget:updated", follow);
      form.addEventListener("submit", (event) => event.preventDefault()); // (Nothing to send)
      form.append(summary, box, BudgetUI.buttonRow([{ label: "Close", onClick: () => panel.close() }]));
      draw();
    }
  });
}

//#endregion

// =====================================================================
// #region TIPS (Payday, Spending Pace, Big Bills, Weekly Check, Catchup Entries, Refunds)
// =====================================================================

// A tip card's words (and a button for what's behind them, when there's more)
function showTip(card, text, more = null) {
  const parts = [BudgetUI.element("p", "jeremyTip", text)];
  if (more) {
    const button = BudgetUI.element("button", "budgetButton tipMore", `${more.label} ›`);
    button.type = "button";
    button.addEventListener("click", () => more.open(button));
    parts.push(button);
  }
  card.results.replaceChildren(...parts);
}

// "Yours starts 06/28/2026." or what History is
function historyStartNote() {
  const oldest = oldestHistoryDay();
  return oldest ? `Yours starts ${showDate(oldest)}.` : "Each week moves into History as it passes.";
}

// Payday: on a payday, a heads-up with what usually goes out before the next one; on other days, when the next one is
function renderPaydayCard(card, shared) {
  const payday = shared.payday();
  let text;
  let warn = false;
  if (payday.average === null) {
    text = `Jeremy needs ${HISTORY_MONTHS} months of History for this. ${historyStartNote()}`;
  } else if (payday.isPayday && Math.round(payday.average) > 0) {
    text = `Hey, you just got paid! Keep in mind, besides your recurring bills, you tend to spend about ${formatMoney(Math.round(payday.average))} in the next ${payday.span} days, so be careful what you spend it on!`;
    warn = true;
  } else if (payday.next) {
    text = `Your next payday is ${showDay(payday.next)}. From one payday to the next (${payday.span} days), you tend to spend about ${formatMoney(Math.round(payday.average))} besides your recurring bills.`;
  } else {
    text = `No paycheck lands in the next ${PAYDAY_LOOK} days. Jeremy counts a Regular gain from a recurring entry or a connected spreadsheet as a paycheck.`;
  }
  showTip(card, text, { label: "See paydays", open: (origin) => openPaydaysWindow(origin, shared.spending(), payday) });
  return { text, warn };
}

// Spending Pace: the last 7 days next to a usual week, with a heads-up when they're well over it
function renderPaceCard(card, shared) {
  const pace = paceFigures(shared.spending());
  let text;
  if (!pace) {
    text = `Jeremy needs ${HISTORY_MONTHS} months of History for this. ${historyStartNote()}`;
  } else if (pace.flagged) {
    text = `Heads up: you've spent about ${formatMoney(Math.round(pace.thisWeek))} in the last 7 days besides your recurring bills, about ${formatMoney(Math.round(pace.over))} more than usual for a week. Taking it easy for a few days keeps your budget on track!`;
  } else {
    text = `You've spent about ${formatMoney(Math.round(pace.thisWeek))} in the last 7 days besides your recurring bills, and a usual week is about ${formatMoney(Math.round(pace.usualWeek))}. You're on pace.`;
  }
  showTip(card, text, { label: "See each week", open: (origin) => openWeeksWindow(origin, shared.spending()) });
  return { text, warn: !!pace && pace.flagged };
}

// Big Bills: the soonest one, how many more, and what to set aside from each paycheck before it
function renderBillsCard(card, shared) {
  const bills = shared.bills();
  if (bills.length === 0) {
    const text = `No big bills in the next ${BILL_DAYS} days: nothing of ${formatMoney(BIG_BILL)} or more that doesn't come every month.`;
    showTip(card, text);
    return { text, warn: false };
  }
  const first = bills[0];
  const more = bills.length > 1 ? `, and ${bills.length - 1} more in the next ${BILL_DAYS} days` : "";
  const paydays = paycheckDays(today, addDays(first.date, -1)).length;
  const cost = Math.abs(first.amount);
  const setAside = paydays === 0 ? " It lands before your next paycheck, so check that what you have now covers it."
    : paydays === 1 ? ` Setting aside ${formatMoney(Math.ceil(cost))} from your paycheck before then covers it.`
    : ` Setting aside about ${formatMoney(Math.ceil(cost / paydays))} from each of your ${paydays} paychecks before then covers it.`;
  const text = `Hey, you have a big uncommon bill coming up: ${capitalize(first.title)} (${formatMoney(first.amount)}) on ${showDay(first.date)}${more}. Make sure you're saving enough to afford it!${setAside}`;
  showTip(card, text, { label: bills.length > 1 ? `See all ${bills.length}` : "See it", open: (origin) => openEntriesWindow(origin, `Big Bills, Next ${BILL_DAYS} Days`, bills, "") });
  return { text, warn: true };
}

// Weekly Check: on a Sunday, compare In Bank with the bank; on other days, when the next check is
function renderWeeklyCard(card) {
  const inBank = inBankToday();
  const isSunday = today.getDay() === 0;
  const text = isSunday
    ? `Time for your weekly check! Look at today's In Bank here (${formatMoney(inBank)}), and compare it with what your bank account actually has. Try to find which purchases are causing any difference, and add them in (on the day they happened, or just to today). Anything you can't find: tap today's In Bank on the calendar and type what your bank says, and I'll add a Catchup entry to make up the difference.`
    : `Your next weekly check is ${showDay(addDays(today, 7 - today.getDay()))}. Then, compare that day's In Bank with what your bank account actually has, and add the purchases that make up any difference (or tap that day's In Bank on the calendar and type what your bank says, for a Catchup entry).`;
  showTip(card, text);
  return { text: isSunday ? `Today's the weekly check: compare In Bank (${formatMoney(inBank)}) with what your bank says.` : `The next one is ${showDay(addDays(today, 7 - today.getDay()))}.`, warn: isSunday };
}

// Catchup Entries: what they came to in the last 30 days, with a nudge at $100 or more
function renderCatchupCard(card, shared) {
  const catchup = shared.catchup();
  const over = catchup.total >= CATCHUP_LIMIT;
  const text = over
    ? `Your Catchup entries add up to ${formatMoney(Math.round(catchup.total))} in the last ${CATCHUP_DAYS} days, so some purchases are slipping by. Try adding each one as it happens (the Quick Entry icon on your phone's home screen makes it quick), so your In Bank stays right without guessing.`
    : `Your Catchup entries add up to ${formatMoney(catchup.total)} in the last ${CATCHUP_DAYS} days. Under ${formatMoney(CATCHUP_LIMIT)}, so your entries are keeping up with your bank.`;
  showTip(card, text, catchup.entries.length > 0 ? { label: "See them", open: (origin) => openEntriesWindow(origin, `Catchup Entries, Last ${CATCHUP_DAYS} Days`, catchup.entries, "") } : null);
  return { text, warn: over };
}

// Refunds: with Lowest in bank after today below $0, the purchases from the last 30 days, or still to come by that day,
// that would cover it: the ones that would alone first (the smallest of those first), then the biggest others
function renderRefundCard(card, shared) {
  const lowest = shared.lowest();
  if (lowest.amount >= 0) {
    const text = `Lowest in bank after today is ${formatMoney(lowest.amount)} (on ${showDay(lowest.date)}), so nothing needs a refund right now.`;
    showTip(card, text);
    return { text, warn: false };
  }
  const short = -lowest.amount;
  const purchases = purchasesBetween(addDays(today, -(REFUND_DAYS - 1)), lowest.date);
  const covers = purchases.filter(purchase => -purchase.amount >= short).sort((a, b) => b.amount - a.amount);
  const rest = purchases.filter(purchase => -purchase.amount < short).sort((a, b) => a.amount - b.amount);
  const picks = [...covers, ...rest].slice(0, REFUNDS_SHOWN);
  const describe = (purchase) => `${capitalize(purchase.title)} (${formatMoney(purchase.amount)} on ${showDay(purchase.date)}${purchase.date > today ? ", still to come" : ""})`;
  const question = `Hey, Lowest in bank after today goes to ${formatMoney(lowest.amount)} on ${showDay(lowest.date)}. Is a refund possible?`;
  // (The one named in the words isn't listed again)
  const listed = covers.length > 0 ? picks.slice(1) : picks;
  let highlight = question;
  if (covers.length > 0) highlight += ` ${describe(covers[0])} would cover it by itself.`;
  else if (picks.length > 0) highlight += ` ${describe(picks[0])} would help the most.`;
  else highlight += ` There are no purchases from the last ${REFUND_DAYS} days to look at.`;
  let text = covers.length > 0 || picks.length === 0 ? highlight : question;
  if (listed.length > 0) text += covers.length > 0 ? " These would help too:" : " These purchases would help:";
  const parts = [BudgetUI.element("p", "jeremyTip", text)];
  if (listed.length > 0) {
    const list = BudgetUI.element("ul", "jeremyList");
    for (const purchase of listed) list.append(BudgetUI.noTranslate(BudgetUI.element("li", "", describe(purchase))));
    parts.push(list);
  }
  card.results.replaceChildren(...parts);
  return { text: highlight, warn: true };
}

//#endregion
