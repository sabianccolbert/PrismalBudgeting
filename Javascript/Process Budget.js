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

  if (futureEdited) {
    await fetch(`${API_BASE_URL}/api/data/update-future`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, data: futureData })
    });
    futureEdited = false; // Reset flag after successful save
  }

  if (calendarEdited) {
    await fetch(`${API_BASE_URL}/api/data/update-calendar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, data: calendarData })
    });
    calendarEdited = false;
  }

  // Repeat for other tables...
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