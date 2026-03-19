SPECIFICHE — Sezione Gestione Prezzi Carburante per Gestionale ENI
Panoramica
Crea una sezione nel gestionale per il calcolo automatico dei prezzi di vendita carburante per un distributore ENI. Il sistema parte dai prezzi di acquisto (dal fornitore ENI) e calcola il prezzo finale al litro attraverso una catena di passaggi fiscali e commerciali.

1. PARAMETRI GLOBALI (Configurabili dall'utente)
Questi parametri devono essere modificabili dall'utente e influenzano TUTTI i calcoli di ogni riga dello storico.

Parametro	Descrizione	Valore attuale	Formato
Monofase %	Aliquota IVA monofase sul prezzo d'acquisto	21%	Percentuale (es. 0.21)
Accise €/lt	Accisa per litro imposta dallo Stato	0,64870 €/lt	Euro con 5 decimali
Monofase % su Accise	Aliquota IVA monofase applicata sulle accise	21%	Percentuale (es. 0.21)
Compenso €/lt	Compenso gestore per litro	0,05000 €/lt	Euro con 5 decimali
Detrazione AMC €/lt	Detrazione Azienda Multiservizi Comunale	0,05220 €/lt	Euro con 5 decimali
⚠️ IMPORTANTE: Quando l'utente modifica un parametro, TUTTI i prezzi finali devono ricalcolarsi automaticamente.

2. TIPI DI CARBURANTE
Il sistema gestisce 3 tipi di carburante:

Diesel (gasolio normale)
Diesel+ (gasolio premium/additivato)
Super (benzina super)
3. STORICO CAMBI PREZZO (Tabella principale)
Campi di input (inseriti manualmente dall'utente)
Per ogni riga dello storico, l'utente inserisce:

Campo	Descrizione	Formato
Data Variazione	Data in cui il prezzo cambia	Data (GG/MM/AAAA)
Note	Tipo di variazione (es. "fattura eni", "cambio prezzi")	Testo libero
P.Acq. Diesel €/lt	Prezzo di acquisto Diesel dal fornitore	Euro con 6 decimali (es. 0,632836)
P.Acq. Diesel+ €/lt	Prezzo di acquisto Diesel+ dal fornitore	Euro con 7 decimali (es. 0,6984133)
P.Acq. Super €/lt	Prezzo di acquisto Super dal fornitore	Euro con 6 decimali (es. 0,567263)
Campi calcolati automaticamente (catena di calcolo)
Per ciascun tipo di carburante (Diesel, Diesel+, Super), i passaggi di calcolo sono:

STEP 1 — Applicazione Monofase sul Prezzo d'Acquisto ("+Mono.MP")
Sub1 = Prezzo_Acquisto × (1 + Monofase%)
Esempio Diesel: 0,632836 × (1 + 0,21) = 0,76573 €/lt

STEP 2 — Aggiunta Accise ("+Accise")
Sub2 = Sub1 + Accise_per_litro
Esempio Diesel: 0,76573 + 0,64870 = 1,41443 €/lt

STEP 3 — Aggiunta Monofase sulle Accise ("Costo tot.lt")
Costo_Totale = Sub2 + (Accise_per_litro × Monofase_su_Accise%)
Esempio Diesel: 1,41443 + (0,64870 × 0,21) = 1,55066 €/lt

STEP 4 — Aggiunta Compenso Gestore ("+Comp.")
Sub3 = Costo_Totale + Compenso_per_litro
Esempio Diesel: 1,55066 + 0,05000 = 1,60066 €/lt

STEP 5 — Sottrazione Detrazione AMC ("FINALE €/lt")
PREZZO_FINALE = Sub3 - Detrazione_AMC
Esempio Diesel: 1,60066 - 0,05220 = 1,54846 €/lt

Formula compatta riassuntiva
PREZZO_FINALE = [P.Acquisto × (1 + Monofase%)] + Accise + (Accise × Monofase_Accise%) + Compenso - Detrazione_AMC
4. SEZIONE CONFRONTO PREZZI POMPA (Opzionale)
Oltre ai prezzi calcolati, il sistema include colonne per:

Campo	Descrizione
Diesel su pompa	Prezzo esposto per Diesel (input manuale)
Diesel+ su pompa	Prezzo esposto per Diesel+ (input manuale)
Super su pompa	Prezzo esposto per Super (input manuale)
Diff. Diesel	= Diesel_pompa - Prezzo_Finale_Diesel
Diff. Diesel+	= Diesel+_pompa - Prezzo_Finale_Diesel+
Diff. Super	= Super_pompa - Prezzo_Finale_Super
Serve per verificare che il prezzo esposto copra il costo calcolato e misurare il margine.

5. STRUTTURA DATI CONSIGLIATA (per database/backend)
Tabella parametri_prezzi
id INTEGER PRIMARY KEY monofase_pct DECIMAL(5,4) -- es. 0.2100 accise_lt DECIMAL(8,5) -- es. 0.64870 monofase_accise DECIMAL(5,4) -- es. 0.2100 compenso_lt DECIMAL(8,5) -- es. 0.05000 detrazione_amc DECIMAL(8,5) -- es. 0.05220 updated_at TIMESTAMP
Tabella storico_prezzi
id INTEGER PRIMARY KEY data_variazione DATE note TEXT prezzo_acq_diesel DECIMAL(10,7) prezzo_acq_diesel_plus DECIMAL(10,7) prezzo_acq_super DECIMAL(10,7) prezzo_pompa_diesel DECIMAL(8,5) -- opzionale prezzo_pompa_diesel_plus DECIMAL(8,5) prezzo_pompa_super DECIMAL(8,5) created_at TIMESTAMP
Campi CALCOLATI (derivati in frontend o via query/view)
Tutti i subtotali e il prezzo finale NON vanno salvati nel database — si calcolano al volo dai parametri e dal prezzo d'acquisto.

function calcolaPrezzo(prezzoAcquisto, params) {
  const sub1_monofase = prezzoAcquisto * (1 + params.monofase_pct);
  const sub2_accise = sub1_monofase + params.accise_lt;
  const costo_totale = sub2_accise + (params.accise_lt * params.monofase_accise);
  const sub3_compenso = costo_totale + params.compenso_lt;
  const prezzo_finale = sub3_compenso - params.detrazione_amc;
  
  return {
    sub1_monofase,
    sub2_accise,
    costo_totale,
    sub3_compenso,
    prezzo_finale,
  };
}

// Esempio:
const params = {
  monofase_pct: 0.21,
  accise_lt: 0.64870,
  monofase_accise: 0.21,
  compenso_lt: 0.05000,
  detrazione_amc: 0.05220
};

const diesel = calcolaPrezzo(0.632836, params);
// diesel.prezzo_finale → ~1.54846 €/lt
6. INTERFACCIA UTENTE — Layout Consigliato
Sezione Superiore: PARAMETRI
Form/card con i 5 parametri globali modificabili
Evidenziare i campi input con sfondo giallo
Quando si modificano, tutti i prezzi si aggiornano in tempo reale
Sezione Centrale: TABELLA STORICO PREZZI
#	Colonna	Tipo	Colore suggerito
1	Data Variazione	Input	Bianco/giallo
2	Note	Input	Bianco/giallo
3	P.Acq. Diesel	Input	Giallo (#FFFF00)
4	P.Acq. Diesel+	Input	Giallo (#FFFF00)
5	P.Acq. Super	Input	Giallo (#FFFF00)
6	Sub1 Diesel (+Mono)	Calcolato	Giallo chiaro (#FFF2CC)
7	Sub1 Diesel+ (+Mono)	Calcolato	Giallo chiaro (#FFF2CC)
8	Sub1 Super (+Mono)	Calcolato	Giallo chiaro (#FFF2CC)
9	Sub2 Diesel (+Accise)	Calcolato	Giallo chiaro (#FFF2CC)
10	Sub2 Diesel+ (+Accise)	Calcolato	Giallo chiaro (#FFF2CC)
11	Sub2 Super (+Accise)	Calcolato	Giallo chiaro (#FFF2CC)
12	Costo Tot. Diesel	Calcolato	Azzurro (#D9E1F2)
13	Costo Tot. Diesel+	Calcolato	Azzurro (#D9E1F2)
14	Costo Tot. Super	Calcolato	Azzurro (#D9E1F2)
15	+Comp. Diesel	Calcolato	Giallo chiaro (#FFF2CC)
16	+Comp. Diesel+	Calcolato	Giallo chiaro (#FFF2CC)
17	+Comp. Super	Calcolato	Giallo chiaro (#FFF2CC)
18	✅ FINALE Diesel	Calcolato	Blu scuro (#1F3864) + testo bianco
19	✅ FINALE Diesel+	Calcolato	Blu scuro (#1F3864) + testo bianco
20	✅ FINALE Super	Calcolato	Blu scuro (#1F3864) + testo bianco
21	Diesel su pompa	Input	Bianco
22	Diesel+ su pompa	Input	Bianco
23	Super su pompa	Input	Bianco
24	Diff. Diesel	Calcolato	Bianco
25	Diff. Diesel+	Calcolato	Bianco
26	Diff. Super	Calcolato	Bianco
Vista semplificata: Per una UI più pulita, puoi mostrare solo Data, Note, 3 prezzi d'acquisto e 3 prezzi finali, con i subtotali in un pannello espandibile.

7. DATI DI TEST
Parametri:
{
  "monofase_pct": 0.21,
  "accise_lt": 0.64870,
  "monofase_accise": 0.21,
  "compenso_lt": 0.05000,
  "detrazione_amc": 0.05220
}
Storico prezzi:
[
  {"data":"2026-02-18","note":"fattura eni","diesel":0.632836,"diesel_plus":0.6984133,"super":0.567263},
  {"data":"2026-02-19","note":"cambio prezzi","diesel":0.632836,"diesel_plus":0.6984133,"super":0.567263},
  {"data":"2026-02-20","note":"cambio prezzi","diesel":0.632836,"diesel_plus":0.6984133,"super":0.567263},
  {"data":"2026-02-21","note":"fattura eni","diesel":0.723002,"diesel_plus":0.80497,"super":0.616443},
  {"data":"2026-02-23","note":"cambio prezzi","diesel":0.723002,"diesel_plus":0.80497,"super":0.616443},
  {"data":"2026-02-26","note":"cambio prezzi","diesel":0.723002,"diesel_plus":0.80497,"super":0.616443},
  {"data":"2026-02-27","note":"fattura eni","diesel":0.788576,"diesel_plus":0.870545,"super":0.649233},
  {"data":"2026-02-28","note":"fattura eni","diesel":0.8295588,"diesel_plus":0.91152,"super":0.665624},
  {"data":"2026-03-01","note":"cambio prezzi","diesel":0.8995588,"diesel_plus":0.91152,"super":0.665624},
  {"data":"2026-03-02","note":"fattura eni","diesel":0.8541493,"diesel_plus":0.91152,"super":0.665624},
  {"data":"2026-03-04","note":"fattura eni","diesel":0.8541493,"diesel_plus":null,"super":null}
]
Risultati attesi (per validazione):
Riga 2026-02-18, Diesel = 0.632836:

Sub1 (+Mono): 0,76573 €
Sub2 (+Accise): 1,41443 €
Costo Totale: 1,55066 €
+Compenso: 1,60066 €
PREZZO FINALE: 1,54846 €
8. NOTE IMPLEMENTATIVE
Precisione decimale: Usare almeno 5-7 decimali nei calcoli intermedi. Mostrare 5 decimali all'utente.
Gestione celle vuote: Se un prezzo d'acquisto è null, tutti i calcoli derivati devono mostrare "-" o essere vuoti (non 0).
Ordinamento: Tabella ordinata per data (la più recente in alto o in basso).
Aggiunta righe: L'utente deve poter aggiungere facilmente una nuova riga.
Colori: Giallo (#FFFF00) = input, Blu scuro (#1F3864) + bianco = prezzi finali, Azzurro (#D9E1F2) = costi totali, Giallo chiaro (#FFF2CC) = subtotali, Header blu (#2E75B6) + bianco.
Ricalcolo in tempo reale: Quando i parametri cambiano, TUTTI i prezzi si aggiornano istantaneamente.