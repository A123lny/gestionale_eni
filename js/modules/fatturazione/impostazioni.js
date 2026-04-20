// ============================================================
// FATTURAZIONE - Impostazioni emittente (dati Cervellini Andrea)
// Upload immagini in base64 (pattern da marginalita-carburante)
// ============================================================

var ENI = ENI || {};
ENI.Fatturazione = ENI.Fatturazione || {};

ENI.Fatturazione.Impostazioni = (function() {
    'use strict';

    var _data = null;

    async function render(container) {
        container.innerHTML = '<div class="flex justify-center" style="padding:2rem;"><div class="spinner"></div></div>';
        try { _data = await ENI.API.getImpostazioniFatturazione(); }
        catch(e) { container.innerHTML = '<p class="text-danger">Errore: ' + ENI.UI.escapeHtml(e.message) + '</p>'; return; }

        var d = _data || {};
        container.innerHTML =
            '<div class="card"><div class="card-body">' +
            '<h3 class="mb-3">Dati emittente fattura</h3>' +
            '<form id="form-imp-fatt">' +
                _input('Ragione sociale *', 'ragione_sociale_emittente', d.ragione_sociale_emittente, true) +
                _input('Indirizzo', 'indirizzo', d.indirizzo) +
                '<div class="form-row">' +
                    _input('CAP', 'cap', d.cap) +
                    _input('Comune', 'comune', d.comune) +
                    _input('Prov.', 'provincia', d.provincia) +
                    _input('Nazione', 'nazione', d.nazione || 'SM') +
                '</div>' +
                _input('COE (SM) / P.IVA (IT)', 'coe_piva', d.coe_piva) +
                _input('IBAN di default', 'iban_default', d.iban_default) +
                '<div class="form-row">' +
                    _input('Scadenza default (giorni)', 'scadenza_default_giorni', d.scadenza_default_giorni || 30) +
                '</div>' +
                '<div class="form-group"><label class="form-label">Note pie\' di pagina fattura</label>' +
                    '<textarea class="form-input" name="note_piede_pagina" rows="3">' + _esc(d.note_piede_pagina || '') + '</textarea></div>' +
                '<hr style="margin:1.5rem 0;">' +
                '<h4 class="mb-2">Immagini (opzionali)</h4>' +
                _imageUpload('Logo', 'logo', d.logo_base64) +
                _imageUpload('Timbro', 'timbro', d.timbro_base64) +
                _imageUpload('Firma', 'firma', d.firma_base64) +
                '<div class="mt-3"><button type="submit" class="btn btn-primary">Salva impostazioni</button></div>' +
            '</form></div></div>';

        _attachSubmit();
        _attachImageUploads();
    }

    // --- Generatori HTML ---
    function _input(label, name, val, required) {
        return '<div class="form-group"><label class="form-label">' + label + '</label>' +
            '<input type="text" class="form-input" name="' + name + '" value="' + _esc(val != null ? val : '') + '"' +
            (required ? ' required' : '') + '></div>';
    }

    function _imageUpload(label, key, base64) {
        var hasImage = base64 && base64.length > 20;
        return '<div class="form-group" style="margin-bottom:1rem;">' +
            '<label class="form-label">' + label + '</label>' +
            '<div style="display:flex;gap:0.5rem;align-items:center;">' +
                '<input type="file" class="form-input" id="imp-file-' + key + '" accept="image/*" style="flex:1;">' +
                '<button type="button" class="btn btn-outline btn-sm" id="imp-rimuovi-' + key + '">Rimuovi</button>' +
            '</div>' +
            '<div id="imp-preview-' + key + '" style="margin-top:8px;' + (hasImage ? '' : 'display:none;') + '">' +
                '<img id="imp-img-' + key + '" style="max-width:250px;max-height:120px;background:#fff;padding:4px;border:1px solid var(--border);border-radius:var(--radius-sm);"' +
                (hasImage ? ' src="' + base64 + '"' : '') + '>' +
            '</div>' +
        '</div>';
    }

    // --- Upload immagini con resize e base64 ---
    function _attachImageUploads() {
        ['logo', 'timbro', 'firma'].forEach(function(key) {
            var fileInput = document.getElementById('imp-file-' + key);
            var rimuovi = document.getElementById('imp-rimuovi-' + key);

            if (fileInput) {
                fileInput.addEventListener('change', function(e) {
                    var file = e.target.files && e.target.files[0];
                    if (!file) return;
                    var reader = new FileReader();
                    reader.onload = function(ev) {
                        var img = new Image();
                        img.onload = function() {
                            var canvas = document.createElement('canvas');
                            var maxW = 400, maxH = 200;
                            var w = img.width, h = img.height;
                            if (w > maxW) { h = h * maxW / w; w = maxW; }
                            if (h > maxH) { w = w * maxH / h; h = maxH; }
                            canvas.width = w;
                            canvas.height = h;
                            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                            var base64 = canvas.toDataURL('image/png');
                            if (!_data) _data = {};
                            _data[key + '_base64'] = base64;
                            var preview = document.getElementById('imp-preview-' + key);
                            var imgEl = document.getElementById('imp-img-' + key);
                            if (preview && imgEl) { imgEl.src = base64; preview.style.display = 'block'; }
                            ENI.UI.toast(label(key) + ' caricato', 'success');
                        };
                        img.src = ev.target.result;
                    };
                    reader.readAsDataURL(file);
                });
            }

            if (rimuovi) {
                rimuovi.addEventListener('click', function() {
                    if (!_data) _data = {};
                    _data[key + '_base64'] = '';
                    var preview = document.getElementById('imp-preview-' + key);
                    if (preview) preview.style.display = 'none';
                    var fi = document.getElementById('imp-file-' + key);
                    if (fi) fi.value = '';
                    ENI.UI.toast(label(key) + ' rimosso', 'info');
                });
            }
        });
    }

    function label(key) {
        return key === 'logo' ? 'Logo' : key === 'timbro' ? 'Timbro' : 'Firma';
    }

    // --- Salvataggio ---
    function _attachSubmit() {
        document.getElementById('form-imp-fatt').addEventListener('submit', async function(e) {
            e.preventDefault();
            var fd = new FormData(e.target);
            var payload = {};
            fd.forEach(function(v, k) { payload[k] = v || null; });
            if (payload.scadenza_default_giorni) payload.scadenza_default_giorni = parseInt(payload.scadenza_default_giorni, 10);
            // Includi immagini base64 dallo state
            if (_data) {
                ['logo_base64', 'timbro_base64', 'firma_base64'].forEach(function(k) {
                    if (_data[k] !== undefined) payload[k] = _data[k] || null;
                });
            }
            try {
                _data = await ENI.API.salvaImpostazioniFatturazione(payload);
                ENI.UI.toast('Impostazioni salvate', 'success');
            } catch(err) {
                ENI.UI.toast('Errore: ' + err.message, 'danger');
            }
        });
    }

    function _esc(s) { return ENI.UI.escapeHtml(s); }

    return { render: render };
})();
