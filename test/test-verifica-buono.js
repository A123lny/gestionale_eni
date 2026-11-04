// Eseguire con: node test/test-verifica-buono.js
//
// Schermata per il dipendente: inquadra il codice di un buono cartaceo e legge
// se e' valido. Prima di questa, un operatore al banco NON aveva un posto dove
// guardare un buono:
//
//   - in Buoni > Gestione la lista si mostra solo dopo aver scelto un cliente,
//     e la ricerca per codice cerca solo dentro i buoni di quel cliente: con un
//     tagliando in mano e un cliente sconosciuto, non lo trovava;
//   - in Vendite lo scanner riconosce i buoni, ma col carrello pieno non
//     verifica niente: fa partire il pagamento e CREA UNA VENDITA.
//
// Quella seconda cosa e' esattamente la preoccupazione del gestore: i buoni
// sono prepagati, e una vendita registrata quando il buono torna conterebbe la
// merce una seconda volta sopra a quello che lei scrive a mano in cassa.
//
// Per questo il controllo piu' importante di questo file e' uno solo:
//
//     questa schermata NON SCRIVE NIENTE.
//
// Nessuna vendita, nessun campo di cassa, nemmeno il buono stesso: legge e
// mostra. Se un domani qualcuno ci aggiunge una scrittura, qui si accende.
const fs = require('fs');
const P = 'C:/Users/Utente1/Documents/gestionale_eni/';

let pass = 0, fail = 0;
function check(nome, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + nome); }
  else { fail++; console.log('  FAIL ' + nome + (extra !== undefined ? ' -> ' + extra : '')); }
}

function leggi(rel) { return fs.readFileSync(P + rel, 'utf8'); }

var MOD = 'js/modules/verifica-buono.js';
console.log('\n--- il modulo esiste ---');
check('il file c\u2019e\u2019', fs.existsSync(P + MOD));
if (!fs.existsSync(P + MOD)) {
  console.log('\n' + pass + ' passati, ' + fail + ' falliti');
  process.exit(1);
}
var m = leggi(MOD);

console.log('\n--- NON SCRIVE NIENTE: il patto di questa schermata ---');
// Le funzioni che scrivono, in questa applicazione, hanno nomi riconoscibili.
var scritture = ['ENI.API.insert', 'ENI.API.update', 'ENI.API.remove',
                 'salvaVendita', 'salvaCassa', 'salvaBozzaCassa',
                 'disabilitaBuonoByEAN', 'utilizzaBuono', 'annullaBuono',
                 'movimentaGiacenza', 'insertBulk'];
scritture.forEach(function(nome) {
  check('non chiama ' + nome, m.indexOf(nome) === -1);
});
check('non parla direttamente al database', m.indexOf('getClient') === -1 && m.indexOf('.from(') === -1);
check('l\u2019unica chiamata al server e\u2019 la lettura del buono',
  (m.match(/ENI\.API\.[a-zA-Z]+/g) || [])
    .filter(function(c) { return c !== 'ENI.API.cercaBuonoByEAN'; })
    .length === 0,
  (m.match(/ENI\.API\.[a-zA-Z]+/g) || []).join(', '));

console.log('\n--- i quattro esiti ---');
check('buono valido lo dice a lettere grandi', /BUONO VALIDO/.test(m));
check('e mostra il taglio', /formatValuta/.test(m));
check('gia\u2019 utilizzato: codice non valido', /CODICE NON VALIDO/.test(m));
check('e con la data di quando fu usato',
  /utilizzato_at/.test(m) && /utilizzato il/.test(m));
check('annullato ha un messaggio suo', /annullato/i.test(m));
check('codice sconosciuto ha un messaggio suo',
  /non trovato|non \u00e8 un buono|non e\u2019 un buono/i.test(m));

// La riga "Intestato a" dipende da un campo che la lettura deve portare: con
// un select('*') secco il nome del cliente non arriva e quella riga non
// comparirebbe mai, restando codice morto che sembra una funzione.
var cerca = (leggi('js/api.js').match(/async function cercaBuonoByEAN[\s\S]*?\n    \}/) || [''])[0];
check('la lettura del buono porta anche il nome del cliente',
  /clienti\(nome_ragione_sociale\)/.test(cerca));
check('e la schermata lo mostra quando c’e’',
  /clienti[\s\S]{0,80}nome_ragione_sociale/.test(m) && /Intestato a/.test(m));

