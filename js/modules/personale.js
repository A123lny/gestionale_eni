// ============================================================
// GESTIONALE ENI - Modulo Personale
// Gestione dipendenti e ruoli (solo Admin)
// ============================================================

var ENI = ENI || {};
ENI.Modules = ENI.Modules || {};

ENI.Modules.Personale = (function() {
    'use strict';

    var _personale = [];

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
                        '<thead><tr><th>Modulo</th><th>Admin</th><th>Cassiere</th><th>Lavaggi</th></tr></thead>' +
                        '<tbody>' +
                            _permessiRow('Dashboard', true, true, true) +
                            _permessiRow('Clienti', true, 'R', 'R') +
                            _permessiRow('Cassa', true, true, false) +
                            _permessiRow('Crediti', true, true, false) +
                            _permessiRow('Lavaggi', true, true, true) +
                            _permessiRow('Magazzino', true, true, false) +
                            _permessiRow('Personale', true, false, false) +
                            _permessiRow('Manutenzioni', true, false, false) +
                            _permessiRow('Log', true, false, false) +
                        '</tbody>' +
                    '</table>' +
                '</div>' +
            '</div>' +

            '<div id="personale-list"></div>';

        container.querySelector('#btn-nuovo-dipendente').addEventListener('click', _showFormNuovo);
        ENI.UI.delegate(container, 'click', '[data-edit-id]', function(e, el) {
            _showFormModifica(el.dataset.editId);
        });

        await _loadPersonale();
    }

    function _permessiRow(modulo, admin, cassiere, lavaggi) {
        function _cell(val) {
            if (val === true) return '<td class="text-center">\u2705</td>';
            if (val === 'R') return '<td class="text-center">\u{1F441}\uFE0F</td>';
            return '<td class="text-center">\u274C</td>';
        }
        return '<tr><td>' + modulo + '</td>' + _cell(admin) + _cell(cassiere) + _cell(lavaggi) + '</tr>';
    }

    async function _loadPersonale() {
        try {
            _personale = await ENI.API.getPersonale();
            _renderList();
        } catch(e) {
            ENI.UI.error('Errore caricamento personale');
        }
    }

    function _renderList() {
        var listEl = document.getElementById('personale-list');
        if (!listEl) return;

        var html = '<div class="table-wrapper"><table class="table">' +
            '<thead><tr><th>Username</th><th>Nome</th><th>Ruolo</th><th>PIN</th><th>Attivo</th><th>Azioni</th></tr></thead><tbody>';

        _personale.forEach(function(p) {
            html +=
                '<tr>' +
                    '<td class="text-sm">' + ENI.UI.escapeHtml(p.username) + '</td>' +
                    '<td><strong>' + ENI.UI.escapeHtml(p.nome_completo) + '</strong></td>' +
                    '<td>' + ENI.UI.escapeHtml(p.ruolo) + '</td>' +
                    '<td class="text-muted">****</td>' +
                    '<td>' + (p.attivo ? '\u2705' : '\u274C') + '</td>' +
                    '<td><button class="btn btn-sm btn-ghost" data-edit-id="' + p.id + '">\u{1F4DD}</button></td>' +
                '</tr>';
        });

        html += '</tbody></table></div>';
        listEl.innerHTML = html;
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
                        '<label class="form-label form-label-required">PIN (4 cifre)</label>' +
                        '<input type="text" class="form-input" id="pers-pin" maxlength="4" pattern="[0-9]{4}" inputmode="numeric">' +
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

            if (!username || !nome || !pin || pin.length !== 4) {
                ENI.UI.warning('Compila tutti i campi obbligatori. PIN deve essere 4 cifre.');
                return;
            }

            try {
                await ENI.API.salvaPersonale({
                    username: username.toLowerCase(),
                    nome_completo: nome,
                    ruolo: modal.querySelector('#pers-ruolo').value,
                    pin: pin,
                    email: modal.querySelector('#pers-email').value.trim() || null,
                    telefono: modal.querySelector('#pers-telefono').value.trim() || null,
                    attivo: true
                });
                ENI.UI.closeModal(modal);
                ENI.UI.success('Dipendente "' + nome + '" aggiunto');
                await _loadPersonale();
            } catch(e) {
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
                        '<label class="form-label">Nuovo PIN (lascia vuoto per non cambiare)</label>' +
                        '<input type="text" class="form-input" id="edit-pin" maxlength="4" inputmode="numeric" placeholder="****">' +
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
            if (newPin) {
                if (newPin.length !== 4) {
                    ENI.UI.warning('PIN deve essere 4 cifre');
                    return;
                }
                dati.pin = newPin;
            }

            try {
                await ENI.API.aggiornaPersonale(id, dati);
                ENI.UI.closeModal(modal);
                ENI.UI.success('Dipendente aggiornato');
                await _loadPersonale();
            } catch(e) {
                ENI.UI.error('Errore: ' + e.message);
            }
        });
    }

    return { render: render };
})();
