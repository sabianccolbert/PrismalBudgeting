// Settings Page: the calendar's links (Fractals.js draws the card: a private link for every Calendar Fractal, and one
// for each). Reminders, in one card: how they come (push notifications on this device, see Notifications.js, and a
// calendar link for Google or Apple Calendar, both optional), then, while either is on, What Gets A Reminder: a switch
// for each kind, the reminder time, and with more than one budget, which one they're about. Which days get a reminder
// comes from that budget (buildReminderPlan in Process Budget.js); the API sends and serves them.
// Then the account: the email (change it, which needs the password, and verify it) and other emails (each confirmed by
// a link; they sign in too, and their spreadsheets can be connected), the birth date (18 or older: fix one typed
// wrong), and the password (change it, or email a reset link); passkeys (Face ID, Touch ID, Windows Hello: add or
// remove them, and turn passkey sign-in on or off; see Passkeys.js); signed-in devices (turn off Quick Budget icons, or
// their balances, and Sign Out Everywhere); your data and privacy (Download My Data, analytics on or off for this
// device); and deleting the account (needs the password). Emails go out through Resend (see account.js in the API).
// This device's own choices (the theme, with Custom's window to make one's own; the date format; music and sound effects;
// and Reduced Motion) work without the server. Connecting Apple,
// Google, or Microsoft is on standby (see APPLE, GOOGLE, AND MICROSOFT).

// =====================================================================
// #region SETUP
// =====================================================================

let reminderSettings = null; // From the API: { time, timezone, calendarUrl, push: { available, publicKey, devices } }
let pushSubscription = null; // This device's push subscription, while push is on here
let timeSaveTimer = null;
let account = null;          // From the API: { username, email, emailVerified, birthdate, age, canEmail (emails are set up), quickIcons, quickBalances }
let otherEmails = null;      // From the API: [{ email, verified }], the account's other emails (null until they load)
let passkeyInfo = null;      // From the API: { on, userHandle, passkeys: [{ id, name, site, synced, createdAt, lastUsedAt }] }
let passkeyLoadStatus = 0;   // The list's HTTP status, when it didn't load (404: the API doesn't have passkeys yet)
let passkeyAdd = null;       // { options, at }: a password-checked challenge, kept so trying again starts right away
// On standby (APPLE, GOOGLE, AND MICROSOFT):
// let signIns = null;       // From the API: { providers: [{ id, name }], connected: [{ provider, name, email, since }], hasPassword, passkeys }

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

// The themes (THEME), each with a few words about it, and Custom's five colors and its other choices
const THEME_INFO = [
  { key: "prismal", name: "Prismal", about: "The neon starfield" },
  { key: "professional", name: "Professional", about: "Light and plain" },
  { key: "dark", name: "Dark", about: "Professional, dark" },
  { key: "spooky", name: "Spooky", about: "Sharp, dark, and red" },
  { key: "elements", name: "Elements", about: "Fire, water, air, and earth" },
  { key: "poison", name: "Poison", about: "Purple and green" },
  { key: "blue", name: "Blue", about: "A medium blue" },
  { key: "fall", name: "Fall", about: "Pumpkins and falling leaves" },
  { key: "winter", name: "Winter", about: "Whites, blues, and snow" },
  { key: "festive", name: "Festive", about: "Red, green, gold, and lights" },
  { key: "floral", name: "Floral", about: "Pastel flowers" },
  { key: "digital", name: "Digital", about: "Blocky, black and green" },
  { key: "love", name: "Love", about: "Pastel pinks, reds, and hearts" },
  { key: "clovers", name: "Clovers", about: "Dark green, light grey, and clovers" },
  { key: "playful", name: "Playful", about: "Spring pastels, eggs, and chicks" },
  { key: "mechanical", name: "Mechanical", about: "Steel, brass, and gears" },
  { key: "custom", name: "Custom", about: "Your own" }
];
const CUSTOM_COLORS = [
  { part: "background", label: "Background" },
  { part: "cards", label: "Cards" },
  { part: "words", label: "Words" },
  { part: "glow", label: "Glow" },
  { part: "chosen", label: "Chosen" }
];
const CUSTOM_PARTS = [
  { part: "corners", label: "Corners", options: [["theme", "The theme's"], ["small", "Small"], ["sharp", "Sharp"]] },
  { part: "font", label: "Font", options: [["theme", "The theme's"], ["prismal", "Prismal's"], ["plain", "Plain"], ["sharp", "Sharp"], ["rounded", "Rounded"], ["digital", "Digital"]] },
  { part: "stars", label: "Stars", options: [["theme", "The theme's"], ["stars", "Stars"], ["dots", "Dots"], ["embers", "Embers and bats"], ["elements", "Elements"], ["bubbles", "Bubbles"],
    ["leaves", "Leaves"], ["snow", "Snow"], ["ornaments", "Ornaments"], ["flowers", "Flowers"], ["pixels", "Pixels"], ["hearts", "Hearts"], ["clovers", "Clovers"], ["eggs", "Eggs"], ["gears", "Gears"]] },
  { part: "icons", label: "Icons", options: [["theme", "The theme's"], ["gray", "Gray"], ["glowing", "Glowing"]] }
];
const PUSH_BLOCKED_TEXT = "Notifications are blocked for this site. Allow them in your browser's site settings, then come back here to turn them on.";
// Budgets.js's list ({ current, budgets, invitations }), once it's in (see loadBudgets). Up here, before loadBudgets runs
// below: Firefox refused to set it from there while its declaration further down hadn't been reached yet.
let budgetList = null;

wireDateFormat(); // This device's choices, so they work before (and without) the server
wireTimeFormat();
wireThemes();
wireSounds();
wireMotion();
loadBudgets();
showFractalLinks();
// Updates: the version this page is (each update's list is in settings.html)
document.getElementById("updatesVersion").textContent = window.SITE_VERSION || "--";

window.workspaceReady.then(async (loaded) => {
  // Account settings don't need the budget, so they show even when it didn't load
  // (On standby: a fifth, budgetApi("/api/oauth/connected") as signInResult, see APPLE, GOOGLE, AND MICROSOFT)
  const [reminders, accountResult, passkeyResult, emailsResult] = await Promise.all([
    loaded ? budgetApi("/api/notify/settings") : null,
    budgetApi("/api/account"),
    budgetApi("/api/passkey/list"),
    budgetApi("/api/sheets/emails")
  ]);
  const accountLoaded = accountResult.ok && !!accountResult.data;
  if (accountLoaded) {
    account = accountResult.data;
    if (passkeyResult.ok && passkeyResult.data) passkeyInfo = passkeyResult.data;
    else passkeyLoadStatus = passkeyResult.status;
    if (emailsResult.ok && emailsResult.data) otherEmails = emailsResult.data.emails;
    // if (signInResult.ok && signInResult.data) signIns = signInResult.data; (On standby)
    wireAccount();
    renderAccount();
    renderPasskeys();
    // renderSignIns(); (On standby)
    document.getElementById("accountView").hidden = false;
    // await signInReturn(); (On standby)
    // A link to a card (like Spreadsheets' to #email) goes to it once it's there
    if (location.hash === "#email") document.getElementById("email").scrollIntoView();
  }

  const remindersLoaded = !!reminders && reminders.ok && !!reminders.data;
  const missing = [];
  if (!loaded) missing.push("your budget data");
  else if (!remindersLoaded) missing.push("your reminder settings");
  if (!accountLoaded) missing.push("your account settings");
  const status = document.getElementById("dataStatus");
  if (missing.length > 0) status.textContent = `Couldn't load ${missing.join(" or ")}. Please refresh to try again.`;
  else status.hidden = true;
  if (!remindersLoaded) return;

  reminderSettings = reminders.data;
  document.getElementById("settingsView").hidden = false;
  renderRecipesCard();

  wireReminderTime();
  renderReminderTime();
  renderReminderBudget();
  renderCalendarLink();
  renderPush();
  await refreshPushState();
});

//#endregion

// =====================================================================
// #region BUDGETS, AND THE CALENDAR'S LINKS
// =====================================================================

// The account's budgets, for the list of which one the reminders are about (the Budgets card itself is on the Budgets,
// Calendars & Spreadsheets page)
async function loadBudgets() {
  budgetList = await Budgets.list();
  document.addEventListener("budgets:changed", async () => {
    budgetList = await Budgets.list();
    renderReminderBudget();
  });
  renderReminderBudget();
}

// The Calendar Fractals' Links card (Fractals.js draws it: a link for every calendar, and one for each fractal), and
// Signed-In Devices' line about Quick Calendar icons. They need the server, so they show once the calendar is in.
async function showFractalLinks() {
  const calendar = await window.Fractals.load();
  if (!calendar) return;
  window.Fractals.renderLinks(document.getElementById("fractalLinks"));
  document.getElementById("fractalLinksCard").hidden = false;
  if (location.hash === "#fractalLinksCard") document.getElementById("fractalLinksCard").scrollIntoView();
  renderQuickCalendarIcons();
  document.addEventListener("fractals:changed", renderQuickCalendarIcons);
}

// How many Quick Calendar icons work, with Turn Off Icons while there are any (every one stops working, and what they
// left waiting goes)
function renderQuickCalendarIcons() {
  const status = document.getElementById("quickCalendarStatus");
  const buttons = document.getElementById("quickCalendarButtons");
  const count = window.Fractals.data().icons || 0;
  status.hidden = false;
  buttons.replaceChildren();
  if (count === 0) {
    status.textContent = "Quick Calendar icons: none right now. The Quick Calendar button on Home makes one for a phone's home screen.";
    return;
  }
  status.textContent = `Quick Calendar icons: ${count} on home screens. Each one can see your calendar's entries and add new ones without signing in.`;
  buttons.append(settingsButton(count === 1 ? "Turn Off The Calendar Icon" : "Turn Off Calendar Icons", "danger", async (event) => {
    if (!window.confirm(`Turn off ${count === 1 ? "your Quick Calendar icon" : `all ${count} of your Quick Calendar icons`}? ${count === 1 ? "It stops" : "They stop"} working right away, and entries still waiting from ${count === 1 ? "it" : "them"} are deleted.`)) return;
    event.currentTarget.disabled = true;
    const result = await window.Fractals.change("keys/off", {});
    if (result.ok) BudgetUI.showToast(count === 1 ? "Your Quick Calendar icon is off." : "Your Quick Calendar icons are off.");
    else BudgetUI.showToast(window.Fractals.problem(result, "Couldn't turn off the icons. Please try again."), true);
  }));
}

// Sharing's Shared Users: every budget and Calendar Fractal of the account's own, each with the people it's shared with
// (their Can Edit switch, and Stop Sharing or Remove: Budgets.js personItem, Fractals.js personRow) and Share, which opens
// its own Share window to add someone. A budget's fractal is its people's, so only the account's own fractals are here.
// Drawn again as either list changes.
document.getElementById("sharedUsersButton")?.addEventListener("click", (event) => openSharedUsers(event.currentTarget));

