// ============================================================
// GESTIONALE ENI - Modulo Cassa v3
// Chiusura giornaliera con POS tabs, banconote per taglio, storico
// ============================================================

var ENI = ENI || {};
ENI.Modules = ENI.Modules || {};

ENI.Modules.Cassa = (function() {
    'use strict';

    var _cassa = null;
    var _spese = [];
    var _posTotals = null;
    var _dataSelezionata = '';

    // ============================================================
    // RENDER PRINCIPALE
    // ============================================================

    async function render(container) {
        _dataSelezionata = ENI.UI.oggiISO();

        container.innerHTML =
            '<div class="page-header">' +
                '<h1 class="page-title">\u{1F4B0} Cassa</h1>' +
            '</div>' +
            '<div class="cassa-tabs">' +
                '<button class="cassa-tab active" data-tab="chiusura">\u{1F4CB} Chiusura Giornaliera</button>' +
                '<button class="cassa-tab" data-tab="storico">\u{1F4CA} Storico Mensile</button>' +
            '</div>' +
            '<div id="cassa-tab-content">' +
                '<div class="flex justify-center" style="padding:2rem;"><div class="spinner"></div></div>' +
            '</div>';

        // Tab switching
        container.querySelectorAll('.cassa-tab').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var tab = this.dataset.tab;
                container.querySelectorAll('.cassa-tab').forEach(function(b) {
                    b.classList.remove('active');
                });
                this.classList.add('active');
                if (tab === 'chiusura') {
                    _loadAndRenderCassa();
                } else {
                    _renderStorico();
                }
            });
        });

        await _loadAndRenderCassa();
    }

    // ============================================================
    // CARICAMENTO DATI
    // ============================================================

    async function _loadAndRenderCassa() {
        var contentEl = document.getElementById('cassa-tab-content');
        if (contentEl) {
            contentEl.innerHTML = '<div class="flex justify-center" style="padding:2rem;"><div class="spinner"></div></div>';
        }
        try {
            _cassa = await ENI.API.getCassaPerData(_dataSelezionata);
            _spese = await ENI.API.getSpeseCassa(_dataSelezionata);
        } catch(e) {
            _cassa = null;
            _spese = [];
        }

        // Carica totali POS vendita (se cassa non chiusa)
        _posTotals = null;
        if (!_cassa || _cassa.stato !== 'chiusa') {
            try {
                _posTotals = await ENI.API.getVenditeTotaliPerData(_dataSelezionata);
            } catch(e) {
                _posTotals = null;
            }
        }

        _renderForm();
    }

    // ============================================================
    // RENDER FORM CHIUSURA
    // ============================================================

    function _renderForm() {
        var contentEl = document.getElementById('cassa-tab-content');
        if (!contentEl) return;

        var c = _cassa || {};
        var isChiusa = c.stato === 'chiusa';
        var totSpese = _spese.reduce(function(s, sp) {
            return s + Number(sp.importo || 0);
        }, 0);

        contentEl.innerHTML =
            // Header: data selezionata + stato
            '<div class="cassa-section cassa-header-section">' +
                '<div class="cassa-data-row">' +
                    '<div>' +
                        '<label class="form-label">Data conteggio</label>' +
                        '<input type="date" class="form-input" id="cassa-data" ' +
                            'value="' + _dataSelezionata + '" max="' + ENI.UI.oggiISO() + '">' +
                    '</div>' +
                    (isChiusa
                        ? '<div><span class="badge badge-danger">\uD83D\uDD12 Chiusa</span></div>'
                        : '<div><span class="badge badge-success">\u2705 Aperta</span></div>') +
                '</div>' +
            '</div>' +

            (isChiusa
                ? '<div class="stock-alert mb-4" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">' +
                    '<span>\u{1F512} Cassa chiusa per questa data. Dati in sola lettura.</span>' +
                    '<div style="display:flex; gap:8px;">' +
                        '<button type="button" class="btn btn-sm" id="btn-sblocca-cassa" ' +
                            'style="background:none; border:1px solid var(--color-primary); color:var(--color-primary);">' +
                            '\u270F\uFE0F Modifica' +
                        '</button>' +
                        '<button type="button" class="btn btn-sm" id="btn-sposta-data" ' +
                            'style="background:none; border:1px solid #D97706; color:#D97706;">' +
                            '\u{1F4C5} Sposta data' +
                        '</button>' +
                    '</div>' +
                  '</div>'
                : '') +

            '<form id="form-cassa" class="cassa-compact">' +

                // Fondo cassa (solo informativo)
                _section('\u{1F4C5} Informazioni Giornata',
                    '<div class="cassa-grid">' +
                        _cassaInput('Fondo Cassa Fisso', 'fondo_cassa', c.fondo_cassa || 720, 'number') +
                    '</div>' +
                    '<div class="text-sm text-muted mt-2">Importo fondo cassa fisso \u2014 solo informativo, <strong>non incide</strong> sul calcolo incassato</div>'
                ) +

                // ════════ LAYOUT 2 COLONNE (solo chiusa) ════════
                '<div class="' + (isChiusa ? 'cassa-two-col' : '') + '">' +

                    // ──── COLONNA SINISTRA: VENDUTO ────
                    '<div>' +

                        // Venduto Carburante
                        _section('\u26FD Venduto Carburante',
                            _renderCarburanteTable(c) +
                            '<div class="cassa-subtotal text-right mt-3">Totale Carburante: <span id="tot-carburante">\u20AC 0,00</span></div>'
                        ) +

                        // Venduto Altro
                        _section('\u{1F6D2} Venduto Altro' +
                            (_posTotals && _posTotals.numVendite > 0
                                ? ' <span class="badge badge-success" style="font-size:0.75rem; margin-left:8px;">' +
                                    _posTotals.numVendite + ' vendite POS: ' + ENI.UI.formatValuta(_posTotals.totaleVendite) +
                                  '</span>'
                                : ''),
                            '<div class="cassa-grid">' +
                                _cassaInputPOS('Bar', 'venduto_bar', c.venduto_bar, 'Bar') +
                                _cassaInputPOS('Oli e lubrificanti', 'venduto_olio', c.venduto_olio, 'Oli e lubrificanti') +
                                _cassaInputPOS('Accessori', 'venduto_accessori', c.venduto_accessori, 'Accessori') +
                                _cassaInputPOS('AdBlue', 'venduto_adblue', c.venduto_adblue, 'AdBlue') +
                                _cassaInputPOS('Lavaggi', 'venduto_lavaggi', c.venduto_lavaggi, 'Lavaggi') +
                                _cassaInput('Buoni', 'venduto_buoni', c.venduto_buoni, 'number') +
                                _cassaInputPOS('Tergicristalli', 'venduto_tergicristalli', c.venduto_tergicristalli, 'Tergicristalli') +
                                _cassaInputPOS('Catene', 'venduto_catene', c.venduto_catene, 'Catene') +
                                _cassaInputPOS('Profumatori', 'venduto_profumatori', c.venduto_profumatori, 'Profumatori') +
                                _cassaInputPOS('Detailing', 'venduto_detailing', c.venduto_detailing, 'Detailing') +
                                _cassaInputPOS('Uso interno', 'venduto_uso_interno', c.venduto_uso_interno, 'Uso interno') +
                            '</div>' +
                            '<div class="cassa-subtotal text-right mt-2">Totale Altro: <span id="tot-altro">\u20AC 0,00</span></div>'
                        ) +

                        // TOTALE VENDUTO
                        '<div class="cassa-totale">' +
                            '<div class="cassa-totale-label">\u{1F4B0} TOTALE VENDUTO</div>' +
                            '<div class="cassa-totale-value" id="tot-venduto">\u20AC 0,00</div>' +
                        '</div>' +

                    '</div>' +

                    // ──── COLONNA DESTRA: INCASSATO ────
                    '<div>' +

                        // Contanti con banconote per taglio
                        _section('\u{1F4B5} Contanti',
                            '<div class="banconote-grid">' +
                                '<div class="banconote-header">Taglio</div>' +
                                '<div class="banconote-header">Qt\u00E0</div>' +
                                '<div class="banconote-header">Totale</div>' +
                                _banconotaRow('500', c) +
                                _banconotaRow('200', c) +
                                _banconotaRow('100', c) +
                                _banconotaRow('50', c) +
                                _banconotaRow('20', c) +
                                _banconotaRow('10', c) +
                                _banconotaRow('5', c) +
                            '</div>' +
                            '<div class="cassa-subtotal text-right mt-2">Totale Banconote: <span id="tot-banconote">\u20AC 0,00</span></div>' +
                            '<div class="cassa-grid mt-3">' +
                                _cassaInput('Monete', 'contanti_monete', c.contanti_monete, 'number') +
                            '</div>' +
                            '<div class="mt-3" style="display:flex; flex-direction:column; gap:4px; font-size:var(--font-size-sm);">' +
                                '<div class="cassa-subtotal text-right">Contanti lordi: <span id="tot-contanti-lordi">\u20AC 0,00</span></div>' +
                                '<div class="cassa-subtotal text-right" style="color:var(--color-danger);">(+) Spese: <span id="sub-spese">' + ENI.UI.formatValuta(totSpese) + '</span></div>' +
                                '<div class="cassa-subtotal text-right" style="font-weight:700; color:var(--color-secondary);">= Contanti netti: <span id="tot-contanti">\u20AC 0,00</span></div>' +
                                '<div class="cassa-subtotal text-right mt-2" style="color:var(--color-gray-500); font-style:italic;">Verifica fondo: Lordi &minus; Fondo = <span id="verifica-fondo">\u20AC 0,00</span></div>' +
                            '</div>'
                        ) +

                        // POS con tabs
                        _section('\u{1F4B3} POS',
                            _renderPosTabs(c, isChiusa) +
                            '<div class="cassa-subtotal text-right mt-3" style="font-weight:700;">Totale POS complessivo: <span id="tot-pos-all">\u20AC 0,00</span></div>'
                        ) +

                        // Buoni Incassati (nostri cartacei + wallet digitale)
                        _section('\u{1F3AB} Buoni Incassati (nostri)',
                            '<div class="text-sm text-muted mb-2">Buoni emessi da noi utilizzati come pagamento</div>' +
                            '<div class="cassa-grid">' +
                                _cassaInputBuoni('Buoni Cartacei (nostri)', 'incasso_buoni_cartacei', c.incasso_buoni_cartacei, 'buono') +
                                _cassaInputBuoni('Wallet Digitale (nostro)', 'incasso_wallet_digitale', c.incasso_wallet_digitale, 'wallet') +
                            '</div>' +
                            '<div class="cassa-subtotal text-right mt-2">Totale Buoni Incassati: <span id="tot-buoni-incassati">\u20AC 0,00</span></div>'
                        ) +

                        // Altro Incassato
                        _section('\u{1F3E6} Altro Incassato',
                            '<div class="cassa-grid">' +
                                _cassaInput('Assegni', 'assegni', c.assegni, 'number') +
                                _cassaInput('Bonifici', 'bonifici', c.bonifici, 'number') +
                            '</div>'
                        ) +

                        // TOTALE INCASSATO
                        '<div class="cassa-totale">' +
                            '<div class="cassa-totale-label">\u{1F4B5} TOTALE INCASSATO</div>' +
                            '<div class="cassa-totale-value" id="tot-incassato">\u20AC 0,00</div>' +
                        '</div>' +

                    '</div>' +

                '</div>' +
                // ════════ FINE 2 COLONNE ════════

                // Self Notturno — solo tracciamento, NON nel calcolo
                '<div class="cassa-info-box mb-4">' +
                    '<div class="cassa-section-title">\u{1F315} Self Notturno <span class="badge badge-gray" style="margin-left:8px;">Solo tracciamento</span></div>' +
                    '<div class="cassa-grid">' +
                        _cassaInput('Litri', 'self_notturno_litri', c.self_notturno_litri, 'number') +
                        _cassaInput('Euro', 'self_notturno_euro', c.self_notturno_euro, 'number') +
                        _cassaInput('Contanti', 'self_notturno_contanti', c.self_notturno_contanti, 'number') +
                    '</div>' +
                    '<div class="text-sm text-muted mt-2">\u26A0\uFE0F Tracciato per rendiconto mensile, <strong>non incluso</strong> nei totali venduto/incassato</div>' +
                '</div>' +

                // Spese in contanti (caricate da modulo Spese)
                _renderSpeseSection(totSpese) +

                // Crediti Generati
                _section('\u23F3 Crediti Generati Oggi',
                    '<div class="cassa-grid">' +
                        _cassaInput('Pagher\u00F2 Spese Cassa', 'crediti_paghero', c.crediti_paghero, 'number') +
                        _cassaInput('Mobile Payment', 'crediti_mobile_payment', c.crediti_mobile_payment, 'number') +
                        _cassaInput('Buoni ENI Carburante', 'crediti_buoni_eni', c.crediti_buoni_eni, 'number') +
                        '<div class="cassa-row" style="grid-column: 1 / -1;">' +
                            '<span class="cassa-row-label">Desc. Buoni ENI</span>' +
                            '<div class="cassa-row-input" style="max-width:280px;">' +
                                '<input type="text" class="form-input cassa-field" ' +
                                    'data-field="crediti_buoni_eni_desc" value="' + ENI.UI.escapeHtml(c.crediti_buoni_eni_desc || '') + '" ' +
                                    'placeholder="es. Buono carburante cliente X">' +
                            '</div>' +
                        '</div>' +
                        _cassaInput('Voucher', 'crediti_voucher', c.crediti_voucher, 'number') +
                        _cassaInput('Bollette/Green Money', 'crediti_bollette', c.crediti_bollette, 'number') +
                    '</div>' +
                    '<div class="cassa-subtotal text-right mt-2">Totale Crediti (senza 4TSCARD): <span id="tot-crediti-base">\u20AC 0,00</span></div>'
                ) +

                // 4TSCARD — Addebiti Fidelity
                _section('\u{1F4B3} 4TSCARD \u2014 Addebiti Fidelity',
                    '<div class="text-sm text-muted mb-2">Addebiti clienti con tessere fidelity (vanno nei crediti)</div>' +
                    _renderPosDinamico('crediti-4tscard', c.crediti_4tscard, isChiusa) +
                    '<div class="cassa-subtotal text-right mt-2">Totale 4TSCARD: <span id="tot-4tscard">\u20AC 0,00</span></div>'
                ) +

                // Totale crediti complessivo
                '<div class="cassa-subtotal text-right mb-4" style="font-weight:700; color:var(--color-secondary); font-size:var(--font-size-base);">' +
                    'TOTALE CREDITI: <span id="tot-crediti">\u20AC 0,00</span>' +
                '</div>' +

                // DIFFERENZA (sticky)
                '<div class="cassa-differenza ok cassa-totale-sticky" id="cassa-diff-box">' +
                    '<div style="font-size:0.875rem; opacity:0.8;">\u2696\uFE0F DIFFERENZA CASSA</div>' +
                    '<div style="font-size:2rem; font-weight:700;" id="tot-differenza">\u20AC 0,00</div>' +
                    '<div class="text-sm" id="diff-formula">Venduto \u2212 Incassato \u2212 Crediti</div>' +
                '</div>' +

                // Note
                _section('\u{1F4DD} Note Giornata',
                    '<textarea class="form-textarea" id="cassa-note" rows="3">' +
                        ENI.UI.escapeHtml(c.note || '') +
                    '</textarea>'
                ) +

                // Salva
                (!isChiusa
                    ? '<button type="button" class="btn btn-primary btn-block btn-lg mt-4" id="btn-salva-cassa">' +
                        '\u{1F4BE} Salva Chiusura Cassa' +
                      '</button>'
                    : '') +

            '</form>';

        // Listener cambio data
        var dataInput = document.getElementById('cassa-data');
        if (dataInput) {
            dataInput.addEventListener('change', function() {
                _dataSelezionata = this.value;
                _loadAndRenderCassa();
            });
        }

        // Disabilita campi se chiusa (tranne data)
        if (isChiusa) {
            contentEl.querySelectorAll(
                '.cassa-field, .pos-importo, .banconota-qty, #cassa-note'
            ).forEach(function(el) {
                el.setAttribute('disabled', 'disabled');
            });
        }

        // Setup calcoli automatici
        _setupCalcoli(contentEl, totSpese);

        // Setup POS dinamici (solo se aperta)
        if (!isChiusa) {
            _setupPosDinamico(contentEl);
        }

        // Setup POS tabs
        _setupPosTabs(contentEl);

        // Setup salvataggio
        if (!isChiusa) {
            var btnSalva = contentEl.querySelector('#btn-salva-cassa');
            if (btnSalva) btnSalva.addEventListener('click', _salvaCassa);
        }

        // Sblocca cassa chiusa per modifica
        var btnSblocca = contentEl.querySelector('#btn-sblocca-cassa');
        if (btnSblocca) {
            btnSblocca.addEventListener('click', function() {
                // Sblocca tutti i campi
                contentEl.querySelectorAll(
                    '.cassa-field, .pos-importo, .banconota-qty, #cassa-note'
                ).forEach(function(el) {
                    el.removeAttribute('disabled');
                });
                // Attiva POS dinamici
                _setupPosDinamico(contentEl);
                // Mostra pulsante salva
                var formEl = document.getElementById('form-cassa');
                if (formEl && !formEl.querySelector('#btn-salva-cassa')) {
                    formEl.insertAdjacentHTML('beforeend',
                        '<button type="button" class="btn btn-primary btn-block btn-lg mt-4" id="btn-salva-cassa">' +
                            '\u{1F4BE} Salva Modifiche' +
                        '</button>'
                    );
                    formEl.querySelector('#btn-salva-cassa').addEventListener('click', _salvaCassa);
                }
                // Aggiorna messaggio
                btnSblocca.parentNode.parentNode.innerHTML =
                    '<div class="stock-alert mb-4" style="background:#DBEAFE; border-left-color:#3B82F6;">' +
                        '\u270F\uFE0F Modalit\u00E0 modifica attiva. Le modifiche verranno registrate nel log.' +
                    '</div>';
            });
        }

        // Sposta cassa a data diversa
        var btnSposta = contentEl.querySelector('#btn-sposta-data');
        if (btnSposta) {
            btnSposta.addEventListener('click', async function() {
                var nuovaData = prompt('Inserisci la nuova data (formato YYYY-MM-DD):', _dataSelezionata);
                if (!nuovaData || nuovaData === _dataSelezionata) return;

                if (!/^\d{4}-\d{2}-\d{2}$/.test(nuovaData)) {
                    ENI.UI.error('Formato data non valido. Usa YYYY-MM-DD (es. 2026-03-04)');
                    return;
                }

                try {
                    var esistente = await ENI.API.getCassaPerData(nuovaData);
                    if (esistente) {
                        ENI.UI.error('Esiste gi\u00E0 una chiusura cassa per il ' + ENI.UI.formatDataCompleta(nuovaData) + '. Elimina o modifica quella prima.');
                        return;
                    }
                } catch(e) { /* ok, non esiste */ }

                var ok = await ENI.UI.confirm({
                    title: '\u{1F4C5} Sposta Chiusura Cassa',
                    message: 'Vuoi spostare la cassa dal ' + ENI.UI.formatDataCompleta(_dataSelezionata) +
                        ' al ' + ENI.UI.formatDataCompleta(nuovaData) + '?',
                    confirmText: 'Sposta',
                    cancelText: 'Annulla'
                });
                if (!ok) return;

                try {
                    ENI.UI.showLoading();
                    var datiSpostati = Object.assign({}, _cassa);
                    var vecchioId = datiSpostati.id;
                    var vecchiaData = datiSpostati.data;
                    delete datiSpostati.id;
                    delete datiSpostati.created_at;
                    delete datiSpostati.updated_at;
                    datiSpostati.data = nuovaData;

                    await ENI.API.eliminaCassa(vecchioId, vecchiaData);
                    await ENI.API.salvaCassa(datiSpostati);
                    await ENI.API.scriviLog('Spostamento_Cassa', 'Cassa',
                        'Spostata da ' + vecchiaData + ' a ' + nuovaData);

                    ENI.UI.hideLoading();
                    ENI.UI.success('Cassa spostata al ' + ENI.UI.formatDataCompleta(nuovaData));

                    _dataSelezionata = nuovaData;
                    await _loadAndRenderCassa();
                } catch(e) {
                    ENI.UI.hideLoading();
                    ENI.UI.error('Errore spostamento: ' + e.message);
                }
            });
        }
    }

    // ============================================================
    // HTML HELPERS
    // ============================================================

    function _section(title, content) {
        return '<div class="cassa-section">' +
            '<div class="cassa-section-title">' + title + '</div>' +
            content +
        '</div>';
    }

    function _cassaInput(label, name, value, type) {
        type = type || 'number';
        value = (value !== null && value !== undefined && value !== 0) ? value : '';
        return '<div class="cassa-row">' +
            '<span class="cassa-row-label">' + label + '</span>' +
            '<div class="cassa-row-input">' +
                '<input type="' + type + '" step="0.01" min="0" class="form-input cassa-field" ' +
                    'data-field="' + name + '" value="' + value + '">' +
            '</div>' +
        '</div>';
    }

    // Input con auto-populate da totali POS vendita
    function _cassaInputPOS(label, name, value, posCategoria) {
        var posVal = (_posTotals && _posTotals.perCategoria && _posTotals.perCategoria[posCategoria])
            ? _posTotals.perCategoria[posCategoria] : 0;
        var displayVal = (value !== null && value !== undefined && value !== 0) ? value : (posVal > 0 ? posVal : '');
        var hint = posVal > 0 ? '<span class="text-xs" style="color: var(--color-success); margin-left: 4px;">(POS: ' + ENI.UI.formatValuta(posVal) + ')</span>' : '';

        return '<div class="cassa-row">' +
            '<span class="cassa-row-label">' + label + hint + '</span>' +
            '<div class="cassa-row-input">' +
                '<input type="number" step="0.01" min="0" class="form-input cassa-field" ' +
                    'data-field="' + name + '" value="' + displayVal + '">' +
            '</div>' +
        '</div>';
    }

    // Input con auto-populate da totali buoni/wallet vendita
    function _cassaInputBuoni(label, name, value, metodoKey) {
        var posVal = (_posTotals && _posTotals.perMetodo && _posTotals.perMetodo[metodoKey])
            ? _posTotals.perMetodo[metodoKey] : 0;
        var displayVal = (value !== null && value !== undefined && value !== 0) ? value : (posVal > 0 ? posVal : '');
        var hint = posVal > 0 ? '<span class="text-xs" style="color: var(--color-success); margin-left: 4px;">(Vendite: ' + ENI.UI.formatValuta(posVal) + ')</span>' : '';

        return '<div class="cassa-row">' +
            '<span class="cassa-row-label">' + label + hint + '</span>' +
            '<div class="cassa-row-input">' +
                '<input type="number" step="0.01" min="0" class="form-input cassa-field" ' +
                    'data-field="' + name + '" value="' + displayVal + '">' +
            '</div>' +
        '</div>';
    }

    // --- Banconota per taglio ---

    function _banconotaRow(taglio, c) {
        var qty = c['banconote_' + taglio] || 0;
        var displayQty = qty > 0 ? qty : '';
        return '<div class="banconota-taglio">\u20AC ' + taglio + '</div>' +
            '<input type="number" min="0" step="1" class="form-input banconota-qty" ' +
                'data-field="banconote_' + taglio + '" data-taglio="' + taglio + '" value="' + displayQty + '">' +
            '<div class="banconota-totale" id="banconota-tot-' + taglio + '">' +
                (qty > 0 ? ENI.UI.formatValuta(qty * parseInt(taglio)) : '\u20AC 0,00') +
            '</div>';
    }

    // --- Tabella carburante ---

    function _renderCarburanteTable(c) {
        var fuels = [
            { label: 'Super senza Piombo', prefix: 'super_sp' },
            { label: 'Diesel',             prefix: 'diesel' },
            { label: 'Diesel Plus',        prefix: 'diesel_plus' }
        ];

        var html =
            '<div class="fuel-header">' +
                '<span>Tipo Carburante</span>' +
                '<span>Litri</span>' +
                '<span>Euro</span>' +
            '</div>';

        fuels.forEach(function(f) {
            var litri = (c[f.prefix + '_litri'] !== undefined && c[f.prefix + '_litri'] !== null && c[f.prefix + '_litri'] !== 0)
                ? c[f.prefix + '_litri'] : '';
            var euro = (c[f.prefix + '_euro'] !== undefined && c[f.prefix + '_euro'] !== null && c[f.prefix + '_euro'] !== 0)
                ? c[f.prefix + '_euro'] : '';

            html += '<div class="fuel-row">' +
                '<span class="fuel-label">' + f.label + '</span>' +
                '<input type="number" step="0.01" min="0" ' +
                    'class="form-input cassa-field fuel-litri" ' +
                    'data-field="' + f.prefix + '_litri" ' +
                    'value="' + litri + '" placeholder="L">' +
                '<input type="number" step="0.01" min="0" ' +
                    'class="form-input cassa-field fuel-euro" ' +
                    'data-field="' + f.prefix + '_euro" ' +
                    'value="' + euro + '" placeholder="\u20AC">' +
            '</div>';
        });

        return html;
    }

    // --- POS Tabs ---

    function _renderPosTabs(c, isChiusa) {
        var posGroups = [
            { id: 'pos-bsi-carburante', label: 'BSI Carb.',  data: c.pos_bsi_carburante, totId: 'tot-bsi-carburante' },
            { id: 'pos-bsi-lavaggi',    label: 'BSI Lav.',   data: c.pos_bsi_lavaggi,    totId: 'tot-bsi-lavaggi' },
            { id: 'pos-bsi-accessori',  label: 'BSI Acc.',   data: c.pos_bsi_accessori,  totId: 'tot-bsi-accessori' },
            { id: 'pos-carisp',         label: 'Carisp',     data: c.pos_carisp,         totId: 'tot-carisp' },
            { id: 'carta-azzurra',      label: 'C. Azzurra', data: c.carta_azzurra,       totId: 'tot-carta-azzurra' }
        ];

        var tabsHtml = '<div class="pos-tabs-bar">';
        posGroups.forEach(function(g, idx) {
            tabsHtml += '<button type="button" class="pos-tab-btn' + (idx === 0 ? ' active' : '') + '" data-pos-tab="' + g.id + '">' +
                g.label + '</button>';
        });
        tabsHtml += '</div>';

        var contentHtml = '';
        posGroups.forEach(function(g, idx) {
            contentHtml += '<div class="pos-tab-content' + (idx === 0 ? ' active' : '') + '" data-pos-panel="' + g.id + '">' +
                _renderPosDinamico(g.id, g.data, isChiusa) +
                '<div class="cassa-subtotal text-right mt-2">Totale: <span id="' + g.totId + '">\u20AC 0,00</span></div>' +
            '</div>';
        });

        return tabsHtml + contentHtml;
    }

    function _setupPosTabs(container) {
        container.querySelectorAll('.pos-tab-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var tabId = this.dataset.posTab;
                // Toggle active tab button
                container.querySelectorAll('.pos-tab-btn').forEach(function(b) {
                    b.classList.remove('active');
                });
                this.classList.add('active');
                // Toggle active panel
                container.querySelectorAll('.pos-tab-content').forEach(function(p) {
                    p.classList.remove('active');
                });
                var panel = container.querySelector('[data-pos-panel="' + tabId + '"]');
                if (panel) panel.classList.add('active');
            });
        });
    }

    // --- POS dinamico ---

    function _renderPosDinamico(groupId, items, isChiusa) {
        var html = '<div class="pos-group" id="' + groupId + '">';

        if (!items || !Array.isArray(items) || items.length === 0) {
            if (!isChiusa) {
                html += _posRowHtml('', isChiusa);
            }
        } else {
            items.forEach(function(item) {
                html += _posRowHtml(item.importo || '', isChiusa);
            });
        }

        html += '</div>';

        if (!isChiusa) {
            html += '<button type="button" class="pos-add-btn" data-group="' + groupId + '">' +
                '+ Aggiungi righe</button>';
        }

        return html;
    }

    function _posRowHtml(importo, isChiusa) {
        return '<div class="pos-row pos-row-simple">' +
            '<input type="number" step="0.01" min="0" class="form-input pos-importo" ' +
                'placeholder="Importo \u20AC" value="' + (importo || '') + '"' + (isChiusa ? ' disabled' : '') + '>' +
            (!isChiusa
                ? '<button type="button" class="pos-remove-btn" title="Rimuovi">\u00D7</button>'
                : '') +
        '</div>';
    }

    // --- Sezione spese (read-only nel form cassa) ---

    function _renderSpeseSection(totSpese) {
        var liHtml = '';

        if (_spese.length === 0) {
            liHtml = '<div class="text-sm text-muted" style="padding:4px 0;">Nessuna spesa registrata oggi.</div>';
        } else {
            _spese.forEach(function(sp) {
                liHtml += '<div class="spesa-row">' +
                    '<span class="badge badge-gray spesa-cat">' + ENI.UI.escapeHtml(sp.categoria || 'Varie') + '</span>' +
                    '<span class="spesa-desc">' + ENI.UI.escapeHtml(sp.descrizione) + '</span>' +
                    '<span class="spesa-importo">' + ENI.UI.formatValuta(sp.importo) + '</span>' +
                '</div>';
            });
        }

        return '<div class="cassa-spese-section">' +
            '<div class="cassa-section-title">\u{1F4B8} Spese in Contanti (del giorno)</div>' +
            liHtml +
            '<div class="cassa-spese-footer">' +
                '<span>Totale Spese:</span>' +
                '<span class="spesa-tot-value">' + ENI.UI.formatValuta(totSpese) + '</span>' +
            '</div>' +
            '<a href="#/spese" class="btn btn-sm mt-3" ' +
                'style="background:none; border:1px solid var(--color-primary); color:var(--color-primary);">' +
                'Gestisci Spese \u2192</a>' +
        '</div>';
    }

    // ============================================================
    // CALCOLI AUTOMATICI
    // ============================================================

    function _setupCalcoli(container, totSpese) {
        _ricalcola(totSpese);

        container.addEventListener('input', function(e) {
            if (e.target.classList.contains('cassa-field') ||
                e.target.classList.contains('pos-importo') ||
                e.target.classList.contains('banconota-qty')) {
                _ricalcola(totSpese);
            }
        });
    }

    function _ricalcola(totSpese) {
        totSpese = totSpese || 0;
        var val = _getFieldValue;

        // Carburante (senza Self Notturno)
        var totCarburante =
            val('super_sp_euro') + val('diesel_euro') + val('diesel_plus_euro');

        // Altro venduto
        var totAltro =
            val('venduto_bar') + val('venduto_olio') + val('venduto_accessori') +
            val('venduto_adblue') + val('venduto_lavaggi') + val('venduto_buoni') +
            val('venduto_tergicristalli') + val('venduto_catene') + val('venduto_profumatori') +
            val('venduto_detailing') + val('venduto_uso_interno');

        var totVenduto = totCarburante + totAltro;

        // Banconote per taglio
        var tagli = [5, 10, 20, 50, 100, 200, 500];
        var totBanconote = 0;
        tagli.forEach(function(t) {
            var qty = val('banconote_' + t);
            var totTaglio = qty * t;
            totBanconote += totTaglio;
            _setText('banconota-tot-' + t, ENI.UI.formatValuta(totTaglio));
        });

        // Contanti netti = lordi + spese (fondo cassa solo informativo, NON sottratto)
        var fondoCassa = val('fondo_cassa');
        var contantiBruti = totBanconote + val('contanti_monete');
        var contantiNetti = contantiBruti + totSpese;
        var verificaFondo = contantiBruti - fondoCassa;

        // POS tabs
        var totBsiCarb   = _getPosGroupTotal('pos-bsi-carburante');
        var totBsiLav    = _getPosGroupTotal('pos-bsi-lavaggi');
        var totBsiAcc    = _getPosGroupTotal('pos-bsi-accessori');
        var totCarisp    = _getPosGroupTotal('pos-carisp');
        var totCazz      = _getPosGroupTotal('carta-azzurra');

        var totPosAll = totBsiCarb + totBsiLav + totBsiAcc + totCarisp + totCazz;

        // Altro incassato (assegni + bonifici)
        var totAltroInc = val('assegni') + val('bonifici');

        // Buoni incassati (cartacei + wallet)
        var totBuoniInc = val('incasso_buoni_cartacei') + val('incasso_wallet_digitale');

        // Totale incassato
        var totIncassato = contantiNetti + totPosAll + totAltroInc + totBuoniInc;

        // Crediti (base + 4TSCARD)
        var totCreditiBase =
            val('crediti_paghero') + val('crediti_mobile_payment') +
            val('crediti_buoni_eni') + val('crediti_voucher') + val('crediti_bollette');
        var tot4tscard = _getPosGroupTotal('crediti-4tscard');
        var totCrediti = totCreditiBase + tot4tscard;

        var differenza = totVenduto - totIncassato - totCrediti;

        // Aggiorna UI
        _setText('tot-carburante',    ENI.UI.formatValuta(totCarburante));
        _setText('tot-altro',         ENI.UI.formatValuta(totAltro));
        _setText('tot-venduto',       ENI.UI.formatValuta(totVenduto));
        _setText('tot-banconote',     ENI.UI.formatValuta(totBanconote));
        _setText('tot-contanti-lordi',ENI.UI.formatValuta(contantiBruti));
        _setText('sub-spese',         ENI.UI.formatValuta(totSpese));
        _setText('verifica-fondo',    ENI.UI.formatValuta(verificaFondo));
        _setText('tot-contanti',      ENI.UI.formatValuta(contantiNetti));
        _setText('tot-bsi-carburante',ENI.UI.formatValuta(totBsiCarb));
        _setText('tot-bsi-lavaggi',   ENI.UI.formatValuta(totBsiLav));
        _setText('tot-bsi-accessori', ENI.UI.formatValuta(totBsiAcc));
        _setText('tot-carisp',        ENI.UI.formatValuta(totCarisp));
        _setText('tot-carta-azzurra', ENI.UI.formatValuta(totCazz));
        _setText('tot-pos-all',       ENI.UI.formatValuta(totPosAll));
        _setText('tot-buoni-incassati',ENI.UI.formatValuta(totBuoniInc));
        _setText('tot-incassato',     ENI.UI.formatValuta(totIncassato));
        _setText('tot-crediti-base',  ENI.UI.formatValuta(totCreditiBase));
        _setText('tot-4tscard',       ENI.UI.formatValuta(tot4tscard));
        _setText('tot-crediti',       ENI.UI.formatValuta(totCrediti));
        _setText('tot-differenza',    ENI.UI.formatValuta(differenza));

        // Colore differenza
        var diffBox = document.getElementById('cassa-diff-box');
        if (diffBox) {
            diffBox.className = 'cassa-differenza';
            var absDiff = Math.abs(differenza);
            if (absDiff < 0.01)      diffBox.classList.add('ok');
            else if (absDiff <= 50)  diffBox.classList.add('warning');
            else                     diffBox.classList.add('danger');
        }

        var formulaEl = document.getElementById('diff-formula');
        if (formulaEl) {
            formulaEl.textContent =
                ENI.UI.formatValuta(totVenduto) + ' \u2212 ' +
                ENI.UI.formatValuta(totIncassato) + ' \u2212 ' +
                ENI.UI.formatValuta(totCrediti);
        }
    }

    function _getPosGroupTotal(groupId) {
        var group = document.getElementById(groupId);
        if (!group) return 0;
        var total = 0;
        group.querySelectorAll('.pos-importo').forEach(function(input) {
            total += parseFloat(input.value) || 0;
        });
        return total;
    }

    function _getFieldValue(name) {
        var el = document.querySelector('[data-field="' + name + '"]');
        return el ? (parseFloat(el.value) || 0) : 0;
    }

    function _setText(id, text) {
        var el = document.getElementById(id);
        if (el) el.textContent = text;
    }

    // ============================================================
    // POS DINAMICI — Add / Remove
    // ============================================================

    function _setupPosDinamico(container) {
        var _addingRow = false;

        container.addEventListener('click', function(e) {
            // Rimuovi riga
            if (e.target.classList.contains('pos-remove-btn')) {
                e.target.closest('.pos-row').remove();
                _ricalcola(_spese.reduce(function(s, sp) {
                    return s + Number(sp.importo || 0);
                }, 0));
                return;
            }
            // Aggiungi 3 righe (con debounce)
            if (e.target.classList.contains('pos-add-btn')) {
                e.preventDefault();
                if (_addingRow) return;
                _addingRow = true;
                var groupId = e.target.dataset.group;
                var group = document.getElementById(groupId);
                if (group) {
                    for (var i = 0; i < 3; i++) {
                        group.insertAdjacentHTML('beforeend', _posRowHtml('', false));
                    }
                    var newRows = group.querySelectorAll('.pos-row');
                    var firstNew = newRows[newRows.length - 3];
                    if (firstNew) {
                        var importoInput = firstNew.querySelector('.pos-importo');
                        if (importoInput) importoInput.focus();
                    }
                }
                _ricalcola(_spese.reduce(function(s, sp) {
                    return s + Number(sp.importo || 0);
                }, 0));
                setTimeout(function() { _addingRow = false; }, 200);
            }
        });

        // Enter su pos-importo aggiunge nuove righe nello stesso gruppo
        container.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && e.target.classList.contains('pos-importo')) {
                e.preventDefault();
                var posRow = e.target.closest('.pos-row');
                var group = posRow ? posRow.closest('.pos-group') : null;
                if (group) {
                    for (var i = 0; i < 3; i++) {
                        group.insertAdjacentHTML('beforeend', _posRowHtml('', false));
                    }
                    var newRows = group.querySelectorAll('.pos-row');
                    var firstNew = newRows[newRows.length - 3];
                    if (firstNew) {
                        var importoInput = firstNew.querySelector('.pos-importo');
                        if (importoInput) importoInput.focus();
                    }
                }
            }
        });
    }

    // ============================================================
    // SALVATAGGIO
    // ============================================================

    async function _salvaCassa() {
        var ok = await ENI.UI.confirm({
            title: '\u{1F4BE} Conferma Chiusura Cassa',
            message: 'Vuoi salvare la chiusura cassa del ' + ENI.UI.formatDataCompleta(_dataSelezionata) + '?',
            confirmText: 'Salva',
            cancelText: 'Annulla'
        });

        if (!ok) return;

        var val = _getFieldValue;
        var totSpese = _spese.reduce(function(s, sp) {
            return s + Number(sp.importo || 0);
        }, 0);

        var totCarburante =
            val('super_sp_euro') + val('diesel_euro') + val('diesel_plus_euro');
        var totAltro =
            val('venduto_bar') + val('venduto_olio') + val('venduto_accessori') +
            val('venduto_adblue') + val('venduto_lavaggi') + val('venduto_buoni') +
            val('venduto_tergicristalli') + val('venduto_catene') + val('venduto_profumatori') +
            val('venduto_detailing') + val('venduto_uso_interno');
        var totVenduto = totCarburante + totAltro;

        // Banconote per taglio
        var tagli = [5, 10, 20, 50, 100, 200, 500];
        var totBanconote = 0;
        tagli.forEach(function(t) {
            totBanconote += val('banconote_' + t) * t;
        });

        var contantiBruti = totBanconote + val('contanti_monete');
        var contantiNetti = contantiBruti + totSpese;

        var totBsiCarb   = _getPosGroupTotal('pos-bsi-carburante');
        var totBsiLav    = _getPosGroupTotal('pos-bsi-lavaggi');
        var totBsiAcc    = _getPosGroupTotal('pos-bsi-accessori');
        var totCarisp    = _getPosGroupTotal('pos-carisp');
        var totCazz      = _getPosGroupTotal('carta-azzurra');
        var totAltroInc  = val('assegni') + val('bonifici');
        var totBuoniInc  = val('incasso_buoni_cartacei') + val('incasso_wallet_digitale');
        var totIncassato = contantiNetti + totBsiCarb + totBsiLav + totBsiAcc +
            totCarisp + totCazz + totAltroInc + totBuoniInc;

        var tot4tscard = _getPosGroupTotal('crediti-4tscard');
        var totCrediti =
            val('crediti_paghero') + val('crediti_mobile_payment') +
            val('crediti_buoni_eni') + val('crediti_voucher') + val('crediti_bollette') +
            tot4tscard;

        // Raccogli righe POS (solo importo, senza nome)
        function collectPosGroup(groupId) {
            var group = document.getElementById(groupId);
            if (!group) return [];
            var rows = [];
            group.querySelectorAll('.pos-row').forEach(function(row) {
                var importo = parseFloat((row.querySelector('.pos-importo') || {}).value) || 0;
                if (importo > 0) {
                    rows.push({ importo: importo });
                }
            });
            return rows;
        }

        var dati = {
            data: _dataSelezionata,
            fondo_cassa: val('fondo_cassa'),
            // Carburante
            super_sp_litri:    val('super_sp_litri'),    super_sp_euro:    val('super_sp_euro'),
            diesel_litri:      val('diesel_litri'),      diesel_euro:      val('diesel_euro'),
            diesel_plus_litri: val('diesel_plus_litri'), diesel_plus_euro: val('diesel_plus_euro'),
            // Self Notturno (tracciamento separato)
            self_notturno_litri: val('self_notturno_litri'),
            self_notturno_euro: val('self_notturno_euro'),
            self_notturno_contanti: val('self_notturno_contanti'),
            // Venduto altro
            venduto_bar:            val('venduto_bar'),
            venduto_olio:           val('venduto_olio'),
            venduto_accessori:      val('venduto_accessori'),
            venduto_adblue:         val('venduto_adblue'),
            venduto_lavaggi:        val('venduto_lavaggi'),
            venduto_buoni:          val('venduto_buoni'),
            venduto_tergicristalli: val('venduto_tergicristalli'),
            venduto_catene:         val('venduto_catene'),
            venduto_profumatori:    val('venduto_profumatori'),
            venduto_detailing:      val('venduto_detailing'),
            venduto_uso_interno:    val('venduto_uso_interno'),
            // Contanti - banconote per taglio
            banconote_5:   val('banconote_5'),
            banconote_10:  val('banconote_10'),
            banconote_20:  val('banconote_20'),
            banconote_50:  val('banconote_50'),
            banconote_100: val('banconote_100'),
            banconote_200: val('banconote_200'),
            banconote_500: val('banconote_500'),
            contanti_banconote: totBanconote, // backward compat
            contanti_monete:    val('contanti_monete'),
            // POS
            pos_bsi_carburante:    collectPosGroup('pos-bsi-carburante'),
            pos_bsi_lavaggi:       collectPosGroup('pos-bsi-lavaggi'),
            pos_bsi_accessori:     collectPosGroup('pos-bsi-accessori'),
            pos_carisp:            collectPosGroup('pos-carisp'),
            carta_azzurra:         collectPosGroup('carta-azzurra'),
            // Altro incassato
            assegni:  val('assegni'),
            bonifici: val('bonifici'),
            incasso_buoni_cartacei:  val('incasso_buoni_cartacei'),
            incasso_wallet_digitale: val('incasso_wallet_digitale'),
            // Crediti
            crediti_paghero:         val('crediti_paghero'),
            crediti_mobile_payment:  val('crediti_mobile_payment'),
            crediti_buoni_eni:       val('crediti_buoni_eni'),
            crediti_buoni_eni_desc:  (document.querySelector('[data-field="crediti_buoni_eni_desc"]') || {}).value || null,
            crediti_voucher:         val('crediti_voucher'),
            crediti_bollette:        val('crediti_bollette'),
            crediti_4tscard:         collectPosGroup('crediti-4tscard'),
            // Totali
            totale_venduto:   totVenduto,
            totale_incassato: totIncassato,
            totale_crediti:   totCrediti,
            totale_spese:     totSpese,
            differenza:       totVenduto - totIncassato - totCrediti,
            note:             (document.getElementById('cassa-note') || {}).value || null,
            stato:            'chiusa',
            utente_chiusura:  ENI.State.getUserId(),
            formula_versione: 2
        };

        try {
            ENI.UI.showLoading();

            // Audit trail: se stiamo modificando un record gia chiuso, logga le differenze
            if (_cassa && _cassa.stato === 'chiusa') {
                var cambiamenti = [];
                var campiTracciati = ['totale_venduto', 'totale_incassato', 'totale_crediti', 'differenza'];
                campiTracciati.forEach(function(campo) {
                    var vecchio = Number(_cassa[campo] || 0);
                    var nuovo = Number(dati[campo] || 0);
                    if (Math.abs(vecchio - nuovo) > 0.01) {
                        cambiamenti.push(campo + ': ' + ENI.UI.formatValuta(vecchio) + ' \u2192 ' + ENI.UI.formatValuta(nuovo));
                    }
                });
                if (cambiamenti.length > 0) {
                    try {
                        await ENI.API.scriviLog('Modifica Cassa', 'Cassa',
                            'Data: ' + dati.data + ' | ' + cambiamenti.join(', '));
                    } catch(logErr) { /* non bloccare il salvataggio */ }
                }
            }

            await ENI.API.salvaCassa(dati);
            ENI.UI.hideLoading();
            ENI.UI.success('Chiusura cassa salvata con successo');
            await _loadAndRenderCassa();
        } catch(e) {
            ENI.UI.hideLoading();
            ENI.UI.error('Errore salvataggio: ' + e.message);
        }
    }

    // ============================================================
    // STORICO MENSILE
    // ============================================================

    async function _renderStorico() {
        var contentEl = document.getElementById('cassa-tab-content');
        if (!contentEl) return;

        var oggi = new Date(_dataSelezionata || ENI.UI.oggiISO());
        var annoSel = oggi.getFullYear();
        var meseSel = oggi.getMonth() + 1;

        contentEl.innerHTML =
            '<div class="cassa-storico-filters">' +
                '<div class="flex gap-3 items-center" style="flex-wrap:wrap;">' +
                    '<div>' +
                        '<label class="form-label">Mese</label>' +
                        '<select class="form-select" id="storico-mese">' + _mesiOptions(meseSel) + '</select>' +
                    '</div>' +
                    '<div>' +
                        '<label class="form-label">Anno</label>' +
                        '<select class="form-select" id="storico-anno">' + _anniOptions(annoSel) + '</select>' +
                    '</div>' +
                    '<div style="padding-top:1.5rem;">' +
                        '<button class="btn btn-primary btn-sm" id="btn-carica-storico">\u{1F50D} Carica</button>' +
                    '</div>' +
                '</div>' +
            '</div>' +
            '<div id="storico-lista"><div class="flex justify-center" style="padding:2rem;"><div class="spinner"></div></div></div>';

        var btnCarica = document.getElementById('btn-carica-storico');
        if (btnCarica) {
            btnCarica.addEventListener('click', function() {
                var m = parseInt(document.getElementById('storico-mese').value);
                var a = parseInt(document.getElementById('storico-anno').value);
                _caricaStorico(a, m);
            });
        }

        await _caricaStorico(annoSel, meseSel);
    }

    async function _caricaStorico(anno, mese) {
        var listaEl = document.getElementById('storico-lista');
        if (!listaEl) return;

        listaEl.innerHTML = '<div class="flex justify-center" style="padding:2rem;"><div class="spinner"></div></div>';

        try {
            var records = await ENI.API.getCassaMese(anno, mese);

            if (!records || records.length === 0) {
                listaEl.innerHTML =
                    '<div class="empty-state">' +
                        '<div class="empty-state-icon">\u{1F4CB}</div>' +
                        '<p class="empty-state-text">Nessuna chiusura per questo mese</p>' +
                    '</div>';
                return;
            }

            var totVendutoMese = 0, totIncassatoMese = 0, totDiffMese = 0, totSpeseMese = 0;
            records.forEach(function(r) {
                totVendutoMese   += Number(r.totale_venduto || 0);
                totIncassatoMese += Number(r.totale_incassato || 0);
                totDiffMese      += Number(r.differenza || 0);
                totSpeseMese     += Number(r.totale_spese || 0);
            });

            var html =
                '<div class="table-wrapper"><table class="table">' +
                '<thead><tr>' +
                    '<th>Data</th>' +
                    '<th>Venduto</th>' +
                    '<th>Incassato</th>' +
                    '<th>Spese</th>' +
                    '<th>Differenza</th>' +
                    '<th>Stato</th>' +
                '</tr></thead><tbody>';

            records.forEach(function(r) {
                var diff = Number(r.differenza || 0);
                var diffStyle = Math.abs(diff) < 0.01
                    ? 'color:#166534;'
                    : Math.abs(diff) <= 50
                        ? 'color:#92400E;'
                        : 'color:#991B1B;';

                html += '<tr class="storico-row" data-data="' + r.data + '" style="cursor:pointer;" title="Clicca per aprire">' +
                    '<td>' + ENI.UI.formatDataCompleta(r.data) + '</td>' +
                    '<td>' + ENI.UI.formatValuta(r.totale_venduto) + '</td>' +
                    '<td>' + ENI.UI.formatValuta(r.totale_incassato) + '</td>' +
                    '<td style="color:var(--color-danger);">' + ENI.UI.formatValuta(r.totale_spese) + '</td>' +
                    '<td style="' + diffStyle + ' font-weight:600;">' + ENI.UI.formatValuta(r.differenza) + '</td>' +
                    '<td>' +
                        '<span class="badge ' + (r.stato === 'chiusa' ? 'badge-scaduto' : 'badge-incassato') + '">' +
                            r.stato +
                        '</span>' +
                    '</td>' +
                '</tr>';
            });

            html +=
                '</tbody><tfoot><tr>' +
                    '<td><strong>TOTALE MESE (' + records.length + ' giorni)</strong></td>' +
                    '<td><strong>' + ENI.UI.formatValuta(totVendutoMese) + '</strong></td>' +
                    '<td><strong>' + ENI.UI.formatValuta(totIncassatoMese) + '</strong></td>' +
                    '<td style="color:var(--color-danger);"><strong>' + ENI.UI.formatValuta(totSpeseMese) + '</strong></td>' +
                    '<td><strong>' + ENI.UI.formatValuta(totDiffMese) + '</strong></td>' +
                    '<td></td>' +
                '</tr></tfoot>' +
                '</table></div>';

            listaEl.innerHTML = html;

            // Click su riga storico -> apri nel form chiusura
            listaEl.querySelectorAll('.storico-row').forEach(function(row) {
                row.addEventListener('click', function() {
                    var data = this.dataset.data;
                    _dataSelezionata = data;
                    // Switcha al tab chiusura
                    var tabs = document.querySelectorAll('.cassa-tab');
                    tabs.forEach(function(t) { t.classList.remove('active'); });
                    if (tabs[0]) tabs[0].classList.add('active');
                    _loadAndRenderCassa();
                });
            });

        } catch(e) {
            listaEl.innerHTML =
                '<div class="stock-alert">Errore caricamento storico: ' +
                ENI.UI.escapeHtml(e.message) + '</div>';
        }
    }

    // --- Helper opzioni mese/anno ---

    function _mesiOptions(sel) {
        var nomi = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
                     'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
        var html = '';
        for (var i = 1; i <= 12; i++) {
            html += '<option value="' + i + '"' + (i === sel ? ' selected' : '') + '>' + nomi[i - 1] + '</option>';
        }
        return html;
    }

    function _anniOptions(sel) {
        var html = '';
        for (var a = 2024; a <= 2030; a++) {
            html += '<option value="' + a + '"' + (a === sel ? ' selected' : '') + '>' + a + '</option>';
        }
        return html;
    }

    return { render: render };
})();
