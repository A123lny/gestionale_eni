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
| Periodo | Mensile, azzerato il 1° |
| Origine del dato | Il dipendente registra la vendita dal proprio portale; la vendita nasce da lì |
| Sconti | **Non ammessi**: il prezzo è quello di Magazzino, non modificabile |
| Elenco nel portale | Solo articoli con bonus attivo |
| Portafoglio | Ricalcolato in tempo reale a ogni vendita |
| Pagamento | Automatico a fine mese, il maturato diventa "da pagare in busta" |
| Approvazione del gestore | Nessuna sulla singola riga; il gestore segna il periodo come pagato |

## Come si calcola

Il venduto bonificabile del mese è la somma degli imponibili delle righe bonus
del dipendente. Gli scaglioni si applicano **per fasce successive**, come le
aliquote fiscali.

Esempio con fasce `0–500 → 3%`, `500–1.000 → 5%`, `oltre 1.000 → 7%`:

```
venduto mensile 840 €
  primi   500 €  ×  3%  =  15,00 €
  restanti 340 € ×  5%  =  17,00 €
                          --------
  bonus a scaglioni        32,00 €
```

Gli articoli a **bonus fisso** (tot euro a pezzo) accreditano il loro importo
secco, **fuori** dal calcolo percentuale, ma il loro venduto **concorre** a
raggiungere le fasce. Un pezzo da 120 € con bonus fisso 10 € accredita 10 € e
alza di 120 € il totale su cui si misurano le soglie.

Bonus totale del mese = bonus a scaglioni + somma dei bonus fissi.

### Casi limite

- **Nessuno scaglione configurato**: gli articoli "a scaglioni" danno 0. Gli
  articoli a bonus fisso continuano a funzionare.
- **Fasce non contigue o sovrapposte**: l'interfaccia le impedisce; il calcolo
  ordina per soglia e ignora le righe incoerenti invece di sbagliare in silenzio.
- **Vendita annullata**: la riga bonus segue la vendita e sparisce. Il
  portafoglio del mese in corso si ricalcola; un mese già pagato **non si
  ricalcola** (vedi *Rettifiche*).
- **Quantità maggiore di 1**: imponibile = prezzo × quantità, bonus fisso ×
  quantità.
- **Giacenza insufficiente**: la vendita viene rifiutata, come nel modulo
  Vendite. Nessun bonus.

## Dati

### Modifiche a tabelle esistenti

`magazzino` — tre colonne nuove, tutte facoltative:

| Colonna | Tipo | Significato |
|---|---|---|
| `bonus_attivo` | boolean, default false | l'articolo entra nel bonus |
| `bonus_tipo` | text: `scaglioni` \| `fisso` | come si calcola |
| `bonus_euro` | numeric(10,2) | euro a pezzo, solo se `fisso` |

Vincolo: `bonus_tipo` e `bonus_euro` hanno senso solo con `bonus_attivo = true`;
`bonus_euro` obbligatorio (e > 0) quando `bonus_tipo = 'fisso'`.

### Tabelle nuove

**`bonus_scaglioni`** — le fasce, modificabili dalle Impostazioni.

| Colonna | Tipo |
|---|---|
| `id` | uuid pk |
| `da_euro` | numeric(10,2) not null |
| `percentuale` | numeric(5,2) not null |
| `created_at` | timestamptz |

La fascia arriva fino al `da_euro` della successiva; l'ultima è aperta. Si
memorizza solo l'inizio: due estremi memorizzati possono divergere, uno no.

**`bonus_movimenti`** — una riga per ogni vendita bonus. È il registro, non il
saldo.

| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid pk | |
| `personale_id` | uuid not null → personale | chi ha venduto |
| `vendita_id` | uuid not null → vendite on delete cascade | l'aggancio |
| `magazzino_id` | uuid → magazzino | articolo |
| `nome_prodotto` | text not null | copia storica del nome |
| `quantita` | integer not null | |
| `imponibile` | numeric(10,2) not null | prezzo × quantità |
| `bonus_tipo` | text | `scaglioni` \| `fisso`, copiato al momento |
| `bonus_fisso` | numeric(10,2) | valorizzato solo se `fisso` |
| `anno`, `mese` | integer | periodo di competenza, dalla data vendita |
| `created_at` | timestamptz | |

Il **bonus percentuale non si memorizza sulla riga**: dipende dal totale del
mese, quindi cambierebbe a ogni vendita successiva. Si calcola sul periodo.

`bonus_tipo` e `bonus_fisso` sono copiati dall'articolo al momento della
vendita: se domani cambi la regola, il passato non si riscrive da solo.

