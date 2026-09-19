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

console.log('\n--- portale dipendente: sola lettura ---');
// La vendita si registra dal modulo Vendite, non da qui: il bonus lo crea un
// innesco sul database. Questa pagina mostra soltanto numeri gia' scritti.
// Effetto piu' importante: il bonus non si calcola piu' in due posti che
// possono divergere, quindi l'anteprima non puo' piu' dire una cifra diversa
// da quella accreditata.
check('il modulo si registra come BonusVenduto', /ENI\.Modules\.BonusVenduto/.test(venduto));
check('non registra piu nessuna vendita', !/registraVenditaBonus/.test(venduto));
check('non chiama mai salvaVendita direttamente', !/salvaVendita\(/.test(venduto));
check('non c e piu il pulsante "Ho venduto"', !/Ho venduto/.test(venduto));
check('non calcola piu il bonus per conto suo: lo legge e basta',
  !/BonusCalcoli\.bonusRiga\(/.test(venduto));
check('non legge piu l elenco articoli: non deve piu sceglierli',
  !/getArticoliBonus\(/.test(venduto));
check('mostra i propri movimenti', /getMieiMovimentiBonus\(/.test(venduto));
check('mostra i periodi da ricevere', /getMieiPeriodiBonus\(/.test(venduto));

// Il metodo di pagamento (e tutto il modale di vendita) e' sparito da questo
// modulo: si sceglie in Vendite. Resta pero' la lezione, valida per chiunque
// tocchi questi file: una classe 'active' su un .btn non dipinge niente,
// perche' una regola .btn.active in questo progetto non esiste - gli
// interruttori dell'app hanno ciascuno la propria (tab-btn, chip, pos-tab-btn).
const css = fs.readFileSync(P + 'css/components.css', 'utf8');
check("nessuna regola .btn.active nel CSS: non affidarcisi",
  !/\.btn\.active|\.btn-outline\.active|\.btn-primary\.active/.test(css));
check('il portale del bonus non ha piu nessun selettore di pagamento',
  !/data-metodo=/.test(venduto));
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
// L'operatore Lavaggi non ha accesso in lettura al magazzino: senza quello
// l'elenco articoli del modulo gli torna sempre vuoto, senza errore - un
// vicolo cieco inspiegabile. Il modulo resta solo per chi puo' leggere il
// magazzino: Admin e Cassiere.
check('bonus-venduto NON e concesso al ruolo Lavaggi', !/'bonus-venduto'/.test(moduliDiRuolo('Lavaggi')));

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
// Ancorati al corpo di getArticoliBonus: senza la finestra, la stringa
// basterebbe a farli passare anche se il filtro finisse in un'altra funzione.
check('l elenco esclude i Lavaggi (ma non gli articoli con categoria nulla)',
  /function getArticoliBonus\(\)[\s\S]{0,700}?\.or\('categoria\.is\.null,categoria\.neq\.Lavaggi'\)/.test(apiSrcT11));
check('l elenco esclude gli articoli senza prezzo',
  /function getArticoliBonus\(\)[\s\S]{0,700}?\.gt\('prezzo_vendita', 0\)/.test(apiSrcT11));
check('nessun filtro residuo sul bonus in magazzino',
  !/filtro-solo-bonus/.test(magSrcT11));
check('la scheda articolo non manda piu bonus_attivo',
  !/bonus_attivo/.test(magSrcT11));
const migrT11 = fs.readFileSync(P + 'supabase/migrations/20260917_bonus_3_tutti_articoli.sql', 'utf8');
check('la funzione di vendita rifiuta i Lavaggi', /categoria = 'Lavaggi'/.test(migrT11));
check('la funzione di vendita non guarda piu bonus_attivo',
  !/bonus_attivo is not true/.test(migrT11));
check('il trigger di protezione viene tolto',
  /drop trigger if exists magazzino_bonus_attivo_guard/.test(migrT11));

console.log('\n--- le fasce si leggono come intervalli (Da ... A) ---');
// Il gestore ragiona per intervalli ("da 0 a 10, da 10 a 15"), ma si memorizza
// solo l'inizio di ogni fascia: due estremi scritti a mano possono lasciare un
// buco (0-10 e poi 11-30: i pezzi da 10,50 non prendono niente e nessuno se ne
// accorge). La colonna "A" e' quindi la STESSA informazione letta al contrario,
// non un secondo dato. Questi controlli tengono insieme le due cose.
const imp = fs.readFileSync(P + 'js/modules/impostazioni.js', 'utf8');

check('la tabella delle fasce ha la colonna A (€)',
  /<th>Da \(€\)<\/th><th>A \(€\)<\/th><th>Percentuale<\/th>/.test(imp));
check('ogni riga ha la casella di fine fascia', /class="form-input bonus-f-a"/.test(imp));
check("scrivere la fine di una riga sposta l'inizio di quella dopo",
  /function _bonusPropagaFine[\s\S]{0,600}?\.bonus-f-da/.test(imp));
check("la fine di ogni riga si ricava dall'inizio della successiva",
  /function _bonusAggancia[\s\S]{0,900}?bonus-f-a/.test(imp));
// Con una fascia sola, quella riga e' anche l'ultima: se la sua "A" fosse
// spenta, per scrivere "da 0 a 10" bisognerebbe prima indovinare "Aggiungi
// fascia". La fine dell'ultima riga si scrive, e scriverla APRE la fascia dopo.
check("l'ultima fascia resta aperta finche' non se ne scrive la fine",
  /function _bonusAggancia[\s\S]{0,900}?placeholder = 'in su'/.test(imp));
check("scrivere la fine dell'ultima fascia apre quella successiva",
  /function _bonusPropagaFine[\s\S]{0,900}?_bonusFasciaRigaHtml\(null\)/.test(imp));
check("cancellarla richiude la fascia appena aperta, se e' ancora intonsa",
  /function _bonusPropagaFine[\s\S]{0,900}?_bonusRigaIntonsa[\s\S]{0,200}?remove\(\)/.test(imp));
check("nessuna casella della tabella fasce e' spenta",
  !/function _bonusAggancia[\s\S]{0,900}?disabled = true/.test(imp));
check("dice che l'estremo alto appartiene gia' alla fascia successiva",
  /è già della fascia successiva/.test(imp));
check('le righe si riordinano per importo', /function _bonusRiordina/.test(imp));

// Il punto su cui poggia tutto: per quanto la tabella mostri due estremi, quello
// che parte verso il database resta {da_prezzo, percentuale}. Se un giorno
// _bonusLeggiForm cominciasse a spedire anche la "A", salvaFasceBonus la
// scriverebbe in una colonna che non esiste e il salvataggio si romperebbe.
check('si continua a salvare solo inizio e percentuale',
  /function _bonusLeggiForm[\s\S]{0,900}?da_prezzo: da, percentuale: pc/.test(imp) &&
  !/bonus-f-a[\s\S]{0,200}?fasce\.push/.test(imp));

console.log('\n--- la fascia si sceglie sul totale della vendita ---');
// Il gestore guardava "prezzo 12,00" e "bonus 1,80" e non poteva sapere che in
// mezzo c'erano 36 EUR: il totale non era scritto da nessuna parte. Ora c'e',
// insieme alla fascia applicata. E le due aritmetiche (JS per l'anteprima, SQL
// per il valore accreditato) devono guardare entrambe il totale, o si torna al
// caso peggiore: anteprima diversa da quello che si incassa.
const lib   = fs.readFileSync(P + 'js/lib/bonus-calcoli.js', 'utf8');
const migr5 = fs.readFileSync(P + 'supabase/migrations/20260919_bonus_5_fascia_sul_totale.sql', 'utf8');
const migr7 = fs.readFileSync(P + 'supabase/migrations/20260919_bonus_7_dalle_vendite.sql', 'utf8');

check('in JS la fascia si cerca su prezzo × quantita',
  /fasciaPerImporto\(p \* q,/.test(lib));
check('il nome non parla piu di "prezzo", che era l equivoco',
  !/fasciaPerPrezzo/.test(lib));
check('in SQL la fascia si cerca sul totale',
  /v_totale := p_prezzo \* p_quantita/.test(migr5) &&
  /da_prezzo'\)::numeric <= v_totale/.test(migr5));
check('in SQL la percentuale si applica allo stesso totale',
  /round\(v_totale \* v_perc \/ 100, 2\)/.test(migr5));
check('la migration 5 tiene la guardia is_staff introdotta dalla 4',
  /is_staff\(\)/.test(migr5));
check('in SQL il bonus per importo segue la stessa regola',
  /round\(p_importo \* v_perc \/ 100, 2\)/.test(migr7));

console.log('\n--- il bonus nasce dalle vendite, da solo ---');
// La vendita si registra dal modulo Vendite e basta. Un innesco sul database
// crea la riga di bonus per ogni riga di vendita che ne ha diritto: nessuno
// deve ricordarsi di fare niente, e non esistono due strade per la stessa
// vendita.
check("l'innesco e agganciato alle righe di vendita",
  /create trigger[\s\S]{0,200}?on public\.vendite_dettaglio/.test(migr7));
check("l'autore lo decide la sessione, non operatore_id che arriva dal browser",
  /current_staff_id\(\)/.test(migr7) && !/new\.operatore_id|v_vend\.operatore_id/.test(migr7));
check('il gestore non si autopaga il bonus', /super_admin is true/.test(migr7));
check('i lavaggi restano fuori',
  /lavaggio_id is not null/.test(migr7) && /'Lavaggi'/.test(migr7));
check('il bonus si calcola sul totale effettivo della riga, sconto gia tolto',
  /totale_riga/.test(migr7));
// Se l'innesco esplode, la vendita NON deve fallire: al banco il registratore
// di cassa viene prima del bonus. La riga mancante il gestore la aggiunge a mano.
check('un errore nell innesco non fa fallire la vendita',
  /\nexception[\s\S]{0,400}?when others then[\s\S]{0,60}?return new/.test(migr7));
check('le due vie di vendita del bonus vengono tolte',
  /drop function if exists public\.registra_vendita_bonus\(/.test(migr7) &&
  /drop function if exists public\.registra_vendita_bonus_libera\(/.test(migr7));

console.log('\n--- correzioni della revisione ---');
const migr8 = fs.readFileSync(P + 'supabase/migrations/20260919_bonus_8_reso_per_riga.sql', 'utf8');

// "Incasso Credito" e' il rientro di un debito, non una vendita: il gestionale
// lo dichiara e la cassa lo esclude dal venduto. Senza la guardia, registrare
// 400 EUR restituiti da un cliente fruttava 40 EUR di premio.
check('riscuotere un credito non paga bonus',
  /new\.categoria in \('Lavaggi', 'Incasso Credito'\)/.test(migr8));
check('la categoria esclusa e la stessa dichiarata in config.js',
  /CATEGORIA_INCASSO_CREDITO:\s*'Incasso Credito'/.test(config));

// totale_riga porta solo lo sconto di riga: quello sull'intero scontrino sta
// sulla testata. Senza ripartirlo, un carrello da 100 scontato a 50 pagava il
// bonus su 100.
check('lo sconto sull intero scontrino si ripartisce sulle righe',
  /v_quota := v_vend\.totale \/ v_vend\.subtotale/.test(migr8));
check('una maggiorazione non gonfia il bonus',
  /if v_quota > 1 then v_quota := 1/.test(migr8));

// Il reso di un articolo non deve far perdere il bonus dell'intero scontrino.
check('ogni bonus sa da quale riga di scontrino viene',
  /add column if not exists vendita_dettaglio_id/.test(migr8) &&
  /vendita_dettaglio_id\)?\s*,?\s*[\s\S]{0,300}?new\.id/.test(migr8));
check('il reso cancella solo il bonus della riga resa',
  /on public\.resi_dettaglio[\s\S]{0,200}?togli_bonus_riga_resa|delete from public\.bonus_movimenti\s*\n\s*where vendita_dettaglio_id/.test(migr8));
check('il reso parziale non fa piu piazza pulita sull intera vendita',
  /new\.stato in \('annullata', 'reso_totale'\)/.test(migr8) &&
  !/'reso_parziale'[\s\S]{0,200}?delete from public\.bonus_movimenti where vendita_id/.test(migr8));

check('il gestore riconosce le righe vendute fuori magazzino',
  /fuori magazzino/i.test(gest));

// .form-input nasce per i moduli a tutta larghezza (12px di imbottitura per
// lato + le frecce del campo numerico): dentro le celle strette della tabella
// righe il numero veniva tagliato. Le due caselle hanno uno stile proprio.
check('le caselle strette della tabella righe non usano l imbottitura piena',
  /\.bg-qta, \.bg-bonus \{ padding:/.test(gest));
check('e non mostrano le frecce del campo numerico, che rubano spazio',
  /webkit-inner-spin-button/.test(gest) && /-moz-appearance:textfield/.test(gest));

console.log('\n--- annullare una vendita e possibile davvero ---');
// Tutta la rete di sicurezza del bonus si regge sull'annullamento (un
// dipendente non deve poter incassare il bonus e poi far sparire la vendita
// tenendosi i soldi). Ma annullaVendita esisteva in api.js senza che nessuno
// la chiamasse: dallo storico si poteva solo fare un Reso. Senza il pulsante,
// l'innesco che toglie il bonus non puo' nemmeno scattare.
const vend = fs.readFileSync(P + 'js/modules/vendita.js', 'utf8');
check('lo storico Vendite ha il pulsante Annulla', /data-annulla-vendita=/.test(vend));
check('e chiama davvero la funzione che annulla', /API\.annullaVendita\(/.test(vend));
check('chiede conferma prima',
  /UI\.confirm\(\{[\s\S]{0,1200}?API\.annullaVendita\(/.test(vend));
check("l'annullamento e riservato all'Admin, il Reso resta a tutti",
  /function _puoAnnullare[\s\S]{0,200}?getUserRole\(\) === 'Admin'/.test(vend));

// UI.confirm restituisce una promessa e ignora il secondo argomento: chi gli
// passava una richiamata si ritrovava il codice mai eseguito. Costava il
// carrello che non si svuotava e - molto peggio - un buono cartaceo a
// copertura totale che non concludeva la vendita.
// Attenzione al controllo: la prima versione cercava la richiamata sulla
// STESSA riga di UI.confirm( e passava verde mentre il pagamento POS era
// rotto da sette mesi, perche' li' la richiamata sta su una riga a parte.
// Questo guarda dentro tutta la chiamata, a capo compresi.
check('nessuno passa piu una richiamata a UI.confirm',
  !/UI\.confirm\([\s\S]{0,400}?,\s*\n?\s*function\s*\(/.test(vend));
check('il pagamento POS conclude davvero la vendita',
  /function _pagamentoPOS[\s\S]{0,400}?\.then\(function\(ok\)[\s\S]{0,120}?_completaVendita\('pos'/.test(vend));
check('il pagamento col wallet a saldo capiente conclude davvero la vendita',
  /Scalare[\s\S]{0,500}?\.then\(function\(ok\)[\s\S]{0,200}?_completaVendita\('wallet_digitale'/.test(vend));

console.log('\n--- interruttore generale del modulo ---');
// Il gestore accende il bonus quando e' pronto. Spegnerlo non deve solo
// nascondere le voci di menu: se l'innesco continuasse a lavorare, al
// riaccenderlo si troverebbe un maturato da pagare accumulato in un periodo in
// cui credeva che il bonus non esistesse. Una sola verita': l'elenco
// 'moduli_disabilitati' che gia' decide cosa si vede nel menu.
const migr9 = fs.readFileSync(P + 'supabase/migrations/20260919_bonus_9_interruttore.sql', 'utf8');

check("l'interruttore e nel pannello Bonus delle Impostazioni",
  /id="bonus-attivo-toggle"/.test(imp));
check('accende e spegne insieme la voce del dipendente e quella del gestore',
  /BONUS_MODULI = \['bonus-venduto', 'bonus-gestione'\]/.test(imp));
check('scrive nello stesso elenco che governa il menu',
  /_bonusToggleModulo[\s\S]{0,700}?salvaModuliDisabilitati\(/.test(imp));
check('e aggiorna subito il menu laterale',
  /_bonusToggleModulo[\s\S]{0,900}?refreshSidebar\(\)/.test(imp));
check('spiega che da spento nessuna vendita matura bonus',
  /nessuna vendita matura bonus/.test(imp));

check("a modulo spento l'innesco non crea piu movimenti",
  /jsonb_exists\(valore, 'bonus-venduto'\)/.test(migr9));
check("il controllo e' la PRIMA cosa che fa l'innesco",
  /begin[\s\S]{0,400}?jsonb_exists\(valore, 'bonus-venduto'\)[\s\S]{0,200}?return new/.test(migr9));
check('la migration 9 conserva tutte le guardie della 8',
  /'Lavaggi', 'Incasso Credito'/.test(migr9) &&
  /v_vend\.totale \/ v_vend\.subtotale/.test(migr9) &&
  /vendita_dettaglio_id/.test(migr9) &&
  /when others/.test(migr9));

console.log('\n' + pass + ' passati, ' + fail + ' falliti');
process.exit(fail === 0 ? 0 : 1);
