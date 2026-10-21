// Eseguire con: node test/test-ore-lavorate.js
//
// Il confronto fra ore previste (turni) e ore fatte (timbrature). Qui si
// controlla il CALCOLO, non il cablaggio: sono funzioni pure, quindi si
// possono chiamare davvero con dei numeri e guardare cosa tornano.
//
// I casi non sono inventati: vengono dai dati di settembre-ottobre 2026.
// Quelli che contano, e che hanno deciso le regole, sono quattro:
//
//   - settimana 28/09, Alessandro: 32h00 previste, 32h31 timbrate. Il
//     meccanismo quadra, e lo scarto di mezz'ora e' normale.
//   - il gestore e Fabio: turni ogni settimana, zero timbrature da sempre.
//   - lunedi' 13/10: 39h previste su tutta la settimana contro 0 fatte,
//     perche' la settimana era appena iniziata.
//   - tre timbrate aperte in quel momento: gente dentro, ore a zero.
//
// Gli orari hanno il fuso scritto a mano (+02:00) perche' la differenza fra
// due istanti non deve dipendere da dove gira il test.
const Ore = require('../js/lib/ore-lavorate.js');

let pass = 0, fail = 0;
function check(nome, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + nome); }
  else { fail++; console.log('  FAIL ' + nome + (extra !== undefined ? ' -> ' + extra : '')); }
}
function eq(nome, atteso, avuto) {
  check(nome + ' = ' + atteso, atteso === avuto, 'avuto ' + avuto);
}

function ev(data, ora, tipo, pid, nome) {
  return {
    personale_id: pid || 'p1', data: data, tipo: tipo,
    ts: data + 'T' + ora + ':00+02:00',
    personale: { nome_completo: nome || 'Tizio' }
  };
}
function turno(data, oi, of_, pid, nome, extra) {
  return Object.assign({
    personale_id: pid || 'p1', data: data, tipo: 'turno',
    ora_inizio: oi, ora_fine: of_, ora_inizio_2: null, ora_fine_2: null,
    personale: { nome_completo: nome || 'Tizio' }
  }, extra || {});
}

console.log('\n--- ore previste da una riga di turno ---');
eq('un turno 07:30-13:30', 360, Ore.minutiPrevisti(turno('2026-10-05', '07:30:00', '13:30:00')));
eq('con i secondi scritti o no, uguale', 390,
  Ore.minutiPrevisti(turno('2026-10-05', '08:00', '14:30')));
eq('il riposo vale zero', 0,
  Ore.minutiPrevisti({ tipo: 'riposo', ora_inizio: null, ora_fine: null }));
eq('una riga senza orari vale zero', 0,
  Ore.minutiPrevisti({ tipo: 'turno', ora_inizio: null, ora_fine: null }));
eq('niente riga, niente minuti', 0, Ore.minutiPrevisti(null));
// Lo spezzato e' il caso che si sbaglia piu' facilmente: due fasce, e se si
// legge solo la prima si perde mezzo turno. Thomas, 05/10: 09:30-12:30 in
// griglia piu' la seconda fascia.
eq('lo spezzato somma le due fasce', 420, Ore.minutiPrevisti(
  turno('2026-10-05', '09:30:00', '12:30:00', 'p1', 'Thomas',
        { tipo: 'spezzato', ora_inizio_2: '15:30:00', ora_fine_2: '19:30:00' })));
eq('una seconda fascia a meta non rompe il conto', 180, Ore.minutiPrevisti(
  turno('2026-10-05', '09:30:00', '12:30:00', 'p1', 'Thomas',
        { tipo: 'spezzato', ora_inizio_2: '15:30:00', ora_fine_2: null })));
eq('un turno che passa la mezzanotte non va in negativo', 480,
  Ore.minutiPrevisti(turno('2026-10-05', '22:00:00', '06:00:00')));

