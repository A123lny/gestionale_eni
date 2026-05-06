# Specifica Tecnica Completa: Calcolo Coefficiente Monofase Gasolio
## Per Gestionale Stazione di Servizio ENI

---

## 1. SCOPO DEL DOCUMENTO

Questo documento descrive in modo esauriente la struttura, la logica di calcolo e le regole di business per il **calcolo della monofase media sul carburante (gasolio)** utilizzato nelle stazioni di servizio ENI. Il coefficiente monofase viene calcolato mensilmente e applicato ai clienti per la fatturazione.

---

## 2. CONCETTO DI BUSINESS

### Cos'è la Monofase
L'imposta monofase è un'imposta sui carburanti che viene applicata una sola volta nella catena di distribuzione. Per le stazioni di servizio ENI, è necessario calcolare mensilmente il **coefficiente monofase medio** basato sugli acquisti di gasolio del mese.

### Come si usa il Coefficiente
Il coefficiente calcolato (es: 0.2636) viene moltiplicato per i litri di gasolio venduti a ciascun cliente per determinare l'importo monofase da inserire in fattura.

**Esempio pratico:**
- Coefficiente monofase del mese: 0.20
- Litri venduti al cliente: 1.000
- Importo monofase in fattura: 1.000 × 0.20 = € 200,00

---

## 3. STRUTTURA DATI - FOGLIO MENSILE

Ogni mese ha il proprio foglio/record. La struttura è identica per tutti i mesi.

### 3.1 Intestazione
- **Titolo**: "CALCOLO DELLA MONOFASE MEDIA SUL CARBURANTE"
- **Carburante**: "gasolio"
- **Mese di riferimento**: es. "Luglio 2025", "Agosto 2025", ecc.

### 3.2 Tabella Acquisti (fino a 25 righe di dati, righe 7-31)

Ogni riga della tabella rappresenta una **fattura di acquisto gasolio** ricevuta nel mese. Ci possono essere da 1 a 25 fatture per mese.

| # | Campo | Descrizione | Tipo | Input/Calcolato |
|---|-------|-------------|------|-----------------|
| A | N. progressivo | Numero riga 1-25 | Intero | Auto |
| B | Data fattura acquisto | Data della fattura del fornitore | Data (dd/mm/yyyy) | **INPUT MANUALE** |
| C | Totale imponibile fattura (a) | Importo imponibile della fattura di acquisto | Valuta EUR (2 decimali) | **INPUT MANUALE** |
| D | Litri commerciali acquistati (b) | Quantità litri commerciali nella fattura | Intero | **INPUT MANUALE** |
| E | Monofase imp. ft. 21% (c) | IVA 21% sull'imponibile fattura | Valuta EUR (2 decimali) | **CALCOLATO**: `= C × 21%` |
| F | Litri fiscali (d) | Quantità litri fiscali (dalla fattura) | Intero | **INPUT MANUALE** |
| G | Accisa (e) | Valore accisa per litro | Valuta EUR (5 decimali) | **INPUT MANUALE** (attualmente fisso: 0.5932 €/lt) |
| H | Tot. monofase su accisa 21% (f) | IVA 21% calcolata su litri fiscali × accisa | Valuta EUR (2 decimali) | **CALCOLATO**: `= (F × G) × 21%` |
| I | Tot. monofase (g) | Somma totale monofase per riga | Valuta EUR (2 decimali) | **CALCOLATO**: `= E + H` |
| J | Monofase media su lt. comm.le (h) | Coefficiente monofase per la singola fattura | Numero (4 decimali, TRONCATO) | **CALCOLATO**: `= TRUNC(I / D, 4)` |

### 3.3 Riga Totali (riga 32)

| Campo | Formula |
|-------|---------|
| C32 - Totale imponibili | `= SUM(C7:C31)` |
| D32 - Totale litri commerciali | `= SUM(D7:D31)` |
| E32 - Totale monofase IVA imp. | `= SUM(E7:E31)` |
| H32 - Totale monofase su accisa | `= SUM(H7:H31)` |
| I32 - Totale monofase complessivo | `= SUM(I7:I31)` |

### 3.4 Risultato Finale - COEFFICIENTE MONOFASE MEDIA DEL MESE (riga 33)

**Questa è la cella più importante del foglio.**

| Campo | Formula | Descrizione |
|-------|---------|-------------|
| J33 | `= TRUNC(I32 / D32, 4)` | **MONOFASE MEDIA SU LT. COMMERCIALE DEL MESE** |

