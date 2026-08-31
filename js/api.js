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

    // Delega alla RPC atomica (migration 018).
    // La vecchia versione leggeva il max lato client ordinando per TESTO:
    // superata quota 999 'LAV999' > 'LAV1000', quindi rigenerava all'infinito
    // un codice gia' esistente. Inoltre SELECT e INSERT separati permettevano
    // a due salvataggi simultanei di ottenere lo stesso codice.
    async function generaCodice(tabella, prefisso, colonnaCode) {
        colonnaCode = colonnaCode || 'codice';
        var result = await getClient().rpc('get_prossimo_codice', {
            p_prefisso: prefisso,
            p_tabella: tabella,
            p_colonna: colonnaCode
        });
        if (result.error) throw new Error(result.error.message);
        return result.data;
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

    // Elenco nomi per la schermata di login (vista senza segreti: solo nome + email tecnica)
    async function getStaffLoginList() {
        var result = await getClient()
            .from('personale_login')
            .select('nome_completo, email_tecnica')
            .order('nome_completo', { ascending: true });
        if (result.error) throw new Error(result.error.message);
        return result.data || [];
    }

    // Login staff via Supabase Auth: email tecnica + PIN (password). Ritorna l'utente app o null.
    async function loginConPin(emailTecnica, pin) {
        var auth = await getClient().auth.signInWithPassword({ email: emailTecnica, password: pin });
        if (auth.error) return null; // credenziali errate o utente inesistente
        return await getUtenteCorrente();
    }

    // Ricostruisce l'utente applicativo dalla sessione Auth corrente (o null se non loggato)
    async function getUtenteCorrente() {
        var sess = await getClient().auth.getUser();
        if (!sess.data || !sess.data.user) return null;
        var result = await getClient()
            .from('personale')
            .select('id, username, nome_completo, ruolo, super_admin')
            .eq('auth_user_id', sess.data.user.id)
            .eq('attivo', true)
            .maybeSingle();
        if (result.error || !result.data) return null;
        return result.data;
    }

    async function logoutAuth() {
        await getClient().auth.signOut();
    }

    // Cambia il PIN (password Auth) dell'utente attualmente loggato.
    // Verifica prima il PIN attuale, poi aggiorna. Ritorna true o lancia errore.
    async function cambiaPinCorrente(pinAttuale, nuovoPin) {
        var client = getClient();
        var sess = await client.auth.getUser();
        var email = (sess.data && sess.data.user) ? sess.data.user.email : null;
        if (!email) throw new Error('Sessione non valida, rifai il login');

        // Verifica il PIN attuale ri-autenticando lo stesso utente
        var check = await client.auth.signInWithPassword({ email: email, password: pinAttuale });
        if (check.error) throw new Error('PIN attuale errato');

        // Aggiorna il PIN
        var upd = await client.auth.updateUser({ password: nuovoPin });
        if (upd.error) throw new Error(upd.error.message);

        try { await scriviLog('Cambio_PIN', 'Impostazioni', 'PIN personale aggiornato'); } catch (e) { /* non bloccare */ }
        return true;
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
            .select('id, nome_ragione_sociale, targa, p_iva_coe, tipo, telefono, email, modalita_pagamento, listino_personalizzato')
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

    // Clienti abituali = quelli con un listino personalizzato configurato (per le scorciatoie nel form lavaggio)
    async function getClientiConPrezzi() {
        var result = await getClient()
            .from('clienti')
            .select('id, nome_ragione_sociale, targa, tipo, telefono, modalita_pagamento, listino_personalizzato')
            .eq('attivo', true)
            .not('listino_personalizzato', 'is', null)
            .order('nome_ragione_sociale', { ascending: true });
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
            .maybeSingle();

        if (result.error) {
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
        dati.data = data;
        var existing = await getCassaPerData(data);

        if (existing) {
            record = await update('cassa', existing.id, dati);
        } else {
            try {
                record = await insert('cassa', dati);
            } catch (e) {
                // Race multi-PC: un altro dispositivo ha creato la cassa nel frattempo
                // (l'inserimento è bloccato dal vincolo UNIQUE su data) → rileggi e aggiorna,
                // invece di creare un doppione.
                var again = await getCassaPerData(data);
                if (!again) throw e;
                record = await update('cassa', again.id, dati);
            }
        }

        await scriviLog('Chiusura_Cassa', 'Cassa',
            'Venduto: ' + ENI.UI.formatValuta(dati.totale_venduto) +
            ' - Incassato: ' + ENI.UI.formatValuta(dati.totale_incassato) +
            ' - Diff: ' + ENI.UI.formatValuta(dati.differenza)
        );

        return record;
    }

    // Salvataggio BOZZA cassa (autosalvataggio): upsert per data, senza log di chiusura.
    async function salvaBozzaCassa(dati) {
        var data = dati.data || ENI.UI.oggiISO();
        var existing = await getCassaPerData(data);
        // Non sovrascrivere mai una cassa gia' CHIUSA con una bozza.
        if (existing && existing.stato === 'chiusa') return existing;
        dati.stato = 'aperta'; // stato "in corso" (il vincolo DB ammette solo aperta/chiusa)
        dati.data = data;
        if (existing) return await update('cassa', existing.id, dati);
        try {
            return await insert('cassa', dati);
        } catch (e) {
            // Race multi-PC: creata nel frattempo (bloccato dal vincolo UNIQUE su data)
            // → rileggi e aggiorna, senza mai sovrascrivere una chiusa.
            var again = await getCassaPerData(data);
            if (!again) throw e;
            if (again.stato === 'chiusa') return again;
            return await update('cassa', again.id, dati);
        }
    }

    async function eliminaCassa(id, data) {
        await remove('cassa', id);
        await scriviLog('Eliminata_Cassa', 'Cassa', 'Data: ' + data);
        return true;
    }

    // Sposta la chiusura di cassa a un'altra data in modo ATOMICO: un solo UPDATE
    // (niente elimina+ricrea, che rischiava di perdere il record a meta').
    async function spostaCassa(id, nuovaData) {
        var result = await getClient()
            .from('cassa')
            .update({ data: nuovaData, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();
        if (result.error) throw new Error(result.error.message);
        return result.data;
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

    // Spese di cassa complete su un intervallo (per il report/riepilogo)
    async function getSpeseCassaReport(da, a) {
        var result = await getClient()
            .from('spese_cassa')
            .select('data, categoria, descrizione, importo, note')
            .gte('data', da).lte('data', a)
            .order('data', { ascending: true })
            .limit(20000);
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

    // --- Impostazioni App (feature toggle globali) ---

    // Elenco dei moduli attualmente disabilitati (nascosti dal menu). SOLO LETTURA.
    async function getModuliDisabilitati() {
        var result = await getClient()
            .from('impostazioni_app')
            .select('valore')
            .eq('chiave', 'moduli_disabilitati')
            .maybeSingle();
        if (result.error) throw new Error(result.error.message);
        var v = result.data ? result.data.valore : null;
        return Array.isArray(v) ? v : [];
    }

    // Salva l'elenco dei moduli disabilitati (upsert). Consentito solo al Super Admin dal RLS.
    async function salvaModuliDisabilitati(arr) {
        var lista = Array.isArray(arr) ? arr : [];
        var result = await getClient()
            .from('impostazioni_app')
            .upsert({ chiave: 'moduli_disabilitati', valore: lista, aggiornato_at: new Date().toISOString() }, { onConflict: 'chiave' });
        if (result.error) throw new Error(result.error.message);
        await scriviLog('Modifica_Impostazioni', 'Impostazioni', 'Moduli visibili aggiornati: ' + (lista.length ? lista.join(', ') + ' nascosti' : 'tutti visibili'));
        return true;
    }

    // Lettura generica di un'impostazione app per chiave. Ritorna il valore JSON o null. SOLO LETTURA.
    async function getImpostazioneApp(chiave) {
        var result = await getClient()
            .from('impostazioni_app')
            .select('valore')
            .eq('chiave', chiave)
            .maybeSingle();
        if (result.error) throw new Error(result.error.message);
        return result.data ? result.data.valore : null;
    }

    // Salvataggio generico di un'impostazione app (upsert). Consentito solo al Super Admin dal RLS.
    async function salvaImpostazioneApp(chiave, valore) {
        var result = await getClient()
            .from('impostazioni_app')
            .upsert({ chiave: chiave, valore: valore, aggiornato_at: new Date().toISOString() }, { onConflict: 'chiave' });
        if (result.error) throw new Error(result.error.message);
        await scriviLog('Modifica_Impostazioni', 'Impostazioni', 'Impostazione aggiornata: ' + chiave);
        return true;
    }

    // Legge l'intero contenuto di una tabella (per il backup/esporta). SOLO LETTURA.
    async function getTabellaBackup(nome) {
        var result = await getClient()
            .from(nome)
            .select('*')
            .limit(100000);
        if (result.error) throw new Error(result.error.message);
        return result.data || [];
    }

    // --- Ordine Carburante / Previsione autonomia serbatoi ---

    async function getSerbatoi() {
        var result = await getClient().from('serbatoi').select('*');
        if (result.error) throw new Error(result.error.message);
        return result.data || [];
    }

    async function salvaSerbatoio(prodottoId, dati) {
        var payload = {
            capacita_nominale: Number(dati.capacita_nominale) || 0,
            capacita_utile: Number(dati.capacita_utile) || 0,
            scorta_minima: Number(dati.scorta_minima) || 0,
            lotto_minimo: Number(dati.lotto_minimo) || 0,
            aggiornato_at: new Date().toISOString()
        };
        if (payload.capacita_utile > payload.capacita_nominale) throw new Error('La capacità utile non può superare la capacità nominale');
        if (payload.scorta_minima < 0 || payload.lotto_minimo < 0) throw new Error('Scorta minima e lotto minimo non possono essere negativi');
        if (payload.scorta_minima >= payload.capacita_utile) throw new Error('La scorta minima deve essere inferiore alla capacità utile');
        var result = await getClient().from('serbatoi').update(payload).eq('prodotto_id', prodottoId);
        if (result.error) throw new Error(result.error.message);
        await scriviLog('Modifica_Serbatoio', 'OrdineCarburante', prodottoId + ': cap.utile ' + payload.capacita_utile + ', scorta ' + payload.scorta_minima + ', lotto ' + payload.lotto_minimo);
        return true;
    }

    var _PARAM_PREV_DEFAULT = {
        finestra_giorni: 12,
        orizzonte: 21,
        modalita_media: 'auto',              // 'auto' | 'manuale'
        fattori_giorno: { '0': 0.5, '6': 0.8 }, // domenica 0.5, sabato 0.8; gli altri = 1
        media_manuale: {}                    // { prodottoId: { totale, giorni } }
    };

    async function getParametriPrevisione() {
        var result = await getClient().from('config_carburanti').select('valore').eq('chiave', 'previsione_parametri').maybeSingle();
        if (result.error) throw new Error(result.error.message);
        if (result.data && result.data.valore) {
            try { return Object.assign({}, _PARAM_PREV_DEFAULT, JSON.parse(result.data.valore)); } catch (e) {}
        }
        return Object.assign({}, _PARAM_PREV_DEFAULT);
    }

    async function salvaParametriPrevisione(param) {
        var payload = Object.assign({}, _PARAM_PREV_DEFAULT, param || {});
        if (Number(payload.finestra_giorni) <= 0) throw new Error('La finestra storica deve essere maggiore di zero');
        if (Number(payload.orizzonte) <= 0) throw new Error('L\'orizzonte di proiezione deve essere maggiore di zero');
        var result = await getClient().from('config_carburanti')
            .upsert({ chiave: 'previsione_parametri', valore: JSON.stringify(payload), updated_at: new Date().toISOString() }, { onConflict: 'chiave' });
        if (result.error) throw new Error(result.error.message);
        await scriviLog('Modifica_Parametri_Previsione', 'OrdineCarburante', 'finestra ' + payload.finestra_giorni + 'gg, orizzonte ' + payload.orizzonte + 'gg, media ' + payload.modalita_media);
        return true;
    }

    // Ultima giacenza rilevata (manuale o auto) per un prodotto
    async function getGiacenzaRilevata(prodottoId) {
        var result = await getClient().from('giacenze_rilevate')
            .select('*').eq('prodotto_id', prodottoId)
            .order('data', { ascending: false }).limit(1).maybeSingle();
        if (result.error) throw new Error(result.error.message);
        return result.data || null;
    }

    async function salvaGiacenzaRilevata(dati) {
        if (!dati.prodotto_id || !dati.data) throw new Error('Prodotto e data sono obbligatori');
        var litri = Number(dati.litri);
        if (isNaN(litri) || litri < 0) throw new Error('Litri non validi');
        var origine = dati.origine === 'auto' ? 'auto' : 'manuale';
        var result = await getClient().from('giacenze_rilevate')
            .upsert({ prodotto_id: dati.prodotto_id, data: dati.data, litri: Math.round(litri), origine: origine, note: dati.note || null }, { onConflict: 'prodotto_id,data' });
        if (result.error) throw new Error(result.error.message);
        await scriviLog('Giacenza_Rilevata', 'OrdineCarburante', dati.prodotto_id + ' ' + dati.data + ': ' + Math.round(litri) + ' L (' + origine + ')');
        return true;
    }

    // Carichi previsti (rifornimenti futuri)
    async function getCarichiPrevisti(prodottoId) {
        var q = getClient().from('carichi_previsti').select('*').order('data_prevista', { ascending: true });
        if (prodottoId) q = q.eq('prodotto_id', prodottoId);
        var result = await q;
        if (result.error) throw new Error(result.error.message);
        return result.data || [];
    }

    async function salvaCaricoPrevisto(dati) {
        if (!dati.prodotto_id || !dati.data_prevista) throw new Error('Prodotto e data prevista sono obbligatori');
        var litri = Number(dati.litri);
        if (isNaN(litri) || litri <= 0) throw new Error('I litri devono essere maggiori di zero');
        var statiValidi = ['previsto', 'confermato', 'consegnato'];
        var stato = statiValidi.indexOf(dati.stato) !== -1 ? dati.stato : 'previsto';
        var payload = {
            prodotto_id: dati.prodotto_id, data_prevista: dati.data_prevista, litri: Math.round(litri),
            stato: stato, fornitore: dati.fornitore || null, note: dati.note || null, updated_at: new Date().toISOString()
        };
        var record;
        if (dati.id) {
            var upd = await getClient().from('carichi_previsti').update(payload).eq('id', dati.id).select().single();
            if (upd.error) throw new Error(upd.error.message);
            record = upd.data;
            await scriviLog('Modifica_Carico_Previsto', 'OrdineCarburante', dati.prodotto_id + ' ' + dati.data_prevista + ': ' + payload.litri + ' L (' + stato + ')');
        } else {
            var ins = await getClient().from('carichi_previsti').insert(payload).select().single();
            if (ins.error) throw new Error(ins.error.message);
            record = ins.data;
            await scriviLog('Nuovo_Carico_Previsto', 'OrdineCarburante', dati.prodotto_id + ' ' + dati.data_prevista + ': ' + payload.litri + ' L (' + stato + ')');
        }
        return record;
    }

    async function eliminaCaricoPrevisto(id) {
        var result = await getClient().from('carichi_previsti').delete().eq('id', id);
        if (result.error) throw new Error(result.error.message);
        await scriviLog('Elimina_Carico_Previsto', 'OrdineCarburante', 'id ' + id);
        return true;
    }

    // Totale erogato (litri) per prodotto in un intervallo [da, a] — per la media automatica. SOLO LETTURA.
    async function getErogatoPeriodo(prodottoId, da, a) {
        var client = getClient();
        var vg = await client.from('vendite_giornaliere').select('id').gte('data_inizio', da).lte('data_inizio', a);
        if (vg.error) throw new Error(vg.error.message);
        var ids = (vg.data || []).map(function(r) { return r.id; });
        if (!ids.length) return { totale: 0, giorni_con_dati: 0 };
        var vp = await client.from('vendite_per_prodotto').select('litri, vendita_id').eq('prodotto_id', prodottoId).in('vendita_id', ids);
        if (vp.error) throw new Error(vp.error.message);
        var totale = 0;
        var giorniSet = {};
        (vp.data || []).forEach(function(r) {
            totale += Number(r.litri) || 0;
            if (r.vendita_id) giorniSet[r.vendita_id] = true; // conta i giorni distinti con vendita registrata
        });
        return { totale: Math.round(totale), giorni_con_dati: Object.keys(giorniSet).length };
    }

    // Giacenza fisica calcolata a oggi (riferimento + carichi − venduto), coerente col motore Marginalità. SOLO LETTURA.
    async function getGiacenzaCalcolata(prodottoId) {
        var client = getClient();
        var riferimentoLitri = 0, dataDa = null;

        var chius = await client.from('chiusure_mensili_carburante')
            .select('anno, mese, giacenza_reale').eq('prodotto_id', prodottoId)
            .order('anno', { ascending: false }).order('mese', { ascending: false }).limit(1);
        if (!chius.error && chius.data && chius.data.length) {
            riferimentoLitri = Number(chius.data[0].giacenza_reale) || 0;
            var mese = chius.data[0].mese + 1, anno = chius.data[0].anno;
            if (mese > 12) { mese = 1; anno++; }
            dataDa = anno + '-' + String(mese).padStart(2, '0') + '-01';
        } else {
            var gi = await client.from('giacenze_iniziali').select('data, litri_fisici').eq('prodotto_id', prodottoId)
                .order('data', { ascending: false }).limit(1);
            if (!gi.error && gi.data && gi.data.length) {
                riferimentoLitri = Number(gi.data[0].litri_fisici) || 0;
                dataDa = gi.data[0].data;
            }
        }

        var oggi = ENI.UI.oggiISO();
        var qCar = client.from('carichi_carburante').select('litri_fisici').eq('prodotto_id', prodottoId).lte('data', oggi);
        if (dataDa) qCar = qCar.gte('data', dataDa);
        var car = await qCar;
        var totCarichi = (car.data || []).reduce(function(s, r) { return s + (Number(r.litri_fisici) || 0); }, 0);

        var qvg = client.from('vendite_giornaliere').select('id').lte('data_inizio', oggi);
        if (dataDa) qvg = qvg.gte('data_inizio', dataDa);
        var vg2 = await qvg;
        var ids2 = (vg2.data || []).map(function(r) { return r.id; });
        var totVenduto = 0;
        if (ids2.length) {
            var vp2 = await client.from('vendite_per_prodotto').select('litri').eq('prodotto_id', prodottoId).in('vendita_id', ids2);
            totVenduto = (vp2.data || []).reduce(function(s, r) { return s + (Number(r.litri) || 0); }, 0);
        }
        return Math.round(riferimentoLitri + totCarichi - totVenduto);
    }

    // Erogato per data (litri) di un prodotto in un intervallo — per lo storico. SOLO LETTURA.
    async function getErogatoGiornaliero(prodottoId, da, a) {
        var client = getClient();
        var vg = await client.from('vendite_giornaliere').select('id, data_inizio').gte('data_inizio', da).lte('data_inizio', a);
        if (vg.error) throw new Error(vg.error.message);
        var mapDate = {}, ids = [];
        (vg.data || []).forEach(function(r) { mapDate[r.id] = r.data_inizio; ids.push(r.id); });
        if (!ids.length) return [];
        var vp = await client.from('vendite_per_prodotto').select('vendita_id, litri').eq('prodotto_id', prodottoId).in('vendita_id', ids);
        if (vp.error) throw new Error(vp.error.message);
        return (vp.data || []).map(function(r) { return { data: mapDate[r.vendita_id], litri: Number(r.litri) || 0 }; }).filter(function(x) { return x.data; });
    }

    // Consegne reali (carichi) di un prodotto in un intervallo — per lo storico. SOLO LETTURA.
    async function getConsegneStoriche(prodottoId, da, a) {
        var result = await getClient().from('carichi_carburante')
            .select('data, litri_fisici').eq('prodotto_id', prodottoId)
            .gte('data', da).lte('data', a).order('data', { ascending: true });
        if (result.error) throw new Error(result.error.message);
        return (result.data || []).map(function(r) { return { data: r.data, litri: Number(r.litri_fisici) || 0 }; });
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

    // Crea un dipendente CON login (utente Auth + riga personale) via Edge Function admin.
    async function creaStaffConLogin(dati) {
        var res = await getClient().functions.invoke('gestione-staff', { body: Object.assign({ azione: 'crea' }, dati) });
        if (res.error) throw new Error('Servizio non raggiungibile: ' + res.error.message);
        if (!res.data || !res.data.ok) throw new Error((res.data && res.data.error) || 'Errore creazione dipendente');
        await scriviLog('Creato_Staff', 'Personale', dati.nome_completo + ' (' + dati.ruolo + ')');
        return res.data.personale;
    }

    // Cambia il PIN (password Auth) di un dipendente via Edge Function admin.
    async function cambiaPinStaff(authUserId, pin) {
        var res = await getClient().functions.invoke('gestione-staff', { body: { azione: 'pin', auth_user_id: authUserId, pin: pin } });
        if (res.error) throw new Error('Servizio non raggiungibile: ' + res.error.message);
        if (!res.data || !res.data.ok) throw new Error((res.data && res.data.error) || 'Errore cambio PIN');
        await scriviLog('Cambio_PIN_Staff', 'Personale', 'auth ' + authUserId);
        return true;
    }

    // --- Richieste Ferie / Permessi ---

    async function getRichiesteFerie(filtri) {
        filtri = filtri || {};
        var q = getClient().from('richieste_ferie')
            .select('*, personale:personale_id(nome_completo, ruolo)')
            .order('data_inizio', { ascending: false });
        if (filtri.stato) q = q.eq('stato', filtri.stato);
        var result = await q;
        if (result.error) throw new Error(result.error.message);
        return result.data || [];
    }

    async function salvaRichiestaFerie(dati) {
        var result = await getClient().from('richieste_ferie')
            .insert(dati).select('*, personale:personale_id(nome_completo, ruolo)').single();
        if (result.error) throw new Error(result.error.message);
        await scriviLog('Nuova_Richiesta_Ferie', 'Ferie', (dati.tipo || 'ferie') + ' ' + dati.data_inizio + ' → ' + dati.data_fine);
        return result.data;
    }

    async function aggiornaStatoRichiestaFerie(id, stato, note) {
        var payload = {
            stato: stato,
            note_risposta: note || null,
            gestita_da: ENI.State.getUserId(),
            gestita_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
        var result = await getClient().from('richieste_ferie')
            .update(payload).eq('id', id).select('*, personale:personale_id(nome_completo, ruolo)').single();
        if (result.error) throw new Error(result.error.message);
        await scriviLog('Gestione_Richiesta_Ferie', 'Ferie', 'id ' + id + ' → ' + stato);
        return result.data;
    }

    async function eliminaRichiestaFerie(id) {
        var result = await getClient().from('richieste_ferie').delete().eq('id', id);
        if (result.error) throw new Error(result.error.message);
        await scriviLog('Elimina_Richiesta_Ferie', 'Ferie', 'id ' + id);
        return true;
    }

    // --- Turni ---

    async function getTurni(da, a) {
        var result = await getClient().from('turni')
            .select('*, personale:personale_id(nome_completo)')
            .gte('data', da).lte('data', a)
            .order('data', { ascending: true });
        if (result.error) throw new Error(result.error.message);
        return result.data || [];
    }

    // Upsert per (personale_id, data): un turno per persona al giorno
    async function salvaTurno(dati) {
        var payload = {
            personale_id: dati.personale_id,
            data: dati.data,
            tipo: dati.tipo || 'turno',
            ora_inizio: dati.ora_inizio || null,
            ora_fine: dati.ora_fine || null,
            ora_inizio_2: dati.ora_inizio_2 || null,
            ora_fine_2: dati.ora_fine_2 || null,
            note: dati.note || null,
            updated_at: new Date().toISOString()
        };
        var result = await getClient().from('turni')
            .upsert(payload, { onConflict: 'personale_id,data' }).select().single();
        if (result.error) throw new Error(result.error.message);
        return result.data;
    }

    async function eliminaTurno(personaleId, data) {
        var result = await getClient().from('turni').delete()
            .eq('personale_id', personaleId).eq('data', data);
        if (result.error) throw new Error(result.error.message);
        return true;
    }

    // --- Disponibilità (lato dipendente) ---

    async function getDisponibilita(da, a) {
        var result = await getClient().from('disponibilita')
            .select('*, personale:personale_id(nome_completo)')
            .gte('data', da).lte('data', a)
            .order('data', { ascending: true });
        if (result.error) throw new Error(result.error.message);
        return result.data || [];
    }

    async function salvaDisponibilita(dati) {
        var payload = {
            personale_id: dati.personale_id,
            data: dati.data,
            disponibile: dati.disponibile !== false,
            fascia: dati.fascia || 'indifferente',
            note: dati.note || null,
            updated_at: new Date().toISOString()
        };
        var result = await getClient().from('disponibilita')
            .upsert(payload, { onConflict: 'personale_id,data' }).select().single();
        if (result.error) throw new Error(result.error.message);
        return result.data;
    }

    async function eliminaDisponibilita(personaleId, data) {
        var result = await getClient().from('disponibilita').delete()
            .eq('personale_id', personaleId).eq('data', data);
        if (result.error) throw new Error(result.error.message);
        return true;
    }

    // --- Timbrature ---

    // Ultima timbratura di un dipendente (per capire se è dentro o fuori).
    async function getUltimaTimbratura(personaleId) {
        var result = await getClient().from('timbrature')
            .select('*')
            .eq('personale_id', personaleId)
            .order('ts', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (result.error) throw new Error(result.error.message);
        return result.data;
    }

    // Registra una timbratura per l'utente loggato (entrata/uscita).
    async function salvaTimbratura(dati) {
        var payload = {
            personale_id: dati.personale_id || ENI.State.getUserId(),
            tipo: dati.tipo,
            ts: dati.ts || new Date().toISOString(),
            data: dati.data || ENI.UI.oggiISO(),
            origine: dati.origine || 'qr'
        };
        var result = await getClient().from('timbrature')
            .insert(payload).select().single();
        if (result.error) throw new Error(result.error.message);
        return result.data;
    }

    // Tutte le timbrature in un intervallo di date (per la vista super admin).
    async function getTimbrature(da, a) {
        var result = await getClient().from('timbrature')
            .select('*, personale:personale_id(nome_completo)')
            .gte('data', da).lte('data', a)
            .order('ts', { ascending: true });
        if (result.error) throw new Error(result.error.message);
        return result.data || [];
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

    // --- Dashboard: aggregati periodo (SOLO lettura, per grafici/KPI) ---

    function _dataGiorniFa(giorni) {
        var d = new Date();
        d.setDate(d.getDate() - (giorni - 1));
        return d.toISOString().slice(0, 10);
    }

    // Vendite completate degli ultimi N giorni (per incassi + ripartizione pagamenti)
    async function getVenditePeriodo(giorni) {
        var result = await getClient()
            .from('vendite')
            .select('data, totale, importo_contanti, importo_pos, importo_buono, importo_wallet')
            .gte('data', _dataGiorniFa(giorni))
            .eq('stato', 'completata')
            .limit(10000);
        if (result.error) throw new Error(result.error.message);
        return result.data || [];
    }

    // Aggregati carburante giornalieri (litri/importo) degli ultimi N giorni
    async function getCarburantePeriodo(giorni) {
        var result = await getClient()
            .from('vendite_giornaliere')
            .select('data_inizio, litri_totali, importo_totale')
            .gte('data_inizio', _dataGiorniFa(giorni))
            .order('data_inizio', { ascending: true })
            .limit(2000);
        if (result.error) throw new Error(result.error.message);
        return result.data || [];
    }

    // Lavaggi degli ultimi N giorni (per andamento)
    async function getLavaggiPeriodo(giorni) {
        var result = await getClient()
            .from('lavaggi')
            .select('data, stato')
            .gte('data', _dataGiorniFa(giorni))
            .limit(10000);
        if (result.error) throw new Error(result.error.message);
        return result.data || [];
    }

    // Prodotti (non servizi) sotto la scorta minima
    async function getSottoScorta() {
        var result = await getClient()
            .from('magazzino')
            .select('id, codice, nome_prodotto, giacenza, giacenza_minima, categoria')
            .eq('attivo', true)
            .gt('giacenza_minima', 0)
            .limit(5000);
        if (result.error) throw new Error(result.error.message);
        return (result.data || []).filter(function(p) {
            return Number(p.giacenza) < Number(p.giacenza_minima);
        });
    }

    // Elenco crediti scaduti (per il riquadro allerte)
    async function getCreditiScaduti() {
        var result = await getClient()
            .from('crediti')
            .select('id, nome_cliente, importo, scadenza')
            .eq('stato', 'Aperto')
            .lt('scadenza', ENI.UI.oggiISO())
            .order('scadenza', { ascending: true })
            .limit(500);
        if (result.error) throw new Error(result.error.message);
        return result.data || [];
    }

    // Incassi cassa per categoria (righe vendita completate degli ultimi N giorni)
    async function getIncassiPerCategoria(giorni) {
        var result = await getClient()
            .from('vendite_dettaglio')
            .select('categoria, totale_riga, vendite!inner(data)')
            .eq('vendite.stato', 'completata')
            .gte('vendite.data', _dataGiorniFa(giorni))
            .limit(20000);
        if (result.error) throw new Error(result.error.message);
        return result.data || [];
    }

    // --- Versioni per INTERVALLO di date (da/a inclusi) per il selettore periodo ---
    async function getIncassiCategoriaRange(da, a) {
        var result = await getClient()
            .from('vendite_dettaglio')
            .select('categoria, totale_riga, vendite!inner(data)')
            .eq('vendite.stato', 'completata')
            .gte('vendite.data', da).lte('vendite.data', a)
            .limit(50000);
        if (result.error) throw new Error(result.error.message);
        return result.data || [];
    }

    async function getCarburanteRange(da, a) {
        var result = await getClient()
            .from('vendite_giornaliere')
            .select('data_inizio, litri_totali, importo_totale')
            .gte('data_inizio', da).lte('data_inizio', a)
            .order('data_inizio', { ascending: true })
            .limit(5000);
        if (result.error) throw new Error(result.error.message);
        return result.data || [];
    }

    async function getLavaggiRange(da, a) {
        var result = await getClient()
            .from('lavaggi')
            .select('data, stato')
            .gte('data', da).lte('data', a)
            .limit(50000);
        if (result.error) throw new Error(result.error.message);
        return result.data || [];
    }

    // Lavaggi su un intervallo con i campi utili al report (tipo, prezzo, stato). SOLO LETTURA.
    async function getLavaggiReport(da, a) {
        var result = await getClient()
            .from('lavaggi')
            .select('data, stato, tipo_lavaggio, prezzo, priorita, nome_cliente, veicolo')
            .gte('data', da).lte('data', a)
            .order('data', { ascending: true })
            .limit(50000);
        if (result.error) throw new Error(result.error.message);
        return result.data || [];
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
        vendita.operatore_id = ENI.State.getUserId();
        vendita.operatore_nome = ENI.State.getUserName();

        // Salvataggio ATOMICO lato DB: codice + testata + righe + scarico giacenza,
        // tutto o niente (niente vendite "a meta'"). Buono/saldo restano dopo, nel client.
        var result = await getClient().rpc('salva_vendita', {
            p_vendita: vendita,
            p_dettagli: dettagli,
            p_prefisso: ENI.Config.PREFISSI.VENDITA
        });
        if (result.error) throw new Error(result.error.message);
        var record = result.data;

        await scriviLog('Vendita', 'Vendita',
            record.codice + ' - ' + ENI.UI.formatValuta(vendita.totale) +
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

        // Ripristinare giacenza (atomico lato DB)
        var dettagli = await getVenditaDettaglio(id);
        for (var i = 0; i < dettagli.length; i++) {
            var d = dettagli[i];
            if (d.prodotto_id) {
                try {
                    await movimentaGiacenza(d.prodotto_id, d.quantita);
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
            return { totaleVendite: 0, numVendite: 0, perCategoria: {}, perMetodo: { contanti: 0, pos: 0, buono: 0, wallet: 0 }, incassoCrediti: 0 };
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

        // Categoria speciale "Incasso Credito": è un rientro di credito, non un venduto.
        // Va escluso dal totale venduto e dalle categorie, e restituito a parte.
        var CAT_INC = (ENI.Config && ENI.Config.CATEGORIA_INCASSO_CREDITO) || 'Incasso Credito';
        var incassoCrediti = Number(perCategoria[CAT_INC] || 0);
        if (perCategoria[CAT_INC]) delete perCategoria[CAT_INC];

        return {
            totaleVendite: totaleVendite - incassoCrediti,
            numVendite: vendite.length,
            perCategoria: perCategoria,
            perMetodo: perMetodo,
            incassoCrediti: incassoCrediti
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
                    await movimentaGiacenza(d.prodotto_id, d.quantita_resa);
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
        // Aggiornamento ATOMICO: marca il buono solo se e' ancora 'attivo'.
        // Se due vendite lo usano insieme, la seconda trova 0 righe -> niente doppia spendita.
        var result = await getClient()
            .from('buoni_cartacei')
            .update({
                stato: 'utilizzato',
                vendita_id: venditaId,
                utilizzato_at: new Date().toISOString(),
                utilizzato_da: ENI.State.getUserId()
            })
            .eq('id', buonoId)
            .eq('stato', 'attivo')
            .select();
        ENI.State.cacheClear('buoni');
        if (result.error) throw new Error(result.error.message);
        if (!result.data || result.data.length === 0) {
            // Nessuna riga aggiornata: il buono non era piu' attivo (gia' usato/annullato o inesistente)
            var err = new Error('Buono non piu\' attivo (gia\' utilizzato o annullato)');
            err.code = 'BUONO_NON_ATTIVO';
            throw err;
        }
        return result.data[0];
    }

    async function annullaBuono(buonoId) {
        var buono = await getById('buoni_cartacei', buonoId);
        var record = await update('buoni_cartacei', buonoId, { stato: 'annullato' });
        await scriviLog('Annullato_Buono', 'Buoni', 'EAN: ' + buono.codice_ean + ' - ' + ENI.UI.formatValuta(buono.taglio));
        ENI.State.cacheClear('buoni');
        return record;
    }

    // Movimenta la giacenza di un prodotto magazzino in modo ATOMICO lato DB
    // (giacenza = greatest(0, giacenza + delta)): niente lost-update multi-postazione.
    // delta negativo = scarico (vendita), positivo = carico (reso/annullo/rettifica).
    // Ritorna la nuova giacenza, o null se il prodotto non esiste.
    async function movimentaGiacenza(prodottoId, delta) {
        var result = await getClient().rpc('movimenta_giacenza', {
            p_prodotto_id: prodottoId,
            p_delta: delta
        });
        if (result.error) throw new Error(result.error.message);
        return result.data;
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
    // SINCRONIZZAZIONE CARICHI → COEFFICIENTE MONOFASE
    // ============================================================

    async function sincronizzaMonofaseDaCarichi(meseDate) {
        var anno = meseDate.getFullYear();
        var mese = meseDate.getMonth() + 1;
        var meseRef = anno + '-' + String(mese).padStart(2, '0') + '-01';
        var ALIQUOTA_IVA = ENI.Config.ALIQUOTA_IVA_MONOFASE || 0.21;
        var MESI = ['','Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];

        // Carica tutti i carichi di GASOLIO del mese
        var inizioMese = anno + '-' + String(mese).padStart(2, '0') + '-01';
        var fineMese = mese === 12
            ? (anno + 1) + '-01-01'
            : anno + '-' + String(mese + 1).padStart(2, '0') + '-01';

        var carichi = await getAll('carichi_carburante', {
            filters: [
                { op: 'eq', col: 'prodotto_id', val: 'gasolio' },
                { op: 'gte', col: 'data', val: inizioMese },
                { op: 'lt', col: 'data', val: fineMese }
            ],
            order: { col: 'data', asc: true }
        });

        // Rimuovi le vecchie righe monofase del mese e ricreale dai carichi
        var vecchie = await getAll('fatture_acquisto_gasolio', {
            filters: [{ op: 'eq', col: 'mese_riferimento', val: meseRef }]
        });
        for (var d = 0; d < vecchie.length; d++) {
            await remove('fatture_acquisto_gasolio', vecchie[d].id);
        }

        // Crea una riga monofase per ogni carico
        for (var i = 0; i < carichi.length; i++) {
            var c = carichi[i];
            var imponibile = Math.round(c.litri_fiscali * c.prezzo_mp * 100) / 100;
            var monofaseIvaImp = Math.round(imponibile * ALIQUOTA_IVA * 100) / 100;
            var monofaseIvaAcc = Math.round((c.litri_fiscali * c.accisa) * ALIQUOTA_IVA * 100) / 100;
            var totMonofase = Math.round((monofaseIvaImp + monofaseIvaAcc) * 100) / 100;
            var coeff = c.litri_fisici > 0 ? Math.floor((totMonofase / c.litri_fisici) * 10000) / 10000 : 0;

            await insert('fatture_acquisto_gasolio', {
                mese_riferimento: meseRef,
                numero_progressivo: i + 1,
                data_fattura: c.data,
                imponibile_fattura: imponibile,
                litri_commerciali: Math.round(c.litri_fisici),
                litri_fiscali: Math.round(c.litri_fiscali),
                accisa_per_litro: c.accisa,
                monofase_iva_imponibile: monofaseIvaImp,
                monofase_iva_accisa: monofaseIvaAcc,
                totale_monofase: totMonofase,
                monofase_media_per_lt: coeff
            });
        }

        // Aggiorna coefficiente mensile
        var totImponibile = 0, totLitriComm = 0, totMonoImp = 0, totMonoAcc = 0, totMono = 0;
        carichi.forEach(function(c) {
            var imp = Math.round(c.litri_fiscali * c.prezzo_mp * 100) / 100;
            var mImp = Math.round(imp * ALIQUOTA_IVA * 100) / 100;
            var mAcc = Math.round((c.litri_fiscali * c.accisa) * ALIQUOTA_IVA * 100) / 100;
            totImponibile += imp;
            totLitriComm += c.litri_fisici;
            totMonoImp += mImp;
            totMonoAcc += mAcc;
            totMono += mImp + mAcc;
        });
        var coeffMensile = totLitriComm > 0 ? Math.floor((totMono / totLitriComm) * 10000) / 10000 : null;

        var coeffData = {
            mese_riferimento: meseRef,
            anno: anno,
            mese: mese,
            nome_mese: MESI[mese],
            totale_imponibile: Math.round(totImponibile * 100) / 100,
            totale_litri_commerciali: Math.round(totLitriComm),
            totale_monofase_iva_imp: Math.round(totMonoImp * 100) / 100,
            totale_monofase_iva_accisa: Math.round(totMonoAcc * 100) / 100,
            totale_monofase: Math.round(totMono * 100) / 100,
            coefficiente_monofase: coeffMensile,
            numero_fatture: carichi.length
        };

        var esistente = await getAll('coefficiente_monofase_mensile', {
            filters: [{ op: 'eq', col: 'mese_riferimento', val: meseRef }],
            limit: 1
        });

        if (esistente && esistente.length > 0) {
            if (esistente[0].stato !== 'chiuso') {
                await update('coefficiente_monofase_mensile', esistente[0].id, coeffData);
            }
        } else {
            coeffData.stato = 'aperto';
            await insert('coefficiente_monofase_mensile', coeffData);
        }

        return { carichi: carichi.length, coefficiente: coeffMensile };
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
            .select('*, cliente:clienti(id, nome_ragione_sociale, p_iva_coe, email, telefono, iban, mandate_id, banca_appoggio, abi_banca, cab_banca, sede_legale_indirizzo, sede_legale_cap, sede_legale_comune, sede_legale_provincia, sede_legale_nazione, modalita_pagamento_fattura, scadenza_giorni, rif_amministrazione, applica_monofase)')
            .order('numero', { ascending: true });

        if (filtri.anno) query = query.eq('anno', filtri.anno);
        if (filtri.mese_riferimento) query = query.eq('mese_riferimento', filtri.mese_riferimento);
        if (filtri.cliente_id) query = query.eq('cliente_id', filtri.cliente_id);
        if (filtri.stato) query = query.eq('stato', filtri.stato);
        if (filtri.modalita_in) query = query.in('modalita_pagamento', filtri.modalita_in);
        if (filtri.tipo) query = query.eq('tipo', filtri.tipo);
        if (filtri.tipo_documento) query = query.eq('tipo_documento', filtri.tipo_documento);
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
        fattura.utente_creazione = ENI.State.getUserId();

        // Salvataggio ATOMICO lato DB: numero progressivo + testata + righe +
        // movimenti in un'unica transazione (niente fatture "a meta'" ne' numeri
        // fiscali sprecati). La logica del numero (formattato, 'R' ricevute) e'
        // replicata nella RPC salva_fattura.
        var result = await getClient().rpc('salva_fattura', {
            p_fattura: fattura,
            p_righe: righe || [],
            p_movimenti: movimenti || []
        });
        if (result.error) throw new Error(result.error.message);
        var f = result.data;

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

    // Eliminazione fisica multipla — consentita SOLO per fatture BOZZA.
    // I record collegati (fatture_righe, fatture_movimenti) vengono cancellati a cascata via FK.
    // Dopo l'eliminazione, i log import_eni rimasti senza fatture vengono rimossi.
    async function eliminaFatture(ids) {
        if (!ids || !ids.length) return { eliminate: 0, logRimossi: 0 };
        var sb = getClient();

        // 1. Verifica server-side: tutti gli id devono essere BOZZA
        var check = await sb
            .from('fatture')
            .select('id, stato, mese_riferimento, anno_riferimento, import_eni_log_id, numero_formattato')
            .in('id', ids);
        if (check.error) throw new Error(check.error.message);
        var trovate = check.data || [];
        if (trovate.length !== ids.length) {
            throw new Error('Alcune fatture non sono state trovate');
        }
        var nonBozza = trovate.filter(function(f) { return f.stato !== 'BOZZA'; });
        if (nonBozza.length) {
            throw new Error('Eliminazione bloccata: ' + nonBozza.length + ' fatture non sono in stato BOZZA (numeri: ' +
                nonBozza.slice(0, 5).map(function(f) { return f.numero_formattato || f.id; }).join(', ') + ')');
        }

        // 2. Cancella le fatture (cascade pulisce righe e movimenti)
        var del = await sb.from('fatture').delete().in('id', ids);
        if (del.error) throw new Error(del.error.message);

        // 3. Auto-cleanup log import_eni: per ogni mese/anno toccato, se non ci sono piu' fatture rimuovi il log
        var periodi = {};
        trovate.forEach(function(f) {
            if (f.mese_riferimento && f.anno_riferimento) {
                periodi[f.mese_riferimento + '/' + f.anno_riferimento] = {
                    mese: f.mese_riferimento, anno: f.anno_riferimento
                };
            }
        });
        var logRimossi = 0;
        for (var k in periodi) {
            var p = periodi[k];
            var rest = await sb.from('fatture').select('id', { count: 'exact', head: true })
                .eq('mese_riferimento', p.mese).eq('anno_riferimento', p.anno);
            if (rest.error) continue;
            if ((rest.count || 0) === 0) {
                var dlog = await sb.from('import_eni_log').delete().eq('mese', p.mese).eq('anno', p.anno);
                if (!dlog.error) logRimossi++;
            }
        }

        await scriviLog('Eliminate ' + trovate.length + ' bozze in batch', 'fatturazione', { count: trovate.length });
        return { eliminate: trovate.length, logRimossi: logRimossi };
    }

    async function aggiornaFattura(id, dati, righe) {
        dati.updated_at = new Date().toISOString();
        var result = await getClient().from('fatture').update(dati).eq('id', id).select().single();
        if (result.error) throw new Error(result.error.message);

        if (righe) {
            await getClient().from('fatture_righe').delete().eq('fattura_id', id);
            if (righe.length) {
                var righeConId = righe.map(function(r, i) {
                    return Object.assign({}, r, { fattura_id: id, ordine: r.ordine != null ? r.ordine : i });
                });
                var rr = await getClient().from('fatture_righe').insert(righeConId);
                if (rr.error) throw new Error(rr.error.message);
            }
        }

        await scriviLog('Modificata fattura ' + result.data.numero_formattato, 'fatturazione', { fattura_id: id });
        return result.data;
    }

    async function annullaERiemetti(id, nuovoTipoDocumento) {
        var full = await getFatturaCompleta(id);
        var f = full.fattura;

        await annullaFattura(id, 'Annullata per riemissione come ' + nuovoTipoDocumento);

        var nuova = {
            data_emissione: new Date().toISOString().slice(0, 10),
            data_scadenza: f.data_scadenza,
            cliente_id: f.cliente_id,
            tipo: f.tipo,
            tipo_documento: nuovoTipoDocumento,
            mese_riferimento: f.mese_riferimento,
            anno_riferimento: f.anno_riferimento,
            totale: f.totale,
            monofase_coefficiente: f.monofase_coefficiente,
            monofase_importo: f.monofase_importo,
            monofase_mese: f.monofase_mese,
            monofase_anno: f.monofase_anno,
            modalita_pagamento: f.modalita_pagamento,
            iban_beneficiario: f.iban_beneficiario,
            stato: 'EMESSA',
            note: f.note,
            rif_amministrazione: f.rif_amministrazione,
            import_eni_log_id: f.import_eni_log_id
        };

        // Documenti senza anagrafica: riporta l'intestatario libero
        if (f.intestatario_nome) {
            nuova.intestatario_nome = f.intestatario_nome;
            nuova.intestatario_indirizzo = f.intestatario_indirizzo;
            nuova.intestatario_cf = f.intestatario_cf;
        }

        var righe = full.righe.map(function(r) {
            return { descrizione: r.descrizione, quantita: r.quantita, unita_misura: r.unita_misura, prezzo_unitario: r.prezzo_unitario, importo: r.importo, categoria: r.categoria, ordine: r.ordine };
        });
        var movimenti = full.movimenti.map(function(m) {
            return { data_movimento: m.data_movimento, scontrino: m.scontrino, id_transazione: m.id_transazione, targa: m.targa, autista: m.autista, num_carta: m.num_carta, prodotto: m.prodotto, tipo_servizio: m.tipo_servizio, prezzo_unitario: m.prezzo_unitario, volume: m.volume, importo: m.importo, categoria: m.categoria };
        });

        var result = await salvaFattura(nuova, righe, movimenti.length ? movimenti : null);
        return result;
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

    // ============================================================
    // EXPORT BANCARI LOG (RID/RIBA)
    // ============================================================
    async function getExportBancariLog(mese, anno) {
        var r = await getClient()
            .from('export_bancari_log')
            .select('*')
            .eq('mese', mese)
            .eq('anno', anno);
        if (r.error) throw new Error(r.error.message);
        return r.data || [];
    }

    // Tutte le fatture RID/RIBA emesse che rischiano di non essere incassate, su ogni mese.
    // Due situazioni distinte, restituite insieme:
    //  - 'non_partita'  : il file per quel mese e' gia' stato generato e la fattura NON e'
    //                     fra i fatture_ids del log, quindi in banca non e' mai arrivata.
    //                     E' il contenuto reale del tracciato, non una deduzione.
    //  - 'da_esportare' : il mese non e' ancora stato esportato. Qui la fattura e' solo
    //                     "candidata": sta al chiamante scartare quelle con dati a posto,
    //                     perche' la regola di esportabilita' vive nel modulo export.
    // LIMITE: dice cosa non e' (o non sara') inviato, non cosa non e' stato incassato —
    // gli esiti/insoluti restituiti dalla banca non vengono importati.
    async function getDisposizioniNonPartite() {
        var r = await getClient().from('export_bancari_log').select('*');
        if (r.error) throw new Error(r.error.message);

        // Indicizza i log per periodo+tipo: un solo passaggio sulle fatture, nessuna query per mese.
        var perChiave = {};
        (r.data || []).forEach(function(log) { perChiave[log.anno + '-' + log.mese + '-' + log.tipo] = log; });

        var fatture = await getFatture({
            stato: 'EMESSA',
            modalita_in: ['RID_SDD', 'RIBA']
        });

        var out = [];
        fatture.forEach(function(f) {
            var tipo = f.modalita_pagamento === 'RID_SDD' ? 'RID' : 'RIBA';
            var log = perChiave[f.anno + '-' + f.mese_riferimento + '-' + tipo];

            if (!log) {
                out.push({ situazione: 'da_esportare', tipo: tipo, mese: f.mese_riferimento, anno: f.anno, fattura: f });
                return;
            }
            // Log senza dettaglio (versioni precedenti): non deducibile, meglio tacere che
            // segnalare come "non partite" fatture che in realta' sono passate.
            var ids = log.fatture_ids || [];
            if (!ids.length) return;
            if (ids.indexOf(f.id) !== -1) return;

            out.push({ situazione: 'non_partita', tipo: tipo, mese: f.mese_riferimento, anno: f.anno,
                       esportato_at: log.prima_export_at, fattura: f });
        });

        out.sort(function(a, b) { return (b.anno - a.anno) || (b.mese - a.mese); });
        return out;
    }

    // Upsert: incrementa num_export se gia' esiste, altrimenti crea con num_export=1
    async function upsertExportBancariLog(data) {
        // data: { tipo, mese, anno, num_disposizioni, totale, banca_iban, fatture_ids }
        var sb = getClient();
        var existing = await sb.from('export_bancari_log')
            .select('id, num_export')
            .eq('tipo', data.tipo).eq('mese', data.mese).eq('anno', data.anno)
            .maybeSingle();
        if (existing.error && existing.error.code !== 'PGRST116') throw new Error(existing.error.message);
        var now = new Date().toISOString();
        if (existing.data) {
            var upd = await sb.from('export_bancari_log').update({
                ultima_export_at: now,
                num_export: (existing.data.num_export || 1) + 1,
                num_disposizioni: data.num_disposizioni,
                totale: data.totale,
                banca_iban: data.banca_iban,
                fatture_ids: data.fatture_ids
            }).eq('id', existing.data.id).select().single();
            if (upd.error) throw new Error(upd.error.message);
            return upd.data;
        } else {
            var ins = await sb.from('export_bancari_log').insert({
                tipo: data.tipo, mese: data.mese, anno: data.anno,
                num_disposizioni: data.num_disposizioni,
                totale: data.totale,
                banca_iban: data.banca_iban,
                fatture_ids: data.fatture_ids
            }).select().single();
            if (ins.error) throw new Error(ins.error.message);
            return ins.data;
        }
    }

    // ===================================================================
    // SMAC - Riepilogo mensile transato carta SMAC (San Marino)
    // ===================================================================

    async function getRiepilogoSmac(filtri) {
        filtri = filtri || {};
        var query = getClient()
            .from('smac_riepilogo')
            .select('*')
            .order('anno', { ascending: false })
            .order('mese', { ascending: false });
        if (filtri.anno) query = query.eq('anno', filtri.anno);
        if (filtri.limit) query = query.limit(filtri.limit);
        var r = await query;
        if (r.error) throw new Error(r.error.message);
        return r.data || [];
    }

    async function getRiepilogoSmacByMese(mese, anno) {
        var r = await getClient()
            .from('smac_riepilogo')
            .select('*')
            .eq('mese', mese).eq('anno', anno)
            .maybeSingle();
        if (r.error && r.error.code !== 'PGRST116') throw new Error(r.error.message);
        return r.data || null;
    }

    // Upsert su (mese, anno): se esiste sovrascrive, altrimenti crea
    async function salvaRiepilogoSmac(data) {
        var sb = getClient();
        var existing = await sb.from('smac_riepilogo')
            .select('id')
            .eq('mese', data.mese).eq('anno', data.anno)
            .maybeSingle();
        if (existing.error && existing.error.code !== 'PGRST116') throw new Error(existing.error.message);
        var payload = Object.assign({}, data, { updated_at: new Date().toISOString() });
        if (existing.data) {
            var upd = await sb.from('smac_riepilogo').update(payload).eq('id', existing.data.id).select().single();
            if (upd.error) throw new Error(upd.error.message);
            return { record: upd.data, updated: true };
        } else {
            var ins = await sb.from('smac_riepilogo').insert(payload).select().single();
            if (ins.error) throw new Error(ins.error.message);
            return { record: ins.data, updated: false };
        }
    }

    async function eliminaRiepilogoSmac(id) {
        var r = await getClient().from('smac_riepilogo').delete().eq('id', id);
        if (r.error) throw new Error(r.error.message);
        return true;
    }

    /**
     * Calcola la riconciliazione SMAC per il mese indicato.
     * Ritorna { venduto, fatturato, ricarica_smac, limite, verdetto, riepilogo }.
     * verdetto: 'OK' | 'MARGINE' | 'SANZIONE' | 'NO_SMAC'
     */
    async function getRiconciliazioneSmac(mese, anno) {
        var primoGiorno = anno + '-' + String(mese).padStart(2, '0') + '-01';
        var ultimaData = new Date(anno, mese, 0);
        var ultimoGiorno = ultimaData.getFullYear() + '-' +
            String(ultimaData.getMonth() + 1).padStart(2, '0') + '-' +
            String(ultimaData.getDate()).padStart(2, '0');

        var sb = getClient();

        // 3 query in parallelo
        var results = await Promise.all([
            sb.from('vendite_giornaliere')
                .select('importo_totale,litri_totali,data_inizio,data_fine')
                .gte('data_inizio', primoGiorno)
                .lte('data_inizio', ultimoGiorno),
            sb.from('fatture')
                .select('totale,numero,data_emissione,tipo_documento,stato')
                .eq('tipo_documento', 'FATTURA')
                .in('stato', ['EMESSA', 'PAGATA'])
                .gte('data_emissione', primoGiorno)
                .lte('data_emissione', ultimoGiorno),
            sb.from('smac_riepilogo')
                .select('*')
                .eq('mese', mese).eq('anno', anno)
                .maybeSingle()
        ]);

        if (results[0].error) throw new Error('Vendite: ' + results[0].error.message);
        if (results[1].error) throw new Error('Fatture: ' + results[1].error.message);
        if (results[2].error && results[2].error.code !== 'PGRST116') {
            throw new Error('SMAC: ' + results[2].error.message);
        }

        var vendite = results[0].data || [];
        var fatture = results[1].data || [];
        var riepilogo = results[2].data || null;

        var venduto = 0, litri = 0;
        vendite.forEach(function(v) {
            venduto += parseFloat(v.importo_totale) || 0;
            litri += parseFloat(v.litri_totali) || 0;
        });

        var fatturato = 0;
        fatture.forEach(function(f) { fatturato += parseFloat(f.totale) || 0; });

        var ricarica_smac = 0;
        if (riepilogo) {
            ricarica_smac = (parseFloat(riepilogo.fis_imp_ricarica) || 0) +
                            (parseFloat(riepilogo.dem_imp_ricarica) || 0);
        }

        var limite = venduto - fatturato;
        var TOLL = 0.01;
        var verdetto;
        if (!riepilogo) {
            verdetto = 'NO_SMAC';
        } else if (ricarica_smac > limite + TOLL) {
            verdetto = 'SANZIONE';
        } else if (ricarica_smac < limite - TOLL) {
            verdetto = 'MARGINE';
        } else {
            verdetto = 'OK';
        }

        return {
            mese: mese,
            anno: anno,
            data_inizio: primoGiorno,
            data_fine: ultimoGiorno,
            venduto: venduto,
            litri_venduti: litri,
            num_giorni_vendite: vendite.length,
            fatturato: fatturato,
            num_fatture: fatture.length,
            ricarica_smac: ricarica_smac,
            limite: limite,
            differenza: limite - ricarica_smac,  // positivo = margine, negativo = sanzione
            verdetto: verdetto,
            riepilogo: riepilogo
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
        getStaffLoginList: getStaffLoginList,
        loginConPin: loginConPin,
        cambiaPinCorrente: cambiaPinCorrente,
        getUtenteCorrente: getUtenteCorrente,
        logoutAuth: logoutAuth,
        getClienti: getClienti,
        salvaCliente: salvaCliente,
        aggiornaCliente: aggiornaCliente,
        cercaClienti: cercaClienti,
        getClientiConPrezzi: getClientiConPrezzi,
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
        salvaBozzaCassa: salvaBozzaCassa,
        spostaCassa: spostaCassa,
        eliminaCassa: eliminaCassa,
        getSpeseCassa: getSpeseCassa,
        getSpeseCassaReport: getSpeseCassaReport,
        salvaSpesa: salvaSpesa,
        eliminaSpesa: eliminaSpesa,
        getModuliDisabilitati: getModuliDisabilitati,
        salvaModuliDisabilitati: salvaModuliDisabilitati,
        getImpostazioneApp: getImpostazioneApp,
        salvaImpostazioneApp: salvaImpostazioneApp,
        getTabellaBackup: getTabellaBackup,
        getSerbatoi: getSerbatoi,
        salvaSerbatoio: salvaSerbatoio,
        getParametriPrevisione: getParametriPrevisione,
        salvaParametriPrevisione: salvaParametriPrevisione,
        getGiacenzaRilevata: getGiacenzaRilevata,
        salvaGiacenzaRilevata: salvaGiacenzaRilevata,
        getCarichiPrevisti: getCarichiPrevisti,
        salvaCaricoPrevisto: salvaCaricoPrevisto,
        eliminaCaricoPrevisto: eliminaCaricoPrevisto,
        getErogatoPeriodo: getErogatoPeriodo,
        getGiacenzaCalcolata: getGiacenzaCalcolata,
        getErogatoGiornaliero: getErogatoGiornaliero,
        getConsegneStoriche: getConsegneStoriche,
        getMagazzino: getMagazzino,
        salvaProdotto: salvaProdotto,
        aggiornaProdotto: aggiornaProdotto,
        getManutenzioni: getManutenzioni,
        salvaManutenzione: salvaManutenzione,
        getPersonale: getPersonale,
        salvaPersonale: salvaPersonale,
        creaStaffConLogin: creaStaffConLogin,
        cambiaPinStaff: cambiaPinStaff,
        getRichiesteFerie: getRichiesteFerie,
        salvaRichiestaFerie: salvaRichiestaFerie,
        aggiornaStatoRichiestaFerie: aggiornaStatoRichiestaFerie,
        eliminaRichiestaFerie: eliminaRichiestaFerie,
        getTurni: getTurni,
        salvaTurno: salvaTurno,
        eliminaTurno: eliminaTurno,
        getDisponibilita: getDisponibilita,
        salvaDisponibilita: salvaDisponibilita,
        eliminaDisponibilita: eliminaDisponibilita,
        getUltimaTimbratura: getUltimaTimbratura,
        salvaTimbratura: salvaTimbratura,
        getTimbrature: getTimbrature,
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
        getVenditePeriodo: getVenditePeriodo,
        getCarburantePeriodo: getCarburantePeriodo,
        getLavaggiPeriodo: getLavaggiPeriodo,
        getSottoScorta: getSottoScorta,
        getCreditiScaduti: getCreditiScaduti,
        getIncassiPerCategoria: getIncassiPerCategoria,
        getIncassiCategoriaRange: getIncassiCategoriaRange,
        getCarburanteRange: getCarburanteRange,
        getLavaggiRange: getLavaggiRange,
        getLavaggiReport: getLavaggiReport,
        salvaReso: salvaReso,
        getResiPerVendita: getResiPerVendita,
        // Buoni cartacei
        cercaBuonoByEAN: cercaBuonoByEAN,
        generaBuoniCartacei: generaBuoniCartacei,
        utilizzaBuono: utilizzaBuono,
        movimentaGiacenza: movimentaGiacenza,
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
        // Monofase sync
        sincronizzaMonofaseDaCarichi: sincronizzaMonofaseDaCarichi,
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
        eliminaFatture: eliminaFatture,
        aggiornaFattura: aggiornaFattura,
        annullaERiemetti: annullaERiemetti,
        getImportEniLog: getImportEniLog,
        registraImportEni: registraImportEni,
        aggiungiAliasCliente: aggiungiAliasCliente,
        getExportBancariLog: getExportBancariLog,
        getDisposizioniNonPartite: getDisposizioniNonPartite,
        upsertExportBancariLog: upsertExportBancariLog,
        // SMAC
        getRiepilogoSmac: getRiepilogoSmac,
        getRiepilogoSmacByMese: getRiepilogoSmacByMese,
        salvaRiepilogoSmac: salvaRiepilogoSmac,
        eliminaRiepilogoSmac: eliminaRiepilogoSmac,
        getRiconciliazioneSmac: getRiconciliazioneSmac
    };
})();
