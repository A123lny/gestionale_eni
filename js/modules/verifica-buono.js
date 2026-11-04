// ============================================================
// VERIFICA BUONO
//
// Il banco ha un tagliando in mano e una domanda sola: e' gia' stato usato?
//
// Prima di questa schermata non c'era un posto dove chiederlo. In Buoni >
// Gestione la lista si mostra solo dopo aver scelto un cliente, e la ricerca
// per codice guarda solo dentro i buoni di quel cliente: con un cliente che
// arriva e appoggia un buono sul banco, l'operatore non sa a chi fosse
// intestato e non lo trova. In Vendite lo scanner i buoni li riconosce, ma col
// carrello pieno non verifica niente: fa partire il pagamento e crea una
// vendita.
//
// Ed e' proprio quella vendita il problema. I buoni sono PREPAGATI: i soldi
// sono entrati quando il buono e' stato venduto. Il gestore registra i buoni
// che tornano scrivendo il totale in cassa, nel campo "Buoni Cartacei
// (nostri)". Una vendita creata al momento del rientro aggiungerebbe la merce
// al venduto del giorno una seconda volta, sopra a quel numero scritto a mano.
//
// Per questo qui NON SI SCRIVE NIENTE. Nessuna vendita, nessun campo di cassa,
// e nemmeno lo stato del buono: a disabilitarlo ci pensa il gestore dalla
// pagina Buoni, il giorno dopo, con il suo pulsante. Questa schermata legge e
// mostra. Un test verifica che resti cosi'.
// ============================================================

var ENI = ENI || {};
ENI.Modules = ENI.Modules || {};

