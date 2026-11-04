// Eseguire con: node test/test-buoni-ascoltatori-doppi.js
//
// Sintomo riferito dal gestore: aprendo "Disabilita buono" lo sfondo era
// NERISSIMO e bisognava premere la X "almeno sei volte" per chiudere, e a ogni
// clic la pagina si schiariva un po'.
//
// Non era la finestra che non si chiudeva: erano SEI FINESTRE una sopra
// l'altra. Ogni sfondo e' semi-trasparente, quindi sei sovrapposti fanno il
// nero, e ogni X ne tolse uno - da cui lo schiarirsi progressivo. Il sintomo
// descriveva la causa con precisione: il clic era agganciato sei volte.
//
// Perche'. I contenitori di quella pagina vivono una volta sola:
//
//   #main-content   lo crea il router, e resta anche cambiando pagina
//   #buoni-content  lo crea render(), e resta cambiando scheda
//
// A ogni render si riscrive il loro INTERNO (innerHTML), ma loro no - e gli
// ascoltatori agganciati a loro sopravvivono, perche' stanno sull'elemento, non
// sui figli. Le quattro funzioni _setupXEvents li riagganciavano a ogni render,
// sommandoli: sei visite alla scheda Gestione, sei ascoltatori, e un clic che
// chiamava sei volte la stessa cosa.
//
// Il difetto c'era da prima: faceva aprire sei finestre di conferma anche sull'
// Annulla di un buono, e ricaricare sei volte la lista a ogni filtro. Nessuno
// l'aveva notato perche' finestre di conferma identiche sovrapposte sembrano
// una sola, e una lista caricata sei volte sembra solo lenta.
const fs = require('fs');
const P = 'C:/Users/Utente1/Documents/gestionale_eni/';

let pass = 0, fail = 0;
function check(nome, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + nome); }
  else { fail++; console.log('  FAIL ' + nome + (extra !== undefined ? ' -> ' + extra : '')); }
}

var buoni = fs.readFileSync(P + 'js/modules/buoni.js', 'utf8');

console.log('\n--- non si aggancia piu\u2019 a mano ---');
// La forma vecchia, quella che sommava.
var nude = (buoni.match(/container\.addEventListener\('click'/g) || []).length;
check('nessun click agganciato direttamente al contenitore', nude === 0, nude + ' punti');

var helper = (buoni.match(/function _agganciaUnaVolta[\s\S]*?\n    \}/) || [''])[0];
check('esiste la funzione che aggancia una volta sola', helper.length > 0);

console.log('\n--- la funzione fa quello che dice ---');
if (helper) {
  // eval su codice NOSTRO, estratto dal file del progetto: provare la funzione
  // vera e' il punto, invece di riscriverne la regola qui e controllare la
  // copia. Nessun dato esterno entra.
  var aggancia = eval('(' + helper + ')');

  function finto() {
    return {
      dataset: {},
      agganci: [],
      addEventListener: function(ev, fn) { this.agganci.push(ev); }
    };
  }

  var el = finto();
  var h = function() {};
  aggancia(el, 'provaUno', 'click', h);
  check('al primo giro aggancia', el.agganci.length === 1, el.agganci.length);

  aggancia(el, 'provaUno', 'click', h);
  aggancia(el, 'provaUno', 'click', h);
  aggancia(el, 'provaUno', 'click', h);
  aggancia(el, 'provaUno', 'click', h);
  aggancia(el, 'provaUno', 'click', h);
  check('ai cinque giri dopo NON riaggancia (era il difetto)',
    el.agganci.length === 1, el.agganci.length + ' ascoltatori');

  // Tre schede diverse condividono #buoni-content: se usassero la stessa
  // chiave, solo la prima visitata avrebbe il suo ascoltatore e le altre due
  // resterebbero morte.
  aggancia(el, 'provaDue', 'click', h);
  check('una chiave diversa sullo stesso elemento aggancia davvero',
    el.agganci.length === 2, el.agganci.length);

  var altro = finto();
  aggancia(altro, 'provaUno', 'click', h);
  check('un elemento diverso ha la sua vita', altro.agganci.length === 1);

  var esplode = false;
  try { aggancia(null, 'provaUno', 'click', h); } catch (e) { esplode = true; }
  check('un contenitore che non c\u2019e\u2019 non fa saltare niente', !esplode);
}

console.log('\n--- tutte e quattro le schede ci passano ---');
var chiavi = (buoni.match(/_agganciaUnaVolta\(container,\s*'([a-zA-Z]+)'/g) || [])
  .map(function(s) { return s.replace(/.*'([a-zA-Z]+)'.*/, '$1'); });
check('quattro agganci, uno per scheda', chiavi.length === 4, chiavi.join(', '));
check('con chiavi tutte diverse',
  new Set(chiavi).size === chiavi.length, chiavi.join(', '));

['_setupTabEvents', '_setupGestioneEvents', '_setupClientiEvents', '_setupPrenotazioniEvents']
  .forEach(function(nome) {
    var fn = (buoni.match(new RegExp('function ' + nome + '[\\s\\S]*?\\n    \\}')) || [''])[0];
    check(nome + ' usa l\u2019aggancio protetto',
      fn.indexOf('_agganciaUnaVolta') > -1);
  });

console.log('\n--- quello che invece DEVE riagganciarsi ogni volta ---');
// I campi di ricerca sono elementi NUOVI a ogni render, perche' innerHTML li
// ricrea: il loro ascoltatore muore con il vecchio elemento e va rimesso. Se
// finissero dentro la protezione, la ricerca smetterebbe di funzionare dal
// secondo ingresso nella scheda.
[['_setupGestioneEvents', '#buoni-search-ean'],
 ['_setupClientiEvents', '#clienti-portale-search']].forEach(function(coppia) {
  var nome = coppia[0], sel = coppia[1];
  var fn = (buoni.match(new RegExp('function ' + nome + '[\\s\\S]*?\\n    \\}')) || [''])[0];
  check(nome + ' prende il campo ' + sel, fn.indexOf(sel) > -1);
  var i = fn.indexOf("addEventListener('input'");
  check(nome + ': il campo ha il suo ascoltatore', i > -1);
  if (i > -1) {
    // Guardo la riga che lo aggancia, non un intorno generico: deve essere un
    // addEventListener diretto sull'elemento appena ricreato.
    var prima = fn.slice(Math.max(0, i - 120), i);
    check(nome + ': agganciato ogni volta, fuori dalla protezione',
      prima.indexOf('_agganciaUnaVolta') === -1, prima.trim().slice(-60));
  }
});

console.log('\n--- la versione ---');
var html = fs.readFileSync(P + 'index.html', 'utf8');
var v = html.match(/js\/modules\/buoni\.js\?v=(\d+)/);
check('buoni.js ha una versione nuova (>= 16)', !!v && parseInt(v[1], 10) >= 16, v ? v[1] : '?');

console.log('\n' + pass + ' passati, ' + fail + ' falliti');
process.exit(fail === 0 ? 0 : 1);