function openSharedUsers(origin) {
  let draw = null;
  const panelApi = BudgetUI.openPanel({
    origin,
    size: "large",
    title: "Shared Users",
    build(form, panel) {
      form.addEventListener("submit", (submitted) => submitted.preventDefault());
      const box = BudgetUI.element("div", "sharedUsers");
      const group = (heading, items) => {
        if (items.length === 0) return [];
        return [BudgetUI.element("h3", "budgetListHeading", heading), ...items];
      };
      const thing = (name, people, row, share) => {
        const part = BudgetUI.element("div", "sharedThing");
        const title = BudgetUI.element("div", "sharedThingHead");
        title.append(BudgetUI.noTranslate(BudgetUI.element("span", "sharedThingName", name)), settingsButton("Share", "", (clicked) => share(clicked.currentTarget)));
        const list = BudgetUI.element("ul", "budgetList budgetPeople");
        list.append(...people.map(row));
        part.append(title, people.length > 0 ? list : BudgetUI.element("p", "panelHint", "Not shared with anyone."));
        return part;
      };
      draw = () => {
        const budgets = (window.Budgets.listed()?.budgets || []).filter(budget => budget.owned);
        const fractals = (window.Fractals.data()?.fractals || []).filter(fractal => !fractal.perBudget && !fractal.sharedBy);
        box.replaceChildren(
          BudgetUI.element("p", "panelText", "Everyone each of your budgets and Calendar Fractals is shared with. Can Edit on lets them change it (a budget's anything, a fractal's entries); off, they only look. Share adds someone."),
          ...group("Budgets", budgets.map(budget => thing(budget.name, budget.people || [], (person) => window.Budgets.personItem(budget, person, panel), (button) => window.Budgets.openShare(budget, button)))),
          ...group("Calendar Fractals", fractals.map(fractal => thing(fractal.name, fractal.people || [], (person) => window.Fractals.personRow(fractal, person, panel), (button) => window.Fractals.openShare(button, fractal))))
        );
      };
      form.append(box, BudgetUI.buttonRow([{ label: "Close", onClick: () => panel.close() }]));
      draw();
      document.addEventListener("budgets:changed", draw);
      document.addEventListener("fractals:changed", draw);
      // (Both lists, fresh, in case they changed somewhere else)
      Promise.all([window.Budgets.list(true), window.Fractals.load(true)]).then(() => draw());
    }
  });
  // (Once it closes, it stops following the lists)
  const watch = new MutationObserver(() => {
    if (panelApi.panel.isConnected && !panelApi.panel.classList.contains("isClosing")) return;
    watch.disconnect();
    document.removeEventListener("budgets:changed", draw);
    document.removeEventListener("fractals:changed", draw);
  });
  watch.observe(panelApi.panel, { attributes: true, attributeFilter: ["class"] });
  if (panelApi.panel.parentNode) watch.observe(panelApi.panel.parentNode, { childList: true });
}

// With more than one budget, which one the reminders are about (the account's first, until another is picked)
function renderReminderBudget() {
  const field = document.getElementById("reminderBudgetField");
  const select = document.getElementById("reminderBudget");
  if (!reminderSettings || !budgetList || budgetList.budgets.length < 2) {
    field.hidden = true;
    return;
  }
  const first = budgetList.budgets.find(budget => budget.owned && budget.first);
  const chosen = budgetList.budgets.find(budget => budget.id === reminderSettings.budget) || first;
  select.replaceChildren(...budgetList.budgets.map(budget => new Option(budget.owned ? budget.name : `${budget.name} (from ${budget.owner})`, String(budget.id))));
  if (chosen) select.value = String(chosen.id);
  if (!select.dataset.wired) {
    select.dataset.wired = "1";
    select.addEventListener("change", () => saveReminderBudget(Number(select.value)));
  }
  field.hidden = false;
}

// The reminders are about another budget now. Its days come from it: right away when it's the one open here, and
// otherwise the next time it's open (here, or anywhere it's shared).
async function saveReminderBudget(budgetId) {
  const select = document.getElementById("reminderBudget");
  const budget = budgetList && budgetList.budgets.find(item => item.id === budgetId);
  if (!budget) return renderReminderBudget();
  select.disabled = true;
  const result = await budgetApi("/api/notify/budget", { budget: budgetId });
  select.disabled = false;
  if (!result.ok || !result.data) {
    BudgetUI.showToast(accountError(result, "Couldn't change which budget the reminders are about. Please try again."), true);
    return renderReminderBudget();
  }
  reminderSettings = result.data;
  renderReminderBudget();
  if (budgetId === Budgets.id()) {
    queueReminderPlanSync(true);
    BudgetUI.showToast(`Reminders are about ${budget.name} now.`);
  } else {
    BudgetUI.showToast(`Reminders are about ${budget.name} now. They start the next time it's open, here or on any device.`);
  }
}

//#endregion

// =====================================================================
// #region REMINDER TIME
// =====================================================================

function wireReminderTime() {
  const input = document.getElementById("reminderTime");
  // Some browsers report every finished part of a typed time, so save once the typing stops
  input.addEventListener("change", () => {
    clearTimeout(timeSaveTimer);
    timeSaveTimer = setTimeout(() => saveReminderTime(input.value), 700);
  });
}

// Save a new reminder time (with this device's time zone)
async function saveReminderTime(time) {
  if (time === reminderSettings.time) return;
  if (!TIME_PATTERN.test(time)) {
    BudgetUI.showToast("Pick a time like 8:00 AM.", true);
    renderReminderTime();
    return;
  }
  const input = document.getElementById("reminderTime");
  input.disabled = true;
  const result = await budgetApi("/api/notify/settings", { time, timezone: currentTimeZone() });
  input.disabled = false;
  if (result.ok && result.data) {
    reminderSettings = result.data;
    BudgetUI.showToast(`Reminder time set to ${formatTime12(time)}.`);
  } else {
    BudgetUI.showToast("Couldn't save the reminder time. Please try again.", true);
  }
  renderReminderTime();
}

// The reminder time, and the time zone it goes by
function renderReminderTime() {
  document.getElementById("reminderTime").value = reminderSettings.time;
  const zone = (reminderSettings.timezone || currentTimeZone()).replace(/_/g, " ");
  document.getElementById("timeZoneNote").textContent = `Time zone: ${zone}. Reminders go out within 5 minutes of this time.`;
}

// The Reminders card: a switch for each kind of reminder (REMINDER_KINDS), as the account has them (the API keeps them:
// entries' reminders are on to start, the rest off). A switch saves as soon as it's flipped, and goes back when that
// couldn't save.
const REMINDER_KINDS = [
  { key: "entries", label: "🔔 Entry reminders", detail: "An entry you set a reminder on (Remind me, in New Entry or its options): that many days before it" },
  { key: "negative", label: "⛔️ In Bank below $0", detail: "A day In Bank goes below $0" },
  { key: "uncommon", label: "✔️ Uncommon recurring payments", detail: "An uncommon recurring payment (every 3 months or less often) in the calendar's five weeks" },
  { key: "cost", label: "❗️ Days with a cost", detail: "A day you have a cost" },
  { key: "meals", label: "🍽️ Days the Pantry is short", detail: "A day whose meals the Pantry doesn't have enough for (Kitchen)" },
  { key: "expired", label: "🥫 Foods that expire", detail: "A day a food in the Pantry expires (Kitchen)" }
];
// The kitchen's two, which Settings' Kitchen card shows too (the same switches: either one changes both)
const KITCHEN_KINDS = ["meals", "expired"];
function renderReminderCard() {
  showReminderChoices();
  const box = document.getElementById("reminderKinds");
  if (box.dataset.drawn) {
    for (const input of box.querySelectorAll("input")) input.checked = (reminderSettings.kinds || []).includes(input.dataset.kind);
    return;
  }
  box.dataset.drawn = "1";
  for (const kind of REMINDER_KINDS) box.append(reminderKindSwitch(kind));
}

// One kind's switch, with what it's about under it
function reminderKindSwitch(kind) {
  const toggle = BudgetUI.checkboxField({ label: kind.label, checked: (reminderSettings.kinds || []).includes(kind.key) });
  toggle.input.dataset.kind = kind.key;
  toggle.input.addEventListener("change", () => setReminderKind(kind.key, toggle.input.checked));
  const item = BudgetUI.element("div", "reminderKind");
  item.append(toggle.el, BudgetUI.element("span", "panelHint", kind.detail));
  return item;
}

// The kinds, the time, and the budget show once reminders have somewhere to go on this device: push notifications on here,
// or the calendar link (push is turned on one device at a time, so each device decides for itself)
function showReminderChoices() {
  const delivered = !!pushSubscription || !!reminderSettings?.calendarUrl;
  document.getElementById("reminderChoices").hidden = !delivered;
  document.getElementById("reminderOffNote").hidden = delivered;
  renderRecipesCard();
}

// Turn one kind of reminder on or off, from the Reminders card or the Kitchen card (the account's: both cards show it as
// it's saved, and go back when it couldn't save)
async function setReminderKind(key, on) {
  const picked = new Set(reminderSettings.kinds || []);
  if (on) picked.add(key);
  else picked.delete(key);
  const kinds = REMINDER_KINDS.map(kind => kind.key).filter(kind => picked.has(kind));
  const inputs = [...document.querySelectorAll("#reminderKinds input, #recipesReminders input")];
  inputs.forEach(input => { input.disabled = true; });
  const result = await budgetApi("/api/notify/kinds", { kinds });
  inputs.forEach(input => { input.disabled = false; });
  if (result.ok && result.data) {
    reminderSettings = result.data;
    BudgetUI.showToast(kinds.length > 0 ? "Saved: which reminders you get." : "Saved: no reminders for now.");
  } else {
    BudgetUI.showToast(accountError(result, "Couldn't save which reminders you get. Please try again."), true);
  }
  renderReminderCard();
}

// Settings' Kitchen card: this device's own switches (Kitchen.js settings, each off to start), and the account's two
// kitchen reminders (the Reminders card's own switches for them, shown here too, once they're in)
const RECIPE_SWITCHES = [
  { key: "glowDays", label: "Glow days the Pantry is short", detail: "On Home, while the calendar shows Meals: a day whose meals the Pantry doesn't have enough for glows orange (red at its top and orange at its bottom when it's below $0 too)",
    help: [
      ["How it's worked out: ", "the meals from today on use the Pantry up in order, the soonest first, each food from the Pantry's foods from the top down. A day whose meals it doesn't have enough for glows, so once a food runs out, only the later days that need it do."],
      ["Names: ", "capitals, a plural (\"eggs\" and \"egg\"), and a food's other names in Your Foods count as the same food."],
      ["Units: ", "weights count together (g, kg, oz, lbs), and so do volumes (tsp, tbsp, cups, ml, liters, quarts, gallons) and counts (blank, each, a dozen). Any other unit only counts with the same unit."],
      ["Without an amount: ", "a meal's food only has to be in the Pantry, and a Pantry food never runs out."]
    ] },
  { key: "glowRecipes", label: "Glow recipes the Pantry can't make", detail: "On the Kitchen tab: a recipe the Pantry doesn't have enough for now glows orange",
    help: [["Now: ", "a recipe glows when the Pantry, as it is now, doesn't have enough for all of its foods together. Its window says which ones."]] },
  { key: "glowPantry", label: "Glow foods the meals run short of", detail: "In the Pantry: a food the meals on your calendar's five weeks need more of glows orange",
    help: [
      ["Which foods: ", "the ones the meals from today through the end of your calendar's five weeks need more of than the Pantry will have when they come."],
      ["On the shopping list too: ", "red on its left and orange on its right."],
      ["Not in the Pantry at all: ", "a note under the Pantry names the foods the meals need that it doesn't have."]
    ] },
  { key: "useMeals", label: "Use meals from the Pantry", detail: "On a meal's day, its foods come out of the Pantry, never below 0 (each meal once, from today's on). Change Logs can undo it.",
    help: [
      ["When: ", "the first time Prismal Planning opens on or after a meal's day, on a device with this on (starting with the day it's turned on)."],
      ["How much: ", "each of the meal's foods, from the Pantry's foods from the top down, never below 0. A Pantry food without an amount stays as it is."],
      ["Once: ", "the budget keeps the last day it reached, so another device with this on never takes the same meals out again."],
      ["Taking it back: ", "Change Logs lists it, and its Undo puts the amounts back."]
    ] }
];

