// Calendars Page (the calendars on Menu > Budgets, Calendars & Spreadsheets): connected calendars, whose shifts become paychecks on
// the budget's calendar. Add one, change its pay, turn it on or off, delete it, and see its paychecks and shifts, worked
// out like a paystub (Calendars.js reads them and works out the pay; CONNECTED SPREADSHEETS in Process Budget.js keeps
// them). Like a spreadsheet, connecting one needs a verified email (Spreadsheets Page.js has the account and its note).

// =====================================================================
// #region SETUP
// =====================================================================

window.workspaceReady.then((loaded) => {
  if (!loaded) return;
  document.getElementById("addCalendarButton").addEventListener("click", (event) => openCalendarPanel(null, event.currentTarget));
  document.addEventListener("budget:updated", renderCalendars);
  document.addEventListener("calendars:read", renderCalendars);
  renderCalendars();
});

//#endregion

// =====================================================================
// #region CONNECTED CALENDARS
// =====================================================================
// Each calendar is a button (it opens the calendar's panel to change it), an On/Off switch, and Delete, with its paychecks
// and shifts under it, and a box when something needs a look. Add Calendar opens a panel that asks for the link, then
// grows into the pay form once the calendar opens.

const CALENDAR_PREVIEW_LINES = 6;

// The connected calendars, and whether one can be added (a verified email, and room for one more)
function renderCalendars() {
  const view = document.getElementById("calendarsView");
  if (!view || !sheetsData) return;
  view.hidden = false;
  const list = document.getElementById("calendarList");
  list.replaceChildren();
  const calendars = sheetsData.list.filter(connection => connection.kind === "calendar");
  if (calendars.length === 0) list.append(BudgetUI.element("li", "sheetEmpty panelHint", "No calendars connected yet."));
  for (const connection of calendars) list.append(calendarItem(connection));
  const unverified = !!account && !account.emailVerified;
  document.getElementById("calendarsVerify").hidden = !unverified;
  document.getElementById("addCalendarButton").disabled = unverified || sheetsData.list.length >= MAX_SHEETS;
}

// The paycheck coming up next (a kept summary), or null
function nextPaycheck(connection) {
  const key = formatToYMD(today);
  return (connection.paychecks || []).map(Calendars.readPaycheck).filter(Boolean).find(paycheck => paycheck.date >= key) || null;
}

// "Read 11/02 7:27 PM on this device: 40 shifts, 8 paychecks with hours, looking ahead to 11/23/2026."
function calendarStatus(connection) {
  const checked = connection.checked;
  if (!checked) return "";
  const at = Calendars.lastReadAt(connection.id);
  const when = at ? `Read ${showDay(new Date(at))} ${new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}: ` : "";
  return `${when}${checked.shifts} ${checked.shifts === 1 ? "shift" : "shifts"}, ${checked.paychecks} ${checked.paychecks === 1 ? "paycheck" : "paychecks"} with hours, looking ahead to ${showDate(Calendars.lookAheadDay(connection.pay))}.`;
}

// One calendar: its button, On/Off, Delete, its paychecks and shifts, and its problems
function calendarItem(connection) {
  const item = BudgetUI.element("li", `sheetItem calendarItem${connection.on ? "" : " isOff"}`);
  const row = BudgetUI.element("div", "sheetRow");

  const open = settingsButton("", "sheetButton", (event) => openCalendarPanel(connection.id, event.currentTarget));
  const { landing, keptOff } = sheetLanding(connection.entries);
  const next = nextPaycheck(connection);
  const noun = connection.placeholder ? (landing === 1 ? "placeholder" : "placeholders") : (landing === 1 ? "paycheck" : "paychecks");
  const count = `${landing} ${noun} from today on${next ? `, next ${showDay(createSafeMidnight(next.date))} ${formatMoney(next.takeHome)}` : ""}`;
  open.append(
    BudgetUI.noTranslate(BudgetUI.element("span", "sheetName", `📅 ${connection.name}`)),
    BudgetUI.noTranslate(BudgetUI.element("span", `sheetCount${connection.placeholder && connection.on ? " isPlaceholder" : ""}`, connection.on ? count : "Off"))
  );
  open.setAttribute("aria-label", `Change ${connection.name}`);

  const toggle = BudgetUI.element("input", "pillSwitch sheetSwitch");
  toggle.type = "checkbox";
  toggle.setAttribute("role", "switch");
  toggle.checked = connection.on;
  toggle.setAttribute("aria-label", `${connection.name}: on or off`);
  toggle.title = connection.on ? "On: its paychecks are on your calendar" : "Off: its paychecks aren't on your calendar";
  toggle.addEventListener("change", async () => {
    toggle.disabled = true;
    const on = toggle.checked;
    const result = await turnSheetConnection(connection.id, on);
    if (!result.ok) {
      toggle.disabled = false;
      toggle.checked = !on;
      return BudgetUI.showToast(result.message || "That didn't work. Please try again.", true);
    }
    BudgetUI.warnIfUnsaved(result);
    BudgetUI.showToast(on ? `${connection.name} is on. Reading it now...` : `${connection.name} is off. Its paychecks are off your calendar until you turn it back on.`);
    if (on) Calendars.refresh({ force: true });
  });

  const remove = settingsButton("Delete", "danger sheetDelete", async () => {
    if (!window.confirm(`Delete ${connection.name}? Its paychecks come off your calendar from today on. Days that already passed keep theirs, and days you changed become plain entries. The calendar itself isn't touched.`)) return;
    remove.disabled = true;
    const result = await deleteSheetConnection(connection.id);
    if (!result.ok) {
      remove.disabled = false;
      return BudgetUI.showToast(result.message || "That didn't work. Please try again.", true);
    }
    BudgetUI.warnIfUnsaved(result);
    BudgetUI.showToast(`${connection.name} was deleted.`);
  });
  remove.setAttribute("aria-label", `Delete ${connection.name}`);

  row.append(open, toggle, remove);
  item.append(row);

  const more = BudgetUI.element("div", "calendarMore");
  const pay = settingsButton("Paychecks And Shifts", "calendarPayButton", (event) => openPaychecks(connection.id, event.currentTarget));
  pay.setAttribute("aria-label", `${connection.name}: paychecks and shifts`);
  more.append(pay);
  const status = calendarStatus(connection);
  if (status) more.append(BudgetUI.element("span", "panelHint calendarStatus", status));
  item.append(more);

  const problems = [...connection.problems];
  if (connection.on && keptOff.length > 0) problems.push(keptOffProblem(keptOff));
  if (problems.length > 0) item.append(problemBox(problems));
  return item;
}

//#endregion

// =====================================================================
// #region ITS PANEL
// =====================================================================
// The link first (Open Calendar reads it), then, once it's open: its name, the paychecks' title, refraction type, Equity
// account, and Placeholder switch (like a spreadsheet's typed parts), the pay (one version for each time it changed:
// Pay Change adds one, and blank boxes in a later one are the one before it's), pay by event title, which events
// count, and what it all comes to.

