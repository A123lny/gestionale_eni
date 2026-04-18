// ============================================================
// FATTURAZIONE - Entry point del modulo (orchestra le viste)
// Registra ENI.Modules.Fatturazione usato dal router
// ============================================================

var ENI = ENI || {};
ENI.Modules = ENI.Modules || {};
ENI.Fatturazione = ENI.Fatturazione || {};

ENI.Fatturazione.Index = (function() {
    'use strict';

    var _vista = 'elenco';  // elenco | manuale | import | impostazioni
    var _container = null;

    async function render(container) {
        _container = container;
        container.innerHTML =
            '<div class="page-header">' +
                '<h1 class="page-title">\u{1F9FE} Fatturazione</h1>' +
                '<span class="text-sm text-muted">Emissione fatture manuali e import mensile ENI</span>' +
            '</div>' +
            _renderTabs() +
            '<div id="fatt-content"></div>';
        _attachTabs();
        await _loadVista();
    }

    function _renderTabs() {
        var tabs = [
            { id: 'elenco', label: 'Elenco', icon: '\u{1F4CB}' },
            { id: 'manuale', label: 'Nuova manuale', icon: '\u{2795}' },
            { id: 'import', label: 'Import ENI', icon: '\u{1F4E5}' },
            { id: 'impostazioni', label: 'Impostazioni', icon: '\u{2699}\uFE0F' }
        ];
        var html = '<div class="tesoreria-tabs">';
        tabs.forEach(function(t) {
            html += '<button class="tesoreria-tab' + (_vista === t.id ? ' active' : '') +
                '" data-fatt-tab="' + t.id + '">' +
                '<span class="tesoreria-tab-icon">' + t.icon + '</span>' +
                '<span class="tesoreria-tab-label">' + t.label + '</span></button>';
        });
        html += '</div>';
        return html;
    }

    function _attachTabs() {
        document.querySelectorAll('[data-fatt-tab]').forEach(function(btn) {
            btn.addEventListener('click', function() { vaiA(btn.dataset.fattTab); });
        });
    }

    async function vaiA(vista) {
        _vista = vista;
        document.querySelectorAll('[data-fatt-tab]').forEach(function(t) {
            t.classList.toggle('active', t.dataset.fattTab === _vista);
        });
        await _loadVista();
    }

    async function _loadVista() {
        var box = document.getElementById('fatt-content');
        if (!box) return;
        box.innerHTML = '<div class="flex justify-center" style="padding:2rem;"><div class="spinner"></div></div>';
        try {
            switch (_vista) {
                case 'elenco':       await ENI.Fatturazione.Elenco.render(box); break;
                case 'manuale':      await ENI.Fatturazione.Manuale.render(box); break;
                case 'import':       await ENI.Fatturazione.ImportEni.render(box); break;
                case 'impostazioni': await ENI.Fatturazione.Impostazioni.render(box); break;
                default: await ENI.Fatturazione.Elenco.render(box);
            }
        } catch(e) {
            box.innerHTML = '<div class="empty-state"><p class="text-danger">Errore: ' + ENI.UI.escapeHtml(e.message) + '</p></div>';
            console.error('Fatturazione vista error:', e);
        }
    }

    return { render: render, vaiA: vaiA };
})();

// Registrazione al router
ENI.Modules.Fatturazione = {
    render: function(container) { return ENI.Fatturazione.Index.render(container); }
};