// Settings' Kitchen card: its switches (this device's own, drawn once and then kept matching the Kitchen's settings)
// and its two reminders (the account's, the same switches as the Reminders card's)
function renderRecipesCard() {
  const switches = document.getElementById("recipesSwitches");
  if (!switches || !window.Kitchen) return;
  if (!switches.dataset.drawn) {
    switches.dataset.drawn = "1";
    for (const item of RECIPE_SWITCHES) {
      const toggle = BudgetUI.checkboxField({ label: item.label, checked: Kitchen.settings()[item.key] });
      toggle.input.dataset.setting = item.key;
      toggle.input.addEventListener("change", () => {
        Kitchen.setSetting(item.key, toggle.input.checked);
        BudgetUI.showToast(`${item.label}: ${toggle.input.checked ? "on" : "off"}, on this device.`);
      });
      const row = BudgetUI.element("div", "reminderKind");
      row.append(toggle.el, BudgetUI.element("span", "panelHint", item.detail));
      switches.append(row);
      // (Its ? goes beside it, once it's in the card)
      BudgetUI.addSwitchHelp(toggle.el, `How "${item.label}" works`, BudgetUI.helpList(item.help));
    }
    document.addEventListener("kitchen:settings", renderRecipesCard);
  } else {
    for (const input of switches.querySelectorAll("input")) input.checked = Kitchen.settings()[input.dataset.setting];
  }
  const reminders = document.getElementById("recipesReminders");
  const note = document.getElementById("recipesRemindersNote");
  if (!reminderSettings) {
    reminders.hidden = true;
    note.textContent = "Its reminders show once your reminder settings load.";
    return;
  }
  reminders.hidden = false;
  if (!reminders.dataset.drawn) {
    reminders.dataset.drawn = "1";
    for (const key of KITCHEN_KINDS) reminders.append(reminderKindSwitch(REMINDER_KINDS.find(kind => kind.key === key)));
  } else {
    for (const input of reminders.querySelectorAll("input")) input.checked = (reminderSettings.kinds || []).includes(input.dataset.kind);
  }
  const delivered = !!pushSubscription || !!reminderSettings.calendarUrl;
  note.textContent = delivered
    ? "These are your account's, the same as the Reminders card's switches for them."
    : "These are your account's, the same as the Reminders card's switches for them. They come once notifications are on for this device, or the calendar link is (the Reminders card).";
}

// "08:00" -> "8:00 AM"
function formatTime12(hhmm) {
  const [hour, minute] = hhmm.split(":").map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
}

//#endregion

// =====================================================================
// #region LANGUAGE AND DATES (this device)
// =====================================================================
// Translating is the browser's own (the card says how). The date format is this device's own (from its
// language and region) unless one is picked here; it's kept on this device, even after signing out, and
// decides how dates show and how typed ones are read (see "Dates people see and type" in Dates.js).

function wireDateFormat() {
  const select = document.getElementById("dateFormat");
  if (!select) return;
  let picked = "";
  try { picked = localStorage.getItem(DATE_FORMAT_KEY) || ""; } catch (e) {}
  select.append(
    new Option(`This device's own (${DATE_FORMATS[deviceDateFormat()].pattern})`, ""),
    ...Object.entries(DATE_FORMATS).map(([key, format]) => new Option(format.pattern, key))
  );
  select.value = Object.prototype.hasOwnProperty.call(DATE_FORMATS, picked) ? picked : "";
  renderDateFormatNote();
  select.addEventListener("change", () => {
    try {
      if (select.value) localStorage.setItem(DATE_FORMAT_KEY, select.value);
      else localStorage.removeItem(DATE_FORMAT_KEY);
    } catch (e) {
      BudgetUI.showToast("This browser isn't keeping site data, so the date format can't be saved.", true);
    }
    formatPicksChanged();
    renderDateFormatNote();
    BudgetUI.showToast(`Dates show like ${showDate(sampleDate())} now.`);
  });
}

// The example date: October 5 this year (its day and month differ, so each order looks different)
function sampleDate() {
  return new Date(new Date().getFullYear(), 9, 5);
}

// An example of how dates show (and are read) in the format in use
function renderDateFormatNote() {
  const sample = sampleDate();
  document.getElementById("dateFormatNote").textContent =
    `October 5, ${sample.getFullYear()} shows as ${showDate(sample)}, and dates you type are read the same way (${DATE_FORMATS.ymd.pattern} always works too).`;
}

// Times of day, 12-hour or 24-hour (kept on this device, like the date format): the calendar's times, a zoomed day's
// hours, and the times the site writes out. The boxes times are typed in are the browser's own, so they follow the
// device's setting.
function wireTimeFormat() {
  const select = document.getElementById("timeFormat");
  if (!select) return;
  let picked = "";
  try { picked = localStorage.getItem(TIME_FORMAT_KEY) || ""; } catch (e) {}
  select.append(
    new Option(`This device's own (${deviceTwelveHour() ? "1:00 PM" : "13:00"})`, ""),
    new Option("12-hour (1:00 PM)", "12"),
    new Option("24-hour (13:00)", "24")
  );
  select.value = picked === "12" || picked === "24" ? picked : "";
  renderTimeFormatNote();
  select.addEventListener("change", () => {
    try {
      if (select.value) localStorage.setItem(TIME_FORMAT_KEY, select.value);
      else localStorage.removeItem(TIME_FORMAT_KEY);
    } catch (e) {
      BudgetUI.showToast("This browser isn't keeping site data, so the time format can't be saved.", true);
    }
    formatPicksChanged();
    renderTimeFormatNote();
    BudgetUI.showToast(`Times show like ${showClockTime(sampleTime())} now.`);
  });
}

// The example time: 1:30 in the afternoon
function sampleTime() {
  const time = new Date();
  time.setHours(13, 30, 0, 0);
  return time;
}

function renderTimeFormatNote() {
  document.getElementById("timeFormatNote").textContent =
    `Half past one in the afternoon shows as ${showClockTime(sampleTime())} on the calendar. The boxes you type times in are your browser's own, so they follow your device's setting.`;
}

//#endregion

// =====================================================================
// #region SOUNDS (this device)
// =====================================================================
// Music and sound effects, each on or off for this device (Sounds.js keeps them)

function wireSounds() {
  const music = document.getElementById("musicSwitch");
  const effects = document.getElementById("effectsSwitch");
  if (!music || !effects || !window.Sounds) {
    document.getElementById("soundView")?.setAttribute("hidden", "");
    return;
  }
  music.checked = Sounds.musicOn();
  effects.checked = Sounds.effectsOn();
  music.addEventListener("change", () => Sounds.setMusic(music.checked));
  effects.addEventListener("change", () => {
    Sounds.setEffects(effects.checked);
    if (effects.checked) Sounds.play("ding");
  });
  document.getElementById("soundNote").textContent = "They mix with your own music or podcasts instead of stopping them (on an iPhone, the silent switch silences them).";
}

//#endregion

// =====================================================================
// #region REDUCED MOTION (this device)
// =====================================================================
// The starfield holding still, and the other animations off, each kept on this device (Boot.js Motion). A device that
// asks for less motion in its own settings has both already (and no starfield at all), so the switches show that.

function wireMotion() {
  const stars = document.getElementById("stillStarsSwitch");
  const animations = document.getElementById("lessMotionSwitch");
  if (!stars || !animations || !window.Motion) {
    document.getElementById("motionView")?.setAttribute("hidden", "");
    return;
  }
  const deviceAsks = Motion.deviceAsks();
  stars.checked = deviceAsks || Motion.isOn("stars");
  animations.checked = deviceAsks || Motion.isOn("animations");
  stars.disabled = animations.disabled = deviceAsks;
  document.getElementById("motionNote").textContent = deviceAsks
    ? "This device asks for less motion in its own settings, so the starfield is off, and so are the other animations."
    : "Other animations are pages sliding in, windows growing out of their buttons, and days zooming in.";
  for (const [input, which] of [[stars, "stars"], [animations, "animations"]]) {
    input.addEventListener("change", () => {
      if (Motion.set(which, input.checked)) return;
      input.checked = !input.checked;
      BudgetUI.showToast("This browser isn't keeping site data, so this can't be saved.", true);
    });
  }
}

//#endregion

// =====================================================================
// #region THEME (this browser)
// =====================================================================
// A button for each theme (its swatch, its name, and a few words), and Custom at the end, which opens a window to make
// one's own (openCustomTheme). Picking one shows it right away and keeps it in this browser (Boot.js Themes).

function wireThemes() {
  const holder = document.getElementById("themeChoices");
  if (!holder || !window.Themes) {
    document.getElementById("themeView")?.setAttribute("hidden", "");
    return;
  }
  holder.replaceChildren(...THEME_INFO.map(theme => {
    const button = BudgetUI.element("button", "budgetButton choice themeChoice");
    button.type = "button";
    button.setAttribute("role", "radio");
    button.dataset.theme = theme.key;
    const swatch = BudgetUI.element("span", "themeSwatch");
    swatch.dataset.swatch = theme.key;
    button.append(swatch, BudgetUI.element("span", "choiceName", theme.name), BudgetUI.element("span", "choiceDetail", theme.about));
    // (A Custom theme this device keeps comes back with a tap, like the others; tapped while it's on, it opens to change)
    button.addEventListener("click", () => {
      if (theme.key !== "custom" || (Themes.custom() && Themes.saved() !== "custom")) pickTheme(theme);
      else openCustomTheme(button);
    });
    return button;
  }));
  renderThemes();
}

// Which one is picked, and Custom's swatch in its own colors once there is one
function renderThemes() {
  const saved = Themes.saved();
  const custom = Themes.custom();
  document.querySelectorAll("#themeChoices .themeChoice").forEach((button) => {
    button.setAttribute("aria-checked", String(button.dataset.theme === saved));
    if (button.dataset.theme !== "custom") return;
    const swatch = button.querySelector(".themeSwatch");
    swatch.style.background = custom
      ? `linear-gradient(135deg, ${custom.background} 0%, ${custom.cards} 40%, ${custom.glow} 75%, ${custom.chosen} 100%)`
      : "";
  });
}

// A theme's button tapped: it shows right away, and this browser keeps it (Custom's says how to change it)
function pickTheme(theme) {
  const before = Themes.saved();
  if (!Themes.set(theme.key)) {
    BudgetUI.showToast("This browser isn't keeping site data, so the theme can't be saved.", true);
    return;
  }
  renderThemes();
  if (theme.key !== before) showThemeNotice();
  if (theme.key === "custom") BudgetUI.showToast("Your Custom theme is back on. Tap Custom again to change it.");
}

// After a theme changes: a theme is kept by each browser (and each app on a home screen, which keeps its own storage),
// so the card says where else to pick it (settings.html #themeNotice)
function showThemeNotice() {
  const notice = document.getElementById("themeNotice");
  if (notice) notice.hidden = false;
}

