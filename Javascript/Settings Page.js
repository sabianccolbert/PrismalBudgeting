// Settings Page: the daily "🗓️ Check Budget" reminder (the spreadsheet's Google Calendar
// notification). Pick the reminder time, then turn on push notifications (per device) and/or a
// calendar link for Google or Apple Calendar. Both are optional. Which days get a reminder comes
// from the budget (buildReminderPlan in Process Budget.js); the API sends and serves them.
// Then the account: change the email or the password (each needs the password), or email a password
// reset link; passkeys (Face ID, Touch ID, Windows Hello: add or remove them, and turn passkey sign-in
// on or off; see Passkeys.js); signed-in devices (turn off Quick Entry icons, Sign Out Everywhere);
// your data and privacy (Download My Data, analytics on or off for this device); and deleting the
// account (needs the password). Emails go out through Resend (see account.js in the API).

// =====================================================================
// #region SETUP
// =====================================================================

let reminderSettings = null; // From the API: { time, timezone, calendarUrl, push: { available, publicKey, devices } }
let pushSubscription = null; // This device's push subscription, while push is on here
let timeSaveTimer = null;
let account = null;          // From the API: { username, email, canEmail (reset emails are set up), quickIcons }
let passkeyInfo = null;      // From the API: { on, userHandle, passkeys: [{ id, name, site, synced, createdAt, lastUsedAt }] }
let passkeyLoadStatus = 0;   // The list's HTTP status, when it didn't load (404: the API doesn't have passkeys yet)
let passkeyAdd = null;       // { options, at }: a password-checked challenge, kept so trying again starts right away

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const PUSH_BLOCKED_TEXT = "Notifications are blocked for this site. Allow them in your browser's site settings, then come back here to turn them on.";

wireDateFormat(); // This device's choice, so it works before (and without) the server

window.workspaceReady.then(async (loaded) => {
  // Account settings don't need the budget, so they show even when it didn't load
  const [reminders, accountResult, passkeyResult] = await Promise.all([
    loaded ? budgetApi("/api/notify/settings") : null,
    budgetApi("/api/account"),
    budgetApi("/api/passkey/list")
  ]);
  const accountLoaded = accountResult.ok && !!accountResult.data;
  if (accountLoaded) {
    account = accountResult.data;
    if (passkeyResult.ok && passkeyResult.data) passkeyInfo = passkeyResult.data;
    else passkeyLoadStatus = passkeyResult.status;
    wireAccount();
    renderAccount();
    renderPasskeys();
    document.getElementById("accountView").hidden = false;
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

  wireReminderTime();
  renderReminderTime();
  renderCalendarLink();
  renderPush();
  await refreshPushState();
});

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

function renderReminderTime() {
  document.getElementById("reminderTime").value = reminderSettings.time;
  const zone = (reminderSettings.timezone || currentTimeZone()).replace(/_/g, " ");
  document.getElementById("timeZoneNote").textContent = `Time zone: ${zone}. Reminders go out within 5 minutes of this time.`;
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
// decides how dates show and how typed ones are read (see "Dates people see and type" in Process Budget.js).

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
    renderDateFormatNote();
    BudgetUI.showToast(`Dates show like ${showDate(new Date(2026, 9, 5))} now.`);
  });
}

function renderDateFormatNote() {
  document.getElementById("dateFormatNote").textContent =
    `October 5, 2026 shows as ${showDate(new Date(2026, 9, 5))}, and dates you type are read the same way (${DATE_FORMATS.ymd.pattern} always works too).`;
}

//#endregion

// =====================================================================
// #region PUSH NOTIFICATIONS (this device)
// =====================================================================

const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

// iPhones and iPads only allow push notifications for sites added to the Home Screen
function needsHomeScreen() {
  const appleMobile = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  return appleMobile && !standalone;
}

