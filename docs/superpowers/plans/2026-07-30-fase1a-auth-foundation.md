# Fase 1a — Fondamenta Auth + nuovo login staff — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Far autenticare lo staff con Supabase Auth (tocca il nome + PIN a 6 cifre), lasciando l'app pienamente funzionante, pronta per la blindatura RLS della Fase 1b.

**Architecture:** Ogni dipendente diventa un utente `auth.users` (email tecnica + PIN come password). `personale.auth_user_id` collega la riga applicativa all'utente Auth. Funzioni helper `SECURITY DEFINER` esporranno ruolo/identità alla RLS futura. Il client passa da `loginByPin` (query in chiaro) a `signInWithPassword`. In 1a le tabelle restano ancora aperte: si cambia solo il *modo di autenticarsi*, senza rompere nulla.

**Tech Stack:** Postgres/Supabase, Supabase Auth, Supabase Edge Function (Deno/TypeScript), supabase-js v2 (UMD, già incluso), vanilla JS (IIFE globali), MCP Supabase per le migrazioni.

## Global Constraints

- Nessun build step: JS vanilla, pattern IIFE `ENI.Modulo = (function(){...})()`, caricato via `<script src>` in `index.html`.
- supabase-js v2 UMD già incluso (`index.html:44`). Client creato una sola volta in `js/api.js:15-22`.
- **MCP Supabase resta `--read-only` finché il titolare non dà l'ok esplicito per ogni migrazione.** Passaggio a scrittura solo per la singola migrazione, poi si valuta se ripristinare read-only.
- **Backup fresco (`node _scripts_local/backup.js`) PRIMA di ogni task che scrive sul DB.**
- Repo **pubblica**: nessun segreto in file versionati. `service_role` e `BOOTSTRAP_SECRET` vivono solo come env della Edge Function su Supabase.
- Ad ogni JS modificato, aggiornare il `?v=` in `index.html` (vedi memoria `feedback_versioning`).
- Ambiente locale: Windows, PowerShell + Bash disponibili.
- Email tecnica staff: `<username>@staff.titanwash.local` (identificativo interno, mai mostrato).
- PIN: 6 cifre numeriche.

## File Structure

- `supabase/migrations/20260730_1a_01_auth_foundation.sql` — colonne `auth_user_id`, funzioni helper, vista `personale_login`. (bozza da rivedere prima di applicare)
- `supabase/functions/staff-admin/index.ts` — Edge Function con `service_role`: azioni `bootstrap`, `crea_dipendente`, `reset_pin`, `disattiva_dipendente`.
- `supabase/migrations/20260730_1a_02_link_and_settings.sql` — (eventuale) grant/settaggi complementari.
- `js/auth.js` — nuova schermata login (elenco nomi → PIN) + `signInWithPassword` + `signOut`.
- `js/api.js` — rimozione `loginByPin`; nuovi metodi `getStaffLoginList`, `loginConPin`, `logoutAuth`, `getUtenteCorrente`.
- `js/state.js` — utente popolato dalla sessione Auth.
- `index.html` — bump `?v=` dei JS toccati.

---

### Task 1: Pre-flight — backup e ok scrittura

**Files:** nessuno (operativo).

**Interfaces:**
- Produces: backup fresco su disco; MCP in scrittura autorizzato per la sola migrazione del Task 2.

- [ ] **Step 1: Backup fresco**

Run (Bash): `cd "C:/Users/Utente1/Documents/gestionale_eni" && node _scripts_local/backup.js`
Expected: `Righe totali esportate: ...` e una nuova cartella `backups/backup_...`.

- [ ] **Step 2: Chiedere al titolare l'ok esplicito** ad applicare la migrazione del Task 2 sul DB in produzione, e ottenere i 6 PIN iniziali (o accordarsi per generarli nel Task 5).

- [ ] **Step 3: Passare l'MCP a scrittura**

In `.mcp.json` rimuovere temporaneamente `"--read-only"` dagli `args`, poi riavviare la sessione. Verificare con una scrittura innocua in una tabella di prova? No: procedere direttamente al Task 2 (la migrazione stessa è la verifica).

---

### Task 2: Migrazione — colonne di collegamento, funzioni helper, vista login

**Files:**
- Create (bozza): `supabase/migrations/20260730_1a_01_auth_foundation.sql`

