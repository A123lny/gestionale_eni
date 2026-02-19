# Gestionale ENI - Guida Completa
## Streamlit + Supabase

**Data:** 16 Febbraio 2026  
**Autore:** Claude per Andrea Lenny S.r.l.

---

## 🎯 Cosa costruirai

Un gestionale web completo per la stazione ENI accessibile da qualsiasi dispositivo via browser con:
- Gestione inventario 551 prodotti
- Cassa giornaliera multi-terminale
- Sistema lavaggi auto
- Gestione clienti
- Tracking attività utenti
- Dashboard reportistica

**URL finale:** `https://eni-gestionale-andrea.streamlit.app` (o simile)

---

## 🏗️ Architettura

```
Browser (PC/Telefono/Tablet)
    ↓
Streamlit App (Python) su Cloud
    ↓
Supabase Database (PostgreSQL)
```

**Vantaggi:**
- ✅ Zero costi (piani gratuiti)
- ✅ Accessibile ovunque
- ✅ Database SQL vero
- ✅ Sviluppo in Visual Studio Code
- ✅ Deploy automatico
- ✅ Backup automatici

---

## 📋 Fase 1: Setup Supabase (Database Cloud)

### 1.1 Creazione Account
1. Vai su **https://supabase.com**
2. Click "Start your project"
3. Sign up con GitHub o email
4. Verifica email

### 1.2 Creazione Progetto
1. Click "New Project"
2. Nome: `eni-gestionale-sm`
3. Database Password: **SALVALA** (servirà)
4. Region: `Europe (Frankfurt)` o `Europe (London)`
5. Pricing Plan: **Free**
6. Click "Create new project"
7. Attendi 2-3 minuti

### 1.3 Ottieni Credenziali
Nel dashboard Supabase:
1. Click **Settings** (icona ingranaggio)
2. Click **API**
3. Copia e salva:
   - **Project URL** (tipo: `https://xxxxx.supabase.co`)
   - **anon/public key** (lunga stringa che inizia con `eyJ...`)

**IMPORTANTE:** Salvali in un file sicuro, ti serviranno nel codice!

---

## 📊 Fase 2: Creazione Tabelle Database

Nel dashboard Supabase, vai su **Table Editor** e crea queste tabelle:

### Tabella: `prodotti`
```sql
CREATE TABLE prodotti (
    id SERIAL PRIMARY KEY,
    codice_ean VARCHAR(50) UNIQUE NOT NULL,
    nome VARCHAR(200) NOT NULL,
    categoria VARCHAR(100),
    prezzo_acquisto DECIMAL(10,2),
    prezzo_vendita DECIMAL(10,2) NOT NULL,
    giacenza INT DEFAULT 0,
    scorta_minima INT DEFAULT 5,
    fornitore VARCHAR(200),
    note TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

### Tabella: `vendite`
```sql
CREATE TABLE vendite (
    id SERIAL PRIMARY KEY,
    prodotto_id INT REFERENCES prodotti(id),
    quantita INT NOT NULL,
    prezzo_unitario DECIMAL(10,2) NOT NULL,
    totale DECIMAL(10,2) NOT NULL,
    terminale VARCHAR(50),
    operatore VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW()
);
```

### Tabella: `cassa`
```sql
CREATE TABLE cassa (
    id SERIAL PRIMARY KEY,
    data DATE NOT NULL,
    terminale VARCHAR(50) NOT NULL,
    apertura DECIMAL(10,2) DEFAULT 0,
    contanti DECIMAL(10,2) DEFAULT 0,
    carte DECIMAL(10,2) DEFAULT 0,
    buoni DECIMAL(10,2) DEFAULT 0,
    totale_vendite DECIMAL(10,2) DEFAULT 0,
    chiusura DECIMAL(10,2),
    differenza DECIMAL(10,2),
    note TEXT,
    operatore VARCHAR(100),
    stato VARCHAR(20) DEFAULT 'aperta',
    created_at TIMESTAMP DEFAULT NOW(),
    closed_at TIMESTAMP
);
```

### Tabella: `lavaggi`
```sql
CREATE TABLE lavaggi (
    id SERIAL PRIMARY KEY,
    cliente_id INT REFERENCES clienti(id),
    tipo_lavaggio VARCHAR(100) NOT NULL,
    targa VARCHAR(20),
    importo DECIMAL(10,2) NOT NULL,
    stato VARCHAR(50) DEFAULT 'programmato',
    data_prenotazione TIMESTAMP,
    data_esecuzione TIMESTAMP,
    operatore VARCHAR(100),
    note TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);
