// Process Budget: the budget itself, for every page that shows one. Loading it from the API and saving what
// changed, the daily update that brings it up to today, every change (calendar entries, recurring entries, the
// tracker, Other Accounts, connected spreadsheets, Quick Entry), the budget math, Bob's message on Home and his page's
// settings, Search, Undo and Redo, and the helpers the pages share (dates, amounts, titles). Pages draw from it and redraw
// on its "budget:updated" event.

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
let notesData = null;    // Entries' notes: { version, entries, recurring } (see ENTRY NOTES)

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
  accounts:   { cols: 10, minRows: 1 }, // Other Accounts: [0] column titles, then [name, balance, "default" | "cash" | "", starting amount, interest rate, interest since, max, compounds, added every, added on]
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
let notesEdited = false;

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

// BOB (his message on Home, see commenceBob)
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
let bobMessage = "";      // Bob's message

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

    const response = await fetch(budgetLoadAddress(), {
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
    const storedAccounts = readLoadedTables(data);
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
    // (recurring entries, math, Bob's message, tracker). Only tables that changed get saved.
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
    await holdQuickEntries(data.quick_entries); // Made with Quick Entry icons: this device's are added, the rest wait on Home
    queueReminderPlanSync();
    return true;

  } catch (err) {
    console.error("Failed to load workspace:", err);
    return false;
  }
}

// Where the budget loads from: /api/data/load, naming the Quick Entry icons this device made or used (ownQuickIcons), whose
// waiting entries it adds as it loads (the API marks only those as picked up; see holdQuickEntries)
function budgetLoadAddress() {
  return `${window.API_BASE_URL}/api/data/load?icons=${encodeURIComponent(ownQuickIcons().join(","))}`;
}

// The budget as /api/data/load sent it, into the page's tables, with its revision and its waiting quick entries'
// signature (see LIVE UPDATES). Returns the stored Other Accounts as they were (to tell whether setting them up changed
// them).
function readLoadedTables(data) {
  dataRevision = Number.isInteger(data.revision) ? data.revision : null;
  quickSignature = typeof data.quick_signature === "string" ? data.quick_signature : null;
  unsavableTables = new Set();

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
  notesData      = normalizeApiNotes(parseDB(data.notes, "notes"));
  return storedAccounts;
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
  // % entries (see PERCENT_MARK) on the days that scrolled in while away are worked out one day at a time, from the Other
  // Accounts' balances when the budget was last worked out (a saved day's already were)
  let percents = hasPercentEntries() ? percentRunner(accountBalancesToday(), addDays(lastDailyUpdate, 1), accountSummaries(lastDailyUpdate, oldGridStart)) : null;

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
          cell.text = writeSheetsToCell(cell.text, sheetDays.get(cellTime), cell.date);
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

      if (percents && cellTime > missedFromTime) {
        const day = percents.day(cell.text, cell.date);
        if (cell.isNew) cell.text = day.text;
      }

      // Every missed day: turn recurring and spreadsheet entries into temps (they stay as they were that day), and %
      // entries into plain amounts (what they came to)
      if (isMissed) {
        let lines = cell.text.split("\n");
        for (let l = 1; l < lines.length; l++) {
          let parts = getParts(lines[l]);
          let mark = entryMark(parts[0]);
          if (mark) {
            let newSprite = getSpecialType(parts[0]) + mark;
            if (newSprite !== baseSprite(parts[0])) uniquesCreated++;
            parts[0] = newSprite;
            lines[l] = parts.join(" ");
          } else if (percentOf(parts[0]) !== null) {
            parts[0] = percentSprite(parts[0], null);
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
      percent: percentOf(recurringData[i][5]),
      parsed: parsed
    });
  }
  return rows;
}

// Write due recurring entries into one cell, using the same rules as writeRecurring
function writeRecurringToCell(cellText, cellDate, recurringRows) {
  for (let row of recurringRows) {
    if (!recurringRowHits(row.parsed, cellDate)) continue;

    let amt = landingAmount({ amount: row.amt, percent: row.percent, sprite: row.sprite, title: row.title }, cellDate);
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
      // A unique with the same special type absorbs the recurring amount (a placeholder only if both are, and a plain
      // amount: what the two come to)
      hasUnique = true;
      let newAmt = amt + parseAmount(parts[1]);
      let newSprite = placeholderSprite(baseSprite(parts[0]) + "✔️", isPlaceholder(parts[0]) && isPlaceholder(row.sprite));
      cellLines[l] = newSprite + " " + formatMoney(newAmt) + " " + row.title;
      cellText = cellLines.join("\n");
      break;
    }
    if (!hasTemp && !hasUnique) {
      cellText += `\n${row.sprite} ${formatMoney(amt)} ${row.title}`;
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
  4. sort each day's entries, then redo the budget math, Bob's message, and the tracker
  5. log it to Change Logs, save, and tell the page to re-render ("budget:updated")
Changes run one at a time (the spreadsheet used a script lock). A change that fails part
way is rolled back, so half-finished data is never saved.
Other Accounts (like Savings) start from an amount set on their page, and are changed by Hidden and Transfer
entries with the account picked, see OTHER ACCOUNTS below.
*/

// Change Logs rows kept. Each table is saved as a single database row (2 MB max), so this is capped.
const MAX_LOG_ROWS = 1000;
// The most one table can hold when it's saved (the API refuses more)
const MAX_TABLE_BYTES = 1900000;

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
  notes:      { get: () => notesData,      set: (v) => { notesData = v; },      markEdited: () => { notesEdited = true; },      edited: () => notesEdited,      saved: () => { notesEdited = false; } },
  logs:       { get: () => logsData,       set: (v) => { logsData = v; },       markEdited: () => { logsEdited = true; },       edited: () => logsEdited,       saved: () => { logsEdited = false; } }
};

// A change the user needs to fix: shown on the page, nothing is changed or saved
class BudgetInputError extends Error {}

let budgetQueue = Promise.resolve(); // Changes run one at a time, in order
let changeLogStart = 0;

/* ---------- Actions the page UI calls (each resolves to { ok, saved, notFound, message, ... }) ---------- */

// New calendar entry. entry: { title, sprite, amount (signed number), percent (signed, for a % amount instead; see
// PERCENT_MARK), date, placeholder, purpose (what its title's money is for: one of the wavelengths, see WAVELENGTH
// PLANNING; left out, it stays as it is), note (see ENTRY NOTES: added to the entry's, when it goes into one already
// there) }. Can be undone.
function addCalendarEntry(entry) {
  const hasPercent = typeof entry.percent === "number";
  const signed = hasPercent ? entry.percent : entry.amount;
  return runBudgetAction("", () => {
    const landed = unique({
      title: entry.title,
      sprite: entry.sprite,
      action: signed > 0 ? "add" : "subtract",
      amount: hasPercent ? "" : String(Math.abs(entry.amount)),
      percent: hasPercent ? entry.percent : null,
      date: entry.date,
      placeholder: entry.placeholder === true,
      adding: true
    });
    noteEntryPurpose(entry.title, entry.purpose);
    addEntryNote(entry.date || today, entry.title, landed.entryType, entry.note);
    return {};
  }, { label: `added ${capitalize(String(entry.title || "").trim())} (${hasPercent ? showPercent(entry.percent) : formatMoney(entry.amount)}) on ${showDay(createSafeMidnight(entry.date || today))}`, dates: [entry.date || today] });
}

// Change, move, or delete a calendar entry (or one in Upcoming; History's go through changeHistoryEntry). change: { title,
// sprite, date, action, amount, moveDate, renameTo (a new title of its own, see renameEntry), purpose (its title's, see
// addCalendarEntry), note (its own, see ENTRY NOTES; left out, it keeps the one it has) }. Can be undone.
function changeCalendarEntry(change) {
  return runBudgetAction("", () => keepEntryDetails(entryChange(change), change), { label: describeEntryChange(change), dates: [change.date, change.moveDate].filter(Boolean) });
}

// After a change to an entry: its title's purpose as the form says (change.purpose; see WAVELENGTH PLANNING), on the
// title it has now, and its note, which goes where it went (see followEntryNote). Nothing, when it couldn't be found.
function keepEntryDetails(result, change) {
  if (notFound) return result;
  const deleted = String(change.action || "").toLowerCase() === "delete";
  if (change.purpose !== undefined && !deleted) noteEntryPurpose(changedTitle(change), change.purpose);
  followEntryNote(change, deleted);
  return result;
}

// An entry's title after a change: its new one (a new type or Other Account's newTitle, or a rename's own title with its
// account after it), or the one it had
function changedTitle(change) {
  if (change.newTitle !== undefined) return change.newTitle;
  if (change.renameTo !== undefined) return withAccount(String(change.renameTo), splitAccount(String(change.title || "")).account);
  return change.title;
}

// A change to an entry (unique's), after its new title when it has one (renameTo): renamed first, then changed on its
// new title. Only renamed, nothing else happens to it.
function entryChange(change) {
  if (change.renameTo === undefined) return unique(change);
  const renamed = renameEntry(change);
  if (notFound) return {};
  const placeholderChanged = change.placeholder !== undefined && !!change.placeholder !== isPlaceholder(renamed.sprite);
  const amountChanged = String(change.amount ?? "").trim() !== "" || typeof change.percent === "number";
  if (change.action !== "delete" && !change.moveDate && !amountChanged && !placeholderChanged) return {};
  const { renameTo, ...rest } = change;
  const result = unique({ ...rest, title: renamed.title, sprite: getSpecialType(renamed.sprite) });
  formEntryRow[3] = `${formEntryRow[3]} (renamed from ${capitalize(String(change.title || "").trim())})`;
  return result;
}

// An entry gets a new title of its own (change.renameTo; its Other Account stays after it). On a day from today on, an
// entry that lands by itself (a recurring entry's or a connected spreadsheet's, or a temp of one) keeps its title: it's
// changed on the Recurring Entries or Spreadsheets page instead. Any entry on a day before today can be renamed (in
// History too). It stays what it was (its type, mark, %, and placeholder), unless an entry with the new title and type
// is already on that day: then the two become one (a day has one of each), their amounts added, a placeholder only if
// both were, and a plain amount. Returns { title, sprite }: the entry as it is now.
const RENAME_LANDED = "This entry comes from a recurring entry or a connected spreadsheet, so from today on its title is changed there (on the Recurring Entries or Spreadsheets page).";
function renameEntry(change) {
  const date = createSafeMidnight(change.date || today);
  const { account } = splitAccount(String(change.title || "").trim());
  const own = String(change.renameTo ?? "").replace(/\s+/g, " ").trim();
  if (own.includes(ACCOUNT_ARROW)) throw new BudgetInputError(TITLE_ARROW);
  if (own.length > MAX_TITLE) throw new BudgetInputError(`Titles can be up to ${MAX_TITLE} characters.`);
  const newTitle = capitalize(withAccount(own, account));
  if (!newTitle) throw new BudgetInputError("Give the entry a title.");
  const special = getSpecialType(change.sprite);
  // (One that's just as it landed isn't on its day while a change runs: see stripRecurringEntries)
  if (landsByItself(change.title, special, date)) throw new BudgetInputError(RENAME_LANDED);
  const from = { oldAmt: 0, oldSprite: "", hasBlocker: false };
  if (injectOrDefer("delete", date, 0, change.title, special, from)) {
    notFound = true;
    return { title: change.title, sprite: change.sprite };
  }
  if (date >= today && entryMark(from.oldSprite)) throw new BudgetInputError(RENAME_LANDED);
  const into = { oldAmt: 0, oldSprite: "", hasBlocker: false };
  const merging = !injectOrDefer("delete", date, 0, newTitle, special, into);
  let sprite = from.oldSprite;
  let amount = from.oldAmt;
  let placeholder = isPlaceholder(from.oldSprite);
  if (merging) {
    sprite = special + (entryMark(into.oldSprite) || entryMark(from.oldSprite));
    amount = Math.round((amount + into.oldAmt) * 100) / 100;
    placeholder = placeholder && isPlaceholder(into.oldSprite);
  }
  injectOrDefer("set", date, amount, newTitle, sprite, {}, placeholder);
  formEntryRow[2] = "✏️ Rename Entry";
  formEntryRow[3] = `${baseSprite(from.oldSprite)} ${capitalize(String(change.title || "").trim())}`;
  formEntryRow[4] = "On: " + showDate(date);
  formEntryRow[5] = "To: " + newTitle;
  formEntryRow[6] = merging ? `Added into the ${newTitle} already there` : "";
  return { title: newTitle, sprite: placeholderSprite(sprite, placeholder && date >= today) };
}

// Can an entry (its sprite, on date) get a new title? Any entry on a day before today; from today on, one that doesn't
// land by itself (see renameEntry)
function canRenameEntry(sprite, date) {
  return date < today || !entryMark(sprite);
}

// Is the entry with this title and type on date, from today on, one that lands by itself (or a temp of one)? Also while a
// change runs, when the calendar's recurring and spreadsheet entries are off it (stripRecurringEntries).
function landsByItself(title, sprite, date) {
  if (!(date instanceof Date) || isNaN(date.getTime()) || date < today) return false;
  const special = getSpecialType(sprite);
  const there = entryOnDay(title, special, date);
  if (there) return !!entryMark(there.sprite);
  return !!scheduledHit(title, date, special);
}

// A calendar entry's refraction type or Other Account changed (and maybe its amount and day too). change: { title,
// sprite, date (the entry as it is), newTitle ("Payday → HSA"), newSprite, amount (the new signed amount), percent (a %
// amount instead, signed), moveDate, placeholder }. It comes off its day the way Delete takes it off (one that landed by
// itself leaves a $0.00 temp), then goes on as the new one, adding into an entry already there with that title and type
// (a day has one of each). Can be undone in one step.
function changeEntryKind(change) {
  return runBudgetAction("", () => keepEntryDetails(entryKindChange(change), change), { label: describeKindChange(change), dates: [change.date, change.moveDate].filter(Boolean) });
}

// changeEntryKind's change itself: off as it was, then on as the new one (a new title of its own too, where it can have
// one: see renameEntry)
function entryKindChange(change) {
  const percent = readPercent(change.percent);
  const amount = Math.round(Number(change.amount) * 100) / 100;
  if (percent === null && (!Number.isFinite(amount) || amount === 0)) throw new BudgetInputError("Enter an amount, like 12.50. To take the entry off, tap Delete.");
  const ownTitle = (title) => cleanString(splitAccount(String(title || "")).title);
  if (ownTitle(change.title) !== ownTitle(change.newTitle) && landsByItself(change.title, change.sprite, createSafeMidnight(change.date))) {
    throw new BudgetInputError(RENAME_LANDED);
  }
  unique({ title: change.title, sprite: change.sprite, date: change.date, action: "delete" });
  if (notFound) return {};
  return unique({
    title: change.newTitle,
    sprite: change.newSprite,
    date: change.moveDate || change.date,
    action: (percent ?? amount) > 0 ? "add" : "subtract",
    amount: percent === null ? String(Math.abs(amount)) : "",
    percent,
    placeholder: change.placeholder,
    adding: true
  });
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
    const result = keepEntryDetails((isKind ? entryKindChange(change) : entryChange(change)) || {}, change);
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
  const hasPercent = typeof change.percent === "number";
  const amount = Number(change.amount);
  const amountChanged = action !== "delete" && (hasPercent || String(change.amount ?? "").trim() !== "");
  if (change.renameTo !== undefined) {
    const renamed = capitalize(withAccount(String(change.renameTo).trim(), splitAccount(title).account));
    const more = amountChanged || (change.moveDate && day(change.moveDate) !== day(change.date)) ? " and changed it" : "";
    return `renamed ${title} to ${renamed} on ${day(change.date)}${more}`;
  }
  if (change.moveDate && day(change.moveDate) !== day(change.date)) {
    return `moved ${title} from ${day(change.date)} to ${day(change.moveDate)}${amountChanged ? " and changed its amount" : ""}`;
  }
  if (action === "delete") return `deleted ${title} on ${day(change.date)}`;
  if (action === "set" && amountChanged) return `set ${title} on ${day(change.date)} to ${hasPercent ? showPercent(change.percent) : formatMoney(amount)}`;
  if (action === "add") return `added ${hasPercent ? showPercent(change.percent) : formatMoney(amount)} to ${title} on ${day(change.date)}`;
  if (action === "subtract") return `took ${hasPercent ? showPercent(change.percent) : formatMoney(amount)} off ${title} on ${day(change.date)}`;
  // (Only its Placeholder switch changed)
  if (change.placeholder === true) return `made ${title} on ${day(change.date)} a placeholder`;
  if (change.placeholder === false) return `made ${title} on ${day(change.date)} no longer a placeholder`;
  return `changed ${title} on ${day(change.date)}`;
}

// New or changed recurring entry (index = the row that was clicked, null from the New Entry panel). fields.purpose: its
// title's (see addCalendarEntry). fields.note: the recurring entry's own note (see ENTRY NOTES; left out, it keeps the
// one it has).
function saveRecurringEntry(fields, index = null) {
  return runBudgetAction("", () => {
    const before = index === null ? null : [...(recurringData[index] || [])];
    const result = index === null ? recurring(fields) : editRecurringRow(index, fields);
    noteEntryPurpose(fields.title, fields.purpose);
    followRecurringNote(before, fields);
    return result;
  });
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
// The Quick Entry page can't open the budget (its key can only queue entries), so its entries wait in the API until a
// budget opens. The ones from this device's own icons are added then, each like a New Entry (the load picks them up, so
// the icon can't change them or take them back anymore); the ones from other devices' icons (someone else sharing the
// budget) wait on Home (Calendar Page.js), still their icon's to change or take back, until whoever has it open adds them
// (Add picks each one up first, as it is then) or deletes them. One that's added leaves the API's queue in the same
// request that saves the table it landed in (see saveChanges): never lost, never added twice.

// Refraction types by name, as the Quick Entry page sends them
const QUICK_ENTRY_TYPES = { auto: "", regular: "❗️", hidden: "✖️", transfer: "⭕️" };
// Queued entry ids to send with the next save of the table each one landed in
let quickEntryAcks = { calendar: [], history: [], future: [] };
// The quick entries waiting on Home: [{ id, entry: { title, type, amount, date: "YYYY-MM-DD", placeholder }, createdAt,
// icon }], oldest first
let waitingQuickEntries = [];

// The Quick Entry icons this device made (Home's Quick Entry button) or used (the Quick Entry page, where it shares this
// site's storage), each as the start of its key's hash (the API's icon for each waiting entry), newest first. Kept on
// this device, even after signing out, so its own entries are still its own.
const OWN_ICONS_KEY = "prismal_quick_icons";
const MAX_OWN_ICONS = 20;
const ICON_ID_LENGTH = 16;

async function quickIconId(key) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(key)));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("").slice(0, ICON_ID_LENGTH);
}

function ownQuickIcons() {
  try {
    const list = JSON.parse(localStorage.getItem(OWN_ICONS_KEY) || "[]");
    return Array.isArray(list) ? list.filter(id => typeof id === "string") : [];
  } catch (e) {
    return [];
  }
}

