// Bob Page: Bob's own page (Menu > Bob, or tap his card on Home). His message on Home stays quick and in plain
// words; everything heavier he works out waits for this page, and only runs while it's open.
//
// PROGRAMMING NOTE, for every change to this page:
//   - The very top card, the one with Bob's picture, gives a breakdown of the highlights from every card on the page
//     that's on. Each card's render returns its highlight (see CARDS), and a new card needs one too.
//   - Every card has a help button (a "?" in a circle) to the right of its title, with a short, clear note on what the
//     card is for (its help, see CARDS). A new card needs one too.
//   - The Spectrum Graph and Data always run. Every other card has an on/off switch, starts off, and works nothing out while
//     it's off. Which are on is kept with the budget (Bob's page in Process Budget.js), so every device shows the same.
//   - A card that's on (but Wavelength Planning) has a Warnings switch beside its own: with it on, the card's highlight,
//     when it needs a look, shows on Bob's card on Home (bobWarnings), which moves over the calendar until it's okayed.
//     A new card that can need a look gets one too (BOB_WARNING_CARDS in Process Budget.js).
//   - Anything that shows from a tap (a table, a list) opens in a floating window (openWindow), not in the page.
//
// The page, top to bottom: Bob's highlights; Bob's Cards, a row for each card with a switch (Goals; Wavelength Planning, a
// spectrum of what each wavelength cost; then one for each of his tips: Payday, Spending Pace, Big Bills, Weekly Check,
// Catchup Entries, and Refunds), each opening its card in a window; then what they work from, as cards that fold open and
// shut: the Spectrum Graph (one line graph comparing any of what this page can draw), and Data's groups (DATA_GROUPS), with
// Equity's window (each account now and on a day picked, interest too), the Tracker's (its rows, added up between two days,
// with New Row and Edit, and each row's own window with a graph), and a line graph at the bottom of each window that can
// have one. Bob's page loads Budget Pages.js too, for the tracker's table, New Row, and Edit.

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
const AHEAD_YEARS = 10;         // Equity and Goals look up to this far ahead
const PURPOSE_DAYS = 30;        // Wavelength Planning starts on this many days, through today...
const PURPOSE_AHEAD_DAYS = 730; // ...and looks up to two years ahead, like Search
const ACCOUNTS_DAY_KEY = "prismal_bob_accounts_day"; // The day this device picked for Equity's window (Layout.js keeps it)

// Each card under the highlights: its id (its switch's, see BOB_CARDS in Process Budget.js), title, help (what its "?"
// shows), setup(card) (what it keeps while the page is open, like its date boxes: returned to go above what it shows), and
// render(card, shared) (draws it, and returns its highlight: { text, warn } or null)
const CARDS = [
  {
    id: "spectrum",
    title: "Spectrum Graph",
    help: "One graph to compare anything on Bob's page: In Bank, the Total, your Equity accounts, tracker rows (a whole row, or one of its aliases), and Bob's own figures, like purchases added up or what's spent each week. Pick a line in the lists and tap Add; × takes one off. The lines are kept with your budget, so every device shows the same ones. Tap a name under the graph to make it Red or Blue (added together with the others of that color), or Hidden.",
    setup: setupSpectrumCard,
    render: renderSpectrumCard
  },
  {
    id: "data",
    title: "Data",
    help: "What Bob works everything out from: your History, paydays, spending, the tracker, and bills ahead. The cards below use these numbers. Tap a row with › to see what's behind it, with a line graph at the bottom of the ones that can have one: pick a later day there to see what your budget expects.",
    render: renderDataCard
  },
  {
    id: "goals",
    title: "Goals",
    help: "Amounts for In Bank, the Total, or an Equity account to reach, by a day if you like. Bob works out what to set aside from each payday to get there, and warns you when one is in danger. A credit card's can be $0.00: paid off. A goal can follow an Accrual Calculator gem, and changes when the gem does.",
    setup: setupGoalsCard,
    render: renderGoalsCard
  },
  {
    id: "purposes",
    title: "Wavelength Planning",
    help: "Once it's on, every entry form asks which wavelength a title's money is on: Needs, Wants, and Future to start, or up to 10 of your own (Add Or Change Wavelengths makes them). The spectrum adds up what each cost between the days picked, long wavelengths at the left to short at the right; tap a stretch to see its titles.",
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
    help: `The last 7 days' spending besides recurring bills, next to a usual week from the ${HISTORY_MONTHS} months before (it needs ${HISTORY_MONTHS} months of History). Bob speaks up at $${PACE_OVER} and ${Math.round((PACE_RATIO - 1) * 100)}% over.`,
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
    help: `When Lowest in bank after today goes below $0, Bob looks for purchases from the last ${REFUND_DAYS} days (or still to come before that day) that a refund, or skipping one, would cover it with.`,
    render: renderRefundCard
  }
];

const TOP_HELP = "A quick look at what every card that's on has to say, one line each. Turn a card on or off in Bob's Cards: tap its row, then its switch.";

let pageCards = [];    // The cards as made: [{ def, el, toggle, state, warning, body, results, highlight }] (see buildCard)
let highlightList = null;
let switching = false; // A card's switch is being saved

// (Home loads this page's script too, for Bob's warnings: see bobWarnings)
if (window.PAGE === "bob") {
  window.workspaceReady.then((loaded) => {
    const status = document.getElementById("dataStatus");
    if (!loaded) {
      if (status) status.textContent = "Couldn't load your budget data. Please refresh to try again.";
      return;
    }
    if (status) status.hidden = true;
    takeLinkedDay();
    buildPage();
    renderPage();
    showLinkedCard();
    openLinkedWindow();
    openLinkedGoal();
  });
}

// A link from the Accrual Calculator's Add To Goals (/menu/bob.html?goalGem=ID&by=YYYY-MM-DD#bobCardsCard) opens New Goal
// following that gem, on that day, from Goals' row in Bob's Cards once the page has slid in and come to it (so the window
// opens where it can be seen). The link's ?goalGem comes off the address, so going back or reloading doesn't open it again.
function openLinkedGoal() {
  const params = new URLSearchParams(location.search);
  const gem = params.get("goalGem");
  if (!gem) return;
  const by = params.get("by") ? createSafeMidnight(params.get("by"), true) : null;
  try { history.replaceState(history.state, "", location.pathname + location.hash); } catch (e) {}
  const started = Date.now();
  const open = () => {
    if (document.documentElement.style.overflowY === "hidden" && Date.now() - started < 3000) return requestAnimationFrame(open);
    const row = document.getElementById("goalsRow");
    row?.scrollIntoView({ block: "center" });
    requestAnimationFrame(() => openGoalPanel(row || document.body, null, { gem, date: by && !isNaN(by.getTime()) && by >= today ? by : null }));
  };
  open();
}

// A link here with a day (Search's Go To Equity: /menu/bob.html?day=YYYY-MM-DD&open=equity#balancesCard) shows Equity's window
// on that day: it's the day this device remembers for it from then on (ACCOUNTS_DAY_KEY)
function takeLinkedDay() {
  const text = new URLSearchParams(location.search).get("day");
  const day = text ? createSafeMidnight(text, true) : null;
  if (!day || isNaN(day.getTime()) || day <= today || day > aheadLimit()) return;
  try { localStorage.setItem(ACCOUNTS_DAY_KEY, formatToMMDDYYYY(day)); } catch (e) {}
}

// A link that says open=equity opens Equity's window, from In Bank And Equity
function openLinkedWindow() {
  if (new URLSearchParams(location.search).get("open") === "equity") openEquityWindow(document.getElementById("balancesCard") || document.body);
}

// The card a link's #spot names comes into view once the page has slid in (its cards are made after the budget loads,
// so Layout.js may not have found it), open when it folds (an older link's #dataCard is In Bank And Equity now)
function showLinkedCard() {
  const id = location.hash ? decodeURIComponent(location.hash.slice(1)) : "";
  const spot = document.getElementById(id === "dataCard" ? "balancesCard" : id);
  if (!spot) return;
  for (const fold of folds.values()) if (fold.el === spot) fold.open();
  const started = Date.now();
  const tryScroll = () => {
    if (document.documentElement.style.overflowY === "hidden" && Date.now() - started < 3000) return requestAnimationFrame(tryScroll);
    spot.scrollIntoView({ block: "start" });
  };
  tryScroll();
}

document.addEventListener("budget:updated", () => {
  if (workspaceLoaded && pageCards.length > 0) renderPage();
});

//#endregion

// =====================================================================
// #region THE PAGE
// =====================================================================

// The page, top to bottom: Bob's highlights; Bob's Cards, a row for each of his cards (what it says, or Off), each opening
// the card in a window with its switches; then what he works from, as cards that fold open and shut: the Spectrum Graph
// and Data's groups (DATA_GROUPS). Made once: titles, help, switches, and boxes stay while the page is open (so a box being
// typed in or a switch just tapped stays put), and what they show is drawn again with every change.
const CARDS_HELP = "Each of Bob's cards, with what it says right now. Tap one to open it: its switch turns it on or off (off, it works nothing out), Warnings lets it speak up on Home, and its ? says what it's for.";
const OPEN_KEY = "prismal_bob_open"; // The folding cards open in this browser (In Bank And Equity, to start)
let cardRows = new Map();  // Each of Bob's cards' row in Bob's Cards, by its id: { row, note, value }
let folds = new Map();     // The folding cards, by id: { el, body, summary, toggle }
let spectrumCard = null;   // The Spectrum Graph, drawn like his cards (see buildCard), in its folding card
let dataHighlight = null;  // Data's highlight, for the top card

function buildPage() {
  const top = document.getElementById("bobTop");
  const { head, help } = cardHead("Bob's Highlights", TOP_HELP, "bobTop");
  highlightList = BudgetUI.element("ul", "bobHighlights");
  top.querySelector(".bobTopText").append(head, help, highlightList);
  top.hidden = false;
  pageCards = CARDS.filter(def => BOB_CARDS.has(def.id)).map(buildCard);
  const spectrumDef = CARDS.find(def => def.id === "spectrum");
  const spectrumFold = makeFold("spectrum", spectrumDef.title, spectrumDef.help);
  spectrumCard = { def: spectrumDef, el: spectrumFold.el, toggle: null, state: null, warning: null, body: BudgetUI.element("div"), results: BudgetUI.element("div", "sectionResults"), highlight: null };
  spectrumCard.body.append(spectrumDef.setup(spectrumCard), spectrumCard.results);
  spectrumFold.body.append(spectrumCard.body);
  const dataFolds = DATA_GROUPS.map(group => makeFold(group.id, group.title, group.help));
  // (Bob's Cards, then the folding cards: side by side on a wide screen, see .wideColumns)
  const columns = BudgetUI.element("div", "wideColumns");
  const cardsColumn = BudgetUI.element("div", "wideColumn");
  const foldsColumn = BudgetUI.element("div", "wideColumn");
  cardsColumn.append(buildCardsCard());
  foldsColumn.append(spectrumFold.el, ...dataFolds.map(fold => fold.el));
  columns.append(cardsColumn, foldsColumn);
  document.getElementById("dataView").replaceChildren(columns);
}

// Bob's Cards: a row for each card that has a switch, opening it in a window
function buildCardsCard() {
  const section = BudgetUI.element("section", "budgetCard bobCardsCard");
  section.id = "bobCardsCard";
  const { head, help, title } = cardHead("Bob's Cards", CARDS_HELP, "bobCards");
  section.setAttribute("aria-labelledby", title.id);
  const list = BudgetUI.element("ul", "bobData");
  for (const card of pageCards) {
    const item = BudgetUI.element("li", "bobDataItem");
    const row = BudgetUI.element("button", "bobDataRow bobCardRow");
    row.type = "button";
    row.id = `${card.def.id}Row`;
    const text = BudgetUI.element("span", "bobDataText");
    const note = BudgetUI.element("span", "bobDataNote");
    text.append(BudgetUI.element("span", "bobDataLabel", card.def.title), note);
    const value = BudgetUI.element("span", "bobDataValue");
    row.append(text, value, BudgetUI.element("span", "bobDataMore", "›"));
    row.addEventListener("click", () => openCardWindow(card, row));
    item.append(row);
    list.append(item);
    cardRows.set(card.def.id, { row, note, value });
  }
  section.append(head, help, list);
  return section;
}

// Each row of Bob's Cards as its card is now: On, with what it says (red-orange when it needs a look), or Off
function renderCardRows() {
  for (const card of pageCards) {
    const { row, note, value } = cardRows.get(card.def.id);
    const on = bobCardOn(card.def.id);
    value.textContent = on ? "On" : "Off";
    value.classList.toggle("isOffValue", !on);
    note.textContent = on ? (card.highlight ? card.highlight.text : "") : "Off. Open it to see what it's for, and turn it on.";
    row.classList.toggle("isWarning", on && !!card.highlight?.warn);
  }
}

// One of Bob's cards in a window (from its row): its ?, its switches, and what it shows, drawn again with every change while
// it's open. What it opens goes over it (see openWindow).
function openCardWindow(card, origin) {
  BudgetUI.openPanel({
    origin,
    size: "large",
    title: card.def.title,
    build(form) {
      form.addEventListener("submit", (event) => event.preventDefault()); // (Its boxes never send the window anywhere)
      card.el.classList.add("inWindow");
      form.append(card.el);
    }
  });
}

// A window from Bob's page: over the one it was opened from (a card's window), which comes back when it closes
function openWindow(options) {
  return BudgetUI.openPanel({ ...options, stacked: options.stacked ?? !!options.origin?.closest?.(".budgetPanel") });
}

// A card that folds open and shut: its title is the button (with a figure from it, shown while it's shut), its ? beside
// it. Which are open is kept in this browser.
function makeFold(id, titleText, helpText) {
  const el = BudgetUI.element("section", "budgetCard bobFold");
  el.id = `${id}Card`;
  const { head, help, title } = cardHead(titleText, helpText, id);
  el.setAttribute("aria-labelledby", title.id);
  const toggle = BudgetUI.element("button", "foldToggle");
  toggle.type = "button";
  const summary = BudgetUI.noTranslate(BudgetUI.element("span", "foldSummary"));
  const chevron = BudgetUI.element("span", "foldChevron", "›");
  chevron.setAttribute("aria-hidden", "true");
  toggle.append(BudgetUI.element("span", "foldTitle", titleText), summary, chevron);
  title.replaceChildren(toggle);
  const body = BudgetUI.element("div", "sectionBody foldBody");
  body.id = `${id}Body`;
  toggle.setAttribute("aria-controls", body.id);
  const fold = { el, body, summary, toggle };
  const show = (open) => {
    toggle.setAttribute("aria-expanded", String(open));
    el.classList.toggle("isOpen", open);
    body.hidden = !open;
  };
  show(openFolds().includes(id));
  toggle.addEventListener("click", () => {
    const open = !el.classList.contains("isOpen");
    show(open);
    const kept = openFolds().filter(other => other !== id);
    try { localStorage.setItem(OPEN_KEY, JSON.stringify(open ? [...kept, id] : kept)); } catch (e) {}
  });
  fold.open = () => show(true);
  folds.set(id, fold);
  el.append(head, help, body);
  return fold;
}

// The folding cards open in this browser
function openFolds() {
  try {
    const kept = JSON.parse(localStorage.getItem(OPEN_KEY) || "null");
    return Array.isArray(kept) ? kept : ["balances"];
  } catch (e) {
    return ["balances"];
  }
}

