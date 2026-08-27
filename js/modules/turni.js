// ============================================================
// GESTIONALE ENI - Gestione Personale: Turni
// Due viste: Pianificazione (settimana modificabile) e Storico
// (settimane passate, sola lettura). Solo Super Admin.
// ============================================================

var ENI = ENI || {};
ENI.Modules = ENI.Modules || {};

ENI.Modules.Turni = (function() {
    'use strict';

    var _personale = [];
    var _turni = {};   // key personale_id|data -> turno (settimana visualizzata)
    var _ferie = {};   // key personale_id|data -> {tipo}
    var _disp = {};    // key personale_id|data -> disponibilita
    var _FASCE_LBL = { indifferente: 'Indiff.', mattina: '🌅 Matt.', pomeriggio: '🌇 Pom.', spezzato: '🔀 Spezz.' };
    var _lunedi = null;          // settimana in Pianificazione
    var _vista = 'pianificazione';
    var _storicoLunedi = null;   // settimana aperta dallo Storico (null = elenco)

    var GIORNI = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab']; // stazione aperta Lun–Sab
    var N_GIORNI = 6;
    var MODELLI = [
        { id: 'mattina',    label: '🌅 Mattina',    oi: '07:30', of: '13:30' },
        { id: 'pomeriggio', label: '🌇 Pomeriggio', oi: '13:30', of: '19:30' },
        { id: 'riposo',     label: '😴 Riposo',     oi: null,    of: null }
    ];
    var COLORI = {
        mattina:    'rgba(42,120,214,0.15)',
        pomeriggio: 'rgba(235,104,52,0.15)',
        spezzato:   'rgba(147,51,234,0.14)',
        riposo:     'rgba(0,0,0,0.05)',
        turno:      'rgba(27,175,122,0.15)'
    };

    function _parse(iso) { var p = String(iso).split('-'); return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])); }
    function _toISO(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
    function _addG(iso, n) { var d = _parse(iso); d.setDate(d.getDate() + n); return _toISO(d); }
    function _dow(iso) { return _parse(iso).getDay(); }
    function _mondayOf(iso) { var d = _dow(iso); var off = (d === 0) ? 6 : (d - 1); return _addG(iso, -off); }
    function _oggi() { return ENI.UI.oggiISO(); }
    function _fmtBreve(iso) { var p = String(iso).split('-'); return p[2] + '/' + p[1]; }
    function _k(pid, data) { return pid + '|' + data; }

    async function render(container) {
        container.innerHTML = '<div class="flex justify-center" style="padding:2rem;"><div class="spinner"></div></div>';
        try {
            _personale = (await ENI.API.getPersonale() || []).filter(function(p) { return p.attivo !== false; });
        } catch (e) {
            container.innerHTML = '<div class="empty-state"><p class="empty-state-text">Errore: ' + ENI.UI.escapeHtml(e.message) + '</p></div>';
            return;
        }
        if (!_lunedi) _lunedi = _mondayOf(_oggi());

        container.innerHTML =
            '<div class="page-header"><h1 class="page-title">🗓️ Turni</h1></div>' +
            '<div class="filter-chips" id="tur-view" style="margin-bottom:var(--space-3);">' +
                '<button class="chip' + (_vista === 'pianificazione' ? ' active' : '') + '" data-v="pianificazione">🗓️ Pianificazione</button>' +
                '<button class="chip' + (_vista === 'storico' ? ' active' : '') + '" data-v="storico">🗄️ Storico</button>' +
            '</div>' +
            '<div id="tur-content"></div>';

        var vbar = container.querySelector('#tur-view');
        vbar.addEventListener('click', function(e) {
            var b = e.target.closest('[data-v]');
            if (!b) return;
            _vista = b.getAttribute('data-v');
            if (_vista === 'storico') _storicoLunedi = null;
            vbar.querySelectorAll('[data-v]').forEach(function(x) { x.classList.toggle('active', x.getAttribute('data-v') === _vista); });
            _renderVista();
        });

        _renderVista();
    }

    function _renderVista() {
        var content = document.getElementById('tur-content');
        if (!content) return;
        if (_vista === 'storico') {
            if (_storicoLunedi) _renderStoricoWeek(content);
            else _renderStoricoList(content);
        } else {
            _renderPianificazione(content);
        }
    }

    // ---- Caricamento dati di una settimana ----
    async function _loadWeek(lunedi) {
        var da = lunedi, a = _addG(lunedi, 6);
        var turni = await ENI.API.getTurni(da, a);
        _turni = {};
        turni.forEach(function(t) { _turni[_k(t.personale_id, t.data)] = t; });
        _ferie = {};
        var richieste = await ENI.API.getRichiesteFerie({ stato: 'approvata' });
        richieste.forEach(function(r) {
            if (r.data_fine < da || r.data_inizio > a) return;
            var d = r.data_inizio;
            while (d <= r.data_fine) {
                if (d >= da && d <= a) _ferie[_k(r.personale_id, d)] = { tipo: r.tipo };
                d = _addG(d, 1);
            }
        });
        _disp = {};
        var disp = await ENI.API.getDisponibilita(da, a);
        disp.forEach(function(x) { _disp[_k(x.personale_id, x.data)] = x; });
    }

    // ---- Vista PIANIFICAZIONE ----
    async function _renderPianificazione(content) {
        content.innerHTML =
            '<div style="display:flex;align-items:center;gap:8px;margin-bottom:var(--space-3);flex-wrap:wrap;">' +
                '<button class="btn btn-outline btn-sm" id="tur-prev">‹ Precedente</button>' +
                '<button class="btn btn-outline btn-sm" id="tur-next">Successiva ›</button>' +
                '<div id="tur-range" style="font-weight:600;margin-left:6px;"></div>' +
                '<div style="flex:1;"></div>' +
                '<button class="btn btn-primary btn-sm" id="tur-compila">⚙️ Compila settimana</button>' +
                '<button class="btn btn-outline btn-sm" id="tur-pdf">📄 Salva PDF</button>' +
                '<button class="btn btn-outline btn-sm" id="tur-copia">📋 Copia sett. prec.</button>' +
            '</div>' +
            '<div id="tur-grid"><div class="flex justify-center" style="padding:2rem;"><div class="spinner"></div></div></div>';

        content.querySelector('#tur-prev').addEventListener('click', function() { _lunedi = _addG(_lunedi, -7); _refreshPianificazione(); });
        content.querySelector('#tur-next').addEventListener('click', function() { _lunedi = _addG(_lunedi, 7); _refreshPianificazione(); });
        content.querySelector('#tur-copia').addEventListener('click', _copiaSettimana);
        content.querySelector('#tur-compila').addEventListener('click', _compilaSettimana);
        content.querySelector('#tur-pdf').addEventListener('click', _salvaPdf);

        await _refreshPianificazione();
    }

    async function _refreshPianificazione() {
        var rangeEl = document.getElementById('tur-range');
        if (rangeEl) rangeEl.textContent = 'Settimana ' + _fmtBreve(_lunedi) + ' – ' + _fmtBreve(_addG(_lunedi, 6));
        var gridEl = document.getElementById('tur-grid');
        if (gridEl) gridEl.innerHTML = '<div class="flex justify-center" style="padding:2rem;"><div class="spinner"></div></div>';
        try {
            await _loadWeek(_lunedi);
        } catch (e) {
            if (gridEl) gridEl.innerHTML = '<div class="empty-state"><p class="empty-state-text">Errore: ' + ENI.UI.escapeHtml(e.message) + '</p></div>';
            return;
        }
        _renderGrid(gridEl, _lunedi, false);
    }

    // ---- Vista STORICO (elenco settimane passate) ----
    async function _renderStoricoList(content) {
        content.innerHTML = '<div class="flex justify-center" style="padding:2rem;"><div class="spinner"></div></div>';
        var curMon = _mondayOf(_oggi());
        var da = _addG(curMon, -7 * 12), a = _addG(curMon, -1); // ultime 12 settimane passate
        var turni;
        try { turni = await ENI.API.getTurni(da, a); }
        catch (e) { content.innerHTML = '<div class="empty-state"><p class="empty-state-text">Errore: ' + ENI.UI.escapeHtml(e.message) + '</p></div>'; return; }

        var perWeek = {};
        turni.forEach(function(t) {
            var m = _mondayOf(t.data);
            if (!perWeek[m]) perWeek[m] = { count: 0, gente: {} };
            if (t.tipo !== 'riposo') perWeek[m].count++;
            perWeek[m].gente[t.personale_id] = true;
        });
        var weeks = Object.keys(perWeek).sort().reverse();

        if (!weeks.length) {
            content.innerHTML = '<div class="empty-state" style="padding:2.5rem 1rem;"><div class="empty-state-icon">🗄️</div><p class="empty-state-text">Nessuna settimana passata con turni</p></div>';
            return;
        }

        content.innerHTML =
            '<div class="text-sm text-muted" style="margin-bottom:var(--space-3);">Ultime settimane pianificate (clicca per rivedere la griglia).</div>' +
            weeks.map(function(m) {
                var w = perWeek[m];
                return '<button class="tur-week-card" data-mon="' + m + '" style="width:100%;text-align:left;cursor:pointer;background:var(--bg-card);border:1px solid var(--color-gray-200);border-radius:var(--radius-md);padding:12px 14px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;gap:10px;">' +
                    '<span style="font-weight:600;">Settimana ' + _fmtBreve(m) + ' – ' + _fmtBreve(_addG(m, 6)) + '</span>' +
                    '<span class="text-sm text-muted">' + w.count + ' turni · ' + Object.keys(w.gente).length + ' persone ›</span>' +
                '</button>';
            }).join('');

        content.querySelectorAll('.tur-week-card').forEach(function(b) {
            b.addEventListener('click', function() { _storicoLunedi = b.getAttribute('data-mon'); _renderVista(); });
        });
    }

    // ---- Vista STORICO (settimana singola, sola lettura) ----
    async function _renderStoricoWeek(content) {
        content.innerHTML =
            '<div style="display:flex;align-items:center;gap:10px;margin-bottom:var(--space-3);flex-wrap:wrap;">' +
                '<button class="btn btn-outline btn-sm" id="tur-back">‹ Torna allo storico</button>' +
                '<div style="font-weight:600;">Settimana ' + _fmtBreve(_storicoLunedi) + ' – ' + _fmtBreve(_addG(_storicoLunedi, 6)) + ' <span class="badge badge-gray">sola lettura</span></div>' +
            '</div>' +
            '<div id="tur-grid"><div class="flex justify-center" style="padding:2rem;"><div class="spinner"></div></div></div>';

        content.querySelector('#tur-back').addEventListener('click', function() { _storicoLunedi = null; _renderVista(); });

        var gridEl = document.getElementById('tur-grid');
        try { await _loadWeek(_storicoLunedi); }
        catch (e) { gridEl.innerHTML = '<div class="empty-state"><p class="empty-state-text">Errore: ' + ENI.UI.escapeHtml(e.message) + '</p></div>'; return; }
        _renderGrid(gridEl, _storicoLunedi, true);
    }

    // CSS responsive della griglia (iniettato una sola volta)
    function _ensureCss() {
        if (document.getElementById('turni-css')) return;
        var s = document.createElement('style');
        s.id = 'turni-css';
        s.textContent =
            '.turni-grid-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;}' +
            '.turni-grid{min-width:700px;}' +
            '.turni-grid td{min-width:78px;}' +
            '.turni-grid th:first-child,.turni-grid td:first-child{position:sticky;left:0;z-index:2;box-shadow:2px 0 5px -2px rgba(0,0,0,.25);}' +
            '@media(max-width:768px){' +
                '.turni-grid{min-width:520px;font-size:.78rem;}' +
                '.turni-grid th,.turni-grid td{padding:4px 3px;}' +
                '.turni-grid td{min-width:70px;}' +
                '.turni-grid th:first-child,.turni-grid td:first-child{min-width:74px;max-width:96px;white-space:normal!important;line-height:1.15;font-size:.74rem;}' +
                '.turni-grid .text-xs{font-size:.7rem;line-height:1.2;}' +
            '}';
        document.head.appendChild(s);
    }

    // ---- Griglia (condivisa) ----
    function _renderGrid(gridEl, lunedi, readonly) {
        if (!gridEl) return;
        _ensureCss();
        if (!_personale.length) {
            gridEl.innerHTML = '<div class="empty-state"><p class="empty-state-text">Nessun dipendente attivo</p></div>';
            return;
        }
        var oggi = _oggi();
        var th = '<th style="text-align:left;position:sticky;left:0;background:var(--bg-secondary);z-index:1;">Dipendente</th>';
        for (var i = 0; i < N_GIORNI; i++) {
            var dt = _addG(lunedi, i);
            th += '<th style="' + (dt === oggi ? 'background:var(--color-primary-light,#e8f0fe);' : '') + '">' + GIORNI[i] + '<br><span class="text-xs">' + _fmtBreve(dt) + '</span></th>';
        }
        var rows = _personale.map(function(p) {
            var cells = '';
            for (var i = 0; i < N_GIORNI; i++) cells += _cellHtml(p, _addG(lunedi, i), readonly);
            return '<tr><td style="text-align:left;font-weight:600;position:sticky;left:0;background:var(--bg-card);z-index:1;">' + ENI.UI.escapeHtml(p.nome_completo) + '</td>' + cells + '</tr>';
        }).join('');

        gridEl.innerHTML =
            '<div class="table-wrapper turni-grid-wrap">' +
                '<table class="table turni-grid" style="text-align:center;">' +
                    '<thead><tr>' + th + '</tr></thead><tbody>' + rows + '</tbody>' +
                '</table>' +
            '</div>' +
            (readonly ? '' : '<div class="text-xs text-muted" style="margin-top:8px;line-height:1.7;">' +
                'Clicca una cella per assegnare il turno. &nbsp; ' +
                '<b>07:30–13:30</b> = turno assegnato · ' +
                '<span style="font-style:italic;">grigio corsivo</span> = disponibilità indicata dal dipendente (da assegnare) · ' +
                '🌴 ferie/permesso · <span style="color:#b91c1c;">indisp.</span> = non disponibile' +
            '</div>');

        if (!readonly) {
            gridEl.querySelectorAll('[data-cell]').forEach(function(cell) {
                cell.addEventListener('click', function() {
                    var p = _personale.filter(function(x) { return x.id === cell.getAttribute('data-pid'); })[0];
                    _cellModal(p, cell.getAttribute('data-data'));
                });
            });
        }
    }

    function _cellHtml(p, dt, readonly) {
        var t = _turni[_k(p.id, dt)];
        var f = _ferie[_k(p.id, dt)];
        var d = _disp[_k(p.id, dt)];
        var bg = t ? (COLORI[t.tipo] || COLORI.turno) : '';
        var contenuto = '';

        if (f) {
            var ico = f.tipo === 'permesso' ? '🕐' : (f.tipo === 'malattia' ? '🤒' : '🌴');
            contenuto += '<div class="text-xs" style="color:#b45309;font-weight:600;">' + ico + ' ' + (f.tipo === 'ferie' ? 'Ferie' : (f.tipo === 'permesso' ? 'Perm.' : 'Malat.')) + '</div>';
            bg = 'rgba(217,119,6,0.10)';
        }

        if (t) {
            if (t.tipo === 'riposo') {
                contenuto += '<div class="text-xs" style="color:var(--color-gray-500);">Riposo</div>';
            } else {
                contenuto += '<div class="text-xs" style="font-weight:700;">' + (t.ora_inizio ? t.ora_inizio.slice(0, 5) : '') + (t.ora_fine ? '–' + t.ora_fine.slice(0, 5) : '') + '</div>';
                if (t.tipo === 'spezzato' && t.ora_inizio_2) contenuto += '<div class="text-xs" style="font-weight:700;">' + t.ora_inizio_2.slice(0, 5) + (t.ora_fine_2 ? '–' + t.ora_fine_2.slice(0, 5) : '') + '</div>';
            }
            if (t.note) contenuto += '<div class="text-xs" title="' + ENI.UI.escapeHtml(t.note) + '">📝</div>';
        } else if (!f) {
            // Nessun turno: mostra il suggerimento dalla disponibilità (in grigio)
            if (!readonly && d) {
                if (d.disponibile === false) {
                    contenuto += '<div class="text-xs" style="color:#b91c1c;opacity:0.6;">indisp.</div>';
                } else {
                    contenuto += '<div class="text-xs" style="color:var(--color-gray-500);font-style:italic;">' + (_FASCE_LBL[d.fascia] || 'disp.') + '</div>';
                    if (d.note) contenuto += '<div class="text-xs" style="color:#0d7a52;" title="' + ENI.UI.escapeHtml(d.note) + '">📝 ' + ENI.UI.escapeHtml(_trunc(d.note, 16)) + '</div>';
                    bg = 'rgba(27,175,122,0.06)';
                }
            } else {
                contenuto += readonly ? '<span class="text-muted" style="opacity:0.3;">–</span>' : '<span class="text-muted" style="opacity:0.35;">+</span>';
            }
        }

        return '<td ' + (readonly ? '' : 'data-cell data-pid="' + p.id + '" data-data="' + dt + '"') +
            ' style="' + (readonly ? '' : 'cursor:pointer;') + 'background:' + bg + ';">' + contenuto + '</td>';
    }

    // ---- Modale cella (solo Pianificazione) ----
    function _cellModal(p, data) {
        var t = _turni[_k(p.id, data)];
        var f = _ferie[_k(p.id, data)];
        var avviso = f ? '<div class="stock-alert mb-4" style="background:#FEF3C7;border-left-color:#D97706;">🌴 Questo giorno il dipendente ha ferie/permesso approvato.</div>' : '';

        var modelliBtn = MODELLI.map(function(m) {
            return '<button class="btn btn-outline btn-sm tur-modello" data-mod="' + m.id + '" style="margin:3px;">' + m.label + '</button>';
        }).join('');

        var body =
            avviso +
            '<p class="text-sm" style="margin-top:0;"><strong>' + ENI.UI.escapeHtml(p.nome_completo) + '</strong> — ' + _fmtBreve(data) + '</p>' +
            '<div class="form-label" style="margin-bottom:4px;">Modelli rapidi</div>' +
            '<div style="display:flex;flex-wrap:wrap;margin-bottom:12px;">' + modelliBtn + '</div>' +
            '<div class="form-label" style="margin-bottom:4px;">Oppure orario personalizzato</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">' +
                '<div class="form-group"><label class="form-label">Dalle</label><input type="time" class="form-input" id="tur-oi" value="' + (t && t.tipo !== 'riposo' && t.ora_inizio ? t.ora_inizio.slice(0, 5) : '') + '"></div>' +
                '<div class="form-group"><label class="form-label">Alle</label><input type="time" class="form-input" id="tur-of" value="' + (t && t.tipo !== 'riposo' && t.ora_fine ? t.ora_fine.slice(0, 5) : '') + '"></div>' +
            '</div>' +
            '<div class="form-label" style="margin:6px 0 4px;">🔀 2° periodo (per turno spezzato, opzionale)</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">' +
                '<div class="form-group"><label class="form-label">Dalle</label><input type="time" class="form-input" id="tur-oi2" value="' + (t && t.ora_inizio_2 ? t.ora_inizio_2.slice(0, 5) : '') + '"></div>' +
                '<div class="form-group"><label class="form-label">Alle</label><input type="time" class="form-input" id="tur-of2" value="' + (t && t.ora_fine_2 ? t.ora_fine_2.slice(0, 5) : '') + '"></div>' +
            '</div>' +
            '<div class="form-group" style="margin-top:6px;"><label class="form-label">Note (opzionale)</label>' +
                '<textarea class="form-textarea" id="tur-note" rows="2" placeholder="es. copre pausa pranzo">' + (t && t.note ? ENI.UI.escapeHtml(t.note) : '') + '</textarea></div>';

        var footer =
            (t ? '<button class="btn btn-ghost" id="tur-cancella" style="color:var(--color-danger);">Cancella turno</button>' : '') +
            '<button class="btn btn-outline" data-modal-close>Chiudi</button>' +
            '<button class="btn btn-primary" id="tur-salva-custom">Salva orario</button>';

        var modal = ENI.UI.showModal({ title: 'Turno', body: body, footer: footer });

        function _nota() { return (document.getElementById('tur-note') || {}).value || null; }
        modal.querySelectorAll('.tur-modello').forEach(function(b) {
            b.addEventListener('click', function() {
                var m = MODELLI.filter(function(x) { return x.id === b.getAttribute('data-mod'); })[0];
                _salva(p.id, data, { tipo: m.id, ora_inizio: m.oi, ora_fine: m.of, note: _nota() }, modal);
            });
        });
        modal.querySelector('#tur-salva-custom').addEventListener('click', function() {
            var oi = document.getElementById('tur-oi').value, of = document.getElementById('tur-of').value;
            var oi2 = document.getElementById('tur-oi2').value, of2 = document.getElementById('tur-of2').value;
            if (!oi || !of) { ENI.UI.warning('Inserisci orario di inizio e fine'); return; }
            var dati = { tipo: 'turno', ora_inizio: oi, ora_fine: of, note: _nota() };
            if (oi2 && of2) { dati.tipo = 'spezzato'; dati.ora_inizio_2 = oi2; dati.ora_fine_2 = of2; }
            _salva(p.id, data, dati, modal);
        });
        var canc = modal.querySelector('#tur-cancella');
        if (canc) canc.addEventListener('click', async function() {
            try {
                await ENI.API.eliminaTurno(p.id, data);
                ENI.UI.closeModal(modal);
                ENI.UI.success('Turno cancellato');
                await _refreshPianificazione();
            } catch (e) { ENI.UI.error('Errore: ' + e.message); }
        });
    }

    async function _salva(pid, data, dati, modal) {
        try {
            ENI.UI.showLoading();
            await ENI.API.salvaTurno({ personale_id: pid, data: data, tipo: dati.tipo, ora_inizio: dati.ora_inizio, ora_fine: dati.ora_fine, ora_inizio_2: dati.ora_inizio_2, ora_fine_2: dati.ora_fine_2, note: dati.note });
            ENI.UI.hideLoading();
            ENI.UI.closeModal(modal);
            await _refreshPianificazione();
        } catch (e) { ENI.UI.hideLoading(); ENI.UI.error('Errore: ' + e.message); }
    }

    async function _copiaSettimana() {
        var ok = await ENI.UI.confirm({
            title: 'Copia settimana precedente',
            message: 'Copiare i turni della settimana precedente in questa settimana? I turni già presenti verranno sovrascritti.',
            confirmText: 'Copia', cancelText: 'Annulla'
        });
        if (!ok) return;
        try {
            ENI.UI.showLoading();
            var prev = await ENI.API.getTurni(_addG(_lunedi, -7), _addG(_lunedi, -1));
            for (var i = 0; i < prev.length; i++) {
                var t = prev[i];
                await ENI.API.salvaTurno({ personale_id: t.personale_id, data: _addG(t.data, 7), tipo: t.tipo, ora_inizio: t.ora_inizio, ora_fine: t.ora_fine, ora_inizio_2: t.ora_inizio_2, ora_fine_2: t.ora_fine_2, note: t.note });
            }
            ENI.UI.hideLoading();
            ENI.UI.success(prev.length + ' turni copiati');
            await _refreshPianificazione();
        } catch (e) { ENI.UI.hideLoading(); ENI.UI.error('Errore: ' + e.message); }
    }

    // Compila i turni in automatico dalle disponibilità (solo celle vuote, saltando ferie/permessi)
    async function _compilaSettimana() {
        var ok = await ENI.UI.confirm({
            title: 'Compila settimana',
            message: 'Assegno i turni in automatico dalle disponibilità dei dipendenti (solo le celle ancora vuote, saltando chi è in ferie/permesso). Poi potrai correggere a mano.',
            confirmText: 'Compila', cancelText: 'Annulla'
        });
        if (!ok) return;
        try {
            ENI.UI.showLoading();
            var n = 0;
            for (var pi = 0; pi < _personale.length; pi++) {
                var p = _personale[pi];
                for (var i = 0; i < N_GIORNI; i++) {
                    var dt = _addG(_lunedi, i);
                    if (_turni[_k(p.id, dt)]) continue;   // non sovrascrive celle già compilate
                    if (_ferie[_k(p.id, dt)]) continue;   // salta ferie/permessi
                    var d = _disp[_k(p.id, dt)];
                    if (!d) continue;                      // nessuna disponibilità indicata
                    var dati;
                    if (d.disponibile === false) dati = { tipo: 'riposo', ora_inizio: null, ora_fine: null };
                    else if (d.fascia === 'pomeriggio') dati = { tipo: 'pomeriggio', ora_inizio: '13:30', ora_fine: '19:30' };
                    else if (d.fascia === 'spezzato') dati = { tipo: 'spezzato', ora_inizio: '07:30', ora_fine: '12:00', ora_inizio_2: '15:30', ora_fine_2: '19:30' };
                    else dati = { tipo: 'mattina', ora_inizio: '07:30', ora_fine: '13:30' }; // mattina o indifferente
                    await ENI.API.salvaTurno(Object.assign({ personale_id: p.id, data: dt }, dati));
                    n++;
                }
            }
            ENI.UI.hideLoading();
            ENI.UI.success(n + ' turni compilati dalle disponibilità');
            await _refreshPianificazione();
        } catch (e) { ENI.UI.hideLoading(); ENI.UI.error('Errore: ' + e.message); }
    }

    function _trunc(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
    function _cellLines(t, f) {
        if (f) return ['Ferie'];
        if (!t) return [''];
        if (t.tipo === 'riposo') return ['Riposo'];
        var l1 = (t.ora_inizio ? t.ora_inizio.slice(0, 5) : '') + (t.ora_fine ? '-' + t.ora_fine.slice(0, 5) : '');
        var out = [l1];
        if (t.tipo === 'spezzato' && t.ora_inizio_2) out.push(t.ora_inizio_2.slice(0, 5) + (t.ora_fine_2 ? '-' + t.ora_fine_2.slice(0, 5) : ''));
        return out;
    }

    // Esporta la griglia della settimana in PDF (A4 orizzontale)
    function _salvaPdf() {
        var lib = window.jspdf || (typeof jspdf !== 'undefined' ? jspdf : null);
        if (!lib || !lib.jsPDF) { ENI.UI.error('Libreria PDF non disponibile'); return; }
        try {
            var doc = new lib.jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
            var W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
            var x0 = 12, y = 16, colName = 42, colDay = (W - 12 - x0 - colName) / N_GIORNI, rowH = 11;

            doc.setFontSize(14); doc.text('Turni · settimana ' + _fmtBreve(_lunedi) + ' – ' + _fmtBreve(_addG(_lunedi, 6)), x0, y); y += 8;

            function header() {
                doc.setFontSize(9); doc.setFillColor(230, 230, 230);
                doc.rect(x0, y, colName, 8, 'F'); doc.text('Dipendente', x0 + 2, y + 5);
                for (var i = 0; i < N_GIORNI; i++) {
                    var xx = x0 + colName + i * colDay;
                    doc.rect(xx, y, colDay, 8, 'F');
                    doc.text(GIORNI[i] + ' ' + _fmtBreve(_addG(_lunedi, i)), xx + 2, y + 5);
                }
                y += 8;
            }
            header();

            _personale.forEach(function(p) {
                if (y + rowH > H - 10) { doc.addPage(); y = 16; header(); }
                doc.setFontSize(9);
                doc.rect(x0, y, colName, rowH); doc.text(_trunc(p.nome_completo, 26), x0 + 2, y + 6);
                for (var i = 0; i < N_GIORNI; i++) {
                    var xx = x0 + colName + i * colDay, dt = _addG(_lunedi, i);
                    doc.rect(xx, y, colDay, rowH);
                    var lines = _cellLines(_turni[_k(p.id, dt)], _ferie[_k(p.id, dt)]);
                    doc.setFontSize(7.5);
                    lines.forEach(function(ln, idx) { doc.text(ln, xx + 1.5, y + 4.5 + idx * 4); });
                }
                y += rowH;
            });

            doc.save('turni_' + _lunedi + '.pdf');
        } catch (e) { ENI.UI.error('Errore PDF: ' + e.message); }
    }

    return { render: render };
})();
