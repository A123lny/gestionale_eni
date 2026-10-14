// ============================================================
// GESTIONALE ENI - Ore lavorate: previste (turni) contro fatte (timbrature)
//
// Il confronto vive in due pagine diverse -- Turni e Timbrature -- e se
// ognuna si facesse i suoi conti prima o poi darebbero due numeri diversi
// per la stessa settimana. Qui dentro c'e' il calcolo, una volta sola, in
// funzioni pure: nessuna lettura dal database, nessun pezzo di pagina.
//
// Quattro regole nate dai dati veri (settembre-ottobre 2026), non da
// un'ipotesi:
//
//  1. I TOTALI SONO INTERI, LA DIFFERENZA NO. Il monte ore previsto e'
//     quello dei turni COMPILATI, tutta la settimana: e' il numero che il
//     gestore vuole leggere. Le ore fatte sono tutte quelle timbrate. Quello
//     che non si puo' confrontare e' la DIFFERENZA fra i due, perche' nella
//     settimana in corso i turni coprono sei giorni e le timbrature
//     arrivano a oggi (il 13/10 Thomas aveva 46h previste e 4h fatte: non e'
//     un ammanco, e' il martedi'). Quindi i due totali si mostrano per
//     intero e la differenza si calcola solo sui giorni finiti, dicendo
//     fino a quando.
//
//  2. SENZA TIMBRATURE NON SI GIUDICA. Il gestore, Fabio e Achille hanno i
//     turni in griglia e zero timbrature da sempre: il confronto li darebbe
//     in rosso al 100% per sempre. Se in un periodo una persona non ha
//     nessuna timbratura si mostrano le previste e si scrive "nessuna
//     timbratura", senza colore. Si scrive il fatto e non un giudizio
//     perche' dal solo periodo mostrato non si distingue chi non timbra mai
//     da chi quella settimana non ha timbrato: il 12/10 Alessandro aveva
//     6h30 di turno e nessuna timbrata, e lui di solito timbra sempre.
//
//  3. CHI E' DENTRO ADESSO NON HA UN AMMANCO. Una timbratura di entrata
//     senza l'uscita vale zero minuti: chi sta lavorando in quel momento
//     sembrerebbe indietro. Le sessioni aperte si contano a parte.
//
//  4. TOLLERANZA DI UN'ORA. Nella settimana del 28/09, l'unica compilata per
//     bene, gli scarti erano +0h31, -1h06, +3h04: mezz'ora in piu' e' la
//     norma (si esce piu' tardi di quando si era detto), non un errore.
//     Sotto l'ora non si colora niente.
//
// E quando la griglia dei turni e' vuota (3 settimane su 7, a settembre) il
// giudizio e' 'senza_turni': meglio dire "non compilati" che dare -40 ore.
// ============================================================

var ENI = ENI || {};