async function rememberQuickIcon(key) {
  if (!key || !window.crypto || !crypto.subtle) return;
  try {
    const id = await quickIconId(key);
    const list = [id, ...ownQuickIcons().filter(known => known !== id)].slice(0, MAX_OWN_ICONS);
    localStorage.setItem(OWN_ICONS_KEY, JSON.stringify(list));
  } catch (e) {}
}

// queue: the waiting entries the budget loaded, from the API. A placeholder whose day passed before the budget opened
// goes right away (like one on the calendar would); this device's own are added now (one that can't be goes, and a
// note says why); the rest wait on Home.
async function holdQuickEntries(queue) {
  if (!Array.isArray(queue)) return;
  const own = new Set(ownQuickIcons());
  const passed = [];
  const mine = [];
  waitingQuickEntries = [];
  for (const quick of queue) {
    if (!quick || !quick.entry) continue;
    const date = createSafeMidnight(quick.entry.date, true);
    if (quick.entry.placeholder === true && date < today) passed.push(quick);
    else if (quick.icon && own.has(quick.icon)) mine.push(quick);
    else waitingQuickEntries.push(quick);
  }
  let added = 0;
  const failed = [];
  for (const quick of mine) {
    const result = await runBudgetAction("", () => quickEntry(quick), quickEntryUndo(quick));
    if (result.ok) added++;
    else failed.push({ quick, message: result.message });
  }
  const dropped = [...passed, ...failed.map(({ quick }) => quick)];
  if (dropped.length > 0) await budgetApi("/api/quick/dismiss", { ids: dropped.map(quick => quick.id) });

  if (typeof BudgetUI === "undefined") return;
  const plural = (count) => `${count} quick ${count === 1 ? "entry" : "entries"}`;
  const messages = [];
  if (added > 0) messages.push(`Added ${plural(added)} from this device's Quick Entry icon.`);
  if (passed.length > 0) messages.push(`Left out ${passed.length === 1 ? "a placeholder" : passed.length + " placeholders"} from your Quick Entry icons: ${passed.length === 1 ? "its day has" : "their days have"} passed.`);
  if (failed.length > 0) {
    const first = failed[0];
    messages.push(`Couldn't add ${failed.length === 1 ? "the quick entry" : plural(failed.length) + ", like"} "${first.quick?.entry?.title ?? "Untitled"}": ${first.message}`);
  }
  if (messages.length > 0) BudgetUI.showToast(messages.join(" "), failed.length > 0);
}

// A quick entry's Undo step (null for one without a real day)
function quickEntryUndo(quick) {
  const date = createSafeMidnight(quick.entry.date, true);
  return isNaN(date.getTime()) ? null : { label: `quick entry ${describeQuickEntry(quick.entry)}`, dates: [date] };
}

// "Coffee (-$4.50) on 10/05" (or "Card → Visa (3%) on 10/05"), for the waiting list's notes and Undo
function describeQuickEntry(entry) {
  const date = createSafeMidnight(entry.date, true);
  const amount = typeof entry.percent === "number" ? showPercent(entry.percent) : formatMoney(entry.amount);
  return `${capitalize(String(entry.title || "").trim())} (${amount}) on ${isNaN(date.getTime()) ? entry.date : showDay(date)}`;
}

// Home's Add: a waiting quick entry goes into the budget, like a New Entry (Undo can take it back). It's picked up first
// (POST /api/quick/pickup), so its icon can't change it while it's added, and it's added as it is then (its icon may have
// changed it since Home showed it). Resolves like any change ({ ok, message }); one that can't be added stays waiting
// (and Delete still takes it off), and the message says why.
async function addWaitingQuickEntry(id) {
  const quick = waitingQuickEntries.find(item => item.id === id);
  if (!quick) return { ok: false, message: "That quick entry isn't waiting anymore." };
  const answer = await budgetApi("/api/quick/pickup", { ids: [id] });
  if (!answer.ok || !answer.data || !Array.isArray(answer.data.entries)) {
    return { ok: false, message: "That quick entry couldn't be added. Please check your connection and try again." };
  }
  const current = answer.data.entries.find(item => item.id === id);
  if (!current || !current.entry) {
    waitingQuickEntries = waitingQuickEntries.filter(item => item !== quick);
    notifyBudgetChanged();
    return { ok: false, message: "That quick entry was taken back on the icon that added it." };
  }
  quick.entry = current.entry;
  const result = await runBudgetAction("", () => quickEntry(quick), quickEntryUndo(quick));
  if (result.ok) waitingQuickEntries = waitingQuickEntries.filter(item => item !== quick);
  return result;
}

// Home's Delete: a waiting quick entry leaves the API's queue without joining the budget (the Change Logs keep a note)
async function deleteWaitingQuickEntry(id) {
  const quick = waitingQuickEntries.find(item => item.id === id);
  if (!quick) return { ok: false, message: "That quick entry isn't waiting anymore." };
  const answer = await budgetApi("/api/quick/dismiss", { ids: [id] });
  if (!answer.ok) return { ok: false, message: "That quick entry couldn't be deleted. Please check your connection and try again." };
  waitingQuickEntries = waitingQuickEntries.filter(item => item !== quick);
  return runBudgetAction("⚡ Delete Quick Entry", () => {
    formEntryRow[3] = describeQuickEntry(quick.entry);
    return {};
  });
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
  // (A % entry is worked out again here; on a day that passed before the budget opened, it's the amount the Quick Entry
  // page worked out)
  const hasPercent = typeof entry.percent === "number" && date >= today;
  const landed = unique({
    title: entry.title,
    sprite: Object.prototype.hasOwnProperty.call(QUICK_ENTRY_TYPES, entry.type) ? QUICK_ENTRY_TYPES[entry.type] : "",
    action: (hasPercent ? entry.percent : entry.amount) > 0 ? "add" : "subtract",
    amount: hasPercent ? "" : String(Math.abs(entry.amount)),
    percent: hasPercent ? entry.percent : null,
    date,
    placeholder: entry.placeholder === true,
    adding: true
  });
  formEntryRow[5] = "⚡ Quick Entry"; // Where "Move To" goes (quick entries never move)
  noteEntryPurpose(entry.title, entry.purpose, true); // (Picked on the Quick Entry page, or left out to stay as it is)
  addEntryNote(date, entry.title, landed.entryType, entry.note, true);
  return { quickEntry: { id: quick.id, table } };
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
  resolvePercentEntries();
  writeBudgetMath();
  commenceBob();
  updateTrackerTab();
  updateAccountBalances();
  dropStrayNotes();
}

/* ---------- Calendar entries (the old "Unique Entry" form) ---------- */

// Create or change a calendar entry. A new entry with the same title + refraction type as one
// already on that day is combined into it.
// entry: { title, sprite: "" (match/inherit) | "❗️" | "✖️" | "⭕️",
//          action: "subtract" | "add" | "set" | "delete",
//          amount: string ("" with "set" keeps the current amount),
//          date: Date, moveDate: Date (optional, moves the entry there),
//          placeholder: true | false (optional: whether it's a placeholder; left out, it stays as it was),
//          percent: a % amount instead of amount (see PERCENT_MARK): its percent (signed with "set"; "subtract" and "add"
//          sign it), or null for a plain amount; left out, an entry that has one keeps it unless its amount changes,
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
  let percent = action === "delete" ? null : readPercent(entry.percent);
  if (percent !== null && (action === "subtract" || action === "add")) percent = (action === "subtract" ? -1 : 1) * Math.abs(percent);
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
  // A % amount is its percent of the Other Account's balance on the day it goes on
  if (percent !== null) {
    if (!linkedAccount(targetIncomingSpecial, title)) throw new BudgetInputError(PERCENT_NEEDS_ACCOUNT);
    if (dateMove < today) throw new BudgetInputError(PERCENT_PAST_DAY);
    amt = percentAmount(percent, dateMove, targetIncomingSpecial, title);
  }
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
  let wasThere = isExisting || isOriginalVirginRecurring || isMismatchedVirgin;
  if (action === "append") {
    finalAmt = (isExisting ? outData.oldAmt : baseAmtOriginal) + amt;
  } else if (action === "set" && rawAmtString === "" && percent === null) {
    finalAmt = isExisting ? outData.oldAmt : baseAmtOriginal;
  }
  // Its %: a new one stays one unless it adds into an entry that's there (the one entry is a plain amount then, what the
  // two come to), and one that's only moved (or made a placeholder) keeps its own
  let finalPercent = null;
  if (percent !== null) finalPercent = action === "append" && wasThere ? null : percent;
  else if (entry.percent === undefined && action === "set" && rawAmtString === "" && wasThere) finalPercent = percentOf(isExisting ? outData.oldSprite : source.sprite);

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
          // (Two entries become one there: a placeholder only if both were, and a plain amount)
          placeholder = placeholder && isPlaceholder(moveIsExisting ? moveOutData.oldSprite : moveBaseSprite);
          finalPercent = null;
        } else if (isOriginalVirginRecurring) {
          moveSprite = targetIncomingSpecial + virginMark;
        }
      } else {
        if (isOriginalVirginRecurring || (isExisting && hasOriginalCheckmark)) {
          moveSprite = targetIncomingSpecial + virginMark;
        }
      }
      // (A % entry needs its Other Account, and stays what it came to on a day that passed)
      if (finalPercent !== null && (dateMove < today || !linkedAccount(moveSprite || "❗️", title))) finalPercent = null;
      if (finalPercent !== null || percentOf(moveSprite) !== null) moveSprite = percentSprite(moveSprite, finalPercent);
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
  let formEntrySuffix = notFound ? "Not Found" : action === "delete" ? "Success" : percent !== null ? `${showPercent(percent)} (${formatMoney(Math.abs(amt))})` : formatMoney(rawAmtString);
  formEntryRow[6] = capitalize(rawAction) + ": " + formEntrySuffix;
  return { entryType: targetIncomingSpecial }; // The refraction type it landed as (Auto picks one), for its note
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
      // (Set writes the entry as it's given, its % too)
      if (action === "set" && percentOf(currentSprite) !== null) updatedSprite = percentSprite(updatedSprite, percentOf(currentSprite));
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
      const setPercent = action === "set" ? percentOf(sprite) : null;
      sprite = combineSprites(matchedFutureSprite, sprite);
      if (setPercent !== null) sprite = percentSprite(sprite, setPercent);
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
// fields: { title, sprite: "✔️" | "✔️✖️" | "✔️⭕️", amount: number, percent (signed, for a % amount instead; see
//           PERCENT_MARK), frequency: "Every 2 Weeks" (blank = every month), startDate: Date | null (today), endDate:
//           Date | "None" | null, placeholder: every day it lands on gets a placeholder }
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
  let percent = readPercent(fields.percent);
  if (percent !== null) sprite = percentSprite(sprite, percent);
  let amount = formatMoney(recurringAmount(percent, hasAmount ? fields.amount : 0, startDate, sprite, title));
  recurringData.push([title, amount, formatToMMDDYYYY(startDate), frequency, endDate, sprite]);

  formEntryRow[2] = "✔️ Create Recurring";
  formEntryRow[3] = baseSprite(sprite) + " " + title + (isPlaceholder(sprite) ? " (Placeholder)" : "");
  formEntryRow[4] = frequency + ": " + showDate(startDate);
  formEntryRow[5] = "Expiration: " + showStoredDate(endDate);
  formEntryRow[6] = "Amount: " + (percent !== null ? `${showPercent(percent)} (${amount})` : amount);
  return {};
}

