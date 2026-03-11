// ============================================================
// GESTIONALE ENI - Modulo Magazzino
// Inventario prodotti con alert sotto scorta
// Supporto articoli Lavaggi (servizi) con prezzi per cliente
// ============================================================

var ENI = ENI || {};
ENI.Modules = ENI.Modules || {};

ENI.Modules.Magazzino = (function() {
    'use strict';

    var _prodotti = [];
    var _categoriaFiltro = 'Tutti';
    var _searchTerm = '';

    async function render(container) {
        var canWrite = ENI.State.canWrite('magazzino');

        container.innerHTML =
            '<div class="page-header">' +
                '<h1 class="page-title">\u{1F4E6} Magazzino</h1>' +
                '<div class="page-header-actions">' +
                    (canWrite && ENI.State.getUserRole() === 'Admin' ? '<button class="btn btn-outline" id="btn-import-csv">\u{1F4C2} Importa CSV</button>' : '') +
                    (canWrite ? '<button class="btn btn-primary" id="btn-nuovo-prodotto">\u2795 Nuovo Prodotto</button>' : '') +
                '</div>' +
            '</div>' +

            // Alert sotto scorta
            '<div id="stock-alerts"></div>' +

            // Filtri
            '<div class="filter-bar">' +
                '<input type="text" class="form-input" id="search-prodotti" placeholder="\u{1F50D} Cerca prodotto...">' +
                '<div class="filter-chips">' +
                    '<button class="chip active" data-cat="Tutti">Tutti</button>' +
                    ENI.Config.CATEGORIE_MAGAZZINO.map(function(c) {
                        return '<button class="chip" data-cat="' + c + '">' + c + '</button>';
                    }).join('') +
                '</div>' +
            '</div>' +

            '<div id="magazzino-list"></div>';

        _setupEvents(container);
        await _loadProdotti();
    }

    function _setupEvents(container) {
        // Search
        var searchInput = container.querySelector('#search-prodotti');
        var debounceTimer;
        if (searchInput) {
            searchInput.addEventListener('input', function(e) {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(function() {
                    _searchTerm = e.target.value.toLowerCase();
                    _renderList();
                }, 300);
            });
        }

        // Categoria filter
        ENI.UI.delegate(container, 'click', '.chip[data-cat]', function(e, el) {
            _categoriaFiltro = el.dataset.cat;
            container.querySelectorAll('.chip[data-cat]').forEach(function(c) {
                c.classList.toggle('active', c.dataset.cat === _categoriaFiltro);
            });
            _renderList();
        });

        // Nuovo prodotto
        var btnNuovo = container.querySelector('#btn-nuovo-prodotto');
        if (btnNuovo) {
            btnNuovo.addEventListener('click', _showFormNuovoProdotto);
        }

        // Import CSV
        var btnImport = container.querySelector('#btn-import-csv');
        if (btnImport) {
            btnImport.addEventListener('click', function() {
                if (ENI.Modules.MagazzinoImport) {
                    ENI.Modules.MagazzinoImport.show(function() { _loadProdotti(); });
                }
            });
        }

        // Modifica giacenza +/-
        ENI.UI.delegate(container, 'click', '[data-giacenza-action]', function(e, el) {
            e.stopPropagation();
            _modificaGiacenza(el.dataset.prodottoId, el.dataset.giacenzaAction === 'add' ? 1 : -1);
        });

        // Prezzi cliente (per articoli Lavaggi)
        ENI.UI.delegate(container, 'click', '[data-prezzi-cliente]', function(e, el) {
            e.stopPropagation();
            _showPrezziCliente(el.dataset.prezziCliente);
        });
    }

    async function _loadProdotti() {
        try {
            _prodotti = await ENI.API.getMagazzino();
            _renderAlerts();
            _renderList();
        } catch(e) {
            ENI.UI.error('Errore caricamento magazzino');
            console.error(e);
        }
    }

    function _isServizio(prodotto) {
        return prodotto.categoria === 'Lavaggi';
    }

    function _renderAlerts() {
        var el = document.getElementById('stock-alerts');
        if (!el) return;

        var sottoScorta = _prodotti.filter(function(p) {
            return !_isServizio(p) && p.giacenza < p.giacenza_minima;
        });

        if (sottoScorta.length === 0) {
            el.innerHTML = '';
            return;
        }

        el.innerHTML =
            '<div class="stock-alert">' +
                '\u26A0\uFE0F <strong>' + sottoScorta.length + ' prodott' + (sottoScorta.length === 1 ? 'o' : 'i') + ' sotto scorta minima:</strong> ' +
                sottoScorta.map(function(p) {
                    return ENI.UI.escapeHtml(p.nome_prodotto) + ' (' + p.giacenza + '/' + p.giacenza_minima + ')';
                }).join(', ') +
            '</div>';
    }

    function _renderList() {
        var listEl = document.getElementById('magazzino-list');
        if (!listEl) return;

        var filtered = _prodotti.filter(function(p) {
            var matchCat = _categoriaFiltro === 'Tutti' || p.categoria === _categoriaFiltro;
            var matchSearch = !_searchTerm ||
                p.nome_prodotto.toLowerCase().indexOf(_searchTerm) !== -1 ||
                p.codice.toLowerCase().indexOf(_searchTerm) !== -1 ||
                (p.barcode && p.barcode.toLowerCase().indexOf(_searchTerm) !== -1);
            return matchCat && matchSearch;
        });

        if (filtered.length === 0) {
            listEl.innerHTML =
                '<div class="empty-state">' +
                    '<div class="empty-state-icon">\u{1F4E6}</div>' +
                    '<p class="empty-state-text">Nessun prodotto trovato</p>' +
                '</div>';
            return;
        }

        var canWrite = ENI.State.canWrite('magazzino');
        var isLavaggiView = _categoriaFiltro === 'Lavaggi';

        var html = '<div class="table-wrapper"><table class="table">' +
            '<thead><tr>' +
                '<th>Codice</th>' +
                '<th>Nome</th>' +
                '<th>Categoria</th>' +
                (!isLavaggiView ? '<th>Giacenza</th>' : '') +
                '<th>Prezzo</th>' +
                (canWrite ? '<th>Azioni</th>' : '') +
            '</tr></thead><tbody>';

        filtered.forEach(function(p) {
            var servizio = _isServizio(p);
            var isSottoScorta = !servizio && p.giacenza < p.giacenza_minima;

            html +=
                '<tr' + (isSottoScorta ? ' style="background-color: var(--color-warning-bg);"' : '') + '>' +
                    '<td class="text-sm text-muted">' + ENI.UI.escapeHtml(p.codice) + '</td>' +
                    '<td><strong>' + ENI.UI.escapeHtml(p.nome_prodotto) + '</strong>' +
                        (servizio ? ' <span class="badge badge-info">Servizio</span>' : '') +
                    '</td>' +
                    '<td class="text-sm">' + ENI.UI.escapeHtml(p.categoria || '-') + '</td>';

            if (!isLavaggiView) {
                if (servizio) {
                    html += '<td class="text-sm text-muted">-</td>';
                } else {
                    html += '<td>' +
                        '<strong>' + p.giacenza + '</strong>' +
                        (isSottoScorta ? ' \u26A0\uFE0F' : '') +
                        '<span class="text-xs text-muted"> / min ' + p.giacenza_minima + '</span>' +
                    '</td>';
                }
            }

            html += '<td>' + ENI.UI.formatValuta(p.prezzo_vendita) + '</td>';

            if (canWrite) {
                html += '<td class="table-actions">';
                if (servizio) {
                    html += '<button class="btn btn-sm btn-outline" data-prezzi-cliente="' + p.id + '" title="Prezzi per cliente">\u{1F4B0} Prezzi</button>';
                } else {
                    html += '<button class="btn btn-sm btn-outline" data-giacenza-action="add" data-prodotto-id="' + p.id + '">+</button>' +
                            '<button class="btn btn-sm btn-outline" data-giacenza-action="remove" data-prodotto-id="' + p.id + '">-</button>';
                }
                html += '</td>';
            }

            html += '</tr>';
        });

        html += '</tbody></table></div>';
        listEl.innerHTML = html;
    }

    // --- Modifica Giacenza ---

    async function _modificaGiacenza(id, delta) {
        var prodotto = _prodotti.find(function(p) { return p.id === id; });
        if (!prodotto) return;

        var nuovaGiacenza = prodotto.giacenza + delta;
        if (nuovaGiacenza < 0) {
            ENI.UI.warning('Giacenza non pu\u00F2 essere negativa');
            return;
        }

        try {
            await ENI.API.aggiornaProdotto(id, {
                giacenza: nuovaGiacenza,
                ultima_movimentazione: new Date().toISOString()
            });
            prodotto.giacenza = nuovaGiacenza;
            _renderAlerts();
            _renderList();
        } catch(e) {
            ENI.UI.error('Errore aggiornamento giacenza');
        }
    }

    // --- Prezzi Cliente per Articoli Lavaggi ---

    async function _showPrezziCliente(prodottoId) {
        var prodotto = _prodotti.find(function(p) { return p.id === prodottoId; });
        if (!prodotto) return;

        var prezziCliente = [];
        var clientiCorporate = [];

        try {
            prezziCliente = await ENI.API.getPrezziCliente(prodottoId);
            clientiCorporate = await ENI.API.getClienti('Corporate');
        } catch(e) {
            ENI.UI.error('Errore caricamento dati');
            return;
        }

        // Mappa prezzi esistenti per cliente_id
        var prezziMap = {};
        prezziCliente.forEach(function(pc) {
            prezziMap[pc.cliente_id] = pc.prezzo;
        });

        var body =
            '<div style="margin-bottom: 12px;">' +
                '<strong>' + ENI.UI.escapeHtml(prodotto.nome_prodotto) + '</strong> - ' +
                'Prezzo standard: <strong>' + ENI.UI.formatValuta(prodotto.prezzo_vendita) + '</strong>' +
            '</div>';

        if (clientiCorporate.length === 0) {
            body += '<div class="empty-state"><p class="empty-state-text">Nessun cliente Corporate registrato</p></div>';
        } else {
            body += '<div class="table-wrapper"><table class="table">' +
                '<thead><tr>' +
                    '<th>Cliente</th>' +
                    '<th style="width:120px;">Prezzo \u20AC</th>' +
                    '<th style="width:80px;">Sconto</th>' +
                '</tr></thead><tbody>';

            clientiCorporate.forEach(function(c) {
                var prezzoCliente = prezziMap[c.id] !== undefined ? prezziMap[c.id] : '';
                var sconto = '';
                if (prezzoCliente !== '' && prodotto.prezzo_vendita > 0) {
                    var diff = ((prezzoCliente - prodotto.prezzo_vendita) / prodotto.prezzo_vendita * 100).toFixed(0);
                    sconto = diff > 0 ? '+' + diff + '%' : diff + '%';
                }

                body += '<tr>' +
                    '<td><strong>' + ENI.UI.escapeHtml(c.nome_ragione_sociale) + '</strong></td>' +
                    '<td><input type="number" step="0.01" min="0" class="form-input prezzo-cliente-input" ' +
                        'data-cliente-id="' + c.id + '" ' +
                        'value="' + (prezzoCliente !== '' ? Number(prezzoCliente).toFixed(2) : '') + '" ' +
                        'placeholder="' + prodotto.prezzo_vendita.toFixed(2) + '" ' +
                        'style="width:100%;text-align:right;"></td>' +
                    '<td class="text-sm prezzo-sconto" data-cliente-id="' + c.id + '">' + sconto + '</td>' +
                '</tr>';
            });

            body += '</tbody></table></div>';
        }

        var modal = ENI.UI.showModal({
            title: '\u{1F4B0} Prezzi Cliente - ' + ENI.UI.escapeHtml(prodotto.nome_prodotto),
            body: body,
            footer:
                '<button class="btn btn-outline" data-modal-close>Chiudi</button>' +
                '<button class="btn btn-primary" id="btn-salva-prezzi">\u{1F4BE} Salva Prezzi</button>'
        });

        // Aggiorna sconto in tempo reale
        modal.querySelectorAll('.prezzo-cliente-input').forEach(function(inp) {
            inp.addEventListener('input', function() {
                var cid = inp.dataset.clienteId;
                var scontoEl = modal.querySelector('.prezzo-sconto[data-cliente-id="' + cid + '"]');
                var val = parseFloat(inp.value);
                if (!isNaN(val) && prodotto.prezzo_vendita > 0) {
                    var diff = ((val - prodotto.prezzo_vendita) / prodotto.prezzo_vendita * 100).toFixed(0);
                    scontoEl.textContent = diff > 0 ? '+' + diff + '%' : diff + '%';
                } else {
                    scontoEl.textContent = '';
                }
            });
        });

        // Salva
        modal.querySelector('#btn-salva-prezzi').addEventListener('click', async function() {
            var inputs = modal.querySelectorAll('.prezzo-cliente-input');
            var salvati = 0;
            var errori = 0;

            for (var i = 0; i < inputs.length; i++) {
                var inp = inputs[i];
                var clienteId = inp.dataset.clienteId;
                var val = inp.value.trim();
                var vecchioPrezzo = prezziMap[clienteId];

                if (val === '' && vecchioPrezzo !== undefined) {
                    // Rimuovi prezzo personalizzato
                    try {
                        await ENI.API.eliminaPrezzoCliente(clienteId, prodottoId);
                        salvati++;
                    } catch(e) { errori++; }
                } else if (val !== '') {
                    var prezzo = parseFloat(val);
                    if (!isNaN(prezzo) && prezzo >= 0) {
                        if (vecchioPrezzo === undefined || Number(vecchioPrezzo) !== prezzo) {
                            try {
                                await ENI.API.salvaPrezzoCliente(clienteId, prodottoId, prezzo);
                                salvati++;
                            } catch(e) { errori++; }
                        }
                    }
                }
            }

            if (errori > 0) {
                ENI.UI.warning(salvati + ' prezzi salvati, ' + errori + ' errori');
            } else if (salvati > 0) {
                ENI.UI.success(salvati + ' prezz' + (salvati === 1 ? 'o' : 'i') + ' aggiornati');
            }

            ENI.UI.closeModal(modal);
        });
    }

    // --- Form Nuovo Prodotto ---

    function _showFormNuovoProdotto() {
        var body =
            '<form id="form-prodotto">' +
                '<div class="form-row">' +
                    '<div class="form-group">' +
                        '<label class="form-label form-label-required">Codice</label>' +
                        '<input type="text" class="form-input" id="prod-codice" placeholder="EAN o codice interno">' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label class="form-label form-label-required">Nome Prodotto</label>' +
                        '<input type="text" class="form-input" id="prod-nome">' +
                    '</div>' +
                '</div>' +

                '<div class="form-row">' +
                    '<div class="form-group">' +
                        '<label class="form-label">Barcode (EAN)</label>' +
                        '<input type="text" class="form-input" id="prod-barcode" placeholder="Scansiona o inserisci barcode">' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label class="form-label">Categoria</label>' +
                        '<select class="form-select" id="prod-categoria">' +
                            ENI.Config.CATEGORIE_MAGAZZINO.map(function(c) {
                                return '<option value="' + c + '">' + c + '</option>';
                            }).join('') +
                        '</select>' +
                    '</div>' +
                '</div>' +

                '<div class="form-row">' +
                    '<div class="form-group">' +
                        '<label class="form-label">Fornitore</label>' +
                        '<input type="text" class="form-input" id="prod-fornitore">' +
                    '</div>' +
                '</div>' +

                '<div class="form-row">' +
                    '<div class="form-group">' +
                        '<label class="form-label">Prezzo Acquisto \u20AC</label>' +
                        '<input type="number" step="0.01" min="0" class="form-input" id="prod-prezzo-acquisto">' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label class="form-label form-label-required">Prezzo Vendita \u20AC</label>' +
                        '<input type="number" step="0.01" min="0" class="form-input" id="prod-prezzo-vendita">' +
                    '</div>' +
                '</div>' +

                '<div class="form-row" id="row-giacenza">' +
                    '<div class="form-group">' +
                        '<label class="form-label">Giacenza Iniziale</label>' +
                        '<input type="number" min="0" class="form-input" id="prod-giacenza" value="0">' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label class="form-label">Scorta Minima</label>' +
                        '<input type="number" min="0" class="form-input" id="prod-scorta" value="5">' +
                    '</div>' +
                '</div>' +
            '</form>';

        var modal = ENI.UI.showModal({
            title: '\u2795 Nuovo Prodotto',
            body: body,
            footer:
                '<button class="btn btn-outline" data-modal-close>Annulla</button>' +
                '<button class="btn btn-primary" id="btn-salva-prodotto">\u{1F4BE} Salva</button>'
        });

        // Nascondi giacenza quando categoria = Lavaggi
        var catSelect = modal.querySelector('#prod-categoria');
        var rowGiacenza = modal.querySelector('#row-giacenza');

        function _toggleGiacenza() {
            var isLavaggi = catSelect.value === 'Lavaggi';
            rowGiacenza.style.display = isLavaggi ? 'none' : '';
        }

        catSelect.addEventListener('change', _toggleGiacenza);
        _toggleGiacenza();

        modal.querySelector('#btn-salva-prodotto').addEventListener('click', async function() {
            var codice = modal.querySelector('#prod-codice').value.trim();
            var nome = modal.querySelector('#prod-nome').value.trim();
            var prezzoVendita = parseFloat(modal.querySelector('#prod-prezzo-vendita').value);
            var categoria = modal.querySelector('#prod-categoria').value;

            if (!codice || !nome || isNaN(prezzoVendita) || prezzoVendita <= 0) {
                ENI.UI.warning('Compila codice, nome e prezzo vendita');
                return;
            }

            var isLavaggi = categoria === 'Lavaggi';

            var dati = {
                codice: codice,
                nome_prodotto: nome,
                barcode: modal.querySelector('#prod-barcode').value.trim() || null,
                categoria: categoria,
                fornitore: modal.querySelector('#prod-fornitore').value.trim() || null,
                prezzo_acquisto: parseFloat(modal.querySelector('#prod-prezzo-acquisto').value) || null,
                prezzo_vendita: prezzoVendita,
                giacenza: isLavaggi ? 0 : (parseInt(modal.querySelector('#prod-giacenza').value, 10) || 0),
                giacenza_minima: isLavaggi ? 0 : (parseInt(modal.querySelector('#prod-scorta').value, 10) || 5)
            };

            try {
                await ENI.API.salvaProdotto(dati);
                ENI.UI.closeModal(modal);
                ENI.UI.success((isLavaggi ? 'Servizio' : 'Prodotto') + ' "' + nome + '" aggiunto');
                await _loadProdotti();
            } catch(e) {
                ENI.UI.error('Errore: ' + e.message);
            }
        });
    }

    return { render: render };
})();
