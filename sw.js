// ============================================================
// TITANWASH - Service Worker
//
// Rete-prima per i file del sito, cache solo come riserva. La cache qui
// contiene ESCLUSIVAMENTE copie dei file statici (html, css, js, icone):
// nessun dato dell'app, che vive solo sul database.
//
// Difetto corretto il 21/10/2026 - "da mobile a volte resta una
// schermata bianca e basta":
//
//   fetch(...).catch(function() { return caches.match(request); })
//
// caches.match NON solleva un errore quando il file non c'e': restituisce
// undefined. E respondWith(undefined) per il browser e' un ERRORE DI
// RETE. Lo script non si carica, ENI.App non esiste, app.js muore e la
// pagina resta bianca.
//
// E la cache non trovava quasi mai niente, per tre ragioni:
//
//  1. le chiavi di precache non hanno il "?v=" (qui c'e' js/ui.js, la
//     pagina chiede js/ui.js?v=10): senza ignoreSearch sono due cose
//     diverse;
//  2. diciannove degli script caricati non erano in lista (fatturazione,
//     smac, bonus, tesoreria);
//  3. l'activate cancella ogni cache con un nome diverso da quello
//     corrente: alzando CACHE_NAME si butta via proprio la cache che
//     conteneva gli indirizzi con "?v=" delle visite precedenti.
//
// Su un telefono basta un attimo di rete assente - ascensore, galleria,
// passaggio da WiFi a 4G - e un solo script mancante fa lo schermo
// bianco. Col WiFi buono non capita quasi mai: ecco il "a volte".
//
// La lista qui sotto e' generata dagli <script> e <link> di index.html,
// quindi non puo' piu' restare indietro; un test lo verifica.
// ============================================================

const CACHE_NAME = 'titanwash-v145';
const BASE = self.registration.scope;
const STATIC_ASSETS = [
    BASE,
    BASE + 'index.html',
    BASE + 'manifest.json',
    BASE + 'assets/logo_ritagliato.png',
    BASE + 'assets/icons/icon.svg',
    BASE + 'css/variables.css',
    BASE + 'css/base.css',
    BASE + 'css/components.css',
    BASE + 'css/layout.css',
    BASE + 'css/modules.css',
    BASE + 'js/config.js',
    BASE + 'js/state.js',
    BASE + 'js/ui.js',
    BASE + 'js/utils.js',
    BASE + 'js/api.js',
    BASE + 'js/auth.js',
    BASE + 'js/lib/calcoli.js',
    BASE + 'js/lib/previsione-carburante.js',
    BASE + 'js/lib/bonus-calcoli.js',
    BASE + 'js/lib/cassa-quadratura.js',
    BASE + 'js/lib/ore-lavorate.js',
    BASE + 'js/router.js',
    BASE + 'js/modules/dashboard.js',
    BASE + 'js/modules/clienti.js',
    BASE + 'js/modules/lavaggi.js',
    BASE + 'js/modules/crediti.js',
    BASE + 'js/modules/cassa.js',
    BASE + 'js/modules/spese.js',
    BASE + 'js/modules/magazzino.js',
    BASE + 'js/modules/vendita-import.js',
    BASE + 'js/modules/vendita.js',
    BASE + 'js/modules/personale.js',
    BASE + 'js/modules/manutenzioni.js',
    BASE + 'js/modules/log.js',
    BASE + 'js/modules/buoni.js',
    BASE + 'js/modules/coefficiente-monofase.js',
    BASE + 'js/modules/marginalita-carburante.js',
    BASE + 'js/modules/ordine-carburante.js',
    BASE + 'js/modules/tesoreria.js',
    BASE + 'js/modules/fatturazione/scadenza.js',
    BASE + 'js/modules/fatturazione/parser.js',
    BASE + 'js/modules/fatturazione/pdf.js',
    BASE + 'js/modules/fatturazione/impostazioni.js',
    BASE + 'js/modules/fatturazione/elenco.js',
    BASE + 'js/modules/fatturazione/manuale.js',
    BASE + 'js/modules/fatturazione/import-eni.js',
    BASE + 'js/modules/fatturazione/export-bancari.js',
    BASE + 'js/modules/fatturazione/index.js',
    BASE + 'js/modules/smac/parser.js',
    BASE + 'js/modules/smac/import.js',
    BASE + 'js/modules/smac/riconciliazione.js',
    BASE + 'js/modules/smac/storico.js',
    BASE + 'js/modules/smac/index.js',
    BASE + 'js/modules/area-cliente.js',
    BASE + 'js/modules/impostazioni.js',
    BASE + 'js/modules/gestione-personale.js',
    BASE + 'js/modules/ferie.js',
    BASE + 'js/modules/turni.js',
    BASE + 'js/modules/mie-richieste.js',
    BASE + 'js/modules/timbra.js',
    BASE + 'js/modules/timbrature.js',
    BASE + 'js/modules/buste-paga.js',
    BASE + 'js/modules/bonus-venduto.js',
    BASE + 'js/modules/bonus-gestione.js',
    BASE + 'js/app.js'
];