console.log('\n--- sessioni dalle timbrature ---');
var g = [ev('2026-10-12', '08:07', 'entrata'), ev('2026-10-12', '12:33', 'uscita')];
eq('una entrata e una uscita fanno una sessione', 1, Ore.sessioni(g).length);
eq('e durano 4h26', 266, Ore.minutiLavorati(Ore.sessioni(g)));
eq('nessuna incompleta', 0, Ore.sessioniIncomplete(Ore.sessioni(g)));

// Lo spezzato timbrato: quattro eventi, due sessioni.
var g2 = [ev('2026-10-05', '08:58', 'entrata'), ev('2026-10-05', '12:30', 'uscita'),
          ev('2026-10-05', '15:10', 'entrata'), ev('2026-10-05', '17:44', 'uscita')];
eq('quattro eventi fanno due sessioni', 2, Ore.sessioni(g2).length);
eq('e si sommano', 366, Ore.minutiLavorati(Ore.sessioni(g2)));

// Chi e' dentro adesso: entrata senza uscita.
var g3 = [ev('2026-10-13', '07:57', 'entrata')];
eq('chi e dentro ha una sessione aperta', 1, Ore.sessioniIncomplete(Ore.sessioni(g3)));
eq('e zero minuti, non un numero inventato', 0, Ore.minutiLavorati(Ore.sessioni(g3)));

// Uscita dimenticata il giorno prima: entrata, entrata.
var g4 = [ev('2026-10-12', '08:00', 'entrata'), ev('2026-10-12', '14:00', 'entrata')];
eq('due entrate di fila lasciano due sessioni aperte', 2, Ore.sessioniIncomplete(Ore.sessioni(g4)));
// Entrata dimenticata: solo l'uscita.
eq('una uscita orfana resta incompleta', 1,
  Ore.sessioniIncomplete(Ore.sessioni([ev('2026-10-12', '19:30', 'uscita')])));
eq('gli eventi fuori ordine vengono rimessi in fila', 266, Ore.minutiLavorati(Ore.sessioni(
  [ev('2026-10-12', '12:33', 'uscita'), ev('2026-10-12', '08:07', 'entrata')])));

console.log("\n--- fin dove si confronta (l'ultimo giorno chiuso) ---");
// Settimana finita: si confronta tutta.
eq('settimana passata: fino a sabato', '2026-10-03',
  Ore.ultimoGiornoChiuso('2026-09-28', '2026-10-03', '2026-10-13'));
// Settimana in corso, martedi' 13: si taglia a lunedi'.
eq('settimana in corso: fino a ieri', '2026-10-12',
  Ore.ultimoGiornoChiuso('2026-10-12', '2026-10-17', '2026-10-13'));
// Lunedi': non c'e' ancora niente di chiuso.
eq('il primo giorno della settimana non ha niente da confrontare', null,
  Ore.ultimoGiornoChiuso('2026-10-12', '2026-10-17', '2026-10-12'));

console.log('\n--- il giudizio ---');
eq('mezz ora in piu e in linea', 'in_linea',
  Ore.giudizio({ haTimbrature: true, haTurni: true, minutiPrevisti: 1920, minutiFatti: 1951 }));
eq('esattamente un ora e ancora in linea', 'in_linea',
  Ore.giudizio({ haTimbrature: true, haTurni: true, minutiPrevisti: 1920, minutiFatti: 1980 }));
eq('un minuto oltre la tolleranza no', 'sopra',
  Ore.giudizio({ haTimbrature: true, haTurni: true, minutiPrevisti: 1920, minutiFatti: 1981 }));
eq('tre ore in piu sono sopra', 'sopra',
  Ore.giudizio({ haTimbrature: true, haTurni: true, minutiPrevisti: 1230, minutiFatti: 1414 }));
eq('diciotto ore in meno sono sotto', 'sotto',
  Ore.giudizio({ haTimbrature: true, haTurni: true, minutiPrevisti: 1920, minutiFatti: 795 }));
// Le tre regole che evitano il rosso finto.
eq('turni senza timbrature: non si giudica', 'senza_timbrature',
  Ore.giudizio({ haTimbrature: false, haTurni: true, minutiPrevisti: 1800, minutiFatti: 0 }));
