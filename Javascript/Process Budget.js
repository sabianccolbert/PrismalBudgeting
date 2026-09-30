
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

// Edit Trackers
let calendarEdited = false;
let recurringEdited = false;
let trackerEdited = false;
let futureEdited = false;
let historyEdited = false;
let searchEdited = false;
let calculatorEdited = false;

let bgColors = null;

// Dates Data
const today = createSafeMidnight(new Date());
const yesterday = createSafeMidnight(new Date(today.getTime() - 86400000));

let gridDates = getGridDates();
let gridStartDate = gridDates[0][0];
let gridEndDate = gridDates[3][6];

const nextFourStart = createSafeMidnight(new Date(gridEndDate.getTime() + 86400000));

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
const farewellPresets = ["Here's an affirmation: ", "Have some motivation: ", "Here's today's affirmation: ", "Enjoy this motivation: ", "Have an affirmation: ", "Enjoy this affirmation: ", "Here's some morivation: "];
const affirmationPresets = ["I am capable of quiet focus.", "My mind is filled with peaceful thoughts.", "Today I step into greatness.", "I am deserving of clear focus.", "My potential expands every day.", "I release doubt and welcome faith.", "Today I choose hope and love.", "My courage is greater than my fears.", "I am worthy of respect and kindness.", "Today I step into new joy.", "I am a vessel of boundless creativity.", "My heart is peaceful and steady.", "Today I radiate kindness to all.", "I handle challenges with quiet grace.", "My focus is sharp and clear.", "I am a beacon of light and hope.", "Today I welcome joy into my heart.", "I am worthy of deep connections.", "My daily habits build a foundation of joy.", "My inner strength is unwavering.", "Today I choose inner contentment.", "My presence brings comfort and joy.", "I choose self-compassion over criticism.", "Today I step into my true power.", "My strength grows deeper every day.", "I am open to the wisdom of the universe.", "Today is full of bright possibilities.", "I am resilient and strong.", "Today I share my authentic self.", "My heart radiates warmth and kindness.", "I attract positive energy into my space.", "Today I celebrate my small wins.", "My efforts today plant seeds for tomorrow.", "My potential is completely unlimited.", "Today I choose peace over perfection.", "I am deserving of infinite happiness.", "Today I embrace new beginnings.", "My voice matters and deserves to be heard.", "Today I focus on what matters.", "I embrace the quiet spaces between my thoughts.", "I am capable of magnificent success.", "Today I trust my inner voice.", "My light shines brightly for all.", "Today I cultivate gratitude.", "I release all unnecessary fear.", "Today I move forward with grace.", "I am deserving of a beautifully calm life.", "My hard work yields great success.", "Today I choose peace over pressure.", "I am committed to continuous growth and learning.", "Today I share my light freely.", "Kindness is my natural response.", "Today I embrace my power.", "My journey unfolds perfectly in its own time.", "I am secure in who I am.", "Today I choose self-love.", "My future is bright and full of promise.", "Today I welcome joy and laughter.", "I welcome joyful surprises today.", "Today I trust my capabilities.", "I trust the gentle rhythm of my breathing.", "I am whole just as I am.", "Today I choose joy and gratitude.", "I nourish my body with good energy.", "Today I embrace infinite possibilities.", "I am aligned with my true purpose.", "Today I let go of stress.", "Today I allow myself to simply be.", "I choose to be happy now.", "Today I celebrate my life.", "My intuition guides me correctly.", "Today I choose positive actions.", "I am worthy of great things.", "Peace begins within my own heart.", "My heart sings a song of deep gratitude.", "Today I shine a bright light.", "I am patient with my personal growth.", "Today I welcome a clear vision.", "I attract supportive and loving friends.", "Today I walk with purpose.", "I am a powerful creator of joy.", "I am completely equipped to handle today.", "Today I manifest my best.", "I deserve rest and relaxation.", "Today I spread warmth to all.", "My mind is clear and focused.", "Today I release past burdens.", "I am surrounded by endless beauty.", "My thoughts shape a vibrant and healthy reality.", "Today I choose calm thoughts.", "I celebrate my progress, big or small.", "Today I nourish my soul.", "My heart is full of gratitude.", "Today I honor my feelings.", "I accept myself without any judgment.", "I am deeply connected to the present moment.", "Today I create positive moments.", "I am worthy of living well.", "Today I embrace my potential.", "My actions create positive change.", "Today I attract good energy.", "I choose to see the good today.", "Every breath I take fills me with peace.", "Today I act with kindness.", "I am confident in my abilities.", "Today I stand tall and proud.", "My creative energy flows freely.", "Today I trust the universe.", "I am deserving of success and joy.", "I choose to focus on the good around me.", "Today I express genuine gratitude.", "I let go of what I cannot change.", "Today I choose hope over fear.", "I am resilient in the face of obstacles.", "I trust my journey completely.", "Today I welcome inner quiet.", "My spirit dances with the flow of life.", "I am worthy of my dreams.", "Today I honor my journey.", "I am making a positive impact.", "Today I choose self-acceptance.", "My soul is calm and at peace.", "I embrace change with an open heart.", "I am an architect of my own happiness.", "Today I spread light and love.", "I am strong, grounded, and safe.", "My energy is focused on the good.", "Today I act with conviction.", "I am capable of overcoming hard times.", "I deserve love, joy, and prosperity.", "Today I release all expectations and just live.", "Today I cultivate deep peace.", "My life is filled with purpose.", "Today I embrace new wisdom.", "I trust myself to make good decisions.", "Today I breathe in calm energy.", "I am worthy of all my achievements.", "My inner calm is untouched by outside storms.", "Today I welcome positive change.", "My thoughts are positive and uplifting.", "Today I choose inner strength.", "I am safe in the present moment.", "I choose to forgive and release.", "Today I nurture my dreams.", "I am worthy of taking up space and being heard.", "My dreams are valuable and real.", "Today I walk with assurance.", "Today brings fresh starting points.", "Today I choose peace of mind.", "My passion drives me forward daily.", "Today I honor my worth.", "I celebrate the unique magic within my soul.", "I am surrounded by unconditional love.", "Today I release all self-doubt.", "I choose to treat myself gently.", "My inner wisdom leads the way.", "Today I cultivate positive thoughts.", "I am abundant in every way.", "My kindness ripples out and changes the world.", "Today I choose hope and strength.", "I release the need to be perfect.", "Today I spread genuine kindness.", "My life is a gift I cherish.", "Today I honor my unique gift.", "I am focused on my personal vision.", "I am stepping into a beautiful new chapter.", "Today I welcome calm moments.", "I am proud of who I am becoming.", "Today I trust my path completely.", "I am open to receiving love daily.", "Today I celebrate my true self.", "My boundaries protect my quiet energy.", "Today I forgive myself for past mistakes.", "Today I step forward with hope.", "Today is a gift to enjoy.", "Today I radiate joy and light.", "My body is healthy and strong.", "Today I choose love over fear.", "I am worthy of peace of mind.", "My existence is a miracle I deeply appreciate.", "Today I embrace all possibilities.", "Today I welcome new opportunities.", "Today I welcome every blessing.", "My choices align with my values.", "Today I trust my inner strength.", "I am grateful for my journey.", "I am surrounded by an invisible shield of love.", "Today I live with purpose and peace.", "My spirit is bright and resilient.", "I am capable of achieving my goals.", "I deserve to feel fulfilled.", "I choose peace over conflict today.", "I am grounded in this moment.", "Every challenge I face is a stepping stone.", "My heart is open to love.", "I am worthy of abundance now.", "Peace guides my words and actions.", "My mind is open to possibilities.", "I trust the timing of my life.", "I am powerful beyond measure.", "I am fiercely loyal to my own well-being.", "My heart is open to healing.", "I am strong, wise, and capable.", "I am capable of remarkable growth.", "My pathway is clear and bright.", "I welcome happiness into my home.", "I am deserving of rich experiences.", "My soul flourishes when I practice self-care.", "Today I act with bold confidence.", "My breath restores my quiet mind.", "I am balanced, focused, and clear.", "Today I honor my true needs.", "My courage shines in tough moments.", "I am grateful for my strong body.", "I am confidently navigating my own unique path.", "Today I cultivate joy within.", "My path is unique and beautiful.", "I am worthy of living fully.", "My heart is an anchor for peace.", "I am open to transformation.", "Today I radiate positivity everywhere.", "Today I write a joyful story for myself.", "My life is brimming with hope.", "I am comfortable in my skin.", "Today I nurture my inner light.", "My voice carries wisdom and truth.", "I am a magnet for goodness.", "My actions inspire those around me.", "I am worthy of sincere friendship.", "My life is filled with balance.", "I am strong enough to succeed.", "Today I choose kindness toward myself.", "My confidence stems from within.", "I am valuable just by existing.", "I am deserving of true peace.", "Today I welcome creative solutions.", "My energy is vibrant and light.", "I am guided by love always.", "Today I release all negativity.", "My goals are within my reach.", "I am worthy of big dreams.", "My path is filled with light.", "I am capable of amazing strength.", "My life is an exciting adventure.", "I am deserving of honest love.", "My spirit is steady and strong.", "I am open to life's blessings.", "My mind is a source of clarity.", "I am worthy of great happiness.", "My strength is renewed each morning.", "I am aligned with goodness.", "My thoughts build a peaceful mind.", "I am deserving of safe spaces.", "My growth is steady and real.", "I am capable of deep focus.", "My heart is open to abundance.", "I am worthy of rest today.", "I am resilient through every season.", "My mind is calm and peaceful.", "I am deserving of life's riches.", "My courage empowers those around me.", "I am worthy of true respect.", "My spirit radiates a warm, positive light.", "I am grounded in truth.", "My heart is a home for peace.", "I am capable of achieving my dreams.", "My inner peace is solid.", "I am worthy of great care.", "My life is rich with meaning.", "I am aligned with my truth.", "My strength grows with each test.", "I am deserving of good health.", "My future holds endless good.", "I am capable of deep love.", "My path is lined with grace.", "I am worthy of true joy.", "I am resilient in every way.", "My mind generates positive ideas.", "I am deserving of kind words.", "My energy is restored and whole.", "I am open to good fortune.", "My life is guided by hope.", "I am worthy of endless love.", "My inner power is growing daily.", "I am capable of wise choices.", "My life is full of light.", "I am resilient, strong, and safe.", "My voice is confident and strong.", "I am worthy of bright days.", "My mind is clear and capable.", "I am guided by inner peace.", "My path leads to happiness.", "I am deserving of calm moments.", "My heart is full of hope.", "I am worthy of deep joy.", "My growth is continuous and clear.", "I am capable of creating goodness.", "My life is balanced and peaceful.", "I am worthy of sweet rest.", "My power is rooted in truth.", "I am deserving of brilliant success.", "My mind is a sanctuary of calm.", "I am open to life's gifts.", "My strength inspires others daily.", "I am worthy of genuine love.", "My life moves forward in grace.", "I am capable of bold action.", "My heart radiates a steady peace.", "I am deserving of happy thoughts.", "My energy is positive and focused.", "I am grounded, present, and strong.", "My future is rich with hope.", "I am worthy of high respect.", "My spirit is resilient and bright.", "My body is a vessel of health.", "I am deserving of peace now.", "My thoughts bring me joy.", "I am worthy of all success.", "My mind is filled with light.", "My path is safe and sound.", "I am deserving of true contentment.", "My heart is full of strength.", "I am worthy of beautiful moments.", "I am strong, focused, and resilient.", "My voice carries a clear truth.", "I am deserving of kindness always.", "My mind is steady and calm.", "I am capable of bold choices.", "My heart is light and joyful.", "I am worthy of warm love.", "My life is grounded in peace.", "I am resilient in every moment.", "My energy attracts good things.", "I am deserving of complete joy.", "My spirit is bright and clear.", "I am capable of achieving greatness.", "My path is filled with joy.", "I am worthy of sweet success.", "My heart is peaceful and open.", "I am deserving of strong support.", "My mind is a source of strength.", "I am capable of infinite growth.", "My life is full of grace.", "I am worthy of clear thinking.", "My spirit is grounded in love.", "I am deserving of endless abundance.", "I am capable of magnificent achievements.", "My mind is calm and confident.", "I am worthy of rich love.", "My future is safe and bright.", "I am deserving of daily happiness.", "My energy is vibrant and fresh.", "I am capable of great resilience.", "My heart is open and ready.", "I am worthy of peaceful living.", "My mind is clear and sharp.", "My life is guided by wisdom.", "I am strong, capable, and whole.", "I am worthy of bold dreams.", "My spirit is light and free.", "I am deserving of a wonderful life.", "My power comes from within.", "My mind is peaceful and strong.", "I am worthy of boundless joy.", "Next year will be even better.", "Leap year! One more day to be thankful."];

