# Fatturazione — Export Bancari (RID/SDD + RIBA)

Riferimento tecnico-operativo per la sezione **Fatturazione → Export bancari**.

---

## 1. Architettura

```
┌──────────────────┐
│ UI (browser)     │  export-bancari.js
│  ▸ vista aperta  │   - mostra anteprima editabile se mese mai esportato
│  ▸ vista chiusa  │   - mostra card riepilogo + tabella read-only se esportato
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ generazione      │  _generaRID() / _generaRIBA()
│ file CBI         │   - costruisce XML SEPA SDD per RID
│                  │   - costruisce tracciato fisso 120 byte per RIBA
└────────┬─────────┘
         │
         ▼
┌──────────────────┐    ┌──────────────────┐
│ download al user │    │ upsert log su DB │  ENI.API.upsertExportBancariLog
│ (file .xml/.car) │    │ export_bancari_  │   - INSERT prima volta
│                  │    │ log              │   - UPDATE ++num_export
└──────────────────┘    └──────────────────┘
```

Quando l'utente apre un mese, il sistema:
1. Carica le fatture EMESSE per `mese_riferimento + anno_riferimento`
2. Carica eventuali log esistenti dalla tabella `export_bancari_log`
3. Per ogni tipo (RID, RIBA): se c'è log → vista chiusa, altrimenti vista aperta

---

## 2. Operatività quotidiana

### Flusso normale

1. **Fatturazione → Export bancari** → seleziona mese/anno → "Carica"
2. Verifica che le righe abbiano stato **OK** (no "IBAN mancante", "ABI/CAB mancante", ecc.)
3. Click su **"Genera file RID/RIBA"**
4. File scaricato + log registrato automaticamente
5. Carica il file nel portale della banca

Dal momento del primo "Genera", quel mese è **lockato** per quel tipo: la prossima volta che apri il mese vedrai la vista chiusa.

### Riscaricare un mese già esportato

Nella vista chiusa c'è il bottone **"📥 Riscarica file"**. Lo usi se:
- La banca ha perso il file
- Hai modificato dati cliente dopo il primo export e vuoi un file aggiornato
- Vuoi ricontrollare i contenuti

Ogni riscarica incrementa `num_export` nel log. I dati vengono presi dallo stato attuale del DB (non da uno snapshot al momento del primo export).

### Cosa fare se la banca rifiuta il file

Errori comuni e diagnosi:
| Errore banca | Probabile causa | Fix |
|---|---|---|
| `cvc-pattern-valid` per `IBAN2007Identifier` | IBAN cliente malformato (lunghezza ≠ 27 per SM/IT) | Correggi IBAN in anagrafica cliente |
| `cvc-minLength-valid` per `Max35Text` | Campo `<Nm>` troppo lungo (>35 char) | Accorcia ragione sociale emittente o cliente |
| `Sono presenti errori formali nel flusso` | File RIBA non multiplo di 120 byte, oppure record 14 misallineato | Controlla che impostazioni `codice_sia` e `iban_lista` siano popolate correttamente |
| `Mailbox is full` (bounce SMTP) | Casella destinatario piena | Contatta cliente, non è un nostro problema |

Se l'errore non è chiaro, confronta byte-per-byte il file generato col file Mexal di riferimento usando `scripts/parse_riba_legacy.py`.

### Annullare un export (es. file mai caricato in banca)

Non c'è UI dedicata. Cancella la riga dalla tabella `export_bancari_log` direttamente da Supabase:

```sql
DELETE FROM export_bancari_log
WHERE tipo = 'RIBA' AND mese = 4 AND anno = 2026;
```

Alla prossima apertura del mese, vedrai di nuovo la vista aperta.

---

## 3. Pre-requisiti per generare i file

### Impostazioni Fatturazione (record unico in `impostazioni_fatturazione`)

| Campo | RID | RIBA | Note |
|---|---|---|---|
| `abi_emittente` (5 char) | ✓ | ✓ | ABI banca dell'azienda. Es. `06067` |
| `cab_emittente` (5 char) | – | ✓ | CAB filiale. Es. `09801` |
| `codice_cbi` (8 char) | ✓ | – | Codice CBI utente. Es. `1987558U`. Va in `<Othr><Issr>CBI</Issr>` del SEPA |
| `codice_sia` (5 char) | – | ✓ | Codice SIA azienda (diverso da CBI!). Es. `C43SF`. Va nel record header e in record 14 |
| `codice_creditore_sdd` | ✓ | – | Creditor Identifier SEPA. Es. `SM31001000000000SM30756` |
| `codice_fiscale_emittente` | ✓ | ✓ | Per RID: in formato `IT00000030756`. Per RIBA: viene normalizzato a 11 digit zero-padded |
| `iban_lista` (jsonb) | ✓ | ✓ | Array di IBAN aziendali. **Niente spazi nell'IBAN!** |
| `ragione_sociale_emittente` | ✓ | ✓ | Per RID viene troncato a 35 char per Max35Text |