**Interfaces:**
- Produces:
  - Colonne `personale.auth_user_id uuid UNIQUE`, `clienti_portale.auth_user_id uuid UNIQUE`.
  - Funzioni: `public.is_staff() -> boolean`, `public.staff_role() -> text`, `public.current_cliente_id() -> uuid`.
  - Vista `public.personale_login(nome_completo, email_tecnica, attivo)` leggibile da `anon`.

- [ ] **Step 1: Scrivere la bozza SQL**

```sql
-- 20260730_1a_01_auth_foundation.sql
-- Fase 1a: fondamenta per Supabase Auth. NON blinda ancora le tabelle (Fase 1b).

-- 1) Colonne di collegamento all'utente Auth
alter table public.personale
  add column if not exists auth_user_id uuid unique references auth.users(id) on delete set null;

alter table public.clienti_portale
  add column if not exists auth_user_id uuid unique references auth.users(id) on delete set null;

-- 2) Funzioni helper per la RLS (SECURITY DEFINER: bypassano la RLS, niente ricorsione)
create or replace function public.is_staff()
  returns boolean
  language sql
  stable
  security definer
  set search_path = public
as $$
  select exists (
    select 1 from public.personale
    where auth_user_id = auth.uid() and attivo is true
  );
$$;

create or replace function public.staff_role()
  returns text
  language sql
  stable
  security definer
  set search_path = public
as $$
  select ruolo from public.personale
  where auth_user_id = auth.uid() and attivo is true
  limit 1;
$$;

create or replace function public.current_cliente_id()
  returns uuid
  language sql
  stable
  security definer
  set search_path = public
as $$
  select id from public.clienti_portale
  where auth_user_id = auth.uid() and attivo is true
  limit 1;
$$;

-- Le helper devono essere eseguibili dagli utenti autenticati (le userà la RLS)
grant execute on function public.is_staff() to authenticated, anon;
grant execute on function public.staff_role() to authenticated, anon;
grant execute on function public.current_cliente_id() to authenticated, anon;

-- 3) Vista per l'elenco nomi al login (nessun segreto: solo nome + email tecnica)
create or replace view public.personale_login as
  select nome_completo,
         (username || '@staff.titanwash.local') as email_tecnica,
         attivo
  from public.personale
  where attivo is true;

grant select on public.personale_login to anon, authenticated;
```

- [ ] **Step 2: Far rivedere la bozza al titolare** (Opzione A concordata: si legge prima di applicare).

- [ ] **Step 3: Applicare la migrazione** via MCP `apply_migration` (name: `1a_01_auth_foundation`).

- [ ] **Step 4: Verificare**

Via MCP `execute_sql`:
```sql
select public.is_staff();                        -- atteso: false (nessuna sessione)
select column_name from information_schema.columns
 where table_name='personale' and column_name='auth_user_id';   -- atteso: 1 riga
select count(*) from public.personale_login;     -- atteso: n. dipendenti attivi
```
Expected: colonna presente, vista popolata, `is_staff()` = false.

- [ ] **Step 5: Verificare che la vista NON esponga il PIN**

```sql
select * from public.personale_login limit 1;
```
Expected: solo `nome_completo`, `email_tecnica`, `attivo`. Nessuna colonna `pin`.

---

### Task 3: Configurare le impostazioni di Supabase Auth

**Files:** nessuno (dashboard Supabase / MCP).

**Interfaces:**
- Produces: policy password compatibile coi PIN a 6 cifre; signup pubblici disattivati.

- [ ] **Step 1: Impostare la lunghezza minima password a 6** (Dashboard → Authentication → Providers → Email → *Minimum password length* = 6).

- [ ] **Step 2: Disattivare "Leaked password protection" (HaveIBeenPwned)** (Authentication → Policies/Password) — altrimenti PIN numerici comuni vengono rifiutati. La difesa anti-brute-force è il rate-limiting integrato.

- [ ] **Step 3: Disattivare i signup pubblici** (Authentication → Providers → Email → *Allow new users to sign up* = OFF). Gli account li crea solo la Edge Function.

- [ ] **Step 4: Verificare** creando (temporaneamente, via dashboard) un utente con password `123456`: deve essere accettata. Poi eliminarlo.

---

### Task 4: Edge Function `staff-admin`

**Files:**
- Create: `supabase/functions/staff-admin/index.ts`

