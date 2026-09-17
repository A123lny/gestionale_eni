// Eseguire con: node test/test-bonus-api.js
//
// Verifica che le funzioni API del bonus parlino con le tabelle e le funzioni
// giuste, e soprattutto che il dipendente NON possa scrivere nei movimenti:
// l'unica strada per lui e' l'RPC, dove il server decide autore e prezzo.
const fs = require('fs');
const vm = require('vm');
const P = 'C:/Users/Utente1/Documents/gestionale_eni/';

let pass = 0, fail = 0;
function check(nome, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + nome); }
  else { fail++; console.log('  FAIL ' + nome + (extra !== undefined ? ' -> ' + extra : '')); }
}

const azioni = [];
let righe = [];
function makeQuery(tabella) {
  const q = {
    select() { return q; },
    eq(c, v) { azioni.push({ op: 'eq', tabella, campo: c, valore: v }); return q; },
    gte() { return q; }, lte() { return q; }, lt() { return q; },
    order() { return q; }, limit() { return q; },
    single() { return Promise.resolve({ data: q._last || null, error: null }); },
    maybeSingle() { return Promise.resolve({ data: q._last || null, error: null }); },
    insert(d) { q._last = Object.assign({ id: 'new' }, d); azioni.push({ op: 'insert', tabella, dati: d }); return q; },
    upsert(d) { q._last = d; azioni.push({ op: 'upsert', tabella, dati: d }); return q; },
    update(d) { q._last = Object.assign({ id: 'x' }, d); azioni.push({ op: 'update', tabella, dati: d }); return q; },
    delete() { azioni.push({ op: 'delete', tabella }); return q; },
    then(res) { return Promise.resolve({ data: righe, error: null }).then(res); }
  };
  return q;
}
const rpcChiamate = [];
const sandbox = {
  console, setTimeout, clearTimeout,
  supabase: { createClient: () => ({
    from: makeQuery,
    rpc: (nome, args) => { rpcChiamate.push({ nome, args }); return Promise.resolve({ data: { id: 'v1', bonus: 1.25 }, error: null }); }
  }) },
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
  console.log('\n--- la vendita passa SOLO dalla funzione del server ---');
  rpcChiamate.length = 0;
  await API.registraVenditaBonus('art-1', 2, 'contanti');
  const r = rpcChiamate.find(x => x.nome === 'registra_vendita_bonus');
  check('chiama registra_vendita_bonus', !!r);
  check('manda articolo, quantita e metodo',
    r && r.args.p_magazzino_id === 'art-1' && r.args.p_quantita === 2 && r.args.p_metodo === 'contanti',
    r && JSON.stringify(r.args));
  check('NON manda il dipendente: lo decide il server',
    r && Object.keys(r.args).every(k => !/personale|operatore|staff/i.test(k)),
    r && Object.keys(r.args).join(','));
  check('NON manda il prezzo: lo decide il server',
    r && Object.keys(r.args).every(k => !/prezzo|importo|totale/i.test(k)),
    r && Object.keys(r.args).join(','));

  console.log('\n--- letture del dipendente ---');
  azioni.length = 0;
  await API.getMieiMovimentiBonus(2026, 9);
  check('filtra per anno', azioni.some(a => a.campo === 'anno' && a.valore === 2026));
  check('filtra per mese', azioni.some(a => a.campo === 'mese' && a.valore === 9));

  console.log('\n--- correzioni del gestore, tracciate ---');
  azioni.length = 0;
  await API.aggiornaMovimentoBonus('m1', { quantita: 2, bonus_calcolato: 1.5 }, 'qta 3, bonus 2,25 €');
  check('aggiorna il movimento', azioni.some(a => a.op === 'update' && a.tabella === 'bonus_movimenti'));
  check('scrive nel log', azioni.some(a => a.op === 'insert' && a.tabella === 'log_attivita'));
  const log = azioni.find(a => a.op === 'insert' && a.tabella === 'log_attivita');
  check('il log conserva il valore precedente',
    log && String(log.dati.dettagli).indexOf('qta 3') !== -1, log && log.dati.dettagli);

  azioni.length = 0;
  await API.eliminaMovimentoBonus('m1', 'Batteria 12V - 1,25 €');
  check('elimina il movimento', azioni.some(a => a.op === 'delete' && a.tabella === 'bonus_movimenti'));
  check('anche l eliminazione finisce nel log',
    azioni.some(a => a.op === 'insert' && a.tabella === 'log_attivita'));

  console.log('\n--- regola e fasce ---');
  azioni.length = 0;
  await API.salvaRegolaBonus('percentuale', 0);
  check('salva la modalita in impostazioni_app',
    azioni.some(a => a.op === 'upsert' && a.tabella === 'impostazioni_app'));

  azioni.length = 0;
  await API.salvaFasceBonus([{ da_prezzo: 0, percentuale: 3 }, { da_prezzo: 10, percentuale: 5 }]);
  check('cancella le fasce vecchie prima di riscriverle',
    azioni.some(a => a.op === 'delete' && a.tabella === 'bonus_fasce'));
  check('inserisce le fasce nuove',
    azioni.some(a => a.op === 'insert' && a.tabella === 'bonus_fasce'));

  console.log('\n--- esportate ---');
  ['getRegolaBonus','salvaRegolaBonus','salvaFasceBonus','getArticoliBonus','setBonusArticolo',
   'registraVenditaBonus','getMieiMovimentiBonus','getMieiPeriodiBonus','getMovimentiBonus',
   'aggiornaMovimentoBonus','eliminaMovimentoBonus','getPeriodiBonus','salvaPeriodoBonus',
   'ricalcolaPeriodoBonus'].forEach(function(n) {
    check('API espone ' + n, typeof API[n] === 'function');
  });

  console.log('\n' + pass + ' passati, ' + fail + ' falliti');
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('ERRORE: ' + e.stack); process.exit(1); });
