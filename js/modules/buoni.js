// ============================================================
// TITANWASH - Modulo Buoni
// Gestione buoni cartacei, clienti digitali e prenotazioni
// ============================================================

ENI.Modules.Buoni = (function() {
    'use strict';

    var _activeTab = 'genera';
    var _filtroStato = 'tutti';
    var _filtroPrenotazioni = 'in_attesa';
    var _clientiPortale = [];
    var _searchTimeout = null;

    // Stato selezione cliente
    var _selectedCliente = null;     // Tab Genera
    var _gestioneCliente = null;     // Tab Gestione

    // Logo cache per PDF
    var _logoTitanB64 = null;
    var _logoEniliveB64 = null;

    // ============================================================
    // RENDER PRINCIPALE
    // ============================================================

    async function render(container) {
        container.innerHTML =
            '<div class="module-header">' +
                '<h1>Buoni e Clienti</h1>' +
            '</div>' +
            '<div class="tabs" style="margin-bottom: var(--space-4);">' +
                '<button class="tab-btn' + (_activeTab === 'genera' ? ' active' : '') + '" data-tab="genera">Genera Buoni</button>' +
                '<button class="tab-btn' + (_activeTab === 'gestione' ? ' active' : '') + '" data-tab="gestione">Gestione Buoni</button>' +
                '<button class="tab-btn' + (_activeTab === 'clienti' ? ' active' : '') + '" data-tab="clienti">Clienti Digitali</button>' +
                '<button class="tab-btn' + (_activeTab === 'prenotazioni' ? ' active' : '') + '" data-tab="prenotazioni">Prenotazioni</button>' +
            '</div>' +
            '<div id="buoni-content"></div>';

        _setupTabEvents(container);
        _renderTab();
    }

    function _setupTabEvents(container) {
        container.addEventListener('click', function(e) {
            var tabBtn = e.target.closest('.tab-btn');
            if (tabBtn && tabBtn.dataset.tab) {
                _activeTab = tabBtn.dataset.tab;
                container.querySelectorAll('.tab-btn').forEach(function(b) {
                    b.classList.toggle('active', b.dataset.tab === _activeTab);
                });
                _renderTab();
            }
        });
    }

    function _renderTab() {
        var content = document.getElementById('buoni-content');
        if (!content) return;

        switch (_activeTab) {
            case 'genera': _renderGenera(content); break;
            case 'gestione': _renderGestione(content); break;
            case 'clienti': _renderClienti(content); break;
            case 'prenotazioni': _renderPrenotazioni(content); break;
        }
    }

    // ============================================================
    // UTILITA: RICERCA CLIENTI (usata da Tab 1 e Tab 2)
    // ============================================================

    function _setupClienteSearch(inputId, resultsId, onSelect) {
        var searchInput = document.getElementById(inputId);
        var resultsEl = document.getElementById(resultsId);
        if (!searchInput || !resultsEl) return;

        var debounce = null;

        searchInput.addEventListener('input', function() {
            clearTimeout(debounce);
            var term = searchInput.value.trim();
            if (term.length < 2) { resultsEl.style.display = 'none'; return; }

            debounce = setTimeout(async function() {
                try {
                    var clienti = await ENI.API.cercaClienti(term);
                    if (clienti.length === 0) {
                        resultsEl.innerHTML = '<div class="pos-search-item"><span class="text-muted">Nessun cliente trovato</span></div>';
                    } else {
                        resultsEl.innerHTML = clienti.map(function(c) {
                            return '<div class="pos-search-item buoni-search-result" data-sel-id="' + c.id + '">' +
                                '<div>' +
                                    '<span class="pos-search-item-name">' + ENI.UI.escapeHtml(c.nome_ragione_sociale) + '</span>' +
                                    (c.targa ? '<br><span class="pos-search-item-code">' + ENI.UI.escapeHtml(c.targa) + '</span>' : '') +
                                    (c.p_iva_coe ? '<br><span class="pos-search-item-code">P.IVA: ' + ENI.UI.escapeHtml(c.p_iva_coe) + '</span>' : '') +
                                '</div>' +
                                '<span class="text-xs text-muted">' + ENI.UI.escapeHtml(c.tipo) + '</span>' +
                            '</div>';
                        }).join('');
                    }
                    resultsEl.style.display = 'block';

                    resultsEl.querySelectorAll('[data-sel-id]').forEach(function(item) {
                        item.addEventListener('click', function() {
                            var cId = item.dataset.selId;
                            var found = clienti.find(function(c) { return c.id === cId; });
                            if (found) {
                                onSelect(found);
                                searchInput.value = '';
                                resultsEl.style.display = 'none';
                            }
                        });
                    });
                } catch(e) {
                    resultsEl.innerHTML = '<div class="pos-search-item text-danger">Errore ricerca</div>';
                    resultsEl.style.display = 'block';
                }
            }, 300);
        });

        // Chiudi dropdown cliccando fuori
        document.addEventListener('click', function(e) {
            if (!e.target.closest('#' + inputId) && !e.target.closest('#' + resultsId)) {
                resultsEl.style.display = 'none';
            }
        });
    }

    function _renderClienteBadge(cliente, containerId, onRemove) {
        var el = document.getElementById(containerId);
        if (!el || !cliente) return;
        el.style.display = 'block';
        el.innerHTML =
            '<div style="display: flex; align-items: center; justify-content: space-between; padding: var(--space-2) var(--space-3); background: var(--color-success-bg, #e8f5e9); border: 1px solid var(--color-success, #4caf50); border-radius: var(--radius-md);">' +
                '<div>' +
                    '<strong>' + ENI.UI.escapeHtml(cliente.nome_ragione_sociale) + '</strong>' +
                    (cliente.targa ? ' <span class="text-sm text-muted">(' + ENI.UI.escapeHtml(cliente.targa) + ')</span>' : '') +
                    (cliente.tipo ? ' <span class="badge badge-gray" style="margin-left: 4px;">' + ENI.UI.escapeHtml(cliente.tipo) + '</span>' : '') +
                '</div>' +
                '<button class="btn btn-sm btn-outline" id="' + containerId + '-change">Cambia</button>' +
            '</div>';
        document.getElementById(containerId + '-change').addEventListener('click', function() {
            onRemove();
            el.style.display = 'none';
        });
    }

    // ============================================================
    // TAB 1: GENERA BUONI CARTACEI
    // ============================================================

    function _renderGenera(container) {
        var tagli = ENI.Config.TAGLI_BUONI;
        var colori = ENI.Config.COLORI_BUONI;

        // Card selezione denominations
        var cardsHtml = '';
        tagli.forEach(function(taglio) {
            var c = colori[taglio];
            cardsHtml +=
                '<div class="buono-gen-card" style="border: 2px solid ' + c.primary + '; border-radius: var(--radius-lg);">' +
                    '<div class="buono-gen-header" style="background: ' + c.primary + '; color: white; padding: var(--space-3); text-align: center; border-radius: var(--radius-lg) var(--radius-lg) 0 0;">' +
                        '<div style="font-size: 1.75rem; font-weight: 700;">EUR ' + taglio + ',00</div>' +
                        '<div style="font-size: 0.8rem; opacity: 0.9;">' + c.label + '</div>' +
                    '</div>' +
                    '<div style="padding: var(--space-3); text-align: center;">' +
                        '<label class="form-label">Quantita</label>' +
                        '<input type="number" min="0" max="200" value="0" class="form-input buono-qty-input" data-taglio="' + taglio + '" ' +
                            'style="text-align: center; font-size: 1.25rem; font-weight: 600; max-width: 120px; margin: 0 auto;">' +
                    '</div>' +
                '</div>';
        });

        container.innerHTML =
            // Step 1: Selezione cliente
            '<div class="card" style="margin-bottom: var(--space-4);">' +
                '<div class="card-header"><h3>1. Seleziona Cliente</h3></div>' +
                '<div class="card-body">' +
                    '<p class="text-muted" style="margin-bottom: var(--space-3);">I buoni devono essere associati a un cliente. Cerca un cliente esistente o creane uno nuovo.</p>' +
                    '<div class="form-group" style="position: relative;">' +
                        '<input type="text" class="form-input" id="genera-cerca-cliente" placeholder="Cerca per nome, ragione sociale, targa o P.IVA...">' +
                        '<div id="genera-clienti-results" class="pos-search-dropdown" style="display: none;"></div>' +
                    '</div>' +
                    '<div id="genera-cliente-selected" style="display: none;"></div>' +
                    '<div style="margin-top: var(--space-2);">' +
                        '<button class="btn btn-outline btn-sm" id="btn-genera-nuovo-cliente">+ Crea Nuovo Cliente</button>' +
                    '</div>' +
                '</div>' +
            '</div>' +
            // Step 2: Tagli e quantita
            '<div class="card">' +
                '<div class="card-header"><h3>2. Seleziona Tagli e Quantita</h3></div>' +
                '<div class="card-body">' +
                    '<div class="buono-gen-grid">' + cardsHtml + '</div>' +
                    '<div style="margin-top: var(--space-4); text-align: center;">' +
                        '<button class="btn btn-primary btn-lg" id="btn-genera-buoni" style="min-width: 250px;">' +
                            'Genera e Stampa PDF' +
                        '</button>' +
                    '</div>' +
                '</div>' +
            '</div>';

        // Setup ricerca cliente
        _setupClienteSearch('genera-cerca-cliente', 'genera-clienti-results', function(cliente) {
            _selectedCliente = cliente;
            _renderClienteBadge(cliente, 'genera-cliente-selected', function() {
                _selectedCliente = null;
            });
        });

        // Ripristina se gia selezionato
        if (_selectedCliente) {
            _renderClienteBadge(_selectedCliente, 'genera-cliente-selected', function() {
                _selectedCliente = null;
            });
        }

        // Bottone nuovo cliente
        document.getElementById('btn-genera-nuovo-cliente').addEventListener('click', _mostraNuovoClientePerBuoni);

        // Bottone genera
        document.getElementById('btn-genera-buoni').addEventListener('click', _generaBuoni);
    }

    function _mostraNuovoClientePerBuoni() {
        var body =
            '<div class="form-group">' +
                '<label class="form-label form-label-required">Tipo</label>' +
                '<select class="form-select" id="nc-tipo">' +
                    '<option value="Privato">Privato</option>' +
                    '<option value="Corporate">Azienda / Corporate</option>' +
                '</select>' +
            '</div>' +
            '<div class="form-group">' +
                '<label class="form-label form-label-required">Nome / Ragione Sociale</label>' +
                '<input type="text" class="form-input" id="nc-nome" placeholder="Mario Rossi / Azienda SRL">' +
            '</div>' +
            '<div class="form-group">' +
                '<label class="form-label">Targa</label>' +
                '<input type="text" class="form-input" id="nc-targa" placeholder="AA000AA">' +
            '</div>' +
            '<div class="form-group">' +
                '<label class="form-label">Telefono</label>' +
                '<input type="text" class="form-input" id="nc-telefono" placeholder="+39...">' +
            '</div>' +
            '<div class="form-group">' +
                '<label class="form-label">Email</label>' +
                '<input type="email" class="form-input" id="nc-email" placeholder="email@esempio.com">' +
            '</div>' +
            '<div class="form-group">' +
                '<label class="form-label">Modalita Pagamento</label>' +
                '<select class="form-select" id="nc-pagamento">' +
                    '<option value="Cash">Cash</option>' +
                    '<option value="Addebito_Mese">Addebito Mese</option>' +
                    '<option value="Addebito_30gg">Addebito 30gg</option>' +
                    '<option value="Addebito_60gg">Addebito 60gg</option>' +
                    '<option value="Bonifico_Anticipato">Bonifico Anticipato</option>' +
                '</select>' +
            '</div>';

        var modal = ENI.UI.showModal({
            title: 'Nuovo Cliente',
            body: body,
            footer:
                '<button class="btn btn-outline" data-modal-close>Annulla</button>' +
                '<button class="btn btn-primary" id="btn-salva-nc">Crea Cliente</button>'
        });

        modal.querySelector('#btn-salva-nc').addEventListener('click', async function() {
            var nome = modal.querySelector('#nc-nome').value.trim();
            var tipo = modal.querySelector('#nc-tipo').value;

            if (!nome) {
                ENI.UI.warning('Inserisci il nome o ragione sociale');
                return;
            }

            try {
                var dati = {
                    nome_ragione_sociale: nome,
                    tipo: tipo,
                    targa: modal.querySelector('#nc-targa').value.trim() || null,
                    telefono: modal.querySelector('#nc-telefono').value.trim() || null,
                    email: modal.querySelector('#nc-email').value.trim() || null,
                    modalita_pagamento: modal.querySelector('#nc-pagamento').value,
                    attivo: true
                };

                var record = await ENI.API.salvaCliente(dati);
                ENI.UI.closeModal(modal);
                ENI.UI.success('Cliente "' + nome + '" creato');

                // Seleziona automaticamente il nuovo cliente
                _selectedCliente = record;
                _renderClienteBadge(record, 'genera-cliente-selected', function() {
                    _selectedCliente = null;
                });
            } catch(e) {
                ENI.UI.error('Errore: ' + e.message);
            }
        });
    }

    async function _generaBuoni() {
        // Validazione cliente
        if (!_selectedCliente) {
            ENI.UI.warning('Seleziona un cliente prima di generare i buoni');
            return;
        }

        var inputs = document.querySelectorAll('.buono-qty-input');
        var buoniDaGenerare = [];

        inputs.forEach(function(input) {
            var taglio = parseInt(input.dataset.taglio, 10);
            var qty = parseInt(input.value, 10) || 0;
            if (qty > 0) {
                buoniDaGenerare.push({ taglio: taglio, qty: qty });
            }
        });

        if (buoniDaGenerare.length === 0) {
            ENI.UI.warning('Inserisci almeno una quantita');
            return;
        }

        var totale = buoniDaGenerare.reduce(function(s, b) { return s + b.qty; }, 0);

        var conferma = await ENI.UI.confirm(
            'Generare ' + totale + ' buoni per "' + _selectedCliente.nome_ragione_sociale + '"?'
        );
        if (!conferma) return;

        try {
            ENI.UI.showLoading();

            // Genera lotto
            var now = new Date();
            var lotto = 'LOT' + now.getFullYear() + '-' +
                String(now.getMonth() + 1).padStart(2, '0') +
                String(now.getDate()).padStart(2, '0') + '-' +
                String(now.getHours()).padStart(2, '0') +
                String(now.getMinutes()).padStart(2, '0');

            var tuttiBuoni = [];

            for (var i = 0; i < buoniDaGenerare.length; i++) {
                var bg = buoniDaGenerare[i];
                var denomCode = ENI.Config.DENOM_CODE_BUONI[bg.taglio];
                var maxSeq = await ENI.API.getMaxSequenzialeBuono(denomCode);

                for (var j = 0; j < bg.qty; j++) {
                    maxSeq++;
                    var ean = _generaEAN13(bg.taglio, maxSeq);
                    tuttiBuoni.push({
                        codice_ean: ean,
                        taglio: bg.taglio,
                        stato: 'attivo',
                        lotto: lotto,
                        cliente_id: _selectedCliente.id,
                        creato_da: ENI.State.getUserId(),
                        creato_nome: ENI.State.getUserName()
                    });
                }
            }

            // Salva in DB
            await ENI.API.generaBuoniCartacei(tuttiBuoni);

            // Genera PDF
            await _generaPDF(tuttiBuoni, lotto, _selectedCliente.nome_ragione_sociale);

            ENI.UI.hideLoading();
            ENI.UI.success('Generati ' + totale + ' buoni per "' + _selectedCliente.nome_ragione_sociale + '" - Lotto: ' + lotto);

            // Reset
            _selectedCliente = null;
            var selEl = document.getElementById('genera-cliente-selected');
            if (selEl) selEl.style.display = 'none';
            inputs.forEach(function(input) { input.value = '0'; });

        } catch(e) {
            ENI.UI.hideLoading();
            ENI.UI.error('Errore generazione: ' + e.message);
        }
    }

    // --- EAN-13 ---

    function _generaEAN13(taglio, sequenziale) {
        var denomCode = ENI.Config.DENOM_CODE_BUONI[taglio];
        var prefix = '20' + denomCode;
        var seq = String(sequenziale).padStart(9, '0');
        var partial = prefix + seq;
        var checkDigit = _calcolaCheckDigitEAN13(partial);
        return partial + checkDigit;
    }

    function _calcolaCheckDigitEAN13(code12) {
        var sum = 0;
        for (var i = 0; i < 12; i++) {
            var digit = parseInt(code12[i], 10);
            sum += (i % 2 === 0) ? digit : digit * 3;
        }
        var remainder = sum % 10;
        return remainder === 0 ? '0' : String(10 - remainder);
    }

    // ============================================================
    // LOGO LOADING PER PDF
    // ============================================================

    function _loadLogos() {
        return new Promise(function(resolve) {
            if (_logoTitanB64 && _logoEniliveB64) { resolve(); return; }

            var loaded = 0;
            var total = 2;
            function check() { if (++loaded >= total) resolve(); }

            // Logo Titanwash
            var img1 = new Image();
            img1.crossOrigin = 'anonymous';
            img1.onload = function() {
                try {
                    var c = document.createElement('canvas');
                    c.width = img1.naturalWidth;
                    c.height = img1.naturalHeight;
                    c.getContext('2d').drawImage(img1, 0, 0);
                    _logoTitanB64 = c.toDataURL('image/png');
                } catch(e) { /* fallback a testo */ }
                check();
            };
            img1.onerror = check;
            img1.src = 'assets/logo_ritagliato.png';

            // Logo Enilive
            var img2 = new Image();
            img2.crossOrigin = 'anonymous';
            img2.onload = function() {
                try {
                    var c = document.createElement('canvas');
                    c.width = img2.naturalWidth;
                    c.height = img2.naturalHeight;
                    c.getContext('2d').drawImage(img2, 0, 0);
                    _logoEniliveB64 = c.toDataURL('image/png');
                } catch(e) { /* fallback a testo */ }
                check();
            };
            img2.onerror = check;
            img2.src = 'assets/enilive.png';
        });
    }

    // ============================================================
    // PDF GENERATION
    // ============================================================

    async function _generaPDF(buoni, lotto, clienteNome) {
        // Carica loghi
        await _loadLogos();

        var doc = new window.jspdf.jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });

        var marginX = 10;
        var marginY = 10;
        var voucherW = 90;
        var voucherH = 60;
        var gapX = 10;
        var gapY = 8;
        var cols = 2;
        var rows = 4;
        var perPage = cols * rows;

        var colori = ENI.Config.COLORI_BUONI;

        for (var idx = 0; idx < buoni.length; idx++) {
            var b = buoni[idx];
            var posOnPage = idx % perPage;

            if (posOnPage === 0 && idx > 0) {
                doc.addPage();
            }

            var col = posOnPage % cols;
            var row = Math.floor(posOnPage / cols);
            var x = marginX + col * (voucherW + gapX);
            var y = marginY + row * (voucherH + gapY);

            _drawVoucher(doc, b, x, y, voucherW, voucherH, colori[b.taglio], clienteNome);
        }

        // Apri PDF
        var pdfBlob = doc.output('blob');
        var url = URL.createObjectURL(pdfBlob);
        window.open(url, '_blank');
    }

    function _drawVoucher(doc, buono, x, y, w, h, colore, clienteNome) {
        // Bordo esterno
        doc.setDrawColor(colore.accent);
        doc.setLineWidth(0.8);
        doc.roundedRect(x, y, w, h, 3, 3, 'S');

        // Bordo interno decorativo
        doc.setLineWidth(0.3);
        doc.roundedRect(x + 2, y + 2, w - 4, h - 4, 2, 2, 'S');

        // Banda colore in alto
        doc.setFillColor(colore.primary);
        doc.rect(x + 2, y + 2, w - 4, 12, 'F');

        // Logo Titanwash (in alto a sx)
        if (_logoTitanB64) {
            try {
                doc.addImage(_logoTitanB64, 'PNG', x + 4, y + 3, 18, 10);
            } catch(e) {
                doc.setTextColor(255, 255, 255);
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(8);
                doc.text('TITAN WASH', x + 5, y + 7);
            }
        } else {
            doc.setTextColor(255, 255, 255);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8);
            doc.text('TITAN WASH', x + 5, y + 7);
        }

        // Logo Enilive (in alto a dx)
        if (_logoEniliveB64) {
            try {
                doc.addImage(_logoEniliveB64, 'PNG', x + w - 22, y + 3, 18, 10);
            } catch(e) {
                doc.setTextColor(255, 255, 255);
                doc.setFontSize(7);
                doc.text('Enilive', x + w - 5, y + 7, { align: 'right' });
            }
        } else {
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(7);
            doc.text('Enilive', x + w - 5, y + 7, { align: 'right' });
        }

        // Sottotitolo
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(5.5);
        doc.setFont('helvetica', 'normal');
        doc.text('Borgo Maggiore - San Marino', x + w / 2, y + 12.5, { align: 'center' });

        // Nome cliente
        if (clienteNome) {
            doc.setTextColor(colore.accent);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(6);
            doc.text('Cliente: ' + clienteNome, x + w / 2, y + 18, { align: 'center' });
        }

        // BUONO VALORE
        doc.setTextColor(colore.accent);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.text('BUONO VALORE', x + w / 2, y + 22.5, { align: 'center' });

        // Taglio grande
        doc.setFontSize(20);
        doc.setTextColor(colore.primary);
        var taglioStr = 'EUR ' + Number(buono.taglio).toFixed(0) + ',00';
        doc.text(taglioStr, x + w / 2, y + 31, { align: 'center' });

        // Linea decorativa
        doc.setDrawColor(colore.primary);
        doc.setLineWidth(0.2);
        doc.line(x + 10, y + 33, x + w - 10, y + 33);

        // Barcode EAN-13
        try {
            var canvas = document.createElement('canvas');
            JsBarcode(canvas, buono.codice_ean, {
                format: 'EAN13',
                width: 1.5,
                height: 28,
                displayValue: true,
                fontSize: 10,
                margin: 0
            });
            var barcodeImg = canvas.toDataURL('image/png');
            doc.addImage(barcodeImg, 'PNG', x + w / 2 - 22, y + 35, 44, 13);
        } catch(e) {
            doc.setFontSize(8);
            doc.setTextColor(0, 0, 0);
            doc.text(buono.codice_ean, x + w / 2, y + 44, { align: 'center' });
        }

        // Seriale e note in basso
        doc.setFontSize(5);
        doc.setTextColor(100, 100, 100);
        doc.setFont('helvetica', 'normal');
        doc.text('TWB-' + buono.codice_ean, x + 5, y + h - 4);
        doc.text('Buono monouso - Non ha scadenza', x + w - 5, y + h - 4, { align: 'right' });

        // Guide taglio
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.1);
        doc.setLineDashPattern([1, 1], 0);
        doc.line(x - 3, y, x, y);
        doc.line(x, y - 3, x, y);
        doc.line(x + w, y - 3, x + w, y);
        doc.line(x + w, y, x + w + 3, y);
        doc.line(x - 3, y + h, x, y + h);
        doc.line(x, y + h, x, y + h + 3);
        doc.line(x + w, y + h, x + w + 3, y + h);
        doc.line(x + w, y + h, x + w, y + h + 3);
        doc.setLineDashPattern([], 0);
    }

    // ============================================================
    // TAB 2: GESTIONE BUONI (vista per cliente)
    // ============================================================

    async function _renderGestione(container) {
        container.innerHTML =
            '<div class="card">' +
                '<div class="card-header"><h3>Gestione Buoni Cartacei</h3></div>' +
                '<div class="card-body">' +
                    // Selezione cliente
                    '<div class="form-group" style="position: relative; margin-bottom: var(--space-3);">' +
                        '<label class="form-label">Cerca cliente per visualizzare i suoi buoni</label>' +
                        '<input type="text" class="form-input" id="gestione-cerca-cliente" placeholder="Cerca per nome, ragione sociale, targa o P.IVA...">' +
                        '<div id="gestione-clienti-results" class="pos-search-dropdown" style="display: none;"></div>' +
                    '</div>' +
                    '<div id="gestione-cliente-selected" style="display: none;"></div>' +
                    // Riepilogo cliente
                    '<div id="gestione-riepilogo" style="display: none; margin: var(--space-3) 0;"></div>' +
                    // Filtri stato
                    '<div class="filter-bar" style="margin-bottom: var(--space-3); display: none;" id="gestione-filtri">' +
                        '<div class="filter-chips">' +
                            '<button class="chip' + (_filtroStato === 'tutti' ? ' active' : '') + '" data-filtro-stato="tutti">Tutti</button>' +
                            '<button class="chip' + (_filtroStato === 'attivo' ? ' active' : '') + '" data-filtro-stato="attivo">Attivi</button>' +
                            '<button class="chip' + (_filtroStato === 'utilizzato' ? ' active' : '') + '" data-filtro-stato="utilizzato">Utilizzati</button>' +
                            '<button class="chip' + (_filtroStato === 'annullato' ? ' active' : '') + '" data-filtro-stato="annullato">Annullati</button>' +
                        '</div>' +
                        '<div class="form-group" style="margin-top: var(--space-2);">' +
                            '<input type="text" class="form-input" id="buoni-search-ean" placeholder="Cerca per codice EAN...">' +
                        '</div>' +
                    '</div>' +
                    // Lista buoni
                    '<div id="buoni-lista">' +
                        '<div class="empty-state"><p class="empty-state-text">Seleziona un cliente per visualizzare i suoi buoni</p></div>' +
                    '</div>' +
                '</div>' +
            '</div>';

        // Setup ricerca cliente
        _setupClienteSearch('gestione-cerca-cliente', 'gestione-clienti-results', function(cliente) {
            _gestioneCliente = cliente;
            _renderClienteBadge(cliente, 'gestione-cliente-selected', function() {
                _gestioneCliente = null;
                document.getElementById('gestione-filtri').style.display = 'none';
                document.getElementById('gestione-riepilogo').style.display = 'none';
                document.getElementById('buoni-lista').innerHTML =
                    '<div class="empty-state"><p class="empty-state-text">Seleziona un cliente per visualizzare i suoi buoni</p></div>';
            });
            document.getElementById('gestione-filtri').style.display = 'block';
            _loadBuoni();
        });

        // Ripristina se gia selezionato
        if (_gestioneCliente) {
            _renderClienteBadge(_gestioneCliente, 'gestione-cliente-selected', function() {
                _gestioneCliente = null;
                document.getElementById('gestione-filtri').style.display = 'none';
                document.getElementById('gestione-riepilogo').style.display = 'none';
                document.getElementById('buoni-lista').innerHTML =
                    '<div class="empty-state"><p class="empty-state-text">Seleziona un cliente per visualizzare i suoi buoni</p></div>';
            });
            document.getElementById('gestione-filtri').style.display = 'block';
            _loadBuoni();
        }

        _setupGestioneEvents(container);
    }

    function _setupGestioneEvents(container) {
        container.addEventListener('click', function(e) {
            var chip = e.target.closest('[data-filtro-stato]');
            if (chip) {
                _filtroStato = chip.dataset.filtroStato;
                container.querySelectorAll('[data-filtro-stato]').forEach(function(c) {
                    c.classList.toggle('active', c.dataset.filtroStato === _filtroStato);
                });
                _loadBuoni();
            }

            var btnAnnulla = e.target.closest('[data-annulla-buono]');
            if (btnAnnulla) {
                _annullaBuono(btnAnnulla.dataset.annullaBuono);
            }
        });

        var searchInput = container.querySelector('#buoni-search-ean');
        if (searchInput) {
            searchInput.addEventListener('input', function() {
                clearTimeout(_searchTimeout);
                _searchTimeout = setTimeout(function() {
                    _loadBuoni(searchInput.value.trim());
                }, 300);
            });
        }
    }

    async function _loadBuoni(searchEAN) {
        var listaEl = document.getElementById('buoni-lista');
        if (!listaEl) return;

        if (!_gestioneCliente) {
            listaEl.innerHTML =
                '<div class="empty-state"><p class="empty-state-text">Seleziona un cliente per visualizzare i suoi buoni</p></div>';
            return;
        }

        try {
            var filtri = { cliente_id: _gestioneCliente.id };
            if (_filtroStato !== 'tutti') filtri.stato = _filtroStato;
            filtri.limit = 500;
            var buoni = await ENI.API.getBuoni(filtri);

            if (searchEAN) {
                buoni = buoni.filter(function(b) {
                    return b.codice_ean.indexOf(searchEAN) !== -1;
                });
            }

            // Riepilogo
            var allBuoni = buoni;
            if (_filtroStato !== 'tutti' || searchEAN) {
                // Se filtrato, carica tutti per il riepilogo
                var allFiltri = { cliente_id: _gestioneCliente.id, limit: 500 };
                allBuoni = await ENI.API.getBuoni(allFiltri);
            }
            var totAttivi = allBuoni.filter(function(b) { return b.stato === 'attivo'; });
            var totUtilizzati = allBuoni.filter(function(b) { return b.stato === 'utilizzato'; });
            var totAnnullati = allBuoni.filter(function(b) { return b.stato === 'annullato'; });
            var valoreAttivo = totAttivi.reduce(function(s, b) { return s + Number(b.taglio); }, 0);

            var riepilogoEl = document.getElementById('gestione-riepilogo');
            if (riepilogoEl) {
                riepilogoEl.style.display = 'flex';
                riepilogoEl.style.gap = 'var(--space-3)';
                riepilogoEl.style.flexWrap = 'wrap';
                riepilogoEl.innerHTML =
                    '<span class="badge badge-success" style="font-size: 0.85rem; padding: 6px 12px;">Attivi: ' + totAttivi.length + ' (' + ENI.UI.formatValuta(valoreAttivo) + ')</span>' +
                    '<span class="badge badge-info" style="font-size: 0.85rem; padding: 6px 12px;">Utilizzati: ' + totUtilizzati.length + '</span>' +
                    '<span class="badge badge-danger" style="font-size: 0.85rem; padding: 6px 12px;">Annullati: ' + totAnnullati.length + '</span>' +
                    '<span class="badge badge-gray" style="font-size: 0.85rem; padding: 6px 12px;">Totale: ' + allBuoni.length + '</span>';
            }

            if (buoni.length === 0) {
                listaEl.innerHTML =
                    '<div class="empty-state">' +
                        '<p class="empty-state-text">Nessun buono trovato per questo cliente</p>' +
                    '</div>';
                return;
            }

            var html = '<div class="table-wrapper"><table class="table"><thead><tr>' +
                '<th>EAN</th><th>Taglio</th><th>Stato</th><th>Lotto</th><th>Creato</th><th>Utilizzato</th><th>Azioni</th>' +
                '</tr></thead><tbody>';

            buoni.forEach(function(b) {
                var statoBadge = _badgeStatoBuono(b.stato);
                var dataCreato = b.created_at ? ENI.UI.formatData(b.created_at) : '-';
                var dataUtilizzato = b.utilizzato_at ? ENI.UI.formatData(b.utilizzato_at) : '-';
                html += '<tr>' +
                    '<td><code style="font-size: 0.85rem;">' + ENI.UI.escapeHtml(b.codice_ean) + '</code></td>' +
                    '<td><strong>' + ENI.UI.formatValuta(b.taglio) + '</strong></td>' +
                    '<td>' + statoBadge + '</td>' +
                    '<td>' + ENI.UI.escapeHtml(b.lotto || '-') + '</td>' +
                    '<td>' + dataCreato + '</td>' +
                    '<td>' + dataUtilizzato + '</td>' +
                    '<td>' +
                        (b.stato === 'attivo' ? '<button class="btn btn-sm btn-danger" data-annulla-buono="' + b.id + '">Annulla</button>' : '') +
                    '</td>' +
                '</tr>';
            });

            html += '</tbody></table></div>';
            listaEl.innerHTML = html;

        } catch(e) {
            listaEl.innerHTML = '<p class="text-danger">Errore: ' + ENI.UI.escapeHtml(e.message) + '</p>';
        }
    }

    async function _annullaBuono(buonoId) {
        var conferma = await ENI.UI.confirm('Confermi l\'annullamento di questo buono?');
        if (!conferma) return;

        try {
            await ENI.API.annullaBuono(buonoId);
            ENI.UI.success('Buono annullato');
            _loadBuoni();
        } catch(e) {
            ENI.UI.error('Errore: ' + e.message);
        }
    }

    function _badgeStatoBuono(stato) {
        var cls = 'badge ';
        switch(stato) {
            case 'attivo': cls += 'badge-success'; break;
            case 'utilizzato': cls += 'badge-info'; break;
            case 'annullato': cls += 'badge-danger'; break;
            default: cls += 'badge-gray';
        }
        return '<span class="' + cls + '">' + stato.charAt(0).toUpperCase() + stato.slice(1) + '</span>';
    }

    // ============================================================
    // TAB 3: CLIENTI DIGITALI
    // ============================================================

    async function _renderClienti(container) {
        container.innerHTML =
            '<div class="card">' +
                '<div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">' +
                    '<h3>Clienti Portale Digitale</h3>' +
                    '<button class="btn btn-primary btn-sm" id="btn-nuovo-cliente-portale">+ Nuovo Account</button>' +
                '</div>' +
                '<div class="card-body">' +
                    '<div class="form-group" style="margin-bottom: var(--space-3);">' +
                        '<input type="text" class="form-input" id="clienti-portale-search" placeholder="Cerca per nome o email...">' +
                    '</div>' +
                    '<div id="clienti-portale-lista"><div class="flex justify-center" style="padding: 2rem;"><div class="spinner"></div></div></div>' +
                '</div>' +
            '</div>';

        _setupClientiEvents(container);
        _loadClientiPortale();
    }

    function _setupClientiEvents(container) {
        container.addEventListener('click', function(e) {
            if (e.target.closest('#btn-nuovo-cliente-portale')) {
                _mostraNuovoClienteModal();
            }
            var btnRicarica = e.target.closest('[data-ricarica-cliente]');
            if (btnRicarica) {
                _mostraRicaricaModal(btnRicarica.dataset.ricaricaCliente, btnRicarica.dataset.nome);
            }
            var btnStorico = e.target.closest('[data-storico-cliente]');
            if (btnStorico) {
                _mostraStoricoMovimenti(btnStorico.dataset.storicoCliente, btnStorico.dataset.nome);
            }
            var btnScala = e.target.closest('[data-scala-cliente]');
            if (btnScala) {
                _mostraScalaCreditoModal(
                    btnScala.dataset.scalaCliente,
                    btnScala.dataset.nome,
                    parseFloat(btnScala.dataset.saldo)
                );
            }
        });

        var searchInput = container.querySelector('#clienti-portale-search');
        if (searchInput) {
            searchInput.addEventListener('input', function() {
                clearTimeout(_searchTimeout);
                _searchTimeout = setTimeout(function() {
                    _loadClientiPortale(searchInput.value.trim());
                }, 300);
            });
        }
    }

    async function _loadClientiPortale(search) {
        var listaEl = document.getElementById('clienti-portale-lista');
        if (!listaEl) return;

        // Check ruolo per bottone Scala
        var ruolo = ENI.State.getUserRole ? ENI.State.getUserRole() : '';
        var canScala = ['Admin', 'Cassiere'].indexOf(ruolo) !== -1;

        try {
            var filtri = { attivo: true };
            if (search) filtri.search = search;
            _clientiPortale = await ENI.API.getClientiPortale(filtri);

            if (_clientiPortale.length === 0) {
                listaEl.innerHTML =
                    '<div class="empty-state">' +
                        '<p class="empty-state-text">Nessun account cliente trovato</p>' +
                    '</div>';
                return;
            }

            var html = '<div class="table-wrapper"><table class="table"><thead><tr>' +
                '<th>Nome</th><th>Email</th><th>Saldo</th><th>Ultimo accesso</th><th>Azioni</th>' +
                '</tr></thead><tbody>';

            _clientiPortale.forEach(function(c) {
                var ultimoAccesso = c.ultimo_accesso ? ENI.UI.formatData(c.ultimo_accesso) : 'Mai';
                var saldoClass = c.saldo > 0 ? 'color: var(--color-success); font-weight: 600;' : '';
                html += '<tr>' +
                    '<td><strong>' + ENI.UI.escapeHtml(c.nome_display) + '</strong></td>' +
                    '<td>' + ENI.UI.escapeHtml(c.email) + '</td>' +
                    '<td style="' + saldoClass + '">' + ENI.UI.formatValuta(c.saldo) + '</td>' +
                    '<td>' + ultimoAccesso + '</td>' +
                    '<td>' +
                        '<button class="btn btn-sm btn-primary" data-ricarica-cliente="' + c.id + '" data-nome="' + ENI.UI.escapeHtml(c.nome_display) + '" style="margin-right: 4px;">Ricarica</button>' +
                        (canScala && c.saldo > 0 ?
                            '<button class="btn btn-sm btn-danger" data-scala-cliente="' + c.id + '" data-nome="' + ENI.UI.escapeHtml(c.nome_display) + '" data-saldo="' + c.saldo + '" style="margin-right: 4px;">Scala</button>'
                        : '') +
                        '<button class="btn btn-sm btn-outline" data-storico-cliente="' + c.id + '" data-nome="' + ENI.UI.escapeHtml(c.nome_display) + '">Storico</button>' +
                    '</td>' +
                '</tr>';
            });

            html += '</tbody></table></div>';
            listaEl.innerHTML = html;

        } catch(e) {
            listaEl.innerHTML = '<p class="text-danger">Errore: ' + ENI.UI.escapeHtml(e.message) + '</p>';
        }
    }

    function _mostraNuovoClienteModal() {
        var body =
            '<div class="form-group">' +
                '<label class="form-label form-label-required">Nome completo</label>' +
                '<input type="text" class="form-input" id="cp-nome" placeholder="Mario Rossi">' +
            '</div>' +
            '<div class="form-group">' +
                '<label class="form-label form-label-required">Email</label>' +
                '<input type="email" class="form-input" id="cp-email" placeholder="mario@email.com">' +
            '</div>' +
            '<div class="form-group">' +
                '<label class="form-label form-label-required">Password</label>' +
                '<input type="text" class="form-input" id="cp-password" placeholder="Minimo 6 caratteri">' +
            '</div>' +
            '<div class="form-group">' +
                '<label class="form-label">Collega a cliente esistente (opzionale)</label>' +
                '<select class="form-select" id="cp-cliente-id">' +
                    '<option value="">-- Nessun collegamento --</option>' +
                '</select>' +
            '</div>';

        var modal = ENI.UI.showModal({
            title: 'Nuovo Account Cliente',
            body: body,
            footer:
                '<button class="btn btn-outline" data-modal-close>Annulla</button>' +
                '<button class="btn btn-primary" id="btn-salva-cliente-portale">Crea Account</button>'
        });

        // Carica clienti per dropdown
        ENI.API.getClienti().then(function(clienti) {
            var select = modal.querySelector('#cp-cliente-id');
            clienti.forEach(function(c) {
                var opt = document.createElement('option');
                opt.value = c.id;
                opt.textContent = c.nome_ragione_sociale + (c.email ? ' (' + c.email + ')' : '');
                select.appendChild(opt);
            });
        });

        modal.querySelector('#btn-salva-cliente-portale').addEventListener('click', async function() {
            var nome = modal.querySelector('#cp-nome').value.trim();
            var email = modal.querySelector('#cp-email').value.trim();
            var password = modal.querySelector('#cp-password').value;
            var clienteId = modal.querySelector('#cp-cliente-id').value || null;

            if (!nome || !email || !password) {
                ENI.UI.warning('Compila tutti i campi obbligatori');
                return;
            }
            if (password.length < 6) {
                ENI.UI.warning('La password deve avere almeno 6 caratteri');
                return;
            }

            try {
                var result = await ENI.API.creaClientePortale(email, password, nome, clienteId);
                if (result.success) {
                    ENI.UI.closeModal(modal);
                    ENI.UI.success('Account creato per ' + nome);
                    _loadClientiPortale();
                } else {
                    ENI.UI.error(result.error || 'Errore creazione account');
                }
            } catch(e) {
                ENI.UI.error('Errore: ' + e.message);
            }
        });
    }

    function _mostraRicaricaModal(clienteId, nome) {
        var body =
            '<div style="text-align: center; margin-bottom: var(--space-3);">' +
                '<div class="text-sm text-muted">Ricarica per</div>' +
                '<div style="font-size: 1.25rem; font-weight: 600;">' + ENI.UI.escapeHtml(nome) + '</div>' +
            '</div>' +
            '<div class="form-group">' +
                '<label class="form-label form-label-required">Importo ricarica EUR</label>' +
                '<input type="number" step="0.01" min="0.01" class="form-input" id="ricarica-importo" ' +
                    'style="font-size: 1.5rem; text-align: center; font-weight: 600;">' +
            '</div>' +
            '<div class="form-group">' +
                '<label class="form-label">Note</label>' +
                '<input type="text" class="form-input" id="ricarica-note" placeholder="Es. Pagamento contanti">' +
            '</div>';

        var modal = ENI.UI.showModal({
            title: 'Ricarica Saldo',
            body: body,
            footer:
                '<button class="btn btn-outline" data-modal-close>Annulla</button>' +
                '<button class="btn btn-primary" id="btn-conferma-ricarica">Conferma Ricarica</button>'
        });

        modal.querySelector('#ricarica-importo').focus();

        modal.querySelector('#btn-conferma-ricarica').addEventListener('click', async function() {
            var importo = parseFloat(modal.querySelector('#ricarica-importo').value);
            var note = modal.querySelector('#ricarica-note').value.trim();

            if (!importo || importo <= 0) {
                ENI.UI.warning('Inserisci un importo valido');
                return;
            }

            try {
                var result = await ENI.API.ricaricaSaldo(clienteId, importo, note || 'Ricarica saldo');
                if (result.success) {
                    ENI.UI.closeModal(modal);
                    ENI.UI.success('Ricaricati ' + ENI.UI.formatValuta(importo) + ' - Nuovo saldo: ' + ENI.UI.formatValuta(result.nuovo_saldo));
                    _loadClientiPortale();
                } else {
                    ENI.UI.error(result.error || 'Errore ricarica');
                }
            } catch(e) {
                ENI.UI.error('Errore: ' + e.message);
            }
        });
    }

    // --- SCALA CREDITO MANUALE ---

    function _mostraScalaCreditoModal(clienteId, nome, saldoAttuale) {
        var body =
            '<div style="text-align: center; margin-bottom: var(--space-3);">' +
                '<div class="text-sm text-muted">Scala credito per</div>' +
                '<div style="font-size: 1.25rem; font-weight: 600;">' + ENI.UI.escapeHtml(nome) + '</div>' +
                '<div class="text-sm" style="margin-top: var(--space-1);">Saldo attuale: <strong style="color: var(--color-success);">' + ENI.UI.formatValuta(saldoAttuale) + '</strong></div>' +
            '</div>' +
            '<div class="form-group">' +
                '<label class="form-label form-label-required">Importo da scalare (EUR)</label>' +
                '<input type="number" step="0.01" min="0.01" max="' + saldoAttuale + '" class="form-input" id="scala-importo" ' +
                    'style="font-size: 1.5rem; text-align: center; font-weight: 600;" placeholder="0.00">' +
            '</div>' +
            '<div class="form-group">' +
                '<label class="form-label form-label-required">Descrizione / Motivo</label>' +
                '<input type="text" class="form-input" id="scala-note" placeholder="Es. Lavaggio esterno, Benzina...">' +
            '</div>';

        var modal = ENI.UI.showModal({
            title: 'Scala Credito',
            body: body,
            footer:
                '<button class="btn btn-outline" data-modal-close>Annulla</button>' +
                '<button class="btn btn-danger" id="btn-conferma-scala">Conferma Deduzione</button>'
        });

        modal.querySelector('#scala-importo').focus();

        modal.querySelector('#btn-conferma-scala').addEventListener('click', async function() {
            var importo = parseFloat(modal.querySelector('#scala-importo').value);
            var note = modal.querySelector('#scala-note').value.trim();

            if (!importo || importo <= 0) {
                ENI.UI.warning('Inserisci un importo valido');
                return;
            }
            if (!note) {
                ENI.UI.warning('Inserisci una descrizione o motivo');
                return;
            }
            if (importo > saldoAttuale) {
                ENI.UI.warning('Importo superiore al saldo disponibile (' + ENI.UI.formatValuta(saldoAttuale) + ')');
                return;
            }

            try {
                var result = await ENI.API.deduciSaldoCliente(clienteId, importo, note, 'manuale', null);
                if (result.success) {
                    ENI.UI.closeModal(modal);
                    ENI.UI.success('Scalati ' + ENI.UI.formatValuta(importo) + ' - Nuovo saldo: ' + ENI.UI.formatValuta(result.nuovo_saldo));
                    _loadClientiPortale();
                } else {
                    ENI.UI.error(result.error || 'Errore deduzione');
                }
            } catch(e) {
                ENI.UI.error('Errore: ' + e.message);
            }
        });
    }

    async function _mostraStoricoMovimenti(clienteId, nome) {
        try {
            var movimenti = await ENI.API.getMovimentiSaldo(clienteId, { limit: 50 });

            var righeHtml = '';
            if (movimenti.length === 0) {
                righeHtml = '<tr><td colspan="5" style="text-align: center;">Nessun movimento</td></tr>';
            } else {
                movimenti.forEach(function(m) {
                    var importoClass = m.importo >= 0 ? 'color: var(--color-success);' : 'color: var(--color-danger);';
                    var importoStr = (m.importo >= 0 ? '+' : '') + ENI.UI.formatValuta(m.importo);
                    var tipoLabel = m.tipo.charAt(0).toUpperCase() + m.tipo.slice(1);
                    righeHtml += '<tr>' +
                        '<td>' + ENI.UI.formatData(m.created_at) + '</td>' +
                        '<td>' + tipoLabel + '</td>' +
                        '<td>' + ENI.UI.escapeHtml(m.descrizione || '-') + '</td>' +
                        '<td style="' + importoClass + ' font-weight: 600;">' + importoStr + '</td>' +
                        '<td>' + ENI.UI.formatValuta(m.saldo_dopo) + '</td>' +
                    '</tr>';
                });
            }

            var body =
                '<div class="table-wrapper"><table class="table"><thead><tr>' +
                    '<th>Data</th><th>Tipo</th><th>Descrizione</th><th>Importo</th><th>Saldo</th>' +
                '</tr></thead><tbody>' + righeHtml + '</tbody></table></div>';

            ENI.UI.showModal({
                title: 'Storico - ' + ENI.UI.escapeHtml(nome),
                body: body,
                size: 'lg',
                footer: '<button class="btn btn-outline" data-modal-close>Chiudi</button>'
            });
        } catch(e) {
            ENI.UI.error('Errore: ' + e.message);
        }
    }

    // ============================================================
    // TAB 4: PRENOTAZIONI LAVAGGIO
    // ============================================================

    async function _renderPrenotazioni(container) {
        container.innerHTML =
            '<div class="card">' +
                '<div class="card-header">' +
                    '<h3>Prenotazioni Lavaggio</h3>' +
                '</div>' +
                '<div class="card-body">' +
                    '<div class="filter-chips" style="margin-bottom: var(--space-3);">' +
                        '<button class="chip' + (_filtroPrenotazioni === 'in_attesa' ? ' active' : '') + '" data-filtro-pren="in_attesa">In Attesa</button>' +
                        '<button class="chip' + (_filtroPrenotazioni === 'confermata' ? ' active' : '') + '" data-filtro-pren="confermata">Confermate</button>' +
                        '<button class="chip' + (_filtroPrenotazioni === 'tutti' ? ' active' : '') + '" data-filtro-pren="tutti">Tutte</button>' +
                    '</div>' +
                    '<div id="prenotazioni-lista"><div class="flex justify-center" style="padding: 2rem;"><div class="spinner"></div></div></div>' +
                '</div>' +
            '</div>';

        _setupPrenotazioniEvents(container);
        _loadPrenotazioni();
    }

    function _setupPrenotazioniEvents(container) {
        container.addEventListener('click', function(e) {
            var chip = e.target.closest('[data-filtro-pren]');
            if (chip) {
                _filtroPrenotazioni = chip.dataset.filtroPren;
                container.querySelectorAll('[data-filtro-pren]').forEach(function(c) {
                    c.classList.toggle('active', c.dataset.filtroPren === _filtroPrenotazioni);
                });
                _loadPrenotazioni();
            }

            var btnConferma = e.target.closest('[data-conferma-pren]');
            if (btnConferma) {
                _confermaPrenot(btnConferma.dataset.confermaPren);
            }

            var btnRifiuta = e.target.closest('[data-rifiuta-pren]');
            if (btnRifiuta) {
                _rifiutaPrenot(btnRifiuta.dataset.rifiutaPren);
            }
        });
    }

    async function _loadPrenotazioni() {
        var listaEl = document.getElementById('prenotazioni-lista');
        if (!listaEl) return;

        try {
            var filtri = {};
            if (_filtroPrenotazioni !== 'tutti') filtri.stato = _filtroPrenotazioni;
            var prenotazioni = await ENI.API.getPrenotazioniLavaggio(filtri);

            if (prenotazioni.length === 0) {
                listaEl.innerHTML =
                    '<div class="empty-state">' +
                        '<p class="empty-state-text">Nessuna prenotazione trovata</p>' +
                    '</div>';
                return;
            }

            var html = '<div class="table-wrapper"><table class="table"><thead><tr>' +
                '<th>Data</th><th>Fascia</th><th>Cliente</th><th>Tipo Lavaggio</th><th>Veicolo</th><th>Stato</th><th>Azioni</th>' +
                '</tr></thead><tbody>';

            prenotazioni.forEach(function(p) {
                var clienteNome = p.clienti_portale ? p.clienti_portale.nome_display : '-';
                var fasciaLabel = { mattina: 'Mattina (8-12)', pomeriggio: 'Pomeriggio (12-18)', qualsiasi: 'Qualsiasi' };
                var statoBadge = _badgeStatoPrenotazione(p.stato);
                var azioni = '';

                if (p.stato === 'in_attesa') {
                    azioni =
                        '<button class="btn btn-sm btn-primary" data-conferma-pren="' + p.id + '" style="margin-right: 4px;">Conferma</button>' +
                        '<button class="btn btn-sm btn-danger" data-rifiuta-pren="' + p.id + '">Rifiuta</button>';
                }

                html += '<tr>' +
                    '<td>' + ENI.UI.formatData(p.data_richiesta) + '</td>' +
                    '<td>' + (fasciaLabel[p.fascia_oraria] || p.fascia_oraria || '-') + '</td>' +
                    '<td><strong>' + ENI.UI.escapeHtml(clienteNome) + '</strong></td>' +
                    '<td>' + ENI.UI.escapeHtml(p.tipo_lavaggio) + '</td>' +
                    '<td>' + ENI.UI.escapeHtml(p.veicolo || '-') + '</td>' +
                    '<td>' + statoBadge + '</td>' +
                    '<td>' + azioni + '</td>' +
                '</tr>';
            });

            html += '</tbody></table></div>';
            listaEl.innerHTML = html;

        } catch(e) {
            listaEl.innerHTML = '<p class="text-danger">Errore: ' + ENI.UI.escapeHtml(e.message) + '</p>';
        }
    }

    async function _confermaPrenot(prenotazioneId) {
        var conferma = await ENI.UI.confirm('Confermare questa prenotazione lavaggio?');
        if (!conferma) return;

        try {
            await ENI.API.aggiornaPrenotazione(prenotazioneId, { stato: 'confermata' });
            ENI.UI.success('Prenotazione confermata');
            _loadPrenotazioni();
        } catch(e) {
            ENI.UI.error('Errore: ' + e.message);
        }
    }

    async function _rifiutaPrenot(prenotazioneId) {
        var conferma = await ENI.UI.confirm('Rifiutare questa prenotazione?');
        if (!conferma) return;

        try {
            await ENI.API.aggiornaPrenotazione(prenotazioneId, { stato: 'rifiutata' });
            ENI.UI.success('Prenotazione rifiutata');
            _loadPrenotazioni();
        } catch(e) {
            ENI.UI.error('Errore: ' + e.message);
        }
    }

    function _badgeStatoPrenotazione(stato) {
        var cls = 'badge ';
        switch(stato) {
            case 'in_attesa': cls += 'badge-warning'; break;
            case 'confermata': cls += 'badge-info'; break;
            case 'completata': cls += 'badge-success'; break;
            case 'rifiutata': cls += 'badge-danger'; break;
            case 'annullata': cls += 'badge-gray'; break;
            default: cls += 'badge-gray';
        }
        var label = stato.replace('_', ' ');
        label = label.charAt(0).toUpperCase() + label.slice(1);
        return '<span class="' + cls + '">' + label + '</span>';
    }

    // API pubblica
    return { render: render };
})();
