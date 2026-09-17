# Bonus venduto ai dipendenti — piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** dare ai dipendenti un bonus in euro sugli articoli che il gestore sceglie, registrato dal loro portale con una sola operazione, visibile in tempo reale e pagabile in busta il mese dopo.

**Architecture:** calcolo puro isolato in `js/lib/bonus-calcoli.js` (testabile da riga di comando), scrittura atomica lato database con un'RPC che ricava autore e prezzo dal server, e tre schermate che consumano entrambi: Impostazioni per la regola, Magazzino per gli articoli, portale dipendente per la vendita. La stessa aritmetica esiste in JavaScript e in SQL, e un test di parità verifica che non divergano.

**Tech Stack:** JavaScript ES5 in moduli IIFE sul namespace globale `ENI`, nessun passo di build; Supabase (Postgres, RLS, funzioni PL/pgSQL); test con `node` senza framework.

**Spec:** `docs/superpowers/specs/2026-09-17-bonus-venduto-design.md`

## Global Constraints

- **ES5, niente build.** Nessun `let`, `const`, arrow function, template literal, `async/await` nei file di libreria. `async/await` è ammesso solo in `js/api.js` e nei moduli, dove è già in uso.
- **Ogni modulo è un IIFE** che si appende a `ENI.Modules` o `ENI` e finisce con `})(typeof window !== 'undefined' ? window : this);` oppure `})();` secondo il file vicino.
- **Ogni modifica a un `.js` richiede di alzare il `?v=` di quel file in `index.html`.** Un file nuovo va aggiunto a `index.html` con `?v=1`.
- **Le migration NON si applicano da qui.** Il database è in produzione e l'accesso MCP è in sola lettura. Ogni migration va consegnata al gestore, che la lancia nel SQL Editor di Supabase. Una task che dipende da una migration non applicata va fermata lì.
- **Mai modificare o cancellare dati reali.** Le query di verifica sono solo `SELECT`.
- **Interfaccia in italiano**, commenti nel codice in italiano.
- **RLS:** ogni tabella nuova nasce con `alter table ... enable row level security` e le sue policy nella stessa migration. Nessuna tabella senza policy.
- **Arrotondamento:** ogni importo in euro si arrotonda a 2 decimali con `Math.round(n * 100) / 100` (JS) e `round(n::numeric, 2)` (SQL).
- **Fasce:** una fascia vale dal proprio `da_prezzo` **incluso** fino al `da_prezzo` della successiva **escluso**. L'ultima è aperta. Un pezzo da 10,00 € con fasce 0/10/30 cade nella fascia che parte da 10.
- **Test:** si eseguono con `node test/<file>.js` dalla radice del progetto. Non esiste `package.json` né un runner: ogni file di test è autonomo, stampa `ok`/`FAIL` per asserzione e chiude con `process.exit(fail === 0 ? 0 : 1)`.
- **Commit:** in italiano, prefisso `feat(bonus):` / `fix(bonus):` / `docs(bonus):`, e in coda `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **Branch:** tutto il lavoro su `feat/bonus-venduto`, creato da `main`. `main` è la produzione servita da GitHub Pages: non ci si committa direttamente.

---

## Struttura dei file

| File | Responsabilità |
|---|---|
| `js/lib/bonus-calcoli.js` | **creare** — fascia per prezzo, bonus di una riga, diagnosi della configurazione. Niente DOM, niente rete |
| `test/test-bonus-calcoli.js` | **creare** — test dei calcoli puri |
| `supabase/migrations/20260917_bonus_schema.sql` | **creare** — colonna su `magazzino`, tre tabelle nuove, helper `current_staff_id()`, RLS |
| `supabase/migrations/20260917_bonus_rpc.sql` | **creare** — `bonus_riga_calcola`, `registra_vendita_bonus`, `ricalcola_periodo_bonus` |
| `sql/verifica_bonus_parita.sql` | **creare** — stampa il bonus SQL sui casi di prova, da confrontare col JS |
| `js/api.js` | **modificare** — funzioni di lettura/scrittura del bonus |
| `test/test-bonus-api.js` | **creare** — test delle funzioni API con client Supabase finto |
| `js/modules/impostazioni.js` | **modificare** — sezione "Bonus venduto" |
| `js/modules/magazzino.js` | **modificare** — scheda di modifica articolo (Task 6), interruttore bonus nell'elenco e filtro (Task 7) |
| `js/modules/bonus-venduto.js` | **creare** — portale dipendente: portafoglio, "ho venduto", elenco |
| `js/modules/bonus-gestione.js` | **creare** — Gestione Personale: riepilogo per mese, correzioni, pagamento |
| `test/test-bonus-moduli.js` | **creare** — test di cablaggio sui tre moduli |
| `js/config.js` | **modificare** — voci di menu e permessi di ruolo |
| `index.html` | **modificare** — tag `<script>` e `?v=` |

**Ordine obbligato:** Task 1 (calcoli) → Task 2 e 3 (database) → Task 4 (API) → Task 5, 6, 7, 8, 9 (schermate, indipendenti fra loro).

**Nota su Magazzino:** oggi il modulo ha solo il form "nuovo prodotto" e la rettifica di giacenza, **nessuna scheda di modifica articolo**: un refuso nel nome o un decimale sbagliato nel prezzo obbligano a disattivare l'articolo e rifarlo, perdendo lo storico. La **Task 6** colma questo buco ed è utile a prescindere dal bonus; la funzione `ENI.API.aggiornaProdotto` esiste già in `js/api.js:881` e non la chiama nessuno, quindi è solo lavoro di interfaccia. La **Task 7** aggiunge in più l'interruttore bonus direttamente nella riga dell'elenco: serve per accendere e spegnere in fretta molti articoli senza aprire una scheda alla volta. Le due cose convivono, e il campo bonus c'è in entrambe.

---

### Task 1: Calcoli puri del bonus

**Files:**
- Create: `js/lib/bonus-calcoli.js`
- Test: `test/test-bonus-calcoli.js`
- Modify: `index.html` (aggiungere il tag script)

**Interfaces:**
- Consumes: niente.
- Produces:
  - `ENI.BonusCalcoli.arrotonda(n)` → number a 2 decimali
  - `ENI.BonusCalcoli.fasciaPerPrezzo(prezzo, fasce)` → `{ da_prezzo, percentuale }` oppure `null`
  - `ENI.BonusCalcoli.bonusRiga(prezzoUnitario, quantita, regola)` → `{ bonus, regolaModo, regolaValore }`
  - `ENI.BonusCalcoli.problemiConfigurazione(regola)` → array di stringhe in italiano
  - dove `regola` = `{ modo: 'euro'|'percentuale', euroPezzo: number, fasce: [{ da_prezzo, percentuale }] }`

- [ ] **Step 1: Creare il branch**

```bash
git checkout main
git pull origin main
git checkout -b feat/bonus-venduto
```

- [ ] **Step 2: Scrivere il test che fallisce**

Creare `test/test-bonus-calcoli.js`:

```javascript
// Eseguire con: node test/test-bonus-calcoli.js
//
// Calcolo del bonus venduto. Gli articoli valgono 10-30 EUR e il bonus e'
// di pochi euro: un errore di arrotondamento o di estremo di fascia qui
// vale centesimi, ma sono i centesimi che il dipendente conta.
const fs = require('fs');
const vm = require('vm');
const P = 'C:/Users/Utente1/Documents/gestionale_eni/';

let pass = 0, fail = 0;
function check(nome, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + nome); }
  else { fail++; console.log('  FAIL ' + nome + (extra !== undefined ? ' -> ' + extra : '')); }
}

const sandbox = { console };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(P + 'js/lib/bonus-calcoli.js', 'utf8'), sandbox,
  { filename: 'bonus-calcoli.js' });
const B = sandbox.ENI.BonusCalcoli;

// Le fasce dell'esempio concordato col gestore.
const FASCE = [
  { da_prezzo: 0,  percentuale: 3 },
  { da_prezzo: 10, percentuale: 5 },
  { da_prezzo: 30, percentuale: 7 }
];
const PERC  = { modo: 'percentuale', euroPezzo: 0, fasce: FASCE };
const EURO  = { modo: 'euro', euroPezzo: 1, fasce: [] };

console.log('\n--- scelta della fascia ---');
check('9,99 sta nella fascia da 0',   B.fasciaPerPrezzo(9.99, FASCE).da_prezzo === 0);
check('10,00 SALE alla fascia da 10', B.fasciaPerPrezzo(10, FASCE).da_prezzo === 10,
  JSON.stringify(B.fasciaPerPrezzo(10, FASCE)));
check('10,50 resta nella fascia da 10', B.fasciaPerPrezzo(10.5, FASCE).da_prezzo === 10);
check('29,99 resta nella fascia da 10', B.fasciaPerPrezzo(29.99, FASCE).da_prezzo === 10);
check('30,00 sale alla fascia da 30', B.fasciaPerPrezzo(30, FASCE).da_prezzo === 30);
check('1000 sta nell ultima fascia',  B.fasciaPerPrezzo(1000, FASCE).da_prezzo === 30);
check('fasce disordinate danno lo stesso risultato',
  B.fasciaPerPrezzo(12, [FASCE[2], FASCE[0], FASCE[1]]).da_prezzo === 10);
check('nessuna fascia -> null', B.fasciaPerPrezzo(12, []) === null);
check('prezzo sotto la prima soglia -> null',
  B.fasciaPerPrezzo(3, [{ da_prezzo: 10, percentuale: 5 }]) === null);

console.log('\n--- bonus della riga, a percentuale ---');
let r = B.bonusRiga(12, 3, PERC);
check('3 pezzi da 12 EUR al 5% fanno 1,80', r.bonus === 1.8, r.bonus);
check('registra il modo applicato', r.regolaModo === 'percentuale');
check('registra la percentuale applicata', r.regolaValore === 5, r.regolaValore);

check('un pezzo da 25 EUR rende 1,25', B.bonusRiga(25, 1, PERC).bonus === 1.25);
check('un pezzo da 8 EUR rende 0,24',  B.bonusRiga(8, 1, PERC).bonus === 0.24);
check('un pezzo da 10 EUR rende 0,50 (fascia superiore)',
  B.bonusRiga(10, 1, PERC).bonus === 0.5, B.bonusRiga(10, 1, PERC).bonus);
check('un pezzo da 50 EUR rende 3,50',  B.bonusRiga(50, 1, PERC).bonus === 3.5);

console.log('\n--- bonus della riga, a euro fisso ---');
r = B.bonusRiga(25, 3, EURO);
check('3 pezzi a 1 EUR fanno 3,00', r.bonus === 3);
check('il prezzo non conta in modalita euro', B.bonusRiga(8, 3, EURO).bonus === 3);
check('registra il modo applicato', r.regolaModo === 'euro');
check('registra l importo applicato', r.regolaValore === 1);

console.log('\n--- arrotondamento ---');
check('arrotonda a 2 decimali', B.arrotonda(1.005) === 1.01, B.arrotonda(1.005));
check('non introduce code binarie', B.arrotonda(0.1 + 0.2) === 0.3);
check('7 pezzi da 13,33 al 5% fanno 4,67',
  B.bonusRiga(13.33, 7, PERC).bonus === 4.67, B.bonusRiga(13.33, 7, PERC).bonus);

console.log('\n--- niente deve esplodere ---');
check('nessuna fascia applicabile -> bonus 0', B.bonusRiga(3, 1,
  { modo: 'percentuale', euroPezzo: 0, fasce: [{ da_prezzo: 10, percentuale: 5 }] }).bonus === 0);
check('quantita zero -> bonus 0', B.bonusRiga(25, 0, PERC).bonus === 0);
check('quantita negativa -> bonus 0', B.bonusRiga(25, -3, PERC).bonus === 0);
check('prezzo negativo -> bonus 0', B.bonusRiga(-5, 1, PERC).bonus === 0);
check('valori non numerici -> bonus 0', B.bonusRiga('abc', 'x', PERC).bonus === 0);
check('regola assente -> bonus 0', B.bonusRiga(25, 1, null).bonus === 0);
check('modo sconosciuto -> bonus 0',
  B.bonusRiga(25, 1, { modo: 'boh', euroPezzo: 1, fasce: FASCE }).bonus === 0);

console.log('\n--- diagnosi della configurazione ---');
check('configurazione a percentuale sana: nessun problema',
  B.problemiConfigurazione(PERC).length === 0, JSON.stringify(B.problemiConfigurazione(PERC)));
check('configurazione a euro sana: nessun problema',
  B.problemiConfigurazione(EURO).length === 0);
check('nessuna fascia viene segnalato',
  B.problemiConfigurazione({ modo: 'percentuale', euroPezzo: 0, fasce: [] }).length === 1);
check('buco sotto la prima fascia viene segnalato',
  B.problemiConfigurazione({ modo: 'percentuale', euroPezzo: 0,
    fasce: [{ da_prezzo: 10, percentuale: 5 }] }).length === 1);
check('due fasce dallo stesso importo vengono segnalate',
  B.problemiConfigurazione({ modo: 'percentuale', euroPezzo: 0,
    fasce: [{ da_prezzo: 0, percentuale: 3 }, { da_prezzo: 0, percentuale: 5 }] }).length === 1);
check('percentuale fuori scala viene segnalata',
  B.problemiConfigurazione({ modo: 'percentuale', euroPezzo: 0,
    fasce: [{ da_prezzo: 0, percentuale: 150 }] }).length === 1);
check('importo al pezzo a zero viene segnalato',
  B.problemiConfigurazione({ modo: 'euro', euroPezzo: 0, fasce: [] }).length === 1);
check('i messaggi sono leggibili, non codici',
  B.problemiConfigurazione({ modo: 'percentuale', euroPezzo: 0, fasce: [] })[0].length > 20);