// Data's groups, each in its folding card (with its first figure beside its title), and Data's highlight
function renderDataGroups(shared) {
  let found;
  try {
    found = dataGroups(shared);
  } catch (error) {
    console.error("Bob's Data couldn't be worked out:", error);
    for (const group of DATA_GROUPS) folds.get(group.id).body.replaceChildren(BudgetUI.element("p", "panelHint", "Bob couldn't work this out. Please refresh to try again."));
    dataHighlight = null;
    return;
  }
  dataHighlight = found.highlight;
  for (const group of DATA_GROUPS) {
    const fold = folds.get(group.id);
    const { summary, rows } = found.groups[group.id];
    fold.summary.textContent = summary.text;
    fold.summary.classList.toggle("negative", summary.amount < 0);
    const list = BudgetUI.element("ul", "bobData");
    list.append(...rows);
    fold.body.replaceChildren(list);
  }
}

// One card: its title and help, its switch (when it has one), and what it shows
function buildCard(def) {
  const el = BudgetUI.element("section", "budgetCard bobSection");
  el.id = `${def.id}Card`;
  const { head, help, title } = cardHead(def.title, def.help, def.id);
  el.setAttribute("aria-labelledby", title.id);
  const card = { def, el, toggle: null, state: null, warning: null, body: BudgetUI.element("div", "sectionBody"), results: BudgetUI.element("div", "sectionResults"), highlight: null };
  // Its Warnings switch, shown while the card is on
  if (BOB_WARNING_CARDS.includes(def.id)) {
    const label = BudgetUI.element("label", "sectionSwitch warningSwitch");
    const toggle = BudgetUI.element("input", "pillSwitch");
    toggle.type = "checkbox";
    toggle.setAttribute("role", "switch");
    toggle.setAttribute("aria-label", `${def.title} warnings on Home on or off`);
    toggle.title = "Warnings: when this card needs a look, Bob says so on Home, over the calendar";
    toggle.addEventListener("change", () => switchWarning(card, toggle.checked));
    label.append(BudgetUI.element("span", "sectionState", "Warnings"), toggle);
    head.append(label);
    card.warning = toggle;
  }
  if (BOB_CARDS.has(def.id)) {
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

// Draw every card that's on (one that's off shows only its title and switch), the Spectrum Graph, and Data's groups, then
// Bob's Cards' rows and the highlights from them all
function renderPage() {
  const shared = sharedFigures();
  for (const card of pageCards) drawCard(card, shared);
  drawCard(spectrumCard, shared);
  renderDataGroups(shared);
  renderCardRows();
  renderHighlights();
}

// Draw one card, keeping its highlight for the top card
function drawCard(card, shared = sharedFigures()) {
  const on = bobCardOn(card.def.id);
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
    console.error(`Bob's ${card.def.title} card couldn't be worked out:`, error);
    card.results.replaceChildren(BudgetUI.element("p", "panelHint", "Bob couldn't work this card out. Please refresh to try again."));
  }
}

// A card's switches as the budget has them (off while one is saving): On or Off, and its Warnings (only while it's on)
function showSwitch(card, on) {
  if (card.warning) {
    card.warning.closest("label").hidden = !on;
    card.warning.checked = bobWarningOn(card.def.id);
    card.warning.disabled = switching;
  }
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
  const result = await turnBobCard(card.def.id, on);
  switching = false;
  for (const other of pageCards) showSwitch(other, bobCardOn(other.def.id));
  if (!result.ok) BudgetUI.showToast(result.message || "That didn't work. Please try again.", true);
  else BudgetUI.warnIfUnsaved(result);
}

// A card's Warnings switch was tapped: saved with the budget, like its own switch
async function switchWarning(card, on) {
  if (switching) return;
  switching = true;
  for (const other of pageCards) {
    if (other.toggle) other.toggle.disabled = true;
    if (other.warning) other.warning.disabled = true;
  }
  const result = await turnBobWarning(card.def.id, on);
  switching = false;
  for (const other of pageCards) showSwitch(other, bobCardOn(other.def.id));
  if (!result.ok) BudgetUI.showToast(result.message || "That didn't work. Please try again.", true);
  else if (result.saved === false) BudgetUI.warnIfUnsaved(result);
  else if (on) BudgetUI.showToast(`${card.def.title} warnings are on: when it needs a look, Bob says so on Home, over the calendar.`);
}

// Bob's warnings for Home: what each card that's on with its Warnings on says when it needs a look (its highlight, when
// it warns), worked out the way this page does it, without drawing the page. [{ title, text }]
function bobWarnings() {
  const defs = CARDS.filter(def => BOB_WARNING_CARDS.includes(def.id) && bobWarningOn(def.id));
  if (defs.length === 0) return [];
  const shared = sharedFigures();
  const found = [];
  for (const def of defs) {
    const card = { def, el: BudgetUI.element("section"), toggle: null, state: null, warning: null, body: BudgetUI.element("div"), results: BudgetUI.element("div"), highlight: null };
    try {
      if (def.setup) def.setup(card);
      const highlight = def.render(card, shared);
      if (highlight && highlight.warn) found.push({ title: def.title, text: highlight.text });
    } catch (error) {
      console.error(`Bob's ${def.title} card couldn't be worked out:`, error);
    }
  }
  return found;
}

// The top card: a line from the Spectrum Graph, Data, and each card that's on (red-orange for one that needs a look), and
// how many are off
function renderHighlights() {
  const items = [];
  const lines = [[spectrumCard.def.title, spectrumCard.highlight], ["Data", dataHighlight], ...pageCards.map(card => [card.def.title, card.highlight])];
  for (const [title, highlight] of lines) {
    if (!highlight) continue;
    const item = BudgetUI.element("li", highlight.warn ? "bobHighlight isWarning" : "bobHighlight");
    item.append(BudgetUI.element("strong", "", `${title}: `), highlight.text);
    items.push(item);
  }
  const off = pageCards.filter(card => card.toggle && !bobCardOn(card.def.id)).length;
  if (off > 0) {
    items.push(BudgetUI.element("li", "bobHighlight isQuiet", off === 1
      ? "One more card is off. Turn it on in Bob's Cards to see what it has to say here."
      : `${off} more cards are off. Turn any of them on in Bob's Cards to see what they have to say here.`));
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
// Everything the cards work from, in groups that each show as a card of their own on his page (folding open and shut): a
// row for each figure, with a note under it, and the rows with more behind them open it in a window. (Goals and Wavelength
// Planning are cards of his, so their figures are there.) Data, the Snapshot page's card of all of it, is every group's
// rows in one list.

const DATA_GROUPS = [
  { id: "balances", title: "In Bank And Equity", help: "In Bank today, the lowest it gets after today (through Lowest's last day, picked on Home's Lowest card), and your Equity accounts. Tap one to see it on a graph, or Equity's window: each account today and on a day you pick." },
  { id: "spending", title: "Paydays And Spending", help: `Your paydays, and what goes out besides your recurring bills: in the last 7 days, and between paychecks. Payday and Spending Pace work from these, out of your last ${HISTORY_MONTHS} months of History.` },
  { id: "purchases", title: "Purchases And Catchups", help: `Regular costs you add by hand or with Quick Budget: the last ${REFUND_DAYS} days, the ones still to come before the lowest day, and your Catchup entries. Refunds and Catchup Entries work from these.` },
  { id: "bills", title: "Bills And The Tracker", help: `What your recurring entries come to each month, the big bills of the next ${BILL_DAYS} days, and the tracker's costs between its two days (its window has every row, New Row, and Edit).` }
];

// Data's figures in their groups ({ balances: { summary: { text, amount }, rows: [<li>] }, ... }, see DATA_GROUPS), and Data's
// highlight
function dataGroups(shared) {
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
  // (What Goals and Refunds work from too)
  const summaries = shared.summaries();
  const accountsTotal = Math.round(summaries.reduce((sum, summary) => sum + summary.today, 0) * 100) / 100;
  const coming = lowest.date > today ? purchasesBetween(addDays(today, 1), lowest.date) : [];
  const comingSpent = coming.reduce((total, purchase) => total - purchase.amount, 0);
  // (Spending is worked out as what went out; the rows show it below $0, like every cost)
  const weekSpent = pace ? pace.thisWeek : lastWeekSpent(spending);
  const tracked = trackerTotals(trackerDays().from, trackerDays().to);
  const trackedCosts = tracked.get(trackerRowIndex("costs"))?.total ?? 0;
  const trackedGains = tracked.get(trackerRowIndex("gains"))?.total ?? 0;

  const groups = {
    balances: {
      summary: { text: formatMoney(inBank), amount: inBank },
      rows: [
        dataRow("In Bank today", formatMoney(inBank), "", { amount: inBank, open: (origin) => openGraphWindow(origin, "In Bank", "In Bank at the end of each day, from History and the calendar. Pick a later day to see what your budget expects.", inBankGraph("In Bank Over Time")) }),
        dataRow("Lowest in bank after today", formatMoney(lowest.amount), `On ${showDay(lowest.date)}`, { amount: lowest.amount, open: (origin) => openGraphWindow(origin, "Lowest In Bank", `The lowest In Bank gets from today through ${showDate(lookAheadEnd())} (${lookAheadWords()} past the calendar, picked on Home's Lowest card) is ${formatMoney(lowest.amount)}, on ${showDate(lowest.date)}. Pick a later day to see it on the graph.`, inBankGraph("In Bank Over Time")) }),
        dataRow("Equity", formatMoney(accountsTotal), `${summaries.length} ${summaries.length === 1 ? "account" : "accounts"} today; with In Bank, the Total is ${formatMoney(inBank + accountsTotal)}`,
          { amount: accountsTotal, open: (origin) => openEquityWindow(origin) })
      ]
    },
    spending: {
      summary: { text: formatMoney(-weekSpent), amount: -weekSpent },
      rows: [
        dataRow("Paydays", payday.next ? showDay(payday.next) : "None coming", payday.next ? `The next one, in ${dayCount(payday.next)} ${dayCount(payday.next) === 1 ? "day" : "days"}` : `No paycheck in the next ${PAYDAY_LOOK} days`,
          { open: (origin) => openPaydaysWindow(origin, spending, payday) }),
        dataRow("Spent besides recurring bills", formatMoney(-weekSpent), pace ? `In the last 7 days (a usual week: ${formatMoney(-pace.usualWeek)})` : "In the last 7 days",
          { amount: -weekSpent, open: (origin) => openWeeksWindow(origin, spending) }),
        dataRow("Usually spent between paychecks", payday.average === null ? "--" : formatMoney(-payday.average),
          payday.average === null ? `Needs ${HISTORY_MONTHS} months of History` : `In the ${payday.span} days from a payday, besides recurring bills`,
          payday.average === null ? {} : { amount: -payday.average }),
        dataRow("History", oldest ? `From ${showDate(oldest)}` : "None yet",
          oldest ? (spending.enough ? `${HISTORY_MONTHS} months or more: enough for every card` : `Payday and Spending Pace need ${HISTORY_MONTHS} months of it`) : "Each week moves into History as it passes")
      ]
    },
    purchases: {
      summary: { text: formatMoney(-spent), amount: -spent },
      rows: [
        dataRow(`Purchases, last ${REFUND_DAYS} days`, formatMoney(-spent), `${purchases.length} Regular ${purchases.length === 1 ? "cost" : "costs"} added by hand or with Quick Budget`,
          { amount: -spent, open: (origin) => openEntriesWindow(origin, `Purchases, Last ${REFUND_DAYS} Days`, purchases, `None in the last ${REFUND_DAYS} days.`, () => runningGraph("Purchases, Added Up", "Purchases", REFUND_DAYS, purchasesBetween, "None in these days.")) }),
        dataRow("Purchases still to come", formatMoney(-comingSpent), lowest.date > today ? `${coming.length} by the lowest day, ${showDay(lowest.date)}` : "None before the lowest day",
          { amount: -comingSpent, open: (origin) => openEntriesWindow(origin, "Purchases Still To Come", coming, "None before the lowest day.", () => runningGraph("Purchases Still To Come, Added Up", "Purchases", 0, purchasesBetween, "Pick a later day to see what's planned, added up.")) }),
        dataRow(`Catchup entries, last ${CATCHUP_DAYS} days`, formatMoney(-catchup.total), `${catchup.entries.length} ${catchup.entries.length === 1 ? "entry" : "entries"}`,
          { amount: -catchup.total, open: (origin) => openEntriesWindow(origin, `Catchup Entries, Last ${CATCHUP_DAYS} Days`, catchup.entries, `None in the last ${CATCHUP_DAYS} days.`, () => runningGraph("Catchup Entries, Added Up", "Catchups", CATCHUP_DAYS, catchupsBetween, "None in these days.")) })
      ]
    },
    bills: {
      summary: { text: formatMoney(recurring.costs), amount: recurring.costs },
      rows: [
        dataRow("Recurring entries each month", formatMoney(recurring.costs), `In bills, and ${formatMoney(recurring.gains)} in gains`, { amount: recurring.costs, open: (origin) => openRecurringWindow(origin, recurring) }),
        dataRow(`Big bills, next ${BILL_DAYS} days`, String(bills.length), bills[0] ? `The first: ${capitalize(bills[0].title)} on ${showDay(bills[0].date)}` : "None",
          { open: (origin) => openEntriesWindow(origin, `Big Bills, Next ${BILL_DAYS} Days`, bills, `None in the next ${BILL_DAYS} days.`, () => runningGraph("Big Bills, Added Up", "Big bills", 0, (first, until) => bigBills().filter(bill => bill.date >= first && bill.date <= until), `Pick a later day, up to ${BILL_DAYS} days from today, to see the bills ahead added up.`)) }),
        dataRow("Tracker", formatMoney(trackedCosts), `Costs from ${showDay(trackerDays().from)} through ${showDay(trackerDays().to)}, and ${formatMoney(trackedGains)} in gains`,
          { amount: trackedCosts, open: (origin) => openTrackerWindow(origin) })
      ]
    }
  };
  // (And where everything will be on the day this device picked for Equity's window)
  const day = readAccountsDay();
  const ahead = equityFigures(day, shared.projection(), summaries);
  const interestNote = ahead.hasInterest && ahead.total.interest !== 0 ? `, with ${formatMoney(ahead.total.interest)} in interest by then` : "";
  const highlight = { text: `In Bank is ${formatMoney(inBank)} today, and the lowest it gets is ${formatMoney(lowest.amount)} on ${showDay(lowest.date)}. On ${showDate(day)}, In Bank will be ${formatMoney(ahead.rows[0].then)} and the Total ${formatMoney(ahead.total.then)}${interestNote}.`, warn: lowest.amount < 0 || ahead.rows[0].then < 0 };
  return { groups, highlight };
}

// Data as one card (the Snapshot page's): every group's rows, in order
function renderDataCard(card, shared) {
  const { groups, highlight } = dataGroups(shared);
  const list = BudgetUI.element("ul", "bobData");
  for (const group of DATA_GROUPS) list.append(...groups[group.id].rows);
  card.results.replaceChildren(list);
  return highlight;
}

// Data's rows as figures, for the Snapshot page (Snapshot Page.js): [{ label, value, note, amount, open }], in Data's order.
// Data is worked out as for its card, and each row it draws goes in the list too (dataRowSink).
let dataRowSink = null;
function dataFigures(shared) {
  dataRowSink = [];
  try {
    renderDataCard({ results: BudgetUI.element("div") }, shared);
    return dataRowSink;
  } finally {
    dataRowSink = null;
  }
}

// One of Data's rows: what it is (and a note under it), and its figure. One with more behind it (open: opens it, given
// the row) is a button with a ›.
function dataRow(label, value, note = "", { amount = null, open = null } = {}) {
  if (dataRowSink) dataRowSink.push({ label, value, note, amount, open });
  const item = BudgetUI.element("li", "bobDataItem");
  const row = BudgetUI.element(open ? "button" : "div", "bobDataRow");
  if (open) {
    row.type = "button";
    row.addEventListener("click", () => open(row));
  }
  const text = BudgetUI.element("span", "bobDataText");
  text.append(BudgetUI.element("span", "bobDataLabel", label));
  if (note) text.append(BudgetUI.element("span", "bobDataNote", note));
  const figure = BudgetUI.noTranslate(BudgetUI.element("span", "bobDataValue", value));
  if (amount !== null && amount < 0) figure.classList.add("negative");
  row.append(text, figure);
  if (open) row.append(BudgetUI.element("span", "bobDataMore", "›"));
  item.append(row);
  return item;
}

// In Bank today
function inBankToday() {
  const spot = calendarSpot(today);
  return (spot && readInBank(calendarData[spot.r][spot.c])) ?? 0;
}

// The lowest In Bank from today through Lowest's last day (Lowest in bank after today), and its day
function lowestAhead() {
  let lowest = null;
  const consider = (date, amount) => {
    if (amount !== null && (!lowest || amount < lowest.amount)) lowest = { amount, date };
  };
  for (let r = 0; r < CALENDAR_ROWS; r++) {
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
  for (let r = 0; r < CALENDAR_ROWS; r++) {
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
  const entries = catchupsBetween(addDays(today, -(CATCHUP_DAYS - 1)), today).sort((a, b) => b.date - a.date);
  return { total: Math.round(-entries.reduce((sum, entry) => sum + entry.amount, 0) * 100) / 100, entries };
}

// Those Catchup entries from `from` through `to`: [{ date, title, amount }]
function catchupsBetween(from, to) {
  const entries = [];
  eachDay(from, to, (date, lines) => {
    for (const text of lines) {
      const line = readLine(text);
      if (line.blank || line.system || line.amount >= 0 || getSpecialType(line.sprite) === "✖️") continue;
      if (/^catch ?up$/.test(line.clean)) entries.push({ date, title: line.title, amount: line.amount });
    }
  });
  return entries;
}

// Purchases from `from` through `to`: Regular costs added by hand or with a Quick Budget icon (not from a recurring entry or
// a connected spreadsheet, not placeholders, and not Catchup entries, which only make In Bank match the bank), on History's
// days, the calendar's, and in Upcoming. [{ date, title, amount }], newest first.
function purchasesBetween(from, to) {
  const found = [];
  const add = (date, text) => {
    const line = readLine(text);
    if (line.blank || line.system || !line.title || line.amount >= 0) return;
    if (getSpecialType(line.sprite) !== "❗️" || entryMark(line.sprite) || isPlaceholder(line.sprite) || /^catch ?up$/.test(line.clean)) return;
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
    for (let day = afterCalendarStart; day <= lastDay; day = addDays(day, 1)) {
      for (const row of uncommon) {
        if (recurringRowHits(row.parsed, day) && !changed.has(day.getTime() + "|" + row.parsed.cleanTitle + "|" + row.parsed.special)) {
          bills.push({ date: day, title: row.title, amount: row.amt });
        }
      }
    }
  }
  for (const [time, day] of sheetEntriesByDay(afterCalendarStart, lastDay)) {
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

// A floating window with only a note and a line graph (see Line Graph.js)
function openGraphWindow(origin, title, intro, graph) {
  openWindow({
    origin,
    size: "large",
    title,
    build(form, panel) {
      form.addEventListener("submit", (event) => event.preventDefault()); // (Enter in its date box: nothing to send)
      form.append(BudgetUI.element("p", "panelHint", intro), graph.el, BudgetUI.buttonRow([{ label: "Close", onClick: () => panel.close() }]));
    }
  });
}

// A floating window with a table in a box that scrolls, and a note over it: columns (titles), rows (each a list of
// cells: text, or { text, amount } for an amount, red or green by its sign), and at the bottom, when it can have one, a
// line graph (graph: makes it, see Line Graph.js)
function openTableWindow(origin, { title, intro = "", columns, rows, empty = "Nothing to show.", graph = null }) {
  openWindow({
    origin,
    size: "large",
    title,
    build(form, panel) {
      form.addEventListener("submit", (event) => event.preventDefault()); // (Nothing to send)
      if (intro) form.append(BudgetUI.element("p", "panelHint", intro));
      form.append(rows.length > 0 ? tableBox(columns, rows) : BudgetUI.element("p", "panelText", empty));
      if (graph) form.append(graph().el);
      form.append(BudgetUI.buttonRow([{ label: "Close", onClick: () => panel.close() }]));
    }
  });
}

// A table in a box that scrolls up and down (see openTableWindow)
function tableBox(columns, rows) {
  const table = BudgetUI.element("table", "dataTable bobTable");
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
  const box = BudgetUI.element("div", "bobScroll");
  box.append(BudgetUI.spanHeaderBar(table));
  return box;
}

// An amount's cell (see tableBox)
const amountCell = (amount) => ({ text: formatMoney(amount), amount });

// Entries in a window: each one's day, title, and amount (graph: makes the line graph at the bottom)
function openEntriesWindow(origin, title, entries, empty, graph = null) {
  openTableWindow(origin, {
    title,
    columns: ["Day", "Entry", "Amount"],
    rows: entries.map(entry => [showDate(entry.date), capitalize(String(entry.title)), amountCell(entry.amount)]),
    empty,
    graph
  });
}

// Recurring entries each month: each one, how often, its amount, and what it comes to in a month
function openRecurringWindow(origin, recurring) {
  openTableWindow(origin, {
    title: "Recurring Entries Each Month",
    intro: `About ${formatMoney(recurring.costs)} a month in bills and ${formatMoney(recurring.gains)} in gains (transfers left out), from how often each one lands.`,
    columns: ["Entry", "How Often", "Amount", "A Month"],
    rows: recurring.rows.map(row => [capitalize(row.title), row.frequency, amountCell(row.amount), amountCell(row.monthly)]),
    empty: "No recurring entries yet. Add them on the Recurring Entries page.",
    graph: recurringGraph
  });
}

// Each goal: what it's for, its amount, and the day to reach it by, with the goals' graph (from the Goals card)
function openGoalsTableWindow(origin) {
  const goals = accountsData?.goals || [];
  openTableWindow(origin, {
    title: "Goals Over Time",
    intro: "What each goal is for, its amount, and the day to reach it by, with where each one's account is on each day.",
    columns: ["Goal", "For", "Amount", "By"],
    rows: goals.map(goal => [goalName(goal), goalTarget(goal) || "--", amountCell(goal.amount), goal.date ? showStoredDate(goal.date) : "--"]),
    empty: "No goals yet.",
    graph: () => goalsGraph(goals)
  });
}

// Each wavelength, longest to shortest, with how many titles are on it and what each cost week by week (from the
// Wavelength Planning card)
function openWavelengthsTableWindow(origin) {
  const purposes = Object.values(accountsData?.bob?.purposes || {});
  openTableWindow(origin, {
    title: "Each Wavelength, Week By Week",
    intro: "How many titles are on each wavelength (every entry with a title shares its title's wavelength), and what each cost week by week.",
    columns: ["Wavelength", "Titles"],
    rows: wavelengthList().map(wave => [wave.name, String(purposes.filter(id => id === wave.id).length)]),
    graph: wavelengthsGraph
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
    empty: `No paydays in the last ${HISTORY_MONTHS} months or the next ${PAYDAY_LOOK} days.`,
    graph: () => paydaysGraph(payday.span)
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
    empty: "Nothing in History or on the calendar yet.",
    graph: spentGraph
  });
}

//#endregion

// =====================================================================
// #region EQUITY (Data's Equity window)
// =====================================================================
// In Bank, each Equity account, and the Total: what each holds now and the most it can hold, what it will on the day in the box at
// the top of its column (this device remembers it), and each one's interest: what it gets from now to then and how it's
// worked out (a column that only shows when an account has interest). Under them, a graph of all of it.

// The figures on a day (projection: projectBudget, through at least that day): { rows: [{ name, now, then, max, interest,
// rate, about }], total, hasInterest }
function equityFigures(day, projection, summaryList) {
  const summaries = new Map(summaryList.map(summary => [summary.index, summary]));
  const hasInterest = summaryList.some(summary => summary.interest);
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
      rate: summary?.interest?.rate,
      about: summary?.interest ? describeInterest(summary.interest) : ""
    });
  }
  const total = {
    name: "Total",
    now: round(rows.reduce((sum, row) => sum + row.now, 0)),
    then: round(rows.reduce((sum, row) => sum + row.then, 0)),
    interest: hasInterest ? round(rows.reduce((sum, row) => sum + (row.interest || 0), 0)) : null,
    isTotal: true
  };
  return { rows, total, hasInterest };
}

// Data's Equity window: the table, with the day it works out to in its column's head, and a graph at the bottom
function openEquityWindow(origin) {
  openWindow({
    origin,
    size: "large",
    title: "Equity",
    build(form, panel) {
      form.addEventListener("submit", (event) => event.preventDefault()); // (Enter in the date box: nothing to send)
      const table = BudgetUI.element("table", "dataTable bobAccounts");
      const head = table.createTHead().insertRow();
      const input = BudgetUI.element("input", "dateInput");
      input.type = "text";
      input.inputMode = "numeric";
      input.placeholder = datePattern();
      input.translate = false;
      input.setAttribute("aria-label", "The day to work the balances out to");
      const dayRow = BudgetUI.element("div", "dateRow");
      dayRow.append(input, BudgetUI.datePickerButton(input, "Balances On", { min: addDays(today, 1), max: aheadLimit() }));
      const dayHead = BudgetUI.element("th", "dayHead");
      dayHead.append(dayRow);
      head.append(BudgetUI.element("th", "", "Account"), BudgetUI.element("th", "", "Now"), dayHead, BudgetUI.element("th", "interestHead", "Interest"));
      table.createTBody();
      const note = BudgetUI.element("p", "panelHint bobAccountsNote");
      const box = BudgetUI.element("div", "bobAccountsBox");
      box.append(BudgetUI.spanHeaderBar(table));
      const graph = equityGraph();

      const draw = () => {
        const day = readAccountsDay();
        if (document.activeElement !== input) input.value = showDate(day);
        const summaryList = accountSummaries();
        const { rows, total, hasInterest } = equityFigures(day, projectBudget(day, summaryList), summaryList);
        table.tBodies[0].replaceChildren(...[...rows, total].flatMap(row => {
          const tr = BudgetUI.element("tr", row.isTotal ? "totalRow" : "");
          tr.append(BudgetUI.noTranslate(BudgetUI.element("td", "titleCell", row.name)));
          const now = BudgetUI.noTranslate(BudgetUI.element("td", `amountCell ${BudgetUI.amountClass(row.now)}`, formatMoney(row.now)));
          if (row.max) now.append(BudgetUI.element("span", "accountMax", `/${formatMoney(row.max)}`));
          const interest = BudgetUI.noTranslate(BudgetUI.element("td", `amountCell interestCell${row.interest === null ? "" : " " + BudgetUI.amountClass(row.interest)}`, row.interest === null ? "--" : formatMoney(row.interest)));
          if (row.rate) interest.append(BudgetUI.element("span", "interestRate", `${row.rate}% a year`));
          tr.append(now, BudgetUI.noTranslate(BudgetUI.element("td", `amountCell ${BudgetUI.amountClass(row.then)}`, formatMoney(row.then))), interest);
          if (!row.about) return [tr];
          // (How it's worked out, on its own line under the account)
          const about = BudgetUI.element("tr", "interestAbout");
          const words = BudgetUI.element("td", "", row.about);
          words.colSpan = 4;
          about.append(words);
          return [tr, about];
        }));
        table.classList.toggle("noInterest", !hasInterest);
        note.classList.remove("isError");
        note.textContent = hasInterest
          ? `Now is each balance today, over the most it can hold when it has a Max. The day at the top of its column counts everything planned until then. Interest is what each account gets (or pays, below $0) from today through ${showDate(day)}, and how it's worked out.`
          : "Now is each balance today, over the most it can hold when it has a Max. The day at the top of its column counts everything planned until then: recurring entries, connected spreadsheets, and Upcoming.";
      };
      input.addEventListener("change", () => {
        const day = parseTypedDate(input.value);
        if (isNaN(day.getTime()) || day <= today || day > aheadLimit()) {
          note.textContent = `Pick a day after today, up to ${showDate(aheadLimit())}.`;
          note.classList.add("isError");
          return;
        }
        try { localStorage.setItem(ACCOUNTS_DAY_KEY, formatToMMDDYYYY(createSafeMidnight(day))); } catch (e) {}
        draw();
        renderPage();
      });
      const follow = () => {
        if (!panel.panel.isConnected || panel.panel.classList.contains("isClosing")) return document.removeEventListener("budget:updated", follow);
        draw();
        graph.draw();
      };
      document.addEventListener("budget:updated", follow);
      form.append(BudgetUI.element("p", "panelHint", "What In Bank, each Equity account, and the Total hold now, and what your budget says they'll hold on the day picked at the top of the column (counting recurring entries, connected spreadsheets, Upcoming, and interest). This device remembers the day."), box, note, graph.el, BudgetUI.buttonRow([{ label: "Close", onClick: () => panel.close() }]));
      draw();
    }
  });
}

//#endregion

// =====================================================================
// #region TRACKER (Data's Tracker window; its rows are the tracker table, see Tracker rows in Process Budget.js)
// =====================================================================
// The tracker adds up entries by row between two days, From and To (the last 3 months through today to start, kept while
// the page is open), the way the budget's own tracker counts them (updateTrackerTab): each row counts the entries its
// aliases point to (once each, and transfers only in a row that counts them), Costs and Gains every cost and gain besides
// transfers, Transfers every transfer, Interest the Equity accounts' interest, and Undefined whatever no row counts. Days
// after today count what's planned for them, like Wavelength Planning. Data's Tracker row opens its window: the rows, with
// New Row, Edit (drag, sections, delete), and a search, from Budget Pages.js's tables; and a row opens its own window,
// with what each of its aliases came to and a line graph of them added up.

const TRACKER_MONTHS = 3; // The tracker's From starts this many months before today
const TRACKER_COLUMNS = ["Type", "Total", { label: "Aliases", className: "aliasHead" }];
let trackerRange = null;  // { from, to }: the days the tracker adds up (see trackerDays)
let trackerWindow = null; // { view, search, found, boxes } while its window is open

// The tracker's days: the last 3 months through today, until others are picked
function trackerDays() {
  if (!trackerRange) trackerRange = { from: addMonths(today, -TRACKER_MONTHS), to: today };
  return trackerRange;
}

// Where a row that fills in by itself is in the tracker table ("costs", "gains", "transfers", "interest", "undefined"), or -1
function trackerRowIndex(type) {
  return trackerData.findIndex((row, index) => index > 0 && !isSeparatorRow(row) && cleanString(row[0]) === type);
}

const cents = (amount) => Math.round(amount * 100) / 100;

// An alias as a part of its row: { key (its title, as compared), name ("Rent", or "Rent (costs)" for one that counts only costs) }
const aliasPart = (alias) => ({ key: alias.clean, name: alias.count === "all" ? alias.title : `${alias.title} (${alias.count})` });

// An entry's title as a part of Transfers or Undefined (without its Equity account, the way the tracker compares titles)
function entryPart(line) {
  const { title, account } = splitAccount(line.title);
  return { key: line.titleClean, name: capitalize(title || account) };
}

// A tracker row's stored aliases ("rent-, paycheck+, atm") as [{ title, clean, count }]
function aliasList(text) {
  return String(text ?? "").split(",").map(alias => parseAlias(alias)).filter(alias => alias.clean);
}

// Every amount the tracker counts from `from` through `to`: visit(the row's index in trackerData, part, date, amount), where part
// is what in the row it came from ({ key, name }: an alias; for Transfers and Undefined, the entry's title; for Interest, the
// account), or null for Costs and Gains
function trackerWalk(from, to, visit) {
  const autoRows = {};
  const byTitle = new Map(); // An alias's title, as compared -> [{ index, count, countsTransfers, part }]
  for (let index = 1; index < trackerData.length; index++) {
    const row = trackerData[index];
    if (isSeparatorRow(row)) continue;
    const type = cleanString(row[0]);
    if (TRACKER_AUTO_ROWS.includes(type)) {
      if (autoRows[type] === undefined) autoRows[type] = index;
      continue;
    }
    const countsTransfers = String(row[0]).trim().startsWith("⭕️");
    for (const alias of aliasList(row[4])) {
      if (!byTitle.has(alias.clean)) byTitle.set(alias.clean, []);
      byTitle.get(alias.clean).push({ index, count: alias.count, countsTransfers, part: aliasPart(alias) });
    }
  }
  const toAuto = (type, part, date, amount) => {
    if (autoRows[type] !== undefined) visit(autoRows[type], part, date, amount);
  };
  eachEntryBetween(from, to, (date, text) => {
    const line = readLine(text);
    if (line.blank || line.system || line.amount === 0) return;
    const isTransfer = isTransferEntry(line.sprite);
    if (isTransfer) toAuto("transfers", entryPart(line), date, line.amount);
    else toAuto(line.amount > 0 ? "gains" : "costs", null, date, line.amount);
    const counted = new Set();
    for (const match of byTitle.get(line.titleClean) || []) {
      if (counted.has(match.index) || !aliasCounts(match.count, line.amount) || (isTransfer && !match.countsTransfers)) continue;
      counted.add(match.index);
      visit(match.index, match.part, date, line.amount);
    }
    if (counted.size === 0 && !isTransfer) toAuto("undefined", entryPart(line), date, line.amount);
  });
  for (const credit of interestAdded) {
    if (credit.date >= from && credit.date <= to) toAuto("interest", { key: cleanString(credit.name), name: credit.name }, credit.date, credit.change);
  }
}

// What each row came to from `from` through `to`: Map(the row's index -> { total, parts: Map(part's key -> { name, total }) }).
// An ordinary row's parts are its aliases, in its own order (one with nothing counted is $0.00); Transfers', Undefined's, and
// Interest's are what they found, biggest first.
function trackerTotals(from, to) {
  const rows = new Map();
  for (let index = 1; index < trackerData.length; index++) {
    const row = trackerData[index];
    if (isSeparatorRow(row)) continue;
    const parts = new Map();
    if (!TRACKER_AUTO_ROWS.includes(cleanString(row[0]))) {
      for (const alias of aliasList(row[4])) {
        const part = aliasPart(alias);
        parts.set(part.key, { name: part.name, total: 0 });
      }
    }
    rows.set(index, { total: 0, parts });
  }
  trackerWalk(from, to, (index, part, date, amount) => {
    const row = rows.get(index);
    row.total += amount;
    if (!part) return;
    const known = row.parts.get(part.key) || { name: part.name, total: 0 };
    known.total += amount;
    row.parts.set(part.key, known);
  });
  for (const [index, row] of rows) {
    row.total = cents(row.total);
    for (const part of row.parts.values()) part.total = cents(part.total);
    if (TRACKER_AUTO_ROWS.includes(cleanString(trackerData[index][0]))) row.parts = new Map([...row.parts].sort((a, b) => Math.abs(b[1].total) - Math.abs(a[1].total)));
  }
  return rows;
}

// Each row's amounts by day from first through until: Map(the row's index -> { byDay: Map(day's time -> amount), parts: Map(part's
// key -> { name, byDay }) }), each ordinary row's aliases in its own order
function trackerDaily(first, until) {
  const rows = new Map();
  const rowOf = (index) => {
    if (!rows.has(index)) {
      const parts = new Map();
      const row = trackerData[index];
      if (!TRACKER_AUTO_ROWS.includes(cleanString(row[0]))) {
        for (const alias of aliasList(row[4])) {
          const part = aliasPart(alias);
          parts.set(part.key, { name: part.name, byDay: new Map() });
        }
      }
      rows.set(index, { byDay: new Map(), parts });
    }
    return rows.get(index);
  };
  const add = (byDay, time, amount) => byDay.set(time, (byDay.get(time) || 0) + amount);
  trackerWalk(first, until, (index, part, date, amount) => {
    const row = rowOf(index);
    add(row.byDay, date.getTime(), amount);
    if (!part) return;
    if (!row.parts.has(part.key)) row.parts.set(part.key, { name: part.name, byDay: new Map() });
    add(row.parts.get(part.key).byDay, date.getTime(), amount);
  });
  return { rowOf };
}

// Amounts by day added up as the days go: one point a day from first through until (signed, like the tracker's totals)
function addedUpLine(name, byDay, first, until) {
  let sum = 0;
  return { name, points: daysBetween(first, until).map(date => {
    sum += byDay.get(date.getTime()) || 0;
    return { date, value: cents(sum) };
  }) };
}

// A row's lines: its Total, then each part (an ordinary row's aliases in its order; the others' biggest first). A part
// called Total says it's one.
function trackerLines(index, first, until) {
  const row = trackerData[index];
  if (!row || isSeparatorRow(row)) return [];
  const daily = trackerDaily(first, until).rowOf(index);
  const lines = [...daily.parts.values()].map(part => addedUpLine(cleanString(part.name) === "total" ? `${part.name} (alias)` : part.name, part.byDay, first, until));
  if (TRACKER_AUTO_ROWS.includes(cleanString(row[0]))) lines.sort((a, b) => Math.abs(b.points[b.points.length - 1]?.value ?? 0) - Math.abs(a.points[a.points.length - 1]?.value ?? 0));
  return [addedUpLine("Total", daily.byDay, first, until), ...lines];
}

// A row's line graph (Total and each part, added up day by day), on the tracker's days to start
function trackerGraph(index, name) {
  const { from, to } = trackerDays();
  return LineGraph.create({
    label: `${name}, Added Up`,
    from: (until) => (from < until ? from : addMonths(until, -TRACKER_MONTHS)),
    until: to,
    max: addDays(today, PURPOSE_AHEAD_DAYS),
    series: (first, until) => trackerLines(index, first, until),
    emptyNote: "Nothing counted in these days."
  });
}

// What each row that fills in by itself does, and how to use it (a paragraph each, in its window and its "?")
const AUTO_ROW_HELP = {
  costs: [
    "Costs adds up every cost on your calendar and in History (✖️ Hidden ones too) between the tracker's From and To days. ⭕️ Transfers aren't counted, since moving money between your own accounts isn't spending.",
    "It fills in by itself, so it can't be changed or deleted. To see where the money goes, add rows for what you spend on, like Groceries, with an alias for each entry title that belongs there."
  ],
  gains: [
    "Gains adds up every gain on your calendar and in History (✖️ Hidden ones too) between the tracker's From and To days, like paychecks and refunds. ⭕️ Transfers aren't counted, since moving money between your own accounts isn't income.",
    "It fills in by itself, so it can't be changed or deleted. Next to Costs, it shows whether you're spending less than comes in."
  ],
  transfers: [
    "Transfers adds up every ⭕️ Transfer (money moving between your own accounts, like into Savings or onto a credit card) and lists their titles, so they never land in Undefined.",
    "Other rows leave transfers out, unless their \"Count ⭕️ Transfers in this row\" switch is on. It fills in by itself, so it can't be changed or deleted."
  ],
  interest: [
    "Interest adds up the interest your Equity accounts get, and lists the accounts it came from. Above $0 is interest earned, like a savings account's; below $0 is interest paid, like a credit card's or a loan's.",
    "Interest isn't an entry, so no other row counts it, and it's only counted through today. Each account counts from the day its interest last started counting (typing its balance, or changing its interest, starts it again). An account's interest is set on the Equity page. It fills in by itself, so it can't be changed or deleted."
  ],
  undefined: [
    "Undefined lists the entry titles no other row counts yet, and adds them up, so nothing slips through.",
    "To move a title out of it, add the title as an alias to a row (tap the row, then Change Row, or New Row for a new one). Still here after that? The alias counts only Costs or only Gains, so entries of the other kind still need one. It fills in by itself, so it can't be changed or deleted."
  ]
};

// The Aliases column in words: "rent (costs), paycheck (gains), atm". Transfers, Undefined, and Interest list what they found
// in the tracker's days (figure: the row's, from trackerTotals).
function trackerAliasText(row, figure = null) {
  const type = cleanString(row[0]);
  const found = figure ? [...figure.parts.values()].map(part => part.name).join(", ") : "";
  if (type === "costs") return "Every cost";
  if (type === "gains") return "Every gain";
  if (type === "transfers") return found ? `Every transfer: ${found}` : "Every transfer";
  if (type === "interest") return found ? `Equity accounts' interest: ${found}` : "Equity accounts' interest";
  if (type === "undefined") return found;
  return describeAliases(row[4]);
}

// A tracker row's cells: its title (with a "?" for one that fills in by itself), what it came to in the tracker's days, and its
// aliases in words, in a short box that scrolls (Budget Pages.js aliasBox)
function trackerCells(tr, row, figure) {
  const type = cleanString(row[0]);
  const isAuto = TRACKER_AUTO_ROWS.includes(type);
  tr.appendChild(isAuto ? autoTitleCell(row) : noTranslate(cell(row[0], "titleCell")));
  tr.appendChild(noTranslate(cell(formatMoney(figure ? figure.total : 0), "amountCell")));
  const aliases = cell("", "aliasCell");
  aliases.appendChild(aliasBox(trackerAliasText(row, figure)));
  // (Costs and Gains say what they count in the budget's own words, which translate; the rest are the person's)
  tr.appendChild(isAuto && (type === "costs" || type === "gains") ? aliases : noTranslate(aliases));
}

// A row that fills in by itself: its title, with a "?" after it that says what the row does (AUTO_ROW_HELP), over the window.
// A tap on the "?" never opens or checks the row.
function autoTitleCell(row) {
  const td = cell(row[0], "titleCell");
  const name = String(row[0]).trim();
  const button = BudgetUI.element("button", "fieldHelpButton autoRowHelp", "?");
  button.type = "button";
  button.title = `What ${name} is`;
  button.setAttribute("aria-label", `What ${name} is`);
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    openWindow({
      origin: button,
      size: "small",
      stacked: true,
      title: name,
      build(form, panel) {
        for (const text of AUTO_ROW_HELP[cleanString(row[0])] || []) form.append(BudgetUI.element("p", "panelText", text));
        form.append(BudgetUI.buttonRow([{ label: "Okay", kind: "primary", onClick: () => panel.close() }]));
      }
    });
  });
  td.append(button);
  return td;
}

// From and To for the tracker's days (each a date box with its calendar button). Picking a day draws the window and Data's
// Tracker row again.
function trackerDateBoxes() {
  const el = BudgetUI.element("div", "purposeDates");
  const boxes = {};
  for (const [key, label] of [["from", "From"], ["to", "To"]]) {
    const input = BudgetUI.element("input", "dateInput");
    input.type = "text";
    input.inputMode = "numeric";
    input.placeholder = datePattern();
    input.translate = false;
    input.value = showDate(trackerDays()[key]);
    input.setAttribute("aria-label", `Tracker ${label.toLowerCase()} date`);
    input.addEventListener("change", () => {
      const date = parseTypedDate(input.value);
      if (isNaN(date.getTime())) {
        BudgetUI.showToast(`That date isn't a real day. Use ${datePattern()}.`, true);
        input.value = showDate(trackerDays()[key]);
        return;
      }
      setTrackerRange({ ...trackerDays(), [key]: createSafeMidnight(date) });
    });
    const row = BudgetUI.element("div", "dateRow");
    row.append(input, BudgetUI.datePickerButton(input, label, { max: addDays(today, PURPOSE_AHEAD_DAYS) }));
    const part = BudgetUI.element("div", "purposeDate");
    part.append(BudgetUI.element("span", "fieldLabel", label), row);
    el.append(part);
    boxes[key] = input;
  }
  return {
    el,
    show() {
      for (const key of ["from", "to"]) if (document.activeElement !== boxes[key]) boxes[key].value = showDate(trackerDays()[key]);
    }
  };
}

// New days for the tracker (From after To swaps them, and To goes no further than Wavelength Planning looks ahead)
function setTrackerRange({ from, to }) {
  const limit = addDays(today, PURPOSE_AHEAD_DAYS);
  const [first, last] = from > to ? [to, from] : [from, to];
  trackerRange = { from: first > limit ? limit : first, to: last > limit ? limit : last };
  drawTrackerWindow();
  const card = pageCards.find(item => item.def.id === "data");
  if (card) {
    drawCard(card);
    renderHighlights();
  }
  document.dispatchEvent(new CustomEvent("tracker:range")); // (The Snapshot page's cards follow too)
}

// Data's Tracker window: From and To, New Row and Edit (Budget Pages.js renderToolbar, in the window), a search, and the rows,
// each with what it came to in those days (tap one for its own window). Edit drags, sections, and deletes rows, like
// Recurring's. It starts out of Edit.
function openTrackerWindow(origin) {
  editMode = false;
  selectedRows.clear();
  openWindow({
    origin,
    size: "large",
    title: "Tracker",
    build(form, panel) {
      form.addEventListener("submit", (event) => event.preventDefault()); // (Enter in a box: nothing to send)
      const boxes = trackerDateBoxes();
      const bar = BudgetUI.element("div", "tableToolbar trackerToolbar");
      bar.id = "pageToolbar"; // (Where renderToolbar draws New Row and Edit)
      const search = BudgetUI.element("input", "textInput trackerSearch");
      search.type = "text";
      search.placeholder = "Search rows, like food";
      search.autocomplete = "off";
      search.setAttribute("aria-label", "Search the tracker's rows and aliases");
      search.addEventListener("input", filterTrackerRows);
      const found = BudgetUI.element("p", "searchSummary trackerFound");
      found.setAttribute("aria-live", "polite");
      found.hidden = true;
      const view = BudgetUI.element("div", "trackerView");
      form.append(
        BudgetUI.element("p", "panelHint", `What each row came to from From through To (the last ${TRACKER_MONTHS} months to start; a day after today counts what's planned). Tap a row for what each of its aliases came to, and a line graph of them.`),
        boxes.el, bar, search, found, view,
        BudgetUI.element("p", "panelHint", "New Row adds one. Edit moves rows (hold a row's ≡ and drag it), adds sections (+ Section), and deletes the rows checked. Costs, Gains, Transfers, Interest, and Undefined fill in by themselves (🔒 in Edit). To see the entries behind a row, search for its title with the Tracker button in Home's Search."),
        BudgetUI.buttonRow([{ label: "Close", onClick: () => panel.close() }])
      );
      trackerWindow = { view, search, found, boxes };
    }
  });
  drawTrackerWindow();
}

// The Tracker window's rows, drawn again (with every change to the budget, and Edit and Done: Budget Pages.js renderCurrentPage)
function drawTrackerWindow() {
  if (!trackerWindow) return;
  if (!trackerWindow.view.isConnected) {
    trackerWindow = null;
    return;
  }
  const { view, search, boxes } = trackerWindow;
  const { from, to } = trackerDays();
  boxes.show();
  renderToolbar("tracker", (origin) => openTrackerPanel(origin, null), { newLabel: "New Row", inWindow: true });
  search.hidden = editMode;
  const totals = trackerTotals(from, to);
  const tableEl = buildRowTable({
    tableName: "tracker",
    columns: TRACKER_COLUMNS,
    rows: indexedRows(trackerData, 1),
    extraClass: "trackerTable",
    canSelect: (row) => !TRACKER_AUTO_ROWS.includes(cleanString(row[0])),
    lockedNote: (row) => `${String(row[0]).trim()} fills in by itself, so it can't be deleted.`,
    renderEntry: (tr, row, index) => trackerCells(tr, row, totals.get(index)),
    onEntryClick: (index, origin) => openTrackerRowWindow(origin, index)
  });
  view.replaceChildren(wrapScroll(tableEl));
  markClipped(tableEl);
  filterTrackerRows();
}

// The window's search: only the rows with every word typed in their title, total, or aliases (sections hide while it's in
// use; Edit shows every row)
function filterTrackerRows() {
  if (!trackerWindow) return;
  const { view, search, found } = trackerWindow;
  const words = editMode ? [] : search.value.normalize("NFKC").toLowerCase().split(/\s+/).filter(Boolean);
  let shown = 0;
  let total = 0;
  for (const tr of view.querySelectorAll("tbody tr[data-index]")) {
    if (tr.classList.contains("categoryRow")) {
      tr.hidden = words.length > 0;
      continue;
    }
    total++;
    const match = words.every(word => tr.textContent.normalize("NFKC").toLowerCase().includes(word));
    tr.hidden = !match;
    if (match) shown++;
  }
  found.hidden = words.length === 0;
  found.textContent = `${shown} of ${total} ${total === 1 ? "row" : "rows"} found`;
}

// A row's own window, over the Tracker window: what it came to in the tracker's days, what each of its parts came to (an
// ordinary row's aliases; Transfers', Undefined's, and Interest's titles and accounts), its line graph, and for an ordinary
// row, Change Row
function openTrackerRowWindow(origin, index) {
  const row = trackerData[index];
  if (!row || isSeparatorRow(row)) return;
  const type = cleanString(row[0]);
  const isAuto = TRACKER_AUTO_ROWS.includes(type);
  const { from, to } = trackerDays();
  const figure = trackerTotals(from, to).get(index) || { total: 0, parts: new Map() };
  const name = String(row[0]).trim();
  openWindow({
    origin,
    size: "large",
    stacked: true,
    title: name,
    build(form, panel) {
      form.addEventListener("submit", (event) => event.preventDefault()); // (Nothing to send)
      form.append(BudgetUI.noTranslate(BudgetUI.element("p", "panelText", `${formatMoney(figure.total)} from ${showDate(from)} through ${showDate(to)}.`)));
      for (const words of isAuto ? AUTO_ROW_HELP[type] || [] : []) form.append(BudgetUI.element("p", "panelHint", words));
      const parts = [...figure.parts.values()];
      if (parts.length > 0) form.append(tableBox([type === "interest" ? "Account" : isAuto ? "Title" : "Alias", "Total"], parts.map(part => [part.name, amountCell(part.total)])));
      else if (!isAuto) form.append(BudgetUI.element("p", "panelHint", "This row has no aliases yet: Change Row adds them."));
      form.append(trackerGraph(index, name).el);
      // (Change Row opens over the Tracker window, from the row as it's drawn now)
      const change = () => {
        panel.close();
        const rowNow = trackerWindow?.view.querySelector(`tr[data-index="${index}"]`);
        openTrackerPanel(rowNow || trackerWindow?.view || origin, index);
      };
      form.append(BudgetUI.buttonRow(isAuto
        ? [{ label: "Close", onClick: () => panel.close() }]
        : [{ label: "Change Row", kind: "primary", onClick: change }, { label: "Close", onClick: () => panel.close() }]));
    }
  });
}

// New tracker row (index null) or change an ordinary one: its title, its aliases (each with All / Costs / Gains), and whether
// it counts transfers. It opens over the Tracker window, which comes back when it closes.
function openTrackerPanel(origin, index) {
  const existing = index === null ? null : trackerData[index];
  openWindow({
    origin,
    size: "large",
    stacked: true,
    title: existing ? "Change Tracker Row" : "New Tracker Row",
    build(form, panel) {
      const existingTitle = existing ? String(existing[0]).replace("⭕️", "") : "";
      const title = BudgetUI.textField({ label: "Title", value: existingTitle, placeholder: "Groceries, car stuff...", maxLength: MAX_TITLE });
      const aliases = BudgetUI.aliasField({ aliases: existing ? aliasList(existing[4]) : [] });
      // Whether the row counts transfers too (its title then starts with ⭕️): an on/off switch
      const transferSwitch = BudgetUI.checkboxField({ label: "Count ⭕️ Transfers in this row", checked: existing ? String(existing[0]).startsWith("⭕️") : false });
      const transfers = BudgetUI.field("Transfers", transferSwitch.el, { hint: "Rows leave transfers out unless this is on (the Transfers row has every one either way)." });
      const buttons = existing
        ? [{ label: "Save", kind: "primary", type: "submit" }, { label: "Delete", kind: "danger", onClick: deleteRow }, { label: "Cancel", onClick: () => panel.close() }]
        : [{ label: "Add Row", kind: "primary", type: "submit" }, { label: "Cancel", onClick: () => panel.close() }];
      form.append(title.el, aliases.el, transfers, BudgetUI.buttonRow(buttons));

      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const changes = { title: title.value(), aliases: aliases.value(), tracksTransfers: transferSwitch.value() };
        if (!changes.title) return panel.setError("Give the tracker row a title.");
        BudgetUI.submit(panel, () => saveTrackerEntry(changes, index));
      });

      // (A dialog can't show the ⭕️ image, so a row that counts transfers says so in words)
      function deleteRow() {
        const counts = String(existing[0]).startsWith("⭕️") ? " (the one that counts transfers)" : "";
        if (!window.confirm(`Delete the ${existingTitle.trim()} row${counts}?`)) return;
        BudgetUI.submit(panel, () => deleteBudgetRows("tracker", [index]));
      }
    }
  });
}

