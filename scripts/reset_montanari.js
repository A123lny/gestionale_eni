// ============================================================
// Script: Reset saldo e storico Roberto Montanari
// Eseguire dalla console del browser dopo aver caricato l'app
// ============================================================

(async function resetMontanari() {
    try {
        var sb = ENI.API.getClient();

        // 1. Cerca il cliente portale
        console.log('[1/3] Cerco Roberto Montanari in clienti_portale...');
        var { data: clienti, error: errCerca } = await sb
            .from('clienti_portale')
            .select('id, nome_display, saldo')
            .ilike('nome_display', '%montanari%');

        if (errCerca) throw new Error('Errore ricerca: ' + errCerca.message);
        if (!clienti || clienti.length === 0) {
            console.log('Nessun cliente trovato con nome "Montanari".');
            return;
        }

        var cliente = clienti[0];
        console.log('Trovato: ' + cliente.nome_display + ' (ID: ' + cliente.id + ', Saldo attuale: ' + cliente.saldo + '€)');

        // 2. Elimina tutti i movimenti_saldo
        console.log('[2/3] Elimino storico movimenti_saldo...');
        var { data: movDel, error: errMov, count } = await sb
            .from('movimenti_saldo')
            .delete()
            .eq('cliente_portale_id', cliente.id)
            .select('id');

        if (errMov) throw new Error('Errore eliminazione movimenti: ' + errMov.message);
        console.log('Eliminati ' + (movDel ? movDel.length : 0) + ' movimenti.');

        // 3. Azzera il saldo
        console.log('[3/3] Azzero saldo a 0.00€...');
        var { error: errUpd } = await sb
            .from('clienti_portale')
            .update({ saldo: 0 })
            .eq('id', cliente.id);

        if (errUpd) throw new Error('Errore azzeramento saldo: ' + errUpd.message);

        console.log('Fatto! Saldo di ' + cliente.nome_display + ' azzerato a 0.00€');

    } catch (e) {
        console.error('ERRORE:', e.message);
    }
})();