**`bonus_periodi`** — la chiusura mensile. Esiste solo per i mesi chiusi.

| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid pk | |
| `personale_id` | uuid not null → personale | |
| `anno`, `mese` | integer not null | unique con personale_id |
| `venduto` | numeric(10,2) | fotografia alla chiusura |
| `bonus_scaglioni` | numeric(10,2) | |
| `bonus_fisso` | numeric(10,2) | |
| `bonus_totale` | numeric(10,2) | |
| `stato` | text: `da_pagare` \| `pagato` | |
| `pagato_at`, `pagato_da` | timestamptz, uuid | |
| `note` | text | |

Il mese in corso **non ha** una riga qui: si calcola al volo dai movimenti.
La riga nasce alla prima apertura del modulo dopo la fine del mese, con i valori
congelati. Così il maturato pagato non cambia più, qualunque cosa succeda dopo
alle vendite.

### Rettifiche

Se una vendita di un mese **già chiuso** viene annullata, la riga bonus sparisce
ma `bonus_periodi` resta com'è. La differenza si vede in Gestione Personale con
un avviso; la correzione la decide il gestore, a mano, e non è automatica. È
voluto: un importo già messo in busta non si può ritirare da solo.

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
6. inserisce la riga in `bonus_movimenti`

I punti 1 e 4 sono la ragione per cui questa è un'RPC e non tre chiamate dal
browser: chi ha la sessione non può né accreditare un collega né inventarsi un
prezzo. È anche il motivo per cui "niente sconti" è una regola facile da tenere.

## Sicurezza

| Tabella | Dipendente | Gestore |
|---|---|---|
| `bonus_scaglioni` | sola lettura (gli serve per la barra di avanzamento) | lettura e scrittura |
| `bonus_movimenti` | legge **solo le proprie** righe, nessuna scrittura | lettura |
| `bonus_periodi` | legge **solo i propri** | lettura e scrittura |

Nessun `insert` diretto su `bonus_movimenti` da parte di nessuno: scrive solo
l'RPC. Serve una helper `current_staff_id()` accanto alle esistenti
`is_staff()` / `staff_role()`, che restituisca `personale.id` dell'utente
collegato.

## Interfaccia

### Impostazioni → Bonus venduto

Interruttore del modulo e tabella delle fasce, con aggiunta e rimozione righe.
Sotto la tabella, un esempio calcolato dal vivo (*"con queste fasce, chi vende
800 € prende 32 €"*) per non doverci ragionare a mente.

### Magazzino → scheda articolo

Un blocco "Bonus dipendenti": interruttore, scelta fra *segue gli scaglioni* e
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

**Le mie vendite del mese**: elenco con data, articolo, importo. Serve a
contestare o riconoscere una riga, non a modificarla.

### Gestione Personale → scheda Bonus

Per mese: riga per dipendente con venduto, bonus, stato, e il pulsante *segna
come pagato*. Il mese in corso si vede in sola lettura, con l'etichetta "in
corso". Esportazione in xlsx come nelle altre liste, per portarlo al
commercialista.

## Calcoli puri, isolati

Il calcolo a scaglioni finisce in `js/lib/bonus-calcoli.js`, senza DOM e senza
database, così è verificabile da riga di comando come
`js/lib/cassa-quadratura.js` e `js/lib/officina-calcoli.js`:

- `bonusScaglioni(venduto, scaglioni)` → importo
- `fasciaCorrente(venduto, scaglioni)` → `{ percentuale, mancanoAllaProssima }`
- `riepilogoPeriodo(movimenti, scaglioni)` → `{ venduto, scaglioni, fisso, totale }`

Da coprire con test: fasce vuote, una sola fascia, venduto esattamente sulla
soglia, fasce disordinate, importi a zero, valori non numerici.

La stessa aritmetica esiste **anche in SQL** per la chiusura del periodo. È una
duplicazione consapevole: il client deve mostrare il portafoglio senza
interrogare il server a ogni tasto, il server deve congelare il periodo senza
fidarsi del client. I test confrontano i due risultati sugli stessi dati.

## Fuori portata

- Bonus su carburante e lavaggi
- Bonus a squadra o su obiettivi non legati al venduto
- Pagamento automatico: il passaggio in busta paga resta manuale
- Storico precedente all'attivazione: il bonus parte dal giorno in cui si accende

## Punti aperti

1. **Soglie uguali per tutti o per persona?** Il progetto assume uguali per
   tutti. Renderle personali significa aggiungere una tabella di eccezioni.
2. **Un dipendente inattivo** con maturato non pagato resta in elenco finché
   non lo si salda: da confermare che sia il comportamento voluto.
