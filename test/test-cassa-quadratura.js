// Eseguire con: node test/test-cassa-quadratura.js
//
// Verifica i calcoli della quadratura cassa. Il punto delicato e' la correzione
// del venduto nei giorni di cambio prezzo: se sbagliasse segno o verso,
// peggiorerebbe lo scarto invece di toglierlo, e nessuno se ne accorgerebbe
// perche' il numero resta plausibile.
const fs = require('fs');
const vm = require('vm');
const P = 'C:/Users/Utente1/Documents/gestionale_eni/';

let pass = 0, fail = 0;
function check(nome, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + nome); }
  else { fail++; console.log('  FAIL ' + nome + (extra !== undefined ? ' -> ' + extra : '')); }
}
function vicino(a, b, eps) { return Math.abs(a - b) < (eps === undefined ? 0.005 : eps); }

const sandbox = { console };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(P + 'js/lib/cassa-quadratura.js', 'utf8'), sandbox,
  { filename: 'cassa-quadratura.js' });

const Q = sandbox.ENI.CassaQuadratura;

// ---------------------------------------------------------------
console.log('\n--- prezzo implicito ---');
check('euro / litri', vicino(Q.prezzoImplicito(8600, 15642.54), 1.8189, 0.0001));
check('litri a zero -> null', Q.prezzoImplicito(0, 0) === null);
check('litri mancanti -> null', Q.prezzoImplicito(null, 100) === null);
check('litri negativi -> null', Q.prezzoImplicito(-5, 100) === null);

// ---------------------------------------------------------------
console.log('\n--- correzione del venduto (l\'esempio reale 14->15 settembre) ---');
// 8.600 litri, scontrino a 1,8189 = 15.642,54.
// Ma 4.000 litri erano gia' stati venduti a 1,7689 (prezzo del giorno prima).
// Venduto vero: 4.000 x 1,7689 + 4.600 x 1,8189 = 7.075,60 + 8.366,94 = 15.442,54
const corretto = Q.vendutoProdotto(8600, 15642.54, 4000, 1.7689);
check('il venduto corretto e 15.442,54', vicino(corretto, 15442.54), corretto);
check('la correzione vale 200 EUR', vicino(15642.54 - corretto, 200), 15642.54 - corretto);
check('il prezzo e salito -> il venduto SCENDE', corretto < 15642.54);

// Verso opposto: se il prezzo scende, il venduto deve salire.
const prezzoInCalo = Q.vendutoProdotto(8600, 15212.54, 4000, 1.8189);
check('il prezzo e sceso -> il venduto SALE', prezzoInCalo > 15212.54, prezzoInCalo);

// ---------------------------------------------------------------
console.log('\n--- la correzione non deve mai fare danni ---');
check('senza litri al prezzo vecchio restituisce gli euro invariati',
  Q.vendutoProdotto(8600, 15642.54, 0, 1.7689) === 15642.54);
check('senza prezzo precedente restituisce gli euro invariati',
  Q.vendutoProdotto(8600, 15642.54, 4000, null) === 15642.54);
check('senza litri restituisce gli euro invariati',
  Q.vendutoProdotto(0, 0, 4000, 1.7689) === 0);
check('litri al prezzo vecchio > totale: si limita al totale, niente assurdita',
  vicino(Q.vendutoProdotto(8600, 15642.54, 99999, 1.7689), 8600 * 1.7689),
  Q.vendutoProdotto(8600, 15642.54, 99999, 1.7689));
check('prezzo vecchio uguale a quello di oggi -> nessuna correzione',
  vicino(Q.vendutoProdotto(8600, 15642.54, 4000, 15642.54 / 8600), 15642.54));
check('tutti i litri al prezzo vecchio -> litri x prezzo vecchio',
  vicino(Q.vendutoProdotto(8600, 15642.54, 8600, 1.7689), 8600 * 1.7689));
check('valori sporchi non fanno esplodere il conto',
  Q.vendutoProdotto('abc', undefined, NaN, 'x') === 0);

// ---------------------------------------------------------------
console.log('\n--- totale carburante sui tre prodotti ---');
const campi = {
  super_sp_litri: 2349,    super_sp_euro: 4272.53,
  diesel_litri: 8966.72,   diesel_euro: 18730.15,
  diesel_plus_litri: 426.53, diesel_plus_euro: 930.85
};
const sommaSecca = 4272.53 + 18730.15 + 930.85;
check('senza correzioni somma e basta',
  vicino(Q.vendutoCarburante(campi, {}), sommaSecca), Q.vendutoCarburante(campi, {}));

