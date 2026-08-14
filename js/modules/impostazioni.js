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
        printer_ip: '192.168.1.250',
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

            _settingsStyle() +

            '<div class="page-header">' +
                '<h1 class="page-title">Impostazioni</h1>' +
            '</div>' +

            '<div class="settings-wrap">' +
                '<nav class="settings-nav" id="settings-nav">' + _navButtonsHtml() + '</nav>' +
                '<div class="settings-content">' +

                    // Sezione: Moduli visibili (solo Super Admin)
                    (ENI.State.isSuperAdmin()
                        ? '<section class="settings-panel" data-panel="moduli">' + _moduliCardHtml() + '</section>'
                        : '') +

                    // Sezione: Dati attività
                    '<section class="settings-panel" data-panel="attivita">' + _datiAttivitaHtml() + '</section>' +

                    // Sezione: Il mio accesso (cambio PIN personale)
                    '<section class="settings-panel" data-panel="accesso">' + _accessoPanelHtml() + '</section>' +

                    // Sezione: Soglie & allerte
                    '<section class="settings-panel" data-panel="soglie">' + _sogliePanelHtml() + '</section>' +

                    // Sezione: Backup & Esporta (solo Super Admin)
                    (ENI.State.isSuperAdmin()
                        ? '<section class="settings-panel" data-panel="backup">' + _backupPanelHtml() + '</section>'
                        : '') +

                    // Sezione: Stampante & Scontrino
                    '<section class="settings-panel" data-panel="stampante">' +

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
                            '<input type="text" class="form-input" id="cfg-printer-ip" placeholder="192.168.1.250">' +
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

            '</div>' +
                    '</section>' +

                    // Sezione: Notifiche SMS (Twilio) — in arrivo
                    '<section class="settings-panel" data-panel="sms">' + _smsPanelHtml() + '</section>' +

                '</div>' +   // .settings-content
            '</div>';        // .settings-wrap

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

        // Aggiorna anteprima in tempo reale su TUTTI i campi
        var allInputs = container.querySelectorAll('.cfg-input, #cfg-mostra-operatore, #cfg-mostra-data, #cfg-mostra-codice, #cfg-mostra-subtotale, #cfg-tipo-taglio, #cfg-righe-taglio, #cfg-printer-ip, #cfg-printer-port');
        for (var i = 0; i < allInputs.length; i++) {
            allInputs[i].addEventListener('input', _aggiornaAnteprima);
            allInputs[i].addEventListener('change', _aggiornaAnteprima);
        }

        // Toggle moduli visibili (solo Super Admin)
        var toggles = container.querySelectorAll('.toggle-modulo');
        for (var t = 0; t < toggles.length; t++) {
            toggles[t].addEventListener('change', _toggleModulo);
        }

        // Navigazione a sezioni (Moduli / Dati attività / Stampante / SMS)
        _initSettingsNav(container);

        // Dati attività: salvataggio (solo Super Admin) + caricamento
        var btnAtt = container.querySelector('#btn-salva-attivita');
        if (btnAtt) btnAtt.addEventListener('click', _salvaDatiAttivita);
        _caricaDatiAttivita();

        // Soglie & allerte: salvataggio (solo Super Admin) + caricamento
        var btnSoglie = container.querySelector('#btn-salva-soglie');
        if (btnSoglie) btnSoglie.addEventListener('click', _salvaSoglie);
        _caricaSoglie();

        // Il mio accesso: cambio PIN
        var btnPin = container.querySelector('#btn-cambia-pin');
        if (btnPin) btnPin.addEventListener('click', _cambiaPin);

        // Backup & Esporta (solo Super Admin)
        var btnBkExcel = container.querySelector('#btn-backup-excel');
        if (btnBkExcel) btnBkExcel.addEventListener('click', _esportaBackupExcel);
        var btnBkJson = container.querySelector('#btn-backup-json');
        if (btnBkJson) btnBkJson.addEventListener('click', _esportaBackupJson);
        var btnBkSingola = container.querySelector('#btn-backup-singola');
        if (btnBkSingola) btnBkSingola.addEventListener('click', _esportaSingola);

        // Carica configurazione
        await _caricaConfig();
    }

    // ============================================================
    // MODULI VISIBILI (feature toggle globali - Super Admin)
    // ============================================================

    function _moduliCardHtml() {
        if (!ENI.State.isSuperAdmin()) return '';
        var opz = ENI.Config.MODULI_OPZIONALI || [];
        if (!opz.length) return '';

        var labelById = {};
        (ENI.Config.NAV_ITEMS || []).forEach(function(it) { labelById[it.id] = it.label; });

        var rows = opz.map(function(id) {
            var attivo = ENI.State.isModuloAttivo(id);
            var nome = labelById[id] || id;
            return '<div style="display:flex; align-items:center; justify-content:space-between; padding:10px 0; border-bottom:1px solid var(--border, var(--color-gray-200));">' +
                '<div>' +
                    '<div style="font-weight:600;">' + ENI.UI.escapeHtml(nome) + '</div>' +
                    '<div class="text-sm text-muted toggle-modulo-stato" data-stato="' + id + '">' + (attivo ? 'Visibile nel menu' : 'Nascosto dal menu') + '</div>' +
                '</div>' +
                '<label style="display:inline-flex; align-items:center; gap:8px; cursor:pointer;">' +
                    '<input type="checkbox" class="toggle-modulo" data-modulo="' + id + '"' + (attivo ? ' checked' : '') + '>' +
                    '<span class="text-sm">Visibile</span>' +
                '</label>' +
            '</div>';
        }).join('');

        return '<div class="card mb-4">' +
            '<div class="card-header">' +
                '<h3 class="card-title">Moduli visibili</h3>' +
                '<span class="badge" style="margin-left:auto; background:var(--color-primary); color:#fff; padding:3px 10px; border-radius:12px; font-size:11px;">Solo Super Admin</span>' +
            '</div>' +
            '<div class="card-body">' +
                '<p class="text-sm text-muted" style="margin-top:0;">Attiva o nascondi pagine opzionali dal menu. La modifica vale per tutti gli utenti e tutti i dispositivi.</p>' +
                rows +
            '</div>' +
        '</div>';
    }

    async function _toggleModulo(e) {
        var el = e.currentTarget;
        var id = el.getAttribute('data-modulo');
        var visibile = el.checked;

        var disabled = ENI.State.getModuliDisabilitati();
        var idx = disabled.indexOf(id);
        if (visibile) {
            if (idx !== -1) disabled.splice(idx, 1);
        } else {
            if (idx === -1) disabled.push(id);
        }

        el.disabled = true;
        try {
            await ENI.API.salvaModuliDisabilitati(disabled);
            ENI.State.setModuliDisabilitati(disabled);
            ENI.UI.toast(visibile ? 'Modulo mostrato nel menu' : 'Modulo nascosto dal menu', 'success');
            // Rigenera menu e ri-renderizza la pagina corrente
            ENI.App.renderShell();
            ENI.Router.refresh();
        } catch (err) {
            el.checked = !visibile;
            el.disabled = false;
            ENI.UI.toast('Errore: ' + (err.message || err), 'error');
        }
    }

    // ============================================================
    // LAYOUT A SEZIONI
    // ============================================================

    function _settingsSections() {
        var secs = [];
        secs.push({ id: 'attivita', label: 'Dati attività', icon: '\u{1F3E2}' });
        secs.push({ id: 'accesso', label: 'Il mio accesso', icon: '\u{1F510}' });
        secs.push({ id: 'soglie', label: 'Soglie & allerte', icon: '\u{1F514}' });
        if (ENI.State.isSuperAdmin()) secs.push({ id: 'moduli', label: 'Moduli', icon: '\u{1F9E9}' });
        if (ENI.State.isSuperAdmin()) secs.push({ id: 'backup', label: 'Backup & Esporta', icon: '\u{1F4BE}' });
        secs.push({ id: 'stampante', label: 'Stampante & Scontrino', icon: '\u{1F5A8}️' });
        secs.push({ id: 'sms', label: 'Notifiche SMS', icon: '\u{1F4AC}', badge: 'In arrivo' });
        return secs;
    }

    function _navButtonsHtml() {
        return _settingsSections().map(function(s, i) {
            return '<button type="button" class="settings-nav-btn' + (i === 0 ? ' active' : '') + '" data-nav="' + s.id + '">' +
                '<span class="settings-nav-ico">' + s.icon + '</span>' +
                '<span class="settings-nav-lbl">' + s.label + '</span>' +
                (s.badge ? '<span class="settings-nav-badge">' + s.badge + '</span>' : '') +
            '</button>';
        }).join('');
    }

    function _initSettingsNav(container) {
        var nav = container.querySelector('#settings-nav');
        if (!nav) return;
        var sections = _settingsSections();
        var first = sections.length ? sections[0].id : null;
        _showPanel(container, first);
        nav.addEventListener('click', function(e) {
            var b = e.target.closest('[data-nav]');
            if (!b) return;
            var id = b.getAttribute('data-nav');
            nav.querySelectorAll('[data-nav]').forEach(function(x) {
                x.classList.toggle('active', x.getAttribute('data-nav') === id);
            });
            _showPanel(container, id);
        });
    }

    function _showPanel(container, id) {
        container.querySelectorAll('.settings-panel').forEach(function(p) {
            p.style.display = (p.getAttribute('data-panel') === id) ? '' : 'none';
        });
    }

    // Pannello Notifiche SMS (Twilio) — scaffold visivo, non ancora attivo
    function _smsPanelHtml() {
        function campo(label, ph) {
            return '<div class="form-group"><label class="form-label">' + label + '</label>' +
                '<input type="text" class="form-input" placeholder="' + ph + '"></div>';
        }
        return '<div class="card mb-4">' +
            '<div class="card-header">' +
                '<h3 class="card-title">Notifiche SMS al cliente</h3>' +
                '<span class="badge" style="margin-left:auto; background:var(--color-warning,#eda100); color:#fff; padding:3px 10px; border-radius:12px; font-size:11px;">In arrivo</span>' +
            '</div>' +
            '<div class="card-body">' +
                '<p class="text-sm text-muted" style="margin-top:0;">Invio automatico di un SMS al cliente quando l\'auto è pronta per il ritiro, tramite Twilio. La configurazione non è ancora attiva: la stiamo preparando.</p>' +
                '<fieldset disabled style="border:none; padding:0; margin:0; opacity:0.6;">' +
                    '<div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--space-3);">' +
                        campo('Account SID', 'AC••••••••••') +
                        campo('Auth Token', '••••••••••') +
                    '</div>' +
                    '<div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--space-3);">' +
                        campo('Numero mittente', '+1 555 000 0000') +
                        campo('Numero di test', '+378 66 12 34 56') +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label class="form-label">Testo del messaggio</label>' +
                        '<textarea class="form-input" rows="3" placeholder="Ciao {nome}, la tua auto è pronta per il ritiro presso Titanwash. Grazie!"></textarea>' +
                        '<span class="text-xs text-muted">Segnaposto disponibili: {nome}, {targa}, {codice}</span>' +
                    '</div>' +
                    '<button type="button" class="btn btn-primary" style="margin-top:var(--space-3);">Salva configurazione</button>' +
                '</fieldset>' +
            '</div>' +
        '</div>';
    }

    function _settingsStyle() {
        return '<style>' +
            '.settings-wrap{display:grid;grid-template-columns:220px 1fr;gap:var(--space-4);align-items:start;}' +
            '.settings-nav{display:flex;flex-direction:column;gap:4px;position:sticky;top:var(--space-4);}' +
            '.settings-nav-btn{display:flex;align-items:center;gap:10px;width:100%;text-align:left;padding:10px 12px;border:1px solid transparent;border-radius:var(--radius-md);background:none;cursor:pointer;color:inherit;font-size:14px;transition:background .15s,border-color .15s;}' +
            '.settings-nav-btn:hover{background:var(--bg-secondary);}' +
            '.settings-nav-btn.active{background:var(--bg-secondary);border-color:var(--color-gray-200);font-weight:600;}' +
            '.settings-nav-ico{font-size:16px;line-height:1;}' +
            '.settings-nav-lbl{flex:1;}' +
            '.settings-nav-badge{font-size:9px;text-transform:uppercase;letter-spacing:.03em;background:var(--color-warning,#eda100);color:#fff;padding:2px 6px;border-radius:8px;white-space:nowrap;}' +
            '@media(max-width:768px){.settings-wrap{grid-template-columns:1fr;}.settings-nav{flex-direction:row;overflow-x:auto;position:static;padding-bottom:4px;}.settings-nav-btn{white-space:nowrap;}.settings-nav-lbl{flex:0 0 auto;}}' +
        '</style>';
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

    // ============================================================
    // DATI ATTIVITA'
    // ============================================================

    function _datiAttivitaHtml() {
        var puoModificare = ENI.State.isSuperAdmin();
        var dis = puoModificare ? '' : ' disabled';

        return '<div class="card mb-4">' +
                '<div class="card-header">' +
                    '<h3 class="card-title">Dati fiscali</h3>' +
                    '<span class="text-sm text-muted" style="margin-left:auto;">Si modificano in Fatturazione</span>' +
                '</div>' +
                '<div class="card-body" id="dati-fiscali-body">' +
                    '<div class="flex justify-center" style="padding:1rem;"><div class="spinner"></div></div>' +
                '</div>' +
            '</div>' +
            '<div class="card mb-4">' +
                '<div class="card-header">' +
                    '<h3 class="card-title">Contatti & brand</h3>' +
                    (puoModificare ? '' : '<span class="badge" style="margin-left:auto; background:var(--color-primary); color:#fff; padding:3px 10px; border-radius:12px; font-size:11px;">Solo Super Admin</span>') +
                '</div>' +
                '<div class="card-body">' +
                    (puoModificare ? '' : '<p class="text-sm text-muted" style="margin-top:0;">Solo il Super Admin può modificare questi dati.</p>') +
                    '<div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--space-3);">' +
                        '<div class="form-group"><label class="form-label">Nome commerciale</label>' +
                            '<input type="text" class="form-input" id="att-nome" placeholder="Titanwash"' + dis + '></div>' +
                        '<div class="form-group"><label class="form-label">Sottotitolo</label>' +
                            '<input type="text" class="form-input" id="att-sottotitolo" placeholder="Autolavaggio & Stazione di Servizio"' + dis + '></div>' +
                    '</div>' +
                    '<div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:var(--space-3);">' +
                        '<div class="form-group"><label class="form-label">Telefono</label>' +
                            '<input type="text" class="form-input" id="att-telefono" placeholder="0549 902113"' + dis + '></div>' +
                        '<div class="form-group"><label class="form-label">Email</label>' +
                            '<input type="text" class="form-input" id="att-email" placeholder="info@titanwash.sm"' + dis + '></div>' +
                        '<div class="form-group"><label class="form-label">Sito web</label>' +
                            '<input type="text" class="form-input" id="att-sito" placeholder="www.titanwash.sm"' + dis + '></div>' +
                    '</div>' +
                    (puoModificare ? '<button type="button" class="btn btn-primary" id="btn-salva-attivita" style="margin-top:var(--space-2);">Salva dati attività</button>' : '') +
                '</div>' +
            '</div>';
    }

    async function _caricaDatiAttivita() {
        // Dati fiscali (sola lettura, dalla configurazione fatturazione)
        try {
            var f = await ENI.API.getImpostazioniFatturazione();
            _renderDatiFiscali(f);
        } catch (e) {
            var b = document.getElementById('dati-fiscali-body');
            if (b) b.innerHTML = '<p class="text-sm text-muted">Dati fiscali non disponibili.</p>';
        }
        // Contatti & brand (da impostazioni_app)
        try {
            var d = await ENI.API.getImpostazioneApp('dati_attivita');
            _populateDatiAttivita(d || {});
        } catch (e) {
            _populateDatiAttivita({});
        }
    }

    function _renderDatiFiscali(f) {
        var b = document.getElementById('dati-fiscali-body');
        if (!b) return;
        if (!f) { b.innerHTML = '<p class="text-sm text-muted">Nessun dato fiscale registrato.</p>'; return; }

        function riga(label, val, ultima) {
            return '<div style="display:flex; justify-content:space-between; gap:1rem; padding:6px 0;' + (ultima ? '' : ' border-bottom:1px solid var(--color-gray-200);') + '">' +
                '<span class="text-sm text-muted">' + label + '</span>' +
                '<span style="font-weight:600; text-align:right;">' + val + '</span></div>';
        }
        function esc(v) { return ENI.UI.escapeHtml(v || '—'); }

        var sede = [f.indirizzo, [f.cap, (f.comune || '').trim()].filter(Boolean).join(' '), f.provincia].filter(Boolean).join(', ');
        var ibans;
        if (Array.isArray(f.iban_lista) && f.iban_lista.length) {
            ibans = f.iban_lista.map(function(x) { return ENI.UI.escapeHtml((x.banca ? x.banca + ': ' : '') + x.iban); }).join('<br>');
        } else {
            ibans = esc(f.iban_default);
        }

        b.innerHTML =
            riga('Ragione sociale', esc(f.ragione_sociale_emittente)) +
            riga('Sede', esc(sede)) +
            riga('COE / P.IVA', esc(f.coe_piva)) +
            riga('Codice fiscale', esc(f.codice_fiscale_emittente)) +
            riga('IBAN', ibans, true);
    }

    function _populateDatiAttivita(d) {
        var defaults = { nome: 'Titanwash', sottotitolo: 'Autolavaggio & Stazione di Servizio', telefono: '0549902113', email: '', sito: '' };
        var v = Object.assign({}, defaults, d || {});
        _setVal('att-nome', v.nome);
        _setVal('att-sottotitolo', v.sottotitolo);
        _setVal('att-telefono', v.telefono);
        _setVal('att-email', v.email);
        _setVal('att-sito', v.sito);
    }

    async function _salvaDatiAttivita() {
        var dati = {
            nome: _getVal('att-nome').trim(),
            sottotitolo: _getVal('att-sottotitolo').trim(),
            telefono: _getVal('att-telefono').trim(),
            email: _getVal('att-email').trim(),
            sito: _getVal('att-sito').trim()
        };
        var btn = document.getElementById('btn-salva-attivita');
        if (btn) btn.disabled = true;
        try {
            await ENI.API.salvaImpostazioneApp('dati_attivita', dati);
            ENI.UI.toast('Dati attività salvati', 'success');
        } catch (e) {
            ENI.UI.toast('Errore: ' + (e.message || e), 'error');
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    // ============================================================
    // SOGLIE & ALLERTE
    // ============================================================

    function _sogliePanelHtml() {
        var puo = ENI.State.isSuperAdmin();
        var dis = puo ? '' : ' disabled';
        return '<div class="card mb-4">' +
                '<div class="card-header">' +
                    '<h3 class="card-title">Soglie & allerte</h3>' +
                    (puo ? '' : '<span class="badge" style="margin-left:auto; background:var(--color-primary); color:#fff; padding:3px 10px; border-radius:12px; font-size:11px;">Solo Super Admin</span>') +
                '</div>' +
                '<div class="card-body">' +
                    (puo ? '' : '<p class="text-sm text-muted" style="margin-top:0;">Solo il Super Admin può modificare queste soglie.</p>') +
                    '<div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--space-3);">' +
                        '<div class="form-group"><label class="form-label">Orario apertura</label>' +
                            '<input type="number" min="0" max="23" class="form-input" id="soglia-apertura" placeholder="7"' + dis + '>' +
                            '<span class="text-xs text-muted">Ora di inizio della timeline lavaggi (0–23)</span></div>' +
                        '<div class="form-group"><label class="form-label">Orario chiusura</label>' +
                            '<input type="number" min="1" max="24" class="form-input" id="soglia-chiusura" placeholder="21"' + dis + '>' +
                            '<span class="text-xs text-muted">Ora di fine della timeline lavaggi (1–24)</span></div>' +
                    '</div>' +
                    '<div class="form-group"><label class="form-label">Scorta minima predefinita</label>' +
                        '<input type="number" min="0" class="form-input" id="soglia-scorta" placeholder="5" style="max-width:180px;"' + dis + '>' +
                        '<span class="text-xs text-muted">Valore proposto per i nuovi prodotti di magazzino: sotto questa giacenza il prodotto risulta “sotto scorta”.</span></div>' +
                    '<div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--space-3);">' +
                        '<div class="form-group"><label class="form-label">Preavviso scadenze pagamenti (giorni)</label>' +
                            '<input type="number" min="1" max="90" class="form-input" id="soglia-preavviso" placeholder="7"' + dis + '>' +
                            '<span class="text-xs text-muted">Con quanti giorni di anticipo la Tesoreria segnala i pagamenti in scadenza</span></div>' +
                        '<div class="form-group"><label class="form-label">Fondo cassa (€)</label>' +
                            '<input type="number" min="0" step="0.01" class="form-input" id="soglia-fondo" placeholder="720"' + dis + '>' +
                            '<span class="text-xs text-muted">Valore predefinito del “Fondo Cassa Fisso” nella pagina Cassa</span></div>' +
                    '</div>' +
                    (puo ? '<button type="button" class="btn btn-primary" id="btn-salva-soglie" style="margin-top:var(--space-2);">Salva soglie</button>' : '') +
                '</div>' +
            '</div>';
    }

    async function _caricaSoglie() {
        var C = ENI.Config.CONSTANTS;
        var cur = {
            orario_apertura: C.ORARIO_APERTURA,
            orario_chiusura: C.ORARIO_CHIUSURA,
            scorta_minima_default: (C.SCORTA_MINIMA_DEFAULT != null ? C.SCORTA_MINIMA_DEFAULT : 5),
            scadenze_preavviso_giorni: (C.SCADENZE_PREAVVISO_GIORNI != null ? C.SCADENZE_PREAVVISO_GIORNI : 7),
            fondo_cassa_default: (C.FONDO_CASSA_DEFAULT != null ? C.FONDO_CASSA_DEFAULT : 720)
        };
        try {
            var s = await ENI.API.getImpostazioneApp('soglie');
            if (s && typeof s === 'object') cur = Object.assign(cur, s);
        } catch (e) { /* usa i default */ }

        function setNum(id, v) { var el = document.getElementById(id); if (el) el.value = (v == null ? '' : v); }
        setNum('soglia-apertura', cur.orario_apertura);
        setNum('soglia-chiusura', cur.orario_chiusura);
        setNum('soglia-scorta', cur.scorta_minima_default);
        setNum('soglia-preavviso', cur.scadenze_preavviso_giorni);
        setNum('soglia-fondo', cur.fondo_cassa_default);
    }

    async function _salvaSoglie() {
        var ap = parseInt(_getVal('soglia-apertura'), 10);
        var ch = parseInt(_getVal('soglia-chiusura'), 10);
        var sc = parseInt(_getVal('soglia-scorta'), 10);
        var pv = parseInt(_getVal('soglia-preavviso'), 10);
        var fc = parseFloat(_getVal('soglia-fondo'));

        if (isNaN(ap) || ap < 0 || ap > 23) { ENI.UI.toast('Orario apertura non valido (0–23)', 'error'); return; }
        if (isNaN(ch) || ch < 1 || ch > 24) { ENI.UI.toast('Orario chiusura non valido (1–24)', 'error'); return; }
        if (ch <= ap) { ENI.UI.toast('La chiusura deve essere dopo l\'apertura', 'error'); return; }
        if (isNaN(sc) || sc < 0) { ENI.UI.toast('Scorta minima non valida', 'error'); return; }
        if (isNaN(pv) || pv < 1 || pv > 90) { ENI.UI.toast('Preavviso scadenze non valido (1–90 giorni)', 'error'); return; }
        if (isNaN(fc) || fc < 0) { ENI.UI.toast('Fondo cassa non valido', 'error'); return; }

        var dati = { orario_apertura: ap, orario_chiusura: ch, scorta_minima_default: sc, scadenze_preavviso_giorni: pv, fondo_cassa_default: fc };
        var btn = document.getElementById('btn-salva-soglie');
        if (btn) btn.disabled = true;
        try {
            await ENI.API.salvaImpostazioneApp('soglie', dati);
            // Applica subito senza ricaricare la pagina
            ENI.Config.CONSTANTS.ORARIO_APERTURA = ap;
            ENI.Config.CONSTANTS.ORARIO_CHIUSURA = ch;
            ENI.Config.CONSTANTS.SCORTA_MINIMA_DEFAULT = sc;
            ENI.Config.CONSTANTS.SCADENZE_PREAVVISO_GIORNI = pv;
            ENI.Config.CONSTANTS.FONDO_CASSA_DEFAULT = fc;
            ENI.UI.toast('Soglie salvate', 'success');
        } catch (e) {
            ENI.UI.toast('Errore: ' + (e.message || e), 'error');
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    // ============================================================
    // BACKUP & ESPORTA DATI (solo Super Admin, sola lettura)
    // ============================================================

    var _BACKUP_TABELLE = [
        { tabella: 'clienti', foglio: 'Clienti' },
        { tabella: 'vendite', foglio: 'Vendite' },
        { tabella: 'vendite_dettaglio', foglio: 'Vendite dettaglio' },
        { tabella: 'resi', foglio: 'Resi' },
        { tabella: 'resi_dettaglio', foglio: 'Resi dettaglio' },
        { tabella: 'cassa', foglio: 'Cassa' },
        { tabella: 'spese_cassa', foglio: 'Spese' },
        { tabella: 'magazzino', foglio: 'Magazzino' },
        { tabella: 'lavaggi', foglio: 'Lavaggi' },
        { tabella: 'buoni_cartacei', foglio: 'Buoni' },
        { tabella: 'crediti', foglio: 'Crediti' },
        { tabella: 'fatture', foglio: 'Fatture' },
        { tabella: 'fatture_righe', foglio: 'Fatture righe' },
        { tabella: 'movimenti_banca', foglio: 'Movimenti banca' },
        { tabella: 'carichi_carburante', foglio: 'Carichi carburante' },
        { tabella: 'manutenzioni', foglio: 'Manutenzioni' },
        { tabella: 'personale', foglio: 'Personale' }
    ];

    function _backupOpzioniHtml() {
        return _BACKUP_TABELLE.map(function(t) {
            return '<option value="' + t.tabella + '">' + t.foglio + '</option>';
        }).join('');
    }

    function _backupPanelHtml() {
        return '<div class="card mb-4">' +
                '<div class="card-header">' +
                    '<h3 class="card-title">Backup & Esporta dati</h3>' +
                    '<span class="badge" style="margin-left:auto; background:var(--color-primary); color:#fff; padding:3px 10px; border-radius:12px; font-size:11px;">Solo Super Admin</span>' +
                '</div>' +
                '<div class="card-body">' +
                    '<p class="text-sm text-muted" style="margin-top:0;">Scarica una copia di sicurezza dei dati sul tuo PC. Operazione in <strong>sola lettura</strong>: non modifica nulla nel database.</p>' +
                    '<div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:1rem;">' +
                        '<button type="button" class="btn btn-primary" id="btn-backup-excel">\u{1F4CA} Backup completo (Excel)</button>' +
                        '<button type="button" class="btn btn-outline" id="btn-backup-json">\u{1F5C4}️ Backup tecnico (JSON)</button>' +
                    '</div>' +
                    '<div class="form-group" style="max-width:460px;">' +
                        '<label class="form-label">Esporta una singola tabella</label>' +
                        '<div style="display:flex; gap:8px;">' +
                            '<select class="form-select" id="backup-tabella" style="flex:1;">' + _backupOpzioniHtml() + '</select>' +
                            '<button type="button" class="btn btn-outline" id="btn-backup-singola" style="white-space:nowrap;">Esporta</button>' +
                        '</div>' +
                    '</div>' +
                    '<div id="backup-stato" class="text-sm text-muted" style="margin-top:0.75rem; min-height:1.2em;"></div>' +
                '</div>' +
            '</div>';
    }

    function _backupStato(msg) {
        var el = document.getElementById('backup-stato');
        if (el) el.textContent = msg || '';
    }

    function _backupBtnDisabled(v) {
        ['btn-backup-excel', 'btn-backup-json', 'btn-backup-singola'].forEach(function(id) {
            var el = document.getElementById(id);
            if (el) el.disabled = v;
        });
    }

    // Converte i valori complessi (oggetti/array JSON) in testo, per le celle Excel
    function _flattenRow(row) {
        var out = {};
        Object.keys(row).forEach(function(k) {
            var v = row[k];
            if (v === null || v === undefined) out[k] = '';
            else if (typeof v === 'object') out[k] = JSON.stringify(v);
            else out[k] = v;
        });
        return out;
    }

    function _downloadBlob(blob, filename) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
    }

    async function _esportaBackupExcel() {
        _backupBtnDisabled(true);
        try {
            var wb = XLSX.utils.book_new();
            for (var i = 0; i < _BACKUP_TABELLE.length; i++) {
                var t = _BACKUP_TABELLE[i];
                _backupStato('Scarico ' + t.foglio + '… (' + (i + 1) + '/' + _BACKUP_TABELLE.length + ')');
                var rows;
                try { rows = await ENI.API.getTabellaBackup(t.tabella); } catch (e) { rows = []; }
                var ws = XLSX.utils.json_to_sheet((rows || []).map(_flattenRow));
                XLSX.utils.book_append_sheet(wb, ws, t.foglio.substring(0, 31));
            }
            XLSX.writeFile(wb, 'backup_titanwash_' + ENI.UI.oggiISO() + '.xlsx');
            _backupStato('Backup Excel completato.');
            ENI.UI.toast('Backup Excel scaricato', 'success');
        } catch (e) {
            _backupStato('Errore: ' + (e.message || e));
            ENI.UI.toast('Errore backup: ' + (e.message || e), 'error');
        } finally {
            _backupBtnDisabled(false);
        }
    }

    async function _esportaBackupJson() {
        _backupBtnDisabled(true);
        try {
            var tabelle = {};
            for (var i = 0; i < _BACKUP_TABELLE.length; i++) {
                var t = _BACKUP_TABELLE[i];
                _backupStato('Scarico ' + t.foglio + '… (' + (i + 1) + '/' + _BACKUP_TABELLE.length + ')');
                try { tabelle[t.tabella] = await ENI.API.getTabellaBackup(t.tabella); }
                catch (e) { tabelle[t.tabella] = { __errore: e.message || String(e) }; }
            }
            var payload = { generato: new Date().toISOString(), progetto: 'titanwash', tabelle: tabelle };
            var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
            _downloadBlob(blob, 'backup_titanwash_' + ENI.UI.oggiISO() + '.json');
            _backupStato('Backup JSON completato.');
            ENI.UI.toast('Backup JSON scaricato', 'success');
        } catch (e) {
            _backupStato('Errore: ' + (e.message || e));
            ENI.UI.toast('Errore backup: ' + (e.message || e), 'error');
        } finally {
            _backupBtnDisabled(false);
        }
    }

    async function _esportaSingola() {
        var sel = document.getElementById('backup-tabella');
        if (!sel) return;
        var tabella = sel.value;
        var info = _BACKUP_TABELLE.filter(function(t) { return t.tabella === tabella; })[0];
        var foglio = info ? info.foglio : tabella;

        _backupBtnDisabled(true);
        _backupStato('Scarico ' + foglio + '…');
        try {
            var rows = await ENI.API.getTabellaBackup(tabella);
            var ws = XLSX.utils.json_to_sheet((rows || []).map(_flattenRow));
            var wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, foglio.substring(0, 31));
            XLSX.writeFile(wb, tabella + '_' + ENI.UI.oggiISO() + '.xlsx');
            _backupStato(foglio + ': ' + (rows ? rows.length : 0) + ' righe esportate.');
            ENI.UI.toast('Esportato: ' + foglio, 'success');
        } catch (e) {
            _backupStato('Errore: ' + (e.message || e));
            ENI.UI.toast('Errore: ' + (e.message || e), 'error');
        } finally {
            _backupBtnDisabled(false);
        }
    }

    // ============================================================
    // IL MIO ACCESSO (cambio PIN personale)
    // ============================================================

    function _accessoPanelHtml() {
        var nome = (ENI.State.getUserName && ENI.State.getUserName()) || '';
        return '<div class="card mb-4">' +
                '<div class="card-header"><h3 class="card-title">Il mio accesso</h3></div>' +
                '<div class="card-body">' +
                    '<p class="text-sm text-muted" style="margin-top:0;">Cambia il PIN che usi per accedere (6 cifre).' +
                        (nome ? ' Utente: <strong>' + ENI.UI.escapeHtml(nome) + '</strong>.' : '') + '</p>' +
                    '<div style="max-width:360px;">' +
                        '<div class="form-group"><label class="form-label">PIN attuale</label>' +
                            '<input type="password" inputmode="numeric" maxlength="6" autocomplete="off" class="form-input" id="pin-attuale"></div>' +
                        '<div class="form-group"><label class="form-label">Nuovo PIN</label>' +
                            '<input type="password" inputmode="numeric" maxlength="6" autocomplete="off" class="form-input" id="pin-nuovo"></div>' +
                        '<div class="form-group"><label class="form-label">Conferma nuovo PIN</label>' +
                            '<input type="password" inputmode="numeric" maxlength="6" autocomplete="off" class="form-input" id="pin-conferma"></div>' +
                        '<button type="button" class="btn btn-primary" id="btn-cambia-pin">Aggiorna PIN</button>' +
                    '</div>' +
                '</div>' +
            '</div>';
    }

    async function _cambiaPin() {
        var attuale = (_getVal('pin-attuale') || '').trim();
        var nuovo = (_getVal('pin-nuovo') || '').trim();
        var conferma = (_getVal('pin-conferma') || '').trim();

        if (!attuale) { ENI.UI.toast('Inserisci il PIN attuale', 'error'); return; }
        if (!/^\d{6}$/.test(nuovo)) { ENI.UI.toast('Il nuovo PIN deve essere di 6 cifre', 'error'); return; }
        if (nuovo !== conferma) { ENI.UI.toast('Il nuovo PIN e la conferma non coincidono', 'error'); return; }
        if (nuovo === attuale) { ENI.UI.toast('Il nuovo PIN è uguale a quello attuale', 'error'); return; }

        var btn = document.getElementById('btn-cambia-pin');
        if (btn) btn.disabled = true;
        try {
            await ENI.API.cambiaPinCorrente(attuale, nuovo);
            ENI.UI.toast('PIN aggiornato con successo', 'success');
            _setVal('pin-attuale', '');
            _setVal('pin-nuovo', '');
            _setVal('pin-conferma', '');
        } catch (e) {
            ENI.UI.toast(e.message || 'Errore nel cambio PIN', 'error');
        } finally {
            if (btn) btn.disabled = false;
        }
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

    function _getVal(id) {
        var el = document.getElementById(id);
        return el ? el.value : '';
    }

    function _getChecked(id) {
        var el = document.getElementById(id);
        return el ? el.checked : true;
    }

    function _readForm() {
        return {
            printer_ip: _getVal('cfg-printer-ip') || '192.168.1.250',
            printer_port: parseInt(_getVal('cfg-printer-port')) || 9100,
            nome_negozio: _getVal('cfg-nome-negozio') || 'TITANWASH',
            sottotitolo: _getVal('cfg-sottotitolo'),
            indirizzo: _getVal('cfg-indirizzo'),
            telefono: _getVal('cfg-telefono'),
            partita_iva: _getVal('cfg-partita-iva'),
            email: _getVal('cfg-email'),
            sito_web: _getVal('cfg-sito-web'),
            separatore_intestazione: _getVal('cfg-separatore-intestazione'),
            footer_riga1: _getVal('cfg-footer-riga1'),
            footer_riga2: _getVal('cfg-footer-riga2'),
            footer_riga3: _getVal('cfg-footer-riga3'),
            separatore_footer: _getVal('cfg-separatore-footer'),
            mostra_operatore: _getChecked('cfg-mostra-operatore'),
            mostra_data_ora: _getChecked('cfg-mostra-data'),
            mostra_codice: _getChecked('cfg-mostra-codice'),
            mostra_subtotale: _getChecked('cfg-mostra-subtotale'),
            tipo_taglio: _getVal('cfg-tipo-taglio') || 'parziale',
            righe_prima_taglio: parseInt(_getVal('cfg-righe-taglio')) || 3,
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
        var logoSrc = cfg.logo_base64 || _layout.logo_base64;
        if (logoSrc) {
            html += '<div style="text-align:center; margin-bottom:6px;">';
            html += '<img src="' + logoSrc + '" style="max-width:160px; max-height:50px; filter:contrast(1.5);">';
            html += '</div>';
        }

        var lines = [];

        // Intestazione
        lines.push('<b style="font-size:14px;">' + centerEsc(cfg.nome_negozio || 'TITANWASH') + '</b>');
        var sottotitolo = cfg.sottotitolo || '';
        if (sottotitolo) lines.push('<span style="font-size:10px;">' + centerEsc(sottotitolo) + '</span>');
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
