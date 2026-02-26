// ============================================================
// TITANWASH - Area Cliente (Portale Digitale)
// Login, saldo, storico movimenti, prenotazione lavaggi
// ============================================================

ENI.Modules.AreaCliente = (function() {
    'use strict';

    var _activeSection = 'dashboard';

    // ============================================================
    // LOGIN
    // ============================================================

    function renderLogin(container) {
        container.innerHTML =
            '<div class="cliente-login-wrapper">' +
                '<div class="cliente-login-card">' +
                    '<div style="text-align: center; margin-bottom: var(--space-4);">' +
                        '<img src="assets/logo_ritagliato.png" alt="Titanwash" style="height: 60px; margin-bottom: var(--space-2);" onerror="this.style.display=\'none\'">' +
                        '<h2 style="color: var(--color-primary); margin: 0;">Area Clienti</h2>' +
                        '<p class="text-muted">Accedi per visualizzare il tuo saldo e prenotare lavaggi</p>' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label class="form-label">Email</label>' +
                        '<input type="email" class="form-input" id="cliente-email" placeholder="La tua email" autocomplete="email">' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label class="form-label">Password</label>' +
                        '<input type="password" class="form-input" id="cliente-password" placeholder="La tua password" autocomplete="current-password">' +
                    '</div>' +
                    '<div id="cliente-login-error" style="display: none; color: var(--color-danger); text-align: center; margin-bottom: var(--space-2); font-size: 0.9rem;"></div>' +
                    '<button class="btn btn-primary" id="btn-cliente-login" style="width: 100%; margin-top: var(--space-2);">Accedi</button>' +
                    '<div style="text-align: center; margin-top: var(--space-4);">' +
                        '<a href="#/" style="color: var(--color-text-muted); font-size: 0.85rem;">Sei un operatore? Accedi con PIN</a>' +
                    '</div>' +
                '</div>' +
            '</div>';

        var emailInput = document.getElementById('cliente-email');
        var passInput = document.getElementById('cliente-password');
        var btnLogin = document.getElementById('btn-cliente-login');
        var errorEl = document.getElementById('cliente-login-error');

        emailInput.focus();

        function doLogin() {
            var email = emailInput.value.trim();
            var password = passInput.value;

            if (!email || !password) {
                errorEl.textContent = 'Inserisci email e password';
                errorEl.style.display = 'block';
                return;
            }

            btnLogin.disabled = true;
            btnLogin.textContent = 'Accesso in corso...';
            errorEl.style.display = 'none';

            ENI.API.loginCliente(email, password).then(function(result) {
                if (result && result.success) {
                    ENI.State.setCliente(result);
                    window.location.hash = '#/area-cliente/dashboard';
                } else {
                    errorEl.textContent = (result && result.error) || 'Credenziali non valide';
                    errorEl.style.display = 'block';
                    btnLogin.disabled = false;
                    btnLogin.textContent = 'Accedi';
                }
            }).catch(function(e) {
                errorEl.textContent = 'Errore di connessione';
                errorEl.style.display = 'block';
                btnLogin.disabled = false;
                btnLogin.textContent = 'Accedi';
            });
        }

        btnLogin.addEventListener('click', doLogin);
        passInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') doLogin();
        });
        emailInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') passInput.focus();
        });
    }

    // ============================================================
    // SHELL CLIENTE
    // ============================================================

    function renderShell(container) {
        var cliente = ENI.State.getCliente();
        var nome = cliente ? cliente.nome : 'Cliente';

        container.innerHTML =
            '<div class="cliente-shell">' +
                '<header class="cliente-header">' +
                    '<div class="cliente-header-inner">' +
                        '<div class="cliente-header-left">' +
                            '<img src="assets/logo_ritagliato.png" alt="Titanwash" style="height: 28px;" onerror="this.style.display=\'none\'">' +
                        '</div>' +
                        '<div class="cliente-header-center">' +
                            '<span class="cliente-header-nome">Ciao, ' + ENI.UI.escapeHtml(nome) + '!</span>' +
                        '</div>' +
                        '<div class="cliente-header-right">' +
                            '<button class="btn btn-sm btn-outline" id="btn-cliente-logout" style="font-size: 0.75rem; padding: 4px 10px; white-space: nowrap;">Esci</button>' +
                        '</div>' +
                    '</div>' +
                '</header>' +
                '<main id="cliente-content" class="cliente-main"></main>' +
                '<nav class="cliente-bottom-nav">' +
                    '<button class="cliente-nav-item' + (_activeSection === 'dashboard' ? ' active' : '') + '" data-section="dashboard">' +
                        '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>' +
                        '<span>Home</span>' +
                    '</button>' +
                    '<button class="cliente-nav-item' + (_activeSection === 'saldo' ? ' active' : '') + '" data-section="saldo">' +
                        '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>' +
                        '<span>Saldo</span>' +
                    '</button>' +
                    '<button class="cliente-nav-item' + (_activeSection === 'prenota' ? ' active' : '') + '" data-section="prenota">' +
                        '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>' +
                        '<span>Prenota</span>' +
                    '</button>' +
                '</nav>' +
            '</div>';

        // Logout con conferma
        document.getElementById('btn-cliente-logout').addEventListener('click', async function() {
            var conferma = await ENI.UI.confirm('Vuoi uscire dall\'area clienti?');
            if (conferma) {
                ENI.State.logoutCliente();
                window.location.hash = '#/area-cliente';
            }
        });

        // Nav
        container.addEventListener('click', function(e) {
            var navItem = e.target.closest('.cliente-nav-item');
            if (navItem && navItem.dataset.section) {
                _activeSection = navItem.dataset.section;
                window.location.hash = '#/area-cliente/' + _activeSection;
            }
        });
    }

    function updateNav() {
        document.querySelectorAll('.cliente-nav-item').forEach(function(item) {
            item.classList.toggle('active', item.dataset.section === _activeSection);
        });
    }

    // ============================================================
    // DASHBOARD
    // ============================================================

    async function renderDashboard(container) {
        _activeSection = 'dashboard';
        updateNav();

        var cliente = ENI.State.getCliente();
        container.innerHTML = '<div class="flex justify-center" style="padding: 2rem;"><div class="spinner"></div></div>';

        try {
            // Refresh saldo dal DB
            var clienteData = await ENI.API.getClientePortaleById(cliente.id);
            if (clienteData) {
                cliente.saldo = clienteData.saldo;
                ENI.State.setCliente(cliente);
            }

            var movimenti = await ENI.API.getMovimentiSaldo(cliente.id, { limit: 5 });

            var movHtml = '';
            if (movimenti.length === 0) {
                movHtml = '<p class="text-muted" style="text-align: center;">Nessun movimento recente</p>';
            } else {
                movimenti.forEach(function(m) {
                    var isPositive = m.importo >= 0;
                    var icon = isPositive ? '\u2B06' : '\u2B07';
                    var color = isPositive ? 'var(--color-success)' : 'var(--color-danger)';
                    var importoStr = (isPositive ? '+' : '') + ENI.UI.formatValuta(m.importo);
                    movHtml +=
                        '<div class="cliente-movement-row">' +
                            '<div class="cliente-movement-left">' +
                                '<span class="cliente-movement-icon" style="color: ' + color + ';">' + icon + '</span>' +
                                '<div>' +
                                    '<div class="cliente-movement-desc">' + ENI.UI.escapeHtml(m.descrizione || m.tipo) + '</div>' +
                                    '<div class="cliente-movement-date">' + ENI.UI.formatData(m.created_at) + '</div>' +
                                '</div>' +
                            '</div>' +
                            '<div class="cliente-movement-amount" style="color: ' + color + ';">' + importoStr + '</div>' +
                        '</div>';
                });
            }

            container.innerHTML =
                '<div class="cliente-balance-card">' +
                    '<div class="cliente-balance-label">Il tuo saldo</div>' +
                    '<div class="cliente-balance-amount">' + ENI.UI.formatValuta(cliente.saldo) + '</div>' +
                    '<div class="cliente-balance-sub">Utilizzabile per acquisti e lavaggi</div>' +
                '</div>' +
                '<div class="cliente-quick-actions">' +
                    '<button class="btn btn-outline cliente-quick-btn" data-section="saldo">Storico Movimenti</button>' +
                    '<button class="btn btn-outline cliente-quick-btn" data-section="prenota">Prenota Lavaggio</button>' +
                '</div>' +
                '<div class="card" style="margin-top: var(--space-4);">' +
                    '<div class="card-header"><h3>Ultimi Movimenti</h3></div>' +
                    '<div class="card-body">' + movHtml + '</div>' +
                '</div>';

            // Quick action nav
            container.querySelectorAll('.cliente-quick-btn').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    _activeSection = btn.dataset.section;
                    window.location.hash = '#/area-cliente/' + _activeSection;
                });
            });

        } catch(e) {
            container.innerHTML = '<p class="text-danger" style="padding: var(--space-4);">Errore caricamento: ' + ENI.UI.escapeHtml(e.message) + '</p>';
        }
    }

    // ============================================================
    // SALDO E MOVIMENTI
    // ============================================================

    async function renderSaldo(container) {
        _activeSection = 'saldo';
        updateNav();

        var cliente = ENI.State.getCliente();
        container.innerHTML = '<div class="flex justify-center" style="padding: 2rem;"><div class="spinner"></div></div>';

        try {
            var clienteData = await ENI.API.getClientePortaleById(cliente.id);
            if (clienteData) {
                cliente.saldo = clienteData.saldo;
                ENI.State.setCliente(cliente);
            }

            var movimenti = await ENI.API.getMovimentiSaldo(cliente.id, { limit: 100 });

            var movHtml = '';
            if (movimenti.length === 0) {
                movHtml = '<div class="empty-state"><p class="empty-state-text">Nessun movimento</p></div>';
            } else {
                movimenti.forEach(function(m) {
                    var isPositive = m.importo >= 0;
                    var icon = isPositive ? '\u2B06' : '\u2B07';
                    var color = isPositive ? 'var(--color-success)' : 'var(--color-danger)';
                    var importoStr = (isPositive ? '+' : '') + ENI.UI.formatValuta(m.importo);
                    movHtml +=
                        '<div class="cliente-movement-row">' +
                            '<div class="cliente-movement-left">' +
                                '<span class="cliente-movement-icon" style="color: ' + color + ';">' + icon + '</span>' +
                                '<div>' +
                                    '<div class="cliente-movement-desc">' + ENI.UI.escapeHtml(m.descrizione || m.tipo) + '</div>' +
                                    '<div class="cliente-movement-date">' + ENI.UI.formatData(m.created_at) + '</div>' +
                                '</div>' +
                            '</div>' +
                            '<div style="text-align: right;">' +
                                '<div class="cliente-movement-amount" style="color: ' + color + ';">' + importoStr + '</div>' +
                                '<div class="cliente-movement-saldo">Saldo: ' + ENI.UI.formatValuta(m.saldo_dopo) + '</div>' +
                            '</div>' +
                        '</div>';
                });
            }

            container.innerHTML =
                '<div class="cliente-balance-card" style="margin-bottom: var(--space-4);">' +
                    '<div class="cliente-balance-label">Saldo attuale</div>' +
                    '<div class="cliente-balance-amount">' + ENI.UI.formatValuta(cliente.saldo) + '</div>' +
                '</div>' +
                '<div class="card">' +
                    '<div class="card-header"><h3>Storico Movimenti</h3></div>' +
                    '<div class="card-body">' + movHtml + '</div>' +
                '</div>';

        } catch(e) {
            container.innerHTML = '<p class="text-danger" style="padding: var(--space-4);">Errore: ' + ENI.UI.escapeHtml(e.message) + '</p>';
        }
    }

    // ============================================================
    // PRENOTA LAVAGGIO
    // ============================================================

    async function renderPrenota(container) {
        _activeSection = 'prenota';
        updateNav();

        var cliente = ENI.State.getCliente();

        // Carica listino e prenotazioni esistenti
        try {
            var listino = await ENI.API.getListino();
            var prenotazioni = await ENI.API.getPrenotazioniLavaggio({ cliente_portale_id: cliente.id });

            // Prossimi 7 giorni
            var giorni = [];
            for (var i = 0; i <= 7; i++) {
                var d = new Date();
                d.setDate(d.getDate() + i);
                var iso = d.toISOString().split('T')[0];
                var label = d.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });
                giorni.push({ value: iso, label: label });
            }

            var giorniOptions = giorni.map(function(g) {
                return '<option value="' + g.value + '">' + g.label + '</option>';
            }).join('');

            var listinoOptions = listino.map(function(l) {
                return '<option value="' + ENI.UI.escapeHtml(l.tipo_lavaggio) + '" data-prezzo="' + l.prezzo_standard + '">' +
                    ENI.UI.escapeHtml(l.tipo_lavaggio) + ' - ' + ENI.UI.formatValuta(l.prezzo_standard) + '</option>';
            }).join('');

            // Prenotazioni esistenti
            var prenHtml = '';
            if (prenotazioni.length > 0) {
                prenotazioni.forEach(function(p) {
                    var statoCls = '';
                    switch(p.stato) {
                        case 'in_attesa': statoCls = 'badge-warning'; break;
                        case 'confermata': statoCls = 'badge-info'; break;
                        case 'completata': statoCls = 'badge-success'; break;
                        case 'rifiutata': statoCls = 'badge-danger'; break;
                        case 'annullata': statoCls = 'badge-gray'; break;
                    }
                    var fasciaLabel = p.fascia_oraria || '';
                    // Vecchi valori compatibilità
                    if (fasciaLabel === 'mattina') fasciaLabel = 'Mattina';
                    else if (fasciaLabel === 'pomeriggio') fasciaLabel = 'Pomeriggio';
                    else if (fasciaLabel === 'qualsiasi') fasciaLabel = 'Qualsiasi';
                    // Nuovi slot tipo "08:30" → "ore 8:30"
                    else if (/^\d{2}:\d{2}$/.test(fasciaLabel)) fasciaLabel = 'ore ' + fasciaLabel;

                    prenHtml +=
                        '<div class="cliente-booking-card">' +
                            '<div class="cliente-booking-info">' +
                                '<strong>' + ENI.UI.formatData(p.data_richiesta) + '</strong> - ' +
                                fasciaLabel +
                                '<br>' + ENI.UI.escapeHtml(p.tipo_lavaggio) +
                                (p.veicolo ? ' - ' + ENI.UI.escapeHtml(p.veicolo) : '') +
                            '</div>' +
                            '<span class="badge ' + statoCls + '">' + (p.stato || '').replace('_', ' ') + '</span>' +
                        '</div>';
                });
            }

            // Genera slot orari da 8:30 a 17:30 (ogni ora)
            var slotOrari = _getSlotOrari(giorni[0].value);

            container.innerHTML =
                '<div class="card">' +
                    '<div class="card-header"><h3>Prenota un Lavaggio</h3></div>' +
                    '<div class="card-body">' +
                        '<div class="form-group">' +
                            '<label class="form-label form-label-required">Data</label>' +
                            '<select class="form-select" id="pren-data">' + giorniOptions + '</select>' +
                        '</div>' +
                        '<div class="form-group">' +
                            '<label class="form-label form-label-required">Orario</label>' +
                            '<select class="form-select" id="pren-fascia">' + slotOrari + '</select>' +
                        '</div>' +
                        '<div class="form-group">' +
                            '<label class="form-label form-label-required">Tipo lavaggio</label>' +
                            '<select class="form-select" id="pren-tipo">' + listinoOptions + '</select>' +
                        '</div>' +
                        '<div class="form-group">' +
                            '<label class="form-label">Veicolo (targa o descrizione)</label>' +
                            '<input type="text" class="form-input" id="pren-veicolo" placeholder="Es: AB123CD o Fiat 500 bianca">' +
                        '</div>' +
                        '<div class="form-group">' +
                            '<label class="form-label">Note aggiuntive</label>' +
                            '<textarea class="form-input" id="pren-note" rows="2" placeholder="Richieste particolari..."></textarea>' +
                        '</div>' +
                        '<button class="btn btn-primary" id="btn-invia-prenotazione" style="width: 100%;">Invia Prenotazione</button>' +
                    '</div>' +
                '</div>' +
                (prenHtml ? '<div class="card" style="margin-top: var(--space-4);"><div class="card-header"><h3>Le tue prenotazioni</h3></div><div class="card-body">' + prenHtml + '</div></div>' : '');

            // Aggiorna slot quando cambia data
            document.getElementById('pren-data').addEventListener('change', function() {
                var sel = document.getElementById('pren-fascia');
                sel.innerHTML = _getSlotOrari(this.value);
            });

            document.getElementById('btn-invia-prenotazione').addEventListener('click', async function() {
                var data = document.getElementById('pren-data').value;
                var fascia = document.getElementById('pren-fascia').value;
                var tipo = document.getElementById('pren-tipo').value;
                var veicolo = document.getElementById('pren-veicolo').value.trim();
                var note = document.getElementById('pren-note').value.trim();

                if (!data || !tipo) {
                    ENI.UI.warning('Seleziona data e tipo lavaggio');
                    return;
                }

                // Prezzo dal listino
                var selectedOpt = document.getElementById('pren-tipo').selectedOptions[0];
                var prezzo = selectedOpt ? parseFloat(selectedOpt.dataset.prezzo) : null;

                try {
                    await ENI.API.creaPrenotazioneLavaggio({
                        cliente_portale_id: cliente.id,
                        data_richiesta: data,
                        fascia_oraria: fascia,
                        tipo_lavaggio: tipo,
                        prezzo_previsto: prezzo,
                        veicolo: veicolo || null,
                        note: note || null,
                        stato: 'in_attesa'
                    });

                    ENI.UI.success('Prenotazione inviata! Riceverai conferma.');
                    renderPrenota(container);
                } catch(e) {
                    ENI.UI.error('Errore: ' + e.message);
                }
            });

        } catch(e) {
            container.innerHTML = '<p class="text-danger" style="padding: var(--space-4);">Errore: ' + ENI.UI.escapeHtml(e.message) + '</p>';
        }
    }

    // ============================================================
    // HELPER: Genera slot orari 1h (8:30 - 17:30)
    // ============================================================

    function _getSlotOrari(dataSelezionata) {
        var slots = [];
        var oggi = new Date().toISOString().split('T')[0];
        var isOggi = dataSelezionata === oggi;
        var oraAdesso = new Date();

        // Slot ogni ora: 08:30, 09:30, 10:30, ..., 17:30
        for (var h = 8; h <= 17; h++) {
            var hh = (h < 10 ? '0' : '') + h;
            var value = hh + ':30';
            var hFine = h + 1;
            var hhFine = (hFine < 10 ? '0' : '') + hFine;
            var label = value + ' - ' + hhFine + ':30';

            var disabled = false;
            if (isOggi) {
                var slotDate = new Date();
                slotDate.setHours(h, 30, 0, 0);
                if (slotDate.getTime() - oraAdesso.getTime() < 3600000) disabled = true;
            }

            slots.push('<option value="' + value + '"' + (disabled ? ' disabled' : '') + '>' +
                label + (disabled ? ' (non disponibile)' : '') + '</option>');
        }

        return slots.join('');
    }

    // API pubblica
    return {
        renderLogin: renderLogin,
        renderShell: renderShell,
        renderDashboard: renderDashboard,
        renderSaldo: renderSaldo,
        renderPrenota: renderPrenota
    };
})();
