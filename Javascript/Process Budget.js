
// =====================================================================
// GLOBAL VARIABLES (Kept identical to your setup)
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
  accounts:   { cols: 3, minRows: 1 },  // Other Accounts: [0] column titles, then [name, start, "default" | ""]
  account:    { cols: 3, minRows: 3 },  // Each LLC equity table: 3 header rows, then [date, amount, title]
  logs:       { cols: 8, minRows: 1 }   // [0] column titles, then [time, duration, action, 4 details, status]
};

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

let bgColors = null;

// Dates Data
const today = createSafeMidnight(new Date());
const yesterday = createSafeMidnight(new Date(today.getTime() - 86400000));

let gridDates = getGridDates();
let gridStartDate = gridDates[0][0];
let gridEndDate = gridDates[3][6];

let nextFourStart = createSafeMidnight(new Date(gridEndDate.getTime() + 86400000));

let equityYears = new Set();

// Colors
let todayBlueColor = "#c9daf8";
let todayRedColor = "#cc0000";
let normalRedColor = "#f4cccc";
let updateTextColor = "#FF69B4";
let updateBackColor = "#00FFFF";

let darkColor = "#ff00ff";
let lightColor = "#f3f3f3";

let mediumColor = null;
let normalMedium = "#1C4587";
let llcMedium = "#674EA7";

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
let manualNotif = false;
let negativeNotif = false;

let recurringToDeleteIndexes = [];
let trackerToDeleteIndexes = [];

let uniquesCreated = 0;
let weeksScrolled = 0;
let deletedRecurrings = 0;
let deletedUpcoming = 0;

let isLLC = false;
let isRefreshBudget = false;
let isDailyUpdate = false;
let lastDailyUpdate = null;
let pendingProcessedDate = null; // Set by performDailyUpdate, saved after the data saves
let cancellingTutorial = false;
let consultDave = true;

// =====================================================================
// #region META FUNCTIONS
// =====================================================================

