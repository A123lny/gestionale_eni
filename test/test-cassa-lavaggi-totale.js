// Eseguire con: node test/test-cassa-lavaggi-totale.js
//
// Il totale lavaggi della Cassa deve coincidere con quello del modulo Lavaggi.
// Il 16/09/2026 la Cassa segnava 88 EUR contro 148: i due lavaggi di
// Ippo/Zonzini (addebito mensile) non avevano generato una vendita, e la Cassa
// leggeva le vendite invece dei lavaggi.
const fs = require('fs');
const vm = require('vm');
const P = 'C:/Users/Utente1/Documents/gestionale_eni/';

let pass = 0, fail = 0;
function check(nome, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + nome); }
  else { fail++; console.log('  FAIL ' + nome + (extra !== undefined ? ' -> ' + extra : '')); }
}

// --- client Supabase finto: registra i filtri e restituisce righe fisse ---
let righeLavaggi = [];
const filtri = [];
function makeQuery(tabella) {
  const q = {
    _tabella: tabella,
    select() { return q; },
    eq(campo, valore) { filtri.push({ tabella, campo, valore }); return q; },
    gte() { return q; }, lte() { return q; }, lt() { return q; },
    order() { return q; }, limit() { return q; },
    maybeSingle() { return Promise.resolve({ data: null, error: null }); },
    single() { return Promise.resolve({ data: null, error: null }); },
    insert() { return q; }, update() { return q; }, delete() { return q; },
    then(res) {
      const data = tabella === 'lavaggi' ? righeLavaggi : [];
      return Promise.resolve({ data, error: null }).then(res);
    }
  };
  return q;
}

const sandbox = {
  console, setTimeout, clearTimeout,
  supabase: { createClient: () => ({ from: makeQuery, rpc: () => Promise.resolve({ data: null, error: null }) }) },
  document: { createElement: () => ({ set textContent(v) { this._v = v; }, get innerHTML() { return this._v || ''; } }) }
};
sandbox.window = sandbox;
vm.createContext(sandbox);
for (const f of ['js/config.js', 'js/ui.js', 'js/api.js']) {
  vm.runInContext(fs.readFileSync(P + f, 'utf8'), sandbox, { filename: f });
}
sandbox.ENI.State = { getUserId: () => 'u1', getUserName: () => 'Test', cacheGet: () => null, cacheSet: () => {} };
const API = sandbox.ENI.API;

(async () => {
  console.log('\n--- il totale legge i lavaggi, non le vendite ---');
  check('API espone getTotaleLavaggiPerData', typeof API.getTotaleLavaggiPerData === 'function');

  // La giornata vera del 16/09: tre privati con vendita + due Ippo/Zonzini senza.
  righeLavaggi = [
    { prezzo: 30 },   // LAV1298 walk-in     -> vendita creata
    { prezzo: 28 },   // LAV1290 privato     -> vendita creata
    { prezzo: 30 },   // LAV1285 privato     -> vendita creata
    { prezzo: 30 },   // LAV1306 Ippo/Zonzini -> NESSUNA vendita
    { prezzo: 30 }    // LAV1307 Ippo/Zonzini -> NESSUNA vendita
  ];
  filtri.length = 0;
  const tot = await API.getTotaleLavaggiPerData('2026-09-16');
  check('il 16/09 fa 148, non 88', tot === 148, tot);

  check('filtra per data', filtri.some(f => f.tabella === 'lavaggi' && f.campo === 'data' && f.valore === '2026-09-16'));
  check('conta solo i Completato', filtri.some(f => f.tabella === 'lavaggi' && f.campo === 'stato' && f.valore === 'Completato'),
    JSON.stringify(filtri));

  righeLavaggi = [];
  check('giornata senza lavaggi -> 0', (await API.getTotaleLavaggiPerData('2026-09-17')) === 0);

  righeLavaggi = [{ prezzo: null }, { prezzo: '25.50' }, { prezzo: undefined }];
  const sporco = await API.getTotaleLavaggiPerData('2026-09-17');
  check('prezzi nulli o stringa non rompono la somma', sporco === 25.5, sporco);

  // --- cablaggio ---
  console.log('\n--- cablaggio nella Cassa ---');
  const cassaSrc = fs.readFileSync(P + 'js/modules/cassa.js', 'utf8');
  const apiSrc   = fs.readFileSync(P + 'js/api.js', 'utf8');
  const indexSrc = fs.readFileSync(P + 'index.html', 'utf8');

  check('api.js esporta la funzione', /getTotaleLavaggiPerData: getTotaleLavaggiPerData/.test(apiSrc));
  check('la Cassa carica il totale lavaggi',
    /_totLavaggi = await ENI\.API\.getTotaleLavaggiPerData\(_dataSelezionata\)/.test(cassaSrc));
  check('per la categoria Lavaggi la Cassa NON usa piu le vendite',
    /if \(catKey === 'Lavaggi'\) return _totLavaggi;/.test(cassaSrc));
  check('il totale lavaggi si legge anche a cassa chiusa (fuori dal ramo non-chiusa)',
    cassaSrc.indexOf('getTotaleLavaggiPerData') < cassaSrc.indexOf('getVenditeTotaliPerData'));
  check('il suggerimento dice "Lavaggi", non "Vendite"',
    /var fonte = \(catKey === 'Lavaggi'\) \? 'Lavaggi' : 'Vendite';/.test(cassaSrc));
  check('il campo resta modificabile a mano',
    /_vendutoNegozio\('Lavaggi', 'venduto_lavaggi', 'Lavaggi'/.test(cassaSrc));
  check('i ?v= sono stati aggiornati',
    !/js\/api\.js\?v=53/.test(indexSrc) && !/modules\/cassa\.js\?v=30/.test(indexSrc));

  console.log('\n' + pass + ' passati, ' + fail + ' falliti');
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('ERRORE: ' + e.stack); process.exit(1); });
