// Eseguire con: node test/test-ricerca-cliente.js
//
// La ricerca cliente in anagrafica, segnalata il 21/10/2026: "fai in modo
// che ti appaia subito il suo nome e sia cliccabile, poiche' attualmente lo
// devi cercare svariate volte e ti appare l'errore".
//
// Due difetti distinti.
//
// 1. LA TENDINA NON SI FA TROVARE. Si apriva solo sull'evento 'input',
//    cioe' solo mentre si digita. Nessun handler su focus o clic: se si
//    chiudeva e si rientrava nel campo dove il nome era GIA' scritto, non
//    ricompariva niente. Bisognava cancellare una lettera e riscriverla.
//    Poi si premeva Salva e usciva "nessun cliente collegato".
//
// 2. LA RICERCA RESTITUIVA UN CLIENTE INCOMPLETO. cercaClienti chiedeva
//    'modalita_pagamento' ma il modulo fattura legge
//    'modalita_pagamento_fattura' (due colonne diverse), e non chiedeva
//    affatto rif_amministrazione, applica_monofase ne' sede_legale_*.
//    Quindi scegliendo un cliente: modalita di pagamento non
//    precompilata, nessun indirizzo nel riquadro, riferimento
//    amministrazione salvato vuoto, monofase mai proposto.
//
// La regola difesa qui per il secondo: OGNI campo che il modulo fattura
// legge dal cliente deve essere fra quelli chiesti dalla query. E' il
// controllo che avrebbe trovato il difetto da solo.
const fs = require('fs');
const P = 'C:/Users/Utente1/Documents/gestionale_eni/';

let pass = 0, fail = 0;
function check(nome, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + nome); }
  else { fail++; console.log('  FAIL ' + nome + (extra !== undefined ? ' -> ' + extra : '')); }
}

var api = fs.readFileSync(P + 'js/api.js', 'utf8');
var utils = fs.readFileSync(P + 'js/utils.js', 'utf8');
var man = fs.readFileSync(P + 'js/modules/fatturazione/manuale.js', 'utf8');

console.log('\n--- la query della ricerca ---');
var fn = (/async function cercaClienti\(searchTerm\)[\s\S]*?\n    \}/.exec(api) || [''])[0];
check('cercaClienti c e', fn.length > 0);
// La .select() e' scritta su piu' righe come concatenazione di
// stringhe: si prende tutto fino alla parentesi di chiusura e si
// toglie l'impalcatura, altrimenti il controllo non legge niente e
// passa per sbaglio.
var iSel = fn.indexOf('.select(');
var grezzo = iSel > -1 ? fn.slice(iSel + 8, fn.indexOf(')', iSel)) : '';
var select = grezzo.split("'").join('').split('+').join('')
  .split(String.fromCharCode(10)).join(' ').replace(/\s+/g, ' ').trim();
check('chiede un elenco di colonne', select.length > 0, select);
var chieste = select.split(',').map(function(s) { return s.trim(); });

console.log('\n--- ogni campo che il modulo fattura legge deve arrivare ---');
// Le colonne vere di public.clienti, lette dal database il 21/10/2026.
// Serve un riferimento: il modulo e' pieno di commenti in italiano, e
// senza l'elenco si finisce a scambiare una parola per un nome di campo.
var COLONNE_CLIENTI = ['abi_banca','alias_import_eni','applica_monofase','attivo',
  'banca_appoggio','cab_banca','codice_destinatario_sdi','created_at','email','iban',
  'id','id_cliente_eni','listino_personalizzato','mandate_id','modalita_pagamento',
  'modalita_pagamento_fattura','nome_ragione_sociale','note','note_fatturazione',
  'p_iva_coe','pec','rif_amministrazione','scadenza_giorni','sede_legale_cap',
  'sede_legale_comune','sede_legale_indirizzo','sede_legale_nazione',
  'sede_legale_provincia','targa','telefono','tipo','updated_at',
  'voci_ricorrenti_fattura'];

var letti = {};
['cliente', '_clienteSelezionato'].forEach(function(v) {
  var re = new RegExp(v + '[.]([a-z_]+)', 'g'), m;
  while ((m = re.exec(man)) !== null) {
    if (COLONNE_CLIENTI.indexOf(m[1]) > -1) letti[m[1]] = true;
  }
});
var nomi = Object.keys(letti).sort();
check('qualche campo del cliente e letto dal modulo', nomi.length > 0, nomi.join(', '));

var mancanti = nomi.filter(function(c) { return chieste.indexOf(c) === -1; });
check('la query chiede tutti i campi che il modulo legge',
  mancanti.length === 0, 'mancano: ' + mancanti.join(', '));


console.log('\n--- e in particolare quelli che servivano alla fattura ---');
['modalita_pagamento_fattura', 'rif_amministrazione', 'applica_monofase',
 'sede_legale_indirizzo', 'sede_legale_cap', 'sede_legale_comune'].forEach(function(c) {
  check(c + ' viene chiesto', chieste.indexOf(c) > -1);
});

console.log('\n--- la tendina si fa trovare ---');
check('si riapre rientrando nel campo',
  /addEventListener\('focus'/.test(utils) || /addEventListener\('click'/.test(utils));
check('e cerca anche senza che si digiti',
  /function\s+_cerca|function\s+esegui|_eseguiRicerca/.test(utils));
check('parte dal primo carattere', /minChars\s*\|\|\s*1|minChars:\s*1|SEARCH_MIN_CHARS/.test(utils));
check('Invio scegli il primo risultato',
  /addEventListener\('keydown'/.test(utils) && /Enter/.test(utils));

console.log('\n--- e non si fa sovrascrivere da una risposta in ritardo ---');
// Due ricerche in volo: se la prima torna dopo la seconda, rimetteva in
// tendina i risultati vecchi mentre nel campo c'era un altro testo.
check('le risposte vecchie vengono scartate',
  /_seq|richiesta\+\+|var\s+seq/.test(utils));

console.log('\n--- le soglie ---');
var cfg = fs.readFileSync(P + 'js/config.js', 'utf8');
var minC = (/SEARCH_MIN_CHARS:\s*(\d+)/.exec(cfg) || ['', ''])[1];
var deb = (/SEARCH_DEBOUNCE_MS:\s*(\d+)/.exec(cfg) || ['', ''])[1];
check('si cerca dal primo carattere', Number(minC) === 1, 'SEARCH_MIN_CHARS=' + minC);
check('e si aspetta meno di 300 ms', Number(deb) < 300, 'SEARCH_DEBOUNCE_MS=' + deb);

console.log('\n' + pass + ' passati, ' + fail + ' falliti');
process.exit(fail === 0 ? 0 : 1);