// Check whether this device already has push on, and make sure the server knows about it
async function refreshPushState() {
  pushSubscription = null;
  if (pushSupported() && reminderSettings.push.available) {
    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      let subscription = await registration.pushManager.getSubscription();
      // The server's keys changed (push setup ran again), so this subscription can't be used
      if (subscription && !usesServerKey(subscription)) {
        await subscription.unsubscribe().catch(() => {});
        subscription = null;
      }
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
  if (!pushSupported()) {
    return needsHomeScreen()
      ? "On iPhone and iPad, add Prismal Budget to your Home Screen first (tap Share, then Add to Home Screen), then open it from there to turn these on."
      : "This browser doesn't support push notifications.";
  }
  return Notification.permission === "denied" ? PUSH_BLOCKED_TEXT : "";
}

async function turnOnPush(event) {
  event.currentTarget.disabled = true;
  try {
    // Ask first, while the tap still counts (browsers only show the prompt right after a tap)
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      BudgetUI.showToast(permission === "denied" ? PUSH_BLOCKED_TEXT : "Notifications weren't allowed, so push is still off.", true);
      return;
    }
    const registration = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (subscription && !usesServerKey(subscription)) {
      await subscription.unsubscribe();
      subscription = null;
    }
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToBytes(reminderSettings.push.publicKey)
      });
    }
    const result = await budgetApi("/api/notify/push/subscribe", { subscription: subscription.toJSON(), timezone: currentTimeZone() });
    if (!result.ok || !result.data) throw new Error((result.data && result.data.error) || `Server responded with status: ${result.status}`);
    reminderSettings = result.data;
    pushSubscription = subscription;
    queueReminderPlanSync(true); // Make sure the server has the latest reminder days
    BudgetUI.showToast("Push notifications are on for this device.");
  } catch (err) {
    console.error("Couldn't turn on push notifications:", err);
    BudgetUI.showToast("Couldn't turn on push notifications. Please try again.", true);
  } finally {
    renderPush();
  }
}

async function turnOffPush(event) {
  event.currentTarget.disabled = true;
  const subscription = pushSubscription;
  const result = await budgetApi("/api/notify/push/unsubscribe", { endpoint: subscription.endpoint });
  if (result.ok && result.data) reminderSettings = result.data;
  // Even if the server missed this, an unsubscribed device is removed the next time a push bounces
  await subscription.unsubscribe().catch(() => {});
  pushSubscription = null;
  BudgetUI.showToast("Push notifications are off for this device.");
  renderPush();
}

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

// Was this subscription made with the server's current key?
function usesServerKey(subscription) {
  const key = subscription.options && subscription.options.applicationServerKey;
  if (!key) return true; // The browser doesn't say, so keep it
  return bytesToBase64Url(new Uint8Array(key)) === reminderSettings.push.publicKey;
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
  const url = reminderSettings.calendarUrl;
  input.hidden = !url;

  if (!url) {
    input.value = "";
    status.textContent = "Off. Turn it on for a private link to add to Google Calendar, Apple Calendar, or most calendar apps. Each reminder shows up as a 30-minute \"Check Budget\" event with an alert.";
    buttons.append(settingsButton("Turn On", "primary", () => setCalendarLink("on")));
    return;
  }

  input.value = url;
  status.textContent = "On. Add this link to your calendar app, and keep it private. In Google Calendar you can also paste it under Other calendars, From URL. Google only checks it every several hours, so changes can take a while to show up there.";
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
  document.getElementById("passwordForm").addEventListener("submit", changePassword);
  document.getElementById("passkeyForm").addEventListener("submit", addPasskey);
  document.getElementById("signOutEverywhereButton").addEventListener("click", signOutEverywhere);
  document.getElementById("downloadDataButton").addEventListener("click", downloadMyData);
  document.getElementById("deleteForm").addEventListener("submit", deleteAccount);
}

function renderAccount() {
  document.getElementById("emailStatus").textContent = account.email
    ? `Signed in as ${account.username}, with the email ${account.email}. Password reset links go there.`
    : `Signed in as ${account.username}. Your account doesn't have an email yet. Add one so you can reset your password if you forget it.`;
  document.getElementById("emailButton").textContent = account.email ? "Change Email" : "Add Email";
  document.getElementById("passwordFormUsername").value = account.username;

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
  renderQuickIcons();
  renderAnalytics();
}

