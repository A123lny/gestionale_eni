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
            // RID/SDD: serve IBAN completo + mandato (SEPA SDD)
            // RIBA: bastano ABI + CAB (il tracciato CBI .car non usa l'IBAN)
            if (prefix === 'rid') {
                if (!cli.iban) problemi.push('IBAN mancante');
                else if (!_validaIban(cli.iban)) problemi.push('IBAN malformato (' + cli.iban.length + ' char)');
                if (!cli.mandate_id) problemi.push('Mandato SDD mancante');
            } else {
                if (!cli.abi_banca || !cli.cab_banca) problemi.push('ABI/CAB mancante');
            }
            var cls = problemi.length ? 'style="background:var(--bg-danger-subtle);"' : '';

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
        // FOOTER (120 byte)
        // Layout: ' EF' + codSia(5) + abi(5) + DDMMYY(6) + 'CAR' + DDMMYYYY(8) + HHMM(4)
        //         + filler(11) + nDispo(7) + totaleNeg(15) + totalePos(15) + nRecTot(7)
        //         + filler(24) + 'E      ' (7)
        // ============================================
        // Mexal usa totale × 10 nel campo da 15 char (formato millesimi convenzionale)
        var totaleField = _pad(totaleImporti * 10, 15);
        var nRecordsTot = 1 + (fatture.length * 7) + 1;  // header + 7 per dispo + footer
        var footer = ' EF' + codSia + abiEmittente + dataDDMMYY + 'CAR' + dataDDMMYYYY + oraHHMM
            + ' '.repeat(11)
            + _pad(fatture.length, 7)
            + totaleField
            + _pad(0, 15)
            + _pad(nRecordsTot, 7);
        // 3+5+5+6+3+8+4+11+7+15+15+7 = 89 char
        footer = (footer + ' '.repeat(24)).substring(0, 113) + 'E      ';  // 113 + 7 = 120
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
