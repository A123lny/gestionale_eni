// Eseguire con: node test/test-personale-solo-timbratura.js
//
// Laura Cervellini timbra ma non ha un profilo: deve comparire SOLO nelle
// Timbrature. La parte difficile non e' aggiungerla, e' tenerla fuori da tutto
// il resto, e ci sono DUE porte da cui una persona entra nell'app:
//
//   1. la vista `personale_login`, che la schermata di accesso legge senza
//      guardare se quella persona ha un account: elencava chiunque avesse
//      attivo = true, quindi Laura sarebbe comparsa nella lista di login;
//   2. ENI.API.getPersonale(), letta da SEI schermate (Gestione Personale,
//      Turni, Ferie, Buste Paga, Bonus, Timbrature).
//
// Il filtro della seconda sta in api.js, in un punto solo: e' quello il patto
// che questi controlli difendono. Se un domani un modulo nuovo chiama
// getPersonale() senza pensarci, Laura resta fuori -- che e' il comportamento
// giusto. Chi la vuole vedere deve chiederlo.
const fs = require('fs');
const path = require('path');
const P = 'C:/Users/Utente1/Documents/gestionale_eni/';

let pass = 0, fail = 0;
function check(nome, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + nome); }
  else { fail++; console.log('  FAIL ' + nome + (extra !== undefined ? ' -> ' + extra : '')); }
}

function leggi(rel) { return fs.readFileSync(P + rel, 'utf8'); }

var mig = leggi('supabase/migrations/20261012_personale_solo_timbratura.sql');
var api = leggi('js/api.js');
var timb = leggi('js/modules/timbrature.js');
var html = leggi('index.html');

console.log('\n--- la migration ---');
check('aggiunge solo_timbratura',
  /alter table public\.personale[\s\S]{0,120}add column if not exists solo_timbratura boolean/.test(mig));
check('con default false, cosi non cambia niente per tutti gli altri',
  /solo_timbratura boolean not null default false/.test(mig));

console.log('\n--- la vista del login ---');
// `create or replace` e non drop+create: la vista e' leggibile da anon (serve
// prima che qualcuno sia autenticato) e un drop porterebbe via quei permessi.
check('usa create or replace, non drop',
  /create or replace view public\.personale_login/.test(mig) &&
  !/drop view[\s\S]*personale_login/i.test(mig));
var vista = (mig.match(/create or replace view public\.personale_login[\s\S]*?;/) || [''])[0];
check('esclude chi e solo_timbratura', /solo_timbratura is false/.test(vista));
check("non ha perso il filtro sugli attivi che c'era prima",
  /attivo is true/.test(vista));
check('espone ancora le tre colonne che il login si aspetta',
  /nome_completo/.test(vista) && /email_tecnica/.test(vista) && /\battivo\b/.test(vista));

console.log('\n--- la riga di Laura ---');
var ins = (mig.match(/insert into public\.personale[\s\S]*?;/) || [''])[0];
check('inserisce Laura Cervellini', /Laura Cervellini/.test(ins));
check('segnata solo_timbratura', /solo_timbratura/.test(ins) && /true/.test(ins));
check('si puo rilanciare senza fare doppioni',
  /where not exists \(select 1 from public\.personale where username = 'laura'\)/.test(ins));
// Senza auth_user_id non esiste nessun modo di entrare: e' questo, non il
// `pin`, che le impedisce l'accesso. Il pin e' solo una colonna NOT NULL.
check('non le da un auth_user_id, quindi non puo accedere',
  !/auth_user_id/.test(ins));
check('il pin messo non e un PIN valido a 6 cifre',
  !/'[0-9]{6}'/.test(ins));

console.log('\n--- api.js: il filtro in un punto solo ---');
var fn = (api.match(/async function getPersonale\(opzioni\)[\s\S]*?\n    \}/) || [''])[0];
check('getPersonale accetta le opzioni', fn.length > 0);
check('per default esclude chi e solo_timbratura',
  /if \(!\(opzioni && opzioni\.conSoloTimbratura\)\)[\s\S]{0,160}col: 'solo_timbratura', val: false/.test(fn));
check('passa i filtri a getAll', /filters: filters/.test(fn));
check("conserva l'ordinamento per nome che c'era",
  /order: \{ col: 'nome_completo', asc: true \}/.test(fn));

console.log('\n--- chi chiede di vederla, e chi no ---');
// Il conto e' la garanzia: se domani qualcuno aggiunge conSoloTimbratura a un
// altro modulo, questo controllo si accende.
var moduli = fs.readdirSync(P + 'js/modules', { withFileTypes: true })
  .filter(function(e) { return e.isFile() && e.name.endsWith('.js'); })
  .map(function(e) { return 'js/modules/' + e.name; });

var chiedono = moduli.filter(function(m) { return /conSoloTimbratura/.test(leggi(m)); });
check('solo Timbrature la chiede esplicitamente',
  chiedono.length === 1 && chiedono[0] === 'js/modules/timbrature.js',
  chiedono.join(', ') || 'nessuno');

check('e la chiede davvero dove carica il personale',
  /ENI\.API\.getPersonale\(\{ conSoloTimbratura: true \}\)/.test(timb));

// Le altre cinque schermate devono restare alla chiamata nuda.
['js/modules/personale.js', 'js/modules/turni.js', 'js/modules/ferie.js',
 'js/modules/buste-paga.js', 'js/modules/bonus-gestione.js'].forEach(function(m) {
  var src = leggi(m);
  check(path.basename(m) + ' chiama getPersonale() senza opzioni',
    /ENI\.API\.getPersonale\(\)/.test(src) && !/conSoloTimbratura/.test(src));
});

console.log('\n--- index.html: le versioni ---');
// Senza il bump il browser serve il file vecchio dalla cache: la schermata
// resterebbe quella di prima e sembrerebbe che il lavoro non sia stato fatto.
check('api.js ha una versione nuova', /js[/]api[.]js[?]v=(6[3-9]|[7-9]\d|\d{3,})/.test(html));
check('timbrature.js ha una versione nuova', /js\/modules\/timbrature\.js\?v=1\d/.test(html));

console.log('\n' + pass + ' passati, ' + fail + ' falliti');
process.exit(fail === 0 ? 0 : 1);