// A recurring entry's stored amount: its own, or for a % entry (percent, checked here), about what it comes to the first
// time it lands from today on (each day works its own out)
function recurringAmount(percent, amount, startDate, sprite, title) {
  if (percent === null) return amount;
  const amountOn = percentAmount(percent, startDate > today ? startDate : today, sprite, title);
  if (amountOn === null) throw new BudgetInputError(PERCENT_NEEDS_ACCOUNT);
  return amountOn;
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
  // (Left out, a % entry stays one unless it's given an amount)
  let percent = fields.percent === undefined ? (hasAmount ? null : percentOf(row[5])) : readPercent(fields.percent);
  sprite = percentSprite(sprite, percent);
  let oldTitle = String(row[0]).trim();
  let oldSpecial = getSpecialType(String(row[5] || ""));
  let newSpecial = getSpecialType(sprite);
  let renamed = cleanString(oldTitle) !== cleanString(title) || oldSpecial !== newSpecial;
  refuseRecurringTwin(title, sprite, index, !renamed);
  let startDate = fields.startDate ? createSafeMidnight(fields.startDate) : createSafeMidnight(row[2]);
  let endDate = resolveEndDate(fields.endDate ?? "None", row[4]);
  let frequency = readFrequency(String(fields.frequency || "").trim() || row[3]);

  // A new title, Other Account, or type takes the days that were changed for this entry along (moveRecurringTemps), and
  // the notes on its days from today on
  if (renamed && recurringTwin(oldTitle, oldSpecial, index) === -1) {
    moveRecurringTemps(cleanString(oldTitle), oldSpecial, title, newSpecial);
    moveDayNotes(oldTitle, oldSpecial, title, newSpecial, today);
  }

  row[1] = formatMoney(recurringAmount(percent, hasAmount ? fields.amount : parseAmount(row[1]), startDate, sprite, title));
  row[0] = title;
  row[2] = formatToMMDDYYYY(startDate);
  row[3] = frequency;
  row[4] = endDate;
  row[5] = sprite;

  formEntryRow[2] = "✔️ Change Recurring";
  formEntryRow[3] = baseSprite(sprite) + " " + title + (isPlaceholder(sprite) ? " (Placeholder)" : "");
  formEntryRow[4] = frequency + ": " + showStoredDate(row[2]);
  formEntryRow[5] = "Expiration: " + showStoredDate(endDate);
  formEntryRow[6] = "New Amount: " + (percent !== null ? `${showPercent(percent)} (${row[1]})` : row[1]);
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
  // (A placeholder temp stays one, and a % one stays one)
  const isOldTemp = (sprite, title) => baseSprite(String(sprite ?? "").trim()) === oldSpecial + "✔️" && cleanString(title) === oldClean;
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 7; c++) {
      if (gridDates[r][c] < today) continue;
      let lines = String(calendarData[r][c]).split("\n");
      let moved = false;
      for (let l = 1; l < lines.length; l++) {
        let parts = getParts(lines[l]);
        if (parts.length < 3 || !isOldTemp(parts[0], parts.slice(2).join(" "))) continue;
        lines[l] = `${rebasedSprite(parts[0], newSpecial + "✔️")} ${parts[1]} ${newTitle}`;
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
    row[3] = rebasedSprite(row[3], newSpecial + "✔️");
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
// is made). An account can also get interest (a credit card, a loan, or savings that earn it), compounding and added
// how and when it says: see interestStepper. accountsData.list: [0] column titles, then [name, balance today (filled in
// by updateAccountBalances, so the Quick Entry page can show it), "default" | "cash" | "", starting amount ("" is
// $0.00), interest rate (a year, in %; "" for none), the day interest started counting (MM/DD/YYYY), max, how interest
// compounds, every how many months it's added, the day of the month it's added (see accountInterest)].
// accountsData.coming: each account's changes after today, which the Quick Entry page counts once their day comes (see
// accountChangesAhead). accountsData.inBank: In Bank from today through the 28 days after the calendar, for the Quick
// Entry page (see inBankAhead). The default account, Savings, is always there and can't be deleted.

const ACCOUNTS_VERSION = 3;
const DEFAULT_ACCOUNT = "Savings";
const MAX_ACCOUNT_NAME = 60;
// The accounts every budget has, which can't be deleted (either can be renamed): Savings, the default, and Cash. Each is
// marked in its row's [2].
const MANDATORY_ACCOUNTS = [[DEFAULT_ACCOUNT, "default"], ["Cash", "cash"]];

// The default account (Savings)
function isDefaultAccount(row) {
  return String(row?.[2] ?? "").trim() === "default";
}

// Savings or Cash, which can't be deleted
function isMandatoryAccount(row) {
  const mark = String(row?.[2] ?? "").trim();
  return MANDATORY_ACCOUNTS.some(([, kind]) => kind === mark);
}

// Why a mandatory account can't be deleted
function mandatoryAccountNote(name) {
  return `${name} is one of the accounts every budget has (Savings and Cash), so it can't be deleted. It can be renamed.`;
}

// The most an account can hold (its row's [6], like a credit card's limit), or null when it has none
function accountMax(row) {
  const text = String(row?.[6] ?? "").trim();
  const max = text ? Math.round(parseAmount(text) * 100) / 100 : 0;
  return max > 0 ? max : null;
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

// The accounts in order with today's balances (and the most each can hold), for the account pickers: [{ name, balance,
// max (null for none) }]
function otherAccounts() {
  return accountRows().map(account => ({ name: account.name, balance: parseAmount(account.row[1]), max: accountMax(account.row) }));
}

// Every entry for an Other Account (account row index) on the calendar, in History, and in Upcoming, newest first (a
// day's own order kept): [{ date, line (as its day stores it), change (what the account gets, see accountChange), place:
// "calendar" | "history" | "upcoming" }]. A $0.00 blocker (which only keeps a recurring or spreadsheet entry off its day)
// isn't one.
function accountEntryLines(index) {
  const accounts = accountTitleMap();
  const found = [];
  const add = (text, date, place) => {
    const line = readLine(text);
    if (!line.title || line.system || isNaN(date.getTime())) return;
    if (line.amount === 0 && entryMark(line.sprite)) return;
    const account = linkedAccount(line.sprite, line.title, accounts);
    if (account && account.index === index) found.push({ date, line: String(text).trim(), change: accountChange(line.sprite, line.amount), place });
  };
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 7; c++) String(calendarData[r][c] ?? "").split("\n").slice(1).forEach(text => add(text, gridDates[r][c], "calendar"));
  }
  for (let r = 1; r < historyData.length; r++) {
    for (let c = 0; c < 7; c++) {
      const lines = String(historyData[r][c] ?? "").split("\n");
      const date = createSafeMidnight(lines[0].trim(), true);
      lines.slice(1).forEach(text => add(text, date, "history"));
    }
  }
  for (const row of futureData.slice(1)) {
    if (String(row[0]).trim()) add(`${String(row[3]).trim()} ${formatMoney(parseAmount(row[1]))} ${String(row[0]).trim()}`, createSafeMidnight(row[2], true), "upcoming");
  }
  return found.map((entry, order) => ({ ...entry, order })).sort((a, b) => b.date - a.date || a.order - b.order);
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
// first, and its interest (through interestUntil): [{ index, name, isDefault, start, interest (see accountInterest, or
// null), entriesToday (its entries through today, added up), today, entries: [{ date, change, sprite, title (its own,
// "" without one) }], interestCredits: [{ date, change }] oldest first }]. calendarStart: the calendar's first day (the
// daily update's is still the saved one's).
function accountSummaries(interestUntil = gridEndDate, calendarStart = gridStartDate) {
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
    for (let c = 6; c >= 0; c--) addCell(calendarData[r][c], () => addDays(calendarStart, r * 7 + c));
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

// The budget AHEAD_MONTHS from today: In Bank that day, and each Other Account's balance (its interest too). summaries:
// accountSummaries(). { inBank, accounts: Map(account row index -> balance) }
function budgetAhead(summaries) {
  const until = addMonths(today, AHEAD_MONTHS);
  const projection = projectBudget(until, summaries);
  return { inBank: projection.inBankOn(until), accounts: new Map(summaries.map(summary => [summary.index, projection.accountOn(summary.index, until)])) };
}

// The budget from today through until, a day at a time: the calendar's days as they are, and the days after it filled in
// the way the daily update will fill them (Upcoming entries, then recurring and connected spreadsheets' entries; see
// dayAfterCalendar). summaries: accountSummaries(), when the caller has them. Returns { until, summaries, inBank: [{ date,
// amount }] (In Bank at the end of each day, today first), inBankOn(date), accountOn(index, date) (an Other Account's
// balance at the end of date, its interest too; index: its row), interestBetween(index, from, to) (the interest it gets
// after from, through to: below $0 is interest paid), accountParts(index) (what its balance comes from: { start, interest,
// entries }, to work it out again with more entries, see interestCredits) }. Days after until count as until.
function projectBudget(until, summaries = accountSummaries()) {
  const accounts = accountTitleMap();
  const coming = new Map(summaries.map(summary => [summary.index, []]));
  const inBank = [];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 7; c++) {
      if (gridDates[r][c] >= today && gridDates[r][c] <= until) inBank.push({ date: gridDates[r][c], amount: readInBank(calendarData[r][c]) ?? 0 });
    }
  }
  let balance = readInBank(calendarData[3][6]) ?? 0;
  const recurringRows = getParsedRecurringRows();
  const futureByDate = groupFutureRowsByDate();
  const sheetDays = sheetEntriesByDay(nextFourStart, until);
  for (let day = nextFourStart; day <= until; day = addDays(day, 1)) {
    const text = dayAfterCalendar(day, recurringRows, futureByDate, sheetDays);
    balance = Math.round((balance + dayMath(text.split("\n")).bankChange) * 100) / 100;
    inBank.push({ date: day, amount: balance });
    for (const { account, change, sprite, title } of accountLineChanges(text, accounts)) coming.get(account.index)?.push({ date: day, change, sprite, title, coming: true });
  }
  const byIndex = new Map(summaries.map(summary => {
    const entries = [...summary.entries, ...(coming.get(summary.index) || [])];
    const credits = summary.interest ? interestCredits(summary.start, entries, summary.interest, until) : [];
    return [summary.index, { start: summary.start, interest: summary.interest, entries, credits }];
  }));
  const round = (amount) => Math.round(amount * 100) / 100;
  const through = (list, date) => list.reduce((total, item) => (item.date <= date ? total + item.change : total), 0);
  return {
    until,
    summaries,
    inBank,
    inBankOn(date) {
      const at = Math.max(0, Math.min(getDayDifference(date, today), inBank.length - 1));
      return inBank[at]?.amount ?? 0;
    },
    accountOn(index, date) {
      const account = byIndex.get(index);
      return account ? round(account.start + through(account.entries, date) + through(account.credits, date)) : 0;
    },
    interestBetween(index, from, to) {
      const account = byIndex.get(index);
      return account ? round(account.credits.reduce((total, credit) => (credit.date > from && credit.date <= to ? total + credit.change : total), 0)) : 0;
    },
    accountParts(index) {
      const account = byIndex.get(index);
      return account ? { start: account.start, interest: account.interest, entries: account.entries } : null;
    }
  };
}

// An account's starting amount (its row's [3]; blank is $0.00)
function accountStart(row) {
  const text = String(row?.[3] ?? "").trim();
  return text ? Math.round(parseAmount(text) * 100) / 100 : 0;
}

// An account's interest: { rate (a year, in %), since (the day it started counting), compound (how often it earns
// interest of its own: a key of INTEREST_COMPOUNDING), every (months between the days it's added: INTEREST_EVERY), day
// (the day of the month it's added, 1 to 31: a shorter month's last day for one past it) }, or null when it has none.
// Its row's [4], [5], [7], [8], and [9]; blank ones are monthly, every month, and the day of the month it started
// counting.
const MAX_INTEREST_RATE = 1000;
// How often interest earns interest: every day, every 1, 3, or 12 months, or never ("simple": only the balance without
// the interest added to it earns any)
const INTEREST_COMPOUNDING = { daily: 0, monthly: 1, quarterly: 3, yearly: 12, simple: null };
const INTEREST_EVERY = [1, 3, 6, 12];
function accountInterest(row) {
  const rateText = String(row?.[4] ?? "").trim();
  const sinceText = String(row?.[5] ?? "").trim();
  const rate = Number(rateText);
  const since = sinceText ? createSafeMidnight(sinceText, true) : null;
  if (!rateText || !Number.isFinite(rate) || rate <= 0 || rate > MAX_INTEREST_RATE || !since || isNaN(since.getTime())) return null;
  const compoundText = String(row?.[7] ?? "").trim();
  const every = Number(row?.[8]);
  const day = Number(row?.[9]);
  return {
    rate,
    since,
    compound: Object.prototype.hasOwnProperty.call(INTEREST_COMPOUNDING, compoundText) ? compoundText : "monthly",
    every: INTEREST_EVERY.includes(every) ? every : 1,
    day: Number.isInteger(day) && day >= 1 && day <= 31 ? day : since.getDate()
  };
}

// Interest's settings as a form gives them ({ compound, every, day }, each left out for its default: monthly, every
// month, and fallbackDay), checked: { compound, every, day, columns (its row's [7], [8], and [9]: blank for monthly and
// for every month) }
function interestSettings(fields, fallbackDay) {
  const compound = fields?.compound ?? "monthly";
  const every = fields?.every ?? 1;
  const day = fields?.day ?? fallbackDay;
  if (!Object.prototype.hasOwnProperty.call(INTEREST_COMPOUNDING, compound) || !INTEREST_EVERY.includes(every) || !Number.isInteger(day) || day < 1 || day > 31) {
    throw new BudgetInputError("Pick how the interest compounds, how often it's added, and the day of the month it's added.");
  }
  return { compound, every, day, columns: [compound === "monthly" ? "" : compound, every === 1 ? "" : String(every), String(day)] };
}

// An account's interest in words, for Change Logs: "24.99% a year, compounding daily, added every month on day 15"
function describeInterest(interest) {
  const compounding = interest.compound === "simple" ? "not compounding" : `compounding ${interest.compound}`;
  const every = interest.every === 1 ? "every month" : interest.every === 12 ? "every year" : `every ${interest.every} months`;
  return `${interest.rate}% a year, ${compounding}, added ${every} on day ${interest.day}`;
}

// An account's interest, worked out a day at a time from the day after it started counting (interest.since). step(day,
// balance) takes each day in order with the account's balance at its start (its starting amount, its entries before
// that day, and the interest added before it), and gives back the interest added to it that day, to the cent (0 on most
// days):
//   - It's added on interest.day every interest.every months, counting that day of the month from the first one after
//     it started counting: first on the interest.every-th of them (every month: the first one itself, every 3 months:
//     the third), then every interest.every months
//   - "daily": every day earns a 365th of the yearly rate, on the balance and the interest earned since it was last
//     added
//   - "simple": every day earns a 365th of the yearly rate, on the balance without any interest added to it
//   - "monthly", "quarterly", "yearly": every 1, 3, or 12 months on that day of the month (counted the same way), the
//     balance that morning and the interest earned since it was last added earn that many twelfths of the yearly rate
//     (a first stretch shorter than that earns a 365th a day)
// So a balance below $0 (money owed, like a credit card's) goes further below, and one above $0 grows.
function interestStepper(interest) {
  const rate = interest.rate; // (% a year: a dollar earns rate cents a year)
  const months = INTEREST_COMPOUNDING[interest.compound];
  // The day it's added in a month (counted in months from the year 0)
  const dayIn = (month) => {
    const year = Math.floor(month / 12);
    const last = new Date(year, month % 12 + 1, 0).getDate();
    return new Date(year, month % 12, Math.min(interest.day, last));
  };
  const sinceMonth = interest.since.getFullYear() * 12 + interest.since.getMonth();
  const firstMonth = dayIn(sinceMonth) > interest.since ? sinceMonth : sinceMonth + 1;
  // Is day one of the days every `step` months, from the first one?
  const isEvery = (day, step) => {
    const month = day.getFullYear() * 12 + day.getMonth() - (firstMonth + step - 1);
    return month >= 0 && month % step === 0 && day.getTime() === dayIn(day.getFullYear() * 12 + day.getMonth()).getTime();
  };
  let earned = 0;                     // Interest earned and not added yet, in cents
  let added = 0;                      // Interest added so far
  let lastWorkedOut = interest.since; // ("monthly", "quarterly", "yearly") The day interest was last worked out
  return {
    step(day, balance) {
      if (day <= interest.since) return 0;
      if (months === 0) earned += (balance + earned / 100) * rate / 365;
      else if (months === null) earned += (balance - added) * rate / 365;
      else if (isEvery(day, months)) {
        const full = day >= addMonths(lastWorkedOut, months);
        earned += (balance + earned / 100) * rate * (full ? months : Math.round((day - lastWorkedOut) / 86400000) * 12 / 365) / 12;
        lastWorkedOut = day;
      }
      if (!isEvery(day, interest.every)) return 0;
      const change = Math.round(earned) / 100;
      earned = 0;
      added += change;
      return change;
    }
  };
}

// An account's interest from the day after it started counting through until, with its starting amount and its entries
// ([{ date, change }]): { credits: [{ date, change }] oldest first, stepper (see interestStepper, ready for the day
// after until) }. Typing the account's balance or changing its interest starts it counting again from that day
// (accountEntry), so interest never counts twice.
function runInterest(start, entries, interest, until) {
  const ordered = [...entries].sort((a, b) => a.date - b.date);
  const stepper = interestStepper(interest);
  const credits = [];
  let balance = start;
  let counted = 0; // Entries added into balance so far
  for (let day = addDays(interest.since, 1); day <= until; day = addDays(day, 1)) {
    while (counted < ordered.length && ordered[counted].date < day) balance += ordered[counted++].change;
    const change = stepper.step(day, balance);
    if (change === 0) continue;
    credits.push({ date: day, change });
    balance += change;
  }
  return { credits, stepper };
}

// The interest an account gets through until (see runInterest): [{ date, change }], oldest first
function interestCredits(start, entries, interest, until) {
  return runInterest(start, entries, interest, until).credits;
}

/* ---------- Paying a balance off (the Payment Calculator) ---------- */
// How long paying off a balance owed takes (a loan, a credit card), with interest worked out the way an Other Account's
// is (interestStepper): the same payment on a schedule from a first payment day, and what paying more does. For an
// Other Account, its own pace too, from the budget (accountPayoff).

// How often payments come: days apart, or null for every month (on the first payment's day of the month)
const PAYMENT_FREQUENCIES = { weekly: 7, biweekly: 14, monthly: null };
const PAYOFF_YEARS = 50;         // The longest a payoff is worked out for
const ACCOUNT_PAYOFF_YEARS = 10; // How far ahead an account's own pace is looked at (like Bob's Accounts card)

// The payment days from first, every `frequency` (a key of PAYMENT_FREQUENCIES), through until
function paymentDays(first, frequency, until) {
  const apart = PAYMENT_FREQUENCIES[frequency];
  const days = [];
  for (let k = 0; ; k++) {
    const day = apart ? addDays(first, k * apart) : addMonths(first, k);
    if (day > until) return days;
    days.push(day);
  }
}

// Paying off `owed` (above $0) with `payment` on each payment day from `first` (the last one only what's left), and
// interest ({ rate, compound, every, day }, or null for none) counting from the day after `from`, through until (at
// most PAYOFF_YEARS): { schedule: [{ date, payment, interest (added since the payment before), owed (after it) }],
// paidOff (the last payment's day, or null: not by until, or never, when a year of payments still owes as much as at
// the start), interest (all of it), paid (all of it) }
function payOff({ owed, interest, payment, frequency, first, from, until = addMonths(from, PAYOFF_YEARS * 12) }) {
  const round = (amount) => Math.round(amount * 100) / 100;
  const stepper = interest ? interestStepper({ ...interest, since: from }) : null;
  const days = new Set(paymentDays(first, frequency, until).map(day => day.getTime()));
  const yearIn = addMonths(first, 12);
  const schedule = [];
  let balance = -owed; // (Money owed is below $0, like an Other Account's)
  let addedSince = 0;
  let addedAll = 0;
  let paid = 0;
  for (let day = addDays(from, 1); day <= until; day = addDays(day, 1)) {
    if (stepper) {
      const change = stepper.step(day, balance);
      balance = round(balance + change);
      addedSince += change;
      addedAll += change;
    }
    if (!days.has(day.getTime())) continue;
    const amount = Math.min(payment, round(-balance));
    balance = round(balance + amount);
    paid += amount;
    schedule.push({ date: day, payment: amount, interest: round(-addedSince), owed: round(-balance) });
    addedSince = 0;
    if (balance >= 0) return { schedule, paidOff: day, interest: round(-addedAll), paid: round(paid) };
    if (day >= yearIn && -balance >= owed) break;
  }
  return { schedule, paidOff: null, interest: round(-addedAll), paid: round(paid) };
}

// The smallest payment (to the cent) that pays off `owed` by the day `by` (options: as payOff takes them, without a
// payment), or null when none can: a day before the first payment, one more than PAYOFF_YEARS away, or interest that
// adds up faster than MAX_AMOUNT a payment pays
function paymentToPayOffBy(options, by) {
  if (by < options.first || by > addMonths(options.from, PAYOFF_YEARS * 12)) return null;
  const works = (cents) => {
    const result = payOff({ ...options, payment: cents / 100, until: by });
    return result.paidOff !== null;
  };
  const years = Math.max(1, getDayDifference(by, options.from) / 365);
  let high = Math.ceil(options.owed * (1 + (options.interest ? options.interest.rate / 100 : 0) * (years + 1)) * 100) + 100;
  // (Interest compounding for years before the first payment can outgrow that guess)
  while (!works(high)) {
    if (high > MAX_AMOUNT * 100) return null;
    high *= 2;
  }
  let low = 0;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (works(middle)) high = middle;
    else low = middle;
  }
  return high / 100;
}

// An Other Account's own pace back up to $0 from below (its row index), from today: its entries, the ones the budget
// still has coming for ACCOUNT_PAYOFF_YEARS (projection: projectBudget, to that day), and its interest, and the same
// with `extra` more on each payment day (paymentDays from first, every frequency). { owed (today, above $0 when it's
// below), now: { paidOff, interest }, withExtra: { paidOff, interest } } (paidOff: the day it's back to $0, or null
// when it isn't in the years looked at; interest: what it pays from today until then), or null for an account it
// doesn't know.
function accountPayoff(index, projection, { extra = 0, frequency = "monthly", first = addDays(today, 1) } = {}) {
  const parts = projection.accountParts(index);
  if (!parts) return null;
  const until = projection.until;
  const round = (amount) => Math.round(amount * 100) / 100;
  const run = (more) => {
    const entries = [...parts.entries, ...more];
    const credits = parts.interest ? interestCredits(parts.start, entries, parts.interest, until) : [];
    const events = [...entries, ...credits.map(credit => ({ ...credit, interest: true }))].sort((a, b) => a.date - b.date);
    let balance = parts.start;
    let at = 0;
    while (at < events.length && events[at].date <= today) balance += events[at++].change;
    const owed = round(-balance);
    let interest = 0;
    while (at < events.length && balance < 0) {
      const date = events[at].date;
      while (at < events.length && events[at].date.getTime() === date.getTime()) {
        balance += events[at].change;
        if (events[at].interest) interest += events[at].change;
        at++;
      }
      if (round(balance) >= 0) return { owed, paidOff: date, interest: round(-interest) };
    }
    return { owed, paidOff: owed <= 0 ? today : null, interest: round(-interest) };
  };
  const now = run([]);
  const extras = extra > 0 ? paymentDays(first, frequency, until).filter(day => day > today).map(date => ({ date, change: extra })) : [];
  return { owed: now.owed, now: { paidOff: now.paidOff, interest: now.interest }, withExtra: extra > 0 ? run(extras) : null };
}

