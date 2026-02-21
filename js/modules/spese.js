// ============================================================
// GESTIONALE ENI - Modulo Spese Cassa
// Registrazione pagamenti giornalieri in contanti
// ============================================================

var ENI = ENI || {};
ENI.Modules = ENI.Modules || {};

ENI.Modules.Spese = (function() {
    'use strict';

    var _data = '';
    var _spese = [];

    // --- Render principale ---

    async function render(container) {
        _data = ENI.UI.oggiISO();

        container.innerHTML =
            '<div class="page-header">' +
                '<h1 class="page-title">\u{1F4B8} Spese in Contanti</h1>' +
                '<span class="text-sm text-muted">Pagamenti giornalieri</span>' +
            '</div>' +
            '<div id="spese-content"><div class="flex justify-center" style="padding:2rem;"><div class="spinner"></div></div></div>';

        await _loadSpese();
    }

    // --- Carica spese dal DB ---

    async function _loadSpese() {
        var contentEl = document.getElementById('spese-content');
        if (contentEl) {
            contentEl.innerHTML = '<div class="flex justify-center" style="padding:2rem;"><div class="spinner"></div></div>';
        }
        try {
            _spese = await ENI.API.getSpeseCassa(_data);
        } catch(e) {
            _spese = [];
        }
        _renderPage();
    }

    // --- Render pagina ---

    function _renderPage() {
        var contentEl = document.getElementById('spese-content');
        if (!contentEl) return;

        var totGiorno = _spese.reduce(function(s, sp) {
            return s + Number(sp.importo || 0);
        }, 0);

        var puoScrivere = ENI.State.canWrite('spese');

        contentEl.innerHTML =
            // Filtro data
            '<div class="cassa-section">' +
                '<div class="cassa-data-row">' +
                    '<div>' +
                        '<label class="form-label">Data</label>' +
                        '<input type="date" class="form-input" id="spese-data" value="' + _data + '" max="' + ENI.UI.oggiISO() + '">' +
                    '</div>' +
                    '<div>' +
                        '<div class="text-sm text-muted">Totale spese giorno</div>' +
                        '<div style="font-size:1.5rem; font-weight:700; color:var(--color-danger);">' + ENI.UI.formatValuta(totGiorno) + '</div>' +
                    '</div>' +
                '</div>' +
            '</div>' +

            // Form nuova spesa
            (puoScrivere
                ? '<div class="cassa-section">' +
                    '<div class="cassa-section-title">\u2795 Nuova Spesa</div>' +
                    '<div class="spese-form-grid">' +
                        '<div>' +
                            '<label class="form-label">Categoria</label>' +
                            '<select class="form-select" id="spesa-categoria">' +
                                '<option value="Fornitore">Fornitore</option>' +
                                '<option value="Utenze">Utenze</option>' +
                                '<option value="Carburante">Carburante</option>' +
                                '<option value="Manutenzione">Manutenzione</option>' +
                                '<option value="Personale">Personale</option>' +
                                '<option value="Varie" selected>Varie</option>' +
                                '<option value="Altro">Altro</option>' +
                            '</select>' +
                        '</div>' +
                        '<div>' +
                            '<label class="form-label">Descrizione <span class="text-danger">*</span></label>' +
                            '<input type="text" class="form-input" id="spesa-descrizione" placeholder="Es. Fornitore caff\u00E8, bolletta gas...">' +
                        '</div>' +
                        '<div>' +
                            '<label class="form-label">Importo \u20AC <span class="text-danger">*</span></label>' +
                            '<input type="number" step="0.01" min="0.01" class="form-input" id="spesa-importo" placeholder="0,00">' +
                        '</div>' +
                    '</div>' +
                    '<div>' +
                        '<label class="form-label">Note (opzionale)</label>' +
                        '<input type="text" class="form-input" id="spesa-note" placeholder="Dettagli aggiuntivi...">' +
                    '</div>' +
                    '<button type="button" class="btn btn-primary mt-3" id="btn-aggiungi-spesa">\u{1F4BE} Aggiungi Spesa</button>' +
                '</div>'
                : '') +

            // Lista spese
            '<div class="cassa-section">' +
                '<div class="cassa-section-title">\u{1F4CB} Spese del Giorno</div>' +
                _renderLista(puoScrivere) +
            '</div>';

        // Listeners
        var dataInput = document.getElementById('spese-data');
        if (dataInput) {
            dataInput.addEventListener('change', function() {
                _data = this.value;
                _loadSpese();
            });
        }

        var btnAggiungi = document.getElementById('btn-aggiungi-spesa');
        if (btnAggiungi) {
            btnAggiungi.addEventListener('click', _aggiungiSpesa);
        }

        // Invio con Enter su importo
        var inputImporto = document.getElementById('spesa-importo');
        if (inputImporto) {
            inputImporto.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') _aggiungiSpesa();
            });
        }

        // Pulsanti elimina (event delegation)
        contentEl.addEventListener('click', function(e) {
            var btn = e.target.closest('.btn-elimina-spesa');
            if (btn) {
                var id = btn.dataset.id;
                var spesa = _spese.find(function(s) { return s.id === id; });
                if (spesa) _eliminaSpesa(id, spesa);
            }
        });
    }

    // --- Render lista ---

    function _renderLista(puoScrivere) {
        if (!_spese || _spese.length === 0) {
            return '<div class="empty-state">' +
                '<div class="empty-state-icon">\u{1F4B8}</div>' +
                '<p class="empty-state-text">Nessuna spesa registrata per questa data</p>' +
            '</div>';
        }

        var totale = 0;
        var html = '<div class="table-wrapper"><table class="table"><thead><tr>' +
            '<th>Categoria</th>' +
            '<th>Descrizione</th>' +
            '<th>Importo</th>' +
            '<th>Note</th>' +
            (puoScrivere ? '<th></th>' : '') +
        '</tr></thead><tbody>';

        _spese.forEach(function(sp) {
            totale += Number(sp.importo || 0);
            html += '<tr>' +
                '<td><span class="badge badge-gray">' + ENI.UI.escapeHtml(sp.categoria || 'Varie') + '</span></td>' +
                '<td>' + ENI.UI.escapeHtml(sp.descrizione) + '</td>' +
                '<td style="color:var(--color-danger); font-weight:600;">' + ENI.UI.formatValuta(sp.importo) + '</td>' +
                '<td class="text-muted text-sm">' + ENI.UI.escapeHtml(sp.note || '\u2014') + '</td>' +
                (puoScrivere
                    ? '<td><button type="button" class="btn btn-sm btn-elimina-spesa" ' +
                        'data-id="' + sp.id + '" ' +
                        'style="color:var(--color-danger); border:1px solid var(--color-danger); background:none; border-radius:var(--radius-md); padding:2px 8px; cursor:pointer;">' +
                        '\u00D7</button></td>'
                    : '') +
            '</tr>';
        });

        html += '</tbody><tfoot><tr>' +
            '<td colspan="2"><strong>TOTALE</strong></td>' +
            '<td style="color:var(--color-danger); font-weight:700;">' + ENI.UI.formatValuta(totale) + '</td>' +
            '<td colspan="' + (puoScrivere ? '2' : '1') + '"></td>' +
        '</tr></tfoot></table></div>';

        return html;
    }

    // --- Aggiungi spesa ---

    async function _aggiungiSpesa() {
        var categoria = (document.getElementById('spesa-categoria') || {}).value || 'Varie';
        var descrizione = ((document.getElementById('spesa-descrizione') || {}).value || '').trim();
        var importo = parseFloat((document.getElementById('spesa-importo') || {}).value) || 0;
        var note = ((document.getElementById('spesa-note') || {}).value || '').trim();

        if (!descrizione) {
            ENI.UI.warning('Inserisci una descrizione per la spesa');
            document.getElementById('spesa-descrizione').focus();
            return;
        }
        if (importo <= 0) {
            ENI.UI.warning('Inserisci un importo valido maggiore di zero');
            document.getElementById('spesa-importo').focus();
            return;
        }

        try {
            ENI.UI.showLoading();
            await ENI.API.salvaSpesa({
                data: _data,
                categoria: categoria,
                descrizione: descrizione,
                importo: importo,
                note: note || null
            });
            ENI.UI.hideLoading();
            ENI.UI.success('Spesa aggiunta con successo');

            // Reset form
            var desc = document.getElementById('spesa-descrizione');
            var imp = document.getElementById('spesa-importo');
            var noteEl = document.getElementById('spesa-note');
            if (desc) desc.value = '';
            if (imp) imp.value = '';
            if (noteEl) noteEl.value = '';

            await _loadSpese();
        } catch(e) {
            ENI.UI.hideLoading();
            ENI.UI.error('Errore: ' + e.message);
        }
    }

    // --- Elimina spesa ---

    async function _eliminaSpesa(id, spesa) {
        var ok = await ENI.UI.confirm({
            title: 'Elimina Spesa',
            message: 'Eliminare "' + ENI.UI.escapeHtml(spesa.descrizione) + '" (' + ENI.UI.formatValuta(spesa.importo) + ')?',
            confirmText: 'Elimina',
            cancelText: 'Annulla'
        });

        if (!ok) return;

        try {
            ENI.UI.showLoading();
            await ENI.API.eliminaSpesa(id, spesa);
            ENI.UI.hideLoading();
            ENI.UI.success('Spesa eliminata');
            await _loadSpese();
        } catch(e) {
            ENI.UI.hideLoading();
            ENI.UI.error('Errore: ' + e.message);
        }
    }

    return { render: render };
})();