**Etichetta**: In D33 viene mostrata la descrizione: "MONOFASE MEDIA SU LT.COMMERCIALE DEL MESE (totale g / totale b)"

---

## 4. FORMULE DETTAGLIATE

### 4.1 Per ogni riga i (da 7 a 31):

E[i] = C[i] * 0.21                    -- Monofase IVA sull'imponibile (21%)
H[i] = (F[i] * G[i]) * 0.21           -- Monofase IVA sull'accisa (litri fiscali × accisa × 21%)
I[i] = E[i] + H[i]                     -- Totale monofase per la fattura
J[i] = TRUNC(I[i] / D[i], 4)          -- Monofase media per litro commerciale (troncato a 4 decimali)

### 4.2 Totali (riga 32):

C32 = SUM(C7:C31)                      -- Somma imponibili
D32 = SUM(D7:D31)                      -- Somma litri commerciali
E32 = SUM(E7:E31)                      -- Somma monofase IVA imponibile
H32 = SUM(H7:H31)                      -- Somma monofase IVA accisa
I32 = SUM(I7:I31)                      -- Somma totale monofase

### 4.3 Risultato finale (riga 33):

J33 = TRUNC(I32 / D32, 4)              -- COEFFICIENTE MONOFASE MEDIA DEL MESE

**ATTENZIONE AL TRONCAMENTO**: Si usa TRUNC (troncamento), NON ROUND (arrotondamento).
Esempio: 0.187456 → 0.1874 (NON 0.1875)

---

## 5. CAMPI DI INPUT (da compilare manualmente per ogni fattura)

Per ogni fattura di acquisto ricevuta nel mese, l'utente inserisce:

1. **Data fattura** (B) - Data del documento di acquisto
2. **Totale imponibile** (C) - Importo imponibile in EUR della fattura
3. **Litri commerciali** (D) - Quantità litri commerciali acquistati
4. **Litri fiscali** (F) - Quantità litri fiscali (dal documento di trasporto/fattura)
5. **Accisa** (G) - Valore accisa €/litro (attualmente 0.5932, precompilato ma modificabile)

Tutti gli altri campi sono calcolati automaticamente.

---

## 6. PARAMETRI E COSTANTI

| Parametro | Valore attuale | Note |
|-----------|---------------|------|
| Aliquota IVA | 21% | Applicata sia sull'imponibile che sull'accisa |
| Accisa gasolio | € 0.5932/litro | Valore fisso nazionale, cambia raramente. Precompilato in colonna G per tutte le 25 righe |
| Decimali troncamento | 4 | Per monofase media (colonna J e cella J33) |
| Max fatture per mese | 25 | Righe 7-31 |

---

## 7. REGOLE DI VALIDAZIONE

1. **Litri commerciali (D)** devono essere > 0 se la riga è compilata (altrimenti divisione per zero in J)
2. **Litri fiscali (F)** possono essere 0 se non applicabile (in tal caso H sarà 0)
3. **Date (B)** devono essere nel mese di riferimento
4. **Accisa (G)** precompilata a 0.5932 per tutte le 25 righe; se cambia, va aggiornata
5. **Se una riga non è compilata**, le formule restituiscono 0 per E, H, I e #DIV/0! per J (che è corretto e va ignorato)

---

## 8. NOTA SUL FOGLIO1 (Template/Bozza)

Il file Excel originale contiene un "Foglio1" che è una versione di lavoro/bozza:
- Ha gli stessi campi e formule dei fogli mensili
- **NON ha litri fiscali (colonna F vuota)** → la colonna H risulta tutta 0
- **NON ha il mese specificato** in H3
- Serve come template base per creare i nuovi mesi

**Differenza chiave col Foglio1**: Nei fogli mensili (Luglio, Agosto, ecc.) la colonna F (litri fiscali) è compilata, quindi i calcoli H e I includono la componente accisa. Nel Foglio1 mancano i litri fiscali, quindi il totale monofase (I) = solo la componente IVA sull'imponibile (E).

---

## 9. DATI REALI DI ESEMPIO

### Luglio 2025 - 6 fatture

| Data | Imponibile (€) | Lt. Comm. | Lt. Fiscali | Accisa | Coeff. per fattura |
|------|----------------|-----------|-------------|--------|-------------------|
| 01/07/2025 | 7.071,90 | 10.000 | 9.844 | 0,5932 | 0,2711 |
| 06/07/2025 | 5.313,25 | 8.000 | 7.878 | 0,5932 | 0,2621 |
| 08/07/2025 | 9.962,36 | 15.000 | 14.788 | 0,5932 | 0,2622 |
| 14/07/2025 | 6.641,57 | 10.000 | 9.881 | 0,5932 | 0,2625 |
| 20/07/2025 | 9.298,20 | 14.000 | 13.803 | 0,5932 | 0,2622 |
| 29/07/2025 | 7.969,90 | 12.000 | 11.847 | 0,5932 | 0,2624 |

