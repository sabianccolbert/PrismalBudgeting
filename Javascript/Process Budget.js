
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
  accounts:   { cols: 3, minRows: 1 },  // Other Accounts: [0] column titles, then [name, balance, "default" | ""]
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
let dataRevision = null;         // The budget's revision this page holds (see saveChanges); null until it loads
let budgetConflict = false;      // A save was refused: the budget was saved somewhere else since this page loaded
let savingNow = false;

// =====================================================================
// #region META FUNCTIONS
// =====================================================================

async function loadWorkspace() {
  isDailyUpdate = true;
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
    if (isNewAccount) pendingProcessedDate = formatToMMDDYYYY(today);
    const isNewDay = lastDailyUpdate.getTime() < today.getTime();

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
  let sheetDays = sheetEntriesByDay(lastDailyUpdate, yesterday);

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
        cell.text = writeRecurringToCell(cell.text, cell.date, recurringRows);
        cell.text = writeSheetsToCell(cell.text, sheetDays.get(cellTime));
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
      // A unique with the same special type absorbs the recurring amount
      hasUnique = true;
      let newAmt = row.amt + parseAmount(parts[1]);
      let newSprite = parts[0] + "✔️";
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
    console.log("Successfully saved new processing date:", dateString);
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
Other Accounts (like Savings) are changed by Hidden and Transfer entries titled with their names,
see OTHER ACCOUNTS below.
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

// New calendar entry. entry: { title, sprite, amount (signed number), date }. Can be undone.
function addCalendarEntry(entry) {
  return runBudgetAction("", () => {
    const added = unique({
      title: entry.title,
      sprite: entry.sprite,
      action: entry.amount > 0 ? "add" : "subtract",
      amount: String(Math.abs(entry.amount)),
      date: entry.date
    });
    return { purchase: { title: entry.title, amount: entry.amount, date: createSafeMidnight(entry.date || today), type: added.entryType } };
  }, { label: `added ${capitalize(String(entry.title || "").trim())} (${formatMoney(entry.amount)}) on ${showDay(createSafeMidnight(entry.date || today))}`, dates: [entry.date || today] });
}

// Change, move, or delete a calendar entry. change: { title, sprite, date, action, amount, moveDate }.
// Can be undone.
function changeCalendarEntry(change) {
  return runBudgetAction("", () => unique(change), { label: describeEntryChange(change), dates: [change.date, change.moveDate].filter(Boolean) });
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

// Search bar. query: { terms: [{ title, match: "all" | "costs" | "gains" | "category" }], from, to }.
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

// queue: [{ id, entry: { title, type, amount, date: "YYYY-MM-DD" } }] from the API, oldest first
async function applyQuickEntries(queue) {
  if (!Array.isArray(queue) || queue.length === 0) return;
  let added = 0;
  const failed = [];
  for (const quick of queue) {
    // Each can be undone on the calendar, like a New Entry
    const entry = quick && quick.entry;
    const date = entry ? createSafeMidnight(entry.date, true) : null;
    const undo = entry && date && !isNaN(date.getTime())
      ? { label: `quick entry ${capitalize(String(entry.title || "").trim())} (${formatMoney(entry.amount)}) on ${showDay(date)}`, dates: [date] }
      : null;
    const result = await runBudgetAction("", () => quickEntry(quick), undo);
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
    throw new BudgetInputError(`${showDate(date)} is before your budget's History starts.`);
  }
  const added = unique({
    title: entry.title,
    sprite: Object.prototype.hasOwnProperty.call(QUICK_ENTRY_TYPES, entry.type) ? QUICK_ENTRY_TYPES[entry.type] : "",
    action: entry.amount > 0 ? "add" : "subtract",
    amount: String(Math.abs(entry.amount)),
    date
  });
  formEntryRow[5] = "⚡ Quick Entry"; // Where "Move To" goes (quick entries never move)
  return { quickEntry: { id: quick.id, table }, purchase: { title: entry.title, amount: entry.amount, date, type: added.entryType } };
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
// (snapshotTables). undo: { label, dates } makes it a step Undo can take back (calendar and quick entries;
// see UNDO + REDO)
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
    if (undo) result.newUndoStep = makeUndoStep(undo.label, undoBefore);
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
  upcomingEntriesMaintanence();
  writeRecurring();
  writeSheetEntries();
  releaseEndedTemps();
  releaseSheetTemps();
  if (deleteExpiredReccurrings()) recurringEdited = true;
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
  formEntryRow[4] = "On: " + showDate(dateObj);
  let dateMove = createSafeMidnight(entry.moveDate || dateObj);
  formEntryRow[5] = entry.moveDate ? "Move To: " + showDate(dateMove) : "Move To: None";

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
  let isOriginalVirginRecurring = (!!source && !isExisting && !outData.hasBlocker);
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

  // 5. Inject $0 Blockers (Unless is going into history tab)
  if (dateObj.getTime() >= gridStartDate.getTime()) {
    if (isOriginalVirginRecurring || isMismatchedVirgin) {
      if (dateObj.getTime() !== dateMove.getTime() || finalAmt !== baseAmtOriginal || action === "delete") {
        let blockerSprite = getSpecialType(source.sprite) + source.mark;
        injectOrDefer("set", dateObj, 0, title, blockerSprite);
      }
    } else if (hasOriginalCheckmark && source && (dateObj.getTime() !== dateMove.getTime() || action === "delete")) {
      // Only inject the blocker if the entry wasn't ALREADY a $0 blocker.
      if (outData.oldAmt !== 0) {
        let blockerSprite = getSpecialType(outData.oldSprite) + originalMark;
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
        } else if (isOriginalVirginRecurring) {
          moveSprite = targetIncomingSpecial + virginMark;
        }
      } else {
        if (isOriginalVirginRecurring || (isExisting && hasOriginalCheckmark)) {
          moveSprite = targetIncomingSpecial + virginMark;
        }
      }
      // 7. Inject combined result back into target date
      injectOrDefer("set", dateMove, moveAmt, title, moveSprite);
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
// what was there through outData. Returns true when nothing matched.
function injectOrDefer(action, dateObj, newAmt, title, sprite = "❗️", outData = {}) {
  let notFound = true;
  let targetMMDD = formatToMMDD(dateObj);
  let cleanNewTitle = cleanString(String(title));

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
        sprite === "" ? "❗️" : sprite
      ]);
    }
  }
  return notFound;
}

/* ---------- Recurring entries (the old "Create/Change A Recurring Entry" form) ---------- */
// A title can have one recurring entry per refraction type (one Regular, one Hidden, and one Transfer),
// the same way a day can have one entry per title and type: so it's always clear which recurring entry
// a day's entry came from. Making a second one is refused; the existing one gets changed instead.

const REFRACTION_NAMES = new Map([["❗️", "Regular"], ["✖️", "Hidden"], ["⭕️", "Transfer"]]);

