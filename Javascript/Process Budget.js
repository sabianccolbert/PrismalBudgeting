
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

// Data Sizes
let calendarRows = 4;
let calendarCols = 7;
let recurringRows = 1;
let recurringCols = 1;
let trackerRows = 1;
let trackerCols = 1;
let futureRows = 1;
let futureCols = 1;
let historyRows = 1;
let historyCols = 1;
let searchRows = 1;
let searchCols = 1;
let calcRows = 1;
let calcCols = 1;

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
const affirmationPresets = [/* Your array is kept intact here */ "I am capable of quiet focus."]; // (Truncated just for display, keep your long array!)

// Others
let formEntryRow = [/* Assume startTime is defined elsewhere */ "", "", "", "", "", ""];

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
    return;
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
      return; 
    }

    if (!response.ok) {
       throw new Error(`Server responded with status: ${response.status}`);
    }
    
    const data = await response.json();

    // Use the new normalizer to guarantee a perfect 2D array structure
    calendarData   = normalizeApiGrid(data.calendar, calendarRows, calendarCols);
    recurringData  = normalizeApiGrid(data.recurring, recurringRows, recurringCols);
    trackerData    = normalizeApiGrid(data.tracker, trackerRows, trackerCols); 
    futureData     = normalizeApiGrid(data.future, futureRows, futureCols);
    historyData    = normalizeApiGrid(data.history, historyRows, historyCols);
    searchData     = normalizeApiGrid(data.search, searchRows, searchCols);
    calculatorData = normalizeApiGrid(data.calculator, calcRows, calcCols);
    
    // Use the date from the database, fallback to yesterday if new account
    lastDailyUpdate = createSafeMidnight(data.last_processed_date || yesterday);
    
    // Perform routine maintenance
    if (isDailyUpdate || lastDailyUpdate.getTime() < today.getTime()) {
      await performDailyUpdate();
    }

    calendarEdited = true;
    saveChanges();
    isDailyUpdate = false;
    
  } catch (err) {
    console.error("Failed to load workspace:", err);
  }
}
//#endregion

// =====================================================================
// #region WORKER FUNCTIONS
// =====================================================================

async function performDailyUpdate() {
  console.log("Performing daily update...");
  formEntryRow[2] = "🕛 Daily Update";

  let nextDay = null;
  let newDailyString = null;

  while (lastDailyUpdate.getTime() < today.getTime()) {
    console.log("Doing daily sprite maintenance...");
    outerLoop:
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 7; c++) {
        // Skip any dates that are older than the previous update
        if (gridDates[r][c].getTime() < lastDailyUpdate.getTime()) continue;
        
        // Completely exits both loops once the current day is reached
        if (gridDates[r][c].getTime() >= today.getTime()) {
          break outerLoop;
        }

        let cellText = String(calendarData[r][c]).trim();
        let lines = cellText.split("\n");

        for (let l = 1; l < lines.length; l++) {
          let parts = getParts(lines[l]);
          let originalTitle = extractTitle(lines[l], false);
          
          if (parseAmount(parts[1]) !== 0 && !systemEmojis.includes(parts[0])) {
            let add = true;
            let lineAmt = parseAmount(parts[1]);
            let lineType = parts[0];
            let lineDate = gridDates[r][c];
            // processEquity(add, originalTitle, lineDate, lineAmt, lineType);
          }
          
          if (parts[0].includes("✔️")) {
            let specialType = getSpecialType(parts[0]);
            parts[0] = specialType + "✔️";
            lines[l] = parts.join(" ");
            uniquesCreated++;
          }
        }
        calendarData[r][c] = lines.join("\n");
      }
    }

    nextDay = new Date(lastDailyUpdate);
    nextDay.setDate(lastDailyUpdate.getDate() + 1);
    newDailyString = formatToMMDDYYYY(nextDay);
    lastDailyUpdate = nextDay; 
  }

  // Scroll the week forward if needed
  let isTodayInFirstWeek = false;

  for (let i = 0; i < 4; i++) {
    if (isTodayInFirstWeek) break;
    
    let todayFormatted = formatToMMDD(today);
    isTodayInFirstWeek = calendarData[0].some(cell => {
      let firstLine = String(cell).split("\n")[0].trim();
      return firstLine.includes(todayFormatted);
    });
    
    if (!isTodayInFirstWeek) {
      console.log("Scrolling week forward...");
      let historyInsert = [...calendarData[0]];
      
      for (let h = 0; h < 7; h++) {
        let historyLines = historyInsert[h].split("\n");
        let dateObj = createSafeMidnight(historyLines[0]);
        
        historyLines[0] = formatToMMDDYYYY(dateObj);
        
        historyLines = historyLines.filter(line => {
          let trimmed = line.trim();
          if (trimmed.startsWith("❇️") || trimmed.startsWith("✴️")) return false;
          return true;
        });
        
        historyInsert[h] = historyLines.join("\n");
        weeksScrolled++;
      }
      
      historyData.splice(1, 0, historyInsert);
      historyEdited = true;
      calendarData.shift();
      calendarData.push(["", "", "", "", "", "", ""]);
    }
  }
  
  if (!isTodayInFirstWeek) {
    console.log("Resetting entire grid due to >4 weeks elapsed...");
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 7; c++) {
        calendarData[r][c] = formatToMMDD(gridDates[r][c]);
      }
    }
  }

  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 7; c++) {
      if (calendarData[r][c] === "") {
        let rebuiltDate = formatToMMDD(gridDates[r][c]);
        console.log("Rebuilding calendar cell " + rebuiltDate + "...");
        calendarData[r][c] = rebuiltDate;
      }
    }
  }
  
  formEntryRow[3] = "Uniques Created: " + uniquesCreated;
  formEntryRow[5] = "Weeks Scrolled: " + weeksScrolled;

  // UPDATED: Save the new date back to the database using JWT
  if (newDailyString) {
    const token = localStorage.getItem('prismal_jwt');
    if (!token) return;

    try {
      await fetch(`${window.API_BASE_URL}/api/data/save_date`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ 
          last_processed_date: newDailyString
        })
      });
      console.log("Successfully saved new processing date:", newDailyString);
    } catch (err) {
      console.error("Failed to save daily update timestamp:", err);
    }
  }
}

