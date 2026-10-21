// Eseguire con: node test/test-service-worker.js
//
// "Da mobile a volte quando si apre resta una schermata bianca e basta",
// segnalato il 21/10/2026 da piu' persone.
//
// La riga colpevole era in sw.js:
//
//     fetch(...).catch(function() { return caches.match(request); })
//
// caches.match NON solleva un errore quando il file non c'e': restituisce
// undefined. E respondWith(undefined) per il browser e' un ERRORE DI
// RETE. Lo script non si carica, ENI.App non esiste, app.js muore e la
// pagina resta bianca.
//
// E la cache non trovava quasi niente: le chiavi di precache non hanno il
// "?v=" che la pagina chiede sempre, diciannove script non erano in
// lista, e l'activate cancella le cache delle versioni precedenti -
// quindi alzando CACHE_NAME si buttava via proprio quella che conteneva
// gli indirizzi con "?v=" delle visite prima.
//
// Qui si difendono le tre regole che tengono in piedi il telefono.
const fs = require('fs');
const P = 'C:/Users/Utente1/Documents/gestionale_eni/';

let pass = 0, fail = 0;
function check(nome, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + nome); }
  else { fail++; console.log('  FAIL ' + nome + (extra !== undefined ? ' -> ' + extra : '')); }
}

var sw = fs.readFileSync(P + 'sw.js', 'utf8');
var html = fs.readFileSync(P + 'index.html', 'utf8');

console.log('\n--- 1. la riserva non puo mai rispondere con il vuoto ---');
check('c e una funzione sola per la riserva', sw.indexOf('function _dallaRiserva') > -1);
// Il punto: dopo la ricerca in cache ci deve essere una Response vera.
check('finisce sempre con una Response', /return r \|\| new Response/.test(sw));
check('e per una navigazione ripiega sull index',
  /request\.mode === 'navigate'/.test(sw) && /index\.html/.test(sw));
// La forma vecchia, quella che restituiva undefined.
check('non resta la forma vecchia che tornava undefined',
  !/catch\(function\(\) \{\s*\n?\s*(\/\/[^\n]*\n\s*)?return caches\.match\(event\.request\);\s*\n?\s*\}\)/.test(sw));

console.log('\n--- 2. il ?v= non deve far mancare il riscontro ---');
check('le ricerche in cache ignorano la stringa di query',
  (sw.match(/ignoreSearch:\s*true/g) || []).length >= 2);

console.log('\n--- 3. in precache ci sta il GUSCIO, non tutta l app ---');
// Il 21/10 qui c'erano tutti e 65 i file, e l'installazione li
// scaricava mentre la pagina caricava i suoi script e chiamava il
// database: le chiamate andavano in timeout e l'app diceva
// "Connessione assente" con la rete perfetta. Ricaricando due o tre
// volte ripartiva, cioe' a installazione finita.
//
// Quindi in lista va il minimo per far partire l'app. Il resto lo
// mette in cache il gestore rete-prima man mano che lo serve.
var inLista = {};
(sw.match(/BASE [+] '([^']+)'/g) || []).forEach(function(m) {
  inLista[m.replace("BASE + '", '').replace(/'$/, '')] = true;
});
var GUSCIO = ['index.html', 'manifest.json',
  'css/variables.css', 'css/base.css', 'css/components.css',
  'css/layout.css', 'css/modules.css',
  'js/config.js', 'js/state.js', 'js/ui.js', 'js/utils.js',
  'js/api.js', 'js/auth.js', 'js/router.js', 'js/app.js'];
GUSCIO.forEach(function(f) { check(f + ' e nel guscio', !!inLista[f]); });

var quanti = Object.keys(inLista).length;
check('la lista resta piccola, niente scarica iniziale',
  quanti <= 20, quanti + ' voci');
// I moduli NON vanno in lista: e' quello che causava il timeout.
check('i moduli non sono in precache',
  !inLista['js/modules/fatturazione/manuale.js'] && !inLista['js/modules/cassa.js']);

console.log('\n--- e il ritentativo prima di arrendersi ---');
check('ritenta una volta sola',
  sw.indexOf('return fetch(event.request);') > -1);

console.log('\n--- il service worker non subentra a pagina aperta ---');
// skipWaiting + clients.claim facevano entrare in servizio il nuovo
// mentre la pagina era a meta' del caricamento, con la cache vuota.
var swCode = sw.split(String.fromCharCode(10))
  .filter(function(l) { return l.trim().indexOf('//') !== 0; })
  .join(String.fromCharCode(10));
check('non usa skipWaiting', swCode.indexOf('skipWaiting()') === -1);
check('non usa clients.claim', swCode.indexOf('clients.claim()') === -1);

console.log('\n--- e non si mette in mezzo alle chiamate al database ---');
check('le lascia passare al browser senza respondWith',
  sw.indexOf('supabase') > -1 && sw.indexOf('> -1) return;') > -1);
console.log('\n--- 4. installazione che non si fa bloccare da un file ---');
// addAll e' atomico: UN indirizzo che non risponde fa fallire tutta
// l'installazione, il service worker nuovo non entra in servizio e resta
// in piedi quello vecchio col difetto.
check('i file si mettono in cache uno per uno', /cache\.add\(url\)/.test(sw));
check('e un file che manca non blocca il resto',
  /cache\.add\(url\)\.catch\(/.test(sw));
// Il controllo guarda il codice senza commenti: la parola addAll
// compare qui sopra nella spiegazione del perche' non si usa.
var swCodice = sw.replace(/\/\*[\s\S]*?\*\//g, '')
  .split(String.fromCharCode(10))
  .filter(function(l) { return l.trim().indexOf('//') !== 0; })
  .join(String.fromCharCode(10));
check('non si usa piu addAll', swCodice.indexOf('addAll') === -1);

console.log('\n--- 5. non si congelano risposte sbagliate ---');
// Un 404 preso durante una pubblicazione, se messo in cache, verrebbe
// servito per sempre al posto del file vero.
check('in cache solo le risposte buone', /res\.ok/.test(sw));
check('e solo quelle del nostro sito', /res\.type === 'basic'/.test(sw));
// Adesso non le intercetta affatto: nessun respondWith, le gestisce
// il browser. E' ancora piu' forte che non metterle in cache.
check('le chiamate al database non vengono nemmeno intercettate',
  sw.indexOf('> -1) return;') > -1);

console.log('\n--- 6. e se proprio non parte, non si vede il bianco ---');
check('index.html ha la rete di sicurezza', html.indexOf('tw-ricarica') > -1);
check('scatta solo se la pagina e rimasta vuota',
  /app\.children\.length\) return/.test(html));
check('offre di ricaricare', /location\.reload\(\)/.test(html));
check('e rassicura che i dati sono al loro posto',
  html.indexOf('non si perde niente') > -1);
// Nessuna pulizia automatica: la rete di sicurezza non deve toccare nulla.
check('non cancella niente da sola',
  !/localStorage\.clear|sessionStorage\.clear|caches\.delete/.test(
    (html.match(/tw-ricarica[\s\S]{0,1500}/) || [''])[0]));

console.log('\n--- la versione della cache e stata alzata ---');
// Senza, il service worker nuovo non viene nemmeno preso in
// considerazione dai telefoni che hanno il vecchio.
check('CACHE_NAME e nuovo', /titanwash-v14[5-9]|titanwash-v1[5-9]\d/.test(sw),
  (sw.match(/titanwash-v\d+/) || [''])[0]);

console.log('\n' + pass + ' passati, ' + fail + ' falliti');
process.exit(fail === 0 ? 0 : 1);
