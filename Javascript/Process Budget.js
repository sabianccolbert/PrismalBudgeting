// Process Budget: the budget itself, for every page that shows one. Loading the open budget from the API (an account can
// have several, and budgets shared with it: Budgets.js says which) and saving what changed to that same one, the daily
// update that brings it up to today, every change (calendar entries, recurring entries, the
// tracker, Equity, connected spreadsheets, Quick Entry), the budget math, Bob's message on Home and his page's
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
let accountsData = null; // Equity: { version, list: [[...]], equity: {...} } (see normalizeApiAccounts)
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
  accounts:   { cols: 17, minRows: 1 }, // Equity: [0] column titles, then [name, balance, "default" | "cash" | "", starting amount, interest rate, interest (and escrow) since, max, compounds, added every, added on, "separate" | "", interest balance when it started counting, escrow a month, escrow's day, escrow due when it started counting, interest counted from, kind ("car", "mortgage", "credit", "debit", or "" for other)]
  account:    { cols: 3, minRows: 3 },  // Each LLC equity table: 3 header rows, then [date, amount, title]
  logs:       { cols: 10, minRows: 1 }  // [0] column titles, then [time, duration, action, 4 details, status, what it changed (for its Undo, see CHANGE LOG UNDO), who made it]
};

// Limits on what's typed in. Amounts go up to a billion dollars (the API's Quick Entry has the same limit):
// bigger numbers can't be kept to the cent, and past 1e21 JavaScript writes them as "1e+21". Titles go up to 100
// characters, like Quick Entry's and connected spreadsheets'.
const MAX_AMOUNT = 1000000000;
const AMOUNT_TOO_BIG = "Amounts can be up to $1,000,000,000.";
const MAX_TITLE = 100;

// An entry for an Equity account keeps its own title, with the account after an arrow: "Payday Transfer → Savings"
// (see splitAccount). One with no title of its own is just the account's name, like "Savings".
const ACCOUNT_ARROW = "→";
// A Transfer can come from another Equity account instead of In Bank, kept before the account it goes to: "Move ← Savings
// → HSA" (see fromAccount)
const FROM_ARROW = "←";
const MAX_ENTRY_TITLE = 233; // A title (100), the account it comes from (60), the account it goes to (60), and the arrows

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

// Set when a budget opens for the first time (an account's first sign-in, or a new budget), to that budget's number: Home
// shows its Getting Started card on that budget while it's set (Calendar Page.js), and signing out forgets it, so the card
// never comes back after that. ("1", from before budgets could be many: the account's first budget.)
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
    // The budget this tab had open was deleted, or isn't shared with the account anymore
    if (await budgetIsGone(response)) return false;

    if (!response.ok) {
      throw new Error(`Server responded with status: ${response.status}`);
    }

    const data = await response.json();
    const storedAccounts = readLoadedTables(data);
    openedBudget(data.budget);
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
      try { localStorage.setItem(GETTING_STARTED_KEY, String(budgetInfo ? budgetInfo.id : "1")); } catch (e) {}
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

// Where the budget loads from: /api/data/load, naming the budget (see budgetQuery) and the Quick Entry icons this device
// made or used (ownQuickIcons), whose waiting entries it adds as it loads (the API marks only those as picked up; see
// holdQuickEntries)
function budgetLoadAddress() {
  return withBudget(`${window.API_BASE_URL}/api/data/load?icons=${encodeURIComponent(ownQuickIcons().join(","))}`);
}

/* ---------- Which budget ---------- */
// An account can have several budgets, and budgets shared with it (Budgets.js picks which one a page opens). Every request
// about the budget names the one this page has open, so a save never lands in another one; the API refuses a budget the
// account can't open (a 404 saying budgetGone), and then the page opens the account's own instead.

// The budget this page has open, as the API's addresses name it ("budget=12"; "" on the Quick Entry page, which has none)
function budgetQuery() {
  return window.Budgets ? window.Budgets.query() : "";
}

// An API address with the open budget in it
function withBudget(address) {
  const query = budgetQuery();
  return query ? `${address}${address.includes("?") ? "&" : "?"}${query}` : address;
}

// Routes that are about the open budget (the rest are about the account)
const BUDGET_ROUTES = /^\/api\/(data|quick)\/|^\/api\/notify\/plan$/;

// The budget the page loaded: { id, name, first, owned, owner, shared } (see Budgets.js), or null before it has
let budgetInfo = null;

// The load said which budget it is: this page's from now on (Budgets.js keeps it for the tab, and its picker shows it)
function openedBudget(budget) {
  if (!budget || !Number.isSafeInteger(budget.id)) return;
  budgetInfo = { ...budget };
  if (window.Budgets) window.Budgets.loaded(budget);
}

// Is the budget shared (anyone else can open it)? Some things only the person who set them up can keep up to date then
// (see CONNECTED SPREADSHEETS).
const budgetIsShared = () => !!budgetInfo && (budgetInfo.shared || !budgetInfo.owned);

// The account signed in here (Change Logs say who made each change in a shared budget)
const signedInName = () => { try { return localStorage.getItem("prismal_username") || ""; } catch (e) { return ""; } };

// A 404 that says the budget asked for is gone (deleted, or not shared with the account anymore): the page opens the
// account's own (Budgets.gone). Resolves to whether it was that.
async function budgetIsGone(response) {
  if (response.status !== 404) return false;
  let data = null;
  try { data = await response.clone().json(); } catch (e) {}
  if (!data || !data.budgetGone) return false;
  workspaceLoaded = false;
  if (window.Budgets) window.Budgets.gone();
  return true;
}

// The budget as /api/data/load sent it, into the page's tables, with its revision and its waiting quick entries'
// signature (see LIVE UPDATES). Returns the stored Equity as they were (to tell whether setting them up changed
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
  // The last Catchup, as the saved calendar has it: a placeholder that comes off a day at or before it leaves In Bank as it
  // is (see IN BANK AND THE LAST CATCHUP)
  const catchup = lastCatchupDay(calendarData, historyData, oldGridStart);
  let sheetDays = sheetEntriesByDay(lastDailyUpdate, new Date(Math.min(yesterday.getTime(), lightFromTime - 1)));
  // % entries (see PERCENT_MARK) on the days that scrolled in while away are worked out one day at a time, from the Equity
  // accounts' balances when the budget was last worked out (a saved day's already were)
  let percents = hasPercentEntries() ? percentRunner(accountBalancesToday(), addDays(lastDailyUpdate, 1), accountSummaries(lastDailyUpdate, oldGridStart)) : null;
  // Placeholders kept past their own day (into History) whose last day has passed go first, and History's In Bank goes on
  // without them, so every saved day after works its In Bank out again
  const historyDropped = dropHistoryPlaceholders(catchup);
  if (historyDropped > 0) {
    placeholdersRemoved += historyDropped;
    rechain = true;
  }

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

      // A placeholder whose last day has passed is deleted: it only stood in for an entry (one kept past its own day goes
      // once that day passes, see dropHistoryPlaceholders for History's)
      let kept = dropPlaceholders(cell.text, cell.date);
      if (kept.dropped > 0) {
        const held = !cell.isNew && !!catchup && cell.date <= catchup;
        if (held) holdBank(cell.date, dayMath(cell.text.split("\n")).bankChange - dayMath(kept.text.split("\n")).bankChange);
        cell.text = kept.text;
        placeholdersRemoved += kept.dropped;
        if (!cell.isNew && !held) rechain = true;
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
            parts[0] = decoratedSprite(newSprite, { placeholder: placeholderPart(parts[0]) || false });
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
        let math = applyCellBudgetMath(cell.text, lastInBank, bankHoldOn(cell.date));
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

  // 7. Remove Future Dates entries that were written into missed days (by their rows' places, so before anything else
  // takes a row out)
  if (usedFutureRows.size > 0) {
    futureData = futureData.filter((_, i) => !usedFutureRows.has(i));
    futureEdited = true;
    deletedUpcoming += usedFutureRows.size;
  }
  // (And the placeholders ahead whose last day, picked before their own, has passed)
  placeholdersRemoved += dropEarlyPlaceholders();

  // 8. Mark today as processed; loadWorkspace saves this only after the data itself is saved
  if (lastDailyUpdate.getTime() < todayTime) {
    pendingProcessedDate = formatToMMDDYYYY(today);
    lastDailyUpdate = today;
  }

  formEntryRow[3] = "Uniques Created: " + uniquesCreated + (placeholdersRemoved > 0 ? ", Placeholders Removed: " + placeholdersRemoved : "");
  formEntryRow[5] = "Weeks Scrolled: " + weeksScrolled;
}

// History's placeholders whose last day has passed (ones kept past their own day, see placeholderEnds) come off, and each
// History day's In Bank from the first one's day on is what it would have been without them (the calendar goes on from the
// newest), except for one on or before catchup (the last Catchup's day, or null: see IN BANK AND THE LAST CATCHUP), which
// leaves In Bank as it is. Returns how many came off.
function dropHistoryPlaceholders(catchup = null) {
  const days = []; // Every History day, oldest first
  for (let r = historyData.length - 1; r >= 1; r--) {
    for (let c = 0; c < 7; c++) {
      const header = String(historyData[r][c] ?? "").split("\n")[0].trim();
      const date = header ? createSafeMidnight(header, true) : null;
      if (date && !isNaN(date.getTime())) days.push({ r, c, date });
    }
  }
  let dropped = 0;
  let shift = 0; // What the placeholders taken off so far had added to In Bank
  for (const { r, c, date } of days) {
    const lines = String(historyData[r][c]).split("\n");
    const kept = lines.filter((text, l) => {
      const line = readLine(text);
      if (l === 0 || line.blank || line.system || !placeholderExpired(line.sprite, date)) return true;
      if (getSpecialType(line.sprite) !== "✖️" && !line.fromOther && !(catchup && date <= catchup)) shift = Math.round((shift + line.amount) * 100) / 100;
      dropped++;
      return false;
    });
    const inBank = readInBank(historyData[r][c]);
    if (inBank !== null && shift !== 0) {
      const now = Math.round((inBank - shift) * 100) / 100;
      kept[1] = `${now < 0 ? "⛔️" : "✅"} ${formatMoney(now)} In Bank`;
    }
    if (kept.length !== lines.length || (inBank !== null && shift !== 0)) historyData[r][c] = kept.join("\n");
  }
  if (dropped > 0) historyEdited = true;
  return dropped;
}

// Placeholders on the calendar from today on, and in Upcoming, whose last day was picked before their own and has passed
// come off. Returns how many.
function dropEarlyPlaceholders() {
  let dropped = 0;
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 7; c++) {
      if (gridDates[r][c] < today) continue;
      const kept = dropPlaceholders(calendarData[r][c], gridDates[r][c]);
      if (kept.dropped === 0) continue;
      calendarData[r][c] = kept.text;
      dropped += kept.dropped;
    }
  }
  const before = futureData.length;
  futureData = futureData.filter((row, f) => f === 0 || !placeholderExpired(String(row[3] ?? ""), createSafeMidnight(row[2], true)));
  if (futureData.length !== before) {
    futureEdited = true;
    dropped += before - futureData.length;
  }
  return dropped;
}

// A day's lines (date: its day) without the placeholders whose last day has passed (see placeholderEnds): { text, dropped
// (how many) }
function dropPlaceholders(cellText, date) {
  const lines = String(cellText).split("\n");
  const kept = lines.filter((line, l) => l === 0 || !placeholderExpired(getParts(line)[0], date));
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
      let newSprite = placeholderSprite(baseSprite(parts[0]) + "✔️", mergedPlaceholder(parts[0], row.sprite));
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

// One cell's In Bank / Gains / Costs lines, using the same math as writeBudgetMath (hold: its day's, see IN BANK AND THE
// LAST CATCHUP)
function applyCellBudgetMath(cellText, lastInBank, hold = 0) {
  let lines = cellText.split("\n");
  let { gains, costs, bankChange } = dayMath(lines);
  let inBank = Math.round((lastInBank + bankChange + hold) * 100) / 100;
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
    const res = await fetch(withBudget(`${window.API_BASE_URL}/api/data/save_date`), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        last_processed_date: dateString
      })
    });
    if (await budgetIsGone(res)) return false;
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
Equity accounts (like Savings) start from an amount set on their page, and are changed by Hidden and Transfer
entries with the account picked, see OTHER ACCOUNTS below.
*/

// Change Logs rows kept. Each table is saved as a single database row (2 MB max), so this is capped.
const MAX_LOG_ROWS = 1000;
// The most one table can hold when it's saved (the API refuses more)
const MAX_TABLE_BYTES = 1900000;

// Tracker rows that updateTrackerTab fills in itself (their titles and aliases aren't user-edited, and they
// can't be deleted)
const TRACKER_AUTO_ROWS = ["gains", "costs", "transfers", "interest", "undefined"];
// The Interest row is marked in its [5] (a row someone titled Interest before it came is renamed, see updateTrackerTab)
const INTEREST_ROW_MARK = "auto";
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
// PERCENT_MARK), date, placeholder, until (a placeholder's last day: a Date, or left out for its own day), purpose (what its title's money is for: one of the wavelengths, see WAVELENGTH
// PLANNING; left out, it stays as it is), note (see ENTRY NOTES: added to the entry's, when it goes into one already
// there), reminder (days before its day, for a day after today; see ENTRY REMINDERS) }. Can be undone.
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
      ...(entry.until !== undefined ? { until: entry.until } : {}),
      adding: true
    });
    noteEntryPurpose(entry.title, entry.purpose);
    addEntryNote(entry.date || today, entry.title, landed.entryType, entry.note);
    addEntryReminder(entry.date || today, entry.title, landed.entryType, entry.reminder ?? null);
    return {};
  }, { label: `added ${capitalize(String(entry.title || "").trim())} (${hasPercent ? showPercent(entry.percent) : formatMoney(entry.amount)}) on ${showDay(createSafeMidnight(entry.date || today))}`, dates: [entry.date || today] });
}

// Change, move, or delete a calendar entry (or one in Upcoming; History's go through changeHistoryEntry). change: { title,
// sprite, date, action, amount, moveDate, renameTo (a new title of its own, see renameEntry), purpose (its title's, see
// addCalendarEntry), note (its own, see ENTRY NOTES; left out, it keeps the one it has), reminder (days before its day,
// or null for none, see ENTRY REMINDERS; left out, it keeps the one it has) }. Can be undone.
function changeCalendarEntry(change) {
  return runBudgetAction("", () => keepEntryDetails(entryChange(change), change), { label: describeEntryChange(change), dates: [change.date, change.moveDate].filter(Boolean) });
}

// After a change to an entry: its title's purpose as the form says (change.purpose; see WAVELENGTH PLANNING), on the
// title it has now, and its note and reminder, which go where it went (see followEntryNote). Nothing, when it couldn't
// be found.
function keepEntryDetails(result, change) {
  if (notFound) return result;
  const deleted = String(change.action || "").toLowerCase() === "delete";
  if (change.purpose !== undefined && !deleted) noteEntryPurpose(changedTitle(change), change.purpose);
  followEntryNote(change, deleted);
  return result;
}

// An entry's title after a change: its new one (a new type or Equity account's newTitle, or a rename's own title with its
// account after it), or the one it had
function changedTitle(change) {
  if (change.newTitle !== undefined) return change.newTitle;
  if (change.renameTo !== undefined) {
    const { account, from } = splitAccount(String(change.title || ""));
    return withAccount(String(change.renameTo), account, from);
  }
  return change.title;
}

// A change to an entry (unique's), after its new title when it has one (renameTo): renamed first, then changed on its
// new title. Only renamed, nothing else happens to it.
function entryChange(change) {
  if (change.renameTo === undefined) return unique(change);
  const renamed = renameEntry(change);
  if (notFound) return {};
  const placeholderChanged = (change.placeholder !== undefined && !!change.placeholder !== isPlaceholder(renamed.sprite)) || change.until !== undefined;
  const amountChanged = String(change.amount ?? "").trim() !== "" || typeof change.percent === "number";
  if (change.action !== "delete" && !change.moveDate && !amountChanged && !placeholderChanged) return {};
  const { renameTo, ...rest } = change;
  const result = unique({ ...rest, title: renamed.title, sprite: getSpecialType(renamed.sprite) });
  formEntryRow[3] = `${formEntryRow[3]} (renamed from ${capitalize(String(change.title || "").trim())})`;
  return result;
}

// An entry gets a new title of its own (change.renameTo; its Equity account stays after it). On a day from today on, an
// entry that lands by itself (a recurring entry's or a connected spreadsheet's or calendar's, or a temp of one) keeps its
// title: it's changed on the Recurring Entries or Spreadsheets & Calendars page instead. Any entry on a day before today
// can be renamed (in History too). It stays what it was (its type, mark, %, and placeholder), unless an entry with the
// new title and type is already on that day: then the two become one (a day has one of each), their amounts added, a
// placeholder only if both were, and a plain amount. Returns { title, sprite }: the entry as it is now.
const RENAME_LANDED = "This entry comes from a recurring entry or a connected spreadsheet or calendar, so from today on its title is changed there (on the Recurring Entries or Spreadsheets & Calendars page).";
function renameEntry(change) {
  const date = createSafeMidnight(change.date || today);
  const { account, from: fromName } = splitAccount(String(change.title || "").trim());
  const own = String(change.renameTo ?? "").replace(/\s+/g, " ").trim();
  if (hasTitleArrow(own)) throw new BudgetInputError(TITLE_ARROW);
  if (own.length > MAX_TITLE) throw new BudgetInputError(`Titles can be up to ${MAX_TITLE} characters.`);
  const newTitle = capitalize(withAccount(own, account, fromName));
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
  let placeholder = placeholderPart(from.oldSprite);
  if (merging) {
    sprite = special + (entryMark(into.oldSprite) || entryMark(from.oldSprite));
    amount = Math.round((amount + into.oldAmt) * 100) / 100;
    placeholder = mergedPlaceholder(into.oldSprite, from.oldSprite) || "";
  }
  injectOrDefer("set", date, amount, newTitle, sprite, {}, placeholder);
  formEntryRow[2] = "✏️ Rename Entry";
  formEntryRow[3] = `${baseSprite(from.oldSprite)} ${capitalize(String(change.title || "").trim())}`;
  formEntryRow[4] = "On: " + showDate(date);
  formEntryRow[5] = "To: " + newTitle;
  formEntryRow[6] = merging ? `Added into the ${newTitle} already there` : "";
  return { title: newTitle, sprite: placeholderSprite(sprite, writtenPlaceholder(placeholder, date)) };
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

// A calendar entry's refraction type or Equity account changed (and maybe its amount and day too). change: { title,
// sprite, date (the entry as it is), newTitle ("Payday → HSA"), newSprite, amount (the new signed amount), percent (a %
// amount instead, signed), moveDate, placeholder, until (its last day, as unique() takes it) }. It comes off its day the way Delete takes it off (one that landed by
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
    ...(change.until !== undefined ? { until: change.until } : {}),
    adding: true
  });
}

// "changed Payday on 10/05 to Payday → HSA (Transfer)", for Undo and Redo
function describeKindChange(change) {
  return `changed ${capitalize(String(change.title || "").trim())} on ${showDay(createSafeMidnight(change.date))} to ${capitalize(change.newTitle)} (${REFRACTION_NAMES.get(change.newSprite) || "Regular"})`;
}

// An entry on a day in History changed from History's zoomed day: changeCalendarEntry's change (Set to, Add to it, Move
// to, Delete), or changeEntryKind's (one with newTitle: its refraction type or Equity account). What it does to In Bank is
// the rule for every day before today (see IN BANK AND THE LAST CATCHUP), and no Equity account's balance today changes
// (keepAccountBalances). It can move to any day from History's first on: moved to a day after today, it hasn't happened
// yet, so the accounts' balances today go without it, and they follow it on its new day. The tracker and Search count
// the change. Can be undone, and undoing it keeps the balances too.
function changeHistoryEntry(change) {
  const isKind = change.newTitle !== undefined;
  const dates = [change.date, change.moveDate].filter(Boolean);
  const label = isKind ? describeKindChange(change) : describeEntryChange(change);
  const keepBalances = !change.moveDate || change.moveDate <= today;
  return runBudgetAction("", () => {
    if (change.date >= gridStartDate || dates.some(date => date < gridStartDate && !historyHasDay(date))) {
      throw new BudgetInputError(`An entry in History can move to any day from ${showDate(oldestHistoryDay() || gridStartDate)} on.`);
    }
    const balances = accountBalancesToday();
    const result = keepEntryDetails((isKind ? entryKindChange(change) : entryChange(change)) || {}, change);
    return keepBalances ? { ...result, afterRefresh: () => keepAccountBalances(balances) } : result;
  }, { label, dates, keepBalances });
}

/* ---------- In Bank and the last Catchup ---------- */
// Typing what the bank says on a day (In Bank tapped on a zoomed day) makes a Catchup entry for the difference, and that
// day's In Bank is then what the bank said. So a change to a day before today, on or before the last Catchup (the latest
// one on or before today), leaves In Bank as it is on every day. A change to a day before today that's after it, or with
// no Catchup at all, changes In Bank from that day on, and a change to today or a later day always does. A Catchup's own
// change takes effect when it's the last one (or the last one is being added or taken off).
// History's days keep their In Bank lines, so a change that counts moves them, from its day on. The calendar's are worked
// out from their entries every time, so a change that doesn't count is held off by the day's hold: an amount added to the
// day's In Bank (accountsData.bankHolds: { "MM/DD/YYYY": amount }), until its week goes into History with the In Bank it
// had (pruneBankHolds).

// Is an entry (read with readLine) a Catchup entry that changes In Bank?
function isCatchupLine(line) {
  return !line.blank && !line.system && line.amount !== 0 && /^catch ?up$/.test(line.clean) && getSpecialType(line.sprite) !== "✖️" && !line.fromOther;
}

// The last day on or before today with a Catchup entry, or null. calendar, history, calendarStart: another copy of them
// (the budget's as it was before a change; the daily update's calendar is still the saved one).
function lastCatchupDay(calendar = calendarData, history = historyData, calendarStart = gridStartDate) {
  const hasCatchup = (cellText) => String(cellText ?? "").split("\n").slice(1).some(text => isCatchupLine(readLine(text)));
  for (let r = 3; r >= 0; r--) {
    for (let c = 6; c >= 0; c--) {
      const day = addDays(calendarStart, r * 7 + c);
      if (day <= today && hasCatchup(calendar[r]?.[c])) return day;
    }
  }
  for (let r = 1; r < history.length; r++) {
    for (let c = 6; c >= 0; c--) {
      if (!hasCatchup(history[r][c])) continue;
      const day = createSafeMidnight(String(history[r][c]).split("\n")[0].trim(), true);
      if (!isNaN(day.getTime())) return day;
    }
  }
  return null;
}

