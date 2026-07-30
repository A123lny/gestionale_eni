// ============================================================
// TITANWASH - Autenticazione
// Login via Supabase Auth: si sceglie il nome, poi il PIN a 6 cifre.
// ============================================================

var ENI = ENI || {};

ENI.Auth = (function() {
    'use strict';

    var PIN_LEN = 6;
    var _emailSelezionata = null; // email tecnica del dipendente scelto

    // --- Render Login: schermata scelta nome ---

    function renderLogin() {
        _emailSelezionata = null;
        var app = document.getElementById('app');
        app.innerHTML =
            '<div class="login-screen">' +
                '<div class="login-card">' +
                    '<div class="login-logo"><img src="assets/logo_ritagliato.png" alt="Titanwash" class="login-logo-img"></div>' +
                    '<h1 class="login-title">Titanwash</h1>' +
                    '<p class="login-subtitle">Borgo Maggiore - San Marino</p>' +
                    '<div id="login-names"><p class="text-center" style="color: var(--color-text-muted);">Caricamento...</p></div>' +
                    '<div style="text-align: center; margin-top: var(--space-4);">' +
                        '<button type="button" id="btn-area-clienti" style="background: none; border: none; color: var(--color-text-muted); font-size: 0.85rem; cursor: pointer; padding: 8px 16px; text-decoration: underline;">Area Clienti</button>' +
                    '</div>' +
                '</div>' +
            '</div>';

        _setupAreaClienti();
        _loadNames();
    }

    async function _loadNames() {
        var box = document.getElementById('login-names');
        if (!box) return;
        try {
            var lista = await ENI.API.getStaffLoginList();
            if (!lista || lista.length === 0) {
                box.innerHTML = '<p class="text-center" style="color: var(--color-danger);">Nessun operatore disponibile</p>';
                return;
            }
            var html = '<p class="form-label text-center">Chi sei?</p>';
            lista.forEach(function(u) {
                html += '<button type="button" class="btn btn-secondary btn-block js-login-name" ' +
                        'data-email="' + _attr(u.email_tecnica) + '" ' +
                        'style="margin-bottom: var(--space-2);">' + _esc(u.nome_completo) + '</button>';
            });
            box.innerHTML = html;
            var btns = box.querySelectorAll('.js-login-name');
            btns.forEach(function(b) {
                b.addEventListener('click', function() {
                    _renderPinScreen(b.getAttribute('data-email'), b.textContent);
                });
            });
        } catch (e) {
            box.innerHTML = '<p class="text-center" style="color: var(--color-danger);">Errore di connessione</p>';
            console.error('Errore caricamento nomi:', e);
        }
    }

    // --- Render schermata PIN per il nome scelto ---

    function _renderPinScreen(email, nome) {
        _emailSelezionata = email;
        var app = document.getElementById('app');
        var inputs = '';
        for (var i = 0; i < PIN_LEN; i++) {
            inputs += '<input type="password" inputmode="numeric" pattern="[0-9]*" maxlength="1" class="pin-digit" data-pin="' + i + '" autocomplete="off">';
        }
        app.innerHTML =
            '<div class="login-screen">' +
                '<div class="login-card">' +
                    '<div class="login-logo"><img src="assets/logo_ritagliato.png" alt="Titanwash" class="login-logo-img"></div>' +
                    '<h1 class="login-title">' + _esc(nome) + '</h1>' +
                    '<div class="form-group">' +
                        '<label class="form-label text-center">Inserisci il tuo PIN</label>' +
                        '<div class="pin-input-group">' + inputs + '</div>' +
                    '</div>' +
                    '<div id="login-error" class="login-error"></div>' +
                    '<button id="btn-login" class="btn btn-primary btn-block btn-lg">Accedi</button>' +
                    '<div style="text-align: center; margin-top: var(--space-3);">' +
                        '<button type="button" id="btn-indietro" style="background: none; border: none; color: var(--color-text-muted); font-size: 0.85rem; cursor: pointer; padding: 8px 16px;">&larr; Cambia operatore</button>' +
                    '</div>' +
                '</div>' +
            '</div>';

        _setupPinInputs();
        var btn = document.getElementById('btn-login');
        if (btn) btn.addEventListener('click', _attemptLogin);
        var back = document.getElementById('btn-indietro');
        if (back) back.addEventListener('click', renderLogin);
    }

    // --- Setup PIN Input Behavior ---

    function _setupPinInputs() {
        var digits = document.querySelectorAll('.pin-digit');

        digits.forEach(function(input, index) {
            input.addEventListener('input', function(e) {
                e.target.value = e.target.value.replace(/[^0-9]/g, '');
                if (e.target.value && index < digits.length - 1) {
                    digits[index + 1].focus();
                }
                if (index === digits.length - 1 && e.target.value) {
                    _attemptLogin();
                }
            });

            input.addEventListener('keydown', function(e) {
                if (e.key === 'Backspace' && !e.target.value && index > 0) {
                    digits[index - 1].focus();
                    digits[index - 1].value = '';
                }
                if (e.key === 'Enter') {
                    _attemptLogin();
                }
            });

            input.addEventListener('focus', function() { this.select(); });
        });

        setTimeout(function() { if (digits[0]) digits[0].focus(); }, 300);
    }

    // --- Attempt Login ---

    async function _attemptLogin() {
        var digits = document.querySelectorAll('.pin-digit');
        var pin = '';
        digits.forEach(function(d) { pin += d.value; });

        if (pin.length < PIN_LEN) {
            _showError('Inserisci tutte le ' + PIN_LEN + ' cifre del PIN');
            return;
        }
        if (!_emailSelezionata) {
            renderLogin();
            return;
        }

        var btn = document.getElementById('btn-login');
        if (btn) { btn.disabled = true; btn.textContent = 'Accesso...'; }

        try {
            var user = await ENI.API.loginConPin(_emailSelezionata, pin);

            if (user) {
                ENI.State.setUser({
                    id: user.id,
                    username: user.username,
                    nome_completo: user.nome_completo,
                    ruolo: user.ruolo
                });

                await ENI.API.scriviLog('Login', 'Personale', user.nome_completo + ' - ' + user.ruolo);

                ENI.App.renderShell();
                ENI.Router.init();
                _checkPrenotazioniPendenti();
            } else {
                _showError('PIN non valido');
                _clearPin();
            }
        } catch (e) {
            _showError('Errore di connessione. Riprova.');
            console.error('Login error:', e);
        }

        if (btn) { btn.disabled = false; btn.textContent = 'Accedi'; }
    }

    function _showError(msg) {
        var el = document.getElementById('login-error');
        if (el) el.textContent = msg;
    }

    function _clearPin() {
        var digits = document.querySelectorAll('.pin-digit');
        digits.forEach(function(d) { d.value = ''; });
        if (digits[0]) digits[0].focus();
    }

    function _setupAreaClienti() {
        var btn = document.getElementById('btn-area-clienti');
        if (btn) {
            btn.addEventListener('click', function() {
                window.location.hash = '#/area-cliente';
            });
        }
    }

    // --- Logout ---

    async function logout() {
        var userName = ENI.State.getUserName();
        ENI.State.logout();

        try {
            if (userName) {
                await ENI.API.getClient().from('log_attivita').insert({
                    nome_utente: userName,
                    azione: 'Logout',
                    modulo: 'Personale',
                    dettagli: userName
                });
            }
        } catch (e) {}

        try { await ENI.API.logoutAuth(); } catch (e) {}

        renderLogin();
    }

    // --- Check Prenotazioni Pendenti (toast al login) ---

    async function _checkPrenotazioniPendenti() {
        try {
            var pren = await ENI.API.getPrenotazioniLavaggio({ stato: 'in_attesa' });
            if (pren && pren.length > 0) {
                var oggi = ENI.UI.oggiISO();
                var perOggi = pren.filter(function(p) { return p.data_richiesta === oggi; });
                var msg = pren.length + ' prenotazion' + (pren.length === 1 ? 'e' : 'i') + ' da confermare';
                if (perOggi.length > 0) {
                    msg += ' (' + perOggi.length + ' per oggi)';
                }
                ENI.UI.warning(msg);
            }
        } catch (e) {
            // Silenzioso, non bloccare il login
        }
    }

    // --- Helpers escaping ---

    function _esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    function _attr(s) {
        return _esc(s).replace(/"/g, '&quot;');
    }

    // API pubblica
    return {
        renderLogin: renderLogin,
        logout: logout
    };
})();
