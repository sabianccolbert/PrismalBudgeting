// Process Budget: the budget itself, for every page that shows one. Loading it from the API and saving what
// changed, the daily update that brings it up to today, every change (calendar entries, recurring entries, the
// tracker, Other Accounts, connected spreadsheets, Quick Entry), the budget math, Dave, Search, Undo and Redo, and
// the helpers the pages share (dates, amounts, titles). Pages draw from it and redraw on its "budget:updated" event.

// =====================================================================
// GLOBAL VARIABLES
// =====================================================================

// Data Variables
let calendarData = null;
let recurringData = null;
let trackerData = null;
let futureData = null;
let historyData = null;
let searchData = null;
let calculatorData = null;
let accountsData = null; // Other Accounts: { version, list: [[...]], equity: {...} } (see normalizeApiAccounts)
let logsData = null;     // Change Logs (the spreadsheet's "Form Entries" tab), newest first
let sheetsData = null;   // Connected spreadsheets: { version, list: [connection] } (see CONNECTED SPREADSHEETS)

// Data Sizes
// The calendar is always exactly 4x7. Every other table keeps all of its stored rows
// (never truncated), padded to at least these columns and header rows.
let calendarRows = 4;
let calendarCols = 7;
const TABLE_SHAPES = {
  recurring:  { cols: 6, minRows: 2 },  // [0] summary row, [1] column titles
  tracker:    { cols: 5, minRows: 1 },  // [0] column titles
  future:     { cols: 4, minRows: 1 },  // [0] column titles
  history:    { cols: 7, minRows: 1 },  // [0] column titles, then one row per week (newest first)
  search:     { cols: 4, minRows: 3 },  // [0]-[2] search summary
  calculator: { cols: 2, minRows: 21 }, // [r][1] values read by the paycheck calculator
  accounts:   { cols: 6, minRows: 1 },  // Other Accounts: [0] column titles, then [name, balance, "default" | "", starting amount, interest rate, interest since]
  account:    { cols: 3, minRows: 3 },  // Each LLC equity table: 3 header rows, then [date, amount, title]
  logs:       { cols: 8, minRows: 1 }   // [0] column titles, then [time, duration, action, 4 details, status]
};

// Limits on what's typed in. Amounts go up to a billion dollars (the API's Quick Entry has the same limit):
// bigger numbers can't be kept to the cent, and past 1e21 JavaScript writes them as "1e+21". Titles go up to 100
// characters, like Quick Entry's and connected spreadsheets'.
const MAX_AMOUNT = 1000000000;
const AMOUNT_TOO_BIG = "Amounts can be up to $1,000,000,000.";
const MAX_TITLE = 100;

// An entry for an Other Account keeps its own title, with the account after an arrow: "Payday Transfer → Savings"
// (see splitAccount). One with no title of its own is just the account's name, like "Savings".
const ACCOUNT_ARROW = "→";
const MAX_ENTRY_TITLE = 170; // A title (100), the arrow, and an account's name (60)

// Load/Save Safety
let workspaceLoaded = false;      // saveChanges refuses to run until real data has loaded
let unsavableTables = new Set();  // Tables whose stored content failed to parse (never overwritten)

// Edit Trackers
let calendarEdited = false;
let recurringEdited = false;
let trackerEdited = false;
let futureEdited = false;
let historyEdited = false;
let searchEdited = false;
let calculatorEdited = false;
let accountsEdited = false;
let logsEdited = false;
let sheetsEdited = false;

// Dates Data
// Days are calendar days in the device's time zone (stored as MM/DD/YYYY text, never as a moment in time),
// so moving to another time zone never moves an entry to another day. pageDay is this device's date when
// the page loaded; today is the budget's day, which is the same, except it never goes back before the last
// day the budget was brought up to date (see setBudgetDay in loadWorkspace).
const pageDay = createSafeMidnight(new Date());
let today, yesterday, gridDates, gridStartDate, gridEndDate, nextFourStart;
setBudgetDay(pageDay);

// The budget's day, and the four-week calendar (Sunday through Saturday) that starts with its week.
// Days are counted on the calendar (addDays), never in 24-hour steps, so daylight saving time can't skip one.
function setBudgetDay(day) {
  today = createSafeMidnight(day);
  yesterday = addDays(today, -1);
  gridDates = getGridDates();
  gridStartDate = gridDates[0][0];
  gridEndDate = gridDates[3][6];
  nextFourStart = addDays(gridEndDate, 1);
}

// DAVE
let visibleUncommons = 0;
let visibleNegatives = 0;
let nextFourNegative = false;
const greetingPresets = ["Hey there ", "Hi ", "What's up ", "How's it going ", "Hello ", "Howdy "];
const nicknamePresets = ["friend! ", "buddy! ", "pal! ", "dude! ", "man! "];
const allClearPresets = ["Everything here looks great. ", "I don't see any issues right now. ", "Seems everything is in order. "];
const farewellPresets = ["Here's an affirmation: ", "Have some motivation: ", "Here's today's affirmation: ", "Enjoy this motivation: ", "Have an affirmation: ", "Enjoy this affirmation: ", "Here's some motivation: "];
const affirmationPresets = ["I am capable of quiet focus.", "My mind is filled with peaceful thoughts.", "Today I step into greatness.", "I am deserving of clear focus.", "My potential expands every day.", "I release doubt and welcome faith.", "Today I choose hope and love.", "My courage is greater than my fears.", "I am worthy of respect and kindness.", "Today I step into new joy.", "I am a vessel of boundless creativity.", "My heart is peaceful and steady.", "Today I radiate kindness to all.", "I handle challenges with quiet grace.", "My focus is sharp and clear.", "I am a beacon of light and hope.", "Today I welcome joy into my heart.", "I am worthy of deep connections.", "My daily habits build a foundation of joy.", "My inner strength is unwavering.", "Today I choose inner contentment.", "My presence brings comfort and joy.", "I choose self-compassion over criticism.", "Today I step into my true power.", "My strength grows deeper every day.", "I am open to the wisdom of the universe.", "Today is full of bright possibilities.", "I am resilient and strong.", "Today I share my authentic self.", "My heart radiates warmth and kindness.", "I attract positive energy into my space.", "Today I celebrate my small wins.", "My efforts today plant seeds for tomorrow.", "My potential is completely unlimited.", "Today I choose peace over perfection.", "I am deserving of infinite happiness.", "Today I embrace new beginnings.", "My voice matters and deserves to be heard.", "Today I focus on what matters.", "I embrace the quiet spaces between my thoughts.", "I am capable of magnificent success.", "Today I trust my inner voice.", "My light shines brightly for all.", "Today I cultivate gratitude.", "I release all unnecessary fear.", "Today I move forward with grace.", "I am deserving of a beautifully calm life.", "My hard work yields great success.", "Today I choose peace over pressure.", "I am committed to continuous growth and learning.", "Today I share my light freely.", "Kindness is my natural response.", "Today I embrace my power.", "My journey unfolds perfectly in its own time.", "I am secure in who I am.", "Today I choose self-love.", "My future is bright and full of promise.", "Today I welcome joy and laughter.", "I welcome joyful surprises today.", "Today I trust my capabilities.", "I trust the gentle rhythm of my breathing.", "I am whole just as I am.", "Today I choose joy and gratitude.", "I nourish my body with good energy.", "Today I embrace infinite possibilities.", "I am aligned with my true purpose.", "Today I let go of stress.", "Today I allow myself to simply be.", "I choose to be happy now.", "Today I celebrate my life.", "My intuition guides me correctly.", "Today I choose positive actions.", "I am worthy of great things.", "Peace begins within my own heart.", "My heart sings a song of deep gratitude.", "Today I shine a bright light.", "I am patient with my personal growth.", "Today I welcome a clear vision.", "I attract supportive and loving friends.", "Today I walk with purpose.", "I am a powerful creator of joy.", "I am completely equipped to handle today.", "Today I manifest my best.", "I deserve rest and relaxation.", "Today I spread warmth to all.", "My mind is clear and focused.", "Today I release past burdens.", "I am surrounded by endless beauty.", "My thoughts shape a vibrant and healthy reality.", "Today I choose calm thoughts.", "I celebrate my progress, big or small.", "Today I nourish my soul.", "My heart is full of gratitude.", "Today I honor my feelings.", "I accept myself without any judgment.", "I am deeply connected to the present moment.", "Today I create positive moments.", "I am worthy of living well.", "Today I embrace my potential.", "My actions create positive change.", "Today I attract good energy.", "I choose to see the good today.", "Every breath I take fills me with peace.", "Today I act with kindness.", "I am confident in my abilities.", "Today I stand tall and proud.", "My creative energy flows freely.", "Today I trust the universe.", "I am deserving of success and joy.", "I choose to focus on the good around me.", "Today I express genuine gratitude.", "I let go of what I cannot change.", "Today I choose hope over fear.", "I am resilient in the face of obstacles.", "I trust my journey completely.", "Today I welcome inner quiet.", "My spirit dances with the flow of life.", "I am worthy of my dreams.", "Today I honor my journey.", "I am making a positive impact.", "Today I choose self-acceptance.", "My soul is calm and at peace.", "I embrace change with an open heart.", "I am an architect of my own happiness.", "Today I spread light and love.", "I am strong, grounded, and safe.", "My energy is focused on the good.", "Today I act with conviction.", "I am capable of overcoming hard times.", "I deserve love, joy, and prosperity.", "Today I release all expectations and just live.", "Today I cultivate deep peace.", "My life is filled with purpose.", "Today I embrace new wisdom.", "I trust myself to make good decisions.", "Today I breathe in calm energy.", "I am worthy of all my achievements.", "My inner calm is untouched by outside storms.", "Today I welcome positive change.", "My thoughts are positive and uplifting.", "Today I choose inner strength.", "I am safe in the present moment.", "I choose to forgive and release.", "Today I nurture my dreams.", "I am worthy of taking up space and being heard.", "My dreams are valuable and real.", "Today I walk with assurance.", "Today brings fresh starting points.", "Today I choose peace of mind.", "My passion drives me forward daily.", "Today I honor my worth.", "I celebrate the unique magic within my soul.", "I am surrounded by unconditional love.", "Today I release all self-doubt.", "I choose to treat myself gently.", "My inner wisdom leads the way.", "Today I cultivate positive thoughts.", "I am abundant in every way.", "My kindness ripples out and changes the world.", "Today I choose hope and strength.", "I release the need to be perfect.", "Today I spread genuine kindness.", "My life is a gift I cherish.", "Today I honor my unique gift.", "I am focused on my personal vision.", "I am stepping into a beautiful new chapter.", "Today I welcome calm moments.", "I am proud of who I am becoming.", "Today I trust my path completely.", "I am open to receiving love daily.", "Today I celebrate my true self.", "My boundaries protect my quiet energy.", "Today I forgive myself for past mistakes.", "Today I step forward with hope.", "Today is a gift to enjoy.", "Today I radiate joy and light.", "My body is healthy and strong.", "Today I choose love over fear.", "I am worthy of peace of mind.", "My existence is a miracle I deeply appreciate.", "Today I embrace all possibilities.", "Today I welcome new opportunities.", "Today I welcome every blessing.", "My choices align with my values.", "Today I trust my inner strength.", "I am grateful for my journey.", "I am surrounded by an invisible shield of love.", "Today I live with purpose and peace.", "My spirit is bright and resilient.", "I am capable of achieving my goals.", "I deserve to feel fulfilled.", "I choose peace over conflict today.", "I am grounded in this moment.", "Every challenge I face is a stepping stone.", "My heart is open to love.", "I am worthy of abundance now.", "Peace guides my words and actions.", "My mind is open to possibilities.", "I trust the timing of my life.", "I am powerful beyond measure.", "I am fiercely loyal to my own well-being.", "My heart is open to healing.", "I am strong, wise, and capable.", "I am capable of remarkable growth.", "My pathway is clear and bright.", "I welcome happiness into my home.", "I am deserving of rich experiences.", "My soul flourishes when I practice self-care.", "Today I act with bold confidence.", "My breath restores my quiet mind.", "I am balanced, focused, and clear.", "Today I honor my true needs.", "My courage shines in tough moments.", "I am grateful for my strong body.", "I am confidently navigating my own unique path.", "Today I cultivate joy within.", "My path is unique and beautiful.", "I am worthy of living fully.", "My heart is an anchor for peace.", "I am open to transformation.", "Today I radiate positivity everywhere.", "Today I write a joyful story for myself.", "My life is brimming with hope.", "I am comfortable in my skin.", "Today I nurture my inner light.", "My voice carries wisdom and truth.", "I am a magnet for goodness.", "My actions inspire those around me.", "I am worthy of sincere friendship.", "My life is filled with balance.", "I am strong enough to succeed.", "Today I choose kindness toward myself.", "My confidence stems from within.", "I am valuable just by existing.", "I am deserving of true peace.", "Today I welcome creative solutions.", "My energy is vibrant and light.", "I am guided by love always.", "Today I release all negativity.", "My goals are within my reach.", "I am worthy of big dreams.", "My path is filled with light.", "I am capable of amazing strength.", "My life is an exciting adventure.", "I am deserving of honest love.", "My spirit is steady and strong.", "I am open to life's blessings.", "My mind is a source of clarity.", "I am worthy of great happiness.", "My strength is renewed each morning.", "I am aligned with goodness.", "My thoughts build a peaceful mind.", "I am deserving of safe spaces.", "My growth is steady and real.", "I am capable of deep focus.", "My heart is open to abundance.", "I am worthy of rest today.", "I am resilient through every season.", "My mind is calm and peaceful.", "I am deserving of life's riches.", "My courage empowers those around me.", "I am worthy of true respect.", "My spirit radiates a warm, positive light.", "I am grounded in truth.", "My heart is a home for peace.", "I am capable of achieving my dreams.", "My inner peace is solid.", "I am worthy of great care.", "My life is rich with meaning.", "I am aligned with my truth.", "My strength grows with each test.", "I am deserving of good health.", "My future holds endless good.", "I am capable of deep love.", "My path is lined with grace.", "I am worthy of true joy.", "I am resilient in every way.", "My mind generates positive ideas.", "I am deserving of kind words.", "My energy is restored and whole.", "I am open to good fortune.", "My life is guided by hope.", "I am worthy of endless love.", "My inner power is growing daily.", "I am capable of wise choices.", "My life is full of light.", "I am resilient, strong, and safe.", "My voice is confident and strong.", "I am worthy of bright days.", "My mind is clear and capable.", "I am guided by inner peace.", "My path leads to happiness.", "I am deserving of calm moments.", "My heart is full of hope.", "I am worthy of deep joy.", "My growth is continuous and clear.", "I am capable of creating goodness.", "My life is balanced and peaceful.", "I am worthy of sweet rest.", "My power is rooted in truth.", "I am deserving of brilliant success.", "My mind is a sanctuary of calm.", "I am open to life's gifts.", "My strength inspires others daily.", "I am worthy of genuine love.", "My life moves forward in grace.", "I am capable of bold action.", "My heart radiates a steady peace.", "I am deserving of happy thoughts.", "My energy is positive and focused.", "I am grounded, present, and strong.", "My future is rich with hope.", "I am worthy of high respect.", "My spirit is resilient and bright.", "My body is a vessel of health.", "I am deserving of peace now.", "My thoughts bring me joy.", "I am worthy of all success.", "My mind is filled with light.", "My path is safe and sound.", "I am deserving of true contentment.", "My heart is full of strength.", "I am worthy of beautiful moments.", "I am strong, focused, and resilient.", "My voice carries a clear truth.", "I am deserving of kindness always.", "My mind is steady and calm.", "I am capable of bold choices.", "My heart is light and joyful.", "I am worthy of warm love.", "My life is grounded in peace.", "I am resilient in every moment.", "My energy attracts good things.", "I am deserving of complete joy.", "My spirit is bright and clear.", "I am capable of achieving greatness.", "My path is filled with joy.", "I am worthy of sweet success.", "My heart is peaceful and open.", "I am deserving of strong support.", "My mind is a source of strength.", "I am capable of infinite growth.", "My life is full of grace.", "I am worthy of clear thinking.", "My spirit is grounded in love.", "I am deserving of endless abundance.", "I am capable of magnificent achievements.", "My mind is calm and confident.", "I am worthy of rich love.", "My future is safe and bright.", "I am deserving of daily happiness.", "My energy is vibrant and fresh.", "I am capable of great resilience.", "My heart is open and ready.", "I am worthy of peaceful living.", "My mind is clear and sharp.", "My life is guided by wisdom.", "I am strong, capable, and whole.", "I am worthy of bold dreams.", "My spirit is light and free.", "I am deserving of a wonderful life.", "My power comes from within.", "My mind is peaceful and strong.", "I am worthy of boundless joy.", "Next year will be even better.", "Leap year! One more day to be thankful."];

// Home Page (computed every time the budget refreshes, so they're never stored)
let lowestInBank = 0;     // "Lowest in bank after today"
let upcomingEntries = []; // Future Dates entries past the calendar: [{ date, sprite, amount, title }]
let daveMessage = "";     // Dave's message

// Others
let formEntryRow = ["", "", "", "", "", "", ""]; // Change Logs row being built: [time, duration, action, 4 details]

// Lines the budget writes itself (In Bank, Costs, Gains): never treated as entries.
// The spreadsheet left out ❇️, so the tracker counted each day's Gains line as an entry.
let systemEmojis = ["⛔️", "✅", "✴️", "❇️"];
let mmddCache = new Map();
let hadError = false;
let notFound = false;

let recurringToDeleteIndexes = [];

let uniquesCreated = 0;
let weeksScrolled = 0;
let deletedRecurrings = 0;
let deletedUpcoming = 0;

let isDailyUpdate = false;
let lastDailyUpdate = null;
let pendingProcessedDate = null; // Set by performDailyUpdate, saved after the data saves
let lastActiveDay = null;        // The latest day the budget was used: brought up to date, or a quick entry made
let dataRevision = null;         // The budget's revision this page holds (see saveChanges); null until it loads
let budgetConflict = false;      // A save was refused: the budget was saved somewhere else since this page loaded
let savingNow = false;

// Set when a budget opens for the first time, which is its account's first sign-in: Home shows its Getting Started
// card while it's set (Calendar Page.js), and signing out forgets it, so the card never comes back after that
const GETTING_STARTED_KEY = "prismal_getting_started";

// =====================================================================
// #region META FUNCTIONS
// =====================================================================

async function loadWorkspace() {
  isDailyUpdate = true;
  const token = localStorage.getItem('prismal_jwt');

  if (!token) {
    console.error("No active session found. Redirecting to login...");
    if (typeof window.transitionTo === 'function') {
      window.transitionTo("/login.html", true, "right");
    } else {
      window.location.replace("/login.html");
    }
    return false;
  }

  try {
    const requestedAt = performance.now(); // The daily update's change log starts when the budget is asked for

    const response = await fetch(`${window.API_BASE_URL}/api/data/load`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    // The session ended (signed out everywhere, a new password, or it expired): sign out here too
    if (response.status === 401) {
      signedOutElsewhere();
      return false;
    }

    if (!response.ok) {
      throw new Error(`Server responded with status: ${response.status}`);
    }

    const data = await response.json();
    dataRevision = Number.isInteger(data.revision) ? data.revision : null;

    // A table's stored JSON text, parsed. If stored content exists but can't be parsed, that table is locked
    // from saving, so the (possibly recoverable) stored copy is never overwritten with an empty one.
    function parseDB(dbResult, tableName) {
      if (dbResult && dbResult.length > 0 && dbResult[0].content) {
        try {
          return JSON.parse(dbResult[0].content);
        } catch (e) {
          console.error(`JSON parse error on DB content for "${tableName}"; saving it is disabled:`, e);
          unsavableTables.add(tableName);
          return null;
        }
      }
      return null;
    }

    // Each table back as rows of cells. Tables keep every stored row (only the calendar has a fixed size).
    calendarData   = normalizeApiGrid(parseDB(data.calendar, "calendar"), calendarRows, calendarCols);
    recurringData  = normalizeApiTable(parseDB(data.recurring, "recurring"), TABLE_SHAPES.recurring);
    trackerData    = normalizeApiTable(parseDB(data.tracker, "tracker"), TABLE_SHAPES.tracker);
    futureData     = normalizeApiTable(parseDB(data.future, "future"), TABLE_SHAPES.future);
    historyData    = normalizeApiTable(parseDB(data.history, "history"), TABLE_SHAPES.history);
    searchData     = normalizeApiTable(parseDB(data.search, "search"), TABLE_SHAPES.search);
    calculatorData = normalizeApiTable(parseDB(data.calculator, "calculator"), TABLE_SHAPES.calculator);
    const storedAccounts = parseDB(data.accounts, "accounts");
    accountsData   = normalizeApiAccounts(storedAccounts);
    logsData       = normalizeApiTable(parseDB(data.logs, "logs"), TABLE_SHAPES.logs);
    sheetsData     = normalizeApiSheets(parseDB(data.sheets, "sheets"));
    workspaceLoaded = true;
    // Accounts that were just set up (like Savings in a new budget) are saved right away, so the
    // Quick Entry page can list them too
    if (!unsavableTables.has("accounts") && JSON.stringify(accountsData) !== JSON.stringify(storedAccounts)) accountsEdited = true;

    // Use the date from the database (yesterday if it's missing). A brand-new account (never
    // processed, empty calendar) starts today instead: there are no missed days to catch up.
    const calendarIsEmpty = calendarData.every(row => row.every(cell => String(cell).trim() === ""));
    const isNewAccount = !data.last_processed_date && calendarIsEmpty;
    lastDailyUpdate = isNewAccount ? today : createSafeMidnight(data.last_processed_date || yesterday);
    // The budget's day never goes back. After flying west across a Sunday, or with the clock set back, this
    // device's date can be before the day the budget was last brought up to date (on this device or another
    // one); the calendar would then be laid out on the week before, and every day's entries would land on
    // the wrong day. So the budget keeps that later day until this device's date catches up.
    if (lastDailyUpdate.getTime() > today.getTime()) setBudgetDay(lastDailyUpdate);
    if (isNewAccount) {
      pendingProcessedDate = formatToMMDDYYYY(today);
      try { localStorage.setItem(GETTING_STARTED_KEY, "1"); } catch (e) {}
    }
    const isNewDay = lastDailyUpdate.getTime() < today.getTime();
    lastActiveDay = latestActiveDay(lastDailyUpdate, data.quick_entries);

    // Catch up any missed days, then rebuild everything computed from the entries
    // (recurring entries, math, Dave, tracker). Only tables that changed get saved.
    const loadSnapshot = snapshotTables();
    try {
      beginChangeLog("🕛 Daily Update", requestedAt);
      await performDailyUpdate();
      stripRecurringEntries();
      refreshBudgetData();
      if (isNewDay) finishChangeLog(); // Logged once per day, like the spreadsheet's nightly run
    } catch (err) {
      workspaceLoaded = false; // Half-updated data must never be saved
      throw err;
    }
    markChangedTables(loadSnapshot);
    isDailyUpdate = false;

    const allSaved = await saveChanges();

    // Only mark the days as processed once the processed data is stored. If a save failed,
    // the database still has the old calendar AND the old date, so the next load redoes them.
    if (allSaved && pendingProcessedDate) {
      if (await saveProcessedDate(pendingProcessedDate)) pendingProcessedDate = null;
    }
    await applyQuickEntries(data.quick_entries); // Made with the home screen Quick Entry icon since last time
    queueReminderPlanSync();
    return true;

  } catch (err) {
    console.error("Failed to load workspace:", err);
    return false;
  }
}

//#endregion

// =====================================================================
// #region WORKER FUNCTIONS
// =====================================================================

// Away for a long time: the first month after the budget was last used is caught up in full, and the days after it
// only get their Upcoming entries and In Bank (no recurring or spreadsheet entries). Years of recurring entries
// nobody checked would just have to be deleted by hand, and would take a long time to work out.
const FULL_CATCH_UP_MONTHS = 1;

// The latest day the budget was used: the day it was last brought up to date, or a later day a quick entry was
// made on the home screen icon (queue: the load's quick_entries, each with createdAt, in ms)
function latestActiveDay(lastUpdate, queue) {
  let latest = lastUpdate;
  for (const quick of Array.isArray(queue) ? queue : []) {
    if (!Number.isFinite(quick?.createdAt)) continue;
    const made = new Date(quick.createdAt);
    const day = new Date(made.getFullYear(), made.getMonth(), made.getDate());
    if (day > latest && day <= today) latest = day;
  }
  return latest;
}

// The first day after the full catch-up: a month after the budget was last used (the 31st's month ends early)
function fullCatchUpEnd(activeDay) {
  const end = new Date(activeDay.getFullYear(), activeDay.getMonth() + FULL_CATCH_UP_MONTHS, 1);
  end.setDate(Math.min(activeDay.getDate(), new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate()));
  return end;
}

/*
Daily update catch-up: brings the budget forward to today no matter how many days were missed,
producing what running the spreadsheet's daily update once per day would have produced. After being away
over a month, only the first month gets recurring and spreadsheet entries (see FULL_CATCH_UP_MONTHS).

Instead of looping the whole update once per missed day, every week from the saved grid
through the end of today's grid is laid out as one timeline and walked once, in date order:
  - Days that scrolled in while away (never on a saved grid) get their Future Dates entries
    and recurring entries written in, exactly like the daily runs would have done
  - Every missed day gets equity processed and its recurring entries turned into temps, once each
  - Days that scrolled in get In Bank math, chained from the last known balance
Then every week before today's week goes to History in one insert, and today's 4 weeks
become the new calendar.
*/
async function performDailyUpdate() {
  formEntryRow[2] = "🕛 Daily Update";

  // 1. Find which week the saved calendar holds, and how far today's grid is past it
  let oldGridStart = findSavedGridStart();
  let weeksToScroll = Math.round(getDayDifference(gridStartDate, oldGridStart) / 7);

  if (weeksToScroll < 0) {
    console.warn("Saved calendar is ahead of today (device clock changed?), skipping daily update.");
    return;
  }

  // 2. Lay every week from the saved grid to the end of today's grid out as one timeline
  // Rows 0-3 are the saved calendar; any rows after that are weeks that scrolled in while away
  let timeline = [];
  for (let w = 0; w < weeksToScroll + 4; w++) {
    let row = [];
    for (let c = 0; c < 7; c++) {
      let date = addDays(oldGridStart, w * 7 + c);
      let isNew = w >= 4;
      let text = isNew ? "" : String(calendarData[w][c] ?? "").trim();
      if (text === "") text = formatToMMDD(date);
      row.push({ date, text, isNew });
    }
    timeline.push(row);
  }

  // 3. Prepare bulk lookups once instead of rescanning tabs for every day
  let recurringRows = getParsedRecurringRows();
  let futureByDate = groupFutureRowsByDate();
  let usedFutureRows = new Set();

  let todayTime = today.getTime();
  let missedFromTime = lastDailyUpdate.getTime();
  let lastInBank = null;
  // Once a placeholder is taken off a day the budget had already worked out, that day and every one after it work out
  // their In Bank again (without it)
  let rechain = false;
  let placeholdersRemoved = 0;
  // Days from a month after the budget was last used only get Upcoming entries and In Bank
  let lightFromTime = fullCatchUpEnd(lastActiveDay || lastDailyUpdate).getTime();
  let sheetDays = sheetEntriesByDay(lastDailyUpdate, new Date(Math.min(yesterday.getTime(), lightFromTime - 1)));

  // 4. One pass over the timeline in date order, stopping at today
  timelineLoop:
  for (let w = 0; w < timeline.length; w++) {
    for (let c = 0; c < 7; c++) {
      let cell = timeline[w][c];
      let cellTime = cell.date.getTime();
      if (cellTime >= todayTime) break timelineLoop;

      let isMissed = cellTime >= missedFromTime;

      // Days that were never on a saved grid: add what the daily runs would have added
      // (Future Dates entries first, then recurring entries, same order as the spreadsheet, then the
      // connected spreadsheets' entries)
      if (cell.isNew && isMissed) {
        let futureRows = futureByDate.get(cellTime) || [];
        for (let i of futureRows) {
          let fTitle = String(futureData[i][0]).trim();
          let fAmt = parseAmount(futureData[i][1]);
          let fSprite = String(futureData[i][3]);
          cell.text += `\n${fSprite} ${formatMoney(fAmt)} ${fTitle}`;
          usedFutureRows.add(i);
        }
        if (cellTime < lightFromTime) {
          cell.text = writeRecurringToCell(cell.text, cell.date, recurringRows);
          cell.text = writeSheetsToCell(cell.text, sheetDays.get(cellTime));
        }
      }

      // A placeholder whose day has passed is deleted: it only stood in for an entry, so none is ever left on a day
      // that passed (or in History)
      let kept = dropPlaceholders(cell.text);
      if (kept.dropped > 0) {
        cell.text = kept.text;
        placeholdersRemoved += kept.dropped;
        if (!cell.isNew) rechain = true;
      }

      // Every missed day: turn recurring and spreadsheet entries into temps (they stay as they were that day)
      if (isMissed) {
        let lines = cell.text.split("\n");
        for (let l = 1; l < lines.length; l++) {
          let parts = getParts(lines[l]);
          let mark = entryMark(parts[0]);
          if (mark) {
            let newSprite = getSpecialType(parts[0]) + mark;
            if (newSprite !== parts[0]) uniquesCreated++;
            parts[0] = newSprite;
            lines[l] = parts.join(" ");
          }
        }
        cell.text = lines.join("\n");
      }

      // Keep the balance chain going: saved cells already have In Bank (until a placeholder came off one), new ones need it
      if (cell.isNew || rechain) {
        if (lastInBank === null) lastInBank = readLatestHistoryInBank();
        let math = applyCellBudgetMath(cell.text, lastInBank);
        cell.text = math.text;
        lastInBank = math.inBank;
      } else {
        let savedInBank = readInBank(cell.text);
        if (savedInBank !== null) lastInBank = savedInBank;
      }
    }
  }

  // 5. Archive every week before today's week to History in one insert (newest week on top)
  if (weeksToScroll > 0) {
    let archivedWeeks = timeline
      .slice(0, weeksToScroll)
      .map(row => row.map(cell => formatHistoryCell(cell.text, cell.date)));
    historyData.splice(1, 0, ...archivedWeeks.reverse());
    historyEdited = true;
    weeksScrolled += weeksToScroll;
  }

  // 6. Today's 4 weeks become the calendar
  calendarData = timeline.slice(weeksToScroll).map(row => row.map(cell => cell.text));

  // 7. Remove Future Dates entries that were written into missed days
  if (usedFutureRows.size > 0) {
    futureData = futureData.filter((_, i) => !usedFutureRows.has(i));
    futureEdited = true;
    deletedUpcoming += usedFutureRows.size;
  }

  // 8. Mark today as processed; loadWorkspace saves this only after the data itself is saved
  if (lastDailyUpdate.getTime() < todayTime) {
    pendingProcessedDate = formatToMMDDYYYY(today);
    lastDailyUpdate = today;
  }

  formEntryRow[3] = "Uniques Created: " + uniquesCreated + (placeholdersRemoved > 0 ? ", Placeholders Removed: " + placeholdersRemoved : "");
  formEntryRow[5] = "Weeks Scrolled: " + weeksScrolled;
}

// A day's lines without its placeholders (its day has passed): { text, dropped (how many) }
function dropPlaceholders(cellText) {
  const lines = String(cellText).split("\n");
  const kept = lines.filter((line, l) => l === 0 || !isPlaceholder(getParts(line)[0]));
  return { text: kept.join("\n"), dropped: lines.length - kept.length };
}

// Find the Sunday that the saved calendar's first cell belongs to
function findSavedGridStart() {
  // Default: the grid that was current when the last update ran
  let fallback = addDays(lastDailyUpdate, -lastDailyUpdate.getDay());

  // Prefer the calendar's own header, since it says which week the saved cells really hold
  let header = String(calendarData?.[0]?.[0] ?? "").split("\n")[0].trim();
  let match = header.match(/^(\d{1,2})\/(\d{1,2})/);
  if (!match) return fallback;

  // The header has no year, so pick the year that lands nearest the fallback week
  let month = Number(match[1]) - 1;
  let day = Number(match[2]);
  let best = null;
  for (let year = fallback.getFullYear() - 1; year <= fallback.getFullYear() + 1; year++) {
    let candidate = new Date(year, month, day);
    // Skip impossible dates (like 02/30) and anything that isn't a Sunday
    if (candidate.getMonth() !== month || candidate.getDay() !== 0) continue;
    if (!best || Math.abs(candidate - fallback) < Math.abs(best - fallback)) best = candidate;
  }
  return best || fallback;
}

// Index Future Dates rows by day so each missed day is a lookup instead of a full scan
function groupFutureRowsByDate() {
  let byDate = new Map();
  for (let i = 1; i < futureData.length; i++) {
    let fTitle = String(futureData[i][0] ?? "").trim();
    let fDate = createSafeMidnight(futureData[i][2], true);
    if (!fTitle || isNaN(fDate.getTime())) continue;
    let key = fDate.getTime();
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key).push(i);
  }
  return byDate;
}

// Parse every Recurring tab row once for the whole catch-up
function getParsedRecurringRows() {
  let rows = [];
  for (let i = 2; i < recurringData.length; i++) {
    let parsed = parseRecurringRow(recurringData[i]);
    if (!parsed || !parsed.cleanTitle) continue; // Separators and blank rows
    rows.push({
      title: String(recurringData[i][0]).trim(),
      amt: parseAmount(String(recurringData[i][1])),
      sprite: recurringData[i][5],
      parsed: parsed
    });
  }
  return rows;
}

// Write due recurring entries into one cell, using the same rules as writeRecurring
function writeRecurringToCell(cellText, cellDate, recurringRows) {
  for (let row of recurringRows) {
    if (!recurringRowHits(row.parsed, cellDate)) continue;

    let cellLines = cellText.split("\n");
    let hasTemp = false;
    let hasUnique = false;
    for (let l = 0; l < cellLines.length; l++) {
      let parts = getParts(cellLines[l]);
      if (extractTitle(cellLines[l]) !== row.parsed.cleanTitle) continue;
      // Only an entry with the same refraction type affects it (a title can have one of each type)
      if (getSpecialType(parts[0]) !== row.parsed.special) continue;
      // A temp (checkmark entry) blocks the recurring entry for this day (so does a spreadsheet's)
      if (entryMark(parts[0])) {
        hasTemp = true;
        break;
      }
      // A unique with the same special type absorbs the recurring amount (a placeholder only if both are)
      hasUnique = true;
      let newAmt = row.amt + parseAmount(parts[1]);
      let newSprite = placeholderSprite(withoutPlaceholder(parts[0]) + "✔️", isPlaceholder(parts[0]) && isPlaceholder(row.sprite));
      cellLines[l] = newSprite + " " + formatMoney(newAmt) + " " + row.title;
      cellText = cellLines.join("\n");
      break;
    }
    if (!hasTemp && !hasUnique) {
      cellText += `\n${row.sprite} ${formatMoney(row.amt)} ${row.title}`;
    }
  }
  return cellText;
}

// Read the In Bank amount from a cell's second line (null if the cell has none)
function readInBank(cellText) {
  let line = String(cellText ?? "").split("\n")[1] || "";
  line = line.trim();
  if (!line.endsWith("In Bank") || line.includes("Day 28")) return null;
  return parseAmount(getParts(line)[1]);
}

// Latest balance stored in History (newest week is row 1, Saturday is column 6)
function readLatestHistoryInBank() {
  let inBank = readInBank(historyData?.[1]?.[6]);
  return inBank === null ? 0 : inBank;
}

// One cell's In Bank / Gains / Costs lines, using the same math as writeBudgetMath
function applyCellBudgetMath(cellText, lastInBank) {
  let lines = cellText.split("\n");
  let { gains, costs, bankChange } = dayMath(lines);
  let inBank = Math.round((lastInBank + bankChange) * 100) / 100;
  let finalLines = [lines[0]];
  finalLines.push((inBank < 0 ? "⛔️ " : "✅ ") + formatMoney(inBank) + " In Bank");
  if (gains > 0) finalLines.push(`❇️ ${formatMoney(gains)} Gains`);
  if (costs > 0) finalLines.push(`✴️ ${formatMoney(-costs)} Costs`);
  for (let l = 1; l < lines.length; l++) {
    let parts = getParts(lines[l]);
    if (lines[l].trim() && !systemEmojis.includes(parts[0])) finalLines.push(lines[l]);
  }
  return { text: finalLines.join("\n"), inBank: inBank };
}

