# Bonus venduto ai dipendenti — progetto

Data: 2026-09-17

## A cosa serve

Riconoscere ai dipendenti una quota sul venduto di **articoli scelti dal
gestore**, tipicamente pezzi nuovi che si vogliono spingere. Il dipendente vede
il proprio portafoglio bonus crescere in tempo reale e riceve il maturato in
busta paga il mese successivo.

Non è un rifacimento del modulo Vendite: le vendite ordinarie (tergicristalli,
AdBlue, bar) continuano a passare da lì e **non danno bonus**.

## Decisioni prese con il gestore

| Tema | Decisione |
|---|---|
| Su cosa si prende il bonus | Solo articoli con l'interruttore acceso in Magazzino |
| Come si calcola | Scaglioni sul venduto mensile, **solo sull'eccedenza** |
| Dove si vede il bonus | **Su ogni riga**, in euro, non solo come totale del mese |
| Periodo | Mensile, azzerato il 1° |
| Origine del dato | Il dipendente registra la vendita dal proprio portale; la vendita nasce da lì |
| Prezzo | Preso dal **Magazzino**, non modificabile: niente sconti |
| Autore | Preso dall'**accesso utente**, non dichiarato dal client |
| Elenco nel portale | Solo articoli con bonus attivo |
| Portafoglio | Ricalcolato in tempo reale a ogni vendita |
| Soglie | **Uguali per tutti**, nessuna eccezione personale |
| Pagamento | Il mese chiuso diventa "da pagare", resta tale finché il gestore non salda |
| Modificabilità | **Tutto correggibile dal gestore, sempre**, anche a mese chiuso e anche dopo il pagamento. Ogni modifica finisce nel log |

## Come si calcola

Il venduto bonificabile del mese è la somma degli imponibili delle righe bonus
del dipendente. Gli scaglioni si applicano **per fasce successive**, come le
aliquote fiscali.

### Il bonus è assegnato riga per riga

Le righe del mese si elaborano **in ordine cronologico**, tenendo un totale
progressivo: ogni riga prende la percentuale della fascia in cui cade, e se la
attraversa viene spezzata fra le due fasce.

Fasce `0–500 → 3%`, `500–1.000 → 5%`, `oltre 1.000 → 7%`:

| # | Articolo | Imponibile | Progressivo | Calcolo | Bonus riga |
|---|---|---|---|---|---|
| 1 | Batteria | 300 € | 300 € | 300 × 3% | 9,00 € |
| 2 | Pneumatici | 400 € | 700 € | 200 × 3% + 200 × 5% | 16,00 € |
| 3 | Lampade | 140 € | 840 € | 140 × 5% | 7,00 € |
| | | **840 €** | | | **32,00 €** |

Il totale coincide al centesimo con il calcolo fatto sul monte mensile: è la
stessa aritmetica, solo distribuita. Così il dipendente vede quanto gli ha reso
**quel** pezzo, e non un numero unico a fine mese di cui deve fidarsi.

La riga 2 è il caso che spiega il meccanismo: è quella che ha fatto superare i
500 €, quindi metà è al 3% e metà al 5%.

### Articoli a bonus fisso

Un articolo può avere un bonus in euro a pezzo invece che a percentuale
(`1,00 € al pezzo`). In quel caso:

- la riga accredita `bonus_euro × quantità`, **sempre quell'importo**,
  indipendente dalle fasce
- il suo imponibile **concorre comunque** al progressivo mensile, quindi aiuta
  ad arrivare alla fascia successiva sugli articoli a percentuale
- il valore in euro è **modificabile** sull'articolo in Magazzino e
  **correggibile** sulla singola riga dal gestore

### Casi limite

- **Nessuno scaglione configurato**: gli articoli a percentuale danno 0; quelli a
  bonus fisso funzionano lo stesso.
- **Fasce disordinate o sovrapposte**: l'interfaccia le impedisce; il calcolo
  ordina per soglia e scarta le righe incoerenti invece di sbagliare in silenzio.
- **Vendita annullata**: la riga bonus sparisce con lei e il mese si ricalcola
  (vedi *Correzioni*).
- **Quantità maggiore di 1**: imponibile = prezzo × quantità, bonus fisso × quantità.
- **Giacenza insufficiente**: la vendita viene rifiutata come nel modulo Vendite.
  Nessun bonus.

## Dati

### Modifiche a tabelle esistenti

`magazzino` — tre colonne nuove, tutte facoltative:

| Colonna | Tipo | Significato |
|---|---|---|
| `bonus_attivo` | boolean, default false | l'articolo entra nel bonus |
| `bonus_tipo` | text: `percentuale` \| `fisso` | come si calcola |
| `bonus_euro` | numeric(10,2) | euro a pezzo, solo se `fisso` |

`bonus_euro` è obbligatorio e maggiore di zero quando `bonus_tipo = 'fisso'`.

### Tabelle nuove

