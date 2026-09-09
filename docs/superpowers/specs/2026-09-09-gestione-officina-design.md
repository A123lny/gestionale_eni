# Gestione Officina — design

**Data:** 2026-09-09
**Stato:** approvato dall'utente (blocco dati/flusso e blocco UI)

## Obiettivo

Gestire il magazzino ricambi dell'officina (lampadine, batterie, gomme, filtri…),
separato dal Magazzino del distributore. Per ogni articolo servono: quantità in
giacenza, quanto è stato speso per comprarlo, a quanto viene rivenduto.

Gli articoli escono dalla giacenza registrando un **intervento** sull'auto; a
intervento chiuso l'importo (ricambi + manodopera) entra nel venduto della
giornata in Cassa.

## Confini

- **Non** è il Magazzino: tabelle e modulo separati, nessun articolo condiviso.
- **Non** tocca il modulo Vendita: gli interventi non passano dal carrello.
- **Non** tocca il modulo Cassa: l'incasso arriva in cassa perché l'intervento
  crea un record in `vendite`, esattamente come già fanno i lavaggi
  (`salvaVenditaDaLavaggio` in `js/api.js`). Il venduto negozio è già calcolato
  da `getVenditeTotaliPerData`, che non va modificato.
- **Non** collega l'intervento all'anagrafica clienti (scelta dell'utente:
  bastano targa e modello) né al personale che ha eseguito il lavoro.
- **Non** emette fattura: se in futuro servirà, si aggancia a Fatturazione.

## Dati

Quattro tabelle nuove, tutte con prefisso `officina_`.

### `officina_articoli`

| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid pk | default `gen_random_uuid()` |
| `codice` | text unique | progressivo `OFF0001` via `get_prossimo_codice` |
| `nome` | text not null | |
| `categoria` | text | da `ENI.Config.CATEGORIE_OFFICINA` |
| `marca` | text | opzionale |
| `unita_misura` | text | default `'pz'` |
| `giacenza` | numeric | default 0, mai negativa |
| `giacenza_minima` | numeric | default 0; 0 = nessun alert |
| `ultimo_costo` | numeric | costo unitario dell'ultimo carico |
| `prezzo_vendita` | numeric | prezzo di rivendita al cliente |
| `ubicazione` | text | scaffale/cassetto, opzionale |
| `note` | text | |
| `attivo` | boolean | default true (dismissione senza cancellare lo storico) |
| `created_at` / `ultima_movimentazione` | timestamptz | |

### `officina_carichi`

Storico degli acquisti. Rispondere a "quanto ho speso davvero" richiede lo
storico, non il solo costo corrente.

| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid pk | |
| `articolo_id` | uuid fk → `officina_articoli` | on delete restrict |
| `data` | date not null | |
| `quantita` | numeric not null | > 0 |
| `costo_unitario` | numeric not null | |
| `costo_totale` | numeric | generato: `quantita * costo_unitario` |
| `fornitore` | text | |
| `documento` | text | n° DDT/fattura |
| `note` | text | |
| `operatore_id` / `operatore_nome` | | chi ha registrato |
| `created_at` | timestamptz | |

### `officina_interventi`

| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid pk | |
| `codice` | text unique | progressivo `OFI0001` |
| `data` | date not null | |
| `ora` | text | |
| `targa` | text | maiuscolo, normalizzata senza spazi |
| `modello` | text | |
| `descrizione` | text | cosa è stato fatto |
| `manodopera` | numeric | default 0, non tocca le giacenze |
| `totale_ricambi` | numeric | somma delle righe |
| `totale` | numeric | `totale_ricambi + manodopera` |
| `costo_ricambi` | numeric | somma dei costi congelati, per il margine |
| `metodo_pagamento` | text | `contanti` / `pos` |
| `importo_contanti`, `importo_pos` | numeric | |
| `stato` | text | `completato` / `annullato` |
| `vendita_id` | uuid fk → `vendite` | null se annullato |
| `note` | text | |
| `operatore_id` / `operatore_nome` | | |
| `created_at` | timestamptz | |

