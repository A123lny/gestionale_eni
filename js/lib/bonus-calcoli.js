/**
 * Bonus venduto: calcoli puri. Niente DOM, niente chiamate al database.
 *
 * Due modalita', scelte una volta nelle Impostazioni e valide per tutti gli
 * articoli con il bonus acceso:
 *   - euro al pezzo: un importo fisso per pezzo venduto
 *   - percentuale:   la percentuale dipende dalla fascia di PREZZO DEL PEZZO
 *                    (non dal venduto del mese), e si applica all'imponibile
 *
 * Una fascia vale dal proprio da_prezzo INCLUSO fino al da_prezzo della
 * successiva ESCLUSO; l'ultima e' aperta. Un pezzo da 10,00 EUR con fasce
 * 0/10/30 cade nella fascia che parte da 10.
 */
(function(global) {
    'use strict';

    var ENI = global.ENI = global.ENI || {};

    function num(v) {
        var n = Number(v);
        return isFinite(n) ? n : 0;
    }

    /**
     * Due decimali, arrotondando per eccesso sui mezzi come fa il database.
     *
     * Si arrotonda sulla rappresentazione DECIMALE, non su quella binaria. In
     * binario 2,135 vale in realta' 2,13499999..., quindi Math.round darebbe
     * 2,13 mentre Postgres, che lavora su decimali esatti, scrive 2,14. Con un
     * solo centesimo di scarto il dipendente vedrebbe un'anteprima diversa da
     * quello che incassa: sull'intervallo dei prezzi reali le combinazioni che
     * divergevano erano 312. toFixed(6) ricostruisce il decimale voluto perche'
     * l'errore binario sta molto piu' in la' della sesta cifra.
     */
    function arrotonda(n) {
        n = num(n);
        var segno = n < 0 ? -1 : 1;
        var parti = Math.abs(n).toFixed(6).split('.');
        var centesimi = Number(parti[0]) * 100 + Number(parti[1].slice(0, 2));
        if (Number(parti[1].slice(2)) >= 5000) centesimi += 1;
        return segno * centesimi / 100;
    }

    function fasceOrdinate(fasce) {
        if (!fasce || !fasce.length) return [];
        return fasce.filter(function(f) {
            return f && isFinite(Number(f.da_prezzo)) && Number(f.da_prezzo) >= 0 &&
                   isFinite(Number(f.percentuale));
        }).sort(function(a, b) {
            return Number(a.da_prezzo) - Number(b.da_prezzo);
        });
    }

    /** La fascia applicabile a quel prezzo, o null se non ce n'e' nessuna. */
    function fasciaPerPrezzo(prezzo, fasce) {
        var p = num(prezzo);
        var ord = fasceOrdinate(fasce);
        var scelta = null;
        for (var i = 0; i < ord.length; i++) {
            if (Number(ord[i].da_prezzo) <= p) scelta = ord[i];
            else break;
        }
        return scelta;
    }

    /**
     * Bonus di una riga di vendita.
     * Restituisce anche modo e valore applicati: vanno memorizzati sul
     * movimento, cosi' cambiare la regola domani non riscrive il passato.
     */
    function bonusRiga(prezzoUnitario, quantita, regola) {
        var vuoto = { bonus: 0, regolaModo: null, regolaValore: 0 };
        if (!regola) return vuoto;

        var p = num(prezzoUnitario);
        var q = num(quantita);
        if (p <= 0 || q <= 0) {
            return { bonus: 0, regolaModo: regola.modo || null, regolaValore: 0 };
        }

        if (regola.modo === 'euro') {
            var e = num(regola.euroPezzo);
            // L'importo al pezzo vive in impostazioni_app, una chiave/valore
            // generica senza vincoli: puo' arrivare negativo. Un bonus non
            // deve mai diventare un addebito (la stessa difesa esiste anche
            // lato SQL, per non disallineare i due calcoli).
            return { bonus: Math.max(0, arrotonda(e * q)), regolaModo: 'euro', regolaValore: e };
        }

        if (regola.modo === 'percentuale') {
            var f = fasciaPerPrezzo(p, regola.fasce);
            if (!f) return { bonus: 0, regolaModo: 'percentuale', regolaValore: 0 };
            var perc = num(f.percentuale);
            return {
                // Stesso limite inferiore a zero: la percentuale e' vincolata
                // a livello di database (0 < percentuale <= 100), ma teniamo
                // la difesa anche qui per simmetria con il ramo 'euro'.
                bonus: Math.max(0, arrotonda(p * q * perc / 100)),
                regolaModo: 'percentuale',
                regolaValore: perc
            };
        }

        return vuoto;
    }

    /**
     * Cosa non va nella configurazione, in italiano leggibile.
     * Serve a far vedere al gestore un errore di impostazione PRIMA che
     * qualcuno venda e si ritrovi zero euro di bonus senza capire perche'.
     */
    function problemiConfigurazione(regola) {
        var out = [];
        if (!regola) return ['Nessuna regola impostata: il bonus sarà sempre zero.'];

        if (regola.modo === 'euro') {
            if (num(regola.euroPezzo) <= 0) {
                out.push('L\'importo al pezzo è zero: nessuno prenderà bonus.');
            }
            return out;
        }

        if (regola.modo !== 'percentuale') {
            return ['Modalità del bonus non riconosciuta.'];
        }

        var ord = fasceOrdinate(regola.fasce);
        if (!ord.length) {
            out.push('Nessuna fascia impostata: il bonus sarà sempre zero.');
            return out;
        }
        if (Number(ord[0].da_prezzo) > 0) {
            out.push('I pezzi sotto ' + Number(ord[0].da_prezzo).toFixed(2) +
                     ' € non daranno nessun bonus: aggiungi una fascia che parte da 0.');
        }
        for (var i = 1; i < ord.length; i++) {
            if (Number(ord[i].da_prezzo) === Number(ord[i - 1].da_prezzo)) {
                out.push('Due fasce partono dallo stesso importo (' +
                         Number(ord[i].da_prezzo).toFixed(2) + ' €): tieni solo quella giusta.');
                break;
            }
        }
        for (var j = 0; j < ord.length; j++) {
            var pc = Number(ord[j].percentuale);
            if (pc <= 0 || pc > 100) {
                out.push('La percentuale ' + pc + '% non è valida: dev\'essere fra 0 e 100.');
                break;
            }
        }
        return out;
    }

    ENI.BonusCalcoli = {
        arrotonda: arrotonda,
        fasciaPerPrezzo: fasciaPerPrezzo,
        bonusRiga: bonusRiga,
        problemiConfigurazione: problemiConfigurazione
    };

})(typeof window !== 'undefined' ? window : this);
