// ============================================================
// FATTURAZIONE - Sotto-pagina Impostazioni emittente
// Placeholder Fase 2: form minimale funzionante
// ============================================================

var ENI = ENI || {};
ENI.Fatturazione = ENI.Fatturazione || {};

ENI.Fatturazione.Impostazioni = (function() {
    'use strict';

    async function render(container) {
        container.innerHTML = '<div class="flex justify-center" style="padding:2rem;"><div class="spinner"></div></div>';
        var imp;
        try { imp = await ENI.API.getImpostazioniFatturazione(); }
        catch(e) { container.innerHTML = '<p class="text-danger">Errore: ' + ENI.UI.escapeHtml(e.message) + '</p>'; return; }

        var d = imp || {};
        container.innerHTML =
            '<div class="card"><div class="card-body">' +
            '<h3 class="mb-3">\u{1F3E2} Dati emittente fattura</h3>' +
            '<form id="form-imp-fatt">' +
                _row('Ragione sociale *', 'ragione_sociale_emittente', d.ragione_sociale_emittente, true) +
                _row('Indirizzo', 'indirizzo', d.indirizzo) +
                '<div class="form-row">' +
                    _col('CAP', 'cap', d.cap, 'col-3') +
                    _col('Comune', 'comune', d.comune, 'col-5') +
                    _col('Prov.', 'provincia', d.provincia, 'col-2') +
                    _col('Naz.', 'nazione', d.nazione || 'SM', 'col-2') +
                '</div>' +
                '<div class="form-row">' +
                    _col('Partita IVA', 'partita_iva', d.partita_iva) +
                    _col('Codice Fiscale', 'codice_fiscale', d.codice_fiscale) +
                '</div>' +
                _row('IBAN di default', 'iban_default', d.iban_default) +
                '<div class="form-row">' +
                    _col('Scadenza default (giorni)', 'scadenza_default_giorni', d.scadenza_default_giorni || 30) +
                '</div>' +
                '<div class="form-group"><label class="form-label">Note piè di pagina</label>' +
                    '<textarea class="form-input" name="note_piede_pagina" rows="2">' + ENI.UI.escapeHtml(d.note_piede_pagina || '') + '</textarea></div>' +
                '<div class="form-row">' +
                    _col('Logo (URL)', 'logo_url', d.logo_url) +
                    _col('Timbro (URL)', 'timbro_url', d.timbro_url) +
                    _col('Firma (URL)', 'firma_url', d.firma_url) +
                '</div>' +
                '<div class="mt-3"><button type="submit" class="btn btn-primary">Salva impostazioni</button></div>' +
            '</form></div></div>';

        document.getElementById('form-imp-fatt').addEventListener('submit', async function(e) {
            e.preventDefault();
            var fd = new FormData(e.target);
            var payload = {};
            fd.forEach(function(v, k) { payload[k] = v || null; });
            if (payload.scadenza_default_giorni) payload.scadenza_default_giorni = parseInt(payload.scadenza_default_giorni, 10);
            try {
                await ENI.API.salvaImpostazioniFatturazione(payload);
                ENI.UI.toast('Impostazioni salvate', 'success');
            } catch(err) {
                ENI.UI.toast('Errore: ' + err.message, 'danger');
            }
        });
    }

    function _row(label, name, val, required) {
        return '<div class="form-group"><label class="form-label">' + label + '</label>' +
            '<input type="text" class="form-input" name="' + name + '" value="' + ENI.UI.escapeHtml(val != null ? val : '') + '"' + (required ? ' required' : '') + '></div>';
    }
    function _col(label, name, val, cls) {
        return '<div class="form-group ' + (cls || '') + '"><label class="form-label">' + label + '</label>' +
            '<input type="text" class="form-input" name="' + name + '" value="' + ENI.UI.escapeHtml(val != null ? val : '') + '"></div>';
    }

    return { render: render };
})();
