// Eseguire con: node test/test-fatturazione-decimali.js
//
// Decimali nei CAMPI dove si scrive una riga di fattura.
//
// Il database li ha sempre accettati:
//
//     fatture_righe.prezzo_unitario   numeric(12,4)   4 decimali
//     fatture_righe.quantita          numeric(12,3)   3 decimali
//     fatture_righe.importo           numeric(12,2)   2 decimali
//
// Ma i campi del modulo avevano step="0.01" sul prezzo. Con quel passo il
// browser rifiuta un prezzo a 3 o 4 decimali: scrivendo 1.959 il campo
// diventa non valido e al salvataggio esce l'errore del browser sui
// decimali ("i due valori validi piu' vicini sono 1.95 e 1.96").
//
// Caso reale segnalato il 21/10/2026: 50,45 L a 1,959.
//
// Che fosse il passo e non il database lo diceva il codice stesso: il
// modulo di import ENI usava GIA' step="0.0001" sul prezzo, perche' i
// prezzi carburante hanno quattro decimali. Erano rimasti indietro il
// modulo manuale e quello di modifica righe.
//
// Fratello di test-fatturazione-pdf.js: quello difende i decimali in
// USCITA (sulla stampa), questo quelli in INGRESSO. Lo stesso contratto
// 4/3/2 vale ai due capi, e se i due capi divergono la fattura non torna.
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

// Un passo e' abbastanza fine se ha almeno tanti decimali quanti la
// colonna: 0.0001 per il prezzo (4), 0.001 per la quantita (3).
function decimaliDi(step) {
  var p = String(step).split('.');
  return p.length > 1 ? p[1].length : 0;
}

console.log('\n--- ogni campo prezzo accetta i 4 decimali del database ---');
var fileFatt = tuttiIFile(P + 'js/modules/fatturazione');
var prezziTroppoGrossi = [], prezziTrovati = 0;
var qtaTroppoGrosse = [], qtaTrovate = 0;

fileFatt.forEach(function(f) {
  var rel = path.relative(P, f).split(path.sep).join('/');
  fs.readFileSync(f, 'utf8').split(/\r?\n/).forEach(function(riga, i) {
    var step = (riga.match(/step="([0-9.]+)"/) || [])[1];
    if (!step) return;
    if (/prezzo/i.test(riga)) {
      prezziTrovati++;
      if (decimaliDi(step) < 4) prezziTroppoGrossi.push(rel + ':' + (i + 1) + ' step=' + step);
    } else if (/qta|quantita/i.test(riga)) {
      qtaTrovate++;
      if (decimaliDi(step) < 3) qtaTroppoGrosse.push(rel + ':' + (i + 1) + ' step=' + step);
    }
  });
});

check('ci sono campi prezzo da controllare', prezziTrovati > 0, prezziTrovati + ' trovati');
check('nessun campo prezzo rifiuta il terzo o quarto decimale',
  prezziTroppoGrossi.length === 0, prezziTroppoGrossi.join(' | '));

console.log('\n--- e ogni campo quantita i 3 del database ---');
check('ci sono campi quantita da controllare', qtaTrovate > 0, qtaTrovate + ' trovati');
check('nessun campo quantita rifiuta il terzo decimale',
  qtaTroppoGrosse.length === 0, qtaTroppoGrosse.join(' | '));

console.log('\n--- il caso segnalato: 50,45 L a 1,959 ---');
// Il passo deve dividere esattamente il valore, altrimenti il browser lo
// marca non valido. E' questo che riproduce il difetto, numeri alla mano.
function passoAccetta(step, valore) {
  var f = Math.round(1 / step);
  return Math.abs(Math.round(valore * f) - valore * f) < 1e-6;
}
check('un passo da 0.01 NON accetta 1.959 (era il difetto)', !passoAccetta(0.01, 1.959));
check('un passo da 0.0001 accetta 1.959', passoAccetta(0.0001, 1.959));
check('e accetta anche 1.8883, il prezzo ENI a 4 decimali', passoAccetta(0.0001, 1.8883));
check('un passo da 0.001 accetta 50.45 litri', passoAccetta(0.001, 50.45));

console.log('\n--- l importo mostrato nel modulo resta a 2 decimali ---');
var man = fs.readFileSync(P + 'js/modules/fatturazione/manuale.js', 'utf8');
// Senza maximumFractionDigits toLocaleString arriva a 3 decimali da solo:
// un importo non arrotondato uscirebbe come "98,832" sotto il campo.
check('il massimo dei decimali e dichiarato, non lasciato al caso',
  /r-importo[\s\S]{0,400}maximumFractionDigits:\s*2/.test(man));
check("l'importo viene arrotondato a 2 prima di mostrarlo",
  /Math\.round\(qta \* prezzo \* 100\) \/ 100/.test(man));

console.log('\n--- il cliente: scrivere il nome non e sceglierlo ---');
// Segnalato insieme ai decimali: "mi dice di selezionare un cliente quando
// e' gia' selezionato". Non lo era: il nome era stato DIGITATO nel campo di
// ricerca, e solo il clic sull'elenco riempie _clienteSelezionato. Lo
// dimostrava il modulo stesso -- Lenny Srl ha CONTANTI in anagrafica, e la
// Modalita pagamento sullo schermo era ancora "Seleziona...", cosa
// impossibile se il cliente fosse passato da _onClienteSelezionato.
check('scegliere dalla lista e la sola via che riempie la selezione',
  /onSelect:\s*_onClienteSelezionato/.test(man) &&
  /_clienteSelezionato\s*=\s*cliente;/.test(man));

// Difetto piu' serio trovato strada facendo: scelto un cliente e poi
// cambiato il testo, la scelta restava valida e la fattura sarebbe andata
// al cliente di prima con un altro nome sotto gli occhi.
check('cambiare il testo dopo aver scelto annulla la scelta',
  /addEventListener\('input'[\s\S]{0,320}_clienteSelezionato\s*=\s*null/.test(man));
check('e nasconde il riquadro del cliente di prima',
  /_clienteSelezionato\s*=\s*null;[\s\S]{0,240}fatt-m-cliente-info[\s\S]{0,160}display\s*=\s*'none'/.test(man));

check("l'avviso dice cosa manca, non solo che manca",
  /Scrivere il nome non basta/.test(man));
check('e riporta il nome che e stato scritto', /\+\s*scritto\s*\+/.test(man));
check('mentre a campo vuoto dice di cercarlo',
  /Cerca il cliente e scegli il suo nome/.test(man));
// Il vecchio testo secco era quello che sembrava un errore del programma:
// se torna, torna la confusione.
check("non resta il vecchio 'Seleziona un cliente' secco",
  !/toast\('Seleziona un cliente'/.test(man));


console.log('\n' + pass + ' passati, ' + fail + ' falliti');
process.exit(fail === 0 ? 0 : 1);
