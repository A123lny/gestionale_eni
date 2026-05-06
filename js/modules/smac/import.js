// ============================================================
// SMAC - Tab Import
// Upload del file CSV SMAC, parsing, preview, conferma upsert
// ============================================================

var ENI = ENI || {};
ENI.Smac = ENI.Smac || {};

ENI.Smac.Import = (function() {
    'use strict';

    var _container = null;
    var _parsed = null;  // dati parsati pronti per il salvataggio

    var MESI = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
                'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];

    function _fmtEuro(n) { return ENI.UI.formatValuta(n); }

    async function render(container) {
        _container = container;
        _parsed = null;
        container.innerHTML =
            '<div class="card"><div class="card-body">' +
                '<h3 style="margin-top:0;">\u{1F4E5} Import file SMAC</h3>' +
                '<p class="text-sm text-muted" style="margin-bottom:var(--space-4);">' +
                    'Carica il file CSV mensile della carta SMAC scaricato dal portale. ' +
                    'Il sistema lo analizza e mostra un\'anteprima prima del salvataggio. ' +
                    'Se per il mese e anno indicati esiste gia\' un riepilogo, viene sovrascritto.' +
                '</p>' +
                '<div class="form-group">' +
                    '<label class="form-label">File SMAC (.csv)</label>' +
                    '<input type="file" id="smac-file" class="form-input" accept=".csv,.txt"/>' +
                '</div>' +
                '<div id="smac-preview"></div>' +
            '</div></div>';

        document.getElementById('smac-file').addEventListener('change', _onFile);
    }

    async function _onFile(ev) {
        var file = ev.target.files && ev.target.files[0];
        if (!file) return;

        var preview = document.getElementById('smac-preview');
        preview.innerHTML = '<div class="flex justify-center" style="padding:1rem;"><div class="spinner"></div></div>';

        try {
            _parsed = await ENI.Smac.Parser.parse(file);
            _renderPreview();
        } catch(e) {
            console.error('SMAC parse error:', e);
            preview.innerHTML = '<div class="empty-state"><p class="text-danger">Errore parsing file: ' +
                ENI.UI.escapeHtml(e.message) + '</p></div>';
            ENI.UI.error('Impossibile leggere il file: ' + e.message);
            _parsed = null;
        }
    }

    function _renderPreview() {
        var d = _parsed;
        var preview = document.getElementById('smac-preview');
        var ricaricaTot = (d.fis_imp_ricarica || 0) + (d.dem_imp_ricarica || 0);

        var html = '<div style="margin-top:var(--space-4);">' +
            '<h4 style="margin-bottom:var(--space-2);">Anteprima dati estratti</h4>' +
            '<div class="card" style="margin-bottom:var(--space-3);"><div class="card-body">' +
                '<div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--space-2);">' +
                    '<div><strong>Periodo:</strong> ' + MESI[d.mese-1] + ' ' + d.anno +
                        ' <span class="text-muted">(' + d.data_inizio + ' &rarr; ' + d.data_fine + ')</span></div>' +
                    '<div><strong>File:</strong> ' + ENI.UI.escapeHtml(d.file_nome) + '</div>' +
                '</div>' +
            '</div></div>' +

            '<div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--space-3); margin-bottom:var(--space-3);">' +
                _renderSezione('Carte fisiche', [
                    ['Ricarica', d.fis_num_ricarica, d.fis_imp_ricarica, true],
                    ['Pagamento', d.fis_num_pagamento, d.fis_imp_pagamento, false],
                    ['Pagamento netto sconto', '', d.fis_imp_pagamento_netto, false],
                    ['Fisco', d.fis_num_fisco, d.fis_imp_fisco, false],
                    ['Totale', d.fis_num_totale, d.fis_imp_totale, false],
                    ['Sconto ricarica', '', d.fis_sconto_ricarica, false],
                    ['Sconto pagamento', '', d.fis_sconto_pagamento, false]
                ]) +
                _renderSezione('Dematerializzate', [
                    ['Ricarica', d.dem_num_ricarica, d.dem_imp_ricarica, true],
                    ['Pagamento', d.dem_num_pagamento, d.dem_imp_pagamento, false],
                    ['Fisco', d.dem_num_fisco, d.dem_imp_fisco, false],
                    ['Totale', d.dem_num_totale, d.dem_imp_totale, false]
                ]) +
            '</div>' +

            '<div class="card" style="margin-bottom:var(--space-3); border-left:4px solid var(--color-primary);"><div class="card-body">' +
                '<div style="display:flex; justify-content:space-between; align-items:center;">' +
                    '<div>' +
                        '<div class="text-sm text-muted">Ricarica totale (fisica + dematerializzata)</div>' +
                        '<div style="font-size:1.6rem; font-weight:700;">' + _fmtEuro(ricaricaTot) + '</div>' +
                        '<div class="text-sm text-muted">questo è il valore che entra nel verdetto contabile</div>' +
                    '</div>' +
                '</div>' +
            '</div></div>' +

            '<div style="display:flex; gap:var(--space-2); justify-content:flex-end;">' +
                '<button class="btn btn-outline" id="smac-cancel">Annulla</button>' +
                '<button class="btn btn-primary" id="smac-save">\u{1F4BE} Salva riepilogo</button>' +
            '</div>' +
        '</div>';

        preview.innerHTML = html;

        document.getElementById('smac-cancel').addEventListener('click', function() {
            _parsed = null;
            document.getElementById('smac-file').value = '';
            preview.innerHTML = '';
        });
        document.getElementById('smac-save').addEventListener('click', _onSave);
    }

    function _renderSezione(titolo, righe) {
        var html = '<div class="card"><div class="card-body">' +
            '<h5 style="margin:0 0 var(--space-2) 0;">' + titolo + '</h5>' +
            '<table class="table" style="margin:0;"><tbody>';
        righe.forEach(function(r) {
            var label = r[0], num = r[1], imp = r[2], bold = r[3];
            html += '<tr' + (bold ? ' style="font-weight:700;"' : '') + '>' +
                '<td>' + label + '</td>' +
                '<td class="text-right" style="font-size:0.85rem; color:var(--text-secondary);">' +
                    (num !== '' && num != null ? num + ' tx' : '') + '</td>' +
                '<td class="text-right">' + _fmtEuro(imp) + '</td>' +
            '</tr>';
        });
        html += '</tbody></table></div></div>';
        return html;
    }

    async function _onSave() {
        if (!_parsed) return;
        var btn = document.getElementById('smac-save');
        if (btn) { btn.disabled = true; btn.textContent = 'Salvataggio...'; }

        try {
            // Verifica se esiste gia' un riepilogo per quel mese
            var esistente = await ENI.API.getRiepilogoSmacByMese(_parsed.mese, _parsed.anno);
            if (esistente) {
                var ok = await ENI.UI.confirm({
                    title: 'Sovrascrivere riepilogo esistente?',
                    message: 'Esiste gia\' un riepilogo SMAC per ' + MESI[_parsed.mese-1] + ' ' + _parsed.anno +
                        '. Procedendo verra\' sovrascritto con i nuovi dati. Continuare?',
                    confirmText: 'Sovrascrivi',
                    cancelText: 'Annulla',
                    danger: true
                });
                if (!ok) {
                    if (btn) { btn.disabled = false; btn.innerHTML = '\u{1F4BE} Salva riepilogo'; }
                    return;
                }
            }

            var res = await ENI.API.salvaRiepilogoSmac(_parsed);
            ENI.UI.success(
                (res.updated ? 'Riepilogo sovrascritto' : 'Riepilogo salvato') +
                ' per ' + MESI[_parsed.mese-1] + ' ' + _parsed.anno
            );

            // Reset form
            _parsed = null;
            document.getElementById('smac-file').value = '';
            document.getElementById('smac-preview').innerHTML =
                '<div class="card" style="margin-top:var(--space-3);"><div class="card-body">' +
                '<p>✅ Salvato. Vai alla tab <strong>Riconciliazione</strong> per vedere il verdetto.</p>' +
                '</div></div>';
        } catch(e) {
            console.error('SMAC save error:', e);
            ENI.UI.error('Errore salvataggio: ' + e.message);
            if (btn) { btn.disabled = false; btn.innerHTML = '\u{1F4BE} Salva riepilogo'; }
        }
    }

    return { render: render };
})();