//#endregion

// =====================================================================
// #region GRAPHS (at the bottom of Data's windows, see Line Graph.js)
// =====================================================================
// Each graph's lines for a stretch of days. Days up to today come from History and the calendar, and later ones from what the
// budget has planned (projectBudget), so a day picked after today shows what's expected.

const GRAPH_LOOK_BACK = 90; // How many days before today (or the day picked, when it's earlier) a graph starts

// A graph's first day, for the day it runs through
const graphStart = (until, days = GRAPH_LOOK_BACK) => addDays(until < today ? until : today, -days);

// Every day from first through until
function daysBetween(first, until) {
  const days = [];
  for (let day = first; day <= until; day = addDays(day, 1)) days.push(day);
  return days;
}

// In Bank on each past day the budget has, as a Map(day's time -> amount)
function knownInBank() {
  const known = new Map();
  for (let r = 1; r < historyData.length; r++) {
    for (let c = 0; c < 7; c++) {
      const cell = String(historyData[r][c] ?? "");
      const date = cell.trim() ? createSafeMidnight(cell.split("\n")[0].trim(), true) : null;
      const inBank = date && !isNaN(date.getTime()) ? readInBank(cell) : null;
      if (inBank !== null) known.set(date.getTime(), inBank);
    }
  }
  for (let r = 0; r < CALENDAR_ROWS; r++) {
    for (let c = 0; c < 7; c++) {
      const inBank = readInBank(calendarData[r][c]);
      if (inBank !== null) known.set(gridDates[r][c].getTime(), inBank);
    }
  }
  return known;
}

