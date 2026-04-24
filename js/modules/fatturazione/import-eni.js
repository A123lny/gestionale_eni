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
    var _mapping = [];         // [{ saldo, match: {clienteId, metodo, clienteNome}, confermato, escluso }]

    async function render(container) {
        _container = container;
        _step = 1;
        _saldi = []; _consuntivi = []; _mapping = [];
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

        // Conta movimenti per cliente dal file consuntivi
        var rows = attivi.map(function(m) {
            var movCli = _consuntivi.filter(function(c) {
                return ENI.Fatturazione.Parser.normalizzaNome(c.nomeCliente) === m.saldo.nomeNormalizzato;
            });
            var nCarb = movCli.filter(function(x) { return x.categoria === 'CARBURANTE'; }).length;
            var nLav = movCli.filter(function(x) { return x.categoria === 'LAVAGGIO'; }).length;
            var nAcc = movCli.filter(function(x) { return x.categoria === 'ACCESSORIO'; }).length;
            var cli = _clientiDb.find(function(c) { return c.id === m.match.clienteId; });
            var modPag = cli && cli.modalita_pagamento_fattura ? cli.modalita_pagamento_fattura : '-';

            return '<tr>' +
                '<td><strong>' + ENI.UI.escapeHtml(m.match.clienteNome || m.saldo.nomeCliente) + '</strong></td>' +
                '<td class="text-right">\u20AC ' + (m.saldo.saldo || 0).toLocaleString('it-IT', {minimumFractionDigits:2}) + '</td>' +
                '<td>' + movCli.length + ' <span class="text-muted text-xs">(' + nCarb + 'C/' + nLav + 'L/' + nAcc + 'A)</span></td>' +
                '<td>' + modPag + '</td>' +
                '<td>' + (cli && cli.applica_monofase ? 'S\u00ec' : '-') + '</td>' +
            '</tr>';
        }).join('');

        var totale = attivi.reduce(function(s, m) { return s + (m.saldo.saldo || 0); }, 0);

        box.innerHTML =
            '<p class="mb-2">Fatture da generare: <strong>' + attivi.length + '</strong> per <strong>' + nomi[_meseSelez-1] + ' ' + _annoSelez + '</strong></p>' +
            '<div class="table-wrapper"><table class="table">' +
                '<thead><tr><th>Cliente</th><th class="text-right">Totale</th><th>Movimenti</th><th>Pagamento</th><th>Monofase</th></tr></thead>' +
                '<tbody>' + rows + '</tbody>' +
                '<tfoot><tr><th>TOTALE</th><th class="text-right">\u20AC ' + totale.toLocaleString('it-IT',{minimumFractionDigits:2}) + '</th><th colspan="3"></th></tr></tfoot>' +
            '</table></div>' +
            '<div style="display:flex;justify-content:space-between;margin-top:1rem;">' +
                '<button class="btn btn-secondary" id="imp-step3-back">\u{2190} Indietro</button>' +
                '<button class="btn btn-primary" id="imp-step3-next">Genera ' + attivi.length + ' fatture \u{2192}</button>' +
            '</div>';

        document.getElementById('imp-step3-back').addEventListener('click', function() { _step = 2; _renderStep(); });
        document.getElementById('imp-step3-next').addEventListener('click', function() {
            ENI.UI.confirm('Generare ' + attivi.length + ' fatture per ' + nomi[_meseSelez-1] + ' ' + _annoSelez + '?').then(function(ok) {
                if (ok) _eseguiGenerazione();
            });
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

                // Aggrega righe per categoria
                var categorie = {};
                movCli.forEach(function(mov) {
                    if (!categorie[mov.categoria]) categorie[mov.categoria] = { qta: 0, importo: 0, vol: 0 };
                    categorie[mov.categoria].qta++;
                    categorie[mov.categoria].importo += mov.importo || 0;
                    categorie[mov.categoria].vol += mov.volume || 0;
                });

                var nomiCat = { CARBURANTE: 'Carburanti', LAVAGGIO: 'Lavaggi', ACCESSORIO: 'Accessori', ALTRO: 'Altro' };
                var nomiMese = ['','Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
                var righe = Object.keys(categorie).map(function(cat, idx) {
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

                // Riga monofase automatica per clienti con flag
                if (cli && cli.applica_monofase && _coeffMonofase) {
                    var litriGasolioCli = categorie['CARBURANTE'] ? categorie['CARBURANTE'].vol : 0;
                    if (litriGasolioCli > 0) {
                        var importoMonofase = Math.round(litriGasolioCli * _coeffMonofase * 100) / 100;
                        var nomiMeseMonof = ['','Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
                        righe.push({
                            ordine: righe.length,
                            descrizione: 'Monofase ' + nomiMeseMonof[_meseSelez] + ' \u20AC' + importoMonofase.toLocaleString('it-IT', {minimumFractionDigits: 2}),
                            quantita: 0,
                            unita_misura: '',
                            prezzo_unitario: 0,
                            importo: 0,
                            categoria: 'NOTA'
                        });
                    }
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

                var scadGg = cli && cli.scadenza_giorni ? cli.scadenza_giorni : (impostazioni ? impostazioni.scadenza_default_giorni : 30) || 30;
                var dataEm = new Date();
                var dataScad = new Date(dataEm.getTime() + scadGg * 86400000);

                var tipoDocumento = cli && cli.tipo === 'Privato' ? 'RICEVUTA' : 'FATTURA';
                var fattura = {
                    data_emissione: dataEm.toISOString().slice(0, 10),
                    data_scadenza: dataScad.toISOString().slice(0, 10),
                    cliente_id: m.match.clienteId,
                    tipo: 'RIEPILOGATIVA_ENI',
                    tipo_documento: tipoDocumento,
                    mese_riferimento: _meseSelez,
                    anno_riferimento: _annoSelez,
                    totale: m.saldo.saldo || 0,
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