console.log('\n--- la fotocamera ---');
check('usa lo stesso lettore della timbratura', /Html5Qrcode/.test(m));
check('fotocamera posteriore', /facingMode: 'environment'/.test(m));
// Un codice a barre EAN-13 e' largo e basso: con il riquadro quadrato del QR
// si fatica a inquadrarlo. Vendite usa 280x120, qui lo stesso.
check('riquadro largo, da codice a barre e non da QR',
  /qrbox:\s*\{\s*width:\s*\d{3},\s*height:\s*1\d{2}/.test(m));
check('si puo\u2019 chiudere', /stop\(\)/.test(m));
// Senza questo, chi esce dalla pagina si porta via la fotocamera accesa.
check('la fotocamera si spegne anche uscendo dalla pagina',
  /hashchange/.test(m));

console.log('\n--- senza fotocamera si batte il codice ---');
check('c\u2019e\u2019 il campo per il codice', /id="vb-ean"/.test(m));
check('Invio conferma (vale anche per un lettore a pistola)', /'Enter'/.test(m));
check('e un pulsante per verificare', /id="btn-vb-verifica"/.test(m));
check('si puo\u2019 verificare un altro buono', /id="btn-vb-altro"/.test(m));

console.log('\n--- aggancio all\u2019applicazione ---');
var router = leggi('js/router.js');
check('la rotta esiste', /'verifica-buono':\s*\{\s*module:\s*'VerificaBuono'/.test(router));
// Il router cerca il modulo in ENI.Modules[nome]: registrarlo su ENI non
// basta, la pagina resterebbe sullo spinner. Il controllo guarda lo stesso
// posto in cui guarda il router, non un nome somigliante.
var nomeRotta = (router.match(/'verifica-buono':\s*\{\s*module:\s*'([A-Za-z]+)'/) || [])[1];
check('si registra in ENI.Modules, dove il router lo cerca',
  !!nomeRotta && new RegExp('ENI\\.Modules\\.' + nomeRotta + '\\s*=').test(m), nomeRotta);
check('ed espone render(container)', /return \{ render: render \}/.test(m));

var cfg = leggi('js/config.js');
var admin = (cfg.match(/Admin:\s*\{[\s\S]*?\n        \},/) || [''])[0];
var cass = (cfg.match(/Cassiere:\s*\{[\s\S]*?\n        \},/) || [''])[0];
check('l\u2019Admin la vede', admin.indexOf("'verifica-buono'") > -1);
check('il Cassiere la vede', cass.indexOf("'verifica-buono'") > -1);
// Non sta tra i permessi di scrittura perche' non scrive: se un domani
// qualcuno ce la mette, vuol dire che qualcosa e' cambiato di natura.
function soloLettura(blocco) {
  var scr = (blocco.match(/scrivere:\s*\[[^\]]*\]/) || [''])[0];
  return scr.indexOf("'verifica-buono'") === -1;
}
check('non ha permessi di scrittura per l\u2019Admin', soloLettura(admin));
check('ne\u2019 per il Cassiere', soloLettura(cass));
check('c\u2019e\u2019 la voce di menu', /id: 'verifica-buono', label:/.test(cfg));

console.log('\n--- il pulsante Disabilita resta solo al gestore ---');
// Lei ha detto: "poi io il giorno dopo vado a disabilitarlo". Il Cassiere ha il
// permesso di scrittura sui buoni, quindi senza questo controllo vedrebbe il
// pulsante.
var buoni = leggi('js/modules/buoni.js');
check('il pulsante compare solo per l\u2019Admin',
  /Admin[\s\S]{0,400}btn-disabilita-buono/.test(buoni) ||
  /btn-disabilita-buono[\s\S]{0,200}:\s*''/.test(buoni));
check('e il ruolo si legge da State', /getUserRole/.test(buoni));

console.log('\n--- index.html ---');
var html = leggi('index.html');
check('il file viene caricato', /js\/modules\/verifica-buono\.js\?v=\d+/.test(html));
var vb = html.match(/js\/modules\/buoni\.js\?v=(\d+)/);
check('buoni.js ha una versione nuova (>= 14)', !!vb && parseInt(vb[1], 10) >= 14, vb ? vb[1] : '?');
var vr = html.match(/js\/router\.js\?v=(\d+)/);
check('router.js ha una versione nuova (>= 20)', !!vr && parseInt(vr[1], 10) >= 20, vr ? vr[1] : '?');
var vc = html.match(/js\/config\.js\?v=(\d+)/);
check('config.js ha una versione nuova (>= 32)', !!vc && parseInt(vc[1], 10) >= 32, vc ? vc[1] : '?');

console.log('\n' + pass + ' passati, ' + fail + ' falliti');
process.exit(fail === 0 ? 0 : 1);
