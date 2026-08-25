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
    var _modalitaModifica = false;

    // ============================================================
    // RENDER PRINCIPALE
    // ============================================================

    async function render(container) {
        _dataSelezionata = ENI.UI.oggiISO();

        container.innerHTML =
            '<div class="page-header" style="display:flex; align-items:center; gap:10px;">' +
                '<h1 class="page-title" style="margin:0;">\u{1F4B0} Cassa</h1>' +
                '<button type="button" id="btn-guida-cassa" title="Guida: cosa inserire in ogni campo" ' +
                    'style="background:none; border:1.5px solid var(--color-primary); color:var(--color-primary); ' +
                    'border-radius:50%; width:30px; height:30px; padding:0; font-weight:700; cursor:pointer; ' +
                    'font-size:1rem; line-height:1; flex:0 0 auto;">?</button>' +
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

        // Guida: cosa inserire in ogni campo
        var btnGuida = container.querySelector('#btn-guida-cassa');
        if (btnGuida) btnGuida.addEventListener('click', _mostraGuidaCassa);

        await _loadAndRenderCassa();
    }

    // Guida contestuale: spiega ogni campo/sezione della chiusura
    function _mostraGuidaCassa() {
        var voce = function(titolo, testo) {
            return '<div style="margin-bottom:10px;">' +
                '<div style="font-weight:600; color:var(--color-secondary);">' + titolo + '</div>' +
                '<div class="text-sm text-muted">' + testo + '</div>' +
            '</div>';
        };
        var blocco = function(icona, titolo, contenuto) {
            return '<div style="margin-bottom:18px;">' +
                '<div style="font-weight:700; font-size:1.05rem; margin-bottom:8px; border-bottom:1px solid var(--border-color); padding-bottom:4px;">' + icona + ' ' + titolo + '</div>' +
                contenuto +
            '</div>';
        };

        var body =
            '<div style="max-height:65vh; overflow-y:auto; padding-right:6px;">' +
            '<div class="text-sm text-muted" style="margin-bottom:16px;">La <strong>Data conteggio</strong> è il <strong>giorno precedente</strong> (la chiusura si fa il giorno dopo). Alla fine, <strong>Differenza = Venduto − Incassato − Crediti</strong>: vicino a 0 significa che la cassa quadra.</div>' +

            blocco('⛽', 'Venduto Carburante',
                voce('Super SP / Diesel / Diesel+', 'Litri ed euro venduti nella <strong>giornata precedente</strong>, <strong>SENZA la notte</strong>. Il dato comprensivo della notte va sul portale PA e in Marginalità Carburante.')
            ) +

            blocco('\u{1F6D2}', 'Venduto Negozio',
                voce('Tutte le voci (Bar, AdBlue, Lavaggi, Altro/Varie…)', 'Compilate <strong>in automatico dal modulo Vendite</strong> del giorno: sono in sola lettura. Per correggere un importo, apri la vendita nel modulo Vendite. "Altro / Varie" raccoglie tutto ciò che non ha una categoria dedicata.')
            ) +

            blocco('\u{1F4B5}', 'Contanti',
                voce('Banconote', 'Inserisci il <strong>numero di pezzi</strong> per ogni taglio (non l\'importo).') +
                voce('Monete', 'Inserisci il <strong>totale in €</strong> delle monete.') +
                voce('Fondo Cassa Fisso', 'Solo informativo: <strong>non</strong> incide sul calcolo.')
            ) +

            blocco('\u{1F4B3}', 'POS',
                voce('BSI Carburante / Lavaggi / Accessori, Carisp, Carta Azzurra', 'Gli importi dei vari terminali/circuiti. Puoi aggiungere più righe per lo stesso terminale.')
            ) +

            blocco('\u{1F3AB}', 'Buoni Incassati (nostri)',
                voce('Buoni Cartacei / Wallet Digitale', 'Buoni emessi <strong>da noi</strong> e usati oggi dai clienti come pagamento.')
            ) +

            blocco('\u{1F4B8}', 'Spese in Contanti',
                voce('Spese del giorno', 'Soldi <strong>usciti dal cassetto</strong> per spese già pagate in contanti. Si registrano nel modulo Spese e vengono <strong>riaggiunte</strong> all\'incassato (perché quei contanti mancano fisicamente ma erano incasso).')
            ) +

            blocco('⏳', 'Crediti Generati Oggi',
                voce('Buoni ENI Carburante', 'I <strong>voucher carburante ENI</strong> usati dai clienti.') +
                voce('Bollette/Green Money', '<strong>Clienti che non pagano subito</strong> e vanno in credito (es. Lenny).') +
                voce('4TSCARD', 'Addebiti dei clienti con <strong>tessera fidelity</strong>.')
            ) +

            '<div style="background:var(--bg-secondary); border-radius:8px; padding:10px; font-size:0.85rem;">' +
                '💡 <strong>In breve:</strong> il carburante lo scrivi a mano, il negozio arriva da solo dalle Vendite. ' +
                'Nell\'incassato metti come hai preso i soldi (contanti + POS + buoni). Nei crediti solo ciò che <strong>non</strong> è stato incassato oggi.' +
            '</div>' +
            '</div>';

        ENI.UI.showModal({
            title: '❓ Guida alla Chiusura Cassa',
            body: body,
            size: 'lg',
            footer: '<button class="btn btn-primary" data-modal-close>Ho capito</button>'
        });
    }

    // ============================================================
    // CARICAMENTO DATI
    // ============================================================

    async function _loadAndRenderCassa() {
        _modalitaModifica = false;
        if (_bozzaTimer) { clearTimeout(_bozzaTimer); _bozzaTimer = null; } // evita bozze "a cavallo" fra date diverse
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
        var isChiusaReale = c.stato === 'chiusa';
        var isChiusa = isChiusaReale && !_modalitaModifica;
        var totSpese = _spese.reduce(function(s, sp) {
            return s + Number(sp.importo || 0);
        }, 0);

        // Memorizza l'eventuale tab POS attivo prima del re-render (preserva la posizione utente)
        var posTabAttivoEl = contentEl.querySelector('.pos-tab-btn.active');
        var posTabAttivo = posTabAttivoEl ? posTabAttivoEl.dataset.posTab : null;

        var badgeHtml;
        if (isChiusaReale && _modalitaModifica) {
            badgeHtml = '<span class="badge badge-warning">\u{1F513} In modifica</span>';
        } else if (isChiusa) {
            badgeHtml = '<span class="badge badge-danger">\uD83D\uDD12 Chiusa</span>';
        } else if (c.stato === 'aperta') {
            badgeHtml = '<span class="badge badge-gray">\u{1F4DD} Bozza</span>';
        } else {
            badgeHtml = '<span class="badge badge-success">\u2705 Aperta</span>';
        }
        // Indicatore autosalvataggio (solo quando la cassa \u00E8 editabile)
        var statusHtml = !isChiusa ? '<div id="cassa-bozza-status" class="text-xs text-muted" style="margin-top:2px;">' +
            (c.stato === 'aperta' ? '\uD83D\uDCDD Bozza salvata' : '') + '</div>' : '';

        var bannerHtml = '';
        if (isChiusaReale && _modalitaModifica) {
            bannerHtml = '<div class="stock-alert mb-4" style="background:#DBEAFE; border-left-color:#3B82F6;">' +
                '\u270F\uFE0F Modalit\u00E0 modifica attiva. Le modifiche verranno registrate nel log.' +
            '</div>';
        } else if (isChiusa) {
            bannerHtml = '<div class="stock-alert mb-4" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">' +
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
              '</div>';
        }

        contentEl.innerHTML =
            // Header: data selezionata + stato
            '<div class="cassa-section cassa-header-section">' +
                '<div class="cassa-data-row">' +
                    '<div>' +
                        '<label class="form-label">Data conteggio</label>' +
                        '<input type="date" class="form-input" id="cassa-data" ' +
                            'value="' + _dataSelezionata + '" max="' + ENI.UI.oggiISO() + '">' +
                    '</div>' +
                    '<div>' + badgeHtml + statusHtml + '</div>' +
                '</div>' +
                _hint('ℹ️ <strong>Data conteggio:</strong> inserisci il <strong>giorno precedente</strong> (la chiusura si fa il giorno dopo).') +
            '</div>' +

            bannerHtml +

            '<form id="form-cassa" class="cassa-compact">' +

                // Fondo cassa (solo informativo)
                _section('\u{1F4C5} Informazioni Giornata',
                    '<div class="cassa-grid">' +
                        _cassaInput('Fondo Cassa Fisso', 'fondo_cassa', c.fondo_cassa || (ENI.Config.CONSTANTS.FONDO_CASSA_DEFAULT || 720), 'number') +
                    '</div>' +
                    '<div class="text-sm text-muted mt-2">Importo fondo cassa fisso \u2014 solo informativo, <strong>non incide</strong> sul calcolo incassato</div>'
                ) +

                // ════════ LAYOUT 2 COLONNE (solo chiusa) ════════
                '<div class="' + (isChiusa ? 'cassa-two-col' : '') + '">' +

                    // ──── COLONNA SINISTRA: VENDUTO ────
                    '<div>' +

                        // Venduto Carburante
                        _section('\u26FD Venduto Carburante',
                            _hint('\u2139\uFE0F Inserisci solo il venduto della <strong>giornata precedente</strong> (NON comprensiva della notte).<br>' +
                                'Il dato <strong>comprensivo della notte</strong> va invece sul <strong>portale PA</strong> e in <strong>Marginalit\u00E0 Carburante \u2192 Registra vendita</strong>.') +
                            _renderCarburanteTable(c) +
                            '<div class="cassa-subtotal text-right mt-3">Totale Carburante: <span id="tot-carburante">\u20AC 0,00</span></div>'
                        ) +

                        // Venduto Negozio (fonte unica: modulo Vendite)
                        _section('\u{1F6D2} Venduto Negozio' +
                            (_posTotals && _posTotals.numVendite > 0
                                ? ' <span class="badge badge-success" style="font-size:0.75rem; margin-left:8px;">' +
                                    _posTotals.numVendite + ' vendite: ' + ENI.UI.formatValuta(_posTotals.totaleVendite) +
                                  '</span>'
                                : ''),
                            _hint('\u2139\uFE0F Importi presi <strong>automaticamente dal modulo Vendite</strong> del giorno (sola lettura). Per correggere una vendita, aprila nel modulo Vendite.') +
                            '<div class="cassa-grid">' +
                                _vendutoRO('Bar', 'venduto_bar', 'Bar', c) +
                                _vendutoRO('Oli e lubrificanti', 'venduto_olio', 'Oli e lubrificanti', c) +
                                _vendutoRO('Accessori', 'venduto_accessori', 'Accessori', c) +
                                _vendutoRO('AdBlue', 'venduto_adblue', 'AdBlue', c) +
                                _vendutoRO('Lavaggi', 'venduto_lavaggi', 'Lavaggi', c) +
                                _vendutoRO('Tergicristalli', 'venduto_tergicristalli', 'Tergicristalli', c) +
                                _vendutoRO('Catene', 'venduto_catene', 'Catene', c) +
                                _vendutoRO('Profumatori', 'venduto_profumatori', 'Profumatori', c) +
                                _vendutoRO('Detailing', 'venduto_detailing', 'Detailing', c) +
                                _vendutoRO('Uso interno', 'venduto_uso_interno', 'Uso interno', c) +
                                _vendutoRO('Altro / Varie', 'venduto_altro', '__ALTRO__', c) +
                            '</div>' +
                            '<div class="text-right mt-2"><a href="#/vendita" class="text-xs" style="color:var(--color-primary);">Vai alle Vendite \u2192</a></div>' +
                            '<div class="cassa-subtotal text-right mt-2">Totale Negozio: <span id="tot-altro">\u20AC 0,00</span></div>'
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
                            _hint('\u2139\uFE0F <strong>Banconote:</strong> inserisci il <strong>numero di pezzi</strong> per ogni taglio. &nbsp;<strong>Monete:</strong> inserisci il <strong>totale in \u20AC</strong>.') +
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
                                (_posTotals && _posTotals.perMetodo && _posTotals.perMetodo.contanti > 0
                                    ? '<div class="cassa-subtotal text-right" style="color:var(--color-gray-500); font-style:italic;">Promemoria \u2014 vendite in contanti oggi: ' + ENI.UI.formatValuta(_posTotals.perMetodo.contanti) + '</div>'
                                    : '') +
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

                        // TOTALE INCASSATO
                        '<div class="cassa-totale">' +
                            '<div class="cassa-totale-label">\u{1F4B5} TOTALE INCASSATO</div>' +
                            '<div class="cassa-totale-value" id="tot-incassato">\u20AC 0,00</div>' +
                        '</div>' +

                    '</div>' +

                '</div>' +
                // ════════ FINE 2 COLONNE ════════

                // Spese in contanti (caricate da modulo Spese)
                _renderSpeseSection(totSpese) +

                // Crediti Generati
                _section('\u23F3 Crediti Generati Oggi',
                    '<div class="cassa-grid">' +
                        _cassaInputHint('Buoni ENI Carburante', 'crediti_buoni_eni', c.crediti_buoni_eni, 'Inserisci qui i voucher carburante.') +
                        _cassaInputHint('Bollette/Green Money', 'crediti_bollette', c.crediti_bollette, 'Clienti che non pagano subito (es. Lenny).') +
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

        // Ripristina il tab POS attivo dopo un eventuale re-render
        if (posTabAttivo) {
            var tabBtn = contentEl.querySelector('.pos-tab-btn[data-pos-tab="' + posTabAttivo + '"]');
            if (tabBtn) tabBtn.click();
        }

        // Setup salvataggio
        if (!isChiusa) {
            var btnSalva = contentEl.querySelector('#btn-salva-cassa');
            if (btnSalva) btnSalva.addEventListener('click', _salvaCassa);
        }

        // Sblocca cassa chiusa per modifica (re-render con isChiusa=false)
        var btnSblocca = contentEl.querySelector('#btn-sblocca-cassa');
        if (btnSblocca) {
            btnSblocca.addEventListener('click', async function() {
                _modalitaModifica = true;
                // Ricarica le vendite del giorno: così il Venduto Negozio si riallinea
                // al modulo Vendite anche su una cassa già chiusa (permette di correggerla).
                try { _posTotals = await ENI.API.getVenditeTotaliPerData(_dataSelezionata); }
                catch (e) { _posTotals = null; }
                _renderForm();
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
                    var vecchiaData = _cassa.data;

                    // Spostamento ATOMICO: un solo UPDATE della data (niente elimina+ricrea)
                    await ENI.API.spostaCassa(_cassa.id, nuovaData);
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

    // Box promemoria (nota informativa)
    function _hint(html) {
        return '<div class="cassa-hint" style="background:#EFF6FF; border-left:3px solid #3B82F6; ' +
            'border-radius:6px; padding:8px 10px; font-size:0.8rem; line-height:1.4; ' +
            'color:#1E3A5F; margin:6px 0;">' + html + '</div>';
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

    // Cerchietto "i" di info con testo esplicativo sotto il campo (leggibile anche da tablet).
    function _cassaInputHint(label, name, value, hint) {
        value = (value !== null && value !== undefined && value !== 0) ? value : '';
        var iBadge = '<span title="' + hint.replace(/"/g, '&quot;') + '" style="display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:50%;background:var(--color-primary);color:#fff;font-size:11px;font-weight:700;line-height:1;font-family:Georgia,\'Times New Roman\',serif;margin-left:6px;flex:0 0 auto;vertical-align:middle;cursor:help;">i</span>';
        return '<div class="cassa-row">' +
            '<span class="cassa-row-label">' + label + iBadge + '</span>' +
            '<div class="cassa-row-input">' +
                '<input type="number" step="0.01" min="0" class="form-input cassa-field" ' +
                    'data-field="' + name + '" value="' + value + '">' +
            '</div>' +
            '<div class="text-xs text-muted" style="margin-top:2px;">' + hint + '</div>' +
        '</div>';
    }

    // Mappa campo cassa -> categoria del modulo Vendite (venduto negozio, sola lettura)
    var _VENDUTO_CAT = {
        'venduto_bar': 'Bar',
        'venduto_olio': 'Oli e lubrificanti',
        'venduto_accessori': 'Accessori',
        'venduto_adblue': 'AdBlue',
        'venduto_lavaggi': 'Lavaggi',
        'venduto_tergicristalli': 'Tergicristalli',
        'venduto_catene': 'Catene',
        'venduto_profumatori': 'Profumatori',
        'venduto_detailing': 'Detailing',
        'venduto_uso_interno': 'Uso interno'
    };

    // "Altro / Varie" = totale vendite del giorno − categorie mappate.
    // Cattura la categoria "Altro" e ogni categoria senza campo dedicato: nulla va perso.
    function _altroVarieValue() {
        if (!_posTotals || !_posTotals.perCategoria) return 0;
        var mapped = 0;
        for (var campo in _VENDUTO_CAT) {
            if (_VENDUTO_CAT.hasOwnProperty(campo)) {
                mapped += Number(_posTotals.perCategoria[_VENDUTO_CAT[campo]] || 0);
            }
        }
        var altro = Number(_posTotals.totaleVendite || 0) - mapped;
        return altro > 0 ? Math.round(altro * 100) / 100 : 0;
    }

    // Campo venduto negozio in SOLA LETTURA, alimentato dal modulo Vendite.
    // Con vendite del giorno usa quelle; altrimenti (cassa chiusa/storica) il valore salvato.
    function _vendutoRO(label, name, catKey, c) {
        var v;
        if (_posTotals && _posTotals.numVendite > 0) {
            v = (catKey === '__ALTRO__') ? _altroVarieValue()
                : Number((_posTotals.perCategoria && _posTotals.perCategoria[catKey]) || 0);
        } else {
            v = Number((c && c[name]) || 0);
        }
        var vStr = v ? v.toFixed(2) : '0';
        return '<div class="cassa-row">' +
            '<span class="cassa-row-label">' + label + '</span>' +
            '<div class="cassa-row-input">' +
                '<input type="number" step="0.01" class="form-input cassa-field" readonly ' +
                    'title="Dato dal modulo Vendite — non modificabile qui" ' +
                    'style="background:var(--bg-secondary); cursor:not-allowed;" ' +
                    'data-field="' + name + '" value="' + vStr + '">' +
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
            // Qualsiasi modifica programma un autosalvataggio bozza (anche la nota)
            _scheduleBozza();
        });
    }

    function _ricalcola(totSpese) {
        totSpese = totSpese || 0;
        var val = _getFieldValue;

        // Carburante (senza Self Notturno)
        var totCarburante =
            val('super_sp_euro') + val('diesel_euro') + val('diesel_plus_euro');

        // Venduto negozio (dal modulo Vendite, incl. Altro/Varie)
        var totAltro =
            val('venduto_bar') + val('venduto_olio') + val('venduto_accessori') +
            val('venduto_adblue') + val('venduto_lavaggi') +
            val('venduto_tergicristalli') + val('venduto_catene') + val('venduto_profumatori') +
            val('venduto_detailing') + val('venduto_uso_interno') + val('venduto_altro');

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
                _scheduleBozza();
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

    // Raccoglie tutti i valori del form in un oggetto dati pronto per il DB.
    function _raccogliDati(stato) {
        var val = _getFieldValue;
        var totSpese = _spese.reduce(function(s, sp) { return s + Number(sp.importo || 0); }, 0);

        var totCarburante = val('super_sp_euro') + val('diesel_euro') + val('diesel_plus_euro');
        var totAltro =
            val('venduto_bar') + val('venduto_olio') + val('venduto_accessori') +
            val('venduto_adblue') + val('venduto_lavaggi') +
            val('venduto_tergicristalli') + val('venduto_catene') + val('venduto_profumatori') +
            val('venduto_detailing') + val('venduto_uso_interno') + val('venduto_altro');
        var totVenduto = totCarburante + totAltro;

        var tagli = [5, 10, 20, 50, 100, 200, 500];
        var totBanconote = 0;
        tagli.forEach(function(t) { totBanconote += val('banconote_' + t) * t; });

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

        function collectPosGroup(groupId) {
            var group = document.getElementById(groupId);
            if (!group) return [];
            var rows = [];
            group.querySelectorAll('.pos-row').forEach(function(row) {
                var importo = parseFloat((row.querySelector('.pos-importo') || {}).value) || 0;
                if (importo > 0) { rows.push({ importo: importo }); }
            });
            return rows;
        }

        return {
            data: _dataSelezionata,
            fondo_cassa: val('fondo_cassa'),
            super_sp_litri:    val('super_sp_litri'),    super_sp_euro:    val('super_sp_euro'),
            diesel_litri:      val('diesel_litri'),      diesel_euro:      val('diesel_euro'),
            diesel_plus_litri: val('diesel_plus_litri'), diesel_plus_euro: val('diesel_plus_euro'),
            self_notturno_litri: val('self_notturno_litri'),
            self_notturno_euro: val('self_notturno_euro'),
            self_notturno_contanti: val('self_notturno_contanti'),
            venduto_bar:            val('venduto_bar'),
            venduto_olio:           val('venduto_olio'),
            venduto_accessori:      val('venduto_accessori'),
            venduto_adblue:         val('venduto_adblue'),
            venduto_lavaggi:        val('venduto_lavaggi'),
            venduto_buoni:          0,
            venduto_tergicristalli: val('venduto_tergicristalli'),
            venduto_catene:         val('venduto_catene'),
            venduto_profumatori:    val('venduto_profumatori'),
            venduto_detailing:      val('venduto_detailing'),
            venduto_uso_interno:    val('venduto_uso_interno'),
            venduto_altro:          val('venduto_altro'),
            banconote_5:   val('banconote_5'),
            banconote_10:  val('banconote_10'),
            banconote_20:  val('banconote_20'),
            banconote_50:  val('banconote_50'),
            banconote_100: val('banconote_100'),
            banconote_200: val('banconote_200'),
            banconote_500: val('banconote_500'),
            contanti_banconote: totBanconote,
            contanti_monete:    val('contanti_monete'),
            pos_bsi_carburante:    collectPosGroup('pos-bsi-carburante'),
            pos_bsi_lavaggi:       collectPosGroup('pos-bsi-lavaggi'),
            pos_bsi_accessori:     collectPosGroup('pos-bsi-accessori'),
            pos_carisp:            collectPosGroup('pos-carisp'),
            carta_azzurra:         collectPosGroup('carta-azzurra'),
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
            stato:            stato,
            utente_chiusura:  ENI.State.getUserId(),
            formula_versione: 2
        };
    }

    // --- Autosalvataggio BOZZA ---
    var _bozzaTimer = null;
    var _bozzaInFlight = false;

    function _scheduleBozza() {
        // Non salvare bozze su una cassa già CHIUSA (anche se in modifica): quella si salva a mano.
        if (_cassa && _cassa.stato === 'chiusa') return;
        if (_bozzaTimer) clearTimeout(_bozzaTimer);
        _bozzaTimer = setTimeout(_autoSalvaBozza, 1500);
    }

    async function _autoSalvaBozza() {
        if (_bozzaInFlight) return;
        if (_cassa && _cassa.stato === 'chiusa') return;
        var dati;
        try { dati = _raccogliDati('bozza'); } catch (e) { return; }
        // Salva solo se l'utente ha inserito almeno un valore (escluso il fondo cassa, prefillato).
        var haQualcosa = !!dati.note;
        if (!haQualcosa) {
            var inputs = document.querySelectorAll('#form-cassa .cassa-field, #form-cassa .pos-importo, #form-cassa .banconota-qty');
            for (var i = 0; i < inputs.length; i++) {
                if (inputs[i].getAttribute('data-field') === 'fondo_cassa') continue;
                var v = String(inputs[i].value || '').trim();
                if (v !== '' && parseFloat(v) !== 0) { haQualcosa = true; break; }
            }
        }
        if (!haQualcosa) return;
        if (!ENI.API.salvaBozzaCassa) return;
        _bozzaInFlight = true;
        try {
            var rec = await ENI.API.salvaBozzaCassa(dati);
            if (rec && rec.stato === 'aperta') _cassa = rec; // così sappiamo che esiste una bozza
            _mostraStatoBozza('📝 Bozza salvata ' + ENI.UI.oraCorrente());
        } catch (e) { /* silenzioso: non disturbare chi sta compilando */ }
        finally { _bozzaInFlight = false; }
    }

    function _mostraStatoBozza(txt) {
        var el = document.getElementById('cassa-bozza-status');
        if (el) el.textContent = txt;
    }

    async function _salvaCassa() {
        // Ferma un eventuale autosalvataggio bozza in coda
        if (_bozzaTimer) { clearTimeout(_bozzaTimer); _bozzaTimer = null; }
        var ok = await ENI.UI.confirm({
            title: '\u{1F4BE} Conferma Chiusura Cassa',
            message: 'Vuoi salvare la chiusura cassa del ' + ENI.UI.formatDataCompleta(_dataSelezionata) + '?',
            confirmText: 'Salva',
            cancelText: 'Annulla'
        });

        if (!ok) return;

        var dati = _raccogliDati('chiusa');

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

            // I totali del mese sommano solo le casse CHIUSE (le bozze sono parziali)
            var totVendutoMese = 0, totIncassatoMese = 0, totDiffMese = 0, totSpeseMese = 0, nChiuse = 0;
            records.forEach(function(r) {
                if (r.stato !== 'chiusa') return;
                totVendutoMese   += Number(r.totale_venduto || 0);
                totIncassatoMese += Number(r.totale_incassato || 0);
                totDiffMese      += Number(r.differenza || 0);
                totSpeseMese     += Number(r.totale_spese || 0);
                nChiuse++;
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
                var isBozza = r.stato !== 'chiusa';
                var diff = Number(r.differenza || 0);
                var diffStyle = Math.abs(diff) < 0.01
                    ? 'color:#166534;'
                    : Math.abs(diff) <= 50
                        ? 'color:#92400E;'
                        : 'color:#991B1B;';
                var badge = isBozza
                    ? '<span class="badge badge-gray">\u{1F4DD} Bozza</span>'
                    : '<span class="badge ' + (r.stato === 'chiusa' ? 'badge-scaduto' : 'badge-incassato') + '">' + r.stato + '</span>';
                var diffCell = isBozza
                    ? '<span class="text-muted">—</span>'
                    : '<span style="' + diffStyle + ' font-weight:600;">' + ENI.UI.formatValuta(r.differenza) + '</span>';

                html += '<tr class="storico-row" data-data="' + r.data + '" style="cursor:pointer;' + (isBozza ? 'opacity:0.7;' : '') + '" title="Clicca per aprire">' +
                    '<td>' + ENI.UI.formatDataCompleta(r.data) + '</td>' +
                    '<td>' + ENI.UI.formatValuta(r.totale_venduto) + '</td>' +
                    '<td>' + ENI.UI.formatValuta(r.totale_incassato) + '</td>' +
                    '<td style="color:var(--color-danger);">' + ENI.UI.formatValuta(r.totale_spese) + '</td>' +
                    '<td>' + diffCell + '</td>' +
                    '<td>' + badge + '</td>' +
                '</tr>';
            });

            html +=
                '</tbody><tfoot><tr>' +
                    '<td><strong>TOTALE MESE (' + nChiuse + ' chiuse)</strong></td>' +
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