// The Custom window: a theme to start from, five colors (the page behind the cards, the cards, the words, the glow, and
// what's chosen), and corners, font, stars, and icons (each the starting theme's own, or another). It all shows behind
// the window as it changes (Themes.preview); Save keeps it on this device, and Cancel (or ×) puts back the theme that was
// on. Starting from another theme fills in its colors. (Its colors and choices: CUSTOM_COLORS and CUSTOM_PARTS, at the
// top.)
function openCustomTheme(origin) {
  const saved = Themes.saved();
  let draft = Themes.custom() || Themes.tidyCustom({ base: saved === "custom" ? "prismal" : saved });
  let kept = false;
  BudgetUI.openPanel({
    origin,
    title: "Custom Theme",
    build(form, panel) {
      form.append(BudgetUI.element("p", "panelHint", "Start from any theme, then make it your own. It shows behind this window as you change it, and Save keeps it in this browser."));

      const base = BudgetUI.segmented(THEME_INFO.filter(theme => theme.key !== "custom").map(theme => ({ key: theme.key, label: theme.name })), draft.base, (key) => {
        draft = Themes.tidyCustom({ base: key });
        fill();
        Themes.preview(draft);
      });
      form.append(BudgetUI.field("Start from", base.el));

      // The draft shown behind the window, once a frame at most (a color box being dragged changes many times a second)
      let previewFrame = 0;
      const previewSoon = () => {
        if (!previewFrame) previewFrame = requestAnimationFrame(() => {
          previewFrame = 0;
          if (!kept) Themes.preview(draft);
        });
      };

      const colors = BudgetUI.element("div", "customColors");
      const inputs = CUSTOM_COLORS.map(({ part, label }) => {
        const row = BudgetUI.element("label", "customColor");
        const input = BudgetUI.element("input", "colorInput");
        input.type = "color";
        input.setAttribute("aria-label", label);
        // (A browser with no color box shows a text box instead: wide enough for a typed #rrggbb, which counts once it's whole)
        if (input.type !== "color") {
          input.classList.add("colorText");
          input.placeholder = "#rrggbb";
          input.maxLength = 7;
          input.spellcheck = false;
          input.setAttribute("autocapitalize", "none");
        }
        input.addEventListener("input", () => {
          if (!/^#[0-9a-f]{6}$/i.test(input.value)) return;
          draft[part] = input.value.toLowerCase();
          previewSoon();
        });
        row.append(BudgetUI.element("span", "", label), input);
        colors.append(row);
        return [part, input];
      });
      form.append(BudgetUI.field("Colors", colors, { hint: "Glow is today, the page that's showing, and recommended buttons. Chosen is what's picked, like Cost or Gain." }));

      const choices = CUSTOM_PARTS.map(({ part, label, options }) => {
        const group = BudgetUI.segmented(options.map(([key, name]) => ({ key, label: name })), draft[part], (key) => {
          draft[part] = key;
          Themes.preview(draft);
        });
        form.append(BudgetUI.field(label, group.el));
        return [part, group];
      });

      // The colors and choices as the draft has them
      function fill() {
        base.set(draft.base);
        for (const [part, input] of inputs) input.value = draft[part];
        for (const [part, group] of choices) group.set(draft[part]);
      }
      fill();

      const cancel = BudgetUI.element("button", "budgetButton", "Cancel");
      cancel.type = "button";
      cancel.addEventListener("click", () => panel.close());
      const save = BudgetUI.element("button", "budgetButton primary", "Save Theme");
      save.type = "submit";
      const buttons = BudgetUI.element("div", "panelButtons");
      buttons.append(cancel, save);
      form.append(buttons);
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        if (!Themes.saveCustom(draft)) {
          panel.setError("This browser isn't keeping site data, so the theme can't be saved.");
          return;
        }
        kept = true;
        renderThemes();
        showThemeNotice();
        panel.close();
        BudgetUI.showToast("Your Custom theme is on, in this browser.");
      });

      // Closed without Save (Cancel, ×, Escape, or leaving the page): the theme that was on comes back
      new MutationObserver(() => {
        if (!kept && panel.panel.classList.contains("isClosing")) {
          kept = true;
          Themes.endPreview();
        }
      }).observe(panel.panel, { attributes: true, attributeFilter: ["class"] });

      Themes.preview(draft);
    }
  });
}

//#endregion

// =====================================================================
// #region PUSH NOTIFICATIONS (this device)
// =====================================================================

// Check whether this device already has push on, and make sure the server knows about it (a subscription made with
// keys the server no longer has can't be used, so it goes: see Notifications.js)
async function refreshPushState() {
  pushSubscription = null;
  if (PushNotifications.supported() && reminderSettings.push.available) {
    try {
      const subscription = await PushNotifications.current(reminderSettings.push.publicKey);
      if (subscription && Notification.permission === "granted") {
        const result = await budgetApi("/api/notify/push/subscribe", { subscription: subscription.toJSON(), timezone: currentTimeZone() });
        if (result.ok && result.data) {
          reminderSettings = result.data;
          pushSubscription = subscription;
        }
      }
    } catch (err) {
      console.warn("Couldn't check push notifications on this device:", err);
    }
  }
  renderPush();
}

// On or off for this device, always with a Turn On / Turn Off button. Where push can't work here (the server
// isn't set up, the browser can't, an iPhone not opened from its Home Screen, or notifications are blocked),
// the status says why, and so does Turn On.
function renderPush() {
  const status = document.getElementById("pushStatus");
  const buttons = document.getElementById("pushButtons");
  buttons.replaceChildren();
  renderReminderCard();

  const otherDevices = reminderSettings.push.devices - (pushSubscription ? 1 : 0);
  const others = otherDevices > 0 ? ` They're also on for ${otherDevices} other device${otherDevices > 1 ? "s" : ""}.` : "";
  if (pushSubscription) {
    status.textContent = "On for this device. You'll get a notification at your reminder time on days that need one." + others;
    buttons.append(settingsButton("Turn Off", "danger", turnOffPush), settingsButton("Send Test", "", sendTestPush));
    return;
  }
  const blocked = pushBlockedReason();
  status.textContent = (blocked ? `Off for this device. ${blocked}` : "Off for this device.") + others;
  buttons.append(settingsButton("Turn On", "primary", blocked ? () => BudgetUI.showToast(blocked, true) : turnOnPush));
}

// Why push can't be turned on here, or "" when it can
function pushBlockedReason() {
  if (!reminderSettings.push.available) return "Push notifications aren't set up on the server yet.";
  if (!PushNotifications.supported()) {
    return PushNotifications.needsHomeScreen()
      ? "On iPhone and iPad, add Prismal Planning to your Home Screen first (tap Share, then Add to Home Screen), then open it from there to turn these on."
      : "This browser doesn't support push notifications.";
  }
  return Notification.permission === "denied" ? PUSH_BLOCKED_TEXT : "";
}

// Turn On: allow notifications (the browser asks, right after the tap), subscribe this device, and tell the server
async function turnOnPush(event) {
  event.currentTarget.disabled = true;
  try {
    const result = await PushNotifications.turnOn(reminderSettings.push.publicKey);
    if (!result.ok) {
      BudgetUI.showToast(result.blocked ? PUSH_BLOCKED_TEXT : result.message, true);
      return;
    }
    reminderSettings = result.settings;
    pushSubscription = result.subscription;
    queueReminderPlanSync(true); // Make sure the server has the latest reminder days
    BudgetUI.showToast("Push notifications are on for this device.");
  } catch (err) {
    console.error("Couldn't turn on push notifications:", err);
    BudgetUI.showToast("Couldn't turn on push notifications. Please try again.", true);
  } finally {
    renderPush();
  }
}

// Turn Off: drop this device's subscription, here and on the server (and Home stops asking to turn it on here)
async function turnOffPush(event) {
  event.currentTarget.disabled = true;
  const subscription = pushSubscription;
  const result = await budgetApi("/api/notify/push/unsubscribe", { endpoint: subscription.endpoint });
  if (result.ok && result.data) reminderSettings = result.data;
  // Even if the server missed this, an unsubscribed device is removed the next time a push bounces
  await subscription.unsubscribe().catch(() => {});
  pushSubscription = null;
  PushNotifications.setOff(true);
  BudgetUI.showToast("Push notifications are off for this device.");
  renderPush();
}

// Send Test: a notification to this device now
async function sendTestPush(event) {
  const button = event.currentTarget;
  button.disabled = true;
  const result = await budgetApi("/api/notify/push/test", { endpoint: pushSubscription.endpoint });
  button.disabled = false;
  if (result.ok && result.data && result.data.sent > 0) {
    BudgetUI.showToast("Test sent. It should show up in a few seconds.");
  } else {
    BudgetUI.showToast((result.data && result.data.error) || "The test didn't go through. Try turning push off and back on.", true);
  }
}

//#endregion

// =====================================================================
// #region CALENDAR LINK
// =====================================================================