// Where everything stands on each day from first through until: { days, inBank(day), account(index, day), total(day), accounts:
// the Equity accounts [{ index, name }] }
function equityOverTime(first, until) {
  const summaries = accountSummaries();
  const projection = projectBudget(until > today ? until : today, summaries);
  const known = knownInBank();
  const inBank = (day) => (known.has(day.getTime()) ? known.get(day.getTime()) : day > today ? projection.inBankOn(day) : null);
  const account = (index, day) => projection.accountOn(index, day);
  const accounts = summaries.map(summary => ({ index: summary.index, name: summary.name }));
  const total = (day) => Math.round(((inBank(day) ?? 0) + accounts.reduce((sum, item) => sum + account(item.index, day), 0)) * 100) / 100;
  return { days: daysBetween(first, until), inBank, account, total, accounts };
}

// In Bank's line (days before the budget's first have nothing to draw)
function inBankLine(first, until) {
  const over = equityOverTime(first, until);
  return [{ name: "In Bank", points: over.days.map(date => ({ date, value: over.inBank(date) })).filter(point => point.value !== null) }];
}

// A window's In Bank graph
const inBankGraph = (label) => LineGraph.create({ label, from: (until) => graphStart(until), max: aheadLimit(), series: inBankLine });

// Equity's graph: In Bank, the Total, and each account with something in it
function equityGraph() {
  return LineGraph.create({
    label: "Equity Over Time",
    from: (until) => graphStart(until),
    max: aheadLimit(),
    series(first, until) {
      const over = equityOverTime(first, until);
      const line = (name, value) => ({ name, points: over.days.map(date => ({ date, value: value(date) })).filter(point => point.value !== null) });
      const accounts = over.accounts.map(item => line(item.name, (date) => over.account(item.index, date))).filter(item => item.points.some(point => point.value !== 0));
      return [line("In Bank", over.inBank), line("Total", over.total), ...accounts];
    }
  });
}

