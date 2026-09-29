/**
 * Quadratura della cassa: calcoli puri, nessun DOM e nessuna chiamata al database.
 *
 * PERCHE' ESISTE QUESTO FILE
 * Il venduto carburante che l'operatore inserisce arriva dallo scontrino della
 * sera, che valorizza TUTTI i litri della giornata a UN SOLO prezzo: quello
 * esposto al momento della stampa. Gli incassi invece sono soldi veri.
 * Il giorno che il prezzo cambia a meta' giornata i due numeri misurano cose
 * diverse, e la differenza di cassa si allarga senza che manchi un euro.
 *
 * Misurato su 159 giornate chiuse (marzo-settembre 2026):
 *   - giorni a prezzo fermo   -> scarto medio 137 EUR
 *   - giorni di cambio prezzo -> scarto medio 284 EUR, oscillazione 4 volte piu' ampia
 * In sei mesi il totale e' -339,62 EUR su 2.481.271 EUR di venduto: lo scarto si
 * annulla, quindi NON e' un ammanco ma il modo in cui il numero viene costruito.
 *
 * Qui dentro ci sono tre cose:
 *   1. il recupero del venduto quando si conoscono i litri venduti al prezzo vecchio
 *   2. il rilevamento del cambio prezzo confrontando due casse consecutive
 *   3. le soglie che distinguono una giornata normale da una da controllare
 */