function renderCalendarLink() {
  const status = document.getElementById("calendarStatus");
  const input = document.getElementById("calendarUrl");
  const buttons = document.getElementById("calendarButtons");
  buttons.replaceChildren();
  renderReminderCard();
  const url = reminderSettings.calendarUrl;
  input.hidden = !url;

  if (!url) {
    input.value = "";
    status.textContent = "Off. Turn it on for your private link.";
    buttons.append(settingsButton("Turn On", "primary", () => setCalendarLink("on")));
    return;
  }

  input.value = url;
  status.textContent = "On. Add this link to your calendar app (how is below), and keep it private.";
  const webcal = url.replace(/^https?:\/\//, "webcal://");
  buttons.append(
    settingsButton("Copy Link", "primary", copyCalendarLink),
    settingsLink("Apple Calendar", webcal, false),
    settingsLink("Google Calendar", "https://calendar.google.com/calendar/render?cid=" + encodeURIComponent(webcal), true),
    settingsButton("New Link", "", () => {
      if (window.confirm("Make a new link? The old one stops working, so you'd add the new one to your calendar again.")) setCalendarLink("reset");
    }),
    settingsButton("Turn Off", "danger", () => {
      if (window.confirm("Turn off the calendar link? Calendars using it stop getting reminders.")) setCalendarLink("off");
    })
  );
}

// action: "on" | "reset" (new link, the old one stops working) | "off"
async function setCalendarLink(action) {
  document.querySelectorAll("#calendarButtons button").forEach(button => { button.disabled = true; });
  const result = await budgetApi("/api/notify/calendar", { action });
  if (result.ok && result.data) {
    reminderSettings = result.data;
    if (action !== "off") queueReminderPlanSync(true); // Make sure the feed has the latest reminder days
    BudgetUI.showToast(action === "off" ? "Calendar link turned off." : action === "reset" ? "New calendar link made." : "Calendar link is on.");
  } else {
    BudgetUI.showToast("Couldn't change the calendar link. Please try again.", true);
  }
  renderCalendarLink();
}

// Copy Link (or select it where copying isn't allowed)
async function copyCalendarLink() {
  const input = document.getElementById("calendarUrl");
  try {
    await navigator.clipboard.writeText(input.value);
    BudgetUI.showToast("Link copied.");
  } catch (err) {
    input.select(); // Copying wasn't allowed, so select it for the user to copy
    BudgetUI.showToast("Copy the selected link.", true);
  }
}

//#endregion

// =====================================================================
// #region ACCOUNT (email, password, reset link, delete account)
// =====================================================================

function wireAccount() {
  document.getElementById("emailForm").addEventListener("submit", changeEmail);
  document.getElementById("addOtherEmailButton").addEventListener("click", (event) => openOtherEmailPanel(event.currentTarget));
  document.getElementById("ageForm").addEventListener("submit", changeAge);
  // The birth date: typed (a 2-digit year is a past one), or picked on a calendar (up to 120 years ago; it starts on the
  // box's date)
  const ageInput = document.getElementById("ageInput");
  const now = createSafeMidnight(new Date());
  ageInput.placeholder = datePattern();
  ageInput.translate = false;
  ageInput.after(BudgetUI.datePickerButton(ageInput, "Birth date", { min: new Date(now.getFullYear() - MAX_AGE, now.getMonth(), now.getDate()), max: now, today: false, pastYears: true }));
  document.getElementById("quickBalancesSwitch").addEventListener("change", (event) => setQuickBalances(event.currentTarget));
  document.getElementById("passwordForm").addEventListener("submit", changePassword);
  document.getElementById("passkeyForm").addEventListener("submit", addPasskey);
  document.getElementById("signOutEverywhereButton").addEventListener("click", signOutEverywhere);
  document.getElementById("downloadDataButton").addEventListener("click", downloadMyData);
  document.getElementById("uploadBackupButton").addEventListener("click", () => document.getElementById("uploadBackupFile").click());
  document.getElementById("uploadBackupFile").addEventListener("change", readBackupFile);
  document.getElementById("deleteForm").addEventListener("submit", deleteAccount);
}

// The account cards: email (and whether it's verified), age, the reset link, Quick Budget icons, and analytics
function renderAccount() {
  document.getElementById("emailStatus").textContent = account.email
    ? `Signed in as ${account.username}, with the email ${account.email}. Password reset links go there.`
    : `Signed in as ${account.username}. Your account doesn't have an email yet. Add one so you can reset your password if you forget it.`;
  document.getElementById("emailButton").textContent = account.email ? "Change Email" : "Add Email";
  document.getElementById("passwordFormUsername").value = account.username;
  renderVerification();
  renderAge();

  const status = document.getElementById("passwordStatus");
  const buttons = document.getElementById("passwordButtons");
  buttons.replaceChildren();
  if (!account.canEmail) {
    status.textContent = "Password reset emails aren't set up on the server yet.";
  } else if (!account.email) {
    status.textContent = "Add an email above first. That's where the reset link goes.";
  } else {
    status.textContent = `Get a link at ${account.email} to choose a new password. It works once, for an hour. A reset signs you out on every device, and turns passkey sign-in off until you turn it back on.`;
    buttons.append(settingsButton("Email Me A Reset Link", "primary", sendResetLink));
  }
  renderOtherEmails();
  renderQuickIcons();
  renderSnapshotIcons();
  renderQuickBalances();
  renderAnalytics();
  renderPasswordless();
}

// A new password: the other devices are signed out and Quick Budget, Quick Calendar, and Snapshot icons stop; this one gets a new session
async function changePassword(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const newPassword = document.getElementById("newPassword").value;
  // The API's rule (passwords.js): LIMITS.passwordMin to LIMITS.password characters, any at all, counted as Unicode characters
  const length = [...newPassword.normalize("NFKC")].length;
  if (length < LIMITS.passwordMin || length > LIMITS.password) {
    BudgetUI.showToast(length < LIMITS.passwordMin ? `Your new password must be at least ${LIMITS.passwordMin} characters.` : `Your new password can be at most ${LIMITS.password} characters.`, true);
    return;
  }
  if (newPassword !== document.getElementById("newPasswordAgain").value) {
    BudgetUI.showToast("The two new passwords don't match.", true);
    return;
  }
  setFormBusy(form, true);
  const send = (leakedOk) => budgetApi("/api/account/password", { password: document.getElementById("currentPassword").value, newPassword, ...(leakedOk ? { leakedOk: true } : {}) });
  let result = await send(false);
  // (Known from data breaches: a warning, not a refusal, and used anyway once the person says so)
  if (!result.ok && result.data && result.data.leaked) {
    if (!window.confirm("That password has shown up in data breaches, so it's one of the first that attackers try. A different one is safer.\n\nUse it anyway?")) {
      setFormBusy(form, false);
      document.getElementById("newPassword").focus();
      return;
    }
    result = await send(true);
  }
  setFormBusy(form, false);
  if (!result.ok || !result.data || !result.data.token) {
    BudgetUI.showToast(accountError(result, "Couldn't change your password. Please try again."), true);
    return;
  }
  localStorage.setItem("prismal_jwt", result.data.token);
  localStorage.setItem("prismal_last_activity", Date.now().toString());
  const hadIcons = account.quickIcons > 0;
  const first = account.hasPassword === false;
  account.quickIcons = 0;
  account.hasPassword = true;
  account.recentUntil = null;
  // On standby (APPLE, GOOGLE, AND MICROSOFT):
  // if (signIns) signIns.hasPassword = true;
  form.reset();
  renderAccount();
  // renderSignIns(); (On standby)
  const noted = account.email && account.canEmail ? " We emailed you a note about it." : "";
  BudgetUI.showToast(`${first ? "Password set" : "Password changed"}. Your other devices were signed out${hadIcons ? ", and your Quick Budget icons were turned off" : ""}.${noted}`);
}

// Change Email (needs the password): the new one gets a link to verify it
async function changeEmail(event) {
  event.preventDefault();
  const form = event.currentTarget;
  setFormBusy(form, true);
  const result = await budgetApi("/api/account/email", {
    email: document.getElementById("newEmail").value.trim(),
    password: document.getElementById("emailPassword").value
  });
  setFormBusy(form, false);
  if (!result.ok || !result.data) {
    BudgetUI.showToast(accountError(result, "Couldn't change the email. Please try again."), true);
    return;
  }
  const added = !account.email;
  const changed = result.data.email !== account.email;
  account = result.data;
  form.reset();
  renderAccount();
  // A new email needs verifying: the API emails it a link (and the old one a note that it changed)
  const verify = !changed ? "" : account.verificationSent
    ? " We emailed it a link to verify it (it works for 24 hours). If it isn't in your inbox, check your spam folder."
    : " Verify it with Send Verification Email above.";
  BudgetUI.showToast(added ? `Email added: ${account.email}.${verify}` : `Email changed to ${account.email}.${verify}`);
}

// Whether the email is verified, and Send Verification Email while it isn't (connecting spreadsheets needs it)
function renderVerification() {
  const status = document.getElementById("verifyStatus");
  const buttons = document.getElementById("verifyButtons");
  buttons.replaceChildren();
  status.hidden = !account.email;
  if (!account.email) return;
  if (account.emailVerified) {
    status.textContent = "Your email is verified.";
    return;
  }
  if (!account.canEmail) {
    status.textContent = "Your email isn't verified yet, and verification emails aren't set up on the server yet.";
    return;
  }
  status.textContent = "Your email isn't verified yet. Connecting spreadsheets needs a verified email, so open the link we emailed you (check your spam folder too), or send a new one. It works for 24 hours.";
  buttons.append(settingsButton("Send Verification Email", "primary", sendVerification));
}

// Email a new verification link (Email's button)
async function sendVerification(event) {
  const button = event.currentTarget;
  button.disabled = true;
  const result = await budgetApi("/api/account/verify-email", {});
  button.disabled = false;
  if (!result.ok || !result.data) {
    BudgetUI.showToast(accountError(result, "Couldn't send the verification email. Please try again."), true);
    return;
  }
  account = result.data;
  renderVerification();
  BudgetUI.showToast(account.alreadyVerified
    ? "Your email is already verified."
    : `Verification link sent to ${account.email}. It works for 24 hours. If it isn't in your inbox, check your spam folder.`);
}

// Back on this page after opening the link (another tab or app): check whether the email is verified now
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState !== "visible" || !account || !account.email || account.emailVerified) return;
  const result = await budgetApi("/api/account");
  if (!result.ok || !result.data || !result.data.emailVerified) return;
  account = result.data;
  renderVerification();
  renderOtherEmails();
  BudgetUI.showToast("Your email is verified, so you can connect spreadsheets and calendars (Menu, then Budgets, Calendars & Spreadsheets) and add other emails now.");
});

// Prismal Planning is for people 18 and older. The birth date given when signing up can be fixed here (like a
// typo), never to one under 18 (the API checks it too).
const MIN_AGE = LIMITS.ageMin;
const MAX_AGE = LIMITS.age;

// The Birth Date card (an account from before birth dates has only an age, so its box starts empty). The box shows it in
// this device's date format.
function renderAge() {
  const status = account.birthdate
    ? `Prismal Planning is for people ${MIN_AGE} and older. Typed the wrong birth date when you signed up? Fix it here.`
    : `Prismal Planning is for people ${MIN_AGE} and older. Add your birth date here.`;
  document.getElementById("ageStatus").textContent = status;
  document.getElementById("ageInput").value = account.birthdate ? showDate(createSafeMidnight(account.birthdate, true)) : "";
}

// Save Birth Date (18 to 120 years ago): typed in this device's date format (or picked), sent as YYYY-MM-DD
async function changeAge(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const typed = document.getElementById("ageInput").value.trim();
  const date = typed ? parseTypedDate(typed, { pastYears: true }) : new Date(NaN);
  if (isNaN(date.getTime())) return BudgetUI.showToast(typed ? `That date isn't a real day. Use ${datePattern()}.` : "Enter your birth date.", true);
  const birthdate = formatToYMD(date);
  const now = createSafeMidnight(new Date());
  let age = now.getFullYear() - date.getFullYear();
  if (now.getMonth() < date.getMonth() || (now.getMonth() === date.getMonth() && now.getDate() < date.getDate())) age--;
  if (age < 0 || age > MAX_AGE) return BudgetUI.showToast("Enter your birth date.", true);
  if (age < MIN_AGE) return BudgetUI.showToast(`Prismal Planning is for people ${MIN_AGE} and older.`, true);
  if (birthdate === account.birthdate) return;
  setFormBusy(form, true);
  const result = await budgetApi("/api/account/birthdate", { birthdate });
  setFormBusy(form, false);
  if (!result.ok || !result.data) {
    BudgetUI.showToast(accountError(result, "Couldn't save your birth date. Please try again."), true);
    return;
  }
  account = result.data;
  renderAge();
  BudgetUI.showToast(`Your birth date is saved: ${showDate(createSafeMidnight(account.birthdate, true))}.`);
}

// Email Me A Reset Link
async function sendResetLink(event) {
  const button = event.currentTarget;
  button.disabled = true;
  const result = await budgetApi("/api/account/password-reset", {});
  button.disabled = false;
  if (result.ok) {
    BudgetUI.showToast(`Reset link sent to ${account.email}. It works for 1 hour. If it isn't in your inbox, check your spam folder.`);
  } else {
    BudgetUI.showToast(accountError(result, "Couldn't send the reset link. Please try again."), true);
  }
}

// Delete Account (with the password and a confirmation), then off to the login page
async function deleteAccount(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const sharedOut = budgetList ? budgetList.budgets.filter(budget => budget.owned && budget.people.some(person => person.joined)).length : 0;
  const alsoShared = sharedOut > 0 ? ` ${sharedOut === 1 ? "One of your budgets is" : `${sharedOut} of your budgets are`} shared, and ${sharedOut === 1 ? "it goes" : "they go"} for everyone ${sharedOut === 1 ? "it's" : "they're"} shared with too.` : "";
  if (!window.confirm(`Delete your account and everything in your budgets? This can't be undone.${alsoShared}`)) return;
  setFormBusy(form, true);
  const result = await budgetApi("/api/account/delete", { password: document.getElementById("deletePassword").value });
  if (!result.ok) {
    setFormBusy(form, false);
    BudgetUI.showToast(accountError(result, "Couldn't delete the account. Please try again."), true);
    return;
  }
  // The account is gone: this device stops its push notifications, stops offering the account's
  // passkeys (where the browser supports it), and forgets the session (keeping its own choices, like analytics off)
  if (pushSubscription) await pushSubscription.unsubscribe().catch(() => {});
  if (passkeyInfo) Passkeys.syncList(passkeyInfo.userHandle, []);
  Passkeys.forgetLast();
  workspaceLoaded = false; // Nothing more to save (and leaving doesn't ask about it)
  clearSignedInData();
  transitionTo("/login.html?deleted=1", true, "right");
}

// An account without a password (only signing in with Apple, Google, or Microsoft makes one, and that's on standby):
// its password boxes hide, Password sets one, and Confirm It's You shows once this session's sign-in is more than a few
// minutes old (and again the moment it gets there)
let confirmTimer = 0;
function renderPasswordless() {
  if (!account) return;
  const noPassword = account.hasPassword === false;
  for (const id of ["emailPassword", "currentPassword", "passkeyPassword", "deletePassword"]) {
    const input = document.getElementById(id);
    input.required = !noPassword;
    input.closest(".settingsField").hidden = noPassword;
  }
  const passwordButton = document.querySelector("#passwordForm button[type=submit]");
  passwordButton.textContent = noPassword ? "Set Password" : "Change Password";
  document.querySelector("#passwordForm .panelHint").textContent = noPassword
    ? "Your account doesn't have a password yet. Set one to sign in with your username or email too. It signs out your other devices and turns off your Quick Budget, Quick Calendar, and Snapshot icons."
    : "A new password signs out your other devices and turns off your Quick Budget, Quick Calendar, and Snapshot icons. This device stays signed in.";

  clearTimeout(confirmTimer);
  const card = document.getElementById("confirmYou");
  const until = noPassword ? Number(account.recentUntil) || 0 : 0;
  card.hidden = !noPassword || Date.now() < until;
  if (noPassword && Date.now() < until) confirmTimer = setTimeout(renderPasswordless, until - Date.now() + 500);
  if (card.hidden) return;
  document.getElementById("confirmYouStatus").textContent = "Changing your email, setting a password, adding a passkey, or deleting your account needs a sign-in from the last 10 minutes. Sign out and sign in again, then do it here.";
  // On standby (APPLE, GOOGLE, AND MICROSOFT): with one connected, the words end "Sign in again to confirm it's you, then
  // do it here." over a Confirm With button for each
  // const connected = signIns ? signIns.connected : [];
  // document.getElementById("confirmYouButtons").replaceChildren(...connected.map(link => {
  //   const provider = { id: link.provider, name: link.name };
  //   return settingsButton(`Confirm With ${link.name}`, "primary", (event) => startProvider(provider, "confirm", event.currentTarget));
  // }));
}

