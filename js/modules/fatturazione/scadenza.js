// ============================================================
// FATTURAZIONE - Calcolo data scadenza fattura
// La scadenza si calcola sul MESE DI RIFERIMENTO (consumo), NON
// sulla data di emissione. Esempio: fattura per consumi di aprile
// emessa il 5 maggio -> RID scade 15 maggio (NON 15 giugno).
//
// Regola in base a modalita_pagamento_fattura del cliente:
//   RID_SDD  -> 15 del mese successivo al mese di riferimento
//   altro    -> ultimo giorno del mese successivo al mese di riferimento
// ============================================================

var ENI = ENI || {};
ENI.Fatturazione = ENI.Fatturazione || {};

ENI.Fatturazione.Scadenza = (function() {
    'use strict';

    // meseRif: Date | string ISO yyyy-mm-dd — qualsiasi giorno del mese di riferimento.
    //          Per fatture ENI: usare il primo del mese di competenza (anno+mese di consumo).
    //          Per fatture manuali: usare data_emissione (mese di rif implicito).
    // modPagFattura: 'RID_SDD' | 'RIBA' | 'BONIFICO' | 'RIMESSA_DIRETTA' | null
    // Ritorna: Date
    function calcola(meseRif, modPagFattura) {
        var d = (meseRif instanceof Date) ? new Date(meseRif.getTime()) : new Date(meseRif);
        d.setDate(1);  // evita overflow e normalizza al primo del mese
        if (modPagFattura === 'RID_SDD') {
            d.setMonth(d.getMonth() + 1);
            d.setDate(15);
        } else {
            // RIBA, BONIFICO, RIMESSA_DIRETTA o altro: fine mese successivo
            d.setMonth(d.getMonth() + 2);
            d.setDate(0);  // 0 di mese N = ultimo giorno di mese N-1
        }
        return d;
    }

    // Etichetta leggibile della regola applicata, per UI cliente
    function descrivi(modPagFattura) {
        if (modPagFattura === 'RID_SDD') return '15 del mese successivo al mese di riferimento';
        return 'Ultimo giorno del mese successivo al mese di riferimento';
    }

    return {
        calcola: calcola,
        descrivi: descrivi
    };
})();