### `officina_interventi_righe`

| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid pk | |
| `intervento_id` | uuid fk → `officina_interventi` | on delete cascade |
| `articolo_id` | uuid fk → `officina_articoli` | nullable (riga libera) |
| `codice_articolo`, `nome_articolo` | text | snapshot |
| `quantita` | numeric | |
| `prezzo_unitario` | numeric | prezzo di vendita al momento |
| `costo_unitario` | numeric | **costo congelato**: il margine dell'intervento resta corretto anche se il costo cambia dopo |
| `totale_riga` | numeric | |

## Funzioni atomiche (RPC)

Stesso principio già usato per vendite e giacenze: le operazioni che toccano più
tabelle stanno in una transazione sola, così non esiste lo stato "a metà".

### `movimenta_giacenza_officina(p_articolo_id uuid, p_delta numeric)`

Gemella di `movimenta_giacenza`, ma su `officina_articoli`:
`giacenza = greatest(0, giacenza + delta)`. `security invoker`.

### `carica_articolo_officina(p_carico jsonb)`

1. inserisce la riga in `officina_carichi`
2. alza la giacenza dell'articolo di `quantita`
3. aggiorna `ultimo_costo` col costo unitario del carico

Ritorna il carico inserito. `security invoker`.

### `salva_intervento_officina(p_intervento jsonb, p_righe jsonb)`

1. codice progressivo `OFI` via `get_prossimo_codice`
2. insert testata in `officina_interventi`
3. insert righe in `officina_interventi_righe`
4. scarico giacenze (`movimenta_giacenza_officina` con delta negativo)
5. se `totale > 0`: codice progressivo `VEN` + insert in `vendite`
   (`stato='completata'`) e `vendite_dettaglio` con `categoria='Officina'`, una
   riga per ricambio più una riga manodopera se > 0
6. scrive `vendita_id` sulla testata dell'intervento (null se `totale = 0`)

Ritorna l'intervento. `security invoker`.

**Perché la vendita nasce qui e non lato client:** se il client creasse
l'intervento e poi la vendita con due chiamate, un errore di rete in mezzo
lascerebbe giacenze scaricate senza incasso in cassa — un ammanco falso.

### `annulla_intervento_officina(p_intervento_id uuid)`

Rimette le giacenze, porta l'intervento a `stato='annullato'`, porta la vendita
collegata a `stato='annullata'` (così esce dal venduto del giorno, che filtra
per `stato='completata'`).

## Sicurezza

- RLS accesa su tutte e quattro le tabelle, unica policy
  `for all to authenticated using (public.is_staff()) with check (public.is_staff())`,
  identica al lockdown di `20260812_1b_01_lockdown_staff.sql`.
- Le RPC sono `security invoker`: restano soggette alla RLS.
- Ruoli: `officina-ricambi` e `officina-interventi` in `moduli` e `scrivere` del
  ruolo **Admin**. Il **Cassiere** non li ha (decisione dell'utente, reversibile
  con una riga in `js/config.js`).

## Moduli e wiring

| File | Cosa fa |
|---|---|
| `js/modules/officina.js` | `ENI.Modules.OfficinaRicambi` — anagrafica, giacenze, carichi |
| `js/modules/officina-interventi.js` | `ENI.Modules.OfficinaInterventi` — lista e form interventi |
| `js/api.js` | funzioni API (in fondo, prima del blocco return) |
| `js/config.js` | `PREFISSI.OFFICINA_ART`/`OFFICINA_INT`, `CATEGORIE_OFFICINA`, ruoli, `NAV_SECTIONS` + `NAV_SECTION_ITEMS` |
| `js/router.js` | rotte `officina-ricambi` e `officina-interventi` |
| `index.html` | due `<script>` con `?v=1` |
| `supabase/migrations/20260909_officina.sql` | tabelle + RPC + RLS, **da lanciare a mano nel SQL Editor** |

