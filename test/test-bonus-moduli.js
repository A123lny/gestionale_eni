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
check('la libreria e caricata PRIMA del modulo dipendente',
  index.indexOf('js/lib/bonus-calcoli.js') < index.indexOf('js/modules/bonus-venduto.js'));
// bonus-gestione.js usa ENI.BonusCalcoli.arrotonda (correzione riga, riga a
// mano): senza questo controllo, un riordino degli script romperebbe anche
// il lato gestore senza che nessun test se ne accorga.
check('la libreria e caricata PRIMA del modulo gestore',
  index.indexOf('js/lib/bonus-calcoli.js') < index.indexOf('js/modules/bonus-gestione.js'));

console.log('\n--- gestione (lato gestore) ---');
const gest = fs.readFileSync(P + 'js/modules/bonus-gestione.js', 'utf8');
check('il modulo si registra come BonusGestione', /ENI\.Modules\.BonusGestione/.test(gest));
check('legge i movimenti del mese', /getMovimentiBonus\(/.test(gest));
check('permette di correggere una riga', /aggiornaMovimentoBonus\(/.test(gest));
check('permette di cancellare una riga', /eliminaMovimentoBonus\(/.test(gest));
check('permette di segnare come pagato', /salvaPeriodoBonus\(/.test(gest));
check('permette di ricalcolare un periodo', /ricalcolaPeriodoBonus\(/.test(gest));
// Ancorato al blocco che genera davvero l'avviso (il bottone Ricalcola li'
// vicino): "non corrisponde" da solo resterebbe verde anche se l'avviso
// sparisse ma ne restasse menzione in un commento.
check('avvisa quando il periodo non corrisponde ai movimenti',
  /non corrisponde[\s\S]{0,400}data-ricalcola=/.test(gest));
// Ancorato al percorso di eliminazione: un UI.confirm( usato altrove nel
// file non deve bastare a far passare questo controllo.
check('chiede conferma prima di cancellare',
  /UI\.confirm\(\{[\s\S]{0,400}?eliminaMovimentoBonus\(/.test(gest));
check('e riservato al super admin', /'bonus-gestione'/.test(config) &&
  /MODULI_SUPER_ADMIN[\s\S]{0,200}'bonus-gestione'/.test(config));
check('index.html carica il modulo gestore', /js\/modules\/bonus-gestione\.js\?v=/.test(index));

// E' esattamente il buco scoperto nella Task 8 per bonus-venduto, capitato
// di nuovo (e corretto) qui: senza questa riga il router non trova il
// modulo e la voce di menu porta a una pagina vuota.
check('la rotta e registrata in js/router.js',
  /'bonus-gestione':\s*\{\s*module:\s*'BonusGestione'/.test(router));

// NAV_SECTION_ITEMS non basta: e' NAV_SECTIONS['gestione-personale'].children
// che decide cosa compare davvero nella sezione collassabile. Isolato come
// per moduliDiRuolo, per non passare solo perche' 'bonus-gestione' compare
// altrove nel file.
function childrenDiSezione(idSezione) {
  var m = config.match(new RegExp("id:\\s*'" + idSezione + "'[\\s\\S]{0,800}?children:\\s*\\[([^\\]]*)\\]"));
  return m ? m[1] : '';
}
check("la voce e' nei children della sezione Gestione Personale (altrimenti invisibile in menu)",
  /'bonus-gestione'/.test(childrenDiSezione('gestione-personale')));

// Il fix principale del listener duplicato: #bg-lista non viene ricreato ad
// ogni _render(), quindi il click va agganciato con UI.delegate (guardia
// anti-duplicati) e non con un addEventListener diretto sullo stesso nodo -
// altrimenti i gestori si accumulano ad ogni ricarica/azione.
check('il click sulla lista di riepilogo usa UI.delegate, non si accumula ad ogni ricarica',
  /UI\.delegate\(lista,\s*'click'/.test(gest) && !/lista\.addEventListener\(/.test(gest));

console.log('\n--- il bonus vale su tutto il magazzino ---');
const apiSrcT11 = fs.readFileSync(P + 'js/api.js', 'utf8');
const magSrcT11 = fs.readFileSync(P + 'js/modules/magazzino.js', 'utf8');
check('non esiste piu un interruttore per articolo',
  !/setBonusArticolo/.test(apiSrcT11) && !/bonus-toggle/.test(magSrcT11));
check('l elenco esclude i Lavaggi', /\.neq\('categoria', 'Lavaggi'\)/.test(apiSrcT11));
check('l elenco esclude gli articoli senza prezzo', /\.gt\('prezzo_vendita', 0\)/.test(apiSrcT11));
check('nessun filtro residuo sul bonus in magazzino',
  !/filtro-solo-bonus/.test(magSrcT11));
check('la scheda articolo non manda piu bonus_attivo',
  !/bonus_attivo/.test(magSrcT11));
const migrT11 = fs.readFileSync(P + 'supabase/migrations/20260917_bonus_tutti_articoli.sql', 'utf8');
check('la funzione di vendita rifiuta i Lavaggi', /categoria = 'Lavaggi'/.test(migrT11));
check('la funzione di vendita non guarda piu bonus_attivo',
  !/bonus_attivo is not true/.test(migrT11));
check('il trigger di protezione viene tolto',
  /drop trigger if exists magazzino_bonus_attivo_guard/.test(migrT11));

console.log('\n' + pass + ' passati, ' + fail + ' falliti');
process.exit(fail === 0 ? 0 : 1);
