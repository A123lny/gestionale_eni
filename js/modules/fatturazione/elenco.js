// ============================================================
// FATTURAZIONE - Tab Elenco fatture
// ============================================================

var ENI = ENI || {};
ENI.Fatturazione = ENI.Fatturazione || {};

ENI.Fatturazione.Elenco = (function() {
    'use strict';

    var _filtri = {
        anno: new Date().getFullYear(),
        mese_riferimento: '',
        cliente_id: '',
        stato: '',
        tipo_documento: '',
        cerca: ''
    };
    var _fatture = [];
    var _impostazioni = null;
    var _container = null;

    async function render(container) {
        _container = container;
        container.innerHTML = _renderShell();
        _attachHandlers();
        await _ricarica();
    }

    function _renderShell() {
        var anniOpt = _anniOptions();
        return '' +
        '<div class="fatt-toolbar mb-3">' +
            '<div class="form-row" style="align-items:flex-end;gap:0.5rem;flex-wrap:wrap;">' +
                '<div class="form-group" style="min-width:110px;"><label class="form-label">Anno</label>' +
                    '<select class="form-select" id="f-anno">' + anniOpt + '</select></div>' +
                '<div class="form-group" style="min-width:140px;"><label class="form-label">Mese riferim.</label>' +
                    '<select class="form-select" id="f-mese">' + _meseOptions() + '</select></div>' +
                '<div class="form-group" style="min-width:160px;"><label class="form-label">Stato</label>' +
                    '<select class="form-select" id="f-stato">' +
                        '<option value="">Tutti</option>' +
                        '<option value="BOZZA">Bozza</option>' +
                        '<option value="EMESSA">Emessa</option>' +
                        '<option value="PAGATA">Pagata</option>' +
                        '<option value="ANNULLATA">Annullata</option>' +
                    '</select></div>' +
                '<div class="form-group" style="min-width:160px;"><label class="form-label">Documento</label>' +
                    '<select class="form-select" id="f-tipodoc">' +
                        '<option value="">Tutti</option>' +
                        '<option value="FATTURA">Fatture</option>' +
                        '<option value="RICEVUTA">Ricevute</option>' +
                    '</select></div>' +
                '<div class="form-group" style="min-width:200px;flex:1;"><label class="form-label">Cerca cliente</label>' +
                    '<input type="text" class="form-input" id="f-cerca" placeholder="Nome cliente..."></div>' +
            '</div>' +
        '</div>' +
        '<div id="fatt-lista-container"></div>';
    }

    function _anniOptions() {
        var curr = new Date().getFullYear();
        var out = '';
        for (var a = curr + 1; a >= 2024; a--) {
            out += '<option value="' + a + '"' + (a === _filtri.anno ? ' selected' : '') + '>' + a + '</option>';
        }
        return out;
    }
    function _meseOptions() {
        var nomi = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
        var out = '<option value="">Tutti</option>';
        for (var i = 1; i <= 12; i++) out += '<option value="' + i + '">' + nomi[i-1] + '</option>';
        return out;
    }

    function _attachHandlers() {
        var _cercaTimer = null;
        document.getElementById('f-cerca').addEventListener('input', function(e) {
            clearTimeout(_cercaTimer);
            _cercaTimer = setTimeout(function() {
                _filtri.cerca = e.target.value.trim().toLowerCase();
                _ricarica();
            }, 300);
        });

        ['f-anno','f-mese','f-stato','f-tipodoc'].forEach(function(id) {
            var el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('change', function() {
                _filtri.anno = parseInt(document.getElementById('f-anno').value, 10);
                _filtri.mese_riferimento = document.getElementById('f-mese').value;
                _filtri.stato = document.getElementById('f-stato').value;
                _filtri.tipo_documento = document.getElementById('f-tipodoc').value;
                _ricarica();
            });
        });
    }

    async function _ricarica() {
        var box = document.getElementById('fatt-lista-container');
        box.innerHTML = '<div class="flex justify-center" style="padding:2rem;"><div class="spinner"></div></div>';
        try {
            var filtri = { anno: _filtri.anno };
            if (_filtri.mese_riferimento) filtri.mese_riferimento = parseInt(_filtri.mese_riferimento, 10);
            if (_filtri.stato) filtri.stato = _filtri.stato;
            if (_filtri.tipo_documento) filtri.tipo_documento = _filtri.tipo_documento;
            _fatture = await ENI.API.getFatture(filtri);
            if (!_impostazioni) {
                try { _impostazioni = await ENI.API.getImpostazioniFatturazione(); } catch(e) {}
            }
            box.innerHTML = _renderTabella();
            _attachRigheHandlers();
        } catch(e) {
            box.innerHTML = '<div class="empty-state"><p class="text-danger">Errore: ' + ENI.UI.escapeHtml(e.message) + '</p></div>';
        }
    }

    function _renderTabella() {
        // Filtra per ricerca testo
        var lista = _fatture;
        if (_filtri.cerca) {
            var term = _filtri.cerca;
            lista = lista.filter(function(f) {
                var cli = f.cliente ? f.cliente.nome_ragione_sociale.toLowerCase() : '';
                var num = (f.numero_formattato || '').toLowerCase();
                return cli.indexOf(term) >= 0 || num.indexOf(term) >= 0;
            });
        }

        if (!lista.length) {
            return '<div class="empty-state"><div class="empty-state-icon">\u{1F4C4}</div><p class="empty-state-text">Nessuna fattura per i filtri selezionati</p></div>';
        }

        var numBozze = lista.filter(function(f) { return f.stato === 'BOZZA'; }).length;
        var totali = lista.reduce(function(acc, f) {
            var t = parseFloat(f.totale) || 0;
            acc.tot += t;
            if (f.stato === 'PAGATA') acc.pagato += t;
            else if (f.stato === 'EMESSA') acc.emesso += t;
            else if (f.stato === 'BOZZA') acc.bozza += t;
            return acc;
        }, { tot: 0, emesso: 0, pagato: 0, bozza: 0 });

        // Raggruppa per tipo documento quando si vedono tutti
        var fatture = lista.filter(function(f) { return f.tipo_documento !== 'RICEVUTA'; });
        var ricevute = lista.filter(function(f) { return f.tipo_documento === 'RICEVUTA'; });
        var mostraGruppi = !_filtri.tipo_documento && fatture.length > 0 && ricevute.length > 0;

        function _rigaHtml(f) {
            var cli = f.cliente ? f.cliente.nome_ragione_sociale : '';
            return '<tr data-id="' + f.id + '">' +
                '<td><strong>' + ENI.UI.escapeHtml(f.numero_formattato) + '</strong></td>' +
                '<td>' + _fmtData(f.data_emissione) + '</td>' +
                '<td>' + ENI.UI.escapeHtml(cli) + '</td>' +
                '<td>' + (f.tipo_documento === 'RICEVUTA' ? 'Ricevuta' : 'Fattura') + ' <span class="text-xs text-muted">(' + (f.tipo === 'MANUALE' ? 'Man.' : 'ENI') + ')</span></td>' +
                '<td class="text-right">€ ' + _fmtNum(f.totale) + '</td>' +
                '<td>' + (f.data_scadenza ? _fmtData(f.data_scadenza) : '-') + '</td>' +
                '<td>' + _badge(f.stato) + '</td>' +
                '<td style="white-space:nowrap;">' +
                    '<button class="btn btn-sm btn-secondary btn-pdf" data-id="' + f.id + '">PDF</button> ' +
                    (f.stato !== 'ANNULLATA' ? '<button class="btn btn-sm btn-outline btn-modifica" data-id="' + f.id + '">Modifica</button> ' : '') +
                    (f.stato === 'BOZZA' ? '<button class="btn btn-sm btn-primary btn-emetti" data-id="' + f.id + '">Emetti</button> ' : '') +
                    (f.stato === 'EMESSA' ? '<button class="btn btn-sm btn-success btn-paga" data-id="' + f.id + '">Pagata</button> ' : '') +
                    (f.stato === 'EMESSA' ? '<button class="btn btn-sm btn-warning btn-riemetti" data-id="' + f.id + '" data-tipo="' + f.tipo_documento + '" data-cliente-id="' + f.cliente_id + '" data-cliente-nome="' + ENI.UI.escapeHtml(cli) + '">' + (f.tipo_documento === 'FATTURA' ? '\u{2192} Ricevuta' : '\u{2192} Fattura') + '</button> ' : '') +
                    (f.stato !== 'ANNULLATA' ? '<button class="btn btn-sm btn-danger btn-annulla" data-id="' + f.id + '">Annulla</button>' : '') +
                '</td>' +
            '</tr>';
        }

        var rows = '';
        var theadHtml = '<thead><tr><th>N\u00b0</th><th>Data</th><th>Cliente</th><th>Tipo</th><th class="text-right">Totale</th><th>Scadenza</th><th>Stato</th><th>Azioni</th></tr></thead>';

        if (mostraGruppi) {
            var totFatt = fatture.reduce(function(s, f) { return s + (parseFloat(f.totale) || 0); }, 0);
            var totRic = ricevute.reduce(function(s, f) { return s + (parseFloat(f.totale) || 0); }, 0);
            rows += '<tr><td colspan="8" style="background:var(--color-primary);color:#fff;font-weight:700;padding:0.5rem 1rem;">FATTURE (' + fatture.length + ') \u2014 \u20AC ' + _fmtNum(totFatt) + '</td></tr>';
            rows += fatture.map(_rigaHtml).join('');
            rows += '<tr><td colspan="8" style="background:var(--color-gray-600,#555);color:#fff;font-weight:700;padding:0.5rem 1rem;">RICEVUTE (' + ricevute.length + ') \u2014 \u20AC ' + _fmtNum(totRic) + '</td></tr>';
            rows += ricevute.map(_rigaHtml).join('');
        } else {
            rows = lista.map(_rigaHtml).join('');
        }

        return (numBozze ? '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.75rem;padding:0.75rem;background:var(--bg-warning-subtle,#fff3cd);border-radius:var(--radius-sm);">' +
                '<span><strong>' + numBozze + ' bozze</strong> in attesa di emissione (\u20AC ' + _fmtNum(totali.bozza) + ')</span>' +
                '<button class="btn btn-primary btn-sm" id="btn-emetti-tutte">Emetti tutte le bozze</button>' +
            '</div>' : '') +
            '<div class="table-wrapper"><table class="table table-hover">' +
            theadHtml +
            '<tbody>' + rows + '</tbody>' +
            '<tfoot><tr><th colspan="4" class="text-right">Totali:</th>' +
                '<th class="text-right">\u20AC ' + _fmtNum(totali.tot) + '</th>' +
                '<th colspan="3">Bozze: \u20AC ' + _fmtNum(totali.bozza) + ' | Emesso: \u20AC ' + _fmtNum(totali.emesso) + ' | Pagato: \u20AC ' + _fmtNum(totali.pagato) + '</th></tr></tfoot>' +
            '</table></div>';
    }

    function _attachRigheHandlers() {
        document.querySelectorAll('.btn-pdf').forEach(function(b) {
            b.addEventListener('click', async function() {
                try {
                    var full = await ENI.API.getFatturaCompleta(b.dataset.id);
                    await ENI.Fatturazione.Pdf.generaPdf(full, _impostazioni);
                } catch(e) { ENI.UI.toast('Errore PDF: ' + e.message, 'danger'); }
            });
        });
        document.querySelectorAll('.btn-paga').forEach(function(b) {
            b.addEventListener('click', async function() {
                if (!await ENI.UI.confirm('Segnare come PAGATA?')) return;
                try {
                    await ENI.API.aggiornaStatoFattura(b.dataset.id, 'PAGATA');
                    ENI.UI.toast('Fattura aggiornata', 'success');
                    _ricarica();
                } catch(e) { ENI.UI.toast('Errore: ' + e.message, 'danger'); }
            });
        });
        document.querySelectorAll('.btn-annulla').forEach(function(b) {
            b.addEventListener('click', async function() {
                if (!await ENI.UI.confirm('Annullare questa fattura? (operazione irreversibile)')) return;
                try {
                    await ENI.API.annullaFattura(b.dataset.id, 'Annullata da utente');
                    ENI.UI.toast('Fattura annullata', 'success');
                    _ricarica();
                } catch(e) { ENI.UI.toast('Errore: ' + e.message, 'danger'); }
            });
        });
        // Emetti singola bozza
        document.querySelectorAll('.btn-emetti').forEach(function(b) {
            b.addEventListener('click', async function() {
                if (!await ENI.UI.confirm('Emettere questo documento? Una volta emesso il numero sar\u00e0 definitivo.')) return;
                try {
                    await ENI.API.aggiornaStatoFattura(b.dataset.id, 'EMESSA');
                    ENI.UI.toast('Documento emesso', 'success');
                    _ricarica();
                } catch(e) { ENI.UI.toast('Errore: ' + e.message, 'danger'); }
            });
        });
        // Emetti tutte le bozze
        var btnEmettiTutte = document.getElementById('btn-emetti-tutte');
        if (btnEmettiTutte) {
            btnEmettiTutte.addEventListener('click', async function() {
                var bozze = _fatture.filter(function(f) { return f.stato === 'BOZZA'; });
                if (!bozze.length) return;
                if (!await ENI.UI.confirm('Emettere tutte le ' + bozze.length + ' bozze? I numeri diventeranno definitivi.')) return;
                btnEmettiTutte.disabled = true;
                btnEmettiTutte.textContent = 'Emissione in corso...';
                var ok = 0, err = 0;
                for (var i = 0; i < bozze.length; i++) {
                    try {
                        await ENI.API.aggiornaStatoFattura(bozze[i].id, 'EMESSA');
                        ok++;
                    } catch(e) { err++; }
                }
                ENI.UI.toast(ok + ' documenti emessi' + (err ? ', ' + err + ' errori' : ''), ok ? 'success' : 'danger');
                _ricarica();
            });
        }
        // Modifica
        document.querySelectorAll('.btn-modifica').forEach(function(b) {
            b.addEventListener('click', async function() {
                try {
                    var full = await ENI.API.getFatturaCompleta(b.dataset.id);
                    _showModificaFattura(full);
                } catch(e) { ENI.UI.toast('Errore: ' + e.message, 'danger'); }
            });
        });
        // Annulla e riemetti come tipo diverso
        document.querySelectorAll('.btn-riemetti').forEach(function(b) {
            b.addEventListener('click', async function() {
                var tipoAttuale = b.dataset.tipo;
                var nuovoTipo = tipoAttuale === 'FATTURA' ? 'RICEVUTA' : 'FATTURA';
                var label = nuovoTipo === 'FATTURA' ? 'Fattura' : 'Ricevuta';
                var clienteNome = b.dataset.clienteNome || '';
                var clienteId = b.dataset.clienteId;

                if (!await ENI.UI.confirm('Annullare questo documento e riemetterlo come ' + label + '?\nIl numero attuale rester\u00e0 occupato, verr\u00e0 assegnato un nuovo numero.')) return;
                try {
                    var nuova = await ENI.API.annullaERiemetti(b.dataset.id, nuovoTipo);
                    ENI.UI.toast(label + ' ' + nuova.numero_formattato + ' emessa', 'success');

                    // Proponi aggiornamento tipo cliente
                    if (clienteId) {
                        var nuovoTipoCliente = nuovoTipo === 'RICEVUTA' ? 'Privato' : 'Corporate';
                        var tipoClienteAttuale = nuovoTipo === 'RICEVUTA' ? 'Corporate/Fornitore' : 'Privato';
                        var aggiornaCliente = await ENI.UI.confirm(
                            'Vuoi aggiornare anche il tipo del cliente "' + clienteNome + '" da ' + tipoClienteAttuale + ' a ' + nuovoTipoCliente + '?\n' +
                            'Cos\u00ec i prossimi documenti saranno automaticamente ' + (nuovoTipo === 'RICEVUTA' ? 'ricevute' : 'fatture') + '.'
                        );
                        if (aggiornaCliente) {
                            await ENI.API.aggiornaCliente(clienteId, { tipo: nuovoTipoCliente });
                            ENI.State.cacheClear();
                        }
                    }
                    _ricarica();
                } catch(e) { ENI.UI.toast('Errore: ' + e.message, 'danger'); }
            });
        });
    }

    // --- Form modifica fattura ---
    function _showModificaFattura(full) {
        var f = full.fattura;
        var righe = full.righe || [];
        var isBozza = f.stato === 'BOZZA';

        var modPagOpts = ['','RIBA','RID_SDD','BONIFICO','CONTANTI','FINE_MESE'].map(function(v) {
            return '<option value="' + v + '"' + (f.modalita_pagamento === v ? ' selected' : '') + '>' + (v || '-- Nessuno --') + '</option>';
        }).join('');

        var righeHtml = '';
        if (isBozza) {
            righeHtml = '<div id="mod-fatt-righe">' + righe.map(function(r) {
                if (r.categoria === 'NOTA') {
                    return '<div class="form-row mod-fatt-riga" data-tipo="nota" style="align-items:flex-end;gap:0.5rem;margin-bottom:0.5rem;">' +
                        '<div class="form-group" style="flex:1;"><input type="text" class="form-input mfr-desc" value="' + ENI.UI.escapeHtml(r.descrizione || '') + '" placeholder="Nota / annotazione..." style="font-style:italic;"></div>' +
                        '<input type="hidden" class="mfr-qta" value="0"><input type="hidden" class="mfr-um" value=""><input type="hidden" class="mfr-prezzo" value="0"><input type="hidden" class="mfr-cat" value="NOTA">' +
                        '<button type="button" class="btn btn-danger btn-sm mfr-del" style="margin-bottom:0.75rem;">&times;</button>' +
                    '</div>';
                }
                return '<div class="form-row mod-fatt-riga" data-tipo="riga" style="align-items:flex-end;gap:0.5rem;margin-bottom:0.5rem;">' +
                    '<div class="form-group" style="flex:3;"><input type="text" class="form-input mfr-desc" value="' + ENI.UI.escapeHtml(r.descrizione || '') + '"></div>' +
                    '<div class="form-group" style="flex:1;"><input type="number" class="form-input mfr-qta" value="' + r.quantita + '" step="0.001"></div>' +
                    '<div class="form-group" style="flex:1;"><input type="text" class="form-input mfr-um" value="' + ENI.UI.escapeHtml(r.unita_misura || 'pz') + '"></div>' +
                    '<div class="form-group" style="flex:1;"><input type="number" class="form-input mfr-prezzo" value="' + r.prezzo_unitario + '" step="0.01"></div>' +
                    '<div class="form-group" style="flex:1;"><select class="form-select mfr-cat">' +
                        ['CARBURANTE','LAVAGGIO','ACCESSORIO','ALTRO'].map(function(c) { return '<option value="' + c + '"' + (r.categoria === c ? ' selected' : '') + '>' + c + '</option>'; }).join('') +
                    '</select></div>' +
                    '<button type="button" class="btn btn-danger btn-sm mfr-del" style="margin-bottom:0.75rem;">&times;</button>' +
                '</div>';
            }).join('') + '</div>' +
            '<div style="display:flex;gap:0.5rem;margin-top:0.5rem;">' +
                '<button type="button" class="btn btn-outline btn-sm" id="mod-fatt-add-riga">+ Aggiungi riga</button>' +
                '<button type="button" class="btn btn-outline btn-sm" id="mod-fatt-add-nota">+ Aggiungi nota</button>' +
            '</div>';
        } else {
            righeHtml = '<table class="table table-sm"><thead><tr><th>Descrizione</th><th>Qt\u00e0</th><th>U.M.</th><th>Prezzo</th><th>Importo</th></tr></thead><tbody>' +
                righe.map(function(r) {
                    if (r.categoria === 'NOTA') return '<tr><td colspan="5" style="font-style:italic;color:var(--text-secondary);">' + ENI.UI.escapeHtml(r.descrizione) + '</td></tr>';
                    return '<tr><td>' + ENI.UI.escapeHtml(r.descrizione) + '</td><td>' + r.quantita + '</td><td>' + r.unita_misura + '</td><td>' + _fmtNum(r.prezzo_unitario) + '</td><td>\u20AC ' + _fmtNum(r.importo) + '</td></tr>';
                }).join('') + '</tbody></table>';
        }

        var tipoDocOpts = '';
        if (isBozza) {
            tipoDocOpts = '<div class="form-group"><label class="form-label">Tipo documento</label>' +
                '<select class="form-select" id="mod-fatt-tipodoc">' +
                    '<option value="FATTURA"' + (f.tipo_documento === 'FATTURA' ? ' selected' : '') + '>Fattura</option>' +
                    '<option value="RICEVUTA"' + (f.tipo_documento === 'RICEVUTA' ? ' selected' : '') + '>Ricevuta</option>' +
                '</select></div>';
        }

        var numField = '';
        if (isBozza) {
            numField = '<div class="form-group" style="max-width:120px;"><label class="form-label">Numero</label>' +
                '<input type="number" class="form-input" id="mod-fatt-numero" value="' + (f.numero || '') + '" min="1"></div>';
        }

        var body =
            '<form id="form-mod-fatt">' +
                '<p><strong>' + (f.tipo_documento === 'RICEVUTA' ? 'Ricevuta' : 'Fattura') + ' ' + f.numero_formattato + '</strong> &mdash; Stato: ' + f.stato + '</p>' +
                '<p>Cliente: <strong>' + ENI.UI.escapeHtml(f.cliente ? f.cliente.nome_ragione_sociale : '') + '</strong></p>' +
                '<div class="form-row">' +
                    numField +
                    tipoDocOpts +
                    '<div class="form-group"><label class="form-label">Data emissione</label>' +
                        '<input type="date" class="form-input" id="mod-fatt-data" value="' + (f.data_emissione || '') + '"' + (isBozza ? '' : ' disabled') + '></div>' +
                    '<div class="form-group"><label class="form-label">Data scadenza</label>' +
                        '<input type="date" class="form-input" id="mod-fatt-scad" value="' + (f.data_scadenza || '') + '"></div>' +
                    '<div class="form-group"><label class="form-label">Modalit\u00e0 pagamento</label>' +
                        '<select class="form-select" id="mod-fatt-modpag">' + modPagOpts + '</select></div>' +
                '</div>' +
                '<div class="form-group"><label class="form-label">Note</label>' +
                    '<textarea class="form-input" id="mod-fatt-note" rows="2">' + ENI.UI.escapeHtml(f.note || '') + '</textarea></div>' +
                (isBozza ? '<h4 class="mt-3 mb-2">Righe</h4>' : '<h4 class="mt-3 mb-2">Righe (non modificabili - fattura emessa)</h4>') +
                righeHtml +
            '</form>';

        var modal = ENI.UI.showModal({
            title: 'Modifica ' + (f.tipo_documento === 'RICEVUTA' ? 'Ricevuta' : 'Fattura') + ' ' + f.numero_formattato,
            body: body,
            footer: '<button class="btn btn-outline" data-modal-close>Annulla</button>' +
                    '<button class="btn btn-primary" id="btn-salva-mod-fatt">Salva modifiche</button>',
            size: 'lg'
        });

        // Righe dinamiche per bozze
        if (isBozza) {
            modal.querySelector('#mod-fatt-add-riga').addEventListener('click', function() {
                var html = '<div class="form-row mod-fatt-riga" data-tipo="riga" style="align-items:flex-end;gap:0.5rem;margin-bottom:0.5rem;">' +
                    '<div class="form-group" style="flex:3;"><input type="text" class="form-input mfr-desc" value=""></div>' +
                    '<div class="form-group" style="flex:1;"><input type="number" class="form-input mfr-qta" value="1" step="0.001"></div>' +
                    '<div class="form-group" style="flex:1;"><input type="text" class="form-input mfr-um" value="pz"></div>' +
                    '<div class="form-group" style="flex:1;"><input type="number" class="form-input mfr-prezzo" value="0" step="0.01"></div>' +
                    '<div class="form-group" style="flex:1;"><select class="form-select mfr-cat"><option value="CARBURANTE">CARBURANTE</option><option value="LAVAGGIO">LAVAGGIO</option><option value="ACCESSORIO">ACCESSORIO</option><option value="ALTRO">ALTRO</option></select></div>' +
                    '<button type="button" class="btn btn-danger btn-sm mfr-del" style="margin-bottom:0.75rem;">&times;</button></div>';
                modal.querySelector('#mod-fatt-righe').insertAdjacentHTML('beforeend', html);
            });
            modal.querySelector('#mod-fatt-add-nota').addEventListener('click', function() {
                var html = '<div class="form-row mod-fatt-riga" data-tipo="nota" style="align-items:flex-end;gap:0.5rem;margin-bottom:0.5rem;">' +
                    '<div class="form-group" style="flex:1;"><input type="text" class="form-input mfr-desc" value="" placeholder="Nota / annotazione..." style="font-style:italic;"></div>' +
                    '<input type="hidden" class="mfr-qta" value="0"><input type="hidden" class="mfr-um" value=""><input type="hidden" class="mfr-prezzo" value="0"><input type="hidden" class="mfr-cat" value="NOTA">' +
                    '<button type="button" class="btn btn-danger btn-sm mfr-del" style="margin-bottom:0.75rem;">&times;</button></div>';
                modal.querySelector('#mod-fatt-righe').insertAdjacentHTML('beforeend', html);
            });
            modal.addEventListener('click', function(e) {
                if (e.target.classList.contains('mfr-del')) e.target.closest('.mod-fatt-riga').remove();
            });
        }

        modal.querySelector('#btn-salva-mod-fatt').addEventListener('click', async function() {
            var dati = {
                data_scadenza: modal.querySelector('#mod-fatt-scad').value || null,
                modalita_pagamento: modal.querySelector('#mod-fatt-modpag').value || null,
                note: modal.querySelector('#mod-fatt-note').value.trim() || null
            };

            var nuovoTipoDoc = null;
            if (isBozza) {
                var selTipoDoc = modal.querySelector('#mod-fatt-tipodoc');
                if (selTipoDoc) {
                    nuovoTipoDoc = selTipoDoc.value;
                    dati.tipo_documento = nuovoTipoDoc;
                }
                // Numero e data emissione modificabili per bozze
                var numInput = modal.querySelector('#mod-fatt-numero');
                if (numInput && numInput.value) {
                    var nuovoNum = parseInt(numInput.value, 10);
                    if (nuovoNum > 0) {
                        dati.numero = nuovoNum;
                        var prefisso = (nuovoTipoDoc || f.tipo_documento) === 'RICEVUTA' ? 'R' : '';
                        dati.numero_formattato = prefisso + nuovoNum + '/' + f.anno;
                    }
                }
                var dataInput = modal.querySelector('#mod-fatt-data');
                if (dataInput && dataInput.value) {
                    dati.data_emissione = dataInput.value;
                }
            }

            var nuoveRighe = null;
            if (isBozza) {
                nuoveRighe = [];
                var totale = 0;
                modal.querySelectorAll('.mod-fatt-riga').forEach(function(row, i) {
                    var qta = parseFloat(row.querySelector('.mfr-qta').value) || 0;
                    var prezzo = parseFloat(row.querySelector('.mfr-prezzo').value) || 0;
                    var importo = Math.round(qta * prezzo * 100) / 100;
                    totale += importo;
                    nuoveRighe.push({
                        ordine: i,
                        descrizione: row.querySelector('.mfr-desc').value.trim(),
                        quantita: qta,
                        unita_misura: row.querySelector('.mfr-um').value.trim(),
                        prezzo_unitario: prezzo,
                        importo: importo,
                        categoria: row.querySelector('.mfr-cat').value
                    });
                });
                dati.totale = totale;
            }

            // Controllo numero duplicato
            if (dati.numero && (dati.numero !== f.numero || (nuovoTipoDoc && nuovoTipoDoc !== f.tipo_documento))) {
                var tipoCheck = nuovoTipoDoc || f.tipo_documento;
                var esistenti = await ENI.API.getFatture({ anno: f.anno, tipo: null });
                var duplicato = esistenti.find(function(x) {
                    return x.id !== f.id && x.numero === dati.numero && x.tipo_documento === tipoCheck;
                });
                if (duplicato) {
                    var cliDup = duplicato.cliente ? duplicato.cliente.nome_ragione_sociale : '';
                    if (!await ENI.UI.confirm('Attenzione: il numero ' + dati.numero_formattato + ' \u00e8 gi\u00e0 usato dalla ' +
                        (tipoCheck === 'RICEVUTA' ? 'ricevuta' : 'fattura') + ' di "' + cliDup + '".\n\nVuoi salvare comunque?')) return;
                }
            }

            try {
                await ENI.API.aggiornaFattura(f.id, dati, nuoveRighe);

                // Se il tipo documento è cambiato, proponi aggiornamento anagrafica cliente
                if (nuovoTipoDoc && nuovoTipoDoc !== f.tipo_documento && f.cliente_id) {
                    var nuovoTipoCliente = nuovoTipoDoc === 'RICEVUTA' ? 'Privato' : 'Corporate';
                    var clienteNome = f.cliente ? f.cliente.nome_ragione_sociale : '';
                    var aggiornaCliente = await ENI.UI.confirm(
                        'Hai cambiato da ' + (f.tipo_documento === 'FATTURA' ? 'Fattura' : 'Ricevuta') + ' a ' + (nuovoTipoDoc === 'FATTURA' ? 'Fattura' : 'Ricevuta') + '.\n\n' +
                        'Vuoi aggiornare anche il tipo del cliente "' + clienteNome + '" a ' + nuovoTipoCliente + '?\n' +
                        'Cos\u00ec i prossimi documenti saranno automaticamente ' + (nuovoTipoDoc === 'RICEVUTA' ? 'ricevute' : 'fatture') + '.'
                    );
                    if (aggiornaCliente) {
                        await ENI.API.aggiornaCliente(f.cliente_id, { tipo: nuovoTipoCliente });
                        ENI.State.cacheClear();
                    }
                }

                ENI.UI.closeModal(modal);
                ENI.UI.toast('Documento aggiornato', 'success');
                _ricarica();
            } catch(e) {
                ENI.UI.toast('Errore: ' + e.message, 'danger');
            }
        });
    }

    function _badge(stato) {
        var map = { BOZZA: 'secondary', EMESSA: 'primary', PAGATA: 'success', ANNULLATA: 'danger' };
        return '<span class="badge badge-' + (map[stato] || 'secondary') + '">' + stato + '</span>';
    }
    function _fmtData(d) {
        if (!d) return '-';
        var dt = new Date(d);
        return String(dt.getDate()).padStart(2,'0') + '/' + String(dt.getMonth()+1).padStart(2,'0') + '/' + dt.getFullYear();
    }
    function _fmtNum(n) {
        return (Number(n) || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    return { render: render };
})();
