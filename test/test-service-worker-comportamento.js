// Eseguire con: node test/test-service-worker-comportamento.js
//
// Qui il service worker viene ESEGUITO per davvero, in una finta
// finestra, e gli si stacca la rete. Gli altri test leggono il codice;
// questo guarda cosa risponde.
//
// La domanda a cui risponde e' quella del 21/10/2026: con la rete che
// cade, cosa riceve il telefono? Prima riceveva undefined, e undefined
// e' la schermata bianca.
const fs = require('fs');
const P = 'C:/Users/Utente1/Documents/gestionale_eni/';

let pass = 0, fail = 0;
function check(nome, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + nome); }
  else { fail++; console.log('  FAIL ' + nome + (extra !== undefined ? ' -> ' + extra : '')); }
}

var BASE = 'https://a123lny.github.io/gestionale_eni/';

// --- la finta cache del browser ---
function FintaCache() { this.m = {}; }
FintaCache.prototype.add = function(url) {
  this.m[url] = { corpo: 'contenuto di ' + url, ok: true, type: 'basic', clone: function() { return this; } };
  return Promise.resolve();
};
FintaCache.prototype.put = function(req, res) { this.m[req.url || req] = res; return Promise.resolve(); };
FintaCache.prototype.match = function(req, opz) {
  var url = req.url || req;
  if (this.m[url]) return Promise.resolve(this.m[url]);
  if (opz && opz.ignoreSearch) {
    var nudo = url.split('?')[0];
    if (this.m[nudo]) return Promise.resolve(this.m[nudo]);
  }
  return Promise.resolve(undefined);
};

function montaSW(opzioni) {
  var cache = new FintaCache();
  var handlers = {};
  var sandbox = {
    self: {
      registration: { scope: BASE },
      skipWaiting: function() {},
      clients: { claim: function() {} },
      location: { origin: 'https://a123lny.github.io' },
      addEventListener: function(nome, fn) { handlers[nome] = fn; }
    },
    caches: {
      open: function() { return Promise.resolve(cache); },
      keys: function() { return Promise.resolve([]); },
      delete: function() { return Promise.resolve(true); },
      match: function(r, o) { return cache.match(r, o); }
    },
    fetch: opzioni.fetch,
    URL: URL,
    Response: function(corpo, init) {
      init = init || {};
      this.corpo = corpo; this.status = init.status || 200;
      this.statusText = init.statusText || ''; this.ok = this.status >= 200 && this.status < 300;
      this.clone = function() { return this; };
    },
    Promise: Promise, console: console, setTimeout: setTimeout
  };
  var src = fs.readFileSync(P + 'sw.js', 'utf8');
  var chiavi = Object.keys(sandbox);
  var fn = new Function(chiavi.join(','), src);
  fn.apply(null, chiavi.map(function(k) { return sandbox[k]; }));
  return { handlers: handlers, cache: cache, sandbox: sandbox };
}

// Chiede al service worker una risorsa e restituisce cosa ha risposto.
function chiedi(sw, url, mode) {
  return new Promise(function(resolve) {
    var risposta;
    sw.handlers['fetch']({
      request: { url: url, method: 'GET', mode: mode || 'no-cors' },
      respondWith: function(p) { risposta = p; }
    });
    if (risposta === undefined) return resolve({ nessunaRisposta: true });
    Promise.resolve(risposta).then(function(r) { resolve({ r: r }); });
  });
}

