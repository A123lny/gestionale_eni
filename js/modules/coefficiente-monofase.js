// ============================================================
// TITANWASH - Modulo Coefficiente Monofase Gasolio
// Calcolo mensile monofase media su acquisti gasolio
// ============================================================

var ENI = ENI || {};
ENI.Modules = ENI.Modules || {};

ENI.Modules.CoefficienteMonofase = (function() {
    'use strict';

    // Costanti
    var TABELLA_FATTURE = 'fatture_acquisto_gasolio';
    var TABELLA_COEFFICIENTI = 'coefficiente_monofase_mensile';
    var ALIQUOTA_IVA = ENI.Config.ALIQUOTA_IVA_MONOFASE || 0.21;
    var ACCISA_DEFAULT = ENI.Config.ACCISA_GASOLIO || 0.59320;
    var MAX_FATTURE = 25;

    // Nomi mesi italiani
    var MESI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
                'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];

    // Stato modulo
    var _container = null;
    var _meseCorrente = null;   // Date primo giorno del mese selezionato
    var _fatture = [];
    var _coefficienteMese = null;
    var _editingId = null;

    // ============================================================
    // RENDER PRINCIPALE
    // ============================================================

    async function render(container) {
        _container = container;

        // Default: mese corrente
        var oggi = new Date();
        _meseCorrente = new Date(oggi.getFullYear(), oggi.getMonth(), 1);

        container.innerHTML =
            '<div class="page-header">' +
                '<h1 class="page-title">Coefficiente Monofase</h1>' +
                '<div class="page-header-actions">' +
                    '<select id="cm-mese-select" class="form-select" style="min-width:180px;"></select>' +
                '</div>' +
            '</div>' +
            '<div id="cm-content">' +
                '<div class="flex justify-center" style="padding:2rem;"><div class="spinner"></div></div>' +
            '</div>';

        _renderMeseSelector();
        _setupMeseListener();
        await _loadMese();
    }

    // ============================================================
    // SELETTORE MESE
    // ============================================================

    function _renderMeseSelector() {
        var select = document.getElementById('cm-mese-select');
        if (!select) return;

        var html = '';
        var oggi = new Date();
        // Mostra ultimi 24 mesi + mese corrente
        for (var i = 0; i < 24; i++) {
            var d = new Date(oggi.getFullYear(), oggi.getMonth() - i, 1);
            var val = d.toISOString().slice(0, 10);
            var label = MESI[d.getMonth()] + ' ' + d.getFullYear();
            var selected = (d.getFullYear() === _meseCorrente.getFullYear() && d.getMonth() === _meseCorrente.getMonth()) ? ' selected' : '';
            html += '<option value="' + val + '"' + selected + '>' + label + '</option>';
        }
        select.innerHTML = html;
    }

    function _setupMeseListener() {
        var select = document.getElementById('cm-mese-select');
        if (!select) return;
        select.addEventListener('change', function() {
            var parts = this.value.split('-');
            _meseCorrente = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, 1);
            _loadMese();
        });
    }

    // ============================================================
    // CARICAMENTO DATI
    // ============================================================

    async function _loadMese() {
        var content = document.getElementById('cm-content');
        if (!content) return;
        content.innerHTML = '<div class="flex justify-center" style="padding:2rem;"><div class="spinner"></div></div>';

        try {
            var meseRef = _meseCorrente.toISOString().slice(0, 10);

            // Carica fatture del mese
            _fatture = await ENI.API.getAll(TABELLA_FATTURE, {
                filters: [{ op: 'eq', col: 'mese_riferimento', val: meseRef }],
                order: { col: 'numero_progressivo', asc: true }
            });

            // Carica coefficiente mensile
            var coeffRes = await ENI.API.getAll(TABELLA_COEFFICIENTI, {
                filters: [{ op: 'eq', col: 'mese_riferimento', val: meseRef }],
                limit: 1
            });
            _coefficienteMese = coeffRes && coeffRes.length > 0 ? coeffRes[0] : null;

            _renderContent(content);
        } catch(e) {
            content.innerHTML =
                '<div class="empty-state">' +
                    '<p class="empty-state-text">Errore nel caricamento: ' + ENI.UI.escapeHtml(e.message) + '</p>' +
                '</div>';
        }
    }

    // ============================================================
    // RENDER CONTENUTO
    // ============================================================

    function _renderContent(content) {
        var meseLabel = MESI[_meseCorrente.getMonth()] + ' ' + _meseCorrente.getFullYear();
        var isChiuso = _coefficienteMese && _coefficienteMese.stato === 'chiuso';
        var totali = _calcolaTotali();

        var html =
            // Card intestazione
            '<div class="card" style="margin-bottom:var(--space-4); background: linear-gradient(135deg, var(--color-primary-light), var(--bg-card));">' +
                '<div class="card-body" style="text-align:center;">' +
                    '<h2 style="margin:0 0 var(--space-2) 0; font-size:var(--font-size-lg);">CALCOLO DELLA MONOFASE MEDIA SUL CARBURANTE</h2>' +
                    '<p style="margin:0; color:var(--text-secondary);">Carburante: <strong>Gasolio</strong> &mdash; Mese di: <strong>' + meseLabel + '</strong>' +
                    (isChiuso ? ' &mdash; <span class="badge badge-success">CHIUSO</span>' : ' &mdash; <span class="badge badge-warning">APERTO</span>') +
                    '</p>' +
                '</div>' +
            '</div>';

        // Card coefficiente risultato
        html +=
            '<div class="card" style="margin-bottom:var(--space-4); border: 2px solid var(--color-primary);">' +
                '<div class="card-body" style="text-align:center; padding:var(--space-5);">' +
                    '<div style="font-size:var(--font-size-sm); color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:var(--space-2);">Coefficiente Monofase Media del Mese</div>' +
                    '<div style="font-size:2.5rem; font-weight:700; color:var(--color-primary);">' +
                        (totali.totaleLitriComm > 0 ? _formatCoeff(totali.coefficiente) : '&mdash;') +
                    '</div>' +
                    '<div style="font-size:var(--font-size-sm); color:var(--text-secondary); margin-top:var(--space-1);">' +
                        'Totale monofase / Totale litri commerciali' +
                        (totali.totaleLitriComm > 0 ? ' = ' + _formatEuro(totali.totaleMonofase) + ' / ' + _formatNumero(totali.totaleLitriComm) : '') +
                    '</div>' +
                '</div>' +
            '</div>';

        // Azioni
        if (!isChiuso) {
            html +=
                '<div style="display:flex; gap:var(--space-3); margin-bottom:var(--space-4); flex-wrap:wrap;">' +
                    '<button class="btn btn-primary" id="cm-btn-aggiungi"' + (_fatture.length >= MAX_FATTURE ? ' disabled' : '') + '>' +
                        '+ Aggiungi Fattura' +
                        (_fatture.length >= MAX_FATTURE ? ' (max 25)' : '') +
                    '</button>' +
                    '<button class="btn btn-outline" id="cm-btn-chiudi" style="margin-left:auto;"' + (_fatture.length === 0 ? ' disabled' : '') + '>' +
                        'Chiudi Mese' +
                    '</button>' +
                '</div>';
        } else {
            html +=
                '<div style="display:flex; gap:var(--space-3); margin-bottom:var(--space-4); flex-wrap:wrap;">' +
                    '<button class="btn btn-outline" id="cm-btn-riapri">Riapri Mese</button>' +
                '</div>';
        }

        // Form aggiunta/modifica (nascosto)
        html += '<div id="cm-form-wrapper" style="display:none; margin-bottom:var(--space-4);"></div>';

        // Tabella fatture
        html += _renderTabella(totali);

        // Riepilogo totali
        html += _renderRiepilogoTotali(totali);

        content.innerHTML = html;
        _setupContentListeners(isChiuso);
    }

    // ============================================================
    // TABELLA FATTURE
    // ============================================================

    function _renderTabella(totali) {
        if (_fatture.length === 0) {
            return '<div class="card"><div class="card-body"><div class="empty-state">' +
                '<p class="empty-state-text">Nessuna fattura di acquisto inserita per questo mese</p>' +
                '<p style="color:var(--text-secondary); font-size:var(--font-size-sm);">Clicca "Aggiungi Fattura" per iniziare</p>' +
                '</div></div></div>';
        }

        var html =
            '<div class="card"><div class="card-body" style="overflow-x:auto;">' +
            '<table class="table" style="min-width:900px;">' +
                '<thead><tr>' +
                    '<th style="width:40px">#</th>' +
                    '<th>Data Ft.</th>' +
                    '<th class="text-right" style="background:#e8f5e9;">Imponibile</th>' +
                    '<th class="text-right" style="background:#e8f5e9;">Lt. Comm.</th>' +
                    '<th class="text-right" style="background:#e8f5e9;">Monof. IVA Imp.</th>' +
                    '<th class="text-right" style="background:#fff9c4;">Lt. Fiscali</th>' +
                    '<th class="text-right" style="background:#fff9c4;">Accisa</th>' +
                    '<th class="text-right" style="background:#fff9c4;">Monof. IVA Acc.</th>' +
                    '<th class="text-right" style="background:#e0f7fa;">Tot. Monofase</th>' +
                    '<th class="text-right" style="background:#e0f7fa;">Coeff.</th>' +
                    '<th style="width:80px"></th>' +
                '</tr></thead>' +
                '<tbody>';

        _fatture.forEach(function(f) {
            var calc = _calcolaRiga(f);
            html +=
                '<tr>' +
                    '<td>' + f.numero_progressivo + '</td>' +
                    '<td>' + _formatData(f.data_fattura) + '</td>' +
                    '<td class="text-right" style="background:#f1f8e9;">' + _formatEuro(f.imponibile_fattura) + '</td>' +
                    '<td class="text-right" style="background:#f1f8e9;">' + _formatNumero(f.litri_commerciali) + '</td>' +
                    '<td class="text-right" style="background:#f1f8e9;">' + _formatEuro(calc.monofaseIvaImp) + '</td>' +
                    '<td class="text-right" style="background:#fffde7;">' + _formatNumero(f.litri_fiscali) + '</td>' +
                    '<td class="text-right" style="background:#fffde7;">' + _formatAccisa(f.accisa_per_litro) + '</td>' +
                    '<td class="text-right" style="background:#fffde7;">' + _formatEuro(calc.monofaseIvaAcc) + '</td>' +
                    '<td class="text-right" style="background:#e0f7fa; font-weight:600;">' + _formatEuro(calc.totMonofase) + '</td>' +
                    '<td class="text-right" style="background:#e0f7fa; font-weight:700;">' + _formatCoeff(calc.coeffRiga) + '</td>' +
                    '<td class="text-right">' +
                        '<button class="btn-icon cm-btn-edit" data-id="' + f.id + '" title="Modifica"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>' +
                        '<button class="btn-icon cm-btn-delete" data-id="' + f.id + '" title="Elimina" style="color:var(--color-danger);"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>' +
                    '</td>' +
                '</tr>';
        });

        // Riga totali
        html +=
            '<tr style="font-weight:700; background:var(--color-gray-50);">' +
                '<td colspan="2">TOTALI</td>' +
                '<td class="text-right">' + _formatEuro(totali.totaleImponibile) + '</td>' +
                '<td class="text-right">' + _formatNumero(totali.totaleLitriComm) + '</td>' +
                '<td class="text-right">' + _formatEuro(totali.totaleMonofaseIvaImp) + '</td>' +
                '<td colspan="2"></td>' +
                '<td class="text-right">' + _formatEuro(totali.totaleMonofaseIvaAcc) + '</td>' +
                '<td class="text-right" style="color:var(--color-primary);">' + _formatEuro(totali.totaleMonofase) + '</td>' +
                '<td class="text-right" style="color:var(--color-primary); font-size:1.1em;">' +
                    (totali.totaleLitriComm > 0 ? _formatCoeff(totali.coefficiente) : '&mdash;') +
                '</td>' +
                '<td></td>' +
            '</tr>';

        html += '</tbody></table></div></div>';
        return html;
    }

    // ============================================================
    // RIEPILOGO TOTALI
    // ============================================================

    function _renderRiepilogoTotali(totali) {
        if (_fatture.length === 0) return '';

        return '<div class="stats-grid" style="margin-top:var(--space-4);">' +
            '<div class="stat-card">' +
                '<div class="stat-label">Fatture inserite</div>' +
                '<div class="stat-value">' + _fatture.length + ' / ' + MAX_FATTURE + '</div>' +
            '</div>' +
            '<div class="stat-card">' +
                '<div class="stat-label">Totale imponibile</div>' +
                '<div class="stat-value">' + _formatEuro(totali.totaleImponibile) + '</div>' +
            '</div>' +
            '<div class="stat-card">' +
                '<div class="stat-label">Totale litri commerciali</div>' +
                '<div class="stat-value">' + _formatNumero(totali.totaleLitriComm) + '</div>' +
            '</div>' +
            '<div class="stat-card">' +
                '<div class="stat-label">Totale monofase</div>' +
                '<div class="stat-value" style="color:var(--color-primary);">' + _formatEuro(totali.totaleMonofase) + '</div>' +
            '</div>' +
        '</div>';
    }

    // ============================================================
    // FORM AGGIUNTA / MODIFICA
    // ============================================================

    function _renderForm(fattura) {
        var isEdit = !!fattura;
        var f = fattura || {};

        return '<div class="card" style="border:2px solid var(--color-primary);">' +
            '<div class="card-body">' +
                '<h3 style="margin:0 0 var(--space-4) 0;">' + (isEdit ? 'Modifica Fattura #' + f.numero_progressivo : 'Nuova Fattura di Acquisto') + '</h3>' +
                '<div class="form-grid" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:var(--space-3);">' +
                    '<div class="form-group">' +
                        '<label class="form-label">Data fattura</label>' +
                        '<input type="date" class="form-input" id="cm-f-data" value="' + (f.data_fattura || '') + '" required>' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label class="form-label">Imponibile fattura (&euro;)</label>' +
                        '<input type="number" class="form-input" id="cm-f-imponibile" step="0.01" min="0" value="' + (f.imponibile_fattura || '') + '" placeholder="0.00" required>' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label class="form-label">Litri commerciali</label>' +
                        '<input type="number" class="form-input" id="cm-f-litri-comm" min="1" value="' + (f.litri_commerciali || '') + '" placeholder="0" required>' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label class="form-label">Litri fiscali</label>' +
                        '<input type="number" class="form-input" id="cm-f-litri-fisc" min="0" value="' + (f.litri_fiscali != null ? f.litri_fiscali : '') + '" placeholder="0" required>' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label class="form-label">Accisa (&euro;/lt)</label>' +
                        '<input type="number" class="form-input" id="cm-f-accisa" step="0.00001" min="0" value="' + (f.accisa_per_litro || ACCISA_DEFAULT) + '">' +
                    '</div>' +
                '</div>' +
                // Anteprima calcolo in tempo reale
                '<div id="cm-form-preview" style="margin-top:var(--space-3); padding:var(--space-3); background:var(--color-gray-50); border-radius:var(--radius-md);"></div>' +
                '<div style="display:flex; gap:var(--space-3); margin-top:var(--space-4);">' +
                    '<button class="btn btn-primary" id="cm-f-salva">' + (isEdit ? 'Salva Modifiche' : 'Inserisci Fattura') + '</button>' +
                    '<button class="btn btn-outline" id="cm-f-annulla">Annulla</button>' +
                '</div>' +
            '</div>' +
        '</div>';
    }

    function _showForm(fattura) {
        var wrapper = document.getElementById('cm-form-wrapper');
        if (!wrapper) return;

        _editingId = fattura ? fattura.id : null;
        wrapper.innerHTML = _renderForm(fattura);
        wrapper.style.display = 'block';
        wrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });

        // Preview in tempo reale
        var inputs = ['cm-f-imponibile', 'cm-f-litri-comm', 'cm-f-litri-fisc', 'cm-f-accisa'];
        inputs.forEach(function(id) {
            var el = document.getElementById(id);
            if (el) el.addEventListener('input', _updateFormPreview);
        });
        _updateFormPreview();

        // Salva
        document.getElementById('cm-f-salva').addEventListener('click', _handleSalva);

        // Annulla
        document.getElementById('cm-f-annulla').addEventListener('click', function() {
            wrapper.style.display = 'none';
            wrapper.innerHTML = '';
            _editingId = null;
        });
    }

    function _updateFormPreview() {
        var preview = document.getElementById('cm-form-preview');
        if (!preview) return;

        var imp = parseFloat(document.getElementById('cm-f-imponibile').value) || 0;
        var litriComm = parseInt(document.getElementById('cm-f-litri-comm').value) || 0;
        var litriFisc = parseInt(document.getElementById('cm-f-litri-fisc').value) || 0;
        var accisa = parseFloat(document.getElementById('cm-f-accisa').value) || 0;

        if (imp === 0 || litriComm === 0) {
            preview.innerHTML = '<span style="color:var(--text-secondary); font-size:var(--font-size-sm);">Inserisci i dati per vedere l\'anteprima del calcolo</span>';
            return;
        }

        var monofaseIvaImp = imp * ALIQUOTA_IVA;
        var monofaseIvaAcc = (litriFisc * accisa) * ALIQUOTA_IVA;
        var totMonofase = monofaseIvaImp + monofaseIvaAcc;
        var coeff = _trunc4(totMonofase / litriComm);

        preview.innerHTML =
            '<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:var(--space-2); font-size:var(--font-size-sm);">' +
                '<div>Monof. IVA imp.: <strong>' + _formatEuro(monofaseIvaImp) + '</strong></div>' +
                '<div>Monof. IVA acc.: <strong>' + _formatEuro(monofaseIvaAcc) + '</strong></div>' +
                '<div>Tot. monofase: <strong>' + _formatEuro(totMonofase) + '</strong></div>' +
                '<div>Coefficiente: <strong style="color:var(--color-primary); font-size:1.2em;">' + _formatCoeff(coeff) + '</strong></div>' +
            '</div>';
    }

    // ============================================================
    // SALVATAGGIO
    // ============================================================

    async function _handleSalva() {
        var data = document.getElementById('cm-f-data').value;
        var imponibile = parseFloat(document.getElementById('cm-f-imponibile').value);
        var litriComm = parseInt(document.getElementById('cm-f-litri-comm').value);
        var litriFisc = parseInt(document.getElementById('cm-f-litri-fisc').value);
        var accisa = parseFloat(document.getElementById('cm-f-accisa').value);

        // Validazione
        if (!data) { ENI.UI.warning('Inserisci la data della fattura'); return; }
        if (!imponibile || imponibile <= 0) { ENI.UI.warning('Inserisci un imponibile valido'); return; }
        if (!litriComm || litriComm <= 0) { ENI.UI.warning('Inserisci i litri commerciali (devono essere > 0)'); return; }
        if (litriFisc == null || litriFisc < 0) { ENI.UI.warning('Inserisci i litri fiscali'); return; }
        if (!accisa || accisa <= 0) { ENI.UI.warning('Inserisci un valore accisa valido'); return; }

        // Calcola campi derivati
        var monofaseIvaImp = Math.round(imponibile * ALIQUOTA_IVA * 100) / 100;
        var monofaseIvaAcc = Math.round((litriFisc * accisa) * ALIQUOTA_IVA * 100) / 100;
        var totMonofase = Math.round((monofaseIvaImp + monofaseIvaAcc) * 100) / 100;
        var coeffRiga = _trunc4(totMonofase / litriComm);

        var meseRef = _meseCorrente.toISOString().slice(0, 10);

        // Numero progressivo
        var numProg;
        if (_editingId) {
            var existing = _fatture.find(function(f) { return String(f.id) === String(_editingId); });
            numProg = existing ? existing.numero_progressivo : _fatture.length + 1;
        } else {
            numProg = _fatture.length + 1;
        }

        var record = {
            mese_riferimento: meseRef,
            numero_progressivo: numProg,
            data_fattura: data,
            imponibile_fattura: imponibile,
            litri_commerciali: litriComm,
            litri_fiscali: litriFisc,
            accisa_per_litro: accisa,
            monofase_iva_imponibile: monofaseIvaImp,
            monofase_iva_accisa: monofaseIvaAcc,
            totale_monofase: totMonofase,
            monofase_media_per_lt: coeffRiga
        };

        try {
            if (_editingId) {
                await ENI.API.update(TABELLA_FATTURE, _editingId, record);
                ENI.UI.success('Fattura aggiornata');
            } else {
                await ENI.API.insert(TABELLA_FATTURE, record);
                ENI.UI.success('Fattura inserita');
            }

            _editingId = null;
            // Aggiorna coefficiente mensile
            await _aggiornaCoeffMensile();
            await _loadMese();
        } catch(e) {
            ENI.UI.error('Errore: ' + e.message);
        }
    }

    // ============================================================
    // AGGIORNA COEFFICIENTE MENSILE
    // ============================================================

    async function _aggiornaCoeffMensile() {
        var meseRef = _meseCorrente.toISOString().slice(0, 10);

        // Ricarica fatture aggiornate
        var fatture = await ENI.API.getAll(TABELLA_FATTURE, {
            filters: [{ op: 'eq', col: 'mese_riferimento', val: meseRef }]
        });

        var totali = _calcolaTotaliDaFatture(fatture);

        var coeffData = {
            mese_riferimento: meseRef,
            anno: _meseCorrente.getFullYear(),
            mese: _meseCorrente.getMonth() + 1,
            nome_mese: MESI[_meseCorrente.getMonth()],
            totale_imponibile: totali.totaleImponibile,
            totale_litri_commerciali: totali.totaleLitriComm,
            totale_monofase_iva_imp: totali.totaleMonofaseIvaImp,
            totale_monofase_iva_accisa: totali.totaleMonofaseIvaAcc,
            totale_monofase: totali.totaleMonofase,
            coefficiente_monofase: totali.totaleLitriComm > 0 ? totali.coefficiente : null,
            numero_fatture: fatture.length,
            stato: _coefficienteMese ? _coefficienteMese.stato : 'aperto'
        };

        try {
            if (_coefficienteMese) {
                await ENI.API.update(TABELLA_COEFFICIENTI, _coefficienteMese.id, coeffData);
            } else {
                await ENI.API.insert(TABELLA_COEFFICIENTI, coeffData);
            }
        } catch(e) {
            console.error('Errore aggiornamento coefficiente mensile:', e);
        }
    }

    // ============================================================
    // ELIMINA FATTURA
    // ============================================================

    async function _handleElimina(id) {
        if (!confirm('Sei sicuro di voler eliminare questa fattura?')) return;

        try {
            await ENI.API.remove(TABELLA_FATTURE, id);

            // Rinumera le fatture rimanenti
            var meseRef = _meseCorrente.toISOString().slice(0, 10);
            var fattureRes = await ENI.API.getAll(TABELLA_FATTURE, {
                filters: [{ op: 'eq', col: 'mese_riferimento', val: meseRef }],
                order: { col: 'numero_progressivo', asc: true }
            });

            for (var i = 0; i < fattureRes.length; i++) {
                if (fattureRes[i].numero_progressivo !== i + 1) {
                    await ENI.API.update(TABELLA_FATTURE, fattureRes[i].id, { numero_progressivo: i + 1 });
                }
            }

            await _aggiornaCoeffMensile();
            ENI.UI.success('Fattura eliminata');
            await _loadMese();
        } catch(e) {
            ENI.UI.error('Errore: ' + e.message);
        }
    }

    // ============================================================
    // CHIUDI / RIAPRI MESE
    // ============================================================

    async function _handleChiudiMese() {
        if (!confirm('Chiudere il mese? Il coefficiente diventerà definitivo e non sarà più possibile modificare le fatture.')) return;

        try {
            await _aggiornaCoeffMensile();

            // Ricarica per avere id aggiornato
            var meseRef = _meseCorrente.toISOString().slice(0, 10);
            var coeffRes = await ENI.API.getAll(TABELLA_COEFFICIENTI, {
                filters: [{ op: 'eq', col: 'mese_riferimento', val: meseRef }],
                limit: 1
            });

            if (coeffRes && coeffRes.length > 0) {
                await ENI.API.update(TABELLA_COEFFICIENTI, coeffRes[0].id, {
                    stato: 'chiuso',
                    data_chiusura: new Date().toISOString()
                });
            }

            ENI.UI.success('Mese chiuso con successo');
            await _loadMese();
        } catch(e) {
            ENI.UI.error('Errore: ' + e.message);
        }
    }

    async function _handleRiapriMese() {
        if (!confirm('Riaprire il mese? Sarà possibile modificare nuovamente le fatture.')) return;

        try {
            if (_coefficienteMese) {
                await ENI.API.update(TABELLA_COEFFICIENTI, _coefficienteMese.id, {
                    stato: 'aperto',
                    data_chiusura: null
                });
            }

            ENI.UI.success('Mese riaperto');
            await _loadMese();
        } catch(e) {
            ENI.UI.error('Errore: ' + e.message);
        }
    }

    // ============================================================
    // EVENT LISTENERS
    // ============================================================

    function _setupContentListeners(isChiuso) {
        // Aggiungi fattura
        var btnAggiungi = document.getElementById('cm-btn-aggiungi');
        if (btnAggiungi) {
            btnAggiungi.addEventListener('click', function() { _showForm(null); });
        }

        // Chiudi mese
        var btnChiudi = document.getElementById('cm-btn-chiudi');
        if (btnChiudi) {
            btnChiudi.addEventListener('click', _handleChiudiMese);
        }

        // Riapri mese
        var btnRiapri = document.getElementById('cm-btn-riapri');
        if (btnRiapri) {
            btnRiapri.addEventListener('click', _handleRiapriMese);
        }

        // Edit / Delete (solo se mese aperto)
        if (!isChiuso) {
            document.querySelectorAll('.cm-btn-edit').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    var id = btn.getAttribute('data-id');
                    var fattura = _fatture.find(function(f) { return String(f.id) === String(id); });
                    if (fattura) _showForm(fattura);
                });
                // Impedisce al click sull'SVG di non propagare il data-id
                btn.querySelectorAll('svg, path, polyline, rect, line, circle').forEach(function(el) {
                    el.style.pointerEvents = 'none';
                });
            });

            document.querySelectorAll('.cm-btn-delete').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    _handleElimina(btn.getAttribute('data-id'));
                });
                btn.querySelectorAll('svg, path, polyline, rect, line, circle').forEach(function(el) {
                    el.style.pointerEvents = 'none';
                });
            });
        }
    }

    // ============================================================
    // CALCOLI
    // ============================================================

    function _calcolaRiga(f) {
        var monofaseIvaImp = f.imponibile_fattura * ALIQUOTA_IVA;
        var monofaseIvaAcc = (f.litri_fiscali * f.accisa_per_litro) * ALIQUOTA_IVA;
        var totMonofase = monofaseIvaImp + monofaseIvaAcc;
        var coeffRiga = f.litri_commerciali > 0 ? _trunc4(totMonofase / f.litri_commerciali) : 0;

        return {
            monofaseIvaImp: monofaseIvaImp,
            monofaseIvaAcc: monofaseIvaAcc,
            totMonofase: totMonofase,
            coeffRiga: coeffRiga
        };
    }

    function _calcolaTotali() {
        return _calcolaTotaliDaFatture(_fatture);
    }

    function _calcolaTotaliDaFatture(fatture) {
        var totaleImponibile = 0;
        var totaleLitriComm = 0;
        var totaleMonofaseIvaImp = 0;
        var totaleMonofaseIvaAcc = 0;
        var totaleMonofase = 0;

        fatture.forEach(function(f) {
            var calc = _calcolaRiga(f);
            totaleImponibile += f.imponibile_fattura;
            totaleLitriComm += f.litri_commerciali;
            totaleMonofaseIvaImp += calc.monofaseIvaImp;
            totaleMonofaseIvaAcc += calc.monofaseIvaAcc;
            totaleMonofase += calc.totMonofase;
        });

        var coefficiente = totaleLitriComm > 0 ? _trunc4(totaleMonofase / totaleLitriComm) : 0;

        return {
            totaleImponibile: totaleImponibile,
            totaleLitriComm: totaleLitriComm,
            totaleMonofaseIvaImp: totaleMonofaseIvaImp,
            totaleMonofaseIvaAcc: totaleMonofaseIvaAcc,
            totaleMonofase: totaleMonofase,
            coefficiente: coefficiente
        };
    }

    // ============================================================
    // UTILITY FORMATTAZIONE
    // ============================================================

    function _trunc4(n) {
        return Math.trunc(n * 10000) / 10000;
    }

    function _formatEuro(n) {
        return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n);
    }

    function _formatNumero(n) {
        return new Intl.NumberFormat('it-IT').format(n);
    }

    function _formatCoeff(n) {
        return n.toFixed(4).replace('.', ',');
    }

    function _formatAccisa(n) {
        return (n || 0).toFixed(5).replace('.', ',') + ' \u20AC/lt';
    }

    function _formatData(d) {
        if (!d) return '';
        var parts = d.split('-');
        return parts[2] + '/' + parts[1] + '/' + parts[0];
    }

    // ============================================================
    // API PUBBLICA
    // ============================================================

    return {
        render: render
    };
})();
