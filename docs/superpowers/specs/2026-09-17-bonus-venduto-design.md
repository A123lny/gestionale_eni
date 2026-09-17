# Bonus venduto ai dipendenti — progetto

Data: 2026-09-17

## A cosa serve

Riconoscere ai dipendenti una quota sul venduto di **tutta la merce di
magazzino**, tipicamente pezzi da 10-30 euro. Il dipendente vede il proprio portafoglio bonus crescere in tempo
reale e riceve il maturato in busta paga il mese successivo.

Restano fuori soltanto il **carburante**, che non sta in magazzino e ha i suoi
moduli, e i **servizi di Lavaggio**, che hanno gia' il proprio modulo e la
propria strada verso la cassa: venderli anche da qui aprirebbe una seconda via
per la stessa vendita.

Non e' un rifacimento del modulo Vendite: quello resta la cassa del negozio.
Il portale bonus e' la strada con cui il dipendente registra una vendita fatta
da lui, e serve a dargliene atto.

## Decisioni prese con il gestore

| Tema | Decisione |
|---|---|
| Su quali articoli | **Tutti** quelli di Magazzino, tranne la categoria Lavaggi. Nessuna selezione per articolo |
| Come si calcola | **Euro al pezzo** oppure **percentuale a fasce di prezzo**, scelta unica per tutti |
| Su cosa si misura la fascia | Sul **prezzo del singolo pezzo**, non sul venduto del mese |
| Eccezioni per articolo | Nessuna: una regola sola, e vale su tutto il magazzino |
| Soglie diverse per persona | Nessuna, uguali per tutti |
| Dove si vede il bonus | Su ogni riga, in euro |
| Periodo | Mensile, azzerato il 1° |
| Origine del dato | Il dipendente registra la vendita dal proprio portale; la vendita nasce da lì |
| Prezzo | Preso dal **Magazzino**, non modificabile: niente sconti |
| Autore | Preso dall'**accesso utente**, non dichiarato dal client |
| Elenco nel portale | Tutti gli articoli attivi con un prezzo, tranne i Lavaggi |
| Portafoglio | Ricalcolato in tempo reale a ogni vendita |
| Pagamento | Il mese chiuso diventa "da pagare", resta tale finché il gestore non salda |
| Modificabilità | **Tutto correggibile dal gestore, sempre**, anche a mese chiuso e dopo il pagamento. Ogni modifica finisce nel log |

## Come si calcola

Due modalita', si sceglie una volta nelle Impostazioni e vale per tutto il
magazzino.

### Euro al pezzo

Un importo fisso per ogni pezzo venduto. `bonus = euro_al_pezzo × quantità`.
Tre pezzi con la regola a 1,00 € danno 3,00 €, qualunque sia il prezzo.

### Percentuale a fasce di prezzo

La fascia si sceglie in base al **prezzo del singolo pezzo**; la percentuale
trovata si applica all'imponibile della riga.

| Da | A | % |
|---|---|---|
| 0 € | 10 € | 3% |
| 10 € | 30 € | 5% |
| 30 € | — | 7% |

```
3 pezzi da 12,00 €
  fascia del pezzo da 12 €   ->  10–30  ->  5%
  imponibile 3 × 12,00       =  36,00 €
  bonus        36,00 × 5%    =   1,80 €
```

Gli estremi: un pezzo da **esattamente 10,00 €** sta nella fascia 10–30, non in
quella sotto. La fascia va dal proprio `da_prezzo` incluso fino al `da_prezzo`
della successiva escluso; l'ultima è aperta.

### Ogni riga vale da sola

È la conseguenza importante di misurare la fascia sul prezzo del pezzo: il bonus
di una riga **non dipende da nessun'altra riga**. Correggerne una non ne
ricalcola altre, cancellarne una non sposta le fasce delle vicine, e il
dipendente sa quanto prende nel momento in cui vende, senza dover sapere a che
punto è del mese.

### Casi limite

- **Nessuna fascia configurata** in modalità percentuale: il bonus è 0 e
  l'interfaccia lo dice chiaramente invece di far finta di niente.
- **Fasce disordinate o sovrapposte**: l'interfaccia le impedisce; il calcolo
  ordina per soglia e scarta le righe incoerenti invece di sbagliare in silenzio.
- **Prezzo sotto la prima fascia**: se la prima fascia non parte da 0, i pezzi
  sotto quella soglia danno 0. Da mostrare in Impostazioni, perché è un errore
  di configurazione facile da fare.
- **Vendita annullata**: la riga bonus sparisce con lei (vedi *Correzioni*).
- **Giacenza insufficiente**: la vendita viene rifiutata come nel modulo Vendite.
  Nessun bonus.
- **Quantità**: sempre intera e ≥ 1.

## Dati

### Modifiche a tabelle esistenti