// History format: MM/DD/YYYY header, In Bank line, entries (no gains, costs, or next 28 lines)
function formatHistoryCell(cellText, cellDate) {
  let lines = String(cellText).split("\n");
  let kept = [formatToMMDDYYYY(cellDate)];
  for (let l = 1; l < lines.length; l++) {
    let trimmed = lines[l].trim();
    if (!trimmed) continue;
    if (l === 1 && readInBank(cellText) !== null) {
      kept.push(lines[l]);
      continue;
    }
    if (trimmed.startsWith("❇️") || trimmed.startsWith("✴️")) continue;
    if (trimmed.startsWith("✅") || trimmed.startsWith("⛔️")) continue;
    kept.push(lines[l]);
  }
  return kept.join("\n");
}

// Save which day the daily update has processed through
async function saveProcessedDate(dateString) {
  const token = localStorage.getItem('prismal_jwt');
  if (!token) return false;

  try {
    const res = await fetch(`${window.API_BASE_URL}/api/data/save_date`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        last_processed_date: dateString
      })
    });
    if (!res.ok) throw new Error(`Server responded with status: ${res.status}`);
    return true;
  } catch (err) {
    console.error("Failed to save daily update timestamp:", err);
    return false;
  }
}

// =====================================================================
// #region BUDGET LOGIC
// =====================================================================
/*
Ported from the spreadsheet version. Every change runs through runBudgetAction(), which
mirrors the old onFormSubmit flow:
  1. strip recurring entries (and In Bank, Gains/Costs, next-28 lines) out of the calendar
  2. apply the change (calendar entry, recurring entry, tracker row, search, ...)
  3. re-add Future Dates and recurring entries, and remove expired recurring entries
  4. sort each day's entries, then redo the budget math, Dave, and the tracker
  5. log it to Change Logs, save, and tell the page to re-render ("budget:updated")
Changes run one at a time (the spreadsheet used a script lock). A change that fails part
way is rolled back, so half-finished data is never saved.
Other Accounts (like Savings) start from an amount set on their page, and are changed by Hidden and Transfer
entries with the account picked, see OTHER ACCOUNTS below.
*/

// Change Logs rows kept. Each table is saved as a single database row (2 MB max), so this is capped.
const MAX_LOG_ROWS = 1000;

// Tracker rows that updateTrackerTab fills in itself (their titles and aliases aren't user-edited, and they
// can't be deleted)
const TRACKER_AUTO_ROWS = ["gains", "costs", "transfers", "undefined"];
// A new budget's tracker starts with these ordinary rows too: [title, aliases (each counting all of its amounts)]
const NEW_TRACKER_ROWS = [["Unknown", ["Misc", "Catchup", "Other"]]];

// Tables the edit mode can reorder and delete from (and add sections to, when they have categoryRow)
const ROW_TABLES = {
  recurring: { name: "Recurring", headerRows: 2, get: () => recurringData, set: (rows) => { recurringData = rows; }, categoryRow: (title) => ["-", title, "", "", "", "-"] },
  tracker:   { name: "Tracker",   headerRows: 1, get: () => trackerData,   set: (rows) => { trackerData = rows; },   categoryRow: (title) => ["-", title, "", "", "-"] },
  accounts:  { name: "Accounts",  headerRows: 1, get: () => accountsData.list, set: (rows) => { accountsData.list = rows; } }
};

// Every saved table: snapshots for rollback, change detection so only changed tables are saved, and whether
// one is waiting to be saved (edited) until it is (saved). In the order saveChanges sends them.
const BUDGET_TABLES = {
  future:     { get: () => futureData,     set: (v) => { futureData = v; },     markEdited: () => { futureEdited = true; },     edited: () => futureEdited,     saved: () => { futureEdited = false; } },
  calendar:   { get: () => calendarData,   set: (v) => { calendarData = v; },   markEdited: () => { calendarEdited = true; },   edited: () => calendarEdited,   saved: () => { calendarEdited = false; } },
  recurring:  { get: () => recurringData,  set: (v) => { recurringData = v; },  markEdited: () => { recurringEdited = true; },  edited: () => recurringEdited,  saved: () => { recurringEdited = false; } },
  tracker:    { get: () => trackerData,    set: (v) => { trackerData = v; },    markEdited: () => { trackerEdited = true; },    edited: () => trackerEdited,    saved: () => { trackerEdited = false; } },
  history:    { get: () => historyData,    set: (v) => { historyData = v; },    markEdited: () => { historyEdited = true; },    edited: () => historyEdited,    saved: () => { historyEdited = false; } },
  search:     { get: () => searchData,     set: (v) => { searchData = v; },     markEdited: () => { searchEdited = true; },     edited: () => searchEdited,     saved: () => { searchEdited = false; } },
  calculator: { get: () => calculatorData, set: (v) => { calculatorData = v; }, markEdited: () => { calculatorEdited = true; }, edited: () => calculatorEdited, saved: () => { calculatorEdited = false; } },
  accounts:   { get: () => accountsData,   set: (v) => { accountsData = v; },   markEdited: () => { accountsEdited = true; },   edited: () => accountsEdited,   saved: () => { accountsEdited = false; } },
  sheets:     { get: () => sheetsData,     set: (v) => { sheetsData = v; },     markEdited: () => { sheetsEdited = true; },     edited: () => sheetsEdited,     saved: () => { sheetsEdited = false; } },
  logs:       { get: () => logsData,       set: (v) => { logsData = v; },       markEdited: () => { logsEdited = true; },       edited: () => logsEdited,       saved: () => { logsEdited = false; } }
};

// A change the user needs to fix: shown on the page, nothing is changed or saved
class BudgetInputError extends Error {}

let budgetQueue = Promise.resolve(); // Changes run one at a time, in order
let changeLogStart = 0;

/* ---------- Actions the page UI calls (each resolves to { ok, saved, notFound, message, ... }) ---------- */

// New calendar entry. entry: { title, sprite, amount (signed number), date, placeholder }. Can be undone.
function addCalendarEntry(entry) {
  return runBudgetAction("", () => {
    const added = unique({
      title: entry.title,
      sprite: entry.sprite,
      action: entry.amount > 0 ? "add" : "subtract",
      amount: String(Math.abs(entry.amount)),
      date: entry.date,
      placeholder: entry.placeholder === true,
      adding: true
    });
    // (A placeholder isn't a purchase yet, so Dave's refund tip leaves it be)
    return entry.placeholder === true ? {} : { purchase: { title: entry.title, amount: entry.amount, date: createSafeMidnight(entry.date || today), type: added.entryType } };
  }, { label: `added ${capitalize(String(entry.title || "").trim())} (${formatMoney(entry.amount)}) on ${showDay(createSafeMidnight(entry.date || today))}`, dates: [entry.date || today] });
}

// Change, move, or delete a calendar entry (or one in Upcoming; History's go through changeHistoryEntry). change: { title,
// sprite, date, action, amount, moveDate }. Can be undone.
function changeCalendarEntry(change) {
  return runBudgetAction("", () => unique(change), { label: describeEntryChange(change), dates: [change.date, change.moveDate].filter(Boolean) });
}

// A calendar entry's refraction type or Other Account changed (and maybe its amount and day too). change: { title,
// sprite, date (the entry as it is), newTitle ("Payday → HSA"), newSprite, amount (the new signed amount), moveDate,
// placeholder }. It comes off its day the way Delete takes it off (one that landed by itself leaves a $0.00 temp), then
// goes on as the new one, adding into an entry already there with that title and type (a day has one of each). Can be
// undone in one step.
function changeEntryKind(change) {
  return runBudgetAction("", () => entryKindChange(change), { label: describeKindChange(change), dates: [change.date, change.moveDate].filter(Boolean) });
}

// changeEntryKind's change itself: off as it was, then on as the new one
function entryKindChange(change) {
  const amount = Math.round(Number(change.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount === 0) throw new BudgetInputError("Enter an amount, like 12.50. To take the entry off, tap Delete.");
  unique({ title: change.title, sprite: change.sprite, date: change.date, action: "delete" });
  if (notFound) return {};
  return unique({ title: change.newTitle, sprite: change.newSprite, date: change.moveDate || change.date, action: amount > 0 ? "add" : "subtract", amount: String(Math.abs(amount)), placeholder: change.placeholder, adding: true });
}

// "changed Payday on 10/05 to Payday → HSA (Transfer)", for Undo and Redo
function describeKindChange(change) {
  return `changed ${capitalize(String(change.title || "").trim())} on ${showDay(createSafeMidnight(change.date))} to ${capitalize(change.newTitle)} (${REFRACTION_NAMES.get(change.newSprite) || "Regular"})`;
}

// An entry on a day in History changed from History's zoomed day: changeCalendarEntry's change (Set to, Add to it, Move
// to, Delete), or changeEntryKind's (one with newTitle: its refraction type or Other Account). History is a record of
// what happened, so the balances it led to stay as they are: In Bank doesn't change (each History day keeps its own In
// Bank line, and the calendar goes on from the newest one), and neither does any Other Account's balance today
// (keepAccountBalances). It can only move to another day in History. The tracker and Search count the change. Can be
// undone, and undoing it keeps the balances too.
function changeHistoryEntry(change) {
  const isKind = change.newTitle !== undefined;
  const dates = [change.date, change.moveDate].filter(Boolean);
  const label = isKind ? describeKindChange(change) : describeEntryChange(change);
  return runBudgetAction("", () => {
    if (dates.some(date => date >= gridStartDate || !historyHasDay(date))) {
      throw new BudgetInputError(`An entry in History can only move to another day in History (${showDate(oldestHistoryDay() || gridStartDate)} through ${showDate(addDays(gridStartDate, -1))}).`);
    }
    const balances = accountBalancesToday();
    const result = (isKind ? entryKindChange(change) : unique(change)) || {};
    return { ...result, afterRefresh: () => keepAccountBalances(balances) };
  }, { label, dates, keepBalances: true });
}

// History's first day, or null without History
function oldestHistoryDay() {
  for (let r = historyData.length - 1; r >= 1; r--) {
    for (let c = 0; c < 7; c++) {
      const header = String(historyData[r][c] ?? "").split("\n")[0].trim();
      const date = header ? createSafeMidnight(header, true) : null;
      if (date && !isNaN(date.getTime())) return date;
    }
  }
  return null;
}

// Each Other Account's balance today, as the budget last worked it out: account row -> amount
function accountBalancesToday() {
  return new Map(accountRows().map(account => [account.index, parseAmount(account.row[1])]));
}

// After a change to History (worked out again: refreshBudgetData), each Other Account's balance today goes back to what
// it was (balances, from accountBalancesToday): its starting amount moves by the difference, so its entries stay as they
// are. An account with interest whose interest that would change (an entry moved after its interest started counting)
// starts counting its interest again from today instead, like typing its balance does (accountEntry).
function keepAccountBalances(balances) {
  let moved = false;
  for (const summary of accountSummaries()) {
    const target = balances.get(summary.index);
    if (target === undefined || Math.abs(summary.today - target) < 0.005) continue;
    const row = accountsData.list[summary.index];
    const start = Math.round((summary.start - (summary.today - target)) * 100) / 100;
    row[3] = start ? formatMoney(start) : "";
    moved = true;
    if (!summary.interest) continue;
    const after = accountSummaries().find(account => account.index === summary.index);
    if (after && Math.abs(after.today - target) >= 0.005) {
      const rebased = Math.round((target - after.entriesToday) * 100) / 100;
      row[3] = rebased ? formatMoney(rebased) : "";
      row[5] = formatToMMDDYYYY(today);
    }
  }
  if (moved) updateAccountBalances();
}

// "deleted Coffee on 10/05", for Undo and Redo
function describeEntryChange(change) {
  const title = capitalize(String(change.title || "").trim());
  const day = (date) => showDay(createSafeMidnight(date || today));
  const action = String(change.action || "").toLowerCase();
  const amount = Number(change.amount);
  const amountChanged = action !== "delete" && String(change.amount ?? "").trim() !== "";
  if (change.moveDate && day(change.moveDate) !== day(change.date)) {
    return `moved ${title} from ${day(change.date)} to ${day(change.moveDate)}${amountChanged ? " and changed its amount" : ""}`;
  }
  if (action === "delete") return `deleted ${title} on ${day(change.date)}`;
  if (action === "set" && amountChanged) return `set ${title} on ${day(change.date)} to ${formatMoney(amount)}`;
  if (action === "add") return `added ${formatMoney(amount)} to ${title} on ${day(change.date)}`;
  if (action === "subtract") return `took ${formatMoney(amount)} off ${title} on ${day(change.date)}`;
  // (Only its Placeholder switch changed)
  if (change.placeholder === true) return `made ${title} on ${day(change.date)} a placeholder`;
  if (change.placeholder === false) return `made ${title} on ${day(change.date)} no longer a placeholder`;
  return `changed ${title} on ${day(change.date)}`;
}

// New or changed recurring entry (index = the row that was clicked, null from the New Entry panel)
function saveRecurringEntry(fields, index = null) {
  return runBudgetAction("", () => (index === null ? recurring(fields) : editRecurringRow(index, fields)));
}

// New or changed tracker row (index = the row that was clicked, null from the New Entry panel)
function saveTrackerEntry(fields, index = null) {
  return runBudgetAction("🔧 Tracker Entries", () => trackerEntry(fields, index));
}

// Edit mode: the new row order after a drag (row indexes, top to bottom)
function moveBudgetRows(tableName, order, movedIndex) {
  return runBudgetAction(`🔧 ${ROW_TABLES[tableName].name} Order`, () => reorderTableRows(tableName, order, movedIndex));
}

// Edit mode: new section (category) separator before row atIndex
function addCategoryRow(tableName, atIndex, title) {
  return runBudgetAction(`🔧 ${ROW_TABLES[tableName].name} Categories`, () => insertCategory(tableName, atIndex, title));
}

// Edit mode: rename a section heading
function renameCategoryRow(tableName, index, title) {
  return runBudgetAction(`🔧 ${ROW_TABLES[tableName].name} Categories`, () => renameCategory(tableName, index, title));
}

// Delete rows (entries and/or sections). Recurring entries end yesterday instead, see deleteTableRows.
function deleteBudgetRows(tableName, indexes) {
  return runBudgetAction(`🔧 Delete ${ROW_TABLES[tableName].name} Rows`, () => deleteTableRows(tableName, indexes));
}

// New account (index null, from edit mode) or rename the tapped one. fields: { name }
function saveAccount(fields, index = null) {
  return runBudgetAction("", () => accountEntry(fields, index));
}

// Search bar. query: { terms: [{ title, match: "all" | "costs" | "gains" | "category" }], from, to, type (a refraction
// type, or "" for any), account (an Other Account's name, "none", or "" for any) }.
// Resolves with result.search. It looks through the calendar as it was before the change started, since
// every change first takes the recurring entries off the calendar (to write them again after).
function searchBudget(query) {
  return runBudgetAction("🔎 Search", (before) => ({ search: search(query, JSON.parse(before.calendar)) }));
}

// Paycheck Calculator. values: { [input key]: number } for every CALCULATOR_INPUTS key. Resolves with result.paycheck.
function savePaycheck(values) {
  return runBudgetAction("🧮 Calculator", () => calculator(values));
}

// Connected spreadsheets (Settings, see CONNECTED SPREADSHEETS): connect a new one (id null) or change one,
// with what reading it found; turn one on or off; delete one; and what reading them again found (Spreadsheets.js)
function saveSheetConnection(config, read, id = null) {
  return runBudgetAction("", () => sheetConnection(config, read, id));
}

// Turn a connected spreadsheet on or off
function turnSheetConnection(id, on) {
  return runBudgetAction("", () => switchSheet(id, on));
}

// Delete a connected spreadsheet (its temps from today on become plain entries)
function deleteSheetConnection(id) {
  return runBudgetAction("", () => removeSheet(id));
}

// What reading the connected spreadsheets again found (Spreadsheets.js)
function updateSheetReads(reads) {
  return runBudgetAction("", () => applySheetReads(reads));
}

/* ---------- Quick Entry (the home screen icon's page, quick.html) ---------- */
// The Quick Entry page can't open the budget (its key can only queue entries), so its entries wait in
// the API until the budget opens here. Each is added like a New Entry, then leaves the API's queue in
// the same request that saves the table it landed in (see saveChanges): never lost, never added twice.

// Refraction types by name, as the Quick Entry page sends them
const QUICK_ENTRY_TYPES = { auto: "", regular: "❗️", hidden: "✖️", transfer: "⭕️" };
// Queued entry ids to send with the next save of the table each one landed in
let quickEntryAcks = { calendar: [], history: [], future: [] };

// queue: [{ id, entry: { title, type, amount, date: "YYYY-MM-DD", placeholder } }] from the API, oldest first
async function applyQuickEntries(queue) {
  if (!Array.isArray(queue) || queue.length === 0) return;
  let added = 0;
  const failed = [];
  const passed = []; // Placeholders whose day passed before the budget opened: they go, like one on the calendar would
  for (const quick of queue) {
    // Each can be undone on the calendar, like a New Entry
    const entry = quick && quick.entry;
    const date = entry ? createSafeMidnight(entry.date, true) : null;
    if (entry && entry.placeholder === true && date && date < today) {
      passed.push(quick);
      continue;
    }
    const undo = entry && date && !isNaN(date.getTime())
      ? { label: `quick entry ${capitalize(String(entry.title || "").trim())} (${formatMoney(entry.amount)}) on ${showDay(date)}`, dates: [date] }
      : null;
    const result = await runBudgetAction("", () => quickEntry(quick), undo);
    if (result.ok) added++;
    else failed.push({ quick, message: result.message });
  }
  // The toast below says why, so entries that can't be added (or that passed) stop coming back
  const dropped = [...failed.map(({ quick }) => quick), ...passed];
  if (dropped.length > 0) await budgetApi("/api/quick/dismiss", { ids: dropped.map(quick => quick.id) });

  if (typeof BudgetUI === "undefined") return;
  const plural = (count) => `${count} quick ${count === 1 ? "entry" : "entries"}`;
  const messages = [];
  if (added > 0) messages.push(`Added ${plural(added)} from your home screen icon.`);
  if (passed.length > 0) messages.push(`Left out ${passed.length === 1 ? "a placeholder" : passed.length + " placeholders"} from your home screen icon: ${passed.length === 1 ? "its day has" : "their days have"} passed.`);
  if (failed.length > 0) {
    const first = failed[0];
    messages.push(`Couldn't add ${failed.length === 1 ? "the quick entry" : plural(failed.length) + ", like"} "${first.quick?.entry?.title ?? "Untitled"}": ${first.message}`);
  }
  BudgetUI.showToast(messages.join(" "), failed.length > 0);
}

// One queued entry, added like the calendar's New Entry. Says which table it landed in.
function quickEntry(quick) {
  const entry = quick && quick.entry;
  const date = entry ? createSafeMidnight(entry.date, true) : new Date("invalid");
  if (!entry || typeof entry.amount !== "number" || isNaN(date.getTime())) throw new BudgetInputError("It couldn't be read.");
  const table = date < gridStartDate ? "history" : (date > gridEndDate ? "future" : "calendar");
  if (table === "history" && !historyHasDay(date)) {
    throw new BudgetInputError(`${showDate(date)} is before your budget's History starts.`);
  }
  const added = unique({
    title: entry.title,
    sprite: Object.prototype.hasOwnProperty.call(QUICK_ENTRY_TYPES, entry.type) ? QUICK_ENTRY_TYPES[entry.type] : "",
    action: entry.amount > 0 ? "add" : "subtract",
    amount: String(Math.abs(entry.amount)),
    date,
    placeholder: entry.placeholder === true,
    adding: true
  });
  formEntryRow[5] = "⚡ Quick Entry"; // Where "Move To" goes (quick entries never move)
  const purchase = entry.placeholder === true ? null : { title: entry.title, amount: entry.amount, date, type: added.entryType };
  return { quickEntry: { id: quick.id, table }, purchase };
}

// Does History have a cell for this day? (an entry for an older day would have nowhere to go)
function historyHasDay(date) {
  const target = formatToMMDDYYYY(date);
  return historyData.slice(1).some(row => row.some(cell => {
    const header = String(cell ?? "").split("\n")[0].trim();
    return header !== "" && (header === target || createSafeMidnight(header, true).getTime() === date.getTime());
  }));
}

/* ---------- Running a change ---------- */

// Queue one change through the full budget flow. change(before) gets the tables as they were before it
// (snapshotTables), and can return afterRefresh, which runs once everything is worked out again. undo: { label, dates,
// keepBalances } makes it a step Undo can take back (calendar and quick entries, and History's changes, which keep the
// accounts' balances; see UNDO + REDO)
function runBudgetAction(logType, change, undo = null) {
  const requestedAt = performance.now(); // The change log's start: when the change was asked for
  const run = budgetQueue.then(() => processBudgetAction(logType, change, undo, requestedAt));
  budgetQueue = run.catch(() => {});
  return run;
}

// The page shows a change right away (it's saved right after), and its change log row says how long that
// took: from when it was asked for to when the page had drawn it.
async function processBudgetAction(logType, change, undo = null, requestedAt = performance.now()) {
  if (!workspaceLoaded) return { ok: false, message: "Your budget hasn't finished loading yet." };

  // The page stayed open past midnight (or the device moved to another time zone): reload so the daily
  // update runs before any change
  if (deviceDayChanged()) {
    window.location.reload();
    return { ok: false, message: "A new day started, so your budget is reloading." };
  }

  const snapshot = snapshotTables();
  const undoBefore = undo ? captureEntryDays(undo.dates) : null;
  const lowestBefore = lowestInBank; // For Dave's refund tip
  let result = {};

  try {
    beginChangeLog(logType, requestedAt);
    stripRecurringEntries();
    result = change(snapshot) || {};
    refreshBudgetData();
    // A change can finish once everything is worked out again (History's changes keep the accounts' balances)
    if (result.afterRefresh) result.afterRefresh();
    delete result.afterRefresh;
    if (undo) result.newUndoStep = makeUndoStep(undo.label, undoBefore, !!undo.keepBalances);
  } catch (err) {
    restoreTables(snapshot);
    // A remembered change that can't be undone (or redone) anymore is dropped, so older ones still can be
    if (err instanceof StaleHistoryError) dropHistoryStep(err.direction);
    if (err instanceof BudgetInputError) return { ok: false, message: err.message };

    // Unexpected failure: the data stays as it was, but the attempt is logged (in red)
    console.error("Budget change failed, nothing was changed:", err);
    hadError = true;
    finishChangeLog();
    await saveChanges();
    notifyBudgetChanged();
    return { ok: false, message: "Something went wrong, so nothing was changed." };
  }

  markChangedTables(snapshot);
  noticeRiskyPurchase(result.purchase, lowestBefore);
  delete result.purchase;
  if (result.newUndoStep) rememberUndoStep(result.newUndoStep);
  if (result.historyStep) moveHistoryStep(result.historyStep.direction);
  delete result.newUndoStep;
  // A quick entry leaves the API's queue in the same request that saves the table it landed in
  if (result.quickEntry) {
    BUDGET_TABLES[result.quickEntry.table].markEdited();
    quickEntryAcks[result.quickEntry.table].push(result.quickEntry.id);
  }
  notifyBudgetChanged();
  await afterNextPaint();
  finishChangeLog(); // (Saved with the rest, just below)
  const saved = await saveChanges();
  queueReminderPlanSync();
  return { ok: true, saved, notFound, ...result };
}

// Tell the page that budget data changed (pages re-render on this)
function notifyBudgetChanged() {
  document.dispatchEvent(new CustomEvent("budget:updated"));
}

// Resolves once the page has drawn what just changed (right away for a page in the background, which isn't
// drawn, and after half a second at most)
function afterNextPaint() {
  if (document.visibilityState !== "visible") return Promise.resolve();
  return new Promise(resolve => {
    const latest = setTimeout(resolve, 500);
    requestAnimationFrame(() => setTimeout(() => {
      clearTimeout(latest);
      resolve();
    }, 0));
  });
}

// Every table as JSON text, to roll back to or compare with
function snapshotTables() {
  const snapshot = {};
  for (const [name, table] of Object.entries(BUDGET_TABLES)) snapshot[name] = JSON.stringify(table.get());
  return snapshot;
}

// Put every table back the way a snapshot has it
function restoreTables(snapshot) {
  for (const [name, table] of Object.entries(BUDGET_TABLES)) table.set(JSON.parse(snapshot[name]));
}

// Mark every table that differs from the snapshot as edited, so saveChanges() sends it
function markChangedTables(snapshot) {
  for (const [name, table] of Object.entries(BUDGET_TABLES)) {
    if (JSON.stringify(table.get()) !== snapshot[name]) table.markEdited();
  }
}

/* ---------- Change Logs (the spreadsheet's "Form Entries" tab) ---------- */
// Row: [time, duration, action, detail, detail, detail, detail, status ("" | "Not Found" | "Error")]

// startedAt (performance.now() time): when the change was asked for, which is the row's time. finishChangeLog
// works out how long it took.
function beginChangeLog(type, startedAt = performance.now()) {
  changeLogStart = startedAt;
  hadError = false;
  notFound = false;
  formEntryRow = [formatLogTime(new Date(Date.now() - (performance.now() - startedAt))), "", type || "", "", "", "", ""];
}

// Finish the change's log row (how long it took, and its status) and add it, newest first
function finishChangeLog() {
  formEntryRow[1] = ((performance.now() - changeLogStart) / 1000).toFixed(2) + " Seconds";
  const status = hadError ? "Error" : (notFound ? "Not Found" : "");
  logsData.splice(1, 0, [...formEntryRow.slice(0, 7), status]);
  if (logsData.length > MAX_LOG_ROWS + 1) logsData.length = MAX_LOG_ROWS + 1;
  logsEdited = true;
}

// "H:mm" and the day, like the spreadsheet's log times, with the day in this device's date format
// (logs are only ever read by people)
function formatLogTime(date) {
  return `${date.getHours()}:${String(date.getMinutes()).padStart(2, "0")} ${showDate(date)}`;
}

/* ---------- The budget flow ---------- */

// Remove everything but unique entries (and temps) from the calendar. Recurring entries, connected
// spreadsheets' entries, In Bank, Gains/Costs and the next-28 lines are all rebuilt by refreshBudgetData().
function stripRecurringEntries() {
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 7; c++) {
      let cellText = String(calendarData[r][c]).trim();
      let lines = cellText.split("\n").filter(l => l.trim() !== "");
      let targetMMDD = formatToMMDD(gridDates[r][c]);
      if (lines.length === 0 || !lines[0].includes(targetMMDD)) {
        lines.unshift(targetMMDD);
      }
      let cleanedLines = [lines[0]];
      for (let l = 1; l < lines.length; l++) {
        let line = lines[l].trim();
        // Keep unique entries and temps
        if (line.startsWith("❗️") || line.startsWith("✖️") || line.startsWith("⭕️")) {
          cleanedLines.push(line);
        }
      }
      calendarData[r][c] = cleanedLines.join("\n");
    }
  }
}

// Rebuild everything computed from the entries (the spreadsheet's "final calculations")
function refreshBudgetData() {
  // The spreadsheet ran once per execution; the page runs this many times, so reset per run
  visibleUncommons = 0;
  visibleNegatives = 0;
  nextFourNegative = false;
  recurringToDeleteIndexes = [];

  normalizeFrequencies();
  upcomingEntriesMaintenance();
  writeRecurring();
  writeSheetEntries();
  releaseEndedTemps();
  releaseSheetTemps();
  if (deleteExpiredRecurrings()) recurringEdited = true;
  organizeCellEntries();
  writeBudgetMath();
  commenceDave();
  updateTrackerTab();
  updateAccountBalances();
}

/* ---------- Calendar entries (the old "Unique Entry" form) ---------- */

// Create or change a calendar entry. A new entry with the same title + refraction type as one
// already on that day is combined into it.
// entry: { title, sprite: "" (match/inherit) | "❗️" | "✖️" | "⭕️",
//          action: "subtract" | "add" | "set" | "delete",
//          amount: string ("" with "set" keeps the current amount),
//          date: Date, moveDate: Date (optional, moves the entry there),
//          placeholder: true | false (optional: whether it's a placeholder; left out, it stays as it was),
//          adding: true for a new entry (New Entry, Quick Entry), which a placeholder only joins as one if the entry
//          already there is one too }
function unique(entry) {
  // 1. Variables
  let rawTitle = String(entry.title || "").replace(/\s+/g, ' ').trim();
  let title = capitalize(rawTitle);
  if (!title) throw new BudgetInputError("Give the entry a title.");

  let rawAction = String(entry.action || "Subtract").trim();
  let action = rawAction.toLowerCase();
  let rawAmtString = String(entry.amount ?? "").trim();
  // Amounts arrive as numbers turned into text (String() writes very big or small ones like 1e+22 or 1e-7), so
  // the text is read as a number first, and parseAmount only reads text like "-$5.00"
  let amt = rawAmtString === "" ? 0 : Number(rawAmtString);
  if (!Number.isFinite(amt)) amt = parseAmount(rawAmtString);
  amt = Math.round(amt * 100) / 100;
  if (Math.abs(amt) > MAX_AMOUNT) throw new BudgetInputError(AMOUNT_TOO_BIG);
  if (action === "subtract") amt = amt * -1;
  if (action === "subtract" || action === "add") action = "append";

  let dateObj = createSafeMidnight(entry.date || today);
  formEntryRow[4] = "On: " + showDate(dateObj);
  let dateMove = createSafeMidnight(entry.moveDate || dateObj);
  formEntryRow[5] = entry.moveDate ? "Move To: " + showDate(dateMove) : "Move To: None";
  // A day before History starts (or one missing from it) has no cell to hold an entry, so nothing can be added
  // or moved there
  if (action !== "delete" && dateMove < gridStartDate && !historyHasDay(dateMove)) {
    throw new BudgetInputError(`${showDate(dateMove)} is before your budget's History starts, so there's no day to put it on. Pick ${showDate(gridStartDate)} or later.`);
  }

  // Refraction type ("" matches or inherits whatever is already there)
  let modifier = String(entry.sprite || "").trim();
  let sprite = modifier;
  let explicitSpecial = sprite !== "" ? getSpecialType(sprite) : null;

  formEntryRow[3] = (sprite || "❗️") + " " + title;

  // What lands on the day by itself, a recurring entry (✔️) or a connected spreadsheet's (➕): { amount,
  // sprite, mark } or null (see scheduledHit). A "virgin" one is still just as it lands (it's taken off the
  // calendar while a change runs, see stripRecurringEntries); changing it makes a temp, its type and its mark
  // (like ❗️✔️ or ❗️➕), which keeps it from landing on that day again.
  let source = scheduledHit(title, dateObj, explicitSpecial);
  // 2. Extract from Original Date
  let outData = {
    oldAmt: 0,
    oldSprite: "",
    hasBlocker: false
  };
  let isExisting = !injectOrDefer("delete", dateObj, 0, title, sprite, outData);
  // Only days from today on have entries that land by themselves: the daily update turns every day that passed into
  // temps (and days long after the budget was last used never got them), so a past day never takes one in
  let isOriginalVirginRecurring = (!!source && !isExisting && !outData.hasBlocker && dateObj.getTime() >= today.getTime());
  let virginSprite = isOriginalVirginRecurring ? source.sprite : "";
  let virginSpecial = getSpecialType(virginSprite);
  // Inherit sprite before checking target date or calculating amounts
  if (modifier === "") {
    if (isExisting && outData.oldSprite) {
      sprite = outData.oldSprite;
    } else if (isOriginalVirginRecurring) {
      sprite = virginSprite;
    }
  }
  // Re-evaluate the source using exact special type (and mark) of deleted entry
  if (isExisting && outData.oldSprite) {
    let matched = scheduledHit(title, dateObj, getSpecialType(outData.oldSprite), entryMark(outData.oldSprite) || null);
    if (matched) source = matched;
  }
  let targetIncomingSpecial = getSpecialType(sprite);
  let originalMark = isExisting ? entryMark(outData.oldSprite) : "";
  let hasOriginalCheckmark = originalMark !== "";
  // A changed day keeps the mark of where it came from
  let virginMark = isOriginalVirginRecurring ? source.mark : originalMark;
  let isMismatchedVirgin = false;
  if (isOriginalVirginRecurring && targetIncomingSpecial !== virginSpecial) {
    isOriginalVirginRecurring = false;
    isMismatchedVirgin = true;
  }
  // Whether it's a placeholder: as the change says (a form's Placeholder switch), or as it was. A new entry added into
  // one already there is a placeholder only if both are (entry.adding), and nothing on a day before today is one.
  let wasPlaceholder = isExisting ? isPlaceholder(outData.oldSprite)
    : (isOriginalVirginRecurring || isMismatchedVirgin) && isPlaceholder(source.sprite);
  let placeholder = entry.placeholder === undefined ? wasPlaceholder : !!entry.placeholder;
  if (entry.adding && (isExisting || isOriginalVirginRecurring || isMismatchedVirgin)) placeholder = placeholder && wasPlaceholder;
  // 3. Extract from Target Date (Only if moving)
  let moveIsExisting = false;
  let moveOutData = {
    oldAmt: 0,
    oldSprite: "",
    hasBlocker: false
  };
  if (dateMove.getTime() !== dateObj.getTime()) {
    moveIsExisting = !injectOrDefer("delete", dateMove, 0, title, sprite, moveOutData);
  }
  // Combine existing hardcoded checks with virgin recurring checks
  let originalFound = isExisting || isOriginalVirginRecurring;

  if (action === "delete" && !originalFound) {
    notFound = true;
  } else if (dateMove.getTime() !== dateObj.getTime() && !originalFound && !moveIsExisting) {
    notFound = true;
  }
  // 4. Calculate Amounts for the Moved Entry
  let finalAmt = amt;
  let baseAmtOriginal = (isOriginalVirginRecurring || isMismatchedVirgin) ? source.amount : 0;
  if (action === "append") {
    finalAmt = (isExisting ? outData.oldAmt : baseAmtOriginal) + amt;
  } else if (action === "set" && rawAmtString === "") {
    finalAmt = isExisting ? outData.oldAmt : baseAmtOriginal;
  }

  // 5. Inject $0 Blockers (Unless is going into history tab). A placeholder's blocker is one too, so it goes with
  // its day.
  if (dateObj.getTime() >= gridStartDate.getTime()) {
    if (isOriginalVirginRecurring || isMismatchedVirgin) {
      if (dateObj.getTime() !== dateMove.getTime() || finalAmt !== baseAmtOriginal || action === "delete") {
        let blockerSprite = getSpecialType(source.sprite) + source.mark;
        injectOrDefer("set", dateObj, 0, title, blockerSprite, {}, isPlaceholder(source.sprite));
      }
    } else if (hasOriginalCheckmark && source && (dateObj.getTime() !== dateMove.getTime() || action === "delete")) {
      // Only inject the blocker if the entry wasn't ALREADY a $0 blocker.
      if (outData.oldAmt !== 0) {
        let blockerSprite = getSpecialType(outData.oldSprite) + originalMark;
        injectOrDefer("set", dateObj, 0, title, blockerSprite, {}, isPlaceholder(outData.oldSprite));
      }
    }
  }
  // 6. Handle Target Date Merging
  if (action !== "delete") {
    if (!(notFound && dateMove.getTime() !== dateObj.getTime())) {
      let moveAmt = finalAmt;
      let moveSprite = sprite;
      if (dateMove.getTime() !== dateObj.getTime()) {
        let moveSource = scheduledHit(title, dateMove, targetIncomingSpecial);
        let isTargetVirginRecurring = (!!moveSource && dateMove.getTime() >= today.getTime() && !moveIsExisting && !moveOutData.hasBlocker);
        let moveBaseAmt = isTargetVirginRecurring ? moveSource.amount : 0;
        let moveBaseSprite = isTargetVirginRecurring ? moveSource.sprite : "";
        let destAmt = 0;
        let destSpecial = "";
        let destMark = "";
        let mergeValid = false;
        if (moveIsExisting) {
          destAmt = moveOutData.oldAmt;
          destSpecial = getSpecialType(moveOutData.oldSprite);
          destMark = entryMark(moveOutData.oldSprite);
          mergeValid = true;
        } else if (isTargetVirginRecurring) {
          destAmt = moveBaseAmt;
          destSpecial = getSpecialType(moveBaseSprite);
          destMark = moveSource.mark;
          mergeValid = true;
        }
        if (mergeValid && targetIncomingSpecial === destSpecial) {
          moveAmt += destAmt;
          moveSprite = targetIncomingSpecial + (destMark || (isOriginalVirginRecurring ? virginMark : "") || entryMark(moveSprite));
          // (Two entries become one there: a placeholder only if both were)
          placeholder = placeholder && isPlaceholder(moveIsExisting ? moveOutData.oldSprite : moveBaseSprite);
        } else if (isOriginalVirginRecurring) {
          moveSprite = targetIncomingSpecial + virginMark;
        }
      } else {
        if (isOriginalVirginRecurring || (isExisting && hasOriginalCheckmark)) {
          moveSprite = targetIncomingSpecial + virginMark;
        }
      }
      // 7. Inject combined result back into target date
      injectOrDefer("set", dateMove, moveAmt, title, moveSprite, {}, placeholder);
      if (placeholder && dateMove >= today) formEntryRow[3] += " (Placeholder)";
      let gridStartMs = gridStartDate.getTime();
      if ((isExisting || moveIsExisting || !notFound) && (dateObj.getTime() < gridStartMs || dateMove.getTime() < gridStartMs)) {
        historyEdited = true;
      }
    }
  } else {
    if (isExisting && dateObj.getTime() < gridStartDate.getTime()) historyEdited = true;
  }
  // 8. Change Logs row
  let formEntryType = "Missing";
  if (!isExisting && !isOriginalVirginRecurring) formEntryType = "❗️ Create Unique";
  if (isExisting && !source) formEntryType = "❗️ Change Unique";
  if (isOriginalVirginRecurring || (isExisting && hasOriginalCheckmark)) formEntryType = `❗️${virginMark || "✔️"} Make Unique`;
  formEntryRow[2] = formEntryType;
  let formEntrySuffix = notFound ? "Not Found" : action === "delete" ? "Success" : formatMoney(rawAmtString);
  formEntryRow[6] = capitalize(rawAction) + ": " + formEntrySuffix;
  return { entryType: targetIncomingSpecial }; // The refraction type it landed as (Auto picks one)
}