Due file invece di uno: `magazzino.js` è già a 700 righe ed è scomodo da
modificare; anagrafica e interventi sono due responsabilità distinte.

### Navigazione

Nuova sezione in `NAV_SECTIONS`:

```
{ id: 'officina', label: 'Officina', icon: <chiave inglese>,
  children: ['officina-ricambi', 'officina-interventi'], dividerBefore: true }
```

### API

```
getArticoliOfficina(filtri)      salvaArticoloOfficina(dati)
aggiornaArticoloOfficina(id, d)  eliminaArticoloOfficina(id)
getCarichiOfficina(articoloId)   caricaArticoloOfficina(dati)   // RPC
getInterventiOfficina(filtri)    getInterventoDettaglio(id)
salvaInterventoOfficina(i, r)    // RPC
annullaInterventoOfficina(id)    // RPC
getSottoScortaOfficina()
```

## Interfaccia

### Ricambi (`#/officina-ricambi`)

- Header con tre totali: **valore a costo** (Σ giacenza × ultimo_costo),
  **valore a prezzo di vendita**, **margine potenziale** (differenza e %).
- Alert sotto scorta in cima, come in Magazzino.
- Barra filtri: ricerca testo (nome, codice, marca) + chip categoria.
- Lista paginata (10/25/50/100) con: nome, codice, categoria, giacenza,
  ultimo costo, prezzo vendita, margine %, valore riga.
- Azioni per riga: **Carica** (form carico), **Modifica**, **Storico carichi**,
  **Elimina** (solo se non usato in nessun intervento).
- Export CSV/xlsx come Magazzino.

### Interventi (`#/officina-interventi`)

- Filtri: intervallo date (default mese corrente) + ricerca per targa.
- Lista: codice, data, targa, modello, totale, margine.
- Form nuovo intervento: data, targa, modello, descrizione, righe ricambi
  (ricerca articolo → quantità, prezzo precompilato dal listino e modificabile),
  manodopera, metodo di pagamento. Riepilogo a piè di form con totale ricambi,
  manodopera, totale, e margine stimato.
- Dettaglio intervento con pulsante **Annulla** (chiede conferma).

## Casi limite decisi

- **Giacenza insufficiente**: l'intervento si salva comunque, con avviso
  (il pezzo può essere fisicamente lì anche se l'anagrafica è indietro). La
  giacenza si ferma a 0, come già fa `movimenta_giacenza`.
- **Articolo senza prezzo di vendita**: consentito; la riga parte a 0 e il prezzo
  si scrive a mano.
- **Riga libera** (pezzo comprato apposta, non a magazzino): consentita,
  `articolo_id` null, nessuno scarico.
- **Manodopera a 0**: nessuna riga manodopera nella vendita.
- **Intervento a costo zero** (garanzia/cortesia): totale 0 → nessuna vendita
  creata, ma le giacenze si scaricano lo stesso.
- **Targa**: normalizzata maiuscola senza spazi per rendere la ricerca affidabile.

## Verifica

Test in locale prima di pubblicare, come da prassi del progetto:

1. Lanciare la migration su Supabase e verificare che le quattro tabelle esistano
   con RLS accesa.
2. Creare un articolo, registrare un carico → giacenza e `ultimo_costo` corretti,
   carico visibile nello storico.
3. Registrare un intervento con due ricambi + manodopera → giacenze scalate,
   vendita creata con categoria `Officina`.
4. Aprire la Cassa di quella data → l'importo dell'intervento compare nel venduto.
5. Annullare l'intervento → giacenze ripristinate, vendita annullata, cassa torna
   al valore precedente.
6. Verificare che un utente Cassiere non veda la sezione Officina, né via menu né
   digitando la rotta a mano.

Bump di `?v=` in `index.html` per ogni JS toccato (prassi obbligatoria del
progetto: senza, i dispositivi restano sulla versione vecchia).
