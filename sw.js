// ============================================================
// TITANWASH - Service Worker
// Cache-first per assets statici, network-first per API
// ============================================================

const CACHE_NAME = 'titanwash-v13';
const BASE = self.registration.scope;
const STATIC_ASSETS = [
    BASE,
    BASE + 'index.html',
    BASE + 'assets/Titan.png',
    BASE + 'assets/logo_ritagliato.png',
    BASE + 'css/variables.css',
    BASE + 'css/base.css',
    BASE + 'css/components.css',
    BASE + 'css/layout.css',
    BASE + 'css/modules.css',
    BASE + 'js/config.js',
    BASE + 'js/state.js',
    BASE + 'js/ui.js',
    BASE + 'js/api.js',
    BASE + 'js/auth.js',
    BASE + 'js/router.js',
    BASE + 'js/app.js',
    BASE + 'js/modules/dashboard.js',
    BASE + 'js/modules/clienti.js',
    BASE + 'js/modules/lavaggi.js',
    BASE + 'js/modules/crediti.js',
    BASE + 'js/modules/cassa.js',
    BASE + 'js/modules/magazzino.js',
    BASE + 'js/modules/personale.js',
    BASE + 'js/modules/manutenzioni.js',
    BASE + 'js/modules/log.js',
    BASE + 'js/modules/buoni.js',
    BASE + 'js/modules/area-cliente.js',
    BASE + 'manifest.json'
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
