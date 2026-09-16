/* =========================================================
   AGA ARCHITECTURAL GLASS & ALUMINIUM
   PWA Service Worker
   ---------------------------------------------------------
   Registered from app.js as "./sw.js" with scope "./".
   Caches the app shell so the workshop app keeps working
   offline on site, where signal is often poor.
   ========================================================= */

/*
   Bump this whenever the app shell changes. It is the signal to
   every installed browser that its cached copy is obsolete.
*/
const CACHE_NAME = "aga-shell-v21";

/* The app shell: everything needed to boot the UI offline. */
const APP_SHELL = [
    "./",
    "./index.html",
    "./styles.css",
    "./supabase-config.js",
    "./email.js",
    "./sync.js",
    "./signin.js",
    "./app.js",
    "./catalogue.js",
    "./quotes.js",
    "./export.js",
    "./favicon.png",
    /* Letterhead art, so a worksheet can still be printed offline. */
    "./logo.png",
    "./FullLetterHead.png"
];

/* Install: pre-cache the app shell. */
self.addEventListener("install", (event) => {
    event.waitUntil(
        caches
            .open(CACHE_NAME)
            .then((cache) => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

/* Activate: drop caches from older versions. */
self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) =>
                Promise.all(
                    keys
                        .filter((key) => key !== CACHE_NAME)
                        .map((key) => caches.delete(key))
                )
            )
            .then(() => self.clients.claim())
    );
});

/*
   Fetch strategy: NETWORK-FIRST, cache as a fallback.

   This used to be cache-first, which meant an installed browser
   kept serving the first version of app.js it ever downloaded -
   new features never appeared until the cache was manually
   cleared. Network-first means a deploy is picked up on the next
   load, while the cache still covers the offline case on site.
*/
self.addEventListener("fetch", (event) => {
    const request = event.request;

    if (request.method !== "GET") return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    event.respondWith(
        fetch(request)
            .then((response) => {
                /* Keep a copy of every good same-origin response so
                   the shell is available when offline. */
                if (response && response.status === 200) {
                    const copy = response.clone();
                    caches
                        .open(CACHE_NAME)
                        .then((cache) => cache.put(request, copy))
                        .catch(() => { });
                }
                return response;
            })
            .catch(() => {
                /* Offline: fall back to the cached copy, and for a
                   navigation fall back to the cached shell. */
                return caches.match(request).then((cached) => {
                    if (cached) return cached;

                    if (request.mode === "navigate") {
                        return caches.match("./index.html");
                    }

                    return undefined;
                });
            })
    );
});
