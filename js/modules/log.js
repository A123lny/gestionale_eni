// ============================================================
// GESTIONALE ENI - Modulo Log
// Audit trail completo con filtri
// ============================================================

var ENI = ENI || {};
ENI.Modules = ENI.Modules || {};

ENI.Modules.Log = (function() {
    'use strict';

    var _logs = [];
    var _filtroModulo = 'Tutti';
    var _filtroPeriodo = 'oggi';

    async function render(container) {
        container.innerHTML =
            '<div class="page-header">' +
                '<h1 class="page-title">\u{1F4CB} Log Attivit\u00E0</h1>' +
            '</div>' +

            // Filtri periodo
            '<div class="filter-bar">' +
                '<div class="filter-chips">' +
                    '<button class="chip active" data-periodo="oggi">Oggi</button>' +
                    '<button class="chip" data-periodo="7gg">Ultimi 7gg</button>' +
                    '<button class="chip" data-periodo="30gg">Ultimi 30gg</button>' +
                    '<button class="chip" data-periodo="tutti">Tutti</button>' +
                '</div>' +
                '<select class="form-select" id="log-modulo" style="max-width:180px;">' +
                    '<option value="Tutti">Tutti i moduli</option>' +
                    '<option value="Clienti">Clienti</option>' +
                    '<option value="Cassa">Cassa</option>' +
                    '<option value="Crediti">Crediti</option>' +
                    '<option value="Lavaggi">Lavaggi</option>' +
                    '<option value="Magazzino">Magazzino</option>' +
                    '<option value="Personale">Personale</option>' +
                    '<option value="Manutenzioni">Manutenzioni</option>' +
                '</select>' +
            '</div>' +

            '<div id="log-list"></div>';

        _setupEvents(container);
        await _loadLog();
    }

    function _setupEvents(container) {
        // Periodo
        ENI.UI.delegate(container, 'click', '.chip[data-periodo]', function(e, el) {
            _filtroPeriodo = el.dataset.periodo;
            container.querySelectorAll('.chip[data-periodo]').forEach(function(c) {
                c.classList.toggle('active', c.dataset.periodo === _filtroPeriodo);
            });
            _loadLog();
        });

        // Modulo
        container.querySelector('#log-modulo').addEventListener('change', function(e) {
            _filtroModulo = e.target.value;
            _loadLog();
        });
    }

    async function _loadLog() {
        try {
            var options = {};

            // Periodo
            var oggi = new Date();
            if (_filtroPeriodo === 'oggi') {
                options.da = ENI.UI.oggiISO();
            } else if (_filtroPeriodo === '7gg') {
                var d7 = new Date(oggi);
                d7.setDate(d7.getDate() - 7);
                options.da = d7.toISOString().split('T')[0];
            } else if (_filtroPeriodo === '30gg') {
                var d30 = new Date(oggi);
                d30.setDate(d30.getDate() - 30);
                options.da = d30.toISOString().split('T')[0];
            }

            // Modulo
            if (_filtroModulo !== 'Tutti') {
                options.modulo = _filtroModulo;
            }

            options.limit = 200;

            _logs = await ENI.API.getLog(options);
            _renderList();
        } catch(e) {
            ENI.UI.error('Errore caricamento log');
            console.error(e);
        }
    }

    function _renderList() {
        var listEl = document.getElementById('log-list');
        if (!listEl) return;

        if (_logs.length === 0) {
            listEl.innerHTML =
                '<div class="empty-state">' +
                    '<div class="empty-state-icon">\u{1F4CB}</div>' +
                    '<p class="empty-state-text">Nessuna attivit\u00E0 nel periodo selezionato</p>' +
                '</div>';
            return;
        }

        var html = '<div class="table-wrapper"><table class="table">' +
            '<thead><tr><th>Data/Ora</th><th>Utente</th><th>Azione</th><th>Modulo</th><th>Dettagli</th></tr></thead><tbody>';

        _logs.forEach(function(l) {
            html +=
                '<tr>' +
                    '<td class="text-sm" style="white-space:nowrap;">' + ENI.UI.formatDataOra(l.created_at) + '</td>' +
                    '<td class="text-sm"><strong>' + ENI.UI.escapeHtml(l.nome_utente || '-') + '</strong></td>' +
                    '<td class="text-sm">' + ENI.UI.escapeHtml(l.azione) + '</td>' +
                    '<td class="text-sm">' + ENI.UI.escapeHtml(l.modulo) + '</td>' +
                    '<td class="text-sm text-muted">' + ENI.UI.escapeHtml(l.dettagli || '') + '</td>' +
                '</tr>';
        });

        html += '</tbody></table></div>';
        html += '<p class="text-xs text-muted mt-2">' + _logs.length + ' attivit\u00E0 visualizzate</p>';

        listEl.innerHTML = html;
    }

    return { render: render };
})();
