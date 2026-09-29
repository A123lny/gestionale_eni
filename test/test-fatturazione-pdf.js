// Eseguire con: node test/test-fatturazione-pdf.js
//
// Decimali sul PDF della fattura.
//
// Il gestionale NON calcola l'importo delle righe: litri, prezzo e importo
// arrivano dall'ENI e vengono solo salvati e stampati. Ma chi legge la fattura
// da' per scontato che litri x prezzo faccia l'importo, e il PDF stampava il
// prezzo con due decimali quando sul database ne ha quattro.
//
// Misurato sui dati veri il 29/09/2026: 225 righe su 387 hanno un prezzo con
// piu' di due decimali, e 222 sul foglio non tornavano - scarto medio 62
// centesimi, punta di 19,84 EUR. Esempio: 454,62 litri a 1,8883 fanno 858,48;
// stampando 1,89 il cliente ricalcola 859,23 e contesta la fattura.
//
// Gli IMPORTI restano a due decimali: quelli sono euro, si stampano cosi'.
const fs = require('fs');
const P = 'C:/Users/Utente1/Documents/gestionale_eni/';

let pass = 0, fail = 0;
function check(nome, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + nome); }
  else { fail++; console.log('  FAIL ' + nome + (extra !== undefined ? ' -> ' + extra : '')); }
}

const src = fs.readFileSync(P + 'js/modules/fatturazione/pdf.js', 'utf8');

console.log('\n--- tre formati diversi, non uno solo ---');
check('esiste un formato dedicato al prezzo unitario', /function _fmtPrezzo/.test(src));
check('esiste un formato dedicato alle quantita', /function _fmtQta/.test(src));
check('resta quello degli importi', /function _fmt\s*\(/.test(src));

// Il prezzo arriva a 4 decimali (numeric(12,4) sul database) ma non deve
// stampare "6,0000" per un lavaggio: minimo 2, massimo 4.
const bloccoPrezzo = (src.match(/function _fmtPrezzo[\s\S]{0,400}?\n    \}/) || [''])[0];
check('il prezzo arriva fino a 4 decimali',
  /maximumFractionDigits:\s*4/.test(bloccoPrezzo), bloccoPrezzo.slice(0, 200));
check('ma non stampa zeri inutili su un prezzo tondo',
  /minimumFractionDigits:\s*2/.test(bloccoPrezzo));

const bloccoQta = (src.match(/function _fmtQta[\s\S]{0,400}?\n    \}/) || [''])[0];
check('la quantita arriva fino a 3 decimali, come sul database',
  /maximumFractionDigits:\s*3/.test(bloccoQta), bloccoQta.slice(0, 200));

const bloccoImporti = (src.match(/function _fmt\s*\([\s\S]{0,400}?\n    \}/) || [''])[0];
check('gli importi restano a 2 decimali esatti',
  /minimumFractionDigits:\s*2/.test(bloccoImporti) &&
  /maximumFractionDigits:\s*2/.test(bloccoImporti), bloccoImporti.slice(0, 200));

console.log('\n--- usati dove serve ---');
// Corpo della fattura
check('il prezzo unitario delle righe usa il formato prezzo',
  /_fmtPrezzo\(r\.prezzo_unitario\)/.test(src));
check('la quantita delle righe usa il formato quantita',
  /_fmtQta\(r\.quantita\)/.test(src));
check("l'importo delle righe resta a 2 decimali",
  /_fmt\(r\.importo\)/.test(src));

// Allegato di dettaglio: e' dove il cliente controlla i singoli rifornimenti,
// quindi e' li' che un prezzo arrotondato si nota di piu'.
check("nell'allegato il prezzo usa il formato prezzo",
  /_fmtPrezzo\(m\.prezzo_unitario\)/.test(src));
check("nell'allegato i litri usano il formato quantita",
  /_fmtQta\(m\.volume\)/.test(src));
check("nell'allegato l'importo resta a 2 decimali",
  /_fmt\(m\.importo\)/.test(src));

console.log('\n--- nessun prezzo stampato ancora a 2 decimali ---');
check('nessun prezzo_unitario passa piu dal formato degli importi',
  !/_fmt\((?:r|m)\.prezzo_unitario\)/.test(src));
check('nessun volume o quantita passa piu dal formato degli importi',
  !/_fmt\(m\.volume\)/.test(src) && !/_fmt\(r\.quantita\)/.test(src));

console.log('\n--- i totali non si toccano ---');
check('il totale della fattura resta a 2 decimali', /_fmt\(fattura\.totale\)/.test(src));
check('i subtotali di categoria restano a 2 decimali', /_fmt\(subtot\)/.test(src));

console.log('\n' + pass + ' passati, ' + fail + ' falliti');
process.exit(fail === 0 ? 0 : 1);