**Interfaces:**
- Consumes: env `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `BOOTSTRAP_SECRET`.
- Produces: endpoint POST con azioni:
  - `bootstrap` (header `x-bootstrap-secret`): body `{ utenti: [{username, nome_completo, ruolo, pin}] }` → crea utenti Auth e collega `personale.auth_user_id` (match per `username`).
  - `crea_dipendente` / `reset_pin` / `disattiva_dipendente` (JWT Admin): per la UI futura.

- [ ] **Step 1: Scrivere la Edge Function**

```typescript
// supabase/functions/staff-admin/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BOOTSTRAP_SECRET = Deno.env.get("BOOTSTRAP_SECRET") ?? "";
const EMAIL_DOMAIN = "staff.titanwash.local";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json" },
  });
}

async function callerRole(req: Request): Promise<string | null> {
  const authz = req.headers.get("Authorization") ?? "";
  const jwt = authz.replace("Bearer ", "");
  if (!jwt) return null;
  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data.user) return null;
  const { data: row } = await admin
    .from("personale").select("ruolo")
    .eq("auth_user_id", data.user.id).eq("attivo", true).maybeSingle();
  return row?.ruolo ?? null;
}

async function creaUtente(u: { username: string; nome_completo: string; ruolo: string; pin: string }) {
  const email = `${u.username}@${EMAIL_DOMAIN}`;
  const { data, error } = await admin.auth.admin.createUser({
    email, password: u.pin, email_confirm: true,
    user_metadata: { nome_completo: u.nome_completo },
  });
  if (error) throw new Error(`createUser ${u.username}: ${error.message}`);
  const { error: linkErr } = await admin
    .from("personale").update({ auth_user_id: data.user.id })
    .eq("username", u.username);
  if (linkErr) throw new Error(`link ${u.username}: ${linkErr.message}`);
  return { username: u.username, auth_user_id: data.user.id };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }
  const action = body.action;

  // Bootstrap una tantum, protetto da segreto d'ambiente
  if (action === "bootstrap") {
    if (!BOOTSTRAP_SECRET || req.headers.get("x-bootstrap-secret") !== BOOTSTRAP_SECRET) {
      return json({ error: "unauthorized" }, 401);
    }
    const risultati = [];
    for (const u of body.utenti ?? []) {
      try { risultati.push(await creaUtente(u)); }
      catch (e) { risultati.push({ username: u.username, error: String(e) }); }
    }
    return json({ ok: true, risultati });
  }

  // Azioni admin: richiedono JWT di un Admin
  const ruolo = await callerRole(req);
  if (ruolo !== "Admin") return json({ error: "forbidden" }, 403);

  if (action === "crea_dipendente") {
    try { return json({ ok: true, ...(await creaUtente(body.utente)) }); }
    catch (e) { return json({ error: String(e) }, 400); }
  }
  if (action === "reset_pin") {
    const { username, pin } = body;
    const email = `${username}@${EMAIL_DOMAIN}`;
    const { data: list } = await admin.auth.admin.listUsers();
    const user = list.users.find((x) => x.email === email);
    if (!user) return json({ error: "utente non trovato" }, 404);
    const { error } = await admin.auth.admin.updateUserById(user.id, { password: pin });
    return error ? json({ error: error.message }, 400) : json({ ok: true });
  }
  if (action === "disattiva_dipendente") {
    const { username } = body;
    const { error } = await admin.from("personale").update({ attivo: false }).eq("username", username);
    return error ? json({ error: error.message }, 400) : json({ ok: true });
  }
  return json({ error: "azione sconosciuta" }, 400);
});
```

- [ ] **Step 2: Impostare i secret della funzione** (Dashboard → Edge Functions → staff-admin → Secrets, oppure `supabase secrets set`): `BOOTSTRAP_SECRET` = valore casuale lungo (generato al momento, NON in repo). `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` sono già disponibili come secret di default nelle Edge Function.

- [ ] **Step 3: Deployare** via MCP `deploy_edge_function` (name `staff-admin`, entrypoint il file sopra).

- [ ] **Step 4: Verificare** che risponda: una POST senza segreto e senza JWT deve dare `401`/`403`, non `500`.

---

### Task 5: Bootstrap dei 6 utenti staff

**Files:** nessuno (chiamata alla Edge Function).

**Interfaces:**
- Consumes: `staff-admin` azione `bootstrap`; lista `username/nome_completo/ruolo` da `personale`; 6 PIN iniziali.
- Produces: 6 utenti Auth creati; `personale.auth_user_id` popolato per tutte le righe attive.

- [ ] **Step 1: Elencare i dipendenti** via MCP `execute_sql`:
```sql
select username, nome_completo, ruolo from public.personale where attivo is true order by username;
```

- [ ] **Step 2: Preparare i PIN iniziali** (dal titolare, o generati a 6 cifre e consegnati fuori chat). **Creare per primo/verificare l'account Admin**, così non si perde l'accesso.

- [ ] **Step 3: Chiamare `bootstrap`** (Bash `curl` alla URL della funzione, con header `x-bootstrap-secret`), body `{ "action":"bootstrap", "utenti":[ ... ] }`. Il segreto e i PIN non vanno stampati in chat: passarli via variabile d'ambiente locale.

- [ ] **Step 4: Verificare il collegamento** via `execute_sql`:
```sql
select username, (auth_user_id is not null) as collegato from public.personale where attivo is true;
```
Expected: `collegato = true` per tutti.

- [ ] **Step 5: Verificare il login lato Auth** (test rapido via `signInWithPassword` da uno snippet Node/browser con email tecnica + PIN di un utente): sessione ottenuta = ok.

- [ ] **Step 6: Rimuovere/azzerare `BOOTSTRAP_SECRET`** dai secret della funzione (bootstrap è una tantum).

---

### Task 6: Nuovo login staff nel client

**Files:**
- Modify: `js/api.js` (rimuovere `loginByPin`; aggiungere `getStaffLoginList`, `loginConPin`, `logoutAuth`, `getUtenteCorrente`)
- Modify: `js/auth.js` (schermata: nomi → PIN; usare i nuovi metodi)
- Modify: `js/state.js` (utente dalla sessione Auth)
- Modify: `index.html` (bump `?v=`)

**Interfaces:**
- Consumes: `supabase.auth.signInWithPassword`, vista `personale_login`.
- Produces:
  - `ENI.API.getStaffLoginList() -> Promise<[{nome_completo, email_tecnica}]>`
  - `ENI.API.loginConPin(emailTecnica, pin) -> Promise<{id, username, nome_completo, ruolo} | null>`
  - `ENI.API.logoutAuth() -> Promise<void>`
  - `ENI.API.getUtenteCorrente() -> Promise<{...}|null>` (ricostruisce l'utente app dalla sessione)

- [ ] **Step 1: Aggiungere i metodi in `js/api.js`** (vicino all'attuale `loginByPin`, che va rimosso):

```javascript
async function getStaffLoginList() {
    var result = await getClient()
        .from('personale_login')
        .select('nome_completo, email_tecnica')
        .order('nome_completo', { ascending: true });
    if (result.error) throw new Error(result.error.message);
    return result.data || [];
}

