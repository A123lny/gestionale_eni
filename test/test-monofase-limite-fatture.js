// Eseguire con: node test/test-monofase-limite-fatture.js
//
// Il 04/11/2026 la sincronizzazione del coefficiente monofase si rompeva con
// "violates check constraint fatture_acquisto_gasolio_numero_progressivo_check".
//
// Causa: la colonna numero_progressivo aveva un vincolo
//
//     CHECK (numero_progressivo >= 1 AND numero_progressivo <= 25)
//
// e la sincronizzazione crea una riga per ogni carico di gasolio del mese,
// numerandole 1, 2, 3... Ottobre 2026 ha avuto 27 carichi: al ventiseiesimo il
// database rifiutava la riga e la sincronizzazione moriva a meta'.
//
// Il 25 non era un limite di legge ne' di calcolo: era un numero scritto una
// volta sola e mai piu' guardato, quando i carichi erano sei al mese. La
// stazione e' cresciuta - 6 a febbraio, 9 a maggio, 22 a luglio, 27 a ottobre -
// e il tetto l'ha raggiunta.
//
// Il danno non era l'errore rosso, era silenzioso: ottobre restava calcolato su
// 25 carichi su 27, cioe' 45.053 litri e 15.974,60 euro di monofase in meno in
// una dichiarazione fiscale.
//
// Questi controlli difendono una cosa sola: che un conteggio di righe non
// torni mai a essere un tetto basso scritto a mano.
const fs = require('fs');
const P = 'C:/Users/Utente1/Documents/gestionale_eni/';

let pass = 0, fail = 0;
function check(nome, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + nome); }
  else { fail++; console.log('  FAIL ' + nome + (extra !== undefined ? ' -> ' + extra : '')); }
}

function leggi(rel) { return fs.readFileSync(P + rel, 'utf8'); }

var MIG = 'supabase/migrations/20261104_monofase_limite_fatture.sql';

console.log('\n--- la migration esiste ---');
check('il file della migration c\u2019e\u2019', fs.existsSync(P + MIG));
if (!fs.existsSync(P + MIG)) {
  console.log('\n' + pass + ' passati, ' + fail + ' falliti');
  process.exit(1);
}
var mig = leggi(MIG);

console.log('\n--- il vecchio tetto va via ---');
check('toglie il vincolo vecchio',
  /drop constraint if exists fatture_acquisto_gasolio_numero_progressivo_check/i.test(mig));
check('non lascia da nessuna parte un tetto a 25',
  !/<=\s*25\b/.test(mig) && !/numero_progressivo\s*<\s*26/.test(mig));

console.log('\n--- il vincolo nuovo ---');
// Il limite basso resta: un progressivo zero o negativo e' un errore, non una
// stazione che cresce. Il limite alto serve solo a intercettare un numero
// assurdo (una cifra sbagliata a mano, un ciclo impazzito), quindi sta molto
// sopra qualunque mese reale.
check('rimette un vincolo su numero_progressivo',
  /add constraint fatture_acquisto_gasolio_numero_progressivo_check/i.test(mig));
check('tiene il minimo a 1', /numero_progressivo\s*>=\s*1/.test(mig));
var tetto = mig.match(/numero_progressivo\s*<=\s*(\d+)/);
check('il tetto nuovo e\u2019 molto sopra i mesi reali (>= 100)',
  !!tetto && parseInt(tetto[1], 10) >= 100, tetto ? tetto[1] : 'nessun tetto');

console.log('\n--- quello che NON si deve toccare ---');
// L'unicita' (mese, progressivo) e' cio' che impedisce due righe numero 7 nello
// stesso mese: non c'entra col tetto e deve restare dov'e'.
check('non tocca l\u2019unicita\u2019 mese+progressivo',
  !/drop constraint[\s\S]*mese_riferimento_numero_progressiv/i.test(mig));
check('non cancella righe', !/\bdelete\s+from\b/i.test(mig) && !/\btruncate\b/i.test(mig));
check('non tocca i carichi', !/carichi_carburante/i.test(mig));

console.log('\n--- il modulo ---');
var cm = leggi('js/modules/coefficiente-monofase.js');
var max = cm.match(/var MAX_FATTURE\s*=\s*(\d+)/);
check('MAX_FATTURE esiste ancora come guardia', !!max);
check('MAX_FATTURE e\u2019 allineato al vincolo nuovo',
  !!max && !!tetto && parseInt(max[1], 10) === parseInt(tetto[1], 10),
  max ? ('modulo ' + max[1] + ' vs database ' + (tetto ? tetto[1] : '?')) : 'assente');

console.log('\n--- il contatore non spaventa piu\u2019 ---');
// "25/25" diceva al gestore che era arrivato a un confine. Con un tetto di
// guardia quel rapporto non significa piu' niente ("27/200"), quindi resta il
// solo numero di fatture.
var riep = (cm.match(/function _renderRiepilogoTotali[\s\S]*?\n    \}/) || [''])[0];
check('il riquadro Fatture mostra solo il conteggio',
  riep.indexOf('MAX_FATTURE') === -1, 'c\u2019e\u2019 ancora MAX_FATTURE nel riquadro');
check('e il conteggio c\u2019e\u2019 davvero',
  /_fatture\.length/.test(riep));

console.log('\n--- + Aggiungi ---');
// Il pulsante resta protetto, ma da un numero che nessun mese raggiunge: in
// pratica non si disabilita piu', e se lo fa qualcosa non torna davvero.
check('il pulsante resta protetto da MAX_FATTURE',
  /id="cm-btn-aggiungi"[\s\S]{0,120}MAX_FATTURE/.test(cm));

console.log('\n--- la sincronizzazione ---');
var api = leggi('js/api.js');
var sync = (api.match(/async function sincronizzaMonofaseDaCarichi[\s\S]*?\n    \}/) || [''])[0];
check('numera le righe dai carichi, senza tetti propri',
  /numero_progressivo:\s*i \+ 1/.test(sync));
check('non c\u2019e\u2019 un 25 nascosto nella sincronizzazione',
  sync.indexOf('25') === -1 || !/[<>]=?\s*25\b/.test(sync));

console.log('\n--- index.html: la versione ---');
// Senza il bump il browser serve il file vecchio e il tetto sembra ancora la'.
var html = leggi('index.html');
var v = html.match(/js\/modules\/coefficiente-monofase\.js\?v=(\d+)/);
check('coefficiente-monofase.js ha una versione nuova (>= 10)',
  !!v && parseInt(v[1], 10) >= 10, v ? v[1] : 'non trovato');

console.log('\n' + pass + ' passati, ' + fail + ' falliti');
process.exit(fail === 0 ? 0 : 1);