// Others
let formEntryRow = [startTime, "", "", "", "", ""];

let systemEmojis = ["⛔️", "✅", "✴️"];
let mmddCache = new Map();
let hadError = false;
let notFound = false;

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
let cancellingTutorial = false;
let consultDave = true;

// =====================================================================
// META FUNCTIONS
// =====================================================================

// Fetch everything on page load
async function loadWorkspace() {
  const userId = localStorage.getItem('prismal_user_id');
  const response = await fetch(`${API_BASE_URL}/api/data/load?userId=${userId}`);
  const data = await response.json();

  calendarData = data.calendar;
  recurringData = data.recurring;
  trackerData = data.tracker;
  futureData = data.future;
  historyData = data.history;
  searchData = data.search;
  calculatorData = data.calculator;
}
async function saveChanges() {
  const userId = localStorage.getItem('prismal_user_id');
  if (!userId) return; // Failsafe to prevent updating if user session is lost

  if (futureEdited) {
    await fetch(`${API_BASE_URL}/api/data/update-future`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, data: futureData })
    });
    futureEdited = false;
  }

  if (calendarEdited) {
    await fetch(`${API_BASE_URL}/api/data/update-calendar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, data: calendarData })
    });
    calendarEdited = false;
  }

  if (recurringEdited) {
    await fetch(`${API_BASE_URL}/api/data/update-recurring`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, data: recurringData })
    });
    recurringEdited = false;
  }

  if (trackerEdited) {
    await fetch(`${API_BASE_URL}/api/data/update-tracker`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, data: trackerData })
    });
    trackerEdited = false;
  }

  if (historyEdited) {
    await fetch(`${API_BASE_URL}/api/data/update-history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, data: historyData })
    });
    historyEdited = false;
  }

  if (searchEdited) {
    await fetch(`${API_BASE_URL}/api/data/update-search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, data: searchData })
    });
    searchEdited = false;
  }

  if (calculatorEdited) {
    await fetch(`${API_BASE_URL}/api/data/update-calculator`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, data: calculatorData })
    });
    calculatorEdited = false;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  let isMouseDown = false;

  // 1. Release: Listen globally so we catch mouse up even if it happens outside the table
  window.addEventListener('pointerup', (e) => {
    if (e.pointerType !== 'mouse') return; // Ignore touch/mobile
    
    isMouseDown = false;
    document.querySelectorAll('.elastic-table td.is-magnified').forEach(cell => {
      cell.classList.remove('is-magnified');
    });
  });

  // 2. Click Down: Check if the click happened on a dynamically generated <td>
  document.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.pointerType !== 'mouse') return; // Left-click PC mouse only

    const cell = e.target.closest('.elastic-table td');
    if (!cell) return;

    e.preventDefault(); // Prevents native browser drag-and-drop
    isMouseDown = true;
    cell.classList.add('is-magnified');
  });

  // 3. Glide Enter: Handle moving into new cells while holding the click
  document.addEventListener('pointerover', (e) => {
    if (!isMouseDown || e.pointerType !== 'mouse') return;

    const cell = e.target.closest('.elastic-table td');
    if (!cell) return;

    cell.classList.add('is-magnified');
  });

  // 4. Glide Leave: Handle leaving a cell
  document.addEventListener('pointerout', (e) => {
    if (e.pointerType !== 'mouse') return;

    const cell = e.target.closest('.elastic-table td');
    if (!cell) return;

    // Ensure the cursor actually left the cell (prevents flickering over text nodes)
    if (!cell.contains(e.relatedTarget)) {
      cell.classList.remove('is-magnified');
    }
  });
});

if (url.pathname === '/api/data/load' && request.method === 'GET') {
  const userId = url.searchParams.get('userId');

  // 1. Ensure all tables exist (Run this check transparently)
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS calendar (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, content TEXT)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS recurring (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, content TEXT)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS tracker (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, content TEXT)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS future (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, content TEXT)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS history (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, content TEXT)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS search (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, content TEXT)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS calculator (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, content TEXT)`)
  ]);

  // 2. Fetch all user data across all 7 tables
  const [cal, rec, tra, fut, his, sea, calc] = await env.DB.batch([
    env.DB.prepare(`SELECT * FROM calendar WHERE user_id = ?`).bind(userId),
    env.DB.prepare(`SELECT * FROM recurring WHERE user_id = ?`).bind(userId),
    env.DB.prepare(`SELECT * FROM tracker WHERE user_id = ?`).bind(userId),
    env.DB.prepare(`SELECT * FROM future WHERE user_id = ?`).bind(userId),
    env.DB.prepare(`SELECT * FROM history WHERE user_id = ?`).bind(userId),
    env.DB.prepare(`SELECT * FROM search WHERE user_id = ?`).bind(userId),
    env.DB.prepare(`SELECT * FROM calculator WHERE user_id = ?`).bind(userId),
  ]);

  return new Response(JSON.stringify({
    calendar: cal.results,
    recurring: rec.results,
    tracker: tra.results,
    future: fut.results,
    history: his.results,
    search: sea.results,
    calculator: calc.results
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
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





















// =====================================================================
// OTHER HELPERS
// =====================================================================

function getDayDifference(date1, date2) {
	// Direct timestamp difference rounded to nearest day
	return Math.round((date1.getTime() - date2.getTime()) / 86400000);
}

function getParts(line) {
  return String(line).trim().split(/\s+/);
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




