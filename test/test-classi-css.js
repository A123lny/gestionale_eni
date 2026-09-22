// Eseguire con: node test/test-classi-css.js
//
// Classi CSS fantasma: nome scritto nel JS, regola inesistente nel foglio di
// stile. L'elemento nasce senza aspetto e il difetto non si vede leggendo il
// codice, solo aprendo la pagina - e spesso lo trova l'utente.
//
// E' gia' successo due volte:
//   - .btn.active         il pulsante scelto (Contanti/POS) non cambiava aspetto
//   - .pos-search-results il riquadro dei clienti nella fattura manuale era
//                         trasparente, senza bordo e senza altezza massima:
//                         copriva la pagina e non si leggeva
//
// Qui si controlla la famiglia dei menu a tendina di ricerca, dove il danno e'
// peggiore perche' sono sovrapposti al resto della pagina.
const fs = require('fs');
const path = require('path');
const P = 'C:/Users/Utente1/Documents/gestionale_eni/';

let pass = 0, fail = 0;
function check(nome, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + nome); }
  else { fail++; console.log('  FAIL ' + nome + (extra !== undefined ? ' -> ' + extra : '')); }
}

function tuttiIFile(dir, ext, acc) {
  acc = acc || [];
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function(e) {
    var full = path.join(dir, e.name);
    if (e.isDirectory()) tuttiIFile(full, ext, acc);
    else if (e.name.endsWith(ext)) acc.push(full);
  });
  return acc;
}

var css = tuttiIFile(P + 'css', '.css').map(function(f) { return fs.readFileSync(f, 'utf8'); }).join('\n');
var jsFiles = tuttiIFile(P + 'js', '.js');

console.log('\n--- menu a tendina di ricerca: la classe esiste davvero? ---');

// Ogni classe "pos-search-*" nominata nel JS deve avere una regola nel CSS.
// I commenti vanno tolti prima di cercare: un nome di classe CITATO in un
// commento (per spiegare perche' non si usa piu') non e' un uso. Il "non
// preceduto da due punti" evita di scambiare per commento le barre di
// "https://".
function senzaCommenti(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

var usate = {};
jsFiles.forEach(function(f) {
  var src = senzaCommenti(fs.readFileSync(f, 'utf8'));
  (src.match(/pos-search-[a-z-]+/g) || []).forEach(function(cls) {
    (usate[cls] = usate[cls] || []).push(path.relative(P, f).replace(/\\/g, '/'));
  });
});

var nomi = Object.keys(usate).sort();
check('qualche classe pos-search-* e usata nel JS', nomi.length > 0, nomi.length + ' trovate');

nomi.forEach(function(cls) {
  var regola = new RegExp('\\.' + cls + '[\\s,:{]');
  check('.' + cls + ' ha una regola nel CSS',
    regola.test(css), 'usata in ' + usate[cls].join(', '));
});

console.log('\n--- il riquadro dei clienti della fattura manuale ---');
var manuale = senzaCommenti(fs.readFileSync(P + 'js/modules/fatturazione/manuale.js', 'utf8'));
check('usa la classe vera del menu a tendina',
  /id="fatt-m-cerca-results"[^>]*class="pos-search-dropdown"/.test(manuale));
check('non usa piu la classe fantasma',
  !/pos-search-results/.test(manuale));
// La classe porta gia' posizione, z-index e larghezza: ripeterli inline li
// farebbe litigare (z-index 10 contro 1000, e "width:100%" contro left/right).
check('non ripete inline quello che la classe fa gia meglio',
  !/id="fatt-m-cerca-results"[^>]*z-index/.test(manuale));

console.log('\n--- e la classe fa quello che serve ---');
var blocco = (css.match(/\.pos-search-dropdown\s*\{[^}]*\}/) || [''])[0];
check('ha uno sfondo, o si vedrebbe la pagina sotto', /background/.test(blocco));
check('ha un limite di altezza, o copre la pagina', /max-height/.test(blocco));
check('e scorre quando i clienti sono tanti', /overflow-y\s*:\s*auto/.test(blocco));
check('sta sopra al resto', /z-index/.test(blocco));

console.log('\n--- gruppi di campi: fieldset e legend ---');
// Stessa famiglia di difetto, senza classi di mezzo: il reset globale azzera
// il padding di OGNI elemento (*, ::before, ::after), fieldset compreso.
// Restava il bordo predefinito del browser ma senza spazio dentro, e il testo
// finiva addosso alla cornice - "i contorni tagliano le scritte".
var usaFieldset = jsFiles.some(function(f) {
  return /<fieldset/.test(senzaCommenti(fs.readFileSync(f, 'utf8')));
});
check('qualche schermata usa i fieldset', usaFieldset);

var regolaFieldset = (css.match(/(^|\})\s*fieldset\s*\{[^}]*\}/m) || [''])[0];
var regolaLegend = (css.match(/(^|\})\s*legend\s*\{[^}]*\}/m) || [''])[0];

check('fieldset ha una regola nel CSS', regolaFieldset.length > 0);
check("e rimette l'imbottitura che il reset globale gli toglie",
  /padding/.test(regolaFieldset));
check('e un bordo scelto, non quello scavato del browser',
  /border/.test(regolaFieldset));
check('legend ha una regola nel CSS', regolaLegend.length > 0);
check("e un po' di respiro ai lati del testo, o tocca la cornice",
  /padding/.test(regolaLegend));

// Il reset e' la causa: se un giorno sparisse, questi controlli non
// servirebbero piu' - ma finche' c'e', servono.
check('il reset globale azzera davvero il padding di tutto',
  /\*,\s*\n\s*\*::before,\s*\n\s*\*::after\s*\{[^}]*padding:\s*0/.test(css));

console.log('\n' + pass + ' passati, ' + fail + ' falliti');
process.exit(fail === 0 ? 0 : 1);
