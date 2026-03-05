// ============================================================
// GESTIONALE ENI - Modulo Cassa
// Chiusura giornaliera con POS dinamici, spese e storico
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

                // Fondo cassa (solo informativo) — fullwidth
                _section('\u{1F4C5} Informazioni Giornata',
                    '<div class="cassa-grid">' +
                        _cassaInput('Fondo Cassa Fisso', 'fondo_cassa', c.fondo_cassa || 720, 'number') +
                    '</div>' +
                    '<div class="text-sm text-muted mt-2">Importo fondo cassa fisso \u2014 solo informativo, <strong>non incide</strong> sul calcolo incassato</div>'
                ) +

                // ═══════════ LAYOUT 2 COLONNE ═══════════
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

                        // Contanti
                        _section('\u{1F4B5} Contanti',
                            '<div class="cassa-grid">' +
                                _cassaInput('Banconote', 'contanti_banconote', c.contanti_banconote, 'number') +
                                _cassaInput('Monete', 'contanti_monete', c.contanti_monete, 'number') +
                            '</div>' +
                            '<div class="mt-3" style="display:flex; flex-direction:column; gap:4px; font-size:var(--font-size-sm);">' +
                                '<div class="cassa-subtotal text-right">Contanti lordi: <span id="tot-contanti-lordi">\u20AC 0,00</span></div>' +
                                '<div class="cassa-subtotal text-right" style="color:var(--color-danger);">(+) Spese: <span id="sub-spese">' + ENI.UI.formatValuta(totSpese) + '</span></div>' +
                                '<div class="cassa-subtotal text-right" style="font-weight:700; color:var(--color-secondary);">= Contanti netti: <span id="tot-contanti">\u20AC 0,00</span></div>' +
                                '<div class="cassa-subtotal text-right mt-2" style="color:var(--color-gray-500); font-style:italic;">Verifica fondo: Lordi &minus; Fondo = <span id="verifica-fondo">\u20AC 0,00</span></div>' +
                            '</div>'
                        ) +

                        // POS BSI — Carburante (collassabile)
                        _sectionCollapsible('\u{1F4B3} POS BSI \u2014 Carburante',
                            _renderPosDinamico('pos-bsi-carburante', c.pos_bsi_carburante, isChiusa) +
                            '<div class="cassa-subtotal text-right mt-2">Totale BSI Carburante: <span id="tot-bsi-carburante">\u20AC 0,00</span></div>',
                            'bsi-carb'
                        ) +

                        // POS BSI — Lavaggi (collassabile)
                        _sectionCollapsible('\u{1F4B3} POS BSI \u2014 Lavaggi',
                            _renderPosDinamico('pos-bsi-lavaggi', c.pos_bsi_lavaggi, isChiusa) +
                            '<div class="cassa-subtotal text-right mt-2">Totale BSI Lavaggi: <span id="tot-bsi-lavaggi">\u20AC 0,00</span></div>',
                            'bsi-lav'
                        ) +

                        // POS BSI — Accessori (collassabile)
                        _sectionCollapsible('\u{1F4B3} POS BSI \u2014 Accessori',
                            _renderPosDinamico('pos-bsi-accessori', c.pos_bsi_accessori, isChiusa) +
                            '<div class="cassa-subtotal text-right mt-2">Totale BSI Accessori: <span id="tot-bsi-accessori">\u20AC 0,00</span></div>',
                            'bsi-acc'
                        ) +

                        // POS Carisp (collassabile)
                        _sectionCollapsible('\u{1F4B3} POS Carisp \u2014 Carburante',
                            _renderPosDinamico('pos-carisp', c.pos_carisp, isChiusa) +
                            '<div class="cassa-subtotal text-right mt-2">Totale Carisp: <span id="tot-carisp">\u20AC 0,00</span></div>',
                            'carisp'
                        ) +

                        // Carta Azzurra (collassabile)
                        _sectionCollapsible('\u{1F4B3} Carta Azzurra',
                            _renderPosDinamico('carta-azzurra', c.carta_azzurra, isChiusa) +
                            '<div class="cassa-subtotal text-right mt-2">Totale Carta Azzurra: <span id="tot-carta-azzurra">\u20AC 0,00</span></div>',
                            'carta-azz'
                        ) +

                        // Altri Pagamenti (collassabile)
                        _sectionCollapsible('\u{1F4B3} Altri Pagamenti con Carta',
                            _renderPosDinamico('altri-pagamenti-carta', c.altri_pagamenti_carta, isChiusa) +
                            '<div class="cassa-subtotal text-right mt-2">Totale Altri Pagamenti: <span id="tot-altri-pagamenti">\u20AC 0,00</span></div>',
                            'altri-pag'
                        ) +

                        // Altro Incassato
                        _section('\u{1F3E6} Altro Incassato',
                            '<div class="cassa-grid">' +
                                _cassaInput('Assegni', 'assegni', c.assegni, 'number') +
                                _cassaInput('Bonifici', 'bonifici', c.bonifici, 'number') +
                            '</div>'
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

                        // TOTALE INCASSATO
                        '<div class="cassa-totale">' +
                            '<div class="cassa-totale-label">\u{1F4B5} TOTALE INCASSATO</div>' +
                            '<div class="cassa-totale-value" id="tot-incassato">\u20AC 0,00</div>' +
                        '</div>' +

                    '</div>' +

                '</div>' +
                // ═══════════ FINE 2 COLONNE ═══════════

                // Self Notturno — solo tracciamento, NON nel calcolo
                '<div class="cassa-info-box mb-4">' +
                    '<div class="cassa-section-title">\u{1F315} Self Notturno Contanti <span class="badge badge-gray" style="margin-left:8px;">Solo tracciamento</span></div>' +
                    '<div class="cassa-grid">' +
                        _cassaInput('Self Nott. Contanti', 'self_notturno_contanti', c.self_notturno_contanti, 'number') +
                    '</div>' +
                    '<div class="text-sm text-muted mt-2">\u26A0\uFE0F Tracciato per rendiconto mensile, <strong>non incluso</strong> nel totale incassato</div>' +
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
                '.cassa-field, .pos-nome, .pos-importo, #cassa-note'
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

        // Setup sezioni collassabili
        contentEl.querySelectorAll('.cassa-collapsible-header').forEach(function(header) {
            header.addEventListener('click', function() {
                var targetId = this.dataset.toggle;
                var body = document.getElementById('collapse-' + targetId);
                if (body) {
                    this.classList.toggle('collapsed');
                    body.classList.toggle('collapsed');
                }
            });
        });

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
                    '.cassa-field, .pos-nome, .pos-importo, #cassa-note'
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
                // Mostra dialog con date picker
                var nuovaData = prompt('Inserisci la nuova data (formato YYYY-MM-DD):', _dataSelezionata);
                if (!nuovaData || nuovaData === _dataSelezionata) return;

                // Valida formato data
                if (!/^\d{4}-\d{2}-\d{2}$/.test(nuovaData)) {
                    ENI.UI.error('Formato data non valido. Usa YYYY-MM-DD (es. 2026-03-04)');
                    return;
                }

                // Verifica che la nuova data non abbia gia una cassa
                try {
                    var esistente = await ENI.API.getCassaPerData(nuovaData);
                    if (esistente) {
                        ENI.UI.error('Esiste gi\u00E0 una chiusura cassa per il ' + ENI.UI.formatDataCompleta(nuovaData) + '. Elimina o modifica quella prima.');
                        return;
                    }
                } catch(e) { /* ok, non esiste */ }

                // Conferma
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
                    // Copia tutti i dati della cassa corrente
                    var datiSpostati = Object.assign({}, _cassa);
                    var vecchioId = datiSpostati.id;
                    var vecchiaData = datiSpostati.data;
                    // Rimuovi id e aggiorna data
                    delete datiSpostati.id;
                    delete datiSpostati.created_at;
                    delete datiSpostati.updated_at;
                    datiSpostati.data = nuovaData;

                    // Elimina il vecchio record
                    await ENI.API.eliminaCassa(vecchioId, vecchiaData);
                    // Salva sulla nuova data
                    await ENI.API.salvaCassa(datiSpostati);
                    // Log spostamento
                    await ENI.API.scriviLog('Spostamento_Cassa', 'Cassa',
                        'Spostata da ' + vecchiaData + ' a ' + nuovaData);

                    ENI.UI.hideLoading();
                    ENI.UI.success('Cassa spostata al ' + ENI.UI.formatDataCompleta(nuovaData));

                    // Ricarica sulla nuova data
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

    function _sectionCollapsible(title, content, groupId) {
        return '<div class="cassa-section">' +
            '<div class="cassa-collapsible-header" data-toggle="' + groupId + '">' +
                '<div class="cassa-section-title" style="margin-bottom:0;">' + title + '</div>' +
                '<span class="cassa-chevron">\u25BC</span>' +
            '</div>' +
            '<div class="cassa-collapsible-body" id="collapse-' + groupId + '">' +
                content +
            '</div>' +
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
        // Se il campo cassa non ha valore ma il POS si, usa il valore POS
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

    // --- Tabella carburante ottimizzata ---

    function _renderCarburanteTable(c) {
        var fuels = [
            { label: 'Benzina 95',    prefix: 'benzina95' },
            { label: 'Benzina 98',    prefix: 'benzina98' },
            { label: 'Diesel',        prefix: 'diesel' },
            { label: 'Diesel Plus',   prefix: 'diesel_plus' },
            { label: 'GPL',           prefix: 'gpl' },
            { label: 'Self Notturno', prefix: 'self_notturno' }
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

    // --- POS dinamici ---

    function _renderPosDinamico(groupId, items, isChiusa) {
        items = (Array.isArray(items) ? items : []);

        var html = '<div class="pos-group" id="' + groupId + '">';

        if (items.length === 0 && !isChiusa) {
            // Una riga vuota di partenza
            html += _posRowHtml('', '', false);
        } else if (items.length === 0 && isChiusa) {
            html += '<div class="text-sm text-muted" style="padding:4px 0;">Nessun dato inserito</div>';
        } else {
            items.forEach(function(item) {
                html += _posRowHtml(item.nome || '', item.importo || '', isChiusa);
            });
        }

        html += '</div>';

        if (!isChiusa) {
            html += '<button type="button" class="pos-add-btn" data-group="' + groupId + '">' +
                '+ Aggiungi terminale</button>';
        }

        return html;
    }

    function _posRowHtml(nome, importo, isChiusa) {
        return '<div class="pos-row">' +
            '<input type="text" class="form-input pos-nome" placeholder="Nome terminale" ' +
                'value="' + ENI.UI.escapeHtml(String(nome)) + '"' + (isChiusa ? ' disabled' : '') + '>' +
            '<input type="number" step="0.01" min="0" class="form-input pos-importo" ' +
                'placeholder="\u20AC" value="' + (importo || '') + '"' + (isChiusa ? ' disabled' : '') + '>' +
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
                e.target.classList.contains('pos-importo')) {
                _ricalcola(totSpese);
            }
        });
    }

    function _ricalcola(totSpese) {
        totSpese = totSpese || 0;
        var val = _getFieldValue;

        // Carburante
        var totCarburante =
            val('benzina95_euro') + val('benzina98_euro') +
            val('diesel_euro') + val('diesel_plus_euro') +
            val('gpl_euro') + val('self_notturno_euro');

        // Altro venduto
        var totAltro =
            val('venduto_bar') + val('venduto_olio') + val('venduto_accessori') +
            val('venduto_adblue') + val('venduto_lavaggi') + val('venduto_buoni') +
            val('venduto_tergicristalli') + val('venduto_catene') + val('venduto_profumatori') +
            val('venduto_detailing') + val('venduto_uso_interno');

        var totVenduto = totCarburante + totAltro;

        // Contanti netti = lordi + spese (fondo cassa solo informativo, NON sottratto)
        var fondoCassa = val('fondo_cassa');
        var contantiBruti = val('contanti_banconote') + val('contanti_monete');
        var contantiNetti = contantiBruti + totSpese;
        var verificaFondo = contantiBruti - fondoCassa;

        // POS dinamici
        var totBsiCarb   = _getPosGroupTotal('pos-bsi-carburante');
        var totBsiLav    = _getPosGroupTotal('pos-bsi-lavaggi');
        var totBsiAcc    = _getPosGroupTotal('pos-bsi-accessori');
        var totCarisp    = _getPosGroupTotal('pos-carisp');
        var totCazz      = _getPosGroupTotal('carta-azzurra');
        var totAltriPag  = _getPosGroupTotal('altri-pagamenti-carta');

        // Altro incassato (assegni + bonifici)
        var totAltroInc = val('assegni') + val('bonifici');

        // Buoni incassati (cartacei + wallet)
        var totBuoniInc = val('incasso_buoni_cartacei') + val('incasso_wallet_digitale');

        // Totale incassato
        var totIncassato = contantiNetti + totBsiCarb + totBsiLav + totBsiAcc +
            totCarisp + totCazz + totAltriPag + totAltroInc + totBuoniInc;

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
        _setText('tot-contanti-lordi',ENI.UI.formatValuta(contantiBruti));
        _setText('sub-spese',         ENI.UI.formatValuta(totSpese));
        _setText('verifica-fondo',    ENI.UI.formatValuta(verificaFondo));
        _setText('tot-contanti',      ENI.UI.formatValuta(contantiNetti));
        _setText('tot-bsi-carburante',ENI.UI.formatValuta(totBsiCarb));
        _setText('tot-bsi-lavaggi',   ENI.UI.formatValuta(totBsiLav));
        _setText('tot-bsi-accessori', ENI.UI.formatValuta(totBsiAcc));
        _setText('tot-carisp',        ENI.UI.formatValuta(totCarisp));
        _setText('tot-carta-azzurra', ENI.UI.formatValuta(totCazz));
        _setText('tot-altri-pagamenti',ENI.UI.formatValuta(totAltriPag));
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
            // Aggiungi riga (con debounce)
            if (e.target.classList.contains('pos-add-btn')) {
                e.preventDefault();
                if (_addingRow) return;
                _addingRow = true;
                var groupId = e.target.dataset.group;
                var group = document.getElementById(groupId);
                if (group) {
                    group.insertAdjacentHTML('beforeend', _posRowHtml('', '', false));
                    var newRows = group.querySelectorAll('.pos-row');
                    var lastRow = newRows[newRows.length - 1];
                    if (lastRow) {
                        var importoInput = lastRow.querySelector('.pos-importo');
                        if (importoInput) importoInput.focus();
                    }
                }
                setTimeout(function() { _addingRow = false; }, 200);
            }
        });

        // Enter su pos-importo aggiunge nuova riga nello stesso gruppo
        container.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && e.target.classList.contains('pos-importo')) {
                e.preventDefault();
                var posRow = e.target.closest('.pos-row');
                var group = posRow ? posRow.closest('.pos-group') : null;
                if (group) {
                    group.insertAdjacentHTML('beforeend', _posRowHtml('', '', false));
                    var newRows = group.querySelectorAll('.pos-row');
                    var lastRow = newRows[newRows.length - 1];
                    if (lastRow) {
                        var nomeInput = lastRow.querySelector('.pos-nome');
                        if (nomeInput) nomeInput.focus();
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
            val('benzina95_euro') + val('benzina98_euro') +
            val('diesel_euro') + val('diesel_plus_euro') +
            val('gpl_euro') + val('self_notturno_euro');
        var totAltro =
            val('venduto_bar') + val('venduto_olio') + val('venduto_accessori') +
            val('venduto_adblue') + val('venduto_lavaggi') + val('venduto_buoni') +
            val('venduto_tergicristalli') + val('venduto_catene') + val('venduto_profumatori') +
            val('venduto_detailing') + val('venduto_uso_interno');
        var totVenduto = totCarburante + totAltro;

        var fondoCassa = val('fondo_cassa');
        var contantiBruti = val('contanti_banconote') + val('contanti_monete');
        var contantiNetti = contantiBruti + totSpese; // Fondo NON sottratto (v2)

        var totBsiCarb   = _getPosGroupTotal('pos-bsi-carburante');
        var totBsiLav    = _getPosGroupTotal('pos-bsi-lavaggi');
        var totBsiAcc    = _getPosGroupTotal('pos-bsi-accessori');
        var totCarisp    = _getPosGroupTotal('pos-carisp');
        var totCazz      = _getPosGroupTotal('carta-azzurra');
        var totAltriPag  = _getPosGroupTotal('altri-pagamenti-carta');
        var totAltroInc  = val('assegni') + val('bonifici');
        var totBuoniInc  = val('incasso_buoni_cartacei') + val('incasso_wallet_digitale');
        var totIncassato = contantiNetti + totBsiCarb + totBsiLav + totBsiAcc +
            totCarisp + totCazz + totAltriPag + totAltroInc + totBuoniInc;

        var tot4tscard = _getPosGroupTotal('crediti-4tscard');
        var totCrediti =
            val('crediti_paghero') + val('crediti_mobile_payment') +
            val('crediti_buoni_eni') + val('crediti_voucher') + val('crediti_bollette') +
            tot4tscard;

        // Raccogli righe POS
        function collectPosGroup(groupId) {
            var group = document.getElementById(groupId);
            if (!group) return [];
            var rows = [];
            group.querySelectorAll('.pos-row').forEach(function(row) {
                var nome = (row.querySelector('.pos-nome') || {}).value || '';
                var importo = parseFloat((row.querySelector('.pos-importo') || {}).value) || 0;
                if (nome || importo > 0) {
                    rows.push({ nome: nome.trim(), importo: importo });
                }
            });
            return rows;
        }

        var dati = {
            data: _dataSelezionata,
            fondo_cassa: fondoCassa,
            benzina95_litri:   val('benzina95_litri'),   benzina95_euro:   val('benzina95_euro'),
            benzina98_litri:   val('benzina98_litri'),   benzina98_euro:   val('benzina98_euro'),
            diesel_litri:      val('diesel_litri'),      diesel_euro:      val('diesel_euro'),
            diesel_plus_litri: val('diesel_plus_litri'), diesel_plus_euro: val('diesel_plus_euro'),
            gpl_litri:         val('gpl_litri'),         gpl_euro:         val('gpl_euro'),
            self_notturno_litri: val('self_notturno_litri'), self_notturno_euro: val('self_notturno_euro'),
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
            contanti_banconote: val('contanti_banconote'),
            contanti_monete:    val('contanti_monete'),
            pos_bsi_carburante:    collectPosGroup('pos-bsi-carburante'),
            pos_bsi_lavaggi:       collectPosGroup('pos-bsi-lavaggi'),
            pos_bsi_accessori:     collectPosGroup('pos-bsi-accessori'),
            pos_carisp:            collectPosGroup('pos-carisp'),
            carta_azzurra:         collectPosGroup('carta-azzurra'),
            altri_pagamenti_carta: collectPosGroup('altri-pagamenti-carta'),
            self_notturno_contanti: val('self_notturno_contanti'),
            assegni:  val('assegni'),
            bonifici: val('bonifici'),
            incasso_buoni_cartacei:  val('incasso_buoni_cartacei'),
            incasso_wallet_digitale: val('incasso_wallet_digitale'),
            crediti_paghero:         val('crediti_paghero'),
            crediti_mobile_payment:  val('crediti_mobile_payment'),
            crediti_buoni_eni:       val('crediti_buoni_eni'),
            crediti_buoni_eni_desc:  (document.querySelector('[data-field="crediti_buoni_eni_desc"]') || {}).value || null,
            crediti_voucher:         val('crediti_voucher'),
            crediti_bollette:        val('crediti_bollette'),
            crediti_4tscard:         collectPosGroup('crediti-4tscard'),
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
                    ENI.UI.escapeHtml(e.message) +
                '</div>';
        }
    }

    function _mesiOptions(selected) {
        var mesi = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
                    'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
        return mesi.map(function(m, i) {
            var v = i + 1;
            return '<option value="' + v + '"' + (v === selected ? ' selected' : '') + '>' + m + '</option>';
        }).join('');
    }

    function _anniOptions(selected) {
        var html = '';
        var cur = new Date().getFullYear();
        for (var y = cur; y >= cur - 4; y--) {
            html += '<option value="' + y + '"' + (y === selected ? ' selected' : '') + '>' + y + '</option>';
        }
        return html;
    }

    return { render: render };
})();
