// ============================================================
// GESTIONALE ENI - Modulo Manutenzioni
// Storico interventi attrezzature + scadenzario
// ============================================================

var ENI = ENI || {};
ENI.Modules = ENI.Modules || {};

ENI.Modules.Manutenzioni = (function() {
    'use strict';

    var _manutenzioni = [];

    async function render(container) {
        container.innerHTML =
            '<div class="page-header">' +
                '<h1 class="page-title">\u{1F527} Manutenzioni</h1>' +
                '<button class="btn btn-primary" id="btn-nuova-man">\u2795 Nuovo Intervento</button>' +
            '</div>' +
            '<div id="man-alerts"></div>' +
            '<div id="man-list"></div>';

        container.querySelector('#btn-nuova-man').addEventListener('click', _showForm);
        await _loadManutenzioni();
    }

    async function _loadManutenzioni() {
        try {
            _manutenzioni = await ENI.API.getManutenzioni();
            _renderAlerts();
            _renderList();
        } catch(e) {
            ENI.UI.error('Errore caricamento manutenzioni');
        }
    }

    function _renderAlerts() {
        var el = document.getElementById('man-alerts');
        if (!el) return;

        var oggi = new Date();
        var scadute = _manutenzioni.filter(function(m) {
            return m.prossima_scadenza && new Date(m.prossima_scadenza) < oggi;
        });

        if (scadute.length === 0) {
            el.innerHTML = '';
            return;
        }

        el.innerHTML =
            '<div class="stock-alert">' +
                '\u26A0\uFE0F <strong>' + scadute.length + ' scadenz' + (scadute.length === 1 ? 'a superata' : 'e superate') + ':</strong> ' +
                scadute.map(function(m) {
                    return ENI.UI.escapeHtml(m.attrezzatura) + ' (' + ENI.UI.formatData(m.prossima_scadenza) + ')';
                }).join(', ') +
            '</div>';
    }

    function _renderList() {
        var listEl = document.getElementById('man-list');
        if (!listEl) return;

        if (_manutenzioni.length === 0) {
            listEl.innerHTML =
                '<div class="empty-state">' +
                    '<div class="empty-state-icon">\u{1F527}</div>' +
                    '<p class="empty-state-text">Nessuna manutenzione registrata</p>' +
                '</div>';
            return;
        }

        var oggi = new Date();

        var html = '<div class="table-wrapper"><table class="table">' +
            '<thead><tr><th>Data</th><th>Attrezzatura</th><th>Tipo</th><th>Costo</th><th>Prossima</th></tr></thead><tbody>';

        _manutenzioni.forEach(function(m) {
            var scaduta = m.prossima_scadenza && new Date(m.prossima_scadenza) < oggi;

            html +=
                '<tr>' +
                    '<td class="text-sm">' + ENI.UI.formatData(m.data) + '</td>' +
                    '<td><strong>' + ENI.UI.escapeHtml(m.attrezzatura) + '</strong>' +
                        (m.descrizione ? '<br><span class="text-xs text-muted">' + ENI.UI.escapeHtml(m.descrizione) + '</span>' : '') +
                    '</td>' +
                    '<td>' + ENI.UI.escapeHtml(m.tipo_intervento || '-') + '</td>' +
                    '<td>' + (m.costo ? ENI.UI.formatValuta(m.costo) : '-') + '</td>' +
                    '<td class="' + (scaduta ? 'scadenza-superata' : '') + '">' +
                        (m.prossima_scadenza ? ENI.UI.formatDataCompleta(m.prossima_scadenza) + (scaduta ? ' \u26A0\uFE0F' : '') : '-') +
                    '</td>' +
                '</tr>';
        });

        html += '</tbody></table></div>';
        listEl.innerHTML = html;
    }

    function _showForm() {
        var body =
            '<form>' +
                '<div class="form-row">' +
                    '<div class="form-group">' +
                        '<label class="form-label form-label-required">Data Intervento</label>' +
                        '<input type="date" class="form-input" id="man-data" value="' + ENI.UI.oggiISO() + '">' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label class="form-label form-label-required">Attrezzatura</label>' +
                        '<input type="text" class="form-input" id="man-attrezz" placeholder="es. Idropulitrice 1">' +
                    '</div>' +
                '</div>' +
                '<div class="form-row">' +
                    '<div class="form-group">' +
                        '<label class="form-label">Tipo Intervento</label>' +
                        '<select class="form-select" id="man-tipo">' +
                            '<option value="Ordinaria">Ordinaria</option>' +
                            '<option value="Straordinaria">Straordinaria</option>' +
                        '</select>' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label class="form-label">Costo \u20AC</label>' +
                        '<input type="number" step="0.01" min="0" class="form-input" id="man-costo">' +
                    '</div>' +
                '</div>' +
                '<div class="form-row">' +
                    '<div class="form-group">' +
                        '<label class="form-label">Fornitore</label>' +
                        '<input type="text" class="form-input" id="man-fornitore">' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label class="form-label">Prossima Scadenza</label>' +
                        '<input type="date" class="form-input" id="man-scadenza">' +
                    '</div>' +
                '</div>' +
                '<div class="form-group">' +
                    '<label class="form-label">Descrizione</label>' +
                    '<textarea class="form-textarea" id="man-desc" rows="2"></textarea>' +
                '</div>' +
            '</form>';

        var modal = ENI.UI.showModal({
            title: '\u2795 Nuovo Intervento',
            body: body,
            footer:
                '<button class="btn btn-outline" data-modal-close>Annulla</button>' +
                '<button class="btn btn-primary" id="btn-salva-man">\u{1F4BE} Salva</button>'
        });

        modal.querySelector('#btn-salva-man').addEventListener('click', async function() {
            var attrezzatura = modal.querySelector('#man-attrezz').value.trim();
            var data = modal.querySelector('#man-data').value;

            if (!attrezzatura || !data) {
                ENI.UI.warning('Compila data e attrezzatura');
                return;
            }

            try {
                await ENI.API.salvaManutenzione({
                    data: data,
                    attrezzatura: attrezzatura,
                    tipo_intervento: modal.querySelector('#man-tipo').value,
                    costo: parseFloat(modal.querySelector('#man-costo').value) || null,
                    fornitore: modal.querySelector('#man-fornitore').value.trim() || null,
                    prossima_scadenza: modal.querySelector('#man-scadenza').value || null,
                    descrizione: modal.querySelector('#man-desc').value.trim() || null
                });
                ENI.UI.closeModal(modal);
                ENI.UI.success('Manutenzione registrata');
                await _loadManutenzioni();
            } catch(e) {
                ENI.UI.error('Errore: ' + e.message);
            }
        });
    }

    return { render: render };
})();
