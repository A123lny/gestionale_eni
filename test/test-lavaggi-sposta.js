// Eseguire con: node test/test-lavaggi-sposta.js
//
// Spostare un lavaggio in un'altra data, chiesto il 21/10/2026, con una
// decisione precisa del gestore: "quelli completati non ha senso, solo
// per i lavaggi prenotati".
//
// La ragione sta nei dati, non nell'interfaccia: i soldi di un lavaggio
// NON stanno sul lavaggio. Quando lo si incassa nasce una riga in
// `vendite` con la SUA data, e la cassa prende il totale Lavaggi dalle
// vendite di quel giorno - non da `lavaggi.data`. Spostando un lavaggio
// gia' incassato, il lavaggio si muove nel calendario ma l'incasso resta
// sul giorno di prima: lavaggio e soldi su due giorni diversi.
//
// Due regole difese qui:
//
//  1. il pulsante Sposta compare SOLO sui Prenotato;
//  2. anche il modulo Modifica, che il campo data lo aveva sempre avuto
//     e lasciava spostare un completato IN SILENZIO, ora su un completato
//     lo blocca.
const fs = require('fs');
const P = 'C:/Users/Utente1/Documents/gestionale_eni/';

let pass = 0, fail = 0;
function check(nome, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + nome); }
  else { fail++; console.log('  FAIL ' + nome + (extra !== undefined ? ' -> ' + extra : '')); }
}

var lav = fs.readFileSync(P + 'js/modules/lavaggi.js', 'utf8');
var html = fs.readFileSync(P + 'index.html', 'utf8');

console.log('\n--- il pulsante Sposta ---');
var azioni = (/function _azioniHtml\(l\)[\s\S]*?\n    \}/.exec(lav) || [''])[0];
check('la funzione delle azioni c e', azioni.length > 0);
check('esiste un pulsante Sposta', azioni.indexOf('data-sposta-id') > -1);

// Il punto della decisione: il pulsante sta nel ramo dei prenotati e in
// nessun altro. Si verifica tagliando la funzione sui due rami.
var iPren = azioni.indexOf('isPrenotato');
var iCompl = azioni.indexOf("l.stato === 'Completato'");
check('i due rami ci sono', iPren > -1 && iCompl > iPren);
var ramoPrenotato = azioni.slice(iPren, iCompl);
var ramoCompletato = azioni.slice(iCompl);
check('Sposta e nel ramo dei prenotati', ramoPrenotato.indexOf('data-sposta-id') > -1);
check('e NON in quello dei completati', ramoCompletato.indexOf('data-sposta-id') === -1);

console.log('\n--- il clic e collegato ---');
check('c e il delegato per Sposta', /delegate\([^)]*'\[data-sposta-id\]'/.test(lav));
check('e chiama la sua funzione', lav.indexOf('_showSpostaLavaggio') > -1);

console.log('\n--- il riquadro chiede solo quello che serve ---');
var fn = (/function _showSpostaLavaggio\(id\)[\s\S]*?\n    \}\n/.exec(lav) || [''])[0];
check('la funzione c e', fn.length > 0);
check('chiede la nuova data', fn.indexOf('spo-data') > -1);
check('e la fascia orraria, che cambiando giorno cambia pure',
  fn.indexOf('spo-inizio') > -1 && fn.indexOf('spo-fine') > -1);
check('mostra cosa si sta spostando', fn.indexOf('codice') > -1);
// Non deve richiedere di nuovo i dati che non c'entrano: era il motivo
// per cui spostare dal modulo Modifica era una trafila.
check('non richiede veicolo, cellulare, tipo o prezzo',
  fn.indexOf('spo-veicolo') === -1 && fn.indexOf('spo-prezzo') === -1 &&
  fn.indexOf('spo-tipo') === -1 && fn.indexOf('spo-cellulare') === -1);

console.log('\n--- e si rifiuta di spostare un completato ---');
// Difesa anche nel codice, non solo nascondendo il pulsante: la lista si
// puo' ridisegnare e un id vecchio potrebbe arrivare comunque.
check("controlla lo stato prima di spostare", /_showSpostaLavaggio[\s\S]{0,900}stato !== 'Prenotato'/.test(lav));
check('e lo dice invece di fallire in silenzio',
  /stato !== 'Prenotato'[\s\S]{0,300}(warning|toast|error)/.test(lav));

console.log('\n--- salva solo i campi dello spostamento ---');
// Si guarda dentro il corpo della funzione, non con una finestra a
// caratteri: cresce il codice e la finestra non ci arriva piu'.
check('scrive la data', fn.indexOf('data: nuovaData') > -1);
check('e gli orari',
  fn.indexOf('orario_inizio: inizio') > -1 && fn.indexOf('orario_fine: fine') > -1);
check('passando da modificaLavaggio, che scrive nel registro',
  fn.indexOf('ENI.API.modificaLavaggio') > -1);
// Il campo data del modulo Modifica c'e' da sempre e su un completato
// lasciava spostare senza dire niente. Ora su un completato e' bloccato.
var mod = (/async function _showModificaLavaggio\(id\)[\s\S]*?\n    \}\n/.exec(lav) || [''])[0];
check('il modulo Modifica c e', mod.length > 0);
check('il campo data viene disabilitato su un completato',
  /mod-data[^>]*disabled|disabled[^>]*mod-data|_bloccaData|dataBloccata/.test(mod));
check('e con una spiegazione, non muto',
  mod.indexOf("l'incasso") > -1 || mod.indexOf('incasso resta') > -1);
// E al salvataggio la data non deve partire comunque.
check('al salvataggio la data di un completato non viene toccata',
  /data:\s*[^,]*(Prenotato|dataBloccata|lavaggio\.data)/.test(mod));

console.log('\n--- la versione ---');
check('lavaggi.js ha una versione nuova', /js\/modules\/lavaggi\.js\?v=2[3-9]/.test(html));

console.log('\n' + pass + ' passati, ' + fail + ' falliti');
process.exit(fail === 0 ? 0 : 1);
