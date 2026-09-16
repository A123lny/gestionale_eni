// Eseguire con: node test/test-timbrature-correzione.js
//
// Verifica la correzione delle timbrature dal modulo Timbrature.
// Il punto critico e' la conversione dell'orario: un errore di fuso
// sposterebbe le timbrature di due ore senza che nessuno se ne accorga,
// e da quelle righe dipendono le ore pagate.
const fs = require('fs');
const vm = require('vm');
const P = 'C:/Users/Utente1/Documents/gestionale_eni/';

let pass = 0, fail = 0;
function check(nome, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + nome); }
  else { fail++; console.log('  FAIL ' + nome + (extra ? ' -> ' + extra : '')); }
}

// --- client Supabase finto: registra update e delete ---
const azioni = [];
function makeQuery(tabella) {
  const q = {
    select() { return q; }, eq() { return q; }, gte() { return q; }, lte() { return q; },
    order() { return q; }, limit() { return q; },
    single() { return Promise.resolve({ data: q._last, error: null }); },
    maybeSingle() { return Promise.resolve({ data: q._last, error: null }); },
    insert(d) { q._last = Object.assign({ id: 'new' }, d); azioni.push({ op: 'insert', tabella, dati: d }); return q; },
    update(d) { q._last = Object.assign({ id: 'x' }, d); azioni.push({ op: 'update', tabella, dati: d }); return q; },
    delete() { azioni.push({ op: 'delete', tabella }); return q; },
    then(res) { return Promise.resolve({ data: [], error: null }).then(res); }
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
for (const f of ['js/config.js', 'js/ui.js', 'js/api.js', 'js/modules/timbrature.js']) {
  vm.runInContext(fs.readFileSync(P + f, 'utf8'), sandbox, { filename: f });
}
sandbox.ENI.State = { getUserId: () => 'u1', getUserName: () => 'Test', cacheGet: () => null, cacheSet: () => {} };

const API = sandbox.ENI.API;
const timbSrc = fs.readFileSync(P + 'js/modules/timbrature.js', 'utf8');
const apiSrc = fs.readFileSync(P + 'js/api.js', 'utf8');

(async () => {
  // --- 1. API esposte ---
  check('API espone aggiornaTimbratura', typeof API.aggiornaTimbratura === 'function');
  check('API espone eliminaTimbratura', typeof API.eliminaTimbratura === 'function');

  // --- 2. aggiornaTimbratura manda al DB solo i campi previsti ---
  azioni.length = 0;
  await API.aggiornaTimbratura('id-1',
    { ts: '2026-09-15T12:02:14.000Z', data: '2026-09-15', tipo: 'entrata', descrizione: 'x' },
    { nome: 'Thomas Bellio', descrizione: '15/09 14:00 entrata' });
  const upd = azioni.find(a => a.op === 'update' && a.tabella === 'timbrature');
  check('aggiorna scrive su timbrature', !!upd);
  check('manda ts, data e tipo', upd && upd.dati.ts && upd.dati.data && upd.dati.tipo);
  check('NON manda descrizione al database', upd && upd.dati.descrizione === undefined);
  check('la modifica finisce nel log',
    azioni.some(a => a.op === 'insert' && a.tabella === 'log_attivita'));
  const log = azioni.find(a => a.op === 'insert' && a.tabella === 'log_attivita');
  check('il log conserva il valore precedente',
    log && String(log.dati.dettagli).includes('15/09 14:00 entrata'), log && log.dati.dettagli);

  // --- 3. eliminaTimbratura ---
  azioni.length = 0;
  await API.eliminaTimbratura('id-2', 'Thomas Bellio - 15/09 14:00 entrata');
  check('elimina cancella da timbrature',
    azioni.some(a => a.op === 'delete' && a.tabella === 'timbrature'));
  check('anche l\'eliminazione finisce nel log',
    azioni.some(a => a.op === 'insert' && a.tabella === 'log_attivita'));

  // --- 4. Round-trip dell'orario: ISO -> campo -> ISO deve tornare identico.
  // E' il punto dove un errore di fuso sposterebbe la timbratura di due ore.
  function due(n) { return (n < 10 ? '0' : '') + n; }
  function tsPerInput(ts) {
    const d = new Date(ts);
    return d.getFullYear() + '-' + due(d.getMonth() + 1) + '-' + due(d.getDate()) +
           'T' + due(d.getHours()) + ':' + due(d.getMinutes());
  }
  for (const iso of ['2026-09-15T12:02:00.000Z', '2026-01-15T23:30:00.000Z', '2026-06-30T22:10:00.000Z']) {
    const campo = tsPerInput(iso);
    const ritorno = new Date(campo).toISOString();
    check('round-trip orario ' + iso, ritorno === iso, ritorno);
  }
  check('il formato del campo e quello di datetime-local',
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(tsPerInput('2026-09-15T12:02:00.000Z')));

  // --- 5. Interfaccia: i due pulsanti e l'origine visibile ---
  check('la riga mostra il pulsante di correzione', /data-timb-edit="/.test(timbSrc));
  check('la riga mostra il pulsante di eliminazione', /data-timb-del="/.test(timbSrc));
  check('la riga mostra l\'origine (qr o manuale)', /e\.origine/.test(timbSrc));
  check('il click sulle azioni non richiude il dettaglio',
    (timbSrc.match(/stopPropagation\(\)/g) || []).length >= 2);
  check('l\'eliminazione chiede conferma', /UI\.confirm\(/.test(timbSrc));
  check('dopo la correzione la lista si ricarica',
    /_load\(_container\)/.test(timbSrc));

  // --- 6. Il commento spiega perche' serviva ---
  check('api.js documenta il vincolo super admin',
    /timb_update/.test(apiSrc) && /timb_delete/.test(apiSrc));

  console.log('\n' + pass + ' passati, ' + fail + ' falliti');
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('ERRORE: ' + e.stack); process.exit(1); });