// New account (index null) or change the tapped one. fields: { name, balance (today's, a number; leave it out
// to keep it), interest ({ rate (a year in %), compound, every, day (see accountInterest; each left out is the
// default) }, or null for none; leave it out to keep it), max (the most it can hold, like a credit card's limit: a
// number, or null for none; leave it out to keep it) }. A new name goes on its entries and tracker aliases too, so they
// stay with it. A balance sets the starting amount so today's balance comes out to it (the entries stay as they are). A
// new balance or new interest starts interest counting from today, with the interest so far kept in today's balance.
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
  // How it compounds, how often it's added, and on what day (see interestSettings)
  const oldInterest = row ? accountInterest(row) : null;
  const settings = rate ? interestSettings(fields.interest, oldInterest ? oldInterest.day : today.getDate()) : null;
  let max = fields.max === undefined ? undefined : (fields.max === null ? 0 : Number(fields.max));
  if (max !== undefined && (!Number.isFinite(max) || max < 0 || max > MAX_AMOUNT)) {
    throw new BudgetInputError("Enter the most it can hold, like 2000.00 (up to $1,000,000,000), or leave Max blank.");
  }
  const maxText = max ? formatMoney(max) : "";

  formEntryRow[3] = "Account: " + name;
  formEntryRow[4] = "";
  formEntryRow[5] = "";
  if (isNew) {
    const row = [name, formatMoney(balance || 0), "", balance ? formatMoney(balance) : "", rate ? String(rate) : "", rate ? formatToMMDDYYYY(today) : "", maxText, ...(settings ? settings.columns : ["", "", ""])];
    list.push(row);
    formEntryRow[2] = "🏦 New Account";
    if (balance) formEntryRow[5] = "Balance: " + formatMoney(balance);
    if (rate) formEntryRow[6] = `Interest: ${describeInterest(accountInterest(row))}`;
    if (maxText) formEntryRow[6] = [formEntryRow[6], `Max: ${maxText}`].filter(Boolean).join(", ");
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
  const oldRate = oldInterest ? oldInterest.rate : 0;
  const newRate = rate === undefined ? oldRate : rate;
  const interestChanged = newRate !== oldRate || (!!settings && !!oldInterest && ["compound", "every", "day"].some(key => settings[key] !== oldInterest[key]));
  const balanceChanged = balance !== null && Math.abs(now - balance) >= 0.005;
  // (Its settings written out in full: the day it's added stays put when interest starts counting again from today)
  if (oldInterest) [row[7], row[8], row[9]] = interestSettings(oldInterest, oldInterest.day).columns;
  if (newRate && settings) [row[7], row[8], row[9]] = settings.columns;
  if (balanceChanged || interestChanged) {
    // Today's balance is the one typed (or stays what it is, interest so far and all), and interest counts from today
    const target = balanceChanged ? balance : now;
    const start = Math.round((target - (summary ? summary.entriesToday : 0)) * 100) / 100;
    row[3] = start ? formatMoney(start) : "";
    row[4] = newRate ? String(newRate) : "";
    row[5] = newRate ? formatToMMDDYYYY(today) : "";
    if (!newRate) [row[7], row[8], row[9]] = ["", "", ""];
    if (balanceChanged) formEntryRow[5] = `Balance: ${formatMoney(balance)} (was ${formatMoney(now)})`;
    if (interestChanged) formEntryRow[6] = newRate ? `Interest: ${describeInterest(accountInterest(row))}` : "Interest: Off";
  }
  if (max !== undefined && maxText !== String(row[6] ?? "").trim()) {
    row[6] = maxText;
    formEntryRow[6] = [formEntryRow[6], `Max: ${maxText || "None"}`].filter(Boolean).join(", ");
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

  // Goals for it, and the notes on its entries
  for (const goal of accountsData.goals || []) {
    if (goal.kind === "account" && cleanString(goal.account) === oldClean) goal.account = newName;
  }
  renameAccountNotes(oldClean, newName);

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

// The same for Upcoming: entries on one day with the same title (its Other Account too) and type become one, whatever
// their marks or %, their amounts added (the mark stays if either had one, like combineSameEntries; a placeholder only if
// both were, and a plain amount)
function combineSameUpcoming() {
  let kept = [futureData[0]];
  let byKey = new Map();
  for (let f = 1; f < futureData.length; f++) {
    let row = futureData[f];
    let key = String(row[2]).trim() + "|" + cleanString(row[0]) + "|" + getSpecialType(String(row[3]).trim());
    let same = cleanString(row[0]) ? byKey.get(key) : undefined;
    if (same) {
      same[1] = formatMoney(parseAmount(same[1]) + parseAmount(row[1]));
      same[3] = decoratedSprite(combineSprites(same[3], row[3]), { placeholder: isPlaceholder(same[3]) && isPlaceholder(row[3]) });
      continue;
    }
    byKey.set(key, row);
    kept.push(row);
  }
  futureData = kept;
}

/* ---------- Goals (Bob's Goals card) ---------- */
// A goal is an amount for an Other Account, In Bank, or the Total (In Bank and every Other Account together, like Other
// Accounts' Total today) to reach, by a day if it has one, with a title of its own if it has one. A credit card's can be
// to climb from below $0 to $0 (paid off) or more. A % goal is that percent of what it's for on the day it's set, and
// stays that amount (its percent is kept to show it). Bob's page lists them with how far along each one is, and works
// out what reaching each one takes (Bob Page.js). They're kept with the Other Accounts (accountsData.goals): [{ title
// ("" for none), kind: "inBank" | "total" | "account" ("none": one set before goals needed what they're for, kept until
// it's changed), account (the account's name, for "account"), amount, percent (null for a plain amount), date (the day to
// reach it by, "" for none), made (the day it was set), start (what it was for held then, so how far along it is counts
// from there, like a credit card climbing to $0; left out by goals set before it was kept) }], dates as MM/DD/YYYY.

const MAX_GOALS = 20;
const GOAL_KINDS = ["none", "inBank", "total", "account"];

// New goal (index null) or change one, and delete one
function saveGoal(fields, index = null) {
  return runBudgetAction("", (before) => goalEntry(fields, index, JSON.parse(before.calendar)));
}

function deleteGoal(index) {
  return runBudgetAction("", () => removeGoal(index));
}

// The stored goals, checked (one that can't be read is left out)
function normalizeGoals(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter(goal => goal && typeof goal === "object" && GOAL_KINDS.includes(goal.kind) && typeof goal.title === "string" && Number.isFinite(goal.amount))
    .slice(0, MAX_GOALS)
    .map(goal => ({
      title: goal.title.slice(0, MAX_TITLE),
      kind: goal.kind,
      account: goal.kind === "account" ? String(goal.account ?? "").slice(0, MAX_ACCOUNT_NAME) : "",
      amount: Math.round(goal.amount * 100) / 100,
      percent: Number.isFinite(goal.percent) ? goal.percent : null,
      date: String(goal.date ?? "").slice(0, 10),
      made: String(goal.made ?? "").slice(0, 10),
      ...(Number.isFinite(goal.start) ? { start: Math.round(goal.start * 100) / 100 } : {})
    }));
}

// What a goal is for, as people read it: "Savings", "In Bank", "Total", or ""
function goalTarget(goal) {
  return goal.kind === "account" ? goal.account : goal.kind === "inBank" ? "In Bank" : goal.kind === "total" ? "Total" : "";
}

// A goal's name: its title, or without one, what it's for
function goalName(goal) {
  return goal.title || goalTarget(goal) || "Goal";
}

// What a goal is for, today: In Bank, the Total, or its account's balance; null for none (or an account that's gone).
// calendar: the calendar with its In Bank lines (a change takes them off while it runs, see stripRecurringEntries)
function goalBalance(goal, calendar = calendarData) {
  if (goal.kind === "none") return null;
  const todaySpot = calendarSpot(today);
  const inBank = (todaySpot && readInBank(calendar[todaySpot.r][todaySpot.c])) ?? 0;
  if (goal.kind === "inBank") return inBank;
  const accounts = otherAccounts();
  if (goal.kind === "total") return Math.round((inBank + accounts.reduce((total, account) => total + account.balance, 0)) * 100) / 100;
  const account = accounts.find(known => cleanString(known.name) === cleanString(goal.account));
  return account ? account.balance : null;
}

// fields: { title ("" for none), kind ("inBank", "total", or "account"), account (its name, for "account"), amount (a
// number), percent (a signed percent of what it's for today, instead of amount), date (the day to reach it by, or null
// for none) }. A % goal that keeps its percent and what it's for keeps its amount (the one worked out when it was set).
// calendar: the calendar as it was before the change (with In Bank).
function goalEntry(fields, index, calendar = calendarData) {
  const goals = accountsData.goals || [];
  const isNew = index === null || index === undefined;
  const old = isNew ? null : goals[index];
  if (!isNew && !old) throw new BudgetInputError("That goal couldn't be found. Please try again.");
  if (isNew && goals.length >= MAX_GOALS) throw new BudgetInputError(`You can have up to ${MAX_GOALS} goals. Delete one first.`);
  const title = capitalize(String(fields.title || "").replace(/\s+/g, " ").trim());
  if (title.length > MAX_TITLE) throw new BudgetInputError(`Titles can be up to ${MAX_TITLE} characters.`);
  const kind = fields.kind;
  if (!["inBank", "total", "account"].includes(kind)) throw new BudgetInputError("Pick what it's for: In Bank, the Total, or one of your Other Accounts.");
  let account = "";
  if (kind === "account") {
    const found = accountRows().find(known => known.clean === cleanString(fields.account));
    if (!found) throw new BudgetInputError("Pick one of your Other Accounts.");
    account = found.name;
  }
  const date = fields.date instanceof Date && !isNaN(fields.date.getTime()) ? createSafeMidnight(fields.date) : null;

  const percent = readPercent(fields.percent);
  const goal = { title, kind, account, amount: 0, percent, date: date ? formatToMMDDYYYY(date) : "", made: formatToMMDDYYYY(today) };
  if (percent !== null) {
    if (old && old.percent === percent && old.kind === kind && cleanString(old.account) === cleanString(account)) {
      goal.amount = old.amount;
      goal.made = old.made;
    } else {
      const balance = goalBalance(goal, calendar);
      if (balance === null) throw new BudgetInputError("A % goal is a percent of what it's for, so pick an Other Account, In Bank, or Total.");
      goal.amount = percentValue(percent, balance);
    }
  } else {
    goal.amount = Math.round(Number(fields.amount) * 100) / 100;
    if (!Number.isFinite(goal.amount)) throw new BudgetInputError("Enter the amount, like 2000.00.");
    if (Math.abs(goal.amount) > MAX_AMOUNT) throw new BudgetInputError(AMOUNT_TOO_BIG);
    if (old && old.percent === null && old.amount === goal.amount) goal.made = old.made;
  }
  // What it's for holds now (or what it held when the goal was set, while that's still what it's for)
  const sameTarget = !!old && old.kind === kind && cleanString(old.account) === cleanString(account);
  const start = sameTarget && Number.isFinite(old.start) ? old.start : goalBalance(goal, calendar);
  if (Number.isFinite(start)) goal.start = Math.round(start * 100) / 100;
  if (isNew) goals.push(goal);
  else goals[index] = goal;
  accountsData.goals = goals;

  formEntryRow[2] = isNew ? "🎯 New Goal" : "🎯 Change Goal";
  formEntryRow[3] = "Goal: " + (title ? `${title} (${goalTarget(goal)})` : goalTarget(goal));
  formEntryRow[4] = "By: " + (date ? showDate(date) : "Any Day");
  formEntryRow[5] = "";
  formEntryRow[6] = "Amount: " + (percent !== null ? `${showPercent(percent)} (${formatMoney(goal.amount)})` : formatMoney(goal.amount));
  return {};
}

function removeGoal(index) {
  const goals = accountsData.goals || [];
  const goal = goals[index];
  if (!goal) throw new BudgetInputError("That goal couldn't be found. Please try again.");
  goals.splice(index, 1);
  if (goals.length > 0) accountsData.goals = goals;
  else delete accountsData.goals;
  formEntryRow[2] = "🎯 Delete Goal";
  formEntryRow[3] = "Goal: " + goalName(goal);
  formEntryRow[4] = "";
  formEntryRow[5] = "";
  formEntryRow[6] = "";
  return {};
}

/* ---------- Bob's page (menu/bob.html, drawn by Bob Page.js) ---------- */
// Bob's page is a column of cards. Data and Accounts always show; each of the rest has its own on/off switch, and
// starts off (a budget that had goals before the page did starts with Goals on, so they don't go missing). Which ones
// are on is kept with the budget, so every device, and anyone sharing the budget, sees the same page:
// accountsData.bob = { cards: [the ids of the cards that are on], purposes, wavelengths (see WAVELENGTH PLANNING) }.
// It's left out until something's been set, so loading a budget alone never counts as a change.

// Each switchable card's id and its name (for Change Logs; the page has its own words)
const BOB_CARDS = new Map([
  ["goals", "Goals"],
  ["purposes", "Wavelength Planning"],
  ["payday", "Payday"],
  ["pace", "Spending Pace"],
  ["bills", "Big Bills"],
  ["weekly", "Weekly Check"],
  ["catchup", "Catchup Entries"],
  ["refund", "Refunds"]
]);

// The stored settings, checked: { cards, purposes, wavelengths (only when they aren't the defaults) }, or null with
// nothing stored (and no goals)
function normalizeBob(stored, hasGoals) {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return hasGoals ? { cards: ["goals"], purposes: {} } : null;
  const cards = Array.isArray(stored.cards) ? [...BOB_CARDS.keys()].filter(id => stored.cards.includes(id)) : [];
  const wavelengths = normalizeWavelengths(stored.wavelengths);
  const known = new Set((wavelengths || DEFAULT_WAVELENGTHS).map(wave => wave.id));
  const purposes = {};
  const kept = stored.purposes && typeof stored.purposes === "object" && !Array.isArray(stored.purposes) ? stored.purposes : {};
  for (const [key, purpose] of Object.entries(kept).slice(0, MAX_PURPOSES)) {
    // (A "__proto__" key would replace the object's prototype instead of adding a title)
    if (key !== "__proto__" && key.length <= MAX_ENTRY_TITLE && known.has(purpose)) purposes[key] = purpose;
  }
  return wavelengths ? { cards, purposes, wavelengths } : { cards, purposes };
}

// The settings to change, made when there are none yet
function bobSettings() {
  if (!accountsData.bob) accountsData.bob = { cards: [], purposes: {} };
  return accountsData.bob;
}

// Is this card on? (Data and Accounts, which have no switch, always are)
function bobCardOn(id) {
  if (!BOB_CARDS.has(id)) return true;
  return !!accountsData?.bob?.cards?.includes(id);
}

// A card's switch
function turnBobCard(id, on) {
  return runBudgetAction("💡 Bob's Cards", () => {
    if (!BOB_CARDS.has(id)) throw new BudgetInputError("That card couldn't be found. Please reload the page.");
    const bob = bobSettings();
    bob.cards = [...BOB_CARDS.keys()].filter(card => (card === id ? on : bob.cards.includes(card)));
    formEntryRow[3] = `${BOB_CARDS.get(id)}: ${on ? "On" : "Off"}`;
    return {};
  });
}

/* ---------- Wavelength Planning (Bob's card for it) ---------- */
// What an entry's money is for (its purpose): one of the budget's wavelengths, or none. There are 1 to MAX_WAVELENGTHS
// of them, each named as the person likes, in order from the longest wavelength to the shortest, like light's spectrum
// (DEFAULT_WAVELENGTHS until they're changed). A purpose is kept for each title (as the tracker compares them,
// titleKey: "Groceries → Cash" is Groceries), so every entry with the title shares it, on every day:
// accountsData.bob.purposes: { title -> a wavelength's id } (a title with none isn't kept), and
// accountsData.bob.wavelengths: [{ id, name }] (left out while they're the defaults). Once the card is on, every form
// that makes or changes an entry asks for it at the bottom, with a button for each wavelength, and the card's spectrum
// adds up what each one cost.

const DEFAULT_WAVELENGTHS = [{ id: "needs", name: "Needs" }, { id: "wants", name: "Wants" }, { id: "future", name: "Future" }];
const MAX_WAVELENGTHS = 10;
const MAX_WAVELENGTH_NAME = 30;
const WAVELENGTH_ID = /^[a-z0-9]{1,24}$/;
const MAX_PURPOSES = 2000;

// The budget's wavelengths, in order: [{ id, name }]
function wavelengthList() {
  return accountsData?.bob?.wavelengths || DEFAULT_WAVELENGTHS;
}

// A wavelength's name ("None" for none, or one that's been taken out)
function wavelengthName(id) {
  return wavelengthList().find(wave => wave.id === id)?.name ?? "None";
}

// Stored wavelengths, checked: [{ id, name }] (1 to MAX_WAVELENGTHS, each id and name once), or null for the defaults
function normalizeWavelengths(stored) {
  if (!Array.isArray(stored)) return null;
  const list = [];
  const ids = new Set();
  const names = new Set();
  for (const wave of stored) {
    const id = String(wave?.id ?? "");
    const name = String(wave?.name ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_WAVELENGTH_NAME);
    if (!WAVELENGTH_ID.test(id) || !name || ids.has(id) || names.has(name.toLowerCase())) continue;
    ids.add(id);
    names.add(name.toLowerCase());
    list.push({ id, name });
    if (list.length === MAX_WAVELENGTHS) break;
  }
  return list.length > 0 ? list : null;
}

// A title's purpose: one of the wavelengths' ids, or "none"
function purposeOf(title) {
  const key = titleKey(String(title ?? ""));
  const purposes = accountsData?.bob?.purposes;
  if (!key || !purposes || !Object.prototype.hasOwnProperty.call(purposes, key)) return "none";
  return wavelengthList().some(wave => wave.id === purposes[key]) ? purposes[key] : "none";
}

// Within a change: a title gets this purpose (a wavelength's id, or "none"; anything else, like a form without the
// question, leaves it as it is). Change Logs say so. A title new to the list when MAX_PURPOSES titles already have one
// is refused, or with skipWhenFull just left without one (a quick entry still joins the budget).
function noteEntryPurpose(title, purpose, skipWhenFull = false) {
  if (purpose !== "none" && !wavelengthList().some(wave => wave.id === purpose)) return;
  const key = titleKey(String(title ?? ""));
  if (!key || purposeOf(title) === purpose) return;
  const bob = bobSettings();
  if (purpose === "none") {
    delete bob.purposes[key];
  } else {
    const isNew = !Object.prototype.hasOwnProperty.call(bob.purposes, key);
    if (isNew && Object.keys(bob.purposes).length >= MAX_PURPOSES) {
      if (skipWhenFull) return;
      throw new BudgetInputError(`Up to ${MAX_PURPOSES} titles can be on a wavelength. Set some you don't use anymore to None first.`);
    }
    bob.purposes[key] = purpose;
  }
  formEntryRow[3] = `${formEntryRow[3]} (${wavelengthName(purpose)})`.trim();
}

// Only a title's purpose changed (an entry's options with nothing else changed)
function saveEntryPurpose(title, purpose) {
  return runBudgetAction("🏷️ Entry Wavelength", () => {
    formEntryRow[3] = capitalize(String(title || "").trim());
    noteEntryPurpose(title, purpose);
    return {};
  });
}

// The wavelengths as Bob's card's window leaves them: [{ id (one that's there now, or null for a new one), name }], in
// order. A new one gets an id no other one has; titles on one that was taken out have none after. Back to Needs, Wants,
// and Future, they're left out of the budget again.
function saveWavelengths(list) {
  return runBudgetAction("🌈 Wavelengths", () => {
    if (!Array.isArray(list) || list.length < 1 || list.length > MAX_WAVELENGTHS) throw new BudgetInputError(`Keep 1 to ${MAX_WAVELENGTHS} wavelengths.`);
    const current = wavelengthList();
    const taken = new Set(current.map(wave => wave.id));
    const kept = new Set();
    const names = new Set();
    const next = list.map(item => {
      const name = String(item?.name ?? "").replace(/\s+/g, " ").trim();
      if (!name) throw new BudgetInputError("Give every wavelength a name.");
      if (name.length > MAX_WAVELENGTH_NAME) throw new BudgetInputError(`A wavelength's name can be up to ${MAX_WAVELENGTH_NAME} characters.`);
      if (names.has(name.toLowerCase())) throw new BudgetInputError(`Two wavelengths can't both be called ${name}.`);
      names.add(name.toLowerCase());
      const id = current.some(wave => wave.id === item.id) && !kept.has(item.id) ? item.id : null;
      if (id) kept.add(id);
      return { id, name };
    });
    for (const wave of next) {
      if (wave.id) continue;
      let n = 1;
      while (taken.has(`w${n}`)) n++;
      wave.id = `w${n}`;
      taken.add(wave.id);
    }
    const bob = bobSettings();
    const gone = current.filter(wave => !kept.has(wave.id));
    for (const [title, id] of Object.entries(bob.purposes)) if (gone.some(wave => wave.id === id)) delete bob.purposes[title];
    if (JSON.stringify(next) === JSON.stringify(DEFAULT_WAVELENGTHS)) delete bob.wavelengths;
    else bob.wavelengths = next;
    formEntryRow[3] = next.map(wave => wave.name).join(", ");
    if (gone.length > 0) formEntryRow[4] = `Taken Out: ${gone.map(wave => wave.name).join(", ")}`;
    return {};
  });
}

/* ---------- Entry notes ---------- */
// Any entry can have a note, as long as it needs to be: an entry's own on its day (a recurring entry's or a connected
// spreadsheet's too, once it lands there), and a recurring entry's own (on its Recurring Entries form). They're kept in a
// table of their own, so long notes never fill up the rest of the budget: notesData = { version: 1, entries: {
// "YYYY-MM-DD|title as compared|type": note }, recurring: { "title as compared|type": note } } (type: regular, hidden, or
// transfer; the title as compared keeps its Other Account, since a day has one entry per title, account, and type). A
// note goes wherever its entry goes (another day, title, type, or account; into an entry already there, the two notes are
// put together), and it goes when its entry does (deleted, or a placeholder whose day passed, see dropStrayNotes). Undo
// and Redo put a day's notes back with its entries. Every entry form has its note at the bottom (BudgetUI.noteField).

const NOTE_TYPES = { "❗️": "regular", "✖️": "hidden", "⭕️": "transfer" };
const MAX_NOTES_BYTES = 1800000;     // Every note together (a little under MAX_TABLE_BYTES)
const MAX_UNDO_NOTE_CHARS = 100000;  // A change's notes kept for Undo in this tab (more than that, Undo leaves them be)
const NOTES_FULL = "Your notes are full (about 1.8 MB of them together). Make some shorter, or delete some, first.";

// No notes yet
function emptyNotes() {
  return { version: 1, entries: {}, recurring: {} };
}

// The stored notes, checked (none stored is none)
function normalizeApiNotes(stored) {
  const notes = emptyNotes();
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return notes;
  for (const part of ["entries", "recurring"]) {
    const kept = stored[part] && typeof stored[part] === "object" && !Array.isArray(stored[part]) ? stored[part] : {};
    for (const [key, text] of Object.entries(kept)) {
      // (A "__proto__" key would replace the object's prototype instead of adding a note)
      if (key !== "__proto__" && key.includes("|") && typeof text === "string" && text.trim()) notes[part][key] = text;
    }
  }
  return notes;
}

// The key of an entry's note on its day, and a recurring entry's own
function entryNoteKey(date, title, sprite) {
  return `${formatToYMD(createSafeMidnight(date))}|${cleanString(title)}|${NOTE_TYPES[getSpecialType(sprite)]}`;
}

function recurringNoteKey(title, sprite) {
  return `${cleanString(title)}|${NOTE_TYPES[getSpecialType(sprite)]}`;
}

// A note ("" for none). part: "entries" or "recurring"
function noteText(part, key) {
  const notes = notesData?.[part];
  return notes && Object.prototype.hasOwnProperty.call(notes, key) ? notes[key] : "";
}

// An entry's note on its day, and a recurring entry's own (for their forms)
function entryNote(date, title, sprite) {
  return noteText("entries", entryNoteKey(date, title, sprite));
}

function recurringNote(title, sprite) {
  return noteText("recurring", recurringNoteKey(title, sprite));
}

// Does an entry line have a note on its day? (it's underlined wherever it shows)
function lineHasNote(date, line) {
  const read = readLine(line);
  return !read.blank && !read.system && read.title !== "" && entryNote(date, read.title, read.sprite) !== "";
}

// Within a change: a note, or none for a blank one
function putNote(part, key, text) {
  const note = String(text ?? "");
  if (note.trim()) notesData[part][key] = note;
  else delete notesData[part][key];
}

// Two notes as one (an entry that went into another), the first one first
function joinNotes(first, second) {
  if (!String(first).trim()) return second;
  if (!String(second).trim() || first === second) return first;
  return `${first}\n\n${second}`;
}

// Change Logs say when a change added, changed, or took off a note (never what it says)
function logNoteChange(before, after) {
  const was = String(before ?? "").trim() !== "";
  const now = String(after ?? "").trim() !== "";
  const words = !was && now ? "Note Added" : was && !now ? "Note Removed" : was && before !== after ? "Note Changed" : "";
  if (words) formEntryRow[3] = `${formEntryRow[3]} (${words})`.trim();
}

// Within a change: are the notes still small enough to keep? (they're refused, or with skipWhenFull, the caller leaves
// its note out)
function notesFit() {
  return new TextEncoder().encode(JSON.stringify(notesData)).length <= MAX_NOTES_BYTES;
}

// Within a change: a new entry's note (note: from its form), on the entry it landed as (sprite: its type), added after
// the note of one already there that it went into. skipWhenFull: a quick entry, which still joins the budget without it
// when the notes are full.
function addEntryNote(date, title, sprite, note, skipWhenFull = false) {
  if (!notesData || typeof note !== "string" || !note.trim()) return;
  const key = entryNoteKey(date, title, sprite);
  const before = noteText("entries", key);
  putNote("entries", key, joinNotes(before, note));
  if (!notesFit()) {
    putNote("entries", key, before);
    if (skipWhenFull) return;
    throw new BudgetInputError(NOTES_FULL);
  }
  logNoteChange(before, noteText("entries", key));
}

// Within a change to an entry: its note goes where it went (another day, title, type, or Other Account), after the note
// of an entry it went into, and the form's note (change.note) takes its place; it goes when the entry is deleted
function followEntryNote(change, deleted) {
  if (!notesData) return;
  const from = entryNoteKey(change.date, change.title, change.sprite);
  const old = noteText("entries", from);
  if (deleted) return putNote("entries", from, "");
  const to = entryNoteKey(change.moveDate || change.date, changedTitle(change), change.newSprite ?? change.sprite);
  const own = change.note !== undefined ? String(change.note) : old;
  const there = to === from ? "" : noteText("entries", to);
  if (to !== from) putNote("entries", from, "");
  putNote("entries", to, joinNotes(there, own));
  if (!notesFit()) throw new BudgetInputError(NOTES_FULL);
  logNoteChange(old, own);
}

// Within a change to a recurring entry: its own note, on its title, account, and type as they are now (before: its row
// before the change, null for a new one), with the form's (fields.note) in its place
function followRecurringNote(before, fields) {
  if (!notesData) return;
  const to = recurringNoteKey(fields.title, fields.sprite);
  const from = before ? recurringNoteKey(before[0], before[5]) : to;
  const old = noteText("recurring", from);
  const own = fields.note !== undefined ? String(fields.note) : old;
  if (to !== from) putNote("recurring", from, "");
  putNote("recurring", to, joinNotes(to === from ? "" : noteText("recurring", to), own));
  if (!notesFit()) throw new BudgetInputError(NOTES_FULL);
  logNoteChange(old, own);
}

// Within a recurring entry's new title, Other Account, or type (after moveRecurringTemps): the notes on its days from
// `from` on go with it. A day that still has an entry of its own with the old title and type (one the recurring entry
// didn't land on) keeps that entry's note.
function moveDayNotes(oldTitle, oldSprite, newTitle, newSprite, from) {
  if (!notesData) return;
  const oldPart = `|${cleanString(oldTitle)}|${NOTE_TYPES[getSpecialType(oldSprite)]}`;
  const first = formatToYMD(from);
  const own = new Set();
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 7; c++) {
      for (const line of ownEntryLines(calendarData[r][c])) own.add(entryNoteKey(gridDates[r][c], readLine(line).title, readLine(line).sprite));
    }
  }
  for (const row of futureData.slice(1)) {
    const date = createSafeMidnight(row[2], true);
    if (String(row[0] ?? "").trim() && !isNaN(date.getTime())) own.add(entryNoteKey(date, row[0], row[3]));
  }
  for (const key of Object.keys(notesData.entries)) {
    if (key.slice(10) !== oldPart || key.slice(0, 10) < first || own.has(key)) continue;
    const day = key.slice(0, 10);
    const to = `${day}|${cleanString(newTitle)}|${NOTE_TYPES[getSpecialType(newSprite)]}`;
    const note = noteText("entries", key);
    putNote("entries", key, "");
    putNote("entries", to, joinNotes(noteText("entries", to), note));
  }
}