async function prova() {
  // --- 1. Installazione: mette in cache senza il ?v= ---
  console.log('\n--- installazione ---');
  var reteOk = function(req) {
    return Promise.resolve({ ok: true, type: 'basic', corpo: 'fresco', clone: function() { return this; } });
  };
  var sw = montaSW({ fetch: reteOk });
  var attese = [];
  sw.handlers['install']({ waitUntil: function(p) { attese.push(p); } });
  await Promise.all(attese);
  var inCache = Object.keys(sw.cache.m);
  // Solo il guscio: 65 file all'installazione facevano andare in timeout
  // le chiamate al database mentre la pagina caricava (21/10/2026).
  check('ha messo in cache il guscio, non tutta l app',
    inCache.length > 10 && inCache.length <= 20, inCache.length + ' file');
  check('fra cui index.html', inCache.indexOf(BASE + 'index.html') > -1);
  check('e app.js senza il ?v=', inCache.indexOf(BASE + 'js/app.js') > -1);

  // --- 2. Rete caduta: il caso della schermata bianca ---
  console.log('\n--- rete caduta, file chiesto CON il ?v= ---');
  // E' esattamente cio' che accade sul telefono: la pagina chiede
  // js/app.js?v=24 mentre in cache c'e' js/app.js.
  var reteGiu = function() { return Promise.reject(new Error('offline')); };
  var sw2 = montaSW({ fetch: reteGiu });
  var att2 = [];
  sw2.handlers['install']({ waitUntil: function(p) { att2.push(p); } });
  // la cache la riempiamo come farebbe un'installazione riuscita
  var c = sw2.cache;
  ['index.html', 'js/app.js', 'js/ui.js', 'js/utils.js'].forEach(function(f) { c.add(BASE + f); });

  var esito = await chiedi(sw2, BASE + 'js/app.js?v=24');
  check('risponde qualcosa (prima era undefined)', !esito.nessunaRisposta);
  check('e il file giusto dalla cache', !!esito.r && /js\/app\.js/.test(String(esito.r.corpo || '')),
    JSON.stringify(esito.r && esito.r.corpo));

  // --- 3. Rete caduta e file MAI visto ---
  console.log('\n--- rete caduta, file mai visto ---');
  var e2 = await chiedi(sw2, BASE + 'js/modules/pippo.js?v=1');
  check('non resta senza risposta', !e2.nessunaRisposta);
  check('risponde con un errore onesto, non col vuoto',
    !!e2.r && e2.r.status === 503, e2.r && e2.r.status);

  // --- 4. Rete caduta su una navigazione ---
  console.log('\n--- rete caduta aprendo l app ---');
  var e3 = await chiedi(sw2, BASE + 'qualsiasi', 'navigate');
  check("ripiega sull'index in cache, cosi l app parte",
    !!e3.r && /index\.html/.test(String(e3.r.corpo || '')),
    JSON.stringify(e3.r && e3.r.corpo));

  // --- 5. Una risposta sbagliata non deve finire in cache ---
  console.log('\n--- un 404 durante una pubblicazione ---');
  var rete404 = function() {
    return Promise.resolve({ ok: false, status: 404, type: 'basic', clone: function() { return this; } });
  };
  var sw3 = montaSW({ fetch: rete404 });
  await chiedi(sw3, BASE + 'js/nuovo.js?v=1');
  check('il 404 non viene congelato in cache',
    Object.keys(sw3.cache.m).indexOf(BASE + 'js/nuovo.js?v=1') === -1);

  // --- 6. Le chiamate al database non passano dalla cache ---
  console.log('\n--- chiamate al database ---');
  var chiamate = [];
  var sw4 = montaSW({ fetch: function(req) {
    chiamate.push(req.url);
    return Promise.resolve({ ok: true, type: 'cors', clone: function() { return this; } });
  }});
  var eDb = await chiedi(sw4, 'https://abc.supabase.co/rest/v1/fatture?select=*');
  // Il service worker non chiama respondWith: la richiesta la gestisce il
  // browser come se lui non ci fosse. E' la via piu' sicura - niente
  // codice nostro sulla strada dei dati.
  check('il service worker non le intercetta', eDb.nessunaRisposta === true);
  check('non le rifa lui', chiamate.length === 0, chiamate.join(', '));
  check('e non lasciano copie in cache', Object.keys(sw4.cache.m).length === 0,
    Object.keys(sw4.cache.m).join(', '));

  console.log('\n' + pass + ' passati, ' + fail + ' falliti');
  process.exit(fail === 0 ? 0 : 1);
}

prova();
