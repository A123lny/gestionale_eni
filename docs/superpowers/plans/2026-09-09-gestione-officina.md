# Gestione Officina — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un modulo Officina separato dal Magazzino, con anagrafica ricambi (giacenza, costo, prezzo di rivendita), storico dei carichi, e interventi su targa che scaricano le giacenze e fanno entrare l'incasso nel venduto di giornata in Cassa.

**Architecture:** Quattro tabelle nuove `officina_*`. Le operazioni multi-tabella stanno in funzioni PL/pgSQL atomiche (`security invoker`, quindi soggette alla RLS), sullo stesso modello di `salva_vendita` e `movimenta_giacenza` già in uso. L'incasso arriva in Cassa perché l'intervento crea un record in `vendite` con `categoria='Officina'` sulle righe — esattamente come già fanno i lavaggi — quindi né il modulo Cassa né `getVenditeTotaliPerData` vanno toccati. La logica di calcolo pura (margini, valore inventario, totali) sta in `js/lib/officina-calcoli.js` e viene testata dalla pagina `test/test-officina.html`.

**Tech Stack:** JavaScript ES5 vanilla (nessun build step, moduli a IIFE su namespace globale `ENI`), Supabase (Postgres + RLS + RPC), server statico locale `_scripts_local/serve.js`, migration applicate con `_scripts_local/apply_migration.js`.

**Spec:** `docs/superpowers/specs/2026-09-09-gestione-officina-design.md`

## Global Constraints