### Cliente (per ogni cliente da includere)

| Campo | RID | RIBA |
|---|---|---|
| `iban` (27 char per SM/IT) | **obbligatorio** | utile, non obbligatorio |
| `mandate_id` | **obbligatorio** | non serve |
| `abi_banca` (5 char) | utile | **obbligatorio** |
| `cab_banca` (5 char) | utile | **obbligatorio** |
| `modalita_pagamento_fattura` = `RID_SDD` o `RIBA` | richiesto per filtraggio | richiesto per filtraggio |
| `nome_ragione_sociale` (≤ 35 char per RID) | sì | sì |
| `p_iva_coe` | sì | per RIBA viene strippato di prefissi `ASM`/`NSM` → `SM` |

---

## 4. Riferimento layout file

### RID `.xml` (SEPA SDD CBI 00.01.01)

Schema namespace: `urn:CBI:xsd:CBISDDReqLogMsg.00.01.01`

Struttura essenziale:
```
CBISDDReqLogMsg
└─ GrpHdr
│  ├─ MsgId        ← "SDDCAR" + ABI(5) + YY(2) + MM(2) + "01"
│  ├─ NbOfTxs      ← numero disposizioni
│  ├─ CtrlSum      ← totale (decimal con 2 cifre)
│  └─ InitgPty
│     ├─ Nm        ← Max35Text (troncato e UPPER)
│     └─ Id/OrgId/Othr × 2 ← Codice CBI + Codice fiscale
└─ PmtInf (un blocco per data scadenza, di solito 1)
   ├─ PmtInfId
   ├─ ReqdColltnDt ← data scadenza (15 del mese successivo per RID)
   ├─ Cdtr (azienda emittente)
   ├─ CdtrAcct/IBAN (IBAN azienda — senza spazi!)
   ├─ CdtrSchmeId  ← codice creditore SDD
   └─ DrctDbtTxInf (una per fattura)
      ├─ InstdAmt Ccy="EUR"
      ├─ MndtId      ← cliente.mandate_id
      ├─ Dbtr/Nm     ← Max35Text
      ├─ DbtrAcct/IBAN  ← cliente.iban (deve passare validazione SEPA)
      └─ RmtInf/Ustrd   ← descrizione causale
```

Date in formato `YYYY-MM-DD`. Importi come decimal naturale (no padding).

### RIBA `.car` (CBI tracciato fisso)

**Dimensione totale del file = sempre multiplo di 120 byte**.

Struttura:
- **Header**: 121 byte (con leading space)
- **Disposizioni**: N × 7 record × 120 byte (840 byte ognuna)
- **Footer**: 119 byte (NO leading space, inizia con `EF`)

Totale = 121 + N×840 + 119 = (37 + (N−1)×7) × 120 quando N≥1.

Per N=5 disposizioni: 121 + 4200 + 119 = **4440 byte** ✓

#### Header (121 byte)
| Pos | Len | Contenuto | Esempio |
|---|---|---|---|
| 0 | 1 | leading space | ` ` |
| 1-2 | 2 | marker | `IB` |
| 3-7 | 5 | codice SIA | `C43SF` |
| 8-12 | 5 | ABI emittente | `06067` |
| 13-18 | 6 | data DDMMYY | `060526` |
| 19-21 | 3 | tipo flusso | `CAR` |
| 22-29 | 8 | data DDMMYYYY | `06052026` |
| 30-33 | 4 | ora HHMM | `1311` |
| 34-112 | 79 | filler spaces | |
| 113-120 | 8 | trailer `E       ` | E + 7 spaces |

