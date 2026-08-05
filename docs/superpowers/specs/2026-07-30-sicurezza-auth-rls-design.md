# Specifica — Fase 1: Sicurezza (Supabase Auth + RLS reali)

**Data:** 2026-07-30
**Progetto:** Gestionale Titanwash (stazione ENI, Borgo Maggiore – San Marino)
**Autore:** sviluppatore + titolare
**Stato:** in revisione

---

## 1. Contesto e problema

Il database Supabase è oggi **di fatto aperto a Internet**:

- La repository è **pubblica** e contiene la `SUPABASE_ANON_KEY` (`js/config.js`).
- Delle ~47 tabelle: 12 hanno la Row Level Security (RLS) **disattivata**, le altre 35 hanno policy `USING(true)` per il ruolo `public` → tutte lette/scritte da chiunque abbia la anon key.
- La tabella `personale` contiene i **PIN in chiaro** (colonna `pin`), leggibili da chiunque.
- Autenticazione e permessi (`ENI.Config.RUOLI`, `ENI.State.canWrite`) sono **solo controlli JavaScript** lato browser: il database non applica nulla.
- Advisor ufficiali di Supabase: 68 problemi (12 `rls_disabled`, 1 `sensitive_columns_exposed`, 36 `rls_policy_always_true`, 10 funzioni `SECURITY DEFINER` eseguibili da anon/authenticated, 9 con `search_path` mutabile).

Chiunque su Internet può oggi leggere tutte le vendite, i dati dei 251 clienti, i PIN dei dipendenti, e **modificare** dati finanziari.

**Backup completo effettuato** (Fase 0) in `backups/backup_YYYYMMDD_HHMMSS/` (48 tabelle, 12.187 righe). Rifare un backup fresco prima di ogni migrazione.

## 2. Obiettivo della Fase 1

Chiudere il buco: il database deve dare accesso **solo a utenti autenticati** e **solo a ciò che il loro ruolo consente**. La anon key pubblica, da sola, deve diventare inutile.

