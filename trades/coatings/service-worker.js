/* Bump this whenever a cached file changes, or phones keep the old copy. */
const CACHE_NAME = 'apc-v16';
const APP_FILES = [
    './',
    './index.html',
    './styles.css',
    './config.js',
    './app.js',
    './manifest.json',
    './APClogo.jpg',
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

self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') {
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then(cachedResponse => {
                if (cachedResponse) {
                    return cachedResponse;
                }

                return fetch(event.request)
                    .then(networkResponse => {
                        if (
                            !networkResponse ||
                            networkResponse.status !== 200 ||
                            networkResponse.type === 'opaque'
                        ) {
                            return networkResponse;
                        }

                        return caches.open(CACHE_NAME)
                            .then(cache => {
                                cache.put(
                                    event.request,
                                    networkResponse.clone()
                                );

                                return networkResponse;
                            });
                    })
                    .catch(() => {
                        return caches.match('./index.html');
                    });
            })
    );
});