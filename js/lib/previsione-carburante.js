// ============================================================
// GESTIONALE ENI - Motore Previsione Autonomia Serbatoi
// Funzioni PURE e testabili (nessuna UI, nessun accesso al DB).
// Aritmetica su litri interi: nessun float approssimato sullo stock.
// Date "civili" (YYYY-MM-DD) senza ora, nessuna ambiguità di fuso.
// ============================================================

var ENI = ENI || {};

ENI.PrevisioneCarburante = (function() {
    'use strict';

    // --- Helper date civili (senza fuso) ---
    function _parseISO(s) {
        var p = String(s).split('-');
        return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    }
    function _toISO(d) {
        var m = String(d.getMonth() + 1).padStart(2, '0');
        var g = String(d.getDate()).padStart(2, '0');
        return d.getFullYear() + '-' + m + '-' + g;
    }
    function _addGiorni(iso, n) {
        var d = _parseISO(iso);
        d.setDate(d.getDate() + n);
        return _toISO(d);
    }
    function _dow(iso) { return _parseISO(iso).getDay(); } // 0=domenica .. 6=sabato

    // --- 2.1 Consumo medio giornaliero (auto o manuale) ---
    function mediaGiornaliera(params) {
        params = params || {};
        if (params.modalita === 'manuale') {
            var gm = Number(params.manualeGiorni) || 0;
            var tm = Number(params.manualeTotale) || 0;
            return { media: gm > 0 ? tm / gm : 0, modalita: 'manuale', totale: tm, giorni: gm };
        }
        var gf = Number(params.giorniFinestra) || 0;
        var tf = Number(params.erogatoFinestra) || 0;
        return { media: gf > 0 ? tf / gf : 0, modalita: 'auto', totale: tf, giorni: gf };
    }

    // --- 2.2 Fattore del giorno della settimana (default 1) ---
    function fattoreGiorno(dataISO, fattori) {
        var dow = _dow(dataISO);
        if (!fattori) return 1;
        var f = (fattori[dow] != null) ? Number(fattori[dow]) : 1;
        return isNaN(f) ? 1 : f;
    }

    // --- 2.3/2.4 Cascata giornaliera continua (carichi espliciti, mai dentro la media) ---
    function costruisciCascata(params) {
        params = params || {};
        var giacenzaIniziale = Math.round(Number(params.giacenzaIniziale) || 0);
        var dataInizio = params.dataInizio;
        var orizzonte = Number(params.orizzonte) || 21;
        var media = Number(params.media) || 0;
        var fattori = params.fattori || {};
        var scortaMinima = Number(params.scortaMinima) || 0;

        // Somma carichi previsti per data
        var caricoPerData = {};
        (params.carichiPrevisti || []).forEach(function(c) {
            var d = c.data || c.data_prevista;
            if (!d) return;
            caricoPerData[d] = (caricoPerData[d] || 0) + Math.round(Number(c.litri) || 0);
        });

        var giorni = [];
        var chiusuraPrec = giacenzaIniziale;
        for (var i = 0; i < orizzonte; i++) {
            var dataG = _addGiorni(dataInizio, i);
            var apertura = (i === 0) ? giacenzaIniziale : chiusuraPrec;
            var carichi = caricoPerData[dataG] || 0;
            var fatt = fattoreGiorno(dataG, fattori);
            var consumo = Math.round(media * fatt);
            var chiusura = apertura + carichi - consumo;
            var stato = chiusura <= 0 ? 'esaurito' : (chiusura <= scortaMinima ? 'sottoscorta' : 'ok');
            giorni.push({
                data: dataG,
                dow: _dow(dataG),
                apertura: apertura,
                carichi: carichi,
                consumo: consumo,
                fattore: fatt,
                chiusura: chiusura,
                stato: stato
            });
            chiusuraPrec = chiusura;
        }
        return giorni;
    }

    // --- 2.5 Indicatori: sotto-scorta, esaurimento, autonomia residua ---
    function indicatori(cascata, scortaMinima) {
        scortaMinima = Number(scortaMinima) || 0;
        var dataSottoScorta = null, dataEsaurimento = null, giorniAutonomia = null;
        for (var i = 0; i < cascata.length; i++) {
            if (dataSottoScorta === null && cascata[i].chiusura <= scortaMinima) {
                dataSottoScorta = cascata[i].data;
                giorniAutonomia = i; // giorni sopra scorta prima del primo sotto-scorta
            }
            if (dataEsaurimento === null && cascata[i].chiusura <= 0) {
                dataEsaurimento = cascata[i].data;
            }
        }
        return { dataSottoScorta: dataSottoScorta, dataEsaurimento: dataEsaurimento, giorniAutonomia: giorniAutonomia };
    }

    function _giornoCascata(cascata, dataISO) {
        for (var j = 0; j < cascata.length; j++) if (cascata[j].data === dataISO) return cascata[j];
        return null;
    }

    // --- 2.6 Proposta d'ordine (mai sotto scorta, arrotondata al lotto, mai overfill) ---
    // Considera i giorni di consegna validi (default Lun–Ven) e la data-limite ordine
    // (8:30 dell'ultimo giorno lavorativo precedente la consegna).
    function propostaOrdine(params) {
        params = params || {};
        var cascata = params.cascata || [];
        var scortaMinima = Number(params.scortaMinima) || 0;
        var capacitaUtile = Number(params.capacitaUtile) || 0;
        var lotto = Number(params.lottoMinimo) || 1;
        if (lotto <= 0) lotto = 1;
        var giorniConsegna = (params.giorniConsegna && params.giorniConsegna.length) ? params.giorniConsegna : [1, 2, 3, 4, 5];

        // Primo giorno con chiusura sotto la scorta minima
        var idx = -1;
        for (var i = 0; i < cascata.length; i++) {
            if (cascata[i].chiusura <= scortaMinima) { idx = i; break; }
        }
        if (idx === -1) return { serve: false, motivo: 'Autonomia sufficiente per tutto l\'orizzonte' };

        var giornoSottoScorta = cascata[idx].data;
        var minData = cascata.length ? cascata[0].data : giornoSottoScorta;

        // Data consegna = ultimo giorno di consegna valido (giorniConsegna) <= giorno di sotto-scorta
        var consegna = giornoSottoScorta;
        while (giorniConsegna.indexOf(_dow(consegna)) === -1 && consegna > minData) {
            consegna = _addGiorni(consegna, -1);
        }

        var gc = _giornoCascata(cascata, consegna);
        var aperturaConsegna = gc ? gc.apertura : cascata[idx].apertura;
        var spazio = capacitaUtile - aperturaConsegna;
        if (spazio <= 0) return { serve: false, motivo: 'Serbatoio già al limite di capacità' };

        // Riempimento fino a capacità utile, arrotondato per DIFETTO al lotto minimo → nessun overfill
        var quantita = Math.floor(spazio / lotto) * lotto;
        if (quantita <= 0) return { serve: false, motivo: 'Spazio inferiore al lotto minimo' };

        // Data-limite ordine = ultimo giorno lavorativo (Lun–Ven) STRETTAMENTE prima della consegna
        var ordine = _addGiorni(consegna, -1);
        while ([1, 2, 3, 4, 5].indexOf(_dow(ordine)) === -1) ordine = _addGiorni(ordine, -1);

        return {
            serve: true,
            dataConsegna: consegna,
            dataOrdine: ordine,
            quantita: quantita,
            giornoSottoScorta: giornoSottoScorta,
            aperturaConsegna: aperturaConsegna,
            capacitaUtile: capacitaUtile,
            lottoMinimo: lotto,
            // retrocompatibilità
            data: consegna,
            aperturaCritica: aperturaConsegna,
            motivo: 'Consegna entro il giorno di sotto-scorta (solo giorni validi), ordine entro le 8:30 del giorno lavorativo precedente, riempimento fino a capacità utile arrotondato al lotto (nessun overfill)'
        };
    }

    // --- Wrapper: dato l'input grezzo, restituisce tutto il risultato ---
    function calcola(input) {
        input = input || {};
        var m = mediaGiornaliera(input.mediaParams || {});
        var cascata = costruisciCascata({
            giacenzaIniziale: input.giacenzaIniziale,
            dataInizio: input.dataInizio,
            orizzonte: input.orizzonte,
            media: m.media,
            fattori: input.fattori,
            scortaMinima: input.scortaMinima,
            carichiPrevisti: input.carichiPrevisti
        });
        var ind = indicatori(cascata, input.scortaMinima);
        var prop = propostaOrdine({
            cascata: cascata,
            scortaMinima: input.scortaMinima,
            capacitaUtile: input.capacitaUtile,
            lottoMinimo: input.lottoMinimo,
            giorniConsegna: input.giorniConsegna
        });
        return { media: m, cascata: cascata, indicatori: ind, proposta: prop };
    }

    return {
        mediaGiornaliera: mediaGiornaliera,
        fattoreGiorno: fattoreGiorno,
        costruisciCascata: costruisciCascata,
        indicatori: indicatori,
        propostaOrdine: propostaOrdine,
        calcola: calcola,
        // helper esposti (utili a UI/test)
        _addGiorni: _addGiorni,
        _dow: _dow
    };
})();

// Supporto esecuzione in Node (per i test); ignorato nel browser
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ENI.PrevisioneCarburante;
}
