// Eseguire con: node test/test-toast-tipi.js
//
// Un avviso che non si vede e' peggio di nessun avviso: l'utente clicca
// Salva, qualcosa lampeggia e non si capisce cosa. Segnalato il 21/10/2026
// sulla fattura manuale -- "da un errore, ma non riesco a leggere poiche'
// si nasconde sotto header".
//
// Non era nascosto DIETRO l'header (il contenitore dei toast ha z-index
// 600 contro i 300 dell'header): era senza sfondo. Il modulo chiamava
//
//     ENI.UI.toast('Errore: ' + e.message, 'danger')
//
// e nel CSS esistono solo .toast-success, .toast-error, .toast-warning e
// .toast-info. La classe .toast-danger non c'era, quindi niente sfondo,
// niente bordo, niente colore del testo e nessuna icona: scritta
// trasparente sopra l'header. Erano 29 chiamate in tutta l'app, e fra
// quelle anche l'errore vero del salvataggio.
//
// Terza volta che lo stesso difetto morde in questo progetto, dopo
// .btn.active e .pos-search-results: una classe scritta nel JS e mai
// definita nel CSS. test-classi-css.js controllava solo la famiglia
// pos-search-*, quindi non la vedeva.
//
// Qui si difende la regola per i toast: ogni tipo passato a toast() deve
// avere la sua regola nel CSS E la sua icona.
const fs = require('fs');
const path = require('path');
const P = 'C:/Users/Utente1/Documents/gestionale_eni/';

let pass = 0, fail = 0;
function check(nome, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + nome); }
  else { fail++; console.log('  FAIL ' + nome + (extra !== undefined ? ' -> ' + extra : '')); }
}

function tuttiIFile(dir, acc) {
  acc = acc || [];
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function(e) {
    var full = path.join(dir, e.name);
    if (e.isDirectory()) tuttiIFile(full, acc);
    else if (e.name.endsWith('.js')) acc.push(full);
  });
  return acc;
}

var css = tuttiIFile(P + 'css', []).length ? '' : '';
css = fs.readdirSync(P + 'css').filter(function(f) { return f.endsWith('.css'); })
  .map(function(f) { return fs.readFileSync(P + 'css/' + f, 'utf8'); }).join('\n');
var ui = fs.readFileSync(P + 'js/ui.js', 'utf8');

console.log('\n--- quali tipi di avviso chiede il codice ---');
var tipi = {};
tuttiIFile(P + 'js', []).forEach(function(f) {
  var src = fs.readFileSync(f, 'utf8');
  var re = /toast\([^;]*?,\s*'([a-z]+)'\s*\)/g, m;
  while ((m = re.exec(src)) !== null) {
    (tipi[m[1]] = tipi[m[1]] || []).push(path.relative(P, f).split(path.sep).join('/'));
  }
});
var nomi = Object.keys(tipi).sort();
check('qualche tipo e usato', nomi.length > 0, nomi.join(', '));

console.log('\n--- ogni tipo deve essere visibile ---');
// Due vie, basta una: la classe c'e' nel CSS, oppure ui.js riporta il tipo
// a uno conosciuto prima di scriverlo nella classe.
var alias = /var ALIAS[\s\S]{0,300}?\};/.exec(ui);
var aliasTxt = alias ? alias[0] : '';
nomi.forEach(function(t) {
  var inCss = css.indexOf(".toast-" + t) > -1;
  var tradotto = aliasTxt.indexOf("'" + t + "'") > -1;
  check("'" + t + "' si vede (regola CSS o alias in ui.js)",
    inCss || tradotto, tipi[t].length + ' chiamate, es. ' + tipi[t][0]);
});

console.log('\n--- e deve avere la sua icona ---');
var icone = (/var icons = \{[\s\S]*?\};/.exec(ui) || [''])[0];
check('la mappa delle icone c e', icone.length > 0);
nomi.forEach(function(t) {
  var tradotto = aliasTxt.indexOf("'" + t + "'") > -1;
  check("'" + t + "' ha un'icona (o viene tradotto)",
    icone.indexOf(t + ":") > -1 || tradotto);
});

console.log('\n--- la rete di sicurezza: un tipo sconosciuto non diventa invisibile ---');
// Senza questo, il prossimo 'errore'/'alert'/'red' scritto per sbaglio
// ricreerebbe lo stesso difetto in silenzio.
check('ui.js riconduce i tipi sconosciuti a uno visibile',
  /ALIAS\[type\]|TIPI_NOTI|indexOf\(type\)/.test(ui));

console.log('\n--- il caso segnalato ---');
check("'danger' non e piu un avviso trasparente",
  css.indexOf('.toast-danger') > -1 || aliasTxt.indexOf("'danger'") > -1);

console.log('\n' + pass + ' passati, ' + fail + ' falliti');
process.exit(fail === 0 ? 0 : 1);
