// Eseguire con: node test/test-bonus-moduli.js
//
// Controlli sul sorgente dei moduli del bonus. Non provano il comportamento
// (servirebbe un browser) ma impediscono che un pezzo si scolleghi in
// silenzio: il menu senza la voce, il modulo senza il tag script, l'anteprima
// del bonus calcolata con una regola diversa da quella configurata.
const fs = require('fs');
const P = 'C:/Users/Utente1/Documents/gestionale_eni/';

let pass = 0, fail = 0;
function check(nome, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + nome); }
  else { fail++; console.log('  FAIL ' + nome + (extra !== undefined ? ' -> ' + extra : '')); }
}

const venduto = fs.readFileSync(P + 'js/modules/bonus-venduto.js', 'utf8');
const config  = fs.readFileSync(P + 'js/config.js', 'utf8');
const app     = fs.readFileSync(P + 'js/app.js', 'utf8');
const index   = fs.readFileSync(P + 'index.html', 'utf8');

console.log('\n--- portale dipendente ---');
check('il modulo si registra come BonusVenduto', /ENI\.Modules\.BonusVenduto/.test(venduto));
check('legge gli articoli a bonus', /getArticoliBonus\(/.test(venduto));
check('registra la vendita SOLO tramite l API dedicata',
  /registraVenditaBonus\(/.test(venduto));
check('non chiama mai salvaVendita direttamente', !/salvaVendita\(/.test(venduto));
check('mostra l anteprima del bonus prima di confermare',
  /BonusCalcoli\.bonusRiga\(/.test(venduto));
check('il prezzo e mostrato ma non modificabile',
  /readonly|disabled/.test(venduto));
check('chiede contanti o pos', /contanti/.test(venduto) && /pos/.test(venduto));
check('mostra i periodi da ricevere', /getMieiPeriodiBonus\(/.test(venduto));
check('e in ES5: niente let, const o arrow function',
  !/\b(let|const)\s|=>/.test(venduto.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')));

console.log('\n--- menu e permessi ---');
check('la voce esiste in NAV_ITEMS', /id: 'bonus-venduto'/.test(config));
check('la rotta e #/bonus-venduto', /route: '#\/bonus-venduto'/.test(config));
check('il modulo e concesso ai ruoli dipendente',
  (config.match(/'bonus-venduto'/g) || []).length >= 3, (config.match(/'bonus-venduto'/g) || []).length);
check('la voce e nascosta al super admin',
  /item\.id === 'bonus-venduto' && isSA/.test(app));

console.log('\n--- caricamento ---');
check('index.html carica bonus-calcoli', /js\/lib\/bonus-calcoli\.js\?v=/.test(index));
check('index.html carica il modulo dipendente', /js\/modules\/bonus-venduto\.js\?v=/.test(index));
check('la libreria e caricata PRIMA del modulo',
  index.indexOf('js/lib/bonus-calcoli.js') < index.indexOf('js/modules/bonus-venduto.js'));

console.log('\n' + pass + ' passati, ' + fail + ' falliti');
process.exit(fail === 0 ? 0 : 1);
