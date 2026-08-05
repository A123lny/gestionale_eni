// ============================================================
// FATTURAZIONE - Export Bancari (RIBA .car + RID .xml SEPA SDD)
// Tab 4 con anteprima, filtri, generazione e download
// ============================================================

var ENI = ENI || {};
ENI.Fatturazione = ENI.Fatturazione || {};

ENI.Fatturazione.ExportBancari = (function() {
    'use strict';

    var _container = null;
    var _meseSelez = new Date().getMonth(); // mese precedente
    var _annoSelez = new Date().getFullYear();
    var _fatture = [];
    var _impostazioni = null;

    async function render(container) {
        _container = container;
        if (_meseSelez === 0) { _meseSelez = 12; _annoSelez--; }

        container.innerHTML =
            '<div class="card"><div class="card-body">' +
            '<h3 class="mb-3">Export bancari (RIBA / RID)</h3>' +
            '<div id="exp-non-partite"></div>' +
            '<div id="exp-clienti-rischio"></div>' +
            '<div class="form-row" style="align-items:flex-end;gap:0.5rem;margin-bottom:1rem;">' +
                '<div class="form-group"><label class="form-label">Mese</label>' +
                    '<select class="form-select" id="exp-mese">' + _meseOptions() + '</select></div>' +
                '<div class="form-group"><label class="form-label">Anno</label>' +
                    '<input type="number" class="form-input" id="exp-anno" value="' + _annoSelez + '" min="2024" max="2040"></div>' +
                '<div class="form-group"><label class="form-label">Banca emittente</label>' +
                    '<select class="form-select" id="exp-banca"></select></div>' +
                '<button class="btn btn-primary" id="exp-carica" style="margin-bottom:0.75rem;">Carica</button>' +
            '</div>' +
            '<div id="exp-content"></div>' +
            '</div></div>';

        // Carica impostazioni e popola banche
        try {
            _impostazioni = await ENI.API.getImpostazioniFatturazione();
        } catch(e) {}
        _popolaBanche();

        document.getElementById('exp-carica').addEventListener('click', _caricaFatture);
        await _caricaFatture();
        _caricaNonPartite();
        _caricaClientiRischio();
    }

    // ============================================================
    // CLIENTI A RISCHIO (problema a monte, prima che diventi una fattura)
    // ============================================================
    // Un cliente con anagrafica RID/RIBA ma senza i dati per incassare non da' fastidio
    // finche' non gli emetti la prima fattura: da quel momento viene scartato ogni mese.
    // Qui si chiude alla radice, sull'anagrafica, invece che fattura per fattura.
    var _clientiRischio = [];

    async function _caricaClientiRischio() {
        var box = document.getElementById('exp-clienti-rischio');
        if (!box) return;
        try {
            var tutti = await ENI.API.getClienti();
            _clientiRischio = (tutti || []).filter(function(c) {
                var m = c.modalita_pagamento_fattura;
                if (m !== 'RID_SDD' && m !== 'RIBA') return false;
                return _problemiCliente(c, m === 'RID_SDD' ? 'rid' : 'riba').length > 0;
            });
        } catch(e) {
            box.innerHTML = '<p class="text-danger text-xs">Impossibile controllare i clienti a rischio: ' +
                ENI.UI.escapeHtml(e.message) + '</p>';
            return;
        }
        box.innerHTML = _renderClientiRischio();
        _attachClientiRischioHandlers();
    }

    function _renderClientiRischio() {
        if (!_clientiRischio.length) return '';

        var rows = _clientiRischio.map(function(c, i) {
            var isRid = c.modalita_pagamento_fattura === 'RID_SDD';
            var problemi = _problemiCliente(c, isRid ? 'rid' : 'riba');
            // Campi per completare i dati mancanti senza uscire da qui
            var campi = isRid ?
                '<input type="text" class="form-input cr-mandato" data-idx="' + i + '" maxlength="50" ' +
                    'placeholder="codice mandato" style="min-width:180px;">' :
                '<input type="text" class="form-input cr-abi" data-idx="' + i + '" maxlength="5" ' +
                    'placeholder="ABI" style="max-width:80px;"> ' +
                '<input type="text" class="form-input cr-cab" data-idx="' + i + '" maxlength="5" ' +
                    'placeholder="CAB" style="max-width:80px;">';
            return '<tr>' +
                '<td><input type="checkbox" class="cr-check" data-idx="' + i + '"></td>' +
                '<td>' + ENI.UI.escapeHtml(c.nome_ragione_sociale || '') + '</td>' +
                '<td class="text-xs">' + (isRid ? 'RID / SDD' : 'RI.BA.') + '</td>' +
                '<td class="text-xs text-danger">' + ENI.UI.escapeHtml(problemi.join(', ')) + '</td>' +
                '<td>' + campi + '</td>' +
            '</tr>';
        }).join('');

        return '<details style="background:var(--color-warning-bg,#fff3cd);border-left:3px solid var(--color-warning,#ffc107);' +
            'padding:0.75rem;margin-bottom:1rem;border-radius:4px;">' +
            '<summary style="cursor:pointer;font-weight:600;">⚠ ' + _clientiRischio.length +
                ' clienti a rischio: anagrafica RID/RIBA ma dati per incassare incompleti</summary>' +
            '<div class="text-xs mt-2">Non stanno causando danni adesso, ma ognuno verrà scartato alla sua prima fattura. ' +
                'Se il mandato esiste in banca, scrivilo qui e resta in RID; altrimenti spostalo a un\'altra modalità.</div>' +
            '<div class="table-wrapper mt-2"><table class="table table-sm">' +
            '<thead><tr><th style="width:30px;"><input type="checkbox" id="cr-check-all"></th>' +
            '<th>Cliente</th><th>Modalità</th><th>Manca</th><th>Completa qui</th></tr></thead>' +
            '<tbody>' + rows + '</tbody></table></div>' +
            '<div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;margin-top:0.5rem;">' +
                '<button class="btn btn-primary btn-sm" id="cr-salva-dati">Salva i dati compilati</button>' +
                '<span class="text-xs" style="margin-left:1rem;">oppure sposta le selezionate a:</span>' +
                '<select class="form-select" id="cr-modalita" style="max-width:170px;">' +
                    ['BONIFICO','CONTANTI','FINE_MESE','RIBA','RID_SDD'].map(function(v) {
                        return '<option value="' + v + '">' + v + '</option>';
                    }).join('') +
                '</select>' +
                '<button class="btn btn-outline btn-sm" id="cr-cambia-modalita">Cambia modalità</button>' +
            '</div></details>';
    }

    function _attachClientiRischioHandlers() {
        var all = document.getElementById('cr-check-all');
        if (all) {
            all.addEventListener('change', function() {
                document.querySelectorAll('.cr-check').forEach(function(cb) { cb.checked = all.checked; });
            });
        }
        var btnSalva = document.getElementById('cr-salva-dati');
        if (btnSalva) btnSalva.addEventListener('click', _salvaDatiClientiRischio);
        var btnMod = document.getElementById('cr-cambia-modalita');
        if (btnMod) btnMod.addEventListener('click', _cambiaModalitaClientiRischio);
    }

    async function _salvaDatiClientiRischio() {
        var daSalvare = [];
        document.querySelectorAll('.cr-mandato').forEach(function(inp) {
            var v = inp.value.trim();
            if (v) daSalvare.push({ cliente: _clientiRischio[parseInt(inp.dataset.idx, 10)], dati: { mandate_id: v } });
        });
        document.querySelectorAll('.cr-abi').forEach(function(inp) {
            var idx = parseInt(inp.dataset.idx, 10);
            var cab = document.querySelector('.cr-cab[data-idx="' + idx + '"]');
            var abi = inp.value.trim(), cabV = cab ? cab.value.trim() : '';
            if (abi && cabV) daSalvare.push({ cliente: _clientiRischio[idx], dati: { abi_banca: abi, cab_banca: cabV } });
        });

        if (!daSalvare.length) { ENI.UI.toast('Nessun dato compilato', 'danger'); return; }

        var falliti = [];
        for (var i = 0; i < daSalvare.length; i++) {
            try {
                await ENI.API.aggiornaCliente(daSalvare[i].cliente.id, daSalvare[i].dati);
            } catch(e) {
                falliti.push(daSalvare[i].cliente.nome_ragione_sociale + ': ' + e.message);
            }
        }
        ENI.State.cacheClear();
        if (falliti.length) ENI.UI.toast('Salvato con errori: ' + falliti.join(' | '), 'danger');
        else ENI.UI.toast('Aggiornati ' + daSalvare.length + (daSalvare.length === 1 ? ' cliente' : ' clienti'), 'success');

        await _caricaFatture();
        await _caricaNonPartite();
        await _caricaClientiRischio();
    }

    async function _cambiaModalitaClientiRischio() {
        var selez = [];
        document.querySelectorAll('.cr-check').forEach(function(cb) {
            if (cb.checked) selez.push(_clientiRischio[parseInt(cb.dataset.idx, 10)]);
        });
        if (!selez.length) { ENI.UI.toast('Nessun cliente selezionato', 'danger'); return; }

        var nuova = document.getElementById('cr-modalita').value;
        var msg = 'Spostare ' + selez.length + (selez.length === 1 ? ' cliente' : ' clienti') +
            ' alla modalità "' + nuova + '"?\n\n' +
            selez.map(function(c) { return '• ' + c.nome_ragione_sociale; }).join('\n') +
            '\n\nCambia solo l\'anagrafica: vale dalle prossime fatture, quelle già emesse restano come sono.';
        if (!await ENI.UI.confirm(msg)) return;

        var falliti = [];
        for (var i = 0; i < selez.length; i++) {
            try {
                await ENI.API.aggiornaCliente(selez[i].id, { modalita_pagamento_fattura: nuova });
            } catch(e) {
                falliti.push(selez[i].nome_ragione_sociale + ': ' + e.message);
            }
        }
        ENI.State.cacheClear();
        if (falliti.length) ENI.UI.toast('Completato con errori: ' + falliti.join(' | '), 'danger');
        else ENI.UI.toast('Spostati ' + selez.length + (selez.length === 1 ? ' cliente' : ' clienti'), 'success');

        await _caricaClientiRischio();
    }

    // ============================================================
    // DISPOSIZIONI NON PARTITE (riepilogo trasversale ai mesi)
    // ============================================================
    var _nonPartite = [];

    async function _caricaNonPartite() {
        var box = document.getElementById('exp-non-partite');
        if (!box) return;
        try {
            // Per i mesi gia' esportati l'API e' certa (confronto col file). Per quelli ancora
            // da esportare restituisce candidate: la regola di esportabilita' e' qui, quindi
            // scartiamo noi quelle coi dati a posto, che partiranno regolarmente.
            _nonPartite = (await ENI.API.getDisposizioniNonPartite()).filter(function(x) {
                return x.situazione === 'non_partita' || _problemiCliente(x.fattura.cliente, x.tipo).length > 0;
            });
        } catch(e) {
            box.innerHTML = '<p class="text-danger text-xs">Impossibile verificare le disposizioni non partite: ' +
                ENI.UI.escapeHtml(e.message) + '</p>';
            return;
        }
        box.innerHTML = _renderNonPartite();
        _attachNonPartiteHandlers();
    }

    function _renderNonPartite() {
        var nota = '<div class="text-xs text-muted mt-2">' +
            'Per i mesi già esportati il confronto è con gli ID salvati nel log, quindi riflette ' +
            'il contenuto reale del file inviato; per i mesi ancora da esportare sono le fatture ' +
            'che verranno scartate. In entrambi i casi si parla di mancati <em>invii</em>: gli ' +
            'insoluti restituiti dalla banca non sono tracciati.' +
            '</div>';

        if (!_nonPartite.length) {
            return '<div style="background:var(--color-success-bg,#d1e7dd);border-left:3px solid var(--color-success,#198754);' +
                'padding:0.75rem;margin-bottom:1rem;border-radius:4px;">' +
                '<strong>✓ Nessuna disposizione a rischio: tutte le fatture RID/RIBA sono incassabili</strong>' + nota + '</div>';
        }

        var tot = _nonPartite.reduce(function(s, x) { return s + (parseFloat(x.fattura.totale) || 0); }, 0);
        var nMai = _nonPartite.filter(function(x) { return x.situazione === 'non_partita'; }).length;
        var nomi = ['','Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];

        var rows = _nonPartite.map(function(x, i) {
            var f = x.fattura;
            var cli = f.cliente || {};
            var problemi = _problemiCliente(cli, x.tipo);
            var stato = x.situazione === 'non_partita' ?
                '<span class="badge badge-danger">mai partita</span>' :
                '<span class="badge badge-warning">verrà esclusa</span>';
            return '<tr>' +
                '<td><input type="checkbox" class="np-check" data-idx="' + i + '"></td>' +
                '<td class="text-xs">' + nomi[x.mese] + ' ' + x.anno + '</td>' +
                '<td class="text-xs">' + x.tipo + '</td>' +
                '<td class="text-xs">' + stato + '</td>' +
                '<td>' + ENI.UI.escapeHtml(f.numero_formattato) + '</td>' +
                '<td>' + ENI.UI.escapeHtml(cli.nome_ragione_sociale || '') + '</td>' +
                '<td class="text-right">€ ' + _fmtNum(f.totale) + '</td>' +
                '<td class="text-xs">' + (problemi.length ?
                    '<span class="text-danger">' + ENI.UI.escapeHtml(problemi.join(', ')) + '</span>' :
                    '<span class="text-success">dati ora completi</span>') + '</td>' +
            '</tr>';
        }).join('');

        var dettaglio = nMai === _nonPartite.length ?
            'Non sono finite nel file caricato in banca: vanno incassate in altro modo.' :
            (nMai ? nMai + ' non sono mai partite (file già inviato), le altre verranno escluse al prossimo export. ' :
                    'Verranno escluse al prossimo export se non sistemi i dati. ') +
            'Puoi convertirle a un\'altra modalità di pagamento qui sotto.';

        return '<div style="background:var(--color-danger-bg,#f8d7da);border-left:3px solid var(--color-danger,#dc3545);' +
            'padding:0.75rem;margin-bottom:1rem;border-radius:4px;">' +
            '<strong>⚠ ' + _nonPartite.length +
            (_nonPartite.length === 1 ? ' disposizione non verrà incassata' : ' disposizioni non verranno incassate') +
            ' — € ' + _fmtNum(tot) + '</strong>' +
            '<div class="text-xs">' + dettaglio + '</div>' +
            '<div class="table-wrapper mt-2"><table class="table table-sm">' +
            '<thead><tr><th style="width:30px;"><input type="checkbox" id="np-check-all"></th>' +
            '<th>Periodo</th><th>Tipo</th><th>Stato</th><th>N°</th><th>Cliente</th>' +
            '<th class="text-right">Importo</th><th>Motivo</th></tr></thead>' +
            '<tbody>' + rows + '</tbody></table></div>' +
            '<div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;margin-top:0.5rem;">' +
                '<span class="text-xs">Converti le selezionate a:</span>' +
                '<select class="form-select" id="np-modalita" style="max-width:170px;">' +
                    ['BONIFICO','CONTANTI','FINE_MESE','RIBA','RID_SDD'].map(function(v) {
                        return '<option value="' + v + '">' + v + '</option>';
                    }).join('') +
                '</select>' +
                '<button class="btn btn-primary btn-sm" id="np-converti">Converti pagamento</button>' +
            '</div>' + nota + '</div>';
    }

    function _attachNonPartiteHandlers() {
        var all = document.getElementById('np-check-all');
        if (all) {
            all.addEventListener('change', function() {
                document.querySelectorAll('.np-check').forEach(function(cb) { cb.checked = all.checked; });
            });
        }
        var btn = document.getElementById('np-converti');
        if (btn) btn.addEventListener('click', _convertiNonPartite);
    }

    async function _convertiNonPartite() {
        var selez = [];
        document.querySelectorAll('.np-check').forEach(function(cb) {
            if (cb.checked) selez.push(_nonPartite[parseInt(cb.dataset.idx, 10)]);
        });
        if (!selez.length) { ENI.UI.toast('Nessuna disposizione selezionata', 'danger'); return; }

        var nuova = document.getElementById('np-modalita').value;
        var tot = selez.reduce(function(s, x) { return s + (parseFloat(x.fattura.totale) || 0); }, 0);

        var msg = 'Convertire ' + selez.length + (selez.length === 1 ? ' fattura' : ' fatture') +
            ' (€ ' + _fmtNum(tot) + ') alla modalità "' + nuova + '"?\n\n' +
            selez.map(function(x) {
                return '• ' + x.fattura.numero_formattato + ' — ' + ((x.fattura.cliente || {}).nome_ragione_sociale || '?');
            }).join('\n');
        if (!await ENI.UI.confirm(msg)) return;

        var falliti = [];
        for (var i = 0; i < selez.length; i++) {
            try {
                await ENI.API.aggiornaFattura(selez[i].fattura.id, { modalita_pagamento: nuova });
            } catch(e) {
                falliti.push(selez[i].fattura.numero_formattato + ': ' + e.message);
            }
        }

        // Senza questo passaggio l'anagrafica resta invariata e il mese successivo
        // il cliente si ripresenta con la stessa modalita' (e lo stesso problema).
        var clienti = {};
        selez.forEach(function(x) {
            var cli = x.fattura.cliente;
            if (cli && cli.id && cli.modalita_pagamento_fattura !== nuova) clienti[cli.id] = cli.nome_ragione_sociale;
        });
        var ids = Object.keys(clienti);
        if (ids.length) {
            var aggiorna = await ENI.UI.confirm(
                'Aggiornare a "' + nuova + '" anche l\'anagrafica di ' + ids.length +
                (ids.length === 1 ? ' cliente' : ' clienti') + '?\n\n' +
                ids.map(function(id) { return '• ' + clienti[id]; }).join('\n') +
                '\n\nSe rispondi No, dal mese prossimo torneranno nella stessa sezione di prima.'
            );
            if (aggiorna) {
                for (var j = 0; j < ids.length; j++) {
                    try {
                        await ENI.API.aggiornaCliente(ids[j], { modalita_pagamento_fattura: nuova });
                    } catch(e) {
                        falliti.push(clienti[ids[j]] + ' (anagrafica): ' + e.message);
                    }
                }
                ENI.State.cacheClear();
            }
        }

        if (falliti.length) ENI.UI.toast('Completato con errori: ' + falliti.join(' | '), 'danger');
        else ENI.UI.toast('Convertite ' + selez.length + (selez.length === 1 ? ' fattura' : ' fatture'), 'success');

        await _caricaFatture();
        await _caricaNonPartite();
    }

    function _meseOptions() {
        var nomi = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
        return nomi.map(function(n, i) {
            return '<option value="' + (i+1) + '"' + (i+1 === _meseSelez ? ' selected' : '') + '>' + n + '</option>';
        }).join('');
    }

    function _popolaBanche() {
        var sel = document.getElementById('exp-banca');
        if (!sel || !_impostazioni) return;
        var lista = _impostazioni.iban_lista || [];
        sel.innerHTML = lista.map(function(item, i) {
            return '<option value="' + i + '">' + (item.banca || 'Banca ' + (i+1)) + ' - ' + item.iban + '</option>';
        }).join('');
    }

    var _logRid = null;   // Log dell'export RID per il mese corrente (null = mai esportato)
    var _logRiba = null;  // Log dell'export RIBA per il mese corrente

    async function _caricaFatture() {
        _meseSelez = parseInt(document.getElementById('exp-mese').value, 10);
        _annoSelez = parseInt(document.getElementById('exp-anno').value, 10);
        var box = document.getElementById('exp-content');
        box.innerHTML = '<div class="flex justify-center" style="padding:2rem;"><div class="spinner"></div></div>';

        try {
            var tutte = await ENI.API.getFatture({
                anno: _annoSelez,
                mese_riferimento: _meseSelez,
                stato: 'EMESSA'
            });

            // Carica eventuali log di export gia' fatti per questo mese/anno
            var logs = [];
            try { logs = await ENI.API.getExportBancariLog(_meseSelez, _annoSelez); } catch(e) {}
            _logRid = logs.find(function(l) { return l.tipo === 'RID'; }) || null;
            _logRiba = logs.find(function(l) { return l.tipo === 'RIBA'; }) || null;

            // Filtra solo RID e RIBA
            var rid = tutte.filter(function(f) { return f.modalita_pagamento === 'RID_SDD'; });
            var riba = tutte.filter(function(f) { return f.modalita_pagamento === 'RIBA'; });
            _fatture = tutte;

            box.innerHTML = _renderAnteprima(rid, riba);
            _attachHandlers(rid, riba);
        } catch(e) {
            box.innerHTML = '<p class="text-danger">Errore: ' + e.message + '</p>';
        }
    }

    function _renderAnteprima(rid, riba) {
        var nomi = ['','Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
        var periodo = nomi[_meseSelez] + ' ' + _annoSelez;

        var html = '';

        // Sezione RID
        if (_logRid) {
            html += _renderSezioneChiusa('rid', 'RID / SDD', _logRid, rid, periodo);
        } else {
            html += '<h4 class="mt-3 mb-2">RID / SDD (' + rid.length + ' disposizioni) - ' + periodo + '</h4>';
            if (rid.length) {
                var totRid = rid.reduce(function(s, f) { return s + (parseFloat(f.totale) || 0); }, 0);
                html += _renderTabella(rid, 'rid');
                html += '<div style="display:flex;justify-content:space-between;align-items:center;margin:0.5rem 0 0.25rem;">' +
                    '<strong>Totale RID: \u20AC ' + _fmtNum(totRid) + '</strong>' +
                    '<button class="btn btn-primary" id="btn-genera-rid">Genera file RID (.xml)</button></div>' +
                    _avvisoEsclusi(rid, 'rid');
            } else {
                html += '<p class="text-muted">Nessuna fattura RID emessa per questo periodo</p>';
            }
        }

        // Sezione RIBA
        if (_logRiba) {
            html += _renderSezioneChiusa('riba', 'RI.BA.', _logRiba, riba, periodo);
        } else {
            html += '<h4 class="mt-3 mb-2">RI.BA. (' + riba.length + ' disposizioni) - ' + periodo + '</h4>';
            if (riba.length) {
                var totRiba = riba.reduce(function(s, f) { return s + (parseFloat(f.totale) || 0); }, 0);
                html += _renderTabella(riba, 'riba');
                html += '<div style="display:flex;justify-content:space-between;align-items:center;margin:0.5rem 0 0.25rem;">' +
                    '<strong>Totale RIBA: \u20AC ' + _fmtNum(totRiba) + '</strong>' +
                    '<button class="btn btn-primary" id="btn-genera-riba">Genera file RIBA (.car)</button></div>' +
                    _avvisoEsclusi(riba, 'riba');
            } else {
                html += '<p class="text-muted">Nessuna fattura RIBA emessa per questo periodo</p>';
            }
        }

        return html;
    }

    // Avviso sul mancato incasso: quante disposizioni restano fuori dal file e per quanto.
    // Senza questo l'utente scarica il file convinto sia completo (e' successo a giugno 2026).
    function _avvisoEsclusi(fatture, prefix) {
        var ko = _partiziona(fatture, prefix).ko;
        if (!ko.length) return '';
        var tot = ko.reduce(function(s, x) { return s + (parseFloat(x.fattura.totale) || 0); }, 0);
        return '<div style="background:var(--color-danger-bg,#f8d7da);border-left:3px solid var(--color-danger,#dc3545);' +
            'padding:0.5rem 0.75rem;margin:0 0 1.5rem;border-radius:4px;">' +
            '<strong>⚠ ' + ko.length + (ko.length === 1 ? ' disposizione esclusa' : ' disposizioni escluse') +
            ' per € ' + _fmtNum(tot) + '</strong>' +
            '<div class="text-xs">Non verranno incassate. Completa i dati del cliente oppure cambia modalità di pagamento.</div>' +
        '</div>';
    }

    // Vista "chiusa": il mese e' gia' stato esportato per questo tipo
    function _renderSezioneChiusa(prefix, label, log, fatture, periodo) {
        var fmtData = function(d) {
            if (!d) return '-';
            var dt = new Date(d);
            return _pad(dt.getDate(),2) + '/' + _pad(dt.getMonth()+1,2) + '/' + dt.getFullYear() +
                ' ore ' + _pad(dt.getHours(),2) + ':' + _pad(dt.getMinutes(),2);
        };

        var html = '<h4 class="mt-3 mb-2">' + label + ' - ' + periodo +
            ' <span class="badge badge-success" style="font-weight:normal;">\u2713 Gi\u00E0 esportato</span></h4>';

        // Card riassuntiva
        html += '<div class="card" style="background:var(--color-success-bg,#d1e7dd);border:1px solid var(--color-success,#198754);padding:1rem;margin-bottom:1rem;">' +
            '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;">' +
                '<div><div class="text-xs text-muted">Disposizioni</div><div style="font-size:1.3rem;font-weight:600;">' + (log.num_disposizioni || 0) + '</div></div>' +
                '<div><div class="text-xs text-muted">Totale</div><div style="font-size:1.3rem;font-weight:600;">\u20AC ' + _fmtNum(log.totale || 0) + '</div></div>' +
                '<div><div class="text-xs text-muted">Prima esportazione</div><div style="font-size:0.95rem;">' + fmtData(log.prima_export_at) + '</div></div>' +
                '<div><div class="text-xs text-muted">Ultima esportazione</div><div style="font-size:0.95rem;">' + fmtData(log.ultima_export_at) + ' <span class="text-muted text-xs">(x' + (log.num_export || 1) + ')</span></div></div>' +
            '</div>' +
            (log.banca_iban ? '<div class="text-xs text-muted mt-2">Banca: ' + ENI.UI.escapeHtml(log.banca_iban) + '</div>' : '') +
        '</div>';

        // Il log conserva gli ID finiti davvero nel file: separiamo incluse da mai partite.
        // Se l'array manca (log vecchio) non possiamo dedurlo: mostriamo tutto come incluso.
        var ids = log.fatture_ids || [];
        var incluse = ids.length ? fatture.filter(function(f) { return ids.indexOf(f.id) !== -1; }) : fatture;
        var escluse = ids.length ? fatture.filter(function(f) { return ids.indexOf(f.id) === -1; }) : [];

        // Tabella read-only delle disposizioni incluse
        if (incluse.length) {
            var rows = incluse.map(function(f) {
                var cli = f.cliente || {};
                var coordinate = prefix === 'rid' ? (cli.iban || '-') :
                    (cli.abi_banca && cli.cab_banca ? cli.abi_banca + ' / ' + cli.cab_banca : '-');
                return '<tr>' +
                    '<td>' + ENI.UI.escapeHtml(f.numero_formattato) + '</td>' +
                    '<td>' + ENI.UI.escapeHtml(cli.nome_ragione_sociale || '') + '</td>' +
                    '<td class="text-right">\u20AC ' + _fmtNum(f.totale) + '</td>' +
                    '<td class="text-xs">' + ENI.UI.escapeHtml(coordinate) + '</td>' +
                    '<td class="text-xs">' + (f.data_scadenza ? f.data_scadenza : '-') + '</td>' +
                '</tr>';
            }).join('');
            html += '<div class="table-wrapper"><table class="table table-sm">' +
                '<thead><tr><th>N\u00B0</th><th>Cliente</th><th class="text-right">Importo</th><th>' +
                    (prefix === 'rid' ? 'IBAN' : 'ABI/CAB') + '</th><th>Scadenza</th></tr></thead>' +
                '<tbody>' + rows + '</tbody></table></div>';
        }

        // Disposizioni del mese rimaste fuori dal file gia' inviato in banca
        if (escluse.length) {
            var totEsc = escluse.reduce(function(s, f) { return s + (parseFloat(f.totale) || 0); }, 0);
            html += '<div style="background:var(--color-danger-bg,#f8d7da);border-left:3px solid var(--color-danger,#dc3545);' +
                'padding:0.75rem;margin:0.5rem 0 1rem;border-radius:4px;">' +
                '<strong>⚠ ' + escluse.length + (escluse.length === 1 ? ' fattura non è finita' : ' fatture non sono finite') +
                ' in questo file — € ' + _fmtNum(totEsc) + ' mai addebitati</strong>' +
                '<div class="table-wrapper mt-2"><table class="table table-sm">' +
                '<thead><tr><th>N°</th><th>Cliente</th><th class="text-right">Importo</th><th>Motivo attuale</th></tr></thead><tbody>' +
                escluse.map(function(f) {
                    var problemi = _problemiCliente(f.cliente, prefix);
                    return '<tr>' +
                        '<td>' + ENI.UI.escapeHtml(f.numero_formattato) + '</td>' +
                        '<td>' + ENI.UI.escapeHtml((f.cliente || {}).nome_ragione_sociale || '') + '</td>' +
                        '<td class="text-right">€ ' + _fmtNum(f.totale) + '</td>' +
                        '<td class="text-xs">' + (problemi.length ? ENI.UI.escapeHtml(problemi.join(', ')) :
                            '<span class="text-success">dati ora completi — inclusa alla prossima riscarica</span>') + '</td>' +
                    '</tr>';
                }).join('') + '</tbody></table></div></div>';
        }

        // Bottone riscarica
        html += '<div style="display:flex;justify-content:flex-end;margin:0.5rem 0 1.5rem;">' +
            '<button class="btn btn-outline" id="btn-riscarica-' + prefix + '">\u{1F4E5} Riscarica file ' +
                (prefix === 'rid' ? 'RID (.xml)' : 'RIBA (.car)') + '</button></div>';

        return html;
    }

    function _renderTabella(fatture, prefix) {
        var rows = fatture.map(function(f, i) {
            var cli = f.cliente || {};
            var problemi = _problemiCliente(cli, prefix);
            var cls = problemi.length ? 'style="background:var(--color-danger-bg);"' : '';

            // Colonna "Coordinate": IBAN per RID, ABI/CAB per RIBA
            var coordinate = prefix === 'rid' ?
                ENI.UI.escapeHtml(cli.iban || '-') :
                (cli.abi_banca && cli.cab_banca ?
                    ENI.UI.escapeHtml(cli.abi_banca + ' / ' + cli.cab_banca) : '-');

            return '<tr ' + cls + '>' +
                '<td><input type="checkbox" class="exp-check" data-prefix="' + prefix + '" data-idx="' + i + '" ' + (problemi.length ? 'disabled' : 'checked') + '></td>' +
                '<td>' + ENI.UI.escapeHtml(f.numero_formattato) + '</td>' +
                '<td>' + ENI.UI.escapeHtml(cli.nome_ragione_sociale || '') + '</td>' +
                '<td class="text-right">\u20AC ' + _fmtNum(f.totale) + '</td>' +
                '<td class="text-xs">' + coordinate + '</td>' +
                '<td class="text-xs">' + (prefix === 'rid' ? ENI.UI.escapeHtml(cli.mandate_id || '-') : ENI.UI.escapeHtml(cli.banca_appoggio || '-')) + '</td>' +
                '<td>' + (problemi.length ? '<span class="text-danger text-xs">' + problemi.join(', ') + '</span>' : '<span class="text-success text-xs">OK</span>') + '</td>' +
            '</tr>';
        }).join('');

        var coordinateLabel = prefix === 'rid' ? 'IBAN' : 'ABI / CAB';
        return '<div class="table-wrapper"><table class="table table-sm">' +
            '<thead><tr><th style="width:30px;"></th><th>N\u00b0</th><th>Cliente</th><th class="text-right">Importo</th><th>' + coordinateLabel + '</th><th>' + (prefix === 'rid' ? 'Mandato' : 'Banca app.') + '</th><th>Stato</th></tr></thead>' +
            '<tbody>' + rows + '</tbody></table></div>';
    }

    function _attachHandlers(rid, riba) {
        var btnRid = document.getElementById('btn-genera-rid');
        if (btnRid) {
            btnRid.addEventListener('click', async function() {
                var selezionati = _getSelezionati(rid, 'rid');
                if (!selezionati.length) { ENI.UI.toast('Nessuna disposizione selezionata', 'danger'); return; }
                await _generaERegistra('RID', selezionati);
            });
        }
        var btnRiba = document.getElementById('btn-genera-riba');
        if (btnRiba) {
            btnRiba.addEventListener('click', async function() {
                var selezionati = _getSelezionati(riba, 'riba');
                if (!selezionati.length) { ENI.UI.toast('Nessuna disposizione selezionata', 'danger'); return; }
                await _generaERegistra('RIBA', selezionati);
            });
        }
        // Riscarica (vista chiusa): rigenera coi dati attuali e incrementa num_export.
        // Applica le stesse verifiche dell'anteprima: senza filtro un cliente con dati
        // incompleti finisce nel file (es. <MndtId> vuoto) e la banca rifiuta TUTTO il flusso.
        var btnRiscRid = document.getElementById('btn-riscarica-rid');
        if (btnRiscRid) {
            btnRiscRid.addEventListener('click', function() { _riscarica('RID', rid); });
        }
        var btnRiscRiba = document.getElementById('btn-riscarica-riba');
        if (btnRiscRiba) {
            btnRiscRiba.addEventListener('click', function() { _riscarica('RIBA', riba); });
        }
    }

    async function _riscarica(tipo, fatture) {
        var etichetta = tipo === 'RID' ? 'RID' : 'RIBA';
        var p = _partiziona(fatture, tipo);

        if (!p.ok.length) {
            ENI.UI.toast('Nessuna disposizione ' + etichetta + ' esportabile: tutte hanno dati mancanti', 'danger');
            return;
        }

        var msg = 'Riscaricare il file ' + etichetta + ' con ' + p.ok.length +
            (p.ok.length === 1 ? ' disposizione' : ' disposizioni') + '?\n\n' +
            'I dati attuali del DB verranno usati (eventuali modifiche ai clienti dopo la prima esportazione si rifletteranno nel nuovo file).';

        if (p.ko.length) {
            var totKo = p.ko.reduce(function(s, x) { return s + (parseFloat(x.fattura.totale) || 0); }, 0);
            msg += '\n\nESCLUSE ' + p.ko.length + ' per € ' + _fmtNum(totKo) + ' (dati incompleti):\n' +
                p.ko.map(function(x) {
                    return '• ' + ((x.fattura.cliente || {}).nome_ragione_sociale || '?') +
                        ' — ' + x.fattura.numero_formattato + ' — ' + x.problemi.join(', ');
                }).join('\n') +
                '\n\nSe le includessimo la banca rifiuterebbe l\'intero file.';
        }

        if (!await ENI.UI.confirm(msg)) return;
        await _generaERegistra(tipo, p.ok);
    }

    // Genera file e registra/aggiorna il log nel DB
    async function _generaERegistra(tipo, fatture) {
        var imp = _impostazioni || {};
        var bancaIdx = parseInt((document.getElementById('exp-banca') || {}).value, 10) || 0;
        var bancaIban = (imp.iban_lista && imp.iban_lista[bancaIdx]) ? imp.iban_lista[bancaIdx].iban : '';
        var totale = fatture.reduce(function(s, f) { return s + (parseFloat(f.totale) || 0); }, 0);

        // Genera il file
        if (tipo === 'RID') _generaRID(fatture);
        else _generaRIBA(fatture);

        // Registra il log
        try {
            await ENI.API.upsertExportBancariLog({
                tipo: tipo,
                mese: _meseSelez,
                anno: _annoSelez,
                num_disposizioni: fatture.length,
                totale: Math.round(totale * 100) / 100,
                banca_iban: bancaIban,
                fatture_ids: fatture.map(function(f) { return f.id; })
            });
            ENI.UI.toast('Export ' + tipo + ' registrato nel log', 'success');
        } catch(e) {
            ENI.UI.toast('File generato ma impossibile registrare il log: ' + e.message, 'warning');
        }

        // Ricarica vista (mostra ora la sezione "chiusa")
        await _caricaFatture();
    }

    function _getSelezionati(fatture, prefix) {
        var result = [];
        document.querySelectorAll('.exp-check[data-prefix="' + prefix + '"]').forEach(function(cb) {
            if (cb.checked) {
                var idx = parseInt(cb.dataset.idx, 10);
                result.push(fatture[idx]);
            }
        });
        return result;
    }

    // ============================================================
    // GENERATORE RID (XML SEPA SDD - CBISDDReqLogMsg)
    // ============================================================
    function _generaRID(fatture) {
        var imp = _impostazioni || {};
        var bancaIdx = parseInt((document.getElementById('exp-banca') || {}).value, 10) || 0;
        var bancaIban = (imp.iban_lista && imp.iban_lista[bancaIdx]) ? imp.iban_lista[bancaIdx].iban : '';
        var abiEmittente = imp.abi_emittente || '06067';
        var now = new Date();
        var msgId = 'SDDCAR' + _pad(abiEmittente, 5) + _annoSelez.toString().slice(-2) + _pad(_meseSelez, 2) + '01';
        var creDtTm = now.toISOString().replace(/\.\d+Z$/, '+02:00');
        var totale = fatture.reduce(function(s, f) { return s + (parseFloat(f.totale) || 0); }, 0);
        var nomi = ['','Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];

        var xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
        xml += '<CBISDDReqLogMsg xmlns="urn:CBI:xsd:CBISDDReqLogMsg.00.01.01" xmlns:xs="http://www.w3.org/2001/XMLSchema-instance" xs:schemaLocation="urn:CBI:xsd:CBISDDReqLogMsg.00.01.01 CBISDDReqLogMsg.00.01.01.xsd">\n';
        xml += '  <GrpHdr>\n';
        xml += '    <MsgId>' + msgId + '</MsgId>\n';
        xml += '    <CreDtTm>' + creDtTm + '</CreDtTm>\n';
        xml += '    <NbOfTxs>' + fatture.length + '</NbOfTxs>\n';
        xml += '    <CtrlSum>' + totale.toFixed(2) + '</CtrlSum>\n';
        xml += '    <InitgPty>\n';
        xml += '      <Nm>' + _escXml(_max35Upper(imp.ragione_sociale_emittente, 'ENILIVE STATION')) + '</Nm>\n';
        xml += '      <Id><OrgId>\n';
        xml += '        <Othr><Id>' + _escXml(imp.codice_cbi || '') + '</Id><Issr>CBI</Issr></Othr>\n';
        xml += '        <Othr><Id>' + _escXml(imp.codice_fiscale_emittente || '') + '</Id><Issr>ADE</Issr></Othr>\n';
        xml += '      </OrgId></Id>\n';
        xml += '    </InitgPty>\n';
        xml += '  </GrpHdr>\n';

        // Un PmtInf per il mese
        var scadenza = fatture[0].data_scadenza || '';
        xml += '  <PmtInf>\n';
        xml += '    <PmtInfId>001-' + _fmtDataSlash(scadenza) + '</PmtInfId>\n';
        xml += '    <PmtMtd>DD</PmtMtd>\n';
        xml += '    <BtchBookg>false</BtchBookg>\n';
        xml += '    <PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl><LclInstrm><Cd>CORE</Cd></LclInstrm><SeqTp>RCUR</SeqTp></PmtTpInf>\n';
        xml += '    <ReqdColltnDt>' + (scadenza || '') + '</ReqdColltnDt>\n';
        xml += '    <Cdtr>\n';
        xml += '      <Nm>' + _escXml(_max35Upper(imp.ragione_sociale_emittente, 'ENILIVE STATION')) + '</Nm>\n';
        xml += '      <PstlAdr><Ctry>SM</Ctry>\n';
        xml += '        <AdrLine>' + _escXml(String(imp.indirizzo || '').trim().toUpperCase()) + '</AdrLine>\n';
        xml += '        <AdrLine>' + _escXml(_adrLine([imp.cap, imp.comune, 'RSM', 'SAN MARINO'])) + '</AdrLine>\n';
        xml += '      </PstlAdr>\n';
        xml += '      <Id><PrvtId><Othr><Id>' + _escXml(imp.codice_fiscale_emittente || '') + '</Id><Issr>ADE</Issr></Othr></PrvtId></Id>\n';
        xml += '    </Cdtr>\n';
        xml += '    <CdtrAcct><Id><IBAN>' + bancaIban + '</IBAN></Id></CdtrAcct>\n';
        xml += '    <CdtrAgt><FinInstnId><ClrSysMmbId><MmbId>' + abiEmittente + '</MmbId></ClrSysMmbId></FinInstnId></CdtrAgt>\n';
        xml += '    <ChrgBr>SLEV</ChrgBr>\n';
        xml += '    <CdtrSchmeId><Id><PrvtId><Othr><Id>' + _escXml(imp.codice_creditore_sdd || '') + '</Id></Othr></PrvtId></Id></CdtrSchmeId>\n';

        fatture.forEach(function(f, i) {
            var cli = f.cliente || {};
            var n = i + 1;
            var tipoDoc = f.tipo_documento === 'RICEVUTA' ? 'RIF. D.D.T.' : 'FATT. EMESSE';
            xml += '    <DrctDbtTxInf>\n';
            xml += '      <PmtId>\n';
            xml += '        <InstrId>' + n + '</InstrId>\n';
            xml += '        <EndToEndId>' + _pad(n, 5) + '-' + msgId + '</EndToEndId>\n';
            xml += '      </PmtId>\n';
            xml += '      <InstdAmt Ccy="EUR">' + (parseFloat(f.totale) || 0) + '</InstdAmt>\n';
            xml += '      <DrctDbtTx><MndtRltdInf>\n';
            xml += '        <MndtId>' + _escXml(cli.mandate_id || '') + '</MndtId>\n';
            xml += '        <DtOfSgntr>2012-01-02</DtOfSgntr>\n';
            xml += '      </MndtRltdInf></DrctDbtTx>\n';
            xml += '      <Dbtr>\n';
            xml += '        <Nm>' + _escXml(_max35Upper(cli.nome_ragione_sociale, 'CLIENTE')) + '</Nm>\n';
            xml += '        <PstlAdr><Ctry>' + (cli.sede_legale_nazione || 'SM') + '</Ctry>\n';
            xml += '          <AdrLine>' + _escXml(String(cli.sede_legale_indirizzo || '-').trim().toUpperCase()) + '</AdrLine>\n';
            xml += '          <AdrLine>' + _escXml(_adrLine([cli.sede_legale_cap, cli.sede_legale_comune, 'RSM', 'SAN MARINO'])) + '</AdrLine>\n';
            xml += '        </PstlAdr>\n';
            xml += '      </Dbtr>\n';
            xml += '      <DbtrAcct><Id><IBAN>' + (cli.iban || '') + '</IBAN></Id></DbtrAcct>\n';
            xml += '      <Purp><Cd>GDSV</Cd></Purp>\n';
            xml += '      <RgltryRptg><DbtCdtRptgInd>CRED</DbtCdtRptgInd></RgltryRptg>\n';
            xml += '      <RmtInf><Ustrd>' + tipoDoc + '   ' + f.numero_formattato + ' DEL ' + _fmtDataTrattino(f.data_emissione) + ' SCADENZA ' + _fmtDataTrattino(f.data_scadenza) + '</Ustrd></RmtInf>\n';
            xml += '    </DrctDbtTxInf>\n';
        });

        xml += '  </PmtInf>\n';
        xml += '</CBISDDReqLogMsg>\n';

        _downloadFile(xml, 'RID_' + nomi[_meseSelez] + '_' + _annoSelez + '.xml', 'application/xml');
        ENI.UI.toast('File RID generato con ' + fatture.length + ' disposizioni', 'success');
    }

    // ============================================================
    // GENERATORE RIBA (.car CBI tracciato fisso 120 char)
    // ============================================================
    function _generaRIBA(fatture) {
        var imp = _impostazioni || {};
        var bancaIdx = parseInt((document.getElementById('exp-banca') || {}).value, 10) || 0;
        var bancaItem = (imp.iban_lista && imp.iban_lista[bancaIdx]) ? imp.iban_lista[bancaIdx] : {};
        var abiEmittente = ((imp.abi_emittente || '06067') + '00000').substring(0, 5);
        var cabEmittente = ((imp.cab_emittente || '09801') + '00000').substring(0, 5);
        var nomi = ['','Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
        var now = new Date();
        var dataDDMMYY = _pad(now.getDate(),2) + _pad(now.getMonth()+1,2) + String(now.getFullYear()).slice(-2);
        var dataDDMMYYYY = _pad(now.getDate(),2) + _pad(now.getMonth()+1,2) + String(now.getFullYear());
        var oraHHMM = _pad(now.getHours(),2) + _pad(now.getMinutes(),2);
        // Codice SIA distinto dal codice CBI: 5 char esatti (es. "C43SF")
        var codSia = ((imp.codice_sia || 'C43SF') + '     ').substring(0, 5);
        // Codice fiscale emittente normalizzato per CBI .car: 11 cifre zero-padded
        // "IT00000030756" -> "00000030756", "SM30756" -> "00000030756"
        function _coeNumerico(s) {
            if (!s) return '00000000000';
            var clean = String(s).toUpperCase().replace(/^[A-Z]+/, '').replace(/[^0-9]/g, '');
            return clean.padStart(11, '0').substring(0, 11);
        }
        var coeNum = _coeNumerico(imp.codice_fiscale_emittente || imp.coe_piva || 'SM30756');
        var nomeAzienda = (imp.ragione_sociale_emittente || 'ENILIVE STATION');
        // Helper P.IVA cliente: strip prefissi A/N applicati ai COE sammarinesi (ASM/NSM -> SM)
        function _pivaCliente(s) {
            var v = String(s || '').toUpperCase().trim();
            return v.replace(/^[AN]SM/, 'SM');
        }
        // Helper nazione: 'SM' -> 'RSM' come fa Mexal
        function _nazioneCBI(s) {
            var v = String(s || 'RSM').toUpperCase().trim();
            if (v === 'SM') return 'RSM';
            return v;
        }

        // Estrai conto creditore (12 char) dall'IBAN dell'IBAN dell'azienda emittente
        var ibanEmittente = (bancaItem.iban || '').replace(/\s/g, '');
        var contoEmittente12 = '';
        if (ibanEmittente.length >= 27) {
            // SM IBAN format: SM(2) + check(2) + CIN(1) + ABI(5) + CAB(5) + Conto(12)
            contoEmittente12 = ibanEmittente.substring(15, 27);
        }
        contoEmittente12 = (contoEmittente12 + '000000000000').substring(0, 12);

        // Helper: produce un record di esattamente 120 byte (truncate o pad con spazi a destra)
        function _rec120(s) {
            s = String(s || '');
            if (s.length > 120) return s.substring(0, 120);
            return s + ' '.repeat(120 - s.length);
        }

        var content = '';

        // ============================================
        // HEADER (121 byte: leading space + 120 byte content)
        // Layout: ' IB' + codSia(5) + abi(5) + DDMMYY(6) + 'CAR' + DDMMYYYY(8) + HHMM(4)
        //         + filler(79) + 'E       ' (8)
        // ============================================
        var header = ' IB' + codSia + abiEmittente + dataDDMMYY + 'CAR' + dataDDMMYYYY + oraHHMM;
        // 3+5+5+6+3+8+4 = 34 char. Pad to 113, then 'E       ' (8 char) = 121 total
        header = (header + ' '.repeat(79)).substring(0, 113) + 'E       ';
        content += header;

        // ============================================
        // DATA RECORDS (7 record × 120 byte per disposizione)
        // ============================================
        var totaleImporti = 0;
        fatture.forEach(function(f, i) {
            var cli = f.cliente || {};
            var n = _pad(i + 1, 7);
            var importoCent = Math.round((parseFloat(f.totale) || 0) * 100);
            // Importo: 14 char left-padded (formato Mexal verificato)
            var importoStr = _pad(importoCent, 14);
            totaleImporti += importoCent;
            var scadGG = f.data_scadenza ? _fmtDataCBI(f.data_scadenza) : '000000';
            var abiCli = ((cli.abi_banca || '') + '00000').substring(0, 5);
            var cabCli = ((cli.cab_banca || '') + '00000').substring(0, 5);
            var nContratto = '40000000050200' + _pad(i + 1, 3);  // 17 char (es. C43SF + sequenza)

            // Record 14 (disposizione) - 120 byte esatti
            // Layout verificato da Mexal:
            //  pos 0-1   : '14'
            //  pos 2-8   : progressivo (7)
            //  pos 9-20  : 12 spazi
            //  pos 21-26 : data scadenza DDMMYY (6)
            //  pos 27    : tipo '3'
            //  pos 28-30 : '000' filler
            //  pos 31-44 : importo cents padded 14
            //  pos 45    : segno '-'
            //  pos 46-50 : ABI cred (5)
            //  pos 51-55 : CAB cred (5)
            //  pos 56-67 : conto cred (12)
            //  pos 68-72 : ABI deb (5)
            //  pos 73-77 : CAB deb (5)
            //  pos 78-89 : 12 spazi
            //  pos 90-94 : codSia ripetuto (5)
            //  pos 95-111: nContratto (17)
            //  pos 112-117: 6 spazi
            //  pos 118   : 'E'
            //  pos 119   : 1 spazio
            var rec14 = '14' + n + '            ' + scadGG + '3000' + importoStr + '-'
                + abiEmittente + cabEmittente + contoEmittente12
                + abiCli + cabCli + '            '
                + codSia + nContratto + '      E ';
            content += _rec120(rec14);

            // Record 20 (creditore: nome + indirizzo) - 120 byte
            var indCreditore = ((imp.indirizzo || '') + ' ' + (imp.cap || '') + ' ' + (imp.comune || '')).trim();
            var rec20 = '20' + n + ((nomeAzienda + '                        ').substring(0, 24)) +
                ((indCreditore + ' '.repeat(87)).substring(0, 87));
            content += _rec120(rec20);

            // Record 30 (debitore: nome 60 + p_iva 7 + filler) - 120 byte
            // Mexal: pos 9-68 nome (60), pos 69-75 p_iva normalizzato (7 char SM+5 digit)
            var pivaNorm = _pivaCliente(cli.p_iva_coe);
            var rec30 = '30' + n + ((cli.nome_ragione_sociale || '') + ' '.repeat(60)).substring(0, 60) +
                ((pivaNorm + '       ').substring(0, 7));
            content += _rec120(rec30);

            // Record 40 (indirizzo + cap + comune + nazione + banca) - 120 byte
            // Mexal layout: pos 9-38 ind (30), pos 39-43 cap (5), pos 44-64 comune (21),
            //               pos 65-67 nazione (3), pos 68 spazio, pos 69-118 banca (50)
            var rec40 = '40' + n +
                ((cli.sede_legale_indirizzo || '') + ' '.repeat(30)).substring(0, 30) +
                ((cli.sede_legale_cap || '') + '     ').substring(0, 5) +
                ((cli.sede_legale_comune || '') + ' '.repeat(21)).substring(0, 21) +
                (_nazioneCBI(cli.sede_legale_nazione) + '   ').substring(0, 3) +
                ' ' +
                ((cli.banca_appoggio || '') + ' '.repeat(50)).substring(0, 50);
            content += _rec120(rec40);

            // Record 50 (riferimento documento + codice fiscale numerico emittente) - 120 byte
            // Mexal: codice fiscale come 11 digit zero-padded
            var rifDoc = 'RIF.DOCU.NUM.:  ' + ((f.numero_formattato || '') + ' '.repeat(10)).substring(0, 10) +
                'del ' + _fmtDataSlash(f.data_emissione);
            var rec50 = '50' + n + (rifDoc + ' '.repeat(90)).substring(0, 90) +
                coeNum + '          ';  // coeNum = 11 digit, poi 10 spazi filler
            content += _rec120(rec50);

            // Record 51 (codice fiscale creditore + nome) - 120 byte
            var rec51 = '51' + n + _pad(i + 1, 10) +
                ((nomeAzienda || '') + ' '.repeat(80)).substring(0, 80);
            content += _rec120(rec51);

            // Record 70 (chiusura disposizione) - 120 byte
            // Mexal: '70' + n(7) + 91 spazi + '0' + 19 spazi = 120
            var rec70 = '70' + n + ' '.repeat(91) + '0' + ' '.repeat(19);
            content += _rec120(rec70);
        });

        // ============================================
        // FOOTER (119 byte — NO leading space, inizia con 'EF')
        // Layout: 'EF' + codSia(5) + abi(5) + DDMMYY(6) + 'CAR' + DDMMYYYY(8) + HHMM(4)
        //         + filler(11) + nDispo(7) + totaleNeg(15) + totalePos(15) + nRecTot(7)
        //         + filler(24) + 'E      ' (7) = 119 byte totali
        // ============================================
        // Mexal usa totale × 10 nel campo da 15 char (formato millesimi convenzionale)
        var totaleField = _pad(totaleImporti * 10, 15);
        var nRecordsTot = 1 + (fatture.length * 7) + 1;  // header + 7 per dispo + footer
        var footer = 'EF' + codSia + abiEmittente + dataDDMMYY + 'CAR' + dataDDMMYYYY + oraHHMM
            + ' '.repeat(11)
            + _pad(fatture.length, 7)
            + totaleField
            + _pad(0, 15)
            + _pad(nRecordsTot, 7);
        // 2+5+5+6+3+8+4+11+7+15+15+7 = 88 char
        footer = (footer + ' '.repeat(24)).substring(0, 112) + 'E      ';  // 112 + 7 = 119
        content += footer;

        _downloadFile(content, 'RIBA_' + nomi[_meseSelez] + '_' + _annoSelez + '.car', 'text/plain');
        ENI.UI.toast('File RIBA generato con ' + fatture.length + ' disposizioni', 'success');
    }

    // ============================================================
    // UTILITIES
    // ============================================================
    function _pad(val, len) { return String(val).padStart(len, '0'); }
    function _rpad(val, len) { return String(val).substring(0, len).padEnd(len, ' '); }
    function _fmtNum(n) { return (Number(n) || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
    function _escXml(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;'); }
    // Validazione IBAN secondo pattern SEPA IBAN2007Identifier: 2 lettere + 2 cifre + 1-30 alfanumerici.
    // Inoltre IBAN italiani/sammarinesi/SEPA hanno length fissa per Paese (IT=27, SM=27, ecc).
    function _validaIban(iban) {
        if (!iban) return false;
        var s = String(iban).replace(/\s/g, '').toUpperCase();
        if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{1,30}$/.test(s)) return false;
        // Check sulla lunghezza per Paese (per ora SM e IT a 27)
        var paese = s.substring(0, 2);
        var lunghezzeAttese = { 'IT': 27, 'SM': 27, 'VA': 22, 'FR': 27, 'DE': 22 };
        if (lunghezzeAttese[paese] && s.length !== lunghezzeAttese[paese]) return false;
        return true;
    }
    // Regola unica di esportabilita', usata sia dall'anteprima che dalla riscarica.
    // Ritorna [] se il cliente e' esportabile per quel tipo, altrimenti l'elenco dei problemi.
    // RID/SDD: serve IBAN completo + mandato (SEPA SDD)
    // RIBA: bastano ABI + CAB (il tracciato CBI .car non usa l'IBAN)
    function _problemiCliente(cli, tipo) {
        var problemi = [];
        cli = cli || {};
        if (String(tipo).toLowerCase() === 'rid') {
            if (!cli.iban) problemi.push('IBAN mancante');
            else if (!_validaIban(cli.iban)) problemi.push('IBAN malformato (' + cli.iban.length + ' char)');
            if (!cli.mandate_id) problemi.push('Mandato SDD mancante');
        } else {
            if (!cli.abi_banca || !cli.cab_banca) problemi.push('ABI/CAB mancante');
        }
        return problemi;
    }

    // Divide le fatture in esportabili / scartate secondo _problemiCliente
    function _partiziona(fatture, tipo) {
        var ok = [], ko = [];
        (fatture || []).forEach(function(f) {
            var problemi = _problemiCliente(f.cliente, tipo);
            if (problemi.length) ko.push({ fattura: f, problemi: problemi });
            else ok.push(f);
        });
        return { ok: ok, ko: ko };
    }

    // Helper SEPA: Max35Text uppercase, trim, fallback su default per evitare violazioni minLength=1
    function _max35Upper(s, fallback) {
        var v = String(s == null ? '' : s).toUpperCase().trim().substring(0, 35);
        return v || (fallback || 'N/D');
    }
    // Helper indirizzo: pulisce gli elementi e fa join evitando spazi spuri prima delle virgole
    function _adrLine(parts) {
        return parts
            .map(function(p) { return String(p == null ? '' : p).trim(); })
            .filter(function(p) { return p.length > 0; })
            .join(', ')
            .toUpperCase();
    }

    function _fmtDataSlash(d) {
        if (!d) return '';
        var dt = new Date(d);
        return _pad(dt.getDate(),2) + '/' + _pad(dt.getMonth()+1,2) + '/' + dt.getFullYear();
    }
    function _fmtDataTrattino(d) {
        if (!d) return '';
        var dt = new Date(d);
        return _pad(dt.getDate(),2) + '-' + _pad(dt.getMonth()+1,2) + '-' + dt.getFullYear();
    }
    function _fmtDataCBI(d) {
        if (!d) return '000000';
        var dt = new Date(d);
        return _pad(dt.getDate(),2) + _pad(dt.getMonth()+1,2) + dt.getFullYear().toString().slice(-2);
    }

    function _downloadFile(content, filename, mimeType) {
        var blob = new Blob([content], { type: mimeType + ';charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    return { render: render };
})();