// The pay settings' boxes, in the order the form shows them (see PAY SETTINGS in Calendars.js for what each one is).
// kind: what the box is (money, number, multiplier, percent, select, weekday, date, text, yesNo, or the pairs night,
// break, and payDays); shown(settings): whether it shows, from the version's settings as they are.
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const PAY_FIELDS = [
  { section: "Paydays", key: "from", kind: "date" },
  { section: "Paydays", key: "payEvery", kind: "select", label: "How often", options: [["week", "Every week"], ["2weeks", "Every other week"], ["twiceMonth", "Twice a month"], ["month", "Once a month"]] },
  { section: "Paydays", key: "payWeekday", kind: "weekday", label: "Payday", shown: (s) => s.payEvery === "week" },
  { section: "Paydays", key: "payAnchor", kind: "date", label: "One of its paydays", hint: "Any payday, so every other week lines up with yours. Blank: the first paycheck.", shown: (s) => s.payEvery === "2weeks" },
  { section: "Paydays", key: "payDays", kind: "payDays", label: "Paid on the", shown: (s) => s.payEvery === "twiceMonth" || s.payEvery === "month" },
  { section: "Paydays", key: "weekend", kind: "select", label: "A payday on a weekend", options: [["none", "Is paid that day"], ["before", "Is paid the Friday before"], ["after", "Is paid the Monday after"]] },
  { section: "Paydays", key: "period", kind: "select", label: "Each paycheck pays", options: [["weeks", "Full workweeks before payday's week"], ["days", "Days up to a few days before payday"]], hint: "Full workweeks: the weeks that ended before the week its payday is in, since the last paycheck's." },
  { section: "Paydays", key: "periodLag", kind: "number", unit: "days before payday", label: "Its pay period ends", hint: "0: it pays through payday itself.", shown: (s) => s.period === "days" },
  { section: "Pay", key: "basePay", kind: "money", unit: "$/hr", label: "Base pay" },
  { section: "Pay", key: "nightPay", kind: "money", unit: "$/hr", label: "Night pay", hint: "Base pay's rate in the night hours. Blank: base pay." },
  { section: "Pay", key: "night", kind: "night", label: "Night hours", hint: "When night pay (and a title rule's night rate) is paid, like 10:00 PM to 6:00 AM. Blank: no night hours." },
  { section: "Pay", key: "premiumWord", kind: "text", label: "Premium word", hint: "A shift with this word in its title is paid base pay times the premium multiplier (like a holiday), and never overtime too. Blank: none." },
  { section: "Pay", key: "premiumMultiplier", kind: "multiplier", label: "Premium multiplier" },
  { section: "Pay", key: "taxableAllowances", kind: "money", unit: "$ each", label: "Taxable allowances", hint: "Added to each paycheck with hours." },
  { section: "Hours And Overtime", key: "weekStart", kind: "weekday", label: "Workweek starts on" },
  { section: "Hours And Overtime", key: "otWeekly", kind: "number", unit: "hrs a week", label: "Overtime after", hint: "0: no weekly overtime." },
  { section: "Hours And Overtime", key: "otDaily", kind: "number", unit: "hrs a day", label: "Overtime after", hint: "For a daily limit too, like 8. 0: none." },
  { section: "Hours And Overtime", key: "dtDaily", kind: "number", unit: "hrs a day", label: "Double time after", hint: "0: none." },
  { section: "Hours And Overtime", key: "overtimeMultiplier", kind: "multiplier", label: "Overtime multiplier" },
  { section: "Hours And Overtime", key: "dtMultiplier", kind: "multiplier", label: "Double time multiplier" },
  { section: "Hours And Overtime", key: "otRate", kind: "select", label: "Overtime is paid on", options: [["blended", "The week's blended rate"], ["own", "Each hour's own rate"]], hint: "Blended: the law's regular rate, the week's pay (with its bonuses) over its hours, so overtime is that hour's rate plus half of it." },
  { section: "Hours And Overtime", key: "overnight", kind: "select", label: "A shift past midnight", options: [["start", "Counts on the day it starts"], ["split", "Is split at midnight"]], hint: "On the day it starts: all of it goes in one paycheck (one over 24 hours is a piece on each day). Split: each day's hours count on that day, so it can be in two paychecks." },
  { section: "Hours And Overtime", key: "break", kind: "break", label: "Unpaid break", hint: "Taken out of each shift that long or longer. 0: none." },
  { section: "Pre-tax Deductions", key: "preTaxMedicalPercent", kind: "percent", label: "Medical" },
  { section: "Pre-tax Deductions", key: "preTaxMedicalFixed", kind: "money", unit: "$ each", label: "Medical, fixed" },
  { section: "Pre-tax Deductions", key: "preTaxRetirementPercent", kind: "percent", label: "Retirement" },
  { section: "Pre-tax Deductions", key: "preTaxRetirementFixed", kind: "money", unit: "$ each", label: "Retirement, fixed" },
  { section: "Pre-tax Deductions", key: "retirementBeforeState", kind: "yesNo", label: "Retirement comes out before state tax", hint: "Yes for most. No when your paystubs take state tax on pay before retirement." },
  { section: "Taxes", key: "ficaPercent", kind: "percent", label: "FICA (Social Security and Medicare)" },
  { section: "Taxes", key: "fedMode", kind: "select", label: "Federal tax", options: [["percent", "A percentage"], ["w4", "From my W-4"], ["none", "None"]] },
  { section: "Taxes", key: "federalPercent", kind: "percent", label: "Federal percentage", shown: (s) => s.fedMode === "percent" },
  { section: "Taxes", key: "fedFiling", kind: "select", label: "W-4 filing status (Step 1c)", options: [["single", "Single or married filing separately"], ["married", "Married filing jointly"], ["head", "Head of household"]], shown: (s) => s.fedMode === "w4" },
  { section: "Taxes", key: "fedStep2", kind: "yesNo", label: "W-4 Step 2 box checked", hint: "For two jobs, or a spouse who works.", shown: (s) => s.fedMode === "w4" },
  { section: "Taxes", key: "fedDependents", kind: "money", unit: "$ a year", label: "W-4 Step 3 (dependents)", shown: (s) => s.fedMode === "w4" },
  { section: "Taxes", key: "fedOtherIncome", kind: "money", unit: "$ a year", label: "W-4 Step 4(a) (other income)", shown: (s) => s.fedMode === "w4" },
  { section: "Taxes", key: "fedDeductions", kind: "money", unit: "$ a year", label: "W-4 Step 4(b) (deductions)", shown: (s) => s.fedMode === "w4" },
  { section: "Taxes", key: "fedExtra", kind: "money", unit: "$ each", label: "W-4 Step 4(c) (extra withholding)", shown: (s) => s.fedMode === "w4" },
  { section: "Taxes", key: "otFederal", kind: "select", label: "Overtime and federal tax", options: [["taxed", "Taxed like the rest"], ["extra", "Its extra isn't taxed"], ["none", "None of it is taxed"]], hint: "Its extra: what overtime pays over straight time (the half in time and a half).", shown: (s) => s.fedMode !== "none" },
  { section: "Taxes", key: "stateMode", kind: "select", label: "State tax", options: () => [["percent", "A percentage"], ...Object.entries(Calendars.STATE_TABLES).sort((a, b) => a[1].name.localeCompare(b[1].name)).map(([code, table]) => [`table:${code}`, table.none ? `${table.name} (no tax on pay)` : table.name]), ["none", "None"]] },
  { section: "Taxes", key: "statePercent", kind: "percent", label: "State percentage", shown: (s) => s.stateMode === "percent" },
  { section: "Taxes", key: "stateElected", kind: "select", label: "Arizona A-4 share", options: () => Calendars.STATE_TABLES.AZ.elected.choices.map(share => [share, `${share.toFixed(1)}% of pay`]), hint: "The share of pay picked on your Arizona Form A-4 (2.0% without one).", shown: (s) => !!pickedState(s)?.elected },
  { section: "Taxes", key: "stateFiling", kind: "select", label: "State filing status", options: [["single", "Single (or head of household)"], ["married", "Married"]], shown: (s) => !!(pickedState(s)?.rules || pickedState(s)?.years) },
  { section: "Taxes", key: "stateAllowances", kind: "number", unit: "allowances", label: "State allowances or dependents", hint: "Oklahoma: the allowances on your OK-W-4. Any other state: the dependents (and allowances besides you and your spouse) on its withholding form.", shown: (s) => !!(pickedState(s)?.rules || pickedState(s)?.years) },
  { section: "Taxes", key: "stateExtra", kind: "money", unit: "$ each", label: "Extra state withholding", shown: (s) => s.stateMode !== "none" },
  { section: "Taxes", key: "otState", kind: "select", label: "Overtime and state tax", options: [["taxed", "Taxed like the rest"], ["extra", "Its extra isn't taxed"], ["none", "None of it is taxed"]], shown: (s) => s.stateMode !== "none" && !pickedState(s)?.none },
  { section: "Taxes", key: "localPercent", kind: "percent", label: "City or county tax", hint: "A local tax on pay, added to the state tax. 0: none." },
  { section: "Post-tax", key: "postTaxPercent", kind: "percent", label: "Post-tax deductions" },
  { section: "Post-tax", key: "postTaxFixed", kind: "money", unit: "$ each", label: "Post-tax deductions, fixed" },
  { section: "Post-tax", key: "nontaxableReimbursements", kind: "money", unit: "$ each", label: "Non-taxable reimbursements" }
];
const PAY_SECTIONS = ["Paydays", "Pay", "Hours And Overtime", "Pre-tax Deductions", "Taxes", "Post-tax"];

// The state picked under State tax (see STATE_TABLES in Calendars.js), or null for a percentage or None
const pickedState = (s) => (s.stateMode === "table" ? Calendars.STATE_TABLES[s.stateTable] || null : null);

// What the "?" beside a pay setting explains (the ones that are easy to get wrong), by its key: each item is a [lead,
// text] pair or plain text (see helpList)
const OVERTIME_TAX_HELP = [
  ["Taxed like the rest: ", "payroll withholds on overtime like any pay, which is what most paystubs show."],
  ["Its extra isn't taxed: ", "leaves out what overtime pays over straight time (the half in time and a half), for estimating pay where that part isn't taxed."],
  ["None of it is taxed: ", "leaves all of it out."],
  "The federal deduction for overtime (2025 through 2028) is taken on the tax return, not the paycheck, so payroll still withholds on it unless your W-4's Step 4(b) counts it."
];
const PAY_HELP = {
  payAnchor: [
    "Every other week has two possible sets of paydays, a week apart. Type any payday you know (a paystub's date), and the rest line up two weeks apart from it, before and after.",
    "Blank: the first paycheck is one of them."
  ],
  period: [
    ["Full workweeks before payday's week: ", "a paycheck pays the workweeks that ended before the week its payday is in, from where the last paycheck's left off. Paid every other Friday with workweeks that start on Sunday, a paycheck pays the two weeks that ended the Saturday before payday's week (a week behind, which is common)."],
    ["Days up to a few days before payday: ", "a paycheck pays every day since the last one's pay period, through a set number of days before payday (Its pay period ends). Common with pay twice a month or once a month."],
    ["Not sure? ", "Look at a paystub's pay period and payday. If the period is whole workweeks that end before payday's week starts, pick the first; if not, pick the second and count the days from the period's last day to payday."]
  ],
  periodLag: [
    "How many days after its pay period ends a paycheck is paid: a paycheck on the 20th for a period that ended on the 15th is 5. One that pays through payday itself is 0."
  ],
  nightPay: [
    "Base pay's rate for the hours inside Night hours, for a job that pays more at night (a shift differential). For $1.50 more at night on $20.00 base pay, type 21.50.",
    "A title rule can have its own night rate."
  ],
  premiumWord: [
    "For shifts paid a multiple of base pay, like a holiday at double time: type a word in those shifts' titles (like Holiday), and they're paid base pay times the premium multiplier.",
    "Their hours count toward the weekly overtime limit, but they're never paid overtime on top. For shifts paid another way (another rate, or an extra per hour or per shift), use Pay By Event Title."
  ],
  taxableAllowances: [
    "A set amount added to every paycheck that has hours, and taxed like pay, like a phone, uniform, or car allowance on a paystub.",
    "Money paid back for something bought for work isn't taxed: that goes in Non-taxable reimbursements (under Post-tax)."
  ],
  weekStart: [
    "The day your employer's workweek starts. Weekly overtime counts each workweek's hours on their own, and Full workweeks pay periods start on this day. Most start on Sunday; a handbook or paystub says if yours doesn't."
  ],
  otRate: [
    ["The week's blended rate: ", "what US law (the FLSA) asks for when hours pay different rates. The week's pay (night pay, title rules' rates, bonuses, and taxable extras per shift) over its hours worked is its regular rate, and an overtime hour is paid its own rate plus half the regular rate (with time and a half)."],
    ["Each hour's own rate: ", "an overtime hour is paid its own rate times the overtime multiplier."],
    "When every hour pays base pay and there are no bonuses, both come out the same."
  ],
  overnight: [
    ["Counts on the day it starts: ", "a shift from 10:00 PM Friday to 6:00 AM Saturday is all Friday's: one paycheck, and one day for a daily overtime limit."],
    ["Is split at midnight: ", "2 of its hours are Friday's and 6 are Saturday's, so a shift across the end of a pay period is in two paychecks."],
    "Match how your paystubs count a shift like that."
  ],
  break: [
    "An unpaid meal break, taken out of each shift at least this long: a 30-minute lunch on shifts of 6 hours or more is 30 minutes for shifts of 6 hrs.",
    "Breaks that are paid (most short ones are): leave it at 0. A title rule can have its own break."
  ],
  retirementBeforeState: [
    "Most states take state tax after 401(k) and similar retirement contributions come out (Yes). A few, like Pennsylvania, tax pay before they come out (No).",
    "A paystub shows it: when its state taxable wages are gross pay less medical but not less retirement, pick No."
  ],
  ficaPercent: [
    "7.65% for most: 6.2% Social Security and 1.45% Medicare, on pay less pre-tax medical. Social Security stops for the year once a calendar year's pay reaches its limit ($184,500 in 2026), and Medicare adds 0.9% on pay past $200,000 in a year.",
    "Jobs that don't pay Social Security (some state and local government jobs, and students working for their school) use 1.45%."
  ],
  fedMode: [
    ["From my W-4: ", "worked out the way payroll does, from the IRS's 2026 tables and the boxes on your W-4 (one from 2020 or later). Bonuses are withheld at the flat 22% for extra pay."],
    ["A percentage: ", "a flat share of pay after pre-tax deductions. From a paystub: its federal tax over its federal taxable wages."]
  ],
  fedStep2: [
    "Step 2 on the W-4 is for two jobs at once, or for married filing jointly when your spouse works too. With its box checked, each job withholds as if its pay had half the usual standard deduction and brackets.",
    "Check it here only when it's checked on the W-4 you gave this employer."
  ],
  otFederal: OVERTIME_TAX_HELP,
  otState: OVERTIME_TAX_HELP.slice(0, 3),
  stateMode: [
    ["A state: ", "worked out the way withholding does for that state, from a year's pay: its 2026 standard deduction, exemptions, brackets, and credits (Oklahoma's from its own withholding tables, and Arizona's from the share picked on its Form A-4). A state's payroll tables can differ by a little, so compare with a paystub: Extra state withholding can even it out."],
    ["A percentage: ", "a flat share of pay. From a paystub: its state tax over its state taxable wages."],
    "States with no tax on pay (Alaska, Florida, Nevada, New Hampshire, South Dakota, Tennessee, Texas, Washington, and Wyoming) say so in the list.",
    "A city or county tax on pay (like Pennsylvania's local earned income tax, Ohio's and Michigan's city taxes, Maryland's and Indiana's county taxes, or New York City's) goes in City or county tax, as a percentage."
  ]
};