// The API's message, or a fallback (401: signed out, like after a password reset on another device). One that needs a
// recent sign-in first (an account without a password) brings up Confirm It's You too.
function accountError(result, fallback) {
  if (result.status === 401) return "You've been signed out. Please log in again.";
  if (result.status === 0) return "Couldn't reach the server. Please try again.";
  if (result.data && result.data.confirm) {
    account.recentUntil = 0;
    renderPasswordless();
    document.getElementById("confirmYou").scrollIntoView({ block: "center", behavior: window.lessMotion() ? "auto" : "smooth" });
  }
  return (result.data && result.data.error) || fallback;
}

// A form's boxes and buttons off while it sends (and back on after)
function setFormBusy(form, busy) {
  form.querySelectorAll("input, button").forEach(control => { control.disabled = busy; });
}

//#endregion

// =====================================================================
// #region OTHER EMAILS (they sign in too, and their spreadsheets can be connected)
// =====================================================================
// Another email of the account's owner: we email it a link, and once it's opened (the login page checks it), the email
// signs in to the account (with its password, and Forgot Password sends its link there), and spreadsheets its Google
// account shares with admin@prismalplanning.org can be connected. Each one shows whether it's confirmed or waiting (with
// Send Again), and Remove. Adding one needs the account's own email verified first.

const MAX_OTHER_EMAILS = LIMITS.otherEmails;
const SHARING_EMAIL = "admin@prismalplanning.org";

// The list, and Add Email (once the account's own email is verified)
function renderOtherEmails() {
  const list = document.getElementById("otherEmailList");
  const status = document.getElementById("otherEmailsStatus");
  const button = document.getElementById("addOtherEmailButton");
  if (!otherEmails) {
    status.textContent = "Couldn't load your other emails. Please refresh to try again.";
    list.hidden = true;
    button.disabled = true;
    return;
  }
  status.textContent = !account.emailVerified
    ? `Add another email of yours: it signs in to your account too, and spreadsheets its Google account shares with ${SHARING_EMAIL} can be connected. Verify your own email first (above).`
    : `Add another email of yours (up to ${MAX_OTHER_EMAILS}), and open the link we send it. Then it signs in to your account too (with your password), and spreadsheets its Google account shares with ${SHARING_EMAIL} can be connected.`;
  list.replaceChildren(...otherEmails.map(otherEmailItem));
  list.hidden = otherEmails.length === 0;
  button.disabled = !account.emailVerified || !account.canEmail || otherEmails.length >= MAX_OTHER_EMAILS;
}

// One email: confirmed or waiting, Send Again (waiting), and Remove
function otherEmailItem(entry) {
  const item = BudgetUI.element("li", "sheetEmailItem");
  const about = BudgetUI.element("div", "sheetEmailAbout");
  about.append(
    BudgetUI.noTranslate(BudgetUI.element("strong", "", entry.email)),
    BudgetUI.element("span", "panelHint", entry.verified
      ? "Confirmed: it signs in, and spreadsheets it shares can be connected."
      : "Waiting: open the link we emailed it (check its spam folder too).")
  );
  const buttons = BudgetUI.element("div", "sheetEmailButtons");
  if (!entry.verified) {
    const again = settingsButton("Send Again", "", () => sendOtherEmailLink(entry.email, again));
    again.setAttribute("aria-label", `Send the link to ${entry.email} again`);
    buttons.append(again);
  }
  const remove = settingsButton("Remove", "danger", () => removeOtherEmail(entry, remove));
  remove.setAttribute("aria-label", `Remove ${entry.email}`);
  buttons.append(remove);
  item.append(about, buttons);
  return item;
}

// Add Email: the email, then Send Link
function openOtherEmailPanel(origin) {
  BudgetUI.openPanel({
    origin,
    size: "large",
    title: "Add Email",
    build(form, panel) {
      const email = BudgetUI.textField({
        label: "Email",
        placeholder: "you@gmail.com",
        hint: `Another email of yours. We'll email it a link: open it, and the email signs in to your account too, and spreadsheets its Google account shares with ${SHARING_EMAIL} can be connected.`
      });
      email.input.type = "email";
      email.input.autocomplete = "email";
      email.input.spellcheck = false;
      email.input.maxLength = LIMITS.email;
      form.append(email.el, BudgetUI.buttonRow([
        { label: "Send Link", kind: "primary", type: "submit" },
        { label: "Cancel", onClick: () => panel.close() }
      ]));
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        panel.setError("");
        const typed = email.input.value.trim();
        if (!typed) return panel.setError("Type the email to add.");
        panel.setBusy(true);
        const result = await budgetApi("/api/sheets/emails/add", { email: typed });
        panel.setBusy(false);
        if (!result.ok || !result.data) return panel.setError(accountError(result, "Couldn't send the link. Please try again."));
        panel.close();
        showOtherEmails(result.data);
      });
    }
  });
}

// Send Again: a new link to an email that's waiting (the one sent before stops working)
async function sendOtherEmailLink(email, button) {
  button.disabled = true;
  const result = await budgetApi("/api/sheets/emails/add", { email });
  button.disabled = false;
  if (!result.ok || !result.data) return BudgetUI.showToast(accountError(result, "Couldn't send the link. Please try again."), true);
  showOtherEmails(result.data);
}

// The list after adding one (or sending its link again), and what happened
function showOtherEmails(data) {
  otherEmails = data.emails;
  renderOtherEmails();
  BudgetUI.showToast(data.alreadyVerified
    ? "That email is already confirmed."
    : `Link sent to ${data.sent}. Open it within 24 hours (if it isn't in that inbox, check its spam folder), and that email signs in to your account too.`);
}

// Remove (after asking): it can't sign in anymore, and its spreadsheets aren't read for this account
async function removeOtherEmail(entry, button) {
  const what = entry.verified
    ? `It won't sign in to your account anymore, and spreadsheets it shares with ${SHARING_EMAIL} won't be read for you (ones anyone with the link can view still are).`
    : "The link we sent it stops working.";
  if (!window.confirm(`Remove ${entry.email}? ${what}`)) return;
  button.disabled = true;
  const result = await budgetApi("/api/sheets/emails/remove", { email: entry.email });
  if (!result.ok || !result.data) {
    button.disabled = false;
    return BudgetUI.showToast(accountError(result, "Couldn't remove that email. Please try again."), true);
  }
  otherEmails = result.data.emails;
  renderOtherEmails();
  BudgetUI.showToast(`${entry.email} was removed.`);
}

// Back on this page after opening a link (another tab or app): check whether a waiting email is confirmed now
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState !== "visible" || !otherEmails || !otherEmails.some(entry => !entry.verified)) return;
  const waiting = new Set(otherEmails.filter(entry => !entry.verified).map(entry => entry.email));
  const result = await budgetApi("/api/sheets/emails");
  if (!result.ok || !result.data) return;
  otherEmails = result.data.emails;
  renderOtherEmails();
  const confirmed = otherEmails.filter(entry => entry.verified && waiting.has(entry.email)).map(entry => entry.email);
  if (confirmed.length > 0) {
    BudgetUI.showToast(`${confirmed.join(" and ")} ${confirmed.length === 1 ? "is" : "are"} confirmed, so ${confirmed.length === 1 ? "it signs" : "they sign"} in to your account now.`);
  }
});

//#endregion

// =====================================================================
// #region SIGNED-IN DEVICES (Quick Budget icons and their balances, Sign Out Everywhere)
// =====================================================================

// Whether Quick Budget icons show balances: In Bank today, the lowest it gets, and the Equity accounts' balances (a
// setting of the account, so every icon follows it; off, they show the accounts' names only)
function renderQuickBalances() {
  const toggle = document.getElementById("quickBalancesSwitch");
  toggle.checked = account.quickBalances !== false;
  document.getElementById("quickBalancesNote").textContent = toggle.checked
    ? "Quick Budget icons show In Bank today, the lowest it gets, and your Equity accounts' balances."
    : "Off: Quick Budget icons don't show In Bank or any balances, just your Equity accounts' names (to pick one).";
}

// The switch was flipped: saved with the account (the icons follow it the next time they're opened or add an entry)
async function setQuickBalances(toggle) {
  const on = toggle.checked;
  toggle.disabled = true;
  const result = await budgetApi("/api/account/quick-balances", { on });
  toggle.disabled = false;
  if (result.ok && result.data) {
    account = result.data;
    BudgetUI.showToast(on ? "Quick Budget icons show balances again." : "Quick Budget icons don't show balances now.");
  } else {
    BudgetUI.showToast(accountError(result, "Couldn't change that. Please try again."), true);
  }
  renderQuickBalances();
}

// How many Quick Budget icons work, with Turn Off Icons while there are any
function renderQuickIcons() {
  const status = document.getElementById("quickIconStatus");
  const buttons = document.getElementById("quickIconButtons");
  buttons.replaceChildren();
  const count = account.quickIcons || 0;
  if (count === 0) {
    status.textContent = "Quick Budget icons: none right now. The Quick Budget button on Home makes one for a phone's home screen.";
    return;
  }
  status.textContent = `Quick Budget icons: ${count} on home screens. Each one can add entries without signing in, see your Equity accounts (for its account picker) and, unless they're off below, In Bank today, the lowest it gets, and the accounts' balances, and keep your prisms, but nothing else.`;
  buttons.append(settingsButton(count === 1 ? "Turn Off The Icon" : "Turn Off Icons", "danger", turnOffQuickIcons));
}

// Turn Off Icons (after asking): every Quick Budget icon stops working
async function turnOffQuickIcons(event) {
  const count = account.quickIcons;
  if (!window.confirm(`Turn off ${count === 1 ? "your Quick Budget icon" : `all ${count} of your Quick Budget icons`}? ${count === 1 ? "It stops" : "They stop"} working right away (entries already made with ${count === 1 ? "it" : "them"} still get added). You can make a new one on Home.`)) return;
  event.currentTarget.disabled = true;
  const result = await budgetApi("/api/quick/off", {});
  if (result.ok && result.data) {
    account.quickIcons = 0;
    BudgetUI.showToast(count === 1 ? "Your Quick Budget icon is off." : "Your Quick Budget icons are off.");
  } else {
    BudgetUI.showToast(accountError(result, "Couldn't turn off the icons. Please try again."), true);
  }
  renderQuickIcons();
}

// How many Snapshot icons work (the no-login ones Snapshot's Add To Home Screen makes), with Turn Off while there are any
function renderSnapshotIcons() {
  const status = document.getElementById("snapshotIconStatus");
  const buttons = document.getElementById("snapshotIconButtons");
  buttons.replaceChildren();
  const count = account.snapshotIcons || 0;
  if (count === 0) {
    status.textContent = "Snapshot icons: none right now. Snapshot's Add To Home Screen can make one that opens with no login.";
    return;
  }
  status.textContent = `Snapshot icons: ${count} on home screens. Each one shows a budget's Snapshot, and what its cards are worked out from (its entries, History, accounts, and the rest), to anyone who has it, with no login. They can't change anything.`;
  buttons.append(settingsButton(count === 1 ? "Turn Off The Snapshot Icon" : "Turn Off Snapshot Icons", "danger", turnOffSnapshotIcons));
}