console.log('\n' + pass + ' passati, ' + fail + ' falliti');
process.exit(fail === 0 ? 0 : 1);
```

- [ ] **Step 3: Eseguire il test e verificare che fallisca**

Run: `node test/test-bonus-calcoli.js`
Expected: FAIL con `ENOENT ... js/lib/bonus-calcoli.js` — il file non esiste ancora.

- [ ] **Step 4: Scrivere la libreria**

Creare `js/lib/bonus-calcoli.js`:

```javascript
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

    // Due decimali. Il +Number.EPSILON evita che 1.005 scenda a 1.00 per via
    // della rappresentazione binaria.
    function arrotonda(n) {
        n = num(n);
        return Math.round((n + Number.EPSILON) * 100) / 100;
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
            return { bonus: arrotonda(e * q), regolaModo: 'euro', regolaValore: e };
        }

        if (regola.modo === 'percentuale') {
            var f = fasciaPerPrezzo(p, regola.fasce);
            if (!f) return { bonus: 0, regolaModo: 'percentuale', regolaValore: 0 };
            var perc = num(f.percentuale);
            return {
                bonus: arrotonda(p * q * perc / 100),
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
```

- [ ] **Step 5: Eseguire il test e verificare che passi**

Run: `node test/test-bonus-calcoli.js`
Expected: PASS, `0 falliti`.

- [ ] **Step 6: Aggiungere il tag script**

In `index.html`, subito **dopo** la riga di `js/lib/cassa-quadratura.js`:

```html
    <script src="js/lib/bonus-calcoli.js?v=1"></script>
```

- [ ] **Step 7: Commit**

```bash
git add js/lib/bonus-calcoli.js test/test-bonus-calcoli.js index.html
git commit -F - <<'EOF'
feat(bonus): calcoli puri del bonus venduto

Fascia scelta sul prezzo del singolo pezzo (estremo incluso: 10,00 sale
alla fascia che parte da 10), bonus a percentuale o a euro fisso, e una
diagnosi in italiano degli errori di configurazione.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 2: Schema del database

**Files:**
- Create: `supabase/migrations/20260917_bonus_schema.sql`

**Interfaces:**
- Consumes: `public.personale`, `public.magazzino`, `public.vendite`, `public.is_staff()`.
- Produces: colonna `magazzino.bonus_attivo`; tabelle `bonus_fasce`, `bonus_movimenti`, `bonus_periodi`; funzione `public.current_staff_id()` → uuid.

- [ ] **Step 1: Scrivere la migration**

Creare `supabase/migrations/20260917_bonus_schema.sql`:

```sql
-- Bonus venduto ai dipendenti: schema
--
-- Il dipendente registra dal proprio portale la vendita di un articolo a
-- bonus; la vendita nasce da li' e gli accredita un importo in euro. La
-- regola (euro al pezzo, oppure percentuale a fasce di PREZZO DEL PEZZO) e'
-- unica per tutti gli articoli e sta nelle impostazioni.
--
-- Non tocca nessun dato esistente: aggiunge una colonna facoltativa a
-- magazzino e tre tabelle nuove.

-- 1) Chi e' il dipendente collegato ------------------------------------------
-- Accanto alle esistenti is_staff() / staff_role(). SECURITY DEFINER per lo
-- stesso motivo delle altre: la usa la RLS e non deve ricorrere su se stessa.
create or replace function public.current_staff_id()
  returns uuid
  language sql
  stable
  security definer
  set search_path = public
as $$
  select id from public.personale
  where auth_user_id = auth.uid() and attivo is true
  limit 1;
$$;

grant execute on function public.current_staff_id() to authenticated;

-- 2) Quali articoli danno bonus ----------------------------------------------
alter table public.magazzino
    add column if not exists bonus_attivo boolean not null default false;

comment on column public.magazzino.bonus_attivo is
    'L''articolo da'' bonus al dipendente che lo vende. Il COME si paga sta nelle impostazioni, uguale per tutti.';

create index if not exists magazzino_bonus_attivo_idx
    on public.magazzino (bonus_attivo) where bonus_attivo;

-- 3) Le fasce di prezzo (solo in modalita' percentuale) ----------------------
create table if not exists public.bonus_fasce (
    id           uuid primary key default gen_random_uuid(),
    da_prezzo    numeric(10,2) not null check (da_prezzo >= 0),
    percentuale  numeric(5,2)  not null check (percentuale > 0 and percentuale <= 100),
    created_at   timestamptz not null default now(),
    unique (da_prezzo)
);

comment on table public.bonus_fasce is
    'Fasce di prezzo del singolo pezzo. Si memorizza solo l''inizio: due estremi memorizzati possono divergere, uno no. La fascia arriva fino al da_prezzo della successiva, esclusa; l''ultima e'' aperta.';

-- 4) I movimenti: una riga per vendita a bonus -------------------------------
create table if not exists public.bonus_movimenti (
    id               uuid primary key default gen_random_uuid(),
    personale_id     uuid not null references public.personale(id),
    vendita_id       uuid references public.vendite(id) on delete cascade,
    magazzino_id     uuid references public.magazzino(id),
    nome_prodotto    text not null,
    quantita         integer not null check (quantita >= 1),
    prezzo_unitario  numeric(10,2) not null check (prezzo_unitario >= 0),
    imponibile       numeric(10,2) not null check (imponibile >= 0),
    regola_modo      text not null check (regola_modo in ('euro','percentuale')),
    regola_valore    numeric(10,2) not null default 0,
    bonus_calcolato  numeric(10,2) not null default 0,
    anno             integer not null,
    mese             integer not null check (mese between 1 and 12),
    modificato_da    uuid references public.personale(id),
    modificato_at    timestamptz,
    created_at       timestamptz not null default now()
);

comment on column public.bonus_movimenti.vendita_id is
    'Null quando la riga e'' stata aggiunta a mano dal gestore. on delete cascade: annullata la vendita, sparisce il bonus.';
comment on column public.bonus_movimenti.regola_modo is
    'Come era configurato il bonus QUEL giorno. Cambiare la regola domani non riscrive il passato.';

create index if not exists bonus_movimenti_periodo_idx
    on public.bonus_movimenti (personale_id, anno, mese);
create index if not exists bonus_movimenti_vendita_idx
    on public.bonus_movimenti (vendita_id);

-- 5) La chiusura mensile -----------------------------------------------------
create table if not exists public.bonus_periodi (
    id            uuid primary key default gen_random_uuid(),
    personale_id  uuid not null references public.personale(id),
    anno          integer not null,
    mese          integer not null check (mese between 1 and 12),
    venduto       numeric(10,2) not null default 0,
    bonus_totale  numeric(10,2) not null default 0,
    forzato       boolean not null default false,
    stato         text not null default 'da_pagare' check (stato in ('da_pagare','pagato')),
    pagato_at     timestamptz,
    pagato_da     uuid references public.personale(id),
    note          text,
    updated_at    timestamptz not null default now(),
    unique (personale_id, anno, mese)
);

comment on table public.bonus_periodi is
    'Solo i mesi CHIUSI. Il mese in corso si calcola al volo dai movimenti. Una volta creata, la riga non si ricalcola da sola: la aggiorna solo un gesto del gestore.';
comment on column public.bonus_periodi.forzato is
    'true se il totale e'' stato scritto a mano: da li'' in poi il ricalcolo non lo tocca.';

-- 6) RLS ---------------------------------------------------------------------
alter table public.bonus_fasce      enable row level security;
alter table public.bonus_movimenti  enable row level security;
alter table public.bonus_periodi    enable row level security;

-- Le fasce: tutti gli staff leggono (al dipendente serve per vedere la regola),
-- scrive solo chi puo' toccare le impostazioni, cioe' il super admin.
drop policy if exists bonus_fasce_lettura on public.bonus_fasce;
create policy bonus_fasce_lettura on public.bonus_fasce
    for select to authenticated using (public.is_staff());

drop policy if exists bonus_fasce_scrittura on public.bonus_fasce;
create policy bonus_fasce_scrittura on public.bonus_fasce
    for all to authenticated
    using (public.staff_role() = 'Super Admin')
    with check (public.staff_role() = 'Super Admin');

-- I movimenti: il dipendente vede SOLO i propri e non scrive mai.
-- L'unica strada per lui e' la funzione registra_vendita_bonus.
drop policy if exists bonus_movimenti_propri on public.bonus_movimenti;
create policy bonus_movimenti_propri on public.bonus_movimenti
    for select to authenticated
    using (personale_id = public.current_staff_id());

drop policy if exists bonus_movimenti_gestore on public.bonus_movimenti;
create policy bonus_movimenti_gestore on public.bonus_movimenti
    for all to authenticated
    using (public.staff_role() = 'Super Admin')
    with check (public.staff_role() = 'Super Admin');

-- I periodi: stesso schema.
drop policy if exists bonus_periodi_propri on public.bonus_periodi;
create policy bonus_periodi_propri on public.bonus_periodi
    for select to authenticated
    using (personale_id = public.current_staff_id());

drop policy if exists bonus_periodi_gestore on public.bonus_periodi;
create policy bonus_periodi_gestore on public.bonus_periodi
    for all to authenticated
    using (public.staff_role() = 'Super Admin')
    with check (public.staff_role() = 'Super Admin');
```

- [ ] **Step 2: Verificare che il ruolo si chiami davvero "Super Admin"**

Le policy usano `public.staff_role() = 'Super Admin'`. Controllare il valore reale:

Run (SELECT, sola lettura):
```sql
select distinct ruolo from public.personale;
```
Expected: fra i valori compare il ruolo del gestore. **Se la stringa è diversa** (es. `super_admin`), correggere le cinque occorrenze nella migration **prima** di consegnarla. Se invece il super admin si riconosce dalla colonna `personale.super_admin`, sostituire ogni `public.staff_role() = 'Super Admin'` con:

```sql
exists (select 1 from public.personale
        where auth_user_id = auth.uid() and attivo is true and super_admin is true)
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260917_bonus_schema.sql
git commit -F - <<'EOF'
feat(bonus): schema, helper current_staff_id e RLS

Colonna bonus_attivo su magazzino, tabelle bonus_fasce, bonus_movimenti e
bonus_periodi. Il dipendente legge solo le proprie righe e non scrive mai:
l'unica strada e' l'RPC. Nessun dato esistente viene toccato.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

- [ ] **Step 4: Consegnare la migration al gestore**

**Fermarsi qui e chiedere.** La migration va lanciata da lui nel SQL Editor di Supabase; l'accesso da qui è in sola lettura. Comunicare: percorso del file, che non tocca dati esistenti, e che le Task 3 e successive non possono essere verificate finché non è applicata.

- [ ] **Step 5: Verificare dopo l'applicazione**

Run (SELECT):
```sql
select column_name from information_schema.columns
where table_schema='public' and table_name='magazzino' and column_name='bonus_attivo';

select tablename, policyname from pg_policies
where schemaname='public' and tablename like 'bonus_%' order by tablename, policyname;
```
Expected: la colonna esiste; sei policy, due per tabella.

---

### Task 3: Le funzioni atomiche

**Files:**
- Create: `supabase/migrations/20260917_bonus_rpc.sql`
- Create: `sql/verifica_bonus_parita.sql`

**Interfaces:**
- Consumes: `public.salva_vendita(jsonb, jsonb, text)`, `public.current_staff_id()`, tabelle della Task 2, `js/lib/bonus-calcoli.js` (per il confronto di parità).
- Produces:
  - `public.bonus_regola_corrente()` → jsonb `{ modo, euro_pezzo, fasce }`
  - `public.bonus_riga_calcola(p_prezzo numeric, p_quantita integer)` → jsonb `{ bonus, regola_modo, regola_valore }`
  - `public.registra_vendita_bonus(p_magazzino_id uuid, p_quantita integer, p_metodo text)` → jsonb della vendita creata più `bonus_movimento_id`
  - `public.ricalcola_periodo_bonus(p_personale_id uuid, p_anno integer, p_mese integer)` → jsonb `{ venduto, bonus_totale }`

- [ ] **Step 1: Scrivere la migration**

Creare `supabase/migrations/20260917_bonus_rpc.sql`:

```sql
-- Bonus venduto: le funzioni.
--
-- registra_vendita_bonus e' SECURITY DEFINER per un motivo solo: deve poter
-- scrivere in bonus_movimenti, dove il dipendente non ha permesso di scrittura.
-- Proprio perche' bypassa la RLS, ogni controllo e' esplicito qui dentro, e
-- i due dati che contano - CHI vende e A QUANTO - non arrivano dal client.

-- 1) La regola configurata, in un colpo solo -------------------------------
create or replace function public.bonus_regola_corrente()
  returns jsonb
  language sql
  stable
  security definer
  set search_path = public
as $$
  select jsonb_build_object(
    'modo',       coalesce((select valore #>> '{}' from public.impostazioni_app
                            where chiave = 'bonus_modo'), 'percentuale'),
    'euro_pezzo', coalesce((select (valore #>> '{}')::numeric from public.impostazioni_app
                            where chiave = 'bonus_euro_pezzo'), 0),
    'fasce',      coalesce((select jsonb_agg(jsonb_build_object(
                                'da_prezzo', da_prezzo, 'percentuale', percentuale)
                                order by da_prezzo)
                            from public.bonus_fasce), '[]'::jsonb)
  );
$$;

grant execute on function public.bonus_regola_corrente() to authenticated;

-- 2) Il bonus di una riga --------------------------------------------------
-- Stessa aritmetica di js/lib/bonus-calcoli.js: la fascia si sceglie sul
-- PREZZO DEL PEZZO, estremo inferiore incluso; l'ultima fascia e' aperta.
create or replace function public.bonus_riga_calcola(p_prezzo numeric, p_quantita integer)
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path = public
as $$
declare
  v_regola jsonb;
  v_modo   text;
  v_euro   numeric;
  v_perc   numeric;
begin
  if p_prezzo is null or p_quantita is null or p_prezzo <= 0 or p_quantita <= 0 then
    return jsonb_build_object('bonus', 0, 'regola_modo', null, 'regola_valore', 0);
  end if;

  v_regola := public.bonus_regola_corrente();
  v_modo   := v_regola ->> 'modo';

  if v_modo = 'euro' then
    v_euro := coalesce((v_regola ->> 'euro_pezzo')::numeric, 0);
    return jsonb_build_object(
      'bonus',         round(v_euro * p_quantita, 2),
      'regola_modo',   'euro',
      'regola_valore', v_euro);
  end if;

  if v_modo = 'percentuale' then
    -- la fascia con il da_prezzo piu' alto fra quelli <= prezzo
    select (f ->> 'percentuale')::numeric into v_perc
    from jsonb_array_elements(v_regola -> 'fasce') as f
    where (f ->> 'da_prezzo')::numeric <= p_prezzo
    order by (f ->> 'da_prezzo')::numeric desc
    limit 1;

    if v_perc is null then
      return jsonb_build_object('bonus', 0, 'regola_modo', 'percentuale', 'regola_valore', 0);
    end if;

    return jsonb_build_object(
      'bonus',         round(p_prezzo * p_quantita * v_perc / 100, 2),
      'regola_modo',   'percentuale',
      'regola_valore', v_perc);
  end if;

  return jsonb_build_object('bonus', 0, 'regola_modo', null, 'regola_valore', 0);
end;
$$;

grant execute on function public.bonus_riga_calcola(numeric, integer) to authenticated;

-- 3) La vendita dal portale dipendente -------------------------------------
create or replace function public.registra_vendita_bonus(
    p_magazzino_id uuid,
    p_quantita     integer,
    p_metodo       text)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_staff    uuid;
  v_art      public.magazzino%rowtype;
  v_calc     jsonb;
  v_imponib  numeric(10,2);
  v_oggi     date := current_date;
  v_vendita  jsonb;
  v_mov_id   uuid;
