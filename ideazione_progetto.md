# 🏪 GESTIONALE STAZIONE ENI - BORGO MAGGIORE

**Documentazione Tecnica Completa**  
**Versione:** 4.0  
**Data:** 16 Febbraio 2026  
**Proprietario:** Andrea Cervellini  

---

## 📋 INDICE

1. [Panoramica Sistema](#1-panoramica-sistema)
2. [Architettura Tecnica](#2-architettura-tecnica)
3. [Moduli Funzionali](#3-moduli-funzionali)
4. [Struttura Google Sheets](#4-struttura-google-sheets)
5. [Apps Script Backend](#5-apps-script-backend)
6. [Interfaccia HTML](#6-interfaccia-html)
7. [Sistema Permessi](#7-sistema-permessi)
8. [Flussi Operativi](#8-flussi-operativi)
9. [Responsive Mobile](#9-responsive-mobile)
10. [Installazione e Deploy](#10-installazione-e-deploy)

---

## 1. PANORAMICA SISTEMA

### 🎯 Obiettivo

Sistema gestionale completo basato su cloud per la stazione di servizio ENI di Borgo Maggiore (San Marino), progettato per sostituire completamente i fogli Excel manuali con una soluzione digitale integrata accessibile 24/7 da qualsiasi dispositivo.

### 📊 Caratteristiche Principali

- ✅ **100% Web-based** - Accessibile da browser (desktop, tablet, mobile)
- ✅ **Cloud Google** - Nessun server da gestire, zero costi infrastruttura
- ✅ **Real-time** - Aggiornamenti istantanei, dati sempre sincronizzati
- ✅ **Mobile-responsive** - Interfaccia ottimizzata per smartphone
- ✅ **Multi-utente** - Sistema permessi differenziati (Admin/Cassiere/Lavaggi)
- ✅ **Audit completo** - Ogni azione tracciata con utente + timestamp
- ✅ **Backup automatico** - Google Drive salvataggio ogni 24h

### 💼 Ambito Funzionale

Il gestionale copre tutte le operazioni quotidiane della stazione:

| Modulo | Funzionalità Principale |
|--------|-------------------------|
| **Dashboard** | KPI giornalieri, overview operativa |
| **Clienti** | Anagrafica corporate/privati + listini personalizzati |
| **Cassa** | Chiusura giornaliera completa (16 campi carburante + POS multipli) |
| **Crediti** | Tracciamento addebiti clienti + crediti ENI con scadenzario |
| **Lavaggi** | Prenotazioni + timeline visuale + priorità ASPETTA/LASCIA |
| **Magazzino** | Inventario bar/shop/accessori con alert giacenza |
| **Personale** | Gestione dipendenti + turni + permessi accesso |
| **Manutenzioni** | Storico interventi attrezzature + scadenziario |
| **Log** | Audit trail completo di tutte le azioni utente |

---

## 2. ARCHITETTURA TECNICA

### 🏗️ Stack Tecnologico

```
┌──────────────────────────────────────────────┐
│         FRONTEND (CLIENT-SIDE)               │
│                                              │
│  HTML5 + CSS3 + JavaScript Vanilla           │
│  Single Page Application (SPA)               │
│  Responsive Design (Mobile-First)            │
└─────────────────┬────────────────────────────┘
                  │
                  │ google.script.run API
                  │ (AJAX-like communication)
                  │
┌─────────────────▼────────────────────────────┐
│         BACKEND (SERVER-SIDE)                │
│                                              │
│  Google Apps Script (GAS)                    │
│  Server-side JavaScript                      │
│  Business Logic Layer                        │
└─────────────────┬────────────────────────────┘
                  │
                  │ SpreadsheetApp API
                  │
┌─────────────────▼────────────────────────────┐
│         DATA LAYER (PERSISTENCE)             │
│                                              │
│  Google Sheets                               │
│  10 Fogli Strutturati                        │
│  Backup Automatico                           │
└──────────────────────────────────────────────┘
```

### 🔄 Flusso Dati Completo

**Esempio Pratico: Salvataggio Lavaggio**

```
1. USER INTERFACE
   └─ Utente compila form lavaggio
   └─ Click bottone "💾 Salva Lavaggio"

2. FRONTEND VALIDATION
   └─ JavaScript verifica campi obbligatori
   └─ Se mancano dati → Alert "Compila tutti i campi"
   └─ Se OK → Procedi

3. DATA PREPARATION
   └─ Raccoglie dati da form:
      {
        data: "2026-02-16",
        idCliente: "CLI001",
        nomeCliente: "Auto Service SM",
        tipoLavaggio: "Furgone",
        prezzo: 25.00,
        orarioInizio: "09:00",
        orarioFine: "16:00",
        priorita: "LASCIA",
        modalitaPagamento: "Credito",
        walkIn: false,
        utenteCorrente: "Giacomo"
      }

4. ASYNC CALL TO BACKEND
   └─ google.script.run
      .withSuccessHandler(onSuccess)
      .withFailureHandler(onError)
      .salvaLavaggio(dati)

5. APPS SCRIPT RECEIVES REQUEST
   └─ function salvaLavaggio(dati) { ... }

6. SERVER-SIDE VALIDATION
   └─ Verifica dati non null
   └─ Verifica cliente esiste
   └─ Verifica prezzo > 0

7. ID GENERATION
   └─ Genera ID univoco: "LAV004"
   └─ Metodo: Prende ultimo ID + 1

8. WRITE TO SHEETS
   └─ foglio.appendRow([
        "LAV004",              // ID
        new Date("2026-02-16"), // Data
        "09:00",               // Orario Inizio
        "16:00",               // Orario Fine
        "CLI001",              // ID Cliente
        "Auto Service SM",     // Nome Cliente
        "Furgone",             // Tipo
        25.00,                 // Prezzo
        "LASCIA",              // Priorità
        "Prenotato",           // Stato
        false,                 // Walk-in
        "",                    // Note
        "Giacomo",             // Utente Inserimento
        new Date(),            // Data/Ora Inserimento
        "",                    // Utente Completamento
        "",                    // Data/Ora Completamento
        "Credito",             // Modalità Pagamento
        ""                     // ID Credito Collegato
      ])

9. AUDIT LOG
   └─ scriviLog(
        "Giacomo",
        "Creato_Lavaggio",
        "Lavaggi",
        "LAV004 - Auto Service SM - €25"
      )

10. CONDITIONAL LOGIC
    └─ Se modalitaPagamento === "Credito"
       └─ Crea credito automaticamente
       └─ Collega idCreditoCollegato

11. RESPONSE TO FRONTEND
    └─ return { successo: true, id: "LAV004" }

12. SUCCESS HANDLER
    └─ alert("✅ Lavaggio salvato!")
    └─ Ricarica lista lavaggi
    └─ Reset form
```

### 🔐 Sicurezza e Permessi

**Livelli di Sicurezza:**

```
LAYER 1: Google Account Authentication
└─ Solo utenti con account Google autorizzati

LAYER 2: Apps Script Authorization
└─ OAuth 2.0 consent screen
└─ Permessi espliciti per accedere ai dati

LAYER 3: Application-Level Permissions
└─ Ruoli: Admin, Cassiere, Lavaggi
└─ Controlli in Apps Script prima di ogni operazione

LAYER 4: Audit Trail
└─ Ogni azione loggata in foglio "Log"
└─ Timestamp + Utente + Azione + Dettagli
```

**Gestione Errori:**

```javascript
try {
  // Operazione rischiosa
  var foglio = getFoglio('Clienti');
  var dati = foglio.getDataRange().getValues();
  
} catch(error) {
  // Log errore
  Logger.log('ERRORE: ' + error.message);
  
  // Ritorna errore user-friendly
  throw new Error('Impossibile caricare clienti. Riprova.');
}
```

---

## 3. MODULI FUNZIONALI

### 📊 3.1 DASHBOARD

**Scopo:** Panoramica operativa con KPI principali

**KPI Visualizzati:**

```
┌────────────────────┐  ┌────────────────────┐  ┌────────────────────┐
│ 💳 CREDITI APERTI  │  │ 🚗 LAVAGGI OGGI   │  │ 👥 CLIENTI ATTIVI │
│                    │  │                    │  │                    │
│    € 1.250,00      │  │        12          │  │        47          │
│                    │  │                    │  │                    │
│  ⚠️ 3 scaduti      │  │  🟢 8  🔴 4       │  │  🏢 15  👤 32    │
└────────────────────┘  └────────────────────┘  └────────────────────┘
```

**Funzionalità:**

1. **Crediti Aperti**
   - Somma tutti crediti con stato = "Aperto"
   - Alert se ci sono crediti scaduti > 30gg
   - Click → Vai a tab Crediti

2. **Lavaggi Oggi**
   - Count lavaggi con data = oggi
   - Breakdown per priorità (ASPETTA/LASCIA)
   - Click → Vai a tab Lavaggi

3. **Clienti Attivi**
   - Count clienti con attivo = true
   - Breakdown Corporate/Privati
   - Click → Vai a tab Clienti

**Caricamento Dati:**

```javascript
function caricaDashboard() {
  // Parallelo - 3 chiamate simultanee
  google.script.run.withSuccessHandler(aggiornaCrediti).getCrediti('Aperto');
  google.script.run.withSuccessHandler(aggiornaLavaggi).getLavaggi(oggi, 'giorno');
  google.script.run.withSuccessHandler(aggiornaClienti).getClienti();
}
```

**Aggiornamento:** Real-time quando si apre il tab + ogni 5 minuti (auto-refresh)

---

### 👥 3.2 CLIENTI

**Scopo:** Anagrafica completa con listini personalizzati

#### 3.2.1 Tipologie Cliente

**A) CORPORATE (🏢 Aziende)**

Caratteristiche:
- Ragione sociale + P.IVA/COE
- Pagamento differito (addebito fine mese/30gg/60gg)
- Listino PERSONALIZZATO per ogni cliente
- Fatturazione mensile
- Crediti automatici quando completano servizi

Esempio:
```javascript
{
  tipo: "Corporate",
  nome: "Auto Service SM",
  pIva: "SM12345",
  modalitaPagamento: "Addebito_Mese",
  listinoPersonalizzato: {
    "Esterno": 12,    // Sconto 14% (std €14)
    "Completo": 25,   // Sconto 11% (std €28)
    "Furgone": 25     // Sconto 17% (std €30)
  }
}
```

**B) PRIVATO (👤 Persone Fisiche)**

Caratteristiche:
- Nome/Cognome + Targa veicolo
- Pagamento immediato (cash) OPPURE addebito se fidelity
- Listino STANDARD (modificabile al momento)
- Nessuna fatturazione
- Se cash → va in cassa, se addebito → va in crediti

Esempio:
```javascript
{
  tipo: "Privato",
  nome: "Mario Rossi",
  targa: "SM AB123",
  modalitaPagamento: "Cash",
  listinoPersonalizzato: null  // Usa listino standard
}
```

#### 3.2.2 Listino Standard vs Personalizzato

**LISTINO STANDARD** (Base per tutti i privati):

| Tipo Lavaggio | Prezzo | Durata | Modificabile |
|---------------|--------|--------|--------------|
| Esterno | €14 | 30 min | ✅ Solo Admin |
| Completo | €28 | 60 min | ✅ Solo Admin |
| Furgone | €30 | 90 min | ✅ Solo Admin |
| Interno | €18 | 45 min | ✅ Solo Admin |
| Cerchi | €25 | 40 min | ✅ Solo Admin |
| Motore | €40 | 60 min | ✅ Solo Admin |

**LISTINO PERSONALIZZATO** (Solo Corporate):

Ogni cliente corporate può avere prezzi diversi:

```
Auto Service SM:
- Esterno:  €12  (vs std €14) = -14% sconto
- Completo: €25  (vs std €28) = -11% sconto
- Furgone:  €25  (vs std €30) = -17% sconto

Hotel Titan:
- Esterno:  €14  (vs std €14) =   0% sconto
- Furgone:  €35  (vs std €30) = +17% maggiorazione
```

**Calcolo Sconto Automatico:**

```javascript
var sconto = ((prezzoStd - prezzoPersonalizzato) / prezzoStd) * 100;
// Esterno: ((14 - 12) / 14) * 100 = 14%
```

#### 3.2.3 Form Nuovo Cliente

**CORPORATE:**
```
Tipo: 🏢 Corporate

📋 DATI AZIENDA:
- Ragione Sociale *: [____________]
- P.IVA / COE *:     [____________]
- Email:             [____________]
- Telefono:          [____________]

💰 PAGAMENTO:
○ Cash immediato
● Addebito fine mese
○ Addebito 30gg fattura
○ Addebito 60gg fattura
○ Bonifico anticipato

💳 LISTINO PERSONALIZZATO:
┌──────────┬─────────┬─────────┬──────────┬──────┐
│ Tipo     │ Prezzo  │ Standard│ Sconto   │      │
├──────────┼─────────┼─────────┼──────────┼──────┤
│ Esterno  │ €12.00  │ €14.00  │ -14.3%   │ [❌] │
│ Completo │ €25.00  │ €28.00  │ -10.7%   │ [❌] │
│ Furgone  │ €25.00  │ €30.00  │ -16.7%   │ [❌] │
│                                                 │
│ [+ Aggiungi Tipo Lavaggio]                     │
└─────────────────────────────────────────────────┘

📝 NOTE:
[________________________________]

[💾 SALVA CLIENTE]
```

**PRIVATO:**
```
Tipo: 👤 Privato

📋 DATI PERSONALI:
- Nome e Cognome *:  [____________]
- Targa Veicolo:     [SM _______ ]
- Telefono:          [____________]
- Email:             [____________]

💰 PAGAMENTO:
● Cash immediato
○ Addebito fine mese (fidelity)

💳 TARIFFE:
✓ Usa listino standard
  (Modificabile al momento del lavaggio)

📝 NOTE:
[________________________________]

[💾 SALVA CLIENTE]
```

#### 3.2.4 Lista Clienti

**Tabella Responsiva:**

```
┌────────────────────────┬──────────┬─────────────────┬──────────────┬──────────┐
│ Nome/Ragione Sociale   │ Tipo     │ Modalità Pag.   │ Credito Aperto│ Azioni  │
├────────────────────────┼──────────┼─────────────────┼──────────────┼──────────┤
│ 🏢 Auto Service SM     │ Corporate│ Addebito_Mese   │ € 125,00 ⚠️  │ [📝][🗑️] │
│ 🏢 Hotel Titan         │ Corporate│ Addebito_30gg   │ €  35,00     │ [📝][🗑️] │
│ 👤 Mario Rossi         │ Privato  │ Cash            │ €   0,00     │ [📝][🗑️] │
│ 👤 Luca Bianchi        │ Privato  │ Addebito_Mese   │ €  84,00     │ [📝][🗑️] │
└────────────────────────┴──────────┴─────────────────┴──────────────┴──────────┘

🔍 Cerca: [____________]  [🏢 Corporate] [👤 Privati] [Tutti]
```

**Filtri Disponibili:**
- Cerca per nome
- Solo Corporate
- Solo Privati
- Solo con crediti aperti

#### 3.2.5 Statistiche Cliente

Cliccando su un cliente:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  AUTO SERVICE SM
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 STATISTICHE:
┌─────────────────────────┬─────────────┐
│ Lavaggi Totali          │ 45          │
│ Spesa Totale            │ € 1.250,00  │
│ Ticket Medio            │ €    27,78  │
│ Crediti Aperti          │ €   125,00  │
│ Ultima Visita           │ 12/02/2026  │
│ Cliente dal             │ 01/02/2024  │
└─────────────────────────┴─────────────┘

💳 LISTINO PERSONALIZZATO:
┌──────────┬─────────┬─────────┬──────────┐
│ Tipo     │ Prezzo  │ Standard│ Sconto   │
├──────────┼─────────┼─────────┼──────────┤
│ Esterno  │ €12.00  │ €14.00  │ -14.3%   │
│ Completo │ €25.00  │ €28.00  │ -10.7%   │
│ Furgone  │ €25.00  │ €30.00  │ -16.7%   │
└──────────┴─────────┴─────────┴──────────┘

📋 ULTIMI 5 LAVAGGI:
12/02/2026 - Furgone - €25.00
10/02/2026 - Esterno - €12.00
08/02/2026 - Completo - €25.00
05/02/2026 - Furgone - €25.00
03/02/2026 - Esterno - €12.00

[📝 Modifica] [🗑️ Disattiva]
```

---

### 💰 3.3 CASSA

**Scopo:** Chiusura cassa giornaliera professionale con riconciliazione automatica

#### 3.3.1 Informazioni Giornata

```
📅 INFORMAZIONI GIORNATA
┌──────────────────────────────────────────────┐
│ Data:         [16/02/2026]                   │
│ Ora Apertura: [06:00]                        │
│ Ora Chiusura: [22:00]                        │
│ Utente Apertura:  Andrea                     │
│ Utente Chiusura:  Andrea                     │
└──────────────────────────────────────────────┘
```

#### 3.3.2 Venduto Carburante

**6 Tipi con Litri + Euro Separati:**

```
⛽ VENDUTO CARBURANTE
┌────────────────┬──────────────┬──────────────┐
│ Tipo           │ Litri        │ Euro         │
├────────────────┼──────────────┼──────────────┤
│ Benzina 95     │ [_____]      │ [______]     │
│ Benzina 98     │ [_____]      │ [______]     │
│ Diesel         │ [_____]      │ [______]     │
│ Diesel Plus    │ [_____]      │ [______]     │
│ GPL            │ [_____]      │ [______]     │
│ Self Notturno  │ [_____]      │ [______]     │
└────────────────┴──────────────┴──────────────┘

✅ Totale Carburante: € 3.250,00
```

**Esempio Compilato:**
```
Benzina 95:    1.250 L  →  € 2.150,00
Benzina 98:      180 L  →  €   315,00
Diesel:          450 L  →  €   680,00
Diesel Plus:      35 L  →  €    58,00
GPL:              28 L  →  €    22,00
Self Notturno:    15 L  →  €    25,00
────────────────────────────────────
TOTALE:       1.958 L  →  € 3.250,00
```

#### 3.3.3 Venduto Altro

```
🛒 VENDUTO ALTRO
┌────────────────┬──────────────┐
│ Categoria      │ Euro         │
├────────────────┼──────────────┤
│ Bar            │ [______]     │  ☕ Caffè, snack
│ Olio           │ [______]     │  🛢️ Lubrificanti
│ Accessori      │ [______]     │  🔧 Ricambi vari
│ AdBlue         │ [______]     │  💧 AdBlue
│ Lavaggi        │ [______]     │  🚗 Lavaggi auto
│ Buoni          │ [______]     │  🎫 Buoni pasto
└────────────────┴──────────────┘
```

**Esempio:**
```
Bar:          € 180,50
Olio:         €  85,00
Accessori:    €  65,00
AdBlue:       €  28,00
Lavaggi:      € 140,00
Buoni:        €  25,00
────────────────────────
TOTALE:       € 523,50
```

#### 3.3.4 Totale Venduto

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ 💰 TOTALE VENDUTO                 ┃
┃                                   ┃
┃      € 3.773,50                   ┃
┃                                   ┃
┃ Carburante: € 3.250,00            ┃
┃ Altro:      €   523,50            ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
```

#### 3.3.5 Incassato Immediato

**CONTANTI:**
```
💵 CONTANTI
├─ Banconote:  [______]  € 650,00
└─ Monete:     [______]  €  45,50
                         ─────────
   TOTALE CONTANTI:      € 695,50
```

**POS BSI (4 terminali):**
```
💳 POS BSI
├─ Terminale 1: [______]  € 850,00
├─ Terminale 2: [______]  € 420,00
├─ POS 1:       [______]  € 185,00
└─ SMAC:        [______]  €  95,00
                          ─────────
   TOTALE BSI:            € 1.550,00
```

**POS CARISP (2 terminali):**
```
💳 POS CARISP
├─ Terminale 1: [______]  € 680,00
└─ Terminale 2: [______]  € 320,00
                          ─────────
   TOTALE CARISP:         € 1.000,00
```

**ALTRO:**
```
🏦 ALTRO INCASSATO
├─ Self Notturno Contanti: [______]  €  25,00
├─ Assegni:                [______]  €   0,00
└─ Bonifici:               [______]  € 100,00
                                     ─────────
   TOTALE ALTRO:                     € 125,00
```

#### 3.3.6 Totale Incassato

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ 💵 TOTALE INCASSATO               ┃
┃                                   ┃
┃      € 3.370,50                   ┃
┃                                   ┃
┃ Contanti:  €   695,50             ┃
┃ POS BSI:   € 1.550,00             ┃
┃ POS Carisp:€ 1.000,00             ┃
┃ Altro:     €   125,00             ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
```

#### 3.3.7 Crediti Generati

**Crediti da Incassare Successivamente:**

```
⏳ CREDITI GENERATI OGGI
(Non ancora incassati)

┌─────────────────────────┬──────────────┐
│ Tipologia               │ Euro         │
├─────────────────────────┼──────────────┤
│ Pagherò Spese Cassa     │ [______]     │  👥 Clienti fidelity
│ Mobile Payment          │ [______]     │  📱 ENI paga dopo
│ Buoni Cartacei ENI      │ [______]     │  🎫 ENI paga dopo
│ Voucher                 │ [______]     │  🎟️ Vari
│ Bollette/Green Money    │ [______]     │  📄 Pagamenti utility
└─────────────────────────┴──────────────┘

✅ Totale Crediti Generati: € 403,00
```

**Esempio:**
```
Pagherò Spese Cassa:  € 125,00  (Auto Service SM lavaggi)
Mobile Payment:       € 215,00  (Self-service card)
Buoni Cartacei ENI:   €  48,00
Voucher:              €  15,00
Bollette:             €   0,00
────────────────────────────────
TOTALE CREDITI:       € 403,00
```

#### 3.3.8 Riconciliazione Finale

```
⚖️ DIFFERENZA CASSA

┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃                                   ┃
┃      € 0,00  ✅                   ┃
┃                                   ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

Formula: Venduto - Incassato - Crediti

€ 3.773,50  (Venduto)
€ 3.370,50  (Incassato)
€   403,00  (Crediti)
────────────
€     0,00  ✅ PERFETTO!
```

**Colorazione Automatica:**
- ✅ **Verde** se differenza = €0,00
- ⚠️ **Arancione** se differenza ≠ €0,00
- ❌ **Rosso** se differenza > €50,00

**Esempio con Differenza:**
```
⚖️ DIFFERENZA CASSA

┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃                                   ┃
┃      € -12,50  ⚠️                 ┃
┃                                   ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

⚠️ ATTENZIONE: Cassa in MENO di €12,50
Verificare conteggio contanti o POS
```

#### 3.3.9 Note e Salvataggio

```
📝 NOTE GIORNATA
┌─────────────────────────────────────────────┐
│ [________________________________]           │
│ [________________________________]           │
│ [________________________________]           │
└─────────────────────────────────────────────┘

[💾 SALVA CHIUSURA CASSA]
```

**Quando salvi:**
1. ✅ Tutti i dati salvati in foglio "Cassa"
2. ✅ Log creato: "Andrea - Chiusura_Cassa - Venduto €3.773,50"
3. ✅ Dashboard aggiornata automaticamente
4. ✅ Form resettato per giorno successivo

---

### 💳 3.4 CREDITI

**Scopo:** Tracciamento completo crediti con scadenzario

#### 3.4.1 Tipologie Credito

**A) CLIENTI FIDELITY**
- Corporate in addebito mensile
- Privati con accordo di pagamento differito
- Origine: Lavaggi, Cassa (shop/bar)

**B) CREDITI ENI**
- Mobile Payment (self-service card)
- Buoni cartacei ENI nostri
- Da fatturare a ENI Italia

#### 3.4.2 Stati Credito

| Stato | Badge | Descrizione |
|-------|-------|-------------|
| Aperto | 🟡 | Non ancora incassato |
| Incassato | 🟢 | Pagato e chiuso |
| Scaduto | 🔴 | Aperto da > 30gg |
| Annullato | ⚫ | Stornato/cancellato |

#### 3.4.3 Lista Crediti

```
💳 GESTIONE CREDITI

[Apri] [Incassati] [Scaduti] [Tutti]

┌──────────┬────────────────┬─────────┬────────┬────────────┬─────────┐
│ Data     │ Cliente        │ Importo │ Stato  │ Scadenza   │ Azioni  │
├──────────┼────────────────┼─────────┼────────┼────────────┼─────────┤
│ 12/02/26 │ Auto Svc SM    │ € 25,00 │ 🟡 Aperto│ 12/03/26  │ [💰][❌]│
│ 12/02/26 │ Hotel Titan    │ € 35,00 │ 🟡 Aperto│ 11/03/26  │ [💰][❌]│
│ 10/02/26 │ Mobile Payment │ €215,00 │ 🟡 Aperto│ 10/03/26  │ [💰][❌]│
│ 08/02/26 │ Mario Rossi    │ € 84,00 │ 🔴 Scaduto│08/03/26  │ [💰][❌]│
│ 05/02/26 │ Auto Svc SM    │ € 12,00 │ 🟢 Incassato│-       │ [👁️]   │
└──────────┴────────────────┴─────────┴────────┴────────────┴─────────┘

💰 = Incassa    ❌ = Annulla    👁️ = Dettagli
```

#### 3.4.4 Dettaglio Credito

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  CREDITO CRE001
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🆔 ID: CRE001
📅 Data Creazione: 12/02/2026 ore 14:30
👤 Cliente: Auto Service SM (CLI001)
💰 Importo: € 25,00
📝 Causale: Lavaggio Furgone
🔗 Origine: Lavaggi (LAV001)
📊 Stato: 🟡 Aperto
⏰ Scadenza: 12/03/2026 (in 24 giorni)

📋 STORICO:
12/02/2026 14:30 - Creato da Giacomo
                   Origine: Completamento LAV001

[💰 INCASSA CREDITO] [❌ ANNULLA]
```

#### 3.4.5 Incasso Credito

```
💰 INCASSA CREDITO CRE001

Cliente: Auto Service SM
Importo: € 25,00

Modalità Incasso:
○ Contanti
● Bonifico
○ POS
○ Assegno

Data Incasso: [16/02/2026]

Note:
[________________________________]

[✅ CONFERMA INCASSO] [ANNULLA]
```

**Quando confermi:**
1. ✅ Stato credito → "Incassato"
2. ✅ Data incasso salvata
3. ✅ Log: "Andrea - Incassato_Credito - CRE001 - €25"
4. ✅ Dashboard crediti aperti aggiornata

#### 3.4.6 Collegamento Automatico Lavaggi

**FLOW AUTOMATICO:**

```
1. Giacomo completa lavaggio LAV001
   ├─ Cliente: Auto Service SM (Corporate)
   ├─ Modalità: Credito (addebito fine mese)
   └─ Prezzo: €25

2. APPS SCRIPT automaticamente:
   ├─ Crea CRE001
   ├─ Cliente: Auto Service SM
   ├─ Importo: €25
   ├─ Causale: "Lavaggio Furgone"
   ├─ Origine: "Lavaggi"
   └─ Collega: LAV001.idCreditoCollegato = CRE001

3. VISIBILE IN:
   ├─ Tab Crediti → Nuovo credito aperto
   ├─ Tab Clienti → Auto Svc SM credito +€25
   └─ Dashboard → Crediti aperti +€25
```

---

### 🚗 3.5 LAVAGGI

**Scopo:** Gestione prenotazioni con timeline visuale e priorità

#### 3.5.1 Controlli Vista

```
┌─────────────────────────────────────────────┐
│ Vista:    [📆 Giorno] [📅 Settimana]        │
│ Modalità: [📊 Tabella] [🎨 Timeline]        │
│ Data:     [16/02/2026 ▼]                    │
└─────────────────────────────────────────────┘
```

#### 3.5.2 Timeline Visuale

**GIORNO (16/02/2026):**

```
LAVAGGI - TIMELINE OGGI

      08:00  10:00  12:00  14:00  16:00  18:00  20:00
     ┌─────┬─────┬─────┬─────┬─────┬─────┬─────┐
Post1│█████████████████████████████████████████│ 🔴 Auto Service SM
     │ 09:00──────────────────────────16:00   │    Furgone - LASCIA
     │                                         │    €25.00
     ├─────┬─────┬─────┬─────┬─────┬─────┬─────┤
Post2│     │█████│                             │ 🟢 Mario Rossi
     │     │10-11│                             │    Completo - ASPETTA
     │     │     │                             │    €28.00
     ├─────┼─────┼─────┼─────┼─────┼─────┼─────┤
Post2│           │     │█████│                 │ 🔴 Hotel Titan
     │           │     │14-15│                 │    Esterno - LASCIA
     │           │     │     │                 │    €14.00
     └─────┴─────┴─────┴─────┴─────┴─────┴─────┘

LEGENDA:
🟢 Verde  = Cliente ASPETTA (alta priorità)
🔴 Rosso  = Cliente LASCIA (bassa priorità)
```

**Interattivo:**
- Click su barra → Mostra dettagli lavaggio
- Drag barra → Sposta orario (se admin)
- Click "✓" → Completa lavaggio

#### 3.5.3 Tabella Lavaggi

```
📋 LAVAGGI PRENOTATI OGGI (16/02/2026)

┌─────────┬────────────────┬─────────┬────────┬──────────┬────────────┬─────────┐
│ Orario  │ Cliente        │ Tipo    │ Prezzo │ Priorità │ Stato      │ Azioni  │
├─────────┼────────────────┼─────────┼────────┼──────────┼────────────┼─────────┤
│ 9-16    │ 🏢 Auto Svc SM │ Furgone │ €25* │ 🔴 LASCIA│ ○ Prenotato│ [✓][✏️]│
│ 10-11   │ 👤 Mario R.    │ Completo│ €28  │ 🟢 ASPETTA│ ○ Prenotato│ [✓][✏️]│
│ 14-15   │ 🏢 Hotel Titan │ Esterno │ €14* │ 🔴 LASCIA│ ○ Prenotato│ [✓][✏️]│
│ 8:30-9  │ Walk-in        │ Esterno │ €14  │ 🟢 -     │ ● Completato│ [👁️]  │
└─────────┴────────────────┴─────────┴────────┴──────────┴────────────┴─────────┘

* = Tariffa personalizzata

✓ = Completa    ✏️ = Modifica    👁️ = Dettagli
```

#### 3.5.4 Form Nuovo Lavaggio

```
➕ NUOVO LAVAGGIO

Tipo Prenotazione:
● 📅 Prenotato (a calendario)
○ 🚶 Walk-in (fatto e incassato subito)

Cliente *
┌────────────────────────────────┐
│ [Seleziona...         ▼]       │
│                                │
│ 🏢 Auto Service SM             │
│ 🏢 Concessionaria X            │
│ 🏢 Hotel Titan                 │
│ ─────────────────────          │
│ 👤 Mario Rossi                 │
│ 👤 Luca Bianchi                │
└────────────────────────────────┘

ℹ️ Cliente: Auto Service SM
   Tipo: Corporate
   Pagamento: Addebito fine mese
   ⚠️ In addebito → andrà in CREDITI

Tipo Lavaggio *        Prezzo €
┌──────────────┐      ┌──────────┐
│[Furgone  ▼]  │      │[25.00]   │ € (personalizzato)
└──────────────┘      └──────────┘

Standard: €30.00 → Sconto 17%

Orario
Lascia:  [09:00]     Riprende: [16:00]

Priorità
● 🔴 Cliente LASCIA (bassa priorità)
○ 🟢 Cliente ASPETTA (alta priorità)

Note
┌────────────────────────────────┐
│ [__________________________]   │
└────────────────────────────────┘

[💾 SALVA LAVAGGIO]
```

**Validazione:**
- ✅ Cliente selezionato
- ✅ Tipo lavaggio selezionato
- ✅ Orari validi (inizio < fine)
- ✅ Prezzo > 0

#### 3.5.5 Completamento Lavaggio

**Click "✓ Completa" su LAV001:**

```
✅ COMPLETA LAVAGGIO LAV001

Cliente: Auto Service SM
Tipo: Furgone
Prezzo: €25.00
Modalità: Credito

Vuoi completare questo lavaggio?

● Lavaggio eseguito
○ Annulla prenotazione

[✅ CONFERMA] [ANNULLA]
```

**Quando confermi:**

```
1. APPS SCRIPT aggiorna:
   ├─ Stato: "Completato"
   ├─ Utente completamento: "Giacomo"
   ├─ Data/Ora completamento: 16/02/2026 15:45
   └─ Se modalità = Credito:
      ├─ Crea CRE001
      ├─ Importo: €25
      ├─ Causale: "Lavaggio Furgone"
      └─ Collega: idCreditoCollegato = CRE001

2. LOG creato:
   "Giacomo - Completato_Lavaggio - LAV001 - €25 addebito"

3. UI aggiornata:
   ├─ Barra timeline diventa grigia
   ├─ Badge stato: ● Completato
   └─ Azioni disponibili: [👁️ Dettagli]
```

#### 3.5.6 Walk-in (Immediato)

**Form Walk-in:**

```
🚶 WALK-IN (Fatto Subito)

Cliente (opzionale)
┌────────────────────────────────┐
│ [Nessuno - Anonimo      ▼]     │
└────────────────────────────────┘

Tipo Lavaggio *
┌────────────────────────────────┐
│ [Esterno - €14          ▼]     │
└────────────────────────────────┘

ℹ️ Walk-in anonimo → va in CASSA

[✅ FATTO E INCASSATO]
```

**Quando salvi:**
1. ✅ Stato: Immediamente "Completato"
2. ✅ Non appare in timeline (già fatto)
3. ✅ €14 da registrare in chiusura cassa
4. ✅ Log: "Giacomo - Walk-in - €14"

---

### 📦 3.6 MAGAZZINO

**Scopo:** Inventario prodotti con alert giacenza

```
📦 GESTIONE MAGAZZINO

[Bar] [Shop] [Olio] [Accessori] [Tutti]

┌──────────┬────────────┬──────────┬────────┬────────┬─────────┬────────┐
│ Codice   │ Nome       │ Categoria│ Giacenza│ Min   │ Prezzo  │ Azioni │
├──────────┼────────────┼──────────┼────────┼────────┼─────────┼────────┤
│ PROD001  │ Caffè      │ Bar      │ 50     │ 20    │ € 1.00  │ [+][-] │
│ PROD002  │ Coca Cola  │ Bar      │ 15 ⚠️  │ 20    │ € 2.50  │ [+][-] │
│ PROD003  │ Olio 5W30  │ Olio     │ 8      │ 5     │ €15.00  │ [+][-] │
└──────────┴────────────┴──────────┴────────┴────────┴─────────┴────────┘

⚠️ = Sotto giacenza minima
```

---

### 👤 3.7 PERSONALE

**Scopo:** Gestione dipendenti e permessi

```
👥 GESTIONE PERSONALE

┌──────────┬──────────────────┬─────────────┬────────┬────────┐
│ Username │ Nome             │ Ruolo       │ Attivo │ Azioni │
├──────────┼──────────────────┼─────────────┼────────┼────────┤
│ andrea   │ Andrea Cervellini│ Admin       │ ✅     │ [📝]   │
│ giacomo  │ Giacomo          │ Cassiere    │ ✅     │ [📝]   │
│ alessandro│ Alessandro       │ Lavaggi     │ ✅     │ [📝]   │
└──────────┴──────────────────┴─────────────┴────────┴────────┘
```

**Permessi per Ruolo:**

| Funzione | Admin | Cassiere | Lavaggi |
|----------|-------|----------|---------|
| Dashboard | ✅ | ✅ | ✅ |
| Clienti - Visualizza | ✅ | ✅ | ✅ |
| Clienti - Modifica | ✅ | ❌ | ❌ |
| Cassa | ✅ | ✅ | ❌ |
| Crediti | ✅ | ✅ | ❌ |
| Lavaggi - Visualizza | ✅ | ✅ | ✅ |
| Lavaggi - Inserisci | ✅ | ✅ | ✅ |
| Lavaggi - Completa | ✅ | ✅ | ✅ |
| Magazzino | ✅ | ✅ | ❌ |
| Personale | ✅ | ❌ | ❌ |
| Manutenzioni | ✅ | ❌ | ❌ |
| Log | ✅ | ❌ | ❌ |

---

### 🔧 3.8 MANUTENZIONI

**Scopo:** Storico interventi attrezzature

```
🔧 STORICO MANUTENZIONI

┌──────────┬────────────────┬─────────────┬─────────┬──────────────┐
│ Data     │ Attrezzatura   │ Tipo        │ Costo   │ Prossima     │
├──────────┼────────────────┼─────────────┼─────────┼──────────────┤
│ 10/02/26 │ Idropulitrice 1│ Ordinaria   │ € 150   │ 10/08/2026   │
│ 05/01/26 │ Compressore    │ Straordinaria│ € 450  │ 05/07/2026   │
└──────────┴────────────────┴─────────────┴─────────┴──────────────┘
```

---

### 📋 3.9 LOG

**Scopo:** Audit trail completo

```
📋 LOG ATTIVITÀ

[Oggi] [Ultimi 7gg] [Ultimi 30gg] [Tutti]

┌──────────────────┬──────────┬──────────────────┬──────────────────────┐
│ Data/Ora         │ Utente   │ Azione           │ Dettagli             │
├──────────────────┼──────────┼──────────────────┼──────────────────────┤
│ 16/02 15:45      │ Giacomo  │ Completato_Lavaggio│ LAV001 - €25 addebito│
│ 16/02 14:30      │ Giacomo  │ Creato_Lavaggio  │ LAV001 - Auto Svc SM │
│ 16/02 10:00      │ Andrea   │ Chiusura_Cassa   │ Venduto €3.773,50    │
│ 15/02 22:15      │ Andrea   │ Incassato_Credito│ CRE001 - €25         │
└──────────────────┴──────────┴──────────────────┴──────────────────────┘

Azioni monitorate:
- Creato/Modificato/Cancellato Cliente
- Chiusura Cassa
- Creato/Incassato/Annullato Credito
- Creato/Completato/Annullato Lavaggio
- Carico/Scarico Magazzino
- Modifica Personale
- Ogni login
```

---

## 4. STRUTTURA GOOGLE SHEETS

### 📊 10 Fogli Strutturati

#### FOGLIO 1: Dashboard

| Colonna | Nome | Tipo | Descrizione |
|---------|------|------|-------------|
| A | Data | Data | Data riferimento |
| B | Venduto_Totale | Numero | € venduto giorno |
| C | Incassato_Totale | Numero | € incassato giorno |
| D | Crediti_Aperti | Numero | € crediti aperti |
| E | Lavaggi_Giorno | Numero | Count lavaggi |
| F | Utente_Apertura | Testo | Chi ha aperto |
| G | Utente_Chiusura | Testo | Chi ha chiuso |
| H | Note_Giorno | Testo | Note particolari |

#### FOGLIO 2: Clienti

| Colonna | Nome | Tipo | Descrizione |
|---------|------|------|-------------|
| A | ID_Cliente | Testo | CLI001, CLI002, ... |
| B | Tipo | Testo | Corporate / Privato |
| C | Nome_Ragione_Sociale | Testo | Nome completo |
| D | P_IVA_COE | Testo | Codice fiscale |
| E | Email | Testo | Email contatto |
| F | Telefono | Testo | Numero telefono |
| G | Targa | Testo | Targa veicolo (privati) |
| H | Modalita_Pagamento | Testo | Cash / Addebito_Mese / etc |
| I | Listino_Personalizzato | JSON | {"Esterno":12, ...} |
| J | Note | Testo | Note interne |
| K | Data_Creazione | Data/Ora | Quando creato |
| L | Statistiche | JSON | {lavaggi_totali: 45, ...} |
| M | Attivo | Booleano | VERO / FALSO |

**Esempio Riga:**
```
CLI001 | Corporate | Auto Service SM | SM12345 | info@... | +378... | | Addebito_Mese | {"Esterno":12,"Completo":25} | VIP | 01/02/2026 | {...} | VERO
```

#### FOGLIO 3: Cassa

| Colonna | Nome | Tipo |
|---------|------|------|
| A | Data | Data |
| B | Ora_Apertura | Ora |
| C | Ora_Chiusura | Ora |
| D | Utente_Apertura | Testo |
| E | Utente_Chiusura | Testo |
| F | Venduto_Carburante | Numero |
| G | Venduto_Bar | Numero |
| H | Venduto_Shop | Numero |
| I | Venduto_Lavaggi | Numero |
| J | Venduto_Totale | Numero (Formula) |
| K | Incassato_Contanti | Numero |
| L | Incassato_POS_BSI | Numero |
| M | Incassato_POS_Carisp | Numero |
| N | Incassato_Buoni | Numero |
| O | Incassato_Totale | Numero (Formula) |
| P | Crediti_Generati | Numero |
| Q | Differenza | Numero (Formula) |
| R | Note | Testo |

**Formula Colonna Q:**
```
=J2-O2-P2
```
(Venduto - Incassato - Crediti)

#### FOGLIO 4: Crediti

| Colonna | Nome | Tipo |
|---------|------|------|
| A | ID_Credito | Testo |
| B | Data_Creazione | Data |
| C | Ora_Creazione | Ora |
| D | ID_Cliente | Testo |
| E | Nome_Cliente | Testo |
| F | Importo | Numero |
| G | Causale | Testo |
| H | Origine | Testo |
| I | Stato | Testo |
| J | Data_Incasso | Data |
| K | Modalita_Incasso | Testo |
| L | Utente_Creazione | Testo |
| M | Utente_Incasso | Testo |
| N | Note | Testo |

#### FOGLIO 5: Lavaggi

| Colonna | Nome | Tipo |
|---------|------|------|
| A | ID_Lavaggio | Testo |
| B | Data | Data |
| C | Orario_Inizio | Ora |
| D | Orario_Fine | Ora |
| E | ID_Cliente | Testo |
| F | Nome_Cliente | Testo |
| G | Tipo_Lavaggio | Testo |
| H | Prezzo | Numero |
| I | Priorita | Testo |
| J | Stato | Testo |
| K | Walk_In | Booleano |
| L | Note | Testo |
| M | Utente_Inserimento | Testo |
| N | Data_Ora_Inserimento | Data/Ora |
| O | Utente_Completamento | Testo |
| P | Data_Ora_Completamento | Data/Ora |
| Q | Modalita_Pagamento | Testo |
| R | ID_Credito_Collegato | Testo |

#### FOGLIO 6: Listino_Lavaggi

| Colonna | Nome | Tipo |
|---------|------|------|
| A | Tipo_Lavaggio | Testo |
| B | Prezzo_Standard | Numero |
| C | Durata_Minuti | Numero |
| D | Descrizione | Testo |
| E | Attivo | Booleano |

#### FOGLIO 7: Magazzino

| Colonna | Nome | Tipo |
|---------|------|------|
| A | ID_Prodotto | Testo |
| B | Nome_Prodotto | Testo |
| C | Categoria | Testo |
| D | Giacenza | Numero |
| E | Prezzo_Acquisto | Numero |
| F | Prezzo_Vendita | Numero |
| G | Fornitore | Testo |
| H | Ultima_Movimentazione | Data |
| I | Giacenza_Minima | Numero |
| J | Attivo | Booleano |

#### FOGLIO 8: Personale

| Colonna | Nome | Tipo |
|---------|------|------|
| A | ID_Utente | Testo |
| B | Nome_Completo | Testo |
| C | Email | Testo |
| D | Ruolo | Testo |
| E | Permessi | Testo |
| F | PIN | Testo |
| G | Attivo | Booleano |
| H | Data_Assunzione | Data |
| I | Telefono | Testo |

#### FOGLIO 9: Manutenzioni

| Colonna | Nome | Tipo |
|---------|------|------|
| A | ID_Manutenzione | Testo |
| B | Data | Data |
| C | Tipo_Intervento | Testo |
| D | Attrezzatura | Testo |
| E | Descrizione | Testo |
| F | Costo | Numero |
| G | Fornitore | Testo |
| H | Prossima_Scadenza | Data |
| I | Utente_Inserimento | Testo |

#### FOGLIO 10: Log

| Colonna | Nome | Tipo |
|---------|------|------|
| A | ID_Log | Testo |
| B | Data_Ora | Data/Ora |
| C | Utente | Testo |
| D | Azione | Testo |
| E | Modulo | Testo |
| F | Dettagli | Testo |
| G | IP_Address | Testo |

---

## 5. APPS SCRIPT BACKEND

### 📜 Funzioni Principali

#### 5.1 Utility

```javascript
// Ottieni foglio per nome
function getFoglio(nomeFoglio) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var foglio = ss.getSheetByName(nomeFoglio);
  if (!foglio) {
    throw new Error('Foglio "' + nomeFoglio + '" non trovato!');
  }
  return foglio;
}

// Genera ID univoco progressivo
function generaID(prefisso, foglio) {
  var ultimaRiga = foglio.getLastRow();
  if (ultimaRiga <= 1) return prefisso + '001';
  
  var ultimoID = foglio.getRange(ultimaRiga, 1).getValue();
  var numero = parseInt(String(ultimoID).replace(prefisso, '')) + 1;
  return prefisso + String('000' + numero).slice(-3);
}

// Parse JSON sicuro
function parseJSONSafe(str) {
  if (!str || str === '') return null;
  try {
    return JSON.parse(str);
  } catch(e) {
    return null;
  }
}

// Scrivi log attività
function scriviLog(utente, azione, modulo, dettagli) {
  try {
    var foglio = getFoglio('Log');
    var id = generaID('LOG', foglio);
    foglio.appendRow([
      id,
      new Date(),
      utente,
      azione,
      modulo,
      dettagli,
      ''
    ]);
  } catch(e) {
    Logger.log('Errore log: ' + e.message);
  }
}
```

#### 5.2 Clienti

```javascript
function getClienti(filtroTipo) {
  try {
    var foglio = getFoglio('Clienti');
    var dati = foglio.getDataRange().getValues();
    var clienti = [];
    
    for (var i = 1; i < dati.length; i++) {
      if (!dati[i][0]) continue;  // Salta righe vuote
      
      var attivo = dati[i][12];
      if (attivo !== true && attivo !== 'VERO') continue;
      
      if (filtroTipo && dati[i][1] !== filtroTipo) continue;
      
      clienti.push({
        id: dati[i][0],
        tipo: dati[i][1],
        nome: dati[i][2],
        pIva: dati[i][3] || '',
        email: dati[i][4] || '',
        telefono: dati[i][5] || '',
        targa: dati[i][6] || '',
        modalitaPagamento: dati[i][7],
        listinoPersonalizzato: parseJSONSafe(dati[i][8]),
        note: dati[i][9] || '',
        dataCreazione: dati[i][10],
        statistiche: parseJSONSafe(dati[i][11]) || {},
        attivo: attivo
      });
    }
    
    return clienti;
  } catch(e) {
    throw new Error('Errore caricamento clienti: ' + e.message);
  }
}

function salvaCliente(dati) {
  try {
    var foglio = getFoglio('Clienti');
    var id = generaID('CLI', foglio);
    var dataCreazione = new Date();
    
    var listino = '';
    if (dati.tipo === 'Corporate' && dati.listinoPersonalizzato) {
      listino = JSON.stringify(dati.listinoPersonalizzato);
    }
    
    foglio.appendRow([
      id,
      dati.tipo,
      dati.nome,
      dati.pIva || '',
      dati.email || '',
      dati.telefono || '',
      dati.targa || '',
      dati.modalitaPagamento,
      listino,
      dati.note || '',
      dataCreazione,
      JSON.stringify({lavaggi_totali: 0, spesa_totale: 0}),
      'VERO'
    ]);
    
    scriviLog(dati.utenteCorrente, 'Creato_Cliente', 'Clienti', 
              'Cliente ' + id + ' - ' + dati.nome);
    
    return {successo: true, id: id};
  } catch(e) {
    throw new Error('Errore salvataggio cliente: ' + e.message);
  }
}
```

#### 5.3 Lavaggi

```javascript
function salvaLavaggio(dati) {
  try {
    var foglio = getFoglio('Lavaggi');
    var id = generaID('LAV', foglio);
    var dataOra = new Date();
    
    foglio.appendRow([
      id,
      new Date(dati.data),
      dati.orarioInizio,
      dati.orarioFine,
      dati.idCliente || '',
      dati.nomeCliente || 'Walk-in',
      dati.tipoLavaggio,
      dati.prezzo,
      dati.priorita || 'ASPETTA',
      'Prenotato',
      dati.walkIn || false,
      dati.note || '',
      dati.utenteCorrente,
      dataOra,
      '',
      '',
      dati.modalitaPagamento,
      ''
    ]);
    
    scriviLog(dati.utenteCorrente, 'Creato_Lavaggio', 'Lavaggi',
              id + ' - ' + dati.nomeCliente + ' - €' + dati.prezzo);
    
    return {successo: true, id: id};
  } catch(e) {
    throw new Error('Errore salvataggio lavaggio: ' + e.message);
  }
}

function completaLavaggio(idLavaggio, utenteCorrente) {
  try {
    var foglio = getFoglio('Lavaggi');
    var dati = foglio.getDataRange().getValues();
    var rigaTrovata = -1;
    var datiLavaggio = null;
    
    for (var i = 1; i < dati.length; i++) {
      if (dati[i][0] === idLavaggio) {
        rigaTrovata = i + 1;
        datiLavaggio = dati[i];
        break;
      }
    }
    
    if (rigaTrovata === -1) {
      return {errore: 'Lavaggio non trovato'};
    }
    
    var dataOra = new Date();
    
    // Aggiorna stato
    foglio.getRange(rigaTrovata, 10).setValue('Completato');
    foglio.getRange(rigaTrovata, 15).setValue(utenteCorrente);
    foglio.getRange(rigaTrovata, 16).setValue(dataOra);
    
    var modalita = datiLavaggio[16];
    var idCredito = '';
    
    // Se credito, crea automaticamente
    if (modalita === 'Credito') {
      var risultato = creaCredito({
        idCliente: datiLavaggio[4],
        nomeCliente: datiLavaggio[5],
        importo: datiLavaggio[7],
        causale: 'Lavaggio ' + datiLavaggio[6],
        origine: 'Lavaggi',
        utenteCorrente: utenteCorrente
      });
      
      if (risultato.successo) {
        idCredito = risultato.id;
        foglio.getRange(rigaTrovata, 18).setValue(idCredito);
      }
    }
    
    scriviLog(utenteCorrente, 'Completato_Lavaggio', 'Lavaggi',
              idLavaggio + ' - €' + datiLavaggio[7] + 
              (modalita === 'Credito' ? ' addebito' : ' cash'));
    
    return {successo: true, idCreditoCreato: idCredito};
  } catch(e) {
    throw new Error('Errore completamento: ' + e.message);
  }
}
```

#### 5.4 Crediti

```javascript
function creaCredito(dati) {
  try {
    var foglio = getFoglio('Crediti');
    var id = generaID('CRE', foglio);
    var dataOra = new Date();
    
    foglio.appendRow([
      id,
      dataOra,
      Utilities.formatDate(dataOra, Session.getScriptTimeZone(), 'HH:mm'),
      dati.idCliente,
      dati.nomeCliente,
      dati.importo,
      dati.causale,
      dati.origine,
      'Aperto',
      '',
      '',
      dati.utenteCorrente,
      '',
      dati.note || ''
    ]);
    
    scriviLog(dati.utenteCorrente, 'Creato_Credito', 'Crediti',
              id + ' - ' + dati.nomeCliente + ' - €' + dati.importo);
    
    return {successo: true, id: id};
  } catch(e) {
    throw new Error('Errore creazione credito: ' + e.message);
  }
}
```

#### 5.5 Cassa

```javascript
function salvaCassa(dati) {
  try {
    var foglio = getFoglio('Cassa');
    
    var vendutoTotale = dati.vendutoCarburante + dati.vendutoBar + 
                        dati.vendutoShop + dati.vendutoLavaggi;
    var incassatoTotale = dati.incassatoContanti + dati.incassatoPOSBSI + 
                          dati.incassatoPOSCarisp + dati.incassatoBuoni;
    var differenza = vendutoTotale - incassatoTotale - dati.creditiGenerati;
    
    foglio.appendRow([
      new Date(dati.data),
      dati.oraApertura,
      dati.oraChiusura,
      dati.utenteApertura,
      dati.utenteChiusura,
      dati.vendutoCarburante,
      dati.vendutoBar,
      dati.vendutoShop,
      dati.vendutoLavaggi,
      vendutoTotale,
      dati.incassatoContanti,
      dati.incassatoPOSBSI,
      dati.incassatoPOSCarisp,
      dati.incassatoBuoni,
      incassatoTotale,
      dati.creditiGenerati,
      differenza,
      dati.note || ''
    ]);
    
    scriviLog(dati.utenteChiusura, 'Chiusura_Cassa', 'Cassa',
              'Venduto: €' + vendutoTotale + ' - Incassato: €' + incassatoTotale);
    
    return {
      successo: true,
      vendutoTotale: vendutoTotale,
      incassatoTotale: incassatoTotale,
      differenza: differenza
    };
  } catch(e) {
    throw new Error('Errore salvataggio cassa: ' + e.message);
  }
}
```

#### 5.6 Web App

```javascript
function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Gestionale Stazione ENI')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
```

---

## 6. INTERFACCIA HTML

### 📱 Responsive Design

```css
/* Desktop */
@media (min-width: 769px) {
  .form-row { display: flex; gap: 15px; }
  .table-wrapper { overflow-x: auto; }
}

/* Tablet */
@media (max-width: 768px) {
  .form-row { flex-direction: column; }
  .nav-tabs button { min-width: 100px; }
}

/* Mobile */
@media (max-width: 480px) {
  .header h1 { font-size: 16px; }
  .nav-tabs button { min-width: 80px; font-size: 12px; }
  .btn { width: 100%; }
}
```

### ⚡ Performance

**Ottimizzazioni:**
- Lazy loading dati (carica solo tab attivo)
- Debounce su ricerche (300ms)
- Cache risultati per 5 minuti
- Caricamento progressivo tabelle (20 righe/volta)

---

## 7. SISTEMA PERMESSI

### 👥 3 Ruoli

| Funzione | Admin | Cassiere | Lavaggi |
|----------|-------|----------|---------|
| Dashboard | ✅ | ✅ | ✅ |
| Clienti (view) | ✅ | ✅ | ✅ |
| Clienti (edit) | ✅ | ❌ | ❌ |
| Cassa | ✅ | ✅ | ❌ |
| Crediti | ✅ | ✅ | ❌ |
| Lavaggi | ✅ | ✅ | ✅ |
| Magazzino | ✅ | ✅ | ❌ |
| Personale | ✅ | ❌ | ❌ |
| Log | ✅ | ❌ | ❌ |

---

## 8. FLUSSI OPERATIVI

### 8.1 Giornata Tipo

```
06:00 - APERTURA
└─ Giacomo apre stazione
└─ Sistema: Log apertura

09:00 - PRENOTAZIONE LAVAGGIO
└─ Giacomo: LAV001 - Auto Service SM - €25 - LASCIA
└─ Sistema: Salva in foglio Lavaggi

10:00 - WALK-IN
└─ Giacomo: Walk-in anonimo - Esterno €14
└─ Sistema: Salva completato + Log

12:00 - VENDITA BAR
└─ Cliente compra caffè €1
└─ Giacomo: Memorizza per chiusura cassa

16:00 - COMPLETAMENTO LAVAGGIO
└─ Giacomo: Completa LAV001
└─ Sistema: Crea CRE001 (€25 credito) + Log

22:00 - CHIUSURA CASSA
└─ Andrea: Inserisce venduto/incassato
└─ Sistema: Salva in foglio Cassa + Log
└─ Sistema: Aggiorna Dashboard
```

### 8.2 Fine Mese

```
01/03 - FATTURAZIONE CLIENTI CORPORATE
└─ Andrea: Esporta crediti aperti per cliente
└─ Andrea: Crea fatture manuali
└─ Andrea: Quando pagano → Incassa crediti
└─ Sistema: Stato crediti → "Incassato"
```

---

## 9. RESPONSIVE MOBILE

### 📱 Ottimizzazioni Mobile

**Touch-Friendly:**
- Bottoni min-height: 44px
- Campi input font-size: 16px (evita zoom iOS)
- Click target min 48x48px

**Layout Adattivo:**
- Form stack verticalmente < 768px
- Tabelle scroll lateralmente
- Timeline diventa verticale
- Tab scroll orizzontalmente

**Performance Mobile:**
- Lazy load immagini
- Riduce chiamate API
- Cache locale dati
- Service Worker (offline-first)

---

## 10. INSTALLAZIONE E DEPLOY

### 📝 Guida Rapida

**STEP 1: Google Sheets**
1. Crea nuovo Google Sheet
2. Crea 10 fogli con nomi esatti
3. Copia header da documentazione
4. Inserisci dati esempio

**STEP 2: Apps Script**
1. Estensioni → Apps Script
2. Incolla codice backend
3. Salva
4. Autorizza

**STEP 3: HTML**
1. Apps Script → + → HTML
2. Nome: `index`
3. Incolla codice frontend
4. Salva

**STEP 4: Deploy**
1. Deploy → Nuova distribuzione
2. Tipo: Web app
3. Esegui come: Me
4. Chi ha accesso: Solo io
5. Deploy
6. Copia URL

**STEP 5: Test**
1. Apri URL
2. Verifica caricamento dati
3. Test inserimento lavaggio
4. Verifica salvataggio in Google Sheet

---

## 📞 SUPPORTO

**Documentazione Completa:** Questo file  
**Google Sheets:** `Gestionale ENI - Borgo Maggiore`  
**Web App URL:** (fornito al deploy)  

---

**Fine Documentazione**  
**Versione:** 4.0  
**Ultima modifica:** 16/02/2026  
**Autore:** Claude + Andrea Cervellini
