// ============================================================
// GESTIONALE ENI - Bonus venduto (lato gestore)
// Riepilogo per mese e dipendente, correzione delle righe, pagamento.
//
// "Congelato" non vuol dire immutabile: un mese chiuso non si ricalcola da
// solo, ma il gestore puo' correggere tutto, sempre, anche dopo aver pagato.
// Ogni gesto finisce nel log.
// ============================================================

var ENI = ENI || {};
ENI.Modules = ENI.Modules || {};

ENI.Modules.BonusGestione = (function() {
    'use strict';

    var _anno = new Date().getFullYear();
    var _mese = new Date().getMonth() + 1;
    var _personale = [];
    var _movimenti = [];
    var _periodi = [];

    var NOMI_MESE = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
                     'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];

    function _isMeseInCorso() {
        var o = new Date();
        return _anno === o.getFullYear() && _mese === (o.getMonth() + 1);
    }

    async function render(container) {
        container.innerHTML =
            '<div class="page-header"><h1 class="page-title">💰 Bonus venduto</h1></div>' +
            '<div class="flex gap-3 items-center" style="flex-wrap:wrap;margin-bottom:14px;">' +
                '<select class="form-select" id="bg-mese" style="max-width:160px;"></select>' +
                '<select class="form-select" id="bg-anno" style="max-width:120px;"></select>' +
                '<button class="btn btn-primary btn-sm" id="bg-carica">🔍 Carica</button>' +
            '</div>' +
            '<div id="bg-lista"><div class="flex justify-center" style="padding:2rem;"><div class="spinner"></div></div></div>';

        var selM = container.querySelector('#bg-mese');
        selM.innerHTML = NOMI_MESE.map(function(n, i) {
            return '<option value="' + (i + 1) + '"' + ((i + 1) === _mese ? ' selected' : '') + '>' + n + '</option>';
        }).join('');
        var selA = container.querySelector('#bg-anno');
        var y = new Date().getFullYear();
        var opt = '';
        for (var a = y; a >= y - 3; a--) opt += '<option value="' + a + '"' + (a === _anno ? ' selected' : '') + '>' + a + '</option>';
        selA.innerHTML = opt;

        container.querySelector('#bg-carica').addEventListener('click', function() {
            _mese = parseInt(selM.value, 10);
            _anno = parseInt(selA.value, 10);
            _load();
        });

        await _load();
    }

    async function _load() {
        var lista = document.getElementById('bg-lista');
        if (lista) lista.innerHTML = '<div class="flex justify-center" style="padding:2rem;"><div class="spinner"></div></div>';
        try {
            _personale = await ENI.API.getPersonale();
            _movimenti = await ENI.API.getMovimentiBonus(_anno, _mese);
            _periodi   = await ENI.API.getPeriodiBonus(_anno, _mese);
            await _chiudiPeriodiMancanti();
        } catch(e) {
            if (lista) lista.innerHTML = '<div class="stock-alert">Errore: ' + ENI.UI.escapeHtml(e.message) + '</div>';
            return;
        }
        _render();
    }

    // Chiusura del mese: il periodo nasce alla prima apertura della scheda dopo
    // che il mese e' finito, con i valori congelati. Da quel momento non si
    // ricalcola piu' da solo: lo fa solo un gesto del gestore.
    // Senza questo, lo stato 'da_pagare' non esisterebbe mai e il dipendente non
    // vedrebbe mai il riquadro "Da ricevere in busta".
    async function _chiudiPeriodiMancanti() {
        if (_isMeseInCorso()) return;   // un mese non finito non si chiude

        var daCreare = _personale.filter(function(p) {
            return _totaliDi(p.id).pezzi > 0 && !_periodoDi(p.id);
        });
        if (!daCreare.length) return;

        for (var i = 0; i < daCreare.length; i++) {
            var p = daCreare[i];
            var t = _totaliDi(p.id);
            try {
                await ENI.API.salvaPeriodoBonus({
                    personale_id: p.id,
                    anno: _anno, mese: _mese,
                    venduto: t.venduto,
                    bonus_totale: t.bonus,
                    forzato: false,
                    stato: 'da_pagare',
                    updated_at: new Date().toISOString()
                });
            } catch (e) {
                ENI.UI.error('Non sono riuscito a chiudere il mese di ' +
                    p.nome_completo + ': ' + e.message);
            }
        }
        _periodi = await ENI.API.getPeriodiBonus(_anno, _mese);
    }

    function _totaliDi(personaleId) {
        var venduto = 0, bonus = 0, pezzi = 0;
        _movimenti.forEach(function(m) {
            if (m.personale_id !== personaleId) return;
            venduto += Number(m.imponibile || 0);
            bonus   += Number(m.bonus_calcolato || 0);
            pezzi   += Number(m.quantita || 0);
        });
        return { venduto: venduto, bonus: bonus, pezzi: pezzi };
    }

    function _periodoDi(personaleId) {
        return _periodi.filter(function(p) { return p.personale_id === personaleId; })[0] || null;
    }

    // Nota sui listener: questo #bg-lista NON viene ricreato ad ogni giro. Il
    // nodo e' creato una sola volta in render(); _render() (chiamata da _load,
    // a sua volta richiamata da "Carica", paga/riapri/ricalcola/forza e dalla
    // chiusura del modale righe) si limita a sovrascriverne l'innerHTML. Un
    // addEventListener diretto qui si accumulerebbe ad ogni ricarica -
    // ENI.UI.delegate ha la guardia anti-duplicati (un flag sul nodo stesso)
    // e va usato apposta per questo motivo.
    function _render() {
        var lista = document.getElementById('bg-lista');
        if (!lista) return;

        var conAttivita = _personale.filter(function(p) {
            return _totaliDi(p.id).pezzi > 0 || _periodoDi(p.id);
        });

        if (!conAttivita.length) {
            lista.innerHTML = '<div class="empty-state" style="padding:2rem;">' +
                '<p class="empty-state-text">Nessun bonus in ' + NOMI_MESE[_mese - 1] + ' ' + _anno + '</p></div>';
            return;
        }

        var righe = conAttivita.map(function(p) {
            var t = _totaliDi(p.id);
            var per = _periodoDi(p.id);
            var disallineato = per && !per.forzato &&
                Math.abs(Number(per.bonus_totale) - t.bonus) > 0.005;

            // Il mese in corso non ha (di norma) un periodo chiuso: mostra
            // "in corso" accanto allo stato vero, senza nasconderlo - se un
            // periodo esiste comunque (es. forzato prima della chiusura),
            // resta visibile.
            var statoReale = per
                ? (per.stato === 'pagato'
                    ? '<span class="badge badge-success">pagato</span>'
                    : '<span class="badge badge-warning">da pagare</span>')
                : '';
            var stato = _isMeseInCorso()
                ? '<span class="badge badge-gray">in corso</span>' + (statoReale ? ' ' + statoReale : '')
                : (per ? statoReale : '<span class="badge badge-gray">da chiudere</span>');

            var azioni = '';
            if (!_isMeseInCorso()) {
                if (!per || per.stato !== 'pagato') {
                    azioni += '<button class="btn btn-sm btn-primary" data-paga="' + p.id + '">💶 Segna pagato</button> ';
                } else {
                    azioni += '<button class="btn btn-sm btn-outline" data-riapri="' + p.id + '">↩️ Riapri</button> ';
                }
                azioni += '<button class="btn btn-sm btn-outline" data-forza="' + p.id + '">✏️ Forza totale</button> ';
            }
            azioni += '<button class="btn btn-sm btn-outline" data-righe="' + p.id + '">📋 Righe</button>';

            return '<tr>' +
                '<td>' + ENI.UI.escapeHtml(p.nome_completo) + '</td>' +
                '<td>' + ENI.UI.formatValuta(t.venduto) + '</td>' +
                '<td style="text-align:center;">' + t.pezzi + '</td>' +
                '<td style="font-weight:600;">' + ENI.UI.formatValuta(per && per.forzato ? per.bonus_totale : t.bonus) +
                    (per && per.forzato ? ' <span class="text-xs text-muted">(forzato)</span>' : '') + '</td>' +
                '<td>' + stato + '</td>' +
                '<td>' + azioni + '</td>' +
            '</tr>' +
            (disallineato
                ? '<tr><td colspan="6" class="stock-alert" style="font-size:.85rem;">' +
                    '⚠️ ' + NOMI_MESE[_mese - 1] + ': il maturato registrato (' +
                    ENI.UI.formatValuta(per.bonus_totale) + ') <strong>non corrisponde</strong> più ai movimenti (' +
                    ENI.UI.formatValuta(t.bonus) + '). ' +
                    '<button class="btn btn-sm btn-outline" data-ricalcola="' + p.id + '">🔄 Ricalcola</button>' +
                  '</td></tr>'
                : '');
        }).join('');

        lista.innerHTML = '<div class="table-wrapper"><table class="table">' +
            '<thead><tr><th>Dipendente</th><th>Venduto</th><th>Pezzi</th><th>Bonus</th><th>Stato</th><th></th></tr></thead>' +
            '<tbody>' + righe + '</tbody></table></div>';

        ENI.UI.delegate(lista, 'click', 'button', _onClick);
    }

    async function _onClick(e, b) {
        if (b.dataset.paga)      return _segnaPagato(b.dataset.paga, 'pagato');
        if (b.dataset.riapri)    return _segnaPagato(b.dataset.riapri, 'da_pagare');
        if (b.dataset.ricalcola) return _ricalcola(b.dataset.ricalcola);
        if (b.dataset.forza)     return _forzaTotale(b.dataset.forza);
        if (b.dataset.righe)     return _mostraRighe(b.dataset.righe);
    }

    // "Segna pagato" e "Riapri" cambiano SOLO lo stato: non toccano mai
    // l'importo di un periodo che esiste gia'. Se lo riscrivessero con il
    // totale ricalcolato al volo, un cambio di stato diventerebbe un
    // ricalcolo silenzioso - esattamente cio' che questa schermata non deve
    // fare. L'importo dei movimenti correnti (t.venduto/t.bonus) si usa SOLO
    // quando il periodo non esiste ancora, cioe' alla sua creazione.
    async function _segnaPagato(personaleId, stato) {
        var t = _totaliDi(personaleId);
        var per = _periodoDi(personaleId);
        try {
            await ENI.API.salvaPeriodoBonus({
                personale_id: personaleId,
                anno: _anno, mese: _mese,
                venduto:      per ? per.venduto      : t.venduto,
                bonus_totale: per ? per.bonus_totale : t.bonus,
                forzato:      !!(per && per.forzato),
                stato: stato,
                pagato_at: stato === 'pagato' ? new Date().toISOString() : null,
                pagato_da: stato === 'pagato' ? ENI.State.getUserId() : null,
                updated_at: new Date().toISOString()
            });
            ENI.UI.success(stato === 'pagato' ? 'Segnato come pagato' : 'Periodo riaperto');
            await _load();
        } catch(err) {
            ENI.UI.error('Errore: ' + err.message);
        }
    }

    async function _ricalcola(personaleId) {
        try {
            var res = await ENI.API.ricalcolaPeriodoBonus(personaleId, _anno, _mese);
            // La funzione del database esclude i periodi forzati (and forzato is
            // false nell'UPDATE): senza guardare "aggiornato" qui, chi preme
            // leggerebbe sempre "fatto" anche quando non e' cambiato niente, e
            // l'avviso rosso resterebbe li' senza spiegazione.
            if (res && res.aggiornato === false) {
                ENI.UI.warning('Il totale è forzato a mano: togli la forzatura ("✏️ Forza totale" → 🔓) prima di ricalcolare.');
            } else {
                ENI.UI.success('Periodo ricalcolato');
            }
            await _load();
        } catch(err) {
            ENI.UI.error('Errore: ' + err.message);
        }
    }

    // Scrittura diretta del totale: da qui in avanti il ricalcolo non lo
    // tocca piu' (lo garantisce anche la funzione del database, che esclude
    // i periodi forzati). Si puo' anche rimuovere la forzatura: il numero in
    // database resta quello forzato finche' il gestore non preme Ricalcola -
    // rimuovere il blocco non deve mai, da solo, cambiare una cifra.
    function _forzaTotale(personaleId) {
        var pers = _personale.filter(function(p) { return p.id === personaleId; })[0];
        var per = _periodoDi(personaleId);
        var t = _totaliDi(personaleId);
        var attuale = per && per.forzato ? per.bonus_totale : t.bonus;

        var body =
            '<p class="text-sm text-muted" style="margin-top:0;">Il totale forzato non viene più toccato dal ricalcolo, ' +
                'nemmeno da "Segna pagato" o "Riapri".</p>' +
            '<div class="form-group"><label class="form-label">Bonus totale (€)</label>' +
                '<input type="number" step="0.01" min="0" class="form-input" id="bg-forza-val" value="' +
                Number(attuale).toFixed(2) + '"></div>';

        var footer = '<button class="btn btn-outline" data-modal-close>Annulla</button>';
        if (per && per.forzato) {
            footer += '<button class="btn btn-outline" id="bg-forza-rimuovi">🔓 Rimuovi forzatura</button>';
        }
        footer += '<button class="btn btn-primary" id="bg-forza-salva">Salva</button>';

        var modal = ENI.UI.showModal({
            title: '✏️ Forza totale — ' + (pers ? pers.nome_completo : ''),
            body: body,
            footer: footer
        });

        modal.querySelector('#bg-forza-salva').addEventListener('click', async function() {
            var val = parseFloat(modal.querySelector('#bg-forza-val').value);
            if (isNaN(val) || val < 0) { ENI.UI.warning('Importo non valido'); return; }

            // Stessa guardia dell'aggiunta a mano: forzare il totale di un
            // periodo gia' pagato ne cambia il maturato registrato, non
            // quanto e' stato versato.
            if (per && per.stato === 'pagato') {
                var ok = await ENI.UI.confirm({
                    title: 'Il mese è già stato pagato',
                    message: 'Questo periodo risulta pagato: forzare il totale ne cambia il maturato registrato, non l\'importo già versato al dipendente.',
                    confirmText: 'Forza comunque', cancelText: 'Annulla'
                });
                if (!ok) return;
            }

            try {
                await ENI.API.salvaPeriodoBonus({
                    personale_id: personaleId,
                    anno: _anno, mese: _mese,
                    venduto:      per ? per.venduto : t.venduto,
                    bonus_totale: val,
                    forzato: true,
                    stato: per ? per.stato : 'da_pagare',
                    updated_at: new Date().toISOString()
                });
                ENI.UI.success('Totale forzato');
                ENI.UI.closeModal(modal);
                await _load();
            } catch(err) { ENI.UI.error('Errore: ' + err.message); }
        });

        var btnRimuovi = modal.querySelector('#bg-forza-rimuovi');
        if (btnRimuovi) {
            btnRimuovi.addEventListener('click', async function() {
                try {
                    // Si spegne solo il flag: l'importo forzato resta scritto
                    // finche' non arriva un Ricalcola esplicito.
                    await ENI.API.salvaPeriodoBonus({
                        personale_id: personaleId,
                        anno: _anno, mese: _mese,
                        venduto: per.venduto,
                        bonus_totale: per.bonus_totale,
                        forzato: false,
                        stato: per.stato,
                        updated_at: new Date().toISOString()
                    });
                    ENI.UI.success('Forzatura rimossa');
                    ENI.UI.closeModal(modal);
                    await _load();
                } catch(err) { ENI.UI.error('Errore: ' + err.message); }
            });
        }
    }

    function _mostraRighe(personaleId) {
        var pers = _personale.filter(function(p) { return p.id === personaleId; })[0];
        var righe = _movimenti.filter(function(m) { return m.personale_id === personaleId; });

        var body = righe.length
            ? '<div class="table-wrapper"><table class="table"><thead><tr>' +
                '<th>Data</th><th>Articolo</th><th>Q.tà</th><th>Venduto</th><th>Bonus</th><th></th>' +
              '</tr></thead><tbody>' +
              righe.map(function(m) {
                  return '<tr>' +
                      '<td>' + ENI.UI.formatData(m.created_at) + '</td>' +
                      '<td>' + ENI.UI.escapeHtml(m.nome_prodotto) +
                          (!m.vendita_id ? ' <span class="badge badge-gray text-xs">a mano</span>' : '') + '</td>' +
                      '<td><input type="number" min="1" class="form-input bg-qta" style="max-width:70px;" ' +
                          'data-id="' + m.id + '" value="' + m.quantita + '"></td>' +
                      '<td>' + ENI.UI.formatValuta(m.imponibile) + '</td>' +
                      '<td><input type="number" step="0.01" min="0" class="form-input bg-bonus" style="max-width:90px;" ' +
                          'data-id="' + m.id + '" value="' + Number(m.bonus_calcolato).toFixed(2) + '"></td>' +
                      '<td>' +
                          '<button class="btn btn-sm bg-salva" data-id="' + m.id + '" title="Salva">💾</button>' +
                          '<button class="btn btn-sm bg-del" data-id="' + m.id + '" data-desc="' +
                              ENI.UI.escapeHtml(m.nome_prodotto) + '" title="Elimina" ' +
                              'style="color:var(--color-danger);">✕</button>' +
                      '</td>' +
                  '</tr>';
              }).join('') + '</tbody></table></div>'
            : '<p class="text-muted">Nessuna riga in questo mese.</p>';

        var modal = ENI.UI.showModal({
            title: '📋 ' + (pers ? pers.nome_completo : '') + ' — ' + NOMI_MESE[_mese - 1] + ' ' + _anno,
            body: body,
            footer: '<button class="btn btn-outline" data-add-manuale>➕ Aggiungi riga a mano</button>' +
                    '<button class="btn btn-outline" data-modal-close>Chiudi</button>'
        });

        // Il modale e' un nodo nuovo ad ogni apertura (showModal ne crea uno e
        // closeModal lo rimuove): qui addEventListener diretto non si accumula.
        modal.addEventListener('click', async function(e) {
            if (e.target.closest('[data-add-manuale]')) {
                _formRigaManuale(personaleId, modal);
                return;
            }

            var salva = e.target.closest('.bg-salva');
            if (salva) {
                var id = salva.dataset.id;
                var m = righe.filter(function(x) { return x.id === id; })[0];
                var qta = parseInt(modal.querySelector('.bg-qta[data-id="' + id + '"]').value, 10);
                var bon = parseFloat(modal.querySelector('.bg-bonus[data-id="' + id + '"]').value);
                if (isNaN(qta) || qta < 1 || isNaN(bon) || bon < 0) {
                    ENI.UI.warning('Quantità e bonus non validi');
                    return;
                }
                try {
                    var dati = { quantita: qta, bonus_calcolato: bon };
                    // L'imponibile si ritocca SOLO se la quantita' e' cambiata
                    // davvero: su una riga aggiunta a mano prezzo_unitario e'
                    // gia' arrotondato (venduto/quantita), e ricalcolarlo ad
                    // ogni salvataggio - anche quando si corregge solo il
                    // bonus - eroderebbe il venduto di un centesimo per volta.
                    if (qta !== Number(m.quantita) && Number(m.prezzo_unitario) > 0) {
                        dati.imponibile = ENI.BonusCalcoli.arrotonda(Number(m.prezzo_unitario) * qta);
                    }
                    await ENI.API.aggiornaMovimentoBonus(id, dati,
                        'qta ' + m.quantita + ', venduto ' + ENI.UI.formatValuta(m.imponibile) +
                        ', bonus ' + ENI.UI.formatValuta(m.bonus_calcolato));
                    ENI.UI.success('Riga corretta');
                    ENI.UI.closeModal(modal);
                    await _load();
                } catch(err) { ENI.UI.error('Errore: ' + err.message); }
                return;
            }

            var del = e.target.closest('.bg-del');
            if (del) {
                var ok = await ENI.UI.confirm({
                    title: 'Eliminare la riga?',
                    message: 'Il bonus di "' + del.dataset.desc + '" verrà tolto dal maturato.',
                    confirmText: 'Elimina', cancelText: 'Annulla'
                });
                if (!ok) return;
                try {
                    await ENI.API.eliminaMovimentoBonus(del.dataset.id, del.dataset.desc);
                    ENI.UI.success('Riga eliminata');
                    ENI.UI.closeModal(modal);
                    await _load();
                } catch(err) { ENI.UI.error('Errore: ' + err.message); }
            }
        });
    }

    // Riga per una vendita avvenuta fuori dal sistema (es. pagata a mano,
    // mai passata dal magazzino): il gestore la registra qui perche' resti
    // traccia nel maturato del dipendente. Chiude anche il modale delle
    // righe, che va ricaricato con il dato nuovo.
    function _formRigaManuale(personaleId, righeModal) {
        var body =
            '<div class="form-group"><label class="form-label">Descrizione</label>' +
                '<input type="text" class="form-input" id="bg-man-desc" placeholder="Es. vendita fuori sistema"></div>' +
            '<div class="form-group"><label class="form-label">Quantità</label>' +
                '<input type="number" min="1" class="form-input" id="bg-man-qta" value="1"></div>' +
            '<div class="form-group"><label class="form-label">Venduto (€)</label>' +
                '<input type="number" step="0.01" min="0" class="form-input" id="bg-man-venduto" value="0"></div>' +
            '<div class="form-group"><label class="form-label">Bonus (€)</label>' +
                '<input type="number" step="0.01" min="0" class="form-input" id="bg-man-bonus" value="0"></div>';

        var modal = ENI.UI.showModal({
            title: '➕ Riga a mano',
            body: body,
            footer: '<button class="btn btn-outline" data-modal-close>Annulla</button>' +
                    '<button class="btn btn-primary" id="bg-man-salva">Salva</button>'
        });

        modal.querySelector('#bg-man-salva').addEventListener('click', async function() {
            var desc = (modal.querySelector('#bg-man-desc').value || '').trim();
            var qta = parseInt(modal.querySelector('#bg-man-qta').value, 10);
            var venduto = parseFloat(modal.querySelector('#bg-man-venduto').value);
            var bonus = parseFloat(modal.querySelector('#bg-man-bonus').value);
            if (!desc) { ENI.UI.warning('Inserisci una descrizione'); return; }
            if (isNaN(qta) || qta < 1 || isNaN(venduto) || venduto < 0 || isNaN(bonus) || bonus < 0) {
                ENI.UI.warning('Valori non validi');
                return;
            }

            // Stesso effetto sul maturato di un'eliminazione, segno opposto:
            // su un mese gia' pagato serve la stessa guardia.
            var per = _periodoDi(personaleId);
            if (per && per.stato === 'pagato') {
                var ok = await ENI.UI.confirm({
                    title: 'Il mese è già stato pagato',
                    message: 'Questo periodo risulta pagato: aggiungere una riga ne cambia il maturato registrato, non l\'importo già versato al dipendente.',
                    confirmText: 'Aggiungi comunque', cancelText: 'Annulla'
                });
                if (!ok) return;
            }

            try {
                await ENI.API.aggiungiMovimentoBonus({
                    personale_id: personaleId,
                    anno: _anno, mese: _mese,
                    nome_prodotto: desc,
                    quantita: qta,
                    prezzo_unitario: ENI.BonusCalcoli.arrotonda(venduto / qta),
                    imponibile: venduto,
                    bonus_calcolato: bonus,
                    modificato_da: ENI.State.getUserId(),
                    modificato_at: new Date().toISOString()
                });
                ENI.UI.success('Riga aggiunta');
                ENI.UI.closeModal(modal);
                if (righeModal) ENI.UI.closeModal(righeModal);
                await _load();
            } catch(err) { ENI.UI.error('Errore: ' + err.message); }
        });
    }

    return { render: render };
})();
