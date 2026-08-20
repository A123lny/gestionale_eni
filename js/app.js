// ============================================================
// TITANWASH - Bootstrap Applicazione
// Init Supabase, render shell, avvia router
// ============================================================

var ENI = ENI || {};
ENI.Modules = ENI.Modules || {};

ENI.App = (function() {
    'use strict';

    // --- Init ---

    async function init() {
        // Init Supabase
        ENI.API.init();

        // Ripristina la sessione Auth se presente (es. dopo ricarica pagina)
        if (!ENI.State.isLoggedIn()) {
            try {
                var u = await ENI.API.getUtenteCorrente();
                if (u) {
                    ENI.State.setUser({
                        id: u.id,
                        username: u.username,
                        nome_completo: u.nome_completo,
                        ruolo: u.ruolo,
                        super_admin: u.super_admin
                    });
                }
            } catch (e) { /* nessuna sessione valida */ }
        }

        // Check se gia' loggato
        if (ENI.State.isLoggedIn()) {
            // Carica impostazioni globali (moduli nascosti + soglie) prima di costruire il menu
            try {
                var cfg = await Promise.all([
                    ENI.API.getModuliDisabilitati(),
                    ENI.API.getImpostazioneApp('soglie')
                ]);
                ENI.State.setModuliDisabilitati(cfg[0]);
                _applicaSoglie(cfg[1]);
            } catch (e) { /* in caso di errore usa i default */ }
            renderShell();
        }
        // Router sempre attivo (gestisce area-cliente anche senza login staff)
        ENI.Router.init();
    }

    // Applica le soglie globali (da impostazioni_app) sovrascrivendo i default in ENI.Config
    function _applicaSoglie(s) {
        if (!s || typeof s !== 'object') return;
        var C = ENI.Config.CONSTANTS;
        if (s.orario_apertura != null && !isNaN(s.orario_apertura)) C.ORARIO_APERTURA = Number(s.orario_apertura);
        if (s.orario_chiusura != null && !isNaN(s.orario_chiusura)) C.ORARIO_CHIUSURA = Number(s.orario_chiusura);
        if (s.scorta_minima_default != null && !isNaN(s.scorta_minima_default)) C.SCORTA_MINIMA_DEFAULT = Number(s.scorta_minima_default);
        if (s.scadenze_preavviso_giorni != null && !isNaN(s.scadenze_preavviso_giorni)) C.SCADENZE_PREAVVISO_GIORNI = Number(s.scadenze_preavviso_giorni);
        if (s.fondo_cassa_default != null && !isNaN(s.fondo_cassa_default)) C.FONDO_CASSA_DEFAULT = Number(s.fondo_cassa_default);
    }

    // --- Render App Shell ---

    function renderShell() {
        var app = document.getElementById('app');
        var user = ENI.State.getUser();
        var ruolo = user ? user.ruolo : '';
        var ruoloLabel = (user && user.super_admin) ? 'Super Admin' : ruolo;
        var navItems = _getNavItemsForRole(ruolo);

        app.innerHTML =
            // Header
            '<div class="app">' +
                '<header class="app-header">' +
                    '<div class="app-header-logo">' +
                        '<img src="assets/logo_ritagliato.png" alt="Titanwash" class="header-logo-img">' +
                    '</div>' +
                    '<div class="app-header-user">' +
                        _notifBellHtml() +
                        '<div>' +
                            '<div class="app-header-user-name">' + ENI.UI.escapeHtml(user ? user.nome_completo : '') + '</div>' +
                            '<div class="app-header-user-role">' + ENI.UI.escapeHtml(ruoloLabel) + '</div>' +
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
        _setupNotifiche();
    }

    // --- Get Nav Items for Role ---

    function _getNavItemsForRole(ruolo) {
        var config = ENI.Config.RUOLI[ruolo];
        if (!config) return [];

        var items = ENI.Config.NAV_ITEMS.filter(function(item) {
            return config.moduli.indexOf(item.id) !== -1 && ENI.State.isModuloAttivo(item.id);
        });

        // Dashboard: solo per il Super Admin (in cima al menu)
        if (ENI.State.isSuperAdmin()) {
            var dash = ENI.Config.NAV_ITEMS.filter(function(it) { return it.id === 'dashboard'; });
            items = dash.concat(items);
        }
        return items;
    }

    // --- Get Section Items for Role ---

    function _getSectionItemsForRole(ruolo) {
        var config = ENI.Config.RUOLI[ruolo];
        if (!config) return [];

        return (ENI.Config.NAV_SECTION_ITEMS || []).filter(function(item) {
            return config.moduli.indexOf(item.id) !== -1 && ENI.State.isModuloAttivo(item.id);
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
        // Campanellina notifiche (aggrega i segnali attivi)
        _updateNotifiche();
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

    // --- Campanellina notifiche (aggrega i segnali attivi; sola lettura) ---
    // Stato "letto" salvato per dispositivo in localStorage: nessuna scrittura sul DB.

    var _notifCurrent = [];

    function _notifBellHtml() {
        return '<div class="notif-wrap">' +
                '<button class="notif-bell" id="notif-bell" aria-label="Notifiche" title="Notifiche">' +
                    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>' +
                    '<span class="notif-badge" id="notif-badge" style="display:none;">0</span>' +
                '</button>' +
                '<div class="notif-panel" id="notif-panel" style="display:none;">' +
                    '<div class="notif-panel-header">Notifiche<button class="notif-clear" id="notif-clear" style="display:none;">Cancella tutte</button></div>' +
                    '<div class="notif-list" id="notif-list"><div class="notif-empty">🔕 Nessuna notifica</div></div>' +
                '</div>' +
            '</div>';
    }

    function _notifDays(a, b) { var pa = a.split('-'), pb = b.split('-'); return Math.round((new Date(+pb[0], +pb[1] - 1, +pb[2]) - new Date(+pa[0], +pa[1] - 1, +pa[2])) / 86400000); }
    function _notifNum(n) { return Math.round(Number(n) || 0).toLocaleString('it-IT'); }
    function _notifData(iso) { var p = String(iso).split('-'); return p[2] + '/' + p[1]; }
    function _notifSeenGet() { try { return JSON.parse(localStorage.getItem('eni_notif_seen') || '[]'); } catch (e) { return []; } }
    function _notifSeenSet(keys) { try { localStorage.setItem('eni_notif_seen', JSON.stringify(keys)); } catch (e) {} }
    function _notifDismissedGet() { try { return JSON.parse(localStorage.getItem('eni_notif_dismissed') || '[]'); } catch (e) { return []; } }
    function _notifDismissedSet(keys) { try { localStorage.setItem('eni_notif_dismissed', JSON.stringify(keys)); } catch (e) {} }

    async function _buildNotifiche() {
        var oggi = ENI.UI.oggiISO();
        var can = ENI.State.canAccess;
        var jobs = [];

        // Prenotazioni online in attesa
        jobs.push(can('lavaggi')
            ? ENI.API.getPrenotazioniLavaggio({ stato: 'in_attesa' }).then(function(p) {
                var n = p ? p.length : 0;
                return n ? [{ key: 'pren:' + n, icon: '📅', testo: n === 1 ? '1 prenotazione online in attesa' : n + ' prenotazioni online in attesa', route: 'lavaggi' }] : [];
            }).catch(function() { return []; })
            : Promise.resolve([]));

        // Carburante da ordinare oggi/domani (semaforo giallo/rosso)
        jobs.push((can('ordine-carburante') && ENI.Modules.OrdineCarburante && ENI.Modules.OrdineCarburante.calcolaTutti)
            ? ENI.Modules.OrdineCarburante.calcolaTutti().then(function(lista) {
                var out = [];
                (lista || []).forEach(function(item) {
                    var prop = item.res.proposta;
                    if (!prop.serve) return;
                    var gg = _notifDays(oggi, prop.dataOrdine);
                    if (gg > 2) return; // solo imminenti
                    var urgente = gg <= 0;
                    out.push({
                        key: 'carb:' + item.prod.id + ':' + prop.dataOrdine,
                        icon: '⛽',
                        testo: urgente
                            ? ENI.UI.escapeHtml(item.prod.nome) + ' — ordina SUBITO (' + _notifNum(prop.quantita) + ' L)'
                            : ENI.UI.escapeHtml(item.prod.nome) + ' — ordina entro 8:30 del ' + _notifData(prop.dataOrdine) + ' (' + _notifNum(prop.quantita) + ' L)',
                        route: 'ordine-carburante', urgente: urgente
                    });
                });
                return out;
            }).catch(function() { return []; })
            : Promise.resolve([]));

        // Scorte magazzino sotto minimo
        jobs.push(can('magazzino')
            ? ENI.API.getSottoScorta().then(function(s) {
                var n = s ? s.length : 0;
                return n ? [{ key: 'scorte:' + n, icon: '📦', testo: n === 1 ? '1 prodotto sotto scorta minima' : n + ' prodotti sotto scorta minima', route: 'magazzino' }] : [];
            }).catch(function() { return []; })
            : Promise.resolve([]));

        // Scadenze tesoreria in arrivo
        jobs.push((can('tesoreria') && ENI.Modules.Tesoreria && ENI.Modules.Tesoreria.checkScadenze)
            ? ENI.Modules.Tesoreria.checkScadenze().then(function(n) {
                n = n || 0;
                return n ? [{ key: 'scad:' + n, icon: '💶', testo: n === 1 ? '1 scadenza tesoreria in arrivo' : n + ' scadenze tesoreria in arrivo', route: 'tesoreria' }] : [];
            }).catch(function() { return []; })
            : Promise.resolve([]));

        var res = await Promise.all(jobs);
        var flat = res.reduce(function(a, b) { return a.concat(b); }, []);
        flat.sort(function(a, b) { return (b.urgente ? 1 : 0) - (a.urgente ? 1 : 0); }); // urgenti in cima
        return flat;
    }

    function _renderNotifList(items) {
        var list = document.getElementById('notif-list');
        var clr = document.getElementById('notif-clear');
        if (clr) clr.style.display = items.length ? '' : 'none';
        if (!list) return;
        if (!items.length) { list.innerHTML = '<div class="notif-empty">🔕 Nessuna notifica</div>'; return; }
        list.innerHTML = items.map(function(it) {
            return '<a class="notif-item' + (it.urgente ? ' notif-urgent' : '') + '" data-route="' + it.route + '" href="#">' +
                '<span class="notif-item-icon">' + it.icon + '</span>' +
                '<span class="notif-item-text">' + it.testo + '</span>' +
            '</a>';
        }).join('');
    }

    function _notifMarkSeen() {
        _notifSeenSet(_notifCurrent.map(function(it) { return it.key; }));
        var badge = document.getElementById('notif-badge');
        if (badge) badge.style.display = 'none';
    }

    // Nasconde tutte le notifiche attualmente visibili finché la loro situazione non cambia.
    function _notifCancellaTutte() {
        var dismissed = _notifDismissedGet();
        _notifCurrent.forEach(function(it) { if (dismissed.indexOf(it.key) === -1) dismissed.push(it.key); });
        _notifDismissedSet(dismissed);
        _notifCurrent = [];
        _renderNotifList([]);
        var badge = document.getElementById('notif-badge');
        if (badge) badge.style.display = 'none';
    }

    async function _updateNotifiche() {
        var bell = document.getElementById('notif-bell');
        if (!bell) return;
        var items;
        try { items = await _buildNotifiche(); } catch (e) { return; }
        var allKeys = items.map(function(it) { return it.key; });
        // Prune: tieni tra i "dismissed" solo le notifiche ancora attive (le altre si sono risolte).
        var dismissed = _notifDismissedGet().filter(function(k) { return allKeys.indexOf(k) !== -1; });
        _notifDismissedSet(dismissed);
        // Nascondi quelle cancellate dall'utente
        var visible = items.filter(function(it) { return dismissed.indexOf(it.key) === -1; });
        _notifCurrent = visible;
        _renderNotifList(visible);
        var panel = document.getElementById('notif-panel');
        var aperto = panel && panel.style.display !== 'none';
        if (aperto) { _notifMarkSeen(); return; } // se sto guardando la tendina, tutto è "letto"
        var seen = _notifSeenGet();
        var nuovi = visible.filter(function(it) { return seen.indexOf(it.key) === -1; }).length;
        var badge = document.getElementById('notif-badge');
        if (badge) {
            if (nuovi > 0) { badge.style.display = ''; badge.textContent = nuovi > 9 ? '9+' : String(nuovi); }
            else badge.style.display = 'none';
        }
    }

    function _setupNotifiche() {
        var bell = document.getElementById('notif-bell');
        var panel = document.getElementById('notif-panel');
        var list = document.getElementById('notif-list');
        if (!bell || !panel) return;
        bell.addEventListener('click', function(e) {
            e.stopPropagation();
            if (panel.style.display !== 'none') { panel.style.display = 'none'; return; }
            panel.style.display = '';
            _notifMarkSeen();
        });
        if (list) list.addEventListener('click', function(e) {
            var a = e.target.closest('[data-route]');
            if (!a) return;
            e.preventDefault();
            panel.style.display = 'none';
            ENI.Router.navigate(a.getAttribute('data-route'));
        });
        var clear = document.getElementById('notif-clear');
        if (clear) clear.addEventListener('click', function(e) { e.stopPropagation(); _notifCancellaTutte(); });
        document.addEventListener('click', function(e) {
            if (panel.style.display === 'none') return;
            if (e.target.closest('.notif-wrap')) return;
            panel.style.display = 'none';
        });
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