// A "?" explanation's content (see BudgetUI.helpList)
const helpList = (items) => BudgetUI.helpList(items);

// A "?" for a part of the form that isn't one field (Pay Change, Pay By Event Title): { button, box }, the box showing
// or hiding the explanation wherever it's put
let calendarHelpCount = 0;
function helpToggle(label, items) {
  const box = BudgetUI.element("div", "fieldHelp calendarHelp");
  box.id = `calendarHelp${++calendarHelpCount}`;
  box.hidden = true;
  box.append(helpList(items));
  const button = BudgetUI.element("button", "fieldHelpButton", "?");
  button.type = "button";
  button.title = label;
  button.setAttribute("aria-label", label);
  button.setAttribute("aria-controls", box.id);
  button.setAttribute("aria-expanded", "false");
  button.addEventListener("click", () => {
    box.hidden = !box.hidden;
    button.setAttribute("aria-expanded", String(!box.hidden));
  });
  return { button, box };
}

const PAY_CHANGE_HELP = [
  "A pay change is your pay from a paycheck on: a raise, a new deduction, a new W-4, or a new schedule. Paychecks before it keep the pay they had, so use one instead of changing the first paycheck's pay (change that only to fix a mistake).",
  "It only needs what changed: a box left blank stays what it was before it. It starts with the first paycheck on or after its Starts on day.",
  "Each one has its own tab here. Tap a tab to see or change it, and Delete This Change takes one away."
];
const TITLE_RULES_HELP = [
  "A title rule pays the shifts with its words in their titles another way: Training at $18.00 an hour, Charge at $2.00 more an hour, PTO as paid time off, or a per diem of $50.00 a shift.",
  "A rule can have its own hourly and night rates, an extra per hour, an extra per shift (taxed, or tax-free like a per diem), a multiplier, its own unpaid break, and the days it's on (From and To).",
  "Hours worked count toward overtime. Paid time off (like vacation) is paid at its rate, but never counts toward overtime.",
  "The first rule whose words are in a shift's title is the one it uses, so put the more exact ones first."
];
// Picks that change which boxes show (the form is drawn again when one changes)
const PAY_REDRAWS = ["payEvery", "period", "fedMode"];
const TAX_NOTE = "Taxes here are estimates of what's withheld (the 2026 IRS tables for a W-4, and each state's 2026 rates), not a tax return. Your employer's payroll decides your real paycheck.";

// A version's own settings (what it fills in), without its day
function definedSettings(version) {
  const settings = {};
  for (const [key, value] of Object.entries(version || {})) {
    if (key !== "from" && value !== undefined && value !== null && value !== "") settings[key] = value;
  }
  return settings;
}

// A typed amount: a number, null when blank, or NaN when it isn't one ("$15.50", "1,200", and "12,50" read as numbers)
function typedNumber(text) {
  const value = String(text ?? "").replace(/%/g, "").replace(/[x×]\s*$/i, "").trim();
  if (!value) return null;
  const number = readMoneyInput(value);
  return Number.isFinite(number) && number >= 0 ? number : NaN;
}

// How a setting reads in a box's hint ("15.5", "Every other week", "Friday", "Yes")
function settingWords(spec, value) {
  if (value === null || value === undefined || value === "") return "blank";
  if (spec.kind === "weekday") return WEEKDAY_NAMES[value];
  if (spec.kind === "yesNo") return value ? "Yes" : "No";
  if (spec.kind === "select") {
    const options = typeof spec.options === "function" ? spec.options() : spec.options;
    return (options.find(([key]) => key === value) || [, String(value)])[1];
  }
  if (spec.kind === "date") return showDate(createSafeMidnight(value));
  return String(value);
}