eq('griglia vuota: non si da un numero', 'senza_turni',
  Ore.giudizio({ haTimbrature: true, haTurni: false, minutiPrevisti: 0, minutiFatti: 2988 }));
eq('ne turni ne timbrature: non c e niente da dire', 'nessun_dato',
  Ore.giudizio({ haTimbrature: false, haTurni: false, minutiPrevisti: 0, minutiFatti: 0 }));
check('ogni giudizio ha la sua etichetta',
  ['in_linea', 'sopra', 'sotto', 'senza_timbrature', 'senza_turni', 'nessun_dato'].every(function(k) {
    var e = Ore.etichetta(k);
    return e && e.testo && e.colore;
  }));
check('ne il rosso ne il verde a chi non si giudica',
  ['senza_timbrature', 'senza_turni', 'nessun_dato'].every(function(k) {
    return Ore.etichetta(k).colore === 'neutro';
  }));
// L'etichetta dice un fatto, non da' una patente: chi di solito timbra e
// una settimana non l'ha fatto non deve risultare uno "che non timbra".
check("l'etichetta descrive cosa manca, non la persona",
  Ore.etichetta('senza_timbrature').testo === 'nessuna timbratura');

console.log('\n--- il confronto, settimana del 28/09 (dati veri) ---');
// La settimana vera di Alessandro, turni e timbrature copiati dal database.
// Il 29/09 ha quattro eventi (pausa pranzo), il 30/09 e il 03/10 ha lavorato
// il pomeriggio al posto della mattina -- lo scambio di turno con Luca, mai
// aggiornato in griglia. Il monte ore della settimana quadra comunque: e'
// proprio questo il punto, lo scambio si compensa.
var turni = [
  turno('2026-09-28', '08:30:00', '15:00:00', 'ale', 'Alessandro Donnini'),
  turno('2026-09-29', '08:30:00', '15:00:00', 'ale', 'Alessandro Donnini'),
  turno('2026-09-30', '08:30:00', '15:00:00', 'ale', 'Alessandro Donnini'),
  turno('2026-10-02', '13:00:00', '19:30:00', 'ale', 'Alessandro Donnini'),
  turno('2026-10-03', '08:30:00', '14:30:00', 'ale', 'Alessandro Donnini'),
  { personale_id: 'andrea', data: '2026-09-28', tipo: 'turno',
    ora_inizio: '07:00:00', ora_fine: '13:00:00',
    personale: { nome_completo: 'Andrea Cervellini' } },
  { personale_id: 'andrea', data: '2026-10-01', tipo: 'riposo',
    ora_inizio: null, ora_fine: null,
    personale: { nome_completo: 'Andrea Cervellini' } }
];
var timb = [
  ev('2026-09-28', '08:25', 'entrata', 'ale', 'Alessandro Donnini'),
  ev('2026-09-28', '15:31', 'uscita',  'ale', 'Alessandro Donnini'),
  ev('2026-09-29', '08:29', 'entrata', 'ale', 'Alessandro Donnini'),
  ev('2026-09-29', '12:05', 'uscita',  'ale', 'Alessandro Donnini'),
  ev('2026-09-29', '13:04', 'entrata', 'ale', 'Alessandro Donnini'),
  ev('2026-09-29', '16:30', 'uscita',  'ale', 'Alessandro Donnini'),
  ev('2026-09-30', '13:25', 'entrata', 'ale', 'Alessandro Donnini'),
  ev('2026-09-30', '19:36', 'uscita',  'ale', 'Alessandro Donnini'),
  ev('2026-10-02', '13:29', 'entrata', 'ale', 'Alessandro Donnini'),
  ev('2026-10-02', '19:30', 'uscita',  'ale', 'Alessandro Donnini'),
  ev('2026-10-03', '13:27', 'entrata', 'ale', 'Alessandro Donnini'),
  ev('2026-10-03', '19:40', 'uscita',  'ale', 'Alessandro Donnini')
];
var c = Ore.confronto({ turni: turni, timbrature: timb,
  da: '2026-09-28', a: '2026-10-03', oggi: '2026-10-13' });

