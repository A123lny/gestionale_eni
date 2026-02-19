// ============================================================
// TITANWASH - Autenticazione
// Login tramite PIN, gestione sessione, logout
// ============================================================

var ENI = ENI || {};

ENI.Auth = (function() {
    'use strict';

    // --- Render Login Screen ---

    function renderLogin() {
        var app = document.getElementById('app');
        app.innerHTML =
            '<div class="login-screen">' +
                '<div class="login-card">' +
                    '<div class="login-logo"><img src="assets/Titan.png" alt="Titanwash" class="login-logo-img"></div>' +
                    '<h1 class="login-title">Titanwash</h1>' +
                    '<p class="login-subtitle">Borgo Maggiore - San Marino</p>' +
                    '<div class="form-group">' +
                        '<label class="form-label text-center">Inserisci il tuo PIN</label>' +
                        '<div class="pin-input-group">' +
                            '<input type="password" inputmode="numeric" pattern="[0-9]*" maxlength="1" class="pin-digit" data-pin="0" autocomplete="off">' +
                            '<input type="password" inputmode="numeric" pattern="[0-9]*" maxlength="1" class="pin-digit" data-pin="1" autocomplete="off">' +
                            '<input type="password" inputmode="numeric" pattern="[0-9]*" maxlength="1" class="pin-digit" data-pin="2" autocomplete="off">' +
                            '<input type="password" inputmode="numeric" pattern="[0-9]*" maxlength="1" class="pin-digit" data-pin="3" autocomplete="off">' +
                        '</div>' +
                    '</div>' +
                    '<div id="login-error" class="login-error"></div>' +
                    '<button id="btn-login" class="btn btn-primary btn-block btn-lg">Accedi</button>' +
                '</div>' +
            '</div>';

        _setupPinInputs();
        _setupLoginButton();
    }

    // --- Setup PIN Input Behavior ---

    function _setupPinInputs() {
        var digits = document.querySelectorAll('.pin-digit');

        digits.forEach(function(input, index) {
            // Auto-focus next on input
            input.addEventListener('input', function(e) {
                var val = e.target.value;
                // Solo numeri
                e.target.value = val.replace(/[^0-9]/g, '');

                if (e.target.value && index < digits.length - 1) {
                    digits[index + 1].focus();
                }

                // Se tutti compilati, prova login
                if (index === digits.length - 1 && e.target.value) {
                    _attemptLogin();
                }
            });

            // Backspace -> torna indietro
            input.addEventListener('keydown', function(e) {
                if (e.key === 'Backspace' && !e.target.value && index > 0) {
                    digits[index - 1].focus();
                    digits[index - 1].value = '';
                }

                // Enter -> login
                if (e.key === 'Enter') {
                    _attemptLogin();
                }
            });

            // Focus: seleziona contenuto
            input.addEventListener('focus', function() {
                this.select();
            });
        });

        // Auto-focus primo digit
        setTimeout(function() {
            if (digits[0]) digits[0].focus();
        }, 300);
    }

    function _setupLoginButton() {
        var btn = document.getElementById('btn-login');
        if (btn) {
            btn.addEventListener('click', function() {
                _attemptLogin();
            });
        }
    }

    // --- Attempt Login ---

    async function _attemptLogin() {
        var digits = document.querySelectorAll('.pin-digit');
        var pin = '';
        digits.forEach(function(d) { pin += d.value; });

        if (pin.length < 4) {
            _showError('Inserisci tutti i 4 numeri del PIN');
            return;
        }

        var btn = document.getElementById('btn-login');
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Accesso...';
        }

        try {
            var user = await ENI.API.loginByPin(pin);

            if (user) {
                ENI.State.setUser({
                    id: user.id,
                    username: user.username,
                    nome_completo: user.nome_completo,
                    ruolo: user.ruolo
                });

                await ENI.API.scriviLog('Login', 'Personale', user.nome_completo + ' - ' + user.ruolo);

                // Avvia app
                ENI.App.renderShell();
                ENI.Router.init();
            } else {
                _showError('PIN non valido');
                _clearPin();
            }
        } catch(e) {
            _showError('Errore di connessione. Riprova.');
            console.error('Login error:', e);
        }

        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Accedi';
        }
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

    // --- Logout ---

    async function logout() {
        var userName = ENI.State.getUserName();
        ENI.State.logout();

        try {
            // Log prima del logout completo
            if (userName) {
                await ENI.API.getClient().from('log_attivita').insert({
                    nome_utente: userName,
                    azione: 'Logout',
                    modulo: 'Personale',
                    dettagli: userName
                });
            }
        } catch(e) {}

        renderLogin();
    }

    // API pubblica
    return {
        renderLogin: renderLogin,
        logout: logout
    };
})();
