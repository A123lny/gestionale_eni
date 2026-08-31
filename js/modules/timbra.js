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
    var _page = null;
    var _qrToken = null;
    var _html5QrCode = null;
    var _scannerRunning = false;

    // Doppia scansione ravvicinata: sotto questa soglia (secondi) chiedo conferma extra.
    var SOGLIA_DOPPIO = 90;

    async function render(container) {
        if (_clock) { clearInterval(_clock); _clock = null; }
        _stopScanner();
        _page = container;

        var pid = ENI.State.getUserId();
        var nome = ENI.State.getUserName ? ENI.State.getUserName() : '';
        if (!pid) {
            container.innerHTML = _wrap('<p class="text-muted">Devi essere loggato per timbrare.</p>');
            return;
        }

        container.innerHTML =
            '<div id="timbra-azione"></div>' +
            '<div id="timbra-storico" style="max-width:440px; margin:16px auto 0;"></div>';
        var az = document.getElementById('timbra-azione');
        az.innerHTML = _wrap('<div class="flex justify-center" style="padding:2rem;"><div class="spinner"></div></div>');

        var ultima = null;
        try { ultima = await ENI.API.getUltimaTimbratura(pid); }
        catch (e) { az.innerHTML = _wrap('<p class="text-danger">Errore: ' + ENI.UI.escapeHtml(e.message) + '</p>'); return; }

        // Codice segreto del QR di stazione: la timbratura si conferma solo scansionandolo.
        try { _qrToken = await ENI.API.getImpostazioneApp('timbra_qr_token'); }
        catch (e) { _qrToken = null; }

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
            _renderDoppio(az, nome, ultima, secFa, azione, sospesa);
        } else {
            _renderConferma(az, nome, azione, ultima, dentro, sospesa);
        }

        _renderStorico(pid);
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

    // Il tocco su "Timbra" NON registra subito: apre la fotocamera per inquadrare
    // il QR affisso in stazione. Solo se il QR è quello giusto si timbra davvero.
    function _conferma(container, azione) {
        _apriScanner(container, azione);
    }

    async function _apriScanner(container, azione) {
        if (!_qrToken) {
            ENI.UI.warning('Timbratura non ancora configurata: il responsabile deve generare il QR.');
            return;
        }
        if (typeof Html5Qrcode === 'undefined') {
            ENI.UI.error('Fotocamera non disponibile su questo dispositivo.');
            return;
        }
        var isEntrata = azione === 'entrata';
        container.innerHTML = _wrap(
            '<div style="text-align:center;">' +
                '<h1 style="font-size:1.2rem;margin:0 0 4px;">📷 Inquadra il QR in stazione</h1>' +
                '<p class="text-sm text-muted" style="margin-top:0;">per timbrare ' + (isEntrata ? 'l\'ENTRATA' : 'l\'USCITA') + '</p>' +
                '<div id="timbra-reader" style="width:100%; max-width:320px; margin:10px auto;"></div>' +
                '<div id="timbra-scan-msg" class="text-sm" style="min-height:20px;"></div>' +
                '<button id="btn-scan-annulla" class="btn btn-outline btn-block" style="margin-top:10px;">Annulla</button>' +
            '</div>'
        );
        var annulla = document.getElementById('btn-scan-annulla');
        if (annulla) annulla.addEventListener('click', function() { _stopScanner(function() { render(_page); }); });

        _html5QrCode = new Html5Qrcode('timbra-reader');
        _scannerRunning = true;
        var handled = false;
        _html5QrCode.start(
            { facingMode: 'environment' },
            { fps: 10, qrbox: 220 },
            function(decodedText) {
                if (handled) return;
                if (decodedText === _qrToken) {
                    handled = true;
                    _stopScanner(function() { _eseguiTimbra(container, azione); });
                } else {
                    var msg = document.getElementById('timbra-scan-msg');
                    if (msg) msg.innerHTML = '<span class="text-danger">QR non valido: inquadra quello affisso in stazione.</span>';
                }
            },
            function() { /* errori di lettura per-frame: ignorati */ }
        ).catch(function(e) {
            _scannerRunning = false;
            ENI.UI.error('Impossibile aprire la fotocamera: ' + (e && e.message ? e.message : e));
            render(_page);
        });
    }

    function _stopScanner(cb) {
        if (_html5QrCode && _scannerRunning) {
            _scannerRunning = false;
            _html5QrCode.stop().then(function() {
                try { _html5QrCode.clear(); } catch (e) {}
                _html5QrCode = null;
                if (cb) cb();
            }).catch(function() {
                _html5QrCode = null;
                if (cb) cb();
            });
        } else {
            _scannerRunning = false;
            if (cb) cb();
        }
    }

    async function _eseguiTimbra(container, azione) {
        if (_busy) return;
        _busy = true;
        container.innerHTML = _wrap('<div class="flex justify-center" style="padding:2rem;"><div class="spinner"></div><span style="margin-left:10px;">Registro…</span></div>');
        try {
            var rec = await ENI.API.salvaTimbratura({ tipo: azione, origine: 'qr' });
            _renderSuccesso(container, azione, rec);
            _renderStorico(ENI.State.getUserId());
        } catch (e) {
            _busy = false;
            ENI.UI.error('Errore nel salvataggio: ' + e.message);
            render(_page);
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

    // --- Storico personale (questa settimana) ---
    function _lunediCorrente() {
        var d = new Date(ENI.UI.oggiISO() + 'T12:00:00');
        var dow = (d.getDay() + 6) % 7; // 0 = lunedì
        d.setDate(d.getDate() - dow);
        return d.toISOString().slice(0, 10);
    }

    function _sessioni(eventi) {
        var sorted = eventi.slice().sort(function(a, b) { return a.ts < b.ts ? -1 : (a.ts > b.ts ? 1 : 0); });
        var sess = [], aperta = null;
        sorted.forEach(function(e) {
            if (e.tipo === 'entrata') { if (aperta) sess.push({ inizio: aperta, fine: null }); aperta = e.ts; }
            else { if (aperta) { sess.push({ inizio: aperta, fine: e.ts }); aperta = null; } else sess.push({ inizio: null, fine: e.ts }); }
        });
        if (aperta) sess.push({ inizio: aperta, fine: null });
        return sess;
    }

    function _minuti(sess) {
        return sess.reduce(function(tot, s) {
            if (s.inizio && s.fine) tot += (new Date(s.fine) - new Date(s.inizio)) / 60000;
            return tot;
        }, 0);
    }

    function _fmtOre(min) {
        min = Math.round(min);
        return Math.floor(min / 60) + 'h ' + _due(min % 60) + 'm';
    }

    function _fmtDataStorico(iso) {
        try { return new Date(iso + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' }); }
        catch (e) { return iso; }
    }

    async function _renderStorico(pid) {
        var el = document.getElementById('timbra-storico');
        if (!el) return;
        el.innerHTML = '<div class="card" style="padding:var(--space-4);"><div class="flex justify-center" style="padding:1rem;"><div class="spinner"></div></div></div>';

        var da = _lunediCorrente(), a = ENI.UI.oggiISO();
        var timb;
        try { timb = await ENI.API.getTimbrature(da, a); }
        catch (e) { el.innerHTML = ''; return; }
        timb = (timb || []).filter(function(t) { return t.personale_id === pid; });

        var perGiorno = {};
        timb.forEach(function(t) { (perGiorno[t.data] = perGiorno[t.data] || []).push(t); });
        var giorni = Object.keys(perGiorno).sort().reverse();
        var totMin = 0;
        var righe = giorni.map(function(g) {
            var sess = _sessioni(perGiorno[g]);
            var min = _minuti(sess);
            totMin += min;
            var pairs = sess.map(function(s) { return (s.inizio ? _oraDi(s.inizio) : '??') + '–' + (s.fine ? _oraDi(s.fine) : '??'); }).join(', ');
            return '<div style="display:flex; justify-content:space-between; gap:8px; padding:5px 0; border-bottom:1px solid var(--border-color);">' +
                '<div><div style="font-weight:600; font-size:0.85rem;">' + _fmtDataStorico(g) + '</div>' +
                '<div class="text-xs text-muted">' + pairs + '</div></div>' +
                '<div style="font-weight:700; white-space:nowrap;">' + _fmtOre(min) + '</div>' +
            '</div>';
        }).join('');

        el.innerHTML =
            '<div class="card" style="padding:var(--space-4);">' +
                '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">' +
                    '<span style="font-weight:700;">📋 Le mie timbrature</span>' +
                    '<span class="text-xs text-muted">questa settimana</span>' +
                '</div>' +
                (righe || '<div class="text-sm text-muted">Nessuna timbratura questa settimana.</div>') +
                (giorni.length ? '<div style="display:flex; justify-content:space-between; margin-top:8px; font-weight:700;"><span>Totale settimana</span><span>' + _fmtOre(totMin) + '</span></div>' : '') +
            '</div>';
    }

    return { render: render };
})();
