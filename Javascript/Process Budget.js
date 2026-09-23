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