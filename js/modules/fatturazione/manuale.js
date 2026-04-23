// ============================================================
// FATTURAZIONE - Tab Nuova Fattura Manuale
// Form completo con ricerca cliente, righe dinamiche, emissione PDF
// ============================================================

var ENI = ENI || {};
ENI.Fatturazione = ENI.Fatturazione || {};

ENI.Fatturazione.Manuale = (function() {
    'use strict';

    var _clienteSelezionato = null;
    var _righeCounter = 0;
    var _container = null;
    var _ibanLista = [];

    async function render(container) {
        _container = container;
        _clienteSelezionato = null;
        _righeCounter = 0;

        // Carica IBAN emittente
        try {
            var imp = await ENI.API.getImpostazioniFatturazione();
            _ibanLista = (imp && imp.iban_lista && Array.isArray(imp.iban_lista)) ? imp.iban_lista : [];
        } catch(e) { _ibanLista = []; }

        container.innerHTML =
            '<div class="card"><div class="card-body">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">' +
                '<h3>Nuova fattura manuale</h3>' +
                '<button class="btn btn-secondary btn-sm" id="fatt-m-back">Torna all\'elenco</button>' +
            '</div>' +
            '<form id="fatt-m-form">' +
                // --- Sezione Cliente ---
                '<fieldset class="mb-3">' +
                    '<legend>Cliente</legend>' +
                    '<div class="form-group" style="position:relative;">' +
                        '<input type="text" class="form-input" id="fatt-m-cerca" placeholder="Cerca cliente per nome, P.IVA/COE o targa...">' +
                        '<div id="fatt-m-cerca-results" class="pos-search-results" style="display:none;position:absolute;z-index:10;width:100%;"></div>' +
                    '</div>' +
                    '<div id="fatt-m-cliente-info" style="display:none;"></div>' +
                '</fieldset>' +
                // --- Sezione Documento ---
                '<fieldset class="mb-3">' +
                    '<legend>Documento</legend>' +
                    '<div class="form-row">' +
                        '<div class="form-group"><label class="form-label">Data emissione</label>' +
                            '<input type="date" class="form-input" id="fatt-m-data" value="' + _oggi() + '" required></div>' +
                        '<div class="form-group"><label class="form-label">Modalit\u00e0 pagamento</label>' +
                            '<select class="form-select" id="fatt-m-modpag">' +
                                '<option value="">Seleziona...</option>' +
                                '<option value="RIBA">RIBA</option>' +
                                '<option value="RID_SDD">RID / SDD</option>' +
                                '<option value="BONIFICO">Bonifico</option>' +
                                '<option value="CONTANTI">Contanti</option>' +
                                '<option value="FINE_MESE">Fine mese</option>' +
                            '</select></div>' +
                        '<div class="form-group"><label class="form-label">Scadenza giorni</label>' +
                            '<input type="number" class="form-input" id="fatt-m-scadgg" value="30" min="0" max="365"></div>' +
                    '</div>' +
                    '<div class="form-group" id="fatt-m-iban-group" style="display:none;"><label class="form-label">IBAN beneficiario</label>' +
                        '<select class="form-select" id="fatt-m-iban"></select></div>' +
                    '<div class="form-group"><label class="form-label">Note</label>' +
                        '<textarea class="form-input" id="fatt-m-note" rows="2"></textarea></div>' +
                '</fieldset>' +
                // --- Monofase ---
                '<div id="fatt-m-monofase" style="display:none;">' +
                    '<fieldset class="mb-3"><legend>Coefficiente monofase</legend>' +
                        '<div class="form-row">' +
                            '<div class="form-group"><label class="form-label">Mese</label>' +
                                '<select class="form-select" id="fatt-m-mono-mese">' +
                                    ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'].map(function(n,i) {
                                        return '<option value="' + (i+1) + '">' + n + '</option>';
                                    }).join('') +
                                '</select></div>' +
                            '<div class="form-group"><label class="form-label">Anno</label>' +
                                '<input type="number" class="form-input" id="fatt-m-mono-anno" value="' + new Date().getFullYear() + '"></div>' +
                            '<div class="form-group"><label class="form-label">Coefficiente</label>' +
                                '<input type="text" class="form-input" id="fatt-m-mono-coeff" readonly></div>' +
                            '<button type="button" class="btn btn-outline btn-sm" id="fatt-m-mono-carica" style="margin-bottom:0.75rem;">Carica</button>' +
                        '</div>' +
                        '<p class="text-xs text-muted" id="fatt-m-mono-info"></p>' +
                    '</fieldset>' +
                '</div>' +
                // --- Righe ---
                '<fieldset class="mb-3">' +
                    '<legend>Righe fattura</legend>' +
                    '<div id="fatt-m-righe"></div>' +
                    '<button type="button" class="btn btn-outline btn-sm mt-2" id="fatt-m-add-riga">+ Aggiungi riga</button>' +
                '</fieldset>' +
                // --- Totale ---
                '<div class="fatt-m-totale" style="text-align:right;font-size:1.3rem;font-weight:bold;margin:1rem 0;" id="fatt-m-totale">Totale: \u20AC 0,00</div>' +
                // --- Azioni ---
                '<div style="display:flex;gap:0.5rem;justify-content:flex-end;">' +
                    '<button type="button" class="btn btn-secondary" id="fatt-m-bozza">Salva bozza</button>' +
                    '<button type="submit" class="btn btn-primary">Emetti fattura</button>' +
                '</div>' +
            '</form>' +
            '</div></div>';

        _attachHandlers();
        _aggiungiRiga();
    }

    function _oggi() {
        var d = new Date();
        return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    }

    function _attachHandlers() {
        // Torna all'elenco
        document.getElementById('fatt-m-back').addEventListener('click', function() {
            ENI.Fatturazione.Index.vaiA('elenco');
        });

        // Ricerca cliente
        ENI.Utils.setupClienteSearch(
            document.getElementById('fatt-m-cerca'),
            document.getElementById('fatt-m-cerca-results'),
            { clearOnSelect: false, onSelect: _onClienteSelezionato }
        );

        // Popola dropdown IBAN e mostra/nascondi in base a modalità pagamento
        _popolaDropdownIban();
        document.getElementById('fatt-m-modpag').addEventListener('change', function() {
            var val = document.getElementById('fatt-m-modpag').value;
            var show = (val === 'BONIFICO' || val === 'RIBA' || val === 'RID_SDD');
            document.getElementById('fatt-m-iban-group').style.display = show ? '' : 'none';
        });

        // Aggiungi riga
        document.getElementById('fatt-m-add-riga').addEventListener('click', _aggiungiRiga);

        // Carica coefficiente monofase
        document.getElementById('fatt-m-mono-carica').addEventListener('click', async function() {
            var mese = parseInt(document.getElementById('fatt-m-mono-mese').value, 10);
            var anno = parseInt(document.getElementById('fatt-m-mono-anno').value, 10);
            var meseRif = anno + '-' + String(mese).padStart(2, '0') + '-01';
            try {
                var rows = await ENI.API.getAll('coefficiente_monofase_mensile', {
                    filters: [{ op: 'eq', col: 'mese_riferimento', val: meseRif }]
                });
                if (rows && rows.length && rows[0].coefficiente_monofase) {
                    document.getElementById('fatt-m-mono-coeff').value = rows[0].coefficiente_monofase;
                    document.getElementById('fatt-m-mono-info').textContent = 'Coefficiente trovato: ' + rows[0].coefficiente_monofase + ' (stato: ' + rows[0].stato + ')';
                } else {
                    document.getElementById('fatt-m-mono-coeff').value = '';
                    document.getElementById('fatt-m-mono-info').textContent = 'Nessun coefficiente disponibile per questo mese. Verificare nel modulo Coeff. Monofase.';
                }
            } catch(e) {
                ENI.UI.toast('Errore caricamento coefficiente: ' + e.message, 'danger');
            }
        });

        // Bozza
        document.getElementById('fatt-m-bozza').addEventListener('click', function() {
            _salva('BOZZA');
        });

        // Emetti
        document.getElementById('fatt-m-form').addEventListener('submit', function(e) {
            e.preventDefault();
            _salva('EMESSA');
        });
    }

    function _onClienteSelezionato(cliente) {
        _clienteSelezionato = cliente;
        document.getElementById('fatt-m-cerca').value = cliente.nome_ragione_sociale;

        // Precompila da anagrafica
        if (cliente.modalita_pagamento_fattura) {
            document.getElementById('fatt-m-modpag').value = cliente.modalita_pagamento_fattura;
        }
        if (cliente.scadenza_giorni) {
            document.getElementById('fatt-m-scadgg').value = cliente.scadenza_giorni;
        }

        // Monofase
        var monoDiv = document.getElementById('fatt-m-monofase');
        if (monoDiv) monoDiv.style.display = cliente.applica_monofase ? 'block' : 'none';

        // Info box
        var box = document.getElementById('fatt-m-cliente-info');
        box.style.display = 'block';
        box.innerHTML =
            '<div class="card" style="background:var(--bg-secondary);padding:0.75rem;margin-top:0.5rem;">' +
                '<strong>' + ENI.UI.escapeHtml(cliente.nome_ragione_sociale) + '</strong>' +
                (cliente.p_iva_coe ? ' &mdash; COE/P.IVA: ' + ENI.UI.escapeHtml(cliente.p_iva_coe) : '') +
                (cliente.sede_legale_indirizzo ? '<br>' + ENI.UI.escapeHtml([cliente.sede_legale_indirizzo, cliente.sede_legale_cap, cliente.sede_legale_comune].filter(Boolean).join(', ')) : '') +
                (cliente.rif_amministrazione ? '<br>Rif. amm.: ' + ENI.UI.escapeHtml(cliente.rif_amministrazione) : '') +
                (cliente.modalita_pagamento_fattura ? '<br>Pagamento: ' + cliente.modalita_pagamento_fattura + ' - Scadenza: ' + (cliente.scadenza_giorni || 30) + 'gg' : '') +
            '</div>';
    }

    function _popolaDropdownIban() {
        var sel = document.getElementById('fatt-m-iban');
        if (!sel) return;
        var opts = '<option value="">-- Nessuno --</option>';
        _ibanLista.forEach(function(item) {
            var label = (item.banca ? item.banca + ' \u2014 ' : '') + item.iban;
            opts += '<option value="' + ENI.UI.escapeHtml(item.iban) + '">' + ENI.UI.escapeHtml(label) + '</option>';
        });
        sel.innerHTML = opts;
    }

    function _aggiungiRiga() {
        _righeCounter++;
        var id = 'riga-' + _righeCounter;
        var html =
            '<div class="form-row fatt-m-riga" id="' + id + '" style="align-items:flex-end;gap:0.5rem;margin-bottom:0.5rem;">' +
                '<div class="form-group" style="flex:3;"><label class="form-label">Descrizione</label>' +
                    '<input type="text" class="form-input r-desc" placeholder="Es: Rifornimento gasolio" required></div>' +
                '<div class="form-group" style="flex:1;"><label class="form-label">Qt\u00e0</label>' +
                    '<input type="number" class="form-input r-qta" value="1" step="0.001" min="0"></div>' +
                '<div class="form-group" style="flex:1;"><label class="form-label">U.M.</label>' +
                    '<select class="form-select r-um"><option value="pz">pz</option><option value="L">L</option><option value="servizio">servizio</option></select></div>' +
                '<div class="form-group" style="flex:1;"><label class="form-label">Prezzo</label>' +
                    '<input type="number" class="form-input r-prezzo" value="0" step="0.01" min="0"></div>' +
                '<div class="form-group" style="flex:1;"><label class="form-label">Categoria</label>' +
                    '<select class="form-select r-cat">' +
                        '<option value="CARBURANTE">Carburante</option>' +
                        '<option value="LAVAGGIO">Lavaggio</option>' +
                        '<option value="ACCESSORIO">Accessorio</option>' +
                        '<option value="ALTRO">Altro</option>' +
                    '</select></div>' +
                '<div class="form-group" style="flex:1;text-align:right;"><label class="form-label">Importo</label>' +
                    '<span class="r-importo" style="display:block;font-weight:bold;padding:0.5rem 0;">\u20AC 0,00</span></div>' +
                '<button type="button" class="btn btn-danger btn-sm r-rimuovi" style="margin-bottom:0.75rem;">&times;</button>' +
            '</div>';

        document.getElementById('fatt-m-righe').insertAdjacentHTML('beforeend', html);

        var row = document.getElementById(id);
        row.querySelector('.r-qta').addEventListener('input', function() { _aggiornaImportoRiga(row); });
        row.querySelector('.r-prezzo').addEventListener('input', function() { _aggiornaImportoRiga(row); });
        row.querySelector('.r-rimuovi').addEventListener('click', function() {
            row.remove();
            _aggiornaTotale();
        });
    }

    function _aggiornaImportoRiga(row) {
        var qta = parseFloat(row.querySelector('.r-qta').value) || 0;
        var prezzo = parseFloat(row.querySelector('.r-prezzo').value) || 0;
        var importo = Math.round(qta * prezzo * 100) / 100;
        row.querySelector('.r-importo').textContent = '\u20AC ' + importo.toLocaleString('it-IT', { minimumFractionDigits: 2 });
        _aggiornaTotale();
    }

    function _aggiornaTotale() {
        var totale = 0;
        document.querySelectorAll('.fatt-m-riga').forEach(function(row) {
            var qta = parseFloat(row.querySelector('.r-qta').value) || 0;
            var prezzo = parseFloat(row.querySelector('.r-prezzo').value) || 0;
            totale += Math.round(qta * prezzo * 100) / 100;
        });
        document.getElementById('fatt-m-totale').textContent = 'Totale: \u20AC ' + totale.toLocaleString('it-IT', { minimumFractionDigits: 2 });
    }

    function _raccogliRighe() {
        var righe = [];
        document.querySelectorAll('.fatt-m-riga').forEach(function(row, i) {
            var qta = parseFloat(row.querySelector('.r-qta').value) || 0;
            var prezzo = parseFloat(row.querySelector('.r-prezzo').value) || 0;
            var importo = Math.round(qta * prezzo * 100) / 100;
            righe.push({
                ordine: i,
                descrizione: row.querySelector('.r-desc').value.trim(),
                quantita: qta,
                unita_misura: row.querySelector('.r-um').value,
                prezzo_unitario: prezzo,
                importo: importo,
                categoria: row.querySelector('.r-cat').value
            });
        });
        return righe;
    }

    async function _salva(stato) {
        if (!_clienteSelezionato) {
            ENI.UI.toast('Seleziona un cliente', 'danger');
            return;
        }
        var righe = _raccogliRighe();
        if (!righe.length) {
            ENI.UI.toast('Inserisci almeno una riga', 'danger');
            return;
        }
        var totale = righe.reduce(function(s, r) { return s + r.importo; }, 0);
        if (totale <= 0) {
            ENI.UI.toast('Il totale deve essere maggiore di zero', 'danger');
            return;
        }

        var dataEm = document.getElementById('fatt-m-data').value;
        var scadGg = parseInt(document.getElementById('fatt-m-scadgg').value, 10) || 30;
        var dataScad = new Date(dataEm);
        dataScad.setDate(dataScad.getDate() + scadGg);
        var dataScadStr = dataScad.getFullYear() + '-' + String(dataScad.getMonth()+1).padStart(2,'0') + '-' + String(dataScad.getDate()).padStart(2,'0');

        var tipoDocumento = _clienteSelezionato.tipo === 'Privato' ? 'RICEVUTA' : 'FATTURA';
        var fattura = {
            data_emissione: dataEm,
            data_scadenza: dataScadStr,
            cliente_id: _clienteSelezionato.id,
            tipo: 'MANUALE',
            tipo_documento: tipoDocumento,
            totale: totale,
            modalita_pagamento: document.getElementById('fatt-m-modpag').value || null,
            iban_beneficiario: null,
            stato: stato,
            note: document.getElementById('fatt-m-note').value.trim() || null,
            rif_amministrazione: _clienteSelezionato.rif_amministrazione || null
        };

        // Monofase
        if (_clienteSelezionato.applica_monofase) {
            var coeff = parseFloat(document.getElementById('fatt-m-mono-coeff').value);
            if (coeff) {
                fattura.monofase_coefficiente = coeff;
                fattura.monofase_mese = parseInt(document.getElementById('fatt-m-mono-mese').value, 10);
                fattura.monofase_anno = parseInt(document.getElementById('fatt-m-mono-anno').value, 10);
            }
        }

        // IBAN dal dropdown
        var ibanSel = document.getElementById('fatt-m-iban').value;
        if (ibanSel) fattura.iban_beneficiario = ibanSel;

        try {
            var f = await ENI.API.salvaFattura(fattura, righe, null);
            ENI.UI.toast('Fattura ' + f.numero_formattato + ' ' + (stato === 'BOZZA' ? 'salvata come bozza' : 'emessa'), 'success');

            // Se emessa, genera PDF
            if (stato === 'EMESSA') {
                try {
                    var full = await ENI.API.getFatturaCompleta(f.id);
                    var imp2 = await ENI.API.getImpostazioniFatturazione();
                    await ENI.Fatturazione.Pdf.generaPdf(full, imp2);
                } catch(e) {
                    ENI.UI.toast('Fattura emessa ma errore PDF: ' + e.message, 'warning');
                }
            }

            ENI.Fatturazione.Index.vaiA('elenco');
        } catch(e) {
            ENI.UI.toast('Errore: ' + e.message, 'danger');
        }
    }

    return { render: render };
})();
