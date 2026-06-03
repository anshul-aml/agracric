const CACHE = "agracric-v2";
const ASSETS = ["./","./index.html","./app.js","./manifest.json"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS))); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k))))); self.clients.claim(); });
self.addEventListener("fetch", e => { const u=e.request.url; if(u.includes("firebaseio")||u.includes("firebasedatabase")||u.includes("gstatic")) return; e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request))); });
