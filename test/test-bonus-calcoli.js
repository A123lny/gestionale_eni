// Eseguire con: node test/test-bonus-calcoli.js
//
// Calcolo del bonus venduto. Gli articoli valgono 10-30 EUR e il bonus e'
// di pochi euro: un errore di arrotondamento o di estremo di fascia qui
// vale centesimi, ma sono i centesimi che il dipendente conta.
const fs = require('fs');
const vm = require('vm');
const P = 'C:/Users/Utente1/Documents/gestionale_eni/';

let pass = 0, fail = 0;
function check(nome, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + nome); }
  else { fail++; console.log('  FAIL ' + nome + (extra !== undefined ? ' -> ' + extra : '')); }
}

const sandbox = { console };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(P + 'js/lib/bonus-calcoli.js', 'utf8'), sandbox,
  { filename: 'bonus-calcoli.js' });
const B = sandbox.ENI.BonusCalcoli;

// Le fasce dell'esempio concordato col gestore.
const FASCE = [
  { da_prezzo: 0,  percentuale: 3 },
  { da_prezzo: 10, percentuale: 5 },
  { da_prezzo: 30, percentuale: 7 }
];
const PERC  = { modo: 'percentuale', euroPezzo: 0, fasce: FASCE };
const EURO  = { modo: 'euro', euroPezzo: 1, fasce: [] };

console.log('\n--- scelta della fascia ---');
check('9,99 sta nella fascia da 0',   B.fasciaPerPrezzo(9.99, FASCE).da_prezzo === 0);
check('10,00 SALE alla fascia da 10', B.fasciaPerPrezzo(10, FASCE).da_prezzo === 10,
  JSON.stringify(B.fasciaPerPrezzo(10, FASCE)));
check('10,50 resta nella fascia da 10', B.fasciaPerPrezzo(10.5, FASCE).da_prezzo === 10);
check('29,99 resta nella fascia da 10', B.fasciaPerPrezzo(29.99, FASCE).da_prezzo === 10);
check('30,00 sale alla fascia da 30', B.fasciaPerPrezzo(30, FASCE).da_prezzo === 30);
check('1000 sta nell ultima fascia',  B.fasciaPerPrezzo(1000, FASCE).da_prezzo === 30);
check('fasce disordinate danno lo stesso risultato',
  B.fasciaPerPrezzo(12, [FASCE[2], FASCE[0], FASCE[1]]).da_prezzo === 10);
check('nessuna fascia -> null', B.fasciaPerPrezzo(12, []) === null);
check('prezzo sotto la prima soglia -> null',
  B.fasciaPerPrezzo(3, [{ da_prezzo: 10, percentuale: 5 }]) === null);

console.log('\n--- bonus della riga, a percentuale ---');
let r = B.bonusRiga(12, 3, PERC);
check('3 pezzi da 12 EUR al 5% fanno 1,80', r.bonus === 1.8, r.bonus);
check('registra il modo applicato', r.regolaModo === 'percentuale');
check('registra la percentuale applicata', r.regolaValore === 5, r.regolaValore);

check('un pezzo da 25 EUR rende 1,25', B.bonusRiga(25, 1, PERC).bonus === 1.25);
check('un pezzo da 8 EUR rende 0,24',  B.bonusRiga(8, 1, PERC).bonus === 0.24);
check('un pezzo da 10 EUR rende 0,50 (fascia superiore)',
  B.bonusRiga(10, 1, PERC).bonus === 0.5, B.bonusRiga(10, 1, PERC).bonus);
check('un pezzo da 50 EUR rende 3,50',  B.bonusRiga(50, 1, PERC).bonus === 3.5);

console.log('\n--- bonus della riga, a euro fisso ---');
r = B.bonusRiga(25, 3, EURO);
check('3 pezzi a 1 EUR fanno 3,00', r.bonus === 3);
check('il prezzo non conta in modalita euro', B.bonusRiga(8, 3, EURO).bonus === 3);
check('registra il modo applicato', r.regolaModo === 'euro');
check('registra l importo applicato', r.regolaValore === 1);

console.log('\n--- arrotondamento ---');
check('arrotonda a 2 decimali', B.arrotonda(1.005) === 1.01, B.arrotonda(1.005));
check('non introduce code binarie', B.arrotonda(0.1 + 0.2) === 0.3);
check('7 pezzi da 13,33 al 5% fanno 4,67',
  B.bonusRiga(13.33, 7, PERC).bonus === 4.67, B.bonusRiga(13.33, 7, PERC).bonus);

