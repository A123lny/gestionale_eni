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

    var DEFAULT_LAYOUT = {
        nome_negozio: 'TITANWASH',
        indirizzo: 'Borgo Maggiore - San Marino',
        footer: 'Grazie e arrivederci!',
        mostra_operatore: true,
        mostra_data_ora: true,
        tipo_taglio: 'parziale',
        righe_prima_taglio: 3,
        printer_ip: '192.168.1.130',
        printer_port: 9100
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

            // Layout scontrino
            '<div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--space-4);">' +

                // Colonna sinistra: form
                '<div class="card">' +
                    '<div class="card-header"><h3 class="card-title">Layout Scontrino</h3></div>' +
                    '<div class="card-body">' +
                        '<div class="form-group">' +
                            '<label class="form-label">Nome Negozio</label>' +
                            '<input type="text" class="form-input" id="cfg-nome-negozio" placeholder="TITANWASH">' +
                        '</div>' +
                        '<div class="form-group">' +
                            '<label class="form-label">Indirizzo</label>' +
                            '<input type="text" class="form-input" id="cfg-indirizzo" placeholder="Borgo Maggiore - San Marino">' +
                        '</div>' +
                        '<div class="form-group">' +
                            '<label class="form-label">Messaggio Footer</label>' +
                            '<input type="text" class="form-input" id="cfg-footer" placeholder="Grazie e arrivederci!">' +
                        '</div>' +
                        '<div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--space-3);">' +
                            '<label class="form-label" style="display:flex; align-items:center; gap:8px;">' +
                                '<input type="checkbox" id="cfg-mostra-operatore" checked> Mostra operatore' +
                            '</label>' +
                            '<label class="form-label" style="display:flex; align-items:center; gap:8px;">' +
                                '<input type="checkbox" id="cfg-mostra-data" checked> Mostra data/ora' +
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

                // Colonna destra: anteprima
                '<div class="card">' +
                    '<div class="card-header"><h3 class="card-title">Anteprima Scontrino</h3></div>' +
                    '<div class="card-body" style="padding:0;">' +
                        '<pre id="receipt-preview" style="' +
                            'background:#fff; color:#000; font-family:Courier New,monospace; font-size:11px;' +
                            'line-height:1.4; padding:16px; margin:0; white-space:pre; overflow-x:auto;' +
                            'border:2px solid var(--border); border-radius:var(--radius-md);' +
                            'min-height:300px; max-height:500px; overflow-y:auto;' +
                        '"></pre>' +
                    '</div>' +
                '</div>' +

            '</div>';

        // Event listeners
        container.querySelector('#btn-test-stampa').addEventListener('click', _testStampa);
        container.querySelector('#btn-salva-layout').addEventListener('click', _salvaLayout);
        container.querySelector('#btn-reset-layout').addEventListener('click', _resetLayout);

        // Aggiorna anteprima in tempo reale
        var inputs = container.querySelectorAll('#cfg-nome-negozio, #cfg-indirizzo, #cfg-footer, #cfg-mostra-operatore, #cfg-mostra-data, #cfg-tipo-taglio, #cfg-righe-taglio');
        for (var i = 0; i < inputs.length; i++) {
            inputs[i].addEventListener('input', _aggiornaAnteprima);
            inputs[i].addEventListener('change', _aggiornaAnteprima);
        }

        // Carica configurazione
        await _caricaConfig();
    }

    async function _caricaConfig() {
        try {
            var res = await fetch(_serverUrl + '/config');
            if (res.ok) {
                _layout = await res.json();
                _setServerStatus(true);
            } else {
                _layout = Object.assign({}, DEFAULT_LAYOUT);
                _setServerStatus(false);
            }
        } catch (e) {
            _layout = Object.assign({}, DEFAULT_LAYOUT);
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
        var el;
        el = document.getElementById('cfg-printer-ip');
        if (el) el.value = layout.printer_ip || '';
        el = document.getElementById('cfg-printer-port');
        if (el) el.value = layout.printer_port || 9100;
        el = document.getElementById('cfg-nome-negozio');
        if (el) el.value = layout.nome_negozio || '';
        el = document.getElementById('cfg-indirizzo');
        if (el) el.value = layout.indirizzo || '';
        el = document.getElementById('cfg-footer');
        if (el) el.value = layout.footer || '';
        el = document.getElementById('cfg-mostra-operatore');
        if (el) el.checked = layout.mostra_operatore !== false;
        el = document.getElementById('cfg-mostra-data');
        if (el) el.checked = layout.mostra_data_ora !== false;
        el = document.getElementById('cfg-tipo-taglio');
        if (el) el.value = layout.tipo_taglio || 'parziale';
        el = document.getElementById('cfg-righe-taglio');
        if (el) el.value = String(layout.righe_prima_taglio || 3);
    }

    function _readForm() {
        return {
            printer_ip: (document.getElementById('cfg-printer-ip') || {}).value || '192.168.1.130',
            printer_port: parseInt((document.getElementById('cfg-printer-port') || {}).value) || 9100,
            nome_negozio: (document.getElementById('cfg-nome-negozio') || {}).value || 'TITANWASH',
            indirizzo: (document.getElementById('cfg-indirizzo') || {}).value || '',
            footer: (document.getElementById('cfg-footer') || {}).value || 'Grazie e arrivederci!',
            mostra_operatore: (document.getElementById('cfg-mostra-operatore') || {}).checked !== false,
            mostra_data_ora: (document.getElementById('cfg-mostra-data') || {}).checked !== false,
            tipo_taglio: (document.getElementById('cfg-tipo-taglio') || {}).value || 'parziale',
            righe_prima_taglio: parseInt((document.getElementById('cfg-righe-taglio') || {}).value) || 3
        };
    }

    function _aggiornaAnteprima() {
        var cfg = _readForm();
        var W = 48;
        var sep = '-'.repeat(W);
        var now = new Date();

        function pad(left, right) {
            right = right || '';
            var sp = W - left.length - right.length;
            if (sp < 1) sp = 1;
            return left + ' '.repeat(sp) + right;
        }
        function center(text) {
            var p = Math.max(0, Math.floor((W - text.length) / 2));
            return ' '.repeat(p) + text;
        }

        var lines = [];
        lines.push(center(cfg.nome_negozio || 'TITANWASH'));
        if (cfg.indirizzo) lines.push(center(cfg.indirizzo));
        if (cfg.mostra_data_ora) lines.push(center(now.toLocaleDateString('it-IT') + ' ' + now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })));
        if (cfg.mostra_operatore) lines.push(center('Op: Mario Rossi'));
        lines.push(sep);
        lines.push('Olio motore 5W40');
        lines.push(pad('  1 x 25.00', '25.00'));
        lines.push('Tergicristalli Bosch');
        lines.push(pad('  2 x 12.50', '25.00'));
        lines.push(sep);
        lines.push(pad('TOTALE EUR', '50.00'));
        lines.push(pad('Pagamento:', 'Contanti'));
        lines.push(pad('  Contanti:', '50.00'));
        lines.push(sep);
        lines.push('');
        lines.push(center(cfg.footer || 'Grazie e arrivederci!'));
        lines.push(center('VEN-20260305-001'));

        var preview = document.getElementById('receipt-preview');
        if (preview) preview.textContent = lines.join('\n');
    }

    async function _testStampa() {
        var cfg = _readForm();
        try {
            var res = await fetch(_serverUrl + '/test');
            var result = await res.json();
            if (result.success) {
                ENI.UI.toast('Test stampa inviato!', 'success');
                _setServerStatus(true);
            } else {
                ENI.UI.toast('Errore: ' + result.message, 'error');
            }
        } catch (e) {
            ENI.UI.toast('Server stampa non raggiungibile', 'error');
            _setServerStatus(false);
        }
    }

    async function _salvaLayout() {
        var cfg = _readForm();
        try {
            var res = await fetch(_serverUrl + '/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(cfg)
            });
            var result = await res.json();
            if (result.success) {
                // Salva anche in localStorage per lettura rapida dal frontend
                localStorage.setItem('titanwash_print_layout', JSON.stringify(cfg));
                _layout = cfg;
                ENI.UI.toast('Configurazione salvata', 'success');
            } else {
                ENI.UI.toast('Errore salvataggio: ' + result.message, 'error');
            }
        } catch (e) {
            ENI.UI.toast('Server stampa non raggiungibile', 'error');
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