begin
  -- CHI vende lo decide la sessione, non il client
  v_staff := public.current_staff_id();
  if v_staff is null then
    raise exception 'Utente non riconosciuto: rifai il login';
  end if;

  if p_metodo is null or p_metodo not in ('contanti','pos') then
    raise exception 'Metodo di pagamento non valido: usa contanti o pos';
  end if;

  if p_quantita is null or p_quantita < 1 then
    raise exception 'La quantita'' deve essere almeno 1';
  end if;

  select * into v_art from public.magazzino where id = p_magazzino_id;
  if not found then
    raise exception 'Articolo non trovato';
  end if;
  if v_art.attivo is not true then
    raise exception 'Articolo non attivo';
  end if;
  if v_art.bonus_attivo is not true then
    raise exception 'Questo articolo non da'' bonus';
  end if;
  if coalesce(v_art.giacenza, 0) < p_quantita then
    raise exception 'Giacenza insufficiente: ne restano %', coalesce(v_art.giacenza, 0);
  end if;

  -- A QUANTO si vende lo decide il magazzino, non il client: niente sconti
  v_imponib := round(v_art.prezzo_vendita * p_quantita, 2);
  v_calc    := public.bonus_riga_calcola(v_art.prezzo_vendita, p_quantita);

  -- Vendita atomica: codice, testata, righe, scarico giacenza
  v_vendita := public.salva_vendita(
    jsonb_build_object(
      'data',             v_oggi,
      'ora',              to_char(now(), 'HH24:MI:SS'),
      'operatore_id',     v_staff,
      'operatore_nome',   (select nome_completo from public.personale where id = v_staff),
      'subtotale',        v_imponib,
      'totale',           v_imponib,
      'metodo_pagamento', p_metodo,
      'importo_contanti', case when p_metodo = 'contanti' then v_imponib else 0 end,
      'importo_pos',      case when p_metodo = 'pos'      then v_imponib else 0 end,
      'resto',            0,
      'stato',            'completata',
      'note',             'Bonus venduto'),
    jsonb_build_array(jsonb_build_object(
      'prodotto_id',     v_art.id,
      'codice_prodotto', v_art.codice,
      'barcode',         v_art.barcode,
      'nome_prodotto',   v_art.nome_prodotto,
      'categoria',       v_art.categoria,
      'quantita',        p_quantita,
      'prezzo_unitario', v_art.prezzo_vendita,
      'sconto',          0,
      'totale_riga',     v_imponib)),
    'VEN');

  insert into public.bonus_movimenti (
    personale_id, vendita_id, magazzino_id, nome_prodotto, quantita,
    prezzo_unitario, imponibile, regola_modo, regola_valore, bonus_calcolato,
    anno, mese)
  values (
    v_staff, (v_vendita ->> 'id')::uuid, v_art.id, v_art.nome_prodotto, p_quantita,
    v_art.prezzo_vendita, v_imponib,
    coalesce(v_calc ->> 'regola_modo', 'percentuale'),
    (v_calc ->> 'regola_valore')::numeric,
    (v_calc ->> 'bonus')::numeric,
    extract(year from v_oggi)::int, extract(month from v_oggi)::int)
  returning id into v_mov_id;

  return v_vendita || jsonb_build_object(
    'bonus_movimento_id', v_mov_id,
    'bonus',              (v_calc ->> 'bonus')::numeric);
end;
$$;

grant execute on function public.registra_vendita_bonus(uuid, integer, text) to authenticated;

-- 4) Ri-somma di un periodo -------------------------------------------------
-- Non si chiama da sola: la invocano le correzioni del gestore e il pulsante
-- dell'avviso. Un periodo forzato a mano non viene toccato.
create or replace function public.ricalcola_periodo_bonus(
    p_personale_id uuid, p_anno integer, p_mese integer)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_venduto numeric(10,2);
  v_bonus   numeric(10,2);
begin
  if public.staff_role() <> 'Super Admin' then
    raise exception 'Operazione riservata al gestore';
  end if;

  select coalesce(sum(imponibile), 0), coalesce(sum(bonus_calcolato), 0)
    into v_venduto, v_bonus
  from public.bonus_movimenti
  where personale_id = p_personale_id and anno = p_anno and mese = p_mese;

  update public.bonus_periodi
     set venduto = v_venduto, bonus_totale = v_bonus, updated_at = now()
   where personale_id = p_personale_id and anno = p_anno and mese = p_mese
     and forzato is false;

  return jsonb_build_object('venduto', v_venduto, 'bonus_totale', v_bonus);
end;
$$;

grant execute on function public.ricalcola_periodo_bonus(uuid, integer, integer) to authenticated;
```

- [ ] **Step 2: Scrivere lo script di parità**

Creare `sql/verifica_bonus_parita.sql`:

```sql
-- Verifica che il bonus calcolato in SQL coincida con quello calcolato in
-- JavaScript. SOLO LETTURA: non scrive niente.
--
-- Da lanciare nel SQL Editor DOPO aver configurato le fasce 0->3%, 10->5%,
-- 30->7% e la modalita' 'percentuale'. Confrontare riga per riga con
-- l'output di:  node test/test-bonus-calcoli.js --parita
select
    c.prezzo,
    c.quantita,
    (public.bonus_riga_calcola(c.prezzo, c.quantita) ->> 'bonus')::numeric   as bonus_sql,
    (public.bonus_riga_calcola(c.prezzo, c.quantita) ->> 'regola_valore')::numeric as perc_sql
from (values
    (9.99::numeric,  1),
    (10.00,          1),
    (10.50,          1),
    (12.00,          3),
    (25.00,          1),
    (29.99,          1),
    (30.00,          1),
    (50.00,          1),
    (13.33,          7),
    (8.00,           1)
) as c(prezzo, quantita)
order by c.prezzo, c.quantita;
```

- [ ] **Step 3: Aggiungere al test JS la stampa degli stessi casi**

In fondo a `test/test-bonus-calcoli.js`, **prima** della riga `console.log('\n' + pass ...)`, inserire:

```javascript
// Stampa i casi di confronto con SQL. Serve a verificare a mano che
// js/lib/bonus-calcoli.js e public.bonus_riga_calcola diano lo stesso numero:
// il client mostra l'anteprima, il server scrive il valore definitivo, e se
// divergono il dipendente vede una cifra e ne incassa un'altra.
if (process.argv.indexOf('--parita') !== -1) {
  const CASI = [[9.99,1],[10,1],[10.5,1],[12,3],[25,1],[29.99,1],[30,1],[50,1],[13.33,7],[8,1]];
  console.log('\nprezzo\tqta\tbonus_js\tperc_js');
  CASI.forEach(function(c) {
    const x = B.bonusRiga(c[0], c[1], PERC);
    console.log(c[0].toFixed(2) + '\t' + c[1] + '\t' + x.bonus.toFixed(2) + '\t\t' + x.regolaValore);
  });
}
```

- [ ] **Step 4: Verificare che il test passi ancora**

Run: `node test/test-bonus-calcoli.js`
Expected: PASS, `0 falliti` (il blocco `--parita` non si attiva senza il flag).

Run: `node test/test-bonus-calcoli.js --parita`
Expected: PASS, più la tabella dei dieci casi.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260917_bonus_rpc.sql sql/verifica_bonus_parita.sql test/test-bonus-calcoli.js
git commit -F - <<'EOF'
feat(bonus): RPC atomica di vendita e calcolo lato server

registra_vendita_bonus ricava il dipendente da auth.uid() e il prezzo dal
magazzino: chi ha la sessione non puo' accreditare un collega ne' applicare
uno sconto. Riusa salva_vendita per restare atomica su codice, testata,
righe e giacenza.

Aggiunto lo script di parita' fra il calcolo SQL e quello JavaScript.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

- [ ] **Step 6: Consegnare la migration e verificare la parità**

**Fermarsi e chiedere** di lanciare `20260917_bonus_rpc.sql`. Dopo l'applicazione e dopo aver configurato le fasce (Task 5), lanciare `sql/verifica_bonus_parita.sql` e confrontare con `node test/test-bonus-calcoli.js --parita`. I dieci valori devono coincidere al centesimo. **Se divergono, fermarsi:** è il difetto più insidioso di tutto il modulo, perché il dipendente vedrebbe un'anteprima diversa da quello che incassa.

---

### Task 4: Funzioni API

**Files:**
- Modify: `js/api.js` (aggiungere accanto alle funzioni della cassa; esportare nel blocco `return {}` finale)
- Create: `test/test-bonus-api.js`
- Modify: `index.html` (alzare `?v=` di `js/api.js`)

**Interfaces:**
- Consumes: le funzioni della Task 3.
- Produces:
  - `ENI.API.getRegolaBonus()` → `{ modo, euroPezzo, fasce }`
  - `ENI.API.salvaRegolaBonus(modo, euroPezzo)` → true
  - `ENI.API.salvaFasceBonus(fasce)` → true (sostituisce tutte le fasce)
  - `ENI.API.getArticoliBonus()` → articoli di magazzino con `bonus_attivo`
  - `ENI.API.setBonusArticolo(id, attivo)` → true
  - `ENI.API.registraVenditaBonus(magazzinoId, quantita, metodo)` → record
  - `ENI.API.getMieiMovimentiBonus(anno, mese)` → array
  - `ENI.API.getMieiPeriodiBonus()` → array
  - `ENI.API.getMovimentiBonus(anno, mese)` → array (gestore, tutti i dipendenti)
  - `ENI.API.aggiornaMovimentoBonus(id, dati, descrizionePrecedente)` → record
  - `ENI.API.eliminaMovimentoBonus(id, descrizione)` → true
  - `ENI.API.getPeriodiBonus(anno, mese)` → array
  - `ENI.API.salvaPeriodoBonus(dati)` → record
  - `ENI.API.ricalcolaPeriodoBonus(personaleId, anno, mese)` → `{ venduto, bonus_totale }`

- [ ] **Step 1: Scrivere il test che fallisce**

Creare `test/test-bonus-api.js`:

```javascript
// Eseguire con: node test/test-bonus-api.js
//
// Verifica che le funzioni API del bonus parlino con le tabelle e le funzioni
// giuste, e soprattutto che il dipendente NON possa scrivere nei movimenti:
// l'unica strada per lui e' l'RPC, dove il server decide autore e prezzo.
const fs = require('fs');
const vm = require('vm');
const P = 'C:/Users/Utente1/Documents/gestionale_eni/';

let pass = 0, fail = 0;
function check(nome, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + nome); }
  else { fail++; console.log('  FAIL ' + nome + (extra !== undefined ? ' -> ' + extra : '')); }
}

const azioni = [];
let righe = [];
function makeQuery(tabella) {
  const q = {
    select() { return q; },
    eq(c, v) { azioni.push({ op: 'eq', tabella, campo: c, valore: v }); return q; },
    gte() { return q; }, lte() { return q; }, lt() { return q; },
    order() { return q; }, limit() { return q; },
    single() { return Promise.resolve({ data: q._last || null, error: null }); },
    maybeSingle() { return Promise.resolve({ data: q._last || null, error: null }); },
    insert(d) { q._last = Object.assign({ id: 'new' }, d); azioni.push({ op: 'insert', tabella, dati: d }); return q; },
    upsert(d) { q._last = d; azioni.push({ op: 'upsert', tabella, dati: d }); return q; },
    update(d) { q._last = Object.assign({ id: 'x' }, d); azioni.push({ op: 'update', tabella, dati: d }); return q; },
    delete() { azioni.push({ op: 'delete', tabella }); return q; },
    then(res) { return Promise.resolve({ data: righe, error: null }).then(res); }
  };
  return q;
}
const rpcChiamate = [];
const sandbox = {
  console, setTimeout, clearTimeout,
  supabase: { createClient: () => ({
    from: makeQuery,
    rpc: (nome, args) => { rpcChiamate.push({ nome, args }); return Promise.resolve({ data: { id: 'v1', bonus: 1.25 }, error: null }); }
  }) },
  document: { createElement: () => ({ set textContent(v) { this._v = v; }, get innerHTML() { return this._v || ''; } }) }
};
sandbox.window = sandbox;
vm.createContext(sandbox);
for (const f of ['js/config.js', 'js/ui.js', 'js/api.js']) {
  vm.runInContext(fs.readFileSync(P + f, 'utf8'), sandbox, { filename: f });
}
sandbox.ENI.State = { getUserId: () => 'u1', getUserName: () => 'Test', cacheGet: () => null, cacheSet: () => {} };
const API = sandbox.ENI.API;

