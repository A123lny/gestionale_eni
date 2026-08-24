// ============================================================
// GESTIONALE ENI - Modulo Personale
// Gestione dipendenti e ruoli (solo Admin)
// ============================================================

var ENI = ENI || {};
ENI.Modules = ENI.Modules || {};

ENI.Modules.Personale = (function() {
    'use strict';

    var _personale = [];
    var _mostraArchiviati = false;

    async function render(container) {
        container.innerHTML =
            '<div class="page-header">' +
                '<h1 class="page-title">\u{1F464} Personale</h1>' +
                '<button class="btn btn-primary" id="btn-nuovo-dipendente">\u2795 Nuovo Dipendente</button>' +
            '</div>' +

            // Tabella permessi
            '<div class="card mb-4">' +
                '<div class="card-header"><h3 class="card-title">Matrice Permessi</h3></div>' +
                '<div class="table-wrapper" style="border:none;">' +
                    '<table class="table">' +
                        '<thead><tr><th>Modulo</th><th>Super Admin</th><th>Admin</th><th>Cassiere</th><th>Lavaggi</th></tr></thead>' +
                        '<tbody>' +
                            _permessiRow('Dashboard', true, false, false, false) +
                            _permessiRow('Clienti', true, true, 'R', 'R') +
                            _permessiRow('Cassa', true, true, true, false) +
                            _permessiRow('Crediti', true, true, true, false) +
                            _permessiRow('Lavaggi', true, true, true, true) +
                            _permessiRow('Magazzino', true, true, true, false) +
                            _permessiRow('Personale', true, true, false, false) +
                            _permessiRow('Manutenzioni', true, true, false, false) +
                            _permessiRow('Log', true, true, false, false) +
                        '</tbody>' +
                    '</table>' +
                '</div>' +
            '</div>' +

            '<div id="personale-list"></div>';

        container.querySelector('#btn-nuovo-dipendente').addEventListener('click', _showFormNuovo);
        ENI.UI.delegate(container, 'click', '[data-edit-id]', function(e, el) {
            _showFormModifica(el.dataset.editId);
        });
        ENI.UI.delegate(container, 'click', '[data-archivia-id]', function(e, el) {
            _archivia(el.dataset.archiviaId);
        });
        ENI.UI.delegate(container, 'click', '[data-ripristina-id]', function(e, el) {
            _ripristina(el.dataset.ripristinaId);
        });
        ENI.UI.delegate(container, 'click', '[data-toggle-archiviati]', function() {
            _mostraArchiviati = !_mostraArchiviati;
            _renderList();
        });

        await _loadPersonale();
    }

    function _permessiRow(modulo, superadmin, admin, cassiere, lavaggi) {
        function _cell(val) {
            if (val === true) return '<td class="text-center">\u2705</td>';
            if (val === 'R') return '<td class="text-center">\u{1F441}\uFE0F</td>';
            return '<td class="text-center">\u274C</td>';
        }
        return '<tr><td>' + modulo + '</td>' + _cell(superadmin) + _cell(admin) + _cell(cassiere) + _cell(lavaggi) + '</tr>';
    }

    async function _loadPersonale() {
        try {
            _personale = await ENI.API.getPersonale();
            _renderList();
        } catch(e) {
            ENI.UI.error('Errore caricamento personale');
        }
    }

    function _ruoloLabel(p) { return p.super_admin ? 'Super Admin' : p.ruolo; }

    function _renderList() {
        var listEl = document.getElementById('personale-list');
        if (!listEl) return;

        var attivi = _personale.filter(function(p) { return p.attivo; });
        var archiviati = _personale.filter(function(p) { return !p.attivo; });
        var utenteId = ENI.State.getUserId();

        // --- Elenco attivi ---
        var html = '<div class="table-wrapper"><table class="table">' +
            '<thead><tr><th>Username</th><th>Nome</th><th>Ruolo</th><th>PIN</th><th>Azioni</th></tr></thead><tbody>';
        attivi.forEach(function(p) {
            var azioni = '<button class="btn btn-sm btn-ghost" data-edit-id="' + p.id + '" title="Modifica">\u{1F4DD}</button>';
            if (p.id !== utenteId) {
                azioni += ' <button class="btn btn-sm btn-ghost" data-archivia-id="' + p.id + '" title="Archivia">\u{1F5C4}\uFE0F</button>';
            }
            html +=
                '<tr>' +
                    '<td class="text-sm">' + ENI.UI.escapeHtml(p.username) + '</td>' +
                    '<td><strong>' + ENI.UI.escapeHtml(p.nome_completo) + '</strong></td>' +
                    '<td>' + ENI.UI.escapeHtml(_ruoloLabel(p)) + '</td>' +
                    '<td class="text-muted">****</td>' +
                    '<td>' + azioni + '</td>' +
                '</tr>';
        });
        html += '</tbody></table></div>';

        // --- Sezione archiviati ---
        html += '<div style="margin-top:var(--space-4);">' +
            '<button class="btn btn-outline btn-sm" data-toggle-archiviati>' +
                (_mostraArchiviati ? '\u25BE' : '\u25B8') + ' Archiviati (' + archiviati.length + ')' +
            '</button>';
        if (_mostraArchiviati && archiviati.length) {
            html += '<div class="table-wrapper" style="margin-top:var(--space-2);"><table class="table">' +
                '<thead><tr><th>Username</th><th>Nome</th><th>Ruolo</th><th>Azioni</th></tr></thead><tbody>';
            archiviati.forEach(function(p) {
                html +=
                    '<tr style="opacity:0.7;">' +
                        '<td class="text-sm">' + ENI.UI.escapeHtml(p.username) + '</td>' +
                        '<td>' + ENI.UI.escapeHtml(p.nome_completo) + '</td>' +
                        '<td>' + ENI.UI.escapeHtml(_ruoloLabel(p)) + '</td>' +
                        '<td><button class="btn btn-sm btn-outline" data-ripristina-id="' + p.id + '">Ripristina</button></td>' +
                    '</tr>';
            });
            html += '</tbody></table></div>';
        }
        html += '</div>';

        listEl.innerHTML = html;
    }

    async function _archivia(id) {
        var p = _personale.find(function(x) { return x.id === id; });
        if (!p) return;
        var ok = await ENI.UI.confirm('Archiviare "' + p.nome_completo + '"? Sparira\' dall\'elenco ma restera\' nello storico e potra\' essere ripristinato.');
        if (!ok) return;
        try {
            await ENI.API.aggiornaPersonale(id, { attivo: false, nome_completo: p.nome_completo });
            ENI.UI.success(p.nome_completo + ' archiviato');
            await _loadPersonale();
        } catch(e) {
            ENI.UI.error('Errore durante l\'archiviazione');
        }
    }

    async function _ripristina(id) {
        var p = _personale.find(function(x) { return x.id === id; });
        if (!p) return;
        try {
            await ENI.API.aggiornaPersonale(id, { attivo: true, nome_completo: p.nome_completo });
            ENI.UI.success(p.nome_completo + ' ripristinato');
            await _loadPersonale();
        } catch(e) {
            ENI.UI.error('Errore durante il ripristino');
        }
    }

    function _showFormNuovo() {
        var body =
            '<form>' +
                '<div class="form-row">' +
                    '<div class="form-group">' +
                        '<label class="form-label form-label-required">Username</label>' +
                        '<input type="text" class="form-input" id="pers-username">' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label class="form-label form-label-required">Nome Completo</label>' +
                        '<input type="text" class="form-input" id="pers-nome">' +
                    '</div>' +
                '</div>' +
                '<div class="form-row">' +
                    '<div class="form-group">' +
                        '<label class="form-label form-label-required">Ruolo</label>' +
                        '<select class="form-select" id="pers-ruolo">' +
                            '<option value="Admin">Admin</option>' +
                            '<option value="Cassiere" selected>Cassiere</option>' +
                            '<option value="Lavaggi">Operatore Lavaggi</option>' +
                        '</select>' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label class="form-label form-label-required">PIN (6 cifre)</label>' +
                        '<input type="text" class="form-input" id="pers-pin" maxlength="6" pattern="[0-9]{6}" inputmode="numeric" placeholder="es. 123456">' +
                    '</div>' +
                '</div>' +
                '<div class="form-row">' +
                    '<div class="form-group">' +
                        '<label class="form-label">Email</label>' +
                        '<input type="email" class="form-input" id="pers-email">' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label class="form-label">Telefono</label>' +
                        '<input type="tel" class="form-input" id="pers-telefono">' +
                    '</div>' +
                '</div>' +
            '</form>';

        var modal = ENI.UI.showModal({
            title: '\u2795 Nuovo Dipendente',
            body: body,
            footer:
                '<button class="btn btn-outline" data-modal-close>Annulla</button>' +
                '<button class="btn btn-primary" id="btn-salva-pers">\u{1F4BE} Salva</button>'
        });

        modal.querySelector('#btn-salva-pers').addEventListener('click', async function() {
            var username = modal.querySelector('#pers-username').value.trim();
            var nome = modal.querySelector('#pers-nome').value.trim();
            var pin = modal.querySelector('#pers-pin').value.trim();

            if (!username || !nome || !/^[0-9]{6}$/.test(pin)) {
                ENI.UI.warning('Compila i campi obbligatori. Il PIN deve essere di 6 cifre.');
                return;
            }

            var btn = modal.querySelector('#btn-salva-pers');
            btn.disabled = true;
            try {
                // Crea utente Auth + riga personale (via Edge Function admin)
                await ENI.API.creaStaffConLogin({
                    username: username.toLowerCase(),
                    nome_completo: nome,
                    ruolo: modal.querySelector('#pers-ruolo').value,
                    pin: pin,
                    email: modal.querySelector('#pers-email').value.trim() || null,
                    telefono: modal.querySelector('#pers-telefono').value.trim() || null
                });
                ENI.UI.closeModal(modal);
                ENI.UI.success('Dipendente "' + nome + '" creato con login');
                await _loadPersonale();
            } catch(e) {
                btn.disabled = false;
                ENI.UI.error('Errore: ' + e.message);
            }
        });
    }

    async function _showFormModifica(id) {
        var persona = _personale.find(function(p) { return p.id === id; });
        if (!persona) return;

        var body =
            '<form>' +
                '<div class="form-row">' +
                    '<div class="form-group">' +
                        '<label class="form-label">Nome Completo</label>' +
                        '<input type="text" class="form-input" id="edit-nome" value="' + ENI.UI.escapeHtml(persona.nome_completo) + '">' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label class="form-label">Ruolo</label>' +
                        '<select class="form-select" id="edit-ruolo">' +
                            '<option value="Admin"' + (persona.ruolo === 'Admin' ? ' selected' : '') + '>Admin</option>' +
                            '<option value="Cassiere"' + (persona.ruolo === 'Cassiere' ? ' selected' : '') + '>Cassiere</option>' +
                            '<option value="Lavaggi"' + (persona.ruolo === 'Lavaggi' ? ' selected' : '') + '>Operatore Lavaggi</option>' +
                        '</select>' +
                    '</div>' +
                '</div>' +
                '<div class="form-row">' +
                    '<div class="form-group">' +
                        '<label class="form-label">Nuovo PIN (6 cifre, vuoto = non cambia)</label>' +
                        '<input type="text" class="form-input" id="edit-pin" maxlength="6" pattern="[0-9]{6}" inputmode="numeric" placeholder="******">' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label class="form-label">Attivo</label>' +
                        '<label class="form-check"><input type="checkbox" id="edit-attivo"' + (persona.attivo ? ' checked' : '') + '> Attivo</label>' +
                    '</div>' +
                '</div>' +
            '</form>';

        var modal = ENI.UI.showModal({
            title: '\u{1F4DD} Modifica ' + persona.nome_completo,
            body: body,
            footer:
                '<button class="btn btn-outline" data-modal-close>Annulla</button>' +
                '<button class="btn btn-primary" id="btn-update-pers">\u{1F4BE} Aggiorna</button>'
        });

        modal.querySelector('#btn-update-pers').addEventListener('click', async function() {
            var dati = {
                nome_completo: modal.querySelector('#edit-nome').value.trim(),
                ruolo: modal.querySelector('#edit-ruolo').value,
                attivo: modal.querySelector('#edit-attivo').checked
            };

            var newPin = modal.querySelector('#edit-pin').value.trim();
            if (newPin && !/^[0-9]{6}$/.test(newPin)) {
                ENI.UI.warning('Il PIN deve essere di 6 cifre');
                return;
            }

            var btn = modal.querySelector('#btn-update-pers');
            btn.disabled = true;
            try {
                // Dati anagrafici (client)
                await ENI.API.aggiornaPersonale(id, dati);
                // Cambio PIN (Edge Function admin) se inserito
                if (newPin) {
                    if (!persona.auth_user_id) throw new Error('Questo dipendente non ha un login collegato: ricrealo dal pulsante "Nuovo Dipendente".');
                    await ENI.API.cambiaPinStaff(persona.auth_user_id, newPin);
                }
                ENI.UI.closeModal(modal);
                ENI.UI.success('Dipendente aggiornato');
                await _loadPersonale();
            } catch(e) {
                btn.disabled = false;
                ENI.UI.error('Errore: ' + e.message);
            }
        });
    }

    return { render: render };
})();