// Each goal's balance over time (a goal for nothing in particular has no balance to draw)
function goalsGraph(goals) {
  return LineGraph.create({
    label: "Goals Over Time",
    from: (until) => graphStart(until),
    max: aheadLimit(),
    series(first, until) {
      const over = equityOverTime(first, until);
      const valueOf = (goal, date) => {
        if (goal.kind === "inBank") return over.inBank(date);
        if (goal.kind === "total") return over.total(date);
        const account = over.accounts.find(item => cleanString(item.name) === cleanString(goal.account));
        return account ? over.account(account.index, date) : null;
      };
      return goals.filter(goal => goal.kind !== "none").map(goal => ({ name: goalName(goal), points: over.days.map(date => ({ date, value: valueOf(goal, date) })).filter(point => point.value !== null) }));
    }
  });
}

// Amounts added up as the days go: one point a day from first through until, from items [{ date, amount }] (signed, so what
// went out adds up below $0)
function runningLine(name, items, first, until) {
  const byDay = new Map();
  for (const item of items) byDay.set(item.date.getTime(), (byDay.get(item.date.getTime()) || 0) + item.amount);
  let sum = 0;
  return { name, points: daysBetween(first, until).map(date => {
    sum += byDay.get(date.getTime()) || 0;
    return { date, value: Math.round(sum * 100) / 100 };
  }) };
}

// A graph of amounts added up from its first day (days: how far before today, or the day picked, it starts)
const runningGraph = (label, name, days, itemsBetween, emptyNote) => LineGraph.create({
  label,
  from: (until) => graphStart(until, days),
  max: aheadLimit(),
  series(first, until) {
    const items = itemsBetween(first, until);
    return items.length > 0 ? [runningLine(name, items, first, until)] : [];
  },
  emptyNote
});

// Amounts added up a week at a time: one point at each week's end, from items [{ date, amount }] (signed, so what went out
// is below $0)
function weeklyPoints(items, first, until) {
  const weeks = new Map();
  for (const item of items) {
    const week = Math.floor(getDayDifference(item.date, first) / 7);
    weeks.set(week, (weeks.get(week) || 0) + item.amount);
  }
  const points = [];
  for (let week = 0; addDays(first, week * 7) <= until; week++) {
    const end = addDays(first, week * 7 + 6);
    points.push({ date: end < until ? end : until, value: Math.round((weeks.get(week) || 0) * 100) / 100 });
  }
  return points;
}

// What went out each week, besides recurring bills
const spentGraph = () => LineGraph.create({
  label: "Spent Each Week",
  from: (until) => graphStart(until),
  max: aheadLimit(),
  series: (first, until) => [{ name: "Spent", points: weeklyPoints(purchasesBetween(first, until), first, until) }],
  note: "Purchases added by hand or with Quick Budget: a day after today only counts what's already planned."
});

// What went out in the days after each payday, besides recurring bills
const paydaysGraph = (span) => LineGraph.create({
  label: "Spent After Each Payday",
  from: (until) => graphStart(until, 120),
  max: aheadLimit(),
  series(first, until) {
    const paydays = paydaysBetween(first, until);
    const purchases = purchasesBetween(first, addDays(until, span));
    return [{ name: "Spent", points: paydays.map(date => ({
      date,
      value: Math.round(purchases.reduce((sum, purchase) => (purchase.date >= date && purchase.date < addDays(date, span) ? sum - purchase.amount : sum), 0) * 100) / 100
    })) }];
  },
  emptyNote: "No paydays in these days.",
  note: "A day after today only counts what's already planned."
});

// What the recurring entries came to each month: the bills and the gains (transfers left out), one point at each month's start
const recurringGraph = () => LineGraph.create({
  label: "Recurring Entries Each Month",
  from(until) {
    const start = addMonths(until < today ? until : today, -6);
    return new Date(start.getFullYear(), start.getMonth(), 1);
  },
  max: addDays(today, PURPOSE_AHEAD_DAYS),
  series: (first, until) => recurringMonthLines(first, until)
});

// The recurring entries' bills and gains each month from first through until (transfers left out): [Bills, Gains], one point at
// each month's start
function recurringMonthLines(first, until) {
  const months = new Map();
  const start = new Date(first.getFullYear(), first.getMonth(), 1);
  for (let month = start; month <= until; month = new Date(month.getFullYear(), month.getMonth() + 1, 1)) months.set(month.getTime(), { date: month < first ? first : month, costs: 0, gains: 0 });
  // (Whole months: the last one counts what's planned for the rest of it)
  eachEntryBetween(first, new Date(until.getFullYear(), until.getMonth() + 1, 0), (date, text) => {
    const line = readLine(text);
    if (line.blank || line.system || entryMark(line.sprite) !== RECURRING_MARK || isTransferEntry(line.sprite)) return;
    const month = months.get(new Date(date.getFullYear(), date.getMonth(), 1).getTime());
    if (!month) return;
    if (line.amount < 0) month.costs += line.amount; // (Bills stay below $0)
    else month.gains += line.amount;
  });
  const list = [...months.values()];
  const line = (name, key) => ({ name, points: list.map(month => ({ date: month.date, value: Math.round(month[key] * 100) / 100 })) });
  return [line("Bills", "costs"), line("Gains", "gains")];
}

// What each wavelength cost each week
const wavelengthsGraph = () => LineGraph.create({
  label: "Each Wavelength, Week By Week",
  from: (until) => graphStart(until),
  max: addDays(today, PURPOSE_AHEAD_DAYS),
  series: (first, until) => wavelengthWeekLines(first, until)
});

// What each wavelength cost each week from first through until: a line for each wavelength, in their order ({ id, name, points })
function wavelengthWeekLines(first, until) {
  const weeks = []; // For each week: titleKey -> { total, purpose }
  eachEntryBetween(first, until, (date, text) => {
    const line = readLine(text);
    if (line.blank || line.system || !line.title || line.amount === 0) return;
    const key = titleKey(line.title);
    if (!key) return;
    const week = Math.floor(getDayDifference(date, first) / 7);
    weeks[week] = weeks[week] || new Map();
    const known = weeks[week].get(key) || { total: 0, purpose: purposeOf(line.title) };
    known.total += line.amount;
    weeks[week].set(key, known);
  });
  return wavelengthList().map(wave => ({
    id: wave.id,
    name: wave.name,
    points: weeklyPoints(weeks.flatMap((titles, week) => (titles ? [{ date: addDays(first, week * 7), amount: [...titles.values()].reduce((sum, item) => (item.purpose === wave.id && item.total < 0 ? sum + item.total : sum), 0) }] : [])), first, until)
  }));
}