**Nessuna.** Il bonus vale su tutto il magazzino, quindi non serve nessun campo
per marcare gli articoli. L'unico criterio e' la categoria: si escludono i
Lavaggi, e il carburante non sta in questa tabella.

(La colonna `bonus_attivo`, nata da una versione precedente del progetto in cui
il gestore sceglieva gli articoli uno per uno, resta sul database ma **non e'
piu' letta da nessuno**. Non si cancella perche' togliere una colonna in
produzione non si disfa.)

### Impostazioni

Righe in `impostazioni_app` (tabella chiave/valore già esistente):

| Chiave | Valore |
|---|---|
| `bonus_modo` | `euro` \| `percentuale` |
| `bonus_euro_pezzo` | importo, usato se `bonus_modo = 'euro'` |

L'interruttore di accensione del modulo segue il meccanismo già in uso per gli
altri moduli (`ENI.State.isModuloAttivo`).

### Tabelle nuove

**`bonus_fasce`** — le fasce di prezzo, usate solo in modalità percentuale.

| Colonna | Tipo |
|---|---|
| `id` | uuid pk |
| `da_prezzo` | numeric(10,2) not null |
| `percentuale` | numeric(5,2) not null |
| `created_at` | timestamptz |

Si memorizza solo l'inizio della fascia: due estremi memorizzati possono
divergere, uno no.

**`bonus_movimenti`** — una riga per ogni vendita bonus, con il suo bonus in euro.

| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid pk | |
| `personale_id` | uuid not null → personale | chi ha venduto |
| `vendita_id` | uuid → vendite on delete cascade | null se riga aggiunta a mano dal gestore |
| `magazzino_id` | uuid → magazzino | |
| `nome_prodotto` | text not null | copia storica del nome |
| `quantita` | integer not null | |
| `prezzo_unitario` | numeric(10,2) not null | copia dal magazzino al momento |
| `imponibile` | numeric(10,2) not null | prezzo × quantità |
| `regola_modo` | text not null | `euro` \| `percentuale`, com'era quel giorno |
| `regola_valore` | numeric(10,2) not null | euro al pezzo, o la percentuale applicata |
| `bonus_calcolato` | numeric(10,2) not null | il bonus di questa riga |
| `anno`, `mese` | integer not null | competenza, dalla data vendita |
| `modificato_da` | uuid → personale | valorizzato se corretta dal gestore |
| `modificato_at` | timestamptz | |
| `created_at` | timestamptz | |

`prezzo_unitario`, `regola_modo` e `regola_valore` sono **copiati al momento
della vendita**: se domani cambi la regola o il prezzo di listino, il passato
non si riscrive da solo. Sono anche la spiegazione di come è nato quel numero,
leggibile a distanza di mesi senza ricostruire niente.

**`bonus_periodi`** — la chiusura mensile. Esiste solo per i mesi chiusi.

| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid pk | |
| `personale_id` | uuid not null → personale | unique con anno, mese |
| `anno`, `mese` | integer not null | |
| `venduto` | numeric(10,2) | |
| `bonus_totale` | numeric(10,2) | |
| `forzato` | boolean default false | true se il totale è stato scritto a mano |
| `stato` | text: `da_pagare` \| `pagato` | |
| `pagato_at`, `pagato_da` | timestamptz, uuid | |
| `note` | text | |
| `updated_at` | timestamptz | |

Il mese in corso **non ha** una riga qui: si calcola al volo sommando i
movimenti. La riga nasce alla prima apertura del modulo dopo la fine del mese.

## Congelato, ma sempre correggibile

Sono due cose diverse e devono convivere:

- **Congelato** vuol dire che *da solo* non si muove niente. Un mese chiuso non
  si ricalcola a tua insaputa perché qualcuno ha toccato una vendita vecchia.
- **Correggibile** vuol dire che *tu* puoi cambiare qualunque cosa, in qualunque
  momento, anche dopo aver pagato.

| Azione del gestore | Effetto |
|---|---|
| Corregge quantità, prezzo o bonus di una riga | La riga si aggiorna e il totale del periodo si ri-somma. **Nessun'altra riga cambia** |
| Cancella una riga | Idem |
| Aggiunge una riga a mano | Nasce senza vendita agganciata, marcata come inserita dal gestore |
| Scrive direttamente il totale del periodo | Il valore forzato vince sul calcolo e resta marcato `forzato` |
| Riapre un periodo pagato | Torna `da_pagare`, tutto resta modificabile |

Ogni operazione finisce in `log_attivita` con valore prima e dopo, come già fanno
la correzione delle timbrature e la modifica della cassa.

**Cosa NON succede da solo:** se una vendita di un mese già chiuso viene
annullata dal modulo Vendite, la riga bonus sparisce ma il periodo **non** si
aggiorna. Compare invece un avviso in Gestione Personale — *"Settembre: il
maturato non corrisponde più ai movimenti"* — con il pulsante per ricalcolare.
Premi tu, perché un importo già messo in busta non deve potersi ritirare da solo.

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
2. rifiuta se l'articolo non esiste, non e' attivo, e' della categoria Lavaggi
   o ha prezzo zero
