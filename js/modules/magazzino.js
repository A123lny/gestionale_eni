// ============================================================
// GESTIONALE ENI - Modulo Magazzino
// Inventario prodotti con alert sotto scorta
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

    function _renderAlerts() {
        var el = document.getElementById('stock-alerts');
        if (!el) return;

        var sottoScorta = _prodotti.filter(function(p) {
            return p.giacenza < p.giacenza_minima;
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

        var html = '<div class="table-wrapper"><table class="table">' +
            '<thead><tr>' +
                '<th>Codice</th>' +
                '<th>Nome</th>' +
                '<th>Categoria</th>' +
                '<th>Giacenza</th>' +
                '<th>Prezzo</th>' +
                (canWrite ? '<th>Azioni</th>' : '') +
            '</tr></thead><tbody>';

        filtered.forEach(function(p) {
            var isSottoScorta = p.giacenza < p.giacenza_minima;

            html +=
                '<tr' + (isSottoScorta ? ' style="background-color: var(--color-warning-bg);"' : '') + '>' +
                    '<td class="text-sm text-muted">' + ENI.UI.escapeHtml(p.codice) + '</td>' +
                    '<td><strong>' + ENI.UI.escapeHtml(p.nome_prodotto) + '</strong></td>' +
                    '<td class="text-sm">' + ENI.UI.escapeHtml(p.categoria || '-') + '</td>' +
                    '<td>' +
                        '<strong>' + p.giacenza + '</strong>' +
                        (isSottoScorta ? ' \u26A0\uFE0F' : '') +
                        '<span class="text-xs text-muted"> / min ' + p.giacenza_minima + '</span>' +
                    '</td>' +
                    '<td>' + ENI.UI.formatValuta(p.prezzo_vendita) + '</td>' +
                    (canWrite
                        ? '<td class="table-actions">' +
                            '<button class="btn btn-sm btn-outline" data-giacenza-action="add" data-prodotto-id="' + p.id + '">+</button>' +
                            '<button class="btn btn-sm btn-outline" data-giacenza-action="remove" data-prodotto-id="' + p.id + '">-</button>' +
                          '</td>'
                        : '') +
                '</tr>';
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

                '<div class="form-row">' +
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

        modal.querySelector('#btn-salva-prodotto').addEventListener('click', async function() {
            var codice = modal.querySelector('#prod-codice').value.trim();
            var nome = modal.querySelector('#prod-nome').value.trim();
            var prezzoVendita = parseFloat(modal.querySelector('#prod-prezzo-vendita').value);

            if (!codice || !nome || isNaN(prezzoVendita) || prezzoVendita <= 0) {
                ENI.UI.warning('Compila codice, nome e prezzo vendita');
                return;
            }

            var dati = {
                codice: codice,
                nome_prodotto: nome,
                barcode: modal.querySelector('#prod-barcode').value.trim() || null,
                categoria: modal.querySelector('#prod-categoria').value,
                fornitore: modal.querySelector('#prod-fornitore').value.trim() || null,
                prezzo_acquisto: parseFloat(modal.querySelector('#prod-prezzo-acquisto').value) || null,
                prezzo_vendita: prezzoVendita,
                giacenza: parseInt(modal.querySelector('#prod-giacenza').value, 10) || 0,
                giacenza_minima: parseInt(modal.querySelector('#prod-scorta').value, 10) || 5
            };

            try {
                await ENI.API.salvaProdotto(dati);
                ENI.UI.closeModal(modal);
                ENI.UI.success('Prodotto "' + nome + '" aggiunto');
                await _loadProdotti();
            } catch(e) {
                ENI.UI.error('Errore: ' + e.message);
            }
        });
    }

    return { render: render };
})();