(function(global) {
    'use strict';

    var ENI = global.ENI = global.ENI || {};

    var PRODOTTI = [
        { prefix: 'super_sp',    label: 'Super senza Piombo' },
        { prefix: 'diesel',      label: 'Diesel' },
        { prefix: 'diesel_plus', label: 'Diesel Plus' }
    ];

    // Sotto il mezzo millesimo non e' un cambio prezzo, e' un arrotondamento
    // dello scontrino (i litri arrivano con due decimali).
    var TOLLERANZA_PREZZO = 0.0005;

    // Soglie della differenza giornaliera, in euro. Ricavate dallo scarto medio
    // reale: 137 EUR a prezzo fermo, 284 EUR con cambio prezzo. Sui sei mesi
    // storici lasciano verde il 90% delle giornate e segnano in rosso il 4%,
    // che sono i giorni con un problema vero (chiusure POS mancanti).
    var SOGLIE_PREZZO_FERMO  = { attenzione: 300,  anomala: 700 };
    var SOGLIE_CAMBIO_PREZZO = { attenzione: 600,  anomala: 1400 };

    function num(v) {
        var n = Number(v);
        return isFinite(n) ? n : 0;
    }

    /**
     * Prezzo al litro ricavato dallo scontrino: euro / litri.
     * Null quando non e' calcolabile (prodotto non venduto quel giorno).
     */
    function prezzoImplicito(litri, euro) {
        var l = num(litri);
        if (l <= 0) return null;
        return num(euro) / l;
    }

    /**
     * Venduto corretto di un singolo prodotto.
     *
     * Lo scontrino dice: litri x prezzoOggi. Se pero' `litriPrezzoPrec` litri
     * erano gia' stati venduti quando il prezzo era `prezzoPrec`, quei litri
     * sono stati contati alla differenza di prezzo sbagliata. La si toglie.
     *
     * Senza i due dati opzionali restituisce gli euro cosi' come sono: il campo
     * e' facoltativo e la cassa deve funzionare anche se non viene compilato.
     */
    function vendutoProdotto(litri, euro, litriPrezzoPrec, prezzoPrec) {
        var l = num(litri);
        var e = num(euro);
        var lPrec = num(litriPrezzoPrec);
        var pPrec = num(prezzoPrec);

        if (l <= 0 || lPrec <= 0 || pPrec <= 0) return e;
        if (lPrec > l) lPrec = l;      // non si possono avere piu' litri del totale

        var prezzoOggi = e / l;
        return e - lPrec * (prezzoOggi - pPrec);
    }

    /**
     * Totale carburante della giornata, applicando la correzione a ogni prodotto.
     * `campi` = valori del form (o riga cassa), `prezziPrec` = mappa prefix -> prezzo.
     */
    function vendutoCarburante(campi, prezziPrec) {
        campi = campi || {};
        prezziPrec = prezziPrec || {};
        var tot = 0;
        PRODOTTI.forEach(function(p) {
            tot += vendutoProdotto(
                campi[p.prefix + '_litri'],
                campi[p.prefix + '_euro'],
                campi[p.prefix + '_litri_prezzo_prec'],
                prezziPrec[p.prefix]
            );
        });
        return tot;
    }

    /** Prezzi impliciti di una cassa, come mappa prefix -> prezzo (solo quelli calcolabili). */
    function prezziDaCassa(cassa) {
        var out = {};
        if (!cassa) return out;
        PRODOTTI.forEach(function(p) {
            var pr = prezzoImplicito(cassa[p.prefix + '_litri'], cassa[p.prefix + '_euro']);
            if (pr !== null) out[p.prefix] = pr;
        });
        return out;
    }

    /**
     * Prodotti il cui prezzo e' cambiato rispetto alla cassa precedente.
     * Attenzione: non distingue il cambio avvenuto DURANTE la giornata (che
     * sballa il venduto) da quello avvenuto di notte a stazione chiusa (che non
     * sballa niente). Dal solo database non e' ricavabile, quindi si allarga la
     * soglia in entrambi i casi.
     */
    function cambiPrezzo(cassa, cassaPrec) {
        var out = [];
        if (!cassa || !cassaPrec) return out;
        var oggi = prezziDaCassa(cassa);
        var prec = prezziDaCassa(cassaPrec);
        PRODOTTI.forEach(function(p) {
            var a = oggi[p.prefix], b = prec[p.prefix];
            if (a === undefined || b === undefined) return;
            if (Math.abs(a - b) >= TOLLERANZA_PREZZO) {
                out.push({
                    prefix: p.prefix,
                    label: p.label,
                    prezzoPrecedente: b,
                    prezzoOggi: a
                });
            }
        });
        return out;
    }

    /**
     * Soglie da applicare alla differenza.
     * Quando il prezzo e' cambiato ma l'operatore HA indicato i litri al prezzo
     * vecchio, il venduto e' gia' stato corretto: si torna alla soglia stretta.
     */
    function soglie(cambioPrezzo, correzioneApplicata) {
        return (cambioPrezzo && !correzioneApplicata)
            ? SOGLIE_CAMBIO_PREZZO
            : SOGLIE_PREZZO_FERMO;
    }

    /** 'regolare' | 'attenzione' | 'anomala' */
    function statoDifferenza(differenza, s) {
        s = s || SOGLIE_PREZZO_FERMO;
        var a = Math.abs(num(differenza));
        if (a <= s.attenzione) return 'regolare';
        if (a <= s.anomala)    return 'attenzione';
        return 'anomala';
    }

    /** Somma delle differenze delle sole casse CHIUSE (le bozze sono parziali). */
    function progressivo(casse) {
        if (!casse || !casse.length) return { totale: 0, giorni: 0 };
        var tot = 0, n = 0;
        casse.forEach(function(c) {
            if (!c || c.stato !== 'chiusa') return;
            tot += num(c.differenza);
            n++;
        });
        return { totale: tot, giorni: n };
    }

    ENI.CassaQuadratura = {
        PRODOTTI: PRODOTTI,
        TOLLERANZA_PREZZO: TOLLERANZA_PREZZO,
        SOGLIE_PREZZO_FERMO: SOGLIE_PREZZO_FERMO,
        SOGLIE_CAMBIO_PREZZO: SOGLIE_CAMBIO_PREZZO,
        prezzoImplicito: prezzoImplicito,
        vendutoProdotto: vendutoProdotto,
        vendutoCarburante: vendutoCarburante,
        prezziDaCassa: prezziDaCassa,
        cambiPrezzo: cambiPrezzo,
        soglie: soglie,
        statoDifferenza: statoDifferenza,
        progressivo: progressivo
    };

})(typeof window !== 'undefined' ? window : this);
