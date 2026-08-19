// ============================================================
// GESTIONALE ENI - Modulo Dashboard
// KPI + grafici + allerte, con selettore periodo e report PDF.
// Incassi distinti per attivita': Carburante / Lavaggi / Bar / Negozio.
// SOLO LETTURA.
// ============================================================

var ENI = ENI || {};
ENI.Modules = ENI.Modules || {};

ENI.Modules.Dashboard = (function() {
    'use strict';

    var _refreshTimer = null;
    var _charts = {};
    var _chartConfigs = {};
    var _periodo = 'oggi';
    var _snapshot = { periodoLabel: 'Oggi', kpi: [] }; // per il PDF

    var COL = {
        blu: '#2a78d6', arancio: '#eb6834', acqua: '#1baf7a', viola: '#4a3aa7',
        griglia: '#e1e0d9', tick: '#898781', testo: '#52514e'
    };

    var PERIODI = [
        { id: 'oggi', label: 'Oggi' }, { id: 'ieri', label: 'Ieri' },
        { id: 'settimana', label: 'Settimana' }, { id: 'mese', label: 'Mese' },
        { id: 'semestre', label: 'Semestre' }, { id: 'anno', label: 'Anno' }
    ];

    function _ruolo() { var u = ENI.State.getUser(); return u ? u.ruolo : ''; }
    function _num(n) { return Math.round(Number(n) || 0).toLocaleString('it-IT'); }
    function _attivita(cat) { return cat === 'Lavaggi' ? 'Lavaggi' : (cat === 'Bar' ? 'Bar' : 'Negozio'); }

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
        switch (id) {
            case 'ieri': var y = _addDays(oggi, -1); return { da: y, a: y, label: 'Ieri', singleDay: true };
            case 'settimana': return { da: _addDays(oggi, -6), a: oggi, label: 'Settimana' };
            case 'mese': return { da: _addDays(oggi, -29), a: oggi, label: 'Mese' };
            case 'semestre': return { da: _addDays(oggi, -179), a: oggi, label: 'Semestre' };
            case 'anno': return { da: _addDays(oggi, -364), a: oggi, label: 'Anno' };
            default: return { da: oggi, a: oggi, label: 'Oggi', singleDay: true };
        }
    }

    async function render(container) {
        var ruolo = _ruolo();
        var vedeSoldi = (ruolo === 'Admin' || ruolo === 'Cassiere');
        var vedeCarburante = (ruolo === 'Admin');

        container.innerHTML =
            '<div class="page-header">' +
                '<h1 class="page-title">\u{1F4CA} Dashboard</h1>' +
                '<span class="text-sm text-muted" id="dashboard-time"></span>' +
            '</div>' +
            '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem;margin-bottom:var(--space-3);">' +
                '<div class="filter-chips" id="periodo-chips">' + _periodoChips() + '</div>' +
                '<button class="btn btn-outline btn-sm" id="btn-pdf">\u{1F4C4} Report PDF</button>' +
            '</div>' +
            '<div class="kpi-grid" id="kpi-grid"></div>' +
            (vedeCarburante ? '<div id="dashboard-ordine" style="margin-top:var(--space-3);">' + _ordineSkeleton() + '</div>' : '') +
            '<div id="dashboard-charts" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:var(--space-4);margin-top:var(--space-4);">' +
                _chartCardsHtml(vedeSoldi, vedeCarburante) +
            '</div>' +
            '<div id="dashboard-alerts" style="margin-top:var(--space-4);"></div>';

        _destroyCharts();

        // Selettore periodo
        var chips = container.querySelector('#periodo-chips');
        if (chips) {
            chips.addEventListener('click', function(e) {
                var b = e.target.closest('[data-periodo]');
                if (!b) return;
                _periodo = b.getAttribute('data-periodo');
                chips.querySelectorAll('[data-periodo]').forEach(function(c) {
                    c.classList.toggle('active', c.getAttribute('data-periodo') === _periodo);
                });
                _aggiornaKPI();
            });
        }
        var btnPdf = container.querySelector('#btn-pdf');
        if (btnPdf) btnPdf.addEventListener('click', _generaPdf);

        // Grafici trend (7 gg fissi) e KPI/ripartizione (periodo) in parallelo:
        // tutte le fetch partono insieme, cosi' i grafici compaiono contemporaneamente.
        await Promise.all([
            _drawTrendCharts(vedeSoldi, vedeCarburante),
            _aggiornaKPI(),
            vedeCarburante ? _renderOrdineCarburante() : Promise.resolve()
        ]);
        _startAutoRefresh();
    }

    function _periodoChips() {
        return PERIODI.map(function(p) {
            return '<button class="chip' + (p.id === _periodo ? ' active' : '') + '" data-periodo="' + p.id + '">' + p.label + '</button>';
        }).join('');
    }

    // ---------- KPI + Allerte + ripartizione (dipendono dal periodo) ----------

    async function _aggiornaKPI() {
        var ruolo = _ruolo();
        var vedeSoldi = (ruolo === 'Admin' || ruolo === 'Cassiere');
        var vedeCarburante = (ruolo === 'Admin');
        var r = _rangePeriodo(_periodo);
        try {
            // Tutte le fetch KPI in parallelo: KPI, ripartizione e allerte compaiono insieme.
            var res = await Promise.all([
                ENI.API.getDashboardData(),
                ENI.API.getLavaggiRange(r.da, r.a),
                vedeSoldi ? ENI.API.getIncassiCategoriaRange(r.da, r.a) : Promise.resolve([]),
                vedeSoldi ? ENI.API.getSottoScorta() : Promise.resolve([]),
                (vedeSoldi && vedeCarburante) ? _carburantePeriodo(r) : Promise.resolve(null)
            ]);
            var base = res[0];
            var lavaggiRows = res[1] || [];
            var incassiRows = res[2] || [];
            var sottoScorta = res[3] || [];
            var carbInfo = res[4];

            var incassi = { Lavaggi: 0, Bar: 0, Negozio: 0 };
            incassiRows.forEach(function(x) { incassi[_attivita(x.categoria)] += Number(x.totale_riga || 0); });

            _renderKPI(base, r, incassi, lavaggiRows, carbInfo, sottoScorta, vedeSoldi, vedeCarburante);
            if (vedeSoldi) _graficoRipartizione(incassiRows);
            _renderAllerte(base, sottoScorta, vedeSoldi);
            _updateTime();
        } catch(e) {
            console.error('Dashboard KPI:', e);
        }
    }

    async function _carburantePeriodo(r) {
        if (r.singleDay) {
            var rows = await ENI.API.getCarburanteRange(_addDays(r.a, -10), r.a);
            var info = _ultimoCarburante(rows);
            info.modo = 'ultimo';
            return info;
        }
        var rows2 = await ENI.API.getCarburanteRange(r.da, r.a);
        var litri = 0, importo = 0;
        rows2.forEach(function(c) { litri += Number(c.litri_totali || 0); importo += Number(c.importo_totale || 0); });
        return { modo: 'periodo', litri: litri, importo: importo, data: null, deltaPct: null };
    }

    function _ultimoCarburante(rows) {
        var perGiorno = {};
        rows.forEach(function(c) {
            var g = (c.data_inizio || '').slice(0, 10);
            if (!g) return;
            if (!perGiorno[g]) perGiorno[g] = { litri: 0, importo: 0 };
            perGiorno[g].litri += Number(c.litri_totali || 0);
            perGiorno[g].importo += Number(c.importo_totale || 0);
        });
        var giorni = Object.keys(perGiorno).sort();
        if (!giorni.length) return { data: null, litri: 0, importo: 0, deltaPct: null };
        var u = perGiorno[giorni[giorni.length - 1]];
        var deltaPct = null;
        if (giorni.length > 1) {
            var p = perGiorno[giorni[giorni.length - 2]];
            if (p.litri > 0) deltaPct = (u.litri - p.litri) / p.litri * 100;
        }
        return { data: giorni[giorni.length - 1], litri: u.litri, importo: u.importo, deltaPct: deltaPct };
    }

    function _renderKPI(data, r, incassi, lavaggiRows, carb, sottoScorta, vedeSoldi, vedeCarburante) {
        var grid = document.getElementById('kpi-grid');
        if (!grid) return;
        var suff = ' · ' + r.label;
        var html = '';
        var pdfKpi = [];

        if (vedeCarburante && carb) {
            if (carb.modo === 'ultimo') {
                if (carb.data) {
                    var trend = '';
                    if (carb.deltaPct !== null) {
                        var su = carb.deltaPct >= 0;
                        trend = ' · <span class="' + (su ? 'text-success' : 'text-danger') + '">' + (su ? '▲' : '▼') + ' ' + Math.abs(Math.round(carb.deltaPct)) + '%</span>';
                    }
                    html += _card('⛽ Carburante · ' + _labelGiorno(carb.data), ENI.UI.formatValuta(carb.importo), _num(carb.litri) + ' litri' + trend, 'marginalita-carburante');
                    pdfKpi.push({ label: 'Carburante (' + _labelGiorno(carb.data) + ')', valore: ENI.UI.formatValuta(carb.importo) + ' · ' + _num(carb.litri) + ' litri' });
                } else {
                    html += _card('⛽ Carburante', '—', '<span class="text-muted">nessun dato</span>', 'marginalita-carburante');
                }
            } else {
                html += _card('⛽ Carburante' + suff, ENI.UI.formatValuta(carb.importo), _num(carb.litri) + ' litri', 'marginalita-carburante');
                pdfKpi.push({ label: 'Carburante' + suff, valore: ENI.UI.formatValuta(carb.importo) + ' · ' + _num(carb.litri) + ' litri' });
            }
        }

        if (vedeSoldi) {
            html += _card('\u{1F697} Incasso lavaggi' + suff, ENI.UI.formatValuta(incassi.Lavaggi), '', 'lavaggi');
            html += _card('☕ Incasso bar' + suff, ENI.UI.formatValuta(incassi.Bar), '', 'vendita');
            html += _card('\u{1F6D2} Incasso negozio' + suff, ENI.UI.formatValuta(incassi.Negozio), 'accessori, AdBlue, oli…', 'vendita');
            html += _card('\u{1F4E6} Scorte sotto minimo', String(sottoScorta.length),
                sottoScorta.length > 0 ? '<span class="text-warning">da riordinare</span>' : '<span class="text-success">✅ Tutto ok</span>', 'magazzino');
            pdfKpi.push({ label: 'Incasso lavaggi' + suff, valore: ENI.UI.formatValuta(incassi.Lavaggi) });
            pdfKpi.push({ label: 'Incasso bar' + suff, valore: ENI.UI.formatValuta(incassi.Bar) });
            pdfKpi.push({ label: 'Incasso negozio' + suff, valore: ENI.UI.formatValuta(incassi.Negozio) });
            pdfKpi.push({ label: 'Scorte sotto minimo', valore: String(sottoScorta.length) });
        }

        var completati = lavaggiRows.filter(function(l) { return l.stato === 'Completato'; }).length;
        html += _card('\u{1F9FC} Lavaggi svolti' + suff, String(completati), lavaggiRows.length + ' totali', 'lavaggi');
        html += _card('\u{1F465} Clienti attivi', String(data.clientiAttivi),
            '\u{1F3E2} ' + data.clientiCorporate + ' · \u{1F464} ' + data.clientiPrivati, 'clienti');
        html += _card('\u{1F4C5} Prenotazioni', String(data.prenotazioniInAttesa),
            data.prenotazioniInAttesaOggi > 0
                ? '<span class="text-danger">\u{1F534} ' + data.prenotazioniInAttesaOggi + ' per oggi</span>'
                : '<span class="text-success">✅ Nessuna urgente</span>', 'lavaggi');
        pdfKpi.push({ label: 'Lavaggi svolti' + suff, valore: String(completati) });
        pdfKpi.push({ label: 'Clienti attivi', valore: String(data.clientiAttivi) });
        pdfKpi.push({ label: 'Prenotazioni da confermare', valore: String(data.prenotazioniInAttesa) });

        grid.innerHTML = html;
        _snapshot = { periodoLabel: r.label, kpi: pdfKpi };
    }

    function _card(label, valore, dettaglio, route) {
        return '<div class="kpi-card"' + (route ? ' onclick="ENI.Router.navigate(\'' + route + '\')" style="cursor:pointer;"' : '') + '>' +
            '<div class="kpi-label">' + label + '</div>' +
            '<div class="kpi-value">' + valore + '</div>' +
            '<div class="kpi-detail">' + dettaglio + '</div>' +
        '</div>';
    }

    // ---------- Card Ordine Carburante (semaforo autonomia serbatoi) ----------

    function _daysBetween(a, b) {
        var pa = a.split('-'), pb = b.split('-');
        var da = new Date(Number(pa[0]), Number(pa[1]) - 1, Number(pa[2]));
        var db = new Date(Number(pb[0]), Number(pb[1]) - 1, Number(pb[2]));
        return Math.round((db - da) / 86400000);
    }

    function _ordineSkeleton() {
        var card = '<div style="background:var(--bg-card);border:1px solid var(--color-gray-200);border-left:4px solid var(--color-gray-200);border-radius:var(--radius-md);padding:var(--space-3);min-height:100px;display:flex;align-items:center;justify-content:center;"><div class="spinner"></div></div>';
        return '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-2);">' +
                '<div style="font-weight:600;">⛽ Ordine carburante</div>' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:var(--space-3);">' + card + card + card + '</div>';
    }

    async function _renderOrdineCarburante() {
        var el = document.getElementById('dashboard-ordine');
        if (!el) return;
        if (!ENI.Modules.OrdineCarburante || !ENI.Modules.OrdineCarburante.calcolaTutti) { el.innerHTML = ''; return; }
        var lista;
        try { lista = await ENI.Modules.OrdineCarburante.calcolaTutti(); }
        catch (e) { console.error('Dashboard ordine carburante:', e); el.innerHTML = ''; return; }
        if (!lista || !lista.length) { el.innerHTML = ''; return; }
        el.innerHTML =
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-2);">' +
                '<div style="font-weight:600;">⛽ Ordine carburante</div>' +
                '<button class="btn btn-outline btn-sm" onclick="ENI.Router.navigate(\'ordine-carburante\')">Apri →</button>' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:var(--space-3);">' +
                lista.map(_ordineCard).join('') +
            '</div>';
    }

    function _ordineCard(item) {
        var prop = item.res.proposta, ind = item.res.indicatori;
        var oggi = ENI.UI.oggiISO();
        var C = { verde: '#1baf7a', giallo: '#eda100', rosso: '#e5484d' };
        var giacL = item.giac ? _num(item.giac.litri) + ' L' : '— da inserire';
        var col, titolo, corpo;
        if (!prop.serve) {
            col = C.verde;
            titolo = '<span style="font-size:1.3rem;font-weight:700;color:' + C.verde + ';">✅ Scorte OK</span>';
            corpo = '<div class="text-xs text-muted" style="margin-top:4px;">Giacenza ' + giacL + ' · autonomia oltre 3 settimane</div>';
        } else {
            var gg = _daysBetween(oggi, prop.dataOrdine);
            col = gg <= 0 ? C.rosso : (gg <= 2 ? C.giallo : C.verde);
            var azione = gg <= 0
                ? '<span style="color:' + C.rosso + ';font-weight:700;">⚠ Ordina SUBITO</span> <span class="text-xs text-muted">(era 8:30 del ' + _labelGiorno(prop.dataOrdine) + ')</span>'
                : '🕗 Ordina entro le <strong>8:30 del ' + _labelGiorno(prop.dataOrdine) + '</strong>';
            titolo = '<span style="font-size:1.4rem;font-weight:700;">' + _num(prop.quantita) + ' L</span> <span class="text-sm text-muted">da ordinare</span>';
            corpo = '<div class="text-sm" style="margin-top:2px;">' + azione + '</div>' +
                '<div class="text-xs text-muted" style="margin-top:4px;">Consegna ' + _labelGiorno(prop.dataConsegna) +
                    ' · giacenza ' + giacL + ' · autonomia ' + (ind.giorniAutonomia != null ? ind.giorniAutonomia + ' gg' : '—') + '</div>';
        }
        return '<div onclick="ENI.Router.navigate(\'ordine-carburante\')" style="cursor:pointer;background:var(--bg-card);border:1px solid var(--color-gray-200);border-left:4px solid ' + col + ';border-radius:var(--radius-md);padding:var(--space-3);">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
                '<div style="font-weight:600;">⛽ ' + ENI.UI.escapeHtml(item.prod.nome) + '</div>' +
                '<span style="width:12px;height:12px;border-radius:50%;background:' + col + ';display:inline-block;"></span>' +
            '</div>' +
            '<div>' + titolo + '</div>' + corpo +
        '</div>';
    }

    function _renderAllerte(data, sottoScorta, vedeSoldi) {
        var el = document.getElementById('dashboard-alerts');
        if (!el) return;
        var blocchi = [];
        if (vedeSoldi && sottoScorta.length > 0) {
            var righe = sottoScorta.slice(0, 8).map(function(p) {
                return '<li>' + ENI.UI.escapeHtml(p.nome_prodotto) +
                    ' <span class="text-muted text-xs">(' + p.giacenza + '/' + p.giacenza_minima + ')</span></li>';
            }).join('');
            blocchi.push(_allertaBox('\u{1F4E6} Scorte sotto minimo (' + sottoScorta.length + ')',
                '<ul style="margin:0;padding-left:1.2rem;">' + righe +
                (sottoScorta.length > 8 ? '<li class="text-muted">…e altri ' + (sottoScorta.length - 8) + '</li>' : '') + '</ul>', 'magazzino', 'warning'));
        }
        if (data.prenotazioniInAttesa > 0) {
            blocchi.push(_allertaBox('\u{1F4C5} Prenotazioni da confermare (' + data.prenotazioniInAttesa + ')',
                '<p style="margin:0;">' + data.prenotazioniInAttesa + ' in attesa' +
                (data.prenotazioniInAttesaOggi > 0 ? ', di cui <strong>' + data.prenotazioniInAttesaOggi + ' per oggi</strong>' : '') + '</p>', 'lavaggi', 'info'));
        }
        el.innerHTML = blocchi.length
            ? '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:var(--space-4);">' + blocchi.join('') + '</div>'
            : '';
    }

    function _allertaBox(titolo, corpo, route, tipo) {
        var bordo = tipo === 'danger' ? 'var(--color-danger)' : tipo === 'warning' ? 'var(--color-warning)' : 'var(--color-primary)';
        return '<div onclick="ENI.Router.navigate(\'' + route + '\')" style="cursor:pointer;background:var(--bg-card);border:1px solid var(--color-gray-200);border-left:4px solid ' + bordo + ';border-radius:var(--radius-md);padding:var(--space-3);">' +
            '<div style="font-weight:600;margin-bottom:0.4rem;">' + titolo + '</div>' +
            '<div class="text-sm">' + corpo + '</div>' +
        '</div>';
    }

    // ---------- Grafici ----------

    function _chartCardsHtml(vedeSoldi, vedeCarburante) {
        var cards = [];
        if (vedeSoldi) {
            cards.push(_chartCard('c-ripartizione', '\u{1F4CA} Ripartizione incassi cassa'));
            cards.push(_chartCard('c-incassi', '\u{1F4C8} Incassi cassa – ultimi 7 giorni'));
        }
        if (vedeCarburante) cards.push(_chartCard('c-carburante', '⛽ Litri carburante – ultimi 7 giorni'));
        cards.push(_chartCard('c-lavaggi', '\u{1F9FC} Lavaggi – ultimi 7 giorni'));
        return cards.join('');
    }

    async function _drawTrendCharts(vedeSoldi, vedeCarburante) {
        if (typeof Chart === 'undefined') {
            var box = document.getElementById('dashboard-charts');
            if (box) box.innerHTML = '<p class="text-muted text-sm">Grafici non disponibili.</p>';
            return;
        }
        try {
            // Fetch in parallelo: i 3 grafici trend si disegnano insieme, non a scaglioni.
            var res = await Promise.all([
                vedeSoldi ? ENI.API.getVenditePeriodo(7) : Promise.resolve([]),
                vedeCarburante ? ENI.API.getCarburantePeriodo(7) : Promise.resolve([]),
                ENI.API.getLavaggiPeriodo(7)
            ]);
            if (vedeSoldi) _graficoIncassi(res[0] || []);
            if (vedeCarburante) _graficoCarburante(res[1] || []);
            _graficoLavaggi(res[2] || []);
        } catch(e) { console.error('Dashboard grafici:', e); }
    }

    function _chartCard(canvasId, titolo) {
        return '<div style="background:var(--bg-card);border:1px solid var(--color-gray-200);border-radius:var(--radius-md);padding:var(--space-3);">' +
            '<div style="font-weight:600;margin-bottom:0.5rem;font-size:0.9rem;">' + titolo + '</div>' +
            '<div style="position:relative;height:220px;"><canvas id="' + canvasId + '"></canvas></div>' +
        '</div>';
    }

    function _ultimiGiorni(n) {
        var out = [], oggi = ENI.UI.oggiISO();
        for (var i = n - 1; i >= 0; i--) out.push(_addDays(oggi, -i));
        return out;
    }
    function _labelGiorno(iso) { var p = iso.split('-'); return p[2] + '/' + p[1]; }

    function _assiTempo() {
        return {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { display: false }, ticks: { color: COL.tick, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } },
                y: { grid: { color: COL.griglia }, ticks: { color: COL.tick } }
            }
        };
    }

    function _serieGiorni(rows, campoData, valFn) {
        var giorni = _ultimiGiorni(7), map = {};
        giorni.forEach(function(g) { map[g] = 0; });
        rows.forEach(function(x) { var g = (x[campoData] || '').slice(0, 10); if (map[g] !== undefined) map[g] += valFn(x); });
        return { labels: giorni.map(_labelGiorno), valori: giorni.map(function(g) { return map[g]; }) };
    }

    function _graficoIncassi(vendite) {
        var s = _serieGiorni(vendite, 'data', function(v) { return Number(v.totale || 0); });
        _mkChart('c-incassi', { type: 'bar', data: { labels: s.labels, datasets: [{ data: s.valori, backgroundColor: COL.blu, borderRadius: 4 }] }, options: _assiTempo() });
    }
    function _graficoCarburante(rows) {
        var s = _serieGiorni(rows, 'data_inizio', function(r) { return Number(r.litri_totali || 0); });
        _mkChart('c-carburante', { type: 'line', data: { labels: s.labels, datasets: [{ data: s.valori, borderColor: COL.arancio, backgroundColor: 'rgba(235,104,52,0.12)', fill: true, tension: 0.25, borderWidth: 2, pointRadius: 2 }] }, options: _assiTempo() });
    }
    function _graficoLavaggi(rows) {
        var s = _serieGiorni(rows, 'data', function() { return 1; });
        _mkChart('c-lavaggi', { type: 'bar', data: { labels: s.labels, datasets: [{ data: s.valori, backgroundColor: COL.acqua, borderRadius: 4 }] }, options: _assiTempo() });
    }

    function _graficoRipartizione(dettagli) {
        var tot = { Lavaggi: 0, Bar: 0, Negozio: 0 };
        dettagli.forEach(function(r) { tot[_attivita(r.categoria)] += Number(r.totale_riga || 0); });
        var voci = [['Lavaggi', tot.Lavaggi, COL.blu], ['Bar', tot.Bar, COL.arancio], ['Negozio', tot.Negozio, COL.acqua]]
            .sort(function(a, b) { return b[1] - a[1]; });
        _mkChart('c-ripartizione', {
            type: 'bar',
            data: { labels: voci.map(function(v) { return v[0]; }), datasets: [{ data: voci.map(function(v) { return v[1]; }), backgroundColor: voci.map(function(v) { return v[2]; }), borderRadius: 4 }] },
            options: {
                indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { callbacks: { label: function(ctx) { return ENI.UI.formatValuta(ctx.parsed.x); } } } },
                scales: { x: { grid: { color: COL.griglia }, ticks: { color: COL.tick } }, y: { grid: { display: false }, ticks: { color: COL.tick } } }
            }
        });
    }

    function _mkChart(canvasId, config) {
        var cv = document.getElementById(canvasId);
        if (!cv) return;
        if (_charts[canvasId]) { _charts[canvasId].destroy(); }
        _charts[canvasId] = new Chart(cv, config);
        _chartConfigs[canvasId] = config;
    }
    function _destroyCharts() {
        Object.keys(_charts).forEach(function(k) { try { _charts[k].destroy(); } catch(e) {} });
        _charts = {};
        _chartConfigs = {};
    }

    // Immagine del grafico ad alta risoluzione (canvas grande + font grandi) per il PDF
    function _immagineGraficoHiRes(config) {
        var canvas = document.createElement('canvas');
        canvas.width = 1000; canvas.height = 420;
        var cfg = JSON.parse(JSON.stringify(config)); // le callback dei tooltip si perdono: ok, e' un'immagine statica
        cfg.options = cfg.options || {};
        cfg.options.animation = false;
        cfg.options.responsive = false;
        cfg.options.maintainAspectRatio = false;
        cfg.options.devicePixelRatio = 2;
        if (cfg.options.scales) {
            ['x', 'y'].forEach(function(ax) {
                if (cfg.options.scales[ax]) {
                    cfg.options.scales[ax].ticks = cfg.options.scales[ax].ticks || {};
                    cfg.options.scales[ax].ticks.font = { size: 16 };
                    cfg.options.scales[ax].ticks.color = '#333333';
                }
            });
        }
        var ch = new Chart(canvas, cfg);
        var img = ch.toBase64Image('image/png', 1);
        ch.destroy();
        return img;
    }

    // ---------- Report PDF ----------

    function _generaPdf() {
        var lib = window.jspdf || (typeof jspdf !== 'undefined' ? jspdf : null);
        if (!lib || !lib.jsPDF) { ENI.UI.error('Libreria PDF non disponibile'); return; }
        try {
            var doc = new lib.jsPDF({ unit: 'mm', format: 'a4' });
            var W = doc.internal.pageSize.getWidth();
            var y = 16;
            doc.setFontSize(16); doc.text('Titanwash – Report dashboard', 14, y); y += 7;
            doc.setFontSize(10); doc.setTextColor(110);
            doc.text('Periodo: ' + _snapshot.periodoLabel + '   ·   Generato: ' + new Date().toLocaleString('it-IT'), 14, y);
            y += 8; doc.setTextColor(0);

            doc.setFontSize(11);
            _snapshot.kpi.forEach(function(k) {
                if (y > 275) { doc.addPage(); y = 16; }
                doc.setTextColor(90); doc.text(k.label + ':', 14, y);
                doc.setTextColor(0); doc.text(String(k.valore), 95, y);
                y += 6.5;
            });
            y += 4;

            var titoli = { 'c-ripartizione': 'Ripartizione incassi cassa', 'c-incassi': 'Incassi cassa (7 giorni)', 'c-carburante': 'Litri carburante (7 giorni)', 'c-lavaggi': 'Lavaggi (7 giorni)' };
            var imgH = 76;
            Object.keys(_charts).forEach(function(id) {
                if (!_chartConfigs[id]) return;
                try {
                    var img = _immagineGraficoHiRes(_chartConfigs[id]);
                    if (y + 6 + imgH > 290) { doc.addPage(); y = 16; }
                    doc.setFontSize(11); doc.setTextColor(0); doc.text(titoli[id] || '', 14, y); y += 4;
                    doc.addImage(img, 'PNG', 14, y, W - 28, imgH);
                    y += imgH + 8;
                } catch(e) {}
            });

            doc.save('report_dashboard_' + ENI.UI.oggiISO() + '.pdf');
        } catch(e) {
            console.error('PDF dashboard:', e);
            ENI.UI.error('Errore nella generazione del PDF');
        }
    }

    // ---------- Utility ----------

    function _updateTime() {
        var el = document.getElementById('dashboard-time');
        if (el) el.textContent = 'Aggiornato: ' + ENI.UI.oraCorrente();
    }
    function _startAutoRefresh() {
        _stopAutoRefresh();
        _refreshTimer = setInterval(function() {
            if (ENI.Router.getCurrentRoute() === 'dashboard') { _aggiornaKPI(); }
            else { _stopAutoRefresh(); _destroyCharts(); }
        }, ENI.Config.DASHBOARD_REFRESH);
    }
    function _stopAutoRefresh() {
        if (_refreshTimer) { clearInterval(_refreshTimer); _refreshTimer = null; }
    }

    return { render: render };
})();