// Add a calendar (id null), or change one. The panel asks for the link first, then grows into the pay form once the
// calendar opens (one that's being changed opens right away).
function openCalendarPanel(id, origin) {
  const existing = id ? sheetConnectionById(id) : null;
  if (id && !existing) return;
  BudgetUI.openPanel({
    origin,
    size: "large",
    title: existing ? existing.name : "Add Calendar",
    build(form, panel) {
      const kept = Calendars.normalizePay(existing ? existing.pay : {});
      const draft = {
        calendar: null,
        openedLink: "",
        versions: kept.versions.length > 0 ? kept.versions : [{}],
        rules: kept.rules,
        current: 0,
        sections: new Map(), // Sections opened or closed by a tap: name -> open (the rest open as drawVersionForm says)
        openRules: new WeakSet() // Title rules shown open (new ones, and ones tapped open)
      };
      draft.current = draft.versions.length - 1;

      // ---- The link (its main button opens it, and once it's open, saves) ----
      const link = BudgetUI.textField({ label: "Calendar link", value: existing ? existing.link : "", placeholder: "webcal://... or https://.../calendar.ics" });
      link.input.classList.add("sheetLinkInput");
      link.input.autocomplete = "off";
      link.input.spellcheck = false;
      link.input.addEventListener("input", showPrimary);
      BudgetUI.addFieldHelp(link.el, "How to get the link", calendarLinkHelp());
      // One of the account's own Calendar Fractals can be the calendar instead of a link: picked here, its link is kept
      // as "prismal:fractal:<its number>" (Calendars.js reads it from the account's calendar)
      const fractals = window.Fractals && window.Fractals.data() ? window.Fractals.data().fractals : [];
      const source = BudgetUI.selectField({
        label: "Calendar",
        options: [{ value: 0, label: "A calendar link (Apple, Google, Outlook, a work app...)" }, ...fractals.map(fractal => ({ value: fractal.id, label: `Calendar Fractal: ${fractal.name}` }))],
        value: fractals.some(fractal => fractal.id === Calendars.fractalOf(link.input.value)) ? Calendars.fractalOf(link.input.value) : 0,
        hint: "A Calendar Fractal's shifts are the entries you add to it on Home. Only your account can read it, so in a budget you share, it's worked out on your devices."
      });
      source.el.hidden = fractals.length === 0;
      link.el.hidden = Number(source.value()) !== 0;
      source.input.addEventListener("change", () => {
        const picked = Number(source.value());
        link.el.hidden = picked !== 0;
        if (picked !== 0) link.input.value = `prismal:fractal:${picked}`;
        else if (Calendars.fractalOf(link.input.value)) link.input.value = "";
        showPrimary();
      });
      const openedNote = BudgetUI.element("p", "panelHint sheetOpened");
      openedNote.setAttribute("role", "status");
      const buttons = BudgetUI.buttonRow([
        { label: "Open Calendar", kind: "primary", type: "submit" },
        { label: "Cancel", onClick: () => panel.close() }
      ]);
      const primary = buttons.querySelector("button[type=submit]");

      // ---- The form (shown once the calendar opens) ----
      const section = BudgetUI.element("div", "sheetForm calendarForm");
      section.hidden = !existing;
      const name = BudgetUI.textField({ label: "Name", value: existing ? existing.name : "", placeholder: "Work, Second job...", maxLength: MAX_SHEET_NAME });

      // The paychecks: title, refraction type, Equity account (for Hidden and Transfer), and Placeholder
      const fields = existing?.fields || {};
      const accountNames = otherAccounts().map(account => account.name);
      const title = BudgetUI.textField({ label: "Paychecks' title", value: String(fields.title?.value ?? ""), placeholder: Calendars.DEFAULT_TITLE, maxLength: MAX_TITLE, hint: `Each paycheck's entry is called this. Blank: ${Calendars.DEFAULT_TITLE}.` });
      const type = BudgetUI.segmented(BudgetUI.REFRACTION_TYPES, ["❗️", "✖️", "⭕️"].includes(fields.type?.value) ? fields.type.value : "❗️", () => { showAccountRow(); schedulePreview(); });
      const typeField = BudgetUI.field("Refraction Type", type.el, { hint: "Regular for pay that goes into your budget's account. Hidden, with an Equity account, for pay that goes somewhere else." });
      BudgetUI.addFieldHelp(typeField, "What the refraction types do", refractionTypesHelp());
      const account = BudgetUI.element("select", "selectInput accountSelect");
      account.append(new Option("None", ""), ...accountNames.map(accountName => new Option(accountName, accountName)));
      account.value = accountNames.includes(fields.account?.value) ? fields.account.value : "";
      account.addEventListener("change", schedulePreview);
      const accountField = BudgetUI.field("Equity Account", account, { hint: "The account its paychecks change, for Hidden and Transfer." });
      const placeholder = BudgetUI.placeholderField({
        checked: !!existing?.placeholder,
        hint: "Every paycheck it adds is a placeholder: a stand-in, since a paycheck worked out ahead is an estimate. They count like any entry and show in yellow, and each is deleted once its day passes."
      });
      placeholder.input.addEventListener("change", schedulePreview);
      const entryPart = calendarFieldset("Its Paychecks", [title.el, typeField, accountField, placeholder.el]);

      // The pay, version by version
      const payPart = BudgetUI.element("fieldset", "calculatorSection calendarPart calendarPay");
      payPart.append(BudgetUI.element("legend", "", "Pay"));
      const versionBar = BudgetUI.element("div", "calendarVersions");
      versionBar.setAttribute("role", "group");
      versionBar.setAttribute("aria-label", "Pay changes");
      const crystalRow = BudgetUI.element("div", "calendarCrystals");
      const versionArea = BudgetUI.element("div", "calendarVersion");
      const payChangeHelp = helpToggle("What a pay change is", PAY_CHANGE_HELP);
      payPart.append(versionBar, payChangeHelp.box, crystalRow, versionArea, BudgetUI.element("p", "panelHint", TAX_NOTE));

      // Pay by event title
      const rulesPart = BudgetUI.element("fieldset", "calculatorSection calendarPart");
      const rulesHelp = helpToggle("What title rules do", TITLE_RULES_HELP);
      const rulesLegend = BudgetUI.element("legend", "", "Pay By Event Title");
      rulesLegend.append(rulesHelp.button);
      rulesPart.append(rulesLegend, rulesHelp.box);
      const rulesList = BudgetUI.element("div", "calendarRules");
      const addRule = settingsButton("Add Title Rule", "calendarAddRule", () => {
        if (draft.rules.length >= Calendars.MAX_RULES) return BudgetUI.showToast(`A calendar can have up to ${Calendars.MAX_RULES} title rules.`, true);
        const rule = { contains: "", kind: "worked" };
        draft.rules.push(rule);
        draft.openRules.add(rule);
        drawRules();
        rulesList.lastElementChild?.querySelector("input")?.focus({ preventScroll: true });
      });
      rulesPart.append(BudgetUI.element("p", "panelHint", "A shift whose title has a rule's words in it is paid the rule's way (any capitals). The first rule that matches is the one it uses, so put the more exact ones first."), rulesList, addRule);

      // Which events count
      const pay = kept;
      const only = BudgetUI.textField({ label: "Only events with", value: pay.only, placeholder: "Blank: every timed event", hint: "Words (with commas between them), any of which an event's title needs to be a shift. Blank: every event with a time is a shift. Overlapping events count once." });
      const skip = BudgetUI.textField({ label: "Leave out events with", value: pay.skip, placeholder: "Day off, Meeting...", hint: "Words (with commas between them) that keep an event from being a shift." });
      const bonusWord = BudgetUI.textField({ label: "Bonus word", value: pay.bonusWord, placeholder: "bonus", maxLength: 40, hint: "An all-day event with this word and an amount, like Bonus $25, is a bonus that week. Blank: no bonuses." });
      const aheadCount = BudgetUI.element("input", "frequencyCount");
      aheadCount.type = "text";
      aheadCount.inputMode = "numeric";
      aheadCount.value = String(pay.lookAhead.count);
      aheadCount.setAttribute("aria-label", "How far to look ahead");
      const aheadUnit = BudgetUI.element("select", "selectInput frequencyUnit");
      aheadUnit.append(new Option("days", "days"), new Option("weeks", "weeks"), new Option("months", "months"));
      aheadUnit.value = pay.lookAhead.unit;
      aheadUnit.setAttribute("aria-label", "Days, weeks, or months");
      const aheadRow = BudgetUI.element("div", "frequencyRow");
      aheadRow.append(aheadCount, aheadUnit);
      const ahead = BudgetUI.field("Look ahead", aheadRow, { hint: "Paychecks paid further past today aren't added yet (a schedule that far out may not be done). Their shifts still show." });
      BudgetUI.addFieldHelp(only.el, "Which events are shifts", helpList([
        "Words, with commas between them: an event with any of them in its title is a shift, and other events aren't. Blank: every event with a start and end time is a shift (all-day events never are, except bonuses).",
        "Leave out events with does the opposite: words like Day off, Requested off, or Meeting keep an event from being a shift.",
        "Events that overlap count once, as one shift, so no time is counted twice."
      ]));
      BudgetUI.addFieldHelp(ahead, "What look ahead does", helpList([
        "How far past today a paycheck's payday can be for it to go on your budget. Schedules further out often aren't final, so a paycheck waits until its payday is this close (21 days to start).",
        "Its shifts still show in Paychecks And Shifts before then."
      ]));
      const eventsPart = calendarFieldset("Which Events Count", [only.el, skip.el, bonusWord.el, ahead]);
      aheadCount.addEventListener("input", () => aheadCount.classList.toggle("isWrong", !/^\d*$/.test(aheadCount.value.trim())));
      [only.input, skip.input, bonusWord.input, aheadCount].forEach(input => input.addEventListener("input", schedulePreview));
      aheadUnit.addEventListener("change", schedulePreview);

      const preview = BudgetUI.element("div", "sheetPreview");
      preview.setAttribute("aria-live", "polite");

      section.append(name.el, entryPart, payPart, rulesPart, eventsPart, preview);
      form.append(source.el, link.el, openedNote, section, buttons);
      [title.input].forEach(input => input.addEventListener("input", schedulePreview));
      showAccountRow();
      drawVersions();
      drawRules();
      updatePreview();

      form.addEventListener("submit", (event) => {
        event.preventDefault();
        if (!draft.calendar || link.value() !== draft.openedLink) return openLink();
        save();
      });
      if (existing) openLink();

      // Open Calendar until it's open (and again when the link changes), then Save
      function showPrimary() {
        const opened = !!draft.calendar && link.value() === draft.openedLink;
        primary.textContent = !opened ? "Open Calendar" : (existing ? "Save" : "Save Calendar");
      }

      // Equity account shows for Hidden and Transfer
      function showAccountRow() {
        accountField.hidden = !BudgetUI.isAccountType(type.value()) || accountNames.length === 0;
      }

      // ---- Versions ----

      // The version tabs ("First paycheck: 01/09/2026", "Change: 07/10/2026", ...), Pay Change, and the picked version's
      // boxes
      function drawVersions() {
        versionBar.replaceChildren();
        draft.versions.forEach((version, index) => {
          const label = index === 0 ? "First paycheck" : "Change";
          const when = version.from ? showDate(createSafeMidnight(version.from)) : "pick a day";
          const tab = settingsButton(`${label}: ${when}`, `calendarVersionTab${index === draft.current ? " isPicked" : ""}`, () => {
            draft.current = index;
            drawVersions();
          });
          tab.setAttribute("aria-pressed", String(index === draft.current));
          versionBar.append(tab);
        });
        const change = settingsButton("Pay Change", "calendarVersionAdd", () => {
          if (draft.versions.length >= Calendars.MAX_VERSIONS) return BudgetUI.showToast(`A calendar can have up to ${Calendars.MAX_VERSIONS - 1} pay changes.`, true);
          draft.versions.push({});
          draft.current = draft.versions.length - 1;
          drawVersions();
          versionArea.querySelector("input.dateInput")?.focus({ preventScroll: true });
        });
        change.title = "Pay that changes from a paycheck on, like a raise or a new deduction";
        versionBar.append(change, payChangeHelp.button);
        drawCrystals();
        drawVersionForm();
      }

      // Crystals (the Paycheck Calculator's saved boxes) fill in the picked version's boxes they have
      function drawCrystals() {
        crystalRow.replaceChildren();
        const crystals = calculatorStore("crystals");
        if (crystals.length === 0) return;
        crystalRow.append(BudgetUI.element("span", "fieldLabel", "Fill in from a crystal"));
        const buttonsBox = BudgetUI.element("div", "calendarCrystalButtons");
        crystals.forEach((crystal, index) => {
          const button = settingsButton(`💎 ${crystal.name || `Crystal ${index + 1}`}`, "calendarCrystal", () => {
            const settings = Calendars.crystalSettings(crystal.values);
            if (Object.keys(settings).length === 0) return BudgetUI.showToast("That crystal has none of the pay boxes a calendar uses (its hours come from the calendar).", true);
            Object.assign(draft.versions[draft.current], settings);
            drawVersionForm();
            schedulePreview();
            BudgetUI.showToast(`Filled in from ${crystal.name || `Crystal ${index + 1}`}. The hours come from the calendar.`);
          });
          BudgetUI.noTranslate(button);
          buttonsBox.append(button);
        });
        crystalRow.append(buttonsBox);
      }

      // What a version is with what it leaves out filled in, and what the one before it was (PAY_DEFAULTS' for the first)
      function versionSettings(index) {
        let before = { ...Calendars.PAY_DEFAULTS };
        for (let i = 0; i < index; i++) before = { ...before, ...definedSettings(draft.versions[i]) };
        if (index > 0 && !draft.versions[0].payAnchor && draft.versions[0].from) before.payAnchor = draft.versions[0].from;
        if (index > 0 && draft.versions[0].payWeekday === undefined && draft.versions[0].from) before.payWeekday = createSafeMidnight(draft.versions[0].from).getDay();
        const now = { ...before, ...definedSettings(draft.versions[index]) };
        if (index === 0 && draft.versions[0].payWeekday === undefined && draft.versions[0].from) now.payWeekday = createSafeMidnight(draft.versions[0].from).getDay();
        return { before, now };
      }

      // The picked version's boxes, by section. Each section opens and closes; to start, the first version shows its
      // Paydays and Pay, and a change shows the sections it changes something in (and Paydays, for its day).
      function drawVersionForm() {
        versionArea.replaceChildren();
        const index = draft.current;
        const version = draft.versions[index];
        const { before, now } = versionSettings(index);
        const later = index > 0;
        if (later) versionArea.append(BudgetUI.element("p", "panelHint", "A change only needs what's new: a blank box stays as it was before it. It starts with the first paycheck on or after its day, so paychecks before then stay as they were."));
        const keysOf = (spec) => (spec.kind === "night" ? ["nightFrom", "nightTo"] : spec.kind === "break" ? ["breakMinutes", "breakAfter"] : spec.key === "stateMode" ? ["stateMode", "stateTable"] : [spec.key]);
        for (const sectionName of PAY_SECTIONS) {
          const specs = PAY_FIELDS.filter(field => field.section === sectionName && (!field.shown || field.shown(now)));
          const changed = later ? specs.filter(spec => spec.key !== "from" && keysOf(spec).some(key => key in version)).length : 0;
          const group = BudgetUI.element("details", "calendarGroup");
          const startsOpen = index === 0 ? ["Paydays", "Pay"].includes(sectionName) : sectionName === "Paydays" || changed > 0;
          group.open = draft.sections.has(sectionName) ? draft.sections.get(sectionName) : startsOpen;
          const summary = BudgetUI.element("summary", "", sectionName);
          if (changed > 0) summary.append(BudgetUI.element("span", "calendarGroupNote", ` (${changed} changed)`));
          const boxes = BudgetUI.element("div", "calendarGroupBoxes");
          for (const spec of specs) {
            const box = payBox(spec, version, before, later);
            if (PAY_HELP[spec.key]) BudgetUI.addFieldHelp(box, `What ${box.querySelector(".fieldLabel")?.textContent || spec.label} means`, helpList(PAY_HELP[spec.key]));
            boxes.append(box);
          }
          group.append(summary, boxes);
          // (Only a tap is kept: the toggle that opening it here sets off isn't one)
          group.dataset.drawn = String(group.open);
          group.addEventListener("toggle", () => {
            if (!group.dataset.touched && String(group.open) === group.dataset.drawn) return;
            group.dataset.touched = "1";
            draft.sections.set(sectionName, group.open);
          });
          versionArea.append(group);
        }
        if (later) {
          versionArea.append(BudgetUI.buttonRow([{ label: "Delete This Change", kind: "danger", onClick: () => {
            draft.versions.splice(index, 1);
            draft.current = Math.max(0, index - 1);
            drawVersions();
            schedulePreview();
          } }]));
        }
      }

      // One setting's box (or pair of boxes): it writes what's typed or picked into the version as it changes
      function payBox(spec, version, before, later) {
        const sameAs = (value) => `Same as before (${settingWords(spec, value)})`;
        const redraw = () => { drawVersionForm(); schedulePreview(); };
        // (A new day for the version draws its tab again too)
        const set = (key, value, redrawAfter = false) => {
          if (value === null || value === undefined || value === "") delete version[key];
          else version[key] = value;
          if (key === "from") { drawVersions(); schedulePreview(); }
          else if (redrawAfter) redraw();
          else schedulePreview();
        };
        const numberInput = (key, unit, placeholderValue, label = "") => {
          const input = BudgetUI.element("input", "calendarNumber");
          input.type = "text";
          input.inputMode = "decimal";
          input.dataset.key = key;
          if (label) input.setAttribute("aria-label", label);
          input.value = typeof version[key] === "number" ? String(version[key]) : "";
          input.placeholder = placeholderValue === null || placeholderValue === undefined ? "" : String(placeholderValue);
          input.addEventListener("input", () => {
            const number = typedNumber(input.value);
            input.classList.toggle("isWrong", Number.isNaN(number));
            if (!Number.isNaN(number)) set(key, number);
          });
          const wrapper = BudgetUI.element("div", "unitInput");
          wrapper.append(input);
          if (unit) wrapper.append(BudgetUI.element("span", "inputUnit", unit));
          return wrapper;
        };
        const select = (key, options, value, redrawAfter) => {
          const box = BudgetUI.element("select", "selectInput");
          box.dataset.key = key;
          if (later) box.append(new Option(sameAs(before[key]), ""));
          for (const [optionKey, label] of options) box.append(new Option(label, String(optionKey)));
          box.value = value === undefined ? (later ? "" : String(before[key])) : String(value);
          box.addEventListener("change", () => {
            const picked = options.find(([optionKey]) => String(optionKey) === box.value);
            set(key, picked ? picked[0] : undefined, redrawAfter);
          });
          return box;
        };
        const hint = (text) => text || "";

        if (spec.kind === "date") {
          const isFrom = spec.key === "from";
          const label = isFrom ? (later ? "Starts on" : "First paycheck") : spec.label;
          const hintText = isFrom
            ? (later ? "The day this change starts: it's for the first paycheck on or after it." : "The first payday to count: its pay period's shifts are the first ones counted.")
            : spec.hint;
          const box = BudgetUI.dateField({ label, date: version[spec.key] ? createSafeMidnight(version[spec.key]) : null, optional: !isFrom, hint: hintText });
          box.input.dataset.key = spec.key;
          const write = () => {
            const value = box.value();
            box.input.classList.toggle("isWrong", value === undefined);
            const day = value ? formatToYMD(value) : "";
            if (value !== undefined && day !== (version[spec.key] || "")) set(spec.key, day);
          };
          box.input.addEventListener("change", write);
          box.input.addEventListener("blur", write);
          return box.el;
        }
        if (spec.kind === "select") {
          const options = typeof spec.options === "function" ? spec.options() : spec.options;
          if (spec.key === "stateMode") {
            // (A state's tables are "table" with the state's code)
            const value = version.stateMode === undefined ? undefined : version.stateMode === "table" ? `table:${version.stateTable || "OK"}` : version.stateMode;
            const beforeValue = before.stateMode === "table" ? `table:${before.stateTable}` : before.stateMode;
            const box = BudgetUI.element("select", "selectInput");
            box.dataset.key = "stateMode";
            if (later) box.append(new Option(`Same as before (${settingWords({ ...spec, options }, beforeValue)})`, ""));
            for (const [optionKey, label] of options) box.append(new Option(label, optionKey));
            box.value = value === undefined ? (later ? "" : beforeValue) : value;
            box.addEventListener("change", () => {
              if (!box.value) {
                delete version.stateMode;
                delete version.stateTable;
              } else if (box.value.startsWith("table:")) {
                version.stateMode = "table";
                version.stateTable = box.value.slice(6);
              } else {
                version.stateMode = box.value;
                delete version.stateTable;
              }
              redraw();
            });
            return BudgetUI.field(spec.label, box, { hint: hint(spec.hint) });
          }
          return BudgetUI.field(spec.label, select(spec.key, options, version[spec.key], PAY_REDRAWS.includes(spec.key)), { hint: hint(spec.hint) });
        }
        if (spec.kind === "weekday") {
          return BudgetUI.field(spec.label, select(spec.key, WEEKDAY_NAMES.map((day, index) => [index, day]), version[spec.key], false), { hint: hint(spec.hint) });
        }
        if (spec.kind === "yesNo") {
          return BudgetUI.field(spec.label, select(spec.key, [[true, "Yes"], [false, "No"]], version[spec.key], false), { hint: hint(spec.hint) });
        }
        if (spec.kind === "text") {
          const input = BudgetUI.element("input", "textInput");
          input.type = "text";
          input.maxLength = 60;
          input.dataset.key = spec.key;
          input.value = typeof version[spec.key] === "string" ? version[spec.key] : "";
          input.placeholder = later ? sameAs(before[spec.key]) : "";
          input.addEventListener("input", () => set(spec.key, input.value.replace(/\s+/g, " ").trim()));
          return BudgetUI.field(spec.label, input, { hint: hint(spec.hint) });
        }
        if (spec.kind === "payDays") {
          const dayOptions = [...Array.from({ length: 30 }, (_, day) => [day + 1, ordinal(day + 1)]), [31, "last day"]];
          const current = version.payDays || null;
          const twice = (version.payEvery || before.payEvery) === "twiceMonth";
          const first = BudgetUI.element("select", "selectInput");
          const second = BudgetUI.element("select", "selectInput");
          first.dataset.key = "payDays0";
          second.dataset.key = "payDays1";
          for (const box of twice ? [first, second] : [first]) {
            if (later) box.append(new Option("Same as before", ""));
            for (const [day, label] of dayOptions) box.append(new Option(label, String(day)));
          }
          const shownDays = current || (later ? null : before.payDays);
          first.value = shownDays ? String(shownDays[0]) : "";
          second.value = shownDays && shownDays[1] ? String(shownDays[1]) : (later ? "" : "31");
          // (In a change, a box left on Same as before keeps that day, so changing one of two paydays keeps the other)
          const write = () => {
            if (!first.value && (!twice || !second.value)) return set("payDays", undefined);
            const firstDay = first.value ? Number(first.value) : before.payDays[0];
            if (!twice) return set("payDays", [firstDay]);
            set("payDays", [firstDay, second.value ? Number(second.value) : (before.payDays[1] ?? firstDay)]);
          };
          first.addEventListener("change", write);
          second.addEventListener("change", write);
          const row = BudgetUI.element("div", "calendarPair");
          row.append(first);
          if (twice) row.append(BudgetUI.element("span", "rangeWord", "and the"), second);
          return BudgetUI.field(spec.label, row, { hint: "Of each month (a month without that day pays on its last)." });
        }
        if (spec.kind === "night") {
          const time = (key) => {
            const input = BudgetUI.element("input", "calendarTime");
            input.type = "time";
            input.dataset.key = key;
            input.value = typeof version[key] === "string" ? version[key] : "";
            input.setAttribute("aria-label", key === "nightFrom" ? "Night hours start" : "Night hours end");
            input.addEventListener("change", () => set(key, input.value));
            return input;
          };
          const row = BudgetUI.element("div", "calendarPair");
          row.append(BudgetUI.element("span", "rangeWord", "From"), time("nightFrom"), BudgetUI.element("span", "rangeWord", "to"), time("nightTo"));
          const was = later && before.nightFrom && before.nightTo ? ` Blank: as before (${before.nightFrom} to ${before.nightTo}).` : "";
          return BudgetUI.field(spec.label, row, { hint: spec.hint + was });
        }
        if (spec.kind === "break") {
          const row = BudgetUI.element("div", "calendarPair");
          row.append(numberInput("breakMinutes", "minutes", later ? before.breakMinutes : 0, "Unpaid break, in minutes"), BudgetUI.element("span", "rangeWord", "for shifts of"),
            numberInput("breakAfter", "hrs", later ? before.breakAfter : 0, "Shifts at least this many hours long"));
          return BudgetUI.field(spec.label, row, { hint: spec.hint });
        }
        // Numbers: money, hours, multipliers, and percents
        const unit = spec.unit || (spec.kind === "percent" ? "%" : spec.kind === "multiplier" ? "×" : "");
        const placeholderValue = later ? before[spec.key] : (spec.key === "nightPay" ? "" : before[spec.key]);
        return BudgetUI.field(spec.label, numberInput(spec.key, unit, placeholderValue), { hint: hint(spec.hint) + (later && before[spec.key] !== null && before[spec.key] !== undefined ? `${spec.hint ? " " : ""}Blank: as before.` : "") });
      }

      // ---- Title rules ----

      function drawRules() {
        rulesList.replaceChildren();
        if (draft.rules.length === 0) rulesList.append(BudgetUI.element("p", "panelHint", "No title rules: every shift is paid base pay."));
        draft.rules.forEach((rule, index) => rulesList.append(ruleCard(rule, index)));
      }

      // One rule: its words, how it pays, its rates and extras, and when it's on. It opens and closes; its summary says
      // what it does.
      function ruleCard(rule, index) {
        const card = BudgetUI.element("details", "calendarRule");
        card.open = draft.openRules.has(rule);
        const summary = BudgetUI.noTranslate(BudgetUI.element("summary", "", ruleSummary(rule, index)));
        card.append(summary);
        card.addEventListener("toggle", () => { if (card.open) draft.openRules.add(rule); else draft.openRules.delete(rule); });
        const after = () => {
          summary.textContent = ruleSummary(rule, index);
          schedulePreview();
        };
        const text = (label, key, placeholderText, hintText = "") => {
          const box = BudgetUI.textField({ label, value: rule[key] || "", placeholder: placeholderText, maxLength: MAX_TITLE, hint: hintText });
          box.input.addEventListener("input", () => { rule[key] = box.value(); after(); });
          return box.el;
        };
        const number = (label, key, unit, hintText = "") => {
          const input = BudgetUI.element("input", "calendarNumber");
          input.type = "text";
          input.inputMode = "decimal";
          input.value = typeof rule[key] === "number" ? String(rule[key]) : "";
          input.addEventListener("input", () => {
            const value = typedNumber(input.value);
            input.classList.toggle("isWrong", Number.isNaN(value));
            if (!Number.isNaN(value)) { rule[key] = value; after(); }
          });
          const wrapper = BudgetUI.element("div", "unitInput");
          wrapper.append(input, BudgetUI.element("span", "inputUnit", unit));
          return BudgetUI.field(label, wrapper, { optional: true, hint: hintText });
        };
        const kind = BudgetUI.element("select", "selectInput");
        kind.append(new Option("Hours worked", "worked"), new Option("Paid time off (not worked, like vacation)", "paidOff"));
        kind.value = rule.kind === "paidOff" ? "paidOff" : "worked";
        kind.addEventListener("change", () => { rule.kind = kind.value; after(); });
        const taxFree = BudgetUI.element("select", "selectInput");
        taxFree.append(new Option("Taxed like pay", "no"), new Option("Tax-free (like a per diem)", "yes"));
        taxFree.value = rule.shiftTaxFree ? "yes" : "no";
        taxFree.addEventListener("change", () => { rule.shiftTaxFree = taxFree.value === "yes"; after(); });
        const date = (label, key) => {
          const box = BudgetUI.dateField({ label, date: rule[key] ? createSafeMidnight(rule[key]) : null, optional: true, hint: " " });
          const write = () => {
            const value = box.value();
            box.input.classList.toggle("isWrong", value === undefined);
            if (value !== undefined) { rule[key] = value ? formatToYMD(value) : ""; after(); }
          };
          box.input.addEventListener("change", write);
          box.input.addEventListener("blur", write);
          return box.el;
        };
        const grid = BudgetUI.element("div", "calendarRuleGrid");
        grid.append(
          text("Title has", "contains", "Like Training", "Any capitals."),
          BudgetUI.field("Pays as", kind),
          number("Hourly rate", "rate", "$/hr", "Blank: base pay."),
          number("Night rate", "night", "$/hr", "In the night hours. Blank: its hourly rate."),
          number("Extra per hour", "extraHour", "$/hr", "Added to its rates."),
          number("Multiplier", "multiplier", "×", "Its rates times this. Blank: 1."),
          number("Extra per shift", "extraShift", "$ each", "A stipend for each shift."),
          BudgetUI.field("Extra per shift is", taxFree),
          number("Unpaid break", "breakMinutes", "minutes", "Blank: the usual break."),
          date("Starts on", "from"),
          date("Ends on", "to")
        );
        const move = (by) => {
          const to = index + by;
          if (to < 0 || to >= draft.rules.length) return;
          [draft.rules[index], draft.rules[to]] = [draft.rules[to], draft.rules[index]];
          drawRules();
          after();
        };
        const row = BudgetUI.buttonRow([
          ...(index > 0 ? [{ label: "Move Up", onClick: () => move(-1) }] : []),
          ...(index < draft.rules.length - 1 ? [{ label: "Move Down", onClick: () => move(1) }] : []),
          { label: "Delete Rule", kind: "danger", onClick: () => { draft.rules.splice(index, 1); drawRules(); after(); } }
        ]);
        card.append(grid, row);
        return card;
      }

      // ---- What it comes to ----

      // The pay settings as they're set now (a blank look ahead is the usual one)
      function currentPay() {
        const count = aheadCount.value.trim();
        return {
          versions: draft.versions.map(version => ({ ...version })),
          rules: draft.rules.map(rule => ({ ...rule })),
          lookAhead: { count: count ? Number(count) : null, unit: aheadUnit.value },
          only: only.value(),
          skip: skip.value(),
          bonusWord: bonusWord.value()
        };
      }

      // The paychecks' title, type, and account, typed like a spreadsheet's
      function currentFields() {
        return {
          title: { value: title.value() },
          type: { value: type.value() },
          account: { value: accountField.hidden ? "" : account.value }
        };
      }

      let previewTimer = null;
      function schedulePreview() {
        clearTimeout(previewTimer);
        previewTimer = setTimeout(updatePreview, 250);
      }

      // What reading it with these settings finds: paychecks from today on, and problems
      function updatePreview() {
        preview.replaceChildren();
        if (!draft.calendar) {
          if (existing) preview.append(BudgetUI.element("p", "panelHint", "Opening the calendar..."));
          return null;
        }
        const read = Calendars.workOut(draft.calendar, { pay: currentPay(), fields: currentFields() });
        const upcoming = read.entries.filter(entry => createSafeMidnight(entry[0], true) >= today &&
          recurringHits(entry[3], createSafeMidnight(entry[0], true), getSpecialType(entry[1])) === false);
        const { keptOff } = sheetLanding(read.entries);
        const from = read.from ? ` Counting shifts from ${showDate(read.from)}: ${read.checked?.shifts || 0} so far.` : "";
        preview.append(BudgetUI.element("p", "sheetPreviewHeading", upcoming.length === 0
          ? `Paychecks: none from today on yet.${from}`
          : `Paychecks: ${upcoming.length} from today on${upcoming.length > CALENDAR_PREVIEW_LINES ? ", starting with" : ""}.${from}`));
        if (upcoming.length > 0) {
          const list = BudgetUI.noTranslate(BudgetUI.element("ul", `sheetPreviewList${placeholder.value() ? " isPlaceholder" : ""}`));
          for (const [dateText, special, amount, entryTitle] of upcoming.slice(0, CALENDAR_PREVIEW_LINES)) {
            const detail = read.details.find(found => formatToMMDDYYYY(found.check.payDate) === dateText);
            const hours = detail ? ` (${hoursWords(detail.hours)})` : "";
            const line = BudgetUI.element("li", amount > 0 ? "positive" : "");
            line.append(BudgetUI.element("span", "sheetPreviewDate", showDay(createSafeMidnight(dateText, true))), ` ➕${baseSprite(special)} ${formatMoney(amount)} ${entryTitle}${hours}`);
            list.append(line);
          }
          preview.append(list);
        }
        const problems = [...read.problems, ...(keptOff.length > 0 ? [keptOffProblem(keptOff)] : [])];
        if (problems.length > 0) preview.append(problemBox(problems));
        return read;
      }

      // Open Calendar: download and read it, then show the form
      async function openLink() {
        const typed = link.value();
        panel.setError("");
        if (!typed) return panel.setError("Paste the calendar's link.");
        openedNote.textContent = "Opening the calendar...";
        panel.setBusy(true);
        let calendar;
        try {
          calendar = Calendars.parseCalendar(await Calendars.readCalendarFile(typed));
        } catch (err) {
          openedNote.textContent = "";
          panel.setBusy(false);
          panel.setError(err.message || "Couldn't open that calendar. Please try again.");
          return;
        }
        panel.setBusy(false);
        draft.calendar = calendar;
        draft.openedLink = typed;
        if (!name.value()) name.input.value = (calendar.name || "Work").slice(0, MAX_SHEET_NAME);
        const count = calendar.events.length;
        openedNote.textContent = `Opened${calendar.name ? ` "${calendar.name}"` : ""}: ${count.toLocaleString()} ${count === 1 ? "event" : "events"} (repeating ones count once here).`;
        BudgetUI.noTranslate(openedNote);
        showPrimary();
        if (section.hidden) {
          section.hidden = false;
          section.classList.add("isOpening");
          setTimeout(() => section.classList.remove("isOpening"), 600);
          name.input.focus({ preventScroll: true });
        }
        updatePreview();
      }

      // Save Calendar: check the form, work it out with it, and save the connection
      function save() {
        panel.setError("");
        if (!name.value()) return panel.setError("Give the calendar a name.");
        if (hasTitleArrow(title.value())) return panel.setError(TITLE_ARROW);
        const wrong = form.querySelector(".isWrong");
        if (wrong) {
          const closed = wrong.closest("details");
          if (closed) closed.open = true;
          wrong.focus();
          return panel.setError("One of the boxes isn't a number (or a day) it can read. Fix the one marked in red.");
        }
        const first = draft.versions[0];
        if (!first.from) {
          draft.current = 0;
          drawVersions();
          return panel.setError("Pick the day of the first paycheck to count, under Pay.");
        }
        const days = draft.versions.map(version => version.from);
        if (days.slice(1).some(day => !day)) return panel.setError("Each pay change needs the day it starts.");
        if (days.slice(1).some(day => day <= first.from)) return panel.setError("Each pay change has to start after the first paycheck.");
        if (new Set(days).size !== days.length) return panel.setError("Two pay changes start on the same day. Give one another day, or delete it.");
        if (draft.rules.some(rule => !String(rule.contains || "").trim())) return panel.setError("Each title rule needs the words it looks for in a title, or delete it.");
        const pay = Calendars.normalizePay(currentPay());
        const read = Calendars.workOut(draft.calendar, { pay, fields: currentFields() });
        if (read.blocked) return panel.setError("Fix what's under Needs a look first: no paychecks can be added from it yet.");
        BudgetUI.submit(panel, () => saveSheetConnection(
          { kind: "calendar", name: name.value(), link: draft.openedLink, fields: currentFields(), placeholder: placeholder.value(), pay },
          { entries: read.entries, problems: read.problems, paychecks: read.paychecks, checked: read.checked },
          existing ? existing.id : null
        )).then(result => {
          if (!result.ok) return;
          Calendars.remember(result.sheetId, draft.calendar, read);
          const { landing } = sheetLanding(read.entries);
          BudgetUI.showToast(existing ? `${name.value()} is saved.` : `${name.value()} is connected: ${landing} ${landing === 1 ? "paycheck" : "paychecks"} from today on.`);
        });
      }
    }
  });
}