(async () => {
  console.log('\n--- la vendita passa SOLO dalla funzione del server ---');
  rpcChiamate.length = 0;
  await API.registraVenditaBonus('art-1', 2, 'contanti');
  const r = rpcChiamate.find(x => x.nome === 'registra_vendita_bonus');
  check('chiama registra_vendita_bonus', !!r);
  check('manda articolo, quantita e metodo',
    r && r.args.p_magazzino_id === 'art-1' && r.args.p_quantita === 2 && r.args.p_metodo === 'contanti',
    r && JSON.stringify(r.args));
  check('NON manda il dipendente: lo decide il server',
    r && Object.keys(r.args).every(k => !/personale|operatore|staff/i.test(k)),
    r && Object.keys(r.args).join(','));
  check('NON manda il prezzo: lo decide il server',
    r && Object.keys(r.args).every(k => !/prezzo|importo|totale/i.test(k)),
    r && Object.keys(r.args).join(','));

  console.log('\n--- letture del dipendente ---');
  azioni.length = 0;
  await API.getMieiMovimentiBonus(2026, 9);
  check('filtra per anno', azioni.some(a => a.campo === 'anno' && a.valore === 2026));
  check('filtra per mese', azioni.some(a => a.campo === 'mese' && a.valore === 9));

  console.log('\n--- correzioni del gestore, tracciate ---');
  azioni.length = 0;
  await API.aggiornaMovimentoBonus('m1', { quantita: 2, bonus_calcolato: 1.5 }, 'qta 3, bonus 2,25 €');
  check('aggiorna il movimento', azioni.some(a => a.op === 'update' && a.tabella === 'bonus_movimenti'));
  check('scrive nel log', azioni.some(a => a.op === 'insert' && a.tabella === 'log_attivita'));
  const log = azioni.find(a => a.op === 'insert' && a.tabella === 'log_attivita');
  check('il log conserva il valore precedente',
    log && String(log.dati.dettagli).indexOf('qta 3') !== -1, log && log.dati.dettagli);

  azioni.length = 0;
  await API.eliminaMovimentoBonus('m1', 'Batteria 12V - 1,25 €');
  check('elimina il movimento', azioni.some(a => a.op === 'delete' && a.tabella === 'bonus_movimenti'));
  check('anche l eliminazione finisce nel log',
    azioni.some(a => a.op === 'insert' && a.tabella === 'log_attivita'));

  console.log('\n--- regola e fasce ---');
  azioni.length = 0;
  await API.salvaRegolaBonus('percentuale', 0);
  check('salva la modalita in impostazioni_app',
    azioni.some(a => a.op === 'upsert' && a.tabella === 'impostazioni_app'));

  azioni.length = 0;
  await API.salvaFasceBonus([{ da_prezzo: 0, percentuale: 3 }, { da_prezzo: 10, percentuale: 5 }]);
  check('cancella le fasce vecchie prima di riscriverle',
    azioni.some(a => a.op === 'delete' && a.tabella === 'bonus_fasce'));
  check('inserisce le fasce nuove',
    azioni.some(a => a.op === 'insert' && a.tabella === 'bonus_fasce'));

  console.log('\n--- esportate ---');
  ['getRegolaBonus','salvaRegolaBonus','salvaFasceBonus','getArticoliBonus','setBonusArticolo',
   'registraVenditaBonus','getMieiMovimentiBonus','getMieiPeriodiBonus','getMovimentiBonus',
   'aggiornaMovimentoBonus','eliminaMovimentoBonus','getPeriodiBonus','salvaPeriodoBonus',
   'ricalcolaPeriodoBonus'].forEach(function(n) {
    check('API espone ' + n, typeof API[n] === 'function');
  });

  console.log('\n' + pass + ' passati, ' + fail + ' falliti');
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('ERRORE: ' + e.stack); process.exit(1); });
```

- [ ] **Step 2: Eseguire il test e verificare che fallisca**

Run: `node test/test-bonus-api.js`
Expected: FAIL — `API.registraVenditaBonus is not a function`.

- [ ] **Step 3: Scrivere le funzioni API**

In `js/api.js`, subito **dopo** `getTotaleLavaggiPerData` (cercare `// Ultima cassa CHIUSA prima di`), inserire:

```javascript
    // --- Bonus venduto ai dipendenti ---
    //
    // La vendita passa SOLO da registra_vendita_bonus: il dipendente non manda
    // ne' il proprio nome ne' il prezzo, li decide il server. Vedi
    // docs/superpowers/specs/2026-09-17-bonus-venduto-design.md

    async function getRegolaBonus() {
        var modo = await getImpostazioneApp('bonus_modo');
        var euro = await getImpostazioneApp('bonus_euro_pezzo');
        var fasce = await getClient()
            .from('bonus_fasce')
            .select('*')
            .order('da_prezzo', { ascending: true });
        if (fasce.error) throw new Error(fasce.error.message);
        return {
            modo: modo || 'percentuale',
            euroPezzo: Number(euro) || 0,
            fasce: fasce.data || []
        };
    }

    async function salvaRegolaBonus(modo, euroPezzo) {
        await salvaImpostazioneApp('bonus_modo', modo);
        await salvaImpostazioneApp('bonus_euro_pezzo', Number(euroPezzo) || 0);
        return true;
    }

    // Sostituisce in blocco: le fasce sono poche e ragionarci per differenze
    // costerebbe piu' di quanto valga.
    async function salvaFasceBonus(fasce) {
        var del = await getClient().from('bonus_fasce').delete().gte('da_prezzo', 0);
        if (del.error) throw new Error(del.error.message);
        if (fasce && fasce.length) {
            var ins = await getClient().from('bonus_fasce').insert(fasce.map(function(f) {
                return { da_prezzo: Number(f.da_prezzo), percentuale: Number(f.percentuale) };
            }));
            if (ins.error) throw new Error(ins.error.message);
        }
        await scriviLog('Modifica_Impostazioni', 'Bonus',
            'Fasce bonus aggiornate: ' + ((fasce || []).length) + ' fasce');
        return true;
    }

    async function getArticoliBonus() {
        var result = await getClient()
            .from('magazzino')
            .select('*')
            .eq('bonus_attivo', true)
            .eq('attivo', true)
            .order('nome_prodotto', { ascending: true });
        if (result.error) throw new Error(result.error.message);
        return result.data || [];
    }

    async function setBonusArticolo(id, attivo) {
        var result = await getClient()
            .from('magazzino')
            .update({ bonus_attivo: !!attivo })
            .eq('id', id);
        if (result.error) throw new Error(result.error.message);
        return true;
    }

    async function registraVenditaBonus(magazzinoId, quantita, metodo) {
        var result = await getClient().rpc('registra_vendita_bonus', {
            p_magazzino_id: magazzinoId,
            p_quantita: quantita,
            p_metodo: metodo
        });
        if (result.error) throw new Error(result.error.message);
        return result.data;
    }

    async function getMieiMovimentiBonus(anno, mese) {
        var result = await getClient()
            .from('bonus_movimenti')
            .select('*')
            .eq('anno', anno)
            .eq('mese', mese)
            .order('created_at', { ascending: false });
        if (result.error) throw new Error(result.error.message);
        return result.data || [];
    }

    async function getMieiPeriodiBonus() {
        var result = await getClient()
            .from('bonus_periodi')
            .select('*')
            .order('anno', { ascending: false })
            .order('mese', { ascending: false });
        if (result.error) throw new Error(result.error.message);
        return result.data || [];
    }

    async function getMovimentiBonus(anno, mese) {
        var result = await getClient()
            .from('bonus_movimenti')
            .select('*')
            .eq('anno', anno)
            .eq('mese', mese)
            .order('created_at', { ascending: false });
        if (result.error) throw new Error(result.error.message);
        return result.data || [];
    }

    async function aggiornaMovimentoBonus(id, dati, descrizionePrecedente) {
        dati.modificato_da = ENI.State.getUserId();
        dati.modificato_at = new Date().toISOString();
        var result = await getClient()
            .from('bonus_movimenti').update(dati).eq('id', id).select().single();
        if (result.error) throw new Error(result.error.message);
        await scriviLog('Modifica_Bonus', 'Bonus',
            'Movimento corretto. Prima: ' + (descrizionePrecedente || '?') +
            ' | Dopo: ' + JSON.stringify(dati));
        return result.data;
    }

    async function eliminaMovimentoBonus(id, descrizione) {
        var result = await getClient().from('bonus_movimenti').delete().eq('id', id);
        if (result.error) throw new Error(result.error.message);
        await scriviLog('Elimina_Bonus', 'Bonus', 'Movimento eliminato: ' + (descrizione || id));
        return true;
    }

    async function getPeriodiBonus(anno, mese) {
        var result = await getClient()
            .from('bonus_periodi').select('*').eq('anno', anno).eq('mese', mese);
        if (result.error) throw new Error(result.error.message);
        return result.data || [];
    }

    async function salvaPeriodoBonus(dati) {
        var result = await getClient()
            .from('bonus_periodi')
            .upsert(dati, { onConflict: 'personale_id,anno,mese' })
            .select().single();
        if (result.error) throw new Error(result.error.message);
        await scriviLog('Modifica_Bonus', 'Bonus',
            'Periodo ' + dati.mese + '/' + dati.anno + ' -> ' + (dati.stato || 'aggiornato'));
        return result.data;
    }

    async function ricalcolaPeriodoBonus(personaleId, anno, mese) {
        var result = await getClient().rpc('ricalcola_periodo_bonus', {
            p_personale_id: personaleId, p_anno: anno, p_mese: mese
        });
        if (result.error) throw new Error(result.error.message);
        await scriviLog('Modifica_Bonus', 'Bonus',
            'Ricalcolato il periodo ' + mese + '/' + anno);
        return result.data;
    }
```

Nel blocco `return { ... }` in fondo al file, dopo `getTotaleLavaggiPerData: getTotaleLavaggiPerData,`, aggiungere:

```javascript
        getRegolaBonus: getRegolaBonus,
        salvaRegolaBonus: salvaRegolaBonus,
        salvaFasceBonus: salvaFasceBonus,
        getArticoliBonus: getArticoliBonus,
        setBonusArticolo: setBonusArticolo,
        registraVenditaBonus: registraVenditaBonus,
        getMieiMovimentiBonus: getMieiMovimentiBonus,
        getMieiPeriodiBonus: getMieiPeriodiBonus,
        getMovimentiBonus: getMovimentiBonus,
        aggiornaMovimentoBonus: aggiornaMovimentoBonus,
        eliminaMovimentoBonus: eliminaMovimentoBonus,
        getPeriodiBonus: getPeriodiBonus,
        salvaPeriodoBonus: salvaPeriodoBonus,
        ricalcolaPeriodoBonus: ricalcolaPeriodoBonus,
```

- [ ] **Step 4: Eseguire il test e verificare che passi**

Run: `node test/test-bonus-api.js`
Expected: PASS, `0 falliti`.

Run: `node --check js/api.js`
Expected: nessun output (sintassi valida).

- [ ] **Step 5: Alzare la versione**

In `index.html`, alzare di uno il `?v=` di `js/api.js`.

- [ ] **Step 6: Commit**

```bash
git add js/api.js test/test-bonus-api.js index.html
git commit -F - <<'EOF'
feat(bonus): funzioni API di lettura, scrittura e correzione

La vendita passa solo dall'RPC: il client non manda ne' il dipendente ne'
il prezzo, e il test lo verifica sui nomi dei parametri. Ogni correzione
del gestore finisce in log_attivita con il valore precedente.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 5: Impostazioni — sezione Bonus venduto

**Files:**
- Modify: `js/modules/impostazioni.js` (`_settingsSections` riga ~427, blocco dei pannelli riga ~105-276)
- Modify: `index.html` (alzare `?v=` di `js/modules/impostazioni.js`)

**Interfaces:**
- Consumes: `ENI.API.getRegolaBonus`, `ENI.API.salvaRegolaBonus`, `ENI.API.salvaFasceBonus`, `ENI.BonusCalcoli.bonusRiga`, `ENI.BonusCalcoli.problemiConfigurazione`.
- Produces: niente per le altre task.

- [ ] **Step 1: Aggiungere la sezione alla navigazione**

In `_settingsSections()`, dopo la riga di `soglie`:

```javascript
        if (ENI.State.isSuperAdmin()) secs.push({ id: 'bonus', label: 'Bonus venduto', icon: '\u{1F4B0}' });
```

- [ ] **Step 2: Aggiungere il pannello**

Nel blocco che costruisce i `<section class="settings-panel">`, subito dopo quello di `soglie`:

```javascript
                    (ENI.State.isSuperAdmin()
                        ? '<section class="settings-panel" data-panel="bonus">' + _bonusPanelHtml() + '</section>'
                        : '') +
