// Eseguire con: node test/test-buoni-disabilita.js
//
// Un buono cartaceo puo' essere attivo, utilizzato o annullato. Lo stato
// 'utilizzato' esisteva nel database e nei filtri della pagina dal primo
// giorno, ma non c'era NESSUNA strada per arrivarci: l'unica era pagare con il
// buono dentro un carrello di Vendite, e in nove mesi non e' mai accaduto. Su
// 305 buoni: 273 attivi, 32 annullati, zero utilizzati.
//
// Risultato: lo stesso buono, o una sua fotocopia, poteva tornare dieci volte
// e niente se ne accorgeva.
//
// Qui si apre quella strada nel modo piu' corto: in Gestione Buoni un pulsante,
// si batte il codice, il buono e' disabilitato. Niente selezione del cliente
// (la pagina ne chiede uno per mostrare la lista, e per disabilitare non
// serve), niente caselline, niente riattivazione.
//
// Le due cose che questi controlli difendono davvero:
//
//   1. l'aggiornamento e' CONDIZIONATO a stato = 'attivo'. Senza quella
//      condizione due postazioni che disabilitano lo stesso codice insieme
//      sovrascriverebbero entrambe data e autore, e la prima verita' si
//      perderebbe;
//   2. non esiste da nessuna parte un modo di riportare un buono utilizzato a
//      'attivo'. L'utente l'ha chiesto esplicitamente: una volta chiuso e'
//      chiuso.
const fs = require('fs');
const P = 'C:/Users/Utente1/Documents/gestionale_eni/';

let pass = 0, fail = 0;
function check(nome, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + nome); }
  else { fail++; console.log('  FAIL ' + nome + (extra !== undefined ? ' -> ' + extra : '')); }
}

function leggi(rel) { return fs.readFileSync(P + rel, 'utf8'); }

var api = leggi('js/api.js');
var buoni = leggi('js/modules/buoni.js');
var html = leggi('index.html');

