// ============================================================
// SMAC - Tab Riconciliazione
// Selettore mese/anno, 3 card statistiche, verdetto contabile.
// Formula: SMAC ricarica (fis + dem) <= Venduto carb. - Fatture
// ============================================================

var ENI = ENI || {};
ENI.Smac = ENI.Smac || {};

ENI.Smac.Riconciliazione = (function() {
    'use strict';

    var MESI = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
                'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];

    var _stato = (function() {
        // Default: mese precedente
        var oggi = new Date();
        var mp = oggi.getMonth();   // 0-11, gia' "mese precedente" rispetto a getMonth()+1
        var ap = oggi.getFullYear();
        if (mp === 0) { mp = 12; ap -= 1; }
        return { mese: mp, anno: ap };
    })();

    function _fmtEuro(n) { return ENI.UI.formatValuta(n); }

    async function render(container) {
        container.innerHTML =
            '<div class="card" style="margin-bottom:var(--space-3);"><div class="card-body">' +
                '<div style="display:flex; gap:var(--space-2); align-items:end; flex-wrap:wrap;">' +
                    _renderSelectorMese() +
                    _renderSelectorAnno() +
                    '<button class="btn btn-outline" id="smac-mese-prec" title="Mese precedente">&larr;</button>' +
                    '<button class="btn btn-outline" id="smac-mese-succ" title="Mese successivo">&rarr;</button>' +
                    '<button class="btn btn-primary" id="smac-ricarica">Aggiorna</button>' +
                '</div>' +
            '</div></div>' +
            '<div id="smac-rec-content"><div class="flex justify-center" style="padding:2rem;"><div class="spinner"></div></div></div>';

        document.getElementById('smac-mese').addEventListener('change', function(e) {
            _stato.mese = parseInt(e.target.value, 10);
            _load();
        });
        document.getElementById('smac-anno').addEventListener('change', function(e) {
            _stato.anno = parseInt(e.target.value, 10);
            _load();
        });
        document.getElementById('smac-mese-prec').addEventListener('click', function() {
            if (_stato.mese === 1) { _stato.mese = 12; _stato.anno -= 1; }
            else _stato.mese -= 1;
            _syncSelectors();
            _load();
        });
        document.getElementById('smac-mese-succ').addEventListener('click', function() {
            if (_stato.mese === 12) { _stato.mese = 1; _stato.anno += 1; }
            else _stato.mese += 1;
            _syncSelectors();
            _load();
        });
        document.getElementById('smac-ricarica').addEventListener('click', _load);

        await _load();
    }

    function _renderSelectorMese() {
        var html = '<div class="form-group" style="margin:0;"><label class="form-label">Mese</label>' +
            '<select id="smac-mese" class="form-input" style="min-width:140px;">';
        for (var m = 1; m <= 12; m++) {
            html += '<option value="' + m + '"' + (m === _stato.mese ? ' selected' : '') + '>' + MESI[m-1] + '</option>';
        }
        html += '</select></div>';
        return html;
    }

    function _renderSelectorAnno() {
        var oggi = new Date();
        var anno = oggi.getFullYear();
        var html = '<div class="form-group" style="margin:0;"><label class="form-label">Anno</label>' +
            '<select id="smac-anno" class="form-input" style="min-width:100px;">';
        for (var a = anno - 3; a <= anno + 1; a++) {
            html += '<option value="' + a + '"' + (a === _stato.anno ? ' selected' : '') + '>' + a + '</option>';
        }
        html += '</select></div>';
        return html;
    }

    function _syncSelectors() {
        var sm = document.getElementById('smac-mese');
        var sa = document.getElementById('smac-anno');
        if (sm) sm.value = _stato.mese;
        if (sa) sa.value = _stato.anno;
    }

    async function _load() {
        var box = document.getElementById('smac-rec-content');
        if (!box) return;
        box.innerHTML = '<div class="flex justify-center" style="padding:2rem;"><div class="spinner"></div></div>';

        try {
            var r = await ENI.API.getRiconciliazioneSmac(_stato.mese, _stato.anno);
            box.innerHTML = _renderRiconciliazione(r);
        } catch(e) {
            console.error('SMAC riconciliazione error:', e);
            box.innerHTML = '<div class="empty-state"><p class="text-danger">Errore: ' + ENI.UI.escapeHtml(e.message) + '</p></div>';
        }
    }

    function _renderRiconciliazione(r) {
        var meseLabel = MESI[r.mese - 1] + ' ' + r.anno;

        var html = '<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:var(--space-3); margin-bottom:var(--space-3);">';

        // Card VENDUTO
        html += '<div class="card"><div class="card-body" style="text-align:center;">' +
            '<div class="text-sm text-muted" style="text-transform:uppercase; letter-spacing:0.05em;">Venduto carburante</div>' +
            '<div style="font-size:1.8rem; font-weight:700; margin:var(--space-2) 0;">' + _fmtEuro(r.venduto) + '</div>' +
            '<div class="text-sm text-muted">' + r.num_giorni_vendite + ' registrazioni vendite &middot; ' +
                Number(r.litri_venduti).toLocaleString('it-IT', {maximumFractionDigits:2}) + ' L</div>' +
            '<div class="text-sm text-muted" style="margin-top:var(--space-1);">fonte: pagina Marg. Carburante</div>' +
        '</div></div>';

        // Card FATTURATO
        html += '<div class="card"><div class="card-body" style="text-align:center;">' +
            '<div class="text-sm text-muted" style="text-transform:uppercase; letter-spacing:0.05em;">Fatturato</div>' +
            '<div style="font-size:1.8rem; font-weight:700; margin:var(--space-2) 0;">' + _fmtEuro(r.fatturato) + '</div>' +
            '<div class="text-sm text-muted">' + r.num_fatture + ' fatture (no ricevute)</div>' +
            '<div class="text-sm text-muted" style="margin-top:var(--space-1);">stato: EMESSA / PAGATA &middot; data emissione nel mese</div>' +
        '</div></div>';

        // Card SMAC RICARICA
        html += '<div class="card"><div class="card-body" style="text-align:center;">' +
            '<div class="text-sm text-muted" style="text-transform:uppercase; letter-spacing:0.05em;">SMAC ricarica</div>' +
            '<div style="font-size:1.8rem; font-weight:700; margin:var(--space-2) 0;">' + _fmtEuro(r.ricarica_smac) + '</div>' +
            (r.riepilogo
                ? '<div class="text-sm text-muted">fisica ' + _fmtEuro(r.riepilogo.fis_imp_ricarica) +
                    ' + demat. ' + _fmtEuro(r.riepilogo.dem_imp_ricarica) + '</div>'
                : '<div class="text-sm text-muted text-warning">Nessun file SMAC importato per questo mese</div>') +
        '</div></div>';

        html += '</div>';

        // VERDETTO
        html += _renderVerdetto(r, meseLabel);

        // Dettaglio fisco / pagamenti / sconti (info)
        if (r.riepilogo) {
            html += _renderDettaglio(r.riepilogo);
        }

        return html;
    }

    function _renderVerdetto(r, meseLabel) {
        var v = r.verdetto;
        var cssBg, icon, titolo, sub;

        if (v === 'NO_SMAC') {
            cssBg = 'background:var(--color-warning-bg, #fff8e1); border-left:4px solid var(--color-warning, #f59e0b);';
            icon = '⚠️';
            titolo = 'Nessun riepilogo SMAC importato per ' + meseLabel;
            sub = 'Vai alla tab <strong>Import</strong> e carica il file CSV del mese per vedere il verdetto.';
        } else if (v === 'OK') {
            cssBg = 'background:#dcfce7; border-left:4px solid #16a34a;';
            icon = '✅';
            titolo = 'OK — i conti tornano';
            sub = 'Il transato SMAC ricarica corrisponde alla differenza tra venduto e fatturato.';
        } else if (v === 'MARGINE') {
            cssBg = 'background:#fff8e1; border-left:4px solid #f59e0b;';
            icon = '⚠️';
            titolo = 'MARGINE — €' + Math.abs(r.differenza).toLocaleString('it-IT', {minimumFractionDigits:2,maximumFractionDigits:2}) + ' sotto al limite';
            sub = 'Il transato SMAC e\' inferiore alla differenza venduto-fatturato. Probabilmente la differenza e\' coperta da contanti, POS BSI o Carisp. Verifica gli altri metodi di incasso.';
        } else {  // SANZIONE
            cssBg = 'background:#fee2e2; border-left:4px solid #dc2626;';
            icon = '\u{1F6D1}';
            titolo = 'SANZIONE — eccesso €' + Math.abs(r.differenza).toLocaleString('it-IT', {minimumFractionDigits:2,maximumFractionDigits:2}) + ' sopra al limite';
            sub = 'Il transato SMAC ricarica supera la differenza tra venduto e fatturato. Questo e\' contabilmente impossibile e configura una potenziale sanzione: stai dichiarando ricariche SMAC oltre il venduto disponibile.';
        }

        return '<div class="card" style="margin-bottom:var(--space-3); ' + cssBg + '"><div class="card-body">' +
            '<div style="display:flex; gap:var(--space-3); align-items:flex-start;">' +
                '<div style="font-size:2rem;">' + icon + '</div>' +
                '<div style="flex:1;">' +
                    '<h4 style="margin:0 0 var(--space-1) 0;">' + titolo + '</h4>' +
                    '<p style="margin:0; color:var(--text-secondary); font-size:0.9rem;">' + sub + '</p>' +
                    '<div style="margin-top:var(--space-3); padding-top:var(--space-2); border-top:1px solid rgba(0,0,0,0.1);">' +
                        '<div style="font-family:ui-monospace,monospace; font-size:0.95rem; line-height:1.6;">' +
                            'Limite max  = Venduto &minus; Fatture<br>' +
                            '            = ' + _fmtEuro(r.venduto) + ' &minus; ' + _fmtEuro(r.fatturato) +
                                ' = <strong>' + _fmtEuro(r.limite) + '</strong><br>' +
                            'Transato SMAC ricarica = <strong>' + _fmtEuro(r.ricarica_smac) + '</strong>' +
                            (v !== 'NO_SMAC'
                                ? '<br>Differenza = <strong>' + (r.differenza >= 0 ? '+' : '') +
                                    Number(r.differenza).toLocaleString('it-IT', {minimumFractionDigits:2,maximumFractionDigits:2}) + ' &euro;</strong>' +
                                    ' <span class="text-muted">(positivo = margine, negativo = sforamento)</span>'
                                : '') +
                        '</div>' +
                    '</div>' +
                '</div>' +
            '</div>' +
        '</div></div>';
    }

    function _renderDettaglio(rip) {
        return '<div class="card"><div class="card-body">' +
            '<h4 style="margin:0 0 var(--space-2) 0;">Altre voci del file SMAC <span class="text-sm text-muted" style="font-weight:normal;">(non entrano nel verdetto)</span></h4>' +
            '<div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--space-3);">' +
                '<div>' +
                    '<h5 style="margin:0 0 var(--space-2) 0;">Carte fisiche</h5>' +
                    '<table class="table" style="margin:0;"><tbody>' +
                        '<tr><td>Pagamento</td><td class="text-right text-muted">' + (rip.fis_num_pagamento||0) + ' tx</td><td class="text-right">' + _fmtEuro(rip.fis_imp_pagamento) + '</td></tr>' +
                        '<tr><td>Pagamento netto sconto</td><td></td><td class="text-right">' + _fmtEuro(rip.fis_imp_pagamento_netto) + '</td></tr>' +
                        '<tr><td>Fisco</td><td class="text-right text-muted">' + (rip.fis_num_fisco||0) + ' tx</td><td class="text-right">' + _fmtEuro(rip.fis_imp_fisco) + '</td></tr>' +
                        '<tr style="font-weight:700;"><td>Totale fisiche</td><td class="text-right text-muted">' + (rip.fis_num_totale||0) + ' tx</td><td class="text-right">' + _fmtEuro(rip.fis_imp_totale) + '</td></tr>' +
                        '<tr><td>Sconto ricarica</td><td></td><td class="text-right">' + _fmtEuro(rip.fis_sconto_ricarica) + '</td></tr>' +
                        '<tr><td>Sconto pagamento</td><td></td><td class="text-right">' + _fmtEuro(rip.fis_sconto_pagamento) + '</td></tr>' +
                    '</tbody></table>' +
                '</div>' +
                '<div>' +
                    '<h5 style="margin:0 0 var(--space-2) 0;">Dematerializzate</h5>' +
                    '<table class="table" style="margin:0;"><tbody>' +
                        '<tr><td>Pagamento</td><td class="text-right text-muted">' + (rip.dem_num_pagamento||0) + ' tx</td><td class="text-right">' + _fmtEuro(rip.dem_imp_pagamento) + '</td></tr>' +
                        '<tr><td>Fisco</td><td class="text-right text-muted">' + (rip.dem_num_fisco||0) + ' tx</td><td class="text-right">' + _fmtEuro(rip.dem_imp_fisco) + '</td></tr>' +
                        '<tr style="font-weight:700;"><td>Totale demat.</td><td class="text-right text-muted">' + (rip.dem_num_totale||0) + ' tx</td><td class="text-right">' + _fmtEuro(rip.dem_imp_totale) + '</td></tr>' +
                    '</tbody></table>' +
                '</div>' +
            '</div>' +
        '</div></div>';
    }

    function setMeseAnno(mese, anno) {
        _stato.mese = mese;
        _stato.anno = anno;
        _syncSelectors();
        _load();
    }

    return { render: render, setMeseAnno: setMeseAnno };
})();