```

- [ ] **Step 3: Scrivere il pannello e la sua logica**

Aggiungere in `js/modules/impostazioni.js`, accanto alle altre funzioni di pannello:

```javascript
    // --- Bonus venduto ---------------------------------------------------
    // La regola e' unica per tutti gli articoli: in Magazzino c'e' solo
    // l'interruttore acceso/spento. Qui si decide QUANTO si paga.

    function _bonusPanelHtml() {
        return '' +
            '<div class="settings-card">' +
                '<h3 class="settings-card-title">💰 Bonus venduto</h3>' +
                '<p class="text-sm text-muted">Vale per tutti gli articoli con il bonus acceso in Magazzino. ' +
                    'La fascia si sceglie sul <strong>prezzo del singolo pezzo</strong>.</p>' +

                '<div class="form-group" style="margin-top:12px;">' +
                    '<label class="form-label">Come si paga</label>' +
                    '<select class="form-select" id="bonus-modo" style="max-width:280px;">' +
                        '<option value="percentuale">Percentuale a fasce di prezzo</option>' +
                        '<option value="euro">Euro fissi al pezzo</option>' +
                    '</select>' +
                '</div>' +

                '<div id="bonus-blocco-euro" hidden>' +
                    '<div class="form-group">' +
                        '<label class="form-label">Euro per ogni pezzo venduto</label>' +
                        '<input type="number" step="0.01" min="0" class="form-input" ' +
                            'id="bonus-euro-pezzo" style="max-width:160px;">' +
                    '</div>' +
                '</div>' +

                '<div id="bonus-blocco-fasce" hidden>' +
                    '<label class="form-label">Fasce di prezzo</label>' +
                    '<table class="table" style="max-width:520px;">' +
                        '<thead><tr><th>Da (€)</th><th>Percentuale</th><th></th></tr></thead>' +
                        '<tbody id="bonus-fasce-body"></tbody>' +
                    '</table>' +
                    '<button type="button" class="btn btn-sm btn-outline" id="bonus-add-fascia">➕ Aggiungi fascia</button>' +
                '</div>' +

                '<div id="bonus-problemi" class="stock-alert" style="margin-top:12px;" hidden></div>' +
                '<div id="bonus-esempio" class="text-sm text-muted" style="margin-top:12px;"></div>' +

                '<div style="margin-top:16px;">' +
                    '<button type="button" class="btn btn-primary" id="bonus-salva">💾 Salva</button>' +
                '</div>' +
            '</div>';
    }

    function _bonusFasciaRigaHtml(f) {
        return '<tr class="bonus-fascia-row">' +
            '<td><input type="number" step="0.01" min="0" class="form-input bonus-f-da" ' +
                'value="' + (f && f.da_prezzo !== undefined ? f.da_prezzo : '') + '" style="max-width:120px;"></td>' +
            '<td><input type="number" step="0.01" min="0" max="100" class="form-input bonus-f-perc" ' +
                'value="' + (f && f.percentuale !== undefined ? f.percentuale : '') + '" style="max-width:110px;"> %</td>' +
            '<td><button type="button" class="btn btn-sm bonus-f-del" ' +
                'style="background:none;border:none;color:var(--color-danger);cursor:pointer;">✕</button></td>' +
        '</tr>';
    }

    function _bonusLeggiForm(container) {
        var fasce = [];
        container.querySelectorAll('.bonus-fascia-row').forEach(function(tr) {
            var da = parseFloat(tr.querySelector('.bonus-f-da').value);
            var pc = parseFloat(tr.querySelector('.bonus-f-perc').value);
            if (!isNaN(da) && !isNaN(pc)) fasce.push({ da_prezzo: da, percentuale: pc });
        });
        var modoEl = container.querySelector('#bonus-modo');
        var euroEl = container.querySelector('#bonus-euro-pezzo');
        return {
            modo: modoEl ? modoEl.value : 'percentuale',
            euroPezzo: euroEl ? (parseFloat(euroEl.value) || 0) : 0,
            fasce: fasce
        };
    }

    // L'esempio calcolato dal vivo e gli avvisi: servono a far vedere un errore
    // di configurazione PRIMA che qualcuno venda e prenda zero senza capire.
    function _bonusAggiorna(container) {
        var regola = _bonusLeggiForm(container);
        var isPerc = regola.modo === 'percentuale';
        var bEuro = container.querySelector('#bonus-blocco-euro');
        var bFasce = container.querySelector('#bonus-blocco-fasce');
        if (bEuro) bEuro.hidden = isPerc;
        if (bFasce) bFasce.hidden = !isPerc;

        var problemi = ENI.BonusCalcoli.problemiConfigurazione(regola);
        var pEl = container.querySelector('#bonus-problemi');
        if (pEl) {
            pEl.innerHTML = problemi.map(function(t) { return '⚠️ ' + ENI.UI.escapeHtml(t); }).join('<br>');
            pEl.hidden = problemi.length === 0;
        }

        var eEl = container.querySelector('#bonus-esempio');
        if (eEl) {
            var esempi = [8, 15, 25, 40].map(function(p) {
                return 'un pezzo da ' + ENI.UI.formatValuta(p) + ' rende ' +
                    ENI.UI.formatValuta(ENI.BonusCalcoli.bonusRiga(p, 1, regola).bonus);
            });
            eEl.textContent = 'Esempio: ' + esempi.join('  ·  ');
        }
    }

    async function _bonusInit(container) {
        var panel = container.querySelector('[data-panel="bonus"]');
        if (!panel) return;

        try {
            var regola = await ENI.API.getRegolaBonus();
            panel.querySelector('#bonus-modo').value = regola.modo;
            panel.querySelector('#bonus-euro-pezzo').value = regola.euroPezzo || '';
            panel.querySelector('#bonus-fasce-body').innerHTML =
                (regola.fasce || []).map(_bonusFasciaRigaHtml).join('');
        } catch(e) {
            ENI.UI.error('Impossibile leggere la regola del bonus: ' + e.message);
        }

        panel.addEventListener('input', function() { _bonusAggiorna(panel); });
        panel.addEventListener('change', function() { _bonusAggiorna(panel); });

        panel.querySelector('#bonus-add-fascia').addEventListener('click', function() {
            panel.querySelector('#bonus-fasce-body').insertAdjacentHTML('beforeend', _bonusFasciaRigaHtml(null));
        });

        panel.addEventListener('click', function(e) {
            var del = e.target.closest('.bonus-f-del');
            if (!del) return;
            var row = del.closest('.bonus-fascia-row');
            if (row) row.remove();
            _bonusAggiorna(panel);
        });

        panel.querySelector('#bonus-salva').addEventListener('click', async function() {
            var regola = _bonusLeggiForm(panel);
            try {
                await ENI.API.salvaRegolaBonus(regola.modo, regola.euroPezzo);
                await ENI.API.salvaFasceBonus(regola.modo === 'percentuale' ? regola.fasce : []);
                ENI.UI.success('Regola del bonus salvata');
            } catch(e) {
                ENI.UI.error('Errore: ' + e.message);
            }
        });

        _bonusAggiorna(panel);
    }
```

- [ ] **Step 4: Agganciare l'inizializzazione**

Cercare in `render(container)` il punto in cui vengono inizializzati gli altri pannelli (dopo `_initSettingsNav(container)`), e aggiungere:

```javascript
        if (ENI.State.isSuperAdmin()) _bonusInit(container);
```

- [ ] **Step 5: Verificare la sintassi e alzare la versione**

Run: `node --check js/modules/impostazioni.js`
Expected: nessun output.

In `index.html`, alzare di uno il `?v=` di `js/modules/impostazioni.js`.

- [ ] **Step 6: Prova manuale**

Aprire l'app, andare in Impostazioni → Bonus venduto. Verificare che:
- scegliendo "Euro fissi al pezzo" scompare la tabella delle fasce e compare il campo importo
- inserendo le fasce 0→3%, 10→5%, 30→7% l'esempio in fondo dice `8,00 € → 0,24 €`, `15,00 € → 0,75 €`, `25,00 € → 1,25 €`, `40,00 € → 2,80 €`
- togliendo la fascia che parte da 0 compare l'avviso sui pezzi che non danno bonus
- dopo il salvataggio e un ricaricamento della pagina i valori sono ancora lì

- [ ] **Step 7: Commit**

```bash
git add js/modules/impostazioni.js index.html
git commit -F - <<'EOF'
feat(bonus): sezione Bonus venduto nelle Impostazioni

Scelta della modalita', tabella delle fasce di prezzo, esempio calcolato dal
vivo e avvisi di configurazione (nessuna fascia, buco sotto la prima soglia,
soglie doppie, percentuali fuori scala).

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 6: Magazzino — scheda di modifica prodotto

Oggi un articolo si può solo creare. Se qualcuno sbaglia una lettera nel nome o
un decimale nel prezzo non c'è modo di correggerlo: l'unica via è disattivarlo e
rifarlo, perdendo lo storico. Questa task chiude quel buco, ed è indipendente
dal bonus — solo, il campo `bonus_attivo` nasce qui insieme agli altri.

**Files:**
- Modify: `js/modules/magazzino.js` (colonna azioni nella riga prodotto; nuova funzione `_showFormModificaProdotto`)
- Modify: `index.html` (alzare `?v=` di `js/modules/magazzino.js`)

**Interfaces:**
- Consumes: `ENI.API.aggiornaProdotto(id, dati)` — **esiste già** in `js/api.js:881` ed è già esportata; non va scritta.
- Produces: niente per le altre task.

**La giacenza NON si tocca da qui.** Esiste già la rettifica +/- con il suo
percorso e il suo log: un campo libero in questo form la scavalcherebbe, e la
giacenza tornerebbe a essere un numero che qualcuno ha scritto invece del
risultato dei movimenti. Nel form la giacenza si vede in sola lettura, con
accanto il rimando alla rettifica.

- [ ] **Step 1: Aggiungere il pulsante di modifica nella riga**

Nella cella delle azioni della riga prodotto, accanto ai pulsanti già presenti:

```javascript
                '<button class="btn btn-sm btn-modifica-prod" data-prod-id="' + p.id + '" ' +
                    'title="Modifica l\'articolo" style="background:none;border:none;cursor:pointer;">✏️</button>' +
```

- [ ] **Step 2: Agganciare il click**

Accanto agli altri listener della lista:

```javascript
        container.addEventListener('click', function(e) {
            var btn = e.target.closest('.btn-modifica-prod');
            if (!btn) return;
            var prodotto = _prodotti.filter(function(x) { return x.id === btn.dataset.prodId; })[0];
            if (prodotto) _showFormModificaProdotto(prodotto);
        });
```

Se la variabile che tiene i prodotti caricati non si chiama `_prodotti`,
adeguare il nome a quello usato dal modulo.

- [ ] **Step 3: Scrivere il form**

Aggiungere in `js/modules/magazzino.js`, accanto a `_showFormNuovoProdotto`:

```javascript
    // Modifica di un articolo esistente.
    //
    // La GIACENZA non e' modificabile qui di proposito: si cambia solo con la
    // rettifica +/-, che passa dalla funzione atomica movimenta_giacenza e
    // lascia traccia. Un campo libero la trasformerebbe di nuovo in un numero
    // scritto a mano invece che nel risultato dei movimenti.
    function _showFormModificaProdotto(p) {
        var isServizio = _isServizio(p);

        var body =
            '<form id="form-modifica-prodotto">' +
                '<div class="form-row">' +
                    '<div class="form-group">' +
                        '<label class="form-label form-label-required">Codice</label>' +
                        '<input type="text" class="form-input" id="mp-codice" value="' +
                            ENI.UI.escapeHtml(p.codice || '') + '">' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label class="form-label form-label-required">Nome Prodotto</label>' +
                        '<input type="text" class="form-input" id="mp-nome" value="' +
                            ENI.UI.escapeHtml(p.nome_prodotto || '') + '">' +
                    '</div>' +
                '</div>' +

                '<div class="form-row">' +
                    '<div class="form-group">' +
                        '<label class="form-label">Barcode (EAN)</label>' +
                        '<input type="text" class="form-input" id="mp-barcode" value="' +
                            ENI.UI.escapeHtml(p.barcode || '') + '">' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label class="form-label">Categoria</label>' +
                        '<select class="form-select" id="mp-categoria">' +
                            ENI.Config.CATEGORIE_MAGAZZINO.map(function(c) {
                                return '<option value="' + c + '"' +
                                    (c === p.categoria ? ' selected' : '') + '>' + c + '</option>';
                            }).join('') +
                        '</select>' +
                    '</div>' +
                '</div>' +

                '<div class="form-row">' +
                    '<div class="form-group">' +
                        '<label class="form-label">Fornitore</label>' +
                        '<input type="text" class="form-input" id="mp-fornitore" value="' +
                            ENI.UI.escapeHtml(p.fornitore || '') + '">' +
                    '</div>' +
                '</div>' +

                '<div class="form-row">' +
                    '<div class="form-group">' +
                        '<label class="form-label">Prezzo Acquisto €</label>' +
                        '<input type="number" step="0.01" min="0" class="form-input" id="mp-prezzo-acquisto" value="' +
                            (p.prezzo_acquisto != null ? p.prezzo_acquisto : '') + '">' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label class="form-label form-label-required">Prezzo Vendita €</label>' +
                        '<input type="number" step="0.01" min="0" class="form-input" id="mp-prezzo-vendita" value="' +
                            (p.prezzo_vendita != null ? p.prezzo_vendita : '') + '">' +
                    '</div>' +
                '</div>' +

                (isServizio ? '' :
                '<div class="form-row">' +
                    '<div class="form-group">' +
                        '<label class="form-label">Giacenza attuale</label>' +
                        '<input type="text" class="form-input" value="' + (p.giacenza != null ? p.giacenza : 0) + '" disabled>' +
                        '<div class="text-xs text-muted" style="margin-top:4px;">' +
                            'Si cambia solo con la rettifica +/− dall\'elenco, così resta traccia del movimento.' +
                        '</div>' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label class="form-label">Scorta Minima</label>' +
                        '<input type="number" min="0" class="form-input" id="mp-scorta" value="' +
                            (p.giacenza_minima != null ? p.giacenza_minima : 0) + '">' +
                    '</div>' +
                '</div>') +

                '<div class="form-row">' +
                    '<div class="form-group">' +
                        '<label style="display:flex;align-items:center;gap:8px;">' +
                            '<input type="checkbox" id="mp-attivo"' + (p.attivo ? ' checked' : '') + '> Articolo attivo' +
                        '</label>' +
                    '</div>' +
                    (isServizio ? '' :
                    '<div class="form-group">' +
                        '<label style="display:flex;align-items:center;gap:8px;">' +
                            '<input type="checkbox" id="mp-bonus"' + (p.bonus_attivo ? ' checked' : '') + '> 💰 Dà bonus ai dipendenti' +
                        '</label>' +
                    '</div>') +
                '</div>' +
            '</form>';

        var modal = ENI.UI.showModal({
            title: '✏️ Modifica articolo',
            body: body,
            footer:
                '<button class="btn btn-outline" data-modal-close>Annulla</button>' +
                '<button class="btn btn-primary" id="btn-salva-modifica">💾 Salva</button>'
        });

        modal.querySelector('#btn-salva-modifica').addEventListener('click', async function() {
            var codice = modal.querySelector('#mp-codice').value.trim();
            var nome = modal.querySelector('#mp-nome').value.trim();
            var prezzoVendita = parseFloat(modal.querySelector('#mp-prezzo-vendita').value);

            if (!codice || !nome || isNaN(prezzoVendita) || prezzoVendita <= 0) {
                ENI.UI.warning('Compila codice, nome e prezzo vendita');
                return;
            }

            var dati = {
                codice: codice,
                nome_prodotto: nome,
                barcode: modal.querySelector('#mp-barcode').value.trim() || null,
                categoria: modal.querySelector('#mp-categoria').value,
                fornitore: modal.querySelector('#mp-fornitore').value.trim() || null,
                prezzo_acquisto: parseFloat(modal.querySelector('#mp-prezzo-acquisto').value) || 0,
                prezzo_vendita: prezzoVendita,
                attivo: modal.querySelector('#mp-attivo').checked,
                updated_at: new Date().toISOString()
            };
            if (!isServizio) {
                dati.giacenza_minima = parseInt(modal.querySelector('#mp-scorta').value, 10) || 0;
                dati.bonus_attivo = modal.querySelector('#mp-bonus').checked;
            }

            var btn = modal.querySelector('#btn-salva-modifica');
            btn.disabled = true;
            try {
                await ENI.API.aggiornaProdotto(p.id, dati);
                ENI.UI.closeModal(modal);
                ENI.UI.success('Articolo "' + nome + '" aggiornato');
                await _loadProdotti();
            } catch(e) {
                btn.disabled = false;
                ENI.UI.error('Errore: ' + e.message);
            }
        });
    }
```

- [ ] **Step 4: Verificare la sintassi**

Run: `node --check js/modules/magazzino.js`
Expected: nessun output.

- [ ] **Step 5: Prova manuale**

Aprire Magazzino e, su un articolo esistente:
- correggere una lettera del nome → salva → il nome cambia nell'elenco
- cambiare il prezzo di vendita → salva → il nuovo prezzo compare in elenco
- verificare che il campo Giacenza sia grigio e non modificabile, con la nota sotto
- togliere la spunta "Articolo attivo" → l'articolo sparisce dall'elenco attivo
- riaprire un articolo della categoria Lavaggi: le sezioni giacenza e bonus non ci sono

