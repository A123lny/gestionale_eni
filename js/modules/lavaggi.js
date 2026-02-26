// ============================================================
// GESTIONALE ENI - Modulo Lavaggi
// Prenotazioni, timeline, tabella, walk-in, completamento
// ============================================================

var ENI = ENI || {};
ENI.Modules = ENI.Modules || {};

ENI.Modules.Lavaggi = (function() {
    'use strict';

    var _lavaggi = [];
    var _dataSelezionata = ENI.UI.oggiISO();
    var _vistaCorrente = 'tabella';
    var _meseCorrente = parseInt(ENI.UI.oggiISO().split('-')[1], 10);
    var _annoCorrente = parseInt(ENI.UI.oggiISO().split('-')[0], 10);

    function _canEditListino() {
        var ruolo = ENI.State.getUserRole();
        return ruolo === 'Admin' || ruolo === 'Cassiere';
    }

    async function render(container) {
        var listinoChip = _canEditListino()
            ? '<button class="chip ' + (_vistaCorrente === 'listino' ? 'active' : '') + '" data-vista="listino">\u{1F4B0} Listino</button>'
            : '';

        container.innerHTML =
            '<div class="page-header">' +
                '<h1 class="page-title">\u{1F697} Lavaggi</h1>' +
                '<div class="btn-group" id="lavaggi-actions">' +
                    '<button class="btn btn-primary" id="btn-nuovo-lavaggio">\u{1F4C5} Prenota</button>' +
                    '<button class="btn btn-outline" id="btn-walkin">\u{1F6B6} Walk-in</button>' +
                '</div>' +
            '</div>' +

            '<div class="filter-bar">' +
                '<input type="date" class="form-input" id="lavaggi-data" value="' + _dataSelezionata + '"' +
                    (_vistaCorrente === 'listino' ? ' style="display:none;"' : '') + '>' +
                '<div class="filter-chips">' +
                    '<button class="chip ' + (_vistaCorrente === 'tabella' ? 'active' : '') + '" data-vista="tabella">\u{1F4CB} Tabella</button>' +
                    '<button class="chip ' + (_vistaCorrente === 'timeline' ? 'active' : '') + '" data-vista="timeline">\u{1F3A8} Timeline</button>' +
                    '<button class="chip ' + (_vistaCorrente === 'calendario' ? 'active' : '') + '" data-vista="calendario">\u{1F4C5} Calendario</button>' +
                    listinoChip +
                '</div>' +
            '</div>' +

            '<div id="lavaggi-content"></div>';

        _setupEvents(container);
        if (_vistaCorrente === 'listino') {
            _renderListino();
        } else {
            await _loadLavaggi();
        }
    }

    function _setupEvents(container) {
        if (container._lavaggiEventsSetup) return;
        container._lavaggiEventsSetup = true;

        var dateInput = container.querySelector('#lavaggi-data');
        if (dateInput) {
            dateInput.addEventListener('change', function(e) {
                _dataSelezionata = e.target.value;
                var parts = _dataSelezionata.split('-');
                _annoCorrente = parseInt(parts[0], 10);
                _meseCorrente = parseInt(parts[1], 10);
                _loadLavaggi();
            });
        }

        ENI.UI.delegate(container, 'click', '.chip[data-vista]', function(e, el) {
            _vistaCorrente = el.dataset.vista;
            container.querySelectorAll('.chip[data-vista]').forEach(function(c) {
                c.classList.toggle('active', c.dataset.vista === _vistaCorrente);
            });

            var dateInput = container.querySelector('#lavaggi-data');
            var actionsEl = container.querySelector('#lavaggi-actions');
            if (_vistaCorrente === 'listino') {
                if (dateInput) dateInput.style.display = 'none';
                if (actionsEl) actionsEl.style.display = 'none';
                _renderListino();
            } else if (_vistaCorrente === 'calendario') {
                if (dateInput) dateInput.style.display = 'none';
                if (actionsEl) actionsEl.style.display = 'none';
                _renderCalendario();
            } else {
                if (dateInput) dateInput.style.display = '';
                if (actionsEl) actionsEl.style.display = '';
                _renderContent();
            }
        });

        container.querySelector('#btn-nuovo-lavaggio').addEventListener('click', function() {
            _showFormLavaggio(false);
        });

        container.querySelector('#btn-walkin').addEventListener('click', function() {
            _showFormLavaggio(true);
        });

        ENI.UI.delegate(container, 'click', '[data-completa-id]', function(e, el) {
            e.stopPropagation();
            _completaLavaggio(el.dataset.completaId);
        });

        ENI.UI.delegate(container, 'click', '[data-annulla-id]', function(e, el) {
            e.stopPropagation();
            _annullaLavaggio(el.dataset.annullaId);
        });

        ENI.UI.delegate(container, 'click', '[data-modifica-id]', function(e, el) {
            e.stopPropagation();
            _showModificaLavaggio(el.dataset.modificaId);
        });

        ENI.UI.delegate(container, 'click', '[data-elimina-id]', function(e, el) {
            e.stopPropagation();
            _eliminaLavaggio(el.dataset.eliminaId);
        });

        // Listino actions
        ENI.UI.delegate(container, 'click', '#btn-nuovo-tipo', function() {
            _showFormListino(null);
        });

        ENI.UI.delegate(container, 'click', '[data-modifica-listino]', function(e, el) {
            e.stopPropagation();
            _showFormListino(el.dataset.modificaListino);
        });

        ENI.UI.delegate(container, 'click', '[data-elimina-listino]', function(e, el) {
            e.stopPropagation();
            _eliminaListino(el.dataset.eliminaListino);
        });

        ENI.UI.delegate(container, 'click', '[data-move-up]', function(e, el) {
            e.stopPropagation();
            _moveListino(el.dataset.moveUp, -1);
        });

        ENI.UI.delegate(container, 'click', '[data-move-down]', function(e, el) {
            e.stopPropagation();
            _moveListino(el.dataset.moveDown, 1);
        });
    }

    async function _loadLavaggi() {
        try {
            _lavaggi = await ENI.API.getLavaggiPerData(_dataSelezionata);
            _renderContent();
        } catch(e) {
            ENI.UI.error('Errore caricamento lavaggi');
            console.error(e);
        }
    }

    function _renderContent() {
        if (_vistaCorrente === 'timeline') {
            _renderTimeline();
        } else if (_vistaCorrente === 'listino') {
            _renderListino();
        } else if (_vistaCorrente === 'calendario') {
            _renderCalendario();
        } else {
            _renderTabella();
        }
    }

    // --- Tabella ---

    function _renderTabella() {
        var contentEl = document.getElementById('lavaggi-content');
        if (!contentEl) return;

        if (_lavaggi.length === 0) {
            contentEl.innerHTML =
                '<div class="empty-state">' +
                    '<div class="empty-state-icon">\u{1F697}</div>' +
                    '<p class="empty-state-text">Nessun lavaggio per questa data</p>' +
                '</div>';
            return;
        }

        var html = '<div class="table-wrapper"><table class="table">' +
            '<thead><tr>' +
                '<th>Orario</th>' +
                '<th>Veicolo</th>' +
                '<th>Cliente</th>' +
                '<th>Tipo</th>' +
                '<th>Prezzo</th>' +
                '<th>Priorit\u00E0</th>' +
                '<th>Stato</th>' +
                '<th>Azioni</th>' +
            '</tr></thead><tbody>';

        _lavaggi.forEach(function(l) {
            var orario = ENI.UI.formatOra(l.orario_inizio) + '-' + ENI.UI.formatOra(l.orario_fine);
            var isPrenotato = l.stato === 'Prenotato';

            html +=
                '<tr>' +
                    '<td class="text-sm">' + orario + '</td>' +
                    '<td><strong>' + ENI.UI.escapeHtml(l.veicolo || '-') + '</strong></td>' +
                    '<td class="text-sm">' +
                        ENI.UI.escapeHtml(l.nome_cliente) +
                        (l.walk_in ? ' <span class="badge badge-annullato">walk-in</span>' : '') +
                        (l.cellulare ? '<br><a href="tel:' + ENI.UI.escapeHtml(l.cellulare) + '" class="text-xs text-muted">\u{1F4F1} ' + ENI.UI.escapeHtml(l.cellulare) + '</a>' : '') +
                    '</td>' +
                    '<td class="text-sm">' + ENI.UI.escapeHtml(l.tipo_lavaggio) +
                        (l.servizi_extra && l.servizi_extra.length > 0 ? ' <span class="badge badge-info" title="' + l.servizi_extra.map(function(e) { return e.nome; }).join(', ') + '">+' + l.servizi_extra.length + ' extra</span>' : '') +
                    '</td>' +
                    '<td><strong>' + ENI.UI.formatValuta(l.prezzo) + '</strong></td>' +
                    '<td>' + (l.priorita ? ENI.UI.badgeStato(l.priorita) : '-') + '</td>' +
                    '<td>' + ENI.UI.badgeStato(l.stato) + '</td>' +
                    '<td class="table-actions">' +
                        (isPrenotato
                            ? '<button class="btn btn-sm btn-success" data-completa-id="' + l.id + '" title="Completa">\u2713</button>' +
                              '<button class="btn btn-sm btn-outline" data-modifica-id="' + l.id + '" title="Modifica">\u270F\uFE0F</button>' +
                              '<button class="btn btn-sm btn-ghost" data-annulla-id="' + l.id + '" title="Annulla">\u274C</button>'
                            : '') +
                        (l.stato === 'Completato'
                            ? '<button class="btn btn-sm btn-outline" data-modifica-id="' + l.id + '" title="Modifica">\u270F\uFE0F</button>'
                            : '') +
                        '<button class="btn btn-sm btn-ghost" data-elimina-id="' + l.id + '" title="Elimina definitivamente">\u{1F5D1}</button>' +
                    '</td>' +
                '</tr>';
        });

        html += '</tbody></table></div>';
        contentEl.innerHTML = html;
    }

    // --- Timeline ---

    function _renderTimeline() {
        var contentEl = document.getElementById('lavaggi-content');
        if (!contentEl) return;

        if (_lavaggi.length === 0) {
            contentEl.innerHTML =
                '<div class="empty-state">' +
                    '<div class="empty-state-icon">\u{1F697}</div>' +
                    '<p class="empty-state-text">Nessun lavaggio per questa data</p>' +
                '</div>';
            return;
        }

        var startHour = 7;
        var endHour = 21;
        var totalHours = endHour - startHour;

        // Header con etichette posizionate assolutamente: stesse % delle barre → allineamento perfetto
        var headerHtml = '<div class="timeline-header">';
        for (var h = startHour; h <= endHour; h++) {
            var labelLeft = ((h - startHour) / totalHours) * 100;
            headerHtml += '<span class="timeline-hour" style="left:' + labelLeft.toFixed(2) + '%">' +
                String(h).padStart(2, '0') + '</span>';
        }
        headerHtml += '</div>';

        var rowsHtml = '';
        _lavaggi.forEach(function(l) {
            if (!l.orario_inizio || !l.orario_fine) return;
            if (l.stato === 'Annullato') return;

            var start = _timeToHours(l.orario_inizio);
            var end = _timeToHours(l.orario_fine);

            var left = ((start - startHour) / totalHours) * 100;
            var width = ((end - start) / totalHours) * 100;

            left = Math.max(0, Math.min(left, 100));
            width = Math.max(2, Math.min(width, 100 - left));

            var barClass = l.stato === 'Completato' ? 'completato' :
                           l.priorita === 'LASCIA' ? 'lascia' : 'aspetta';

            var barLabel = (l.veicolo || l.nome_cliente) + ' - ' + l.tipo_lavaggio;

            // Barre più corte di ~1 ora: nascondi testo, accessibile solo via click
            var isShort = width < 8;

            rowsHtml +=
                '<div class="timeline-row">' +
                    '<div class="timeline-bar ' + barClass + (isShort ? ' timeline-bar-short' : '') + '" ' +
                        'data-bar-id="' + l.id + '" ' +
                        'style="left:' + left + '%;width:' + width + '%;" ' +
                        'title="' + ENI.UI.escapeHtml(barLabel) + ' ' + ENI.UI.formatValuta(l.prezzo) + '">' +
                        (isShort ? '' : ENI.UI.escapeHtml(barLabel)) +
                    '</div>' +
                '</div>';
        });

        var legendaHtml =
            '<div class="flex gap-4 mt-3 text-xs">' +
                '<span>\u{1F7E2} ASPETTA (alta priorit\u00E0)</span>' +
                '<span>\u{1F534} LASCIA (bassa priorit\u00E0)</span>' +
                '<span>\u2B1C Completato</span>' +
            '</div>';

        contentEl.innerHTML =
            '<div class="card">' +
                '<div class="timeline-container">' +
                    '<div class="timeline">' + headerHtml + rowsHtml + '</div>' +
                '</div>' +
                legendaHtml +
            '</div>';

        // Click su qualsiasi barra → mostra dettagli (utile per barre corte e su mobile)
        ENI.UI.delegate(contentEl, 'click', '[data-bar-id]', function(e, el) {
            var lav = _lavaggi.find(function(l) { return l.id === el.dataset.barId; });
            if (!lav) return;
            ENI.UI.showModal({
                title: ENI.UI.escapeHtml(lav.veicolo || lav.nome_cliente),
                body:
                    '<div class="credito-dettaglio-body">' +
                        '<div class="credito-info-row"><span class="credito-info-label">Tipo</span><span class="credito-info-value">' + ENI.UI.escapeHtml(lav.tipo_lavaggio) + '</span></div>' +
                        '<div class="credito-info-row"><span class="credito-info-label">Orario</span><span class="credito-info-value">' + ENI.UI.formatOra(lav.orario_inizio) + ' \u2013 ' + ENI.UI.formatOra(lav.orario_fine) + '</span></div>' +
                        '<div class="credito-info-row"><span class="credito-info-label">Cliente</span><span class="credito-info-value">' + ENI.UI.escapeHtml(lav.nome_cliente) + '</span></div>' +
                        '<div class="credito-info-row"><span class="credito-info-label">Prezzo</span><span class="credito-info-value"><strong>' + ENI.UI.formatValuta(lav.prezzo) + '</strong></span></div>' +
                        '<div class="credito-info-row"><span class="credito-info-label">Stato</span><span class="credito-info-value">' + ENI.UI.badgeStato(lav.stato) + '</span></div>' +
                        (lav.priorita ? '<div class="credito-info-row"><span class="credito-info-label">Priorit\u00E0</span><span class="credito-info-value">' + ENI.UI.badgeStato(lav.priorita) + '</span></div>' : '') +
                        (lav.cellulare ? '<div class="credito-info-row"><span class="credito-info-label">Cellulare</span><span class="credito-info-value"><a href="tel:' + ENI.UI.escapeHtml(lav.cellulare) + '">' + ENI.UI.escapeHtml(lav.cellulare) + '</a></span></div>' : '') +
                        (lav.note ? '<div class="credito-info-row"><span class="credito-info-label">Note</span><span class="credito-info-value">' + ENI.UI.escapeHtml(lav.note) + '</span></div>' : '') +
                        (lav.servizi_extra && lav.servizi_extra.length > 0
                            ? '<div class="credito-info-row"><span class="credito-info-label">Extra</span><span class="credito-info-value">' +
                                lav.servizi_extra.map(function(ex) { return ENI.UI.escapeHtml(ex.nome) + ' ' + ENI.UI.formatValuta(ex.prezzo); }).join('<br>') +
                              '</span></div>'
                            : '') +
                    '</div>',
                footer: '<button class="btn btn-outline" data-modal-close>Chiudi</button>'
            });
        });
    }

    function _timeToHours(timeStr) {
        var parts = timeStr.split(':');
        return parseInt(parts[0], 10) + parseInt(parts[1] || 0, 10) / 60;
    }

    // --- Form Nuovo Lavaggio ---

    async function _showFormLavaggio(isWalkin) {
        var clienti = await ENI.API.getClienti();
        var listino = await ENI.API.getListino();

        // Dropdown clienti - anonimo di default per entrambi
        var clientiOptions = '<option value="">-- Nessun cliente (anonimo) --</option>';
        clienti.forEach(function(c) {
            var icon = c.tipo === 'Corporate' ? '\u{1F3E2}' : '\u{1F464}';
            clientiOptions += '<option value="' + c.id + '"' +
                ' data-tipo="' + c.tipo + '"' +
                ' data-pagamento="' + c.modalita_pagamento + '"' +
                ' data-telefono="' + ENI.UI.escapeHtml(c.telefono || '') + '"' +
                ' data-listino=\'' + (c.listino_personalizzato ? JSON.stringify(c.listino_personalizzato) : '') + '\'>' +
                icon + ' ' + ENI.UI.escapeHtml(c.nome_ragione_sociale) +
            '</option>';
        });

        var listinoOptions = listino.map(function(l) {
            return '<option value="' + ENI.UI.escapeHtml(l.tipo_lavaggio) + '" data-prezzo="' + l.prezzo_standard + '" data-durata="' + (l.durata_minuti || 30) + '">' +
                l.tipo_lavaggio + ' - ' + ENI.UI.formatValuta(l.prezzo_standard) +
            '</option>';
        }).join('');

        var body =
            '<form id="form-lavaggio">' +
                (isWalkin
                    ? '<div class="stock-alert mb-4"><span>\u{1F6B6}</span> Walk-in: il lavaggio verr\u00E0 registrato come gi\u00E0 completato</div>'
                    : '') +

                // Veicolo e Cellulare (obbligatori)
                '<div class="form-row">' +
                    '<div class="form-group">' +
                        '<label class="form-label form-label-required">Veicolo</label>' +
                        '<input type="text" class="form-input" id="lav-veicolo" placeholder="es. Fiat Panda grigia, BMW X3 bianca...">' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label class="form-label form-label-required">Cellulare</label>' +
                        '<input type="tel" class="form-input" id="lav-cellulare" placeholder="es. 333 1234567">' +
                    '</div>' +
                '</div>' +

                // Cliente (opzionale) con bottone + Nuovo
                '<div class="form-group">' +
                    '<label class="form-label">Cliente registrato</label>' +
                    '<div style="display:flex;gap:8px;">' +
                        '<select class="form-select" id="lav-cliente" style="flex:1;">' + clientiOptions + '</select>' +
                        '<button type="button" class="btn btn-outline" id="btn-nuovo-cliente-inline" title="Nuovo Cliente">+ Nuovo</button>' +
                    '</div>' +
                    '<div id="lav-cliente-info" class="text-xs text-muted mt-1"></div>' +
                '</div>' +

                // Tipo lavaggio e prezzo
                '<div class="form-row">' +
                    '<div class="form-group">' +
                        '<label class="form-label form-label-required">Tipo Lavaggio</label>' +
                        '<select class="form-select" id="lav-tipo">' +
                            '<option value="">Seleziona...</option>' +
                            listinoOptions +
                        '</select>' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label class="form-label form-label-required">Prezzo \u20AC</label>' +
                        '<input type="number" step="0.01" min="0" class="form-input" id="lav-prezzo">' +
                        '<div id="lav-prezzo-info" class="text-xs text-muted mt-1"></div>' +
                    '</div>' +
                '</div>' +

                // Servizi Extra
                '<div class="form-group">' +
                    '<label class="form-label">Servizi Extra</label>' +
                    '<div id="lav-extra-container" class="extra-servizi-list">' +
                        ENI.Config.SERVIZI_EXTRA_LAVAGGIO.map(function(s, i) {
                            return '<div class="extra-servizio-row">' +
                                '<label class="form-check" style="flex:1;">' +
                                    '<input type="checkbox" class="lav-extra-check" data-extra-index="' + i + '"> ' +
                                    ENI.UI.escapeHtml(s.nome) +
                                '</label>' +
                                '<input type="number" step="0.01" min="0" class="form-input lav-extra-prezzo" data-extra-index="' + i + '" value="' + s.prezzo.toFixed(2) + '" style="width: 80px; text-align: right;">' +
                                '<span class="text-sm text-muted">\u20AC</span>' +
                            '</div>';
                        }).join('') +
                    '</div>' +
                    '<div id="lav-extra-totale" class="extra-totale" style="display:none;"></div>' +
                '</div>' +

                // Orario e priorita (solo prenota)
                (!isWalkin ?
                    '<div class="form-row">' +
                        '<div class="form-group">' +
                            '<label class="form-label">Orario Inizio</label>' +
                            '<input type="time" class="form-input" id="lav-inizio" value="' + ENI.UI.oraCorrente() + '">' +
                        '</div>' +
                        '<div class="form-group">' +
                            '<label class="form-label">Orario Fine</label>' +
                            '<input type="time" class="form-input" id="lav-fine">' +
                        '</div>' +
                    '</div>' +

                    '<div class="form-group">' +
                        '<label class="form-label">Priorit\u00E0</label>' +
                        '<div class="form-row">' +
                            '<label class="form-check"><input type="radio" name="priorita" value="LASCIA" checked> \u{1F534} LASCIA</label>' +
                            '<label class="form-check"><input type="radio" name="priorita" value="ASPETTA"> \u{1F7E2} ASPETTA</label>' +
                        '</div>' +
                    '</div>'
                : '') +

                '<div class="form-group">' +
                    '<label class="form-label">Note</label>' +
                    '<textarea class="form-textarea" id="lav-note" rows="2"></textarea>' +
                '</div>' +
            '</form>';

        var modal = ENI.UI.showModal({
            title: isWalkin ? '\u{1F6B6} Walk-in' : '\u{1F4C5} Prenota Lavaggio',
            body: body,
            footer:
                '<button class="btn btn-outline" data-modal-close>Annulla</button>' +
                '<button class="btn btn-primary" id="btn-salva-lavaggio">' +
                    (isWalkin ? '\u2705 Fatto e Incassato' : '\u{1F4BE} Salva Lavaggio') +
                '</button>'
        });

        var tipoSelect = modal.querySelector('#lav-tipo');
        var clienteSelect = modal.querySelector('#lav-cliente');
        var prezzoInput = modal.querySelector('#lav-prezzo');
        var prezzoInfo = modal.querySelector('#lav-prezzo-info');
        var clienteInfo = modal.querySelector('#lav-cliente-info');
        var cellulareInput = modal.querySelector('#lav-cellulare');

        // Auto-prezzo da listino
        function _aggiornaPrezzo() {
            var tipoOpt = tipoSelect.options[tipoSelect.selectedIndex];
            if (!tipoOpt || !tipoOpt.value) return;

            var prezzoStandard = parseFloat(tipoOpt.dataset.prezzo);
            var clienteOpt = clienteSelect.options[clienteSelect.selectedIndex];
            var listinoCliente = clienteOpt && clienteOpt.dataset.listino ? JSON.parse(clienteOpt.dataset.listino) : null;

            if (listinoCliente && listinoCliente[tipoOpt.value] !== undefined) {
                prezzoInput.value = listinoCliente[tipoOpt.value];
                prezzoInfo.textContent = 'Standard: ' + ENI.UI.formatValuta(prezzoStandard) + ' \u2192 Personalizzato';
            } else {
                prezzoInput.value = prezzoStandard;
                prezzoInfo.textContent = '';
            }

            // Auto-calcola orario fine se prenota
            if (!isWalkin) {
                var inizioInput = modal.querySelector('#lav-inizio');
                var fineInput = modal.querySelector('#lav-fine');
                if (inizioInput.value && tipoOpt.dataset.durata) {
                    var parts = inizioInput.value.split(':');
                    var d = new Date();
                    d.setHours(parseInt(parts[0], 10), parseInt(parts[1], 10) + parseInt(tipoOpt.dataset.durata, 10));
                    fineInput.value = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
                }
            }
        }

        tipoSelect.addEventListener('change', _aggiornaPrezzo);

        // Cambio cliente: auto-compila cellulare e mostra info
        clienteSelect.addEventListener('change', function() {
            var opt = clienteSelect.options[clienteSelect.selectedIndex];
            if (opt && opt.value) {
                var telefono = opt.dataset.telefono;
                if (telefono) cellulareInput.value = telefono;
                var pag = opt.dataset.pagamento;
                var tipo = opt.dataset.tipo;
                var pagLabel = ENI.Config.MODALITA_PAGAMENTO.find(function(m) { return m.value === pag; });
                clienteInfo.innerHTML = tipo + ' - ' + (pagLabel ? pagLabel.label : pag);
            } else {
                clienteInfo.textContent = '';
            }
            _aggiornaPrezzo();
        });

        // Servizi extra: ricalcola totale
        function _aggiornaExtraTotale() {
            var checks = modal.querySelectorAll('.lav-extra-check');
            var totExtra = 0;
            checks.forEach(function(cb) {
                if (cb.checked) {
                    var idx = cb.dataset.extraIndex;
                    var prezzoExtra = parseFloat(modal.querySelector('.lav-extra-prezzo[data-extra-index="' + idx + '"]').value) || 0;
                    totExtra += prezzoExtra;
                }
            });
            var totaleEl = modal.querySelector('#lav-extra-totale');
            var prezzoBase = parseFloat(prezzoInput.value) || 0;
            if (totExtra > 0) {
                totaleEl.style.display = 'block';
                totaleEl.innerHTML = 'Base: ' + ENI.UI.formatValuta(prezzoBase) + ' + Extra: ' + ENI.UI.formatValuta(totExtra) + ' = <strong>Totale: ' + ENI.UI.formatValuta(prezzoBase + totExtra) + '</strong>';
            } else {
                totaleEl.style.display = 'none';
            }
        }

        modal.querySelectorAll('.lav-extra-check').forEach(function(cb) {
            cb.addEventListener('change', _aggiornaExtraTotale);
        });
        modal.querySelectorAll('.lav-extra-prezzo').forEach(function(inp) {
            inp.addEventListener('input', _aggiornaExtraTotale);
        });

        // Bottone + Nuovo cliente inline
        modal.querySelector('#btn-nuovo-cliente-inline').addEventListener('click', function() {
            _showFormNuovoClienteInline(modal, clienteSelect, cellulareInput, clienti);
        });

        // Salva lavaggio
        modal.querySelector('#btn-salva-lavaggio').addEventListener('click', async function() {
            var tipo = tipoSelect.value;
            var prezzo = parseFloat(prezzoInput.value);
            var veicolo = modal.querySelector('#lav-veicolo').value.trim();
            var cellulare = cellulareInput.value.trim();

            if (!veicolo) {
                ENI.UI.warning('Inserisci il veicolo (es. Fiat Panda grigia)');
                return;
            }
            if (!cellulare) {
                ENI.UI.warning('Inserisci il numero di cellulare');
                return;
            }
            if (!tipo || isNaN(prezzo) || prezzo <= 0) {
                ENI.UI.warning('Seleziona tipo lavaggio e verifica il prezzo');
                return;
            }

            var clienteOpt = clienteSelect.options[clienteSelect.selectedIndex];
            var clienteId = clienteOpt ? clienteOpt.value || null : null;
            var nomeCliente = clienteId
                ? clienteOpt.textContent.replace(/^[\u{1F3E2}\u{1F464}]\s*/u, '').trim()
                : 'Walk-in';

            // Raccogli servizi extra selezionati
            var serviziExtra = [];
            modal.querySelectorAll('.lav-extra-check').forEach(function(cb) {
                if (cb.checked) {
                    var idx = cb.dataset.extraIndex;
                    var prezzoExtra = parseFloat(modal.querySelector('.lav-extra-prezzo[data-extra-index="' + idx + '"]').value) || 0;
                    serviziExtra.push({
                        nome: ENI.Config.SERVIZI_EXTRA_LAVAGGIO[parseInt(idx, 10)].nome,
                        prezzo: prezzoExtra
                    });
                }
            });

            // Prezzo totale = base + extra
            var totExtra = serviziExtra.reduce(function(sum, s) { return sum + s.prezzo; }, 0);
            var prezzoTotale = prezzo + totExtra;

            var dati = {
                data: _dataSelezionata,
                cliente_id: clienteId || null,
                nome_cliente: nomeCliente,
                tipo_lavaggio: tipo,
                prezzo: prezzoTotale,
                veicolo: veicolo,
                cellulare: cellulare,
                walk_in: isWalkin,
                note: modal.querySelector('#lav-note').value.trim() || null,
                servizi_extra: serviziExtra
            };

            if (!isWalkin) {
                dati.orario_inizio = modal.querySelector('#lav-inizio').value || null;
                dati.orario_fine = modal.querySelector('#lav-fine').value || null;
                dati.priorita = modal.querySelector('input[name="priorita"]:checked').value;
                dati.stato = 'Prenotato';
            } else {
                dati.orario_inizio = ENI.UI.oraCorrente();
                dati.orario_fine = ENI.UI.oraCorrente();
                dati.priorita = null;
                dati.stato = 'Completato';
                dati.completato_at = new Date().toISOString();
                dati.utente_completamento = ENI.State.getUserId();
            }

            try {
                await ENI.API.salvaLavaggio(dati);
                ENI.UI.closeModal(modal);
                ENI.UI.success(isWalkin ? 'Walk-in registrato' : 'Lavaggio prenotato');
                await _loadLavaggi();
            } catch(e) {
                ENI.UI.error('Errore: ' + e.message);
            }
        });
    }

    // --- Form Nuovo Cliente Inline ---

    function _showFormNuovoClienteInline(parentModal, clienteSelect, cellulareInput, clientiArray) {
        var body =
            '<form>' +
                '<div class="form-row">' +
                    '<div class="form-group">' +
                        '<label class="form-label form-label-required">Nome / Ragione Sociale</label>' +
                        '<input type="text" class="form-input" id="nc-nome">' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label class="form-label form-label-required">Telefono</label>' +
                        '<input type="tel" class="form-input" id="nc-telefono">' +
                    '</div>' +
                '</div>' +
                '<div class="form-row">' +
                    '<div class="form-group">' +
                        '<label class="form-label">Tipo</label>' +
                        '<select class="form-select" id="nc-tipo">' +
                            '<option value="Privato" selected>Privato</option>' +
                            '<option value="Corporate">Corporate</option>' +
                        '</select>' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label class="form-label">Pagamento</label>' +
                        '<select class="form-select" id="nc-pagamento">' +
                            ENI.Config.MODALITA_PAGAMENTO.map(function(m) {
                                return '<option value="' + m.value + '"' + (m.value === 'Cash' ? ' selected' : '') + '>' + m.label + '</option>';
                            }).join('') +
                        '</select>' +
                    '</div>' +
                '</div>' +
            '</form>';

        var ncModal = ENI.UI.showModal({
            title: '\u2795 Nuovo Cliente Rapido',
            body: body,
            footer:
                '<button class="btn btn-outline" data-modal-close>Annulla</button>' +
                '<button class="btn btn-primary" id="btn-salva-nc">\u{1F4BE} Salva Cliente</button>'
        });

        ncModal.querySelector('#btn-salva-nc').addEventListener('click', async function() {
            var nome = ncModal.querySelector('#nc-nome').value.trim();
            var telefono = ncModal.querySelector('#nc-telefono').value.trim();

            if (!nome || !telefono) {
                ENI.UI.warning('Compila nome e telefono');
                return;
            }

            try {
                var record = await ENI.API.salvaCliente({
                    nome_ragione_sociale: nome,
                    tipo: ncModal.querySelector('#nc-tipo').value,
                    modalita_pagamento: ncModal.querySelector('#nc-pagamento').value,
                    telefono: telefono,
                    attivo: true
                });

                // Aggiungi alla lista e seleziona nel dropdown
                var icon = record.tipo === 'Corporate' ? '\u{1F3E2}' : '\u{1F464}';
                var newOpt = document.createElement('option');
                newOpt.value = record.id;
                newOpt.dataset.tipo = record.tipo;
                newOpt.dataset.pagamento = record.modalita_pagamento;
                newOpt.dataset.telefono = record.telefono || '';
                newOpt.dataset.listino = '';
                newOpt.textContent = icon + ' ' + record.nome_ragione_sociale;
                clienteSelect.appendChild(newOpt);
                clienteSelect.value = record.id;

                // Auto-compila cellulare
                if (telefono) cellulareInput.value = telefono;

                ENI.UI.closeModal(ncModal);
                ENI.UI.success('Cliente "' + nome + '" creato');
            } catch(e) {
                ENI.UI.error('Errore: ' + e.message);
            }
        });
    }

    // --- Completa Lavaggio ---

    async function _completaLavaggio(id) {
        var lavaggio = _lavaggi.find(function(l) { return l.id === id; });
        if (!lavaggio) return;

        // Se ci sono note, mostrare alert con riepilogo note prima di completare
        if (lavaggio.note && lavaggio.note.trim()) {
            var extraHtml = '';
            var extras = lavaggio.servizi_extra;
            if (extras && extras.length > 0) {
                extraHtml = '<div style="margin-top: 8px;"><strong>Servizi Extra:</strong><ul style="margin: 4px 0; padding-left: 20px;">';
                extras.forEach(function(ex) {
                    extraHtml += '<li>' + ENI.UI.escapeHtml(ex.nome) + ' - ' + ENI.UI.formatValuta(ex.prezzo) + '</li>';
                });
                extraHtml += '</ul></div>';
            }

            var noteModal = ENI.UI.showModal({
                title: '\u26A0\uFE0F Attenzione - Note del lavaggio',
                body:
                    '<div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 12px; margin-bottom: 12px;">' +
                        '<strong>NOTE:</strong><br>' +
                        '<span style="font-size: 1.05rem;">' + ENI.UI.escapeHtml(lavaggio.note) + '</span>' +
                    '</div>' +
                    '<div style="margin-bottom: 8px;">' +
                        '<strong>' + ENI.UI.escapeHtml(lavaggio.veicolo || lavaggio.nome_cliente) + '</strong> - ' +
                        lavaggio.tipo_lavaggio + ' - ' + ENI.UI.formatValuta(lavaggio.prezzo) +
                    '</div>' +
                    extraHtml,
                footer:
                    '<button class="btn btn-outline" data-modal-close>Annulla</button>' +
                    '<button class="btn btn-success" id="btn-conferma-note">Ho letto le note - Completa</button>'
            });

            noteModal.querySelector('#btn-conferma-note').addEventListener('click', async function() {
                ENI.UI.closeModal(noteModal);
                try {
                    await ENI.API.completaLavaggio(id, lavaggio);
                    ENI.UI.success('Lavaggio completato');
                    await _loadLavaggi();
                } catch(e) {
                    ENI.UI.error('Errore: ' + e.message);
                }
            });
            return;
        }

        // Senza note: conferma standard
        var msg = 'Completare il lavaggio?\n' +
                  (lavaggio.veicolo || lavaggio.nome_cliente) + ' - ' +
                  lavaggio.tipo_lavaggio + ' - ' + ENI.UI.formatValuta(lavaggio.prezzo);

        var ok = await ENI.UI.confirm({
            title: '\u2705 Completa Lavaggio',
            message: msg,
            confirmText: 'Completa',
            cancelText: 'Annulla'
        });

        if (!ok) return;

        try {
            await ENI.API.completaLavaggio(id, lavaggio);
            ENI.UI.success('Lavaggio completato');
            await _loadLavaggi();
        } catch(e) {
            ENI.UI.error('Errore: ' + e.message);
        }
    }

    // --- Listino Lavaggi ---

    var _listino = [];

    async function _renderListino() {
        var contentEl = document.getElementById('lavaggi-content');
        if (!contentEl) return;

        try {
            _listino = await ENI.API.getListinoCompleto();
        } catch(e) {
            ENI.UI.error('Errore caricamento listino');
            return;
        }

        var html =
            '<div class="flex justify-between items-center mb-4">' +
                '<h3>Listino Lavaggi</h3>' +
                '<button class="btn btn-primary" id="btn-nuovo-tipo">\u2795 Nuovo Tipo</button>' +
            '</div>';

        if (_listino.length === 0) {
            html += '<div class="empty-state"><p class="empty-state-text">Nessun tipo di lavaggio configurato</p></div>';
        } else {
            html += '<div class="table-wrapper"><table class="table">' +
                '<thead><tr>' +
                    '<th style="width:50px;">#</th>' +
                    '<th>Tipo Lavaggio</th>' +
                    '<th>Prezzo</th>' +
                    '<th>Durata</th>' +
                    '<th>Azioni</th>' +
                '</tr></thead><tbody>';

            _listino.forEach(function(item, idx) {
                var isFirst = idx === 0;
                var isLast = idx === _listino.length - 1;

                html +=
                    '<tr>' +
                        '<td class="text-center text-sm">' +
                            '<button class="btn btn-sm btn-ghost" data-move-up="' + item.id + '"' + (isFirst ? ' disabled style="opacity:0.2;"' : '') + ' title="Sposta su">\u25B2</button>' +
                            '<button class="btn btn-sm btn-ghost" data-move-down="' + item.id + '"' + (isLast ? ' disabled style="opacity:0.2;"' : '') + ' title="Sposta gi\u00F9">\u25BC</button>' +
                        '</td>' +
                        '<td><strong>' + ENI.UI.escapeHtml(item.tipo_lavaggio) + '</strong>' +
                            (item.descrizione ? '<br><span class="text-xs text-muted">' + ENI.UI.escapeHtml(item.descrizione) + '</span>' : '') +
                        '</td>' +
                        '<td><strong>' + ENI.UI.formatValuta(item.prezzo_standard) + '</strong></td>' +
                        '<td class="text-sm">' + (item.durata_minuti || 30) + ' min</td>' +
                        '<td class="table-actions">' +
                            '<button class="btn btn-sm btn-outline" data-modifica-listino="' + item.id + '" title="Modifica">\u270F\uFE0F</button>' +
                            '<button class="btn btn-sm btn-ghost" data-elimina-listino="' + item.id + '" title="Elimina">\u{1F5D1}</button>' +
                        '</td>' +
                    '</tr>';
            });

            html += '</tbody></table></div>';
        }

        contentEl.innerHTML = html;
    }

    function _showFormListino(id) {
        var item = id ? _listino.find(function(l) { return l.id === id; }) : null;
        var isEdit = !!item;

        var body =
            '<form>' +
                '<div class="form-group">' +
                    '<label class="form-label form-label-required">Nome Tipo Lavaggio</label>' +
                    '<input type="text" class="form-input" id="lst-tipo" value="' + (item ? ENI.UI.escapeHtml(item.tipo_lavaggio) : '') + '" placeholder="es. Esterno, Completo, Furgone...">' +
                '</div>' +
                '<div class="form-row">' +
                    '<div class="form-group">' +
                        '<label class="form-label form-label-required">Prezzo \u20AC</label>' +
                        '<input type="number" step="0.01" min="0.01" class="form-input" id="lst-prezzo" value="' + (item ? item.prezzo_standard : '') + '">' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label class="form-label">Durata (minuti)</label>' +
                        '<input type="number" min="5" step="5" class="form-input" id="lst-durata" value="' + (item ? (item.durata_minuti || 30) : '30') + '">' +
                    '</div>' +
                '</div>' +
                '<div class="form-group">' +
                    '<label class="form-label">Descrizione</label>' +
                    '<input type="text" class="form-input" id="lst-descrizione" value="' + (item && item.descrizione ? ENI.UI.escapeHtml(item.descrizione) : '') + '" placeholder="Opzionale">' +
                '</div>' +
            '</form>';

        var modal = ENI.UI.showModal({
            title: isEdit ? '\u270F\uFE0F Modifica Tipo Lavaggio' : '\u2795 Nuovo Tipo Lavaggio',
            body: body,
            footer:
                '<button class="btn btn-outline" data-modal-close>Annulla</button>' +
                '<button class="btn btn-primary" id="btn-salva-listino">\u{1F4BE} Salva</button>'
        });

        modal.querySelector('#btn-salva-listino').addEventListener('click', async function() {
            var tipo = modal.querySelector('#lst-tipo').value.trim();
            var prezzo = parseFloat(modal.querySelector('#lst-prezzo').value);
            var durata = parseInt(modal.querySelector('#lst-durata').value, 10) || 30;
            var descrizione = modal.querySelector('#lst-descrizione').value.trim() || null;

            if (!tipo || isNaN(prezzo) || prezzo <= 0) {
                ENI.UI.warning('Compila nome e prezzo');
                return;
            }

            try {
                var dati = {
                    tipo_lavaggio: tipo,
                    prezzo_standard: prezzo,
                    durata_minuti: durata,
                    descrizione: descrizione
                };

                if (isEdit) {
                    await ENI.API.aggiornaListino(id, dati);
                } else {
                    dati.attivo = true;
                    await ENI.API.salvaListino(dati);
                }

                ENI.UI.closeModal(modal);
                ENI.UI.success(isEdit ? 'Tipo lavaggio aggiornato' : 'Tipo lavaggio creato');
                await _renderListino();
            } catch(e) {
                ENI.UI.error('Errore: ' + e.message);
            }
        });
    }

    async function _eliminaListino(id) {
        var item = _listino.find(function(l) { return l.id === id; });
        if (!item) return;

        var ok = await ENI.UI.confirm({
            title: '\u{1F5D1} Elimina Tipo Lavaggio',
            message: 'Vuoi eliminare "' + item.tipo_lavaggio + '" dal listino?\nI lavaggi gi\u00E0 registrati non verranno modificati.',
            confirmText: 'Elimina',
            cancelText: 'Annulla',
            danger: true
        });

        if (!ok) return;

        try {
            await ENI.API.eliminaListino(id, item);
            ENI.UI.success('"' + item.tipo_lavaggio + '" eliminato');
            await _renderListino();
        } catch(e) {
            ENI.UI.error('Errore: ' + e.message);
        }
    }

    async function _moveListino(id, direction) {
        var idx = _listino.findIndex(function(l) { return l.id === id; });
        if (idx === -1) return;

        var swapIdx = idx + direction;
        if (swapIdx < 0 || swapIdx >= _listino.length) return;

        var itemA = _listino[idx];
        var itemB = _listino[swapIdx];

        try {
            var ordineA = itemA.ordine || idx;
            var ordineB = itemB.ordine || swapIdx;

            await ENI.API.riordinaListino(itemA.id, ordineB);
            await ENI.API.riordinaListino(itemB.id, ordineA);
            await _renderListino();
        } catch(e) {
            ENI.UI.error('Errore riordinamento');
        }
    }

    // --- Annulla Lavaggio ---

    async function _annullaLavaggio(id) {
        var lavaggio = _lavaggi.find(function(l) { return l.id === id; });
        if (!lavaggio) return;

        var msg = (lavaggio.veicolo || lavaggio.nome_cliente) + ' - ' +
                  lavaggio.tipo_lavaggio + ' - ' + ENI.UI.formatValuta(lavaggio.prezzo);

        var ok = await ENI.UI.confirm({
            title: '\u274C Annulla Lavaggio',
            message: 'Vuoi annullare il lavaggio?\n' + msg,
            confirmText: 'Annulla Lavaggio',
            cancelText: 'Indietro',
            danger: true
        });

        if (!ok) return;

        try {
            await ENI.API.annullaLavaggio(id, lavaggio);
            ENI.UI.success('Lavaggio ' + lavaggio.codice + ' annullato');
            await _loadLavaggi();
        } catch(e) {
            ENI.UI.error('Errore: ' + e.message);
        }
    }

    // --- Modifica Prenotazione ---

    async function _showModificaLavaggio(id) {
        var lavaggio = _lavaggi.find(function(l) { return l.id === id; });
        if (!lavaggio) return;

        var clienti = await ENI.API.getClienti();
        var listino = await ENI.API.getListino();

        var clientiOptions = '<option value="">-- Nessun cliente (anonimo) --</option>';
        clienti.forEach(function(c) {
            var icon = c.tipo === 'Corporate' ? '\u{1F3E2}' : '\u{1F464}';
            clientiOptions += '<option value="' + c.id + '"' +
                (c.id === lavaggio.cliente_id ? ' selected' : '') +
                ' data-tipo="' + c.tipo + '"' +
                ' data-pagamento="' + c.modalita_pagamento + '"' +
                ' data-telefono="' + ENI.UI.escapeHtml(c.telefono || '') + '"' +
                ' data-listino=\'' + (c.listino_personalizzato ? JSON.stringify(c.listino_personalizzato) : '') + '\'>' +
                icon + ' ' + ENI.UI.escapeHtml(c.nome_ragione_sociale) +
            '</option>';
        });

        var listinoOptions = listino.map(function(l) {
            return '<option value="' + ENI.UI.escapeHtml(l.tipo_lavaggio) + '"' +
                (l.tipo_lavaggio === lavaggio.tipo_lavaggio ? ' selected' : '') +
                ' data-prezzo="' + l.prezzo_standard + '" data-durata="' + (l.durata_minuti || 30) + '">' +
                l.tipo_lavaggio + ' - ' + ENI.UI.formatValuta(l.prezzo_standard) +
            '</option>';
        }).join('');

        var prioritaLascia = lavaggio.priorita === 'LASCIA' || !lavaggio.priorita;
        var orarioInizio = lavaggio.orario_inizio ? lavaggio.orario_inizio.substring(0, 5) : '';
        var orarioFine = lavaggio.orario_fine ? lavaggio.orario_fine.substring(0, 5) : '';

        var body =
            '<form id="form-modifica-lavaggio">' +
                '<div class="form-group">' +
                    '<label class="form-label form-label-required">Data</label>' +
                    '<input type="date" class="form-input" id="mod-data" value="' + (lavaggio.data || '') + '">' +
                '</div>' +
                '<div class="form-row">' +
                    '<div class="form-group">' +
                        '<label class="form-label form-label-required">Veicolo</label>' +
                        '<input type="text" class="form-input" id="mod-veicolo" value="' + ENI.UI.escapeHtml(lavaggio.veicolo || '') + '">' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label class="form-label form-label-required">Cellulare</label>' +
                        '<input type="tel" class="form-input" id="mod-cellulare" value="' + ENI.UI.escapeHtml(lavaggio.cellulare || '') + '">' +
                    '</div>' +
                '</div>' +
                '<div class="form-group">' +
                    '<label class="form-label">Cliente registrato</label>' +
                    '<select class="form-select" id="mod-cliente">' + clientiOptions + '</select>' +
                '</div>' +
                '<div class="form-row">' +
                    '<div class="form-group">' +
                        '<label class="form-label form-label-required">Tipo Lavaggio</label>' +
                        '<select class="form-select" id="mod-tipo">' +
                            '<option value="">Seleziona...</option>' + listinoOptions +
                        '</select>' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label class="form-label form-label-required">Prezzo Base \u20AC</label>' +
                        '<input type="number" step="0.01" min="0" class="form-input" id="mod-prezzo" value="' + (lavaggio.prezzo || '') + '">' +
                    '</div>' +
                '</div>' +
                // Servizi Extra (precompilati con quelli salvati)
                '<div class="form-group">' +
                    '<label class="form-label">Servizi Extra</label>' +
                    '<div id="mod-extra-container" class="extra-servizi-list">' +
                        ENI.Config.SERVIZI_EXTRA_LAVAGGIO.map(function(s, i) {
                            var existing = (lavaggio.servizi_extra || []).find(function(e) { return e.nome === s.nome; });
                            return '<div class="extra-servizio-row">' +
                                '<label class="form-check" style="flex:1;">' +
                                    '<input type="checkbox" class="mod-extra-check" data-extra-index="' + i + '"' + (existing ? ' checked' : '') + '> ' +
                                    ENI.UI.escapeHtml(s.nome) +
                                '</label>' +
                                '<input type="number" step="0.01" min="0" class="form-input mod-extra-prezzo" data-extra-index="' + i + '" value="' + (existing ? existing.prezzo.toFixed(2) : s.prezzo.toFixed(2)) + '" style="width: 80px; text-align: right;">' +
                                '<span class="text-sm text-muted">\u20AC</span>' +
                            '</div>';
                        }).join('') +
                    '</div>' +
                    '<div id="mod-extra-totale" class="extra-totale" style="display:none;"></div>' +
                '</div>' +
                '<div class="form-row">' +
                    '<div class="form-group">' +
                        '<label class="form-label">Orario Inizio</label>' +
                        '<input type="time" class="form-input" id="mod-inizio" value="' + orarioInizio + '">' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label class="form-label">Orario Fine</label>' +
                        '<input type="time" class="form-input" id="mod-fine" value="' + orarioFine + '">' +
                    '</div>' +
                '</div>' +
                '<div class="form-group">' +
                    '<label class="form-label">Priorit\u00E0</label>' +
                    '<div class="form-row">' +
                        '<label class="form-check"><input type="radio" name="mod-priorita" value="LASCIA"' + (prioritaLascia ? ' checked' : '') + '> \u{1F534} LASCIA</label>' +
                        '<label class="form-check"><input type="radio" name="mod-priorita" value="ASPETTA"' + (!prioritaLascia ? ' checked' : '') + '> \u{1F7E2} ASPETTA</label>' +
                    '</div>' +
                '</div>' +
                '<div class="form-group">' +
                    '<label class="form-label">Note</label>' +
                    '<textarea class="form-textarea" id="mod-note" rows="2">' + ENI.UI.escapeHtml(lavaggio.note || '') + '</textarea>' +
                '</div>' +
            '</form>';

        var modal = ENI.UI.showModal({
            title: '\u270F\uFE0F Modifica Prenotazione ' + lavaggio.codice,
            body: body,
            footer:
                '<button class="btn btn-outline" data-modal-close>Annulla</button>' +
                '<button class="btn btn-primary" id="btn-salva-modifica">\u{1F4BE} Salva Modifiche</button>'
        });

        // Servizi extra modifica: ricalcola totale
        function _aggiornaModExtraTotale() {
            var checks = modal.querySelectorAll('.mod-extra-check');
            var totExtra = 0;
            checks.forEach(function(cb) {
                if (cb.checked) {
                    var idx = cb.dataset.extraIndex;
                    var prezzoExtra = parseFloat(modal.querySelector('.mod-extra-prezzo[data-extra-index="' + idx + '"]').value) || 0;
                    totExtra += prezzoExtra;
                }
            });
            var totaleEl = modal.querySelector('#mod-extra-totale');
            var prezzoBase = parseFloat(modal.querySelector('#mod-prezzo').value) || 0;
            if (totExtra > 0) {
                totaleEl.style.display = 'block';
                totaleEl.innerHTML = 'Base: ' + ENI.UI.formatValuta(prezzoBase) + ' + Extra: ' + ENI.UI.formatValuta(totExtra) + ' = <strong>Totale: ' + ENI.UI.formatValuta(prezzoBase + totExtra) + '</strong>';
            } else {
                totaleEl.style.display = 'none';
            }
        }

        modal.querySelectorAll('.mod-extra-check').forEach(function(cb) {
            cb.addEventListener('change', _aggiornaModExtraTotale);
        });
        modal.querySelectorAll('.mod-extra-prezzo').forEach(function(inp) {
            inp.addEventListener('input', _aggiornaModExtraTotale);
        });
        _aggiornaModExtraTotale(); // Inizializza

        modal.querySelector('#btn-salva-modifica').addEventListener('click', async function() {
            var veicolo = modal.querySelector('#mod-veicolo').value.trim();
            var cellulare = modal.querySelector('#mod-cellulare').value.trim();
            var tipo = modal.querySelector('#mod-tipo').value;
            var prezzoBase = parseFloat(modal.querySelector('#mod-prezzo').value);

            if (!veicolo) { ENI.UI.warning('Inserisci il veicolo'); return; }
            if (!cellulare) { ENI.UI.warning('Inserisci il cellulare'); return; }
            if (!tipo || isNaN(prezzoBase) || prezzoBase <= 0) { ENI.UI.warning('Seleziona tipo lavaggio e verifica il prezzo'); return; }

            // Raccogli servizi extra
            var serviziExtra = [];
            modal.querySelectorAll('.mod-extra-check').forEach(function(cb) {
                if (cb.checked) {
                    var idx = cb.dataset.extraIndex;
                    var prezzoExtra = parseFloat(modal.querySelector('.mod-extra-prezzo[data-extra-index="' + idx + '"]').value) || 0;
                    serviziExtra.push({
                        nome: ENI.Config.SERVIZI_EXTRA_LAVAGGIO[parseInt(idx, 10)].nome,
                        prezzo: prezzoExtra
                    });
                }
            });

            var totExtra = serviziExtra.reduce(function(sum, s) { return sum + s.prezzo; }, 0);
            var prezzoTotale = prezzoBase + totExtra;

            var clienteSelect = modal.querySelector('#mod-cliente');
            var clienteOpt = clienteSelect.options[clienteSelect.selectedIndex];
            var clienteId = clienteOpt ? clienteOpt.value || null : null;
            var nomeCliente = clienteId
                ? clienteOpt.textContent.replace(/^[\u{1F3E2}\u{1F464}]\s*/u, '').trim()
                : 'Walk-in';

            var dati = {
                data: modal.querySelector('#mod-data').value,
                veicolo: veicolo,
                cellulare: cellulare,
                cliente_id: clienteId || null,
                nome_cliente: nomeCliente,
                tipo_lavaggio: tipo,
                prezzo: prezzoTotale,
                orario_inizio: modal.querySelector('#mod-inizio').value || null,
                orario_fine: modal.querySelector('#mod-fine').value || null,
                priorita: modal.querySelector('input[name="mod-priorita"]:checked').value,
                note: modal.querySelector('#mod-note').value.trim() || null,
                servizi_extra: serviziExtra
            };

            try {
                await ENI.API.modificaLavaggio(id, dati, lavaggio);
                ENI.UI.closeModal(modal);
                ENI.UI.success('Prenotazione ' + lavaggio.codice + ' aggiornata');
                await _loadLavaggi();
            } catch(e) {
                ENI.UI.error('Errore: ' + e.message);
            }
        });
    }

    // --- Elimina Definitiva Prenotazione ---

    async function _eliminaLavaggio(id) {
        var lavaggio = _lavaggi.find(function(l) { return l.id === id; });
        if (!lavaggio) return;

        var msg = 'Il lavaggio ' + lavaggio.codice + ' verrà eliminato definitivamente dal database.\n\n' +
                  (lavaggio.veicolo || lavaggio.nome_cliente) + ' - ' +
                  lavaggio.tipo_lavaggio + ' - ' + ENI.UI.formatValuta(lavaggio.prezzo) +
                  '\n\nQuesta azione non può essere annullata.';

        var ok = await ENI.UI.confirm({
            title: '\u{1F5D1} Elimina Definitivamente',
            message: msg,
            confirmText: 'Elimina',
            cancelText: 'Annulla',
            danger: true
        });

        if (!ok) return;

        try {
            await ENI.API.eliminaLavaggio(id, lavaggio);
            ENI.UI.success('Lavaggio ' + lavaggio.codice + ' eliminato');
            await _loadLavaggi();
        } catch(e) {
            ENI.UI.error('Errore: ' + e.message);
        }
    }

    // --- Vista Calendario ---

    async function _renderCalendario() {
        var contentEl = document.getElementById('lavaggi-content');
        if (!contentEl) return;

        contentEl.innerHTML = '<div class="flex justify-center items-center" style="padding: 4rem 0;"><div class="spinner"></div></div>';

        var lavaggiMese = [];
        try {
            lavaggiMese = await ENI.API.getLavaggiMese(_annoCorrente, _meseCorrente);
        } catch(e) {
            ENI.UI.error('Errore caricamento calendario');
            return;
        }

        // Raggruppa per data
        var contatori = {};
        lavaggiMese.forEach(function(l) {
            contatori[l.data] = (contatori[l.data] || 0) + 1;
        });

        var mesiNomi = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
                        'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
        var giorniNomi = ['Lun','Mar','Mer','Gio','Ven','Sab','Dom'];
        var oggi = ENI.UI.oggiISO();

        var primoDelMese = new Date(_annoCorrente, _meseCorrente - 1, 1);
        var totalDays = new Date(_annoCorrente, _meseCorrente, 0).getDate();
        var startDow = (primoDelMese.getDay() + 6) % 7; // 0=Lun, 6=Dom

        var html =
            '<div class="card">' +
                '<div class="flex justify-between items-center mb-4">' +
                    '<button class="btn btn-outline btn-sm" id="cal-prev">\u2039 Prec</button>' +
                    '<h3 style="margin:0;">' + mesiNomi[_meseCorrente - 1] + ' ' + _annoCorrente + '</h3>' +
                    '<button class="btn btn-outline btn-sm" id="cal-next">Succ \u203A</button>' +
                '</div>' +
                '<div class="cal-grid">';

        // Header giorni
        giorniNomi.forEach(function(g) {
            html += '<div class="cal-header-cell">' + g + '</div>';
        });

        // Celle vuote iniziali
        for (var i = 0; i < startDow; i++) {
            html += '<div class="cal-cell cal-cell-other"></div>';
        }

        // Celle dei giorni del mese
        for (var d = 1; d <= totalDays; d++) {
            var dataStr = _annoCorrente + '-' + String(_meseCorrente).padStart(2, '0') + '-' + String(d).padStart(2, '0');
            var count = contatori[dataStr] || 0;
            var isOggi = dataStr === oggi;

            var badgeHtml = '';
            if (count > 0) {
                var cls = count >= 5 ? 'cal-badge-red' : count >= 3 ? 'cal-badge-orange' : 'cal-badge-blue';
                badgeHtml = '<span class="cal-badge ' + cls + '">' + count + '</span>';
            }

            html +=
                '<div class="cal-cell' + (isOggi ? ' cal-oggi' : '') + '" data-cal-data="' + dataStr + '">' +
                    '<span class="cal-day-num' + (isOggi ? ' cal-day-oggi' : '') + '">' + d + '</span>' +
                    badgeHtml +
                    '<button class="cal-add-btn" data-prenota-data="' + dataStr + '" title="Nuova prenotazione">+</button>' +
                '</div>';
        }

        // Celle vuote finali per completare la griglia
        var totalCells = startDow + totalDays;
        var remainingCells = (7 - (totalCells % 7)) % 7;
        for (var j = 0; j < remainingCells; j++) {
            html += '<div class="cal-cell cal-cell-other"></div>';
        }

        html += '</div></div>';
        contentEl.innerHTML = html;

        // Navigazione mese precedente
        contentEl.querySelector('#cal-prev').addEventListener('click', function() {
            _meseCorrente--;
            if (_meseCorrente < 1) { _meseCorrente = 12; _annoCorrente--; }
            _renderCalendario();
        });

        // Navigazione mese successivo
        contentEl.querySelector('#cal-next').addEventListener('click', function() {
            _meseCorrente++;
            if (_meseCorrente > 12) { _meseCorrente = 1; _annoCorrente++; }
            _renderCalendario();
        });

        // Click su un giorno → vai alla tabella per quella data
        ENI.UI.delegate(contentEl, 'click', '[data-cal-data]', function(e, el) {
            if (e.target.closest('[data-prenota-data]')) return;
            _dataSelezionata = el.dataset.calData;
            var parts = _dataSelezionata.split('-');
            _annoCorrente = parseInt(parts[0], 10);
            _meseCorrente = parseInt(parts[1], 10);
            var dateInput = document.getElementById('lavaggi-data');
            if (dateInput) dateInput.value = _dataSelezionata;
            _vistaCorrente = 'tabella';
            document.querySelectorAll('.chip[data-vista]').forEach(function(c) {
                c.classList.toggle('active', c.dataset.vista === _vistaCorrente);
            });
            if (dateInput) dateInput.style.display = '';
            var actionsEl = document.getElementById('lavaggi-actions');
            if (actionsEl) actionsEl.style.display = '';
            _loadLavaggi();
        });

        // Click bottone "+" → nuova prenotazione per quel giorno
        ENI.UI.delegate(contentEl, 'click', '[data-prenota-data]', function(e, el) {
            e.stopPropagation();
            _dataSelezionata = el.dataset.prenotaData;
            var dateInput = document.getElementById('lavaggi-data');
            if (dateInput) dateInput.value = _dataSelezionata;
            _showFormLavaggio(false);
        });
    }

    return { render: render };
})();