// Put an entry on a day (calendar, History, or Future Dates, depending on the date), combining it
// with a same-title entry of the same refraction type. "delete" removes the match and reports
// what was there through outData. Returns true when nothing matched. placeholder: whether what's written is a
// placeholder (left out: as the entry there was, or as sprite says); never on a day before today.
function injectOrDefer(action, dateObj, newAmt, title, sprite = "❗️", outData = {}, placeholder = undefined) {
  let notFound = true;
  let targetMMDD = formatToMMDD(dateObj);
  let cleanNewTitle = cleanString(String(title));
  // The sprite written for an entry that was there as oldSprite (or "" for a new one)
  const marked = (newSprite, oldSprite) => placeholderSprite(newSprite, (placeholder ?? isPlaceholder(oldSprite || sprite)) && dateObj >= today);

  // Take the line with this title (and type) off the day's lines, and say what it held and what goes back
  function mergeMatchingLine(lines, currentAmt, currentTitle, currentSprite) {
    let cellHasBlocker = false;
    let incomingSpecial = currentSprite === "" ? null : getSpecialType(currentSprite);
    let matchedIndex = -1;
    // Single pass for both blockers and matches
    for (let i = 1; i < lines.length; i++) {
      let lineTitle = extractTitle(lines[i]);
      if (lineTitle !== cleanNewTitle) continue;
      let parts = getParts(lines[i]);
      if (parts.length === 0) continue;
      let matchedOldSprite = parts[0];
      let existingSpecial = getSpecialType(matchedOldSprite);
      // Check for blockers
      if (entryMark(matchedOldSprite) && (!incomingSpecial || existingSpecial === incomingSpecial)) {
        cellHasBlocker = true;
      }
      // Check for match
      if (!systemEmojis.includes(parts[0]) && matchedIndex === -1 && (!incomingSpecial || existingSpecial === incomingSpecial)) {
        matchedIndex = i;
      }
    }
    if (matchedIndex !== -1) {
      let parts = getParts(lines[matchedIndex]);
      let matchedOldSprite = parts[0];
      let oldAmt = parseAmount(parts[1]);
      let updatedTitle = parts.slice(2).join(" ");
      let updatedSprite = combineSprites(matchedOldSprite, currentSprite);
      let updatedAmt = 0;
      let shouldDelete = false;

      // Let unique() handle the $0 blocker repopulation
      if (action === "delete") {
        shouldDelete = true;
      } else if (action === "set") {
        updatedAmt = currentAmt;
      } else {
        updatedAmt = currentAmt + oldAmt;
      }

      lines.splice(matchedIndex, 1);
      return {
        matched: true,
        amt: updatedAmt,
        oldAmt: oldAmt,
        title: updatedTitle,
        sprite: updatedSprite,
        oldSprite: matchedOldSprite,
        shouldDelete: shouldDelete,
        hasBlocker: cellHasBlocker
      };
    }
    return {
      matched: false,
      amt: currentAmt,
      oldAmt: 0,
      title: currentTitle,
      sprite: currentSprite === "" ? "❗️" : currentSprite,
      oldSprite: "",
      shouldDelete: action === "delete",
      hasBlocker: cellHasBlocker
    };
  }

  // 1. Active Grid
  if (dateObj >= gridStartDate && dateObj <= gridEndDate) {
    currentLoop: for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 7; c++) {
        if (formatToMMDD(gridDates[r][c]) === targetMMDD) {
          let lines = String(calendarData[r][c]).split("\n");
          let mergeResult = mergeMatchingLine(lines, newAmt, title, sprite);
          outData.hasBlocker = mergeResult.hasBlocker;
          if (mergeResult.matched) {
            outData.oldAmt = mergeResult.oldAmt;
            outData.oldSprite = mergeResult.oldSprite;
          }
          if (!mergeResult.shouldDelete) {
            calendarData[r][c] = lines.join("\n") + `\n${marked(mergeResult.sprite, mergeResult.oldSprite)} ${formatMoney(mergeResult.amt)} ${capitalize(mergeResult.title)}`;
            notFound = false;
          } else {
            calendarData[r][c] = lines.join("\n");
            notFound = !mergeResult.matched;
          }
          break currentLoop;
        }
      }
    }
  }
  // 2. Past Grid
  else if (dateObj.getTime() < gridStartDate.getTime()) {
    let targetDateStr = formatToMMDDYYYY(dateObj);
    let targetTime = createSafeMidnight(dateObj).getTime();
    historyLoop: for (let r = 1; r < historyData.length; r++) {
      for (let c = 0; c < 7; c++) {
        let lines = String(historyData[r][c]).split("\n");
        if (!lines[0] || lines[0].trim() === "") continue;
        let cellDateStr = lines[0].trim();
        let isDateMatch = (cellDateStr === targetDateStr);
        if (!isDateMatch) {
          let cellDateObj = createSafeMidnight(cellDateStr, true);
          isDateMatch = (cellDateObj && cellDateObj.getTime() === targetTime);
        }
        if (!isDateMatch) continue;
        let mergeResult = mergeMatchingLine(lines, newAmt, title, sprite);
        outData.hasBlocker = mergeResult.hasBlocker;
        if (mergeResult.matched) {
          outData.oldAmt = mergeResult.oldAmt;
          outData.oldSprite = mergeResult.oldSprite;
        }
        if (!mergeResult.shouldDelete) {
          historyData[r][c] = lines.join("\n") + `\n${marked(mergeResult.sprite, mergeResult.oldSprite)} ${formatMoney(mergeResult.amt)} ${capitalize(mergeResult.title)}`;
          notFound = false;
        } else {
          historyData[r][c] = lines.join("\n");
          notFound = !mergeResult.matched;
        }
        break historyLoop;
      }
    }
  }
  // 3. Future Grid
  else {
    let cellHasBlocker = false;
    let incomingSpecial = sprite === "" ? null : getSpecialType(sprite);
    let matchedIndex = -1;
    let matchedFutureAmt = 0;
    let matchedFutureSprite = "";
    // Single pass scanner
    for (let i = 1; i < futureData.length; i++) {
      let cleanFutureTitle = cleanString(String(futureData[i][0]));
      let futureSprite = String(futureData[i][3]).trim();
      if (cleanFutureTitle !== cleanNewTitle || systemEmojis.includes(futureSprite)) continue;
      let futureDateObj = createSafeMidnight(futureData[i][2]);
      if (futureDateObj.getTime() !== dateObj.getTime()) continue;
      let futureSpecial = getSpecialType(futureSprite);
      // Blocker check
      if (entryMark(futureSprite) && (!incomingSpecial || futureSpecial === incomingSpecial)) {
        cellHasBlocker = true;
      }
      // Match check
      if (matchedIndex === -1 && (!incomingSpecial || futureSpecial === incomingSpecial)) {
        matchedIndex = i;
        matchedFutureAmt = parseAmount(futureData[i][1]);
        matchedFutureSprite = futureSprite;
      }
    }
    outData.hasBlocker = cellHasBlocker;
    notFound = false;
    let shouldDelete = (action === "delete");
    if (matchedIndex !== -1) {
      outData.oldAmt = matchedFutureAmt;
      outData.oldSprite = matchedFutureSprite;

      // Let unique() handle the $0 blocker repopulation
      sprite = combineSprites(matchedFutureSprite, sprite);
      if (action === "append") newAmt += matchedFutureAmt;
      if (action !== "delete") shouldDelete = false;

      futureData.splice(matchedIndex, 1);
    } else {
      notFound = (action === "delete");
    }
    if (!shouldDelete) {
      futureData.push([
        capitalize(title),
        formatMoney(newAmt),
        formatToMMDDYYYY(dateObj),
        marked(sprite === "" ? "❗️" : sprite, matchedFutureSprite)
      ]);
    }
  }
  return notFound;
}

// The entry a new one would go into on date (a day has one per title and type, see unique): the day's own entry with
// this title (and Other Account: "Payday → Savings") and refraction type ("" for Auto: any type), or a recurring or
// connected spreadsheet's entry that lands there. { amount, sprite } or null. New Entry offers to set it or add to it.
function entryOnDay(title, sprite, date) {
  const clean = cleanString(title);
  if (!clean || !(date instanceof Date) || isNaN(date.getTime())) return null;
  const special = sprite ? getSpecialType(sprite) : null;
  const matches = (lineSprite, lineTitle) => !systemEmojis.includes(lineSprite) && cleanString(lineTitle) === clean &&
    (!special || getSpecialType(lineSprite) === special);
  let cell = null;
  if (date >= gridStartDate && date <= gridEndDate) {
    const spot = calendarSpot(date);
    cell = spot ? calendarData[spot.r][spot.c] : "";
  } else if (date < gridStartDate) {
    const spot = historySpot(date);
    cell = spot ? historyData[spot.r][spot.c] : "";
  }
  if (cell !== null) {
    for (const text of String(cell).split("\n").slice(1)) {
      const line = readLine(text);
      if (line.title && matches(line.sprite, line.title)) return { amount: line.amount, sprite: line.sprite };
    }
    return null;
  }
  // After the calendar: Upcoming, then what lands there by itself (unless a temp in Upcoming already stands in for it)
  for (const row of futureData.slice(1)) {
    if (isUpcomingOn(row, date) && matches(String(row[3]).trim(), String(row[0]))) return { amount: parseAmount(row[1]), sprite: String(row[3]).trim() };
  }
  const landing = scheduledHit(title, date, special);
  return landing ? { amount: landing.amount, sprite: landing.sprite } : null;
}

/* ---------- Recurring entries (the old "Create/Change A Recurring Entry" form) ---------- */
// Two recurring entries can share a title only when their refraction type or Other Account is different: one Regular,
// one Hidden, and one Transfer can all be called Payday, and so can "Payday → Savings" and "Payday → HSA" (the account
// picked is part of the title, see cleanString), the same way a day has one entry per title and type. So it's always
// clear which recurring entry a day's entry came from. Making or changing one into a match for another is refused (the
// existing one gets changed instead), and so is renaming an Other Account when that would make two match (accountEntry).

const REFRACTION_NAMES = new Map([["❗️", "Regular"], ["✖️", "Hidden"], ["⭕️", "Transfer"]]);
const RECURRING_RULE = "Two recurring entries can't have the same title, refraction type, and Other Account";

// The row (other than exceptIndex) with this title (and Other Account) and refraction type, or -1
function recurringTwin(title, special, exceptIndex = -1) {
  let clean = cleanString(title);
  return recurringData.findIndex((row, i) => i >= 2 && i !== exceptIndex && String(row[0]).trim() !== "-" &&
    cleanString(row[0]) === clean && getSpecialType(String(row[5] || "")) === special);
}

// Refuse a recurring entry whose title, Other Account, and refraction type another one already has. kept: the entry
// being changed already matched it (two that match can't be made here, see recurringDuplicates), so it has to change
// one of the three, or one of them goes.
function refuseRecurringTwin(title, sprite, exceptIndex = -1, kept = false) {
  let twin = recurringTwin(title, getSpecialType(sprite), exceptIndex);
  if (twin === -1) return;
  let type = REFRACTION_NAMES.get(getSpecialType(sprite));
  if (kept) {
    throw new BudgetInputError(`${recurringData[twin][0]} is a ${type} recurring entry twice. ${RECURRING_RULE}, so give this one another title, type, or account, or delete one of them.`);
  }
  throw new BudgetInputError(`There's already a ${type} recurring entry called ${recurringData[twin][0]}. ${RECURRING_RULE}, so tap that one in the list to change it, or pick another title, type, or account.`);
}

// Recurring entries that match an earlier one's title, Other Account, and refraction type, which can't be made here but
// a budget from before that rule can have: ["Rent (Regular)", ...]. The Recurring Entries page lists them to be fixed;
// until then, on a day both land on, the first one does (see writeRecurring).
function recurringDuplicates() {
  let seen = new Set();
  let found = new Set();
  for (let i = 2; i < recurringData.length; i++) {
    let row = recurringData[i];
    if (!row || String(row[0]).trim() === "-" || !cleanString(row[0])) continue;
    let special = getSpecialType(String(row[5] || ""));
    let key = cleanString(row[0]) + "|" + special;
    if (seen.has(key)) found.add(`${String(row[0]).trim()} (${REFRACTION_NAMES.get(special)})`);
    seen.add(key);
  }
  return [...found];
}

// "Every 2 Weeks" as typed in the panel, checked and stored the standard way
function readFrequency(text) {
  let frequency = parseFrequency(text);
  if (!frequency) throw new BudgetInputError(`How often should it land? Use a whole number from 1 to ${MAX_FREQUENCY_COUNT}, like every 2 weeks.`);
  return formatFrequency(frequency);
}

// Create a recurring entry (refused when one with its title, Other Account, and refraction type already exists).
// fields: { title, sprite: "✔️" | "✔️✖️" | "✔️⭕️", amount: number, frequency: "Every 2 Weeks" (blank = every
//           month), startDate: Date | null (today), endDate: Date | "None" | null, placeholder: every day it lands on
//           gets a placeholder }
function recurring(fields) {
  let title = capitalize(String(fields.title || "").replace(/\s+/g, ' ').trim());
  if (!title) throw new BudgetInputError("Give the recurring entry a title.");
  let sprite = placeholderSprite(String(fields.sprite || "").trim() || "✔️", fields.placeholder === true);
  refuseRecurringTwin(title, sprite);
  let frequency = readFrequency(fields.frequency || "Every Month");
  let hasAmount = typeof fields.amount === "number" && !isNaN(fields.amount);
  if (hasAmount && Math.abs(fields.amount) > MAX_AMOUNT) throw new BudgetInputError(AMOUNT_TOO_BIG);
  let startDate = fields.startDate ? createSafeMidnight(fields.startDate) : createSafeMidnight(today);
  let endDate = resolveEndDate(fields.endDate, "None");

  let amount = formatMoney(hasAmount ? fields.amount : 0);
  recurringData.push([title, amount, formatToMMDDYYYY(startDate), frequency, endDate, sprite]);

  formEntryRow[2] = "✔️ Create Recurring";
  formEntryRow[3] = withoutPlaceholder(sprite) + " " + title + (isPlaceholder(sprite) ? " (Placeholder)" : "");
  formEntryRow[4] = frequency + ": " + showDate(startDate);
  formEntryRow[5] = "Expiration: " + showStoredDate(endDate);
  formEntryRow[6] = "Amount: " + amount;
  return {};
}

// Change the recurring entry that was clicked (every field comes from the edit panel). Its title, Other Account, and
// type together can't match another recurring entry's.
function editRecurringRow(index, fields) {
  let row = recurringData[index];
  if (!row || row[0] === "-" || !String(row[0]).trim()) {
    throw new BudgetInputError("That recurring entry couldn't be found. Please try again.");
  }
  let title = capitalize(String(fields.title || "").replace(/\s+/g, ' ').trim());
  if (!title) throw new BudgetInputError("Give the recurring entry a title.");
  let hasAmount = typeof fields.amount === "number" && !isNaN(fields.amount);
  if (hasAmount && Math.abs(fields.amount) > MAX_AMOUNT) throw new BudgetInputError(AMOUNT_TOO_BIG);
  let sprite = String(fields.sprite || "").trim() || String(row[5] || "").trim() || "✔️";
  sprite = placeholderSprite(sprite, fields.placeholder === undefined ? isPlaceholder(row[5]) : fields.placeholder === true);
  let oldTitle = String(row[0]).trim();
  let oldSpecial = getSpecialType(String(row[5] || ""));
  let newSpecial = getSpecialType(sprite);
  let renamed = cleanString(oldTitle) !== cleanString(title) || oldSpecial !== newSpecial;
  refuseRecurringTwin(title, sprite, index, !renamed);
  let startDate = fields.startDate ? createSafeMidnight(fields.startDate) : createSafeMidnight(row[2]);
  let endDate = resolveEndDate(fields.endDate ?? "None", row[4]);
  let frequency = readFrequency(String(fields.frequency || "").trim() || row[3]);

  // A new title, Other Account, or type takes the days that were changed for this entry along (moveRecurringTemps)
  if (renamed && recurringTwin(oldTitle, oldSpecial, index) === -1) {
    moveRecurringTemps(cleanString(oldTitle), oldSpecial, title, newSpecial);
  }

  row[0] = title;
  row[1] = formatMoney(hasAmount ? fields.amount : parseAmount(row[1]));
  row[2] = formatToMMDDYYYY(startDate);
  row[3] = frequency;
  row[4] = endDate;
  row[5] = sprite;

  formEntryRow[2] = "✔️ Change Recurring";
  formEntryRow[3] = withoutPlaceholder(sprite) + " " + title + (isPlaceholder(sprite) ? " (Placeholder)" : "");
  formEntryRow[4] = frequency + ": " + showStoredDate(row[2]);
  formEntryRow[5] = "Expiration: " + showStoredDate(endDate);
  formEntryRow[6] = "New Amount: " + row[1];
  return {};
}

// End date as stored: a Date becomes MM/DD/YYYY, "None" clears it, null keeps the current one
function resolveEndDate(endDate, current) {
  if (endDate === "None") return "None";
  if (endDate instanceof Date && !isNaN(endDate.getTime())) return formatToMMDDYYYY(endDate);
  let currentText = String(current || "").trim();
  if (currentText === "" || currentText.toLowerCase() === "none") return "None";
  let parsed = createSafeMidnight(currentText, true);
  return isNaN(parsed.getTime()) ? "None" : formatToMMDDYYYY(parsed);
}

// A recurring entry given a new title or refraction type keeps the days it was changed on: from today on, its
// temps (on the calendar and in Upcoming) take the new title and type, $0.00 blockers too. Otherwise the
// entry would land on those days again under its new name, next to the old temp (counted twice), and on days
// it was deleted from. Days that already passed keep the name they had.
function moveRecurringTemps(oldClean, oldSpecial, newTitle, newSpecial) {
  // (A placeholder temp stays one)
  const isOldTemp = (sprite, title) => withoutPlaceholder(String(sprite ?? "").trim()) === oldSpecial + "✔️" && cleanString(title) === oldClean;
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 7; c++) {
      if (gridDates[r][c] < today) continue;
      let lines = String(calendarData[r][c]).split("\n");
      let moved = false;
      for (let l = 1; l < lines.length; l++) {
        let parts = getParts(lines[l]);
        if (parts.length < 3 || !isOldTemp(parts[0], parts.slice(2).join(" "))) continue;
        lines[l] = `${placeholderSprite(newSpecial + "✔️", isPlaceholder(parts[0]))} ${parts[1]} ${newTitle}`;
        moved = true;
      }
      if (moved) calendarData[r][c] = lines.join("\n");
    }
  }
  let movedUpcoming = false;
  for (let f = 1; f < futureData.length; f++) {
    let row = futureData[f];
    let date = createSafeMidnight(row[2], true);
    if (isNaN(date.getTime()) || date < today || !isOldTemp(row[3], row[0])) continue;
    row[0] = newTitle;
    row[3] = placeholderSprite(newSpecial + "✔️", isPlaceholder(row[3]));
    movedUpcoming = true;
  }
  if (movedUpcoming) combineSameUpcoming();
}

/* ---------- Tracker rows ---------- */

// Create a tracker row, or change the clicked one. A title can have two rows: one that counts transfers
// (⭕️ title prefix) and one that doesn't. A row that matches another's title and transfer setting is
// refused, and Costs, Gains, Transfers, and Undefined (which fill in by themselves) can't be made or renamed into.
// fields: { title, aliases: [{ title, count: "all" | "costs" | "gains" }], tracksTransfers: boolean (⭕️ title prefix) }
function trackerEntry(fields, index) {
  let baseTitle = capitalize(String(fields.title || "").replace(/⭕️/g, "").replace(/\s+/g, " ").trim());
  if (!baseTitle) throw new BudgetInputError("Give the tracker row a title.");
  let aliases = normalizeAliases(fields.aliases);
  let countsTransfers = !!fields.tracksTransfers;
  let fullTitle = (countsTransfers ? "⭕️" : "") + baseTitle;
  let isNew = index === null || index === undefined;
  let row = isNew ? null : trackerData[index];
  if (!isNew && (!row || String(row[0]).trim() === "-")) throw new BudgetInputError("That tracker row couldn't be found. Please try again.");

  // Gains, Costs, Transfers, and Undefined are filled in automatically
  if (row && TRACKER_AUTO_ROWS.includes(cleanString(row[0]))) {
    formEntryRow[3] = "Changed: " + row[0];
    formEntryRow[4] = "Aliases: " + (describeAliases(row[4]) || "None");
    return {};
  }
  if (TRACKER_AUTO_ROWS.includes(cleanString(baseTitle))) {
    throw new BudgetInputError("Costs, Gains, Transfers, and Undefined fill in by themselves, so pick another title.");
  }
  let twin = trackerData.findIndex((other, i) => i > 0 && other !== row && String(other[0]).trim() !== "-" &&
    cleanString(other[0]) === cleanString(baseTitle) && String(other[0]).trim().startsWith("⭕️") === countsTransfers);
  if (twin !== -1) {
    throw new BudgetInputError(`There's already a tracker row called ${trackerData[twin][0]}${countsTransfers ? " (it counts transfers)" : ""}. Tap that one in the list to change it.`);
  }

  if (row) {
    row[0] = fullTitle;
    row[4] = aliases;
    formEntryRow[3] = "Changed: " + row[0];
    formEntryRow[4] = "Aliases: " + (describeAliases(row[4]) || "None");
    return {};
  }

  trackerData.push([fullTitle, "", "", "", aliases]);
  formEntryRow[3] = "Created: " + fullTitle;
  formEntryRow[4] = "Aliases: " + (describeAliases(aliases) || "None");
  return {};
}

// An alias is an entry title plus which of its amounts it counts: All, only Costs, or only Gains (people only
// ever see those words: the tracker's buttons, and describeAliases). Inside the tracker table each one is
// stored the spreadsheet's way, a title with an ending: "rent-" counts costs,
// "paycheck+" gains, and "atm" (or "atm=") everything. A title that ends in one of those itself, like
// "Disney+", gets an ending of its own ("Disney+=") so it reads back as typed.
const ALIAS_SUFFIXES = { all: "", costs: "-", gains: "+" };

// "Rent-" -> { title: "Rent", clean: "rent", count: "costs" }. Without an ending, count is defaultCount.
function parseAlias(text, defaultCount = "all") {
  let trimmed = String(text ?? "").replace(/\s+/g, " ").trim();
  let suffix = /[-+=]$/.test(trimmed) ? trimmed.slice(-1) : "";
  let title = suffix ? trimmed.slice(0, -1).trim() : trimmed;
  let count = { "-": "costs", "+": "gains", "=": "all" }[suffix] || defaultCount;
  return { title, clean: cleanString(title), count };
}

// Does an alias with this count include this amount?
function aliasCounts(count, amount) {
  return count === "all" || (count === "costs" && amount < 0) || (count === "gains" && amount > 0);
}

// [{ title: "Rent", count: "costs" }, { title: "paycheck", count: "gains" }] -> "Rent-, paycheck+" (how the
// tracker table stores them). Blanks are left out, and each title is kept once (one picked for costs and gains
// counts all of it).
function normalizeAliases(list) {
  let byTitle = new Map();
  for (let alias of Array.isArray(list) ? list : []) {
    let title = String(alias?.title ?? "").replace(/\s+/g, " ").replace(/,/g, "").trim();
    let clean = cleanString(title);
    if (!clean) continue;
    let counted = byTitle.get(clean) || { title, costs: false, gains: false };
    if (alias.count !== "gains") counted.costs = true;
    if (alias.count !== "costs") counted.gains = true;
    byTitle.set(clean, counted);
  }
  return [...byTitle.values()].map(alias => {
    let count = alias.costs && alias.gains ? "all" : (alias.costs ? "costs" : "gains");
    let ending = ALIAS_SUFFIXES[count] || (/[-+=]$/.test(alias.title) ? "=" : "");
    return alias.title + ending;
  }).join(", ");
}

// "rent-, paycheck+, atm" -> "rent (costs), paycheck (gains), atm": aliases in words, for people
function describeAliases(text) {
  return String(text ?? "").split(",").map(alias => parseAlias(alias)).filter(alias => alias.clean)
    .map(alias => alias.count === "all" ? alias.title : `${alias.title} (${alias.count})`)
    .join(", ");
}

/* ---------- Other Accounts ---------- */
// Accounts outside the budget, like Savings. A Hidden or Transfer entry with the account picked ("Payday → Savings",
// see linkedAccount) moves money into or out of it (see accountChange):
//   - A Transfer moves money between the budget's account and this one, so the account gets the
//     opposite: a $100 Transfer cost takes $100 out of In Bank and puts $100 in the account.
//   - A Hidden entry happens in the account itself (In Bank never changes), so the account gets the
//     same amount: a $50 Hidden cost takes $50 out of it, and a $3,000 Hidden gain puts $3,000 in.
// An account's balance is its starting amount plus all of those changes, so changing, moving, or deleting one of
// its entries changes it too. Typing a balance on the Other Accounts page changes the starting amount (no entry
// is made). An account can also get interest each month (a credit card, or savings that earn it): see
// interestCredits. accountsData.list: [0] column titles, then [name, balance today (filled in by
// updateAccountBalances, so the Quick Entry page can show it), "default" | "", starting amount ("" is $0.00),
// interest rate (a year, in %; "" for none), the day interest started counting (MM/DD/YYYY)]. accountsData.coming:
// each account's changes after today, which the Quick Entry page counts once their day comes (see
// accountChangesAhead). accountsData.inBank: In Bank from today through the 28 days after the calendar, for the Quick
// Entry page (see inBankAhead). The default account, Savings, is always there and can't be deleted.

const ACCOUNTS_VERSION = 3;
const DEFAULT_ACCOUNT = "Savings";
const MAX_ACCOUNT_NAME = 60;

// The default account (Savings), which can't be deleted
function isDefaultAccount(row) {
  return String(row?.[2] ?? "").trim() === "default";
}

// The accounts (not the column titles), in order: [{ index, row, name, clean }]
function accountRows() {
  let accounts = [];
  let list = accountsData?.list || [];
  for (let i = 1; i < list.length; i++) {
    let name = String(list[i][0] ?? "").trim();
    let clean = cleanString(name);
    if (clean) accounts.push({ index: i, row: list[i], name, clean });
  }
  return accounts;
}

// The accounts in order with today's balances, for the account pickers: [{ name, balance }]
function otherAccounts() {
  return accountRows().map(account => ({ name: account.name, balance: parseAmount(account.row[1]) }));
}

// Each account's balance today goes in its row, and its changes still to come go with them (interest too), and so
// does In Bank from today on (the Quick Entry page can't add up the budget itself)
function updateAccountBalances() {
  const lastDay = addDays(gridEndDate, 28);
  const coming = accountChangesAhead();
  for (let summary of accountSummaries(lastDay)) {
    accountsData.list[summary.index][1] = formatMoney(summary.today);
    for (const credit of summary.interestCredits) {
      if (credit.date > today) coming.push([summary.name, formatToYMD(credit.date), credit.change]);
    }
  }
  coming.sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
  accountsData.coming = coming;
  accountsData.inBank = inBankAhead();
}

// In Bank on each day from today through the 28 days after the calendar: [["YYYY-MM-DD", amount], ...]. The Quick
// Entry page shows today's and the lowest from these (the API's readInBank adds the entries waiting for the budget).
function inBankAhead() {
  const days = [];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 7; c++) {
      const inBank = gridDates[r][c] >= today ? readInBank(calendarData[r][c]) : null;
      if (inBank !== null) days.push([formatToYMD(gridDates[r][c]), inBank]);
    }
  }
  for (const [day, inBank] of predictedInBank) days.push([formatToYMD(day), inBank]);
  return days;
}

// Each account's changes after today, for the Quick Entry page, which adds the ones whose day has come to the
// balances stored with them (the API's readAccounts), so a page opened days after the budget was last open is still
// right: the calendar's days after today as they are, then the 28 days after the calendar the way the daily update
// will fill them in (Upcoming entries, then recurring and connected spreadsheets' entries, which a day more than a
// month after today doesn't get: see FULL_CATCH_UP_MONTHS). [[account name, "YYYY-MM-DD", change], ...], by day.
function accountChangesAhead() {
  const accounts = accountTitleMap();
  const coming = [];
  const add = (cellText, day) => {
    for (const { account, change } of accountLineChanges(cellText, accounts)) {
      coming.push([account.name, formatToYMD(day), Math.round(change * 100) / 100]);
    }
  };
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 7; c++) if (gridDates[r][c] > today) add(calendarData[r][c], gridDates[r][c]);
  }
  const recurringRows = getParsedRecurringRows();
  const futureByDate = groupFutureRowsByDate();
  const lastDay = addDays(gridEndDate, 28);
  const sheetDays = sheetEntriesByDay(nextFourStart, lastDay);
  const fullUntil = fullCatchUpEnd(today);
  for (let day = nextFourStart; day <= lastDay; day = addDays(day, 1)) {
    add(dayAfterCalendar(day, recurringRows, futureByDate, sheetDays, day < fullUntil), day);
  }
  return coming;
}

// A day's lines that change an Other Account: [{ account, change, sprite, title }] (see linkedAccount and
// accountChange). accounts: accountTitleMap(), passed in by loops so it's built once.
function accountLineChanges(cellText, accounts = accountTitleMap()) {
  const changes = [];
  const lines = String(cellText ?? "").split("\n");
  for (let l = 1; l < lines.length; l++) {
    const line = readLine(lines[l]);
    if (!line.title || line.system) continue;
    const account = linkedAccount(line.sprite, line.title, accounts);
    const change = account ? accountChange(line.sprite, line.amount) : 0;
    if (account && change !== 0) changes.push({ account, change, sprite: line.sprite, title: line.title });
  }
  return changes;
}

// Clean account name -> its account (a Map, so names like "constructor" are just names)
function accountTitleMap() {
  let byTitle = new Map();
  for (let account of accountRows()) {
    if (!byTitle.has(account.clean)) byTitle.set(account.clean, account);
  }
  return byTitle;
}

// The account an entry changes, or null: a Hidden or Transfer entry with an Other Account picked, which is kept
// after its title ("Payday → Savings", or "→ Savings" with no title of its own). A title that's only an account's
// name ("Savings") isn't for the account. titleText: the title as written. accounts: accountTitleMap(), passed in
// by loops so it's built once.
function linkedAccount(sprite, titleText, accounts = accountTitleMap()) {
  let special = getSpecialType(String(sprite || ""));
  if (special !== "✖️" && special !== "⭕️") return null;
  const { account } = splitAccount(titleText);
  return account ? accounts.get(cleanString(account)) || null : null;
}

// How much an account entry changes its account: a Transfer the opposite of its amount (the money moved
// from or to In Bank), a Hidden entry its own amount (the money moved in the account itself). The API's
// readAccounts (src/quick.js) has to match it.
function accountChange(sprite, amount) {
  return getSpecialType(String(sprite || "")) === "⭕️" ? -amount : amount;
}

// Transfers move money between your own accounts (an Other Account's too), so they aren't costs or gains:
// the tracker only counts them in rows set to count transfers, Search starts them unchecked, and the
// recurring summary leaves them out. Hidden entries are costs and gains, even ones for an Other Account.
function isTransferEntry(sprite) {
  return getSpecialType(String(sprite || "")) === "⭕️";
}

// Each account's balance today, with the entries that changed it (and the ones on the calendar that will), newest
// first, and its interest (through interestUntil): [{ index, name, isDefault, start, interest ({ rate, since } or null),
// entriesToday (its entries through today, added up), today, entries: [{ date, change, sprite, title (its own, "" without
// one) }], interestCredits: [{ date, change }] oldest first }]
function accountSummaries(interestUntil = gridEndDate) {
  let accounts = accountTitleMap();
  let summaries = new Map(accountRows().map(account => [account.index, {
    index: account.index,
    name: account.name,
    isDefault: isDefaultAccount(account.row),
    start: accountStart(account.row),
    interest: accountInterest(account.row),
    entriesToday: 0,
    today: 0,
    entries: [],
    interestCredits: []
  }]));

  // dayOf(lines): the cell's day (only worked out for a cell with an account entry)
  const addCell = (cellText, dayOf) => {
    const changes = accountLineChanges(cellText, accounts);
    if (changes.length === 0) return;
    const date = dayOf(String(cellText ?? "").split("\n"));
    if (isNaN(date.getTime())) return;
    for (const { account, change, sprite, title } of changes) {
      summaries.get(account.index).entries.push({ date, change, sprite, title: splitAccount(title).title });
    }
  };
  for (let r = 3; r >= 0; r--) {
    for (let c = 6; c >= 0; c--) addCell(calendarData[r][c], () => gridDates[r][c]);
  }
  const historyDay = (lines) => createSafeMidnight(lines[0].trim(), true);
  for (let r = 1; r < historyData.length; r++) {
    for (let c = 6; c >= 0; c--) addCell(historyData[r][c], historyDay);
  }

  const round = (amount) => Math.round(amount * 100) / 100;
  const addUp = (list, through) => list.filter(item => item.date <= through).reduce((total, item) => total + item.change, 0);
  return [...summaries.values()].map(summary => {
    summary.entries.sort((a, b) => b.date - a.date);
    if (summary.interest) summary.interestCredits = interestCredits(summary.start, summary.entries, summary.interest, interestUntil);
    summary.entriesToday = round(addUp(summary.entries, today));
    summary.today = round(summary.start + summary.entriesToday + addUp(summary.interestCredits, today));
    return summary;
  });
}

// How far ahead Other Accounts looks ("In 6 Months")
const AHEAD_MONTHS = 6;

