// Service worker for the daily "🗓️ Check Budget" push notifications (turned on in Settings).
// It only shows the notifications the API sends; it doesn't cache or change any page loads.
// It lives at the site root so it covers every page.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let message = {};
  try {
    message = event.data ? event.data.json() : {};
  } catch (err) {
    message = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(self.registration.showNotification(message.title || "🗓️ Check Budget", {
    body: message.body || "",
    icon: "/Favicon/web-app-manifest-192x192.png",
    tag: message.tag || "prismal-reminder",
    data: { url: message.url || "/" }
  }));
});

// Tapping the notification brings up the budget: an open tab if there is one, otherwise a new one
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin);
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const open = windows.find(client => new URL(client.url).origin === target.origin && "focus" in client);
    if (open) return open.focus();
    return self.clients.openWindow(target.href);
  })());
});
