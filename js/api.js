// ============================================================
// GESTIONALE ENI - API Layer
// Wrapper Supabase: CRUD generico + query specifiche
// ============================================================

var ENI = ENI || {};

ENI.API = (function() {
    'use strict';

    var _supabase = null;

    // --- Init ---

    function init() {
        if (_supabase) return _supabase;
        _supabase = supabase.createClient(
            ENI.Config.SUPABASE_URL,
            ENI.Config.SUPABASE_ANON_KEY
        );
        return _supabase;
    }

    function getClient() {
        return _supabase || init();
    }

    // --- CRUD Generico ---

    async function getAll(tabella, options) {
        options = options || {};
        var query = getClient().from(tabella).select(options.select || '*');

        if (options.filters) {
            options.filters.forEach(function(f) {
                query = query[f.op](f.col, f.val);
            });
        }

        if (options.order) {
            query = query.order(options.order.col, { ascending: options.order.asc !== false });
        }

        if (options.limit) {
            query = query.limit(options.limit);
        }

        var result = await query;
        if (result.error) throw new Error(result.error.message);
        return result.data;
    }

    async function getById(tabella, id) {
        var result = await getClient().from(tabella).select('*').eq('id', id).single();
        if (result.error) throw new Error(result.error.message);
        return result.data;
    }

    async function insert(tabella, data) {
        var result = await getClient().from(tabella).insert(data).select().single();
        if (result.error) throw new Error(result.error.message);
        return result.data;
    }

    async function update(tabella, id, data) {
        var result = await getClient().from(tabella).update(data).eq('id', id).select().single();
        if (result.error) throw new Error(result.error.message);
        return result.data;
    }

    async function remove(tabella, id) {
        var result = await getClient().from(tabella).delete().eq('id', id);
        if (result.error) throw new Error(result.error.message);
        return true;
    }

    // --- Generazione Codice Sequenziale ---

    async function generaCodice(tabella, prefisso, colonnaCode) {
        colonnaCode = colonnaCode || 'codice';
        var result = await getClient()
            .from(tabella)
            .select(colonnaCode)
            .order(colonnaCode, { ascending: false })
            .limit(1);

        if (result.error) throw new Error(result.error.message);

        if (!result.data || result.data.length === 0) {
            return prefisso + '001';
        }

        var ultimo = result.data[0][colonnaCode];
        var numero = parseInt(ultimo.replace(prefisso, ''), 10) + 1;
        return prefisso + String(numero).padStart(3, '0');
    }

    // --- Log Attivita ---

    async function scriviLog(azione, modulo, dettagli) {
        try {
            await insert('log_attivita', {
                utente_id: ENI.State.getUserId(),
                nome_utente: ENI.State.getUserName(),
                azione: azione,
                modulo: modulo,
                dettagli: dettagli
            });
        } catch(e) {
            console.error('Errore scrittura log:', e);
        }
    }

    // ============================================================
    // QUERY SPECIFICHE PER MODULO
    // ============================================================

    // --- Personale (Auth) ---

    async function loginByPin(pin) {
        var result = await getClient()
            .from('personale')
            .select('*')
            .eq('pin', pin)
            .eq('attivo', true)
            .limit(1);

        if (result.error) {
            throw new Error(result.error.message);
        }
        return (result.data && result.data.length > 0) ? result.data[0] : null;
    }

    // --- Clienti ---

    async function getClienti(filtroTipo) {
        var cacheKey = 'clienti_' + (filtroTipo || 'tutti');
        var cached = ENI.State.cacheGet(cacheKey);
        if (cached) return cached;

        var options = {
            filters: [{ op: 'eq', col: 'attivo', val: true }],
            order: { col: 'nome_ragione_sociale', asc: true }
        };

        if (filtroTipo && filtroTipo !== 'Tutti') {
            options.filters.push({ op: 'eq', col: 'tipo', val: filtroTipo });
        }

        var data = await getAll('clienti', options);
        ENI.State.cacheSet(cacheKey, data);
        return data;
    }

    async function salvaCliente(dati) {
        ENI.State.cacheClear('clienti_tutti');
        ENI.State.cacheClear('clienti_Corporate');
        ENI.State.cacheClear('clienti_Privato');

        var record = await insert('clienti', dati);
        await scriviLog('Creato_Cliente', 'Clienti', dati.nome_ragione_sociale);
        return record;
    }

    async function aggiornaCliente(id, dati) {
        ENI.State.cacheClear();
        var record = await update('clienti', id, dati);
        await scriviLog('Modificato_Cliente', 'Clienti', dati.nome_ragione_sociale || id);
        return record;
    }

    // --- Listino Lavaggi ---

    async function getListino() {
        var cached = ENI.State.cacheGet('listino');
        if (cached) return cached;

        var data = await getAll('listino_lavaggi', {
            filters: [{ op: 'eq', col: 'attivo', val: true }],
            order: { col: 'ordine', asc: true }
        });
        ENI.State.cacheSet('listino', data);
        return data;
    }

    async function getListinoCompleto() {
        var data = await getAll('listino_lavaggi', {
            order: { col: 'ordine', asc: true }
        });
        return data;
    }

    async function salvaListino(dati) {
        // Auto-assegna ordine in fondo
        var tutti = await getListinoCompleto();
        var maxOrdine = tutti.reduce(function(max, l) { return Math.max(max, l.ordine || 0); }, 0);
        dati.ordine = maxOrdine + 1;

        var record = await insert('listino_lavaggi', dati);
        ENI.State.cacheClear('listino');
        await scriviLog('Creato_Tipo_Lavaggio', 'Lavaggi', dati.tipo_lavaggio + ' - ' + ENI.UI.formatValuta(dati.prezzo_standard));
        return record;
    }

    async function aggiornaListino(id, dati) {
        var record = await update('listino_lavaggi', id, dati);
        ENI.State.cacheClear('listino');
        await scriviLog('Modificato_Tipo_Lavaggio', 'Lavaggi', (dati.tipo_lavaggio || '') + ' - ' + ENI.UI.formatValuta(dati.prezzo_standard));
        return record;
    }

    async function eliminaListino(id, item) {
        var record = await remove('listino_lavaggi', id);
        ENI.State.cacheClear('listino');
        await scriviLog('Eliminato_Tipo_Lavaggio', 'Lavaggi', item.tipo_lavaggio);
        return record;
    }

    async function riordinaListino(id, nuovoOrdine) {
        await update('listino_lavaggi', id, { ordine: nuovoOrdine });
        ENI.State.cacheClear('listino');
    }

    // --- Lavaggi ---

    async function getLavaggiPerData(data) {
        var result = await getClient()
            .from('lavaggi')
            .select('*')
            .eq('data', data)
            .order('orario_inizio', { ascending: true })
            .order('orario_fine', { ascending: true });

        if (result.error) throw new Error(result.error.message);
        return result.data;
    }

    async function getLavaggiMese(anno, mese) {
        var primoGiorno = anno + '-' + String(mese).padStart(2, '0') + '-01';
        var ultimoGiorno = anno + '-' + String(mese).padStart(2, '0') + '-' + new Date(anno, mese, 0).getDate();

        var result = await getClient()
            .from('lavaggi')
            .select('data, stato')
            .gte('data', primoGiorno)
            .lte('data', ultimoGiorno)
            .neq('stato', 'Annullato');

        if (result.error) throw new Error(result.error.message);
        return result.data;
    }

    async function salvaLavaggio(dati) {
        var codice = await generaCodice('lavaggi', ENI.Config.PREFISSI.LAVAGGIO);
        dati.codice = codice;
        dati.utente_inserimento = ENI.State.getUserId();

        var record = await insert('lavaggi', dati);
        await scriviLog('Creato_Lavaggio', 'Lavaggi', codice + ' - ' + (dati.nome_cliente || 'Walk-in') + ' - ' + ENI.UI.formatValuta(dati.prezzo));
        return record;
    }

    async function completaLavaggio(id, lavaggio) {
        var updateData = {
            stato: 'Completato',
            utente_completamento: ENI.State.getUserId(),
            completato_at: new Date().toISOString()
        };

        var record = await update('lavaggi', id, updateData);

        await scriviLog(
            'Completato_Lavaggio', 'Lavaggi',
            lavaggio.codice + ' - ' + (lavaggio.veicolo || lavaggio.nome_cliente) + ' - ' + ENI.UI.formatValuta(lavaggio.prezzo)
        );

        return record;
    }

    async function annullaLavaggio(id, lavaggio) {
        var record = await update('lavaggi', id, { stato: 'Annullato' });

        await scriviLog(
            'Annullato_Lavaggio', 'Lavaggi',
            lavaggio.codice + ' - ' + (lavaggio.veicolo || lavaggio.nome_cliente) + ' - ' + ENI.UI.formatValuta(lavaggio.prezzo)
        );

        return record;
    }

    async function modificaLavaggio(id, dati, lavaggio) {
        var record = await update('lavaggi', id, dati);

        await scriviLog(
            'Modificato_Lavaggio', 'Lavaggi',
            lavaggio.codice + ' - ' + (lavaggio.veicolo || lavaggio.nome_cliente) + ' - ' + ENI.UI.formatValuta(dati.prezzo || lavaggio.prezzo)
        );

        return record;
    }

    async function eliminaLavaggio(id, lavaggio) {
        await remove('lavaggi', id);

        await scriviLog(
            'Eliminato_Lavaggio', 'Lavaggi',
            lavaggio.codice + ' - ' + (lavaggio.veicolo || lavaggio.nome_cliente) + ' - ' + ENI.UI.formatValuta(lavaggio.prezzo)
        );

        return true;
    }

    // --- Crediti ---

    async function getCrediti(filtroStato) {
        var options = {
            order: { col: 'created_at', asc: false }
        };

        if (filtroStato && filtroStato !== 'Tutti') {
            options.filters = [{ op: 'eq', col: 'stato', val: filtroStato }];
        }

        return await getAll('crediti', options);
    }

    async function creaCredito(dati) {
        var codice = await generaCodice('crediti', ENI.Config.PREFISSI.CREDITO);
        dati.codice = codice;
        dati.utente_creazione = ENI.State.getUserId();

        var record = await insert('crediti', dati);
        await scriviLog('Creato_Credito', 'Crediti', codice + ' - ' + dati.nome_cliente + ' - ' + ENI.UI.formatValuta(dati.importo));
        return record;
    }

    async function incassaCredito(id, credito, modalita, note) {
        var record = await update('crediti', id, {
            stato: 'Incassato',
            data_incasso: ENI.UI.oggiISO(),
            modalita_incasso: modalita,
            utente_incasso: ENI.State.getUserId(),
            note: note || credito.note
        });

        await scriviLog('Incassato_Credito', 'Crediti', credito.codice + ' - ' + ENI.UI.formatValuta(credito.importo));
        return record;
    }

    async function annullaCredito(id, credito) {
        var record = await update('crediti', id, { stato: 'Annullato' });
        await scriviLog('Annullato_Credito', 'Crediti', credito.codice + ' - ' + ENI.UI.formatValuta(credito.importo));
        return record;
    }

    // --- Cassa ---

    async function getCassaPerData(data) {
        var result = await getClient()
            .from('cassa')
            .select('*')
            .eq('data', data)
            .single();

        if (result.error && result.error.code !== 'PGRST116') {
            throw new Error(result.error.message);
        }
        return result.data;
    }

    async function getCassaOggi() {
        return getCassaPerData(ENI.UI.oggiISO());
    }

    async function getCassaMese(anno, mese) {
        var primoGiorno = anno + '-' + String(mese).padStart(2, '0') + '-01';
        var ultimoGiorno = anno + '-' + String(mese).padStart(2, '0') + '-' +
            new Date(anno, mese, 0).getDate();

        var result = await getClient()
            .from('cassa')
            .select('*')
            .gte('data', primoGiorno)
            .lte('data', ultimoGiorno)
            .order('data', { ascending: false });

        if (result.error) throw new Error(result.error.message);
        return result.data || [];
    }

    async function salvaCassa(dati) {
        var record;
        var data = dati.data || ENI.UI.oggiISO();
        var existing = await getCassaPerData(data);

        if (existing) {
            record = await update('cassa', existing.id, dati);
        } else {
            dati.data = data;
            record = await insert('cassa', dati);
        }

        await scriviLog('Chiusura_Cassa', 'Cassa',
            'Venduto: ' + ENI.UI.formatValuta(dati.totale_venduto) +
            ' - Incassato: ' + ENI.UI.formatValuta(dati.totale_incassato) +
            ' - Diff: ' + ENI.UI.formatValuta(dati.differenza)
        );

        return record;
    }

    // --- Spese Cassa ---

    async function getSpeseCassa(data) {
        var result = await getClient()
            .from('spese_cassa')
            .select('*')
            .eq('data', data)
            .order('created_at', { ascending: true });

        if (result.error) throw new Error(result.error.message);
        return result.data || [];
    }

    async function salvaSpesa(dati) {
        dati.utente_inserimento = ENI.State.getUserId();
        var record = await insert('spese_cassa', dati);
        await scriviLog('Aggiunta_Spesa', 'Spese',
            dati.descrizione + ' - ' + ENI.UI.formatValuta(dati.importo)
        );
        return record;
    }

    async function eliminaSpesa(id, spesa) {
        await remove('spese_cassa', id);
        await scriviLog('Eliminata_Spesa', 'Spese',
            spesa.descrizione + ' - ' + ENI.UI.formatValuta(spesa.importo)
        );
        return true;
    }

    // --- Magazzino ---

    async function getMagazzino(categoria) {
        var options = {
            filters: [{ op: 'eq', col: 'attivo', val: true }],
            order: { col: 'nome_prodotto', asc: true }
        };

        if (categoria && categoria !== 'Tutti') {
            options.filters.push({ op: 'eq', col: 'categoria', val: categoria });
        }

        return await getAll('magazzino', options);
    }

    async function salvaProdotto(dati) {
        var record = await insert('magazzino', dati);
        await scriviLog('Aggiunto_Prodotto', 'Magazzino', dati.nome_prodotto);
        return record;
    }

    async function aggiornaProdotto(id, dati) {
        var record = await update('magazzino', id, dati);
        await scriviLog('Modificato_Prodotto', 'Magazzino', dati.nome_prodotto || id);
        return record;
    }

    // --- Manutenzioni ---

    async function getManutenzioni() {
        return await getAll('manutenzioni', {
            order: { col: 'data', asc: false }
        });
    }

    async function salvaManutenzione(dati) {
        var codice = await generaCodice('manutenzioni', ENI.Config.PREFISSI.MANUTENZIONE);
        dati.codice = codice;
        dati.utente_inserimento = ENI.State.getUserId();

        var record = await insert('manutenzioni', dati);
        await scriviLog('Creata_Manutenzione', 'Manutenzioni', codice + ' - ' + dati.attrezzatura);
        return record;
    }

    // --- Personale ---

    async function getPersonale() {
        return await getAll('personale', {
            order: { col: 'nome_completo', asc: true }
        });
    }

    async function salvaPersonale(dati) {
        var record = await insert('personale', dati);
        await scriviLog('Aggiunto_Personale', 'Personale', dati.nome_completo + ' - ' + dati.ruolo);
        return record;
    }

    async function aggiornaPersonale(id, dati) {
        var record = await update('personale', id, dati);
        await scriviLog('Modificato_Personale', 'Personale', dati.nome_completo || id);
        return record;
    }

    // --- Log ---

    async function getLog(options) {
        options = options || {};
        var query = getClient()
            .from('log_attivita')
            .select('*')
            .order('created_at', { ascending: false });

        if (options.modulo) {
            query = query.eq('modulo', options.modulo);
        }

        if (options.da) {
            query = query.gte('created_at', options.da + 'T00:00:00');
        }

        if (options.a) {
            query = query.lte('created_at', options.a + 'T23:59:59');
        }

        query = query.limit(options.limit || 100);

        var result = await query;
        if (result.error) throw new Error(result.error.message);
        return result.data;
    }

    // --- Dashboard ---

    async function getDashboardData() {
        var oggi = ENI.UI.oggiISO();

        var results = await Promise.all([
            // Crediti aperti
            getClient().from('crediti').select('importo').eq('stato', 'Aperto'),
            // Lavaggi oggi
            getClient().from('lavaggi').select('id, stato, priorita').eq('data', oggi),
            // Clienti attivi
            getClient().from('clienti').select('id, tipo').eq('attivo', true),
            // Crediti scaduti
            getClient().from('crediti').select('id').eq('stato', 'Aperto').lt('scadenza', oggi)
        ]);

        var creditiAperti = results[0].data || [];
        var lavaggiOggi = results[1].data || [];
        var clientiAttivi = results[2].data || [];
        var creditiScaduti = results[3].data || [];

        var totaleCreditiAperti = creditiAperti.reduce(function(sum, c) {
            return sum + Number(c.importo || 0);
        }, 0);

        return {
            creditiAperti: totaleCreditiAperti,
            creditiScadutiCount: creditiScaduti.length,
            lavaggiOggi: lavaggiOggi.length,
            lavaggiCompletati: lavaggiOggi.filter(function(l) { return l.stato === 'Completato'; }).length,
            lavaggiPrenotati: lavaggiOggi.filter(function(l) { return l.stato === 'Prenotato'; }).length,
            clientiAttivi: clientiAttivi.length,
            clientiCorporate: clientiAttivi.filter(function(c) { return c.tipo === 'Corporate'; }).length,
            clientiPrivati: clientiAttivi.filter(function(c) { return c.tipo === 'Privato'; }).length
        };
    }

    // API pubblica
    return {
        init: init,
        getClient: getClient,
        getAll: getAll,
        getById: getById,
        insert: insert,
        update: update,
        remove: remove,
        generaCodice: generaCodice,
        scriviLog: scriviLog,
        loginByPin: loginByPin,
        getClienti: getClienti,
        salvaCliente: salvaCliente,
        aggiornaCliente: aggiornaCliente,
        getListino: getListino,
        getListinoCompleto: getListinoCompleto,
        salvaListino: salvaListino,
        aggiornaListino: aggiornaListino,
        eliminaListino: eliminaListino,
        riordinaListino: riordinaListino,
        getLavaggiPerData: getLavaggiPerData,
        getLavaggiMese: getLavaggiMese,
        salvaLavaggio: salvaLavaggio,
        completaLavaggio: completaLavaggio,
        annullaLavaggio: annullaLavaggio,
        modificaLavaggio: modificaLavaggio,
        eliminaLavaggio: eliminaLavaggio,
        getCrediti: getCrediti,
        creaCredito: creaCredito,
        incassaCredito: incassaCredito,
        annullaCredito: annullaCredito,
        getCassaPerData: getCassaPerData,
        getCassaOggi: getCassaOggi,
        getCassaMese: getCassaMese,
        salvaCassa: salvaCassa,
        getSpeseCassa: getSpeseCassa,
        salvaSpesa: salvaSpesa,
        eliminaSpesa: eliminaSpesa,
        getMagazzino: getMagazzino,
        salvaProdotto: salvaProdotto,
        aggiornaProdotto: aggiornaProdotto,
        getManutenzioni: getManutenzioni,
        salvaManutenzione: salvaManutenzione,
        getPersonale: getPersonale,
        salvaPersonale: salvaPersonale,
        aggiornaPersonale: aggiornaPersonale,
        getLog: getLog,
        getDashboardData: getDashboardData
    };
})();
