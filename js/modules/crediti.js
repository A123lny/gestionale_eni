// ============================================================
// GESTIONALE ENI - Modulo Crediti
// Inserimento manuale crediti, incasso, annullamento
// ============================================================

var ENI = ENI || {};
ENI.Modules = ENI.Modules || {};

ENI.Modules.Crediti = (function() {
    'use strict';

    var _crediti = [];
    var _filtroStato = 'Aperto';

    async function render(container) {
        container.innerHTML =
            '<div class="page-header">' +
                '<h1 class="page-title">\u{1F4B3} Crediti</h1>' +
                '<button class="btn btn-primary" id="btn-nuovo-credito">\u2795 Nuovo Credito</button>' +
            '</div>' +

            // Filtri stato
            '<div class="filter-bar">' +
                '<div class="filter-chips">' +
                    '<button class="chip active" data-stato="Aperto">\u{1F7E1} Aperti</button>' +
                    '<button class="chip" data-stato="Incassato">\u{1F7E2} Incassati</button>' +
                    '<button class="chip" data-stato="Scaduto">\u{1F534} Scaduti</button>' +
                    '<button class="chip" data-stato="Tutti">Tutti</button>' +
                '</div>' +
            '</div>' +

            '<div id="crediti-summary"></div>' +
            '<div id="crediti-list"></div>';

        _setupEvents(container);
        await _loadCrediti();
    }

    function _setupEvents(container) {
        container.querySelector('#btn-nuovo-credito').addEventListener('click', _showFormNuovoCredito);

        ENI.UI.delegate(container, 'click', '.chip[data-stato]', function(e, el) {
            _filtroStato = el.dataset.stato;
            container.querySelectorAll('.chip[data-stato]').forEach(function(c) {
                c.classList.toggle('active', c.dataset.stato === _filtroStato);
            });
            _loadCrediti();
        });

        ENI.UI.delegate(container, 'click', '[data-incassa-id]', function(e, el) {
            e.stopPropagation();
            _showIncassoForm(el.dataset.incassaId);
        });

        ENI.UI.delegate(container, 'click', '[data-annulla-id]', function(e, el) {
            e.stopPropagation();
            _annullaCredito(el.dataset.annullaId);
        });

        ENI.UI.delegate(container, 'click', '[data-credito-id]', function(e, el) {
            _showDettaglio(el.dataset.creditoId);
        });
    }

    async function _loadCrediti() {
        try {
            _crediti = await ENI.API.getCrediti(_filtroStato);
            _renderSummary();
            _renderList();
        } catch(e) {
            ENI.UI.error('Errore caricamento crediti');
            console.error(e);
        }
    }

    function _renderSummary() {
        var el = document.getElementById('crediti-summary');
        if (!el) return;

        var aperti = _crediti.filter(function(c) { return c.stato === 'Aperto'; });
        var totale = aperti.reduce(function(sum, c) { return sum + Number(c.importo || 0); }, 0);
        var scaduti = aperti.filter(function(c) {
            return c.scadenza && new Date(c.scadenza) < new Date();
        });

        if (_filtroStato === 'Aperto' || _filtroStato === 'Tutti') {
            el.innerHTML =
                '<div class="card mb-4" style="background: linear-gradient(135deg, #1A1A1A, #333);">' +
                    '<div class="flex justify-between items-center">' +
                        '<div>' +
                            '<div class="text-sm" style="color: #FFD100; opacity: 0.8;">Totale Crediti Aperti</div>' +
                            '<div class="text-bold" style="color: #FFD100; font-size: 1.75rem;">' + ENI.UI.formatValuta(totale) + '</div>' +
                        '</div>' +
                        (scaduti.length > 0
                            ? '<div style="color: #EF4444; font-size: 0.875rem;">\u26A0\uFE0F ' + scaduti.length + ' scadut' + (scaduti.length === 1 ? 'o' : 'i') + '</div>'
                            : '') +
                    '</div>' +
                '</div>';
        } else {
            el.innerHTML = '';
        }
    }

    function _renderList() {
        var listEl = document.getElementById('crediti-list');
        if (!listEl) return;

        if (_crediti.length === 0) {
            listEl.innerHTML =
                '<div class="empty-state">' +
                    '<div class="empty-state-icon">\u{1F4B3}</div>' +
                    '<p class="empty-state-text">Nessun credito trovato</p>' +
                '</div>';
            return;
        }

        var html = '<div class="table-wrapper"><table class="table">' +
            '<thead><tr>' +
                '<th>Data</th>' +
                '<th>Cliente</th>' +
                '<th>Importo</th>' +
                '<th>Causale</th>' +
                '<th>Stato</th>' +
                '<th>Scadenza</th>' +
                '<th>Azioni</th>' +
            '</tr></thead><tbody>';

        _crediti.forEach(function(c) {
            var isAperto = c.stato === 'Aperto';
            var isScaduto = c.scadenza && new Date(c.scadenza) < new Date() && c.stato === 'Aperto';

            html +=
                '<tr data-credito-id="' + c.id + '" style="cursor:pointer;">' +
                    '<td class="text-sm">' + ENI.UI.formatData(c.created_at) + '</td>' +
                    '<td><strong>' + ENI.UI.escapeHtml(c.nome_cliente) + '</strong></td>' +
                    '<td><strong>' + ENI.UI.formatValuta(c.importo) + '</strong></td>' +
                    '<td class="text-sm text-muted">' + ENI.UI.escapeHtml(c.causale || '-') + '</td>' +
                    '<td>' + ENI.UI.badgeStato(isScaduto ? 'Scaduto' : c.stato) + '</td>' +
                    '<td class="text-sm">' + (c.scadenza ? ENI.UI.formatData(c.scadenza) : '-') + '</td>' +
                    '<td class="table-actions">' +
                        (isAperto
                            ? '<button class="btn btn-sm btn-success" data-incassa-id="' + c.id + '" title="Incassa">\u{1F4B0}</button>' +
                              '<button class="btn btn-sm btn-ghost" data-annulla-id="' + c.id + '" title="Annulla">\u274C</button>'
                            : '') +
                    '</td>' +
                '</tr>';
        });

        html += '</tbody></table></div>';
        listEl.innerHTML = html;
    }

    // --- Form Nuovo Credito ---

    async function _showFormNuovoCredito() {
        var clienti = [];
        try { clienti = await ENI.API.getClienti(); } catch(e) {}

        var clientiOptions = '<option value="">-- Nessun cliente --</option>';
        clienti.forEach(function(c) {
            var icon = c.tipo === 'Corporate' ? '\u{1F3E2}' : '\u{1F464}';
            clientiOptions += '<option value="' + c.id + '" data-nome="' + ENI.UI.escapeHtml(c.nome_ragione_sociale) + '">' +
                icon + ' ' + ENI.UI.escapeHtml(c.nome_ragione_sociale) + '</option>';
        });

        var scadenzaDefault = new Date();
        scadenzaDefault.setDate(scadenzaDefault.getDate() + ENI.Config.CREDITO_SCADENZA_GIORNI);
        var scadenzaISO = scadenzaDefault.toISOString().split('T')[0];

        var body =
            '<form>' +
                '<div class="form-group">' +
                    '<label class="form-label">Cliente registrato</label>' +
                    '<select class="form-select" id="cred-cliente">' + clientiOptions + '</select>' +
                '</div>' +
                '<div class="form-group">' +
                    '<label class="form-label form-label-required">Nome / Descrizione</label>' +
                    '<input type="text" class="form-input" id="cred-nome" placeholder="es. Mario Rossi, Azienda XYZ...">' +
                '</div>' +
                '<div class="form-row">' +
                    '<div class="form-group">' +
                        '<label class="form-label form-label-required">Importo \u20AC</label>' +
                        '<input type="number" step="0.01" min="0.01" class="form-input" id="cred-importo">' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label class="form-label">Scadenza</label>' +
                        '<input type="date" class="form-input" id="cred-scadenza" value="' + scadenzaISO + '">' +
                    '</div>' +
                '</div>' +
                '<div class="form-group">' +
                    '<label class="form-label form-label-required">Causale</label>' +
                    '<input type="text" class="form-input" id="cred-causale" placeholder="es. Carburante, Lavaggio, Prodotti bar...">' +
                '</div>' +
                '<div class="form-group">' +
                    '<label class="form-label">Note</label>' +
                    '<textarea class="form-textarea" id="cred-note" rows="2"></textarea>' +
                '</div>' +
            '</form>';

        var modal = ENI.UI.showModal({
            title: '\u2795 Nuovo Credito',
            body: body,
            footer:
                '<button class="btn btn-outline" data-modal-close>Annulla</button>' +
                '<button class="btn btn-primary" id="btn-salva-credito">\u{1F4BE} Salva Credito</button>'
        });

        // Auto-compila nome quando selezioni cliente
        var clienteSelect = modal.querySelector('#cred-cliente');
        var nomeInput = modal.querySelector('#cred-nome');
        clienteSelect.addEventListener('change', function() {
            var opt = clienteSelect.options[clienteSelect.selectedIndex];
            if (opt && opt.value) {
                nomeInput.value = opt.dataset.nome || '';
            }
        });

        // Salva
        modal.querySelector('#btn-salva-credito').addEventListener('click', async function() {
            var nome = nomeInput.value.trim();
            var importo = parseFloat(modal.querySelector('#cred-importo').value);
            var causale = modal.querySelector('#cred-causale').value.trim();

            if (!nome || isNaN(importo) || importo <= 0 || !causale) {
                ENI.UI.warning('Compila nome, importo e causale');
                return;
            }

            var clienteOpt = clienteSelect.options[clienteSelect.selectedIndex];
            var clienteId = clienteOpt && clienteOpt.value ? clienteOpt.value : null;

            try {
                await ENI.API.creaCredito({
                    cliente_id: clienteId,
                    nome_cliente: nome,
                    importo: importo,
                    causale: causale,
                    origine: 'Manuale',
                    scadenza: modal.querySelector('#cred-scadenza').value || null,
                    note: modal.querySelector('#cred-note').value.trim() || null
                });
                ENI.UI.closeModal(modal);
                ENI.UI.success('Credito registrato');
                await _loadCrediti();
            } catch(e) {
                ENI.UI.error('Errore: ' + e.message);
            }
        });
    }

    // --- Dettaglio Credito ---

    function _showDettaglio(id) {
        var credito = _crediti.find(function(c) { return c.id === id; });
        if (!credito) return;

        var isScaduto = credito.scadenza && new Date(credito.scadenza) < new Date() && credito.stato === 'Aperto';

        var body =
            '<div class="credito-dettaglio">' +
                '<div class="credito-dettaglio-header">' +
                    '<div class="flex justify-between items-center">' +
                        '<h3>' + ENI.UI.escapeHtml(credito.codice) + '</h3>' +
                        ENI.UI.badgeStato(isScaduto ? 'Scaduto' : credito.stato) +
                    '</div>' +
                '</div>' +
                '<div class="credito-dettaglio-body">' +
                    _infoRow('Cliente', credito.nome_cliente) +
                    _infoRow('Importo', ENI.UI.formatValuta(credito.importo)) +
                    _infoRow('Causale', credito.causale || '-') +
                    _infoRow('Origine', credito.origine || '-') +
                    _infoRow('Data Creazione', ENI.UI.formatDataOra(credito.created_at)) +
                    _infoRow('Scadenza', credito.scadenza ? ENI.UI.formatDataCompleta(credito.scadenza) : '-') +
                    (credito.stato === 'Incassato'
                        ? _infoRow('Data Incasso', ENI.UI.formatDataCompleta(credito.data_incasso)) +
                          _infoRow('Modalit\u00E0 Incasso', credito.modalita_incasso || '-')
                        : '') +
                    (credito.note ? _infoRow('Note', credito.note) : '') +
                '</div>' +
            '</div>';

        ENI.UI.showModal({
            title: '\u{1F4B3} Dettaglio Credito',
            body: body,
            footer: '<button class="btn btn-outline" data-modal-close>Chiudi</button>'
        });
    }

    function _infoRow(label, value) {
        return '<div class="credito-info-row">' +
            '<span class="credito-info-label">' + label + '</span>' +
            '<span class="credito-info-value">' + ENI.UI.escapeHtml(String(value || '')) + '</span>' +
        '</div>';
    }

    // --- Incasso ---

    function _showIncassoForm(id) {
        var credito = _crediti.find(function(c) { return c.id === id; });
        if (!credito) return;

        var body =
            '<p class="mb-4">Cliente: <strong>' + ENI.UI.escapeHtml(credito.nome_cliente) + '</strong><br>' +
            'Importo: <strong>' + ENI.UI.formatValuta(credito.importo) + '</strong></p>' +
            '<div class="form-group">' +
                '<label class="form-label form-label-required">Modalit\u00E0 Incasso</label>' +
                '<select class="form-select" id="incasso-modalita">' +
                    ENI.Config.MODALITA_INCASSO.map(function(m) {
                        return '<option value="' + m.value + '">' + m.label + '</option>';
                    }).join('') +
                '</select>' +
            '</div>' +
            '<div class="form-group">' +
                '<label class="form-label">Note</label>' +
                '<textarea class="form-textarea" id="incasso-note" rows="2"></textarea>' +
            '</div>';

        var modal = ENI.UI.showModal({
            title: '\u{1F4B0} Incassa Credito ' + credito.codice,
            body: body,
            footer:
                '<button class="btn btn-outline" data-modal-close>Annulla</button>' +
                '<button class="btn btn-success" id="btn-conferma-incasso">\u2705 Conferma Incasso</button>'
        });

        modal.querySelector('#btn-conferma-incasso').addEventListener('click', async function() {
            var modalita = modal.querySelector('#incasso-modalita').value;
            var note = modal.querySelector('#incasso-note').value.trim();

            try {
                await ENI.API.incassaCredito(id, credito, modalita, note);
                ENI.UI.closeModal(modal);
                ENI.UI.success('Credito ' + credito.codice + ' incassato');
                await _loadCrediti();
            } catch(e) {
                ENI.UI.error('Errore: ' + e.message);
            }
        });
    }

    // --- Annulla ---

    async function _annullaCredito(id) {
        var credito = _crediti.find(function(c) { return c.id === id; });
        if (!credito) return;

        var ok = await ENI.UI.confirm({
            title: '\u274C Annulla Credito',
            message: 'Vuoi annullare il credito ' + credito.codice + ' di ' + ENI.UI.formatValuta(credito.importo) + '?',
            confirmText: 'Annulla Credito',
            cancelText: 'Indietro',
            danger: true
        });

        if (!ok) return;

        try {
            await ENI.API.annullaCredito(id, credito);
            ENI.UI.success('Credito annullato');
            await _loadCrediti();
        } catch(e) {
            ENI.UI.error('Errore: ' + e.message);
        }
    }

    return { render: render };
})();
