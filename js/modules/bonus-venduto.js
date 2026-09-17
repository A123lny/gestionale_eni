// ============================================================
// GESTIONALE ENI - Bonus venduto (lato dipendente)
// Portafoglio del mese, registrazione della vendita e storico.
// Ogni dipendente vede SOLO i propri movimenti (RLS lato DB).
// ============================================================

var ENI = ENI || {};
ENI.Modules = ENI.Modules || {};

ENI.Modules.BonusVenduto = (function() {
    'use strict';

    var _articoli = [];
    var _movimenti = [];
    var _periodi = [];
    var _regola = null;

    function _oggi() { return new Date(); }
    function _anno() { return _oggi().getFullYear(); }
    function _mese() { return _oggi().getMonth() + 1; }

    var NOMI_MESE = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
                     'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];

    async function render(container) {
        container.innerHTML =
            '<div class="page-header">' +
                '<h1 class="page-title">💰 Bonus venduto</h1>' +
            '</div>' +
            '<div id="bonus-corpo">' +
                '<div class="flex justify-center" style="padding:2rem;"><div class="spinner"></div></div>' +
            '</div>';
        await _load();
    }

    async function _load() {
        try {
            _regola    = await ENI.API.getRegolaBonus();
            _articoli  = await ENI.API.getArticoliBonus();
            _movimenti = await ENI.API.getMieiMovimentiBonus(_anno(), _mese());
            _periodi   = await ENI.API.getMieiPeriodiBonus();
        } catch(e) {
            var errEl = document.getElementById('bonus-corpo');
            if (errEl) {
                // Senza un modo per riprovare da qui, un dipendente col telefono
                // in mano resterebbe bloccato: non gli viene in mente di ricaricare
                // la pagina, e ripremere la voce di menu non serve (l'indirizzo
                // resta lo stesso, quindi la pagina non si ricarica da sola).
                errEl.innerHTML =
                    '<div class="stock-alert">Errore: ' + ENI.UI.escapeHtml(e.message) +
                        '<div style="margin-top:10px;">' +
                            '<button type="button" class="btn btn-outline" id="bonus-riprova">Riprova</button>' +
                        '</div>' +
                    '</div>';
                var btnRiprova = document.getElementById('bonus-riprova');
                if (btnRiprova) btnRiprova.addEventListener('click', function() {
                    btnRiprova.disabled = true;
                    _load();
                });
            }
            return;
        }
        _renderCorpo();
    }

    function _totali() {
        var venduto = 0, bonus = 0, pezzi = 0;
        _movimenti.forEach(function(m) {
            venduto += Number(m.imponibile || 0);
            bonus   += Number(m.bonus_calcolato || 0);
            pezzi   += Number(m.quantita || 0);
        });
        return { venduto: venduto, bonus: bonus, pezzi: pezzi };
    }

    function _renderCorpo() {
        var corpo = document.getElementById('bonus-corpo');
        if (!corpo) return;
        var t = _totali();

        var daRicevere = _periodi.filter(function(p) { return p.stato === 'da_pagare'; });
        var daRicevereHtml = daRicevere.length
            ? '<div style="margin-top:14px;">' +
                '<div class="text-sm" style="opacity:.8;">Da ricevere in busta</div>' +
                daRicevere.map(function(p) {
                    return '<div style="display:flex;justify-content:space-between;max-width:320px;">' +
                        '<span>' + NOMI_MESE[p.mese - 1] + ' ' + p.anno + '</span>' +
                        '<strong>' + ENI.UI.formatValuta(p.bonus_totale) + '</strong>' +
                    '</div>';
                }).join('') +
              '</div>'
            : '';

        corpo.innerHTML =
            '<div class="cassa-differenza ok" style="text-align:left;">' +
                '<div class="text-sm" style="opacity:.8;">Bonus di ' + NOMI_MESE[_mese() - 1] + '</div>' +
                '<div style="font-size:2rem;font-weight:700;">' + ENI.UI.formatValuta(t.bonus) + '</div>' +
                '<div class="text-sm">su ' + ENI.UI.formatValuta(t.venduto) + ' venduti · ' + t.pezzi + ' pezzi</div>' +
                daRicevereHtml +
            '</div>' +

            '<div style="margin:16px 0;">' +
                '<button type="button" class="btn btn-primary btn-lg" id="btn-ho-venduto" ' +
                    (_articoli.length ? '' : 'disabled ') + 'style="width:100%;max-width:420px;">' +
                    '🛒 Ho venduto' +
                '</button>' +
                (_articoli.length ? '' :
                    // Il bonus vale su tutta la merce di magazzino (tranne i lavaggi):
                    // non esiste piu' un interruttore da "attivare" articolo per
                    // articolo. Se l'elenco torna vuoto e' quasi certo che la
                    // lettura del magazzino non funzioni per questo utente (es. un
                    // ruolo senza permesso), non che manchi una configurazione.
                    '<div class="text-sm text-muted" style="margin-top:6px;">Non riesco a leggere nessun articolo di magazzino: segnalalo al gestore.</div>') +
            '</div>' +

            '<h3 style="margin-top:20px;">Le mie vendite di ' + NOMI_MESE[_mese() - 1] + '</h3>' +
            _tabellaMovimenti();

        var btn = document.getElementById('btn-ho-venduto');
        if (btn) btn.addEventListener('click', _formVendita);
    }

    function _tabellaMovimenti() {
        if (!_movimenti.length) {
            return '<div class="empty-state" style="padding:1.5rem;">' +
                '<p class="empty-state-text">Ancora nessuna vendita questo mese</p></div>';
        }
        var righe = _movimenti.map(function(m) {
            return '<tr>' +
                '<td>' + ENI.UI.formatData(m.created_at) + '</td>' +
                '<td>' + ENI.UI.escapeHtml(m.nome_prodotto) + '</td>' +
                '<td style="text-align:center;">' + ENI.UI.escapeHtml(m.quantita) + '</td>' +
                '<td>' + ENI.UI.formatValuta(m.imponibile) + '</td>' +
                '<td style="font-weight:600;color:var(--color-success);">' +
                    ENI.UI.formatValuta(m.bonus_calcolato) + '</td>' +
            '</tr>';
        }).join('');
        return '<div class="table-wrapper"><table class="table">' +
            '<thead><tr><th>Data</th><th>Articolo</th><th>Q.tà</th><th>Venduto</th><th>Bonus</th></tr></thead>' +
            '<tbody>' + righe + '</tbody></table></div>';
    }

    // Il dipendente deve sapere quanto prende PRIMA di confermare: su un bonus
    // da un euro e mezzo e' la differenza fra una cosa che motiva e un numero
    // che scopre a fine mese.
    // Con tutto il magazzino a bonus le voci sono centinaia: senza ricerca
    // il menu a tendina non e' usabile da un telefono, al banco.
    function _opzioni(filtro) {
        var f = (filtro || '').toLowerCase().trim();
        var visibili = _articoli.filter(function(a) {
            if (!f) return true;
            return String(a.nome_prodotto || '').toLowerCase().indexOf(f) !== -1 ||
                   String(a.codice || '').toLowerCase().indexOf(f) !== -1 ||
                   String(a.barcode || '').toLowerCase().indexOf(f) !== -1;
        });
        return visibili;
    }

    function _formVendita() {
        var body =
            '<div class="form-group">' +
                '<label class="form-label">Cerca</label>' +
                '<input type="text" class="form-input" id="bv-cerca" ' +
                    'placeholder="nome, codice o barcode" autocomplete="off">' +
            '</div>' +
            '<div class="form-group">' +
                '<label class="form-label form-label-required">Articolo</label>' +
                '<select class="form-select" id="bv-articolo"></select>' +
            '</div>' +
            '<div class="form-row">' +
                '<div class="form-group">' +
                    '<label class="form-label">Prezzo</label>' +
                    '<input type="text" class="form-input" id="bv-prezzo" readonly ' +
                        'title="Il prezzo è quello di listino e non si può cambiare">' +
                '</div>' +
                '<div class="form-group">' +
                    '<label class="form-label form-label-required">Quantità</label>' +
                    '<input type="number" min="1" step="1" value="1" class="form-input" id="bv-qta">' +
                '</div>' +
            '</div>' +
            '<div class="form-group">' +
                '<label class="form-label form-label-required">Come ha pagato</label>' +
                '<div style="display:flex;gap:10px;">' +
                    '<button type="button" class="btn btn-outline bv-metodo active" data-metodo="contanti" style="flex:1;">💵 Contanti</button>' +
                    '<button type="button" class="btn btn-outline bv-metodo" data-metodo="pos" style="flex:1;">💳 POS</button>' +
                '</div>' +
            '</div>' +
            '<div style="text-align:center;padding:12px;background:var(--color-gray-100);border-radius:8px;">' +
                '<div class="text-sm">Il tuo bonus</div>' +
                '<div style="font-size:1.6rem;font-weight:700;color:var(--color-success);" id="bv-bonus">€ 0,00</div>' +
            '</div>';

        var modal = ENI.UI.showModal({
            title: '🛒 Ho venduto',
            body: body,
            footer: '<button class="btn btn-outline" data-modal-close>Annulla</button>' +
                    '<button class="btn btn-primary" id="bv-conferma">✅ Registra</button>'
        });

        var metodo = 'contanti';

        function articoloScelto() {
            var id = modal.querySelector('#bv-articolo').value;
            return _articoli.filter(function(a) { return a.id === id; })[0] || null;
        }

        function aggiorna() {
            var a = articoloScelto();
            var qtaEl = modal.querySelector('#bv-qta');
            var q = parseInt(qtaEl.value, 10) || 0;
            modal.querySelector('#bv-prezzo').value = a ? ENI.UI.formatValuta(a.prezzo_vendita) : '';
            // Il tetto e' solo un aiuto: scopre subito il caso piu' probabile
            // (chiedere piu' pezzi di quelli in giacenza), ma il controllo che
            // conta resta quello del server.
            if (a) { qtaEl.max = a.giacenza; } else { qtaEl.removeAttribute('max'); }
            var b = a ? ENI.BonusCalcoli.bonusRiga(a.prezzo_vendita, q, _regola).bonus : 0;
            modal.querySelector('#bv-bonus').textContent = ENI.UI.formatValuta(b);
        }

        // Ridisegna le <option> a ogni digitazione nel campo di ricerca. Se
        // l'articolo scelto resta tra i visibili la selezione non si perde;
        // altrimenti il menu ricade sul primo risultato (o su "nessun
        // articolo trovato", che disabilita il selettore invece di lasciarlo
        // vuoto e muto). In ogni caso si richiama aggiorna(), perche' prezzo,
        // tetto e anteprima del bonus dipendono da cosa resta selezionato.
        function _disegnaOpzioni(filtro) {
            var sel = modal.querySelector('#bv-articolo');
            var precedente = sel.value;
            var visibili = _opzioni(filtro);

            if (!visibili.length) {
                sel.innerHTML = '<option value="">— nessun articolo trovato —</option>';
                sel.disabled = true;
                aggiorna();
                return;
            }

            sel.disabled = false;
            // Opzione vuota in cima: su centinaia di articoli, senza, il primo in
            // ordine alfabetico risulterebbe gia' selezionato da solo, e basterebbe
            // un tocco sbagliato su "Registra" per vendere l'articolo sbagliato.
            sel.innerHTML = '<option value="">— scegli un articolo —</option>' +
                visibili.map(function(a) {
                    return '<option value="' + ENI.UI.escapeHtml(a.id) + '">' + ENI.UI.escapeHtml(a.nome_prodotto) +
                           ' — ' + ENI.UI.formatValuta(a.prezzo_vendita) +
                           ' · giac. ' + String(a.giacenza) + '</option>';
                }).join('');
            if (visibili.some(function(a) { return a.id === precedente; })) {
                sel.value = precedente;
            }
            aggiorna();
        }

        modal.querySelector('#bv-cerca').addEventListener('input', function(e) {
            _disegnaOpzioni(e.target.value);
        });
        _disegnaOpzioni('');

        modal.querySelector('#bv-articolo').addEventListener('change', aggiorna);
        modal.querySelector('#bv-qta').addEventListener('input', aggiorna);
        modal.querySelectorAll('.bv-metodo').forEach(function(b) {
            b.addEventListener('click', function() {
                metodo = b.dataset.metodo;
                modal.querySelectorAll('.bv-metodo').forEach(function(x) { x.classList.remove('active'); });
                b.classList.add('active');
            });
        });

        modal.querySelector('#bv-conferma').addEventListener('click', async function() {
            var a = articoloScelto();
            var q = parseInt(modal.querySelector('#bv-qta').value, 10) || 0;
            if (!a || q < 1) { ENI.UI.warning('Scegli articolo e quantità'); return; }

            var btn = modal.querySelector('#bv-conferma');
            btn.disabled = true;
            // Il velo di showLoading copre anche Esc, la X e lo sfondo: senza,
            // una connessione lenta lascerebbe la finestra aperta e apparentemente
            // ferma, e il dipendente potrebbe chiuderla e riprovare da capo,
            // registrando due volte la stessa vendita.
            ENI.UI.showLoading();
            try {
                var anteprima = ENI.BonusCalcoli.bonusRiga(a.prezzo_vendita, q, _regola).bonus;
                var res = await ENI.API.registraVenditaBonus(a.id, q, metodo);
                var vero = Number(res && res.bonus) || 0;

                ENI.UI.hideLoading();
                ENI.UI.closeModal(modal);
                if (Math.abs(vero - anteprima) > 0.005) {
                    // La regola o il prezzo sono cambiati mentre la pagina era
                    // aperta: meglio dirlo che lasciare il dipendente convinto
                    // di aver preso una cifra diversa da quella accreditata.
                    ENI.UI.warning('Registrato · bonus ' + ENI.UI.formatValuta(vero) +
                        ' (l\'anteprima diceva ' + ENI.UI.formatValuta(anteprima) +
                        ': la regola è cambiata nel frattempo)');
                } else {
                    ENI.UI.success('Registrato · bonus ' + ENI.UI.formatValuta(vero));
                }
                await _load();
            } catch(e) {
                ENI.UI.hideLoading();
                btn.disabled = false;
                ENI.UI.error('Errore: ' + e.message);
            }
        });

        aggiorna();
    }

    return { render: render };
})();