// Within an account's rename (renameAccountEntries): the notes on its entries and recurring entries follow its new name
function renameAccountNotes(oldClean, newName) {
  if (!notesData) return;
  const ending = ` ${ACCOUNT_ARROW} ${oldClean}`;
  const renamed = (title) => {
    if (title === `${ACCOUNT_ARROW} ${oldClean}`) return `${ACCOUNT_ARROW} ${cleanString(newName)}`;
    return title.endsWith(ending) ? `${title.slice(0, -ending.length)} ${ACCOUNT_ARROW} ${cleanString(newName)}` : null;
  };
  for (const part of ["entries", "recurring"]) {
    for (const key of Object.keys(notesData[part])) {
      // (An entry's key starts with its day, YYYY-MM-DD|; the type is after the last |)
      const start = part === "entries" ? 11 : 0;
      const end = key.lastIndexOf("|");
      const title = renamed(key.slice(start, end));
      if (title === null) continue;
      const to = `${key.slice(0, start)}${title}${key.slice(end)}`;
      const note = noteText(part, key);
      putNote(part, key, "");
      putNote(part, to, joinNotes(noteText(part, to), note));
    }
  }
}

// Notes whose entry is gone go too: on History's and the calendar's days (a day after the calendar can have a note for
// an entry that lands there later, like a recurring entry's), and a recurring entry's own once no recurring entry has
// its title, account, and type
function dropStrayNotes() {
  if (!notesData) return;
  const entryKeys = Object.keys(notesData.entries);
  const recurringKeys = Object.keys(notesData.recurring);
  const lastDay = formatToYMD(gridEndDate);
  if (entryKeys.some(key => key.slice(0, 10) <= lastDay)) {
    const there = new Set();
    const addDay = (date, cellText) => {
      for (const text of String(cellText ?? "").split("\n").slice(1)) {
        const line = readLine(text);
        if (!line.blank && !line.system && line.title) there.add(entryNoteKey(date, line.title, line.sprite));
      }
    };
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 7; c++) addDay(gridDates[r][c], calendarData[r][c]);
    }
    for (let r = 1; r < historyData.length; r++) {
      for (let c = 0; c < 7; c++) {
        const text = String(historyData[r][c] ?? "");
        const date = createSafeMidnight(text.split("\n")[0].trim(), true);
        if (!isNaN(date.getTime())) addDay(date, text);
      }
    }
    for (const key of entryKeys) if (key.slice(0, 10) <= lastDay && !there.has(key)) delete notesData.entries[key];
  }
  if (recurringKeys.length > 0) {
    const rows = new Set(recurringData.slice(2).filter(row => !["", "-"].includes(String(row[0] ?? "").trim())).map(row => recurringNoteKey(row[0], row[5])));
    for (const key of recurringKeys) if (!rows.has(key)) delete notesData.recurring[key];
  }
}

// A day's notes, for Undo and Redo (see captureEntryDays): { key: note }
function dayNotes(date) {
  const notes = {};
  const prefix = `${formatToYMD(date)}|`;
  for (const [key, text] of Object.entries(notesData?.entries || {})) if (key.startsWith(prefix)) notes[key] = text;
  return notes;
}

// What a change did to a day's notes, to put back or do again: { before, after }, each { key: note ("" for none) } for
// just the notes it changed (so Undo never touches one changed since), or null when it changed none, or when they're
// longer than this tab keeps for Undo (MAX_UNDO_NOTE_CHARS: then Undo leaves the notes as they are)
function notesChange(before = {}, after = {}) {
  const change = { before: {}, after: {} };
  let size = 0;
  let any = false;
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const was = Object.prototype.hasOwnProperty.call(before, key) ? before[key] : "";
    const now = Object.prototype.hasOwnProperty.call(after, key) ? after[key] : "";
    if (was === now) continue;
    change.before[key] = was;
    change.after[key] = now;
    size += was.length + now.length;
    any = true;
  }
  return any && size <= MAX_UNDO_NOTE_CHARS ? change : null;
}

// Within Undo or Redo: notes as a step had them ({ key: note }, see notesChange)
function putStepNotes(notes) {
  for (const [key, text] of Object.entries(notes || {})) putNote("entries", key, text);
}

// Only a title's purpose or an entry's note changed (an entry's options, with nothing else changed): extras { purpose,
// note }, each left out to keep it as it is. A note's change can be undone.
function saveEntryExtras(date, title, sprite, { purpose, note } = {}) {
  const day = createSafeMidnight(date);
  const name = capitalize(String(title || "").trim());
  const undo = note !== undefined ? { label: `changed the note on ${name} on ${showDay(day)}`, dates: [day] } : null;
  return runBudgetAction(note !== undefined ? "📝 Entry Note" : "🏷️ Entry Purpose", () => {
    formEntryRow[3] = name;
    formEntryRow[4] = "On: " + showDate(day);
    if (purpose !== undefined) noteEntryPurpose(title, purpose);
    if (note !== undefined) {
      const key = entryNoteKey(day, title, sprite);
      const before = noteText("entries", key);
      putNote("entries", key, note);
      if (!notesFit()) throw new BudgetInputError(NOTES_FULL);
      logNoteChange(before, note);
    }
    return {};
  }, undo);
}

/* ---------- Backups (Settings' Upload A Backup) ---------- */
// A file Download My Data saved (the API's export: { about, account, budget: { lastDailyUpdate, calendar,
// recurringEntries, upcoming, history, otherAccounts, tracker, paycheckCalculator, changeLogs, connectedSpreadsheets,
// notes }, ... }) brings a budget back, one part at a time (BACKUP_PARTS), each the way the person picked:
//   "current":  where the backup and the budget both have something (an entry with the same title and type on the same
//               day, a recurring entry with the same title, account, and type, an account with the same name, ...), the
//               budget's stays; everything else in the backup is added
//   "uploaded": the same, but where they clash, the backup's takes the budget's place
//   "remove":   the budget's part is removed, and the backup's takes its place
// A part the backup doesn't have stays as it is. Days go by their dates, wherever the backup kept them (its calendar's
// first weeks can be History by now, and its Upcoming entries on the calendar). On a day that has passed, an entry that
// had landed by itself (from a recurring entry or a connected spreadsheet) stays as it was, like the daily update keeps
// it, and from today on the recurring entries and spreadsheets land theirs again. History's days keep an In Bank of their
// own, from the side that wins (on a day with neither, the day before's). readBackup reads a file, backupPlans says what
// each part would get (for the Upload A Backup window), and uploadBackup puts them in.

const BACKUP_MAX_BYTES = 25 * 1024 * 1024; // The biggest file read (every part of a budget, with room to spare)
const BACKUP_CHOICES = ["current", "uploaded", "remove"];
// The tables a backup can fill, by the names its window gives them (Change Logs keep only their newest rows anyway)
const BACKUP_TABLE_NAMES = { calendar: "Home's Calendar", future: "Upcoming", history: "History", recurring: "Recurring Entries", accounts: "Other Accounts", tracker: "Tracker", sheets: "Connected Spreadsheets", calculator: "Paycheck Calculator", notes: "Notes" };

// A Download My Data file's text, read and checked: { from: { username, downloaded (a Date, or null) }, days: Map(day's
// time -> { lines, inBank }) from its History and calendar, upcoming (rows), recurring (rows), accounts (like
// accountsData), tracker (rows, aliases as stored), sheets, calculator (rows), notes, logs (rows) }. A part the file
// doesn't have is null. A file that isn't one is refused (a BudgetInputError).
function readBackup(text) {
  let file = null;
  try { file = JSON.parse(text); } catch (e) {}
  const budget = file && typeof file === "object" && !Array.isArray(file) ? file.budget : null;
  if (!budget || typeof budget !== "object" || Array.isArray(budget)) {
    throw new BudgetInputError("That file isn't one Download My Data saved. Pick the .json file it downloaded.");
  }
  const has = (name) => budget[name] !== null && budget[name] !== undefined;
  const downloadedAt = String(file.about ?? "").match(/downloaded (\d{4}-\d{2}-\d{2}T[\d:.]+Z)/);
  const downloaded = downloadedAt ? new Date(downloadedAt[1]) : null;
  const tracker = has("tracker") ? normalizeApiTable(budget.tracker, TABLE_SHAPES.tracker) : null;
  if (tracker) trackerAliasesFromWords(tracker);
  return {
    from: { username: String(file.account?.username ?? "").slice(0, 100), downloaded: downloaded && !isNaN(downloaded.getTime()) ? downloaded : null },
    days: has("history") || has("calendar") ? backupDays(budget, downloaded) : null,
    upcoming: has("upcoming") ? normalizeApiTable(budget.upcoming, TABLE_SHAPES.future).slice(1) : null,
    recurring: has("recurringEntries") ? normalizeApiTable(budget.recurringEntries, TABLE_SHAPES.recurring).slice(2) : null,
    accounts: has("otherAccounts") ? normalizeApiAccounts(budget.otherAccounts) : null,
    tracker: tracker ? tracker.slice(1) : null,
    sheets: has("connectedSpreadsheets") ? normalizeApiSheets(budget.connectedSpreadsheets).list : null,
    calculator: has("paycheckCalculator") ? normalizeApiTable(budget.paycheckCalculator, TABLE_SHAPES.calculator) : null,
    notes: has("notes") ? normalizeApiNotes(budget.notes) : null,
    logs: has("changeLogs") ? normalizeApiTable(budget.changeLogs, TABLE_SHAPES.logs).slice(1) : null
  };
}

// A backup's tracker aliases back the way they're stored: Download My Data writes them in words ("rent (costs), paycheck
// (gains), atm"; see the API's aliasesInWords)
function trackerAliasesFromWords(tracker) {
  for (let i = 1; i < tracker.length; i++) {
    if (String(tracker[i][0]).trim() === "-" || TRACKER_AUTO_ROWS.includes(cleanString(tracker[i][0]))) continue;
    const aliases = String(tracker[i][4] ?? "").split(",").map(word => {
      const counted = word.trim().match(/^(.*\S)\s+\((costs|gains)\)$/);
      return counted ? { title: counted[1], count: counted[2] } : { title: word.trim(), count: "all" };
    });
    tracker[i][4] = normalizeAliases(aliases);
  }
}

// A backup's days, from its History and its calendar: Map(day's time -> { lines (its entries), inBank (or null) })
function backupDays(budget, downloaded) {
  const days = new Map();
  const add = (date, text) => {
    if (isNaN(date.getTime())) return;
    const lines = String(text ?? "").split("\n").slice(1).map(line => line.trim())
      .filter(line => line && getParts(line).length >= 3 && !systemEmojis.includes(getParts(line)[0]));
    days.set(date.getTime(), { lines, inBank: readInBank(text) });
  };
  const history = normalizeApiTable(budget.history, TABLE_SHAPES.history);
  for (let r = 1; r < history.length; r++) {
    for (let c = 0; c < 7; c++) {
      const text = String(history[r][c] ?? "");
      if (text.trim()) add(createSafeMidnight(text.split("\n")[0].trim(), true), text);
    }
  }
  const calendar = normalizeApiGrid(budget.calendar, calendarRows, calendarCols);
  const start = backupGridStart(calendar, createSafeMidnight(budget.lastDailyUpdate || "", true), downloaded);
  if (start) {
    for (let r = 0; r < calendarRows; r++) {
      for (let c = 0; c < calendarCols; c++) if (String(calendar[r][c]).trim()) add(addDays(start, r * 7 + c), calendar[r][c]);
    }
  }
  return days;
}

// The Sunday a backup's calendar starts on: its first day's MM/DD, in the year that lands nearest the week it was last
// brought up to date (or downloaded), like findSavedGridStart. null when it can't say.
function backupGridStart(calendar, lastUpdate, downloaded) {
  const reference = !isNaN(lastUpdate.getTime()) ? lastUpdate : downloaded ? createSafeMidnight(downloaded) : null;
  if (!reference) return null;
  const fallback = addDays(reference, -reference.getDay());
  const match = String(calendar[0][0] ?? "").split("\n")[0].trim().match(/^(\d{1,2})\/(\d{1,2})/);
  if (!match) return fallback;
  let best = null;
  for (let year = fallback.getFullYear() - 1; year <= fallback.getFullYear() + 1; year++) {
    const candidate = new Date(year, Number(match[1]) - 1, Number(match[2]));
    if (candidate.getMonth() !== Number(match[1]) - 1 || candidate.getDay() !== 0) continue;
    if (!best || Math.abs(candidate - fallback) < Math.abs(best - fallback)) best = candidate;
  }
  return best || fallback;
}

