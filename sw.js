// ============================================================
// TITANWASH - Service Worker
// Cache-first per assets statici, network-first per API
// ============================================================

const CACHE_NAME = 'titanwash-v10';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/assets/Titan.png',
    '/assets/logo_ritagliato.png',
    '/css/variables.css',
    '/css/base.css',
    '/css/components.css',
    '/css/layout.css',
    '/css/modules.css',
    '/js/config.js',
    '/js/state.js',
    '/js/ui.js',
    '/js/api.js',
    '/js/auth.js',
    '/js/router.js',
    '/js/app.js',
    '/js/modules/dashboard.js',
    '/js/modules/clienti.js',
    '/js/modules/lavaggi.js',
    '/js/modules/crediti.js',
    '/js/modules/cassa.js',
    '/js/modules/magazzino.js',
    '/js/modules/personale.js',
    '/js/modules/manutenzioni.js',
    '/js/modules/log.js',
    '/manifest.json'
];

// Install: cache static assets
self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.open(CACHE_NAME).then(function(cache) {
            return cache.addAll(STATIC_ASSETS);
        })
    );
    self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', function(event) {
    event.waitUntil(
        caches.keys().then(function(cacheNames) {
            return Promise.all(
                cacheNames
                    .filter(function(name) { return name !== CACHE_NAME; })
                    .map(function(name) { return caches.delete(name); })
            );
        })
    );
    self.clients.claim();
});

// Fetch: cache-first for static, network-first for API
self.addEventListener('fetch', function(event) {
    var url = new URL(event.request.url);

    // Network-first for Supabase API calls
    if (url.hostname.includes('supabase')) {
        event.respondWith(
            fetch(event.request).catch(function() {
                return caches.match(event.request);
            })
        );
        return;
    }

    // Cache-first for static assets
    event.respondWith(
        caches.match(event.request).then(function(response) {
            return response || fetch(event.request).then(function(fetchResponse) {
                return caches.open(CACHE_NAME).then(function(cache) {
                    if (event.request.method === 'GET') {
                        cache.put(event.request, fetchResponse.clone());
                    }
                    return fetchResponse;
                });
            });
        })
    );
});