async function loginConPin(emailTecnica, pin) {
    var auth = await getClient().auth.signInWithPassword({ email: emailTecnica, password: pin });
    if (auth.error) return null; // credenziali errate
    return await getUtenteCorrente();
}

async function getUtenteCorrente() {
    var sess = await getClient().auth.getUser();
    if (!sess.data || !sess.data.user) return null;
    var result = await getClient()
        .from('personale')
        .select('id, username, nome_completo, ruolo')
        .eq('auth_user_id', sess.data.user.id)
        .eq('attivo', true)
        .maybeSingle();
    if (result.error || !result.data) return null;
    return result.data;
}

async function logoutAuth() {
    await getClient().auth.signOut();
}
```
Aggiungere questi nomi all'oggetto pubblico `return { ... }` di `ENI.API` e **rimuovere** `loginByPin` dall'export e la sua definizione.

- [ ] **Step 2: Riscrivere `js/auth.js`** — la schermata mostra prima i nomi, poi il PIN:
  - `renderLogin()` chiama `ENI.API.getStaffLoginList()` e crea un pulsante per ogni `nome_completo` (data-attribute con `email_tecnica`).
  - Al click sul nome, mostra la tastierina PIN (riusare `_setupPinInputs`, portandola a **6** cifre).
  - `_attemptLogin()` chiama `ENI.API.loginConPin(emailSelezionata, pin)`; se ritorna l'utente → `ENI.State.setUser(...)` + `renderShell()`; altrimenti "PIN non valido".
  - `logout()` chiama `await ENI.API.logoutAuth()` prima di `renderLogin()`.
  - Aggiornare i 4 input PIN → 6 input (`data-pin="0..5"`, `maxlength=1`).

- [ ] **Step 3: Adeguare `js/state.js`** — all'avvio, se esiste una sessione Auth valida, ripopolare l'utente: in `ENI.App` (o dove si fa il boot) chiamare `ENI.API.getUtenteCorrente()` e, se presente, `setUser`. `canAccess/canWrite` restano invariati (guida UI). `getUser` continua a leggere da sessionStorage come cache.

- [ ] **Step 4: Bump `?v=`** in `index.html` per `api.js`, `auth.js`, `state.js`.

- [ ] **Step 5: Verifica manuale nel browser**
  - Aprire l'app: compaiono i nomi dei dipendenti.
  - Tocco un nome, digito il PIN a 6 cifre corretto → entro; ruolo corretto in alto.
  - PIN errato → "PIN non valido", nessun accesso.
  - Ricarico la pagina → resto loggato (sessione persistente).
  - Logout → torno alla schermata nomi; ricaricando non sono più loggato.
  - Un giro funzionale rapido (aprire un paio di moduli) funziona come prima.

- [ ] **Step 6: Commit**

```bash
git add js/api.js js/auth.js js/state.js index.html
git commit -m "feat(auth): login staff via Supabase Auth (nome + PIN 6 cifre)"
```

---

### Task 7: Verifica finale 1a e nota di transizione

**Files:** nessuno.

- [ ] **Step 1: Confermare che il login funziona per almeno un utente per ruolo** (Admin, Cassiere, Lavaggi).

- [ ] **Step 2: Confermare che `personale.pin` NON è più usato per il login** (grep: nessun riferimento residuo a `loginByPin` / `.eq('pin'` nel codice attivo). La **rimozione della colonna `pin`** e il rewire della UI gestione-dipendenti sono rimandati (dopo aver aggiornato quella UI), per non lasciarla rotta.

Run (Grep): cercare `loginByPin` e `'pin'` nel client. Expected: nessun uso attivo nel flusso di login.

- [ ] **Step 3: Nota** nel documento di stato/memoria: 1a completata, l'app ora autentica; **le tabelle sono ancora aperte** → procedere con il piano **1b (lockdown RLS)**, che è ciò che effettivamente chiude il buco.

- [ ] **Step 4: (Opzionale) Ripristinare l'MCP a `--read-only`** rimettendo il flag in `.mcp.json` finché non parte 1b.

---

## Self-Review (copertura spec)

- **Identità/collegamento (spec §4):** Task 2 (colonne, helper) + Task 5 (bootstrap link). ✓
- **Login nome+PIN (spec §5):** Task 6. ✓
- **Vista senza segreti (spec §5.3):** Task 2 Step 5. ✓
- **Impostazioni Auth / PIN 6 cifre (spec §5.2):** Task 3. ✓
- **Edge Function service_role (spec §7.1):** Task 4. ✓
- **Cambio PIN self / admin (spec §7.2):** azione `reset_pin` in Task 4 (UI wiring rimandata). ✓ (parziale, per design)
- **Rimozione PIN in chiaro (spec §5.4):** avviata (login non usa più il PIN in chiaro); **drop colonna rimandato** esplicitamente a dopo il rewire UI gestione-dipendenti (Task 7 Step 2). Da coprire in un piano successivo.
- **RLS lockdown (spec §6), portale (spec §8), hardening funzioni (spec §9), XSS (spec §2):** **fuori da 1a**, coperti dai piani 1b/1c/1d.

**Non coperto di proposito in 1a (rimandato ai piani successivi):** blindatura RLS, migrazione clienti, drop `personale.pin`, UI gestione-dipendenti su Edge Function, hardening `search_path`/`revoke`, XSS. Questo è coerente con lo staging della spec.

## Rischi specifici di 1a

| Rischio | Mitigazione |
|--------|-------------|
| Bootstrap crea utenti ma non collega `auth_user_id` | Task 5 Step 4 verifica il collegamento per tutti prima di procedere |
| Perdita accesso Admin | Creare/validare l'Admin per primo (Task 5 Step 2) |
| PIN a 6 cifre rifiutato da policy password | Task 3 (min length 6, HIBP off) prima del bootstrap |
| `signInWithPassword` non allega il JWT alle `.from()` | Client singleton (`api.js:15-22`): la sessione è globale; verificato nel giro funzionale (Task 6 Step 5) |
| Strumenti diagnostici con client separato (`diagnostica-carburante.html`, `scripts/*.js`) | Non toccati in 1a; andranno autenticati in 1b o dismessi (annotare) |