// The budget AHEAD_MONTHS from today: In Bank that day, and each Other Account's balance (its interest too), with the
// days after the calendar filled in the way the daily update will fill them (Upcoming entries, then recurring and
// connected spreadsheets' entries; see dayAfterCalendar). summaries: accountSummaries(). { inBank, accounts: Map(account
// row index -> balance) }
function budgetAhead(summaries) {
  const until = addMonths(today, AHEAD_MONTHS);
  const accounts = accountTitleMap();
  const coming = new Map(summaries.map(summary => [summary.index, []]));
  let inBank = readInBank(calendarData[3][6]) ?? 0;
  const recurringRows = getParsedRecurringRows();
  const futureByDate = groupFutureRowsByDate();
  const sheetDays = sheetEntriesByDay(nextFourStart, until);
  for (let day = nextFourStart; day <= until; day = addDays(day, 1)) {
    const text = dayAfterCalendar(day, recurringRows, futureByDate, sheetDays);
    inBank = Math.round((inBank + dayMath(text.split("\n")).bankChange) * 100) / 100;
    for (const { account, change } of accountLineChanges(text, accounts)) coming.get(account.index)?.push({ date: day, change });
  }
  const balances = new Map();
  for (const summary of summaries) {
    const entries = [...summary.entries, ...(coming.get(summary.index) || [])];
    const credits = summary.interest ? interestCredits(summary.start, entries, summary.interest, until) : [];
    const total = [...entries, ...credits].reduce((sum, item) => (item.date <= until ? sum + item.change : sum), 0);
    balances.set(summary.index, Math.round((summary.start + total) * 100) / 100);
  }
  return { inBank, accounts: balances };
}

// An account's starting amount (its row's [3]; blank is $0.00)
function accountStart(row) {
  const text = String(row?.[3] ?? "").trim();
  return text ? Math.round(parseAmount(text) * 100) / 100 : 0;
}

// An account's interest: { rate (a year, in %), since (the day it started counting) }, or null when it has none (its
// row's [4] and [5])
const MAX_INTEREST_RATE = 1000;
function accountInterest(row) {
  const rateText = String(row?.[4] ?? "").trim();
  const sinceText = String(row?.[5] ?? "").trim();
  const rate = Number(rateText);
  const since = sinceText ? createSafeMidnight(sinceText, true) : null;
  if (!rateText || !Number.isFinite(rate) || rate <= 0 || rate > MAX_INTEREST_RATE || !since || isNaN(since.getTime())) return null;
  return { rate, since };
}

// The interest an account gets, once a month on the day of the month it started counting (interest.since), from a
// month after that day through until: [{ date, change }], oldest first. Each one is the balance that morning (its
// starting amount, its entries before that day, and the interest before it) times a twelfth of the yearly rate, to the
// cent, so a balance below $0 (like a credit card's) goes further below, and one above $0 grows. Typing the account's
// balance or changing its interest starts it counting again from that day (accountEntry), so interest never counts
// twice.
function interestCredits(start, entries, interest, until) {
  const ordered = [...entries].sort((a, b) => a.date - b.date);
  const credits = [];
  let balance = start;
  let counted = 0; // Entries added into balance so far
  for (let month = 1; month <= 1200; month++) {
    const day = addMonths(interest.since, month);
    if (day > until) break;
    while (counted < ordered.length && ordered[counted].date < day) balance += ordered[counted++].change;
    const change = Math.round(balance * interest.rate / 12) / 100;
    if (change !== 0) credits.push({ date: day, change });
    balance += change;
  }
  return credits;
}

// New account (index null) or change the tapped one. fields: { name, balance (today's, a number; leave it out
// to keep it), interest ({ rate } a year in %, or null for none; leave it out to keep it) }. A new name goes on its
// entries and tracker aliases too, so they stay with it. A balance sets the starting amount so today's balance comes
// out to it (the entries stay as they are). A new balance or a new rate starts interest counting from today, with
// the interest so far kept in today's balance.
function accountEntry(fields, index) {
  let name = capitalize(String(fields.name || "").replace(/\s+/g, " ").trim());
  let clean = cleanString(name);
  if (!clean) throw new BudgetInputError("Give the account a name, like Cash or Investments.");
  if (name.length > MAX_ACCOUNT_NAME) throw new BudgetInputError(`Account names can be up to ${MAX_ACCOUNT_NAME} characters.`);
  // The arrow is what goes between an entry's title and its account ("Payday → Savings")
  if (name.includes(ACCOUNT_ARROW)) throw new BudgetInputError(`Account names can't have ${ACCOUNT_ARROW} in them.`);

  let list = accountsData.list;
  let isNew = index === null || index === undefined;
  let row = isNew ? null : list[index];
  if (!isNew && (!row || index < 1 || !cleanString(row[0]))) throw new BudgetInputError("That account couldn't be found. Please try again.");
  let taken = accountRows().find(account => account.clean === clean && account.row !== row);
  if (taken) throw new BudgetInputError(`You already have an account called ${taken.name}.`);

  let balance = fields.balance === undefined || fields.balance === null ? null : Number(fields.balance);
  if (balance !== null && !Number.isFinite(balance)) throw new BudgetInputError("Enter the balance, like 3000.00.");
  if (balance !== null && Math.abs(balance) > MAX_AMOUNT) throw new BudgetInputError(AMOUNT_TOO_BIG);
  if (balance !== null) balance = Math.round(balance * 100) / 100;
  let rate = fields.interest === undefined ? undefined : (fields.interest === null ? 0 : Number(fields.interest.rate));
  if (rate !== undefined && (!Number.isFinite(rate) || rate < 0 || rate > MAX_INTEREST_RATE)) {
    throw new BudgetInputError(`Enter the interest rate for a year, like 24.99 (up to ${MAX_INTEREST_RATE}).`);
  }
  if (rate !== undefined) rate = Math.round(rate * 1000) / 1000;

  formEntryRow[3] = "Account: " + name;
  formEntryRow[4] = "";
  formEntryRow[5] = "";
  if (isNew) {
    list.push([name, formatMoney(balance || 0), "", balance ? formatMoney(balance) : "", rate ? String(rate) : "", rate ? formatToMMDDYYYY(today) : ""]);
    formEntryRow[2] = "🏦 New Account";
    if (balance) formEntryRow[5] = "Balance: " + formatMoney(balance);
    if (rate) formEntryRow[6] = `Interest: ${rate}% a year`;
    return {};
  }
  let oldName = String(row[0]).trim();
  if (cleanString(oldName) !== clean) {
    refuseRecurringClash(cleanString(oldName), oldName, name);
    renameAccountEntries(cleanString(oldName), name);
    formEntryRow[4] = "Renamed From: " + oldName;
  }
  row[0] = name;
  formEntryRow[2] = "🏦 Change Account";
  const summary = accountSummaries().find(account => account.index === index);
  const now = summary ? summary.today : 0;
  const oldRate = summary && summary.interest ? summary.interest.rate : 0;
  const newRate = rate === undefined ? oldRate : rate;
  const balanceChanged = balance !== null && Math.abs(now - balance) >= 0.005;
  if (balanceChanged || newRate !== oldRate) {
    // Today's balance is the one typed (or stays what it is, interest so far and all), and interest counts from today
    const target = balanceChanged ? balance : now;
    const start = Math.round((target - (summary ? summary.entriesToday : 0)) * 100) / 100;
    row[3] = start ? formatMoney(start) : "";
    row[4] = newRate ? String(newRate) : "";
    row[5] = newRate ? formatToMMDDYYYY(today) : "";
    if (balanceChanged) formEntryRow[5] = `Balance: ${formatMoney(balance)} (was ${formatMoney(now)})`;
    if (newRate !== oldRate) formEntryRow[6] = newRate ? `Interest: ${newRate}% a year` : "Interest: Off";
  }
  return {};
}

// An entry's title with its Other Account's new name ("Payday → Savings" -> "Payday → Rainy Day"), or null when the
// entry isn't for that account (oldClean: the account's old name, as compared)
function renamedAccountTitle(sprite, text, oldClean, newName) {
  let special = getSpecialType(String(sprite || ""));
  if (special !== "✖️" && special !== "⭕️") return null;
  const { title, account } = splitAccount(text);
  return account && cleanString(account) === oldClean ? withAccount(title, newName) : null;
}

// Renaming an account renames its recurring entries too, so it's refused when that would make one match another
// recurring entry (like one still named for a deleted account with the new name). Two that already matched before
// (see recurringDuplicates) don't stop it.
function refuseRecurringClash(oldClean, oldName, newName) {
  let byKey = new Map(); // Title, account, and type after the rename -> the ones they were before it
  for (let i = 2; i < recurringData.length; i++) {
    let row = recurringData[i];
    if (!row || String(row[0]).trim() === "-" || !cleanString(row[0])) continue;
    let special = getSpecialType(String(row[5] || ""));
    let renamed = renamedAccountTitle(row[5], row[0], oldClean, newName);
    let before = cleanString(row[0]) + "|" + special;
    let after = cleanString(renamed ?? row[0]) + "|" + special;
    let known = byKey.get(after);
    if (known && !known.has(before)) {
      throw new BudgetInputError(`Renaming ${oldName} to ${newName} would make two ${REFRACTION_NAMES.get(special)} recurring entries called ${renamed ?? String(row[0]).trim()}. ${RECURRING_RULE}, so change or delete one of them on the Recurring Entries page first.`);
    }
    if (known) known.add(before);
    else byKey.set(after, new Set([before]));
  }
}

// A renamed account keeps its entries: Hidden and Transfer entries for it (on the calendar, in History, Upcoming,
// and Recurring) and tracker aliases for it get the new name
function renameAccountEntries(oldClean, newName) {
  const renamedTitle = (sprite, text) => renamedAccountTitle(sprite, text, oldClean, newName);
  const renameCell = (cellText) => {
    let lines = String(cellText ?? "").split("\n");
    let renamed = false;
    for (let l = 1; l < lines.length; l++) {
      let parts = getParts(lines[l]);
      const newTitle = parts.length >= 3 && !systemEmojis.includes(parts[0]) ? renamedTitle(parts[0], parts.slice(2).join(" ")) : null;
      if (newTitle === null) continue;
      lines[l] = `${parts[0]} ${parts[1]} ${newTitle}`;
      renamed = true;
    }
    return renamed ? combineSameEntries(lines).join("\n") : cellText;
  };

  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 7; c++) calendarData[r][c] = renameCell(calendarData[r][c]);
  }
  for (let r = 1; r < historyData.length; r++) {
    for (let c = 0; c < 7; c++) historyData[r][c] = renameCell(historyData[r][c]);
  }

  // Upcoming: rename, then combine any that now match another entry on the same day
  for (let f = 1; f < futureData.length; f++) {
    const newTitle = renamedTitle(futureData[f][3], futureData[f][0]);
    if (newTitle !== null) futureData[f][0] = newTitle;
  }
  combineSameUpcoming();

  for (let i = 2; i < recurringData.length; i++) {
    let row = recurringData[i];
    const newTitle = String(row[0]).trim() !== "-" ? renamedTitle(row[5], row[0]) : null;
    if (newTitle !== null) row[0] = newTitle;
  }

  for (let i = 1; i < trackerData.length; i++) {
    let row = trackerData[i];
    let rowType = cleanString(row[0]);
    if (String(row[0]).trim() === "-" || TRACKER_AUTO_ROWS.includes(rowType)) continue;
    let aliases = String(row[4] || "").split(",").map(alias => parseAlias(alias)).filter(alias => alias.clean);
    if (!aliases.some(alias => alias.clean === oldClean)) continue;
    row[4] = normalizeAliases(aliases.map(alias => ({ title: alias.clean === oldClean ? newName : alias.title, count: alias.count })));
  }

  // Connected spreadsheets: one set up with this account typed in (for every entry) follows it, so the next read
  // still finds the account. The entries each one read last move with it too. (One whose cells name the account
  // needs those cells changed: its Needs a look says so.)
  const typed = (field) => !!field && typeof field === "object" && typeof field.range !== "string";
  for (let connection of sheetsData?.list || []) {
    let fields = connection.fields || {};
    if (typed(fields.account) && cleanString(fields.account.value) === oldClean) fields.account.value = newName;
    if (connection.entries.some(entry => renamedTitle(entry[1], entry[3]) !== null)) {
      connection.entries = connection.entries.map(entry => {
        const newTitle = renamedTitle(entry[1], entry[3]);
        return newTitle === null ? entry : [entry[0], entry[1], entry[2], newTitle];
      });
    }
  }
}

// A day has at most one entry per title and refraction type (so a title shows up at most three times:
// Regular, Hidden, and Transfer). A new entry combines with the one that's there (see injectOrDefer);
// this combines any that slipped in another way, like an account rename or older data. Amounts add
// together, the checkmark stays if either had one (like writeRecurring combining into a unique), and it's a
// placeholder only if both were.
function combineSameEntries(lines) {
  let kept = [lines[0]];
  let byKey = new Map();
  for (let l = 1; l < lines.length; l++) {
    let parts = getParts(lines[l]);
    if (parts.length < 3 || systemEmojis.includes(parts[0])) {
      kept.push(lines[l]);
      continue;
    }
    let key = getSpecialType(parts[0]) + "|" + extractTitle(lines[l]);
    if (!byKey.has(key)) {
      byKey.set(key, kept.length);
      kept.push(lines[l]);
      continue;
    }
    let at = byKey.get(key);
    let first = getParts(kept[at]);
    let sprite = placeholderSprite(combineSprites(first[0], parts[0]), isPlaceholder(first[0]) && isPlaceholder(parts[0]));
    kept[at] = `${sprite} ${formatMoney(parseAmount(first[1]) + parseAmount(parts[1]))} ${first.slice(2).join(" ")}`;
  }
  return kept;
}

// The same for Upcoming: entries on one day with the same title and type become one, their amounts added (a
// placeholder only if both were)
function combineSameUpcoming() {
  let kept = [futureData[0]];
  let byKey = new Map();
  for (let f = 1; f < futureData.length; f++) {
    let row = futureData[f];
    let key = String(row[2]).trim() + "|" + cleanString(row[0]) + "|" + withoutPlaceholder(String(row[3]).trim());
    let same = cleanString(row[0]) ? byKey.get(key) : undefined;
    if (same) {
      same[1] = formatMoney(parseAmount(same[1]) + parseAmount(row[1]));
      if (!isPlaceholder(row[3])) same[3] = withoutPlaceholder(same[3]);
      continue;
    }
    byKey.set(key, row);
    kept.push(row);
  }
  futureData = kept;
}

/* ---------- Connected spreadsheets ---------- */
// Entries from the person's own spreadsheets (Google Sheets, Excel, ...), set up on the Spreadsheets page. Each one says
// which cells hold the dates (always from the spreadsheet), and where the titles, amounts, refraction types,
// and Other Accounts come from: cells too, or one typed in for all of them. Spreadsheets.js reads them (each
// time Home or Settings opens) into entries kept here, and the budget writes those onto the calendar the same
// way it writes recurring entries:
//   - From today on, on the calendar only, behind a ➕ (➕❗️ Regular, ➕✖️ Hidden, ➕⭕️ Transfer), taken off
//     and written again with every change, so a spreadsheet that changes an entry or drops one changes the
//     calendar too
//   - Changing one for its day (or deleting it) makes a temp, like ❗️➕, that keeps the spreadsheet's entry
//     off that day; a unique entry with its title and type takes in its amount (it becomes a temp)
//   - Once a day passes its entries stay as they were (they turn into temps, see performDailyUpdate)
//   - The next 28 days after the calendar, Lowest, Search, reminders, and Dave count them too
// A day has one entry per title and type, so an entry with the title and type of a recurring entry that lands
// the same day is left out (the Spreadsheets page says so). A spreadsheet that's off keeps its entries (it's read again
// when it's turned back on) and its temps; deleting one turns its temps from today on into unique entries.
// sheetsData.list: [{ id, name, link, on, fields, entries: [[MM/DD/YYYY, type, amount, title]], problems: [text],
// tabs: [tab names], access: "public" | "shared" }]. fields: { date, title, amount, type, account }, each
// { tab, range: "B2:B50" } (cells; amount adds sign: "written" | "costs" | "gains") or { value } (typed).

const SHEETS_VERSION = 1;
const MAX_SHEETS = 10;
const MAX_SHEET_NAME = 60;

// The stored connected spreadsheets, checked and tidied: { version, list }
function normalizeApiSheets(rawData) {
  let parsed = rawData;
  if (typeof parsed === "string") {
    try { parsed = JSON.parse(parsed); } catch (e) { parsed = null; }
  }
  const list = parsed && Array.isArray(parsed.list) ? parsed.list : [];
  return { version: SHEETS_VERSION, list: list.filter(item => item && typeof item === "object" && typeof item.id === "string" && item.id).map(normalizeSheetConnection) };
}

// One connection, with only what it should have (and always in the same order, so comparing copies works)
function normalizeSheetConnection(item) {
  const text = (value, max) => String(value ?? "").slice(0, max);
  const isObject = (value) => !!value && typeof value === "object" && !Array.isArray(value);
  return {
    id: text(item.id, 40),
    name: text(item.name, MAX_SHEET_NAME).trim() || "Spreadsheet",
    link: text(item.link, 2000).trim(),
    on: item.on !== false,
    fields: isObject(item.fields) ? JSON.parse(JSON.stringify(item.fields)) : {},
    entries: (Array.isArray(item.entries) ? item.entries : [])
      .filter(entry => Array.isArray(entry) && entry.length >= 4)
      .map(entry => [text(entry[0], 10), getSpecialType(text(entry[1], 8)), Math.round((Number(entry[2]) || 0) * 100) / 100, text(entry[3], MAX_ENTRY_TITLE)])
      .filter(entry => Math.abs(entry[2]) <= MAX_AMOUNT), // Spreadsheets.js never reads a bigger one
    problems: (Array.isArray(item.problems) ? item.problems : []).map(problem => text(problem, 500)).slice(0, 50),
    tabs: (Array.isArray(item.tabs) ? item.tabs : []).map(tab => text(tab, 100)).slice(0, 200),
    access: item.access === "shared" ? "shared" : "public",
    ...(item.placeholder === true ? { placeholder: true } : {}) // Its entries are placeholders
  };
}

// The connection with this ID, or null
function sheetConnectionById(id) {
  return (sheetsData?.list || []).find(connection => connection.id === id) || null;
}

// New (id null) or changed connection. config: { name, link, fields, placeholder (its entries are placeholders) };
// read: { entries, problems, tabs, access }, what reading it just now found (Spreadsheets.js readConnection)
function sheetConnection(config, read, id) {
  const list = sheetsData.list;
  const name = String(config.name || "").replace(/\s+/g, " ").trim();
  if (!name) throw new BudgetInputError("Give the spreadsheet a name.");
  if (name.length > MAX_SHEET_NAME) throw new BudgetInputError(`Spreadsheet names can be up to ${MAX_SHEET_NAME} characters.`);
  if (!String(config.link || "").trim()) throw new BudgetInputError("Paste the spreadsheet's link.");
  let index = id ? list.findIndex(connection => connection.id === id) : -1;
  if (id && index === -1) throw new BudgetInputError("That spreadsheet couldn't be found. Please try again.");
  if (!id && list.length >= MAX_SHEETS) throw new BudgetInputError(`You can connect up to ${MAX_SHEETS} spreadsheets.`);
  const old = index === -1 ? null : list[index];
  const connection = normalizeSheetConnection({
    id: old ? old.id : newSheetId(),
    name,
    link: config.link,
    on: old ? old.on : true,
    fields: config.fields,
    entries: read.entries,
    problems: read.problems,
    tabs: read.tabs,
    access: read.access,
    placeholder: config.placeholder === undefined ? !!old?.placeholder : config.placeholder === true
  });
  if (old) list[index] = connection;
  else list.push(connection);

  formEntryRow[2] = old ? "➕ Change Spreadsheet" : "➕ Connect Spreadsheet";
  formEntryRow[3] = "Spreadsheet: " + name + (connection.placeholder ? " (Placeholders)" : "");
  formEntryRow[4] = "Entries: " + connection.entries.length;
  formEntryRow[5] = "Problems: " + connection.problems.length;
  return { sheetId: connection.id };
}

// A connection on or off (off takes its entries off the calendar)
function switchSheet(id, on) {
  const connection = sheetConnectionById(id);
  if (!connection) throw new BudgetInputError("That spreadsheet couldn't be found. Please try again.");
  connection.on = !!on;
  formEntryRow[2] = on ? "➕ Spreadsheet On" : "➕ Spreadsheet Off";
  formEntryRow[3] = "Spreadsheet: " + connection.name;
  return {};
}

// Delete a connection (releaseSheetTemps then lets go of its temps from today on)
function removeSheet(id) {
  const connection = sheetConnectionById(id);
  if (!connection) throw new BudgetInputError("That spreadsheet couldn't be found. Please try again.");
  sheetsData.list = sheetsData.list.filter(item => item !== connection);
  formEntryRow[2] = "➕ Delete Spreadsheet";
  formEntryRow[3] = "Spreadsheet: " + connection.name;
  return {};
}

// What reading the spreadsheets just now found: [{ id, entries, problems, tabs, access }], or { id, failed }
// (couldn't read it: it keeps its entries, and says why)
function applySheetReads(reads) {
  const names = [];
  for (const read of Array.isArray(reads) ? reads : []) {
    const connection = sheetConnectionById(read.id);
    if (!connection) continue;
    const updated = read.failed
      ? normalizeSheetConnection({ ...connection, problems: [read.failed] })
      : normalizeSheetConnection({ ...connection, entries: read.entries, problems: read.problems, tabs: read.tabs, access: read.access });
    if (JSON.stringify(updated) === JSON.stringify(connection)) continue;
    sheetsData.list[sheetsData.list.indexOf(connection)] = updated;
    names.push(connection.name);
  }
  formEntryRow[2] = "➕ Spreadsheet Update";
  formEntryRow[3] = "Updated: " + (names.join(", ") || "None");
  return {};
}

// A random ID for a new connection (12 hex digits)
function newSheetId() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

// The spreadsheets' entries from day from through day to, by day: Map(day's time -> Map(clean title|type ->
// { title, clean, special, amount, placeholder })). Entries with the same title and type on a day are one (amounts
// added; a placeholder only if every one is, see the connection's placeholder). Only spreadsheets that are on, without
// the entries a recurring entry keeps off (see above), unless everything is asked for (includeOff: what can still land,
// for releaseSheetTemps).
function sheetEntriesByDay(from, to, includeOff = false) {
  const days = new Map();
  if (!sheetsData || to < from) return days;
  const fromTime = from.getTime();
  const toTime = to.getTime();
  for (const connection of sheetsData.list) {
    if (!connection.on && !includeOff) continue;
    const placeholder = connection.placeholder === true;
    for (const { date, time, title, clean, special, amount } of parsedSheetEntries(connection)) {
      if (time < fromTime || time > toTime) continue;
      if (!includeOff && recurringHits(title, date, special) !== false) continue;
      if (!days.has(time)) days.set(time, new Map());
      const day = days.get(time);
      const key = clean + "|" + special;
      const same = day.get(key);
      if (same) {
        same.amount = Math.round((same.amount + amount) * 100) / 100;
        same.placeholder = same.placeholder && placeholder;
      } else {
        day.set(key, { title, clean, special, amount, placeholder });
      }
    }
  }
  return days;
}

// A connection's entries read once (each date as its day, each title as it's compared), and again only once
// they change (reading the spreadsheet again, or a change being rolled back, makes a new list). Entries
// without a real date or a title are left out.
const parsedSheetCache = new WeakMap();
function parsedSheetEntries(connection) {
  let parsed = parsedSheetCache.get(connection.entries);
  if (parsed) return parsed;
  parsed = [];
  for (const [dateText, sprite, amount, title] of connection.entries) {
    const date = createSafeMidnight(dateText, true);
    const clean = cleanString(title);
    if (!isNaN(date.getTime()) && clean) parsed.push({ date, time: date.getTime(), title, clean, special: getSpecialType(sprite), amount });
  }
  parsedSheetCache.set(connection.entries, parsed);
  return parsed;
}

// The spreadsheets' entries that land on date (one per title and type), for unique(): the one with this
// title (and type, when it's given) as { amount, sprite: "➕❗️" (with ⏳ for a placeholder), mark: "➕" }, or null. From
// today on only.
function sheetHit(title, date, special = null) {
  if (date < today) return null;
  const day = sheetEntriesByDay(date, date).get(date.getTime());
  if (!day) return null;
  const clean = cleanString(title);
  for (const entry of day.values()) {
    if (entry.clean === clean && (!special || entry.special === special)) return { amount: entry.amount, sprite: placeholderSprite(SHEET_MARK + entry.special, entry.placeholder), mark: SHEET_MARK };
  }
  return null;
}

// What lands on date by itself with this title (and type): a recurring entry first, then a spreadsheet's.
// mark limits it to one or the other. { amount, sprite, mark } or null.
function scheduledHit(title, date, special = null, mark = null) {
  if (mark !== SHEET_MARK) {
    const index = recurringHits(title, date, special);
    if (index !== false) return { amount: parseAmount(String(recurringData[index][1])), sprite: String(recurringData[index][5] || RECURRING_MARK), mark: RECURRING_MARK };
  }
  return mark === RECURRING_MARK ? null : sheetHit(title, date, special);
}

// Write the spreadsheets' entries onto every calendar day from today on
function writeSheetEntries() {
  const days = sheetEntriesByDay(today, gridEndDate);
  if (days.size === 0) return;
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 7; c++) {
      const day = days.get(gridDates[r][c].getTime());
      if (day) calendarData[r][c] = writeSheetsToCell(calendarData[r][c], day);
    }
  }
}

// One day's spreadsheet entries (a Map from sheetEntriesByDay) written into its cell: a temp with its title
// and type (or a recurring entry's) keeps one off, and a unique entry takes in its amount (it's a placeholder then only
// if both are)
function writeSheetsToCell(cellText, day) {
  if (!day || day.size === 0) return cellText;
  const lines = String(cellText).split("\n");
  for (const entry of day.values()) {
    const at = lines.findIndex((line, l) => {
      if (l === 0) return false;
      const read = readLine(line);
      return !read.system && read.clean === entry.clean && getSpecialType(read.sprite) === entry.special;
    });
    if (at === -1) {
      lines.push(`${placeholderSprite(SHEET_MARK + entry.special, entry.placeholder)} ${formatMoney(entry.amount)} ${entry.title}`);
      continue;
    }
    const line = readLine(lines[at]);
    if (entryMark(line.sprite)) continue;
    lines[at] = `${placeholderSprite(entry.special + SHEET_MARK, entry.placeholder && isPlaceholder(line.sprite))} ${formatMoney(line.amount + entry.amount)} ${line.title}`;
  }
  return lines.join("\n");
}

// A spreadsheet temp (like ❗️➕) only keeps its entry off its day. Once no connected spreadsheet has that title
// and type anymore (it was deleted, or the spreadsheet dropped it), its temps from today on (on the calendar
// and in Upcoming) are just unique entries: they lose their ➕, and a $0.00 one (which only held the day) goes
// away. Days that already passed keep theirs.
function releaseSheetTemps() {
  const known = new Set();
  for (const connection of sheetsData?.list || []) {
    for (const entry of parsedSheetEntries(connection)) known.add(entry.clean + "|" + entry.special);
  }
  // (A placeholder stays one)
  const isReleased = (sprite, title) => {
    const special = getSpecialType(sprite);
    return withoutPlaceholder(String(sprite).trim()) === special + SHEET_MARK && !known.has(cleanString(title) + "|" + special);
  };
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 7; c++) {
      if (gridDates[r][c] < today) continue;
      let lines = String(calendarData[r][c]).split("\n");
      let changed = false;
      for (let l = lines.length - 1; l >= 1; l--) {
        const parts = getParts(lines[l]);
        if (parts.length < 3 || !isReleased(parts[0], parts.slice(2).join(" "))) continue;
        if (parseAmount(parts[1]) === 0) lines.splice(l, 1);
        else lines[l] = [placeholderSprite(getSpecialType(parts[0]), isPlaceholder(parts[0])), ...parts.slice(1)].join(" ");
        changed = true;
      }
      if (changed) calendarData[r][c] = lines.join("\n");
    }
  }
  for (let f = futureData.length - 1; f >= 1; f--) {
    const row = futureData[f];
    const date = createSafeMidnight(row[2], true);
    if (isNaN(date.getTime()) || date < today || !isReleased(row[3], row[0])) continue;
    if (parseAmount(row[1]) === 0) futureData.splice(f, 1);
    else row[3] = placeholderSprite(getSpecialType(String(row[3])), isPlaceholder(row[3]));
  }
}

// How a spreadsheet's entries ([[MM/DD/YYYY, type, amount, title]]) land from today on, for Settings:
// { landing: how many, keptOff: the ones a recurring entry keeps off (same title, type, and day), like
// ["Rent on 10/20"] }
function sheetLanding(entries) {
  const result = { landing: 0, keptOff: [] };
  for (const [dateText, sprite, , title] of entries) {
    const date = createSafeMidnight(dateText, true);
    if (isNaN(date.getTime()) || date < today) continue;
    if (recurringHits(title, date, getSpecialType(sprite)) !== false) result.keptOff.push(`${title} on ${showDay(date)}`);
    else result.landing++;
  }
  return result;
}

// The spreadsheets' costs that are "uncommon" for Dave's savings tip, like a recurring entry that lands every
// 3 months or less often: no entry with its title and type comes 90 days before or after it. Keys:
// "day's time|clean title|type".
function uncommonSheetKeys() {
  const keys = new Set();
  const byTitle = new Map();
  for (const [time, day] of sheetEntriesByDay(addDays(today, -400), addDays(today, 800))) {
    for (const entry of day.values()) {
      const key = entry.clean + "|" + entry.special;
      if (!byTitle.has(key)) byTitle.set(key, []);
      byTitle.get(key).push(time);
    }
  }
  const span = 90 * 86400000;
  for (const [key, times] of byTitle) {
    times.sort((a, b) => a - b);
    times.forEach((time, i) => {
      const near = (i > 0 && time - times[i - 1] < span) || (i < times.length - 1 && times[i + 1] - time < span);
      if (!near) keys.add(time + "|" + key);
    });
  }
  return keys;
}

/* ---------- Edit mode: reorder, sections, delete (Recurring, Tracker, and Other Accounts) ---------- */

// order: row indexes top to bottom. Rows left out (blank rows the page doesn't show) stay at the end.
function reorderTableRows(tableName, order, movedIndex) {
  let table = ROW_TABLES[tableName];
  let rows = table.get();
  let seen = new Set();
  let reordered = [];
  for (let i of order) {
    if (Number.isInteger(i) && i >= table.headerRows && i < rows.length && !seen.has(i)) {
      seen.add(i);
      reordered.push(rows[i]);
    }
  }
  for (let i = table.headerRows; i < rows.length; i++) {
    if (!seen.has(i)) reordered.push(rows[i]);
  }
  let movedRow = rows[movedIndex];
  table.set([...rows.slice(0, table.headerRows), ...reordered]);

  if (movedRow) {
    let newIndex = table.get().indexOf(movedRow);
    formEntryRow[3] = "Moved: " + (String(movedRow[0]).trim() === "-" ? movedRow[1] : movedRow[0]);
    formEntryRow[4] = "To Row: " + (newIndex + 1);
  }
  return {};
}

// Edit mode: add a section heading before row atIndex
function insertCategory(tableName, atIndex, title) {
  let table = ROW_TABLES[tableName];
  if (!table.categoryRow) throw new BudgetInputError("Sections can't be added here.");
  let rows = table.get();
  let cleanTitle = capitalize(String(title || "").replace(/\s+/g, " ").trim());
  if (!cleanTitle) throw new BudgetInputError("Give the section a title.");
  let at = Math.min(Math.max(Number.isInteger(atIndex) ? atIndex : rows.length, table.headerRows), rows.length);
  rows.splice(at, 0, table.categoryRow(cleanTitle));
  formEntryRow[4] = "Created: " + cleanTitle;
  formEntryRow[5] = "At Row: " + (at + 1);
  return {};
}

// Rename the section heading at index
function renameCategory(tableName, index, title) {
  let rows = ROW_TABLES[tableName].get();
  let row = rows[index];
  if (!row || String(row[0]).trim() !== "-") throw new BudgetInputError("That section couldn't be found. Please try again.");
  let cleanTitle = capitalize(String(title || "").replace(/\s+/g, " ").trim());
  if (!cleanTitle) throw new BudgetInputError("Give the section a title.");
  formEntryRow[4] = "Renamed: " + row[1];
  formEntryRow[5] = "To: " + cleanTitle;
  row[1] = cleanTitle;
  return {};
}

// Recurring entries end yesterday instead of vanishing, so the normal flow removes them and turns
// their temps into unique entries (same as expiring one in the spreadsheet). Everything else is removed.
// The default account (Savings) and the tracker rows that fill in by themselves (Costs, Gains, Transfers,
// Undefined) can't be deleted; a deleted account's entries stay as they are.
function deleteTableRows(tableName, indexes) {
  let table = ROW_TABLES[tableName];
  let rows = table.get();
  let valid = [...new Set(indexes)]
    .filter(i => Number.isInteger(i) && i >= table.headerRows && i < rows.length)
    .sort((a, b) => b - a);
  if (valid.length === 0) throw new BudgetInputError("Nothing is selected to delete.");
  let locked = tableName === "accounts" ? valid.find(i => isDefaultAccount(rows[i])) : undefined;
  if (locked !== undefined) throw new BudgetInputError(`${rows[locked][0]} is your default account, so it can't be deleted.`);
  let automatic = tableName === "tracker" ? valid.find(i => TRACKER_AUTO_ROWS.includes(cleanString(rows[i][0]))) : undefined;
  if (automatic !== undefined) throw new BudgetInputError(`${String(rows[automatic][0]).trim()} fills in by itself, so it can't be deleted.`);

  let titles = [];
  for (let i of valid) {
    let row = rows[i];
    let isCategory = String(row[0]).trim() === "-";
    titles.unshift(isCategory ? row[1] : row[0]);
    if (tableName === "recurring" && !isCategory) {
      row[4] = formatToMMDDYYYY(yesterday);
      continue;
    }
    rows.splice(i, 1);
  }
  formEntryRow[3] = "Deleted: " + titles.join(", ");
  formEntryRow[4] = "Rows: " + valid.length;
  return {};
}

/* ---------- Search (the old Search tab, now the home page's search box) ---------- */