// Turn Off Snapshot Icons (after asking): every Snapshot icon stops working
async function turnOffSnapshotIcons(event) {
  const count = account.snapshotIcons;
  if (!window.confirm(`Turn off ${count === 1 ? "your Snapshot icon" : `all ${count} of your Snapshot icons`}? ${count === 1 ? "It stops" : "They stop"} working right away. Snapshot can make a new one.`)) return;
  event.currentTarget.disabled = true;
  const result = await budgetApi("/api/snapshot/off", {});
  if (result.ok && result.data) {
    account.snapshotIcons = 0;
    BudgetUI.showToast(count === 1 ? "Your Snapshot icon is off." : "Your Snapshot icons are off.");
  } else {
    BudgetUI.showToast(accountError(result, "Couldn't turn off the icons. Please try again."), true);
  }
  renderSnapshotIcons();
}

// Every device and browser (this one too) is signed out, and Quick Budget, Quick Calendar, and Snapshot icons stop
async function signOutEverywhere(event) {
  if (!window.confirm("Sign out every device and browser, this one too? Your Quick Budget, Quick Calendar, and Snapshot icons will stop working, and you'll sign in again here.")) return;
  const button = event.currentTarget;
  button.disabled = true;
  const result = await budgetApi("/api/account/sign-out-everywhere", {});
  if (!result.ok) {
    button.disabled = false;
    BudgetUI.showToast(accountError(result, "Couldn't sign out everywhere. Please try again."), true);
    return;
  }
  workspaceLoaded = false; // Nothing more to save (and leaving doesn't ask about it)
  clearSignedInData();
  try { sessionStorage.setItem("prismal_signed_out", "everywhere"); } catch (e) {} // The login page says so
  transitionTo("/login.html", true, "right");
}

//#endregion

// =====================================================================
// #region YOUR DATA AND PRIVACY (Download My Data, analytics on this device)
// =====================================================================

// Everything stored for the account, saved as a JSON file
async function downloadMyData(event) {
  const button = event?.currentTarget || document.getElementById("downloadDataButton");
  button.disabled = true;
  const result = await budgetApi("/api/account/export");
  button.disabled = false;
  if (!result.ok || !result.data) {
    BudgetUI.showToast(accountError(result, "Couldn't get your data. Please try again."), true);
    return;
  }
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([JSON.stringify(result.data, null, 2)], { type: "application/json" }));
  link.download = `prismal-budget-${account.username.replace(/[^\p{L}\p{N}._-]+/gu, "-")}-${formatToYMD(today)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 10000);
  BudgetUI.showToast("Your data is downloading.");
}

// Upload A Backup: the file picked is read on this device (see BACKUPS in Process Budget.js), then its window asks what
// happens, part by part
async function readBackupFile(event) {
  const input = event.currentTarget;
  const file = input.files && input.files[0];
  input.value = ""; // (Picking the same file again reads it again)
  if (!file) return;
  if (!workspaceLoaded) return BudgetUI.showToast("Your budget is still loading. Try again in a moment.", true);
  if (file.size > BACKUP_MAX_BYTES) return BudgetUI.showToast("That file is too big to be one Download My Data saved.", true);
  let backup;
  let text = "";
  try {
    text = await file.text();
    backup = readBackup(text);
  } catch (error) {
    if (!(error instanceof BudgetInputError)) console.error("Couldn't read the backup:", error);
    return BudgetUI.showToast(error instanceof BudgetInputError ? error.message : "That file couldn't be read.", true);
  }
  // (A file with more than one budget reads another one when it's picked)
  openBackupPanel(document.getElementById("uploadBackupButton"), backup, (which) => readBackup(text, which));
}

// What each choice does, for Upload A Backup's window
const BACKUP_CHOICE_WORDS = [
  { key: "current", label: "Prefer Current Data", help: "keeps yours where the two clash, and adds the rest from the backup" },
  { key: "uploaded", label: "Prefer Uploaded Data", help: "the same, but the backup's wins where they clash" },
  { key: "remove", label: "Remove Current Data", help: "puts the backup's in place of yours" }
];

// Upload A Backup's window: whose backup it is, which of its budgets (when it has more than one; reread(which) reads
// another), then each part of that budget it has (what the backup and the open budget each have, and how many clash), each
// with its three choices (Set All picks one for every part). A part the budget has none of yet just takes the backup's.
// It goes into the budget that's open. Undo can't take an upload back, so it offers Download My Data first.
function openBackupPanel(origin, backup, reread) {
  const plans = backupPlans(backup);
  BudgetUI.openPanel({
    origin,
    size: "large",
    title: "Upload A Backup",
    build(form, panel) {
      const { username, downloaded } = backup.from;
      const when = downloaded ? ` from ${showDate(createSafeMidnight(downloaded))}` : "";
      form.append(BudgetUI.element("p", "panelText", `This is ${username ? `${username}'s` : "a"} Download My Data file${when}. It goes into the budget that's open here${budgetInfo ? `, ${budgetInfo.name}` : ""}.`));
      if (backup.budgets.length > 1) {
        const pick = BudgetUI.selectField({ label: "Budget from the file", options: backup.budgets.map((name, index) => ({ value: String(index), label: name })), value: String(backup.which) });
        pick.input.addEventListener("change", () => {
          try {
            openBackupPanel(origin, reread(Number(pick.input.value)), reread);
          } catch (error) {
            panel.setError(error instanceof BudgetInputError ? error.message : "That budget couldn't be read from the file.");
          }
        });
        form.append(pick.el);
      }
      if (plans.length === 0) {
        form.append(BudgetUI.element("p", "panelText", "It has nothing to bring back."), BudgetUI.buttonRow([{ label: "Close", onClick: () => panel.close() }]));
        return;
      }
      const help = BudgetUI.element("ul", "backupHelp");
      for (const choice of BACKUP_CHOICE_WORDS) {
        const item = BudgetUI.element("li");
        item.append(BudgetUI.element("strong", "", choice.label), ` ${choice.help}.`);
        help.append(item);
      }
      form.append(BudgetUI.element("p", "panelText", "For each part of your budget it has, pick what happens where the backup and your budget both have something:"), help);

      const choices = {};
      const pickers = [];
      const setAll = BudgetUI.segmented(BACKUP_CHOICE_WORDS, "", (key) => {
        for (const picker of pickers) {
          picker.set(key);
          choices[picker.id] = key;
        }
      });
      setAll.el.classList.add("backupChoices");
      form.append(BudgetUI.field("Set All", setAll.el));

      const list = BudgetUI.element("div", "backupParts");
      for (const part of plans) {
        const box = BudgetUI.element("div", "backupPart");
        const clash = part.clashes > 0 ? `, and ${part.clashes} ${part.clashes === 1 ? "clashes" : "clash"}` : "";
        box.append(BudgetUI.element("h4", "backupPartName", part.name), BudgetUI.element("p", "panelHint", `The backup has ${part.uploaded} ${part.noun}; your budget has ${part.current}${clash}.`));
        if (part.current === 0) {
          choices[part.id] = "uploaded";
          box.append(BudgetUI.element("p", "panelHint", "Your budget has none yet, so the backup's are added."));
        } else {
          const picker = BudgetUI.segmented(BACKUP_CHOICE_WORDS, "", (key) => { choices[part.id] = key; });
          picker.el.classList.add("backupChoices");
          picker.el.setAttribute("aria-label", part.name);
          pickers.push({ id: part.id, set: picker.set });
          box.append(picker.el);
        }
        list.append(box);
      }
      form.append(list);

      const keep = BudgetUI.element("p", "panelHint", "Undo can't take an upload back. To keep a copy of your budget as it is now, download your data first.");
      form.append(keep, BudgetUI.buttonRow([
        { label: "Upload Backup", kind: "primary", type: "submit" },
        { label: "Download My Data", onClick: () => downloadMyData() },
        { label: "Cancel", onClick: () => panel.close() }
      ]));

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const missing = plans.filter(part => !choices[part.id]).map(part => part.name);
        if (missing.length > 0) return panel.setError(`Pick what happens for ${missing.join(", ")}.`);
        const removed = plans.filter(part => choices[part.id] === "remove" && part.current > 0).map(part => part.name);
        if (removed.length > 0 && !window.confirm(`Remove your current ${removed.join(", ")}, and put the backup's in their place?`)) return;
        const result = await BudgetUI.submit(panel, () => uploadBackup(backup, choices));
        if (result.ok) BudgetUI.showToast("Your backup is in your budget now.");
      });
    }
  });
}

// Google Analytics loads only when this device hasn't turned it off and the browser doesn't ask sites
// not to track it (see Analytics.js)
function renderAnalytics() {
  const status = document.getElementById("analyticsStatus");
  const buttons = document.getElementById("analyticsButtons");
  buttons.replaceChildren();
  let deviceOff = false;
  try { deviceOff = localStorage.getItem("prismal_analytics") === "off"; } catch (e) {}
  const browserSaysNo = navigator.globalPrivacyControl === true || navigator.doNotTrack === "1" || window.doNotTrack === "1";
  if (browserSaysNo) {
    status.textContent = "Off: this browser asks sites not to track it (Global Privacy Control or Do Not Track), so Google Analytics never loads here.";
  } else if (deviceOff) {
    status.textContent = "Off for this device. Google Analytics doesn't load here.";
    buttons.append(settingsButton("Turn On", "primary", () => setAnalytics(true)));
  } else {
    status.textContent = "On. Google Analytics counts page visits, which helps improve Prismal Planning. It never sees your budget, and links' private codes are left out. You can turn it off for this device.";
    buttons.append(settingsButton("Turn Off", "danger", () => setAnalytics(false)));
  }
}

// Analytics on or off for this device
function setAnalytics(on) {
  try {
    if (on) localStorage.removeItem("prismal_analytics");
    else localStorage.setItem("prismal_analytics", "off");
  } catch (e) {}
  // Off stops it on this page right away; on starts with the next page
  if (!on && window.ANALYTICS_ID) window[`ga-disable-${window.ANALYTICS_ID}`] = true;
  BudgetUI.showToast(on ? "Analytics is on for this device, starting with the next page." : "Analytics is off for this device.");
  renderAnalytics();
}

//#endregion

// =====================================================================
// #region PASSKEYS (Face ID, Touch ID, Windows Hello)
// =====================================================================

// On or off, the account's passkeys, and the form that adds one. Off keeps the passkeys but they
// can't sign in. With none yet, adding the first one is what turns it on.
function renderPasskeys() {
  const status = document.getElementById("passkeyStatus");
  const buttons = document.getElementById("passkeyButtons");
  const list = document.getElementById("passkeyList");
  const form = document.getElementById("passkeyForm");
  buttons.replaceChildren();
  list.replaceChildren();
  if (!passkeyInfo) {
    status.textContent = passkeyLoadStatus === 404
      ? "Passkeys aren't set up on the server yet."
      : "Couldn't load your passkeys. Please refresh to try again.";
    list.hidden = true;
    form.hidden = true;
    return;
  }

  const count = passkeyInfo.passkeys.length;
  if (passkeyInfo.on) {
    status.textContent = "On. Sign in with any passkey below instead of typing your password. Your password keeps working too.";
    buttons.append(settingsButton("Turn Off", "danger", () => turnPasskeys(false)));
  } else if (count > 0) {
    status.textContent = "Off. Your passkeys are kept, but they can't sign you in until you turn this back on. Resetting your password turns it off too, so first make sure each passkey below is yours.";
    buttons.append(settingsButton("Turn On", "primary", () => turnPasskeys(true)));
  } else {
    status.textContent = "Off. Turn it on to sign in with Face ID, Touch ID, Windows Hello, a fingerprint, or your device's PIN instead of typing your password. Your password keeps working too, and your face or fingerprint never leaves your device.";
  }

  list.hidden = count === 0;
  passkeyInfo.passkeys.forEach(passkey => list.append(passkeyItem(passkey)));

  form.hidden = false;
  const hint = document.getElementById("passkeyFormHint");
  document.getElementById("passkeyFields").hidden = !Passkeys.usable;
  if (!Passkeys.usable) {
    hint.textContent = Passkeys.onIpAddress
      ? Passkeys.IP_ADDRESS_TEXT
      : "This browser can't make passkeys. Try a newer browser, or add one from another device.";
    return;
  }
  // (An account without a password doesn't type one: Confirm It's You covers it)
  const steps = account && account.hasPassword === false
    ? "confirm with your face, fingerprint, or PIN when your device asks"
    : "enter your password, then confirm with your face, fingerprint, or PIN when your device asks";
  hint.textContent = count === 0
    ? `Turning it on makes a passkey for this device: ${steps}.`
    : `Add a passkey for another device or password manager: ${steps}.`;
  document.getElementById("passkeyAddButton").textContent = count === 0 ? "Turn On" : "Add Passkey";
  const nameInput = document.getElementById("passkeyName");
  nameInput.maxLength = LIMITS.passkeyName;
  if (!nameInput.value) nameInput.value = Passkeys.deviceName();
}