//#endregion

// =====================================================================
// #region SPECTRUM GRAPH (the card over Data)
// =====================================================================
// One line graph that can compare anything Bob's page draws: In Bank, the Total, each Equity account, each tracker row (all of
// it, or one alias, added up from the first day drawn), each wavelength's week by week, and Bob's own figures. Its lines are
// kept with the budget (accountsData.bob.spectrum, see setSpectrumLines in Process Budget.js), so every device shows the same
// ones; it starts on In Bank. spectrumGraph() makes it, so it can go on another page too (the Snapshot page, still to come).
// A line is { kind, name, part }: kind "inBank", "total", "account" (name: the account's), "tracker" (name: the row's title as
// stored, part: an alias, as compared, or "" for all of it), "figure" (name: a SPECTRUM_FIGURES key), or "wavelength" (name:
// its id). One whose account, row, alias, or wavelength is gone draws nothing, and says so under the graph.

const SPECTRUM_START = [{ kind: "inBank", name: "", part: "" }]; // Its lines until any are picked
const SPECTRUM_FIGURES = {
  purchases: { name: "Purchases, added up", line: (first, until) => runningLine("Purchases, added up", purchasesBetween(first, until), first, until) },
  spent: { name: "Spent each week", line: (first, until) => ({ name: "Spent each week", points: weeklyPoints(purchasesBetween(first, until), first, until) }) },
  catchups: { name: "Catchup entries, added up", line: (first, until) => runningLine("Catchup entries, added up", catchupsBetween(first, until), first, until) },
  bills: { name: "Big bills, added up", line: (first, until) => runningLine("Big bills, added up", bigBills().filter(bill => bill.date >= first && bill.date <= until), first, until) },
  recurringBills: { name: "Recurring bills each month", line: (first, until) => ({ ...recurringMonthLines(first, until)[0], name: "Recurring bills each month" }) },
  recurringGains: { name: "Recurring gains each month", line: (first, until) => ({ ...recurringMonthLines(first, until)[1], name: "Recurring gains each month" }) }
};

// The card: the lists to add a line, the lines picked, and the graph (made the first time it's drawn)
function setupSpectrumCard(card) {
  card.spectrum = spectrumGraph();
  return card.spectrum.el;
}

// Drawn again with every change to the budget. Its highlight: each line's last value (the first three)
function renderSpectrumCard(card) {
  card.spectrum.draw();
  const lines = card.spectrum.lines();
  if (lines.length === 0) return { text: "No lines on it yet. Pick one in its lists and tap Add.", warn: false };
  const values = lines.slice(0, 3).map(line => `${line.name} ${formatMoney(line.points[line.points.length - 1].value)}`);
  const more = lines.length > 3 ? `, and ${lines.length - 3} more` : "";
  return { text: `Through ${showDate(card.spectrum.until())}: ${values.join(", ")}${more}.`, warn: false };
}

// The lines kept with the budget (In Bank until any are picked)
function spectrumPicks() {
  const kept = accountsData?.bob?.spectrum;
  return Array.isArray(kept) ? kept : SPECTRUM_START;
}

// What can be added, in groups: [{ label, items: [{ kind, name, label, parts (a tracker row's: [{ key, label }]) }] }]
function spectrumChoices() {
  const groups = [];
  groups.push({ label: "Equity", items: [
    { kind: "inBank", name: "", label: "In Bank" },
    { kind: "total", name: "", label: "Total (In Bank and every account)" },
    ...accountSummaries().map(summary => ({ kind: "account", name: summary.name, label: summary.name }))
  ] });
  const rows = [];
  for (let index = 1; index < trackerData.length; index++) {
    const row = trackerData[index];
    if (isSeparatorRow(row)) continue;
    const title = String(row[0]).trim();
    const parts = TRACKER_AUTO_ROWS.includes(cleanString(row[0])) ? [] : aliasList(row[4]).map(alias => ({ key: alias.clean, label: aliasPart(alias).name }));
    rows.push({ kind: "tracker", name: title, label: title, parts });
  }
  if (rows.length > 0) groups.push({ label: "Tracker", items: rows });
  groups.push({ label: "Bob's figures", items: Object.entries(SPECTRUM_FIGURES).map(([key, figure]) => ({ kind: "figure", name: key, label: figure.name })) });
  groups.push({ label: "Wavelengths", items: wavelengthList().map(wave => ({ kind: "wavelength", name: wave.id, label: `${wave.name}, each week` })) });
  return groups;
}

// A picked line's name, as the graph and its list say it
function spectrumLineName(pick) {
  if (pick.kind === "inBank") return "In Bank";
  if (pick.kind === "total") return "Total";
  if (pick.kind === "account") return pick.name;
  if (pick.kind === "figure") return SPECTRUM_FIGURES[pick.name]?.name || "A figure";
  if (pick.kind === "wavelength") return `${wavelengthList().find(wave => wave.id === pick.name)?.name || "A wavelength"}, each week`;
  if (!pick.part) return pick.name;
  const row = trackerData.find((item, index) => index > 0 && String(item[0]).trim() === pick.name);
  const alias = row ? aliasList(row[4]).find(item => item.clean === pick.part) : null;
  return `${pick.name}: ${alias ? aliasPart(alias).name : pick.part}`;
}

// The picked lines from first through until (worked out once each: the Equity accounts, and the tracker)
function spectrumLines(picks, first, until) {
  let over = null;
  const equity = () => over || (over = equityOverTime(first, until));
  let tracked = null;
  const tracker = () => tracked || (tracked = trackerDaily(first, until));
  let waves = null;
  const daysOf = (name, value) => ({ name, points: equity().days.map(date => ({ date, value: value(date) })).filter(point => point.value !== null && point.value !== undefined) });
  return picks.map(pick => {
    const name = spectrumLineName(pick);
    if (pick.kind === "inBank") return daysOf(name, equity().inBank);
    if (pick.kind === "total") return daysOf(name, equity().total);
    if (pick.kind === "account") {
      const account = equity().accounts.find(item => cleanString(item.name) === cleanString(pick.name));
      return account ? daysOf(name, (date) => equity().account(account.index, date)) : null;
    }
    if (pick.kind === "tracker") {
      const index = trackerData.findIndex((row, at) => at > 0 && !isSeparatorRow(row) && String(row[0]).trim() === pick.name);
      if (index === -1) return null;
      const daily = tracker().rowOf(index);
      const byDay = pick.part ? daily.parts.get(pick.part)?.byDay : daily.byDay;
      return byDay ? addedUpLine(name, byDay, first, until) : null;
    }
    if (pick.kind === "figure") return SPECTRUM_FIGURES[pick.name] ? { ...SPECTRUM_FIGURES[pick.name].line(first, until), name } : null;
    if (pick.kind === "wavelength") {
      waves = waves || wavelengthWeekLines(first, until);
      const wave = waves.find(item => item.id === pick.name);
      return wave ? { name, points: wave.points } : null;
    }
    return null;
  }).filter(Boolean);
}

// The Spectrum Graph: { el, draw(), lines(), until() }. draw() fills its lists, its picked lines, and its graph from the
// budget as it is now.
function spectrumGraph() {
  const el = BudgetUI.element("div", "spectrumGraph");
  const what = BudgetUI.element("select", "selectInput spectrumWhat");
  what.setAttribute("aria-label", "A line to add");
  const part = BudgetUI.element("select", "selectInput spectrumPart");
  part.setAttribute("aria-label", "All of the row, or one of its aliases");
  const add = BudgetUI.element("button", "budgetButton primary spectrumAdd", "Add");
  add.type = "button";
  const adder = BudgetUI.element("div", "spectrumAdder");
  adder.append(what, part, add);
  const picked = BudgetUI.element("ul", "spectrumPicks");
  picked.setAttribute("aria-label", "The graph's lines");
  const missing = BudgetUI.element("p", "panelHint spectrumMissing");
  missing.hidden = true;
  const slot = BudgetUI.element("div", "spectrumSlot");
  el.append(BudgetUI.field("Add a line", adder, { hint: "A tracker row can be all of it, or one of its aliases (the second list)." }), picked, missing, slot);
  let graph = null;
  let items = []; // The items in the first list, by their option's value
  let saving = false;

  // The first list, in groups, keeping what's picked in it
  function fillChoices() {
    const was = what.value;
    items = [];
    what.replaceChildren();
    for (const group of spectrumChoices()) {
      const optgroup = BudgetUI.element("optgroup");
      optgroup.label = group.label;
      for (const item of group.items) {
        const option = BudgetUI.element("option", "", item.label);
        option.value = String(items.length);
        items.push(item);
        optgroup.append(option);
      }
      what.append(optgroup);
    }
    BudgetUI.noTranslate(what);
    what.value = was !== "" && items[Number(was)] ? was : "0";
    fillParts();
  }

  // The second list: a tracker row's Total and each of its aliases (hidden for anything else)
  function fillParts() {
    const item = items[Number(what.value)];
    const was = part.value;
    part.replaceChildren();
    part.hidden = !item || item.kind !== "tracker" || item.parts.length === 0;
    if (part.hidden) return;
    part.append(new Option("All of it (Total)", ""), ...item.parts.map(alias => new Option(alias.label, alias.key)));
    BudgetUI.noTranslate(part);
    part.value = item.parts.some(alias => alias.key === was) ? was : "";
  }
  what.addEventListener("change", fillParts);

  // Saved with the budget, then drawn again with it (and the card's highlight)
  async function save(list, words) {
    if (saving) return;
    saving = true;
    add.disabled = true;
    const result = await setSpectrumLines(list, words);
    saving = false;
    add.disabled = false;
    if (!result.ok) BudgetUI.showToast(result.message || "That didn't work. Please try again.", true);
    else BudgetUI.warnIfUnsaved(result);
  }

  add.addEventListener("click", () => {
    const item = items[Number(what.value)];
    if (!item) return;
    const pick = { kind: item.kind, name: item.name, part: part.hidden ? "" : part.value };
    const list = spectrumPicks();
    if (list.some(line => line.kind === pick.kind && line.name === pick.name && line.part === pick.part)) return BudgetUI.showToast(`${spectrumLineName(pick)} is on the graph already.`);
    if (list.length >= MAX_SPECTRUM_LINES) return BudgetUI.showToast(`The graph holds up to ${MAX_SPECTRUM_LINES} lines. Take one off (its ×) to add another.`, true);
    save([...list, pick], `Added ${spectrumLineName(pick)}`);
  });

  // Each picked line, with a × that takes it off
  function drawPicks(lines) {
    const list = spectrumPicks();
    const drawnNames = new Set(lines.map(line => line.name));
    const gone = [];
    picked.replaceChildren(...list.map((pick, at) => {
      const name = spectrumLineName(pick);
      const item = BudgetUI.element("li", "spectrumPick");
      item.append(BudgetUI.noTranslate(BudgetUI.element("span", "", name)));
      if (!drawnNames.has(name)) gone.push(name);
      const remove = BudgetUI.element("button", "spectrumRemove", "×");
      remove.type = "button";
      remove.setAttribute("aria-label", `Take ${name} off the graph`);
      remove.title = remove.getAttribute("aria-label");
      remove.addEventListener("click", () => save(list.filter((_, other) => other !== at), `Took off ${name}`));
      item.append(remove);
      return item;
    }));
    picked.hidden = list.length === 0;
    missing.hidden = gone.length === 0;
    missing.textContent = gone.length ? `Nothing to draw for ${gone.join(", ")} in these days (or it's no longer in your budget).` : "";
  }

  function draw() {
    fillChoices();
    if (!graph) {
      graph = LineGraph.create({
        label: "Your Lines, Day By Day",
        from: (until) => graphStart(until),
        max: aheadLimit(),
        series: (first, until) => spectrumLines(spectrumPicks(), first, until),
        emptyNote: "Nothing to draw for these days. Pick a line above and tap Add, or pick other days."
      });
      slot.replaceChildren(graph.el);
    } else {
      graph.draw();
    }
    drawPicks(graph.lines());
  }

  return { el, draw, lines: () => (graph ? graph.lines() : []), until: () => (graph ? graph.until() : today) };
}

//#endregion

// The day Equity's window works the balances out to: the one this device picked (while it's still after today), or 6 months
// from today, like the Equity page's In 6 Months
function readAccountsDay() {
  let stored = null;
  try { stored = localStorage.getItem(ACCOUNTS_DAY_KEY); } catch (e) {}
  const day = stored ? createSafeMidnight(stored, true) : null;
  if (day && !isNaN(day.getTime()) && day > today && day <= aheadLimit()) return day;
  return addMonths(today, AHEAD_MONTHS);
}

// The furthest Equity and Goals look
function aheadLimit() {
  return addMonths(today, 12 * AHEAD_YEARS);
}