// "Rule 2: Training ($18.50/hr, night $20.50)"
function ruleSummary(rule, index) {
  const parts = [];
  if (rule.kind === "paidOff") parts.push("paid time off");
  if (typeof rule.rate === "number") parts.push(`${formatMoney(rule.rate)}/hr`);
  if (typeof rule.night === "number") parts.push(`night ${formatMoney(rule.night)}`);
  if (typeof rule.extraHour === "number" && rule.extraHour) parts.push(`+${formatMoney(rule.extraHour)}/hr`);
  if (typeof rule.multiplier === "number") parts.push(`×${rule.multiplier}`);
  if (typeof rule.extraShift === "number" && rule.extraShift) parts.push(`+${formatMoney(rule.extraShift)} a shift${rule.shiftTaxFree ? ", tax-free" : ""}`);
  if (typeof rule.breakMinutes === "number") parts.push(`${rule.breakMinutes}-minute break`);
  return `Rule ${index + 1}: ${rule.contains || "(no words yet)"}${parts.length > 0 ? ` (${parts.join(", ")})` : ""}`;
}

// A part of the calendar's form, in its own box
function calendarFieldset(legend, children) {
  const part = BudgetUI.element("fieldset", "calculatorSection calendarPart");
  part.append(BudgetUI.element("legend", "", legend), ...children);
  return part;
}

