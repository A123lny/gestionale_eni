// ============================================================
// GESTIONALE ENI - Timbrature (lato Super Admin)
// Chi c'è ora + ore lavorate per periodo + QR da stampare.
// ============================================================

var ENI = ENI || {};
ENI.Modules = ENI.Modules || {};

ENI.Modules.Timbrature = (function() {
    'use strict';

    var _da = '', _a = '', _timbrature = [], _personale = [];

    // --- Date helper ---
    function _oggi() { return ENI.UI.oggiISO(); }

    function _lunediCorrente() {
        var d = new Date(_oggi() + 'T12:00:00');
        var dow = (d.getDay() + 6) % 7; // 0 = lunedì
        d.setDate(d.getDate() - dow);
        return d.toISOString().slice(0, 10);
    }

    function _due(n) { return (n < 10 ? '0' : '') + n; }
    function _oraDi(ts) { var d = new Date(ts); return _due(d.getHours()) + ':' + _due(d.getMinutes()); }
    function _fmtOre(min) {
        min = Math.round(min);
        var h = Math.floor(min / 60), m = min % 60;
        return h + 'h ' + _due(m) + 'm';
    }

    async function render(container) {
        if (!_da) { _da = _lunediCorrente(); _a = _oggi(); }

        try { _personale = await ENI.API.getPersonale(); } catch (e) { _personale = []; }
        var manOpts = _personale.filter(function(p) { return p.attivo !== false; }).map(function(p) {
            return '<option value="' + p.id + '">' + ENI.UI.escapeHtml(p.nome_completo || ('#' + p.id)) + '</option>';
        }).join('');

        container.innerHTML =
            '<div class="page-header"><h1 class="page-title">⏱️ Timbrature</h1></div>' +
            '<div class="card" style="padding:var(--space-4); margin-bottom:var(--space-4);">' +
                '<div style="display:flex; flex-wrap:wrap; gap:10px; align-items:flex-end;">' +
                    '<div><label class="form-label">Dal</label><input type="date" class="form-input" id="timb-da" value="' + _da + '"></div>' +
                    '<div><label class="form-label">Al</label><input type="date" class="form-input" id="timb-a" value="' + _a + '"></div>' +
                    '<button class="btn btn-primary btn-sm" id="timb-aggiorna">Aggiorna</button>' +
                    '<div style="flex:1;"></div>' +
                    '<button class="btn btn-outline btn-sm" id="timb-pdf">\u{1F4C4} Esporta PDF</button>' +
                    '<button class="btn btn-outline btn-sm" id="timb-xls">\u{1F4CA} Esporta Excel</button>' +
                    '<button class="btn btn-outline btn-sm" id="timb-qr">\u{1F4F1} Genera QR timbratura</button>' +
                '</div>' +
                '<div class="text-xs text-muted" style="margin-top:6px;">Rapido: ' +
                    '<a href="#" data-range="oggi">Oggi</a> · ' +
                    '<a href="#" data-range="settimana">Questa settimana</a> · ' +
                    '<a href="#" data-range="mese">Questo mese</a></div>' +
            '</div>' +
            '<div class="card" style="padding:var(--space-4); margin-bottom:var(--space-4);">' +
                '<div style="font-weight:700; margin-bottom:8px;">✍️ Timbratura manuale <span class="text-xs text-muted">(solo super admin)</span></div>' +
                '<div style="display:flex; flex-wrap:wrap; gap:10px; align-items:flex-end;">' +
                    '<div><label class="form-label">Dipendente</label><select class="form-input" id="man-dip"><option value="">— scegli —</option>' + manOpts + '</select></div>' +
                    '<div><label class="form-label">Data e ora</label><input type="datetime-local" class="form-input" id="man-ts"></div>' +
                    '<div><label class="form-label">Tipo</label><select class="form-input" id="man-tipo"><option value="entrata">Entrata</option><option value="uscita">Uscita</option></select></div>' +
                    '<button class="btn btn-primary btn-sm" id="man-salva">Registra</button>' +
                '</div>' +
                '<div class="text-xs text-muted" style="margin-top:6px;">Solo per casi eccezionali (telefono scarico/dimenticato). Resta segnata come <strong>manuale</strong>.</div>' +
            '</div>' +
            '<div id="timb-content"><div class="flex justify-center" style="padding:2rem;"><div class="spinner"></div></div></div>';

        container.querySelector('#timb-aggiorna').addEventListener('click', function() {
            _da = container.querySelector('#timb-da').value;
            _a = container.querySelector('#timb-a').value;
            _load(container);
        });
        container.querySelector('#timb-qr').addEventListener('click', _mostraQr);
        container.querySelector('#timb-pdf').addEventListener('click', _esportaPdf);
        container.querySelector('#timb-xls').addEventListener('click', _esportaExcel);
        container.querySelectorAll('[data-range]').forEach(function(a) {
            a.addEventListener('click', function(e) {
                e.preventDefault();
                _applicaRange(a.getAttribute('data-range'), container);
            });
        });

        var manTs = container.querySelector('#man-ts');
        if (manTs) manTs.value = _nowLocalInput();
        var manBtn = container.querySelector('#man-salva');
        if (manBtn) manBtn.addEventListener('click', function() { _salvaManuale(container); });

        await _load(container);
    }

    function _applicaRange(range, container) {
        var oggi = _oggi();
        if (range === 'oggi') { _da = oggi; _a = oggi; }
        else if (range === 'settimana') { _da = _lunediCorrente(); _a = oggi; }
        else if (range === 'mese') { _da = oggi.slice(0, 8) + '01'; _a = oggi; }
        container.querySelector('#timb-da').value = _da;
        container.querySelector('#timb-a').value = _a;
        _load(container);
    }

    async function _load(container) {
        var content = document.getElementById('timb-content');
        if (content) content.innerHTML = '<div class="flex justify-center" style="padding:2rem;"><div class="spinner"></div></div>';
        try {
            _timbrature = await ENI.API.getTimbrature(_da, _a);
        } catch (e) {
            if (content) content.innerHTML = '<p class="text-danger">Errore: ' + ENI.UI.escapeHtml(e.message) + '</p>';
            return;
        }
        _renderContenuto();
    }

    // Raggruppa gli eventi in coppie entrata->uscita (per giorno)
    function _sessioni(eventi) {
        var sorted = eventi.slice().sort(function(a, b) { return a.ts < b.ts ? -1 : (a.ts > b.ts ? 1 : 0); });
        var sess = [], aperta = null;
        sorted.forEach(function(e) {
            if (e.tipo === 'entrata') {
                if (aperta) sess.push({ inizio: aperta, fine: null });
                aperta = e.ts;
            } else {
                if (aperta) { sess.push({ inizio: aperta, fine: e.ts }); aperta = null; }
                else sess.push({ inizio: null, fine: e.ts });
            }
        });
        if (aperta) sess.push({ inizio: aperta, fine: null });
        return sess;
    }

    function _minuti(sess) {
        return sess.reduce(function(tot, s) {
            if (s.inizio && s.fine) tot += (new Date(s.fine) - new Date(s.inizio)) / 60000;
            return tot;
        }, 0);
    }

    function _renderContenuto() {
        var content = document.getElementById('timb-content');
        if (!content) return;

        // Raggruppa per persona
        var perPersona = {};
        _timbrature.forEach(function(t) {
            var nome = (t.personale && t.personale.nome_completo) || '—';
            if (!perPersona[t.personale_id]) perPersona[t.personale_id] = { nome: nome, eventi: [] };
            perPersona[t.personale_id].eventi.push(t);
        });

        // Chi c'è ora (in base a oggi: ultimo evento di oggi = entrata)
        var oggi = _oggi();
        var dentro = [];
        Object.keys(perPersona).forEach(function(pid) {
            var oggiEv = perPersona[pid].eventi.filter(function(e) { return e.data === oggi; })
                .sort(function(a, b) { return a.ts < b.ts ? -1 : 1; });
            var last = oggiEv[oggiEv.length - 1];
            if (last && last.tipo === 'entrata') dentro.push({ nome: perPersona[pid].nome, ora: _oraDi(last.ts) });
        });

        var chiCeHtml =
            '<div class="card" style="padding:var(--space-4); margin-bottom:var(--space-4);">' +
                '<div style="font-weight:700; margin-bottom:8px;">\u{1F7E2} In servizio ora</div>' +
                (dentro.length
                    ? '<div style="display:flex; flex-wrap:wrap; gap:8px;">' + dentro.map(function(p) {
                        return '<span class="badge badge-success" style="padding:6px 12px;">' + ENI.UI.escapeHtml(p.nome) + ' · da ' + p.ora + '</span>';
                      }).join('') + '</div>'
                    : '<div class="text-sm text-muted">Nessuno in servizio in questo momento.</div>') +
            '</div>';

        // Tabella ore per persona (nel periodo)
        var righe = Object.keys(perPersona).map(function(pid) {
            var p = perPersona[pid];
            // ore totali = somma per ogni giorno
            var perGiorno = {};
            p.eventi.forEach(function(e) { (perGiorno[e.data] = perGiorno[e.data] || []).push(e); });
            var totMin = 0, dettaglio = [], sospese = 0;
            Object.keys(perGiorno).sort().forEach(function(g) {
                var sess = _sessioni(perGiorno[g]);
                totMin += _minuti(sess);
                sess.forEach(function(s) { if (!s.inizio || !s.fine) sospese++; });
                var righeGiorno = sess.map(function(s) {
                    return (s.inizio ? _oraDi(s.inizio) : '??') + '–' + (s.fine ? _oraDi(s.fine) : '??');
                }).join(', ');
                dettaglio.push('<div class="text-xs" style="color:var(--color-gray-600);">' + _fmtData(g) + ': ' + righeGiorno + '</div>');
            });
            return '<tr class="timb-row" style="cursor:pointer;" data-pid="' + pid + '">' +
                    '<td><strong>' + ENI.UI.escapeHtml(p.nome) + '</strong>' + (sospese ? ' <span class="badge badge-warning" title="Timbrate incomplete (entrata o uscita mancante)">⚠️ ' + sospese + '</span>' : '') + '</td>' +
                    '<td style="text-align:right; font-weight:700;">' + _fmtOre(totMin) + '</td>' +
                '</tr>' +
                '<tr class="timb-dett" data-dett="' + pid + '" style="display:none;"><td colspan="2" style="background:var(--bg-secondary);">' + dettaglio.join('') + '</td></tr>';
        }).join('');

        var tabella = righe
            ? '<div class="card" style="padding:0;">' +
                '<div class="table-wrapper"><table class="table"><thead><tr><th>Dipendente</th><th style="text-align:right;">Ore nel periodo</th></tr></thead>' +
                '<tbody>' + righe + '</tbody></table></div>' +
                '<div class="text-xs text-muted" style="padding:8px 12px;">Clicca un dipendente per vedere il dettaglio giornaliero. ⚠️ = timbrate incomplete da correggere.</div>' +
              '</div>'
            : '<div class="empty-state"><p class="empty-state-text">Nessuna timbratura nel periodo selezionato.</p></div>';

        content.innerHTML = chiCeHtml + tabella;

        content.querySelectorAll('.timb-row').forEach(function(row) {
            row.addEventListener('click', function() {
                var dett = content.querySelector('.timb-dett[data-dett="' + row.getAttribute('data-pid') + '"]');
                if (dett) dett.style.display = dett.style.display === 'none' ? '' : 'none';
            });
        });
    }

    function _fmtData(iso) {
        try { return new Date(iso + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' }); }
        catch (e) { return iso; }
    }

    function _fmtDataBreve(iso) {
        var p = String(iso || '').split('-');
        return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : iso;
    }

    // --- Export PDF ---
    function _esportaPdf() {
        if (!(window.jspdf && window.jspdf.jsPDF)) { ENI.UI.error('Libreria PDF non disponibile'); return; }
        if (!_timbrature.length) { ENI.UI.warning('Nessuna timbratura nel periodo da esportare'); return; }

        var doc = new window.jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        var pw = doc.internal.pageSize.getWidth();
        var ph = doc.internal.pageSize.getHeight();
        var m = 14, y = m;

        doc.setFontSize(16); doc.setFont(undefined, 'bold');
        doc.text('Timbrature — Titanwash', m, y); y += 7;
        doc.setFontSize(10); doc.setFont(undefined, 'normal'); doc.setTextColor(90);
        doc.text('Periodo: ' + _fmtDataBreve(_da) + '  –  ' + _fmtDataBreve(_a), m, y);
        doc.text('Generato il ' + _fmtDataBreve(_oggi()), pw - m, y, { align: 'right' });
        doc.setTextColor(0); y += 8;

        var perPersona = {};
        _timbrature.forEach(function(t) {
            var nome = (t.personale && t.personale.nome_completo) || '—';
            (perPersona[t.personale_id] = perPersona[t.personale_id] || { nome: nome, eventi: [] }).eventi.push(t);
        });

        Object.keys(perPersona).sort(function(a, b) { return perPersona[a].nome.localeCompare(perPersona[b].nome); }).forEach(function(pid) {
            var p = perPersona[pid];
            var perGiorno = {};
            p.eventi.forEach(function(e) { (perGiorno[e.data] = perGiorno[e.data] || []).push(e); });
            var totMin = 0;
            var giorni = Object.keys(perGiorno).sort().map(function(g) {
                var sess = _sessioni(perGiorno[g]);
                var min = _minuti(sess);
                totMin += min;
                var incompleta = sess.some(function(s) { return !s.inizio || !s.fine; });
                var righe = sess.map(function(s) { return (s.inizio ? _oraDi(s.inizio) : '??') + '–' + (s.fine ? _oraDi(s.fine) : '??'); }).join(', ');
                return { label: _fmtDataBreve(g), righe: righe, min: min, incompleta: incompleta };
            });

            if (y > ph - 24) { doc.addPage(); y = m; }
            doc.setFont(undefined, 'bold'); doc.setFontSize(12);
            doc.text(p.nome, m, y);
            doc.text('Totale: ' + _fmtOre(totMin), pw - m, y, { align: 'right' });
            y += 3; doc.setDrawColor(210); doc.line(m, y, pw - m, y); y += 5;

            doc.setFont(undefined, 'normal'); doc.setFontSize(9);
            giorni.forEach(function(g) {
                if (y > ph - 14) { doc.addPage(); y = m; }
                doc.text(g.label, m + 2, y);
                doc.text(g.righe + (g.incompleta ? '  (incompleta)' : ''), m + 32, y);
                doc.text(_fmtOre(g.min), pw - m, y, { align: 'right' });
                y += 5;
            });
            y += 5;
        });

        doc.save('timbrature_' + _da + '_' + _a + '.pdf');
    }

    // --- Export Excel ---
    function _esportaExcel() {
        if (!window.XLSX) { ENI.UI.error('Libreria Excel non disponibile'); return; }
        if (!_timbrature.length) { ENI.UI.warning('Nessuna timbratura nel periodo da esportare'); return; }

        var perPersona = {};
        _timbrature.forEach(function(t) {
            var nome = (t.personale && t.personale.nome_completo) || '—';
            (perPersona[t.personale_id] = perPersona[t.personale_id] || { nome: nome, eventi: [] }).eventi.push(t);
        });

        var dett = [['Dipendente', 'Data', 'Entrata', 'Uscita', 'Ore (decimali)', 'Stato']];
        var riep = [['Dipendente', 'Totale ore (decimali)', 'Totale ore']];

        Object.keys(perPersona).sort(function(a, b) { return perPersona[a].nome.localeCompare(perPersona[b].nome); }).forEach(function(pid) {
            var p = perPersona[pid];
            var perGiorno = {};
            p.eventi.forEach(function(e) { (perGiorno[e.data] = perGiorno[e.data] || []).push(e); });
            var totMin = 0;
            Object.keys(perGiorno).sort().forEach(function(g) {
                var sess = _sessioni(perGiorno[g]);
                sess.forEach(function(s) {
                    var completa = !!(s.inizio && s.fine);
                    var min = completa ? (new Date(s.fine) - new Date(s.inizio)) / 60000 : 0;
                    totMin += min;
                    dett.push([
                        p.nome,
                        _fmtDataBreve(g),
                        s.inizio ? _oraDi(s.inizio) : '',
                        s.fine ? _oraDi(s.fine) : '',
                        completa ? Math.round(min / 60 * 100) / 100 : '',
                        completa ? 'completa' : 'INCOMPLETA'
                    ]);
                });
            });
            riep.push([p.nome, Math.round(totMin / 60 * 100) / 100, _fmtOre(totMin)]);
        });

        var wb = window.XLSX.utils.book_new();
        window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.aoa_to_sheet(riep), 'Riepilogo');
        window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.aoa_to_sheet(dett), 'Dettaglio');
        window.XLSX.writeFile(wb, 'timbrature_' + _da + '_' + _a + '.xlsx');
    }

    // --- QR da stampare ---
    function _urlTimbra() {
        return location.href.split('#')[0] + '#/timbra';
    }

    function _loadQrLib() {
        return new Promise(function(resolve, reject) {
            if (window.qrcode) return resolve();
            var s = document.createElement('script');
            s.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js';
            s.onload = function() { resolve(); };
            s.onerror = function() { reject(new Error('Impossibile caricare la libreria QR')); };
            document.head.appendChild(s);
        });
    }

    async function _mostraQr() {
        var modal = ENI.UI.showModal({
            title: '\u{1F4F1} QR Timbratura',
            body: '<div id="timb-qr-box" style="text-align:center; padding:10px;"><div class="spinner"></div></div>',
            footer: '<button class="btn btn-outline" data-modal-close>Chiudi</button>' +
                    '<button class="btn btn-primary" id="timb-qr-stampa">\u{1F5A8}️ Stampa</button>'
        });
        var box = modal.querySelector('#timb-qr-box');
        try { await _loadQrLib(); } catch (e) { box.innerHTML = '<p class="text-danger">' + ENI.UI.escapeHtml(e.message) + '</p>'; return; }

        var token;
        try { token = await _ensureToken(); }
        catch (e) { box.innerHTML = '<p class="text-danger">Errore nel preparare il codice: ' + ENI.UI.escapeHtml(e.message) + '</p>'; return; }

        var qr = window.qrcode(0, 'M');
        qr.addData(token);
        qr.make();
        var imgTag = qr.createImgTag(6, 8);
        box.innerHTML =
            imgTag +
            '<div style="font-weight:700; margin-top:6px;">Timbratura Titanwash</div>' +
            '<div class="text-sm text-muted">Affiggi in stazione. I dipendenti lo inquadrano dall\'app (Timbratura → Timbra) per confermare entrata/uscita.</div>';

        modal.querySelector('#timb-qr-stampa').addEventListener('click', function() { _stampaQr(imgTag); });
    }

    // Codice segreto legato al QR: generato e salvato la prima volta (solo Super Admin).
    // Il QR contiene questo codice; la pagina timbra lo confronta dopo la scansione.
    async function _ensureToken() {
        var tok = await ENI.API.getImpostazioneApp('timbra_qr_token');
        if (!tok) {
            tok = _generaToken();
            await ENI.API.salvaImpostazioneApp('timbra_qr_token', tok);
        }
        return tok;
    }

    function _generaToken() {
        var cr = window.crypto || window.msCrypto;
        var arr = new Uint8Array(16);
        cr.getRandomValues(arr);
        var s = '';
        for (var i = 0; i < arr.length; i++) s += ('0' + arr[i].toString(16)).slice(-2);
        return 'TW-TIMBRA-' + s;
    }

    function _stampaQr(imgTag) {
        var w = window.open('', '_blank');
        if (!w) { ENI.UI.warning('Consenti i popup per stampare il QR'); return; }
        w.document.write(
            '<html><head><title>QR Timbratura Titanwash</title></head>' +
            '<body style="text-align:center; font-family:sans-serif; padding:40px;">' +
                '<h1 style="margin-bottom:4px;">Timbratura Titanwash</h1>' +
                '<p style="color:#555; margin-top:0;">Apri l\'app &rarr; Timbratura &rarr; Timbra e inquadra questo QR</p>' +
                '<div style="margin:24px 0;">' + imgTag + '</div>' +
            '</body></html>'
        );
        w.document.close();
        setTimeout(function() { w.focus(); w.print(); }, 300);
    }

    // --- Timbratura manuale (super admin) ---
    async function _salvaManuale(container) {
        var pid = container.querySelector('#man-dip').value;
        var tsLocal = container.querySelector('#man-ts').value;
        var tipo = container.querySelector('#man-tipo').value;
        if (!pid) { ENI.UI.warning('Scegli un dipendente'); return; }
        if (!tsLocal) { ENI.UI.warning('Scegli data e ora'); return; }
        var iso;
        try { iso = new Date(tsLocal).toISOString(); }
        catch (e) { ENI.UI.warning('Data/ora non valida'); return; }
        try {
            await ENI.API.salvaTimbratura({ personale_id: pid, tipo: tipo, ts: iso, data: tsLocal.slice(0, 10), origine: 'manuale' });
            ENI.UI.success('Timbratura manuale registrata');
            _load(container);
        } catch (e) {
            ENI.UI.error('Errore: ' + e.message);
        }
    }

    function _nowLocalInput() {
        var d = new Date();
        function p(n) { return (n < 10 ? '0' : '') + n; }
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
    }

    return { render: render };
})();