// Find entries by title and date in History, the calendar, Future Dates, and recurring entries and connected
// spreadsheets' entries past the calendar. terms: the search bar's list, one title per line, each with its own buttons (which
// replace the spreadsheet's rent-, rent+ and car stuff=): match "all", "costs" (only costs), "gains"
// (only gains), or "category" (the title is a tracker row: find what the row counts). A title that isn't
// exact finds every title with it in it ("gas" finds Gas Station); an exact one only itself. With no titles,
// the first line's buttons pick everything, every cost, or every gain. Blank From = from the start,
// blank To = a month after today (or after From).
// query: { terms: [{ title, match, exact }], from, to } as typed.
// Returns { results: [{ date, amount, sprite, title, isTransfer, checked }], from, to, searchingFor }
// calendar: the calendar's days as they show, recurring entries included (see searchBudget)
function search(query, calendar = calendarData) {
  // 1. Date range
  let rawFrom = String(query.from || "").trim();
  let rawTo = String(query.to || "").trim();
  let fromDate = rawFrom ? parseTypedDate(rawFrom) : null;
  let toDate = rawTo ? parseTypedDate(rawTo) : null;
  if ((fromDate && isNaN(fromDate.getTime())) || (toDate && isNaN(toDate.getTime()))) {
    throw new BudgetInputError(`Search dates should look like ${datePattern()}.`);
  }
  // Without a To date, it looks a month ahead (from today, or from the From date when that's later), so what's
  // still to come shows too: Upcoming, and recurring and connected spreadsheets' entries past the calendar
  if (!toDate) toDate = addMonths(fromDate && fromDate > today ? fromDate : today, 1);
  if (fromDate && toDate && fromDate.getTime() > toDate.getTime()) [fromDate, toDate] = [toDate, fromDate];
  let startTime = fromDate ? fromDate.getTime() : -Infinity;
  let endTime = toDate.getTime();
  let dateA = fromDate ? showDate(fromDate) : "the start";
  let dateB = showDate(toDate);
  const inRange = (time) => time >= startTime && time <= endTime;

  // 2. What to find: targets for one title each (or every title), and whose amounts they count
  let { targets, searchingFor } = searchTargets(query.terms);
  let targetsByTitle = new Map();
  let everyTitle = [];
  let partTitles = []; // Titles that aren't Exact: any title with them in it
  for (let target of targets) {
    if (target.clean === null) everyTitle.push(target);
    else if (!target.exact) partTitles.push(target);
    else targetsByTitle.set(target.clean, [...(targetsByTitle.get(target.clean) || []), target]);
  }

  // Filters: one refraction type ("❗️", "✖️", or "⭕️"; "" is any), and one Other Account (its name, "none" for
  // entries without one, or "" for any)
  let onlyType = ["❗️", "✖️", "⭕️"].includes(query.type) ? query.type : "";
  let accounts = accountTitleMap();
  let onlyAccount = String(query.account || "").trim();
  let accountFilter = onlyAccount === "none" ? "none" : onlyAccount ? accounts.get(cleanString(onlyAccount)) || null : "";
  if (accountFilter === null) throw new BudgetInputError(`There's no Other Account called "${onlyAccount}".`);
  if (onlyType) searchingFor += ` (${REFRACTION_NAMES.get(onlyType)} only)`;
  if (accountFilter === "none") searchingFor += ", with no Other Account";
  else if (accountFilter) searchingFor += `, for ${accountFilter.name}`;

  // An entry is found when a target for its title counts its amount: "Payday → Savings" is found by Payday,
  // Savings, or the whole thing. Transfers start unchecked, unless a tracker row that counts transfers found them.
  let searchResults = [];
  const addIfFound = (date, amount, sprite, title) => {
    if (onlyType && getSpecialType(String(sprite || "")) !== onlyType) return;
    if (accountFilter) {
      let linked = linkedAccount(sprite, title, accounts);
      if (accountFilter === "none" ? linked : linked !== accountFilter) return;
    }
    let isTransfer = isTransferEntry(sprite);
    let { title: own, account } = splitAccount(title);
    let keys = new Set(account ? [cleanString(title), cleanString(own), cleanString(account)] : [cleanString(title)]);
    let named = [...keys].flatMap(key => targetsByTitle.get(key) || []);
    for (let target of partTitles) {
      if ([...keys].some(key => key.includes(target.clean))) named.push(target);
    }
    let found = [...everyTitle, ...new Set(named)].filter(target => aliasCounts(target.count, amount) && (!target.onlyTransfers || isTransfer));
    if (found.length === 0) return;
    searchResults.push({ date, amount, sprite, title, isTransfer, checked: !isTransfer || found.some(target => target.withTransfers) });
  };

  // 3. Future Dates entries
  for (let i = futureData.length - 1; i >= 1; i--) {
    let row = futureData[i];
    if (!row || !String(row[0]).trim()) continue;
    let cellDate = createSafeMidnight(row[2], true);
    if (isNaN(cellDate.getTime()) || !inRange(cellDate.getTime())) continue;
    addIfFound(cellDate, parseAmount(row[1]), String(row[3] || ""), String(row[0]));
  }

  // 4. Recurring entries and spreadsheets' entries past the calendar (calendar days are searched directly
  //    below), skipping days a Future Dates temp blocks. Projected up to two years ahead.
  if (toDate.getTime() > gridEndDate.getTime()) {
    let lastDay = new Date(Math.min(toDate.getTime(), addDays(today, 730).getTime()));
    let firstDay = addDays(gridEndDate, 1);
    if (fromDate && fromDate.getTime() > firstDay.getTime()) firstDay = fromDate;
    let recurringRows = getParsedRecurringRows();
    let sheetDays = sheetEntriesByDay(firstDay, lastDay);
    let blockers = new Set();
    for (let f = 1; f < futureData.length; f++) {
      let futureSprite = String(futureData[f][3] || "");
      if (!entryMark(futureSprite)) continue;
      let blockDate = createSafeMidnight(futureData[f][2], true);
      if (!isNaN(blockDate.getTime())) {
        blockers.add(blockDate.getTime() + "|" + cleanString(futureData[f][0]) + "|" + getSpecialType(futureSprite));
      }
    }
    for (let day = lastDay; day.getTime() >= firstDay.getTime(); day = addDays(day, -1)) {
      let shown = new Set(); // Like recurringHits: one entry per title + refraction type per day
      for (let row of recurringRows) {
        let key = row.parsed.cleanTitle + "|" + row.parsed.special;
        if (shown.has(key) || !recurringRowHits(row.parsed, day)) continue;
        shown.add(key);
        if (blockers.has(day.getTime() + "|" + key)) continue;
        addIfFound(new Date(day), row.amt, String(row.sprite || ""), row.title);
      }
      for (let entry of sheetDays.get(day.getTime())?.values() || []) {
        if (blockers.has(day.getTime() + "|" + entry.clean + "|" + entry.special)) continue;
        addIfFound(new Date(day), entry.amount, SHEET_MARK + entry.special, entry.title);
      }
    }
  }

  // 5. Calendar and 6. History entries
  const searchCellLines = (cellText, cellDate) => {
    let lines = String(cellText).split("\n");
    for (let l = 1; l < lines.length; l++) {
      const line = readLine(lines[l]);
      if (line.system || !line.title) continue;
      addIfFound(cellDate, line.amount, line.sprite, line.title);
    }
  };
  for (let r = 3; r >= 0; r--) {
    for (let c = 6; c >= 0; c--) {
      if (inRange(gridDates[r][c].getTime())) searchCellLines(calendar[r][c], gridDates[r][c]);
    }
  }
  for (let r = 1; r < historyData.length; r++) {
    for (let c = 6; c >= 0; c--) {
      if (!historyData[r][c]) continue;
      let cellDate = createSafeMidnight(String(historyData[r][c]).split("\n")[0].trim(), true);
      if (!isNaN(cellDate.getTime()) && inRange(cellDate.getTime())) searchCellLines(historyData[r][c], cellDate);
    }
  }

  // 7. Newest first
  searchResults.sort((a, b) => b.date - a.date);

  formEntryRow[2] = "🔎 Search";
  formEntryRow[3] = "For: " + searchingFor;
  formEntryRow[4] = "From: " + dateA;
  formEntryRow[5] = "To: " + dateB;
  formEntryRow[6] = "Results Found: " + searchResults.length;
  return { results: searchResults, from: dateA, to: dateB, searchingFor };
}

// What a search looks for: { targets: [{ clean (null = every title), count: "all" | "costs" | "gains",
// withTransfers, exact }], searchingFor: "rent (costs only), the Food tracker row" }. See search() for terms.
const SEARCH_MATCHES = ["all", "costs", "gains", "category"];
// How Search suggests a tracker row that counts transfers ("Food (counts transfers)"): a suggestion list can't
// show the ⭕️ image (Sprites.js), only the device's own emoji
const COUNTS_TRANSFERS = "(counts transfers)";

function searchTargets(terms) {
  let lines = (Array.isArray(terms) ? terms : []).map(term => ({
    title: String(term?.title ?? "").replace(/\s+/g, " ").trim(),
    match: SEARCH_MATCHES.includes(term?.match) ? term.match : "all",
    exact: !!term?.exact
  }));
  let filled = lines.filter(line => cleanString(line.title) !== "");

  // No titles: the first line's buttons say what to find
  if (filled.length === 0) {
    let match = lines.length > 0 ? lines[0].match : "all";
    if (match === "category") throw new BudgetInputError("Type the title of a tracker row, like Food.");
    return { targets: [{ clean: null, count: match, withTransfers: false }], searchingFor: { all: "everything", costs: "every cost", gains: "every gain" }[match] };
  }

  let targets = [];
  let described = [];
  let rowsFound = new Set();
  for (let { title, match, exact } of filled) {
    if (match !== "category") {
      targets.push({ clean: cleanString(title), count: match, withTransfers: false, exact });
      const notes = [exact ? "exact" : "", match === "all" ? "" : `${match} only`].filter(Boolean);
      described.push(title + (notes.length ? ` (${notes.join(", ")})` : ""));
      continue;
    }

    // Tracker: the title is a tracker row. Find what the row counts: each of its aliases with its own
    // costs/gains setting (Costs and Gains count every cost or gain), and transfers if it counts them.
    // A title can have a row that counts transfers (⭕️Food) and one that doesn't (Food): typing the ⭕️, or
    // "Food (counts transfers)" the way Search suggests it, picks the first, and otherwise the one that
    // doesn't is picked when there are both.
    let wantsTransfers = /^⭕/.test(title) || title.toLowerCase().endsWith(COUNTS_TRANSFERS);
    let rowTitle = cleanString(title.slice(0, title.toLowerCase().endsWith(COUNTS_TRANSFERS) ? -COUNTS_TRANSFERS.length : undefined));
    let matches = [];
    trackerData.forEach((row, i) => {
      if (i > 0 && String(row[0]).trim() !== "-" && cleanString(row[0]) === rowTitle) matches.push(i);
    });
    let index = matches.find(i => String(trackerData[i][0]).trim().startsWith("⭕️") === wantsTransfers) ?? matches[0];
    if (index === undefined) throw new BudgetInputError(`There's no tracker row called "${title}".`);
    if (rowsFound.has(index)) continue;
    rowsFound.add(index);

    let row = trackerData[index];
    let rowType = cleanString(row[0]);
    described.push(`the ${String(row[0]).trim()} tracker row`);
    if (rowType === "costs" || rowType === "gains") {
      targets.push({ clean: null, count: rowType, withTransfers: false });
      continue;
    }
    if (rowType === "transfers") {
      targets.push({ clean: null, count: "all", withTransfers: true, onlyTransfers: true });
      continue;
    }
    let withTransfers = String(row[0]).startsWith("⭕️");
    for (let alias of String(row[4] || "").split(",")) {
      let { clean, count } = parseAlias(alias);
      if (clean) targets.push({ clean, count, withTransfers, exact: true }); // Like the tracker counts them
    }
  }
  return { targets, searchingFor: described.join(", ") };
}

/* ---------- Rebuilding the calendar (the spreadsheet's worker functions) ---------- */

// Move Future Dates entries onto the calendar once their day is on it, and build the
// "Upcoming" list (everything still past the calendar, by date)
function upcomingEntriesMaintenance() {
  let latestDay = new Date(0);
  let futureRowsToDeleteIndexes = [];
  for (let i = 1; i < futureData.length; i++) {
    let fTitle = String(futureData[i][0]).trim();
    let fAmt = parseAmount(futureData[i][1]);
    let fDate = createSafeMidnight(futureData[i][2], true);
    let fSprite = String(futureData[i][3]);
    if (!fTitle || isNaN(fDate.getTime())) continue;
    if (fDate > latestDay) latestDay = fDate;
    // Days before the calendar: the daily update already wrote missed days' entries in,
    // so anything still here was forgotten and isn't added blindly
    if (fDate < gridStartDate) {
      futureRowsToDeleteIndexes.push(i);
      continue;
    }
    // Its day is on the calendar now: it goes there
    const spot = fDate <= gridEndDate ? calendarSpot(fDate) : null;
    if (spot) {
      calendarData[spot.r][spot.c] += `\n${fSprite} ${formatMoney(fAmt)} ${fTitle}`;
      futureRowsToDeleteIndexes.push(i);
    }
  }
  // Purge rows backwards so indexes stay valid
  futureRowsToDeleteIndexes = [...new Set(futureRowsToDeleteIndexes)].sort((a, b) => a - b);
  for (let i = futureRowsToDeleteIndexes.length - 1; i >= 0; i--) {
    deletedUpcoming++;
    futureData.splice(futureRowsToDeleteIndexes[i], 1);
  }
  if (isDailyUpdate) formEntryRow[4] = "Upcomings Added: " + deletedUpcoming;

  // Keep what's left in date order (header stays on top)
  if (latestDay > gridEndDate && futureData.length > 1) {
    let header = futureData.shift();
    const dayOf = (row) => createSafeMidnight(row[2], true).getTime() || 0;
    futureData.sort((a, b) => dayOf(a) - dayOf(b));
    futureData.unshift(header);
  }
  upcomingEntries = futureData.slice(1)
    .filter(row => String(row[0]).trim() !== "")
    .map(row => ({ date: createSafeMidnight(row[2], true), sprite: String(row[3]), amount: parseAmount(row[1]), title: String(row[0]).trim() }))
    .filter(upcoming => !isNaN(upcoming.date.getTime()));
}

// Write recurring entries onto every calendar day from today on, respecting temps (a temp with
// the same title blocks the entry that day) and combining into same-type unique entries.
// Expired recurring entries are queued for deleteExpiredRecurrings.
function writeRecurring() {
  const todayTime = today.getTime();
  for (let i = 2; i < recurringData.length; i++) {
    const row = recurringData[i];
    if (!row || row[0] === "-") continue;
    const title = String(row[0]).trim();
    if (!title) continue;

    // Set for deletion if expired (a blank End Date, like None, never ends)
    const endText = String(row[4] ?? "").trim();
    const endDate = endText && endText.toLowerCase() !== "none" ? createSafeMidnight(endText, true) : null;
    if (endDate && todayTime > endDate.getTime()) {
      recurringToDeleteIndexes.push(i);
      continue;
    }
    // If not expired, every calendar day from today on that it lands on gets it
    const amt = parseAmount(String(row[1]));
    const sprite = row[5];
    const cleanTitle = cleanString(title);
    const special = getSpecialType(String(sprite || ""));
    const parsed = parseRecurringRow(row);
    calendarChecks:
    for (let r = 3; r >= 0; r--) {
      for (let c = 6; c >= 0; c--) {
        const cellDate = gridDates[r][c];
        if (cellDate.getTime() < todayTime) break calendarChecks;
        if (!recurringRowHits(parsed, cellDate)) continue;

        const cellLines = calendarData[r][c].split("\n");
        let hasTemp = false;
        let hasUnique = false;
        for (let l = 0; l < cellLines.length; l++) {
          const line = readLine(cellLines[l]);
          // Only an entry with this title and refraction type affects it (a title can have one recurring
          // entry of each type, and they land side by side)
          if (line.clean !== cleanTitle || getSpecialType(line.sprite) !== special) continue;
          // A temp (checkmark entry) blocks it for the day (so does a spreadsheet's)
          if (entryMark(line.sprite)) {
            hasTemp = true;
            break;
          }
          // A unique entry takes in its amount (a placeholder only if both are)
          hasUnique = true;
          cellLines[l] = `${placeholderSprite(withoutPlaceholder(line.sprite) + "✔️", isPlaceholder(line.sprite) && isPlaceholder(sprite))} ${formatMoney(amt + line.amount)} ${title}`;
          calendarData[r][c] = cellLines.join("\n");
          break;
        }
        // Respect manual overrides; otherwise write the recurring entry as normal
        if (!hasTemp && !hasUnique) {
          calendarData[r][c] += `\n${sprite} ${formatMoney(amt)} ${title}`;
        }
      }
    }
  }
}

// Remove expired recurring entries. releaseEndedTemps (just before this) already turned their temps from
// today on into plain unique entries, so ending a recurring entry never changes days that already passed.
function deleteExpiredRecurrings() {
  let deletedAny = false;
  recurringToDeleteIndexes = [...new Set(recurringToDeleteIndexes)].sort((a, b) => a - b);
  for (let i = recurringToDeleteIndexes.length - 1; i >= 0; i--) {
    deletedRecurrings++;
    deletedAny = true;
    recurringData.splice(recurringToDeleteIndexes[i], 1);
  }
  if (isDailyUpdate) formEntryRow[6] = "Recurrings Expired: " + deletedRecurrings;
  return deletedAny;
}

// A temp only keeps its recurring entry from landing on its day. Once the recurring entry can't land
// there anymore (its End Date moved before that day, or it was deleted, which ends it yesterday), the
// temp is just a unique entry: from today on, on the calendar and in Upcoming, it loses its checkmark,
// and a $0.00 blocker (which only held the day) goes away. Days that already passed keep their temps.
function releaseEndedTemps() {
  // The last day each title + refraction type can land (null: no End Date, so it can always land)
  let lastDays = new Map();
  for (let i = 2; i < recurringData.length; i++) {
    let row = recurringData[i];
    if (!row || String(row[0]).trim() === "-" || !cleanString(row[0])) continue;
    let key = cleanString(row[0]) + "|" + getSpecialType(String(row[5] || ""));
    let endText = String(row[4] ?? "").trim();
    let endDate = endText && endText.toLowerCase() !== "none" ? createSafeMidnight(endText, true) : null;
    if (endDate && isNaN(endDate.getTime())) endDate = null;
    // (Two rows that match, see recurringDuplicates: the later End Date wins)
    if (!lastDays.has(key)) lastDays.set(key, endDate);
    else if (lastDays.get(key) === null || endDate === null) lastDays.set(key, null);
    else if (endDate > lastDays.get(key)) lastDays.set(key, endDate);
  }

  // From the day after the last one it can land on, and never before today
  const releaseFrom = (cleanTitle, special) => {
    let lastDay = lastDays.get(cleanTitle + "|" + special);
    return lastDay ? Math.max(addDays(lastDay, 1).getTime(), today.getTime()) : null;
  };

  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 7; c++) {
      let lines = String(calendarData[r][c]).split("\n");
      let changed = false;
      for (let l = lines.length - 1; l >= 1; l--) {
        let parts = getParts(lines[l]);
        let special = getSpecialType(parts[0]);
        if (withoutPlaceholder(parts[0]) !== special + "✔️") continue; // Only temps (a placeholder stays one)
        let from = releaseFrom(extractTitle(lines[l]), special);
        if (from === null || gridDates[r][c].getTime() < from) continue;
        if (parseAmount(parts[1]) === 0) {
          lines.splice(l, 1);
        } else {
          parts[0] = placeholderSprite(special, isPlaceholder(parts[0]));
          lines[l] = parts.join(" ");
        }
        changed = true;
      }
      if (changed) calendarData[r][c] = lines.join("\n");
    }
  }

  for (let f = futureData.length - 1; f >= 1; f--) {
    let row = futureData[f];
    let sprite = String(row[3] ?? "").trim();
    let special = getSpecialType(sprite);
    if (withoutPlaceholder(sprite) !== special + "✔️") continue;
    let from = releaseFrom(cleanString(row[0]), special);
    let date = createSafeMidnight(row[2], true);
    if (from === null || isNaN(date.getTime()) || date.getTime() < from) continue;
    if (parseAmount(row[1]) === 0) futureData.splice(f, 1);
    else row[3] = placeholderSprite(special, isPlaceholder(sprite));
  }
}

// Order each day's entries by type, then alphabetize within each type
function organizeCellEntries() {
  let orderingData = calendarData.map(row => row.map(() => ""));
  // A line's title as it sorts
  function extractSortingTitle(wholeLine) {
    return cleanString(getParts(wholeLine).slice(2).join(" "));
  }
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 7; c++) {
      let oldLines = combineSameEntries(calendarData[r][c].split("\n"));
      let newLines = [];
      // (Connected spreadsheets' entries go right after recurring ones: their temps after recurring temps,
      // and the ones just as they landed after recurring entries)
      let cellArray = {
        uncategorized: [],
        oneTimes: [],
        temps: [],
        sheetTemps: [],
        hidTemps: [],
        hidSheetTemps: [],
        hiddens: [],
        transferTemps: [],
        transferSheetTemps: [],
        transfers: [],
        hidRecs: [],
        transferRecs: [],
        recs: [],
        hidSheets: [],
        transferSheets: [],
        sheets: []
      };
      // Add date header
      newLines.push(oldLines[0] + "\n");
      for (let l = 1; l < oldLines.length; l++) {
        let currentLine = oldLines[l];
        // Guard against blank/whitespace lines
        if (!currentLine.trim()) continue;
        // (Sorted with its kind, a placeholder or not)
        let kindLine = shownLine(currentLine);
        if (kindLine.startsWith("❗️ ")) cellArray.oneTimes.push(currentLine + "\n");
        else if (kindLine.startsWith("❗️✔️ ")) cellArray.temps.push(currentLine + "\n");
        else if (kindLine.startsWith("❗️➕ ")) cellArray.sheetTemps.push(currentLine + "\n");
        else if (kindLine.startsWith("✖️✔️ ")) cellArray.hidTemps.push(currentLine + "\n");
        else if (kindLine.startsWith("✖️➕ ")) cellArray.hidSheetTemps.push(currentLine + "\n");
        else if (kindLine.startsWith("✖️ ")) cellArray.hiddens.push(currentLine + "\n");
        else if (kindLine.startsWith("✔️✖️ ")) cellArray.hidRecs.push(currentLine + "\n");
        else if (kindLine.startsWith("⭕️✔️ ")) cellArray.transferTemps.push(currentLine + "\n");
        else if (kindLine.startsWith("⭕️➕ ")) cellArray.transferSheetTemps.push(currentLine + "\n");
        else if (kindLine.startsWith("⭕️ ")) cellArray.transfers.push(currentLine + "\n");
        else if (kindLine.startsWith("✔️⭕️ ")) cellArray.transferRecs.push(currentLine + "\n");
        else if (kindLine.startsWith("✔️ ")) cellArray.recs.push(currentLine + "\n");
        else if (kindLine.startsWith("➕✖️ ")) cellArray.hidSheets.push(currentLine + "\n");
        else if (kindLine.startsWith("➕⭕️ ")) cellArray.transferSheets.push(currentLine + "\n");
        else if (kindLine.startsWith("➕❗️ ")) cellArray.sheets.push(currentLine + "\n");
        else cellArray.uncategorized.push(currentLine + "\n");
      }
      // Sort and append each category sequentially
      Object.keys(cellArray).forEach(key => {
        if (cellArray[key].length > 0) {
          cellArray[key].sort((a, b) => extractSortingTitle(a).localeCompare(extractSortingTitle(b)));
          newLines.push(cellArray[key].join(""));
        }
      });
      // Remove trailing newline
      orderingData[r][c] = newLines.join("").replace(/\n$/, "");
    }
  }
  calendarData = orderingData;
}

// In Bank, Gains, and Costs for every day (starting from History's last balance), the next-28-days
// lines on the last day, and the home page's "Lowest in bank after today"
function writeBudgetMath() {
  let lastInBank = readLatestHistoryInBank();
  let lowest = Infinity;
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 7; c++) {
      let lines = calendarData[r][c].split("\n");
      let { gains, costs, bankChange } = dayMath(lines);
      let inBank = Math.round((lastInBank + bankChange) * 100) / 100;
      if (gridDates[r][c] >= today && inBank < lowest) lowest = inBank;

      let bankLine;
      if (inBank < 0) {
        bankLine = `⛔️ ${formatMoney(inBank)} In Bank`;
        if (gridDates[r][c].getTime() >= today.getTime()) visibleNegatives++;
      } else {
        bankLine = `✅ ${formatMoney(inBank)} In Bank`;
      }
      let finalLines = [lines[0], bankLine];
      if (gains > 0) finalLines.push(`❇️ ${formatMoney(gains)} Gains`);
      if (costs > 0) finalLines.push(`✴️ ${formatMoney(-costs)} Costs`);
      for (let l = 1; l < lines.length; l++) {
        let parts = getParts(lines[l]);
        if (!systemEmojis.includes(parts[0])) finalLines.push(lines[l]);
      }
      calendarData[r][c] = finalLines.join("\n");
      lastInBank = inBank;
    }
  }

  // [0] lowest in the next 28 days line, [1] day 28 In Bank line, [2] lowest raw number
  let predictionValues = getPredictionData(lastInBank);
  let lastCellLinesArray = calendarData[3][6].split("\n");
  lastCellLinesArray.splice(2, 0, predictionValues[1]);
  lastCellLinesArray.splice(2, 0, predictionValues[0]);
  calendarData[3][6] = lastCellLinesArray.join("\n");

  if (predictionValues[2] < 0) nextFourNegative = true;
  if (predictionValues[2] < lowest) lowest = predictionValues[2];
  lowestInBank = lowest === Infinity ? 0 : lowest;
}

// A day's Gains and Costs lines, and how much its entries change In Bank (lines: the day's cell, line by line):
//   Regular entries are costs or gains, and change In Bank
//   Hidden entries are costs or gains too, but happen outside the budget's account, so In Bank stays the same
//   Transfers change In Bank, but aren't costs or gains (the money is still yours)
function dayMath(lines) {
  let gains = 0;
  let costs = 0;
  let bankChange = 0;
  for (let l = 1; l < lines.length; l++) {
    const line = readLine(lines[l]);
    if (line.blank || line.system) continue;
    const special = getSpecialType(line.sprite);
    if (special !== "✖️") bankChange += line.amount;
    if (special === "⭕️") continue;
    if (line.amount < 0) costs += Math.abs(line.amount);
    else gains += line.amount;
  }
  return { gains, costs, bankChange };
}

// In Bank on each of the 28 days after the calendar, as getPredictionData works it out: [[Date, amount], ...] (for the
// Quick Entry page, see inBankAhead)
let predictedInBank = [];

// The 28 days after the calendar: lowest balance (and when) and the balance on day 28, with recurring entries,
// connected spreadsheets' entries, and Future Dates. Also counts uncommon recurring entries (every 3 months or
// less often) visible from today on.
function getPredictionData(lastInBank) {
  predictedInBank = [];
  let recurringRows = getParsedRecurringRows();
  let sheetDays = sheetEntriesByDay(nextFourStart, addDays(nextFourStart, 27));
  let visibleDay = createSafeMidnight(gridStartDate);
  let testDay = createSafeMidnight(nextFourStart);
  let todayTime = today.getTime();

  let daysDone = 0;
  let lowest = Infinity;
  let lowestDate = new Date(testDay.getTime());

  let parsedFuture = [];
  for (let f = 1; f < futureData.length; f++) {
    let time = createSafeMidnight(futureData[f][2], true).getTime();
    if (isNaN(time)) continue;
    let fSprite = String(futureData[f][3] || "");
    parsedFuture.push({
      title: cleanString(futureData[f][0]),
      amt: parseAmount(futureData[f][1]),
      time,
      sprite: fSprite,
      special: getSpecialType(fSprite)
    });
  }

  while (daysDone < 28) {
    let dayTotal = 0;
    let currentTestTime = testDay.getTime();
    let currentVisibleTime = visibleDay.getTime();

    // A Future Dates temp (like ❗️✔️ or ❗️➕) with its title and type that day replaces a recurring or
    // spreadsheet entry
    const overridden = (clean, special) => parsedFuture.some(future => future.time === currentTestTime && future.title === clean &&
      entryMark(future.sprite) && future.special === special);
    // One recurring entry per title and type lands on a day, like writeRecurring (when two rows match, see
    // recurringDuplicates, the first one does)
    const visibleLanded = new Set();
    const testLanded = new Set();
    for (let row of recurringRows) {
      const key = row.parsed.cleanTitle + "|" + row.parsed.special;
      if (isUncommonFrequency(row.parsed.frequency) && currentVisibleTime >= todayTime && !visibleLanded.has(key) && recurringRowHits(row.parsed, visibleDay)) {
        visibleLanded.add(key);
        visibleUncommons++;
      }
      if (String(row.sprite || "").includes("✖️") || testLanded.has(key) || !recurringRowHits(row.parsed, testDay)) continue;
      testLanded.add(key);
      if (!overridden(row.parsed.cleanTitle, row.parsed.special)) dayTotal += row.amt;
    }
    for (let entry of sheetDays.get(currentTestTime)?.values() || []) {
      if (entry.special !== "✖️" && !overridden(entry.clean, entry.special)) dayTotal += entry.amount;
    }

    for (let f = 0; f < parsedFuture.length; f++) {
      // Hidden entries don't change In Bank (hidden recurring entries are skipped above)
      if (parsedFuture[f].time === currentTestTime && parsedFuture[f].special !== "✖️") dayTotal += parsedFuture[f].amt;
    }

    lastInBank = Math.round((lastInBank + dayTotal) * 100) / 100; // To the cent, like every In Bank
    predictedInBank.push([new Date(testDay.getTime()), lastInBank]);
    if (lastInBank < lowest) {
      lowest = lastInBank;
      lowestDate = new Date(testDay.getTime());
    }

    testDay.setDate(testDay.getDate() + 1);
    visibleDay.setDate(visibleDay.getDate() + 1);
    daysDone++;
  }

  let nextLowest = (lowest < 0 ? "⛔️" : "✅") + " " + formatMoney(lowest) + " Lowest: " + formatToMMDD(lowestDate);
  let finalInBank = (lastInBank < 0 ? "⛔️" : "✅") + " " + formatMoney(lastInBank) + " Day 28 In Bank";

  return [nextLowest, finalInBank, lowest];
}

// Dave's message for the home page: a greeting, what needs attention, and today's affirmation
function commenceDave() {
  let message = "Oops, looks like I couldn't read the budget! Sorry about that...";
  try {
    let janFirst = createSafeMidnight(new Date(today.getFullYear(), 0, 1));
    let todaysDay = getDayDifference(today, janFirst);
    // (A $0.00 temp only keeps a recurring entry off its day, so it isn't a payment; a $0.00 note, like "Add To
    // Savings", still counts)
    let futureDatesAmount = futureData.slice(1).filter(row => String(row[0]).trim() !== "" && !(parseAmount(row[1]) === 0 && entryMark(row[3]))).length;
    let tempDaveMessage = greetingPresets[todaysDay % greetingPresets.length];
    tempDaveMessage += nicknamePresets[todaysDay % nicknamePresets.length];
    // A budget with no recurring entries yet is brand new
    let hasRecurring = recurringData.slice(2).some(row => String(row[0]).trim() !== "" && String(row[0]).trim() !== "-");
    if (!hasRecurring) tempDaveMessage = "Woah! Nice new budget, don't forget to add your recurring entries! ";
    let discrepancies = 0;
    let writtenDisc = 0;
    if (nextFourNegative) discrepancies++;
    if (visibleUncommons) discrepancies++;
    if (futureDatesAmount) discrepancies++;
    if (visibleNegatives) discrepancies++;
    if (discrepancies === 0) {
      tempDaveMessage += allClearPresets[todaysDay % allClearPresets.length];
    } else if (discrepancies === 2) {
      tempDaveMessage += "I've found a couple things to keep in mind: ";
    } else if (discrepancies === 3) {
      tempDaveMessage += "I've found a few things to keep in mind: ";
    } else if (discrepancies > 3) {
      tempDaveMessage += "I've found these things to keep in mind: ";
    }
    if (nextFourNegative) { // Next four negative
      writtenDisc++;
      if (discrepancies === 1) {
        tempDaveMessage += "All I see right now is that you'll be going negative sometime after the current four weeks. ";
      } else {
        tempDaveMessage += "It looks like you'll be going negative sometime after the current four weeks";
        if (writtenDisc === discrepancies) tempDaveMessage += ". ";
      }
    }
    if (visibleUncommons > 0) { // Visible yearlies
      if (writtenDisc > 0) {
        tempDaveMessage += ", ";
        if (writtenDisc === discrepancies - 1) tempDaveMessage += "and ";
      }
      let firstLetter = writtenDisc > 0 ? "y" : "Y";
      writtenDisc++;
      let plurality = (visibleUncommons > 1) ? "s" : "";
      if (discrepancies === 1) {
        tempDaveMessage += "All I see right now is that you've got " + visibleUncommons + " uncommon recurring payment" + plurality + " in the current four weeks. ";
      } else {
        tempDaveMessage += firstLetter + "ou've got " + visibleUncommons + " uncommon recurring payment" + plurality + " in the current four weeks";
        if (writtenDisc === discrepancies) tempDaveMessage += ". ";
      }
    }
    if (futureDatesAmount > 0) { // Future dates
      if (writtenDisc > 0) {
        tempDaveMessage += ", ";
        if (writtenDisc === discrepancies - 1) tempDaveMessage += "and ";
      }
      let firstLetter = writtenDisc > 0 ? "t" : "T";
      writtenDisc++;
      let plurality = (futureDatesAmount > 1) ? "s" : "";
      let isAre = (futureDatesAmount > 1) ? "are" : "is";
      if (discrepancies === 1) {
        tempDaveMessage += "All I see right now is that there " + isAre + " " + futureDatesAmount + " upcoming payment" + plurality + " sometime after the current four weeks. ";
      } else {
        tempDaveMessage += firstLetter + "here " + isAre + " " + futureDatesAmount + " upcoming payment" + plurality + " sometime after the current four weeks";
        if (writtenDisc === discrepancies) tempDaveMessage += ". ";
      }
    }
    if (visibleNegatives > 0) { // Visible negatives
      if (writtenDisc > 0) {
        tempDaveMessage += ", ";
        if (writtenDisc === discrepancies - 1) tempDaveMessage += "and ";
      }
      let firstLetter = writtenDisc > 0 ? "y" : "Y";
      let plurality = (visibleNegatives > 1) ? "s" : "";
      if (discrepancies === 1) {
        tempDaveMessage += "All I see right now is that you have " + visibleNegatives + " day" + plurality + " negative on the budget. ";
      } else {
        tempDaveMessage += firstLetter + "ou have " + visibleNegatives + " day" + plurality + " negative on the budget. ";
      }
    }
    tempDaveMessage += farewellPresets[todaysDay % farewellPresets.length];
    tempDaveMessage += affirmationPresets[affirmationIndex(today)];
    message = tempDaveMessage;
  } catch (error) {
    console.error("Dave's message couldn't be worked out:", error);
    hadError = true;
  }
  daveMessage = message;
}

// Which affirmation a day gets: the same one on the same date every year, the leap year one on February 29, and
// "Next year will be even better." on December 31 (the list has one for each day of a common year, then the leap one)
function affirmationIndex(date) {
  const day = getDayDifference(date, new Date(date.getFullYear(), 0, 1));
  const isLeapYear = new Date(date.getFullYear(), 1, 29).getMonth() === 1;
  if (!isLeapYear || day < 59) return day;
  return day === 59 ? 365 : day - 1;
}

/* ---------- Dave's tips (his "smart" messages) ---------- */
// Besides his everyday message, Dave has tips about things worth a closer look. The first time Home opens on a
// day, he shows one of that day's tips for 10 minutes, highlighted. Each visit after that (once the tip before
// has had its 10 minutes) shows the next one, until all of the day's tips have been shown; then he's back to
// his everyday message. A purchase that takes the budget below $0 (or further below) gets its tip right away.
// Which tips were shown is kept on this device (they're only reminders), and stays after signing out (Layout.js
// keeps just which tips and when), so signing back in goes on to the next tip instead of starting the day's over.
// Tips are worked out once per visit (startDaveVisit), never on every change, so they can't slow changes down. In
// this order:
//   payday:  today has a paycheck: about how much usually goes out, besides recurring bills, before the next
//            one (looking back 4 months, and only with 4 months of History)
//   pace:    the last 7 days' spending, besides recurring bills, is well over a usual week's (4 months of History)
//   savings: a big uncommon bill (or one-time cost added for a later day) is coming up in the next 60 days, and
//            how much to set aside from each paycheck until then
//   inBank:  on Sundays: compare In Bank with the bank, and add what's missing (or a Catchup entry)
//   catchup: once a week, when Catchup entries in the last 30 days add up to $100 or more: add purchases as
//            they happen instead
//   refund:  a purchase took the lowest In Bank after today below $0, or further below

const DAVE_TIP_MINUTES = 10;
const DAVE_BIG_BILL = 200;      // A "big" bill: a cost of at least this much
const DAVE_BILL_DAYS = 60;      // How far ahead the savings tip looks
const DAVE_HISTORY_MONTHS = 4;  // How far back the payday and pace tips look (and how much History they need)
const DAVE_PAYDAY_DAYS = 4;     // The payday tip's next payday: the first paycheck at least this many days away
const DAVE_PACE_OVER = 50;      // The pace tip: the last 7 days are at least this much over a usual week...
const DAVE_PACE_RATIO = 1.25;   // ...and at least this many times it
const DAVE_CATCHUP = 100;       // The catchup tip: Catchup entries in the last 30 days add up to at least this much
const DAVE_CATCHUP_DAYS = 30;
const DAVE_TIPS = [["payday", paydayTip], ["pace", paceTip], ["savings", savingsTip], ["inBank", inBankTip], ["catchup", catchupTip]];
const DAVE_WEEKLY_TIPS = ["inBank", "catchup"]; // Shown at most once every 7 days
const DAVE_SUNDAY_TIPS = ["inBank"];            // ...and only on a Sunday

// Where this device keeps Dave's tips for the signed-in account
const daveStorageKey = () => `prismal_dave_${localStorage.getItem("prismal_username") || ""}`;

