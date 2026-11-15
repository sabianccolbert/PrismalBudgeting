// Service worker for the push notifications (turned on in Settings): the daily "🗓️ Check Budget", Quick Budget's, and
// calendar entries' alerts. It only shows the notifications the API sends; it doesn't cache or change any page loads.
// It lives at the site root so it covers every page.
//
// An alarm (a calendar entry's alert with its Alarm switch on: the API sends alarm: true) stays on the screen until it's
// dismissed, vibrates where the device allows, and any Prismal page that's open rings until it's stopped (Layout.js
// listens for "prismal-alarm", and Sounds.js rings). A website can't pick a phone's notification sound or wake it any other
// way, so a locked phone gives its usual one.

const ALARM_VIBRATION = [600, 250, 600, 250, 600, 250, 1200];

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// Every open page of this site
const openPages = () => self.clients.matchAll({ type: "window", includeUncontrolled: true });

self.addEventListener("push", (event) => {
  let message = {};
  try {
    message = event.data ? event.data.json() : {};
  } catch (err) {
    message = { body: event.data ? event.data.text() : "" };
  }
  const alarm = message.alarm === true;
  const tag = message.tag || "prismal-reminder";
  event.waitUntil((async () => {
    await self.registration.showNotification(message.title || "🗓️ Check Budget", {
      body: message.body || "",
      icon: "/Favicon/web-app-manifest-192x192.png",
      tag,
      data: { url: message.url || "/", alarm },
      ...(alarm ? { requireInteraction: true, renotify: true, vibrate: ALARM_VIBRATION, silent: false } : {})
    });
    if (alarm) {
      for (const page of await openPages()) page.postMessage({ type: "prismal-alarm", title: message.title || "", body: message.body || "", tag });
    }
  })());
});

// An alarm's notification dismissed (or tapped): the open pages stop ringing
async function stopAlarm(notification) {
  if (!notification.data || !notification.data.alarm) return;
  for (const page of await openPages()) page.postMessage({ type: "prismal-alarm-stop", tag: notification.tag });
}
self.addEventListener("notificationclose", (event) => event.waitUntil(stopAlarm(event.notification)));

// Tapping the notification brings up the budget: an open tab if there is one, otherwise a new one. Only
// pages on this site: a notification can't send anyone somewhere else.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  let target = new URL("/", self.location.origin);
  try {
    const asked = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin);
    if (asked.origin === self.location.origin) target = asked;
  } catch (err) {}
  event.waitUntil((async () => {
    await stopAlarm(event.notification);
    const windows = await openPages();
    const open = windows.find(client => new URL(client.url).origin === target.origin && "focus" in client);
    if (open) return open.focus();
    return self.clients.openWindow(target.href);
  })());
});