async function loadWorkspace() {
  isDailyUpdate = true;
  // 1. Grab the token once
  const token = localStorage.getItem('prismal_jwt');
  
  if (!token) {
    console.error("No active session found. Redirecting to login...");
    if (typeof window.transitionTo === 'function') {
      window.transitionTo("/login.html", true);
    } else {
      window.location.replace("/login.html");
    }
    return false;
  }

  // Load from Cloudflare API using Authorization Header
  try {
    // (Removed the duplicate 'const token' declaration that was here)

    const response = await fetch(`${window.API_BASE_URL}/api/data/load`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    // 2. CRITICAL FIX: Handle invalid/expired tokens specifically
    if (response.status === 401) {
      console.error("Token expired or invalid. Clearing session...");
      // You MUST remove the token, otherwise the login page will redirect you right back here
      localStorage.removeItem('prismal_jwt');
      localStorage.removeItem('prismal_username'); // Good practice to clear this too
      
      window.location.replace("/login.html");
      return false;
    }

    if (!response.ok) {
       throw new Error(`Server responded with status: ${response.status}`);
    }

    const data = await response.json();

    // Helper function to safely extract and parse the database content string.
    // If stored content exists but can't be parsed, that table is locked from saving
    // so the (possibly recoverable) stored copy is never overwritten with an empty one.
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

    // Safely extract and parse the strings back into 2D arrays before normalizing.
    // Tables keep every stored row (only the calendar has a fixed size).
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
    workspaceLoaded = true;
    // Accounts that were just set up (like Savings in a new budget) are saved right away, so the
    // Quick Entry page can list them too
    if (!unsavableTables.has("accounts") && JSON.stringify(accountsData) !== JSON.stringify(storedAccounts)) accountsEdited = true;

    // Use the date from the database (yesterday if it's missing). A brand-new account (never
    // processed, empty calendar) starts today instead: there are no missed days to catch up.
    const calendarIsEmpty = calendarData.every(row => row.every(cell => String(cell).trim() === ""));
    const isNewAccount = !data.last_processed_date && calendarIsEmpty;
    lastDailyUpdate = isNewAccount ? today : createSafeMidnight(data.last_processed_date || yesterday);
    if (isNewAccount) pendingProcessedDate = formatToMMDDYYYY(today);
    const isNewDay = lastDailyUpdate.getTime() < today.getTime();

    // Catch up any missed days, then rebuild everything computed from the entries
    // (recurring entries, math, Dave, tracker). Only tables that changed get saved.
    const loadSnapshot = snapshotTables();
    try {
      beginChangeLog("🕛 Daily Update");
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

async function makeEdit(){
  
  await saveChanges();
}
//#endregion

// =====================================================================
// #region WORKER FUNCTIONS
// =====================================================================

/*
Daily update catch-up: brings the budget forward to today no matter how many days were missed,
producing what running the spreadsheet's daily update once per day would have produced.

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
  console.log("Performing daily update...");
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

  // 4. One pass over the timeline in date order, stopping at today
  timelineLoop:
  for (let w = 0; w < timeline.length; w++) {
    for (let c = 0; c < 7; c++) {
      let cell = timeline[w][c];
      let cellTime = cell.date.getTime();
      if (cellTime >= todayTime) break timelineLoop;

      let isMissed = cellTime >= missedFromTime;

      // Days that were never on a saved grid: add what the daily runs would have added
      // (Future Dates entries first, then recurring entries, same order as the spreadsheet)
      if (cell.isNew && isMissed) {
        let futureRows = futureByDate.get(cellTime) || [];
        for (let i of futureRows) {
          let fTitle = String(futureData[i][0]).trim();
          let fAmt = parseAmount(futureData[i][1]);
          let fSprite = String(futureData[i][3]);
          cell.text += `\n${fSprite} ${formatMoney(fAmt)} ${fTitle}`;
          usedFutureRows.add(i);
        }
        cell.text = writeRecurringToCell(cell.text, cell.date, recurringRows);
      }

      // Every missed day: process equity, and turn recurring entries into temps
      if (isMissed) {
        let lines = cell.text.split("\n");
        for (let l = 1; l < lines.length; l++) {
          let parts = getParts(lines[l]);
          let originalTitle = extractTitle(lines[l], false);

          if (parseAmount(parts[1]) !== 0 && !systemEmojis.includes(parts[0])) {
            let add = true;
            let lineAmt = parseAmount(parts[1]);
            let lineType = parts[0];
            await processEquity(add, originalTitle, cell.date, lineAmt, lineType);
          }

          if (parts[0].includes("✔️")) {
            let newSprite = getSpecialType(parts[0]) + "✔️";
            if (newSprite !== parts[0]) uniquesCreated++;
            parts[0] = newSprite;
            lines[l] = parts.join(" ");
          }
        }
        cell.text = lines.join("\n");
      }

      // Keep the balance chain going: saved cells already have In Bank, new ones need it
      if (cell.isNew) {
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
    console.log("Scrolling " + weeksToScroll + " week(s) forward...");
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

  formEntryRow[3] = "Uniques Created: " + uniquesCreated;
  formEntryRow[5] = "Weeks Scrolled: " + weeksScrolled;
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
  // Same rule as recurringHits: a row is due if any row with its title + special type hits
  let dueKeys = new Set();
  for (let row of recurringRows) {
    if (recurringRowHits(row.parsed, cellDate)) dueKeys.add(row.parsed.cleanTitle + "|" + row.parsed.special);
  }
  if (dueKeys.size === 0) return cellText;

  for (let row of recurringRows) {
    if (!dueKeys.has(row.parsed.cleanTitle + "|" + row.parsed.special)) continue;

    let cellLines = cellText.split("\n");
    let hasTemp = false;
    let hasUnique = false;
    for (let l = 0; l < cellLines.length; l++) {
      let parts = getParts(cellLines[l]);
      if (extractTitle(cellLines[l]) !== row.parsed.cleanTitle) continue;
      // A temp (checkmark entry) blocks the recurring entry for this day
      if (parts[0].includes("✔️")) {
        hasTemp = true;
        break;
      }
      // A unique with the same special type absorbs the recurring amount
      if (getSpecialType(parts[0]) === row.parsed.special) {
        hasUnique = true;
        let newAmt = row.amt + parseAmount(parts[1]);
        let newSprite = parts[0] + "✔️";
        cellLines[l] = newSprite + " " + formatMoney(newAmt) + " " + row.title;
        cellText = cellLines.join("\n");
        break;
      }
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
  let gains = 0;
  let costs = 0;
  let moneyMoves = 0;

  for (let l = 1; l < lines.length; l++) {
    let parts = getParts(lines[l]);
    if (systemEmojis.includes(parts[0])) continue;
    // Hidden entries are on accounts outside the budget: the tracker counts them, In Bank doesn't
    if (parts[0].includes("✖️")) continue;
    let lineAmt = parseAmount(parts[1]);
    if (parts[0].includes("⭕️")) {
      moneyMoves += lineAmt;
    } else if (lineAmt < 0) {
      costs += Math.abs(lineAmt);
    } else {
      gains += lineAmt;
    }
  }

  let inBank = Math.round((gains - costs + lastInBank + moneyMoves) * 100) / 100;
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
    console.log("Successfully saved new processing date:", dateString);
    return true;
  } catch (err) {
    console.error("Failed to save daily update timestamp:", err);
    return false;
  }
}

async function processEquity(add, title, date, amount, type) {
  console.log("Processing equity...");
  
  // 1. Extract Category BEFORE modifying title with type/sprite
  let category = isLLC && title.includes(":") ? title.split(":")[0].trim() : null;
  if (!category) return false;

  if (type === "") type = "❗️";
    
  // Determine incoming special type for accurate sprite matching
  let incomingSpecial = type === "" ? null : getSpecialType(type); 
  
  // 2. Format title for table entry
  let formattedTitle = type.trim() + " " + title;
  let year = date.getFullYear();
  let activeTabTitle = "C " + category;
  
  if (category === "C Revenue" || category === "Revenue") {
    activeTabTitle = "C Revenue " + year;
  } else if (category === "C Expenses" || category === "Expenses") {
    activeTabTitle = "C Expenses " + year;
  }
  
  // Retrieve the 2D array table from your workspace data map
  let targetTable = getTableData(activeTabTitle);
  if (!targetTable) {
    console.log("Equity table not found: " + activeTabTitle + "; Category: " + category);
    return false;
  }

  function editLLC(categ) {
    accountsEdited = true; // Every equity change lives in accountsData, saved as one table
    let c = categ.toLowerCase().trim().split(":")[0];
    if (c === "eagle") {
      eagleEdited = true;
    }
    else if (c === "sabian") {
      sabianEdited = true;
    }
    else if (c === "llc assets") {
      assetsEdited = true;
    }
    else if (c === "llc asset purchases") {
      purchasesEdited = true;
    }
    else if (c === "revenue") {
      revenueEdited = true;
    }
    else if (c === "expenses") {
      expensesEdited = true;
    }
  }

  // Row 4 in Sheets corresponds to index 3 in a 0-indexed JS Array
  const DATA_START_INDEX = 3;

  if (add) {
    let insertIndex = DATA_START_INDEX;
    let targetTime = date.getTime();
    let found = false;
    let exists = false;
    let matchedOldSprite = ""; // Saves the old sprite for combining later

    if (targetTable.length >= 4) {
      findLoop:
      for (let i = DATA_START_INDEX; i < targetTable.length; i++) {
        let rowDate = new Date(targetTable[i][0]);
        let rowTitle = String(targetTable[i][2] || "");
        
        // Extract the row's existing sprite and its special type
        let oldSprite = rowTitle.split(" ")[0]; 
        let existingSpecial = getSpecialType(oldSprite);

        // Check that the date, the string, AND the special sprite types match
        if (rowDate.getTime() === targetTime && 
            cleanString(rowTitle) === cleanString(formattedTitle) && 
            (!incomingSpecial || existingSpecial === incomingSpecial)) {
          insertIndex = i;
          exists = true;
          matchedOldSprite = oldSprite;
          break findLoop;
        }

        // Maintain chronological order (newest dates near the top)
        if (!isNaN(rowDate.getTime()) && rowDate.getTime() < targetTime) {
          insertIndex = i;
          found = true;
          break findLoop;
        }
      }

      if (!found && !exists) {
        insertIndex = targetTable.length;
      }
    }

    if (exists) {
      // Update cell 2 (Amount) and cell 3 (Title) directly in array
      let oldAmt = parseAmount(targetTable[insertIndex][1]);
      let finalAmt = oldAmt + amount;
      targetTable[insertIndex][1] = formatMoney(finalAmt);
            
      // Combine sprites to preserve checkmarks/statuses
      let combinedSprite = combineSprites(matchedOldSprite, type);
      let finalTitle = combinedSprite.trim() + " " + title;
      targetTable[insertIndex][2] = finalTitle; 
            
    } else {
      // Insert new row directly into array at insertIndex
      let newRow = [date, formatMoney(amount), formattedTitle];
      targetTable.splice(insertIndex, 0, newRow);
    }

  } else {
    // Handling Deletion
    if (targetTable.length < 4) {
      editLLC(category);
      equityYears.add(year);
      return true;
    }

    let indexToDelete = -1;
    let targetTime = date.getTime();
    
    for (let i = DATA_START_INDEX; i < targetTable.length; i++) {
      let rowDate = new Date(targetTable[i][0]);
      let rowTitle = String(targetTable[i][2] || "").trim();
      let rowAmt = parseAmount(targetTable[i][1]);
      
      let oldSprite = rowTitle.split(" ")[0];
      let existingSpecial = getSpecialType(oldSprite);

      if (!isNaN(rowDate.getTime()) && rowDate.getTime() === targetTime) {
        if (cleanString(rowTitle) === cleanString(formattedTitle) && 
           (!incomingSpecial || existingSpecial === incomingSpecial)) {
          if (Math.abs(rowAmt) === Math.abs(amount)) {
            indexToDelete = i;
            break;
          }
        }
      }
    }

    if (indexToDelete !== -1) {
      targetTable.splice(indexToDelete, 1);
    }
  }

  editLLC(category);
  equityYears.add(year);
  return true;
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
Other Accounts (like Savings) are changed by Hidden and Transfer entries titled with their names,
see OTHER ACCOUNTS below.
*/

// Change Logs rows kept. Each table is saved as a single database row (2 MB max), so this is capped.
const MAX_LOG_ROWS = 1000;

// Tracker rows that updateTrackerTab fills in itself (their titles and aliases aren't user-edited)
const TRACKER_AUTO_ROWS = ["gains", "costs", "undefined"];

// Tables the edit mode can reorder and delete from (and add sections to, when they have categoryRow)
const ROW_TABLES = {
  recurring: { name: "Recurring", headerRows: 2, get: () => recurringData, set: (rows) => { recurringData = rows; }, categoryRow: (title) => ["-", title, "", "", "", "-"] },
  tracker:   { name: "Tracker",   headerRows: 1, get: () => trackerData,   set: (rows) => { trackerData = rows; },   categoryRow: (title) => ["-", title, "", "", "-"] },
  accounts:  { name: "Accounts",  headerRows: 1, get: () => accountsData.list, set: (rows) => { accountsData.list = rows; } }
};

// Every saved table: snapshots for rollback, and change detection so only changed tables are saved
const BUDGET_TABLES = {
  calendar:   { get: () => calendarData,   set: (v) => { calendarData = v; },   markEdited: () => { calendarEdited = true; } },
  recurring:  { get: () => recurringData,  set: (v) => { recurringData = v; },  markEdited: () => { recurringEdited = true; } },
  tracker:    { get: () => trackerData,    set: (v) => { trackerData = v; },    markEdited: () => { trackerEdited = true; } },
  future:     { get: () => futureData,     set: (v) => { futureData = v; },     markEdited: () => { futureEdited = true; } },
  history:    { get: () => historyData,    set: (v) => { historyData = v; },    markEdited: () => { historyEdited = true; } },
  search:     { get: () => searchData,     set: (v) => { searchData = v; },     markEdited: () => { searchEdited = true; } },
  calculator: { get: () => calculatorData, set: (v) => { calculatorData = v; }, markEdited: () => { calculatorEdited = true; } },
  accounts:   { get: () => accountsData,   set: (v) => { accountsData = v; },   markEdited: () => { accountsEdited = true; } },
  logs:       { get: () => logsData,       set: (v) => { logsData = v; },       markEdited: () => { logsEdited = true; } }
};

// A change the user needs to fix: shown on the page, nothing is changed or saved
class BudgetInputError extends Error {}

let budgetQueue = Promise.resolve(); // Changes run one at a time, in order
let changeLogStart = 0;

/* ---------- Actions the page UI calls (each resolves to { ok, saved, notFound, message, ... }) ---------- */

// New calendar entry. entry: { title, sprite, amount (signed number), date }
function addCalendarEntry(entry) {
  return runBudgetAction("", () => unique({
    title: entry.title,
    sprite: entry.sprite,
    action: entry.amount > 0 ? "add" : "subtract",
    amount: String(Math.abs(entry.amount)),
    date: entry.date
  }));
}

// Change, move, or delete a calendar entry. change: { title, sprite, date, action, amount, moveDate }
function changeCalendarEntry(change) {
  return runBudgetAction("", () => unique(change));
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

function renameCategoryRow(tableName, index, title) {
  return runBudgetAction(`🔧 ${ROW_TABLES[tableName].name} Categories`, () => renameCategory(tableName, index, title));
}

// Delete rows (entries and/or sections). Recurring entries end yesterday instead, see deleteTableRows.
function deleteBudgetRows(tableName, indexes) {
  return runBudgetAction(`🔧 Delete ${ROW_TABLES[tableName].name} Rows`, () => deleteTableRows(tableName, indexes));
}

// New account (index null, from edit mode) or change the tapped one. fields: { name, balance: number | null }
// (null keeps a changed account's balance where it is; a new account starts at $0.00)
function saveAccount(fields, index = null) {
  return runBudgetAction("", () => accountEntry(fields, index));
}

// Search bar. query: { terms: [{ title, match: "all" | "costs" | "gains" | "category" }], from, to }.
// Resolves with result.search.
function searchBudget(query) {
  return runBudgetAction("🔎 Search", () => ({ search: search(query) }));
}

// Paycheck Calculator. values: { [input key]: number } for every CALCULATOR_INPUTS key. Resolves with result.paycheck.
function savePaycheck(values) {
  return runBudgetAction("🧮 Calculator", () => calculator(values));
}

/* ---------- Quick Entry (the home screen icon's page, quick.html) ---------- */
// The Quick Entry page can't open the budget (its key can only queue entries), so its entries wait in
// the API until the budget opens here. Each is added like a New Entry, then leaves the API's queue in
// the same request that saves the table it landed in (see saveChanges): never lost, never added twice.

// Refraction types by name, as the Quick Entry page sends them
const QUICK_ENTRY_TYPES = { auto: "", regular: "❗️", hidden: "✖️", transfer: "⭕️" };
// Queued entry ids to send with the next save of the table each one landed in
let quickEntryAcks = { calendar: [], history: [], future: [] };

// queue: [{ id, entry: { title, type, amount, date: "YYYY-MM-DD" } }] from the API, oldest first
async function applyQuickEntries(queue) {
  if (!Array.isArray(queue) || queue.length === 0) return;
  let added = 0;
  const failed = [];
  for (const quick of queue) {
    const result = await runBudgetAction("", () => quickEntry(quick));
    if (result.ok) added++;
    else failed.push({ quick, message: result.message });
  }
  // The toast below says why, so entries that can't be added stop coming back
  if (failed.length > 0) await budgetApi("/api/quick/dismiss", { ids: failed.map(({ quick }) => quick.id) });

  if (typeof BudgetUI === "undefined") return;
  const plural = (count) => `${count} quick ${count === 1 ? "entry" : "entries"}`;
  const messages = [];
  if (added > 0) messages.push(`Added ${plural(added)} from your home screen icon.`);
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
    throw new BudgetInputError(`${formatToMMDDYYYY(date)} is before your budget's History starts.`);
  }
  unique({
    title: entry.title,
    sprite: Object.prototype.hasOwnProperty.call(QUICK_ENTRY_TYPES, entry.type) ? QUICK_ENTRY_TYPES[entry.type] : "",
    action: entry.amount > 0 ? "add" : "subtract",
    amount: String(Math.abs(entry.amount)),
    date
  });
  formEntryRow[5] = "⚡ Quick Entry"; // Where "Move To" goes (quick entries never move)
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

// Queue one change through the full budget flow
function runBudgetAction(logType, change) {
  const run = budgetQueue.then(() => processBudgetAction(logType, change));
  budgetQueue = run.catch(() => {});
  return run;
}

async function processBudgetAction(logType, change) {
  if (!workspaceLoaded) return { ok: false, message: "Your budget hasn't finished loading yet." };

  // The page stayed open past midnight: reload so the daily update runs before any change
  if (createSafeMidnight(new Date()).getTime() !== today.getTime()) {
    window.location.reload();
    return { ok: false, message: "A new day started, so your budget is reloading." };
  }

  const snapshot = snapshotTables();
  let result = {};

  try {
    beginChangeLog(logType);
    stripRecurringEntries();
    result = change() || {};
    refreshBudgetData();
    finishChangeLog();
  } catch (err) {
    restoreTables(snapshot);
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
  // A quick entry leaves the API's queue in the same request that saves the table it landed in
  if (result.quickEntry) {
    BUDGET_TABLES[result.quickEntry.table].markEdited();
    quickEntryAcks[result.quickEntry.table].push(result.quickEntry.id);
  }
  const saved = await saveChanges();
  notifyBudgetChanged();
  queueReminderPlanSync();
  return { ok: true, saved, notFound, ...result };
}

// Tell the page that budget data changed (pages re-render on this)
function notifyBudgetChanged() {
  document.dispatchEvent(new CustomEvent("budget:updated"));
}

function snapshotTables() {
  const snapshot = {};
  for (const [name, table] of Object.entries(BUDGET_TABLES)) snapshot[name] = JSON.stringify(table.get());
  return snapshot;
}

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

function beginChangeLog(type) {
  changeLogStart = performance.now();
  hadError = false;
  notFound = false;
  formEntryRow = [formatLogTime(new Date()), "", type || "", "", "", "", ""];
}

function finishChangeLog() {
  formEntryRow[1] = ((performance.now() - changeLogStart) / 1000).toFixed(2) + " Seconds";
  const status = hadError ? "Error" : (notFound ? "Not Found" : "");
  logsData.splice(1, 0, [...formEntryRow.slice(0, 7), status]);
  if (logsData.length > MAX_LOG_ROWS + 1) logsData.length = MAX_LOG_ROWS + 1;
  logsEdited = true;
}

// "H:mm M/d/yyyy", same as the spreadsheet's log times
function formatLogTime(date) {
  return `${date.getHours()}:${String(date.getMinutes()).padStart(2, "0")} ${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
}

/* ---------- The budget flow ---------- */

// Remove everything but unique entries (and temps) from the calendar. Recurring entries,
// In Bank, Gains/Costs and the next-28 lines are all rebuilt by refreshBudgetData().
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
  manualNotif = false;
  negativeNotif = false;
  recurringToDeleteIndexes = [];

  upcomingEntriesMaintanence();
  writeRecurring();
  if (deleteExpiredReccurrings()) recurringEdited = true;
  organizeCellEntries();
  writeBudgetMath();
  commenceDave();
  updateTrackerTab();
}

/* ---------- Calendar entries (the old "Unique Entry" form) ---------- */

// Create or change a calendar entry. A new entry with the same title + refraction type as one
// already on that day is combined into it.
// entry: { title, sprite: "" (match/inherit) | "❗️" | "✖️" | "⭕️",
//          action: "subtract" | "add" | "set" | "delete",
//          amount: string ("" with "set" keeps the current amount),
//          date: Date, moveDate: Date (optional, moves the entry there) }
function unique(entry) {
  // 1. Variables
  let rawTitle = String(entry.title || "").replace(/\s+/g, ' ').trim();
  let title = capitalize(rawTitle);
  if (!title) throw new BudgetInputError("Give the entry a title.");

  let rawAction = String(entry.action || "Subtract").trim();
  let action = rawAction.toLowerCase();
  let rawAmtString = String(entry.amount ?? "").trim();
  let amt = parseAmount(rawAmtString || 0);
  if (action === "subtract") amt = amt * -1;
  if (action === "subtract" || action === "add") action = "append";

  let dateObj = createSafeMidnight(entry.date || today);
  formEntryRow[4] = "On: " + formatToMMDDYYYY(dateObj);
  let dateMove = createSafeMidnight(entry.moveDate || dateObj);
  formEntryRow[5] = entry.moveDate ? "Move To: " + formatToMMDDYYYY(dateMove) : "Move To: None";

  // Refraction type ("" matches or inherits whatever is already there)
  let modifier = String(entry.sprite || "").trim();
  let sprite = modifier;
  let explicitSpecial = sprite !== "" ? getSpecialType(sprite) : null;

  formEntryRow[3] = (sprite || "❗️") + " " + title;

  let recurringIndex = recurringHits(title, dateObj, explicitSpecial);
  // 2. Extract from Original Date
  let outData = {
    oldAmt: 0,
    oldSprite: "",
    hasBlocker: false
  };
  let isExisting = !injectOrDefer("delete", dateObj, 0, title, sprite, outData);
  let isOriginalVirginRecurring = (recurringIndex && !isExisting && !outData.hasBlocker);
  let virginSprite = isOriginalVirginRecurring ? recurringData[recurringIndex][5] : "";
  let virginSpecial = getSpecialType(virginSprite);
  // Inherit sprite before checking target date or calculating amounts
  if (modifier === "") {
    if (isExisting && outData.oldSprite) {
      sprite = outData.oldSprite;
    } else if (isOriginalVirginRecurring) {
      sprite = virginSprite;
    }
  }
  // Re-evaluate recurringIndex using exact special type of deleted entry
  if (isExisting && outData.oldSprite) {
    let matchedIndex = recurringHits(title, dateObj, getSpecialType(outData.oldSprite));
    if (matchedIndex !== false) recurringIndex = matchedIndex;
  }
  let targetIncomingSpecial = getSpecialType(sprite);
  let hasOriginalCheckmark = isExisting && outData.oldSprite.includes("✔️");
  let isMismatchedVirgin = false;
  if (isOriginalVirginRecurring && targetIncomingSpecial !== virginSpecial) {
    isOriginalVirginRecurring = false;
    isMismatchedVirgin = true;
  }
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
  // Process Equity: Remove Old Entries before merging/changing
  if (isExisting && dateObj.getTime() < today.getTime()) processEquity(false, title, dateObj, outData.oldAmt, outData.oldSprite);
  if (moveIsExisting && dateMove.getTime() < today.getTime()) processEquity(false, title, dateMove, moveOutData.oldAmt, moveOutData.oldSprite);
  // Combine existing hardcoded checks with virgin recurring checks
  let originalFound = isExisting || isOriginalVirginRecurring;

  if (action === "delete" && !originalFound) {
    notFound = true;
  } else if (dateMove.getTime() !== dateObj.getTime() && !originalFound && !moveIsExisting) {
    notFound = true;
  }
  // 4. Calculate Amounts for the Moved Entry
  let finalAmt = amt;
  let baseAmtOriginal = (isOriginalVirginRecurring || isMismatchedVirgin) ? parseAmount(recurringData[recurringIndex][1]) : 0;
  if (action === "append") {
    finalAmt = (isExisting ? outData.oldAmt : baseAmtOriginal) + amt;
  } else if (action === "set" && rawAmtString === "") {
    finalAmt = isExisting ? outData.oldAmt : baseAmtOriginal;
  }

  // 5. Inject $0 Blockers (Unless is going into history tab)
  if (dateObj.getTime() >= gridStartDate.getTime()) {
    if (isOriginalVirginRecurring || isMismatchedVirgin) {
      if (dateObj.getTime() !== dateMove.getTime() || finalAmt !== baseAmtOriginal || action === "delete") {
        let blockerSprite = getSpecialType(recurringData[recurringIndex][5]) + "✔️";
        injectOrDefer("set", dateObj, 0, title, blockerSprite);
      }
    } else if (hasOriginalCheckmark && recurringIndex && (dateObj.getTime() !== dateMove.getTime() || action === "delete")) {
      // Only inject the blocker if the entry wasn't ALREADY a $0 blocker.
      if (outData.oldAmt !== 0) {
        let blockerSprite = getSpecialType(outData.oldSprite) + "✔️";
        injectOrDefer("set", dateObj, 0, title, blockerSprite);
      }
    }
  }
  // 6. Handle Target Date Merging
  if (action !== "delete") {
    if (!(notFound && dateMove.getTime() !== dateObj.getTime())) {
      let moveAmt = finalAmt;
      let moveSprite = sprite;
      if (dateMove.getTime() !== dateObj.getTime()) {
        let recurringMoveIndex = recurringHits(title, dateMove, targetIncomingSpecial);
        let isTargetVirginRecurring = (recurringMoveIndex && dateMove.getTime() >= today.getTime() && !moveIsExisting && !moveOutData.hasBlocker);
        let moveBaseAmt = isTargetVirginRecurring ? parseAmount(recurringData[recurringMoveIndex][1]) : 0;
        let moveBaseSprite = isTargetVirginRecurring ? recurringData[recurringMoveIndex][5] : "";
        let destAmt = 0;
        let destSpecial = "";
        let destHasCheckmark = false;
        let mergeValid = false;
        if (moveIsExisting) {
          destAmt = moveOutData.oldAmt;
          destSpecial = getSpecialType(moveOutData.oldSprite);
          destHasCheckmark = moveOutData.oldSprite.includes("✔️");
          mergeValid = true;
        } else if (isTargetVirginRecurring) {
          destAmt = moveBaseAmt;
          destSpecial = getSpecialType(moveBaseSprite);
          destHasCheckmark = true;
          mergeValid = true;
        }
        if (mergeValid && targetIncomingSpecial === destSpecial) {
          moveAmt += destAmt;
          moveSprite = targetIncomingSpecial + (destHasCheckmark || isOriginalVirginRecurring || moveSprite.includes("✔️") ? "✔️" : "");
        } else if (isOriginalVirginRecurring) {
          moveSprite = targetIncomingSpecial + "✔️";
        }
      } else {
        if (isOriginalVirginRecurring || (isExisting && outData.oldSprite.includes("✔️"))) {
          moveSprite = targetIncomingSpecial + "✔️";
        }
      }
      // 7. Inject combined result back into target date
      injectOrDefer("set", dateMove, moveAmt, title, moveSprite);
      if (dateMove.getTime() < today.getTime()) processEquity(true, title, dateMove, moveAmt, moveSprite);
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
  if (isExisting && !recurringIndex) formEntryType = "❗️ Change Unique";
  if (isOriginalVirginRecurring || (isExisting && hasOriginalCheckmark)) formEntryType = "❗️✔️ Make Unique";
  formEntryRow[2] = formEntryType;
  let formEntrySuffix = notFound ? "Not Found" : action === "delete" ? "Success" : formatMoney(rawAmtString);
  formEntryRow[6] = capitalize(rawAction) + ": " + formEntrySuffix;
  return {};
}

// Put an entry on a day (calendar, History, or Future Dates, depending on the date), combining it
// with a same-title entry of the same refraction type. "delete" removes the match and reports
// what was there through outData. Returns true when nothing matched.
function injectOrDefer(action, dateObj, newAmt, title, sprite = "❗️", outData = {}) {
  let notFound = true;
  let targetMMDD = formatToMMDD(dateObj);
  let cleanNewTitle = cleanString(String(title));

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
      if (matchedOldSprite.includes("✔️") && (!incomingSpecial || existingSpecial === incomingSpecial)) {
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
            calendarData[r][c] = lines.join("\n") + `\n${mergeResult.sprite} ${formatMoney(mergeResult.amt)} ${capitalize(mergeResult.title)}`;
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
          historyData[r][c] = lines.join("\n") + `\n${mergeResult.sprite} ${formatMoney(mergeResult.amt)} ${capitalize(mergeResult.title)}`;
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
      if (futureSprite.includes("✔️") && (!incomingSpecial || futureSpecial === incomingSpecial)) {
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
        sprite === "" ? "❗️" : sprite
      ]);
    }
  }
  return notFound;
}

/* ---------- Recurring entries (the old "Create/Change A Recurring Entry" form) ---------- */

// Create a recurring entry, or change the one with this title (and refraction type, when given).
// Blank fields keep the existing entry's values.
// fields: { title, sprite: "" | "✔️" | "✔️✖️" | "✔️⭕️", amount: number | null,
//           frequency: string | "", startDate: Date | null, endDate: Date | "None" | null }
function recurring(fields) {
  let rawTitle = String(fields.title || "").replace(/\s+/g, ' ').trim();
  let title = capitalize(rawTitle);
  if (!title) throw new BudgetInputError("Give the recurring entry a title.");
  let sprite = String(fields.sprite || "").trim();
  let frequency = String(fields.frequency || "").trim();
  let hasAmount = typeof fields.amount === "number" && !isNaN(fields.amount);
  formEntryRow[3] = (sprite || "✔️") + " " + title;

  for (let i = 2; i < recurringData.length; i++) {
    let row = recurringData[i];
    let existingSprite = String(row[5] || "").trim();
    // Match requires identical titles AND either no refraction type given or matching ones
    if (row[0] === "-" || cleanString(row[0]) !== cleanString(title) || (sprite !== "" && sprite !== existingSprite)) continue;

    if (frequency === "") frequency = row[3];
    let startDate = fields.startDate ? createSafeMidnight(fields.startDate) : createSafeMidnight(row[2]);
    let endDate = resolveEndDate(fields.endDate, row[4]);
    let finalSprite = sprite || existingSprite || "✔️";

    row[1] =formatMoney(hasAmount ? fields.amount : parseAmount(row[1]));
    row[2] = formatToMMDDYYYY(startDate);
    row[3] = frequency;
    row[4] = endDate;
    row[5] = finalSprite;

    formEntryRow[2] = "✔️ Change Recurring";
    formEntryRow[4] = frequency + ": " + row[2];
    formEntryRow[5] = "Expiration: " + endDate;
    formEntryRow[6] = "New Amount: " + (hasAmount ? formatMoney(fields.amount) : "None");
    return {};
  }

  // Create New Recurring Entry
  let finalSprite = sprite || "✔️";
  if (frequency === "") frequency = "Monthly";
  let startDate = fields.startDate ? createSafeMidnight(fields.startDate) : createSafeMidnight(today);
  let endDate = resolveEndDate(fields.endDate, "None");

  let amount = formatMoney(hasAmount ? fields.amount : 0);
  recurringData.push([title, amount, formatToMMDDYYYY(startDate), frequency, endDate, finalSprite]);

  formEntryRow[2] = "✔️ Create Recurring";
  formEntryRow[4] = frequency + ": " + formatToMMDDYYYY(startDate);
  formEntryRow[5] = "Expiration: " + endDate;
  formEntryRow[6] = "Amount: " + amount;
  return {};
}

// Change the recurring entry that was clicked (every field comes from the edit panel)
function editRecurringRow(index, fields) {
  let row = recurringData[index];
  if (!row || row[0] === "-" || !String(row[0]).trim()) {
    throw new BudgetInputError("That recurring entry couldn't be found. Please try again.");
  }
  let title = capitalize(String(fields.title || "").replace(/\s+/g, ' ').trim());
  if (!title) throw new BudgetInputError("Give the recurring entry a title.");
  let hasAmount = typeof fields.amount === "number" && !isNaN(fields.amount);
  let sprite = String(fields.sprite || "").trim() || String(row[5] || "").trim() || "✔️";
  let startDate = fields.startDate ? createSafeMidnight(fields.startDate) : createSafeMidnight(row[2]);
  let endDate = resolveEndDate(fields.endDate ?? "None", row[4]);
  let frequency = String(fields.frequency || "").trim() || row[3];

  row[0] = title;
  row[1] = formatMoney(hasAmount ? fields.amount : parseAmount(row[1]));
  row[2] = formatToMMDDYYYY(startDate);
  row[3] = frequency;
  row[4] = endDate;
  row[5] = sprite;

  formEntryRow[2] = "✔️ Change Recurring";
  formEntryRow[3] = sprite + " " + title;
  formEntryRow[4] = frequency + ": " + row[2];
  formEntryRow[5] = "Expiration: " + endDate;
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

/* ---------- Tracker rows ---------- */

// Create a tracker row, or change the clicked one (or the one with this title).
// fields: { title, aliases: [{ title, count: "all" | "costs" | "gains" }], tracksTransfers: boolean (⭕️ title prefix) }
function trackerEntry(fields, index) {
  let baseTitle = capitalize(String(fields.title || "").replace(/⭕️/g, "").replace(/\s+/g, " ").trim());
  if (!baseTitle) throw new BudgetInputError("Give the tracker row a title.");
  let aliases = normalizeAliases(fields.aliases);
  let fullTitle = (fields.tracksTransfers ? "⭕️" : "") + baseTitle;

  if (index === null || index === undefined) {
    index = trackerData.findIndex((row, i) => i > 0 && String(row[0]).trim() !== "-" && cleanString(row[0]) === cleanString(baseTitle));
    if (index === -1) index = null;
  }

  if (index !== null) {
    let row = trackerData[index];
    if (!row || String(row[0]).trim() === "-") throw new BudgetInputError("That tracker row couldn't be found. Please try again.");
    // Gains, Costs, and Undefined are filled in automatically
    if (!TRACKER_AUTO_ROWS.includes(cleanString(row[0]))) {
      row[0] = fullTitle;
      row[4] = aliases;
    }
    formEntryRow[3] = "Changed: " + row[0];
    formEntryRow[4] = "Aliases: " + (describeAliases(row[4]) || "None");
    return {};
  }

  trackerData.push([fullTitle, "", "", "", aliases]);
  formEntryRow[3] = "Created: " + fullTitle;
  formEntryRow[4] = "Aliases: " + (describeAliases(aliases) || "None");
  return {};
}

// An alias is an entry title plus which of its amounts it counts: all, only costs, or only gains.
// They're stored the spreadsheet's way so existing rows keep working: "rent-" counts costs,
// "paycheck+" gains, and "atm" everything (so did the spreadsheet's "atm=").
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

// [{ title: "Rent", count: "costs" }, { title: "paycheck", count: "gains" }] -> "Rent-, paycheck+".
// Blanks are left out, and each title is kept once (one picked for costs and gains counts all of it).
function normalizeAliases(list) {
  let byTitle = new Map();
  for (let alias of Array.isArray(list) ? list : []) {
    let title = String(alias?.title ?? "").replace(/\s+/g, " ").replace(/[\s+=-]+$/, "").trim();
    let clean = cleanString(title);
    if (!clean) continue;
    let counted = byTitle.get(clean) || { title, costs: false, gains: false };
    if (alias.count !== "gains") counted.costs = true;
    if (alias.count !== "costs") counted.gains = true;
    byTitle.set(clean, counted);
  }
  return [...byTitle.values()]
    .map(alias => alias.title + ALIAS_SUFFIXES[alias.costs && alias.gains ? "all" : (alias.costs ? "costs" : "gains")])
    .join(", ");
}

// "rent-, paycheck+, atm" -> "rent (costs), paycheck (gains), atm": aliases in words, for people
function describeAliases(text) {
  return String(text ?? "").split(",").map(alias => parseAlias(alias)).filter(alias => alias.clean)
    .map(alias => alias.count === "all" ? alias.title : `${alias.title} (${alias.count})`)
    .join(", ");
}

/* ---------- Other Accounts ---------- */
// Accounts outside the budget, like Savings. A Hidden or Transfer entry titled with an account's name
// moves money into or out of it: the account gets the opposite of what the entry adds to the calendar
// (a $100 cost puts $100 in the account, a $100 gain takes $100 out). An account's balance is its start
// plus all of those changes, so changing, moving, or deleting one of its entries changes it too.
// accountsData.list: [0] column titles, then [name, start (its balance before any of its entries),
// "default" | ""]. The default account, Savings, is always there and can't be deleted.

const ACCOUNTS_VERSION = 2;
const DEFAULT_ACCOUNT = "Savings";
const MAX_ACCOUNT_NAME = 60;

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

// The accounts' names, in order (the account pickers list these)
function otherAccountNames() {
  return accountRows().map(account => account.name);
}

// Clean account name -> its account (a Map, so names like "constructor" are just names)
function accountTitleMap() {
  let byTitle = new Map();
  for (let account of accountRows()) {
    if (!byTitle.has(account.clean)) byTitle.set(account.clean, account);
  }
  return byTitle;
}

// The account an entry changes (a Hidden or Transfer entry titled with its name), or null.
// accounts: accountTitleMap(), passed in by loops so it's built once.
function linkedAccount(sprite, cleanTitle, accounts = accountTitleMap()) {
  let special = getSpecialType(String(sprite || ""));
  if (special !== "✖️" && special !== "⭕️") return null;
  return accounts.get(cleanTitle) || null;
}

// Transfers, and entries that change another account, move money between your own accounts:
// they aren't costs or gains (the tracker, search, and the recurring summary treat them alike)
function isMoveEntry(sprite, cleanTitle, accounts = accountTitleMap()) {
  return String(sprite || "").includes("⭕️") || linkedAccount(sprite, cleanTitle, accounts) !== null;
}

// Each account's balance today and on the calendar's last day, with the entries that changed it (and
// the ones on the calendar that will), newest first:
// [{ index, name, isDefault, start, today, calendarEnd, entries: [{ date, change, sprite }] }]
function accountSummaries() {
  let accounts = accountTitleMap();
  let summaries = new Map(accountRows().map(account => [account.index, {
    index: account.index,
    name: account.name,
    isDefault: isDefaultAccount(account.row),
    start: parseAmount(account.row[1]),
    today: 0,
    calendarEnd: 0,
    entries: []
  }]));

  const addCell = (cellText, date) => {
    let lines = String(cellText ?? "").split("\n");
    for (let l = 1; l < lines.length; l++) {
      let parts = getParts(lines[l]);
      if (parts.length < 3 || systemEmojis.includes(parts[0])) continue;
      let account = linkedAccount(parts[0], extractTitle(lines[l]), accounts);
      let change = -parseAmount(parts[1]);
      if (account && change !== 0) summaries.get(account.index).entries.push({ date, change, sprite: parts[0] });
    }
  };
  for (let r = 3; r >= 0; r--) {
    for (let c = 6; c >= 0; c--) addCell(calendarData[r][c], gridDates[r][c]);
  }
  for (let r = 1; r < historyData.length; r++) {
    for (let c = 6; c >= 0; c--) {
      let date = createSafeMidnight(String(historyData[r][c] ?? "").split("\n")[0].trim(), true);
      if (!isNaN(date.getTime())) addCell(historyData[r][c], date);
    }
  }

  const round = (amount) => Math.round(amount * 100) / 100;
  return [...summaries.values()].map(summary => {
    summary.entries.sort((a, b) => b.date - a.date);
    let throughToday = summary.entries.filter(entry => entry.date <= today).reduce((total, entry) => total + entry.change, 0);
    let throughCalendar = summary.entries.reduce((total, entry) => total + entry.change, 0);
    summary.today = round(summary.start + throughToday);
    summary.calendarEnd = round(summary.start + throughCalendar);
    return summary;
  });
}

// New account (index null) or change the tapped one. fields: { name, balance: number | null }.
// Setting a balance sets the account's start so that its balance today is that amount (a new account
// starts at $0.00). A new name goes on its entries and tracker aliases too, so they stay with it.
function accountEntry(fields, index) {
  let name = capitalize(String(fields.name || "").replace(/\s+/g, " ").trim());
  let clean = cleanString(name);
  if (!clean) throw new BudgetInputError("Give the account a name, like Cash or Investments.");
  if (name.length > MAX_ACCOUNT_NAME) throw new BudgetInputError(`Account names can be up to ${MAX_ACCOUNT_NAME} characters.`);
  let balance = fields.balance ?? null;
  if (balance !== null && (typeof balance !== "number" || !Number.isFinite(balance))) {
    throw new BudgetInputError("Enter the balance as a number, like 250.00.");
  }

  let list = accountsData.list;
  let isNew = index === null || index === undefined;
  let row = isNew ? null : list[index];
  if (!isNew && (!row || index < 1 || !cleanString(row[0]))) throw new BudgetInputError("That account couldn't be found. Please try again.");
  let taken = accountRows().find(account => account.clean === clean && account.row !== row);
  if (taken) throw new BudgetInputError(`You already have an account called ${taken.name}.`);

  formEntryRow[5] = "";
  if (isNew) {
    row = [name, formatMoney(0), ""];
    list.push(row);
    if (balance === null) balance = 0;
    formEntryRow[2] = "🏦 New Account";
  } else {
    let oldName = String(row[0]).trim();
    if (cleanString(oldName) !== clean) {
      renameAccountEntries(cleanString(oldName), name);
      formEntryRow[5] = "Renamed From: " + oldName;
    }
    row[0] = name;
    formEntryRow[2] = "🏦 Change Account";
  }

  let summary = accountSummaries().find(account => account.index === list.indexOf(row));
  if (balance !== null) {
    row[1] = formatMoney(balance - (summary.today - summary.start));
    summary.today = balance;
  }
  formEntryRow[3] = "Account: " + name;
  formEntryRow[4] = "Balance: " + formatMoney(summary.today);
  return {};
}

// A renamed account keeps its entries: Hidden and Transfer entries with the old name (on the calendar,
// in History, Upcoming, and Recurring) and tracker aliases for it get the new name
function renameAccountEntries(oldClean, newName) {
  const isAccountEntry = (sprite, title) => {
    let special = getSpecialType(String(sprite || ""));
    return (special === "✖️" || special === "⭕️") && cleanString(title) === oldClean;
  };
  const renameCell = (cellText) => {
    let lines = String(cellText ?? "").split("\n");
    let renamed = false;
    for (let l = 1; l < lines.length; l++) {
      let parts = getParts(lines[l]);
      if (parts.length < 3 || systemEmojis.includes(parts[0]) || !isAccountEntry(parts[0], parts.slice(2).join(" "))) continue;
      lines[l] = `${parts[0]} ${parts[1]} ${newName}`;
      renamed = true;
    }
    return renamed ? mergeSameEntries(lines).join("\n") : cellText;
  };

  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 7; c++) calendarData[r][c] = renameCell(calendarData[r][c]);
  }
  for (let r = 1; r < historyData.length; r++) {
    for (let c = 0; c < 7; c++) historyData[r][c] = renameCell(historyData[r][c]);
  }

  // Upcoming: rename, then combine any that now match another entry on the same day
  let futureKept = [futureData[0]];
  let futureByKey = new Map();
  for (let f = 1; f < futureData.length; f++) {
    let row = futureData[f];
    if (isAccountEntry(row[3], row[0])) row[0] = newName;
    let key = String(row[2]).trim() + "|" + cleanString(row[0]) + "|" + String(row[3]).trim();
    let same = cleanString(row[0]) ? futureByKey.get(key) : undefined;
    if (same) {
      same[1] = formatMoney(parseAmount(same[1]) + parseAmount(row[1]));
      continue;
    }
    futureByKey.set(key, row);
    futureKept.push(row);
  }
  futureData = futureKept;

  for (let i = 2; i < recurringData.length; i++) {
    let row = recurringData[i];
    if (String(row[0]).trim() !== "-" && isAccountEntry(row[5], row[0])) row[0] = newName;
  }

  for (let i = 1; i < trackerData.length; i++) {
    let row = trackerData[i];
    let rowType = cleanString(row[0]);
    if (String(row[0]).trim() === "-" || TRACKER_AUTO_ROWS.includes(rowType)) continue;
    let aliases = String(row[4] || "").split(",").map(alias => parseAlias(alias)).filter(alias => alias.clean);
    if (!aliases.some(alias => alias.clean === oldClean)) continue;
    row[4] = normalizeAliases(aliases.map(alias => ({ title: alias.clean === oldClean ? newName : alias.title, count: alias.count })));
  }
}

// One line per title and type on a day (a rename can make two the same): their amounts add together
function mergeSameEntries(lines) {
  let kept = [lines[0]];
  let byKey = new Map();
  for (let l = 1; l < lines.length; l++) {
    let parts = getParts(lines[l]);
    if (parts.length < 3 || systemEmojis.includes(parts[0])) {
      kept.push(lines[l]);
      continue;
    }
    let key = parts[0] + "|" + extractTitle(lines[l]);
    if (!byKey.has(key)) {
      byKey.set(key, kept.length);
      kept.push(lines[l]);
      continue;
    }
    let at = byKey.get(key);
    let first = getParts(kept[at]);
    kept[at] = `${first[0]} ${formatMoney(parseAmount(first[1]) + parseAmount(parts[1]))} ${first.slice(2).join(" ")}`;
  }
  return kept;
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
// The default account (Savings) can't be deleted; a deleted account's entries stay as they are.
function deleteTableRows(tableName, indexes) {
  let table = ROW_TABLES[tableName];
  let rows = table.get();
  let valid = [...new Set(indexes)]
    .filter(i => Number.isInteger(i) && i >= table.headerRows && i < rows.length)
    .sort((a, b) => b - a);
  if (valid.length === 0) throw new BudgetInputError("Nothing is selected to delete.");
  let locked = tableName === "accounts" ? valid.find(i => isDefaultAccount(rows[i])) : undefined;
  if (locked !== undefined) throw new BudgetInputError(`${rows[locked][0]} is your default account, so it can't be deleted.`);

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

/* ---------- Search (the old Search tab, now the home page's search bar) ---------- */

// Find entries by title and date in History, the calendar, Future Dates, and recurring entries past
// the calendar. terms: the search bar's list, one title per line, each with its own buttons (which
// replace the spreadsheet's rent-, rent+ and car stuff=): match "all", "costs" (only costs), "gains"
// (only gains), or "category" (the title is a tracker row: find what the row counts). With no titles,
// the first line's buttons pick everything, every cost, or every gain. Blank From = from the start,
// blank To = to the end.
// query: { terms: [{ title, match }], from, to } as typed.
// Returns { results: [{ date, amount, sprite, title, isMove, checked }], from, to, searchingFor }
function search(query) {
  // 1. Date range
  let rawFrom = String(query.from || "").trim();
  let rawTo = String(query.to || "").trim();
  let fromDate = rawFrom ? parseTypedDate(rawFrom) : null;
  let toDate = rawTo ? parseTypedDate(rawTo) : null;
  if ((fromDate && isNaN(fromDate.getTime())) || (toDate && isNaN(toDate.getTime()))) {
    throw new BudgetInputError("Search dates should look like MM/DD/YYYY.");
  }
  if (fromDate && toDate && fromDate.getTime() > toDate.getTime()) [fromDate, toDate] = [toDate, fromDate];
  let startTime = fromDate ? fromDate.getTime() : -Infinity;
  let endTime = toDate ? toDate.getTime() : Infinity;
  let dateA = fromDate ? formatToMMDDYYYY(fromDate) : "the start";
  let dateB = toDate ? formatToMMDDYYYY(toDate) : "the end";
  const inRange = (time) => time >= startTime && time <= endTime;

  // 2. What to find: targets for one title each (or every title), and whose amounts they count
  let { targets, searchingFor } = searchTargets(query.terms);
  let targetsByTitle = new Map();
  let everyTitle = [];
  for (let target of targets) {
    if (target.clean === null) everyTitle.push(target);
    else targetsByTitle.set(target.clean, [...(targetsByTitle.get(target.clean) || []), target]);
  }

  // An entry is found when a target for its title counts its amount. Moves (transfers, and entries
  // that change another account) start unchecked, unless a tracker row that counts transfers found them.
  let searchResults = [];
  let accounts = accountTitleMap();
  const addIfFound = (date, amount, sprite, title, cleanTitle) => {
    let found = [...everyTitle, ...(targetsByTitle.get(cleanTitle) || [])].filter(target => aliasCounts(target.count, amount));
    if (found.length === 0) return;
    let isMove = isMoveEntry(sprite, cleanTitle, accounts);
    searchResults.push({ date, amount, sprite, title, isMove, checked: !isMove || found.some(target => target.withTransfers) });
  };

  // 3. Future Dates entries
  for (let i = futureData.length - 1; i >= 1; i--) {
    let row = futureData[i];
    if (!row || !String(row[0]).trim()) continue;
    let cellDate = createSafeMidnight(row[2], true);
    if (isNaN(cellDate.getTime()) || !inRange(cellDate.getTime())) continue;
    addIfFound(cellDate, parseAmount(row[1]), String(row[3] || ""), String(row[0]), cleanString(row[0]));
  }

  // 4. Recurring entries past the calendar (calendar days are searched directly below), skipping
  //    days a Future Dates temp blocks. Projected up to two years ahead.
  if (toDate && toDate.getTime() > gridEndDate.getTime()) {
    let lastDay = new Date(Math.min(toDate.getTime(), addDays(today, 730).getTime()));
    let firstDay = addDays(gridEndDate, 1);
    if (fromDate && fromDate.getTime() > firstDay.getTime()) firstDay = fromDate;
    let recurringRows = getParsedRecurringRows();
    let blockers = new Set();
    for (let f = 1; f < futureData.length; f++) {
      let futureSprite = String(futureData[f][3] || "");
      if (!futureSprite.includes("✔️")) continue;
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
        addIfFound(new Date(day), row.amt, String(row.sprite || ""), row.title, row.parsed.cleanTitle);
      }
    }
  }

  // 5. Calendar and 6. History entries
  const searchCellLines = (cellText, cellDate) => {
    let lines = String(cellText).split("\n");
    for (let l = 1; l < lines.length; l++) {
      let parts = getParts(lines[l]);
      if (systemEmojis.includes(parts[0]) || parts.length < 3) continue;
      addIfFound(cellDate, parseAmount(parts[1]), parts[0], parts.slice(2).join(" "), extractTitle(lines[l]));
    }
  };
  for (let r = 3; r >= 0; r--) {
    for (let c = 6; c >= 0; c--) {
      if (inRange(gridDates[r][c].getTime())) searchCellLines(calendarData[r][c], gridDates[r][c]);
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
// withTransfers }], searchingFor: "rent (costs only), the Food tracker row" }. See search() for terms.
const SEARCH_MATCHES = ["all", "costs", "gains", "category"];

function searchTargets(terms) {
  let lines = (Array.isArray(terms) ? terms : []).map(term => ({
    title: String(term?.title ?? "").replace(/\s+/g, " ").trim(),
    match: SEARCH_MATCHES.includes(term?.match) ? term.match : "all"
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
  for (let { title, match } of filled) {
    if (match !== "category") {
      targets.push({ clean: cleanString(title), count: match, withTransfers: false });
      described.push(title + (match === "all" ? "" : ` (${match} only)`));
      continue;
    }

    // Tracker: the title is a tracker row. Find what the row counts: each of its aliases with its own
    // costs/gains setting (Costs and Gains count every cost or gain), and transfers if it counts them.
    let index = trackerData.findIndex((row, i) => i > 0 && String(row[0]).trim() !== "-" && cleanString(row[0]) === cleanString(title));
    if (index === -1) throw new BudgetInputError(`There's no tracker row called "${title}".`);
    if (rowsFound.has(index)) continue;
    rowsFound.add(index);

    let row = trackerData[index];
    let rowType = cleanString(row[0]);
    described.push(`the ${String(row[0]).replace(/⭕️/g, "").trim()} tracker row`);
    if (rowType === "costs" || rowType === "gains") {
      targets.push({ clean: null, count: rowType, withTransfers: false });
      continue;
    }
    let withTransfers = String(row[0]).startsWith("⭕️") || rowType === "undefined"; // Undefined counts transfers too
    for (let alias of String(row[4] || "").split(",")) {
      let { clean, count } = parseAlias(alias);
      if (clean) targets.push({ clean, count, withTransfers });
    }
  }
  return { targets, searchingFor: described.join(", ") };
}

/* ---------- Rebuilding the calendar (the spreadsheet's worker functions) ---------- */

// Move Future Dates entries onto the calendar once their day is on it, and build the
// "Upcoming" list (everything still past the calendar, by date)
function upcomingEntriesMaintanence() {
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
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 7; c++) {
        if (formatToMMDD(fDate) === formatToMMDD(gridDates[r][c]) && fDate <= gridEndDate) {
          calendarData[r][c] += `\n${fSprite} ${formatMoney(fAmt)} ${fTitle}`;
          futureRowsToDeleteIndexes.push(i);
        }
      }
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
    futureData.sort((a, b) => (new Date(a[2]).getTime() || 0) - (new Date(b[2]).getTime() || 0));
    futureData.unshift(header);
  }
  upcomingEntries = futureData.slice(1)
    .filter(row => String(row[0]).trim() !== "")
    .map(row => ({ date: createSafeMidnight(row[2], true), sprite: String(row[3]), amount: parseAmount(row[1]), title: String(row[0]).trim() }))
    .filter(upcoming => !isNaN(upcoming.date.getTime()));
}

// Write recurring entries onto every calendar day from today on, respecting temps (a temp with
// the same title blocks the entry that day) and combining into same-type unique entries.
// Expired recurring entries are queued for deleteExpiredReccurrings.
function writeRecurring() {
  for (let i = 2; i < recurringData.length; i++) {
    if (!recurringData[i] || recurringData[i][0] === "-") continue;
    let title = String(recurringData[i][0]).trim();
    if (!title) continue;
    let amt = parseAmount(String(recurringData[i][1]));
    let endDateVal = String(recurringData[i][4]);
    let sprite = recurringData[i][5];

    // Set for deletion if expired
    let effectiveEndDate = endDateVal && endDateVal !== "None" ? createSafeMidnight(endDateVal, true) : "None";
    if (endDateVal.trim() !== "None" && today.getTime() > effectiveEndDate.getTime()) {
      recurringToDeleteIndexes.push(i);
      continue;
    }
    // If not expired, check if it should be entered into the visible budget
    calendarChecks:
    for (let r = 3; r >= 0; r--) {
      for (let c = 6; c >= 0; c--) {
        let cellDate = gridDates[r][c];
        if (cellDate.getTime() < today.getTime()) break calendarChecks;
        if (!recurringHits(title, cellDate, getSpecialType(sprite))) continue;

        let cellLines = calendarData[r][c].split("\n");
        let hasTemp = false;
        let hasUnique = false;
        entryChecks:
        for (let l = 0; l < cellLines.length; l++) {
          let parts = getParts(cellLines[l]);
          let cleanLineTitle = extractTitle(cellLines[l]);
          if (cleanLineTitle === cleanString(title)) {
            if (parts[0].includes("✔️")) {
              hasTemp = true;
              break entryChecks;
            }
            let lineSpecial = getSpecialType(parts[0]);
            let recurringSpecial = getSpecialType(sprite);
            if (lineSpecial === recurringSpecial) {
              hasUnique = true;
              let newAmt = amt + parseAmount(parts[1]);
              let newSprite = parts[0] + "✔️";
              cellLines[l] = newSprite + " " + formatMoney(newAmt) + " " + title;
              calendarData[r][c] = cellLines.join("\n");
              break entryChecks;
            }
          }
        }
        // Respect manual overrides; otherwise write the recurring entry as normal
        if (!hasTemp && !hasUnique) {
          calendarData[r][c] += `\n${sprite} ${formatMoney(amt)} ${title}`;
        }
      }
    }
  }
}

// Remove expired recurring entries. Their temps from today on become plain unique entries,
// so ending a recurring entry never changes days that already passed.
function deleteExpiredReccurrings() {
  let deletedAny = false;
  recurringToDeleteIndexes = [...new Set(recurringToDeleteIndexes)].sort((a, b) => a - b);
  for (let i = recurringToDeleteIndexes.length - 1; i >= 0; i--) {
    deletedRecurrings++;
    deletedAny = true;
    let targetIndex = recurringToDeleteIndexes[i];
    let title = cleanString(recurringData[targetIndex][0]);
    let tempSprite = getSpecialType(recurringData[targetIndex][5]) + "✔️";
    let todayTime = today.getTime();

    // Update temps on the calendar
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 7; c++) {
        let lines = calendarData[r][c].split("\n");
        for (let l = lines.length - 1; l >= 1; l--) {
          if (gridDates[r][c].getTime() < todayTime || extractTitle(lines[l]) !== title) continue;
          let parts = getParts(lines[l]);
          if (parts[0] === tempSprite) {
            parts[0] = getSpecialType(tempSprite);
            lines[l] = parts.join(" ");
          }
        }
        calendarData[r][c] = lines.join("\n");
      }
    }

    // Update temps in Future Dates
    for (let f = futureData.length - 1; f >= 1; f--) {
      if (cleanString(futureData[f][0]) !== title) continue;
      if (futureData[f][3] === tempSprite) {
        futureData[f][3] = getSpecialType(tempSprite);
      }
    }
    recurringData.splice(targetIndex, 1);
  }
  if (isDailyUpdate) formEntryRow[6] = "Recurrings Expired: " + deletedRecurrings;
  return deletedAny;
}

// Order each day's entries by type, then alphabetize within each type
function organizeCellEntries() {
  let orderingData = calendarData.map(row => row.map(() => ""));
  function extractSortingTitle(wholeLine) {
    return cleanString(getParts(wholeLine).slice(2).join(" "));
  }
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 7; c++) {
      let oldLines = calendarData[r][c].split("\n");
      let newLines = [];
      let cellArray = {
        uncategorized: [],
        oneTimes: [],
        temps: [],
        hidTemps: [],
        hiddens: [],
        moveTemps: [],
        moves: [],
        hidRecs: [],
        moveRecs: [],
        recs: []
      };
      // Add date header
      newLines.push(oldLines[0] + "\n");
      for (let l = 1; l < oldLines.length; l++) {
        let currentLine = oldLines[l];
        // Guard against blank/whitespace lines
        if (!currentLine.trim()) continue;
        if (currentLine.startsWith("❗️ ")) cellArray.oneTimes.push(currentLine + "\n");
        else if (currentLine.startsWith("❗️✔️ ")) cellArray.temps.push(currentLine + "\n");
        else if (currentLine.startsWith("✖️✔️ ")) cellArray.hidTemps.push(currentLine + "\n");
        else if (currentLine.startsWith("✖️ ")) cellArray.hiddens.push(currentLine + "\n");
        else if (currentLine.startsWith("✔️✖️ ")) cellArray.hidRecs.push(currentLine + "\n");
        else if (currentLine.startsWith("⭕️✔️ ")) cellArray.moveTemps.push(currentLine + "\n");
        else if (currentLine.startsWith("⭕️ ")) cellArray.moves.push(currentLine + "\n");
        else if (currentLine.startsWith("✔️⭕️ ")) cellArray.moveRecs.push(currentLine + "\n");
        else if (currentLine.startsWith("✔️ ")) cellArray.recs.push(currentLine + "\n");
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
      let gains = 0;
      let costs = 0;
      let moneyMoves = 0;
      let isToday = (formatToMMDD(gridDates[r][c]) === formatToMMDD(today));
      for (let l = 1; l < lines.length; l++) {
        let lineStr = lines[l].trim();
        let parts = getParts(lineStr);
        if (systemEmojis.includes(parts[0])) continue;
        // Hidden entries are on accounts outside the budget: the tracker counts them, In Bank doesn't
        if (parts[0].includes("✖️")) continue;
        let lineAmt = parseAmount(parts[1]);
        if (parts[0].includes("⭕️")) {
          moneyMoves += lineAmt;
        } else if (lineAmt < 0) {
          costs += Math.abs(lineAmt);
          if (isToday) manualNotif = true;
        } else {
          gains += lineAmt;
        }
      }
      let inBank = Math.round((gains - costs + lastInBank + moneyMoves) * 100) / 100;
      if (gridDates[r][c] >= today && inBank < lowest) lowest = inBank;

      let bankLine;
      if (inBank < 0) {
        bankLine = `⛔️ ${formatMoney(inBank)} In Bank`;
        if (gridDates[r][c].getTime() >= today.getTime()) visibleNegatives++;
        if (isToday) negativeNotif = true;
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

// The 28 days after the calendar: lowest balance (and when) and the balance on day 28.
// Also counts uncommon recurring entries (3 month, 6 month, yearly) visible from today on.
function getPredictionData(lastInBank) {
  let visibleDay = createSafeMidnight(gridStartDate);
  let testDay = createSafeMidnight(nextFourStart);
  let todayTime = today.getTime();

  let daysDone = 0;
  let lowest = Infinity;
  let lowestDate = new Date(testDay.getTime());

  let parsedFuture = [];
  for (let f = 1; f < futureData.length; f++) {
    let fTitle = cleanString(futureData[f][0]);
    let fAmt = parseAmount(futureData[f][1]);
    let fSprite = futureData[f][3] || "";

    parsedFuture.push({
      title: fTitle,
      amt: fAmt,
      time: createSafeMidnight(futureData[f][2]).getTime(),
      sprite: fSprite,
      special: getSpecialType(futureData[f][3])
    });
  }

  while (daysDone < 28) {
    let dayTotal = 0;
    let currentTestTime = testDay.getTime();
    let currentVisibleTime = visibleDay.getTime();

    for (let r = 2; r < recurringData.length; r++) {
      let recurringTitle = cleanString(recurringData[r][0]);
      if (!recurringTitle) continue;
      let recurringAmt = parseAmount(recurringData[r][1]);
      let recurringSprite = String(recurringData[r][5] || "");
      let recurringSpecial = getSpecialType(recurringSprite);
      let recurringFrequency = cleanString(recurringData[r][3]);

      if (recurringFrequency === "3 month" || recurringFrequency === "6 month" || recurringFrequency === "yearly") {
        if (currentVisibleTime >= todayTime && recurringHits(recurringData[r][0], visibleDay, recurringSpecial)) {
          visibleUncommons++;
        }
      }
      if (recurringSprite.includes("✖️")) continue;
      if (recurringHits(recurringTitle, testDay, recurringSpecial)) {
        let hasNoOverride = true;
        for (let f = 0; f < parsedFuture.length; f++) {
          if (parsedFuture[f].time !== currentTestTime) continue;
          if (parsedFuture[f].title !== recurringTitle) continue;
          if (parsedFuture[f].sprite.includes("✔️") && parsedFuture[f].special === recurringSpecial) {
            hasNoOverride = false;
            break;
          }
        }
        if (hasNoOverride) dayTotal += recurringAmt;
      }
    }

    for (let f = 0; f < parsedFuture.length; f++) {
      // Hidden entries don't change In Bank (hidden recurring entries are skipped above)
      if (parsedFuture[f].time === currentTestTime && parsedFuture[f].special !== "✖️") dayTotal += parsedFuture[f].amt;
    }

    lastInBank += dayTotal;
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
    let futureDatesAmount = futureData.slice(1).filter(row => String(row[0]).trim() !== "").length;
    let tempDaveMessage = greetingPresets[todaysDay % 6];
    tempDaveMessage += nicknamePresets[todaysDay % 5];
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
      tempDaveMessage += allClearPresets[todaysDay % 3];
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
    tempDaveMessage += farewellPresets[todaysDay % 7];
    tempDaveMessage += affirmationPresets[todaysDay];
    message = tempDaveMessage;
  } catch (error) {
    console.log("Dave error: " + error);
    hadError = true;
  }
  daveMessage = message;
}

// Tracker sums (last 28 / 90 / 365 days) from the calendar and History, the Undefined row's
// aliases (titles no other row tracks), and the Recurring tab's monthly/yearly spending summary
function updateTrackerTab() {
  let yearly = 0;
  let monthly = 0;

  let activeTrackerData = trackerData.slice(1);
  let trackerRows = [];
  let coverage = new Map(); // Title -> which of its amounts the rows count ({ costs, gains }), for Undefined

  for (let r = 0; r < activeTrackerData.length; r++) {
    let title = String(activeTrackerData[r][0]).trim().toLowerCase();
    let rawAliases = String(activeTrackerData[r][4]);
    if (title === "-") {
      trackerRows.push({ title: activeTrackerData[r][1], sum28: 0, sum90: 0, sum365: 0, aliases: "", isSeparator: true, countsMoves: false });
      continue;
    }

    let aliases = rawAliases.split(",").map(t => t.trim()).filter(t => t !== "");
    if (!TRACKER_AUTO_ROWS.includes(title)) {
      for (let alias of aliases) {
        let { clean, count } = parseAlias(alias);
        if (!clean) continue;
        let counted = coverage.get(clean) || { costs: false, gains: false };
        if (count !== "gains") counted.costs = true;
        if (count !== "costs") counted.gains = true;
        coverage.set(clean, counted);
      }
    }
    trackerRows.push({ title: title, sum28: 0, sum90: 0, sum365: 0, aliases: aliases, isSeparator: false, countsMoves: title.startsWith("⭕️") });
  }

  let costIndex = trackerRows.findIndex(row => !row.isSeparator && row.title.toLowerCase() === "costs");
  if (costIndex === -1) {
    trackerRows.push({ title: "Costs", sum28: 0, sum90: 0, sum365: 0, aliases: ["Leave Empty"], isSeparator: false, countsMoves: false });
    costIndex = trackerRows.length - 1;
  }

  let gainIndex = trackerRows.findIndex(row => !row.isSeparator && row.title.toLowerCase() === "gains");
  if (gainIndex === -1) {
    trackerRows.push({ title: "Gains", sum28: 0, sum90: 0, sum365: 0, aliases: ["Leave Empty"], isSeparator: false, countsMoves: false });
    gainIndex = trackerRows.length - 1;
  }

  let undefIndex = trackerRows.findIndex(row => !row.isSeparator && row.title.toLowerCase() === "undefined");
  if (undefIndex === -1) {
    trackerRows.push({ title: "Undefined", sum28: 0, sum90: 0, sum365: 0, aliases: [], isSeparator: false, countsMoves: true });
    undefIndex = trackerRows.length - 1;
  } else {
    // Only remove from Undefined if the alias is FULLY covered by other rows (costs and gains)
    trackerRows[undefIndex].aliases = trackerRows[undefIndex].aliases.filter(alias => {
      let counted = coverage.get(cleanString(alias));
      return !(counted && counted.costs && counted.gains);
    });
  }

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
    if (tr === undefIndex || tr === costIndex || tr === gainIndex || trackerRows[tr].isSeparator) continue;
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

  let accounts = accountTitleMap();
  for (let i = 0; i < pastCells.length; i++) {
    counter++;
    if (counter > 365) break;
    let cellText = pastCells[i];
    if (!cellText) continue;
    let lines = cellText.split("\n");
    for (let l = 1; l < lines.length; l++) {
      let lineStr = lines[l].trim();
      let lineTitle = extractTitle(lineStr);
      let parts = getParts(lineStr);
      if (systemEmojis.includes(parts[0])) continue;

      let lineAmt = parseAmount(parts[1]);
      if (lineAmt === 0) continue;

      // Transfers (and entries that change another account) move money between your own accounts,
      // so they aren't costs or gains
      let isMove = isMoveEntry(parts[0], lineTitle, accounts);
      if (lineAmt > 0 && !isMove) addToRow(trackerRows[gainIndex], lineAmt);
      if (lineAmt < 0 && !isMove) addToRow(trackerRows[costIndex], lineAmt);

      // Every row tracking this title counts it, once each (moves only in rows that count transfers)
      let countedBy = new Set();
      for (let match of aliasDictionary.get(lineTitle) || []) {
        let row = trackerRows[match.trackerIndex];
        if (countedBy.has(row) || !aliasCounts(match.count, lineAmt)) continue;
        if (isMove && !row.countsMoves) continue;
        countedBy.add(row);
        addToRow(row, lineAmt);
      }

      // Everything no row tracks goes to Undefined (including moves)
      if (countedBy.size === 0) {
        if (!trackerRows[undefIndex].aliases.includes(lineTitle)) trackerRows[undefIndex].aliases.push(lineTitle);
        addToRow(trackerRows[undefIndex], lineAmt);
      }

      if (lineAmt < 0 && counter <= pastDays && !isMove) yearly += lineAmt;
    }
  }

  // Write the sums back (rows that were missing get added at the end)
  let newRows = trackerRows.map((trackerRow, r) => {
    let row = r < activeTrackerData.length ? [...activeTrackerData[r]] : [trackerRow.title, "", "", "", ""];
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
  newRows[gainIndex][4] = trackerRows[gainIndex].aliases.join(", ");
  newRows[costIndex][4] = trackerRows[costIndex].aliases.join(", ");
  trackerData = [trackerData[0], ...newRows];

  // Recurring summary: projected spending this year (on top of what's already spent) and per month.
  // Like the spending so far, moves (like a transfer to savings) aren't spending.
  for (let i = 2; i < recurringData.length; i++) {
    let title = String(recurringData[i][0]).trim();
    let amt = parseAmount(String(recurringData[i][1]));
    let startDate = createSafeMidnight(recurringData[i][2], true);
    let frequency = String(recurringData[i][3]).toLowerCase().trim();
    let endDateVal = recurringData[i][4];
    if (!title || title === "-" || isNaN(startDate.getTime()) || amt >= 0) continue;
    if (isMoveEntry(String(recurringData[i][5] || ""), cleanString(title), accounts)) continue;

    let endOfThisYear = createSafeMidnight(new Date(today.getFullYear(), 11, 31));
    let effectiveEndDate = endOfThisYear;
    if (endDateVal && String(endDateVal).trim() !== "None") {
      let parsedEndDate = createSafeMidnight(endDateVal);
      if (parsedEndDate < endOfThisYear) effectiveEndDate = parsedEndDate;
    }
    let effectiveStartDate = (startDate > today) ? startDate : today;
    let activeDaysThisYear = getDayDifference(effectiveEndDate, effectiveStartDate) + 1;
    if (activeDaysThisYear <= 0) continue;

    if (frequency === "yearly") {
      let expenseThisYearDate = createSafeMidnight((startDate.getMonth() + 1) + "/" + startDate.getDate() + "/" + today.getFullYear());
      if (expenseThisYearDate >= today && expenseThisYearDate <= effectiveEndDate) {
        yearly += amt;
        monthly += amt / 12;
      }
    } else if (frequency === "weekly") {
      yearly += (activeDaysThisYear / 7) * amt;
      monthly += amt * 4;
    } else if (frequency === "biweekly" || frequency === "bi-weekly") {
      yearly += (activeDaysThisYear / 14) * amt;
      monthly += amt * 2;
    } else if (frequency === "semi-monthly") { // The 1st and 15th: twice a month
      yearly += (activeDaysThisYear / 15.208) * amt;
      monthly += amt * 2;
    } else if (frequency === "3 month") {
      yearly += (activeDaysThisYear / 91.25) * amt;
      monthly += amt / 3;
    } else if (frequency === "6 month") {
      yearly += (activeDaysThisYear / 182.5) * amt;
      monthly += amt / 6;
    } else {
      yearly += (activeDaysThisYear / 30.416) * amt;
      monthly += amt;
    }
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

// Recurring frequencies the spreadsheet called "uncommon" (Dave and the ✔️ reminder count them)
const UNCOMMON_FREQUENCIES = ["3 month", "6 month", "yearly"];
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

  // Uncommon recurring payments per day, through the end of the last day's 4-week calendar
  let uncommonRows = recurringRows.filter(row => UNCOMMON_FREQUENCIES.includes(row.parsed.frequency));
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
      // Future Dates entries, then recurring entries, then the In Bank math (like the catch-up)
      let text = formatToMMDD(day);
      for (let f of futureByDate.get(day.getTime()) || []) {
        text += `\n${String(futureData[f][3])} ${formatMoney(parseAmount(futureData[f][1]))} ${String(futureData[f][0]).trim()}`;
      }
      let math = applyCellBudgetMath(writeRecurringToCell(text, day, recurringRows), inBank);
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

// Send the plan (and this device's time zone) to the API when it changed. Never blocks the page.
// force sends it even if this browser already did (Settings does this when a reminder is turned on).
function queueReminderPlanSync(force = false) {
  reminderSync = reminderSync
    .then(() => syncReminderPlan(force))
    .catch(err => { console.warn("Couldn't send the reminder plan:", err); return false; });
  return reminderSync;
}

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

async function saveChanges() {
  console.log("Saving data changes...");
  // Grab the JWT token instead of the user ID
  const token = localStorage.getItem('prismal_jwt');
  if (!token) {
    console.error("No active session found. Changes not saved.");
    return false; // Stop execution if logged out
  }

  // Never save before the real data has loaded: the empty placeholders would overwrite it
  if (!workspaceLoaded) {
    console.error("Workspace hasn't loaded yet. Changes not saved.");
    return false;
  }

  // Becomes false if any section fails to save (returned to the caller)
  let allSaved = true;

  // Reusable request helper with Authorization JWT headers.
  // Non-critical tables (Change Logs) don't count against allSaved.
  async function sendUpdate(endpoint, payload, critical = true) {
    // Skip tables whose stored copy couldn't be read, so it isn't replaced
    const tableName = endpoint.replace('/api/data/update-', '');
    if (unsavableTables.has(tableName)) {
      console.error(`Not saving "${tableName}": its stored data couldn't be read when loading.`);
      if (critical) allSaved = false;
      return false;
    }
    const ok = await postUpdate(endpoint, payload);
    if (!ok && critical) allSaved = false;
    return ok;
  }

  async function postUpdate(endpoint, payload) {
    const result = await budgetApi(endpoint, payload);
    if (result.status === 401) {
      // Token is likely expired or invalid, handle auto-logout here if desired
      console.error("Session expired.");
    }
    return result.ok;
  }

  // Quick entries stored in this table go with it, so the API drops them from its queue in the same save
  async function sendTable(table, data) {
    const done = [...quickEntryAcks[table]];
    const ok = await sendUpdate(`/api/data/update-${table}`, done.length > 0 ? { data, quickEntriesDone: done } : { data });
    if (ok) quickEntryAcks[table] = quickEntryAcks[table].filter(id => !done.includes(id));
    return ok;
  }

  // 1. Future
  if (typeof futureEdited !== 'undefined' && futureEdited) {
    const success = await sendTable('future', futureData);
    if (success) futureEdited = false;
  }

  // 2. Calendar
  if (typeof calendarEdited !== 'undefined' && calendarEdited) {
    const success = await sendTable('calendar', calendarData);
    if (success) calendarEdited = false;
  }

  // 3. Recurring
  if (typeof recurringEdited !== 'undefined' && recurringEdited) {
    const success = await sendUpdate('/api/data/update-recurring', { data: recurringData });
    if (success) recurringEdited = false;
  }

  // 4. Tracker
  if (typeof trackerEdited !== 'undefined' && trackerEdited) {
    const success = await sendUpdate('/api/data/update-tracker', { data: trackerData });
    if (success) trackerEdited = false;
  }

  // 5. History
  if (typeof historyEdited !== 'undefined' && historyEdited) {
    const success = await sendTable('history', historyData);
    if (success) historyEdited = false;
  }

  // 6. Search
  if (typeof searchEdited !== 'undefined' && searchEdited) {
    const success = await sendUpdate('/api/data/update-search', { data: searchData });
    if (success) searchEdited = false;
  }

  // 7. Calculator
  if (typeof calculatorEdited !== 'undefined' && calculatorEdited) {
    const success = await sendUpdate('/api/data/update-calculator', { data: calculatorData });
    if (success) calculatorEdited = false;
  }

  // 8. Other Accounts (and the LLC equity tables)
  if (accountsEdited) {
    const success = await sendUpdate('/api/data/update-accounts', { data: accountsData });
    if (success) accountsEdited = false;
  }

  // 9. Change Logs (non-critical: a failed log save doesn't hold back the daily update's date)
  if (logsEdited) {
    const success = await sendUpdate('/api/data/update-logs', { data: logsData }, false);
    if (success) logsEdited = false;
  }

  return allSaved;
}

// One request to the API with the login token: a POST of JSON when there's a payload, a GET otherwise.
// Resolves to { ok, status, data } and never throws (status 0 = the server couldn't be reached).
async function budgetApi(endpoint, payload) {
  const token = localStorage.getItem('prismal_jwt');
  if (!token) return { ok: false, status: 401, data: null };
  try {
    const res = await fetch(`${window.API_BASE_URL}${endpoint}`, {
      method: payload === undefined ? 'GET' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}` // Standard JWT Bearer token format
      },
      body: payload === undefined ? undefined : JSON.stringify(payload)
    });
    let data = null;
    try { data = await res.json(); } catch (e) {}
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    console.error(`Failed to reach ${endpoint}:`, err);
    return { ok: false, status: 0, data: null };
  }
}

//#endregion

// =====================================================================
// #region OTHER HELPERS
// =====================================================================

// An LLC equity table by its spreadsheet tab name (e.g. "C Revenue 2026"), or null
function getTableData(tabName) {
  let equity = accountsData && accountsData.equity;
  return equity && Object.prototype.hasOwnProperty.call(equity, tabName) ? equity[tabName] : null;
}

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

// Rebuild the Other Accounts store: { version: 2, list, equity }
//   list: [0] column titles, then [name, start, "default" | ""] (see OTHER ACCOUNTS). The default
//         account, Savings, is added if it's missing.
//   equity: the LLC version's equity tables, { tabName: table } (see processEquity), kept as stored.
//           Before version 2, the whole store was these tables.
function normalizeApiAccounts(rawData) {
  let parsed = rawData;
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed); } catch (e) { parsed = {}; }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) parsed = {};
  let isCurrent = parsed.version === ACCOUNTS_VERSION;

  let storedEquity = isCurrent ? parsed.equity : parsed;
  let equity = {};
  if (storedEquity && typeof storedEquity === 'object' && !Array.isArray(storedEquity)) {
    for (let tabName of Object.keys(storedEquity)) {
      if (tabName === "__proto__") continue; // Would replace the object's prototype instead of adding a table
      equity[tabName] = normalizeApiTable(storedEquity[tabName], TABLE_SHAPES.account);
    }
  }

  let list = normalizeApiTable(isCurrent ? parsed.list : [], TABLE_SHAPES.accounts);
  list[0] = ["Account", "Start", "Default"];
  if (!list.some((row, i) => i > 0 && isDefaultAccount(row))) {
    let savings = list.findIndex((row, i) => i > 0 && cleanString(row[0]) === cleanString(DEFAULT_ACCOUNT));
    if (savings !== -1) list[savings][2] = "default";
    else list.splice(1, 0, [DEFAULT_ACCOUNT, formatMoney(0), "default"]);
  }
  return { version: ACCOUNTS_VERSION, list, equity };
}

function formatGrid(dbArray, rows, cols) {
  const grid = [];
  let index = 0;
  
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
      // Safely grab the content if it exists in the DB, otherwise default to ""
      if (dbArray && dbArray[index]) {
        row.push(dbArray[index].content || "");
      } else {
        row.push("");
      }
      index++;
    }
    grid.push(row);
  }
  return grid;
}

function normalizeApiGrid(rawData, rows, cols) {
  let parsed = rawData;
  
  // 1. If the DB returned stringified JSON, parse it
  if (typeof rawData === 'string') {
    try { parsed = JSON.parse(rawData); } catch(e) { parsed = []; }
  }
  
  // 2. Ensure it is an array
  if (!Array.isArray(parsed)) parsed = [];
  
  // 3. Flatten whatever shape the DB returned (1D or 2D) so we can safely reconstruct it
  let flatData = parsed.flat(Infinity);
  
  // 4. Rebuild into a perfect RxC 2D grid
  let grid = [];
  let index = 0;
  for (let r = 0; r < rows; r++) {
    let row = [];
    for (let c = 0; c < cols; c++) {
      // Grab data, convert to string, default to empty string if missing
      row.push(flatData[index] !== undefined ? String(flatData[index]) : "");
      index++;
    }
    grid.push(row);
  }
  return grid;
}

function createSafeMidnight(input, failable = false) {
  if (!input) input = new Date();

  // Helper: Creates a local Date object at exactly 00:00:00.000
  // In the browser, this automatically uses the user's local timezone.
  const getLocalMidnight = (year, monthIndex, day) => {
    return new Date(year, monthIndex, day, 0, 0, 0, 0);
  };

  // 1. If input is already a Date object
  if (input instanceof Date) {
    if (isNaN(input)) {
      return failable ? new Date("invalid") : getLocalMidnight(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
    }
    return getLocalMidnight(input.getFullYear(), input.getMonth(), input.getDate());
  }

  // 2. If input is a string
  if (typeof input === 'string') {
    let trimmed = input.trim();
    
    // Match "MM/DD" or "M/D" (e.g., "12/25")
    if (/^\d{1,2}\/\d{1,2}$/.test(trimmed)) {
      let [m, d] = trimmed.split("/").map(Number);
      let now = new Date();
      let currentYear = now.getFullYear();
      let currentMonth = now.getMonth() + 1; // getMonth is 0-indexed (0-11)
      
      let targetYear = currentYear;
      if (m === 12 && currentMonth === 1) targetYear--;
      else if (m === 1 && currentMonth === 12) targetYear++;
      
      return getLocalMidnight(targetYear, m - 1, d);
    }
    
    // Match "MM/DD/YYYY" or "M/D/YYYY"
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmed)) {
      let [m, d, y] = trimmed.split("/").map(Number);
      return getLocalMidnight(y, m - 1, d);
    }
    
    // Match "YYYY-MM-DD"
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      let [y, m, d] = trimmed.split("-").map(Number);
      return getLocalMidnight(y, m - 1, d);
    }
    
    // Fallback for random valid date strings (e.g. "Oct 12, 2026")
    let parsedDate = new Date(trimmed);
    if (!isNaN(parsedDate.getTime())) {
      return getLocalMidnight(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate());
    }
  }

  // 3. Fail states or final fallback
  console.log("Create Safe Midnight function failed on input:", input);
  if (failable) return new Date("invalid");
  
  // Default to returning "Today at Midnight"
  let now = new Date();
  return getLocalMidnight(now.getFullYear(), now.getMonth(), now.getDate());
}

// A typed date (MM/DD/YYYY, M/D, or YYYY-MM-DD) as local midnight, or an invalid Date when it
// isn't a real day (13/45/2026 doesn't quietly roll over into next year)
function parseTypedDate(text) {
  let trimmed = String(text || "").trim();
  let parsed = createSafeMidnight(trimmed, true);
  if (isNaN(parsed.getTime())) return parsed;
  let numbers = trimmed.match(/^(\d{1,4})[\/-](\d{1,2})(?:[\/-](\d{1,4}))?$/);
  if (numbers) {
    let isoStyle = numbers[1].length === 4;
    let month = Number(isoStyle ? numbers[2] : numbers[1]);
    let day = Number(isoStyle ? numbers[3] : numbers[2]);
    if (parsed.getMonth() + 1 !== month || parsed.getDate() !== day) return new Date("invalid");
  }
  return parsed;
}

function getGridDates() {
  // Uses global `today`
  let now = createSafeMidnight(today ? new Date(today.getTime()) : new Date());
  
  // native getDay(): 0 = Sun, 1 = Mon, ..., 6 = Sat
  let dayOfWeek = now.getDay();
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

function getDayDifference(date1, date2) {
	// Direct timestamp difference rounded to nearest day
	return Math.round((date1.getTime() - date2.getTime()) / 86400000);
}

function getParts(line) {
  return String(line).trim().split(/\s+/);
}

function formatToMMDDYYYY(dateObj) {
  const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
  const dd = String(dateObj.getDate()).padStart(2, '0');
  const yyyy = dateObj.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

// "YYYY-MM-DD" (local date), the API's reminder plan format
function formatToYMD(dateObj) {
  const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
  const dd = String(dateObj.getDate()).padStart(2, '0');
  return `${dateObj.getFullYear()}-${mm}-${dd}`;
}

function formatToMMDD(dateObj) {
  if (!(dateObj instanceof Date) || isNaN(dateObj.getTime())) {
    return "";
  }

  // FAST PATH: Check cache by millisecond timestamp
  let cacheKey = dateObj.getTime();
  if (mmddCache.has(cacheKey)) {
    return mmddCache.get(cacheKey);
  }

  // SLOW PATH: Native local browser formatting (MM/dd)
  let mm = String(dateObj.getMonth() + 1).padStart(2, '0');
  let dd = String(dateObj.getDate()).padStart(2, '0');
  let formattedDate = `${mm}/${dd}`;

  mmddCache.set(cacheKey, formattedDate);
  return formattedDate;
}

function formatMoney(amount) {
	let rounded = Math.round(amount * 100) / 100;
	let isNegative = rounded < 0;
	let absAmt = Math.abs(rounded)
		.toFixed(2);
	return isNegative ? `-$${absAmt}` : `$${absAmt}`;
}

function parseAmount(val) {
	if (!val) return 0;
	let str = String(val)
		.replace(/[^\d.-]/g, '');
	if (str.startsWith("-")) {
		return -Math.abs(parseFloat(str)) || 0;
	}
	return parseFloat(str) || 0;
}

function extractTitle(line, clean = true) {
	if (!line) return "";
	// 1. Split the line into an array using any whitespace
	let parts = getParts(line)
	if (parts.length <= 2) return "";
	// 2. Extract and join everything starting from index 2 (split[2] onwards)
	let title = parts.slice(2)
		.join(" ");
	if (clean) title = cleanString(title);
	return title;
}

function cleanString(title) {
	if (!title) return "";
	title = String(title).toLowerCase().replace(/\s+/g, ' ').replace(/[^a-zA-Z0-9 ]/g, "").trim();
	return title;
}

function extractAmountByTitle(cellString, targetTitle) {
	let lines = String(cellString).split("\n");
	targetTitle = cleanString(targetTitle);
	for (let l = 0; l < lines.length; l++) {
		if (extractTitle(lines[l]) === targetTitle) {
			let amount = lines[l].split(" ")[1];
			return parseAmount(amount);
		}
	}
	return 0;
}


function padAndCleanArray(array, colCount) {
	return array.map(row => {
		let rawRow = Array.isArray(row) ? [...row] : [row];
		if (rawRow.length < colCount) {
			while (rawRow.length < colCount) {
				rawRow.push("");
			}
		} else if (rawRow.length > colCount) {
			rawRow = rawRow.slice(0, colCount);
		}
		return rawRow.map(cell => cell === null || cell === undefined ? "" : cell);
	});
}


function capitalize(string) {
	let parts = getParts(string);
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].length > 0) {
      // Finds the first letter in the word (a-z or A-Z) and capitalizes it
      parts[i] = parts[i].replace(/[a-zA-Z]/, char => char.toUpperCase());
    }
  }
  return parts.join(" ");
}

function getSpecialType(emo) {
	if (!emo) return "❗️";
	if (emo.includes("✖️")) return "✖️";
	if (emo.includes("⭕️")) return "⭕️";
	return "❗️";
}

function combineSprites(existingSprite, incomingSprite) {
	let specialType = getSpecialType(existingSprite);
	let check = (existingSprite.includes("✔️") || incomingSprite.includes("✔️")) ? "✔️" : "";
	return specialType + check;
}

// Local midnight N days after date (handles month/year/DST rollover)
function addDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

// Returns the Recurring tab index of the entry with this title + special type that hits on date, or false
function recurringHits(title, date, targetSpecial) {
  const cleanTargetTitle = cleanString(title);

  for (let i = 2; i < recurringData.length; i++) {
    const item = recurringData[i];
    // 1. Quickest checks first
    if (!item || item[0] === "-" || cleanString(item[0]) !== cleanTargetTitle) continue;

    // 2. Check special type before doing date parsing (saves CPU)
    if (targetSpecial) {
      const emo = item[5] || "";
      if (getSpecialType(emo) !== targetSpecial) continue;
    }

    if (recurringRowHits(parseRecurringRow(item), date)) return i;
  }

  return false;
}

// Parse a Recurring tab row into what the date checks need (null for separators/empty rows)
function parseRecurringRow(item) {
  if (!item || item[0] === "-") return null;
  const rawEndDate = item[4];
  return {
    cleanTitle: cleanString(item[0]),
    special: getSpecialType(item[5] || ""),
    startDate: createSafeMidnight(item[2]),
    endDate: (rawEndDate && rawEndDate !== "None") ? createSafeMidnight(rawEndDate) : null,
    frequency: String(item[3]).toLowerCase().trim()
  };
}

// Does this parsed recurring row land on date?
function recurringRowHits(row, date) {
  if (date < row.startDate) return false;
  if (row.endDate && date > row.endDate) return false;

  const targetYear = date.getFullYear();
  const targetMonth = date.getMonth();
  const targetDateNum = date.getDate();
  const lastDayInMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
  const startDate = row.startDate;

  // Handles 31-day months rolling over to 30, AND Feb 29 rolling to Feb 28
  const targetDayNumGrid = Math.min(startDate.getDate(), lastDayInMonth);

  switch (row.frequency) {
    case "yearly":
      return targetMonth === startDate.getMonth() && targetDateNum === targetDayNumGrid;

    case "weekly":
    case "bi-weekly":
    case "biweekly": {
      const diffDaysGrid = getDayDifference(date, startDate);
      const interval = row.frequency === "weekly" ? 7 : 14;
      return diffDaysGrid >= 0 && diffDaysGrid % interval === 0;
    }

    case "semi-monthly":
      return targetDateNum === 1 || targetDateNum === 15;

    case "3 month":
    case "6 month": {
      if (targetDateNum !== targetDayNumGrid) return false;
      const monthDiff = (targetYear - startDate.getFullYear()) * 12 + targetMonth - startDate.getMonth();
      const step = row.frequency === "3 month" ? 3 : 6;
      return monthDiff >= 0 && monthDiff % step === 0;
    }

    default:
      // Monthly
      return targetDateNum === targetDayNumGrid;
  }
}

function parseGridData(raw) {
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch (e) {
      console.warn("Failed to parse grid string:", e);
      return raw;
    }
  }
  return raw;
}

window.updateGridCell = async function(gridName, row, col, textValue) {
  // Map the string name to your actual global arrays and edit flags
  const gridMap = {
    'calendar':   { data: calendarData,   setFlag: () => calendarEdited = true },
    'recurring':  { data: recurringData,  setFlag: () => recurringEdited = true },
    'tracker':    { data: trackerData,    setFlag: () => trackerEdited = true },
    'future':     { data: futureData,     setFlag: () => futureEdited = true },
    'history':    { data: historyData,    setFlag: () => historyEdited = true },
    'search':     { data: searchData,     setFlag: () => searchEdited = true },
    'calculator': { data: calculatorData, setFlag: () => calculatorEdited = true }
  };

  const target = gridMap[gridName];

  if (!target) {
    console.error(`❌ Grid "${gridName}" not found. Valid options are: ${Object.keys(gridMap).join(", ")}`);
    return;
  }

  // 1. Update the 2D array safely
  if (!target.data[row]) target.data[row] = [];
  target.data[row][col] = textValue;

  // 2. Set the correct "Edited" flag to true so saveChanges() picks it up
  target.setFlag();

  // 3. Optional UI Sync: If it's the calendar, try to update the DOM immediately
  if (gridName === 'calendar') {
    const index = (row * 7) + col;
    const cell = document.querySelectorAll('.elastic-table .cell-content')[index];
    if (cell) cell.innerText = textValue;
  } else {
    // For other tables, it will save in the background, but you might need to refresh to see it visually
    console.log(`ℹ️ Background data for '${gridName}' updated. Refresh to see visual changes if it's currently on screen.`);
  }

  // 4. Trigger the backend save
  console.log(`⏳ Saving "${gridName}" cell [${row}][${col}]...`);
  await saveChanges();
  console.log(`✅ Update complete! Changed to: "${textValue}"`);
};

//#endregion

// =====================================================================
// #region LAYOUT FUNCTIONS
// =====================================================================

// Only the home page has the calendar table; on other pages these listeners are skipped
const table = document.querySelector('.elastic-table');

// 1. TOUCH: TWO-FINGER PINCH & DRAG

let isTransforming = false;
let targetEl = null;
let startDist = 0, startAngle = 0;
let startCenterX = 0, startCenterY = 0;

const getDistance = (t1, t2) => Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
const getAngle = (t1, t2) => Math.atan2(t2.clientY - t1.clientY, t2.clientX - t1.clientX) * (180 / Math.PI);
const getCenter = (t1, t2) => ({ x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 });

table?.addEventListener('touchstart', (e) => {
  if (e.touches.length === 2) {
    isTransforming = true;
    
    const t1 = e.touches[0];
    const t2 = e.touches[1];
    const cell1 = t1.target.closest('td');
    const cell2 = t2.target.closest('td');
    
    if (cell1 && cell1 === cell2) {
      targetEl = cell1.querySelector('.cell-content');
      cell1.style.zIndex = '20';
      targetEl.style.overflow = 'visible';
    } else {
      targetEl = table;
    }

    startDist = getDistance(t1, t2);
    startAngle = getAngle(t1, t2);
    const center = getCenter(t1, t2);
    startCenterX = center.x;
    startCenterY = center.y;
    targetEl.style.transition = 'none'; 
  }
}, { passive: false });

table?.addEventListener('touchmove', (e) => {
  if (isTransforming && e.touches.length === 2) {
    e.preventDefault(); 
    const t1 = e.touches[0];
    const t2 = e.touches[1];
    
    const scale = getDistance(t1, t2) / startDist;
    const rotate = getAngle(t1, t2) - startAngle;
    const center = getCenter(t1, t2);
    const translateX = center.x - startCenterX;
    const translateY = center.y - startCenterY;
    
    targetEl.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale}) rotate(${rotate}deg)`;
  }
}, { passive: false });

const endTransform = (e) => {
  if (isTransforming && e.touches.length < 2) {
    isTransforming = false;
    targetEl.style.transition = ''; 
    targetEl.style.transform = ''; 
    targetEl.style.overflow = '';
    
    const parentTd = targetEl.closest('td');
    if (parentTd) parentTd.style.zIndex = '';
    targetEl = null;
  }
};

table?.addEventListener('touchend', endTransform);
table?.addEventListener('touchcancel', endTransform);

// 2. CLICK TO EDIT (PERSISTENT ZOOM)

window.editingCell = false;
let activeEditCell = null; 

table?.addEventListener('click', (e) => {
  if (e.target.closest('.cell-action-btn')) {
    const cell = e.target.closest('td');
    if (cell) {
      cell.classList.remove('is-editing', 'is-magnified');
      window.editingCell = false;
      activeEditCell = null;
    }
    e.stopPropagation(); 
    return;
  }

  const cell = e.target.closest('td');
  if (!cell) return;
  if (activeEditCell === cell) return;
  if (activeEditCell) activeEditCell.classList.remove('is-editing');

  window.editingCell = true;
  activeEditCell = cell;
  cell.classList.add('is-editing');
  e.stopPropagation(); 
});

document.addEventListener('click', (e) => {
  if (!window.editingCell || !activeEditCell) return;
  if (activeEditCell.contains(e.target)) return;
  if (e.target.closest('.budgetPanel')) return; // Working in an entry's panel keeps its day zoomed

  window.editingCell = false;
  activeEditCell.classList.remove('is-editing');
  activeEditCell = null;
});

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

// Load (and daily-update) the workspace. Page scripts wait on this before rendering:
//   window.workspaceReady.then(loaded => { if (loaded) render(); });
// The Quick Entry page only borrows the helpers here: it has no login, so it never loads a budget.
window.workspaceReady = window.PAGE === "quick" ? Promise.resolve(false) : loadWorkspace();