eq('due persone nel confronto', 2, c.righe.length);
eq('ordinate per nome, Alessandro per primo', 'Alessandro Donnini', c.righe[0].nome);

var ale = c.righe[0];
eq('previste di Alessandro: 32h00', 1920, ale.minutiPrevisti);
eq('fatte: 32h33', 1953, ale.minutiFatti);
eq('differenza di mezz ora', 33, ale.differenza);
eq('quindi in linea', 'in_linea', ale.giudizio);
eq('e le sei sessioni sono tutte chiuse', 0, ale.aperte);
// Periodo tutto nel passato: i totali interi e quelli dei giorni finiti
// coincidono, e la differenza vale su tutto.
check('il periodo e finito', c.inCorso === false);
eq('previste chiuse = previste intere', 1920, ale.minutiPrevistiChiusi);
eq('fatte chiuse = fatte intere', 1953, ale.minutiFattiChiusi);

var andrea = c.righe[1];
eq('il gestore ha le ore previste', 360, andrea.minutiPrevisti);
eq('e zero fatte', 0, andrea.minutiFatti);
eq('ma non viene giudicato', 'senza_timbrature', andrea.giudizio);
check('il riposo conta come griglia compilata', andrea.haTurni === true);

console.log('\n--- il totale lascia fuori chi non si confronta ---');
// Senza questa regola le 6h previste del gestore entrerebbero nel totale e
// la somma della settimana risulterebbe sballata di tutte le sue ore.
eq('una sola persona confrontabile', 1, c.totale.persone);
eq('previste totali: solo le sue', 1920, c.totale.minutiPrevisti);
eq('fatte totali: solo le sue', 1953, c.totale.minutiFatti);

console.log('\n--- la settimana in corso: totali interi, differenza no ---');
// Caso vero del 13/10. Il monte ore previsto deve essere quello dei turni
// COMPILATI (tre giorni, 19h30), non tagliato: e' il numero che il gestore
// vuole leggere. Ma la differenza su quei tre giorni darebbe -13h, perche'
// due sono ancora da fare: quella si calcola solo su lunedi'.
var inCorso = Ore.confronto({
  turni: [
    turno('2026-10-12', '13:00:00', '19:30:00', 'ale', 'Alessandro Donnini'),
    turno('2026-10-13', '13:00:00', '19:30:00', 'ale', 'Alessandro Donnini'),
    turno('2026-10-14', '13:00:00', '19:30:00', 'ale', 'Alessandro Donnini')
  ],
  timbrature: [
    ev('2026-10-12', '13:05', 'entrata', 'ale', 'Alessandro Donnini'),
    ev('2026-10-12', '19:40', 'uscita',  'ale', 'Alessandro Donnini'),
    ev('2026-10-13', '12:58', 'entrata', 'ale', 'Alessandro Donnini')
  ],
  da: '2026-10-12', a: '2026-10-17', oggi: '2026-10-13'
});
var r = inCorso.righe[0];
check('il periodo e segnato in corso', inCorso.inCorso === true);
eq('la differenza si ferma a ieri', '2026-10-12', inCorso.ultimoGiornoChiuso);
eq('MA le previste sono tutte e tre: 19h30', 1170, r.minutiPrevisti);
eq('e le fatte tutte quelle timbrate', 395, r.minutiFatti);
// La differenza invece guarda solo lunedi': 6h30 previste, 6h35 fatte.
eq('previste dei soli giorni finiti', 390, r.minutiPrevistiChiusi);
eq('fatte dei soli giorni finiti', 395, r.minutiFattiChiusi);
eq('differenza di 5 minuti, non -13h', 5, r.differenza);
eq('quindi in linea', 'in_linea', r.giudizio);

