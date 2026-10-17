// Eseguire con: node test/test-turni-pdf.js
//
// Il PDF dei turni usciva con le celle dei giorni NERE: si leggeva solo
// "Dipendente" su grigio, e Lun-Sab erano sei rettangoli neri.
//
// Causa, letta negli operatori che jsPDF scrive nel flusso della pagina:
//
//     0.9 g          <- setFillColor(230,230,230)
//     ... re  f      <- cella "Dipendente": grigia
//     0 g            <- doc.text() RIMETTE IL NERO
//     ... re  f      <- cella "Lun": nera
//     0 g
//     ... re  f      <- cella "Mar": nera
//
// In PDF i glifi si dipingono col colore di RIEMPIMENTO, quindi ogni
// doc.text() emette "0 g" e si porta via il grigio impostato prima. Chi
// riempie un rettangolo dopo aver scritto del testo eredita il nero.
//
// Per questo il PDF delle fatture non aveva il difetto: la' c'e' un solo
// rettangolo pieno per intestazione, e il colore viene rimesso ogni volta.
//
// La regola difesa qui: ogni rect(..., 'F') deve avere un setFillColor
// vicino sopra. Vale per tutti i PDF, non solo per i turni.
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

console.log('\n--- ogni rettangolo pieno si porta il suo colore ---');
// Il colore va rimesso perche' non si puo' sapere, leggendo una riga sola,
// se nel frattempo e' passato un doc.text(). Due righe di margine bastano
// per lo stile "setFillColor(...); rect(...)" sulla stessa riga o su quella
// appena sopra.
var FINESTRA = 2;
var trovati = 0, colpevoli = [];

tuttiIFile(P + 'js').forEach(function(f) {
  var righe = fs.readFileSync(f, 'utf8').split(/\r?\n/);
  righe.forEach(function(riga, i) {
    if (!/\.rect\([^)]*['"](F|FD|DF)['"]\s*\)/.test(riga)) return;
    trovati++;
    var finestra = righe.slice(Math.max(0, i - FINESTRA), i + 1).join('\n');
    if (!/setFillColor\s*\(/.test(finestra)) {
      colpevoli.push(path.relative(P, f).split(path.sep).join('/') + ':' + (i + 1));
    }
  });
});

check('ci sono rettangoli pieni da controllare', trovati > 0, trovati + ' trovati');
check('nessuno riempie col colore lasciato da un altro',
  colpevoli.length === 0, colpevoli.join(', '));

console.log('\n--- e in particolare l intestazione dei turni ---');
var turni = fs.readFileSync(P + 'js/modules/turni.js', 'utf8');

// Una funzione sola che imposta il colore E riempie: cosi' non esiste un
// percorso in cui si riempie senza averlo rimesso. Era proprio quello il
// difetto - il colore stava fuori dal ciclo, la rect dentro.
var cella = (turni.match(/function cellaPiena\([\s\S]*?\n            \}/) || [''])[0];
check('c e una funzione sola che disegna le celle piene', cella.length > 0);
check('imposta il grigio ogni volta che viene chiamata',
  /setFillColor\(\s*GRIGIO\[0\]/.test(cella));
check('e lo imposta PRIMA di riempire',
  cella.indexOf('setFillColor') > -1 &&
  cella.indexOf('setFillColor') < cella.indexOf('.rect'));

var header = (turni.match(/function header\(\)[\s\S]*?\n            \}/) || [''])[0];
check('la funzione header c e', header.length > 0);
check('header non riempie piu rettangoli da sola', !/\.rect\(/.test(header));
check('li fa fare tutti a cellaPiena',
  (header.match(/cellaPiena\(/g) || []).length === 2);   // Dipendente + il ciclo

// Il ciclo dei sei giorni deve passare dalla funzione, non tornare a
// chiamare rect per conto suo.
var ciclo = (header.match(/for \(var i = 0; i < N_GIORNI; i\+\+\) \{[\s\S]*?\n                \}/) || [''])[0];
check('il ciclo dei giorni c e', ciclo.length > 0);
check('e disegna con cellaPiena', /cellaPiena\(/.test(ciclo) && !/\.rect\(/.test(ciclo));

// Le celle del corpo invece NON vanno riempite: restano solo contornate,
// altrimenti il grigio coprirebbe gli orari.
var corpo = (turni.match(/_personale\.forEach\(function\(p\) \{[\s\S]*?y \+= rowH;/) || [''])[0];
check('le celle degli orari restano solo contornate, non piene',
  corpo.length > 0 && !/\.rect\([^)]*'F'/.test(corpo));

console.log('\n' + pass + ' passati, ' + fail + ' falliti');
process.exit(fail === 0 ? 0 : 1);
