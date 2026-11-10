/**
 * IBAN e mandato SDD: calcoli puri, nessun DOM e nessuna chiamata al database.
 *
 * PERCHE' ESISTE QUESTO FILE
 * In anagrafica ABI e CAB si digitavano a mano accanto all'IBAN, ma sono gia'
 * DENTRO l'IBAN (SM/IT: caratteri 6-10 = ABI, 11-15 = CAB). Controllato il
 * 10/11/2026 su tutti i clienti: in nessun caso erano diversi dall'IBAN.
 * Qui si ricavano, cosi' non si possono piu' scrivere sbagliati.
 *
 * Lo stato del mandato decide se il cliente RID entra nel file banca: servono
 * il codice (lo genera il database, serie RSM-SDD-...) E la data in cui il
 * cliente ha firmato, che va in <DtOfSgntr>.
 */
(function(global) {
    'use strict';

    var ENI = global.ENI = global.ENI || {};

    // IBAN senza spazi, maiuscolo. '' se vuoto.
    function normalizza(iban) {
        return String(iban == null ? '' : iban).replace(/\s/g, '').toUpperCase();
    }

    // ABI e CAB dall'IBAN. Solo SM e IT (stessa struttura, 27 caratteri):
    // per gli altri paesi o un IBAN incompleto ritorna null e si lasciano
    // i valori che ci sono.
    function abiCab(iban) {
        var s = normalizza(iban);
        if (s.length !== 27) return null;
        var paese = s.substring(0, 2);
        if (paese !== 'SM' && paese !== 'IT') return null;
        var abi = s.substring(5, 10);
        var cab = s.substring(10, 15);
        if (!/^[0-9]{5}$/.test(abi) || !/^[0-9]{5}$/.test(cab)) return null;
        return { abi: abi, cab: cab };
    }

    // 'valido'        -> codice + data firma: entra nel file RID
    // 'attesa_firma'  -> codice generato, il cliente non ha ancora firmato
    // 'mancante'      -> nessun codice
    function statoMandato(cliente) {
        cliente = cliente || {};
        if (!cliente.mandate_id) return 'mancante';
        if (!cliente.mandato_data_firma) return 'attesa_firma';
        return 'valido';
    }

    ENI.IbanMandato = {
        normalizza: normalizza,
        abiCab: abiCab,
        statoMandato: statoMandato
    };

})(typeof window !== 'undefined' ? window : this);