console.log('\n--- api.js: la funzione ---');
var fn = (api.match(/async function disabilitaBuonoByEAN[\s\S]*?\n    \}/) || [''])[0];
check('disabilitaBuonoByEAN esiste', fn.length > 0);
check('e\u2019 esposta nel modulo', /disabilitaBuonoByEAN:\s*disabilitaBuonoByEAN/.test(api));
check('cerca il buono dal codice', /cercaBuonoByEAN\(/.test(fn));

console.log('\n--- i tre rifiuti, ognuno col suo motivo ---');
// Messaggi distinti: "non ha funzionato" non dice al gestore cosa fare, mentre
// "codice non trovato" e "era gia' disabilitato il 3/11" portano a due gesti
// completamente diversi.
check('rifiuta un codice inesistente', /BUONO_INESISTENTE/.test(fn));
check('rifiuta un buono gia\u2019 utilizzato', /BUONO_GIA_UTILIZZATO/.test(fn));
check('e nel dirlo riporta la data di quando fu usato',
  /BUONO_GIA_UTILIZZATO[\s\S]{0,400}utilizzato_at/.test(fn) ||
  /utilizzato_at[\s\S]{0,400}BUONO_GIA_UTILIZZATO/.test(fn));
check('rifiuta un buono annullato', /BUONO_ANNULLATO/.test(fn));

console.log('\n--- l\u2019aggiornamento e\u2019 condizionato ---');
check('marca stato utilizzato', /stato:\s*'utilizzato'/.test(fn));
check('solo se era ancora attivo',
  /\.eq\('stato',\s*'attivo'\)/.test(fn));
check('scrive la data di utilizzo', /utilizzato_at:/.test(fn));
check('scrive chi l\u2019ha disabilitato', /utilizzato_da:/.test(fn));
// utilizzato_da e' una chiave esterna su personale(id), e getUserId() torna
// proprio l'id di personale: se un domani tornasse l'id di Auth, il database
// rifiuterebbe la riga.
check('usa l\u2019id del personale', /ENI\.State\.getUserId\(\)/.test(fn));
check('se non aggiorna niente lo dice invece di fingere',
  /length === 0/.test(fn));
check('non collega nessuna vendita (non nasce da una vendita)',
  !/vendita_id/.test(fn));
check('scrive nel registro attivita\u2019', /Disabilitato_Buono/.test(fn));

console.log('\n--- nessuna riattivazione, da nessuna parte ---');
// L'unico posto in cui 'attivo' puo' essere scritto e' la generazione di buoni
// nuovi. Se un domani qualcuno aggiunge un "ripristina", questo si accende.
var scritture = (buoni.match(/stato:\s*'attivo'/g) || []).length;
check('in buoni.js stato attivo si scrive solo generando buoni nuovi',
  scritture === 1, scritture + ' punti');
check('in api.js nessuna funzione riporta un buono ad attivo',
  !/update\([\s\S]{0,200}stato:\s*'attivo'/.test(api) &&
  !/stato:\s*'attivo'[\s\S]{0,120}buoni_cartacei/.test(api));
// Attenzione a non confondersi: in questa pagina esiste gia' un "Riattiva" che
// riguarda gli ACCOUNT dei clienti del portale, e non ha niente a che vedere
// con i buoni. Qui si guardano solo i buoni.
check('nessun pulsante e nessuna funzione che riattivi un BUONO',
  !/data-(ripristina|riattiva)-?buono/i.test(buoni) &&
  !/function _?(ripristina|riattiva)Buono/i.test(buoni) &&
  !/disabilitaBuono[\s\S]{0,600}stato:\s*'attivo'/.test(buoni));

console.log('\n--- il pulsante e il riquadro ---');
check('c\u2019e\u2019 il pulsante in Gestione Buoni',
  /id="btn-disabilita-buono"/.test(buoni));
check('sta nella scheda Gestione, non in quella di generazione',
  /_renderGestione[\s\S]{0,2000}btn-disabilita-buono/.test(buoni));
check('il riquadro chiede il codice', /id="dis-ean"/.test(buoni));
check('e la data di utilizzo', /id="dis-data"/.test(buoni));
check('la data parte da oggi', /ENI\.UI\.oggiISO\(\)/.test(buoni));
check('e non si puo\u2019 mettere nel futuro',
  /id="dis-data"[^>]*max="/.test(buoni) || /dis-data[\s\S]{0,200}max=/.test(buoni));

console.log('\n--- quando ha funzionato, la finestra si chiude ---');
// Nella prima versione restava aperta col campo svuotato, per disabilitarne
// diversi di fila senza riaprirla. Il gestore l'ha segnalato come difetto -- "la
// card non si chiude" - e aveva ragione: in tutta l'applicazione una finestra
// che ha funzionato si chiude, e una che resta aperta sembra bloccata.
var dlg = (buoni.match(/function _showDisabilitaBuono[\s\S]*?\n    \}\n/) || [''])[0];
check('la finestra esiste', dlg.length > 0);
check('a buon fine si chiude', /ENI\.UI\.closeModal\(modal\)/.test(dlg));
check('e lo conferma con un messaggio', /ENI\.UI\.success\(/.test(dlg));
check('il cursore parte dentro al campo', /inEan\.focus\(\)/.test(dlg));
check('un lettore di codici a barre funziona (Invio conferma)',
  /'Enter'/.test(dlg));

// L'errore e' il caso opposto: un codice battuto male si corregge dove si e'
// sbagliato. Se si chiudesse anche qui, bisognerebbe riaprire tutto per
// cambiare una cifra.
var catchBlocco = (dlg.match(/catch \(err\) \{[\s\S]*?\n            \}/) || [''])[0];
check('in caso di errore invece resta aperta',
  catchBlocco.length > 0 && catchBlocco.indexOf('closeModal') === -1);
check('e mostra il motivo dentro la finestra', /mostra\(/.test(catchBlocco));

console.log('\n--- l\u2019esito si legge ---');
check('mostra l\u2019esito dentro il riquadro', /id="dis-esito"/.test(buoni));
check('in caso buono mostra il taglio', /formatValuta/.test(dlg));

console.log('\n--- la data: mezzogiorno, non mezzanotte ---');
// A mezzanotte un fuso orario basta a spostare il giorno: la data scelta
// diventerebbe quella prima o quella dopo quando si rilegge. A mezzogiorno
// nessuno scarto di fuso cambia il giorno.
var helper = (buoni.match(/function _isoUtilizzo[\s\S]*?\n    \}/) || [''])[0];
check('il momento si costruisce in un punto solo', helper.length > 0);
check('a mezzogiorno', /T12:00:00/.test(helper));
if (helper) {
  // eval su codice NOSTRO, estratto dal file del progetto due righe sopra: e'
  // il solo modo di provare davvero la funzione, invece di riscriverne la
  // regola qui e finire per controllare la copia. Nessun dato esterno entra.
  var _isoUtilizzo = eval('(' + helper + ')');
  var iso = _isoUtilizzo('2026-11-03');
  check('il giorno resta il 3 novembre', /^2026-11-03/.test(iso.slice(0, 10)) ||
    new Date(iso).getDate() === 3, iso);
  var iso2 = _isoUtilizzo('2026-01-01');
  check('e il primo gennaio non diventa il 31 dicembre',
    new Date(iso2).getDate() === 1 && new Date(iso2).getMonth() === 0, iso2);
}

console.log('\n--- index.html: le versioni ---');
var va = html.match(/js\/api\.js\?v=(\d+)/);
check('api.js ha una versione nuova (>= 65)', !!va && parseInt(va[1], 10) >= 65, va ? va[1] : '?');
var vb = html.match(/js\/modules\/buoni\.js\?v=(\d+)/);
check('buoni.js ha una versione nuova (>= 13)', !!vb && parseInt(vb[1], 10) >= 13, vb ? vb[1] : '?');

console.log('\n' + pass + ' passati, ' + fail + ' falliti');
process.exit(fail === 0 ? 0 : 1);
