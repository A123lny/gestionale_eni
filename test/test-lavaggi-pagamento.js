// Eseguire con: node test/test-lavaggi-pagamento.js
// Test del fix Lavaggi -> Cassa.
// Carica api.js reale con un client Supabase finto e verifica che la vendita
// generata da un lavaggio spezzi gli importi nel modo giusto per ogni metodo.
const fs = require('fs');
const vm = require('vm');
const P = 'C:/Users/Utente1/Documents/gestionale_eni/';

let pass = 0, fail = 0;
function check(nome, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + nome); }
  else { fail++; console.log('  FAIL ' + nome + (extra ? ' -> ' + extra : '')); }
}

// --- client Supabase finto: registra gli insert e simula le select ---
const inserted = [];        // { tabella, dati }
let venditeDaRitornare = [];

function makeQuery(tabella) {
  const q = {
    _tab: tabella,
    select() { return q; },
    eq() { return q; },
    neq() { return q; },
    gte() { return q; },
    lte() { return q; },
    gt() { return q; },
    order() { return q; },
    limit() { return q; },
    single() { return Promise.resolve({ data: q._last, error: null }); },
    maybeSingle() { return Promise.resolve({ data: q._last, error: null }); },
    insert(dati) { q._last = Object.assign({ id: 'fake-' + inserted.length }, dati); inserted.push({ tabella, dati }); return q; },
    update(dati) { q._last = Object.assign({ id: 'fake' }, dati); return q; },
    then(res) { return Promise.resolve({ data: venditeDaRitornare, error: null }).then(res); }
  };
  return q;
}

const sandbox = {
  console,
  supabase: { createClient: () => ({ from: makeQuery, rpc: () => Promise.resolve({ data: null, error: null }) }) },
  setTimeout, clearTimeout,
  document: { createElement: () => ({ set textContent(v) { this._v = v; }, get innerHTML() { return this._v || ''; } }) }
};
sandbox.window = sandbox;
vm.createContext(sandbox);

for (const f of ['js/config.js', 'js/ui.js', 'js/api.js']) {
  vm.runInContext(fs.readFileSync(P + f, 'utf8'), sandbox, { filename: f });
}
// State finto (serve a scriviLog e agli operatori)
sandbox.ENI.State = {
  getUserId: () => 'u1', getUserName: () => 'Test',
  cacheGet: () => null, cacheSet: () => {}
};

const API = sandbox.ENI.API;
const C = sandbox.ENI.Config;

(async () => {
  // --- 1. Configurazione delle modalita' differite ---
  const diff = C.MODALITA_PAGAMENTO_DIFFERITO || [];
  check('Addebito_Mese e differito', diff.includes('Addebito_Mese'));
  check('Addebito_30gg e differito', diff.includes('Addebito_30gg'));
  check('Addebito_60gg e differito', diff.includes('Addebito_60gg'));
  check('Cash NON e differito', !diff.includes('Cash'));

  // --- 2. Split degli importi per metodo ---
  const lavaggio = { id: 'lav1', codice: 'LAV999', data: '2026-09-16', prezzo: 30, tipo_lavaggio: 'Esterno Rulli', nome_cliente: 'Mario' };

  for (const [metodo, attesoContanti, attesoPos] of [
    ['contanti', 30, 0],
    ['pos', 0, 30],
    ['fattura', 0, 0]
  ]) {
    inserted.length = 0;
    await API.salvaVenditaDaLavaggio(lavaggio, null, metodo);
    const v = inserted.find(i => i.tabella === 'vendite');
    check(metodo + ': vendita creata', !!v);
    if (!v) continue;
    check(metodo + ': metodo_pagamento salvato', v.dati.metodo_pagamento === metodo, v.dati.metodo_pagamento);
    check(metodo + ': totale = prezzo del lavaggio', v.dati.totale === 30, v.dati.totale);
    check(metodo + ': importo_contanti', v.dati.importo_contanti === attesoContanti, v.dati.importo_contanti);
    check(metodo + ': importo_pos', v.dati.importo_pos === attesoPos, v.dati.importo_pos);
    const riga = inserted.find(i => i.tabella === 'vendite_dettaglio');
    check(metodo + ': riga con categoria Lavaggi', riga && riga.dati.categoria === 'Lavaggi');
  }

  // --- 3. Default retrocompatibile: senza metodo -> contanti (comportamento storico) ---
  inserted.length = 0;
  await API.salvaVenditaDaLavaggio(lavaggio, null);
  const vDef = inserted.find(i => i.tabella === 'vendite');
  check('senza metodo -> contanti', vDef && vDef.dati.metodo_pagamento === 'contanti', vDef && vDef.dati.metodo_pagamento);

  // --- 4. getVenditeTotaliPerData somma il venduto a fattura ---
  venditeDaRitornare = [
    { id: 'v1', totale: 30, metodo_pagamento: 'contanti', importo_contanti: 30, importo_pos: 0 },
    { id: 'v2', totale: 12, metodo_pagamento: 'pos',      importo_contanti: 0,  importo_pos: 12 },
    { id: 'v3', totale: 26, metodo_pagamento: 'fattura',  importo_contanti: 0,  importo_pos: 0 }
  ];
  const tot = await API.getVenditeTotaliPerData('2026-09-16');
  // La vendita a fattura conta nel venduto ma non in nessun metodo di incasso:
  // i crediti di quei clienti sono gia' inseriti a mano nella sezione 4TSCARD.
  check('totale venduto include anche la fattura', tot.totaleVendite === 68, tot.totaleVendite);
  check('contanti non gonfiati dalla fattura', tot.perMetodo.contanti === 30, tot.perMetodo.contanti);
  check('pos corretto', tot.perMetodo.pos === 12, tot.perMetodo.pos);

  // --- 5. La Cassa NON somma i lavaggi a fattura fra i crediti ---
  // Quei clienti sono gia' riportati a mano nella sezione 4TSCARD:
  // sommarli di nuovo li conterebbe due volte.
  const cassaSrc = fs.readFileSync(P + 'js/modules/cassa.js', 'utf8');
  check('nessun riferimento a crediti_lavaggi_fattura', !/crediti_lavaggi_fattura/.test(cassaSrc));
  const formuleCrediti = cassaSrc.match(/val\('crediti_buoni_eni'\)[\s\S]{0,200}?val\('incasso_crediti'\)/g) || [];
  check('esistono 2 formule crediti', formuleCrediti.length === 2, formuleCrediti.length + ' trovate');
  check('nessuna formula crediti tocca i lavaggi',
    formuleCrediti.every(f => !f.includes('lavaggi')));
  check('il venduto lavaggi resta in sola lettura dalle Vendite',
    /_vendutoRO\('Lavaggi', 'venduto_lavaggi'/.test(cassaSrc));

  // --- 6. Il popup vecchio non esiste piu' ---
  const lavSrc = fs.readFileSync(P + 'js/modules/lavaggi.js', 'utf8');
  check('rimosso "vuoi registrare come vendita?"', !/registrare anche come/i.test(lavSrc));
  check('nuovo popup "Come ha pagato?"', /Come ha pagato\?/.test(lavSrc));
  check('gestito il caso da_incassare', /da_incassare/.test(lavSrc));
  check('differito -> fattura automatica', /_clientePagaDifferito/.test(lavSrc));

  console.log('\n' + pass + ' passati, ' + fail + ' falliti');
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('ERRORE: ' + e.stack); process.exit(1); });