#### Record 14 (disposizione, 120 byte)
| Pos | Len | Contenuto |
|---|---|---|
| 0-1 | 2 | `14` |
| 2-8 | 7 | progressivo `0000001` |
| 9-20 | 12 | filler spaces |
| 21-26 | 6 | data scadenza DDMMYY |
| 27 | 1 | tipo `3` |
| 28-30 | 3 | filler `000` |
| 31-44 | 14 | importo cents (left-padded) |
| 45 | 1 | segno `-` |
| 46-50 | 5 | ABI creditore |
| 51-55 | 5 | CAB creditore |
| 56-67 | 12 | conto creditore (12 digit dal IBAN posizioni 15-26) |
| 68-72 | 5 | ABI debitore |
| 73-77 | 5 | CAB debitore |
| 78-89 | 12 | filler spaces |
| 90-94 | 5 | codice SIA ripetuto |
| 95-111 | 17 | numero contratto (es. `40000000050200001`) |
| 112-117 | 6 | filler |
| 118 | 1 | `E` |
| 119 | 1 | space |

#### Record 30 (debitore, 120 byte)
- pos 0-1: `30`
- pos 2-8: progressivo
- pos 9-68: nome cliente (60 char, padded)
- pos 69-75: P.IVA `SM` + 5 digit (7 char, **strippato di prefissi `ASM`/`NSM`**)
- pos 76-119: filler

#### Record 40 (indirizzo + banca debitore, 120 byte)
- pos 0-1: `40`
- pos 2-8: progressivo
- pos 9-38: indirizzo (30 char)
- pos 39-43: CAP (5 char)
- pos 44-64: comune (21 char)
- pos 65-67: nazione (3 char, `RSM` per San Marino — NON `SM`)
- pos 68: separator space
- pos 69-118: banca appoggio (50 char)
- pos 119: filler

#### Record 50 (riferimento documento, 120 byte)
- pos 0-1: `50`
- pos 2-8: progressivo
- pos 9-?: `RIF.DOCU.NUM.:  <numero>      del DD/MM/YYYY` (90 char)
- pos 99-109: codice fiscale emittente come **11 digit zero-padded** (`00000030756`)
- pos 110-119: filler

#### Record 51, 70 (chiusura)
- 51: pos 9-18 = progressivo×2, pos 19-98 = nome creditore, resto filler
- 70: 9 char prefisso + 91 spazi + `0` + 19 spazi (chiusura disposizione)

#### Footer (119 byte, NO leading space)
| Pos | Len | Contenuto |
|---|---|---|
| 0-1 | 2 | `EF` |
| 2-6 | 5 | codice SIA |
| 7-11 | 5 | ABI |
| 12-17 | 6 | data DDMMYY |
| 18-20 | 3 | `CAR` |
| 21-28 | 8 | data DDMMYYYY |
| 29-32 | 4 | ora HHMM |
| 33-43 | 11 | filler spaces |
| 44-50 | 7 | nDispo (es. `0000005`) |
| 51-65 | 15 | totale × 10 (formato millesimi convenzionale Mexal) |
| 66-80 | 15 | totale positivi (zero per RIBA: `000000000000000`) |
| 81-87 | 7 | nRecordsTot (= 1 header + N×7 + 1 footer) |
| 88-111 | 24 | filler |
| 112-118 | 7 | trailer `E      ` (E + 6 spaces) |

---

## 5. Schema database

### `export_bancari_log` (migration 016)

```sql
CREATE TABLE export_bancari_log (
    id              UUID PRIMARY KEY,
    tipo            VARCHAR(10) CHECK (tipo IN ('RID', 'RIBA')),
    mese            INT,
    anno            INT,
    prima_export_at TIMESTAMPTZ DEFAULT NOW(),
    ultima_export_at TIMESTAMPTZ DEFAULT NOW(),
    num_export      INT DEFAULT 1,       -- incrementato a ogni riscarica
    num_disposizioni INT,
    totale          DECIMAL(12,2),
    banca_iban      TEXT,
    fatture_ids     UUID[],
    UNIQUE (tipo, mese, anno)
);
```

Una sola riga per coppia `(tipo, mese, anno)`. Le riscariche aggiornano la stessa riga.

---

## 6. Lessons learned (storico fix non-ovvi)

Ordine cronologico delle scoperte fatte durante setup di Aprile 2026.

### IBAN azienda con spazi → banca rifiuta
Mexal/utente aveva salvato in `iban_lista` IBAN come `SM 42 J 06067 09801 000019801935`. Il SEPA Identifier rejecta con cvc-pattern-valid. Fix: salvare sempre senza spazi (UPDATE `iban_lista` con `REPLACE(..., ' ', '')`).

