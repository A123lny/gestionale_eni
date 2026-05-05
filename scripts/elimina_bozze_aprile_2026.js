// ============================================================
// Script: Elimina tutte le bozze RIEPILOGATIVA_ENI di aprile 2026
// Eseguire dalla console del browser (F12) sulla pagina del gestionale
// ============================================================

(async function eliminaBozzeAprile() {
    var MESE = 4;
    var ANNO = 2026;

    try {
        var sb = ENI.API.getClient();

        // 1. Trova le bozze
        console.log('[1/4] Cerco bozze RIEPILOGATIVA_ENI per ' + MESE + '/' + ANNO + '...');
        var res = await sb
            .from('fatture')
            .select('id, numero_formattato, cliente_id, totale, stato, mese_riferimento, anno_riferimento')
            .eq('tipo', 'RIEPILOGATIVA_ENI')
            .eq('stato', 'BOZZA')
            .eq('mese_riferimento', MESE)
            .eq('anno_riferimento', ANNO);

        if (res.error) throw new Error('Errore ricerca: ' + res.error.message);
        var fatture = res.data || [];

        if (!fatture.length) {
            console.log('Nessuna bozza trovata.');
            return;
        }

        var totale = fatture.reduce(function(s, f) { return s + (f.totale || 0); }, 0);
        console.table(fatture.map(function(f) {
            return { numero: f.numero_formattato, totale: f.totale };
        }));
        console.log('Trovate ' + fatture.length + ' bozze, totale ' + totale.toFixed(2) + '€');

        // 2. Conferma
        if (!window.confirm('Eliminare ' + fatture.length + ' bozze di aprile 2026?\nTotale: ' + totale.toFixed(2) + '€\n\nL\'operazione e\' irreversibile.')) {
            console.log('Annullato.');
            return;
        }

        var ids = fatture.map(function(f) { return f.id; });

        // 3. Cancella movimenti e righe
        console.log('[2/4] Cancello fatture_movimenti...');
        var rmov = await sb.from('fatture_movimenti').delete().in('fattura_id', ids);
        if (rmov.error) throw new Error('Errore movimenti: ' + rmov.error.message);

        console.log('[3/4] Cancello fatture_righe...');
        var rrig = await sb.from('fatture_righe').delete().in('fattura_id', ids);
        if (rrig.error) throw new Error('Errore righe: ' + rrig.error.message);

        // 4. Cancella le fatture
        console.log('[4/4] Cancello fatture...');
        var rfat = await sb.from('fatture').delete().in('id', ids);
        if (rfat.error) throw new Error('Errore fatture: ' + rfat.error.message);

        console.log('Fatto. Eliminate ' + fatture.length + ' bozze. Ricarica la pagina per vedere l\'elenco aggiornato.');
    } catch (e) {
        console.error('ERRORE:', e.message);
    }
})();
