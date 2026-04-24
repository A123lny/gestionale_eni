// ============================================================
// FATTURAZIONE - Parser Excel (saldi ENI + consuntivi ENI) + utility match clienti
// Solo funzioni pure, nessun rendering
// ============================================================

var ENI = ENI || {};
ENI.Fatturazione = ENI.Fatturazione || {};

ENI.Fatturazione.Parser = (function() {
    'use strict';

    // Categorizzazione prodotto -> CARBURANTE/LAVAGGIO/ACCESSORIO
    var PRODOTTI_CARBURANTE = ['GASOLIO', 'GASOLIO PLUS', 'SUPER SP', 'BENZINA', 'SUPER'];
    function categoriaProdotto(prodotto) {
        if (!prodotto) return 'ALTRO';
        var p = String(prodotto).toUpperCase().trim();
        if (p === 'WASH' || p.indexOf('LAVAGG') >= 0) return 'LAVAGGIO';
        for (var i = 0; i < PRODOTTI_CARBURANTE.length; i++) {
            if (p.indexOf(PRODOTTI_CARBURANTE[i]) >= 0) return 'CARBURANTE';
        }
        return 'ACCESSORIO';
    }

    function normalizzaNome(s) {
        if (!s) return '';
        return String(s).trim().toLowerCase().replace(/\s+/g, ' ');
    }

    // --- Parse file saldi (febbraio-marzo 2026.xlsx) ---
    // Ritorna array: [{ numero, stato, nomeCliente, idCliente, centroCosto, tipologia, dataContabile, dataScadenza, saldo, residuo, mese, anno }]
    function parseSaldi(arrayBuffer) {
        var wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
        var sheet = wb.Sheets[wb.SheetNames[0]];
        var rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        if (rows.length) console.log('Parser saldi - colonne:', Object.keys(rows[0]));
        if (rows.length) console.log('Parser saldi - prima riga raw:', JSON.stringify(rows[0]));

        return rows.map(function(r) {
            var dataContabile = _parseDataIt(r['Data Contabile']);
            var dataScadenza = _parseDataIt(r['Data Scadenza']);
            var mese = dataContabile ? dataContabile.getMonth() : null;    // 0-11
            var anno = dataContabile ? dataContabile.getFullYear() : null;
            // Data Contabile = data chiusura consuntivo (primo del mese successivo)
            // Il mese di COMPETENZA è il mese precedente
            var meseCompetenza = null, annoCompetenza = null;
            if (dataContabile) {
                var d = new Date(dataContabile.getTime());
                d.setDate(1);
                d.setMonth(d.getMonth() - 1);
                meseCompetenza = d.getMonth() + 1;  // 1-12
                annoCompetenza = d.getFullYear();
            }
            return {
                numero: r['Numero'],
                stato: r['Stato'],
                nomeCliente: String(r['Cliente'] || '').trim(),
                nomeNormalizzato: normalizzaNome(r['Cliente']),
                idCliente: String(r['IdCliente'] || '').trim(),
                centroCosto: r['Centro di Costo'],
                tipologia: r['Tipologia'],
                tipoPagamento: r['Tipo Pagamento'],
                dataContabile: dataContabile,
                dataScadenza: dataScadenza,
                saldo: _parseNumero(r['Saldo']),
                residuo: _parseNumero(r['Residuo']),
                meseCompetenza: meseCompetenza,
                annoCompetenza: annoCompetenza
            };
        }).filter(function(r) { return r.nomeCliente; });
    }

    // --- Parse file consuntivi dettaglio ---
    // Ritorna array transazioni
    function parseConsuntivi(arrayBuffer) {
        var wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
        var sheet = wb.Sheets[wb.SheetNames[0]];
        var rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        return rows.map(function(r) {
            var dataMov = _parseDataIt(r['Data']);
            var dataContabile = _parseDataIt(r['Data Contabile']);
            var meseCompetenza = null, annoCompetenza = null;
            if (dataContabile) {
                meseCompetenza = dataContabile.getMonth() + 1;
                annoCompetenza = dataContabile.getFullYear();
            }
            return {
                tipologiaConto: r['Tipologia Conto'],
                tipoConto: r['Tipologia Conto Gruppo'],
                numeroConto: r['Numero Conto Gruppo'],
                dataMovimento: dataMov,
                dataContabile: dataContabile,
                nomeCliente: String(r['Cliente'] || '').trim(),
                nomeNormalizzato: normalizzaNome(r['Cliente']),
                tipologiaMovimento: r['Tipologia movimento'],
                tipoServizio: r['Tipo Servizio'],
                codicePv: r['Codice Pv'],
                numCarta: r['Num Carta'],
                autista: r['Autista'],
                targa: r['Targa'],
                scontrino: r['Scontrino'] ? String(r['Scontrino']) : null,
                prodotto: r['Prodotto'],
                prezzoUnitario: _parseNumero(r['Prezzo Unitario']),
                volume: _parseNumero(r['Volume']),
                importo: _parseNumero(r['Importo']),
                idTransazione: r['IdTransazione'] ? String(r['IdTransazione']) : null,
                categoria: categoriaProdotto(r['Prodotto']),
                meseCompetenza: meseCompetenza,
                annoCompetenza: annoCompetenza
            };
        }).filter(function(r) { return r.nomeCliente && r.dataMovimento; });
    }

    // --- Match cliente per nome su rubrica ---
    // clienti: array da DB {id, nome_ragione_sociale, alias_import_eni[]}
    // Ritorna: { clienteId, metodo: 'nome'|'alias'|'fuzzy'|null, clienteNome }
    function matchCliente(nomeImport, clienti) {
        var target = normalizzaNome(nomeImport);
        if (!target) return { clienteId: null, metodo: null };

        // 1. Match esatto nome
        for (var i = 0; i < clienti.length; i++) {
            if (normalizzaNome(clienti[i].nome_ragione_sociale) === target) {
                return { clienteId: clienti[i].id, metodo: 'nome', clienteNome: clienti[i].nome_ragione_sociale };
            }
        }
        // 2. Match alias
        for (var j = 0; j < clienti.length; j++) {
            var aliases = clienti[j].alias_import_eni || [];
            for (var k = 0; k < aliases.length; k++) {
                if (normalizzaNome(aliases[k]) === target) {
                    return { clienteId: clienti[j].id, metodo: 'alias', clienteNome: clienti[j].nome_ragione_sociale };
                }
            }
        }
        // 3. Fuzzy (Levenshtein ratio >= 0.85)
        var best = null, bestScore = 0.85;
        for (var m = 0; m < clienti.length; m++) {
            var score = _similarita(target, normalizzaNome(clienti[m].nome_ragione_sociale));
            if (score > bestScore) { bestScore = score; best = clienti[m]; }
        }
        if (best) return { clienteId: best.id, metodo: 'fuzzy', clienteNome: best.nome_ragione_sociale, score: bestScore };
        return { clienteId: null, metodo: null };
    }

    // --- Helpers ---
    function _parseNumero(v) {
        if (v === null || v === undefined || v === '') return 0;
        if (typeof v === 'number') return v;
        var s = String(v).replace(/\./g, '').replace(',', '.');
        var n = parseFloat(s);
        return isNaN(n) ? 0 : n;
    }

    function _parseDataIt(v) {
        if (!v) return null;
        if (v instanceof Date) return v;
        var s = String(v).trim();
        // Formati attesi: "31/03/2026", "31/03/2026 15:57:35", "01/04/2026 00:00:00"
        var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
        if (m) {
            return new Date(
                parseInt(m[3],10), parseInt(m[2],10)-1, parseInt(m[1],10),
                m[4] ? parseInt(m[4],10) : 0, m[5] ? parseInt(m[5],10) : 0, m[6] ? parseInt(m[6],10) : 0
            );
        }
        var d = new Date(s);
        return isNaN(d.getTime()) ? null : d;
    }

    function _similarita(a, b) {
        if (!a || !b) return 0;
        if (a === b) return 1;
        var lev = _levenshtein(a, b);
        return 1 - lev / Math.max(a.length, b.length);
    }

    function _levenshtein(a, b) {
        var m = a.length, n = b.length;
        if (!m) return n; if (!n) return m;
        var prev = []; var curr = [];
        for (var j = 0; j <= n; j++) prev[j] = j;
        for (var i = 1; i <= m; i++) {
            curr[0] = i;
            for (var k = 1; k <= n; k++) {
                var cost = a.charCodeAt(i-1) === b.charCodeAt(k-1) ? 0 : 1;
                curr[k] = Math.min(curr[k-1]+1, prev[k]+1, prev[k-1]+cost);
            }
            var tmp = prev; prev = curr; curr = tmp;
        }
        return prev[n];
    }

    return {
        parseSaldi: parseSaldi,
        parseConsuntivi: parseConsuntivi,
        matchCliente: matchCliente,
        categoriaProdotto: categoriaProdotto,
        normalizzaNome: normalizzaNome
    };
})();
