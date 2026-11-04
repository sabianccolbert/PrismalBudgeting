// Notifications: push notifications on this device. Settings turns them on and off (Settings Page.js), and right after
// a sign-in, Home asks once whether to turn them on here (askAfterSignIn), since reminders for entries are on to start
// (see ENTRY REMINDERS in Process Budget.js). It asks only while push isn't on here, the browser can show them and hasn't
// been told to block them, the server has push set up, and they weren't turned off here on purpose (Settings' Turn
// Off). Not Now waits for the next sign-in. The browser's own question (allow notifications?) comes from a tap on Turn
// On, the way browsers want it.

window.PushNotifications = (() => {
  "use strict";

  const ASK_KEY = "prismal_ask_push"; // A sign-in just happened (Login.js sets it): ask on Home
  const OFF_KEY = "prismal_push_off"; // Turned off here on purpose: never ask

  const read = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
  const write = (key, value) => {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch {}
  };

  // Can this browser get push notifications at all?
  const supported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

  // iPhones and iPads only allow push notifications for sites added to the Home Screen
  function needsHomeScreen() {
    const appleMobile = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
    return appleMobile && !standalone;
  }

  // Bytes as base64url text (what push keys are written in), and back
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

  // Was this subscription made with the server's current key? (A browser that doesn't say is taken at its word)
  function usesKey(subscription, publicKey) {
    const key = subscription.options && subscription.options.applicationServerKey;
    return !key || bytesToBase64Url(new Uint8Array(key)) === publicKey;
  }

  // This device's subscription, when it has one made with the server's key (one made with another key can't be used,
  // so it goes), or null
  async function current(publicKey) {
    if (!supported()) return null;
    const registration = await navigator.serviceWorker.register("/sw.js");
    let subscription = await registration.pushManager.getSubscription();
    if (subscription && !usesKey(subscription, publicKey)) {
      await subscription.unsubscribe().catch(() => {});
      subscription = null;
    }
    return subscription;
  }

  // Turn push on here: allow notifications (the browser asks, so this runs from a tap), subscribe this device, and tell
  // the server. Resolves to { ok: true, settings (the server's reminder settings), subscription } or { ok: false,
  // blocked (notifications were refused), message }.
  async function turnOn(publicKey) {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      return { ok: false, blocked: permission === "denied", message: permission === "denied" ? BLOCKED_TEXT : "Notifications weren't allowed, so push is still off." };
    }
    const registration = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    let subscription = await current(publicKey);
    if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(publicKey) });
    const result = await budgetApi("/api/notify/push/subscribe", { subscription: subscription.toJSON(), timezone: currentTimeZone() });
    if (!result.ok || !result.data) return { ok: false, message: (result.data && result.data.error) || "Couldn't turn on push notifications. Please try again." };
    write(OFF_KEY, null);
    return { ok: true, settings: result.data, subscription };
  }

  const BLOCKED_TEXT = "Notifications are blocked for this site. Allow them in your browser's site settings, then turn them on in Settings.";

  // Settings' Turn Off (true) or Turn On (false): whether Home should never ask on this device
  function setOff(off) {
    write(OFF_KEY, off ? "1" : null);
  }

  // A sign-in happened (Login.js): Home asks the next time it opens
  function signedIn() {
    write(ASK_KEY, "1");
  }

  // Home, after a sign-in: the card asking to turn push on here, when it should (see the top of this file). place: where
  // the card goes (before it).
  async function askAfterSignIn(place) {
    if (read(ASK_KEY) !== "1") return;
    write(ASK_KEY, null); // (Once per sign-in, whatever happens)
    if (!place || read(OFF_KEY) === "1" || !supported() || needsHomeScreen() || Notification.permission === "denied") return;
    const settings = await budgetApi("/api/notify/settings");
    const push = settings.ok && settings.data && settings.data.push;
    if (!push || !push.available || !push.publicKey) return;
    let subscription = null;
    try { subscription = await current(push.publicKey); } catch {}
    if (subscription) return;
    showCard(place, push.publicKey, settings.data.kinds || []);
  }

  // The card: what reminders are for, with Turn On and Not Now
  function showCard(place, publicKey, kinds) {
    const card = document.createElement("section");
    card.className = "budgetCard pushAsk";
    card.setAttribute("aria-labelledby", "pushAskTitle");
    const title = document.createElement("h3");
    title.id = "pushAskTitle";
    title.textContent = "🔔 Reminders On This Device?";
    const text = document.createElement("p");
    text.className = "panelText";
    text.textContent = kinds.includes("entries")
      ? "Turn on notifications to get your reminders here: for an entry you set one on (Remind me, in its options), a notification comes that many days before it, at your reminder time. Settings has which reminders you get."
      : "Turn on notifications to get your reminders here, at your reminder time. Settings has which reminders you get.";
    const buttons = document.createElement("div");
    buttons.className = "panelButtons";
    const on = document.createElement("button");
    on.type = "button";
    on.className = "budgetButton primary";
    on.textContent = "Turn On";
    const later = document.createElement("button");
    later.type = "button";
    later.className = "budgetButton";
    later.textContent = "Not Now";
    buttons.append(on, later);
    card.append(title, text, buttons);
    place.before(card);
    later.addEventListener("click", () => card.remove());
    on.addEventListener("click", async () => {
      on.disabled = true;
      later.disabled = true;
      let result;
      try {
        result = await turnOn(publicKey);
      } catch (error) {
        console.error("Couldn't turn on push notifications:", error);
        result = { ok: false, message: "Couldn't turn on push notifications. Please try again in Settings." };
      }
      if (result.ok) queueReminderPlanSync(true); // (The server has this budget's reminder days)
      if (typeof BudgetUI !== "undefined") BudgetUI.showToast(result.ok ? "Push notifications are on for this device." : result.message, !result.ok);
      if (result.ok || result.blocked) card.remove();
      else {
        on.disabled = false;
        later.disabled = false;
      }
    });
  }

  return { BLOCKED_TEXT, supported, needsHomeScreen, current, turnOn, setOff, signedIn, askAfterSignIn };
})();