3. rifiuta se la quantità non è intera e ≥ 1, o se la giacenza non basta
4. prende il prezzo **da `magazzino.prezzo_vendita`**, non dal client
5. legge la regola dalle Impostazioni e calcola il bonus della riga
6. crea la vendita con `salva_vendita` (riuso, non duplicazione)
7. inserisce la riga in `bonus_movimenti`

I punti 1, 4 e 5 sono il motivo per cui questa è un'RPC e non tre chiamate dal
browser: chi ha la sessione non può accreditare un collega, inventarsi un
prezzo, né spacciare una percentuale diversa da quella configurata. È anche ciò
che rende "niente sconti" una regola vera e non una raccomandazione.

**RPC `ricalcola_periodo_bonus(p_personale_id, p_anno, p_mese)`**: ri-somma i
movimenti del mese e aggiorna il periodo se esiste e non è `forzato`. La
chiamano le correzioni del gestore e il pulsante dell'avviso. Mai un
automatismo a tempo.

## Sicurezza

| Tabella | Dipendente | Gestore |
|---|---|---|
| `bonus_fasce` | sola lettura (per mostrargli la regola) | lettura e scrittura |
| `bonus_movimenti` | legge **solo le proprie**, nessuna scrittura | lettura e scrittura |
| `bonus_periodi` | legge **solo i propri** | lettura e scrittura |

Il dipendente non scrive mai in `bonus_movimenti`: per lui l'unica strada è
l'RPC. Serve una helper `current_staff_id()` accanto alle esistenti
`is_staff()` / `staff_role()`, che restituisca `personale.id` dell'utente
collegato.

## Interfaccia

### Impostazioni → Bonus venduto

Scelta della modalità, e sotto solo quello che serve a quella modalità:

- **euro al pezzo** → un campo, l'importo
- **percentuale** → la tabella delle fasce, righe che si aggiungono e si tolgono

In fondo un esempio calcolato dal vivo — *"un pezzo da 25 € rende 1,25 €"* — e
gli avvisi di configurazione: fasce sovrapposte, buco sotto la prima fascia,
nessuna fascia inserita.

### Magazzino

**Niente da fare.** Il bonus vale su tutto, quindi non c'e' nessun interruttore
da accendere ne' nessun elenco da tenere aggiornato: un articolo caricato oggi
da' bonus da oggi.

Resta invece la **scheda di modifica articolo**, nata durante questo lavoro e
utile a prescindere dal bonus: prima un refuso nel nome o un decimale sbagliato
nel prezzo obbligavano a disattivare l'articolo e rifarlo, perdendo lo storico.

### Portale dipendente → 💰 Bonus venduto

Nuova voce di menu, nascosta al super admin come già accade per *Le mie
richieste*, *Timbratura* e *Buste Paga*.

**Portafoglio**, in cima:

```
Bonus di settembre                  18,40 €
   su 640,00 € venduti · 23 pezzi

Da ricevere in busta
   Agosto 2026                      47,50 €
```

**Ho venduto**: articolo (solo quelli a bonus), quantità, contanti o POS. Il
prezzo è mostrato ma **non modificabile**, e accanto compare subito quanto
prende lui — così lo sa prima di confermare, non dopo. Alla conferma il
portafoglio si aggiorna sotto gli occhi.

**Le mie vendite del mese**: data, articolo, quantità, importo e il bonus di
quella riga. Sola lettura: serve a riconoscere una riga, non a cambiarla.

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

- `fasciaPerPrezzo(prezzo, fasce)` → la fascia applicabile, o null
- `bonusRiga(prezzoUnitario, quantita, regola)` → `{ bonus, regolaModo, regolaValore }`
- `problemiConfigurazione(fasce)` → elenco leggibile di cosa non va

Da coprire con test: nessuna fascia, una sola fascia, prezzo esattamente sulla
soglia (deve cadere nella fascia superiore), prezzo sopra l'ultima fascia,
prezzo sotto la prima quando non parte da 0, fasce disordinate, fasce
sovrapposte, quantità multiple, modalità euro, importi a zero, valori non
numerici.

La stessa aritmetica esiste **anche in SQL**, dentro `registra_vendita_bonus`. È
una duplicazione consapevole: il client deve mostrare l'anteprima del bonus
senza interrogare il server a ogni tasto, il server non deve fidarsi del client.
I test confrontano i due risultati sugli stessi dati.

## Fuori portata

- Bonus su carburante e lavaggi
- Bonus a squadra o su obiettivi non legati al venduto
- Soglie sul venduto mensile del dipendente: le fasce sono sul prezzo del pezzo
- Pagamento automatico: il passaggio in busta paga resta manuale
- Storico precedente all'attivazione: il bonus parte dal giorno in cui si accende
