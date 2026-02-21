// ============================================================
// GESTIONALE ENI - Modulo Import CSV Magazzino
// Parser CSV, preview, bulk insert in Supabase
// ============================================================

var ENI = ENI || {};
ENI.Modules = ENI.Modules || {};

ENI.Modules.MagazzinoImport = (function() {
    'use strict';

    var _onComplete = null;

    // --- CSV Parser (gestisce campi quotati con virgole) ---

    function _parseCSV(text) {
        var rows = [];
        var row = [];
        var field = '';
        var inQuotes = false;
        var i = 0;

        while (i < text.length) {
            var ch = text[i];

            if (inQuotes) {
                if (ch === '"') {
                    if (i + 1 < text.length && text[i + 1] === '"') {
                        field += '"';
                        i += 2;
                    } else {
                        inQuotes = false;
                        i++;
                    }
                } else {
                    field += ch;
                    i++;
                }
            } else {
                if (ch === '"') {
                    inQuotes = true;
                    i++;
                } else if (ch === ',') {
                    row.push(field.trim());
                    field = '';
                    i++;
                } else if (ch === '\n' || ch === '\r') {
                    row.push(field.trim());
                    if (row.length > 1 || (row.length === 1 && row[0] !== '')) {
                        rows.push(row);
                    }
                    row = [];
                    field = '';
                    if (ch === '\r' && i + 1 < text.length && text[i + 1] === '\n') {
                        i += 2;
                    } else {
                        i++;
                    }
                } else {
                    field += ch;
                    i++;
                }
            }
        }

        // Ultima riga
        row.push(field.trim());
        if (row.length > 1 || (row.length === 1 && row[0] !== '')) {
            rows.push(row);
        }

        return rows;
    }

    // --- Mappa categoria CSV -> categoria DB ---

    function _mapCategoria(csvCat) {
        if (!csvCat) return 'Altro';
        var cat = csvCat.trim();

        var mapping = {
            'Accessori': 'Accessori',
            'Tergicristalli': 'Tergicristalli',
            'Catene': 'Catene',
            'Profumatori': 'Profumatori',
            'Uso interno': 'Uso interno',
            'Oli e lubrificanti': 'Oli e lubrificanti',
            'Bar': 'Bar',
            'Detailing': 'Detailing',
            'AdBlue': 'AdBlue',
            'ADBLU SFUSO': 'AdBlue',
            'Altro': 'Altro'
        };

        return mapping[cat] || 'Altro';
    }

    // --- Pulisci HTML da descrizione ---

    function _stripHtml(html) {
        if (!html) return '';
        return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
    }

    // --- Trova indice colonna per nome header ---

    function _colIndex(headers, name) {
        for (var i = 0; i < headers.length; i++) {
            if (headers[i].toLowerCase().indexOf(name.toLowerCase()) !== -1) return i;
        }
        return -1;
    }

    // --- Processa dati CSV in prodotti ---

    function _processCSV(rows) {
        if (rows.length < 2) return { prodotti: [], esclusi: 0, errori: [] };

        var headers = rows[0];

        // Trova indici colonne
        var iSKU = _colIndex(headers, 'SKU');
        var iName = _colIndex(headers, 'Name');
        var iCategory = _colIndex(headers, 'Category');
        var iCost = _colIndex(headers, 'Cost');
        var iBarcode = _colIndex(headers, 'Barcode');
        var iPrice = _colIndex(headers, 'Price');
        var iInStock = _colIndex(headers, 'In stock');
        var iLowStock = _colIndex(headers, 'Low stock');
        var iTrackStock = _colIndex(headers, 'Track stock');
        var iAvailable = _colIndex(headers, 'Available for sale');

        var prodotti = [];
        var esclusi = 0;
        var errori = [];
        var codiciVisti = {};

        for (var i = 1; i < rows.length; i++) {
            var r = rows[i];
            var nome = r[iName] || '';
            var categoria = r[iCategory] || '';
            var sku = r[iSKU] || '';

            // Escludi righe senza nome (varianti sub-righe)
            if (!nome.trim()) {
                esclusi++;
                continue;
            }

            // Escludi Lavaggi e BUONI
            var catLower = categoria.toLowerCase();
            if (catLower === 'lavaggi' || catLower === 'buoni') {
                esclusi++;
                continue;
            }

            // Escludi duplicati per SKU
            if (codiciVisti[sku]) {
                esclusi++;
                continue;
            }
            codiciVisti[sku] = true;

            // Parse prezzo
            var prezzoStr = (r[iPrice] || '0').trim();
            var prezzo = 0;
            var prezzoVariabile = false;
            if (prezzoStr === 'variable' || prezzoStr === '') {
                prezzo = 0;
                prezzoVariabile = true;
            } else {
                prezzo = parseFloat(prezzoStr);
                if (isNaN(prezzo)) prezzo = 0;
            }

            // Parse giacenza
            var giacenza = parseInt(r[iInStock] || '0', 10);
            if (isNaN(giacenza) || giacenza < 0) giacenza = 0;

            // Parse giacenza minima
            var giacenzaMin = parseInt(r[iLowStock] || '3', 10);
            if (isNaN(giacenzaMin) || giacenzaMin < 0) giacenzaMin = 3;

            // Parse costo
            var costo = parseFloat(r[iCost] || '0');
            if (isNaN(costo)) costo = 0;

            // Barcode
            var barcode = (r[iBarcode] || '').trim();
            if (!barcode) barcode = null;

            var prodotto = {
                codice: sku,
                nome_prodotto: nome.trim(),
                barcode: barcode,
                categoria: _mapCategoria(categoria),
                prezzo_acquisto: costo > 0 ? costo : null,
                prezzo_vendita: prezzo,
                giacenza: giacenza,
                giacenza_minima: giacenzaMin,
                _prezzoVariabile: prezzoVariabile
            };

            prodotti.push(prodotto);
        }

        return { prodotti: prodotti, esclusi: esclusi, errori: errori };
    }

    // --- Mostra modal import ---

    function show(onComplete) {
        _onComplete = onComplete;

        var body =
            '<div id="import-step-1">' +
                '<p class="text-sm text-muted" style="margin-bottom: var(--space-3);">Seleziona il file CSV esportato (formato Square/Loyverse/generico). I prodotti delle categorie "Lavaggi" e "BUONI" verranno esclusi automaticamente.</p>' +
                '<div class="form-group">' +
                    '<label class="form-label form-label-required">File CSV</label>' +
                    '<input type="file" class="form-input" id="import-file" accept=".csv">' +
                '</div>' +
            '</div>' +
            '<div id="import-step-2" style="display: none;"></div>' +
            '<div id="import-step-3" style="display: none;"></div>';

        var modal = ENI.UI.showModal({
            title: '\u{1F4C2} Importa Prodotti da CSV',
            body: body,
            size: 'large',
            footer:
                '<button class="btn btn-outline" data-modal-close>Annulla</button>' +
                '<button class="btn btn-primary" id="btn-import-parse" disabled>Analizza CSV</button>'
        });

        var fileInput = modal.querySelector('#import-file');
        var btnParse = modal.querySelector('#btn-import-parse');

        fileInput.addEventListener('change', function() {
            btnParse.disabled = !fileInput.files.length;
        });

        btnParse.addEventListener('click', function() {
            _parseFile(modal, fileInput.files[0]);
        });
    }

    // --- Parse file e mostra preview ---

    function _parseFile(modal, file) {
        var reader = new FileReader();

        reader.onload = function(e) {
            var text = e.target.result;
            var rows = _parseCSV(text);
            var result = _processCSV(rows);

            if (result.prodotti.length === 0) {
                ENI.UI.warning('Nessun prodotto valido trovato nel CSV');
                return;
            }

            _showPreview(modal, result);
        };

        reader.onerror = function() {
            ENI.UI.error('Errore lettura file');
        };

        reader.readAsText(file, 'UTF-8');
    }

    // --- Mostra preview prodotti ---

    function _showPreview(modal, result) {
        var prodotti = result.prodotti;

        // Conteggio per categoria
        var perCategoria = {};
        var conBarcode = 0;
        var prezzoVariabile = 0;

        prodotti.forEach(function(p) {
            perCategoria[p.categoria] = (perCategoria[p.categoria] || 0) + 1;
            if (p.barcode) conBarcode++;
            if (p._prezzoVariabile) prezzoVariabile++;
        });

        var step1 = modal.querySelector('#import-step-1');
        var step2 = modal.querySelector('#import-step-2');

        step1.style.display = 'none';
        step2.style.display = 'block';

        // Riepilogo
        var html =
            '<div class="import-summary" style="margin-bottom: var(--space-4);">' +
                '<div class="stats-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: var(--space-3);">' +
                    '<div class="stat-card" style="padding: var(--space-3); background: var(--bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-gray-200);">' +
                        '<div class="text-2xl font-bold" style="color: var(--color-primary);">' + prodotti.length + '</div>' +
                        '<div class="text-sm text-muted">Prodotti da importare</div>' +
                    '</div>' +
                    '<div class="stat-card" style="padding: var(--space-3); background: var(--bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-gray-200);">' +
                        '<div class="text-2xl font-bold">' + conBarcode + '</div>' +
                        '<div class="text-sm text-muted">Con barcode</div>' +
                    '</div>' +
                    '<div class="stat-card" style="padding: var(--space-3); background: var(--bg-card); border-radius: var(--radius-md); border: 1px solid var(--color-gray-200);">' +
                        '<div class="text-2xl font-bold">' + result.esclusi + '</div>' +
                        '<div class="text-sm text-muted">Righe escluse</div>' +
                    '</div>' +
                    (prezzoVariabile > 0
                        ? '<div class="stat-card" style="padding: var(--space-3); background: var(--color-warning-bg); border-radius: var(--radius-md); border: 1px solid var(--color-warning);">' +
                            '<div class="text-2xl font-bold" style="color: var(--color-warning);">' + prezzoVariabile + '</div>' +
                            '<div class="text-sm">Prezzo variabile (da correggere)</div>' +
                          '</div>'
                        : '') +
                '</div>' +
            '</div>';

        // Categorie
        html += '<div style="margin-bottom: var(--space-4);"><strong>Per categoria:</strong><div style="margin-top: var(--space-2);">';
        Object.keys(perCategoria).sort().forEach(function(cat) {
            html += '<span class="badge" style="margin-right: var(--space-2); margin-bottom: var(--space-1);">' + ENI.UI.escapeHtml(cat) + ': ' + perCategoria[cat] + '</span>';
        });
        html += '</div></div>';

        // Anteprima tabella (primi 15)
        html += '<div style="max-height: 300px; overflow-y: auto;">' +
            '<table class="table"><thead><tr>' +
                '<th>Codice</th><th>Nome</th><th>Categoria</th><th>Barcode</th><th>Prezzo</th><th>Giacenza</th>' +
            '</tr></thead><tbody>';

        var preview = prodotti.slice(0, 15);
        preview.forEach(function(p) {
            html += '<tr>' +
                '<td class="text-sm">' + ENI.UI.escapeHtml(p.codice) + '</td>' +
                '<td>' + ENI.UI.escapeHtml(p.nome_prodotto) + '</td>' +
                '<td class="text-sm">' + ENI.UI.escapeHtml(p.categoria) + '</td>' +
                '<td class="text-sm text-muted">' + (p.barcode || '-') + '</td>' +
                '<td>' + (p._prezzoVariabile ? '<span style="color: var(--color-warning);">variabile</span>' : ENI.UI.formatValuta(p.prezzo_vendita)) + '</td>' +
                '<td>' + p.giacenza + '</td>' +
            '</tr>';
        });

        if (prodotti.length > 15) {
            html += '<tr><td colspan="6" class="text-center text-muted">... e altri ' + (prodotti.length - 15) + ' prodotti</td></tr>';
        }

        html += '</tbody></table></div>';

        step2.innerHTML = html;

        // Aggiorna footer
        var footer = modal.querySelector('.modal-footer');
        footer.innerHTML =
            '<button class="btn btn-outline" data-modal-close>Annulla</button>' +
            '<button class="btn btn-primary" id="btn-import-confirm">\u{1F4E5} Importa ' + prodotti.length + ' prodotti</button>';

        footer.querySelector('#btn-import-confirm').addEventListener('click', function() {
            _executeImport(modal, prodotti);
        });
    }

    // --- Esegui import in batch ---

    async function _executeImport(modal, prodotti) {
        var step2 = modal.querySelector('#import-step-2');
        var step3 = modal.querySelector('#import-step-3');

        step2.style.display = 'none';
        step3.style.display = 'block';

        // Disabilita bottoni
        var footer = modal.querySelector('.modal-footer');
        footer.innerHTML = '<button class="btn btn-outline" disabled>Importazione in corso...</button>';

        var BATCH_SIZE = 50;
        var totale = prodotti.length;
        var importati = 0;
        var errori = 0;
        var erroriDettaglio = [];

        // Rimuovi flag interno _prezzoVariabile
        var dati = prodotti.map(function(p) {
            var clone = {};
            for (var k in p) {
                if (k.charAt(0) !== '_') clone[k] = p[k];
            }
            return clone;
        });

        // Progress bar
        step3.innerHTML =
            '<div style="text-align: center; padding: var(--space-4);">' +
                '<div class="text-lg font-bold" id="import-progress-text">Importazione in corso... 0/' + totale + '</div>' +
                '<div style="background: var(--color-gray-200); border-radius: var(--radius-md); height: 8px; margin-top: var(--space-3); overflow: hidden;">' +
                    '<div id="import-progress-bar" style="background: var(--color-primary); height: 100%; width: 0%; transition: width 0.3s;"></div>' +
                '</div>' +
                '<div id="import-errors" style="margin-top: var(--space-3);"></div>' +
            '</div>';

        for (var i = 0; i < dati.length; i += BATCH_SIZE) {
            var batch = dati.slice(i, i + BATCH_SIZE);

            try {
                await ENI.API.insertBulk('magazzino', batch);
                importati += batch.length;
            } catch(e) {
                // Prova uno per uno se il batch fallisce
                for (var j = 0; j < batch.length; j++) {
                    try {
                        await ENI.API.insert('magazzino', batch[j]);
                        importati++;
                    } catch(e2) {
                        errori++;
                        erroriDettaglio.push(batch[j].nome_prodotto + ': ' + e2.message);
                    }
                }
            }

            // Aggiorna progress
            var pct = Math.round(((importati + errori) / totale) * 100);
            var progressBar = document.getElementById('import-progress-bar');
            var progressText = document.getElementById('import-progress-text');
            if (progressBar) progressBar.style.width = pct + '%';
            if (progressText) progressText.textContent = 'Importazione in corso... ' + (importati + errori) + '/' + totale;
        }

        // Risultato finale
        step3.innerHTML =
            '<div style="text-align: center; padding: var(--space-4);">' +
                '<div style="font-size: 48px; margin-bottom: var(--space-3);">' + (errori === 0 ? '\u2705' : '\u26A0\uFE0F') + '</div>' +
                '<div class="text-lg font-bold">' + importati + ' prodotti importati' + (errori > 0 ? ', ' + errori + ' errori' : '') + '</div>' +
                (erroriDettaglio.length > 0
                    ? '<div style="margin-top: var(--space-3); text-align: left; max-height: 200px; overflow-y: auto; background: var(--color-warning-bg); padding: var(--space-3); border-radius: var(--radius-md);">' +
                        '<strong>Errori:</strong><br>' +
                        erroriDettaglio.map(function(e) { return '<div class="text-sm">' + ENI.UI.escapeHtml(e) + '</div>'; }).join('') +
                      '</div>'
                    : '') +
            '</div>';

        footer.innerHTML = '<button class="btn btn-primary" data-modal-close>Chiudi</button>';

        // Log
        await ENI.API.scriviLog('Import_CSV', 'Magazzino', importati + ' prodotti importati, ' + errori + ' errori');

        // Callback per ricaricare magazzino
        if (_onComplete) _onComplete();
    }

    return { show: show };
})();
