// Settings Page: the daily "🗓️ Check Budget" reminder (the spreadsheet's Google Calendar
// notification). Pick the reminder time, then turn on push notifications (per device) and/or a
// calendar link for Google or Apple Calendar. Both are optional. Which days get a reminder comes
// from the budget (buildReminderPlan in Process Budget.js); the API sends and serves them.
// Then the account: change the email (needs the password), email a password reset link, or
// delete the account (needs the password).

// =====================================================================
// #region SETUP
// =====================================================================

let reminderSettings = null; // From the API: { time, timezone, calendarUrl, push: { available, publicKey, devices } }
let pushSubscription = null; // This device's push subscription, while push is on here
let timeSaveTimer = null;
let account = null;          // From the API: { username, email, canEmail (reset emails are set up) }

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const PUSH_BLOCKED_TEXT = "Notifications are blocked for this site. Allow them in your browser's site settings, then come back here to turn them on.";

window.workspaceReady.then(async (loaded) => {
  // Account settings don't need the budget, so they show even when it didn't load
  const [reminders, accountResult] = await Promise.all([
    loaded ? budgetApi("/api/notify/settings") : null,
    budgetApi("/api/account")
  ]);
  const accountLoaded = accountResult.ok && !!accountResult.data;
  if (accountLoaded) {
    account = accountResult.data;
    wireAccount();
    renderAccount();
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

function renderPush() {
  const status = document.getElementById("pushStatus");
  const buttons = document.getElementById("pushButtons");
  buttons.replaceChildren();

  if (!reminderSettings.push.available) {
    status.textContent = "Push notifications aren't set up on the server yet.";
    return;
  }
  if (!pushSupported()) {
    status.textContent = needsHomeScreen()
      ? "On iPhone and iPad, add Prismal Budget to your Home Screen first (tap Share, then Add to Home Screen), then open it from there to turn these on."
      : "This browser doesn't support push notifications.";
    return;
  }

  const otherDevices = reminderSettings.push.devices - (pushSubscription ? 1 : 0);
  const others = otherDevices > 0 ? ` They're also on for ${otherDevices} other device${otherDevices > 1 ? "s" : ""}.` : "";
  if (pushSubscription) {
    status.textContent = "On for this device. You'll get a notification at your reminder time on days that need one." + others;
    buttons.append(settingsButton("Send Test", "", sendTestPush), settingsButton("Turn Off", "danger", turnOffPush));
    return;
  }
  if (Notification.permission === "denied") {
    status.textContent = PUSH_BLOCKED_TEXT + others;
    return;
  }
  status.textContent = "Off for this device." + others;
  buttons.append(settingsButton("Turn On", "primary", turnOnPush));
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
// #region ACCOUNT (email, password reset link, delete account)
// =====================================================================

function wireAccount() {
  document.getElementById("emailForm").addEventListener("submit", changeEmail);
  document.getElementById("deleteForm").addEventListener("submit", deleteAccount);
}

function renderAccount() {
  document.getElementById("emailStatus").textContent = account.email
    ? `Signed in as ${account.username}, with the email ${account.email}. Password reset links go there.`
    : `Signed in as ${account.username}. Your account doesn't have an email yet. Add one so you can reset your password if you forget it.`;
  document.getElementById("emailButton").textContent = account.email ? "Change Email" : "Add Email";

  const status = document.getElementById("passwordStatus");
  const buttons = document.getElementById("passwordButtons");
  buttons.replaceChildren();
  if (!account.canEmail) {
    status.textContent = "Password reset emails aren't set up on the server yet.";
  } else if (!account.email) {
    status.textContent = "Add an email above first. That's where the reset link goes.";
  } else {
    status.textContent = `Get a link at ${account.email} to choose a new password. It works once, for an hour. Changing your password signs you out on every device.`;
    buttons.append(settingsButton("Email Me A Reset Link", "primary", sendResetLink));
  }
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
  account = result.data;
  form.reset();
  renderAccount();
  BudgetUI.showToast(added ? `Email added: ${account.email}` : `Email changed to ${account.email}.`);
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
  // The account is gone: this device stops its push notifications and forgets the session
  if (pushSubscription) await pushSubscription.unsubscribe().catch(() => {});
  localStorage.clear();
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