async function saveChanges() {
  console.log("Saving data changes...");
  // Grab the JWT token instead of the user ID
  const token = localStorage.getItem('prismal_jwt');
  if (!token) {
    console.error("No active session found. Changes not saved.");
    return; // Stop execution if logged out
  }

  // Reusable request helper with Authorization JWT headers
  async function sendUpdate(endpoint, payload) {
    try {
      const res = await fetch(`${window.API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` // Standard JWT Bearer token format
        },
        body: JSON.stringify(payload)
      });
      
      if (res.status === 401) {
          // Token is likely expired or invalid, handle auto-logout here if desired
          console.error("Session expired.");
      }
      
      return res.ok;
    } catch (err) {
      console.error(`Failed to sync endpoint ${endpoint}:`, err);
      return false;
    }
  }

  // 1. Future
  if (typeof futureEdited !== 'undefined' && futureEdited) {
    const success = await sendUpdate('/api/data/update-future', { data: futureData });
    if (success) futureEdited = false;
  }

  // 2. Calendar
  if (typeof calendarEdited !== 'undefined' && calendarEdited) {
    const success = await sendUpdate('/api/data/update-calendar', { data: calendarData });
    if (success) {
      calendarEdited = false;

      if (window.PAGE === "home") {
        const cells = document.querySelectorAll('.elastic-table .cell-content');
        cells.forEach((cell, index) => {
          // Convert the flat 0-27 cell index into a 4x7 grid coordinate (Row & Column)
          const r = Math.floor(index / 7);
          const c = index % 7;

          // Safely grab the text from the 2D array
          const content = (calendarData && calendarData[r] && calendarData[r][c]) 
                          ? calendarData[r][c] 
                          : "";
          
          // Use innerText instead of textContent so your \n line breaks format correctly!
          cell.innerText = content; 
        });
      }
    }
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
    const success = await sendUpdate('/api/data/update-history', { data: historyData });
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
}

//#endregion

// =====================================================================
// #region OTHER HELPERS
// =====================================================================

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

const table = document.querySelector('.elastic-table');

let isTransforming = false;
let targetEl = null;
let startDist = 0, startAngle = 0;
let startCenterX = 0, startCenterY = 0;

// Math Helpers
const getDistance = (t1, t2) => Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
const getAngle = (t1, t2) => Math.atan2(t2.clientY - t1.clientY, t2.clientX - t1.clientX) * (180 / Math.PI);
const getCenter = (t1, t2) => ({ x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 });

table.addEventListener('touchstart', (e) => {
  // Only activate on exactly two fingers
  if (e.touches.length === 2) {
    isTransforming = true;
    
    const t1 = e.touches[0];
    const t2 = e.touches[1];
    
    const cell1 = t1.target.closest('td');
    const cell2 = t2.target.closest('td');
    
    // Logic: If both fingers are in the same cell, stretch the cell. Otherwise, stretch the table.
    if (cell1 && cell1 === cell2) {
      targetEl = cell1.querySelector('.cell-content');
      cell1.style.zIndex = '20';
      targetEl.style.overflow = 'visible';
    } else {
      targetEl = table;
    }

    // Record the starting positions
    startDist = getDistance(t1, t2);
    startAngle = getAngle(t1, t2);
    const center = getCenter(t1, t2);
    startCenterX = center.x;
    startCenterY = center.y;

    // Remove CSS transition temporarily so the element tracks 1:1 with your fingers instantly
    targetEl.style.transition = 'none'; 
  }
}, { passive: false });

