// ============================================================
// GESTIONALE ENI - Modulo Clienti
// CRUD clienti Corporate/Privati con listino personalizzato
// ============================================================

var ENI = ENI || {};
ENI.Modules = ENI.Modules || {};

ENI.Modules.Clienti = (function() {
    'use strict';

    var _clienti = [];
    var _filtroTipo = 'Tutti';
    var _searchTerm = '';

    async function render(container) {
        var canWrite = ENI.State.canWrite('clienti');

        container.innerHTML =
            '<div class="page-header">' +
                '<h1 class="page-title">\u{1F465} Clienti</h1>' +
                (canWrite ? '<button class="btn btn-primary" id="btn-nuovo-cliente">\u2795 Nuovo Cliente</button>' : '') +
            '</div>' +

            // Filtri
            '<div class="filter-bar">' +
                '<input type="text" class="form-input" id="search-clienti" placeholder="\u{1F50D} Cerca per nome...">' +
                '<div class="filter-chips">' +
                    '<button class="chip active" data-filtro="Tutti">Tutti</button>' +
                    '<button class="chip" data-filtro="Corporate">\u{1F3E2} Corporate</button>' +
                    '<button class="chip" data-filtro="Privato">\u{1F464} Privati</button>' +
                '</div>' +
            '</div>' +

            // Tabella
            '<div id="clienti-list"></div>';

        _setupEvents(container);
        await _loadClienti();
    }

    function _setupEvents(container) {
        // Search
        var searchInput = container.querySelector('#search-clienti');
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

        // Filter chips
        ENI.UI.delegate(container, 'click', '.chip[data-filtro]', function(e, el) {
            _filtroTipo = el.dataset.filtro;
            container.querySelectorAll('.chip[data-filtro]').forEach(function(c) {
                c.classList.toggle('active', c.dataset.filtro === _filtroTipo);
            });
            _renderList();
        });

        // Nuovo cliente
        var btnNuovo = container.querySelector('#btn-nuovo-cliente');
        if (btnNuovo) {
            btnNuovo.addEventListener('click', _showFormNuovoCliente);
        }

        // Click su riga -> dettaglio
        ENI.UI.delegate(container, 'click', '[data-cliente-id]', function(e, el) {
            var id = el.dataset.clienteId;
            _showDettaglio(id);
        });
    }

    async function _loadClienti() {
        try {
            _clienti = await ENI.API.getClienti();
            _renderList();
        } catch(e) {
            ENI.UI.error('Errore caricamento clienti');
            console.error(e);
        }
    }

    function _getFilteredClienti() {
        return _clienti.filter(function(c) {
            var matchTipo = _filtroTipo === 'Tutti' || c.tipo === _filtroTipo;
            var matchSearch = !_searchTerm ||
                c.nome_ragione_sociale.toLowerCase().indexOf(_searchTerm) !== -1 ||
                (c.targa && c.targa.toLowerCase().indexOf(_searchTerm) !== -1) ||
                (c.p_iva_coe && c.p_iva_coe.toLowerCase().indexOf(_searchTerm) !== -1);
            return matchTipo && matchSearch;
        });
    }

    function _renderList() {
        var listEl = document.getElementById('clienti-list');
        if (!listEl) return;

        var filtered = _getFilteredClienti();

        if (filtered.length === 0) {
            listEl.innerHTML =
                '<div class="empty-state">' +
                    '<div class="empty-state-icon">\u{1F465}</div>' +
                    '<p class="empty-state-text">Nessun cliente trovato</p>' +
                '</div>';
            return;
        }

        var html = '<div class="table-wrapper"><table class="table">' +
            '<thead><tr>' +
                '<th>Nome / Ragione Sociale</th>' +
                '<th>Tipo</th>' +
                '<th>Pagamento</th>' +
                '<th>Contatto</th>' +
            '</tr></thead><tbody>';

        filtered.forEach(function(c) {
            var pagLabel = ENI.Config.MODALITA_PAGAMENTO.find(function(m) { return m.value === c.modalita_pagamento; });
            html +=
                '<tr data-cliente-id="' + c.id + '" style="cursor:pointer;">' +
                    '<td>' +
                        '<strong>' + ENI.UI.escapeHtml(c.nome_ragione_sociale) + '</strong>' +
                        (c.targa ? '<br><span class="text-xs text-muted">' + ENI.UI.escapeHtml(c.targa) + '</span>' : '') +
                    '</td>' +
                    '<td>' + ENI.UI.badgeStato(c.tipo) + '</td>' +
                    '<td class="text-sm">' + (pagLabel ? pagLabel.label : c.modalita_pagamento) + '</td>' +
                    '<td class="text-sm text-muted">' +
                        (c.telefono ? c.telefono : '') +
                        (c.email ? '<br>' + c.email : '') +
                    '</td>' +
                '</tr>';
        });

        html += '</tbody></table></div>';
        listEl.innerHTML = html;
    }

    // --- Form Nuovo Cliente ---

    async function _showFormNuovoCliente() {
        var listino = await ENI.API.getListino();

        var tipiLavaggio = listino.map(function(l) {
            return '<tr>' +
                '<td>' + ENI.UI.escapeHtml(l.tipo_lavaggio) + '</td>' +
                '<td>' + ENI.UI.formatValuta(l.prezzo_standard) + '</td>' +
                '<td><input type="number" step="0.01" min="0" class="form-input" ' +
                    'data-listino-tipo="' + ENI.UI.escapeHtml(l.tipo_lavaggio) + '" ' +
                    'style="max-width:100px;" placeholder="' + l.prezzo_standard + '"></td>' +
                '<td class="text-sm" data-sconto-for="' + ENI.UI.escapeHtml(l.tipo_lavaggio) + '">-</td>' +
            '</tr>';
        }).join('');

        var body =
            '<form id="form-cliente">' +
                '<div class="form-group">' +
                    '<label class="form-label">Tipo Cliente</label>' +
                    '<div class="form-row">' +
                        '<label class="form-check"><input type="radio" name="tipo" value="Corporate" checked> \u{1F3E2} Corporate</label>' +
                        '<label class="form-check"><input type="radio" name="tipo" value="Privato"> \u{1F464} Privato</label>' +
                    '</div>' +
                '</div>' +

                '<div class="form-row">' +
                    '<div class="form-group">' +
                        '<label class="form-label form-label-required">Nome / Ragione Sociale</label>' +
                        '<input type="text" class="form-input" id="cl-nome" required>' +
                    '</div>' +
                    '<div class="form-group" id="cl-piva-group">' +
                        '<label class="form-label">P.IVA / COE</label>' +
                        '<input type="text" class="form-input" id="cl-piva">' +
                    '</div>' +
                '</div>' +

                '<div class="form-row">' +
                    '<div class="form-group">' +
                        '<label class="form-label">Telefono</label>' +
                        '<input type="tel" class="form-input" id="cl-telefono">' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label class="form-label">Email</label>' +
                        '<input type="email" class="form-input" id="cl-email">' +
                    '</div>' +
                '</div>' +

                '<div class="form-group" id="cl-targa-group" style="display:none;">' +
                    '<label class="form-label">Targa Veicolo</label>' +
                    '<input type="text" class="form-input" id="cl-targa" placeholder="SM XX000">' +
                '</div>' +

                '<div class="form-group">' +
                    '<label class="form-label form-label-required">Modalit\u00E0 Pagamento</label>' +
                    '<select class="form-select" id="cl-pagamento">' +
                        ENI.Config.MODALITA_PAGAMENTO.map(function(m) {
                            return '<option value="' + m.value + '">' + m.label + '</option>';
                        }).join('') +
                    '</select>' +
                '</div>' +

                // Listino personalizzato (solo corporate)
                '<div id="cl-listino-section">' +
                    '<div class="section-title">\u{1F4B3} Listino Personalizzato</div>' +
                    '<div class="table-wrapper">' +
                        '<table class="listino-table">' +
                            '<thead><tr><th>Tipo</th><th>Standard</th><th>Personalizzato</th><th>Sconto</th></tr></thead>' +
                            '<tbody>' + tipiLavaggio + '</tbody>' +
                        '</table>' +
                    '</div>' +
                '</div>' +

                '<div class="form-group mt-4">' +
                    '<label class="form-label">Note</label>' +
                    '<textarea class="form-textarea" id="cl-note" rows="2"></textarea>' +
                '</div>' +
            '</form>';

        var modal = ENI.UI.showModal({
            title: '\u2795 Nuovo Cliente',
            body: body,
            footer:
                '<button class="btn btn-outline" data-modal-close>Annulla</button>' +
                '<button class="btn btn-primary" id="btn-salva-cliente">\u{1F4BE} Salva Cliente</button>'
        });

        // Toggle tipo
        modal.querySelectorAll('input[name="tipo"]').forEach(function(radio) {
            radio.addEventListener('change', function(e) {
                var isCorporate = e.target.value === 'Corporate';
                modal.querySelector('#cl-piva-group').style.display = isCorporate ? '' : 'none';
                modal.querySelector('#cl-targa-group').style.display = isCorporate ? 'none' : '';
                modal.querySelector('#cl-listino-section').style.display = isCorporate ? '' : 'none';

                // Aggiorna opzioni pagamento
                var pagSelect = modal.querySelector('#cl-pagamento');
                if (!isCorporate) {
                    pagSelect.value = 'Cash';
                }
            });
        });

        // Calcolo sconto dinamico
        modal.querySelectorAll('[data-listino-tipo]').forEach(function(input) {
            input.addEventListener('input', function() {
                var tipo = input.dataset.listinoTipo;
                var standard = listino.find(function(l) { return l.tipo_lavaggio === tipo; });
                var scontoEl = modal.querySelector('[data-sconto-for="' + tipo + '"]');
                if (!standard || !scontoEl) return;

                var val = parseFloat(input.value);
                if (isNaN(val) || val <= 0) {
                    scontoEl.innerHTML = '-';
                    return;
                }

                var sconto = ((standard.prezzo_standard - val) / standard.prezzo_standard) * 100;
                if (sconto > 0) {
                    scontoEl.innerHTML = '<span class="listino-sconto discount">-' + sconto.toFixed(1) + '%</span>';
                } else if (sconto < 0) {
                    scontoEl.innerHTML = '<span class="listino-sconto surcharge">+' + Math.abs(sconto).toFixed(1) + '%</span>';
                } else {
                    scontoEl.innerHTML = '0%';
                }
            });
        });

        // Salva
        modal.querySelector('#btn-salva-cliente').addEventListener('click', async function() {
            var tipo = modal.querySelector('input[name="tipo"]:checked').value;
            var nome = modal.querySelector('#cl-nome').value.trim();

            if (!nome) {
                ENI.UI.warning('Inserisci il nome / ragione sociale');
                return;
            }

            // Raccoglie listino personalizzato
            var listinoPersonalizzato = null;
            if (tipo === 'Corporate') {
                var lp = {};
                var hasListino = false;
                modal.querySelectorAll('[data-listino-tipo]').forEach(function(input) {
                    var val = parseFloat(input.value);
                    if (!isNaN(val) && val > 0) {
                        lp[input.dataset.listinoTipo] = val;
                        hasListino = true;
                    }
                });
                if (hasListino) listinoPersonalizzato = lp;
            }

            var dati = {
                tipo: tipo,
                nome_ragione_sociale: nome,
                p_iva_coe: modal.querySelector('#cl-piva').value.trim() || null,
                email: modal.querySelector('#cl-email').value.trim() || null,
                telefono: modal.querySelector('#cl-telefono').value.trim() || null,
                targa: modal.querySelector('#cl-targa').value.trim() || null,
                modalita_pagamento: modal.querySelector('#cl-pagamento').value,
                listino_personalizzato: listinoPersonalizzato,
                note: modal.querySelector('#cl-note').value.trim() || null
            };

            try {
                await ENI.API.salvaCliente(dati);
                ENI.UI.closeModal(modal);
                ENI.UI.success('Cliente "' + nome + '" creato con successo');
                ENI.State.cacheClear();
                await _loadClienti();
            } catch(e) {
                ENI.UI.error('Errore salvataggio: ' + e.message);
            }
        });
    }

    // --- Dettaglio Cliente ---

    async function _showDettaglio(id) {
        var cliente = _clienti.find(function(c) { return c.id === id; });
        if (!cliente) return;

        var canWrite = ENI.State.canWrite('clienti');

        // Listino personalizzato
        var listinoHtml = '';
        if (cliente.tipo === 'Corporate' && cliente.listino_personalizzato) {
            var listino = await ENI.API.getListino();
            listinoHtml = '<div class="section-title mt-4">\u{1F4B3} Listino Personalizzato</div>' +
                '<table class="listino-table">' +
                '<thead><tr><th>Tipo</th><th>Personalizzato</th><th>Standard</th><th>Sconto</th></tr></thead><tbody>';

            Object.keys(cliente.listino_personalizzato).forEach(function(tipo) {
                var prezzoP = cliente.listino_personalizzato[tipo];
                var standard = listino.find(function(l) { return l.tipo_lavaggio === tipo; });
                var prezzoS = standard ? standard.prezzo_standard : prezzoP;
                var sconto = ((prezzoS - prezzoP) / prezzoS) * 100;

                listinoHtml += '<tr>' +
                    '<td>' + ENI.UI.escapeHtml(tipo) + '</td>' +
                    '<td><strong>' + ENI.UI.formatValuta(prezzoP) + '</strong></td>' +
                    '<td class="text-muted">' + ENI.UI.formatValuta(prezzoS) + '</td>' +
                    '<td>' + (sconto > 0
                        ? '<span class="listino-sconto discount">-' + sconto.toFixed(1) + '%</span>'
                        : sconto < 0
                            ? '<span class="listino-sconto surcharge">+' + Math.abs(sconto).toFixed(1) + '%</span>'
                            : '0%') +
                    '</td></tr>';
            });
            listinoHtml += '</tbody></table>';
        }

        var body =
            '<div class="credito-dettaglio">' +
                '<div class="credito-dettaglio-header">' +
                    '<div class="flex justify-between items-center">' +
                        '<h3>' + ENI.UI.escapeHtml(cliente.nome_ragione_sociale) + '</h3>' +
                        ENI.UI.badgeStato(cliente.tipo) +
                    '</div>' +
                '</div>' +
                '<div class="credito-dettaglio-body">' +
                    _infoRow('Modalit\u00E0 Pagamento', _pagLabel(cliente.modalita_pagamento)) +
                    (cliente.p_iva_coe ? _infoRow('P.IVA / COE', cliente.p_iva_coe) : '') +
                    (cliente.targa ? _infoRow('Targa', cliente.targa) : '') +
                    (cliente.telefono ? _infoRow('Telefono', cliente.telefono) : '') +
                    (cliente.email ? _infoRow('Email', cliente.email) : '') +
                    (cliente.note ? _infoRow('Note', cliente.note) : '') +
                    _infoRow('Cliente dal', ENI.UI.formatDataCompleta(cliente.created_at)) +
                    listinoHtml +
                '</div>' +
            '</div>';

        ENI.UI.showModal({
            title: '\u{1F464} Dettaglio Cliente',
            body: body,
            footer: canWrite
                ? '<button class="btn btn-outline" data-modal-close>Chiudi</button>'
                : '<button class="btn btn-outline" data-modal-close>Chiudi</button>'
        });
    }

    function _infoRow(label, value) {
        return '<div class="credito-info-row">' +
            '<span class="credito-info-label">' + label + '</span>' +
            '<span class="credito-info-value">' + ENI.UI.escapeHtml(String(value)) + '</span>' +
        '</div>';
    }

    function _pagLabel(value) {
        var found = ENI.Config.MODALITA_PAGAMENTO.find(function(m) { return m.value === value; });
        return found ? found.label : value;
    }

    return { render: render };
})();
