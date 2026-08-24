// ============================================================
// GESTIONALE ENI - Le mie richieste (lato dipendente)
// Scheda Ferie/Permessi (proprie) + scheda Disponibilità settimanale.
// Ogni dipendente vede/gestisce SOLO le proprie (RLS lato DB).
// ============================================================

var ENI = ENI || {};
ENI.Modules = ENI.Modules || {};

ENI.Modules.MieRichieste = (function() {
    'use strict';

    var _tab = 'ferie';
    var _mie = [];
    var _disp = {};      // data -> riga disponibilita
    var _lunedi = null;  // settimana disponibilità

    var TIPI = { ferie: { label: 'Ferie', icon: '🌴' }, permesso: { label: 'Permesso', icon: '🕐' }, malattia: { label: 'Malattia', icon: '🤒' } };
    var STATI = { in_attesa: { label: 'In attesa', badge: 'badge-warning' }, approvata: { label: 'Approvata', badge: 'badge-success' }, rifiutata: { label: 'Rifiutata', badge: 'badge-danger' } };
    var GIORNI = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab']; // stazione aperta Lun–Sab
    var N_GIORNI = 6;
    var FASCE = [
        { id: 'indifferente', label: 'Indifferente' },
        { id: 'mattina', label: '🌅 Mattina' },
        { id: 'pomeriggio', label: '🌇 Pomeriggio' },
        { id: 'spezzato', label: '🔀 Spezzato' }
    ];

    function _parse(iso) { var p = String(iso).split('-'); return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])); }
    function _toISO(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
    function _addG(iso, n) { var d = _parse(iso); d.setDate(d.getDate() + n); return _toISO(d); }
    function _dow(iso) { return _parse(iso).getDay(); }
    function _mondayOf(iso) { var d = _dow(iso); var off = (d === 0) ? 6 : (d - 1); return _addG(iso, -off); }
    function _oggi() { return ENI.UI.oggiISO(); }
    function _fmtData(iso) { var p = String(iso).split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
    function _fmtBreve(iso) { var p = String(iso).split('-'); return p[2] + '/' + p[1]; }
    function _pid() { return ENI.State.getUserId(); }

    async function render(container) {
        if (!_lunedi) _lunedi = _mondayOf(_addG(_oggi(), 7)); // settimana prossima di default
        container.innerHTML =
            '<div class="page-header"><h1 class="page-title">✅ Le mie richieste</h1></div>' +
            '<div class="filter-chips" id="mr-tabs" style="margin-bottom:var(--space-3);">' +
                '<button class="chip' + (_tab === 'ferie' ? ' active' : '') + '" data-t="ferie">🌴 Ferie / Permessi</button>' +
                '<button class="chip' + (_tab === 'disponibilita' ? ' active' : '') + '" data-t="disponibilita">🗓️ Disponibilità</button>' +
            '</div>' +
            '<div id="mr-content"></div>';

        var tabs = container.querySelector('#mr-tabs');
        tabs.addEventListener('click', function(e) {
            var b = e.target.closest('[data-t]');
            if (!b) return;
            _tab = b.getAttribute('data-t');
            tabs.querySelectorAll('[data-t]').forEach(function(x) { x.classList.toggle('active', x.getAttribute('data-t') === _tab); });
            _renderTab();
        });
        _renderTab();
    }

    function _renderTab() {
        if (_tab === 'disponibilita') _renderDisponibilita();
        else _renderFerie();
    }

    // ---- Scheda FERIE/PERMESSI ----
    async function _renderFerie() {
        var content = document.getElementById('mr-content');
        if (!content) return;
        content.innerHTML = '<div class="flex justify-center" style="padding:2rem;"><div class="spinner"></div></div>';
        try { _mie = await ENI.API.getRichiesteFerie() || []; }
        catch (e) { content.innerHTML = '<div class="empty-state"><p class="empty-state-text">Errore: ' + ENI.UI.escapeHtml(e.message) + '</p></div>'; return; }

        var lista = _mie.length
            ? _mie.map(_cardMia).join('')
            : '<div class="empty-state" style="padding:2rem 1rem;"><div class="empty-state-icon">🌴</div><p class="empty-state-text">Nessuna richiesta inviata</p></div>';

        content.innerHTML =
            '<div style="display:flex;justify-content:flex-end;margin-bottom:var(--space-3);">' +
                '<button class="btn btn-primary btn-sm" id="mr-nuova">+ Nuova richiesta</button>' +
            '</div>' + lista;

        content.querySelector('#mr-nuova').addEventListener('click', _formNuovaFerie);
        content.querySelectorAll('[data-del]').forEach(function(b) {
            b.addEventListener('click', function() { _eliminaMia(b.getAttribute('data-del')); });
        });
    }

    function _periodoTxt(r) {
        if (r.giornata_intera) {
            if (r.data_inizio === r.data_fine) return 'il ' + _fmtData(r.data_inizio);
            return 'dal ' + _fmtData(r.data_inizio) + ' al ' + _fmtData(r.data_fine);
        }
        var ore = (r.ora_inizio ? r.ora_inizio.slice(0, 5) : '') + (r.ora_fine ? '–' + r.ora_fine.slice(0, 5) : '');
        return 'il ' + _fmtData(r.data_inizio) + (ore ? ', ore ' + ore : '');
    }

    function _cardMia(r) {
        var tipo = TIPI[r.tipo] || { icon: '', label: r.tipo };
        var stato = STATI[r.stato] || { label: r.stato, badge: 'badge-gray' };
        var canDel = r.stato === 'in_attesa';
        var risposta = (r.stato !== 'in_attesa' && r.note_risposta)
            ? '<div class="text-xs text-muted" style="margin-top:6px;font-style:italic;">Risposta: ' + ENI.UI.escapeHtml(r.note_risposta) + '</div>' : '';
        return '<div style="background:var(--bg-card);border:1px solid var(--color-gray-200);border-radius:var(--radius-md);padding:12px 14px;margin-bottom:10px;">' +
            '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;">' +
                '<div style="flex:1;min-width:200px;">' +
                    '<div style="font-weight:600;">' + tipo.icon + ' ' + tipo.label + ' <span class="text-sm" style="font-weight:400;">' + _periodoTxt(r) + '</span></div>' +
                    (r.motivo ? '<div class="text-sm text-muted" style="margin-top:2px;">' + ENI.UI.escapeHtml(r.motivo) + '</div>' : '') +
                    risposta +
                '</div>' +
                '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;">' +
                    '<span class="badge ' + stato.badge + '">' + stato.label + '</span>' +
                    (canDel ? '<button class="btn-icon" data-del="' + r.id + '" title="Annulla richiesta" style="color:var(--color-danger);"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="pointer-events:none;"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>' : '') +
                '</div>' +
            '</div>' +
        '</div>';
    }

    function _formNuovaFerie() {
        var oggi = _oggi();
        var body =
            '<div class="form-group"><label class="form-label">Tipo</label>' +
                '<select class="form-select" id="mr-tipo"><option value="ferie">🌴 Ferie</option><option value="permesso">🕐 Permesso</option><option value="malattia">🤒 Malattia</option></select></div>' +
            '<label style="display:flex;align-items:center;gap:8px;margin:6px 0 10px;font-size:0.9rem;"><input type="checkbox" id="mr-intera" checked> Giornata intera (più giorni)</label>' +
            '<div id="mr-intera-box"><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">' +
                '<div class="form-group"><label class="form-label">Dal</label><input type="date" class="form-input" id="mr-da" value="' + oggi + '"></div>' +
                '<div class="form-group"><label class="form-label">Al</label><input type="date" class="form-input" id="mr-a" value="' + oggi + '"></div>' +
            '</div></div>' +
            '<div id="mr-ore-box" style="display:none;">' +
                '<div class="form-group"><label class="form-label">Giorno</label><input type="date" class="form-input" id="mr-giorno" value="' + oggi + '"></div>' +
                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">' +
                    '<div class="form-group"><label class="form-label">Dalle ore</label><input type="time" class="form-input" id="mr-oi"></div>' +
                    '<div class="form-group"><label class="form-label">Alle ore</label><input type="time" class="form-input" id="mr-of"></div>' +
                '</div>' +
            '</div>' +
            '<div class="form-group"><label class="form-label">Motivo (opzionale)</label><textarea class="form-textarea" id="mr-motivo" rows="2"></textarea></div>';

        var modal = ENI.UI.showModal({ title: 'Nuova richiesta', body: body, footer: '<button class="btn btn-outline" data-modal-close>Annulla</button><button class="btn btn-primary" id="mr-salva">Invia richiesta</button>' });

        var chk = modal.querySelector('#mr-intera');
        chk.addEventListener('change', function() {
            document.getElementById('mr-intera-box').style.display = chk.checked ? '' : 'none';
            document.getElementById('mr-ore-box').style.display = chk.checked ? 'none' : '';
        });
        modal.querySelector('#mr-salva').addEventListener('click', async function() {
            var intera = chk.checked;
            var dati = { personale_id: _pid(), tipo: document.getElementById('mr-tipo').value, giornata_intera: intera, motivo: (document.getElementById('mr-motivo').value || '').trim() || null, stato: 'in_attesa' };
            if (intera) {
                dati.data_inizio = document.getElementById('mr-da').value;
                dati.data_fine = document.getElementById('mr-a').value;
                if (!dati.data_inizio || !dati.data_fine) { ENI.UI.warning('Inserisci le date'); return; }
                if (dati.data_fine < dati.data_inizio) { ENI.UI.warning('La data finale non può precedere quella iniziale'); return; }
            } else {
                var g = document.getElementById('mr-giorno').value;
                dati.data_inizio = g; dati.data_fine = g;
                dati.ora_inizio = document.getElementById('mr-oi').value || null;
                dati.ora_fine = document.getElementById('mr-of').value || null;
                if (!g) { ENI.UI.warning('Inserisci il giorno'); return; }
            }
            try {
                ENI.UI.showLoading();
                await ENI.API.salvaRichiestaFerie(dati);
                ENI.UI.hideLoading();
                ENI.UI.closeModal(modal);
                ENI.UI.success('Richiesta inviata');
                _renderFerie();
            } catch (e) { ENI.UI.hideLoading(); ENI.UI.error('Errore: ' + e.message); }
        });
    }

    function _eliminaMia(id) {
        ENI.UI.confirm({ title: 'Annulla richiesta', message: 'Vuoi annullare questa richiesta?', confirmText: 'Annulla richiesta', cancelText: 'Chiudi', danger: true })
            .then(async function(ok) {
                if (!ok) return;
                try { await ENI.API.eliminaRichiestaFerie(id); ENI.UI.success('Richiesta annullata'); _renderFerie(); }
                catch (e) { ENI.UI.error('Errore: ' + e.message); }
            });
    }

    // ---- Scheda DISPONIBILITÀ ----
    async function _renderDisponibilita() {
        var content = document.getElementById('mr-content');
        if (!content) return;
        content.innerHTML = '<div class="flex justify-center" style="padding:2rem;"><div class="spinner"></div></div>';
        var da = _lunedi, a = _addG(_lunedi, 6);
        try {
            var righe = await ENI.API.getDisponibilita(da, a);
            _disp = {};
            righe.forEach(function(r) { if (r.personale_id === _pid()) _disp[r.data] = r; });
        } catch (e) { content.innerHTML = '<div class="empty-state"><p class="empty-state-text">Errore: ' + ENI.UI.escapeHtml(e.message) + '</p></div>'; return; }

        var rows = '';
        for (var i = 0; i < N_GIORNI; i++) {
            var dt = _addG(_lunedi, i);
            var d = _disp[dt] || {};
            // Se non ancora impostato per quel giorno, parte da "non disponibile" finché il dipendente non salva
            var isDisp = d.data ? (d.disponibile !== false) : false;
            rows +=
                '<div style="padding:8px 0;border-bottom:1px solid var(--color-gray-100);">' +
                    '<div style="display:grid;grid-template-columns:110px 1fr 1fr;gap:10px;align-items:center;">' +
                        '<div style="font-weight:600;">' + GIORNI[i] + ' <span class="text-xs text-muted">' + _fmtBreve(dt) + '</span></div>' +
                        '<label style="display:flex;align-items:center;gap:6px;font-size:0.9rem;">' +
                            '<input type="checkbox" class="mr-disp" data-data="' + dt + '"' + (isDisp ? ' checked' : '') + '> Disponibile</label>' +
                        '<select class="form-select mr-fascia" data-data="' + dt + '"' + (isDisp ? '' : ' disabled') + '>' +
                            FASCE.map(function(f) { return '<option value="' + f.id + '"' + ((d.fascia || 'indifferente') === f.id ? ' selected' : '') + '>' + f.label + '</option>'; }).join('') +
                        '</select>' +
                    '</div>' +
                    '<input type="text" class="form-input mr-note" data-data="' + dt + '" placeholder="Nota (opzionale, es. solo fino alle 12)" value="' + (d.note ? ENI.UI.escapeHtml(d.note) : '') + '" style="margin-top:6px;font-size:0.85rem;' + (isDisp ? '' : 'display:none;') + '">' +
                '</div>';
        }

        content.innerHTML =
            '<div style="display:flex;align-items:center;gap:10px;margin-bottom:var(--space-3);flex-wrap:wrap;">' +
                '<button class="btn btn-outline btn-sm" id="mr-prev">‹ Precedente</button>' +
                '<button class="btn btn-outline btn-sm" id="mr-next">Successiva ›</button>' +
                '<div style="font-weight:600;margin-left:6px;">Settimana ' + _fmtBreve(da) + ' – ' + _fmtBreve(a) + '</div>' +
            '</div>' +
            '<div class="text-sm text-muted" style="margin-bottom:var(--space-2);">Indica in quali giorni sei disponibile e la fascia preferita. Poi premi Salva.</div>' +
            '<div style="background:var(--bg-card);border:1px solid var(--color-gray-200);border-radius:var(--radius-md);padding:6px 14px;">' + rows + '</div>' +
            '<button class="btn btn-primary btn-block mt-4" id="mr-salva-disp">💾 Salva disponibilità</button>';

        content.querySelector('#mr-prev').addEventListener('click', function() { _lunedi = _addG(_lunedi, -7); _renderDisponibilita(); });
        content.querySelector('#mr-next').addEventListener('click', function() { _lunedi = _addG(_lunedi, 7); _renderDisponibilita(); });
        content.querySelectorAll('.mr-disp').forEach(function(chk) {
            chk.addEventListener('change', function() {
                var dt = chk.getAttribute('data-data');
                var sel = content.querySelector('.mr-fascia[data-data="' + dt + '"]');
                if (sel) sel.disabled = !chk.checked;
                var note = content.querySelector('.mr-note[data-data="' + dt + '"]');
                if (note) note.style.display = chk.checked ? '' : 'none';
            });
        });
        content.querySelector('#mr-salva-disp').addEventListener('click', _salvaDisponibilita);
    }

    async function _salvaDisponibilita() {
        var content = document.getElementById('mr-content');
        var chks = content.querySelectorAll('.mr-disp');
        try {
            ENI.UI.showLoading();
            for (var i = 0; i < chks.length; i++) {
                var dt = chks[i].getAttribute('data-data');
                var disp = chks[i].checked;
                var fascia = (content.querySelector('.mr-fascia[data-data="' + dt + '"]') || {}).value || 'indifferente';
                var nota = ((content.querySelector('.mr-note[data-data="' + dt + '"]') || {}).value || '').trim() || null;
                await ENI.API.salvaDisponibilita({ personale_id: _pid(), data: dt, disponibile: disp, fascia: fascia, note: nota });
            }
            ENI.UI.hideLoading();
            ENI.UI.success('Disponibilità salvata');
            _renderDisponibilita();
        } catch (e) { ENI.UI.hideLoading(); ENI.UI.error('Errore: ' + e.message); }
    }

    return { render: render };
})();
