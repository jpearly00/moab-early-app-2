// service-worker.js — Moab Early App
// Strategy:
//   - HTML / manifest: NETWORK-FIRST (always try fresh, fall back to cache)
//     so app updates ship to users on next launch instead of being cached
//     forever. Solves "I pushed a new version but my phone shows the old."
//   - Static assets (xlsx, CDN libs): cache-first (rarely change, fast)
// Bump CACHE_VERSION on every meaningful change to force a clean install.

const CACHE_VERSION = "v" + Date.now();
const CACHE = "moab-early-app-" + CACHE_VERSION;

const PRECACHE = [
  "./",
  "./index.html",
  "./MoabEarlyApp_v1.html",
  "./MoabEarlyApp_v1_TruthSource.xlsx",
  "./manifest.json",
  "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js",
  "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.all(
        PRECACHE.map((url) =>
          cache.add(new Request(url, { cache: "reload" })).catch((err) => {
            console.warn("SW precache miss:", url, err);
          })
        )
      )
    ).then(() => self.skipWaiting())  // activate immediately, don't wait for old SW
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  const isHtml = req.destination === "document" ||
                 req.headers.get("accept")?.includes("text/html") ||
                 url.pathname.endsWith(".html") ||
                 url.pathname.endsWith("/");
  const isManifest = url.pathname.endsWith("manifest.json");

  if (isHtml || isManifest) {
    // Network-first: always try the network, fall back to cache only when offline.
    event.respondWith(
      fetch(req).then((resp) => {
        if (resp && resp.status === 200) {
          const clone = resp.clone();
          caches.open(CACHE).then((cache) => cache.put(req, clone));
        }
        return resp;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // Cache-first for everything else (CDN libs, xlsx).
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((resp) => {
        if (resp && resp.status === 200 && (resp.type === "basic" || resp.type === "cors")) {
          const clone = resp.clone();
          caches.open(CACHE).then((cache) => cache.put(req, clone));
        }
        return resp;
      }).catch(() => cached);
    })
  );
});

// Force-update message channel: client can postMessage({type:'SKIP_WAITING'}) to ask
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});
