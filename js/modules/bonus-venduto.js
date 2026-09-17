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
    var _container = null;

    function _oggi() { return new Date(); }
    function _anno() { return _oggi().getFullYear(); }
    function _mese() { return _oggi().getMonth() + 1; }

    var NOMI_MESE = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
                     'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];

    async function render(container) {
        _container = container;
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
            if (errEl) errEl.innerHTML = '<div class="stock-alert">Errore: ' + ENI.UI.escapeHtml(e.message) + '</div>';
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
                    '<div class="text-sm text-muted" style="margin-top:6px;">Nessun articolo a bonus: chiedi al gestore di attivarne.</div>') +
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
                '<td style="text-align:center;">' + m.quantita + '</td>' +
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
    function _formVendita() {
        var opzioni = _articoli.map(function(a) {
            return '<option value="' + a.id + '">' + ENI.UI.escapeHtml(a.nome_prodotto) +
                   ' — ' + ENI.UI.formatValuta(a.prezzo_vendita) + '</option>';
        }).join('');

        var body =
            '<div class="form-group">' +
                '<label class="form-label form-label-required">Articolo</label>' +
                '<select class="form-select" id="bv-articolo">' + opzioni + '</select>' +
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
            var q = parseInt(modal.querySelector('#bv-qta').value, 10) || 0;
            modal.querySelector('#bv-prezzo').value = a ? ENI.UI.formatValuta(a.prezzo_vendita) : '';
            var b = a ? ENI.BonusCalcoli.bonusRiga(a.prezzo_vendita, q, _regola).bonus : 0;
            modal.querySelector('#bv-bonus').textContent = ENI.UI.formatValuta(b);
        }

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
            try {
                var res = await ENI.API.registraVenditaBonus(a.id, q, metodo);
                ENI.UI.closeModal(modal);
                ENI.UI.success('Registrato · bonus ' + ENI.UI.formatValuta(res && res.bonus));
                await _load();
            } catch(e) {
                btn.disabled = false;
                ENI.UI.error('Errore: ' + e.message);
            }
        });

        aggiorna();
    }

    return { render: render };
})();