### `<Nm>Enilive Station di Andrea Cervellini</Nm>` (36 char) → banca rifiuta
Schema SEPA usa `Max35Text` per `<Nm>`. Il nome lungo viola il limite. Fix: `_max35Upper()` tronca + uppercase, con fallback non-vuoto per evitare anche `minLength=1`.

### IBAN clienti SM con check digit a 1 cifra
10 clienti avevano IBAN come `SM4R0328709804000040315836` (26 char) invece di `SM04R0328...` (27). Tipico errore di import: leading zero dropato. Fix automatico via SQL pattern matching.

### Codice SIA ≠ Codice CBI
Mexal usa `C43SF` (5 char) come codice SIA nel header del .car, e `1987558U` (8 char) come codice CBI utente nel SEPA SDD XML. Il codice export-bancari originario usava `codice_cbi` ovunque, generando .car con header da 8 char invece di 5 e disallineando tutto. Fix: campo separato `codice_sia` in `impostazioni_fatturazione` (migration 015).

### P.IVA debitore con prefisso `ASM`/`NSM`
Vecchi import nel DB hanno `ASM05221` o `NSM24255` invece di `SM05221`/`SM24255`. Il record 30 ha campo P.IVA da 7 char esatti — l'`A`/`N` extra rompe l'allineamento. Fix in `_pivaCliente()` strippa il prefisso.

### Codice fiscale emittente: SEPA vs CBI
SEPA XML accetta `IT00000030756`. Il record 50 di RIBA `.car` vuole 11 digit zero-padded `00000030756` (senza prefisso paese). Helper `_coeNumerico()` normalizza.

### Record 70: zero a posizione fissa 100
Mexal mette il `0` di chiusura disposizione a pos 100 del record 70 (9 prefisso + 91 spazi + `0`). Originario codice lo metteva a pos 108. Fix: `'70' + n + ' '.repeat(91) + '0' + ' '.repeat(19)` = 120 byte.

### Footer 119 byte (NO leading space)
**La fix più subtle**. Total file = multiplo di 120. Header = 121 (con leading space), data records = 120 ognuno, footer = 119 (senza leading space). Originario codice generava footer da 120 byte con leading space, rendendo il file 4441 byte (1 byte extra) → "errore formale" della banca.

### Email SMTP via Alice non scrive in "Posta inviata"
Diversamente da Mexal, l'invio via SMTP `nodemailer` non popola la cartella Sent del webmail. Risolto con IMAP append best-effort dopo SMTP send (vedi `print-server/server.js`).

---

## 7. Migrazione futura: provider transazionale email

L'invio attuale via SMTP Alice/TIM dà solo conferma di accettazione SMTP, non delivery reale. Per delivery webhook (delivered/bounced/opened):

1. Registrare un dominio aziendale (`@enilivestation.com` o simile)
2. Configurare DNS: SPF, DKIM, DMARC
3. Provider candidato: SendGrid / Postmark / Mailgun / Amazon SES (gratis fino ~100 mail/giorno)
4. Sostituire transport in `print-server/server.js`
5. Aggiungere endpoint webhook per ricevere eventi delivery
6. Aggiungere colonne `email_delivered_at`, `email_bounced_at`, `email_opened_at`, `email_bounce_reason` su `fatture`
7. Mostrare in UI lo stato reale (oltre a "inviata via SMTP")

Il `email_message_id` salvato adesso resta utile per correlazione tra vecchio e nuovo provider durante la migrazione.

---

## 8. File correlati

| File | Funzione |
|---|---|
| [js/modules/fatturazione/export-bancari.js](../js/modules/fatturazione/export-bancari.js) | UI + generazione file + log |
| [js/modules/fatturazione/impostazioni.js](../js/modules/fatturazione/impostazioni.js) | Form impostazioni RIBA/RID/IBAN |
| [js/api.js](../js/api.js) | API `getExportBancariLog`, `upsertExportBancariLog` |
| [supabase/migrations/015_codice_sia.sql](../supabase/migrations/015_codice_sia.sql) | Aggiunge `codice_sia` |
| [supabase/migrations/016_export_bancari_log.sql](../supabase/migrations/016_export_bancari_log.sql) | Crea tabella log |
| [scripts/parse_riba_legacy.py](../scripts/parse_riba_legacy.py) | Parser .car per debug / estrazione dati legacy |
| [print-server/server.js](../print-server/server.js) | SMTP + IMAP append (per email delle fatture, separato dall'export bancari ma stesso dominio fatturazione) |
