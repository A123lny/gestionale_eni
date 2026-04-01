// ============================================================
// TITANWASH - Modulo Tesoreria (Cash Flow)
// Gestione flussi di cassa, movimenti banca, pagamenti
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
            { id: 'categorie', label: 'Categorie', icon: '\u{1F3F7}\uFE0F' }
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
        // Carica dati in parallelo
        var oggi = ENI.UI.oggiISO();
        var anno = _annoCorrente;
        var mese = _meseCorrente;

        var periodoRange = _getPeriodoRange(anno, mese, _periodoVista);

        var results = await Promise.all([
            ENI.API.getUltimoSaldoBanca(),
            ENI.API.getCassaPerData(oggi).catch(function() { return null; }),
            ENI.API.getMovimentiBanca({ da: periodoRange.da, a: periodoRange.a, asc: true }),
            ENI.API.getPagamentiRicorrenti(true),
            ENI.API.getPagamentiProgrammati('programmato'),
            _getCassaPeriodo(periodoRange.da, periodoRange.a),
            _getSpesePeriodo(periodoRange.da, periodoRange.a),
            _getCreditiIncassatiPeriodo(periodoRange.da, periodoRange.a)
        ]);

        var ultimoSaldo = results[0];
        var cassaOggi = results[1];
        var movimenti = results[2];
        var ricorrenti = results[3];
        var programmati = results[4];
        var cassePeriodo = results[5];
        var spesePeriodo = results[6];
        var creditiPeriodo = results[7];

        // KPI
        var saldoBanca = ultimoSaldo ? Number(ultimoSaldo.saldo_progressivo || 0) : 0;
        var cassaContanti = cassaOggi ? Number(cassaOggi.totale_contanti || 0) - Number(cassaOggi.totale_spese || 0) : 0;
        var liquiditaTotale = saldoBanca + cassaContanti;

        // Conta scadenze prossime 7gg
        var scadenzeCount = _contaScadenzeProssime(ricorrenti, programmati, 7);

        // Costruisci castelletto
        var flussi = _buildFlussi(movimenti, cassePeriodo, spesePeriodo, creditiPeriodo, ricorrenti, programmati, periodoRange);

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
                _renderKpiCard('Saldo Banca', saldoBanca, ultimoSaldo ? ultimoSaldo.banca.toUpperCase() : '-', 'info') +
                _renderKpiCard('Cassa Contanti', cassaContanti, 'Oggi', 'success') +
                _renderKpiCard('Liquidit\u00e0 Totale', liquiditaTotale, 'Banca + Cassa', liquiditaTotale >= 0 ? 'success' : 'danger') +
                _renderKpiCard('Scadenze 7gg', null, scadenzeCount + ' pagament' + (scadenzeCount === 1 ? 'o' : 'i'), scadenzeCount > 0 ? 'warning' : 'success', scadenzeCount) +
            '</div>' +

            // Castelletto
            '<div class="cassa-section">' +
                '<div class="cassa-section-title">\u{1F4CA} Castelletto - Flusso di Cassa</div>' +
                _renderCastellettoTable(flussi) +
            '</div>' +

            // Previsione
            '<div class="cassa-section">' +
                '<div class="cassa-section-title">\u{1F52E} Previsione Cash Flow</div>' +
                _renderPrevisione(saldoBanca, ricorrenti, programmati, cassePeriodo) +
            '</div>' +

            // Prossime scadenze
            '<div class="cassa-section">' +
                '<div class="cassa-section-title">\u23F0 Prossime Scadenze (30 giorni)</div>' +
                _renderProssimeScadenze(ricorrenti, programmati) +
            '</div>';

        // Event listeners
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
            return '<div class="empty-state"><p class="empty-state-text">Nessun movimento nel periodo selezionato</p></div>';
        }

        var html = '<div class="table-responsive"><table class="table">' +
            '<thead><tr>' +
                '<th>Data</th><th>Descrizione</th><th>Fonte</th>' +
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
                '<td><span class="badge badge-sm tesoreria-badge-' + f.fonte + '">' + _fonteLabelMap(f.fonte) + '</span></td>' +
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

    function _renderPrevisione(saldoAttuale, ricorrenti, programmati, cassePeriodo) {
        // Calcola media incassi giornalieri dagli ultimi dati cassa
        var mediaGiornaliera = 0;
        if (cassePeriodo && cassePeriodo.length > 0) {
            var totIncassi = cassePeriodo.reduce(function(s, c) { return s + Number(c.totale_incassato || 0); }, 0);
            mediaGiornaliera = totIncassi / cassePeriodo.length;
        }

        var oggi = new Date();
        var previsioni = [];

        for (var m = 0; m < 3; m++) {
            var meseTarget = new Date(oggi.getFullYear(), oggi.getMonth() + m + 1, 0);
            var giorniNelMese = meseTarget.getDate();
            var giorniRimanenti = m === 0 ? giorniNelMese - oggi.getDate() : giorniNelMese;

            var entratePreviste = mediaGiornaliera * giorniRimanenti;
            var uscitePreviste = 0;

            // Aggiungi ricorrenti
            ricorrenti.forEach(function(r) {
                if (r.tipo === 'uscita' && _ricorrenteCadeInMese(r, meseTarget.getMonth() + 1, meseTarget.getFullYear())) {
                    uscitePreviste += Number(r.importo);
                } else if (r.tipo === 'entrata' && _ricorrenteCadeInMese(r, meseTarget.getMonth() + 1, meseTarget.getFullYear())) {
                    entratePreviste += Number(r.importo);
                }
            });

            // Aggiungi programmati
            programmati.forEach(function(p) {
                var scadenza = new Date(p.data_scadenza);
                if (scadenza.getMonth() === meseTarget.getMonth() && scadenza.getFullYear() === meseTarget.getFullYear()) {
                    if (p.tipo === 'uscita') uscitePreviste += Number(p.importo);
                    else entratePreviste += Number(p.importo);
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

        if (mediaGiornaliera > 0) {
            html += '<div class="text-sm text-muted" style="margin-top:var(--space-2);">' +
                'Media incassi giornalieri: ' + ENI.UI.formatValuta(mediaGiornaliera) +
                ' (basata su ' + cassePeriodo.length + ' giorni di dati)</div>';
        }

        return html;
    }

    function _renderProssimeScadenze(ricorrenti, programmati) {
        var scadenze = [];
        var oggi = new Date();
        var limite = new Date();
        limite.setDate(limite.getDate() + 30);

        // Programmati
        programmati.forEach(function(p) {
            var scad = new Date(p.data_scadenza);
            if (scad >= oggi && scad <= limite) {
                scadenze.push({
                    data: p.data_scadenza,
                    descrizione: p.descrizione,
                    importo: Number(p.importo),
                    tipo: p.tipo,
                    fonte: 'programmato'
                });
            }
        });

        // Ricorrenti: genera date per il prossimo mese
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

        scadenze.sort(function(a, b) { return a.data.localeCompare(b.data); });

        if (scadenze.length === 0) {
            return '<div class="empty-state"><p class="empty-state-text">Nessuna scadenza nei prossimi 30 giorni</p></div>';
        }

        var html = '<div class="tesoreria-scadenze-list">';
        scadenze.forEach(function(s) {
            var badgeClass = s.tipo === 'uscita' ? 'badge-danger' : 'badge-success';
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
                    '<span class="badge badge-outline">' + s.fonte + '</span>' +
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
        // Navigazione periodo
        var prevBtn = document.getElementById('teso-prev');
        var nextBtn = document.getElementById('teso-next');
        if (prevBtn) prevBtn.addEventListener('click', function() { _navigaPeriodo(-1); });
        if (nextBtn) nextBtn.addEventListener('click', function() { _navigaPeriodo(1); });

        // Toggle periodo
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
    // TAB: MOVIMENTI BANCA
    // ============================================================

    async function _renderMovimenti(content) {
        _movimentiBanca = await ENI.API.getMovimentiBanca({
            banca: _bancaFiltro || undefined,
            da: _movimentiDa || undefined,
            a: _movimentiA || undefined,
            asc: false,
            limit: 200
        });

        var puoScrivere = ENI.State.canWrite('tesoreria');
        var oggi = ENI.UI.oggiISO();

        content.innerHTML =
            // Import zone
            (puoScrivere ? _renderImportZone() : '') +

            // Filtri
            '<div class="cassa-section">' +
                '<div class="cassa-section-title">\u{1F50D} Filtri</div>' +
                '<div style="display:flex; gap:var(--space-3); flex-wrap:wrap; align-items:end;">' +
                    '<div><label class="form-label">Banca</label>' +
                        '<select class="form-select" id="filtro-banca">' +
                            '<option value="">Tutte</option>' +
                            '<option value="carisp"' + (_bancaFiltro === 'carisp' ? ' selected' : '') + '>Carisp</option>' +
                            '<option value="bsi"' + (_bancaFiltro === 'bsi' ? ' selected' : '') + '>BSI</option>' +
                        '</select>' +
                    '</div>' +
                    '<div><label class="form-label">Da</label>' +
                        '<input type="date" class="form-input" id="filtro-mov-da" value="' + _movimentiDa + '">' +
                    '</div>' +
                    '<div><label class="form-label">A</label>' +
                        '<input type="date" class="form-input" id="filtro-mov-a" value="' + _movimentiA + '" max="' + oggi + '">' +
                    '</div>' +
                    '<button class="btn btn-primary btn-sm" id="btn-filtra-mov">Filtra</button>' +
                    '<button class="btn btn-outline btn-sm" id="btn-reset-mov">Reset</button>' +
                '</div>' +
            '</div>' +

            // Lista movimenti
            '<div class="cassa-section">' +
                '<div class="cassa-section-title">\u{1F4CB} Movimenti (' + _movimentiBanca.length + ')</div>' +
                _renderMovimentiTable() +
            '</div>';

        _setupMovimentiListeners();
    }

    function _renderImportZone() {
        return '<div class="cassa-section tesoreria-import-zone" id="import-zone">' +
            '<div class="cassa-section-title">\u{1F4E5} Importa Estratto Conto</div>' +
            '<div class="tesoreria-import-content">' +
                '<div style="display:flex; gap:var(--space-3); align-items:end; flex-wrap:wrap;">' +
                    '<div><label class="form-label">Banca</label>' +
                        '<select class="form-select" id="import-banca">' +
                            '<option value="carisp">Cassa di Risparmio</option>' +
                            '<option value="bsi">BSI</option>' +
                        '</select>' +
                    '</div>' +
                    '<div>' +
                        '<label class="form-label">File CSV o Excel</label>' +
                        '<input type="file" class="form-input" id="import-file" accept=".csv,.xlsx,.xls">' +
                    '</div>' +
                    '<button class="btn btn-primary" id="btn-import" disabled>Importa</button>' +
                '</div>' +
                '<div id="import-preview" style="margin-top:var(--space-3);"></div>' +
                '<div id="import-result" style="margin-top:var(--space-3);"></div>' +
            '</div>' +
        '</div>';
    }

    function _renderMovimentiTable() {
        if (_movimentiBanca.length === 0) {
            return '<div class="empty-state"><p class="empty-state-text">Nessun movimento trovato</p></div>';
        }

        var html = '<div class="table-responsive"><table class="table">' +
            '<thead><tr>' +
                '<th>Data Op.</th><th>Data Val.</th><th>Descrizione</th><th>Banca</th>' +
                '<th>Categoria</th>' +
                '<th style="text-align:right;">Importo</th>' +
                '<th style="text-align:right;">Saldo</th>' +
            '</tr></thead><tbody>';

        _movimentiBanca.forEach(function(m) {
            var importoClass = Number(m.importo) >= 0 ? 'text-success' : 'text-danger';
            html += '<tr>' +
                '<td>' + ENI.UI.formatData(m.data_operazione) + '</td>' +
                '<td>' + (m.data_valuta ? ENI.UI.formatData(m.data_valuta) : '-') + '</td>' +
                '<td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;">' + ENI.UI.escapeHtml(m.descrizione) + '</td>' +
                '<td><span class="badge badge-sm">' + m.banca.toUpperCase() + '</span></td>' +
                '<td>' + (m.categoria ? '<span class="badge badge-outline badge-sm">' + ENI.UI.escapeHtml(m.categoria) + '</span>' : '-') + '</td>' +
                '<td style="text-align:right;font-weight:600;" class="' + importoClass + '">' + ENI.UI.formatValuta(m.importo) + '</td>' +
                '<td style="text-align:right;">' + (m.saldo_progressivo != null ? ENI.UI.formatValuta(m.saldo_progressivo) : '-') + '</td>' +
            '</tr>';
        });

        html += '</tbody></table></div>';
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

        // File import
        var fileInput = document.getElementById('import-file');
        var btnImport = document.getElementById('btn-import');

        if (fileInput) {
            fileInput.addEventListener('change', function() {
                if (fileInput.files.length > 0) {
                    btnImport.disabled = false;
                    _previewFile(fileInput.files[0]);
                } else {
                    btnImport.disabled = true;
                }
            });
        }

        if (btnImport) {
            btnImport.addEventListener('click', function() {
                var file = fileInput.files[0];
                if (!file) return;
                var banca = document.getElementById('import-banca').value;
                _importFile(file, banca);
            });
        }
    }

    // --- Import CSV/Excel ---

    async function _previewFile(file) {
        var previewEl = document.getElementById('import-preview');
        if (!previewEl) return;
        previewEl.innerHTML = '<div class="spinner"></div>';

        try {
            var movimenti = await _parseFile(file);
            if (movimenti.length === 0) {
                previewEl.innerHTML = '<div class="text-warning">Nessun movimento trovato nel file</div>';
                return;
            }

            var html = '<div class="text-sm text-muted">Anteprima: ' + movimenti.length + ' movimenti trovati (primi 5)</div>' +
                '<div class="table-responsive"><table class="table table-sm">' +
                '<thead><tr><th>Data</th><th>Descrizione</th><th>Importo</th><th>Saldo</th></tr></thead><tbody>';

            movimenti.slice(0, 5).forEach(function(m) {
                html += '<tr>' +
                    '<td>' + ENI.UI.escapeHtml(m.data_operazione) + '</td>' +
                    '<td>' + ENI.UI.escapeHtml(m.descrizione || '') + '</td>' +
                    '<td class="' + (Number(m.importo) >= 0 ? 'text-success' : 'text-danger') + '">' + ENI.UI.formatValuta(m.importo) + '</td>' +
                    '<td>' + (m.saldo_progressivo != null ? ENI.UI.formatValuta(m.saldo_progressivo) : '-') + '</td>' +
                '</tr>';
            });

            html += '</tbody></table></div>';
            if (movimenti.length > 5) {
                html += '<div class="text-sm text-muted">... e altri ' + (movimenti.length - 5) + ' movimenti</div>';
            }

            previewEl.innerHTML = html;
        } catch(e) {
            previewEl.innerHTML = '<div class="text-danger">Errore lettura file: ' + ENI.UI.escapeHtml(e.message) + '</div>';
        }
    }

    async function _importFile(file, banca) {
        var resultEl = document.getElementById('import-result');
        var btnImport = document.getElementById('btn-import');
        if (!resultEl) return;

        resultEl.innerHTML = '<div class="flex items-center gap-2"><div class="spinner"></div> Importazione in corso...</div>';
        if (btnImport) btnImport.disabled = true;

        try {
            var movimenti = await _parseFile(file);
            if (movimenti.length === 0) {
                resultEl.innerHTML = '<div class="text-warning">Nessun movimento trovato nel file</div>';
                return;
            }

            // Genera hash e aggiungi metadati
            var dateRange = _getDateRange(movimenti);
            movimenti.forEach(function(m) {
                m.banca = banca;
                m.file_origine = file.name;
                m.hash_movimento = _generateHash(m.data_operazione, m.data_valuta, m.importo, m.descrizione);
            });

            // Deduplicazione
            var hashEsistenti = await ENI.API.getHashMovimentiEsistenti(dateRange.min, dateRange.max);
            var hashSet = {};
            hashEsistenti.forEach(function(h) { hashSet[h] = true; });

            var nuovi = movimenti.filter(function(m) { return !hashSet[m.hash_movimento]; });

            // Rimuovi duplicati interni al file (stesso hash)
            var hashVisti = {};
            nuovi = nuovi.filter(function(m) {
                if (hashVisti[m.hash_movimento]) return false;
                hashVisti[m.hash_movimento] = true;
                return true;
            });

            if (nuovi.length === 0) {
                resultEl.innerHTML = '<div class="tesoreria-import-result tesoreria-import-info">' +
                    '<strong>Nessun nuovo movimento.</strong> Tutti i ' + movimenti.length + ' movimenti erano gi\u00e0 presenti nel database.' +
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

            // Ricarica lista
            setTimeout(function() { _loadTab(); }, 1500);

        } catch(e) {
            resultEl.innerHTML = '<div class="tesoreria-import-result tesoreria-import-error">' +
                '<strong>Errore importazione:</strong> ' + ENI.UI.escapeHtml(e.message) +
            '</div>';
            console.error('Import error:', e);
        } finally {
            if (btnImport) btnImport.disabled = false;
        }
    }

    async function _parseFile(file) {
        var ext = file.name.split('.').pop().toLowerCase();
        if (ext === 'csv') {
            return await _parseCSV(file);
        } else if (ext === 'xlsx' || ext === 'xls') {
            return await _parseExcel(file);
        }
        throw new Error('Formato file non supportato. Usa CSV o Excel (.xlsx/.xls)');
    }

    function _parseCSV(file) {
        return new Promise(function(resolve, reject) {
            Papa.parse(file, {
                header: true,
                skipEmptyLines: true,
                encoding: 'UTF-8',
                complete: function(results) {
                    if (results.errors.length > 0 && results.data.length === 0) {
                        reject(new Error('Errore parsing CSV: ' + results.errors[0].message));
                        return;
                    }
                    try {
                        var movimenti = _mapCSVRows(results.data, results.meta.fields);
                        resolve(movimenti);
                    } catch(e) {
                        reject(e);
                    }
                },
                error: function(err) {
                    reject(new Error('Errore lettura CSV: ' + err.message));
                }
            });
        });
    }

    function _parseExcel(file) {
        return new Promise(function(resolve, reject) {
            var reader = new FileReader();
            reader.onload = function(e) {
                try {
                    var wb = XLSX.read(e.target.result, { type: 'array', cellDates: true });
                    var ws = wb.Sheets[wb.SheetNames[0]];
                    var data = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, dateNF: 'yyyy-mm-dd' });

                    if (data.length < 2) {
                        resolve([]);
                        return;
                    }

                    // Prima riga = header
                    var headers = data[0].map(function(h) { return String(h || '').trim(); });
                    var rows = data.slice(1).filter(function(r) { return r.some(function(c) { return c != null && c !== ''; }); });

                    var objects = rows.map(function(row) {
                        var obj = {};
                        headers.forEach(function(h, i) { obj[h] = row[i] != null ? String(row[i]).trim() : ''; });
                        return obj;
                    });

                    var movimenti = _mapCSVRows(objects, headers);
                    resolve(movimenti);
                } catch(err) {
                    reject(new Error('Errore parsing Excel: ' + err.message));
                }
            };
            reader.onerror = function() { reject(new Error('Errore lettura file')); };
            reader.readAsArrayBuffer(file);
        });
    }

    function _mapCSVRows(rows, fields) {
        // Auto-detect column mapping
        var mapping = _detectColumnMapping(fields);

        if (!mapping.data_operazione || !mapping.importo) {
            throw new Error('Impossibile rilevare le colonne del file. Assicurati che il file contenga almeno colonne per Data e Importo.');
        }

        var movimenti = [];
        rows.forEach(function(row) {
            var dataOp = _parseDataItaliana(row[mapping.data_operazione]);
            if (!dataOp) return; // Skip righe senza data valida

            var importo = _parseImporto(row, mapping);
            if (importo === null || isNaN(importo)) return;

            var mov = {
                data_operazione: dataOp,
                data_valuta: mapping.data_valuta ? _parseDataItaliana(row[mapping.data_valuta]) : dataOp,
                descrizione: (row[mapping.descrizione] || '').trim(),
                importo: importo,
                saldo_progressivo: mapping.saldo ? _parseNumero(row[mapping.saldo]) : null
            };

            if (mov.descrizione) movimenti.push(mov);
        });

        return movimenti;
    }

    function _detectColumnMapping(fields) {
        var mapping = {};
        var fieldsLower = fields.map(function(f) { return (f || '').toLowerCase().trim(); });

        // Data operazione
        var dataPatterns = ['data operazione', 'data op', 'data op.', 'data', 'date', 'data_operazione', 'data contabile'];
        dataPatterns.some(function(p) {
            var idx = fieldsLower.indexOf(p);
            if (idx !== -1) { mapping.data_operazione = fields[idx]; return true; }
            return false;
        });

        // Data valuta
        var valutaPatterns = ['data valuta', 'data val', 'data val.', 'valuta', 'data_valuta'];
        valutaPatterns.some(function(p) {
            var idx = fieldsLower.indexOf(p);
            if (idx !== -1) { mapping.data_valuta = fields[idx]; return true; }
            return false;
        });

        // Descrizione
        var descPatterns = ['descrizione', 'causale', 'description', 'dettagli', 'descrizione operazione', 'motivo'];
        descPatterns.some(function(p) {
            var idx = fieldsLower.indexOf(p);
            if (idx !== -1) { mapping.descrizione = fields[idx]; return true; }
            return false;
        });

        // Importo (singolo o dare/avere separati)
        var importoPatterns = ['importo', 'amount', 'importo eur', 'importo euro'];
        var darePatterns = ['dare', 'addebito', 'addebiti', 'debit', 'uscite', 'uscita'];
        var averePatterns = ['avere', 'accredito', 'accrediti', 'credit', 'entrate', 'entrata'];

        importoPatterns.some(function(p) {
            var idx = fieldsLower.indexOf(p);
            if (idx !== -1) { mapping.importo = fields[idx]; return true; }
            return false;
        });

        if (!mapping.importo) {
            // Prova dare/avere separati
            darePatterns.some(function(p) {
                var idx = fieldsLower.indexOf(p);
                if (idx !== -1) { mapping.dare = fields[idx]; return true; }
                return false;
            });
            averePatterns.some(function(p) {
                var idx = fieldsLower.indexOf(p);
                if (idx !== -1) { mapping.avere = fields[idx]; return true; }
                return false;
            });
            if (mapping.dare || mapping.avere) {
                mapping.importo = '__dare_avere__';
            }
        }

        // Saldo
        var saldoPatterns = ['saldo', 'saldo contabile', 'saldo disponibile', 'balance', 'saldo progressivo'];
        saldoPatterns.some(function(p) {
            var idx = fieldsLower.indexOf(p);
            if (idx !== -1) { mapping.saldo = fields[idx]; return true; }
            return false;
        });

        return mapping;
    }

    function _parseImporto(row, mapping) {
        if (mapping.importo === '__dare_avere__') {
            var dare = mapping.dare ? _parseNumero(row[mapping.dare]) : 0;
            var avere = mapping.avere ? _parseNumero(row[mapping.avere]) : 0;
            if (dare && dare > 0) return -dare;
            if (avere && avere > 0) return avere;
            return dare || avere || 0;
        }
        return _parseNumero(row[mapping.importo]);
    }

    function _parseNumero(val) {
        if (val == null || val === '') return null;
        var s = String(val).trim();
        // Rimuovi simbolo valuta
        s = s.replace(/[€\s]/g, '');
        // Formato italiano: 1.234,56 -> 1234.56
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

        // Formato ISO: 2024-01-15
        if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
            return s.substring(0, 10);
        }

        // Formato italiano: 15/01/2024 o 15-01-2024
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
        // Simple hash: concatenation + basic hashing
        var str = (dataOp || '') + '|' + (dataVal || '') + '|' + String(importo || 0) + '|' + (descrizione || '').trim().toLowerCase();
        var hash = 0;
        for (var i = 0; i < str.length; i++) {
            var char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit int
        }
        // Usa anche una parte della stringa per ridurre collisioni
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

        // Setup action listeners after a tick
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
                ENI.UI.showModal(
                    'Elimina Pagamento',
                    '<p>Eliminare il pagamento ricorrente <strong>' + ENI.UI.escapeHtml(p.descrizione) + '</strong>?</p>',
                    async function() {
                        try {
                            await ENI.API.eliminaPagamentoRicorrente(id, p.descrizione);
                            ENI.UI.closeModal();
                            ENI.UI.success('Pagamento eliminato');
                            _loadTab();
                        } catch(e) {
                            ENI.UI.error('Errore: ' + e.message);
                        }
                    },
                    'Elimina'
                );
            });
        });
    }

    function _showRicorrenteForm(existing) {
        var isEdit = !!existing;
        var catOptions = _categorie
            .filter(function(c) { return c.tipo !== 'entrambi' || true; })
            .map(function(c) {
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

        ENI.UI.showModal(
            isEdit ? 'Modifica Pagamento Ricorrente' : 'Nuovo Pagamento Ricorrente',
            html,
            async function() {
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
                    ENI.UI.closeModal();
                    _loadTab();
                } catch(e) {
                    ENI.UI.error('Errore: ' + e.message);
                }
            },
            isEdit ? 'Salva' : 'Crea'
        );
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
                } catch(e) {
                    ENI.UI.error('Errore: ' + e.message);
                }
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
                } catch(e) {
                    ENI.UI.error('Errore: ' + e.message);
                }
            });
        });

        document.querySelectorAll('[data-del-prog]').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var id = btn.dataset.delProg;
                var p = _pagamentiProgrammati.find(function(r) { return r.id === id; });
                if (!p) return;
                ENI.UI.showModal(
                    'Elimina Pagamento',
                    '<p>Eliminare il pagamento <strong>' + ENI.UI.escapeHtml(p.descrizione) + '</strong>?</p>',
                    async function() {
                        try {
                            await ENI.API.remove('pagamenti_programmati', id);
                            await ENI.API.scriviLog('Eliminato_Pagamento_Programmato', 'Tesoreria', p.descrizione);
                            ENI.UI.closeModal();
                            ENI.UI.success('Pagamento eliminato');
                            _loadTab();
                        } catch(e) {
                            ENI.UI.error('Errore: ' + e.message);
                        }
                    },
                    'Elimina'
                );
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

        ENI.UI.showModal(
            isEdit ? 'Modifica Pagamento' : 'Nuovo Pagamento Programmato',
            html,
            async function() {
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
                    ENI.UI.closeModal();
                    _loadTab();
                } catch(e) {
                    ENI.UI.error('Errore: ' + e.message);
                }
            },
            isEdit ? 'Salva' : 'Crea'
        );
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
                ENI.UI.showModal(
                    'Elimina Categoria',
                    '<p>Eliminare la categoria <strong>' + ENI.UI.escapeHtml(c.nome) + '</strong>?</p>',
                    async function() {
                        try {
                            await ENI.API.eliminaCategoriaTesoreria(id, c.nome);
                            ENI.UI.closeModal();
                            ENI.UI.success('Categoria eliminata');
                            _loadTab();
                        } catch(e) {
                            ENI.UI.error('Errore: ' + e.message);
                        }
                    },
                    'Elimina'
                );
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

        ENI.UI.showModal(
            isEdit ? 'Modifica Categoria' : 'Nuova Categoria',
            html,
            async function() {
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
                    ENI.UI.closeModal();
                    _loadTab();
                } catch(e) {
                    ENI.UI.error('Errore: ' + e.message);
                }
            },
            isEdit ? 'Salva' : 'Crea'
        );
    }

    // ============================================================
    // HELPER: Cash Flow Calculation
    // ============================================================

    function _buildFlussi(movimentiBanca, cassePeriodo, spesePeriodo, creditiPeriodo, ricorrenti, programmati, periodoRange) {
        var flussi = [];

        // 1. Movimenti banca
        movimentiBanca.forEach(function(m) {
            flussi.push({
                data: m.data_operazione,
                descrizione: m.descrizione,
                importo: Number(m.importo),
                fonte: 'banca'
            });
        });

        // 2. Corrispettivi giornalieri (cassa)
        if (cassePeriodo) {
            cassePeriodo.forEach(function(c) {
                var totIncassato = Number(c.totale_incassato || 0);
                if (totIncassato > 0) {
                    flussi.push({
                        data: c.data,
                        descrizione: 'Corrispettivi giornalieri',
                        importo: totIncassato,
                        fonte: 'cassa'
                    });
                }
            });
        }

        // 3. Spese cassa
        if (spesePeriodo) {
            spesePeriodo.forEach(function(s) {
                flussi.push({
                    data: s.data,
                    descrizione: 'Spesa: ' + (s.descrizione || 'Spese cassa'),
                    importo: -Math.abs(Number(s.importo || 0)),
                    fonte: 'spese'
                });
            });
        }

        // 4. Crediti incassati
        if (creditiPeriodo) {
            creditiPeriodo.forEach(function(c) {
                flussi.push({
                    data: c.data_incasso,
                    descrizione: 'Incasso credito: ' + (c.nome_cliente || c.codice),
                    importo: Number(c.importo),
                    fonte: 'crediti'
                });
            });
        }

        // Ordina per data
        flussi.sort(function(a, b) { return a.data.localeCompare(b.data); });

        // Calcola saldo progressivo (castelletto)
        var saldo = 0;
        flussi.forEach(function(f) {
            saldo += f.importo;
            f.saldo = saldo;
        });

        return flussi;
    }

    async function _getCassaPeriodo(da, a) {
        try {
            var result = await ENI.API.getClient()
                .from('cassa')
                .select('data, totale_incassato, totale_venduto, totale_contanti, totale_spese')
                .gte('data', da)
                .lte('data', a)
                .order('data', { ascending: true });
            if (result.error) throw new Error(result.error.message);
            return result.data || [];
        } catch(e) {
            return [];
        }
    }

    async function _getSpesePeriodo(da, a) {
        try {
            var result = await ENI.API.getClient()
                .from('spese_cassa')
                .select('data, descrizione, importo, categoria')
                .gte('data', da)
                .lte('data', a)
                .order('data', { ascending: true });
            if (result.error) throw new Error(result.error.message);
            return result.data || [];
        } catch(e) {
            return [];
        }
    }

    async function _getCreditiIncassatiPeriodo(da, a) {
        try {
            var result = await ENI.API.getClient()
                .from('crediti')
                .select('codice, nome_cliente, importo, data_incasso')
                .eq('stato', 'Incassato')
                .gte('data_incasso', da)
                .lte('data_incasso', a)
                .order('data_incasso', { ascending: true });
            if (result.error) throw new Error(result.error.message);
            return result.data || [];
        } catch(e) {
            return [];
        }
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
        var map = { banca: 'Banca', cassa: 'Cassa', spese: 'Spese', crediti: 'Crediti', ricorrente: 'Ricorrente', programmato: 'Programmato' };
        return map[fonte] || fonte;
    }

    function _ricorrenteCadeInMese(ricorrente, mese, anno) {
        if (ricorrente.frequenza === 'mensile') return true;

        if (ricorrente.mese_riferimento && ricorrente.mese_riferimento.length > 0) {
            return ricorrente.mese_riferimento.indexOf(mese) !== -1;
        }

        // Default: trimestrale = ogni 3 mesi da data_inizio
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
        current.setDate(1); // Inizio dal primo del mese corrente

        while (current <= a) {
            var mese = current.getMonth() + 1;
            var anno = current.getFullYear();

            if (_ricorrenteCadeInMese(ricorrente, mese, anno)) {
                var giorno = Math.min(ricorrente.giorno_scadenza, new Date(anno, mese, 0).getDate());
                var dataScad = anno + '-' + String(mese).padStart(2, '0') + '-' + String(giorno).padStart(2, '0');

                if (dataScad >= da.toISOString().split('T')[0] && dataScad <= a.toISOString().split('T')[0]) {
                    // Verifica anche data_inizio e data_fine
                    if (dataScad >= ricorrente.data_inizio && (!ricorrente.data_fine || dataScad <= ricorrente.data_fine)) {
                        date.push(dataScad);
                    }
                }
            }

            current.setMonth(current.getMonth() + 1);
        }

        return date;
    }

    function _contaScadenzeProssime(ricorrenti, programmati, giorni) {
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

        return count;
    }

    // ============================================================
    // CHECK SCADENZE (per alert badge)
    // ============================================================

    async function checkScadenze() {
        try {
            var data = await ENI.API.getScadenzeTesoreria(7);
            var count = 0;

            // Programmati
            count += data.programmati.length;

            // Ricorrenti: calcola quanti cadono nei prossimi 7 giorni
            var oggi = new Date();
            var limite = new Date();
            limite.setDate(limite.getDate() + 7);

            data.ricorrenti.forEach(function(r) {
                var date = _getProssimeDateRicorrente(r, oggi, limite);
                count += date.length;
            });

            return count;
        } catch(e) {
            return 0;
        }
    }

    // API pubblica
    return {
        render: render,
        checkScadenze: checkScadenze
    };
})();