// "1st", "2nd", "23rd"
function ordinal(day) {
  const ending = day % 100 >= 11 && day % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][day % 10] || "th";
  return `${day}${ending}`;
}

// "80 regular, 16 overtime hours"
function hoursWords(hours) {
  const parts = [];
  const show = (amount) => String(Math.round(amount * 100) / 100);
  if (hours.regular) parts.push(`${show(hours.regular)} regular`);
  if (hours.overtime) parts.push(`${show(hours.overtime)} overtime`);
  if (hours.double) parts.push(`${show(hours.double)} double time`);
  if (hours.premium) parts.push(`${show(hours.premium)} premium`);
  if (hours.paidOff) parts.push(`${show(hours.paidOff)} paid off`);
  return parts.length > 0 ? `${parts.join(", ")} hours` : "no hours";
}

// The link's "?": where each calendar app keeps a calendar's subscription link
function calendarLinkHelp() {
  const list = BudgetUI.element("ul");
  const item = (strong, text) => {
    const li = BudgetUI.element("li");
    li.append(BudgetUI.element("strong", "", strong), text);
    list.append(li);
  };
  item("Apple (iCloud): ", "in the Calendar app, tap Calendars, then the i next to the calendar with your shifts, and turn on Public Calendar. Tap Share Link and copy it (it starts with webcal://).");
  item("Google Calendar: ", "on a computer, open Settings, pick the calendar under Settings for my calendars, and copy the Secret address in iCal format (it ends in basic.ics).");
  item("Outlook: ", "in Outlook on the web, open Settings, then Calendar, then Shared calendars. Under Publish a calendar, pick the calendar, pick Can view all details, tap Publish, and copy the ICS link.");
  item("Work scheduling apps: ", "most can add your shifts to a calendar app with a subscription link (often called iCal, ICS, or Sync To Calendar). Copy that link here.");
  item("Keep it to yourself: ", "anyone with the link can see that calendar's events. A calendar with just your shifts keeps everything else private.");
  return list;
}