// { day, shown: [today's tips shown so far], current: { id, text, until } | null, weekly: { tip id: the last day
// it was shown (MM/DD/YYYY) }, refund: { text, day } | null (a purchase's tip, waiting for Home) }
function readDaveState() {
  const day = formatToMMDDYYYY(today);
  let state = null;
  try { state = JSON.parse(localStorage.getItem(daveStorageKey()) || "null"); } catch (e) {}
  if (!state || typeof state !== "object" || Array.isArray(state)) state = {};
  if (state.day !== day) Object.assign(state, { day, shown: [], current: null });
  if (!Array.isArray(state.shown)) state.shown = [];
  if (!state.weekly || typeof state.weekly !== "object") state.weekly = {};
  if (state.refund && state.refund.day !== day) state.refund = null;
  return state;
}

// Save Dave's tips on this device (best effort)
function writeDaveState(state) {
  try { localStorage.setItem(daveStorageKey(), JSON.stringify(state)); } catch (e) {}
}

// What the tips share while startDaveVisit works them out (recentSpending, worked out once), or null
let daveTipsShared = null;

// A visit to Home: the tip whose 10 minutes aren't up yet keeps showing; otherwise the next one for today
// starts (a waiting purchase's tip first)
function startDaveVisit() {
  const state = readDaveState();
  const now = Date.now();
  if (state.current && state.current.until > now) return;
  state.current = null;
  let tip = state.refund ? { id: "refund", text: state.refund.text } : null;
  state.refund = null;
  daveTipsShared = {};
  try {
    for (const [id, makeTip] of DAVE_TIPS) {
      if (tip) break;
      if (state.shown.includes(id) || !weeklyTipDue(state, id)) continue;
      const text = makeTip();
      if (text) tip = { id, text };
    }
  } finally {
    daveTipsShared = null;
  }
  if (tip) {
    state.current = { ...tip, until: now + DAVE_TIP_MINUTES * 60000 };
    if (tip.id !== "refund") state.shown.push(tip.id);
    if (DAVE_WEEKLY_TIPS.includes(tip.id)) state.weekly[tip.id] = state.day;
  }
  writeDaveState(state);
}

// The tip Dave is showing ({ id, text, until }), or null for his everyday message
function currentDaveTip() {
  const state = readDaveState();
  if (!state.current || !(state.current.until > Date.now())) return null;
  // The weekly check says today's In Bank as it is now
  if (state.current.id === "inBank") return { ...state.current, text: inBankTip() || state.current.text };
  return state.current;
}

// A purchase (a Regular cost from New Entry or a quick entry) that took the lowest In Bank after today below
// $0, or further below. On Home, Dave says so right away; elsewhere (like quick entries added as another page
// opens), on the next visit to Home.
function noticeRiskyPurchase(purchase, lowestBefore) {
  if (!purchase || !(purchase.amount < 0) || purchase.type !== "❗️" || purchase.date < gridStartDate) return;
  if (lowestInBank >= 0 || lowestInBank > lowestBefore - 0.005) return;
  const text = `Hey, that purchase (${capitalize(String(purchase.title || "").trim())}, ${formatMoney(purchase.amount)} on ${showDay(purchase.date)}) seems to risk your budget balance. Is a refund possible?`;
  const state = readDaveState();
  if (window.PAGE === "home") state.current = { id: "refund", text, until: Date.now() + DAVE_TIP_MINUTES * 60000 };
  else state.refund = { text, day: state.day };
  writeDaveState(state);
}

// A weekly tip is due when it's never been shown on this device, or 7 days have passed since (others always are).
// The weekly check is only due on a Sunday.
function weeklyTipDue(state, id) {
  if (!DAVE_WEEKLY_TIPS.includes(id)) return true;
  if (DAVE_SUNDAY_TIPS.includes(id) && today.getDay() !== 0) return false;
  const last = state.weekly[id] ? createSafeMidnight(state.weekly[id], true) : null;
  return !last || isNaN(last.getTime()) || getDayDifference(today, last) >= 7;
}

// The weekly check (Sundays): compare today's In Bank with the bank (once there are entries to check)
function inBankTip() {
  const spot = calendarSpot(today);
  const inBank = spot ? readInBank(calendarData[spot.r][spot.c]) : null;
  const hasEntries = historyData.slice(1).some(row => row.some(cell => String(cell ?? "").trim() !== "")) ||
    calendarData.some(row => row.some(cell => ownEntryLines(cell).length > 0));
  if (inBank === null || !hasEntries) return null;
  return `Time for your weekly check! Look at today's In Bank here (${formatMoney(inBank)}), and compare it with what your bank account actually has. Try to find which purchases are causing any difference, and add them in (on the day they happened, or just to today). Anything you can't find: tap today's In Bank on the calendar and type what your bank says, and I'll add a Catchup entry to make up the difference.`;
}

// A paycheck: a gain from a recurring entry or a connected spreadsheet (its line has a ✔️ or ➕) that's
// Regular (not Hidden or a transfer)
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

// Each day from 4 months ago through today, from History and the calendar: { spent, catchup, payday }, where spent
// is what went out of In Bank besides recurring bills (Regular costs that didn't come from a recurring entry or a
// connected spreadsheet),
// and catchup is its Catchup costs (Regular, or a Transfer with no Other Account like In Bank's own Catchup entries;
// never Hidden, which doesn't change In Bank). enough: History reaches back the whole 4 months. Worked out once per visit
// (several tips use it: see startDaveVisit).
function recentSpending() {
  if (daveTipsShared?.spending) return daveTipsShared.spending;
  const from = new Date(today.getFullYear(), today.getMonth() - DAVE_HISTORY_MONTHS, today.getDate());
  const days = new Map(); // day's time -> { spent, catchup, payday }
  let earliest = null;
  const readDay = (date, cellText) => {
    if (isNaN(date.getTime())) return;
    if (!earliest || date < earliest) earliest = date;
    if (date < from || date > today) return;
    const day = { spent: 0, catchup: 0, payday: false };
    for (const text of String(cellText).split("\n").slice(1)) {
      const line = readLine(text);
      if (line.blank || line.system) continue;
      if (isPaycheckLine(text)) day.payday = true;
      if (line.amount >= 0) continue;
      const special = getSpecialType(line.sprite);
      if (special === "❗️" && !entryMark(line.sprite)) day.spent -= line.amount;
      if (special !== "✖️" && /^catch ?up$/.test(line.clean)) day.catchup -= line.amount;
    }
    days.set(date.getTime(), day);
  };
  for (let r = 1; r < historyData.length; r++) {
    for (let c = 0; c < 7; c++) {
      const cellText = String(historyData[r][c] ?? "");
      if (cellText.trim()) readDay(createSafeMidnight(cellText.split("\n")[0].trim(), true), cellText);
    }
  }
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 7; c++) readDay(gridDates[r][c], calendarData[r][c]);
  }
  const spending = { days, enough: !!earliest && earliest <= from };
  if (daveTipsShared) daveTipsShared.spending = spending;
  return spending;
}

// On a payday: about how much usually goes out, besides recurring bills, before the next one
function paydayTip() {
  const todaySpot = calendarSpot(today);
  if (!todaySpot || !String(calendarData[todaySpot.r][todaySpot.c]).split("\n").slice(1).some(isPaycheckLine)) return null;
  const { days, enough } = recentSpending();
  if (!enough) return null;

  // "The next N days": until the next payday from a recurring entry or a connected spreadsheet (two weeks if
  // there isn't one). Paychecks
  // within a few days of each other (like two people's, a day apart) are one payday, so the next one counted
  // is at least DAVE_PAYDAY_DAYS away.
  const next = paycheckDays(addDays(today, DAVE_PAYDAY_DAYS), addDays(today, 62))[0];
  const span = next ? getDayDifference(next, today) : 14;

  // What went out in the N days from each payday in those 4 months, on average (or, with none to go by, a
  // day's average times N)
  const sums = [];
  let total = 0;
  let pastDays = 0;
  for (const [time, day] of days) {
    if (time >= today.getTime()) continue;
    total += day.spent;
    pastDays++;
    const start = new Date(time);
    if (!day.payday || addDays(start, span) > today) continue;
    let sum = 0;
    for (let d = 0; d < span; d++) sum += days.get(addDays(start, d).getTime())?.spent || 0;
    sums.push(sum);
  }
  const average = sums.length > 0 ? sums.reduce((a, b) => a + b, 0) / sums.length : (pastDays ? total / pastDays * span : 0);
  if (Math.round(average) <= 0) return null;
  return `Hey, you just got paid! Keep in mind, besides your recurring bills, you tend to spend about ${formatMoney(Math.round(average))} in the next ${span} days, so be careful what you spend it on!`;
}

// Spending pace: the last 7 days (today too), besides recurring bills, against a usual week in the 4 months
// before them. Shown when they're at least $50 and 25% over it.
function paceTip() {
  const { days, enough } = recentSpending();
  if (!enough) return null;
  const weekStart = addDays(today, -6).getTime();
  let thisWeek = 0;
  let before = 0;
  let beforeDays = 0;
  for (const [time, day] of days) {
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
  if (over < DAVE_PACE_OVER || thisWeek < usualWeek * DAVE_PACE_RATIO) return null;
  return `Heads up: you've spent about ${formatMoney(Math.round(thisWeek))} in the last 7 days besides your recurring bills, about ${formatMoney(Math.round(over))} more than usual for a week. Taking it easy for a few days keeps your budget on track!`;
}

// Catchup entries (titled Catchup or Catch Up) in the last 30 days: when they add up to $100 or more, purchases
// are being missed, so add them as they happen
function catchupTip() {
  const { days } = recentSpending();
  const from = addDays(today, -(DAVE_CATCHUP_DAYS - 1)).getTime();
  let total = 0;
  for (const [time, day] of days) if (time >= from) total += day.catchup;
  if (total < DAVE_CATCHUP) return null;
  return `Your Catchup entries add up to ${formatMoney(Math.round(total))} in the last ${DAVE_CATCHUP_DAYS} days, so some purchases are slipping by. Try adding each one as it happens (the Quick Entry icon on your phone's home screen makes it quick), so your In Bank stays right without guessing.`;
}

// The next big uncommon bill: a recurring cost of $200 or more that lands every 3 months or less often, a
// connected spreadsheet's cost of $200 or more with no other like it within 90 days, or a one-time cost of $200
// or more added for a later day (on the calendar or in Upcoming), in the next 60 days (not transfers), and how
// much to set aside from each paycheck until then (today's counts). A recurring entry that lands more often (like every
// month) is never one: not as it lands, not changed for its day (a temp, on the calendar or in Upcoming), and not an
// entry with its title and type added for a day by hand.
function savingsTip() {
  const lastDay = addDays(today, DAVE_BILL_DAYS);
  const recurringRows = getParsedRecurringRows();
  const uncommon = recurringRows.filter(row => row.amt <= -DAVE_BIG_BILL && !isTransferEntry(row.sprite) && isUncommonFrequency(row.parsed.frequency));
  const uncommonKeys = new Set(uncommon.map(row => row.parsed.cleanTitle + "|" + row.parsed.special));
  const frequentKeys = new Set(recurringRows.filter(row => !isUncommonFrequency(row.parsed.frequency)).map(row => row.parsed.cleanTitle + "|" + row.parsed.special));
  const uncommonSheets = uncommonSheetKeys(); // A spreadsheet's cost with no other like it within 90 days
  // Is this cost (title and type as compared, on its day) one to remind about?
  const isUncommonBill = (key, mark, day) => !frequentKeys.has(key) &&
    (!mark || (mark === RECURRING_MARK ? uncommonKeys.has(key) : uncommonSheets.has(day.getTime() + "|" + key)));
  const bills = [];

  // On the calendar after today: uncommon recurring and spreadsheet ones as they are there (one changed for its
  // day counts as changed), and one-time costs added for those days
  for (let day = addDays(today, 1); day <= gridEndDate && day <= lastDay; day = addDays(day, 1)) {
    const spot = calendarSpot(day);
    for (const line of String(calendarData[spot.r][spot.c]).split("\n").slice(1)) {
      const parts = getParts(line);
      const amount = parseAmount(parts[1]);
      if (amount > -DAVE_BIG_BILL || systemEmojis.includes(parts[0]) || isTransferEntry(parts[0])) continue;
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
      if (entry.amount <= -DAVE_BIG_BILL && entry.special !== "⭕️" && isUncommonBill(entry.clean + "|" + entry.special, SHEET_MARK, new Date(time)) && !changed.has(key)) {
        bills.push({ date: new Date(time), title: entry.title, amount: entry.amount });
      }
    }
  }
  for (const row of upcoming) {
    if (row.date <= gridEndDate || row.date > lastDay || row.amount > -DAVE_BIG_BILL || isTransferEntry(row.sprite)) continue;
    if (isUncommonBill(cleanString(row.title) + "|" + getSpecialType(row.sprite), entryMark(row.sprite), row.date)) bills.push(row);
  }
  if (bills.length === 0) return null;

  bills.sort((a, b) => a.date - b.date);
  const first = bills[0];
  const more = bills.length > 1 ? `, and ${bills.length - 1} more in the next ${DAVE_BILL_DAYS} days` : "";
  const paydays = paycheckDays(today, addDays(first.date, -1)).length;
  const cost = Math.abs(first.amount);
  const setAside = paydays === 0 ? " It lands before your next paycheck, so check that what you have now covers it."
    : paydays === 1 ? ` Setting aside ${formatMoney(Math.ceil(cost))} from your paycheck before then covers it.`
    : ` Setting aside about ${formatMoney(Math.ceil(cost / paydays))} from each of your ${paydays} paychecks before then covers it.`;
  return `Hey, you have a big uncommon bill coming up: ${first.title} (${formatMoney(first.amount)}) on ${showDay(first.date)}${more}. Make sure you're saving enough to afford it!${setAside}`;
}

// Tracker sums (last 28 / 90 / 365 days) from the calendar and History, the Transfers and Undefined rows'
// titles (every transfer's, and the ones no other row tracks), and the Recurring tab's monthly/yearly summary
function updateTrackerTab() {
  let yearly = 0;
  let monthly = 0;

  // Each row keeps the stored row it came from (stored: null for a row added here), so rows can be added
  // anywhere in the list
  let trackerRows = [];
  for (let stored of trackerData.slice(1)) {
    let title = String(stored[0]).trim().toLowerCase();
    let rawAliases = String(stored[4]);
    if (title === "-") {
      trackerRows.push({ title: stored[1], sum28: 0, sum90: 0, sum365: 0, aliases: "", isSeparator: true, countsTransfers: false, stored });
      continue;
    }
    let aliases = rawAliases.split(",").map(t => t.trim()).filter(t => t !== "");
    trackerRows.push({ title: title, sum28: 0, sum90: 0, sum365: 0, aliases: aliases, isSeparator: false, countsTransfers: title.startsWith("⭕️"), stored });
  }

  // Costs, Gains, Transfers, and Undefined fill in by themselves, can't be deleted, and come back when they're
  // missing (at the end, but Transfers goes just above Undefined). A brand-new budget's tracker (nothing in it
  // yet) also starts with NEW_TRACKER_ROWS after Costs and Gains: ordinary rows, so they can be changed or
  // deleted for good.
  const isNewTracker = trackerRows.length === 0;
  const autoRow = (title, aliases = []) => ({ title, sum28: 0, sum90: 0, sum365: 0, aliases, isSeparator: false, countsTransfers: false, stored: null });
  const findRow = (name) => trackerRows.findIndex(row => !row.isSeparator && cleanString(row.title) === name);
  if (findRow("costs") === -1) trackerRows.push(autoRow("Costs", ["Leave Empty"]));
  if (findRow("gains") === -1) trackerRows.push(autoRow("Gains", ["Leave Empty"]));
  if (isNewTracker) {
    for (let [title, aliases] of NEW_TRACKER_ROWS) {
      trackerRows.push({ ...autoRow(title.toLowerCase(), aliases), stored: [title, "", "", "", normalizeAliases(aliases.map(alias => ({ title: alias, count: "all" })))] });
    }
  }
  if (findRow("transfers") === -1) {
    const undefinedRow = findRow("undefined");
    trackerRows.splice(undefinedRow === -1 ? trackerRows.length : undefinedRow, 0, autoRow("Transfers"));
  }
  if (findRow("undefined") === -1) trackerRows.push(autoRow("Undefined"));
  const costIndex = findRow("costs");
  const gainIndex = findRow("gains");
  const transferIndex = findRow("transfers");
  const undefIndex = findRow("undefined");
  // Their titles are filled in again from the entries every time (below), so a title leaves Undefined once a
  // row counts it, and either one once its entries are older than 365 days
  trackerRows[transferIndex].aliases = [];
  trackerRows[undefIndex].aliases = [];
  trackerRows[transferIndex].countsTransfers = true;

  // Days up to today, newest first: the calendar, then History
  let pastCells = [];
  for (let r = 3; r >= 0; r--) {
    for (let c = 6; c >= 0; c--) {
      if (gridDates[r][c] <= today) pastCells.push(String(calendarData[r][c]).trim());
    }
  }
  for (let r = 1; r < historyData.length; r++) {
    for (let c = 6; c >= 0; c--) {
      pastCells.push(String(historyData[r][c]).trim());
    }
  }

  const startOfYear = createSafeMidnight(`01/01/${today.getFullYear()}`);
  const pastDays = getDayDifference(today, startOfYear) + 1;
  let counter = 0;

  // Entry title -> the rows with an alias for it, and which of its amounts each counts.
  // (A Map, so titles like "constructor" can't collide with an object's built-in properties.)
  let aliasDictionary = new Map();
  for (let tr = 0; tr < trackerRows.length; tr++) {
    if ([undefIndex, costIndex, gainIndex, transferIndex].includes(tr) || trackerRows[tr].isSeparator) continue;
    for (let alias of trackerRows[tr].aliases) {
      let { clean, count } = parseAlias(alias);
      if (!clean) continue;
      if (!aliasDictionary.has(clean)) aliasDictionary.set(clean, []);
      aliasDictionary.get(clean).push({ trackerIndex: tr, count });
    }
  }

  const addToRow = (row, amount) => {
    row.sum365 += amount;
    if (counter <= 90) row.sum90 += amount;
    if (counter <= 28) row.sum28 += amount;
  };

  for (let i = 0; i < pastCells.length; i++) {
    counter++;
    if (counter > 365) break;
    let cellText = pastCells[i];
    if (!cellText) continue;
    let lines = cellText.split("\n");
    for (let l = 1; l < lines.length; l++) {
      const line = readLine(lines[l]);
      if (line.system || line.amount === 0) continue;
      const lineTitle = line.titleClean;
      const lineAmt = line.amount;

      // Transfers move money between your own accounts, so they aren't costs or gains (Hidden entries are):
      // the Transfers row counts every one instead
      const isTransfer = isTransferEntry(line.sprite);
      if (lineAmt > 0 && !isTransfer) addToRow(trackerRows[gainIndex], lineAmt);
      if (lineAmt < 0 && !isTransfer) addToRow(trackerRows[costIndex], lineAmt);
      if (isTransfer) {
        if (!trackerRows[transferIndex].aliases.includes(lineTitle)) trackerRows[transferIndex].aliases.push(lineTitle);
        addToRow(trackerRows[transferIndex], lineAmt);
      }

      // Every row tracking this title counts it, once each (transfers only in rows that count them)
      let countedBy = new Set();
      for (let match of aliasDictionary.get(lineTitle) || []) {
        let row = trackerRows[match.trackerIndex];
        if (countedBy.has(row) || !aliasCounts(match.count, lineAmt)) continue;
        if (isTransfer && !row.countsTransfers) continue;
        countedBy.add(row);
        addToRow(row, lineAmt);
      }

      // Everything else no row tracks goes to Undefined (transfers never do: the Transfers row has them)
      if (countedBy.size === 0 && !isTransfer) {
        if (!trackerRows[undefIndex].aliases.includes(lineTitle)) trackerRows[undefIndex].aliases.push(lineTitle);
        addToRow(trackerRows[undefIndex], lineAmt);
      }

      if (lineAmt < 0 && counter <= pastDays && !isTransfer) yearly += lineAmt;
    }
  }

  // Write the sums back
  let newRows = trackerRows.map((trackerRow) => {
    let row = trackerRow.stored ? [...trackerRow.stored] : [trackerRow.title, "", "", "", ""];
    while (row.length < 5) row.push("");
    if (trackerRow.isSeparator) {
      row[2] = "";
      row[3] = "";
    } else {
      row[1] = formatMoney(trackerRow.sum28);
      row[2] = formatMoney(trackerRow.sum90);
      row[3] = formatMoney(trackerRow.sum365);
    }
    return row;
  });
  newRows[undefIndex][4] = trackerRows[undefIndex].aliases.join(", ");
  newRows[transferIndex][4] = trackerRows[transferIndex].aliases.join(", ");
  newRows[gainIndex][4] = trackerRows[gainIndex].aliases.join(", ");
  newRows[costIndex][4] = trackerRows[costIndex].aliases.join(", ");
  trackerData = [trackerData[0], ...newRows];

  // Recurring summary: about how much the recurring costs add up to each month, and Yearly: this year's
  // spending so far (above) plus every recurring cost still to land this year. Today's already count
  // as spent, so those start tomorrow. Like the spending so far, transfers (like one to savings) aren't
  // spending.
  const tomorrow = addDays(today, 1);
  const endOfThisYear = new Date(today.getFullYear(), 11, 31);
  for (let row of getParsedRecurringRows()) {
    if (row.amt >= 0 || isTransferEntry(row.sprite)) continue;
    monthly += row.amt * timesPerMonth(row.parsed.frequency);
    yearly += row.amt * countRecurringHits(row.parsed, tomorrow, endOfThisYear);
  }
  recurringData[0][5] = formatMoney(Math.round(yearly * 100) / 100);
  recurringData[0][2] = formatMoney(Math.round(monthly * 100) / 100);
}

/* ---------- Paycheck Calculator ---------- */
// Calculator tab: [row][0] label, [row][1] value. Rows 0-2 are the results, rows 4-20 the inputs
// (the last calculation's inputs, which start the next one, like the spreadsheet's form defaults).

const CALCULATOR_RESULTS = [
  { row: 0, key: "takeHome", label: "Take Home" },
  { row: 1, key: "taxes", label: "Taxes" },
  { row: 2, key: "gross", label: "Gross" }
];

// section/unit are shown on the page. fallback is used until a value has been saved (otherwise 0).
const CALCULATOR_INPUTS = [
  { row: 4,  key: "basePay",                  label: "Base Pay",                       section: "Earnings",           unit: "$/hr" },
  { row: 5,  key: "regularHours",             label: "Regular Hours",                  section: "Earnings",           unit: "hrs" },
  { row: 6,  key: "overtimeMultiplier",       label: "Overtime Multiplier",            section: "Earnings",           unit: "×", fallback: 1.5 },
  { row: 7,  key: "overtimeHours",            label: "Overtime Hours",                 section: "Earnings",           unit: "hrs" },
  { row: 8,  key: "premiumMultiplier",        label: "Premium Multiplier",             section: "Earnings",           unit: "×", fallback: 2 },
  { row: 9,  key: "premiumHours",             label: "Premium Hours",                  section: "Earnings",           unit: "hrs" },
  { row: 10, key: "taxableAllowances",        label: "Taxable Allowances",             section: "Earnings",           unit: "$" },
  { row: 11, key: "preTaxMedicalPercent",     label: "Pre-tax Medical Percentage",     section: "Pre-tax Deductions", unit: "%" },
  { row: 12, key: "preTaxMedicalFixed",       label: "Pre-tax Medical Fixed",          section: "Pre-tax Deductions", unit: "$" },
  { row: 13, key: "preTaxRetirementPercent",  label: "Pre-tax Retirement Percentage",  section: "Pre-tax Deductions", unit: "%" },
  { row: 14, key: "preTaxRetirementFixed",    label: "Pre-tax Retirement Fixed",       section: "Pre-tax Deductions", unit: "$" },
  { row: 15, key: "ficaPercent",              label: "FICA Taxes",                     section: "Taxes",              unit: "%", fallback: 7.65 },
  { row: 16, key: "federalPercent",           label: "Federal Taxes",                  section: "Taxes",              unit: "%" },
  { row: 17, key: "statePercent",             label: "State Taxes",                    section: "Taxes",              unit: "%" },
  { row: 18, key: "postTaxPercent",           label: "Post-tax Deductions Percentage", section: "Post-tax",           unit: "%" },
  { row: 19, key: "postTaxFixed",             label: "Post-tax Deductions Fixed",      section: "Post-tax",           unit: "$" },
  { row: 20, key: "nontaxableReimbursements", label: "Non-taxable Reimbursements",     section: "Post-tax",           unit: "$" }
];

// The saved inputs as numbers ({ [key]: number })
function readCalculatorInputs() {
  let inputs = {};
  for (let field of CALCULATOR_INPUTS) {
    let stored = String(calculatorData[field.row]?.[1] ?? "").trim();
    inputs[field.key] = stored === "" ? (field.fallback ?? 0) : parseAmount(stored);
  }
  return inputs;
}

// The saved results ({ takeHome, taxes, gross }), or null before the first calculation
function readCalculatorResults() {
  let results = {};
  for (let field of CALCULATOR_RESULTS) {
    let stored = String(calculatorData[field.row]?.[1] ?? "").trim();
    if (stored === "") return null;
    results[field.key] = parseAmount(stored);
  }
  return results;
}

// The spreadsheet's paycheck math, step for step (each step rounded to cents like payroll software)
function computePaycheck(inputs) {
  const roundCurrency = (num) => Math.round(num * 100) / 100;
  // 1. Earnings
  const regPay = roundCurrency(inputs.regularHours * inputs.basePay);
  const otRate = roundCurrency(inputs.basePay * inputs.overtimeMultiplier);
  const otPay = roundCurrency(inputs.overtimeHours * otRate);
  const premPay = roundCurrency(inputs.premiumHours * (inputs.basePay * inputs.premiumMultiplier));
  const grossPay = regPay + otPay + premPay + inputs.taxableAllowances;
  // 2. Pre-tax deductions: medical/HSA lowers both the FICA and income tax bases, retirement only income tax
  const medicalDed = roundCurrency((grossPay * (inputs.preTaxMedicalPercent / 100)) + inputs.preTaxMedicalFixed);
  const ficaTaxablePay = grossPay - medicalDed;
  const retirementDed = roundCurrency((grossPay * (inputs.preTaxRetirementPercent / 100)) + inputs.preTaxRetirementFixed);
  const incomeTaxablePay = ficaTaxablePay - retirementDed;
  // 3. Taxes: FICA on the FICA base, federal and state on the income tax base
  const ficaTax = roundCurrency(ficaTaxablePay * (inputs.ficaPercent / 100));
  const federalTax = roundCurrency(incomeTaxablePay * (inputs.federalPercent / 100));
  const stateTax = roundCurrency(incomeTaxablePay * (inputs.statePercent / 100));
  const totalTaxes = roundCurrency(ficaTax + federalTax + stateTax);
  // 4. Post-tax deductions
  const postTaxDed = roundCurrency((grossPay * (inputs.postTaxPercent / 100)) + inputs.postTaxFixed);
  // 5. Take home: income-taxable pay, minus taxes and post-tax deductions, plus reimbursements
  const netPay = roundCurrency(incomeTaxablePay - totalTaxes - postTaxDed + inputs.nontaxableReimbursements);
  return { regPay, otPay, premPay, grossPay, medicalDed, retirementDed, ficaTaxablePay, incomeTaxablePay, ficaTax, federalTax, stateTax, totalTaxes, postTaxDed, netPay };
}

// Calculate a paycheck, then save its inputs (they start the next calculation) and results
function calculator(values) {
  let inputs = {};
  for (let field of CALCULATOR_INPUTS) {
    let value = values[field.key];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      throw new BudgetInputError(`${field.label} needs to be a number (0 or more).`);
    }
    if (value > MAX_AMOUNT) throw new BudgetInputError(`${field.label} can be up to 1,000,000,000.`);
    inputs[field.key] = value;
  }
  let paycheck = computePaycheck(inputs);
  let results = { takeHome: paycheck.netPay, taxes: paycheck.totalTaxes, gross: paycheck.grossPay };

  while (calculatorData.length < TABLE_SHAPES.calculator.minRows) calculatorData.push(["", ""]);
  for (let field of CALCULATOR_INPUTS) {
    calculatorData[field.row][0] = field.label;
    calculatorData[field.row][1] = String(inputs[field.key]);
  }
  for (let field of CALCULATOR_RESULTS) {
    calculatorData[field.row][0] = field.label;
    calculatorData[field.row][1] = formatMoney(results[field.key]);
  }

  formEntryRow[2] = "🧮 Calculator";
  formEntryRow[3] = "Base Pay: " + formatMoney(inputs.basePay);
  formEntryRow[4] = "Regular Hours: " + inputs.regularHours;
  // The spreadsheet joined these two as text ("5" and "0" logged as "50"); this adds them
  formEntryRow[5] = "Other Hours: " + Math.round((inputs.overtimeHours + inputs.premiumHours) * 100) / 100;
  formEntryRow[6] = "Take Home: " + formatMoney(paycheck.netPay);
  return { paycheck };
}

/* ---------- Daily reminders (the spreadsheet's Google Calendar notification) ---------- */
// The API sends the "🗓️ Check Budget" push notifications and serves the calendar link, both
// optional in Settings. It needs to know which days get a reminder, so after every change the
// page sends it this plan (only when it changed).

const REMINDER_PLAN_KEY = "prismal_reminder_plan"; // The last plan this browser sent
let reminderSync = Promise.resolve();

// Days from today through the 28 days after the calendar that need a reminder, using the
// spreadsheet's three notification flags:
//   negative: that day's In Bank is negative (⛔️)
//   uncommon: uncommon recurring payments from that day to the end of its 4-week calendar (✔️)
//   cost:     that day has a cost (❗️)
// Days past the calendar are worked out the same way the daily update will fill them in.
function buildReminderPlan() {
  let recurringRows = getParsedRecurringRows();
  let futureByDate = groupFutureRowsByDate();
  let lastDay = addDays(gridEndDate, 28);
  let sheetDays = sheetEntriesByDay(nextFourStart, lastDay);

  // Uncommon recurring payments per day, through the end of the last day's 4-week calendar
  let uncommonRows = recurringRows.filter(row => isUncommonFrequency(row.parsed.frequency));
  let countsEnd = addDays(lastDay, 27 - lastDay.getDay());
  let uncommonCounts = [];
  for (let day = today; day <= countsEnd; day = addDays(day, 1)) {
    uncommonCounts.push(uncommonRows.filter(row => recurringRowHits(row.parsed, day)).length);
  }

  let days = {};
  let inBank = readInBank(calendarData[3][6]) ?? 0;
  for (let day = today, i = 0; day <= lastDay; day = addDays(day, 1), i++) {
    let cellText;
    let dayInBank;
    if (day <= gridEndDate) {
      let index = getDayDifference(day, gridStartDate);
      cellText = calendarData[Math.floor(index / 7)][index % 7];
      dayInBank = readInBank(cellText) ?? 0;
    } else {
      // The day as the daily update will fill it in, then the In Bank math (like the catch-up)
      let math = applyCellBudgetMath(dayAfterCalendar(day, recurringRows, futureByDate, sheetDays), inBank);
      cellText = math.text;
      dayInBank = inBank = math.inBank;
    }

    let windowEnd = getDayDifference(addDays(day, 27 - day.getDay()), today);
    let uncommon = 0;
    for (let c = i; c <= windowEnd; c++) uncommon += uncommonCounts[c];
    let reminder = {
      negative: dayInBank < 0,
      uncommon: uncommon,
      cost: cellText.split("\n").some(line => line.trim().startsWith("✴️")) // The Costs line
    };
    if (reminder.negative || reminder.uncommon > 0 || reminder.cost) days[formatToYMD(day)] = reminder;
  }
  return { from: formatToYMD(today), to: formatToYMD(lastDay), days: days };
}

// A day after the calendar the way the daily update will fill it in (before its In Bank, see performDailyUpdate): its
// Upcoming entries, then, when scheduled, its recurring entries and connected spreadsheets' entries. recurringRows,
// futureByDate, and sheetDays: from getParsedRecurringRows, groupFutureRowsByDate, and sheetEntriesByDay, made once.
function dayAfterCalendar(day, recurringRows, futureByDate, sheetDays, scheduled = true) {
  let text = formatToMMDD(day);
  for (let f of futureByDate.get(day.getTime()) || []) {
    text += `\n${String(futureData[f][3])} ${formatMoney(parseAmount(futureData[f][1]))} ${String(futureData[f][0]).trim()}`;
  }
  return scheduled ? writeSheetsToCell(writeRecurringToCell(text, day, recurringRows), sheetDays.get(day.getTime())) : text;
}

// Send the plan (and this device's time zone) to the API when it changed. Never blocks the page.
// force sends it even if this browser already did (Settings does this when a reminder is turned on).
function queueReminderPlanSync(force = false) {
  reminderSync = reminderSync
    .then(() => syncReminderPlan(force))
    .catch(err => { console.warn("Couldn't send the reminder plan:", err); return false; });
  return reminderSync;
}

// Send the reminder plan when it isn't the one this browser sent last (or force)
async function syncReminderPlan(force) {
  if (!workspaceLoaded) return false;
  const payload = { plan: buildReminderPlan(), timezone: currentTimeZone() };
  const text = JSON.stringify(payload);
  let lastSent = null;
  try { lastSent = localStorage.getItem(REMINDER_PLAN_KEY); } catch {}
  if (!force && text === lastSent) return true;

  const result = await budgetApi("/api/notify/plan", payload);
  if (result.ok) {
    try { localStorage.setItem(REMINDER_PLAN_KEY, text); } catch {}
  }
  return result.ok;
}

// This device's time zone (reminders go out at the reminder time where the user is)
function currentTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch (e) {
    return "UTC";
  }
}

//#endregion

// Save every table that changed. Each save carries the budget's revision this page holds, and the API
// refuses one from an older copy (the budget was saved on another device or tab since): then nothing
// more is sent, and the page reloads with the newest budget instead of saving over it.
async function saveChanges() {
  savingNow = true;
  try {
    return await saveChangedTables();
  } finally {
    savingNow = false;
    if (budgetConflict) reloadForNewerBudget();
  }
}

// Send every table that changed (see saveChanges); resolves to true when they all saved
async function saveChangedTables() {
  const token = localStorage.getItem('prismal_jwt');
  if (!token) {
    console.error("No active session found. Changes not saved.");
    return false;
  }

  // Never save before the real data has loaded: the empty placeholders would overwrite it
  if (!workspaceLoaded) {
    console.error("Workspace hasn't loaded yet. Changes not saved.");
    return false;
  }

  // Becomes false if any section fails to save (returned to the caller)
  let allSaved = true;

  // Send one table. Change Logs aren't critical: a failed log save doesn't count against allSaved.
  async function sendUpdate(endpoint, payload, critical = true) {
    // Skip tables whose stored copy couldn't be read, so it isn't replaced
    const tableName = endpoint.replace('/api/data/update-', '');
    if (unsavableTables.has(tableName)) {
      console.error(`Not saving "${tableName}": its stored data couldn't be read when loading.`);
      if (critical) allSaved = false;
      return false;
    }
    // Nothing more is sent once a save was refused (a newer copy elsewhere) or the session ended
    const ok = !budgetConflict && !signingOut && await postUpdate(endpoint, payload);
    if (!ok && critical) allSaved = false;
    return ok;
  }

  // (A 401 signs the page out: see budgetApi)
  async function postUpdate(endpoint, payload) {
    const result = await budgetApi(endpoint, dataRevision === null ? payload : { ...payload, revision: dataRevision });
    if (result.status === 409 && result.data && result.data.conflict) budgetConflict = true;
    if (result.ok && result.data && Number.isInteger(result.data.revision)) dataRevision = result.data.revision;
    return result.ok;
  }

  // Every table that changed, in BUDGET_TABLES' order. Quick entries stored in the calendar, History, or
  // Upcoming go with it, so the API drops them from its queue in the same save. Change Logs aren't critical: a
  // failed log save doesn't hold back the daily update's date.
  for (const [table, { get, edited, saved }] of Object.entries(BUDGET_TABLES)) {
    if (!edited()) continue;
    const done = [...(quickEntryAcks[table] || [])];
    const data = get();
    const ok = await sendUpdate(`/api/data/update-${table}`, done.length > 0 ? { data, quickEntriesDone: done } : { data }, table !== "logs");
    if (!ok) continue;
    saved();
    if (done.length > 0) quickEntryAcks[table] = quickEntryAcks[table].filter(id => !done.includes(id));
  }
  return allSaved;
}

