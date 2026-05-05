// ============================================================
// FATTURAZIONE - Import mensile ENI (wizard 4 step)
// Step 1: Upload 2 file Excel + selezione mese/anno
// Step 2: Match clienti (auto + manuale)
// Step 3: Anteprima fatture raggruppate per cliente
// Step 4: Conferma e generazione fatture
// ============================================================

var ENI = ENI || {};
ENI.Fatturazione = ENI.Fatturazione || {};

ENI.Fatturazione.ImportEni = (function() {
    'use strict';

    var _step = 1;
    var _container = null;
    var _saldi = [];           // array parsed dal file saldi
    var _consuntivi = [];      // array parsed dal file consuntivi
    var _meseSelez = null;     // mese competenza selezionato (1-12)
    var _annoSelez = null;
    var _clientiDb = [];       // clienti dal DB
    var _mapping = [];         // [{ saldo, match, confermato, escluso, totConsuntivi, override }]
    var _consTotPerCli = {};   // mappa nomeNormalizzato -> totale importo consuntivi
    var TOLLERANZA = 0.05;     // tolleranza euro per discrepanze saldi vs consuntivi

    async function render(container) {
        _container = container;
        _step = 1;
        _saldi = []; _consuntivi = []; _mapping = []; _consTotPerCli = {};
        _renderStep();
    }

    function _renderStep() {
        var html = '<div class="card"><div class="card-body">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">' +
                '<h3>Import mensile ENI</h3>' +
                '<button class="btn btn-secondary btn-sm" id="imp-back">Torna all\'elenco</button>' +
            '</div>' +
            _renderProgressBar() +
            '<div id="imp-step-content"></div>' +
        '</div></div>';
        _container.innerHTML = html;
        document.getElementById('imp-back').addEventListener('click', function() {
            ENI.Fatturazione.Index.vaiA('elenco');
        });

        var box = document.getElementById('imp-step-content');
        switch (_step) {
            case 1: _renderStep1(box); break;
            case 2: _renderStep2(box); break;
            case 3: _renderStep3(box); break;
            case 4: _renderStep4(box); break;
        }
    }

    function _renderProgressBar() {
        var labels = ['Upload file', 'Match clienti', 'Anteprima', 'Conferma'];
        return '<div style="display:flex;gap:0.25rem;margin-bottom:1.5rem;">' +
            labels.map(function(l, i) {
                var num = i + 1;
                var cls = num < _step ? 'fatt-step done' : num === _step ? 'fatt-step active' : 'fatt-step';
                return '<div class="' + cls + '" style="flex:1;text-align:center;padding:0.5rem;border-radius:var(--radius-sm);' +
                    'background:' + (num <= _step ? 'var(--primary)' : 'var(--bg-secondary)') + ';' +
                    'color:' + (num <= _step ? '#fff' : 'var(--text-secondary)') + ';font-size:0.85rem;">' +
                    num + '. ' + l + '</div>';
            }).join('') + '</div>';
    }

    // ============================================================
    // STEP 1: Upload file
    // ============================================================
    function _renderStep1(box) {
        var now = new Date();
        var meseDefault = now.getMonth(); // mese precedente (0-11 -> mostriamo 1-12)
        var annoDefault = meseDefault === 0 ? now.getFullYear() - 1 : now.getFullYear();
        if (meseDefault === 0) meseDefault = 12; // dicembre anno precedente

        var nomi = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
        var mesiOpt = nomi.map(function(n, i) {
            return '<option value="' + (i+1) + '"' + (i+1 === meseDefault ? ' selected' : '') + '>' + n + '</option>';
        }).join('');

        box.innerHTML =
            '<div class="form-group"><label class="form-label form-label-required">File saldi riepilogativi (.xlsx)</label>' +
                '<input type="file" class="form-input" id="imp-file-saldi" accept=".xlsx,.xls" required>' +
                '<span class="text-xs text-muted">Es: febbraio-marzo 2026.xlsx</span></div>' +
            '<div class="form-group"><label class="form-label form-label-required">File consuntivi dettaglio (.xlsx)</label>' +
                '<input type="file" class="form-input" id="imp-file-consuntivi" accept=".xlsx,.xls" required>' +
                '<span class="text-xs text-muted">Es: consuntivi_febbraio_marzo_2026.xlsx</span></div>' +
            '<div class="form-row">' +
                '<div class="form-group"><label class="form-label">Mese di competenza</label>' +
                    '<select class="form-select" id="imp-mese">' + mesiOpt + '</select></div>' +
                '<div class="form-group"><label class="form-label">Anno</label>' +
                    '<input type="number" class="form-input" id="imp-anno" value="' + annoDefault + '" min="2024" max="2040"></div>' +
            '</div>' +
            '<div id="imp-warning" style="display:none;" class="mb-3"></div>' +
            '<div style="text-align:right;"><button class="btn btn-primary" id="imp-step1-next">Avanti \u{2192}</button></div>';

        document.getElementById('imp-step1-next').addEventListener('click', _processStep1);
    }

    async function _processStep1() {
        console.log('Step1: inizio');
        var fileInputSaldi = document.getElementById('imp-file-saldi');
        var fileInputCons = document.getElementById('imp-file-consuntivi');
        console.log('Step1: input saldi:', fileInputSaldi, 'files:', fileInputSaldi ? fileInputSaldi.files.length : 'null');
        console.log('Step1: input cons:', fileInputCons, 'files:', fileInputCons ? fileInputCons.files.length : 'null');
        var fileSaldi = fileInputSaldi && fileInputSaldi.files[0];
        var fileConsuntivi = fileInputCons && fileInputCons.files[0];
        if (!fileSaldi || !fileConsuntivi) {
            ENI.UI.toast('Seleziona entrambi i file', 'danger'); return;
        }
        console.log('Step1: file ok, leggo buffers');

        _meseSelez = parseInt(document.getElementById('imp-mese').value, 10);
        _annoSelez = parseInt(document.getElementById('imp-anno').value, 10);

        // Leggi i file SUBITO prima di qualsiasi await (i riferimenti DOM si perdono)
        var bufSaldi = await fileSaldi.arrayBuffer();
        var bufCons = await fileConsuntivi.arrayBuffer();

        // Controlla import precedente
        try {
            var logs = await ENI.API.getImportEniLog(_annoSelez, _meseSelez);
            if (logs.length) {
                if (!await ENI.UI.confirm('Esiste gi\u00e0 un import per ' + _meseSelez + '/' + _annoSelez +
                    '. Proseguendo potresti generare fatture duplicate. Vuoi procedere?')) return;
            }
        } catch(e) {}

        var box = document.getElementById('imp-step-content');
        box.innerHTML = '<div class="flex justify-center" style="padding:2rem;"><div class="spinner"></div> <span style="margin-left:1rem;">Parsing file in corso...</span></div>';

        try {
            _saldi = ENI.Fatturazione.Parser.parseSaldi(bufSaldi);
            _consuntivi = ENI.Fatturazione.Parser.parseConsuntivi(bufCons);

            // Filtra solo per il mese di competenza selezionato
            _saldi = _saldi.filter(function(s) { return s.meseCompetenza === _meseSelez && s.annoCompetenza === _annoSelez; });
            _consuntivi = _consuntivi.filter(function(c) {
                if (!c.dataMovimento) return false;
                var m = c.dataMovimento.getMonth() + 1;
                var a = c.dataMovimento.getFullYear();
                return m >= 1 && a === _annoSelez &&
                    ((m === _meseSelez) || (m === _meseSelez + 1 && c.dataMovimento.getDate() === 1));
            });

            // Aggrega saldi per cliente: una sola entry (e quindi una fattura) per cliente
            var saldiAgg = {};
            _saldi.forEach(function(s) {
                var k = s.nomeNormalizzato;
                if (!k) return;
                if (!saldiAgg[k]) {
                    saldiAgg[k] = Object.assign({}, s, { saldo: 0, residuo: 0 });
                }
                saldiAgg[k].saldo += s.saldo || 0;
                saldiAgg[k].residuo += s.residuo || 0;
            });
            _saldi = Object.keys(saldiAgg).map(function(k) { return saldiAgg[k]; });

            // Pre-calcola totale importi consuntivi per cliente (per validazione delta in step 3)
            _consTotPerCli = {};
            _consuntivi.forEach(function(c) {
                var k = c.nomeNormalizzato;
                if (!k) return;
                _consTotPerCli[k] = (_consTotPerCli[k] || 0) + (c.importo || 0);
            });

            // Segnala clienti con movimenti ma senza saldo (anomalia file)
            var saldoKeys = {};
            _saldi.forEach(function(s) { saldoKeys[s.nomeNormalizzato] = true; });
            var consSenzaSaldo = Object.keys(_consTotPerCli).filter(function(k) { return !saldoKeys[k]; });
            if (consSenzaSaldo.length) {
                console.warn('Clienti con consuntivi ma senza saldo:', consSenzaSaldo);
                ENI.UI.toast(consSenzaSaldo.length + ' client(i) hanno movimenti nei consuntivi ma nessun saldo riepilogativo. Verranno ignorati.', 'warning');
            }

            console.log('Saldi parsed totali:', ENI.Fatturazione.Parser.parseSaldi(bufSaldi).length,
                'Filtrati per', _meseSelez + '/' + _annoSelez + ':', _saldi.length);
            if (_saldi.length) {
                console.log('Primo saldo:', JSON.stringify(_saldi[0]));
            } else {
                // Mostra i mesi disponibili per debug
                var tuttiSaldi = ENI.Fatturazione.Parser.parseSaldi(bufSaldi);
                var mesiDisp = {};
                tuttiSaldi.forEach(function(s) { mesiDisp[s.meseCompetenza + '/' + s.annoCompetenza] = (mesiDisp[s.meseCompetenza + '/' + s.annoCompetenza] || 0) + 1; });
                console.log('Mesi disponibili nel file:', mesiDisp);
                ENI.UI.toast('Nessun consuntivo per ' + _meseSelez + '/' + _annoSelez + '. Mesi nel file: ' + Object.keys(mesiDisp).join(', '), 'danger');
                _renderStep(); return;
            }

            // Carica clienti da DB per matching
            _clientiDb = await ENI.API.getClienti();

            // Esegui match
            _mapping = _saldi.map(function(s) {
                var m = ENI.Fatturazione.Parser.matchCliente(s.nomeCliente, _clientiDb);
                return { saldo: s, match: m, confermato: m.clienteId ? true : false, escluso: false };
            });

            _step = 2;
            _renderStep();
        } catch(e) {
            ENI.UI.toast('Errore parsing: ' + e.message, 'danger');
            _step = 1; _renderStep();
        }
    }

    // ============================================================
    // STEP 2: Match clienti
    // ============================================================
    function _renderStep2(box) {
        var matchati = _mapping.filter(function(m) { return m.match.clienteId; }).length;
        var totali = _mapping.length;

        var rows = _mapping.map(function(m, i) {
            var metodoLabel = { nome: 'Esatto', alias: 'Alias', fuzzy: 'Fuzzy' };
            var cls = m.match.clienteId ? 'style="background:var(--bg-success-subtle);"' : 'style="background:var(--bg-danger-subtle);"';

            var selectOpts = '<option value="">-- Seleziona --</option>' +
                _clientiDb.map(function(c) {
                    return '<option value="' + c.id + '"' + (m.match.clienteId === c.id ? ' selected' : '') + '>' +
                        ENI.UI.escapeHtml(c.nome_ragione_sociale) + '</option>';
                }).join('');

            return '<tr ' + cls + '>' +
                '<td>' + ENI.UI.escapeHtml(m.saldo.nomeCliente) + '</td>' +
                '<td>\u20AC ' + (m.saldo.saldo || 0).toLocaleString('it-IT', {minimumFractionDigits:2}) + '</td>' +
                '<td>' + (m.match.clienteId ? (metodoLabel[m.match.metodo] || '-') : '<strong class="text-danger">Non trovato</strong>') + '</td>' +
                '<td><select class="form-select form-select-sm imp-match-sel" data-idx="' + i + '">' + selectOpts + '</select></td>' +
                '<td><label class="form-check"><input type="checkbox" class="imp-escludi" data-idx="' + i + '"' + (m.escluso ? ' checked' : '') + '> Escludi</label></td>' +
            '</tr>';
        }).join('');

        box.innerHTML =
            '<p class="mb-2">Clienti trovati: <strong>' + totali + '</strong> &mdash; Matchati automaticamente: <strong>' + matchati + '</strong></p>' +
            '<div class="table-wrapper" style="max-height:60vh;overflow:auto;"><table class="table">' +
                '<thead><tr><th>Nome file ENI</th><th>Saldo</th><th>Match</th><th>Cliente rubrica</th><th>Escludi</th></tr></thead>' +
                '<tbody>' + rows + '</tbody>' +
            '</table></div>' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:1rem;">' +
                '<button class="btn btn-secondary" id="imp-step2-back">\u{2190} Indietro</button>' +
                '<div style="display:flex;gap:0.5rem;">' +
                    (matchati < totali ? '<button class="btn btn-warning" id="imp-step2-crea-tutti">Crea ' + (totali - matchati) + ' clienti mancanti</button>' : '') +
                    '<button class="btn btn-primary" id="imp-step2-next">Avanti \u{2192}</button>' +
                '</div>' +
            '</div>';

        // Handlers
        document.querySelectorAll('.imp-match-sel').forEach(function(sel) {
            sel.addEventListener('change', async function() {
                var idx = parseInt(sel.dataset.idx, 10);
                var val = sel.value;
                if (val) {
                    var cli = _clientiDb.find(function(c) { return c.id === val; });
                    _mapping[idx].match = { clienteId: val, metodo: 'manuale', clienteNome: cli ? cli.nome_ragione_sociale : '' };
                    _mapping[idx].confermato = true;
                    // Salva alias subito per match futuri
                    try {
                        await ENI.API.aggiungiAliasCliente(val, _mapping[idx].saldo.nomeCliente);
                    } catch(e) {}
                } else {
                    _mapping[idx].match = { clienteId: null, metodo: null };
                    _mapping[idx].confermato = false;
                }
            });
        });
        document.querySelectorAll('.imp-escludi').forEach(function(cb) {
            cb.addEventListener('change', function() {
                _mapping[parseInt(cb.dataset.idx, 10)].escluso = cb.checked;
            });
        });
        // Crea tutti i clienti mancanti
        var btnCrea = document.getElementById('imp-step2-crea-tutti');
        if (btnCrea) {
            btnCrea.addEventListener('click', async function() {
                var mancanti = _mapping.filter(function(m) { return !m.match.clienteId && !m.escluso; });
                if (!mancanti.length) { ENI.UI.toast('Nessun cliente mancante', 'info'); return; }
                btnCrea.disabled = true;
                btnCrea.textContent = 'Creazione in corso...';
                var creati = 0;
                for (var i = 0; i < mancanti.length; i++) {
                    var m = mancanti[i];
                    try {
                        var isIT = m.saldo.nomeCliente.match(/\b(srl|spa|snc|sas|srls)\b/i) && !m.saldo.idCliente;
                        var dati = {
                            tipo: 'Corporate',
                            nome_ragione_sociale: m.saldo.nomeCliente,
                            modalita_pagamento: 'Addebito_Mese',
                            id_cliente_eni: m.saldo.idCliente || null,
                            alias_import_eni: [ENI.Fatturazione.Parser.normalizzaNome(m.saldo.nomeCliente)]
                        };
                        var nuovo = await ENI.API.salvaCliente(dati);
                        m.match = { clienteId: nuovo.id, metodo: 'auto-creato', clienteNome: nuovo.nome_ragione_sociale };
                        m.confermato = true;
                        _clientiDb.push(nuovo);
                        creati++;
                    } catch(e) {
                        console.error('Errore creazione cliente:', m.saldo.nomeCliente, e);
                    }
                }
                ENI.UI.toast(creati + ' clienti creati', 'success');
                ENI.State.cacheClear();
                _renderStep();
            });
        }

        document.getElementById('imp-step2-back').addEventListener('click', function() { _step = 1; _renderStep(); });
        document.getElementById('imp-step2-next').addEventListener('click', function() {
            var nonMatchati = _mapping.filter(function(m) { return !m.match.clienteId && !m.escluso; });
            if (nonMatchati.length) {
                ENI.UI.toast(nonMatchati.length + ' client(i) non associati e non esclusi. Associali o escludili prima di procedere.', 'danger');
                return;
            }
            _step = 3; _renderStep();
        });
    }

    // ============================================================
    // STEP 3: Anteprima fatture raggruppate
    // ============================================================
    function _renderStep3(box) {
        var attivi = _mapping.filter(function(m) { return !m.escluso && m.match.clienteId; });
        var nomi = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];

        var nDiscrepanze = 0;

        var rows = attivi.map(function(m, idx) {
            var movCli = _consuntivi.filter(function(c) {
                return ENI.Fatturazione.Parser.normalizzaNome(c.nomeCliente) === m.saldo.nomeNormalizzato;
            });
            var nCarb = movCli.filter(function(x) { return x.categoria === 'CARBURANTE'; }).length;
            var nLav = movCli.filter(function(x) { return x.categoria === 'LAVAGGIO'; }).length;
            var nAcc = movCli.filter(function(x) { return x.categoria === 'ACCESSORIO'; }).length;
            var cli = _clientiDb.find(function(c) { return c.id === m.match.clienteId; });
            var ricorrenti = (cli && Array.isArray(cli.voci_ricorrenti_fattura)) ? cli.voci_ricorrenti_fattura : [];
            var ricorrentiTot = ricorrenti.reduce(function(s, r) { return s + (parseFloat(r.importo) || 0); }, 0);

            var saldoVal = m.saldo.saldo || 0;
            var consVal = _consTotPerCli[m.saldo.nomeNormalizzato] || 0;
            // \u0394 resta SOLO sul confronto ENI saldi vs consuntivi (le ricorrenti sono fuori da ENI)
            var delta = saldoVal - consVal;
            var hasDiscrepanza = Math.abs(delta) > TOLLERANZA;

            // Override risolve la discrepanza (modal forza subtotale==totale)
            var risolto = !!m.override;
            if (hasDiscrepanza && !risolto) nDiscrepanze++;

            // Totale fattura mostrato: include voci ricorrenti
            var totaleFattura = (m.override && m.override.totale != null)
                ? m.override.totale
                : Math.round((saldoVal + ricorrentiTot) * 100) / 100;

            var rowStyle = risolto ? 'style="background:var(--bg-success-subtle);"' :
                hasDiscrepanza ? 'style="background:var(--bg-danger-subtle);"' : '';

            var deltaCell = hasDiscrepanza ?
                '<span class="text-danger"><strong>' + (delta > 0 ? '+' : '') + delta.toFixed(2) + '\u20AC</strong></span>' :
                '<span class="text-success">\u2713</span>';

            var extraCell = ricorrentiTot > 0 ?
                '<span class="text-info" title="' + ENI.UI.escapeHtml(ricorrenti.map(function(r) { return r.descrizione + ' \u20AC' + (parseFloat(r.importo)||0).toFixed(2); }).join(' \u00B7 ')) + '">+\u20AC ' + ricorrentiTot.toLocaleString('it-IT', {minimumFractionDigits:2}) + '</span>' :
                '<span class="text-muted">-</span>';

            var actionCell = risolto ?
                '<span class="badge badge-success">\u270F\uFE0F Modificata</span> ' +
                '<button class="btn btn-sm btn-secondary imp-edit" data-idx="' + idx + '">Rimodifica</button>' :
                hasDiscrepanza ?
                '<button class="btn btn-sm btn-warning imp-edit" data-idx="' + idx + '">Modifica</button>' :
                '<button class="btn btn-sm btn-secondary imp-edit" data-idx="' + idx + '">Modifica</button>';

            return '<tr ' + rowStyle + '>' +
                '<td><strong>' + ENI.UI.escapeHtml(m.match.clienteNome || m.saldo.nomeCliente) + '</strong></td>' +
                '<td class="text-right">\u20AC ' + saldoVal.toLocaleString('it-IT', {minimumFractionDigits:2}) + '</td>' +
                '<td class="text-right">\u20AC ' + consVal.toLocaleString('it-IT', {minimumFractionDigits:2}) + '</td>' +
                '<td class="text-right">' + deltaCell + '</td>' +
                '<td class="text-right">' + extraCell + '</td>' +
                '<td class="text-right"><strong>\u20AC ' + totaleFattura.toLocaleString('it-IT', {minimumFractionDigits:2}) + '</strong></td>' +
                '<td>' + movCli.length + ' <span class="text-muted text-xs">(' + nCarb + 'C/' + nLav + 'L/' + nAcc + 'A)</span></td>' +
                '<td>' + (cli && cli.applica_monofase ? 'S\u00ec' : '-') + '</td>' +
                '<td>' + actionCell + '</td>' +
            '</tr>';
        }).join('');

        var totale = attivi.reduce(function(s, m) {
            if (m.override && m.override.totale != null) return s + m.override.totale;
            var cli = _clientiDb.find(function(c) { return c.id === m.match.clienteId; });
            var ric = (cli && Array.isArray(cli.voci_ricorrenti_fattura))
                ? cli.voci_ricorrenti_fattura.reduce(function(a, r) { return a + (parseFloat(r.importo) || 0); }, 0)
                : 0;
            return s + (m.saldo.saldo || 0) + ric;
        }, 0);

        var avvisoDiscrepanze = nDiscrepanze > 0 ?
            '<div class="alert alert-danger mb-2"><strong>\u26A0\uFE0F ' + nDiscrepanze + ' cliente(i) con discrepanza saldi/consuntivi.</strong> ' +
            'Risolvi cliccando "Modifica" su ogni riga rossa prima di generare le fatture. ' +
            'Tolleranza: ' + TOLLERANZA.toFixed(2) + '\u20AC.</div>' : '';

        box.innerHTML =
            '<p class="mb-2">Fatture da generare: <strong>' + attivi.length + '</strong> per <strong>' + nomi[_meseSelez-1] + ' ' + _annoSelez + '</strong></p>' +
            avvisoDiscrepanze +
            '<div class="table-wrapper"><table class="table">' +
                '<thead><tr>' +
                    '<th>Cliente</th>' +
                    '<th class="text-right">Saldo ENI</th>' +
                    '<th class="text-right">Consuntivi</th>' +
                    '<th class="text-right">\u0394</th>' +
                    '<th class="text-right">Extra</th>' +
                    '<th class="text-right">Totale</th>' +
                    '<th>Movimenti</th>' +
                    '<th>Monofase</th>' +
                    '<th>Azioni</th>' +
                '</tr></thead>' +
                '<tbody>' + rows + '</tbody>' +
                '<tfoot><tr><th colspan="5" class="text-right">TOTALE</th><th class="text-right">\u20AC ' + totale.toLocaleString('it-IT',{minimumFractionDigits:2}) + '</th><th colspan="3"></th></tr></tfoot>' +
            '</table></div>' +
            '<div style="display:flex;justify-content:space-between;margin-top:1rem;">' +
                '<button class="btn btn-secondary" id="imp-step3-back">\u{2190} Indietro</button>' +
                '<button class="btn btn-primary" id="imp-step3-next"' + (nDiscrepanze > 0 ? ' disabled title="Risolvi le discrepanze prima di generare"' : '') + '>' +
                    'Genera ' + attivi.length + ' fatture \u{2192}' +
                '</button>' +
            '</div>';

        document.getElementById('imp-step3-back').addEventListener('click', function() { _step = 2; _renderStep(); });

        document.querySelectorAll('.imp-edit').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var idx = parseInt(btn.dataset.idx, 10);
                _apriModalOverride(idx);
            });
        });

        var btnNext = document.getElementById('imp-step3-next');
        if (btnNext && nDiscrepanze === 0) {
            btnNext.addEventListener('click', function() {
                ENI.UI.confirm('Generare ' + attivi.length + ' fatture per ' + nomi[_meseSelez-1] + ' ' + _annoSelez + '?').then(function(ok) {
                    if (ok) _eseguiGenerazione();
                });
            });
        }
    }

    // ============================================================
    // Modal override: modifica righe e totale prima della generazione
    // Vincolo: subtotale righe DEVE coincidere con totale fattura per salvare
    // ============================================================
    function _apriModalOverride(idx) {
        var m = _mapping[idx];
        var nomiMese = ['','Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
        var nomiCat = { CARBURANTE: 'Carburanti', LAVAGGIO: 'Lavaggi', ACCESSORIO: 'Accessori', ALTRO: 'Altro', NOTA: 'Nota' };
        var DESCR_RETTIFICA = 'Rettifica importo';  // prefisso per identificare righe di rettifica
        var saldoVal = m.saldo.saldo || 0;
        var consVal = _consTotPerCli[m.saldo.nomeNormalizzato] || 0;

        // Voci ricorrenti del cliente (configurate in scheda cliente, fuori da ENI)
        var cliRicorrenti = (function() {
            var cli = _clientiDb.find(function(c) { return c.id === m.match.clienteId; });
            return (cli && Array.isArray(cli.voci_ricorrenti_fattura)) ? cli.voci_ricorrenti_fattura : [];
        })();
        var ricorrentiTot = cliRicorrenti.reduce(function(s, r) { return s + (parseFloat(r.importo) || 0); }, 0);

        // Stato locale del modal: righe in editing + totale
        var righeEdit, totaleEdit;
        if (m.override) {
            righeEdit = m.override.righe.map(function(r) { return Object.assign({}, r); });
            totaleEdit = m.override.totale;
        } else {
            // Costruisci righe iniziali aggregando i consuntivi per categoria
            var movCli = _consuntivi.filter(function(c) {
                return c.nomeNormalizzato === m.saldo.nomeNormalizzato;
            });
            var cat = {};
            movCli.forEach(function(mov) {
                if (!cat[mov.categoria]) cat[mov.categoria] = { qta: 0, importo: 0, vol: 0 };
                cat[mov.categoria].qta++;
                cat[mov.categoria].importo += mov.importo || 0;
                cat[mov.categoria].vol += mov.volume || 0;
            });
            righeEdit = Object.keys(cat).map(function(k) {
                var c = cat[k];
                var isCarb = k === 'CARBURANTE';
                return {
                    descrizione: (nomiCat[k] || k) + ' ' + nomiMese[_meseSelez] + ' ' + _annoSelez,
                    quantita: isCarb ? Math.round(c.vol * 100) / 100 : c.qta,
                    unita_misura: isCarb ? 'L' : 'pz',
                    prezzo_unitario: c.vol > 0 && isCarb ? Math.round(c.importo / c.vol * 10000) / 10000 : Math.round(c.importo / (c.qta || 1) * 100) / 100,
                    importo: Math.round(c.importo * 100) / 100,
                    categoria: k
                };
            });
            // Aggiungi voci ricorrenti del cliente
            cliRicorrenti.forEach(function(r) {
                righeEdit.push({
                    descrizione: r.descrizione || 'Voce ricorrente',
                    quantita: r.quantita != null ? r.quantita : 1,
                    unita_misura: r.unita_misura || 'pz',
                    prezzo_unitario: (r.quantita ? (r.importo / r.quantita) : r.importo) || 0,
                    importo: parseFloat(r.importo) || 0,
                    categoria: r.categoria || 'ACCESSORIO'
                });
            });
            totaleEdit = Math.round((saldoVal + ricorrentiTot) * 100) / 100;  // default: saldo ENI + voci ricorrenti
        }

        var clienteNome = m.match.clienteNome || m.saldo.nomeCliente;

        var backdrop = ENI.UI.showModal({
            size: 'xl',
            title: 'Modifica fattura: ' + clienteNome,
            body:
                '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0.75rem;margin-bottom:1rem;">' +
                    '<div class="card" style="margin:0;padding:0.5rem;text-align:center;">' +
                        '<div class="text-xs text-muted">Saldo riepilog.</div>' +
                        '<div style="font-size:1.1rem;font-weight:600;">€ ' + saldoVal.toLocaleString('it-IT',{minimumFractionDigits:2}) + '</div>' +
                    '</div>' +
                    '<div class="card" style="margin:0;padding:0.5rem;text-align:center;">' +
                        '<div class="text-xs text-muted">Consuntivi</div>' +
                        '<div style="font-size:1.1rem;font-weight:600;">€ ' + consVal.toLocaleString('it-IT',{minimumFractionDigits:2}) + '</div>' +
                    '</div>' +
                    '<div class="card" style="margin:0;padding:0.5rem;text-align:center;">' +
                        '<div class="text-xs text-muted">Δ saldi-consuntivi</div>' +
                        '<div style="font-size:1.1rem;font-weight:600;' + (Math.abs(saldoVal - consVal) > TOLLERANZA ? 'color:var(--danger);' : 'color:var(--success);') + '">' +
                            (saldoVal - consVal >= 0 ? '+' : '') + (saldoVal - consVal).toFixed(2) + '€</div>' +
                    '</div>' +
                '</div>' +
                '<div style="display:flex;gap:0.5rem;margin-bottom:0.5rem;">' +
                    '<button class="btn btn-sm btn-outline" id="ovr-allinea-saldo">Allinea righe al saldo (+rettifica)</button>' +
                    '<button class="btn btn-sm btn-outline" id="ovr-allinea-cons">Allinea totale ai consuntivi</button>' +
                    '<button class="btn btn-sm btn-outline" id="ovr-add-row" style="margin-left:auto;">+ Aggiungi riga</button>' +
                '</div>' +
                '<div class="table-wrapper"><table class="table table-sm" id="ovr-tbl">' +
                    '<thead><tr>' +
                        '<th style="width:30%;">Descrizione</th>' +
                        '<th style="width:10%;">Qta</th>' +
                        '<th style="width:8%;">UM</th>' +
                        '<th style="width:12%;">Prezzo</th>' +
                        '<th style="width:14%;">Importo</th>' +
                        '<th style="width:14%;">Categoria</th>' +
                        '<th style="width:6%;"></th>' +
                    '</tr></thead>' +
                    '<tbody id="ovr-tbody"></tbody>' +
                '</table></div>' +
                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-top:1rem;align-items:center;">' +
                    '<div><strong>Subtotale righe: </strong><span id="ovr-subtot" style="font-size:1.1rem;">€ 0,00</span></div>' +
                    '<div style="text-align:right;"><label style="margin-right:0.5rem;"><strong>Totale fattura:</strong></label>' +
                        '<input type="number" step="0.01" id="ovr-totale" class="form-input" style="width:140px;display:inline-block;text-align:right;" value="' + totaleEdit + '"></div>' +
                '</div>' +
                '<div id="ovr-banner" style="margin-top:0.75rem;padding:0.5rem 0.75rem;border-radius:var(--radius-sm);text-align:center;font-weight:600;"></div>',
            footer:
                '<button class="btn btn-outline" data-modal-close>Annulla</button>' +
                (m.override ? '<button class="btn btn-warning" id="ovr-reset">Rimuovi override</button>' : '') +
                '<button class="btn btn-primary" id="ovr-save">Salva modifiche</button>'
        });

        function rendRighe() {
            var tbody = backdrop.querySelector('#ovr-tbody');
            tbody.innerHTML = righeEdit.map(function(r, i) {
                var catOpts = ['CARBURANTE','LAVAGGIO','ACCESSORIO','ALTRO','NOTA'].map(function(c) {
                    return '<option value="' + c + '"' + (r.categoria === c ? ' selected' : '') + '>' + c + '</option>';
                }).join('');
                return '<tr>' +
                    '<td><input type="text" class="form-input form-input-sm ovr-fld" data-i="' + i + '" data-k="descrizione" value="' + ENI.UI.escapeHtml(r.descrizione || '') + '"></td>' +
                    '<td><input type="number" step="0.01" class="form-input form-input-sm ovr-fld" data-i="' + i + '" data-k="quantita" value="' + (r.quantita || 0) + '"></td>' +
                    '<td><input type="text" class="form-input form-input-sm ovr-fld" data-i="' + i + '" data-k="unita_misura" value="' + ENI.UI.escapeHtml(r.unita_misura || '') + '"></td>' +
                    '<td><input type="number" step="0.0001" class="form-input form-input-sm ovr-fld" data-i="' + i + '" data-k="prezzo_unitario" value="' + (r.prezzo_unitario || 0) + '"></td>' +
                    '<td><input type="number" step="0.01" class="form-input form-input-sm ovr-fld" data-i="' + i + '" data-k="importo" value="' + (r.importo || 0) + '"></td>' +
                    '<td><select class="form-select form-select-sm ovr-fld" data-i="' + i + '" data-k="categoria">' + catOpts + '</select></td>' +
                    '<td><button class="btn btn-sm btn-danger ovr-del" data-i="' + i + '">✕</button></td>' +
                '</tr>';
            }).join('');

            tbody.querySelectorAll('.ovr-fld').forEach(function(el) {
                el.addEventListener('input', function() {
                    var i = parseInt(el.dataset.i, 10);
                    var k = el.dataset.k;
                    var v = (el.type === 'number') ? parseFloat(el.value) || 0 : el.value;
                    righeEdit[i][k] = v;
                    // Auto: importo = qta * prezzo se modifichi qta o prezzo
                    if (k === 'quantita' || k === 'prezzo_unitario') {
                        righeEdit[i].importo = Math.round((righeEdit[i].quantita || 0) * (righeEdit[i].prezzo_unitario || 0) * 100) / 100;
                        var impInput = tbody.querySelector('input[data-i="' + i + '"][data-k="importo"]');
                        if (impInput) impInput.value = righeEdit[i].importo;
                    }
                    rendBanner();
                });
            });
            tbody.querySelectorAll('.ovr-del').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    var i = parseInt(btn.dataset.i, 10);
                    righeEdit.splice(i, 1);
                    rendRighe();
                    rendBanner();
                });
            });
            rendBanner();
        }

        function rendBanner() {
            var subtot = righeEdit.reduce(function(s, r) { return s + (r.importo || 0); }, 0);
            subtot = Math.round(subtot * 100) / 100;
            backdrop.querySelector('#ovr-subtot').textContent = '€ ' + subtot.toLocaleString('it-IT', {minimumFractionDigits:2});
            var tot = parseFloat(backdrop.querySelector('#ovr-totale').value) || 0;
            tot = Math.round(tot * 100) / 100;
            var ok = Math.abs(subtot - tot) <= 0.005;
            var banner = backdrop.querySelector('#ovr-banner');
            var btnSave = backdrop.querySelector('#ovr-save');
            if (ok) {
                banner.style.background = 'var(--bg-success-subtle)';
                banner.style.color = 'var(--success)';
                banner.textContent = '✓ Subtotale e totale coincidono';
                btnSave.disabled = false;
            } else {
                banner.style.background = 'var(--bg-danger-subtle)';
                banner.style.color = 'var(--danger)';
                banner.textContent = '✗ Subtotale ' + subtot.toFixed(2) + '€ ≠ Totale ' + tot.toFixed(2) + '€ (Δ ' + (subtot - tot).toFixed(2) + '€)';
                btnSave.disabled = true;
            }
        }

        rendRighe();

        backdrop.querySelector('#ovr-totale').addEventListener('input', rendBanner);

        backdrop.querySelector('#ovr-add-row').addEventListener('click', function() {
            righeEdit.push({ descrizione: '', quantita: 1, unita_misura: 'pz', prezzo_unitario: 0, importo: 0, categoria: 'ACCESSORIO' });
            rendRighe();
        });

        function _isRettifica(r) {
            return r && typeof r.descrizione === 'string' && r.descrizione.indexOf(DESCR_RETTIFICA) === 0;
        }

        backdrop.querySelector('#ovr-allinea-saldo').addEventListener('click', function() {
            // Imposta totale = saldo ENI + voci ricorrenti del cliente; rettifica per chiudere il delta
            righeEdit = righeEdit.filter(function(r) { return !_isRettifica(r); });
            var totRighe = righeEdit.reduce(function(s, r) { return s + (r.importo || 0); }, 0);
            var target = Math.round((saldoVal + ricorrentiTot) * 100) / 100;
            var diff = Math.round((target - totRighe) * 100) / 100;
            if (Math.abs(diff) > 0.005) {
                righeEdit.push({
                    descrizione: DESCR_RETTIFICA + ' ' + nomiMese[_meseSelez] + ' ' + _annoSelez,
                    quantita: 1, unita_misura: '', prezzo_unitario: diff, importo: diff, categoria: 'ALTRO'
                });
            }
            backdrop.querySelector('#ovr-totale').value = target;
            rendRighe();
        });

        backdrop.querySelector('#ovr-allinea-cons').addEventListener('click', function() {
            righeEdit = righeEdit.filter(function(r) { return !_isRettifica(r); });
            var subtot = righeEdit.reduce(function(s, r) { return s + (r.importo || 0); }, 0);
            backdrop.querySelector('#ovr-totale').value = Math.round(subtot * 100) / 100;
            rendRighe();
        });

        var btnReset = backdrop.querySelector('#ovr-reset');
        if (btnReset) {
            btnReset.addEventListener('click', function() {
                _mapping[idx].override = null;
                ENI.UI.closeModal(backdrop);
                _renderStep();
            });
        }

        backdrop.querySelector('#ovr-save').addEventListener('click', function() {
            var subtot = righeEdit.reduce(function(s, r) { return s + (r.importo || 0); }, 0);
            var tot = parseFloat(backdrop.querySelector('#ovr-totale').value) || 0;
            if (Math.abs(subtot - tot) > 0.005) return;  // safety: button dovrebbe essere disabled
            _mapping[idx].override = {
                righe: righeEdit.map(function(r) {
                    return {
                        descrizione: r.descrizione,
                        quantita: r.quantita,
                        unita_misura: r.unita_misura,
                        prezzo_unitario: r.prezzo_unitario,
                        importo: r.importo,
                        categoria: r.categoria
                    };
                }),
                totale: Math.round(tot * 100) / 100
            };
            ENI.UI.closeModal(backdrop);
            _renderStep();
        });
    }

    // ============================================================
    // STEP 4: Generazione fatture
    // ============================================================
    async function _eseguiGenerazione() {
        _step = 4;
        _renderStep();
        var box = document.getElementById('imp-step-content');
        var attivi = _mapping.filter(function(m) { return !m.escluso && m.match.clienteId; });
        var nomi = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
        var progressHtml = '<div id="imp-progress"><p>Generazione in corso...</p><div class="progress-bar" style="width:100%;height:20px;background:var(--bg-secondary);border-radius:10px;overflow:hidden;"><div id="imp-prog-fill" style="height:100%;background:var(--primary);width:0%;transition:width 0.3s;"></div></div><p id="imp-prog-text">0/' + attivi.length + '</p></div>';
        box.innerHTML = progressHtml;

        var impostazioni = null;
        try { impostazioni = await ENI.API.getImpostazioniFatturazione(); } catch(e) {}

        var generati = 0, errori = 0;

        // Carica coefficiente monofase del mese (se disponibile)
        var _coeffMonofase = null;
        var _coeffChiuso = false;
        var meseRef = _annoSelez + '-' + String(_meseSelez).padStart(2, '0') + '-01';
        try {
            var coeffRes = await ENI.API.getAll('coefficiente_monofase_mensile', {
                filters: [{ op: 'eq', col: 'mese_riferimento', val: meseRef }],
                limit: 1
            });
            if (coeffRes && coeffRes.length && coeffRes[0].coefficiente_monofase) {
                _coeffMonofase = coeffRes[0].coefficiente_monofase;
                _coeffChiuso = coeffRes[0].stato === 'chiuso';
            }
        } catch(e) {}

        // Alert se mese non chiuso e ci sono clienti monofase
        var clientiMonofase = attivi.filter(function(m) {
            var cli = _clientiDb.find(function(c) { return c.id === m.match.clienteId; });
            return cli && cli.applica_monofase;
        });
        if (clientiMonofase.length > 0 && _coeffMonofase && !_coeffChiuso) {
            if (!await ENI.UI.confirm('Il coefficiente monofase di ' + nomi[_meseSelez-1] + ' ' + _annoSelez +
                ' non \u00e8 ancora chiuso (valore provvisorio: ' + _coeffMonofase + ').\n\n' +
                clientiMonofase.length + ' clienti richiedono il monofase.\n' +
                'Vuoi procedere con il valore provvisorio o attendere la chiusura?')) {
                ENI.UI.toast('Generazione annullata', 'info');
                _step = 3; _renderStep();
                return;
            }
        }
        if (clientiMonofase.length > 0 && !_coeffMonofase) {
            ENI.UI.toast('Nessun coefficiente monofase disponibile per ' + nomi[_meseSelez-1] + '. La riga monofase non verr\u00e0 inserita.', 'warning');
        }

        // Registra import log
        var importLog;
        try {
            importLog = await ENI.API.registraImportEni({
                mese: _meseSelez,
                anno: _annoSelez,
                file_saldi_nome: document.getElementById('imp-file-saldi') ? 'saldi' : '',
                file_consuntivi_nome: document.getElementById('imp-file-consuntivi') ? 'consuntivi' : '',
                righe_saldi: _saldi.length,
                righe_consuntivi: _consuntivi.length,
                fatture_generate: 0,
                clienti_non_associati: _mapping.filter(function(m) { return m.escluso; }).length
            });
        } catch(e) { importLog = { id: null }; }

        for (var i = 0; i < attivi.length; i++) {
            var m = attivi[i];
            try {
                var cli = _clientiDb.find(function(c) { return c.id === m.match.clienteId; });
                var movCli = _consuntivi.filter(function(c) {
                    return ENI.Fatturazione.Parser.normalizzaNome(c.nomeCliente) === m.saldo.nomeNormalizzato;
                });

                var nomiCat = { CARBURANTE: 'Carburanti', LAVAGGIO: 'Lavaggi', ACCESSORIO: 'Accessori', ALTRO: 'Altro' };
                var nomiMese = ['','Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
                var righe;

                // Volume gasolio serve sia all'override che al ramo standard per il monofase
                var litriGasolioCli = movCli
                    .filter(function(mov) { return mov.categoria === 'CARBURANTE'; })
                    .reduce(function(s, mov) { return s + (mov.volume || 0); }, 0);

                if (m.override) {
                    // Usa righe e totale custom dall'override
                    righe = m.override.righe.map(function(r, idx) {
                        return Object.assign({ ordine: idx }, r);
                    });
                } else {
                    // Aggrega righe per categoria dai consuntivi
                    var categorie = {};
                    movCli.forEach(function(mov) {
                        if (!categorie[mov.categoria]) categorie[mov.categoria] = { qta: 0, importo: 0, vol: 0 };
                        categorie[mov.categoria].qta++;
                        categorie[mov.categoria].importo += mov.importo || 0;
                        categorie[mov.categoria].vol += mov.volume || 0;
                    });
                    righe = Object.keys(categorie).map(function(cat, idx) {
                        var c = categorie[cat];
                        return {
                            ordine: idx,
                            descrizione: (nomiCat[cat] || cat) + ' ' + nomiMese[_meseSelez] + ' ' + _annoSelez,
                            quantita: cat === 'CARBURANTE' ? Math.round(c.vol * 100) / 100 : c.qta,
                            unita_misura: cat === 'CARBURANTE' ? 'L' : 'pz',
                            prezzo_unitario: c.vol > 0 && cat === 'CARBURANTE' ? Math.round(c.importo / c.vol * 10000) / 10000 : Math.round(c.importo / (c.qta || 1) * 100) / 100,
                            importo: Math.round(c.importo * 100) / 100,
                            categoria: cat
                        };
                    });
                }

                // Riga monofase automatica per clienti con flag (solo NOTA, non incide sul totale)
                if (cli && cli.applica_monofase && _coeffMonofase && litriGasolioCli > 0) {
                    var importoMonofase = Math.round(litriGasolioCli * _coeffMonofase * 100) / 100;
                    righe.push({
                        ordine: righe.length,
                        descrizione: 'Monofase ' + nomiMese[_meseSelez] + ' \u20AC' + importoMonofase.toLocaleString('it-IT', {minimumFractionDigits: 2}),
                        quantita: 0,
                        unita_misura: '',
                        prezzo_unitario: 0,
                        importo: 0,
                        categoria: 'NOTA'
                    });
                }

                // Voci ricorrenti del cliente (solo per generazione standard, non override:
                // nel flusso override sono gia' incluse manualmente nel m.override.righe)
                var ricorrentiTotCli = 0;
                if (!m.override && cli && Array.isArray(cli.voci_ricorrenti_fattura)) {
                    cli.voci_ricorrenti_fattura.forEach(function(r) {
                        var imp = parseFloat(r.importo) || 0;
                        if (Math.abs(imp) < 0.005) return;
                        var qta = r.quantita != null ? parseFloat(r.quantita) || 1 : 1;
                        righe.push({
                            ordine: righe.length,
                            descrizione: r.descrizione || 'Voce ricorrente',
                            quantita: qta,
                            unita_misura: r.unita_misura || 'pz',
                            prezzo_unitario: Math.round((imp / (qta || 1)) * 10000) / 10000,
                            importo: Math.round(imp * 100) / 100,
                            categoria: r.categoria || 'ACCESSORIO'
                        });
                        ricorrentiTotCli += imp;
                    });
                }

                // Movimenti dettaglio
                var movimenti = movCli.map(function(mov) {
                    return {
                        data_movimento: mov.dataMovimento ? mov.dataMovimento.toISOString() : null,
                        scontrino: mov.scontrino && mov.scontrino !== '0' ? mov.scontrino : null,
                        id_transazione: mov.idTransazione,
                        targa: mov.targa || null,
                        autista: mov.autista || null,
                        num_carta: mov.numCarta || null,
                        prodotto: mov.prodotto || null,
                        tipo_servizio: mov.tipoServizio || null,
                        prezzo_unitario: mov.prezzoUnitario,
                        volume: mov.volume,
                        importo: mov.importo,
                        categoria: mov.categoria
                    };
                });

                var dataEm = new Date();
                var modPag = cli && cli.modalita_pagamento_fattura ? cli.modalita_pagamento_fattura : null;
                var dataScad = ENI.Fatturazione.Scadenza.calcola(dataEm, modPag);

                var tipoDocumento = cli && cli.tipo === 'Privato' ? 'RICEVUTA' : 'FATTURA';
                var fattura = {
                    data_emissione: dataEm.toISOString().slice(0, 10),
                    data_scadenza: dataScad.toISOString().slice(0, 10),
                    cliente_id: m.match.clienteId,
                    tipo: 'RIEPILOGATIVA_ENI',
                    tipo_documento: tipoDocumento,
                    mese_riferimento: _meseSelez,
                    anno_riferimento: _annoSelez,
                    totale: (m.override && m.override.totale != null) ? m.override.totale : Math.round(((m.saldo.saldo || 0) + ricorrentiTotCli) * 100) / 100,
                    modalita_pagamento: cli && cli.modalita_pagamento_fattura ? cli.modalita_pagamento_fattura : null,
                    iban_beneficiario: (cli && (cli.modalita_pagamento_fattura === 'BONIFICO' || cli.modalita_pagamento_fattura === 'RIBA' || cli.modalita_pagamento_fattura === 'RID_SDD') && impostazioni && impostazioni.iban_lista && impostazioni.iban_lista.length) ? impostazioni.iban_lista[0].iban : null,
                    stato: (cli && cli.modalita_pagamento_fattura) ? 'BOZZA' : 'IN_ATTESA',
                    rif_amministrazione: cli ? cli.rif_amministrazione : null,
                    import_eni_log_id: importLog.id || null
                };

                await ENI.API.salvaFattura(fattura, righe, movimenti);

                // Salva alias se match manuale e nome diverso
                if (m.match.metodo === 'manuale' && m.match.clienteId) {
                    await ENI.API.aggiungiAliasCliente(m.match.clienteId, m.saldo.nomeCliente);
                }

                generati++;
            } catch(e) {
                console.error('Errore fattura per', m.saldo.nomeCliente, e);
                errori++;
            }

            // Update progress
            var pct = Math.round((i + 1) / attivi.length * 100);
            var fill = document.getElementById('imp-prog-fill');
            var txt = document.getElementById('imp-prog-text');
            if (fill) fill.style.width = pct + '%';
            if (txt) txt.textContent = (i + 1) + '/' + attivi.length;
        }

        // Aggiorna import log
        if (importLog.id) {
            try { await ENI.API.update('import_eni_log', importLog.id, { fatture_generate: generati }); } catch(e) {}
        }

        _renderStep4Result(box, generati, errori, importLog);
    }

    function _renderStep4(box) {
        box.innerHTML = '<div class="flex justify-center" style="padding:2rem;"><div class="spinner"></div></div>';
    }

    function _renderStep4Result(box, generati, errori, importLog) {
        box.innerHTML =
            '<div class="empty-state">' +
                '<div class="empty-state-icon">' + (errori ? '\u{26A0}\uFE0F' : '\u{2705}') + '</div>' +
                '<h3>' + generati + ' fatture generate con successo</h3>' +
                (errori ? '<p class="text-danger">' + errori + ' errori durante la generazione</p>' : '') +
                '<p class="text-muted">Mese: ' + _meseSelez + '/' + _annoSelez + '</p>' +
                '<div style="margin-top:1rem;">' +
                    '<button class="btn btn-primary" id="imp-vai-elenco">Vai all\'elenco fatture</button>' +
                '</div>' +
            '</div>';

        document.getElementById('imp-vai-elenco').addEventListener('click', function() {
            ENI.Fatturazione.Index.vaiA('elenco');
        });
    }

    return { render: render };
})();