// A new password: the other devices are signed out and Quick Entry icons stop; this one gets a new session
async function changePassword(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const newPassword = document.getElementById("newPassword").value;
  // The API's rule (passwords.js): 8 to 256 characters, any at all, an emoji counting as one
  const length = [...newPassword.normalize("NFKC")].length;
  if (length < 8 || length > 256) {
    BudgetUI.showToast(length < 8 ? "Your new password must be at least 8 characters." : "Your new password can be at most 256 characters.", true);
    return;
  }
  if (newPassword !== document.getElementById("newPasswordAgain").value) {
    BudgetUI.showToast("The two new passwords don't match.", true);
    return;
  }
  setFormBusy(form, true);
  const result = await budgetApi("/api/account/password", { password: document.getElementById("currentPassword").value, newPassword });
  setFormBusy(form, false);
  if (!result.ok || !result.data || !result.data.token) {
    BudgetUI.showToast(accountError(result, "Couldn't change your password. Please try again."), true);
    return;
  }
  localStorage.setItem("prismal_jwt", result.data.token);
  localStorage.setItem("prismal_last_activity", Date.now().toString());
  const hadIcons = account.quickIcons > 0;
  account.quickIcons = 0;
  form.reset();
  renderAccount();
  const noted = account.email && account.canEmail ? " We emailed you a note about it." : "";
  BudgetUI.showToast(`Password changed. Your other devices were signed out${hadIcons ? ", and your Quick Entry icons were turned off" : ""}.${noted}`);
}

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
  const before = account.email;
  account = result.data;
  form.reset();
  renderAccount();
  // The API emails the new address (and the old one, when there was one) to say it changed
  const noted = account.canEmail && account.email !== before;
  BudgetUI.showToast(added
    ? `Email added: ${account.email}.${noted ? " We sent it a note, so you can check that it works." : ""}`
    : `Email changed to ${account.email}.${noted ? " We sent a note to it and to your old email." : ""}`);
}

async function sendResetLink(event) {
  const button = event.currentTarget;
  button.disabled = true;
  const result = await budgetApi("/api/account/password-reset", {});
  button.disabled = false;
  if (result.ok) {
    BudgetUI.showToast(`Reset link sent to ${account.email}. It works for 1 hour.`);
  } else {
    BudgetUI.showToast(accountError(result, "Couldn't send the reset link. Please try again."), true);
  }
}

async function deleteAccount(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!window.confirm("Delete your account and everything in your budget? This can't be undone.")) return;
  setFormBusy(form, true);
  const result = await budgetApi("/api/account/delete", { password: document.getElementById("deletePassword").value });
  if (!result.ok) {
    setFormBusy(form, false);
    BudgetUI.showToast(accountError(result, "Couldn't delete the account. Please try again."), true);
    return;
  }
  // The account is gone: this device stops its push notifications, stops offering the account's
  // passkeys (where the browser supports it), and forgets the session (keeping its own choices, like
  // analytics off)
  if (pushSubscription) await pushSubscription.unsubscribe().catch(() => {});
  if (passkeyInfo) Passkeys.syncList(passkeyInfo.userHandle, []);
  clearSignedInData();
  window.location.replace("/login.html?deleted=1");
}

// The API's message, or a fallback (401: signed out, like after a password reset on another device)
function accountError(result, fallback) {
  if (result.status === 401) return "You've been signed out. Please log in again.";
  if (result.status === 0) return "Couldn't reach the server. Please try again.";
  return (result.data && result.data.error) || fallback;
}

function setFormBusy(form, busy) {
  form.querySelectorAll("input, button").forEach(control => { control.disabled = busy; });
}

//#endregion

// =====================================================================
// #region SIGNED-IN DEVICES (Quick Entry icons, Sign Out Everywhere)
// =====================================================================

function renderQuickIcons() {
  const status = document.getElementById("quickIconStatus");
  const buttons = document.getElementById("quickIconButtons");
  buttons.replaceChildren();
  const count = account.quickIcons || 0;
  if (count === 0) {
    status.textContent = "Quick Entry icons: none right now. The Quick Entry button on Home makes one for a phone's home screen.";
    return;
  }
  status.textContent = `Quick Entry icons: ${count} on home screens. Each one can add entries without signing in, see your Other Accounts' balances (for its account picker), and keep your prisms, but nothing else.`;
  buttons.append(settingsButton(count === 1 ? "Turn Off The Icon" : "Turn Off Icons", "danger", turnOffQuickIcons));
}