**Totali**: Imponibile € 46.257,18 | Lt. Comm. 69.000 | Monofase tot. € 18.190,01
**➡️ COEFFICIENTE LUGLIO 2025: 0,2636**

### Agosto 2025 - 5 fatture

| Data | Imponibile (€) | Lt. Comm. | Lt. Fiscali | Accisa | Coeff. per fattura |
|------|----------------|-----------|-------------|--------|-------------------|
| 07/08/2025 | 6.477,65 | 10.000 | 9.903 | 0,5932 | 0,2593 |
| 13/08/2025 | 7.674,82 | 12.000 | 11.838 | 0,5932 | 0,2571 |
| 20/08/2025 | 4.419,59 | 7.000 | 6.900 | 0,5932 | 0,2553 |
| 21/09/2025* | 2.525,48 | 4.000 | 3.952 | 0,5932 | 0,2556 |
| 29/08/2025 | 3.837,41 | 6.000 | 5.941 | 0,5932 | 0,2576 |

**Totali**: Imponibile € 24.934,95 | Lt. Comm. 39.000 | Monofase tot. € 10.036,60
**➡️ COEFFICIENTE AGOSTO 2025: 0,2573**

### Settembre 2025 - 6 fatture

| Data | Imponibile (€) | Lt. Comm. | Lt. Fiscali | Accisa | Coeff. |
|------|----------------|-----------|-------------|--------|--------|
| 01/09/2025 | 8.314,38 | 13.000 | 12.821 | 0,5932 | 0,2571 |
| 07/09/2025 | 7.773,18 | 12.000 | 11.862 | 0,5932 | 0,2591 |
| 21/09/2025 | 5.829,88 | 9.000 | 8.916 | 0,5932 | 0,2594 |
| 22/09/2025 | 9.183,45 | 14.000 | 13.862 | 0,5932 | 0,2610 |
| 28/09/2025 | 2.591,05 | 4.000 | 3.955 | 0,5932 | 0,2592 |
| 28/09/2025 | 5.903,66 | 9.000 | 8.918 | 0,5932 | 0,2611 |

**Totali**: Imponibile € 39.595,60 | Lt. Comm. 61.000 | Monofase tot. € 15.831,00
**➡️ COEFFICIENTE SETTEMBRE 2025: 0,2595**

### Ottobre 2025 - 1 fattura (mese in corso)

| Data | Imponibile (€) | Lt. Comm. | Lt. Fiscali | Accisa | Coeff. |
|------|----------------|-----------|-------------|--------|--------|
| 06/10/2025 | 7.773,18 | 12.000 | 9.958 | 0,5932 | 0,2394 |

**➡️ COEFFICIENTE OTTOBRE 2025 (parziale): 0,2394**

---

## 10. STRUTTURA DATABASE SUGGERITA

### Tabella: `fatture_acquisto_gasolio`

CREATE TABLE fatture_acquisto_gasolio (
    id                      SERIAL PRIMARY KEY,
    mese_riferimento        DATE NOT NULL,           -- Primo giorno del mese (es: 2025-07-01)
    numero_progressivo      INTEGER NOT NULL,         -- 1-25
    data_fattura            DATE NOT NULL,            -- Data della fattura di acquisto
    imponibile_fattura      DECIMAL(12,2) NOT NULL,   -- Totale imponibile (colonna C)
    litri_commerciali       INTEGER NOT NULL,          -- Litri commerciali acquistati (colonna D)
    litri_fiscali           INTEGER DEFAULT 0,         -- Litri fiscali (colonna F)
    accisa_per_litro        DECIMAL(6,5) NOT NULL DEFAULT 0.59320,  -- Accisa €/lt (colonna G)
    
    -- Campi calcolati (possono essere colonne virtuali/computed o calcolati lato app)
    monofase_iva_imponibile DECIMAL(12,4),  -- = imponibile_fattura * 0.21
    monofase_iva_accisa     DECIMAL(12,6),  -- = (litri_fiscali * accisa_per_litro) * 0.21
    totale_monofase         DECIMAL(12,6),  -- = monofase_iva_imponibile + monofase_iva_accisa
    monofase_media_per_lt   DECIMAL(8,4),   -- = TRUNC(totale_monofase / litri_commerciali, 4)
    
    UNIQUE(mese_riferimento, numero_progressivo),
    CHECK(numero_progressivo BETWEEN 1 AND 25),
    CHECK(litri_commerciali > 0)
);