// The row (other than exceptIndex) with this title and refraction type, or -1
function recurringTwin(title, special, exceptIndex = -1) {
  let clean = cleanString(title);
  return recurringData.findIndex((row, i) => i >= 2 && i !== exceptIndex && String(row[0]).trim() !== "-" &&
    cleanString(row[0]) === clean && getSpecialType(String(row[5] || "")) === special);
}

// Refuse a recurring entry whose title and type another one already has
function refuseRecurringTwin(title, sprite, exceptIndex = -1) {
  let twin = recurringTwin(title, getSpecialType(sprite), exceptIndex);
  if (twin === -1) return;
  let type = REFRACTION_NAMES.get(getSpecialType(sprite));
  throw new BudgetInputError(`There's already a ${type} recurring entry called ${recurringData[twin][0]}. Each title can have one of each refraction type, so tap that one in the list to change it.`);
}

// "Every 2 Weeks" as typed in the panel, checked and stored the standard way
function readFrequency(text) {
  let frequency = parseFrequency(text);
  if (!frequency) throw new BudgetInputError(`How often should it land? Use a whole number from 1 to ${MAX_FREQUENCY_COUNT}, like every 2 weeks.`);
  return formatFrequency(frequency);
}

// Create a recurring entry (refused when one with its title and refraction type already exists).
// fields: { title, sprite: "✔️" | "✔️✖️" | "✔️⭕️", amount: number, frequency: "Every 2 Weeks" (blank = every
//           month), startDate: Date | null (today), endDate: Date | "None" | null }
function recurring(fields) {
  let title = capitalize(String(fields.title || "").replace(/\s+/g, ' ').trim());
  if (!title) throw new BudgetInputError("Give the recurring entry a title.");
  let sprite = String(fields.sprite || "").trim() || "✔️";
  refuseRecurringTwin(title, sprite);
  let frequency = readFrequency(fields.frequency || "Every Month");
  let hasAmount = typeof fields.amount === "number" && !isNaN(fields.amount);
  let startDate = fields.startDate ? createSafeMidnight(fields.startDate) : createSafeMidnight(today);
  let endDate = resolveEndDate(fields.endDate, "None");

  let amount = formatMoney(hasAmount ? fields.amount : 0);
  recurringData.push([title, amount, formatToMMDDYYYY(startDate), frequency, endDate, sprite]);

  formEntryRow[2] = "✔️ Create Recurring";
  formEntryRow[3] = sprite + " " + title;
  formEntryRow[4] = frequency + ": " + showDate(startDate);
  formEntryRow[5] = "Expiration: " + showStoredDate(endDate);
  formEntryRow[6] = "Amount: " + amount;
  return {};
}

