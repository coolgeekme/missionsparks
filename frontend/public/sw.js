/* MissionSparks service worker — Iter 22
   Only responsibility: listen for `push` and render a native notification.
   We do NOT cache the app shell here yet — keep the SW light so hot-reload
   during development doesn't get in the way. */

self.addEventListener("install", () => {
    // Activate immediately on first install so pushes work right after subscribe.
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
    let payload = { title: "MissionSparks", body: "" };
    if (event.data) {
        try { payload = { ...payload, ...event.data.json() }; }
        catch { payload.body = event.data.text ? event.data.text() : ""; }
    }
    const options = {
        body: (payload.body || "").slice(0, 240),
        icon: "/icon-192.png",
        badge: "/notification-badge.png",
        tag: payload.tag || "missionsparks",
        renotify: true,
        requireInteraction: !!payload.requireInteraction,
        data: { url: payload.url || "/" },
    };
    event.waitUntil(self.registration.showNotification(payload.title, options));
});

self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    const targetUrl = (event.notification.data && event.notification.data.url) || "/";
    event.waitUntil((async () => {
        const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        // Prefer an already-open tab on our origin
        for (const client of allClients) {
            const url = new URL(client.url);
            if (url.origin === self.location.origin) {
                await client.focus();
                if ("navigate" in client) {
                    try { await client.navigate(targetUrl); } catch { /* fall through */ }
                }
                return;
            }
        }
        // No open tab — open a new window
        await self.clients.openWindow(targetUrl);
    })());
});

/* Optional: notificationclose telemetry could be added later. */
