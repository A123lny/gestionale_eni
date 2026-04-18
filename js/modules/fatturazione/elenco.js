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
        tipo: ''
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
                '<div class="form-group" style="min-width:180px;"><label class="form-label">Tipo</label>' +
                    '<select class="form-select" id="f-tipo">' +
                        '<option value="">Tutti</option>' +
                        '<option value="MANUALE">Manuale</option>' +
                        '<option value="RIEPILOGATIVA_ENI">Riepilogativa ENI</option>' +
                    '</select></div>' +
                '<div style="flex:1;"></div>' +
                '<button class="btn btn-secondary" id="btn-imp-emittente">\u{2699}\uFE0F Impostazioni</button>' +
                '<button class="btn btn-primary" id="btn-nuova-manuale">+ Nuova manuale</button>' +
                '<button class="btn btn-primary" id="btn-import-eni">\u{1F4E5} Importa ENI</button>' +
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
        ['f-anno','f-mese','f-stato','f-tipo'].forEach(function(id) {
            var el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('change', function() {
                _filtri.anno = parseInt(document.getElementById('f-anno').value, 10);
                _filtri.mese_riferimento = document.getElementById('f-mese').value;
                _filtri.stato = document.getElementById('f-stato').value;
                _filtri.tipo = document.getElementById('f-tipo').value;
                _ricarica();
            });
        });
        document.getElementById('btn-nuova-manuale').addEventListener('click', function() {
            ENI.Fatturazione.Index.vaiA('manuale');
        });
        document.getElementById('btn-import-eni').addEventListener('click', function() {
            ENI.Fatturazione.Index.vaiA('import');
        });
        document.getElementById('btn-imp-emittente').addEventListener('click', function() {
            ENI.Fatturazione.Index.vaiA('impostazioni');
        });
    }

    async function _ricarica() {
        var box = document.getElementById('fatt-lista-container');
        box.innerHTML = '<div class="flex justify-center" style="padding:2rem;"><div class="spinner"></div></div>';
        try {
            var filtri = { anno: _filtri.anno };
            if (_filtri.mese_riferimento) filtri.mese_riferimento = parseInt(_filtri.mese_riferimento, 10);
            if (_filtri.stato) filtri.stato = _filtri.stato;
            if (_filtri.tipo) filtri.tipo = _filtri.tipo;
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
        if (!_fatture.length) {
            return '<div class="empty-state"><div class="empty-state-icon">\u{1F4C4}</div><p class="empty-state-text">Nessuna fattura per i filtri selezionati</p></div>';
        }

        var totali = _fatture.reduce(function(acc, f) {
            var t = parseFloat(f.totale) || 0;
            acc.tot += t;
            if (f.stato === 'PAGATA') acc.pagato += t;
            else if (f.stato === 'EMESSA') acc.emesso += t;
            return acc;
        }, { tot: 0, emesso: 0, pagato: 0 });

        var rows = _fatture.map(function(f) {
            var cli = f.cliente ? f.cliente.nome_ragione_sociale : '';
            return '<tr data-id="' + f.id + '">' +
                '<td><strong>' + ENI.UI.escapeHtml(f.numero_formattato) + '</strong></td>' +
                '<td>' + _fmtData(f.data_emissione) + '</td>' +
                '<td>' + ENI.UI.escapeHtml(cli) + '</td>' +
                '<td>' + (f.tipo === 'MANUALE' ? 'Manuale' : 'Riepilog.') + '</td>' +
                '<td class="text-right">€ ' + _fmtNum(f.totale) + '</td>' +
                '<td>' + (f.data_scadenza ? _fmtData(f.data_scadenza) : '-') + '</td>' +
                '<td>' + _badge(f.stato) + '</td>' +
                '<td>' +
                    '<button class="btn btn-sm btn-secondary btn-pdf" data-id="' + f.id + '">PDF</button> ' +
                    (f.stato === 'EMESSA' ? '<button class="btn btn-sm btn-success btn-paga" data-id="' + f.id + '">Pagata</button> ' : '') +
                    (f.stato !== 'ANNULLATA' ? '<button class="btn btn-sm btn-danger btn-annulla" data-id="' + f.id + '">Annulla</button>' : '') +
                '</td>' +
            '</tr>';
        }).join('');

        return '<div class="table-wrapper"><table class="table table-hover">' +
            '<thead><tr><th>N°</th><th>Data</th><th>Cliente</th><th>Tipo</th><th class="text-right">Totale</th><th>Scadenza</th><th>Stato</th><th>Azioni</th></tr></thead>' +
            '<tbody>' + rows + '</tbody>' +
            '<tfoot><tr><th colspan="4" class="text-right">Totali:</th>' +
                '<th class="text-right">€ ' + _fmtNum(totali.tot) + '</th>' +
                '<th colspan="3">Emesso: € ' + _fmtNum(totali.emesso) + ' - Pagato: € ' + _fmtNum(totali.pagato) + '</th></tr></tfoot>' +
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
