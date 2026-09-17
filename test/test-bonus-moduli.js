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
const router  = fs.readFileSync(P + 'js/router.js', 'utf8');
const index   = fs.readFileSync(P + 'index.html', 'utf8');

console.log('\n--- portale dipendente ---');
check('il modulo si registra come BonusVenduto', /ENI\.Modules\.BonusVenduto/.test(venduto));
check('legge gli articoli a bonus', /getArticoliBonus\(/.test(venduto));
check('registra la vendita SOLO tramite l API dedicata',
  /registraVenditaBonus\(/.test(venduto));
check('non chiama mai salvaVendita direttamente', !/salvaVendita\(/.test(venduto));
check('mostra l anteprima del bonus prima di confermare',
  /BonusCalcoli\.bonusRiga\(/.test(venduto));
// Ancorato al campo del prezzo: cercare "readonly|disabled" ovunque nel file
// passerebbe anche se il prezzo diventasse modificabile, perche' "disabled"
// compare altrove (il bottone "Ho venduto" quando non ci sono articoli, e
// quello di conferma durante l'invio).
check('il prezzo e mostrato ma non modificabile',
  /id="bv-prezzo"[^>]*readonly/.test(venduto));
// Ancorato all'attributo che il codice legge davvero: un "pos" nudo
// comparirebbe anche in un commento futuro che non ha niente a che fare
// col metodo di pagamento.
check('chiede contanti o pos',
  /data-metodo="contanti"/.test(venduto) && /data-metodo="pos"/.test(venduto));
check('mostra i periodi da ricevere', /getMieiPeriodiBonus\(/.test(venduto));
check('e in ES5: niente let, const, arrow function o template literal',
  !/\b(let|const)\b|=>|`/.test(venduto.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')));

console.log('\n--- menu e permessi ---');
check('la voce esiste in NAV_ITEMS', /id: 'bonus-venduto'/.test(config));
check('la rotta e #/bonus-venduto', /route: '#\/bonus-venduto'/.test(config));

// Non basta contare le occorrenze nel file: un ruolo a cui manca il modulo
// non si vede se se ne conta solo il totale (tre ruoli su quattro punti di
// codice fanno comunque >= 3). Si isola l'array "moduli" di ciascun ruolo e
// si controlla dentro quello.
function moduliDiRuolo(nomeRuolo) {
  var m = config.match(new RegExp(nomeRuolo + ':\\s*\\{[\\s\\S]*?moduli:\\s*\\[([^\\]]*)\\]'));
  return m ? m[1] : '';
}
check('bonus-venduto e concesso al ruolo Admin', /'bonus-venduto'/.test(moduliDiRuolo('Admin')));
check('bonus-venduto e concesso al ruolo Cassiere', /'bonus-venduto'/.test(moduliDiRuolo('Cassiere')));
check('bonus-venduto e concesso al ruolo Lavaggi', /'bonus-venduto'/.test(moduliDiRuolo('Lavaggi')));

// Il dipendente non scrive nelle tabelle: passa dall'RPC. Se 'bonus-venduto'
// finisse in un array 'scrivere' per errore, questo e' il controllo che se ne
// accorge: e' il vincolo su cui poggia tutta la sicurezza del modulo.
check("'bonus-venduto' non e in nessun array scrivere",
  (config.match(/scrivere:\s*\[[^\]]*\]/g) || []).every(function(riga) {
    return riga.indexOf('bonus-venduto') === -1;
  }));

check('la voce e nascosta al super admin',
  /item\.id === 'bonus-venduto' && isSA/.test(app));

console.log('\n--- routing ---');
// E' esattamente il pezzo che si era scollegato la prima volta: senza questa
// riga il router non trova alcun modulo per #/bonus-venduto e la voce di
// menu porta a una pagina vuota.
check("la rotta e registrata in js/router.js",
  /'bonus-venduto':\s*\{\s*module:\s*'BonusVenduto'/.test(router));

console.log('\n--- caricamento ---');
check('index.html carica bonus-calcoli', /js\/lib\/bonus-calcoli\.js\?v=/.test(index));
check('index.html carica il modulo dipendente', /js\/modules\/bonus-venduto\.js\?v=/.test(index));
check('la libreria e caricata PRIMA del modulo',
  index.indexOf('js/lib/bonus-calcoli.js') < index.indexOf('js/modules/bonus-venduto.js'));

console.log('\n--- gestione (lato gestore) ---');
const gest = fs.readFileSync(P + 'js/modules/bonus-gestione.js', 'utf8');
check('il modulo si registra come BonusGestione', /ENI\.Modules\.BonusGestione/.test(gest));
check('legge i movimenti del mese', /getMovimentiBonus\(/.test(gest));
check('permette di correggere una riga', /aggiornaMovimentoBonus\(/.test(gest));
check('permette di cancellare una riga', /eliminaMovimentoBonus\(/.test(gest));
check('permette di segnare come pagato', /salvaPeriodoBonus\(/.test(gest));
check('permette di ricalcolare un periodo', /ricalcolaPeriodoBonus\(/.test(gest));
check('avvisa quando il periodo non corrisponde ai movimenti',
  /non corrisponde/.test(gest));
check('chiede conferma prima di cancellare', /UI\.confirm\(/.test(gest));
check('e riservato al super admin', /'bonus-gestione'/.test(config) &&
  /MODULI_SUPER_ADMIN[\s\S]{0,200}'bonus-gestione'/.test(config));
check('index.html carica il modulo gestore', /js\/modules\/bonus-gestione\.js\?v=/.test(index));

console.log('\n' + pass + ' passati, ' + fail + ' falliti');
process.exit(fail === 0 ? 0 : 1);
