// ============================================================
// GESTIONALE ENI - Modulo Ordine Carburante
// Previsione autonomia serbatoi e proposta d'ordine (3 settimane).
// Base proiezione = giacenza rilevata a mano (editabile).
// Calcolo delegato a ENI.PrevisioneCarburante (funzioni pure).
// ============================================================

var ENI = ENI || {};
ENI.Modules = ENI.Modules || {};

ENI.Modules.OrdineCarburante = (function() {
    'use strict';

    var _prodotti = [];
    var _serbatoiMap = {};
    var _parametri = null;
    var _prodSel = null;
    var _vista = 'previsione';   // 'previsione' | 'storico'
    var _storicoSettimane = 8;
    var _storicoChart = null;
    var _ultimoStorico = null;

    var GIORNI = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab']; // indice getDay()

    // --- helper date/numeri ---
    function _parseISO(s) { var p = String(s).split('-'); return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])); }
    function _toISO(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
    function _addGiorni(iso, n) { var d = _parseISO(iso); d.setDate(d.getDate() + n); return _toISO(d); }
    function _dow(iso) { return _parseISO(iso).getDay(); }
    function _daysBetween(a, b) { return Math.round((_parseISO(b) - _parseISO(a)) / 86400000); }
    function _mondayOf(iso) { var d = _dow(iso); var off = (d === 0) ? 6 : (d - 1); return _addGiorni(iso, -off); }
    function _oggi() { return ENI.UI.oggiISO(); }
    function _fmtL(n) { return Math.round(Number(n) || 0).toLocaleString('it-IT'); }
    function _fmtData(iso) { var p = String(iso).split('-'); return p[2] + '/' + p[1]; }
    function _prodById(id) { for (var i = 0; i < _prodotti.length; i++) if (_prodotti[i].id === id) return _prodotti[i]; return null; }

    function _style() {
        if (document.getElementById('oc-style')) return;
        var st = document.createElement('style');
        st.id = 'oc-style';
        st.textContent =
            '#oc-content .oc-kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:var(--space-3);margin-bottom:var(--space-4);}' +
            '#oc-content .oc-kpi{background:var(--bg-card);border:1px solid var(--color-gray-200);border-radius:var(--radius-md);padding:10px 12px;}' +
            '#oc-content .oc-kpi-lbl{font-size:0.7rem;text-transform:uppercase;letter-spacing:.03em;color:var(--color-gray-500);}' +
            '#oc-content .oc-kpi-val{font-size:1.25rem;font-weight:700;line-height:1.2;}' +
            '#oc-content .oc-week{margin-bottom:var(--space-4);}' +
            '#oc-content .oc-week-title{font-weight:600;font-size:0.9rem;margin-bottom:6px;}' +
            '#oc-content table.oc-grid{width:100%;border-collapse:collapse;}' +
            '#oc-content table.oc-grid th,#oc-content table.oc-grid td{border:1px solid var(--color-gray-200);text-align:center;padding:4px 6px;font-size:0.85rem;}' +
            '#oc-content table.oc-grid th{background:var(--bg-secondary);font-size:0.75rem;}' +
            '#oc-content td.oc-rl{text-align:left;font-weight:600;white-space:nowrap;background:var(--bg-secondary);}' +
            '#oc-content td.oc-past{color:var(--color-gray-400);background:repeating-linear-gradient(45deg,transparent,transparent 4px,rgba(0,0,0,0.03) 4px,rgba(0,0,0,0.03) 8px);}' +
            '#oc-content td.oc-carico[data-carico-data]{color:var(--color-primary);}' +
            '#oc-content td.oc-verde{background:rgba(27,175,122,0.14);}' +
            '#oc-content td.oc-giallo{background:rgba(237,161,0,0.18);}' +
            '#oc-content td.oc-rosso{background:rgba(229,72,77,0.18);}' +
            '#oc-tabs .chip{cursor:pointer;}' +
            '@media print{.app-sidebar,.app-header,.app-bottom-nav,#oc-actions,#oc-tabs .chip:not(.active){display:none !important;}}';
        document.head.appendChild(st);
    }

    // --- Render principale ---
    async function render(container) {
        _style();
        container.innerHTML = '<div class="flex justify-center" style="padding:2rem;"><div class="spinner"></div></div>';
        try {
            _prodotti = await ENI.API.getAll('prodotti_carburante', { filters: [{ op: 'eq', col: 'attivo', val: true }], order: { col: 'ordine', asc: true } }) || [];
            var serbatoi = await ENI.API.getSerbatoi();
            _serbatoiMap = {};
            serbatoi.forEach(function(s) { _serbatoiMap[s.prodotto_id] = s; });
            _parametri = await ENI.API.getParametriPrevisione();
        } catch (e) {
            container.innerHTML = '<div class="empty-state"><p class="empty-state-text">Errore caricamento: ' + ENI.UI.escapeHtml(e.message) + '</p></div>';
            return;
        }
        if (!_prodSel || !_prodById(_prodSel)) _prodSel = _prodotti.length ? _prodotti[0].id : null;

        container.innerHTML =
            '<div class="page-header">' +
                '<h1 class="page-title">⛽ Ordine Carburante</h1>' +
                '<div class="btn-group" id="oc-actions">' +
                    '<button class="btn btn-primary btn-sm" id="oc-btn-carico">📥 Carico arrivato</button>' +
                    '<button class="btn btn-outline btn-sm" id="oc-btn-param">⚙️ Parametri</button>' +
                    '<button class="btn btn-outline btn-sm" id="oc-btn-xlsx">📊 Excel</button>' +
                    '<button class="btn btn-outline btn-sm" id="oc-btn-print">🖨️ Stampa</button>' +
                '</div>' +
            '</div>' +
            '<div class="filter-chips" id="oc-view" style="margin-bottom:var(--space-2);">' +
                '<button class="chip' + (_vista === 'previsione' ? ' active' : '') + '" data-vista="previsione">📈 Previsione</button>' +
                '<button class="chip' + (_vista === 'storico' ? ' active' : '') + '" data-vista="storico">📊 Storico</button>' +
            '</div>' +
            '<div class="filter-chips" id="oc-tabs" style="margin-bottom:var(--space-3);">' +
                _prodotti.map(function(p) { return '<button class="chip' + (p.id === _prodSel ? ' active' : '') + '" data-prod="' + p.id + '">' + ENI.UI.escapeHtml(p.nome) + '</button>'; }).join('') +
            '</div>' +
            '<div id="oc-content"></div>';

        var tabs = container.querySelector('#oc-tabs');
        tabs.addEventListener('click', function(e) {
            var b = e.target.closest('[data-prod]');
            if (!b) return;
            _prodSel = b.getAttribute('data-prod');
            tabs.querySelectorAll('[data-prod]').forEach(function(x) { x.classList.toggle('active', x.getAttribute('data-prod') === _prodSel); });
            _renderVista();
        });
        var viewBar = container.querySelector('#oc-view');
        viewBar.addEventListener('click', function(e) {
            var b = e.target.closest('[data-vista]');
            if (!b) return;
            _vista = b.getAttribute('data-vista');
            viewBar.querySelectorAll('[data-vista]').forEach(function(x) { x.classList.toggle('active', x.getAttribute('data-vista') === _vista); });
            _renderVista();
        });
        container.querySelector('#oc-btn-carico').addEventListener('click', _registraCaricoArrivato);
        container.querySelector('#oc-btn-param').addEventListener('click', _showParametri);
        container.querySelector('#oc-btn-xlsx').addEventListener('click', _esportaExcel);
        container.querySelector('#oc-btn-print').addEventListener('click', function() { window.print(); });

        _renderVista();
    }

    // Stato dell'ultimo calcolo (per export)
    var _ultimo = null;

    async function _renderProdotto() {
        var content = document.getElementById('oc-content');
        if (!content) return;
        content.innerHTML = '<div class="flex justify-center" style="padding:2rem;"><div class="spinner"></div></div>';

        var prod = _prodById(_prodSel);
        var serb = _serbatoiMap[_prodSel] || {};
        var giac, carichi, mediaInfo;
        try {
            giac = await ENI.API.getGiacenzaRilevata(_prodSel);
            carichi = await ENI.API.getCarichiPrevisti(_prodSel);
            mediaInfo = await _calcMedia(_prodSel);
        } catch (e) {
            content.innerHTML = '<div class="empty-state"><p class="empty-state-text">Errore: ' + ENI.UI.escapeHtml(e.message) + '</p></div>';
            return;
        }

        var oggi = _oggi();
        var base = giac ? Number(giac.litri) : 0;
        var gridStart = _mondayOf(oggi);
        var gridEnd = _addGiorni(gridStart, 20);
        var orizz = _daysBetween(oggi, gridEnd) + 1;
        if (orizz < 1) orizz = 1;

        var res = ENI.PrevisioneCarburante.calcola({
            giacenzaIniziale: base,
            dataInizio: oggi,
            orizzonte: orizz,
            mediaParams: mediaInfo.params,
            fattori: _parametri.fattori_giorno,
            scortaMinima: Number(serb.scorta_minima) || 0,
            capacitaUtile: Number(serb.capacita_utile) || 0,
            lottoMinimo: Number(serb.lotto_minimo) || 0,
            giorniConsegna: [1, 2, 3, 4, 5], // consegne Lun–Ven
            carichiPrevisti: carichi.map(function(c) { return { data: c.data_prevista, litri: c.litri }; })
        });

        _ultimo = { prod: prod, serb: serb, giac: giac, carichi: carichi, mediaInfo: mediaInfo, res: res, gridStart: gridStart };

        content.innerHTML = _riepilogoHtml(prod, serb, giac, mediaInfo, res) + _grigliaHtml(gridStart, res);
        _wireProdotto(content, carichi);
    }

    // Calcolo proiezione per TUTTI i prodotti attivi (usato anche dalla Dashboard).
    // Ricarica prodotti/serbatoi/parametri da zero: funziona anche se la pagina non è mai stata aperta. SOLO LETTURA.
    async function calcolaTutti() {
        // fetch iniziali in parallelo
        var base0 = await Promise.all([
            ENI.API.getAll('prodotti_carburante', { filters: [{ op: 'eq', col: 'attivo', val: true }], order: { col: 'ordine', asc: true } }),
            ENI.API.getSerbatoi(),
            ENI.API.getParametriPrevisione()
        ]);
        var prodotti = base0[0] || [];
        var serbMap = {};
        (base0[1] || []).forEach(function(s) { serbMap[s.prodotto_id] = s; });
        _parametri = base0[2]; // serve a _calcMedia
        var oggi = _oggi();
        var gridStart = _mondayOf(oggi);
        var orizz = _daysBetween(oggi, _addGiorni(gridStart, 20)) + 1;
        if (orizz < 1) orizz = 1;
        // tutti i prodotti insieme, e per ciascuno le 3 query in parallelo
        return Promise.all(prodotti.map(async function(prod) {
            var serb = serbMap[prod.id] || {};
            var r = await Promise.all([
                ENI.API.getGiacenzaRilevata(prod.id),
                ENI.API.getCarichiPrevisti(prod.id),
                _calcMedia(prod.id)
            ]);
            var giac = r[0], carichi = r[1] || [], mediaInfo = r[2];
            var res = ENI.PrevisioneCarburante.calcola({
                giacenzaIniziale: giac ? Number(giac.litri) : 0,
                dataInizio: oggi, orizzonte: orizz,
                mediaParams: mediaInfo.params, fattori: _parametri.fattori_giorno,
                scortaMinima: Number(serb.scorta_minima) || 0,
                capacitaUtile: Number(serb.capacita_utile) || 0,
                lottoMinimo: Number(serb.lotto_minimo) || 0,
                giorniConsegna: [1, 2, 3, 4, 5],
                carichiPrevisti: carichi.map(function(c) { return { data: c.data_prevista, litri: c.litri }; })
            });
            return { prod: prod, serb: serb, giac: giac, media: mediaInfo.media, res: res };
        }));
    }

    async function _calcMedia(prodId) {
        if (_parametri.modalita_media === 'manuale') {
            var mm = (_parametri.media_manuale && _parametri.media_manuale[prodId]) || {};
            var tot = Number(mm.totale) || 0, gg = Number(mm.giorni) || 0;
            return { params: { modalita: 'manuale', manualeTotale: tot, manualeGiorni: gg }, media: gg > 0 ? tot / gg : 0, descr: 'Manuale (' + _fmtL(tot) + ' L / ' + gg + ' gg)' };
        }
        var finestra = Number(_parametri.finestra_giorni) || 12;
        var oggi = _oggi();
        var erog = await ENI.API.getErogatoPeriodo(prodId, _addGiorni(oggi, -finestra), _addGiorni(oggi, -1));
        var media = finestra > 0 ? erog.totale / finestra : 0;
        return { params: { modalita: 'auto', erogatoFinestra: erog.totale, giorniFinestra: finestra }, media: media, descr: 'Automatica (' + _fmtL(erog.totale) + ' L / ' + finestra + ' gg)' };
    }

    function _riepilogoHtml(prod, serb, giac, mediaInfo, res) {
        var ind = res.indicatori, prop = res.proposta;
        var giacTxt = giac ? _fmtL(giac.litri) + ' L' : '— da inserire';
        var giacData = giac ? '<div class="text-xs text-muted">lettura del ' + _fmtData(giac.data) + '</div>' : '';
        var autonomia = ind.giorniAutonomia != null ? ind.giorniAutonomia + ' giorni' : 'oltre orizzonte';
        var esaur = ind.dataEsaurimento ? _fmtData(ind.dataEsaurimento) : '—';
        var ordineTxt = prop.serve ? _fmtL(prop.quantita) + ' L' : 'Non necessario';
        var ordineData = '';
        if (prop.serve) {
            var ritardo = prop.dataOrdine < _oggi();
            ordineData =
                '<div class="text-xs text-muted">Consegna: ' + _fmtData(prop.dataConsegna) + '</div>' +
                '<div class="text-xs" style="font-weight:600;' + (ritardo ? 'color:var(--color-danger);' : '') + '">' +
                    (ritardo
                        ? '⚠ Ordina SUBITO (limite era 8:30 del ' + _fmtData(prop.dataOrdine) + ')'
                        : '🕗 Ordina entro le 8:30 del ' + _fmtData(prop.dataOrdine)) +
                '</div>';
        }

        function kpi(lbl, val, extra) { return '<div class="oc-kpi"><div class="oc-kpi-lbl">' + lbl + '</div><div class="oc-kpi-val">' + val + '</div>' + (extra || '') + '</div>'; }

        return '<div class="oc-kpi-grid">' +
                kpi('Giacenza attuale', giacTxt, giacData + '<button class="btn btn-sm btn-outline" id="oc-btn-giac" style="margin-top:6px;">Aggiorna</button>') +
                kpi('Consumo medio/giorno', _fmtL(mediaInfo.media) + ' L', '<div class="text-xs text-muted">' + mediaInfo.descr + '</div>') +
                kpi('Autonomia', autonomia, ind.dataSottoScorta ? '<div class="text-xs text-muted">sotto scorta il ' + _fmtData(ind.dataSottoScorta) + '</div>' : '') +
                kpi('Esaurimento (senza rifornimenti)', esaur, '') +
                kpi('Ordine suggerito', ordineTxt, ordineData) +
            '</div>' +
            '<div class="text-sm text-muted" style="margin-bottom:var(--space-3);">' +
                'Serbatoio: capacità utile ' + _fmtL(serb.capacita_utile) + ' L · scorta minima ' + _fmtL(serb.scorta_minima) + ' L · lotto minimo ' + _fmtL(serb.lotto_minimo) + ' L' +
            '</div>';
    }

    function _grigliaHtml(gridStart, res) {
        var byDate = {};
        res.cascata.forEach(function(d) { byDate[d.data] = d; });
        var oggi = _oggi();

        function rigaSemplice(label, wStart, fn) {
            var h = '<tr><td class="oc-rl">' + label + '</td>';
            for (var i = 0; i < 7; i++) {
                var dt = _addGiorni(wStart, i);
                var d = byDate[dt];
                var past = dt < oggi;
                h += '<td class="oc-cell' + (past ? ' oc-past' : '') + '">' + (d ? fn(d) : (past ? '—' : '')) + '</td>';
            }
            return h + '</tr>';
        }

        var html = '';
        for (var w = 0; w < 3; w++) {
            var wStart = _addGiorni(gridStart, w * 7);
            html += '<div class="oc-week">' +
                '<div class="oc-week-title">Settimana ' + (w + 1) + ' · ' + _fmtData(wStart) + ' – ' + _fmtData(_addGiorni(wStart, 6)) + '</div>' +
                '<div class="table-wrapper"><table class="oc-grid"><thead><tr><th></th>';
            for (var i = 0; i < 7; i++) {
                var dt = _addGiorni(wStart, i);
                html += '<th>' + GIORNI[_dow(dt)] + '<br><span class="text-xs">' + _fmtData(dt) + '</span></th>';
            }
            html += '</tr></thead><tbody>';

            html += rigaSemplice('Apertura', wStart, function(d) { return _fmtL(d.apertura); });

            // Carichi (editabili)
            html += '<tr><td class="oc-rl">Carichi</td>';
            for (var c = 0; c < 7; c++) {
                var dtc = _addGiorni(wStart, c);
                var dc = byDate[dtc];
                var pastc = dtc < oggi;
                var valc = (dc && dc.carichi > 0) ? '+' + _fmtL(dc.carichi) : (pastc ? '—' : '+');
                html += '<td class="oc-cell oc-carico' + (pastc ? ' oc-past' : '') + '"' + (pastc ? '' : ' data-carico-data="' + dtc + '" style="cursor:pointer;"') + '>' + valc + '</td>';
            }
            html += '</tr>';

            html += rigaSemplice('Consumo', wStart, function(d) { return '−' + _fmtL(d.consumo); });

            // Chiusura (semaforo)
            html += '<tr><td class="oc-rl">Chiusura</td>';
            for (var k = 0; k < 7; k++) {
                var dtk = _addGiorni(wStart, k);
                var dk = byDate[dtk];
                var pastk = dtk < oggi;
                if (!dk) { html += '<td class="oc-cell' + (pastk ? ' oc-past' : '') + '">' + (pastk ? '—' : '') + '</td>'; continue; }
                var cls = dk.stato === 'esaurito' ? 'oc-rosso' : (dk.stato === 'sottoscorta' ? 'oc-giallo' : 'oc-verde');
                var ico = dk.stato === 'esaurito' ? '✕' : (dk.stato === 'sottoscorta' ? '⚠' : '✓');
                var lab = dk.stato === 'esaurito' ? 'esaurito' : (dk.stato === 'sottoscorta' ? 'sotto scorta' : 'ok');
                html += '<td class="oc-cell ' + cls + '" title="' + lab + '"><strong>' + _fmtL(dk.chiusura) + '</strong><br><span class="text-xs">' + ico + ' ' + lab + '</span></td>';
            }
            html += '</tr>';

            html += '</tbody></table></div></div>';
        }
        // Nota anomalia (2.7)
        if (res.indicatori.dataEsaurimento) {
            html += '<div class="stock-alert" style="background:rgba(229,72,77,0.1);border-left:4px solid #e5484d;">⚠️ Le chiusure ≤ 0 sono uno <strong>scenario teorico senza rifornimenti</strong>: inserisci un carico previsto per riportare la proiezione sopra la scorta minima.</div>';
        }
        return html;
    }

    function _wireProdotto(content, carichi) {
        var bg = document.getElementById('oc-btn-giac');
        if (bg) bg.addEventListener('click', _showGiacenza);

        content.querySelectorAll('[data-carico-data]').forEach(function(cell) {
            cell.addEventListener('click', function() {
                var data = cell.getAttribute('data-carico-data');
                var esistente = carichi.filter(function(c) { return c.data_prevista === data; })[0] || null;
                _showCarico(data, esistente);
            });
        });
    }

    // --- Modale: aggiorna giacenza rilevata (manuale) ---
    function _showGiacenza() {
        var prod = _prodById(_prodSel);
        var giacAttuale = _ultimo && _ultimo.giac ? _ultimo.giac.litri : '';
        var modal = ENI.UI.showModal({
            title: 'Giacenza rilevata — ' + ENI.UI.escapeHtml(prod.nome),
            body:
                '<p class="text-sm text-muted" style="margin-top:0;">Inserisci i litri letti oggi dal serbatoio. È il punto di partenza della proiezione.</p>' +
                '<div class="form-group"><label class="form-label">Litri (oggi ' + _fmtData(_oggi()) + ')</label>' +
                    '<input type="number" min="0" step="1" class="form-input" id="oc-giac-litri" value="' + (giacAttuale !== '' ? giacAttuale : '') + '"></div>',
            footer: '<button class="btn btn-outline" data-modal-close>Annulla</button><button class="btn btn-primary" id="oc-giac-salva">Salva</button>'
        });
        modal.querySelector('#oc-giac-salva').addEventListener('click', async function() {
            var litri = parseFloat(document.getElementById('oc-giac-litri').value);
            if (isNaN(litri) || litri < 0) { ENI.UI.warning('Inserisci un valore valido'); return; }
            try {
                await ENI.API.salvaGiacenzaRilevata({ prodotto_id: _prodSel, data: _oggi(), litri: litri, origine: 'manuale' });
                ENI.UI.closeModal(modal);
                ENI.UI.success('Giacenza aggiornata');
                _renderProdotto();
            } catch (e) { ENI.UI.error('Errore: ' + e.message); }
        });
    }

    // --- Modale: carico previsto (add / edit / delete) ---
    function _showCarico(data, esistente) {
        var prod = _prodById(_prodSel);
        var body =
            '<p class="text-sm text-muted" style="margin-top:0;">Rifornimento previsto per il <strong>' + _fmtData(data) + '</strong> (' + ENI.UI.escapeHtml(prod.nome) + ')</p>' +
            '<div class="form-group"><label class="form-label">Litri</label>' +
                '<input type="number" min="1" step="1" class="form-input" id="oc-car-litri" value="' + (esistente ? esistente.litri : '') + '"></div>' +
            '<div class="form-group"><label class="form-label">Stato</label>' +
                '<select class="form-select" id="oc-car-stato">' +
                    ['previsto', 'confermato', 'consegnato'].map(function(s) { return '<option value="' + s + '"' + (esistente && esistente.stato === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') +
                '</select></div>' +
            '<div class="form-group"><label class="form-label">Fornitore (opzionale)</label>' +
                '<input type="text" class="form-input" id="oc-car-forn" value="' + (esistente && esistente.fornitore ? ENI.UI.escapeHtml(esistente.fornitore) : '') + '"></div>';
        var footer = '<button class="btn btn-outline" data-modal-close>Annulla</button>' +
            (esistente ? '<button class="btn btn-ghost" id="oc-car-del" style="color:var(--color-danger);">Elimina</button>' : '') +
            '<button class="btn btn-primary" id="oc-car-salva">Salva</button>';

        var modal = ENI.UI.showModal({ title: esistente ? 'Modifica carico previsto' : 'Nuovo carico previsto', body: body, footer: footer });

        modal.querySelector('#oc-car-salva').addEventListener('click', async function() {
            var litri = parseFloat(document.getElementById('oc-car-litri').value);
            if (isNaN(litri) || litri <= 0) { ENI.UI.warning('I litri devono essere maggiori di zero'); return; }
            try {
                await ENI.API.salvaCaricoPrevisto({
                    id: esistente ? esistente.id : null,
                    prodotto_id: _prodSel, data_prevista: data, litri: litri,
                    stato: document.getElementById('oc-car-stato').value,
                    fornitore: document.getElementById('oc-car-forn').value.trim() || null
                });
                ENI.UI.closeModal(modal);
                ENI.UI.success('Carico previsto salvato');
                _renderProdotto();
            } catch (e) { ENI.UI.error('Errore: ' + e.message); }
        });
        var del = modal.querySelector('#oc-car-del');
        if (del) del.addEventListener('click', async function() {
            var ok = await ENI.UI.confirm({ title: 'Elimina carico', message: 'Eliminare il carico previsto del ' + _fmtData(data) + '?', confirmText: 'Elimina', cancelText: 'Annulla', danger: true });
            if (!ok) return;
            try {
                await ENI.API.eliminaCaricoPrevisto(esistente.id);
                ENI.UI.closeModal(modal);
                ENI.UI.success('Carico eliminato');
                _renderProdotto();
            } catch (e) { ENI.UI.error('Errore: ' + e.message); }
        });
    }

    // --- Registra carico arrivato (riusa il form contabile di Marginalità) ---
    function _registraCaricoArrivato() {
        var M = ENI.Modules.MarginalitaCarburante;
        if (!M || !M.apriRegistrazioneCarico) { ENI.UI.error('Registrazione carico non disponibile'); return; }
        M.apriRegistrazioneCarico({
            prodId: _prodSel,
            senzaPrezzo: true,
            onSaved: function(info) { _proponiGiacenzePostCarico(info); }
        });
    }

    // Dopo il salvataggio del carico, propone la nuova giacenza (attuale + litri arrivati), modificabile.
    async function _proponiGiacenzePostCarico(info) {
        var saved = (info && info.prodotti) || [];
        var dataCarico = (info && info.data) || _oggi();
        var righe = [];
        for (var i = 0; i < saved.length; i++) {
            var pid = saved[i].prodId;
            var prod = _prodById(pid);
            if (!prod) continue;
            var g = null;
            try { g = await ENI.API.getGiacenzaRilevata(pid); } catch (e) {}
            var attuale = g ? Number(g.litri) : 0;
            var arrivati = Number(saved[i].comm) || 0;
            righe.push({ pid: pid, nome: prod.nome, attuale: attuale, arrivati: arrivati, nuovo: Math.round(attuale + arrivati) });
        }
        if (!righe.length) { _renderVista(); return; }

        var body =
            '<p class="text-sm text-muted" style="margin-top:0;">Carico registrato ✓. Vuoi aggiornare la <strong>giacenza del serbatoio</strong>? Il valore proposto è <em>giacenza attuale + litri arrivati</em> ed è modificabile — fai comunque il tuo controllo manuale sul serbatoio.</p>' +
            righe.map(function(r) {
                return '<div style="border:1px solid var(--color-gray-200);border-radius:var(--radius-md);padding:10px;margin-bottom:8px;">' +
                    '<div style="font-weight:600;margin-bottom:4px;">' + ENI.UI.escapeHtml(r.nome) + '</div>' +
                    '<div class="text-xs text-muted" style="margin-bottom:6px;">Attuale ' + _fmtL(r.attuale) + ' L + arrivati ' + _fmtL(r.arrivati) + ' L</div>' +
                    '<label class="form-label">Nuova giacenza (L) al ' + _fmtData(dataCarico) + '</label>' +
                    '<input type="number" min="0" step="1" class="form-input oc-newgiac" data-pid="' + r.pid + '" value="' + r.nuovo + '">' +
                '</div>';
            }).join('');

        var modal = ENI.UI.showModal({
            title: '📥 Aggiorna giacenza dopo il carico',
            body: body,
            footer: '<button class="btn btn-outline" data-modal-close>Salta</button><button class="btn btn-primary" id="oc-giac-post-salva">Salva giacenze</button>'
        });
        modal.querySelector('#oc-giac-post-salva').addEventListener('click', async function() {
            try {
                var inputs = modal.querySelectorAll('.oc-newgiac');
                for (var i = 0; i < inputs.length; i++) {
                    var val = parseFloat(inputs[i].value);
                    if (isNaN(val) || val < 0) continue;
                    await ENI.API.salvaGiacenzaRilevata({ prodotto_id: inputs[i].getAttribute('data-pid'), data: dataCarico, litri: val, origine: 'manuale' });
                }
                ENI.UI.closeModal(modal);
                ENI.UI.success('Giacenze aggiornate');
                _renderVista();
            } catch (e) { ENI.UI.error('Errore: ' + e.message); }
        });
    }

    // --- Modale: parametri previsione + serbatoi ---
    function _showParametri() {
        var p = _parametri;
        var fatt = p.fattori_giorno || {};
        // fattori per i 7 giorni (getDay 1..6,0)
        var giorniOrder = [1, 2, 3, 4, 5, 6, 0];
        var fattoriHtml = giorniOrder.map(function(g) {
            var v = (fatt[g] != null) ? fatt[g] : 1;
            return '<div style="display:flex;align-items:center;gap:6px;"><span style="min-width:36px;">' + GIORNI[g] + '</span>' +
                '<input type="number" min="0" step="0.05" class="form-input oc-fatt" data-dow="' + g + '" value="' + v + '" style="max-width:90px;"></div>';
        }).join('');

        var serbHtml = _prodotti.map(function(prod) {
            var s = _serbatoiMap[prod.id] || {};
            var mm = (p.media_manuale && p.media_manuale[prod.id]) || {};
            return '<div style="border:1px solid var(--color-gray-200);border-radius:var(--radius-md);padding:10px;margin-bottom:8px;">' +
                '<div style="font-weight:600;margin-bottom:6px;">' + ENI.UI.escapeHtml(prod.nome) + '</div>' +
                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
                    _num('Capacità nominale', 'oc-s-nom-' + prod.id, s.capacita_nominale) +
                    _num('Capacità utile', 'oc-s-uti-' + prod.id, s.capacita_utile) +
                    _num('Scorta minima', 'oc-s-sco-' + prod.id, s.scorta_minima) +
                    _num('Lotto minimo', 'oc-s-lot-' + prod.id, s.lotto_minimo) +
                    _num('Media manuale: totale L', 'oc-m-tot-' + prod.id, mm.totale || '') +
                    _num('Media manuale: n° giorni', 'oc-m-gg-' + prod.id, mm.giorni || '') +
                '</div>' +
            '</div>';
        }).join('');

        var body =
            '<div class="section-title">Parametri generali</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">' +
                _num('Finestra storica (giorni)', 'oc-p-finestra', p.finestra_giorni) +
                _num('Orizzonte proiezione (giorni)', 'oc-p-orizzonte', p.orizzonte) +
            '</div>' +
            '<div class="form-group"><label class="form-label">Modalità media consumo</label>' +
                '<select class="form-select" id="oc-p-modalita">' +
                    '<option value="auto"' + (p.modalita_media === 'auto' ? ' selected' : '') + '>Automatica (da erogato storico)</option>' +
                    '<option value="manuale"' + (p.modalita_media === 'manuale' ? ' selected' : '') + '>Manuale (totale ÷ giorni)</option>' +
                '</select></div>' +
            '<div class="section-title">Fattori per giorno (moltiplicatore, 1 = normale)</div>' +
            '<div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:10px;">' + fattoriHtml + '</div>' +
            '<div class="section-title">Serbatoi e media manuale (per prodotto)</div>' +
            serbHtml;

        var modal = ENI.UI.showModal({
            title: '⚙️ Parametri Ordine Carburante', body: body, size: 'lg',
            footer: '<button class="btn btn-outline" data-modal-close>Annulla</button><button class="btn btn-primary" id="oc-p-salva">Salva</button>'
        });

        modal.querySelector('#oc-p-salva').addEventListener('click', async function() {
            try {
                // Parametri
                var fattori = {};
                modal.querySelectorAll('.oc-fatt').forEach(function(inp) { fattori[inp.getAttribute('data-dow')] = parseFloat(inp.value) || 0; });
                var mediaManuale = {};
                _prodotti.forEach(function(prod) {
                    var tot = parseFloat(_v(modal, 'oc-m-tot-' + prod.id));
                    var gg = parseFloat(_v(modal, 'oc-m-gg-' + prod.id));
                    if (!isNaN(tot) || !isNaN(gg)) mediaManuale[prod.id] = { totale: isNaN(tot) ? 0 : tot, giorni: isNaN(gg) ? 0 : gg };
                });
                await ENI.API.salvaParametriPrevisione({
                    finestra_giorni: parseInt(_v(modal, 'oc-p-finestra'), 10) || 12,
                    orizzonte: parseInt(_v(modal, 'oc-p-orizzonte'), 10) || 21,
                    modalita_media: modal.querySelector('#oc-p-modalita').value,
                    fattori_giorno: fattori,
                    media_manuale: mediaManuale
                });
                // Serbatoi
                for (var i = 0; i < _prodotti.length; i++) {
                    var prod = _prodotti[i];
                    await ENI.API.salvaSerbatoio(prod.id, {
                        capacita_nominale: parseFloat(_v(modal, 'oc-s-nom-' + prod.id)) || 0,
                        capacita_utile: parseFloat(_v(modal, 'oc-s-uti-' + prod.id)) || 0,
                        scorta_minima: parseFloat(_v(modal, 'oc-s-sco-' + prod.id)) || 0,
                        lotto_minimo: parseFloat(_v(modal, 'oc-s-lot-' + prod.id)) || 0
                    });
                }
                // ricarica parametri/serbatoi in memoria
                _parametri = await ENI.API.getParametriPrevisione();
                var serbatoi = await ENI.API.getSerbatoi();
                _serbatoiMap = {}; serbatoi.forEach(function(s) { _serbatoiMap[s.prodotto_id] = s; });
                ENI.UI.closeModal(modal);
                ENI.UI.success('Parametri salvati');
                _renderProdotto();
            } catch (e) { ENI.UI.error('Errore: ' + e.message); }
        });
    }

    function _num(label, id, val) {
        return '<div class="form-group"><label class="form-label" style="font-size:0.75rem;">' + label + '</label>' +
            '<input type="number" step="1" class="form-input" id="' + id + '" value="' + (val != null && val !== '' ? val : '') + '"></div>';
    }
    function _v(modal, id) { var el = modal.querySelector('#' + id); return el ? el.value : ''; }

    // --- Vista dispatch ---
    function _renderVista() {
        if (_vista === 'storico') _renderStorico();
        else _renderProdotto();
    }

    // --- Vista Storico (settimane precedenti) ---
    async function _renderStorico() {
        var content = document.getElementById('oc-content');
        if (!content) return;
        content.innerHTML = '<div class="flex justify-center" style="padding:2rem;"><div class="spinner"></div></div>';
        var prod = _prodById(_prodSel);
        var n = _storicoSettimane;
        var lunedi = _mondayOf(_oggi());
        var da = _addGiorni(lunedi, -7 * n);
        var a = _addGiorni(lunedi, -1);
        var erog, consegne;
        try {
            erog = await ENI.API.getErogatoGiornaliero(_prodSel, da, a);
            consegne = await ENI.API.getConsegneStoriche(_prodSel, da, a);
        } catch (e) {
            content.innerHTML = '<div class="empty-state"><p class="empty-state-text">Errore: ' + ENI.UI.escapeHtml(e.message) + '</p></div>';
            return;
        }
        var sett = [];
        for (var w = 0; w < n; w++) {
            var ws = _addGiorni(da, w * 7);
            sett.push({ start: ws, end: _addGiorni(ws, 6), erogato: 0, consegnato: 0, nConsegne: 0 });
        }
        function idxOf(d) { var diff = _daysBetween(da, d); return Math.floor(diff / 7); }
        erog.forEach(function(r) { var k = idxOf(r.data); if (k >= 0 && k < n) sett[k].erogato += r.litri; });
        consegne.forEach(function(r) { var k = idxOf(r.data); if (k >= 0 && k < n) { sett[k].consegnato += r.litri; sett[k].nConsegne += 1; } });

        var totErog = 0, totCons = 0, totNCons = 0;
        sett.forEach(function(s) { totErog += s.erogato; totCons += s.consegnato; totNCons += s.nConsegne; });
        var giorniTot = n * 7;
        var mediaGiorno = giorniTot > 0 ? totErog / giorniTot : 0;
        var mediaPerConsegna = totNCons > 0 ? totCons / totNCons : 0;
        var freq = totNCons > 0 ? giorniTot / totNCons : 0;

        _ultimoStorico = { prod: prod, sett: sett };

        function kpi(lbl, val, extra) { return '<div class="oc-kpi"><div class="oc-kpi-lbl">' + lbl + '</div><div class="oc-kpi-val">' + val + '</div>' + (extra || '') + '</div>'; }

        var selHtml = '<div class="filter-chips" style="margin-bottom:var(--space-3);align-items:center;">' +
            [4, 8, 12].map(function(v) { return '<button class="chip oc-nweek' + (_storicoSettimane === v ? ' active' : '') + '" data-nweek="' + v + '">' + v + ' settimane</button>'; }).join('') +
            '<div style="flex:1;"></div><button class="btn btn-outline btn-sm" id="oc-st-xlsx">📊 Excel</button></div>';

        var kpiHtml = '<div class="oc-kpi-grid">' +
            kpi('Consumo medio/giorno', _fmtL(mediaGiorno) + ' L', '<div class="text-xs text-muted">su ' + n + ' settimane</div>') +
            kpi('Media per consegna', _fmtL(mediaPerConsegna) + ' L', '') +
            kpi('Frequenza ordini', (freq ? Math.round(freq) : '—') + ' gg', '<div class="text-xs text-muted">' + totNCons + ' consegne') +
            kpi('Erogato totale', _fmtL(totErog) + ' L', '') +
        '</div>';

        var chartHtml = '<div style="background:var(--bg-card);border:1px solid var(--color-gray-200);border-radius:var(--radius-md);padding:var(--space-3);margin-bottom:var(--space-3);">' +
            '<div style="font-weight:600;margin-bottom:0.5rem;font-size:0.9rem;">Erogato per settimana</div>' +
            '<div style="position:relative;height:220px;"><canvas id="oc-st-chart"></canvas></div></div>';

        var rows = sett.map(function(s) {
            return '<tr><td>' + _fmtData(s.start) + '–' + _fmtData(s.end) + '</td>' +
                '<td class="text-right">' + _fmtL(s.erogato) + '</td>' +
                '<td class="text-right">' + _fmtL(s.erogato / 7) + '</td>' +
                '<td class="text-right">' + _fmtL(s.consegnato) + '</td>' +
                '<td class="text-right">' + s.nConsegne + '</td></tr>';
        }).join('');
        var tableHtml = '<div class="table-wrapper"><table class="table"><thead><tr>' +
            '<th>Settimana</th><th class="text-right">Erogato</th><th class="text-right">Media/gg</th><th class="text-right">Consegnato</th><th class="text-right">N° consegne</th>' +
            '</tr></thead><tbody>' + rows + '</tbody>' +
            '<tfoot><tr><td><strong>Totale</strong></td><td class="text-right"><strong>' + _fmtL(totErog) + '</strong></td>' +
                '<td class="text-right">' + _fmtL(mediaGiorno) + '</td><td class="text-right"><strong>' + _fmtL(totCons) + '</strong></td>' +
                '<td class="text-right"><strong>' + totNCons + '</strong></td></tr></tfoot></table></div>';

        content.innerHTML = selHtml + kpiHtml + chartHtml + tableHtml;

        content.querySelectorAll('.oc-nweek').forEach(function(b) {
            b.addEventListener('click', function() { _storicoSettimane = parseInt(b.getAttribute('data-nweek'), 10); _renderStorico(); });
        });
        var bx = content.querySelector('#oc-st-xlsx');
        if (bx) bx.addEventListener('click', _esportaStoricoExcel);

        _drawStoricoChart(sett);
    }

    function _drawStoricoChart(sett) {
        var cv = document.getElementById('oc-st-chart');
        if (!cv || typeof Chart === 'undefined') return;
        if (_storicoChart) { try { _storicoChart.destroy(); } catch (e) {} _storicoChart = null; }
        _storicoChart = new Chart(cv, {
            type: 'bar',
            data: { labels: sett.map(function(s) { return _fmtData(s.start); }), datasets: [{ data: sett.map(function(s) { return s.erogato; }), backgroundColor: '#2a78d6', borderRadius: 4 }] },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { callbacks: { label: function(ctx) { return _fmtL(ctx.parsed.y) + ' L'; } } } },
                scales: { x: { grid: { display: false }, ticks: { color: '#898781' } }, y: { grid: { color: '#e1e0d9' }, ticks: { color: '#898781' } } }
            }
        });
    }

    function _esportaStoricoExcel() {
        if (!_ultimoStorico) { ENI.UI.warning('Nessun dato'); return; }
        var righe = _ultimoStorico.sett.map(function(s) {
            return { 'Settimana': _fmtData(s.start) + '–' + _fmtData(s.end), 'Erogato': s.erogato, 'Media/giorno': Math.round(s.erogato / 7), 'Consegnato': s.consegnato, 'N consegne': s.nConsegne };
        });
        try {
            var ws = XLSX.utils.json_to_sheet(righe);
            var wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Storico');
            XLSX.writeFile(wb, 'storico_carburante_' + _prodSel + '_' + _oggi() + '.xlsx');
            ENI.UI.success('Esportato');
        } catch (e) { ENI.UI.error('Errore export'); }
    }

    // --- Export Excel ---
    function _esportaExcel() {
        if (_vista === 'storico') { _esportaStoricoExcel(); return; }
        if (!_ultimo) { ENI.UI.warning('Nessun dato da esportare'); return; }
        var righe = _ultimo.res.cascata.map(function(d) {
            return {
                'Data': d.data, 'Giorno': GIORNI[d.dow],
                'Apertura': d.apertura, 'Carichi': d.carichi, 'Consumo': d.consumo,
                'Chiusura': d.chiusura, 'Stato': d.stato
            };
        });
        try {
            var ws = XLSX.utils.json_to_sheet(righe);
            var wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, (_ultimo.prod.nome || 'Previsione').substring(0, 31));
            XLSX.writeFile(wb, 'ordine_carburante_' + _prodSel + '_' + _oggi() + '.xlsx');
            ENI.UI.success('Esportato');
        } catch (e) { ENI.UI.error('Errore export'); }
    }

    return { render: render, calcolaTutti: calcolaTutti };
})();
