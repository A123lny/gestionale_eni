// ============================================================
// GESTIONALE ENI - Buste Paga (cedolini PDF)
// Admin (BustePaga): carica/gestisce i cedolini di tutti.
// Dipendente (BustePagaMie): consulta e scarica SOLO i propri.
// I file stanno su Supabase Storage (bucket privato 'buste-paga'),
// la privacy è garantita da RLS su tabella e storage.
// ============================================================

var ENI = ENI || {};
ENI.Modules = ENI.Modules || {};

(function() {
    'use strict';

    var MESI = ['', 'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
                'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];

    function _periodoLabel(b) {
        var p = (MESI[b.mese] || b.mese) + ' ' + b.anno;
        if (b.descrizione) p += ' · ' + ENI.UI.escapeHtml(b.descrizione);
        return p;
    }

    async function _apri(filePath) {
        try {
            var url = await ENI.API.getUrlBustaPaga(filePath);
            window.open(url, '_blank');
        } catch (e) { ENI.UI.error('Errore apertura: ' + e.message); }
    }

    // ============================================================
    // VISTA ADMIN
    // ============================================================
    var _personale = [];

    async function _renderAdmin(container) {
        container.innerHTML = '<div class="flex justify-center" style="padding:2rem;"><div class="spinner"></div></div>';
        try { _personale = await ENI.API.getPersonale(); } catch (e) { _personale = []; }
        var opts = _personale.filter(function(p) { return p.attivo !== false; })
            .map(function(p) { return '<option value="' + p.id + '">' + ENI.UI.escapeHtml(p.nome_completo) + '</option>'; }).join('');
        var mesiOpts = '';
        for (var m = 1; m <= 12; m++) mesiOpts += '<option value="' + m + '">' + MESI[m] + '</option>';
        var now = new Date();

        container.innerHTML =
            '<div class="page-header"><h1 class="page-title">📄 Buste Paga</h1></div>' +
            '<div class="card" style="margin-bottom:var(--space-4);">' +
                '<div class="card-header"><h3>Carica cedolino</h3></div>' +
                '<div class="card-body">' +
                    '<div style="display:flex; flex-wrap:wrap; gap:12px; align-items:flex-end;">' +
                        '<div><label class="form-label">Dipendente</label><select class="form-input" id="bp-dip"><option value="">— scegli —</option>' + opts + '</select></div>' +
                        '<div><label class="form-label">Mese</label><select class="form-input" id="bp-mese">' + mesiOpts + '</select></div>' +
                        '<div><label class="form-label">Anno</label><input type="number" class="form-input" id="bp-anno" value="' + now.getFullYear() + '" style="max-width:110px;"></div>' +
                        '<div style="flex:1; min-width:160px;"><label class="form-label">Descrizione (opz.)</label><input type="text" class="form-input" id="bp-descr" placeholder="es. Tredicesima"></div>' +
                    '</div>' +
                    '<div style="margin-top:12px;"><label class="form-label">File PDF</label>' +
                        '<input type="file" accept="application/pdf,.pdf" class="form-input" id="bp-file"></div>' +
                    '<div style="margin-top:12px;"><button class="btn btn-primary" id="bp-carica">📤 Carica cedolino</button></div>' +
                '</div>' +
            '</div>' +
            '<div class="card">' +
                '<div class="card-header"><h3>Cedolini caricati</h3></div>' +
                '<div class="card-body"><div id="bp-lista"><div class="flex justify-center" style="padding:1rem;"><div class="spinner"></div></div></div></div>' +
            '</div>';

        // Il cedolino arriva il mese dopo: si propone il mese precedente.
        var prec = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        document.getElementById('bp-mese').value = prec.getMonth() + 1;
        document.getElementById('bp-anno').value = prec.getFullYear();
        document.getElementById('bp-carica').addEventListener('click', _carica);
        _caricaLista();
    }

    // Un dipendente per riga; cliccando il nome si apre il suo storico.
    // Di ogni cedolino si mostrano anche il nome del file e la data di
    // caricamento: il 10/11 era stato ricaricato due volte lo stesso PDF di
    // settembre sotto Ottobre e Novembre, e dall'elenco non si capiva.
    var _lista = [];
    var _aperti = {};

    async function _caricaLista() {
        var el = document.getElementById('bp-lista');
        if (!el) return;
        try { _lista = await ENI.API.getBustePaga({}); }
        catch (e) { el.innerHTML = '<p class="text-danger">Errore: ' + ENI.UI.escapeHtml(e.message) + '</p>'; return; }
        _disegnaLista();
    }

    function _disegnaLista() {
        var el = document.getElementById('bp-lista');
        if (!el) return;
        if (!_lista.length) { el.innerHTML = '<div class="empty-state"><p class="empty-state-text">Nessun cedolino caricato.</p></div>'; return; }

        var gruppi = {}, ordine = [];
        _lista.forEach(function(b) {
            if (!gruppi[b.personale_id]) {
                gruppi[b.personale_id] = { nome: (b.personale && b.personale.nome_completo) || '—', voci: [] };
                ordine.push(b.personale_id);
            }
            gruppi[b.personale_id].voci.push(b);   // gia' in ordine anno/mese decrescente
        });
        ordine.sort(function(a, b) { return gruppi[a].nome.localeCompare(gruppi[b].nome); });

        el.innerHTML = ordine.map(function(pid) {
            var g = gruppi[pid], aperto = !!_aperti[pid];
            var storico = !aperto ? '' :
                '<div style="padding:4px 0 8px 14px;">' + g.voci.map(function(b) {
                    var dett = [];
                    if (b.file_nome) dett.push('file: ' + ENI.UI.escapeHtml(b.file_nome));
                    if (b.created_at) dett.push('caricato il ' + new Date(b.created_at).toLocaleDateString('it-IT'));
                    return '<div style="display:flex; justify-content:space-between; align-items:center; gap:10px; padding:8px 0; border-top:1px dashed var(--border-color); flex-wrap:wrap;">' +
                        '<div><div style="font-weight:600;">' + _periodoLabel(b) + '</div>' +
                            '<div class="text-sm text-muted">' + dett.join(' · ') + '</div></div>' +
                        '<div style="white-space:nowrap;">' +
                            '<button class="btn btn-outline btn-sm" data-apri="' + b.file_path + '">Apri</button> ' +
                            '<button class="btn btn-ghost btn-sm" data-del="' + b.id + '" data-path="' + b.file_path + '" style="color:var(--color-danger);">Elimina</button>' +
                        '</div></div>';
                }).join('') + '</div>';
            return '<div style="border-bottom:1px solid var(--border-color);">' +
                '<div data-dip="' + pid + '" style="display:flex; justify-content:space-between; align-items:center; gap:10px; padding:12px 0; cursor:pointer;">' +
                    '<div><div style="font-weight:600;">' + (aperto ? '▾ ' : '▸ ') + ENI.UI.escapeHtml(g.nome) + '</div>' +
                        '<div class="text-sm text-muted">' + g.voci.length + (g.voci.length === 1 ? ' cedolino' : ' cedolini') +
                            ' · ultimo: ' + (MESI[g.voci[0].mese] || g.voci[0].mese) + ' ' + g.voci[0].anno + '</div></div>' +
                    '<span class="text-sm text-muted">' + (aperto ? 'Chiudi' : 'Storico') + '</span>' +
                '</div>' + storico + '</div>';
        }).join('');

        el.querySelectorAll('[data-dip]').forEach(function(row) {
            row.addEventListener('click', function() {
                var pid = row.getAttribute('data-dip');
                _aperti[pid] = !_aperti[pid];
                _disegnaLista();
            });
        });
        el.querySelectorAll('[data-apri]').forEach(function(btn) { btn.addEventListener('click', function() { _apri(btn.getAttribute('data-apri')); }); });
        el.querySelectorAll('[data-del]').forEach(function(btn) { btn.addEventListener('click', function() { _elimina(btn.getAttribute('data-del'), btn.getAttribute('data-path')); }); });
    }

    async function _carica() {
        var pid = document.getElementById('bp-dip').value;
        var mese = parseInt(document.getElementById('bp-mese').value, 10);
        var anno = parseInt(document.getElementById('bp-anno').value, 10);
        var descr = document.getElementById('bp-descr').value.trim();
        var fileInput = document.getElementById('bp-file');
        var file = fileInput.files && fileInput.files[0];
        if (!pid) { ENI.UI.warning('Scegli un dipendente'); return; }
        if (!anno || anno < 2000) { ENI.UI.warning('Anno non valido'); return; }
        if (!file) { ENI.UI.warning('Scegli il file PDF'); return; }
        if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) { ENI.UI.warning('Il file deve essere un PDF'); return; }
        var gia = _lista.filter(function(b) { return b.personale_id === pid && b.file_nome === file.name; })[0];
        if (gia) {
            var ok = await ENI.UI.confirm({
                title: 'File già caricato',
                message: '"' + file.name + '" è già in archivio per questo dipendente (' + (MESI[gia.mese] || gia.mese) + ' ' + gia.anno +
                    '). Forse hai scelto il PDF sbagliato. Caricarlo lo stesso?',
                confirmText: 'Carica lo stesso', cancelText: 'Annulla'
            });
            if (!ok) return;
        }
        var btn = document.getElementById('bp-carica');
        if (btn) btn.disabled = true;
        try {
            ENI.UI.showLoading();
            await ENI.API.caricaBustaPaga({ personale_id: pid, anno: anno, mese: mese, descrizione: descr || null, file_nome: file.name }, file);
            ENI.UI.hideLoading();
            ENI.UI.success('Cedolino caricato');
            fileInput.value = '';
            document.getElementById('bp-descr').value = '';
            _caricaLista();
        } catch (e) {
            ENI.UI.hideLoading();
            ENI.UI.error('Errore: ' + e.message);
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    async function _elimina(id, filePath) {
        var ok = await ENI.UI.confirm({ title: 'Elimina cedolino', message: 'Eliminare definitivamente questo cedolino?', confirmText: 'Elimina', cancelText: 'Annulla', danger: true });
        if (!ok) return;
        try {
            await ENI.API.eliminaBustaPaga(id, filePath);
            ENI.UI.success('Cedolino eliminato');
            _caricaLista();
        } catch (e) { ENI.UI.error('Errore: ' + e.message); }
    }

    ENI.Modules.BustePaga = { render: _renderAdmin };

    // ============================================================
    // VISTA DIPENDENTE (self-service) — solo i propri cedolini
    // ============================================================
    async function _renderMie(container) {
        container.innerHTML =
            '<div class="page-header"><h1 class="page-title">📄 Buste Paga</h1></div>' +
            '<div class="card"><div class="card-body"><div id="bpm-lista"><div class="flex justify-center" style="padding:1rem;"><div class="spinner"></div></div></div></div></div>';
        var el = document.getElementById('bpm-lista');
        var lista;
        try { lista = await ENI.API.getBustePaga({ personaleId: ENI.State.getUserId() }); }
        catch (e) { el.innerHTML = '<p class="text-danger">Errore: ' + ENI.UI.escapeHtml(e.message) + '</p>'; return; }
        if (!lista.length) {
            el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📄</div><p class="empty-state-text">Non hai ancora cedolini disponibili.</p></div>';
            return;
        }
        el.innerHTML = lista.map(function(b) {
            return '<div style="display:flex; justify-content:space-between; align-items:center; gap:10px; padding:12px 0; border-bottom:1px solid var(--border-color);">' +
                '<span style="font-weight:600;">' + _periodoLabel(b) + '</span>' +
                '<button class="btn btn-primary btn-sm" data-apri="' + b.file_path + '">⬇️ Scarica</button>' +
            '</div>';
        }).join('');
        el.querySelectorAll('[data-apri]').forEach(function(btn) { btn.addEventListener('click', function() { _apri(btn.getAttribute('data-apri')); }); });
    }

    ENI.Modules.BustePagaMie = { render: _renderMie };

})();
