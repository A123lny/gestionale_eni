// ============================================================
// GESTIONALE ENI - Gestione Personale: Ferie e Permessi
// Lato Super Admin: elenco richieste, approva/rifiuta, nuova richiesta.
// ============================================================

var ENI = ENI || {};
ENI.Modules = ENI.Modules || {};

ENI.Modules.Ferie = (function() {
    'use strict';

    var _richieste = [];
    var _personale = [];
    var _filtro = 'in_attesa';

    var TIPI = {
        ferie:    { label: 'Ferie', icon: '🌴' },
        permesso: { label: 'Permesso', icon: '🕐' },
        malattia: { label: 'Malattia', icon: '🤒' }
    };
    var STATI = {
        in_attesa:  { label: 'In attesa', badge: 'badge-warning' },
        approvata:  { label: 'Approvata', badge: 'badge-success' },
        rifiutata:  { label: 'Rifiutata', badge: 'badge-danger' }
    };

    function _fmtData(iso) { if (!iso) return ''; var p = String(iso).split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
    function _fmtBreve(iso) { var p = String(iso).split('-'); return p[2] + '/' + p[1]; }
    function _oggi() { return ENI.UI.oggiISO(); }
    function _giorni(a, b) { var pa = a.split('-'), pb = b.split('-'); return Math.round((new Date(+pb[0], +pb[1] - 1, +pb[2]) - new Date(+pa[0], +pa[1] - 1, +pa[2])) / 86400000) + 1; }
    function _nome(r) { return (r.personale && r.personale.nome_completo) || '—'; }

    // --- Render principale ---
    async function render(container) {
        container.innerHTML = '<div class="flex justify-center" style="padding:2rem;"><div class="spinner"></div></div>';
        try {
            _personale = await ENI.API.getPersonale() || [];
            _richieste = await ENI.API.getRichiesteFerie() || [];
        } catch (e) {
            container.innerHTML = '<div class="empty-state"><p class="empty-state-text">Errore: ' + ENI.UI.escapeHtml(e.message) + '</p></div>';
            return;
        }
        _renderPage(container);
    }

    function _conteggi() {
        var c = { in_attesa: 0, approvata: 0, rifiutata: 0, giorniFerie: 0 };
        _richieste.forEach(function(r) {
            if (c[r.stato] != null) c[r.stato]++;
            if (r.stato === 'approvata' && r.tipo === 'ferie' && r.giornata_intera) c.giorniFerie += _giorni(r.data_inizio, r.data_fine);
        });
        return c;
    }

    function _renderPage(container) {
        var c = _conteggi();

        var chips = [
            { id: 'in_attesa', label: '⏳ In attesa (' + c.in_attesa + ')' },
            { id: 'approvata', label: '✅ Approvate (' + c.approvata + ')' },
            { id: 'rifiutata', label: '❌ Rifiutate (' + c.rifiutata + ')' },
            { id: 'storico', label: '🗄️ Storico (' + _richieste.length + ')' }
        ];

        container.innerHTML =
            '<div class="page-header">' +
                '<h1 class="page-title">🌴 Ferie e Permessi</h1>' +
                '<button class="btn btn-primary btn-sm" id="fer-nuova">+ Nuova richiesta</button>' +
            '</div>' +
            '<div class="filter-chips" id="fer-filtri" style="margin-bottom:var(--space-3);">' +
                chips.map(function(x) { return '<button class="chip' + (x.id === _filtro ? ' active' : '') + '" data-f="' + x.id + '">' + x.label + '</button>'; }).join('') +
            '</div>' +
            '<div id="fer-lista"></div>';

        container.querySelector('#fer-nuova').addEventListener('click', function() { _formNuova(); });
        var filtri = container.querySelector('#fer-filtri');
        filtri.addEventListener('click', function(e) {
            var b = e.target.closest('[data-f]');
            if (!b) return;
            _filtro = b.getAttribute('data-f');
            filtri.querySelectorAll('[data-f]').forEach(function(x) { x.classList.toggle('active', x.getAttribute('data-f') === _filtro); });
            _renderLista();
        });

        _renderLista();
    }

    function _renderLista() {
        var el = document.getElementById('fer-lista');
        if (!el) return;
        var righe = _richieste.filter(function(r) { return _filtro === 'storico' || r.stato === _filtro; });
        // ordina: le più recenti in cima (già ordinate per data_inizio desc dall'API)

        if (!righe.length) {
            el.innerHTML = '<div class="empty-state" style="padding:2.5rem 1rem;"><div class="empty-state-icon">📋</div><p class="empty-state-text">Nessuna richiesta ' + (_filtro !== 'storico' ? STATI[_filtro].label.toLowerCase() : '') + '</p></div>';
            return;
        }

        el.innerHTML = righe.map(_cardRichiesta).join('');

        // wiring pulsanti
        el.querySelectorAll('[data-approva]').forEach(function(b) {
            b.addEventListener('click', function() { _gestisci(b.getAttribute('data-approva'), 'approvata'); });
        });
        el.querySelectorAll('[data-rifiuta]').forEach(function(b) {
            b.addEventListener('click', function() { _gestisci(b.getAttribute('data-rifiuta'), 'rifiutata'); });
        });
        el.querySelectorAll('[data-elimina]').forEach(function(b) {
            b.addEventListener('click', function() { _elimina(b.getAttribute('data-elimina')); });
        });
    }

    function _periodoTxt(r) {
        var tipo = TIPI[r.tipo] || { icon: '', label: r.tipo };
        if (r.giornata_intera) {
            if (r.data_inizio === r.data_fine) return 'il ' + _fmtData(r.data_inizio);
            var gg = _giorni(r.data_inizio, r.data_fine);
            return 'dal ' + _fmtData(r.data_inizio) + ' al ' + _fmtData(r.data_fine) + ' <span class="text-muted">(' + gg + ' gg)</span>';
        }
        var ore = (r.ora_inizio ? r.ora_inizio.slice(0, 5) : '') + (r.ora_fine ? '–' + r.ora_fine.slice(0, 5) : '');
        return 'il ' + _fmtData(r.data_inizio) + (ore ? ', ore ' + ore : '');
    }

    function _cardRichiesta(r) {
        var tipo = TIPI[r.tipo] || { icon: '', label: r.tipo };
        var stato = STATI[r.stato] || { label: r.stato, badge: 'badge-gray' };
        var inAttesa = r.stato === 'in_attesa';

        var azioni = inAttesa
            ? '<button class="btn btn-sm btn-primary" data-approva="' + r.id + '">✅ Approva</button>' +
              '<button class="btn btn-sm btn-outline" data-rifiuta="' + r.id + '" style="color:var(--color-danger);border-color:var(--color-danger);">❌ Rifiuta</button>'
            : '<button class="btn-icon" data-elimina="' + r.id + '" title="Elimina" style="color:var(--color-danger);"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="pointer-events:none;"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>';

        var risposta = (!inAttesa && r.note_risposta)
            ? '<div class="text-xs text-muted" style="margin-top:6px;font-style:italic;">Nota: ' + ENI.UI.escapeHtml(r.note_risposta) + '</div>'
            : '';

        return '<div style="background:var(--bg-card);border:1px solid var(--color-gray-200);border-radius:var(--radius-md);padding:14px;margin-bottom:10px;">' +
            '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;">' +
                '<div style="flex:1;min-width:220px;">' +
                    '<div style="font-weight:600;font-size:1.02rem;">' + tipo.icon + ' ' + ENI.UI.escapeHtml(_nome(r)) + '</div>' +
                    '<div class="text-sm" style="margin-top:2px;"><span class="badge badge-gray">' + tipo.label + '</span> ' + _periodoTxt(r) + '</div>' +
                    (r.motivo ? '<div class="text-sm text-muted" style="margin-top:4px;">' + ENI.UI.escapeHtml(r.motivo) + '</div>' : '') +
                    risposta +
                '</div>' +
                '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;">' +
                    '<span class="badge ' + stato.badge + '">' + stato.label + '</span>' +
                    '<div style="display:flex;gap:6px;align-items:center;">' + azioni + '</div>' +
                '</div>' +
            '</div>' +
        '</div>';
    }

    // --- Approva / Rifiuta (con nota opzionale) ---
    function _gestisci(id, nuovoStato) {
        var r = _richieste.filter(function(x) { return x.id === id; })[0];
        if (!r) return;
        var azione = nuovoStato === 'approvata' ? 'Approva' : 'Rifiuta';
        var modal = ENI.UI.showModal({
            title: azione + ' richiesta',
            body:
                '<p class="text-sm" style="margin-top:0;"><strong>' + ENI.UI.escapeHtml(_nome(r)) + '</strong> — ' + (TIPI[r.tipo] ? TIPI[r.tipo].label : r.tipo) + ' ' + _periodoTxt(r) + '</p>' +
                '<div class="form-group"><label class="form-label">Nota (opzionale)</label>' +
                    '<textarea class="form-textarea" id="fer-nota" rows="2" placeholder="Motivo o commento"></textarea></div>',
            footer: '<button class="btn btn-outline" data-modal-close>Annulla</button>' +
                '<button class="btn ' + (nuovoStato === 'approvata' ? 'btn-primary' : 'btn-danger') + '" id="fer-conferma">' + azione + '</button>'
        });
        modal.querySelector('#fer-conferma').addEventListener('click', async function() {
            var nota = (document.getElementById('fer-nota') || {}).value || null;
            try {
                ENI.UI.showLoading();
                await ENI.API.aggiornaStatoRichiestaFerie(id, nuovoStato, nota);
                ENI.UI.hideLoading();
                ENI.UI.closeModal(modal);
                ENI.UI.success('Richiesta ' + STATI[nuovoStato].label.toLowerCase());
                _richieste = await ENI.API.getRichiesteFerie() || [];
                _renderPage(document.getElementById('main-content'));
            } catch (e) { ENI.UI.hideLoading(); ENI.UI.error('Errore: ' + e.message); }
        });
    }

    function _elimina(id) {
        ENI.UI.confirm({ title: 'Elimina richiesta', message: 'Eliminare definitivamente questa richiesta?', confirmText: 'Elimina', cancelText: 'Annulla', danger: true })
            .then(async function(ok) {
                if (!ok) return;
                try {
                    await ENI.API.eliminaRichiestaFerie(id);
                    ENI.UI.success('Richiesta eliminata');
                    _richieste = await ENI.API.getRichiesteFerie() || [];
                    _renderPage(document.getElementById('main-content'));
                } catch (e) { ENI.UI.error('Errore: ' + e.message); }
            });
    }

    // --- Nuova richiesta ---
    function _formNuova() {
        var attivi = _personale.filter(function(p) { return p.attivo !== false; });
        if (!attivi.length) { ENI.UI.warning('Nessun dipendente disponibile'); return; }
        var oggi = _oggi();

        var body =
            '<div class="form-group"><label class="form-label">Dipendente</label>' +
                '<select class="form-select" id="fer-pid">' +
                    attivi.map(function(p) { return '<option value="' + p.id + '">' + ENI.UI.escapeHtml(p.nome_completo) + '</option>'; }).join('') +
                '</select></div>' +
            '<div class="form-group"><label class="form-label">Tipo</label>' +
                '<select class="form-select" id="fer-tipo">' +
                    '<option value="ferie">🌴 Ferie</option><option value="permesso">🕐 Permesso</option><option value="malattia">🤒 Malattia</option>' +
                '</select></div>' +
            '<label style="display:flex;align-items:center;gap:8px;margin:6px 0 10px;font-size:0.9rem;">' +
                '<input type="checkbox" id="fer-intera" checked> Giornata intera (più giorni)</label>' +
            '<div id="fer-intera-box">' +
                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">' +
                    '<div class="form-group"><label class="form-label">Dal</label><input type="date" class="form-input" id="fer-da" value="' + oggi + '"></div>' +
                    '<div class="form-group"><label class="form-label">Al</label><input type="date" class="form-input" id="fer-a" value="' + oggi + '"></div>' +
                '</div>' +
            '</div>' +
            '<div id="fer-ore-box" style="display:none;">' +
                '<div class="form-group"><label class="form-label">Giorno</label><input type="date" class="form-input" id="fer-giorno" value="' + oggi + '"></div>' +
                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">' +
                    '<div class="form-group"><label class="form-label">Dalle ore</label><input type="time" class="form-input" id="fer-oi"></div>' +
                    '<div class="form-group"><label class="form-label">Alle ore</label><input type="time" class="form-input" id="fer-of"></div>' +
                '</div>' +
            '</div>' +
            '<div class="form-group"><label class="form-label">Motivo (opzionale)</label>' +
                '<textarea class="form-textarea" id="fer-motivo" rows="2"></textarea></div>';

        var modal = ENI.UI.showModal({
            title: 'Nuova richiesta ferie/permesso',
            body: body,
            footer: '<button class="btn btn-outline" data-modal-close>Annulla</button><button class="btn btn-primary" id="fer-salva">Salva</button>'
        });

        var chkIntera = modal.querySelector('#fer-intera');
        chkIntera.addEventListener('change', function() {
            document.getElementById('fer-intera-box').style.display = chkIntera.checked ? '' : 'none';
            document.getElementById('fer-ore-box').style.display = chkIntera.checked ? 'none' : '';
        });

        modal.querySelector('#fer-salva').addEventListener('click', async function() {
            var intera = chkIntera.checked;
            var dati = {
                personale_id: document.getElementById('fer-pid').value,
                tipo: document.getElementById('fer-tipo').value,
                giornata_intera: intera,
                motivo: (document.getElementById('fer-motivo').value || '').trim() || null,
                stato: 'in_attesa'
            };
            if (intera) {
                dati.data_inizio = document.getElementById('fer-da').value;
                dati.data_fine = document.getElementById('fer-a').value;
                if (!dati.data_inizio || !dati.data_fine) { ENI.UI.warning('Inserisci le date'); return; }
                if (dati.data_fine < dati.data_inizio) { ENI.UI.warning('La data finale non può precedere quella iniziale'); return; }
            } else {
                var g = document.getElementById('fer-giorno').value;
                dati.data_inizio = g; dati.data_fine = g;
                dati.ora_inizio = document.getElementById('fer-oi').value || null;
                dati.ora_fine = document.getElementById('fer-of').value || null;
                if (!g) { ENI.UI.warning('Inserisci il giorno'); return; }
            }
            try {
                ENI.UI.showLoading();
                await ENI.API.salvaRichiestaFerie(dati);
                ENI.UI.hideLoading();
                ENI.UI.closeModal(modal);
                ENI.UI.success('Richiesta registrata');
                _richieste = await ENI.API.getRichiesteFerie() || [];
                _renderPage(document.getElementById('main-content'));
            } catch (e) { ENI.UI.hideLoading(); ENI.UI.error('Errore: ' + e.message); }
        });
    }

    return { render: render };
})();
