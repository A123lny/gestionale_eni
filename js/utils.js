// ============================================================
// GESTIONALE ENI - Utility Condivise
// Funzioni riusabili tra i moduli: ricerca clienti, validazioni
// ============================================================

var ENI = ENI || {};

ENI.Utils = (function() {
    'use strict';

    // ============================================================
    // AUTOCOMPLETE RICERCA CLIENTI
    // Usato in: buoni.js, e disponibile per nuovi moduli
    //
    // options:
    //   onSelect(cliente)  - callback quando si seleziona un cliente
    //   clearOnSelect      - svuota l'input dopo selezione (default: true)
    //   minChars           - caratteri minimi prima di cercare (default: config)
    //   debounceMs         - ritardo input (default: config)
    // ============================================================

    function setupClienteSearch(inputEl, resultsEl, options) {
        if (!inputEl || !resultsEl) return;

        options = options || {};
        var onSelect = options.onSelect || function() {};
        var clearOnSelect = options.clearOnSelect !== false;
        var minChars = options.minChars || ENI.Config.CONSTANTS.SEARCH_MIN_CHARS;
        var debounceMs = options.debounceMs || ENI.Config.CONSTANTS.SEARCH_DEBOUNCE_MS;

        var debounce = null;

        inputEl.addEventListener('input', function() {
            clearTimeout(debounce);
            var term = inputEl.value.trim();
            if (term.length < minChars) {
                resultsEl.style.display = 'none';
                resultsEl.innerHTML = '';
                return;
            }

            debounce = setTimeout(async function() {
                try {
                    var clienti = await ENI.API.cercaClienti(term);

                    if (clienti.length === 0) {
                        resultsEl.innerHTML =
                            '<div class="pos-search-item">' +
                                '<span class="text-muted">Nessun cliente trovato</span>' +
                            '</div>';
                    } else {
                        resultsEl.innerHTML = clienti.map(function(c) {
                            return '<div class="pos-search-item pos-search-cliente" data-sel-id="' + c.id + '">' +
                                '<div>' +
                                    '<span class="pos-search-item-name">' + ENI.UI.escapeHtml(c.nome_ragione_sociale) + '</span>' +
                                    (c.targa ? '<br><span class="pos-search-item-code">' + ENI.UI.escapeHtml(c.targa) + '</span>' : '') +
                                    (c.p_iva_coe ? '<br><span class="pos-search-item-code">P.IVA: ' + ENI.UI.escapeHtml(c.p_iva_coe) + '</span>' : '') +
                                '</div>' +
                                '<span class="text-xs text-muted">' + ENI.UI.escapeHtml(c.tipo) + '</span>' +
                            '</div>';
                        }).join('');
                    }

                    resultsEl.style.display = 'block';

                    resultsEl.querySelectorAll('[data-sel-id]').forEach(function(item) {
                        item.addEventListener('click', function() {
                            var cId = item.dataset.selId;
                            var found = clienti.find(function(c) { return c.id === cId; });
                            if (found) {
                                onSelect(found);
                                if (clearOnSelect) inputEl.value = '';
                                resultsEl.style.display = 'none';
                            }
                        });
                    });
                } catch(e) {
                    resultsEl.innerHTML =
                        '<div class="pos-search-item text-danger">Errore ricerca clienti</div>';
                    resultsEl.style.display = 'block';
                }
            }, debounceMs);
        });

        // Chiudi dropdown cliccando fuori
        document.addEventListener('click', function(e) {
            if (!e.target.closest('#' + inputEl.id) && !e.target.closest('#' + resultsEl.id)) {
                resultsEl.style.display = 'none';
            }
        });
    }

    // ============================================================
    // VALIDAZIONI
    // ============================================================

    function validaPrezzo(val) {
        var n = parseFloat(val);
        if (isNaN(n)) return false;
        return n >= ENI.Config.CONSTANTS.PREZZO_MIN && n <= ENI.Config.CONSTANTS.PREZZO_MAX;
    }

    function validaQuantita(val) {
        var n = parseInt(val, 10);
        if (isNaN(n)) return false;
        return n >= ENI.Config.CONSTANTS.QUANTITA_MIN && n <= ENI.Config.CONSTANTS.QUANTITA_MAX;
    }

    function validaPercentuale(val) {
        var n = parseFloat(val);
        if (isNaN(n)) return false;
        return n >= 0 && n <= 100;
    }

    // ============================================================
    // API PUBBLICA
    // ============================================================

    return {
        setupClienteSearch: setupClienteSearch,
        validaPrezzo: validaPrezzo,
        validaQuantita: validaQuantita,
        validaPercentuale: validaPercentuale
    };

})();
