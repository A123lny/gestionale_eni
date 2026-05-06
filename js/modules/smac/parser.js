// ============================================================
// SMAC - Parser CSV report mensile carta SMAC (San Marino)
// Il file e' aggregato (28 righe fisse), separatore ';',
// decimali italiani (42.565,71). Estrae i totali per categoria
// e il periodo dalla riga 28.
// ============================================================

var ENI = ENI || {};
ENI.Smac = ENI.Smac || {};

ENI.Smac.Parser = (function() {
    'use strict';

    function _parseNumeroIT(s) {
        if (s == null) return 0;
        var t = String(s).trim();
        if (!t) return 0;
        // formato italiano: "42.565,71" -> 42565.71
        t = t.replace(/\./g, '').replace(',', '.');
        var n = parseFloat(t);
        return isNaN(n) ? 0 : n;
    }

    function _parseInt(s) {
        if (s == null) return 0;
        var t = String(s).trim().replace(/\./g, '');
        var n = parseInt(t, 10);
        return isNaN(n) ? 0 : n;
    }

    // Estrae il valore "utile" da una riga del CSV.
    // Le righe SMAC hanno struttura: "";"Etichetta";"";...;"valore";
    // Papa.parse restituisce un array di celle: il valore e' nell'ultima cella non vuota.
    function _getValore(row) {
        if (!row || !row.length) return '';
        for (var i = row.length - 1; i >= 0; i--) {
            var v = (row[i] || '').toString().trim();
            if (v && !/^\*+$/.test(v)) return v;
        }
        return '';
    }

    function _estraiPeriodo(row) {
        // riga 28: "Periodo: dal 01/02/2026 al 28/02/2026 - Data pagamento -"
        var celle = (row || []).map(function(c) { return (c || '').toString(); }).join(' ');
        var m = celle.match(/dal\s+(\d{2})\/(\d{2})\/(\d{4})\s+al\s+(\d{2})\/(\d{2})\/(\d{4})/i);
        if (!m) return null;
        var inizio = m[3] + '-' + m[2] + '-' + m[1];
        var fine = m[6] + '-' + m[5] + '-' + m[4];
        return {
            data_inizio: inizio,
            data_fine: fine,
            mese: parseInt(m[2], 10),
            anno: parseInt(m[3], 10)
        };
    }

    // Calcola SHA-256 hex di un ArrayBuffer
    async function _sha256(arrayBuffer) {
        var h = await crypto.subtle.digest('SHA-256', arrayBuffer);
        var bytes = new Uint8Array(h);
        var hex = '';
        for (var i = 0; i < bytes.length; i++) {
            hex += bytes[i].toString(16).padStart(2, '0');
        }
        return hex;
    }

    /**
     * Parsa un file SMAC (File o ArrayBuffer + nome).
     * Ritorna un oggetto pronto per upsert su smac_riepilogo.
     */
    async function parse(file) {
        var ab = await file.arrayBuffer();
        var hash = await _sha256(ab);

        // Decodifica testo (UTF-8 prima, fallback latin1)
        var text;
        try {
            text = new TextDecoder('utf-8', { fatal: false }).decode(ab);
        } catch (e) {
            text = new TextDecoder('windows-1252').decode(ab);
        }

        // Parse CSV con Papa.parse
        var parsed = Papa.parse(text, {
            delimiter: ';',
            quoteChar: '"',
            skipEmptyLines: false
        });
        var rows = parsed.data || [];

        if (rows.length < 28) {
            throw new Error('File SMAC non valido: attese almeno 28 righe, trovate ' + rows.length);
        }

        var periodo = _estraiPeriodo(rows[27]);
        if (!periodo) {
            throw new Error('Impossibile estrarre il periodo dalla riga 28 del file');
        }

        // Indici 0-based: riga 2 -> rows[1], ecc.
        var data = {
            mese: periodo.mese,
            anno: periodo.anno,
            data_inizio: periodo.data_inizio,
            data_fine: periodo.data_fine,

            // Sezione principale (righe 2-15)
            fis_num_ricarica:        _parseInt(_getValore(rows[1])),    // riga 2
            fis_num_pagamento:       _parseInt(_getValore(rows[2])),    // riga 3
            fis_num_fisco:           _parseInt(_getValore(rows[3])),    // riga 4
            fis_num_totale:          _parseInt(_getValore(rows[4])),    // riga 5
            fis_imp_ricarica:        _parseNumeroIT(_getValore(rows[6])),  // riga 7
            fis_imp_pagamento:       _parseNumeroIT(_getValore(rows[7])),  // riga 8
            fis_imp_pagamento_netto: _parseNumeroIT(_getValore(rows[8])),  // riga 9
            fis_imp_fisco:           _parseNumeroIT(_getValore(rows[9])),  // riga 10
            fis_imp_totale:          _parseNumeroIT(_getValore(rows[10])), // riga 11
            fis_sconto_ricarica:     _parseNumeroIT(_getValore(rows[12])), // riga 13
            fis_sconto_pagamento:    _parseNumeroIT(_getValore(rows[13])), // riga 14

            // Sezione DEMATERIALIZZATE (righe 18-25)
            dem_num_ricarica:  _parseInt(_getValore(rows[17])),    // riga 18
            dem_num_pagamento: _parseInt(_getValore(rows[18])),    // riga 19
            dem_num_fisco:     _parseInt(_getValore(rows[19])),    // riga 20
            dem_num_totale:    _parseInt(_getValore(rows[20])),    // riga 21
            dem_imp_ricarica:  _parseNumeroIT(_getValore(rows[21])), // riga 22
            dem_imp_pagamento: _parseNumeroIT(_getValore(rows[22])), // riga 23
            dem_imp_fisco:     _parseNumeroIT(_getValore(rows[23])), // riga 24
            dem_imp_totale:    _parseNumeroIT(_getValore(rows[24])), // riga 25

            file_nome: file.name || 'smac.csv',
            file_hash: hash
        };

        return data;
    }

    return {
        parse: parse,
        // helper esposti per debug/UI
        _parseNumeroIT: _parseNumeroIT
    };
})();
