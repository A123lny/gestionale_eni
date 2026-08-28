// ============================================================
// GESTIONALE ENI - Timbratura (lato dipendente)
// Pagina aperta dal QR in stazione: mostra lo stato e conferma
// entrata/uscita con un solo tocco. Un QR unico che "alterna".
// ============================================================

var ENI = ENI || {};
ENI.Modules = ENI.Modules || {};

ENI.Modules.Timbra = (function() {
    'use strict';

    var _busy = false;
    var _clock = null;

    // Doppia scansione ravvicinata: sotto questa soglia (secondi) chiedo conferma extra.
    var SOGLIA_DOPPIO = 90;

    async function render(container) {
        if (_clock) { clearInterval(_clock); _clock = null; }

        var pid = ENI.State.getUserId();
        var nome = ENI.State.getUserName ? ENI.State.getUserName() : '';
        if (!pid) {
            container.innerHTML = _wrap('<p class="text-muted">Devi essere loggato per timbrare.</p>');
            return;
        }

        container.innerHTML = _wrap('<div class="flex justify-center" style="padding:2rem;"><div class="spinner"></div></div>');

        var ultima = null;
        try { ultima = await ENI.API.getUltimaTimbratura(pid); }
        catch (e) { container.innerHTML = _wrap('<p class="text-danger">Errore: ' + ENI.UI.escapeHtml(e.message) + '</p>'); return; }

        var oggi = ENI.UI.oggiISO();
        var dentro = false, sospesa = false;
        if (ultima && ultima.tipo === 'entrata') {
            if (ultima.data === oggi) dentro = true;
            else sospesa = true; // entrata di un giorno precedente = uscita dimenticata
        }
        var azione = dentro ? 'uscita' : 'entrata';

        // Anti doppia-scansione: se l'ultima timbratura è di pochi secondi fa
        var secFa = ultima ? Math.round((Date.now() - new Date(ultima.ts).getTime()) / 1000) : 999999;
        if (ultima && secFa < SOGLIA_DOPPIO) {
            _renderDoppio(container, nome, ultima, secFa, azione, sospesa);
            return;
        }

        _renderConferma(container, nome, azione, ultima, dentro, sospesa);
    }

    function _renderConferma(container, nome, azione, ultima, dentro, sospesa) {
        var isEntrata = azione === 'entrata';
        var statoBadge = dentro
            ? '<span class="badge badge-success">🟢 Sei in servizio</span>'
            : '<span class="badge badge-gray">⚪ Sei fuori servizio</span>';

        var dettaglioStato = '';
        if (dentro && ultima) {
            dettaglioStato = '<p class="text-sm text-muted">Entrato alle <strong>' + _oraDi(ultima.ts) + '</strong></p>';
        }

        var avvisoSospesa = sospesa
            ? '<div class="stock-alert mb-4" style="background:#FEF3C7;border-left-color:#D97706;">⚠️ Risultavi ancora <strong>ENTRATO da un giorno precedente</strong> (uscita dimenticata). Timbro una nuova <strong>Entrata</strong>. Avvisa il responsabile per correggere ieri.</div>'
            : '';

        var body =
            avvisoSospesa +
            '<div style="text-align:center;">' +
                '<div id="timbra-orologio" style="font-size:2.5rem;font-weight:700;letter-spacing:1px;">--:--</div>' +
                '<div class="text-sm text-muted" style="margin-bottom:12px;">' + _dataLunga() + '</div>' +
                '<h1 style="font-size:1.5rem;margin:0 0 6px;">Ciao ' + ENI.UI.escapeHtml(nome) + '! 👋</h1>' +
                '<div style="margin-bottom:18px;">' + statoBadge + dettaglioStato + '</div>' +
                '<button id="btn-timbra" class="btn btn-lg btn-block ' + (isEntrata ? 'btn-success' : 'btn-danger') + '" style="font-size:1.3rem;padding:18px;">' +
                    (isEntrata ? '🟢 Timbra ENTRATA' : '🔴 Timbra USCITA') +
                '</button>' +
                '<button id="btn-switch" type="button" style="background:none;border:none;color:var(--color-text-muted);font-size:0.85rem;cursor:pointer;margin-top:14px;padding:8px;">' +
                    'No, timbra ' + (isEntrata ? 'Uscita' : 'Entrata') + ' invece' +
                '</button>' +
            '</div>';

        container.innerHTML = _wrap(body);
        _avviaOrologio();

        container.querySelector('#btn-timbra').addEventListener('click', function() { _conferma(container, azione); });
        container.querySelector('#btn-switch').addEventListener('click', function() {
            _renderConferma(container, nome, isEntrata ? 'uscita' : 'entrata', ultima, dentro, false);
        });
    }

    function _renderDoppio(container, nome, ultima, secFa, azione, sospesa) {
        var body =
            '<div style="text-align:center;">' +
                '<div style="font-size:3rem;">🤔</div>' +
                '<h1 style="font-size:1.3rem;">Hai già timbrato ' + (ultima.tipo === 'entrata' ? 'Entrata' : 'Uscita') + '</h1>' +
                '<p class="text-muted">…solo <strong>' + secFa + ' secondi fa</strong> (alle ' + _oraDi(ultima.ts) + '). Vuoi davvero timbrare di nuovo?</p>' +
                '<button id="btn-annulla" class="btn btn-lg btn-block" style="margin-top:12px;">No, ho già timbrato</button>' +
                '<button id="btn-forza" type="button" style="background:none;border:none;color:var(--color-text-muted);font-size:0.85rem;cursor:pointer;margin-top:14px;padding:8px;">Sì, timbra comunque ' + (azione === 'entrata' ? 'Entrata' : 'Uscita') + '</button>' +
            '</div>';
        container.innerHTML = _wrap(body);
        container.querySelector('#btn-annulla').addEventListener('click', function() { _renderChiuso(container); });
        container.querySelector('#btn-forza').addEventListener('click', function() { _conferma(container, azione); });
    }

    async function _conferma(container, azione) {
        if (_busy) return;
        _busy = true;
        var btn = container.querySelector('#btn-timbra');
        if (btn) { btn.disabled = true; btn.textContent = 'Registro…'; }
        try {
            var rec = await ENI.API.salvaTimbratura({ tipo: azione });
            _renderSuccesso(container, azione, rec);
        } catch (e) {
            ENI.UI.error('Errore nel salvataggio: ' + e.message);
            _busy = false;
            if (btn) { btn.disabled = false; }
        }
    }

    function _renderSuccesso(container, azione, rec) {
        _busy = false;
        var isEntrata = azione === 'entrata';
        var ora = _oraDi(rec && rec.ts ? rec.ts : new Date().toISOString());
        var body =
            '<div style="text-align:center;">' +
                '<div style="font-size:4rem;">' + (isEntrata ? '🟢' : '🔴') + '</div>' +
                '<div style="font-size:3rem;">✅</div>' +
                '<h1 style="font-size:1.5rem;margin:8px 0;">' + (isEntrata ? 'Entrata' : 'Uscita') + ' registrata</h1>' +
                '<div style="font-size:2.2rem;font-weight:700;">' + ora + '</div>' +
                '<p class="text-muted" style="margin-top:10px;">' + (isEntrata ? 'Buon lavoro! 💪' : 'A presto! 👋') + '</p>' +
            '</div>';
        container.innerHTML = _wrap(body);
    }

    function _renderChiuso(container) {
        container.innerHTML = _wrap('<div style="text-align:center;"><div style="font-size:3rem;">👍</div><p class="text-muted">Ok, nessuna timbratura registrata.</p></div>');
    }

    // --- Helper ---

    function _wrap(inner) {
        return '<div style="max-width:420px;margin:0 auto;padding:8px 4px;">' +
            '<div class="card" style="padding:var(--space-6);">' + inner + '</div>' +
        '</div>';
    }

    function _avviaOrologio() {
        function tick() {
            var el = document.getElementById('timbra-orologio');
            if (!el) { if (_clock) { clearInterval(_clock); _clock = null; } return; }
            var d = new Date();
            el.textContent = _due(d.getHours()) + ':' + _due(d.getMinutes()) + ':' + _due(d.getSeconds());
        }
        tick();
        _clock = setInterval(tick, 1000);
    }

    function _due(n) { return (n < 10 ? '0' : '') + n; }
    function _oraDi(ts) { var d = new Date(ts); return _due(d.getHours()) + ':' + _due(d.getMinutes()); }
    function _dataLunga() {
        try { return new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }); }
        catch (e) { return ''; }
    }

    return { render: render };
})();