table.addEventListener('touchmove', (e) => {
  if (isTransforming && e.touches.length === 2) {
    // Prevent accidental screen scrolling while you are manipulating the table/cell
    e.preventDefault(); 
    
    const t1 = e.touches[0];
    const t2 = e.touches[1];
    
    // Calculate how much the fingers have moved/pinched/rotated since starting
    const scale = getDistance(t1, t2) / startDist;
    const rotate = getAngle(t1, t2) - startAngle;
    const center = getCenter(t1, t2);
    const translateX = center.x - startCenterX;
    const translateY = center.y - startCenterY;
    
    // Apply the math directly to the element
    targetEl.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale}) rotate(${rotate}deg)`;
  }
}, { passive: false });

// Handle release (or if the system interrupts the touch)
const endTransform = (e) => {
  if (isTransforming && e.touches.length < 2) {
    isTransforming = false;
    
    // 1. Restore the CSS transition we provided in the CSS file
    targetEl.style.transition = ''; 
    
    // 2. Clear the inline math. The CSS transition will instantly take over and "snap" it back to normal
    targetEl.style.transform = ''; 
    
    targetEl.style.overflow = '';
    
    // 3. Reset the z-index if a single cell was targeted
    const parentTd = targetEl.closest('td');
    if (parentTd) parentTd.style.zIndex = '';
    
    targetEl = null;
  }
};

table.addEventListener('touchend', endTransform);
table.addEventListener('touchcancel', endTransform);

// --- PC MOUSE MAGNIFYING GLASS ---
let isMouseMagnifying = false;

table.addEventListener('pointerdown', (e) => {
  // ONLY react to physical PC mouse left-clicks. Leave touch entirely to the script above!
  if (e.pointerType !== 'mouse' || e.button !== 0) return;
  
  const cell = e.target.closest('td');
  if (!cell) return;

  e.preventDefault(); // Stops native text highlighting/dragging
  isMouseMagnifying = true;
  cell.classList.add('is-magnified');
});

table.addEventListener('pointerover', (e) => {
  if (!isMouseMagnifying || e.pointerType !== 'mouse') return;
  
  const cell = e.target.closest('td');
  if (cell) cell.classList.add('is-magnified');
});

table.addEventListener('pointerout', (e) => {
  if (e.pointerType !== 'mouse') return;
  
  const cell = e.target.closest('td');
  if (!cell) return;
  
  // Ensure the cursor actually left the <td> (prevents flickering)
  if (!cell.contains(e.relatedTarget)) {
    cell.classList.remove('is-magnified');
  }
});

// Global release in case the user glides the mouse completely outside the table bounds
window.addEventListener('pointerup', (e) => {
  if (e.pointerType !== 'mouse') return;
  
  isMouseMagnifying = false;
  document.querySelectorAll('.elastic-table td.is-magnified').forEach(cell => {
    cell.classList.remove('is-magnified');
  });
});

// --- CLICK TO EDIT (PERSISTENT ZOOM) ---

// 1. Create the window-wide variable so other scripts can access it
window.editingCell = false;
let activeEditCell = null; // Internal tracker for which cell is currently open

// 2. Listen for clicks on the table to enter edit mode
table.addEventListener('click', (e) => {
  const cell = e.target.closest('td');
  if (!cell) return;

  // If the user clicks the cell that is already open, don't close it
  if (activeEditCell === cell) return;

  // If another cell was open, remove its state first
  if (activeEditCell) {
    activeEditCell.classList.remove('is-editing');
  }

  // Activate new cell
  window.editingCell = true;
  activeEditCell = cell;
  cell.classList.add('is-editing');
  
  // Prevent this click from bubbling up to the document and instantly closing it
  e.stopPropagation(); 
});

// 3. Listen for clicks anywhere on the page to exit edit mode
document.addEventListener('click', (e) => {
  // If we aren't currently editing, do nothing
  if (!window.editingCell || !activeEditCell) return;

  // If the user clicked INSIDE the currently zoomed cell, ignore it (let them type/edit)
  if (activeEditCell.contains(e.target)) return;

  // The user deliberately clicked OUTSIDE the cell. Close it.
  window.editingCell = false;
  activeEditCell.classList.remove('is-editing');
  activeEditCell = null;
});

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

// #endregion
loadWorkspace();