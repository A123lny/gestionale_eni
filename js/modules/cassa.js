// ============================================================
// GESTIONALE ENI - Modulo Cassa
// Chiusura giornaliera completa con riconciliazione
// ============================================================

var ENI = ENI || {};
ENI.Modules = ENI.Modules || {};

ENI.Modules.Cassa = (function() {
    'use strict';

    var _cassa = null;

    async function render(container) {
        container.innerHTML =
            '<div class="page-header">' +
                '<h1 class="page-title">\u{1F4B0} Chiusura Cassa</h1>' +
                '<span class="text-sm text-muted">' + ENI.UI.formatDataCompleta(ENI.UI.oggiISO()) + '</span>' +
            '</div>' +
            '<div id="cassa-content"><div class="flex justify-center" style="padding:2rem;"><div class="spinner"></div></div></div>';

        await _loadCassa(container);
    }

    async function _loadCassa(container) {
        try {
            _cassa = await ENI.API.getCassaOggi();
            _renderForm(container);
        } catch(e) {
            _cassa = null;
            _renderForm(container);
        }
    }

    function _renderForm(container) {
        var c = _cassa || {};
        var isChiusa = c.stato === 'chiusa';

        var contentEl = document.getElementById('cassa-content');
        if (!contentEl) return;

        contentEl.innerHTML =
            (isChiusa
                ? '<div class="stock-alert mb-4">\u{1F512} Cassa gi\u00E0 chiusa per oggi. Puoi visualizzare i dati ma non modificarli.</div>'
                : '') +

            '<form id="form-cassa">' +
                // Info giornata
                _section('\u{1F4C5} Informazioni Giornata',
                    '<div class="cassa-grid">' +
                        _cassaInput('Ora Apertura', 'ora_apertura', c.ora_apertura || '', 'time') +
                        _cassaInput('Ora Chiusura', 'ora_chiusura', c.ora_chiusura || ENI.UI.oraCorrente(), 'time') +
                    '</div>'
                ) +

                // Venduto Carburante
                _section('\u26FD Venduto Carburante',
                    '<div class="cassa-grid">' +
                        _cassaInputDoppio('Benzina 95', 'benzina95', c.benzina95_litri, c.benzina95_euro) +
                        _cassaInputDoppio('Benzina 98', 'benzina98', c.benzina98_litri, c.benzina98_euro) +
                        _cassaInputDoppio('Diesel', 'diesel', c.diesel_litri, c.diesel_euro) +
                        _cassaInputDoppio('Diesel Plus', 'diesel_plus', c.diesel_plus_litri, c.diesel_plus_euro) +
                        _cassaInputDoppio('GPL', 'gpl', c.gpl_litri, c.gpl_euro) +
                        _cassaInputDoppio('Self Notturno', 'self_notturno', c.self_notturno_litri, c.self_notturno_euro) +
                    '</div>' +
                    '<div class="text-right text-sm text-bold mt-2">Totale Carburante: <span id="tot-carburante">\u20AC 0,00</span></div>'
                ) +

                // Venduto Altro
                _section('\u{1F6D2} Venduto Altro',
                    '<div class="cassa-grid">' +
                        _cassaInput('Bar', 'venduto_bar', c.venduto_bar, 'number') +
                        _cassaInput('Olio', 'venduto_olio', c.venduto_olio, 'number') +
                        _cassaInput('Accessori', 'venduto_accessori', c.venduto_accessori, 'number') +
                        _cassaInput('AdBlue', 'venduto_adblue', c.venduto_adblue, 'number') +
                        _cassaInput('Lavaggi', 'venduto_lavaggi', c.venduto_lavaggi, 'number') +
                        _cassaInput('Buoni', 'venduto_buoni', c.venduto_buoni, 'number') +
                    '</div>' +
                    '<div class="text-right text-sm text-bold mt-2">Totale Altro: <span id="tot-altro">\u20AC 0,00</span></div>'
                ) +

                // TOTALE VENDUTO
                '<div class="cassa-totale">' +
                    '<div class="cassa-totale-label">\u{1F4B0} TOTALE VENDUTO</div>' +
                    '<div class="cassa-totale-value" id="tot-venduto">\u20AC 0,00</div>' +
                '</div>' +

                // Incassato Contanti
                _section('\u{1F4B5} Contanti',
                    '<div class="cassa-grid">' +
                        _cassaInput('Banconote', 'contanti_banconote', c.contanti_banconote, 'number') +
                        _cassaInput('Monete', 'contanti_monete', c.contanti_monete, 'number') +
                    '</div>' +
                    '<div class="text-right text-sm text-bold mt-2">Totale Contanti: <span id="tot-contanti">\u20AC 0,00</span></div>'
                ) +

                // POS BSI
                _section('\u{1F4B3} POS BSI',
                    '<div class="cassa-grid">' +
                        _cassaInput('Terminale 1', 'pos_bsi_terminale1', c.pos_bsi_terminale1, 'number') +
                        _cassaInput('Terminale 2', 'pos_bsi_terminale2', c.pos_bsi_terminale2, 'number') +
                        _cassaInput('POS 1', 'pos_bsi_pos1', c.pos_bsi_pos1, 'number') +
                        _cassaInput('SMAC', 'pos_bsi_smac', c.pos_bsi_smac, 'number') +
                    '</div>' +
                    '<div class="text-right text-sm text-bold mt-2">Totale BSI: <span id="tot-bsi">\u20AC 0,00</span></div>'
                ) +

                // POS Carisp
                _section('\u{1F4B3} POS Carisp',
                    '<div class="cassa-grid">' +
                        _cassaInput('Terminale 1', 'pos_carisp_terminale1', c.pos_carisp_terminale1, 'number') +
                        _cassaInput('Terminale 2', 'pos_carisp_terminale2', c.pos_carisp_terminale2, 'number') +
                    '</div>' +
                    '<div class="text-right text-sm text-bold mt-2">Totale Carisp: <span id="tot-carisp">\u20AC 0,00</span></div>'
                ) +

                // Altro Incassato
                _section('\u{1F3E6} Altro Incassato',
                    '<div class="cassa-grid">' +
                        _cassaInput('Self Nott. Contanti', 'self_notturno_contanti', c.self_notturno_contanti, 'number') +
                        _cassaInput('Assegni', 'assegni', c.assegni, 'number') +
                        _cassaInput('Bonifici', 'bonifici', c.bonifici, 'number') +
                    '</div>'
                ) +

                // TOTALE INCASSATO
                '<div class="cassa-totale">' +
                    '<div class="cassa-totale-label">\u{1F4B5} TOTALE INCASSATO</div>' +
                    '<div class="cassa-totale-value" id="tot-incassato">\u20AC 0,00</div>' +
                '</div>' +

                // Crediti Generati
                _section('\u23F3 Crediti Generati Oggi',
                    '<div class="cassa-grid">' +
                        _cassaInput('Pagher\u00F2 Spese Cassa', 'crediti_paghero', c.crediti_paghero, 'number') +
                        _cassaInput('Mobile Payment', 'crediti_mobile_payment', c.crediti_mobile_payment, 'number') +
                        _cassaInput('Buoni Cartacei ENI', 'crediti_buoni_eni', c.crediti_buoni_eni, 'number') +
                        _cassaInput('Voucher', 'crediti_voucher', c.crediti_voucher, 'number') +
                        _cassaInput('Bollette/Green Money', 'crediti_bollette', c.crediti_bollette, 'number') +
                    '</div>' +
                    '<div class="text-right text-sm text-bold mt-2">Totale Crediti: <span id="tot-crediti">\u20AC 0,00</span></div>'
                ) +

                // DIFFERENZA
                '<div class="cassa-differenza ok" id="cassa-diff-box">' +
                    '<div style="font-size:0.875rem; opacity:0.8;">\u2696\uFE0F DIFFERENZA CASSA</div>' +
                    '<div style="font-size:2rem; font-weight:700;" id="tot-differenza">\u20AC 0,00</div>' +
                    '<div class="text-sm" id="diff-formula">Venduto - Incassato - Crediti</div>' +
                '</div>' +

                // Note
                _section('\u{1F4DD} Note Giornata',
                    '<textarea class="form-textarea" id="cassa-note" rows="3">' + ENI.UI.escapeHtml(c.note || '') + '</textarea>'
                ) +

                // Salva
                (!isChiusa
                    ? '<button type="button" class="btn btn-primary btn-block btn-lg mt-4" id="btn-salva-cassa">' +
                        '\u{1F4BE} Salva Chiusura Cassa' +
                      '</button>'
                    : '') +
            '</form>';

        // Setup calcolo automatico
        _setupCalcoli(contentEl, isChiusa);

        // Setup salvataggio
        if (!isChiusa) {
            var btnSalva = contentEl.querySelector('#btn-salva-cassa');
            if (btnSalva) {
                btnSalva.addEventListener('click', _salvaCassa);
            }
        }
    }

    // --- Helpers HTML ---

    function _section(title, content) {
        return '<div class="cassa-section">' +
            '<div class="cassa-section-title">' + title + '</div>' +
            content +
        '</div>';
    }

    function _cassaInput(label, name, value, type) {
        type = type || 'number';
        value = value || '';
        return '<div class="cassa-row">' +
            '<span class="cassa-row-label">' + label + '</span>' +
            '<div class="cassa-row-input">' +
                '<input type="' + type + '" step="0.01" min="0" class="form-input cassa-field" ' +
                    'data-field="' + name + '" value="' + value + '">' +
            '</div>' +
        '</div>';
    }

    function _cassaInputDoppio(label, prefix, litri, euro) {
        return '<div class="cassa-row">' +
            '<span class="cassa-row-label">' + label + '</span>' +
            '<div class="cassa-row-input">' +
                '<input type="number" step="0.01" min="0" class="form-input cassa-field" ' +
                    'data-field="' + prefix + '_litri" value="' + (litri || '') + '" placeholder="Litri">' +
            '</div>' +
            '<div class="cassa-row-input">' +
                '<input type="number" step="0.01" min="0" class="form-input cassa-field" ' +
                    'data-field="' + prefix + '_euro" value="' + (euro || '') + '" placeholder="\u20AC">' +
            '</div>' +
        '</div>';
    }

    // --- Calcoli Automatici ---

    function _setupCalcoli(container, isChiusa) {
        if (isChiusa) {
            // Solo mostra i totali senza interattivita
            _ricalcola();
            return;
        }

        container.querySelectorAll('.cassa-field').forEach(function(input) {
            input.addEventListener('input', _ricalcola);
        });

        _ricalcola();
    }

    function _ricalcola() {
        var val = _getFieldValue;

        // Carburante
        var totCarburante =
            val('benzina95_euro') + val('benzina98_euro') +
            val('diesel_euro') + val('diesel_plus_euro') +
            val('gpl_euro') + val('self_notturno_euro');

        // Altro
        var totAltro =
            val('venduto_bar') + val('venduto_olio') + val('venduto_accessori') +
            val('venduto_adblue') + val('venduto_lavaggi') + val('venduto_buoni');

        // Venduto
        var totVenduto = totCarburante + totAltro;

        // Contanti
        var totContanti = val('contanti_banconote') + val('contanti_monete');

        // BSI
        var totBSI = val('pos_bsi_terminale1') + val('pos_bsi_terminale2') + val('pos_bsi_pos1') + val('pos_bsi_smac');

        // Carisp
        var totCarisp = val('pos_carisp_terminale1') + val('pos_carisp_terminale2');

        // Altro incassato
        var totAltroInc = val('self_notturno_contanti') + val('assegni') + val('bonifici');

        // Incassato
        var totIncassato = totContanti + totBSI + totCarisp + totAltroInc;

        // Crediti
        var totCrediti =
            val('crediti_paghero') + val('crediti_mobile_payment') +
            val('crediti_buoni_eni') + val('crediti_voucher') + val('crediti_bollette');

        // Differenza
        var differenza = totVenduto - totIncassato - totCrediti;

        // Aggiorna UI
        _setText('tot-carburante', ENI.UI.formatValuta(totCarburante));
        _setText('tot-altro', ENI.UI.formatValuta(totAltro));
        _setText('tot-venduto', ENI.UI.formatValuta(totVenduto));
        _setText('tot-contanti', ENI.UI.formatValuta(totContanti));
        _setText('tot-bsi', ENI.UI.formatValuta(totBSI));
        _setText('tot-carisp', ENI.UI.formatValuta(totCarisp));
        _setText('tot-incassato', ENI.UI.formatValuta(totIncassato));
        _setText('tot-crediti', ENI.UI.formatValuta(totCrediti));
        _setText('tot-differenza', ENI.UI.formatValuta(differenza));

        // Colore differenza
        var diffBox = document.getElementById('cassa-diff-box');
        if (diffBox) {
            diffBox.className = 'cassa-differenza';
            var absDiff = Math.abs(differenza);
            if (absDiff < 0.01) {
                diffBox.classList.add('ok');
            } else if (absDiff <= 50) {
                diffBox.classList.add('warning');
            } else {
                diffBox.classList.add('danger');
            }
        }

        var formulaEl = document.getElementById('diff-formula');
        if (formulaEl) {
            formulaEl.textContent =
                ENI.UI.formatValuta(totVenduto) + ' - ' +
                ENI.UI.formatValuta(totIncassato) + ' - ' +
                ENI.UI.formatValuta(totCrediti);
        }
    }

    function _getFieldValue(name) {
        var el = document.querySelector('[data-field="' + name + '"]');
        return el ? (parseFloat(el.value) || 0) : 0;
    }

    function _setText(id, text) {
        var el = document.getElementById(id);
        if (el) el.textContent = text;
    }

    // --- Salva Cassa ---

    async function _salvaCassa() {
        var ok = await ENI.UI.confirm({
            title: '\u{1F4BE} Conferma Chiusura Cassa',
            message: 'Vuoi salvare la chiusura cassa di oggi?',
            confirmText: 'Salva',
            cancelText: 'Annulla'
        });

        if (!ok) return;

        var val = _getFieldValue;

        var totCarburante = val('benzina95_euro') + val('benzina98_euro') +
            val('diesel_euro') + val('diesel_plus_euro') +
            val('gpl_euro') + val('self_notturno_euro');

        var totAltro = val('venduto_bar') + val('venduto_olio') + val('venduto_accessori') +
            val('venduto_adblue') + val('venduto_lavaggi') + val('venduto_buoni');

        var totVenduto = totCarburante + totAltro;

        var totContanti = val('contanti_banconote') + val('contanti_monete');
        var totBSI = val('pos_bsi_terminale1') + val('pos_bsi_terminale2') + val('pos_bsi_pos1') + val('pos_bsi_smac');
        var totCarisp = val('pos_carisp_terminale1') + val('pos_carisp_terminale2');
        var totAltroInc = val('self_notturno_contanti') + val('assegni') + val('bonifici');
        var totIncassato = totContanti + totBSI + totCarisp + totAltroInc;

        var totCrediti = val('crediti_paghero') + val('crediti_mobile_payment') +
            val('crediti_buoni_eni') + val('crediti_voucher') + val('crediti_bollette');

        var dati = {
            ora_apertura: document.querySelector('[data-field="ora_apertura"]').value || null,
            ora_chiusura: document.querySelector('[data-field="ora_chiusura"]').value || null,
            utente_apertura: ENI.State.getUserId(),
            utente_chiusura: ENI.State.getUserId(),
            benzina95_litri: val('benzina95_litri'), benzina95_euro: val('benzina95_euro'),
            benzina98_litri: val('benzina98_litri'), benzina98_euro: val('benzina98_euro'),
            diesel_litri: val('diesel_litri'), diesel_euro: val('diesel_euro'),
            diesel_plus_litri: val('diesel_plus_litri'), diesel_plus_euro: val('diesel_plus_euro'),
            gpl_litri: val('gpl_litri'), gpl_euro: val('gpl_euro'),
            self_notturno_litri: val('self_notturno_litri'), self_notturno_euro: val('self_notturno_euro'),
            venduto_bar: val('venduto_bar'), venduto_olio: val('venduto_olio'),
            venduto_accessori: val('venduto_accessori'), venduto_adblue: val('venduto_adblue'),
            venduto_lavaggi: val('venduto_lavaggi'), venduto_buoni: val('venduto_buoni'),
            contanti_banconote: val('contanti_banconote'), contanti_monete: val('contanti_monete'),
            pos_bsi_terminale1: val('pos_bsi_terminale1'), pos_bsi_terminale2: val('pos_bsi_terminale2'),
            pos_bsi_pos1: val('pos_bsi_pos1'), pos_bsi_smac: val('pos_bsi_smac'),
            pos_carisp_terminale1: val('pos_carisp_terminale1'), pos_carisp_terminale2: val('pos_carisp_terminale2'),
            self_notturno_contanti: val('self_notturno_contanti'),
            assegni: val('assegni'), bonifici: val('bonifici'),
            crediti_paghero: val('crediti_paghero'), crediti_mobile_payment: val('crediti_mobile_payment'),
            crediti_buoni_eni: val('crediti_buoni_eni'), crediti_voucher: val('crediti_voucher'),
            crediti_bollette: val('crediti_bollette'),
            totale_venduto: totVenduto,
            totale_incassato: totIncassato,
            totale_crediti: totCrediti,
            differenza: totVenduto - totIncassato - totCrediti,
            note: document.getElementById('cassa-note').value.trim() || null,
            stato: 'chiusa'
        };

        try {
            ENI.UI.showLoading();
            await ENI.API.salvaCassa(dati);
            ENI.UI.hideLoading();
            ENI.UI.success('Chiusura cassa salvata con successo');

            // Ricarica
            _cassa = await ENI.API.getCassaOggi();
            _renderForm(document.getElementById('main-content'));
        } catch(e) {
            ENI.UI.hideLoading();
            ENI.UI.error('Errore salvataggio: ' + e.message);
        }
    }

    return { render: render };
})();