// Install: mette in cache i file statici.
//
// Uno per uno e non con addAll: addAll e' atomico, quindi UN indirizzo
// che non risponde fa fallire tutta l'installazione e il service worker
// nuovo non entra mai in servizio, lasciando in piedi quello vecchio col
// difetto. Un file in meno in riserva e' meno grave di un aggiornamento
// che non arriva.
self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.open(CACHE_NAME).then(function(cache) {
            return Promise.all(STATIC_ASSETS.map(function(url) {
                return cache.add(url).catch(function() { /* salta e vai avanti */ });
            }));
        })
    );
    self.skipWaiting();
});

// Activate: via le cache delle versioni precedenti.
// Si cancellano solo le cache di questo service worker, cioe' copie di
// file del sito: nessun dato dell'app passa da qui.
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

// La riserva, quando la rete non risponde.
//
// Due regole, ed e' qui che si evita la schermata bianca:
//
//  - ignoreSearch: la lista di precache non ha il "?v=" mentre la pagina
//    lo chiede sempre. Senza, non si trova mai niente;
//  - MAI restituire undefined. respondWith(undefined) e' un errore di
//    rete: meglio una risposta vera, e per una navigazione meglio
//    ancora l'index in cache, cosi l'app parte.
function _dallaRiserva(request) {
    return caches.match(request, { ignoreSearch: true }).then(function(r) {
        if (r) return r;
        if (request.mode === 'navigate') {
            return caches.match(BASE + 'index.html', { ignoreSearch: true });
        }
        return null;
    }).then(function(r) {
        return r || new Response(
            'Titanwash non raggiungibile: nessuna rete e file non in memoria.',
            { status: 503, statusText: 'Offline',
              headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
        );
    });
}

self.addEventListener('fetch', function(event) {
    if (event.request.method !== 'GET') return;

    var url;
    try { url = new URL(event.request.url); } catch (e) { return; }

    // Le chiamate al database non si mettono mai in cache: servirebbero
    // dati vecchi spacciandoli per buoni.
    if (url.hostname.indexOf('supabase') > -1) {
        event.respondWith(fetch(event.request));
        return;
    }

    // Rete-prima per i file del sito, cosi un aggiornamento si vede subito.
    if (url.origin === self.location.origin) {
        event.respondWith(
            fetch(event.request).then(function(res) {
                // In cache solo le risposte BUONE: un 404 preso durante una
                // pubblicazione, se congelato qui, resterebbe servito per
                // sempre al posto del file vero.
                if (res && res.ok && res.type === 'basic') {
                    var copia = res.clone();
                    caches.open(CACHE_NAME).then(function(cache) {
                        return cache.put(event.request, copia);
                    }).catch(function() {});
                }
                return res;
            }).catch(function() {
                return _dallaRiserva(event.request);
            })
        );
        return;
    }

    // Risorse esterne (font, librerie da CDN): cache-prima, cambiano mai.
    event.respondWith(
        caches.match(event.request).then(function(cached) {
            if (cached) return cached;
            return fetch(event.request).then(function(res) {
                if (res && (res.ok || res.type === 'opaque')) {
                    var copia = res.clone();
                    caches.open(CACHE_NAME).then(function(cache) {
                        return cache.put(event.request, copia);
                    }).catch(function() {});
                }
                return res;
            }).catch(function() {
                return new Response('', { status: 504, statusText: 'Offline' });
            });
        })
    );
});