// Does a change on this day leave In Bank as it is?
function bankKeptOn(date) {
  const catchup = date < today ? lastCatchupDay() : null;
  return !!catchup && date <= catchup;
}

// What a day's hold adds to its In Bank
function bankHoldOn(date) {
  return accountsData?.bankHolds?.[formatToMMDDYYYY(date)] ?? 0;
}

// Add to a day's hold
function holdBank(date, amount) {
  const holds = accountsData.bankHolds || {};
  const key = formatToMMDDYYYY(date);
  const total = Math.round(((holds[key] ?? 0) + amount) * 100) / 100;
  if (total) holds[key] = total;
  else delete holds[key];
  if (Object.keys(holds).length > 0) accountsData.bankHolds = holds;
  else delete accountsData.bankHolds;
}

// Days that have left the calendar don't need their holds: History keeps the In Bank they had
function pruneBankHolds() {
  const holds = accountsData?.bankHolds;
  if (!holds) return;
  for (const key of Object.keys(holds)) if (createSafeMidnight(key, true) < gridStartDate) delete holds[key];
  if (Object.keys(holds).length === 0) delete accountsData.bankHolds;
}

// What a day's entries do to In Bank, the Catchups apart: { entries, catchups }
function bankParts(cellText) {
  let entries = 0;
  let catchups = 0;
  for (const text of String(cellText ?? "").split("\n").slice(1)) {
    const line = readLine(text);
    if (line.blank || line.system || getSpecialType(line.sprite) === "✖️" || line.fromOther) continue;
    if (isCatchupLine(line)) catchups += line.amount;
    else entries += line.amount;
  }
  return { entries, catchups };
}

// A change just made (before: the tables as they were, snapshotTables), before everything is worked out again: each day
// before today that it changed follows the rule above
function holdPastBank(before) {
  const oldCalendar = JSON.parse(before.calendar);
  const oldHistory = JSON.parse(before.history);
  const known = [lastCatchupDay(oldCalendar, oldHistory), lastCatchupDay()].filter(Boolean);
  const catchup = known.length > 0 ? new Date(Math.max(...known.map(day => day.getTime()))) : null;
  const round = (amount) => Math.round(amount * 100) / 100;
  // What changed on a day: { held (leaves In Bank as it is), counts (changes it from that day on) }
  const split = (date, oldText, newText) => {
    const was = bankParts(oldText);
    const now = bankParts(newText);
    const entries = round(now.entries - was.entries);
    const catchups = round(now.catchups - was.catchups);
    const entriesHeld = !!catchup && date <= catchup;
    const catchupsHeld = !!catchup && date < catchup;
    return { held: round((entriesHeld ? entries : 0) + (catchupsHeld ? catchups : 0)), counts: round((entriesHeld ? 0 : entries) + (catchupsHeld ? 0 : catchups)) };
  };
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 7; c++) {
      if (gridDates[r][c] >= today) continue;
      const { held } = split(gridDates[r][c], oldCalendar[r][c], calendarData[r][c]);
      if (held !== 0) holdBank(gridDates[r][c], -held);
    }
  }
  if (oldHistory.length !== historyData.length) return;
  // (Oldest first: what counts moves that day's In Bank and every one after it)
  let shift = 0;
  for (let r = historyData.length - 1; r >= 1; r--) {
    for (let c = 0; c < 7; c++) {
      const text = String(historyData[r][c] ?? "");
      const header = text.split("\n")[0].trim();
      const date = header ? createSafeMidnight(header, true) : null;
      if (!date || isNaN(date.getTime())) continue;
      if (text !== String(oldHistory[r][c] ?? "")) shift = round(shift + split(date, oldHistory[r][c], text).counts);
      const inBank = shift !== 0 ? readInBank(text) : null;
      if (inBank === null) continue;
      const lines = text.split("\n");
      const moved = round(inBank + shift);
      lines[1] = `${moved < 0 ? "⛔️" : "✅"} ${formatMoney(moved)} In Bank`;
      historyData[r][c] = lines.join("\n");
    }
  }
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

// Work something out on another copy of the calendar (like the one a change started with, before its recurring entries
// came off), then put the page's back
function onCalendar(calendar, work) {
  const kept = calendarData;
  calendarData = calendar;
  try {
    return work();
  } finally {
    calendarData = kept;
  }
}

// Each Equity account's balance today, as the budget last worked it out: account row -> amount
function accountBalancesToday() {
  return new Map(accountRows().map(account => [account.index, parseAmount(account.row[1])]));
}

// After a change to History (worked out again: refreshBudgetData), each Equity account's balance today goes back to what
// it was (balances, from accountBalancesToday): its starting amount moves by the difference, so its entries stay as they
// are. An account with interest or escrow whose interest or escrow that would change (an entry moved after it started
// counting) starts counting again from today instead, like typing its balance does (accountEntry).
function keepAccountBalances(balances) {
  let moved = false;
  for (const summary of accountSummaries()) {
    const target = balances.get(summary.index);
    if (target === undefined || Math.abs(summary.today - target) < 0.005) continue;
    const row = accountsData.list[summary.index];
    const start = Math.round((summary.start - (summary.today - target)) * 100) / 100;
    row[3] = start ? formatMoney(start) : "";
    moved = true;
    if (!summary.interest && !summary.escrow) continue;
    const after = accountSummaries().find(account => account.index === summary.index);
    if (after && Math.abs(after.today - target) >= 0.005) {
      const rebased = Math.round((target - after.entriesToday) * 100) / 100;
      row[3] = rebased ? formatMoney(rebased) : "";
      // (The stretch of interest today is in still counts from its start: see interestPeriodStart)
      const periodStart = after.interest ? interestPeriodStart(after.interest, today) : null;
      row[5] = formatToMMDDYYYY(today);
      row[15] = periodStart && periodStart < today ? formatToMMDDYYYY(periodStart) : "";
      // (With Separate Interest, its interest balance is today's, and with escrow, so is what's due)
      if (after.interest?.separate) row[11] = formatMoney(after.owed ?? 0);
      if (after.escrow) row[14] = after.escrowDue > 0 ? formatMoney(after.escrowDue) : "";
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
    const { account, from } = splitAccount(title);
    const renamed = capitalize(withAccount(String(change.renameTo).trim(), account, from));
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
  // (Only its Placeholder switch changed, or the day it's deleted after)
  if (change.placeholder === true && change.until !== undefined) return `set ${title} on ${day(change.date)} to be deleted after ${change.until ? showDay(change.until) : "its own day"}`;
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

// New account (index null, from edit mode) or change the tapped one (see accountEntry). Its balance today is worked out
// from the calendar as it was before the change, recurring entries and all (see stripRecurringEntries).
function saveAccount(fields, index = null) {
  return runBudgetAction("", (before) => accountEntry(fields, index, JSON.parse(before.calendar)));
}

// Search bar. query: { terms: [{ title, match: "all" | "costs" | "gains" | "category" }], from, to, type (a refraction
// type, or "" for any), account (an Equity account's name, "none", or "" for any) }.
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

// An icon's id: the start of its key's SHA-256, the way the API names the icon a waiting entry came from
async function quickIconId(key) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(key)));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("").slice(0, ICON_ID_LENGTH);
}

// The ids of this device's own icons, newest first ([] when there are none, or they can't be read)
function ownQuickIcons() {
  try {
    const list = JSON.parse(localStorage.getItem(OWN_ICONS_KEY) || "[]");
    return Array.isArray(list) ? list.filter(id => typeof id === "string") : [];
  } catch (e) {
    return [];
  }
}

// Keep an icon's id as this device's own (it goes to the front, and the oldest past MAX_OWN_ICONS drop off)
async function rememberQuickIcon(key) {
  if (!key || !window.crypto || !crypto.subtle) return;
  try {
    const id = await quickIconId(key);
    const list = [id, ...ownQuickIcons().filter(known => known !== id)].slice(0, MAX_OWN_ICONS);
    localStorage.setItem(OWN_ICONS_KEY, JSON.stringify(list));
  } catch (e) {}
}

// queue: the waiting entries the budget loaded, from the API. A placeholder whose last day passed before the budget opened
// goes right away (like one on the calendar would, see quickPlaceholderPassed); this device's own are added now (one that
// can't be goes, and a note says why); the rest wait on Home.
async function holdQuickEntries(queue) {
  if (!Array.isArray(queue)) return;
  const own = new Set(ownQuickIcons());
  const passed = [];
  const mine = [];
  waitingQuickEntries = [];
  for (const quick of queue) {
    if (!quick || !quick.entry) continue;
    const date = createSafeMidnight(quick.entry.date, true);
    if (quickPlaceholderPassed(quick.entry, date)) passed.push(quick);
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

// A waiting quick entry that's a placeholder whose last day has passed (its own day, or the one picked for it, until:
// "YYYY-MM-DD"): it never joins the budget
function quickPlaceholderPassed(entry, date) {
  if (entry.placeholder !== true) return false;
  const until = typeof entry.until === "string" ? createSafeMidnight(entry.until, true) : null;
  return (until && !isNaN(until.getTime()) ? until : date) < today;
}

// A quick entry's Undo step (null for one without a real day)
function quickEntryUndo(quick) {
  const date = createSafeMidnight(quick.entry.date, true);
  return isNaN(date.getTime()) ? null : { label: `quick entry ${describeQuickEntry(quick.entry)}`, dates: [date] };
}

// "Coffee (-$4.50) on 10/05" (or "Card → Rewards (3%) on 10/05"), for the waiting list's notes and Undo
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
    placeholder: entry.placeholder === true && !quickPlaceholderPassed(entry, date),
    ...(entry.placeholder === true && typeof entry.until === "string" ? { until: createSafeMidnight(entry.until, true) } : {}),
    adding: true
  });
  formEntryRow[5] = "⚡ Quick Entry"; // Where "Move To" goes (quick entries never move)
  noteEntryPurpose(entry.title, entry.purpose, true); // (Picked on the Quick Entry page, or left out to stay as it is)
  addEntryNote(date, entry.title, landed.entryType, entry.note, true);
  addEntryReminder(date, entry.title, landed.entryType, typeof entry.remind === "number" ? entry.remind : null, true);
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
    if (logType !== "📥 Upload Backup") holdPastBank(snapshot);
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

  const changedTables = markChangedTables(snapshot);
  // What it did, for its Change Logs row's Undo (see CHANGE LOG UNDO)
  const record = notFound || NO_LOG_UNDO.includes(formEntryRow[2]) ? null : changeRecord(snapshot, changedTables, result.undid);
  delete result.undid;
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
  finishChangeLog(record); // (Saved with the rest, just below)
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

// Mark every table that differs from the snapshot as edited, so saveChanges() sends it. Returns their names (a Set).
function markChangedTables(snapshot) {
  const changed = new Set();
  for (const [name, table] of Object.entries(BUDGET_TABLES)) {
    if (JSON.stringify(table.get()) !== snapshot[name]) {
      table.markEdited();
      changed.add(name);
    }
  }
  return changed;
}

/* ---------- Change Logs (the spreadsheet's "Form Entries" tab) ---------- */
// Row: [time, duration, action, detail, detail, detail, detail, status ("" | "Not Found" | "Error"), what it changed (for
// its Undo), who made it (the account's username: the Change Logs page shows it while the budget is shared)]

// startedAt (performance.now() time): when the change was asked for, which is the row's time. finishChangeLog
// works out how long it took.
function beginChangeLog(type, startedAt = performance.now()) {
  changeLogStart = startedAt;
  hadError = false;
  notFound = false;
  formEntryRow = [formatLogTime(new Date(Date.now() - (performance.now() - startedAt))), "", type || "", "", "", "", ""];
}

