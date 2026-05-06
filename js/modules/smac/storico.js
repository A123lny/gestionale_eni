// ============================================================
// SMAC - Tab Storico
// Lista di tutti i riepiloghi mensili importati, eliminazione.
// ============================================================

var ENI = ENI || {};
ENI.Smac = ENI.Smac || {};

ENI.Smac.Storico = (function() {
    'use strict';

    var MESI = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
                'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];

    function _fmtEuro(n) { return ENI.UI.formatValuta(n); }

    async function render(container) {
        container.innerHTML = '<div id="smac-storico-content"><div class="flex justify-center" style="padding:2rem;"><div class="spinner"></div></div></div>';
        await _load();
    }

    async function _load() {
        var box = document.getElementById('smac-storico-content');
        if (!box) return;

        try {
            var lista = await ENI.API.getRiepilogoSmac({});
            box.innerHTML = _renderLista(lista);
            _attach();
        } catch(e) {
            console.error('SMAC storico error:', e);
            box.innerHTML = '<div class="empty-state"><p class="text-danger">Errore: ' + ENI.UI.escapeHtml(e.message) + '</p></div>';
        }
    }

    function _renderLista(lista) {
        if (!lista.length) {
            return '<div class="empty-state">' +
                '<div class="empty-state-icon">\u{1F4E5}</div>' +
                '<p class="empty-state-text">Nessun riepilogo SMAC importato</p>' +
                '<p class="text-sm text-muted">Vai alla tab Import per caricare il primo file CSV.</p>' +
            '</div>';
        }

        var html = '<div class="card"><div class="card-body" style="overflow-x:auto;">' +
            '<table class="table"><thead><tr>' +
                '<th>Mese</th>' +
                '<th class="text-right">Ricarica fisica</th>' +
                '<th class="text-right">Ricarica demat.</th>' +
                '<th class="text-right">Tot. ricarica</th>' +
                '<th class="text-right">Fisco fis.</th>' +
                '<th class="text-right">Fisco demat.</th>' +
                '<th class="text-right">Sconti</th>' +
                '<th>Importato</th>' +
                '<th></th>' +
            '</tr></thead><tbody>';

        lista.forEach(function(r) {
            var ricaricaTot = (parseFloat(r.fis_imp_ricarica)||0) + (parseFloat(r.dem_imp_ricarica)||0);
            var dataImport = r.created_at ? new Date(r.created_at).toLocaleDateString('it-IT') : '';
            html += '<tr>' +
                '<td><strong>' + MESI[r.mese-1] + ' ' + r.anno + '</strong></td>' +
                '<td class="text-right">' + _fmtEuro(r.fis_imp_ricarica) + '</td>' +
                '<td class="text-right">' + _fmtEuro(r.dem_imp_ricarica) + '</td>' +
                '<td class="text-right" style="font-weight:700;">' + _fmtEuro(ricaricaTot) + '</td>' +
                '<td class="text-right">' + _fmtEuro(r.fis_imp_fisco) + '</td>' +
                '<td class="text-right">' + _fmtEuro(r.dem_imp_fisco) + '</td>' +
                '<td class="text-right">' + _fmtEuro(r.fis_sconto_ricarica) + '</td>' +
                '<td><span class="text-sm text-muted">' + dataImport + '</span></td>' +
                '<td style="white-space:nowrap;">' +
                    '<button class="btn-icon smac-go" data-mese="' + r.mese + '" data-anno="' + r.anno + '" title="Vai a Riconciliazione">\u{1F50D}</button>' +
                    '<button class="btn-icon smac-del" data-id="' + r.id + '" data-label="' + MESI[r.mese-1] + ' ' + r.anno + '" title="Elimina" style="color:var(--color-danger);">\u{1F5D1}️</button>' +
                '</td>' +
            '</tr>';
        });
        html += '</tbody></table></div></div>';
        return html;
    }

    function _attach() {
        document.querySelectorAll('.smac-go').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var m = parseInt(btn.dataset.mese, 10);
                var a = parseInt(btn.dataset.anno, 10);
                if (ENI.Smac.Index && ENI.Smac.Index.vaiARiconciliazione) {
                    ENI.Smac.Index.vaiARiconciliazione(m, a);
                }
            });
        });
        document.querySelectorAll('.smac-del').forEach(function(btn) {
            btn.addEventListener('click', async function() {
                var id = btn.dataset.id;
                var label = btn.dataset.label;
                var ok = await ENI.UI.confirm({
                    title: 'Eliminare riepilogo?',
                    message: 'Vuoi eliminare il riepilogo SMAC di ' + label + '? L\'operazione non e\' reversibile.',
                    confirmText: 'Elimina',
                    cancelText: 'Annulla',
                    danger: true
                });
                if (!ok) return;
                try {
                    await ENI.API.eliminaRiepilogoSmac(id);
                    ENI.UI.success('Riepilogo eliminato');
                    await _load();
                } catch(e) {
                    ENI.UI.error('Errore eliminazione: ' + e.message);
                }
            });
        });
    }

    return { render: render };
})();
