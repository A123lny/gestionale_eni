// ============================================================
// FATTURAZIONE - Impostazioni emittente (dati Cervellini Andrea)
// Upload immagini in base64 + IBAN multipli con righe dinamiche
// ============================================================

var ENI = ENI || {};
ENI.Fatturazione = ENI.Fatturazione || {};

ENI.Fatturazione.Impostazioni = (function() {
    'use strict';

    var _data = null;
    var _ibanLista = []; // [{banca, iban}]

    async function render(container) {
        container.innerHTML = '<div class="flex justify-center" style="padding:2rem;"><div class="spinner"></div></div>';
        try { _data = await ENI.API.getImpostazioniFatturazione(); }
        catch(e) { container.innerHTML = '<p class="text-danger">Errore: ' + ENI.UI.escapeHtml(e.message) + '</p>'; return; }

        var d = _data || {};
        _ibanLista = (d.iban_lista && Array.isArray(d.iban_lista)) ? d.iban_lista.slice() : [];

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
                // IBAN multipli
                '<hr style="margin:1rem 0;">' +
                '<h4 class="mb-2">Conti bancari (IBAN)</h4>' +
                '<div id="imp-iban-lista"></div>' +
                '<button type="button" class="btn btn-outline btn-sm mt-2 mb-3" id="imp-iban-aggiungi">+ Aggiungi IBAN</button>' +
                '<hr style="margin:1rem 0;">' +
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

        _renderIbanLista();
        _attachIbanHandlers();
        _attachSubmit();
        _attachImageUploads();
    }

    // --- IBAN dinamici ---
    function _renderIbanLista() {
        var box = document.getElementById('imp-iban-lista');
        if (!box) return;
        if (!_ibanLista.length) {
            box.innerHTML = '<p class="text-muted text-sm">Nessun IBAN inserito</p>';
            return;
        }
        box.innerHTML = _ibanLista.map(function(item, i) {
            return '<div class="form-row imp-iban-row" data-idx="' + i + '" style="align-items:flex-end;gap:0.5rem;margin-bottom:0.5rem;">' +
                '<div class="form-group" style="flex:1;"><label class="form-label">Nome banca</label>' +
                    '<input type="text" class="form-input imp-iban-banca" value="' + _esc(item.banca || '') + '" placeholder="Es: Carisp"></div>' +
                '<div class="form-group" style="flex:2;"><label class="form-label">IBAN</label>' +
                    '<input type="text" class="form-input imp-iban-val" value="' + _esc(item.iban || '') + '" placeholder="SM00 0000 0000 0000 0000 0000 000" maxlength="40"></div>' +
                '<button type="button" class="btn btn-danger btn-sm imp-iban-rimuovi" style="margin-bottom:0.75rem;">&times;</button>' +
            '</div>';
        }).join('');
    }

    function _attachIbanHandlers() {
        document.getElementById('imp-iban-aggiungi').addEventListener('click', function() {
            _ibanLista.push({ banca: '', iban: '' });
            _renderIbanLista();
        });
        document.getElementById('imp-iban-lista').addEventListener('click', function(e) {
            var btn = e.target.closest('.imp-iban-rimuovi');
            if (!btn) return;
            var row = btn.closest('.imp-iban-row');
            var idx = parseInt(row.dataset.idx, 10);
            _ibanLista.splice(idx, 1);
            _renderIbanLista();
        });
    }

    function _raccogliIban() {
        var rows = document.querySelectorAll('.imp-iban-row');
        var lista = [];
        rows.forEach(function(row) {
            var banca = row.querySelector('.imp-iban-banca').value.trim();
            var iban = row.querySelector('.imp-iban-val').value.trim();
            if (iban) lista.push({ banca: banca, iban: iban });
        });
        return lista;
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

    // --- Upload immagini ---
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
                            canvas.width = w; canvas.height = h;
                            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                            var b64 = canvas.toDataURL('image/png');
                            if (!_data) _data = {};
                            _data[key + '_base64'] = b64;
                            var preview = document.getElementById('imp-preview-' + key);
                            var imgEl = document.getElementById('imp-img-' + key);
                            if (preview && imgEl) { imgEl.src = b64; preview.style.display = 'block'; }
                            ENI.UI.toast(_labelImg(key) + ' caricato', 'success');
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
                    ENI.UI.toast(_labelImg(key) + ' rimosso', 'info');
                });
            }
        });
    }

    function _labelImg(key) {
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

            // IBAN lista
            var ibanList = _raccogliIban();
            payload.iban_lista = ibanList;
            payload.iban_default = ibanList.length ? ibanList[0].iban : null;

            // Immagini base64
            if (_data) {
                ['logo_base64', 'timbro_base64', 'firma_base64'].forEach(function(k) {
                    if (_data[k] !== undefined) payload[k] = _data[k] || null;
                });
            }
            try {
                _data = await ENI.API.salvaImpostazioniFatturazione(payload);
                _ibanLista = ibanList;
                ENI.UI.toast('Impostazioni salvate', 'success');
            } catch(err) {
                ENI.UI.toast('Errore: ' + err.message, 'danger');
            }
        });
    }

    function _esc(s) { return ENI.UI.escapeHtml(s); }

    // Esponi getter per iban_lista (usato da manuale.js e import-eni.js)
    function getIbanLista() { return _ibanLista; }

    return { render: render, getIbanLista: getIbanLista };
})();
