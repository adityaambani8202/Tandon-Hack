const CACHE = "rr-v2";
const ASSETS = ["/", "/style.css", "/app.js", "/manifest.json"];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  // API calls: network-first
  if (e.request.url.includes("/api/")) {
    e.respondWith(
      fetch(e.request).catch(() => new Response(JSON.stringify({ error: "Offline" }), { headers: { "Content-Type": "application/json" } }))
    );
    return;
  }
  // Static assets: cache-first
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).then(res => {
      if (res.ok) {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return res;
    }))
  );
});

// Handle notification action buttons (Taken / Skip)
self.addEventListener("notificationclick", e => {
  const { action, notification } = e;
  notification.close();
  if (action === "taken" || action === "skipped") {
    e.waitUntil(
      clients.matchAll({ type: "window", includeUncontrolled: true }).then(cls => {
        const c = cls.find(c => c.focused) || cls[0];
        if (c) {
          c.postMessage({ type: "logDose", key: notification.data?.key, status: action });
          c.focus();
        } else {
          clients.openWindow("/?notif=" + action + "&key=" + encodeURIComponent(notification.data?.key || ""));
        }
      })
    );
  } else {
    // Default tap: open app
    e.waitUntil(clients.matchAll({ type: "window" }).then(cls => {
      if (cls[0]) { cls[0].focus(); } else { clients.openWindow("/"); }
    }));
  }
});