**`bonus_scaglioni`** — le fasce, modificabili dalle Impostazioni.

| Colonna | Tipo |
|---|---|
| `id` | uuid pk |
| `da_euro` | numeric(10,2) not null |
| `percentuale` | numeric(5,2) not null |
| `created_at` | timestamptz |

Si memorizza solo l'inizio della fascia: due estremi memorizzati possono
divergere, uno no. La fascia arriva fino al `da_euro` della successiva;
l'ultima è aperta.

**`bonus_movimenti`** — una riga per ogni vendita bonus, **con il suo bonus in
euro**.

| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid pk | |
| `personale_id` | uuid not null → personale | chi ha venduto |
| `vendita_id` | uuid → vendite on delete cascade | l'aggancio; null se riga aggiunta a mano dal gestore |
| `magazzino_id` | uuid → magazzino | articolo |
| `nome_prodotto` | text not null | copia storica del nome |
| `quantita` | integer not null | |
| `imponibile` | numeric(10,2) not null | prezzo × quantità |
| `bonus_tipo` | text not null | `percentuale` \| `fisso`, copiato al momento |
| `bonus_euro` | numeric(10,2) | euro a pezzo, se `fisso` |
| `bonus_calcolato` | numeric(10,2) not null | **il bonus di questa riga, in euro** |
| `anno`, `mese` | integer not null | competenza, dalla data vendita |
| `modificato_da` | uuid → personale | valorizzato se il gestore l'ha corretta |
| `modificato_at` | timestamptz | |
| `created_at` | timestamptz | |

`bonus_tipo`, `bonus_euro` e il prezzo sono **copiati dall'articolo al momento
della vendita**: se domani cambi la regola, il passato non si riscrive da solo.

`bonus_calcolato` è un valore derivato ma **memorizzato**, perché per le righe a
percentuale dipende dalle righe precedenti dello stesso mese. Si ricalcola
quando il mese cambia (vedi sotto), mai da solo.

**`bonus_periodi`** — la chiusura mensile. Esiste solo per i mesi chiusi.

| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid pk | |
| `personale_id` | uuid not null → personale | unique con anno, mese |
| `anno`, `mese` | integer not null | |
| `venduto` | numeric(10,2) | |
| `bonus_totale` | numeric(10,2) | |
| `stato` | text: `da_pagare` \| `pagato` | |
| `pagato_at`, `pagato_da` | timestamptz, uuid | |
| `note` | text | |
| `updated_at` | timestamptz | |

Il mese in corso **non ha** una riga qui: si calcola al volo dai movimenti. La
riga nasce alla prima apertura del modulo dopo la fine del mese.

## Congelato, ma sempre correggibile

Sono due cose diverse e devono convivere:

- **Congelato** vuol dire che *da solo* non si muove niente. Un mese chiuso non
  si ricalcola a tua insaputa perché qualcuno ha toccato una vendita vecchia.
- **Correggibile** vuol dire che *tu* puoi cambiare qualunque cosa, in qualunque
  momento, anche dopo aver pagato.

Come si traduce in pratica:

| Azione del gestore | Effetto |
|---|---|
| Corregge quantità o importo di una riga | La riga si aggiorna, il **mese di quella riga si ricalcola** (le righe successive possono cambiare fascia), il periodo si aggiorna |
| Cancella una riga | Idem |
| Aggiunge una riga a mano | Nasce senza vendita agganciata, marcata come inserita dal gestore, il mese si ricalcola |
| Modifica direttamente il totale del periodo | Il valore scritto a mano vince sul calcolo e resta marcato come forzato |
| Riapre un periodo pagato | Torna `da_pagare`, resta tutto modificabile |

Ogni singola operazione finisce in `log_attivita` con valore prima e dopo, come
già fanno la correzione delle timbrature e la modifica della cassa.

**Cosa NON succede da solo:** se una vendita di un mese già chiuso viene
annullata dal modulo Vendite, la riga bonus sparisce ma il periodo **non** si
ricalcola. Compare invece un avviso in Gestione Personale — *"Settembre: il
maturato non corrisponde più ai movimenti"* — con il pulsante per ricalcolare.
La decisione resta tua, perché un importo già messo in busta non deve potersi
ritirare da solo.

## Il salvataggio deve essere atomico

Una vendita dal portale fa quattro cose che devono riuscire o fallire insieme:
numero vendita, testata e righe, scarico giacenza, riga bonus. Se lo scarico
fallisce a metà resta una vendita fantasma con un bonus appeso.

**RPC `registra_vendita_bonus`** (`security definer`, `search_path` fisso):

```
registra_vendita_bonus(
    p_magazzino_id uuid,
    p_quantita     integer,
    p_metodo       text          -- 'contanti' | 'pos'
) returns record
```

Cosa fa, in ordine:

