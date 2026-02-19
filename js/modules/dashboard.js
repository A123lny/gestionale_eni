// ============================================================
// GESTIONALE ENI - Modulo Dashboard
// KPI principali: crediti aperti, lavaggi oggi, clienti attivi
// ============================================================

var ENI = ENI || {};
ENI.Modules = ENI.Modules || {};

ENI.Modules.Dashboard = (function() {
    'use strict';

    var _refreshTimer = null;

    async function render(container) {
        container.innerHTML =
            '<div class="page-header">' +
                '<h1 class="page-title">\u{1F4CA} Dashboard</h1>' +
                '<span class="text-sm text-muted" id="dashboard-time"></span>' +
            '</div>' +
            '<div class="kpi-grid" id="kpi-grid">' +
                _kpiSkeleton() +
            '</div>';

        await _loadData();
        _startAutoRefresh();
    }

    function _kpiSkeleton() {
        return (
            '<div class="kpi-card"><div class="kpi-label">Crediti Aperti</div><div class="kpi-value">---</div></div>' +
            '<div class="kpi-card"><div class="kpi-label">Lavaggi Oggi</div><div class="kpi-value">---</div></div>' +
            '<div class="kpi-card"><div class="kpi-label">Clienti Attivi</div><div class="kpi-value">---</div></div>'
        );
    }

    async function _loadData() {
        try {
            var data = await ENI.API.getDashboardData();
            _renderKPI(data);
            _updateTime();
        } catch(e) {
            ENI.UI.error('Errore caricamento dashboard');
            console.error(e);
        }
    }

    function _renderKPI(data) {
        var grid = document.getElementById('kpi-grid');
        if (!grid) return;

        grid.innerHTML =
            // Crediti Aperti
            '<div class="kpi-card" onclick="ENI.Router.navigate(\'crediti\')">' +
                '<div class="kpi-label">\u{1F4B3} Crediti Aperti</div>' +
                '<div class="kpi-value">' + ENI.UI.formatValuta(data.creditiAperti) + '</div>' +
                '<div class="kpi-detail">' +
                    (data.creditiScadutiCount > 0
                        ? '<span class="text-danger">\u26A0\uFE0F ' + data.creditiScadutiCount + ' scadut' + (data.creditiScadutiCount === 1 ? 'o' : 'i') + '</span>'
                        : '<span class="text-success">\u2705 Nessuno scaduto</span>') +
                '</div>' +
            '</div>' +

            // Lavaggi Oggi
            '<div class="kpi-card" onclick="ENI.Router.navigate(\'lavaggi\')">' +
                '<div class="kpi-label">\u{1F697} Lavaggi Oggi</div>' +
                '<div class="kpi-value">' + data.lavaggiOggi + '</div>' +
                '<div class="kpi-detail">' +
                    '<span class="text-success">\u{1F7E2} ' + data.lavaggiCompletati + ' completati</span>' +
                    ' &nbsp; ' +
                    '<span class="text-warning">\u{1F7E1} ' + data.lavaggiPrenotati + ' prenotati</span>' +
                '</div>' +
            '</div>' +

            // Clienti Attivi
            '<div class="kpi-card" onclick="ENI.Router.navigate(\'clienti\')">' +
                '<div class="kpi-label">\u{1F465} Clienti Attivi</div>' +
                '<div class="kpi-value">' + data.clientiAttivi + '</div>' +
                '<div class="kpi-detail">' +
                    '\u{1F3E2} ' + data.clientiCorporate + ' corporate' +
                    ' &nbsp; ' +
                    '\u{1F464} ' + data.clientiPrivati + ' privati' +
                '</div>' +
            '</div>';
    }

    function _updateTime() {
        var el = document.getElementById('dashboard-time');
        if (el) {
            el.textContent = 'Aggiornato: ' + ENI.UI.oraCorrente();
        }
    }

    function _startAutoRefresh() {
        _stopAutoRefresh();
        _refreshTimer = setInterval(function() {
            if (ENI.Router.getCurrentRoute() === 'dashboard') {
                _loadData();
            } else {
                _stopAutoRefresh();
            }
        }, ENI.Config.DASHBOARD_REFRESH);
    }

    function _stopAutoRefresh() {
        if (_refreshTimer) {
            clearInterval(_refreshTimer);
            _refreshTimer = null;
        }
    }

    return { render: render };
})();