console.log("\n--- chi e' dentro adesso ---");
eq('la timbrata di oggi e segnata aperta', 1, r.aperte);
// L'entrata di oggi senza uscita vale zero minuti: finisce nei totali
// interi (dove non sposta niente) ma non puo' inventare ore.
eq('e non aggiunge ore finte', 395, r.minutiFatti);

console.log('\n--- il totale segue la stessa regola ---');
eq('previste intere nel totale', 1170, inCorso.totale.minutiPrevisti);
eq('fatte intere nel totale', 395, inCorso.totale.minutiFatti);
eq('ma la differenza solo sui giorni finiti', 5, inCorso.totale.differenza);

console.log('\n--- quando la griglia e vuota (3 settimane su 7, a settembre) ---');
var senzaTurni = Ore.confronto({
  turni: [],
  timbrature: [
    ev('2026-09-14', '07:56', 'entrata', 'luca', 'Luca Cardinali'),
    ev('2026-09-14', '17:00', 'uscita',  'luca', 'Luca Cardinali')
  ],
  da: '2026-09-14', a: '2026-09-19', oggi: '2026-10-13'
});
eq('le ore fatte si vedono comunque', 544, senzaTurni.righe[0].minutiFatti);
eq('ma non si inventa un ammanco', 'senza_turni', senzaTurni.righe[0].giudizio);
eq('e il totale non la conta', 0, senzaTurni.totale.persone);

console.log('\n--- formato ---');
eq('ore e minuti', '6h 30m', Ore.fmtOre(390));
eq('sotto l ora', '0h 31m', Ore.fmtOre(31));
eq('lo zero', '0h 00m', Ore.fmtOre(0));
eq('niente diventa zero, non NaN', '0h 00m', Ore.fmtOre(null));
eq('i minuti si arrotondano', '1h 00m', Ore.fmtOre(59.6));
eq('il negativo tiene il segno davanti', '-1h 06m', Ore.fmtOre(-66));
eq('la differenza in piu ha il segno', '+3h 04m', Ore.fmtDiff(184));
eq('la differenza in meno pure', '-18h 45m', Ore.fmtDiff(-1125));
eq('la differenza zero resta nuda', '0h 00m', Ore.fmtDiff(0));

console.log('\n--- la tolleranza e quella misurata, non una a caso ---');
eq('un ora', 60, Ore.TOLLERANZA_MIN);

// ============================================================
// Cablaggio: che le due pagine usino DAVVERO questa libreria.
// Il calcolo giusto in un file che nessuno chiama non serve a niente.
// ============================================================
const fs = require('fs');
const P = 'C:/Users/Utente1/Documents/gestionale_eni/';
function leggi(rel) { return fs.readFileSync(P + rel, 'utf8'); }

var html = leggi('index.html');
var turniJs = leggi('js/modules/turni.js');
var timbJs = leggi('js/modules/timbrature.js');
var sw = leggi('sw.js');

console.log('\n--- index.html carica la libreria ---');
check('la libreria e fra gli script', /js\/lib\/ore-lavorate\.js\?v=\d+/.test(html));
// L'ordine conta: i moduli la usano al primo render, quindi deve essere
// gia' definita quando vengono caricati.
var posLib = html.indexOf('js/lib/ore-lavorate.js');
check('e caricata prima di turni.js', posLib > -1 && posLib < html.indexOf('js/modules/turni.js'));
check('e prima di timbrature.js', posLib > -1 && posLib < html.indexOf('js/modules/timbrature.js'));
check('turni.js ha una versione nuova', /js\/modules\/turni\.js\?v=1[1-9]/.test(html));
check('timbrature.js ha una versione nuova', /js\/modules\/timbrature\.js\?v=1[1-9]/.test(html));
// Il service worker mette in precache solo il GUSCIO (dal 21/10: 65
// file all'installazione facevano andare in timeout le chiamate al
// database mentre la pagina caricava). Le librerie non vanno in
// lista: le mette in cache il gestore rete-prima appena le serve.
// Qui basta che la pagina la carichi.
check('la pagina carica la libreria',
  html.indexOf('js/lib/ore-lavorate.js') > -1);

