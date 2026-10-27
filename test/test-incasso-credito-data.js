// Eseguire con: node test/test-incasso-credito-data.js
//
// Chiesto il 27/10/2026, nato da un caso vero: "stamattina non mi tornava
// la cassa e alla fine ho capito che era perche' non era stato segnato un
// rientro di credito di piu' di 500 euro, e lo sono andata a inserire
// manualmente in cassa".
//
// Il flusso che serve al gestore: la mattina, se c'e' un credito in
// rientro, verifica che sia stato inserito; se non lo e', lo inserisce lei
// con la data di IERI e la cassa torna subito.
//
// Prima non si poteva: l'Incasso Credito aggiunge una riga al carrello e
// la vendita si salvava sempre con `data: oggi`.
//
// Perche' registrarlo in Vendite e non solo nel campo della cassa: la
// riga in Vendite lascia una traccia - chi, quanto, quando, quale
// operatore - e si ritrova nello storico. Nel campo della cassa e' un
// numero nudo, e l'incasso credito NON scala la tabella `crediti`: senza
// la riga in Vendite di quei soldi non resta memoria da nessuna parte.
//
// Il vincolo da rispettare: una vendita ha UNA data. Quindi un incasso
// retrodatato non puo' stare nello stesso carrello con della merce
// venduta oggi.
const fs = require('fs');
const P = 'C:/Users/Utente1/Documents/gestionale_eni/';

let pass = 0, fail = 0;
function check(nome, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + nome); }
  else { fail++; console.log('  FAIL ' + nome + (extra !== undefined ? ' -> ' + extra : '')); }
}

var ven = fs.readFileSync(P + 'js/modules/vendita.js', 'utf8');
var html = fs.readFileSync(P + 'index.html', 'utf8');

console.log('\n--- il campo data nel riquadro ---');
var fn = (/function _showFormIncassoCredito\(\)[\s\S]*?\n    \}\n/.exec(ven) || [''])[0];
check('il riquadro c e', fn.length > 0);
check('chiede la data', fn.indexOf('inc-data') > -1);
check('precompilata a oggi', /inc-data[\s\S]{0,200}oggiISO\(\)/.test(fn));
// Un rientro nel futuro non esiste: il campo non deve permetterlo.
check('e non si puo mettere nel futuro', /inc-data[\s\S]{0,200}max=/.test(fn));

console.log('\n--- la data viaggia sulla riga del carrello ---');
check('la riga porta la sua data', fn.indexOf('data_incasso') > -1);
// Perche' si veda a occhio che quella riga non e' di oggi.
check('e si vede nel carrello quando non e oggi',
  ven.indexOf('item.data_incasso') > -1 &&
  /item\.data_incasso[\s\S]{0,300}formatData\(item\.data_incasso\)/.test(ven));

console.log('\n--- non si mescola merce e incasso retrodatato ---');
// Una vendita ha UNA data: se si mescolassero, o la merce finirebbe su
// ieri o il rientro su oggi. Entrambe sbagliate.
check("c'e' un controllo unico per il mescolamento",
  ven.indexOf('_carrelloRetrodatato') > -1 || ven.indexOf('_vietaMescolanza') > -1);
check('aggiungere merce con un incasso retrodatato in carrello viene fermato',
  /_aggiungiAlCarrello[\s\S]{0,700}(_carrelloRetrodatato|_vietaMescolanza)/.test(ven));
// Anche l'"Aggiungi manuale", che spinge nel carrello per conto suo:
// senza la guardia si infilava una riga di oggi in una vendita
// retrodatata.
check('e anche la via Aggiungi manuale e protetta',
  ven.indexOf('retroMan') > -1 && /retroMan[\s\S]{0,200}warning/.test(ven));
// La guardia in questa direzione e' diversa: non serve sapere se il
// carrello e' retrodatato, basta che NON sia vuoto.
check('e aggiungere un incasso retrodatato su un carrello con merce pure',
  /dataInc !== oggi && _carrello\.length/.test(ven));
check('e lo dice, invece di fallire in silenzio',
  /(_carrelloRetrodatato|_vietaMescolanza)[\s\S]{0,900}(warning|toast)/.test(ven));

console.log('\n--- la vendita viene salvata con quella data ---');
check("c'e' una funzione sola che decide la data della vendita",
  ven.indexOf('function _dataVendita') > -1);
var dv = (/function _dataVendita\(\)[\s\S]*?\n    \}/.exec(ven) || [''])[0];
check('per default oggi', dv.indexOf('oggiISO()') > -1);
// _dataVendita delega al controllo unico invece di rifare il giro
// del carrello per conto suo.
check('ma usa quella della riga se c e',
  dv.indexOf('_carrelloRetrodatato()') > -1);
var cv = (/async function _completaVendita\([\s\S]*?var dettagli =/.exec(ven) || [''])[0];
check('la vendita prende la data da quella funzione', cv.indexOf('_dataVendita()') > -1);
check("e non scrive piu' oggi a mano", cv.indexOf('data: ENI.UI.oggiISO()') === -1);

console.log('\n--- la versione ---');
// Il nome del file va dentro il controllo: senza, la versione di un
// altro script faceva passare questo per sbaglio.
var vVen = (/js[/]modules[/]vendita[.]js[?]v=(\d+)/.exec(html) || ['', '0'])[1];
check('vendita.js ha una versione nuova', Number(vVen) >= 14, 'v=' + vVen);

console.log('\n' + pass + ' passati, ' + fail + ' falliti');
process.exit(fail === 0 ? 0 : 1);
