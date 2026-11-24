const CACHE = "wired-pwa-v102";
const FILES = ["./", "./index.html", "./styles.css?v=chat-voice-1", "./app.js?v=chat-voice-1", "./manifest.webmanifest", "./wired-logo.png", "./assets/wired-wordmark.webp", "./assets/wired-icon-192.png", "./assets/wired-icon-512.png"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  // Never cache authenticated or cross-origin API responses. Old cached /pets
  // responses caused released yokai to reappear in the owner's collection.
  if (url.origin !== self.location.origin || url.pathname.startsWith("/functions/v1/")) return;
  const isAppAsset = /\/(?:index\.html|app\.js|styles\.css)$/.test(url.pathname);
  if (request.mode === "navigate" || isAppAsset) {
    event.respondWith(fetch(request).then(response => {
      if (response && response.ok) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE).then(cache => cache.put(request, copy)));
      }
      return response;
    }).catch(() => caches.match(request).then(cached => cached || caches.match("./index.html"))));
    return;
  }
  event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
    if (response && response.ok) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE).then(cache => cache.put(request, copy)));
    }
    return response;
  })));
});
