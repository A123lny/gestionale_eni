// ============================================================
// TITANWASH - Bootstrap Applicazione
// Init Supabase, render shell, avvia router
// ============================================================

var ENI = ENI || {};
ENI.Modules = ENI.Modules || {};

ENI.App = (function() {
    'use strict';

    // --- Init ---

    function init() {
        // Init Supabase
        ENI.API.init();

        // Check se gia' loggato
        if (ENI.State.isLoggedIn()) {
            renderShell();
            ENI.Router.init();
        } else {
            ENI.Auth.renderLogin();
        }
    }

    // --- Render App Shell ---

    function renderShell() {
        var app = document.getElementById('app');
        var user = ENI.State.getUser();
        var ruolo = user ? user.ruolo : '';
        var navItems = _getNavItemsForRole(ruolo);

        app.innerHTML =
            // Header
            '<div class="app">' +
                '<header class="app-header">' +
                    '<div class="app-header-logo">' +
                        '<img src="assets/logo_ritagliato.png" alt="Titanwash" class="header-logo-img">' +
                    '</div>' +
                    '<div class="app-header-user">' +
                        '<div>' +
                            '<div class="app-header-user-name">' + ENI.UI.escapeHtml(user ? user.nome_completo : '') + '</div>' +
                            '<div class="app-header-user-role">' + ENI.UI.escapeHtml(ruolo) + '</div>' +
                        '</div>' +
                        '<button class="btn-logout" id="btn-logout">Esci</button>' +
                    '</div>' +
                '</header>' +

                '<div class="app-layout">' +
                    // Sidebar (desktop)
                    '<nav class="app-sidebar">' +
                        _renderSidebarNav(navItems) +
                    '</nav>' +

                    // Main Content
                    '<main class="app-main" id="main-content">' +
                        '<div class="flex justify-center items-center" style="padding: 4rem 0;">' +
                            '<div class="spinner"></div>' +
                        '</div>' +
                    '</main>' +
                '</div>' +

                // Bottom Nav (mobile)
                _renderBottomNav(navItems, ruolo) +

                // Menu "Altro" mobile
                _renderMoreMenu(navItems) +
            '</div>';

        _setupEventListeners();
    }

    // --- Get Nav Items for Role ---

    function _getNavItemsForRole(ruolo) {
        var config = ENI.Config.RUOLI[ruolo];
        if (!config) return [];

        return ENI.Config.NAV_ITEMS.filter(function(item) {
            return config.moduli.indexOf(item.id) !== -1;
        });
    }

    // --- Render Sidebar Navigation ---

    function _renderSidebarNav(items) {
        var html = '<div class="sidebar-brand">' +
                       '<img src="assets/logo_ritagliato.png" alt="Titanwash" class="sidebar-brand-img">' +
                   '</div>' +
                   '<div class="nav-divider"></div>';
        items.forEach(function(item, i) {
            // Divider prima di personale/manutenzioni/log
            if (item.id === 'personale' && i > 0) {
                html += '<div class="nav-divider"></div>';
            }

            html +=
                '<a class="nav-item" data-route="' + item.id + '" href="' + item.route + '">' +
                    '<span class="nav-item-icon">' + item.icon + '</span>' +
                    '<span>' + item.label + '</span>' +
                '</a>';
        });
        return html;
    }

    // --- Render Bottom Navigation (Mobile) ---

    function _renderBottomNav(items, ruolo) {
        var bottomIds = ENI.Config.BOTTOM_NAV_ITEMS;
        var bottomItems = items.filter(function(item) {
            return bottomIds.indexOf(item.id) !== -1;
        });

        // Ci sono altri moduli non nel bottom nav?
        var hasMore = items.length > bottomItems.length;

        var html = '<nav class="app-bottom-nav">';

        bottomItems.forEach(function(item) {
            html +=
                '<a class="bottom-nav-item" data-route="' + item.id + '" href="' + item.route + '">' +
                    '<span class="bottom-nav-icon">' + item.icon + '</span>' +
                    '<span class="bottom-nav-label">' + item.label + '</span>' +
                '</a>';
        });

        if (hasMore) {
            html +=
                '<button class="bottom-nav-item" id="btn-more-menu">' +
                    '<span class="bottom-nav-icon">\u2022\u2022\u2022</span>' +
                    '<span class="bottom-nav-label">Altro</span>' +
                '</button>';
        }

        html += '</nav>';
        return html;
    }

    // --- Render More Menu ---

    function _renderMoreMenu(items) {
        var bottomIds = ENI.Config.BOTTOM_NAV_ITEMS;
        var moreItems = items.filter(function(item) {
            return bottomIds.indexOf(item.id) === -1;
        });

        if (moreItems.length === 0) return '';

        var html = '<div class="bottom-nav-more-menu" id="more-menu">';
        moreItems.forEach(function(item) {
            html +=
                '<a class="more-menu-item" data-route="' + item.id + '" href="' + item.route + '">' +
                    '<span>' + item.icon + '</span>' +
                    '<span>' + item.label + '</span>' +
                '</a>';
        });
        html += '</div>';

        return html;
    }

    // --- Setup Event Listeners ---

    function _setupEventListeners() {
        // Logout
        var btnLogout = document.getElementById('btn-logout');
        if (btnLogout) {
            btnLogout.addEventListener('click', function() {
                ENI.Auth.logout();
            });
        }

        // More menu toggle
        var btnMore = document.getElementById('btn-more-menu');
        var moreMenu = document.getElementById('more-menu');

        if (btnMore && moreMenu) {
            btnMore.addEventListener('click', function(e) {
                e.stopPropagation();
                moreMenu.classList.toggle('active');
            });

            // Chiudi cliccando fuori
            document.addEventListener('click', function(e) {
                if (!moreMenu.contains(e.target) && e.target !== btnMore) {
                    moreMenu.classList.remove('active');
                }
            });

            // Chiudi quando clicca un item del more menu
            moreMenu.querySelectorAll('.more-menu-item').forEach(function(item) {
                item.addEventListener('click', function() {
                    moreMenu.classList.remove('active');
                });
            });
        }
    }

    // API pubblica
    return {
        init: init,
        renderShell: renderShell
    };
})();

// --- Avvia App al DOM Ready ---
document.addEventListener('DOMContentLoaded', function() {
    ENI.App.init();
});