### Tabella: `coefficiente_monofase_mensile`

CREATE TABLE coefficiente_monofase_mensile (
    id                          SERIAL PRIMARY KEY,
    mese_riferimento            DATE NOT NULL UNIQUE,     -- Primo giorno del mese
    anno                        INTEGER NOT NULL,
    mese                        INTEGER NOT NULL,          -- 1-12
    nome_mese                   VARCHAR(20) NOT NULL,      -- "Gennaio", "Febbraio", ecc.
    totale_imponibile           DECIMAL(12,2),             -- SUM imponibili del mese
    totale_litri_commerciali    INTEGER,                   -- SUM litri commerciali del mese
    totale_monofase_iva_imp     DECIMAL(12,4),             -- SUM monofase IVA imponibile
    totale_monofase_iva_accisa  DECIMAL(12,6),             -- SUM monofase IVA accisa
    totale_monofase             DECIMAL(12,6),             -- SUM totale monofase
    coefficiente_monofase       DECIMAL(8,4),              -- TRUNC(totale_monofase / totale_litri_commerciali, 4)
    numero_fatture              INTEGER DEFAULT 0,
    stato                       VARCHAR(20) DEFAULT 'aperto',  -- 'aperto', 'chiuso'
    data_chiusura               TIMESTAMP,
    
    CHECK(mese BETWEEN 1 AND 12)
);

### Tabella: `fatturazione_clienti` (per applicare il coefficiente)

CREATE TABLE fatturazione_clienti (
    id                      SERIAL PRIMARY KEY,
    cliente_id              INTEGER NOT NULL,
    mese_riferimento        DATE NOT NULL,
    data_fattura_vendita    DATE NOT NULL,
    litri_venduti           DECIMAL(10,2) NOT NULL,
    coefficiente_usato      DECIMAL(8,4) NOT NULL,       -- Il coefficiente del mese
    importo_monofase        DECIMAL(12,2) NOT NULL,       -- = litri_venduti * coefficiente_usato
    
    FOREIGN KEY (mese_riferimento) REFERENCES coefficiente_monofase_mensile(mese_riferimento)
);

---

## 11. LOGICA DI CALCOLO - PSEUDOCODICE

