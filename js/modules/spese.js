// ============================================================
// GESTIONALE ENI - Modulo Spese di cassa
// Registrazione uscite giornaliere + Riepilogo per periodo (report).
// ============================================================

var ENI = ENI || {};
ENI.Modules = ENI.Modules || {};

ENI.Modules.Spese = (function() {
    'use strict';

    var _data = '';
    var _spese = [];
    var _tab = 'registrazione';
    var _periodo = 'mese';
    var _report = [];
    var _chart = null;
    var _chartConfig = null;

    var CATEGORIE = [
        { id: 'Fornitore', icon: '\u{1F69A}', color: '#eb6834' },
        { id: 'Utenze', icon: '\u{1F4A1}', color: '#eda100' },
        { id: 'Carburante', icon: '⛽', color: '#2a78d6' },
        { id: 'Manutenzione', icon: '\u{1F527}', color: '#4a3aa7' },
        { id: 'Personale', icon: '\u{1F464}', color: '#1baf7a' },
        { id: 'Varie', icon: '\u{1F4E6}', color: '#898781' },
        { id: 'Altro', icon: '\u{1F4C1}', color: '#898781' }
    ];

    function _catInfo(cat) {
        for (var i = 0; i < CATEGORIE.length; i++) if (CATEGORIE[i].id === cat) return CATEGORIE[i];
        return { id: cat || 'Varie', icon: '\u{1F4E6}', color: '#898781' };
    }
    function _catBadge(cat) {
        var c = _catInfo(cat);
        return '<span style="display:inline-flex;align-items:center;gap:0.3rem;padding:2px 8px;border-radius:999px;font-size:0.78rem;font-weight:600;color:' + c.color + ';background:' + c.color + '1f;white-space:nowrap;">' + c.icon + ' ' + ENI.UI.escapeHtml(c.id) + '</span>';
    }

    function _addDays(iso, n) {
        var p = iso.split('-');
        var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
        d.setDate(d.getDate() + n);
        var m = String(d.getMonth() + 1).padStart(2, '0');
        var g = String(d.getDate()).padStart(2, '0');
        return d.getFullYear() + '-' + m + '-' + g;
    }
    function _rangePeriodo(id) {
        var oggi = ENI.UI.oggiISO();
        if (id === 'settimana') return { da: _addDays(oggi, -6), a: oggi, label: 'Settimana' };
        if (id === 'anno') return { da: _addDays(oggi, -364), a: oggi, label: 'Anno' };
        return { da: _addDays(oggi, -29), a: oggi, label: 'Mese' };
    }

    // --- Render principale ---

    async function render(container) {
        _data = ENI.UI.oggiISO();
        container.innerHTML =
            '<div class="page-header">' +
                '<h1 class="page-title">\u{1F4B8} Spese di cassa</h1>' +
                '<span class="text-sm text-muted">Uscite di cassa</span>' +
            '</div>' +
            '<div class="filter-chips" id="spese-tabs" style="margin-bottom:var(--space-3);">' +
                '<button class="chip' + (_tab === 'registrazione' ? ' active' : '') + '" data-tab="registrazione">\u{1F4DD} Registrazione</button>' +
                '<button class="chip' + (_tab === 'riepilogo' ? ' active' : '') + '" data-tab="riepilogo">\u{1F4CA} Riepilogo</button>' +
            '</div>' +
            '<div id="spese-content"></div>';

        var tabs = container.querySelector('#spese-tabs');
        tabs.addEventListener('click', function(e) {
            var b = e.target.closest('[data-tab]');
            if (!b) return;
            _tab = b.getAttribute('data-tab');
            tabs.querySelectorAll('[data-tab]').forEach(function(t) { t.classList.toggle('active', t.getAttribute('data-tab') === _tab); });
            _renderTab();
        });

        _renderTab();
    }

    function _renderTab() {
        _destroyChart();
        if (_tab === 'riepilogo') _renderRiepilogo();
        else _renderRegistrazione();
    }

    function _spinner() { return '<div class="flex justify-center" style="padding:2rem;"><div class="spinner"></div></div>'; }

    // ============================================================
    // SCHEDA REGISTRAZIONE (giornaliera)
    // ============================================================

    async function _renderRegistrazione() {
        var contentEl = document.getElementById('spese-content');
        if (contentEl) contentEl.innerHTML = _spinner();
        try { _spese = await ENI.API.getSpeseCassa(_data); } catch(e) { _spese = []; }
        _renderRegistrazionePage();
    }

    function _renderRegistrazionePage() {
        var contentEl = document.getElementById('spese-content');
        if (!contentEl) return;

        var totGiorno = _spese.reduce(function(s, sp) { return s + Number(sp.importo || 0); }, 0);
        var puoScrivere = ENI.State.canWrite('spese');

        contentEl.innerHTML =
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
            (puoScrivere
                ? '<div class="cassa-section">' +
                    '<div class="cassa-section-title">➕ Nuova Spesa</div>' +
                    '<div class="spese-form-grid">' +
                        '<div>' +
                            '<label class="form-label">Categoria</label>' +
                            '<select class="form-select" id="spesa-categoria">' +
                                CATEGORIE.map(function(c) { return '<option value="' + c.id + '"' + (c.id === 'Varie' ? ' selected' : '') + '>' + c.icon + ' ' + c.id + '</option>'; }).join('') +
                            '</select>' +
                        '</div>' +
                        '<div>' +
                            '<label class="form-label">Descrizione <span class="text-danger">*</span></label>' +
                            '<input type="text" class="form-input" id="spesa-descrizione" placeholder="Es. Fornitore caffè, bolletta gas...">' +
                        '</div>' +
                        '<div>' +
                            '<label class="form-label">Importo € <span class="text-danger">*</span></label>' +
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
            '<div class="cassa-section">' +
                '<div class="cassa-section-title">\u{1F4CB} Spese del Giorno</div>' +
                _renderLista(puoScrivere) +
            '</div>';

        var dataInput = document.getElementById('spese-data');
        if (dataInput) dataInput.addEventListener('change', function() { _data = this.value; _renderRegistrazione(); });

        var btnAggiungi = document.getElementById('btn-aggiungi-spesa');
        if (btnAggiungi) btnAggiungi.addEventListener('click', _aggiungiSpesa);

        var inputImporto = document.getElementById('spesa-importo');
        if (inputImporto) inputImporto.addEventListener('keydown', function(e) { if (e.key === 'Enter') _aggiungiSpesa(); });

        contentEl.querySelectorAll('.btn-elimina-spesa').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var sp = _spese.find(function(s) { return s.id === btn.dataset.id; });
                if (sp) _eliminaSpesa(btn.dataset.id, sp);
            });
        });
    }

    function _renderLista(puoScrivere) {
        if (!_spese || _spese.length === 0) {
            return '<div class="empty-state"><div class="empty-state-icon">\u{1F4B8}</div>' +
                '<p class="empty-state-text">Nessuna spesa registrata per questa data</p></div>';
        }
        var totale = 0;
        var html = '<div class="table-wrapper"><table class="table"><thead><tr>' +
            '<th>Categoria</th><th>Descrizione</th><th>Importo</th><th>Note</th>' + (puoScrivere ? '<th></th>' : '') +
            '</tr></thead><tbody>';
        _spese.forEach(function(sp) {
            totale += Number(sp.importo || 0);
            html += '<tr>' +
                '<td>' + _catBadge(sp.categoria) + '</td>' +
                '<td>' + ENI.UI.escapeHtml(sp.descrizione) + '</td>' +
                '<td style="color:var(--color-danger); font-weight:600;">' + ENI.UI.formatValuta(sp.importo) + '</td>' +
                '<td class="text-muted text-sm">' + ENI.UI.escapeHtml(sp.note || '—') + '</td>' +
                (puoScrivere
                    ? '<td><button type="button" class="btn btn-sm btn-elimina-spesa" data-id="' + sp.id + '" style="color:var(--color-danger); border:1px solid var(--color-danger); background:none; border-radius:var(--radius-md); padding:2px 8px; cursor:pointer;">×</button></td>'
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

    async function _aggiungiSpesa() {
        var categoria = (document.getElementById('spesa-categoria') || {}).value || 'Varie';
        var descrizione = ((document.getElementById('spesa-descrizione') || {}).value || '').trim();
        var importo = parseFloat((document.getElementById('spesa-importo') || {}).value) || 0;
        var note = ((document.getElementById('spesa-note') || {}).value || '').trim();

        if (!descrizione) { ENI.UI.warning('Inserisci una descrizione per la spesa'); document.getElementById('spesa-descrizione').focus(); return; }
        if (importo <= 0) { ENI.UI.warning('Inserisci un importo valido maggiore di zero'); document.getElementById('spesa-importo').focus(); return; }

        try {
            ENI.UI.showLoading();
            await ENI.API.salvaSpesa({ data: _data, categoria: categoria, descrizione: descrizione, importo: importo, note: note || null });
            ENI.UI.hideLoading();
            ENI.UI.success('Spesa aggiunta con successo');
            await _renderRegistrazione();
        } catch(e) {
            ENI.UI.hideLoading();
            ENI.UI.error('Errore: ' + e.message);
        }
    }

    async function _eliminaSpesa(id, spesa) {
        var ok = await ENI.UI.confirm({
            title: 'Elimina Spesa',
            message: 'Eliminare "' + ENI.UI.escapeHtml(spesa.descrizione) + '" (' + ENI.UI.formatValuta(spesa.importo) + ')?',
            confirmText: 'Elimina', cancelText: 'Annulla'
        });
        if (!ok) return;
        try {
            ENI.UI.showLoading();
            await ENI.API.eliminaSpesa(id, spesa);
            ENI.UI.hideLoading();
            ENI.UI.success('Spesa eliminata');
            await _renderRegistrazione();
        } catch(e) {
            ENI.UI.hideLoading();
            ENI.UI.error('Errore: ' + e.message);
        }
    }

    // ============================================================
    // SCHEDA RIEPILOGO (report per periodo)
    // ============================================================

    async function _renderRiepilogo() {
        var contentEl = document.getElementById('spese-content');
        if (!contentEl) return;
        var r = _rangePeriodo(_periodo);

        var periodDefs = [{ id: 'settimana', l: 'Settimana' }, { id: 'mese', l: 'Mese' }, { id: 'anno', l: 'Anno' }];
        var chips = periodDefs.map(function(d) { return '<button class="chip' + (_periodo === d.id ? ' active' : '') + '" data-periodo="' + d.id + '">' + d.l + '</button>'; }).join('');

        contentEl.innerHTML =
            '<div class="filter-chips" id="spese-periodo" style="margin-bottom:var(--space-3);">' + chips + '</div>' +
            '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.75rem;margin-bottom:var(--space-3);">' +
                '<div><div class="text-sm text-muted">Totale spese · ' + r.label + '</div>' +
                    '<div id="riep-totale" style="font-size:1.6rem;font-weight:700;color:var(--color-danger);">…</div></div>' +
                '<div><button class="btn btn-outline btn-sm" id="btn-riep-xlsx">\u{1F4CA} Excel</button> ' +
                    '<button class="btn btn-outline btn-sm" id="btn-riep-pdf">\u{1F4C4} PDF</button></div>' +
            '</div>' +
            '<div style="background:var(--bg-card);border:1px solid var(--color-gray-200);border-radius:var(--radius-md);padding:var(--space-3);margin-bottom:var(--space-4);">' +
                '<div style="font-weight:600;margin-bottom:0.5rem;font-size:0.9rem;">\u{1F4CA} Spese per categoria</div>' +
                '<div style="position:relative;height:260px;"><canvas id="spese-chart"></canvas></div>' +
            '</div>' +
            '<div id="riep-lista"></div>';

        var periodBox = document.getElementById('spese-periodo');
        periodBox.addEventListener('click', function(e) {
            var b = e.target.closest('[data-periodo]');
            if (!b) return;
            _periodo = b.getAttribute('data-periodo');
            _renderRiepilogo();
        });
        document.getElementById('btn-riep-xlsx').addEventListener('click', function() { _esportaExcel(r); });
        document.getElementById('btn-riep-pdf').addEventListener('click', function() { _esportaPdf(r); });

        try { _report = await ENI.API.getSpeseCassaReport(r.da, r.a); } catch(e) { _report = []; }
        _renderRiepilogoDati();
    }

    function _aggregaPerCategoria() {
        var perCat = {}, totale = 0;
        _report.forEach(function(s) {
            var k = s.categoria || 'Varie';
            if (!perCat[k]) perCat[k] = { tot: 0, n: 0 };
            perCat[k].tot += Number(s.importo || 0);
            perCat[k].n += 1;
            totale += Number(s.importo || 0);
        });
        var voci = Object.keys(perCat).map(function(k) { return { cat: k, tot: perCat[k].tot, n: perCat[k].n }; })
            .sort(function(a, b) { return b.tot - a.tot; });
        return { voci: voci, totale: totale };
    }

    function _renderRiepilogoDati() {
        var agg = _aggregaPerCategoria();
        var totEl = document.getElementById('riep-totale');
        if (totEl) totEl.textContent = ENI.UI.formatValuta(agg.totale);

        _drawChart(agg.voci);

        var listaEl = document.getElementById('riep-lista');
        if (!listaEl) return;
        if (!agg.voci.length) {
            listaEl.innerHTML = '<div class="empty-state"><div class="empty-state-icon">\u{1F4B8}</div><p class="empty-state-text">Nessuna spesa nel periodo</p></div>';
            return;
        }
        var html = '<div class="table-wrapper"><table class="table"><thead><tr>' +
            '<th>Categoria</th><th>N. spese</th><th>Totale</th><th>%</th></tr></thead><tbody>';
        agg.voci.forEach(function(v) {
            var perc = agg.totale > 0 ? Math.round(v.tot / agg.totale * 100) : 0;
            html += '<tr>' +
                '<td>' + _catBadge(v.cat) + '</td>' +
                '<td class="text-sm">' + v.n + '</td>' +
                '<td style="color:var(--color-danger);font-weight:600;">' + ENI.UI.formatValuta(v.tot) + '</td>' +
                '<td class="text-sm text-muted">' + perc + '%</td>' +
            '</tr>';
        });
        html += '</tbody><tfoot><tr><td><strong>TOTALE</strong></td><td class="text-sm">' + _report.length + '</td>' +
            '<td style="color:var(--color-danger);font-weight:700;">' + ENI.UI.formatValuta(agg.totale) + '</td><td></td></tr></tfoot>' +
            '</table></div>';
        listaEl.innerHTML = html;
    }

    function _drawChart(voci) {
        var cv = document.getElementById('spese-chart');
        if (!cv || typeof Chart === 'undefined') return;
        _destroyChart();
        _chartConfig = {
            type: 'bar',
            data: {
                labels: voci.map(function(v) { return v.cat; }),
                datasets: [{ data: voci.map(function(v) { return v.tot; }), backgroundColor: voci.map(function(v) { return _catInfo(v.cat).color; }), borderRadius: 4 }]
            },
            options: {
                indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { callbacks: { label: function(ctx) { return ENI.UI.formatValuta(ctx.parsed.x); } } } },
                scales: { x: { grid: { color: '#e1e0d9' }, ticks: { color: '#898781' } }, y: { grid: { display: false }, ticks: { color: '#898781' } } }
            }
        };
        _chart = new Chart(cv, _chartConfig);
    }

    function _destroyChart() {
        if (_chart) { try { _chart.destroy(); } catch(e) {} _chart = null; }
    }

    // --- Export ---

    function _esportaExcel(r) {
        if (!_report.length) { ENI.UI.warning('Nessuna spesa da esportare'); return; }
        var righe = _report.map(function(s) {
            return { 'Data': s.data || '', 'Categoria': s.categoria || 'Varie', 'Descrizione': s.descrizione || '', 'Importo': (s.importo != null ? s.importo : ''), 'Note': s.note || '' };
        });
        try {
            var ws = XLSX.utils.json_to_sheet(righe);
            var wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Spese');
            XLSX.writeFile(wb, 'spese_' + r.label.toLowerCase() + '_' + ENI.UI.oggiISO() + '.xlsx');
            ENI.UI.success(righe.length + ' spese esportate');
        } catch(e) { console.error(e); ENI.UI.error('Errore export'); }
    }

    function _immagineGraficoHiRes(config) {
        var canvas = document.createElement('canvas');
        canvas.width = 1000; canvas.height = 420;
        var cfg = JSON.parse(JSON.stringify(config));
        cfg.options = cfg.options || {};
        cfg.options.animation = false;
        cfg.options.responsive = false;
        cfg.options.maintainAspectRatio = false;
        cfg.options.devicePixelRatio = 2;
        if (cfg.options.scales) {
            ['x', 'y'].forEach(function(ax) {
                if (cfg.options.scales[ax]) { cfg.options.scales[ax].ticks = cfg.options.scales[ax].ticks || {}; cfg.options.scales[ax].ticks.font = { size: 16 }; cfg.options.scales[ax].ticks.color = '#333333'; }
            });
        }
        var ch = new Chart(canvas, cfg);
        var img = ch.toBase64Image('image/png', 1);
        ch.destroy();
        return img;
    }

    function _esportaPdf(r) {
        var lib = window.jspdf || (typeof jspdf !== 'undefined' ? jspdf : null);
        if (!lib || !lib.jsPDF) { ENI.UI.error('Libreria PDF non disponibile'); return; }
        if (!_report.length) { ENI.UI.warning('Nessuna spesa da esportare'); return; }
        try {
            var agg = _aggregaPerCategoria();
            var doc = new lib.jsPDF({ unit: 'mm', format: 'a4' });
            var W = doc.internal.pageSize.getWidth();
            var y = 16;
            doc.setFontSize(16); doc.text('Titanwash – Report spese di cassa', 14, y); y += 7;
            doc.setFontSize(10); doc.setTextColor(110);
            doc.text('Periodo: ' + r.label + ' (' + r.da + ' → ' + r.a + ')   ·   Generato: ' + new Date().toLocaleString('it-IT'), 14, y); y += 8;
            doc.setTextColor(0);
            doc.setFontSize(13); doc.text('Totale spese: ' + ENI.UI.formatValuta(agg.totale), 14, y); y += 9;

            doc.setFontSize(11);
            doc.setTextColor(90); doc.text('Categoria', 14, y); doc.text('N.', 110, y); doc.text('Totale', 130, y); doc.text('%', 165, y);
            doc.setTextColor(0); y += 2; doc.line(14, y, W - 14, y); y += 5;
            agg.voci.forEach(function(v) {
                if (y > 270) { doc.addPage(); y = 16; }
                var perc = agg.totale > 0 ? Math.round(v.tot / agg.totale * 100) : 0;
                doc.text(String(v.cat), 14, y); doc.text(String(v.n), 110, y);
                doc.text(ENI.UI.formatValuta(v.tot), 130, y); doc.text(perc + '%', 165, y);
                y += 6.5;
            });
            y += 4;
            if (_chartConfig) {
                try {
                    var img = _immagineGraficoHiRes(_chartConfig);
                    if (y + 80 > 290) { doc.addPage(); y = 16; }
                    doc.setFontSize(11); doc.text('Spese per categoria', 14, y); y += 4;
                    doc.addImage(img, 'PNG', 14, y, W - 28, 76);
                } catch(e) {}
            }
            doc.save('report_spese_' + r.label.toLowerCase() + '_' + ENI.UI.oggiISO() + '.pdf');
        } catch(e) {
            console.error('PDF spese:', e);
            ENI.UI.error('Errore nella generazione del PDF');
        }
    }

    return { render: render };
})();
