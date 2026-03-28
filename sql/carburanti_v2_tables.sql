-- ============================================================
-- TITANWASH - Gestionale Carburanti v2
-- Sostituzione completa modulo marginalità
-- Eseguire su Supabase SQL Editor
-- ============================================================

-- ============================================================
-- STEP 1: ELIMINA VECCHIE TABELLE MARGINALITA
-- (mantiene parametri_fiscali che viene riutilizzata)
-- ============================================================

DROP TABLE IF EXISTS dettaglio_carichi CASCADE;
DROP TABLE IF EXISTS carichi CASCADE;
DROP TABLE IF EXISTS rimanenze CASCADE;
DROP TABLE IF EXISTS periodi_marginalita CASCADE;

-- ============================================================
-- STEP 2: PRODOTTI CARBURANTE
-- ============================================================

CREATE TABLE prodotti_carburante (
    id              TEXT PRIMARY KEY,
    nome            TEXT NOT NULL,
    attivo          BOOLEAN DEFAULT true,
    ha_pc           BOOLEAN DEFAULT true,
    ordine          INTEGER DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- Prodotti default
INSERT INTO prodotti_carburante (id, nome, ha_pc, ordine) VALUES
    ('benzina', 'Benzina', true, 1),
    ('gasolio', 'Gasolio', true, 2),
    ('diesel_plus', 'Diesel+', true, 3);

-- ============================================================
-- STEP 3: STORICO ACCISE PER PRODOTTO
-- ============================================================

CREATE TABLE accise_storico (
    id              BIGSERIAL PRIMARY KEY,
    prodotto_id     TEXT NOT NULL REFERENCES prodotti_carburante(id),
    accisa          DECIMAL(8,6) NOT NULL,
    data_inizio     DATE NOT NULL,
    data_fine       DATE,
    note            TEXT,
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- Accise iniziali (uguali per tutti a San Marino, 0.6487)
INSERT INTO accise_storico (prodotto_id, accisa, data_inizio, note) VALUES
    ('benzina', 0.648700, '2024-01-01', 'Accisa iniziale'),
    ('gasolio', 0.648700, '2024-01-01', 'Accisa iniziale'),
    ('diesel_plus', 0.648700, '2024-01-01', 'Accisa iniziale');

-- ============================================================
-- STEP 4: GIACENZE INIZIALI
-- Punto di partenza per il costo medio ponderato
-- ============================================================

CREATE TABLE giacenze_iniziali (
    prodotto_id     TEXT PRIMARY KEY REFERENCES prodotti_carburante(id),
    data            DATE NOT NULL,
    litri_fisici    DECIMAL(12,2) DEFAULT 0,
    costo_medio     DECIMAL(10,6) DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- STEP 5: CARICHI CARBURANTE
-- Ogni consegna di carburante
-- ============================================================

CREATE TABLE carichi_carburante (
    id                      BIGSERIAL PRIMARY KEY,
    prodotto_id             TEXT NOT NULL REFERENCES prodotti_carburante(id),
    data                    DATE NOT NULL,
    litri_ordinati          DECIMAL(12,2) DEFAULT 0,
    litri_fisici            DECIMAL(12,2) NOT NULL,
    litri_fiscali           DECIMAL(12,2) NOT NULL,
    prezzo_mp               DECIMAL(8,5) NOT NULL,
    accisa                  DECIMAL(8,6) NOT NULL,
    costo_carico_totale     DECIMAL(12,2),
    costo_per_litro_fisico  DECIMAL(10,6),
    costo_medio_risultante  DECIMAL(10,6),
    note                    TEXT,
    created_at              TIMESTAMPTZ DEFAULT now(),

    CHECK(litri_fisici > 0)
);

-- ============================================================
-- STEP 6: PREZZI POMPA (storico)
-- ============================================================

CREATE TABLE prezzi_pompa (
    id              BIGSERIAL PRIMARY KEY,
    prodotto_id     TEXT NOT NULL REFERENCES prodotti_carburante(id),
    data_inizio     DATE NOT NULL,
    prezzo          DECIMAL(8,5) NOT NULL,
    note            TEXT,
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- STEP 7: VENDITE GIORNALIERE
-- Una riga per giorno lavorativo (o intervallo con festivi)
-- ============================================================

CREATE TABLE vendite_giornaliere (
    id              BIGSERIAL PRIMARY KEY,
    data_inizio     DATE NOT NULL,
    data_fine       DATE NOT NULL,
    litri_totali    DECIMAL(12,2) DEFAULT 0,
    importo_totale  DECIMAL(12,2) DEFAULT 0,
    note            TEXT,
    created_at      TIMESTAMPTZ DEFAULT now(),

    UNIQUE(data_inizio)
);

-- ============================================================
-- STEP 8: VENDITE PER PRODOTTO (breakdown giornaliero)
-- ============================================================

CREATE TABLE vendite_per_prodotto (
    id              BIGSERIAL PRIMARY KEY,
    vendita_id      BIGINT NOT NULL REFERENCES vendite_giornaliere(id) ON DELETE CASCADE,
    prodotto_id     TEXT NOT NULL REFERENCES prodotti_carburante(id),
    litri           DECIMAL(12,2) DEFAULT 0,
    prezzo_pompa    DECIMAL(8,5),
    importo         DECIMAL(12,2) DEFAULT 0,
    costo_medio_ref DECIMAL(10,6),
    created_at      TIMESTAMPTZ DEFAULT now(),

    UNIQUE(vendita_id, prodotto_id)
);

-- ============================================================
-- STEP 9: CONGUAGLI ENI
-- Note credito/debito su materia prima a fine mese
-- ============================================================

CREATE TABLE conguagli_eni (
    id              BIGSERIAL PRIMARY KEY,
    prodotto_id     TEXT NOT NULL REFERENCES prodotti_carburante(id),
    data            DATE NOT NULL,
    importo_mp      DECIMAL(12,2) NOT NULL,
    note            TEXT,
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- STEP 10: RIMBORSI STATO (Progetto Carburante)
-- ============================================================

CREATE TABLE rimborsi_stato (
    id              BIGSERIAL PRIMARY KEY,
    prodotto_id     TEXT,
    data            DATE NOT NULL,
    importo         DECIMAL(12,2) NOT NULL,
    periodo_rif     TEXT,
    note            TEXT,
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- STEP 11: CONFIGURAZIONE GENERALE
-- ============================================================

CREATE TABLE config_carburanti (
    chiave          TEXT PRIMARY KEY,
    valore          TEXT NOT NULL,
    updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Valori default
INSERT INTO config_carburanti (chiave, valore) VALUES
    ('margine_target', '0.05'),
    ('aliquota_monofase', '0.21'),
    ('codice_coe', 'SM 30756'),
    ('ragione_sociale', 'CERVELLINI ANDREA'),
    ('email_destinatario', ''),
    ('email_mittente', ''),
    ('storno_pc', '0.0522');

-- ============================================================
-- STEP 12: INDICI
-- ============================================================

CREATE INDEX idx_accise_prodotto ON accise_storico(prodotto_id, data_inizio);
CREATE INDEX idx_carichi_prodotto ON carichi_carburante(prodotto_id, data);
CREATE INDEX idx_carichi_data ON carichi_carburante(data);
CREATE INDEX idx_prezzi_prodotto ON prezzi_pompa(prodotto_id, data_inizio);
CREATE INDEX idx_vendite_data ON vendite_giornaliere(data_inizio);
CREATE INDEX idx_vendite_prod ON vendite_per_prodotto(vendita_id);
CREATE INDEX idx_conguagli_prod ON conguagli_eni(prodotto_id, data);
CREATE INDEX idx_rimborsi_data ON rimborsi_stato(data);

-- ============================================================
-- STEP 13: RLS (Row Level Security)
-- ============================================================

ALTER TABLE prodotti_carburante ENABLE ROW LEVEL SECURITY;
ALTER TABLE accise_storico ENABLE ROW LEVEL SECURITY;
ALTER TABLE giacenze_iniziali ENABLE ROW LEVEL SECURITY;
ALTER TABLE carichi_carburante ENABLE ROW LEVEL SECURITY;
ALTER TABLE prezzi_pompa ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendite_giornaliere ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendite_per_prodotto ENABLE ROW LEVEL SECURITY;
ALTER TABLE conguagli_eni ENABLE ROW LEVEL SECURITY;
ALTER TABLE rimborsi_stato ENABLE ROW LEVEL SECURITY;
ALTER TABLE config_carburanti ENABLE ROW LEVEL SECURITY;

CREATE POLICY "full_access_prodotti" ON prodotti_carburante FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "full_access_accise" ON accise_storico FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "full_access_giacenze" ON giacenze_iniziali FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "full_access_carichi" ON carichi_carburante FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "full_access_prezzi" ON prezzi_pompa FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "full_access_vendite" ON vendite_giornaliere FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "full_access_vendite_prod" ON vendite_per_prodotto FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "full_access_conguagli" ON conguagli_eni FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "full_access_rimborsi" ON rimborsi_stato FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "full_access_config" ON config_carburanti FOR ALL USING (true) WITH CHECK (true);
