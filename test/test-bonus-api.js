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
    neq(c, v) { azioni.push({ op: 'neq', tabella, campo: c, valore: v }); return q; },
    gt(c, v) { azioni.push({ op: 'gt', tabella, campo: c, valore: v }); return q; },
    or(cond) { azioni.push({ op: 'or', tabella, condizione: cond }); return q; },
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
  console.log('\n--- il bonus non si registra piu da qui ---');
  // Dal 19/09/2026 la vendita si fa SOLO dal modulo Vendite, e il bonus lo
  // crea un innesco sul database. Le due funzioni di vendita del bonus sono
  // state tolte apposta: se restassero, resterebbe una seconda strada per
  // registrare la stessa vendita - il doppione che si voleva eliminare.
  check('registraVenditaBonus non esiste piu', typeof API.registraVenditaBonus === 'undefined');
  check('registraVenditaBonusLibera non esiste piu',
    typeof API.registraVenditaBonusLibera === 'undefined');
  const apiSrc = fs.readFileSync(P + 'js/api.js', 'utf8');
  check('e non ne resta traccia nemmeno nel sorgente',
    !/registra_vendita_bonus/.test(apiSrc));
  // I movimenti li crea l'innesco sul database. L'UNICA scrittura diretta
  // ammessa da qui e' la riga che il gestore aggiunge a mano dalla sua scheda.
  // Contare invece di ritagliare il sorgente: la versione precedente tagliava
  // la funzione cercando "}" seguita da \n, e bastava il passaggio a CRLF del
  // merge per farla fallire senza che nulla fosse cambiato davvero.
  const scrittureDirette = (apiSrc.match(/from\('bonus_movimenti'\)[\s\S]{0,160}?\.insert\(/g) || []).length;
  check("l'unica scrittura diretta in bonus_movimenti e la riga aggiunta a mano",
    scrittureDirette === 1 &&
    /async function aggiungiMovimentoBonus[\s\S]{0,600}?from\('bonus_movimenti'\)[\s\S]{0,160}?\.insert\(/.test(apiSrc),
    'scritture dirette trovate: ' + scrittureDirette);

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
  const upsRegola = azioni.filter(a => a.op === 'upsert' && a.tabella === 'impostazioni_app');
  check('la modalita si salva come stringa nuda, non come oggetto',
    upsRegola.some(a => a.dati.chiave === 'bonus_modo' && typeof a.dati.valore === 'string'),
    JSON.stringify(upsRegola.map(a => a.dati)));
  check('l importo al pezzo si salva come numero nudo',
    upsRegola.some(a => a.dati.chiave === 'bonus_euro_pezzo' && typeof a.dati.valore === 'number'));

  azioni.length = 0;
  await API.salvaFasceBonus([{ da_prezzo: 0, percentuale: 3 }, { da_prezzo: 10, percentuale: 5 }]);
  check('cancella le fasce vecchie prima di riscriverle',
    azioni.some(a => a.op === 'delete' && a.tabella === 'bonus_fasce'));
  check('inserisce le fasce nuove',
    azioni.some(a => a.op === 'insert' && a.tabella === 'bonus_fasce'));

  console.log('\n--- il bonus vale su tutto il magazzino ---');
  azioni.length = 0;
  await API.getArticoliBonus();
  check('esclude i Lavaggi (ma non gli articoli con categoria nulla)',
    azioni.some(a => a.op === 'or' && a.tabella === 'magazzino' &&
      a.condizione === 'categoria.is.null,categoria.neq.Lavaggi'));
  check('esclude gli articoli senza prezzo',
    azioni.some(a => a.op === 'gt' && a.tabella === 'magazzino' && a.campo === 'prezzo_vendita' && a.valore === 0));
  check('esclude gli articoli non attivi',
    azioni.some(a => a.op === 'eq' && a.tabella === 'magazzino' && a.campo === 'attivo' && a.valore === true));
  // Il residuo peggiore: se fosse rimasto un filtro su bonus_attivo l'elenco
  // sarebbe vuoto per tutti, e senza questo controllo i test passerebbero
  // comunque perche' nessuno guarda cosa NON c'e' tra i filtri registrati.
  check('l elenco non filtra piu su bonus_attivo',
    !azioni.some(a => a.campo === 'bonus_attivo'),
    JSON.stringify(azioni.filter(a => a.op === 'eq')));

  console.log('\n--- esportate ---');
  ['getRegolaBonus','salvaRegolaBonus','salvaFasceBonus','getArticoliBonus',
   'getMieiMovimentiBonus','getMieiPeriodiBonus','getMovimentiBonus',
   'aggiornaMovimentoBonus','eliminaMovimentoBonus','getPeriodiBonus','salvaPeriodoBonus',
   'ricalcolaPeriodoBonus','aggiungiMovimentoBonus'].forEach(function(n) {
    check('API espone ' + n, typeof API[n] === 'function');
  });
  check('setBonusArticolo non esiste piu', typeof API.setBonusArticolo === 'undefined');

  console.log('\n' + pass + ' passati, ' + fail + ' falliti');
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('ERRORE: ' + e.stack); process.exit(1); });
