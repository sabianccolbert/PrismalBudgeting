// Limits: every limit the site has, in one place, read only. Each page loads this first (Boot.js), so every other script
// names its limits from here (const MAX_TITLE = LIMITS.title), never with a number of its own. They keep a budget, a
// calendar, and an account within what the API and its database can hold, and the API checks each again: its own
// src/limits.js keeps the same numbers for what both check (site-tests/limits-check.mjs says when they differ, and
// finds a limit written anywhere else). Nothing on a page, and no one's settings, can change one.
//
// Limits.near(kind, count) says so in a toast once something comes to LIMIT_WARN of its limit (or reaches it), once a
// page for each kind (Limits.said: whether it has). Limits.fromApi(note) shows what the API says about a limit it counts
// for the account (how many test notifications, emails, or reads are left), from an answer's limitNote, and
// Limits.fromHeader(response) the same from a file's X-Prismal-Limit header.

const LIMITS = Object.freeze({
  // A budget's entries and their parts
  amount: 1000000000,       // Dollars in one amount (past this, an amount can't be kept to the cent)
  title: 100,               // Characters in an entry's title (a calendar entry's, a recurring entry's, a prism's)
  entryTitle: 233,          // A title with its Equity accounts and arrows (100 + 60 + 60 and the arrows)
  tableBytes: 1900000,      // One part of a budget as it's saved (the database keeps up to 2 MB in one value)
  notesBytes: 1800000,      // Every note together (a little under tableBytes)
  note: 20000,              // Characters in one note
  percent: 1000,            // A % amount's percent
  reminderDays: 365,        // Days before its day an entry's reminder can come
  dayReminders: 20,         // Entries' reminders on one day
  placeholderDays: 365,     // Days before or after their day a recurring entry's placeholders can go
  frequencyCount: 999,      // Every 999 days, weeks, or months at most
  logRows: 1000,            // Change Logs kept (the oldest go first)
  logUndoBytes: 60000,      // One change's record, for Change Logs' Undo
  logUndoTotal: 800000,     // Every row's records together (the oldest rows' Undo goes first)
  undoSteps: 25,            // Home's Undo steps kept in a tab
  undoNoteChars: 100000,    // A change's notes kept for Undo in a tab
  backupFile: 26214400,     // The biggest backup Upload A Backup reads (25 MB)

  // Equity, goals, and Bob's page
  accountName: 60,
  interestRate: 1000,
  interestPeriodDays: 370,  // The longest stretch between the days interest is added (a year, with some room)
  goals: 20,
  spectrumLines: 12,
  snapshotCards: 40,
  wavelengths: 10,
  wavelengthName: 30,
  waveCount: 366,           // Past's days, weeks, or months, and a wavelength goal's "per" ones
  purposes: 2000,           // Titles on a wavelength
  businessOwners: 10,
  businessOwnerName: 40,
  businessTitles: 2000,
  presets: 30,              // The calculators' gems and crystals, each kind
  presetName: 40,
  ownIcons: 20,             // Pictures uploaded for icons, kept with a budget

  // Connected spreadsheets and calendars, and linked Calendar Fractals
  sheets: 10,               // Spreadsheets and calendars, together
  sheetName: 60,
  link: 2000,               // A spreadsheet's or calendar's link
  keptPaychecks: 120,
  fractalOrder: 60,
  linked: 10,
  linkedName: 30,
  sheetTabs: 200,           // A spreadsheet's tabs read
  sheetRows: 100000,        // Rows read from one tab
  sheetUnzipped: 80000000,  // Bytes one file inside a spreadsheet can unzip to
  sheetUnzippedTotal: 160000000,
  sheetRangeCells: 5000,
  sheetEntries: 3000,       // Entries one spreadsheet adds
  calendarEvents: 20000,    // Events read from one calendar file
  calendarRepeats: 3000,    // Times one repeating event is counted in the days worked out
  calendarRepeatSteps: 100000,
  calendarFileName: 80,     // What a calendar file's own name, an event's title, location, and notes keep, read from it
  calendarFileTitle: 200,
  calendarFileLocation: 500,
  calendarFileNotes: 4000,
  payRules: 40,
  payTimeRules: 20,
  payVersions: 41,          // The first paycheck's pay and 40 pay changes
  payWords: 300,
  payRuleName: 40,
  bonusWord: 40,
  premiumWord: 60,
  hourlyPay: 100000,
  payLookAheadDays: 366,
  paydaysPerMonth: 10,

  // The kitchen
  recipes: 500,
  recipeFoods: 100,
  pantryRows: 1000,
  pantrySections: 200,
  foodRows: 2000,
  meals: 5000,
  foodName: 60,
  foodUnit: 20,
  foodAliases: 20,
  kitchenNotes: 20000,
  foodAmount: 1000000,
  mealSkips: 500,

  // Calendar Fractals (the API keeps the same)
  fractals: 20,             // An account's own (and a budget's)
  fractalName: 30,
  events: 5000,             // Calendar entries kept under an account
  location: 200,
  alerts: 30,               // Alerts on one entry
  eventPeople: 20,          // Accounts one entry is shared with
  fractalPeople: 20,        // Accounts one fractal is shared with
  sharedFractals: 20,       // Fractals shared with one account
  hoursDays: 366,           // The most days a fractal's hours are added up over

  // Budgets and sharing (the API keeps the same)
  ownBudgets: 10,
  budgetPeople: 10,
  sharedBudgets: 20,
  budgetName: 30,

  // Home screen icons and devices (the API keeps the same: past these, the oldest stops working)
  quickIcons: 10,
  calendarIcons: 10,
  snapshotIcons: 10,
  waitingEntries: 100,      // Entries waiting from icons, per budget (Quick Budget) or account (Quick Calendar)
  prisms: 30,
  pushDevices: 10,
  passkeys: 20,
  passkeyName: 40,
  sessions: 20,
  imageFile: 15728640,      // The biggest image an icon reads (15 MB: it's cut down to the icon's size)
  emoji: 16,                // An icon's emoji, as typed (one emoji can take several characters)

  // Accounts (the API keeps the same)
  usernameMin: 5,
  username: 30,
  passwordMin: 8,
  password: 256,
  ageMin: 18,
  age: 120,
  email: 254,
  otherEmails: 5
});