1. ricava `personale_id` da `auth.uid()` — **non** lo accetta come parametro
2. rifiuta se l'articolo non esiste, non è attivo o non ha `bonus_attivo`
3. rifiuta se la quantità non è ≥ 1 o la giacenza non basta
4. prende il prezzo **da `magazzino.prezzo_vendita`**, non dal client
5. crea la vendita con `salva_vendita` (riuso, non duplicazione)
6. inserisce la riga in `bonus_movimenti` e ricalcola il mese del dipendente

I punti 1 e 4 sono il motivo per cui questa è un'RPC e non tre chiamate dal
browser: chi ha la sessione non può né accreditare un collega né inventarsi un
prezzo. È anche ciò che rende "niente sconti" una regola vera e non una
raccomandazione.

**RPC `ricalcola_bonus_mese(p_personale_id, p_anno, p_mese)`**: rilegge le righe
del mese in ordine cronologico, riassegna `bonus_calcolato` a ciascuna e
aggiorna il periodo se esiste. La chiamano la vendita e ogni correzione del
gestore. Mai un automatismo a tempo.

## Sicurezza

| Tabella | Dipendente | Gestore |
|---|---|---|
| `bonus_scaglioni` | sola lettura (gli serve per la barra di avanzamento) | lettura e scrittura |
| `bonus_movimenti` | legge **solo le proprie**, nessuna scrittura | lettura e scrittura |
| `bonus_periodi` | legge **solo i propri** | lettura e scrittura |

Il dipendente non scrive mai in `bonus_movimenti`: per lui l'unica strada è
l'RPC. Serve una helper `current_staff_id()` accanto alle esistenti
`is_staff()` / `staff_role()`, che restituisca `personale.id` dell'utente
collegato.

## Interfaccia

### Impostazioni → Bonus venduto

Interruttore del modulo e tabella delle fasce, con aggiunta e rimozione righe.
Sotto, un esempio calcolato dal vivo (*"con queste fasce, chi vende 800 € prende
32 €"*) per non doverci ragionare a mente.

### Magazzino → scheda articolo

Blocco "Bonus dipendenti": interruttore, scelta fra *percentuale a scaglioni* e
*bonus fisso*, e l'importo. Nell'elenco magazzino una spunta segnala a colpo
d'occhio gli articoli a bonus.

### Portale dipendente → 💰 Bonus venduto

Nuova voce di menu, nascosta al super admin come già accade per *Le mie
richieste*, *Timbratura* e *Buste Paga*.

**Portafoglio**, in cima:

```
Questo mese hai venduto            840,00 €
Bonus maturato                      32,00 €
   fascia attuale 5% · mancano 160 € al 7%

Da ricevere in busta
   Agosto 2026                      47,50 €
```

**Ho venduto**: articolo (solo quelli a bonus), quantità, contanti o POS. Il
prezzo è mostrato ma **non modificabile**. Alla conferma il portafoglio si
aggiorna sotto gli occhi.

**Le mie vendite del mese**: data, articolo, importo e **il bonus di quella
riga**. Sola lettura: serve a riconoscere una riga, non a cambiarla.

### Gestione Personale → scheda Bonus

Per mese, una riga per dipendente con venduto, bonus, stato e il pulsante *segna
come pagato*. Aprendo il dipendente si vedono le sue righe, ognuna
**modificabile e cancellabile**, più il pulsante per aggiungerne una a mano. Il
totale del periodo è a sua volta scrivibile, e se lo forzi resta scritto che
l'hai forzato.

Il mese in corso si vede con l'etichetta "in corso" ed è modificabile come gli
altri. Esportazione xlsx come nelle altre liste, per portarlo al commercialista.

## Calcoli puri, isolati

Il calcolo finisce in `js/lib/bonus-calcoli.js`, senza DOM e senza database, così
è verificabile da riga di comando come `js/lib/cassa-quadratura.js`:

- `assegnaBonusRighe(righe, scaglioni)` → le stesse righe con `bonus_calcolato`
- `fasciaCorrente(venduto, scaglioni)` → `{ percentuale, mancanoAllaProssima }`
- `riepilogo(righe)` → `{ venduto, bonus }`

Da coprire con test: fasce vuote, una sola fascia, riga esattamente sulla
soglia, riga che attraversa due fasce, riga che ne attraversa tre, fasce
disordinate, importi a zero, valori non numerici, e la verifica che la somma dei
bonus di riga coincida con il calcolo sul monte mensile.

La stessa aritmetica esiste **anche in SQL**, dentro `ricalcola_bonus_mese`. È
una duplicazione consapevole: il client deve mostrare il portafoglio senza
interrogare il server a ogni tasto, il server non deve fidarsi del client. I
test confrontano i due risultati sugli stessi dati.

## Fuori portata

- Bonus su carburante e lavaggi
- Bonus a squadra o su obiettivi non legati al venduto
- Pagamento automatico: il passaggio in busta paga resta manuale
- Storico precedente all'attivazione: il bonus parte dal giorno in cui si accende