- **Stile del codice:** ES5. `var`, non `let`/`const`. Moduli a IIFE con `'use strict'`. Nessuna arrow function, nessun template literal, nessuna shorthand property nell'oggetto di ritorno (scrivere `{ nome: nome }`). Concatenazione di stringhe con `+`. Motivo: uniformità col resto del codice, che gira senza transpiler.
- **Versioning obbligatorio:** ogni file JS modificato o creato richiede il bump (o l'aggiunta) di `?v=N` nel relativo `<script>` in `index.html`. Senza, i dispositivi restano bloccati sulla versione vecchia.
- **Escape HTML:** ogni valore che arriva dal database e finisce in `innerHTML` passa da `ENI.UI.escapeHtml()`.
- **Il database è quello di produzione.** Non esiste uno stack Supabase locale: "in locale" significa app servita da `serve.js`, ma il DB è quello vero. La migration è **additiva** (crea tabelle nuove, non tocca nulla di esistente). I record di prova creati durante i test — inclusi quelli in `vendite`/`vendite_dettaglio` — **vanno cancellati** alla fine (Task 8). Non toccare mai dati preesistenti.
- **Migration:** applicare con `node _scripts_local/apply_migration.js <file.sql>` (gira in transazione, ROLLBACK automatico in caso di errore).
- **Naming DB:** tabelle `officina_articoli`, `officina_carichi`, `officina_interventi`, `officina_interventi_righe`. Funzioni `movimenta_giacenza_officina`, `carica_articolo_officina`, `salva_intervento_officina`, `annulla_intervento_officina`.
- **Prefissi codici:** `OFF` per gli articoli, `OFI` per gli interventi, `VEN` per le vendite generate.
- **Categoria vendita:** le righe `vendite_dettaglio` generate da un intervento hanno `categoria = 'Officina'` e `prodotto_id = NULL` (fondamentale: `prodotto_id` è la FK al Magazzino, se valorizzata scaricherebbe la giacenza sbagliata).

## File Structure

| File | Responsabilità |
|---|---|
| `js/lib/officina-calcoli.js` | **Nuovo.** Calcoli puri: normalizzazione targa, margine articolo, valore inventario, totali intervento. Nessuna dipendenza, nessun DOM, nessuna rete. |
| `test/test-officina.html` | **Nuovo.** Pagina di test dei calcoli puri, stesso stile di `test/test-calcoli.html`. |
| `supabase/migrations/20260909_officina.sql` | **Nuovo.** Tabelle + indici + RLS. |
| `supabase/migrations/20260909_officina_rpc.sql` | **Nuovo.** Le quattro funzioni atomiche. |
| `js/api.js` | **Modificato.** Funzioni API officina, in fondo prima del blocco `return`. |
| `js/config.js` | **Modificato.** `PREFISSI`, `CATEGORIE_OFFICINA`, ruoli, sezione di navigazione. |
| `js/router.js` | **Modificato.** Due rotte. |
| `index.html` | **Modificato.** Tre `<script>` nuovi. |
| `js/modules/officina.js` | **Nuovo.** `ENI.Modules.OfficinaRicambi` — anagrafica, giacenze, carichi. |
| `js/modules/officina-interventi.js` | **Nuovo.** `ENI.Modules.OfficinaInterventi` — lista e form interventi. |

Due moduli invece di uno perché anagrafica e interventi sono responsabilità distinte, e perché `js/modules/magazzino.js` (700 righe) mostra dove porta l'alternativa.

---

### Task 1: Calcoli puri + test

**Files:**
- Create: `js/lib/officina-calcoli.js`
- Test: `test/test-officina.html`

**Interfaces:**
- Consumes: niente.
- Produces: `ENI.OfficinaCalcoli` con quattro funzioni:
  - `normalizzaTarga(targa) -> string` (maiuscolo, solo A-Z e 0-9)
  - `margine(costo, prezzo) -> { euro: number, perc: number }`
  - `valoreInventario(articoli) -> { aCosto, aVendita, margine, marginePerc }`
  - `totaliIntervento(righe, manodopera) -> { totaleRicambi, costoRicambi, manodopera, totale, margine, marginePerc }`

Il `perc` è sempre calcolato **sul prezzo di vendita** (margine commerciale), non sul costo (ricarico). Con prezzo 0 il `perc` è 0, non `Infinity`.

- [ ] **Step 1: Scrivere la pagina di test (che fallisce)**

Creare `test/test-officina.html`:

```html
<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <title>Test Calcoli Officina</title>
    <style>
        body { font-family: 'Inter', sans-serif; padding: 2rem; background: #f5f5f5; }
        h1 { color: #1B2D4E; }
        .test-suite { background: white; border-radius: 8px; padding: 1.5rem; margin-bottom: 1rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .test-suite h2 { margin-top: 0; color: #333; font-size: 1.1rem; }
        .test { padding: 0.5rem 0; border-bottom: 1px solid #eee; }
        .test:last-child { border-bottom: none; }
        .pass { color: #2e7d32; }
        .fail { color: #c62828; }
        .detail { color: #666; font-size: 0.85rem; margin-left: 1.5rem; }
        .summary { font-size: 1.2rem; font-weight: 700; margin-top: 1rem; padding: 1rem; border-radius: 8px; }
        .summary.all-pass { background: #e8f5e9; color: #2e7d32; }
        .summary.has-fail { background: #ffebee; color: #c62828; }
    </style>
</head>
<body>
    <h1>Test Calcoli Officina</h1>
    <div id="results"></div>

    <script src="../js/lib/officina-calcoli.js"></script>
    <script>
    (function() {
        var out = [];
        var pass = 0, fail = 0;

        function eq(nome, actual, expected, tolerance) {
            tolerance = (tolerance === undefined) ? 0.01 : tolerance;
            var ok;
            if (typeof expected === 'object' && expected !== null) {
                ok = true;
                for (var k in expected) {
                    if (Math.abs((actual ? actual[k] : 0) - expected[k]) > tolerance) ok = false;
                }
            } else if (typeof expected === 'string') {
                ok = (actual === expected);
            } else {
                ok = Math.abs(actual - expected) <= tolerance;
            }
            if (ok) pass++; else fail++;
            out.push('<div class="test ' + (ok ? 'pass' : 'fail') + '">' +
                (ok ? '✅' : '❌') + ' ' + nome +
                (ok ? '' : '<div class="detail">atteso ' + JSON.stringify(expected) +
                            ', ottenuto ' + JSON.stringify(actual) + '</div>') + '</div>');
        }

        var C = ENI.OfficinaCalcoli;

        // --- normalizzaTarga ---
        eq('targa: maiuscolo e senza spazi', C.normalizzaTarga(' ab 123 cd '), 'AB123CD');
        eq('targa: toglie i trattini', C.normalizzaTarga('ab-123-cd'), 'AB123CD');
        eq('targa: vuota resta vuota', C.normalizzaTarga(''), '');
        eq('targa: null non esplode', C.normalizzaTarga(null), '');

        // --- margine ---
        eq('margine: costo 60 prezzo 100 -> 40 euro, 40%', C.margine(60, 100), { euro: 40, perc: 40 });
        eq('margine: prezzo 0 -> perc 0, non Infinity', C.margine(10, 0), { euro: -10, perc: 0 });
        eq('margine: valori nulli -> 0', C.margine(null, null), { euro: 0, perc: 0 });
        eq('margine: vendita sottocosto -> negativo', C.margine(100, 80), { euro: -20, perc: -25 });

        // --- valoreInventario ---
        var articoli = [
            { giacenza: 10, ultimo_costo: 5,  prezzo_vendita: 10 },
            { giacenza: 2,  ultimo_costo: 50, prezzo_vendita: 80 }
        ];
        eq('inventario: valore a costo', C.valoreInventario(articoli), { aCosto: 150 });
        eq('inventario: valore a vendita', C.valoreInventario(articoli), { aVendita: 260 });
        eq('inventario: margine potenziale', C.valoreInventario(articoli), { margine: 110, marginePerc: 42.31 });
        eq('inventario: lista vuota -> tutti zero', C.valoreInventario([]), { aCosto: 0, aVendita: 0, margine: 0, marginePerc: 0 });
        eq('inventario: undefined non esplode', C.valoreInventario(undefined), { aCosto: 0 });

        // --- totaliIntervento ---
        var righe = [
            { quantita: 2, prezzo_unitario: 15, costo_unitario: 9 },
            { quantita: 1, prezzo_unitario: 90, costo_unitario: 60 }
        ];
        eq('intervento: totale ricambi', C.totaliIntervento(righe, 30), { totaleRicambi: 120 });
        eq('intervento: costo ricambi', C.totaliIntervento(righe, 30), { costoRicambi: 78 });
        eq('intervento: totale con manodopera', C.totaliIntervento(righe, 30), { totale: 150 });
        eq('intervento: margine include la manodopera', C.totaliIntervento(righe, 30), { margine: 72, marginePerc: 48 });
        eq('intervento: senza manodopera', C.totaliIntervento(righe, 0), { totale: 120, margine: 42 });
        eq('intervento: manodopera non numerica vale 0', C.totaliIntervento(righe, null), { totale: 120 });
        eq('intervento: nessuna riga, sola manodopera', C.totaliIntervento([], 50), { totaleRicambi: 0, totale: 50, margine: 50, marginePerc: 100 });
        eq('intervento: tutto vuoto -> perc 0', C.totaliIntervento([], 0), { totale: 0, marginePerc: 0 });

        document.getElementById('results').innerHTML =
            '<div class="test-suite"><h2>Calcoli Officina</h2>' + out.join('') + '</div>' +
            '<div class="summary ' + (fail === 0 ? 'all-pass' : 'has-fail') + '">' +
            pass + ' passati, ' + fail + ' falliti</div>';
    })();
    </script>
</body>
</html>
```

- [ ] **Step 2: Verificare che i test falliscano**

Avviare il server (se non già attivo) e aprire la pagina:

```bash
node _scripts_local/serve.js
```

Aprire `http://127.0.0.1:8080/test/test-officina.html`.
Atteso: la pagina è **vuota** e la console mostra `ENI is not defined` (oppure `Cannot read properties of undefined`), perché `js/lib/officina-calcoli.js` non esiste ancora. Questo conferma che i test stanno davvero esercitando il codice.

- [ ] **Step 3: Scrivere l'implementazione**

Creare `js/lib/officina-calcoli.js`:

```javascript
// ============================================================
// GESTIONALE ENI - Calcoli Officina
// Funzioni pure: nessun DOM, nessuna rete, nessuno stato.
// Testate da test/test-officina.html
// ============================================================

var ENI = ENI || {};

ENI.OfficinaCalcoli = (function() {
    'use strict';

    // Numero sicuro: null/undefined/'' /NaN -> 0
    function _n(v) {
        var x = Number(v);
        return isNaN(x) ? 0 : x;
    }

    // Targa normalizzata: maiuscolo, solo lettere e cifre.
    // Senza questo 'AB 123 CD' e 'ab-123-cd' sarebbero due targhe diverse
    // e la ricerca per targa non troverebbe mai nulla.
    function normalizzaTarga(targa) {
        if (!targa) return '';
        return String(targa).toUpperCase().replace(/[^A-Z0-9]/g, '');
    }

    // Margine commerciale: euro guadagnati e percentuale SUL PREZZO DI VENDITA.
    // Con prezzo 0 la percentuale e' 0 (non Infinity).
    function margine(costo, prezzo) {
        var c = _n(costo);
        var p = _n(prezzo);
        var euro = p - c;
        return {
            euro: euro,
            perc: p > 0 ? (euro / p) * 100 : 0
        };
    }

    // Valore complessivo del magazzino ricambi, a costo e a prezzo di vendita.
    function valoreInventario(articoli) {
        var aCosto = 0;
        var aVendita = 0;
        (articoli || []).forEach(function(a) {
            var q = _n(a.giacenza);
            aCosto += q * _n(a.ultimo_costo);
            aVendita += q * _n(a.prezzo_vendita);
        });
        var marg = aVendita - aCosto;
        return {
            aCosto: aCosto,
            aVendita: aVendita,
            margine: marg,
            marginePerc: aVendita > 0 ? (marg / aVendita) * 100 : 0
        };
    }

    // Totali di un intervento. La manodopera entra nel totale e nel margine
    // (e' ricavo puro), ma non ha costo ricambi associato.
    function totaliIntervento(righe, manodopera) {
        var totaleRicambi = 0;
        var costoRicambi = 0;
        (righe || []).forEach(function(r) {
            var q = _n(r.quantita);
            totaleRicambi += q * _n(r.prezzo_unitario);
            costoRicambi += q * _n(r.costo_unitario);
        });
        var m = _n(manodopera);
        var totale = totaleRicambi + m;
        var marg = totale - costoRicambi;
        return {
            totaleRicambi: totaleRicambi,
            costoRicambi: costoRicambi,
            manodopera: m,
            totale: totale,
            margine: marg,
            marginePerc: totale > 0 ? (marg / totale) * 100 : 0
        };
    }

    return {
        normalizzaTarga: normalizzaTarga,
        margine: margine,
        valoreInventario: valoreInventario,
        totaliIntervento: totaliIntervento
    };
})();
```

- [ ] **Step 4: Verificare che i test passino**

Ricaricare `http://127.0.0.1:8080/test/test-officina.html`.
Atteso: riquadro verde, **21 passati, 0 falliti**.

- [ ] **Step 5: Commit**

```bash
git add js/lib/officina-calcoli.js test/test-officina.html
git commit -m "feat(officina): calcoli puri (margini, inventario, totali) + test"
```

---

### Task 2: Migration tabelle + RLS

**Files:**
- Create: `supabase/migrations/20260909_officina.sql`

**Interfaces:**
- Consumes: `public.is_staff()` (definita in `20260730_1a_01_auth_foundation.sql`), `public.vendite(id)`.
- Produces: le tabelle `officina_articoli`, `officina_carichi`, `officina_interventi`, `officina_interventi_righe` con RLS attiva.

- [ ] **Step 1: Scrivere la migration**

Creare `supabase/migrations/20260909_officina.sql`:

```sql
-- 20260909_officina.sql
-- Modulo Gestione Officina: ricambi (lampadine, batterie, gomme, filtri...),
-- storico dei carichi (quanto e' stato speso davvero) e interventi su targa.
-- Separato dal Magazzino del distributore: nessuna tabella condivisa.
-- Migration ADDITIVA: crea solo oggetti nuovi, non tocca nulla di esistente.
-- Applicare con: node _scripts_local/apply_migration.js supabase/migrations/20260909_officina.sql

-- ============================================================
-- 1. ARTICOLI (anagrafica ricambi)
-- ============================================================
create table if not exists public.officina_articoli (
  id                    uuid primary key default gen_random_uuid(),
  codice                text unique,
  nome                  text not null,
  categoria             text,
  marca                 text,
  unita_misura          text default 'pz',
  giacenza              numeric default 0,
  giacenza_minima       numeric default 0,   -- 0 = nessun alert sotto scorta
  ultimo_costo          numeric default 0,   -- costo unitario dell'ultimo carico
  prezzo_vendita        numeric default 0,
  ubicazione            text,
  note                  text,
  attivo                boolean default true,
  created_at            timestamptz default now(),
  ultima_movimentazione timestamptz
);

create index if not exists idx_officina_articoli_nome      on public.officina_articoli (nome);
create index if not exists idx_officina_articoli_categoria on public.officina_articoli (categoria);

-- ============================================================
-- 2. CARICHI (storico acquisti)
-- Serve per rispondere a "quanto ho speso davvero", che il solo
-- costo corrente sull'articolo non sa dire.
-- ============================================================
create table if not exists public.officina_carichi (
  id             uuid primary key default gen_random_uuid(),
  articolo_id    uuid not null references public.officina_articoli(id) on delete restrict,
  data           date not null default current_date,
  quantita       numeric not null check (quantita > 0),
  costo_unitario numeric not null default 0,
  costo_totale   numeric generated always as (quantita * costo_unitario) stored,
  fornitore      text,
  documento      text,   -- n. DDT / fattura
  note           text,
  operatore_id   uuid,
  operatore_nome text,
  created_at     timestamptz default now()
);

create index if not exists idx_officina_carichi_articolo on public.officina_carichi (articolo_id, data desc);

-- ============================================================
-- 3. INTERVENTI (il lavoro fatto sull'auto)
-- ============================================================
create table if not exists public.officina_interventi (
  id               uuid primary key default gen_random_uuid(),
  codice           text unique,
  data             date not null default current_date,
  ora              text,
  targa            text,
  modello          text,
  descrizione      text,
  manodopera       numeric default 0,   -- ricavo puro, non tocca le giacenze
  totale_ricambi   numeric default 0,
  costo_ricambi    numeric default 0,   -- somma dei costi congelati, per il margine
  totale           numeric default 0,
  metodo_pagamento text default 'contanti',
  importo_contanti numeric default 0,
  importo_pos      numeric default 0,
  stato            text default 'completato' check (stato in ('completato','annullato')),
  vendita_id       uuid references public.vendite(id) on delete set null,
  note             text,
  operatore_id     uuid,
  operatore_nome   text,
  created_at       timestamptz default now()
);

create index if not exists idx_officina_interventi_data  on public.officina_interventi (data desc);
create index if not exists idx_officina_interventi_targa on public.officina_interventi (targa);

-- ============================================================
-- 4. RIGHE INTERVENTO
-- costo_unitario e' CONGELATO al momento dell'intervento: il margine
-- storico resta corretto anche se domani il ricambio costa di piu'.
-- articolo_id nullable = riga libera (pezzo comprato apposta, non a magazzino).
-- ============================================================
create table if not exists public.officina_interventi_righe (
  id              uuid primary key default gen_random_uuid(),
  intervento_id   uuid not null references public.officina_interventi(id) on delete cascade,
  articolo_id     uuid references public.officina_articoli(id) on delete set null,
  codice_articolo text,
  nome_articolo   text,
  quantita        numeric not null default 1,
  prezzo_unitario numeric not null default 0,
  costo_unitario  numeric not null default 0,
  totale_riga     numeric not null default 0
);

create index if not exists idx_officina_righe_intervento on public.officina_interventi_righe (intervento_id);

-- ============================================================
-- 5. RLS: stessa regola del lockdown staff (20260812_1b_01).
-- Solo chi ha fatto login come staff puo' leggere e scrivere.
-- ============================================================
do $$
declare
  t   text;
  pol record;
  tabelle text[] := array[
    'officina_articoli','officina_carichi','officina_interventi','officina_interventi_righe'
  ];
begin
  foreach t in array tabelle loop
    for pol in
      select policyname from pg_policies where schemaname='public' and tablename=t
    loop
      execute format('drop policy if exists %I on public.%I', pol.policyname, t);
    end loop;

    execute format('alter table public.%I enable row level security', t);

    execute format(
      'create policy staff_all on public.%I for all to authenticated '
      'using (public.is_staff()) with check (public.is_staff())', t
    );
  end loop;
end $$;
```

- [ ] **Step 2: Applicare la migration**

```bash
node _scripts_local/apply_migration.js supabase/migrations/20260909_officina.sql
```

Atteso: `OK: migrazione applicata e committata: 20260909_officina.sql`.
Se compare `ERRORE (ROLLBACK eseguito, DB invariato)`, il database non è cambiato: correggere l'SQL e riprovare.

- [ ] **Step 3: Verificare tabelle e RLS**

Creare il file di verifica `_scripts_local/verifica_officina.sql`:

```sql
-- Verifica: le 4 tabelle esistono e hanno la RLS accesa con la policy staff_all
select c.relname as tabella,
       c.relrowsecurity as rls_attiva,
       (select count(*) from pg_policies p
         where p.schemaname='public' and p.tablename=c.relname) as num_policy
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relname in ('officina_articoli','officina_carichi',
                     'officina_interventi','officina_interventi_righe')
 order by c.relname;
```

Eseguirlo con:

```bash
node _scripts_local/apply_migration.js _scripts_local/verifica_officina.sql
```

Lo script non stampa le righe: per leggerle usare il SQL Editor di Supabase, oppure aggiungere temporaneamente un `raise notice`. In alternativa, verifica più semplice e sufficiente — dalla console del browser con l'app aperta e loggata:

```javascript
await ENI.API.getAll('officina_articoli')   // -> []  (tabella esiste, RLS permette allo staff)
```

Atteso: array vuoto, nessun errore. Un errore `relation does not exist` significa migration non applicata; un errore di permessi significa RLS senza la policy giusta.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260909_officina.sql _scripts_local/verifica_officina.sql
git commit -m "feat(officina): tabelle articoli, carichi, interventi e righe + RLS staff"
```

---

### Task 3: Funzioni atomiche (RPC)

**Files:**
- Create: `supabase/migrations/20260909_officina_rpc.sql`

**Interfaces:**
- Consumes: le tabelle del Task 2, `public.get_prossimo_codice(text, text, text)` (migration 018), `public.vendite`, `public.vendite_dettaglio`.
- Produces:
  - `movimenta_giacenza_officina(p_articolo_id uuid, p_delta numeric) -> numeric`
  - `carica_articolo_officina(p_carico jsonb) -> jsonb`
  - `salva_intervento_officina(p_intervento jsonb, p_righe jsonb) -> jsonb`
  - `annulla_intervento_officina(p_intervento_id uuid) -> jsonb`

Tutte `security invoker`: restano soggette alla RLS, quindi utilizzabili solo da staff loggato.

- [ ] **Step 1: Scrivere la migration delle RPC**

Creare `supabase/migrations/20260909_officina_rpc.sql`:

```sql
-- 20260909_officina_rpc.sql
-- Funzioni atomiche del modulo Officina.
-- Perche' lato DB e non lato client: un intervento tocca 4 tabelle
-- (interventi, righe, articoli, vendite). Con 4 chiamate separate un errore
-- di rete a meta' strada lascerebbe le giacenze scaricate senza incasso in
-- cassa, cioe' un ammanco falso. Qui o va tutto, o non va niente.
-- security invoker: restano soggette alla RLS (solo staff loggato).

-- ============================================================
-- 1. Giacenza atomica (gemella di movimenta_giacenza per il magazzino)
-- delta negativo = scarico (intervento), positivo = carico o storno.
-- La giacenza non scende sotto zero.
-- ============================================================
create or replace function public.movimenta_giacenza_officina(p_articolo_id uuid, p_delta numeric)
  returns numeric
  language plpgsql
  security invoker
  set search_path = public
as $$
declare
  v_nuova numeric;
begin
  update public.officina_articoli
     set giacenza = greatest(0, coalesce(giacenza, 0) + p_delta),
         ultima_movimentazione = now()
   where id = p_articolo_id
   returning giacenza into v_nuova;
  return v_nuova;  -- NULL se l'articolo non esiste
end;
$$;

grant execute on function public.movimenta_giacenza_officina(uuid, numeric) to authenticated;

-- ============================================================
-- 2. Carico: riga di storico + giacenza + aggiornamento ultimo costo
-- ============================================================
create or replace function public.carica_articolo_officina(p_carico jsonb)
  returns jsonb
  language plpgsql
  security invoker
  set search_path = public
as $$
declare
  v_carico public.officina_carichi%rowtype;
begin
  -- colonne elencate una a una: costo_totale e' generata e non va inserita
  insert into public.officina_carichi (
    articolo_id, data, quantita, costo_unitario, fornitore, documento, note,
    operatore_id, operatore_nome
  )
  select articolo_id, data, quantita, costo_unitario, fornitore, documento, note,
         operatore_id, operatore_nome
  from jsonb_populate_record(null::public.officina_carichi, p_carico)
  returning * into v_carico;

  update public.officina_articoli
     set giacenza = greatest(0, coalesce(giacenza, 0) + v_carico.quantita),
         ultimo_costo = v_carico.costo_unitario,
         ultima_movimentazione = now()
   where id = v_carico.articolo_id;

  return to_jsonb(v_carico);
end;
$$;

grant execute on function public.carica_articolo_officina(jsonb) to authenticated;

-- ============================================================
-- 3. Intervento: codice + testata + righe + scarico giacenze + vendita
-- La vendita fa entrare l'incasso nel venduto di giornata in Cassa senza
-- toccare il modulo Cassa (stesso meccanismo dei lavaggi).
-- prodotto_id resta NULL: e' la FK al MAGAZZINO, valorizzarla scaricherebbe
-- la giacenza sbagliata.
-- ============================================================
create or replace function public.salva_intervento_officina(p_intervento jsonb, p_righe jsonb)
  returns jsonb
  language plpgsql
  security invoker
  set search_path = public
as $$
declare
  v_codice     text;
  v_codice_ven text;
  v_int        public.officina_interventi%rowtype;
  v_vendita    public.vendite%rowtype;
  d            record;
begin
  v_codice := public.get_prossimo_codice('OFI', 'officina_interventi', 'codice');

  insert into public.officina_interventi (
    codice, data, ora, targa, modello, descrizione, manodopera, totale_ricambi,
    costo_ricambi, totale, metodo_pagamento, importo_contanti, importo_pos,
    stato, note, operatore_id, operatore_nome
  )
  select v_codice, data, ora,
         nullif(upper(regexp_replace(coalesce(targa, ''), '[^A-Za-z0-9]', '', 'g')), ''),
         modello, descrizione, coalesce(manodopera, 0), coalesce(totale_ricambi, 0),
         coalesce(costo_ricambi, 0), coalesce(totale, 0),
         coalesce(metodo_pagamento, 'contanti'), coalesce(importo_contanti, 0),
         coalesce(importo_pos, 0), 'completato', note, operatore_id, operatore_nome
  from jsonb_populate_record(null::public.officina_interventi, p_intervento)
  returning * into v_int;

  insert into public.officina_interventi_righe (
    intervento_id, articolo_id, codice_articolo, nome_articolo, quantita,
    prezzo_unitario, costo_unitario, totale_riga
  )
  select v_int.id, articolo_id, codice_articolo, nome_articolo, quantita,
         prezzo_unitario, costo_unitario, totale_riga
  from jsonb_populate_recordset(null::public.officina_interventi_righe, p_righe);

  -- scarico giacenze (solo righe collegate a un articolo)
  for d in select * from jsonb_to_recordset(p_righe) as x(articolo_id uuid, quantita numeric)
  loop
    if d.articolo_id is not null then
      perform public.movimenta_giacenza_officina(d.articolo_id, -d.quantita);
    end if;
  end loop;

  -- intervento a costo zero (garanzia/cortesia): scarica i ricambi ma
  -- non crea nessuna vendita, cosi' non sporca la cassa
  if coalesce(v_int.totale, 0) > 0 then
    v_codice_ven := public.get_prossimo_codice('VEN', 'vendite', 'codice');

    insert into public.vendite (
      codice, data, ora, operatore_id, operatore_nome, subtotale, sconto_globale,
      sconto_globale_tipo, totale, metodo_pagamento, importo_contanti, importo_pos,
      importo_buono, importo_wallet, resto, stato, note
    ) values (
      v_codice_ven, v_int.data, v_int.ora, v_int.operatore_id, v_int.operatore_nome,
      v_int.totale, 0, 'fisso', v_int.totale, v_int.metodo_pagamento,
      v_int.importo_contanti, v_int.importo_pos, 0, 0, 0, 'completata',
      'Officina ' || v_int.codice || coalesce(' - ' || v_int.targa, '')
    )
    returning * into v_vendita;

    insert into public.vendite_dettaglio (
      vendita_id, prodotto_id, codice_prodotto, nome_prodotto, categoria,
      quantita, prezzo_unitario, sconto, sconto_tipo, totale_riga
    )
    select v_vendita.id, null, r.codice_articolo, r.nome_articolo, 'Officina',
           r.quantita, r.prezzo_unitario, 0, 'fisso', r.totale_riga
      from public.officina_interventi_righe r
     where r.intervento_id = v_int.id;

    if coalesce(v_int.manodopera, 0) > 0 then
      insert into public.vendite_dettaglio (
        vendita_id, prodotto_id, codice_prodotto, nome_prodotto, categoria,
        quantita, prezzo_unitario, sconto, sconto_tipo, totale_riga
      ) values (
        v_vendita.id, null, 'MANODOPERA', 'Manodopera officina', 'Officina',
        1, v_int.manodopera, 0, 'fisso', v_int.manodopera
      );
    end if;

    update public.officina_interventi
       set vendita_id = v_vendita.id
     where id = v_int.id
    returning * into v_int;
  end if;

  return to_jsonb(v_int);
end;
$$;

grant execute on function public.salva_intervento_officina(jsonb, jsonb) to authenticated;

-- ============================================================
-- 4. Annullo: ripristina le giacenze e annulla la vendita collegata.
-- La vendita annullata esce dal venduto di giornata, che filtra
-- per stato='completata'.
-- Idempotente: annullare due volte non raddoppia le giacenze.
-- ============================================================
create or replace function public.annulla_intervento_officina(p_intervento_id uuid)
  returns jsonb
  language plpgsql
  security invoker
  set search_path = public
as $$
declare
  v_int public.officina_interventi%rowtype;
  r     record;
begin
  select * into v_int from public.officina_interventi where id = p_intervento_id;
  if not found then
    raise exception 'Intervento non trovato: %', p_intervento_id;
  end if;
  if v_int.stato = 'annullato' then
    return to_jsonb(v_int);   -- gia' annullato: non fare nulla
  end if;

  for r in
    select articolo_id, quantita
      from public.officina_interventi_righe
     where intervento_id = p_intervento_id and articolo_id is not null
  loop
    perform public.movimenta_giacenza_officina(r.articolo_id, r.quantita);
  end loop;

  if v_int.vendita_id is not null then
    update public.vendite set stato = 'annullata' where id = v_int.vendita_id;
  end if;

  update public.officina_interventi
     set stato = 'annullato'
   where id = p_intervento_id
  returning * into v_int;

  return to_jsonb(v_int);
end;
$$;

grant execute on function public.annulla_intervento_officina(uuid) to authenticated;
```

- [ ] **Step 2: Applicare la migration**

```bash
node _scripts_local/apply_migration.js supabase/migrations/20260909_officina_rpc.sql
```

Atteso: `OK: migrazione applicata e committata: 20260909_officina_rpc.sql`.

- [ ] **Step 3: Verificare che le quattro funzioni esistano**

Aggiungere in coda a `supabase/migrations/20260909_officina_rpc.sql` un blocco di verifica che fallisce rumorosamente se una funzione manca. Essendo nella stessa transazione della migration, un errore fa ROLLBACK di tutto:

```sql
-- ============================================================
-- Verifica: le 4 funzioni esistono. Se una manca, la migration
-- fallisce e viene fatto ROLLBACK.
-- ============================================================
do $$
declare
  f text;
  mancanti text[] := '{}';
  attese text[] := array[
    'movimenta_giacenza_officina','carica_articolo_officina',
    'salva_intervento_officina','annulla_intervento_officina'
  ];
begin
  foreach f in array attese loop
    if not exists (
      select 1 from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = f
    ) then
      mancanti := mancanti || f;
    end if;
  end loop;
  if array_length(mancanti, 1) > 0 then
    raise exception 'Funzioni officina mancanti: %', array_to_string(mancanti, ', ');
  end if;
  raise notice 'Officina: tutte e 4 le funzioni sono presenti.';
end $$;
```

Rieseguire quindi lo Step 2. Atteso: `OK: migrazione applicata e committata`, senza eccezioni. Il comportamento vero delle RPC viene esercitato dall'interfaccia nei Task 6-8.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260909_officina_rpc.sql
git commit -m "feat(officina): RPC atomiche carico, intervento con vendita, annullo"
```

---

### Task 4: Livello API

**Files:**
- Modify: `js/api.js` (aggiungere una sezione `--- Officina ---` prima del blocco `return { ... }` finale, e le voci corrispondenti dentro quel blocco)

**Interfaces:**
- Consumes: helper interni già presenti in `api.js` — `getClient()`, `insert(tabella, data)`, `update(tabella, id, data)`, `remove(tabella, id)`, `generaCodice(tabella, prefisso)`, `scriviLog(azione, modulo, dettagli)`.
- Produces: su `ENI.API`:
  - `getArticoliOfficina(filtri) -> Promise<Array>` — `filtri` opzionale `{ soloAttivi: bool }`
  - `salvaArticoloOfficina(dati) -> Promise<Object>` (genera il codice `OFF`)
  - `aggiornaArticoloOfficina(id, dati) -> Promise<Object>`
  - `eliminaArticoloOfficina(id) -> Promise<true>`
  - `getCarichiOfficina(articoloId) -> Promise<Array>`
  - `caricaArticoloOfficina(dati) -> Promise<Object>` (RPC)
  - `getInterventiOfficina(filtri) -> Promise<Array>` — `filtri` `{ dataDa, dataA, targa }`
  - `getInterventoDettaglio(interventoId) -> Promise<Array>`
  - `salvaInterventoOfficina(intervento, righe) -> Promise<Object>` (RPC)
  - `annullaInterventoOfficina(interventoId) -> Promise<Object>` (RPC)
  - `getSottoScortaOfficina() -> Promise<Array>`

- [ ] **Step 1: Aggiungere la sezione Officina in `js/api.js`**

Inserire questo blocco subito prima del `return {` finale del modulo (cercare `// --- Manutenzioni ---` per orientarsi sullo stile; la nuova sezione va in fondo alle funzioni, prima dell'oggetto esportato):

```javascript
    // --- Officina ---
    // Magazzino ricambi dell'officina (lampadine, batterie, gomme...),
    // separato dal Magazzino del distributore.

    async function getArticoliOfficina(filtri) {
        filtri = filtri || {};
        var query = getClient()
            .from('officina_articoli')
            .select('*')
            .order('nome', { ascending: true });

        if (filtri.soloAttivi) query = query.eq('attivo', true);

        var result = await query;
        if (result.error) throw new Error(result.error.message);
        return result.data || [];
    }

    async function salvaArticoloOfficina(dati) {
        var codice = await generaCodice('officina_articoli', 'OFF');
        dati.codice = codice;
        var record = await insert('officina_articoli', dati);
        await scriviLog('Nuovo_Articolo_Officina', 'Officina', codice + ' - ' + (dati.nome || ''));
        return record;
    }

    async function aggiornaArticoloOfficina(id, dati) {
        var record = await update('officina_articoli', id, dati);
        await scriviLog('Modifica_Articolo_Officina', 'Officina', (record.codice || id) + ' - ' + (record.nome || ''));
        return record;
    }

    async function eliminaArticoloOfficina(id) {
        // Bloccato se l'articolo compare in un intervento: cancellarlo
        // falserebbe lo storico. In quel caso si mette attivo = false.
        var usato = await getClient()
            .from('officina_interventi_righe')
            .select('id')
            .eq('articolo_id', id)
            .limit(1);
        if (usato.error) throw new Error(usato.error.message);
        if (usato.data && usato.data.length > 0) {
            throw new Error('Articolo gia\' usato in un intervento: disattivalo invece di eliminarlo.');
        }
        await remove('officina_articoli', id);
        await scriviLog('Elimina_Articolo_Officina', 'Officina', String(id));
        return true;
    }

    async function getCarichiOfficina(articoloId) {
        var result = await getClient()
            .from('officina_carichi')
            .select('*')
            .eq('articolo_id', articoloId)
            .order('data', { ascending: false });
        if (result.error) throw new Error(result.error.message);
        return result.data || [];
    }

    // RPC atomica: riga di carico + giacenza + ultimo costo, tutto insieme.
    async function caricaArticoloOfficina(dati) {
        var payload = {
            articolo_id: dati.articolo_id,
            data: dati.data,
            quantita: Number(dati.quantita) || 0,
            costo_unitario: Number(dati.costo_unitario) || 0,
            fornitore: dati.fornitore || null,
            documento: dati.documento || null,
            note: dati.note || null,
            operatore_id: ENI.State.getUserId(),
            operatore_nome: ENI.State.getUserName()
        };
        var result = await getClient().rpc('carica_articolo_officina', { p_carico: payload });
        if (result.error) throw new Error(result.error.message);
        await scriviLog('Carico_Officina', 'Officina',
            payload.quantita + ' x ' + ENI.UI.formatValuta(payload.costo_unitario));
        return result.data;
    }

    async function getInterventiOfficina(filtri) {
        filtri = filtri || {};
        var query = getClient()
            .from('officina_interventi')
            .select('*')
            .order('data', { ascending: false })
            .order('created_at', { ascending: false });

        if (filtri.dataDa) query = query.gte('data', filtri.dataDa);
        if (filtri.dataA)  query = query.lte('data', filtri.dataA);
        if (filtri.targa)  query = query.eq('targa', ENI.OfficinaCalcoli.normalizzaTarga(filtri.targa));

        var result = await query;
        if (result.error) throw new Error(result.error.message);
        return result.data || [];
    }

    async function getInterventoDettaglio(interventoId) {
        var result = await getClient()
            .from('officina_interventi_righe')
            .select('*')
            .eq('intervento_id', interventoId);
        if (result.error) throw new Error(result.error.message);
        return result.data || [];
    }

    // RPC atomica: codice + testata + righe + scarico giacenze + vendita.
    // La vendita e' quella che porta l'incasso nel venduto di giornata in Cassa.
    async function salvaInterventoOfficina(intervento, righe) {
        var result = await getClient().rpc('salva_intervento_officina', {
            p_intervento: intervento,
            p_righe: righe || []
        });
        if (result.error) throw new Error(result.error.message);
        var rec = result.data;
        await scriviLog('Nuovo_Intervento_Officina', 'Officina',
            (rec && rec.codice ? rec.codice : '') + ' - ' + (rec && rec.targa ? rec.targa : '') +
            ' - ' + ENI.UI.formatValuta(rec ? rec.totale : 0));
        return rec;
    }

    async function annullaInterventoOfficina(interventoId) {
        var result = await getClient().rpc('annulla_intervento_officina', {
            p_intervento_id: interventoId
        });
        if (result.error) throw new Error(result.error.message);
        var rec = result.data;
        await scriviLog('Annulla_Intervento_Officina', 'Officina',
            rec && rec.codice ? rec.codice : String(interventoId));
        return rec;
    }

    async function getSottoScortaOfficina() {
        var result = await getClient()
            .from('officina_articoli')
            .select('id, codice, nome, giacenza, giacenza_minima, categoria')
            .eq('attivo', true)
            .gt('giacenza_minima', 0);
        if (result.error) throw new Error(result.error.message);
        return (result.data || []).filter(function(a) {
            return Number(a.giacenza) < Number(a.giacenza_minima);
        });
    }
```

- [ ] **Step 2: Esportare le funzioni**

Dentro il blocco `return { ... }` finale di `js/api.js`, aggiungere (subito dopo le voci delle Manutenzioni, per tenere raggruppato):

```javascript
        // Officina
        getArticoliOfficina: getArticoliOfficina,
        salvaArticoloOfficina: salvaArticoloOfficina,
        aggiornaArticoloOfficina: aggiornaArticoloOfficina,
        eliminaArticoloOfficina: eliminaArticoloOfficina,
        getCarichiOfficina: getCarichiOfficina,
        caricaArticoloOfficina: caricaArticoloOfficina,
        getInterventiOfficina: getInterventiOfficina,
        getInterventoDettaglio: getInterventoDettaglio,
        salvaInterventoOfficina: salvaInterventoOfficina,
        annullaInterventoOfficina: annullaInterventoOfficina,
        getSottoScortaOfficina: getSottoScortaOfficina,
```

- [ ] **Step 3: Bump di versione**

In `index.html`, incrementare di 1 il numero in `<script src="js/api.js?v=N"></script>`.

- [ ] **Step 4: Verificare dalla console**

Ricaricare l'app da `http://127.0.0.1:8080/`, fare login, e in console:

```javascript
await ENI.API.getArticoliOfficina()     // -> []
await ENI.API.getSottoScortaOfficina()  // -> []
await ENI.API.getInterventiOfficina()   // -> []
```

Atteso: tre array vuoti, nessun errore.

- [ ] **Step 5: Commit**

```bash
git add js/api.js index.html
git commit -m "feat(officina): livello API articoli, carichi e interventi"
```

---

### Task 5: Configurazione, rotte e navigazione

**Files:**
- Modify: `js/config.js`
- Modify: `js/router.js:15-42` (oggetto `_routes`)
- Modify: `index.html`

**Interfaces:**
- Consumes: `ENI.Modules.OfficinaRicambi` e `ENI.Modules.OfficinaInterventi` (creati nei Task 6 e 7 — fino ad allora le rotte esistono ma il modulo non risponde: è atteso).
- Produces: `ENI.Config.CATEGORIE_OFFICINA` (array di stringhe), sezione di menu `officina`, rotte `officina-ricambi` e `officina-interventi`.

- [ ] **Step 1: Aggiungere le categorie in `js/config.js`**

Subito dopo la riga `CATEGORIE_MAGAZZINO: [...]`:

```javascript
    // Categorie ricambi officina (separate da quelle del magazzino distributore)
    CATEGORIE_OFFICINA: ['Lampadine', 'Batterie', 'Gomme', 'Filtri', 'Oli e lubrificanti', 'Freni', 'Spazzole', 'Additivi', 'Minuteria', 'Altro'],
```

- [ ] **Step 2: Aggiungere i moduli al ruolo Admin**

In `js/config.js`, dentro `RUOLI.Admin`, aggiungere `'officina-ricambi', 'officina-interventi'` sia in `moduli` sia in `scrivere` (subito dopo `'magazzino'` in entrambi gli array). **Non** aggiungerli al Cassiere né a Lavaggi.

- [ ] **Step 3: Aggiungere la sezione di navigazione**

In `js/config.js`, dentro `NAV_SECTIONS`, aggiungere come ultimo elemento dell'array:

```javascript
        {
            id: 'officina',
            label: 'Officina',
            icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
            children: ['officina-ricambi', 'officina-interventi'],
            dividerBefore: true
        }
```

E dentro `NAV_SECTION_ITEMS`, aggiungere:

```javascript
        { id: 'officina-ricambi', label: 'Ricambi', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8"/></svg>', route: '#/officina-ricambi' },
        { id: 'officina-interventi', label: 'Interventi', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17h2l1.5-4.5h11L19 17h2"/><circle cx="7" cy="18" r="1.5"/><circle cx="17" cy="18" r="1.5"/><path d="M6.5 12.5 8 8h8l1.5 4.5"/></svg>', route: '#/officina-interventi' },
```

- [ ] **Step 4: Aggiungere le rotte**

In `js/router.js`, dentro `_routes`, dopo la riga `'manutenzioni': ...`:

```javascript
        'officina-ricambi':    { module: 'OfficinaRicambi',    id: 'officina-ricambi' },
        'officina-interventi': { module: 'OfficinaInterventi', id: 'officina-interventi' },
```

- [ ] **Step 5: Caricare gli script in `index.html`**

Aggiungere `js/lib/officina-calcoli.js` insieme alle altre lib (dopo `previsione-carburante.js`):

```html
    <script src="js/lib/officina-calcoli.js?v=1"></script>
```

E i due moduli insieme agli altri (dopo `magazzino.js`):

```html
    <script src="js/modules/officina.js?v=1"></script>
    <script src="js/modules/officina-interventi.js?v=1"></script>
```

Incrementare inoltre `?v=` di `js/config.js` e `js/router.js`.

- [ ] **Step 6: Verificare il menu**

Ricaricare l'app, login come super admin. Atteso: nella sidebar compare la sezione **Officina** con dentro **Ricambi** e **Interventi**. Cliccando una voce la pagina resta vuota e la console segnala che il modulo non esiste — corretto, i moduli arrivano ai Task 6 e 7.

- [ ] **Step 7: Commit**

```bash
git add js/config.js js/router.js index.html
git commit -m "feat(officina): categorie, ruoli, rotte e sezione di menu"
```

---

### Task 6: Modulo Ricambi

**Files:**
- Create: `js/modules/officina.js`
- Modify: `index.html` (bump `?v=` di `officina.js` se già presente dal Task 5)

**Interfaces:**
- Consumes: `ENI.API.getArticoliOfficina`, `salvaArticoloOfficina`, `aggiornaArticoloOfficina`, `eliminaArticoloOfficina`, `getCarichiOfficina`, `caricaArticoloOfficina`, `getSottoScortaOfficina`; `ENI.OfficinaCalcoli.valoreInventario`, `margine`; `ENI.Config.CATEGORIE_OFFICINA`; `ENI.State.canWrite`; `ENI.UI.*`.
- Produces: `ENI.Modules.OfficinaRicambi.render(container)`.

Seguire fedelmente la struttura di `js/modules/magazzino.js`: stato di modulo in variabili private, `render()` che scrive l'HTML e poi chiama `_setupEvents()` e `_loadArticoli()`, `ENI.UI.delegate` per gli eventi delegati, `ENI.UI.escapeHtml` su ogni valore dal database.

- [ ] **Step 1: Leggere il modulo di riferimento**

Leggere `js/modules/magazzino.js` per intero prima di scrivere. In particolare: come costruisce la barra filtri con le chip, come pagina la lista, come apre le modali di form, come gestisce il pulsante di export. Il modulo Ricambi replica quelle convenzioni, non ne inventa di nuove.

Rileggere anche le funzioni helper disponibili in `js/ui.js` (`ENI.UI.modal`, `delegate`, `escapeHtml`, `formatValuta`, `formatData`, `oggiISO`, `success`, `error`, `confirm`) per usare quelle esistenti invece di riscriverle.

- [ ] **Step 2: Scrivere il modulo**

Creare `js/modules/officina.js` con questa struttura:

```javascript
// ============================================================
// GESTIONALE ENI - Modulo Officina / Ricambi
// Anagrafica ricambi con giacenze, costo d'acquisto e prezzo di
// rivendita. Separato dal Magazzino del distributore.
// ============================================================

var ENI = ENI || {};
ENI.Modules = ENI.Modules || {};

ENI.Modules.OfficinaRicambi = (function() {
    'use strict';

    var _articoli = [];
    var _categoriaFiltro = 'Tutti';
    var _searchTerm = '';
    var _paginaCorrente = 1;
    var _perPagina = 25;

    async function render(container) {
        var canWrite = ENI.State.canWrite('officina-ricambi');

        container.innerHTML =
            '<div class="page-header">' +
                '<h1 class="page-title">\u{1F527} Ricambi Officina</h1>' +
                '<div class="page-header-actions">' +
                    '<button class="btn btn-outline" id="btn-export-officina">\u{1F4E4} Esporta</button>' +
                    (canWrite ? '<button class="btn btn-primary" id="btn-nuovo-articolo">➕ Nuovo Ricambio</button>' : '') +
                '</div>' +
            '</div>' +
            '<div id="officina-totali"></div>' +
            '<div id="officina-alerts"></div>' +
            '<div class="filter-bar">' +
                '<input type="text" class="form-input" id="search-articoli" placeholder="\u{1F50D} Cerca ricambio...">' +
                '<div class="filter-chips">' +
                    '<button class="chip active" data-cat="Tutti">Tutti</button>' +
                    ENI.Config.CATEGORIE_OFFICINA.map(function(c) {
                        return '<button class="chip" data-cat="' + c + '">' + c + '</button>';
                    }).join('') +
                '</div>' +
            '</div>' +
            '<div id="officina-list"></div>';

        _setupEvents(container);
        await _loadArticoli();
    }

    // ... resto del modulo, vedi step successivi
})();
```

Implementare poi, nello stesso IIFE:

- `_loadArticoli()` — chiama `ENI.API.getArticoliOfficina()`, salva in `_articoli`, poi `_renderTotali()`, `_renderAlerts()`, `_renderList()`. In `catch`: `ENI.UI.error('Errore caricamento ricambi')`.
- `_renderTotali()` — usa `ENI.OfficinaCalcoli.valoreInventario(_articoli)` e scrive tre riquadri in `#officina-totali`: *Valore a costo*, *Valore a prezzo di vendita*, *Margine potenziale* (euro e percentuale). Importi con `ENI.UI.formatValuta`.
- `_renderAlerts()` — filtra `_articoli` con `giacenza_minima > 0 && giacenza < giacenza_minima` e mostra un `.stock-alert` come fa `magazzino.js`; niente da mostrare se la lista è vuota.
- `_articoliFiltrati()` — applica `_categoriaFiltro` e `_searchTerm` (su `nome`, `codice`, `marca`, tutti in minuscolo).
- `_renderList()` — pagina il risultato con `_paginaCorrente`/`_perPagina` e per ogni articolo mostra: nome, codice, categoria, marca, giacenza + unità di misura, ultimo costo, prezzo di vendita, margine % (da `ENI.OfficinaCalcoli.margine`), valore riga (`giacenza × ultimo_costo`). Evidenziare in rosso la giacenza sotto scorta. Pulsanti per riga: `Carica`, `Modifica`, `Storico`, `Elimina` (solo se `canWrite`). Selettore 10/25/50/100 e controlli di pagina come in `magazzino.js`.
- `_showFormArticolo(articolo)` — modale con: nome (obbligatorio), categoria (`<select>` da `CATEGORIE_OFFICINA`), marca, unità di misura (default `pz`), giacenza iniziale (solo in creazione), giacenza minima, ultimo costo, prezzo di vendita, ubicazione, note, attivo. Al salvataggio chiama `salvaArticoloOfficina` o `aggiornaArticoloOfficina`, poi `ENI.UI.success(...)` e `_loadArticoli()`.
- `_showFormCarico(articolo)` — modale con: data (default `ENI.UI.oggiISO()`), quantità (obbligatoria, > 0), costo unitario (precompilato con `articolo.ultimo_costo`), fornitore, documento, note. Mostra sotto il campo un riepilogo dal vivo *"Totale carico: € X"* e *"Nuova giacenza: Y"*. Al salvataggio chiama `ENI.API.caricaArticoloOfficina`, poi ricarica.
- `_showStorico(articolo)` — modale con la tabella dei carichi da `getCarichiOfficina`, colonne data, quantità, costo unitario, costo totale, fornitore, documento; in fondo il totale speso complessivo per quell'articolo.
- `_eliminaArticolo(id)` — `ENI.UI.confirm(...)`, poi `eliminaArticoloOfficina`; l'errore "già usato in un intervento" arriva dall'API e va mostrato con `ENI.UI.error(e.message)`.
- `_esporta()` — CSV degli articoli filtrati, stesse colonne della lista, seguendo l'implementazione di export già presente in `magazzino.js`.

Chiudere con:

```javascript
    return { render: render };
})();
```

- [ ] **Step 3: Bump di versione**

In `index.html`, incrementare `?v=` di `js/modules/officina.js`.

- [ ] **Step 4: Verificare a mano**

Ricaricare l'app e andare su **Officina → Ricambi**. Verificare, nell'ordine:

1. La pagina si apre con lista vuota e i tre totali a zero.
2. **Nuovo Ricambio**: creare "Batteria 60Ah", categoria Batterie, giacenza minima 2, costo 55, prezzo 95. Compare in lista con margine 42,1%.
3. I totali in cima si aggiornano.
4. **Carica**: 4 pezzi a 52 € da "Ricambi SRL", documento "DDT 123". La giacenza passa a 4, l'ultimo costo a 52, il margine a 45,3%.
5. **Storico**: il carico compare con totale 208 €.
6. Impostare la giacenza minima a 10 e ricaricare: compare l'alert sotto scorta.
7. La ricerca per "batt" trova l'articolo; la chip "Gomme" lo nasconde; "Tutti" lo rimostra.
8. **Elimina** funziona (l'articolo non è ancora usato in interventi).

Ricreare l'articolo di prova per il Task 7.

- [ ] **Step 5: Commit**

```bash
git add js/modules/officina.js index.html
git commit -m "feat(officina): modulo ricambi con giacenze, carichi e valore inventario"
```

---

### Task 7: Modulo Interventi

**Files:**
- Create: `js/modules/officina-interventi.js`
- Modify: `index.html` (bump `?v=`)

**Interfaces:**
- Consumes: `ENI.API.getInterventiOfficina`, `getInterventoDettaglio`, `salvaInterventoOfficina`, `annullaInterventoOfficina`, `getArticoliOfficina`; `ENI.OfficinaCalcoli.totaliIntervento`, `normalizzaTarga`; `ENI.State.canWrite('officina-interventi')`, `getUserId`, `getUserName`; `ENI.UI.*`.
- Produces: `ENI.Modules.OfficinaInterventi.render(container)`.

- [ ] **Step 1: Scrivere il modulo**

Creare `js/modules/officina-interventi.js`:

```javascript
// ============================================================
// GESTIONALE ENI - Modulo Officina / Interventi
// Lavori sull'auto: ricambi usati + manodopera. Il salvataggio e'
// atomico lato DB (salva_intervento_officina): scarica le giacenze
// e crea la vendita che porta l'incasso nel venduto di giornata.
// ============================================================

var ENI = ENI || {};
ENI.Modules = ENI.Modules || {};

ENI.Modules.OfficinaInterventi = (function() {
    'use strict';

    var _interventi = [];
    var _articoli = [];        // catalogo per la ricerca nel form
    var _righe = [];           // righe dell'intervento in composizione
    var _filtroDa = '';
    var _filtroA = '';
    var _filtroTarga = '';

    async function render(container) {
        var canWrite = ENI.State.canWrite('officina-interventi');
        var oggi = new Date();
        var primo = new Date(oggi.getFullYear(), oggi.getMonth(), 1);
        _filtroDa = primo.toISOString().slice(0, 10);
        _filtroA  = ENI.UI.oggiISO();

        container.innerHTML =
            '<div class="page-header">' +
                '<h1 class="page-title">\u{1F6E0}️ Interventi Officina</h1>' +
                (canWrite ? '<button class="btn btn-primary" id="btn-nuovo-intervento">➕ Nuovo Intervento</button>' : '') +
            '</div>' +
            '<div class="filter-bar">' +
                '<input type="date" class="form-input" id="filtro-da" value="' + _filtroDa + '">' +
                '<input type="date" class="form-input" id="filtro-a" value="' + _filtroA + '">' +
                '<input type="text" class="form-input" id="filtro-targa" placeholder="\u{1F50D} Targa...">' +
            '</div>' +
            '<div id="interventi-list"></div>';

        _setupEvents(container);
        await _loadInterventi();
    }

    // ... resto del modulo
})();
```

Implementare nello stesso IIFE:

- `_setupEvents(container)` — cambio dei filtri data (ricarica), input targa con debounce 300 ms (come fa `magazzino.js` per la ricerca), pulsante nuovo intervento, e `ENI.UI.delegate` per i click su riga (dettaglio) e sul pulsante annulla.
- `_loadInterventi()` — `getInterventiOfficina({ dataDa: _filtroDa, dataA: _filtroA, targa: _filtroTarga })`, poi `_renderList()`.
- `_renderList()` — una riga per intervento: codice, data, targa, modello, descrizione troncata, totale, margine (`totale - costo_ricambi`, in euro e %). Gli interventi con `stato === 'annullato'` vanno mostrati barrati e in grigio, senza pulsante Annulla. In cima alla lista il totale del periodo: incassato e margine.
- `_showFormIntervento()` — carica il catalogo con `_articoli = await ENI.API.getArticoliOfficina({ soloAttivi: true })`, azzera `_righe = []`, e apre una modale con:
  - data (default oggi), targa, modello, descrizione;
  - blocco **Ricambi**: `<select>` con gli articoli (etichetta `nome — codice — giacenza X — € prezzo`), campo quantità, pulsante *Aggiungi*. Ogni aggiunta congela `costo_unitario` dall'articolo e precompila `prezzo_unitario` da `prezzo_vendita` (modificabile a mano nella riga). Un pulsante *Riga libera* aggiunge una riga con `articolo_id: null` e nome/prezzo digitati a mano;
  - lista delle righe aggiunte con quantità e prezzo modificabili, e pulsante per rimuovere;
  - campo **Manodopera**;
  - metodo di pagamento (`contanti` / `pos`);
  - riepilogo dal vivo con `ENI.OfficinaCalcoli.totaliIntervento(_righe, manodopera)`: totale ricambi, manodopera, **totale**, margine stimato in euro e %.
  - Se una riga ha quantità superiore alla giacenza, mostrare un avviso giallo sotto la riga (*"giacenza attuale: X"*) **senza bloccare il salvataggio**: il pezzo può essere fisicamente presente anche se l'anagrafica è indietro.
- `_salvaIntervento(dati)` — costruisce i due payload e chiama l'API:

```javascript
    async function _salvaIntervento(dati) {
        var tot = ENI.OfficinaCalcoli.totaliIntervento(_righe, dati.manodopera);
        var metodo = dati.metodo_pagamento || 'contanti';

        var intervento = {
            data: dati.data,
            ora: new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            targa: ENI.OfficinaCalcoli.normalizzaTarga(dati.targa),
            modello: dati.modello || null,
            descrizione: dati.descrizione || null,
            manodopera: tot.manodopera,
            totale_ricambi: tot.totaleRicambi,
            costo_ricambi: tot.costoRicambi,
            totale: tot.totale,
            metodo_pagamento: metodo,
            importo_contanti: metodo === 'contanti' ? tot.totale : 0,
            importo_pos: metodo === 'pos' ? tot.totale : 0,
            note: dati.note || null,
            operatore_id: ENI.State.getUserId(),
            operatore_nome: ENI.State.getUserName()
        };

        var righe = _righe.map(function(r) {
            var q = Number(r.quantita) || 0;
            var p = Number(r.prezzo_unitario) || 0;
            return {
                articolo_id: r.articolo_id || null,
                codice_articolo: r.codice_articolo || null,
                nome_articolo: r.nome_articolo || '',
                quantita: q,
                prezzo_unitario: p,
                costo_unitario: Number(r.costo_unitario) || 0,
                totale_riga: q * p
            };
        });

        try {
            var rec = await ENI.API.salvaInterventoOfficina(intervento, righe);
            ENI.UI.success('Intervento ' + (rec && rec.codice ? rec.codice : '') + ' salvato');
            await _loadInterventi();
        } catch(e) {
            ENI.UI.error('Errore salvataggio intervento: ' + e.message);
        }
    }
```

- `_showDettaglio(intervento)` — modale con i dati di testata e la tabella delle righe da `getInterventoDettaglio`, più totali e margine. Pulsante **Annulla intervento** se `stato === 'completato'` e `canWrite`.
- `_annulla(intervento)` — `ENI.UI.confirm('Annullare l\'intervento ' + codice + '? Le giacenze tornano indietro e la vendita collegata viene annullata.')`, poi `ENI.API.annullaInterventoOfficina(intervento.id)` e ricarica.

Chiudere con `return { render: render };`.

- [ ] **Step 2: Bump di versione**

In `index.html`, incrementare `?v=` di `js/modules/officina-interventi.js`.

- [ ] **Step 3: Verificare a mano**

Su **Officina → Interventi**:

1. Creare un intervento: targa `ab 123 cd`, modello "Panda", due ricambi dal catalogo, manodopera 30 €, pagamento contanti.
2. Il riepilogo nel form mostra totale e margine coerenti prima del salvataggio.
3. Dopo il salvataggio l'intervento compare in lista con codice `OFI0001` e targa `AB123CD` (normalizzata).
4. Su **Officina → Ricambi**: le giacenze dei due ricambi sono scalate della quantità usata.
5. Il filtro targa: digitare `ab123cd` trova l'intervento; una targa inesistente non trova nulla.

- [ ] **Step 4: Commit**

```bash
git add js/modules/officina-interventi.js index.html
git commit -m "feat(officina): modulo interventi con scarico giacenze e incasso in cassa"
```

---

### Task 8: Verifica end-to-end e pulizia dei dati di prova

**Files:**
- Nessuna modifica di codice prevista. Se emergono difetti, correggerli qui e ricommittare.

**Interfaces:**
- Consumes: tutto quanto costruito nei Task 1-7.
- Produces: la conferma che la catena intervento → vendita → cassa funziona, e un database senza record di prova.

Questa è la verifica che conta: le prove dei task precedenti guardavano un pezzo alla volta.

- [ ] **Step 1: Intervento completo e controllo in Cassa**

1. Su **Officina → Ricambi**, creare l'articolo di prova `ZZTEST Lampadina H7`, categoria Lampadine, costo 4, prezzo 9, e caricarne 10 pezzi.
2. Su **Officina → Interventi**, creare un intervento **con la data di oggi**: targa `ZZ000ZZ`, 2 lampadine, manodopera 20 €, contanti. Totale atteso: **38,00 €** (2 × 9 + 20). Margine atteso: 30,00 € (38 − 8).
3. Annotare il totale e il numero di vendite mostrati in **Cassa** per oggi **prima** di questo passaggio, se non l'hai già fatto.
4. Aprire **Cassa** sulla data di oggi: il venduto negozio deve essere aumentato **esattamente di 38,00 €** rispetto a prima.
5. Su **Officina → Ricambi**: la giacenza della lampadina è 8.

- [ ] **Step 2: Annullo e ripristino**

1. Aprire il dettaglio dell'intervento e premere **Annulla intervento**.
2. La giacenza della lampadina torna a **10**.
3. L'intervento appare barrato con stato annullato.
4. **Cassa** sulla data di oggi: il venduto negozio è tornato al valore del punto 3 dello Step 1.

Se il venduto non torna indietro, la causa più probabile è che la vendita collegata non sia passata a `stato='annullata'`: verificare `vendita_id` sull'intervento e lo stato di quella vendita.

- [ ] **Step 3: Intervento a costo zero**

1. Creare un intervento con 1 lampadina, prezzo di riga forzato a 0 e manodopera 0.
2. Atteso: la giacenza scende a 9, ma il venduto in **Cassa** non cambia e l'intervento ha `vendita_id` vuoto.
3. Annullarlo: la giacenza torna a 10.

- [ ] **Step 4: Verifica dei permessi**

1. Fare logout e login come utente **Cassiere**.
2. Atteso: la sezione **Officina** non compare nel menu.
3. Digitare a mano `#/officina-ricambi` nella barra degli indirizzi: l'accesso deve essere negato (stesso comportamento degli altri moduli riservati).

- [ ] **Step 5: Ripassare i test unitari**

Aprire `http://127.0.0.1:8080/test/test-officina.html`.
Atteso: **21 passati, 0 falliti**. Se qualcosa è stato toccato nel frattempo, sistemarlo prima di proseguire.

- [ ] **Step 6: Cancellare i dati di prova**

Il database è quello di produzione: i record creati per i test vanno via, e **solo quelli**.

Creare `_scripts_local/pulizia_test_officina.sql`:

```sql
-- Cancella SOLO i dati di prova del modulo Officina (articolo 'ZZTEST%',
-- interventi con targa 'ZZ000ZZ') e le vendite che ne sono derivate.
-- Non tocca nessun dato reale.
begin;

-- vendite generate dagli interventi di prova
delete from public.vendite_dettaglio
 where vendita_id in (
   select vendita_id from public.officina_interventi
    where targa = 'ZZ000ZZ' and vendita_id is not null
 );

delete from public.vendite
 where id in (
   select vendita_id from public.officina_interventi
    where targa = 'ZZ000ZZ' and vendita_id is not null
 );

-- interventi di prova (le righe cadono in cascata)
delete from public.officina_interventi where targa = 'ZZ000ZZ';

-- carichi e articolo di prova
delete from public.officina_carichi
 where articolo_id in (select id from public.officina_articoli where nome like 'ZZTEST%');

delete from public.officina_articoli where nome like 'ZZTEST%';

commit;
```

Eseguirlo:

```bash
node _scripts_local/apply_migration.js _scripts_local/pulizia_test_officina.sql
```

Poi verificare nell'app: **Cassa** di oggi torna ai valori originali, **Ricambi** e **Interventi** sono vuoti (o contengono solo dati reali).

- [ ] **Step 7: Commit finale**

```bash
git add _scripts_local/pulizia_test_officina.sql
git commit -m "chore(officina): script di pulizia dei dati di prova"
```

Non pubblicare su `main` finché l'utente non ha provato il modulo e dato l'ok: l'app è servita da GitHub Pages dal branch `main`, quindi ogni push va subito in produzione.

---

## Note di verifica finale del piano

- **Copertura della spec:** tutte le sezioni della spec hanno un task — dati (2), RPC (3), sicurezza (2 per la RLS, 5 per i ruoli, 8 per la verifica), moduli e wiring (5, 6, 7), interfaccia (6, 7), casi limite (6 per prezzo mancante e giacenza, 7 per riga libera e giacenza insufficiente, 8 per intervento a zero), verifica (8).
- **Coerenza dei nomi:** `ENI.OfficinaCalcoli` è definito nel Task 1 e usato con gli stessi nomi di funzione nei Task 4, 6 e 7. Le RPC definite nel Task 3 sono chiamate con la stessa firma nel Task 4. I moduli `OfficinaRicambi` / `OfficinaInterventi` dichiarati nelle rotte del Task 5 corrispondono ai nomi creati nei Task 6 e 7.
- **Ordine di esecuzione:** i task vanno eseguiti in sequenza. Il Task 5 lascia volutamente il menu con due voci che non aprono nulla finché i Task 6 e 7 non sono completi.