//#endregion

// =====================================================================
// #region PAYCHECKS AND SHIFTS
// =====================================================================
// A calendar's paychecks, like a pay app: this year's totals and the next paycheck, a schedule of its shifts (this week
// and the next three, with the paydays), and every paycheck with hours, newest first. Tapping one shows how it adds up,
// shift by shift. The shifts come from the last time this page read the calendar.

const SCHEDULE_WEEKS = 4;

// A calendar's Paychecks And Shifts window (drawn again whenever the calendars are read)
function openPaychecks(id, origin) {
  const connection = () => sheetConnectionById(id);
  if (!connection()) return;
  BudgetUI.openPanel({
    origin,
    size: "large",
    title: `${connection().name}: Paychecks`,
    build(form, panel) {
      const content = BudgetUI.element("div", "calendarPayView");
      let weekOffset = 0;
      form.append(content, BudgetUI.buttonRow([{ label: "Close", onClick: () => panel.close() }]));
      draw();
      const redraw = () => {
        if (!panel.panel.isConnected) return document.removeEventListener("calendars:read", redraw);
        if (connection()) draw();
      };
      document.addEventListener("calendars:read", redraw);

      function draw() {
        const found = connection();
        if (!found) return panel.close();
        content.replaceChildren();
        const paychecks = (found.paychecks || []).map(Calendars.readPaycheck).filter(Boolean);
        const worked = Calendars.lastWorkedOut.get(found.id);
        const thisYear = paychecks.filter(paycheck => paycheck.date.startsWith(String(today.getFullYear())));
        const sum = (pick) => thisYear.reduce((total, paycheck) => total + pick(paycheck), 0);
        const next = nextPaycheck(found);

        // This year's totals, and the next paycheck
        const totals = BudgetUI.element("div", "paycheckResults calendarTotals");
        const card = (label, amount, main = false) => {
          const box = BudgetUI.element("div", `infoCard paycheckResult${main ? " takeHome" : ""}`);
          box.append(BudgetUI.element("span", "infoLabel", label), BudgetUI.noTranslate(BudgetUI.element("span", "paycheckAmount", amount)));
          return box;
        };
        totals.append(
          card("Take Home This Year", formatMoney(sum(p => p.takeHome)), true),
          card("Gross This Year", formatMoney(sum(p => p.gross))),
          card("Taxes This Year", formatMoney(sum(p => p.fica + p.federal + p.state))),
          card("Hours This Year", String(Math.round(sum(p => p.hours.regular + p.hours.overtime + p.hours.double + p.hours.premium + p.hours.paidOff) * 100) / 100)),
          card(next ? `Next Paycheck: ${showDay(createSafeMidnight(next.date))}` : "Next Paycheck", next ? formatMoney(next.takeHome) : "--")
        );
        content.append(totals);
        if (next) {
          const line = `Next payday ${showDate(createSafeMidnight(next.date))}, for ${showDay(createSafeMidnight(next.from))} to ${showDay(createSafeMidnight(next.to))}: ${hoursWords(next.hours)}, ${formatMoney(next.takeHome)} take home.`;
          content.append(BudgetUI.noTranslate(BudgetUI.element("p", "calendarNext", line)));
        }
        const status = calendarStatus(found);
        if (status) content.append(BudgetUI.element("p", "panelHint", status));

        // The schedule
        const scheduleBox = BudgetUI.element("section", "calendarSchedule");
        scheduleBox.append(BudgetUI.element("h4", "", "Schedule"));
        if (worked) {
          scheduleBox.append(scheduleGrid(found, worked.result, weekOffset, (by) => { weekOffset += by; draw(); }));
        } else {
          scheduleBox.append(BudgetUI.element("p", "panelHint", found.on ? "The shifts show once the calendar is read on this page." : "The shifts show once the calendar is on and read."));
          if (found.on) scheduleBox.append(BudgetUI.buttonRow([{ label: "Read It Now", onClick: (event) => {
            event.currentTarget.disabled = true;
            Calendars.refresh({ force: true });
          } }]));
        }
        content.append(scheduleBox);

        // Every paycheck with hours, newest first
        const listBox = BudgetUI.element("section", "calendarPaychecks");
        listBox.append(BudgetUI.element("h4", "", "Paychecks With Hours, Newest First"));
        if (paychecks.length === 0) listBox.append(BudgetUI.element("p", "panelHint", "No paychecks with hours yet."));
        const list = BudgetUI.element("ul", "calendarPaycheckList");
        for (const paycheck of [...paychecks].reverse()) {
          const item = BudgetUI.element("li");
          const button = settingsButton("", "calendarPaycheck", (event) => openPaycheck(found.id, paycheck.date, event.currentTarget));
          const upcoming = paycheck.date >= formatToYMD(today);
          const top = BudgetUI.element("span", "calendarPaycheckTop");
          top.append(
            BudgetUI.noTranslate(BudgetUI.element("strong", "", showDate(createSafeMidnight(paycheck.date)))),
            BudgetUI.noTranslate(BudgetUI.element("span", "", `${showDay(createSafeMidnight(paycheck.from))} to ${showDay(createSafeMidnight(paycheck.to))}`)),
            BudgetUI.element("span", `calendarPaycheckStatus${upcoming ? " isUpcoming" : ""}`, upcoming ? "Upcoming" : "Paid")
          );
          const middle = BudgetUI.noTranslate(BudgetUI.element("span", "calendarPaycheckHours", hoursWords(paycheck.hours)));
          const pretax = paycheck.medical + paycheck.retirement;
          const taxes = paycheck.fica + paycheck.federal + paycheck.state;
          const bottom = BudgetUI.noTranslate(BudgetUI.element("span", "calendarPaycheckMoney",
            `Gross ${formatMoney(paycheck.gross)}, pre-tax ${formatMoney(-pretax)}, taxes ${formatMoney(-taxes)}, post-tax ${formatMoney(-paycheck.post)}`));
          const takeHome = BudgetUI.noTranslate(BudgetUI.element("span", "calendarPaycheckTake positive", `${formatMoney(paycheck.takeHome)} take home`));
          button.append(top, middle, bottom, takeHome);
          item.append(button);
          list.append(item);
        }
        listBox.append(list);
        content.append(listBox);
      }
    }
  });
}

