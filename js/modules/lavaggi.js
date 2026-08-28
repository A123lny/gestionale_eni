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
    var _filtroStato = 'tutti';   // tutti | dafare | completati
    var _ricerca = '';
    var _reportPeriodo = 'mese';  // settimana | mese | anno
    var _reportData = [];
    var _reportChart = null;
    var _reportChartConfig = null;

    function _canEditListino() {
        var ruolo = ENI.State.getUserRole();
        return ruolo === 'Admin' || ruolo === 'Cassiere';
    }

    async function render(container) {
        // Riallinea sempre al giorno corrente all'apertura della pagina
        _dataSelezionata = ENI.UI.oggiISO();
        _meseCorrente = parseInt(_dataSelezionata.split('-')[1], 10);
        _annoCorrente = parseInt(_dataSelezionata.split('-')[0], 10);

        // Il Report lavaggi è riservato al Super Admin
        if (_vistaCorrente === 'report' && !ENI.State.isSuperAdmin()) _vistaCorrente = 'tabella';

        var listinoChip = _canEditListino()
            ? '<button class="chip ' + (_vistaCorrente === 'listino' ? 'active' : '') + '" data-vista="listino">\u{1F4B0} Listino</button>'
            : '';
        var reportChip = ENI.State.isSuperAdmin()
            ? '<button class="chip ' + (_vistaCorrente === 'report' ? 'active' : '') + '" data-vista="report">\u{1F4CA} Report</button>'
            : '';

        container.innerHTML =
            '<div class="page-header">' +
                '<h1 class="page-title">\u{1F697} Lavaggi</h1>' +
                '<div class="btn-group" id="lavaggi-actions"' + (['listino', 'prenotazioni', 'report', 'calendario'].indexOf(_vistaCorrente) !== -1 ? ' style="display:none;"' : '') + '>' +
                    '<button class="btn btn-primary" id="btn-nuovo-lavaggio">\u{1F4C5} Prenota</button>' +
                    '<button class="btn btn-outline" id="btn-walkin">\u{1F6B6} Walk-in</button>' +
                '</div>' +
            '</div>' +

            '<div class="filter-bar">' +
                '<input type="date" class="form-input" id="lavaggi-data" value="' + _dataSelezionata + '"' +
                    (['listino', 'prenotazioni', 'report', 'calendario'].indexOf(_vistaCorrente) !== -1 ? ' style="display:none;"' : '') + '>' +
                '<div class="filter-chips">' +
                    '<button class="chip ' + (_vistaCorrente === 'tabella' ? 'active' : '') + '" data-vista="tabella">\u{1F4CB} Tabella</button>' +
                    '<button class="chip ' + (_vistaCorrente === 'timeline' ? 'active' : '') + '" data-vista="timeline">\u{1F3A8} Timeline</button>' +
                    '<button class="chip ' + (_vistaCorrente === 'calendario' ? 'active' : '') + '" data-vista="calendario">\u{1F4C5} Calendario</button>' +
                    reportChip +
                    '<button class="chip ' + (_vistaCorrente === 'prenotazioni' ? 'active' : '') + '" data-vista="prenotazioni">\u{1F514} Prenotazioni online</button>' +
                    listinoChip +
                '</div>' +
            '</div>' +

            '<div id="lavaggi-content"></div>';

        _setupEvents(container);
        if (_vistaCorrente === 'listino') {
            _renderListino();
        } else if (_vistaCorrente === 'prenotazioni') {
            _renderPrenotazioni();
        } else if (_vistaCorrente === 'report') {
            _renderReport();
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
            } else if (_vistaCorrente === 'prenotazioni') {
                if (dateInput) dateInput.style.display = 'none';
                if (actionsEl) actionsEl.style.display = 'none';
                _renderPrenotazioni();
            } else if (_vistaCorrente === 'report') {
                if (dateInput) dateInput.style.display = 'none';
                if (actionsEl) actionsEl.style.display = 'none';
                _renderReport();
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
        } else if (_vistaCorrente === 'prenotazioni') {
            _renderPrenotazioni();
        } else {
            _renderTabella();
        }
    }

    // --- Tabella (con riepilogo, filtri, evidenza priorit\u00E0 e vista mobile) ---

    function _ensureStyle() {
        if (document.getElementById('lavaggi-enh-style')) return;
        var st = document.createElement('style');
        st.id = 'lavaggi-enh-style';
        st.textContent =
            '#lavaggi-content .lav-summary{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;}' +
            '#lavaggi-content .lav-kpi{flex:1;min-width:88px;background:var(--bg-card);border:1px solid var(--color-gray-200);border-radius:var(--radius-md);padding:8px 12px;text-align:center;}' +
            '#lavaggi-content .lav-kpi-val{font-size:1.25rem;font-weight:700;line-height:1.1;}' +
            '#lavaggi-content .lav-kpi-lbl{font-size:0.7rem;color:var(--color-gray-500);text-transform:uppercase;letter-spacing:.03em;margin-top:2px;}' +
            '#lavaggi-content .lav-kpi.k-dafare .lav-kpi-val{color:var(--color-primary);}' +
            '#lavaggi-content .lav-kpi.k-done .lav-kpi-val{color:#1baf7a;}' +
            '#lavaggi-content .lav-toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;margin-bottom:12px;}' +
            '#lavaggi-content .lav-search{max-width:280px;}' +
            '#lavaggi-content tr.lav-row-aspetta>td{background:rgba(27,175,122,0.09);}' +
            '#lavaggi-content tr.lav-row-aspetta>td:first-child{box-shadow:inset 3px 0 0 #1baf7a;}' +
            '#lavaggi-content tr.lav-row-done{opacity:0.55;}' +
            '#lavaggi-content .lav-cards{display:flex;flex-direction:column;gap:8px;}' +
            '#lavaggi-content .lav-card{background:var(--bg-card);border:1px solid var(--color-gray-200);border-left:4px solid var(--color-gray-200);border-radius:var(--radius-md);padding:10px 12px;}' +
            '#lavaggi-content .lav-card.lav-card-aspetta{border-left-color:#1baf7a;background:rgba(27,175,122,0.06);}' +
            '#lavaggi-content .lav-card.lav-card-done{opacity:0.6;}' +
            '#lavaggi-content .lav-card-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;}' +
            '#lavaggi-content .lav-card-orario{font-weight:600;font-size:0.85rem;}' +
            '#lavaggi-content .lav-card-veicolo{font-weight:700;}' +
            '#lavaggi-content .lav-card-meta{font-size:0.85rem;margin:2px 0;}' +
            '#lavaggi-content .lav-card-actions{margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;}' +
            '#lavaggi-content .lav-desktop thead th{position:sticky;top:0;z-index:2;background:var(--bg-card);}' +
            '#lavaggi-content .lav-cards-tot{padding:8px 12px;margin-top:4px;font-weight:600;text-align:right;color:var(--color-gray-600,#52514e);}' +
            '@media (max-width:768px){#lavaggi-content .lav-desktop{display:none;}}' +
            '@media (min-width:769px){#lavaggi-content .lav-mobile{display:none;}}';
        document.head.appendChild(st);
    }

    function _riepilogoHtml() {
        var tot = _lavaggi.length, daFare = 0, completati = 0, incasso = 0, previsto = 0;
        _lavaggi.forEach(function(l) {
            if (l.stato === 'Prenotato') { daFare++; previsto += Number(l.prezzo || 0); }
            else if (l.stato === 'Completato') { completati++; incasso += Number(l.prezzo || 0); }
        });
        function kpi(val, label, cls) {
            return '<div class="lav-kpi ' + (cls || '') + '"><div class="lav-kpi-val">' + val + '</div><div class="lav-kpi-lbl">' + label + '</div></div>';
        }
        return '<div class="lav-summary">' +
            kpi(tot, 'Lavaggi') +
            kpi(daFare, 'Da fare', 'k-dafare') +
            kpi(completati, 'Completati', 'k-done') +
            kpi(ENI.UI.formatValuta(incasso), 'Incasso') +
            kpi(ENI.UI.formatValuta(previsto), 'Previsto') +
        '</div>';
    }

    function _toolbarHtml() {
        var nTutti = _lavaggi.length, nDaFare = 0, nCompl = 0;
        _lavaggi.forEach(function(l) {
            if (l.stato === 'Prenotato') nDaFare++;
            else if (l.stato === 'Completato') nCompl++;
        });
        function chip(id, label) {
            return '<button class="chip lav-filtro' + (_filtroStato === id ? ' active' : '') + '" data-filtro="' + id + '">' + label + '</button>';
        }
        return '<div class="lav-toolbar">' +
            '<div class="filter-chips">' +
                chip('tutti', 'Tutti (' + nTutti + ')') +
                chip('dafare', 'Da fare (' + nDaFare + ')') +
                chip('completati', 'Completati (' + nCompl + ')') +
            '</div>' +
            '<input type="search" class="form-input lav-search" id="lav-ricerca" placeholder="Cerca targa, veicolo, cliente\u2026" value="' + ENI.UI.escapeHtml(_ricerca) + '">' +
        '</div>';
    }

    function _lavaggiVista() {
        var q = _ricerca.trim().toLowerCase();
        function statoRank(l) { return l.stato === 'Prenotato' ? 0 : (l.stato === 'Completato' ? 1 : 2); }
        function prioRank(l) { return l.priorita === 'ASPETTA' ? 0 : 1; }
        var arr = _lavaggi.filter(function(l) {
            if (_filtroStato === 'dafare' && l.stato !== 'Prenotato') return false;
            if (_filtroStato === 'completati' && l.stato !== 'Completato') return false;
            if (q) {
                var hay = ((l.veicolo || '') + ' ' + (l.nome_cliente || '') + ' ' + (l.cellulare || '') + ' ' + (l.tipo_lavaggio || '')).toLowerCase();
                if (hay.indexOf(q) === -1) return false;
            }
            return true;
        });
        arr.sort(function(a, b) {
            var s = statoRank(a) - statoRank(b);
            if (s) return s;
            if (a.stato === 'Prenotato' && b.stato === 'Prenotato') {
                var p = prioRank(a) - prioRank(b);
                if (p) return p;
            }
            return (a.orario_inizio || '').localeCompare(b.orario_inizio || '');
        });
        return arr;
    }

    function _azioniHtml(l) {
        var isPrenotato = l.stato === 'Prenotato';
        return (isPrenotato
                ? '<button class="btn btn-sm btn-success" data-completa-id="' + l.id + '" title="Completa">\u2713</button>' +
                  '<button class="btn btn-sm btn-outline" data-modifica-id="' + l.id + '" title="Modifica">\u270F\uFE0F</button>' +
                  '<button class="btn btn-sm btn-ghost" data-annulla-id="' + l.id + '" title="Annulla">\u274C</button>'
                : '') +
            (l.stato === 'Completato'
                ? '<button class="btn btn-sm btn-outline" data-modifica-id="' + l.id + '" title="Modifica">\u270F\uFE0F</button>'
                : '') +
            '<button class="btn btn-sm btn-ghost" data-elimina-id="' + l.id + '" title="Elimina definitivamente">\u{1F5D1}</button>';
    }

    function _extraBadge(l) {
        if (!l.servizi_extra || l.servizi_extra.length === 0) return '';
        var titolo = l.servizi_extra.map(function(e) { return ENI.UI.escapeHtml(e.nome); }).join(', ');
        return ' <span class="badge badge-info" title="' + titolo + '">+' + l.servizi_extra.length + ' extra</span>';
    }

    function _clienteIcona(l) {
        if (l.walk_in) return '\u{1F6B6} ';
        if (l.cliente_id) return '\u{1F464} ';
        return '';
    }

    function _notaIcona(l) {
        if (l.note && String(l.note).trim()) {
            return ' <span title="' + ENI.UI.escapeHtml(String(l.note).trim()) + '">\u{1F4DD}</span>';
        }
        return '';
    }

    function _prioritaLabel(l) {
        if (l.priorita === 'ASPETTA') return '\u{1F7E2} Aspetta';
        if (l.priorita === 'LASCIA') return '\u{1F534} Lascia';
        return '-';
    }

    function _orarioLabel(l) {
        var i = ENI.UI.formatOra(l.orario_inizio);
        if (l.walk_in || !l.orario_fine || l.orario_inizio === l.orario_fine) return i;
        return i + '-' + ENI.UI.formatOra(l.orario_fine);
    }

    function _rigaTabella(l) {
        var trClass = l.stato === 'Completato' ? 'lav-row-done'
            : ((l.priorita === 'ASPETTA' && l.stato === 'Prenotato') ? 'lav-row-aspetta' : '');
        return '<tr' + (trClass ? ' class="' + trClass + '"' : '') + '>' +
            '<td class="text-sm">' + _orarioLabel(l) + '</td>' +
            '<td><strong>' + ENI.UI.escapeHtml(l.veicolo || '-') + '</strong>' +
                (l.note && String(l.note).trim() ? '<div class="text-xs text-muted" style="white-space:pre-wrap;margin-top:2px;">\u{1F4DD} ' + ENI.UI.escapeHtml(String(l.note).trim()) + '</div>' : '') +
            '</td>' +
            '<td class="text-sm">' +
                _clienteIcona(l) + ENI.UI.escapeHtml(l.nome_cliente) +
                (l.cellulare ? '<br><a href="tel:' + ENI.UI.escapeHtml(l.cellulare) + '" class="text-xs text-muted">\u{1F4F1} ' + ENI.UI.escapeHtml(l.cellulare) + '</a>' : '') +
            '</td>' +
            '<td class="text-sm">' + ENI.UI.escapeHtml(l.tipo_lavaggio) + _extraBadge(l) + '</td>' +
            '<td><strong>' + ENI.UI.formatValuta(l.prezzo) + '</strong></td>' +
            '<td class="text-sm">' + _prioritaLabel(l) + '</td>' +
            '<td>' + ENI.UI.badgeStato(l.stato) + '</td>' +
            '<td class="table-actions">' + _azioniHtml(l) + '</td>' +
        '</tr>';
    }

    function _cardLavaggio(l) {
        var cls = l.stato === 'Completato' ? 'lav-card-done'
            : ((l.priorita === 'ASPETTA' && l.stato === 'Prenotato') ? 'lav-card-aspetta' : '');
        return '<div class="lav-card ' + cls + '">' +
            '<div class="lav-card-top">' +
                '<span class="lav-card-orario">' + _orarioLabel(l) + '</span>' +
                ENI.UI.badgeStato(l.stato) +
            '</div>' +
            '<div class="lav-card-veicolo">' + ENI.UI.escapeHtml(l.veicolo || l.nome_cliente || '-') + '</div>' +
            '<div class="lav-card-meta">' + ENI.UI.escapeHtml(l.tipo_lavaggio) + ' \u00B7 <strong>' + ENI.UI.formatValuta(l.prezzo) + '</strong>' +
                (l.priorita ? ' \u00B7 ' + _prioritaLabel(l) : '') + _extraBadge(l) +
            '</div>' +
            '<div class="lav-card-cliente text-sm text-muted">' + _clienteIcona(l) + ENI.UI.escapeHtml(l.nome_cliente || '') +
                (l.cellulare ? ' \u00B7 <a href="tel:' + ENI.UI.escapeHtml(l.cellulare) + '">\u{1F4F1} ' + ENI.UI.escapeHtml(l.cellulare) + '</a>' : '') +
            '</div>' +
            (l.note && String(l.note).trim()
                ? '<div class="lav-card-nota text-sm" style="margin-top:6px; padding:6px 10px; background:var(--bg-secondary); border-left:3px solid var(--color-warning,#F5B301); border-radius:4px; white-space:pre-wrap; line-height:1.35;">\u{1F4DD} ' + ENI.UI.escapeHtml(String(l.note).trim()) + '</div>'
                : '') +
            '<div class="lav-card-actions table-actions">' + _azioniHtml(l) + '</div>' +
        '</div>';
    }

    function _renderLavList() {
        var listaEl = document.getElementById('lav-lista');
        if (!listaEl) return;
        var lista = _lavaggiVista();

        if (lista.length === 0) {
            listaEl.innerHTML =
                '<div class="empty-state">' +
                    '<div class="empty-state-icon">\u{1F697}</div>' +
                    '<p class="empty-state-text">' + (_lavaggi.length === 0 ? 'Nessun lavaggio per questa data' : 'Nessun lavaggio con questi filtri') + '</p>' +
                '</div>';
            return;
        }

        var table = '<div class="lav-desktop"><div class="table-wrapper"><table class="table">' +
            '<thead><tr>' +
                '<th>Orario</th><th>Veicolo</th><th>Cliente</th><th>Tipo</th>' +
                '<th>Prezzo</th><th>Priorit\u00E0</th><th>Stato</th><th>Azioni</th>' +
            '</tr></thead><tbody>' +
            lista.map(_rigaTabella).join('') +
            '</tbody></table></div></div>';

        var cards = '<div class="lav-mobile"><div class="lav-cards">' +
            lista.map(_cardLavaggio).join('') +
        '</div></div>';

        listaEl.innerHTML = table + cards;
    }

    function _wireToolbar(contentEl) {
        contentEl.querySelectorAll('.lav-filtro[data-filtro]').forEach(function(b) {
            b.addEventListener('click', function() {
                _filtroStato = b.dataset.filtro;
                contentEl.querySelectorAll('.lav-filtro[data-filtro]').forEach(function(x) {
                    x.classList.toggle('active', x.dataset.filtro === _filtroStato);
                });
                _renderLavList();
            });
        });
        var search = contentEl.querySelector('#lav-ricerca');
        if (search) {
            search.addEventListener('input', function() {
                _ricerca = search.value;
                _renderLavList();
            });
        }
    }

    function _renderTabella() {
        var contentEl = document.getElementById('lavaggi-content');
        if (!contentEl) return;
        _ensureStyle();

        contentEl.innerHTML =
            _riepilogoHtml() +
            _toolbarHtml() +
            '<div id="lav-lista"></div>';

        _wireToolbar(contentEl);
        _renderLavList();
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

        var startHour = ENI.Config.CONSTANTS.ORARIO_APERTURA;
        var endHour = ENI.Config.CONSTANTS.ORARIO_CHIUSURA;
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
            var isShort = width < ENI.Config.CONSTANTS.TIMELINE_SOGLIA_CORTA;

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

        _ensureStyle();
        contentEl.innerHTML =
            _riepilogoHtml() +
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

    var NOTE_PRESET = [
        { icon: '\u{1F4DE}', label: 'Chiamare quando è pronta', testo: 'Chiamare quando è pronta' },
        { icon: '⛽', label: 'Fare il pieno', testo: 'Fare il pieno' },
        { icon: '\u{1F6E2}️', label: 'Controllo livelli', testo: 'Controllo livelli' },
        { icon: '\u{1F6DE}', label: 'Controllo gomme', testo: 'Controllo gomme' }
    ];

    // Aggiunge/rimuove una nota preimpostata nella textarea (una per riga)
    function _toggleNotaPreset(testo, chipEl, textarea) {
        if (!textarea) return;
        var lines = textarea.value.split('\n');
        var idx = -1;
        for (var i = 0; i < lines.length; i++) {
            if (lines[i].trim() === testo) { idx = i; break; }
        }
        if (idx !== -1) {
            lines.splice(idx, 1);
            if (chipEl) chipEl.classList.remove('active');
        } else {
            if (lines.length === 1 && lines[0].trim() === '') lines = [];
            lines.push(testo);
            if (chipEl) chipEl.classList.add('active');
        }
        textarea.value = lines.join('\n');
    }

    async function _showFormLavaggio(isWalkin) {
        var listino = await ENI.API.getListino();
        var clientiAbituali = [];
        try { clientiAbituali = await ENI.API.getClientiConPrezzi(); } catch(e) { clientiAbituali = []; }

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

                // Data del lavaggio
                '<div class="form-group">' +
                    '<label class="form-label form-label-required">Data</label>' +
                    '<input type="date" class="form-input" id="lav-data" value="' + _dataSelezionata + '">' +
                '</div>' +

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

                // Cliente (opzionale) - ricerca invece di elenco completo
                '<div class="form-group">' +
                    '<label class="form-label">Cliente registrato</label>' +
                    '<div style="position:relative;">' +
                        '<div style="display:flex;gap:8px;">' +
                            '<input type="text" class="form-input" id="lav-cliente-search" autocomplete="off" placeholder="Cerca per nome, targa o P.IVA… (vuoto = anonimo)" style="flex:1;">' +
                            '<button type="button" class="btn btn-outline" id="btn-nuovo-cliente-inline" title="Nuovo Cliente" style="white-space:nowrap;">+ Nuovo</button>' +
                        '</div>' +
                        '<div id="lav-cliente-results" style="display:none; position:absolute; z-index:50; left:0; right:0; margin-top:4px; background:var(--bg-card); border:1px solid var(--color-gray-200); border-radius:var(--radius-md); max-height:240px; overflow:auto; box-shadow:0 6px 20px rgba(0,0,0,0.12);"></div>' +
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
                    '<div class="lav-note-quick" style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:6px;">' +
                        NOTE_PRESET.map(function(n) {
                            return '<button type="button" class="chip lav-nota-preset" data-nota="' + ENI.UI.escapeHtml(n.testo) + '">' + n.icon + ' ' + ENI.UI.escapeHtml(n.label) + '</button>';
                        }).join('') +
                    '</div>' +
                    '<textarea class="form-textarea" id="lav-note" rows="2" placeholder="Clicca una nota rapida o scrivi qui…"></textarea>' +
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
        var prezzoInput = modal.querySelector('#lav-prezzo');
        var prezzoInfo = modal.querySelector('#lav-prezzo-info');
        var clienteInfo = modal.querySelector('#lav-cliente-info');
        var cellulareInput = modal.querySelector('#lav-cellulare');
        var clienteSearch = modal.querySelector('#lav-cliente-search');
        var clienteResults = modal.querySelector('#lav-cliente-results');

        // Cliente selezionato (null = anonimo) e cache prezzi per sessione form
        var clienteSelezionato = null;
        var _prezziClienteCache = {};

        // --- Ricerca cliente (digita e scegli) ---
        var _ricercaTimer = null;
        var _risultatiClienti = [];

        function _mostraRisultati(lista) {
            _risultatiClienti = lista || [];
            if (!clienteResults) return;
            if (!_risultatiClienti.length) {
                clienteResults.innerHTML = '<div style="padding:8px 12px;" class="text-sm text-muted">Nessun cliente trovato</div>';
                clienteResults.style.display = 'block';
                return;
            }
            clienteResults.innerHTML = _risultatiClienti.map(function(c, i) {
                var icon = c.tipo === 'Corporate' ? '\u{1F3E2}' : '\u{1F464}';
                var meta = [c.targa, c.telefono].filter(Boolean).map(function(x) { return ENI.UI.escapeHtml(x); }).join(' · ');
                return '<div class="cli-result-item" data-idx="' + i + '" style="padding:8px 12px; cursor:pointer; border-bottom:1px solid var(--color-gray-200);">' +
                    icon + ' <strong>' + ENI.UI.escapeHtml(c.nome_ragione_sociale) + '</strong>' +
                    (meta ? '<div class="text-xs text-muted">' + meta + '</div>' : '') +
                '</div>';
            }).join('');
            clienteResults.style.display = 'block';
        }

        function _nascondiRisultati() {
            if (clienteResults) clienteResults.style.display = 'none';
        }

        function _mostraAbituali() {
            if (!clienteResults || !clientiAbituali || !clientiAbituali.length) { _nascondiRisultati(); return; }
            _risultatiClienti = clientiAbituali;
            var head = '<div style="padding:6px 12px; font-size:0.72rem; text-transform:uppercase; letter-spacing:.03em; color:var(--color-gray-500); background:var(--bg-secondary);">Clienti abituali</div>';
            clienteResults.innerHTML = head + clientiAbituali.map(function(c, i) {
                var prezzi = '';
                if (c.listino_personalizzato) {
                    prezzi = Object.keys(c.listino_personalizzato).map(function(k) {
                        return ENI.UI.escapeHtml(k) + ' ' + ENI.UI.formatValuta(c.listino_personalizzato[k]);
                    }).join(' · ');
                }
                return '<div class="cli-result-item" data-idx="' + i + '" style="padding:8px 12px; cursor:pointer; border-bottom:1px solid var(--color-gray-200);">' +
                    '\u{1F3E2} <strong>' + ENI.UI.escapeHtml(c.nome_ragione_sociale) + '</strong>' +
                    (prezzi ? '<div class="text-xs text-muted">' + prezzi + '</div>' : '') +
                '</div>';
            }).join('');
            clienteResults.style.display = 'block';
        }

        function _selezionaCliente(c) {
            clienteSelezionato = c || null;
            _nascondiRisultati();
            if (c) {
                clienteSearch.value = c.nome_ragione_sociale;
                if (c.telefono) cellulareInput.value = c.telefono;
                var pagLabel = ENI.Config.MODALITA_PAGAMENTO.find(function(m) { return m.value === c.modalita_pagamento; });
                clienteInfo.innerHTML = '✓ ' + ENI.UI.escapeHtml(c.tipo || '') + (c.modalita_pagamento ? ' - ' + (pagLabel ? pagLabel.label : c.modalita_pagamento) : '') +
                    ' <a href="#" id="lav-cliente-clear" style="margin-left:6px;">✕ rimuovi</a>';
                var clearLink = modal.querySelector('#lav-cliente-clear');
                if (clearLink) clearLink.addEventListener('click', function(e) {
                    e.preventDefault();
                    _selezionaCliente(null);
                    clienteSearch.value = '';
                    clienteSearch.focus();
                });
            } else {
                clienteInfo.textContent = '';
            }
            _aggiornaEtichetteTipo();
            _aggiornaPrezzo();
        }

        if (clienteSearch) {
            clienteSearch.addEventListener('input', function() {
                var term = clienteSearch.value.trim();
                // Se l'utente modifica il testo, la selezione precedente non è più valida
                if (clienteSelezionato && term !== clienteSelezionato.nome_ragione_sociale) {
                    clienteSelezionato = null;
                    clienteInfo.textContent = '';
                    _aggiornaEtichetteTipo();
                }
                if (_ricercaTimer) clearTimeout(_ricercaTimer);
                if (term.length === 0) { _mostraAbituali(); return; }
                if (term.length < ENI.Config.CONSTANTS.SEARCH_MIN_CHARS) { _nascondiRisultati(); return; }
                _ricercaTimer = setTimeout(function() {
                    ENI.API.cercaClienti(term).then(_mostraRisultati).catch(function() { _nascondiRisultati(); });
                }, ENI.Config.CONSTANTS.SEARCH_DEBOUNCE_MS);
            });
            clienteSearch.addEventListener('focus', function() {
                if (!clienteSearch.value.trim()) _mostraAbituali();
            });
            ENI.UI.delegate(clienteResults, 'click', '.cli-result-item', function(e, el) {
                var c = _risultatiClienti[parseInt(el.dataset.idx, 10)];
                if (c) _selezionaCliente(c);
            });
            document.addEventListener('click', function(e) {
                if (clienteResults && !clienteResults.contains(e.target) && e.target !== clienteSearch) _nascondiRisultati();
            });
        }

        // Auto-prezzo da listino o da prezzi_cliente
        async function _aggiornaPrezzo() {
            var tipoOpt = tipoSelect.options[tipoSelect.selectedIndex];
            if (!tipoOpt || !tipoOpt.value) return;

            var prezzoStandard = parseFloat(tipoOpt.dataset.prezzo);
            var clienteId = clienteSelezionato ? clienteSelezionato.id : '';

            var trovato = false;

            // Cerca prezzo personalizzato nella tabella prezzi_cliente
            if (clienteId) {
                try {
                    if (!_prezziClienteCache[clienteId]) {
                        _prezziClienteCache[clienteId] = await ENI.API.getPrezziClientePerCliente(clienteId);
                    }
                    var prezziCliente = _prezziClienteCache[clienteId];
                    // Cerca articolo magazzino con nome uguale al tipo_lavaggio
                    var match = prezziCliente.find(function(pc) {
                        return pc.magazzino && pc.magazzino.nome_prodotto === tipoOpt.value;
                    });
                    if (match) {
                        prezzoInput.value = Number(match.prezzo).toFixed(2);
                        prezzoInfo.textContent = 'Standard: ' + ENI.UI.formatValuta(prezzoStandard) + ' \u2192 Personalizzato';
                        trovato = true;
                    }
                } catch(e) {
                    console.error('Errore caricamento prezzi cliente:', e);
                }
            }

            // Fallback: listino_personalizzato sul cliente (retrocompatibilita)
            if (!trovato && clienteId) {
                var listinoCliente = (clienteSelezionato && clienteSelezionato.listino_personalizzato) ? clienteSelezionato.listino_personalizzato : null;
                if (listinoCliente && listinoCliente[tipoOpt.value] !== undefined) {
                    prezzoInput.value = listinoCliente[tipoOpt.value];
                    prezzoInfo.textContent = 'Standard: ' + ENI.UI.formatValuta(prezzoStandard) + ' \u2192 Personalizzato';
                    trovato = true;
                }
            }

            if (!trovato) {
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

        // Aggiorna le etichette del menu "Tipo Lavaggio" con i prezzi del cliente selezionato
        function _aggiornaEtichetteTipo() {
            if (!tipoSelect) return;
            var lp = (clienteSelezionato && clienteSelezionato.listino_personalizzato) ? clienteSelezionato.listino_personalizzato : null;
            for (var i = 0; i < tipoSelect.options.length; i++) {
                var opt = tipoSelect.options[i];
                if (!opt.value) continue;
                var std = parseFloat(opt.dataset.prezzo);
                var prezzo = (lp && lp[opt.value] != null) ? Number(lp[opt.value]) : std;
                opt.textContent = opt.value + ' - ' + ENI.UI.formatValuta(prezzo);
            }
        }

        tipoSelect.addEventListener('change', _aggiornaPrezzo);

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

        // Note preimpostate: toggle nella textarea
        var noteTextarea = modal.querySelector('#lav-note');
        modal.querySelectorAll('.lav-nota-preset').forEach(function(chip) {
            chip.addEventListener('click', function() {
                _toggleNotaPreset(chip.getAttribute('data-nota'), chip, noteTextarea);
            });
        });

        // Bottone + Nuovo cliente inline
        modal.querySelector('#btn-nuovo-cliente-inline').addEventListener('click', function() {
            _showFormNuovoClienteInline(function(record) { _selezionaCliente(record); });
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

            var clienteId = clienteSelezionato ? clienteSelezionato.id : null;
            var nomeCliente = clienteSelezionato ? clienteSelezionato.nome_ragione_sociale : 'Walk-in';

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
                data: (modal.querySelector('#lav-data') || {}).value || _dataSelezionata,
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
                var dataSalvata = dati.data;
                await ENI.API.salvaLavaggio(dati);
                ENI.UI.closeModal(modal);
                ENI.UI.success(isWalkin ? 'Walk-in registrato' : 'Lavaggio prenotato');
                // Walk-in = lavaggio già completato → stampa scontrino
                if (isWalkin) _stampaScontrinoLavaggio(dati);
                // Porta la vista sul giorno scelto se diverso da quello corrente
                if (dataSalvata && dataSalvata !== _dataSelezionata) {
                    _dataSelezionata = dataSalvata;
                    var df = document.getElementById('lavaggi-data');
                    if (df) df.value = _dataSelezionata;
                    var pd = _dataSelezionata.split('-');
                    _annoCorrente = parseInt(pd[0], 10);
                    _meseCorrente = parseInt(pd[1], 10);
                }
                await _loadLavaggi();
            } catch(e) {
                ENI.UI.handleError(e, 'salvataggio lavaggio');
            }
        });
    }

    // --- Form Nuovo Cliente Inline ---

    function _showFormNuovoClienteInline(onCreated) {
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

                ENI.UI.closeModal(ncModal);
                ENI.UI.success('Cliente "' + nome + '" creato');
                if (typeof onCreated === 'function') onCreated(record);
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
                await _eseguiCompletamento(id, lavaggio);
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

        await _eseguiCompletamento(id, lavaggio);
    }

    async function _eseguiCompletamento(id, lavaggio) {
        try {
            await ENI.API.completaLavaggio(id, lavaggio);
            ENI.UI.success('Lavaggio completato');
            _stampaScontrinoLavaggio(lavaggio);
            await _loadLavaggi();

            // Chiedi se registrare come vendita
            _chiediRegistraVendita(lavaggio);
        } catch(e) {
            ENI.UI.error('Errore: ' + e.message);
        }
    }

    function _chiediRegistraVendita(lavaggio) {
        var body =
            '<div style="text-align:center; margin-bottom: 16px;">' +
                '<div style="font-size: 48px;">\u{1F4B0}</div>' +
                '<p style="margin: 8px 0;">Lavaggio <strong>' + ENI.UI.escapeHtml(lavaggio.codice) + '</strong> completato.</p>' +
                '<p><strong>' + ENI.UI.escapeHtml(lavaggio.veicolo || '') + '</strong> - ' +
                    ENI.UI.escapeHtml(lavaggio.tipo_lavaggio) + ' - ' +
                    '<span style="font-size: 1.2rem; font-weight: bold; color: var(--color-primary);">' + ENI.UI.formatValuta(lavaggio.prezzo) + '</span>' +
                '</p>' +
                (lavaggio.nome_cliente && lavaggio.nome_cliente !== 'Walk-in'
                    ? '<p class="text-sm text-muted">Cliente: ' + ENI.UI.escapeHtml(lavaggio.nome_cliente) + '</p>'
                    : '') +
            '</div>' +
            '<p style="text-align:center;">Vuoi registrare anche come <strong>vendita</strong>?</p>';

        var vendModal = ENI.UI.showModal({
            title: 'Registrare come Vendita?',
            body: body,
            footer:
                '<button class="btn btn-outline" data-modal-close>No, solo lavaggio</button>' +
                '<button class="btn btn-primary" id="btn-registra-vendita">\u2705 Si, registra vendita</button>'
        });

        vendModal.querySelector('#btn-registra-vendita').addEventListener('click', async function() {
            ENI.UI.closeModal(vendModal);
            try {
                // Cerca articolo magazzino corrispondente
                var prodottiLavaggi = await ENI.API.getMagazzino('Lavaggi');
                var prodotto = prodottiLavaggi.find(function(p) {
                    return p.nome_prodotto === lavaggio.tipo_lavaggio;
                });

                var record = await ENI.API.salvaVenditaDaLavaggio(lavaggio, prodotto || null);
                ENI.UI.success('Vendita ' + record.codice + ' registrata da lavaggio ' + lavaggio.codice);
            } catch(e) {
                ENI.UI.error('Errore registrazione vendita: ' + e.message);
            }
        });
    }

    // --- Stampa scontrino lavaggio (riusa il print-server della Vendita) ---

    function _stampaScontrinoLavaggio(lavaggio) {
        if (!lavaggio) return;
        var now = new Date();
        var savedLayout = null;
        try { var raw = localStorage.getItem('titanwash_print_layout'); if (raw) savedLayout = JSON.parse(raw); } catch(e) {}

        var extras = lavaggio.servizi_extra || [];
        var totExtra = extras.reduce(function(s, e) { return s + Number(e.prezzo || 0); }, 0);
        var prezzoTot = Number(lavaggio.prezzo || 0);
        var prezzoBase = prezzoTot - totExtra;

        var righe = [{
            nome: lavaggio.tipo_lavaggio + (lavaggio.veicolo ? ' - ' + lavaggio.veicolo : ''),
            quantita: 1,
            prezzo_unitario: prezzoBase,
            sconto: 0,
            totale_riga: prezzoBase
        }];
        extras.forEach(function(e) {
            righe.push({ nome: e.nome, quantita: 1, prezzo_unitario: Number(e.prezzo || 0), sconto: 0, totale_riga: Number(e.prezzo || 0) });
        });

        var printData = {
            data: now.toLocaleDateString('it-IT'),
            ora: now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
            operatore: ENI.State.getUserName() || '-',
            righe: righe,
            subtotale: prezzoTot,
            totale: prezzoTot,
            metodo_pagamento: 'contanti',
            importo_contanti: prezzoTot,
            resto: 0,
            codice: lavaggio.codice || '',
            printer_ip: savedLayout ? savedLayout.printer_ip : ENI.Config.PRINTER_IP,
            printer_port: savedLayout ? savedLayout.printer_port : ENI.Config.PRINTER_PORT,
            layout: savedLayout || null
        };

        var serverUrl = ENI.Config.PRINT_SERVER_URL || 'http://localhost:3333';
        fetch(serverUrl + '/print', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(printData)
        })
        .then(function(r) { return r.json(); })
        .then(function(res) {
            if (res.success) ENI.UI.toast('Scontrino stampato', 'success');
            else ENI.UI.toast('Errore stampa: ' + (res.message || 'sconosciuto'), 'error');
        })
        .catch(function() { _inviaLavaggioACodaStampa(printData); });
    }

    function _inviaLavaggioACodaStampa(printData) {
        var client = ENI.API.getClient ? ENI.API.getClient() : null;
        if (!client) { ENI.UI.toast('Print server non raggiungibile', 'error'); return; }
        client.from('print_queue').insert({
            vendita_codice: printData.codice || 'LAV',
            print_data: printData,
            stato: 'pending'
        }).then(function(res) {
            if (res.error) ENI.UI.toast('Errore coda stampa', 'error');
            else ENI.UI.toast('Scontrino in coda di stampa', 'success');
        }).catch(function() { ENI.UI.toast('Errore coda stampa', 'error'); });
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

            // Annulla vendita collegata se esiste
            try {
                var venditaCollegata = await ENI.API.getVenditaPerLavaggio(id);
                if (venditaCollegata) {
                    await ENI.API.annullaVendita(venditaCollegata.id, venditaCollegata);
                    ENI.UI.success('Lavaggio ' + lavaggio.codice + ' e vendita ' + venditaCollegata.codice + ' annullati');
                } else {
                    ENI.UI.success('Lavaggio ' + lavaggio.codice + ' annullato');
                }
            } catch(e2) {
                ENI.UI.success('Lavaggio ' + lavaggio.codice + ' annullato');
            }

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

        // Controlla se c'e una vendita collegata
        var venditaCollegata = null;
        try {
            venditaCollegata = await ENI.API.getVenditaPerLavaggio(id);
        } catch(e) { /* ignore */ }

        var msg = 'Il lavaggio ' + lavaggio.codice + ' verr\u00E0 eliminato definitivamente dal database.\n\n' +
                  (lavaggio.veicolo || lavaggio.nome_cliente) + ' - ' +
                  lavaggio.tipo_lavaggio + ' - ' + ENI.UI.formatValuta(lavaggio.prezzo);

        if (venditaCollegata) {
            msg += '\n\nLa vendita collegata ' + venditaCollegata.codice + ' verr\u00E0 annullata.';
        }

        msg += '\n\nQuesta azione non pu\u00F2 essere annullata.';

        var ok = await ENI.UI.confirm({
            title: '\u{1F5D1} Elimina Definitivamente',
            message: msg,
            confirmText: 'Elimina',
            cancelText: 'Annulla',
            danger: true
        });

        if (!ok) return;

        try {
            // Annulla vendita collegata prima di eliminare
            if (venditaCollegata) {
                await ENI.API.annullaVendita(venditaCollegata.id, venditaCollegata);
            }

            await ENI.API.eliminaLavaggio(id, lavaggio);
            ENI.UI.success('Lavaggio ' + lavaggio.codice + ' eliminato' +
                (venditaCollegata ? ' e vendita ' + venditaCollegata.codice + ' annullata' : ''));
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

    // ============================================================
    // PRENOTAZIONI CLIENTI (da portale)
    // ============================================================

    async function _renderPrenotazioni() {
        var contentEl = document.getElementById('lavaggi-content');
        if (!contentEl) return;

        contentEl.innerHTML = '<div class="flex justify-center" style="padding: 2rem;"><div class="spinner"></div></div>';

        try {
            var tutte = await ENI.API.getPrenotazioniLavaggio({});
            // Separa in attesa e altre
            var inAttesa = tutte.filter(function(p) { return p.stato === 'in_attesa'; });
            var altre = tutte.filter(function(p) { return p.stato !== 'in_attesa'; });

            var html = '';

            // Sezione in attesa
            html += '<div class="card" style="margin-bottom: var(--space-4);">' +
                '<div class="card-header"><h3>\u{1F514} Da confermare (' + inAttesa.length + ')</h3></div>' +
                '<div class="card-body">';

            if (inAttesa.length === 0) {
                html += '<p class="text-muted text-center" style="padding: var(--space-4);">Nessuna prenotazione in attesa</p>';
            } else {
                inAttesa.forEach(function(p) {
                    var clienteNome = (p.clienti_portale && p.clienti_portale.nome_display) || 'Sconosciuto';
                    var clienteEmail = (p.clienti_portale && p.clienti_portale.email) || '';
                    var fasciaLabel = p.fascia_oraria || '';
                    if (/^\d{2}:\d{2}$/.test(fasciaLabel)) fasciaLabel = 'ore ' + fasciaLabel;
                    else if (fasciaLabel === 'mattina') fasciaLabel = 'Mattina';
                    else if (fasciaLabel === 'pomeriggio') fasciaLabel = 'Pomeriggio';

                    html +=
                        '<div class="pren-card">' +
                            '<div class="pren-card-header">' +
                                '<div>' +
                                    '<strong>' + ENI.UI.escapeHtml(clienteNome) + '</strong>' +
                                    (clienteEmail ? ' <span class="text-xs text-muted">(' + ENI.UI.escapeHtml(clienteEmail) + ')</span>' : '') +
                                '</div>' +
                                '<span class="badge badge-warning">in attesa</span>' +
                            '</div>' +
                            '<div class="pren-card-body">' +
                                '<div class="pren-detail">' +
                                    '<span>\u{1F4C5} ' + ENI.UI.formatData(p.data_richiesta) + '</span>' +
                                    '<span>\u{1F555} ' + fasciaLabel + '</span>' +
                                    '<span>\u{1F697} ' + ENI.UI.escapeHtml(p.tipo_lavaggio) + '</span>' +
                                    (p.prezzo_previsto ? '<span>\u{1F4B0} ' + ENI.UI.formatValuta(p.prezzo_previsto) + '</span>' : '') +
                                '</div>' +
                                (p.veicolo ? '<div class="text-sm" style="margin-top:4px;">\u{1F698} Veicolo: ' + ENI.UI.escapeHtml(p.veicolo) + '</div>' : '') +
                                (p.note ? '<div class="text-sm text-muted" style="margin-top:4px;">\u{1F4DD} ' + ENI.UI.escapeHtml(p.note) + '</div>' : '') +
                            '</div>' +
                            '<div class="pren-card-actions">' +
                                '<button class="btn btn-sm btn-success" data-conferma-pren="' + p.id + '">\u2713 Conferma</button>' +
                                '<button class="btn btn-sm btn-danger" data-rifiuta-pren="' + p.id + '">\u2717 Rifiuta</button>' +
                            '</div>' +
                        '</div>';
                });
            }

            html += '</div></div>';

            // Storico recente (ultime 20 non in_attesa)
            var recenti = altre.slice(0, 20);
            if (recenti.length > 0) {
                html += '<div class="card">' +
                    '<div class="card-header"><h3>\u{1F4CB} Storico richieste online</h3></div>' +
                    '<div class="card-body">' +
                    '<div class="table-wrapper"><table class="table"><thead><tr>' +
                        '<th>Data</th><th>Orario</th><th>Cliente</th><th>Tipo</th><th>Stato</th>' +
                    '</tr></thead><tbody>';

                recenti.forEach(function(p) {
                    var clienteNome = (p.clienti_portale && p.clienti_portale.nome_display) || '-';
                    var fasciaLabel = p.fascia_oraria || '';
                    if (/^\d{2}:\d{2}$/.test(fasciaLabel)) fasciaLabel = 'ore ' + fasciaLabel;
                    else if (fasciaLabel === 'mattina') fasciaLabel = 'Mattina';
                    else if (fasciaLabel === 'pomeriggio') fasciaLabel = 'Pomeriggio';

                    var statoCls = '';
                    switch(p.stato) {
                        case 'confermata': statoCls = 'badge-info'; break;
                        case 'completata': statoCls = 'badge-success'; break;
                        case 'rifiutata': statoCls = 'badge-danger'; break;
                        case 'annullata': statoCls = 'badge-gray'; break;
                    }

                    html += '<tr>' +
                        '<td>' + ENI.UI.formatData(p.data_richiesta) + '</td>' +
                        '<td>' + fasciaLabel + '</td>' +
                        '<td>' + ENI.UI.escapeHtml(clienteNome) + '</td>' +
                        '<td>' + ENI.UI.escapeHtml(p.tipo_lavaggio) + '</td>' +
                        '<td><span class="badge ' + statoCls + '">' + (p.stato || '').replace('_', ' ') + '</span></td>' +
                    '</tr>';
                });

                html += '</tbody></table></div></div></div>';
            }

            contentEl.innerHTML = html;

            // Event handlers per conferma/rifiuta
            ENI.UI.delegate(contentEl, 'click', '[data-conferma-pren]', function(e, el) {
                _confermaPrenotazione(el.dataset.confermaPren);
            });

            ENI.UI.delegate(contentEl, 'click', '[data-rifiuta-pren]', function(e, el) {
                _rifiutaPrenotazione(el.dataset.rifiutaPren);
            });

        } catch(e) {
            contentEl.innerHTML = '<p class="text-danger" style="padding: var(--space-4);">Errore: ' + ENI.UI.escapeHtml(e.message) + '</p>';
        }
    }

    async function _confermaPrenotazione(id) {
        var ok = await ENI.UI.confirm('Confermare questa prenotazione?');
        if (!ok) return;
        try {
            await ENI.API.aggiornaPrenotazione(id, { stato: 'confermata' });
            ENI.UI.success('Prenotazione confermata');
            _renderPrenotazioni();
            // Aggiorna badge
            if (ENI.App.updateBadge) ENI.App.updateBadge();
        } catch(e) {
            ENI.UI.error('Errore: ' + e.message);
        }
    }

    async function _rifiutaPrenotazione(id) {
        var ok = await ENI.UI.confirm('Rifiutare questa prenotazione? Il cliente vedr\u00E0 lo stato aggiornato.');
        if (!ok) return;
        try {
            await ENI.API.aggiornaPrenotazione(id, { stato: 'rifiutata' });
            ENI.UI.success('Prenotazione rifiutata');
            _renderPrenotazioni();
            if (ENI.App.updateBadge) ENI.App.updateBadge();
        } catch(e) {
            ENI.UI.error('Errore: ' + e.message);
        }
    }

    // ============================================================
    // REPORT LAVAGGI (periodo, KPI, grafico per tipo, export)
    // ============================================================

    function _lavKpi(val, label, cls) {
        return '<div class="lav-kpi ' + (cls || '') + '"><div class="lav-kpi-val">' + val + '</div><div class="lav-kpi-lbl">' + label + '</div></div>';
    }

    function _addGiorni(iso, n) {
        var p = iso.split('-');
        var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
        d.setDate(d.getDate() + n);
        var m = String(d.getMonth() + 1).padStart(2, '0');
        var g = String(d.getDate()).padStart(2, '0');
        return d.getFullYear() + '-' + m + '-' + g;
    }

    function _rangeReport(id) {
        var oggi = ENI.UI.oggiISO();
        if (id === 'settimana') return { da: _addGiorni(oggi, -6), a: oggi, label: 'Settimana' };
        if (id === 'anno') return { da: _addGiorni(oggi, -364), a: oggi, label: 'Anno' };
        return { da: _addGiorni(oggi, -29), a: oggi, label: 'Mese' };
    }

    async function _renderReport() {
        var contentEl = document.getElementById('lavaggi-content');
        if (!contentEl) return;
        _ensureStyle();
        var r = _rangeReport(_reportPeriodo);

        var chips = [['settimana', 'Settimana'], ['mese', 'Mese'], ['anno', 'Anno']].map(function(d) {
            return '<button class="chip' + (_reportPeriodo === d[0] ? ' active' : '') + '" data-report-periodo="' + d[0] + '">' + d[1] + '</button>';
        }).join('');

        contentEl.innerHTML =
            '<div class="filter-chips" id="lav-report-periodo" style="margin-bottom:var(--space-3);">' + chips + '</div>' +
            '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.75rem;margin-bottom:var(--space-3);">' +
                '<div class="text-sm text-muted">Report lavaggi · ' + r.label + '</div>' +
                '<div><button class="btn btn-outline btn-sm" id="btn-lav-xlsx">\u{1F4CA} Excel</button> ' +
                    '<button class="btn btn-outline btn-sm" id="btn-lav-pdf">\u{1F4C4} PDF</button></div>' +
            '</div>' +
            '<div id="lav-report-kpi" class="lav-summary"></div>' +
            '<div style="background:var(--bg-card);border:1px solid var(--color-gray-200);border-radius:var(--radius-md);padding:var(--space-3);margin:var(--space-3) 0;">' +
                '<div style="font-weight:600;margin-bottom:0.5rem;font-size:0.9rem;">\u{1F4CA} Incasso per tipo di lavaggio</div>' +
                '<div style="position:relative;height:260px;"><canvas id="lav-report-chart"></canvas></div>' +
            '</div>' +
            '<div id="lav-report-lista"></div>';

        contentEl.querySelector('#lav-report-periodo').addEventListener('click', function(e) {
            var b = e.target.closest('[data-report-periodo]');
            if (!b) return;
            _reportPeriodo = b.getAttribute('data-report-periodo');
            _renderReport();
        });
        contentEl.querySelector('#btn-lav-xlsx').addEventListener('click', function() { _esportaReportExcel(r); });
        contentEl.querySelector('#btn-lav-pdf').addEventListener('click', function() { _esportaReportPdf(r); });

        try { _reportData = await ENI.API.getLavaggiReport(r.da, r.a); } catch(e) { _reportData = []; }
        _renderReportDati();
    }

    function _aggregaReport() {
        var completati = 0, annullati = 0, prenotati = 0, incasso = 0, perTipo = {};
        _reportData.forEach(function(l) {
            if (l.stato === 'Completato') {
                completati++;
                incasso += Number(l.prezzo || 0);
                var k = l.tipo_lavaggio || 'Altro';
                if (!perTipo[k]) perTipo[k] = { n: 0, tot: 0 };
                perTipo[k].n++;
                perTipo[k].tot += Number(l.prezzo || 0);
            } else if (l.stato === 'Annullato') { annullati++; }
            else if (l.stato === 'Prenotato') { prenotati++; }
        });
        var voci = Object.keys(perTipo).map(function(k) { return { tipo: k, n: perTipo[k].n, tot: perTipo[k].tot }; })
            .sort(function(a, b) { return b.tot - a.tot; });
        return { completati: completati, annullati: annullati, prenotati: prenotati, incasso: incasso, voci: voci };
    }

    function _renderReportDati() {
        var a = _aggregaReport();
        var media = a.completati > 0 ? a.incasso / a.completati : 0;

        var kpiEl = document.getElementById('lav-report-kpi');
        if (kpiEl) {
            kpiEl.innerHTML =
                _lavKpi(a.completati, 'Completati', 'k-done') +
                _lavKpi(ENI.UI.formatValuta(a.incasso), 'Incasso') +
                _lavKpi(ENI.UI.formatValuta(media), 'Media/lav.') +
                _lavKpi(a.prenotati, 'Da completare', 'k-dafare') +
                _lavKpi(a.annullati, 'Annullati');
        }

        _drawReportChart(a.voci);

        var listaEl = document.getElementById('lav-report-lista');
        if (!listaEl) return;
        if (!a.voci.length) {
            listaEl.innerHTML = '<div class="empty-state"><div class="empty-state-icon">\u{1F697}</div><p class="empty-state-text">Nessun lavaggio completato nel periodo</p></div>';
            return;
        }
        var html = '<div class="table-wrapper"><table class="table"><thead><tr>' +
            '<th>Tipo lavaggio</th><th>N.</th><th>Incasso</th><th>%</th></tr></thead><tbody>';
        a.voci.forEach(function(v) {
            var perc = a.incasso > 0 ? Math.round(v.tot / a.incasso * 100) : 0;
            html += '<tr>' +
                '<td><strong>' + ENI.UI.escapeHtml(v.tipo) + '</strong></td>' +
                '<td class="text-sm">' + v.n + '</td>' +
                '<td><strong>' + ENI.UI.formatValuta(v.tot) + '</strong></td>' +
                '<td class="text-sm text-muted">' + perc + '%</td>' +
            '</tr>';
        });
        html += '</tbody><tfoot><tr><td><strong>TOTALE</strong></td><td class="text-sm">' + a.completati + '</td>' +
            '<td><strong>' + ENI.UI.formatValuta(a.incasso) + '</strong></td><td></td></tr></tfoot></table></div>';
        listaEl.innerHTML = html;
    }

    function _drawReportChart(voci) {
        var cv = document.getElementById('lav-report-chart');
        if (!cv || typeof Chart === 'undefined') return;
        if (_reportChart) { try { _reportChart.destroy(); } catch(e) {} _reportChart = null; }
        var COLS = ['#2a78d6', '#eb6834', '#1baf7a', '#4a3aa7', '#eda100', '#e87ba4', '#898781'];
        _reportChartConfig = {
            type: 'bar',
            data: {
                labels: voci.map(function(v) { return v.tipo; }),
                datasets: [{ data: voci.map(function(v) { return v.tot; }), backgroundColor: voci.map(function(v, i) { return COLS[i % COLS.length]; }), borderRadius: 4 }]
            },
            options: {
                indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { callbacks: { label: function(ctx) { return ENI.UI.formatValuta(ctx.parsed.x); } } } },
                scales: { x: { grid: { color: '#e1e0d9' }, ticks: { color: '#898781' } }, y: { grid: { display: false }, ticks: { color: '#898781' } } }
            }
        };
        _reportChart = new Chart(cv, _reportChartConfig);
    }

    function _immagineGraficoHiRes(config) {
        var canvas = document.createElement('canvas');
        canvas.width = 1000; canvas.height = 420;
        var cfg = JSON.parse(JSON.stringify(config));
        cfg.options = cfg.options || {};
        cfg.options.animation = false;
        cfg.options.responsive = false;
        cfg.options.maintainAspectRatio = false;
        cfg.options.devicePixelRatio = 2;
        if (cfg.options.scales) {
            ['x', 'y'].forEach(function(ax) {
                if (cfg.options.scales[ax]) { cfg.options.scales[ax].ticks = cfg.options.scales[ax].ticks || {}; cfg.options.scales[ax].ticks.font = { size: 16 }; cfg.options.scales[ax].ticks.color = '#333333'; }
            });
        }
        var ch = new Chart(canvas, cfg);
        var img = ch.toBase64Image('image/png', 1);
        ch.destroy();
        return img;
    }

    function _esportaReportExcel(r) {
        if (!_reportData.length) { ENI.UI.warning('Nessun lavaggio da esportare'); return; }
        var righe = _reportData.map(function(l) {
            return { 'Data': l.data || '', 'Tipo': l.tipo_lavaggio || '', 'Stato': l.stato || '', 'Cliente': l.nome_cliente || '', 'Veicolo': l.veicolo || '', 'Prezzo': (l.prezzo != null ? l.prezzo : '') };
        });
        try {
            var ws = XLSX.utils.json_to_sheet(righe);
            var wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Lavaggi');
            XLSX.writeFile(wb, 'report_lavaggi_' + r.label.toLowerCase() + '_' + ENI.UI.oggiISO() + '.xlsx');
            ENI.UI.success(righe.length + ' lavaggi esportati');
        } catch(e) { console.error(e); ENI.UI.error('Errore export'); }
    }

    function _esportaReportPdf(r) {
        var lib = window.jspdf || (typeof jspdf !== 'undefined' ? jspdf : null);
        if (!lib || !lib.jsPDF) { ENI.UI.error('Libreria PDF non disponibile'); return; }
        if (!_reportData.length) { ENI.UI.warning('Nessun lavaggio da esportare'); return; }
        try {
            var a = _aggregaReport();
            var media = a.completati > 0 ? a.incasso / a.completati : 0;
            var doc = new lib.jsPDF({ unit: 'mm', format: 'a4' });
            var W = doc.internal.pageSize.getWidth();
            var y = 16;
            doc.setFontSize(16); doc.text('Titanwash – Report lavaggi', 14, y); y += 7;
            doc.setFontSize(10); doc.setTextColor(110);
            doc.text('Periodo: ' + r.label + ' (' + r.da + ' → ' + r.a + ')   ·   Generato: ' + new Date().toLocaleString('it-IT'), 14, y); y += 8;
            doc.setTextColor(0);
            doc.setFontSize(12);
            doc.text('Completati: ' + a.completati + '   ·   Incasso: ' + ENI.UI.formatValuta(a.incasso) + '   ·   Media: ' + ENI.UI.formatValuta(media), 14, y); y += 6;
            doc.text('Da completare: ' + a.prenotati + '   ·   Annullati: ' + a.annullati, 14, y); y += 9;

            doc.setFontSize(11); doc.setTextColor(90);
            doc.text('Tipo lavaggio', 14, y); doc.text('N.', 120, y); doc.text('Incasso', 140, y); doc.text('%', 175, y);
            doc.setTextColor(0); y += 2; doc.line(14, y, W - 14, y); y += 5;
            a.voci.forEach(function(v) {
                if (y > 270) { doc.addPage(); y = 16; }
                var perc = a.incasso > 0 ? Math.round(v.tot / a.incasso * 100) : 0;
                doc.text(String(v.tipo), 14, y); doc.text(String(v.n), 120, y);
                doc.text(ENI.UI.formatValuta(v.tot), 140, y); doc.text(perc + '%', 175, y);
                y += 6.5;
            });
            y += 4;
            if (_reportChartConfig) {
                try {
                    var img = _immagineGraficoHiRes(_reportChartConfig);
                    if (y + 80 > 290) { doc.addPage(); y = 16; }
                    doc.setFontSize(11); doc.text('Incasso per tipo di lavaggio', 14, y); y += 4;
                    doc.addImage(img, 'PNG', 14, y, W - 28, 76);
                } catch(e) {}
            }
            doc.save('report_lavaggi_' + r.label.toLowerCase() + '_' + ENI.UI.oggiISO() + '.pdf');
        } catch(e) {
            console.error('PDF lavaggi:', e);
            ENI.UI.error('Errore nella generazione del PDF');
        }
    }

    return { render: render };
})();