**Attenzione al codice:** se `magazzino.codice` ha un vincolo di unicità, salvare
un codice già usato da un altro articolo dà un errore del database. Il messaggio
arriva all'utente tramite `ENI.UI.error`, quindi non si perde; se risulta poco
comprensibile, tradurlo in "Esiste già un articolo con questo codice".

- [ ] **Step 6: Alzare la versione e commit**

In `index.html`, alzare di uno il `?v=` di `js/modules/magazzino.js`.

```bash
git add js/modules/magazzino.js index.html
git commit -F - <<'EOF'
feat(magazzino): scheda di modifica articolo

Finora un articolo si poteva solo creare: per correggere un refuso nel nome
o un decimale nel prezzo bisognava disattivarlo e rifarlo, perdendo lo
storico. Il form riusa aggiornaProdotto, che esisteva gia' in api.js e non
veniva chiamata da nessuna parte.

La giacenza resta in sola lettura: si cambia solo con la rettifica +/-, che
passa da movimenta_giacenza e lascia traccia.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 7: Magazzino — interruttore bonus

**Files:**
- Modify: `js/modules/magazzino.js` (intestazione tabella e riga prodotto, ~riga 226-260; filtri in cima all'elenco)
- Modify: `index.html` (alzare `?v=` di `js/modules/magazzino.js`)

**Interfaces:**
- Consumes: `ENI.API.setBonusArticolo`.
- Produces: niente per le altre task.

- [ ] **Step 1: Aggiungere la colonna all'intestazione**

Nella riga `<thead>` dell'elenco prodotti, prima della colonna delle azioni, aggiungere:

```javascript
                    '<th style="text-align:center;" title="L\'articolo dà bonus al dipendente che lo vende">💰 Bonus</th>' +
```

- [ ] **Step 2: Aggiungere la cella con l'interruttore**

Nella costruzione della riga prodotto (dove oggi c'è `html += '<td>' + ENI.UI.formatValuta(p.prezzo_vendita) + '</td>';`), dopo quella cella aggiungere:

```javascript
            // I servizi (Lavaggi) non hanno giacenza e non passano dal portale bonus
            html += '<td style="text-align:center;">' +
                (_isServizio(p) ? '<span class="text-muted">—</span>' :
                    '<input type="checkbox" class="bonus-toggle" data-bonus-id="' + p.id + '"' +
                    (p.bonus_attivo ? ' checked' : '') + ' title="Dà bonus ai dipendenti">') +
            '</td>';
```

- [ ] **Step 3: Agganciare il cambio di stato**

Nel punto in cui il modulo aggancia gli altri listener della lista (accanto a "Modifica giacenza +/-", ~riga 99), aggiungere:

```javascript
        // Interruttore bonus: si salva subito, senza un form di mezzo.
        // In Magazzino non esiste una scheda di modifica articolo, e per un
        // singolo interruttore non vale la pena costruirne una.
        container.addEventListener('change', async function(e) {
            var chk = e.target.closest('.bonus-toggle');
            if (!chk) return;
            var id = chk.dataset.bonusId;
            var attivo = chk.checked;
            chk.disabled = true;
            try {
                await ENI.API.setBonusArticolo(id, attivo);
                ENI.UI.success(attivo ? 'Articolo aggiunto al bonus' : 'Articolo tolto dal bonus');
            } catch(err) {
                chk.checked = !attivo;   // rimetti com'era: il salvataggio non e' andato
                ENI.UI.error('Errore: ' + err.message);
            } finally {
                chk.disabled = false;
            }
        });
```

- [ ] **Step 4: Aggiungere il filtro "solo bonus"**

Accanto agli altri filtri dell'elenco, aggiungere il pulsante:

```javascript
                '<label class="text-sm" style="display:inline-flex;align-items:center;gap:6px;margin-left:12px;">' +
                    '<input type="checkbox" id="filtro-solo-bonus"> solo articoli a bonus' +
                '</label>' +
```

e nella funzione che filtra i prodotti prima di disegnarli, aggiungere in testa:

```javascript
            var soloBonus = document.getElementById('filtro-solo-bonus');
            if (soloBonus && soloBonus.checked && !p.bonus_attivo) return false;
```

agganciando `change` su `#filtro-solo-bonus` al ridisegno dell'elenco, come fanno gli altri filtri.

- [ ] **Step 5: Verificare la sintassi e alzare la versione**

Run: `node --check js/modules/magazzino.js`
Expected: nessun output.

In `index.html`, alzare di uno il `?v=` di `js/modules/magazzino.js`.

- [ ] **Step 6: Prova manuale**

Aprire Magazzino: la colonna 💰 Bonus compare, l'interruttore si accende e si spegne con un messaggio di conferma, ricaricando la pagina lo stato è rimasto, il filtro "solo articoli a bonus" riduce l'elenco, e per i servizi della categoria Lavaggi compare un trattino invece della casella.

- [ ] **Step 7: Commit**

```bash
git add js/modules/magazzino.js index.html
git commit -F - <<'EOF'
feat(bonus): interruttore bonus nell'elenco di Magazzino

Colonna con la casella accendi/spegni salvata al volo e filtro "solo
articoli a bonus". Non esiste una scheda di modifica articolo e per un
singolo interruttore non vale la pena costruirne una; in caso di errore la
casella torna com'era.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 8: Portale dipendente

**Files:**
- Create: `js/modules/bonus-venduto.js`
- Modify: `js/config.js` (`NAV_ITEMS` riga ~64, `RUOLI` righe ~48-59)
- Modify: `js/app.js` (nascondere la voce al super admin, riga ~161)
- Modify: `index.html` (tag script nuovo, `?v=` di `config.js` e `app.js`)
- Test: `test/test-bonus-moduli.js`

**Interfaces:**
- Consumes: `ENI.API.getArticoliBonus`, `ENI.API.registraVenditaBonus`, `ENI.API.getMieiMovimentiBonus`, `ENI.API.getMieiPeriodiBonus`, `ENI.API.getRegolaBonus`, `ENI.BonusCalcoli.bonusRiga`.
- Produces: `ENI.Modules.BonusVenduto.render(container)`.

- [ ] **Step 1: Scrivere il test di cablaggio che fallisce**

Creare `test/test-bonus-moduli.js`:

```javascript
// Eseguire con: node test/test-bonus-moduli.js
//
// Controlli sul sorgente dei moduli del bonus. Non provano il comportamento
// (servirebbe un browser) ma impediscono che un pezzo si scolleghi in
// silenzio: il menu senza la voce, il modulo senza il tag script, l'anteprima
// del bonus calcolata con una regola diversa da quella configurata.
const fs = require('fs');
const P = 'C:/Users/Utente1/Documents/gestionale_eni/';

let pass = 0, fail = 0;
function check(nome, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + nome); }
  else { fail++; console.log('  FAIL ' + nome + (extra !== undefined ? ' -> ' + extra : '')); }
}

const venduto = fs.readFileSync(P + 'js/modules/bonus-venduto.js', 'utf8');
const config  = fs.readFileSync(P + 'js/config.js', 'utf8');
const app     = fs.readFileSync(P + 'js/app.js', 'utf8');
const index   = fs.readFileSync(P + 'index.html', 'utf8');

