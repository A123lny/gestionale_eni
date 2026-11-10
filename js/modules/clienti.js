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
    var _paginaCorrente = 1;   // solo visualizzazione
    var _perPagina = 25;       // 10 / 25 / 50 / 100

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
                '<button class="btn btn-outline btn-sm" id="btn-export-rubrica" style="margin-right:0.5rem;">\u{1F4E4} Esporta rubrica</button>' +
                (canWrite ? '<button class="btn btn-outline btn-sm" id="btn-import-rubrica" style="margin-right:0.5rem;">\u{1F4E5} Importa rubrica</button>' : '') +
                (canWrite ? '<button class="btn btn-primary" id="btn-nuovo-cliente">\u2795 Nuovo Cliente</button>' : '') +
            '</div>' +

            // Filtri
            '<div class="filter-bar">' +
                '<input type="text" class="form-input" id="search-clienti" placeholder="\u{1F50D} Cerca per nome...">' +
                '<div class="filter-chips" id="clienti-chips"></div>' +
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
                    _paginaCorrente = 1;
                    _renderList();
                }, 300);
            });
        }

        // Filter chips
        ENI.UI.delegate(container, 'click', '.chip[data-filtro]', function(e, el) {
            _filtroTipo = el.dataset.filtro;
            _paginaCorrente = 1;
            _renderChips();
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

        // Export rubrica
        var btnExport = container.querySelector('#btn-export-rubrica');
        if (btnExport) {
            btnExport.addEventListener('click', _esportaRubrica);
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
            _renderChips();
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

    // Colore + icona + etichetta per tipo cliente
    function _tipoInfo(tipo) {
        if (tipo === 'Corporate') return { color: '#2a78d6', icon: '\u{1F3E2}', label: 'Corporate' };
        if (tipo === 'Fornitore') return { color: '#eb6834', icon: '\u{1F69A}', label: 'Fornitore' };
        if (tipo === 'Privato') return { color: '#1baf7a', icon: '\u{1F464}', label: 'Privato' };
        return { color: '#898781', icon: '•', label: tipo || '-' };
    }

    function _tipoBadge(t) {
        return '<span style="display:inline-flex;align-items:center;gap:0.3rem;padding:2px 10px;border-radius:999px;font-size:0.78rem;font-weight:600;color:' + t.color + ';background:' + t.color + '1f;white-space:nowrap;">' + t.icon + ' ' + t.label + '</span>';
    }

    // Iniziali per l'avatar (max 2 lettere)
    function _iniziali(nome) {
        var parts = String(nome || '').trim().split(/\s+/).filter(Boolean);
        if (!parts.length) return '?';
        if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
        return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
    }

    // Chip filtro con conteggi e colori per tipo
    function _renderChips() {
        var box = document.getElementById('clienti-chips');
        if (!box) return;
        var counts = { Tutti: _clienti.length, Corporate: 0, Privato: 0, Fornitore: 0 };
        _clienti.forEach(function(c) { if (counts[c.tipo] !== undefined) counts[c.tipo]++; });
        var defs = [
            { id: 'Tutti', label: 'Tutti', color: '#52514e', icon: '' },
            { id: 'Corporate', label: 'Corporate', color: '#2a78d6', icon: '\u{1F3E2}' },
            { id: 'Privato', label: 'Privati', color: '#1baf7a', icon: '\u{1F464}' },
            { id: 'Fornitore', label: 'Fornitori', color: '#eb6834', icon: '\u{1F69A}' }
        ];
        box.innerHTML = defs.map(function(d) {
            var active = (_filtroTipo === d.id);
            var style = active
                ? 'background:' + d.color + ';color:#fff;border:1px solid ' + d.color + ';'
                : 'background:transparent;color:' + d.color + ';border:1px solid ' + d.color + '66;';
            return '<button class="chip" data-filtro="' + d.id + '" style="' + style + '">' +
                (d.icon ? d.icon + ' ' : '') + d.label + ' (' + counts[d.id] + ')</button>';
        }).join('');
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

        // --- Paginazione (SOLO visualizzazione: affetta la lista gia' filtrata) ---
        var totale = filtered.length;
        var totalePagine = Math.max(1, Math.ceil(totale / _perPagina));
        if (_paginaCorrente > totalePagine) _paginaCorrente = totalePagine;
        if (_paginaCorrente < 1) _paginaCorrente = 1;
        var startIdx = (_paginaCorrente - 1) * _perPagina;
        var pageItems = filtered.slice(startIdx, startIdx + _perPagina);

        var html = '<style>' +
            '#clienti-list table tbody tr:hover{background:var(--color-gray-100);}' +
            '#clienti-list thead th{position:sticky;top:0;background:var(--bg-card);z-index:1;}' +
            '</style>' +
            '<div class="table-wrapper"><table class="table">' +
            '<thead><tr>' +
                '<th>Cliente</th>' +
                '<th>Pag. fattura</th>' +
                '<th>Contatti</th>' +
            '</tr></thead><tbody>';

        pageItems.forEach(function(c) {
            var t = _tipoInfo(c.tipo);
            var avatar = '<span title="' + ENI.UI.escapeHtml(t.label) + '" style="display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:50%;background:' + t.color + '22;color:' + t.color + ';font-weight:700;font-size:0.72rem;flex-shrink:0;">' + ENI.UI.escapeHtml(_iniziali(c.nome_ragione_sociale)) + '</span>';
            var pag = c.modalita_pagamento_fattura
                ? '<span class="text-sm">' + ENI.UI.escapeHtml(c.modalita_pagamento_fattura) + '</span>'
                : '<span title="Pagamento fattura non impostato" style="color:var(--color-warning);font-size:1.1rem;">⚠️</span>';
            if (c.modalita_pagamento_fattura === 'RID_SDD' && ENI.IbanMandato.statoMandato(c) !== 'valido') {
                pag += ' <span title="' + (c.mandate_id ? 'Firma mandato da registrare' : 'Mandato SDD mancante') + '" ' +
                    'style="color:var(--color-danger);font-size:0.75rem;white-space:nowrap;">⚠ mandato</span>';
            }
            var contatto = '';
            if (c.telefono) contatto += '<span style="white-space:nowrap;">\u{1F4DE} ' + ENI.UI.escapeHtml(c.telefono) + '</span>';
            if (c.email) contatto += (contatto ? '<br>' : '') + '<span style="white-space:nowrap;">✉️ ' + ENI.UI.escapeHtml(c.email) + '</span>';
            if (!contatto) contatto = '<span class="text-muted">—</span>';
            html +=
                '<tr data-cliente-id="' + c.id + '" style="cursor:pointer;border-left:4px solid ' + t.color + ';">' +
                    '<td><div style="display:flex;align-items:center;gap:0.6rem;">' +
                        avatar +
                        '<div>' +
                            '<strong>' + ENI.UI.escapeHtml(c.nome_ragione_sociale) + '</strong>' +
                            (c.targa ? '<div class="text-xs text-muted">' + ENI.UI.escapeHtml(c.targa) + '</div>' : '') +
                        '</div>' +
                    '</div></td>' +
                    '<td>' + pag + '</td>' +
                    '<td class="text-sm text-muted">' + contatto + '</td>' +
                '</tr>';
        });

        html += '</tbody></table></div>';
        html += _renderPaginazione(totale, totalePagine, startIdx, pageItems.length);
        listEl.innerHTML = html;
        _setupPaginazioneEvents(listEl, totalePagine);
    }

    // Controlli di paginazione (selettore per-pagina + numeri + indietro/avanti)
    function _renderPaginazione(totale, totalePagine, startIdx, nInPagina) {
        var da = totale === 0 ? 0 : startIdx + 1;
        var a = startIdx + nInPagina;
        var opts = [10, 25, 50, 100].map(function(n) {
            return '<option value="' + n + '"' + (n === _perPagina ? ' selected' : '') + '>' + n + '</option>';
        }).join('');

        var numeri = _numeriPagina(_paginaCorrente, totalePagine).map(function(p) {
            if (p === '...') return '<span class="text-muted" style="padding:0 0.25rem;">…</span>';
            var attivo = p === _paginaCorrente;
            return '<button class="btn btn-sm ' + (attivo ? 'btn-primary' : 'btn-outline') + '" data-pag="' + p + '">' + p + '</button>';
        }).join('');

        return '<div class="pagination-bar" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.75rem;margin-top:0.75rem;">' +
            '<div class="text-sm text-muted" style="display:flex;align-items:center;gap:0.4rem;flex-wrap:wrap;">' +
                '<span>Mostra</span>' +
                '<select id="clienti-per-pagina" class="form-select" style="width:auto;display:inline-block;min-height:36px;padding:0.25rem 2rem 0.25rem 0.6rem;">' + opts + '</select>' +
                '<span>per pagina</span>' +
                '<span style="margin-left:0.4rem;">' + da + '–' + a + ' di ' + totale + '</span>' +
            '</div>' +
            '<div style="display:flex;align-items:center;gap:0.25rem;flex-wrap:wrap;">' +
                '<button class="btn btn-sm btn-outline" data-pag="prev"' + (_paginaCorrente <= 1 ? ' disabled' : '') + '>‹ Indietro</button>' +
                numeri +
                '<button class="btn btn-sm btn-outline" data-pag="next"' + (_paginaCorrente >= totalePagine ? ' disabled' : '') + '>Avanti ›</button>' +
            '</div>' +
        '</div>';
    }

    // Elenco compatto di numeri di pagina: 1 ... 4 5 6 ... 11
    function _numeriPagina(cur, total) {
        var pages = [];
        if (total <= 7) {
            for (var i = 1; i <= total; i++) pages.push(i);
            return pages;
        }
        pages.push(1);
        var start = Math.max(2, cur - 1);
        var end = Math.min(total - 1, cur + 1);
        if (start > 2) pages.push('...');
        for (var j = start; j <= end; j++) pages.push(j);
        if (end < total - 1) pages.push('...');
        pages.push(total);
        return pages;
    }

    function _setupPaginazioneEvents(listEl, totalePagine) {
        var sel = listEl.querySelector('#clienti-per-pagina');
        if (sel) {
            sel.addEventListener('change', function() {
                _perPagina = parseInt(this.value, 10) || 25;
                _paginaCorrente = 1;
                _renderList();
            });
        }
        listEl.querySelectorAll('[data-pag]').forEach(function(b) {
            if (b.disabled) return;
            b.addEventListener('click', function() {
                var v = b.getAttribute('data-pag');
                if (v === 'prev') _paginaCorrente = Math.max(1, _paginaCorrente - 1);
                else if (v === 'next') _paginaCorrente = Math.min(totalePagine, _paginaCorrente + 1);
                else _paginaCorrente = parseInt(v, 10) || 1;
                _renderList();
            });
        });
    }

    // ============================================================
    // SEZIONE PAGAMENTO (comune a Nuovo e Modifica)
    // Due domande distinte:
    //  - servizi al banco (modalita_pagamento): paga subito o a fine mese in
    //    fattura. Lo leggono lavaggi e buoni per non mettere in cassa i
    //    lavaggi da fatturare.
    //  - fattura (modalita_pagamento_fattura): come paga la fattura.
    // IBAN e banca compaiono solo se servono; ABI/CAB si ricavano dall'IBAN;
    // il codice mandato SDD lo assegna il database e qui si legge soltanto.
    // ============================================================
    var _PAG_BANCO = [
        { value: 'Cash', label: 'Paga subito' },
        { value: 'Addebito_Mese', label: 'A fine mese, in fattura' }
    ];
    var _PAG_FATTURA = [
        { value: 'RID_SDD', label: 'RID / SDD (addebito su conto)' },
        { value: 'RIBA', label: 'RI.BA.' },
        { value: 'BONIFICO', label: 'Bonifico' },
        { value: 'CONTANTI', label: 'Contanti' }
    ];

    function _oggiIso() {
        var d = new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }

    function _fmtDataIt(iso) {
        if (!iso) return '';
        var p = String(iso).substring(0, 10).split('-');
        return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : iso;
    }

    // Le opzioni storiche (Addebito 30/60gg, Bonifico anticipato, FINE_MESE)
    // non si propongono piu', ma se un cliente le ha restano selezionate.
    function _opzioni(lista, valore, vuota) {
        var html = vuota ? '<option value="">' + vuota + '</option>' : '';
        var trovato = !valore;
        lista.forEach(function(o) {
            if (o.value === valore) trovato = true;
            html += '<option value="' + o.value + '"' + (o.value === valore ? ' selected' : '') + '>' + o.label + '</option>';
        });
        if (!trovato) {
            html += '<option value="' + ENI.UI.escapeHtml(valore) + '" selected>' + ENI.UI.escapeHtml(_pagLabel(valore)) + ' (vecchia)</option>';
        }
        return html;
    }

    // Mandato per scheda dettaglio e lista
    function _mandatoInfoHtml(c) {
        var stato = ENI.IbanMandato.statoMandato(c);
        if (stato === 'valido') {
            return ENI.UI.escapeHtml(c.mandate_id) + ' <span style="color:var(--color-success);">✓ firmato il ' + _fmtDataIt(c.mandato_data_firma) + '</span>';
        }
        if (stato === 'attesa_firma') {
            return ENI.UI.escapeHtml(c.mandate_id) + ' <span style="color:var(--color-warning);">⚠ firma da registrare</span>';
        }
        return '<span style="color:var(--color-danger);">⚠ mancante: fuori dal file RID</span>';
    }

    function _labelPagFattura(v) {
        var o = _PAG_FATTURA.find(function(x) { return x.value === v; });
        return o ? o.label : v;
    }

    // Riquadro mandato: c = cliente salvato (null per un cliente nuovo)
    function _mandatoBoxHtml(c, p) {
        c = c || {};
        var stato = ENI.IbanMandato.statoMandato(c);
        var inputFirma = function(label) {
            return '<div class="form-group" style="margin-top:0.5rem;"><label class="form-label">' + label + '</label>' +
                '<input type="date" class="form-input" id="' + p + '-mandato-firma" max="' + _oggiIso() + '" style="max-width:180px;">' +
                '<span class="text-xs text-muted" style="display:block;margin-top:0.25rem;">Finché manca la data il cliente non entra nel file RID.</span></div>';
        };
        var html = '<div class="text-xs text-muted" style="margin-bottom:0.25rem;">Mandato SDD (assegnato dal gestionale, non modificabile)</div>';
        if (stato === 'valido') {
            return html + '<div><strong>' + ENI.UI.escapeHtml(c.mandate_id) + '</strong> ' +
                '<span style="color:var(--color-success);">✓ firmato il ' + _fmtDataIt(c.mandato_data_firma) + '</span></div>';
        }
        if (stato === 'attesa_firma') {
            return html + '<div><strong>' + ENI.UI.escapeHtml(c.mandate_id) + '</strong> ' +
                '<span style="color:var(--color-warning);">in attesa di firma</span></div>' +
                inputFirma('Data firma del cliente');
        }
        if (c.id && c.modalita_pagamento_fattura === 'RID_SDD') {
            return html + '<div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;">' +
                '<span style="color:var(--color-danger);">Nessun mandato</span>' +
                '<button type="button" class="btn btn-sm btn-primary" id="' + p + '-genera-mandato">Genera codice mandato</button></div>' +
                inputFirma('Data firma (se ha già firmato)');
        }
        return html + '<div class="text-sm">Il codice verrà assegnato al salvataggio.</div>' +
            inputFirma('Data firma (se ha già firmato)');
    }

    // p = prefisso id ('cl' nuovo, 'mod' modifica); c = cliente o {} per nuovo
    function _pagamentoSectionHtml(c, p) {
        c = c || {};
        var ac = ENI.IbanMandato.abiCab(c.iban);
        return '<div class="section-title mt-3">\u{1F4B6} Pagamento</div>' +
            '<div class="form-row">' +
                '<div class="form-group"><label class="form-label form-label-required">Servizi al banco (lavaggi, buoni)</label>' +
                    '<select class="form-select" id="' + p + '-pagamento">' + _opzioni(_PAG_BANCO, c.modalita_pagamento || 'Cash') + '</select></div>' +
                '<div class="form-group"><label class="form-label">Pagamento fattura</label>' +
                    '<select class="form-select" id="' + p + '-modpag-fatt">' + _opzioni(_PAG_FATTURA, c.modalita_pagamento_fattura || '', 'Non impostato') + '</select>' +
                    '<span class="text-xs text-muted" id="' + p + '-scadenza-info" style="display:block;margin-top:0.25rem;">Scadenza: ' + ENI.Fatturazione.Scadenza.descrivi(c.modalita_pagamento_fattura) + '</span></div>' +
            '</div>' +
            '<div id="' + p + '-banca-box">' +
                '<div class="form-row">' +
                    '<div class="form-group"><label class="form-label">IBAN cliente</label>' +
                        '<input type="text" class="form-input" id="' + p + '-iban" value="' + ENI.UI.escapeHtml(c.iban || '') + '" maxlength="40">' +
                        '<span class="text-xs text-muted" id="' + p + '-abicab-info" style="display:block;margin-top:0.25rem;">' + _abiCabInfo(ac, c) + '</span></div>' +
                    '<div class="form-group" id="' + p + '-banca-app-group"><label class="form-label">Banca d\'appoggio</label>' +
                        '<input type="text" class="form-input" id="' + p + '-banca-app" value="' + ENI.UI.escapeHtml(c.banca_appoggio || '') + '"></div>' +
                '</div>' +
                '<div id="' + p + '-mandato-box" style="padding:0.6rem 0.75rem;border-left:3px solid var(--color-primary);background:var(--color-gray-100);border-radius:4px;margin-bottom:0.75rem;">' +
                    _mandatoBoxHtml(c.id ? c : null, p) +
                '</div>' +
            '</div>';
    }

    function _abiCabInfo(ac, c) {
        if (ac) return 'ABI ' + ac.abi + ' · CAB ' + ac.cab + ' (ricavati dall\'IBAN)';
        if (c && c.abi_banca && c.cab_banca) return 'ABI ' + ENI.UI.escapeHtml(c.abi_banca) + ' · CAB ' + ENI.UI.escapeHtml(c.cab_banca);
        return '';
    }

    // Collega la sezione: mostra/nasconde i campi in base alla modalita',
    // aggiorna ABI/CAB e scadenza, gestisce "Genera codice mandato".
    function _pagamentoAttach(modal, c, p) {
        var sel = modal.querySelector('#' + p + '-modpag-fatt');
        var ibanInp = modal.querySelector('#' + p + '-iban');
        var aggiorna = function() {
            var v = sel.value;
            modal.querySelector('#' + p + '-banca-box').style.display = (v === 'RID_SDD' || v === 'RIBA') ? '' : 'none';
            modal.querySelector('#' + p + '-banca-app-group').style.display = v === 'RIBA' ? '' : 'none';
            modal.querySelector('#' + p + '-mandato-box').style.display = v === 'RID_SDD' ? '' : 'none';
            modal.querySelector('#' + p + '-scadenza-info').textContent = 'Scadenza: ' + ENI.Fatturazione.Scadenza.descrivi(v);
        };
        sel.addEventListener('change', aggiorna);
        ibanInp.addEventListener('input', function() {
            modal.querySelector('#' + p + '-abicab-info').innerHTML = _abiCabInfo(ENI.IbanMandato.abiCab(ibanInp.value), c);
        });
        aggiorna();

        var btn = modal.querySelector('#' + p + '-genera-mandato');
        if (btn && c && c.id) {
            btn.addEventListener('click', async function() {
                var firma = (modal.querySelector('#' + p + '-mandato-firma') || {}).value || null;
                if (!await ENI.UI.confirm('Generare il codice mandato SDD per "' + c.nome_ragione_sociale + '"?\n\n' +
                    'Il codice è definitivo: non si potrà più cambiare.' +
                    (firma ? '' : '\nSenza data firma il cliente resta fuori dal file RID finché non la registri.'))) return;
                btn.disabled = true;
                try {
                    var codice = await ENI.API.generaMandatoSdd(c.id, firma, c.nome_ragione_sociale);
                    c.mandate_id = codice;
                    c.mandato_data_firma = firma;
                    modal.querySelector('#' + p + '-mandato-box').innerHTML = _mandatoBoxHtml(c, p);
                    ENI.UI.toast('Mandato ' + codice + ' assegnato', 'success');
                } catch(e) {
                    btn.disabled = false;
                    ENI.UI.toast('Errore: ' + e.message, 'danger');
                }
            });
        }
    }

    // Campi pagamento da salvare. Il codice mandato NON si invia mai: lo
    // gestisce il database e rifiuterebbe qualsiasi modifica.
    function _pagamentoDati(modal, c, p) {
        c = c || {};
        var iban = ENI.IbanMandato.normalizza(modal.querySelector('#' + p + '-iban').value);
        var dati = {
            modalita_pagamento: modal.querySelector('#' + p + '-pagamento').value,
            modalita_pagamento_fattura: modal.querySelector('#' + p + '-modpag-fatt').value || null,
            iban: iban || null,
            banca_appoggio: modal.querySelector('#' + p + '-banca-app').value.trim() || null
        };
        var ac = ENI.IbanMandato.abiCab(iban);
        if (ac) { dati.abi_banca = ac.abi; dati.cab_banca = ac.cab; }
        // Data firma: si scrive solo finche' il mandato non e' valido
        var firma = modal.querySelector('#' + p + '-mandato-firma');
        if (firma && firma.value && dati.modalita_pagamento_fattura === 'RID_SDD' &&
            ENI.IbanMandato.statoMandato(c) !== 'valido') {
            if (firma.value > _oggiIso()) {
                ENI.UI.warning('La data firma del mandato non può essere nel futuro');
                return null;
            }
            dati.mandato_data_firma = firma.value;
        }
        return dati;
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

                _pagamentoSectionHtml({}, 'cl') +

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
        _pagamentoAttach(modal, null, 'cl');

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

            var pag = _pagamentoDati(modal, null, 'cl');
            if (!pag) return;

            var dati = Object.assign({
                tipo: tipo,
                nome_ragione_sociale: nome,
                p_iva_coe: modal.querySelector('#cl-piva').value.trim() || null,
                email: modal.querySelector('#cl-email').value.trim() || null,
                telefono: modal.querySelector('#cl-telefono').value.trim() || null,
                targa: modal.querySelector('#cl-targa').value.trim() || null,
                listino_personalizzato: listinoPersonalizzato,
                note: modal.querySelector('#cl-note').value.trim() || null,
                sede_legale_indirizzo: modal.querySelector('#cl-sede-indirizzo').value.trim() || null,
                sede_legale_cap: modal.querySelector('#cl-sede-cap').value.trim() || null,
                sede_legale_comune: modal.querySelector('#cl-sede-comune').value.trim() || null,
                sede_legale_provincia: modal.querySelector('#cl-sede-prov').value.trim() || null,
                sede_legale_nazione: modal.querySelector('#cl-sede-naz').value.trim() || 'SM',
                pec: modal.querySelector('#cl-pec').value.trim() || null,
                rif_amministrazione: modal.querySelector('#cl-rif-amm').value.trim() || null,
                applica_monofase: modal.querySelector('#cl-monofase').checked,
                note_fatturazione: modal.querySelector('#cl-note-fatt').value.trim() || null,
                voci_ricorrenti_fattura: vociHelper.readAll()
            }, pag);

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
                    _infoRow('Servizi al banco', _pagLabel(cliente.modalita_pagamento) || '-') +
                    _infoRow('Pagamento fattura', cliente.modalita_pagamento_fattura
                        ? '<span style="color:var(--color-primary);font-weight:600;">' + ENI.UI.escapeHtml(_labelPagFattura(cliente.modalita_pagamento_fattura)) + '</span>'
                        : '<span style="color:var(--color-danger);font-style:italic;">Non impostato</span>', true) +
                    (cliente.modalita_pagamento_fattura === 'RID_SDD' ? _infoRow('Mandato SDD', _mandatoInfoHtml(cliente), true) : '') +
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
                    (_abiCabInfo(ENI.IbanMandato.abiCab(cliente.iban), cliente) ? _infoRow('ABI / CAB', _abiCabInfo(ENI.IbanMandato.abiCab(cliente.iban), cliente), true) : '') +
                    (cliente.banca_appoggio ? _infoRow('Banca d\'appoggio', cliente.banca_appoggio) : '') +
                    _infoRow('Scadenza', ENI.Fatturazione.Scadenza.descrivi(cliente.modalita_pagamento_fattura)) +
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

        // Listino personalizzato: tabella prezzi per tipo di lavaggio, precompilata
        var listino = await ENI.API.getListino();
        var lpEsistente = c.listino_personalizzato || {};
        var tipiLavaggio = listino.map(function(l) {
            var val = (lpEsistente[l.tipo_lavaggio] != null && lpEsistente[l.tipo_lavaggio] !== '') ? lpEsistente[l.tipo_lavaggio] : '';
            var scontoInit = '-';
            var vn = parseFloat(val);
            if (!isNaN(vn) && vn > 0 && l.prezzo_standard) {
                var sc = ((l.prezzo_standard - vn) / l.prezzo_standard) * 100;
                scontoInit = sc > 0 ? '<span class="listino-sconto discount">-' + sc.toFixed(1) + '%</span>'
                    : (sc < 0 ? '<span class="listino-sconto surcharge">+' + Math.abs(sc).toFixed(1) + '%</span>' : '0%');
            }
            return '<tr>' +
                '<td>' + ENI.UI.escapeHtml(l.tipo_lavaggio) + '</td>' +
                '<td>' + ENI.UI.formatValuta(l.prezzo_standard) + '</td>' +
                '<td><input type="number" step="0.01" min="0" class="form-input" data-listino-tipo="' + ENI.UI.escapeHtml(l.tipo_lavaggio) + '" style="max-width:100px;" value="' + val + '" placeholder="' + l.prezzo_standard + '"></td>' +
                '<td class="text-sm" data-sconto-for="' + ENI.UI.escapeHtml(l.tipo_lavaggio) + '">' + scontoInit + '</td>' +
            '</tr>';
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
                _pagamentoSectionHtml(c, 'mod') +
                '<div class="form-group"><label class="form-label">Note</label>' +
                    '<textarea class="form-textarea" id="mod-note" rows="2">' + ENI.UI.escapeHtml(c.note || '') + '</textarea></div>' +
                // Listino personalizzato (prezzi speciali per tipo di lavaggio)
                '<div id="mod-listino-section"' + (c.tipo === 'Corporate' ? '' : ' style="display:none;"') + '>' +
                    '<div class="section-title mt-3">\u{1F4B3} Listino Personalizzato</div>' +
                    '<div class="text-xs text-muted" style="margin-bottom:0.5rem;">Prezzi speciali per questo cliente: verranno proposti in automatico quando prenoti un lavaggio.</div>' +
                    '<div class="table-wrapper"><table class="listino-table">' +
                        '<thead><tr><th>Tipo</th><th>Standard</th><th>Personalizzato</th><th>Sconto</th></tr></thead>' +
                        '<tbody>' + tipiLavaggio + '</tbody>' +
                    '</table></div>' +
                '</div>' +
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
        _pagamentoAttach(modal, c, 'mod');

        // Mostra/nascondi il listino personalizzato in base al tipo cliente
        modal.querySelectorAll('input[name="tipo"]').forEach(function(radio) {
            radio.addEventListener('change', function(e) {
                var sec = modal.querySelector('#mod-listino-section');
                if (sec) sec.style.display = (e.target.value === 'Corporate') ? '' : 'none';
            });
        });

        // Calcolo sconto dinamico sui prezzi personalizzati
        modal.querySelectorAll('[data-listino-tipo]').forEach(function(input) {
            input.addEventListener('input', function() {
                var tipo = input.dataset.listinoTipo;
                var standard = listino.find(function(l) { return l.tipo_lavaggio === tipo; });
                var scontoEl = modal.querySelector('[data-sconto-for="' + tipo + '"]');
                if (!standard || !scontoEl) return;
                var val = parseFloat(input.value);
                if (isNaN(val) || val <= 0) { scontoEl.innerHTML = '-'; return; }
                var sconto = ((standard.prezzo_standard - val) / standard.prezzo_standard) * 100;
                if (sconto > 0) scontoEl.innerHTML = '<span class="listino-sconto discount">-' + sconto.toFixed(1) + '%</span>';
                else if (sconto < 0) scontoEl.innerHTML = '<span class="listino-sconto surcharge">+' + Math.abs(sconto).toFixed(1) + '%</span>';
                else scontoEl.innerHTML = '0%';
            });
        });

        modal.querySelector('#btn-salva-modifica').addEventListener('click', async function() {
            var nome = modal.querySelector('#mod-nome').value.trim();
            if (!nome) { ENI.UI.toast('Il nome è obbligatorio', 'danger'); return; }

            var tipoCliente = modal.querySelector('input[name="tipo"]:checked').value;

            // Raccoglie il listino personalizzato (solo Corporate)
            var listinoPersonalizzato = null;
            if (tipoCliente === 'Corporate') {
                var lp = {}; var hasListino = false;
                modal.querySelectorAll('[data-listino-tipo]').forEach(function(input) {
                    var val = parseFloat(input.value);
                    if (!isNaN(val) && val > 0) { lp[input.dataset.listinoTipo] = val; hasListino = true; }
                });
                if (hasListino) listinoPersonalizzato = lp;
            }

            var pag = _pagamentoDati(modal, c, 'mod');
            if (!pag) return;

            var dati = Object.assign({
                tipo: tipoCliente,
                nome_ragione_sociale: nome,
                listino_personalizzato: listinoPersonalizzato,
                p_iva_coe: modal.querySelector('#mod-piva').value.trim() || null,
                email: modal.querySelector('#mod-email').value.trim() || null,
                telefono: modal.querySelector('#mod-telefono').value.trim() || null,
                targa: modal.querySelector('#mod-targa').value.trim() || null,
                note: modal.querySelector('#mod-note').value.trim() || null,
                sede_legale_indirizzo: modal.querySelector('#mod-sede-ind').value.trim() || null,
                sede_legale_cap: modal.querySelector('#mod-sede-cap').value.trim() || null,
                sede_legale_comune: modal.querySelector('#mod-sede-com').value.trim() || null,
                sede_legale_provincia: modal.querySelector('#mod-sede-prov').value.trim() || null,
                sede_legale_nazione: modal.querySelector('#mod-sede-naz').value.trim() || 'SM',
                pec: modal.querySelector('#mod-pec').value.trim() || null,
                rif_amministrazione: modal.querySelector('#mod-rif-amm').value.trim() || null,
                applica_monofase: modal.querySelector('#mod-monofase').checked,
                note_fatturazione: modal.querySelector('#mod-note-fatt').value.trim() || null,
                voci_ricorrenti_fattura: vociHelper.readAll()
            }, pag);

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
    // Esporta tutta la rubrica clienti in un file Excel (.xlsx). SOLO lettura.
    function _esportaRubrica() {
        if (!_clienti || _clienti.length === 0) {
            ENI.UI.warning('Nessun cliente da esportare');
            return;
        }
        var righe = _clienti.map(function(c) {
            return {
                'Nome / Ragione sociale': c.nome_ragione_sociale || '',
                'Tipo': c.tipo || '',
                'P.IVA / COE': c.p_iva_coe || '',
                'Telefono': c.telefono || '',
                'Email': c.email || '',
                'PEC': c.pec || '',
                'Targa': c.targa || '',
                'Pagamento fattura': c.modalita_pagamento_fattura || '',
                'Mandato SDD': c.mandate_id || '',
                'Firma mandato': _fmtDataIt(c.mandato_data_firma),
                'Rif. amministrazione': c.rif_amministrazione || ''
            };
        });
        try {
            var ws = XLSX.utils.json_to_sheet(righe);
            var wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Clienti');
            var oggi = (ENI.UI.oggiISO ? ENI.UI.oggiISO() : new Date().toISOString().slice(0, 10));
            XLSX.writeFile(wb, 'rubrica_clienti_' + oggi + '.xlsx');
            ENI.UI.success(righe.length + ' clienti esportati');
        } catch (e) {
            console.error('Errore export rubrica:', e);
            ENI.UI.error('Errore durante l\'esportazione');
        }
    }

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