// One passkey: its name, when it was added and last used, and Remove
function passkeyItem(passkey) {
  const item = BudgetUI.element("li", "passkeyItem");
  const about = BudgetUI.element("div", "passkeyAbout");
  const details = [`Added ${formatDay(passkey.createdAt)}`, passkey.lastUsedAt ? `last used ${formatDay(passkey.lastUsedAt)}` : "not used yet"];
  if (passkey.synced) details.push("synced across your devices");
  if (passkey.site !== location.hostname) details.push(`made on ${passkey.site}`); // Only works there
  about.append(BudgetUI.element("strong", "", passkey.name), BudgetUI.element("span", "panelHint", details.join(" · ")));
  item.append(about, settingsButton("Remove", "danger", () => removePasskey(passkey)));
  return item;
}

// The form: check the password, have the device make a passkey, then save it
async function addPasskey(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = document.getElementById("passkeyAddButton").textContent;
  const name = document.getElementById("passkeyName").value.trim() || Passkeys.deviceName();
  // A challenge already checked against the password starts the device's check right away (Safari
  // wants that to happen right after the tap), so trying again doesn't wait on the server
  const hadToWait = !passkeyAdd || Date.now() - passkeyAdd.at >= Passkeys.FRESH_MS;
  if (hadToWait) {
    setFormBusy(form, true);
    const result = await budgetApi("/api/passkey/add/options", { password: document.getElementById("passkeyPassword").value });
    setFormBusy(form, false);
    if (!result.ok || !result.data || !result.data.options) {
      BudgetUI.showToast(accountError(result, "Couldn't start adding the passkey. Please try again."), true);
      return;
    }
    passkeyAdd = { options: result.data.options, at: Date.now() };
  }

  let credential;
  const started = Date.now();
  try {
    credential = await navigator.credentials.create({ publicKey: Passkeys.addRequest(passkeyAdd.options) });
  } catch (error) {
    if (error.name === "InvalidStateError") passkeyAdd = null;
    console.warn("The device didn't make a passkey:", error);
    // Refused at once after waiting on the server: the browser (like Safari) only opens its passkey sheet right in
    // a tap, and the next tap starts it right away (its challenge is ready now)
    if (hadToWait && error.name === "NotAllowedError" && Date.now() - started < Passkeys.INSTANT_MS) {
      BudgetUI.showToast(`One more step: press ${button} again, and your device will ask for your face, fingerprint, or PIN.`);
      return;
    }
    const message = Passkeys.problem(error, true);
    if (message) BudgetUI.showToast(error.name === "NotAllowedError" ? `${message} Press ${button} to try again.` : message, true);
    return;
  }
  passkeyAdd = null;
  setFormBusy(form, true);
  const result = await budgetApi("/api/passkey/add", { name, credential: Passkeys.addAnswer(credential) });
  setFormBusy(form, false);
  if (!result.ok || !result.data) {
    BudgetUI.showToast(accountError(result, "Couldn't add the passkey. Please try again."), true);
    return;
  }
  Passkeys.rememberLast(credential); // The login page tries it by itself next time (when it's on this device)
  passkeyInfo = result.data;
  form.reset();
  renderPasskeys();
  // The API emails the account a note whenever a passkey is added
  const noted = account.email && account.canEmail ? " We emailed you a note about it." : "";
  BudgetUI.showToast(`Passkey added: ${passkeyInfo.added}. Passkey sign-in is on.${noted}`);
}

// Passkey sign-in on or off for the account
async function turnPasskeys(on) {
  document.querySelectorAll("#passkeyButtons button").forEach(button => { button.disabled = true; });
  const result = await budgetApi("/api/passkey/turn", { on });
  if (result.ok && result.data) {
    passkeyInfo = result.data;
    BudgetUI.showToast(on ? "Passkey sign-in is on." : "Passkey sign-in is off. Your passkeys are kept for when you turn it back on.");
  } else {
    BudgetUI.showToast(accountError(result, "Couldn't change passkey sign-in. Please try again."), true);
  }
  renderPasskeys();
}

// Remove a passkey (after asking), and tell the browser it's gone where it can
async function removePasskey(passkey) {
  if (!window.confirm(`Remove the passkey "${passkey.name}"? It won't be able to sign in anymore. To clear it off the device too, delete it in that device's passwords (or passkeys) settings.`)) return;
  document.querySelectorAll("#passkeyList button").forEach(button => { button.disabled = true; });
  const result = await budgetApi("/api/passkey/remove", { id: passkey.id });
  if (result.ok && result.data) {
    passkeyInfo = result.data;
    Passkeys.syncList(passkeyInfo.userHandle, passkeyInfo.passkeys); // Browsers that support it stop offering it
    Passkeys.forgetLast(passkey.id); // The login page doesn't try it by itself anymore
    BudgetUI.showToast(`Passkey removed: ${passkey.name}.`);
  } else {
    BudgetUI.showToast(accountError(result, "Couldn't remove the passkey. Please try again."), true);
  }
  renderPasskeys();
}

// A stored time (ms) -> "Oct 5, 2026"
function formatDay(time) {
  return new Date(time).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

//#endregion

// =====================================================================
// #region APPLE, GOOGLE, AND MICROSOFT (on standby; see signin.js in the API)
// =====================================================================
// Each provider the server has set up: Connect (its sign-in page, which sends the person back here connected, with
// #signin-linked=<provider>) or, once connected, Disconnect (only while the account keeps another way to sign in). An
// account made with one has no password until one is set (see renderPasswordless), and Confirm It's You signs in with
// the provider again (back here with #signin=<code> for a fresh session).
// It's on standby until each provider is set up (its secrets, and its official button and logo): this code and every
// line that uses it (marked "On standby") are commented out, and so is the card in settings.html.

/*
// What a provider sign-in that came back with a problem says here
const SETTINGS_SIGNIN_ERRORS = {
  cancelled: "Connecting was cancelled.",
  expired: "That took too long. Please try again.",
  failed: "That didn't go through. Please try again.",
  taken: "That account already signs in to another Prismal Planning account, so it can't be connected here too.",
  other: "That isn't the account connected here. Confirm with the one that's connected."
};

// The providers, connected or not
function renderSignIns() {
  const card = document.getElementById("signInWith");
  if (!signIns || (signIns.providers.length === 0 && signIns.connected.length === 0)) {
    card.hidden = true;
    return;
  }
  card.hidden = false;
  document.getElementById("signInWithStatus").textContent = signIns.hasPassword
    ? "Sign in with any of these too. Your password keeps working."
    : "Your account signs in with these (it doesn't have a password). Keep at least one connected, or set a password.";
  const list = document.getElementById("signInWithList");
  const rows = signIns.providers.map(provider => ({ provider, link: signIns.connected.find(item => item.provider === provider.id) || null }));
  // (One connected that the server doesn't offer anymore still shows, to take off)
  for (const link of signIns.connected) if (!rows.some(row => row.provider.id === link.provider)) rows.push({ provider: { id: link.provider, name: link.name }, link });
  list.replaceChildren(...rows.map(({ provider, link }) => {
    const item = BudgetUI.element("li", "passkeyItem");
    const about = BudgetUI.element("div", "passkeyAbout");
    about.append(BudgetUI.element("strong", "", provider.name), BudgetUI.element("span", "panelHint", link
      ? `Connected ${formatDay(link.since)}${link.email ? `, as ${link.email}` : ""}`
      : "Not connected"));
    item.append(about, link
      ? settingsButton("Disconnect", "danger", (event) => disconnectProvider(provider, event.currentTarget))
      : settingsButton("Connect", "primary", (event) => startProvider(provider, "link", event.currentTarget)));
    return item;
  }));
}

// Off to a provider's sign-in page: to connect it (intent "link"), or to confirm it's you ("confirm")
async function startProvider(provider, intent, button) {
  button.disabled = true;
  const result = await budgetApi("/api/oauth/start", { provider: provider.id, intent, browser: signInBrowser() });
  if (result.ok && result.data && result.data.url) {
    workspaceLoaded = false; // (Leaving for the provider's page: nothing more to save)
    window.location.assign(result.data.url);
    return;
  }
  button.disabled = false;
  BudgetUI.showToast(accountError(result, "Couldn't open it. Please try again."), true);
}

// Take a provider off the account
async function disconnectProvider(provider, button) {
  if (!window.confirm(`Disconnect ${provider.name}? It won't sign in to your account anymore.`)) return;
  button.disabled = true;
  const result = await budgetApi("/api/oauth/disconnect", { provider: provider.id });
  button.disabled = false;
  if (!result.ok || !result.data) {
    BudgetUI.showToast(accountError(result, "Couldn't disconnect it. Please try again."), true);
    return;
  }
  signIns = result.data;
  renderSignIns();
  renderPasswordless();
  BudgetUI.showToast(`${provider.name} is disconnected.`);
}

// Back from a provider: connected (#signin-linked=<provider>), confirmed (#signin=<code>, traded for a fresh session),
// or what went wrong (#signin-error=<reason>). The address loses it right away.
async function signInReturn() {
  const back = new URLSearchParams(location.hash.slice(1));
  if (!back.has("signin") && !back.has("signin-linked") && !back.has("signin-error")) return;
  history.replaceState(null, "", location.pathname + location.search);
  if (back.has("signin-error")) {
    BudgetUI.showToast(SETTINGS_SIGNIN_ERRORS[back.get("signin-error")] || SETTINGS_SIGNIN_ERRORS.failed, true);
    return;
  }
  if (back.has("signin-linked")) {
    const provider = signIns?.connected.find(item => item.provider === back.get("signin-linked"));
    BudgetUI.showToast(`${provider ? provider.name : "It"} is connected. You can sign in with it now.`);
    document.getElementById("signInWith").scrollIntoView({ block: "center" });
    return;
  }
  const result = await budgetApi("/api/oauth/finish", { code: back.get("signin"), browser: signInBrowser() });
  if (!result.ok || !result.data || !result.data.token) {
    BudgetUI.showToast(accountError(result, "That didn't go through. Please try again."), true);
    return;
  }
  localStorage.setItem("prismal_jwt", result.data.token);
  localStorage.setItem("prismal_last_activity", Date.now().toString());
  const fresh = await budgetApi("/api/account");
  if (fresh.ok && fresh.data) account = fresh.data;
  renderAccount();
  BudgetUI.showToast("Thanks, that's you. For the next 10 minutes, you can change your email, set a password, add a passkey, or delete your account.");
}
*/

//#endregion

// =====================================================================
// #region HELPERS
// =====================================================================

function settingsButton(label, kind, onClick) {
  const button = BudgetUI.element("button", `budgetButton ${kind}`.trim(), label);
  button.type = "button";
  button.addEventListener("click", onClick);
  return button;
}

// A link styled like a button (calendar apps open from these)
function settingsLink(label, href, newTab) {
  const link = BudgetUI.element("a", "budgetButton", label);
  link.href = href;
  if (newTab) {
    link.target = "_blank";
    link.rel = "noopener";
  }
  return link;
}

//#endregion

// This device's Kitchen switches show right away, like its other choices (down here, once what they use is declared),
// and the Kitchen tab's link to them goes to them
renderRecipesCard();
if (location.hash === "#recipesCard") document.getElementById("recipesCard")?.scrollIntoView();