// A backup's entry line as this budget would keep it on its day now (see BACKUPS), or null to leave it out: on a day
// that passed, one that had landed by itself is kept as it was (a temp, like ❗️✔️), a % entry as what it came to, and a
// placeholder not at all; from today on, one that had landed by itself is left to land again
function backupLineNow(line, date) {
  const parts = getParts(line);
  if (parts.length < 3 || systemEmojis.includes(parts[0])) return null;
  const landed = !!entryMark(parts[0]) && !isOwnEntryLine(line);
  if (date >= today) return landed ? null : parts.join(" ");
  if (isPlaceholder(parts[0])) return null;
  if (entryMark(parts[0])) parts[0] = getSpecialType(parts[0]) + entryMark(parts[0]);
  else if (percentOf(parts[0]) !== null) parts[0] = percentSprite(parts[0], null);
  return parts.join(" ");
}

// Two lists as one, the way the person picked (see BACKUPS). Each list is [key, item] pairs, in order (a key twice in
// one list: the first counts). same(a, b): two items with one key are alike. { items, clashes (keys in both whose items
// aren't alike) }. choice null only counts.
function mergeKeyed(current, uploaded, choice, same = (a, b) => JSON.stringify(a) === JSON.stringify(b)) {
  const firsts = (list) => {
    const seen = new Set();
    return list.filter(([key]) => !seen.has(key) && seen.add(key));
  };
  const mine = firsts(current);
  const theirs = firsts(uploaded);
  const theirsByKey = new Map(theirs);
  const clashes = mine.filter(([key, item]) => theirsByKey.has(key) && !same(item, theirsByKey.get(key))).length;
  if (choice === "remove") return { items: theirs.map(([, item]) => item), clashes };
  const [first, second] = choice === "uploaded" ? [theirs, mine] : [mine, theirs];
  const taken = new Set(first.map(([key]) => key));
  return { items: [...first, ...second.filter(([key]) => !taken.has(key))].map(([, item]) => item), clashes };
}

// An entry line's key on its day (a day has one entry per title, Other Account, and type)
function dayLineKey(line) {
  const read = readLine(line);
  return `${read.clean}|${getSpecialType(read.sprite)}`;
}

// What each part of the budget would get from a backup: [{ id, name, noun (what it counts), current, uploaded (how many
// each has), clashes, apply(choice) }], only the parts the backup has. Worked out from the budget as it is now, so a
// change runs them (uploadBackup).
function backupPlans(backup) {
  const plans = [];
  const plan = (id, name, noun, current, uploaded, clashes, apply) => plans.push({ id, name, noun, current, uploaded, clashes, apply });
  const keyed = (list, keyOf) => list.map(item => [keyOf(item), item]);
  const rowKey = (row, titleAt, typeAt) => (String(row[0] ?? "").trim() === "-" ? `-|${cleanString(row[1])}` : `${cleanString(row[titleAt])}|${typeAt === null ? "" : getSpecialType(row[typeAt])}`);
  const usedRow = (row) => String(row[0] ?? "").trim() !== "";

  // The days: the backup's (and its Upcoming entries up to the calendar's last day), as this budget keeps them now
  if (backup.days || backup.upcoming) {
    const pool = new Map();
    for (const [time, day] of backup.days || []) {
      const date = new Date(time);
      pool.set(time, { lines: day.lines.map(line => backupLineNow(line, date)).filter(Boolean), inBank: day.inBank });
    }
    for (const row of backup.upcoming || []) {
      const date = createSafeMidnight(row[2], true);
      if (!usedRow(row) || isNaN(date.getTime()) || date > gridEndDate) continue;
      const line = backupLineNow(`${String(row[3]).trim()} ${formatMoney(parseAmount(row[1]))} ${String(row[0]).trim()}`, date);
      if (!line) continue;
      if (!pool.has(date.getTime())) pool.set(date.getTime(), { lines: [], inBank: null });
      pool.get(date.getTime()).lines.push(line);
    }
    historyPlan(plan, pool);
    calendarPlan(plan, pool);
  }

  if (backup.upcoming) {
    const upcomingKey = (row) => `${createSafeMidnight(row[2], true).getTime()}|${cleanString(row[0])}|${getSpecialType(row[3])}`;
    const mine = futureData.slice(1).filter(usedRow);
    const theirs = backup.upcoming.filter(row => usedRow(row) && createSafeMidnight(row[2], true) > gridEndDate);
    const count = (choice) => mergeKeyed(keyed(mine, upcomingKey), keyed(theirs, upcomingKey), choice);
    plan("upcoming", "Upcoming", "entries", mine.length, theirs.length, count(null).clashes, (choice) => {
      const rows = count(choice).items.sort((a, b) => createSafeMidnight(a[2], true) - createSafeMidnight(b[2], true));
      futureData = [futureData[0], ...rows];
    });
  }

  if (backup.recurring) {
    const mine = recurringData.slice(2).filter(usedRow);
    const theirs = backup.recurring.filter(usedRow);
    const count = (choice) => mergeKeyed(keyed(mine, row => rowKey(row, 0, 5)), keyed(theirs, row => rowKey(row, 0, 5)), choice);
    plan("recurring", "Recurring Entries", "recurring entries", mine.filter(row => row[0] !== "-").length, theirs.filter(row => row[0] !== "-").length, count(null).clashes, (choice) => {
      recurringData = [recurringData[0], recurringData[1], ...count(choice).items];
    });
  }

  if (backup.accounts) {
    // (Savings and Cash go by what they are, whatever they're named)
    const accountKey = (row) => (isMandatoryAccount(row) ? `mark|${String(row[2]).trim()}` : `name|${cleanString(row[0])}`);
    const mine = accountsData.list.slice(1).filter(usedRow);
    const theirs = backup.accounts.list.slice(1).filter(usedRow);
    const count = (choice) => mergeKeyed(keyed(mine, accountKey), keyed(theirs, accountKey), choice, (a, b) => JSON.stringify(a.slice(2)) === JSON.stringify(b.slice(2)) && cleanString(a[0]) === cleanString(b[0]));
    plan("accounts", "Other Accounts", "accounts", mine.length, theirs.length, count(null).clashes, (choice) => {
      const names = new Set();
      const rows = count(choice).items.filter(row => !names.has(cleanString(row[0])) && names.add(cleanString(row[0])));
      accountsData.list = [accountsData.list[0], ...rows];
      // (Every budget still has its Savings and Cash)
      accountsData.list = normalizeApiAccounts({ version: ACCOUNTS_VERSION, list: accountsData.list }).list;
    });

    const goalKey = (goal) => `${cleanString(goal.title)}|${goal.kind}|${cleanString(goal.account)}`;
    const mineGoals = accountsData.goals || [];
    const theirGoals = backup.accounts.goals || [];
    if (theirGoals.length > 0) {
      const countGoals = (choice) => mergeKeyed(keyed(mineGoals, goalKey), keyed(theirGoals, goalKey), choice);
      plan("goals", "Goals", "goals", mineGoals.length, theirGoals.length, countGoals(null).clashes, (choice) => {
        const goals = countGoals(choice).items.slice(0, MAX_GOALS);
        if (goals.length > 0) accountsData.goals = goals;
        else delete accountsData.goals;
      });
    }

    const theirBob = backup.accounts.bob;
    if (theirBob) {
      const mineBob = accountsData.bob || { cards: [], purposes: {} };
      const mine = Object.entries(mineBob.purposes);
      const theirs = Object.entries(theirBob.purposes);
      const countPurposes = (choice) => mergeKeyed(keyed(mine, ([key]) => key), keyed(theirs, ([key]) => key), choice);
      // (Which of his cards are on, and the wavelengths, go with the side that wins; a title on a wavelength that side
      // doesn't have has none)
      plan("bob", "Bob's Page", "titles on a wavelength", mine.length, theirs.length, countPurposes(null).clashes, (choice) => {
        const winner = choice === "current" && accountsData.bob ? mineBob : theirBob;
        const known = new Set((winner.wavelengths || DEFAULT_WAVELENGTHS).map(wave => wave.id));
        const purposes = {};
        for (const [key, purpose] of countPurposes(choice).items.slice(0, MAX_PURPOSES)) if (known.has(purpose)) purposes[key] = purpose;
        accountsData.bob = { cards: [...winner.cards], purposes, ...(winner.wavelengths ? { wavelengths: winner.wavelengths.map(wave => ({ ...wave })) } : {}) };
      });
    }
  }

  if (backup.tracker) {
    const mine = trackerData.slice(1).filter(usedRow);
    const theirs = backup.tracker.filter(usedRow);
    const count = (choice) => mergeKeyed(keyed(mine, row => rowKey(row, 0, null)), keyed(theirs, row => rowKey(row, 0, null)), choice);
    plan("tracker", "Tracker", "rows", mine.filter(row => row[0] !== "-").length, theirs.filter(row => row[0] !== "-").length, count(null).clashes, (choice) => {
      trackerData = [trackerData[0], ...count(choice).items];
    });
  }

  if (backup.sheets && backup.sheets.length > 0) {
    const mine = sheetsData.list;
    const count = (choice) => mergeKeyed(keyed(mine, sheet => sheet.id), keyed(backup.sheets, sheet => sheet.id), choice);
    plan("sheets", "Connected Spreadsheets", "spreadsheets", mine.length, backup.sheets.length, count(null).clashes, (choice) => {
      sheetsData.list = count(choice).items.slice(0, MAX_SHEETS);
    });
  }

  if (backup.calculator && backup.calculator.some(row => row.some(cell => String(cell).trim()))) {
    const filled = calculatorData.some(row => row.some(cell => String(cell).trim()));
    const clash = filled && JSON.stringify(calculatorData) !== JSON.stringify(backup.calculator) ? 1 : 0;
    plan("calculator", "Paycheck Calculator", "paycheck calculator", filled ? 1 : 0, 1, clash, (choice) => {
      if (choice !== "current" || !filled) calculatorData = JSON.parse(JSON.stringify(backup.calculator));
    });
  }

  if (backup.notes && (Object.keys(backup.notes.entries).length > 0 || Object.keys(backup.notes.recurring).length > 0)) {
    const parts = ["entries", "recurring"];
    const list = (notes) => parts.flatMap(part => Object.entries(notes[part]).map(([key, text]) => [`${part}|${key}`, [part, key, text]]));
    const count = (choice) => mergeKeyed(list(notesData), list(backup.notes), choice, (a, b) => a[2] === b[2]);
    const total = (notes) => parts.reduce((sum, part) => sum + Object.keys(notes[part]).length, 0);
    plan("notes", "Notes", "notes", total(notesData), total(backup.notes), count(null).clashes, (choice) => {
      const notes = emptyNotes();
      for (const [part, key, text] of count(choice).items) notes[part][key] = text;
      notesData = notes;
      if (!notesFit()) throw new BudgetInputError(NOTES_FULL);
    });
  }

  if (backup.logs && backup.logs.some(usedRow)) {
    const mine = logsData.slice(1).filter(usedRow);
    const theirs = backup.logs.filter(usedRow);
    const count = (choice) => mergeKeyed(keyed(mine, row => JSON.stringify(row)), keyed(theirs, row => JSON.stringify(row)), choice);
    // (Two rows alike are one row, so they never clash; kept together, the budget's newer rows stay on top)
    plan("logs", "Change Logs", "rows", mine.length, theirs.length, 0, (choice) => {
      logsData = [logsData[0], ...count(choice === "remove" ? "remove" : "current").items.slice(0, MAX_LOG_ROWS)];
    });
  }
  return plans;
}

// History's part of a backup (see backupPlans): its days before the calendar's first, each with its entries and its In
// Bank, rebuilt as whole weeks (Sunday through Saturday, newest first) from the first day either side has, or for
// "remove", the backup's first
function historyPlan(plan, pool) {
  const mine = new Map();
  for (let r = 1; r < historyData.length; r++) {
    for (let c = 0; c < 7; c++) {
      const text = String(historyData[r][c] ?? "");
      const date = createSafeMidnight(text.split("\n")[0].trim(), true);
      if (isNaN(date.getTime())) continue;
      const lines = text.split("\n").slice(1).map(line => line.trim()).filter(line => line && !systemEmojis.includes(getParts(line)[0]));
      mine.set(date.getTime(), { lines, inBank: readInBank(text) });
    }
  }
  const theirs = new Map([...pool].filter(([time]) => time < gridStartDate.getTime()));
  if (theirs.size === 0) return;
  const entries = (days) => [...days.values()].reduce((sum, day) => sum + day.lines.length, 0);
  const daysMerged = (choice) => {
    let clashes = 0;
    const merged = new Map();
    for (const time of new Set([...(choice === "remove" ? [] : mine.keys()), ...theirs.keys()])) {
      const a = choice === "remove" ? null : mine.get(time);
      const b = theirs.get(time);
      const lines = mergeKeyed(keyed(a?.lines), keyed(b?.lines), choice);
      clashes += lines.clashes;
      const inBank = choice === "current" ? (a?.inBank ?? b?.inBank ?? null) : (b?.inBank ?? a?.inBank ?? null);
      merged.set(time, { lines: lines.items, inBank });
    }
    return { merged, clashes };
  };
  const keyed = (lines) => (lines || []).map(line => [dayLineKey(line), line]);
  const countClashes = () => {
    let clashes = 0;
    for (const [time, day] of theirs) if (mine.has(time)) clashes += mergeKeyed(keyed(mine.get(time).lines), keyed(day.lines), null).clashes;
    return clashes;
  };
  plan("history", "History", "entries", entries(mine), entries(theirs), countClashes(), (choice) => {
    const { merged } = daysMerged(choice);
    const times = [...merged.keys()];
    if (times.length === 0) {
      historyData = [historyData[0]];
      return;
    }
    const firstDay = new Date(Math.min(...times));
    const start = addDays(firstDay, -firstDay.getDay());
    const known = [...merged.entries()].sort((a, b) => a[0] - b[0]).find(([, day]) => day.inBank !== null);
    let inBank = known ? known[1].inBank : 0;
    const cells = [];
    for (let day = start; day < gridStartDate; day = addDays(day, 1)) {
      const found = merged.get(day.getTime());
      if (found && found.inBank !== null) inBank = found.inBank;
      cells.push([formatToMMDDYYYY(day), `${inBank < 0 ? "⛔️" : "✅"} ${formatMoney(inBank)} In Bank`, ...(found ? found.lines : [])].join("\n"));
    }
    const weeks = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    historyData = [historyData[0], ...weeks.reverse()];
    historyEdited = true;
  });
}

// The calendar's part of a backup (see backupPlans): its days on the calendar now, with each one's own entries (the rest
// land again, and the budget works out In Bank again)
function calendarPlan(plan, pool) {
  const mine = new Map();
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 7; c++) mine.set(gridDates[r][c].getTime(), ownEntryLines(calendarData[r][c]));
  }
  const theirs = new Map([...pool].filter(([time]) => mine.has(time)).map(([time, day]) => [time, day.lines]));
  if (![...theirs.values()].some(lines => lines.length > 0)) return;
  const keyed = (lines) => (lines || []).map(line => [dayLineKey(line), line]);
  const count = [...mine].reduce((sum, [time, lines]) => sum + mergeKeyed(keyed(lines), keyed(theirs.get(time)), null).clashes, 0);
  const lines = (days) => [...days.values()].reduce((sum, list) => sum + list.length, 0);
  plan("calendar", "Home's Calendar", "entries", lines(mine), lines(theirs), count, (choice) => {
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 7; c++) {
        const time = gridDates[r][c].getTime();
        const merged = mergeKeyed(keyed(mine.get(time)), keyed(theirs.get(time)), choice).items;
        calendarData[r][c] = [formatToMMDD(gridDates[r][c]), ...merged].join("\n");
      }
    }
  });
}

// Upload A Backup: every part the backup has, the way the person picked for each (choices: { part id: "current" |
// "uploaded" | "remove" }; one left out stays as it is). One change: logged, and saved, but it can't be undone (Download
// My Data first keeps a copy). A part too big to save is refused, and nothing changes.
function uploadBackup(backup, choices) {
  return runBudgetAction("📥 Upload Backup", () => {
    const picked = { current: [], uploaded: [], remove: [] };
    for (const part of backupPlans(backup)) {
      const choice = choices[part.id];
      if (!BACKUP_CHOICES.includes(choice)) continue;
      part.apply(choice);
      picked[choice].push(part.name);
    }
    for (const [name, words] of Object.entries(BACKUP_TABLE_NAMES)) {
      if (new TextEncoder().encode(JSON.stringify(BUDGET_TABLES[name].get())).length > MAX_TABLE_BYTES) {
        throw new BudgetInputError(`That would make your ${words} too big to save. For it, pick Remove Current Data (the backup's alone) instead.`);
      }
    }
    const from = backup.from;
    formEntryRow[3] = `From: ${[from.username, from.downloaded ? showDate(createSafeMidnight(from.downloaded)) : ""].filter(Boolean).join(", ") || "A Backup"}`;
    formEntryRow[4] = picked.current.length > 0 ? `Kept Yours: ${picked.current.join(", ")}` : "";
    formEntryRow[5] = picked.uploaded.length > 0 ? `Took The Backup's: ${picked.uploaded.join(", ")}` : "";
    formEntryRow[6] = picked.remove.length > 0 ? `Replaced: ${picked.remove.join(", ")}` : "";
    return {};
  });
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
//   - The next 28 days after the calendar, Lowest, Search, reminders, and Bob count them too
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
      .map(entry => [text(entry[0], 10), sheetEntryType(text(entry[1], 20)), Math.round((Number(entry[2]) || 0) * 100) / 100, text(entry[3], MAX_ENTRY_TITLE)])
      .filter(entry => Math.abs(entry[2]) <= MAX_AMOUNT), // Spreadsheets.js never reads a bigger one
    problems: (Array.isArray(item.problems) ? item.problems : []).map(problem => text(problem, 500)).slice(0, 50),
    tabs: (Array.isArray(item.tabs) ? item.tabs : []).map(tab => text(tab, 100)).slice(0, 200),
    access: item.access === "shared" ? "shared" : "public",
    ...(item.placeholder === true ? { placeholder: true } : {}) // Its entries are placeholders
  };
}