**Non in scope in questa fase** (rimandati):
- Bonifica XSS sui ~245 `innerHTML` → Fase 1d (coda della stessa fase, dopo l'auth).
- RPC atomiche per denaro/giacenze (lost-update, doppia spendita) → **Fase 2**.
- Correttezza fiscale (costanti storicizzate, parser unificato) → **Fase 3**.
- Pannello self-service per modificare i permessi voce-per-voce → futuro, se richiesto (le fondamenta dati sono predisposte, vedi §6.5).

## 3. Decisioni prese (con il titolare)

| # | Decisione | Scelta |
|---|-----------|--------|
| D1 | Connettore DB | Supabase MCP (già attivo, `--read-only` finché non si dà l'ok scrittura) |
| D2 | Autenticazione | **Supabase Auth**, **un account per dipendente** (ruoli applicati dal DB) |
| D3 | Login quotidiano staff | **Tocca il nome + PIN a 6 cifre** (PIN = credenziale personale, cifrata da Supabase) |
| D4 | Ruoli | Restano **Admin / Cassiere / Lavaggi**, assegnati dal titolare; modificabili in futuro via migrazione |
| D5 | Portale clienti | **Migrato ora** a Supabase Auth (reset delle 3 password); ogni cliente vede solo i propri dati |

## 4. Architettura dell'identità

### 4.1 Utenti Supabase Auth
Ogni dipendente e ogni cliente-portale diventa un utente in `auth.users`.

- **Staff (6 utenti):** email sintetica derivata dallo username, es. `mario@staff.titanwash.local` (l'email non serve al login visibile; serve solo come identificativo tecnico per Supabase Auth). Password = PIN a 6 cifre. Utenti creati con `email_confirm: true` (nessuna email di conferma).
- **Clienti portale (3 utenti):** email = `clienti_portale.email` (già presente). Password = nuova password impostata alla migrazione.

### 4.2 Collegamento identità ↔ tabelle applicative
Non si toccano le chiavi primarie esistenti (referenziate ovunque). Si aggiunge una colonna di collegamento:

- `personale.auth_user_id uuid UNIQUE` → `auth.users(id)`
- `clienti_portale.auth_user_id uuid UNIQUE` → `auth.users(id)`

### 4.3 Funzioni helper per la RLS
Funzioni `SECURITY DEFINER`, `STABLE`, con `SET search_path = public` (evitano ricorsione RLS e privilege escalation):

```sql
public.is_staff()            -> boolean  -- esiste personale attivo con auth_user_id = auth.uid()
public.staff_role()          -> text     -- 'Admin' | 'Cassiere' | 'Lavaggi' | NULL
public.current_cliente_id()  -> uuid     -- id di clienti_portale collegato all'utente, o NULL
```

Le policy RLS chiamano queste funzioni invece di ripetere sottoquery.

## 5. Login staff (nome + PIN)

### 5.1 Flusso
1. La schermata di login mostra i **nomi dei dipendenti attivi** (elenco letto da una vista/RPC pubblica che espone SOLO `nome_completo` + email tecnica, **mai** il PIN — vedi §5.3).
2. L'operatore tocca il proprio nome → compare la tastierina PIN (6 cifre).
3. L'app chiama `supabase.auth.signInWithPassword({ email: <email tecnica del dipendente>, password: <PIN> })`.
4. Sessione stabilita → il client Supabase allega automaticamente il JWT a **tutte** le chiamate `.from(...)` successive. Da qui il database applica i permessi.
5. `ENI.State` viene popolato leggendo la propria riga `personale` (nome, ruolo) via query autenticata.

### 5.2 Impostazioni Supabase Auth necessarie
- Lunghezza minima password: **≤ 6** (per accettare i PIN a 6 cifre).
- **Protezione "leaked password" (HaveIBeenPwned): disattivata** per questi account — un PIN numerico comune verrebbe altrimenti rifiutato. Il fattore di protezione contro brute-force è il **rate-limiting** integrato di Supabase Auth sull'endpoint token, non l'entropia del PIN.
- Email confirmation: non richiesta (utenti creati già confermati).

### 5.3 Elenco nomi al login senza esporre segreti
Serve mostrare i nomi **prima** del login (utente non ancora autenticato = ruolo `anon`). Si espone una **vista dedicata** `personale_login` (solo `nome_completo`, email tecnica, `attivo`) con `SELECT` concesso ad `anon`; la tabella `personale` completa resta chiusa. La vista **non** contiene PIN né altri dati sensibili.

### 5.4 Fine del PIN in chiaro
Dopo la migrazione, la colonna `personale.pin` viene **rimossa** (il segreto vive solo, cifrato, in `auth.users`). `ENI.API.loginByPin` viene sostituita dal flusso §5.1.

## 6. Ruoli e permessi (applicati dal database)

### 6.1 Ruoli attuali (fonte: `js/config.js` → `RUOLI`)
- **Admin:** tutti i moduli, scrittura ovunque tranne `dashboard`/`log`.
- **Cassiere:** legge `dashboard, clienti, cassa, spese, crediti, lavaggi, vendita, magazzino, buoni`; scrive `cassa, spese, crediti, lavaggi, vendita, magazzino, buoni`.
- **Lavaggi:** legge `dashboard, clienti, lavaggi`; scrive `lavaggi`.

### 6.2 Mappa modulo → tabelle (base per le policy)
| Modulo | Tabelle principali |
|--------|--------------------|
| clienti | `clienti` |
| cassa | `cassa` |
| spese | `spese_cassa` |
| crediti | `crediti` |
| lavaggi | `lavaggi`, `listino_lavaggi`, `prenotazioni_lavaggio` |
| vendita | `vendite`, `vendite_dettaglio`, `resi`, `resi_dettaglio` |
| magazzino | `magazzino` |
| buoni | `buoni_cartacei`, `clienti_portale`, `movimenti_saldo` |
| coefficiente-monofase | `coefficiente_monofase_mensile` |
| marginalita-carburante | `prezzi_pompa`, `carichi_carburante`, `prodotti_carburante`, `giacenze_iniziali`, `config_carburanti`, `chiusure_mensili_carburante`, `conguagli_eni`, `rimborsi_stato`, `accise_storico`, `fatture_acquisto_gasolio`, `parametri_fiscali`, `vendite_per_prodotto`, `import_eni_log` |
| tesoreria | `movimenti_banca`, `categorie_tesoreria`, `pagamenti_programmati`, `pagamenti_ricorrenti`, `export_bancari_log` |
| fatturazione | `fatture`, `fatture_righe`, `fatture_movimenti`, `impostazioni_fatturazione`, `fatturazione_progressivo` |
| smac | `smac_riepilogo` |
| personale | `personale` |
| manutenzioni | `manutenzioni` |
| dashboard | `dashboard_giornaliero`, `vendite_giornaliere` (aggregati) |
| log | `log_attivita` |
| impostazioni | `codici_progressivo`, tabelle di config |

### 6.3 Strategia RLS per tabella
Per ogni tabella si genera, in base al ruolo:
- **SELECT:** consentito ai ruoli il cui modulo include la tabella.
- **INSERT/UPDATE/DELETE:** consentito ai ruoli che hanno il modulo in `scrivere`.

Espressa via helper: `USING (public.staff_role() = ANY (ARRAY['Admin','Cassiere']))` ecc.

### 6.4 Casi particolari (da risolvere nelle bozze di migrazione)
- **`log_attivita`:** INSERT consentito a **ogni** staff autenticato (tutti scrivono log di login/azioni); SELECT solo **Admin** (modulo `log`).
- **Tabelle condivise tra moduli** (una stessa tabella richiamata da moduli con permessi diversi): la lettura prende l'unione dei ruoli, **ma** le tabelle finanziarie sensibili non vanno esposte ai ruoli bassi. Per la dashboard dei ruoli bassi si usano solo gli aggregati non sensibili (`dashboard_giornaliero`, `vendite_giornaliere`), che è già ciò che l'app mostra oggi a Cassiere/Lavaggi. Ogni conflitto va deciso esplicitamente nella bozza.
- **Progressivi** (`codici_progressivo`, `fatturazione_progressivo`, `fatture_movimenti` via RPC): le scritture passano da RPC `SECURITY DEFINER` (già atomiche) che bypassano la RLS; le policy di tabella possono restare restrittive.
- **`clienti`:** letta da tutti e tre i ruoli (tutti hanno `clienti` in `moduli`), scritta solo da Admin/Cassiere (Lavaggi ha `clienti` in lettura ma non in `scrivere`).

### 6.5 Predisposizione per modifiche future (D4)
I ruoli restano `Admin/Cassiere/Lavaggi` in `personale.ruolo` (unica fonte di verità, letta da `staff_role()`).
- **Assegnare un ruolo a un dipendente:** modificabile subito dall'app (menù nella scheda dipendente) → effetto immediato, nessuna migrazione.
- **Cambiare cosa può fare un ruolo:** raro → piccola migrazione su richiesta. Non si costruisce ora un pannello granulare (YAGNI). Le policy restano centralizzate e leggibili per rendere facile un'eventuale evoluzione a permessi guidati da tabella.

## 7. Gestione dipendenti e clienti (creazione/reset password)

Cambiare/creare la password di **un altro** utente Auth richiede la `service_role` (non disponibile lato client). Serve quindi un punto server-side.

### 7.1 Edge Function `staff-admin`
Una Supabase Edge Function con `service_role`, che:
1. Verifica dal JWT del chiamante che sia **Admin** (`staff_role() = 'Admin'`).
2. Espone operazioni: `crea_dipendente`, `reset_pin_dipendente`, `disattiva_dipendente`, `crea_cliente_portale`, `reset_password_cliente`.
3. Usa `auth.admin.createUser` / `auth.admin.updateUserById` e allinea le righe `personale` / `clienti_portale`.

**Il segreto `service_role` vive SOLO nella Edge Function (variabile d'ambiente Supabase), mai nel client né nella repo.**

### 7.2 Cambio PIN da parte del dipendente stesso
Un dipendente loggato può cambiare il **proprio** PIN con `supabase.auth.updateUser({ password })` — nessuna Edge Function necessaria.

### 7.3 RPC esistenti da ricablare
`crea_cliente_portale`, `reset_password_cliente_admin`, `login_cliente` oggi gestiscono `password_hash` in `clienti_portale`. Dopo la migrazione l'autenticazione dei clienti passa a Supabase Auth: queste vanno reindirizzate alla Edge Function / `signInWithPassword`, e la colonna `clienti_portale.password_hash` viene dismessa.

## 8. Portale clienti (migrazione)

1. Per ognuno dei 3 `clienti_portale`: creare utente Auth (email esistente), impostare **nuova password**, salvare `auth_user_id`.
2. Login portale: sostituire `ENI.API.loginCliente` (RPC) con `supabase.auth.signInWithPassword`.
3. RLS tabelle portale:
   - `clienti_portale`: il cliente legge/aggiorna **solo la propria** riga (`auth_user_id = auth.uid()`); lo staff (`is_staff()`) legge secondo il modulo `buoni`.
   - `movimenti_saldo`: il cliente legge solo i propri (`cliente_portale_id = public.current_cliente_id()`); staff pieno.
   - `listino_lavaggi`: lettura per ogni utente autenticato (staff + clienti).
   - `prenotazioni_lavaggio`: il cliente inserisce/legge solo le proprie; staff pieno.
4. Le funzioni saldo (`ricarica_saldo`, `deduci_saldo`) restano RPC `SECURITY DEFINER` (già con lock).
5. **Azione richiesta al titolare:** comunicare ai 3 clienti la nuova password.

## 9. Hardening funzioni SECURITY DEFINER

- Aggiungere `SET search_path = public` alle 9 funzioni segnalate (`function_search_path_mutable`).
- `REVOKE EXECUTE ... FROM anon` sulle funzioni che non devono essere pubbliche (10 segnalate); mantenere l'esecuzione solo dove serve (es. `login`-correlate) e comunque con controlli interni.

## 10. Modifiche al codice client (poche e mirate)

| File | Modifica |
|------|----------|
| `js/api.js` | Rimuovere `loginByPin`; ricablare `loginCliente`, `creaClientePortale`, `resetPasswordClienteAdmin`, gestione dipendenti verso Auth/Edge Function; init client invariato (stessa anon key). |
| `js/auth.js` | Nuova schermata login: elenco nomi → PIN; usare `signInWithPassword`; logout via `supabase.auth.signOut()`. |
| `js/state.js` | Popolare utente dalla sessione Auth; `getUser` allineato alla sessione; `canAccess/canWrite` restano come guida UI (il DB è il confine vero). |
| `js/modules/area-cliente.js` | Login cliente via Auth; le letture dati restano ma ora protette da RLS. |
| Gestione dipendenti (modulo personale) | Creazione/reset PIN via Edge Function; niente più campo PIN in chiaro. |
| `index.html` | Aggiornare `?v=` dei JS modificati (vedi memoria `feedback_versioning`). |

**Non si toccano** le centinaia di chiamate `.from(...)` degli altri moduli: appena la sessione è attiva funzionano già, ora autenticate.

## 11. Piano di esecuzione e sicurezza

Sotto-fasi (ognuna con bozze SQL riviste **prima** di applicare):

- **1a — Fondamenta Auth:** colonne `auth_user_id`, funzioni helper, vista `personale_login`, creazione 6 utenti staff + PIN iniziali, Edge Function `staff-admin`, nuovo login staff. *Verifica: login funziona, PIN in chiaro rimosso.*
- **1b — Lockdown RLS staff:** riscrittura policy di tutte le tabelle operative per ruolo; hardening funzioni. *Verifica: app staff funziona per ogni ruolo; anon senza sessione non legge nulla.*
- **1c — Migrazione portale clienti:** utenti Auth clienti, RLS portale, login portale. *Verifica: ogni cliente vede solo i propri dati.*
- **1d — Bonifica XSS** (dopo, separata).

### Sicurezza operativa
- **Backup fresco** (`node _scripts_local/backup.js`) prima di ogni sotto-fase.
- Se disponibile (piano a pagamento), applicare prima su un **branch di database Supabase** (clone) e promuovere dopo verifica. Sul piano Free il branching non c'è: si procede con MCP in `--read-only` finché non si dà l'ok esplicito, poi passaggio a scrittura per la singola migrazione, sempre con backup fresco appena prima.
- **Rollback:** ogni migrazione ha lo script inverso; in ultima istanza, ripristino dal backup.
- **Nessuna migrazione in produzione senza conferma esplicita del titolare.**

## 12. Verifica / test

- **Test negativo anon:** con la sola anon key (nessuna sessione), `SELECT` su `personale`, `cassa`, `vendite`, `movimenti_saldo` deve restituire **0 righe / errore**. Da eseguire dopo 1b.
- **Test per ruolo:** login come Lavaggi → non deve poter leggere `cassa`/`fatture`; Cassiere → non `tesoreria`/`fatturazione`; Admin → tutto. Verifica sia via app sia via query diretta col JWT del ruolo.
- **Test portale:** cliente A non deve vedere i movimenti del cliente B.
- **Advisor Supabase:** rieseguire `get_advisors(security)` → gli errori `rls_disabled`, `sensitive_columns_exposed`, `rls_policy_always_true` devono sparire.
- Regressione funzionale: giro completo di una vendita, un lavaggio, una ricarica saldo, una fattura.

## 13. Rischi e mitigazioni

| Rischio | Mitigazione |
|--------|-------------|
| Lockdown rompe una chiamata non prevista | Applicare per sotto-fasi con verifica; backup; rollback per migrazione |
| PIN 6 cifre brute-forzabile | Rate-limiting Auth; passo "tocca il nome"; possibilità futura di PIN più lunghi |
| Dimenticare una tabella e lasciarla aperta | Checklist su tutte le ~47 tabelle + rieseguire advisor come gate |
| Perdita accesso Admin durante la migrazione | Creare e verificare l'account Admin **per primo**, prima di chiudere la RLS |
| `service_role` esposto | Vive solo nella Edge Function (env Supabase), mai in client/repo |

## 14. Azioni richieste al titolare

1. Fornire i **PIN iniziali** dei 6 dipendenti (o farli generare e comunicarli).
2. Confermare l'**email tecnica** staff (proposta: `username@staff.titanwash.local`).
3. Alla sotto-fase 1c: comunicare ai **3 clienti** le nuove password.
4. Dare l'**ok esplicito** al passaggio dell'MCP da sola-lettura a scrittura, per ogni sotto-fase.
