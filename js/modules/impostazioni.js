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

    var DEFAULT_LAYOUT = {
        nome_negozio: 'TITANWASH',
        sottotitolo: 'Autolavaggio & Stazione di Servizio',
        indirizzo: 'Borgo Maggiore - San Marino',
        telefono: '',
        partita_iva: '',
        email: '',
        sito_web: '',
        footer_riga1: 'Grazie e arrivederci!',
        footer_riga2: '',
        footer_riga3: '',
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

    async function render(container) {
        _serverUrl = ENI.Config.PRINT_SERVER_URL || 'http://localhost:3333';

        container.innerHTML =
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
                            '<div class="form-group">' +
                                '<label class="form-label">Nome Negozio</label>' +
                                '<input type="text" class="form-input" id="cfg-nome-negozio" placeholder="TITANWASH">' +
                            '</div>' +
                            '<div class="form-group">' +
                                '<label class="form-label">Sottotitolo</label>' +
                                '<input type="text" class="form-input" id="cfg-sottotitolo" placeholder="Autolavaggio & Stazione di Servizio">' +
                            '</div>' +
                            '<div class="form-group">' +
                                '<label class="form-label">Indirizzo</label>' +
                                '<input type="text" class="form-input" id="cfg-indirizzo" placeholder="Borgo Maggiore - San Marino">' +
                            '</div>' +
                            '<div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--space-3);">' +
                                '<div class="form-group">' +
                                    '<label class="form-label">Telefono</label>' +
                                    '<input type="text" class="form-input" id="cfg-telefono" placeholder="+39 0549 123456">' +
                                '</div>' +
                                '<div class="form-group">' +
                                    '<label class="form-label">P.IVA / COE</label>' +
                                    '<input type="text" class="form-input" id="cfg-partita-iva" placeholder="SM12345">' +
                                '</div>' +
                            '</div>' +
                            '<div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--space-3);">' +
                                '<div class="form-group">' +
                                    '<label class="form-label">Email</label>' +
                                    '<input type="text" class="form-input" id="cfg-email" placeholder="info@titanwash.sm">' +
                                '</div>' +
                                '<div class="form-group">' +
                                    '<label class="form-label">Sito Web</label>' +
                                    '<input type="text" class="form-input" id="cfg-sito-web" placeholder="www.titanwash.sm">' +
                                '</div>' +
                            '</div>' +
                        '</div>' +
                    '</div>' +

                    // Footer
                    '<div class="card mb-4">' +
                        '<div class="card-header"><h3 class="card-title">Footer Scontrino</h3></div>' +
                        '<div class="card-body">' +
                            '<div class="form-group">' +
                                '<label class="form-label">Riga 1</label>' +
                                '<input type="text" class="form-input" id="cfg-footer-riga1" placeholder="Grazie e arrivederci!">' +
                            '</div>' +
                            '<div class="form-group">' +
                                '<label class="form-label">Riga 2 (opzionale)</label>' +
                                '<input type="text" class="form-input" id="cfg-footer-riga2" placeholder="Seguici su Instagram @titanwash">' +
                            '</div>' +
                            '<div class="form-group">' +
                                '<label class="form-label">Riga 3 (opzionale)</label>' +
                                '<input type="text" class="form-input" id="cfg-footer-riga3" placeholder="">' +
                            '</div>' +
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

        // Aggiorna anteprima in tempo reale
        var inputs = container.querySelectorAll(
            '#cfg-nome-negozio, #cfg-sottotitolo, #cfg-indirizzo, #cfg-telefono, #cfg-partita-iva, ' +
            '#cfg-email, #cfg-sito-web, #cfg-footer-riga1, #cfg-footer-riga2, #cfg-footer-riga3, ' +
            '#cfg-mostra-operatore, #cfg-mostra-data, #cfg-mostra-codice, #cfg-mostra-subtotale, ' +
            '#cfg-tipo-taglio, #cfg-righe-taglio'
        );
        for (var i = 0; i < inputs.length; i++) {
            inputs[i].addEventListener('input', _aggiornaAnteprima);
            inputs[i].addEventListener('change', _aggiornaAnteprima);
        }

        // Carica configurazione
        await _caricaConfig();
    }

    async function _caricaConfig() {
        // Prima leggi da localStorage (funziona sempre)
        var saved = null;
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            if (raw) saved = JSON.parse(raw);
        } catch (e) {}

        // Poi prova il print server (se online, sovrascrive)
        try {
            var res = await fetch(_serverUrl + '/config', { signal: AbortSignal.timeout(3000) });
            if (res.ok) {
                var serverLayout = await res.json();
                _layout = Object.assign({}, DEFAULT_LAYOUT, saved || {}, serverLayout);
                _setServerStatus(true);
            } else {
                _layout = Object.assign({}, DEFAULT_LAYOUT, saved || {});
                _setServerStatus(false);
            }
        } catch (e) {
            _layout = Object.assign({}, DEFAULT_LAYOUT, saved || {});
            _setServerStatus(false);
        }

        _populateForm(_layout);
        _aggiornaAnteprima();
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
        _setVal('cfg-footer-riga1', layout.footer_riga1);
        _setVal('cfg-footer-riga2', layout.footer_riga2);
        _setVal('cfg-footer-riga3', layout.footer_riga3);
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
            footer_riga1: (document.getElementById('cfg-footer-riga1') || {}).value || 'Grazie e arrivederci!',
            footer_riga2: (document.getElementById('cfg-footer-riga2') || {}).value || '',
            footer_riga3: (document.getElementById('cfg-footer-riga3') || {}).value || '',
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
        var sep = '<span style="color:#999;">' + '\u2500'.repeat(W) + '</span>';
        var sepBold = '<span style="color:#888;">' + '\u2550'.repeat(W) + '</span>';
        var now = new Date();

        function esc(text) {
            return (text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        }
        function center(text) {
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
        lines.push('<b style="font-size:14px;">' + center(cfg.nome_negozio || 'TITANWASH') + '</b>');
        if (cfg.sottotitolo) lines.push('<span style="font-size:10px;">' + center(cfg.sottotitolo) + '</span>');
        if (cfg.indirizzo) lines.push(center(cfg.indirizzo));
        if (cfg.telefono) lines.push(center('Tel: ' + cfg.telefono));
        if (cfg.partita_iva) lines.push(center('P.IVA: ' + cfg.partita_iva));
        if (cfg.email) lines.push('<span style="font-size:10px;">' + center(cfg.email) + '</span>');
        if (cfg.sito_web) lines.push('<span style="font-size:10px;">' + center(cfg.sito_web) + '</span>');

        lines.push('');

        // Data/ora e operatore
        if (cfg.mostra_data_ora) {
            lines.push(center(now.toLocaleDateString('it-IT') + '  ' + now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })));
        }
        if (cfg.mostra_operatore) {
            lines.push(center('Op: Mario Rossi'));
        }

        lines.push(sepBold);

        // Articoli esempio
        lines.push('<b>Olio motore 5W40</b>');
        lines.push(pad('  1 x 25.00', '25.00'));
        lines.push('<b>Tergicristalli Bosch</b>');
        lines.push(pad('  2 x 12.50', '25.00'));
        lines.push('<b>Lavaggio Premium</b>');
        lines.push(pad('  1 x 15.00', '15.00'));

        lines.push(sep);

        // Subtotale
        if (cfg.mostra_subtotale) {
            lines.push(pad('Subtotale:', '65.00'));
            lines.push(pad('Sconto 10%:', '-6.50'));
            lines.push(sep);
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
        if (cfg.footer_riga1) lines.push(center(cfg.footer_riga1));
        if (cfg.footer_riga2) lines.push('<span style="font-size:10px;">' + center(cfg.footer_riga2) + '</span>');
        if (cfg.footer_riga3) lines.push('<span style="font-size:10px;">' + center(cfg.footer_riga3) + '</span>');

        if (cfg.mostra_codice) {
            lines.push('');
            lines.push('<span style="font-size:9px; color:#666;">' + center('VEN-20260305-001') + '</span>');
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
            var res = await fetch(_serverUrl + '/test', { signal: AbortSignal.timeout(5000) });
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
            ENI.UI.toast('Configurazione salvata', 'success');
        } catch (e) {
            ENI.UI.toast('Errore salvataggio locale', 'error');
            return;
        }

        // Prova anche a sincronizzare col print server (se attivo)
        try {
            var res = await fetch(_serverUrl + '/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(cfg),
                signal: AbortSignal.timeout(3000)
            });
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
