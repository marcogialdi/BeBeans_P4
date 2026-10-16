// Service worker: mette in cache SOLO la struttura dell'app (HTML, CSS, JS, icone).
// I dati del veicolo e le chiamate a Supabase non vengono mai salvati in cache.

const VERSION = "v1.0.2";
const SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./config.js",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  // Solo GET della stessa origine; tutto il resto (Supabase, mappe, CDN) va in rete senza cache.
  if (req.method !== "GET" || url.origin !== self.location.origin) return;

  // Rete prima, cache come ripiego: così gli aggiornamenti del sito arrivano subito.
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && SHELL.some((p) => url.pathname.endsWith(p.replace("./", "/")))) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit ?? caches.match("./index.html"))),
  );
});
