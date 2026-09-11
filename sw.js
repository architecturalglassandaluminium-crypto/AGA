/* =========================================================
   AGA ARCHITECTURAL GLASS & ALUMINIUM
   PWA Service Worker
   ---------------------------------------------------------
   Registered from app.js as "./sw.js" with scope "./".
   Caches the app shell so the workshop app keeps working
   offline on site, where signal is often poor.
   ========================================================= */

const CACHE_NAME = "aga-shell-v1";

/* The app shell: everything needed to boot the UI offline. */
const APP_SHELL = [
    "./",
    "./index.html",
    "./styles.css",
    "./email.js",
    "./app.js"
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

/* Fetch: serve the app shell from cache, falling back to the
   network for anything not cached. Only same-origin GETs are
   handled; third-party CDN requests go straight to network. */
self.addEventListener("fetch", (event) => {
    const request = event.request;

    if (request.method !== "GET") return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    event.respondWith(
        caches.match(request).then((cached) => {
            if (cached) return cached;

            return fetch(request)
                .then((response) => {
                    /* Cache successful same-origin responses so the
                       shell stays fresh without a version bump. */
                    if (response && response.status === 200) {
                        const copy = response.clone();
                        caches
                            .open(CACHE_NAME)
                            .then((cache) => cache.put(request, copy));
                    }
                    return response;
                })
                .catch(() => {
                    /* Offline and not cached: fall back to the
                       shell for navigations so the UI still boots. */
                    if (request.mode === "navigate") {
                        return caches.match("./index.html");
                    }
                    return undefined;
                });
        })
    );
});
