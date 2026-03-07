// ============================================================
// GESTIONALE ENI - Modulo Impostazioni
// Configurazione stampante termica e layout scontrino
// ============================================================

var ENI = ENI || {};
ENI.Modules = ENI.Modules || {};

ENI.Modules.Impostazioni = (function() {
    'use strict';

    var _serverUrl = '';
    var _layout = {};
    var STORAGE_KEY = 'titanwash_print_layout';

    // Caratteri speciali disponibili per lo scontrino
    var SPECIAL_CHARS = [
        { group: 'Decorativi', chars: '\u2605 \u2606 \u2665 \u2666 \u2663 \u2660 \u25CF \u25CB \u25A0 \u25A1 \u25B2 \u25BC \u25C6 \u25C7 \u2756 \u2055' },
        { group: 'Linee', chars: '\u2500 \u2501 \u2550 \u2502 \u2503 \u2551 \u253C \u256C \u2510 \u250C \u2514 \u2518 \u2554 \u2557 \u255A \u255D' },
        { group: 'Frecce', chars: '\u2190 \u2191 \u2192 \u2193 \u2194 \u2195 \u25B6 \u25C0 \u25B7 \u25C1 \u27A4 \u279C' },
        { group: 'Simboli', chars: '\u00A9 \u00AE \u2122 \u20AC \u00A3 \u00A5 \u2030 \u00B0 \u221E \u2713 \u2717 \u260E \u2709 \u2302' },
        { group: 'Ornamenti', chars: '\u2702 \u2708 \u270E \u2764 \u266A \u266B \u263A \u2639 \u2620 \u269B \u2618 \u2740 \u273F \u2741 \u2742 \u2743' }
    ];

    var DEFAULT_LAYOUT = {
        nome_negozio: 'TITANWASH',
        sottotitolo: 'Autolavaggio & Stazione di Servizio',
        indirizzo: 'Borgo Maggiore - San Marino',
        telefono: '',
        partita_iva: '',
        email: '',
        sito_web: '',
        separatore_intestazione: '',
        footer_riga1: 'Grazie e arrivederci!',
        footer_riga2: '',
        footer_riga3: '',
        separatore_footer: '',
        mostra_operatore: true,
        mostra_data_ora: true,
        mostra_codice: true,
        mostra_subtotale: true,
        tipo_taglio: 'parziale',
        righe_prima_taglio: 3,
        printer_ip: '192.168.1.130',
        printer_port: 9100,
        logo_base64: ''
    };

    // Timeout fetch sicuro (compatibile con tutti i browser)
    function _fetchWithTimeout(url, options, ms) {
        ms = ms || 3000;
        options = options || {};
        return new Promise(function(resolve, reject) {
            var timer = setTimeout(function() {
                reject(new Error('Timeout'));
            }, ms);
            fetch(url, options).then(function(res) {
                clearTimeout(timer);
                resolve(res);
            }).catch(function(err) {
                clearTimeout(timer);
                reject(err);
            });
        });
    }

    async function render(container) {
        _serverUrl = ENI.Config.PRINT_SERVER_URL || 'http://localhost:3333';

        // Costruisci la palette caratteri speciali
        var charPaletteHtml =
            '<div id="char-palette" style="display:none; position:fixed; z-index:9999; background:var(--bg-primary); border:1px solid var(--border); border-radius:var(--radius-md); box-shadow:0 8px 32px rgba(0,0,0,0.3); padding:12px; max-width:360px;">' +
                '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">' +
                    '<b style="font-size:13px;">Inserisci Carattere Speciale</b>' +
                    '<button id="btn-close-palette" style="background:none; border:none; cursor:pointer; font-size:18px; color:var(--text-secondary);">\u2715</button>' +
                '</div>';

        for (var g = 0; g < SPECIAL_CHARS.length; g++) {
            var group = SPECIAL_CHARS[g];
            charPaletteHtml += '<div style="margin-bottom:6px;"><span style="font-size:10px; color:var(--text-secondary); text-transform:uppercase;">' + group.group + '</span></div>';
            charPaletteHtml += '<div style="display:flex; flex-wrap:wrap; gap:2px; margin-bottom:8px;">';
            var chars = group.chars.split(' ');
            for (var c = 0; c < chars.length; c++) {
                charPaletteHtml += '<button class="char-btn" data-char="' + chars[c] + '" style="width:30px; height:30px; display:flex; align-items:center; justify-content:center; border:1px solid var(--border); border-radius:4px; background:var(--bg-secondary); cursor:pointer; font-size:16px; transition:all 0.15s;">' + chars[c] + '</button>';
            }
            charPaletteHtml += '</div>';
        }
        charPaletteHtml += '</div>';

        container.innerHTML =
            charPaletteHtml +

            '<div class="page-header">' +
                '<h1 class="page-title">Impostazioni</h1>' +
            '</div>' +

            // Stato server
            '<div class="card mb-4">' +
                '<div class="card-header">' +
                    '<h3 class="card-title">Stampante Termica</h3>' +
                    '<span id="server-status" class="badge" style="margin-left:auto;">Verifica...</span>' +
                '</div>' +
                '<div class="card-body">' +
                    '<div style="display:grid; grid-template-columns:1fr 1fr auto; gap:var(--space-3); align-items:end;">' +
                        '<div class="form-group">' +
                            '<label class="form-label">IP Stampante</label>' +
                            '<input type="text" class="form-input" id="cfg-printer-ip" placeholder="192.168.1.130">' +
                        '</div>' +
                        '<div class="form-group">' +
                            '<label class="form-label">Porta</label>' +
                            '<input type="number" class="form-input" id="cfg-printer-port" placeholder="9100">' +
                        '</div>' +
                        '<button class="btn btn-outline" id="btn-test-stampa">Test Stampa</button>' +
                    '</div>' +
                '</div>' +
            '</div>' +

            // Layout scontrino - 2 colonne
            '<div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--space-4);">' +

                // Colonna sinistra: form
                '<div>' +

                    // Intestazione
                    '<div class="card mb-4">' +
                        '<div class="card-header"><h3 class="card-title">Intestazione Scontrino</h3></div>' +
                        '<div class="card-body">' +
                            '<div class="form-group">' +
                                '<label class="form-label">Logo (bianco e nero, max 300px larghezza)</label>' +
                                '<div style="display:flex; gap:var(--space-2); align-items:center;">' +
                                    '<input type="file" class="form-input" id="cfg-logo-file" accept="image/*" style="flex:1;">' +
                                    '<button class="btn btn-outline btn-sm" id="btn-rimuovi-logo" style="white-space:nowrap;">Rimuovi Logo</button>' +
                                '</div>' +
                                '<div id="logo-preview-container" style="margin-top:8px; display:none;">' +
                                    '<img id="logo-preview-img" style="max-width:200px; max-height:80px; background:#fff; padding:4px; border:1px solid var(--border); border-radius:var(--radius-sm);">' +
                                '</div>' +
                            '</div>' +
                            _fieldWithChars('Nome Negozio', 'cfg-nome-negozio', 'TITANWASH') +
                            _fieldWithChars('Sottotitolo', 'cfg-sottotitolo', 'Autolavaggio & Stazione di Servizio') +
                            _fieldWithChars('Indirizzo', 'cfg-indirizzo', 'Borgo Maggiore - San Marino') +
                            '<div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--space-3);">' +
                                '<div class="form-group">' +
                                    '<label class="form-label">Telefono</label>' +
                                    '<input type="text" class="form-input cfg-input" id="cfg-telefono" placeholder="+39 0549 123456">' +
                                '</div>' +
                                '<div class="form-group">' +
                                    '<label class="form-label">P.IVA / COE</label>' +
                                    '<input type="text" class="form-input cfg-input" id="cfg-partita-iva" placeholder="SM12345">' +
                                '</div>' +
                            '</div>' +
                            '<div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--space-3);">' +
                                '<div class="form-group">' +
                                    '<label class="form-label">Email</label>' +
                                    '<input type="text" class="form-input cfg-input" id="cfg-email" placeholder="info@titanwash.sm">' +
                                '</div>' +
                                '<div class="form-group">' +
                                    '<label class="form-label">Sito Web</label>' +
                                    '<input type="text" class="form-input cfg-input" id="cfg-sito-web" placeholder="www.titanwash.sm">' +
                                '</div>' +
                            '</div>' +
                            _fieldWithChars('Separatore Intestazione (opzionale)', 'cfg-separatore-intestazione', '\u2605 \u2605 \u2605 \u2605 \u2605') +
                        '</div>' +
                    '</div>' +

                    // Footer
                    '<div class="card mb-4">' +
                        '<div class="card-header"><h3 class="card-title">Footer Scontrino</h3></div>' +
                        '<div class="card-body">' +
                            _fieldWithChars('Riga 1', 'cfg-footer-riga1', 'Grazie e arrivederci!') +
                            _fieldWithChars('Riga 2 (opzionale)', 'cfg-footer-riga2', 'Seguici su Instagram @titanwash') +
                            _fieldWithChars('Riga 3 (opzionale)', 'cfg-footer-riga3', '') +
                            _fieldWithChars('Separatore Footer (opzionale)', 'cfg-separatore-footer', '\u2665 \u2665 \u2665') +
                        '</div>' +
                    '</div>' +

                    // Opzioni
                    '<div class="card mb-4">' +
                        '<div class="card-header"><h3 class="card-title">Opzioni Stampa</h3></div>' +
                        '<div class="card-body">' +
                            '<div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--space-3);">' +
                                '<label class="form-label" style="display:flex; align-items:center; gap:8px;">' +
                                    '<input type="checkbox" id="cfg-mostra-operatore" checked> Mostra operatore' +
                                '</label>' +
                                '<label class="form-label" style="display:flex; align-items:center; gap:8px;">' +
                                    '<input type="checkbox" id="cfg-mostra-data" checked> Mostra data/ora' +
                                '</label>' +
                                '<label class="form-label" style="display:flex; align-items:center; gap:8px;">' +
                                    '<input type="checkbox" id="cfg-mostra-codice" checked> Mostra codice vendita' +
                                '</label>' +
                                '<label class="form-label" style="display:flex; align-items:center; gap:8px;">' +
                                    '<input type="checkbox" id="cfg-mostra-subtotale" checked> Mostra subtotale' +
                                '</label>' +
                            '</div>' +
                            '<div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--space-3); margin-top:var(--space-3);">' +
                                '<div class="form-group">' +
                                    '<label class="form-label">Tipo Taglio</label>' +
                                    '<select class="form-input" id="cfg-tipo-taglio">' +
                                        '<option value="parziale">Parziale</option>' +
                                        '<option value="completo">Completo</option>' +
                                    '</select>' +
                                '</div>' +
                                '<div class="form-group">' +
                                    '<label class="form-label">Righe prima del taglio</label>' +
                                    '<select class="form-input" id="cfg-righe-taglio">' +
                                        '<option value="1">1</option>' +
                                        '<option value="2">2</option>' +
                                        '<option value="3" selected>3</option>' +
                                        '<option value="4">4</option>' +
                                        '<option value="5">5</option>' +
                                    '</select>' +
                                '</div>' +
                            '</div>' +
                            '<div style="margin-top:var(--space-4); display:flex; gap:var(--space-2);">' +
                                '<button class="btn btn-primary" id="btn-salva-layout">Salva Configurazione</button>' +
                                '<button class="btn btn-outline" id="btn-reset-layout">Ripristina Default</button>' +
                            '</div>' +
                        '</div>' +
                    '</div>' +

                '</div>' +

                // Colonna destra: anteprima realistica
                '<div>' +
                    '<div class="card" style="position:sticky; top:var(--space-4);">' +
                        '<div class="card-header"><h3 class="card-title">Anteprima Scontrino</h3></div>' +
                        '<div class="card-body" style="display:flex; justify-content:center; padding:var(--space-4); background:var(--bg-secondary);">' +
                            '<div id="receipt-preview-wrapper" style="' +
                                'width:302px; background:#f5f5f0; border-radius:2px;' +
                                'box-shadow: 0 4px 20px rgba(0,0,0,0.2);' +
                                'overflow:hidden;' +
                            '">' +
                                '<div style="height:10px; background:linear-gradient(180deg, #e8e8e0 0%, #f5f5f0 100%);"></div>' +
                                '<div id="receipt-preview" style="' +
                                    'background:#f5f5f0; color:#222; font-family:\'Courier New\',monospace; font-size:11.5px;' +
                                    'line-height:1.5; padding:12px 14px; margin:0;' +
                                    'min-height:300px;' +
                                '"></div>' +
                                '<div style="height:20px; background:linear-gradient(0deg, transparent 0%, transparent 50%, #f5f5f0 50%); background-size:8px 8px; background-position:0 0;"></div>' +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                '</div>' +

            '</div>';

        // Event listeners
        container.querySelector('#btn-test-stampa').addEventListener('click', _testStampa);
        container.querySelector('#btn-salva-layout').addEventListener('click', _salvaLayout);
        container.querySelector('#btn-reset-layout').addEventListener('click', _resetLayout);
        container.querySelector('#cfg-logo-file').addEventListener('change', _onLogoSelected);
        container.querySelector('#btn-rimuovi-logo').addEventListener('click', _rimuoviLogo);
        container.querySelector('#btn-close-palette').addEventListener('click', _closePalette);

        // Pulsanti carattere speciale (apri palette)
        var charBtns = container.querySelectorAll('.btn-open-chars');
        for (var b = 0; b < charBtns.length; b++) {
            charBtns[b].addEventListener('click', _openPalette);
        }

        // Click su carattere nella palette
        var charItems = container.querySelectorAll('.char-btn');
        for (var ci = 0; ci < charItems.length; ci++) {
            charItems[ci].addEventListener('click', _insertChar);
        }

        // Chiudi palette cliccando fuori
        document.addEventListener('click', function(e) {
            var palette = document.getElementById('char-palette');
            if (palette && palette.style.display !== 'none') {
                if (!palette.contains(e.target) && !e.target.classList.contains('btn-open-chars')) {
                    palette.style.display = 'none';
                }
            }
        });

        // Aggiorna anteprima in tempo reale
        var inputs = container.querySelectorAll('.cfg-input');
        for (var i = 0; i < inputs.length; i++) {
            inputs[i].addEventListener('input', _aggiornaAnteprima);
            inputs[i].addEventListener('change', _aggiornaAnteprima);
        }

        // Carica configurazione
        await _caricaConfig();
    }

    // Helper: campo con pulsante caratteri speciali
    function _fieldWithChars(label, id, placeholder) {
        return '<div class="form-group">' +
            '<label class="form-label">' + label + '</label>' +
            '<div style="display:flex; gap:4px;">' +
                '<input type="text" class="form-input cfg-input" id="' + id + '" placeholder="' + (placeholder || '') + '" style="flex:1;">' +
                '<button type="button" class="btn btn-outline btn-sm btn-open-chars" data-target="' + id + '" style="padding:4px 8px; font-size:16px;" title="Inserisci carattere speciale">\u2606</button>' +
            '</div>' +
        '</div>';
    }

    // Palette caratteri speciali
    var _activeCharTarget = null;

    function _openPalette(e) {
        e.stopPropagation();
        var btn = e.currentTarget;
        _activeCharTarget = btn.getAttribute('data-target');
        var palette = document.getElementById('char-palette');
        if (!palette) return;

        // Posiziona vicino al pulsante
        var rect = btn.getBoundingClientRect();
        palette.style.display = 'block';
        palette.style.top = (rect.bottom + 4) + 'px';
        palette.style.left = Math.min(rect.left, window.innerWidth - 380) + 'px';
    }

    function _closePalette() {
        var palette = document.getElementById('char-palette');
        if (palette) palette.style.display = 'none';
        _activeCharTarget = null;
    }

    function _insertChar(e) {
        var ch = e.currentTarget.getAttribute('data-char');
        if (!ch || !_activeCharTarget) return;

        var input = document.getElementById(_activeCharTarget);
        if (!input) return;

        // Inserisci alla posizione del cursore
        var start = input.selectionStart || input.value.length;
        var end = input.selectionEnd || input.value.length;
        input.value = input.value.substring(0, start) + ch + input.value.substring(end);
        input.focus();
        input.setSelectionRange(start + ch.length, start + ch.length);

        _aggiornaAnteprima();
    }

    async function _caricaConfig() {
        // Prima leggi da localStorage (funziona sempre)
        var saved = null;
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            if (raw) saved = JSON.parse(raw);
        } catch (e) {}

        // Se abbiamo dati salvati, usali subito
        if (saved) {
            _layout = Object.assign({}, DEFAULT_LAYOUT, saved);
        } else {
            _layout = Object.assign({}, DEFAULT_LAYOUT);
        }

        // Poi prova il print server in background (non blocca)
        _checkServerStatus();

        _populateForm(_layout);
        _aggiornaAnteprima();
    }

    function _checkServerStatus() {
        _fetchWithTimeout(_serverUrl + '/status', {}, 3000)
            .then(function(res) {
                if (res.ok) {
                    _setServerStatus(true);
                } else {
                    _setServerStatus(false);
                }
            })
            .catch(function() {
                _setServerStatus(false);
            });
    }

    function _setServerStatus(online) {
        var el = document.getElementById('server-status');
        if (!el) return;
        if (online) {
            el.textContent = 'Online';
            el.style.cssText = 'margin-left:auto; background:#22c55e; color:#fff; padding:4px 12px; border-radius:12px; font-size:12px;';
        } else {
            el.textContent = 'Offline';
            el.style.cssText = 'margin-left:auto; background:#ef4444; color:#fff; padding:4px 12px; border-radius:12px; font-size:12px;';
        }
    }

    function _populateForm(layout) {
        _setVal('cfg-printer-ip', layout.printer_ip);
        _setVal('cfg-printer-port', layout.printer_port || 9100);
        _setVal('cfg-nome-negozio', layout.nome_negozio);
        _setVal('cfg-sottotitolo', layout.sottotitolo);
        _setVal('cfg-indirizzo', layout.indirizzo);
        _setVal('cfg-telefono', layout.telefono);
        _setVal('cfg-partita-iva', layout.partita_iva);
        _setVal('cfg-email', layout.email);
        _setVal('cfg-sito-web', layout.sito_web);
        _setVal('cfg-separatore-intestazione', layout.separatore_intestazione);
        _setVal('cfg-footer-riga1', layout.footer_riga1);
        _setVal('cfg-footer-riga2', layout.footer_riga2);
        _setVal('cfg-footer-riga3', layout.footer_riga3);
        _setVal('cfg-separatore-footer', layout.separatore_footer);
        _setChecked('cfg-mostra-operatore', layout.mostra_operatore !== false);
        _setChecked('cfg-mostra-data', layout.mostra_data_ora !== false);
        _setChecked('cfg-mostra-codice', layout.mostra_codice !== false);
        _setChecked('cfg-mostra-subtotale', layout.mostra_subtotale !== false);
        _setVal('cfg-tipo-taglio', layout.tipo_taglio || 'parziale');
        _setVal('cfg-righe-taglio', String(layout.righe_prima_taglio || 3));

        // Logo preview
        if (layout.logo_base64) {
            var cont = document.getElementById('logo-preview-container');
            var img = document.getElementById('logo-preview-img');
            if (cont && img) {
                img.src = layout.logo_base64;
                cont.style.display = 'block';
            }
        }
    }

    function _setVal(id, val) {
        var el = document.getElementById(id);
        if (el) el.value = val || '';
    }

    function _setChecked(id, val) {
        var el = document.getElementById(id);
        if (el) el.checked = val;
    }

    function _readForm() {
        return {
            printer_ip: (document.getElementById('cfg-printer-ip') || {}).value || '192.168.1.130',
            printer_port: parseInt((document.getElementById('cfg-printer-port') || {}).value) || 9100,
            nome_negozio: (document.getElementById('cfg-nome-negozio') || {}).value || 'TITANWASH',
            sottotitolo: (document.getElementById('cfg-sottotitolo') || {}).value || '',
            indirizzo: (document.getElementById('cfg-indirizzo') || {}).value || '',
            telefono: (document.getElementById('cfg-telefono') || {}).value || '',
            partita_iva: (document.getElementById('cfg-partita-iva') || {}).value || '',
            email: (document.getElementById('cfg-email') || {}).value || '',
            sito_web: (document.getElementById('cfg-sito-web') || {}).value || '',
            separatore_intestazione: (document.getElementById('cfg-separatore-intestazione') || {}).value || '',
            footer_riga1: (document.getElementById('cfg-footer-riga1') || {}).value || '',
            footer_riga2: (document.getElementById('cfg-footer-riga2') || {}).value || '',
            footer_riga3: (document.getElementById('cfg-footer-riga3') || {}).value || '',
            separatore_footer: (document.getElementById('cfg-separatore-footer') || {}).value || '',
            mostra_operatore: (document.getElementById('cfg-mostra-operatore') || {}).checked !== false,
            mostra_data_ora: (document.getElementById('cfg-mostra-data') || {}).checked !== false,
            mostra_codice: (document.getElementById('cfg-mostra-codice') || {}).checked !== false,
            mostra_subtotale: (document.getElementById('cfg-mostra-subtotale') || {}).checked !== false,
            tipo_taglio: (document.getElementById('cfg-tipo-taglio') || {}).value || 'parziale',
            righe_prima_taglio: parseInt((document.getElementById('cfg-righe-taglio') || {}).value) || 3,
            logo_base64: _layout.logo_base64 || ''
        };
    }

    // ============================================================
    // LOGO
    // ============================================================

    function _onLogoSelected(e) {
        var file = e.target.files && e.target.files[0];
        if (!file) return;

        var reader = new FileReader();
        reader.onload = function(ev) {
            var img = new Image();
            img.onload = function() {
                var canvas = document.createElement('canvas');
                var maxW = 300;
                var scale = Math.min(1, maxW / img.width);
                canvas.width = Math.round(img.width * scale);
                canvas.height = Math.round(img.height * scale);

                var ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                // Converti a bianco e nero
                var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                var data = imageData.data;
                for (var i = 0; i < data.length; i += 4) {
                    var gray = data[i] * 0.299 + data[i+1] * 0.587 + data[i+2] * 0.114;
                    var bw = gray > 128 ? 255 : 0;
                    data[i] = bw;
                    data[i+1] = bw;
                    data[i+2] = bw;
                }
                ctx.putImageData(imageData, 0, 0);

                var base64 = canvas.toDataURL('image/png');
                _layout.logo_base64 = base64;

                var cont = document.getElementById('logo-preview-container');
                var preview = document.getElementById('logo-preview-img');
                if (cont && preview) {
                    preview.src = base64;
                    cont.style.display = 'block';
                }
                _aggiornaAnteprima();
            };
            img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
    }

    function _rimuoviLogo() {
        _layout.logo_base64 = '';
        var cont = document.getElementById('logo-preview-container');
        if (cont) cont.style.display = 'none';
        var fileInput = document.getElementById('cfg-logo-file');
        if (fileInput) fileInput.value = '';
        _aggiornaAnteprima();
    }

    // ============================================================
    // ANTEPRIMA REALISTICA
    // ============================================================

    function _aggiornaAnteprima() {
        var cfg = _readForm();
        var W = 42;
        var sepLine = '<span style="color:#999;">' + '\u2500'.repeat(W) + '</span>';
        var sepBold = '<span style="color:#888;">' + '\u2550'.repeat(W) + '</span>';
        var now = new Date();

        function esc(text) {
            return (text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        }
        function center(text) {
            if (!text) return '';
            var clean = text.replace(/<[^>]+>/g, '');
            var p = Math.max(0, Math.floor((W - clean.length) / 2));
            return ' '.repeat(p) + text;
        }
        function centerEsc(text) {
            if (!text) return '';
            text = esc(text);
            var p = Math.max(0, Math.floor((W - text.length) / 2));
            return ' '.repeat(p) + text;
        }
        function pad(left, right) {
            left = esc(left);
            right = esc(right || '');
            var sp = W - left.length - right.length;
            if (sp < 1) sp = 1;
            return left + ' '.repeat(sp) + right;
        }

        var html = '';

        // Logo
        if (cfg.logo_base64) {
            html += '<div style="text-align:center; margin-bottom:6px;">';
            html += '<img src="' + cfg.logo_base64 + '" style="max-width:160px; max-height:50px; filter:contrast(1.5);">';
            html += '</div>';
        }

        var lines = [];

        // Intestazione
        lines.push('<b style="font-size:14px;">' + centerEsc(cfg.nome_negozio || 'TITANWASH') + '</b>');
        if (cfg.sottotitolo) lines.push('<span style="font-size:10px;">' + centerEsc(cfg.sottotitolo) + '</span>');
        if (cfg.indirizzo) lines.push(centerEsc(cfg.indirizzo));
        if (cfg.telefono) lines.push(centerEsc('Tel: ' + cfg.telefono));
        if (cfg.partita_iva) lines.push(centerEsc('P.IVA: ' + cfg.partita_iva));
        if (cfg.email) lines.push('<span style="font-size:10px;">' + centerEsc(cfg.email) + '</span>');
        if (cfg.sito_web) lines.push('<span style="font-size:10px;">' + centerEsc(cfg.sito_web) + '</span>');

        // Separatore intestazione personalizzato
        if (cfg.separatore_intestazione) {
            lines.push(centerEsc(cfg.separatore_intestazione));
        }

        lines.push('');

        // Data/ora e operatore
        if (cfg.mostra_data_ora) {
            lines.push(centerEsc(now.toLocaleDateString('it-IT') + '  ' + now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })));
        }
        if (cfg.mostra_operatore) {
            lines.push(centerEsc('Op: Mario Rossi'));
        }

        lines.push(sepBold);

        // Articoli esempio
        lines.push('<b>' + esc('Olio motore 5W40') + '</b>');
        lines.push(pad('  1 x 25.00', '25.00'));
        lines.push('<b>' + esc('Tergicristalli Bosch') + '</b>');
        lines.push(pad('  2 x 12.50', '25.00'));
        lines.push('<b>' + esc('Lavaggio Premium') + '</b>');
        lines.push(pad('  1 x 15.00', '15.00'));

        lines.push(sepLine);

        // Subtotale
        if (cfg.mostra_subtotale) {
            lines.push(pad('Subtotale:', '65.00'));
            lines.push(pad('Sconto 10%:', '-6.50'));
            lines.push(sepLine);
        }

        // Totale
        lines.push('<b style="font-size:13px;">' + pad('TOTALE EUR', '58.50') + '</b>');
        lines.push('');
        lines.push(pad('Pagamento:', 'Contanti'));
        lines.push(pad('  Ricevuto:', '60.00'));
        lines.push(pad('  Resto:', '1.50'));

        lines.push(sepBold);

        // Footer
        lines.push('');
        if (cfg.footer_riga1) lines.push(centerEsc(cfg.footer_riga1));
        if (cfg.footer_riga2) lines.push('<span style="font-size:10px;">' + centerEsc(cfg.footer_riga2) + '</span>');
        if (cfg.footer_riga3) lines.push('<span style="font-size:10px;">' + centerEsc(cfg.footer_riga3) + '</span>');

        // Separatore footer personalizzato
        if (cfg.separatore_footer) {
            lines.push(centerEsc(cfg.separatore_footer));
        }

        if (cfg.mostra_codice) {
            lines.push('');
            lines.push('<span style="font-size:9px; color:#666;">' + centerEsc('VEN-20260307-001') + '</span>');
        }

        html += lines.join('\n');

        var preview = document.getElementById('receipt-preview');
        if (preview) preview.innerHTML = '<pre style="margin:0; font-family:inherit; font-size:inherit; line-height:inherit; white-space:pre-wrap;">' + html + '</pre>';
    }

    // ============================================================
    // AZIONI
    // ============================================================

    async function _testStampa() {
        try {
            var res = await _fetchWithTimeout(_serverUrl + '/test', {}, 5000);
            var result = await res.json();
            if (result.success) {
                ENI.UI.toast('Test stampa inviato!', 'success');
                _setServerStatus(true);
            } else {
                ENI.UI.toast('Errore: ' + result.message, 'error');
            }
        } catch (e) {
            ENI.UI.toast('Server stampa non raggiungibile. Avvia print-server sul PC.', 'error');
            _setServerStatus(false);
        }
    }

    async function _salvaLayout() {
        var cfg = _readForm();

        // Salva SEMPRE in localStorage (funziona anche senza print server)
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
            _layout = cfg;
        } catch (e) {
            ENI.UI.toast('Errore salvataggio', 'error');
            return;
        }

        ENI.UI.toast('Configurazione salvata', 'success');

        // Prova anche a sincronizzare col print server (se attivo, in background)
        try {
            var res = await _fetchWithTimeout(_serverUrl + '/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(cfg)
            }, 3000);
            var result = await res.json();
            if (result.success) {
                _setServerStatus(true);
            }
        } catch (e) {
            _setServerStatus(false);
        }
    }

    function _resetLayout() {
        _layout = Object.assign({}, DEFAULT_LAYOUT);
        _populateForm(_layout);
        _aggiornaAnteprima();
        ENI.UI.toast('Layout ripristinato ai valori default', 'info');
    }

    return { render: render };
})();
