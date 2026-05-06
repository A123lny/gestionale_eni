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
        }
        // Router sempre attivo (gestisce area-cliente anche senza login staff)
        ENI.Router.init();
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
        _startBadgeCheck();
    }

    // --- Get Nav Items for Role ---

    function _getNavItemsForRole(ruolo) {
        var config = ENI.Config.RUOLI[ruolo];
        if (!config) return [];

        return ENI.Config.NAV_ITEMS.filter(function(item) {
            return config.moduli.indexOf(item.id) !== -1;
        });
    }

    // --- Get Section Items for Role ---

    function _getSectionItemsForRole(ruolo) {
        var config = ENI.Config.RUOLI[ruolo];
        if (!config) return [];

        return (ENI.Config.NAV_SECTION_ITEMS || []).filter(function(item) {
            return config.moduli.indexOf(item.id) !== -1;
        });
    }

    // --- Render Sidebar Navigation ---

    function _renderSidebarNav(items) {
        var sectionItems = _getSectionItemsForRole(ENI.State.getUser() ? ENI.State.getUser().ruolo : '');
        var sectionItemMap = {};
        sectionItems.forEach(function(item) { sectionItemMap[item.id] = item; });

        var sections = ENI.Config.NAV_SECTIONS || [];

        var html = '<div class="sidebar-brand">' +
                       '<img src="assets/logo_ritagliato.png" alt="Titanwash" class="sidebar-brand-img">' +
                   '</div>' +
                   '<div class="nav-divider"></div>';

        items.forEach(function(item, i) {
            // Divider prima di personale
            if (item.id === 'personale' && i > 0) {
                // Prima del divider di personale, renderizza le sezioni collassabili
                sections.forEach(function(section) {
                    html += _renderNavSection(section, sectionItemMap);
                });
                html += '<div class="nav-divider"></div>';
            }

            html +=
                '<a class="nav-item" data-route="' + item.id + '" href="' + item.route + '">' +
                    '<span class="nav-item-icon" style="position:relative;">' + item.icon +
                        (item.id === 'lavaggi' ? '<span class="nav-badge-dot" id="sidebar-badge-lavaggi" style="display:none;"></span>' : '') +
                    '</span>' +
                    '<span>' + item.label + '</span>' +
                '</a>';
        });

        // Se non c'è personale (ruolo senza accesso), renderizza sezioni alla fine
        var hasPersonale = items.some(function(item) { return item.id === 'personale'; });
        if (!hasPersonale && sections.length > 0) {
            html += '<div class="nav-divider"></div>';
            sections.forEach(function(section) {
                html += _renderNavSection(section, sectionItemMap);
            });
        }

        return html;
    }

    // --- Render Nav Section (collapsible) ---

    function _renderNavSection(section, sectionItemMap) {
        var visibleChildren = section.children.filter(function(id) { return sectionItemMap[id]; });
        if (visibleChildren.length === 0) return '';

        var savedState = localStorage.getItem('nav-section-' + section.id);
        var isOpen = savedState === 'open';

        var html = '';
        if (section.dividerBefore) {
            html += '<div class="nav-divider"></div>';
        }

        html +=
            '<div class="nav-section" data-section="' + section.id + '">' +
                '<button class="nav-section-toggle' + (isOpen ? ' open' : '') + '" data-section-toggle="' + section.id + '">' +
                    '<span class="nav-item-icon">' + section.icon + '</span>' +
                    '<span class="nav-section-label">' + section.label + '</span>' +
                    '<span class="nav-section-chevron"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></span>' +
                '</button>' +
                '<div class="nav-section-children' + (isOpen ? ' open' : '') + '">';

        visibleChildren.forEach(function(childId) {
            var child = sectionItemMap[childId];
            html +=
                '<a class="nav-item nav-item-child" data-route="' + child.id + '" href="' + child.route + '">' +
                    '<span class="nav-item-icon">' + child.icon + '</span>' +
                    '<span>' + child.label + '</span>' +
                '</a>';
        });

        html += '</div></div>';
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
                    '<span class="bottom-nav-icon" style="position:relative;">' + item.icon +
                        (item.id === 'lavaggi' ? '<span class="nav-badge-dot" id="bottom-badge-lavaggi" style="display:none;"></span>' : '') +
                    '</span>' +
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

        // Sidebar section toggles
        document.querySelectorAll('.nav-section-toggle').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                var sectionId = btn.dataset.sectionToggle;
                var children = btn.parentElement.querySelector('.nav-section-children');
                var isOpen = btn.classList.toggle('open');
                children.classList.toggle('open', isOpen);
                localStorage.setItem('nav-section-' + sectionId, isOpen ? 'open' : 'closed');
            });
        });

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

    // --- Badge Prenotazioni Pendenti ---

    var _badgeTimer = null;

    function _startBadgeCheck() {
        _updateBadge();
        if (_badgeTimer) clearInterval(_badgeTimer);
        _badgeTimer = setInterval(_updateBadge, ENI.Config.DASHBOARD_REFRESH);
    }

    async function _updateBadge() {
        try {
            var pren = await ENI.API.getPrenotazioniLavaggio({ stato: 'in_attesa' });
            var count = pren ? pren.length : 0;
            var badges = document.querySelectorAll('.nav-badge-dot');
            badges.forEach(function(b) {
                if (count > 0) {
                    b.style.display = '';
                    b.textContent = count;
                } else {
                    b.style.display = 'none';
                }
            });
        } catch(e) {
            // Silenzioso
        }

        // Tesoreria: check scadenze per pulse animation
        _updateTesoreriaBadge();
    }

    async function _updateTesoreriaBadge() {
        try {
            if (!ENI.Modules.Tesoreria || !ENI.Modules.Tesoreria.checkScadenze) return;
            var scadenzeCount = await ENI.Modules.Tesoreria.checkScadenze();

            // Toggle classe sul section toggle di amministrazione
            var sectionToggle = document.querySelector('[data-section-toggle="amministrazione"]');
            if (sectionToggle) {
                sectionToggle.classList.toggle('has-scadenze', scadenzeCount > 0);
            }

            // Toggle classe sulla voce Tesoreria
            var tesoreriaItem = document.querySelector('.nav-item[data-route="tesoreria"]');
            if (tesoreriaItem) {
                tesoreriaItem.classList.toggle('has-scadenze', scadenzeCount > 0);
            }
        } catch(e) {
            // Silenzioso
        }
    }

    // API pubblica
    return {
        init: init,
        renderShell: renderShell,
        updateBadge: _updateBadge
    };
})();

// --- Avvia App al DOM Ready ---
document.addEventListener('DOMContentLoaded', function() {
    ENI.App.init();
});
