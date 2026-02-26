// ============================================================
// GESTIONALE ENI - Router SPA
// Hash-based routing con guard permessi e lazy module loading
// ============================================================

var ENI = ENI || {};

ENI.Router = (function() {
    'use strict';

    var _currentRoute = null;
    var _initialized = false;

    // Mappa route -> modulo
    var _routes = {
        'dashboard':    { module: 'Dashboard',    id: 'dashboard' },
        'clienti':      { module: 'Clienti',      id: 'clienti' },
        'cassa':        { module: 'Cassa',        id: 'cassa' },
        'spese':        { module: 'Spese',        id: 'spese' },
        'crediti':      { module: 'Crediti',      id: 'crediti' },
        'lavaggi':      { module: 'Lavaggi',      id: 'lavaggi' },
        'vendita':      { module: 'Vendita',      id: 'vendita' },
        'magazzino':    { module: 'Magazzino',    id: 'magazzino' },
        'buoni':        { module: 'Buoni',        id: 'buoni' },
        'personale':    { module: 'Personale',    id: 'personale' },
        'manutenzioni': { module: 'Manutenzioni', id: 'manutenzioni' },
        'log':          { module: 'Log',          id: 'log' }
    };

    // --- Init ---

    function init() {
        if (!_initialized) {
            window.addEventListener('hashchange', _onHashChange);
            _initialized = true;
        }
        _onHashChange();
    }

    // --- Navigate ---

    function navigate(route) {
        window.location.hash = '#/' + route;
    }

    // --- Hash Change Handler ---

    function _onHashChange() {
        var hash = window.location.hash.replace('#/', '') || 'dashboard';

        // ---- AREA CLIENTE: routing separato ----
        if (hash === 'area-cliente' || hash.indexOf('area-cliente/') === 0) {
            _handleClienteRoute(hash);
            return;
        }

        // Se non loggato come staff -> login
        if (!ENI.State.isLoggedIn()) {
            ENI.Auth.renderLogin();
            return;
        }

        var routeConfig = _routes[hash];

        // Route non trovata -> dashboard
        if (!routeConfig) {
            navigate('dashboard');
            return;
        }

        // Check permessi
        if (!ENI.State.canAccess(routeConfig.id)) {
            ENI.UI.warning('Non hai i permessi per accedere a questa sezione');
            navigate('dashboard');
            return;
        }

        _currentRoute = hash;
        _renderModule(routeConfig);
        _updateNav(routeConfig.id);
    }

    // --- Area Cliente routing ---

    function _handleClienteRoute(hash) {
        var appContainer = document.getElementById('app') || document.body;

        // Se non loggato come cliente -> mostra login
        if (!ENI.State.isClienteLoggedIn()) {
            ENI.Modules.AreaCliente.renderLogin(appContainer);
            return;
        }

        // Render shell se non esiste
        if (!document.querySelector('.cliente-shell')) {
            ENI.Modules.AreaCliente.renderShell(appContainer);
        }

        var content = document.getElementById('cliente-content');
        if (!content) return;

        // Sub-route
        var subRoute = hash.replace('area-cliente/', '').replace('area-cliente', '');

        switch(subRoute) {
            case '':
            case 'dashboard':
                ENI.Modules.AreaCliente.renderDashboard(content);
                break;
            case 'saldo':
                ENI.Modules.AreaCliente.renderSaldo(content);
                break;
            case 'prenota':
                ENI.Modules.AreaCliente.renderPrenota(content);
                break;
            default:
                ENI.Modules.AreaCliente.renderDashboard(content);
        }
    }

    // --- Render Module ---

    function _renderModule(routeConfig) {
        var container = document.getElementById('main-content');
        if (!container) return;

        // Mostra loading
        container.innerHTML = '<div class="flex justify-center items-center" style="padding: 4rem 0;"><div class="spinner"></div></div>';

        // Carica modulo
        var moduleName = routeConfig.module;
        if (ENI.Modules && ENI.Modules[moduleName]) {
            try {
                ENI.Modules[moduleName].render(container);
            } catch(e) {
                container.innerHTML =
                    '<div class="empty-state">' +
                        '<div class="empty-state-icon">\u26A0\uFE0F</div>' +
                        '<p class="empty-state-text">Errore nel caricamento del modulo</p>' +
                        '<p class="text-sm text-muted">' + ENI.UI.escapeHtml(e.message) + '</p>' +
                    '</div>';
                console.error('Module render error:', e);
            }
        } else {
            container.innerHTML =
                '<div class="empty-state">' +
                    '<div class="empty-state-icon">\u{1F6A7}</div>' +
                    '<p class="empty-state-text">Modulo "' + ENI.UI.escapeHtml(moduleName) + '" in sviluppo</p>' +
                '</div>';
        }
    }

    // --- Update Navigation Active State ---

    function _updateNav(activeId) {
        // Sidebar nav items
        document.querySelectorAll('.nav-item').forEach(function(el) {
            el.classList.toggle('active', el.dataset.route === activeId);
        });

        // Bottom nav items
        document.querySelectorAll('.bottom-nav-item').forEach(function(el) {
            el.classList.toggle('active', el.dataset.route === activeId);
        });

        // Chiudi menu "Altro" se aperto
        var moreMenu = document.querySelector('.bottom-nav-more-menu');
        if (moreMenu) moreMenu.classList.remove('active');
    }

    // --- Getters ---

    function getCurrentRoute() {
        return _currentRoute;
    }

    // API pubblica
    return {
        init: init,
        navigate: navigate,
        getCurrentRoute: getCurrentRoute
    };
})();