console.log('\n--- la pagina Turni ---');
check('chiede le timbrature della settimana', /ENI\.API\.getTimbrature\(da, a\)/.test(turniJs));
check('e le confronta con la libreria', /ENI\.OreLavorate\.confronto\(/.test(turniJs));
check('la colonna Monte ore e in testata', /<th[^>]*>Monte ore/.test(turniJs));
check('ogni riga ha la sua casella', /_monteOreCell\(p\)/.test(turniJs));
check('e c e la riga del totale', /_monteOreFoot\(\)/.test(turniJs));
// Il monte ore mostra i due TOTALI INTERI: previste dai turni compilati
// contro la somma delle timbrate. Se usasse i campi "Chiusi" mostrerebbe
// numeri tagliati a ieri, che non e' il monte ore della settimana.
check('mostra le previste intere, non quelle tagliate',
  /fmtOre\(r\.minutiPrevisti\)\s*\+\s*' → '\s*\+\s*O\.fmtOre\(r\.minutiFatti\)/.test(turniJs));
check('e a settimana iniziata dice fino a quando vale la differenza',
  /_ore\.inCorso/.test(turniJs) && /al '\s*\+\s*_fmtBreve\(_ore\.ultimoGiornoChiuso\)/.test(turniJs));
check('il totale usa la differenza dei soli giorni finiti',
  /fmtDiff\(t\.differenza\)/.test(turniJs));
// Se il monte ore non si carica la pianificazione deve restare usabile:
// e' un'aggiunta, non una dipendenza.
check('un errore sul monte ore non rompe la griglia',
  /catch \(e\) \{ _ore = null; \}/.test(turniJs));
// La griglia scorre in orizzontale su una larghezza fissa: con una colonna
// in piu' andava allargata, o l'ultima resta tagliata fuori.
check('la griglia e stata allargata per la colonna nuova',
  /turni-grid\{min-width:860px/.test(turniJs));

console.log('\n--- la pagina Timbrature ---');
check('chiede i turni del periodo', /ENI\.API\.getTurni\(_da, _a\)/.test(timbJs));
check('e usa la stessa libreria', /ENI\.OreLavorate\.confronto\(/.test(timbJs));
check('mostra ancora le ore lavorate della persona', /Ore nel periodo/.test(timbJs));
check('e accanto le previste dai turni', /Previste dai turni/.test(timbJs));
check('con la differenza', /<th[^>]*>Differenza/.test(timbJs));
check('e il totale in fondo', /_rigaTotale\(\)/.test(timbJs));
check('un errore sui turni non nasconde le timbrature',
  /catch \(e\) \{ _ore = null; \}/.test(timbJs));

console.log('\n--- niente formule doppie, e niente colspan dimenticati ---');
// Prima ogni modulo si calcolava le sessioni per conto suo. Ora delegano:
// se qui ricomparisse il ciclo, i due numeri potrebbero divergere.
check('Timbrature delega le sessioni alla libreria',
  /function _sessioni\(eventi\) \{ return ENI\.OreLavorate\.sessioni\(eventi\); \}/.test(timbJs));
check('e anche i minuti',
  /function _minuti\(sess\) \{ return ENI\.OreLavorate\.minutiLavorati\(sess\); \}/.test(timbJs));
check('non si e tenuta una copia del ciclo entrata/uscita',
  !/aperta = e\.ts;/.test(timbJs));
// Da due colonne a quattro: la riga del dettaglio deve coprirle tutte,
// altrimenti il dettaglio si stringe sotto le prime due e sballa la tabella.
check('la riga del dettaglio copre tutte le colonne',
  /data-dett="' \+ pid \+ '"[^]*?colspan="4"/.test(timbJs) || /colspan="4"/.test(timbJs));
check('e non e rimasto il colspan vecchio', !/colspan="2"/.test(timbJs));

console.log('\n' + pass + ' passati, ' + fail + ' falliti');
process.exit(fail === 0 ? 0 : 1);
