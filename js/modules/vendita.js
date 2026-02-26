// ============================================================
// GESTIONALE ENI - Modulo Vendita (POS)
// Punto vendita con barcode scanner, carrello, pagamenti,
// storico vendite, resi e stampa scontrino
// ============================================================

var ENI = ENI || {};
ENI.Modules = ENI.Modules || {};

ENI.Modules.Vendita = (function() {
    'use strict';

    // --- State ---
    var _carrello = [];
    var _scontoGlobale = 0;
    var _scontoGlobaleTipo = 'fisso';
    var _activeTab = 'vendita';
    var _container = null;
    var _searchResults = [];
    var _debounceTimer = null;

    // ============================================================
    // RENDER PRINCIPALE
    // ============================================================

    async function render(container) {
        _container = container;
        _activeTab = 'vendita';

        container.innerHTML =
            '<div class="page-header">' +
                '<h1 class="page-title">\u{1F6D2} Vendita</h1>' +
                '<div class="page-header-actions">' +
                    '<span class="text-sm text-muted" id="pos-datetime"></span>' +
                '</div>' +
            '</div>' +

            // Tabs
            '<div class="tabs">' +
                '<button class="tab-btn active" data-tab="vendita">Nuova Vendita</button>' +
                '<button class="tab-btn" data-tab="storico">Storico</button>' +
                '<button class="tab-btn" data-tab="resi">Resi</button>' +
            '</div>' +

            '<div id="vendita-content"></div>' +

            // Div nascosto per stampa scontrino
            '<div id="receipt-print" style="display: none;"></div>';

        _setupTabEvents(container);
        _updateDateTime();
        _renderTab();
    }

    function _updateDateTime() {
        var el = document.getElementById('pos-datetime');
        if (el) {
            var now = new Date();
            el.textContent = now.toLocaleDateString('it-IT') + ' ' + now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
        }
    }

    function _setupTabEvents(container) {
        ENI.UI.delegate(container, 'click', '.tab-btn[data-tab]', function(e, el) {
            _activeTab = el.dataset.tab;
            container.querySelectorAll('.tab-btn[data-tab]').forEach(function(t) {
                t.classList.toggle('active', t.dataset.tab === _activeTab);
            });
            _renderTab();
        });
    }

    function _renderTab() {
        var content = document.getElementById('vendita-content');
        if (!content) return;

        switch (_activeTab) {
            case 'vendita': _renderPOS(content); break;
            case 'storico': _renderStorico(content); break;
            case 'resi': _renderResi(content); break;
        }
    }

    // ============================================================
    // TAB: NUOVA VENDITA (POS)
    // ============================================================

    function _renderPOS(container) {
        container.innerHTML =
            '<div class="pos-layout">' +
                // Colonna sinistra: barcode + carrello
                '<div class="pos-main">' +
                    // Input barcode + bottone scanner
                    '<div class="pos-barcode-wrapper">' +
                        '<div class="pos-barcode-row">' +
                            '<input type="text" class="form-input pos-barcode-input" id="barcode-input" ' +
                                'placeholder="\u{1F50D} Scansiona barcode o cerca prodotto..." autocomplete="off">' +
                            '<button class="btn btn-primary pos-camera-btn" id="btn-camera-scan" style="display:none;" title="Scansiona con fotocamera">' +
                                '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>' +
                            '</button>' +
                        '</div>' +
                        '<div id="search-dropdown" class="pos-search-dropdown" style="display: none;"></div>' +
                    '</div>' +
                    // Scanner fotocamera (nascosto, si apre on-demand)
                    '<div id="camera-scanner-container" class="pos-scanner-container" style="display:none;">' +
                        '<div class="pos-scanner-header">' +
                            '<span>Inquadra il barcode</span>' +
                            '<button class="btn btn-sm btn-danger" id="btn-camera-stop">Chiudi</button>' +
                        '</div>' +
                        '<div id="camera-scanner-reader"></div>' +
                    '</div>' +
                    '<div style="margin-bottom: var(--space-3); display: flex; gap: var(--space-2);">' +
                        '<button class="btn btn-sm btn-outline" id="btn-manuale">\u270F\uFE0F Aggiungi manuale</button>' +
                        '<button class="btn btn-sm btn-outline" id="btn-svuota" style="margin-left: auto;">\u{1F5D1}\uFE0F Svuota carrello</button>' +
                    '</div>' +

                    // Carrello
                    '<div id="pos-carrello"></div>' +
                '</div>' +

                // Colonna destra: riepilogo e pagamento
                '<div class="pos-payment-panel">' +
                    '<div id="pos-riepilogo"></div>' +
                '</div>' +
            '</div>';

        _setupPOSEvents(container);
        _renderCarrello();
        _renderRiepilogo();
        _refocusBarcode();
    }

    function _setupPOSEvents(container) {
        // Barcode input
        var barcodeInput = document.getElementById('barcode-input');
        if (barcodeInput) {
            barcodeInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    var value = barcodeInput.value.trim();
                    if (value.length > 0) {
                        _processBarcodeScan(value);
                        barcodeInput.value = '';
                        _hideSearchDropdown();
                    }
                } else if (e.key === 'Escape') {
                    barcodeInput.value = '';
                    _hideSearchDropdown();
                }
            });

            barcodeInput.addEventListener('input', function(e) {
                var value = e.target.value.trim();
                clearTimeout(_debounceTimer);

                if (value.length < 2) {
                    _hideSearchDropdown();
                    return;
                }

                // Se sembra un barcode numerico, non mostrare dropdown
                if (/^\d+$/.test(value) && value.length >= 8) {
                    _hideSearchDropdown();
                    return;
                }

                _debounceTimer = setTimeout(function() {
                    _searchByName(value);
                }, 300);
            });
        }

        // Aggiungi manuale
        var btnManuale = document.getElementById('btn-manuale');
        if (btnManuale) {
            btnManuale.addEventListener('click', _showFormManuale);
        }

        // Svuota carrello
        var btnSvuota = document.getElementById('btn-svuota');
        if (btnSvuota) {
            btnSvuota.addEventListener('click', function() {
                if (_carrello.length === 0) return;
                ENI.UI.confirm('Vuoi svuotare il carrello?', function() {
                    _carrello = [];
                    _scontoGlobale = 0;
                    _renderCarrello();
                    _renderRiepilogo();
                    _refocusBarcode();
                });
            });
        }

        // Scanner fotocamera (solo se il device ha la fotocamera)
        _initCameraButton();

        // Delegati carrello
        ENI.UI.delegate(container, 'click', '[data-cart-action]', function(e, el) {
            var idx = parseInt(el.dataset.cartIndex, 10);
            var action = el.dataset.cartAction;

            if (action === 'add') _aggiornaQuantita(idx, 1);
            else if (action === 'remove') _aggiornaQuantita(idx, -1);
            else if (action === 'delete') _rimuoviDalCarrello(idx);
            else if (action === 'sconto') _showScontoRiga(idx);

            _refocusBarcode();
        });
    }

    function _refocusBarcode() {
        setTimeout(function() {
            var input = document.getElementById('barcode-input');
            if (input) input.focus();
        }, 100);
    }

    // --- Scanner Fotocamera ---

    var _html5QrCode = null;
    var _scannerRunning = false;

    function _initCameraButton() {
        var btn = document.getElementById('btn-camera-scan');
        if (!btn) return;

        // Mostra il bottone se l'API mediaDevices esiste (HTTPS + browser moderno)
        // Non usiamo enumerateDevices perché su mobile non rileva la fotocamera
        // finché l'utente non ha dato il permesso almeno una volta
        if (navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
            btn.style.display = 'flex';
        }

        btn.addEventListener('click', _startCameraScanner);

        var btnStop = document.getElementById('btn-camera-stop');
        if (btnStop) {
            btnStop.addEventListener('click', _stopCameraScanner);
        }
    }

    function _startCameraScanner() {
        if (_scannerRunning) return;

        var scannerContainer = document.getElementById('camera-scanner-container');
        if (scannerContainer) scannerContainer.style.display = 'block';

        if (typeof Html5Qrcode === 'undefined') {
            ENI.UI.error('Libreria scanner non caricata');
            return;
        }

        _html5QrCode = new Html5Qrcode('camera-scanner-reader');
        _scannerRunning = true;

        _html5QrCode.start(
            { facingMode: 'environment' },
            {
                fps: 10,
                qrbox: { width: 280, height: 120 },
                aspectRatio: 1.5
            },
            function onScanSuccess(decodedText) {
                // Barcode letto, ferma lo scanner e processa
                _stopCameraScanner();
                _processBarcodeScan(decodedText);
            },
            function onScanFailure() {
                // Silenzioso: continua a provare
            }
        ).catch(function(err) {
            _scannerRunning = false;
            var scannerContainer = document.getElementById('camera-scanner-container');
            if (scannerContainer) scannerContainer.style.display = 'none';
            ENI.UI.error('Impossibile accedere alla fotocamera: ' + err);
        });
    }

    function _stopCameraScanner() {
        if (_html5QrCode && _scannerRunning) {
            _html5QrCode.stop().then(function() {
                _html5QrCode.clear();
                _scannerRunning = false;
            }).catch(function() {
                _scannerRunning = false;
            });
        }

        var scannerContainer = document.getElementById('camera-scanner-container');
        if (scannerContainer) scannerContainer.style.display = 'none';

        _refocusBarcode();
    }

    // --- Barcode Scan ---

    async function _processBarcodeScan(value) {
        // Check: e' un buono cartaceo? (EAN-13 con prefisso "20")
        if (/^\d{13}$/.test(value) && value.startsWith('20')) {
            _processVoucherScan(value);
            return;
        }

        // Se numerico e >= 8 cifre: barcode EAN
        if (/^\d+$/.test(value) && value.length >= 8) {
            try {
                var prodotto = await ENI.API.cercaProdottoByBarcode(value);
                if (prodotto) {
                    _aggiungiAlCarrello(prodotto);
                } else {
                    ENI.UI.warning('Prodotto non trovato per barcode: ' + value);
                }
            } catch(e) {
                ENI.UI.error('Errore ricerca: ' + e.message);
            }
        } else {
            // Cerca per nome/codice
            try {
                var risultati = await ENI.API.cercaProdottiByNome(value);
                if (risultati.length === 1) {
                    _aggiungiAlCarrello(risultati[0]);
                } else if (risultati.length > 1) {
                    // Mostra lista risultati nel dropdown
                    _showSearchResults(risultati);
                } else {
                    ENI.UI.warning('Nessun prodotto trovato per: ' + value);
                }
            } catch(e) {
                ENI.UI.error('Errore ricerca: ' + e.message);
            }
        }
    }

    // --- Ricerca per nome (dropdown) ---

    async function _searchByName(term) {
        try {
            var risultati = await ENI.API.cercaProdottiByNome(term);
            if (risultati.length > 0) {
                _showSearchResults(risultati);
            } else {
                _hideSearchDropdown();
            }
        } catch(e) {
            _hideSearchDropdown();
        }
    }

    function _showSearchResults(risultati) {
        var dropdown = document.getElementById('search-dropdown');
        if (!dropdown) return;

        _searchResults = risultati;
        var html = '';
        risultati.forEach(function(p, i) {
            html += '<div class="pos-search-item" data-search-index="' + i + '">' +
                '<div><strong>' + ENI.UI.escapeHtml(p.nome_prodotto) + '</strong></div>' +
                '<div class="text-sm text-muted">' +
                    ENI.UI.escapeHtml(p.categoria || '') +
                    (p.barcode ? ' | ' + p.barcode : '') +
                    ' | ' + ENI.UI.formatValuta(p.prezzo_vendita) +
                    ' | Giacenza: ' + p.giacenza +
                '</div>' +
            '</div>';
        });

        dropdown.innerHTML = html;
        dropdown.style.display = 'block';

        // Click su risultato
        dropdown.querySelectorAll('.pos-search-item').forEach(function(el) {
            el.addEventListener('click', function() {
                var idx = parseInt(el.dataset.searchIndex, 10);
                _aggiungiAlCarrello(_searchResults[idx]);
                _hideSearchDropdown();
                var input = document.getElementById('barcode-input');
                if (input) input.value = '';
                _refocusBarcode();
            });
        });
    }

    function _hideSearchDropdown() {
        var dropdown = document.getElementById('search-dropdown');
        if (dropdown) dropdown.style.display = 'none';
    }

    // --- Carrello ---

    function _aggiungiAlCarrello(prodotto) {
        // Se prezzo 0 (variabile), chiedi prezzo
        if (!prodotto.prezzo_vendita || prodotto.prezzo_vendita <= 0) {
            _chiediPrezzo(prodotto);
            return;
        }

        // Cerca se gia nel carrello
        var existIdx = -1;
        for (var i = 0; i < _carrello.length; i++) {
            if (_carrello[i].prodotto_id === prodotto.id) {
                existIdx = i;
                break;
            }
        }

        if (existIdx >= 0) {
            _carrello[existIdx].quantita++;
            _carrello[existIdx].totale_riga = _calcolaTotaleRiga(_carrello[existIdx]);
        } else {
            _carrello.push({
                prodotto_id: prodotto.id,
                codice_prodotto: prodotto.codice,
                barcode: prodotto.barcode,
                nome_prodotto: prodotto.nome_prodotto,
                categoria: prodotto.categoria,
                quantita: 1,
                prezzo_unitario: prodotto.prezzo_vendita,
                sconto: 0,
                sconto_tipo: 'fisso',
                totale_riga: prodotto.prezzo_vendita
            });
        }

        // Warning giacenza
        if (prodotto.giacenza !== undefined && prodotto.giacenza !== null) {
            var qtyCarrello = 0;
            _carrello.forEach(function(c) { if (c.prodotto_id === prodotto.id) qtyCarrello = c.quantita; });
            if (qtyCarrello > prodotto.giacenza) {
                ENI.UI.warning('Attenzione: giacenza insufficiente per "' + prodotto.nome_prodotto + '" (disponibili: ' + prodotto.giacenza + ')');
            }
        }

        _renderCarrello();
        _renderRiepilogo();
    }

    function _chiediPrezzo(prodotto) {
        var body =
            '<div class="form-group">' +
                '<label class="form-label">Prodotto: <strong>' + ENI.UI.escapeHtml(prodotto.nome_prodotto) + '</strong></label>' +
                '<p class="text-sm text-muted">Questo prodotto ha prezzo variabile. Inserisci il prezzo.</p>' +
                '<input type="number" step="0.01" min="0.01" class="form-input" id="prezzo-manuale" placeholder="Prezzo di vendita">' +
            '</div>';

        var modal = ENI.UI.showModal({
            title: 'Inserisci Prezzo',
            body: body,
            footer:
                '<button class="btn btn-outline" data-modal-close>Annulla</button>' +
                '<button class="btn btn-primary" id="btn-conferma-prezzo">Conferma</button>'
        });

        modal.querySelector('#prezzo-manuale').focus();

        modal.querySelector('#btn-conferma-prezzo').addEventListener('click', function() {
            var prezzo = parseFloat(modal.querySelector('#prezzo-manuale').value);
            if (isNaN(prezzo) || prezzo <= 0) {
                ENI.UI.warning('Inserisci un prezzo valido');
                return;
            }
            prodotto.prezzo_vendita = prezzo;
            ENI.UI.closeModal(modal);
            _aggiungiAlCarrello(prodotto);
        });

        modal.querySelector('#prezzo-manuale').addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                modal.querySelector('#btn-conferma-prezzo').click();
            }
        });
    }

    function _aggiornaQuantita(idx, delta) {
        if (idx < 0 || idx >= _carrello.length) return;
        _carrello[idx].quantita += delta;
        if (_carrello[idx].quantita <= 0) {
            _carrello.splice(idx, 1);
        } else {
            _carrello[idx].totale_riga = _calcolaTotaleRiga(_carrello[idx]);
        }
        _renderCarrello();
        _renderRiepilogo();
    }

    function _rimuoviDalCarrello(idx) {
        _carrello.splice(idx, 1);
        _renderCarrello();
        _renderRiepilogo();
    }

    function _calcolaTotaleRiga(item) {
        var lordo = item.prezzo_unitario * item.quantita;
        var sconto = 0;
        if (item.sconto_tipo === 'percentuale') {
            sconto = lordo * (item.sconto / 100);
        } else {
            sconto = item.sconto;
        }
        return Math.max(0, lordo - sconto);
    }

    function _showScontoRiga(idx) {
        var item = _carrello[idx];
        if (!item) return;

        var body =
            '<div class="form-group">' +
                '<label class="form-label">Sconto per: <strong>' + ENI.UI.escapeHtml(item.nome_prodotto) + '</strong></label>' +
                '<div class="form-row">' +
                    '<div class="form-group">' +
                        '<input type="number" step="0.01" min="0" class="form-input" id="sconto-valore" value="' + (item.sconto || 0) + '">' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<select class="form-select" id="sconto-tipo">' +
                            '<option value="fisso"' + (item.sconto_tipo === 'fisso' ? ' selected' : '') + '>\u20AC (fisso)</option>' +
                            '<option value="percentuale"' + (item.sconto_tipo === 'percentuale' ? ' selected' : '') + '>% (percentuale)</option>' +
                        '</select>' +
                    '</div>' +
                '</div>' +
            '</div>';

        var modal = ENI.UI.showModal({
            title: 'Sconto Articolo',
            body: body,
            footer:
                '<button class="btn btn-outline" data-modal-close>Annulla</button>' +
                '<button class="btn btn-primary" id="btn-applica-sconto">Applica</button>'
        });

        modal.querySelector('#btn-applica-sconto').addEventListener('click', function() {
            var valore = parseFloat(modal.querySelector('#sconto-valore').value) || 0;
            var tipo = modal.querySelector('#sconto-tipo').value;
            _carrello[idx].sconto = valore;
            _carrello[idx].sconto_tipo = tipo;
            _carrello[idx].totale_riga = _calcolaTotaleRiga(_carrello[idx]);
            ENI.UI.closeModal(modal);
            _renderCarrello();
            _renderRiepilogo();
            _refocusBarcode();
        });
    }

    // --- Form Aggiunta Manuale ---

    function _showFormManuale() {
        var body =
            '<form id="form-manuale">' +
                '<div class="form-group">' +
                    '<label class="form-label form-label-required">Nome Prodotto</label>' +
                    '<input type="text" class="form-input" id="man-nome" placeholder="Es: Servizio extra">' +
                '</div>' +
                '<div class="form-row">' +
                    '<div class="form-group">' +
                        '<label class="form-label form-label-required">Prezzo \u20AC</label>' +
                        '<input type="number" step="0.01" min="0.01" class="form-input" id="man-prezzo">' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label class="form-label">Quantit\u00E0</label>' +
                        '<input type="number" min="1" class="form-input" id="man-qty" value="1">' +
                    '</div>' +
                '</div>' +
                '<div class="form-group">' +
                    '<label class="form-label">Categoria</label>' +
                    '<select class="form-select" id="man-cat">' +
                        '<option value="Altro">Altro</option>' +
                        ENI.Config.CATEGORIE_MAGAZZINO.map(function(c) {
                            return '<option value="' + c + '">' + c + '</option>';
                        }).join('') +
                    '</select>' +
                '</div>' +
            '</form>';

        var modal = ENI.UI.showModal({
            title: '\u270F\uFE0F Aggiungi Articolo Manuale',
            body: body,
            footer:
                '<button class="btn btn-outline" data-modal-close>Annulla</button>' +
                '<button class="btn btn-primary" id="btn-add-manuale">Aggiungi</button>'
        });

        modal.querySelector('#man-nome').focus();

        modal.querySelector('#btn-add-manuale').addEventListener('click', function() {
            var nome = modal.querySelector('#man-nome').value.trim();
            var prezzo = parseFloat(modal.querySelector('#man-prezzo').value);
            var qty = parseInt(modal.querySelector('#man-qty').value, 10) || 1;
            var cat = modal.querySelector('#man-cat').value;

            if (!nome || isNaN(prezzo) || prezzo <= 0) {
                ENI.UI.warning('Inserisci nome e prezzo valido');
                return;
            }

            _carrello.push({
                prodotto_id: null,
                codice_prodotto: null,
                barcode: null,
                nome_prodotto: nome,
                categoria: cat,
                quantita: qty,
                prezzo_unitario: prezzo,
                sconto: 0,
                sconto_tipo: 'fisso',
                totale_riga: prezzo * qty
            });

            ENI.UI.closeModal(modal);
            _renderCarrello();
            _renderRiepilogo();
            _refocusBarcode();
        });
    }

    // --- Render Carrello ---

    function _renderCarrello() {
        var el = document.getElementById('pos-carrello');
        if (!el) return;

        if (_carrello.length === 0) {
            el.innerHTML =
                '<div class="empty-state" style="padding: var(--space-6) 0;">' +
                    '<div class="empty-state-icon">\u{1F6D2}</div>' +
                    '<p class="empty-state-text">Carrello vuoto</p>' +
                    '<p class="text-sm text-muted">Scansiona un barcode o cerca un prodotto</p>' +
                '</div>';
            return;
        }

        var html = '<div class="table-wrapper"><table class="table pos-cart-table">' +
            '<thead><tr>' +
                '<th>Prodotto</th>' +
                '<th style="text-align: center;">Qty</th>' +
                '<th style="text-align: right;">Prezzo</th>' +
                '<th style="text-align: right;">Totale</th>' +
                '<th></th>' +
            '</tr></thead><tbody>';

        _carrello.forEach(function(item, idx) {
            var hasSconto = item.sconto > 0;
            html += '<tr>' +
                '<td>' +
                    '<strong>' + ENI.UI.escapeHtml(item.nome_prodotto) + '</strong>' +
                    (hasSconto ? '<br><span class="text-xs" style="color: var(--color-success);">Sconto: ' +
                        (item.sconto_tipo === 'percentuale' ? item.sconto + '%' : ENI.UI.formatValuta(item.sconto)) +
                    '</span>' : '') +
                '</td>' +
                '<td style="text-align: center;">' +
                    '<div class="pos-qty-controls">' +
                        '<button class="btn btn-sm btn-outline" data-cart-action="remove" data-cart-index="' + idx + '">-</button>' +
                        '<span class="pos-qty-value">' + item.quantita + '</span>' +
                        '<button class="btn btn-sm btn-outline" data-cart-action="add" data-cart-index="' + idx + '">+</button>' +
                    '</div>' +
                '</td>' +
                '<td style="text-align: right;" class="text-sm">' + ENI.UI.formatValuta(item.prezzo_unitario) + '</td>' +
                '<td style="text-align: right;"><strong>' + ENI.UI.formatValuta(item.totale_riga) + '</strong></td>' +
                '<td style="text-align: right;">' +
                    '<button class="btn btn-sm btn-outline" data-cart-action="sconto" data-cart-index="' + idx + '" title="Sconto">%</button>' +
                    '<button class="btn btn-sm btn-outline" data-cart-action="delete" data-cart-index="' + idx + '" title="Rimuovi" style="color: var(--color-danger); margin-left: 4px;">\u2715</button>' +
                '</td>' +
            '</tr>';
        });

        html += '</tbody></table></div>';
        el.innerHTML = html;
    }

    // --- Render Riepilogo e Pagamento ---

    function _renderRiepilogo() {
        var el = document.getElementById('pos-riepilogo');
        if (!el) return;

        var totali = _calcolaTotali();

        var html =
            '<div class="pos-summary">' +
                '<div class="pos-summary-row">' +
                    '<span>Subtotale</span>' +
                    '<span>' + ENI.UI.formatValuta(totali.subtotale) + '</span>' +
                '</div>';

        if (totali.scontoGlobaleCalcolato > 0) {
            html += '<div class="pos-summary-row" style="color: var(--color-success);">' +
                '<span>Sconto globale</span>' +
                '<span>-' + ENI.UI.formatValuta(totali.scontoGlobaleCalcolato) + '</span>' +
            '</div>';
        }

        html += '<div class="pos-summary-divider"></div>' +
            '<div class="pos-totale">' +
                '<span>TOTALE</span>' +
                '<span>' + ENI.UI.formatValuta(totali.totale) + '</span>' +
            '</div>' +
            '<div class="pos-summary-row text-sm text-muted">' +
                '<span>Articoli: ' + totali.numArticoli + '</span>' +
                '<span>Pezzi: ' + totali.numPezzi + '</span>' +
            '</div>' +
            '</div>';

        // Bottone sconto globale
        html += '<div style="margin: var(--space-3) 0;">' +
            '<button class="btn btn-sm btn-outline" id="btn-sconto-globale" style="width: 100%;">' +
                '\u{1F3F7}\uFE0F Sconto Globale' +
                (_scontoGlobale > 0 ? ' (' + (_scontoGlobaleTipo === 'percentuale' ? _scontoGlobale + '%' : ENI.UI.formatValuta(_scontoGlobale)) + ')' : '') +
            '</button>' +
        '</div>';

        // Bottoni pagamento
        html += '<div class="pos-pay-buttons">' +
            '<button class="btn pos-pay-btn pos-pay-contanti" id="btn-pay-contanti"' + (_carrello.length === 0 ? ' disabled' : '') + '>' +
                '\u{1F4B5} Contanti</button>' +
            '<button class="btn pos-pay-btn pos-pay-pos" id="btn-pay-pos"' + (_carrello.length === 0 ? ' disabled' : '') + '>' +
                '\u{1F4B3} POS / Carta</button>' +
            '<button class="btn pos-pay-btn pos-pay-misto" id="btn-pay-misto"' + (_carrello.length === 0 ? ' disabled' : '') + '>' +
                '\u{1F4B0} Misto</button>' +
            '<button class="btn pos-pay-btn pos-pay-buono" id="btn-pay-buono"' + (_carrello.length === 0 ? ' disabled' : '') + '>' +
                '\u{1F3AB} Buono</button>' +
            '<button class="btn pos-pay-btn pos-pay-wallet" id="btn-pay-wallet"' + (_carrello.length === 0 ? ' disabled' : '') + '>' +
                '\u{1F4F1} Wallet Cliente</button>' +
        '</div>';

        el.innerHTML = html;

        // Events
        var btnScontoGlobale = document.getElementById('btn-sconto-globale');
        if (btnScontoGlobale) {
            btnScontoGlobale.addEventListener('click', _showScontoGlobale);
        }

        var btnContanti = document.getElementById('btn-pay-contanti');
        if (btnContanti) btnContanti.addEventListener('click', function() { _avviaPagamento('contanti'); });

        var btnPOS = document.getElementById('btn-pay-pos');
        if (btnPOS) btnPOS.addEventListener('click', function() { _avviaPagamento('pos'); });

        var btnMisto = document.getElementById('btn-pay-misto');
        if (btnMisto) btnMisto.addEventListener('click', function() { _avviaPagamento('misto'); });

        var btnBuono = document.getElementById('btn-pay-buono');
        if (btnBuono) btnBuono.addEventListener('click', function() { _avviaPagamento('buono'); });

        var btnWallet = document.getElementById('btn-pay-wallet');
        if (btnWallet) btnWallet.addEventListener('click', function() { _avviaPagamento('wallet'); });
    }

    function _calcolaTotali() {
        var subtotale = 0;
        var numPezzi = 0;
        _carrello.forEach(function(item) {
            subtotale += item.totale_riga;
            numPezzi += item.quantita;
        });

        var scontoGlobaleCalcolato = 0;
        if (_scontoGlobaleTipo === 'percentuale') {
            scontoGlobaleCalcolato = subtotale * (_scontoGlobale / 100);
        } else {
            scontoGlobaleCalcolato = _scontoGlobale;
        }

        var totale = Math.max(0, subtotale - scontoGlobaleCalcolato);

        return {
            subtotale: Math.round(subtotale * 100) / 100,
            scontoGlobaleCalcolato: Math.round(scontoGlobaleCalcolato * 100) / 100,
            totale: Math.round(totale * 100) / 100,
            numArticoli: _carrello.length,
            numPezzi: numPezzi
        };
    }

    // --- Sconto Globale ---

    function _showScontoGlobale() {
        var body =
            '<div class="form-group">' +
                '<label class="form-label">Sconto sull\'intero scontrino</label>' +
                '<div class="form-row">' +
                    '<div class="form-group">' +
                        '<input type="number" step="0.01" min="0" class="form-input" id="sconto-glob-valore" value="' + _scontoGlobale + '">' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<select class="form-select" id="sconto-glob-tipo">' +
                            '<option value="fisso"' + (_scontoGlobaleTipo === 'fisso' ? ' selected' : '') + '>\u20AC (fisso)</option>' +
                            '<option value="percentuale"' + (_scontoGlobaleTipo === 'percentuale' ? ' selected' : '') + '>% (percentuale)</option>' +
                        '</select>' +
                    '</div>' +
                '</div>' +
            '</div>';

        var modal = ENI.UI.showModal({
            title: '\u{1F3F7}\uFE0F Sconto Globale',
            body: body,
            footer:
                '<button class="btn btn-outline" id="btn-rimuovi-sconto">Rimuovi sconto</button>' +
                '<button class="btn btn-primary" id="btn-applica-sconto-glob">Applica</button>'
        });

        modal.querySelector('#btn-applica-sconto-glob').addEventListener('click', function() {
            _scontoGlobale = parseFloat(modal.querySelector('#sconto-glob-valore').value) || 0;
            _scontoGlobaleTipo = modal.querySelector('#sconto-glob-tipo').value;
            ENI.UI.closeModal(modal);
            _renderRiepilogo();
            _refocusBarcode();
        });

        modal.querySelector('#btn-rimuovi-sconto').addEventListener('click', function() {
            _scontoGlobale = 0;
            _scontoGlobaleTipo = 'fisso';
            ENI.UI.closeModal(modal);
            _renderRiepilogo();
            _refocusBarcode();
        });
    }

    // ============================================================
    // PAGAMENTO
    // ============================================================

    function _avviaPagamento(metodo) {
        if (_carrello.length === 0) return;
        var totali = _calcolaTotali();

        if (metodo === 'contanti') {
            _pagamentoContanti(totali);
        } else if (metodo === 'pos') {
            _pagamentoPOS(totali);
        } else if (metodo === 'misto') {
            _pagamentoMisto(totali);
        } else if (metodo === 'buono') {
            _pagamentoBuonoScan(totali);
        } else if (metodo === 'wallet') {
            _pagamentoWallet(totali);
        }
    }

    // --- Scansione buono dal POS barcode ---

    async function _processVoucherScan(ean) {
        try {
            var buono = await ENI.API.cercaBuonoByEAN(ean);
            if (!buono) {
                ENI.UI.warning('Buono non trovato: ' + ean);
                return;
            }
            if (buono.stato !== 'attivo') {
                ENI.UI.warning('Buono gia ' + buono.stato + ': ' + ean);
                return;
            }

            // Se il carrello e' vuoto, avvisa
            if (_carrello.length === 0) {
                ENI.UI.info('Buono ' + ENI.UI.formatValuta(buono.taglio) + ' riconosciuto. Aggiungi prodotti al carrello prima di pagare.');
                return;
            }

            // Procedi con pagamento buono
            _pagamentoBuonoConDati(buono);
        } catch(e) {
            ENI.UI.error('Errore verifica buono: ' + e.message);
        }
    }

    // --- Pagamento Buono (scansione manuale da bottone) ---

    function _pagamentoBuonoScan(totali) {
        var body =
            '<div style="text-align: center; margin-bottom: var(--space-4);">' +
                '<div class="text-sm text-muted">Totale da pagare</div>' +
                '<div style="font-size: 2rem; font-weight: bold; color: var(--color-primary);">' + ENI.UI.formatValuta(totali.totale) + '</div>' +
            '</div>' +
            '<div class="form-group">' +
                '<label class="form-label form-label-required">Scansiona o inserisci codice EAN del buono</label>' +
                '<input type="text" class="form-input" id="buono-ean-input" placeholder="Codice EAN 13 cifre" style="font-size: 1.25rem; text-align: center; font-weight: bold;">' +
            '</div>' +
            '<div id="buono-info" style="text-align: center; margin-top: var(--space-3);"></div>';

        var modal = ENI.UI.showModal({
            title: '\u{1F3AB} Pagamento con Buono',
            body: body,
            footer:
                '<button class="btn btn-outline" data-modal-close>Annulla</button>' +
                '<button class="btn btn-primary" id="btn-verifica-buono">Verifica Buono</button>'
        });

        modal.querySelector('#buono-ean-input').focus();

        modal.querySelector('#buono-ean-input').addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                modal.querySelector('#btn-verifica-buono').click();
            }
        });

        modal.querySelector('#btn-verifica-buono').addEventListener('click', async function() {
            var ean = modal.querySelector('#buono-ean-input').value.trim();
            if (!ean) {
                ENI.UI.warning('Inserisci il codice EAN');
                return;
            }

            try {
                var buono = await ENI.API.cercaBuonoByEAN(ean);
                if (!buono) {
                    modal.querySelector('#buono-info').innerHTML = '<span style="color: var(--color-danger); font-weight: 600;">Buono non trovato</span>';
                    return;
                }
                if (buono.stato !== 'attivo') {
                    modal.querySelector('#buono-info').innerHTML = '<span style="color: var(--color-danger); font-weight: 600;">Buono gia ' + buono.stato + '</span>';
                    return;
                }

                ENI.UI.closeModal(modal);
                _pagamentoBuonoConDati(buono);
            } catch(e) {
                ENI.UI.error('Errore: ' + e.message);
            }
        });
    }

    function _pagamentoBuonoConDati(buono) {
        var totali = _calcolaTotali();
        var taglio = parseFloat(buono.taglio);

        if (taglio >= totali.totale) {
            // Buono copre tutto
            var resto = Math.round((taglio - totali.totale) * 100) / 100;
            var msg = 'Buono da ' + ENI.UI.formatValuta(taglio) + ' per un totale di ' + ENI.UI.formatValuta(totali.totale);
            if (resto > 0) {
                msg += '.\nResto in contanti: ' + ENI.UI.formatValuta(resto);
            }

            ENI.UI.confirm(msg, function() {
                _completaVendita('buono_cartaceo', 0, 0, resto, { id: buono.id, taglio: taglio, ean: buono.codice_ean }, null);
            });
        } else {
            // Buono non copre tutto: pagamento misto
            var differenza = Math.round((totali.totale - taglio) * 100) / 100;
            var body =
                '<div style="text-align: center; margin-bottom: var(--space-4);">' +
                    '<div class="text-sm text-muted">Totale da pagare</div>' +
                    '<div style="font-size: 2rem; font-weight: bold; color: var(--color-primary);">' + ENI.UI.formatValuta(totali.totale) + '</div>' +
                    '<div style="margin-top: var(--space-2);">' +
                        '<span class="badge badge-info">Buono: ' + ENI.UI.formatValuta(taglio) + '</span> ' +
                        '<span class="badge badge-warning">Residuo: ' + ENI.UI.formatValuta(differenza) + '</span>' +
                    '</div>' +
                '</div>' +
                '<div class="form-group">' +
                    '<label class="form-label">Come pagare il residuo di ' + ENI.UI.formatValuta(differenza) + '?</label>' +
                    '<div style="display: flex; gap: var(--space-2); margin-top: var(--space-2);">' +
                        '<button class="btn btn-outline" id="buono-resto-contanti" style="flex: 1;">Contanti</button>' +
                        '<button class="btn btn-outline" id="buono-resto-pos" style="flex: 1;">POS / Carta</button>' +
                    '</div>' +
                '</div>';

            var modal = ENI.UI.showModal({
                title: '\u{1F3AB} Buono + Altro',
                body: body,
                footer: '<button class="btn btn-outline" data-modal-close>Annulla</button>'
            });

            modal.querySelector('#buono-resto-contanti').addEventListener('click', function() {
                ENI.UI.closeModal(modal);
                _completaVendita('buono_cartaceo_misto', differenza, 0, 0, { id: buono.id, taglio: taglio, ean: buono.codice_ean }, null);
            });

            modal.querySelector('#buono-resto-pos').addEventListener('click', function() {
                ENI.UI.closeModal(modal);
                _completaVendita('buono_cartaceo_misto', 0, differenza, 0, { id: buono.id, taglio: taglio, ean: buono.codice_ean }, null);
            });
        }
    }

    // --- Pagamento Wallet Digitale ---

    function _pagamentoWallet(totali) {
        var body =
            '<div style="text-align: center; margin-bottom: var(--space-4);">' +
                '<div class="text-sm text-muted">Totale da pagare</div>' +
                '<div style="font-size: 2rem; font-weight: bold; color: var(--color-primary);">' + ENI.UI.formatValuta(totali.totale) + '</div>' +
            '</div>' +
            '<div class="form-group">' +
                '<label class="form-label form-label-required">Cerca cliente per nome o email</label>' +
                '<input type="text" class="form-input" id="wallet-search-input" placeholder="Nome o email del cliente...">' +
            '</div>' +
            '<div id="wallet-search-results" style="margin-top: var(--space-2);"></div>';

        var modal = ENI.UI.showModal({
            title: '\u{1F4F1} Pagamento Wallet',
            body: body,
            footer: '<button class="btn btn-outline" data-modal-close>Annulla</button>'
        });

        var searchInput = modal.querySelector('#wallet-search-input');
        var resultsEl = modal.querySelector('#wallet-search-results');
        var debounce = null;
        searchInput.focus();

        searchInput.addEventListener('input', function() {
            clearTimeout(debounce);
            var term = searchInput.value.trim();
            if (term.length < 2) { resultsEl.innerHTML = ''; return; }
            debounce = setTimeout(async function() {
                try {
                    var clienti = await ENI.API.getClientiPortale({ search: term, attivo: true });
                    if (clienti.length === 0) {
                        resultsEl.innerHTML = '<p class="text-muted">Nessun cliente trovato</p>';
                        return;
                    }
                    var html = '';
                    clienti.forEach(function(c) {
                        var saldoOk = c.saldo >= totali.totale;
                        html += '<div class="wallet-search-item" data-cliente-id="' + c.id + '" ' +
                            'data-nome="' + ENI.UI.escapeHtml(c.nome_display) + '" data-saldo="' + c.saldo + '" ' +
                            'style="padding: var(--space-2); border: 1px solid var(--color-border); border-radius: var(--radius-md); margin-bottom: var(--space-1); cursor: pointer; display: flex; justify-content: space-between; align-items: center;">' +
                            '<div><strong>' + ENI.UI.escapeHtml(c.nome_display) + '</strong><br><span class="text-sm text-muted">' + ENI.UI.escapeHtml(c.email) + '</span></div>' +
                            '<div style="text-align: right;"><div style="font-weight: 600; color: ' + (saldoOk ? 'var(--color-success)' : 'var(--color-danger)') + ';">' + ENI.UI.formatValuta(c.saldo) + '</div>' +
                            (saldoOk ? '' : '<div class="text-sm text-danger">Saldo insufficiente</div>') +
                            '</div></div>';
                    });
                    resultsEl.innerHTML = html;

                    // Click handler per selezione
                    resultsEl.querySelectorAll('.wallet-search-item').forEach(function(item) {
                        item.addEventListener('click', function() {
                            var cId = item.dataset.clienteId;
                            var cNome = item.dataset.nome;
                            var cSaldo = parseFloat(item.dataset.saldo);
                            ENI.UI.closeModal(modal);
                            _processWalletPayment(cId, cNome, cSaldo, totali);
                        });
                    });
                } catch(e) {
                    resultsEl.innerHTML = '<p class="text-danger">Errore ricerca</p>';
                }
            }, 300);
        });
    }

    function _processWalletPayment(clienteId, nome, saldo, totali) {
        if (saldo >= totali.totale) {
            // Saldo sufficiente
            ENI.UI.confirm(
                'Scalare ' + ENI.UI.formatValuta(totali.totale) + ' dal wallet di ' + nome + '?\n' +
                'Saldo attuale: ' + ENI.UI.formatValuta(saldo) + '\n' +
                'Saldo dopo: ' + ENI.UI.formatValuta(saldo - totali.totale),
                function() {
                    _completaVendita('wallet_digitale', 0, 0, 0, null, { clientePortaleId: clienteId, importo: totali.totale, nome: nome });
                }
            );
        } else {
            // Saldo insufficiente: pagamento misto
            var differenza = Math.round((totali.totale - saldo) * 100) / 100;
            var body =
                '<div style="text-align: center; margin-bottom: var(--space-4);">' +
                    '<div class="text-sm text-muted">Totale da pagare</div>' +
                    '<div style="font-size: 2rem; font-weight: bold; color: var(--color-primary);">' + ENI.UI.formatValuta(totali.totale) + '</div>' +
                    '<div style="margin-top: var(--space-2);">' +
                        '<span class="badge badge-info">Wallet (' + ENI.UI.escapeHtml(nome) + '): ' + ENI.UI.formatValuta(saldo) + '</span> ' +
                        '<span class="badge badge-warning">Residuo: ' + ENI.UI.formatValuta(differenza) + '</span>' +
                    '</div>' +
                '</div>' +
                '<div class="form-group">' +
                    '<label class="form-label">Come pagare il residuo di ' + ENI.UI.formatValuta(differenza) + '?</label>' +
                    '<div style="display: flex; gap: var(--space-2); margin-top: var(--space-2);">' +
                        '<button class="btn btn-outline" id="wallet-resto-contanti" style="flex: 1;">Contanti</button>' +
                        '<button class="btn btn-outline" id="wallet-resto-pos" style="flex: 1;">POS / Carta</button>' +
                    '</div>' +
                '</div>';

            var modal = ENI.UI.showModal({
                title: '\u{1F4F1} Wallet + Altro',
                body: body,
                footer: '<button class="btn btn-outline" data-modal-close>Annulla</button>'
            });

            modal.querySelector('#wallet-resto-contanti').addEventListener('click', function() {
                ENI.UI.closeModal(modal);
                _completaVendita('wallet_misto', differenza, 0, 0, null, { clientePortaleId: clienteId, importo: saldo, nome: nome });
            });

            modal.querySelector('#wallet-resto-pos').addEventListener('click', function() {
                ENI.UI.closeModal(modal);
                _completaVendita('wallet_misto', 0, differenza, 0, null, { clientePortaleId: clienteId, importo: saldo, nome: nome });
            });
        }
    }

    function _pagamentoContanti(totali) {
        var body =
            '<div style="text-align: center; margin-bottom: var(--space-4);">' +
                '<div class="text-sm text-muted">Totale da pagare</div>' +
                '<div style="font-size: 2rem; font-weight: bold; color: var(--color-primary);">' + ENI.UI.formatValuta(totali.totale) + '</div>' +
            '</div>' +
            '<div class="form-group">' +
                '<label class="form-label form-label-required">Importo ricevuto \u20AC</label>' +
                '<input type="number" step="0.01" min="0" class="form-input" id="pay-ricevuto" style="font-size: 1.25rem; text-align: center;">' +
            '</div>' +
            '<div id="pay-resto" style="text-align: center; font-size: 1.5rem; font-weight: bold; margin-top: var(--space-3);"></div>';

        var modal = ENI.UI.showModal({
            title: '\u{1F4B5} Pagamento Contanti',
            body: body,
            footer:
                '<button class="btn btn-outline" data-modal-close>Annulla</button>' +
                '<button class="btn btn-primary" id="btn-conferma-pay" disabled>Conferma Pagamento</button>'
        });

        var inputRicevuto = modal.querySelector('#pay-ricevuto');
        var restoEl = modal.querySelector('#pay-resto');
        var btnConferma = modal.querySelector('#btn-conferma-pay');

        inputRicevuto.focus();

        inputRicevuto.addEventListener('input', function() {
            var ricevuto = parseFloat(inputRicevuto.value) || 0;
            var resto = ricevuto - totali.totale;

            if (ricevuto >= totali.totale) {
                restoEl.innerHTML = 'Resto: <span style="color: var(--color-success);">' + ENI.UI.formatValuta(resto) + '</span>';
                btnConferma.disabled = false;
            } else {
                restoEl.innerHTML = '<span style="color: var(--color-danger);">Importo insufficiente</span>';
                btnConferma.disabled = true;
            }
        });

        inputRicevuto.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !btnConferma.disabled) {
                btnConferma.click();
            }
        });

        btnConferma.addEventListener('click', function() {
            var ricevuto = parseFloat(inputRicevuto.value) || 0;
            var resto = Math.round((ricevuto - totali.totale) * 100) / 100;
            ENI.UI.closeModal(modal);
            _completaVendita('contanti', totali.totale, 0, resto);
        });
    }

    function _pagamentoPOS(totali) {
        ENI.UI.confirm(
            'Confermi pagamento POS di ' + ENI.UI.formatValuta(totali.totale) + '?',
            function() {
                _completaVendita('pos', 0, totali.totale, 0);
            }
        );
    }

    function _pagamentoMisto(totali) {
        var body =
            '<div style="text-align: center; margin-bottom: var(--space-4);">' +
                '<div class="text-sm text-muted">Totale da pagare</div>' +
                '<div style="font-size: 2rem; font-weight: bold; color: var(--color-primary);">' + ENI.UI.formatValuta(totali.totale) + '</div>' +
            '</div>' +
            '<div class="form-row">' +
                '<div class="form-group">' +
                    '<label class="form-label">\u{1F4B5} Contanti \u20AC</label>' +
                    '<input type="number" step="0.01" min="0" class="form-input" id="mix-contanti" value="0">' +
                '</div>' +
                '<div class="form-group">' +
                    '<label class="form-label">\u{1F4B3} POS \u20AC</label>' +
                    '<input type="number" step="0.01" min="0" class="form-input" id="mix-pos" value="0">' +
                '</div>' +
            '</div>' +
            '<div id="mix-status" style="text-align: center; margin-top: var(--space-3);"></div>';

        var modal = ENI.UI.showModal({
            title: '\u{1F4B0} Pagamento Misto',
            body: body,
            footer:
                '<button class="btn btn-outline" data-modal-close>Annulla</button>' +
                '<button class="btn btn-primary" id="btn-conferma-mix" disabled>Conferma</button>'
        });

        var inputContanti = modal.querySelector('#mix-contanti');
        var inputPOS = modal.querySelector('#mix-pos');
        var statusEl = modal.querySelector('#mix-status');
        var btnConferma = modal.querySelector('#btn-conferma-mix');

        function _updateMixStatus() {
            var contanti = parseFloat(inputContanti.value) || 0;
            var pos = parseFloat(inputPOS.value) || 0;
            var somma = Math.round((contanti + pos) * 100) / 100;
            var diff = Math.round((somma - totali.totale) * 100) / 100;

            if (Math.abs(diff) < 0.01) {
                statusEl.innerHTML = '<span style="color: var(--color-success);">\u2705 Importi corretti</span>';
                btnConferma.disabled = false;
            } else if (diff > 0) {
                statusEl.innerHTML = 'Eccedenza: ' + ENI.UI.formatValuta(diff);
                btnConferma.disabled = false;
            } else {
                statusEl.innerHTML = '<span style="color: var(--color-danger);">Mancano: ' + ENI.UI.formatValuta(Math.abs(diff)) + '</span>';
                btnConferma.disabled = true;
            }
        }

        inputContanti.addEventListener('input', _updateMixStatus);
        inputPOS.addEventListener('input', _updateMixStatus);

        btnConferma.addEventListener('click', function() {
            var contanti = parseFloat(inputContanti.value) || 0;
            var pos = parseFloat(inputPOS.value) || 0;
            var somma = Math.round((contanti + pos) * 100) / 100;
            var resto = Math.max(0, Math.round((somma - totali.totale) * 100) / 100);
            ENI.UI.closeModal(modal);
            _completaVendita('misto', contanti, pos, resto);
        });
    }

    // --- Completa vendita ---

    async function _completaVendita(metodo, importoContanti, importoPOS, resto, buonoData, walletData) {
        var totali = _calcolaTotali();

        var vendita = {
            data: ENI.UI.oggiISO(),
            ora: new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            subtotale: totali.subtotale,
            sconto_globale: _scontoGlobale,
            sconto_globale_tipo: _scontoGlobaleTipo,
            totale: totali.totale,
            metodo_pagamento: metodo,
            importo_contanti: importoContanti,
            importo_pos: importoPOS,
            importo_buono: buonoData ? buonoData.taglio : 0,
            buono_cartaceo_id: buonoData ? buonoData.id : null,
            importo_wallet: walletData ? walletData.importo : 0,
            cliente_portale_id: walletData ? walletData.clientePortaleId : null,
            resto: resto,
            stato: 'completata'
        };

        var dettagli = _carrello.map(function(item) {
            return {
                prodotto_id: item.prodotto_id,
                codice_prodotto: item.codice_prodotto,
                barcode: item.barcode,
                nome_prodotto: item.nome_prodotto,
                categoria: item.categoria,
                quantita: item.quantita,
                prezzo_unitario: item.prezzo_unitario,
                sconto: item.sconto,
                sconto_tipo: item.sconto_tipo,
                totale_riga: item.totale_riga
            };
        });

        try {
            var record = await ENI.API.salvaVendita(vendita, dettagli);

            // Marca buono come utilizzato
            if (buonoData && buonoData.id) {
                try {
                    await ENI.API.utilizzaBuono(buonoData.id, record.id);
                } catch(e2) {
                    console.error('Errore marcatura buono:', e2);
                }
            }

            // Deduci saldo wallet
            if (walletData && walletData.clientePortaleId) {
                try {
                    await ENI.API.deduciSaldoCliente(
                        walletData.clientePortaleId,
                        walletData.importo,
                        'Vendita ' + record.codice,
                        'vendita',
                        record.id
                    );
                } catch(e2) {
                    console.error('Errore deduzione wallet:', e2);
                }
            }

            ENI.UI.success('Vendita ' + record.codice + ' completata! Totale: ' + ENI.UI.formatValuta(totali.totale));

            // Chiedi se stampare
            _showPostVendita(record, vendita, dettagli, resto);

            // Reset carrello
            _carrello = [];
            _scontoGlobale = 0;
            _scontoGlobaleTipo = 'fisso';
            _renderCarrello();
            _renderRiepilogo();

        } catch(e) {
            ENI.UI.error('Errore salvataggio vendita: ' + e.message);
        }
    }

    function _showPostVendita(record, vendita, dettagli, resto) {
        var body =
            '<div style="text-align: center;">' +
                '<div style="font-size: 48px; margin-bottom: var(--space-3);">\u2705</div>' +
                '<div class="text-lg font-bold">Vendita ' + record.codice + '</div>' +
                '<div style="font-size: 2rem; font-weight: bold; color: var(--color-primary); margin: var(--space-3) 0;">' +
                    ENI.UI.formatValuta(vendita.totale) +
                '</div>' +
                (resto > 0 ? '<div class="text-lg">Resto: <strong>' + ENI.UI.formatValuta(resto) + '</strong></div>' : '') +
            '</div>';

        var modal = ENI.UI.showModal({
            title: 'Vendita Completata',
            body: body,
            footer:
                '<button class="btn btn-outline" data-modal-close>Chiudi</button>' +
                '<button class="btn btn-primary" id="btn-stampa-scontrino">\u{1F5A8}\uFE0F Stampa Scontrino</button>'
        });

        modal.querySelector('#btn-stampa-scontrino').addEventListener('click', function() {
            _stampaScontrino(record, vendita, dettagli, resto);
        });
    }

    // ============================================================
    // STAMPA SCONTRINO
    // ============================================================

    function _stampaScontrino(record, vendita, dettagli, resto) {
        var receiptEl = document.getElementById('receipt-print');
        if (!receiptEl) return;

        var now = new Date();

        var html =
            '<div class="receipt-header">' +
                '<div class="receipt-title">TITANWASH</div>' +
                '<div>Borgo Maggiore - San Marino</div>' +
                '<div>' + now.toLocaleDateString('it-IT') + ' ' + now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) + '</div>' +
                '<div>Op: ' + (ENI.State.getUserName() || '-') + '</div>' +
            '</div>' +
            '<div class="receipt-divider"></div>';

        // Righe articoli
        dettagli.forEach(function(d) {
            html += '<div class="receipt-item">' +
                '<div>' + d.nome_prodotto + '</div>' +
                '<div class="receipt-item-detail">' +
                    d.quantita + ' x ' + Number(d.prezzo_unitario).toFixed(2);
            if (d.sconto > 0) {
                html += ' sc.' + (d.sconto_tipo === 'percentuale' ? d.sconto + '%' : Number(d.sconto).toFixed(2));
            }
            html += '<span style="float: right;">' + Number(d.totale_riga).toFixed(2) + '</span>' +
                '</div>' +
            '</div>';
        });

        html += '<div class="receipt-divider"></div>';

        // Totali
        html += '<div class="receipt-totals">';
        if (vendita.sconto_globale > 0) {
            html += '<div>Subtotale: ' + Number(vendita.subtotale).toFixed(2) + '</div>';
            html += '<div>Sconto: -' + Number(vendita.sconto_globale).toFixed(2) +
                (vendita.sconto_globale_tipo === 'percentuale' ? '%' : '') + '</div>';
        }
        html += '<div class="receipt-total">TOTALE EUR ' + Number(vendita.totale).toFixed(2) + '</div>';

        // Pagamento
        var metodoLabel = { contanti: 'Contanti', pos: 'POS/Carta', misto: 'Misto' };
        html += '<div>Pagamento: ' + (metodoLabel[vendita.metodo_pagamento] || vendita.metodo_pagamento) + '</div>';
        if (vendita.metodo_pagamento === 'contanti' || vendita.metodo_pagamento === 'misto') {
            if (vendita.importo_contanti > 0) html += '<div>Contanti: ' + Number(vendita.importo_contanti).toFixed(2) + '</div>';
            if (vendita.importo_pos > 0) html += '<div>POS: ' + Number(vendita.importo_pos).toFixed(2) + '</div>';
            if (resto > 0) html += '<div>Resto: ' + Number(resto).toFixed(2) + '</div>';
        }
        html += '</div>';

        html += '<div class="receipt-divider"></div>' +
            '<div class="receipt-footer">' +
                '<div>Grazie e arrivederci!</div>' +
                '<div>' + record.codice + '</div>' +
            '</div>';

        receiptEl.innerHTML = html;
        receiptEl.style.display = 'block';

        window.print();

        setTimeout(function() {
            receiptEl.style.display = 'none';
        }, 1000);
    }

    // ============================================================
    // TAB: STORICO VENDITE
    // ============================================================

    async function _renderStorico(container) {
        var oggi = ENI.UI.oggiISO();

        container.innerHTML =
            '<div class="filter-bar">' +
                '<div class="form-row" style="align-items: flex-end;">' +
                    '<div class="form-group">' +
                        '<label class="form-label text-sm">Da</label>' +
                        '<input type="date" class="form-input" id="storico-da" value="' + oggi + '">' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label class="form-label text-sm">A</label>' +
                        '<input type="date" class="form-input" id="storico-a" value="' + oggi + '">' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<button class="btn btn-primary" id="btn-storico-cerca">\u{1F50D} Cerca</button>' +
                    '</div>' +
                '</div>' +
            '</div>' +
            '<div id="storico-totali" style="margin-bottom: var(--space-3);"></div>' +
            '<div id="storico-list"></div>';

        document.getElementById('btn-storico-cerca').addEventListener('click', function() {
            _loadStorico();
        });

        await _loadStorico();
    }

    async function _loadStorico() {
        var da = document.getElementById('storico-da').value;
        var a = document.getElementById('storico-a').value;
        var listEl = document.getElementById('storico-list');
        var totaliEl = document.getElementById('storico-totali');

        try {
            var vendite = await ENI.API.getVendite({ da: da, a: a });

            // Totali riassuntivi
            var totVendite = 0, totContanti = 0, totPOS = 0;
            vendite.forEach(function(v) {
                if (v.stato === 'completata') {
                    totVendite += Number(v.totale || 0);
                    totContanti += Number(v.importo_contanti || 0);
                    totPOS += Number(v.importo_pos || 0);
                }
            });

            if (totaliEl) {
                totaliEl.innerHTML =
                    '<div style="display: flex; gap: var(--space-3); flex-wrap: wrap;">' +
                        '<span class="badge">\u{1F4B0} Totale: ' + ENI.UI.formatValuta(totVendite) + '</span>' +
                        '<span class="badge">\u{1F4B5} Contanti: ' + ENI.UI.formatValuta(totContanti) + '</span>' +
                        '<span class="badge">\u{1F4B3} POS: ' + ENI.UI.formatValuta(totPOS) + '</span>' +
                        '<span class="badge">\u{1F4CB} Vendite: ' + vendite.filter(function(v) { return v.stato === 'completata'; }).length + '</span>' +
                    '</div>';
            }

            if (vendite.length === 0) {
                listEl.innerHTML =
                    '<div class="empty-state">' +
                        '<div class="empty-state-icon">\u{1F4CB}</div>' +
                        '<p class="empty-state-text">Nessuna vendita nel periodo</p>' +
                    '</div>';
                return;
            }

            var html = '<div class="table-wrapper"><table class="table">' +
                '<thead><tr><th>Data/Ora</th><th>Codice</th><th>Operatore</th><th>Totale</th><th>Metodo</th><th>Stato</th><th>Azioni</th></tr></thead><tbody>';

            vendite.forEach(function(v) {
                var statoClass = '';
                var statoLabel = v.stato;
                if (v.stato === 'completata') { statoClass = 'badge-success'; statoLabel = 'Completata'; }
                else if (v.stato === 'annullata') { statoClass = 'badge-danger'; statoLabel = 'Annullata'; }
                else if (v.stato === 'reso_parziale') { statoClass = 'badge-warning'; statoLabel = 'Reso parziale'; }
                else if (v.stato === 'reso_totale') { statoClass = 'badge-danger'; statoLabel = 'Reso totale'; }

                var metodoIcon = v.metodo_pagamento === 'contanti' ? '\u{1F4B5}' : v.metodo_pagamento === 'pos' ? '\u{1F4B3}' : '\u{1F4B0}';

                html += '<tr>' +
                    '<td class="text-sm">' + v.data + ' ' + (v.ora || '') + '</td>' +
                    '<td><strong>' + v.codice + '</strong></td>' +
                    '<td class="text-sm">' + ENI.UI.escapeHtml(v.operatore_nome || '-') + '</td>' +
                    '<td><strong>' + ENI.UI.formatValuta(v.totale) + '</strong></td>' +
                    '<td>' + metodoIcon + '</td>' +
                    '<td><span class="badge ' + statoClass + '">' + statoLabel + '</span></td>' +
                    '<td>' +
                        '<button class="btn btn-sm btn-outline" data-view-vendita="' + v.id + '">Dettaglio</button>' +
                        (v.stato === 'completata' ? ' <button class="btn btn-sm btn-outline" data-reso-vendita="' + v.id + '" style="color: var(--color-warning);">Reso</button>' : '') +
                    '</td>' +
                '</tr>';
            });

            html += '</tbody></table></div>';
            listEl.innerHTML = html;

            // Events
            ENI.UI.delegate(listEl, 'click', '[data-view-vendita]', function(e, el) {
                _showDettaglioVendita(el.dataset.viewVendita);
            });

            ENI.UI.delegate(listEl, 'click', '[data-reso-vendita]', function(e, el) {
                _showFormReso(el.dataset.resoVendita);
            });

        } catch(e) {
            listEl.innerHTML = '<div class="text-center text-muted">Errore caricamento storico</div>';
            console.error(e);
        }
    }

    async function _showDettaglioVendita(venditaId) {
        try {
            var vendita = await ENI.API.getById('vendite', venditaId);
            var dettagli = await ENI.API.getVenditaDettaglio(venditaId);

            var body =
                '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3); margin-bottom: var(--space-4);">' +
                    '<div><span class="text-sm text-muted">Codice:</span> <strong>' + vendita.codice + '</strong></div>' +
                    '<div><span class="text-sm text-muted">Data:</span> ' + vendita.data + ' ' + (vendita.ora || '') + '</div>' +
                    '<div><span class="text-sm text-muted">Operatore:</span> ' + ENI.UI.escapeHtml(vendita.operatore_nome || '-') + '</div>' +
                    '<div><span class="text-sm text-muted">Metodo:</span> ' + vendita.metodo_pagamento + '</div>' +
                '</div>';

            body += '<table class="table"><thead><tr><th>Prodotto</th><th>Qty</th><th>Prezzo</th><th>Totale</th></tr></thead><tbody>';
            dettagli.forEach(function(d) {
                body += '<tr>' +
                    '<td>' + ENI.UI.escapeHtml(d.nome_prodotto) + '</td>' +
                    '<td>' + d.quantita + '</td>' +
                    '<td>' + ENI.UI.formatValuta(d.prezzo_unitario) + '</td>' +
                    '<td><strong>' + ENI.UI.formatValuta(d.totale_riga) + '</strong></td>' +
                '</tr>';
            });
            body += '</tbody></table>';

            body += '<div style="text-align: right; margin-top: var(--space-3); font-size: 1.25rem; font-weight: bold;">' +
                'Totale: ' + ENI.UI.formatValuta(vendita.totale) + '</div>';

            ENI.UI.showModal({
                title: 'Dettaglio Vendita ' + vendita.codice,
                body: body,
                size: 'large',
                footer: '<button class="btn btn-outline" data-modal-close>Chiudi</button>'
            });
        } catch(e) {
            ENI.UI.error('Errore caricamento dettaglio');
        }
    }

    // ============================================================
    // TAB: RESI
    // ============================================================

    async function _renderResi(container) {
        container.innerHTML =
            '<div class="filter-bar">' +
                '<p class="text-sm text-muted">Per effettuare un reso, vai nello Storico Vendite, seleziona la vendita e clicca "Reso".</p>' +
            '</div>' +
            '<div id="resi-list"></div>';

        await _loadResi(container);
    }

    async function _loadResi(container) {
        var listEl = document.getElementById('resi-list');
        try {
            var resi = await ENI.API.getAll('resi', {
                order: { col: 'created_at', asc: false },
                limit: 50
            });

            if (!resi || resi.length === 0) {
                listEl.innerHTML =
                    '<div class="empty-state">' +
                        '<div class="empty-state-icon">\u21A9\uFE0F</div>' +
                        '<p class="empty-state-text">Nessun reso effettuato</p>' +
                    '</div>';
                return;
            }

            var html = '<div class="table-wrapper"><table class="table">' +
                '<thead><tr><th>Data</th><th>Codice Reso</th><th>Vendita Orig.</th><th>Operatore</th><th>Totale Reso</th><th>Rimborso</th></tr></thead><tbody>';

            resi.forEach(function(r) {
                html += '<tr>' +
                    '<td class="text-sm">' + r.data + '</td>' +
                    '<td><strong>' + r.codice + '</strong></td>' +
                    '<td>' + (r.vendita_codice || '-') + '</td>' +
                    '<td class="text-sm">' + ENI.UI.escapeHtml(r.operatore_nome || '-') + '</td>' +
                    '<td><strong>' + ENI.UI.formatValuta(r.totale_reso) + '</strong></td>' +
                    '<td>' + r.metodo_rimborso + '</td>' +
                '</tr>';
            });

            html += '</tbody></table></div>';
            listEl.innerHTML = html;
        } catch(e) {
            listEl.innerHTML = '<div class="text-center text-muted">Errore caricamento resi</div>';
        }
    }

    // --- Form Reso ---

    async function _showFormReso(venditaId) {
        try {
            var vendita = await ENI.API.getById('vendite', venditaId);
            var dettagli = await ENI.API.getVenditaDettaglio(venditaId);
            var resiEsistenti = await ENI.API.getResiPerVendita(venditaId);

            // Calcola qty gia resa per ogni riga
            var qtyResa = {};
            resiEsistenti.forEach(function(r) {
                if (r.dettagli) {
                    r.dettagli.forEach(function(rd) {
                        qtyResa[rd.vendita_dettaglio_id] = (qtyResa[rd.vendita_dettaglio_id] || 0) + rd.quantita_resa;
                    });
                }
            });

            var body = '<p class="text-sm text-muted" style="margin-bottom: var(--space-3);">Seleziona gli articoli da rendere dalla vendita <strong>' + vendita.codice + '</strong></p>';

            body += '<table class="table"><thead><tr><th></th><th>Prodotto</th><th>Qty venduta</th><th>Gi\u00E0 resa</th><th>Qty da rendere</th><th>Riassortire</th></tr></thead><tbody>';

            dettagli.forEach(function(d, i) {
                var giaResa = qtyResa[d.id] || 0;
                var maxRendibile = d.quantita - giaResa;

                if (maxRendibile <= 0) {
                    body += '<tr style="opacity: 0.5;">' +
                        '<td><input type="checkbox" disabled></td>' +
                        '<td>' + ENI.UI.escapeHtml(d.nome_prodotto) + '</td>' +
                        '<td>' + d.quantita + '</td>' +
                        '<td>' + giaResa + '</td>' +
                        '<td>-</td>' +
                        '<td>-</td>' +
                    '</tr>';
                } else {
                    body += '<tr>' +
                        '<td><input type="checkbox" class="reso-check" data-idx="' + i + '" checked></td>' +
                        '<td>' + ENI.UI.escapeHtml(d.nome_prodotto) + '</td>' +
                        '<td>' + d.quantita + '</td>' +
                        '<td>' + giaResa + '</td>' +
                        '<td><input type="number" class="form-input reso-qty" data-idx="' + i + '" min="1" max="' + maxRendibile + '" value="' + maxRendibile + '" style="width: 70px;"></td>' +
                        '<td><input type="checkbox" class="reso-riassort" data-idx="' + i + '" checked></td>' +
                    '</tr>';
                }
            });

            body += '</tbody></table>';

            body += '<div class="form-row" style="margin-top: var(--space-3);">' +
                '<div class="form-group">' +
                    '<label class="form-label">Metodo rimborso</label>' +
                    '<select class="form-select" id="reso-metodo">' +
                        '<option value="contanti">Contanti</option>' +
                        '<option value="pos">POS</option>' +
                    '</select>' +
                '</div>' +
                '<div class="form-group">' +
                    '<label class="form-label">Note</label>' +
                    '<input type="text" class="form-input" id="reso-note" placeholder="Motivo del reso...">' +
                '</div>' +
            '</div>';

            var modal = ENI.UI.showModal({
                title: '\u21A9\uFE0F Reso per vendita ' + vendita.codice,
                body: body,
                size: 'large',
                footer:
                    '<button class="btn btn-outline" data-modal-close>Annulla</button>' +
                    '<button class="btn btn-primary" id="btn-conferma-reso">Conferma Reso</button>'
            });

            modal.querySelector('#btn-conferma-reso').addEventListener('click', async function() {
                var resoDettagli = [];
                var totaleReso = 0;

                modal.querySelectorAll('.reso-check:checked').forEach(function(cb) {
                    var idx = parseInt(cb.dataset.idx, 10);
                    var d = dettagli[idx];
                    var qtyInput = modal.querySelector('.reso-qty[data-idx="' + idx + '"]');
                    var riassortInput = modal.querySelector('.reso-riassort[data-idx="' + idx + '"]');

                    var qtyResa = parseInt(qtyInput.value, 10) || 1;
                    var importoRiga = d.prezzo_unitario * qtyResa;

                    resoDettagli.push({
                        vendita_dettaglio_id: d.id,
                        prodotto_id: d.prodotto_id,
                        nome_prodotto: d.nome_prodotto,
                        quantita_resa: qtyResa,
                        prezzo_unitario: d.prezzo_unitario,
                        totale_riga: importoRiga,
                        riassortito: riassortInput ? riassortInput.checked : true
                    });

                    totaleReso += importoRiga;
                });

                if (resoDettagli.length === 0) {
                    ENI.UI.warning('Seleziona almeno un articolo da rendere');
                    return;
                }

                var reso = {
                    vendita_id: vendita.id,
                    vendita_codice: vendita.codice,
                    totale_reso: Math.round(totaleReso * 100) / 100,
                    metodo_rimborso: modal.querySelector('#reso-metodo').value,
                    note: modal.querySelector('#reso-note').value.trim() || null
                };

                try {
                    var record = await ENI.API.salvaReso(reso, resoDettagli);
                    ENI.UI.closeModal(modal);
                    ENI.UI.success('Reso ' + record.codice + ' completato! Rimborso: ' + ENI.UI.formatValuta(reso.totale_reso));
                    _renderTab(); // Refresh current tab
                } catch(e) {
                    ENI.UI.error('Errore salvataggio reso: ' + e.message);
                }
            });

        } catch(e) {
            ENI.UI.error('Errore caricamento dati vendita');
            console.error(e);
        }
    }

    // --- API pubblica ---
    return { render: render };
})();
