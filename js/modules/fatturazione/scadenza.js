// ============================================================
// FATTURAZIONE - Calcolo data scadenza fattura
// Regola unica basata su modalita_pagamento_fattura del cliente:
//   RID_SDD  -> 15 del mese successivo all'emissione
//   altro    -> ultimo giorno del mese successivo all'emissione
// ============================================================

var ENI = ENI || {};
ENI.Fatturazione = ENI.Fatturazione || {};

ENI.Fatturazione.Scadenza = (function() {
    'use strict';

    // dataEm: Date | string ISO yyyy-mm-dd
    // modPagFattura: 'RID_SDD' | 'RIBA' | 'BONIFICO' | 'RIMESSA_DIRETTA' | null
    // Ritorna: Date
    function calcola(dataEm, modPagFattura) {
        var d = (dataEm instanceof Date) ? new Date(dataEm.getTime()) : new Date(dataEm);
        d.setDate(1);  // evita overflow (es. 31 gennaio + 1 mese)
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
        if (modPagFattura === 'RID_SDD') return '15 del mese successivo all’emissione';
        return 'Ultimo giorno del mese successivo all’emissione';
    }

    return {
        calcola: calcola,
        descrivi: descrivi
    };
})();
