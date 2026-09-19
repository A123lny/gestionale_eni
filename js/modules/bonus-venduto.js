// ============================================================
// GESTIONALE ENI - Bonus venduto (lato dipendente)
//
// SOLA LETTURA. Da qui non si vende: le vendite si registrano dal modulo
// Vendite come tutte le altre, e un innesco sul database crea il movimento
// bonus per ogni riga che ne ha diritto. Questa pagina mostra il maturato del
// mese, l'elenco delle proprie righe e i mesi chiusi da riscuotere.
//
// Conseguenza voluta: il bonus non si calcola piu' anche qui. Finche' c'era
// l'anteprima, la stessa aritmetica viveva in JavaScript e in SQL e poteva
// divergere di un centesimo - il dipendente vedeva una cifra e ne incassava
// un'altra. Ora il numero e' uno solo, scritto dal database.
//
// Ogni dipendente vede SOLO i propri movimenti (RLS lato DB).
// ============================================================

var ENI = ENI || {};
ENI.Modules = ENI.Modules || {};

ENI.Modules.BonusVenduto = (function() {
    'use strict';

    var _movimenti = [];
    var _periodi = [];

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

            // Da qui non si vende: le vendite si registrano dal modulo Vendite,
            // come tutte le altre, e il bonus si aggancia da solo. Questa pagina
            // e' uno specchio, non un registratore di cassa.
            '<p class="text-sm text-muted" style="margin:14px 0;">' +
                'Le vendite si registrano da <strong>Vendite</strong>, come sempre: ' +
                'quelle che danno bonus compaiono qui da sole.</p>' +

            '<h3 style="margin-top:20px;">Le mie vendite di ' + NOMI_MESE[_mese() - 1] + '</h3>' +
            _tabellaMovimenti();
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

    return { render: render };
})();
