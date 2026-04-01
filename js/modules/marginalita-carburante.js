// ============================================================
// TITANWASH - Gestionale Carburanti v2
// Dashboard + Vendite + Carichi + Prezzi + Report + Conguagli + Setup
// ============================================================

var ENI = ENI || {};
ENI.Modules = ENI.Modules || {};

ENI.Modules.MarginalitaCarburante = (function() {
    'use strict';

    // Tabelle
    var T = {
        PRODOTTI: 'prodotti_carburante',
        ACCISE: 'accise_storico',
        GIACENZE: 'giacenze_iniziali',
        CARICHI: 'carichi_carburante',
        PREZZI: 'prezzi_pompa',
        VENDITE: 'vendite_giornaliere',
        VENDITE_PROD: 'vendite_per_prodotto',
        CONGUAGLI: 'conguagli_eni',
        RIMBORSI: 'rimborsi_stato',
        CONFIG: 'config_carburanti',
        CHIUSURE: 'chiusure_mensili_carburante'
    };

    var MESI = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
                'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];

    // Stato modulo
    var _container = null;
    var _activeTab = 'vendite';
    var _prodotti = [];
    var _config = {};
    var _statoProdotti = {}; // id -> { giacenza, costo_medio, ... }

    // ============================================================
    // RENDER PRINCIPALE
    // ============================================================

    async function render(container) {
        _container = container;
        container.style.maxWidth = 'none';

        container.innerHTML = '<div class="flex justify-center" style="padding:2rem;"><div class="spinner"></div></div>';

        try {
            await _loadBase();
            await _ricalcolaStato();
            _renderPage();
        } catch(e) {
            container.innerHTML = '<div class="empty-state"><p class="empty-state-text">Errore: ' + ENI.UI.escapeHtml(e.message) + '</p></div>';
            console.error('MargCarburante init error:', e);
        }
    }

    // ============================================================
    // CARICAMENTO DATI BASE
    // ============================================================

    async function _loadBase() {
        _prodotti = await ENI.API.getAll(T.PRODOTTI, {
            filters: [{ op: 'eq', col: 'attivo', val: true }],
            order: { col: 'ordine', asc: true }
        }) || [];

        var configRows = await ENI.API.getAll(T.CONFIG) || [];
        _config = {};
        configRows.forEach(function(r) { _config[r.chiave] = r.valore; });
    }

    // ============================================================
    // RICALCOLA STATO PRODOTTI (motore costo medio ponderato)
    // ============================================================

    async function _ricalcolaStato() {
        _statoProdotti = {};

        for (var i = 0; i < _prodotti.length; i++) {
            var prod = _prodotti[i];

            // Cerca ultima chiusura per questo prodotto
            var ultimaChiusura = await ENI.API.getAll(T.CHIUSURE, {
                filters: [{ op: 'eq', col: 'prodotto_id', val: prod.id }],
                order: { col: 'anno', asc: false },
                limit: 10
            }) || [];
            // Ordina per anno+mese desc e prendi la prima
            ultimaChiusura.sort(function(a, b) {
                var va = a.anno * 100 + a.mese;
                var vb = b.anno * 100 + b.mese;
                return vb - va;
            });
            var chiusura = ultimaChiusura.length > 0 ? ultimaChiusura[0] : null;

            var giacIniz, costoIniz, dataFiltro;

            if (chiusura) {
                // Riparti dall'ultima chiusura
                giacIniz = parseFloat(chiusura.giacenza_reale) || 0;
                costoIniz = parseFloat(chiusura.costo_medio) || 0;
                // Calcola primo giorno del mese DOPO la chiusura
                var meseSucc = chiusura.mese + 1, annoSucc = chiusura.anno;
                if (meseSucc > 12) { meseSucc = 1; annoSucc++; }
                dataFiltro = annoSucc + '-' + String(meseSucc).padStart(2, '0') + '-01';
            } else {
                // Nessuna chiusura: comportamento originale
                var giacenze = await ENI.API.getAll(T.GIACENZE, {
                    filters: [{ op: 'eq', col: 'prodotto_id', val: prod.id }],
                    limit: 1
                });
                var g = giacenze && giacenze.length > 0 ? giacenze[0] : null;
                giacIniz = g ? parseFloat(g.litri_fisici) || 0 : 0;
                costoIniz = g ? parseFloat(g.costo_medio) || 0 : 0;
                dataFiltro = null; // carica tutto
            }

            // Carica eventi (tutti o solo dal mese dopo la chiusura)
            var carichiFilters = [{ op: 'eq', col: 'prodotto_id', val: prod.id }];
            var conguagliFilters = [{ op: 'eq', col: 'prodotto_id', val: prod.id }];
            if (dataFiltro) {
                carichiFilters.push({ op: 'gte', col: 'data', val: dataFiltro });
                conguagliFilters.push({ op: 'gte', col: 'data', val: dataFiltro });
            }

            var carichi = await ENI.API.getAll(T.CARICHI, {
                filters: carichiFilters,
                order: { col: 'data', asc: true }
            }) || [];

            var venditeProd = await ENI.API.getAll(T.VENDITE_PROD, {
                filters: [{ op: 'eq', col: 'prodotto_id', val: prod.id }]
            }) || [];

            // Per le vendite servono le date dalla tabella vendite_giornaliere
            var venditeConDate = [];
            for (var v = 0; v < venditeProd.length; v++) {
                var vp = venditeProd[v];
                try {
                    var vendita = await ENI.API.getById(T.VENDITE, vp.vendita_id);
                    // Filtra per data se c'è una chiusura
                    if (dataFiltro && vendita.data_inizio < dataFiltro) continue;
                    venditeConDate.push({
                        tipo: 'vendita',
                        data: vendita.data_inizio,
                        litri: parseFloat(vp.litri) || 0,
                        prezzo_pompa: parseFloat(vp.prezzo_pompa) || 0
                    });
                } catch(e) { /* vendita non trovata */ }
            }

            var conguagli = await ENI.API.getAll(T.CONGUAGLI, {
                filters: conguagliFilters,
                order: { col: 'data', asc: true }
            }) || [];

            // Costruisci array eventi ordinato
            var eventi = [];
            carichi.forEach(function(c) {
                eventi.push({
                    tipo: 'carico',
                    data: c.data,
                    litri_fisici: parseFloat(c.litri_fisici) || 0,
                    litri_fiscali: parseFloat(c.litri_fiscali) || 0,
                    prezzo_mp: parseFloat(c.prezzo_mp) || 0,
                    accisa: parseFloat(c.accisa) || 0
                });
            });
            venditeConDate.forEach(function(v) { eventi.push(v); });
            conguagli.forEach(function(cg) {
                eventi.push({
                    tipo: 'conguaglio',
                    data: cg.data,
                    importo_mp: parseFloat(cg.importo_mp) || 0
                });
            });

            eventi.sort(function(a, b) { return a.data < b.data ? -1 : a.data > b.data ? 1 : 0; });

            // Calcola stato
            var stato = ENI.Calcoli.calcolaStatoProdotto(
                giacIniz, costoIniz, eventi, prod.ha_pc,
                parseFloat(_config.margine_target) || 0.05
            );

            // Prezzo pompa corrente
            var prezzi = await ENI.API.getAll(T.PREZZI, {
                filters: [{ op: 'eq', col: 'prodotto_id', val: prod.id }],
                order: { col: 'data_inizio', asc: false },
                limit: 1
            }) || [];
            stato.prezzo_pompa = prezzi.length > 0 ? parseFloat(prezzi[0].prezzo) || 0 : 0;
            stato.margine_corrente = stato.prezzo_pompa > 0 ? ENI.Calcoli.marginCorrente(stato.prezzo_pompa, stato.costo_medio) : null;

            // Rimborsi PC
            var rimborsi = await ENI.API.getAll(T.RIMBORSI, {
                filters: [{ op: 'eq', col: 'prodotto_id', val: prod.id }]
            }) || [];
            stato.pc_rimborsi = rimborsi.reduce(function(s, r) { return s + (parseFloat(r.importo) || 0); }, 0);
            stato.pc_netto = stato.pc_maturato - stato.pc_rimborsi;

            _statoProdotti[prod.id] = stato;
        }
    }

    // ============================================================
    // RENDER PAGINA
    // ============================================================

    function _renderPage() {
        var html = '';

        // Header
        html += '<div class="page-header"><h1 class="page-title">Gestionale Carburanti</h1></div>';

        // Dashboard cards prodotti
        html += _renderDashboard();

        // Tabs
        html +=
            '<div class="tabs" style="margin-bottom:var(--space-3);">' +
                _tabBtn('vendite', 'Vendite') +
                _tabBtn('carichi', 'Carichi') +
                _tabBtn('prezzi', 'Prezzi Pompa') +
                _tabBtn('report', 'Report') +
                _tabBtn('conguagli', 'Conguagli & PC') +
                _tabBtn('chiusure', 'Chiusure') +
                _tabBtn('setup', 'Setup') +
            '</div>' +
            '<div id="mc-tab-content"></div>';

        _container.innerHTML = html;

        // Tab switching
        _container.querySelectorAll('.tab-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                _activeTab = this.dataset.tab;
                _container.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
                this.classList.add('active');
                _renderTab();
            });
        });

        _renderTab();
    }

    function _tabBtn(id, label) {
        return '<button class="tab-btn' + (_activeTab === id ? ' active' : '') + '" data-tab="' + id + '">' + label + '</button>';
    }

    // ============================================================
    // DASHBOARD (sempre visibile in alto)
    // ============================================================

    function _renderDashboard() {
        if (_prodotti.length === 0) {
            return '<div class="card" style="margin-bottom:var(--space-3);"><div class="card-body"><p>Nessun prodotto configurato. Vai al tab Setup.</p></div></div>';
        }

        var margineTarget = parseFloat(_config.margine_target) || 0.05;
        var html = '<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:var(--space-3); margin-bottom:var(--space-3);">';

        _prodotti.forEach(function(prod) {
            var st = _statoProdotti[prod.id] || {};
            var margine = st.margine_corrente;
            var colore = 'var(--text-secondary)';
            var bgBorder = 'var(--color-gray-200)';

            if (margine !== null && margine !== undefined) {
                if (margine >= margineTarget) {
                    colore = 'var(--color-success)';
                    bgBorder = '#4CAF50';
                } else if (margine >= 0) {
                    colore = '#FF9800';
                    bgBorder = '#FF9800';
                } else {
                    colore = 'var(--color-danger)';
                    bgBorder = '#f44336';
                }
            }

            html +=
                '<div class="card" style="border-left:4px solid ' + bgBorder + ';">' +
                    '<div class="card-body" style="padding:var(--space-3);">' +
                        '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:var(--space-2);">' +
                            '<strong style="font-size:var(--font-size-base);">' + ENI.UI.escapeHtml(prod.nome) + '</strong>' +
                            '<span style="font-size:0.75rem; color:var(--text-secondary);">' + _fmt(st.giacenza_teorica || 0, 0) + ' lt</span>' +
                        '</div>' +
                        '<div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--space-1); font-size:0.8rem;">' +
                            '<div>Costo medio<br><strong>' + _fmtEuro5(st.costo_medio || 0) + '</strong></div>' +
                            '<div>Prezzo pompa<br><strong>' + (st.prezzo_pompa ? _fmtEuro5(st.prezzo_pompa) : 'N/D') + '</strong></div>' +
                            '<div>Margine<br><strong style="color:' + colore + ';">' + (margine !== null ? _fmtEuro4(margine) + '/lt' : 'N/D') + '</strong></div>' +
                            '<div>Consigliato<br><strong style="color:var(--color-primary);">' + _fmtEuro5(st.prezzo_consigliato || 0) + '</strong></div>' +
                        '</div>' +
                    '</div>' +
                '</div>';
        });

        html += '</div>';
        return html;
    }

    // ============================================================
    // RENDER TAB
    // ============================================================

    function _renderTab() {
        var c = document.getElementById('mc-tab-content');
        if (!c) return;

        switch(_activeTab) {
            case 'vendite': _renderVendite(c); break;
            case 'carichi': _renderCarichi(c); break;
            case 'prezzi': _renderPrezzi(c); break;
            case 'report': _renderReport(c); break;
            case 'conguagli': _renderConguagli(c); break;
            case 'chiusure': _renderChiusure(c); break;
            case 'setup': _renderSetup(c); break;
        }
    }

    // ============================================================
    // TAB: SETUP
    // ============================================================

    async function _renderSetup(container) {
        // Carica tutti i dati necessari
        var tuttiProdotti = await ENI.API.getAll(T.PRODOTTI, { order: { col: 'ordine', asc: true } }) || [];
        var accise = await ENI.API.getAll(T.ACCISE, { order: { col: 'data_inizio', asc: false } }) || [];
        var giacenze = await ENI.API.getAll(T.GIACENZE) || [];

        var html = '';

        // --- PRODOTTI ---
        html +=
            '<div class="card" style="margin-bottom:var(--space-3);">' +
                '<div class="card-body">' +
                    '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:var(--space-3);">' +
                        '<h3 style="margin:0;">Prodotti</h3>' +
                        '<button class="btn btn-primary btn-sm" id="mc-setup-add-prod">+ Nuovo Prodotto</button>' +
                    '</div>' +
                    '<table class="table cm-table-compact"><thead><tr>' +
                        '<th>ID</th><th>Nome</th><th>Attivo</th><th>Prog. Carb.</th><th></th>' +
                    '</tr></thead><tbody>';

        tuttiProdotti.forEach(function(p) {
            html += '<tr>' +
                '<td><code>' + p.id + '</code></td>' +
                '<td><strong>' + ENI.UI.escapeHtml(p.nome) + '</strong></td>' +
                '<td>' + (p.attivo ? '<span style="color:var(--color-success);">Si</span>' : 'No') + '</td>' +
                '<td>' + (p.ha_pc ? 'Si' : 'No') + '</td>' +
                '<td><button class="btn-icon mc-setup-toggle-prod" data-id="' + p.id + '" data-attivo="' + p.attivo + '" title="' + (p.attivo ? 'Disattiva' : 'Attiva') + '"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="pointer-events:none;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button></td>' +
            '</tr>';
        });
        html += '</tbody></table></div></div>';

        // --- ACCISE ---
        html +=
            '<div class="card" style="margin-bottom:var(--space-3);">' +
                '<div class="card-body">' +
                    '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:var(--space-3);">' +
                        '<h3 style="margin:0;">Storico Accise</h3>' +
                        '<button class="btn btn-primary btn-sm" id="mc-setup-add-accisa">+ Nuova Accisa</button>' +
                    '</div>' +
                    '<table class="table cm-table-compact"><thead><tr>' +
                        '<th>Prodotto</th><th class="text-right">Accisa (\u20AC/lt)</th><th>Dal</th><th>Al</th><th>Note</th><th></th>' +
                    '</tr></thead><tbody>';

        accise.forEach(function(a) {
            html += '<tr' + (a.data_fine ? ' style="opacity:0.6;"' : '') + '>' +
                '<td>' + ENI.UI.escapeHtml(a.prodotto_id) + '</td>' +
                '<td class="text-right"><strong>' + (parseFloat(a.accisa) || 0).toFixed(6) + '</strong></td>' +
                '<td>' + _fmtData(a.data_inizio) + '</td>' +
                '<td>' + (a.data_fine ? _fmtData(a.data_fine) : '<em>attiva</em>') + '</td>' +
                '<td style="font-size:0.75rem; color:var(--text-secondary);">' + (a.note || '') + '</td>' +
                '<td style="white-space:nowrap;">' +
                    '<button class="btn-icon mc-setup-edit-accisa" data-id="' + a.id + '" data-prodotto="' + a.prodotto_id + '" data-accisa="' + a.accisa + '" data-inizio="' + (a.data_inizio||'') + '" data-fine="' + (a.data_fine||'') + '" data-note="' + ENI.UI.escapeHtml(a.note||'') + '" title="Modifica"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="pointer-events:none;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>' +
                    (!a.data_fine ? '<button class="btn-icon mc-setup-chiudi-accisa" data-id="' + a.id + '" title="Chiudi"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="pointer-events:none;"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></button>' : '') +
                    '<button class="btn-icon mc-setup-del-accisa" data-id="' + a.id + '" title="Elimina" style="color:var(--color-danger);"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="pointer-events:none;"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>' +
                '</td>' +
            '</tr>';
        });
        html += '</tbody></table></div></div>';

        // --- GIACENZE INIZIALI ---
        html +=
            '<div class="card" style="margin-bottom:var(--space-3);">' +
                '<div class="card-body">' +
                    '<h3 style="margin:0 0 var(--space-3) 0;">Giacenze Iniziali</h3>' +
                    '<table class="table cm-table-compact"><thead><tr>' +
                        '<th>Prodotto</th><th class="text-right">Litri Commerciali</th><th class="text-right">Costo Medio (\u20AC/lt)</th><th>Data</th><th></th>' +
                    '</tr></thead><tbody>';

        _prodotti.forEach(function(prod) {
            var g = giacenze.find(function(x) { return x.prodotto_id === prod.id; });
            html += '<tr>' +
                '<td><strong>' + ENI.UI.escapeHtml(prod.nome) + '</strong></td>' +
                '<td class="text-right">' + (g ? _fmt(g.litri_fisici, 2) : '0') + '</td>' +
                '<td class="text-right">' + (g ? _fmtEuro5(g.costo_medio) : '0,00000') + '</td>' +
                '<td>' + (g ? _fmtData(g.data) : '-') + '</td>' +
                '<td><button class="btn-icon mc-setup-edit-giac" data-id="' + prod.id + '" title="Modifica"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="pointer-events:none;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button></td>' +
            '</tr>';
        });
        html += '</tbody></table></div></div>';

        // --- CONFIGURAZIONE ---
        html +=
            '<div class="card">' +
                '<div class="card-body">' +
                    '<h3 style="margin:0 0 var(--space-3) 0;">Configurazione</h3>' +
                    '<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:var(--space-3);">' +
                        _cfgField('Margine target (\u20AC/lt)', 'mc-cfg-margine', _config.margine_target || '0.05', 'number', '0.001') +
                        _cfgField('Aliquota monofase', 'mc-cfg-monofase', _config.aliquota_monofase || '0.21', 'number', '0.01') +
                        _cfgField('Storno PC (\u20AC/lt)', 'mc-cfg-storno', _config.storno_pc || '0.0522', 'number', '0.0001') +
                        _cfgField('Codice COE', 'mc-cfg-coe', _config.codice_coe || '', 'text') +
                        _cfgField('Ragione Sociale', 'mc-cfg-rag', _config.ragione_sociale || '', 'text') +
                        _cfgField('Email destinatario', 'mc-cfg-email-dest', _config.email_destinatario || '', 'email') +
                        _cfgField('Email mittente', 'mc-cfg-email-mitt', _config.email_mittente || '', 'email') +
                    '</div>' +
                    '<button class="btn btn-primary btn-sm" id="mc-setup-save-cfg" style="margin-top:var(--space-3);">Salva Configurazione</button>' +
                '</div>' +
            '</div>';

        container.innerHTML = html;
        _setupSetupListeners(container);
    }

    function _cfgField(label, id, value, type, step) {
        return '<div class="form-group"><label class="form-label">' + label + '</label>' +
            '<input type="' + type + '" class="form-input" id="' + id + '" value="' + ENI.UI.escapeHtml(String(value)) + '"' +
            (step ? ' step="' + step + '"' : '') + '></div>';
    }

    function _setupSetupListeners(container) {
        // Salva config
        var btnCfg = document.getElementById('mc-setup-save-cfg');
        if (btnCfg) {
            btnCfg.addEventListener('click', async function() {
                var fields = {
                    margine_target: document.getElementById('mc-cfg-margine').value,
                    aliquota_monofase: document.getElementById('mc-cfg-monofase').value,
                    storno_pc: document.getElementById('mc-cfg-storno').value,
                    codice_coe: document.getElementById('mc-cfg-coe').value,
                    ragione_sociale: document.getElementById('mc-cfg-rag').value,
                    email_destinatario: document.getElementById('mc-cfg-email-dest').value,
                    email_mittente: document.getElementById('mc-cfg-email-mitt').value
                };
                try {
                    for (var key in fields) {
                        await ENI.API.getClient().from(T.CONFIG).upsert({ chiave: key, valore: fields[key], updated_at: new Date().toISOString() });
                    }
                    _config = fields;
                    ENI.UI.success('Configurazione salvata');
                } catch(e) { ENI.UI.error('Errore: ' + e.message); }
            });
        }

        // Modifica giacenza
        container.querySelectorAll('.mc-setup-edit-giac').forEach(function(btn) {
            btn.addEventListener('click', function() { _showGiacenzaForm(btn.getAttribute('data-id')); });
        });

        // Aggiungi accisa
        var btnAccisa = document.getElementById('mc-setup-add-accisa');
        if (btnAccisa) {
            btnAccisa.addEventListener('click', _showAccisaForm);
        }

        // Chiudi accisa
        container.querySelectorAll('.mc-setup-chiudi-accisa').forEach(function(btn) {
            btn.addEventListener('click', function() { _showChiudiAccisaForm(btn.getAttribute('data-id')); });
        });

        // Modifica accisa
        container.querySelectorAll('.mc-setup-edit-accisa').forEach(function(btn) {
            btn.addEventListener('click', function() {
                _showEditAccisaForm({
                    id: btn.getAttribute('data-id'),
                    prodotto_id: btn.getAttribute('data-prodotto'),
                    accisa: btn.getAttribute('data-accisa'),
                    data_inizio: btn.getAttribute('data-inizio'),
                    data_fine: btn.getAttribute('data-fine'),
                    note: btn.getAttribute('data-note')
                });
            });
        });

        // Elimina accisa
        container.querySelectorAll('.mc-setup-del-accisa').forEach(function(btn) {
            btn.addEventListener('click', async function() {
                if (!confirm('Eliminare questa accisa dallo storico?')) return;
                try {
                    await ENI.API.remove(T.ACCISE, btn.getAttribute('data-id'));
                    _renderTab();
                    ENI.UI.success('Accisa eliminata');
                } catch(e) { ENI.UI.error('Errore: ' + e.message); }
            });
        });

        // Aggiungi prodotto
        var btnProd = document.getElementById('mc-setup-add-prod');
        if (btnProd) {
            btnProd.addEventListener('click', _showProdottoForm);
        }

        // Toggle prodotto attivo/disattivo
        container.querySelectorAll('.mc-setup-toggle-prod').forEach(function(btn) {
            btn.addEventListener('click', async function() {
                var id = btn.getAttribute('data-id');
                var attivo = btn.getAttribute('data-attivo') === 'true';
                try {
                    await ENI.API.getClient().from(T.PRODOTTI).update({ attivo: !attivo }).eq('id', id);
                    await _loadBase();
                    await _ricalcolaStato();
                    _renderPage();
                    ENI.UI.success('Prodotto ' + (!attivo ? 'attivato' : 'disattivato'));
                } catch(e) { ENI.UI.error('Errore: ' + e.message); }
            });
        });
    }

    // --- Form Giacenza ---
    function _showGiacenzaForm(prodId) {
        var prod = _prodotti.find(function(p) { return p.id === prodId; });
        var modal = _modal('mc-modal-giac', 'Giacenza Iniziale - ' + (prod ? prod.nome : prodId),
            _formField('Data', 'mc-giac-data', 'date', '2026-02-01') +
            _formField('Litri commerciali', 'mc-giac-litri', 'number', '0', '0.01') +
            _formField('Costo medio (\u20AC/lt)', 'mc-giac-costo', 'number', '0', '0.00001'),
            'mc-giac-salva', 'Salva'
        );
        _openModal(modal, 'mc-modal-giac');

        document.getElementById('mc-giac-salva').addEventListener('click', async function() {
            var data = document.getElementById('mc-giac-data').value;
            var litri = parseFloat(document.getElementById('mc-giac-litri').value) || 0;
            var costo = parseFloat(document.getElementById('mc-giac-costo').value) || 0;
            if (!data) { ENI.UI.warning('Inserisci la data'); return; }
            try {
                await ENI.API.getClient().from(T.GIACENZE).upsert({
                    prodotto_id: prodId, data: data, litri_fisici: litri, costo_medio: costo
                });
                _closeModal('mc-modal-giac');
                await _ricalcolaStato();
                _renderPage();
                ENI.UI.success('Giacenza salvata');
            } catch(e) { ENI.UI.error('Errore: ' + e.message); }
        });
    }

    // --- Form Accisa ---
    function _showAccisaForm() {
        var opts = _prodotti.map(function(p) { return '<option value="' + p.id + '">' + p.nome + '</option>'; }).join('');
        var modal = _modal('mc-modal-accisa', 'Nuova Accisa',
            '<div class="form-group"><label class="form-label">Prodotto</label><select class="form-select" id="mc-acc-prod">' + opts + '</select></div>' +
            _formField('Accisa (\u20AC/lt)', 'mc-acc-valore', 'number', '0.648700', '0.000001') +
            _formField('In vigore dal', 'mc-acc-da', 'date', '') +
            _formField('In vigore fino al (vuoto = attiva)', 'mc-acc-a', 'date', '') +
            _formField('Note', 'mc-acc-note', 'text', ''),
            'mc-acc-salva', 'Salva'
        );
        _openModal(modal, 'mc-modal-accisa');

        document.getElementById('mc-acc-salva').addEventListener('click', async function() {
            var prodId = document.getElementById('mc-acc-prod').value;
            var accisa = parseFloat(document.getElementById('mc-acc-valore').value);
            var da = document.getElementById('mc-acc-da').value;
            var a = document.getElementById('mc-acc-a').value || null;
            var note = document.getElementById('mc-acc-note').value || null;
            if (!da || !accisa) { ENI.UI.warning('Compila prodotto, accisa e data'); return; }
            try {
                // Chiudi accisa attiva dello stesso prodotto
                if (!a) {
                    var attuali = await ENI.API.getAll(T.ACCISE, {
                        filters: [{ op: 'eq', col: 'prodotto_id', val: prodId }, { op: 'is', col: 'data_fine', val: null }]
                    });
                    for (var i = 0; i < (attuali || []).length; i++) {
                        var d = new Date(da); d.setDate(d.getDate() - 1);
                        var fine = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
                        await ENI.API.update(T.ACCISE, attuali[i].id, { data_fine: fine });
                    }
                }
                await ENI.API.insert(T.ACCISE, { prodotto_id: prodId, accisa: accisa, data_inizio: da, data_fine: a, note: note });
                _closeModal('mc-modal-accisa');
                _renderTab();
                ENI.UI.success('Accisa inserita');
            } catch(e) { ENI.UI.error('Errore: ' + e.message); }
        });
    }

    // --- Form Modifica Accisa ---
    function _showEditAccisaForm(acc) {
        var modal = _modal('mc-modal-edit-acc', 'Modifica Accisa - ' + acc.prodotto_id,
            _formField('Accisa (\u20AC/lt)', 'mc-edit-acc-val', 'number', acc.accisa, '0.000001') +
            _formField('In vigore dal', 'mc-edit-acc-da', 'date', acc.data_inizio) +
            _formField('In vigore fino al (vuoto = attiva)', 'mc-edit-acc-a', 'date', acc.data_fine) +
            _formField('Note', 'mc-edit-acc-note', 'text', acc.note),
            'mc-edit-acc-salva', 'Salva'
        );
        _openModal(modal, 'mc-modal-edit-acc');

        document.getElementById('mc-edit-acc-salva').addEventListener('click', async function() {
            var accisa = parseFloat(document.getElementById('mc-edit-acc-val').value);
            var da = document.getElementById('mc-edit-acc-da').value;
            var a = document.getElementById('mc-edit-acc-a').value || null;
            var note = document.getElementById('mc-edit-acc-note').value || null;
            if (!da || !accisa) { ENI.UI.warning('Compila accisa e data inizio'); return; }
            try {
                await ENI.API.update(T.ACCISE, acc.id, {
                    accisa: accisa, data_inizio: da, data_fine: a, note: note
                });
                _closeModal('mc-modal-edit-acc');
                _renderTab();
                ENI.UI.success('Accisa aggiornata');
            } catch(e) { ENI.UI.error('Errore: ' + e.message); }
        });
    }

    // --- Form Chiudi Accisa ---
    function _showChiudiAccisaForm(id) {
        var modal = _modal('mc-modal-chiudi-acc', 'Chiudi Accisa',
            '<p>Imposta la data di fine validit\u00E0.</p>' +
            _formField('In vigore fino al', 'mc-chiudi-acc-data', 'date', ''),
            'mc-chiudi-acc-salva', 'Chiudi'
        );
        _openModal(modal, 'mc-modal-chiudi-acc');

        document.getElementById('mc-chiudi-acc-salva').addEventListener('click', async function() {
            var data = document.getElementById('mc-chiudi-acc-data').value;
            if (!data) { ENI.UI.warning('Inserisci data'); return; }
            try {
                await ENI.API.update(T.ACCISE, id, { data_fine: data });
                _closeModal('mc-modal-chiudi-acc');
                _renderTab();
                ENI.UI.success('Accisa chiusa');
            } catch(e) { ENI.UI.error('Errore: ' + e.message); }
        });
    }

    // --- Form Prodotto ---
    function _showProdottoForm() {
        var modal = _modal('mc-modal-prod', 'Nuovo Prodotto',
            _formField('ID (es. hvo)', 'mc-prod-id', 'text', '') +
            _formField('Nome (es. HVO)', 'mc-prod-nome', 'text', '') +
            '<div class="form-group"><label class="form-label"><input type="checkbox" id="mc-prod-pc" checked> Aderisce al Progetto Carburante</label></div>',
            'mc-prod-salva', 'Crea'
        );
        _openModal(modal, 'mc-modal-prod');

        document.getElementById('mc-prod-salva').addEventListener('click', async function() {
            var id = document.getElementById('mc-prod-id').value.trim().toLowerCase().replace(/\s+/g, '_');
            var nome = document.getElementById('mc-prod-nome').value.trim();
            var haPC = document.getElementById('mc-prod-pc').checked;
            if (!id || !nome) { ENI.UI.warning('Inserisci ID e nome'); return; }
            try {
                await ENI.API.insert(T.PRODOTTI, { id: id, nome: nome, ha_pc: haPC, ordine: _prodotti.length + 1 });
                _closeModal('mc-modal-prod');
                await _loadBase();
                _renderTab();
                ENI.UI.success('Prodotto creato');
            } catch(e) { ENI.UI.error('Errore: ' + e.message); }
        });
    }

    // ============================================================
    // TAB: CARICHI
    // ============================================================

    async function _renderCarichi(container) {
        var carichi = await ENI.API.getAll(T.CARICHI, { order: { col: 'data', asc: false } }) || [];

        var html =
            '<div style="margin-bottom:var(--space-3);">' +
                '<button class="btn btn-primary btn-sm" id="mc-btn-add-carico">+ Nuovo Carico</button>' +
            '</div>';

        if (carichi.length === 0) {
            html += '<div class="card"><div class="card-body"><p class="empty-state-text">Nessun carico registrato</p></div></div>';
        } else {
            // Raggruppa carichi per data
            var perData = {};
            carichi.forEach(function(c) {
                if (!perData[c.data]) perData[c.data] = [];
                perData[c.data].push(c);
            });

            var dateOrdinate = Object.keys(perData).sort().reverse();

            dateOrdinate.forEach(function(data) {
                var righe = perData[data];
                var totCostoCarico = righe.reduce(function(s, c) { return s + (parseFloat(c.costo_carico_totale) || 0); }, 0);

                html += '<div class="card" style="margin-bottom:var(--space-2);">' +
                    '<div class="card-body" style="overflow-x:auto; padding:var(--space-2);">' +
                        '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:var(--space-1);">' +
                            '<strong>Carico del ' + _fmtData(data) + '</strong>' +
                            '<span style="color:var(--color-primary); font-weight:600;">Totale: ' + _fmtEuro(totCostoCarico) + '</span>' +
                        '</div>' +
                        '<table class="table cm-table-compact"><thead><tr>' +
                            '<th>Prodotto</th><th class="text-right">Lt. Ord.</th><th class="text-right">Lt. Comm.</th>' +
                            '<th class="text-right">Lt. Fiscali</th><th class="text-right">MP (\u20AC/lt)</th><th class="text-right">Accisa</th>' +
                            '<th class="text-right" style="background:#e0f7fa;">Costo Tot.</th><th class="text-right" style="background:#e0f7fa;">Costo/Lt</th>' +
                            '<th class="text-right">C.M. Dopo</th><th></th>' +
                        '</tr></thead><tbody>';

                righe.forEach(function(c) {
                    var prodNome = _prodotti.find(function(p) { return p.id === c.prodotto_id; });
                    html += '<tr>' +
                        '<td><strong>' + (prodNome ? prodNome.nome : c.prodotto_id) + '</strong></td>' +
                        '<td class="text-right">' + _fmt(c.litri_ordinati, 0) + '</td>' +
                        '<td class="text-right">' + _fmt(c.litri_fisici, 0) + '</td>' +
                        '<td class="text-right">' + _fmt(c.litri_fiscali, 0) + '</td>' +
                        '<td class="text-right">' + _fmtEuro5(c.prezzo_mp) + '</td>' +
                        '<td class="text-right">' + (parseFloat(c.accisa) || 0).toFixed(4) + '</td>' +
                        '<td class="text-right" style="background:#e0f7fa; font-weight:600;">' + _fmtEuro(c.costo_carico_totale) + '</td>' +
                        '<td class="text-right" style="background:#e0f7fa;">' + _fmtEuro5(c.costo_per_litro_fisico) + '</td>' +
                        '<td class="text-right">' + _fmtEuro5(c.costo_medio_risultante) + '</td>' +
                        '<td style="white-space:nowrap;">' +
                            '<button class="btn-icon mc-edit-carico" data-id="' + c.id + '" data-prod="' + c.prodotto_id + '" data-data="' + c.data + '" data-ord="' + (c.litri_ordinati||0) + '" data-comm="' + (c.litri_fisici||0) + '" data-fisc="' + (c.litri_fiscali||0) + '" data-mp="' + (c.prezzo_mp||0) + '" data-acc="' + (c.accisa||0) + '" data-note="' + ENI.UI.escapeHtml(c.note||'') + '" title="Modifica"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="pointer-events:none;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>' +
                            '<button class="btn-icon mc-del-carico" data-id="' + c.id + '" title="Elimina" style="color:var(--color-danger);"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="pointer-events:none;"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>' +
                        '</td>' +
                    '</tr>';
                });

                html += '</tbody></table></div></div>';
            });
        }

        container.innerHTML = html;

        document.getElementById('mc-btn-add-carico').addEventListener('click', _showCaricoForm);
        container.querySelectorAll('.mc-edit-carico').forEach(function(btn) {
            btn.addEventListener('click', function() {
                _showEditCaricoForm({
                    id: btn.getAttribute('data-id'),
                    prodotto_id: btn.getAttribute('data-prod'),
                    data: btn.getAttribute('data-data'),
                    litri_ordinati: btn.getAttribute('data-ord'),
                    litri_fisici: btn.getAttribute('data-comm'),
                    litri_fiscali: btn.getAttribute('data-fisc'),
                    prezzo_mp: btn.getAttribute('data-mp'),
                    accisa: btn.getAttribute('data-acc'),
                    note: btn.getAttribute('data-note')
                });
            });
        });
        container.querySelectorAll('.mc-del-carico').forEach(function(btn) {
            btn.addEventListener('click', async function() {
                if (!confirm('Eliminare questo carico?')) return;
                try {
                    await ENI.API.remove(T.CARICHI, btn.getAttribute('data-id'));
                    await _ricalcolaStato();
                    _renderPage();
                    ENI.UI.success('Carico eliminato');
                } catch(e) { ENI.UI.error('Errore: ' + e.message); }
            });
        });
    }

    // --- Form Modifica Singolo Carico ---
    function _showEditCaricoForm(c) {
        var prodNome = _prodotti.find(function(p) { return p.id === c.prodotto_id; });

        var body =
            '<div style="padding:var(--space-2); background:var(--color-gray-50); border-radius:var(--radius-md); margin-bottom:var(--space-3);">' +
                '<strong>' + (prodNome ? prodNome.nome : c.prodotto_id) + '</strong> &mdash; ' + _fmtData(c.data) +
            '</div>' +
            _formField('Litri ordinati', 'mc-ecar-ord', 'number', c.litri_ordinati, '0.01') +
            _formField('Litri commerciali', 'mc-ecar-comm', 'number', c.litri_fisici, '0.01') +
            _formField('Litri fiscali', 'mc-ecar-fisc', 'number', c.litri_fiscali, '0.01') +
            _formField('Prezzo MP (\u20AC/lt)', 'mc-ecar-mp', 'number', c.prezzo_mp, '0.00001') +
            _formField('Accisa (\u20AC/lt)', 'mc-ecar-acc', 'number', c.accisa, '0.000001') +
            _formField('Note', 'mc-ecar-note', 'text', c.note || '') +
            '<div id="mc-ecar-preview" style="padding:var(--space-2); background:var(--color-gray-50); border-radius:var(--radius-md); margin-top:var(--space-2); font-size:0.85rem;"></div>';

        var modal = _modal('mc-modal-edit-carico', 'Modifica Carico - ' + (prodNome ? prodNome.nome : ''), body, 'mc-ecar-salva', 'Salva');
        _openModal(modal, 'mc-modal-edit-carico');

        function updatePreview() {
            var comm = parseFloat(document.getElementById('mc-ecar-comm').value) || 0;
            var fisc = parseFloat(document.getElementById('mc-ecar-fisc').value) || 0;
            var mp = parseFloat(document.getElementById('mc-ecar-mp').value) || 0;
            var acc = parseFloat(document.getElementById('mc-ecar-acc').value) || 0;
            if (comm <= 0) { document.getElementById('mc-ecar-preview').innerHTML = ''; return; }
            var calc = ENI.Calcoli.calcolaCostoCarico(fisc, comm, mp, acc);
            document.getElementById('mc-ecar-preview').innerHTML =
                'Costo totale: <strong>' + _fmtEuro(calc.costo_carico_totale) + '</strong> | Costo/lt: <strong>' + _fmtEuro5(calc.costo_per_litro_fisico) + '</strong>';
        }
        ['mc-ecar-comm','mc-ecar-fisc','mc-ecar-mp','mc-ecar-acc'].forEach(function(id) {
            document.getElementById(id).addEventListener('input', updatePreview);
        });
        updatePreview();

        document.getElementById('mc-ecar-salva').addEventListener('click', async function() {
            var ord = parseFloat(document.getElementById('mc-ecar-ord').value) || 0;
            var comm = parseFloat(document.getElementById('mc-ecar-comm').value) || 0;
            var fisc = parseFloat(document.getElementById('mc-ecar-fisc').value) || 0;
            var mp = parseFloat(document.getElementById('mc-ecar-mp').value) || 0;
            var acc = parseFloat(document.getElementById('mc-ecar-acc').value) || 0;
            var note = document.getElementById('mc-ecar-note').value || null;

            if (comm <= 0 || fisc <= 0 || mp <= 0) {
                ENI.UI.warning('Compila litri commerciali, fiscali e prezzo MP'); return;
            }

            var calc = ENI.Calcoli.calcolaCostoCarico(fisc, comm, mp, acc);

            try {
                await ENI.API.update(T.CARICHI, c.id, {
                    litri_ordinati: ord, litri_fisici: comm, litri_fiscali: fisc,
                    prezzo_mp: mp, accisa: acc, note: note,
                    costo_carico_totale: calc.costo_carico_totale,
                    costo_per_litro_fisico: calc.costo_per_litro_fisico
                });
                _closeModal('mc-modal-edit-carico');
                await _ricalcolaStato();
                _renderPage();
                ENI.UI.success('Carico aggiornato');
            } catch(e) { ENI.UI.error('Errore: ' + e.message); }
        });
    }

    // --- Form Carico Multi-Prodotto ---
    function _showCaricoForm() {
        var oggi = _todayStr();

        // Costruisci form con una sezione per ogni prodotto
        var body =
            _formField('Data carico', 'mc-car-data', 'date', oggi) +
            _formField('Note (opzionale)', 'mc-car-note', 'text', '') +
            '<hr style="margin:var(--space-3) 0; border:none; border-top:1px solid var(--color-gray-200);">';

        _prodotti.forEach(function(prod, idx) {
            body +=
                '<div style="padding:var(--space-2); margin-bottom:var(--space-2); border:1px solid var(--color-gray-200); border-radius:var(--radius-md);">' +
                    '<div style="display:flex; align-items:center; gap:var(--space-2); margin-bottom:var(--space-2);">' +
                        '<strong style="font-size:0.9rem;">' + prod.nome + '</strong>' +
                        '<span style="font-size:0.75rem; color:var(--text-secondary);">(lascia vuoto se non presente nel carico)</span>' +
                    '</div>' +
                    '<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(120px, 1fr)); gap:var(--space-2);">' +
                        '<div class="form-group" style="margin:0;"><label class="form-label" style="font-size:0.7rem;">Lt. ordinati</label>' +
                            '<input type="number" class="form-input mc-car-field" id="mc-car-ord-' + prod.id + '" step="0.01" data-prod="' + prod.id + '" data-field="ord"></div>' +
                        '<div class="form-group" style="margin:0;"><label class="form-label" style="font-size:0.7rem;">Lt. commerciali</label>' +
                            '<input type="number" class="form-input mc-car-field" id="mc-car-comm-' + prod.id + '" step="0.01" data-prod="' + prod.id + '" data-field="comm"></div>' +
                        '<div class="form-group" style="margin:0;"><label class="form-label" style="font-size:0.7rem;">Lt. fiscali</label>' +
                            '<input type="number" class="form-input mc-car-field" id="mc-car-fisc-' + prod.id + '" step="0.01" data-prod="' + prod.id + '" data-field="fisc"></div>' +
                        '<div class="form-group" style="margin:0;"><label class="form-label" style="font-size:0.7rem;">Prezzo MP (\u20AC/lt)</label>' +
                            '<input type="number" class="form-input mc-car-field" id="mc-car-mp-' + prod.id + '" step="0.00001" data-prod="' + prod.id + '" data-field="mp"></div>' +
                        '<div class="form-group" style="margin:0;"><label class="form-label" style="font-size:0.7rem;">Accisa (\u20AC/lt)</label>' +
                            '<input type="number" class="form-input mc-car-field" id="mc-car-acc-' + prod.id + '" step="0.000001" data-prod="' + prod.id + '" data-field="acc"></div>' +
                    '</div>' +
                    '<div id="mc-car-prev-' + prod.id + '" style="font-size:0.75rem; color:var(--text-secondary); margin-top:var(--space-1);"></div>' +
                '</div>';
        });

        body += '<div id="mc-car-totale" style="padding:var(--space-2); background:var(--color-primary-light); border-radius:var(--radius-md); font-weight:600; text-align:right;"></div>';

        var modal = _modal('mc-modal-carico', 'Nuovo Carico', body, 'mc-car-salva', 'Registra Carico');
        _openModal(modal, 'mc-modal-carico');

        // Precompila accise per ogni prodotto alla data selezionata
        async function precompileAccise() {
            var dataCarico = document.getElementById('mc-car-data').value || _todayStr();
            for (var i = 0; i < _prodotti.length; i++) {
                var prod = _prodotti[i];
                var accise = await ENI.API.getAll(T.ACCISE, {
                    filters: [{ op: 'eq', col: 'prodotto_id', val: prod.id }],
                    order: { col: 'data_inizio', asc: false }
                }) || [];
                for (var j = 0; j < accise.length; j++) {
                    var a = accise[j];
                    if (a.data_inizio <= dataCarico && (!a.data_fine || a.data_fine >= dataCarico)) {
                        document.getElementById('mc-car-acc-' + prod.id).value = a.accisa;
                        break;
                    }
                }
            }
            updatePreviews();
        }
        precompileAccise();
        document.getElementById('mc-car-data').addEventListener('change', precompileAccise);

        // Preview per prodotto + totale
        function updatePreviews() {
            var totale = 0;
            _prodotti.forEach(function(prod) {
                var comm = parseFloat(document.getElementById('mc-car-comm-' + prod.id).value) || 0;
                var fisc = parseFloat(document.getElementById('mc-car-fisc-' + prod.id).value) || 0;
                var mp = parseFloat(document.getElementById('mc-car-mp-' + prod.id).value) || 0;
                var acc = parseFloat(document.getElementById('mc-car-acc-' + prod.id).value) || 0;
                var prev = document.getElementById('mc-car-prev-' + prod.id);

                if (comm <= 0 && fisc <= 0) {
                    prev.innerHTML = '';
                    return;
                }

                var calc = ENI.Calcoli.calcolaCostoCarico(fisc, comm, mp, acc);
                totale += calc.costo_carico_totale;
                prev.innerHTML = 'Costo: <strong>' + _fmtEuro(calc.costo_carico_totale) + '</strong> | ' + _fmtEuro5(calc.costo_per_litro_fisico) + '/lt';
            });

            var totDiv = document.getElementById('mc-car-totale');
            if (totDiv) totDiv.innerHTML = totale > 0 ? 'Costo totale carico: ' + _fmtEuro(totale) : '';
        }

        document.querySelectorAll('.mc-car-field').forEach(function(input) {
            input.addEventListener('input', updatePreviews);
        });

        // Salva
        document.getElementById('mc-car-salva').addEventListener('click', async function() {
            var data = document.getElementById('mc-car-data').value;
            var note = document.getElementById('mc-car-note').value || null;
            if (!data) { ENI.UI.warning('Inserisci la data'); return; }

            var haAlmenoUnProdotto = false;
            var prodottiDaSalvare = [];

            _prodotti.forEach(function(prod) {
                var comm = parseFloat(document.getElementById('mc-car-comm-' + prod.id).value) || 0;
                var fisc = parseFloat(document.getElementById('mc-car-fisc-' + prod.id).value) || 0;
                var mp = parseFloat(document.getElementById('mc-car-mp-' + prod.id).value) || 0;
                var acc = parseFloat(document.getElementById('mc-car-acc-' + prod.id).value) || 0;
                var ord = parseFloat(document.getElementById('mc-car-ord-' + prod.id).value) || 0;

                if (comm > 0 && fisc > 0 && mp > 0) {
                    haAlmenoUnProdotto = true;
                    prodottiDaSalvare.push({ prodId: prod.id, ord: ord, comm: comm, fisc: fisc, mp: mp, acc: acc });
                }
            });

            if (!haAlmenoUnProdotto) {
                ENI.UI.warning('Inserisci i dati di almeno un prodotto'); return;
            }

            try {
                for (var i = 0; i < prodottiDaSalvare.length; i++) {
                    var p = prodottiDaSalvare[i];
                    var calc = ENI.Calcoli.calcolaCostoCarico(p.fisc, p.comm, p.mp, p.acc);
                    var st = _statoProdotti[p.prodId] || {};
                    var cm = ENI.Calcoli.aggiornaCostoMedio(
                        st.giacenza_teorica || 0, st.costo_medio || 0,
                        p.comm, calc.costo_per_litro_fisico
                    );

                    await ENI.API.insert(T.CARICHI, {
                        prodotto_id: p.prodId, data: data, litri_ordinati: p.ord,
                        litri_fisici: p.comm, litri_fiscali: p.fisc, prezzo_mp: p.mp,
                        accisa: p.acc, costo_carico_totale: calc.costo_carico_totale,
                        costo_per_litro_fisico: calc.costo_per_litro_fisico,
                        costo_medio_risultante: cm.nuovo_costo_medio, note: note
                    });

                    // Aggiorna stato per il prodotto successivo (se nello stesso carico)
                    _statoProdotti[p.prodId] = _statoProdotti[p.prodId] || {};
                    _statoProdotti[p.prodId].giacenza_teorica = cm.nuova_giacenza;
                    _statoProdotti[p.prodId].costo_medio = cm.nuovo_costo_medio;
                }

                _closeModal('mc-modal-carico');
                await _ricalcolaStato();
                _renderPage();
                ENI.UI.success('Carico registrato (' + prodottiDaSalvare.length + ' prodotti)');
            } catch(e) { ENI.UI.error('Errore: ' + e.message); }
        });
    }

    // ============================================================
    // TAB: VENDITE
    // Registro giornaliero con regola festivi/domeniche
    // ============================================================

    var _venditeMese = null; // { anno, mese }

    async function _renderVendite(container) {
        var oggi = new Date();
        if (!_venditeMese) _venditeMese = { anno: oggi.getFullYear(), mese: oggi.getMonth() + 1 };

        var html =
            '<div style="display:flex; gap:var(--space-2); align-items:center; margin-bottom:var(--space-3);">' +
                '<select id="mc-vend-mese" class="form-select" style="min-width:130px;">';
        for (var m = 0; m < 12; m++) {
            html += '<option value="' + (m+1) + '"' + (m+1 === _venditeMese.mese ? ' selected' : '') + '>' + MESI[m] + '</option>';
        }
        html += '</select>' +
                '<select id="mc-vend-anno" class="form-select" style="min-width:90px;">';
        for (var a = 2024; a <= oggi.getFullYear() + 1; a++) {
            html += '<option value="' + a + '"' + (a === _venditeMese.anno ? ' selected' : '') + '>' + a + '</option>';
        }
        html += '</select>' +
                '<button class="btn btn-sm btn-outline" id="mc-vend-load">Carica</button>' +
                '<div style="flex:1;"></div>' +
                '<button class="btn btn-primary btn-sm" id="mc-vend-add">+ Registra Vendita</button>' +
            '</div>' +
            '<div id="mc-vend-table"></div>';

        container.innerHTML = html;

        document.getElementById('mc-vend-load').addEventListener('click', function() {
            _venditeMese.mese = parseInt(document.getElementById('mc-vend-mese').value);
            _venditeMese.anno = parseInt(document.getElementById('mc-vend-anno').value);
            _loadVendite();
        });
        document.getElementById('mc-vend-add').addEventListener('click', function() { _showVenditaForm(); });

        await _loadVendite();
    }

    async function _loadVendite() {
        var tbl = document.getElementById('mc-vend-table');
        if (!tbl) return;

        var primoGiorno = _venditeMese.anno + '-' + String(_venditeMese.mese).padStart(2,'0') + '-01';
        var ultimoGiorno = new Date(_venditeMese.anno, _venditeMese.mese, 0);
        var fino = ultimoGiorno.getFullYear() + '-' + String(ultimoGiorno.getMonth()+1).padStart(2,'0') + '-' + String(ultimoGiorno.getDate()).padStart(2,'0');

        var vendite = await ENI.API.getAll(T.VENDITE, {
            filters: [{ op: 'gte', col: 'data_inizio', val: primoGiorno }, { op: 'lte', col: 'data_inizio', val: fino }],
            order: { col: 'data_inizio', asc: true }
        }) || [];

        if (vendite.length === 0) {
            tbl.innerHTML = '<div class="card"><div class="card-body"><p class="empty-state-text">Nessuna vendita registrata per ' + MESI[_venditeMese.mese-1] + ' ' + _venditeMese.anno + '</p></div></div>';
            return;
        }

        var totLitri = 0, totImporto = 0;
        var html = '<div class="card"><div class="card-body" style="overflow-x:auto; padding:var(--space-2);">' +
            '<table class="table cm-table-compact"><thead><tr>' +
                '<th>Data</th><th class="text-right">Litri</th><th class="text-right">Importo</th><th>Note</th><th></th>' +
            '</tr></thead><tbody>';

        vendite.forEach(function(v) {
            var dataLabel = _fmtData(v.data_inizio);
            if (v.data_fine && v.data_fine !== v.data_inizio) {
                dataLabel = 'dal ' + _fmtData(v.data_inizio) + ' al ' + _fmtData(v.data_fine);
            }
            totLitri += parseFloat(v.litri_totali) || 0;
            totImporto += parseFloat(v.importo_totale) || 0;

            html += '<tr>' +
                '<td>' + dataLabel + '</td>' +
                '<td class="text-right">' + _fmt(v.litri_totali, 2) + '</td>' +
                '<td class="text-right"><strong>' + _fmtEuro(v.importo_totale) + '</strong></td>' +
                '<td style="font-size:0.75rem; color:var(--text-secondary);">' + (v.note || '') + '</td>' +
                '<td style="white-space:nowrap;">' +
                    '<button class="btn-icon mc-vend-edit" data-id="' + v.id + '" title="Modifica"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="pointer-events:none;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>' +
                    '<button class="btn-icon mc-vend-del" data-id="' + v.id + '" title="Elimina" style="color:var(--color-danger);"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="pointer-events:none;"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>' +
                '</td>' +
            '</tr>';
        });

        html += '<tr style="font-weight:700; background:var(--color-gray-50);">' +
            '<td>TOTALE</td>' +
            '<td class="text-right">' + _fmt(totLitri, 2) + '</td>' +
            '<td class="text-right">' + _fmtEuro(totImporto) + '</td>' +
            '<td colspan="2"></td>' +
        '</tr>';

        html += '</tbody></table></div></div>';
        tbl.innerHTML = html;

        // Listener
        tbl.querySelectorAll('.mc-vend-edit').forEach(function(btn) {
            btn.addEventListener('click', async function() {
                try {
                    var id = btn.getAttribute('data-id');
                    var v = await ENI.API.getById(T.VENDITE, id);
                    console.log('Vendita caricata per modifica:', JSON.stringify(v));
                    if (v) _showVenditaForm(v);
                } catch(e) {
                    ENI.UI.error('Errore caricamento vendita: ' + e.message);
                }
            });
        });
        tbl.querySelectorAll('.mc-vend-del').forEach(function(btn) {
            btn.addEventListener('click', async function() {
                if (!confirm('Eliminare questa vendita?')) return;
                try {
                    await ENI.API.remove(T.VENDITE, btn.getAttribute('data-id'));
                    await _ricalcolaStato();
                    _renderPage();
                    ENI.UI.success('Vendita eliminata');
                } catch(e) { ENI.UI.error('Errore: ' + e.message); }
            });
        });
    }

    function _showVenditaForm(existing) {
        var isEdit = !!existing;
        var oggi = _todayStr();

        var body =
            _formField('Data', 'mc-vend-data', 'date', isEdit ? existing.data_inizio : oggi) +
            '<div class="form-group"><label class="form-label"><input type="checkbox" id="mc-vend-festivo"' + (isEdit && existing.data_fine !== existing.data_inizio ? ' checked' : '') + '> Accorpa giorno festivo/domenica</label></div>' +
            '<div id="mc-vend-festivo-extra" style="display:none;">' +
                _formField('Fino al (data fine intervallo)', 'mc-vend-data-fine', 'date', isEdit ? existing.data_fine : '') +
            '</div>' +
            _formField('Litri totali', 'mc-vend-litri', 'number', isEdit ? existing.litri_totali : '', '0.01') +
            _formField('Importo totale (\u20AC)', 'mc-vend-importo', 'number', isEdit ? existing.importo_totale : '', '0.01') +
            _formField('Note', 'mc-vend-note', 'text', isEdit ? (existing.note || '') : '');

        // Breakdown per prodotto
        body += '<div style="margin-top:var(--space-3); padding-top:var(--space-3); border-top:1px solid var(--color-gray-200);">' +
            '<h4 style="margin:0 0 var(--space-2) 0; font-size:var(--font-size-sm);">Dettaglio per prodotto (opzionale)</h4>';
        _prodotti.forEach(function(p) {
            body += '<div style="display:flex; gap:var(--space-2); align-items:center; margin-bottom:var(--space-1);">' +
                '<span style="min-width:80px; font-size:0.85rem;">' + p.nome + '</span>' +
                '<input type="number" class="form-input mc-vend-prod-litri" data-prod="' + p.id + '" placeholder="Litri" step="0.01" style="flex:1;">' +
            '</div>';
        });
        body += '</div>';

        var modal = _modal('mc-modal-vendita', isEdit ? 'Modifica Vendita' : 'Registra Vendita', body, 'mc-vend-salva', isEdit ? 'Salva' : 'Registra');
        _openModal(modal, 'mc-modal-vendita');

        // Toggle festivo
        var chkFestivo = document.getElementById('mc-vend-festivo');
        var extraDiv = document.getElementById('mc-vend-festivo-extra');
        chkFestivo.addEventListener('change', function() {
            extraDiv.style.display = this.checked ? '' : 'none';
        });
        if (chkFestivo.checked) extraDiv.style.display = '';

        document.getElementById('mc-vend-salva').addEventListener('click', async function() {
            var data = document.getElementById('mc-vend-data').value;
            var isFestivo = document.getElementById('mc-vend-festivo').checked;
            var dataFine = isFestivo ? (document.getElementById('mc-vend-data-fine').value || data) : data;
            var litri = parseFloat(document.getElementById('mc-vend-litri').value) || 0;
            var importo = parseFloat(document.getElementById('mc-vend-importo').value) || 0;
            var note = document.getElementById('mc-vend-note').value || null;

            if (!data) { ENI.UI.warning('Inserisci la data'); return; }

            try {
                var venditaId;
                if (isEdit) {
                    await ENI.API.update(T.VENDITE, existing.id, {
                        data_inizio: data, data_fine: dataFine, litri_totali: litri, importo_totale: importo, note: note
                    });
                    venditaId = existing.id;
                } else {
                    // Upsert: se esiste già una vendita per questa data, aggiornala
                    var result = await ENI.API.getClient().from(T.VENDITE)
                        .upsert({
                            data_inizio: data, data_fine: dataFine, litri_totali: litri, importo_totale: importo, note: note
                        }, { onConflict: 'data_inizio' })
                        .select().single();
                    if (result.error) throw new Error(result.error.message);
                    venditaId = result.data.id;
                }

                console.log('Vendita salvata, venditaId:', venditaId);

                // Salva breakdown per prodotto (solo se venditaId valido e ci sono litri compilati)
                if (venditaId) {
                    var prodInputs = document.querySelectorAll('.mc-vend-prod-litri');
                    for (var i = 0; i < prodInputs.length; i++) {
                        var prodId = prodInputs[i].getAttribute('data-prod');
                        var prodLitri = parseFloat(prodInputs[i].value) || 0;
                        if (prodLitri > 0) {
                            var st = _statoProdotti[prodId] || {};
                            var prezziProd = await ENI.API.getAll(T.PREZZI, {
                                filters: [{ op: 'eq', col: 'prodotto_id', val: prodId }],
                                order: { col: 'data_inizio', asc: false }, limit: 1
                            }) || [];
                            var pp = prezziProd.length > 0 ? parseFloat(prezziProd[0].prezzo) : 0;

                            await ENI.API.getClient().from(T.VENDITE_PROD).upsert({
                                vendita_id: venditaId, prodotto_id: prodId, litri: prodLitri,
                                prezzo_pompa: pp, importo: prodLitri * pp, costo_medio_ref: st.costo_medio || 0
                            }, { onConflict: 'vendita_id,prodotto_id' });
                        }
                    }
                }

                _closeModal('mc-modal-vendita');
                await _ricalcolaStato();
                _renderPage();
                ENI.UI.success(isEdit ? 'Vendita aggiornata' : 'Vendita registrata');
            } catch(e) { ENI.UI.error('Errore: ' + e.message); }
        });
    }

    // ============================================================
    // TAB: PREZZI POMPA
    // Storico prezzi + simulatore margine
    // ============================================================

    async function _renderPrezzi(container) {
        var prezzi = await ENI.API.getAll(T.PREZZI, { order: { col: 'data_inizio', asc: false } }) || [];
        var margineTarget = parseFloat(_config.margine_target) || 0.05;

        var html =
            '<div style="margin-bottom:var(--space-3);">' +
                '<button class="btn btn-primary btn-sm" id="mc-btn-add-prezzo">+ Aggiorna Prezzi</button>' +
            '</div>';

        // Simulatore margine
        html +=
            '<div class="card" style="margin-bottom:var(--space-3);">' +
                '<div class="card-body">' +
                    '<h3 style="margin:0 0 var(--space-3) 0;">Simulatore Margine</h3>' +
                    '<div style="display:flex; gap:var(--space-2); align-items:center; flex-wrap:wrap;">' +
                        '<label style="font-size:0.85rem;">Margine target:</label>' +
                        '<input type="range" id="mc-sim-slider" min="0.02" max="0.15" step="0.005" value="' + margineTarget + '" style="flex:1; min-width:150px;">' +
                        '<span id="mc-sim-val" style="font-weight:700; min-width:60px;">' + margineTarget.toFixed(3) + ' \u20AC/lt</span>' +
                    '</div>' +
                    '<div id="mc-sim-result" style="margin-top:var(--space-2);"></div>' +
                '</div>' +
            '</div>';

        // Prezzi raggruppati per prodotto
        _prodotti.forEach(function(prod) {
            var prezziProd = prezzi.filter(function(p) { return p.prodotto_id === prod.id; });
            var prezzoAttuale = prezziProd.length > 0 ? prezziProd[0] : null;
            var st = _statoProdotti[prod.id] || {};
            var margine = prezzoAttuale ? (parseFloat(prezzoAttuale.prezzo) - (st.costo_medio || 0)) : null;
            var colMargine = margine !== null ? (margine >= margineTarget ? 'var(--color-success)' : margine >= 0 ? '#FF9800' : 'var(--color-danger)') : 'var(--text-secondary)';

            html += '<div class="card" style="margin-bottom:var(--space-2);">' +
                '<div class="card-body" style="padding:var(--space-2);">' +
                    '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:var(--space-1);">' +
                        '<strong>' + prod.nome + '</strong>' +
                        '<div style="text-align:right;">' +
                            (prezzoAttuale
                                ? '<span style="font-size:1.1rem; font-weight:700;">' + _fmtEuro5(prezzoAttuale.prezzo) + '</span>' +
                                  '<span style="font-size:0.75rem; color:var(--text-secondary); margin-left:var(--space-2);">dal ' + _fmtData(prezzoAttuale.data_inizio) + '</span>' +
                                  '<span style="font-size:0.75rem; color:' + colMargine + '; margin-left:var(--space-2);">margine: ' + (margine !== null ? margine.toFixed(4) : 'N/D') + '</span>'
                                : '<span style="color:var(--text-secondary);">Nessun prezzo impostato</span>') +
                        '</div>' +
                    '</div>';

            if (prezziProd.length > 1) {
                html += '<details style="margin-top:var(--space-1);"><summary style="font-size:0.75rem; color:var(--text-secondary); cursor:pointer;">Storico (' + prezziProd.length + ' prezzi)</summary>' +
                    '<table class="table cm-table-compact" style="margin-top:var(--space-1);"><thead><tr>' +
                        '<th class="text-right">Prezzo</th><th>Dal</th><th>Note</th><th></th>' +
                    '</tr></thead><tbody>';
                prezziProd.forEach(function(p) {
                    html += '<tr>' +
                        '<td class="text-right"><strong>' + _fmtEuro5(p.prezzo) + '</strong></td>' +
                        '<td>' + _fmtData(p.data_inizio) + '</td>' +
                        '<td style="font-size:0.75rem;">' + (p.note || '') + '</td>' +
                        '<td style="white-space:nowrap;">' +
                            '<button class="btn-icon mc-edit-prezzo" data-id="' + p.id + '" data-prezzo="' + p.prezzo + '" data-data="' + p.data_inizio + '" data-note="' + ENI.UI.escapeHtml(p.note || '') + '" data-prod="' + p.prodotto_id + '" title="Modifica"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="pointer-events:none;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>' +
                            '<button class="btn-icon mc-del-prezzo" data-id="' + p.id + '" title="Elimina" style="color:var(--color-danger);"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="pointer-events:none;"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>' +
                        '</td>' +
                    '</tr>';
                });
                html += '</tbody></table></details>';
            } else if (prezziProd.length === 1) {
                html += '<div style="text-align:right;">' +
                    '<button class="btn-icon mc-edit-prezzo" data-id="' + prezziProd[0].id + '" data-prezzo="' + prezziProd[0].prezzo + '" data-data="' + prezziProd[0].data_inizio + '" data-note="' + ENI.UI.escapeHtml(prezziProd[0].note || '') + '" data-prod="' + prezziProd[0].prodotto_id + '" title="Modifica" style="font-size:0.75rem;"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="pointer-events:none;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>' +
                    '<button class="btn-icon mc-del-prezzo" data-id="' + prezziProd[0].id + '" title="Elimina" style="color:var(--color-danger);"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="pointer-events:none;"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>' +
                '</div>';
            }

            html += '</div></div>';
        });

        container.innerHTML = html;

        // Simulatore
        var slider = document.getElementById('mc-sim-slider');
        var simVal = document.getElementById('mc-sim-val');
        var simResult = document.getElementById('mc-sim-result');

        function updateSim() {
            var m = parseFloat(slider.value);
            simVal.textContent = m.toFixed(3) + ' \u20AC/lt';
            var resHtml = '<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:var(--space-2); font-size:0.85rem;">';
            _prodotti.forEach(function(p) {
                var st = _statoProdotti[p.id] || {};
                var consigliato = (st.costo_medio || 0) + m;
                resHtml += '<div>'+p.nome+': <strong>' + _fmtEuro5(consigliato) + '</strong> (costo: ' + _fmtEuro5(st.costo_medio || 0) + ')</div>';
            });
            resHtml += '</div>';
            simResult.innerHTML = resHtml;
        }
        slider.addEventListener('input', updateSim);
        updateSim();

        // Listener
        document.getElementById('mc-btn-add-prezzo').addEventListener('click', function() { _showPrezzoFormMulti(); });
        container.querySelectorAll('.mc-edit-prezzo').forEach(function(btn) {
            btn.addEventListener('click', function() {
                _showPrezzoFormSingolo({
                    id: btn.getAttribute('data-id'),
                    prodotto_id: btn.getAttribute('data-prod'),
                    prezzo: btn.getAttribute('data-prezzo'),
                    data_inizio: btn.getAttribute('data-data'),
                    note: btn.getAttribute('data-note')
                });
            });
        });
        container.querySelectorAll('.mc-del-prezzo').forEach(function(btn) {
            btn.addEventListener('click', async function() {
                if (!confirm('Eliminare questo prezzo?')) return;
                try {
                    await ENI.API.remove(T.PREZZI, btn.getAttribute('data-id'));
                    await _ricalcolaStato();
                    _renderPage();
                    ENI.UI.success('Prezzo eliminato');
                } catch(e) { ENI.UI.error('Errore: ' + e.message); }
            });
        });
    }

    // --- Form Multi-Prodotto (aggiorna tutti i prezzi insieme) ---
    function _showPrezzoFormMulti() {
        var margineTarget = parseFloat(_config.margine_target) || 0.05;

        var body = _formField('In vigore dal', 'mc-prez-data', 'date', _todayStr()) +
            _formField('Note (opzionale)', 'mc-prez-note', 'text', '') +
            '<hr style="margin:var(--space-3) 0; border:none; border-top:1px solid var(--color-gray-200);">';

        _prodotti.forEach(function(prod) {
            var st = _statoProdotti[prod.id] || {};
            var consigliato = ((st.costo_medio || 0) + margineTarget).toFixed(5);
            body +=
                '<div style="display:flex; gap:var(--space-2); align-items:center; margin-bottom:var(--space-2);">' +
                    '<span style="min-width:80px; font-weight:600; font-size:0.85rem;">' + prod.nome + '</span>' +
                    '<input type="number" class="form-input mc-prez-multi" data-prod="' + prod.id + '" step="0.00001" placeholder="' + consigliato + '" style="flex:1;">' +
                    '<span style="font-size:0.7rem; color:var(--text-secondary); min-width:90px;">cons. ' + consigliato + '</span>' +
                '</div>';
        });

        body += '<p style="font-size:0.75rem; color:var(--text-secondary); margin-top:var(--space-2);">Lascia vuoto i prodotti che non cambiano prezzo.</p>';

        var modal = _modal('mc-modal-prezzi', 'Aggiorna Prezzi Pompa', body, 'mc-prez-salva-multi', 'Salva Prezzi');
        _openModal(modal, 'mc-modal-prezzi');

        document.getElementById('mc-prez-salva-multi').addEventListener('click', async function() {
            var data = document.getElementById('mc-prez-data').value;
            var note = document.getElementById('mc-prez-note').value || null;
            if (!data) { ENI.UI.warning('Inserisci la data'); return; }

            var count = 0;
            var inputs = document.querySelectorAll('.mc-prez-multi');
            try {
                for (var i = 0; i < inputs.length; i++) {
                    var prezzo = parseFloat(inputs[i].value);
                    if (!prezzo || prezzo <= 0) continue;
                    var prodId = inputs[i].getAttribute('data-prod');
                    await ENI.API.insert(T.PREZZI, { prodotto_id: prodId, data_inizio: data, prezzo: prezzo, note: note });
                    count++;
                }
                if (count === 0) { ENI.UI.warning('Inserisci almeno un prezzo'); return; }
                _closeModal('mc-modal-prezzi');
                await _ricalcolaStato();
                _renderPage();
                ENI.UI.success(count + ' prezzi aggiornati');
            } catch(e) { ENI.UI.error('Errore: ' + e.message); }
        });
    }

    // --- Form Modifica Singolo Prezzo ---
    function _showPrezzoFormSingolo(p) {
        var prodNome = _prodotti.find(function(pr) { return pr.id === p.prodotto_id; });
        var modal = _modal('mc-modal-edit-prezzo', 'Modifica Prezzo - ' + (prodNome ? prodNome.nome : p.prodotto_id),
            _formField('Prezzo pompa (\u20AC/lt)', 'mc-eprez-prezzo', 'number', p.prezzo, '0.00001') +
            _formField('In vigore dal', 'mc-eprez-data', 'date', p.data_inizio) +
            _formField('Note', 'mc-eprez-note', 'text', p.note || ''),
            'mc-eprez-salva', 'Salva'
        );
        _openModal(modal, 'mc-modal-edit-prezzo');

        document.getElementById('mc-eprez-salva').addEventListener('click', async function() {
            var prezzo = parseFloat(document.getElementById('mc-eprez-prezzo').value);
            var data = document.getElementById('mc-eprez-data').value;
            var note = document.getElementById('mc-eprez-note').value || null;
            if (!prezzo || !data) { ENI.UI.warning('Inserisci prezzo e data'); return; }
            try {
                await ENI.API.update(T.PREZZI, p.id, { prezzo: prezzo, data_inizio: data, note: note });
                _closeModal('mc-modal-edit-prezzo');
                await _ricalcolaStato();
                _renderPage();
                ENI.UI.success('Prezzo aggiornato');
            } catch(e) { ENI.UI.error('Errore: ' + e.message); }
        });
    }

    // ============================================================
    // TAB: REPORT MENSILE
    // Report formato ufficiale + invio email
    // ============================================================

    async function _renderReport(container) {
        var oggi = new Date();
        var meseReport = oggi.getMonth() + 1;
        var annoReport = oggi.getFullYear();

        var html =
            '<div class="card" style="margin-bottom:var(--space-3);">' +
                '<div class="card-body">' +
                    '<h3 style="margin:0 0 var(--space-3) 0;">Genera Report Mensile</h3>' +
                    '<div style="display:flex; gap:var(--space-2); align-items:center; margin-bottom:var(--space-3);">' +
                        '<select id="mc-rep-mese" class="form-select" style="min-width:130px;">';
        for (var m = 0; m < 12; m++) {
            html += '<option value="'+(m+1)+'"'+(m+1===meseReport?' selected':'')+'>'+MESI[m]+'</option>';
        }
        html += '</select><select id="mc-rep-anno" class="form-select" style="min-width:90px;">';
        for (var a = 2024; a <= oggi.getFullYear()+1; a++) {
            html += '<option value="'+a+'"'+(a===annoReport?' selected':'')+'>'+a+'</option>';
        }
        html += '</select>' +
                        '<button class="btn btn-primary btn-sm" id="mc-rep-genera">Genera Anteprima</button>' +
                        '<button class="btn btn-outline btn-sm" id="mc-rep-email">Prepara Email</button>' +
                    '</div>' +
                    '<div id="mc-rep-preview"></div>' +
                '</div>' +
            '</div>';

        container.innerHTML = html;

        document.getElementById('mc-rep-genera').addEventListener('click', async function() {
            var mese = parseInt(document.getElementById('mc-rep-mese').value);
            var anno = parseInt(document.getElementById('mc-rep-anno').value);
            await _generaAnteprima(mese, anno);
        });

        document.getElementById('mc-rep-email').addEventListener('click', function() {
            var mese = parseInt(document.getElementById('mc-rep-mese').value);
            var anno = parseInt(document.getElementById('mc-rep-anno').value);
            _preparaEmail(mese, anno);
        });
    }

    async function _generaAnteprima(mese, anno) {
        var preview = document.getElementById('mc-rep-preview');
        if (!preview) return;

        var primoGiorno = anno + '-' + String(mese).padStart(2,'0') + '-01';
        var ultimoGiorno = new Date(anno, mese, 0);
        var fino = ultimoGiorno.getFullYear() + '-' + String(ultimoGiorno.getMonth()+1).padStart(2,'0') + '-' + String(ultimoGiorno.getDate()).padStart(2,'0');

        var vendite = await ENI.API.getAll(T.VENDITE, {
            filters: [{ op: 'gte', col: 'data_inizio', val: primoGiorno }, { op: 'lte', col: 'data_inizio', val: fino }],
            order: { col: 'data_inizio', asc: true }
        }) || [];

        var totLitri = 0, totImporto = 0;

        var html =
            '<div style="border:1px solid var(--color-gray-300); padding:var(--space-4); background:white; font-family:serif; max-width:600px;">' +
                '<div style="text-align:center; margin-bottom:var(--space-4);">' +
                    '<strong>COE ' + (_config.codice_coe || 'SM 30756') + ' - Ragione Sociale - ' + (_config.ragione_sociale || 'CERVELLINI ANDREA') + '</strong><br>' +
                    '<span>MESE: ' + MESI[mese-1].toUpperCase() + ' ' + anno + '</span>' +
                '</div>' +
                '<table style="width:100%; border-collapse:collapse; font-size:0.9rem;">' +
                    '<thead><tr style="border-bottom:2px solid #000;">' +
                        '<th style="text-align:left; padding:4px;">DATA</th>' +
                        '<th style="text-align:right; padding:4px;">LITRI EROGATI</th>' +
                        '<th style="text-align:right; padding:4px;">IMPORTO</th>' +
                    '</tr></thead><tbody>';

        vendite.forEach(function(v) {
            var dataLabel = _fmtData(v.data_inizio);
            if (v.data_fine && v.data_fine !== v.data_inizio) {
                dataLabel = 'dal ' + _fmtData(v.data_inizio).slice(0,8) + ' al ' + _fmtData(v.data_fine).slice(0,8);
            }
            var litri = parseFloat(v.litri_totali) || 0;
            var importo = parseFloat(v.importo_totale) || 0;
            totLitri += litri;
            totImporto += importo;

            html += '<tr style="border-bottom:1px solid #ccc;">' +
                '<td style="padding:3px 4px;">' + dataLabel + '</td>' +
                '<td style="text-align:right; padding:3px 4px;">' + _fmt(litri, 2) + '</td>' +
                '<td style="text-align:right; padding:3px 4px;">' + _fmtEuro(importo) + '</td>' +
            '</tr>';
        });

        html += '<tr style="border-top:2px solid #000; font-weight:bold;">' +
            '<td style="padding:4px;">TOTALE</td>' +
            '<td style="text-align:right; padding:4px;">' + _fmt(totLitri, 2) + '</td>' +
            '<td style="text-align:right; padding:4px;">' + _fmtEuro(totImporto) + '</td>' +
        '</tr></tbody></table>' +
        '<div style="margin-top:var(--space-6); text-align:right; font-style:italic;">Timbro e Firma</div>' +
        '</div>';

        preview.innerHTML = html;
    }

    function _preparaEmail(mese, anno) {
        var dest = _config.email_destinatario || '';
        var oggetto = 'Comunicazione mensile vendite carburanti - ' + MESI[mese-1] + ' ' + anno + ' - COE ' + (_config.codice_coe || 'SM 30756');
        var corpo = 'Gentile Ufficio Prodotti Petroliferi,\n\n' +
            'in allegato la comunicazione mensile delle vendite di carburante relative al mese di ' + MESI[mese-1] + ' ' + anno + '.\n\n' +
            'COE: ' + (_config.codice_coe || 'SM 30756') + '\n' +
            'Ragione Sociale: ' + (_config.ragione_sociale || 'CERVELLINI ANDREA') + '\n\n' +
            'Cordiali saluti,\n' + (_config.ragione_sociale || 'Andrea Cervellini');

        var mailtoUrl = 'mailto:' + encodeURIComponent(dest) +
            '?subject=' + encodeURIComponent(oggetto) +
            '&body=' + encodeURIComponent(corpo);

        window.open(mailtoUrl);
        ENI.UI.success('Email preparata in Outlook. Ricordati di allegare il report.');
    }

    // ============================================================
    // TAB: CONGUAGLI & PROGETTO CARBURANTE
    // ============================================================

    async function _renderConguagli(container) {
        var conguagli = await ENI.API.getAll(T.CONGUAGLI, { order: { col: 'data', asc: false } }) || [];
        var rimborsi = await ENI.API.getAll(T.RIMBORSI, { order: { col: 'data', asc: false } }) || [];

        var html = '';

        // --- CONGUAGLI ENI ---
        html +=
            '<div class="card" style="margin-bottom:var(--space-3);">' +
                '<div class="card-body">' +
                    '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:var(--space-3);">' +
                        '<h3 style="margin:0;">Conguagli ENI</h3>' +
                        '<button class="btn btn-primary btn-sm" id="mc-btn-add-cong">+ Nuovo Conguaglio</button>' +
                    '</div>';

        if (conguagli.length === 0) {
            html += '<p class="empty-state-text">Nessun conguaglio registrato</p>';
        } else {
            html += '<table class="table cm-table-compact"><thead><tr>' +
                '<th>Data</th><th>Prodotto</th><th class="text-right">Importo MP</th><th>Note</th><th></th>' +
            '</tr></thead><tbody>';
            conguagli.forEach(function(c) {
                var prodNome = _prodotti.find(function(p) { return p.id === c.prodotto_id; });
                var importo = parseFloat(c.importo_mp) || 0;
                html += '<tr>' +
                    '<td>' + _fmtData(c.data) + '</td>' +
                    '<td>' + (prodNome ? prodNome.nome : c.prodotto_id) + '</td>' +
                    '<td class="text-right" style="color:' + (importo < 0 ? 'var(--color-success)' : 'var(--color-danger)') + '; font-weight:600;">' + _fmtEuro(importo) + '</td>' +
                    '<td style="font-size:0.75rem;">' + (c.note || '') + '</td>' +
                    '<td><button class="btn-icon mc-del-cong" data-id="' + c.id + '" title="Elimina" style="color:var(--color-danger);"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="pointer-events:none;"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button></td>' +
                '</tr>';
            });
            html += '</tbody></table>';
        }
        html += '</div></div>';

        // --- PROGETTO CARBURANTE ---
        html +=
            '<div class="card" style="margin-bottom:var(--space-3);">' +
                '<div class="card-body">' +
                    '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:var(--space-3);">' +
                        '<h3 style="margin:0;">Progetto Carburante - Rimborsi Stato</h3>' +
                        '<button class="btn btn-primary btn-sm" id="mc-btn-add-rimb">+ Registra Rimborso</button>' +
                    '</div>';

        // Riepilogo PC
        var totMaturato = 0, totRimborsato = 0;
        _prodotti.forEach(function(p) {
            var st = _statoProdotti[p.id] || {};
            totMaturato += st.pc_maturato || 0;
            totRimborsato += st.pc_rimborsi || 0;
        });
        var credito = totMaturato - totRimborsato;

        html +=
            '<div class="cm-stats-inline" style="margin-bottom:var(--space-3);">' +
                '<div class="stat-card"><div class="stat-label">PC Maturato</div><div class="stat-value">' + _fmtEuro(totMaturato) + '</div></div>' +
                '<div class="stat-card"><div class="stat-label">Rimborsato</div><div class="stat-value">' + _fmtEuro(totRimborsato) + '</div></div>' +
                '<div class="stat-card"><div class="stat-label">Credito residuo</div><div class="stat-value" style="color:' + (credito >= 0 ? 'var(--color-success)' : 'var(--color-danger)') + ';">' + _fmtEuro(credito) + '</div></div>' +
            '</div>';

        if (rimborsi.length > 0) {
            html += '<table class="table cm-table-compact"><thead><tr>' +
                '<th>Data</th><th>Prodotto</th><th class="text-right">Importo</th><th>Periodo</th><th>Note</th><th></th>' +
            '</tr></thead><tbody>';
            rimborsi.forEach(function(r) {
                html += '<tr>' +
                    '<td>' + _fmtData(r.data) + '</td>' +
                    '<td>' + (r.prodotto_id || 'Tutti') + '</td>' +
                    '<td class="text-right" style="font-weight:600; color:var(--color-success);">' + _fmtEuro(r.importo) + '</td>' +
                    '<td>' + (r.periodo_rif || '') + '</td>' +
                    '<td style="font-size:0.75rem;">' + (r.note || '') + '</td>' +
                    '<td><button class="btn-icon mc-del-rimb" data-id="' + r.id + '" title="Elimina" style="color:var(--color-danger);"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="pointer-events:none;"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button></td>' +
                '</tr>';
            });
            html += '</tbody></table>';
        }
        html += '</div></div>';

        container.innerHTML = html;

        // Listener conguagli
        document.getElementById('mc-btn-add-cong').addEventListener('click', _showConguaglioForm);
        container.querySelectorAll('.mc-del-cong').forEach(function(btn) {
            btn.addEventListener('click', async function() {
                if (!confirm('Eliminare questo conguaglio?')) return;
                try {
                    await ENI.API.remove(T.CONGUAGLI, btn.getAttribute('data-id'));
                    await _ricalcolaStato();
                    _renderPage();
                    ENI.UI.success('Conguaglio eliminato');
                } catch(e) { ENI.UI.error('Errore: ' + e.message); }
            });
        });

        // Listener rimborsi
        document.getElementById('mc-btn-add-rimb').addEventListener('click', _showRimborsoForm);
        container.querySelectorAll('.mc-del-rimb').forEach(function(btn) {
            btn.addEventListener('click', async function() {
                if (!confirm('Eliminare questo rimborso?')) return;
                try {
                    await ENI.API.remove(T.RIMBORSI, btn.getAttribute('data-id'));
                    await _ricalcolaStato();
                    _renderPage();
                    ENI.UI.success('Rimborso eliminato');
                } catch(e) { ENI.UI.error('Errore: ' + e.message); }
            });
        });
    }

    function _showConguaglioForm() {
        var opts = _prodotti.map(function(p) { return '<option value="' + p.id + '">' + p.nome + '</option>'; }).join('');

        var modal = _modal('mc-modal-cong', 'Nuovo Conguaglio ENI',
            '<div class="form-group"><label class="form-label">Prodotto</label><select class="form-select" id="mc-cong-prod">' + opts + '</select></div>' +
            _formField('Data', 'mc-cong-data', 'date', _todayStr()) +
            _formField('Importo MP (\u20AC) (negativo = credito, positivo = debito)', 'mc-cong-importo', 'number', '', '0.01') +
            _formField('Note', 'mc-cong-note', 'text', ''),
            'mc-cong-salva', 'Registra'
        );
        _openModal(modal, 'mc-modal-cong');

        document.getElementById('mc-cong-salva').addEventListener('click', async function() {
            var prodId = document.getElementById('mc-cong-prod').value;
            var data = document.getElementById('mc-cong-data').value;
            var importo = parseFloat(document.getElementById('mc-cong-importo').value);
            var note = document.getElementById('mc-cong-note').value || null;
            if (!data || importo === undefined || isNaN(importo)) { ENI.UI.warning('Compila data e importo'); return; }
            try {
                await ENI.API.insert(T.CONGUAGLI, { prodotto_id: prodId, data: data, importo_mp: importo, note: note });
                _closeModal('mc-modal-cong');
                await _ricalcolaStato();
                _renderPage();
                ENI.UI.success('Conguaglio registrato');
            } catch(e) { ENI.UI.error('Errore: ' + e.message); }
        });
    }

    function _showRimborsoForm() {
        var opts = '<option value="">Tutti i prodotti</option>' +
            _prodotti.map(function(p) { return '<option value="' + p.id + '">' + p.nome + '</option>'; }).join('');

        var modal = _modal('mc-modal-rimb', 'Registra Rimborso Stato',
            '<div class="form-group"><label class="form-label">Prodotto</label><select class="form-select" id="mc-rimb-prod">' + opts + '</select></div>' +
            _formField('Data', 'mc-rimb-data', 'date', _todayStr()) +
            _formField('Importo (\u20AC)', 'mc-rimb-importo', 'number', '', '0.01') +
            _formField('Periodo di riferimento', 'mc-rimb-periodo', 'text', '') +
            _formField('Note', 'mc-rimb-note', 'text', ''),
            'mc-rimb-salva', 'Registra'
        );
        _openModal(modal, 'mc-modal-rimb');

        document.getElementById('mc-rimb-salva').addEventListener('click', async function() {
            var prodId = document.getElementById('mc-rimb-prod').value || null;
            var data = document.getElementById('mc-rimb-data').value;
            var importo = parseFloat(document.getElementById('mc-rimb-importo').value);
            var periodo = document.getElementById('mc-rimb-periodo').value || null;
            var note = document.getElementById('mc-rimb-note').value || null;
            if (!data || !importo) { ENI.UI.warning('Compila data e importo'); return; }
            try {
                await ENI.API.insert(T.RIMBORSI, { prodotto_id: prodId, data: data, importo: importo, periodo_rif: periodo, note: note });
                _closeModal('mc-modal-rimb');
                await _ricalcolaStato();
                _renderPage();
                ENI.UI.success('Rimborso registrato');
            } catch(e) { ENI.UI.error('Errore: ' + e.message); }
        });
    }

    // ============================================================
    // TAB: CHIUSURE MENSILI
    // ============================================================

    var _chiusureMese = null; // { anno, mese } per selezione anteprima
    var _chiusurePeriodo = null; // { daAnno, daMese, aAnno, aMese }

    // Calcola lo stato di un prodotto per un mese specifico
    // Trova il punto di partenza corretto (chiusura precedente o giacenza iniziale)
    async function _calcolaStatoMese(prod, anno, mese) {
        // Cerca chiusura del mese precedente
        var mesePrev = mese - 1, annoPrev = anno;
        if (mesePrev < 1) { mesePrev = 12; annoPrev--; }

        var chiusuraPrev = await ENI.API.getAll(T.CHIUSURE, {
            filters: [
                { op: 'eq', col: 'prodotto_id', val: prod.id },
                { op: 'eq', col: 'anno', val: annoPrev },
                { op: 'eq', col: 'mese', val: mesePrev }
            ],
            limit: 1
        });
        chiusuraPrev = chiusuraPrev && chiusuraPrev.length > 0 ? chiusuraPrev[0] : null;

        var giacIniz, costoIniz;
        if (chiusuraPrev) {
            giacIniz = parseFloat(chiusuraPrev.giacenza_reale) || 0;
            costoIniz = parseFloat(chiusuraPrev.costo_medio) || 0;
        } else {
            // Nessuna chiusura precedente: cerca la più recente anteriore
            var chiusureAnt = await ENI.API.getAll(T.CHIUSURE, {
                filters: [{ op: 'eq', col: 'prodotto_id', val: prod.id }],
                order: { col: 'anno', asc: false }
            });
            // Filtra solo quelle prima del mese richiesto
            var chiusuraBase = null;
            if (chiusureAnt) {
                for (var ci = 0; ci < chiusureAnt.length; ci++) {
                    var ch = chiusureAnt[ci];
                    if (ch.anno < anno || (ch.anno === anno && ch.mese < mese)) {
                        chiusuraBase = ch;
                        break;
                    }
                }
            }
            if (chiusuraBase) {
                giacIniz = parseFloat(chiusuraBase.giacenza_reale) || 0;
                costoIniz = parseFloat(chiusuraBase.costo_medio) || 0;
            } else {
                // Nessuna chiusura: usa giacenze_iniziali
                var giac = await ENI.API.getAll(T.GIACENZE, {
                    filters: [{ op: 'eq', col: 'prodotto_id', val: prod.id }],
                    limit: 1
                });
                var g = giac && giac.length > 0 ? giac[0] : null;
                giacIniz = g ? parseFloat(g.litri_fisici) || 0 : 0;
                costoIniz = g ? parseFloat(g.costo_medio) || 0 : 0;

                // Se non c'è chiusura precedente ma ci sono mesi anteriori con eventi,
                // devo processare tutti gli eventi fino al mese precedente
                var primoGiorno = anno + '-' + String(mese).padStart(2, '0') + '-01';
                var carichiPre = await ENI.API.getAll(T.CARICHI, {
                    filters: [
                        { op: 'eq', col: 'prodotto_id', val: prod.id },
                        { op: 'lt', col: 'data', val: primoGiorno }
                    ],
                    order: { col: 'data', asc: true }
                }) || [];

                var venditeProdPre = await ENI.API.getAll(T.VENDITE_PROD, {
                    filters: [{ op: 'eq', col: 'prodotto_id', val: prod.id }]
                }) || [];

                var conguagliPre = await ENI.API.getAll(T.CONGUAGLI, {
                    filters: [
                        { op: 'eq', col: 'prodotto_id', val: prod.id },
                        { op: 'lt', col: 'data', val: primoGiorno }
                    ],
                    order: { col: 'data', asc: true }
                }) || [];

                // Costruisci eventi pre-mese
                var eventiPre = [];
                carichiPre.forEach(function(c) {
                    eventiPre.push({
                        tipo: 'carico', data: c.data,
                        litri_fisici: parseFloat(c.litri_fisici) || 0,
                        litri_fiscali: parseFloat(c.litri_fiscali) || 0,
                        prezzo_mp: parseFloat(c.prezzo_mp) || 0,
                        accisa: parseFloat(c.accisa) || 0
                    });
                });

                // Vendite pre-mese con date
                for (var vi = 0; vi < venditeProdPre.length; vi++) {
                    var vp = venditeProdPre[vi];
                    try {
                        var vendita = await ENI.API.getById(T.VENDITE, vp.vendita_id);
                        if (vendita && vendita.data_inizio < primoGiorno) {
                            eventiPre.push({
                                tipo: 'vendita', data: vendita.data_inizio,
                                litri: parseFloat(vp.litri) || 0,
                                prezzo_pompa: parseFloat(vp.prezzo_pompa) || 0
                            });
                        }
                    } catch(e) { /* vendita non trovata */ }
                }

                conguagliPre.forEach(function(cg) {
                    eventiPre.push({
                        tipo: 'conguaglio', data: cg.data,
                        importo_mp: parseFloat(cg.importo_mp) || 0
                    });
                });

                eventiPre.sort(function(a, b) { return a.data < b.data ? -1 : a.data > b.data ? 1 : 0; });

                if (eventiPre.length > 0) {
                    var statoPre = ENI.Calcoli.calcolaStatoProdotto(
                        giacIniz, costoIniz, eventiPre, prod.ha_pc,
                        parseFloat(_config.margine_target) || 0.05
                    );
                    giacIniz = statoPre.giacenza_teorica;
                    costoIniz = statoPre.costo_medio;
                }
            }
        }

        // Ora carica gli eventi SOLO del mese richiesto
        var primoG = anno + '-' + String(mese).padStart(2, '0') + '-01';
        var ultimoD = new Date(anno, mese, 0);
        var ultimoG = ultimoD.getFullYear() + '-' + String(ultimoD.getMonth() + 1).padStart(2, '0') + '-' + String(ultimoD.getDate()).padStart(2, '0');

        var carichi = await ENI.API.getAll(T.CARICHI, {
            filters: [
                { op: 'eq', col: 'prodotto_id', val: prod.id },
                { op: 'gte', col: 'data', val: primoG },
                { op: 'lte', col: 'data', val: ultimoG }
            ],
            order: { col: 'data', asc: true }
        }) || [];

        var venditeProd = await ENI.API.getAll(T.VENDITE_PROD, {
            filters: [{ op: 'eq', col: 'prodotto_id', val: prod.id }]
        }) || [];

        var conguagli = await ENI.API.getAll(T.CONGUAGLI, {
            filters: [
                { op: 'eq', col: 'prodotto_id', val: prod.id },
                { op: 'gte', col: 'data', val: primoG },
                { op: 'lte', col: 'data', val: ultimoG }
            ],
            order: { col: 'data', asc: true }
        }) || [];

        var eventi = [];
        var litriCaricati = 0;
        carichi.forEach(function(c) {
            litriCaricati += parseFloat(c.litri_fisici) || 0;
            eventi.push({
                tipo: 'carico', data: c.data,
                litri_fisici: parseFloat(c.litri_fisici) || 0,
                litri_fiscali: parseFloat(c.litri_fiscali) || 0,
                prezzo_mp: parseFloat(c.prezzo_mp) || 0,
                accisa: parseFloat(c.accisa) || 0
            });
        });

        // Vendite del mese
        for (var j = 0; j < venditeProd.length; j++) {
            var vpj = venditeProd[j];
            try {
                var vend = await ENI.API.getById(T.VENDITE, vpj.vendita_id);
                if (vend && vend.data_inizio >= primoG && vend.data_inizio <= ultimoG) {
                    eventi.push({
                        tipo: 'vendita', data: vend.data_inizio,
                        litri: parseFloat(vpj.litri) || 0,
                        prezzo_pompa: parseFloat(vpj.prezzo_pompa) || 0
                    });
                }
            } catch(e) { /* skip */ }
        }

        conguagli.forEach(function(cg) {
            eventi.push({
                tipo: 'conguaglio', data: cg.data,
                importo_mp: parseFloat(cg.importo_mp) || 0
            });
        });

        eventi.sort(function(a, b) { return a.data < b.data ? -1 : a.data > b.data ? 1 : 0; });

        var stato = ENI.Calcoli.calcolaStatoProdotto(
            giacIniz, costoIniz, eventi, prod.ha_pc,
            parseFloat(_config.margine_target) || 0.05
        );

        return {
            giacenza_inizio: giacIniz,
            costo_medio_inizio: costoIniz,
            giacenza_teorica: stato.giacenza_teorica,
            costo_medio: stato.costo_medio,
            margine_totale: stato.margine_accumulato,
            margine_medio_lt: stato.litri_venduti_tot > 0 ? Math.round((stato.margine_accumulato / stato.litri_venduti_tot) * 1000000) / 1000000 : 0,
            litri_venduti: stato.litri_venduti_tot,
            litri_caricati: litriCaricati,
            pc_maturato: stato.pc_maturato
        };
    }

    // Render tab Chiusure
    async function _renderChiusure(container) {
        var oggi = new Date();
        if (!_chiusureMese) _chiusureMese = { anno: oggi.getFullYear(), mese: oggi.getMonth() + 1 };
        if (!_chiusurePeriodo) _chiusurePeriodo = { daAnno: oggi.getFullYear(), daMese: 1, aAnno: oggi.getFullYear(), aMese: oggi.getMonth() + 1 };

        // Carica chiusure esistenti
        var chiusure = await ENI.API.getAll(T.CHIUSURE, {
            order: { col: 'anno', asc: false }
        }) || [];

        var html = '';

        // ---- SEZIONE 1: CHIUDI MESE ----
        html += '<div class="card" style="margin-bottom:var(--space-3);">' +
            '<div class="card-body">' +
            '<h3 style="margin-bottom:var(--space-2);">Chiudi Mese</h3>' +
            '<div style="display:flex; gap:var(--space-2); align-items:center; margin-bottom:var(--space-3); flex-wrap:wrap;">' +
                '<select id="mc-chius-mese" class="form-select" style="min-width:130px;">';
        for (var m = 0; m < 12; m++) {
            html += '<option value="' + (m + 1) + '"' + (m + 1 === _chiusureMese.mese ? ' selected' : '') + '>' + MESI[m] + '</option>';
        }
        html += '</select>' +
                '<select id="mc-chius-anno" class="form-select" style="min-width:90px;">';
        for (var a = 2024; a <= oggi.getFullYear() + 1; a++) {
            html += '<option value="' + a + '"' + (a === _chiusureMese.anno ? ' selected' : '') + '>' + a + '</option>';
        }
        html += '</select>' +
                '<button class="btn btn-sm btn-outline" id="mc-chius-anteprima">Calcola Anteprima</button>' +
            '</div>' +
            '<div id="mc-chius-preview"></div>' +
            '</div></div>';

        // ---- SEZIONE 2: STORICO CHIUSURE ----
        html += '<div class="card" style="margin-bottom:var(--space-3);">' +
            '<div class="card-body">' +
            '<h3 style="margin-bottom:var(--space-2);">Storico Chiusure</h3>';

        if (chiusure.length === 0) {
            html += '<p class="empty-state-text">Nessuna chiusura mensile registrata.</p>';
        } else {
            // Raggruppa per anno-mese
            var gruppi = {};
            chiusure.forEach(function(c) {
                var key = c.anno + '-' + String(c.mese).padStart(2, '0');
                if (!gruppi[key]) gruppi[key] = { anno: c.anno, mese: c.mese, righe: [] };
                gruppi[key].righe.push(c);
            });

            var keys = Object.keys(gruppi).sort().reverse();
            keys.forEach(function(key) {
                var g = gruppi[key];
                html += '<div style="margin-bottom:var(--space-3);">' +
                    '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:var(--space-1);">' +
                        '<h4 style="color:var(--color-primary);">' + MESI[g.mese - 1] + ' ' + g.anno + '</h4>' +
                        '<button class="btn btn-sm btn-outline mc-chius-riapri" data-anno="' + g.anno + '" data-mese="' + g.mese + '" style="color:var(--color-danger); border-color:var(--color-danger);">Riapri Mese</button>' +
                    '</div>' +
                    '<div style="overflow-x:auto;">' +
                    '<table class="table cm-table-compact"><thead><tr>' +
                        '<th>Prodotto</th>' +
                        '<th class="text-right">Giac. Inizio</th>' +
                        '<th class="text-right">Caricati</th>' +
                        '<th class="text-right">Venduti</th>' +
                        '<th class="text-right">Giac. Teorica</th>' +
                        '<th class="text-right">Giac. Reale</th>' +
                        '<th class="text-right">Scarto</th>' +
                        '<th class="text-right">Costo Medio</th>' +
                        '<th class="text-right">Margine Tot.</th>' +
                        '<th class="text-right">Marg./lt</th>' +
                    '</tr></thead><tbody>';

                g.righe.forEach(function(r) {
                    var nomeProd = _prodotti.find(function(p) { return p.id === r.prodotto_id; });
                    var scartoStile = Math.abs(r.scarto) > 0 ? ' style="color:var(--color-danger);"' : '';
                    html += '<tr>' +
                        '<td><strong>' + (nomeProd ? nomeProd.nome : r.prodotto_id) + '</strong></td>' +
                        '<td class="text-right">' + _fmt(r.giacenza_inizio, 2) + '</td>' +
                        '<td class="text-right">' + _fmt(r.litri_caricati, 2) + '</td>' +
                        '<td class="text-right">' + _fmt(r.litri_venduti, 2) + '</td>' +
                        '<td class="text-right">' + _fmt(r.giacenza_teorica, 2) + '</td>' +
                        '<td class="text-right"><strong>' + _fmt(r.giacenza_reale, 2) + '</strong></td>' +
                        '<td class="text-right"' + scartoStile + '>' + _fmt(r.scarto, 2) + '</td>' +
                        '<td class="text-right">' + _fmtEuro4(r.costo_medio) + '</td>' +
                        '<td class="text-right"><strong>' + _fmtEuro(r.margine_totale) + '</strong></td>' +
                        '<td class="text-right">' + _fmtEuro4(r.margine_medio_lt) + '</td>' +
                    '</tr>';
                });

                html += '</tbody></table></div></div>';
            });
        }
        html += '</div></div>';

        // ---- SEZIONE 3: RIEPILOGO PERIODO ----
        html += '<div class="card">' +
            '<div class="card-body">' +
            '<h3 style="margin-bottom:var(--space-2);">Riepilogo Periodo</h3>' +
            '<div style="display:flex; gap:var(--space-2); align-items:center; margin-bottom:var(--space-3); flex-wrap:wrap;">' +
                '<span style="font-size:0.85rem; color:var(--text-secondary);">Da:</span>' +
                '<select id="mc-per-da-mese" class="form-select" style="min-width:110px;">';
        for (var pm = 0; pm < 12; pm++) {
            html += '<option value="' + (pm + 1) + '"' + (pm + 1 === _chiusurePeriodo.daMese ? ' selected' : '') + '>' + MESI[pm] + '</option>';
        }
        html += '</select>' +
                '<select id="mc-per-da-anno" class="form-select" style="min-width:80px;">';
        for (var pa = 2024; pa <= oggi.getFullYear() + 1; pa++) {
            html += '<option value="' + pa + '"' + (pa === _chiusurePeriodo.daAnno ? ' selected' : '') + '>' + pa + '</option>';
        }
        html += '</select>' +
                '<span style="font-size:0.85rem; color:var(--text-secondary);">A:</span>' +
                '<select id="mc-per-a-mese" class="form-select" style="min-width:110px;">';
        for (var pm2 = 0; pm2 < 12; pm2++) {
            html += '<option value="' + (pm2 + 1) + '"' + (pm2 + 1 === _chiusurePeriodo.aMese ? ' selected' : '') + '>' + MESI[pm2] + '</option>';
        }
        html += '</select>' +
                '<select id="mc-per-a-anno" class="form-select" style="min-width:80px;">';
        for (var pa2 = 2024; pa2 <= oggi.getFullYear() + 1; pa2++) {
            html += '<option value="' + pa2 + '"' + (pa2 === _chiusurePeriodo.aAnno ? ' selected' : '') + '>' + pa2 + '</option>';
        }
        html += '</select>' +
                '<button class="btn btn-sm btn-outline" id="mc-per-calcola">Calcola</button>' +
            '</div>' +
            '<div id="mc-per-result"></div>' +
            '</div></div>';

        container.innerHTML = html;

        // ---- EVENTI ----
        document.getElementById('mc-chius-anteprima').addEventListener('click', function() {
            _chiusureMese.mese = parseInt(document.getElementById('mc-chius-mese').value);
            _chiusureMese.anno = parseInt(document.getElementById('mc-chius-anno').value);
            _mostraAnteprimaChiusura();
        });

        document.getElementById('mc-per-calcola').addEventListener('click', function() {
            _chiusurePeriodo.daMese = parseInt(document.getElementById('mc-per-da-mese').value);
            _chiusurePeriodo.daAnno = parseInt(document.getElementById('mc-per-da-anno').value);
            _chiusurePeriodo.aMese = parseInt(document.getElementById('mc-per-a-mese').value);
            _chiusurePeriodo.aAnno = parseInt(document.getElementById('mc-per-a-anno').value);
            _calcolaRiepilogoPeriodo();
        });

        // Riapertura
        container.querySelectorAll('.mc-chius-riapri').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var annoR = parseInt(this.dataset.anno);
                var meseR = parseInt(this.dataset.mese);
                _riapriMese(annoR, meseR);
            });
        });
    }

    // Mostra anteprima chiusura mese
    async function _mostraAnteprimaChiusura() {
        var preview = document.getElementById('mc-chius-preview');
        if (!preview) return;
        preview.innerHTML = '<div style="text-align:center; padding:var(--space-3);"><div class="spinner"></div></div>';

        var anno = _chiusureMese.anno;
        var mese = _chiusureMese.mese;

        // Verifica se mese già chiuso
        var esistenti = await ENI.API.getAll(T.CHIUSURE, {
            filters: [{ op: 'eq', col: 'anno', val: anno }, { op: 'eq', col: 'mese', val: mese }]
        }) || [];

        var giaChiuso = esistenti.length > 0;

        var html = '';
        if (giaChiuso) {
            html += '<div style="background:var(--color-success-bg, #e8f5e9); border:1px solid var(--color-success, #4CAF50); border-radius:var(--radius-md); padding:var(--space-2); margin-bottom:var(--space-2); color:var(--color-success, #2E7D32);">' +
                '<strong>' + MESI[mese - 1] + ' ' + anno + '</strong> è già chiuso. Se salvi, i dati verranno aggiornati.' +
            '</div>';
        }

        html += '<div style="overflow-x:auto;">' +
            '<table class="table cm-table-compact"><thead><tr>' +
                '<th>Prodotto</th>' +
                '<th class="text-right">Giac. Inizio</th>' +
                '<th class="text-right">Caricati</th>' +
                '<th class="text-right">Venduti</th>' +
                '<th class="text-right">Giac. Teorica</th>' +
                '<th class="text-right">Costo Medio</th>' +
                '<th class="text-right">Margine Tot.</th>' +
                '<th class="text-right">Marg./lt</th>' +
                '<th>Giacenza Reale</th>' +
            '</tr></thead><tbody>';

        for (var i = 0; i < _prodotti.length; i++) {
            var prod = _prodotti[i];
            var stato = await _calcolaStatoMese(prod, anno, mese);

            // Se già chiuso, pre-popola giacenza reale
            var giacRealeVal = '';
            if (giaChiuso) {
                var chiusuraProd = esistenti.find(function(e) { return e.prodotto_id === prod.id; });
                if (chiusuraProd) giacRealeVal = chiusuraProd.giacenza_reale;
            }

            var margColor = stato.margine_medio_lt > 0.07 ? 'color:var(--color-success);' : stato.margine_medio_lt > 0.04 ? '' : 'color:var(--color-danger);';

            html += '<tr>' +
                '<td><strong>' + prod.nome + '</strong></td>' +
                '<td class="text-right">' + _fmt(stato.giacenza_inizio, 2) + '</td>' +
                '<td class="text-right">' + _fmt(stato.litri_caricati, 2) + '</td>' +
                '<td class="text-right">' + _fmt(stato.litri_venduti, 2) + '</td>' +
                '<td class="text-right">' + _fmt(stato.giacenza_teorica, 2) + '</td>' +
                '<td class="text-right">' + _fmtEuro4(stato.costo_medio) + '</td>' +
                '<td class="text-right"><strong>' + _fmtEuro(stato.margine_totale) + '</strong></td>' +
                '<td class="text-right" style="' + margColor + '">' + _fmtEuro4(stato.margine_medio_lt) + '</td>' +
                '<td><input type="number" step="0.01" class="form-input mc-chius-giac-reale" ' +
                    'data-prod="' + prod.id + '" ' +
                    'data-giac-teorica="' + stato.giacenza_teorica + '" ' +
                    'data-costo-medio="' + stato.costo_medio + '" ' +
                    'data-giac-inizio="' + stato.giacenza_inizio + '" ' +
                    'data-litri-caricati="' + stato.litri_caricati + '" ' +
                    'data-litri-venduti="' + stato.litri_venduti + '" ' +
                    'data-margine-totale="' + stato.margine_totale + '" ' +
                    'data-margine-medio="' + stato.margine_medio_lt + '" ' +
                    'data-pc-maturato="' + stato.pc_maturato + '" ' +
                    'value="' + giacRealeVal + '" ' +
                    'placeholder="Litri reali" style="width:120px;"></td>' +
            '</tr>';
        }

        html += '</tbody></table></div>';

        // Note e bottone salva
        html += '<div style="margin-top:var(--space-2); display:flex; gap:var(--space-2); align-items:flex-end; flex-wrap:wrap;">' +
            '<div class="form-group" style="flex:1; min-width:200px; margin-bottom:0;">' +
                '<label class="form-label">Note (opzionale)</label>' +
                '<input type="text" class="form-input" id="mc-chius-note" placeholder="Es. conteggio fisico cisterne">' +
            '</div>' +
            '<button class="btn btn-primary" id="mc-chius-salva">Chiudi ' + MESI[mese - 1] + ' ' + anno + '</button>' +
        '</div>';

        preview.innerHTML = html;

        // Evento salva
        document.getElementById('mc-chius-salva').addEventListener('click', function() {
            _salvaChiusuraMese(anno, mese);
        });
    }

    // Salva chiusura mese
    async function _salvaChiusuraMese(anno, mese) {
        var inputs = document.querySelectorAll('.mc-chius-giac-reale');
        var note = (document.getElementById('mc-chius-note') || {}).value || '';
        var errori = [];

        inputs.forEach(function(inp) {
            if (!inp.value && inp.value !== '0') {
                var nomeProd = _prodotti.find(function(p) { return p.id === inp.dataset.prod; });
                errori.push((nomeProd ? nomeProd.nome : inp.dataset.prod) + ': giacenza reale mancante');
            }
        });

        if (errori.length > 0) {
            ENI.UI.error('Compila la giacenza reale per tutti i prodotti:\n' + errori.join('\n'));
            return;
        }

        try {
            for (var i = 0; i < inputs.length; i++) {
                var inp = inputs[i];
                var giacReale = parseFloat(inp.value) || 0;
                var giacTeorica = parseFloat(inp.dataset.giacTeorica) || 0;

                await ENI.API.getClient().from(T.CHIUSURE).upsert({
                    prodotto_id: inp.dataset.prod,
                    anno: anno,
                    mese: mese,
                    giacenza_inizio: parseFloat(inp.dataset.giacInizio) || 0,
                    giacenza_teorica: giacTeorica,
                    giacenza_reale: giacReale,
                    scarto: Math.round((giacReale - giacTeorica) * 100) / 100,
                    costo_medio: parseFloat(inp.dataset.costoMedio) || 0,
                    litri_caricati: parseFloat(inp.dataset.litriCaricati) || 0,
                    litri_venduti: parseFloat(inp.dataset.litriVenduti) || 0,
                    margine_totale: parseFloat(inp.dataset.margineTotale) || 0,
                    margine_medio_lt: parseFloat(inp.dataset.margineMedio) || 0,
                    pc_maturato: parseFloat(inp.dataset.pcMaturato) || 0,
                    note: note
                }, { onConflict: 'prodotto_id,anno,mese' });
            }

            await _ricalcolaStato();
            _renderPage();
            _activeTab = 'chiusure';
            _renderTab();
            ENI.UI.success(MESI[mese - 1] + ' ' + anno + ' chiuso con successo');
        } catch(e) {
            ENI.UI.error('Errore nel salvataggio: ' + e.message);
        }
    }

    // Riapertura mese
    async function _riapriMese(anno, mese) {
        var conferma = confirm('Sei sicuro di voler riaprire ' + MESI[mese - 1] + ' ' + anno + '?\n\nLa chiusura verrà eliminata e il mese tornerà aperto.');
        if (!conferma) return;

        try {
            // Elimina tutte le chiusure di quel mese (tutti i prodotti)
            var chiusure = await ENI.API.getAll(T.CHIUSURE, {
                filters: [{ op: 'eq', col: 'anno', val: anno }, { op: 'eq', col: 'mese', val: mese }]
            }) || [];

            for (var i = 0; i < chiusure.length; i++) {
                await ENI.API.remove(T.CHIUSURE, chiusure[i].id);
            }

            await _ricalcolaStato();
            _renderPage();
            _activeTab = 'chiusure';
            _renderTab();
            ENI.UI.success(MESI[mese - 1] + ' ' + anno + ' riaperto');
        } catch(e) {
            ENI.UI.error('Errore: ' + e.message);
        }
    }

    // Riepilogo periodo
    async function _calcolaRiepilogoPeriodo() {
        var result = document.getElementById('mc-per-result');
        if (!result) return;
        result.innerHTML = '<div style="text-align:center; padding:var(--space-3);"><div class="spinner"></div></div>';

        var da = _chiusurePeriodo;

        // Carica chiusure nel range
        var chiusure = await ENI.API.getAll(T.CHIUSURE) || [];

        // Filtra per periodo
        var filtrate = chiusure.filter(function(c) {
            var cVal = c.anno * 100 + c.mese;
            var daVal = da.daAnno * 100 + da.daMese;
            var aVal = da.aAnno * 100 + da.aMese;
            return cVal >= daVal && cVal <= aVal;
        });

        if (filtrate.length === 0) {
            result.innerHTML = '<p class="empty-state-text">Nessuna chiusura trovata nel periodo selezionato. Chiudi prima i mesi che vuoi analizzare.</p>';
            return;
        }

        // Raggruppa per prodotto
        var perProdotto = {};
        filtrate.forEach(function(c) {
            if (!perProdotto[c.prodotto_id]) {
                perProdotto[c.prodotto_id] = {
                    litri_venduti: 0, litri_caricati: 0,
                    margine_totale: 0, pc_maturato: 0,
                    scarto_totale: 0, mesi: 0
                };
            }
            var pp = perProdotto[c.prodotto_id];
            pp.litri_venduti += parseFloat(c.litri_venduti) || 0;
            pp.litri_caricati += parseFloat(c.litri_caricati) || 0;
            pp.margine_totale += parseFloat(c.margine_totale) || 0;
            pp.pc_maturato += parseFloat(c.pc_maturato) || 0;
            pp.scarto_totale += parseFloat(c.scarto) || 0;
            pp.mesi++;
        });

        var html = '<div style="overflow-x:auto;">' +
            '<table class="table cm-table-compact"><thead><tr>' +
                '<th>Prodotto</th>' +
                '<th class="text-right">Mesi</th>' +
                '<th class="text-right">Lt Caricati</th>' +
                '<th class="text-right">Lt Venduti</th>' +
                '<th class="text-right">Margine Tot.</th>' +
                '<th class="text-right">Margine/lt</th>' +
                '<th class="text-right">PC Maturato</th>' +
                '<th class="text-right">Scarto Tot.</th>' +
            '</tr></thead><tbody>';

        var totMargine = 0, totVenduti = 0, totPC = 0;

        _prodotti.forEach(function(prod) {
            var pp = perProdotto[prod.id];
            if (!pp) return;
            var margLt = pp.litri_venduti > 0 ? pp.margine_totale / pp.litri_venduti : 0;
            totMargine += pp.margine_totale;
            totVenduti += pp.litri_venduti;
            totPC += pp.pc_maturato;

            html += '<tr>' +
                '<td><strong>' + prod.nome + '</strong></td>' +
                '<td class="text-right">' + pp.mesi + '</td>' +
                '<td class="text-right">' + _fmt(pp.litri_caricati, 2) + '</td>' +
                '<td class="text-right">' + _fmt(pp.litri_venduti, 2) + '</td>' +
                '<td class="text-right"><strong>' + _fmtEuro(pp.margine_totale) + '</strong></td>' +
                '<td class="text-right">' + _fmtEuro4(margLt) + '</td>' +
                '<td class="text-right">' + _fmtEuro(pp.pc_maturato) + '</td>' +
                '<td class="text-right">' + _fmt(pp.scarto_totale, 2) + '</td>' +
            '</tr>';
        });

        // Riga totali
        var margLtTot = totVenduti > 0 ? totMargine / totVenduti : 0;
        html += '<tr style="font-weight:700; border-top:2px solid var(--color-primary);">' +
            '<td>TOTALE</td>' +
            '<td></td><td></td>' +
            '<td class="text-right">' + _fmt(totVenduti, 2) + '</td>' +
            '<td class="text-right">' + _fmtEuro(totMargine) + '</td>' +
            '<td class="text-right">' + _fmtEuro4(margLtTot) + '</td>' +
            '<td class="text-right">' + _fmtEuro(totPC) + '</td>' +
            '<td></td>' +
        '</tr>';

        html += '</tbody></table></div>';

        // Periodo label
        var label = MESI[da.daMese - 1] + ' ' + da.daAnno;
        if (da.daMese !== da.aMese || da.daAnno !== da.aAnno) {
            label += ' — ' + MESI[da.aMese - 1] + ' ' + da.aAnno;
        }
        result.innerHTML = '<h4 style="margin-bottom:var(--space-1); color:var(--color-primary);">' + label + '</h4>' + html;
    }

    // ============================================================
    // UTILITY MODALI
    // ============================================================

    function _modal(id, title, body, btnId, btnLabel) {
        return '<div class="modal-backdrop" id="' + id + '">' +
            '<div class="modal" style="max-width:450px;">' +
                '<div class="modal-header"><h3>' + title + '</h3></div>' +
                '<div class="modal-body">' + body + '</div>' +
                '<div class="modal-footer">' +
                    '<button class="btn btn-outline mc-modal-close">Annulla</button>' +
                    '<button class="btn btn-primary" id="' + btnId + '">' + btnLabel + '</button>' +
                '</div>' +
            '</div>' +
        '</div>';
    }

    function _openModal(html, id) {
        document.body.insertAdjacentHTML('beforeend', html);
        var el = document.getElementById(id);
        requestAnimationFrame(function() { el.classList.add('active'); });
        el.querySelector('.mc-modal-close').addEventListener('click', function() { el.remove(); });
        // Non chiudere cliccando fuori per evitare perdita dati
    }

    function _closeModal(id) {
        var el = document.getElementById(id);
        if (el) el.remove();
    }

    function _formField(label, id, type, value, step) {
        return '<div class="form-group"><label class="form-label">' + label + '</label>' +
            '<input type="' + type + '" class="form-input" id="' + id + '" value="' + (value || '') + '"' +
            (step ? ' step="' + step + '"' : '') + '></div>';
    }

    // ============================================================
    // UTILITY FORMATTAZIONE
    // ============================================================

    function _fmtEuro(n) { return new Intl.NumberFormat('it-IT', { style:'currency', currency:'EUR' }).format(n || 0); }
    function _fmtEuro4(n) { return new Intl.NumberFormat('it-IT', { style:'currency', currency:'EUR', minimumFractionDigits:4, maximumFractionDigits:4 }).format(n || 0); }
    function _fmtEuro5(n) { return (n || 0).toFixed(5).replace('.', ',') + ' \u20AC'; }
    function _fmt(n, d) { return new Intl.NumberFormat('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n || 0); }
    function _fmtData(d) { if (!d) return ''; var p = d.split('-'); return p[2]+'/'+p[1]+'/'+p[0]; }
    function _todayStr() { var d = new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }

    // ============================================================
    // API PUBBLICA
    // ============================================================

    return { render: render };
})();