ENI.OreLavorate = (function() {
    'use strict';

    var TOLLERANZA_MIN = 60;

    // --- Date (stringhe 'YYYY-MM-DD', mai oggetti Date in giro) ---

    function _parse(iso) {
        var p = String(iso).split('-');
        return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    }

    function _toISO(d) {
        return d.getFullYear() + '-' +
               String(d.getMonth() + 1).padStart(2, '0') + '-' +
               String(d.getDate()).padStart(2, '0');
    }

    function addGiorni(iso, n) {
        var d = _parse(iso);
        d.setDate(d.getDate() + n);
        return _toISO(d);
    }

    // L'ultimo giorno su cui il confronto ha senso: ieri, se il periodo
    // arriva a oggi o oltre. Se il periodo e' tutto nel passato, la sua fine.
    // Torna null se non c'e' nemmeno un giorno chiuso (periodo che inizia
    // oggi): in quel caso non si confronta niente.
    function ultimoGiornoChiuso(da, a, oggi) {
        var ieri = addGiorni(oggi, -1);
        var fine = a < ieri ? a : ieri;
        if (fine < da) return null;
        return fine;
    }

    // --- Minuti previsti da una riga di `turni` ---

    function _minutiOra(hhmm) {
        if (!hhmm) return null;
        var p = String(hhmm).split(':');
        if (p.length < 2) return null;
        var h = Number(p[0]), m = Number(p[1]);
        if (isNaN(h) || isNaN(m)) return null;
        return h * 60 + m;
    }

    function _durata(inizio, fine) {
        var i = _minutiOra(inizio), f = _minutiOra(fine);
        if (i === null || f === null) return 0;
        // fine prima dell'inizio = turno che passa la mezzanotte
        if (f < i) f += 24 * 60;
        return f - i;
    }

    // Un turno 'spezzato' ha due fasce: vanno sommate entrambe.
    // 'riposo' (e qualunque riga senza orari) vale zero.
    function minutiPrevisti(turno) {
        if (!turno || turno.tipo === 'riposo') return 0;
        return _durata(turno.ora_inizio, turno.ora_fine) +
               _durata(turno.ora_inizio_2, turno.ora_fine_2);
    }

    // --- Sessioni dalle timbrature ---
    //
    // Stessa logica che Timbratura e Timbrature usavano ognuna per conto
    // suo: gli eventi di UN giorno in ordine, entrata apre, uscita chiude.
    // Una entrata senza uscita (o viceversa) resta una sessione incompleta,
    // non si butta: e' la spia di una timbrata dimenticata.
    function sessioni(eventi) {
        var sorted = (eventi || []).slice().sort(function(a, b) {
            return a.ts < b.ts ? -1 : (a.ts > b.ts ? 1 : 0);
        });
        var sess = [], aperta = null;
        sorted.forEach(function(e) {
            if (e.tipo === 'entrata') {
                if (aperta) sess.push({ inizio: aperta, fine: null });
                aperta = e.ts;
            } else {
                if (aperta) { sess.push({ inizio: aperta, fine: e.ts }); aperta = null; }
                else sess.push({ inizio: null, fine: e.ts });
            }
        });
        if (aperta) sess.push({ inizio: aperta, fine: null });
        return sess;
    }

    function minutiLavorati(sess) {
        return (sess || []).reduce(function(tot, s) {
            if (s.inizio && s.fine) tot += (new Date(s.fine) - new Date(s.inizio)) / 60000;
            return tot;
        }, 0);
    }

    function sessioniIncomplete(sess) {
        return (sess || []).filter(function(s) { return !s.inizio || !s.fine; }).length;
    }

    // --- Il giudizio ---
    //
    // L'ordine conta: prima si esce dai casi in cui NON si giudica, poi si
    // guarda la differenza. Chi non timbra e chi non ha turni non e' in
    // ritardo ne' in anticipo: e' un dato che manca.
    function giudizio(dati) {
        if (!dati.haTurni && !dati.haTimbrature) return 'nessun_dato';
        if (!dati.haTimbrature) return 'senza_timbrature';
        if (!dati.haTurni) return 'senza_turni';
        var diff = dati.minutiFatti - dati.minutiPrevisti;
        if (Math.abs(diff) <= TOLLERANZA_MIN) return 'in_linea';
        return diff > 0 ? 'sopra' : 'sotto';
    }

    // 'senza_timbrature' dice un fatto -- in questo periodo non ci sono
    // timbrature -- e non da' un giudizio sulla persona. La differenza conta:
    // il gestore e Fabio non timbrano mai, ma Alessandro e Valentina
    // timbrano sempre e lunedi' 12/10 non l'hanno fatto. Dal solo periodo
    // mostrato i due casi non si distinguono, quindi non si colora nessuno
    // dei due e si scrive cosa manca, lasciando a chi legge la conclusione.
    var ETICHETTE = {
        in_linea:         { testo: 'in linea',             colore: 'ok' },
        sopra:            { testo: 'piu del previsto',     colore: 'avviso' },
        sotto:            { testo: 'meno del previsto',    colore: 'avviso' },
        senza_timbrature: { testo: 'nessuna timbratura',   colore: 'neutro' },
        senza_turni:      { testo: 'turni non compilati',  colore: 'neutro' },
        nessun_dato:      { testo: 'niente da confrontare', colore: 'neutro' }
    };

    function etichetta(g) { return ETICHETTE[g] || ETICHETTE.nessun_dato; }

    // --- Il confronto completo ---
    //
    // In: le righe di `turni` e `timbrature` del periodo (come arrivano
    // dall'API), il periodo, e che giorno e' oggi.
    // Out: una riga per ogni persona che compare in almeno una delle due
    // fonti, piu' il totale.
    function confronto(opz) {
        var turni = opz.turni || [];
        var timbrature = opz.timbrature || [];
        var fine = ultimoGiornoChiuso(opz.da, opz.a, opz.oggi);

        var per = {};
        function riga(pid, nome) {
            if (!per[pid]) {
                per[pid] = {
                    personale_id: pid, nome: nome || '',
                    // totali interi: tutto il periodo
                    minutiPrevisti: 0, minutiFatti: 0,
                    // solo i giorni finiti: su questi si calcola la differenza
                    minutiPrevistiChiusi: 0, minutiFattiChiusi: 0,
                    aperte: 0, haTurni: false, haTimbrature: false
                };
            }
            if (nome && !per[pid].nome) per[pid].nome = nome;
            return per[pid];
        }

        turni.forEach(function(t) {
            if (t.data < opz.da || t.data > opz.a) return;
            var r = riga(t.personale_id, t.personale && t.personale.nome_completo);
            // Una riga 'riposo' conta come griglia compilata anche se vale 0
            // minuti: dire "turni non compilati" a chi e' segnato a riposo
            // sarebbe falso.
            r.haTurni = true;
            var m = minutiPrevisti(t);
            r.minutiPrevisti += m;
            if (fine && t.data <= fine) r.minutiPrevistiChiusi += m;
        });

        // Le timbrature si raggruppano per persona E giorno: le sessioni si
        // chiudono dentro la giornata, non a cavallo.
        var perGiorno = {};
        timbrature.forEach(function(t) {
            var r = riga(t.personale_id, t.personale && t.personale.nome_completo);
            r.haTimbrature = true;
            var k = t.personale_id + '|' + t.data;
            (perGiorno[k] = perGiorno[k] || []).push(t);
        });

        Object.keys(perGiorno).forEach(function(k) {
            var parti = k.split('|');
            var pid = parti[0], data = parti[1];
            var r = per[pid];
            var sess = sessioni(perGiorno[k]);
            var min = minutiLavorati(sess);
            r.minutiFatti += min;
            r.aperte += sessioniIncomplete(sess);
            if (fine && data <= fine) r.minutiFattiChiusi += min;
        });

        var righe = Object.keys(per).map(function(pid) {
            var r = per[pid];
            r.differenza = r.minutiFattiChiusi - r.minutiPrevistiChiusi;
            r.giudizio = giudizio({
                haTurni: r.haTurni, haTimbrature: r.haTimbrature,
                minutiPrevisti: r.minutiPrevistiChiusi,
                minutiFatti: r.minutiFattiChiusi
            });
            return r;
        }).sort(function(a, b) { return a.nome.localeCompare(b.nome); });

        // Nel totale entrano solo le persone davvero confrontabili, altrimenti
        // i turni di chi non timbra sposterebbero la somma di decine di ore.
        var conf = righe.filter(function(r) { return r.haTimbrature && r.haTurni; });
        function somma(campo) {
            return conf.reduce(function(s, r) { return s + r[campo]; }, 0);
        }
        return {
            righe: righe,
            ultimoGiornoChiuso: fine,
            // true = il periodo non e' finito, quindi i totali interi e la
            // differenza non parlano degli stessi giorni
            inCorso: !fine || fine < opz.a,
            totale: {
                minutiPrevisti: somma('minutiPrevisti'),
                minutiFatti: somma('minutiFatti'),
                minutiPrevistiChiusi: somma('minutiPrevistiChiusi'),
                minutiFattiChiusi: somma('minutiFattiChiusi'),
                differenza: somma('minutiFattiChiusi') - somma('minutiPrevistiChiusi'),
                persone: conf.length
            }
        };
    }

    // --- Formato ---

    function fmtOre(min) {
        min = Math.round(min || 0);
        var segno = min < 0 ? '-' : '';
        min = Math.abs(min);
        return segno + Math.floor(min / 60) + 'h ' + String(min % 60).padStart(2, '0') + 'm';
    }

    function fmtDiff(min) {
        min = Math.round(min || 0);
        return (min > 0 ? '+' : '') + fmtOre(min);
    }

    return {
        TOLLERANZA_MIN: TOLLERANZA_MIN,
        addGiorni: addGiorni,
        ultimoGiornoChiuso: ultimoGiornoChiuso,
        minutiPrevisti: minutiPrevisti,
        sessioni: sessioni,
        minutiLavorati: minutiLavorati,
        sessioniIncomplete: sessioniIncomplete,
        giudizio: giudizio,
        etichetta: etichetta,
        confronto: confronto,
        fmtOre: fmtOre,
        fmtDiff: fmtDiff
    };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ENI.OreLavorate;