ENI.Modules.VerificaBuono = (function() {
    'use strict';

    var _html5QrCode = null;
    var _scannerRunning = false;
    var _container = null;
    var _uscitaAgganciata = false;

    function render(container) {
        _container = container;
        _agganciaUscita();
        _schermataIniziale();
    }

    // Se qualcuno cambia pagina mentre la fotocamera e' aperta, senza questo
    // se la porterebbe via accesa: spia accesa, batteria che si consuma e la
    // fotocamera occupata per chi la vuole usare dopo.
    function _agganciaUscita() {
        if (_uscitaAgganciata) return;
        _uscitaAgganciata = true;
        window.addEventListener('hashchange', function() {
            if (_scannerRunning) _stopScanner();
        });
    }

    function _schermataIniziale() {
        if (!_container) return;
        _container.innerHTML =
            '<div class="card" style="max-width:480px; margin:0 auto;">' +
                '<div class="card-header"><h3 style="margin:0;">\u{1F3AB} Verifica buono</h3></div>' +
                '<div class="card-body">' +
                    '<p class="text-sm text-muted" style="margin-top:0;">Inquadra il codice a barre del buono, ' +
                        'oppure battilo a mano. Questa schermata controlla e basta: non registra niente.</p>' +

                    '<button class="btn btn-primary btn-block" id="btn-vb-camera" style="display:none; font-size:1.05rem; padding:14px;">' +
                        '\u{1F4F7} Inquadra il codice' +
                    '</button>' +

                    '<div id="vb-reader" style="width:100%; max-width:380px; margin:12px auto 0; display:none;"></div>' +
                    '<button class="btn btn-outline btn-block" id="btn-vb-stop" style="display:none; margin-top:8px;">Chiudi fotocamera</button>' +

                    '<div class="form-group" style="margin-top:var(--space-4);">' +
                        '<label class="form-label">Codice del buono</label>' +
                        '<input type="text" class="form-input" id="vb-ean" inputmode="numeric" autocomplete="off" ' +
                            'placeholder="13 cifre" style="font-size:1.25rem; text-align:center; font-weight:bold;">' +
                    '</div>' +
                    '<button class="btn btn-secondary btn-block" id="btn-vb-verifica">Verifica</button>' +

                    '<div id="vb-esito" style="margin-top:var(--space-4);"></div>' +
                '</div>' +
            '</div>';

        var btnCam = document.getElementById('btn-vb-camera');
        if (btnCam && navigator.mediaDevices &&
            typeof navigator.mediaDevices.getUserMedia === 'function' &&
            typeof Html5Qrcode !== 'undefined') {
            btnCam.style.display = 'block';
            btnCam.addEventListener('click', _apriScanner);
        }

        var btnStop = document.getElementById('btn-vb-stop');
        if (btnStop) btnStop.addEventListener('click', function() { _stopScanner(); });

        var input = document.getElementById('vb-ean');
        var btnVer = document.getElementById('btn-vb-verifica');
        if (btnVer) btnVer.addEventListener('click', function() { _verifica(input.value); });
        if (input) {
            // Invio conferma: vale per chi batte a mano e per il lettore a
            // pistola del banco, che manda le cifre e poi un Invio.
            input.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    _verifica(input.value);
                }
            });
        }
    }

    function _apriScanner() {
        if (typeof Html5Qrcode === 'undefined') {
            ENI.UI.error('Fotocamera non disponibile su questo dispositivo.');
            return;
        }
        var reader = document.getElementById('vb-reader');
        var btnCam = document.getElementById('btn-vb-camera');
        var btnStop = document.getElementById('btn-vb-stop');
        if (reader) reader.style.display = 'block';
        if (btnCam) btnCam.style.display = 'none';
        if (btnStop) btnStop.style.display = 'block';

        _html5QrCode = new Html5Qrcode('vb-reader');
        _scannerRunning = true;
        var letto = false;

        _html5QrCode.start(
            { facingMode: 'environment' },
            // Un EAN-13 e' largo e basso: col riquadro quadrato del QR si fa
            // fatica a centrarlo. Stessa finestra che usa Vendite.
            { fps: 10, qrbox: { width: 280, height: 120 }, aspectRatio: 1.5 },
            function(testo) {
                if (letto) return;
                letto = true;
                _stopScanner(function() { _verifica(testo); });
            },
            function() { /* errori di lettura per-fotogramma: ignorati */ }
        ).catch(function(e) {
            _scannerRunning = false;
            if (reader) reader.style.display = 'none';
            if (btnCam) btnCam.style.display = 'block';
            if (btnStop) btnStop.style.display = 'none';
            ENI.UI.error('Impossibile aprire la fotocamera: ' + (e && e.message ? e.message : e));
        });
    }

    function _stopScanner(cb) {
        var reader = document.getElementById('vb-reader');
        var btnCam = document.getElementById('btn-vb-camera');
        var btnStop = document.getElementById('btn-vb-stop');
        if (reader) reader.style.display = 'none';
        if (btnStop) btnStop.style.display = 'none';
        if (btnCam) btnCam.style.display = 'block';

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

    // Il verdetto occupa spazio e sta fermo: va letto a braccio teso, non
    // inseguito mentre scompare come un messaggio di passaggio.
    function _mostraEsito(colore, titolo, dettaglio) {
        var el = document.getElementById('vb-esito');
        if (!el) return;
        el.innerHTML =
            '<div style="padding:var(--space-4); border-radius:var(--radius-md); text-align:center; ' +
                'border:2px solid ' + colore + '; color:' + colore + ';">' +
                '<div style="font-size:1.35rem; font-weight:800; line-height:1.25;">' + titolo + '</div>' +
                (dettaglio ? '<div style="margin-top:8px; font-size:1rem; font-weight:600;">' + dettaglio + '</div>' : '') +
            '</div>' +
            '<button class="btn btn-outline btn-block" id="btn-vb-altro" style="margin-top:var(--space-3);">Verifica un altro buono</button>';

        var altro = document.getElementById('btn-vb-altro');
        if (altro) altro.addEventListener('click', _schermataIniziale);
    }

    async function _verifica(codice) {
        var ean = String(codice || '').trim();
        if (!ean) {
            _mostraEsito('var(--color-warning)', 'Manca il codice',
                'Inquadra il buono o batti le sue 13 cifre.');
            return;
        }

        try {
            ENI.UI.showLoading();
            var buono = await ENI.API.cercaBuonoByEAN(ean);
            ENI.UI.hideLoading();

            if (!buono) {
                _mostraEsito('var(--color-danger)', '❌ CODICE NON VALIDO',
                    'Non è un buono nostro: ' + ENI.UI.escapeHtml(ean));
                return;
            }

            if (buono.stato === 'utilizzato') {
                var quando = buono.utilizzato_at
                    ? ENI.UI.formatData(buono.utilizzato_at)
                    : 'data non registrata';
                _mostraEsito('var(--color-danger)', '❌ CODICE NON VALIDO',
                    'Buono già utilizzato il ' + quando);
                return;
            }

            if (buono.stato === 'annullato') {
                _mostraEsito('var(--color-danger)', '❌ CODICE NON VALIDO',
                    'Questo buono è stato annullato.');
                return;
            }

            var intestato = (buono.clienti && buono.clienti.nome_ragione_sociale)
                ? '<br>Intestato a ' + ENI.UI.escapeHtml(buono.clienti.nome_ragione_sociale)
                : '';
            _mostraEsito('var(--color-success)', '✅ BUONO VALIDO',
                ENI.UI.formatValuta(buono.taglio) + intestato);

        } catch (e) {
            ENI.UI.hideLoading();
            _mostraEsito('var(--color-danger)', 'Non riesco a controllare',
                'Riprova fra un momento: ' + ENI.UI.escapeHtml(e.message || ''));
        }
    }

    return { render: render };
})();