// One request to the API with the login token: a POST of JSON when there's a payload, a GET otherwise.
// Resolves to { ok, status, data } and never throws (status 0 = the server couldn't be reached).
// A 401 means the session ended on the server, so the page signs out (see signedOutElsewhere).
async function budgetApi(endpoint, payload) {
  const token = localStorage.getItem('prismal_jwt');
  if (!token) return { ok: false, status: 401, data: null };
  try {
    const res = await fetch(`${window.API_BASE_URL}${endpoint}`, {
      method: payload === undefined ? 'GET' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: payload === undefined ? undefined : JSON.stringify(payload)
    });
    let data = null;
    try { data = await res.json(); } catch (e) {}
    if (res.status === 401) signedOutElsewhere();
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    console.error(`Failed to reach ${endpoint}:`, err);
    return { ok: false, status: 0, data: null };
  }
}

// The session ended on the server (Sign Out Everywhere, a new password on another device, or it ran
// out), so this page signs out too instead of trying to save again and again. Nothing more is saved
// (the server would refuse it), and the login page says why. It slides right, like any sign-out.
let signingOut = false;
function signedOutElsewhere() {
  if (signingOut || window.PAGE === "quick") return;
  signingOut = true;
  workspaceLoaded = false;
  if (typeof clearSignedInData === "function") clearSignedInData();
  else ["prismal_jwt", "prismal_username", "prismal_last_activity"].forEach(key => { try { localStorage.removeItem(key); } catch (e) {} });
  try { sessionStorage.setItem("prismal_signed_out", "expired"); } catch (e) {}
  if (typeof window.transitionTo === "function") window.transitionTo("/login.html", true, "right");
  else window.location.replace("/login.html");
}

//#endregion

// =====================================================================
// #region OTHER HELPERS
// =====================================================================

// Rebuild a stored table as rows of strings, keeping EVERY row and column that was saved.
// Accepts a 2D array (normal) or a flat array (chunked into shape.cols per row).
function normalizeApiTable(rawData, shape) {
  let parsed = rawData;
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed); } catch (e) { parsed = []; }
  }
  if (!Array.isArray(parsed)) parsed = [];

  const toCell = (value) => (value === null || value === undefined) ? "" : String(value);
  let rows = [];

  if (parsed.some(Array.isArray)) {
    // 2D: one stored row per row (a stray non-array value becomes a one-cell row)
    rows = parsed.map(row => Array.isArray(row) ? row.flat(Infinity).map(toCell) : [toCell(row)]);
  } else {
    // Flat: chunk into rows of shape.cols
    for (let i = 0; i < parsed.length; i += shape.cols) {
      rows.push(parsed.slice(i, i + shape.cols).map(toCell));
    }
  }

  // Pad short rows and make sure the header rows exist
  for (let row of rows) {
    while (row.length < shape.cols) row.push("");
  }
  while (rows.length < shape.minRows) rows.push(new Array(shape.cols).fill(""));
  return rows;
}

// Rebuild the Other Accounts store: { version: 3, list, equity, coming, inBank }
//   list: [0] column titles, then [name, balance today, "default" | "", starting amount, interest rate, interest
//         since] (see Other Accounts in BUDGET LOGIC). The default account, Savings, is added if it's missing.
//         Balances come only from entries, so a version 2 store's typed-in balance in [1] isn't kept.
//   equity: the spreadsheet's business-version (LLC) equity tables, { tabName: table }, kept as stored
//           (the website doesn't change them). A store without a version is only these tables.
//   coming: each account's changes after today, for the Quick Entry page (accountChangesAhead fills it in again;
//           it's kept as stored until then, so loading the budget alone doesn't count as a change)
//   inBank: In Bank from today on, for the Quick Entry page (inBankAhead; kept as stored until then too)
function normalizeApiAccounts(rawData) {
  let parsed = rawData;
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed); } catch (e) { parsed = {}; }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) parsed = {};
  let isCurrent = parsed.version === 2 || parsed.version === ACCOUNTS_VERSION;

  let storedEquity = isCurrent ? parsed.equity : parsed;
  let equity = {};
  if (storedEquity && typeof storedEquity === 'object' && !Array.isArray(storedEquity)) {
    for (let tabName of Object.keys(storedEquity)) {
      if (tabName === "__proto__") continue; // Would replace the object's prototype instead of adding a table
      equity[tabName] = normalizeApiTable(storedEquity[tabName], TABLE_SHAPES.account);
    }
  }

  let list = normalizeApiTable(isCurrent ? parsed.list : [], TABLE_SHAPES.accounts);
  if (parsed.version === 2) list.forEach((row, i) => { if (i > 0) row[1] = formatMoney(0); });
  list[0] = ["Account", "Balance", "Default", "Starting", "Interest", "Interest Since"];
  if (!list.some((row, i) => i > 0 && isDefaultAccount(row))) {
    let savings = list.findIndex((row, i) => i > 0 && cleanString(row[0]) === cleanString(DEFAULT_ACCOUNT));
    if (savings !== -1) list[savings][2] = "default";
    else list.splice(1, 0, [DEFAULT_ACCOUNT, formatMoney(0), "default", ""]);
  }
  const accounts = { version: ACCOUNTS_VERSION, list, equity };
  const isChange = (item) => Array.isArray(item) && item.length === 3 && typeof item[0] === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(item[1]) && Number.isFinite(item[2]);
  if (isCurrent && Array.isArray(parsed.coming)) accounts.coming = parsed.coming.filter(isChange);
  const isDay = (item) => Array.isArray(item) && item.length === 2 && /^\d{4}-\d{2}-\d{2}$/.test(item[0]) && Number.isFinite(item[1]);
  if (isCurrent && Array.isArray(parsed.inBank)) accounts.inBank = parsed.inBank.filter(isDay);
  return accounts;
}

// The calendar as exactly rows x cols cells of text, whatever shape it was stored in (flat or rows)
function normalizeApiGrid(rawData, rows, cols) {
  let parsed = rawData;
  if (typeof rawData === 'string') {
    try { parsed = JSON.parse(rawData); } catch(e) { parsed = []; }
  }
  if (!Array.isArray(parsed)) parsed = [];

  let flatData = parsed.flat(Infinity);
  let grid = [];
  let index = 0;
  for (let r = 0; r < rows; r++) {
    let row = [];
    for (let c = 0; c < cols; c++) {
      row.push(flatData[index] !== undefined ? String(flatData[index]) : "");
      index++;
    }
    grid.push(row);
  }
  return grid;
}

// The calendar's 28 days, 4 rows of Sunday through Saturday, starting with the budget's week (today)
function getGridDates() {
  let now = createSafeMidnight(today ? new Date(today.getTime()) : new Date());
  let dayOfWeek = now.getDay(); // 0 is Sunday
  let startDate = new Date(now);
  startDate.setDate(now.getDate() - dayOfWeek);

  let datesArray = [];
  for (let r = 0; r < 4; r++) {
    let row = [];
    for (let c = 0; c < 7; c++) {
      let cellDate = new Date(startDate);
      cellDate.setDate(startDate.getDate() + (r * 7 + c));
      row.push(cellDate);
    }
    datesArray.push(row);
  }
  return datesArray;
}

// Days from date2 to date1 (rounded, so a daylight saving change's 23- or 25-hour day still counts as one)
function getDayDifference(date1, date2) {
  return Math.round((date1.getTime() - date2.getTime()) / 86400000);
}

// A line's words: [sprite, amount, ...title]
function getParts(line) {
  return String(line).trim().split(/\s+/);
}

// A calendar day's first line: MM/DD
function formatToMMDD(dateObj) {
  if (!(dateObj instanceof Date) || isNaN(dateObj.getTime())) {
    return "";
  }

  // Remembered by the moment, since the same days are formatted over and over
  let cacheKey = dateObj.getTime();
  if (mmddCache.has(cacheKey)) {
    return mmddCache.get(cacheKey);
  }

  let mm = String(dateObj.getMonth() + 1).padStart(2, '0');
  let dd = String(dateObj.getDate()).padStart(2, '0');
  let formattedDate = `${mm}/${dd}`;

  mmddCache.set(cacheKey, formattedDate);
  return formattedDate;
}

// An amount as stored and shown: -$1234.56 or $1234.56
function formatMoney(amount) {
  let rounded = Math.round(amount * 100) / 100;
  let isNegative = rounded < 0;
  let absAmt = Math.abs(rounded)
    .toFixed(2);
  return isNegative ? `-$${absAmt}` : `$${absAmt}`;
}

// An amount someone typed -> a number, or NaN when it isn't one. Dollar signs, spaces, and thousands
// commas are ignored ("$1,234.50"). A comma before the last one or two digits is the decimal point, the
// way phones in many countries type it: "4,50" is 4.50 (never 450), and so is "1.234,50" 1234.50.
function readMoneyInput(text) {
  let clean = String(text ?? "").replace(/[$\s]/g, "");
  if (/^[+-]?\d{1,3}(\.\d{3})+,\d{1,2}$/.test(clean)) clean = clean.replace(/\./g, "").replace(",", ".");
  else if (/^[+-]?\d+,\d{1,2}$/.test(clean)) clean = clean.replace(",", ".");
  else clean = clean.replace(/,/g, "");
  return /^[+-]?(\d+\.?\d*|\.\d+)$/.test(clean) ? Number(clean) : NaN;
}

// A stored amount ("-$1234.56") -> -1234.56; 0 when there isn't one
function parseAmount(val) {
  if (!val) return 0;
  let str = String(val)
    .replace(/[^\d.-]/g, '');
  if (str.startsWith("-")) {
    return -Math.abs(parseFloat(str)) || 0;
  }
  return parseFloat(str) || 0;
}

// An entry line's title ("❗️ -$5.00 Iced Coffee" -> "iced coffee", or as written with clean false)
function extractTitle(line, clean = true) {
  if (!line) return "";
  let parts = getParts(line)
  if (parts.length <= 2) return "";
  let title = parts.slice(2)
    .join(" ");
  if (clean) title = cleanString(title);
  return title;
}

// One line of a day ("❗️ -$5.00 Coffee") read once: { sprite, amount, title (as written, "" without one),
// clean (the title as compared, cleanString), titleClean (without its Other Account, titleKey), system (a line
// the budget writes itself: In Bank, Gains, Costs), blank }. Cached by its text: every change reads the same lines again (all of History, for the tracker and
// the accounts), so each is only split up the first time.
const lineCache = new Map();
function readLine(line) {
  const text = String(line ?? "");
  let read = lineCache.get(text);
  if (read) return read;
  const parts = getParts(text);
  const title = parts.slice(2).join(" ");
  read = { sprite: parts[0], amount: parseAmount(parts[1]), title, clean: title ? cleanString(title) : "", titleClean: title ? titleKey(title) : "", system: systemEmojis.includes(parts[0]), blank: !text.trim() };
  if (lineCache.size >= 20000) lineCache.clear();
  lineCache.set(text, read);
  return read;
}

// A title as it's compared: lowercase, single spaces, and only letters (in any language) and numbers, so
// "Coffee", "coffee", and "COFFEE!" are one title while "Café", "Кофе", and "咖啡" stay themselves.
// A title with no letters or numbers at all (like ☕) keeps its symbols, so different ones stay
// different. The invisible "show as emoji" characters (variation selectors, like the one after the circle
// in ⭕️) are dropped first: they count as marks, so otherwise "⭕️Food" wouldn't compare as "Food".
// The API's quick.js cleanTitle matches this. Cached: every change compares the same titles thousands of times.
// An entry's Other Account is compared on its own: "Payday → Savings" is "payday → savings", so it's a different
// entry from "Payday" or "Payday → HSA" (the tracker and Search compare titles without it, see titleKey).
const cleanCache = new Map();
function cleanString(title) {
  if (!title) return "";
  const text = String(title);
  let clean = cleanCache.get(text);
  if (clean !== undefined) return clean;
  const { title: own, account } = splitAccount(text);
  clean = account ? [tidyTitle(own), ACCOUNT_ARROW, tidyTitle(account)].filter(Boolean).join(" ") : tidyTitle(text);
  if (cleanCache.size >= 5000) cleanCache.clear();
  cleanCache.set(text, clean);
  return clean;
}

// One part of a title, compared: lowercase letters and numbers (symbols only when it has neither), single spaces
function tidyTitle(text) {
  const lower = text.normalize("NFKC").toLowerCase().replace(/\p{Variation_Selector}/gu, "");
  const tidy = (pattern) => lower.replace(pattern, "").replace(/\s+/g, " ").trim();
  return tidy(/[^\p{L}\p{M}\p{N}\s]/gu) || tidy(/[^\p{L}\p{M}\p{N}\p{S}\s]/gu);
}

// A title as the tracker and Search compare it, without its Other Account: "Groceries → Cash" is "groceries", so
// the Groceries row counts it. One with no title of its own ("→ Savings") goes by the account's name.
function titleKey(title) {
  const { title: own, account } = splitAccount(title);
  return cleanString(own || account);
}

// Each word's first letter (in any language) capitalized: "coffee shop" -> "Coffee Shop", "école" -> "École". An
// Other Account after the title keeps its name as it is.
function capitalize(string) {
  const { title, account } = splitAccount(getParts(string).join(" "));
  const words = getParts(title).map(word => word.replace(/\p{L}/u, char => char.toUpperCase())).join(" ");
  return account ? withAccount(words, account) : words;
}

// "Payday Transfer → Savings" -> { title: "Payday Transfer", account: "Savings" }, "→ Savings" -> { title: "",
// account: "Savings" }; without an arrow, the whole text is the title and account is ""
function splitAccount(text) {
  const value = ` ${String(text ?? "").trim()}`;
  const at = value.lastIndexOf(` ${ACCOUNT_ARROW} `);
  const account = at >= 0 ? value.slice(at + 3).trim() : "";
  return account ? { title: value.slice(0, at).trim(), account } : { title: value.trim(), account: "" };
}

// A typed title can't hold the arrow: it's what marks the Other Account picked (withAccount), so a typed one would
// put the entry in an account without picking it
const TITLE_ARROW = `Titles can't have ${ACCOUNT_ARROW} in them. To put an entry in an Other Account, pick the account under Other Account.`;

// An entry's title with the Other Account picked for it, which never changes the title: "Payday → Savings", or
// "→ Savings" with no title of its own. Only an entry with one is for an account (linkedAccount), even if its
// title is an account's name.
function withAccount(title, account) {
  const own = String(title ?? "").replace(/\s+/g, " ").trim();
  const name = String(account ?? "").trim();
  if (!name) return own;
  return own ? `${own} ${ACCOUNT_ARROW} ${name}` : `${ACCOUNT_ARROW} ${name}`;
}

// An entry's refraction type from its sprite: ✖️ Hidden, ⭕️ Transfer, or ❗️ Regular
function getSpecialType(emo) {
  if (!emo) return "❗️";
  if (emo.includes("✖️")) return "✖️";
  if (emo.includes("⭕️")) return "⭕️";
  return "❗️";
}

// The existing entry's type, and its mark (✔️ or ➕) or the incoming one's
function combineSprites(existingSprite, incomingSprite) {
  let specialType = getSpecialType(existingSprite);
  return specialType + (entryMark(existingSprite) || entryMark(incomingSprite));
}

// Where a sprite says an entry comes from: ✔️ a recurring entry, ➕ a connected spreadsheet, or "" (its own).
// It comes before the type while the entry is just as it landed (✔️⭕️, ➕❗️), and after it once it's been
// changed for its day (⭕️✔️, ❗️➕): a temp.
const RECURRING_MARK = "✔️";
const SHEET_MARK = "➕";
function entryMark(sprite) {
  let text = String(sprite || "");
  if (text.includes(RECURRING_MARK)) return RECURRING_MARK;
  if (text.includes(SHEET_MARK)) return SHEET_MARK;
  return "";
}

// A placeholder stands in for an entry that's expected (like an estimate). It counts like any other entry, and the
// daily update deletes it once its day has passed (see dropPlaceholders), so none are ever left on a day that passed
// (History never has one). It's kept as ⏳ at the end of the entry's sprite ("❗️⏳", "✔️⭕️⏳", "⭕️✔️⏳"), after its type
// and mark, which nothing reading those notices. Days show it in yellow (Budget UI.js renderEntryLine). When two
// entries become one (the same title and type on a day), it's a placeholder only if both were, so real money is never
// deleted with it.
const PLACEHOLDER_MARK = "⏳";
function isPlaceholder(sprite) {
  return String(sprite ?? "").includes(PLACEHOLDER_MARK);
}

// A sprite without its placeholder mark
function withoutPlaceholder(sprite) {
  return String(sprite ?? "").split(PLACEHOLDER_MARK).join("");
}

// A sprite as a placeholder (placeholder true) or not
function placeholderSprite(sprite, placeholder) {
  return withoutPlaceholder(sprite) + (placeholder ? PLACEHOLDER_MARK : "");
}

// An entry line as people see it (and logs keep it): without the placeholder mark ("❗️⏳ -$40.00 Gas" -> "❗️ -$40.00 Gas")
function shownLine(line) {
  const text = String(line ?? "");
  const sprite = getParts(text)[0] || "";
  return isPlaceholder(sprite) ? text.replace(sprite, withoutPlaceholder(sprite)) : text;
}

// Returns the Recurring tab index of the entry with this title + special type that hits on date, or false
function recurringHits(title, date, targetSpecial) {
  const cleanTargetTitle = cleanString(title);

  for (let i = 2; i < recurringData.length; i++) {
    const item = recurringData[i];
    // The title and type first: they're quicker to check than the dates
    if (!item || item[0] === "-" || cleanString(item[0]) !== cleanTargetTitle) continue;
    if (targetSpecial) {
      const emo = item[5] || "";
      if (getSpecialType(emo) !== targetSpecial) continue;
    }

    if (recurringRowHits(parseRecurringRow(item), date)) return i;
  }

  return false;
}

// Parse a Recurring tab row into what the date checks need (null for separators/empty rows).
// A frequency that can't be read lands monthly. An End Date that's blank, "None" (in any capitals), or can't be
// read means it never ends, the same as writeRecurring and releaseEndedTemps read it.
function parseRecurringRow(item) {
  if (!item || item[0] === "-") return null;
  const endText = String(item[4] ?? "").trim();
  const endDate = endText && endText.toLowerCase() !== "none" ? createSafeMidnight(endText, true) : null;
  return {
    cleanTitle: cleanString(item[0]),
    special: getSpecialType(item[5] || ""),
    startDate: createSafeMidnight(item[2]),
    endDate: endDate && !isNaN(endDate.getTime()) ? endDate : null,
    frequency: parseFrequency(item[3]) || { count: 1, unit: "months" }
  };
}

/* ---------- Recurring frequencies: every N days, weeks, or months ---------- */
// Stored in a recurring row's [3] as "Every 2 Weeks", "Every Month", "Every 12 Months", ... counted from
// the Start Date. The spreadsheet's names still read the same: Weekly, Biweekly, Monthly, 3 Month,
// 6 Month, and Yearly are every 1 week, 2 weeks, 1 month, 3, 6, and 12 months. Its Semi-Monthly (the
// 1st and 15th) has no every-N version, so a row that has it keeps it.

const MAX_FREQUENCY_COUNT = 999;
const FREQUENCY_UNIT_NAMES = new Map([["days", "Day"], ["weeks", "Week"], ["months", "Month"]]);
const SPREADSHEET_FREQUENCIES = new Map([
  ["weekly", { count: 1, unit: "weeks" }],
  ["biweekly", { count: 2, unit: "weeks" }],
  ["bi-weekly", { count: 2, unit: "weeks" }],
  ["monthly", { count: 1, unit: "months" }],
  ["3 month", { count: 3, unit: "months" }],
  ["6 month", { count: 6, unit: "months" }],
  ["yearly", { count: 12, unit: "months" }],
  ["semi-monthly", { count: 1, unit: "semimonthly" }]
]);

// "Every 2 Weeks" (or "2 weeks", "every month", "Biweekly") -> { count: 2, unit: "weeks" }; null if unreadable
function parseFrequency(text) {
  let clean = String(text ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  if (SPREADSHEET_FREQUENCIES.has(clean)) return { ...SPREADSHEET_FREQUENCIES.get(clean) };
  let match = clean.match(/^(?:every )?(?:(\d+) )?(day|week|month)s?$/);
  if (!match) return null;
  let count = match[1] === undefined ? 1 : Number(match[1]);
  if (!Number.isInteger(count) || count < 1 || count > MAX_FREQUENCY_COUNT) return null;
  return { count, unit: match[2] + "s" };
}

// { count: 2, unit: "weeks" } -> "Every 2 Weeks" (how it's stored and shown); a count of 1 is "Every Week"
function formatFrequency(frequency) {
  if (frequency.unit === "semimonthly") return "Semi-Monthly";
  let unit = FREQUENCY_UNIT_NAMES.get(frequency.unit) || "Month";
  return frequency.count === 1 ? `Every ${unit}` : `Every ${frequency.count} ${unit}s`;
}

// The spreadsheet's frequency names are rewritten the new way ("Biweekly" becomes "Every 2 Weeks")
function normalizeFrequencies() {
  for (let i = 2; i < recurringData.length; i++) {
    let row = recurringData[i];
    if (!row || String(row[0]).trim() === "-") continue;
    let frequency = parseFrequency(row[3]);
    if (frequency) row[3] = formatFrequency(frequency);
  }
}

// A stored frequency as people read it ("Biweekly" shows as "Every 2 Weeks")
function describeFrequency(text) {
  let frequency = parseFrequency(text);
  return frequency ? formatFrequency(frequency) : String(text ?? "");
}

// About how many times a month it lands (the Recurring page's Monthly)
function timesPerMonth(frequency) {
  const daysPerMonth = 365.25 / 12;
  if (frequency.unit === "days") return daysPerMonth / frequency.count;
  if (frequency.unit === "weeks") return daysPerMonth / (7 * frequency.count);
  if (frequency.unit === "semimonthly") return 2;
  return 1 / frequency.count;
}

// "Uncommon" recurring entries land every 3 months or less often (like the spreadsheet's 3 Month,
// 6 Month, and Yearly): Dave points them out, and they get a reminder
function isUncommonFrequency(frequency) {
  if (frequency.unit === "months") return frequency.count >= 3;
  if (frequency.unit === "weeks") return frequency.count >= 13;
  if (frequency.unit === "days") return frequency.count >= 90;
  return false;
}

// Does this parsed recurring row land on date?
function recurringRowHits(row, date) {
  if (date < row.startDate) return false;
  if (row.endDate && date > row.endDate) return false;
  const { count, unit } = row.frequency;
  const startDate = row.startDate;

  switch (unit) {
    case "days":
    case "weeks": {
      const days = getDayDifference(date, startDate);
      return days >= 0 && days % (unit === "weeks" ? 7 * count : count) === 0;
    }

    case "semimonthly":
      return date.getDate() === 1 || date.getDate() === 15;

    default: {
      // Months: the Start Date's day of the month, or the month's last day when the month is shorter
      // (the 31st lands on the 30th, Feb 29 on Feb 28)
      const lastDayInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
      if (date.getDate() !== Math.min(startDate.getDate(), lastDayInMonth)) return false;
      const monthDiff = (date.getFullYear() - startDate.getFullYear()) * 12 + date.getMonth() - startDate.getMonth();
      return monthDiff >= 0 && monthDiff % count === 0;
    }
  }
}

// How many days from first through last (local midnights) a parsed recurring row lands on: the same days
// recurringRowHits says yes to, counted without checking every day (a year of days, for every recurring
// cost, on every change, was most of a change's time in January)
function countRecurringHits(row, first, last) {
  const from = row.startDate > first ? row.startDate : first;
  const to = row.endDate && row.endDate < last ? row.endDate : last;
  if (from > to) return 0;
  const { count, unit } = row.frequency;
  if (unit === "days" || unit === "weeks") {
    const step = unit === "weeks" ? 7 * count : count;
    const firstHit = Math.ceil(getDayDifference(from, row.startDate) / step) * step; // Days after the start
    const lastDay = getDayDifference(to, row.startDate);
    return firstHit > lastDay ? 0 : Math.floor((lastDay - firstHit) / step) + 1;
  }
  // The 1st and 15th, or a day in every month: a month at a time (a short month lands on its last day)
  let hits = 0;
  const lastMonth = to.getFullYear() * 12 + to.getMonth();
  for (let month = from.getFullYear() * 12 + from.getMonth(); month <= lastMonth; month++) {
    const [year, monthIndex] = [Math.floor(month / 12), month % 12];
    const days = unit === "semimonthly" ? [1, 15] : [Math.min(row.startDate.getDate(), new Date(year, monthIndex + 1, 0).getDate())];
    for (const day of days) {
      const date = new Date(year, monthIndex, day);
      if (date >= from && date <= to && recurringRowHits(row, date)) hits++;
    }
  }
  return hits;
}

// For fixing a cell by hand from the browser's console, like updateGridCell("calendar", 0, 3, "10/14\n❗️ -$5.00 Tea"):
// sets one cell of a table and saves that table. It skips the budget math and the Change Logs, so reload the
// page afterwards to see everything worked out again.
window.updateGridCell = async function(gridName, row, col, textValue) {
  const tables = {
    calendar:   { data: calendarData,   markEdited: () => { calendarEdited = true; } },
    recurring:  { data: recurringData,  markEdited: () => { recurringEdited = true; } },
    tracker:    { data: trackerData,    markEdited: () => { trackerEdited = true; } },
    future:     { data: futureData,     markEdited: () => { futureEdited = true; } },
    history:    { data: historyData,    markEdited: () => { historyEdited = true; } },
    search:     { data: searchData,     markEdited: () => { searchEdited = true; } },
    calculator: { data: calculatorData, markEdited: () => { calculatorEdited = true; } }
  };
  const target = Object.prototype.hasOwnProperty.call(tables, gridName) ? tables[gridName] : null;
  if (!target) {
    console.error(`There's no table called "${gridName}". The tables are: ${Object.keys(tables).join(", ")}.`);
    return false;
  }

  if (!target.data[row]) target.data[row] = [];
  target.data[row][col] = textValue;
  target.markEdited();
  if (gridName === "calendar") {
    const cell = document.querySelectorAll(".elastic-table .cell-content")[row * 7 + col];
    if (cell) cell.innerText = textValue;
  }

  const saved = await saveChanges();
  console.log(saved ? `Saved ${gridName} [${row}][${col}]. Reload the page to see it worked out again.` : `Couldn't save ${gridName}.`);
  return saved;
};

//#endregion

// =====================================================================
// #region LAYOUT FUNCTIONS
// =====================================================================

// Home's calendar and History's days (both .elastic-table) zoom and move the same way. Home's table is wired
// here; History draws its table later (and again after a change), so Budget Pages.js wires each one it draws.

// 1. TOUCH: TWO-FINGER PINCH ON A DAY, AND SWIPING BETWEEN ZOOMED DAYS
// Two fingers on one day pinch, stretch, turn, and move just that day, which settles back when they let go. Two
// fingers that start on different days (or off the days) zoom the page itself, like anywhere else on it.

let isTransforming = false;
let targetEl = null;
let startDist = 0, startAngle = 0;
let startCenterX = 0, startCenterY = 0;

// Two fingers: how far apart they are, at what angle, and the point between them
const getDistance = (t1, t2) => Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
const getAngle = (t1, t2) => Math.atan2(t2.clientY - t1.clientY, t2.clientX - t1.clientX) * (180 / Math.PI);
const getCenter = (t1, t2) => ({ x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 });

// A swipe on a zoomed day: at least this far sideways, and mostly sideways. Once the finger has gone DAY_DRAG_START_PX,
// a phone's zoomed day follows it (only a little way, when there's no day that way to slide to).
const DAY_SWIPE_PX = 50;
const DAY_DRAG_START_PX = 12;
const DAY_DRAG_STRETCH = 0.3;
const DAY_SETTLE_MS = 220;
let daySwipe = null; // { cell, x, y, atLeft, atRight, dragging, base, offset } for the finger on a zoomed day

const wiredTables = new WeakSet();

// Pinching a day, swiping a zoomed one, and tapping a day to zoom it, on this table (once)
function wireElasticTable(table) {
  if (!table || wiredTables.has(table)) return;
  wiredTables.add(table);

  table.addEventListener('touchstart', (e) => {
    noteDaySwipe(e);
    if (e.touches.length !== 2) return;
    const t1 = e.touches[0];
    const t2 = e.touches[1];
    const cell1 = t1.target.closest('td');
    const cell2 = t2.target.closest('td');
    if (!cell1 || cell1 !== cell2 || !cell1.querySelector('.cell-content')) return;

    targetEl = cell1.querySelector('.cell-content');
    // A zoomed day stays over the dimmed page, already shows everything, and keeps its scroll
    if (!cell1.classList.contains('is-editing')) {
      cell1.style.zIndex = '20';
      targetEl.style.overflow = 'visible';
    }
    isTransforming = true;
    startDist = getDistance(t1, t2);
    startAngle = getAngle(t1, t2);
    const center = getCenter(t1, t2);
    startCenterX = center.x;
    startCenterY = center.y;
    targetEl.style.transition = 'none';
  }, { passive: false });

  table.addEventListener('touchmove', (e) => {
    if (followDaySwipe(e) || !isTransforming || e.touches.length !== 2) return;
    e.preventDefault();
    const t1 = e.touches[0];
    const t2 = e.touches[1];
    const scale = getDistance(t1, t2) / startDist;
    const rotate = getAngle(t1, t2) - startAngle;
    const center = getCenter(t1, t2);
    targetEl.style.transform = `translate(${center.x - startCenterX}px, ${center.y - startCenterY}px) scale(${scale}) rotate(${rotate}deg)`;
  }, { passive: false });

  table.addEventListener('touchend', (e) => {
    endTransform(e);
    finishDaySwipe(e);
  });
  table.addEventListener('touchcancel', (e) => {
    if (daySwipe?.dragging) settleDraggedDay(daySwipe);
    daySwipe = null;
    endTransform(e);
  });
  table.addEventListener('click', zoomTappedDay);
}

// The fingers let go: the day settles back
function endTransform(e) {
  if (!isTransforming || e.touches.length >= 2) return;
  isTransforming = false;
  targetEl.style.transition = '';
  targetEl.style.transform = '';
  targetEl.style.overflow = '';

  const parentTd = targetEl.closest('td');
  if (parentTd) parentTd.style.zIndex = '';
  targetEl = null;
}

// One finger down on the zoomed day: where, and whether its entries are already scrolled all the way to either side
// (until they are, a sideways swipe scrolls them instead of moving to another day)
function noteDaySwipe(e) {
  if (daySwipe?.dragging) settleDraggedDay(daySwipe);
  daySwipe = null;
  const cell = e.touches.length === 1 ? e.target.closest('td') : null;
  if (!cell || cell !== activeEditCell || cell.classList.contains('isZoomClosing')) return;
  const content = cell.querySelector('.cell-content');
  const touch = e.touches[0];
  // (A phone's zoomed day doesn't scroll sideways: its long lines end in "..." instead)
  const most = content && getComputedStyle(content).overflowX !== 'hidden' ? content.scrollWidth - content.clientWidth : 0;
  daySwipe = { cell, x: touch.clientX, y: touch.clientY, atLeft: !content || content.scrollLeft <= 1, atRight: !content || content.scrollLeft >= most - 1, dragging: false, base: '', offset: 0 };
}

// The finger moving on a phone's zoomed day: once it has gone DAY_DRAG_START_PX, mostly sideways (and the day's lines
// can't scroll that way), the day moves with it, so it's clear a slide to the next day (or the one before) is coming.
// With no day that way, it only gives a little. Says whether the move was a swipe's.
function followDaySwipe(e) {
  const swipe = daySwipe;
  if (!swipe || e.touches.length !== 1) return false;
  const dx = e.touches[0].clientX - swipe.x;
  const dy = e.touches[0].clientY - swipe.y;
  if (!swipe.dragging) {
    // Sideways so far: the move stays the day's (it isn't a scroll)
    if (Math.hypot(dx, dy) < DAY_DRAG_START_PX) {
      if (Math.abs(dx) > Math.abs(dy) && e.cancelable) e.preventDefault();
      return true;
    }
    const sideways = Math.abs(dx) >= Math.abs(dy) * 1.5 && (dx < 0 ? swipe.atRight : swipe.atLeft);
    if (!sideways) {
      daySwipe = null; // A scroll, not a swipe
      return false;
    }
    // (A computer's doubled day, and less motion: no following, the slide just happens when the finger lifts)
    if (swipe.cell !== activeEditCell || !swipe.cell.classList.contains('is-fullZoom') || reducedMotion()) return false;
    swipe.dragging = true;
    swipe.base = swipe.cell.style.transform;
  }
  if (e.cancelable) e.preventDefault();
  const moved = dx - Math.sign(dx) * DAY_DRAG_START_PX;
  swipe.offset = nextZoomableDay(swipe.cell, dx < 0 ? 1 : -1) ? moved : moved * DAY_DRAG_STRETCH;
  swipe.cell.style.transform = `translateX(${swipe.offset}px) ${swipe.base}`;
  return true;
}

// A day that followed the finger, but isn't sliding over, goes back to its place
function settleDraggedDay(swipe) {
  const cell = swipe.cell;
  cell.style.transform = swipe.base;
  if (cell !== activeEditCell || !cell.animate || !swipe.offset) return;
  cell.animate(
    [{ transform: `translateX(${swipe.offset}px) ${swipe.base}` }, { transform: swipe.base }],
    { duration: DAY_SETTLE_MS, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)' }
  );
}

// The finger lifted: a swipe left goes to the next day, and a swipe right to the day before. One that only went a
// little way (or came back) leaves the day where it is.
function finishDaySwipe(e) {
  const swipe = daySwipe;
  daySwipe = null;
  if (!swipe || e.touches.length > 0 || !e.changedTouches[0]) return;
  const dx = e.changedTouches[0].clientX - swipe.x;
  const dy = e.changedTouches[0].clientY - swipe.y;
  const step = dx < 0 ? 1 : -1;
  const slides = Math.abs(dx) >= DAY_SWIPE_PX && Math.abs(dx) >= Math.abs(dy) * 1.5 && (dx < 0 ? swipe.atRight : swipe.atLeft);
  if (!swipe.dragging) {
    if (slides) slideToDay(step);
    return;
  }
  if (slides && swipe.cell === activeEditCell && nextZoomableDay(swipe.cell, step)) slideToDay(step, swipe.offset);
  else settleDraggedDay(swipe);
}

// 2. CLICK TO EDIT (PERSISTENT ZOOM)
// A tapped day zooms in over a dimmed page and stays zoomed until its v, or anything outside it, is tapped. The page
// under it holds still meanwhile (lockPageScroll). Entries never wrap: a day that isn't zoomed cuts them off at its
// edge. On a computer it doubles in size (scaled, see budgetStyle.css), as tall as its lines, and its entries run
// past its edges over the dimmed page (it moves left when its widest entry would run off the screen). On phones
// (touch screens and narrow windows) every day zooms the same: as wide as most of the screen, as tall as its lines
// (more lines than fit scroll), and an entry longer than the screen ends in "..." at its edge (tapping it shows it
// whole). It's laid out at that size (--zoom times its own spacing, its text a bit less: --zoomText), not scaled up
// from the tiny day, so everything in it stays sharp; a scale only runs while it grows out of the day and shrinks
// back into it.

window.editingCell = false;
let activeEditCell = null;
const fullZoomQuery = window.matchMedia("(max-width: 760px), (pointer: coarse)");
// Does the device ask for less motion?
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let zoomBackdrop = null;
// A phone's zoomed day: this share of the screen's width (up to ZOOM_MAX_WIDTH pixels); its text this share of what that
// zoom would make it, between ZOOM_TEXT_MIN and ZOOM_TEXT_MAX pixels; at least this share of its width tall; and up to
// this share of the screen's height (taller lines scroll)
const ZOOM_WIDTH_SHARE = 0.92;
const ZOOM_MAX_WIDTH = 560;
const ZOOM_TEXT_SHARE = 0.82;
const ZOOM_TEXT_MIN = 15;
const ZOOM_TEXT_MAX = 19;
const ZOOM_MIN_HEIGHT_SHARE = 0.3;
const ZOOM_HEIGHT_SHARE = 0.84;
// What a zoom sets on its day (and closing it takes off)
const ZOOM_PROPERTIES = ['transform', 'transform-origin', '--zoom', '--zoomText', '--dayX', '--dayY', '--dayW', '--dayH', '--viewW', '--viewH'];
// How long a phone's day takes to grow out of its spot, to shrink back into it, and to slide over to the day next to it
const ZOOM_OPEN_MS = 420;
const ZOOM_CLOSE_MS = 320;
const DAY_SLIDE_MS = 340;
const ZOOM_EASING = 'cubic-bezier(0.33, 0, 0.2, 1)';

// A zoomed day's v (close), for Home's days and History's
function zoomCloseButton() {
  const button = document.createElement('button');
  button.className = 'cell-action-btn';
  button.type = 'button';
  button.textContent = 'v';
  button.setAttribute('aria-label', 'Close day');
  return button;
}

// Zoom a day in (closing any other): doubled on a computer, laid out to fill the screen on a phone.
// animate: false puts it there at once (History zooming a day back in after drawing its days again).
function zoomDay(cell, animate = true) {
  if (activeEditCell) closeZoomedDay();
  // A day tapped again while it was shrinking back stops shrinking
  if (cell.zoomClose) {
    cell.zoomClose.cancel();
    cell.zoomClose = null;
  }
  cell.classList.remove('isZoomClosing');
  window.editingCell = true;
  activeEditCell = cell;
  const place = cell.getBoundingClientRect(); // Where it is before it's doubled
  cell.classList.add('is-editing');
  if (!zoomBackdrop) {
    // In the page's own layer, just under the zoomed day (a backdrop in <body> would cover the day too)
    zoomBackdrop = document.createElement('div');
    zoomBackdrop.className = 'dayZoomBackdrop';
    document.getElementById('transitionContainer')?.appendChild(zoomBackdrop);
  }
  zoomBackdrop.classList.add('shown');
  lockPageScroll(true);
  if (!fullZoomQuery.matches) {
    keepDoubledDayOnScreen(cell, place);
    return;
  }
  cell.classList.add('is-fullZoom');
  fitZoomedDay(animate);
}

// immediate: no shrinking back into the day (leaving the page)
function closeZoomedDay(immediate = false) {
  const cell = activeEditCell;
  window.editingCell = false;
  activeEditCell = null;
  if (zoomBackdrop) zoomBackdrop.classList.remove('shown');
  lockPageScroll(false);
  if (!cell) return;
  const finish = () => unzoomCell(cell);
  const scale = Number(cell.style.getPropertyValue('--zoom')) || 1;
  if (immediate || !cell.classList.contains('is-fullZoom') || !cell.animate || reducedMotion()) {
    finish();
    return;
  }
  // It shrinks back into its day (still laid out big, scaled down to the day's size), then is the day again.
  // A tap on it meanwhile zooms it right back in (zoomDay), and its entries don't open (Calendar Page.js).
  cell.classList.add('isZoomClosing');
  cell.zoomClose = cell.animate(
    [{ transform: cell.style.transform }, { transform: dayInPlace(cell, scale) }],
    { duration: ZOOM_CLOSE_MS, easing: 'cubic-bezier(0.4, 0, 0.6, 1)', fill: 'forwards' } // Holds the shrunk day until finish puts it back
  );
  cell.zoomClose.onfinish = finish;
}

// While a day is zoomed, the page under it holds still (html.dayZoomed, budgetStyle.css), so sliding from day to day
// doesn't move the page too. A finger that drags anywhere but the zoomed day's own lines (when they scroll) or a box over
// it doesn't scroll the page either (phones don't always honor the page's overflow). That listener is only there while
// a day is zoomed: one that can stop scrolling makes the browser wait on the page before every scroll.
function lockPageScroll(locked) {
  document.documentElement.classList.toggle('dayZoomed', locked);
  if (locked) document.addEventListener('touchmove', holdPageStill, { passive: false });
  else document.removeEventListener('touchmove', holdPageStill);
}

// A finger dragging while a day is zoomed (see lockPageScroll)
function holdPageStill(e) {
  if (!activeEditCell || e.touches.length !== 1) return;
  const lines = activeEditCell.querySelector('.cell-content');
  if (lines && lines.contains(e.target) && lines.scrollHeight > lines.clientHeight + 1) return;
  if (e.target.closest?.('.budgetPanel, .datePicker, .searchBar')) return;
  e.preventDefault();
}

// A day that was zoomed is just a day again (after it shrank back into its spot, or slid off the screen), unless it
// was zoomed again in the meantime
function unzoomCell(cell) {
  const animation = cell.zoomClose;
  cell.zoomClose = null;
  if (activeEditCell === cell) return;
  const content = cell.querySelector('.cell-content');
  // Straight back to the day: the day's own transform transition (budgetStyle.css) would otherwise slide it in
  // from the middle of the screen, where the zoomed layout was, after it had already shrunk into place
  cell.style.transition = 'none';
  cell.classList.remove('is-editing', 'is-magnified', 'is-fullZoom', 'isZoomClosing');
  for (const property of ZOOM_PROPERTIES) cell.style.removeProperty(property);
  if (animation) animation.cancel(); // It held its last frame until now (fill: forwards)
  // Its first lines show again (a day that isn't zoomed would keep a zoomed day's scroll, hidden)
  if (content) content.scrollTop = content.scrollLeft = 0;
  void cell.offsetWidth; // Apply that with no transition before turning transitions back on
  cell.style.removeProperty('transition');
}

// When a day is on a table, its date as a number (Home's days by their spot, History's by their date), or null
function dayTime(td) {
  if (td.dataset.date) {
    const date = createSafeMidnight(td.dataset.date, true);
    return isNaN(date.getTime()) ? null : date.getTime();
  }
  const row = gridDates[td.dataset.row];
  return row && row[td.dataset.col] ? row[td.dataset.col].getTime() : null;
}

// The day on from's table that's step days from it (1: the next day, -1: the day before), counting the days that have
// something on them, or null
function nextZoomableDay(from, step) {
  const table = from && from.closest('table');
  if (!table) return null;
  const days = [...table.querySelectorAll('td')]
    .filter(td => dayTime(td) !== null && td.querySelector('.cell-content')?.childElementCount)
    .sort((a, b) => dayTime(a) - dayTime(b));
  const at = days.indexOf(from);
  return at === -1 ? null : days[at + step] || null;
}

// The zoomed day moves to the next day (step 1) or the day before (-1) on its table. On a phone the zoomed day slides
// off the screen as the next one slides on, each at its own size; on a computer the next one just zooms in. dragged:
// how far a finger had already moved it sideways (followDaySwipe), where both start from.
function slideToDay(step, dragged = 0) {
  const from = activeEditCell;
  const to = nextZoomableDay(from, step);
  if (!to) return;
  if (!from.classList.contains('is-fullZoom') || !from.animate || reducedMotion()) {
    zoomDay(to, false);
    return;
  }
  const leaving = from.style.transform.replace(/^translateX\([^)]*\)\s*/, ''); // (Without a finger's drag)
  activeEditCell = null; // So zoomDay leaves it zoomed while it slides away
  zoomDay(to, false);
  const arriving = to.style.transform;
  // The screen's width, in the page's pixels (fewer on a page that's pinch-zoomed in)
  const width = (document.documentElement.clientWidth || window.innerWidth) / (to.zoomPinch || 1);
  to.animate(
    [{ transform: `translateX(${step * width + dragged}px) ${arriving}` }, { transform: arriving }],
    { duration: DAY_SLIDE_MS, easing: ZOOM_EASING }
  );
  from.classList.add('isZoomClosing'); // Its entries don't open while it goes (Calendar Page.js)
  from.style.transform = leaving;
  from.zoomClose = from.animate(
    [{ transform: `translateX(${dragged}px) ${leaving}` }, { transform: `translateX(${-step * width}px) ${leaving}` }],
    { duration: DAY_SLIDE_MS, easing: ZOOM_EASING, fill: 'forwards' }
  );
  from.zoomClose.onfinish = () => unzoomCell(from);
}