```python
def calcola_monofase_fattura(imponibile, litri_commerciali, litri_fiscali, accisa=0.5932, aliquota_iva=0.21):
    """Calcola la monofase per una singola fattura di acquisto."""
    
    # Monofase IVA sull'imponibile della fattura
    monofase_iva_imponibile = imponibile * aliquota_iva
    
    # Monofase IVA sull'accisa (litri fiscali × accisa × IVA)
    monofase_iva_accisa = (litri_fiscali * accisa) * aliquota_iva
    
    # Totale monofase per questa fattura
    totale_monofase = monofase_iva_imponibile + monofase_iva_accisa
    
    # Monofase media per litro commerciale (TRONCATA a 4 decimali)
    import math
    monofase_media = math.trunc(totale_monofase / litri_commerciali * 10000) / 10000
    
    return {
        'monofase_iva_imponibile': monofase_iva_imponibile,
        'monofase_iva_accisa': monofase_iva_accisa,
        'totale_monofase': totale_monofase,
        'monofase_media_per_litro': monofase_media
    }


def calcola_coefficiente_mensile(fatture_del_mese):
    """
    Calcola il coefficiente monofase medio del mese.
    fatture_del_mese: lista di dict con i risultati di calcola_monofase_fattura()
    più i dati originali (litri_commerciali)
    """
    
    totale_monofase = sum(f['totale_monofase'] for f in fatture_del_mese)
    totale_litri_commerciali = sum(f['litri_commerciali'] for f in fatture_del_mese)
    
    if totale_litri_commerciali == 0:
        raise ValueError("Totale litri commerciali non può essere zero")
    
    # COEFFICIENTE FINALE - TRONCATO a 4 decimali
    import math
    coefficiente = math.trunc(totale_monofase / totale_litri_commerciali * 10000) / 10000
    
    return coefficiente


def calcola_importo_fattura_cliente(litri_venduti, coefficiente_mensile):
    """
    Calcola l'importo monofase da inserire nella fattura del cliente.
    """
    return round(litri_venduti * coefficiente_mensile, 2)


# ============================================================
# ESEMPIO DI UTILIZZO - Luglio 2025
# ============================================================

fatture_luglio = [
    {'data': '2025-07-01', 'imponibile': 7071.90, 'litri_commerciali': 10000, 'litri_fiscali': 9844, 'accisa': 0.5932},
    {'data': '2025-07-06', 'imponibile': 5313.25, 'litri_commerciali': 8000,  'litri_fiscali': 7878, 'accisa': 0.5932},
    {'data': '2025-07-08', 'imponibile': 9962.36, 'litri_commerciali': 15000, 'litri_fiscali': 14788, 'accisa': 0.5932},
    {'data': '2025-07-14', 'imponibile': 6641.57, 'litri_commerciali': 10000, 'litri_fiscali': 9881, 'accisa': 0.5932},
    {'data': '2025-07-20', 'imponibile': 9298.20, 'litri_commerciali': 14000, 'litri_fiscali': 13803, 'accisa': 0.5932},
    {'data': '2025-07-29', 'imponibile': 7969.90, 'litri_commerciali': 12000, 'litri_fiscali': 11847, 'accisa': 0.5932},
]

# Calcola per ogni fattura
risultati = []
for f in fatture_luglio:
    r = calcola_monofase_fattura(f['imponibile'], f['litri_commerciali'], f['litri_fiscali'], f['accisa'])
    r['litri_commerciali'] = f['litri_commerciali']
    risultati.append(r)

# Calcola coefficiente mensile
coeff_luglio = calcola_coefficiente_mensile(risultati)
print(f"Coefficiente Luglio 2025: {coeff_luglio}")  # Output: 0.2636

# Applica al cliente
litri_cliente = 1000
importo = calcola_importo_fattura_cliente(litri_cliente, coeff_luglio)
print(f"Importo monofase per {litri_cliente} litri: € {importo}")  # Output: € 263.60
12. API / INTERFACCIA GESTIONALE SUGGERITA
Endpoints / Funzioni necessarie
1. POST /mese/{anno}/{mese}/fattura - Aggiunge una fattura di acquisto al mese - Input: data, imponibile, litri_commerciali, litri_fiscali, accisa - Calcola automaticamente E, H, I, J - Ricalcola il coefficiente mensile 2. GET /mese/{anno}/{mese} - Restituisce tutte le fatture del mese con i calcoli - Include il coefficiente monofase mensile corrente 3. PUT /mese/{anno}/{mese}/fattura/{id} - Modifica una fattura esistente - Ricalcola automaticamente tutti i derivati 4. DELETE /mese/{anno}/{mese}/fattura/{id} - Elimina una fattura - Ricalcola il coefficiente mensile 5. POST /mese/{anno}/{mese}/chiudi - Chiude il mese (il coefficiente diventa definitivo) - Impedisce ulteriori modifiche 6. GET /mese/{anno}/{mese}/coefficiente - Restituisce solo il coefficiente monofase del mese 7. POST /cliente/{id}/fattura-monofase - Input: litri_venduti, mese_riferimento - Calcola: litri_venduti × coefficiente_del_mese - Restituisce l'importo da inserire in fattura 8. GET /report/riepilogo-annuale/{anno} - Riepilogo coefficienti di tutti i mesi dell'anno
13. INTERFACCIA UTENTE SUGGERITA
Schermata Principale: "Calcolo Monofase Mensile"
┌─────────────────────────────────────────────────────────────────────────────┐ │ CALCOLO DELLA MONOFASE MEDIA SUL CARBURANTE │ │ │ │ CARBURANTE: Gasolio MESE DI: [Dropdown: Luglio 2025 ▼] │ │ │ ├───┬────────────┬──────────────┬───────────┬──────────┬──────────┬──────────┤ │ # │ Data Ft. │ Imponibile │ Lt.Comm. │ Lt.Fisc. │ Accisa │ Coeff. │ │ │ Acquisto │ Fattura (€) │ Acquist. │ │ (€/lt) │ per Ft. │ ├───┼────────────┼──────────────┼───────────┼──────────┼──────────┼──────────┤ │ 1 │ 01/07/2025 │ 7.071,90 │ 10.000 │ 9.844 │ 0,59320 │ 0,2711 │ │ 2 │ 06/07/2025 │ 5.313,25 │ 8.000 │ 7.878 │ 0,59320 │ 0,2621 │ │ 3 │ 08/07/2025 │ 9.962,36 │ 15.000 │ 14.788 │ 0,59320 │ 0,2622 │ │ ...│ │ │ │ │ │ │ ├───┴────────────┼──────────────┼───────────┼──────────┤ │ │ │ TOTALI │ 46.257,18 │ 69.000 │ │ │ │ ├────────────────┴──────────────┴───────────┴──────────┴──────────┴──────────┤ │ │ │ ╔═══════════════════════════════════════════════════════════════╗ │ │ ║ COEFFICIENTE MONOFASE MEDIA DEL MESE: 0,2636 ║ │ │ ╚═══════════════════════════════════════════════════════════════╝ │ │ │ │ [+ Aggiungi Fattura] [Chiudi Mese] [Stampa] [Esporta Excel] │ └─────────────────────────────────────────────────────────────────────────────┘
Schermata: "Calcolo per Cliente"
┌─────────────────────────────────────────────────────────────────────┐ │ CALCOLO MONOFASE PER FATTURA CLIENTE │ │ │ │ Mese: [Settembre 2025 ▼] Coefficiente: 0,2595 │ │ │ │ Cliente: [Seleziona cliente ▼] │ │ Litri venduti: [________] lt │ │ │ │ ┌─────────────────────────────────────────────┐ │ │ │ IMPORTO MONOFASE DA FATTURARE: € 259,50 │ │ │ │ (1.000 lt × 0,2595 = € 259,50) │ │ │ └─────────────────────────────────────────────┘ │ │ │ │ [Inserisci in Fattura] │ └─────────────────────────────────────────────────────────────────────┘
14. REGOLE DI BUSINESS IMPORTANTI
TRONCAMENTO, non arrotondamento: La monofase media usa TRUNC a 4 decimali, MAI ROUND
L'accisa (0.5932) è un valore nazionale che cambia raramente. Va precompilata ma deve essere modificabile
L'aliquota IVA è 21% (potrebbe cambiare in futuro, deve essere un parametro configurabile)
Il coefficiente si calcola sempre sul totale mensile, non come media dei coefficienti per fattura
Litri fiscali ≠ Litri commerciali: I litri fiscali sono generalmente leggermente inferiori ai commerciali
Un mese chiuso non può essere modificato (protezione dati)
Se un mese non ha fatture, il coefficiente non è calcolabile (divisione per zero)
15. FORMATTAZIONE E COLORI (per eventuale export Excel/PDF)
Colori delle sezioni:
Sezione	Colore sfondo	Hex
Date, Imponibile, Lt. Comm., Monofase IVA imp. (B,C,D,E)	Verde chiaro	#CCFFCC
Lt. Fiscali, Accisa, Monofase su accisa (F,G,H)	Giallo chiaro	#FFFF99
Totale monofase, Monofase media per lt. (I,J)	Azzurro chiaro	#CCFFFF
Riga risultato coefficiente (riga 33)	Ciano	#00FFFF
Formati numerici:
Valuta: € #.##0,00 (formato italiano)
Litri: #.##0 (intero con separatore migliaia)
Accisa: € #.##0,00000 (5 decimali)
Coefficiente: #.##0,0000 (4 decimali)
Date: GG/MM/AAAA
16. VERIFICA DEI CALCOLI (test cases)
Test Case 1: Luglio 2025, Fattura 1
Input: Imponibile = 7.071,90 € Lt. Commerciali = 10.000 Lt. Fiscali = 9.844 Accisa = 0,5932 €/lt Calcolo: E = 7.071,90 × 0,21 = 1.485,099 € H = (9.844 × 0,5932) × 0,21 = 5.839,4608 × 0,21 = 1.226,286768 € I = 1.485,099 + 1.226,286768 = 2.711,385768 € J = TRUNC(2.711,385768 / 10.000, 4) = TRUNC(0,2711385768, 4) = 0,2711 Verifica: ✅ Corrisponde ai dati del foglio Excel
Test Case 2: Coefficiente mensile Luglio 2025
Totali: I32 (totale monofase) = 18.190,011252 € D32 (totale lt. comm.) = 69.000 Calcolo: J33 = TRUNC(18.190,011252 / 69.000, 4) = TRUNC(0,26362335..., 4) = 0,2636 Verifica: ✅ Corrisponde ai dati del foglio Excel
Test Case 3: Applicazione al cliente
Coefficiente mese = 0,2636 Litri venduti cliente = 1.000 Importo fattura = 1.000 × 0,2636 = 263,60 € Verifica: ✅ Logica corretta