console.log('\n--- niente deve esplodere ---');
check('nessuna fascia applicabile -> bonus 0', B.bonusRiga(3, 1,
  { modo: 'percentuale', euroPezzo: 0, fasce: [{ da_prezzo: 10, percentuale: 5 }] }).bonus === 0);
check('quantita zero -> bonus 0', B.bonusRiga(25, 0, PERC).bonus === 0);
check('quantita negativa -> bonus 0', B.bonusRiga(25, -3, PERC).bonus === 0);
check('prezzo negativo -> bonus 0', B.bonusRiga(-5, 1, PERC).bonus === 0);
check('valori non numerici -> bonus 0', B.bonusRiga('abc', 'x', PERC).bonus === 0);
check('regola assente -> bonus 0', B.bonusRiga(25, 1, null).bonus === 0);
check('modo sconosciuto -> bonus 0',
  B.bonusRiga(25, 1, { modo: 'boh', euroPezzo: 1, fasce: FASCE }).bonus === 0);
check('euro al pezzo negativo -> bonus 0, mai un addebito',
  B.bonusRiga(10, 1, { modo: 'euro', euroPezzo: -5, fasce: [] }).bonus === 0,
  B.bonusRiga(10, 1, { modo: 'euro', euroPezzo: -5, fasce: [] }).bonus);
check('nemmeno moltiplicando per la quantita',
  B.bonusRiga(10, 3, { modo: 'euro', euroPezzo: -5, fasce: [] }).bonus === 0);

console.log('\n--- diagnosi della configurazione ---');
check('configurazione a percentuale sana: nessun problema',
  B.problemiConfigurazione(PERC).length === 0, JSON.stringify(B.problemiConfigurazione(PERC)));
check('configurazione a euro sana: nessun problema',
  B.problemiConfigurazione(EURO).length === 0);
check('nessuna fascia viene segnalato',
  B.problemiConfigurazione({ modo: 'percentuale', euroPezzo: 0, fasce: [] }).length === 1);
check('buco sotto la prima fascia viene segnalato',
  B.problemiConfigurazione({ modo: 'percentuale', euroPezzo: 0,
    fasce: [{ da_prezzo: 10, percentuale: 5 }] }).length === 1);
check('due fasce dallo stesso importo vengono segnalate',
  B.problemiConfigurazione({ modo: 'percentuale', euroPezzo: 0,
    fasce: [{ da_prezzo: 0, percentuale: 3 }, { da_prezzo: 0, percentuale: 5 }] }).length === 1);
check('percentuale fuori scala viene segnalata',
  B.problemiConfigurazione({ modo: 'percentuale', euroPezzo: 0,
    fasce: [{ da_prezzo: 0, percentuale: 150 }] }).length === 1);
check('importo al pezzo a zero viene segnalato',
  B.problemiConfigurazione({ modo: 'euro', euroPezzo: 0, fasce: [] }).length === 1);
check('i messaggi sono leggibili, non codici',
  B.problemiConfigurazione({ modo: 'percentuale', euroPezzo: 0, fasce: [] })[0].length > 20);

// Stampa i casi di confronto con SQL. Serve a verificare a mano che
// js/lib/bonus-calcoli.js e public.bonus_riga_calcola diano lo stesso numero:
// il client mostra l'anteprima, il server scrive il valore definitivo, e se
// divergono il dipendente vede una cifra e ne incassa un'altra.
if (process.argv.indexOf('--parita') !== -1) {
  const CASI = [[9.99,1],[10,1],[10.5,1],[12,3],[25,1],[29.99,1],[30,1],[50,1],[13.33,7],[8,1]];
  console.log('\nprezzo\tqta\tbonus_js\tperc_js');
  CASI.forEach(function(c) {
    const x = B.bonusRiga(c[0], c[1], PERC);
    console.log(c[0].toFixed(2) + '\t' + c[1] + '\t' + x.bonus.toFixed(2) + '\t\t' + x.regolaValore);
  });
}

console.log('\n' + pass + ' passati, ' + fail + ' falliti');
process.exit(fail === 0 ? 0 : 1);