// The schedule: SCHEDULE_WEEKS weeks from the workweek's first day (this week, moved by weekOffset weeks with ‹ and ›),
// each day's shifts (a long one shows where it starts, goes on, and ends), ★ for premium ones, paydays, and each week's
// hours
function scheduleGrid(connection, result, weekOffset, move) {
  const box = BudgetUI.element("div", "calendarScheduleBox");
  const versions = Calendars.resolvedVersions(Calendars.normalizePay(connection.pay));
  const weekStart = versions.length > 0 ? versions[versions.length - 1].weekStart : 0;
  const first = addDays(addDays(today, -((today.getDay() - weekStart + 7) % 7)), weekOffset * 7);
  const last = addDays(first, SCHEDULE_WEEKS * 7 - 1);
  const paydays = new Map((connection.paychecks || []).map(Calendars.readPaycheck).filter(Boolean).map(paycheck => [paycheck.date, paycheck]));

  const nav = BudgetUI.element("div", "calendarScheduleNav");
  const earlier = settingsButton("‹", "calendarScheduleMove", () => move(-SCHEDULE_WEEKS));
  earlier.setAttribute("aria-label", "Earlier weeks");
  const later = settingsButton("›", "calendarScheduleMove", () => move(SCHEDULE_WEEKS));
  later.setAttribute("aria-label", "Later weeks");
  nav.append(earlier, BudgetUI.noTranslate(BudgetUI.element("span", "calendarScheduleRange", `${showDate(first)} to ${showDate(last)}`)), later);
  box.append(nav);

  const grid = BudgetUI.element("div", "calendarScheduleGrid");
  grid.setAttribute("role", "table");
  const head = BudgetUI.element("div", "calendarScheduleRow isHead");
  head.setAttribute("role", "row");
  for (let d = 0; d < 7; d++) head.append(BudgetUI.element("span", "calendarScheduleHead", WEEKDAY_NAMES[(weekStart + d) % 7].slice(0, 3)));
  head.append(BudgetUI.element("span", "calendarScheduleHead", "Hours"));
  grid.append(head);

  const timeWords = (ms) => {
    const date = new Date(ms);
    const hours = date.getHours();
    return `${hours % 12 || 12}:${String(date.getMinutes()).padStart(2, "0")}${hours < 12 ? "a" : "p"}`;
  };
  for (let w = 0; w < SCHEDULE_WEEKS; w++) {
    const row = BudgetUI.element("div", "calendarScheduleRow");
    row.setAttribute("role", "row");
    let weekHours = 0;
    for (let d = 0; d < 7; d++) {
      const day = addDays(first, w * 7 + d);
      const next = addDays(day, 1);
      const cell = BudgetUI.element("div", `calendarScheduleDay${day.getTime() === today.getTime() ? " isToday" : ""}`);
      cell.setAttribute("role", "cell");
      // (A phone shows each day's weekday beside it, since its days are a list)
      cell.append(BudgetUI.element("span", "calendarScheduleWeekday", WEEKDAY_NAMES[day.getDay()].slice(0, 3)),
        BudgetUI.element("span", "calendarScheduleDate", d === 0 || day.getDate() === 1 ? showDay(day) : String(day.getDate())));
      for (const shift of result.shifts) {
        if (shift.end <= day.getTime() || shift.start >= next.getTime()) continue;
        const startsToday = shift.start >= day.getTime();
        const endsToday = shift.end <= next.getTime();
        const hours = Math.round((shift.end - shift.start) / 360000) / 10;
        const when = startsToday && endsToday ? `${timeWords(shift.start)}-${timeWords(shift.end)}`
          : startsToday ? `${timeWords(shift.start)} → (${hours}h)` : endsToday ? `→ ${timeWords(shift.end)}` : "→ all day →";
        const line = BudgetUI.element("span", `calendarShift${shift.premium ? " isPremium" : ""}${startsToday && endsToday ? "" : " isLong"}`);
        line.append(BudgetUI.element("span", "calendarShiftTime", `${shift.premium ? "★ " : ""}${when}`), BudgetUI.noTranslate(BudgetUI.element("span", "calendarShiftTitle", shift.title)));
        cell.append(line);
      }
      for (const piece of result.shifts.flatMap(shift => shift.pieces)) {
        if (piece.day.getTime() === day.getTime()) weekHours += piece.hours;
      }
      const payday = paydays.get(formatToYMD(day));
      if (payday) cell.append(BudgetUI.noTranslate(BudgetUI.element("span", "calendarPayday", `➕ Payday ${formatMoney(payday.takeHome)}`)));
      row.append(cell);
    }
    row.append(BudgetUI.element("span", "calendarScheduleHours", String(Math.round(weekHours * 100) / 100)));
    grid.append(row);
  }
  box.append(grid, BudgetUI.element("p", "panelHint", "★ premium. A long shift shows the day it starts (with its hours), the days it goes on, and the day it ends. Hours are each week's, after unpaid breaks."));
  return box;
}

// One paycheck: how it adds up, and its shifts (from the last read on this page)
function openPaycheck(id, date, origin) {
  const connection = sheetConnectionById(id);
  const paycheck = (connection?.paychecks || []).map(Calendars.readPaycheck).filter(Boolean).find(found => found.date === date);
  if (!paycheck) return;
  BudgetUI.openPanel({
    origin,
    size: "large",
    stacked: true,
    title: `Paycheck: ${showDate(createSafeMidnight(paycheck.date))}`,
    build(form, panel) {
      form.append(BudgetUI.noTranslate(BudgetUI.element("p", "calendarNext", `Pays ${showDate(createSafeMidnight(paycheck.from))} to ${showDate(createSafeMidnight(paycheck.to))}: ${hoursWords(paycheck.hours)}, at a base pay of ${formatMoney(paycheck.base)} an hour.`)));
      const lines = [
        ["Regular Pay", paycheck.regular], ["Overtime Pay", paycheck.overtime], ["Premium Pay", paycheck.premium], ["Paid Time Off", paycheck.paidOff],
        ["Bonuses", paycheck.bonuses], ["Per-shift Extras", paycheck.extras], ["Taxable Allowances", paycheck.allowances],
        ["Gross", paycheck.gross, true],
        ["Pre-tax Medical", -paycheck.medical], ["Pre-tax Retirement", -paycheck.retirement],
        ["FICA", -paycheck.fica], ["Federal", -paycheck.federal], ["State", -paycheck.state],
        ["Post-tax Deductions", -paycheck.post], ["Reimbursements (Tax-free)", paycheck.reimbursed],
        ["Take Home", paycheck.takeHome, true]
      ];
      const breakdown = BudgetUI.element("dl", "breakdownList");
      for (const [label, amount, isTotal] of lines) {
        if (!isTotal && Math.round(amount * 100) === 0) continue;
        const row = BudgetUI.element("div", `breakdownRow${isTotal ? " total" : ""}`);
        const value = BudgetUI.noTranslate(BudgetUI.element("dd", amount < 0 ? "negative" : "", formatMoney(amount)));
        row.append(BudgetUI.element("dt", "", label), value);
        breakdown.append(row);
      }
      form.append(breakdown, BudgetUI.element("p", "panelHint", TAX_NOTE));

      // Its shifts, piece by piece
      const worked = Calendars.lastWorkedOut.get(id);
      const detail = worked?.result.details.find(found => formatToYMD(found.check.payDate) === paycheck.date);
      const shiftsBox = BudgetUI.element("section", "calendarPaycheckShifts");
      shiftsBox.append(BudgetUI.element("h4", "", "Its Shifts"));
      if (!detail) {
        shiftsBox.append(BudgetUI.element("p", "panelHint", "Its shifts show once the calendar is read on this page."));
      } else {
        const list = BudgetUI.element("ul", "calendarShiftList");
        const timeWords = (ms) => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
        for (const piece of detail.pieces) {
          const kinds = piece.kind === "premium" ? ["Premium"] : piece.kind === "paidOff" ? ["Paid time off"]
            : [...new Set(piece.segments.map(segment => ({ regular: "Regular", overtime: "Overtime", double: "Double time" })[segment.kind]))];
          const straight = piece.segments.reduce((total, segment) => total + (segment.straight || 0), 0);
          const rate = piece.hours > 0 && piece.kind === "worked" ? straight / piece.hours : piece.kind === "premium" ? piece.version.basePay * piece.version.premiumMultiplier : piece.dayRate;
          const part = piece.parts > 1 ? ` (${piece.part} of ${piece.parts})` : "";
          const item = BudgetUI.element("li");
          item.append(
            BudgetUI.noTranslate(BudgetUI.element("strong", "", `${showDay(piece.day)} ${timeWords(piece.start)} to ${timeWords(piece.end)}${part}`)),
            BudgetUI.noTranslate(BudgetUI.element("span", "", ` ${piece.shift.title}`)),
            BudgetUI.element("span", "calendarShiftKind", ` ${Math.round(piece.hours * 100) / 100} hours, ${kinds.join(" + ")}, at ${formatMoney(rate)} an hour${piece.rule ? ` (${piece.rule.contains})` : ""}${piece.shift.breakHours > 0 && piece.part === 1 ? `, less a ${Math.round(piece.shift.breakHours * 60)}-minute break` : ""}${piece.extraShift ? `, plus ${formatMoney(piece.extraShift)} for the shift` : ""}`)
          );
          list.append(item);
        }
        for (const bonus of detail.bonuses) {
          list.append(BudgetUI.noTranslate(BudgetUI.element("li", "", `${showDay(bonus.date)} ${bonus.title}: ${formatMoney(bonus.amount)} bonus`)));
        }
        shiftsBox.append(list);
      }
      form.append(shiftsBox, BudgetUI.buttonRow([{ label: "Close", onClick: () => panel.close() }]));
    }
  });
}

//#endregion
