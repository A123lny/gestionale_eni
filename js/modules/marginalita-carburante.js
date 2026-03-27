// ============================================================
// TITANWASH - Modulo Marginalità Carburante
// Calcolo utile mensile e margine medio al litro
// ============================================================

var ENI = ENI || {};
ENI.Modules = ENI.Modules || {};

ENI.Modules.MarginalitaCarburante = (function() {
    'use strict';

    // Tabelle
    var T_PERIODI = 'periodi_marginalita';
    var T_RIMANENZE = 'rimanenze';
    var T_CARICHI = 'carichi';
    var T_DETTAGLIO = 'dettaglio_carichi';
    var T_PARAMETRI = 'parametri_fiscali';

    // Prodotti gestiti
    var PRODOTTI = [
        { id: 'benzina', label: 'Benzina', gruppoAccisa: 'accisa_benzina' },
        { id: 'gasolio', label: 'Gasolio', gruppoAccisa: 'accisa_gasolio' },
        { id: 'blu_super', label: 'Blu Super', gruppoAccisa: 'accisa_benzina' },
        { id: 'diesel_plus', label: 'Diesel+', gruppoAccisa: 'accisa_gasolio' }
    ];

    var MESI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
                'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];

    // Stato modulo
    var _container = null;
    var _periodo = null;
    var _rimanenze = [];
    var _carichi = [];
    var _dettagli = {};       // carico_id -> [dettagli]
    var _parametri = {};      // tipo -> valore corrente
    var _activeTab = 'rimanenze';

    // ============================================================
    // RENDER PRINCIPALE
    // ============================================================

    async function render(container) {
        _container = container;
        container.style.maxWidth = 'none';

        var oggi = new Date();

        container.innerHTML =
            '<div class="page-header">' +
                '<h1 class="page-title">Marginalit\u00e0 Carburante</h1>' +
                '<div class="page-header-actions" style="display:flex; gap:var(--space-2); align-items:center;">' +
                    '<select id="mc-mese-select" class="form-select" style="min-width:140px;"></select>' +
                    '<select id="mc-anno-select" class="form-select" style="min-width:100px;"></select>' +
                    '<button class="btn btn-primary" id="mc-btn-carica">Carica</button>' +
                '</div>' +
            '</div>' +
            '<div id="mc-content">' +
                '<div class="flex justify-center" style="padding:2rem;"><div class="spinner"></div></div>' +
            '</div>';

        // Popola selettori
        var selMese = document.getElementById('mc-mese-select');
        var selAnno = document.getElementById('mc-anno-select');
        for (var m = 0; m < 12; m++) {
            selMese.innerHTML += '<option value="' + (m + 1) + '"' + (m + 1 === oggi.getMonth() + 1 ? ' selected' : '') + '>' + MESI[m] + '</option>';
        }
        for (var a = 2024; a <= oggi.getFullYear() + 1; a++) {
            selAnno.innerHTML += '<option value="' + a + '"' + (a === oggi.getFullYear() ? ' selected' : '') + '>' + a + '</option>';
        }

        document.getElementById('mc-btn-carica').addEventListener('click', function() {
            _loadPeriodo();
        });

        await _loadParametri();
        await _loadPeriodo();
    }

    // ============================================================
    // CARICAMENTO PARAMETRI FISCALI
    // ============================================================

    async function _loadParametri() {
        try {
            var params = await ENI.API.getAll(T_PARAMETRI, {
                filters: [{ op: 'is', col: 'data_fine', val: null }],
                order: { col: 'data_inizio', asc: false }
            });
            _parametri = {};
            (params || []).forEach(function(p) {
                if (!_parametri[p.tipo]) {
                    _parametri[p.tipo] = parseFloat(p.valore);
                }
            });
        } catch(e) {
            // Fallback defaults
            _parametri = {
                aliquota_monofase: 0.21,
                accisa_benzina: 0.852082,
                accisa_gasolio: 0.648700
            };
        }
    }

    function _getAccisa(prodotto) {
        var prod = PRODOTTI.find(function(p) { return p.id === prodotto; });
        if (!prod) return 0;
        return _parametri[prod.gruppoAccisa] || 0;
    }

    function _getAliquotaMonofase() {
        return _parametri.aliquota_monofase || 0.21;
    }

    // ============================================================
    // CARICAMENTO PERIODO
    // ============================================================

    async function _loadPeriodo() {
        var content = document.getElementById('mc-content');
        if (!content) return;
        content.innerHTML = '<div class="flex justify-center" style="padding:2rem;"><div class="spinner"></div></div>';

        var mese = parseInt(document.getElementById('mc-mese-select').value);
        var anno = parseInt(document.getElementById('mc-anno-select').value);

        try {
            // Cerca periodo esistente
            var periodi = await ENI.API.getAll(T_PERIODI, {
                filters: [
                    { op: 'eq', col: 'anno', val: anno },
                    { op: 'eq', col: 'mese', val: mese }
                ],
                limit: 1
            });

            if (periodi && periodi.length > 0) {
                _periodo = periodi[0];
            } else {
                // Crea nuovo periodo
                _periodo = await ENI.API.insert(T_PERIODI, {
                    anno: anno,
                    mese: mese,
                    stato: 'bozza'
                });

                // Crea rimanenze vuote (8 record: 4 prodotti x 2 tipi)
                var rimanenzeInit = [];
                ['iniziale', 'finale'].forEach(function(tipo) {
                    PRODOTTI.forEach(function(prod) {
                        rimanenzeInit.push({
                            periodo_id: _periodo.id,
                            tipo: tipo,
                            prodotto: prod.id
                        });
                    });
                });

                // Inserisci rimanenze una alla volta (supabase insert bulk con select non va)
                for (var i = 0; i < rimanenzeInit.length; i++) {
                    await ENI.API.insert(T_RIMANENZE, rimanenzeInit[i]);
                }

                // Prova a copiare rimanenze finali dal mese precedente
                await _copiaRimanenzeDaMesePrecedente(anno, mese);
            }

            // Carica dati correlati
            await _loadDatiPeriodo();
            _renderContent(content);
        } catch(e) {
            content.innerHTML =
                '<div class="empty-state">' +
                    '<p class="empty-state-text">Errore: ' + ENI.UI.escapeHtml(e.message) + '</p>' +
                '</div>';
        }
    }

    // ============================================================
    // COPIA RIMANENZE DA MESE PRECEDENTE
    // ============================================================

    async function _copiaRimanenzeDaMesePrecedente(anno, mese) {
        var prevMese = mese - 1;
        var prevAnno = anno;
        if (prevMese === 0) { prevMese = 12; prevAnno--; }

        try {
            var prevPeriodi = await ENI.API.getAll(T_PERIODI, {
                filters: [
                    { op: 'eq', col: 'anno', val: prevAnno },
                    { op: 'eq', col: 'mese', val: prevMese }
                ],
                limit: 1
            });

            if (!prevPeriodi || prevPeriodi.length === 0) return;

            var prevRim = await ENI.API.getAll(T_RIMANENZE, {
                filters: [
                    { op: 'eq', col: 'periodo_id', val: prevPeriodi[0].id },
                    { op: 'eq', col: 'tipo', val: 'finale' }
                ]
            });

            if (!prevRim || prevRim.length === 0) return;

            // Aggiorna le rimanenze iniziali del periodo corrente
            var rimInizialiCorrente = await ENI.API.getAll(T_RIMANENZE, {
                filters: [
                    { op: 'eq', col: 'periodo_id', val: _periodo.id },
                    { op: 'eq', col: 'tipo', val: 'iniziale' }
                ]
            });

            for (var i = 0; i < prevRim.length; i++) {
                var finale = prevRim[i];
                var iniziale = rimInizialiCorrente.find(function(r) { return r.prodotto === finale.prodotto; });
                if (iniziale) {
                    await ENI.API.update(T_RIMANENZE, iniziale.id, {
                        litri_commerciali: finale.litri_commerciali,
                        prezzo_commerciale: finale.prezzo_commerciale,
                        litri_fiscali: finale.litri_fiscali,
                        monofase: finale.monofase,
                        prezzo_comm_pagato: finale.prezzo_comm_pagato,
                        costo_commerciale: finale.costo_commerciale,
                        costo_fiscale: finale.costo_fiscale,
                        costo_totale: finale.costo_totale
                    });
                }
            }
        } catch(e) {
            console.error('Errore copia rimanenze mese precedente:', e);
        }
    }

    // ============================================================
    // CARICAMENTO DATI PERIODO
    // ============================================================

    async function _loadDatiPeriodo() {
        _rimanenze = await ENI.API.getAll(T_RIMANENZE, {
            filters: [{ op: 'eq', col: 'periodo_id', val: _periodo.id }]
        });

        _carichi = await ENI.API.getAll(T_CARICHI, {
            filters: [{ op: 'eq', col: 'periodo_id', val: _periodo.id }],
            order: { col: 'numero_progressivo', asc: true }
        });

        // Carica dettagli per ogni carico
        _dettagli = {};
        for (var i = 0; i < _carichi.length; i++) {
            var det = await ENI.API.getAll(T_DETTAGLIO, {
                filters: [{ op: 'eq', col: 'carico_id', val: _carichi[i].id }]
            });
            _dettagli[_carichi[i].id] = det || [];
        }
    }

    // ============================================================
    // RENDER CONTENUTO
    // ============================================================

    function _renderContent(content) {
        var meseLabel = MESI[_periodo.mese - 1] + ' ' + _periodo.anno;
        var isChiuso = _periodo.stato === 'chiuso';
        var totali = _calcolaTotali();

        // Barra info + riepilogo compatto
        var html =
            '<div style="display:flex; align-items:center; gap:var(--space-3); margin-bottom:var(--space-3); flex-wrap:wrap;">' +
                '<div style="flex:1; min-width:200px;">' +
                    '<span style="font-size:var(--font-size-sm); color:var(--text-secondary);">' + meseLabel + '</span> ' +
                    (isChiuso ? '<span class="badge badge-success">CHIUSO</span>' : '<span class="badge badge-warning">BOZZA</span>') +
                '</div>' +
                '<div style="display:flex; gap:var(--space-3);">' +
                    '<div style="text-align:center; padding:var(--space-1) var(--space-3); background:var(--color-primary-light); border-radius:var(--radius-md);">' +
                        '<div style="font-size:0.65rem; text-transform:uppercase; color:var(--text-secondary);">Utile</div>' +
                        '<div style="font-size:1.2rem; font-weight:700; color:' + (totali.utile >= 0 ? 'var(--color-success)' : 'var(--color-danger)') + ';">' + _formatEuro(totali.utile) + '</div>' +
                    '</div>' +
                    '<div style="text-align:center; padding:var(--space-1) var(--space-3); background:var(--color-primary-light); border-radius:var(--radius-md);">' +
                        '<div style="font-size:0.65rem; text-transform:uppercase; color:var(--text-secondary);">Margine/lt</div>' +
                        '<div style="font-size:1.2rem; font-weight:700; color:var(--color-primary);">' + (totali.margineLitro !== null ? _formatEuro4(totali.margineLitro) : 'N/D') + '</div>' +
                    '</div>' +
                '</div>' +
            '</div>';

        // Tabs
        html +=
            '<div class="tabs" style="margin-bottom:var(--space-3);">' +
                '<button class="tab-btn' + (_activeTab === 'rimanenze' ? ' active' : '') + '" data-tab="rimanenze">Rimanenze</button>' +
                '<button class="tab-btn' + (_activeTab === 'carichi' ? ' active' : '') + '" data-tab="carichi">Carichi (' + _carichi.length + ')</button>' +
                '<button class="tab-btn' + (_activeTab === 'riepilogo' ? ' active' : '') + '" data-tab="riepilogo">Riepilogo</button>' +
            '</div>' +
            '<div id="mc-tab-content"></div>';

        content.innerHTML = html;

        // Tab switching
        content.querySelectorAll('.tab-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                _activeTab = this.dataset.tab;
                content.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
                this.classList.add('active');
                _renderTab();
            });
        });

        _renderTab();
    }

    // ============================================================
    // RENDER TABS
    // ============================================================

    function _renderTab() {
        var tabContent = document.getElementById('mc-tab-content');
        if (!tabContent) return;

        switch(_activeTab) {
            case 'rimanenze':
                _renderRimanenze(tabContent);
                break;
            case 'carichi':
                _renderCarichi(tabContent);
                break;
            case 'riepilogo':
                _renderRiepilogo(tabContent);
                break;
        }
    }

    // ============================================================
    // TAB: RIMANENZE
    // ============================================================

    function _renderRimanenze(container) {
        var isChiuso = _periodo.stato === 'chiuso';

        var html = '';

        ['iniziale', 'finale'].forEach(function(tipo) {
            var label = tipo === 'iniziale' ? 'Rimanenze Iniziali' : 'Rimanenze Finali';
            var rimTipo = _rimanenze.filter(function(r) { return r.tipo === tipo; });
            var totale = rimTipo.reduce(function(s, r) { return s + (parseFloat(r.costo_totale) || 0); }, 0);

            html +=
                '<div class="card" style="margin-bottom:var(--space-3);">' +
                    '<div class="card-body" style="padding:var(--space-2);">' +
                        '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:var(--space-2);">' +
                            '<h3 style="margin:0; font-size:var(--font-size-base);">' + label + '</h3>' +
                            '<strong style="color:var(--color-primary);">Totale: ' + _formatEuro(totale) + '</strong>' +
                        '</div>' +
                        '<table class="table cm-table-compact">' +
                            '<thead><tr>' +
                                '<th>Prodotto</th>' +
                                '<th class="text-right">Lt. Comm.</th>' +
                                '<th class="text-right">Prezzo Comm.</th>' +
                                '<th class="text-right">Lt. Fiscali</th>' +
                                '<th class="text-right">Monofase</th>' +
                                '<th class="text-right">Prezzo Pagato</th>' +
                                '<th class="text-right">Costo Comm.</th>' +
                                '<th class="text-right">Costo Fiscale</th>' +
                                '<th class="text-right" style="background:#e0f7fa;">Costo Totale</th>' +
                                (!isChiuso ? '<th style="width:40px;"></th>' : '') +
                            '</tr></thead>' +
                            '<tbody>';

            PRODOTTI.forEach(function(prod) {
                var rim = rimTipo.find(function(r) { return r.prodotto === prod.id; });
                if (!rim) return;

                html +=
                    '<tr>' +
                        '<td><strong>' + prod.label + '</strong></td>' +
                        '<td class="text-right">' + _formatNumero(rim.litri_commerciali) + '</td>' +
                        '<td class="text-right">' + _formatPrezzo5(rim.prezzo_commerciale) + '</td>' +
                        '<td class="text-right">' + _formatNumero(rim.litri_fiscali) + '</td>' +
                        '<td class="text-right">' + _formatPrezzo5(rim.monofase) + '</td>' +
                        '<td class="text-right">' + _formatPrezzo5(rim.prezzo_comm_pagato) + '</td>' +
                        '<td class="text-right">' + _formatEuro(rim.costo_commerciale) + '</td>' +
                        '<td class="text-right">' + _formatEuro(rim.costo_fiscale) + '</td>' +
                        '<td class="text-right" style="background:#e0f7fa; font-weight:600;">' + _formatEuro(rim.costo_totale) + '</td>' +
                        (!isChiuso ? '<td><button class="btn-icon mc-btn-edit-rim" data-id="' + rim.id + '" data-tipo="' + tipo + '" data-prodotto="' + prod.id + '" title="Modifica"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="pointer-events:none;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button></td>' : '') +
                    '</tr>';
            });

            html += '</tbody></table></div></div>';
        });

        container.innerHTML = html;

        // Listener modifica rimanenze
        if (!isChiuso) {
            container.querySelectorAll('.mc-btn-edit-rim').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    var id = btn.getAttribute('data-id');
                    var rim = _rimanenze.find(function(r) { return String(r.id) === String(id); });
                    if (rim) _showRimanenzaForm(rim);
                });
            });
        }
    }

    // ============================================================
    // FORM MODIFICA RIMANENZA
    // ============================================================

    function _showRimanenzaForm(rim) {
        var prod = PRODOTTI.find(function(p) { return p.id === rim.prodotto; });
        var tipoLabel = rim.tipo === 'iniziale' ? 'Iniziale' : 'Finale';

        var modal =
            '<div class="modal-backdrop" id="mc-modal-rim">' +
                '<div class="modal" style="max-width:400px;">' +
                    '<div class="modal-header">' +
                        '<h3>Rimanenza ' + tipoLabel + ' - ' + prod.label + '</h3>' +
                    '</div>' +
                    '<div class="modal-body">' +
                        '<div class="form-group">' +
                            '<label class="form-label">Litri commerciali</label>' +
                            '<input type="number" class="form-input" id="mc-rim-litri-comm" step="0.01" value="' + (rim.litri_commerciali || 0) + '">' +
                        '</div>' +
                        '<div class="form-group">' +
                            '<label class="form-label">Prezzo commerciale (\u20AC/lt)</label>' +
                            '<input type="number" class="form-input" id="mc-rim-prezzo" step="0.00001" value="' + (rim.prezzo_commerciale || 0) + '">' +
                        '</div>' +
                        '<div class="form-group">' +
                            '<label class="form-label">Litri fiscali</label>' +
                            '<input type="number" class="form-input" id="mc-rim-litri-fisc" step="0.01" value="' + (rim.litri_fiscali || 0) + '">' +
                        '</div>' +
                        '<div id="mc-rim-preview" style="padding:var(--space-2); background:var(--color-gray-50); border-radius:var(--radius-md); margin-top:var(--space-2); font-size:var(--font-size-sm);"></div>' +
                    '</div>' +
                    '<div class="modal-footer">' +
                        '<button class="btn btn-outline" id="mc-rim-annulla">Annulla</button>' +
                        '<button class="btn btn-primary" id="mc-rim-salva">Salva</button>' +
                    '</div>' +
                '</div>' +
            '</div>';

        document.body.insertAdjacentHTML('beforeend', modal);

        var modalEl = document.getElementById('mc-modal-rim');
        requestAnimationFrame(function() { modalEl.classList.add('active'); });

        // Preview in tempo reale
        function updatePreview() {
            var litriComm = parseFloat(document.getElementById('mc-rim-litri-comm').value) || 0;
            var prezzo = parseFloat(document.getElementById('mc-rim-prezzo').value) || 0;
            var litriFisc = parseFloat(document.getElementById('mc-rim-litri-fisc').value) || 0;
            var calc = _calcolaRigaProdotto(rim.prodotto, litriComm, prezzo, litriFisc);
            var prev = document.getElementById('mc-rim-preview');
            prev.innerHTML =
                'Monofase: <strong>' + _formatPrezzo5(calc.monofase) + '</strong> | ' +
                'Costo comm.: <strong>' + _formatEuro(calc.costoCommerciale) + '</strong> | ' +
                'Costo fisc.: <strong>' + _formatEuro(calc.costoFiscale) + '</strong> | ' +
                'Totale: <strong style="color:var(--color-primary);">' + _formatEuro(calc.costoTotale) + '</strong>';
        }

        ['mc-rim-litri-comm', 'mc-rim-prezzo', 'mc-rim-litri-fisc'].forEach(function(id) {
            document.getElementById(id).addEventListener('input', updatePreview);
        });
        updatePreview();

        // Annulla
        document.getElementById('mc-rim-annulla').addEventListener('click', function() {
            modalEl.remove();
        });

        // Salva
        document.getElementById('mc-rim-salva').addEventListener('click', async function() {
            var litriComm = parseFloat(document.getElementById('mc-rim-litri-comm').value) || 0;
            var prezzo = parseFloat(document.getElementById('mc-rim-prezzo').value) || 0;
            var litriFisc = parseFloat(document.getElementById('mc-rim-litri-fisc').value) || 0;
            var calc = _calcolaRigaProdotto(rim.prodotto, litriComm, prezzo, litriFisc);

            try {
                await ENI.API.update(T_RIMANENZE, rim.id, {
                    litri_commerciali: litriComm,
                    prezzo_commerciale: prezzo,
                    litri_fiscali: litriFisc,
                    monofase: calc.monofase,
                    prezzo_comm_pagato: calc.prezzoCommPagato,
                    costo_commerciale: calc.costoCommerciale,
                    costo_fiscale: calc.costoFiscale,
                    costo_totale: calc.costoTotale
                });

                modalEl.remove();
                await _ricalcolaPeriodo();
                ENI.UI.success('Rimanenza aggiornata');
            } catch(e) {
                ENI.UI.error('Errore: ' + e.message);
            }
        });

        // Chiudi cliccando fuori
        modalEl.addEventListener('click', function(e) {
            if (e.target === modalEl) modalEl.remove();
        });
    }

    // ============================================================
    // TAB: CARICHI
    // ============================================================

    function _renderCarichi(container) {
        var isChiuso = _periodo.stato === 'chiuso';

        var html = '';

        if (!isChiuso) {
            html += '<div style="margin-bottom:var(--space-3);">' +
                '<button class="btn btn-primary btn-sm" id="mc-btn-add-carico">+ Nuovo Carico</button>' +
            '</div>';
        }

        if (_carichi.length === 0) {
            html += '<div class="card"><div class="card-body"><div class="empty-state">' +
                '<p class="empty-state-text">Nessun carico inserito</p>' +
                '<p style="color:var(--text-secondary); font-size:var(--font-size-sm);">Clicca "Nuovo Carico" per registrare una consegna</p>' +
                '</div></div></div>';
            container.innerHTML = html;
            _setupCarichiListeners(isChiuso);
            return;
        }

        _carichi.forEach(function(carico) {
            var dettagli = _dettagli[carico.id] || [];

            html +=
                '<div class="card" style="margin-bottom:var(--space-3);">' +
                    '<div class="card-body" style="padding:var(--space-2);">' +
                        '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:var(--space-2);">' +
                            '<div>' +
                                '<strong>Carico #' + carico.numero_progressivo + '</strong>' +
                                '<span style="color:var(--text-secondary); margin-left:var(--space-2);">' + _formatData(carico.data_carico) + '</span>' +
                                (carico.note ? '<span style="color:var(--text-secondary); margin-left:var(--space-2); font-style:italic;">' + ENI.UI.escapeHtml(carico.note) + '</span>' : '') +
                            '</div>' +
                            '<div style="display:flex; align-items:center; gap:var(--space-2);">' +
                                '<strong style="color:var(--color-primary);">' + _formatEuro(carico.costo_totale_carico) + '</strong>' +
                                (!isChiuso ? '<button class="btn-icon mc-btn-del-carico" data-id="' + carico.id + '" title="Elimina" style="color:var(--color-danger);"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="pointer-events:none;"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>' : '') +
                            '</div>' +
                        '</div>' +
                        '<table class="table cm-table-compact">' +
                            '<thead><tr>' +
                                '<th>Prodotto</th>' +
                                '<th class="text-right">Lt. Comm.</th>' +
                                '<th class="text-right">Prezzo Comm.</th>' +
                                '<th class="text-right">Lt. Fiscali</th>' +
                                '<th class="text-right">Monofase</th>' +
                                '<th class="text-right">Costo Comm.</th>' +
                                '<th class="text-right">Costo Fiscale</th>' +
                                '<th class="text-right" style="background:#e0f7fa;">Costo Tot.</th>' +
                                (!isChiuso ? '<th style="width:40px;"></th>' : '') +
                            '</tr></thead>' +
                            '<tbody>';

            PRODOTTI.forEach(function(prod) {
                var det = dettagli.find(function(d) { return d.prodotto === prod.id; });
                if (!det) det = { litri_commerciali: 0, prezzo_commerciale: 0, litri_fiscali: 0, monofase: 0, costo_commerciale: 0, costo_fiscale: 0, costo_totale_prodotto: 0 };

                html +=
                    '<tr>' +
                        '<td><strong>' + prod.label + '</strong></td>' +
                        '<td class="text-right">' + _formatNumero(det.litri_commerciali) + '</td>' +
                        '<td class="text-right">' + _formatPrezzo5(det.prezzo_commerciale) + '</td>' +
                        '<td class="text-right">' + _formatNumero(det.litri_fiscali) + '</td>' +
                        '<td class="text-right">' + _formatPrezzo5(det.monofase) + '</td>' +
                        '<td class="text-right">' + _formatEuro(det.costo_commerciale) + '</td>' +
                        '<td class="text-right">' + _formatEuro(det.costo_fiscale) + '</td>' +
                        '<td class="text-right" style="background:#e0f7fa; font-weight:600;">' + _formatEuro(det.costo_totale_prodotto) + '</td>' +
                        (!isChiuso && det.id ? '<td><button class="btn-icon mc-btn-edit-det" data-id="' + det.id + '" data-carico="' + carico.id + '" data-prodotto="' + prod.id + '" title="Modifica"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="pointer-events:none;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button></td>' : (!isChiuso ? '<td></td>' : '')) +
                    '</tr>';
            });

            html += '</tbody></table></div></div>';
        });

        container.innerHTML = html;
        _setupCarichiListeners(isChiuso);
    }

    function _setupCarichiListeners(isChiuso) {
        if (isChiuso) return;

        var btnAdd = document.getElementById('mc-btn-add-carico');
        if (btnAdd) {
            btnAdd.addEventListener('click', function() { _showNuovoCaricoForm(); });
        }

        document.querySelectorAll('.mc-btn-del-carico').forEach(function(btn) {
            btn.addEventListener('click', function() {
                _handleEliminaCarico(btn.getAttribute('data-id'));
            });
        });

        document.querySelectorAll('.mc-btn-edit-det').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var detId = btn.getAttribute('data-id');
                var caricoId = btn.getAttribute('data-carico');
                var prodotto = btn.getAttribute('data-prodotto');
                var dettagli = _dettagli[caricoId] || [];
                var det = dettagli.find(function(d) { return String(d.id) === String(detId); });
                if (det) _showDettaglioForm(det, caricoId);
            });
        });
    }

    // ============================================================
    // FORM NUOVO CARICO
    // ============================================================

    function _showNuovoCaricoForm() {
        var oggi = new Date();
        var dataDefault = oggi.getFullYear() + '-' + String(oggi.getMonth() + 1).padStart(2, '0') + '-' + String(oggi.getDate()).padStart(2, '0');

        var modal =
            '<div class="modal-backdrop" id="mc-modal-carico">' +
                '<div class="modal" style="max-width:350px;">' +
                    '<div class="modal-header"><h3>Nuovo Carico</h3></div>' +
                    '<div class="modal-body">' +
                        '<div class="form-group">' +
                            '<label class="form-label">Data carico</label>' +
                            '<input type="date" class="form-input" id="mc-carico-data" value="' + dataDefault + '">' +
                        '</div>' +
                        '<div class="form-group">' +
                            '<label class="form-label">Note (opzionale)</label>' +
                            '<input type="text" class="form-input" id="mc-carico-note" placeholder="Es. Fornitore XY">' +
                        '</div>' +
                    '</div>' +
                    '<div class="modal-footer">' +
                        '<button class="btn btn-outline" id="mc-carico-annulla">Annulla</button>' +
                        '<button class="btn btn-primary" id="mc-carico-crea">Crea Carico</button>' +
                    '</div>' +
                '</div>' +
            '</div>';

        document.body.insertAdjacentHTML('beforeend', modal);
        var modalEl = document.getElementById('mc-modal-carico');
        requestAnimationFrame(function() { modalEl.classList.add('active'); });

        document.getElementById('mc-carico-annulla').addEventListener('click', function() { modalEl.remove(); });
        modalEl.addEventListener('click', function(e) { if (e.target === modalEl) modalEl.remove(); });

        document.getElementById('mc-carico-crea').addEventListener('click', async function() {
            var data = document.getElementById('mc-carico-data').value;
            var note = document.getElementById('mc-carico-note').value.trim();
            if (!data) { ENI.UI.warning('Inserisci la data'); return; }

            try {
                var numProg = _carichi.length + 1;
                var carico = await ENI.API.insert(T_CARICHI, {
                    periodo_id: _periodo.id,
                    numero_progressivo: numProg,
                    data_carico: data,
                    note: note || null
                });

                // Crea 4 righe dettaglio vuote
                for (var i = 0; i < PRODOTTI.length; i++) {
                    await ENI.API.insert(T_DETTAGLIO, {
                        carico_id: carico.id,
                        prodotto: PRODOTTI[i].id
                    });
                }

                modalEl.remove();
                await _loadDatiPeriodo();
                _renderTab();
                ENI.UI.success('Carico #' + numProg + ' creato');
            } catch(e) {
                ENI.UI.error('Errore: ' + e.message);
            }
        });
    }

    // ============================================================
    // FORM MODIFICA DETTAGLIO CARICO
    // ============================================================

    function _showDettaglioForm(det, caricoId) {
        var prod = PRODOTTI.find(function(p) { return p.id === det.prodotto; });

        var modal =
            '<div class="modal-backdrop" id="mc-modal-det">' +
                '<div class="modal" style="max-width:400px;">' +
                    '<div class="modal-header"><h3>' + prod.label + ' - Carico</h3></div>' +
                    '<div class="modal-body">' +
                        '<div class="form-group">' +
                            '<label class="form-label">Litri commerciali</label>' +
                            '<input type="number" class="form-input" id="mc-det-litri-comm" step="0.01" value="' + (det.litri_commerciali || 0) + '">' +
                        '</div>' +
                        '<div class="form-group">' +
                            '<label class="form-label">Prezzo commerciale (\u20AC/lt)</label>' +
                            '<input type="number" class="form-input" id="mc-det-prezzo" step="0.00001" value="' + (det.prezzo_commerciale || 0) + '">' +
                        '</div>' +
                        '<div class="form-group">' +
                            '<label class="form-label">Litri fiscali</label>' +
                            '<input type="number" class="form-input" id="mc-det-litri-fisc" step="0.01" value="' + (det.litri_fiscali || 0) + '">' +
                        '</div>' +
                        '<div id="mc-det-preview" style="padding:var(--space-2); background:var(--color-gray-50); border-radius:var(--radius-md); margin-top:var(--space-2); font-size:var(--font-size-sm);"></div>' +
                    '</div>' +
                    '<div class="modal-footer">' +
                        '<button class="btn btn-outline" id="mc-det-annulla">Annulla</button>' +
                        '<button class="btn btn-primary" id="mc-det-salva">Salva</button>' +
                    '</div>' +
                '</div>' +
            '</div>';

        document.body.insertAdjacentHTML('beforeend', modal);
        var modalEl = document.getElementById('mc-modal-det');
        requestAnimationFrame(function() { modalEl.classList.add('active'); });

        function updatePreview() {
            var litriComm = parseFloat(document.getElementById('mc-det-litri-comm').value) || 0;
            var prezzo = parseFloat(document.getElementById('mc-det-prezzo').value) || 0;
            var litriFisc = parseFloat(document.getElementById('mc-det-litri-fisc').value) || 0;
            var calc = _calcolaRigaProdotto(det.prodotto, litriComm, prezzo, litriFisc);
            var prev = document.getElementById('mc-det-preview');
            prev.innerHTML =
                'Monofase: <strong>' + _formatPrezzo5(calc.monofase) + '</strong> | ' +
                'Costo comm.: <strong>' + _formatEuro(calc.costoCommerciale) + '</strong> | ' +
                'Costo fisc.: <strong>' + _formatEuro(calc.costoFiscale) + '</strong> | ' +
                'Totale: <strong style="color:var(--color-primary);">' + _formatEuro(calc.costoTotale) + '</strong>';
        }

        ['mc-det-litri-comm', 'mc-det-prezzo', 'mc-det-litri-fisc'].forEach(function(id) {
            document.getElementById(id).addEventListener('input', updatePreview);
        });
        updatePreview();

        document.getElementById('mc-det-annulla').addEventListener('click', function() { modalEl.remove(); });
        modalEl.addEventListener('click', function(e) { if (e.target === modalEl) modalEl.remove(); });

        document.getElementById('mc-det-salva').addEventListener('click', async function() {
            var litriComm = parseFloat(document.getElementById('mc-det-litri-comm').value) || 0;
            var prezzo = parseFloat(document.getElementById('mc-det-prezzo').value) || 0;
            var litriFisc = parseFloat(document.getElementById('mc-det-litri-fisc').value) || 0;
            var calc = _calcolaRigaProdotto(det.prodotto, litriComm, prezzo, litriFisc);

            try {
                await ENI.API.update(T_DETTAGLIO, det.id, {
                    litri_commerciali: litriComm,
                    prezzo_commerciale: prezzo,
                    litri_fiscali: litriFisc,
                    monofase: calc.monofase,
                    prezzo_comm_pagato: calc.prezzoCommPagato,
                    costo_commerciale: calc.costoCommerciale,
                    costo_fiscale: calc.costoFiscale,
                    costo_totale_prodotto: calc.costoTotale
                });

                // Aggiorna totale carico
                var dettagli = await ENI.API.getAll(T_DETTAGLIO, {
                    filters: [{ op: 'eq', col: 'carico_id', val: caricoId }]
                });
                var totCarico = dettagli.reduce(function(s, d) { return s + (parseFloat(d.costo_totale_prodotto) || 0); }, 0);
                await ENI.API.update(T_CARICHI, caricoId, { costo_totale_carico: totCarico });

                modalEl.remove();
                await _ricalcolaPeriodo();
                ENI.UI.success('Dettaglio aggiornato');
            } catch(e) {
                ENI.UI.error('Errore: ' + e.message);
            }
        });
    }

    // ============================================================
    // ELIMINA CARICO
    // ============================================================

    async function _handleEliminaCarico(id) {
        if (!confirm('Eliminare questo carico e tutti i suoi dettagli?')) return;
        try {
            await ENI.API.remove(T_CARICHI, id);
            // Rinumera carichi
            var carichiRes = await ENI.API.getAll(T_CARICHI, {
                filters: [{ op: 'eq', col: 'periodo_id', val: _periodo.id }],
                order: { col: 'numero_progressivo', asc: true }
            });
            for (var i = 0; i < carichiRes.length; i++) {
                if (carichiRes[i].numero_progressivo !== i + 1) {
                    await ENI.API.update(T_CARICHI, carichiRes[i].id, { numero_progressivo: i + 1 });
                }
            }
            await _ricalcolaPeriodo();
            ENI.UI.success('Carico eliminato');
        } catch(e) {
            ENI.UI.error('Errore: ' + e.message);
        }
    }

    // ============================================================
    // TAB: RIEPILOGO
    // ============================================================

    function _renderRiepilogo(container) {
        var isChiuso = _periodo.stato === 'chiuso';
        var totali = _calcolaTotali();

        var html =
            '<div class="card" style="margin-bottom:var(--space-3);">' +
                '<div class="card-body">' +
                    '<h3 style="margin:0 0 var(--space-3) 0;">Dati di Vendita e Voci Accessorie</h3>' +
                    '<div class="form-grid" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:var(--space-3);">' +
                        _renderCampoRiepilogo('Litri venduti', 'mc-litri-venduti', _periodo.litri_venduti, isChiuso, '0.01') +
                        _renderCampoRiepilogo('Totale incassato (\u20AC)', 'mc-incassato', _periodo.totale_incassato, isChiuso, '0.01') +
                        _renderCampoRiepilogo('Rimborso Stato (\u20AC)', 'mc-rimborso-stato', _periodo.rimborso_stato, isChiuso, '0.01') +
                        _renderCampoRiepilogo('Pi\u00F9 Servito (\u20AC)', 'mc-piu-servito', _periodo.piu_servito, isChiuso, '0.01') +
                        _renderCampoRiepilogo('Rimborso Cali (\u20AC)', 'mc-rimborso-cali', _periodo.rimborso_cali, isChiuso, '0.01') +
                        _renderCampoRiepilogo('Note Credito (\u20AC)', 'mc-note-credito', _periodo.note_credito, isChiuso, '0.01') +
                        _renderCampoRiepilogo('Note Debito (\u20AC)', 'mc-note-debito', _periodo.note_debito, isChiuso, '0.01') +
                    '</div>' +
                    (!isChiuso ? '<button class="btn btn-primary btn-sm" id="mc-btn-salva-riepilogo" style="margin-top:var(--space-3);">Salva</button>' : '') +
                '</div>' +
            '</div>';

        // Riepilogo calcolo
        html +=
            '<div class="card" style="border:2px solid var(--color-primary);">' +
                '<div class="card-body">' +
                    '<h3 style="margin:0 0 var(--space-3) 0;">Calcolo Marginalit\u00e0</h3>' +
                    '<table class="table cm-table-compact" style="max-width:500px;">' +
                        '<tbody>' +
                            '<tr><td>Totale costo carichi</td><td class="text-right">' + _formatEuro(totali.totaleCostoCarichi) + '</td></tr>' +
                            '<tr><td>Rimanenze iniziali</td><td class="text-right">' + _formatEuro(totali.totRimIniziali) + '</td></tr>' +
                            '<tr><td>Rimanenze finali</td><td class="text-right">' + _formatEuro(totali.totRimFinali) + '</td></tr>' +
                            '<tr><td>Differenza rimanenze</td><td class="text-right">' + _formatEuro(totali.diffRimanenze) + '</td></tr>' +
                            '<tr style="border-top:2px solid var(--color-gray-300);"><td>Totale incassato</td><td class="text-right">' + _formatEuro(parseFloat(_periodo.totale_incassato) || 0) + '</td></tr>' +
                            '<tr><td>Voci accessorie</td><td class="text-right">' + _formatEuro(totali.vociAccessorie) + '</td></tr>' +
                            '<tr style="font-size:1.1em; font-weight:700; border-top:2px solid var(--color-primary);"><td>UTILE MENSILE</td><td class="text-right" style="color:' + (totali.utile >= 0 ? 'var(--color-success)' : 'var(--color-danger)') + ';">' + _formatEuro(totali.utile) + '</td></tr>' +
                            '<tr style="font-size:1.1em; font-weight:700;"><td>MARGINE MEDIO / LITRO</td><td class="text-right" style="color:var(--color-primary);">' + (totali.margineLitro !== null ? _formatEuro4(totali.margineLitro) : 'N/D') + '</td></tr>' +
                        '</tbody>' +
                    '</table>' +
                '</div>' +
            '</div>';

        // Azioni mese
        html +=
            '<div style="margin-top:var(--space-3); display:flex; gap:var(--space-2);">' +
                (isChiuso
                    ? '<button class="btn btn-outline btn-sm" id="mc-btn-riapri">Riapri Mese</button>'
                    : '<button class="btn btn-outline btn-sm" id="mc-btn-chiudi">Chiudi Mese</button>') +
            '</div>';

        container.innerHTML = html;

        // Listener salva riepilogo
        var btnSalva = document.getElementById('mc-btn-salva-riepilogo');
        if (btnSalva) {
            btnSalva.addEventListener('click', async function() {
                try {
                    await ENI.API.update(T_PERIODI, _periodo.id, {
                        litri_venduti: parseFloat(document.getElementById('mc-litri-venduti').value) || 0,
                        totale_incassato: parseFloat(document.getElementById('mc-incassato').value) || 0,
                        rimborso_stato: parseFloat(document.getElementById('mc-rimborso-stato').value) || 0,
                        piu_servito: parseFloat(document.getElementById('mc-piu-servito').value) || 0,
                        rimborso_cali: parseFloat(document.getElementById('mc-rimborso-cali').value) || 0,
                        note_credito: parseFloat(document.getElementById('mc-note-credito').value) || 0,
                        note_debito: parseFloat(document.getElementById('mc-note-debito').value) || 0
                    });
                    await _ricalcolaPeriodo();
                    ENI.UI.success('Dati salvati');
                } catch(e) {
                    ENI.UI.error('Errore: ' + e.message);
                }
            });
        }

        // Chiudi/Riapri mese
        var btnChiudi = document.getElementById('mc-btn-chiudi');
        if (btnChiudi) {
            btnChiudi.addEventListener('click', async function() {
                if (!confirm('Chiudere il mese?')) return;
                try {
                    await ENI.API.update(T_PERIODI, _periodo.id, { stato: 'chiuso' });
                    await _ricalcolaPeriodo();
                    ENI.UI.success('Mese chiuso');
                } catch(e) { ENI.UI.error('Errore: ' + e.message); }
            });
        }

        var btnRiapri = document.getElementById('mc-btn-riapri');
        if (btnRiapri) {
            btnRiapri.addEventListener('click', async function() {
                if (!confirm('Riaprire il mese?')) return;
                try {
                    await ENI.API.update(T_PERIODI, _periodo.id, { stato: 'bozza' });
                    await _ricalcolaPeriodo();
                    ENI.UI.success('Mese riaperto');
                } catch(e) { ENI.UI.error('Errore: ' + e.message); }
            });
        }
    }

    function _renderCampoRiepilogo(label, id, value, isChiuso, step) {
        return '<div class="form-group">' +
            '<label class="form-label">' + label + '</label>' +
            (isChiuso
                ? '<div style="padding:var(--space-2); font-weight:600;">' + (parseFloat(value) || 0) + '</div>'
                : '<input type="number" class="form-input" id="' + id + '" step="' + step + '" value="' + (parseFloat(value) || 0) + '">') +
        '</div>';
    }

    // ============================================================
    // RICALCOLA PERIODO
    // ============================================================

    async function _ricalcolaPeriodo() {
        await _loadDatiPeriodo();

        // Ricalcola periodo
        var periodoRes = await ENI.API.getAll(T_PERIODI, {
            filters: [
                { op: 'eq', col: 'anno', val: _periodo.anno },
                { op: 'eq', col: 'mese', val: _periodo.mese }
            ],
            limit: 1
        });
        if (periodoRes && periodoRes.length > 0) _periodo = periodoRes[0];

        var totali = _calcolaTotali();

        await ENI.API.update(T_PERIODI, _periodo.id, {
            totale_costo_carichi: totali.totaleCostoCarichi,
            differenza_rimanenze: totali.diffRimanenze,
            utile_mensile: totali.utile,
            margine_medio_litro: totali.margineLitro || 0,
            updated_at: new Date().toISOString()
        });

        // Ricarica periodo aggiornato
        var periodoUpd = await ENI.API.getAll(T_PERIODI, {
            filters: [
                { op: 'eq', col: 'anno', val: _periodo.anno },
                { op: 'eq', col: 'mese', val: _periodo.mese }
            ],
            limit: 1
        });
        if (periodoUpd && periodoUpd.length > 0) _periodo = periodoUpd[0];

        var content = document.getElementById('mc-content');
        if (content) _renderContent(content);
    }

    // ============================================================
    // CALCOLI
    // ============================================================

    function _calcolaRigaProdotto(prodotto, litriComm, prezzoComm, litriFisc) {
        var aliquota = _getAliquotaMonofase();
        var accisa = _getAccisa(prodotto);
        var monofase = prezzoComm * aliquota;
        var prezzoCommPagato = prezzoComm + monofase;
        var costoCommerciale = litriComm * prezzoCommPagato;
        var costoFiscale = litriFisc * accisa;
        var costoTotale = costoCommerciale + costoFiscale;

        return {
            monofase: Math.round(monofase * 100000) / 100000,
            prezzoCommPagato: Math.round(prezzoCommPagato * 100000) / 100000,
            costoCommerciale: Math.round(costoCommerciale * 100) / 100,
            costoFiscale: Math.round(costoFiscale * 100) / 100,
            costoTotale: Math.round(costoTotale * 100) / 100
        };
    }

    function _calcolaTotali() {
        var totRimIniziali = _rimanenze
            .filter(function(r) { return r.tipo === 'iniziale'; })
            .reduce(function(s, r) { return s + (parseFloat(r.costo_totale) || 0); }, 0);

        var totRimFinali = _rimanenze
            .filter(function(r) { return r.tipo === 'finale'; })
            .reduce(function(s, r) { return s + (parseFloat(r.costo_totale) || 0); }, 0);

        var totaleCostoCarichi = _carichi
            .reduce(function(s, c) { return s + (parseFloat(c.costo_totale_carico) || 0); }, 0);

        var diffRimanenze = totRimFinali - totRimIniziali;

        var incassato = parseFloat(_periodo.totale_incassato) || 0;
        var rimborsoStato = parseFloat(_periodo.rimborso_stato) || 0;
        var piuServito = parseFloat(_periodo.piu_servito) || 0;
        var rimborsoCali = parseFloat(_periodo.rimborso_cali) || 0;
        var noteCredito = parseFloat(_periodo.note_credito) || 0;
        var noteDebito = parseFloat(_periodo.note_debito) || 0;

        var vociAccessorie = rimborsoStato + piuServito + rimborsoCali + noteCredito + noteDebito;

        var margineBase = incassato - totaleCostoCarichi + diffRimanenze;
        var utile = margineBase + vociAccessorie;

        var litriVenduti = parseFloat(_periodo.litri_venduti) || 0;
        var margineLitro = litriVenduti > 0 ? utile / litriVenduti : null;

        return {
            totRimIniziali: totRimIniziali,
            totRimFinali: totRimFinali,
            totaleCostoCarichi: totaleCostoCarichi,
            diffRimanenze: diffRimanenze,
            vociAccessorie: vociAccessorie,
            utile: Math.round(utile * 100) / 100,
            margineLitro: margineLitro !== null ? Math.round(margineLitro * 10000) / 10000 : null
        };
    }

    // ============================================================
    // UTILITY FORMATTAZIONE
    // ============================================================

    function _formatEuro(n) {
        return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n || 0);
    }

    function _formatEuro4(n) {
        return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(n || 0);
    }

    function _formatNumero(n) {
        return new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
    }

    function _formatPrezzo5(n) {
        return (n || 0).toFixed(5).replace('.', ',');
    }

    function _formatData(d) {
        if (!d) return '';
        var parts = d.split('-');
        return parts[2] + '/' + parts[1] + '/' + parts[0];
    }

    // ============================================================
    // API PUBBLICA
    // ============================================================

    return {
        render: render
    };
})();