const conSplit = Object.assign({}, campi, { diesel_litri_prezzo_prec: 4000 });
const totCorretto = Q.vendutoCarburante(conSplit, { diesel: 2.0389 });
check('correggendo il solo diesel cambia solo quella quota',
  vicino(sommaSecca - totCorretto, 4000 * (2.0889 - 2.0389), 0.5), sommaSecca - totCorretto);
check('gli altri due prodotti restano intatti',
  vicino(Q.vendutoCarburante({ super_sp_litri: 2349, super_sp_euro: 4272.53 }, { diesel: 2.0389 }), 4272.53));

// ---------------------------------------------------------------
console.log('\n--- rilevamento del cambio prezzo ---');
const ieri = { super_sp_litri: 2474.27, super_sp_euro: 4376.79,    // 1,7689
               diesel_litri: 12471.34,  diesel_euro: 25427.77,     // 2,0389
               diesel_plus_litri: 396.88, diesel_plus_euro: 848.89 }; // 2,1389
const oggi = { super_sp_litri: 2349,    super_sp_euro: 4272.53,    // 1,8189
               diesel_litri: 8966.72,   diesel_euro: 18730.15,     // 2,0889
               diesel_plus_litri: 426.53, diesel_plus_euro: 930.85 }; // 2,1824

const cambi = Q.cambiPrezzo(oggi, ieri);
check('rileva il cambio su tutti e tre i prodotti', cambi.length === 3, cambi.length);
check('riporta il prezzo di ieri e quello di oggi',
  vicino(cambi[0].prezzoPrecedente, 1.7689, 0.0001) && vicino(cambi[0].prezzoOggi, 1.8189, 0.0001));
check('l\'etichetta e leggibile', cambi[0].label === 'Super senza Piombo', cambi[0].label);

check('stesso prezzo -> nessun cambio', Q.cambiPrezzo(oggi, oggi).length === 0);
check('senza cassa precedente -> nessun cambio (non si inventa un allarme)',
  Q.cambiPrezzo(oggi, null).length === 0);

// Arrotondamento dello scontrino: 0,0002 EUR/L non e' un cambio prezzo.
const quasiUguale = { diesel_litri: 8966.72, diesel_euro: 18730.15 + 8966.72 * 0.0002 };
check('uno scarto di 2 decimillesimi e arrotondamento, non cambio prezzo',
  Q.cambiPrezzo(quasiUguale, { diesel_litri: 8966.72, diesel_euro: 18730.15 }).length === 0);
const cambioVero = { diesel_litri: 8966.72, diesel_euro: 18730.15 + 8966.72 * 0.001 };
check('un decimo di centesimo invece e un cambio prezzo',
  Q.cambiPrezzo(cambioVero, { diesel_litri: 8966.72, diesel_euro: 18730.15 }).length === 1);

check('prodotto non venduto ieri -> non genera un falso cambio',
  Q.cambiPrezzo({ diesel_plus_litri: 400, diesel_plus_euro: 850 },
                { diesel_plus_litri: 0,   diesel_plus_euro: 0 }).length === 0);

// ---------------------------------------------------------------
console.log('\n--- soglie e giudizio della giornata ---');
const fermo  = Q.soglie(false, false);
const cambio = Q.soglie(true, false);
check('a prezzo fermo la soglia e 300 / 700', fermo.attenzione === 300 && fermo.anomala === 700);
check('col cambio prezzo si allarga a 600 / 1400', cambio.attenzione === 600 && cambio.anomala === 1400);
check('se i litri al prezzo vecchio sono stati inseriti la soglia torna stretta',
  Q.soglie(true, true).attenzione === 300);

check('40 EUR = regolare',     Q.statoDifferenza(40, fermo) === 'regolare');
check('-40 EUR = regolare (il segno non conta)', Q.statoDifferenza(-40, fermo) === 'regolare');
check('esattamente 300 = ancora regolare', Q.statoDifferenza(300, fermo) === 'regolare');
check('301 = attenzione',      Q.statoDifferenza(301, fermo) === 'attenzione');
check('esattamente 700 = ancora attenzione', Q.statoDifferenza(700, fermo) === 'attenzione');
check('701 = anomala',         Q.statoDifferenza(701, fermo) === 'anomala');
check('431 EUR del 14/09 con cambio prezzo = regolare',
  Q.statoDifferenza(430.91, cambio) === 'regolare');
check('i 6.652 EUR del 17/07 = anomala anche con la soglia larga',
  Q.statoDifferenza(6652.18, cambio) === 'anomala');
check('i 1.573 EUR del 03/07 (chiusura POS mancante) = anomala',
  Q.statoDifferenza(1573.47, cambio) === 'anomala');
