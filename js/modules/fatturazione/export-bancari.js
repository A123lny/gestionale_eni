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
        html += '<h4 class="mt-3 mb-2">RID / SDD (' + rid.length + ' disposizioni) - ' + periodo + '</h4>';
        if (rid.length) {
            var totRid = rid.reduce(function(s, f) { return s + (parseFloat(f.totale) || 0); }, 0);
            html += _renderTabella(rid, 'rid');
            html += '<div style="display:flex;justify-content:space-between;align-items:center;margin:0.5rem 0 1.5rem;">' +
                '<strong>Totale RID: \u20AC ' + _fmtNum(totRid) + '</strong>' +
                '<button class="btn btn-primary" id="btn-genera-rid">Genera file RID (.xml)</button></div>';
        } else {
            html += '<p class="text-muted">Nessuna fattura RID emessa per questo periodo</p>';
        }

        // Sezione RIBA
        html += '<h4 class="mt-3 mb-2">RI.BA. (' + riba.length + ' disposizioni) - ' + periodo + '</h4>';
        if (riba.length) {
            var totRiba = riba.reduce(function(s, f) { return s + (parseFloat(f.totale) || 0); }, 0);
            html += _renderTabella(riba, 'riba');
            html += '<div style="display:flex;justify-content:space-between;align-items:center;margin:0.5rem 0 1.5rem;">' +
                '<strong>Totale RIBA: \u20AC ' + _fmtNum(totRiba) + '</strong>' +
                '<button class="btn btn-primary" id="btn-genera-riba">Genera file RIBA (.car)</button></div>';
        } else {
            html += '<p class="text-muted">Nessuna fattura RIBA emessa per questo periodo</p>';
        }

        return html;
    }

    function _renderTabella(fatture, prefix) {
        var rows = fatture.map(function(f, i) {
            var cli = f.cliente || {};
            var problemi = [];
            if (!cli.iban) problemi.push('IBAN mancante');
            if (prefix === 'rid' && !cli.mandate_id) problemi.push('Mandato SDD mancante');
            var cls = problemi.length ? 'style="background:var(--bg-danger-subtle);"' : '';

            return '<tr ' + cls + '>' +
                '<td><input type="checkbox" class="exp-check" data-prefix="' + prefix + '" data-idx="' + i + '" ' + (problemi.length ? 'disabled' : 'checked') + '></td>' +
                '<td>' + ENI.UI.escapeHtml(f.numero_formattato) + '</td>' +
                '<td>' + ENI.UI.escapeHtml(cli.nome_ragione_sociale || '') + '</td>' +
                '<td class="text-right">\u20AC ' + _fmtNum(f.totale) + '</td>' +
                '<td class="text-xs">' + ENI.UI.escapeHtml(cli.iban || '-') + '</td>' +
                '<td class="text-xs">' + (prefix === 'rid' ? ENI.UI.escapeHtml(cli.mandate_id || '-') : ENI.UI.escapeHtml(cli.banca_appoggio || '-')) + '</td>' +
                '<td>' + (problemi.length ? '<span class="text-danger text-xs">' + problemi.join(', ') + '</span>' : '<span class="text-success text-xs">OK</span>') + '</td>' +
            '</tr>';
        }).join('');

        return '<div class="table-wrapper"><table class="table table-sm">' +
            '<thead><tr><th style="width:30px;"></th><th>N\u00b0</th><th>Cliente</th><th class="text-right">Importo</th><th>IBAN</th><th>' + (prefix === 'rid' ? 'Mandato' : 'Banca app.') + '</th><th>Stato</th></tr></thead>' +
            '<tbody>' + rows + '</tbody></table></div>';
    }

    function _attachHandlers(rid, riba) {
        var btnRid = document.getElementById('btn-genera-rid');
        if (btnRid) {
            btnRid.addEventListener('click', function() {
                var selezionati = _getSelezionati(rid, 'rid');
                if (!selezionati.length) { ENI.UI.toast('Nessuna disposizione selezionata', 'danger'); return; }
                _generaRID(selezionati);
            });
        }
        var btnRiba = document.getElementById('btn-genera-riba');
        if (btnRiba) {
            btnRiba.addEventListener('click', function() {
                var selezionati = _getSelezionati(riba, 'riba');
                if (!selezionati.length) { ENI.UI.toast('Nessuna disposizione selezionata', 'danger'); return; }
                _generaRIBA(selezionati);
            });
        }
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
        xml += '      <Nm>' + _escXml(imp.ragione_sociale_emittente || 'ENILIVE STATION') + '</Nm>\n';
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
        xml += '      <Nm>' + _escXml(imp.ragione_sociale_emittente || '') + '</Nm>\n';
        xml += '      <PstlAdr><Ctry>SM</Ctry>\n';
        xml += '        <AdrLine>' + _escXml((imp.indirizzo || '').toUpperCase()) + '</AdrLine>\n';
        xml += '        <AdrLine>' + _escXml([imp.cap, imp.comune, 'RSM', 'SAN MARINO'].filter(Boolean).join(', ').toUpperCase()) + '</AdrLine>\n';
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
            xml += '        <Nm>' + _escXml((cli.nome_ragione_sociale || '').toUpperCase()) + '</Nm>\n';
            xml += '        <PstlAdr><Ctry>' + (cli.sede_legale_nazione || 'SM') + '</Ctry>\n';
            xml += '          <AdrLine>' + _escXml((cli.sede_legale_indirizzo || '').toUpperCase()) + '</AdrLine>\n';
            xml += '          <AdrLine>' + _escXml([cli.sede_legale_cap, cli.sede_legale_comune, 'RSM', 'SAN MARINO'].filter(Boolean).join(', ').toUpperCase()) + '</AdrLine>\n';
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
        var abiEmittente = imp.abi_emittente || '06067';
        var cabEmittente = imp.cab_emittente || '09801';
        var nomi = ['','Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
        var now = new Date();
        var dataCreazione = _pad(now.getDate(),2) + _pad(now.getMonth()+1,2) + now.getFullYear().toString().slice(-2);
        var codSia = imp.codice_cbi || 'C43SF';
        var coe = imp.coe_piva || 'SM30756';

        var content = '';

        // Record IB (header) - 120 char
        content += ' IB' + codSia + abiEmittente + dataCreazione + 'CAR' + dataCreazione + _rpad('', 4) + _rpad('', 58) + 'E       ';

        // Disposizioni
        var totaleImporti = 0;
        fatture.forEach(function(f, i) {
            var cli = f.cliente || {};
            var n = _pad(i + 1, 7);
            var importoCent = Math.round((parseFloat(f.totale) || 0) * 100);
            var importoStr = _pad(importoCent, 13);
            totaleImporti += importoCent;
            var scadGG = f.data_scadenza ? _fmtDataCBI(f.data_scadenza) : '000000';
            var abiCli = cli.abi_banca || '';
            var cabCli = cli.cab_banca || '';
            var ibanEmittente = bancaItem.iban || '';
            var tipoDoc = f.tipo_documento === 'RICEVUTA' ? 'RIF.DOCU.NUM.' : 'RIF.DOCU.NUM.';

            // Record 14 (disposizione)
            content += '14' + n + _rpad('', 12) + scadGG + '3' + '0' + importoStr + '-' + abiEmittente + cabEmittente + _rpad(ibanEmittente, 23) + _rpad(abiCli + cabCli, 10) + _rpad('', 12);

            // Record 20 (creditore)
            content += codSia;
            content += '40000000050200' + _pad(i+1, 3) + _rpad('', 6) + 'E ';
            content += '20' + n + _rpad(imp.ragione_sociale_emittente || 'ENILIVE STATION', 24) + _rpad((imp.indirizzo || '') + ' ' + (imp.cap || '') + ' ' + (imp.comune || ''), 96);

            // Record 30 (debitore)
            content += '30' + n + _rpad(cli.nome_ragione_sociale || '', 60) + _rpad(cli.p_iva_coe || '', 16) + _rpad('', 44);

            // Record 40 (indirizzo debitore + banca)
            content += '40' + n + _rpad(cli.sede_legale_indirizzo || '', 30) + _rpad(cli.sede_legale_cap || '', 5) + _rpad((cli.sede_legale_comune || '') + ' ' + (cli.sede_legale_nazione || 'RSM'), 23) + _rpad(cli.banca_appoggio || '', 50) + _rpad('', 12);

            // Record 50 (riferimento documento)
            content += '50' + n + tipoDoc + ':  ' + _rpad(f.numero_formattato, 10) + 'del ' + _fmtDataSlash(f.data_emissione) + _rpad('', 50) + _rpad(coe, 16) + _rpad('', 10);

            // Record 51 (codice fiscale creditore)
            content += '51' + n + _pad(i + 1, 10) + _rpad(imp.ragione_sociale_emittente || '', 80) + _rpad('', 30);

            // Record 70 (chiusura disposizione)
            content += '70' + n + _rpad('', 110) + '0' + _rpad('', 7);
        });

        // Record EF (footer)
        content += ' EF' + codSia + abiEmittente + dataCreazione + 'CAR' + dataCreazione + _rpad('', 4) + _rpad('', 7);
        content += _pad(fatture.length, 7) + _pad(totaleImporti, 15);
        content += _rpad('', 30) + _pad(fatture.length, 7) + _rpad('', 24) + 'E      ';

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
