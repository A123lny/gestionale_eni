// Eseguire con: node test/test-toast-sopra-tutto.js
//
// "L'errore non si legge, deve apparire sopra header e non sotto",
// segnalato tre volte il 21/10/2026.
//
// Due cause, entrambe vere:
//
//  1. .toast-danger non esisteva nel CSS: l'avviso nasceva senza sfondo
//     e la scritta finiva trasparente sopra l'header. Difeso in
//     test-toast-tipi.js.
//
//  2. QUESTO file: il contenitore dei toast stava a z-index 600, ma nel
//     CSS ci sono elementi a 1000 (menu a tendina della ricerca,
//     tooltip) e 1001 (la punta del tooltip). Un avviso puo' finire
//     dietro a uno di quelli.
//
// La regola difesa qui: il toast e' l'ultimo strato: --z-toast deve
// essere piu' alto di OGNI z-index scritto a mano nei fogli di stile. Se
// domani qualcuno aggiunge un pannello a 3000, questo test si accende.
const fs = require('fs');
const P = 'C:/Users/Utente1/Documents/gestionale_eni/';

let pass = 0, fail = 0;
function check(nome, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + nome); }
  else { fail++; console.log('  FAIL ' + nome + (extra !== undefined ? ' -> ' + extra : '')); }
}

var fogli = fs.readdirSync(P + 'css').filter(function(f) { return f.endsWith('.css'); });
var css = fogli.map(function(f) { return fs.readFileSync(P + 'css/' + f, 'utf8'); }).join('\n');

console.log('\n--- i livelli dichiarati ---');
var livelli = {};
var reVar = /--z-([a-z-]+)\s*:\s*(\d+)/g, m;
while ((m = reVar.exec(css)) !== null) livelli[m[1]] = Number(m[2]);
check('i livelli sono dichiarati come variabili', Object.keys(livelli).length > 0,
  Object.keys(livelli).map(function(k) { return k + '=' + livelli[k]; }).join(' '));
check('il toast ha il suo livello', typeof livelli['toast'] === 'number',
  'trovato: ' + livelli['toast']);

console.log('\n--- il toast deve stare sopra ogni altro livello dichiarato ---');
Object.keys(livelli).forEach(function(k) {
  if (k === 'toast') return;
  check('toast (' + livelli['toast'] + ') sopra ' + k + ' (' + livelli[k] + ')',
    livelli['toast'] > livelli[k]);
});

console.log('\n--- e sopra ogni z-index scritto a mano ---');
// Questi sono quelli che sfuggono alle variabili: numeri messi
// direttamente nella regola. Sono loro che hanno causato il difetto.
var aMano = [];
var reNum = /z-index\s*:\s*(\d+)/g;
while ((m = reNum.exec(css)) !== null) aMano.push(Number(m[1]));
var massimo = aMano.length ? Math.max.apply(null, aMano) : 0;
check('ci sono z-index scritti a mano da controllare', aMano.length > 0,
  aMano.length + ' trovati, il piu alto e ' + massimo);
check('il toast sta sopra il piu alto di tutti',
  livelli['toast'] > massimo,
  'toast=' + livelli['toast'] + ' contro ' + massimo);

console.log('\n--- e il contenitore lo usa davvero ---');
var blocco = (/\.toast-container\s*\{[^}]*\}/.exec(css) || [''])[0];
check('.toast-container c e', blocco.length > 0);
check('resta agganciato allo schermo, non scorre con la pagina',
  /position\s*:\s*fixed/.test(blocco));
check('e usa la variabile, non un numero suo',
  /z-index\s*:\s*var\(--z-toast\)/.test(blocco));

console.log('\n--- un avviso si deve poter chiudere ---');
// Se resta fermo sopra l'header, deve almeno togliersi di mezzo con un
// clic: altrimenti copre i comandi finche non scade.
var ui = fs.readFileSync(P + 'js/ui.js', 'utf8');
check('il toast si chiude con un clic', /toastEl\.addEventListener\('click'/.test(ui));
check('e ha il cursore che lo fa capire', /cursor\s*:\s*pointer/.test(blocco) ||
  /\.toast\s*\{[^}]*cursor\s*:\s*pointer/.test(css));

console.log('\n' + pass + ' passati, ' + fail + ' falliti');
process.exit(fail === 0 ? 0 : 1);
