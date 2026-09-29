/* Bump this whenever a cached file changes, or phones keep the old copy. */
const CACHE_NAME = 'aps-v15';
const APP_FILES = [
    './',
    './index.html',
    './styles.css',
    '../shared-trade-layout.css',
    './config.js',
    './app.js',
    './manifest.json',
    './APSlogo.png',
    /*
       The shared cloud config, two levels up - the app root.

       These MUST be listed or the app breaks offline: index.html
       loads them before config.js, and on a phone with no signal
       an uncached script is simply missing - the cloud constants
       never get set and sync fails with no obvious cause.

       The path is relative to THIS folder (the service worker's
       own scope), not to index.html. Both files sit at the app
       root, which is two levels up from here: '../../'.
    */
    '../../supabase-config.js',
    '../../aga-cloud.js'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(APP_FILES))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(cacheNames => {
                return Promise.all(
                    cacheNames
                        .filter(cacheName => cacheName !== CACHE_NAME)
                        .map(cacheName => caches.delete(cacheName))
                );
            })
            .then(() => self.clients.claim())
    );
});

/*
   STALE-WHILE-REVALIDATE
   This used to be cache-first, which meant a phone that had already loaded
   the app kept running old JavaScript no matter how often the cache name was
   bumped - the new copy only arrived on a later visit, and edits could appear
   to have no effect at all.

   Now the cached file is served immediately, so the app still opens instantly
   and works offline, but a fresh copy is fetched in the background and stored
   for the NEXT load. A code change therefore reaches every device by the
   second open instead of never.
*/
self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') {
        return;
    }

    /* Only same-origin app files are cached; leave CDN requests alone. */
    const url = new URL(event.request.url);
    if (url.origin !== self.location.origin) {
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then(cachedResponse => {
                const networkUpdate = fetch(event.request)
                    .then(networkResponse => {
                        if (
                            networkResponse &&
                            networkResponse.status === 200 &&
                            networkResponse.type !== 'opaque'
                        ) {
                            return caches.open(CACHE_NAME)
                                .then(cache => {
                                    cache.put(event.request, networkResponse.clone());
                                    return networkResponse;
                                });
                        }

                        return networkResponse;
                    })
                    .catch(() => {
                        /* Offline: fall back to whatever we already have. */
                        return cachedResponse || caches.match('./index.html');
                    });

                /* Serve the cache straight away when we have it. */
                return cachedResponse || networkUpdate;
            })
    );
});