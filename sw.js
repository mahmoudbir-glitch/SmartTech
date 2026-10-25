/*
 * SmartTech — service worker.
 * ===========================
 * Deliberately small. Prices and stock change from the admin panel and must
 * never be served stale, so no page and no /api response is ever cached:
 *   - navigations go to the network; if the phone is offline the visitor gets
 *     /offline.html instead of the browser's dinosaur;
 *   - fonts, icons and product photos are content-addressed and immutable, so
 *     they are kept after first use and make repeat visits cheap on a slow link.
 * Bump VERSION to drop every cache.
 */
const VERSION = "v1";
const STATIC = "smarttech-static-" + VERSION;
const OFFLINE = "/offline.html";
const KEEP = /^\/assets\/(fonts|icons|products|brands)\//;

self.addEventListener("install", event => {
  event.waitUntil(caches.open(STATIC).then(cache => cache.addAll([OFFLINE, "/assets/icons/icon-192.png"])));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith("smarttech-") && k !== STATIC).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/admin")) return;

  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE)));
    return;
  }

  if (KEEP.test(url.pathname)) {
    event.respondWith(
      caches.open(STATIC).then(cache =>
        cache.match(req).then(hit => hit || fetch(req).then(res => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        }))
      )
    );
  }
});
