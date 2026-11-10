// Eseguire con: node test/test-iban-mandato.js
//
// ABI/CAB ricavati dall'IBAN e stato del mandato SDD. Un ABI/CAB sbagliato
// manda la RIBA alla banca sbagliata; uno stato mandato sbagliato fa partire
// (o bloccare) un addebito RID.
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
vm.runInContext(fs.readFileSync(P + 'js/lib/iban-mandato.js', 'utf8'), sandbox,
  { filename: 'iban-mandato.js' });
const M = sandbox.ENI.IbanMandato;

console.log('abiCab');
// Struttura SM: SM + 2 check + CIN + ABI(5) + CAB(5) + conto(12)
let r = M.abiCab('SM86U0328709801000000123456');
check('IBAN SM -> ABI', r && r.abi === '03287', JSON.stringify(r));
check('IBAN SM -> CAB', r && r.cab === '09801', JSON.stringify(r));
r = M.abiCab('sm86 u032 8709 8010 0000 0123 456');
check('spazi e minuscole', r && r.abi === '03287' && r.cab === '09801', JSON.stringify(r));
r = M.abiCab('IT60X0542811101000000123456');
check('IBAN IT', r && r.abi === '05428' && r.cab === '11101', JSON.stringify(r));
check('estero -> null', M.abiCab('DE89370400440532013000') === null);
check('troppo corto -> null', M.abiCab('SM86U03287098') === null);
check('vuoto -> null', M.abiCab('') === null && M.abiCab(null) === null);
check('ABI non numerico -> null', M.abiCab('SM86U0A28709801000000123456') === null);

console.log('statoMandato');
check('nessun codice', M.statoMandato({}) === 'mancante');
check('codice senza firma', M.statoMandato({ mandate_id: 'RSM-SDD-000001' }) === 'attesa_firma');
check('codice + firma', M.statoMandato({ mandate_id: 'C43SF450200007', mandato_data_firma: '2012-01-02' }) === 'valido');
check('null', M.statoMandato(null) === 'mancante');

console.log('\n' + pass + ' ok, ' + fail + ' falliti');
process.exit(fail ? 1 : 0);
