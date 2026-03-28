// ============================================================
// TITANWASH - Motore di Calcolo Carburanti
// Costo medio ponderato mobile, margine, Progetto Carburante
// ============================================================

var ENI = ENI || {};

ENI.Calcoli = (function() {
    'use strict';

    // ============================================================
    // COSTO CARICO
    // Calcola il costo totale di un carico e il costo per litro fisico
    // ============================================================

    function calcolaCostoCarico(litri_fiscali, litri_fisici, prezzo_mp, accisa) {
        // costo_carico_totale = litri_fiscali × (prezzo_mp + accisa) × 1.21
        var costo_carico_totale = litri_fiscali * (prezzo_mp + accisa) * 1.21;

        // costo_per_litro_fisico = costo_carico_totale / litri_fisici
        var costo_per_litro_fisico = litri_fisici > 0
            ? costo_carico_totale / litri_fisici
            : 0;

        return {
            costo_carico_totale: _round2(costo_carico_totale),
            costo_per_litro_fisico: _round6(costo_per_litro_fisico)
        };
    }

    // ============================================================
    // COSTO MEDIO PONDERATO
    // Aggiorna il costo medio dopo un carico
    // ============================================================

    function aggiornaCostoMedio(giacenza_attuale, costo_medio_attuale, litri_fisici_carico, costo_per_litro_fisico) {
        // Se non c'è giacenza precedente, il costo medio è quello del nuovo carico
        if (giacenza_attuale <= 0) {
            return {
                nuova_giacenza: litri_fisici_carico,
                nuovo_costo_medio: _round6(costo_per_litro_fisico)
            };
        }

        var costo_vecchi = giacenza_attuale * costo_medio_attuale;
        var costo_nuovi = litri_fisici_carico * costo_per_litro_fisico;
        var nuova_giacenza = giacenza_attuale + litri_fisici_carico;

        var nuovo_costo_medio = nuova_giacenza > 0
            ? (costo_vecchi + costo_nuovi) / nuova_giacenza
            : 0;

        return {
            nuova_giacenza: _round2(nuova_giacenza),
            nuovo_costo_medio: _round6(nuovo_costo_medio)
        };
    }

    // ============================================================
    // AGGIORNA DOPO VENDITA
    // Riduce la giacenza, calcola margine realizzato
    // ============================================================

    function applicaVendita(giacenza_attuale, costo_medio, litri_venduti, prezzo_pompa, ha_pc) {
        var margine_unitario = prezzo_pompa - costo_medio;
        var margine_vendita = margine_unitario * litri_venduti;
        var nuova_giacenza = Math.max(0, giacenza_attuale - litri_venduti);

        // Progetto Carburante: 0.0522 €/litro
        var pc_maturato = ha_pc ? litri_venduti * 0.0522 : 0;

        return {
            nuova_giacenza: _round2(nuova_giacenza),
            costo_medio: _round6(costo_medio), // non cambia con la vendita
            margine_unitario: _round6(margine_unitario),
            margine_vendita: _round2(margine_vendita),
            pc_maturato: _round2(pc_maturato)
        };
    }

    // ============================================================
    // AGGIORNA DOPO CONGUAGLIO ENI
    // Rettifica il costo medio sulla giacenza residua
    // ============================================================

    function applicaConguaglio(giacenza_attuale, costo_medio, importo_mp) {
        // importo_mp negativo = credito (riduce costo), positivo = debito (aumenta costo)
        if (giacenza_attuale <= 0) {
            return { costo_medio: _round6(costo_medio) };
        }

        var nuovo_costo_medio = costo_medio + (importo_mp / giacenza_attuale);

        return {
            costo_medio: _round6(nuovo_costo_medio)
        };
    }

    // ============================================================
    // PREZZO CONSIGLIATO
    // ============================================================

    function prezzoConsigliato(costo_medio, margine_target) {
        return _round4(costo_medio + margine_target);
    }

    // ============================================================
    // MARGINE CORRENTE
    // ============================================================

    function marginCorrente(prezzo_pompa, costo_medio) {
        return _round6(prezzo_pompa - costo_medio);
    }

    // ============================================================
    // CALCOLO STATO COMPLETO PRODOTTO
    // Dato un prodotto, processa tutti gli eventi in ordine cronologico
    // e restituisce lo stato corrente
    // ============================================================

    function calcolaStatoProdotto(giacenza_iniziale, costo_medio_iniziale, eventi, ha_pc, margine_target) {
        var giacenza = giacenza_iniziale || 0;
        var costo_medio = costo_medio_iniziale || 0;
        var pc_maturato = 0;
        var margine_accumulato = 0;
        var litri_venduti_tot = 0;

        // Eventi devono essere ordinati per data
        for (var i = 0; i < eventi.length; i++) {
            var ev = eventi[i];

            if (ev.tipo === 'carico') {
                var costoCarico = calcolaCostoCarico(
                    ev.litri_fiscali, ev.litri_fisici, ev.prezzo_mp, ev.accisa
                );
                var risultato = aggiornaCostoMedio(
                    giacenza, costo_medio, ev.litri_fisici, costoCarico.costo_per_litro_fisico
                );
                giacenza = risultato.nuova_giacenza;
                costo_medio = risultato.nuovo_costo_medio;

            } else if (ev.tipo === 'vendita') {
                var vendita = applicaVendita(
                    giacenza, costo_medio, ev.litri, ev.prezzo_pompa, ha_pc
                );
                giacenza = vendita.nuova_giacenza;
                margine_accumulato += vendita.margine_vendita;
                litri_venduti_tot += ev.litri;
                if (ha_pc) pc_maturato += vendita.pc_maturato;

            } else if (ev.tipo === 'conguaglio') {
                var cong = applicaConguaglio(giacenza, costo_medio, ev.importo_mp);
                costo_medio = cong.costo_medio;
            }
        }

        return {
            giacenza_teorica: _round2(giacenza),
            costo_medio: _round6(costo_medio),
            prezzo_consigliato: prezzoConsigliato(costo_medio, margine_target || 0.05),
            pc_maturato: _round2(pc_maturato),
            margine_accumulato: _round2(margine_accumulato),
            litri_venduti_tot: _round2(litri_venduti_tot)
        };
    }

    // ============================================================
    // UTILITY ARROTONDAMENTO
    // ============================================================

    function _round2(n) {
        return Math.round(n * 100) / 100;
    }

    function _round4(n) {
        return Math.round(n * 10000) / 10000;
    }

    function _round6(n) {
        return Math.round(n * 1000000) / 1000000;
    }

    // ============================================================
    // API PUBBLICA
    // ============================================================

    return {
        calcolaCostoCarico: calcolaCostoCarico,
        aggiornaCostoMedio: aggiornaCostoMedio,
        applicaVendita: applicaVendita,
        applicaConguaglio: applicaConguaglio,
        prezzoConsigliato: prezzoConsigliato,
        marginCorrente: marginCorrente,
        calcolaStatoProdotto: calcolaStatoProdotto
    };
})();