console.log('\n--- portale dipendente ---');
check('il modulo si registra come BonusVenduto', /ENI\.Modules\.BonusVenduto/.test(venduto));
check('legge gli articoli a bonus', /getArticoliBonus\(/.test(venduto));
check('registra la vendita SOLO tramite l API dedicata',
  /registraVenditaBonus\(/.test(venduto));
check('non chiama mai salvaVendita direttamente', !/salvaVendita\(/.test(venduto));
check('mostra l anteprima del bonus prima di confermare',
  /BonusCalcoli\.bonusRiga\(/.test(venduto));
check('il prezzo e mostrato ma non modificabile',
  /readonly|disabled/.test(venduto));
check('chiede contanti o pos', /contanti/.test(venduto) && /pos/.test(venduto));
check('mostra i periodi da ricevere', /getMieiPeriodiBonus\(/.test(venduto));
check('e in ES5: niente let, const o arrow function',
  !/\b(let|const)\s|=>/.test(venduto.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')));

console.log('\n--- menu e permessi ---');
check('la voce esiste in NAV_ITEMS', /id: 'bonus-venduto'/.test(config));
check('la rotta e #/bonus-venduto', /route: '#\/bonus-venduto'/.test(config));
check('il modulo e concesso ai ruoli dipendente',
  (config.match(/'bonus-venduto'/g) || []).length >= 3, (config.match(/'bonus-venduto'/g) || []).length);
check('la voce e nascosta al super admin',
  /item\.id === 'bonus-venduto' && isSA/.test(app));

console.log('\n--- caricamento ---');
check('index.html carica bonus-calcoli', /js\/lib\/bonus-calcoli\.js\?v=/.test(index));
check('index.html carica il modulo dipendente', /js\/modules\/bonus-venduto\.js\?v=/.test(index));
check('la libreria e caricata PRIMA del modulo',
  index.indexOf('js/lib/bonus-calcoli.js') < index.indexOf('js/modules/bonus-venduto.js'));

console.log('\n' + pass + ' passati, ' + fail + ' falliti');
process.exit(fail === 0 ? 0 : 1);
```

- [ ] **Step 2: Eseguire il test e verificare che fallisca**

Run: `node test/test-bonus-moduli.js`
Expected: FAIL con `ENOENT ... js/modules/bonus-venduto.js`.

- [ ] **Step 3: Scrivere il modulo**

Creare `js/modules/bonus-venduto.js`:

```javascript
// ============================================================
// GESTIONALE ENI - Bonus venduto (lato dipendente)
// Portafoglio del mese, registrazione della vendita e storico.
// Ogni dipendente vede SOLO i propri movimenti (RLS lato DB).
// ============================================================

var ENI = ENI || {};
ENI.Modules = ENI.Modules || {};

ENI.Modules.BonusVenduto = (function() {
    'use strict';

    var _articoli = [];
    var _movimenti = [];
    var _periodi = [];
    var _regola = null;
    var _container = null;

    function _oggi() { return new Date(); }
    function _anno() { return _oggi().getFullYear(); }
    function _mese() { return _oggi().getMonth() + 1; }

    var NOMI_MESE = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
                     'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];

    async function render(container) {
        _container = container;
        container.innerHTML =
            '<div class="page-header">' +
                '<h1 class="page-title">💰 Bonus venduto</h1>' +
            '</div>' +
            '<div id="bonus-corpo">' +
                '<div class="flex justify-center" style="padding:2rem;"><div class="spinner"></div></div>' +
            '</div>';
        await _load();
    }

    async function _load() {
        try {
            _regola    = await ENI.API.getRegolaBonus();
            _articoli  = await ENI.API.getArticoliBonus();
            _movimenti = await ENI.API.getMieiMovimentiBonus(_anno(), _mese());
            _periodi   = await ENI.API.getMieiPeriodiBonus();
        } catch(e) {
            var errEl = document.getElementById('bonus-corpo');
            if (errEl) errEl.innerHTML = '<div class="stock-alert">Errore: ' + ENI.UI.escapeHtml(e.message) + '</div>';
            return;
        }
        _renderCorpo();
    }

    function _totali() {
        var venduto = 0, bonus = 0, pezzi = 0;
        _movimenti.forEach(function(m) {
            venduto += Number(m.imponibile || 0);
            bonus   += Number(m.bonus_calcolato || 0);
            pezzi   += Number(m.quantita || 0);
        });
        return { venduto: venduto, bonus: bonus, pezzi: pezzi };
    }

    function _renderCorpo() {
        var corpo = document.getElementById('bonus-corpo');
        if (!corpo) return;
        var t = _totali();

        var daRicevere = _periodi.filter(function(p) { return p.stato === 'da_pagare'; });
        var daRicevereHtml = daRicevere.length
            ? '<div style="margin-top:14px;">' +
                '<div class="text-sm" style="opacity:.8;">Da ricevere in busta</div>' +
                daRicevere.map(function(p) {
                    return '<div style="display:flex;justify-content:space-between;max-width:320px;">' +
                        '<span>' + NOMI_MESE[p.mese - 1] + ' ' + p.anno + '</span>' +
                        '<strong>' + ENI.UI.formatValuta(p.bonus_totale) + '</strong>' +
                    '</div>';
                }).join('') +
              '</div>'
            : '';

        corpo.innerHTML =
            '<div class="cassa-differenza ok" style="text-align:left;">' +
                '<div class="text-sm" style="opacity:.8;">Bonus di ' + NOMI_MESE[_mese() - 1] + '</div>' +
                '<div style="font-size:2rem;font-weight:700;">' + ENI.UI.formatValuta(t.bonus) + '</div>' +
                '<div class="text-sm">su ' + ENI.UI.formatValuta(t.venduto) + ' venduti · ' + t.pezzi + ' pezzi</div>' +
                daRicevereHtml +
            '</div>' +

            '<div style="margin:16px 0;">' +
                '<button type="button" class="btn btn-primary btn-lg" id="btn-ho-venduto" ' +
                    (_articoli.length ? '' : 'disabled ') + 'style="width:100%;max-width:420px;">' +
                    '🛒 Ho venduto' +
                '</button>' +
                (_articoli.length ? '' :
                    '<div class="text-sm text-muted" style="margin-top:6px;">Nessun articolo a bonus: chiedi al gestore di attivarne.</div>') +
            '</div>' +

            '<h3 style="margin-top:20px;">Le mie vendite di ' + NOMI_MESE[_mese() - 1] + '</h3>' +
            _tabellaMovimenti();

        var btn = document.getElementById('btn-ho-venduto');
        if (btn) btn.addEventListener('click', _formVendita);
    }

    function _tabellaMovimenti() {
        if (!_movimenti.length) {
            return '<div class="empty-state" style="padding:1.5rem;">' +
                '<p class="empty-state-text">Ancora nessuna vendita questo mese</p></div>';
        }
        var righe = _movimenti.map(function(m) {
            return '<tr>' +
                '<td>' + ENI.UI.formatData(m.created_at) + '</td>' +
                '<td>' + ENI.UI.escapeHtml(m.nome_prodotto) + '</td>' +
                '<td style="text-align:center;">' + m.quantita + '</td>' +
                '<td>' + ENI.UI.formatValuta(m.imponibile) + '</td>' +
                '<td style="font-weight:600;color:var(--color-success);">' +
                    ENI.UI.formatValuta(m.bonus_calcolato) + '</td>' +
            '</tr>';
        }).join('');
        return '<div class="table-wrapper"><table class="table">' +
            '<thead><tr><th>Data</th><th>Articolo</th><th>Q.tà</th><th>Venduto</th><th>Bonus</th></tr></thead>' +
            '<tbody>' + righe + '</tbody></table></div>';
    }

    // Il dipendente deve sapere quanto prende PRIMA di confermare: su un bonus
    // da un euro e mezzo e' la differenza fra una cosa che motiva e un numero
    // che scopre a fine mese.
    function _formVendita() {
        var opzioni = _articoli.map(function(a) {
            return '<option value="' + a.id + '">' + ENI.UI.escapeHtml(a.nome_prodotto) +
                   ' — ' + ENI.UI.formatValuta(a.prezzo_vendita) + '</option>';
        }).join('');

        var body =
            '<div class="form-group">' +
                '<label class="form-label form-label-required">Articolo</label>' +
                '<select class="form-select" id="bv-articolo">' + opzioni + '</select>' +
            '</div>' +
            '<div class="form-row">' +
                '<div class="form-group">' +
                    '<label class="form-label">Prezzo</label>' +
                    '<input type="text" class="form-input" id="bv-prezzo" readonly ' +
                        'title="Il prezzo è quello di listino e non si può cambiare">' +
                '</div>' +
                '<div class="form-group">' +
                    '<label class="form-label form-label-required">Quantità</label>' +
                    '<input type="number" min="1" step="1" value="1" class="form-input" id="bv-qta">' +
                '</div>' +
            '</div>' +
            '<div class="form-group">' +
                '<label class="form-label form-label-required">Come ha pagato</label>' +
                '<div style="display:flex;gap:10px;">' +
                    '<button type="button" class="btn btn-outline bv-metodo active" data-metodo="contanti" style="flex:1;">💵 Contanti</button>' +
                    '<button type="button" class="btn btn-outline bv-metodo" data-metodo="pos" style="flex:1;">💳 POS</button>' +
                '</div>' +
            '</div>' +
            '<div style="text-align:center;padding:12px;background:var(--color-gray-100);border-radius:8px;">' +
                '<div class="text-sm">Il tuo bonus</div>' +
                '<div style="font-size:1.6rem;font-weight:700;color:var(--color-success);" id="bv-bonus">€ 0,00</div>' +
            '</div>';

        var modal = ENI.UI.showModal({
            title: '🛒 Ho venduto',
            body: body,
            footer: '<button class="btn btn-outline" data-modal-close>Annulla</button>' +
                    '<button class="btn btn-primary" id="bv-conferma">✅ Registra</button>'
        });

        var metodo = 'contanti';

        function articoloScelto() {
            var id = modal.querySelector('#bv-articolo').value;
            return _articoli.filter(function(a) { return a.id === id; })[0] || null;
        }

        function aggiorna() {
            var a = articoloScelto();
            var q = parseInt(modal.querySelector('#bv-qta').value, 10) || 0;
            modal.querySelector('#bv-prezzo').value = a ? ENI.UI.formatValuta(a.prezzo_vendita) : '';
            var b = a ? ENI.BonusCalcoli.bonusRiga(a.prezzo_vendita, q, _regola).bonus : 0;
            modal.querySelector('#bv-bonus').textContent = ENI.UI.formatValuta(b);
        }

        modal.querySelector('#bv-articolo').addEventListener('change', aggiorna);
        modal.querySelector('#bv-qta').addEventListener('input', aggiorna);
        modal.querySelectorAll('.bv-metodo').forEach(function(b) {
            b.addEventListener('click', function() {
                metodo = b.dataset.metodo;
                modal.querySelectorAll('.bv-metodo').forEach(function(x) { x.classList.remove('active'); });
                b.classList.add('active');
            });
        });

        modal.querySelector('#bv-conferma').addEventListener('click', async function() {
            var a = articoloScelto();
            var q = parseInt(modal.querySelector('#bv-qta').value, 10) || 0;
            if (!a || q < 1) { ENI.UI.warning('Scegli articolo e quantità'); return; }

            var btn = modal.querySelector('#bv-conferma');
            btn.disabled = true;
            try {
                var res = await ENI.API.registraVenditaBonus(a.id, q, metodo);
                ENI.UI.closeModal(modal);
                ENI.UI.success('Registrato · bonus ' + ENI.UI.formatValuta(res && res.bonus));
                await _load();
            } catch(e) {
                btn.disabled = false;
                ENI.UI.error('Errore: ' + e.message);
            }
        });

        aggiorna();
    }

    return { render: render };
})();
```

- [ ] **Step 4: Aggiungere la voce di menu**

In `js/config.js`, dentro `NAV_ITEMS`, subito dopo la voce `buste-paga-mie`:

```javascript
        { id: 'bonus-venduto', label: 'Bonus venduto', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>', route: '#/bonus-venduto' },
```

Aggiungere `'bonus-venduto'` all'array `moduli` di **tutti e tre** i ruoli (righe ~48, ~53, ~58), accanto a `'buste-paga-mie'`. **Non** aggiungerlo a `scrivere`: il dipendente non scrive nelle tabelle, passa dall'RPC.

- [ ] **Step 5: Nasconderla al super admin**

In `js/app.js`, dentro `_getNavItemsForRole`, dopo il blocco di `buste-paga-mie`:

```javascript
            // "Bonus venduto" è la vista del dipendente: il gestore usa
            // Gestione Personale → Bonus.
            if (item.id === 'bonus-venduto' && isSA) return false;
```

- [ ] **Step 6: Aggiungere lo script e alzare le versioni**

In `index.html`, accanto agli altri moduli:

```html
    <script src="js/modules/bonus-venduto.js?v=1"></script>
```

Alzare di uno il `?v=` di `js/config.js` e `js/app.js`.

- [ ] **Step 7: Eseguire i test**

Run: `node test/test-bonus-moduli.js`
Expected: PASS (la parte "Gestione Personale" arriva con la Task 9).

Run: `node --check js/modules/bonus-venduto.js && node --check js/config.js && node --check js/app.js`
Expected: nessun output.

- [ ] **Step 8: Commit**

```bash
git add js/modules/bonus-venduto.js js/config.js js/app.js index.html test/test-bonus-moduli.js
git commit -F - <<'EOF'
feat(bonus): sezione Bonus venduto nel portale dipendente

Portafoglio del mese, pulsante "Ho venduto" con anteprima del bonus prima
della conferma, prezzo in sola lettura ed elenco delle proprie vendite.
La registrazione passa solo dall'RPC. Voce nascosta al super admin, come
gia' per Le mie richieste, Timbratura e Buste Paga.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 9: Gestione Personale — scheda Bonus

**Files:**
- Create: `js/modules/bonus-gestione.js`
- Modify: `js/config.js` (`NAV_SECTION_ITEMS` e `MODULI_SUPER_ADMIN` riga ~123)
- Modify: `index.html` (tag script nuovo, `?v=` di `config.js`)
- Modify: `test/test-bonus-moduli.js` (aggiungere la sezione di controllo)

**Interfaces:**
- Consumes: `ENI.API.getMovimentiBonus`, `ENI.API.getPeriodiBonus`, `ENI.API.salvaPeriodoBonus`, `ENI.API.ricalcolaPeriodoBonus`, `ENI.API.aggiornaMovimentoBonus`, `ENI.API.eliminaMovimentoBonus`, `ENI.API.getPersonale`.
- Produces: `ENI.Modules.BonusGestione.render(container)`.

- [ ] **Step 1: Aggiungere i controlli al test**

In `test/test-bonus-moduli.js`, prima della riga `console.log('\n' + pass ...)`:

```javascript
console.log('\n--- gestione (lato gestore) ---');
const gest = fs.readFileSync(P + 'js/modules/bonus-gestione.js', 'utf8');
check('il modulo si registra come BonusGestione', /ENI\.Modules\.BonusGestione/.test(gest));
check('legge i movimenti del mese', /getMovimentiBonus\(/.test(gest));
check('permette di correggere una riga', /aggiornaMovimentoBonus\(/.test(gest));
check('permette di cancellare una riga', /eliminaMovimentoBonus\(/.test(gest));
check('permette di segnare come pagato', /salvaPeriodoBonus\(/.test(gest));
check('permette di ricalcolare un periodo', /ricalcolaPeriodoBonus\(/.test(gest));
check('avvisa quando il periodo non corrisponde ai movimenti',
  /non corrisponde/.test(gest));
check('chiede conferma prima di cancellare', /UI\.confirm\(/.test(gest));
check('e riservato al super admin', /'bonus-gestione'/.test(config) &&
  /MODULI_SUPER_ADMIN[\s\S]{0,200}'bonus-gestione'/.test(config));
check('index.html carica il modulo gestore', /js\/modules\/bonus-gestione\.js\?v=/.test(index));
```

- [ ] **Step 2: Eseguire il test e verificare che fallisca**

Run: `node test/test-bonus-moduli.js`
Expected: FAIL con `ENOENT ... js/modules/bonus-gestione.js`.

- [ ] **Step 3: Scrivere il modulo**

Creare `js/modules/bonus-gestione.js`:

```javascript
// ============================================================
// GESTIONALE ENI - Bonus venduto (lato gestore)
// Riepilogo per mese e dipendente, correzione delle righe, pagamento.
//
// "Congelato" non vuol dire immutabile: un mese chiuso non si ricalcola da
// solo, ma il gestore puo' correggere tutto, sempre, anche dopo aver pagato.
// Ogni gesto finisce nel log.
// ============================================================

var ENI = ENI || {};
ENI.Modules = ENI.Modules || {};

ENI.Modules.BonusGestione = (function() {
    'use strict';

    var _anno = new Date().getFullYear();
    var _mese = new Date().getMonth() + 1;
    var _personale = [];
    var _movimenti = [];
    var _periodi = [];
    var _container = null;

    var NOMI_MESE = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
                     'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];

    function _isMeseInCorso() {
        var o = new Date();
        return _anno === o.getFullYear() && _mese === (o.getMonth() + 1);
    }

    async function render(container) {
        _container = container;
        container.innerHTML =
            '<div class="page-header"><h1 class="page-title">💰 Bonus venduto</h1></div>' +
            '<div class="flex gap-3 items-center" style="flex-wrap:wrap;margin-bottom:14px;">' +
                '<select class="form-select" id="bg-mese" style="max-width:160px;"></select>' +
                '<select class="form-select" id="bg-anno" style="max-width:120px;"></select>' +
                '<button class="btn btn-primary btn-sm" id="bg-carica">🔍 Carica</button>' +
            '</div>' +
            '<div id="bg-lista"><div class="flex justify-center" style="padding:2rem;"><div class="spinner"></div></div></div>';

        var selM = container.querySelector('#bg-mese');
        selM.innerHTML = NOMI_MESE.map(function(n, i) {
            return '<option value="' + (i + 1) + '"' + ((i + 1) === _mese ? ' selected' : '') + '>' + n + '</option>';
        }).join('');
        var selA = container.querySelector('#bg-anno');
        var y = new Date().getFullYear();
        var opt = '';
        for (var a = y; a >= y - 3; a--) opt += '<option value="' + a + '"' + (a === _anno ? ' selected' : '') + '>' + a + '</option>';
        selA.innerHTML = opt;

        container.querySelector('#bg-carica').addEventListener('click', function() {
            _mese = parseInt(selM.value, 10);
            _anno = parseInt(selA.value, 10);
            _load();
        });

        await _load();
    }

    async function _load() {
        var lista = document.getElementById('bg-lista');
        if (lista) lista.innerHTML = '<div class="flex justify-center" style="padding:2rem;"><div class="spinner"></div></div>';
        try {
            _personale = await ENI.API.getPersonale();
            _movimenti = await ENI.API.getMovimentiBonus(_anno, _mese);
            _periodi   = await ENI.API.getPeriodiBonus(_anno, _mese);
        } catch(e) {
            if (lista) lista.innerHTML = '<div class="stock-alert">Errore: ' + ENI.UI.escapeHtml(e.message) + '</div>';
            return;
        }
        _render();
    }

    function _totaliDi(personaleId) {
        var venduto = 0, bonus = 0, pezzi = 0;
        _movimenti.forEach(function(m) {
            if (m.personale_id !== personaleId) return;
            venduto += Number(m.imponibile || 0);
            bonus   += Number(m.bonus_calcolato || 0);
            pezzi   += Number(m.quantita || 0);
        });
        return { venduto: venduto, bonus: bonus, pezzi: pezzi };
    }

    function _periodoDi(personaleId) {
        return _periodi.filter(function(p) { return p.personale_id === personaleId; })[0] || null;
    }

    function _render() {
        var lista = document.getElementById('bg-lista');
        if (!lista) return;

        var conAttivita = _personale.filter(function(p) {
            return _totaliDi(p.id).pezzi > 0 || _periodoDi(p.id);
        });

        if (!conAttivita.length) {
            lista.innerHTML = '<div class="empty-state" style="padding:2rem;">' +
                '<p class="empty-state-text">Nessun bonus in ' + NOMI_MESE[_mese - 1] + ' ' + _anno + '</p></div>';
            return;
        }

        var righe = conAttivita.map(function(p) {
            var t = _totaliDi(p.id);
            var per = _periodoDi(p.id);
            var disallineato = per && !per.forzato &&
                Math.abs(Number(per.bonus_totale) - t.bonus) > 0.005;

            var stato = _isMeseInCorso()
                ? '<span class="badge badge-gray">in corso</span>'
                : (per
                    ? (per.stato === 'pagato'
                        ? '<span class="badge badge-success">pagato</span>'
                        : '<span class="badge badge-warning">da pagare</span>')
                    : '<span class="badge badge-gray">da chiudere</span>');

            var azioni = '';
            if (!_isMeseInCorso()) {
                if (!per || per.stato !== 'pagato') {
                    azioni += '<button class="btn btn-sm btn-primary" data-paga="' + p.id + '">💶 Segna pagato</button> ';
                } else {
                    azioni += '<button class="btn btn-sm btn-outline" data-riapri="' + p.id + '">↩️ Riapri</button> ';
                }
            }
            azioni += '<button class="btn btn-sm btn-outline" data-righe="' + p.id + '">📋 Righe</button>';

            return '<tr>' +
                '<td>' + ENI.UI.escapeHtml(p.nome_completo) + '</td>' +
                '<td>' + ENI.UI.formatValuta(t.venduto) + '</td>' +
                '<td style="text-align:center;">' + t.pezzi + '</td>' +
                '<td style="font-weight:600;">' + ENI.UI.formatValuta(per && per.forzato ? per.bonus_totale : t.bonus) +
                    (per && per.forzato ? ' <span class="text-xs text-muted">(forzato)</span>' : '') + '</td>' +
                '<td>' + stato + '</td>' +
                '<td>' + azioni + '</td>' +
            '</tr>' +
            (disallineato
                ? '<tr><td colspan="6" class="stock-alert" style="font-size:.85rem;">' +
                    '⚠️ ' + NOMI_MESE[_mese - 1] + ': il maturato registrato (' +
                    ENI.UI.formatValuta(per.bonus_totale) + ') <strong>non corrisponde</strong> più ai movimenti (' +
                    ENI.UI.formatValuta(t.bonus) + '). ' +
                    '<button class="btn btn-sm btn-outline" data-ricalcola="' + p.id + '">🔄 Ricalcola</button>' +
                  '</td></tr>'
                : '');
        }).join('');

        lista.innerHTML = '<div class="table-wrapper"><table class="table">' +
            '<thead><tr><th>Dipendente</th><th>Venduto</th><th>Pezzi</th><th>Bonus</th><th>Stato</th><th></th></tr></thead>' +
            '<tbody>' + righe + '</tbody></table></div>';

        lista.addEventListener('click', _onClick);
    }

    async function _onClick(e) {
        var b = e.target.closest('button');
        if (!b) return;

        if (b.dataset.paga)      return _segnaPagato(b.dataset.paga, 'pagato');
        if (b.dataset.riapri)    return _segnaPagato(b.dataset.riapri, 'da_pagare');
        if (b.dataset.ricalcola) return _ricalcola(b.dataset.ricalcola);
        if (b.dataset.righe)     return _mostraRighe(b.dataset.righe);
    }

    async function _segnaPagato(personaleId, stato) {
        var t = _totaliDi(personaleId);
        var per = _periodoDi(personaleId);
        try {
            await ENI.API.salvaPeriodoBonus({
                personale_id: personaleId,
                anno: _anno, mese: _mese,
                venduto: per && per.forzato ? per.venduto : t.venduto,
                bonus_totale: per && per.forzato ? per.bonus_totale : t.bonus,
                forzato: !!(per && per.forzato),
                stato: stato,
                pagato_at: stato === 'pagato' ? new Date().toISOString() : null,
                pagato_da: stato === 'pagato' ? ENI.State.getUserId() : null,
                updated_at: new Date().toISOString()
            });
            ENI.UI.success(stato === 'pagato' ? 'Segnato come pagato' : 'Periodo riaperto');
            await _load();
        } catch(err) {
            ENI.UI.error('Errore: ' + err.message);
        }
    }

    async function _ricalcola(personaleId) {
        try {
            await ENI.API.ricalcolaPeriodoBonus(personaleId, _anno, _mese);
            ENI.UI.success('Periodo ricalcolato');
            await _load();
        } catch(err) {
            ENI.UI.error('Errore: ' + err.message);
        }
    }

    function _mostraRighe(personaleId) {
        var pers = _personale.filter(function(p) { return p.id === personaleId; })[0];
        var righe = _movimenti.filter(function(m) { return m.personale_id === personaleId; });

        var body = righe.length
            ? '<div class="table-wrapper"><table class="table"><thead><tr>' +
                '<th>Data</th><th>Articolo</th><th>Q.tà</th><th>Venduto</th><th>Bonus</th><th></th>' +
              '</tr></thead><tbody>' +
              righe.map(function(m) {
                  return '<tr>' +
                      '<td>' + ENI.UI.formatData(m.created_at) + '</td>' +
                      '<td>' + ENI.UI.escapeHtml(m.nome_prodotto) + '</td>' +
                      '<td><input type="number" min="1" class="form-input bg-qta" style="max-width:70px;" ' +
                          'data-id="' + m.id + '" value="' + m.quantita + '"></td>' +
                      '<td>' + ENI.UI.formatValuta(m.imponibile) + '</td>' +
                      '<td><input type="number" step="0.01" min="0" class="form-input bg-bonus" style="max-width:90px;" ' +
                          'data-id="' + m.id + '" value="' + Number(m.bonus_calcolato).toFixed(2) + '"></td>' +
                      '<td>' +
                          '<button class="btn btn-sm bg-salva" data-id="' + m.id + '" title="Salva">💾</button>' +
                          '<button class="btn btn-sm bg-del" data-id="' + m.id + '" data-desc="' +
                              ENI.UI.escapeHtml(m.nome_prodotto) + '" title="Elimina" ' +
                              'style="color:var(--color-danger);">✕</button>' +
                      '</td>' +
                  '</tr>';
              }).join('') + '</tbody></table></div>'
            : '<p class="text-muted">Nessuna riga in questo mese.</p>';

        var modal = ENI.UI.showModal({
            title: '📋 ' + (pers ? pers.nome_completo : '') + ' — ' + NOMI_MESE[_mese - 1] + ' ' + _anno,
            body: body,
            footer: '<button class="btn btn-outline" data-modal-close>Chiudi</button>'
        });

        modal.addEventListener('click', async function(e) {
            var salva = e.target.closest('.bg-salva');
            if (salva) {
                var id = salva.dataset.id;
                var m = righe.filter(function(x) { return x.id === id; })[0];
                var qta = parseInt(modal.querySelector('.bg-qta[data-id="' + id + '"]').value, 10);
                var bon = parseFloat(modal.querySelector('.bg-bonus[data-id="' + id + '"]').value);
                if (isNaN(qta) || qta < 1 || isNaN(bon) || bon < 0) {
                    ENI.UI.warning('Quantità e bonus non validi');
                    return;
                }
                try {
                    await ENI.API.aggiornaMovimentoBonus(id,
                        { quantita: qta, bonus_calcolato: bon },
                        'qta ' + m.quantita + ', bonus ' + ENI.UI.formatValuta(m.bonus_calcolato));
                    ENI.UI.success('Riga corretta');
                    ENI.UI.closeModal(modal);
                    await _load();
                } catch(err) { ENI.UI.error('Errore: ' + err.message); }
                return;
            }

            var del = e.target.closest('.bg-del');
            if (del) {
                var ok = await ENI.UI.confirm({
                    title: 'Eliminare la riga?',
                    message: 'Il bonus di "' + del.dataset.desc + '" verrà tolto dal maturato.',
                    confirmText: 'Elimina', cancelText: 'Annulla'
                });
                if (!ok) return;
                try {
                    await ENI.API.eliminaMovimentoBonus(del.dataset.id, del.dataset.desc);
                    ENI.UI.success('Riga eliminata');
                    ENI.UI.closeModal(modal);
                    await _load();
                } catch(err) { ENI.UI.error('Errore: ' + err.message); }
            }
        });
    }

    return { render: render };
})();
```

- [ ] **Step 4: Registrare la voce nella sezione Gestione Personale**

In `js/config.js`, dentro `NAV_SECTION_ITEMS`, accanto a `buste-paga`:

```javascript
        { id: 'bonus-gestione', label: 'Bonus venduto', icon: '💰', route: '#/bonus-gestione' },
```

e aggiungere `'bonus-gestione'` all'array `MODULI_SUPER_ADMIN` (riga ~123) e all'array `moduli` del ruolo con i permessi pieni (riga ~48).

- [ ] **Step 5: Aggiungere lo script e alzare la versione**

In `index.html`:

```html
    <script src="js/modules/bonus-gestione.js?v=1"></script>
```

Alzare di uno il `?v=` di `js/config.js`.

- [ ] **Step 6: Eseguire tutti i test**

```bash
node test/test-bonus-calcoli.js
node test/test-bonus-api.js
node test/test-bonus-moduli.js
node test/test-cassa-quadratura.js
node test/test-cassa-lavaggi-totale.js
node test/test-lavaggi-pagamento.js
node test/test-timbrature-correzione.js
node --check js/modules/bonus-gestione.js
```
Expected: tutti `0 falliti`, `node --check` senza output.

- [ ] **Step 7: Commit**

```bash
git add js/modules/bonus-gestione.js js/config.js index.html test/test-bonus-moduli.js
git commit -F - <<'EOF'
feat(bonus): scheda Bonus in Gestione Personale

Riepilogo per mese e dipendente, correzione e cancellazione delle singole
righe, riapertura di un periodo gia' pagato e avviso quando il maturato
registrato non corrisponde piu' ai movimenti, con ricalcolo su richiesta.
Niente si muove da solo.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 10: Collaudo e pubblicazione

**Files:** nessuno da modificare, salvo correzioni emerse dal collaudo.

- [ ] **Step 1: Verificare la parità fra SQL e JavaScript**

Con le fasce 0→3%, 10→5%, 30→7% configurate e la modalità `percentuale`:

Run: `node test/test-bonus-calcoli.js --parita`
Poi lanciare `sql/verifica_bonus_parita.sql` nel SQL Editor.
Expected: i dieci valori coincidono al centesimo. In particolare `10,00 → 0,50` e `12,00 × 3 → 1,80`.

- [ ] **Step 2: Collaudo del percorso completo**

Con un utente dipendente (non super admin):

1. Impostazioni → Bonus venduto: modalità percentuale, fasce 0/10/30 → salva
2. Magazzino: accendere il bonus su un articolo con giacenza > 0
3. Portale dipendente → Bonus venduto → Ho venduto: scegliere l'articolo, quantità 2, Contanti
4. Verificare che l'anteprima mostri il bonus **prima** di confermare
5. Confermare e verificare che: il portafoglio si aggiorni, l'articolo abbia la giacenza scalata di 2, la vendita compaia nel modulo Vendite con il nome del dipendente, e la Cassa del giorno trovi l'importo nel venduto negozio

- [ ] **Step 3: Verificare che il dipendente non possa scavalcare le regole**

Con la sessione del dipendente, dalla console del browser:

```javascript
await ENI.API.getMieiMovimentiBonus(2026, 9);   // deve tornare solo le sue righe
await supabaseClient.from('bonus_movimenti').insert({ personale_id: '...', quantita: 99 });
```
Expected: la seconda chiamata **fallisce** per RLS. Se riuscisse, fermarsi: le policy della Task 2 non sono state applicate correttamente.

- [ ] **Step 4: Pubblicare**

**Chiedere conferma al gestore prima di questo passo.** `main` è la produzione.

```bash
git checkout main
git merge --no-ff feat/bonus-venduto
git push origin main
```

---

## Verifica del piano contro il progetto

| Requisito del progetto | Dove è coperto |
|---|---|
| Euro al pezzo / percentuale a fasce di prezzo | Task 1 (`bonusRiga`), Task 3 (`bonus_riga_calcola`), Task 5 (configurazione) |
| Fascia sul prezzo del pezzo, estremo incluso | Task 1 Step 2 (test `10,00 SALE alla fascia da 10`), Task 3, Task 10 Step 1 |
| Regola unica, nessuna eccezione per articolo | Task 2 (`magazzino` ha solo `bonus_attivo`), Task 7 |
| Solo articoli scelti dal gestore | Task 2 (colonna + indice), Task 7 (interruttore), Task 3 (l'RPC rifiuta gli altri) |
| Prezzo dal magazzino, niente sconti | Task 3 Step 1 (punto 4 dell'RPC), Task 8 (campo `readonly`), Task 4 (test sui nomi dei parametri) |
| Autore dall'accesso utente | Task 3 (`current_staff_id()`), Task 4 (test "NON manda il dipendente") |
| Bonus visibile su ogni riga | Task 2 (`bonus_calcolato`), Task 8 (tabella), Task 9 (righe modificabili) |
| Anteprima prima di confermare | Task 8 Step 3 (`#bv-bonus`), Task 8 Step 1 (test) |
| Copia storica di prezzo, modo e valore | Task 2 (colonne), Task 3 (insert), commento nella migration |
| Portafoglio in tempo reale | Task 8 (`_load()` dopo ogni vendita) |
| Mese chiuso congelato | Task 3 (`ricalcola_periodo_bonus` non si autoinvoca), Task 9 (avviso con ricalcolo a richiesta) |
| Tutto correggibile dal gestore | Task 9 (correggi, cancella, aggiungi, forza, riapri) |
| Ogni modifica nel log | Task 4 (`scriviLog` in ogni funzione di scrittura), Task 4 Step 1 (test) |
| Dipendente vede solo il proprio | Task 2 (policy), Task 10 Step 3 (verifica pratica) |
| Dipendente non scrive nei movimenti | Task 2 (nessuna policy di insert), Task 10 Step 3 |
| Diagnosi degli errori di configurazione | Task 1 (`problemiConfigurazione`), Task 5 (`#bonus-problemi`) |
| Parità fra calcolo JS e SQL | Task 3 Step 2-3, Task 10 Step 1 |
| Voce nascosta al super admin | Task 8 Step 5, Task 8 Step 1 (test) |
| Esportazione xlsx | **Non coperta.** Vedi sotto |

**Fuori dal primo rilascio, d'accordo con il gestore:** l'esportazione xlsx
della scheda Bonus. Quando si farà, il modello è `_esportaMagazzino()` in
`js/modules/magazzino.js:340`, che usa la libreria globale `XLSX` già caricata
da `index.html`; è una funzione privata di quel modulo, quindi va riscritta nel
modulo del bonus sullo stesso schema, non importata.

**Aggiunto su richiesta del gestore:** la Task 6 (scheda di modifica articolo in
Magazzino) non nasce dal progetto del bonus. È un buco che esisteva già — un
refuso nel nome costringeva a rifare l'articolo da capo — ed è stato incluso qui
perché è lo stesso modulo che si tocca e perché `aggiornaProdotto` era già
pronta e inutilizzata.

**Verificato prima di scrivere il piano:**
- `impostazioni_app.valore` è di tipo `jsonb`: la lettura `valore #>> '{}'` nella
  Task 3 è corretta sia per la stringa `bonus_modo` sia per il numero
  `bonus_euro_pezzo`.
- `magazzino.js` ha `_isServizio(p)` (riga 147), usato nella Task 7 per il
  trattino sui servizi.
- `salva_vendita(jsonb, jsonb, text)` esiste in
  `supabase/migrations/20260812_a4_salva_vendita.sql` e restituisce il jsonb
  della vendita creata: la Task 3 ne legge l'`id`.
- `is_staff()` e `staff_role()` esistono in
  `supabase/migrations/20260730_1a_01_auth_foundation.sql`; `current_staff_id()`
  **non** esiste e la crea la Task 2.