check('differenza nulla = regolare', Q.statoDifferenza(0, fermo) === 'regolare');
check('differenza non numerica = regolare, non un falso allarme',
  Q.statoDifferenza(undefined, fermo) === 'regolare');

// ---------------------------------------------------------------
console.log('\n--- progressivo ---');
const casse = [
  { stato: 'chiusa', differenza: 430.91 },
  { stato: 'chiusa', differenza: -120.5 },
  { stato: 'aperta', differenza: 9999 },     // bozza: parziale, va ignorata
  { stato: 'chiusa', differenza: null }
];
const pr = Q.progressivo(casse);
check('somma solo le casse chiuse', vicino(pr.totale, 310.41), pr.totale);
check('conta i giorni chiusi', pr.giorni === 3, pr.giorni);
check('lista vuota -> zero', Q.progressivo([]).totale === 0 && Q.progressivo([]).giorni === 0);
check('lista assente -> zero', Q.progressivo(null).giorni === 0);

// ---------------------------------------------------------------
// Cablaggio: i calcoli sopra non servono a niente se il modulo smette di
// chiamarli. Questi controlli sono sul sorgente, non sul comportamento.
console.log('\n--- cablaggio nel modulo Cassa ---');
const cassaSrc = fs.readFileSync(P + 'js/modules/cassa.js', 'utf8');
const apiSrc   = fs.readFileSync(P + 'js/api.js', 'utf8');
const indexSrc = fs.readFileSync(P + 'index.html', 'utf8');

const usiVenduto = (cassaSrc.match(/CassaQuadratura\.vendutoCarburante\(/g) || []).length;
check('il totale carburante passa dai calcoli corretti in schermata E in salvataggio',
  usiVenduto === 2, usiVenduto + ' occorrenze');
// La vecchia logica viveva nella variabile diffStato: se riaffiora, qualcuno ha
// rimesso l'allarme quotidiano "Ammanco / Eccedenza" sopra il giudizio nuovo.
check('il vecchio allarme quotidiano Ammanco/Eccedenza e sparito',
  !/diffStato/.test(cassaSrc));
check('la guida in-app non promette piu che la cassa quadri',
  /non quadra mai al centesimo/.test(cassaSrc));
check('esiste il giudizio della giornata', /_mostraGiudizioDifferenza\(/.test(cassaSrc));
check('esiste il progressivo', /_mostraProgressivo\(/.test(cassaSrc));
check('il numero grande e nascosto quando la giornata e regolare',
  /numeroEl\.hidden = \(stato === 'regolare'\)/.test(cassaSrc));
check('i tre campi facoltativi vengono salvati',
  /super_sp_litri_prezzo_prec:/.test(cassaSrc) &&
  /diesel_litri_prezzo_prec:/.test(cassaSrc) &&
  /diesel_plus_litri_prezzo_prec:/.test(cassaSrc));
check('se vuoti si salvano NULL, non zero',
  (cassaSrc.match(/_litri_prezzo_prec'\)\s*\|\| null/g) || []).length === 3);
check('la riga del cambio prezzo esiste ed e nascosta di partenza',
  /id="prezzo-avviso-' \+ f\.prefix \+ '" hidden/.test(cassaSrc));
check('anche lo storico usa le stesse soglie', /_statoRigaStorico\(/.test(cassaSrc));

check('api.js espone la cassa precedente chiusa', /getCassaPrecedenteChiusa: getCassaPrecedenteChiusa/.test(apiSrc));
check('api.js espone le differenze per il progressivo', /getDifferenzeCasse: getDifferenzeCasse/.test(apiSrc));
check('la cassa precedente si limita alle chiuse',
  /getCassaPrecedenteChiusa[\s\S]{0,600}?\.eq\('stato', 'chiusa'\)/.test(apiSrc));

check('index.html carica la libreria', /js\/lib\/cassa-quadratura\.js\?v=/.test(indexSrc));
check('la libreria e caricata PRIMA del modulo cassa',
  indexSrc.indexOf('js/lib/cassa-quadratura.js') < indexSrc.indexOf('js/modules/cassa.js'));
check('il ?v= di cassa.js e stato aggiornato', !/modules\/cassa\.js\?v=30"/.test(indexSrc));

const migr = fs.readFileSync(P + 'supabase/migrations/20260916_cassa_litri_prezzo_precedente.sql', 'utf8');
check('la migration aggiunge le tre colonne',
  (migr.match(/add column if not exists/g) || []).length === 3);
check('le colonne sono nullable (nessun NOT NULL)', !/not null/i.test(migr));

// ---------------------------------------------------------------
console.log('\n' + pass + ' passati, ' + fail + ' falliti');
process.exit(fail === 0 ? 0 : 1);