// On a zoomed day, the left and right arrow keys go to the day before and the next day (not while typing, or with a
// panel open)
document.addEventListener('keydown', (e) => {
  if (!activeEditCell || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target.closest?.('input, textarea, select, [contenteditable]') || document.querySelector('.budgetPanel')) return;
  e.preventDefault();
  slideToDay(e.key === 'ArrowRight' ? 1 : -1);
});

// A zoomed day goes back to normal when the page is left (so Back never shows it still zoomed)
window.FloatingWindows?.closeOnPageExit(() => closeZoomedDay(true));

// A phone's zoomed layout shrunk so its day sits right over the day in the table (where a zoom grows from and
// shrinks back to): scaled by 1 / --zoom, and moved by where the day is in its scrolled area
function dayInPlace(cell, scale) {
  const content = cell.querySelector('.cell-content');
  const x = (cell.zoomBox ? cell.zoomBox.x : 0) - (content ? content.scrollLeft : 0);
  const y = (cell.zoomBox ? cell.zoomBox.y : 0) - (content ? content.scrollTop : 0);
  return `translate(${-x / scale}px, ${-y / scale}px) scale(${1 / scale})`;
}

// How wide a day's widest line is at its own size, with the day's padding on both sides (0 for no lines)
function widestDayLine(content) {
  const padding = parseFloat(getComputedStyle(content).paddingRight) || 0;
  let widest = 0;
  for (const line of content.children) {
    if (!line.classList.contains('cell-action-btn')) widest = Math.max(widest, line.offsetWidth);
  }
  return widest > 0 ? widest + 2 * padding : 0;
}

// How tall a day's lines are together, as they're laid out now (the ones it shows: not its v, or History's big date
// once it's zoomed), to the fraction of a pixel
function dayLinesHeight(content) {
  let height = 0;
  for (const line of content.children) {
    if (!line.classList.contains('cell-action-btn') && line.getClientRects().length > 0) height += line.getBoundingClientRect().height;
  }
  return height;
}

// On a computer the day doubles where it is (budgetStyle.css). When its widest entry would run off the right
// side of the window, it moves left just enough (but never off the left side). place: where it is, not doubled.
function keepDoubledDayOnScreen(cell, place) {
  const content = cell.querySelector('.cell-content');
  if (!content) return;
  const zoom = parseFloat(getComputedStyle(cell).getPropertyValue('--zoom')) || 1;
  const originX = parseFloat(getComputedStyle(cell).transformOrigin) || 0;
  const left = place.left - originX * (zoom - 1);
  const right = left + Math.max(place.width, widestDayLine(content)) * zoom;
  const margin = place.width * 0.1;
  const viewWidth = document.documentElement.clientWidth || window.innerWidth;
  const shift = Math.min(right - (viewWidth - margin), left - margin);
  if (shift > 0) cell.style.transform = `translateX(${-shift}px) scale(${zoom})`;
}

// Lay a phone's zoomed day out: how big (--zoom, and --zoomText for its text) and where. Every day of a table zooms the
// same (they're all one size): ZOOM_WIDTH_SHARE of the screen's width (up to ZOOM_MAX_WIDTH), with its text
// ZOOM_TEXT_SHARE of what that zoom would make it (ZOOM_TEXT_MIN to ZOOM_TEXT_MAX pixels). It's as tall as its lines, laid
// out at that size (at a day's tiny size, text doesn't shrink evenly), from ZOOM_MIN_HEIGHT_SHARE of its width up to
// ZOOM_HEIGHT_SHARE of the screen (more lines scroll), and centered. Its content is as big as the screen, from the
// screen's top left corner, and draws the day itself (budgetStyle.css) at --dayX, --dayY, --dayW by --dayH; a line that
// would run off the screen ends in "..." instead. Measured at its own size (which nothing draws in between), then moved
// there. On a page that's still pinch-zoomed in (a browser that didn't zoom it back out, see unzoomPage), it's laid out
// the same, then moved onto the part of the page on the screen and scaled down by the page's zoom (zoomPinch), so it
// looks just the same. animate: it grows out of the day (opening); without, it just moves (when the screen resizes, or
// the day's entries change), keeping its scroll.
function fitZoomedDay(animate = false) {
  const cell = activeEditCell;
  if (!cell || !cell.classList.contains('is-fullZoom')) return;
  const content = cell.querySelector('.cell-content');
  if (!content) return;
  const scrolled = { left: content.scrollLeft, top: content.scrollTop };
  cell.style.transform = 'none';
  cell.style.setProperty('--zoom', '1');
  cell.style.setProperty('--zoomText', '1');
  const box = cell.getBoundingClientRect();
  const textSize = parseFloat(getComputedStyle(content).fontSize) || 1;
  const view = window.visualViewport;
  const pinch = pageZoomedIn() ? view.scale : 1;
  cell.zoomPinch = pinch;
  const viewWidth = pinch > 1 ? view.width * pinch : (document.documentElement.clientWidth || window.innerWidth);
  const viewHeight = view ? view.height * pinch : window.innerHeight;
  const width = Math.min(viewWidth * ZOOM_WIDTH_SHARE, ZOOM_MAX_WIDTH);
  const scale = width / box.width;
  const textScale = Math.min(Math.max(textSize * scale * ZOOM_TEXT_SHARE, ZOOM_TEXT_MIN), ZOOM_TEXT_MAX) / textSize;
  cell.style.setProperty('--zoom', String(scale));
  cell.style.setProperty('--zoomText', String(textScale));
  const padding = parseFloat(getComputedStyle(content).paddingRight) || 0;
  const linesHeight = dayLinesHeight(content) + 2 * padding;
  const height = Math.min(Math.max(linesHeight, width * ZOOM_MIN_HEIGHT_SHARE), viewHeight * ZOOM_HEIGHT_SHARE);
  const left = (viewWidth - width) / 2;
  const top = (viewHeight - height) / 2;
  cell.zoomBox = { x: left, y: top, width, height };
  for (const [name, pixels] of [['--dayX', left], ['--dayY', top], ['--dayW', width], ['--dayH', height], ['--viewW', viewWidth], ['--viewH', viewHeight]]) {
    cell.style.setProperty(name, `${pixels}px`);
  }
  cell.style.transformOrigin = '0 0';
  const moved = pinch > 1
    ? `translate(${view.offsetLeft - box.left}px, ${view.offsetTop - box.top}px) scale(${1 / pinch})`
    : `translate(${-box.left}px, ${-box.top}px)`;
  cell.style.transform = moved;
  content.scrollLeft = animate ? 0 : scrolled.left;
  content.scrollTop = animate ? 0 : scrolled.top;
  if (animate && cell.animate && !reducedMotion()) {
    cell.animate(
      [{ transform: dayInPlace(cell, scale) }, { transform: moved }],
      { duration: ZOOM_OPEN_MS, easing: ZOOM_EASING }
    );
  }
}

let refitFrame = 0;
// Lay the zoomed day out again on the next frame (once, however often it's asked). While it's still growing or sliding
// in, that waits until it's in place: measured mid-animation, it would be measured at the animation's size.
const refitZoomedDay = () => {
  cancelAnimationFrame(refitFrame);
  refitFrame = requestAnimationFrame(() => {
    const moving = activeEditCell?.getAnimations?.().find(animation => animation.playState === 'running');
    if (moving) moving.finished.then(refitZoomedDay, () => {});
    else fitZoomedDay(false);
  });
};
window.addEventListener('scroll', () => { if (activeEditCell) refitZoomedDay(); }, { passive: true });
window.addEventListener('resize', () => { if (activeEditCell) refitZoomedDay(); });
// (Two fingers zooming or moving the page while it's pinch-zoomed in, or zooming it in: the day follows the screen)
const followPinchedScreen = () => {
  if (activeEditCell?.classList.contains('is-fullZoom') && ((activeEditCell.zoomPinch || 1) > 1 || pageZoomedIn())) refitZoomedDay();
};
window.visualViewport?.addEventListener('resize', followPinchedScreen);
window.visualViewport?.addEventListener('scroll', followPinchedScreen);
// A day tapped while the page was still sliding in was measured on the move
document.getElementById('transitionContainer')?.addEventListener('transitionend', (e) => {
  if (activeEditCell && e.target === e.currentTarget) refitZoomedDay();
});
document.addEventListener('budget:updated', () => { if (activeEditCell) refitZoomedDay(); }); // After the page redraws it

// A tap on a table: its day zooms in, and a zoomed day's v closes it. On a page that's pinch-zoomed in, the page zooms
// back out first, where the browser lets a page do that (unzoomPage); where it doesn't, the zoomed day is laid out on the
// part of the page on the screen instead (fitZoomedDay), so it never lands off the screen.
function zoomTappedDay(e) {
  if (e.target.closest('.cell-action-btn')) {
    closeZoomedDay();
    e.stopPropagation();
    return;
  }

  const cell = e.target.closest('td');
  if (!cell || activeEditCell === cell || !cell.querySelector('.cell-content')?.childElementCount) return;
  // The tap that zooms a day (or zooms one back while it shrinks) doesn't also open the entry or In Bank under it
  // (Calendar Page.js listens on the same table)
  e.stopImmediatePropagation();
  if (pageUnzooming) return;
  if (!pageZoomedIn()) {
    zoomDay(cell);
    return;
  }
  pageUnzooming = true;
  unzoomPage().then(() => {
    pageUnzooming = false;
    if (cell.isConnected && activeEditCell !== cell) zoomDay(cell);
  });
}

// Is the page pinch-zoomed in?
const pageZoomedIn = () => (window.visualViewport?.scale ?? 1) > 1.01;
let pageUnzooming = false;

// The page zooms back out to its normal size: for a moment its viewport can't be zoomed past its normal size, which some
// browsers (like Chrome on Android) take as zooming it back out, and then it can be zoomed again. Resolves once it's back,
// or when it hasn't started zooming out after UNZOOM_START_MS (a browser that leaves it, like Safari or a computer's), or
// after UNZOOM_MAX_MS at most.
const UNZOOM_START_MS = 200;
const UNZOOM_MAX_MS = 700;
function unzoomPage() {
  const view = window.visualViewport;
  const meta = document.querySelector('meta[name="viewport"]');
  if (!view || !meta || !pageZoomedIn()) return Promise.resolve();
  const content = meta.getAttribute('content') || '';
  const started = performance.now();
  return new Promise((resolve) => {
    let timer = 0;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      view.removeEventListener('resize', check);
      meta.setAttribute('content', content);
      // (Then a frame for the page to lay itself out at its new size)
      requestAnimationFrame(() => resolve());
    };
    // It's zooming out: wait for the rest
    const check = () => {
      if (!pageZoomedIn()) return finish();
      clearTimeout(timer);
      timer = setTimeout(finish, Math.max(0, started + UNZOOM_MAX_MS - performance.now()));
    };
    view.addEventListener('resize', check);
    meta.setAttribute('content', `${content}, maximum-scale=1`);
    timer = setTimeout(finish, UNZOOM_START_MS);
  });
}

wireElasticTable(document.querySelector('.elastic-table')); // Home's calendar (History wires its own)

document.addEventListener('click', (e) => {
  if (!window.editingCell || !activeEditCell) return;
  if (activeEditCell.contains(e.target) && !missesZoomedDay(e)) return;
  if (e.target.closest('.budgetPanel, .datePicker')) return; // Working in an entry's panel (or its calendar) keeps its day zoomed
  closeZoomedDay();
});

// A tap on a phone's zoomed day that lands beside the day itself: its content is as big as the screen, but only
// the day, its lines, and its v keep it open. (Where it's scaled down onto a pinch-zoomed page, the tap is scaled up.)
function missesZoomedDay(e) {
  const cell = activeEditCell;
  const content = cell.querySelector('.cell-content');
  if (!cell.classList.contains('is-fullZoom') || e.target !== content || !cell.zoomBox) return false;
  const area = content.getBoundingClientRect();
  const pinch = cell.zoomPinch || 1;
  const x = (e.clientX - area.left) * pinch + content.scrollLeft - cell.zoomBox.x;
  const y = (e.clientY - area.top) * pinch + content.scrollTop - cell.zoomBox.y;
  return x < 0 || y < 0 || x > cell.zoomBox.width || y > cell.zoomBox.height;
}

// 3. PC MOUSE GLIDE & MAGNIFYING GLASS

let isMouseDown = false;
let magnifyDelay = null;

window.addEventListener('pointerup', (e) => {
  if (e.pointerType !== 'mouse') return;

  isMouseDown = false;
  clearTimeout(magnifyDelay); // Clear timer on release

  document.querySelectorAll('.elastic-table td.is-magnified').forEach(cell => {
    cell.classList.remove('is-magnified');
  });
});

document.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || e.pointerType !== 'mouse') return;
  if (e.target.closest('.cell-action-btn')) return;

  const cell = e.target.closest('.elastic-table td');
  if (!cell) return;

  e.preventDefault();
  isMouseDown = true;

  // Delay of 150ms prevents jittering on a fast click
  magnifyDelay = setTimeout(() => {
    if (isMouseDown) cell.classList.add('is-magnified');
  }, 150);
});

document.addEventListener('pointerover', (e) => {
  if (!isMouseDown || e.pointerType !== 'mouse') return;
  const cell = e.target.closest('.elastic-table td');
  if (!cell) return;
  cell.classList.add('is-magnified');
});

document.addEventListener('pointerout', (e) => {
  if (e.pointerType !== 'mouse') return;
  const cell = e.target.closest('.elastic-table td');
  if (!cell) return;

  if (!cell.contains(e.relatedTarget)) {
    cell.classList.remove('is-magnified');
  }
});
// #endregion

// =====================================================================
// #region UNDO + REDO (calendar entries and quick entries)
// =====================================================================
// Each calendar change (New Entry, an entry's Set to / Add to / Move / Delete, the starting balance) and
// each quick entry the budget adds can be undone, then redone. A change is remembered by the days it
// touched: each day's own entries (unique entries and temps, never the lines the budget writes itself),
// from before and after it. Undo puts a day's "before" entries back, but only while it still holds the
// "after" ones, so it never erases anything changed since (it says so, and lets that step go, instead);
// Redo is the same the other way. Everything else (In Bank, recurring entries, the tracker, account
// balances) is worked out again from there, like after any change; a change made in History keeps the accounts'
// balances undone or redone too (keepAccountBalances). Kept for this tab in sessionStorage
// (so going to another page and back keeps it), up to 25 steps, and forgotten on sign-out.

const MAX_UNDO_STEPS = 25;
const OWN_ENTRY_SPRITES = ["❗️", "✖️", "⭕️"];

// A step that can't be taken anymore, because a day it would change was changed since
class StaleHistoryError extends BudgetInputError {
  constructor(message, direction) {
    super(message);
    this.direction = direction;
  }
}

// Where this tab keeps Undo's steps for the signed-in account
const undoStorageKey = () => `prismal_undo_${localStorage.getItem("prismal_username") || ""}`;

// This tab's Undo and Redo steps: { undo, redo }, oldest first
function readUndoHistory() {
  try {
    const stored = JSON.parse(sessionStorage.getItem(undoStorageKey()) || "null");
    if (stored && Array.isArray(stored.undo) && Array.isArray(stored.redo)) return stored;
  } catch (e) {}
  return { undo: [], redo: [] };
}

// Save them for this tab (best effort)
function writeUndoHistory(history) {
  try { sessionStorage.setItem(undoStorageKey(), JSON.stringify(history)); } catch (e) {}
}

// What Undo and Redo would do now: { undo, redo }, each a label like "added Coffee (-$4.50) on 10/05", or null
function undoInfo() {
  const history = readUndoHistory();
  return { undo: history.undo.at(-1)?.label ?? null, redo: history.redo.at(-1)?.label ?? null };
}

// Undo the newest step (it runs, and is logged, like any change)
function undoCalendarChange() {
  return runBudgetAction("↩️ Undo", () => stepThroughHistory("undo"));
}

// Redo the newest step that was undone
function redoCalendarChange() {
  return runBudgetAction("↪️ Redo", () => stepThroughHistory("redo"));
}

// Take the newest step back (undo) or forward again (redo), while every day it touched still holds what
// it left there (undo) or what it found (redo)
function stepThroughHistory(direction) {
  const history = readUndoHistory();
  const step = (direction === "undo" ? history.undo : history.redo).at(-1);
  if (!step) throw new BudgetInputError(direction === "undo" ? "There's nothing to undo." : "There's nothing to redo.");
  const from = direction === "undo" ? "after" : "before";
  const to = direction === "undo" ? "before" : "after";
  const changed = step.days.find(day => JSON.stringify(dayEntries(createSafeMidnight(day.date))) !== JSON.stringify(day[from]));
  if (changed || (step.equity && JSON.stringify(accountsData?.equity ?? null) !== step.equity[from])) {
    const what = changed ? showDay(createSafeMidnight(changed.date)) : "your Other Accounts";
    throw new StaleHistoryError(`That (${step.label}) can't be ${direction === "undo" ? "undone" : "redone"} anymore, because ${what} changed since.`, direction);
  }
  // (A change made in History keeps the accounts' balances, undone or redone too)
  const balances = step.keepBalances ? accountBalancesToday() : null;
  for (const day of step.days) setDayEntries(createSafeMidnight(day.date), day[to]);
  if (step.equity) accountsData.equity = JSON.parse(step.equity[to]);
  formEntryRow[3] = step.label;
  formEntryRow[4] = "Days: " + step.days.map(day => showStoredDate(day.date)).join(", ");
  return { historyStep: { direction, label: step.label }, ...(balances ? { afterRefresh: () => keepAccountBalances(balances) } : {}) };
}

// After a change that can be undone: remember it (and a new change means nothing to redo)
function rememberUndoStep(step) {
  const history = readUndoHistory();
  history.undo.push(step);
  if (history.undo.length > MAX_UNDO_STEPS) history.undo.splice(0, history.undo.length - MAX_UNDO_STEPS);
  history.redo = [];
  writeUndoHistory(history);
}

// After an undo the step can be redone, and after a redo, undone again
function moveHistoryStep(direction) {
  const history = readUndoHistory();
  const [from, to] = direction === "undo" ? [history.undo, history.redo] : [history.redo, history.undo];
  const step = from.pop();
  if (step) to.push(step);
  writeUndoHistory(history);
}

// Forget a step that can't be taken anymore
function dropHistoryStep(direction) {
  const history = readUndoHistory();
  (direction === "undo" ? history.undo : history.redo).pop();
  writeUndoHistory(history);
}

// Before and after a change: each day's own entries. A step keeps only the days that changed.
function captureEntryDays(dates) {
  const days = [];
  for (const date of dates) {
    const day = createSafeMidnight(date);
    if (isNaN(day.getTime())) continue;
    const key = formatToMMDDYYYY(day);
    if (!days.some(known => known.date === key)) days.push({ date: key, lines: dayEntries(day) });
  }
  return { days, equity: JSON.stringify(accountsData?.equity ?? null) };
}

// A change's step: the days whose entries it changed, before and after (null when there's nothing to put back).
// keepBalances: it was made in History, so undoing or redoing it keeps the accounts' balances (changeHistoryEntry).
function makeUndoStep(label, before, keepBalances = false) {
  const after = captureEntryDays(before.days.map(day => createSafeMidnight(day.date)));
  const days = before.days
    .map((day, i) => ({ date: day.date, before: day.lines, after: after.days[i].lines }))
    .filter(day => JSON.stringify(day.before) !== JSON.stringify(day.after));
  // A day that isn't in the budget (before History starts) can't be put back
  if (days.some(day => day.before === null || day.after === null)) return null;
  const equity = before.equity !== after.equity ? { before: before.equity, after: after.equity } : null;
  if (days.length === 0 && !equity) return null;
  return keepBalances ? { label, days, equity, keepBalances } : { label, days, equity };
}

// A day's own entry lines, in order, from the calendar, History, or Upcoming; null when the day isn't in
// the budget at all
function dayEntries(date) {
  if (date >= gridStartDate && date <= gridEndDate) {
    const spot = calendarSpot(date);
    return spot ? ownEntryLines(calendarData[spot.r][spot.c]) : null;
  }
  if (date < gridStartDate) {
    const spot = historySpot(date);
    return spot ? ownEntryLines(historyData[spot.r][spot.c]) : null;
  }
  return futureData.slice(1).filter(row => isUpcomingOn(row, date)).map(row => `${String(row[3]).trim()} ${String(row[1]).trim()} ${String(row[0]).trim()}`);
}

// Put these entry lines on the day in place of its own ones (the rest is rebuilt by refreshBudgetData). A placeholder
// doesn't come back on a day that passed: the daily update deleted it with its day.
function setDayEntries(date, lines) {
  if (date < today) lines = lines.filter(line => !isPlaceholder(getParts(line)[0]));
  if (date >= gridStartDate && date <= gridEndDate) {
    const spot = calendarSpot(date);
    const cell = String(calendarData[spot.r][spot.c] ?? "").split("\n");
    calendarData[spot.r][spot.c] = [cell[0] || formatToMMDD(date), ...cell.slice(1).filter(line => line.trim() && !isOwnEntryLine(line)), ...lines].join("\n");
  } else if (date < gridStartDate) {
    const spot = historySpot(date);
    const cell = String(historyData[spot.r][spot.c] ?? "").split("\n");
    historyData[spot.r][spot.c] = [cell[0], ...cell.slice(1).filter(line => line.trim() && !isOwnEntryLine(line)), ...lines].join("\n");
  } else {
    const kept = futureData.slice(1).filter(row => !isUpcomingOn(row, date));
    const added = lines.map(line => {
      const parts = getParts(line);
      return [parts.slice(2).join(" "), parts[1], formatToMMDDYYYY(date), parts[0]];
    });
    futureData.splice(1, futureData.length - 1, ...kept, ...added);
  }
}

// A cell's own entry lines (not its date, or the lines the budget writes)
function ownEntryLines(cellText) {
  return String(cellText ?? "").split("\n").slice(1).map(line => line.trim()).filter(isOwnEntryLine);
}

// An entry someone added or changed (a unique entry or a temp), not one as it landed
function isOwnEntryLine(line) {
  const text = String(line).trim();
  return OWN_ENTRY_SPRITES.some(sprite => text.startsWith(sprite));
}

// Is this Upcoming row an entry on date?
function isUpcomingOn(row, date) {
  if (String(row[0] ?? "").trim() === "" || systemEmojis.includes(String(row[3] ?? "").trim())) return false;
  const rowDate = createSafeMidnight(row[2], true);
  return !isNaN(rowDate.getTime()) && rowDate.getTime() === date.getTime();
}

// Where a day is on the calendar: { r, c }, or null
function calendarSpot(date) {
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 7; c++) {
      if (gridDates[r][c].getTime() === date.getTime()) return { r, c };
    }
  }
  return null;
}

// Where a day is in History: { r, c }, or null
function historySpot(date) {
  const target = formatToMMDDYYYY(date);
  for (let r = 1; r < historyData.length; r++) {
    for (let c = 0; c < 7; c++) {
      const header = String(historyData[r][c] ?? "").split("\n")[0].trim();
      if (!header) continue;
      if (header === target || createSafeMidnight(header, true).getTime() === date.getTime()) return { r, c };
    }
  }
  return null;
}

//#endregion

// =====================================================================
// #region SAVING SAFELY (unsaved changes, and changes made on another device or tab)
// =====================================================================

// Tables changed here that the server doesn't have yet (Change Logs don't count)
function hasUnsavedChanges() {
  return Object.entries(BUDGET_TABLES).some(([table, { edited }]) => table !== "logs" && edited());
}

// A change the server couldn't get is sent again when the connection comes back, and every 30 seconds
// until then (in line with other changes, never at the same time)
function retryUnsavedChanges() {
  if (!workspaceLoaded || budgetConflict || !hasUnsavedChanges()) return;
  const run = budgetQueue.then(async () => {
    if (!workspaceLoaded || !hasUnsavedChanges()) return;
    if (!(await saveChanges())) return;
    if (pendingProcessedDate && await saveProcessedDate(pendingProcessedDate)) pendingProcessedDate = null;
    if (typeof BudgetUI !== "undefined") BudgetUI.showToast("Your changes are saved now.");
  });
  budgetQueue = run.catch(() => {});
}

// This page's copy is out of date (the budget was saved on another device or tab), so it reloads
// rather than save over the newer one. The page says why after it reloads.
let reloadingBudget = false;
function reloadForNewerBudget() {
  if (reloadingBudget) return;
  reloadingBudget = true;
  workspaceLoaded = false; // Nothing more is saved, and leaving doesn't ask about unsaved changes
  rememberBudgetNotice("conflict");
  window.location.reload();
}

const BUDGET_NOTICES = {
  conflict: ["Your budget was changed on another device or tab, so this page reloaded with the newest version. Your last change wasn't saved, so please make it again.", true],
  refreshed: ["Your budget was changed on another device or tab, so this page refreshed to show it.", false]
};

// A note for the page to show once it reloads
function rememberBudgetNotice(kind) {
  try { sessionStorage.setItem("prismal_budget_notice", kind); } catch (e) {}
}

// Show the note a reload left (once)
function showRememberedBudgetNotice() {
  let kind = null;
  try {
    kind = sessionStorage.getItem("prismal_budget_notice");
    sessionStorage.removeItem("prismal_budget_notice");
  } catch (e) {}
  if (kind && BUDGET_NOTICES[kind] && typeof BudgetUI !== "undefined") BudgetUI.showToast(...BUDGET_NOTICES[kind]);
}

// This device's date isn't the one the page loaded on anymore: midnight passed, or the device moved to
// another time zone (its days' midnights are then different moments, so everything is worked out again)
function deviceDayChanged() {
  return createSafeMidnight(new Date()).getTime() !== pageDay.getTime();
}

// Coming back to this page (another tab, or the phone woke up): if the budget was saved somewhere else
// in the meantime, or a new day started, reload to show it. Not while something here is unsaved: that
// save is refused anyway, and reloads then (and the next change reloads for a new day).
let lastRevisionCheck = 0;
async function checkForNewerBudget() {
  if (document.visibilityState !== "visible" || !workspaceLoaded || dataRevision === null || savingNow || hasUnsavedChanges()) return;
  if (deviceDayChanged()) {
    reloadingBudget = true;
    workspaceLoaded = false;
    window.location.reload();
    return;
  }
  if (Date.now() - lastRevisionCheck < 10000) return;
  lastRevisionCheck = Date.now();
  const known = dataRevision;
  const result = await budgetApi("/api/data/revision");
  if (!result.ok || !result.data || !Number.isInteger(result.data.revision)) return;
  // (A save from this page while the answer was on its way, like a connected spreadsheet's update, moved the
  // revision on itself: that's not a change from somewhere else)
  if (dataRevision !== known) return;
  if (result.data.revision !== dataRevision && workspaceLoaded && !savingNow && !hasUnsavedChanges()) {
    reloadingBudget = true;
    workspaceLoaded = false;
    rememberBudgetNotice("refreshed");
    window.location.reload();
  }
}

if (window.PAGE !== "quick") {
  window.addEventListener("online", retryUnsavedChanges);
  setInterval(retryUnsavedChanges, 30000);
  window.addEventListener("offline", () => {
    if (workspaceLoaded && typeof BudgetUI !== "undefined") BudgetUI.showToast("You're offline. Changes you make will be saved when you're back online.", true);
  });
  // Leaving with changes the server doesn't have yet asks first (the browser shows its own message)
  window.addEventListener("beforeunload", (event) => {
    if (!workspaceLoaded || !hasUnsavedChanges()) return;
    event.preventDefault();
    event.returnValue = "";
  });
  document.addEventListener("visibilitychange", checkForNewerBudget);
  // Back to this page with the browser's Back button: browsers can show it just as it was left (the
  // back/forward cache), so check it the same way
  window.addEventListener("pageshow", (event) => {
    if (!event.persisted) return;
    lastRevisionCheck = 0;
    checkForNewerBudget();
  });
}

//#endregion

// Load (and daily-update) the workspace. Page scripts wait on this before rendering:
//   window.workspaceReady.then(loaded => { if (loaded) render(); });
// The Quick Entry page only borrows the helpers here: it has no login, so it never loads a budget.
window.workspaceReady = window.PAGE === "quick" ? Promise.resolve(false) : loadWorkspace();
window.workspaceReady.then(loaded => { if (loaded) showRememberedBudgetNotice(); });