// The furthest day Equity and Goals need the budget worked out through: Equity's day, and each goal still to reach's
// day (or as far as they look, for one without a day)
function furthestDay() {
  let furthest = readAccountsDay();
  if (bobCardOn("goals")) {
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
// Each goal with how far along it is (tap one to change or delete it), and what Bob says reaching it takes: with a
// day, what to set aside from each payday until then beyond what the budget already gets there (a credit card's interest
// counted as it shrinks), and that it's in danger when doing so would take In Bank below $0, when it's more than usually
// goes out between paychecks, or when no paycheck lands before its day; without one, when the budget gets it there, or
// what a year would take.

function setupGoalsCard() {
  const box = BudgetUI.element("div", "panelButtons sectionButtons");
  const button = BudgetUI.element("button", "budgetButton primary", "New Goal");
  button.type = "button";
  button.addEventListener("click", () => openGoalPanel(button));
  const graph = BudgetUI.element("button", "budgetButton", "Goals Over Time ›");
  graph.type = "button";
  graph.addEventListener("click", () => openGoalsTableWindow(graph));
  box.append(button, graph);
  return box;
}

// Each goal with what Bob says about it, and the highlight: how many are reached, on track, short, or in danger
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
  if (parts.length === 0) return { text: "Tap each goal to pick what it's for, and Bob works out how to get there.", warn: false };
  const named = danger.length > 0 ? ` (${danger.map(goalName).join(", ")})` : "";
  return { text: `${goals.length} ${goals.length === 1 ? "goal" : "goals"}: ${parts.join(", ")}${named}.`, warn: danger.length > 0 };
}

// What Bob says about a goal: { tone: "reached" | "onTrack" | "short" | "danger" | "" , status (the word at its right),
// note, balance (what it's for holds now, or null) }
function goalPlan(goal, shared) {
  const balance = goal.kind === "none" ? null : goalBalance(goal);
  if (goal.kind === "none") return { tone: "", status: "", balance, note: "Tap it to pick what it's for, and Bob works out how to get there." };
  if (balance === null) return { tone: "", status: "", balance, note: `${goal.account} isn't one of your Equity accounts anymore. Tap it to pick another.` };
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
    const note = `As your budget stands, it's ${formatMoney(short)} short on ${showDate(date)}. ${setAsideWords(goal, per, paydays.length)} until then (about ${formatMoney(per * paydays.length / months)} a month). ${GOAL_RECURRING_TIP}${danger ? " " + danger : ""}`;
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
  return { tone: "short", status: "", balance, note: `${notThere} ${setAsideWords(goal, per, paydays.length)} would get it there in a year (by ${showDate(yearOut)}). ${GOAL_RECURRING_TIP}` };
}

// Said after what reaching a goal takes from each payday
const GOAL_RECURRING_TIP = "It's helpful to put these payments in as a recurring entry, so they are accounted for in your budget.";

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
// interest or escrow is worked out again with the extra in it (each month's interest follows the balance, so a credit
// card paid down faster pays less interest, and a mortgage's escrow comes out of what's put in); anything else is the
// shortfall split over the paydays.
function neededEachPayday(goal, short, paydays, until, projection) {
  const even = Math.ceil(short / paydays.length * 100) / 100;
  if (goal.kind !== "account") return even;
  const account = accountRows().find(known => known.clean === cleanString(goal.account));
  const parts = account ? projection.accountParts(account.index) : null;
  if (!parts || (!parts.interest && !parts.escrow)) return even;
  const balanceWith = (extra) => {
    const entries = [...parts.entries, ...paydays.map(date => ({ date, change: extra }))];
    const extras = accountExtras({ ...parts, entries }, until);
    return [...entries, ...extras.credits, ...extras.escrow].reduce((sum, item) => (item.date <= until ? sum + item.change : sum), parts.start);
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

// Why a goal is in danger, or "": setting aside for an Equity account would take In Bank below $0 (the money comes out of
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
// along it is (a bar), and what Bob says. Tapping it opens it to change or delete.
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
  const gemWords = plan.tone === "reached" ? "" : gemPlanWords(goal, plan);
  if (gemWords) button.append(BudgetUI.noTranslate(BudgetUI.element("span", "goalPlan goalGem", `💠 ${gemWords}`)));
  button.addEventListener("click", () => openGoalPanel(button, index));
  item.append(button);
  return item;
}

// What a goal's gem says (see Gems and goals in Process Budget.js): when the gem's payments (or deposits), with its extra,
// get the goal there, from what the goal is for holds now (a gem typed in by hand: from the gem's own balance), with that
// account's interest (or the gem's own), the first one a payment's time from today. "" for a goal without a gem (or one
// whose gem is gone).
function gemPlanWords(goal, plan) {
  // (Home works Bob's warnings out without drawing his page, and without Budget Pages.js, which this uses)
  if (!goal.gem || typeof describeDebt !== "function") return "";
  const gem = calculatorStore("gems").find(item => item.id === goal.gem);
  if (!gem) return "";
  const values = gem.values;
  const name = gem.name || describeDebt(values).slice(0, 2).join(", ") || "Its gem";
  const saves = gemSaves(values);
  const following = gemGoalFields(gem);
  let balance = plan.balance;
  let interest = null;
  if (following?.kind === "account") {
    const summary = accountSummaries().find(item => cleanString(item.name) === cleanString(following.account));
    if (summary?.interest) interest = { rate: summary.interest.rate, compound: summary.interest.compound, every: summary.interest.every, day: summary.interest.day, debt: summary.interest.debt };
  } else if (!following) {
    balance = saves ? (values.balance ?? 0) : -(values.owed ?? 0);
    if (typeof values.rate === "number" && values.rate > 0) interest = { rate: values.rate, compound: values.compound || "monthly", every: values.every || 1, day: values.day || today.getDate() };
  }
  if (balance === null || balance >= goal.amount) return "";
  const payment = Math.round(((values.payment || 0) + (values.extra || 0)) * 100) / 100;
  const frequency = values.frequency in PAYMENT_FREQUENCIES ? values.frequency : "monthly";
  if (payment <= 0 && !interest) return `${name} keeps no ${saves ? "deposit" : "payment"}, so it can't say when this gets there.`;
  const apart = PAYMENT_FREQUENCIES[frequency];
  const first = apart ? addDays(today, apart) : addMonths(today, 1);
  const each = `${formatMoney(payment)} ${PAYMENT_CHOICES.find(choice => choice.value === frequency).label.toLowerCase()}`;
  const result = growTo({ balance, interest, payment, frequency, first, from: today, target: goal.amount });
  return result.reached
    ? `With ${name}'s ${each}, it gets there on ${showDate(result.reached)} (in ${howLong(today, result.reached)}).`
    : `With ${name}'s ${each}, it doesn't get there within ${PAYOFF_YEARS} years.`;
}

// How far along a goal is, 0 to 100: from what it was for held when it was set (or $0, for one set before that was kept)
// to its amount, so a credit card climbing from -$2000.00 to $0.00 shows how much is paid off. null when it can't say.
function goalShare(goal, balance) {
  if (balance >= goal.amount) return 100;
  const from = Number.isFinite(goal.start) && goal.start < goal.amount ? goal.start : Math.min(0, balance);
  if (goal.amount <= from) return null;
  return Math.max(0, Math.min(99, Math.floor((balance - from) / (goal.amount - from) * 100)));
}

// New goal (index null) or change one: a title of its own if you like, the Accrual Calculator gem it follows if any (one
// with In Bank or an Equity account says what it's for and its amount, so those boxes hide), what it's for (In Bank, the
// Total, or an Equity account, each with what it holds under its name), its amount (or a % of what it's for today, which
// stays that amount), and a day to reach it by, if it has one. link: from Add To Goals, { gem (its id), date }.
function openGoalPanel(origin, index = null, link = {}) {
  const existing = index === null ? null : (accountsData?.goals || [])[index];
  openWindow({
    origin,
    size: "small",
    title: existing ? "Change Goal" : "New Goal",
    build(form, panel) {
      const intro = BudgetUI.element("p", "panelHint", "An amount for In Bank, the Total, or an Equity account to reach, like $2000.00 in Savings, or a credit card at $0.00 (a blank amount), or one following an Accrual Calculator gem. Bob works out what reaching it takes.");
      // The gem it follows (Accrual Calculator gems), and what following it means. (From Add To Goals, the title starts as the
      // gem's name.)
      const gems = calculatorStore("gems");
      const linkedName = link.gem ? gems.find(gem => gem.id === link.gem)?.name || "" : "";
      const title = BudgetUI.textField({ label: "Title", value: existing ? existing.title : linkedName, placeholder: "Vacation, emergency fund...", optional: true, maxLength: MAX_TITLE });
      const gemName = (gem) => gem.name || describeDebt(gem.values).join(", ") || "Gem";
      const pickedGem = existing?.gem || link.gem || "";
      const gemPick = gems.length === 0 ? null : BudgetUI.selectField({
        label: "Gem",
        options: [{ value: "", label: "None" }, ...gems.map(gem => ({ value: gem.id, label: gemName(gem) }))],
        value: gems.some(gem => gem.id === pickedGem) ? pickedGem : "",
        hint: "Optional: an Accrual Calculator gem for this goal to follow."
      });
      if (gemPick) BudgetUI.noTranslate(gemPick.input);
      const follows = BudgetUI.element("p", "panelHint goalFollows");
      follows.hidden = true;
      const amount = BudgetUI.amountField({ label: "Amount", amount: existing ? existing.amount : null, percent: existing ? existing.percent : null, signs: BudgetUI.BALANCE_SIGNS });
      const accounts = otherAccounts();
      const savings = accountRows().find(account => isDefaultAccount(account.row));
      const kept = existing && (existing.kind === "inBank" || existing.kind === "total" || (existing.kind === "account" && accounts.some(account => account.name === existing.account)));
      const picked = kept ? (existing.kind === "account" ? `account:${existing.account}` : existing.kind) : savings ? `account:${savings.name}` : "inBank";
      const todayIn = (kind) => formatMoney(goalBalance({ kind, account: "" }) ?? 0);
      const target = BudgetUI.choiceList([
        { key: "inBank", label: "In Bank", detail: todayIn("inBank") },
        { key: "total", label: "Total", detail: `${todayIn("total")}, In Bank and every Equity account` },
        ...accounts.map(account => BudgetUI.accountChoice(account, `account:${account.name}`))
      ], picked, null, "What it's for");
      target.el.classList.add("accountChoices");
      const targetField = BudgetUI.field("For", target.el, { hint: "A % goal is that percent of it today, and stays that amount." });
      amount.setPercentAllowed(true);
      const date = BudgetUI.dateField({ label: "By", date: existing && existing.date ? createSafeMidnight(existing.date, true) : link.date || null, optional: true, hint: "Leave it blank for no day: Bob says when your budget gets there." });

      // A gem with In Bank or an Equity account says what the goal is for (and its amount, for what's owed, or what's saved
      // with a Goal amount), so those boxes hide; one typed in by hand leaves them to the goal
      const showGem = () => {
        const gem = gems.find(item => item.id === gemPick?.input.value);
        const following = gem ? gemGoalFields(gem) : null;
        targetField.hidden = !!following;
        amount.el.hidden = !!following && following.amount !== null;
        follows.hidden = !gem;
        if (!gem) return;
        const each = gemSaves(gem.values) ? "deposits" : "payments";
        if (following) {
          const what = following.kind === "inBank" ? "In Bank" : following.account;
          const howMuch = following.amount === null ? "" : following.amount === 0 && !gemSaves(gem.values) ? ", at $0.00 (paid off)" : `, at ${formatMoney(following.amount)}`;
          follows.textContent = `It follows ${gemName(gem)}: it's for ${what}${howMuch}. When the gem changes, so does this goal, and Bob says when the gem's ${each} get it there.`;
        } else {
          follows.textContent = `${gemName(gem)} is typed in by hand, so pick what this goal is for and its amount below. Bob says when the gem's ${each} get it there.`;
        }
      };
      gemPick?.input.addEventListener("change", showGem);
      showGem();

      const buttons = existing
        ? [{ label: "Save", kind: "primary", type: "submit" }, { label: "Delete", kind: "danger", onClick: removeIt }, { label: "Cancel", onClick: () => panel.close() }]
        : [{ label: "Add Goal", kind: "primary", type: "submit" }, { label: "Cancel", onClick: () => panel.close() }];
      form.append(...(existing ? [] : [intro]), title.el, ...(gemPick ? [gemPick.el, follows] : []), targetField, amount.el, date.el, BudgetUI.buttonRow(buttons));

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
        const fields = { title: title.value(), kind, account: name.join(":"), amount: value, percent, date: by, gem: gemPick?.input.value || "" };
        // (From Add To Goals while the Goals card is off, the card comes on, so the new goal shows)
        BudgetUI.submit(panel, async () => {
          const result = await saveGoal(fields, index);
          if (result.ok && !bobCardOn("goals")) {
            const on = await turnBobCard("goals", true);
            if (!on.ok) return on;
          }
          return result;
        });
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
// #region WAVELENGTH PLANNING (see WAVELENGTH PLANNING in Process Budget.js)
// =====================================================================
// What each wavelength's titles cost between two days, drawn like light's spectrum: one bar with a wave running along
// it, long at the left and shorter and shorter toward the right, each wavelength's stretch as wide as its share and in
// its own color (the first red, through orange, yellow, green, and blue, to the last violet). A legend says each one's
// amount and share (tap one, or its stretch, for its titles), and what the costs on no wavelength yet come to (tap it
// to give titles one, right there). The days are the card's From and To, which its windows share; Wavelengths names
// them, orders them, and adds or takes them out.

let purposeRange = null; // { from, to }: the days the spectrum adds up
const purposeBoxes = new Set(); // Every From and To pair showing them (the card's, and an open window's)

// The card's From and To (on the last 30 days to start), and its Wavelengths button
function setupPurposesCard(card) {
  purposeRange = { from: addDays(today, -(PURPOSE_DAYS - 1)), to: today };
  card.purposes = purposeDateBoxes();
  const edit = BudgetUI.element("button", "budgetButton wavelengthsButton", "Add Or Change Wavelengths");
  edit.type = "button";
  edit.addEventListener("click", () => openWavelengthsWindow(edit));
  const weeks = BudgetUI.element("button", "budgetButton wavelengthsButton", "Week By Week ›");
  weeks.type = "button";
  weeks.addEventListener("click", () => openWavelengthsTableWindow(weeks));
  const controls = BudgetUI.element("div", "wavelengthControls");
  controls.append(card.purposes.el, edit, weeks, BudgetUI.element("p", "panelHint wavelengthsHint", `Needs, Wants, and Future are only a start. Add your own (up to ${MAX_WAVELENGTHS}), rename them, or take some out with the button above.`));
  return controls;
}

// The spectrum (or a note while nothing in these days is on a wavelength) and what isn't on one yet, and the highlight:
// each wavelength's share
function renderPurposesCard(card) {
  const totals = purposeTotals(purposeRange.from, purposeRange.to);
  const sum = totals.slices.reduce((all, slice) => all + slice.total, 0);
  const parts = [];
  if (sum > 0) parts.push(wavelengthSpectrum(totals, sum));
  else parts.push(BudgetUI.element("p", "panelHint", "Nothing on a wavelength in these days yet. Pick one at the bottom of an entry's form (tap an entry on a zoomed day, or add a new one), or give titles one below."));
  if (totals.none > 0) {
    const unsorted = BudgetUI.element("button", "budgetButton purposeUnsorted", `${formatMoney(totals.none)} isn't on a wavelength yet ›`);
    unsorted.type = "button";
    unsorted.addEventListener("click", () => openUnsortedWindow(unsorted));
    parts.push(unsorted);
  }
  card.results.replaceChildren(...parts);
  const days = `from ${showDate(purposeRange.from)} to ${showDate(purposeRange.to)}`;
  if (sum === 0) return { text: `Nothing on a wavelength ${days} yet.`, warn: false };
  const shares = totals.slices.filter(slice => slice.total > 0).map(slice => `${slice.name} ${sharePercent(slice.total, sum)}%`);
  return { text: `${shares.join(", ")} ${days}.`, warn: false };
}

// A part's share of the whole, as a whole number of percent
function sharePercent(part, whole) {
  return whole > 0 ? Math.round(part / whole * 100) : 0;
}

// What each wavelength's titles cost from `from` through `to`: { slices: [{ key (its id), name, color, total, titles:
// [{ title, total, count }] biggest first }] (in the wavelengths' order), none (what titles on no wavelength cost),
// unsorted: [{ title, total, count }] }. A title counts by what its entries come to together (a refund takes off what
// it cost), when that's a cost.
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
  const waves = wavelengthList();
  const slices = waves.map((wave, index) => ({ key: wave.id, name: wave.name, color: wavelengthColor(index, waves.length), total: 0, titles: [] }));
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
  const first = from > afterCalendarStart ? from : afterCalendarStart;
  if (last < first) return;
  percentBasesThrough(last);
  const recurringRows = getParsedRecurringRows();
  const futureByDate = groupFutureRowsByDate();
  const sheetDays = sheetEntriesByDay(first, last);
  for (let day = first; day <= last; day = addDays(day, 1)) {
    for (const text of dayAfterCalendar(day, recurringRows, futureByDate, sheetDays).split("\n").slice(1)) visit(day, text);
  }
}

const SVG_NS = "http://www.w3.org/2000/svg"; // The spectrum is SVG

// A wavelength's color: its place in the spectrum, from red (the first, the longest wavelength) to violet (the last)
function wavelengthColor(index, count) {
  const hue = count > 1 ? Math.round(index / (count - 1) * 270) : 0;
  return `hsl(${hue}, 95%, 64%)`;
}

// The spectrum and its legend. Each wavelength with something in it gets a stretch of the bar as wide as its share, in
// the wavelengths' order, with a small gap between stretches; the wave along the bar gets shorter all the way across.
// Pointing at a stretch (or tabbing to it) says its amount and share under the bar, and tapping it (or Enter) opens its
// titles. The legend says each one's name, amount, and share (so the colors never have to), and opens the same.
let spectrumCount = 0;
function wavelengthSpectrum(totals, sum) {
  const WIDTH = 1000;
  const HEIGHT = 120;
  const GAP = 6;
  const LONGEST = 240;  // The wave's length at the left, and at the right
  const SHORTEST = 22;
  const box = BudgetUI.element("div", "spectrumBox");
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${WIDTH} ${HEIGHT}`);
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("class", "spectrum");
  svg.setAttribute("role", "group");
  svg.setAttribute("aria-label", "Wavelength Planning, as a spectrum");
  const caption = BudgetUI.element("p", "spectrumCaption");
  const showCaption = (text) => { caption.textContent = text; };
  const resting = `${formatMoney(sum)} spent on a wavelength from ${showDate(purposeRange.from)} to ${showDate(purposeRange.to)}`;
  showCaption(resting);

  // The faint band behind the wave, every color of the wavelengths in order
  const id = `spectrumBand${++spectrumCount}`;
  const defs = document.createElementNS(SVG_NS, "defs");
  const gradient = document.createElementNS(SVG_NS, "linearGradient");
  gradient.setAttribute("id", id);
  totals.slices.forEach((slice, index) => {
    const stop = document.createElementNS(SVG_NS, "stop");
    stop.setAttribute("offset", totals.slices.length > 1 ? String(index / (totals.slices.length - 1)) : "0");
    stop.setAttribute("stop-color", slice.color);
    gradient.append(stop);
  });
  defs.append(gradient);
  const band = document.createElementNS(SVG_NS, "rect");
  band.setAttribute("class", "spectrumBand");
  band.setAttribute("x", "0");
  band.setAttribute("y", "0");
  band.setAttribute("width", String(WIDTH));
  band.setAttribute("height", String(HEIGHT));
  band.setAttribute("rx", "14");
  band.setAttribute("fill", `url(#${id})`);
  svg.append(defs, band);

  // The wave's height at x: its length shrinks evenly from LONGEST to SHORTEST across the bar
  const middle = HEIGHT / 2;
  const reach = HEIGHT * 0.34;
  const change = (SHORTEST - LONGEST) / WIDTH;
  const waveAt = (x) => middle - reach * Math.sin(2 * Math.PI * Math.log(1 + change * x / LONGEST) / change);
  const slices = totals.slices.filter(slice => slice.total > 0);
  let left = 0;
  for (const slice of slices) {
    const width = slice.total / sum * WIDTH;
    const from = left + (left > 0 ? GAP / 2 : 0);
    const to = left + width - (left + width < WIDTH - 0.5 ? GAP / 2 : 0);
    left += width;
    if (to <= from) continue;
    const share = `${sharePercent(slice.total, sum)}%`;
    const stretch = document.createElementNS(SVG_NS, "g");
    stretch.setAttribute("class", "spectrumStretch");
    stretch.setAttribute("tabindex", "0");
    stretch.setAttribute("role", "button");
    stretch.setAttribute("aria-label", `${slice.name}: ${formatMoney(slice.total)}, ${share}. Open its titles.`);
    const hit = document.createElementNS(SVG_NS, "rect");
    hit.setAttribute("class", "spectrumHit");
    hit.setAttribute("x", from.toFixed(2));
    hit.setAttribute("y", "0");
    hit.setAttribute("width", (to - from).toFixed(2));
    hit.setAttribute("height", String(HEIGHT));
    hit.setAttribute("fill", slice.color);
    const points = [];
    const steps = Math.max(8, Math.ceil((to - from) / 2));
    for (let i = 0; i <= steps; i++) {
      const x = from + (to - from) * i / steps;
      points.push(`${x.toFixed(2)},${waveAt(x).toFixed(2)}`);
    }
    const wave = document.createElementNS(SVG_NS, "polyline");
    wave.setAttribute("class", "spectrumWave");
    wave.setAttribute("points", points.join(" "));
    wave.setAttribute("stroke", slice.color);
    wave.setAttribute("color", slice.color); // (Its glow's color, budgetStyle.css .spectrumWave)
    wave.setAttribute("vector-effect", "non-scaling-stroke");
    stretch.append(hit, wave);
    const show = () => showCaption(`${slice.name}: ${formatMoney(slice.total)}, ${share}`);
    stretch.addEventListener("pointerenter", show);
    stretch.addEventListener("focus", show);
    stretch.addEventListener("pointerleave", () => showCaption(resting));
    stretch.addEventListener("blur", () => showCaption(resting));
    stretch.addEventListener("click", () => openPurposeWindow(stretch, slice.key));
    stretch.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openPurposeWindow(stretch, slice.key);
    });
    svg.append(stretch);
  }

  const legend = BudgetUI.element("ul", "purposeLegend");
  for (const slice of totals.slices) {
    const item = BudgetUI.element("li", "purposeLegendItem");
    const button = BudgetUI.element("button", "purposeLegendButton");
    button.type = "button";
    button.disabled = slice.total === 0;
    const swatch = BudgetUI.element("span", "purposeSwatch");
    swatch.style.background = slice.color;
    button.append(
      swatch,
      BudgetUI.noTranslate(BudgetUI.element("span", "purposeName", slice.name)),
      BudgetUI.noTranslate(BudgetUI.element("span", "purposeAmount", formatMoney(slice.total))),
      BudgetUI.element("span", "purposeShare", `${sharePercent(slice.total, sum)}%`)
    );
    button.addEventListener("click", () => openPurposeWindow(button, slice.key));
    item.append(button);
    legend.append(item);
  }
  box.append(svg, caption, legend);
  return box;
}

// From and To boxes for the days the spectrum adds up (each a date box with its calendar button). The card has a pair,
// and a wavelength's window has its own; picking a day in any of them changes them all, the card, and an open window.
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

// New days for the spectrum (From after To swaps them): every pair of boxes shows them, and the card and any open
// window add up the new days
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
  document.dispatchEvent(new CustomEvent("bob:purposes"));
}

// A wavelength's window: the days (From and To), what it came to and its share, and each title on it, biggest first,
// with what it cost, its share of the wavelength, and how many entries it has, in a box that scrolls
function openPurposeWindow(origin, key) {
  openWindow({
    origin,
    size: "large",
    title: wavelengthName(key),
    build(form, panel) {
      const dates = purposeDateBoxes();
      const summary = BudgetUI.element("p", "panelText");
      const list = BudgetUI.element("ul", "purposeTitles");
      const box = BudgetUI.element("div", "bobScroll purposeTitlesBox");
      box.append(list);
      // (Drawn again when the days or the budget change while it's open)
      const follow = () => {
        if (panel.panel.isConnected && !panel.panel.classList.contains("isClosing")) return draw();
        document.removeEventListener("bob:purposes", follow);
        document.removeEventListener("budget:updated", follow);
      };
      const draw = () => {
        const totals = purposeTotals(purposeRange.from, purposeRange.to);
        const slice = totals.slices.find(item => item.key === key);
        if (!slice) {
          summary.textContent = "That wavelength was taken out.";
          box.hidden = true;
          return;
        }
        const all = totals.slices.reduce((sum, item) => sum + item.total, 0);
        summary.textContent = slice.total > 0
          ? `${formatMoney(slice.total)} from ${showDate(purposeRange.from)} to ${showDate(purposeRange.to)}: ${sharePercent(slice.total, all)}% of everything on a wavelength. Each title's entries are added together.`
          : `Nothing on ${slice.name} from ${showDate(purposeRange.from)} to ${showDate(purposeRange.to)}.`;
        list.replaceChildren(...slice.titles.map(title => {
          const item = BudgetUI.element("li", "purposeTitle");
          const words = BudgetUI.element("span", "purposeTitleText");
          words.append(BudgetUI.noTranslate(BudgetUI.element("span", "purposeTitleName", title.title)), BudgetUI.element("span", "purposeTitleCount", `${title.count} ${title.count === 1 ? "entry" : "entries"}`));
          item.append(words, BudgetUI.noTranslate(BudgetUI.element("span", "purposeTitleAmount negative", formatMoney(-title.total))), BudgetUI.element("span", "purposeTitleShare", `${sharePercent(title.total, slice.total)}%`));
          return item;
        }));
        box.hidden = slice.titles.length === 0;
      };
      document.addEventListener("bob:purposes", follow);
      document.addEventListener("budget:updated", follow);
      form.addEventListener("submit", (event) => event.preventDefault()); // (Enter in a date box: nothing to send)
      form.append(dates.el, summary, box, BudgetUI.buttonRow([{ label: "Close", onClick: () => panel.close() }]));
      draw();
    }
  });
}

// Titles on no wavelength yet (what they cost in the spectrum's days, biggest first), each with a button for every
// wavelength that puts it on one right there (every entry with that title gets it)
function openUnsortedWindow(origin) {
  openWindow({
    origin,
    size: "large",
    title: "Not On A Wavelength Yet",
    build(form, panel) {
      const summary = BudgetUI.element("p", "panelText");
      const list = BudgetUI.element("ul", "purposeTitles");
      const box = BudgetUI.element("div", "bobScroll purposeTitlesBox");
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
          ? `What these titles cost from ${showDate(purposeRange.from)} to ${showDate(purposeRange.to)}. Tap a wavelength under a title to put it on that one (every entry with that title gets it), then go on to the next.`
          : "Every title in these days is on a wavelength.";
        list.replaceChildren(...totals.unsorted.map(title => {
          const item = BudgetUI.element("li", "purposeTitle hasChoices");
          const words = BudgetUI.element("span", "purposeTitleText");
          words.append(BudgetUI.noTranslate(BudgetUI.element("span", "purposeTitleName", title.title)), BudgetUI.noTranslate(BudgetUI.element("span", "purposeTitleCount", `${formatMoney(-title.total)}, ${title.count} ${title.count === 1 ? "entry" : "entries"}`)));
          const choices = BudgetUI.noTranslate(BudgetUI.element("span", "purposeTitleChoices"));
          for (const wave of wavelengthList()) {
            const button = BudgetUI.element("button", "budgetButton", wave.name);
            button.type = "button";
            button.disabled = busy;
            button.addEventListener("click", async () => {
              if (busy) return;
              busy = true;
              list.querySelectorAll("button").forEach(other => { other.disabled = true; });
              const result = await saveEntryPurpose(title.title, wave.id);
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

// Wavelengths: each one's name, in order from the longest wavelength (red) to the shortest (violet), each moved up or
// down, or taken out, and new ones added (1 to MAX_WAVELENGTHS). Saved together (saveWavelengths in Process Budget.js);
// taking out one that titles are on asks first, since they won't have one after.
function openWavelengthsWindow(origin) {
  openWindow({
    origin,
    size: "large",
    title: "Wavelengths",
    build(form, panel) {
      const rows = wavelengthList().map(wave => ({ id: wave.id, name: wave.name }));
      const onIt = (id) => Object.values(accountsData?.bob?.purposes || {}).filter(purpose => purpose === id).length;
      const list = BudgetUI.element("ol", "wavelengthEditor");
      const add = BudgetUI.element("button", "budgetButton primary wavelengthAdd", "Add A Wavelength");
      add.type = "button";
      const draw = (focusAt = -1) => {
        list.replaceChildren(...rows.map((row, at) => {
          const item = BudgetUI.element("li", "wavelengthRow");
          const swatch = BudgetUI.element("span", "purposeSwatch");
          swatch.style.background = wavelengthColor(at, rows.length);
          const input = BudgetUI.element("input", "textInput wavelengthName");
          input.type = "text";
          input.value = row.name;
          input.maxLength = MAX_WAVELENGTH_NAME;
          input.placeholder = "Like Bills, Fun, or Saving";
          input.setAttribute("aria-label", `Wavelength ${at + 1}'s name`);
          input.addEventListener("input", () => { row.name = input.value; });
          const move = (by, text, label) => {
            const button = BudgetUI.element("button", "budgetButton wavelengthMove", text);
            button.type = "button";
            button.setAttribute("aria-label", label);
            button.disabled = at + by < 0 || at + by >= rows.length;
            button.addEventListener("click", () => {
              [rows[at], rows[at + by]] = [rows[at + by], rows[at]];
              draw(at + by);
            });
            return button;
          };
          const remove = BudgetUI.element("button", "panelClose wavelengthRemove", "×");
          remove.type = "button";
          remove.setAttribute("aria-label", `Take out ${row.name || "this wavelength"}`);
          remove.disabled = rows.length === 1;
          remove.addEventListener("click", () => {
            const titles = row.id ? onIt(row.id) : 0;
            if (titles > 0 && !window.confirm(`${titles} ${titles === 1 ? "title is" : "titles are"} on ${row.name}. Take it out? ${titles === 1 ? "It" : "They"} won't be on a wavelength after.`)) return;
            rows.splice(at, 1);
            draw();
          });
          item.append(swatch, BudgetUI.noTranslate(input), move(-1, "↑", "Move up"), move(1, "↓", "Move down"), remove);
          return item;
        }));
        add.disabled = rows.length >= MAX_WAVELENGTHS;
        if (focusAt >= 0) list.querySelectorAll("input")[focusAt]?.focus();
      };
      add.addEventListener("click", () => {
        rows.push({ id: null, name: "" });
        draw(rows.length - 1);
      });
      form.append(
        BudgetUI.element("p", "panelText", `These are yours to change. Tap Add A Wavelength to make your own, type over a name to rename it, use the arrows to put them in order (the first is the longest wavelength, red, and the last the shortest, violet), or × to take one out. You can have from 1 to ${MAX_WAVELENGTHS}, and every entry form's buttons follow them.`),
        add,
        list,
        BudgetUI.buttonRow([
          { label: "Save", kind: "primary", type: "submit" },
          { label: "Cancel", onClick: () => panel.close() }
        ])
      );
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        BudgetUI.submit(panel, () => saveWavelengths(rows.map(row => ({ id: row.id, name: row.name }))));
      });
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
  const parts = [BudgetUI.element("p", "bobTip", text)];
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
    text = `Bob needs ${HISTORY_MONTHS} months of History for this. ${historyStartNote()}`;
  } else if (payday.isPayday && Math.round(payday.average) > 0) {
    text = `Hey, you just got paid! Keep in mind, besides your recurring bills, you tend to spend about ${formatMoney(Math.round(payday.average))} in the next ${payday.span} days, so be careful what you spend it on!`;
    warn = true;
  } else if (payday.next) {
    text = `Your next payday is ${showDay(payday.next)}. From one payday to the next (${payday.span} days), you tend to spend about ${formatMoney(Math.round(payday.average))} besides your recurring bills.`;
  } else {
    text = `No paycheck lands in the next ${PAYDAY_LOOK} days. Bob counts a Regular gain from a recurring entry or a connected spreadsheet as a paycheck.`;
  }
  showTip(card, text, { label: "See paydays", open: (origin) => openPaydaysWindow(origin, shared.spending(), payday) });
  return { text, warn };
}

// Spending Pace: the last 7 days next to a usual week, with a heads-up when they're well over it
function renderPaceCard(card, shared) {
  const pace = paceFigures(shared.spending());
  let text;
  if (!pace) {
    text = `Bob needs ${HISTORY_MONTHS} months of History for this. ${historyStartNote()}`;
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
    ? `Your Catchup entries add up to ${formatMoney(Math.round(catchup.total))} in the last ${CATCHUP_DAYS} days, so some purchases are slipping by. Try adding each one as it happens (the Quick Budget icon on your phone's home screen makes it quick), so your In Bank stays right without guessing.`
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
  const parts = [BudgetUI.element("p", "bobTip", text)];
  if (listed.length > 0) {
    const list = BudgetUI.element("ul", "bobList");
    for (const purchase of listed) list.append(BudgetUI.noTranslate(BudgetUI.element("li", "", describe(purchase))));
    parts.push(list);
  }
  card.results.replaceChildren(...parts);
  return { text: highlight, warn: true };
}

//#endregion
