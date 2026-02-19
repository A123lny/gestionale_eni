-- ============================================================
-- GESTIONALE STAZIONE ENI - BORGO MAGGIORE (San Marino)
-- Schema Database Completo - PostgreSQL (Supabase)
-- Versione: 1.0
-- Data: 2026-02-16
-- ============================================================

-- ============================================================
-- TABELLA 1: PERSONALE
-- Dipendenti, ruoli e autenticazione PIN
-- ============================================================
CREATE TABLE personale (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    nome_completo VARCHAR(150) NOT NULL,
    email VARCHAR(200),
    telefono VARCHAR(50),
    ruolo VARCHAR(20) NOT NULL CHECK (ruolo IN ('Admin', 'Cassiere', 'Lavaggi')),
    pin VARCHAR(10) NOT NULL,
    attivo BOOLEAN DEFAULT true,
    data_assunzione DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABELLA 2: CLIENTI
-- Corporate (aziende) + Privati con listini personalizzati
-- ============================================================
CREATE TABLE clienti (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('Corporate', 'Privato')),
    nome_ragione_sociale VARCHAR(200) NOT NULL,
    p_iva_coe VARCHAR(50),
    email VARCHAR(200),
    telefono VARCHAR(50),
    targa VARCHAR(20),
    modalita_pagamento VARCHAR(30) NOT NULL CHECK (modalita_pagamento IN (
        'Cash', 'Addebito_Mese', 'Addebito_30gg', 'Addebito_60gg', 'Bonifico_Anticipato'
    )),
    listino_personalizzato JSONB DEFAULT NULL,
    note TEXT,
    attivo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABELLA 3: LISTINO LAVAGGI
-- Tipi di lavaggio con prezzi standard
-- ============================================================
CREATE TABLE listino_lavaggi (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tipo_lavaggio VARCHAR(50) UNIQUE NOT NULL,
    prezzo_standard DECIMAL(10,2) NOT NULL,
    durata_minuti INT DEFAULT 30,
    descrizione TEXT,
    attivo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABELLA 4: LAVAGGI
-- Prenotazioni e lavaggi completati
-- ============================================================
CREATE TABLE lavaggi (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    codice VARCHAR(10) UNIQUE NOT NULL,
    data DATE NOT NULL,
    orario_inizio TIME,
    orario_fine TIME,
    cliente_id UUID REFERENCES clienti(id),
    nome_cliente VARCHAR(200) DEFAULT 'Walk-in',
    tipo_lavaggio VARCHAR(50) NOT NULL,
    prezzo DECIMAL(10,2) NOT NULL,
    priorita VARCHAR(10) DEFAULT 'ASPETTA' CHECK (priorita IN ('ASPETTA', 'LASCIA')),
    stato VARCHAR(20) DEFAULT 'Prenotato' CHECK (stato IN ('Prenotato', 'Completato', 'Annullato')),
    walk_in BOOLEAN DEFAULT false,
    note TEXT,
    modalita_pagamento VARCHAR(30),
    utente_inserimento UUID REFERENCES personale(id),
    utente_completamento UUID REFERENCES personale(id),
    completato_at TIMESTAMPTZ,
    credito_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABELLA 5: CREDITI
-- Tracciamento crediti aperti, incassati, scaduti
-- ============================================================
CREATE TABLE crediti (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    codice VARCHAR(10) UNIQUE NOT NULL,
    cliente_id UUID REFERENCES clienti(id),
    nome_cliente VARCHAR(200) NOT NULL,
    importo DECIMAL(10,2) NOT NULL,
    causale VARCHAR(200),
    origine VARCHAR(50),
    origine_id UUID,
    stato VARCHAR(20) DEFAULT 'Aperto' CHECK (stato IN ('Aperto', 'Incassato', 'Scaduto', 'Annullato')),
    scadenza DATE,
    data_incasso DATE,
    modalita_incasso VARCHAR(30),
    utente_creazione UUID REFERENCES personale(id),
    utente_incasso UUID REFERENCES personale(id),
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- FK circolare: lavaggi.credito_id -> crediti.id
ALTER TABLE lavaggi ADD CONSTRAINT fk_lavaggi_credito
    FOREIGN KEY (credito_id) REFERENCES crediti(id);

-- ============================================================
-- TABELLA 6: CASSA
-- Chiusura giornaliera dettagliata
-- ============================================================
CREATE TABLE cassa (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    data DATE NOT NULL,
    ora_apertura TIME,
    ora_chiusura TIME,
    utente_apertura UUID REFERENCES personale(id),
    utente_chiusura UUID REFERENCES personale(id),

    -- Venduto Carburante (6 tipi: litri + euro)
    benzina95_litri DECIMAL(10,2) DEFAULT 0,
    benzina95_euro DECIMAL(10,2) DEFAULT 0,
    benzina98_litri DECIMAL(10,2) DEFAULT 0,
    benzina98_euro DECIMAL(10,2) DEFAULT 0,
    diesel_litri DECIMAL(10,2) DEFAULT 0,
    diesel_euro DECIMAL(10,2) DEFAULT 0,
    diesel_plus_litri DECIMAL(10,2) DEFAULT 0,
    diesel_plus_euro DECIMAL(10,2) DEFAULT 0,
    gpl_litri DECIMAL(10,2) DEFAULT 0,
    gpl_euro DECIMAL(10,2) DEFAULT 0,
    self_notturno_litri DECIMAL(10,2) DEFAULT 0,
    self_notturno_euro DECIMAL(10,2) DEFAULT 0,

    -- Venduto Altro (6 categorie)
    venduto_bar DECIMAL(10,2) DEFAULT 0,
    venduto_olio DECIMAL(10,2) DEFAULT 0,
    venduto_accessori DECIMAL(10,2) DEFAULT 0,
    venduto_adblue DECIMAL(10,2) DEFAULT 0,
    venduto_lavaggi DECIMAL(10,2) DEFAULT 0,
    venduto_buoni DECIMAL(10,2) DEFAULT 0,

    -- Incassato Contanti
    contanti_banconote DECIMAL(10,2) DEFAULT 0,
    contanti_monete DECIMAL(10,2) DEFAULT 0,

    -- Incassato POS BSI (4 terminali)
    pos_bsi_terminale1 DECIMAL(10,2) DEFAULT 0,
    pos_bsi_terminale2 DECIMAL(10,2) DEFAULT 0,
    pos_bsi_pos1 DECIMAL(10,2) DEFAULT 0,
    pos_bsi_smac DECIMAL(10,2) DEFAULT 0,

    -- Incassato POS Carisp (2 terminali)
    pos_carisp_terminale1 DECIMAL(10,2) DEFAULT 0,
    pos_carisp_terminale2 DECIMAL(10,2) DEFAULT 0,

    -- Altro Incassato
    self_notturno_contanti DECIMAL(10,2) DEFAULT 0,
    assegni DECIMAL(10,2) DEFAULT 0,
    bonifici DECIMAL(10,2) DEFAULT 0,

    -- Crediti Generati (5 tipologie)
    crediti_paghero DECIMAL(10,2) DEFAULT 0,
    crediti_mobile_payment DECIMAL(10,2) DEFAULT 0,
    crediti_buoni_eni DECIMAL(10,2) DEFAULT 0,
    crediti_voucher DECIMAL(10,2) DEFAULT 0,
    crediti_bollette DECIMAL(10,2) DEFAULT 0,

    -- Totali calcolati
    totale_venduto DECIMAL(10,2) DEFAULT 0,
    totale_incassato DECIMAL(10,2) DEFAULT 0,
    totale_crediti DECIMAL(10,2) DEFAULT 0,
    differenza DECIMAL(10,2) DEFAULT 0,

    note TEXT,
    stato VARCHAR(20) DEFAULT 'aperta' CHECK (stato IN ('aperta', 'chiusa')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABELLA 7: MAGAZZINO
-- Inventario prodotti bar/shop/accessori
-- ============================================================
CREATE TABLE magazzino (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    codice VARCHAR(50) UNIQUE NOT NULL,
    nome_prodotto VARCHAR(200) NOT NULL,
    categoria VARCHAR(50) CHECK (categoria IN ('Bar', 'Shop', 'Olio', 'Accessori', 'AdBlue', 'Altro')),
    giacenza INT DEFAULT 0,
    giacenza_minima INT DEFAULT 5,
    prezzo_acquisto DECIMAL(10,2),
    prezzo_vendita DECIMAL(10,2) NOT NULL,
    fornitore VARCHAR(200),
    attivo BOOLEAN DEFAULT true,
    ultima_movimentazione TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABELLA 8: MANUTENZIONI
-- Storico interventi su attrezzature
-- ============================================================
CREATE TABLE manutenzioni (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    codice VARCHAR(10) UNIQUE NOT NULL,
    data DATE NOT NULL,
    tipo_intervento VARCHAR(30) CHECK (tipo_intervento IN ('Ordinaria', 'Straordinaria')),
    attrezzatura VARCHAR(200) NOT NULL,
    descrizione TEXT,
    costo DECIMAL(10,2),
    fornitore VARCHAR(200),
    prossima_scadenza DATE,
    utente_inserimento UUID REFERENCES personale(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABELLA 9: LOG ATTIVITA
-- Audit trail completo
-- ============================================================
CREATE TABLE log_attivita (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    utente_id UUID REFERENCES personale(id),
    nome_utente VARCHAR(150),
    azione VARCHAR(100) NOT NULL,
    modulo VARCHAR(50) NOT NULL,
    dettagli TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABELLA 10: DASHBOARD GIORNALIERO
-- Snapshot giornaliero per storico rapido
-- ============================================================
CREATE TABLE dashboard_giornaliero (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    data DATE UNIQUE NOT NULL,
    venduto_totale DECIMAL(10,2) DEFAULT 0,
    incassato_totale DECIMAL(10,2) DEFAULT 0,
    crediti_aperti DECIMAL(10,2) DEFAULT 0,
    lavaggi_giorno INT DEFAULT 0,
    clienti_attivi INT DEFAULT 0,
    utente_apertura VARCHAR(150),
    utente_chiusura VARCHAR(150),
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDICI PER PERFORMANCE
-- ============================================================
CREATE INDEX idx_clienti_tipo ON clienti(tipo);
CREATE INDEX idx_clienti_attivo ON clienti(attivo);
CREATE INDEX idx_clienti_nome ON clienti(nome_ragione_sociale);
CREATE INDEX idx_lavaggi_data ON lavaggi(data);
CREATE INDEX idx_lavaggi_stato ON lavaggi(stato);
CREATE INDEX idx_lavaggi_cliente ON lavaggi(cliente_id);
CREATE INDEX idx_crediti_stato ON crediti(stato);
CREATE INDEX idx_crediti_cliente ON crediti(cliente_id);
CREATE INDEX idx_crediti_scadenza ON crediti(scadenza);
CREATE INDEX idx_cassa_data ON cassa(data);
CREATE INDEX idx_cassa_stato ON cassa(stato);
CREATE INDEX idx_magazzino_categoria ON magazzino(categoria);
CREATE INDEX idx_magazzino_attivo ON magazzino(attivo);
CREATE INDEX idx_manutenzioni_data ON manutenzioni(data);
CREATE INDEX idx_manutenzioni_scadenza ON manutenzioni(prossima_scadenza);
CREATE INDEX idx_log_created ON log_attivita(created_at DESC);
CREATE INDEX idx_log_modulo ON log_attivita(modulo);
CREATE INDEX idx_log_utente ON log_attivita(utente_id);
CREATE INDEX idx_personale_attivo ON personale(attivo);
CREATE INDEX idx_personale_username ON personale(username);

-- ============================================================
-- DATI INIZIALI: LISTINO LAVAGGI
-- ============================================================
INSERT INTO listino_lavaggi (tipo_lavaggio, prezzo_standard, durata_minuti, descrizione, attivo) VALUES
    ('Esterno', 14.00, 30, 'Lavaggio esterno carrozzeria', true),
    ('Completo', 28.00, 60, 'Lavaggio esterno + interno completo', true),
    ('Furgone', 30.00, 90, 'Lavaggio furgone/veicolo commerciale', true),
    ('Interno', 18.00, 45, 'Pulizia interni approfondita', true),
    ('Cerchi', 25.00, 40, 'Lavaggio e lucidatura cerchi', true),
    ('Motore', 40.00, 60, 'Lavaggio vano motore', true);

-- ============================================================
-- DATI INIZIALI: UTENTE ADMIN
-- ============================================================
INSERT INTO personale (username, nome_completo, ruolo, pin, attivo) VALUES
    ('andrea', 'Andrea Cervellini', 'Admin', '1234', true);

-- ============================================================
-- FUNZIONE: Genera codice sequenziale
-- Usata per LAV001, CRE001, MAN001, ecc.
-- ============================================================
CREATE OR REPLACE FUNCTION genera_codice(prefisso TEXT, nome_tabella TEXT, nome_colonna TEXT)
RETURNS TEXT AS $$
DECLARE
    ultimo_numero INT;
    nuovo_codice TEXT;
BEGIN
    EXECUTE format(
        'SELECT COALESCE(MAX(CAST(SUBSTRING(%I FROM %L) AS INT)), 0) FROM %I',
        nome_colonna,
        prefisso || '(\d+)',
        nome_tabella
    ) INTO ultimo_numero;

    nuovo_codice := prefisso || LPAD((ultimo_numero + 1)::TEXT, 3, '0');
    RETURN nuovo_codice;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- TRIGGER: updated_at automatico
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_personale_updated
    BEFORE UPDATE ON personale
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_clienti_updated
    BEFORE UPDATE ON clienti
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_crediti_updated
    BEFORE UPDATE ON crediti
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_magazzino_updated
    BEFORE UPDATE ON magazzino
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
