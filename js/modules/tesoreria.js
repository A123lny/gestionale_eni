// ============================================================
// TITANWASH - Modulo Tesoreria v2 (Cash Flow Banca-Centrica)
// Castelletto = solo movimenti banca importati
// Previsione = ricorrenti + auto-scadenze carichi + programmati
// ============================================================

var ENI = ENI || {};
ENI.Modules = ENI.Modules || {};

ENI.Modules.Tesoreria = (function() {
    'use strict';

    // --- State ---
    var _activeTab = 'dashboard';
    var _categorie = [];
    var _movimentiBanca = [];
    var _pagamentiRicorrenti = [];
    var _pagamentiProgrammati = [];
    var _container = null;

    // Dashboard state
    var _periodoVista = 'mensile';
    var _meseCorrente = new Date().getMonth() + 1;
    var _annoCorrente = new Date().getFullYear();

    // Movimenti banca filters
    var _bancaFiltro = '';
    var _movimentiDa = '';
    var _movimentiA = '';

    // Import state
    var _importParsedData = null; // { headers, rows, objects }
    var _importMapping = {};

    // Saldi iniziali per banca (salvati in localStorage)
    var _saldiIniziali = _loadSaldiIniziali();

    // Storico & Previsioni state
    var _storicoDettaglioMese = null; // 'YYYY-MM' or null = summary
    var _storicoChart = null;
    var DATA_APERTURA = '2026-02-01';

    // ============================================================
    // RENDER PRINCIPALE
    // ============================================================

    async function render(container) {
        _container = container;

        container.innerHTML =
            '<div class="page-header">' +
                '<h1 class="page-title">\u{1F3E6} Tesoreria</h1>' +
                '<span class="text-sm text-muted">Flussi di cassa e previsioni</span>' +
            '</div>' +
            _renderTabs() +
            '<div id="tesoreria-content">' +
                '<div class="flex justify-center" style="padding:2rem;"><div class="spinner"></div></div>' +
            '</div>';

        _setupTabListeners();
        await _loadTab();
    }

    // ============================================================
    // TABS
    // ============================================================

    function _renderTabs() {
        var tabs = [
            { id: 'dashboard', label: 'Dashboard', icon: '\u{1F4CA}' },
            { id: 'movimenti', label: 'Movimenti Banca', icon: '\u{1F3E6}' },
            { id: 'ricorrenti', label: 'Ricorrenti', icon: '\u{1F504}' },
            { id: 'programmati', label: 'Programmati', icon: '\u{1F4C5}' },
            { id: 'categorie', label: 'Categorie', icon: '\u{1F3F7}\uFE0F' },
            { id: 'storico', label: 'Storico & Previsioni', icon: '\u{1F4C8}' }
        ];

        var html = '<div class="tesoreria-tabs">';
        tabs.forEach(function(tab) {
            html += '<button class="tesoreria-tab' + (_activeTab === tab.id ? ' active' : '') +
                '" data-tab="' + tab.id + '">' +
                '<span class="tesoreria-tab-icon">' + tab.icon + '</span>' +
                '<span class="tesoreria-tab-label">' + tab.label + '</span>' +
                '</button>';
        });
        html += '</div>';
        return html;
    }

    function _setupTabListeners() {
        document.querySelectorAll('.tesoreria-tab').forEach(function(btn) {
            btn.addEventListener('click', function() {
                _activeTab = btn.dataset.tab;
                document.querySelectorAll('.tesoreria-tab').forEach(function(t) {
                    t.classList.toggle('active', t.dataset.tab === _activeTab);
                });
                _loadTab();
            });
        });
    }

    async function _loadTab() {
        var content = document.getElementById('tesoreria-content');
        if (!content) return;
        content.innerHTML = '<div class="flex justify-center" style="padding:2rem;"><div class="spinner"></div></div>';

        try {
            switch (_activeTab) {
                case 'dashboard': await _renderDashboard(content); break;
                case 'movimenti': await _renderMovimenti(content); break;
                case 'ricorrenti': await _renderRicorrenti(content); break;
                case 'programmati': await _renderProgrammati(content); break;
                case 'categorie': await _renderCategorie(content); break;
                case 'storico': await _renderStorico(content); break;
            }
        } catch(e) {
            content.innerHTML = '<div class="empty-state"><p class="text-danger">Errore: ' + ENI.UI.escapeHtml(e.message) + '</p></div>';
            console.error('Tesoreria tab error:', e);
        }
    }

    // ============================================================
    // TAB: DASHBOARD
    // ============================================================

    async function _renderDashboard(content) {
        var anno = _annoCorrente;
        var mese = _meseCorrente;
        var periodoRange = _getPeriodoRange(anno, mese, _periodoVista);

        // Carica ultimi 150 giorni di carichi per auto-scadenze (monofase 120gg)
        var oggi = new Date();
        var da150gg = new Date(oggi);
        da150gg.setDate(da150gg.getDate() - 150);
        var da150ggStr = da150gg.toISOString().split('T')[0];

        // Media spese cassa e crediti 4TS per previsione
        var da30gg = new Date(oggi);
        da30gg.setDate(da30gg.getDate() - 30);
        var da30ggStr = da30gg.toISOString().split('T')[0];
        var oggiStrFull = oggi.toISOString().split('T')[0];

        // 4TS: mese precedente (i clienti pagano entro il 15 del mese successivo)
        var mesePrev4ts = oggi.getMonth(); // 0-based, quindi e' il mese precedente se usiamo come 1-based
        var annoPrev4ts = oggi.getFullYear();
        if (mesePrev4ts === 0) { mesePrev4ts = 12; annoPrev4ts--; }

        var results = await Promise.all([
            ENI.API.getUltimoSaldoBanca(),
            ENI.API.getMovimentiBanca({ da: periodoRange.da, a: periodoRange.a, asc: true }),
            ENI.API.getPagamentiRicorrenti(true),
            ENI.API.getPagamentiProgrammati('programmato'),
            ENI.API.getCarichiCarburante(da150ggStr, null),
            _getAccreditiBanca30gg(),
            ENI.API.getSpeseCassaPeriodo(da30ggStr, oggiStrFull),
            ENI.API.get4TSCardMese(annoPrev4ts, mesePrev4ts)
        ]);

        var ultimoSaldo = results[0];
        var movimenti = results[1];
        var ricorrenti = results[2];
        var programmati = results[3];
        var carichi = results[4] || [];
        var accrediti30gg = results[5];
        var speseCassa30gg = results[6] || [];
        var totale4TSMesePrecedente = results[7] || 0;

        // Media giornaliera spese cassa
        var totSpeseCassa = speseCassa30gg.reduce(function(s, sp) { return s + (parseFloat(sp.importo) || 0); }, 0);
        var mediaSpeseCassaGiorno = totSpeseCassa > 0 ? totSpeseCassa / 30 : 0;

        // Entrata 4TS prevista: se siamo prima del 15, il credito del mese precedente e' in arrivo
        var entrata4TS = { importo: totale4TSMesePrecedente, inArrivo: oggi.getDate() <= 15 && totale4TSMesePrecedente > 0 };

        // Auto-scadenze da carichi
        var autoScadenze = _getAutoScadenzeCarichi(carichi);

        // Castelletto: SOLO movimenti banca
        var flussi = _buildFlussi(movimenti);

        // KPI: saldo banca dall'ultimo movimento importato con saldo, oppure dal castelletto calcolato
        var saldoBanca = 0;
        var saldoBancaLabel = 'Nessun dato';
        if (ultimoSaldo && ultimoSaldo.saldo_progressivo != null) {
            saldoBanca = Number(ultimoSaldo.saldo_progressivo);
            saldoBancaLabel = ultimoSaldo.banca.toUpperCase() + ' - ' + ENI.UI.formatData(ultimoSaldo.data_operazione);
        } else if (flussi.length > 0) {
            saldoBanca = flussi[flussi.length - 1].saldo || 0;
            saldoBancaLabel = 'Calcolato al ' + ENI.UI.formatData(flussi[flussi.length - 1].data);
        }

        // Scadenze nei prossimi 7gg e 30gg
        var oggiStr = ENI.UI.oggiISO();
        var scadenzeCount = _contaScadenzeProssime(ricorrenti, programmati, autoScadenze, 7);

        // Uscite/entrate previste 30gg
        var prev30 = _calcolaPrevisto30gg(ricorrenti, programmati, autoScadenze, accrediti30gg, mediaSpeseCassaGiorno, entrata4TS);

        content.innerHTML =
            // Selettore periodo
            '<div class="tesoreria-periodo-bar">' +
                '<button class="btn btn-sm" id="teso-prev">\u2190</button>' +
                '<div class="tesoreria-periodo-toggle">' +
                    '<button class="tesoreria-periodo-btn' + (_periodoVista === 'mensile' ? ' active' : '') + '" data-periodo="mensile">Mensile</button>' +
                    '<button class="tesoreria-periodo-btn' + (_periodoVista === 'trimestrale' ? ' active' : '') + '" data-periodo="trimestrale">Trimestrale</button>' +
                    '<button class="tesoreria-periodo-btn' + (_periodoVista === 'annuale' ? ' active' : '') + '" data-periodo="annuale">Annuale</button>' +
                '</div>' +
                '<span class="tesoreria-periodo-label">' + _getPeriodoLabel(anno, mese, _periodoVista) + '</span>' +
                '<button class="btn btn-sm" id="teso-next">\u2192</button>' +
            '</div>' +

            // KPI Cards
            '<div class="tesoreria-kpi-grid">' +
                _renderKpiCard('Saldo Banca', saldoBanca, saldoBancaLabel, 'info') +
                _renderKpiCard('Uscite Previste 30gg', prev30.uscite, prev30.dettaglioUscite, 'danger') +
                _renderKpiCard('Entrate Previste 30gg', prev30.entrate, prev30.dettaglioEntrate, 'success') +
                _renderKpiCard('Scadenze 7gg', null, scadenzeCount + ' pagament' + (scadenzeCount === 1 ? 'o' : 'i'), scadenzeCount > 0 ? 'warning' : 'success', scadenzeCount) +
            '</div>' +

            // Castelletto
            '<div class="cassa-section">' +
                '<div class="cassa-section-title">\u{1F4CA} Castelletto - Movimenti Banca</div>' +
                _renderCastellettoTable(flussi) +
            '</div>' +

            // Previsione
            '<div class="cassa-section">' +
                '<div class="cassa-section-title">\u{1F52E} Previsione Cash Flow (3 mesi)</div>' +
                _renderPrevisione(saldoBanca, ricorrenti, programmati, autoScadenze, accrediti30gg, mediaSpeseCassaGiorno, entrata4TS) +
            '</div>' +

            // Prossime scadenze
            '<div class="cassa-section">' +
                '<div class="cassa-section-title">\u23F0 Prossime Scadenze (30 giorni)</div>' +
                _renderProssimeScadenze(ricorrenti, programmati, autoScadenze, entrata4TS) +
            '</div>';

        _setupDashboardListeners();
    }

    function _renderKpiCard(label, valore, sub, color, countValue) {
        var valoreHtml = countValue !== undefined
            ? '<div class="tesoreria-kpi-value">' + countValue + '</div>'
            : '<div class="tesoreria-kpi-value">' + ENI.UI.formatValuta(valore) + '</div>';

        return '<div class="tesoreria-kpi-card tesoreria-kpi-' + color + '">' +
            '<div class="tesoreria-kpi-label">' + label + '</div>' +
            valoreHtml +
            '<div class="tesoreria-kpi-sub">' + ENI.UI.escapeHtml(sub) + '</div>' +
        '</div>';
    }

    function _renderCastellettoTable(flussi) {
        if (!flussi || flussi.length === 0) {
            return '<div class="empty-state">' +
                '<div class="empty-state-icon">\u{1F4E5}</div>' +
                '<p class="empty-state-text">Nessun movimento bancario nel periodo</p>' +
                '<p class="text-sm text-muted">Importa un estratto conto dalla tab "Movimenti Banca"</p>' +
            '</div>';
        }

        var html = '<div class="table-responsive"><table class="table">' +
            '<thead><tr>' +
                '<th>Data</th><th>Descrizione</th><th>Banca</th>' +
                '<th style="text-align:right;">Entrata</th>' +
                '<th style="text-align:right;">Uscita</th>' +
                '<th style="text-align:right;">Saldo</th>' +
            '</tr></thead><tbody>';

        flussi.forEach(function(f) {
            var saldoClass = f.saldo >= 0 ? 'text-success' : 'text-danger';
            var rowClass = f.importo >= 0 ? 'tesoreria-row-entrata' : 'tesoreria-row-uscita';

            html += '<tr class="' + rowClass + '">' +
                '<td>' + ENI.UI.formatData(f.data) + '</td>' +
                '<td>' + ENI.UI.escapeHtml(f.descrizione) + '</td>' +
                '<td><span class="badge badge-sm tesoreria-badge-' + f.banca + '">' + (f.banca || '').toUpperCase() + '</span></td>' +
                '<td style="text-align:right;">' + (f.importo > 0 ? ENI.UI.formatValuta(f.importo) : '') + '</td>' +
                '<td style="text-align:right;">' + (f.importo < 0 ? ENI.UI.formatValuta(Math.abs(f.importo)) : '') + '</td>' +
                '<td style="text-align:right;font-weight:600;" class="' + saldoClass + '">' + ENI.UI.formatValuta(f.saldo) + '</td>' +
            '</tr>';
        });

        html += '</tbody></table></div>';

        // Riepilogo totali
        var totEntrate = flussi.reduce(function(s, f) { return s + (f.importo > 0 ? f.importo : 0); }, 0);
        var totUscite = flussi.reduce(function(s, f) { return s + (f.importo < 0 ? Math.abs(f.importo) : 0); }, 0);
        var saldoFinale = flussi.length > 0 ? flussi[flussi.length - 1].saldo : 0;

        html += '<div class="tesoreria-totali-row">' +
            '<div class="tesoreria-totale tesoreria-totale-entrata">' +
                '<span>Totale Entrate</span><strong>' + ENI.UI.formatValuta(totEntrate) + '</strong>' +
            '</div>' +
            '<div class="tesoreria-totale tesoreria-totale-uscita">' +
                '<span>Totale Uscite</span><strong>' + ENI.UI.formatValuta(totUscite) + '</strong>' +
            '</div>' +
            '<div class="tesoreria-totale ' + (saldoFinale >= 0 ? 'tesoreria-totale-positivo' : 'tesoreria-totale-negativo') + '">' +
                '<span>Saldo Finale</span><strong>' + ENI.UI.formatValuta(saldoFinale) + '</strong>' +
            '</div>' +
        '</div>';

        return html;
    }

    function _renderPrevisione(saldoAttuale, ricorrenti, programmati, autoScadenze, accrediti30gg, mediaSpeseCassaGiorno, entrata4TS) {
        // Media giornaliera dagli accrediti bancari reali (ultimi 30gg)
        var mediaGiornaliera = 0;
        if (accrediti30gg.totale > 0 && accrediti30gg.giorni > 0) {
            mediaGiornaliera = accrediti30gg.totale / accrediti30gg.giorni;
        }

        var oggi = new Date();
        var previsioni = [];

        for (var m = 0; m < 3; m++) {
            var meseTarget = new Date(oggi.getFullYear(), oggi.getMonth() + m + 1, 0);
            var giorniNelMese = meseTarget.getDate();
            var giorniRimanenti = m === 0 ? giorniNelMese - oggi.getDate() : giorniNelMese;
            var meseNum = meseTarget.getMonth() + 1;
            var annoNum = meseTarget.getFullYear();

            var entratePreviste = mediaGiornaliera * giorniRimanenti;
            var uscitePreviste = 0;

            // Spese cassa (contanti) previste per il mese
            uscitePreviste += (mediaSpeseCassaGiorno || 0) * giorniRimanenti;

            // Entrata 4TS Card: i clienti pagano entro il 15 del mese successivo
            // Se questo mese e' quello in cui arriva il pagamento e siamo prima del 15
            if (entrata4TS && entrata4TS.importo > 0) {
                if (m === 0 && entrata4TS.inArrivo) {
                    entratePreviste += entrata4TS.importo;
                }
            }

            // Ricorrenti
            ricorrenti.forEach(function(r) {
                if (_ricorrenteCadeInMese(r, meseNum, annoNum)) {
                    if (r.tipo === 'uscita') uscitePreviste += Number(r.importo);
                    else entratePreviste += Number(r.importo);
                }
            });

            // Programmati
            programmati.forEach(function(p) {
                var scadenza = new Date(p.data_scadenza);
                if (scadenza.getMonth() + 1 === meseNum && scadenza.getFullYear() === annoNum) {
                    if (p.tipo === 'uscita') uscitePreviste += Number(p.importo);
                    else entratePreviste += Number(p.importo);
                }
            });

            // Auto-scadenze carichi
            autoScadenze.forEach(function(s) {
                var scadData = new Date(s.data_scadenza);
                if (scadData.getMonth() + 1 === meseNum && scadData.getFullYear() === annoNum) {
                    uscitePreviste += s.importo;
                }
            });

            saldoAttuale = saldoAttuale + entratePreviste - uscitePreviste;

            previsioni.push({
                mese: _getNomeMese(meseTarget.getMonth()) + ' ' + meseTarget.getFullYear(),
                entrate: entratePreviste,
                uscite: uscitePreviste,
                saldo: saldoAttuale
            });
        }

        var html = '<div class="table-responsive"><table class="table">' +
            '<thead><tr><th>Mese</th><th style="text-align:right;">Entrate Previste</th>' +
            '<th style="text-align:right;">Uscite Previste</th><th style="text-align:right;">Saldo Previsto</th></tr></thead><tbody>';

        previsioni.forEach(function(p) {
            var saldoClass = p.saldo >= 0 ? 'text-success' : 'text-danger';
            html += '<tr>' +
                '<td><strong>' + p.mese + '</strong></td>' +
                '<td style="text-align:right;" class="text-success">' + ENI.UI.formatValuta(p.entrate) + '</td>' +
                '<td style="text-align:right;" class="text-danger">' + ENI.UI.formatValuta(p.uscite) + '</td>' +
                '<td style="text-align:right;font-weight:700;" class="' + saldoClass + '">' + ENI.UI.formatValuta(p.saldo) + '</td>' +
            '</tr>';
        });

        html += '</tbody></table></div>';

        var notePrev = [];
        if (mediaGiornaliera > 0) {
            notePrev.push('Media accrediti giornalieri (30gg): ' + ENI.UI.formatValuta(mediaGiornaliera));
        } else {
            notePrev.push('Importa movimenti bancari per calcolare la media incassi giornaliera');
        }
        if (mediaSpeseCassaGiorno > 0) {
            notePrev.push('Media spese contanti giornaliere (30gg): ' + ENI.UI.formatValuta(mediaSpeseCassaGiorno));
        }
        if (entrata4TS && entrata4TS.importo > 0 && entrata4TS.inArrivo) {
            notePrev.push('Credito 4TS Card in arrivo entro il 15: ' + ENI.UI.formatValuta(entrata4TS.importo));
        }

        html += '<div class="text-sm text-muted" style="margin-top:var(--space-2);">' +
            notePrev.join(' &bull; ') + '</div>';

        return html;
    }

    function _renderProssimeScadenze(ricorrenti, programmati, autoScadenze, entrata4TS) {
        var scadenze = [];
        var oggi = new Date();
        var limite = new Date();
        limite.setDate(limite.getDate() + 30);
        var oggiStr = ENI.UI.oggiISO();
        var limiteStr = limite.toISOString().split('T')[0];

        // Entrata 4TS Card: pagamento atteso entro il 15 del mese corrente
        if (entrata4TS && entrata4TS.importo > 0 && entrata4TS.inArrivo) {
            var data15 = oggi.getFullYear() + '-' + String(oggi.getMonth() + 1).padStart(2, '0') + '-15';
            if (data15 >= oggiStr && data15 <= limiteStr) {
                scadenze.push({
                    data: data15,
                    descrizione: 'Incasso 4TS Card (mese precedente)',
                    importo: entrata4TS.importo,
                    tipo: 'entrata',
                    fonte: '4tscard'
                });
            }
        }

        // Programmati
        programmati.forEach(function(p) {
            if (p.data_scadenza >= oggiStr && p.data_scadenza <= limiteStr) {
                scadenze.push({
                    data: p.data_scadenza,
                    descrizione: p.descrizione,
                    importo: Number(p.importo),
                    tipo: p.tipo,
                    fonte: 'programmato'
                });
            }
        });

        // Ricorrenti
        ricorrenti.forEach(function(r) {
            var prossimeDate = _getProssimeDateRicorrente(r, oggi, limite);
            prossimeDate.forEach(function(d) {
                scadenze.push({
                    data: d,
                    descrizione: r.descrizione + ' (' + r.frequenza + ')',
                    importo: Number(r.importo),
                    tipo: r.tipo,
                    fonte: 'ricorrente'
                });
            });
        });

        // Auto-scadenze carichi carburante
        autoScadenze.forEach(function(s) {
            if (s.data_scadenza >= oggiStr && s.data_scadenza <= limiteStr) {
                scadenze.push({
                    data: s.data_scadenza,
                    descrizione: s.descrizione,
                    importo: s.importo,
                    tipo: 'uscita',
                    fonte: 'carico'
                });
            }
        });

        scadenze.sort(function(a, b) { return a.data.localeCompare(b.data); });

        if (scadenze.length === 0) {
            return '<div class="empty-state"><p class="empty-state-text">Nessuna scadenza nei prossimi 30 giorni</p></div>';
        }

        var html = '<div class="tesoreria-scadenze-list">';
        scadenze.forEach(function(s) {
            var badgeClass = s.tipo === 'uscita' ? 'badge-danger' : 'badge-success';
            var fonteBadgeMap = { carico: 'tesoreria-badge-carico', ricorrente: 'tesoreria-badge-ricorrente', programmato: 'tesoreria-badge-programmato', '4tscard': 'tesoreria-badge-4tscard' };
            var fonteBadge = fonteBadgeMap[s.fonte] || 'tesoreria-badge-programmato';
            var giorniMancanti = Math.ceil((new Date(s.data) - oggi) / (1000 * 60 * 60 * 24));
            var urgenza = giorniMancanti <= 3 ? ' tesoreria-scadenza-urgente' : (giorniMancanti <= 7 ? ' tesoreria-scadenza-prossima' : '');

            html += '<div class="tesoreria-scadenza-item' + urgenza + '">' +
                '<div class="tesoreria-scadenza-data">' +
                    '<div class="tesoreria-scadenza-giorno">' + new Date(s.data).getDate() + '</div>' +
                    '<div class="tesoreria-scadenza-mese">' + _getNomeMeseBreve(new Date(s.data).getMonth()) + '</div>' +
                '</div>' +
                '<div class="tesoreria-scadenza-info">' +
                    '<div class="tesoreria-scadenza-desc">' + ENI.UI.escapeHtml(s.descrizione) + '</div>' +
                    '<span class="badge ' + badgeClass + '">' + s.tipo + '</span>' +
                    '<span class="badge ' + fonteBadge + '">' + _fonteLabelMap(s.fonte) + '</span>' +
                '</div>' +
                '<div class="tesoreria-scadenza-importo ' + (s.tipo === 'uscita' ? 'text-danger' : 'text-success') + '">' +
                    (s.tipo === 'uscita' ? '-' : '+') + ENI.UI.formatValuta(s.importo) +
                '</div>' +
            '</div>';
        });
        html += '</div>';

        return html;
    }

    function _setupDashboardListeners() {
        var prevBtn = document.getElementById('teso-prev');
        var nextBtn = document.getElementById('teso-next');
        if (prevBtn) prevBtn.addEventListener('click', function() { _navigaPeriodo(-1); });
        if (nextBtn) nextBtn.addEventListener('click', function() { _navigaPeriodo(1); });

        document.querySelectorAll('.tesoreria-periodo-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                _periodoVista = btn.dataset.periodo;
                document.querySelectorAll('.tesoreria-periodo-btn').forEach(function(b) {
                    b.classList.toggle('active', b.dataset.periodo === _periodoVista);
                });
                _loadTab();
            });
        });
    }

    function _navigaPeriodo(dir) {
        if (_periodoVista === 'mensile') {
            _meseCorrente += dir;
            if (_meseCorrente > 12) { _meseCorrente = 1; _annoCorrente++; }
            if (_meseCorrente < 1) { _meseCorrente = 12; _annoCorrente--; }
        } else if (_periodoVista === 'trimestrale') {
            _meseCorrente += dir * 3;
            if (_meseCorrente > 12) { _meseCorrente -= 12; _annoCorrente++; }
            if (_meseCorrente < 1) { _meseCorrente += 12; _annoCorrente--; }
        } else {
            _annoCorrente += dir;
        }
        _loadTab();
    }

    // ============================================================
    // TAB: MOVIMENTI BANCA (con Import Mapper Colonne)
    // ============================================================

    async function _renderMovimenti(content) {
        _movimentiBanca = await ENI.API.getMovimentiBanca({
            banca: _bancaFiltro || undefined,
            da: _movimentiDa || undefined,
            a: _movimentiA || undefined,
            asc: true,
            limit: 1000
        });

        var puoScrivere = ENI.State.canWrite('tesoreria');
        var oggi = ENI.UI.oggiISO();

        content.innerHTML =
            (puoScrivere ? _renderImportZone() : '') +

            // Filtri
            '<div class="cassa-section">' +
                '<div class="cassa-section-title">\u{1F50D} Filtri' +
                    (_bancaFiltro || _movimentiDa || _movimentiA
                        ? ' <span class="badge badge-warning badge-sm">Filtri attivi</span>' : '') +
                '</div>' +
                '<div style="display:flex; gap:var(--space-3); flex-wrap:wrap; align-items:end;">' +
                    '<div><label class="form-label">Banca</label>' +
                        '<select class="form-select" id="filtro-banca">' +
                            '<option value="">Tutte</option>' +
                            '<option value="carisp"' + (_bancaFiltro === 'carisp' ? ' selected' : '') + '>Carisp</option>' +
                            '<option value="bsi"' + (_bancaFiltro === 'bsi' ? ' selected' : '') + '>BSI</option>' +
                        '</select>' +
                    '</div>' +
                    '<div><label class="form-label">Da</label>' +
                        '<input type="date" class="form-input" id="filtro-mov-da" value="' + (_movimentiDa || '') + '">' +
                    '</div>' +
                    '<div><label class="form-label">A</label>' +
                        '<input type="date" class="form-input" id="filtro-mov-a" value="' + (_movimentiA || '') + '" max="' + oggi + '">' +
                    '</div>' +
                    '<button class="btn btn-primary btn-sm" id="btn-filtra-mov">\u{1F50D} Filtra</button>' +
                    '<button class="btn btn-outline btn-sm" id="btn-reset-mov">\u{1F504} Reset</button>' +
                '</div>' +
            '</div>' +

            // Lista movimenti
            '<div class="cassa-section">' +
                '<div class="cassa-section-title">\u{1F4CB} Movimenti (' + _movimentiBanca.length + ')' +
                    (_movimentiBanca.length >= 1000 ? ' <span class="badge badge-warning badge-sm">Limite raggiunto - usa i filtri per date</span>' : '') +
                '</div>' +
                _renderMovimentiTable() +
            '</div>';

        _setupMovimentiListeners();
    }

    function _renderImportZone() {
        var saldoCarisp = _getSaldoIniziale('carisp');
        var saldoBsi = _getSaldoIniziale('bsi');

        return '<div class="cassa-section tesoreria-import-zone" id="import-zone">' +
            '<div class="cassa-section-title">\u{1F4E5} Importa Estratto Conto</div>' +
            '<div class="tesoreria-import-content">' +
                '<div style="display:flex; gap:var(--space-3); align-items:end; flex-wrap:wrap;">' +
                    '<div><label class="form-label">Banca *</label>' +
                        '<select class="form-select" id="import-banca">' +
                            '<option value="carisp">Cassa di Risparmio</option>' +
                            '<option value="bsi">BSI</option>' +
                        '</select>' +
                    '</div>' +
                    '<div>' +
                        '<label class="form-label">File CSV o Excel *</label>' +
                        '<input type="file" class="form-input" id="import-file" accept=".csv,.xlsx,.xls">' +
                    '</div>' +
                    '<div style="margin-left:auto;">' +
                        '<button class="btn btn-outline btn-sm text-danger" id="btn-svuota-movimenti" title="Elimina tutti i movimenti importati per reimportarli con la mappatura corretta">' +
                            '\u{1F5D1}\uFE0F Svuota movimenti importati</button>' +
                    '</div>' +
                '</div>' +

                // Saldo iniziale per banca
                '<div class="tesoreria-saldo-iniziale" style="margin-top:var(--space-3); padding:var(--space-3); background:var(--bg-surface, #f8f9fa); border-radius:var(--radius-md); border:1px solid var(--border-color, #dee2e6);">' +
                    '<div style="font-weight:600; margin-bottom:var(--space-2);">\u{1F3E6} Saldo Iniziale per Banca</div>' +
                    '<p class="text-sm text-muted" style="margin-bottom:var(--space-2);">Inserisci il saldo del conto al giorno prima del primo movimento importato. Serve per calcolare il saldo progressivo corretto.</p>' +
                    '<div style="display:flex; gap:var(--space-4); flex-wrap:wrap;">' +
                        '<div style="flex:1; min-width:200px;">' +
                            '<label class="form-label">Carisp - Saldo iniziale (\u20AC)</label>' +
                            '<div style="display:flex; gap:var(--space-2); align-items:center;">' +
                                '<input type="number" class="form-input" id="saldo-ini-carisp" step="0.01" value="' + (saldoCarisp ? saldoCarisp.importo : '') + '" placeholder="Es. 371.18" style="flex:1;">' +
                                '<input type="date" class="form-input" id="saldo-ini-data-carisp" value="' + (saldoCarisp ? saldoCarisp.data : '2026-01-31') + '" style="width:150px;" title="Data del saldo">' +
                                '<button class="btn btn-sm btn-primary" id="btn-salva-saldo-carisp">Salva</button>' +
                            '</div>' +
                            (saldoCarisp ? '<div class="text-sm text-success" style="margin-top:2px;">\u2705 Saldo impostato: ' + ENI.UI.formatValuta(saldoCarisp.importo) + ' al ' + ENI.UI.formatData(saldoCarisp.data) + '</div>' : '') +
                        '</div>' +
                        '<div style="flex:1; min-width:200px;">' +
                            '<label class="form-label">BSI - Saldo iniziale (\u20AC)</label>' +
                            '<div style="display:flex; gap:var(--space-2); align-items:center;">' +
                                '<input type="number" class="form-input" id="saldo-ini-bsi" step="0.01" value="' + (saldoBsi ? saldoBsi.importo : '') + '" placeholder="Es. 0.00" style="flex:1;">' +
                                '<input type="date" class="form-input" id="saldo-ini-data-bsi" value="' + (saldoBsi ? saldoBsi.data : '2026-01-31') + '" style="width:150px;" title="Data del saldo">' +
                                '<button class="btn btn-sm btn-primary" id="btn-salva-saldo-bsi">Salva</button>' +
                            '</div>' +
                            (saldoBsi ? '<div class="text-sm text-success" style="margin-top:2px;">\u2705 Saldo impostato: ' + ENI.UI.formatValuta(saldoBsi.importo) + ' al ' + ENI.UI.formatData(saldoBsi.data) + '</div>' : '') +
                        '</div>' +
                    '</div>' +
                '</div>' +

                '<div id="import-mapper" style="margin-top:var(--space-3);"></div>' +
                '<div id="import-preview" style="margin-top:var(--space-3);"></div>' +
                '<div id="import-result" style="margin-top:var(--space-3);"></div>' +
            '</div>' +
        '</div>';
    }

    function _renderMovimentiTable() {
        if (_movimentiBanca.length === 0) {
            return '<div class="empty-state"><p class="empty-state-text">Nessun movimento trovato</p></div>';
        }

        // Ordina per data ASC per calcolo saldo progressivo
        var movOrdinati = _movimentiBanca.slice().sort(function(a, b) {
            return a.data_operazione.localeCompare(b.data_operazione);
        });

        // Calcola saldo progressivo se mancante
        var hasSaldo = movOrdinati.some(function(m) { return m.saldo_progressivo != null; });
        if (!hasSaldo) {
            // Determina saldo iniziale per banca (può essere misto se non filtrato)
            var saldoCalc = 0;
            if (_bancaFiltro) {
                // Una sola banca filtrata
                var si = _getSaldoIniziale(_bancaFiltro);
                if (si) saldoCalc = si.importo;
            } else {
                // Tutte le banche: somma i saldi iniziali
                var siCarisp = _getSaldoIniziale('carisp');
                var siBsi = _getSaldoIniziale('bsi');
                if (siCarisp) saldoCalc += siCarisp.importo;
                if (siBsi) saldoCalc += siBsi.importo;
            }
            movOrdinati.forEach(function(m) {
                saldoCalc += Number(m.importo);
                m._saldo_calcolato = Math.round(saldoCalc * 100) / 100;
            });
        }

        // Calcola totali
        var totEntrate = 0, totUscite = 0, nEntrate = 0, nUscite = 0;
        movOrdinati.forEach(function(m) {
            var imp = Number(m.importo);
            if (imp >= 0) { totEntrate += imp; nEntrate++; }
            else { totUscite += Math.abs(imp); nUscite++; }
        });

        // Mostra in ordine discendente (piu' recenti prima)
        var movDisplay = movOrdinati.slice().reverse();

        var html = '<div class="table-responsive"><table class="table">' +
            '<thead><tr>' +
                '<th>Data Op.</th><th>Data Val.</th><th>Descrizione</th><th>Banca</th>' +
                '<th>Categoria</th>' +
                '<th style="text-align:right;">Entrata</th>' +
                '<th style="text-align:right;">Uscita</th>' +
                '<th style="text-align:right;">Saldo</th>' +
            '</tr></thead><tbody>';

        movDisplay.forEach(function(m) {
            var imp = Number(m.importo);
            var saldo = m.saldo_progressivo != null ? Number(m.saldo_progressivo) : (m._saldo_calcolato != null ? m._saldo_calcolato : null);
            var saldoClass = saldo != null ? (saldo >= 0 ? 'text-success' : 'text-danger') : '';
            var rowClass = imp >= 0 ? 'tesoreria-row-entrata' : 'tesoreria-row-uscita';

            html += '<tr class="' + rowClass + '">' +
                '<td>' + ENI.UI.formatData(m.data_operazione) + '</td>' +
                '<td>' + (m.data_valuta ? ENI.UI.formatData(m.data_valuta) : '-') + '</td>' +
                '<td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;" title="' + ENI.UI.escapeHtml(m.descrizione) + '">' + ENI.UI.escapeHtml(m.descrizione) + '</td>' +
                '<td><span class="badge badge-sm tesoreria-badge-' + m.banca + '">' + m.banca.toUpperCase() + '</span></td>' +
                '<td>' + (m.categoria ? '<span class="badge badge-outline badge-sm">' + ENI.UI.escapeHtml(m.categoria) + '</span>' : '-') + '</td>' +
                '<td style="text-align:right;font-weight:600;" class="text-success">' + (imp > 0 ? ENI.UI.formatValuta(imp) : '') + '</td>' +
                '<td style="text-align:right;font-weight:600;" class="text-danger">' + (imp < 0 ? ENI.UI.formatValuta(Math.abs(imp)) : '') + '</td>' +
                '<td style="text-align:right;font-weight:600;" class="' + saldoClass + '">' + (saldo != null ? ENI.UI.formatValuta(saldo) : '-') + '</td>' +
            '</tr>';
        });

        html += '</tbody></table></div>';

        // Riepilogo totali
        html += '<div class="tesoreria-totali-row">' +
            '<div class="tesoreria-totale tesoreria-totale-entrata">' +
                '<span>Entrate (' + nEntrate + ')</span><strong>' + ENI.UI.formatValuta(totEntrate) + '</strong>' +
            '</div>' +
            '<div class="tesoreria-totale tesoreria-totale-uscita">' +
                '<span>Uscite (' + nUscite + ')</span><strong>' + ENI.UI.formatValuta(totUscite) + '</strong>' +
            '</div>' +
            '<div class="tesoreria-totale ' + (totEntrate - totUscite >= 0 ? 'tesoreria-totale-positivo' : 'tesoreria-totale-negativo') + '">' +
                '<span>Netto</span><strong>' + ENI.UI.formatValuta(totEntrate - totUscite) + '</strong>' +
            '</div>' +
        '</div>';

        if (!hasSaldo) {
            html += '<div class="text-sm text-muted" style="margin-top:var(--space-2);">* Saldo calcolato progressivamente dai movimenti (non presente nel file importato)</div>';
        }

        return html;
    }

    function _setupMovimentiListeners() {
        // Filtri
        var btnFiltra = document.getElementById('btn-filtra-mov');
        var btnReset = document.getElementById('btn-reset-mov');

        if (btnFiltra) {
            btnFiltra.addEventListener('click', function() {
                _bancaFiltro = document.getElementById('filtro-banca').value;
                _movimentiDa = document.getElementById('filtro-mov-da').value;
                _movimentiA = document.getElementById('filtro-mov-a').value;
                _loadTab();
            });
        }

        if (btnReset) {
            btnReset.addEventListener('click', function() {
                _bancaFiltro = '';
                _movimentiDa = '';
                _movimentiA = '';
                _loadTab();
            });
        }

        // File import: quando cambia il file, parsa e mostra il column mapper
        var fileInput = document.getElementById('import-file');
        if (fileInput) {
            fileInput.addEventListener('change', function() {
                if (fileInput.files.length > 0) {
                    _onFileSelected(fileInput.files[0]);
                }
            });
        }

        // Salva saldo iniziale per banca
        var btnSaldoCarisp = document.getElementById('btn-salva-saldo-carisp');
        var btnSaldoBsi = document.getElementById('btn-salva-saldo-bsi');

        if (btnSaldoCarisp) {
            btnSaldoCarisp.addEventListener('click', function() {
                var importo = parseFloat(document.getElementById('saldo-ini-carisp').value);
                var data = document.getElementById('saldo-ini-data-carisp').value;
                if (isNaN(importo)) { ENI.UI.warning('Inserisci un importo valido'); return; }
                if (!data) { ENI.UI.warning('Inserisci la data del saldo'); return; }
                _saveSaldoIniziale('carisp', importo, data);
                ENI.UI.success('Saldo iniziale Carisp salvato: ' + ENI.UI.formatValuta(importo) + ' al ' + ENI.UI.formatData(data));
                _loadTab();
            });
        }

        if (btnSaldoBsi) {
            btnSaldoBsi.addEventListener('click', function() {
                var importo = parseFloat(document.getElementById('saldo-ini-bsi').value);
                var data = document.getElementById('saldo-ini-data-bsi').value;
                if (isNaN(importo)) { ENI.UI.warning('Inserisci un importo valido'); return; }
                if (!data) { ENI.UI.warning('Inserisci la data del saldo'); return; }
                _saveSaldoIniziale('bsi', importo, data);
                ENI.UI.success('Saldo iniziale BSI salvato: ' + ENI.UI.formatValuta(importo) + ' al ' + ENI.UI.formatData(data));
                _loadTab();
            });
        }

        // Svuota movimenti importati
        var btnSvuota = document.getElementById('btn-svuota-movimenti');
        if (btnSvuota) {
            btnSvuota.addEventListener('click', function() {
                var banca = document.getElementById('import-banca').value;
                var modal = ENI.UI.showModal({
                    title: 'Svuota Movimenti Importati',
                    body: '<p>Vuoi eliminare <strong>tutti</strong> i movimenti importati' +
                        ' per <strong>' + banca.toUpperCase() + '</strong>?</p>' +
                        '<p class="text-muted">Potrai reimportarli con la mappatura corretta.</p>' +
                        '<p class="text-danger"><strong>Questa azione non e\' reversibile.</strong></p>',
                    footer: '<button class="btn btn-outline" data-modal-close>Annulla</button>' +
                            '<button class="btn btn-danger" id="btn-conferma-svuota">Elimina Tutti</button>'
                });
                modal.querySelector('#btn-conferma-svuota').addEventListener('click', async function() {
                    try {
                        var result = await ENI.API.getClient()
                            .from('movimenti_banca')
                            .delete()
                            .eq('banca', banca);
                        if (result.error) throw new Error(result.error.message);
                        // Resetta anche la mappatura salvata
                        try { localStorage.removeItem('tesoreria-mapping-' + banca); } catch(e) {}
                        await ENI.API.scriviLog('Svuotati_Movimenti_Banca', 'Tesoreria', 'Banca: ' + banca);
                        ENI.UI.closeModal(modal);
                        ENI.UI.success('Movimenti ' + banca.toUpperCase() + ' eliminati. Ora puoi reimportare.');
                        _loadTab();
                    } catch(e) {
                        ENI.UI.error('Errore: ' + e.message);
                    }
                });
            });
        }
    }

    // ============================================================
    // IMPORT: Column Mapper Flow
    // ============================================================

    async function _onFileSelected(file) {
        var mapperEl = document.getElementById('import-mapper');
        var previewEl = document.getElementById('import-preview');
        var resultEl = document.getElementById('import-result');
        if (!mapperEl) return;

        mapperEl.innerHTML = '<div class="flex items-center gap-2"><div class="spinner"></div> Lettura file...</div>';
        if (previewEl) previewEl.innerHTML = '';
        if (resultEl) resultEl.innerHTML = '';
        _importParsedData = null;
        _importMapping = {};

        try {
            var parsed = await _parseFileRaw(file);
            _importParsedData = parsed;

            if (!parsed.headers || parsed.headers.length === 0 || parsed.rows.length === 0) {
                mapperEl.innerHTML = '<div class="text-warning">Il file sembra vuoto o non contiene dati validi.</div>';
                return;
            }

            var banca = document.getElementById('import-banca').value;

            // Prova a caricare mapping salvato
            var savedMapping = _loadSavedMapping(banca);
            var suggerimenti = _suggestColumnMapping(parsed.headers);

            // Usa mapping salvato se disponibile, altrimenti suggerimenti
            _importMapping = savedMapping || suggerimenti;

            _renderColumnMapper(mapperEl, parsed.headers, parsed.rows.slice(0, 4), banca);
        } catch(e) {
            mapperEl.innerHTML = '<div class="text-danger">Errore lettura file: ' + ENI.UI.escapeHtml(e.message) + '</div>';
        }
    }

    function _renderColumnMapper(container, headers, sampleRows, banca) {
        var ruoli = [
            { value: '', label: '(Ignora)' },
            { value: 'data_operazione', label: '\u{1F4C5} Data Operazione *' },
            { value: 'data_valuta', label: '\u{1F4C5} Data Valuta' },
            { value: 'descrizione', label: '\u{1F4DD} Descrizione *' },
            { value: 'importo', label: '\u{1F4B6} Importo (+/-)' },
            { value: 'dare', label: '\u{1F534} Dare (uscite)' },
            { value: 'avere', label: '\u{1F7E2} Avere (entrate)' },
            { value: 'saldo', label: '\u{1F3E6} Saldo' }
        ];

        var html = '<div class="tesoreria-mapper">' +
            '<div class="tesoreria-mapper-title">Mappa le colonne del file</div>' +
            '<p class="text-sm text-muted" style="margin-bottom:var(--space-2);">Assegna un ruolo a ogni colonna. Colonne con * sono obbligatorie.<br>' +
            'Per importo usa <strong>"Importo (+/-)"</strong> se e\' una colonna unica, oppure <strong>"Dare/Avere"</strong> se sono separate.</p>';

        // Layout VERTICALE: una riga per ogni colonna del CSV
        html += '<div class="tesoreria-mapper-grid" style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:var(--space-2); margin-bottom:var(--space-3);">';

        headers.forEach(function(h, idx) {
            var currentVal = '';
            for (var key in _importMapping) {
                if (_importMapping[key] === h || _importMapping[key] === idx) {
                    currentVal = key;
                }
            }

            var options = ruoli.map(function(r) {
                return '<option value="' + r.value + '"' + (currentVal === r.value ? ' selected' : '') + '>' + r.label + '</option>';
            }).join('');

            // Prendi un valore di esempio dalla prima riga
            var esempio = sampleRows.length > 0 && sampleRows[0][h] != null ? String(sampleRows[0][h]).substring(0, 25) : '-';

            var borderColor = currentVal ? 'var(--color-primary, #3b82f6)' : 'var(--border-color, #dee2e6)';
            var bgColor = currentVal ? 'var(--bg-primary-subtle, #eff6ff)' : 'var(--bg-surface, #f8f9fa)';

            html += '<div style="padding:var(--space-2); border:2px solid ' + borderColor + '; border-radius:var(--radius-md); background:' + bgColor + ';">' +
                '<div style="font-weight:600; font-size:0.85rem; margin-bottom:4px;">' + ENI.UI.escapeHtml(h) + '</div>' +
                '<div class="text-xs text-muted" style="margin-bottom:4px;">Es: <em>' + ENI.UI.escapeHtml(esempio) + '</em></div>' +
                '<select class="form-select form-select-sm tesoreria-mapper-select" data-col-idx="' + idx + '" style="width:100%;">' +
                    options +
                '</select>' +
            '</div>';
        });

        html += '</div>';

        // Pulsanti
        html += '<div style="display:flex; gap:var(--space-2); flex-wrap:wrap;">' +
                '<button class="btn btn-outline btn-sm" id="btn-salva-mapping">\u{1F4BE} Salva mappatura per ' + banca.toUpperCase() + '</button>' +
                '<button class="btn btn-primary" id="btn-conferma-mapping">\u{1F50D} Anteprima e Importa</button>' +
            '</div>' +
        '</div>';

        container.innerHTML = html;

        // Evidenzia card quando cambia selezione
        container.querySelectorAll('.tesoreria-mapper-select').forEach(function(sel) {
            sel.addEventListener('change', function() {
                var card = sel.parentElement;
                if (sel.value) {
                    card.style.borderColor = 'var(--color-primary, #3b82f6)';
                    card.style.background = 'var(--bg-primary-subtle, #eff6ff)';
                } else {
                    card.style.borderColor = 'var(--border-color, #dee2e6)';
                    card.style.background = 'var(--bg-surface, #f8f9fa)';
                }
            });
        });

        // Listeners
        document.getElementById('btn-salva-mapping').addEventListener('click', function() {
            _readMappingFromUI();
            _saveMappingToStorage(banca, _importMapping);
            ENI.UI.success('Mappatura salvata per ' + banca.toUpperCase());
        });

        document.getElementById('btn-conferma-mapping').addEventListener('click', function() {
            _readMappingFromUI();
            _showMappedPreview();
        });
    }

    function _readMappingFromUI() {
        _importMapping = {};
        var headers = _importParsedData ? _importParsedData.headers : [];
        document.querySelectorAll('.tesoreria-mapper-select').forEach(function(sel) {
            var idx = parseInt(sel.dataset.colIdx);
            var ruolo = sel.value;
            if (ruolo && headers[idx]) {
                _importMapping[ruolo] = headers[idx];
            }
        });
    }

    function _showMappedPreview() {
        var previewEl = document.getElementById('import-preview');
        if (!previewEl || !_importParsedData) return;

        // Valida mapping
        var hasData = _importMapping.data_operazione;
        var hasImporto = _importMapping.importo || (_importMapping.dare || _importMapping.avere);
        var hasDesc = _importMapping.descrizione;

        if (!hasData || !hasImporto) {
            previewEl.innerHTML = '<div class="text-danger">Devi assegnare almeno "Data Operazione" e "Importo" (oppure "Dare"/"Avere").</div>';
            return;
        }

        try {
            var movimenti = _mapRowsWithMapping(_importParsedData.objects, _importMapping);
            if (movimenti.length === 0) {
                previewEl.innerHTML = '<div class="text-warning">Nessun movimento valido trovato con questa mappatura.</div>';
                return;
            }

            // Riepilogo anteprima
            var prevEntrate = 0, prevUscite = 0;
            movimenti.forEach(function(m) {
                if (Number(m.importo) >= 0) prevEntrate += Number(m.importo);
                else prevUscite += Math.abs(Number(m.importo));
            });

            var html = '<div style="margin-bottom:var(--space-2);">' +
                '<strong>' + movimenti.length + ' movimenti trovati</strong> &mdash; ' +
                '<span class="text-success">' + movimenti.filter(function(m) { return Number(m.importo) > 0; }).length + ' entrate (' + ENI.UI.formatValuta(prevEntrate) + ')</span>' +
                ' &bull; ' +
                '<span class="text-danger">' + movimenti.filter(function(m) { return Number(m.importo) < 0; }).length + ' uscite (' + ENI.UI.formatValuta(prevUscite) + ')</span>' +
                '</div>' +
                '<div class="text-sm text-muted" style="margin-bottom:var(--space-2);">Primi 5 movimenti:</div>' +
                '<div class="table-responsive"><table class="table table-sm">' +
                '<thead><tr><th>Data</th><th>Descrizione</th><th>Entrata</th><th>Uscita</th><th>Saldo</th></tr></thead><tbody>';

            movimenti.slice(0, 5).forEach(function(m) {
                var imp = Number(m.importo);
                html += '<tr>' +
                    '<td>' + ENI.UI.escapeHtml(m.data_operazione) + '</td>' +
                    '<td>' + ENI.UI.escapeHtml(m.descrizione || '') + '</td>' +
                    '<td class="text-success" style="text-align:right;">' + (imp > 0 ? ENI.UI.formatValuta(imp) : '') + '</td>' +
                    '<td class="text-danger" style="text-align:right;">' + (imp < 0 ? ENI.UI.formatValuta(Math.abs(imp)) : '') + '</td>' +
                    '<td style="text-align:right;">' + (m.saldo_progressivo != null ? ENI.UI.formatValuta(m.saldo_progressivo) : '-') + '</td>' +
                '</tr>';
            });

            html += '</tbody></table></div>';
            if (movimenti.length > 5) {
                html += '<div class="text-sm text-muted">... e altri ' + (movimenti.length - 5) + ' movimenti</div>';
            }

            // Mostra righe escluse (saldi, riepiloghi)
            if (movimenti._righeEscluse && movimenti._righeEscluse.length > 0) {
                html += '<div style="margin-top:var(--space-3); padding:var(--space-2); background:var(--bg-info-subtle, #e0f2fe); border-radius:var(--radius-md); font-size:0.9rem;">' +
                    '<strong>\u{1F6AB} ' + movimenti._righeEscluse.length + ' righe escluse</strong> (saldi/riepiloghi banca, non sono movimenti reali):<ul style="margin:4px 0 0 16px;">';
                movimenti._righeEscluse.forEach(function(r) {
                    html += '<li>' + ENI.UI.escapeHtml(r.desc) + ' (' + r.data + ')</li>';
                });
                html += '</ul></div>';
            }

            html += '<div style="margin-top:var(--space-3); padding:var(--space-2); background:var(--bg-warning-subtle, #fff3cd); border-radius:var(--radius-md); font-size:0.9rem;">' +
                '<strong>Controlla:</strong> Le entrate sono in verde e le uscite in rosso? Se i segni sono invertiti, torna indietro e cambia la mappatura delle colonne (scambia Dare/Avere oppure usa "Importo (+/-)").' +
                '</div>';

            html += '<button class="btn btn-success" id="btn-esegui-import" style="margin-top:var(--space-2);">\u2705 Conferma e Importa ' + movimenti.length + ' movimenti</button>';

            previewEl.innerHTML = html;

            document.getElementById('btn-esegui-import').addEventListener('click', function() {
                _eseguiImport(movimenti);
            });
        } catch(e) {
            previewEl.innerHTML = '<div class="text-danger">Errore nella mappatura: ' + ENI.UI.escapeHtml(e.message) + '</div>';
        }
    }

    async function _eseguiImport(movimenti) {
        var resultEl = document.getElementById('import-result');
        var btnImport = document.getElementById('btn-esegui-import');
        if (!resultEl) return;

        var banca = document.getElementById('import-banca').value;
        var fileName = document.getElementById('import-file').files[0].name;

        resultEl.innerHTML = '<div class="flex items-center gap-2"><div class="spinner"></div> Importazione in corso...</div>';
        if (btnImport) btnImport.disabled = true;

        try {
            // Genera hash e aggiungi metadati
            var dateRange = _getDateRange(movimenti);
            movimenti.forEach(function(m) {
                m.banca = banca;
                m.file_origine = fileName;
                m.hash_movimento = _generateHash(m.data_operazione, m.data_valuta, m.importo, m.descrizione);
            });

            // Deduplicazione
            var hashEsistenti = await ENI.API.getHashMovimentiEsistenti(dateRange.min, dateRange.max);
            var hashSet = {};
            hashEsistenti.forEach(function(h) { hashSet[h] = true; });

            var nuovi = movimenti.filter(function(m) { return !hashSet[m.hash_movimento]; });

            // Rimuovi duplicati interni al file
            var hashVisti = {};
            nuovi = nuovi.filter(function(m) {
                if (hashVisti[m.hash_movimento]) return false;
                hashVisti[m.hash_movimento] = true;
                return true;
            });

            if (nuovi.length === 0) {
                resultEl.innerHTML = '<div class="tesoreria-import-result tesoreria-import-info">' +
                    '<strong>Nessun nuovo movimento.</strong> Tutti i ' + movimenti.length + ' movimenti erano gi\u00e0 presenti.' +
                '</div>';
                return;
            }

            // Import in batch
            var BATCH = 50;
            var importati = 0;
            for (var i = 0; i < nuovi.length; i += BATCH) {
                var batch = nuovi.slice(i, i + BATCH);
                await ENI.API.importaMovimentiBanca(batch);
                importati += batch.length;
                resultEl.innerHTML = '<div class="flex items-center gap-2"><div class="spinner"></div> Importati ' + importati + ' / ' + nuovi.length + '...</div>';
            }

            var duplicati = movimenti.length - nuovi.length;
            resultEl.innerHTML = '<div class="tesoreria-import-result tesoreria-import-success">' +
                '<strong>Importazione completata!</strong><br>' +
                'Importati: <strong>' + nuovi.length + '</strong> nuovi movimenti<br>' +
                (duplicati > 0 ? 'Duplicati ignorati: <strong>' + duplicati + '</strong>' : '') +
            '</div>';

            setTimeout(function() { _loadTab(); }, 1500);

        } catch(e) {
            resultEl.innerHTML = '<div class="tesoreria-import-result tesoreria-import-error">' +
                '<strong>Errore importazione:</strong> ' + ENI.UI.escapeHtml(e.message) +
            '</div>';
            console.error('Import error:', e);
        }
    }

    // --- Parsing helpers ---

    async function _parseFileRaw(file) {
        var ext = file.name.split('.').pop().toLowerCase();
        if (ext === 'csv') {
            return await _parseCSVRaw(file);
        } else if (ext === 'xlsx' || ext === 'xls') {
            return await _parseExcelRaw(file);
        }
        throw new Error('Formato non supportato. Usa CSV o Excel (.xlsx/.xls)');
    }

    function _parseCSVRaw(file) {
        return new Promise(function(resolve, reject) {
            Papa.parse(file, {
                header: true,
                skipEmptyLines: true,
                encoding: 'UTF-8',
                complete: function(results) {
                    if (results.errors.length > 0 && results.data.length === 0) {
                        reject(new Error('Errore CSV: ' + results.errors[0].message));
                        return;
                    }
                    resolve({
                        headers: results.meta.fields || [],
                        rows: results.data.slice(0, 5), // solo per preview nella mapper table
                        objects: results.data // tutti i dati
                    });
                },
                error: function(err) {
                    reject(new Error('Errore lettura CSV: ' + err.message));
                }
            });
        });
    }

    function _parseExcelRaw(file) {
        return new Promise(function(resolve, reject) {
            var reader = new FileReader();
            reader.onload = function(e) {
                try {
                    var wb = XLSX.read(e.target.result, { type: 'array', cellDates: true });
                    var ws = wb.Sheets[wb.SheetNames[0]];
                    var data = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, dateNF: 'yyyy-mm-dd' });

                    if (data.length < 2) {
                        resolve({ headers: [], rows: [], objects: [] });
                        return;
                    }

                    var headers = data[0].map(function(h) { return String(h || '').trim(); });
                    var rows = data.slice(1).filter(function(r) { return r.some(function(c) { return c != null && c !== ''; }); });

                    var objects = rows.map(function(row) {
                        var obj = {};
                        headers.forEach(function(h, i) { obj[h] = row[i] != null ? String(row[i]).trim() : ''; });
                        return obj;
                    });

                    resolve({
                        headers: headers,
                        rows: objects.slice(0, 5),
                        objects: objects
                    });
                } catch(err) {
                    reject(new Error('Errore Excel: ' + err.message));
                }
            };
            reader.onerror = function() { reject(new Error('Errore lettura file')); };
            reader.readAsArrayBuffer(file);
        });
    }

    // Righe di saldo/riepilogo che le banche inseriscono nel CSV
    // NON sono movimenti reali, vanno escluse dall'import
    var SALDO_KEYWORDS = ['contabile', 'liquido', 'saldo', 'saldo contabile', 'saldo liquido',
        'saldo disponibile', 'saldo iniziale', 'saldo finale', 'totale', 'riepilogo'];

    function _isSaldoRow(descrizione) {
        if (!descrizione) return false;
        var descLower = descrizione.trim().toLowerCase();
        return SALDO_KEYWORDS.some(function(kw) { return descLower === kw; });
    }

    function _mapRowsWithMapping(objects, mapping) {
        var hasImportoSingolo = !!mapping.importo;
        var hasDareAvere = !!(mapping.dare || mapping.avere);

        var movimenti = [];
        var righeEscluse = [];
        objects.forEach(function(row) {
            var dataOp = _parseDataItaliana(row[mapping.data_operazione]);
            if (!dataOp) return;

            // Escludi righe di saldo/riepilogo (non sono movimenti)
            var desc = mapping.descrizione ? (row[mapping.descrizione] || '').trim() : '';
            if (_isSaldoRow(desc)) {
                righeEscluse.push({ data: dataOp, desc: desc, motivo: 'Riga di saldo/riepilogo' });
                return;
            }

            var importo;
            if (hasImportoSingolo) {
                importo = _parseNumero(row[mapping.importo]);
            } else if (hasDareAvere) {
                var dare = mapping.dare ? _parseNumero(row[mapping.dare]) : 0;
                var avere = mapping.avere ? _parseNumero(row[mapping.avere]) : 0;
                // Dare = uscita (negativo), Avere = entrata (positivo)
                if (dare && dare !== 0) {
                    importo = -Math.abs(dare); // dare e' sempre uscita
                } else if (avere && avere !== 0) {
                    importo = Math.abs(avere); // avere e' sempre entrata
                } else {
                    importo = 0;
                }
            }
            if (importo === null || isNaN(importo)) return;
            if (importo === 0) return; // ignora righe senza importo

            var mov = {
                data_operazione: dataOp,
                data_valuta: mapping.data_valuta ? _parseDataItaliana(row[mapping.data_valuta]) : dataOp,
                descrizione: desc || 'Movimento',
                importo: importo,
                saldo_progressivo: mapping.saldo ? _parseNumero(row[mapping.saldo]) : null
            };

            if (mov.descrizione) movimenti.push(mov);
        });

        // Salva righe escluse per mostrare nell'anteprima
        movimenti._righeEscluse = righeEscluse;

        return movimenti;
    }

    // --- Column mapping persistence ---

    function _suggestColumnMapping(fields) {
        var mapping = {};
        var fieldsLower = fields.map(function(f) { return (f || '').toLowerCase().trim(); });

        var patterns = {
            data_operazione: ['data operazione', 'data op', 'data op.', 'data', 'date', 'data_operazione', 'data contabile', 'data registrazione', 'data mov', 'data movimento'],
            data_valuta: ['data valuta', 'data val', 'data val.', 'valuta', 'data_valuta', 'value date'],
            descrizione: ['descrizione', 'causale', 'description', 'dettagli', 'descrizione operazione', 'motivo', 'descrizione/causale', 'tipo operazione', 'operazione'],
            importo: ['importo', 'amount', 'importo eur', 'importo euro', 'importo in eur', 'importo in euro', 'movimento', 'importo movimento'],
            dare: ['dare', 'addebito', 'addebiti', 'debit', 'uscite', 'uscita', 'addebitare', 'importo dare'],
            avere: ['avere', 'accredito', 'accrediti', 'credit', 'entrate', 'entrata', 'accreditare', 'importo avere'],
            saldo: ['saldo', 'saldo contabile', 'saldo disponibile', 'balance', 'saldo progressivo', 'saldo finale', 'saldo in euro', 'saldo eur']
        };

        Object.keys(patterns).forEach(function(ruolo) {
            patterns[ruolo].some(function(p) {
                var idx = fieldsLower.indexOf(p);
                if (idx !== -1) { mapping[ruolo] = fields[idx]; return true; }
                return false;
            });
        });

        // Se troviamo dare/avere ma non importo, non serviamo importo
        if (!mapping.importo && (mapping.dare || mapping.avere)) {
            // ok, usera' dare/avere
        }

        return mapping;
    }

    function _loadSavedMapping(banca) {
        try {
            var saved = localStorage.getItem('tesoreria-mapping-' + banca);
            return saved ? JSON.parse(saved) : null;
        } catch(e) { return null; }
    }

    function _saveMappingToStorage(banca, mapping) {
        try {
            localStorage.setItem('tesoreria-mapping-' + banca, JSON.stringify(mapping));
        } catch(e) { /* ignore */ }
    }

    // --- Saldi iniziali per banca ---

    function _loadSaldiIniziali() {
        try {
            var saved = localStorage.getItem('tesoreria-saldi-iniziali');
            return saved ? JSON.parse(saved) : {};
        } catch(e) { return {}; }
    }

    function _saveSaldoIniziale(banca, importo, data) {
        _saldiIniziali[banca] = { importo: importo, data: data };
        try {
            localStorage.setItem('tesoreria-saldi-iniziali', JSON.stringify(_saldiIniziali));
        } catch(e) { /* ignore */ }
    }

    function _getSaldoIniziale(banca) {
        return _saldiIniziali[banca] || null;
    }

    // --- Parsing utilities ---

    function _parseNumero(val) {
        if (val == null || val === '') return null;
        var s = String(val).trim();
        s = s.replace(/[€\s]/g, '');
        if (s.indexOf(',') !== -1 && s.indexOf('.') !== -1) {
            if (s.lastIndexOf('.') < s.lastIndexOf(',')) {
                s = s.replace(/\./g, '').replace(',', '.');
            }
        } else if (s.indexOf(',') !== -1) {
            s = s.replace(',', '.');
        }
        var n = parseFloat(s);
        return isNaN(n) ? null : n;
    }

    function _parseDataItaliana(val) {
        if (!val) return null;
        var s = String(val).trim();

        if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
            return s.substring(0, 10);
        }

        var match = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
        if (match) {
            var g = match[1].padStart(2, '0');
            var m = match[2].padStart(2, '0');
            var a = match[3].length === 2 ? '20' + match[3] : match[3];
            return a + '-' + m + '-' + g;
        }

        return null;
    }

    function _generateHash(dataOp, dataVal, importo, descrizione) {
        var str = (dataOp || '') + '|' + (dataVal || '') + '|' + String(importo || 0) + '|' + (descrizione || '').trim().toLowerCase();
        var hash = 0;
        for (var i = 0; i < str.length; i++) {
            var char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return 'h' + Math.abs(hash).toString(36) + '_' + str.length + '_' + (dataOp || '').replace(/-/g, '');
    }

    function _getDateRange(movimenti) {
        var min = '9999-12-31';
        var max = '0000-01-01';
        movimenti.forEach(function(m) {
            if (m.data_operazione < min) min = m.data_operazione;
            if (m.data_operazione > max) max = m.data_operazione;
        });
        return { min: min, max: max };
    }

    // ============================================================
    // TAB: RICORRENTI
    // ============================================================

    async function _renderRicorrenti(content) {
        _pagamentiRicorrenti = await ENI.API.getPagamentiRicorrenti();
        _categorie = await ENI.API.getCategorieTesoreria();

        var puoScrivere = ENI.State.canWrite('tesoreria');

        content.innerHTML =
            (puoScrivere ? '<div style="margin-bottom:var(--space-4);">' +
                '<button class="btn btn-primary" id="btn-nuovo-ricorrente">\u2795 Nuovo Pagamento Ricorrente</button>' +
            '</div>' : '') +

            '<div class="cassa-section">' +
                '<div class="cassa-section-title">\u{1F504} Pagamenti Ricorrenti (' + _pagamentiRicorrenti.length + ')</div>' +
                _renderRicorrentiTable(puoScrivere) +
            '</div>';

        if (puoScrivere) {
            var btn = document.getElementById('btn-nuovo-ricorrente');
            if (btn) btn.addEventListener('click', function() { _showRicorrenteForm(); });
        }
    }

    function _renderRicorrentiTable(puoScrivere) {
        if (_pagamentiRicorrenti.length === 0) {
            return '<div class="empty-state"><p class="empty-state-text">Nessun pagamento ricorrente configurato</p></div>';
        }

        var html = '<div class="table-responsive"><table class="table">' +
            '<thead><tr><th>Descrizione</th><th>Importo</th><th>Tipo</th><th>Frequenza</th><th>Giorno</th><th>Categoria</th><th>Stato</th>' +
            (puoScrivere ? '<th>Azioni</th>' : '') +
            '</tr></thead><tbody>';

        _pagamentiRicorrenti.forEach(function(p) {
            var tipoClass = p.tipo === 'uscita' ? 'badge-danger' : 'badge-success';
            html += '<tr>' +
                '<td><strong>' + ENI.UI.escapeHtml(p.descrizione) + '</strong>' +
                    (p.note ? '<div class="text-sm text-muted">' + ENI.UI.escapeHtml(p.note) + '</div>' : '') +
                '</td>' +
                '<td class="' + (p.tipo === 'uscita' ? 'text-danger' : 'text-success') + '" style="font-weight:600;">' +
                    ENI.UI.formatValuta(p.importo) + '</td>' +
                '<td><span class="badge ' + tipoClass + '">' + p.tipo + '</span></td>' +
                '<td>' + p.frequenza + '</td>' +
                '<td>' + p.giorno_scadenza + '</td>' +
                '<td>' + (p.categoria ? ENI.UI.escapeHtml(p.categoria) : '-') + '</td>' +
                '<td>' + (p.attivo
                    ? '<span class="badge badge-success">Attivo</span>'
                    : '<span class="badge badge-outline">Inattivo</span>') +
                '</td>' +
                (puoScrivere
                    ? '<td><div class="flex gap-1">' +
                        '<button class="btn btn-sm btn-outline" data-edit-ric="' + p.id + '">Modifica</button>' +
                        '<button class="btn btn-sm ' + (p.attivo ? 'btn-outline' : 'btn-primary') + '" data-toggle-ric="' + p.id + '">' +
                            (p.attivo ? 'Disattiva' : 'Attiva') + '</button>' +
                        '<button class="btn btn-sm btn-danger" data-del-ric="' + p.id + '">Elimina</button>' +
                      '</div></td>'
                    : '') +
            '</tr>';
        });

        html += '</tbody></table></div>';
        setTimeout(function() { _setupRicorrentiActions(); }, 0);
        return html;
    }

    function _setupRicorrentiActions() {
        document.querySelectorAll('[data-edit-ric]').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var id = btn.dataset.editRic;
                var p = _pagamentiRicorrenti.find(function(r) { return r.id === id; });
                if (p) _showRicorrenteForm(p);
            });
        });

        document.querySelectorAll('[data-toggle-ric]').forEach(function(btn) {
            btn.addEventListener('click', async function() {
                var id = btn.dataset.toggleRic;
                var p = _pagamentiRicorrenti.find(function(r) { return r.id === id; });
                if (!p) return;
                try {
                    await ENI.API.aggiornaPagamentoRicorrente(id, { attivo: !p.attivo });
                    ENI.UI.success(p.attivo ? 'Pagamento disattivato' : 'Pagamento attivato');
                    _loadTab();
                } catch(e) {
                    ENI.UI.error('Errore: ' + e.message);
                }
            });
        });

        document.querySelectorAll('[data-del-ric]').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var id = btn.dataset.delRic;
                var p = _pagamentiRicorrenti.find(function(r) { return r.id === id; });
                if (!p) return;
                var modal = ENI.UI.showModal({
                    title: 'Elimina Pagamento',
                    body: '<p>Eliminare il pagamento ricorrente <strong>' + ENI.UI.escapeHtml(p.descrizione) + '</strong>?</p>',
                    footer: '<button class="btn btn-outline" data-modal-close>Annulla</button>' +
                            '<button class="btn btn-danger" id="btn-conferma-del-ric">Elimina</button>'
                });
                modal.querySelector('#btn-conferma-del-ric').addEventListener('click', async function() {
                    try {
                        await ENI.API.eliminaPagamentoRicorrente(id, p.descrizione);
                        ENI.UI.closeModal(modal);
                        ENI.UI.success('Pagamento eliminato');
                        _loadTab();
                    } catch(e) {
                        ENI.UI.error('Errore: ' + e.message);
                    }
                });
            });
        });
    }

    function _showRicorrenteForm(existing) {
        var isEdit = !!existing;
        var catOptions = _categorie.map(function(c) {
            var sel = existing && existing.categoria === c.nome ? ' selected' : '';
            return '<option value="' + ENI.UI.escapeHtml(c.nome) + '"' + sel + '>' + (c.icona || '') + ' ' + ENI.UI.escapeHtml(c.nome) + '</option>';
        }).join('');

        var html =
            '<div style="display:flex; flex-direction:column; gap:var(--space-3);">' +
                '<div class="form-group"><label class="form-label">Descrizione *</label>' +
                    '<input type="text" class="form-input" id="ric-desc" value="' + (existing ? ENI.UI.escapeHtml(existing.descrizione) : '') + '" placeholder="Es. Affitto locale"></div>' +
                '<div style="display:flex; gap:var(--space-3);">' +
                    '<div class="form-group" style="flex:1;"><label class="form-label">Importo *</label>' +
                        '<input type="number" class="form-input" id="ric-importo" step="0.01" min="0" value="' + (existing ? existing.importo : '') + '"></div>' +
                    '<div class="form-group" style="flex:1;"><label class="form-label">Tipo *</label>' +
                        '<select class="form-select" id="ric-tipo">' +
                            '<option value="uscita"' + (existing && existing.tipo === 'uscita' ? ' selected' : '') + '>Uscita</option>' +
                            '<option value="entrata"' + (existing && existing.tipo === 'entrata' ? ' selected' : '') + '>Entrata</option>' +
                        '</select></div>' +
                '</div>' +
                '<div style="display:flex; gap:var(--space-3);">' +
                    '<div class="form-group" style="flex:1;"><label class="form-label">Frequenza *</label>' +
                        '<select class="form-select" id="ric-freq">' +
                            '<option value="mensile"' + (existing && existing.frequenza === 'mensile' ? ' selected' : '') + '>Mensile</option>' +
                            '<option value="trimestrale"' + (existing && existing.frequenza === 'trimestrale' ? ' selected' : '') + '>Trimestrale</option>' +
                            '<option value="semestrale"' + (existing && existing.frequenza === 'semestrale' ? ' selected' : '') + '>Semestrale</option>' +
                            '<option value="annuale"' + (existing && existing.frequenza === 'annuale' ? ' selected' : '') + '>Annuale</option>' +
                        '</select></div>' +
                    '<div class="form-group" style="flex:1;"><label class="form-label">Giorno scadenza *</label>' +
                        '<input type="number" class="form-input" id="ric-giorno" min="1" max="31" value="' + (existing ? existing.giorno_scadenza : '1') + '"></div>' +
                '</div>' +
                '<div class="form-group"><label class="form-label">Categoria</label>' +
                    '<select class="form-select" id="ric-cat"><option value="">-- Nessuna --</option>' + catOptions + '</select></div>' +
                '<div style="display:flex; gap:var(--space-3);">' +
                    '<div class="form-group" style="flex:1;"><label class="form-label">Data inizio</label>' +
                        '<input type="date" class="form-input" id="ric-inizio" value="' + (existing ? existing.data_inizio : ENI.UI.oggiISO()) + '"></div>' +
                    '<div class="form-group" style="flex:1;"><label class="form-label">Data fine (opzionale)</label>' +
                        '<input type="date" class="form-input" id="ric-fine" value="' + (existing && existing.data_fine ? existing.data_fine : '') + '"></div>' +
                '</div>' +
                '<div class="form-group"><label class="form-label">Note</label>' +
                    '<textarea class="form-input" id="ric-note" rows="2">' + (existing ? ENI.UI.escapeHtml(existing.note || '') : '') + '</textarea></div>' +
            '</div>';

        var btnLabel = isEdit ? 'Salva' : 'Crea';
        var modal = ENI.UI.showModal({
            title: isEdit ? 'Modifica Pagamento Ricorrente' : 'Nuovo Pagamento Ricorrente',
            body: html,
            footer: '<button class="btn btn-outline" data-modal-close>Annulla</button>' +
                    '<button class="btn btn-primary" id="btn-salva-ric">' + btnLabel + '</button>'
        });
        modal.querySelector('#btn-salva-ric').addEventListener('click', async function() {
            var dati = {
                descrizione: document.getElementById('ric-desc').value.trim(),
                importo: parseFloat(document.getElementById('ric-importo').value),
                tipo: document.getElementById('ric-tipo').value,
                frequenza: document.getElementById('ric-freq').value,
                giorno_scadenza: parseInt(document.getElementById('ric-giorno').value),
                categoria: document.getElementById('ric-cat').value || null,
                data_inizio: document.getElementById('ric-inizio').value,
                data_fine: document.getElementById('ric-fine').value || null,
                note: document.getElementById('ric-note').value.trim() || null
            };

            if (!dati.descrizione || isNaN(dati.importo) || dati.importo <= 0) {
                ENI.UI.warning('Compilare descrizione e importo');
                return;
            }

            try {
                if (isEdit) {
                    await ENI.API.aggiornaPagamentoRicorrente(existing.id, dati);
                    ENI.UI.success('Pagamento aggiornato');
                } else {
                    await ENI.API.salvaPagamentoRicorrente(dati);
                    ENI.UI.success('Pagamento creato');
                }
                ENI.UI.closeModal(modal);
                _loadTab();
            } catch(e) {
                ENI.UI.error('Errore: ' + e.message);
            }
        });
    }

    // ============================================================
    // TAB: PROGRAMMATI
    // ============================================================

    async function _renderProgrammati(content) {
        _pagamentiProgrammati = await ENI.API.getPagamentiProgrammati();
        _categorie = await ENI.API.getCategorieTesoreria();

        var puoScrivere = ENI.State.canWrite('tesoreria');

        content.innerHTML =
            (puoScrivere ? '<div style="margin-bottom:var(--space-4);">' +
                '<button class="btn btn-primary" id="btn-nuovo-programmato">\u2795 Nuovo Pagamento Programmato</button>' +
            '</div>' : '') +

            '<div class="cassa-section">' +
                '<div class="cassa-section-title">\u{1F4C5} Pagamenti Programmati (' + _pagamentiProgrammati.length + ')</div>' +
                _renderProgrammatiTable(puoScrivere) +
            '</div>';

        if (puoScrivere) {
            var btn = document.getElementById('btn-nuovo-programmato');
            if (btn) btn.addEventListener('click', function() { _showProgrammatoForm(); });
        }
    }

    function _renderProgrammatiTable(puoScrivere) {
        if (_pagamentiProgrammati.length === 0) {
            return '<div class="empty-state"><p class="empty-state-text">Nessun pagamento programmato</p></div>';
        }

        var oggi = ENI.UI.oggiISO();
        var html = '<div class="table-responsive"><table class="table">' +
            '<thead><tr><th>Scadenza</th><th>Descrizione</th><th>Importo</th><th>Tipo</th><th>Categoria</th><th>Stato</th>' +
            (puoScrivere ? '<th>Azioni</th>' : '') +
            '</tr></thead><tbody>';

        _pagamentiProgrammati.forEach(function(p) {
            var tipoClass = p.tipo === 'uscita' ? 'badge-danger' : 'badge-success';
            var statoClass = p.stato === 'pagato' ? 'badge-success' : (p.stato === 'annullato' ? 'badge-outline' : 'badge-warning');
            var scaduto = p.stato === 'programmato' && p.data_scadenza < oggi;

            html += '<tr class="' + (scaduto ? 'tesoreria-row-scaduto' : '') + '">' +
                '<td>' + ENI.UI.formatData(p.data_scadenza) +
                    (scaduto ? ' <span class="badge badge-danger badge-sm">SCADUTO</span>' : '') +
                '</td>' +
                '<td><strong>' + ENI.UI.escapeHtml(p.descrizione) + '</strong>' +
                    (p.note ? '<div class="text-sm text-muted">' + ENI.UI.escapeHtml(p.note) + '</div>' : '') +
                '</td>' +
                '<td class="' + (p.tipo === 'uscita' ? 'text-danger' : 'text-success') + '" style="font-weight:600;">' +
                    ENI.UI.formatValuta(p.importo) + '</td>' +
                '<td><span class="badge ' + tipoClass + '">' + p.tipo + '</span></td>' +
                '<td>' + (p.categoria ? ENI.UI.escapeHtml(p.categoria) : '-') + '</td>' +
                '<td><span class="badge ' + statoClass + '">' + p.stato + '</span>' +
                    (p.data_pagamento ? '<div class="text-sm text-muted">Pagato il ' + ENI.UI.formatData(p.data_pagamento) + '</div>' : '') +
                '</td>' +
                (puoScrivere
                    ? '<td><div class="flex gap-1">' +
                        (p.stato === 'programmato'
                            ? '<button class="btn btn-sm btn-success" data-paga-prog="' + p.id + '">Pagato</button>' +
                              '<button class="btn btn-sm btn-outline" data-edit-prog="' + p.id + '">Modifica</button>' +
                              '<button class="btn btn-sm btn-outline" data-annulla-prog="' + p.id + '">Annulla</button>'
                            : '') +
                        '<button class="btn btn-sm btn-danger" data-del-prog="' + p.id + '">Elimina</button>' +
                      '</div></td>'
                    : '') +
            '</tr>';
        });

        html += '</tbody></table></div>';
        setTimeout(function() { _setupProgrammatiActions(); }, 0);
        return html;
    }

    function _setupProgrammatiActions() {
        document.querySelectorAll('[data-paga-prog]').forEach(function(btn) {
            btn.addEventListener('click', async function() {
                var id = btn.dataset.pagaProg;
                var p = _pagamentiProgrammati.find(function(r) { return r.id === id; });
                if (!p) return;
                try {
                    await ENI.API.pagaPagamentoProgrammato(id, p);
                    ENI.UI.success('Pagamento segnato come pagato');
                    _loadTab();
                } catch(e) { ENI.UI.error('Errore: ' + e.message); }
            });
        });

        document.querySelectorAll('[data-edit-prog]').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var id = btn.dataset.editProg;
                var p = _pagamentiProgrammati.find(function(r) { return r.id === id; });
                if (p) _showProgrammatoForm(p);
            });
        });

        document.querySelectorAll('[data-annulla-prog]').forEach(function(btn) {
            btn.addEventListener('click', async function() {
                var id = btn.dataset.annullaProg;
                var p = _pagamentiProgrammati.find(function(r) { return r.id === id; });
                if (!p) return;
                try {
                    await ENI.API.annullaPagamentoProgrammato(id, p);
                    ENI.UI.success('Pagamento annullato');
                    _loadTab();
                } catch(e) { ENI.UI.error('Errore: ' + e.message); }
            });
        });

        document.querySelectorAll('[data-del-prog]').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var id = btn.dataset.delProg;
                var p = _pagamentiProgrammati.find(function(r) { return r.id === id; });
                if (!p) return;
                var modal = ENI.UI.showModal({
                    title: 'Elimina Pagamento',
                    body: '<p>Eliminare il pagamento <strong>' + ENI.UI.escapeHtml(p.descrizione) + '</strong>?</p>',
                    footer: '<button class="btn btn-outline" data-modal-close>Annulla</button>' +
                            '<button class="btn btn-danger" id="btn-conferma-del-prog">Elimina</button>'
                });
                modal.querySelector('#btn-conferma-del-prog').addEventListener('click', async function() {
                    try {
                        await ENI.API.remove('pagamenti_programmati', id);
                        await ENI.API.scriviLog('Eliminato_Pagamento_Programmato', 'Tesoreria', p.descrizione);
                        ENI.UI.closeModal(modal);
                        ENI.UI.success('Pagamento eliminato');
                        _loadTab();
                    } catch(e) { ENI.UI.error('Errore: ' + e.message); }
                });
            });
        });
    }

    function _showProgrammatoForm(existing) {
        var isEdit = !!existing;
        var catOptions = _categorie.map(function(c) {
            var sel = existing && existing.categoria === c.nome ? ' selected' : '';
            return '<option value="' + ENI.UI.escapeHtml(c.nome) + '"' + sel + '>' + (c.icona || '') + ' ' + ENI.UI.escapeHtml(c.nome) + '</option>';
        }).join('');

        var html =
            '<div style="display:flex; flex-direction:column; gap:var(--space-3);">' +
                '<div class="form-group"><label class="form-label">Descrizione *</label>' +
                    '<input type="text" class="form-input" id="prog-desc" value="' + (existing ? ENI.UI.escapeHtml(existing.descrizione) : '') + '" placeholder="Es. Fattura fornitore XYZ"></div>' +
                '<div style="display:flex; gap:var(--space-3);">' +
                    '<div class="form-group" style="flex:1;"><label class="form-label">Importo *</label>' +
                        '<input type="number" class="form-input" id="prog-importo" step="0.01" min="0" value="' + (existing ? existing.importo : '') + '"></div>' +
                    '<div class="form-group" style="flex:1;"><label class="form-label">Tipo *</label>' +
                        '<select class="form-select" id="prog-tipo">' +
                            '<option value="uscita"' + (existing && existing.tipo === 'uscita' ? ' selected' : '') + '>Uscita</option>' +
                            '<option value="entrata"' + (existing && existing.tipo === 'entrata' ? ' selected' : '') + '>Entrata</option>' +
                        '</select></div>' +
                '</div>' +
                '<div style="display:flex; gap:var(--space-3);">' +
                    '<div class="form-group" style="flex:1;"><label class="form-label">Data scadenza *</label>' +
                        '<input type="date" class="form-input" id="prog-scadenza" value="' + (existing ? existing.data_scadenza : '') + '"></div>' +
                    '<div class="form-group" style="flex:1;"><label class="form-label">Categoria</label>' +
                        '<select class="form-select" id="prog-cat"><option value="">-- Nessuna --</option>' + catOptions + '</select></div>' +
                '</div>' +
                '<div class="form-group"><label class="form-label">Note</label>' +
                    '<textarea class="form-input" id="prog-note" rows="2">' + (existing ? ENI.UI.escapeHtml(existing.note || '') : '') + '</textarea></div>' +
            '</div>';

        var btnLabel = isEdit ? 'Salva' : 'Crea';
        var modal = ENI.UI.showModal({
            title: isEdit ? 'Modifica Pagamento' : 'Nuovo Pagamento Programmato',
            body: html,
            footer: '<button class="btn btn-outline" data-modal-close>Annulla</button>' +
                    '<button class="btn btn-primary" id="btn-salva-prog">' + btnLabel + '</button>'
        });
        modal.querySelector('#btn-salva-prog').addEventListener('click', async function() {
            var dati = {
                descrizione: document.getElementById('prog-desc').value.trim(),
                importo: parseFloat(document.getElementById('prog-importo').value),
                tipo: document.getElementById('prog-tipo').value,
                data_scadenza: document.getElementById('prog-scadenza').value,
                categoria: document.getElementById('prog-cat').value || null,
                note: document.getElementById('prog-note').value.trim() || null
            };

            if (!dati.descrizione || isNaN(dati.importo) || dati.importo <= 0 || !dati.data_scadenza) {
                ENI.UI.warning('Compilare tutti i campi obbligatori');
                return;
            }

            try {
                if (isEdit) {
                    await ENI.API.aggiornaPagamentoProgrammato(existing.id, dati);
                    ENI.UI.success('Pagamento aggiornato');
                } else {
                    await ENI.API.salvaPagamentoProgrammato(dati);
                    ENI.UI.success('Pagamento creato');
                }
                ENI.UI.closeModal(modal);
                _loadTab();
            } catch(e) { ENI.UI.error('Errore: ' + e.message); }
        });
    }

    // ============================================================
    // TAB: CATEGORIE
    // ============================================================

    async function _renderCategorie(content) {
        _categorie = await ENI.API.getCategorieTesoreria();
        var puoScrivere = ENI.State.canWrite('tesoreria');

        content.innerHTML =
            (puoScrivere ? '<div style="margin-bottom:var(--space-4);">' +
                '<button class="btn btn-primary" id="btn-nuova-cat">\u2795 Nuova Categoria</button>' +
            '</div>' : '') +

            '<div class="cassa-section">' +
                '<div class="cassa-section-title">\u{1F3F7}\uFE0F Categorie Tesoreria (' + _categorie.length + ')</div>' +
                _renderCategorieTable(puoScrivere) +
            '</div>';

        if (puoScrivere) {
            var btn = document.getElementById('btn-nuova-cat');
            if (btn) btn.addEventListener('click', function() { _showCategoriaForm(); });
        }
    }

    function _renderCategorieTable(puoScrivere) {
        if (_categorie.length === 0) {
            return '<div class="empty-state"><p class="empty-state-text">Nessuna categoria</p></div>';
        }

        var html = '<div class="table-responsive"><table class="table">' +
            '<thead><tr><th>Icona</th><th>Nome</th><th>Tipo</th><th>Ordine</th>' +
            (puoScrivere ? '<th>Azioni</th>' : '') +
            '</tr></thead><tbody>';

        _categorie.forEach(function(c) {
            var tipoClass = c.tipo === 'uscita' ? 'badge-danger' : (c.tipo === 'entrata' ? 'badge-success' : 'badge-info');
            html += '<tr>' +
                '<td style="font-size:1.3rem;">' + (c.icona || '-') + '</td>' +
                '<td><strong>' + ENI.UI.escapeHtml(c.nome) + '</strong></td>' +
                '<td><span class="badge ' + tipoClass + '">' + c.tipo + '</span></td>' +
                '<td>' + c.ordine + '</td>' +
                (puoScrivere
                    ? '<td><div class="flex gap-1">' +
                        '<button class="btn btn-sm btn-outline" data-edit-cat="' + c.id + '">Modifica</button>' +
                        '<button class="btn btn-sm btn-danger" data-del-cat="' + c.id + '">Elimina</button>' +
                      '</div></td>'
                    : '') +
            '</tr>';
        });

        html += '</tbody></table></div>';
        setTimeout(function() { _setupCategorieActions(); }, 0);
        return html;
    }

    function _setupCategorieActions() {
        document.querySelectorAll('[data-edit-cat]').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var id = btn.dataset.editCat;
                var c = _categorie.find(function(cat) { return cat.id === id; });
                if (c) _showCategoriaForm(c);
            });
        });

        document.querySelectorAll('[data-del-cat]').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var id = btn.dataset.delCat;
                var c = _categorie.find(function(cat) { return cat.id === id; });
                if (!c) return;
                var modal = ENI.UI.showModal({
                    title: 'Elimina Categoria',
                    body: '<p>Eliminare la categoria <strong>' + ENI.UI.escapeHtml(c.nome) + '</strong>?</p>',
                    footer: '<button class="btn btn-outline" data-modal-close>Annulla</button>' +
                            '<button class="btn btn-danger" id="btn-conferma-del-cat">Elimina</button>'
                });
                modal.querySelector('#btn-conferma-del-cat').addEventListener('click', async function() {
                    try {
                        await ENI.API.eliminaCategoriaTesoreria(id, c.nome);
                        ENI.UI.closeModal(modal);
                        ENI.UI.success('Categoria eliminata');
                        _loadTab();
                    } catch(e) { ENI.UI.error('Errore: ' + e.message); }
                });
            });
        });
    }

    function _showCategoriaForm(existing) {
        var isEdit = !!existing;

        var html =
            '<div style="display:flex; flex-direction:column; gap:var(--space-3);">' +
                '<div class="form-group"><label class="form-label">Nome *</label>' +
                    '<input type="text" class="form-input" id="cat-nome" value="' + (existing ? ENI.UI.escapeHtml(existing.nome) : '') + '" placeholder="Es. Utenze"></div>' +
                '<div style="display:flex; gap:var(--space-3);">' +
                    '<div class="form-group" style="flex:1;"><label class="form-label">Tipo *</label>' +
                        '<select class="form-select" id="cat-tipo">' +
                            '<option value="uscita"' + (existing && existing.tipo === 'uscita' ? ' selected' : '') + '>Uscita</option>' +
                            '<option value="entrata"' + (existing && existing.tipo === 'entrata' ? ' selected' : '') + '>Entrata</option>' +
                            '<option value="entrambi"' + (existing && existing.tipo === 'entrambi' ? ' selected' : '') + '>Entrambi</option>' +
                        '</select></div>' +
                    '<div class="form-group" style="flex:1;"><label class="form-label">Icona (emoji)</label>' +
                        '<input type="text" class="form-input" id="cat-icona" value="' + (existing ? existing.icona || '' : '') + '" placeholder="Es. \u{1F3E0}" maxlength="4"></div>' +
                '</div>' +
                '<div class="form-group"><label class="form-label">Ordine</label>' +
                    '<input type="number" class="form-input" id="cat-ordine" min="0" value="' + (existing ? existing.ordine : _categorie.length + 1) + '"></div>' +
            '</div>';

        var btnLabel = isEdit ? 'Salva' : 'Crea';
        var modal = ENI.UI.showModal({
            title: isEdit ? 'Modifica Categoria' : 'Nuova Categoria',
            body: html,
            footer: '<button class="btn btn-outline" data-modal-close>Annulla</button>' +
                    '<button class="btn btn-primary" id="btn-salva-cat">' + btnLabel + '</button>'
        });
        modal.querySelector('#btn-salva-cat').addEventListener('click', async function() {
            var dati = {
                nome: document.getElementById('cat-nome').value.trim(),
                tipo: document.getElementById('cat-tipo').value,
                icona: document.getElementById('cat-icona').value.trim() || null,
                ordine: parseInt(document.getElementById('cat-ordine').value) || 0
            };

            if (!dati.nome) {
                ENI.UI.warning('Inserire il nome della categoria');
                return;
            }

            try {
                if (isEdit) {
                    await ENI.API.aggiornaCategoriaTesoreria(existing.id, dati);
                    ENI.UI.success('Categoria aggiornata');
                } else {
                    await ENI.API.salvaCategoriaTesoreria(dati);
                    ENI.UI.success('Categoria creata');
                }
                ENI.UI.closeModal(modal);
                _loadTab();
            } catch(e) { ENI.UI.error('Errore: ' + e.message); }
        });
    }

    // ============================================================
    // HELPER: Cash Flow - SOLO Movimenti Banca
    // ============================================================

    function _buildFlussi(movimentiBanca) {
        var flussi = [];

        movimentiBanca.forEach(function(m) {
            flussi.push({
                data: m.data_operazione,
                descrizione: m.descrizione,
                importo: Number(m.importo),
                banca: m.banca || '',
                saldo: m.saldo_progressivo != null ? Number(m.saldo_progressivo) : null
            });
        });

        // Ordina per data
        flussi.sort(function(a, b) { return a.data.localeCompare(b.data); });

        // Se non abbiamo saldo dalla banca, calcoliamolo progressivamente con saldo iniziale
        var hasSaldo = flussi.some(function(f) { return f.saldo != null; });
        if (!hasSaldo) {
            // Somma saldi iniziali di tutte le banche
            var saldo = 0;
            var siCarisp = _getSaldoIniziale('carisp');
            var siBsi = _getSaldoIniziale('bsi');
            if (siCarisp) saldo += siCarisp.importo;
            if (siBsi) saldo += siBsi.importo;
            flussi.forEach(function(f) {
                saldo += f.importo;
                f.saldo = Math.round(saldo * 100) / 100;
            });
        } else {
            // Riempi eventuali buchi nel saldo
            var lastSaldo = 0;
            flussi.forEach(function(f) {
                if (f.saldo != null) {
                    lastSaldo = f.saldo;
                } else {
                    lastSaldo += f.importo;
                    f.saldo = Math.round(lastSaldo * 100) / 100;
                }
            });
        }

        return flussi;
    }

    // ============================================================
    // HELPER: Auto-Scadenze da Carichi Carburante
    // ============================================================

    function _getAutoScadenzeCarichi(carichi) {
        var scadenze = [];
        if (!carichi || carichi.length === 0) return scadenze;

        carichi.forEach(function(c) {
            var dataCarico = new Date(c.data);
            var litriFiscali = parseFloat(c.litri_fiscali) || 0;
            var prezzoMp = parseFloat(c.prezzo_mp) || 0;
            var accisa = parseFloat(c.accisa) || 0;

            if (litriFiscali <= 0) return;

            var prodotto = c.prodotto_id || 'carburante';

            // 1. RID Fornitore: materia prima, +5 giorni
            var dataRid = new Date(dataCarico);
            dataRid.setDate(dataRid.getDate() + 5);
            var importoRid = litriFiscali * prezzoMp;
            if (importoRid > 0) {
                scadenze.push({
                    data_scadenza: _dateToISO(dataRid),
                    descrizione: 'RID ' + prodotto + ' (' + _fmtNum(litriFiscali, 0) + 'lt, carico ' + ENI.UI.formatData(c.data) + ')',
                    importo: Math.round(importoRid * 100) / 100,
                    tipo_scadenza: 'rid'
                });
            }

            // 2. Accise + Monofase accise: +24 giorni
            var dataAccise = new Date(dataCarico);
            dataAccise.setDate(dataAccise.getDate() + 24);
            var importoAccise = litriFiscali * accisa * 1.21;
            if (importoAccise > 0) {
                scadenze.push({
                    data_scadenza: _dateToISO(dataAccise),
                    descrizione: 'Accise+IVA ' + prodotto + ' (' + _fmtNum(litriFiscali, 0) + 'lt, carico ' + ENI.UI.formatData(c.data) + ')',
                    importo: Math.round(importoAccise * 100) / 100,
                    tipo_scadenza: 'accise'
                });
            }

            // 3. Monofase materia prima: +120 giorni
            var dataMonofase = new Date(dataCarico);
            dataMonofase.setDate(dataMonofase.getDate() + 120);
            var importoMonofase = litriFiscali * prezzoMp * 0.21;
            if (importoMonofase > 0) {
                scadenze.push({
                    data_scadenza: _dateToISO(dataMonofase),
                    descrizione: 'Monofase MP ' + prodotto + ' (' + _fmtNum(litriFiscali, 0) + 'lt, carico ' + ENI.UI.formatData(c.data) + ')',
                    importo: Math.round(importoMonofase * 100) / 100,
                    tipo_scadenza: 'monofase'
                });
            }
        });

        // Ordina per data scadenza
        scadenze.sort(function(a, b) { return a.data_scadenza.localeCompare(b.data_scadenza); });

        return scadenze;
    }

    // ============================================================
    // HELPER: Media Accrediti Bancari (ultimi 30gg)
    // ============================================================

    async function _getAccreditiBanca30gg() {
        try {
            var oggi = new Date();
            var da30 = new Date(oggi);
            da30.setDate(da30.getDate() - 30);

            var movimenti = await ENI.API.getMovimentiBanca({
                da: da30.toISOString().split('T')[0],
                a: oggi.toISOString().split('T')[0],
                asc: true
            });

            // Somma solo accrediti (importo > 0)
            var totAccrediti = 0;
            var giorniConMovimenti = {};
            movimenti.forEach(function(m) {
                if (Number(m.importo) > 0) {
                    totAccrediti += Number(m.importo);
                }
                giorniConMovimenti[m.data_operazione] = true;
            });

            return {
                totale: totAccrediti,
                giorni: Object.keys(giorniConMovimenti).length || 1
            };
        } catch(e) {
            return { totale: 0, giorni: 1 };
        }
    }

    // ============================================================
    // HELPER: Calcolo previsto 30gg (per KPI)
    // ============================================================

    function _calcolaPrevisto30gg(ricorrenti, programmati, autoScadenze, accrediti30gg, mediaSpeseCassaGiorno, entrata4TS) {
        var oggi = new Date();
        var limite = new Date();
        limite.setDate(limite.getDate() + 30);
        var oggiStr = ENI.UI.oggiISO();
        var limiteStr = limite.toISOString().split('T')[0];

        var uscite = 0;
        var entrate = 0;
        var nUscite = 0;
        var nEntrate = 0;

        // Programmati
        programmati.forEach(function(p) {
            if (p.data_scadenza >= oggiStr && p.data_scadenza <= limiteStr) {
                if (p.tipo === 'uscita') { uscite += Number(p.importo); nUscite++; }
                else { entrate += Number(p.importo); nEntrate++; }
            }
        });

        // Ricorrenti
        ricorrenti.forEach(function(r) {
            var date = _getProssimeDateRicorrente(r, oggi, limite);
            date.forEach(function() {
                if (r.tipo === 'uscita') { uscite += Number(r.importo); nUscite++; }
                else { entrate += Number(r.importo); nEntrate++; }
            });
        });

        // Auto-scadenze carichi
        autoScadenze.forEach(function(s) {
            if (s.data_scadenza >= oggiStr && s.data_scadenza <= limiteStr) {
                uscite += s.importo;
                nUscite++;
            }
        });

        // Spese cassa (contanti) - non passano dalla banca
        if (mediaSpeseCassaGiorno > 0) {
            uscite += mediaSpeseCassaGiorno * 30;
        }

        // Entrata 4TS Card prevista
        if (entrata4TS && entrata4TS.importo > 0 && entrata4TS.inArrivo) {
            entrate += entrata4TS.importo;
            nEntrate++;
        }

        // Entrate da media accrediti
        var mediaGiornaliera = accrediti30gg.totale > 0 ? accrediti30gg.totale / accrediti30gg.giorni : 0;
        entrate += mediaGiornaliera * 30;

        return {
            uscite: uscite,
            entrate: entrate,
            dettaglioUscite: nUscite + ' pagamenti' + (mediaSpeseCassaGiorno > 0 ? ' + spese cassa' : ''),
            dettaglioEntrate: nEntrate + ' fissi + media giornaliera'
        };
    }

    // ============================================================
    // HELPER: Periodi e Date
    // ============================================================

    function _getPeriodoRange(anno, mese, tipo) {
        if (tipo === 'mensile') {
            var primoGiorno = anno + '-' + String(mese).padStart(2, '0') + '-01';
            var ultimoGiorno = anno + '-' + String(mese).padStart(2, '0') + '-' + new Date(anno, mese, 0).getDate();
            return { da: primoGiorno, a: ultimoGiorno };
        } else if (tipo === 'trimestrale') {
            var trimestre = Math.ceil(mese / 3);
            var meseInizio = (trimestre - 1) * 3 + 1;
            var meseFine = trimestre * 3;
            return {
                da: anno + '-' + String(meseInizio).padStart(2, '0') + '-01',
                a: anno + '-' + String(meseFine).padStart(2, '0') + '-' + new Date(anno, meseFine, 0).getDate()
            };
        } else {
            return { da: anno + '-01-01', a: anno + '-12-31' };
        }
    }

    function _getPeriodoLabel(anno, mese, tipo) {
        if (tipo === 'mensile') {
            return _getNomeMese(mese - 1) + ' ' + anno;
        } else if (tipo === 'trimestrale') {
            var trim = Math.ceil(mese / 3);
            return 'Q' + trim + ' ' + anno;
        } else {
            return 'Anno ' + anno;
        }
    }

    function _getNomeMese(idx) {
        var nomi = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
                     'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
        return nomi[idx] || '';
    }

    function _getNomeMeseBreve(idx) {
        var nomi = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
        return nomi[idx] || '';
    }

    function _fonteLabelMap(fonte) {
        var map = { banca: 'Banca', ricorrente: 'Ricorrente', programmato: 'Programmato', carico: 'Carico', '4tscard': '4TS Card' };
        return map[fonte] || fonte;
    }

    function _dateToISO(d) {
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }

    function _fmtNum(n, dec) {
        return Number(n).toLocaleString('it-IT', { minimumFractionDigits: dec, maximumFractionDigits: dec });
    }

    function _ricorrenteCadeInMese(ricorrente, mese, anno) {
        if (ricorrente.frequenza === 'mensile') return true;

        if (ricorrente.mese_riferimento && ricorrente.mese_riferimento.length > 0) {
            return ricorrente.mese_riferimento.indexOf(mese) !== -1;
        }

        if (ricorrente.frequenza === 'trimestrale') {
            var inizio = new Date(ricorrente.data_inizio);
            var meseInizio = inizio.getMonth() + 1;
            return (mese - meseInizio) % 3 === 0;
        }

        if (ricorrente.frequenza === 'semestrale') {
            var inizio2 = new Date(ricorrente.data_inizio);
            var meseInizio2 = inizio2.getMonth() + 1;
            return (mese - meseInizio2) % 6 === 0;
        }

        if (ricorrente.frequenza === 'annuale') {
            var inizio3 = new Date(ricorrente.data_inizio);
            return mese === (inizio3.getMonth() + 1);
        }

        return false;
    }

    function _getProssimeDateRicorrente(ricorrente, da, a) {
        var date = [];
        var current = new Date(da);
        current.setDate(1);

        while (current <= a) {
            var mese = current.getMonth() + 1;
            var anno = current.getFullYear();

            if (_ricorrenteCadeInMese(ricorrente, mese, anno)) {
                var giorno = Math.min(ricorrente.giorno_scadenza, new Date(anno, mese, 0).getDate());
                var dataScad = anno + '-' + String(mese).padStart(2, '0') + '-' + String(giorno).padStart(2, '0');

                if (dataScad >= da.toISOString().split('T')[0] && dataScad <= a.toISOString().split('T')[0]) {
                    if (dataScad >= ricorrente.data_inizio && (!ricorrente.data_fine || dataScad <= ricorrente.data_fine)) {
                        date.push(dataScad);
                    }
                }
            }

            current.setMonth(current.getMonth() + 1);
        }

        return date;
    }

    function _contaScadenzeProssime(ricorrenti, programmati, autoScadenze, giorni) {
        var count = 0;
        var oggi = new Date();
        var limite = new Date();
        limite.setDate(limite.getDate() + giorni);
        var oggiStr = ENI.UI.oggiISO();
        var limiteStr = limite.toISOString().split('T')[0];

        // Programmati
        programmati.forEach(function(p) {
            if (p.stato === 'programmato' && p.data_scadenza >= oggiStr && p.data_scadenza <= limiteStr) {
                count++;
            }
        });

        // Ricorrenti
        ricorrenti.forEach(function(r) {
            var date = _getProssimeDateRicorrente(r, oggi, limite);
            count += date.length;
        });

        // Auto-scadenze carichi
        autoScadenze.forEach(function(s) {
            if (s.data_scadenza >= oggiStr && s.data_scadenza <= limiteStr) {
                count++;
            }
        });

        return count;
    }

    // ============================================================
    // CHECK SCADENZE (per alert badge in navbar)
    // ============================================================

    async function checkScadenze() {
        try {
            var data = await ENI.API.getScadenzeTesoreria(7);
            var count = 0;

            // Programmati
            count += data.programmati.length;

            // Ricorrenti
            var oggi = new Date();
            var limite = new Date();
            limite.setDate(limite.getDate() + 7);

            data.ricorrenti.forEach(function(r) {
                var date = _getProssimeDateRicorrente(r, oggi, limite);
                count += date.length;
            });

            // Auto-scadenze da carichi carburante
            try {
                var da150 = new Date(oggi);
                da150.setDate(da150.getDate() - 150);
                var carichi = await ENI.API.getCarichiCarburante(da150.toISOString().split('T')[0], null);
                var autoScadenze = _getAutoScadenzeCarichi(carichi);
                var oggiStr = ENI.UI.oggiISO();
                var limiteStr = limite.toISOString().split('T')[0];

                autoScadenze.forEach(function(s) {
                    if (s.data_scadenza >= oggiStr && s.data_scadenza <= limiteStr) {
                        count++;
                    }
                });
            } catch(e) {
                // Silenzioso: se carichi non disponibili, ignora
            }

            return count;
        } catch(e) {
            return 0;
        }
    }

    // ============================================================
    // TAB: STORICO & PREVISIONI
    // ============================================================

    var STORICO_TOOLTIPS = {
        bankIn: 'Somma degli accrediti bancari (Carisp + BSI) nel mese, dai movimenti importati.',
        bankOut: 'Somma degli addebiti bancari (Carisp + BSI) nel mese, dai movimenti importati.',
        cashIn: 'Totale incassato giornaliero dalla chiusura cassa (contanti + POS + buoni + crediti).',
        cashOut: 'Totale spese contanti registrate nel modulo Spese Cassa.',
        fuel: 'SOLO INFORMATIVO - Costo carichi ricevuti nel mese. Non sommato nel netto perche\' gia\' incluso nelle uscite banca (RID, Accise, Monofase).',
        bankIn_prev: 'Media giornaliera accrediti bancari (ultimi 60gg di dati) moltiplicata per i giorni del mese.',
        bankOut_prev: 'Il maggiore tra: media giornaliera uscite bancarie (60gg) x giorni, oppure scadenze note (ricorrenti + programmati + auto-scadenze carichi RID/Accise/Monofase). Man mano che inserisci ricorrenti e arrivano le scadenze carichi, la previsione diventa piu\' precisa.',
        cashIn_prev: 'Media giornaliera incassi cassa (ultimi 60gg) moltiplicata per i giorni del mese.',
        cashOut_prev: 'Media giornaliera spese contanti (ultimi 60gg) moltiplicata per i giorni del mese.',
        fuel_prev: 'SOLO INFORMATIVO - Media mensile costo carichi. Non sommato nel netto perche\' gia\' incluso nelle uscite banca previste.',
        saldo: 'Saldo cumulativo: saldi iniziali banca + somma dei netti mensili. Dipende dalla completezza dei movimenti importati.'
    };

    function _infoIcon(tooltipKey) {
        var text = STORICO_TOOLTIPS[tooltipKey] || tooltipKey;
        return '<span class="storico-info" data-tooltip="' + text.replace(/"/g, '&quot;') + '">i</span>';
    }

    async function _renderStorico(content) {
        // Distruggi chart precedente
        if (_storicoChart) { _storicoChart.destroy(); _storicoChart = null; }

        content.innerHTML = '<div class="flex justify-center" style="padding:2rem;"><div class="spinner"></div> Caricamento dati storico...</div>';

        try {
            var oggi = new Date();
            var oggiStr = ENI.UI.oggiISO();

            // Carica tutti i dati in parallelo
            var results = await Promise.all([
                ENI.API.getMovimentiBanca({ da: DATA_APERTURA, asc: true, limit: 5000 }),
                ENI.API.getCassaPeriodo(DATA_APERTURA, oggiStr),
                ENI.API.getCarichiCarburante(DATA_APERTURA, null),
                ENI.API.getSpeseCassaPeriodo(DATA_APERTURA, oggiStr),
                ENI.API.getPagamentiRicorrenti(true),
                ENI.API.getPagamentiProgrammati()
            ]);

            var movBanca = results[0];
            var cassaRows = results[1];
            var carichi = results[2] || [];
            var speseCassa = results[3] || [];
            var ricorrenti = results[4];
            var programmati = results[5];

            // Aggrega per mese
            var mesiData = _aggregateStoricoMensile(movBanca, cassaRows, carichi, speseCassa, ricorrenti, programmati, oggi);

            if (_storicoDettaglioMese) {
                _renderStoricoDettaglio(content, mesiData, _storicoDettaglioMese);
            } else {
                _renderStoricoSummary(content, mesiData);
            }

        } catch(e) {
            content.innerHTML = '<div class="empty-state"><p class="text-danger">Errore: ' + ENI.UI.escapeHtml(e.message) + '</p></div>';
            console.error('Storico error:', e);
        }
    }

    function _aggregateStoricoMensile(movBanca, cassaRows, carichi, speseCassa, ricorrenti, programmati, oggi) {
        var oggiStr = _dateToISO(oggi);
        var meseCorrente = oggi.getFullYear() + '-' + String(oggi.getMonth() + 1).padStart(2, '0');

        // Range mesi: da DATA_APERTURA a oggi + 3 mesi
        var mesi = [];
        var start = new Date(2026, 1, 1); // Feb 2026
        var end = new Date(oggi.getFullYear(), oggi.getMonth() + 4, 0);
        var cur = new Date(start);
        while (cur <= end) {
            var key = cur.getFullYear() + '-' + String(cur.getMonth() + 1).padStart(2, '0');
            var giorniNelMese = new Date(cur.getFullYear(), cur.getMonth() + 1, 0).getDate();
            var tipo = key < meseCorrente ? 'reale' : (key === meseCorrente ? 'corrente' : 'previsione');
            mesi.push({ key: key, anno: cur.getFullYear(), mese: cur.getMonth() + 1, giorni: giorniNelMese, tipo: tipo,
                bankIn: 0, bankOut: 0, cashIn: 0, cashOut: 0, fuel: 0, saldo: 0 });
            cur.setMonth(cur.getMonth() + 1);
        }

        var meseMap = {};
        mesi.forEach(function(m) { meseMap[m.key] = m; });

        // Aggrega movimenti banca
        movBanca.forEach(function(mov) {
            var key = mov.data_operazione.substring(0, 7);
            if (meseMap[key]) {
                var imp = Number(mov.importo);
                if (imp > 0) meseMap[key].bankIn += imp;
                else meseMap[key].bankOut += Math.abs(imp);
            }
        });

        // Aggrega cassa
        cassaRows.forEach(function(c) {
            var key = c.data.substring(0, 7);
            if (meseMap[key]) {
                meseMap[key].cashIn += Number(c.totale_incassato || 0);
            }
        });

        // Aggrega spese cassa
        speseCassa.forEach(function(s) {
            var key = s.data.substring(0, 7);
            if (meseMap[key]) {
                meseMap[key].cashOut += Number(s.importo || 0);
            }
        });

        // Aggrega carichi carburante
        carichi.forEach(function(c) {
            var key = c.data.substring(0, 7);
            if (meseMap[key]) {
                meseMap[key].fuel += Number(c.costo_carico_totale || 0);
            }
        });

        // Auto-scadenze da carichi
        var autoScadenze = _getAutoScadenzeCarichi(carichi);

        // --- PREVISIONI per mesi futuri e parte futura del mese corrente ---

        // Medie giornaliere dagli ultimi 60 giorni di dati reali
        var da60 = new Date(oggi);
        da60.setDate(da60.getDate() - 60);
        var da60Str = _dateToISO(da60);

        var bankInRecent = 0, bankOutRecent = 0, bankDaysRecent = 0;
        var cashInRecent = 0, cashDaysRecent = 0;
        var cashOutRecent = 0;

        movBanca.forEach(function(m) {
            if (m.data_operazione >= da60Str && m.data_operazione <= oggiStr) {
                var imp = Number(m.importo);
                if (imp > 0) bankInRecent += imp;
                else bankOutRecent += Math.abs(imp);
                bankDaysRecent = 60;
            }
        });

        cassaRows.forEach(function(c) {
            if (c.data >= da60Str && c.data <= oggiStr) {
                cashInRecent += Number(c.totale_incassato || 0);
                cashDaysRecent = 60;
            }
        });

        speseCassa.forEach(function(s) {
            if (s.data >= da60Str && s.data <= oggiStr) {
                cashOutRecent += Number(s.importo || 0);
            }
        });

        var mediaBankInGiorno = bankDaysRecent > 0 ? bankInRecent / bankDaysRecent : 0;
        var mediaBankOutGiorno = bankDaysRecent > 0 ? bankOutRecent / bankDaysRecent : 0;
        var mediaCashInGiorno = cashDaysRecent > 0 ? cashInRecent / cashDaysRecent : 0;
        var mediaCashOutGiorno = cashDaysRecent > 0 ? cashOutRecent / cashDaysRecent : 0;

        // Media carichi mensile (ultimi 3 mesi reali)
        var mesiReali = mesi.filter(function(m) { return m.tipo === 'reale'; });
        var mediaFuelMese = 0;
        if (mesiReali.length > 0) {
            var totFuel = mesiReali.reduce(function(s, m) { return s + m.fuel; }, 0);
            mediaFuelMese = totFuel / mesiReali.length;
        }

        // Applica previsioni ai mesi futuri
        mesi.forEach(function(m) {
            if (m.tipo === 'previsione') {
                m.bankIn = mediaBankInGiorno * m.giorni;
                m.cashIn = mediaCashInGiorno * m.giorni;
                m.cashOut = mediaCashOutGiorno * m.giorni;
                m.fuel = mediaFuelMese;

                // Uscite banca: media storica come base + ricorrenti + programmati + auto-scadenze
                var bankOutBase = mediaBankOutGiorno * m.giorni;
                var bankOutExtra = 0; // extra da scadenze note (non gia' nella media)

                ricorrenti.forEach(function(r) {
                    if (r.tipo === 'uscita' && _ricorrenteCadeInMese(r, m.mese, m.anno)) {
                        bankOutExtra += Number(r.importo);
                    }
                });
                programmati.forEach(function(p) {
                    if (p.stato === 'programmato' && p.tipo === 'uscita') {
                        var scadKey = p.data_scadenza.substring(0, 7);
                        if (scadKey === m.key) bankOutExtra += Number(p.importo);
                    }
                });
                // Entrate da ricorrenti e programmati
                ricorrenti.forEach(function(r) {
                    if (r.tipo === 'entrata' && _ricorrenteCadeInMese(r, m.mese, m.anno)) {
                        m.bankIn += Number(r.importo);
                    }
                });
                programmati.forEach(function(p) {
                    if (p.stato === 'programmato' && p.tipo === 'entrata') {
                        var scadKey = p.data_scadenza.substring(0, 7);
                        if (scadKey === m.key) m.bankIn += Number(p.importo);
                    }
                });
                // Auto-scadenze carichi
                autoScadenze.forEach(function(s) {
                    var scadKey = s.data_scadenza.substring(0, 7);
                    if (scadKey === m.key) bankOutExtra += s.importo;
                });
                // Usa il maggiore tra media storica e scadenze note
                m.bankOut = Math.max(bankOutBase, bankOutExtra) > 0 ? Math.max(bankOutBase, bankOutExtra) : bankOutBase;

            } else if (m.tipo === 'corrente') {
                // Per il mese corrente: dati reali sono gia' aggregati sopra
                // Non aggiungiamo previsioni, mostriamo solo il dato parziale reale
            }
        });

        // Calcola saldo cumulativo
        var saldoIniziale = 0;
        var siCarisp = _getSaldoIniziale('carisp');
        var siBsi = _getSaldoIniziale('bsi');
        if (siCarisp) saldoIniziale += siCarisp.importo;
        if (siBsi) saldoIniziale += siBsi.importo;

        var saldoRunning = saldoIniziale;
        mesi.forEach(function(m) {
            var nettoBanca = m.bankIn - m.bankOut;
            saldoRunning += nettoBanca;
            m.saldo = Math.round(saldoRunning * 100) / 100;
            m.nettoBanca = Math.round(nettoBanca * 100) / 100;
        });

        return mesi;
    }

    function _renderStoricoSummary(content, mesiData) {
        var html = '<div class="cassa-section">' +
            '<div class="cassa-section-title">\u{1F4C8} Riepilogo Mensile</div>' +
            '<p class="text-sm text-muted" style="margin-bottom:var(--space-2);">Clicca su un mese per vedere il dettaglio. I mesi in <span class="storico-badge-previsione">blu</span> sono previsioni.</p>' +
            '<div class="table-responsive"><table class="table">' +
            '<thead><tr>' +
                '<th>Mese</th><th>Tipo</th>' +
                '<th style="text-align:right;">Banca IN</th>' +
                '<th style="text-align:right;">Banca OUT</th>' +
                '<th style="text-align:right;">Cassa IN</th>' +
                '<th style="text-align:right;">Cassa OUT</th>' +
                '<th style="text-align:right;">Carichi</th>' +
                '<th style="text-align:right;">Netto Banca</th>' +
                '<th style="text-align:right;">Saldo ' + _infoIcon('saldo') + '</th>' +
            '</tr></thead><tbody>';

        mesiData.forEach(function(m) {
            var rowClass = 'storico-row-' + m.tipo;
            var badge = m.tipo === 'reale' ? '<span class="storico-badge-reale">Reale</span>'
                : (m.tipo === 'corrente' ? '<span class="storico-badge-corrente">In corso</span>'
                : '<span class="storico-badge-previsione">Previsione</span>');
            var isPrev = m.tipo === 'previsione';
            var saldoClass = m.saldo >= 0 ? 'text-success' : 'text-danger';
            var nettoClass = m.nettoBanca >= 0 ? 'text-success' : 'text-danger';

            html += '<tr class="' + rowClass + '" data-storico-mese="' + m.key + '" style="cursor:pointer;">' +
                '<td><strong>' + _getNomeMese(m.mese - 1) + ' ' + m.anno + '</strong></td>' +
                '<td>' + badge + '</td>' +
                '<td style="text-align:right;">' + ENI.UI.formatValuta(m.bankIn) + (isPrev ? _infoIcon('bankIn_prev') : '') + '</td>' +
                '<td style="text-align:right;">' + ENI.UI.formatValuta(m.bankOut) + (isPrev ? _infoIcon('bankOut_prev') : '') + '</td>' +
                '<td style="text-align:right;">' + ENI.UI.formatValuta(m.cashIn) + (isPrev ? _infoIcon('cashIn_prev') : '') + '</td>' +
                '<td style="text-align:right;">' + ENI.UI.formatValuta(m.cashOut) + (isPrev ? _infoIcon('cashOut_prev') : '') + '</td>' +
                '<td style="text-align:right;">' + ENI.UI.formatValuta(m.fuel) + (isPrev ? _infoIcon('fuel_prev') : '') + '</td>' +
                '<td style="text-align:right;font-weight:600;" class="' + nettoClass + '">' + ENI.UI.formatValuta(m.nettoBanca) + '</td>' +
                '<td style="text-align:right;font-weight:700;" class="' + saldoClass + '">' + ENI.UI.formatValuta(m.saldo) + '</td>' +
            '</tr>';
        });

        html += '</tbody></table></div></div>';

        // Grafico
        html += '<div class="cassa-section">' +
            '<div class="cassa-section-title">\u{1F4C9} Trend Saldo Banca</div>' +
            '<div class="storico-chart-container"><canvas id="storico-chart"></canvas></div>' +
        '</div>';

        content.innerHTML = html;

        // Listeners
        document.querySelectorAll('[data-storico-mese]').forEach(function(row) {
            row.addEventListener('click', function() {
                _storicoDettaglioMese = row.dataset.storicoMese;
                _loadTab();
            });
        });

        // Render chart
        _renderStoricoChart(mesiData);
    }

    function _renderStoricoDettaglio(content, mesiData, meseKey) {
        var m = mesiData.find(function(d) { return d.key === meseKey; });
        if (!m) { _storicoDettaglioMese = null; _renderStoricoSummary(content, mesiData); return; }

        var badge = m.tipo === 'reale' ? '<span class="storico-badge-reale">Dati Reali</span>'
            : (m.tipo === 'corrente' ? '<span class="storico-badge-corrente">Mese in Corso</span>'
            : '<span class="storico-badge-previsione">Previsione</span>');
        var isPrev = m.tipo === 'previsione';

        var html = '<button class="storico-back-btn" id="btn-storico-back">\u2190 Torna al riepilogo</button>' +
            '<div class="storico-dettaglio-header">' +
                '<h3>' + _getNomeMese(m.mese - 1) + ' ' + m.anno + '</h3>' + badge +
            '</div>';

        // Tabella dettaglio per categoria
        html += '<div class="cassa-section"><div class="cassa-section-title">Dettaglio per Categoria</div>' +
            '<div class="table-responsive"><table class="table">' +
            '<thead><tr><th>Categoria</th><th style="text-align:right;">Entrate</th><th style="text-align:right;">Uscite</th><th>Note</th></tr></thead><tbody>';

        // Banca IN
        html += '<tr class="storico-separator"><td colspan="4">MOVIMENTI BANCARI</td></tr>';
        html += '<tr><td>\u{1F3E6} Accrediti Banca' + (isPrev ? _infoIcon('bankIn_prev') : _infoIcon('bankIn')) + '</td>' +
            '<td style="text-align:right;" class="text-success">' + ENI.UI.formatValuta(m.bankIn) + '</td>' +
            '<td></td><td class="text-sm text-muted">' + (isPrev ? 'Media giornaliera x ' + m.giorni + ' giorni' : 'Da movimenti importati') + '</td></tr>';
        html += '<tr><td>\u{1F3E6} Addebiti Banca' + (isPrev ? _infoIcon('bankOut_prev') : _infoIcon('bankOut')) + '</td>' +
            '<td></td>' +
            '<td style="text-align:right;" class="text-danger">' + ENI.UI.formatValuta(m.bankOut) + '</td>' +
            '<td class="text-sm text-muted">' + (isPrev ? 'Ricorrenti + Programmati + Auto-scadenze' : 'Da movimenti importati') + '</td></tr>';

        // Cassa
        html += '<tr class="storico-separator"><td colspan="4">OPERAZIONI CASSA</td></tr>';
        html += '<tr><td>\u{1F4B0} Incassi Cassa' + (isPrev ? _infoIcon('cashIn_prev') : _infoIcon('cashIn')) + '</td>' +
            '<td style="text-align:right;" class="text-success">' + ENI.UI.formatValuta(m.cashIn) + '</td>' +
            '<td></td><td class="text-sm text-muted">' + (isPrev ? 'Media giornaliera x ' + m.giorni + ' giorni' : 'Da chiusure cassa giornaliere') + '</td></tr>';
        html += '<tr><td>\u{1F4B8} Spese Cassa' + (isPrev ? _infoIcon('cashOut_prev') : _infoIcon('cashOut')) + '</td>' +
            '<td></td>' +
            '<td style="text-align:right;" class="text-danger">' + ENI.UI.formatValuta(m.cashOut) + '</td>' +
            '<td class="text-sm text-muted">' + (isPrev ? 'Media giornaliera x ' + m.giorni + ' giorni' : 'Da registro spese contanti') + '</td></tr>';

        // Carburante
        html += '<tr class="storico-separator"><td colspan="4">CARBURANTE</td></tr>';
        html += '<tr><td>\u26FD Carichi Carburante' + (isPrev ? _infoIcon('fuel_prev') : _infoIcon('fuel')) + '</td>' +
            '<td></td>' +
            '<td style="text-align:right;" class="text-danger">' + ENI.UI.formatValuta(m.fuel) + '</td>' +
            '<td class="text-sm text-muted">' + (isPrev ? 'Media mensile ultimi mesi' : 'Costo totale carichi ricevuti') + '</td></tr>';

        // Totali (carichi NON sommati: sono gia' inclusi nelle uscite banca come RID/Accise/Monofase)
        var totEntrate = m.bankIn + m.cashIn;
        var totUscite = m.bankOut + m.cashOut;
        var totNetto = totEntrate - totUscite;

        html += '<tr class="storico-separator"><td colspan="4">RIEPILOGO (i carichi sono gia\' inclusi nelle uscite banca come RID/Accise/Monofase)</td></tr>';
        html += '<tr style="font-weight:700;">' +
            '<td>TOTALE</td>' +
            '<td style="text-align:right;" class="text-success">' + ENI.UI.formatValuta(totEntrate) + '</td>' +
            '<td style="text-align:right;" class="text-danger">' + ENI.UI.formatValuta(totUscite) + '</td>' +
            '<td style="text-align:right;font-weight:700;" class="' + (totNetto >= 0 ? 'text-success' : 'text-danger') + '">Netto: ' + ENI.UI.formatValuta(totNetto) + '</td></tr>';

        html += '</tbody></table></div>';

        // Saldo
        html += '<div class="tesoreria-totali-row" style="margin-top:var(--space-3);">' +
            '<div class="tesoreria-totale ' + (m.saldo >= 0 ? 'tesoreria-totale-positivo' : 'tesoreria-totale-negativo') + '">' +
                '<span>Saldo Banca Cumulativo' + _infoIcon('saldo') + '</span><strong>' + ENI.UI.formatValuta(m.saldo) + '</strong>' +
            '</div>' +
        '</div>';

        html += '</div>';

        content.innerHTML = html;

        document.getElementById('btn-storico-back').addEventListener('click', function() {
            _storicoDettaglioMese = null;
            _loadTab();
        });
    }

    function _renderStoricoChart(mesiData) {
        var canvas = document.getElementById('storico-chart');
        if (!canvas || typeof Chart === 'undefined') return;

        var labels = mesiData.map(function(m) { return _getNomeMeseBreve(m.mese - 1) + ' ' + m.anno; });
        var saldi = mesiData.map(function(m) { return Math.round(m.saldo); });
        var entrate = mesiData.map(function(m) { return Math.round(m.bankIn); });
        var uscite = mesiData.map(function(m) { return Math.round(m.bankOut); });

        // Indice primo mese previsione
        var prevIdx = mesiData.findIndex(function(m) { return m.tipo === 'previsione'; });
        if (prevIdx === -1) prevIdx = mesiData.length;

        _storicoChart = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Saldo Banca',
                        data: saldi,
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59,130,246,0.1)',
                        fill: true,
                        tension: 0.3,
                        pointRadius: 5,
                        pointHoverRadius: 7,
                        segment: {
                            borderDash: function(ctx) { return ctx.p0DataIndex >= prevIdx - 1 ? [6, 4] : undefined; }
                        }
                    },
                    {
                        label: 'Entrate Banca',
                        data: entrate,
                        borderColor: '#22c55e',
                        backgroundColor: 'transparent',
                        tension: 0.3,
                        pointRadius: 3,
                        borderWidth: 2,
                        segment: {
                            borderDash: function(ctx) { return ctx.p0DataIndex >= prevIdx - 1 ? [6, 4] : undefined; }
                        }
                    },
                    {
                        label: 'Uscite Banca',
                        data: uscite,
                        borderColor: '#ef4444',
                        backgroundColor: 'transparent',
                        tension: 0.3,
                        pointRadius: 3,
                        borderWidth: 2,
                        segment: {
                            borderDash: function(ctx) { return ctx.p0DataIndex >= prevIdx - 1 ? [6, 4] : undefined; }
                        }
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom' },
                    tooltip: {
                        callbacks: {
                            label: function(ctx) { return ctx.dataset.label + ': ' + Number(ctx.parsed.y).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' }); }
                        }
                    }
                },
                scales: {
                    y: {
                        ticks: {
                            callback: function(val) { return '\u20AC ' + Number(val).toLocaleString('it-IT'); }
                        }
                    }
                }
            }
        });
    }

    // API pubblica
    return {
        render: render,
        checkScadenze: checkScadenze
    };
})();
