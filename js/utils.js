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

    // Ricerca cliente con tendina. Usata dalla fattura manuale e dai buoni.
    //
    // Tre difetti corretti il 21/10/2026, segnalati come "lo devi cercare
    // svariate volte e ti appare l'errore":
    //
    //  - la tendina si apriva SOLO sull'evento 'input'. Se si chiudeva e si
    //    rientrava nel campo dove il nome era gia' scritto non ricompariva
    //    niente: bisognava cancellare una lettera e riscriverla. Ora si
    //    riapre al focus e al clic;
    //  - i gestori del clic venivano riattaccati a ogni ridisegno della
    //    tendina. Ora il clic e' delegato al contenitore, che non cambia;
    //  - due ricerche in volo: se la prima tornava dopo la seconda rimetteva
    //    in tendina i risultati vecchi. Ora ogni richiesta ha un numero e
    //    chi torna in ritardo viene scartato.
    function setupClienteSearch(inputEl, resultsEl, options) {
        if (!inputEl || !resultsEl) return;

        options = options || {};
        var onSelect = options.onSelect || function() {};
        var clearOnSelect = options.clearOnSelect !== false;
        var minChars = options.minChars || ENI.Config.CONSTANTS.SEARCH_MIN_CHARS;
        var debounceMs = options.debounceMs === undefined
            ? ENI.Config.CONSTANTS.SEARCH_DEBOUNCE_MS
            : options.debounceMs;

        var debounce = null;
        var seq = 0;        // numero della richiesta, per scartare i ritardatari
        var ultimi = [];    // i clienti attualmente in tendina

        function chiudi() { resultsEl.style.display = 'none'; }

        function scegli(c) {
            if (!c) return;
            onSelect(c);
            if (clearOnSelect) inputEl.value = '';
            chiudi();
        }

        function disegna(clienti) {
            if (!clienti.length) {
                resultsEl.innerHTML =
                    '<div class="pos-search-item">' +
                        '<span class="text-muted">Nessun cliente trovato</span>' +
                    '</div>';
            } else {
                resultsEl.innerHTML = clienti.map(function(c) {
                    // I click passano da [data-sel-id], delegati al contenitore.
                    return '<div class="pos-search-item" data-sel-id="' + c.id + '">' +
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
        }

        async function _eseguiRicerca() {
            var term = inputEl.value.trim();
            if (term.length < minChars) {
                ultimi = [];
                resultsEl.innerHTML = '';
                chiudi();
                return;
            }
            var mia = ++seq;
            try {
                var clienti = await ENI.API.cercaClienti(term);
                if (mia !== seq) return;   // ne e' partita un'altra dopo: questa non vale piu'
                ultimi = clienti;
                disegna(clienti);
            } catch (e) {
                if (mia !== seq) return;
                ultimi = [];
                resultsEl.innerHTML =
                    '<div class="pos-search-item text-danger">Errore ricerca clienti</div>';
                resultsEl.style.display = 'block';
            }
        }

        function programma(attesa) {
            clearTimeout(debounce);
            debounce = setTimeout(_eseguiRicerca,
                attesa === undefined ? debounceMs : attesa);
        }

        inputEl.addEventListener('input', function() { programma(); });

        // Rientrando nel campo la tendina si riapre subito, senza attesa:
        // e' questo che mancava.
        inputEl.addEventListener('focus', function() { programma(0); });
        inputEl.addEventListener('click', function() { programma(0); });

        inputEl.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                // Invio sceglie il primo risultato invece di far partire il
                // form: in fattura il pulsante di invio e' "Emetti fattura",
                // e premere Invio nel campo di ricerca la emetteva.
                e.preventDefault();
                if (ultimi.length) scegli(ultimi[0]);
            } else if (e.key === 'Escape') {
                chiudi();
            }
        });

        // Clic delegato: la tendina si ridisegna a ogni ricerca, il
        // contenitore no.
        resultsEl.addEventListener('click', function(e) {
            var item = e.target.closest('[data-sel-id]');
            if (!item) return;
            var id = item.getAttribute('data-sel-id');
            for (var i = 0; i < ultimi.length; i++) {
                if (ultimi[i].id === id) { scegli(ultimi[i]); return; }
            }
        });

        // Chiudi cliccando fuori. Senza usare gli id: con un id vuoto la
        // vecchia versione faceva closest('#') e sollevava un errore.
        document.addEventListener('click', function(e) {
            if (e.target === inputEl) return;
            if (resultsEl.contains(e.target)) return;
            chiudi();
        });
    }

    // ============================================================
    // INTESTATARIO DOCUMENTO
    // Restituisce i dati di intestazione di una fattura/ricevuta,
    // sia dall'anagrafica cliente sia dall'intestatario libero
    // (ricevute a clienti occasionali, cliente_id = null)
    // ============================================================

    function intestatario(f) {
        var c = f && f.cliente;
        if (c) {
            return {
                nome: c.nome_ragione_sociale || '',
                indirizzo: [c.sede_legale_indirizzo, c.sede_legale_cap, c.sede_legale_comune, c.sede_legale_provincia].filter(Boolean).join(' '),
                fiscale: c.p_iva_coe ? 'COE/P.IVA: ' + c.p_iva_coe : '',
                email: c.email || null,
                occasionale: false
            };
        }
        return {
            nome: (f && f.intestatario_nome) || '',
            indirizzo: (f && f.intestatario_indirizzo) || '',
            fiscale: (f && f.intestatario_cf) ? 'C.F.: ' + f.intestatario_cf : '',
            email: null,
            occasionale: true
        };
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
        intestatario: intestatario,
        validaPrezzo: validaPrezzo,
        validaQuantita: validaQuantita,
        validaPercentuale: validaPercentuale
    };

})();