// Change the recurring entry that was clicked (every field comes from the edit panel). A new title or
// type can't match another recurring entry's.
function editRecurringRow(index, fields) {
  let row = recurringData[index];
  if (!row || row[0] === "-" || !String(row[0]).trim()) {
    throw new BudgetInputError("That recurring entry couldn't be found. Please try again.");
  }
  let title = capitalize(String(fields.title || "").replace(/\s+/g, ' ').trim());
  if (!title) throw new BudgetInputError("Give the recurring entry a title.");
  let hasAmount = typeof fields.amount === "number" && !isNaN(fields.amount);
  let sprite = String(fields.sprite || "").trim() || String(row[5] || "").trim() || "✔️";
  refuseRecurringTwin(title, sprite, index);
  let startDate = fields.startDate ? createSafeMidnight(fields.startDate) : createSafeMidnight(row[2]);
  let endDate = resolveEndDate(fields.endDate ?? "None", row[4]);
  let frequency = readFrequency(String(fields.frequency || "").trim() || row[3]);

  // A new title or type takes the days that were changed for this entry along (moveRecurringTemps)
  let oldTitle = String(row[0]).trim();
  let oldSpecial = getSpecialType(String(row[5] || ""));
  let newSpecial = getSpecialType(sprite);
  if ((cleanString(oldTitle) !== cleanString(title) || oldSpecial !== newSpecial) && recurringTwin(oldTitle, oldSpecial, index) === -1) {
    moveRecurringTemps(cleanString(oldTitle), oldSpecial, title, newSpecial);
  }

  row[0] = title;
  row[1] = formatMoney(hasAmount ? fields.amount : parseAmount(row[1]));
  row[2] = formatToMMDDYYYY(startDate);
  row[3] = frequency;
  row[4] = endDate;
  row[5] = sprite;

  formEntryRow[2] = "✔️ Change Recurring";
  formEntryRow[3] = sprite + " " + title;
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
  const isOldTemp = (sprite, title) => String(sprite ?? "").trim() === oldSpecial + "✔️" && cleanString(title) === oldClean;
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 7; c++) {
      if (gridDates[r][c] < today) continue;
      let lines = String(calendarData[r][c]).split("\n");
      let moved = false;
      for (let l = 1; l < lines.length; l++) {
        let parts = getParts(lines[l]);
        if (parts.length < 3 || !isOldTemp(parts[0], parts.slice(2).join(" "))) continue;
        lines[l] = `${newSpecial}✔️ ${parts[1]} ${newTitle}`;
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
    row[3] = newSpecial + "✔️";
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
// stored the spreadsheet's way, a title with an ending, so imported rows keep working: "rent-" counts costs,
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
// Accounts outside the budget, like Savings. A Hidden or Transfer entry titled with an account's name
// moves money into or out of it (see accountChange):
//   - A Transfer moves money between the budget's account and this one, so the account gets the
//     opposite: a $100 Transfer cost takes $100 out of In Bank and puts $100 in the account.
//   - A Hidden entry happens in the account itself (In Bank never changes), so the account gets the
//     same amount: a $50 Hidden cost takes $50 out of it, and a $3,000 Hidden gain puts $3,000 in.
// An account's balance is all of those changes added up (there's no balance to type in: what's already
// in an account goes in as a Hidden gain), so changing, moving, or deleting one of its entries changes it too.
// accountsData.list: [0] column titles, then [name, balance today (filled in by updateAccountBalances, so
// the Quick Entry page can show it), "default" | ""]. The default account, Savings, is always there and
// can't be deleted.

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

// Each account's balance today goes in its row (the Quick Entry page can't add up the budget itself)
function updateAccountBalances() {
  for (let summary of accountSummaries()) accountsData.list[summary.index][1] = formatMoney(summary.today);
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

// Each account's balance today and on the calendar's last day, with the entries that changed it (and
// the ones on the calendar that will), newest first:
// [{ index, name, isDefault, today, calendarEnd, entries: [{ date, change, sprite }] }]
function accountSummaries() {
  let accounts = accountTitleMap();
  let summaries = new Map(accountRows().map(account => [account.index, {
    index: account.index,
    name: account.name,
    isDefault: isDefaultAccount(account.row),
    today: 0,
    calendarEnd: 0,
    entries: []
  }]));

  // dayOf(lines): the cell's day (only worked out for a cell with an account entry)
  const addCell = (cellText, dayOf) => {
    let lines = String(cellText ?? "").split("\n");
    let date = null;
    for (let l = 1; l < lines.length; l++) {
      const line = readLine(lines[l]);
      if (!line.title || line.system) continue;
      const account = linkedAccount(line.sprite, line.clean, accounts);
      const change = account ? accountChange(line.sprite, line.amount) : 0;
      if (!account || change === 0) continue;
      date = date || dayOf(lines);
      if (!isNaN(date.getTime())) summaries.get(account.index).entries.push({ date, change, sprite: line.sprite });
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
  return [...summaries.values()].map(summary => {
    summary.entries.sort((a, b) => b.date - a.date);
    summary.today = round(summary.entries.filter(entry => entry.date <= today).reduce((total, entry) => total + entry.change, 0));
    summary.calendarEnd = round(summary.entries.reduce((total, entry) => total + entry.change, 0));
    return summary;
  });
}

// New account (index null) or rename the tapped one. fields: { name }. A new name goes on its entries
// and tracker aliases too, so they stay with it. (Balances come from entries, so there's none to set.)
function accountEntry(fields, index) {
  let name = capitalize(String(fields.name || "").replace(/\s+/g, " ").trim());
  let clean = cleanString(name);
  if (!clean) throw new BudgetInputError("Give the account a name, like Cash or Investments.");
  if (name.length > MAX_ACCOUNT_NAME) throw new BudgetInputError(`Account names can be up to ${MAX_ACCOUNT_NAME} characters.`);

  let list = accountsData.list;
  let isNew = index === null || index === undefined;
  let row = isNew ? null : list[index];
  if (!isNew && (!row || index < 1 || !cleanString(row[0]))) throw new BudgetInputError("That account couldn't be found. Please try again.");
  let taken = accountRows().find(account => account.clean === clean && account.row !== row);
  if (taken) throw new BudgetInputError(`You already have an account called ${taken.name}.`);

  formEntryRow[3] = "Account: " + name;
  formEntryRow[4] = "";
  if (isNew) {
    list.push([name, formatMoney(0), ""]);
    formEntryRow[2] = "🏦 New Account";
    return {};
  }
  let oldName = String(row[0]).trim();
  if (cleanString(oldName) !== clean) {
    renameAccountEntries(cleanString(oldName), name);
    formEntryRow[4] = "Renamed From: " + oldName;
  }
  row[0] = name;
  formEntryRow[2] = "🏦 Change Account";
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
    if (isAccountEntry(futureData[f][3], futureData[f][0])) futureData[f][0] = newName;
  }
  combineSameUpcoming();

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

// A day has at most one entry per title and refraction type (so a title shows up at most three times:
// Regular, Hidden, and Transfer). A new entry combines with the one that's there (see injectOrDefer);
// this combines any that slipped in another way, like an account rename or older data. Amounts add
// together, and the checkmark stays if either had one (like writeRecurring combining into a unique).
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
    kept[at] = `${combineSprites(first[0], parts[0])} ${formatMoney(parseAmount(first[1]) + parseAmount(parts[1]))} ${first.slice(2).join(" ")}`;
  }
  return kept;
}

// The same for Upcoming: entries on one day with the same title and type become one, their amounts added
function combineSameUpcoming() {
  let kept = [futureData[0]];
  let byKey = new Map();
  for (let f = 1; f < futureData.length; f++) {
    let row = futureData[f];
    let key = String(row[2]).trim() + "|" + cleanString(row[0]) + "|" + String(row[3]).trim();
    let same = cleanString(row[0]) ? byKey.get(key) : undefined;
    if (same) {
      same[1] = formatMoney(parseAmount(same[1]) + parseAmount(row[1]));
      continue;
    }
    byKey.set(key, row);
    kept.push(row);
  }
  futureData = kept;
}

/* ---------- Connected spreadsheets ---------- */
// Entries from the person's own spreadsheets (Google Sheets, Excel, ...), set up in Settings. Each one says
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
// the same day is left out (Settings says so). A spreadsheet that's off keeps its entries (it's read again
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
      .map(entry => [text(entry[0], 10), getSpecialType(text(entry[1], 8)), Math.round((Number(entry[2]) || 0) * 100) / 100, text(entry[3], 100)]),
    problems: (Array.isArray(item.problems) ? item.problems : []).map(problem => text(problem, 500)).slice(0, 50),
    tabs: (Array.isArray(item.tabs) ? item.tabs : []).map(tab => text(tab, 100)).slice(0, 200),
    access: item.access === "shared" ? "shared" : "public"
  };
}

// The connection with this ID, or null
function sheetConnectionById(id) {
  return (sheetsData?.list || []).find(connection => connection.id === id) || null;
}

// New (id null) or changed connection. config: { name, link, fields }; read: { entries, problems, tabs, access },
// what reading it just now found (Spreadsheets.js readConnection)
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
    access: read.access
  });
  if (old) list[index] = connection;
  else list.push(connection);

  formEntryRow[2] = old ? "➕ Change Spreadsheet" : "➕ Connect Spreadsheet";
  formEntryRow[3] = "Spreadsheet: " + name;
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
// { title, clean, special, amount })). Entries with the same title and type on a day are one (amounts added).
// Only spreadsheets that are on, without the entries a recurring entry keeps off (see above), unless
// everything is asked for (includeOff: what can still land, for releaseSheetTemps).
function sheetEntriesByDay(from, to, includeOff = false) {
  const days = new Map();
  if (!sheetsData || to < from) return days;
  const fromTime = from.getTime();
  const toTime = to.getTime();
  for (const connection of sheetsData.list) {
    if (!connection.on && !includeOff) continue;
    for (const { date, time, title, clean, special, amount } of parsedSheetEntries(connection)) {
      if (time < fromTime || time > toTime) continue;
      if (!includeOff && recurringHits(title, date, special) !== false) continue;
      if (!days.has(time)) days.set(time, new Map());
      const day = days.get(time);
      const key = clean + "|" + special;
      const same = day.get(key);
      if (same) same.amount = Math.round((same.amount + amount) * 100) / 100;
      else day.set(key, { title, clean, special, amount });
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
// title (and type, when it's given) as { amount, sprite: "➕❗️", mark: "➕" }, or null. From today on only.
function sheetHit(title, date, special = null) {
  if (date < today) return null;
  const day = sheetEntriesByDay(date, date).get(date.getTime());
  if (!day) return null;
  const clean = cleanString(title);
  for (const entry of day.values()) {
    if (entry.clean === clean && (!special || entry.special === special)) return { amount: entry.amount, sprite: SHEET_MARK + entry.special, mark: SHEET_MARK };
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
// and type (or a recurring entry's) keeps one off, and a unique entry takes in its amount
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
      lines.push(`${SHEET_MARK}${entry.special} ${formatMoney(entry.amount)} ${entry.title}`);
      continue;
    }
    const line = readLine(lines[at]);
    if (entryMark(line.sprite)) continue;
    lines[at] = `${entry.special}${SHEET_MARK} ${formatMoney(line.amount + entry.amount)} ${line.title}`;
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
  const isReleased = (sprite, title) => {
    const special = getSpecialType(sprite);
    return String(sprite).trim() === special + SHEET_MARK && !known.has(cleanString(title) + "|" + special);
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
        else lines[l] = [getSpecialType(parts[0]), ...parts.slice(1)].join(" ");
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
    else row[3] = getSpecialType(String(row[3]));
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
// (only gains), or "category" (the title is a tracker row: find what the row counts). With no titles,
// the first line's buttons pick everything, every cost, or every gain. Blank From = from the start,
// blank To = to the end.
// query: { terms: [{ title, match }], from, to } as typed.
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
  if (fromDate && toDate && fromDate.getTime() > toDate.getTime()) [fromDate, toDate] = [toDate, fromDate];
  let startTime = fromDate ? fromDate.getTime() : -Infinity;
  let endTime = toDate ? toDate.getTime() : Infinity;
  let dateA = fromDate ? showDate(fromDate) : "the start";
  let dateB = toDate ? showDate(toDate) : "the end";
  const inRange = (time) => time >= startTime && time <= endTime;

  // 2. What to find: targets for one title each (or every title), and whose amounts they count
  let { targets, searchingFor } = searchTargets(query.terms);
  let targetsByTitle = new Map();
  let everyTitle = [];
  for (let target of targets) {
    if (target.clean === null) everyTitle.push(target);
    else targetsByTitle.set(target.clean, [...(targetsByTitle.get(target.clean) || []), target]);
  }

  // An entry is found when a target for its title counts its amount. Transfers start unchecked, unless a
  // tracker row that counts transfers found them.
  let searchResults = [];
  const addIfFound = (date, amount, sprite, title, cleanTitle) => {
    let isTransfer = isTransferEntry(sprite);
    let found = [...everyTitle, ...(targetsByTitle.get(cleanTitle) || [])].filter(target => aliasCounts(target.count, amount) && (!target.onlyTransfers || isTransfer));
    if (found.length === 0) return;
    searchResults.push({ date, amount, sprite, title, isTransfer, checked: !isTransfer || found.some(target => target.withTransfers) });
  };

  // 3. Future Dates entries
  for (let i = futureData.length - 1; i >= 1; i--) {
    let row = futureData[i];
    if (!row || !String(row[0]).trim()) continue;
    let cellDate = createSafeMidnight(row[2], true);
    if (isNaN(cellDate.getTime()) || !inRange(cellDate.getTime())) continue;
    addIfFound(cellDate, parseAmount(row[1]), String(row[3] || ""), String(row[0]), cleanString(row[0]));
  }

  // 4. Recurring entries and spreadsheets' entries past the calendar (calendar days are searched directly
  //    below), skipping days a Future Dates temp blocks. Projected up to two years ahead.
  if (toDate && toDate.getTime() > gridEndDate.getTime()) {
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
        addIfFound(new Date(day), row.amt, String(row.sprite || ""), row.title, row.parsed.cleanTitle);
      }
      for (let entry of sheetDays.get(day.getTime())?.values() || []) {
        if (blockers.has(day.getTime() + "|" + entry.clean + "|" + entry.special)) continue;
        addIfFound(new Date(day), entry.amount, SHEET_MARK + entry.special, entry.title, entry.clean);
      }
    }
  }

  // 5. Calendar and 6. History entries
  const searchCellLines = (cellText, cellDate) => {
    let lines = String(cellText).split("\n");
    for (let l = 1; l < lines.length; l++) {
      const line = readLine(lines[l]);
      if (line.system || !line.title) continue;
      addIfFound(cellDate, line.amount, line.sprite, line.title, line.clean);
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
// withTransfers }], searchingFor: "rent (costs only), the Food tracker row" }. See search() for terms.
const SEARCH_MATCHES = ["all", "costs", "gains", "category"];
// How Search suggests a tracker row that counts transfers ("Food (counts transfers)"): a suggestion list can't
// show the ⭕️ image (Sprites.js), only the device's own emoji
const COUNTS_TRANSFERS = "(counts transfers)";

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
// Expired recurring entries are queued for deleteExpiredReccurrings.
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
          // A unique entry takes in its amount
          hasUnique = true;
          cellLines[l] = `${line.sprite}✔️ ${formatMoney(amt + line.amount)} ${title}`;
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
function deleteExpiredReccurrings() {
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
    // (A budget brought over from the spreadsheet can have two rows for one title and type: the later End Date wins)
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
        if (parts[0] !== special + "✔️") continue; // Only temps
        let from = releaseFrom(extractTitle(lines[l]), special);
        if (from === null || gridDates[r][c].getTime() < from) continue;
        if (parseAmount(parts[1]) === 0) {
          lines.splice(l, 1);
        } else {
          parts[0] = special;
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
    if (sprite !== special + "✔️") continue;
    let from = releaseFrom(cleanString(row[0]), special);
    let date = createSafeMidnight(row[2], true);
    if (from === null || isNaN(date.getTime()) || date.getTime() < from) continue;
    if (parseAmount(row[1]) === 0) futureData.splice(f, 1);
    else row[3] = special;
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
        if (currentLine.startsWith("❗️ ")) cellArray.oneTimes.push(currentLine + "\n");
        else if (currentLine.startsWith("❗️✔️ ")) cellArray.temps.push(currentLine + "\n");
        else if (currentLine.startsWith("❗️➕ ")) cellArray.sheetTemps.push(currentLine + "\n");
        else if (currentLine.startsWith("✖️✔️ ")) cellArray.hidTemps.push(currentLine + "\n");
        else if (currentLine.startsWith("✖️➕ ")) cellArray.hidSheetTemps.push(currentLine + "\n");
        else if (currentLine.startsWith("✖️ ")) cellArray.hiddens.push(currentLine + "\n");
        else if (currentLine.startsWith("✔️✖️ ")) cellArray.hidRecs.push(currentLine + "\n");
        else if (currentLine.startsWith("⭕️✔️ ")) cellArray.transferTemps.push(currentLine + "\n");
        else if (currentLine.startsWith("⭕️➕ ")) cellArray.transferSheetTemps.push(currentLine + "\n");
        else if (currentLine.startsWith("⭕️ ")) cellArray.transfers.push(currentLine + "\n");
        else if (currentLine.startsWith("✔️⭕️ ")) cellArray.transferRecs.push(currentLine + "\n");
        else if (currentLine.startsWith("✔️ ")) cellArray.recs.push(currentLine + "\n");
        else if (currentLine.startsWith("➕✖️ ")) cellArray.hidSheets.push(currentLine + "\n");
        else if (currentLine.startsWith("➕⭕️ ")) cellArray.transferSheets.push(currentLine + "\n");
        else if (currentLine.startsWith("➕❗️ ")) cellArray.sheets.push(currentLine + "\n");
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

// The 28 days after the calendar: lowest balance (and when) and the balance on day 28, with recurring entries,
// connected spreadsheets' entries, and Future Dates. Also counts uncommon recurring entries (every 3 months or
// less often) visible from today on.
function getPredictionData(lastInBank) {
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
    for (let row of recurringRows) {
      if (isUncommonFrequency(row.parsed.frequency) && currentVisibleTime >= todayTime && recurringRowHits(row.parsed, visibleDay)) {
        visibleUncommons++;
      }
      if (String(row.sprite || "").includes("✖️")) continue;
      if (recurringRowHits(row.parsed, testDay) && !overridden(row.parsed.cleanTitle, row.parsed.special)) dayTotal += row.amt;
    }
    for (let entry of sheetDays.get(currentTestTime)?.values() || []) {
      if (entry.special !== "✖️" && !overridden(entry.clean, entry.special)) dayTotal += entry.amount;
    }

    for (let f = 0; f < parsedFuture.length; f++) {
      // Hidden entries don't change In Bank (hidden recurring entries are skipped above)
      if (parsedFuture[f].time === currentTestTime && parsedFuture[f].special !== "✖️") dayTotal += parsedFuture[f].amt;
    }

    lastInBank = Math.round((lastInBank + dayTotal) * 100) / 100; // To the cent, like every In Bank
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

/* ---------- Dave's tips (his "smart" messages) ---------- */
// Besides his everyday message, Dave has tips about things worth a closer look. The first time Home opens on a
// day, he shows one of that day's tips for 10 minutes, highlighted. Each visit after that (once the tip before
// has had its 10 minutes) shows the next one, until all of the day's tips have been shown; then he's back to
// his everyday message. A purchase that takes the budget below $0 (or further below) gets its tip right away.
// Which tips were shown is kept on this device (they're only reminders). Tips are worked out once per visit
// (startDaveVisit), never on every change, so they can't slow changes down. In this order:
//   payday:  today has a paycheck: about how much usually goes out, besides recurring bills, before the next
//            one (looking back 4 months, and only with 4 months of History)
//   pace:    the last 7 days' spending, besides recurring bills, is well over a usual week's (4 months of History)
//   savings: a big uncommon bill (or one-time cost added for a later day) is coming up in the next 60 days, and
//            how much to set aside from each paycheck until then
//   inBank:  once a week: compare In Bank with the bank, and add what's missing (or a Catchup entry)
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

// A weekly tip is due when it's never been shown on this device, or 7 days have passed since (others always are)
function weeklyTipDue(state, id) {
  if (!DAVE_WEEKLY_TIPS.includes(id)) return true;
  const last = state.weekly[id] ? createSafeMidnight(state.weekly[id], true) : null;
  return !last || isNaN(last.getTime()) || getDayDifference(today, last) >= 7;
}

// The weekly check: compare today's In Bank with the bank (once there are entries to check)
function inBankTip() {
  const spot = calendarSpot(today);
  const inBank = spot ? readInBank(calendarData[spot.r][spot.c]) : null;
  const hasEntries = historyData.slice(1).some(row => row.some(cell => String(cell ?? "").trim() !== "")) ||
    calendarData.some(row => row.some(cell => ownEntryLines(cell).length > 0));
  if (inBank === null || !hasEntries) return null;
  return `Time for your weekly check! Look at today's In Bank here (${formatMoney(inBank)}), and compare it with what your bank account actually has. Try to find which purchases are causing any difference, and add them in (on the day they happened, or just to today). Anything you can't find, just put in as "Catchup -$??" to fix your In Bank.`;
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
// and catchup is its Catchup costs. enough: History reaches back the whole 4 months. Worked out once per visit
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
      if (special !== "⭕️" && /^catch ?up$/.test(line.clean)) day.catchup -= line.amount;
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
// much to set aside from each paycheck until then (today's counts)
function savingsTip() {
  const lastDay = addDays(today, DAVE_BILL_DAYS);
  const uncommon = getParsedRecurringRows().filter(row => row.amt <= -DAVE_BIG_BILL && !isTransferEntry(row.sprite) && isUncommonFrequency(row.parsed.frequency));
  const uncommonKeys = new Set(uncommon.map(row => row.parsed.cleanTitle + "|" + row.parsed.special));
  const uncommonSheets = uncommonSheetKeys(); // A spreadsheet's cost with no other like it within 90 days
  const bills = [];

  // On the calendar after today: uncommon recurring and spreadsheet ones as they are there (one changed for its
  // day counts as changed), and one-time costs added for those days
  for (let day = addDays(today, 1); day <= gridEndDate && day <= lastDay; day = addDays(day, 1)) {
    const spot = calendarSpot(day);
    for (const line of String(calendarData[spot.r][spot.c]).split("\n").slice(1)) {
      const parts = getParts(line);
      const amount = parseAmount(parts[1]);
      if (amount > -DAVE_BIG_BILL || systemEmojis.includes(parts[0]) || isTransferEntry(parts[0])) continue;
      const key = extractTitle(line) + "|" + getSpecialType(parts[0]);
      const mark = entryMark(parts[0]);
      if (!mark || (mark === RECURRING_MARK ? uncommonKeys.has(key) : uncommonSheets.has(day.getTime() + "|" + key))) {
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
      if (entry.amount <= -DAVE_BIG_BILL && entry.special !== "⭕️" && uncommonSheets.has(key) && !changed.has(key)) {
        bills.push({ date: new Date(time), title: entry.title, amount: entry.amount });
      }
    }
  }
  for (const row of upcoming) {
    if (row.date > gridEndDate && row.date <= lastDay && row.amount <= -DAVE_BIG_BILL && !isTransferEntry(row.sprite)) bills.push(row);
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
      const lineTitle = line.clean;
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
      // Future Dates entries, then recurring entries and spreadsheets' entries, then the In Bank math (like
      // the catch-up)
      let text = formatToMMDD(day);
      for (let f of futureByDate.get(day.getTime()) || []) {
        text += `\n${String(futureData[f][3])} ${formatMoney(parseAmount(futureData[f][1]))} ${String(futureData[f][0]).trim()}`;
      }
      let math = applyCellBudgetMath(writeSheetsToCell(writeRecurringToCell(text, day, recurringRows), sheetDays.get(day.getTime())), inBank);
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
  console.log("Saving data changes...");
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
// (the server would refuse it), and the login page says why.
let signingOut = false;
function signedOutElsewhere() {
  if (signingOut || window.PAGE === "quick") return;
  signingOut = true;
  workspaceLoaded = false;
  if (typeof clearSignedInData === "function") clearSignedInData();
  else ["prismal_jwt", "prismal_username", "prismal_last_activity"].forEach(key => { try { localStorage.removeItem(key); } catch (e) {} });
  try { sessionStorage.setItem("prismal_signed_out", "expired"); } catch (e) {}
  window.location.replace("/login.html");
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

// Rebuild the Other Accounts store: { version: 3, list, equity }
//   list: [0] column titles, then [name, balance today, "default" | ""] (see Other Accounts in BUDGET
//         LOGIC). The default account, Savings, is added if it's missing. Balances come only from entries,
//         so a version 2 store's typed-in balance in [1] isn't kept.
//   equity: the spreadsheet's business-version (LLC) equity tables, { tabName: table }, kept as stored
//           (the website doesn't change them). A store without a version is only these tables.
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
  list[0] = ["Account", "Balance", "Default"];
  if (!list.some((row, i) => i > 0 && isDefaultAccount(row))) {
    let savings = list.findIndex((row, i) => i > 0 && cleanString(row[0]) === cleanString(DEFAULT_ACCOUNT));
    if (savings !== -1) list[savings][2] = "default";
    else list.splice(1, 0, [DEFAULT_ACCOUNT, formatMoney(0), "default"]);
  }
  return { version: ACCOUNTS_VERSION, list, equity };
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

// A day (a Date, or stored text: "MM/DD", "MM/DD/YYYY", or "YYYY-MM-DD") as local midnight in this device's
// time zone. Text it can't read is today, or an invalid Date when failable.
function createSafeMidnight(input, failable = false) {
  if (!input) input = new Date();

  const getLocalMidnight = (year, monthIndex, day) => {
    return new Date(year, monthIndex, day, 0, 0, 0, 0);
  };

  if (input instanceof Date) {
    if (isNaN(input)) {
      return failable ? new Date("invalid") : getLocalMidnight(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
    }
    return getLocalMidnight(input.getFullYear(), input.getMonth(), input.getDate());
  }

  if (typeof input === 'string') {
    let trimmed = input.trim();

    // "MM/DD" (a calendar day's first line): the nearest year, around New Year's too
    if (/^\d{1,2}\/\d{1,2}$/.test(trimmed)) {
      let [m, d] = trimmed.split("/").map(Number);
      let now = new Date();
      let currentYear = now.getFullYear();
      let currentMonth = now.getMonth() + 1;

      let targetYear = currentYear;
      if (m === 12 && currentMonth === 1) targetYear--;
      else if (m === 1 && currentMonth === 12) targetYear++;

      return getLocalMidnight(targetYear, m - 1, d);
    }

    // "MM/DD/YYYY" (or "M/D/YYYY")
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmed)) {
      let [m, d, y] = trimmed.split("/").map(Number);
      return getLocalMidnight(y, m - 1, d);
    }

    // "YYYY-MM-DD"
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      let [y, m, d] = trimmed.split("-").map(Number);
      return getLocalMidnight(y, m - 1, d);
    }

    // Words, like "Oct 12, 2026"
    let parsedDate = new Date(trimmed);
    if (!isNaN(parsedDate.getTime())) {
      return getLocalMidnight(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate());
    }
  }

  // (A caller that can fail says so itself, like a spreadsheet cell that isn't a date)
  if (failable) return new Date("invalid");
  console.warn("createSafeMidnight couldn't read:", input);

  let now = new Date();
  return getLocalMidnight(now.getFullYear(), now.getMonth(), now.getDate());
}

/* ---------- Dates people see and type ---------- */
// Stored dates never depend on the device's language, region, or time zone: a day is always stored as
// MM/DD/YYYY (MM/DD on a calendar day's first line, YYYY-MM-DD for the API) and read back as that same
// calendar day wherever the device is. Only what people see and type follows their date format: this
// device's own (from its language and region), or the one picked in Settings. So 05/10/2026 is October 5
// to someone who writes the day first, and YYYY-MM-DD can always be typed too.

const DATE_FORMATS = {
  mdy: { pattern: "MM/DD/YYYY" },
  dmy: { pattern: "DD/MM/YYYY" },
  ymd: { pattern: "YYYY-MM-DD" }
};
const DATE_FORMAT_KEY = "prismal_date_format"; // This device's pick ("mdy", "dmy", "ymd"); none = its own

// The device's own order, from its language and region (en-US: mdy, en-GB and most of the world: dmy,
// ja, zh, ko, sv, and others: ymd)
let deviceFormatCache = null;
function deviceDateFormat() {
  if (deviceFormatCache) return deviceFormatCache;
  deviceFormatCache = "mdy";
  try {
    const order = new Intl.DateTimeFormat(undefined, { year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(new Date(2026, 9, 5))
      .map(part => part.type)
      .filter(type => type === "year" || type === "month" || type === "day");
    if (order[0] === "year") deviceFormatCache = "ymd";
    else if (order[0] === "day") deviceFormatCache = "dmy";
  } catch (e) {}
  return deviceFormatCache;
}

// "mdy", "dmy", or "ymd": picked in Settings on this device, or the device's own
function dateFormat() {
  let picked = null;
  try { picked = localStorage.getItem(DATE_FORMAT_KEY); } catch (e) {}
  return Object.prototype.hasOwnProperty.call(DATE_FORMATS, picked) ? picked : deviceDateFormat();
}

// What a date box asks for, like "DD/MM/YYYY"
function datePattern() {
  return DATE_FORMATS[dateFormat()].pattern;
}

// A day as people read it: "10/05/2026", "05/10/2026", or "2026-10-05"
function showDate(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) return "";
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const format = dateFormat();
  if (format === "ymd") return `${date.getFullYear()}-${mm}-${dd}`;
  return format === "dmy" ? `${dd}/${mm}/${date.getFullYear()}` : `${mm}/${dd}/${date.getFullYear()}`;
}

// A day without its year: "10/05", "05/10", or "10-05"
function showDay(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) return "";
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const format = dateFormat();
  if (format === "ymd") return `${mm}-${dd}`;
  return format === "dmy" ? `${dd}/${mm}` : `${mm}/${dd}`;
}

// A stored date ("10/05/2026", or "10/05" on a calendar day) as people read it. Anything that isn't a
// date (like "None") is shown as it is.
function showStoredDate(text) {
  const trimmed = String(text ?? "").trim();
  if (/^\d{1,2}\/\d{1,2}$/.test(trimmed)) return showDay(createSafeMidnight(trimmed));
  if (!/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmed)) return trimmed;
  const date = createSafeMidnight(trimmed, true);
  return isNaN(date.getTime()) ? trimmed : showDate(date);
}

// A typed date as local midnight, or an invalid Date when it isn't a real day (31/02 doesn't quietly roll
// over into March). Numbers go in this device's date order (dateFormat), split by /, ., -, or spaces; a
// 4-digit year first is always year-month-day. Without a year, it's the nearest one (12/30 typed in January
// is last December). A 2-digit year is in the 2000s. Month names work too, either way around and with or
// without a year or a weekday ("Oct 5", "5 October 2026", "Mon, Oct 5, 2026"), the same in every browser.
function parseTypedDate(text) {
  const trimmed = String(text || "").trim();
  const invalid = new Date("invalid");
  if (!trimmed) return invalid;
  let year, month, day;
  let numbers = trimmed.match(/^(\d{4})[\/.\-\s](\d{1,2})[\/.\-\s](\d{1,2})$/);
  const named = numbers ? null : namedDate(trimmed);
  if (numbers) {
    [year, month, day] = numbers.slice(1).map(Number);
  } else if (named) {
    ({ month, day } = named);
    year = named.year ?? nearestYear(month);
  } else {
    numbers = trimmed.match(/^(\d{1,2})[\/.\-\s](\d{1,2})(?:[\/.\-\s](\d{2}|\d{4}))?\.?$/);
    if (!numbers) {
      // Anything else only when it says its year (browsers guess one differently, like 2001)
      if (/^[\d\s\/.\-]+$/.test(trimmed) || !/\d{4}/.test(trimmed)) return invalid;
      return createSafeMidnight(trimmed, true);
    }
    const [first, second] = [Number(numbers[1]), Number(numbers[2])];
    [month, day] = dateFormat() === "dmy" ? [second, first] : [first, second];
    year = numbers[3] ? Number(numbers[3]) + (numbers[3].length === 2 ? 2000 : 0) : nearestYear(month);
  }
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return invalid;
  return createSafeMidnight(date);
}

// The year a date typed without one is in: this one, or next or last year around New Year's (month: 1-12)
function nearestYear(month) {
  if (month === 12 && today.getMonth() === 0) return today.getFullYear() - 1;
  if (month === 1 && today.getMonth() === 11) return today.getFullYear() + 1;
  return today.getFullYear();
}

// "Oct 5", "October 5th, 2026", "5 Oct 2026", or "Monday, Oct 5" -> { month (1-12), day, year (or null) };
// null when it isn't a date written with its month's name
const MONTH_NAMES = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
function namedDate(text) {
  const words = text.replace(/^(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,?\s+/i, "");
  const monthFirst = words.match(/^([a-z]{3,})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?$/i);
  const dayFirst = monthFirst ? null : words.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,})\.?,?(?:\s+(\d{4}))?$/i);
  if (!monthFirst && !dayFirst) return null;
  const [name, dayText] = monthFirst ? [monthFirst[1], monthFirst[2]] : [dayFirst[2], dayFirst[1]];
  const month = MONTH_NAMES.findIndex(full => full.startsWith(name.toLowerCase())) + 1;
  if (month === 0) return null;
  const yearText = (monthFirst || dayFirst)[3];
  return { month, day: Number(dayText), year: yearText ? Number(yearText) : null };
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

// A day as stored: MM/DD/YYYY
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
// clean (the title as compared, cleanString), system (a line the budget writes itself: In Bank, Gains, Costs),
// blank }. Cached by its text: every change reads the same lines again (all of History, for the tracker and
// the accounts), so each is only split up the first time.
const lineCache = new Map();
function readLine(line) {
  const text = String(line ?? "");
  let read = lineCache.get(text);
  if (read) return read;
  const parts = getParts(text);
  const title = parts.slice(2).join(" ");
  read = { sprite: parts[0], amount: parseAmount(parts[1]), title, clean: title ? cleanString(title) : "", system: systemEmojis.includes(parts[0]), blank: !text.trim() };
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
const cleanCache = new Map();
function cleanString(title) {
  if (!title) return "";
  const text = String(title);
  let clean = cleanCache.get(text);
  if (clean !== undefined) return clean;
  const lower = text.normalize("NFKC").toLowerCase().replace(/\p{Variation_Selector}/gu, "");
  const tidy = (pattern) => lower.replace(pattern, "").replace(/\s+/g, " ").trim();
  clean = tidy(/[^\p{L}\p{M}\p{N}\s]/gu) || tidy(/[^\p{L}\p{M}\p{N}\p{S}\s]/gu);
  if (cleanCache.size >= 5000) cleanCache.clear();
  cleanCache.set(text, clean);
  return clean;
}

// Each word's first letter (in any language) capitalized: "coffee shop" -> "Coffee Shop", "école" -> "École"
function capitalize(string) {
  return getParts(string).map(word => word.replace(/\p{L}/u, char => char.toUpperCase())).join(" ");
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

// Local midnight N days after date (handles month/year/DST rollover)
function addDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
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
// A frequency that can't be read lands monthly.
function parseRecurringRow(item) {
  if (!item || item[0] === "-") return null;
  const rawEndDate = item[4];
  return {
    cleanTitle: cleanString(item[0]),
    special: getSpecialType(item[5] || ""),
    startDate: createSafeMidnight(item[2]),
    endDate: (rawEndDate && rawEndDate !== "None") ? createSafeMidnight(rawEndDate) : null,
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

// Only the home page has the calendar table; on other pages these listeners are skipped
const table = document.querySelector('.elastic-table');

// 1. TOUCH: TWO-FINGER PINCH & DRAG

let isTransforming = false;
let targetEl = null;
let startDist = 0, startAngle = 0;
let startCenterX = 0, startCenterY = 0;

// Two fingers: how far apart they are, at what angle, and the point between them
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

// The fingers let go: the day (or the calendar) settles back
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
// A tapped day zooms in and stays zoomed until its v, or anything outside it, is tapped. On a computer it
// doubles in size (scaled, see budgetStyle.css). On phones (touch screens and narrow windows) it fills almost
// the whole screen, centered over a dimmed page. There it's laid out at that size (--zoom times its own: its
// text, sprites, and spacing), not scaled up from the tiny day, so everything in it stays sharp; a scale only
// runs while it grows out of the day and shrinks back into it.

window.editingCell = false;
let activeEditCell = null;
const fullZoomQuery = window.matchMedia("(max-width: 760px), (pointer: coarse)");
// Does the device ask for less motion?
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let zoomBackdrop = null;

// Zoom a day in (closing any other): doubled on a computer, laid out to fill the screen on a phone
function zoomDay(cell) {
  if (activeEditCell) closeZoomedDay();
  // A day tapped again while it was shrinking back stops shrinking
  if (cell.zoomClose) {
    cell.zoomClose.cancel();
    cell.zoomClose = null;
  }
  cell.classList.remove('isZoomClosing');
  window.editingCell = true;
  activeEditCell = cell;
  cell.classList.add('is-editing');
  if (!fullZoomQuery.matches) return;
  cell.classList.add('is-fullZoom');
  if (!zoomBackdrop) {
    // In the page's own layer, just under the zoomed day (a backdrop in <body> would cover the day too)
    zoomBackdrop = document.createElement('div');
    zoomBackdrop.className = 'dayZoomBackdrop';
    document.getElementById('transitionContainer')?.appendChild(zoomBackdrop);
  }
  zoomBackdrop.classList.add('shown');
  fitZoomedDay(true);
}

// immediate: no shrinking back into the day (leaving the page)
function closeZoomedDay(immediate = false) {
  const cell = activeEditCell;
  window.editingCell = false;
  activeEditCell = null;
  if (zoomBackdrop) zoomBackdrop.classList.remove('shown');
  if (!cell) return;
  const finish = () => {
    cell.zoomClose = null;
    if (activeEditCell === cell) return; // Zoomed again in the meantime
    cell.classList.remove('is-editing', 'is-magnified', 'is-fullZoom', 'isZoomClosing');
    for (const property of ['transform', 'transform-origin', '--zoom']) cell.style.removeProperty(property);
  };
  const scale = Number(cell.style.getPropertyValue('--zoom')) || 1;
  if (immediate || !cell.classList.contains('is-fullZoom') || !cell.animate || reducedMotion()) {
    finish();
    return;
  }
  // It shrinks back into its day (still laid out big, scaled down to the day's size), then is the day again.
  // A tap on it meanwhile zooms it right back in (zoomDay), and its entries don't open (Calendar Page.js).
  cell.classList.add('isZoomClosing');
  cell.zoomClose = cell.animate(
    [{ transform: cell.style.transform }, { transform: `translate(0px, 0px) scale(${1 / scale})` }],
    { duration: 200, easing: 'ease-in' }
  );
  cell.zoomClose.onfinish = finish;
}

// A zoomed day zooms back out when the page is left (so Back never shows it still zoomed)
window.FloatingWindows?.closeOnPageExit(() => closeZoomedDay(true));

// Lay the zoomed day out so it fills almost the whole screen, centered: how big (--zoom) from its size where
// it sits (measured at its own size, which nothing draws in between), then moved there. animate: it grows out
// of the day (opening); without, it just moves (when the page scrolls or resizes, or the day's entries change).
function fitZoomedDay(animate = false) {
  const cell = activeEditCell;
  if (!cell || !cell.classList.contains('is-fullZoom')) return;
  cell.style.transform = 'none';
  cell.style.setProperty('--zoom', '1');
  const box = cell.getBoundingClientRect();
  const content = cell.querySelector('.cell-content');
  const height = Math.max(box.height, content ? content.offsetHeight : 0); // A long day shows all of it
  const viewWidth = document.documentElement.clientWidth || window.innerWidth;
  const viewHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  const scale = Math.min((viewWidth * 0.92) / box.width, (viewHeight * 0.84) / height);
  const toLeft = (viewWidth - box.width * scale) / 2;
  const toTop = (viewHeight - height * scale) / 2;
  const moved = `translate(${toLeft - box.left}px, ${toTop - box.top}px)`;
  cell.style.transformOrigin = '0 0';
  cell.style.setProperty('--zoom', String(scale));
  cell.style.transform = moved;
  if (animate && cell.animate && !reducedMotion()) {
    cell.animate(
      [{ transform: `translate(0px, 0px) scale(${1 / scale})` }, { transform: moved }],
      { duration: 250, easing: 'cubic-bezier(0.25, 0.8, 0.25, 1)' }
    );
  }
}

let refitFrame = 0;
// Lay the zoomed day out again on the next frame (once, however often it's asked)
const refitZoomedDay = () => {
  cancelAnimationFrame(refitFrame);
  refitFrame = requestAnimationFrame(() => fitZoomedDay(false));
};
window.addEventListener('scroll', () => { if (activeEditCell) refitZoomedDay(); }, { passive: true });
window.addEventListener('resize', () => { if (activeEditCell) refitZoomedDay(); });
// A day tapped while the page was still sliding in was measured on the move
document.getElementById('transitionContainer')?.addEventListener('transitionend', (e) => {
  if (activeEditCell && e.target === e.currentTarget) refitZoomedDay();
});
document.addEventListener('budget:updated', () => { if (activeEditCell) refitZoomedDay(); }); // After the page redraws it

table?.addEventListener('click', (e) => {
  if (e.target.closest('.cell-action-btn')) {
    closeZoomedDay();
    e.stopPropagation();
    return;
  }

  const cell = e.target.closest('td');
  if (!cell || activeEditCell === cell) return;
  zoomDay(cell);
  e.stopPropagation();
});

document.addEventListener('click', (e) => {
  if (!window.editingCell || !activeEditCell) return;
  if (activeEditCell.contains(e.target)) return;
  if (e.target.closest('.budgetPanel')) return; // Working in an entry's panel keeps its day zoomed
  closeZoomedDay();
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

// =====================================================================
// #region UNDO + REDO (calendar entries and quick entries)
// =====================================================================
// Each calendar change (New Entry, an entry's Set to / Add to / Move / Delete, the starting balance) and
// each quick entry the budget adds can be undone, then redone. A change is remembered by the days it
// touched: each day's own entries (unique entries and temps, never the lines the budget writes itself),
// from before and after it. Undo puts a day's "before" entries back, but only while it still holds the
// "after" ones, so it never erases anything changed since (it says so, and lets that step go, instead);
// Redo is the same the other way. Everything else (In Bank, recurring entries, the tracker, account
// balances) is worked out again from there, like after any change. Kept for this tab in sessionStorage
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
  for (const day of step.days) setDayEntries(createSafeMidnight(day.date), day[to]);
  if (step.equity) accountsData.equity = JSON.parse(step.equity[to]);
  formEntryRow[3] = step.label;
  formEntryRow[4] = "Days: " + step.days.map(day => showStoredDate(day.date)).join(", ");
  return { historyStep: { direction, label: step.label } };
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

// A change's step: the days whose entries it changed, before and after (null when there's nothing to put back)
function makeUndoStep(label, before) {
  const after = captureEntryDays(before.days.map(day => createSafeMidnight(day.date)));
  const days = before.days
    .map((day, i) => ({ date: day.date, before: day.lines, after: after.days[i].lines }))
    .filter(day => JSON.stringify(day.before) !== JSON.stringify(day.after));
  // A day that isn't in the budget (before History starts) can't be put back
  if (days.some(day => day.before === null || day.after === null)) return null;
  const equity = before.equity !== after.equity ? { before: before.equity, after: after.equity } : null;
  return days.length > 0 || equity ? { label, days, equity } : null;
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

// Put these entry lines on the day in place of its own ones (the rest is rebuilt by refreshBudgetData)
function setDayEntries(date, lines) {
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