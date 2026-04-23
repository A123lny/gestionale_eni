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

    async function cercaClienti(searchTerm) {
        var result = await getClient()
            .from('clienti')
            .select('id, nome_ragione_sociale, targa, p_iva_coe, tipo, telefono, email, modalita_pagamento')
            .eq('attivo', true)
            .or(
                'nome_ragione_sociale.ilike.%' + searchTerm + '%,' +
                'targa.ilike.%' + searchTerm + '%,' +
                'p_iva_coe.ilike.%' + searchTerm + '%'
            )
            .order('nome_ragione_sociale', { ascending: true })
            .limit(15);
        if (result.error) throw new Error(result.error.message);
        return result.data || [];
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

    async function eliminaCassa(id, data) {
        await remove('cassa', id);
        await scriviLog('Eliminata_Cassa', 'Cassa', 'Data: ' + data);
        return true;
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

    // --- Prezzi Cliente (per articoli Lavaggi) ---

    async function getPrezziCliente(prodottoId) {
        var result = await getClient()
            .from('prezzi_cliente')
            .select('*, clienti(nome_ragione_sociale, tipo)')
            .eq('prodotto_id', prodottoId)
            .order('created_at', { ascending: true });
        if (result.error) throw new Error(result.error.message);
        return result.data || [];
    }

    async function getPrezziClientePerCliente(clienteId) {
        var result = await getClient()
            .from('prezzi_cliente')
            .select('*, magazzino(nome_prodotto, prezzo_vendita, codice)')
            .eq('cliente_id', clienteId);
        if (result.error) throw new Error(result.error.message);
        return result.data || [];
    }

    async function salvaPrezzoCliente(clienteId, prodottoId, prezzo) {
        // Upsert: se esiste aggiorna, altrimenti inserisci
        var result = await getClient()
            .from('prezzi_cliente')
            .upsert({
                cliente_id: clienteId,
                prodotto_id: prodottoId,
                prezzo: prezzo
            }, { onConflict: 'cliente_id,prodotto_id' })
            .select()
            .single();
        if (result.error) throw new Error(result.error.message);
        return result.data;
    }

    async function eliminaPrezzoCliente(clienteId, prodottoId) {
        var result = await getClient()
            .from('prezzi_cliente')
            .delete()
            .eq('cliente_id', clienteId)
            .eq('prodotto_id', prodottoId);
        if (result.error) throw new Error(result.error.message);
        return true;
    }

    // --- Vendita da Lavaggio ---

    async function salvaVenditaDaLavaggio(lavaggio, prodottoMagazzino) {
        var codice = await generaCodice('vendite', ENI.Config.PREFISSI.VENDITA);

        var vendita = {
            codice: codice,
            data: lavaggio.data || ENI.UI.oggiISO(),
            ora: new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            subtotale: lavaggio.prezzo,
            sconto_globale: 0,
            sconto_globale_tipo: 'fisso',
            totale: lavaggio.prezzo,
            metodo_pagamento: 'contanti',
            importo_contanti: lavaggio.prezzo,
            importo_pos: 0,
            importo_buono: 0,
            importo_wallet: 0,
            resto: 0,
            stato: 'completata',
            operatore_id: ENI.State.getUserId(),
            operatore_nome: ENI.State.getUserName(),
            lavaggio_id: lavaggio.id,
            note_lavaggio: lavaggio.codice + ' - ' + (lavaggio.nome_cliente || 'Walk-in')
        };

        var record = await insert('vendite', vendita);

        var dettaglio = {
            vendita_id: record.id,
            prodotto_id: prodottoMagazzino ? prodottoMagazzino.id : null,
            codice_prodotto: prodottoMagazzino ? prodottoMagazzino.codice : lavaggio.tipo_lavaggio,
            nome_prodotto: lavaggio.tipo_lavaggio + (lavaggio.nome_cliente !== 'Walk-in' ? ' - ' + lavaggio.nome_cliente : ''),
            categoria: 'Lavaggi',
            quantita: 1,
            prezzo_unitario: lavaggio.prezzo,
            sconto: 0,
            sconto_tipo: 'fisso',
            totale_riga: lavaggio.prezzo
        };

        await insert('vendite_dettaglio', dettaglio);

        await scriviLog('Vendita_Da_Lavaggio', 'Vendita',
            codice + ' - ' + lavaggio.codice + ' - ' + ENI.UI.formatValuta(lavaggio.prezzo));

        return record;
    }

    async function getVenditaPerLavaggio(lavaggioId) {
        var result = await getClient()
            .from('vendite')
            .select('*')
            .eq('lavaggio_id', lavaggioId)
            .neq('stato', 'annullata')
            .limit(1);
        if (result.error) throw new Error(result.error.message);
        return (result.data && result.data.length > 0) ? result.data[0] : null;
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
            getClient().from('crediti').select('id').eq('stato', 'Aperto').lt('scadenza', oggi),
            // Prenotazioni in attesa
            getClient().from('prenotazioni_lavaggio').select('id, data_richiesta, fascia_oraria').eq('stato', 'in_attesa')
        ]);

        var creditiAperti = results[0].data || [];
        var lavaggiOggi = results[1].data || [];
        var clientiAttivi = results[2].data || [];
        var creditiScaduti = results[3].data || [];
        var prenotazioniInAttesa = results[4].data || [];

        var totaleCreditiAperti = creditiAperti.reduce(function(sum, c) {
            return sum + Number(c.importo || 0);
        }, 0);

        var prenOggi = prenotazioniInAttesa.filter(function(p) { return p.data_richiesta === oggi; });

        return {
            creditiAperti: totaleCreditiAperti,
            creditiScadutiCount: creditiScaduti.length,
            lavaggiOggi: lavaggiOggi.length,
            lavaggiCompletati: lavaggiOggi.filter(function(l) { return l.stato === 'Completato'; }).length,
            lavaggiPrenotati: lavaggiOggi.filter(function(l) { return l.stato === 'Prenotato'; }).length,
            clientiAttivi: clientiAttivi.length,
            clientiCorporate: clientiAttivi.filter(function(c) { return c.tipo === 'Corporate'; }).length,
            clientiPrivati: clientiAttivi.filter(function(c) { return c.tipo === 'Privato'; }).length,
            prenotazioniInAttesa: prenotazioniInAttesa.length,
            prenotazioniInAttesaOggi: prenOggi.length
        };
    }

    // --- Bulk Insert (per import CSV) ---

    async function insertBulk(tabella, dataArray) {
        var result = await getClient().from(tabella).insert(dataArray).select();
        if (result.error) throw new Error(result.error.message);
        return result.data;
    }

    // --- Magazzino: Cerca per Barcode ---

    async function cercaProdottoByBarcode(barcode) {
        var result = await getClient()
            .from('magazzino')
            .select('*')
            .eq('barcode', barcode)
            .eq('attivo', true)
            .limit(1);
        if (result.error) throw new Error(result.error.message);
        return (result.data && result.data.length > 0) ? result.data[0] : null;
    }

    // --- Magazzino: Cerca per nome (autocomplete POS) ---

    async function cercaProdottiByNome(term) {
        var result = await getClient()
            .from('magazzino')
            .select('*')
            .eq('attivo', true)
            .ilike('nome_prodotto', '%' + term + '%')
            .order('nome_prodotto', { ascending: true })
            .limit(20);
        if (result.error) throw new Error(result.error.message);
        return result.data || [];
    }

    // --- Vendite ---

    async function salvaVendita(vendita, dettagli) {
        var codice = await generaCodice('vendite', ENI.Config.PREFISSI.VENDITA);
        vendita.codice = codice;
        vendita.operatore_id = ENI.State.getUserId();
        vendita.operatore_nome = ENI.State.getUserName();

        var record = await insert('vendite', vendita);

        dettagli.forEach(function(d) {
            d.vendita_id = record.id;
        });
        await insertBulk('vendite_dettaglio', dettagli);

        // Scalare giacenza
        for (var i = 0; i < dettagli.length; i++) {
            var d = dettagli[i];
            if (d.prodotto_id) {
                try {
                    var prodotto = await getById('magazzino', d.prodotto_id);
                    if (prodotto) {
                        await update('magazzino', d.prodotto_id, {
                            giacenza: Math.max(0, prodotto.giacenza - d.quantita),
                            ultima_movimentazione: new Date().toISOString()
                        });
                    }
                } catch(e) {
                    console.error('Errore aggiornamento giacenza prodotto:', d.prodotto_id, e);
                }
            }
        }

        await scriviLog('Vendita', 'Vendita',
            codice + ' - ' + ENI.UI.formatValuta(vendita.totale) +
            ' - ' + vendita.metodo_pagamento);

        return record;
    }

    async function getVendite(options) {
        options = options || {};
        var query = getClient()
            .from('vendite')
            .select('*')
            .order('created_at', { ascending: false });

        if (options.data) {
            query = query.eq('data', options.data);
        }
        if (options.da) {
            query = query.gte('data', options.da);
        }
        if (options.a) {
            query = query.lte('data', options.a);
        }
        if (options.stato) {
            query = query.eq('stato', options.stato);
        }
        if (options.operatore_id) {
            query = query.eq('operatore_id', options.operatore_id);
        }

        query = query.limit(options.limit || 100);

        var result = await query;
        if (result.error) throw new Error(result.error.message);
        return result.data || [];
    }

    async function getVenditaDettaglio(venditaId) {
        return await getAll('vendite_dettaglio', {
            filters: [{ op: 'eq', col: 'vendita_id', val: venditaId }]
        });
    }

    async function annullaVendita(id, vendita) {
        var record = await update('vendite', id, { stato: 'annullata' });

        // Ripristinare giacenza
        var dettagli = await getVenditaDettaglio(id);
        for (var i = 0; i < dettagli.length; i++) {
            var d = dettagli[i];
            if (d.prodotto_id) {
                try {
                    var prodotto = await getById('magazzino', d.prodotto_id);
                    if (prodotto) {
                        await update('magazzino', d.prodotto_id, {
                            giacenza: prodotto.giacenza + d.quantita,
                            ultima_movimentazione: new Date().toISOString()
                        });
                    }
                } catch(e) {
                    console.error('Errore ripristino giacenza:', d.prodotto_id, e);
                }
            }
        }

        await scriviLog('Annullata_Vendita', 'Vendita',
            vendita.codice + ' - ' + ENI.UI.formatValuta(vendita.totale));
        return record;
    }

    // --- Totali vendite per data (per auto-populate cassa) ---

    async function getVenditeTotaliPerData(data) {
        var vendite = await getVendite({ data: data, stato: 'completata', limit: 500 });

        if (!vendite || vendite.length === 0) {
            return { totaleVendite: 0, numVendite: 0, perCategoria: {}, perMetodo: { contanti: 0, pos: 0, buono: 0, wallet: 0 } };
        }

        var totaleVendite = 0;
        var perMetodo = { contanti: 0, pos: 0, buono: 0, wallet: 0 };
        vendite.forEach(function(v) {
            totaleVendite += Number(v.totale || 0);
            perMetodo.contanti += Number(v.importo_contanti || 0);
            perMetodo.pos += Number(v.importo_pos || 0);
            perMetodo.buono += Number(v.importo_buono || 0);
            perMetodo.wallet += Number(v.importo_wallet || 0);
        });

        // Totali per categoria dalle righe dettaglio
        var perCategoria = {};
        for (var i = 0; i < vendite.length; i++) {
            var dettagli = await getVenditaDettaglio(vendite[i].id);
            dettagli.forEach(function(d) {
                var cat = d.categoria || 'Altro';
                if (!perCategoria[cat]) perCategoria[cat] = 0;
                perCategoria[cat] += Number(d.totale_riga || 0);
            });
        }

        return {
            totaleVendite: totaleVendite,
            numVendite: vendite.length,
            perCategoria: perCategoria,
            perMetodo: perMetodo
        };
    }

    // --- Resi ---

    async function salvaReso(reso, dettagli) {
        var codice = await generaCodice('resi', ENI.Config.PREFISSI.RESO);
        reso.codice = codice;
        reso.operatore_id = ENI.State.getUserId();
        reso.operatore_nome = ENI.State.getUserName();

        var record = await insert('resi', reso);

        dettagli.forEach(function(d) {
            d.reso_id = record.id;
        });
        await insertBulk('resi_dettaglio', dettagli);

        // Riassortire giacenza
        for (var i = 0; i < dettagli.length; i++) {
            var d = dettagli[i];
            if (d.prodotto_id && d.riassortito) {
                try {
                    var prodotto = await getById('magazzino', d.prodotto_id);
                    if (prodotto) {
                        await update('magazzino', d.prodotto_id, {
                            giacenza: prodotto.giacenza + d.quantita_resa,
                            ultima_movimentazione: new Date().toISOString()
                        });
                    }
                } catch(e) {
                    console.error('Errore riassortimento:', d.prodotto_id, e);
                }
            }
        }

        // Aggiorna stato vendita
        var venditaDettagli = await getVenditaDettaglio(reso.vendita_id);
        var resiEsistenti = await getResiPerVendita(reso.vendita_id);
        var totQtyVenduta = venditaDettagli.reduce(function(s, d) { return s + d.quantita; }, 0);
        var totQtyResa = 0;
        resiEsistenti.forEach(function(r) {
            if (r.dettagli) r.dettagli.forEach(function(rd) { totQtyResa += rd.quantita_resa; });
        });
        totQtyResa += dettagli.reduce(function(s, d) { return s + d.quantita_resa; }, 0);

        await update('vendite', reso.vendita_id, {
            stato: totQtyResa >= totQtyVenduta ? 'reso_totale' : 'reso_parziale'
        });

        await scriviLog('Reso', 'Vendita',
            codice + ' (da ' + reso.vendita_codice + ') - ' + ENI.UI.formatValuta(reso.totale_reso));

        return record;
    }

    async function getResiPerVendita(venditaId) {
        var resi = await getAll('resi', {
            filters: [{ op: 'eq', col: 'vendita_id', val: venditaId }]
        });

        for (var i = 0; i < resi.length; i++) {
            resi[i].dettagli = await getAll('resi_dettaglio', {
                filters: [{ op: 'eq', col: 'reso_id', val: resi[i].id }]
            });
        }
        return resi;
    }

    // ============================================================
    // BUONI CARTACEI
    // ============================================================

    async function cercaBuonoByEAN(ean) {
        var result = await getClient().from('buoni_cartacei')
            .select('*')
            .eq('codice_ean', ean)
            .single();
        if (result.error) {
            if (result.error.code === 'PGRST116') return null;
            throw new Error(result.error.message);
        }
        return result.data;
    }

    async function generaBuoniCartacei(buoniArray) {
        var records = await insertBulk('buoni_cartacei', buoniArray);
        await scriviLog('Generati_Buoni', 'Buoni',
            buoniArray.length + ' buoni generati - Lotto: ' + (buoniArray[0] ? buoniArray[0].lotto : ''));
        ENI.State.cacheClear('buoni');
        return records;
    }

    async function utilizzaBuono(buonoId, venditaId) {
        var record = await update('buoni_cartacei', buonoId, {
            stato: 'utilizzato',
            vendita_id: venditaId,
            utilizzato_at: new Date().toISOString(),
            utilizzato_da: ENI.State.getUserId()
        });
        ENI.State.cacheClear('buoni');
        return record;
    }

    async function annullaBuono(buonoId) {
        var buono = await getById('buoni_cartacei', buonoId);
        var record = await update('buoni_cartacei', buonoId, { stato: 'annullato' });
        await scriviLog('Annullato_Buono', 'Buoni', 'EAN: ' + buono.codice_ean + ' - ' + ENI.UI.formatValuta(buono.taglio));
        ENI.State.cacheClear('buoni');
        return record;
    }

    async function getBuoni(filtri) {
        filtri = filtri || {};
        var query = getClient().from('buoni_cartacei').select('*, clienti(nome_ragione_sociale)');
        if (filtri.stato) query = query.eq('stato', filtri.stato);
        if (filtri.lotto) query = query.eq('lotto', filtri.lotto);
        if (filtri.taglio) query = query.eq('taglio', filtri.taglio);
        if (filtri.cliente_id) query = query.eq('cliente_id', filtri.cliente_id);
        query = query.order('created_at', { ascending: false });
        if (filtri.limit) query = query.limit(filtri.limit);
        var result = await query;
        if (result.error) throw new Error(result.error.message);
        return result.data;
    }

    async function getMaxSequenzialeBuono(denomCode) {
        var prefix = '20' + denomCode;
        var result = await getClient().from('buoni_cartacei')
            .select('codice_ean')
            .like('codice_ean', prefix + '%')
            .order('codice_ean', { ascending: false })
            .limit(1);
        if (result.error) throw new Error(result.error.message);
        if (result.data && result.data.length > 0) {
            var lastEAN = result.data[0].codice_ean;
            return parseInt(lastEAN.substring(3, 12), 10);
        }
        return 0;
    }

    async function getLottiBuoni() {
        var result = await getClient().rpc('get_lotti_buoni_summary');
        if (result.error) {
            // Fallback se RPC non esiste: query manuale
            var buoni = await getAll('buoni_cartacei', {
                select: 'lotto, taglio, stato, created_at, creato_nome'
            });
            var lottiMap = {};
            buoni.forEach(function(b) {
                if (!b.lotto) return;
                if (!lottiMap[b.lotto]) {
                    lottiMap[b.lotto] = { lotto: b.lotto, totale: 0, attivi: 0, utilizzati: 0, data: b.created_at, operatore: b.creato_nome };
                }
                lottiMap[b.lotto].totale++;
                if (b.stato === 'attivo') lottiMap[b.lotto].attivi++;
                if (b.stato === 'utilizzato') lottiMap[b.lotto].utilizzati++;
            });
            return Object.values(lottiMap);
        }
        return result.data;
    }

    // ============================================================
    // CLIENTI PORTALE (DIGITALE)
    // ============================================================

    async function loginCliente(email, password) {
        var result = await getClient().rpc('login_cliente', {
            p_email: email,
            p_password: password
        });
        if (result.error) throw new Error(result.error.message);
        return result.data;
    }

    async function creaClientePortale(email, password, nome, clienteId) {
        var result = await getClient().rpc('crea_cliente_portale', {
            p_email: email,
            p_password: password,
            p_nome: nome,
            p_cliente_id: clienteId || null
        });
        if (result.error) throw new Error(result.error.message);
        if (result.data && result.data.success) {
            await scriviLog('Creato_Account_Cliente', 'Buoni', 'Email: ' + email + ' - Nome: ' + nome);
        }
        ENI.State.cacheClear('clienti_portale');
        return result.data;
    }

    async function ricaricaSaldo(clientePortaleId, importo, descrizione) {
        var result = await getClient().rpc('ricarica_saldo', {
            p_cliente_portale_id: clientePortaleId,
            p_importo: importo,
            p_descrizione: descrizione || 'Ricarica saldo',
            p_operatore_id: ENI.State.getUserId(),
            p_operatore_nome: ENI.State.getUserName()
        });
        if (result.error) throw new Error(result.error.message);
        if (result.data && result.data.success) {
            await scriviLog('Ricarica_Saldo', 'Buoni',
                'Importo: ' + ENI.UI.formatValuta(importo) + ' - Nuovo saldo: ' + ENI.UI.formatValuta(result.data.nuovo_saldo));
        }
        ENI.State.cacheClear('clienti_portale');
        return result.data;
    }

    async function deduciSaldoCliente(clientePortaleId, importo, descrizione, refTipo, refId) {
        var result = await getClient().rpc('deduci_saldo', {
            p_cliente_portale_id: clientePortaleId,
            p_importo: importo,
            p_descrizione: descrizione || 'Pagamento',
            p_riferimento_tipo: refTipo || null,
            p_riferimento_id: refId || null,
            p_operatore_id: ENI.State.getUserId(),
            p_operatore_nome: ENI.State.getUserName()
        });
        if (result.error) throw new Error(result.error.message);
        ENI.State.cacheClear('clienti_portale');
        return result.data;
    }

    async function getClientiPortale(filtri) {
        filtri = filtri || {};
        var query = getClient().from('clienti_portale').select('*');
        if (filtri.attivo !== undefined) query = query.eq('attivo', filtri.attivo);
        if (filtri.search) {
            query = query.or('nome_display.ilike.%' + filtri.search + '%,email.ilike.%' + filtri.search + '%');
        }
        query = query.order('nome_display', { ascending: true });
        var result = await query;
        if (result.error) throw new Error(result.error.message);
        return result.data;
    }

    async function getClientePortaleById(id) {
        return await getById('clienti_portale', id);
    }

    async function aggiornaClientePortale(id, dati) {
        var record = await update('clienti_portale', id, dati);
        ENI.State.cacheClear('clienti_portale');
        return record;
    }

    async function resetPasswordClienteAdmin(clientePortaleId, nuovaPassword) {
        var result = await getClient().rpc('reset_password_cliente_admin', {
            p_cliente_portale_id: clientePortaleId,
            p_nuova_password: nuovaPassword
        });
        if (result.error) throw new Error(result.error.message);
        if (result.data && result.data.success) {
            await scriviLog('Reset_Password_Cliente', 'Buoni', 'ID cliente: ' + clientePortaleId);
        }
        return result.data;
    }

    async function getMovimentiSaldo(clientePortaleId, options) {
        options = options || {};
        var query = getClient().from('movimenti_saldo')
            .select('*')
            .eq('cliente_portale_id', clientePortaleId)
            .order('created_at', { ascending: false });
        if (options.limit) query = query.limit(options.limit);
        var result = await query;
        if (result.error) throw new Error(result.error.message);
        return result.data;
    }

    // ============================================================
    // PRENOTAZIONI LAVAGGIO
    // ============================================================

    async function creaPrenotazioneLavaggio(dati) {
        var record = await insert('prenotazioni_lavaggio', dati);
        return record;
    }

    async function getPrenotazioniLavaggio(filtri) {
        filtri = filtri || {};
        var query = getClient().from('prenotazioni_lavaggio')
            .select('*, clienti_portale(nome_display, email)');
        if (filtri.stato) query = query.eq('stato', filtri.stato);
        if (filtri.cliente_portale_id) query = query.eq('cliente_portale_id', filtri.cliente_portale_id);
        if (filtri.data_da) query = query.gte('data_richiesta', filtri.data_da);
        if (filtri.data_a) query = query.lte('data_richiesta', filtri.data_a);
        query = query.order('data_richiesta', { ascending: true }).order('created_at', { ascending: false });
        var result = await query;
        if (result.error) throw new Error(result.error.message);
        return result.data;
    }

    async function aggiornaPrenotazione(id, dati) {
        var record = await update('prenotazioni_lavaggio', id, dati);
        return record;
    }

    // ============================================================
    // TESORERIA (Cash Flow)
    // ============================================================

    // --- Categorie Tesoreria ---

    async function getCategorieTesoreria() {
        var cached = ENI.State.cacheGet('categorie_tesoreria');
        if (cached) return cached;
        var data = await getAll('categorie_tesoreria', {
            order: { col: 'ordine', asc: true }
        });
        ENI.State.cacheSet('categorie_tesoreria', data);
        return data;
    }

    async function salvaCategoriaTesoreria(dati) {
        var record = await insert('categorie_tesoreria', dati);
        ENI.State.cacheClear('categorie_tesoreria');
        await scriviLog('Creata_Categoria_Tesoreria', 'Tesoreria', dati.nome);
        return record;
    }

    async function aggiornaCategoriaTesoreria(id, dati) {
        var record = await update('categorie_tesoreria', id, dati);
        ENI.State.cacheClear('categorie_tesoreria');
        await scriviLog('Modificata_Categoria_Tesoreria', 'Tesoreria', dati.nome || id);
        return record;
    }

    async function eliminaCategoriaTesoreria(id, nome) {
        await remove('categorie_tesoreria', id);
        ENI.State.cacheClear('categorie_tesoreria');
        await scriviLog('Eliminata_Categoria_Tesoreria', 'Tesoreria', nome);
        return true;
    }

    // --- Movimenti Banca ---

    async function getMovimentiBanca(options) {
        options = options || {};
        var query = getClient().from('movimenti_banca').select('*');

        if (options.banca) query = query.eq('banca', options.banca);
        if (options.da) query = query.gte('data_operazione', options.da);
        if (options.a) query = query.lte('data_operazione', options.a);
        if (options.categoria) query = query.eq('categoria', options.categoria);

        query = query.order('data_operazione', { ascending: options.asc !== false });
        if (options.limit) query = query.limit(options.limit);

        var result = await query;
        if (result.error) throw new Error(result.error.message);
        return result.data || [];
    }

    async function getHashMovimentiEsistenti(dataInizio, dataFine) {
        var result = await getClient()
            .from('movimenti_banca')
            .select('hash_movimento')
            .gte('data_operazione', dataInizio)
            .lte('data_operazione', dataFine);
        if (result.error) throw new Error(result.error.message);
        return (result.data || []).map(function(r) { return r.hash_movimento; });
    }

    async function importaMovimentiBanca(movimenti) {
        if (!movimenti || movimenti.length === 0) return [];
        var result = await getClient().from('movimenti_banca').insert(movimenti).select();
        if (result.error) throw new Error(result.error.message);
        await scriviLog('Import_Movimenti_Banca', 'Tesoreria',
            movimenti.length + ' movimenti importati - Banca: ' + movimenti[0].banca);
        return result.data;
    }

    async function aggiornaMovimentoBanca(id, dati) {
        return await update('movimenti_banca', id, dati);
    }

    async function eliminaMovimentoBanca(id) {
        await remove('movimenti_banca', id);
        return true;
    }

    async function getUltimoSaldoBanca() {
        var result = await getClient()
            .from('movimenti_banca')
            .select('saldo_progressivo, data_operazione, banca')
            .not('saldo_progressivo', 'is', null)
            .order('data_operazione', { ascending: false })
            .limit(1);
        if (result.error) throw new Error(result.error.message);
        return (result.data && result.data.length > 0) ? result.data[0] : null;
    }

    // --- Pagamenti Ricorrenti ---

    async function getPagamentiRicorrenti(soloAttivi) {
        var options = { order: { col: 'created_at', asc: false } };
        if (soloAttivi) {
            options.filters = [{ op: 'eq', col: 'attivo', val: true }];
        }
        return await getAll('pagamenti_ricorrenti', options);
    }

    async function salvaPagamentoRicorrente(dati) {
        var record = await insert('pagamenti_ricorrenti', dati);
        await scriviLog('Creato_Pagamento_Ricorrente', 'Tesoreria',
            dati.descrizione + ' - ' + ENI.UI.formatValuta(dati.importo) + ' (' + dati.frequenza + ')');
        return record;
    }

    async function aggiornaPagamentoRicorrente(id, dati) {
        var record = await update('pagamenti_ricorrenti', id, dati);
        await scriviLog('Modificato_Pagamento_Ricorrente', 'Tesoreria', dati.descrizione || id);
        return record;
    }

    async function eliminaPagamentoRicorrente(id, descrizione) {
        await remove('pagamenti_ricorrenti', id);
        await scriviLog('Eliminato_Pagamento_Ricorrente', 'Tesoreria', descrizione);
        return true;
    }

    // --- Pagamenti Programmati ---

    async function getPagamentiProgrammati(filtroStato) {
        var options = { order: { col: 'data_scadenza', asc: true } };
        if (filtroStato && filtroStato !== 'tutti') {
            options.filters = [{ op: 'eq', col: 'stato', val: filtroStato }];
        }
        return await getAll('pagamenti_programmati', options);
    }

    async function salvaPagamentoProgrammato(dati) {
        var record = await insert('pagamenti_programmati', dati);
        await scriviLog('Creato_Pagamento_Programmato', 'Tesoreria',
            dati.descrizione + ' - ' + ENI.UI.formatValuta(dati.importo) + ' scad. ' + dati.data_scadenza);
        return record;
    }

    async function aggiornaPagamentoProgrammato(id, dati) {
        var record = await update('pagamenti_programmati', id, dati);
        await scriviLog('Modificato_Pagamento_Programmato', 'Tesoreria', dati.descrizione || id);
        return record;
    }

    async function pagaPagamentoProgrammato(id, pagamento) {
        var record = await update('pagamenti_programmati', id, {
            stato: 'pagato',
            data_pagamento: ENI.UI.oggiISO()
        });
        await scriviLog('Pagato_Pagamento_Programmato', 'Tesoreria',
            pagamento.descrizione + ' - ' + ENI.UI.formatValuta(pagamento.importo));
        return record;
    }

    async function annullaPagamentoProgrammato(id, pagamento) {
        var record = await update('pagamenti_programmati', id, { stato: 'annullato' });
        await scriviLog('Annullato_Pagamento_Programmato', 'Tesoreria', pagamento.descrizione);
        return record;
    }

    // --- Cassa per periodo (per storico tesoreria) ---

    async function getCassaPeriodo(da, a) {
        var query = getClient()
            .from('cassa')
            .select('data, totale_venduto, totale_incassato, totale_spese, totale_crediti, crediti_4tscard');

        if (da) query = query.gte('data', da);
        if (a) query = query.lte('data', a);

        query = query.order('data', { ascending: true });

        var result = await query;
        if (result.error) throw new Error(result.error.message);
        return result.data || [];
    }

    // --- Carichi Carburante (per auto-scadenze tesoreria) ---

    async function getCarichiCarburante(da, a) {
        var query = getClient()
            .from('carichi_carburante')
            .select('id, data, litri_fiscali, litri_fisici, prezzo_mp, accisa, costo_carico_totale, prodotto_id, note');

        if (da) query = query.gte('data', da);
        if (a) query = query.lte('data', a);

        query = query.order('data', { ascending: true });

        var result = await query;
        if (result.error) throw new Error(result.error.message);
        return result.data || [];
    }

    // --- Spese cassa per periodo (per tesoreria previsione) ---

    async function getSpeseCassaPeriodo(da, a) {
        var query = getClient()
            .from('spese_cassa')
            .select('data, importo');

        if (da) query = query.gte('data', da);
        if (a) query = query.lte('data', a);

        var result = await query;
        if (result.error) throw new Error(result.error.message);
        return result.data || [];
    }

    // --- Totale 4TS Card per mese (crediti cumulativi dalla cassa) ---

    async function get4TSCardMese(anno, mese) {
        var primoGiorno = anno + '-' + String(mese).padStart(2, '0') + '-01';
        var ultimoGiorno = anno + '-' + String(mese).padStart(2, '0') + '-' +
            new Date(anno, mese, 0).getDate();

        var result = await getClient()
            .from('cassa')
            .select('data, crediti_4tscard')
            .gte('data', primoGiorno)
            .lte('data', ultimoGiorno);

        if (result.error) throw new Error(result.error.message);

        var totale = 0;
        (result.data || []).forEach(function(c) {
            if (c.crediti_4tscard && Array.isArray(c.crediti_4tscard)) {
                c.crediti_4tscard.forEach(function(item) {
                    totale += parseFloat(item.importo) || 0;
                });
            }
        });

        return totale;
    }

    // --- Scadenze Tesoreria (per alert badge) ---

    async function getScadenzeTesoreria(giorniAvanti) {
        giorniAvanti = giorniAvanti || 7;
        var oggi = ENI.UI.oggiISO();
        var limite = new Date();
        limite.setDate(limite.getDate() + giorniAvanti);
        var limiteISO = limite.toISOString().split('T')[0];

        // Pagamenti programmati in scadenza
        var programmati = await getClient()
            .from('pagamenti_programmati')
            .select('id, descrizione, importo, tipo, data_scadenza')
            .eq('stato', 'programmato')
            .gte('data_scadenza', oggi)
            .lte('data_scadenza', limiteISO);

        if (programmati.error) throw new Error(programmati.error.message);

        // Pagamenti ricorrenti attivi - restituiamo quelli attivi, il calcolo delle date avviene lato client
        var ricorrenti = await getClient()
            .from('pagamenti_ricorrenti')
            .select('id, descrizione, importo, tipo, frequenza, giorno_scadenza, mese_riferimento')
            .eq('attivo', true);

        if (ricorrenti.error) throw new Error(ricorrenti.error.message);

        return {
            programmati: programmati.data || [],
            ricorrenti: ricorrenti.data || []
        };
    }

    // ============================================================
    // FATTURAZIONE
    // ============================================================

    async function getProssimoNumeroFattura(anno) {
        var result = await getClient().rpc('get_prossimo_numero_fattura', { p_anno: anno });
        if (result.error) throw new Error(result.error.message);
        return result.data;
    }

    async function getProssimoNumeroDocumento(anno, tipoDocumento) {
        tipoDocumento = tipoDocumento || 'FATTURA';
        var result = await getClient().rpc('get_prossimo_numero_documento', { p_anno: anno, p_tipo: tipoDocumento });
        if (result.error) throw new Error(result.error.message);
        return result.data;
    }

    async function getImpostazioniFatturazione() {
        var result = await getClient()
            .from('impostazioni_fatturazione')
            .select('*')
            .limit(1);
        if (result.error) throw new Error(result.error.message);
        return (result.data && result.data.length > 0) ? result.data[0] : null;
    }

    async function salvaImpostazioniFatturazione(data) {
        var esistente = await getImpostazioniFatturazione();
        data.updated_at = new Date().toISOString();
        if (esistente) {
            var r = await getClient()
                .from('impostazioni_fatturazione')
                .update(data)
                .eq('id', esistente.id)
                .select().single();
            if (r.error) throw new Error(r.error.message);
            return r.data;
        } else {
            data.singleton = true;
            var r2 = await getClient()
                .from('impostazioni_fatturazione')
                .insert(data)
                .select().single();
            if (r2.error) throw new Error(r2.error.message);
            return r2.data;
        }
    }

    async function getFatture(filtri) {
        filtri = filtri || {};
        var query = getClient()
            .from('fatture')
            .select('*, cliente:clienti(id, nome_ragione_sociale, p_iva_coe)')
            .order('data_emissione', { ascending: false });

        if (filtri.anno) query = query.eq('anno', filtri.anno);
        if (filtri.mese_riferimento) query = query.eq('mese_riferimento', filtri.mese_riferimento);
        if (filtri.cliente_id) query = query.eq('cliente_id', filtri.cliente_id);
        if (filtri.stato) query = query.eq('stato', filtri.stato);
        if (filtri.tipo) query = query.eq('tipo', filtri.tipo);
        if (filtri.import_eni_log_id) query = query.eq('import_eni_log_id', filtri.import_eni_log_id);

        if (filtri.limit) {
            var offset = filtri.offset || 0;
            query = query.range(offset, offset + filtri.limit - 1);
        }

        var result = await query;
        if (result.error) throw new Error(result.error.message);
        return result.data || [];
    }

    async function getFatturaCompleta(id) {
        var fattura = await getClient()
            .from('fatture')
            .select('*, cliente:clienti(*)')
            .eq('id', id).single();
        if (fattura.error) throw new Error(fattura.error.message);

        var righe = await getClient()
            .from('fatture_righe')
            .select('*')
            .eq('fattura_id', id)
            .order('ordine', { ascending: true });
        if (righe.error) throw new Error(righe.error.message);

        var movimenti = await getClient()
            .from('fatture_movimenti')
            .select('*')
            .eq('fattura_id', id)
            .order('data_movimento', { ascending: true });
        if (movimenti.error) throw new Error(movimenti.error.message);

        return {
            fattura: fattura.data,
            righe: righe.data || [],
            movimenti: movimenti.data || []
        };
    }

    async function salvaFattura(fattura, righe, movimenti) {
        var anno = fattura.anno || new Date(fattura.data_emissione).getFullYear();
        var tipoDoc = fattura.tipo_documento || 'FATTURA';
        if (!fattura.numero) {
            fattura.numero = await getProssimoNumeroDocumento(anno, tipoDoc);
            fattura.anno = anno;
            fattura.tipo_documento = tipoDoc;
            var prefisso = tipoDoc === 'RICEVUTA' ? 'R' : '';
            fattura.numero_formattato = prefisso + fattura.numero + '/' + anno;
        }
        fattura.utente_creazione = ENI.State.getUserId();

        var result = await getClient()
            .from('fatture')
            .insert(fattura)
            .select().single();
        if (result.error) throw new Error(result.error.message);
        var f = result.data;

        if (righe && righe.length) {
            var righeConId = righe.map(function(r, i) {
                return Object.assign({}, r, { fattura_id: f.id, ordine: r.ordine != null ? r.ordine : i });
            });
            var r = await getClient().from('fatture_righe').insert(righeConId);
            if (r.error) throw new Error(r.error.message);
        }

        if (movimenti && movimenti.length) {
            var BATCH = 50;
            for (var i = 0; i < movimenti.length; i += BATCH) {
                var batch = movimenti.slice(i, i + BATCH).map(function(m) {
                    return Object.assign({}, m, { fattura_id: f.id });
                });
                var rm = await getClient().from('fatture_movimenti').insert(batch);
                if (rm.error) throw new Error(rm.error.message);
            }
        }

        await scriviLog('Emessa fattura ' + f.numero_formattato, 'fatturazione',
            { fattura_id: f.id, cliente_id: f.cliente_id, totale: f.totale });
        return f;
    }

    async function aggiornaStatoFattura(id, stato, extra) {
        var data = Object.assign({ stato: stato, updated_at: new Date().toISOString() }, extra || {});
        var result = await getClient()
            .from('fatture').update(data).eq('id', id).select().single();
        if (result.error) throw new Error(result.error.message);
        await scriviLog('Cambio stato fattura -> ' + stato, 'fatturazione', { fattura_id: id });
        return result.data;
    }

    async function annullaFattura(id, motivo) {
        return aggiornaStatoFattura(id, 'ANNULLATA', { note: motivo || null });
    }

    async function getImportEniLog(anno, mese) {
        var q = getClient().from('import_eni_log').select('*').order('created_at', { ascending: false });
        if (anno) q = q.eq('anno', anno);
        if (mese) q = q.eq('mese', mese);
        var r = await q;
        if (r.error) throw new Error(r.error.message);
        return r.data || [];
    }

    async function registraImportEni(data) {
        data.utente_id = ENI.State.getUserId();
        var r = await getClient().from('import_eni_log').insert(data).select().single();
        if (r.error) throw new Error(r.error.message);
        return r.data;
    }

    async function aggiungiAliasCliente(clienteId, alias) {
        var cli = await getById('clienti', clienteId);
        var lista = cli.alias_import_eni || [];
        var normalizzato = (alias || '').trim().toLowerCase().replace(/\s+/g, ' ');
        if (!normalizzato || lista.indexOf(normalizzato) >= 0) return cli;
        lista.push(normalizzato);
        return await update('clienti', clienteId, { alias_import_eni: lista });
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
        cercaClienti: cercaClienti,
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
        eliminaCassa: eliminaCassa,
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
        getDashboardData: getDashboardData,
        insertBulk: insertBulk,
        cercaProdottoByBarcode: cercaProdottoByBarcode,
        cercaProdottiByNome: cercaProdottiByNome,
        salvaVendita: salvaVendita,
        getVendite: getVendite,
        getVenditaDettaglio: getVenditaDettaglio,
        annullaVendita: annullaVendita,
        getVenditeTotaliPerData: getVenditeTotaliPerData,
        salvaReso: salvaReso,
        getResiPerVendita: getResiPerVendita,
        // Buoni cartacei
        cercaBuonoByEAN: cercaBuonoByEAN,
        generaBuoniCartacei: generaBuoniCartacei,
        utilizzaBuono: utilizzaBuono,
        annullaBuono: annullaBuono,
        getBuoni: getBuoni,
        getMaxSequenzialeBuono: getMaxSequenzialeBuono,
        getLottiBuoni: getLottiBuoni,
        // Clienti portale
        loginCliente: loginCliente,
        creaClientePortale: creaClientePortale,
        ricaricaSaldo: ricaricaSaldo,
        deduciSaldoCliente: deduciSaldoCliente,
        getClientiPortale: getClientiPortale,
        getClientePortaleById: getClientePortaleById,
        aggiornaClientePortale: aggiornaClientePortale,
        resetPasswordClienteAdmin: resetPasswordClienteAdmin,
        getMovimentiSaldo: getMovimentiSaldo,
        // Prenotazioni lavaggio
        creaPrenotazioneLavaggio: creaPrenotazioneLavaggio,
        getPrenotazioniLavaggio: getPrenotazioniLavaggio,
        aggiornaPrenotazione: aggiornaPrenotazione,
        // Prezzi cliente
        getPrezziCliente: getPrezziCliente,
        getPrezziClientePerCliente: getPrezziClientePerCliente,
        salvaPrezzoCliente: salvaPrezzoCliente,
        eliminaPrezzoCliente: eliminaPrezzoCliente,
        // Vendita da lavaggio
        salvaVenditaDaLavaggio: salvaVenditaDaLavaggio,
        getVenditaPerLavaggio: getVenditaPerLavaggio,
        // Tesoreria
        getCategorieTesoreria: getCategorieTesoreria,
        salvaCategoriaTesoreria: salvaCategoriaTesoreria,
        aggiornaCategoriaTesoreria: aggiornaCategoriaTesoreria,
        eliminaCategoriaTesoreria: eliminaCategoriaTesoreria,
        getMovimentiBanca: getMovimentiBanca,
        getHashMovimentiEsistenti: getHashMovimentiEsistenti,
        importaMovimentiBanca: importaMovimentiBanca,
        aggiornaMovimentoBanca: aggiornaMovimentoBanca,
        eliminaMovimentoBanca: eliminaMovimentoBanca,
        getUltimoSaldoBanca: getUltimoSaldoBanca,
        getPagamentiRicorrenti: getPagamentiRicorrenti,
        salvaPagamentoRicorrente: salvaPagamentoRicorrente,
        aggiornaPagamentoRicorrente: aggiornaPagamentoRicorrente,
        eliminaPagamentoRicorrente: eliminaPagamentoRicorrente,
        getPagamentiProgrammati: getPagamentiProgrammati,
        salvaPagamentoProgrammato: salvaPagamentoProgrammato,
        aggiornaPagamentoProgrammato: aggiornaPagamentoProgrammato,
        pagaPagamentoProgrammato: pagaPagamentoProgrammato,
        annullaPagamentoProgrammato: annullaPagamentoProgrammato,
        getScadenzeTesoreria: getScadenzeTesoreria,
        getCarichiCarburante: getCarichiCarburante,
        getSpeseCassaPeriodo: getSpeseCassaPeriodo,
        get4TSCardMese: get4TSCardMese,
        getCassaPeriodo: getCassaPeriodo,
        // Fatturazione
        getProssimoNumeroFattura: getProssimoNumeroFattura,
        getProssimoNumeroDocumento: getProssimoNumeroDocumento,
        getImpostazioniFatturazione: getImpostazioniFatturazione,
        salvaImpostazioniFatturazione: salvaImpostazioniFatturazione,
        getFatture: getFatture,
        getFatturaCompleta: getFatturaCompleta,
        salvaFattura: salvaFattura,
        aggiornaStatoFattura: aggiornaStatoFattura,
        annullaFattura: annullaFattura,
        getImportEniLog: getImportEniLog,
        registraImportEni: registraImportEni,
        aggiungiAliasCliente: aggiungiAliasCliente
    };
})();