```

### Tabella: `clienti`
```sql
CREATE TABLE clienti (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(100),
    cognome VARCHAR(100),
    email VARCHAR(200),
    telefono VARCHAR(50),
    targa_auto VARCHAR(20),
    note TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

### Tabella: `attivita_utenti`
```sql
CREATE TABLE attivita_utenti (
    id SERIAL PRIMARY KEY,
    utente VARCHAR(100) NOT NULL,
    azione VARCHAR(200) NOT NULL,
    tabella VARCHAR(100),
    record_id INT,
    dettagli JSONB,
    ip_address VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW()
);
```

**Nota:** Puoi creare le tabelle direttamente dall'interfaccia Table Editor oppure usando l'SQL Editor di Supabase.

---

## 💻 Fase 3: Setup Ambiente Python Locale

### 3.1 Requisiti
- Python 3.8+ installato
- Visual Studio Code
- Git (per deploy finale)

### 3.2 Installazione Librerie
Apri terminale in Visual Studio Code e crea un progetto:

```bash
# Crea cartella progetto
mkdir eni-gestionale
cd eni-gestionale

# Crea ambiente virtuale (opzionale ma consigliato)
python -m venv venv

# Attiva ambiente (Windows)
venv\Scripts\activate

# Attiva ambiente (Mac/Linux)
source venv/bin/activate

# Installa dipendenze
pip install streamlit supabase pandas plotly python-dotenv
```

### 3.3 Struttura File
```
eni-gestionale/
│
├── .env                 # Credenziali (NON committare su Git!)
├── .gitignore          # File da ignorare
├── app.py              # File principale Streamlit
├── requirements.txt    # Dipendenze Python
└── pages/              # Pagine multiple (opzionale)
    ├── inventario.py
    ├── cassa.py
    └── lavaggi.py
```

### 3.4 File `.env` (Credenziali)
Crea file `.env` nella root del progetto:

```env
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**IMPORTANTE:** Sostituisci con le TUE credenziali salvate prima!

### 3.5 File `.gitignore`
```
venv/
.env
__pycache__/
*.pyc
.DS_Store
```

### 3.6 File `requirements.txt`
```
streamlit==1.31.0
supabase==2.3.0
pandas==2.2.0
plotly==5.18.0
python-dotenv==1.0.0
```

---

## 🚀 Fase 4: Codice Base Streamlit

### File: `app.py`

```python
import streamlit as st
from supabase import create_client, Client
from dotenv import load_dotenv
import os
import pandas as pd
from datetime import datetime

# Carica credenziali
load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

# Inizializza Supabase
@st.cache_resource
def init_supabase() -> Client:
    return create_client(SUPABASE_URL, SUPABASE_KEY)

supabase = init_supabase()

# Configurazione pagina
st.set_page_config(
    page_title="Gestionale ENI - Borgo Maggiore",
    page_icon="⛽",
    layout="wide"
)

# Sidebar menu
st.sidebar.title("⛽ Gestionale ENI")
menu = st.sidebar.radio(
    "Menu",
    ["Dashboard", "Inventario", "Cassa", "Lavaggi", "Clienti", "Reportistica"]
)

# Tracciamento attività
def log_activity(utente, azione, tabella=None, record_id=None, dettagli=None):
    supabase.table("attivita_utenti").insert({
        "utente": utente,
        "azione": azione,
        "tabella": tabella,
        "record_id": record_id,
        "dettagli": dettagli
    }).execute()

# === DASHBOARD ===
if menu == "Dashboard":
    st.title("📊 Dashboard Generale")
    
    col1, col2, col3, col4 = st.columns(4)
    
    # Totale prodotti
    with col1:
        prodotti_count = supabase.table("prodotti").select("id", count="exact").execute()
        st.metric("Prodotti Totali", prodotti_count.count)
    
    # Vendite oggi
    with col2:
        oggi = datetime.now().date()
        vendite_oggi = supabase.table("vendite")\
            .select("totale")\
            .gte("created_at", f"{oggi}T00:00:00")\
            .execute()
        totale_oggi = sum([v['totale'] for v in vendite_oggi.data])
        st.metric("Vendite Oggi", f"€ {totale_oggi:.2f}")
    
    # Lavaggi in programma
    with col3:
        lavaggi = supabase.table("lavaggi")\
            .select("id", count="exact")\
            .eq("stato", "programmato")\
            .execute()
        st.metric("Lavaggi Programmati", lavaggi.count)
    
    # Prodotti sotto scorta
    with col4:
        sotto_scorta = supabase.table("prodotti")\
            .select("id", count="exact")\
            .filter("giacenza", "lt", "scorta_minima")\
            .execute()
        st.metric("⚠️ Sotto Scorta", sotto_scorta.count)

# === INVENTARIO ===
elif menu == "Inventario":
    st.title("📦 Gestione Inventario")
    
    tab1, tab2, tab3 = st.tabs(["Elenco Prodotti", "Aggiungi Prodotto", "Movimenti"])
    
    with tab1:
        # Carica prodotti
        prodotti = supabase.table("prodotti").select("*").execute()
        df = pd.DataFrame(prodotti.data)
        
        if not df.empty:
            # Filtri
            col1, col2 = st.columns(2)
            with col1:
                search = st.text_input("🔍 Cerca per nome o EAN")
            with col2:
                categoria = st.selectbox("Categoria", ["Tutte"] + df['categoria'].unique().tolist())
            
            # Applica filtri
            if search:
                df = df[df['nome'].str.contains(search, case=False, na=False) | 
                       df['codice_ean'].str.contains(search, case=False, na=False)]
            if categoria != "Tutte":
                df = df[df['categoria'] == categoria]
            
            # Evidenzia sotto scorta
            def highlight_scorta(row):
                if row['giacenza'] < row['scorta_minima']:
                    return ['background-color: #ffcccc'] * len(row)
                return [''] * len(row)
            
            st.dataframe(
                df.style.apply(highlight_scorta, axis=1),
                use_container_width=True,
                hide_index=True
            )
        else:
            st.info("Nessun prodotto in inventario")
    
    with tab2:
        st.subheader("Aggiungi Nuovo Prodotto")
        
        with st.form("add_product"):
            col1, col2 = st.columns(2)
            
            with col1:
                ean = st.text_input("Codice EAN *")
                nome = st.text_input("Nome Prodotto *")
                categoria = st.selectbox("Categoria", [
                    "Carburanti", "Lubrificanti", "Accessori Auto", 
                    "Alimentari", "Bevande", "Tabacchi", "Altro"
                ])
                prezzo_acquisto = st.number_input("Prezzo Acquisto (€)", min_value=0.0, step=0.01)
            
            with col2:
                prezzo_vendita = st.number_input("Prezzo Vendita (€) *", min_value=0.0, step=0.01)
                giacenza = st.number_input("Giacenza Iniziale", min_value=0, step=1)
                scorta_minima = st.number_input("Scorta Minima", min_value=0, step=1, value=5)
                fornitore = st.text_input("Fornitore")
            
            note = st.text_area("Note")
            
            submit = st.form_submit_button("➕ Aggiungi Prodotto")
            
            if submit:
                if not ean or not nome or prezzo_vendita <= 0:
                    st.error("Compila tutti i campi obbligatori (*)")
                else:
                    try:
                        supabase.table("prodotti").insert({
                            "codice_ean": ean,
                            "nome": nome,
                            "categoria": categoria,
                            "prezzo_acquisto": prezzo_acquisto,
                            "prezzo_vendita": prezzo_vendita,
                            "giacenza": giacenza,
                            "scorta_minima": scorta_minima,
                            "fornitore": fornitore,
                            "note": note
                        }).execute()
                        
                        log_activity("Admin", f"Aggiunto prodotto: {nome}", "prodotti")
                        st.success(f"✅ Prodotto '{nome}' aggiunto con successo!")
                        st.rerun()
                    except Exception as e:
                        st.error(f"Errore: {str(e)}")

# === CASSA ===
elif menu == "Cassa":
    st.title("💰 Gestione Cassa")
    
    tab1, tab2 = st.tabs(["Apertura/Chiusura", "Storico"])
    
    with tab1:
        oggi = datetime.now().date()
        
        # Verifica se cassa è aperta oggi
        cassa_oggi = supabase.table("cassa")\
            .select("*")\
            .eq("data", str(oggi))\
            .eq("stato", "aperta")\
            .execute()
        
        if not cassa_oggi.data:
            st.subheader("🔓 Apertura Cassa")
            
            col1, col2 = st.columns(2)
            with col1:
                terminale = st.selectbox("Terminale", ["POS1", "POS2", "POS3"])
                operatore = st.text_input("Operatore")
            with col2:
                apertura = st.number_input("Fondo Cassa Iniziale (€)", min_value=0.0, step=10.0, value=100.0)
            
            if st.button("Apri Cassa"):
                supabase.table("cassa").insert({
                    "data": str(oggi),
                    "terminale": terminale,
                    "operatore": operatore,
                    "apertura": apertura,
                    "stato": "aperta"
                }).execute()
                
                log_activity(operatore, f"Apertura cassa {terminale}", "cassa")
                st.success(f"✅ Cassa {terminale} aperta con fondo €{apertura:.2f}")
                st.rerun()
        else:
            cassa = cassa_oggi.data[0]
            st.subheader(f"🔒 Chiusura Cassa - {cassa['terminale']}")
            st.info(f"Operatore: {cassa['operatore']} | Apertura: €{cassa['apertura']:.2f}")
            
            col1, col2, col3 = st.columns(3)
            with col1:
                contanti = st.number_input("Contanti (€)", min_value=0.0, step=10.0)
            with col2:
                carte = st.number_input("Carte (€)", min_value=0.0, step=10.0)
            with col3:
                buoni = st.number_input("Buoni (€)", min_value=0.0, step=10.0)
            
            totale_incasso = contanti + carte + buoni
            chiusura = cassa['apertura'] + totale_incasso
            
            st.metric("Totale Chiusura Teorica", f"€{chiusura:.2f}")
            
            conteggio_reale = st.number_input("Conteggio Reale in Cassa (€)", min_value=0.0, step=10.0)
            differenza = conteggio_reale - chiusura
            
            if differenza != 0:
                st.warning(f"⚠️ Differenza: €{differenza:.2f}")
            
            note = st.text_area("Note Chiusura")
            
            if st.button("Chiudi Cassa"):
                supabase.table("cassa").update({
                    "contanti": contanti,
                    "carte": carte,
                    "buoni": buoni,
                    "totale_vendite": totale_incasso,
                    "chiusura": conteggio_reale,
                    "differenza": differenza,
                    "note": note,
                    "stato": "chiusa",
                    "closed_at": datetime.now().isoformat()
                }).eq("id", cassa['id']).execute()
                
                log_activity(cassa['operatore'], f"Chiusura cassa {cassa['terminale']}", "cassa", cassa['id'])
                st.success("✅ Cassa chiusa con successo!")
                st.rerun()

# === LAVAGGI ===
elif menu == "Lavaggi":
    st.title("🚗 Gestione Lavaggi")
    
    tab1, tab2 = st.tabs(["Programmazione", "In Corso/Completati"])
    
    with tab1:
        st.subheader("Prenota Lavaggio")
        
        with st.form("prenota_lavaggio"):
            col1, col2 = st.columns(2)
            
            with col1:
                # Carica clienti
                clienti = supabase.table("clienti").select("*").execute()
                clienti_options = {f"{c['nome']} {c['cognome']} ({c['targa_auto']})": c['id'] 
                                  for c in clienti.data if c.get('targa_auto')}
                
                cliente = st.selectbox("Cliente", ["Nuovo Cliente"] + list(clienti_options.keys()))
                targa = st.text_input("Targa")
                tipo_lavaggio = st.selectbox("Tipo Lavaggio", [
                    "Lavaggio Base",
                    "Lavaggio Completo",
                    "Lavaggio + Ceratura",
                    "Lavaggio Interni",
                    "Lavaggio Premium"
                ])
            
            with col2:
                data_prenotazione = st.date_input("Data Prenotazione")
                ora_prenotazione = st.time_input("Ora Prenotazione")
                importo = st.number_input("Importo (€)", min_value=0.0, step=5.0)
                operatore = st.text_input("Operatore")
            
            note = st.text_area("Note")
            
            submit = st.form_submit_button("📅 Prenota Lavaggio")
            
            if submit:
                cliente_id = None if cliente == "Nuovo Cliente" else clienti_options[cliente]
                
                data_ora = datetime.combine(data_prenotazione, ora_prenotazione)
                
                supabase.table("lavaggi").insert({
                    "cliente_id": cliente_id,
                    "targa": targa,
                    "tipo_lavaggio": tipo_lavaggio,
                    "importo": importo,
                    "stato": "programmato",
                    "data_prenotazione": data_ora.isoformat(),
                    "operatore": operatore,
                    "note": note
                }).execute()
                
                log_activity(operatore, f"Prenotato lavaggio {tipo_lavaggio}", "lavaggi")
                st.success(f"✅ Lavaggio prenotato per {data_ora.strftime('%d/%m/%Y %H:%M')}")
                st.rerun()
    
    with tab2:
        lavaggi = supabase.table("lavaggi").select("*").order("created_at", desc=True).execute()
        df = pd.DataFrame(lavaggi.data)
        
        if not df.empty:
            stato_filter = st.selectbox("Filtra per Stato", ["Tutti", "programmato", "in_corso", "completato"])
            
            if stato_filter != "Tutti":
                df = df[df['stato'] == stato_filter]
            
            st.dataframe(df, use_container_width=True, hide_index=True)

# === CLIENTI ===
elif menu == "Clienti":
    st.title("👥 Gestione Clienti")
    
    tab1, tab2 = st.tabs(["Elenco Clienti", "Aggiungi Cliente"])
    
    with tab1:
        clienti = supabase.table("clienti").select("*").execute()
        df = pd.DataFrame(clienti.data)
        
        if not df.empty:
            search = st.text_input("🔍 Cerca cliente")
            if search:
                df = df[df.apply(lambda row: search.lower() in str(row).lower(), axis=1)]
            
            st.dataframe(df, use_container_width=True, hide_index=True)
        else:
            st.info("Nessun cliente registrato")
    
    with tab2:
        st.subheader("Aggiungi Nuovo Cliente")
        
        with st.form("add_cliente"):
            col1, col2 = st.columns(2)
            
            with col1:
                nome = st.text_input("Nome")
                cognome = st.text_input("Cognome")
                email = st.text_input("Email")
            
            with col2:
                telefono = st.text_input("Telefono")
                targa_auto = st.text_input("Targa Auto")
            
            note = st.text_area("Note")
            
            submit = st.form_submit_button("➕ Aggiungi Cliente")
            
            if submit:
                supabase.table("clienti").insert({
                    "nome": nome,
                    "cognome": cognome,
                    "email": email,
                    "telefono": telefono,
                    "targa_auto": targa_auto,
                    "note": note
                }).execute()
                
                log_activity("Admin", f"Aggiunto cliente: {nome} {cognome}", "clienti")
                st.success(f"✅ Cliente {nome} {cognome} aggiunto!")
                st.rerun()

# === REPORTISTICA ===
elif menu == "Reportistica":
    st.title("📈 Reportistica e Analytics")
    
    # Vendite per categoria
    st.subheader("Vendite per Categoria (Ultimi 30 giorni)")
    
    vendite = supabase.table("vendite")\
        .select("*, prodotti(categoria)")\
        .gte("created_at", (datetime.now().date() - pd.Timedelta(days=30)).isoformat())\
        .execute()
    
    if vendite.data:
        df = pd.DataFrame(vendite.data)
        df['categoria'] = df['prodotti'].apply(lambda x: x['categoria'] if x else 'N/A')
        
        vendite_cat = df.groupby('categoria')['totale'].sum().reset_index()
        
        import plotly.express as px
        fig = px.bar(vendite_cat, x='categoria', y='totale', 
                    title='Vendite per Categoria',
                    labels={'totale': 'Totale (€)', 'categoria': 'Categoria'})
        st.plotly_chart(fig, use_container_width=True)
    
    # Attività utenti
    st.subheader("Log Attività Recenti")
    attivita = supabase.table("attivita_utenti")\
        .select("*")\
        .order("created_at", desc=True)\
        .limit(50)\
        .execute()
    
    df_att = pd.DataFrame(attivita.data)
    if not df_att.empty:
        st.dataframe(df_att[['utente', 'azione', 'tabella', 'created_at']], 
                    use_container_width=True, hide_index=True)

# Footer
st.sidebar.markdown("---")
st.sidebar.caption("🛠️ Gestionale ENI v1.0")
st.sidebar.caption(f"Ultimo aggiornamento: {datetime.now().strftime('%d/%m/%Y %H:%M')}")
```

---

## 🧪 Fase 5: Test Locale

```bash
# Attiva ambiente virtuale (se non già attivo)
venv\Scripts\activate  # Windows
# oppure
source venv/bin/activate  # Mac/Linux

# Avvia Streamlit
streamlit run app.py
```

Si aprirà il browser su `http://localhost:8501`

**Test:**
1. ✅ Dashboard mostra metriche
2. ✅ Aggiungi 2-3 prodotti test
3. ✅ Apri/chiudi cassa
4. ✅ Prenota un lavaggio
5. ✅ Controlla log attività

---

## 🚀 Fase 6: Deploy su Streamlit Cloud (Gratis)

### 6.1 Preparazione GitHub

```bash
# Inizializza Git (se non già fatto)
git init
git add .
git commit -m "Initial commit - Gestionale ENI"

# Crea repository su GitHub
# Vai su github.com → New Repository → "eni-gestionale"

# Collega e push
git remote add origin https://github.com/TUO_USERNAME/eni-gestionale.git
git branch -M main
git push -u origin main
```

### 6.2 Deploy Streamlit Cloud

1. Vai su **https://share.streamlit.io**
2. Sign in con GitHub
3. Click **"New app"**
4. Seleziona:
   - Repository: `TUO_USERNAME/eni-gestionale`
   - Branch: `main`
   - Main file path: `app.py`
5. Click **"Advanced settings"**
6. In **"Secrets"** aggiungi:
   ```toml
   SUPABASE_URL = "https://xxxxx.supabase.co"
   SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
   ```
7. Click **"Deploy!"**

Attendi 2-3 minuti. Il tuo URL sarà tipo:
**`https://eni-gestionale-andrea.streamlit.app`**

---

## 🔐 Fase 7: Sicurezza (Opzionale ma consigliato)

### Aggiungi Login

Installa libreria:
```bash
pip install streamlit-authenticator
```

Aggiungi all'inizio di `app.py`:

```python
import streamlit_authenticator as stauth

# Configurazione utenti
names = ['Andrea', 'Operatore1']
usernames = ['andrea', 'op1']
passwords = ['password123', 'op123']  # Cambia con password vere!

hashed_passwords = stauth.Hasher(passwords).generate()

authenticator = stauth.Authenticate(
    names,
    usernames,
    hashed_passwords,
    'eni_gestionale',
    'abcdef',
    cookie_expiry_days=30
)

name, authentication_status, username = authenticator.login('Login', 'main')

if authentication_status:
    authenticator.logout('Logout', 'sidebar')
    st.sidebar.write(f'Benvenuto *{name}*')
    
    # ... resto del codice app ...
    
elif authentication_status == False:
    st.error('Username/password errati')
elif authentication_status == None:
    st.warning('Inserisci username e password')
```

---

## 📱 Fase 8: Accesso da Dispositivi

### Da PC Stazione
- Apri Chrome/Firefox
- Vai su `https://eni-gestionale-andrea.streamlit.app`
- Bookmark

### Da Smartphone
- Apri browser
- Vai su URL
- iOS: "Aggiungi a Home"
- Android: "Aggiungi a schermata Home"

### Da Tablet
- Stesso processo smartphone
- Layout si adatta automaticamente

---

## 🎯 Funzionalità Implementate

✅ **Dashboard**
- Metriche in tempo reale
- Contatori prodotti/vendite/lavaggi
- Alert sotto scorta

✅ **Inventario**
- Elenco prodotti con filtri
- Aggiunta prodotti
- Evidenziazione sotto scorta
- 551 prodotti gestibili

✅ **Cassa**
- Apertura/chiusura multi-terminale
- Gestione contanti/carte/buoni
- Calcolo differenze
- Storico casse

✅ **Lavaggi**
- Programmazione con data/ora
- Gestione clienti
- Stati (programmato/in corso/completato)
- Note operatore

✅ **Clienti**
- Anagrafica completa
- Ricerca veloce
- Gestione targhe

✅ **Reportistica**
- Vendite per categoria
- Grafici Plotly interattivi
- Log attività dettagliato
- Tracking completo utenti

✅ **Tracking Attività**
- Ogni azione registrata
- Chi/Cosa/Quando
- Audit trail completo

---

## 🔧 Manutenzione

### Aggiornare l'App
```bash
# Modifica codice in locale
# Test locale
streamlit run app.py

# Commit e push
git add .
git commit -m "Descrizione modifiche"
git push

# Streamlit Cloud rileva automaticamente e rideploya
```

### Backup Database
Supabase fa backup automatici. Per backup manuale:
1. Dashboard Supabase → Database
2. Table Editor → Export → CSV

### Monitoraggio
- **Streamlit Cloud**: Logs e metriche in dashboard
- **Supabase**: Analytics e query monitoring nel dashboard

---

## 💰 Costi

**ZERO €** con piani gratuiti:

| Servizio | Piano | Limiti |
|----------|-------|--------|
| **Supabase** | Free | 500MB DB, 2GB bandwidth/mese |
| **Streamlit Cloud** | Free | 1 app privata, storage illimitato |
| **GitHub** | Free | Repo pubblici/privati illimitati |

**Se superi limiti:**
- Supabase Pro: $25/mese (improbabile per il tuo caso)
- Streamlit: Team plan solo se servono più app

---

## 🆘 Troubleshooting

### Errore: "Module not found"
```bash
pip install -r requirements.txt
```

### Supabase non si collega
- Verifica credenziali in `.env`
- Controlla URL e KEY copiati correttamente
- Verifica firewall/connessione internet

### Deploy Streamlit fallisce
- Controlla `requirements.txt` completo
- Verifica secrets configurati correttamente
- Controlla logs in dashboard Streamlit Cloud

### Performance lente
- Usa `@st.cache_data` per query ripetitive
- Ottimizza query Supabase (aggiungi indici)
- Limita righe mostrate in tabelle grandi

---

## 🚀 Prossimi Step Consigliati

1. **Autenticazione Multi-Utente**
   - Login per operatori
   - Ruoli (admin, operatore, visualizzatore)
   
2. **Notifiche**
   - Email quando prodotto sotto scorta
   - Alert lavaggi programmati
   
3. **Report Avanzati**
   - Export Excel/PDF
   - Statistiche mensili/annuali
   
4. **Integrazione POS**
   - API per collegare terminali fisici
   - Sincronizzazione vendite real-time

5. **Mobile App** (opzionale)
   - PWA con Streamlit (già responsive)
   - Oppure app nativa Flutter (tuo progetto Lenny)

---

## 📞 Support

**Documentazione:**
- Streamlit: https://docs.streamlit.io
- Supabase: https://supabase.com/docs
- Python: https://docs.python.org

**Community:**
- Streamlit Forum: https://discuss.streamlit.io
- Supabase Discord: https://discord.supabase.com

---

## ✅ Checklist Finale

Prima del go-live:

- [ ] Database Supabase creato e testato
- [ ] Tutte le tabelle create
- [ ] App funzionante in locale
- [ ] Credenziali salvate in luogo sicuro
- [ ] Repository GitHub creato
- [ ] Deploy Streamlit Cloud completato
- [ ] URL funzionante e accessibile
- [ ] Test da almeno 2 dispositivi diversi
- [ ] Backup plan definito
- [ ] Training operatori completato

---

**🎉 Fine Guida - Buon lavoro con il tuo gestionale ENI!**

*Creato da Claude per Andrea - Lenny S.r.l. - San Marino*
*Versione 1.0 - Febbraio 2026*