async function turnOffQuickIcons(event) {
  const count = account.quickIcons;
  if (!window.confirm(`Turn off ${count === 1 ? "your Quick Entry icon" : `all ${count} of your Quick Entry icons`}? ${count === 1 ? "It stops" : "They stop"} working right away (entries already made with ${count === 1 ? "it" : "them"} still get added). You can make a new one on Home.`)) return;
  event.currentTarget.disabled = true;
  const result = await budgetApi("/api/quick/off", {});
  if (result.ok && result.data) {
    account.quickIcons = 0;
    BudgetUI.showToast(count === 1 ? "Your Quick Entry icon is off." : "Your Quick Entry icons are off.");
  } else {
    BudgetUI.showToast(accountError(result, "Couldn't turn off the icons. Please try again."), true);
  }
  renderQuickIcons();
}

// Every device and browser (this one too) is signed out, and Quick Entry icons stop
async function signOutEverywhere(event) {
  if (!window.confirm("Sign out every device and browser, this one too? Your Quick Entry icons will stop working, and you'll sign in again here.")) return;
  const button = event.currentTarget;
  button.disabled = true;
  const result = await budgetApi("/api/account/sign-out-everywhere", {});
  if (!result.ok) {
    button.disabled = false;
    BudgetUI.showToast(accountError(result, "Couldn't sign out everywhere. Please try again."), true);
    return;
  }
  clearSignedInData();
  try { sessionStorage.setItem("prismal_signed_out", "everywhere"); } catch (e) {} // The login page says so
  window.location.replace("/login.html");
}

//#endregion

// =====================================================================
// #region YOUR DATA AND PRIVACY (Download My Data, analytics on this device)
// =====================================================================

// Everything stored for the account, saved as a JSON file
async function downloadMyData(event) {
  const button = event.currentTarget;
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
    status.textContent = "On. Google Analytics counts page visits, which helps improve Prismal Budget. It never sees your budget, and links' private codes are left out. You can turn it off for this device.";
    buttons.append(settingsButton("Turn Off", "danger", () => setAnalytics(false)));
  }
}

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
  hint.textContent = count === 0
    ? "Turning it on makes a passkey for this device: enter your password, then confirm with your face, fingerprint, or PIN when your device asks."
    : "Add a passkey for another device or password manager: enter your password, then confirm with your face, fingerprint, or PIN when your device asks.";
  document.getElementById("passkeyAddButton").textContent = count === 0 ? "Turn On" : "Add Passkey";
  const nameInput = document.getElementById("passkeyName");
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
  if (!passkeyAdd || Date.now() - passkeyAdd.at >= Passkeys.FRESH_MS) {
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
  try {
    credential = await navigator.credentials.create({ publicKey: Passkeys.addRequest(passkeyAdd.options) });
  } catch (error) {
    if (error.name === "InvalidStateError") passkeyAdd = null;
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
  passkeyInfo = result.data;
  form.reset();
  renderPasskeys();
  // The API emails the account a note whenever a passkey is added
  const noted = account.email && account.canEmail ? " We emailed you a note about it." : "";
  BudgetUI.showToast(`Passkey added: ${passkeyInfo.added}. Passkey sign-in is on.${noted}`);
}

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

async function removePasskey(passkey) {
  if (!window.confirm(`Remove the passkey "${passkey.name}"? It won't be able to sign in anymore. To clear it off the device too, delete it in that device's passwords (or passkeys) settings.`)) return;
  document.querySelectorAll("#passkeyList button").forEach(button => { button.disabled = true; });
  const result = await budgetApi("/api/passkey/remove", { id: passkey.id });
  if (result.ok && result.data) {
    passkeyInfo = result.data;
    Passkeys.syncList(passkeyInfo.userHandle, passkeyInfo.passkeys); // Browsers that support it stop offering it
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

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(text) {
  const base64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

//#endregion
