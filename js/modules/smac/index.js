// ============================================================
// SMAC - Entry point del modulo (orchestra le viste)
// Registra ENI.Modules.Smac usato dal router.
// ============================================================

var ENI = ENI || {};
ENI.Modules = ENI.Modules || {};
ENI.Smac = ENI.Smac || {};

ENI.Smac.Index = (function() {
    'use strict';

    var _vista = 'riconciliazione';  // riconciliazione | import | storico
    var _container = null;
    var _pendingMese = null;  // (mese, anno) richiesti da altri tab

    async function render(container) {
        _container = container;
        container.innerHTML =
            '<div class="page-header">' +
                '<h1 class="page-title">\u{1F4B3} SMAC</h1>' +
                '<span class="text-sm text-muted">Riconciliazione mensile transato carta SMAC vs venduto e fatture</span>' +
            '</div>' +
            _renderTabs() +
            '<div id="smac-content"></div>';
        _attachTabs();
        await _loadVista();
    }

    function _renderTabs() {
        var tabs = [
            { id: 'riconciliazione', label: 'Riconciliazione', icon: '\u{1F4CA}' },
            { id: 'import', label: 'Import', icon: '\u{1F4E5}' },
            { id: 'storico', label: 'Storico', icon: '\u{1F4DA}' }
        ];
        var html = '<div class="tesoreria-tabs">';
        tabs.forEach(function(t) {
            html += '<button class="tesoreria-tab' + (_vista === t.id ? ' active' : '') +
                '" data-smac-tab="' + t.id + '">' +
                '<span class="tesoreria-tab-icon">' + t.icon + '</span>' +
                '<span class="tesoreria-tab-label">' + t.label + '</span></button>';
        });
        html += '</div>';
        return html;
    }

    function _attachTabs() {
        document.querySelectorAll('[data-smac-tab]').forEach(function(btn) {
            btn.addEventListener('click', function() { vaiA(btn.dataset.smacTab); });
        });
    }

    async function vaiA(vista) {
        _vista = vista;
        document.querySelectorAll('[data-smac-tab]').forEach(function(t) {
            t.classList.toggle('active', t.dataset.smacTab === _vista);
        });
        await _loadVista();
    }

    async function vaiARiconciliazione(mese, anno) {
        _pendingMese = { mese: mese, anno: anno };
        await vaiA('riconciliazione');
    }

    async function _loadVista() {
        var box = document.getElementById('smac-content');
        if (!box) return;
        box.innerHTML = '<div class="flex justify-center" style="padding:2rem;"><div class="spinner"></div></div>';
        try {
            switch (_vista) {
                case 'riconciliazione':
                    await ENI.Smac.Riconciliazione.render(box);
                    if (_pendingMese && ENI.Smac.Riconciliazione.setMeseAnno) {
                        ENI.Smac.Riconciliazione.setMeseAnno(_pendingMese.mese, _pendingMese.anno);
                        _pendingMese = null;
                    }
                    break;
                case 'import':       await ENI.Smac.Import.render(box); break;
                case 'storico':      await ENI.Smac.Storico.render(box); break;
                default:             await ENI.Smac.Riconciliazione.render(box);
            }
        } catch(e) {
            box.innerHTML = '<div class="empty-state"><p class="text-danger">Errore: ' + ENI.UI.escapeHtml(e.message) + '</p></div>';
            console.error('SMAC vista error:', e);
        }
    }

    return { render: render, vaiA: vaiA, vaiARiconciliazione: vaiARiconciliazione };
})();

// Registrazione al router
ENI.Modules.Smac = {
    render: function(container) { return ENI.Smac.Index.render(container); }
};