// Finish the change's log row (how long it took, and its status) and add it, newest first. record: what the change did,
// for the row's Undo (changeRecord), or null for none.
function finishChangeLog(record = null) {
  formEntryRow[1] = ((performance.now() - changeLogStart) / 1000).toFixed(2) + " Seconds";
  const status = hadError ? "Error" : (notFound ? "Not Found" : "");
  logsData.splice(1, 0, [...formEntryRow.slice(0, 7), status, hadError ? "" : record || "", signedInName()]);
  if (logsData.length > MAX_LOG_ROWS + 1) logsData.length = MAX_LOG_ROWS + 1;
  trimLogUndo();
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

  aheadDaysCache = null; // (The 28 days after the calendar are worked out again when they're next looked at)
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
  updateAccountBalances(); // (Before the tracker, whose Interest row counts the interest it works out)
  updateTrackerTab();
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
//          until: a placeholder's last day (optional: a Date, or null for its own day; left out, it keeps the one it
//          had),
//          percent: a % amount instead of amount (see PERCENT_MARK): its percent (signed with "set"; "subtract" and "add"
//          sign it), or null for a plain amount; left out, an entry that has one keeps it unless its amount changes,
//          adding: true for a new entry (New Entry, Quick Entry), which a placeholder only joins as one if the entry
//          already there is one too }
function unique(entry) {
  // 1. Variables
  let rawTitle = String(entry.title || "").replace(/\s+/g, ' ').trim();
  let title = capitalize(rawTitle);
  if (!title) throw new BudgetInputError("Give the entry a title.");
  refuseSameAccount(title);

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
  // A % amount is its percent of the Equity account's balance on the day it goes on
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
  // Whether it's a placeholder, and until when (its ⏳ part, see placeholderUntil, or "" for none): as the change says (a
  // form's Placeholder switch and its last day: entry.until, a Date or null for its own day; left out, the one it had), or
  // as it was. A new entry added into one already there is a placeholder only if both are (entry.adding), keeping the
  // last day of the one there, and one moved onto a day that passed may be an ordinary entry (see writtenPlaceholder).
  let wasPart = isExisting ? placeholderPart(outData.oldSprite)
    : (isOriginalVirginRecurring || isMismatchedVirgin) ? placeholderPart(source.sprite) : "";
  let placeholder = entry.placeholder === undefined ? wasPart
    : !entry.placeholder ? "" : entry.until !== undefined ? placeholderUntil(entry.until) : (wasPart || PLACEHOLDER_MARK);
  if (entry.adding && (isExisting || isOriginalVirginRecurring || isMismatchedVirgin)) placeholder = placeholder && wasPart ? wasPart : "";
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
        injectOrDefer("set", dateObj, 0, title, blockerSprite, {}, placeholderPart(source.sprite));
      }
    } else if (hasOriginalCheckmark && source && (dateObj.getTime() !== dateMove.getTime() || action === "delete")) {
      // Only inject the blocker if the entry wasn't ALREADY a $0 blocker.
      if (outData.oldAmt !== 0) {
        let blockerSprite = getSpecialType(outData.oldSprite) + originalMark;
        injectOrDefer("set", dateObj, 0, title, blockerSprite, {}, placeholderPart(outData.oldSprite));
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
          // (Two entries become one there: a placeholder only if both were, keeping the last day of the one there, and a
          // plain amount)
          const destSprite = moveIsExisting ? moveOutData.oldSprite : moveBaseSprite;
          placeholder = placeholder && isPlaceholder(destSprite) ? placeholderPart(destSprite) : "";
          finalPercent = null;
        } else if (isOriginalVirginRecurring) {
          moveSprite = targetIncomingSpecial + virginMark;
        }
      } else {
        if (isOriginalVirginRecurring || (isExisting && hasOriginalCheckmark)) {
          moveSprite = targetIncomingSpecial + virginMark;
        }
      }
      // (A % entry needs its Equity account, and stays what it came to on a day that passed)
      if (finalPercent !== null && (dateMove < today || !linkedAccount(moveSprite || "❗️", title))) finalPercent = null;
      if (finalPercent !== null || percentOf(moveSprite) !== null) moveSprite = percentSprite(moveSprite, finalPercent);
      // 7. Inject combined result back into target date
      injectOrDefer("set", dateMove, moveAmt, title, moveSprite, {}, placeholder);
      if (writtenPlaceholder(placeholder, dateMove)) formEntryRow[3] += " (Placeholder)";
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
// placeholder, and until when (left out: as the entry there was, or as sprite says; on a day that passed, see
// writtenPlaceholder).
function injectOrDefer(action, dateObj, newAmt, title, sprite = "❗️", outData = {}, placeholder = undefined) {
  let notFound = true;
  let targetMMDD = formatToMMDD(dateObj);
  let cleanNewTitle = cleanString(String(title));
  // The sprite written for an entry that was there as oldSprite (or "" for a new one)
  // (placeholder: a ⏳ part, see placeholderUntil; true for the one the entry there or the one given has, or a plain ⏳;
  // false or "" for none; left out, as it was. On a day that passed, see writtenPlaceholder.)
  const marked = (newSprite, oldSprite) => {
    let part = placeholder;
    if (part === undefined || part === true) part = placeholderPart(oldSprite || sprite) || (part === true ? PLACEHOLDER_MARK : "");
    return placeholderSprite(newSprite, writtenPlaceholder(part, dateObj));
  };

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
// this title (and Equity account: "Payday → Savings") and refraction type ("" for Auto: any type), or a recurring or
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
// Two recurring entries can share a title only when their refraction type or Equity account is different: one Regular,
// one Hidden, and one Transfer can all be called Payday, and so can "Payday → Savings" and "Payday → HSA" (the account
// picked is part of the title, see cleanString), the same way a day has one entry per title and type. So it's always
// clear which recurring entry a day's entry came from. Making or changing one into a match for another is refused (the
// existing one gets changed instead), and so is renaming an Equity account when that would make two match (accountEntry).

const REFRACTION_NAMES = new Map([["❗️", "Regular"], ["✖️", "Hidden"], ["⭕️", "Transfer"]]);
const RECURRING_RULE = "Two recurring entries can't have the same title, refraction type, and Equity account";

// The row (other than exceptIndex) with this title (and Equity account) and refraction type, or -1
function recurringTwin(title, special, exceptIndex = -1) {
  let clean = cleanString(title);
  return recurringData.findIndex((row, i) => i >= 2 && i !== exceptIndex && String(row[0]).trim() !== "-" &&
    cleanString(row[0]) === clean && getSpecialType(String(row[5] || "")) === special);
}

// Refuse a recurring entry whose title, Equity account, and refraction type another one already has. kept: the entry
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

// Recurring entries that match an earlier one's title, Equity account, and refraction type, which can't be made here but
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

// Create a recurring entry (refused when one with its title, Equity account, and refraction type already exists).
// fields: { title, sprite: "✔️" | "✔️✖️" | "✔️⭕️", amount: number, percent (signed, for a % amount instead; see
//           PERCENT_MARK), frequency: "Every 2 Weeks" (blank = every month), startDate: Date | null (today), endDate:
//           Date | "None" | null, placeholder: every day it lands on gets a placeholder, until: how many days after each
//           of those days the placeholder is deleted (0 or left out: once its own day passes; see readPlaceholderDays) }
function recurring(fields) {
  let title = capitalize(String(fields.title || "").replace(/\s+/g, ' ').trim());
  if (!title) throw new BudgetInputError("Give the recurring entry a title.");
  refuseSameAccount(title);
  let sprite = placeholderSprite(String(fields.sprite || "").trim() || "✔️", fields.placeholder === true ? placeholderUntil(readPlaceholderDays(fields.until)) : false);
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

// Change the recurring entry that was clicked (every field comes from the edit panel). Its title, Equity account, and
// type together can't match another recurring entry's.
function editRecurringRow(index, fields) {
  let row = recurringData[index];
  if (!row || row[0] === "-" || !String(row[0]).trim()) {
    throw new BudgetInputError("That recurring entry couldn't be found. Please try again.");
  }
  let title = capitalize(String(fields.title || "").replace(/\s+/g, ' ').trim());
  if (!title) throw new BudgetInputError("Give the recurring entry a title.");
  refuseSameAccount(title);
  let hasAmount = typeof fields.amount === "number" && !isNaN(fields.amount);
  if (hasAmount && Math.abs(fields.amount) > MAX_AMOUNT) throw new BudgetInputError(AMOUNT_TOO_BIG);
  let sprite = String(fields.sprite || "").trim() || String(row[5] || "").trim() || "✔️";
  // (Its placeholder: as the form says, how many days after each day it lands on too, or as it was)
  sprite = placeholderSprite(sprite, fields.placeholder === undefined ? placeholderPart(row[5]) || false
    : fields.placeholder !== true ? false : fields.until !== undefined ? placeholderUntil(readPlaceholderDays(fields.until)) : (placeholderPart(row[5]) || true));
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

  // A new title, Equity account, or type takes the days that were changed for this entry along (moveRecurringTemps), and
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

  // Gains, Costs, Transfers, Interest, and Undefined are filled in automatically
  if (row && TRACKER_AUTO_ROWS.includes(cleanString(row[0]))) {
    formEntryRow[3] = "Changed: " + row[0];
    formEntryRow[4] = "Aliases: " + (describeAliases(row[4]) || "None");
    return {};
  }
  if (TRACKER_AUTO_ROWS.includes(cleanString(baseTitle))) {
    throw new BudgetInputError("Costs, Gains, Transfers, Interest, and Undefined fill in by themselves, so pick another title.");
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

/* ---------- Equity ---------- */
// Accounts outside the budget, like Savings. A Hidden or Transfer entry with the account picked ("Payday → Savings",
// see linkedAccount) moves money into or out of it (see accountChange):
//   - A Transfer moves money between the budget's account and this one, so the account gets the
//     opposite: a $100 Transfer cost takes $100 out of In Bank and puts $100 in the account.
//   - A Hidden entry happens in the account itself (In Bank never changes), so the account gets the
//     same amount: a $50 Hidden cost takes $50 out of it, and a $3,000 Hidden gain puts $3,000 in.
// An account's balance is its starting amount plus all of those changes, so changing, moving, or deleting one of
// its entries changes it too. Typing a balance on the Equity page changes the starting amount (no entry
// is made). An account can also get interest (a credit card, a loan, or savings that earn it), compounding and added
// how and when it says: see interestStepper; and escrow, like a mortgage's: see accountEscrow. accountsData.list: [0]
// column titles, then [name, balance today (filled in by updateAccountBalances, so the Quick Entry page can show it),
// "default" | "cash" | "", starting amount ("" is $0.00), interest rate (a year, in %; "" for none), the day interest
// and escrow started counting (MM/DD/YYYY), max, how interest compounds, every how many months it's added, the day of
// the month it's added, Separate Interest and its interest balance then (see accountInterest), escrow a month, its day,
// and what was due then (see accountEscrow), and the day interest counts from (see interestPeriodStart)].
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

// Every entry for an Equity account (account row index) on the calendar, in History, and in Upcoming, newest first (a
// day's own order kept): [{ date, line (as its day stores it), change (what the account gets, see accountChange), place:
// "calendar" | "history" | "upcoming" }]. A $0.00 blocker (which only keeps a recurring or spreadsheet entry off its day)
// isn't one.
function accountEntryLines(index) {
  const accounts = accountTitleMap();
  const found = [];
  eachEntryLine((text, line, date, place) => {
    const account = linkedAccount(line.sprite, line.title, accounts);
    if (account && account.index === index) found.push({ date, line: String(text).trim(), change: accountChange(line.sprite, line.amount), place });
    // (A Transfer from this account into another one)
    const from = account && line.fromOther ? fromAccount(line.sprite, line.title, accounts) : null;
    if (from && from.index === index) found.push({ date, line: String(text).trim(), change: line.amount, place });
  });
  return found.map((entry, order) => ({ ...entry, order })).sort((a, b) => b.date - a.date || a.order - b.order);
}

// Every entry on the calendar, in History, and in Upcoming: visit(its text as its day stores it, the same read with readLine,
// its day, "calendar" | "history" | "upcoming"). A $0.00 blocker (which only keeps a recurring or spreadsheet entry off its
// day) isn't one.
function eachEntryLine(visit) {
  const add = (text, date, place) => {
    const line = readLine(text);
    if (!line.title || line.system || isNaN(date.getTime())) return;
    if (line.amount === 0 && entryMark(line.sprite)) return;
    visit(text, line, date, place);
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
}

// Every entry with a title and refraction type (a recurring entry's days), newest first: [{ date, line (as its day stores
// it), place }]
function titleEntryLines(titleText, sprite) {
  const clean = cleanString(titleText);
  const special = getSpecialType(String(sprite || ""));
  const found = [];
  eachEntryLine((text, line, date, place) => {
    if (line.clean === clean && getSpecialType(line.sprite) === special) found.push({ date, line: String(text).trim(), place });
  });
  return found.map((entry, order) => ({ ...entry, order })).sort((a, b) => b.date - a.date || a.order - b.order);
}

// The interest added to the Equity accounts through today, from the day each one's started counting (see runInterest):
// [{ date, change, name (the account's) }], for the tracker's Interest row (updateAccountBalances fills it in)
let interestAdded = [];

// Each account's balance today goes in its row, and its changes still to come go with them (interest and escrow too,
// worked out with its changes after the calendar), and so does In Bank from today on (the Quick Entry page can't add up
// the budget itself)
function updateAccountBalances() {
  const lastDay = addDays(gridEndDate, 28);
  const coming = accountChangesAhead();
  interestAdded = [];
  const afterCalendar = new Map(); // Each account's changes after the calendar (by its name, as compared)
  for (const [name, day, change] of coming) {
    const date = createSafeMidnight(day, true);
    if (date <= gridEndDate) continue;
    const key = cleanString(name);
    if (!afterCalendar.has(key)) afterCalendar.set(key, []);
    afterCalendar.get(key).push({ date, change });
  }
  for (let summary of accountSummaries(today)) {
    accountsData.list[summary.index][1] = formatMoney(summary.today);
    const extras = accountExtras({ ...summary, entries: [...summary.entries, ...(afterCalendar.get(cleanString(summary.name)) || [])] }, lastDay);
    for (const credit of extras.credits) {
      if (credit.date > today) coming.push([summary.name, formatToYMD(credit.date), credit.change]);
      else interestAdded.push({ date: credit.date, change: credit.change, name: summary.name });
    }
    for (const paid of extras.escrow) {
      if (paid.date > today) coming.push([summary.name, formatToYMD(paid.date), paid.change]);
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

// A day's lines that change an Equity account: [{ account, change, sprite, title, amount (the entry's own) }] (see
// linkedAccount and accountChange; a Transfer from another account changes that one too, see fromAccount). accounts:
// accountTitleMap(), passed in by loops so it's built once.
function accountLineChanges(cellText, accounts = accountTitleMap()) {
  const changes = [];
  const lines = String(cellText ?? "").split("\n");
  for (let l = 1; l < lines.length; l++) {
    const line = readLine(lines[l]);
    if (!line.title || line.system) continue;
    const account = linkedAccount(line.sprite, line.title, accounts);
    const change = account ? accountChange(line.sprite, line.amount) : 0;
    if (account && change !== 0) changes.push({ account, change, sprite: line.sprite, title: line.title, amount: line.amount });
    const from = account && line.fromOther ? fromAccount(line.sprite, line.title, accounts) : null;
    if (from && line.amount !== 0) changes.push({ account: from, change: line.amount, sprite: line.sprite, title: line.title, amount: line.amount });
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

// The account an entry changes, or null: a Hidden or Transfer entry with an Equity account picked, which is kept
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
// from or to In Bank, or the Equity account it comes from), a Hidden entry its own amount (the money moved in the account
// itself). The API's readAccounts (src/quick.js) has to match it.
function accountChange(sprite, amount) {
  return getSpecialType(String(sprite || "")) === "⭕️" ? -amount : amount;
}

// The Equity account a Transfer comes from instead of In Bank ("Move ← Savings → HSA": Savings), or null: one that comes
// from In Bank, isn't a Transfer, or names an account that's gone. It plays In Bank's part: it changes by the entry's
// own amount (a -$100.00 Transfer from Savings to HSA takes $100.00 out of Savings and puts it in HSA), and In Bank
// doesn't change. accounts: accountTitleMap(), passed in by loops so it's built once.
function fromAccount(sprite, titleText, accounts = accountTitleMap()) {
  if (getSpecialType(String(sprite || "")) !== "⭕️") return null;
  const { account, from } = splitAccount(titleText);
  return account && from ? accounts.get(cleanString(from)) || null : null;
}

// Is it a Transfer from another Equity account (whether that account is still there or not)? Then it never changes In
// Bank: an account that was deleted just stops changing, like any entry for it.
function isFromOther(sprite, titleText) {
  if (getSpecialType(String(sprite || "")) !== "⭕️") return false;
  const { account, from } = splitAccount(titleText);
  return !!(account && from);
}

// Transfers move money between your own accounts (an Equity account's too), so they aren't costs or gains:
// the tracker only counts them in rows set to count transfers, Search starts them unchecked, and the
// recurring summary leaves them out. Hidden entries are costs and gains, even ones for an Equity account.
function isTransferEntry(sprite) {
  return getSpecialType(String(sprite || "")) === "⭕️";
}

// Each account's balance today, with the entries that changed it (and the ones on the calendar that will), newest
// first, and its interest and escrow (through interestUntil): [{ index, name, isDefault, start, interest (see
// accountInterest, or null), escrow (see accountEscrow, or null), entriesToday (its entries through today, added up),
// today, owed (with Separate Interest: the part of today's balance that's interest, see accountState), escrowDue (with
// escrow: what's still due today), entries: [{ date, change, sprite, title (its own, "" without one) }],
// interestCredits: [{ date, change }] oldest first, escrowPaid: [{ date, change (below $0) }] oldest first }].
// calendarStart: the calendar's first day (the daily update's is still the saved one's).
function accountSummaries(interestUntil = gridEndDate, calendarStart = gridStartDate) {
  let accounts = accountTitleMap();
  let summaries = new Map(accountRows().map(account => [account.index, {
    index: account.index,
    name: account.name,
    isDefault: isDefaultAccount(account.row),
    start: accountStart(account.row),
    interest: accountInterest(account.row),
    escrow: accountEscrow(account.row),
    entriesToday: 0,
    today: 0,
    entries: [],
    interestCredits: [],
    escrowPaid: []
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
    const extras = accountExtras(summary, interestUntil);
    summary.interestCredits = extras.credits;
    summary.escrowPaid = extras.escrow;
    summary.entriesToday = round(addUp(summary.entries, today));
    summary.today = round(summary.start + summary.entriesToday + addUp(summary.interestCredits, today) + addUp(summary.escrowPaid, today));
    // With Separate Interest, today's balance is in two parts: the interest owed (or earned) apart, and the rest. With
    // escrow, what's still due today.
    if (summary.interest?.separate || summary.escrow) {
      const now = runAccount(summary.start, summary.entries, summary.interest, summary.escrow, today).state;
      if (summary.interest?.separate) summary.owed = now.owed;
      if (summary.escrow) summary.escrowDue = now.escrowDue;
    }
    return summary;
  });
}

// How far ahead Equity looks ("In 6 Months")
const AHEAD_MONTHS = 6;

// The budget AHEAD_MONTHS from today: In Bank that day, and each Equity account's balance (its interest too). summaries:
// accountSummaries(). { inBank, accounts: Map(account row index -> balance) }
function budgetAhead(summaries) {
  const until = addMonths(today, AHEAD_MONTHS);
  const projection = projectBudget(until, summaries);
  return { inBank: projection.inBankOn(until), accounts: new Map(summaries.map(summary => [summary.index, projection.accountOn(summary.index, until)])) };
}

// The budget from today through until, a day at a time: the calendar's days as they are, and the days after it filled in
// the way the daily update will fill them (Upcoming entries, then recurring and connected spreadsheets' entries; see
// dayAfterCalendar). summaries: accountSummaries(), when the caller has them. Returns { until, summaries, inBank: [{ date,
// amount }] (In Bank at the end of each day, today first), inBankOn(date), accountOn(index, date) (an Equity account's
// balance at the end of date, its interest and escrow too; index: its row), interestBetween(index, from, to) (the
// interest it gets after from, through to: below $0 is interest paid), accountParts(index) (what its balance comes from:
// { start, interest, escrow, entries }, to work it out again with more entries, see accountExtras) }. Days after until
// count as until.
function projectBudget(until, summaries = accountSummaries()) {
  percentBasesThrough(until);
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
    for (const { account, change, sprite, title, amount } of accountLineChanges(text, accounts)) coming.get(account.index)?.push({ date: day, change, sprite, title, amount, coming: true });
  }
  const byIndex = new Map(summaries.map(summary => {
    const entries = [...summary.entries, ...(coming.get(summary.index) || [])];
    const parts = { start: summary.start, interest: summary.interest, escrow: summary.escrow, entries };
    const extras = accountExtras(parts, until);
    return [summary.index, { ...parts, credits: extras.credits, escrowPaid: extras.escrow }];
  }));
  const round = (amount) => Math.round(amount * 100) / 100;
  // (An account's changes in day order, with the total after each, so its balance on any day is one quick lookup: a graph asks
  // for thousands)
  const changesOf = (account) => {
    if (!account.changes) {
      let total = 0;
      const items = [...account.entries, ...account.credits, ...account.escrowPaid].sort((a, b) => a.date - b.date);
      account.changes = { times: items.map(item => item.date.getTime()), totals: items.map(item => (total += item.change)) };
    }
    return account.changes;
  };
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
      if (!account) return 0;
      const { times, totals } = changesOf(account);
      const time = date.getTime();
      let low = 0;
      let high = times.length;
      while (low < high) {
        const middle = (low + high) >> 1;
        if (times[middle] <= time) low = middle + 1;
        else high = middle;
      }
      return round(account.start + (low > 0 ? totals[low - 1] : 0));
    },
    interestBetween(index, from, to) {
      const account = byIndex.get(index);
      return account ? round(account.credits.reduce((total, credit) => (credit.date > from && credit.date <= to ? total + credit.change : total), 0)) : 0;
    },
    accountParts(index) {
      const account = byIndex.get(index);
      return account ? { start: account.start, interest: account.interest, escrow: account.escrow, entries: account.entries } : null;
    }
  };
}

// An account's starting amount (its row's [3]; blank is $0.00)
function accountStart(row) {
  const text = String(row?.[3] ?? "").trim();
  return text ? Math.round(parseAmount(text) * 100) / 100 : 0;
}

// The kinds of account, and the ones that are money owed: a balance paid past $0 earns nothing there (a lender doesn't pay
// interest on an overpayment). A row's [16]; blank is any other kind.
const ACCOUNT_KIND_KEYS = ["car", "mortgage", "credit", "debit"];
const DEBT_KINDS = ["car", "mortgage", "credit"];
const accountKind = (row) => (ACCOUNT_KIND_KEYS.includes(String(row?.[16] ?? "").trim()) ? String(row[16]).trim() : "other");

// An account's interest: { rate (a year, in %), since (the day it started counting), from (the day the interest it gets
// next counts from: since, or for a balance typed again between the days interest is added, the last of those days
// before it, the way a bank adds a stretch's interest at its end, on the balances it had; see interestPeriodStart),
// compound (how often it earns interest of its own: a key of INTEREST_COMPOUNDING), every (months between the days it's
// added: INTEREST_EVERY), day (the day of the month it's added, 1 to 31: a shorter month's last day for one past it),
// separate (Separate Interest: the interest added is kept apart from the balance, like a mortgage's, see accountState),
// owed (with separate, the interest balance on the day it started counting), debt (it's a kind that's money owed, see
// DEBT_KINDS) }, or null when it has none. Its row's [4],
// [5], [7], [8], [9], [10], [11], and [15]; blank ones are monthly, every month, the day of the month it started
// counting, not separate, and counting from since.
const MAX_INTEREST_RATE = 1000;
const MAX_PERIOD_DAYS = 370; // The longest stretch between the days interest is added (a year), with some room
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
  const separate = String(row?.[10] ?? "").trim() === "separate";
  const fromText = String(row?.[15] ?? "").trim();
  const from = fromText ? createSafeMidnight(fromText, true) : null;
  return {
    rate,
    since,
    from: from && !isNaN(from.getTime()) && from < since && getDayDifference(since, from) <= MAX_PERIOD_DAYS ? from : since,
    compound: Object.prototype.hasOwnProperty.call(INTEREST_COMPOUNDING, compoundText) ? compoundText : "monthly",
    every: INTEREST_EVERY.includes(every) ? every : 1,
    day: Number.isInteger(day) && day >= 1 && day <= 31 ? day : since.getDate(),
    separate,
    owed: separate ? Math.round(parseAmount(row?.[11]) * 100) / 100 : 0,
    debt: DEBT_KINDS.includes(accountKind(row))
  };
}

// An account's escrow, like a mortgage's (the part of each month's payment the lender keeps to pay the home's property
// taxes and insurance): { amount (due each month, above $0), day (the day of the month it's due, 1 to 31: a shorter
// month's last day for one past it), since (the day it started counting: the row's [5], which its interest shares), due
// (what was still due then) }, or null for none. Its row's [12], [13], and [14]. Each month on its day the amount comes
// due, and money put into the account pays it after the interest owed and before the rest (see accountState), so the
// balance only goes down by what's left, the way a mortgage's principal does.
function accountEscrow(row) {
  const amountText = String(row?.[12] ?? "").trim();
  const amount = Math.round(parseAmount(amountText) * 100) / 100;
  const sinceText = String(row?.[5] ?? "").trim();
  const since = sinceText ? createSafeMidnight(sinceText, true) : null;
  if (!amountText || !(amount > 0) || amount > MAX_AMOUNT || !since || isNaN(since.getTime())) return null;
  const day = Number(row?.[13]);
  const due = Math.round(parseAmount(row?.[14]) * 100) / 100;
  return { amount, day: Number.isInteger(day) && day >= 1 && day <= 31 ? day : since.getDate(), since, due: due > 0 ? Math.min(due, MAX_AMOUNT) : 0 };
}

// Is day an escrow's day of the month (a shorter month's last day for one past it)?
function isEscrowDay(day, escrow) {
  const last = new Date(day.getFullYear(), day.getMonth() + 1, 0).getDate();
  return day.getDate() === Math.min(escrow.day, last);
}

// An account's escrow in words, for Change Logs: "$412.50 a month, due on day 1"
function describeEscrow(escrow) {
  return `${formatMoney(escrow.amount)} a month, due on day ${escrow.day}`;
}

// An account's balance as it's worked out a day at a time (see runAccount), from its starting amount (start, everything
// in it), in parts: base (what earns interest), owed (with Separate Interest, interest.separate: the interest added, kept
// apart from the rest, below $0 when it's owed or above it when it's earned; only the rest earns interest, like a
// mortgage), and escrowDue (escrow due and not paid yet). total is the balance: base and owed together. Entries on or
// before the day it started counting were already in the balance typed then. After it, a payment toward it pays the
// interest owed first (an entry the other way from what's owed: money put in for a loan, or taken out of savings that
// earned it); then money put in pays the escrow due, which leaves the account; and the rest goes to the base.
// { base, owed, escrowDue, total, entry(change, date) (gives back the escrow it paid: 0 for none), credit(change) (the
// interest added), dueEscrow(amount) (a month's escrow comes due) }
function accountState(start, interest, escrow = null) {
  const separate = !!interest?.separate;
  const round = (amount) => Math.round(amount * 100) / 100;
  let owed = separate ? interest.owed : 0;
  let rest = round(start - owed);
  let escrowDue = escrow ? escrow.due : 0;
  return {
    get base() { return rest; },
    get owed() { return owed; },
    get escrowDue() { return escrowDue; },
    get total() { return round(rest + owed); },
    entry(change, date) {
      let left = change;
      if (separate && date > interest.since) {
        const toward = owed < 0 && left > 0 ? Math.min(left, -owed) : owed > 0 && left < 0 ? -Math.min(-left, owed) : 0;
        owed = round(owed + toward);
        left = round(left - toward);
      }
      let paid = 0;
      if (escrow && date > escrow.since && left > 0 && escrowDue > 0) {
        paid = Math.min(left, escrowDue);
        escrowDue = round(escrowDue - paid);
        left = round(left - paid);
      }
      rest = round(rest + left);
      return paid;
    },
    credit(change) {
      if (separate) owed = round(owed + change);
      else rest = round(rest + change);
    },
    dueEscrow(amount) {
      escrowDue = round(escrowDue + amount);
    }
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

// An account's interest in words, for Change Logs: "24.99% a year, compounding daily, added every month on day 15" (", kept
// separate" with Separate Interest)
function describeInterest(interest) {
  const compounding = interest.compound === "simple" ? "not compounding" : `compounding ${interest.compound}`;
  const every = interest.every === 1 ? "every month" : interest.every === 12 ? "every year" : `every ${interest.every} months`;
  return `${interest.rate}% a year, ${compounding}, added ${every} on day ${interest.day}${interest.separate ? ", kept separate" : ""}`;
}

// An account's interest, worked out a day at a time from the day after it counts from (interest.from: the day it started
// counting, since, or the start of the stretch that day was in). step(day, balance) takes each day in order with the
// account's balance at its start (its starting amount, its entries before that day, and the interest added before it),
// and gives back the interest added to it that day, to the cent (0 on most days):
//   - It's added on interest.day every interest.every months, counting that day of the month from the first one after
//     it counts from: first on the interest.every-th of them (every month: the first one itself, every 3 months: the
//     third), then every interest.every months
//   - "daily": every day earns a 365th of the yearly rate, on the balance and the interest earned since it was last
//     added
//   - "simple": every day earns a 365th of the yearly rate, on the balance without any interest added to it
//   - "monthly", "quarterly", "yearly": every 1, 3, or 12 months on that day of the month (counted the same way), the
//     balance that morning and the interest earned since it was last added earn that many twelfths of the yearly rate
//     (a first stretch shorter than that earns a 365th a day)
//   - Up to since (a stretch that started before the balance was typed again), it earns the same way, but interest added
//     on one of its days was in the balance typed then, so it isn't added again (what was earned before it goes with it)
// So a balance below $0 (money owed, like a credit card's) goes further below, and one above $0 grows. isAddDay(day):
// is it one of the days interest is added? pay(change): money went in or out of the balance, and pays down the interest
// added so far first ("simple" counts only the rest of the balance as earning), the way a lender applies a payment.
function interestStepper(interest) {
  const rate = interest.rate; // (% a year: a dollar earns rate cents a year)
  const months = INTEREST_COMPOUNDING[interest.compound];
  const from = interest.from || interest.since;
  // The day it's added in a month (counted in months from the year 0)
  const dayIn = (month) => {
    const year = Math.floor(month / 12);
    const last = new Date(year, month % 12 + 1, 0).getDate();
    return new Date(year, month % 12, Math.min(interest.day, last));
  };
  const fromMonth = from.getFullYear() * 12 + from.getMonth();
  const firstMonth = dayIn(fromMonth) > from ? fromMonth : fromMonth + 1;
  // Is day one of the days every `step` months, from the first one?
  const isEvery = (day, step) => {
    const month = day.getFullYear() * 12 + day.getMonth() - (firstMonth + step - 1);
    return month >= 0 && month % step === 0 && day.getTime() === dayIn(day.getFullYear() * 12 + day.getMonth()).getTime();
  };
  let earned = 0;            // Interest earned and not added yet, in cents
  let added = 0;             // Interest added so far
  let lastWorkedOut = from;  // ("monthly", "quarterly", "yearly") The day interest was last worked out
  return {
    step(day, balanceToday) {
      if (day <= from) return 0;
      // (A debt paid past $0 earns nothing)
      const owing = (amount) => (interest.debt ? Math.min(amount, 0) : amount);
      const balance = owing(balanceToday);
      if (months === 0) earned += (balance + earned / 100) * rate / 365;
      // (With Separate Interest, the balance given has no interest added to it already)
      else if (months === null) earned += owing(balanceToday - (interest.separate ? 0 : added)) * rate / 365;
      else if (isEvery(day, months)) {
        const full = day >= addMonths(lastWorkedOut, months);
        earned += (balance + earned / 100) * rate * (full ? months : Math.round((day - lastWorkedOut) / 86400000) * 12 / 365) / 12;
        lastWorkedOut = day;
      }
      if (!isEvery(day, interest.every)) return 0;
      const change = Math.round(earned) / 100;
      earned = 0;
      if (day <= interest.since) return 0; // (In the balance typed then)
      added += change;
      return change;
    },
    isAddDay: (day) => isEvery(day, interest.every),
    pay(change) {
      if (added < 0 && change > 0) added = Math.min(0, added + change);
      else if (added > 0 && change < 0) added = Math.max(0, added + change);
    }
  };
}

// The day an account's interest stretch started, as of day: the last day on or before it that interest was added, or
// the day it counts from when none has come since (so typing its balance again on day loses none of that stretch)
function interestPeriodStart(interest, day) {
  const stepper = interestStepper(interest);
  const from = interest.from || interest.since;
  for (let at = day; at > from; at = addDays(at, -1)) {
    if (stepper.isAddDay(at)) return at;
  }
  return from;
}

// The last time a day of the month (a shorter month's last day for one past it) came, on or before date: where the
// interest of an account that's new to the budget counts from, since its next statement adds that whole stretch's
// interest (an account added on the 4th with interest added on the 1st has counted since the 1st)
function lastMonthDay(dayOfMonth, date) {
  const inMonth = (year, month) => new Date(year, month, Math.min(dayOfMonth, new Date(year, month + 1, 0).getDate()));
  const thisMonth = inMonth(date.getFullYear(), date.getMonth());
  return thisMonth <= date ? thisMonth : inMonth(date.getFullYear(), date.getMonth() - 1);
}

// An account worked out a day at a time (see runAccount): day(date) adds that day's interest and escrow due, before the
// day's entries, and gives back the interest added; entry(change, date) puts an entry in and gives back the escrow it
// paid; state: its balance in parts (accountState)
function accountRunner(start, interest, escrow) {
  const stepper = interest ? interestStepper(interest) : null;
  const state = accountState(start, interest, escrow);
  return {
    state,
    day(date) {
      let change = 0;
      if (stepper) {
        change = stepper.step(date, state.base);
        if (change !== 0) state.credit(change);
      }
      if (escrow && date > escrow.since && isEscrowDay(date, escrow)) state.dueEscrow(escrow.amount);
      return change;
    },
    entry(change, date) {
      if (stepper && date > interest.since) stepper.pay(change);
      return state.entry(change, date);
    }
  };
}

// An account's interest and escrow through until, from the day after they count from, with its starting amount and its
// entries ([{ date, change }]): { credits: [{ date, change }] (its interest, oldest first), escrow: [{ date, change }]
// (what its payments paid in escrow, which left the account: each below $0, oldest first), runner (ready for the day
// after until, see accountRunner), state (its balance at the end of until, see accountState) }. Typing the account's
// balance or changing its interest or escrow starts them counting again from that day (accountEntry), so nothing counts
// twice.
function runAccount(start, entries, interest, escrow, until) {
  const ordered = [...entries].sort((a, b) => a.date - b.date);
  const runner = accountRunner(start, interest, escrow);
  const credits = [];
  const paid = [];
  let counted = 0; // Entries added into the balance so far
  const put = (entry) => {
    const escrowPaid = runner.entry(entry.change, entry.date);
    if (escrowPaid > 0) paid.push({ date: entry.date, change: -escrowPaid });
  };
  const starts = [interest && (interest.from || interest.since), escrow && escrow.since].filter(Boolean);
  if (starts.length > 0) {
    const first = starts.reduce((a, b) => (a < b ? a : b));
    for (let day = addDays(first, 1); day <= until; day = addDays(day, 1)) {
      while (counted < ordered.length && ordered[counted].date < day) put(ordered[counted++]);
      const change = runner.day(day);
      if (change !== 0) credits.push({ date: day, change });
    }
  }
  // (Entries on until itself, after its interest and escrow)
  while (counted < ordered.length && ordered[counted].date <= until) put(ordered[counted++]);
  return { credits, escrow: paid, runner, state: runner.state };
}

// What changes an account's balance besides its entries, through until (see runAccount): { credits (its interest), escrow
// (what its payments paid in escrow) }, both empty for an account with neither. parts: { start, interest, escrow,
// entries }
function accountExtras(parts, until) {
  if (!parts || (!parts.interest && !parts.escrow)) return { credits: [], escrow: [] };
  const run = runAccount(parts.start, parts.entries, parts.interest, parts.escrow, until);
  return { credits: run.credits, escrow: run.escrow };
}

// The interest an account gets through until (see runAccount): [{ date, change }], oldest first
function interestCredits(start, entries, interest, until) {
  return runAccount(start, entries, interest, null, until).credits;
}

/* ---------- Paying a balance off (the Debt Calculator) ---------- */
// How long paying off a balance owed takes (a loan, a credit card), with interest worked out the way an Equity account's
// is (interestStepper): the same payment on a schedule from a first payment day, and what paying more does. For an
// Equity account, its own pace too, from the budget (accountPayoff).

// How often payments come: days apart, or null for every month (on the first payment's day of the month)
const PAYMENT_FREQUENCIES = { weekly: 7, biweekly: 14, monthly: null };
const PAYOFF_YEARS = 50;         // The longest a payoff is worked out for
const ACCOUNT_PAYOFF_YEARS = 10; // How far ahead an account's own pace is looked at (like Equity's window on Bob's page)

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
  const stepper = interest ? interestStepper({ ...interest, since: from, from }) : null;
  const days = new Set(paymentDays(first, frequency, until).map(day => day.getTime()));
  const yearIn = addMonths(first, 12);
  const schedule = [];
  let balance = -owed; // (Money owed is below $0, like an Equity account's)
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
    stepper?.pay(amount);
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

// An Equity account's own pace back up to $0 from below (its row index), from today: its entries, the ones the budget
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
    const extras = accountExtras({ ...parts, entries }, until);
    const events = [...entries, ...extras.escrow, ...extras.credits.map(credit => ({ ...credit, interest: true }))].sort((a, b) => a.date - b.date);
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
// to keep it), interest ({ rate (a year in %), compound, every, day, separate (see accountInterest; each left out is the
// default) }, or null for none; leave it out to keep it), owed (with Separate Interest: today's interest balance, apart
// from balance; leave it out to keep it), max (the most it can hold, like a credit card's limit: a number, or null for
// none; leave it out to keep it), escrow ({ amount (each month), day (of the month it's due; left out: the day interest
// is added, or today's) }, or null for none; leave it out to keep it), kind ("car", "mortgage", "credit", "debit", or
// "other"; leave it out to keep it) }. A new name goes on its entries and tracker
// aliases too, so they stay with it. A balance sets the starting amount so today's balance comes out to it (the entries
// stay as they are). A new balance, new interest, or new escrow starts interest and escrow counting from today, with the
// interest so far kept in today's balance (with Separate Interest, in its interest balance; turned off, that goes into
// the balance), the stretch of interest it's in still counting from its start (interestPeriodStart), and the escrow
// still due kept.
// calendar: the calendar as it was before the change. While a change runs, the entries that land by themselves (a
// recurring transfer into the account today, say) are off it, and today's balance has to count them.
function accountEntry(fields, index, calendar = calendarData) {
  let name = capitalize(String(fields.name || "").replace(/\s+/g, " ").trim());
  let clean = cleanString(name);
  if (!clean) throw new BudgetInputError("Give the account a name, like Cash or Investments.");
  if (name.length > MAX_ACCOUNT_NAME) throw new BudgetInputError(`Account names can be up to ${MAX_ACCOUNT_NAME} characters.`);
  // The arrow is what goes between an entry's title and its account ("Payday → Savings")
  if (hasTitleArrow(name)) throw new BudgetInputError(`Account names can't have ${ACCOUNT_ARROW} or ${FROM_ARROW} in them.`);

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
  // Separate Interest (only with interest): as the form says, or as it was
  const separate = rate === undefined ? !!oldInterest?.separate : !!rate && !!fields.interest?.separate;
  let owed = fields.owed === undefined || fields.owed === null ? null : Math.round(Number(fields.owed) * 100) / 100;
  if (owed !== null && (!Number.isFinite(owed) || Math.abs(owed) > MAX_AMOUNT)) throw new BudgetInputError("Enter the interest balance, like 512.40 (Negative for interest owed).");
  const separateColumns = (interestOwed) => (separate ? ["separate", formatMoney(interestOwed)] : ["", ""]);
  // Escrow: as the form says, or as it was
  const oldEscrow = row ? accountEscrow(row) : null;
  let escrow = fields.escrow === undefined ? (oldEscrow ? { amount: oldEscrow.amount, day: oldEscrow.day } : null) : fields.escrow;
  if (escrow) {
    const amount = Math.round(Number(escrow.amount) * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) throw new BudgetInputError("Enter the escrow due each month, like 412.50 (up to $1,000,000,000), or turn Escrow off.");
    const day = escrow.day === undefined || escrow.day === null ? (settings ? settings.day : oldInterest ? oldInterest.day : today.getDate()) : Number(escrow.day);
    if (!Number.isInteger(day) || day < 1 || day > 31) throw new BudgetInputError("Pick the day of the month the escrow is due.");
    escrow = { amount, day };
  }
  const escrowChanged = !!escrow !== !!oldEscrow || (!!escrow && (escrow.amount !== oldEscrow.amount || escrow.day !== oldEscrow.day));
  const escrowColumns = (due) => (escrow ? [formatMoney(escrow.amount), String(escrow.day), due > 0 ? formatMoney(due) : ""] : ["", "", ""]);
  const kindColumn = fields.kind === undefined ? undefined : ACCOUNT_KIND_KEYS.includes(fields.kind) ? fields.kind : "";

  formEntryRow[3] = "Account: " + name;
  formEntryRow[4] = "";
  formEntryRow[5] = "";
  if (isNew) {
    const interestOwed = separate ? owed ?? 0 : 0;
    const total = Math.round(((balance || 0) + interestOwed) * 100) / 100;
    // (Its interest counts from the last day it was added, see lastMonthDay)
    const periodStart = settings ? lastMonthDay(settings.day, today) : null;
    const row = [name, formatMoney(total), "", total ? formatMoney(total) : "", rate ? String(rate) : "", rate || escrow ? formatToMMDDYYYY(today) : "", maxText,
      ...(settings ? settings.columns : ["", "", ""]), ...separateColumns(interestOwed), ...escrowColumns(0), periodStart && periodStart < today ? formatToMMDDYYYY(periodStart) : "", kindColumn ?? ""];
    list.push(row);
    formEntryRow[2] = "🏦 New Account";
    if (balance || interestOwed) formEntryRow[5] = "Balance: " + formatMoney(balance || 0) + (separate ? ` and ${formatMoney(interestOwed)} in interest` : "");
    if (rate) formEntryRow[6] = `Interest: ${describeInterest(accountInterest(row))}`;
    if (escrow) formEntryRow[6] = [formEntryRow[6], `Escrow: ${describeEscrow(escrow)}`].filter(Boolean).join(", ");
    if (maxText) formEntryRow[6] = [formEntryRow[6], `Max: ${maxText}`].filter(Boolean).join(", ");
    return {};
  }
  // (Its balance today, worked out before a new name goes on its entries: the calendar from before the change still has
  // the old one)
  const summary = onCalendar(calendar, () => accountSummaries().find(account => account.index === index));
  let oldName = String(row[0]).trim();
  if (cleanString(oldName) !== clean) {
    refuseRecurringClash(cleanString(oldName), oldName, name);
    renameAccountEntries(cleanString(oldName), name);
    formEntryRow[4] = "Renamed From: " + oldName;
  }
  row[0] = name;
  if (kindColumn !== undefined) row[16] = kindColumn;
  formEntryRow[2] = "🏦 Change Account";
  const now = summary ? summary.today : 0;
  // (With Separate Interest, today's balance is in two parts: the interest balance, and the rest, which the form's Balance
  // is)
  const nowOwed = oldInterest?.separate ? summary?.owed ?? 0 : 0;
  const nowRest = Math.round((now - nowOwed) * 100) / 100;
  const oldRate = oldInterest ? oldInterest.rate : 0;
  const newRate = rate === undefined ? oldRate : rate;
  // (A kind that's money owed earns nothing past $0, so a change of that counts as a change to its interest)
  const debtChanged = !!oldInterest && kindColumn !== undefined && DEBT_KINDS.includes(kindColumn) !== oldInterest.debt;
  const interestChanged = newRate !== oldRate || separate !== !!oldInterest?.separate || debtChanged || (!!settings && !!oldInterest && ["compound", "every", "day"].some(key => settings[key] !== oldInterest[key]));
  const targetOwed = separate ? owed ?? nowOwed : 0;
  const targetRest = balance ?? (separate ? nowRest : now);
  const balanceChanged = balance !== null && Math.abs((separate && oldInterest?.separate ? nowRest : now) - balance) >= 0.005 || (separate && Math.abs(targetOwed - nowOwed) >= 0.005);
  // (Its settings written out in full: the day it's added stays put when interest starts counting again from today)
  if (oldInterest) [row[7], row[8], row[9]] = interestSettings(oldInterest, oldInterest.day).columns;
  if (newRate && settings) [row[7], row[8], row[9]] = settings.columns;
  if (balanceChanged || interestChanged || escrowChanged) {
    // Today's balance is the one typed (or stays what it is, interest so far and all), and interest and escrow count
    // from today
    const target = balanceChanged ? Math.round((targetRest + targetOwed) * 100) / 100 : now;
    const start = Math.round((target - (summary ? summary.entriesToday : 0)) * 100) / 100;
    row[3] = start ? formatMoney(start) : "";
    row[4] = newRate ? String(newRate) : "";
    row[5] = newRate || escrow ? formatToMMDDYYYY(today) : "";
    if (!newRate) [row[7], row[8], row[9]] = ["", "", ""];
    // (Turned on with nothing typed, the interest balance starts at $0.00, or what it already was)
    [row[10], row[11]] = newRate ? separateColumns(balanceChanged ? targetOwed : nowOwed) : ["", ""];
    // (Escrow still due stays due; turned on, none is due yet)
    [row[12], row[13], row[14]] = escrowColumns(escrow && oldEscrow ? summary?.escrowDue ?? 0 : 0);
    // (The stretch of interest today is in still counts from its start; turned on, from the last day it was added)
    const periodStart = !newRate ? null : oldInterest ? interestPeriodStart(oldInterest, today) : lastMonthDay(settings ? settings.day : today.getDate(), today);
    row[15] = periodStart && periodStart < today ? formatToMMDDYYYY(periodStart) : "";
    if (balanceChanged) {
      formEntryRow[5] = separate
        ? `Balance: ${formatMoney(targetRest)} and ${formatMoney(targetOwed)} in interest (was ${formatMoney(now)} in all)`
        : `Balance: ${formatMoney(target)} (was ${formatMoney(now)})`;
    }
    if (interestChanged) formEntryRow[6] = newRate ? `Interest: ${describeInterest(accountInterest(row))}` : "Interest: Off";
    if (escrowChanged) formEntryRow[6] = [formEntryRow[6], escrow ? `Escrow: ${describeEscrow(escrow)}` : "Escrow: Off"].filter(Boolean).join(", ");
  }
  if (max !== undefined && maxText !== String(row[6] ?? "").trim()) {
    row[6] = maxText;
    formEntryRow[6] = [formEntryRow[6], `Max: ${maxText || "None"}`].filter(Boolean).join(", ");
  }
  return {};
}

// An entry's title with its Equity account's new name ("Payday → Savings" -> "Payday → Rainy Day", and "Move ← Savings →
// HSA" -> "Move ← Rainy Day → HSA"), or null when the entry isn't for that account (oldClean: the account's old name, as
// compared)
function renamedAccountTitle(sprite, text, oldClean, newName) {
  let special = getSpecialType(String(sprite || ""));
  if (special !== "✖️" && special !== "⭕️") return null;
  const { title, account, from } = splitAccount(text);
  const toIt = !!account && cleanString(account) === oldClean;
  const fromIt = !!account && !!from && cleanString(from) === oldClean;
  return toIt || fromIt ? withAccount(title, toIt ? newName : account, fromIt ? newName : from) : null;
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
    let sprite = placeholderSprite(combineSprites(first[0], parts[0]), mergedPlaceholder(first[0], parts[0]));
    kept[at] = `${sprite} ${formatMoney(parseAmount(first[1]) + parseAmount(parts[1]))} ${first.slice(2).join(" ")}`;
  }
  return kept;
}

// The same for Upcoming: entries on one day with the same title (its Equity account too) and type become one, whatever
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
      same[3] = decoratedSprite(combineSprites(same[3], row[3]), { placeholder: mergedPlaceholder(same[3], row[3]) });
      continue;
    }
    byKey.set(key, row);
    kept.push(row);
  }
  futureData = kept;
}

/* ---------- Goals (Bob's Goals card) ---------- */
// A goal is an amount for an Equity account, In Bank, or the Total (In Bank and every Equity account together, like Equity
// accounts' Total today) to reach, by a day if it has one, with a title of its own if it has one. A credit card's can be
// to climb from below $0 to $0 (paid off) or more. A % goal is that percent of what it's for on the day it's set, and
// stays that amount (its percent is kept to show it). Bob's page lists them with how far along each one is, and works
// out what reaching each one takes (Bob Page.js). They're kept with the Equity accounts (accountsData.goals): [{ title
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
  if (!["inBank", "total", "account"].includes(kind)) throw new BudgetInputError("Pick what it's for: In Bank, the Total, or one of your Equity accounts.");
  let account = "";
  if (kind === "account") {
    const found = accountRows().find(known => known.clean === cleanString(fields.account));
    if (!found) throw new BudgetInputError("Pick one of your Equity accounts.");
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
      if (balance === null) throw new BudgetInputError("A % goal is a percent of what it's for, so pick an Equity account, In Bank, or Total.");
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

// Take a goal out of the list (its change log row says which one it was)
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

// The cards with a Warnings switch (Wavelength Planning never needs a look). With it on (and the card on), what the card
// says when it needs a look shows on Bob's card on Home, which moves over the calendar until it's okayed (for the rest
// of that day): accountsData.bob.warnings, the ids of the cards whose Warnings are on, and okayed, the day they were
// okayed (MM/DD/YYYY), each left out without one.
const BOB_WARNING_CARDS = [...BOB_CARDS.keys()].filter(id => id !== "purposes");

// The stored settings, checked: { cards, purposes, wavelengths (only when they aren't the defaults), warnings, okayed
// (each only when there's one) }, or null with nothing stored (and no goals)
function normalizeBob(stored, hasGoals) {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return hasGoals ? { cards: ["goals"], purposes: {} } : null;
  const cards = Array.isArray(stored.cards) ? [...BOB_CARDS.keys()].filter(id => stored.cards.includes(id)) : [];
  const warnings = Array.isArray(stored.warnings) ? BOB_WARNING_CARDS.filter(id => stored.warnings.includes(id)) : [];
  const okayed = typeof stored.okayed === "string" && /^\d{2}\/\d{2}\/\d{4}$/.test(stored.okayed) ? stored.okayed : "";
  const extras = { ...(warnings.length > 0 ? { warnings } : {}), ...(okayed ? { okayed } : {}) };
  const wavelengths = normalizeWavelengths(stored.wavelengths);
  const known = new Set((wavelengths || DEFAULT_WAVELENGTHS).map(wave => wave.id));
  const purposes = {};
  const kept = stored.purposes && typeof stored.purposes === "object" && !Array.isArray(stored.purposes) ? stored.purposes : {};
  for (const [key, purpose] of Object.entries(kept).slice(0, MAX_PURPOSES)) {
    // (A "__proto__" key would replace the object's prototype instead of adding a title)
    if (key !== "__proto__" && key.length <= MAX_ENTRY_TITLE && known.has(purpose)) purposes[key] = purpose;
  }
  return wavelengths ? { cards, purposes, wavelengths, ...extras } : { cards, purposes, ...extras };
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

// Are this card's Warnings on (and the card)? (see BOB_WARNING_CARDS)
function bobWarningOn(id) {
  return bobCardOn(id) && !!accountsData?.bob?.warnings?.includes(id);
}

// A card's Warnings switch
function turnBobWarning(id, on) {
  return runBudgetAction("💡 Bob's Warnings", () => {
    if (!BOB_WARNING_CARDS.includes(id)) throw new BudgetInputError("That card couldn't be found. Please reload the page.");
    const bob = bobSettings();
    const warnings = BOB_WARNING_CARDS.filter(card => (card === id ? on : (bob.warnings || []).includes(card)));
    if (warnings.length > 0) bob.warnings = warnings;
    else delete bob.warnings;
    formEntryRow[3] = `${BOB_CARDS.get(id)} Warnings: ${on ? "On" : "Off"}`;
    return {};
  });
}

// Okay on Bob's card on Home: his warnings go, and his card goes back under the calendar, until tomorrow
function okayBobWarnings() {
  return runBudgetAction("💡 Bob's Warnings", () => {
    bobSettings().okayed = formatToMMDDYYYY(today);
    formEntryRow[3] = "Okayed until tomorrow";
    return {};
  });
}

// Were Bob's warnings okayed today?
function bobWarningsOkayed() {
  return accountsData?.bob?.okayed === formatToMMDDYYYY(today);
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
// transfer; the title as compared keeps its Equity account, since a day has one entry per title, account, and type). A
// note goes wherever its entry goes (another day, title, type, or account; into an entry already there, the two notes are
// put together), and it goes when its entry does (deleted, or a placeholder whose day passed, see dropStrayNotes). Undo
// and Redo put a day's notes back with its entries. Every entry form has its note at the bottom (BudgetUI.noteField).
// An entry's reminder is kept here too, the same way (notesData.reminders, see ENTRY REMINDERS).

const NOTE_TYPES = { "❗️": "regular", "✖️": "hidden", "⭕️": "transfer" };
const MAX_NOTES_BYTES = 1800000;     // Every note together (a little under MAX_TABLE_BYTES)
const MAX_UNDO_NOTE_CHARS = 100000;  // A change's notes kept for Undo in this tab (more than that, Undo leaves them be)
const NOTES_FULL = "Your notes are full (about 1.8 MB of them together). Make some shorter, or delete some, first.";

// No notes yet
function emptyNotes() {
  return { version: 1, entries: {}, recurring: {}, reminders: {} };
}

// The stored notes, checked (none stored is none)
function normalizeApiNotes(stored) {
  const notes = emptyNotes();
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return notes;
  for (const part of ["entries", "recurring", "reminders"]) {
    const kept = stored[part] && typeof stored[part] === "object" && !Array.isArray(stored[part]) ? stored[part] : {};
    for (const [key, value] of Object.entries(kept)) {
      // (A "__proto__" key would replace the object's prototype instead of adding a note)
      if (key === "__proto__" || !key.includes("|")) continue;
      if (part === "reminders") {
        const text = reminderText(Number(value));
        if (text && /^\d{4}-\d{2}-\d{2}\|/.test(key)) notes.reminders[key] = text;
      } else if (typeof value === "string" && value.trim()) {
        notes[part][key] = value;
      }
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

// Within a change to an entry: its note goes where it went (another day, title, type, or Equity account), after the note
// of an entry it went into, and the form's note (change.note) takes its place; it goes when the entry is deleted. Its
// reminder goes with it the same way (the form's, change.reminder: days before its day, or null for none, takes its
// place), on a day after today (on any other, it goes); one it went into keeps its own when it had none.
function followEntryNote(change, deleted) {
  if (!notesData) return;
  const from = entryNoteKey(change.date, change.title, change.sprite);
  const old = noteText("entries", from);
  const oldReminder = noteText("reminders", from);
  if (deleted) {
    putNote("reminders", from, "");
    return putNote("entries", from, "");
  }
  const toDate = change.moveDate || change.date;
  const to = entryNoteKey(toDate, changedTitle(change), change.newSprite ?? change.sprite);
  const own = change.note !== undefined ? String(change.note) : old;
  const there = to === from ? "" : noteText("entries", to);
  if (to !== from) putNote("entries", from, "");
  putNote("entries", to, joinNotes(there, own));
  if (!notesFit()) throw new BudgetInputError(NOTES_FULL);
  logNoteChange(old, own);
  const ownReminder = change.reminder !== undefined ? checkedReminder(change.reminder) : oldReminder;
  const thereReminder = to === from ? "" : noteText("reminders", to);
  if (to !== from) putNote("reminders", from, "");
  putNote("reminders", to, createSafeMidnight(toDate) > today ? ownReminder || thereReminder : "");
  logReminderChange(oldReminder, noteText("reminders", to));
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

// Within a recurring entry's new title, Equity account, or type (after moveRecurringTemps): the notes on its days from
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
  // (Its days' reminders go with them, see ENTRY REMINDERS)
  for (const part of ["entries", "reminders"]) {
    for (const key of Object.keys(notesData[part])) {
      if (key.slice(10) !== oldPart || key.slice(0, 10) < first || own.has(key)) continue;
      const day = key.slice(0, 10);
      const to = `${day}|${cleanString(newTitle)}|${NOTE_TYPES[getSpecialType(newSprite)]}`;
      const note = noteText(part, key);
      putNote(part, key, "");
      putNote(part, to, part === "reminders" ? note : joinNotes(noteText(part, to), note));
    }
  }
}

// Within an account's rename (renameAccountEntries): the notes on its entries and recurring entries follow its new name
function renameAccountNotes(oldClean, newName) {
  if (!notesData) return;
  // (A key's title is compared, cleanString's: "payday → savings", or "move ← savings → hsa" from another account)
  const renamed = (title) => {
    const { title: own, account, from } = splitAccount(title);
    const toIt = !!account && account === oldClean;
    const fromIt = !!account && !!from && from === oldClean;
    return toIt || fromIt ? cleanString(withAccount(own, toIt ? newName : account, fromIt ? newName : from)) : null;
  };
  for (const part of ["entries", "recurring", "reminders"]) {
    for (const key of Object.keys(notesData[part])) {
      // (An entry's key starts with its day, YYYY-MM-DD|, and so does its reminder's; the type is after the last |)
      const start = part === "recurring" ? 0 : 11;
      const end = key.lastIndexOf("|");
      const title = renamed(key.slice(start, end));
      if (title === null) continue;
      const to = `${key.slice(0, start)}${title}${key.slice(end)}`;
      const note = noteText(part, key);
      putNote(part, key, "");
      putNote(part, to, part === "reminders" ? note : joinNotes(noteText(part, to), note));
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
  // Reminders go once their entry's day has come, or when their entry is gone
  const reminderKeys = Object.keys(notesData.reminders);
  if (reminderKeys.length > 0) {
    const days = remindedEntries();
    for (const key of reminderKeys) if (!days.has(key)) delete notesData.reminders[key];
  }
}

// A day's notes, for Undo and Redo (see captureEntryDays): { key: note }, its entries' reminders among them as "r:" and
// their key (see putStepNotes)
function dayNotes(date) {
  const notes = {};
  const prefix = `${formatToYMD(date)}|`;
  for (const [key, text] of Object.entries(notesData?.entries || {})) if (key.startsWith(prefix)) notes[key] = text;
  for (const [key, text] of Object.entries(notesData?.reminders || {})) if (key.startsWith(prefix)) notes[`r:${key}`] = text;
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

// Within Undo or Redo: notes as a step had them ({ key: note }, see notesChange; an entry's reminder is "r:" and its key)
function putStepNotes(notes) {
  for (const [key, text] of Object.entries(notes || {})) {
    if (key.startsWith("r:")) putNote("reminders", key.slice(2), text);
    else putNote("entries", key, text);
  }
}

// Only a title's purpose, an entry's note, or its reminder changed (an entry's options, with nothing else changed):
// extras { purpose, note, reminder (days before its day, or null for none) }, each left out to keep it as it is. A
// note's or reminder's change can be undone.
function saveEntryExtras(date, title, sprite, { purpose, note, reminder } = {}) {
  const day = createSafeMidnight(date);
  const name = capitalize(String(title || "").trim());
  const what = note !== undefined && reminder !== undefined ? "the note and reminder" : note !== undefined ? "the note" : "the reminder";
  const undo = note !== undefined || reminder !== undefined ? { label: `changed ${what} on ${name} on ${showDay(day)}`, dates: [day] } : null;
  const action = note !== undefined ? "📝 Entry Note" : reminder !== undefined ? "🔔 Entry Reminder" : "🏷️ Entry Purpose";
  return runBudgetAction(action, () => {
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
    if (reminder !== undefined) {
      const key = entryNoteKey(day, title, sprite);
      const before = noteText("reminders", key);
      putNote("reminders", key, day > today ? checkedReminder(reminder) : "");
      logReminderChange(before, noteText("reminders", key));
    }
    return {};
  }, undo);
}

/* ---------- Entry reminders ---------- */
// An entry on a day after today can have a reminder: a number of days before its day (0: on the day itself), on which
// it comes with that day's reminder, as a push notification or on the calendar link (Settings), at the reminder time:
// "🔔 Rent is in 3 days (Fri, Nov 27)" (see buildReminderPlan; the API words it). They're kept with the notes
// (notesData.reminders: { "YYYY-MM-DD|title as compared|type": "3" }, keyed like the entry's note, see entryNoteKey),
// and go wherever their entry goes, the same way (another day, title, type, or Equity account; with Undo and Redo too).
// One goes when its entry does, or once its day has come (dropStrayNotes). A recurring entry's or a connected
// spreadsheet's day can have one too, like a note.

const MAX_REMINDER_DAYS = 365;

// A reminder as it's kept: how many days before its day, as text ("" for none, or for one that isn't a whole number from
// 0 to MAX_REMINDER_DAYS)
function reminderText(days) {
  return Number.isInteger(days) && days >= 0 && days <= MAX_REMINDER_DAYS ? String(days) : "";
}

// Within a change: a reminder from a form (days, or null for none) as it's kept, refused when it isn't one
function checkedReminder(days) {
  if (days === null || days === undefined) return "";
  const text = reminderText(days);
  if (!text) throw new BudgetInputError(`Enter how many days before its day to be reminded: a whole number from 0 to ${MAX_REMINDER_DAYS}.`);
  return text;
}

// An entry's reminder on its day: how many days before it, or null for none (for its forms)
function entryReminder(date, title, sprite) {
  const text = noteText("reminders", entryNoteKey(date, title, sprite));
  return text === "" ? null : Number(text);
}

// Change Logs say when a change added, changed, or took off a reminder
function logReminderChange(before, after) {
  const words = !before && after ? `Reminder Added: ${reminderWords(Number(after))}` : before && !after ? "Reminder Removed" : before && after && before !== after ? `Reminder Changed: ${reminderWords(Number(after))}` : "";
  if (words) formEntryRow[3] = `${formEntryRow[3]} (${words})`.trim();
}

// "3 days before", "1 day before", or "on its day"
function reminderWords(days) {
  return days === 0 ? "on its day" : `${days} day${days === 1 ? "" : "s"} before`;
}

// Within a change: a new entry's reminder (days: from its form, or null for none), on the entry it landed as (sprite: its
// type), on a day after today (it takes the place of one the entry it went into had). skipBad: a quick entry, which
// still joins the budget without one that isn't right.
function addEntryReminder(date, title, sprite, days, skipBad = false) {
  if (!notesData || days === null || days === undefined) return;
  const day = createSafeMidnight(date);
  if (day <= today) return;
  if (skipBad && !reminderText(days)) return;
  const key = entryNoteKey(day, title, sprite);
  const before = noteText("reminders", key);
  putNote("reminders", key, checkedReminder(days));
  logReminderChange(before, noteText("reminders", key));
}

// The entries with a reminder that are still to come, as they are: Map(key -> { date, title (as the entry has it),
// days }). A day from today on is looked at as the budget has it (the calendar's, then after it, Upcoming's and what lands
// there by itself, see dayAfterCalendar), and a reminder whose entry isn't on its day (anymore) is left out.
function remindedEntries() {
  const found = new Map();
  const keys = Object.entries(notesData?.reminders || {}).filter(([key]) => key.slice(0, 10) >= formatToYMD(today));
  if (keys.length === 0) return found;
  const latest = keys.reduce((last, [key]) => (key.slice(0, 10) > last ? key.slice(0, 10) : last), formatToYMD(today));
  const lastDate = createSafeMidnight(latest, true);
  const recurringRows = getParsedRecurringRows();
  const futureByDate = groupFutureRowsByDate();
  const sheetDays = lastDate > gridEndDate ? sheetEntriesByDay(nextFourStart, lastDate) : new Map();
  const wanted = new Map(keys);
  const days = new Set(keys.map(([key]) => key.slice(0, 10)));
  for (const ymd of days) {
    const date = createSafeMidnight(ymd, true);
    if (isNaN(date.getTime())) continue;
    const spot = date <= gridEndDate ? calendarSpot(date) : null;
    const text = spot ? calendarData[spot.r][spot.c] : dayAfterCalendar(date, recurringRows, futureByDate, sheetDays);
    for (const lineText of String(text ?? "").split("\n").slice(1)) {
      const line = readLine(lineText);
      if (line.blank || line.system || !line.title) continue;
      const key = entryNoteKey(date, line.title, line.sprite);
      if (wanted.has(key) && !found.has(key)) found.set(key, { date, title: line.title, days: Number(wanted.get(key)) });
    }
  }
  return found;
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
const BACKUP_TABLE_NAMES = { calendar: "Home's Calendar", future: "Upcoming", history: "History", recurring: "Recurring Entries", accounts: "Equity", tracker: "Tracker", sheets: "Connected Spreadsheets And Calendars", calculator: "Paycheck Calculator", notes: "Notes" };

// A Download My Data file's text, read and checked: { from: { username, downloaded (a Date, or null) }, budgets (the
// names of the budgets the file has: its account's first budget, then its others), which (the one read), days: Map(day's
// time -> { lines, inBank }) from its History and calendar, upcoming (rows), recurring (rows), accounts (like
// accountsData), tracker (rows, aliases as stored), sheets, calculator (rows), notes, logs (rows) }. which: the budget
// to read from the file (0 for its first). A part the file doesn't have is null. A file that isn't one is refused (a
// BudgetInputError).
function readBackup(text, which = 0) {
  let file = null;
  try { file = JSON.parse(text); } catch (e) {}
  const isPart = (value) => !!value && typeof value === "object" && !Array.isArray(value);
  const all = isPart(file) && isPart(file.budget) ? [file.budget, ...(Array.isArray(file.otherBudgets) ? file.otherBudgets.filter(isPart) : [])] : [];
  const budget = all[which] || null;
  if (!budget) {
    throw new BudgetInputError("That file isn't one Download My Data saved. Pick the .json file it downloaded.");
  }
  const has = (name) => budget[name] !== null && budget[name] !== undefined;
  const downloadedAt = String(file.about ?? "").match(/downloaded (\d{4}-\d{2}-\d{2}T[\d:.]+Z)/);
  const downloaded = downloadedAt ? new Date(downloadedAt[1]) : null;
  const tracker = has("tracker") ? normalizeApiTable(budget.tracker, TABLE_SHAPES.tracker) : null;
  if (tracker) trackerAliasesFromWords(tracker);
  return {
    from: { username: String(file.account?.username ?? "").slice(0, 100), downloaded: downloaded && !isNaN(downloaded.getTime()) ? downloaded : null },
    budgets: all.map((part, index) => String(part.name ?? "").slice(0, 100) || (index === 0 ? "Its first budget" : `Budget ${index + 1}`)),
    which,
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
// placeholder only while its last day hasn't passed (see placeholderEnds); from today on, one that had landed by itself is
// left to land again
function backupLineNow(line, date) {
  const parts = getParts(line);
  if (parts.length < 3 || systemEmojis.includes(parts[0])) return null;
  const landed = !!entryMark(parts[0]) && !isOwnEntryLine(line);
  if (date >= today) return landed ? null : parts.join(" ");
  if (placeholderExpired(parts[0], date)) return null;
  if (entryMark(parts[0])) parts[0] = decoratedSprite(getSpecialType(parts[0]) + entryMark(parts[0]), { placeholder: placeholderPart(parts[0]) || false });
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

// An entry line's key on its day (a day has one entry per title, Equity account, and type)
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
    calendarPlan(plan, pool, backup.accounts?.bankHolds);
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
    plan("accounts", "Equity", "accounts", mine.length, theirs.length, count(null).clashes, (choice) => {
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
    plan("sheets", "Connected Spreadsheets And Calendars", "spreadsheets and calendars", mine.length, backup.sheets.length, count(null).clashes, (choice) => {
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

  if (backup.notes && ["entries", "recurring", "reminders"].some(part => Object.keys(backup.notes[part] || {}).length > 0)) {
    const parts = ["entries", "recurring", "reminders"];
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
function calendarPlan(plan, pool, holds) {
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
    // (A day's hold goes with the entries it was made for: see IN BANK AND THE LAST CATCHUP)
    if (choice !== "current") for (const date of gridDates.flat()) holdBank(date, (holds?.[formatToMMDDYYYY(date)] ?? 0) - bankHoldOn(date));
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
// Entries from the person's own spreadsheets (Google Sheets, Excel, ...), set up on the Spreadsheets & Calendars page. Each one says
// which cells hold the dates (always from the spreadsheet), and where the titles, amounts, refraction types,
// and Equity accounts come from: cells too, or one typed in for all of them. Spreadsheets.js reads them (each
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
// the same day is left out (the Spreadsheets & Calendars page says so). A spreadsheet that's off keeps its entries (it's
// read again when it's turned back on) and its temps; deleting one turns its temps from today on into unique entries.
// Connected calendars are kept in the same list and land the same way: their entries are the paychecks their shifts
// come to (Calendars.js works them out, with the connection's pay settings).
// sheetsData.list: [{ id, name, link, on, fields, entries: [[MM/DD/YYYY, type, amount, title]], problems: [text],
// tabs: [tab names], access: "public" | "shared", by (the username that connected it or changed it last) }]. fields:
// { date, title, amount, type, account }, each
// { tab, range: "B2:B50" } (cells; amount adds sign: "written" | "costs" | "gains") or { value } (typed).
// A calendar also has kind: "calendar", pay (its pay settings, see PAY SETTINGS in Calendars.js), paychecks (what each
// paycheck came to the last time it was read), and checked ({ shifts, paychecks, from }: what that read found);
// its fields are only typed: title, type, and account.

const SHEETS_VERSION = 1;
const MAX_SHEETS = 10; // Spreadsheets and calendars, together
const MAX_SHEET_NAME = 60;
const MAX_KEPT_PAYCHECKS = 120;

// The stored connected spreadsheets, checked and tidied: { version, list }
function normalizeApiSheets(rawData) {
  let parsed = rawData;
  if (typeof parsed === "string") {
    try { parsed = JSON.parse(parsed); } catch (e) { parsed = null; }
  }
  const list = parsed && Array.isArray(parsed.list) ? parsed.list : [];
  return { version: SHEETS_VERSION, list: list.filter(item => item && typeof item === "object" && typeof item.id === "string" && item.id).map(normalizeSheetConnection) };
}

// One connection, with only what it should have (and always in the same order, so comparing copies works). A
// calendar's pay settings and paychecks are kept as they are here (Calendars.js checks them as it reads them).
function normalizeSheetConnection(item) {
  const text = (value, max) => String(value ?? "").slice(0, max);
  const isObject = (value) => !!value && typeof value === "object" && !Array.isArray(value);
  const isCalendar = item.kind === "calendar";
  const count = (value) => (Number.isInteger(value) && value >= 0 ? value : 0);
  return {
    id: text(item.id, 40),
    name: text(item.name, MAX_SHEET_NAME).trim() || (isCalendar ? "Calendar" : "Spreadsheet"),
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
    ...(item.by ? { by: text(item.by, 120) } : {}), // The account that connected it (or changed it last), see readsConnection
    ...(item.placeholder === true ? { placeholder: true } : {}), // Its entries are placeholders
    ...(isCalendar ? {
      kind: "calendar",
      pay: isObject(item.pay) ? JSON.parse(JSON.stringify(item.pay)) : {},
      paychecks: (Array.isArray(item.paychecks) ? item.paychecks : []).filter(isObject).slice(-MAX_KEPT_PAYCHECKS).map(paycheck => JSON.parse(JSON.stringify(paycheck))),
      checked: isObject(item.checked)
        ? { shifts: count(item.checked.shifts), paychecks: count(item.checked.paychecks), from: text(item.checked.from, 10) }
        : null
    } : {})
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

// "Spreadsheet" or "Calendar", for a connection's messages and Change Logs rows
const connectionNoun = (connection) => (connection?.kind === "calendar" ? "Calendar" : "Spreadsheet");

// What a connection's entries are worked out from (its link, cells or typed parts, and a calendar's pay settings). A
// read made from anything else, like one that started before the connection was changed, is out of date.
const connectionBasis = (connection) => JSON.stringify([connection.link, connection.fields, connection.pay ?? null]);

// In a shared budget, each page reads the connections it can (Spreadsheets.js and Calendars.js refresh):
//   - A spreadsheet shared only with Prismal Planning's Google account opens just for the emails of whoever connected it,
//     so only that account's pages read it (readsConnection)
//   - A read that fails is kept in the budget (as the connection's problem) only from that account's pages too: another
//     account's failure is about that account (like an email that isn't verified yet), not the connection
//     (keepsReadProblem)
// A budget that's only the account's reads everything and keeps every problem, as always.

// Did this account connect it (or change it last)? One from before connections said who is its budget's owner's.
function connectedHere(connection) {
  return (connection.by || budgetInfo?.owner || "") === signedInName();
}

// Does this page read the connection again?
function readsConnection(connection) {
  return !budgetIsShared() || connection.access !== "shared" || connectedHere(connection);
}

// Is a read of it that failed here kept as its problem?
function keepsReadProblem(connection) {
  return !budgetIsShared() || connectedHere(connection);
}

// New (id null) or changed connection. config: { name, link, fields, placeholder (its entries are placeholders), and
// for a calendar, kind: "calendar" and pay }; read: what reading it just now found ({ entries, problems, tabs, access }
// from Spreadsheets.js readConnection, or a calendar's { entries, problems, paychecks, checked } from Calendars.js
// workOut)
function sheetConnection(config, read, id) {
  const list = sheetsData.list;
  const noun = connectionNoun(config);
  const name = String(config.name || "").replace(/\s+/g, " ").trim();
  if (!name) throw new BudgetInputError(`Give the ${noun.toLowerCase()} a name.`);
  if (name.length > MAX_SHEET_NAME) throw new BudgetInputError(`${noun} names can be up to ${MAX_SHEET_NAME} characters.`);
  if (!String(config.link || "").trim()) throw new BudgetInputError(`Paste the ${noun.toLowerCase()}'s link.`);
  let index = id ? list.findIndex(connection => connection.id === id) : -1;
  if (id && (index === -1 || connectionNoun(list[index]) !== noun)) throw new BudgetInputError(`That ${noun.toLowerCase()} couldn't be found. Please try again.`);
  if (!id && list.length >= MAX_SHEETS) throw new BudgetInputError(`You can connect up to ${MAX_SHEETS} spreadsheets and calendars, all together.`);
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
    by: signedInName(),
    placeholder: config.placeholder === undefined ? !!old?.placeholder : config.placeholder === true,
    ...(noun === "Calendar" ? { kind: "calendar", pay: config.pay, paychecks: read.paychecks, checked: read.checked } : {})
  });
  if (old) list[index] = connection;
  else list.push(connection);

  formEntryRow[2] = old ? `➕ Change ${noun}` : `➕ Connect ${noun}`;
  formEntryRow[3] = `${noun}: ` + name + (connection.placeholder ? " (Placeholders)" : "");
  formEntryRow[4] = (noun === "Calendar" ? "Paychecks: " : "Entries: ") + connection.entries.length;
  formEntryRow[5] = "Problems: " + connection.problems.length;
  return { sheetId: connection.id };
}

// A connection on or off (off takes its entries off the calendar)
function switchSheet(id, on) {
  const connection = sheetConnectionById(id);
  if (!connection) throw new BudgetInputError("That couldn't be found. Please try again.");
  const noun = connectionNoun(connection);
  connection.on = !!on;
  formEntryRow[2] = on ? `➕ ${noun} On` : `➕ ${noun} Off`;
  formEntryRow[3] = `${noun}: ` + connection.name;
  return {};
}

// Delete a connection (releaseSheetTemps then lets go of its temps from today on)
function removeSheet(id) {
  const connection = sheetConnectionById(id);
  if (!connection) throw new BudgetInputError("That couldn't be found. Please try again.");
  const noun = connectionNoun(connection);
  sheetsData.list = sheetsData.list.filter(item => item !== connection);
  formEntryRow[2] = `➕ Delete ${noun}`;
  formEntryRow[3] = `${noun}: ` + connection.name;
  return {};
}

// What reading the spreadsheets (or the calendars) just now found: [{ id, basis, entries, problems, tabs, access }] (a
// calendar's: { id, basis, entries, problems, paychecks, checked }), or { id, basis, failed } (couldn't read it: it keeps
// its entries, and says why). A read of a connection that changed since it started (its basis) is left out.
function applySheetReads(reads) {
  const names = [];
  let calendars = 0;
  for (const read of Array.isArray(reads) ? reads : []) {
    const connection = sheetConnectionById(read.id);
    if (!connection || (read.basis !== undefined && read.basis !== connectionBasis(connection))) continue;
    const found = connection.kind === "calendar"
      ? { entries: read.entries, problems: read.problems, paychecks: read.paychecks, checked: read.checked }
      : { entries: read.entries, problems: read.problems, tabs: read.tabs, access: read.access };
    const updated = read.failed
      ? normalizeSheetConnection({ ...connection, problems: [read.failed] })
      : normalizeSheetConnection({ ...connection, ...found });
    if (JSON.stringify(updated) === JSON.stringify(connection)) continue;
    sheetsData.list[sheetsData.list.indexOf(connection)] = updated;
    names.push(connection.name);
    if (connection.kind === "calendar") calendars++;
  }
  formEntryRow[2] = calendars > 0 && calendars === names.length ? "➕ Calendar Update" : "➕ Spreadsheet Update";
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
    lines[at] = `${placeholderSprite(entry.special + SHEET_MARK, entry.placeholder && isPlaceholder(line.sprite) ? placeholderPart(line.sprite) : false)} ${formatMoney(line.amount + amount)} ${line.title}`;
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

/* ---------- Edit mode: reorder, sections, delete (Recurring, Tracker, and Equity) ---------- */

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
// Returns { results: [{ date, amount, sprite, title, isTransfer, checked }], from, to, searchingFor, toDay (the To day, a
// Date) }
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

  // Filters: one refraction type ("❗️", "✖️", or "⭕️"; "" is any), and one Equity account (its name, "none" for
  // entries without one, or "" for any)
  let onlyType = ["❗️", "✖️", "⭕️"].includes(query.type) ? query.type : "";
  let accounts = accountTitleMap();
  let onlyAccount = String(query.account || "").trim();
  let accountFilter = onlyAccount === "none" ? "none" : onlyAccount ? accounts.get(cleanString(onlyAccount)) || null : "";
  if (accountFilter === null) throw new BudgetInputError(`There's no Equity account called "${onlyAccount}".`);
  if (onlyType) searchingFor += ` (${REFRACTION_NAMES.get(onlyType)} only)`;
  if (accountFilter === "none") searchingFor += ", with no Equity account";
  else if (accountFilter) searchingFor += `, for ${accountFilter.name}`;

  // An entry is found when a target for its title counts its amount: "Payday → Savings" is found by Payday,
  // Savings, or the whole thing (and a Transfer from another account by that account's name too). Transfers start
  // unchecked, unless a tracker row that counts transfers found them.
  let searchResults = [];
  const addIfFound = (date, amount, sprite, title) => {
    if (onlyType && getSpecialType(String(sprite || "")) !== onlyType) return;
    if (accountFilter) {
      let linked = linkedAccount(sprite, title, accounts);
      let from = linked ? fromAccount(sprite, title, accounts) : null;
      if (accountFilter === "none" ? linked : linked !== accountFilter && from !== accountFilter) return;
    }
    let isTransfer = isTransferEntry(sprite);
    let { title: own, account, from } = splitAccount(title);
    let keys = new Set(account ? [cleanString(title), cleanString(own), cleanString(account), ...(from ? [cleanString(from)] : [])] : [cleanString(title)]);
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
    percentBasesThrough(lastDay);
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
  return { results: searchResults, from: dateA, to: dateB, searchingFor, toDay: toDate };
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
    if (rowType === "interest") throw new BudgetInputError("The Interest row counts the interest your Equity accounts get, which isn't an entry, so Search can't find it. Each account's window on Equity lists its interest.");
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
          cellLines[l] = `${placeholderSprite(baseSprite(line.sprite) + "✔️", mergedPlaceholder(line.sprite, sprite))} ${formatMoney(amt + line.amount)} ${title}`;
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
      // and the ones just as they landed after recurring entries. Transfers of your own go above the ones from a
      // recurring entry or a spreadsheet, changed for the day or not.)
      let cellArray = {
        uncategorized: [],
        oneTimes: [],
        temps: [],
        sheetTemps: [],
        hidTemps: [],
        hidSheetTemps: [],
        hiddens: [],
        transfers: [],
        transferTemps: [],
        transferSheetTemps: [],
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
  pruneBankHolds();
  let lastInBank = readLatestHistoryInBank();
  let lowest = Infinity;
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 7; c++) {
      let lines = calendarData[r][c].split("\n");
      let { gains, costs, bankChange } = dayMath(lines);
      let inBank = Math.round((lastInBank + bankChange + bankHoldOn(gridDates[r][c])) * 100) / 100;
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
//   Transfers change In Bank, but aren't costs or gains (the money is still yours); one from another Equity account
//   ("Move ← Savings → HSA") moves money between two Equity accounts, so it doesn't change In Bank either
function dayMath(lines) {
  let gains = 0;
  let costs = 0;
  let bankChange = 0;
  for (let l = 1; l < lines.length; l++) {
    const line = readLine(lines[l]);
    if (line.blank || line.system) continue;
    const special = getSpecialType(line.sprite);
    if (special !== "✖️" && !line.fromOther) bankChange += line.amount;
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
      special: getSpecialType(fSprite),
      fromOther: isFromOther(fSprite, futureData[f][0])
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
      if (!overridden(row.parsed.cleanTitle, row.parsed.special) && !isFromOther(row.sprite, row.title)) dayTotal += landingAmount({ amount: row.amt, percent: row.percent, sprite: row.sprite, title: row.title }, testDay);
    }
    for (let entry of sheetDays.get(currentTestTime)?.values() || []) {
      if (entry.special !== "✖️" && !overridden(entry.clean, entry.special)) dayTotal += landingAmount(entry, testDay);
    }

    for (let f = 0; f < parsedFuture.length; f++) {
      // Hidden entries don't change In Bank (hidden recurring entries are skipped above), and neither do transfers from
      // another Equity account
      if (parsedFuture[f].time === currentTestTime && parsedFuture[f].special !== "✖️" && !parsedFuture[f].fromOther) dayTotal += parsedFuture[f].amt;
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
// titles (every transfer's, and the ones no other row tracks), the Interest row (the Equity accounts' interest, see
// interestAdded, which isn't an entry), and the Recurring tab's monthly/yearly summary
function updateTrackerTab() {
  let yearly = 0;
  let monthly = 0;

  // Each row keeps the stored row it came from (stored: null for a row added here), so rows can be added
  // anywhere in the list. A row someone titled Interest before the Interest row came is renamed, so the Interest row
  // doesn't take its aliases over.
  let trackerRows = [];
  for (let stored of trackerData.slice(1)) {
    if (cleanString(stored[0]) === "interest" && stored[5] !== INTEREST_ROW_MARK) {
      const kept = String(stored[0]).trim().startsWith("⭕️") ? "⭕️Interest Entries" : "Interest Entries";
      stored = [kept, ...stored.slice(1)];
    }
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
  // (Interest goes just under Transfers)
  if (findRow("interest") === -1) trackerRows.splice(findRow("transfers") + 1, 0, autoRow("Interest"));
  if (findRow("undefined") === -1) trackerRows.push(autoRow("Undefined"));
  const costIndex = findRow("costs");
  const gainIndex = findRow("gains");
  const transferIndex = findRow("transfers");
  const interestIndex = findRow("interest");
  const undefIndex = findRow("undefined");
  // Their titles are filled in again from the entries every time (below), so a title leaves Undefined once a
  // row counts it, and either one once its entries are older than 365 days
  trackerRows[transferIndex].aliases = [];
  trackerRows[interestIndex].aliases = [];
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
    if ([undefIndex, costIndex, gainIndex, transferIndex, interestIndex].includes(tr) || trackerRows[tr].isSeparator) continue;
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

  // The Interest row: each Equity account's interest added from 365 days ago through today (below $0 is interest paid),
  // with the accounts it came from as its titles
  for (const credit of interestAdded) {
    const daysAgo = getDayDifference(today, credit.date) + 1;
    if (daysAgo < 1 || daysAgo > 365) continue;
    const row = trackerRows[interestIndex];
    row.sum365 += credit.change;
    if (daysAgo <= 90) row.sum90 += credit.change;
    if (daysAgo <= 28) row.sum28 += credit.change;
    if (!row.aliases.includes(credit.name)) row.aliases.push(credit.name);
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
  newRows[interestIndex][4] = trackerRows[interestIndex].aliases.join(", ");
  newRows[interestIndex][5] = INTEREST_ROW_MARK;
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

/* ---------- Crystals, Gems, and the Debt Calculator's boxes ---------- */
// The calculators keep a few more things in the calculator table, each a row of [label, JSON]: the Paycheck Calculator's
// crystals (row 21) and the Debt Calculator's gems (row 23), presets of their boxes like Quick Entry's prisms (each { name
// ("" for none), values: { box: what it keeps } }, only the boxes that were filled in), and the Debt Calculator's boxes
// as they were last left (row 22: { box: value }), which start it the next time.
const CALCULATOR_STORES = { crystals: [21, "Crystals"], debt: [22, "Debt Calculator"], gems: [23, "Gems"] };
const MAX_PRESETS = 30;
const MAX_PRESET_NAME = 40;

// A store's contents (see CALCULATOR_STORES): crystals and gems as a list ([] for none), the Debt Calculator's boxes as
// { box: value } (null before they were kept)
function calculatorStore(name) {
  const [row] = CALCULATOR_STORES[name];
  let stored = null;
  try { stored = JSON.parse(String(calculatorData[row]?.[1] ?? "") || "null"); } catch (e) {}
  if (name === "debt") return stored && typeof stored === "object" && !Array.isArray(stored) ? stored : null;
  return Array.isArray(stored) ? stored.filter(preset => preset && typeof preset === "object" && preset.values && typeof preset.values === "object") : [];
}

// A preset's or the Debt Calculator's boxes, checked: each a number from 0 to MAX_AMOUNT or a short word (a pick, like an
// Equity account's name or "monthly"), at most 20 of them
function readCalculatorValues(values) {
  const kept = {};
  for (const [box, value] of Object.entries(values || {}).slice(0, 20)) {
    if (box === "__proto__" || !/^[a-zA-Z]{1,40}$/.test(box)) continue;
    if (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= MAX_AMOUNT) kept[box] = value;
    else if (typeof value === "string" && value.length <= MAX_ACCOUNT_NAME) kept[box] = value;
  }
  return kept;
}

// Write a store's row (see CALCULATOR_STORES)
function writeCalculatorStore(name, value) {
  const [row, label] = CALCULATOR_STORES[name];
  while (calculatorData.length <= row) calculatorData.push(["", ""]);
  calculatorData[row][0] = label;
  calculatorData[row][1] = value === null ? "" : JSON.stringify(value);
}

// A calculator's presets, the whole list after an add, a move, or a delete (name: "crystals" or "gems"). Logged as "💎
// Crystals" or "💠 Gems".
function saveCalculatorPresets(name, list) {
  const label = CALCULATOR_STORES[name][1];
  return runBudgetAction(name === "crystals" ? "💎 Crystals" : "💠 Gems", () => {
    if (!Array.isArray(list) || list.length > MAX_PRESETS) throw new BudgetInputError(`You can have up to ${MAX_PRESETS} ${label.toLowerCase()}. Delete one first.`);
    const presets = list.map(preset => ({ name: String(preset?.name ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_PRESET_NAME), values: readCalculatorValues(preset?.values) }));
    if (presets.some(preset => Object.keys(preset.values).length === 0)) throw new BudgetInputError("Fill in at least one box for it to keep.");
    const before = calculatorStore(name).length;
    writeCalculatorStore(name, presets);
    formEntryRow[3] = `${label}: ${presets.length}`;
    formEntryRow[4] = presets.length > before ? `Added: ${presets.at(-1).name || "One without a name"}` : presets.length < before ? "Deleted one" : "New order";
    return {};
  });
}

// The Debt Calculator's boxes as they were left (they start it the next time), only when they changed
function saveDebtFields(values) {
  return runBudgetAction("🧮 Debt Calculator", () => {
    const kept = readCalculatorValues(values);
    writeCalculatorStore("debt", kept);
    formEntryRow[3] = typeof kept.owed === "number" ? "Balance owed: " + formatMoney(kept.owed) : "";
    formEntryRow[4] = typeof kept.payment === "number" ? "Payment: " + formatMoney(kept.payment) : "";
    formEntryRow[5] = kept.account ? "Account: " + kept.account : "";
    return {};
  });
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
// Days past the calendar are worked out the same way the daily update will fill them in. And the days entries' reminders
// are on (🔔, see ENTRY REMINDERS), however far ahead: entries: [{ title, date (its day), days (how many days before
// it) }]. Each account picks which of these it gets (Settings), and the API sends only those.
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

  // Entries' reminders, on the day each one is due (the soonest entries first, at most MAX_DAY_REMINDERS a day)
  const reminded = [...remindedEntries().values()].sort((a, b) => a.date - b.date);
  for (const entry of reminded) {
    const on = addDays(entry.date, -entry.days);
    if (on < today) continue;
    const key = formatToYMD(on);
    if (!days[key]) days[key] = { negative: false, uncommon: 0, cost: false };
    if (!days[key].entries) days[key].entries = [];
    if (days[key].entries.length < MAX_DAY_REMINDERS) days[key].entries.push({ title: entry.title, date: formatToYMD(entry.date), days: entry.days });
  }
  return { from: formatToYMD(today), to: formatToYMD(lastDay), days: days };
}

const MAX_DAY_REMINDERS = 20; // Entries' reminders on one day (the API keeps that many)

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
  // (Each budget's plan is its own: this browser sending one budget's says nothing about another's)
  const text = JSON.stringify({ budget: budgetInfo ? budgetInfo.id : null, ...payload });
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

// One request to the API with the login token: a POST of JSON when there's a payload, a GET otherwise. One about the
// budget (BUDGET_ROUTES) names the one this page has open. Resolves to { ok, status, data } and never throws (status 0 =
// the server couldn't be reached). A 401 means the session ended on the server, so the page signs out (see
// signedOutElsewhere); a budget that's gone opens the account's own (see budgetIsGone).
async function budgetApi(endpoint, payload) {
  const token = localStorage.getItem('prismal_jwt');
  if (!token) return { ok: false, status: 401, data: null };
  try {
    const address = `${window.API_BASE_URL}${endpoint}`;
    const res = await fetch(BUDGET_ROUTES.test(endpoint) ? withBudget(address) : address, {
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
    if (res.status === 404 && data && data.budgetGone && BUDGET_ROUTES.test(endpoint)) {
      workspaceLoaded = false;
      if (window.Budgets) window.Budgets.gone();
    }
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

// Rebuild the Equity accounts store: { version: 3, list, equity, coming, inBank, goals, bob }
//   list: [0] column titles, then [name, balance today, "default" | "cash" | "", starting amount, interest rate, interest
//         since, max] (see Equity in BUDGET LOGIC). Savings and Cash (MANDATORY_ACCOUNTS) are added if they're
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
  list[0] = ["Account", "Balance", "Default", "Starting", "Interest", "Interest Since", "Max", "Compounds", "Added Every", "Added On", "Separate Interest", "Interest Balance", "Escrow", "Escrow Day", "Escrow Due", "Interest From", "Kind"];
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
  // (What holds In Bank steady on days before the last Catchup, see IN BANK AND THE LAST CATCHUP)
  if (isCurrent && parsed.bankHolds && typeof parsed.bankHolds === "object" && !Array.isArray(parsed.bankHolds)) {
    const holds = Object.entries(parsed.bankHolds).filter(([day, amount]) => /^\d{2}\/\d{2}\/\d{4}$/.test(day) && Number.isFinite(amount) && amount !== 0);
    if (holds.length > 0) accounts.bankHolds = Object.fromEntries(holds);
  }
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
// clean (the title as compared, cleanString), titleClean (without its Equity account, titleKey), fromOther (a Transfer
// from another Equity account, which never changes In Bank: see fromAccount), system (a line the budget writes itself: In
// Bank, Gains, Costs), blank }. Cached by its text: every change reads the same lines again (all of History, for the
// tracker and the accounts), so each is only split up the first time.
const lineCache = new Map();
function readLine(line) {
  const text = String(line ?? "");
  let read = lineCache.get(text);
  if (read) return read;
  const parts = getParts(text);
  const title = parts.slice(2).join(" ");
  read = { sprite: parts[0], amount: parseAmount(parts[1]), title, clean: title ? cleanString(title) : "", titleClean: title ? titleKey(title) : "", fromOther: isFromOther(parts[0], title), system: systemEmojis.includes(parts[0]), blank: !text.trim() };
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
// An entry's Equity account is compared on its own: "Payday → Savings" is "payday → savings", so it's a different
// entry from "Payday" or "Payday → HSA" (the tracker and Search compare titles without it, see titleKey).
const cleanCache = new Map();
function cleanString(title) {
  if (!title) return "";
  const text = String(title);
  let clean = cleanCache.get(text);
  if (clean !== undefined) return clean;
  const { title: own, account, from } = splitAccount(text);
  clean = account ? [tidyTitle(own), from ? `${FROM_ARROW} ${tidyTitle(from)}` : "", ACCOUNT_ARROW, tidyTitle(account)].filter(Boolean).join(" ") : tidyTitle(text);
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

// A title as the tracker and Search compare it, without its Equity account: "Groceries → Cash" is "groceries", so
// the Groceries row counts it. One with no title of its own ("→ Savings") goes by the account's name.
function titleKey(title) {
  const { title: own, account } = splitAccount(title);
  return cleanString(own || account);
}

// Each word's first letter (in any language) capitalized: "coffee shop" -> "Coffee Shop", "école" -> "École". An
// Equity account after the title keeps its name as it is.
function capitalize(string) {
  const { title, account, from } = splitAccount(getParts(string).join(" "));
  const words = getParts(title).map(word => word.replace(/\p{L}/u, char => char.toUpperCase())).join(" ");
  return account ? withAccount(words, account, from) : words;
}

// "Payday Transfer → Savings" -> { title: "Payday Transfer", account: "Savings", from: "" }, "→ Savings" -> { title: "",
// account: "Savings", from: "" }, and a Transfer from another Equity account, "Move ← Savings → HSA" -> { title: "Move",
// account: "HSA", from: "Savings" }; without an arrow, the whole text is the title and account and from are ""
function splitAccount(text) {
  const value = ` ${String(text ?? "").trim()}`;
  const at = value.lastIndexOf(` ${ACCOUNT_ARROW} `);
  const account = at >= 0 ? value.slice(at + 3).trim() : "";
  if (!account) return { title: value.trim(), account: "", from: "" };
  const before = value.slice(0, at);
  const fromAt = before.lastIndexOf(` ${FROM_ARROW} `);
  const from = fromAt >= 0 ? before.slice(fromAt + 3).trim() : "";
  return from ? { title: before.slice(0, fromAt).trim(), account, from } : { title: before.trim(), account, from: "" };
}

// A typed title can't hold the arrows: they're what mark the Equity account picked (and the one a Transfer comes from,
// see withAccount), so a typed one would put the entry in an account without picking it
const TITLE_ARROW = `Titles can't have ${ACCOUNT_ARROW} or ${FROM_ARROW} in them. To put an entry in an Equity account, pick the account under Equity Account.`;
const hasTitleArrow = (text) => String(text ?? "").includes(ACCOUNT_ARROW) || String(text ?? "").includes(FROM_ARROW);

// A Transfer can't come from the account it goes to (title: the entry's, with its accounts)
const SAME_ACCOUNT = "A transfer can't come from the account it goes to. Pick another account under From, or In Bank.";
function refuseSameAccount(title) {
  const { account, from } = splitAccount(title);
  if (from && cleanString(from) === cleanString(account)) throw new BudgetInputError(SAME_ACCOUNT);
}

// An entry's title with the Equity account picked for it, which never changes the title: "Payday → Savings", or
// "→ Savings" with no title of its own. Only an entry with one is for an account (linkedAccount), even if its
// title is an account's name. from: the Equity account a Transfer comes from instead of In Bank ("Move ← Savings → HSA",
// see fromAccount), "" for In Bank; it needs an account to go to.
function withAccount(title, account, from = "") {
  const own = String(title ?? "").replace(/\s+/g, " ").trim();
  const name = String(account ?? "").trim();
  const source = String(from ?? "").trim();
  if (!name) return own;
  const accounts = source ? `${FROM_ARROW} ${source} ${ACCOUNT_ARROW} ${name}` : `${ACCOUNT_ARROW} ${name}`;
  return own ? `${own} ${accounts}` : accounts;
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
// budget deletes it once its last day has passed, as it opens (see dropPlaceholders): its own day, or a day picked for it
// (any day, before or after its own), or for a recurring entry's, that many days before or after each day it lands on.
// It's kept as ⏳ at the end of the entry's sprite ("❗️⏳", "✔️⭕️⏳", "⭕️✔️⏳"), after its type and mark, with its last
// day after it when one was picked ("❗️⏳2026-11-15", and a recurring entry's "✔️⏳+3" or "✔️⏳-3", which the days it lands
// on keep), which nothing reading those notices. Days show it in yellow (Budget UI.js renderEntryLine). When two entries
// become one (the same title and type on a day), it's a placeholder only if both were, so real money is never deleted
// with it, and the one already there keeps its last day (see mergedPlaceholder).
const PLACEHOLDER_MARK = "⏳";
const PLACEHOLDER_PART = /⏳(\d{4}-\d{2}-\d{2}|[+-]\d{1,3})?/;
const MAX_PLACEHOLDER_DAYS = 365; // A recurring entry's placeholders can go up to this many days before or after their day
function isPlaceholder(sprite) {
  return String(sprite ?? "").includes(PLACEHOLDER_MARK);
}

// A placeholder's part of its sprite ("⏳", "⏳2026-11-15", "⏳+3", or "⏳-3"), or "" for an entry that isn't one
function placeholderPart(sprite) {
  const found = PLACEHOLDER_PART.exec(String(sprite ?? ""));
  return found ? found[0] : "";
}

// A recurring entry's placeholder days as its form gives them (how many days after each day it lands on it's deleted,
// below 0 for days before it; blank is 0, its own day), checked
function readPlaceholderDays(value) {
  if (value === undefined || value === null || value === "") return 0;
  const days = Number(value);
  if (!Number.isInteger(days) || Math.abs(days) > MAX_PLACEHOLDER_DAYS) throw new BudgetInputError(`Enter how many days behind or ahead of the current day each placeholder is deleted: a whole number from 0 to ${MAX_PLACEHOLDER_DAYS}.`);
  return days;
}

// The part for a placeholder kept until a day (a Date; null for its own day), or for a recurring entry, a number of
// days after each day it lands on (below 0 for days before it, 0 for its own day)
function placeholderUntil(until) {
  if (until instanceof Date && !isNaN(until.getTime())) return PLACEHOLDER_MARK + formatToYMD(until);
  if (typeof until === "number" && Number.isInteger(until) && until !== 0) return `${PLACEHOLDER_MARK}${until > 0 ? "+" : "-"}${Math.min(Math.abs(until), MAX_PLACEHOLDER_DAYS)}`;
  return PLACEHOLDER_MARK;
}

// What a placeholder keeps after its ⏳: a Date (an entry's last day), a number (a recurring entry's days after its day,
// below 0 for days before it), or null (its own day, or not a placeholder)
function placeholderKeeps(sprite) {
  const until = placeholderPart(sprite).slice(PLACEHOLDER_MARK.length);
  if (/^[+-]\d+$/.test(until)) return Number(until);
  const day = until ? createSafeMidnight(until, true) : null;
  return day && !isNaN(day.getTime()) ? day : null;
}

// The ⏳ part a placeholder is written with on a day (part: its ⏳ part, or "" for none), or false for an ordinary entry:
// moved onto a day that passed, one whose last day was its own day, or counted from it, and passed with it, is what
// happened, so it's an ordinary entry. Any other keeps its part, even one whose last day has passed (a day picked for it,
// or one counted before its own day): the budget deletes it as it opens next (see dropPlaceholders), never making it an
// ordinary entry.
function writtenPlaceholder(part, date) {
  if (!part) return false;
  if (date < today && placeholderExpired(part, date) && !(placeholderKeeps(part) instanceof Date)) return false;
  return part;
}

// The last day a placeholder (its sprite, on date) is kept: its own day, the day kept with it, or that many days after
// its own (or before it). null for an entry that isn't one.
function placeholderEnds(sprite, date) {
  if (!isPlaceholder(sprite)) return null;
  const keeps = placeholderKeeps(sprite);
  if (typeof keeps === "number") return addDays(date, keeps);
  return keeps || date;
}

// Is a placeholder (its sprite, on date) gone, its last day before today? (false for an entry that isn't one)
function placeholderExpired(sprite, date) {
  const ends = placeholderEnds(sprite, date);
  return !!ends && ends < today;
}

// Two entries becoming one (see combineSameEntries): a placeholder only if both were, with the last day of the one that's
// kept (or else the other's). Its ⏳ part, or false.
function mergedPlaceholder(kept, other) {
  if (!isPlaceholder(kept) || !isPlaceholder(other)) return false;
  const own = placeholderPart(kept);
  return own !== PLACEHOLDER_MARK ? own : placeholderPart(other);
}

// A sprite without its placeholder part
function withoutPlaceholder(sprite) {
  return String(sprite ?? "").replace(new RegExp(PLACEHOLDER_PART.source, "g"), "");
}

// A sprite as a placeholder or not (a % stays). placeholder: true keeps its own ⏳ part (or a plain ⏳), a ⏳ part
// (placeholderUntil) puts that one on, and false takes it off.
function placeholderSprite(sprite, placeholder) {
  return decoratedSprite(baseSprite(sprite), { placeholder: placeholder === true ? (placeholderPart(sprite) || true) : placeholder, percent: percentOf(sprite) });
}

// A % entry's amount is that percent of its Equity account's balance on its day (before that day's entries), so only an
// entry with an Equity account can be one. It's worked out again with every change from today on (resolvePercentEntries),
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

// A sprite with its % (a number, or null for none) and its placeholder part (true for a plain ⏳, a ⏳ part from
// placeholderUntil, or false for none), in their places
function decoratedSprite(base, { placeholder = false, percent = null } = {}) {
  const hasPercent = typeof percent === "number" && Number.isFinite(percent) && percent !== 0;
  const part = typeof placeholder === "string" && placeholder.startsWith(PLACEHOLDER_MARK) ? placeholder : placeholder ? PLACEHOLDER_MARK : "";
  return baseSprite(base) + (hasPercent ? PERCENT_MARK + Math.round(percent * 100) / 100 : "") + part;
}

// A sprite with a % (or null for a plain amount); its placeholder part stays
function percentSprite(sprite, percent) {
  return decoratedSprite(baseSprite(sprite), { placeholder: placeholderPart(sprite) || false, percent });
}

// A sprite with a new type and mark (base), keeping its % and placeholder part
function rebasedSprite(sprite, base) {
  return decoratedSprite(base, { placeholder: placeholderPart(sprite) || false, percent: percentOf(sprite) });
}

// percent of base, to the cent: a % entry's amount (base is an account's balance; a cost's percent is below 0)
function percentValue(percent, base) {
  return Math.round(percent * Math.abs(base)) / 100;
}

const PERCENT_NEEDS_ACCOUNT = "A % amount is a percent of an Equity account's balance, so it needs Hidden or Transfer with an account picked under Equity Account.";
const PERCENT_PAST_DAY = "A % amount is worked out from today on, so it can't go on a day that already passed. Enter the amount instead.";

// A percent as typed for an entry (signed like its amount): the number, checked, or null for none
function readPercent(value) {
  if (value === undefined || value === null || value === "") return null;
  const percent = Math.round(Number(value) * 100) / 100;
  if (!Number.isFinite(percent) || percent === 0) throw new BudgetInputError("Enter the percent, like 3 or 12.5.");
  if (Math.abs(percent) > MAX_PERCENT) throw new BudgetInputError(`A percent can be up to ${MAX_PERCENT}%.`);
  return percent;
}

// Each Equity account's balance at the start of every day from today on, from the last time the budget was worked out
// (resolvePercentEntries): { byDay: Map(day's time -> Map(account row index -> balance)), until (the last day), last
// (Map: each balance after it) }. null while there are no % entries.
let percentBases = null;

// A % entry's amount on date: percent of its Equity account's balance at the start of that day, or null when it isn't
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

// Walks days in order, from firstDay, with each Equity account's balance (balances: Map(account row index -> its balance
// at the start of firstDay)): each day's % entries are worked out from the balances that morning, then the day's
// entries (and interest and escrow) go into them. day(text, date) returns the day's text with its % entries' amounts.
// summaries: accountSummaries(), for the entries before firstDay.
function percentRunner(balances, firstDay, summaries = accountSummaries()) {
  const accounts = accountTitleMap();
  // Each account with interest or escrow, worked out the way runAccount does through the day before firstDay
  const runners = new Map();
  for (const summary of summaries) {
    if ((summary.interest || summary.escrow) && balances.has(summary.index)) {
      runners.set(summary.index, runAccount(summary.start, summary.entries.filter(entry => entry.date < firstDay), summary.interest, summary.escrow, addDays(firstDay, -1)).runner);
    }
  }
  const round = (amount) => Math.round(amount * 100) / 100;
  // An entry's change to an account, less the escrow it paid (which leaves the account; see accountState)
  const put = (index, change, date) => {
    const runner = runners.get(index);
    const paid = runner ? runner.entry(change, date) : 0;
    balances.set(index, round((balances.get(index) ?? 0) + change - paid));
  };
  return {
    balances,
    day(text, date) {
      const morning = new Map(balances);
      for (const [index, runner] of runners) {
        const credit = runner.day(date);
        if (credit !== 0) balances.set(index, round(balances.get(index) + credit));
      }
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
        put(account.index, accountChange(line.sprite, amount), date);
        const from = line.fromOther ? fromAccount(line.sprite, line.title, accounts) : null;
        if (from) put(from.index, amount, date);
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

// The balances % entries work from, as far ahead as a look at the days to come needs (a graph can look years ahead): they go on
// a day at a time from where resolvePercentEntries stopped
function percentBasesThrough(until) {
  if (!percentBases || until <= percentBases.until) return;
  const first = addDays(percentBases.until, 1);
  const recurringRows = getParsedRecurringRows();
  const futureByDate = groupFutureRowsByDate();
  const sheetDays = sheetEntriesByDay(first, until);
  for (let day = first; day <= until; day = addDays(day, 1)) {
    percentBases.byDay.set(day.getTime(), percentBases.runner.day(dayAfterCalendar(day, recurringRows, futureByDate, sheetDays), day).morning);
  }
  percentBases.until = until;
  percentBases.last = new Map(percentBases.runner.balances);
}

// Every % entry from today on comes to its percent of its Equity account's balance at the start of its day: the calendar's
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
    const before = [...summary.entries, ...summary.interestCredits, ...summary.escrowPaid].filter(item => item.date < today);
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
  percentBases = { byDay, until, last: new Map(runner.balances), runner };

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
// read means it never ends, the same as writeRecurring and releaseEndedTemps read it. goneUntil: for a placeholder
// deleted some days before each day it lands on, the first day from today on it still lands on (a day closer than that
// already had its placeholder deleted), or null.
function parseRecurringRow(item) {
  if (!item || item[0] === "-") return null;
  const endText = String(item[4] ?? "").trim();
  const endDate = endText && endText.toLowerCase() !== "none" ? createSafeMidnight(endText, true) : null;
  const keeps = placeholderKeeps(item[5]);
  return {
    cleanTitle: cleanString(item[0]),
    special: getSpecialType(item[5] || ""),
    startDate: createSafeMidnight(item[2]),
    endDate: endDate && !isNaN(endDate.getTime()) ? endDate : null,
    frequency: parseFrequency(item[3]) || { count: 1, unit: "months" },
    goneUntil: typeof keeps === "number" && keeps < 0 ? addDays(today, -keeps) : null
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

// Does this parsed recurring row land on date? (Not on a day from today on whose placeholder was already deleted, before
// its day: see goneUntil. A day that passed is left to the daily update, like any placeholder's.)
function recurringRowHits(row, date) {
  if (date < row.startDate) return false;
  if (row.endDate && date > row.endDate) return false;
  if (row.goneUntil && date >= today && date < row.goneUntil) return false;
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
  // (Less the days just ahead whose placeholder was already deleted, see goneUntil)
  if (row.goneUntil) {
    const every = { ...row, goneUntil: null };
    const goneFrom = first > today ? first : today;
    const goneTo = addDays(row.goneUntil, -1) < last ? addDays(row.goneUntil, -1) : last;
    return countRecurringHits(every, first, last) - (goneFrom <= goneTo ? countRecurringHits(every, goneFrom, goneTo) : 0);
  }
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
  swipe.offset = nextZoomableDay(swipe.cell, dx < 0 ? 1 : -1, true) ? moved : moved * DAY_DRAG_STRETCH;
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
  if (slides && swipe.cell === activeEditCell && nextZoomableDay(swipe.cell, step, true)) slideToDay(step, swipe.offset);
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
// Less motion, please? (The device asks, or Settings' Reduced Motion switch for animations is on: Boot.js; a page
// without Boot.js asks the device)
const reducedMotion = () => (window.lessMotion ? window.lessMotion() : window.matchMedia("(prefers-reduced-motion: reduce)").matches);
let zoomBackdrop = null;
// Where a phone's zoomed day sits on the page: the screen as it was when the day zoomed in ({ x, y: its top left corner,
// in page pixels; width, height: its size, in the page's pixels (the part of the page on the screen, on a page that was
// pinch-zoomed in); layoutWidth: the window's width then; pinch: how far the page was zoomed in then, 1 for not at all }).
// It stays there while the page is scrolled or pinch-zoomed (the day moves and zooms with the page), and sliding to the
// next day keeps it. null until a day zooms.
let zoomAnchor = null;
// A phone's zoomed day: this share of the screen's width (up to ZOOM_MAX_WIDTH pixels); its text this share of what that
// zoom would make it, between ZOOM_TEXT_MIN and ZOOM_TEXT_MAX pixels; at least this share of its width tall; and one
// taller than the screen starts this share of the screen's height from its top (the page scrolls to the rest)
const ZOOM_WIDTH_SHARE = 0.92;
const ZOOM_MAX_WIDTH = 560;
const ZOOM_TEXT_SHARE = 0.82;
const ZOOM_TEXT_MIN = 15;
const ZOOM_TEXT_MAX = 19;
const ZOOM_MIN_HEIGHT_SHARE = 0.3;
const ZOOM_EDGE_SHARE = 0.04;
// What a zoom sets on its day (and closing it takes off)
const ZOOM_PROPERTIES = ['transform', 'transform-origin', '--zoom', '--zoomText', '--dayX', '--dayY', '--dayW', '--dayH', '--viewW', '--viewH'];
// How long a phone's day takes to grow out of its spot, to shrink back into it, and to slide over to the day next to it
const ZOOM_OPEN_MS = 420;
const ZOOM_CLOSE_MS = 320;
const DAY_SLIDE_MS = 340;
const ZOOM_EASING = 'cubic-bezier(0.33, 0, 0.2, 1)';

// A day for keyboards and screen readers: a stop for the Tab key named by its date, In Bank, and how many entries it has, which
// Enter or Space zooms in on (Layout.js's ACCESSIBILITY presses it). Zoomed, it's a group, and its entries and In Bank are stops of
// their own. cellText: the day as its budget stores it.
function labelDay(cell, date, cellText) {
  const content = cell.querySelector('.cell-content');
  if (!content) return;
  const lines = String(cellText ?? '').split('\n').slice(1).map(text => readLine(text)).filter(line => !line.blank && !line.system);
  const inBank = readInBank(cellText);
  const weekday = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][date.getDay()];
  content.dataset.label = `${weekday} ${showDate(date)}${date.getTime() === today.getTime() ? ', today' : ''}. ${inBank === null ? '' : `In Bank ${formatMoney(inBank)}. `}${lines.length} ${lines.length === 1 ? 'entry' : 'entries'}.`;
  updateDayAccess(cell);
}

// A day's role as it is now, zoomed or not (see labelDay)
function updateDayAccess(cell) {
  const content = cell.querySelector('.cell-content');
  if (!content || !content.dataset.label) return;
  const open = cell.classList.contains('is-editing');
  content.tabIndex = open ? -1 : 0;
  content.setAttribute('role', open ? 'group' : 'button');
  content.setAttribute('aria-label', content.dataset.label);
  const inHistory = cell.dataset.row === undefined && cell.dataset.kind !== 'calendar';
  content.querySelectorAll('.lineEntry, .lineInBank').forEach(line => {
    if (open && !(inHistory && line.classList.contains('lineInBank'))) {
      line.tabIndex = 0;
      line.setAttribute('role', 'button');
    } else {
      line.removeAttribute('tabindex');
      line.removeAttribute('role');
    }
  });
}

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
  updateDayAccess(cell);
  // (It's read out, and the Tab key goes on to its entries; a day drawn again under an open window leaves the focus there)
  if (animate && !document.querySelector('.budgetPanel')) cell.querySelector('.cell-content')?.focus({ preventScroll: true });
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
  // (The Tab key carries on from this day)
  if (!immediate && (cell.contains(document.activeElement) || document.activeElement === document.body)) cell.querySelector('.cell-content')?.focus({ preventScroll: true });
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
  updateDayAccess(cell);
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

// The day step days from a zoomed day (1: the next day, -1: the day before), right across the budget: on the page's
// own table when it has that day, or as a guest (see ONE DAY AFTER ANOTHER) when it doesn't, or null past the budget's
// first or last day. A few days with nothing on them (History's days before the budget started) are passed over. peek:
// only say whether there is one (a finger's drag asks often, and a guest isn't drawn for it).
function nextZoomableDay(from, step, peek = false) {
  const time = from ? dayTime(from) : null;
  if (time === null) return null;
  const table = pageDayTable();
  let date = new Date(time);
  for (let tries = 0; tries < 7; tries++) {
    date = addDays(date, step);
    const own = table ? dayCellOn(table, date) : null;
    if (own) {
      if (own.querySelector('.cell-content')?.childElementCount) return own;
      continue;
    }
    const day = budgetDayAt(date);
    if (!day) return null;
    return peek ? true : guestDayCell(day, from, step);
  }
  return null;
}

// 4. ONE DAY AFTER ANOTHER: HISTORY, THE CALENDAR, AND THE 28 DAYS AFTER IT
// A zoomed day moves on to the day before or after it (a swipe, or the arrow keys) right across what the budget has:
// History's days, the calendar's, and the 28 days after the calendar (as the daily update will fill them in, each with
// its In Bank: the days of the Lowest card's window, Calendar Page.js), whatever page it's on. A day the page's own
// table doesn't have zooms in as a guest: a day of the guest row, seven days laid over the row of the page's table
// where its days end (each weekday in its column), which shows only the one that's zoomed. Its entries open their
// options the way they do on their own page (History's keep the balances, and the days after the calendar's go into
// Upcoming once they're changed), its In Bank (a calendar day's) is set like Home's, and its + adds an entry on its day.

// The 28 days after the calendar, the way the daily update will fill them in, each with its In Bank (from the calendar's
// last day's on): [{ date, text (as its cell will have it), inBank }], worked out again after each change
let aheadDaysCache = null;
function aheadDays() {
  if (aheadDaysCache) return aheadDaysCache;
  const recurringRows = getParsedRecurringRows();
  const futureByDate = groupFutureRowsByDate();
  const lastDay = addDays(gridEndDate, 28);
  const sheetDays = sheetEntriesByDay(nextFourStart, lastDay);
  let inBank = readInBank(calendarData[3][6]) ?? 0;
  const days = [];
  for (let day = nextFourStart; day <= lastDay; day = addDays(day, 1)) {
    const math = applyCellBudgetMath(dayAfterCalendar(day, recurringRows, futureByDate, sheetDays), inBank);
    inBank = math.inBank;
    days.push({ date: day, text: math.text, inBank });
  }
  aheadDaysCache = days;
  return days;
}

// A day of the budget, wherever it is: { date, text (its cell: its date, In Bank, and entries), kind: "history" |
// "calendar" | "ahead" }, or null for a day it doesn't have (before History, or past the 28 days after the calendar)
function budgetDayAt(date) {
  if (date >= gridStartDate && date <= gridEndDate) {
    const spot = calendarSpot(date);
    return spot ? { date, text: String(calendarData[spot.r][spot.c] ?? ""), kind: "calendar" } : null;
  }
  if (date > gridEndDate) {
    const ahead = aheadDays().find(day => day.date.getTime() === date.getTime());
    return ahead ? { date, text: ahead.text, kind: "ahead" } : null;
  }
  const spot = historySpot(date);
  return spot ? { date, text: String(historyData[spot.r][spot.c] ?? ""), kind: "history" } : null;
}

// The page's own table of days (Home's calendar, or History's), or null
const pageDayTable = () => document.querySelector('.elastic-table:not(.guestDays)');

// The day on a table for a date, or null
function dayCellOn(table, date) {
  const time = date.getTime();
  return [...table.querySelectorAll('td')].find(td => dayTime(td) === time) || null;
}

// A day for the guest row (see above): its weekday's day in the row, with the day drawn in it. near: the zoomed day it
// comes from; when that's one of the page's own days, the row goes over the row of the page's table that the days end
// in, that way (step: 1 after them, -1 before them).
function guestDayCell(day, near, step) {
  let guests = document.querySelector('table.guestDays');
  if (!guests) {
    guests = document.createElement('table');
    guests.className = 'elastic-table guestDays';
    const row = guests.createTBody().insertRow();
    for (let c = 0; c < 7; c++) row.insertCell().appendChild(Object.assign(document.createElement('div'), { className: 'cell-content' }));
    guests.addEventListener('click', guestEntryTap);
    wireElasticTable(guests);
  }
  const table = pageDayTable();
  if (table && !(near && near.closest('table') === guests)) {
    const card = table.closest('.budgetCard') || table.parentElement;
    if (guests.parentElement !== card) card.appendChild(guests);
    const days = [...table.querySelectorAll('td')].filter(td => dayTime(td) !== null);
    const edge = days.reduce((best, td) => (!best || (step > 0 ? dayTime(td) > dayTime(best) : dayTime(td) < dayTime(best)) ? td : best), null);
    if (edge) placeGuestRow(guests, edge.closest('tr'), table);
  }
  const td = guests.rows[0].cells[day.date.getDay()];
  fillGuestDay(td, day);
  return td;
}

// The guest row laid over one of a table's rows, its days right over that row's
function placeGuestRow(guests, row, table) {
  guests.style.left = '0px';
  guests.style.top = '0px';
  const origin = guests.getBoundingClientRect();
  const to = row.getBoundingClientRect();
  const across = table.getBoundingClientRect();
  const spacing = parseFloat(getComputedStyle(guests).borderSpacing) || 0;
  guests.style.left = `${across.left - origin.left}px`;
  guests.style.top = `${to.top - spacing - origin.top}px`;
  guests.style.width = `${across.width}px`;
  guests.style.height = `${to.height + 2 * spacing}px`;
}

// Draw a budget day in a guest day: its date (History's in full, like on History), In Bank, and entries (not the
// calendar's last day's lines about the 28 days after it, which Home shows in the Lowest card), and its + and v
function fillGuestDay(td, day) {
  td.dataset.date = formatToMMDDYYYY(day.date);
  td.dataset.kind = day.kind;
  const content = td.querySelector('.cell-content');
  const fragment = document.createDocumentFragment();
  String(day.text).split('\n').forEach((line, l) => {
    if (l > 0 && (!line.trim() || isAfterCalendarLine(line))) return;
    const words = l === 0 ? (day.kind === 'history' ? showDate(day.date) : showDay(day.date)) : line;
    fragment.appendChild(BudgetUI.renderEntryLine(words, l, day.date));
  });
  content.replaceChildren(fragment, zoomDayButtons());
  td.classList.toggle('isNegative', (readInBank(day.text) ?? 0) < 0);
  td.classList.toggle('isToday', day.date.getTime() === today.getTime());
  labelDay(td, day.date, day.text);
}

// The calendar's last day's lines about the 28 days after it ("✅ $812.40 Lowest: 11/14", "✅ $905.10 Day 28 In Bank")
function isAfterCalendarLine(line) {
  const parts = getParts(line);
  if (!systemEmojis.includes(parts[0])) return false;
  const words = parts.slice(2).join(' ');
  return /^Lowest: \d{1,2}\/\d{1,2}$/.test(words) || words === 'Day 28 In Bank';
}

// A tap on a zoomed guest day's entry opens its options (History's keep the balances), and on a calendar day's In Bank
// sets it, like on their own pages
function guestEntryTap(event) {
  const lineEl = event.target.closest('.lineEntry, .lineInBank');
  const td = lineEl && lineEl.closest('td');
  if (!td || !td.classList.contains('is-editing') || td.classList.contains('isZoomClosing') || typeof BudgetUI === 'undefined') return;
  const time = dayTime(td);
  const day = time === null ? null : budgetDayAt(new Date(time));
  if (!day) return;
  if (lineEl.classList.contains('lineInBank')) {
    if (day.kind === 'calendar') BudgetUI.openInBankOptions(lineEl, day.date);
    return;
  }
  const lineIndex = Number(lineEl.dataset.line);
  const line = day.text.split('\n')[lineIndex];
  if (line) BudgetUI.openEntryOptions(lineEl, line, day.date, { lineIndex, inHistory: day.kind === 'history' });
}

// Zoom in on any day of the budget (the Lowest card's window opens one of the 28 days after the calendar this way): the
// page's own, or a guest laid over the end of its table
function zoomBudgetDay(date) {
  const table = pageDayTable();
  const own = table ? dayCellOn(table, date) : null;
  if (own) return zoomDay(own);
  const day = budgetDayAt(date);
  if (!day || !table) return;
  zoomDay(guestDayCell(day, null, date > gridEndDate ? 1 : -1));
}

// After a change, a zoomed guest day shows its day as it is now
function refreshGuestDay() {
  const cell = activeEditCell;
  if (!cell || !cell.closest('table.guestDays')) return;
  const time = dayTime(cell);
  const day = time === null ? null : budgetDayAt(new Date(time));
  if (day) fillGuestDay(cell, day);
  else closeZoomedDay(true);
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
  // The page's width (a zoomed day is laid out across it, see fitZoomedDay)
  const width = document.documentElement.clientWidth || window.innerWidth;
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

// On a zoomed day, the left and right arrow keys go to the day before and the next day, and Escape closes it (not while
// typing, or with a panel open)
document.addEventListener('keydown', (e) => {
  if (activeEditCell && e.key === 'Escape' && !document.querySelector('.budgetPanel, .datePicker')) {
    closeZoomedDay();
    return;
  }
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
// out at that size (at a day's tiny size, text doesn't shrink evenly), at least ZOOM_MIN_HEIGHT_SHARE of its width, and
// centered on the screen; one taller than the screen starts near its top and runs past its bottom, and the page scrolls
// to the rest (it's part of the page). Its content is as big as the screen (or as the day, when that's taller), from
// the screen's top left corner, and draws the day itself (budgetStyle.css) at --dayX, --dayY, --dayW by --dayH; a line
// that would run off the screen ends in "..." instead. Measured at its own size (which nothing draws in between), then
// moved there. On a page that's still pinch-zoomed in (a browser that didn't zoom it back out, see unzoomPage), it's laid
// out on the part of the page that's on the screen instead, at the screen's size (its text too), so all of it is in
// view, in the middle of the screen (pinching back out shows it smaller, as part of the page). It goes where the screen
// was when it zoomed in (zoomAnchor), so it stays put on the page when the page scrolls or zooms. animate: it grows out
// of the day (opening); without, it just moves (when the window resizes, or the day's entries change).
function fitZoomedDay(animate = false) {
  const cell = activeEditCell;
  if (!cell || !cell.classList.contains('is-fullZoom')) return;
  const content = cell.querySelector('.cell-content');
  if (!content) return;
  cell.style.transform = 'none';
  cell.style.setProperty('--zoom', '1');
  cell.style.setProperty('--zoomText', '1');
  const box = cell.getBoundingClientRect();
  const textSize = parseFloat(getComputedStyle(content).fontSize) || 1;
  if (!zoomAnchor) {
    const view = window.visualViewport;
    const layoutWidth = document.documentElement.clientWidth || window.innerWidth;
    if (pageZoomedIn()) {
      // (The part of the page on the screen, in page pixels, and how far the page is zoomed in)
      zoomAnchor = { x: view.pageLeft, y: view.pageTop, width: view.width, height: view.height, layoutWidth, pinch: view.scale };
    } else {
      zoomAnchor = { x: window.scrollX, y: window.scrollY, width: layoutWidth, height: view ? view.height : window.innerHeight, layoutWidth, pinch: 1 };
    }
  }
  const { width: viewWidth, height: viewHeight } = zoomAnchor;
  // (Sizes in screen pixels are that many page pixels over the page's zoom)
  const pinch = zoomAnchor.pinch || 1;
  const width = Math.min(viewWidth * ZOOM_WIDTH_SHARE, ZOOM_MAX_WIDTH / pinch);
  const scale = width / box.width;
  const textScale = Math.min(Math.max(textSize * scale * ZOOM_TEXT_SHARE, ZOOM_TEXT_MIN / pinch), ZOOM_TEXT_MAX / pinch) / textSize;
  cell.style.setProperty('--zoom', String(scale));
  cell.style.setProperty('--zoomText', String(textScale));
  const padding = parseFloat(getComputedStyle(content).paddingRight) || 0;
  const linesHeight = dayLinesHeight(content) + 2 * padding;
  const height = Math.max(linesHeight, width * ZOOM_MIN_HEIGHT_SHARE);
  const left = (viewWidth - width) / 2;
  const edge = viewHeight * ZOOM_EDGE_SHARE;
  const top = height + 2 * edge <= viewHeight ? (viewHeight - height) / 2 : edge;
  const contentHeight = Math.max(viewHeight, top + height + edge);
  cell.zoomBox = { x: left, y: top, width, height };
  for (const [name, pixels] of [['--dayX', left], ['--dayY', top], ['--dayW', width], ['--dayH', height], ['--viewW', viewWidth], ['--viewH', contentHeight]]) {
    cell.style.setProperty(name, `${pixels}px`);
  }
  cell.style.transformOrigin = '0 0';
  // (From where the day is on the page to where the screen was)
  const moved = `translate(${zoomAnchor.x - (box.left + window.scrollX)}px, ${zoomAnchor.y - (box.top + window.scrollY)}px)`;
  cell.style.transform = moved;
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
// After the page redraws it (a guest day draws itself again first, see ONE DAY AFTER ANOTHER)
document.addEventListener('budget:updated', () => {
  if (!activeEditCell) return;
  refreshGuestDay();
  if (activeEditCell) refitZoomedDay();
});

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
// the day, its lines, and its v keep it open
function missesZoomedDay(e) {
  const cell = activeEditCell;
  const content = cell.querySelector('.cell-content');
  if (!cell.classList.contains('is-fullZoom') || e.target !== content || !cell.zoomBox) return false;
  const area = content.getBoundingClientRect();
  const x = e.clientX - area.left - cell.zoomBox.x;
  const y = e.clientY - area.top - cell.zoomBox.y;
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

// Where this tab keeps Undo's steps for the signed-in account's open budget (each budget has its own; the account's first
// keeps the key it had before there could be more)
const undoStorageKey = () => `prismal_undo_${localStorage.getItem("prismal_username") || ""}${budgetInfo && !(budgetInfo.first && budgetInfo.owned) ? `_${budgetInfo.id}` : ""}`;

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
    const what = changed ? showDay(createSafeMidnight(changed.date)) : "your Equity accounts";
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
// the budget at all. tables: { calendar, history, future } to read instead of the budget's (a copy from before a change)
function dayEntries(date, tables = null) {
  const calendar = tables ? tables.calendar : calendarData;
  const history = tables ? tables.history : historyData;
  const future = tables ? tables.future : futureData;
  if (date >= gridStartDate && date <= gridEndDate) {
    const spot = calendarSpot(date);
    return spot ? ownEntryLines(calendar[spot.r][spot.c]) : null;
  }
  if (date < gridStartDate) {
    const spot = historySpot(date, history);
    return spot ? ownEntryLines(history[spot.r][spot.c]) : null;
  }
  return future.slice(1).filter(row => isUpcomingOn(row, date)).map(row => `${String(row[3]).trim()} ${String(row[1]).trim()} ${String(row[0]).trim()}`);
}

// Put these entry lines on the day in place of its own ones (the rest is rebuilt by refreshBudgetData). A placeholder
// doesn't come back on a day that passed: the daily update deleted it with its day.
function setDayEntries(date, lines) {
  lines = lines.filter(line => !placeholderExpired(getParts(line)[0], date));
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

// Where a day is in History (or in a copy of it): { r, c }, or null
function historySpot(date, history = historyData) {
  const target = formatToMMDDYYYY(date);
  for (let r = 1; r < history.length; r++) {
    for (let c = 0; c < 7; c++) {
      const header = String(history[r][c] ?? "").split("\n")[0].trim();
      if (!header) continue;
      if (header === target || createSafeMidnight(header, true).getTime() === date.getTime()) return { r, c };
    }
  }
  return null;
}

//#endregion

// =====================================================================
// #region CHANGE LOG UNDO (an Undo for each change in Change Logs)
// =====================================================================
// Every change made through runBudgetAction keeps what it did with its Change Logs row ([8], as JSON), so the row's Undo
// can take it back later, from any device: each day whose own entries it changed (on the calendar, in History, or in
// Upcoming), the recurring entries, tracker rows, and Equity it added or took off (a changed one is the old one
// off and the new one on) or put in another order, the goals, Bob's settings, connected spreadsheets and calendars, and
// calculators it changed, and the notes. Undo puts back what was there before, but only while everything the change
// touched is still as it left it, so it never erases anything changed since (it says what changed instead), the same as
// Home's Undo. What's worked out from those (In Bank, balances, the tracker's sums) is worked out again, like after any
// change. The Undo is a change of its own, logged with what it did, so it can be undone too (that's a Redo, and the
// change it undid can be undone again). A change too big to keep (like Upload A Backup, or an account rename across years
// of History) has no Undo, and neither do a Search, the Debt Calculator's boxes being kept (saveDebtFields), and what
// reading the connected spreadsheets and calendars again finds (the next read would only bring it back). The records are
// measured as they're saved (the Change Logs table has to stay under MAX_TABLE_BYTES), so the newest rows keep theirs.

const LOG_UNDO_COLUMN = 8;          // A Change Logs row's [8]: what its change did (see changeRecord)
const MAX_LOG_UNDO_BYTES = 60000;   // One change's record, at most, as it's saved
const MAX_LOG_UNDO_TOTAL = 800000;  // Every row's together, as they're saved: the oldest rows' Undo goes first past this
const NO_LOG_UNDO = ["🔎 Search", "📥 Upload Backup", "🧮 Debt Calculator", "➕ Spreadsheet Update", "➕ Calendar Update"];

// A row table's rows as a change compares them: what's the person's own in each (the rest is worked out every time; a
// tracker section is its title)
const RECORD_ROWS = {
  recurring: { headerRows: 2, get: () => recurringData, set: (rows) => { recurringData = rows; }, key: (row) => JSON.stringify(row) },
  tracker: {
    headerRows: 1,
    get: () => trackerData,
    set: (rows) => { trackerData = rows; },
    key: (row) => JSON.stringify([row[0], String(row[0]).trim() === "-" ? row[1] : "", TRACKER_AUTO_ROWS.includes(cleanString(row[0])) ? "" : row[4], row[5] ?? ""])
  },
  accounts: { headerRows: 1, get: () => accountsData.list, set: (rows) => { accountsData.list = rows; }, key: (row) => JSON.stringify(Array.from({ length: TABLE_SHAPES.accounts.cols }, (_, i) => (i === 1 ? "" : row[i] ?? ""))) }
};
// Other parts kept whole: [what, get(), set(value)]
const RECORD_VALUES = {
  goals: [() => accountsData.goals ?? null, (value) => { if (value) accountsData.goals = value; else delete accountsData.goals; }],
  bob: [() => accountsData.bob ?? null, (value) => { if (value) accountsData.bob = value; else delete accountsData.bob; }],
  equity: [() => accountsData.equity ?? null, (value) => { accountsData.equity = value || {}; }],
  sheets: [() => sheetsData, (value) => { sheetsData = value; }],
  calculator: [() => calculatorData, (value) => { calculatorData = value; }]
};

// A day's entry lines as a change compares them: a % entry by its percent, not what it comes to (that's worked out again
// whenever a balance changes, which isn't a change to the entry)
function comparableLines(lines) {
  return JSON.stringify((lines || []).map(line => {
    const parts = getParts(line);
    return percentOf(parts[0]) === null ? line : [parts[0], ...parts.slice(2)].join(" ");
  }));
}

// How many bytes a record takes once its Change Logs table is saved (as JSON, in UTF-8), worked out once for each
const recordSizes = new Map();
function storedSize(text) {
  let size = recordSizes.get(text);
  if (size === undefined) {
    size = new TextEncoder().encode(JSON.stringify(text)).length;
    if (recordSizes.size >= 2000) recordSizes.clear();
    recordSizes.set(text, size);
  }
  return size;
}

// What a change did (snapshot: snapshotTables from before it; changedTables: the names of the tables it changed, see
// markChangedTables), or null when it changed nothing it can take back: { id, days: [{ date, before, after }], rows: [{
// table, removed: [{ at, row }], added: [{ at, row }], order: { before, after } (keys, when only the order changed) }],
// values: [{ part, before, after }], notes: [{ part, key, before, after }], undid (for an Undo from Change Logs: the
// id of the record it undid) }
function changeRecord(snapshot, changedTables, undid = null) {
  const changed = (name) => changedTables.has(name);
  const record = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`, days: [], rows: [], values: [], notes: [], ...(undid ? { undid } : {}) };
  // (The tables as they were: only the ones that changed are read again)
  const before = {
    calendar: changed("calendar") ? JSON.parse(snapshot.calendar) : calendarData,
    history: changed("history") ? JSON.parse(snapshot.history) : historyData,
    future: changed("future") ? JSON.parse(snapshot.future) : futureData
  };

  // Days: the calendar's, History's whose text changed, and Upcoming's
  const dates = new Map();
  const addDate = (date) => { if (date && !isNaN(date.getTime())) dates.set(date.getTime(), date); };
  if (changed("calendar")) gridDates.flat().forEach(addDate);
  if (changed("history")) {
    const rows = Math.max(before.history.length, historyData.length);
    for (let r = 1; r < rows; r++) {
      for (let c = 0; c < 7; c++) {
        const was = String(before.history[r]?.[c] ?? "");
        const now = String(historyData[r]?.[c] ?? "");
        if (was === now) continue;
        for (const text of [was, now]) {
          const header = text.split("\n")[0].trim();
          if (header) addDate(createSafeMidnight(header, true));
        }
      }
    }
  }
  if (changed("future")) [...before.future.slice(1), ...futureData.slice(1)].forEach(row => addDate(createSafeMidnight(row[2], true)));
  for (const date of [...dates.values()].sort((a, b) => a - b)) {
    const was = dayEntries(date, before);
    const now = dayEntries(date);
    if (was === null || now === null || comparableLines(was) === comparableLines(now)) continue;
    record.days.push({ date: formatToMMDDYYYY(date), before: was, after: now });
  }

  // Row tables
  const accountsBefore = changed("accounts") ? JSON.parse(snapshot.accounts) : accountsData;
  for (const [table, spec] of Object.entries(RECORD_ROWS)) {
    if (!changed(table)) continue;
    const beforeRows = table === "accounts" ? accountsBefore.list : JSON.parse(snapshot[table]);
    const nowRows = spec.get();
    const was = beforeRows.slice(spec.headerRows);
    const now = nowRows.slice(spec.headerRows);
    const wasKeys = was.map(spec.key);
    const nowKeys = now.map(spec.key);
    if (JSON.stringify(wasKeys) === JSON.stringify(nowKeys)) continue;
    const left = (from, against) => {
      const counts = new Map();
      against.forEach(key => counts.set(key, (counts.get(key) || 0) + 1));
      return from.flatMap((key, i) => {
        if (counts.get(key)) {
          counts.set(key, counts.get(key) - 1);
          return [];
        }
        return [i];
      });
    };
    const removed = left(wasKeys, nowKeys).map(i => ({ at: i, row: was[i] }));
    const added = left(nowKeys, wasKeys).map(i => ({ at: i, row: now[i] }));
    const order = removed.length === 0 && added.length === 0 ? { before: wasKeys, after: nowKeys } : null;
    record.rows.push({ table, removed, added, order });
  }

  // Parts kept whole (each only looked at when its table changed)
  const valueBefore = {
    goals: () => accountsBefore.goals ?? null,
    bob: () => accountsBefore.bob ?? null,
    equity: () => accountsBefore.equity ?? null,
    sheets: () => JSON.parse(snapshot.sheets),
    calculator: () => JSON.parse(snapshot.calculator)
  };
  for (const [part, [get]] of Object.entries(RECORD_VALUES)) {
    if (!changed(part === "sheets" || part === "calculator" ? part : "accounts")) continue;
    const was = JSON.stringify(valueBefore[part]());
    if (was !== JSON.stringify(get())) record.values.push({ part, before: JSON.parse(was), after: get() });
  }

  // Notes (and entries' reminders, kept with them)
  if (changed("notes")) {
    const notesBefore = JSON.parse(snapshot.notes);
    for (const part of ["entries", "recurring", "reminders"]) {
      const was = notesBefore?.[part] || {};
      const now = notesData?.[part] || {};
      for (const key of new Set([...Object.keys(was), ...Object.keys(now)])) {
        if ((was[key] ?? "") !== (now[key] ?? "")) record.notes.push({ part, key, before: was[key] ?? "", after: now[key] ?? "" });
      }
    }
  }
  if (record.days.length + record.rows.length + record.values.length + record.notes.length === 0) return null;
  const text = JSON.stringify(record);
  return storedSize(text) <= MAX_LOG_UNDO_BYTES ? text : null;
}

// Only the newest rows keep what their change did, up to MAX_LOG_UNDO_TOTAL together
function trimLogUndo() {
  let total = 0;
  for (let i = 1; i < logsData.length; i++) {
    const text = String(logsData[i][LOG_UNDO_COLUMN] ?? "");
    if (!text) continue;
    total += storedSize(text);
    if (total > MAX_LOG_UNDO_TOTAL) logsData[i][LOG_UNDO_COLUMN] = "";
  }
}

// A Change Logs row's record (see changeRecord), or null for a row without one
function logRecord(row) {
  const text = String(row?.[LOG_UNDO_COLUMN] ?? "");
  if (!text) return null;
  try {
    const record = JSON.parse(text);
    return record && typeof record.id === "string" ? record : null;
  } catch (e) {
    return null;
  }
}

// Can this Change Logs row be undone? (It has a record, and it hasn't been undone yet)
function canUndoLogRow(row) {
  const record = logRecord(row);
  return !!record && !record.undone;
}

// A row's Undo: what its change did is taken back (see CHANGE LOG UNDO), logged as a change of its own. Taking back an
// Undo puts the change it undid back, so that change's own row can be undone again.
function undoLogRow(id) {
  return runBudgetAction("↩️ Undo", () => {
    const row = logsData.slice(1).find(item => logRecord(item)?.id === id);
    const record = logRecord(row);
    if (!record) throw new BudgetInputError("That change can't be undone anymore.");
    if (record.undone) throw new BudgetInputError("That change was undone already.");
    const what = `${String(row[2]).trim()} (${String(row[0]).trim()})`;
    const stale = staleRecordPart(record);
    if (stale) throw new BudgetInputError(`That change (${what}) can't be undone anymore, because ${stale} changed since.`);
    applyRecord(record);
    record.undone = true;
    row[LOG_UNDO_COLUMN] = JSON.stringify(record);
    const first = record.undid ? logsData.slice(1).find(item => logRecord(item)?.id === record.undid) : null;
    const firstRecord = logRecord(first);
    if (firstRecord?.undone) {
      delete firstRecord.undone;
      first[LOG_UNDO_COLUMN] = JSON.stringify(firstRecord);
    }
    formEntryRow[3] = `Took back: ${what}`;
    formEntryRow[4] = [String(row[3] ?? "").trim(), String(row[4] ?? "").trim()].filter(Boolean).join(", ");
    formEntryRow[5] = record.days.length > 0 ? "Days: " + record.days.map(day => showStoredDate(day.date)).join(", ") : "";
    return { undoneLog: what, undid: id };
  });
}

// What changed since a record's change, in words (like "10/05", "your Recurring Entries"), or "" when nothing did
function staleRecordPart(record) {
  for (const day of record.days) {
    const now = dayEntries(createSafeMidnight(day.date, true));
    if (now === null || comparableLines(now) !== comparableLines(day.after)) return showDay(createSafeMidnight(day.date, true));
  }
  const names = { recurring: "your Recurring Entries", tracker: "your tracker", accounts: "your Equity accounts" };
  for (const change of record.rows) {
    const spec = RECORD_ROWS[change.table];
    const keys = spec.get().slice(spec.headerRows).map(spec.key);
    if (change.order && JSON.stringify(keys) !== JSON.stringify(change.order.after)) return names[change.table];
    const counts = new Map();
    keys.forEach(key => counts.set(key, (counts.get(key) || 0) + 1));
    for (const { row } of change.added) {
      const key = spec.key(row);
      if (!counts.get(key)) return names[change.table];
      counts.set(key, counts.get(key) - 1);
    }
  }
  const parts = { goals: "your Goals", bob: "Bob's page", equity: "your Equity accounts", sheets: "your connected spreadsheets and calendars", calculator: "the calculators" };
  for (const value of record.values) {
    if (JSON.stringify(RECORD_VALUES[value.part][0]()) !== JSON.stringify(value.after)) return parts[value.part];
  }
  for (const note of record.notes) {
    if (noteText(note.part, note.key) !== note.after) return "a note";
  }
  return "";
}

// Put back what was there before a record's change
function applyRecord(record) {
  for (const day of record.days) setDayEntries(createSafeMidnight(day.date, true), day.before);
  for (const change of record.rows) {
    const spec = RECORD_ROWS[change.table];
    const rows = spec.get();
    const head = rows.slice(0, spec.headerRows);
    let body = rows.slice(spec.headerRows);
    if (change.order) {
      const byKey = new Map();
      body.forEach(row => {
        const key = spec.key(row);
        byKey.set(key, [...(byKey.get(key) || []), row]);
      });
      const ordered = change.order.before.map(key => byKey.get(key)?.shift()).filter(Boolean);
      body = [...ordered, ...[...byKey.values()].flat()];
    }
    for (const { row } of change.added) {
      const at = body.findIndex(item => spec.key(item) === spec.key(row));
      if (at !== -1) body.splice(at, 1);
    }
    for (const { at, row } of [...change.removed].sort((a, b) => a.at - b.at)) body.splice(Math.min(at, body.length), 0, [...row]);
    spec.set([...head, ...body]);
  }
  for (const value of record.values) RECORD_VALUES[value.part][1](value.before === null ? null : JSON.parse(JSON.stringify(value.before)));
  for (const note of record.notes) putNote(note.part, note.key, note.before);
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
  gone: ["The budget this page had open was deleted, or isn't shared with you anymore, so another of your budgets opened instead.", true]
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
    // (Sharing started or stopped somewhere else)
    if (budgetInfo && typeof result.data.shared === "boolean") {
      budgetInfo.shared = result.data.shared;
      if (window.Budgets) window.Budgets.sharedNow(result.data.shared);
    }
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
    if (await budgetIsGone(response)) return null;
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