// A spreadsheet entry's type as it's kept: its refraction type, and a % entry's percent (see PERCENT_MARK)
function sheetEntryType(sprite) {
  const percent = percentOf(sprite);
  return decoratedSprite(getSpecialType(sprite), { percent: percent !== null && Math.abs(percent) <= MAX_PERCENT ? percent : null });
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
    for (const { date, time, title, clean, special, sprite, amount, percent } of parsedSheetEntries(connection)) {
      if (time < fromTime || time > toTime) continue;
      if (!includeOff && recurringHits(title, date, special) !== false) continue;
      if (!days.has(time)) days.set(time, new Map());
      const day = days.get(time);
      const key = clean + "|" + special;
      const same = day.get(key);
      if (same) {
        // (Two become one: a plain amount, what they come to that day)
        same.amount = Math.round((landingAmount(same, date) + landingAmount({ amount, percent, sprite, title }, date)) * 100) / 100;
        same.percent = null;
        same.placeholder = same.placeholder && placeholder;
      } else {
        day.set(key, { title, clean, special, sprite, amount, percent, placeholder });
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
    if (!isNaN(date.getTime()) && clean) parsed.push({ date, time: date.getTime(), title, clean, special: getSpecialType(sprite), sprite, amount, percent: percentOf(sprite) });
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
    if (entry.clean === clean && (!special || entry.special === special)) return { amount: landingAmount(entry, date), sprite: sheetSprite(entry), mark: SHEET_MARK };
  }
  return null;
}

// A spreadsheet's entry as it lands: ➕ and its type ("➕❗️"), with its % and placeholder mark
function sheetSprite(entry) {
  return decoratedSprite(SHEET_MARK + entry.special, { placeholder: entry.placeholder, percent: entry.percent });
}

// What lands on date by itself with this title (and type): a recurring entry first, then a spreadsheet's.
// mark limits it to one or the other. { amount, sprite, mark } or null.
function scheduledHit(title, date, special = null, mark = null) {
  if (mark !== SHEET_MARK) {
    const index = recurringHits(title, date, special);
    if (index !== false) {
      const row = recurringData[index];
      const sprite = String(row[5] || RECURRING_MARK);
      return { amount: landingAmount({ amount: parseAmount(String(row[1])), percent: percentOf(sprite), sprite, title: String(row[0]).trim() }, date), sprite, mark: RECURRING_MARK };
    }
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
      if (day) calendarData[r][c] = writeSheetsToCell(calendarData[r][c], day, gridDates[r][c]);
    }
  }
}