// Toasts as a limit comes near: the words for each kind ({ what: what's counted, where: what holds them, oldest: true
// when the oldest stops working past it instead of anything being refused })
const Limits = (() => {
  const LIMIT_WARN = 0.9;
  const WORDS = {
    tableBytes: { where: "this part of your budget", room: true },
    notesBytes: { where: "your notes", room: true },
    events: { what: "calendar entries", where: "your account's calendar" },
    fractals: { what: "Calendar Fractals", where: "your account" },
    ownBudgets: { what: "budgets of your own", where: "your account" },
    budgetPeople: { what: "people", where: "this budget's sharing" },
    fractalPeople: { what: "people", where: "this fractal's sharing" },
    eventPeople: { what: "people", where: "this entry's sharing" },
    alerts: { what: "alerts", where: "this entry" },
    goals: { what: "goals", where: "Bob's Goals" },
    wavelengths: { what: "wavelengths", where: "Wavelength Planning" },
    purposes: { what: "titles with a wavelength", where: "Wavelength Planning" },
    businessOwners: { what: "owners", where: "Business" },
    businessTitles: { what: "titles with an owner", where: "Business" },
    snapshotCards: { what: "cards", where: "your Snapshot page" },
    prisms: { what: "prisms", where: "Quick Budget" },
    recipes: { what: "recipes", where: "your recipes" },
    pantryRows: { what: "foods", where: "your Pantry" },
    pantrySections: { what: "sections", where: "your Pantry" },
    foodRows: { what: "foods", where: "Your Foods" },
    meals: { what: "meals", where: "your calendar's meals" },
    linked: { what: "linked calendars", where: "this budget" },
    sheets: { what: "connected spreadsheets and calendars", where: "this budget" },
    presets: { what: "gems or crystals", where: "the calculators" },
    spectrumLines: { what: "lines", where: "the Spectrum Graph" },
    calendarIcons: { what: "Quick Calendar icons", where: "your account", oldest: true },
    quickIcons: { what: "Quick Budget icons", where: "your account", oldest: true },
    snapshotIcons: { what: "Snapshot icons", where: "your account", oldest: true },
    waitingEntries: {
      say: (count, limit) => (count >= limit
        ? `${limit} entries are waiting, the most that can. Open Prismal Planning to add them, then add more here.`
        : `${count} entries are waiting, of the ${limit} that can. Open Prismal Planning soon to add them.`)
    }
  };
  const NEXT_KEY = "prismal_limit_next";
  const told = new Set();
  // (Budget UI.js loads after this, on the pages that show toasts)
  const toast = (words, warning) => {
    const ui = typeof BudgetUI !== "undefined" ? BudgetUI : typeof window !== "undefined" ? window.BudgetUI : null;
    if (ui && typeof ui.showToast === "function") ui.showToast(words, warning);
  };

  // Whether this page already said a kind (with where) is near its limit (so a size needn't be measured again)
  const said = (kind, where = "") => told.has(`${kind}|${where}`);

  // A count (or for tableBytes and notesBytes, a size in bytes) coming near its kind's limit: a toast once a page for each
  // kind (and each part of a budget, with where: its name). Says nothing below LIMIT_WARN of it.
  function near(kind, count, where = "") {
    const limit = LIMITS[kind];
    const words = WORDS[kind];
    if (!limit || !words || !Number.isFinite(count) || count < limit * LIMIT_WARN) return;
    const key = `${kind}|${where}`;
    if (told.has(key)) return;
    told.add(key);
    const place = where || words.where;
    if (words.say) {
      toast(words.say(count, limit), count >= limit);
      return;
    }
    if (words.room) {
      toast(`The room for ${place} is ${Math.min(100, Math.round(count / limit * 100))}% used. Past it, changes there can't be saved: delete what you don't need (old entries, notes, or rows) to make room.`, true);
      return;
    }
    if (words.oldest) {
      toast(count >= limit
        ? `You have ${limit} ${words.what}, the most ${place} keeps: making another stops the oldest one from working.`
        : `You have ${count} of the ${limit} ${words.what} ${place} keeps. Past that, making another stops the oldest one from working.`, count >= limit);
      return;
    }
    toast(count >= limit
      ? `${capitalFirst(place)} has ${limit} ${words.what}, the most it can have. Delete one to make room for another.`
      : `${capitalFirst(place)} has ${count} of the ${limit} ${words.what} it can have.`, count >= limit);
  }

  // What the API says about a limit it counts, from an answer's limitNote: { what (words), used, max, minutes } (a
  // window of minutes, or 0 for one that doesn't end). A toast once a page for each kind of note.
  function fromApi(note) {
    if (!note || typeof note !== "object" || typeof note.what !== "string" || !Number.isFinite(note.used) || !Number.isFinite(note.max)) return;
    const key = `api|${note.what}`;
    if (told.has(key)) return;
    told.add(key);
    const left = Math.max(0, note.max - note.used);
    const until = note.minutes > 0 ? ` It starts over within ${note.minutes >= 120 ? `${Math.round(note.minutes / 60)} hours` : `${note.minutes} minutes`}.` : "";
    toast(left === 0 ? `That's the most ${note.what} for now (${note.max}).${until}` : `You've used ${note.used} of your ${note.max} ${note.what}: ${left} left.${until}`, left === 0);
  }

  // The same as near, said on the next page instead (one this page opens right away, like a new icon's own page)
  function nearNext(kind, count) {
    if (!Number.isFinite(count)) return;
    try { sessionStorage.setItem(NEXT_KEY, JSON.stringify({ kind, count })); } catch {}
  }
  if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    window.addEventListener("load", () => setTimeout(() => {
      let next = null;
      try {
        next = JSON.parse(sessionStorage.getItem(NEXT_KEY) || "null");
        sessionStorage.removeItem(NEXT_KEY);
      } catch {}
      if (next && typeof next.kind === "string" && Object.prototype.hasOwnProperty.call(WORDS, next.kind)) near(next.kind, Number(next.count));
    }, 0));
  }

  // An API answer's X-Prismal-Limit header (a calendar's or a spreadsheet's file: its limitNote, as a header)
  function fromHeader(response) {
    try {
      const text = response && response.headers ? response.headers.get("X-Prismal-Limit") : null;
      if (text) fromApi(JSON.parse(decodeURIComponent(text)));
    } catch {}
  }

  const capitalFirst = (text) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : text);
  return Object.freeze({ near, nearNext, said, fromApi, fromHeader });
})();
