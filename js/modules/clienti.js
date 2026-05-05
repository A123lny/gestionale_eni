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

    // ============================================================
    // Helper: voci ricorrenti in fattura ENI (per cliente)
    // ============================================================
    function _vociRicorrentiSectionHtml(voci) {
        voci = Array.isArray(voci) ? voci : [];
        var rows = voci.map(_voceRigaHtml).join('');
        return '<div class="section-title mt-3">Voci ricorrenti in fattura ENI</div>' +
            '<p class="text-xs text-muted mb-1">Righe aggiunte automaticamente alle fatture mensili (es. lubrificanti, AdBlue, ricariche). Devono corrispondere a beni/servizi realmente forniti.</p>' +
            '<div class="table-wrapper"><table class="table table-sm" style="margin-bottom:0.5rem;">' +
                '<thead><tr>' +
                    '<th style="width:40%;">Descrizione</th>' +
                    '<th style="width:10%;">Qtà</th>' +
                    '<th style="width:10%;">UM</th>' +
                    '<th style="width:18%;">Importo €</th>' +
                    '<th style="width:14%;">Categoria</th>' +
                    '<th style="width:8%;"></th>' +
                '</tr></thead>' +
                '<tbody class="voci-ric-tbody">' + rows + '</tbody>' +
            '</table></div>' +
            '<button type="button" class="btn btn-sm btn-outline voci-ric-add">+ Aggiungi voce</button>';
    }

    function _voceRigaHtml(v) {
        v = v || {};
        var catOpts = ['ACCESSORIO','ALTRO'].map(function(c) {
            return '<option value="' + c + '"' + ((v.categoria || 'ACCESSORIO') === c ? ' selected' : '') + '>' + c + '</option>';
        }).join('');
        return '<tr>' +
            '<td><input type="text" class="form-input form-input-sm voce-fld" data-k="descrizione" value="' + ENI.UI.escapeHtml(v.descrizione || '') + '" placeholder="Es: Forfait lubrificanti"></td>' +
            '<td><input type="number" step="0.01" class="form-input form-input-sm voce-fld" data-k="quantita" value="' + (v.quantita != null ? v.quantita : 1) + '"></td>' +
            '<td><input type="text" class="form-input form-input-sm voce-fld" data-k="unita_misura" value="' + ENI.UI.escapeHtml(v.unita_misura || 'pz') + '"></td>' +
            '<td><input type="number" step="0.01" class="form-input form-input-sm voce-fld" data-k="importo" value="' + (v.importo != null ? v.importo : 0) + '"></td>' +
            '<td><select class="form-select form-select-sm voce-fld" data-k="categoria">' + catOpts + '</select></td>' +
            '<td><button type="button" class="btn btn-sm btn-danger voce-del">✕</button></td>' +
        '</tr>';
    }

    function _vociRicorrentiAttach(modal) {
        function _attachDel() {
            modal.querySelectorAll('.voce-del').forEach(function(b) {
                b.onclick = function() {
                    var tr = b.closest('tr');
                    if (tr) tr.remove();
                };
            });
        }
        var btnAdd = modal.querySelector('.voci-ric-add');
        if (btnAdd) {
            btnAdd.addEventListener('click', function() {
                var tbody = modal.querySelector('.voci-ric-tbody');
                if (!tbody) return;
                tbody.insertAdjacentHTML('beforeend', _voceRigaHtml({}));
                _attachDel();
            });
        }
        _attachDel();

        return {
            readAll: function() {
                var out = [];
                modal.querySelectorAll('.voci-ric-tbody tr').forEach(function(tr) {
                    var v = {};
                    tr.querySelectorAll('.voce-fld').forEach(function(el) {
                        var k = el.dataset.k;
                        v[k] = (el.type === 'number') ? parseFloat(el.value) || 0 : el.value;
                    });
                    if (!v.descrizione && !v.importo) return;  // skip righe vuote
                    out.push({
                        descrizione: (v.descrizione || '').trim(),
                        quantita: v.quantita || 1,
                        unita_misura: v.unita_misura || 'pz',
                        importo: v.importo || 0,
                        categoria: v.categoria || 'ACCESSORIO'
                    });
                });
                return out;
            }
        };
    }

    async function render(container) {
        var canWrite = ENI.State.canWrite('clienti');

        container.innerHTML =
            '<div class="page-header">' +
                '<h1 class="page-title">\u{1F465} Clienti</h1>' +
                (canWrite ? '<button class="btn btn-outline btn-sm" id="btn-import-rubrica" style="margin-right:0.5rem;">\u{1F4E5} Importa rubrica</button>' : '') +
                (canWrite ? '<button class="btn btn-primary" id="btn-nuovo-cliente">\u2795 Nuovo Cliente</button>' : '') +
            '</div>' +

            // Filtri
            '<div class="filter-bar">' +
                '<input type="text" class="form-input" id="search-clienti" placeholder="\u{1F50D} Cerca per nome...">' +
                '<div class="filter-chips">' +
                    '<button class="chip active" data-filtro="Tutti">Tutti</button>' +
                    '<button class="chip" data-filtro="Corporate">\u{1F3E2} Corporate</button>' +
                    '<button class="chip" data-filtro="Privato">\u{1F464} Privati</button>' +
                    '<button class="chip" data-filtro="Fornitore">\u{1F69A} Fornitori</button>' +
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

        // Import rubrica
        var btnImport = container.querySelector('#btn-import-rubrica');
        if (btnImport) {
            btnImport.addEventListener('click', _showImportRubrica);
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
                '<th>Pag. Fattura</th>' +
                '<th>Contatto</th>' +
            '</tr></thead><tbody>';

        filtered.forEach(function(c) {
            var pagFattLabel = c.modalita_pagamento_fattura
                ? '<span style="color:var(--color-primary);">' + ENI.UI.escapeHtml(c.modalita_pagamento_fattura) + '</span>'
                : '<span style="color:var(--color-danger);font-style:italic;">Non impostato</span>';
            html +=
                '<tr data-cliente-id="' + c.id + '" style="cursor:pointer;">' +
                    '<td>' +
                        '<strong>' + ENI.UI.escapeHtml(c.nome_ragione_sociale) + '</strong>' +
                        (c.targa ? '<br><span class="text-xs text-muted">' + ENI.UI.escapeHtml(c.targa) + '</span>' : '') +
                    '</td>' +
                    '<td>' + ENI.UI.badgeStato(c.tipo) + '</td>' +
                    '<td class="text-sm">' + pagFattLabel + '</td>' +
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
                        '<label class="form-check"><input type="radio" name="tipo" value="Fornitore"> \u{1F69A} Fornitore</label>' +
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

                // --- Sezione fatturazione ---
                '<div class="section-title">Dati fatturazione</div>' +
                '<div class="form-row">' +
                    '<div class="form-group">' +
                        '<label class="form-label">Indirizzo sede legale</label>' +
                        '<input type="text" class="form-input" id="cl-sede-indirizzo">' +
                    '</div>' +
                '</div>' +
                '<div class="form-row">' +
                    '<div class="form-group">' +
                        '<label class="form-label">CAP</label>' +
                        '<input type="text" class="form-input" id="cl-sede-cap">' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label class="form-label">Comune</label>' +
                        '<input type="text" class="form-input" id="cl-sede-comune">' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label class="form-label">Prov.</label>' +
                        '<input type="text" class="form-input" id="cl-sede-prov" maxlength="5">' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label class="form-label">Nazione</label>' +
                        '<input type="text" class="form-input" id="cl-sede-naz" value="SM" maxlength="5">' +
                    '</div>' +
                '</div>' +
                '<div class="form-row">' +
                    '<div class="form-group">' +
                        '<label class="form-label">PEC</label>' +
                        '<input type="email" class="form-input" id="cl-pec">' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label class="form-label">IBAN cliente</label>' +
                        '<input type="text" class="form-input" id="cl-iban" maxlength="40">' +
                    '</div>' +
                '</div>' +
                '<div class="form-row">' +
                    '<div class="form-group">' +
                        '<label class="form-label">Pagamento fattura</label>' +
                        '<select class="form-select" id="cl-mod-pag-fatt">' +
                            '<option value="">Non impostato</option>' +
                            '<option value="RIBA">RIBA</option>' +
                            '<option value="RID_SDD">RID / SDD</option>' +
                            '<option value="BONIFICO">Bonifico</option>' +
                            '<option value="CONTANTI">Contanti</option>' +
                            '<option value="FINE_MESE">Fine mese</option>' +
                        '</select>' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label class="form-label">Scadenza (giorni)</label>' +
                        '<input type="number" class="form-input" id="cl-scadenza-gg" value="30" min="0" max="365">' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label class="form-label">Rif. amministrazione</label>' +
                        '<input type="text" class="form-input" id="cl-rif-amm" placeholder="Es: Christian">' +
                    '</div>' +
                '</div>' +
                '<div class="form-row">' +
                    '<div class="form-group">' +
                        '<label class="form-check" style="margin-top:1.5rem;"><input type="checkbox" id="cl-monofase"> Applica coefficiente monofase in fattura</label>' +
                    '</div>' +
                '</div>' +
                _vociRicorrentiSectionHtml([]) +
                '<div class="form-group mt-3">' +
                    '<label class="form-label">Note fatturazione</label>' +
                    '<textarea class="form-textarea" id="cl-note-fatt" rows="2"></textarea>' +
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

        var vociHelper = _vociRicorrentiAttach(modal);

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
                note: modal.querySelector('#cl-note').value.trim() || null,
                sede_legale_indirizzo: modal.querySelector('#cl-sede-indirizzo').value.trim() || null,
                sede_legale_cap: modal.querySelector('#cl-sede-cap').value.trim() || null,
                sede_legale_comune: modal.querySelector('#cl-sede-comune').value.trim() || null,
                sede_legale_provincia: modal.querySelector('#cl-sede-prov').value.trim() || null,
                sede_legale_nazione: modal.querySelector('#cl-sede-naz').value.trim() || 'SM',
                pec: modal.querySelector('#cl-pec').value.trim() || null,
                iban: modal.querySelector('#cl-iban').value.trim() || null,
                modalita_pagamento_fattura: modal.querySelector('#cl-mod-pag-fatt').value || null,
                scadenza_giorni: parseInt(modal.querySelector('#cl-scadenza-gg').value, 10) || 30,
                rif_amministrazione: modal.querySelector('#cl-rif-amm').value.trim() || null,
                applica_monofase: modal.querySelector('#cl-monofase').checked,
                note_fatturazione: modal.querySelector('#cl-note-fatt').value.trim() || null,
                voci_ricorrenti_fattura: vociHelper.readAll()
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
                    _infoRow('Pagamento fattura', cliente.modalita_pagamento_fattura
                        ? '<span style="color:var(--color-primary);font-weight:600;">' + ENI.UI.escapeHtml(cliente.modalita_pagamento_fattura) + '</span>'
                        : '<span style="color:var(--color-danger);font-style:italic;">Non impostato</span>', true) +
                    (cliente.p_iva_coe ? _infoRow('P.IVA / COE', cliente.p_iva_coe) : '') +
                    (cliente.targa ? _infoRow('Targa', cliente.targa) : '') +
                    (cliente.telefono ? _infoRow('Telefono', cliente.telefono) : '') +
                    (cliente.email ? _infoRow('Email', cliente.email) : '') +
                    (cliente.note ? _infoRow('Note', cliente.note) : '') +
                    _infoRow('Cliente dal', ENI.UI.formatDataCompleta(cliente.created_at)) +
                    // Sezione fatturazione
                    '<div class="section-title mt-4">Dati fatturazione</div>' +
                    (cliente.sede_legale_indirizzo ? _infoRow('Sede legale', [cliente.sede_legale_indirizzo, cliente.sede_legale_cap, cliente.sede_legale_comune, cliente.sede_legale_provincia, cliente.sede_legale_nazione].filter(Boolean).join(', ')) : '') +
                    (cliente.pec ? _infoRow('PEC', cliente.pec) : '') +
                    (cliente.iban ? _infoRow('IBAN', cliente.iban) : '') +
                    (cliente.scadenza_giorni ? _infoRow('Scadenza', cliente.scadenza_giorni + ' giorni') : '') +
                    (cliente.rif_amministrazione ? _infoRow('Rif. amministrazione', cliente.rif_amministrazione) : '') +
                    (cliente.applica_monofase ? _infoRow('Monofase', 'Attivo') : '') +
                    (cliente.note_fatturazione ? _infoRow('Note fatturazione', cliente.note_fatturazione) : '') +
                    listinoHtml +
                '</div>' +
            '</div>';

        var modal = ENI.UI.showModal({
            title: '\u{1F464} Dettaglio Cliente',
            body: body,
            footer: canWrite
                ? '<button class="btn btn-danger btn-sm" id="btn-disattiva-cliente">Disattiva</button>' +
                  '<div style="flex:1;"></div>' +
                  '<button class="btn btn-outline" data-modal-close>Chiudi</button>' +
                  '<button class="btn btn-primary" id="btn-modifica-cliente">Modifica</button>'
                : '<button class="btn btn-outline" data-modal-close>Chiudi</button>'
        });

        if (canWrite) {
            modal.querySelector('#btn-modifica-cliente').addEventListener('click', function() {
                ENI.UI.closeModal(modal);
                _showFormModificaCliente(cliente);
            });
            modal.querySelector('#btn-disattiva-cliente').addEventListener('click', async function() {
                if (!await ENI.UI.confirm('Disattivare "' + cliente.nome_ragione_sociale + '"? Non comparirà più nelle liste ma resterà nello storico.')) return;
                try {
                    await ENI.API.aggiornaCliente(cliente.id, { attivo: false });
                    ENI.UI.closeModal(modal);
                    ENI.UI.toast('Cliente disattivato', 'success');
                    ENI.State.cacheClear();
                    await _loadClienti();
                } catch(e) {
                    ENI.UI.toast('Errore: ' + e.message, 'danger');
                }
            });
        }
    }

    function _infoRow(label, value, raw) {
        return '<div class="credito-info-row">' +
            '<span class="credito-info-label">' + label + '</span>' +
            '<span class="credito-info-value">' + (raw ? String(value) : ENI.UI.escapeHtml(String(value))) + '</span>' +
        '</div>';
    }

    function _pagLabel(value) {
        var found = ENI.Config.MODALITA_PAGAMENTO.find(function(m) { return m.value === value; });
        return found ? found.label : value;
    }

    // ============================================================
    // FORM MODIFICA CLIENTE
    // ============================================================
    async function _showFormModificaCliente(cliente) {
        var c = cliente;
        var modPagFatt = ['RIBA','RID_SDD','BONIFICO','CONTANTI','FINE_MESE'];
        var modPagFattOpts = '<option value="">Non impostato</option>' +
            modPagFatt.map(function(v) { return '<option value="' + v + '"' + (c.modalita_pagamento_fattura === v ? ' selected' : '') + '>' + v + '</option>'; }).join('');

        var modPagOpts = ENI.Config.MODALITA_PAGAMENTO.map(function(m) {
            return '<option value="' + m.value + '"' + (c.modalita_pagamento === m.value ? ' selected' : '') + '>' + m.label + '</option>';
        }).join('');

        var body =
            '<form id="form-mod-cliente">' +
                '<div class="form-group"><label class="form-label">Tipo Cliente</label>' +
                    '<div class="form-row">' +
                        '<label class="form-check"><input type="radio" name="tipo" value="Corporate"' + (c.tipo === 'Corporate' ? ' checked' : '') + '> Corporate</label>' +
                        '<label class="form-check"><input type="radio" name="tipo" value="Privato"' + (c.tipo === 'Privato' ? ' checked' : '') + '> Privato</label>' +
                        '<label class="form-check"><input type="radio" name="tipo" value="Fornitore"' + (c.tipo === 'Fornitore' ? ' checked' : '') + '> Fornitore</label>' +
                    '</div></div>' +
                '<div class="form-row">' +
                    '<div class="form-group"><label class="form-label form-label-required">Nome / Ragione Sociale</label>' +
                        '<input type="text" class="form-input" id="mod-nome" value="' + ENI.UI.escapeHtml(c.nome_ragione_sociale || '') + '" required></div>' +
                    '<div class="form-group"><label class="form-label">COE / P.IVA</label>' +
                        '<input type="text" class="form-input" id="mod-piva" value="' + ENI.UI.escapeHtml(c.p_iva_coe || '') + '"></div>' +
                '</div>' +
                '<div class="form-row">' +
                    '<div class="form-group"><label class="form-label">Telefono</label>' +
                        '<input type="tel" class="form-input" id="mod-telefono" value="' + ENI.UI.escapeHtml(c.telefono || '') + '"></div>' +
                    '<div class="form-group"><label class="form-label">Email</label>' +
                        '<input type="email" class="form-input" id="mod-email" value="' + ENI.UI.escapeHtml(c.email || '') + '"></div>' +
                '</div>' +
                '<div class="form-group"><label class="form-label">Targa Veicolo</label>' +
                    '<input type="text" class="form-input" id="mod-targa" value="' + ENI.UI.escapeHtml(c.targa || '') + '"></div>' +
                '<div class="form-group"><label class="form-label">Modalit\u00e0 Pagamento</label>' +
                    '<select class="form-select" id="mod-pagamento">' + modPagOpts + '</select></div>' +
                '<div class="form-group"><label class="form-label">Note</label>' +
                    '<textarea class="form-textarea" id="mod-note" rows="2">' + ENI.UI.escapeHtml(c.note || '') + '</textarea></div>' +
                // Sezione fatturazione
                '<div class="section-title mt-3">Dati fatturazione</div>' +
                '<div class="form-group"><label class="form-label">Indirizzo sede legale</label>' +
                    '<input type="text" class="form-input" id="mod-sede-ind" value="' + ENI.UI.escapeHtml(c.sede_legale_indirizzo || '') + '"></div>' +
                '<div class="form-row">' +
                    '<div class="form-group"><label class="form-label">CAP</label>' +
                        '<input type="text" class="form-input" id="mod-sede-cap" value="' + ENI.UI.escapeHtml(c.sede_legale_cap || '') + '"></div>' +
                    '<div class="form-group"><label class="form-label">Comune</label>' +
                        '<input type="text" class="form-input" id="mod-sede-com" value="' + ENI.UI.escapeHtml(c.sede_legale_comune || '') + '"></div>' +
                    '<div class="form-group"><label class="form-label">Prov.</label>' +
                        '<input type="text" class="form-input" id="mod-sede-prov" value="' + ENI.UI.escapeHtml(c.sede_legale_provincia || '') + '" maxlength="5"></div>' +
                    '<div class="form-group"><label class="form-label">Nazione</label>' +
                        '<input type="text" class="form-input" id="mod-sede-naz" value="' + ENI.UI.escapeHtml(c.sede_legale_nazione || 'SM') + '" maxlength="5"></div>' +
                '</div>' +
                '<div class="form-row">' +
                    '<div class="form-group"><label class="form-label">PEC</label>' +
                        '<input type="email" class="form-input" id="mod-pec" value="' + ENI.UI.escapeHtml(c.pec || '') + '"></div>' +
                    '<div class="form-group"><label class="form-label">IBAN</label>' +
                        '<input type="text" class="form-input" id="mod-iban" value="' + ENI.UI.escapeHtml(c.iban || '') + '" maxlength="40"></div>' +
                '</div>' +
                '<div class="form-row">' +
                    '<div class="form-group"><label class="form-label">Banca appoggio</label>' +
                        '<input type="text" class="form-input" id="mod-banca-app" value="' + ENI.UI.escapeHtml(c.banca_appoggio || '') + '"></div>' +
                    '<div class="form-group"><label class="form-label">ABI</label>' +
                        '<input type="text" class="form-input" id="mod-abi" value="' + ENI.UI.escapeHtml(c.abi_banca || '') + '" maxlength="10"></div>' +
                    '<div class="form-group"><label class="form-label">CAB</label>' +
                        '<input type="text" class="form-input" id="mod-cab" value="' + ENI.UI.escapeHtml(c.cab_banca || '') + '" maxlength="10"></div>' +
                    '<div class="form-group"><label class="form-label">Mandato SDD</label>' +
                        '<input type="text" class="form-input" id="mod-mandate" value="' + ENI.UI.escapeHtml(c.mandate_id || '') + '" maxlength="50"></div>' +
                '</div>' +
                '<div class="form-row">' +
                    '<div class="form-group"><label class="form-label">Pagamento fattura</label>' +
                        '<select class="form-select" id="mod-modpag-fatt">' + modPagFattOpts + '</select></div>' +
                    '<div class="form-group"><label class="form-label">Scadenza (giorni)</label>' +
                        '<input type="number" class="form-input" id="mod-scadgg" value="' + (c.scadenza_giorni || 30) + '" min="0" max="365"></div>' +
                    '<div class="form-group"><label class="form-label">Rif. amministrazione</label>' +
                        '<input type="text" class="form-input" id="mod-rif-amm" value="' + ENI.UI.escapeHtml(c.rif_amministrazione || '') + '"></div>' +
                '</div>' +
                '<div class="form-row">' +
                    '<label class="form-check" style="margin-top:0.5rem;"><input type="checkbox" id="mod-monofase"' + (c.applica_monofase ? ' checked' : '') + '> Applica coefficiente monofase</label>' +
                '</div>' +
                _vociRicorrentiSectionHtml(c.voci_ricorrenti_fattura) +
                '<div class="form-group mt-3"><label class="form-label">Note fatturazione</label>' +
                    '<textarea class="form-textarea" id="mod-note-fatt" rows="2">' + ENI.UI.escapeHtml(c.note_fatturazione || '') + '</textarea></div>' +
            '</form>';

        var modal = ENI.UI.showModal({
            title: '\u{270F}\uFE0F Modifica: ' + ENI.UI.escapeHtml(c.nome_ragione_sociale),
            body: body,
            footer:
                '<button class="btn btn-outline" data-modal-close>Annulla</button>' +
                '<button class="btn btn-primary" id="btn-salva-modifica">Salva modifiche</button>',
            size: 'lg'
        });

        var vociHelper = _vociRicorrentiAttach(modal);

        modal.querySelector('#btn-salva-modifica').addEventListener('click', async function() {
            var nome = modal.querySelector('#mod-nome').value.trim();
            if (!nome) { ENI.UI.toast('Il nome è obbligatorio', 'danger'); return; }

            var dati = {
                tipo: modal.querySelector('input[name="tipo"]:checked').value,
                nome_ragione_sociale: nome,
                p_iva_coe: modal.querySelector('#mod-piva').value.trim() || null,
                email: modal.querySelector('#mod-email').value.trim() || null,
                telefono: modal.querySelector('#mod-telefono').value.trim() || null,
                targa: modal.querySelector('#mod-targa').value.trim() || null,
                modalita_pagamento: modal.querySelector('#mod-pagamento').value,
                note: modal.querySelector('#mod-note').value.trim() || null,
                sede_legale_indirizzo: modal.querySelector('#mod-sede-ind').value.trim() || null,
                sede_legale_cap: modal.querySelector('#mod-sede-cap').value.trim() || null,
                sede_legale_comune: modal.querySelector('#mod-sede-com').value.trim() || null,
                sede_legale_provincia: modal.querySelector('#mod-sede-prov').value.trim() || null,
                sede_legale_nazione: modal.querySelector('#mod-sede-naz').value.trim() || 'SM',
                pec: modal.querySelector('#mod-pec').value.trim() || null,
                iban: modal.querySelector('#mod-iban').value.trim() || null,
                banca_appoggio: modal.querySelector('#mod-banca-app').value.trim() || null,
                abi_banca: modal.querySelector('#mod-abi').value.trim() || null,
                cab_banca: modal.querySelector('#mod-cab').value.trim() || null,
                mandate_id: modal.querySelector('#mod-mandate').value.trim() || null,
                modalita_pagamento_fattura: modal.querySelector('#mod-modpag-fatt').value || null,
                scadenza_giorni: parseInt(modal.querySelector('#mod-scadgg').value, 10) || 30,
                rif_amministrazione: modal.querySelector('#mod-rif-amm').value.trim() || null,
                applica_monofase: modal.querySelector('#mod-monofase').checked,
                note_fatturazione: modal.querySelector('#mod-note-fatt').value.trim() || null,
                voci_ricorrenti_fattura: vociHelper.readAll()
            };

            try {
                await ENI.API.aggiornaCliente(c.id, dati);
                ENI.UI.closeModal(modal);
                ENI.UI.toast('Cliente aggiornato', 'success');
                ENI.State.cacheClear();
                await _loadClienti();
            } catch(e) {
                ENI.UI.toast('Errore: ' + e.message, 'danger');
            }
        });
    }

    // ============================================================
    // IMPORT RUBRICA DA CSV (vecchio gestionale contabilità)
    // CSV ; separato, encoding latin-1, colonne fisse
    // ============================================================
    function _showImportRubrica() {
        var body =
            '<div class="form-group"><label class="form-label">File rubrica clienti (.csv)</label>' +
                '<input type="file" class="form-input" id="imp-rubrica-file" accept=".csv">' +
                '<span class="text-xs text-muted">Formato: CSV delimitato da ; (rubrica_clienti.csv)</span></div>' +
            '<div id="imp-rubrica-preview" style="display:none;"></div>';

        var modal = ENI.UI.showModal({
            title: '\u{1F4E5} Importa rubrica clienti',
            body: body,
            footer:
                '<button class="btn btn-outline" data-modal-close>Annulla</button>' +
                '<button class="btn btn-primary" id="btn-esegui-import-rubrica" disabled>Importa</button>',
            size: 'lg'
        });

        var _parsedRows = [];

        modal.querySelector('#imp-rubrica-file').addEventListener('change', function(e) {
            var file = e.target.files && e.target.files[0];
            if (!file) return;
            var reader = new FileReader();
            reader.onload = function(ev) {
                var text = ev.target.result;
                var result = Papa.parse(text, { delimiter: ';', header: true, skipEmptyLines: true });
                _parsedRows = (result.data || []).filter(function(r) {
                    return r['nome cliente/azienda'] && r['nome cliente/azienda'].trim();
                });

                var preview = modal.querySelector('#imp-rubrica-preview');
                preview.style.display = 'block';
                preview.innerHTML = '<p class="mb-2"><strong>' + _parsedRows.length + ' clienti</strong> trovati nel file</p>' +
                    '<div class="table-wrapper" style="max-height:40vh;overflow:auto;"><table class="table table-sm">' +
                    '<thead><tr><th>Nome</th><th>Indirizzo</th><th>COE/P.IVA</th><th>IBAN</th><th>Email</th><th>Naz.</th></tr></thead>' +
                    '<tbody>' + _parsedRows.slice(0, 30).map(function(r) {
                        return '<tr>' +
                            '<td>' + ENI.UI.escapeHtml(r['nome cliente/azienda'] || '') + '</td>' +
                            '<td class="text-xs">' + ENI.UI.escapeHtml((r['indirizzo'] || '') + ' ' + (r['castello/comune'] || '')) + '</td>' +
                            '<td class="text-xs">' + ENI.UI.escapeHtml(r['COE/P.IVA'] || '') + '</td>' +
                            '<td class="text-xs">' + ENI.UI.escapeHtml(r['IBAN'] || '') + '</td>' +
                            '<td class="text-xs">' + ENI.UI.escapeHtml((r['email '] || r['email'] || '')) + '</td>' +
                            '<td>' + ENI.UI.escapeHtml(r['nazione'] || '') + '</td>' +
                        '</tr>';
                    }).join('') +
                    (_parsedRows.length > 30 ? '<tr><td colspan="6" class="text-muted text-center">...e altri ' + (_parsedRows.length - 30) + '</td></tr>' : '') +
                    '</tbody></table></div>';

                modal.querySelector('#btn-esegui-import-rubrica').disabled = false;
            };
            reader.readAsText(file, 'latin1');
        });

        modal.querySelector('#btn-esegui-import-rubrica').addEventListener('click', async function() {
            if (!_parsedRows.length) return;
            var btn = modal.querySelector('#btn-esegui-import-rubrica');
            btn.disabled = true;
            btn.textContent = 'Importazione...';

            var creati = 0, aggiornati = 0, errori = 0;
            var clientiEsistenti = await ENI.API.getClienti();

            for (var i = 0; i < _parsedRows.length; i++) {
                var r = _parsedRows[i];
                var nome = (r['nome cliente/azienda'] || '').trim();
                if (!nome) continue;

                var coe = (r['COE/P.IVA'] || '').trim();
                var nazione = (r['nazione'] || 'SM').trim();
                var email = (r['email '] || r['email'] || '').trim().split(';')[0].trim();
                var telefono = (r['telefono'] || '').trim();
                var iban = (r['IBAN'] || '').trim();
                var indirizzo = (r['indirizzo'] || '').trim();
                var cap = (r['cap'] || '').trim();
                var comune = (r['castello/comune'] || '').trim();
                var banca = (r['filiale banca'] || '').trim();

                var dati = {
                    nome_ragione_sociale: nome,
                    tipo: 'Corporate',
                    modalita_pagamento: 'Addebito_Mese',
                    p_iva_coe: coe || null,
                    email: email || null,
                    telefono: telefono || null,
                    sede_legale_indirizzo: indirizzo || null,
                    sede_legale_cap: cap || null,
                    sede_legale_comune: comune || null,
                    sede_legale_nazione: nazione || 'SM',
                    iban: iban || null,
                    alias_import_eni: [nome.trim().toLowerCase().replace(/\s+/g, ' ')]
                };

                // Match per nome normalizzato
                var nomeNorm = nome.trim().toLowerCase().replace(/\s+/g, ' ');
                var esistente = clientiEsistenti.find(function(c) {
                    return c.nome_ragione_sociale.trim().toLowerCase().replace(/\s+/g, ' ') === nomeNorm;
                });

                try {
                    if (esistente) {
                        // Aggiorna solo i campi vuoti
                        var upd = {};
                        if (!esistente.p_iva_coe && dati.p_iva_coe) upd.p_iva_coe = dati.p_iva_coe;
                        if (!esistente.email && dati.email) upd.email = dati.email;
                        if (!esistente.telefono && dati.telefono) upd.telefono = dati.telefono;
                        if (!esistente.sede_legale_indirizzo && dati.sede_legale_indirizzo) upd.sede_legale_indirizzo = dati.sede_legale_indirizzo;
                        if (!esistente.sede_legale_cap && dati.sede_legale_cap) upd.sede_legale_cap = dati.sede_legale_cap;
                        if (!esistente.sede_legale_comune && dati.sede_legale_comune) upd.sede_legale_comune = dati.sede_legale_comune;
                        if (!esistente.sede_legale_nazione && dati.sede_legale_nazione) upd.sede_legale_nazione = dati.sede_legale_nazione;
                        if (!esistente.iban && dati.iban) upd.iban = dati.iban;
                        if (Object.keys(upd).length) {
                            await ENI.API.aggiornaCliente(esistente.id, upd);
                            aggiornati++;
                        }
                    } else {
                        await ENI.API.salvaCliente(dati);
                        creati++;
                    }
                } catch(e) {
                    console.error('Errore import cliente:', nome, e);
                    errori++;
                }
            }

            ENI.UI.closeModal(modal);
            ENI.UI.toast('Import completato: ' + creati + ' creati, ' + aggiornati + ' aggiornati' + (errori ? ', ' + errori + ' errori' : ''), 'success');
            ENI.State.cacheClear();
            await _loadClienti();
        });
    }

    return { render: render };
})();