// One day's spreadsheet entries (a Map from sheetEntriesByDay, for date) written into its cell: a temp with its title
// and type (or a recurring entry's) keeps one off, and a unique entry takes in its amount (it's a placeholder then only
// if both are, and a plain amount)
function writeSheetsToCell(cellText, day, date) {
  if (!day || day.size === 0) return cellText;
  const lines = String(cellText).split("\n");
  for (const entry of day.values()) {
    const amount = landingAmount(entry, date);
    const at = lines.findIndex((line, l) => {
      if (l === 0) return false;
      const read = readLine(line);
      return !read.system && read.clean === entry.clean && getSpecialType(read.sprite) === entry.special;
    });
    if (at === -1) {
      lines.push(`${sheetSprite(entry)} ${formatMoney(amount)} ${entry.title}`);
      continue;
    }
    const line = readLine(lines[at]);
    if (entryMark(line.sprite)) continue;
    lines[at] = `${placeholderSprite(entry.special + SHEET_MARK, entry.placeholder && isPlaceholder(line.sprite))} ${formatMoney(line.amount + amount)} ${line.title}`;
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
  // (A placeholder stays one, and a % entry stays one)
  const isReleased = (sprite, title) => {
    const special = getSpecialType(sprite);
    return baseSprite(String(sprite).trim()) === special + SHEET_MARK && !known.has(cleanString(title) + "|" + special);
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
        else lines[l] = [rebasedSprite(parts[0], getSpecialType(parts[0])), ...parts.slice(1)].join(" ");
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
    else row[3] = rebasedSprite(String(row[3]), getSpecialType(String(row[3])));
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

// The spreadsheets' costs that are "uncommon" for Bob's Big Bills card, like a recurring entry that lands every
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
// Savings and Cash (MANDATORY_ACCOUNTS) and the tracker rows that fill in by themselves (Costs, Gains, Transfers,
// Undefined) can't be deleted; a deleted account's entries stay as they are.
function deleteTableRows(tableName, indexes) {
  let table = ROW_TABLES[tableName];
  let rows = table.get();
  let valid = [...new Set(indexes)]
    .filter(i => Number.isInteger(i) && i >= table.headerRows && i < rows.length)
    .sort((a, b) => b - a);
  if (valid.length === 0) throw new BudgetInputError("Nothing is selected to delete.");
  let locked = tableName === "accounts" ? valid.find(i => isMandatoryAccount(rows[i])) : undefined;
  if (locked !== undefined) throw new BudgetInputError(mandatoryAccountNote(rows[locked][0]));
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
        addIfFound(new Date(day), landingAmount({ amount: row.amt, percent: row.percent, sprite: row.sprite, title: row.title }, day), String(row.sprite || ""), row.title);
      }
      for (let entry of sheetDays.get(day.getTime())?.values() || []) {
        if (blockers.has(day.getTime() + "|" + entry.clean + "|" + entry.special)) continue;
        addIfFound(new Date(day), landingAmount(entry, day), decoratedSprite(SHEET_MARK + entry.special, { percent: entry.percent }), entry.title);
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
  combineSameUpcoming(); // (One entry per title and type on a day, like the calendar's days)

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
    const sprite = row[5];
    const landing = { amount: parseAmount(String(row[1])), percent: percentOf(sprite), sprite, title };
    const cleanTitle = cleanString(title);
    const special = getSpecialType(String(sprite || ""));
    const parsed = parseRecurringRow(row);
    calendarChecks:
    for (let r = 3; r >= 0; r--) {
      for (let c = 6; c >= 0; c--) {
        const cellDate = gridDates[r][c];
        if (cellDate.getTime() < todayTime) break calendarChecks;
        if (!recurringRowHits(parsed, cellDate)) continue;

        const amt = landingAmount(landing, cellDate);
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
          // A unique entry takes in its amount (a placeholder only if both are, and a plain amount)
          hasUnique = true;
          cellLines[l] = `${placeholderSprite(baseSprite(line.sprite) + "✔️", isPlaceholder(line.sprite) && isPlaceholder(sprite))} ${formatMoney(amt + line.amount)} ${title}`;
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
        if (baseSprite(parts[0]) !== special + "✔️") continue; // Only temps (a placeholder or % entry stays one)
        let from = releaseFrom(extractTitle(lines[l]), special);
        if (from === null || gridDates[r][c].getTime() < from) continue;
        if (parseAmount(parts[1]) === 0) {
          lines.splice(l, 1);
        } else {
          parts[0] = rebasedSprite(parts[0], special);
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
    if (baseSprite(sprite) !== special + "✔️") continue;
    let from = releaseFrom(cleanString(row[0]), special);
    let date = createSafeMidnight(row[2], true);
    if (from === null || isNaN(date.getTime()) || date.getTime() < from) continue;
    if (parseAmount(row[1]) === 0) futureData.splice(f, 1);
    else row[3] = rebasedSprite(sprite, special);
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
        // (Sorted with its kind, a placeholder or % entry or not)
        let kindLine = plainLine(currentLine);
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
      if (!overridden(row.parsed.cleanTitle, row.parsed.special)) dayTotal += landingAmount({ amount: row.amt, percent: row.percent, sprite: row.sprite, title: row.title }, testDay);
    }
    for (let entry of sheetDays.get(currentTestTime)?.values() || []) {
      if (entry.special !== "✖️" && !overridden(entry.clean, entry.special)) dayTotal += landingAmount(entry, testDay);
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

// Bob's message on Home, worked out with every change (so it's quick, in plain words): a greeting, what needs
// attention (days below $0 on the calendar, going below $0 in the 28 days after it, uncommon recurring entries on it, and
// Upcoming entries), and today's affirmation. Everything else he has to say waits for his page (Bob Page.js).
function commenceBob() {
  let message = "Oops, looks like I couldn't read the budget! Sorry about that...";
  try {
    let janFirst = createSafeMidnight(new Date(today.getFullYear(), 0, 1));
    let todaysDay = getDayDifference(today, janFirst);
    // (A $0.00 temp only keeps a recurring entry off its day, so it isn't a payment; a $0.00 note, like "Add To
    // Savings", still counts)
    let futureDatesAmount = futureData.slice(1).filter(row => String(row[0]).trim() !== "" && !(parseAmount(row[1]) === 0 && entryMark(row[3]))).length;
    let written = greetingPresets[todaysDay % greetingPresets.length];
    written += nicknamePresets[todaysDay % nicknamePresets.length];
    // A budget with no recurring entries yet is brand new
    let hasRecurring = recurringData.slice(2).some(row => String(row[0]).trim() !== "" && String(row[0]).trim() !== "-");
    if (!hasRecurring) written = "Woah! Nice new budget, don't forget to add your recurring entries! ";
    let discrepancies = 0;
    let writtenDisc = 0;
    if (nextFourNegative) discrepancies++;
    if (visibleUncommons) discrepancies++;
    if (futureDatesAmount) discrepancies++;
    if (visibleNegatives) discrepancies++;
    if (discrepancies === 0) {
      written += allClearPresets[todaysDay % allClearPresets.length];
    } else if (discrepancies === 2) {
      written += "I've found a couple things to keep in mind: ";
    } else if (discrepancies === 3) {
      written += "I've found a few things to keep in mind: ";
    } else if (discrepancies > 3) {
      written += "I've found these things to keep in mind: ";
    }
    if (nextFourNegative) { // Next four negative
      writtenDisc++;
      if (discrepancies === 1) {
        written += "All I see right now is that you'll be going negative sometime after the current four weeks. ";
      } else {
        written += "It looks like you'll be going negative sometime after the current four weeks";
        if (writtenDisc === discrepancies) written += ". ";
      }
    }
    if (visibleUncommons > 0) { // Visible yearlies
      if (writtenDisc > 0) {
        written += ", ";
        if (writtenDisc === discrepancies - 1) written += "and ";
      }
      let firstLetter = writtenDisc > 0 ? "y" : "Y";
      writtenDisc++;
      let plurality = (visibleUncommons > 1) ? "s" : "";
      if (discrepancies === 1) {
        written += "All I see right now is that you've got " + visibleUncommons + " uncommon recurring payment" + plurality + " in the current four weeks. ";
      } else {
        written += firstLetter + "ou've got " + visibleUncommons + " uncommon recurring payment" + plurality + " in the current four weeks";
        if (writtenDisc === discrepancies) written += ". ";
      }
    }
    if (futureDatesAmount > 0) { // Future dates
      if (writtenDisc > 0) {
        written += ", ";
        if (writtenDisc === discrepancies - 1) written += "and ";
      }
      let firstLetter = writtenDisc > 0 ? "t" : "T";
      writtenDisc++;
      let plurality = (futureDatesAmount > 1) ? "s" : "";
      let isAre = (futureDatesAmount > 1) ? "are" : "is";
      if (discrepancies === 1) {
        written += "All I see right now is that there " + isAre + " " + futureDatesAmount + " upcoming payment" + plurality + " sometime after the current four weeks. ";
      } else {
        written += firstLetter + "here " + isAre + " " + futureDatesAmount + " upcoming payment" + plurality + " sometime after the current four weeks";
        if (writtenDisc === discrepancies) written += ". ";
      }
    }
    if (visibleNegatives > 0) { // Visible negatives
      if (writtenDisc > 0) {
        written += ", ";
        if (writtenDisc === discrepancies - 1) written += "and ";
      }
      let firstLetter = writtenDisc > 0 ? "y" : "Y";
      let plurality = (visibleNegatives > 1) ? "s" : "";
      if (discrepancies === 1) {
        written += "All I see right now is that you have " + visibleNegatives + " day" + plurality + " negative on the budget. ";
      } else {
        written += firstLetter + "ou have " + visibleNegatives + " day" + plurality + " negative on the budget. ";
      }
    }
    written += farewellPresets[todaysDay % farewellPresets.length];
    written += affirmationPresets[affirmationIndex(today)];
    message = written;
  } catch (error) {
    console.error("Bob's message couldn't be worked out:", error);
    hadError = true;
  }
  bobMessage = message;
}

// Which affirmation a day gets: the same one on the same date every year, the leap year one on February 29, and
// "Next year will be even better." on December 31 (the list has one for each day of a common year, then the leap one)
function affirmationIndex(date) {
  const day = getDayDifference(date, new Date(date.getFullYear(), 0, 1));
  const isLeapYear = new Date(date.getFullYear(), 1, 29).getMonth() === 1;
  if (!isLeapYear || day < 59) return day;
  return day === 59 ? 365 : day - 1;
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
  return scheduled ? writeSheetsToCell(writeRecurringToCell(text, day, recurringRows), sheetDays.get(day.getTime()), day) : text;
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

// Rebuild the Other Accounts store: { version: 3, list, equity, coming, inBank, goals, bob }
//   list: [0] column titles, then [name, balance today, "default" | "cash" | "", starting amount, interest rate, interest
//         since, max] (see Other Accounts in BUDGET LOGIC). Savings and Cash (MANDATORY_ACCOUNTS) are added if they're
//         missing. Balances come only from entries, so a version 2 store's typed-in balance in [1] isn't kept.
//   equity: the spreadsheet's business-version (LLC) equity tables, { tabName: table }, kept as stored
//           (the website doesn't change them). A store without a version is only these tables.
//   coming: each account's changes after today, for the Quick Entry page (accountChangesAhead fills it in again;
//           it's kept as stored until then, so loading the budget alone doesn't count as a change)
//   inBank: In Bank from today on, for the Quick Entry page (inBankAhead; kept as stored until then too)
//   goals: Bob's Goals card (see Goals in BUDGET LOGIC), and bob: his page's settings (see normalizeBob)
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
  list[0] = ["Account", "Balance", "Default", "Starting", "Interest", "Interest Since", "Max", "Compounds", "Added Every", "Added On"];
  // Each mandatory account: the one marked as it, or one with its name that isn't marked, or a new one after the one
  // before it (a budget whose Savings was renamed to Cash keeps that one, and gets no second Cash)
  let after = 0;
  for (const [name, kind] of MANDATORY_ACCOUNTS) {
    const mark = (row) => String(row[2] ?? "").trim();
    let at = list.findIndex((row, i) => i > 0 && mark(row) === kind);
    if (at === -1) at = list.findIndex((row, i) => i > 0 && !mark(row) && cleanString(row[0]) === cleanString(name));
    if (at !== -1) list[at][2] = kind;
    else if (!list.some((row, i) => i > 0 && cleanString(row[0]) === cleanString(name))) {
      at = after + 1;
      list.splice(at, 0, [name, formatMoney(0), kind, ...new Array(TABLE_SHAPES.accounts.cols - 3).fill("")]);
    }
    if (at !== -1) after = at;
  }
  const accounts = { version: ACCOUNTS_VERSION, list, equity };
  const isChange = (item) => Array.isArray(item) && item.length === 3 && typeof item[0] === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(item[1]) && Number.isFinite(item[2]);
  if (isCurrent && Array.isArray(parsed.coming)) accounts.coming = parsed.coming.filter(isChange);
  const isDay = (item) => Array.isArray(item) && item.length === 2 && /^\d{4}-\d{2}-\d{2}$/.test(item[0]) && Number.isFinite(item[1]);
  if (isCurrent && Array.isArray(parsed.inBank)) accounts.inBank = parsed.inBank.filter(isDay);
  const goals = isCurrent ? normalizeGoals(parsed.goals) : [];
  if (goals.length > 0) accounts.goals = goals; // (Goals, see goalEntry)
  const bob = isCurrent ? normalizeBob(parsed.bob, goals.length > 0) : null;
  if (bob) accounts.bob = bob; // (Bob's page, see normalizeBob)
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

// A sprite as a placeholder (placeholder true) or not (a % stays)
function placeholderSprite(sprite, placeholder) {
  return decoratedSprite(baseSprite(sprite), { placeholder, percent: percentOf(sprite) });
}

// A % entry's amount is that percent of its Other Account's balance on its day (before that day's entries), so only an
// entry with an Other Account can be one. It's worked out again with every change from today on (resolvePercentEntries),
// and once its day passes it stays what it came to (the daily update makes it a plain amount). It's kept as ％ and the
// percent, signed like the amount (a cost's is below 0), after the entry's type and mark and before a placeholder's ⏳
// ("⭕️％-3", "✔️⭕️％-3", "⭕️✔️％-3⏳"), which nothing reading those notices; the amount after it is what it comes to.
// When two entries become one (the same title and type on a day), the one entry is a plain amount: what the two came
// to together.
const PERCENT_MARK = "％";
const MAX_PERCENT = 1000;
const PERCENT_PART = /％(-?\d+(?:\.\d+)?)/;

// The percent a sprite keeps (signed), or null for an entry with a plain amount
function percentOf(sprite) {
  const found = PERCENT_PART.exec(String(sprite ?? ""));
  return found ? Number(found[1]) : null;
}

// A sprite with just its type and mark: no % and no placeholder (to compare kinds of entries)
function baseSprite(sprite) {
  return withoutPlaceholder(sprite).replace(new RegExp(PERCENT_PART.source, "g"), "");
}

// A sprite with its % (a number, or null for none) and its placeholder mark, in their places
function decoratedSprite(base, { placeholder = false, percent = null } = {}) {
  const hasPercent = typeof percent === "number" && Number.isFinite(percent) && percent !== 0;
  return baseSprite(base) + (hasPercent ? PERCENT_MARK + Math.round(percent * 100) / 100 : "") + (placeholder ? PLACEHOLDER_MARK : "");
}

// A sprite with a % (or null for a plain amount); its placeholder mark stays
function percentSprite(sprite, percent) {
  return decoratedSprite(baseSprite(sprite), { placeholder: isPlaceholder(sprite), percent });
}

// A sprite with a new type and mark (base), keeping its % and placeholder mark
function rebasedSprite(sprite, base) {
  return decoratedSprite(base, { placeholder: isPlaceholder(sprite), percent: percentOf(sprite) });
}

// percent of base, to the cent: a % entry's amount (base is an account's balance; a cost's percent is below 0)
function percentValue(percent, base) {
  return Math.round(percent * Math.abs(base)) / 100;
}

const PERCENT_NEEDS_ACCOUNT = "A % amount is a percent of an Other Account's balance, so it needs Hidden or Transfer with an account picked under Other Account.";
const PERCENT_PAST_DAY = "A % amount is worked out from today on, so it can't go on a day that already passed. Enter the amount instead.";

// A percent as typed for an entry (signed like its amount): the number, checked, or null for none
function readPercent(value) {
  if (value === undefined || value === null || value === "") return null;
  const percent = Math.round(Number(value) * 100) / 100;
  if (!Number.isFinite(percent) || percent === 0) throw new BudgetInputError("Enter the percent, like 3 or 12.5.");
  if (Math.abs(percent) > MAX_PERCENT) throw new BudgetInputError(`A percent can be up to ${MAX_PERCENT}%.`);
  return percent;
}

// Each Other Account's balance at the start of every day from today on, from the last time the budget was worked out
// (resolvePercentEntries): { byDay: Map(day's time -> Map(account row index -> balance)), until (the last day), last
// (Map: each balance after it) }. null while there are no % entries.
let percentBases = null;

// A % entry's amount on date: percent of its Other Account's balance at the start of that day, or null when it isn't
// for an account (sprite and title: the entry's)
function percentAmount(percent, date, sprite, title) {
  const account = linkedAccount(sprite, title);
  if (!account) return null;
  const day = percentBases?.byDay.get(date.getTime());
  let base = day?.get(account.index);
  if (base === undefined) base = percentBases && date > percentBases.until ? percentBases.last.get(account.index) : undefined;
  if (base === undefined) base = parseAmount(account.row[1]); // (Today's, before any % entries were worked out)
  return percentValue(percent, base);
}

// What an entry that lands by itself (a recurring row or a spreadsheet's entry: { amount, percent, sprite, title })
// comes to on date
function landingAmount(entry, date) {
  return entry.percent === null || entry.percent === undefined ? entry.amount : percentAmount(entry.percent, date, entry.sprite, entry.title) ?? entry.amount;
}

// Walks days in order, from firstDay, with each Other Account's balance (balances: Map(account row index -> its balance
// at the start of firstDay)): each day's % entries are worked out from the balances that morning, then the day's
// entries (and interest) go into them. day(text, date) returns the day's text with its % entries' amounts. summaries:
// accountSummaries(), for the entries before firstDay.
function percentRunner(balances, firstDay, summaries = accountSummaries()) {
  const accounts = accountTitleMap();
  // Each account's interest (the way interestCredits works it out), caught up through the day before firstDay
  const interest = new Map();
  for (const summary of summaries) {
    if (summary.interest && balances.has(summary.index)) {
      interest.set(summary.index, runInterest(summary.start, summary.entries.filter(entry => entry.date < firstDay), summary.interest, addDays(firstDay, -1)).stepper);
    }
  }
  const round = (amount) => Math.round(amount * 100) / 100;
  return {
    balances,
    day(text, date) {
      const morning = new Map(balances);
      for (const [index, stepper] of interest) balances.set(index, round(balances.get(index) + stepper.step(date, balances.get(index))));
      const lines = String(text ?? "").split("\n");
      let changed = false;
      for (let l = 1; l < lines.length; l++) {
        const line = readLine(lines[l]);
        if (!line.title || line.system) continue;
        const percent = percentOf(line.sprite);
        const account = linkedAccount(line.sprite, line.title, accounts);
        if (!account) {
          // (A % entry that isn't for an account anymore keeps what it came to last)
          if (percent !== null) {
            lines[l] = `${percentSprite(line.sprite, null)} ${formatMoney(line.amount)} ${line.title}`;
            changed = true;
          }
          continue;
        }
        let amount = line.amount;
        if (percent !== null) {
          amount = percentValue(percent, morning.get(account.index) ?? 0);
          if (amount !== line.amount) {
            lines[l] = `${line.sprite} ${formatMoney(amount)} ${line.title}`;
            changed = true;
          }
        }
        balances.set(account.index, round((balances.get(account.index) ?? 0) + accountChange(line.sprite, amount)));
      }
      return { text: changed ? lines.join("\n") : text, morning };
    }
  };
}

// Is there a % entry anywhere from today on (or one that lands by itself)?
function hasPercentEntries() {
  const marked = (text) => String(text ?? "").includes(PERCENT_MARK);
  return calendarData.some(row => row.some(marked)) || futureData.some(row => marked(row[3])) ||
    recurringData.some(row => marked(row?.[5])) || (sheetsData?.list || []).some(connection => connection.entries.some(entry => marked(entry[1])));
}

// Every % entry from today on comes to its percent of its Other Account's balance at the start of its day: the calendar's
// (in their cells), and Upcoming's (their stored amounts), through AHEAD_MONTHS from today (and the last Upcoming one).
// The balances each day starts with are kept (percentBases) for what lands by itself (recurring and spreadsheets'
// entries, see landingAmount) and the days after the calendar.
function resolvePercentEntries() {
  if (!hasPercentEntries()) {
    percentBases = null;
    return;
  }
  const start = new Map();
  for (const summary of accountSummaries()) {
    const before = [...summary.entries, ...summary.interestCredits].filter(item => item.date < today);
    start.set(summary.index, Math.round((summary.start + before.reduce((total, item) => total + item.change, 0)) * 100) / 100);
  }
  const runner = percentRunner(start, today);
  const byDay = new Map();
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 7; c++) {
      if (gridDates[r][c] < today) continue;
      const day = runner.day(calendarData[r][c], gridDates[r][c]);
      calendarData[r][c] = day.text;
      byDay.set(gridDates[r][c].getTime(), day.morning);
    }
  }
  let until = addMonths(today, AHEAD_MONTHS);
  for (const row of futureData.slice(1)) {
    const date = createSafeMidnight(row[2], true);
    if (String(row[3] ?? "").includes(PERCENT_MARK) && date > until) until = date;
  }
  const recurringRows = getParsedRecurringRows();
  const futureByDate = groupFutureRowsByDate();
  const sheetDays = sheetEntriesByDay(nextFourStart, until);
  for (let day = nextFourStart; day <= until; day = addDays(day, 1)) {
    byDay.set(day.getTime(), runner.day(dayAfterCalendar(day, recurringRows, futureByDate, sheetDays), day).morning);
  }
  percentBases = { byDay, until, last: new Map(runner.balances) };

  // Upcoming's % entries, from the balances just worked out
  for (const row of futureData.slice(1)) {
    const percent = percentOf(row[3]);
    const date = createSafeMidnight(row[2], true);
    if (percent === null || isNaN(date.getTime()) || date < today) continue;
    const amount = percentAmount(percent, date, row[3], String(row[0]).trim());
    if (amount === null) row[3] = percentSprite(row[3], null);
    else row[1] = formatMoney(amount);
  }
}

// "3%" for a % entry, as people read it (its sign is the amount's)
const showPercent = (percent) => `${Math.abs(percent)}%`;

// An entry line as people see it (and logs keep it): without the placeholder mark, and with a % entry's percent after
// its amount ("⭕️％-3⏳ -$30.00 Card" -> "⭕️ -$30.00 (3%) Card")
function shownLine(line) {
  const text = String(line ?? "");
  const parts = getParts(text);
  const sprite = parts[0] || "";
  const percent = percentOf(sprite);
  if (percent === null) return isPlaceholder(sprite) ? text.replace(sprite, withoutPlaceholder(sprite)) : text;
  return [baseSprite(sprite), parts[1], `(${showPercent(percent)})`, ...parts.slice(2)].join(" ");
}

// A line with just its type and mark in front (no % or placeholder), to sort it with its kind
function plainLine(line) {
  const text = String(line ?? "");
  const sprite = getParts(text)[0] || "";
  return baseSprite(sprite) === sprite ? text : text.replace(sprite, baseSprite(sprite));
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
// 6 Month, and Yearly): Bob points them out, and they get a reminder
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
// fingers that start on different days (or off the days), or on a zoomed day, zoom the page itself, like anywhere else
// on it (a zoomed day is part of the page, so it zooms with it).

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
    if (!cell1 || cell1 !== cell2 || !cell1.querySelector('.cell-content') || cell1.classList.contains('is-editing')) return;

    targetEl = cell1.querySelector('.cell-content');
    cell1.style.zIndex = '20';
    targetEl.style.overflow = 'visible';
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
// A tapped day zooms in over a dimmed page and stays zoomed until its v, or anything outside it, is tapped; its +
// opens New Entry on that day. It's part of the page: it opens where the screen is, then the page can be scrolled
// and pinch-zoomed with it, the way the rest of the page is. Entries never wrap: a day that isn't zoomed cuts them off at
// its edge. On a computer it doubles in size (scaled, see budgetStyle.css), as tall as its lines, and its entries run
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
// Where a phone's zoomed day sits on the page: the screen as it was when the day zoomed in ({ x, y: its top left corner,
// in page pixels; width, height: its size, in the page's pixels before a pinch; pinch: the page's zoom then; layoutWidth:
// the window's width then }). It stays there while the page is scrolled or pinch-zoomed (the day moves and zooms with the
// page), and sliding to the next day keeps it. null until a day zooms.
let zoomAnchor = null;
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

// A zoomed day's round buttons in its top right corner, for Home's days and History's: + (New Entry on that day) and ×
// (close)
function zoomDayButtons() {
  const buttons = document.createDocumentFragment();
  for (const [kind, text, label] of [['cellAdd', '+', 'New entry on this day'], ['cellClose', '×', 'Close day']]) {
    const button = document.createElement('button');
    button.className = `cell-action-btn ${kind}`;
    button.type = 'button';
    button.textContent = text;
    button.setAttribute('aria-label', label);
    buttons.appendChild(button);
  }
  return buttons;
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
  document.documentElement.classList.add('dayZoomed');
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
  zoomAnchor = null;
  if (zoomBackdrop) zoomBackdrop.classList.remove('shown');
  document.documentElement.classList.remove('dayZoomed');
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
  window.Sounds?.play("soft");
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
// looks just the same. It goes where the screen was when it zoomed in (zoomAnchor), so it stays put on the page when the
// page scrolls or zooms. animate: it grows out of the day (opening); without, it just moves (when the window resizes, or
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
  if (!zoomAnchor) {
    const view = window.visualViewport;
    const pinch = pageZoomedIn() ? view.scale : 1;
    const layoutWidth = document.documentElement.clientWidth || window.innerWidth;
    zoomAnchor = {
      x: window.scrollX + (pinch > 1 ? view.offsetLeft : 0),
      y: window.scrollY + (pinch > 1 ? view.offsetTop : 0),
      width: pinch > 1 ? view.width * pinch : layoutWidth,
      height: view ? view.height * pinch : window.innerHeight,
      pinch,
      layoutWidth
    };
  }
  const { pinch, width: viewWidth, height: viewHeight } = zoomAnchor;
  cell.zoomPinch = pinch;
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
  // (From where the day is on the page to where the screen was)
  const shift = `translate(${zoomAnchor.x - (box.left + window.scrollX)}px, ${zoomAnchor.y - (box.top + window.scrollY)}px)`;
  const moved = pinch > 1 ? `${shift} scale(${1 / pinch})` : shift;
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
// (A window that changes width, like a phone turned sideways, lays it out again for the screen it has now. Scrolling or
// pinch-zooming the page moves and zooms it with the page instead; so does a height change alone, which a phone's
// browser makes as its toolbar slides away while the page scrolls.)
window.addEventListener('resize', () => {
  if (!activeEditCell) return;
  const width = document.documentElement.clientWidth || window.innerWidth;
  if (zoomAnchor && Math.abs(zoomAnchor.layoutWidth - width) < 1) return;
  zoomAnchor = null;
  refitZoomedDay();
});
// A day tapped while the page was still sliding in was measured on the move
document.getElementById('transitionContainer')?.addEventListener('transitionend', (e) => {
  if (activeEditCell && e.target === e.currentTarget) refitZoomedDay();
});
document.addEventListener('budget:updated', () => { if (activeEditCell) refitZoomedDay(); }); // After the page redraws it

// A tap on a table: its day zooms in, a zoomed day's v closes it, and its + opens New Entry on that day (Budget UI.js).
// On a page that's pinch-zoomed in, the page zooms back out first, where the browser lets a page do that (unzoomPage);
// where it doesn't, the zoomed day is laid out on the part of the page on the screen instead (fitZoomedDay), so it never
// lands off the screen.
function zoomTappedDay(e) {
  const action = e.target.closest('.cell-action-btn');
  if (action) {
    e.stopPropagation();
    const cell = action.closest('td');
    if (!action.classList.contains('cellAdd')) closeZoomedDay();
    else if (cell === activeEditCell && typeof BudgetUI !== 'undefined' && dayTime(cell) !== null) BudgetUI.openNewEntry(action, { date: new Date(dayTime(cell)) });
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

// Save them for this tab (best effort: when the tab's storage is full, like after a few changes to long notes, the
// oldest steps are let go until the rest fit)
function writeUndoHistory(history) {
  for (;;) {
    try {
      sessionStorage.setItem(undoStorageKey(), JSON.stringify(history));
      return;
    } catch (e) {
      if (history.undo.length > 0) history.undo.shift();
      else if (history.redo.length > 0) history.redo.shift();
      else return;
    }
  }
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
  for (const day of step.days) {
    setDayEntries(createSafeMidnight(day.date), day[to]);
    if (day.notes) putStepNotes(day.notes[to]);
  }
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

// Before and after a change: each day's own entries, and their notes. A step keeps only the days that changed.
function captureEntryDays(dates) {
  const days = [];
  for (const date of dates) {
    const day = createSafeMidnight(date);
    if (isNaN(day.getTime())) continue;
    const key = formatToMMDDYYYY(day);
    if (!days.some(known => known.date === key)) days.push({ date: key, lines: dayEntries(day), notes: dayNotes(day) });
  }
  return { days, equity: JSON.stringify(accountsData?.equity ?? null) };
}

// A change's step: the days whose entries (or notes, see notesChange) it changed, before and after (null when there's
// nothing to put back). keepBalances: it was made in History, so undoing or redoing it keeps the accounts' balances
// (changeHistoryEntry).
function makeUndoStep(label, before, keepBalances = false) {
  const after = captureEntryDays(before.days.map(day => createSafeMidnight(day.date)));
  const days = before.days
    .map((day, i) => {
      const notes = notesChange(day.notes, after.days[i].notes);
      return { date: day.date, before: day.lines, after: after.days[i].lines, ...(notes ? { notes } : {}) };
    })
    .filter(day => JSON.stringify(day.before) !== JSON.stringify(day.after) || day.notes);
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
  conflict: ["Your budget was changed on another device or tab, so this page reloaded with the newest version. Your last change wasn't saved, so please make it again.", true]
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

//#endregion

// =====================================================================
// #region LIVE UPDATES (another device's changes show up here by themselves)
// =====================================================================
// Two devices (or two people sharing a budget) with it open see each other's changes within a few seconds: while the
// page is on the screen, it asks the server every LIVE_CHECK_MS for the budget's revision and its waiting quick entries'
// signature, and when either changed somewhere else, the budget loads again in place (no reload: loadInPlace) and the
// page redraws. Not while something here is unsaved or still saving, or while a panel is open, the page is in Edit, a row
// is being dragged, or a box the page draws again is being typed in (like the Paycheck Calculator's): then it waits for
// the next check. A budget brought up to date through another day (a new day here, or another time zone there) reloads the
// page instead, so the daily update runs first.

const LIVE_CHECK_MS = 5000;
let quickSignature = null; // The waiting quick entries the page loaded, summed up by the API (its quick_signature)
let liveChecking = false;
let liveLoadOwed = false;  // A load picked this device's quick entries up but wasn't used: the next check loads again

// Is the page in the middle of something the budget loading again would change under it?
function liveUpdateWaits() {
  const active = document.activeElement;
  const typing = !!active?.closest?.("#dataView") && active.matches("input, textarea, select");
  return typing || !!document.querySelector(".budgetPanel:not(.isClosing), .dataTable.isEditing, .dataTable.isDragging, form[data-typing]");
}

// One check: the budget's revision (and its waiting quick entries) on the server, and the budget again when they changed
async function liveCheck() {
  if (liveChecking || document.visibilityState !== "visible" || !workspaceLoaded || dataRevision === null || reloadingBudget) return;
  if (deviceDayChanged()) {
    if (savingNow || hasUnsavedChanges()) return; // (The next change reloads for the new day)
    reloadingBudget = true;
    workspaceLoaded = false;
    window.location.reload();
    return;
  }
  if (savingNow || hasUnsavedChanges() || liveUpdateWaits() || navigator.onLine === false) return;
  liveChecking = true;
  try {
    const known = dataRevision;
    const result = await budgetApi("/api/data/revision");
    if (!result.ok || !result.data || !Number.isInteger(result.data.revision)) return;
    // (A save from this page while the answer was on its way moved the revision on itself: that's not a change from
    // somewhere else)
    if (dataRevision !== known) return;
    const quickChanged = typeof result.data.quick === "string" && quickSignature !== null && result.data.quick !== quickSignature;
    if (result.data.revision !== dataRevision || quickChanged || liveLoadOwed) await loadInPlace();
  } finally {
    liveChecking = false;
  }
}

// The budget loads again from the server, in place: its tables, everything worked out again, and the page redrawn
// (budget:updated). This device's own quick entries are added after it, the same as when the page opened. A budget whose
// daily update was done through another day than this page's (a day behind, or a device a day ahead) reloads the page
// instead.
function loadInPlace() {
  const run = budgetQueue.then(async () => {
    if (!workspaceLoaded || savingNow || hasUnsavedChanges() || budgetConflict || liveUpdateWaits()) return null;
    const token = localStorage.getItem("prismal_jwt");
    if (!token) return null;
    let response;
    try {
      response = await fetch(budgetLoadAddress(), { headers: { Authorization: `Bearer ${token}` } });
    } catch (e) {
      return null; // (Offline: the next check tries again)
    }
    if (response.status === 401) {
      signedOutElsewhere();
      return null;
    }
    if (!response.ok) return null;
    const data = await response.json();
    // (Something changed here while it loaded: this page's copy is kept, and the next check loads again, since this load
    // may have picked this device's quick entries up)
    if (!workspaceLoaded || hasUnsavedChanges() || liveUpdateWaits()) {
      liveLoadOwed = true;
      return null;
    }
    const processed = data.last_processed_date ? createSafeMidnight(data.last_processed_date) : null;
    if (!processed || isNaN(processed.getTime()) || processed.getTime() !== today.getTime()) {
      reloadingBudget = true;
      workspaceLoaded = false;
      window.location.reload();
      return null;
    }
    const snapshot = snapshotTables();
    const kept = { revision: dataRevision, quick: quickSignature, unsavable: unsavableTables };
    try {
      readLoadedTables(data);
      stripRecurringEntries();
      refreshBudgetData();
    } catch (err) {
      restoreTables(snapshot);
      ({ revision: dataRevision, quick: quickSignature, unsavable: unsavableTables } = kept);
      console.error("The budget couldn't be loaded again here:", err);
      return null;
    }
    // This page has what the server has (anything worked out differently here is saved with the next change)
    for (const table of Object.values(BUDGET_TABLES)) table.saved();
    liveLoadOwed = false;
    lastActiveDay = latestActiveDay(lastDailyUpdate, data.quick_entries);
    notifyBudgetChanged();
    return data.quick_entries;
  });
  budgetQueue = run.catch(() => {});
  return run.then(async (queue) => {
    if (!queue) return;
    await holdQuickEntries(queue);
    notifyBudgetChanged(); // (Home's Quick Entries To Add)
  }).catch(err => console.error("The budget couldn't be loaded again here:", err));
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
  // Every few seconds while the page is on the screen, and right away when it comes back (another tab, the phone woke
  // up, or the browser's Back button showing it just as it was left)
  setInterval(liveCheck, LIVE_CHECK_MS);
  document.addEventListener("visibilitychange", liveCheck);
  window.addEventListener("pageshow", (event) => { if (event.persisted) liveCheck(); });
}

//#endregion

// Load (and daily-update) the workspace. Page scripts wait on this before rendering:
//   window.workspaceReady.then(loaded => { if (loaded) render(); });
// The Quick Entry page only borrows the helpers here: it has no login, so it never loads a budget.
window.workspaceReady = window.PAGE === "quick" ? Promise.resolve(false) : loadWorkspace();
window.workspaceReady.then(loaded => { if (loaded) showRememberedBudgetNotice(); });