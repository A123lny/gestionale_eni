-- ============================================================
-- TITANWASH - Tabelle per Marginalità Carburante
-- Eseguire su Supabase SQL Editor
-- ============================================================

-- 1. Parametri fiscali unificati (con storico)
-- Usata anche dal modulo Coefficiente Monofase
CREATE TABLE parametri_fiscali (
    id                  BIGSERIAL PRIMARY KEY,
    tipo                VARCHAR(30) NOT NULL,
    valore              DECIMAL(8,6) NOT NULL,
    data_inizio         DATE NOT NULL,
    data_fine           DATE,
    note                TEXT,
    created_at          TIMESTAMPTZ DEFAULT now(),

    CHECK(tipo IN ('aliquota_monofase', 'accisa_benzina', 'accisa_gasolio'))
);

-- Valori iniziali
INSERT INTO parametri_fiscali (tipo, valore, data_inizio, note) VALUES
    ('aliquota_monofase', 0.210000, '2024-01-01', 'IVA monofase 21%'),
    ('accisa_benzina', 0.852082, '2024-01-01', 'Accisa benzina + Blu Super'),
    ('accisa_gasolio', 0.648700, '2024-01-01', 'Accisa gasolio + Diesel+ (valore aggiornato)');

-- 2. Periodi di calcolo marginalità
CREATE TABLE periodi_marginalita (
    id                      BIGSERIAL PRIMARY KEY,
    anno                    INTEGER NOT NULL,
    mese                    INTEGER NOT NULL,
    stato                   VARCHAR(20) DEFAULT 'bozza',
    litri_venduti           DECIMAL(12,2) DEFAULT 0,
    totale_incassato        DECIMAL(12,2) DEFAULT 0,
    rimborso_stato          DECIMAL(12,2) DEFAULT 0,
    piu_servito             DECIMAL(12,2) DEFAULT 0,
    rimborso_cali           DECIMAL(12,2) DEFAULT 0,
    note_credito            DECIMAL(12,2) DEFAULT 0,
    note_debito             DECIMAL(12,2) DEFAULT 0,
    totale_costo_carichi    DECIMAL(12,2) DEFAULT 0,
    differenza_rimanenze    DECIMAL(12,2) DEFAULT 0,
    utile_mensile           DECIMAL(12,2) DEFAULT 0,
    margine_medio_litro     DECIMAL(12,4) DEFAULT 0,
    created_at              TIMESTAMPTZ DEFAULT now(),
    updated_at              TIMESTAMPTZ DEFAULT now(),

    UNIQUE(anno, mese),
    CHECK(mese BETWEEN 1 AND 12),
    CHECK(stato IN ('bozza', 'chiuso'))
);

-- 3. Rimanenze (iniziali e finali per ogni prodotto)
CREATE TABLE rimanenze (
    id                      BIGSERIAL PRIMARY KEY,
    periodo_id              BIGINT NOT NULL REFERENCES periodi_marginalita(id) ON DELETE CASCADE,
    tipo                    VARCHAR(10) NOT NULL,
    prodotto                VARCHAR(20) NOT NULL,
    litri_commerciali       DECIMAL(12,2) DEFAULT 0,
    prezzo_commerciale      DECIMAL(8,5) DEFAULT 0,
    litri_fiscali           DECIMAL(12,2) DEFAULT 0,
    monofase                DECIMAL(8,5) DEFAULT 0,
    prezzo_comm_pagato      DECIMAL(8,5) DEFAULT 0,
    costo_commerciale       DECIMAL(12,2) DEFAULT 0,
    costo_fiscale           DECIMAL(12,2) DEFAULT 0,
    costo_totale            DECIMAL(12,2) DEFAULT 0,
    created_at              TIMESTAMPTZ DEFAULT now(),

    CHECK(tipo IN ('iniziale', 'finale')),
    CHECK(prodotto IN ('benzina', 'gasolio', 'blu_super', 'diesel_plus')),
    UNIQUE(periodo_id, tipo, prodotto)
);

-- 4. Carichi (testata)
CREATE TABLE carichi (
    id                      BIGSERIAL PRIMARY KEY,
    periodo_id              BIGINT NOT NULL REFERENCES periodi_marginalita(id) ON DELETE CASCADE,
    numero_progressivo      INTEGER NOT NULL,
    data_carico             DATE NOT NULL,
    note                    TEXT,
    costo_totale_carico     DECIMAL(12,2) DEFAULT 0,
    created_at              TIMESTAMPTZ DEFAULT now(),

    UNIQUE(periodo_id, numero_progressivo)
);

-- 5. Dettaglio carico (4 righe prodotto per ogni carico)
CREATE TABLE dettaglio_carichi (
    id                      BIGSERIAL PRIMARY KEY,
    carico_id               BIGINT NOT NULL REFERENCES carichi(id) ON DELETE CASCADE,
    prodotto                VARCHAR(20) NOT NULL,
    litri_commerciali       DECIMAL(12,2) DEFAULT 0,
    prezzo_commerciale      DECIMAL(8,5) DEFAULT 0,
    litri_fiscali           DECIMAL(12,2) DEFAULT 0,
    monofase                DECIMAL(8,5) DEFAULT 0,
    prezzo_comm_pagato      DECIMAL(8,5) DEFAULT 0,
    costo_commerciale       DECIMAL(12,2) DEFAULT 0,
    costo_fiscale           DECIMAL(12,2) DEFAULT 0,
    costo_totale_prodotto   DECIMAL(12,2) DEFAULT 0,
    created_at              TIMESTAMPTZ DEFAULT now(),

    CHECK(prodotto IN ('benzina', 'gasolio', 'blu_super', 'diesel_plus')),
    UNIQUE(carico_id, prodotto)
);

-- 6. Indici per performance
CREATE INDEX idx_rimanenze_periodo ON rimanenze(periodo_id);
CREATE INDEX idx_carichi_periodo ON carichi(periodo_id);
CREATE INDEX idx_dettaglio_carico ON dettaglio_carichi(carico_id);
CREATE INDEX idx_parametri_tipo ON parametri_fiscali(tipo, data_inizio);
CREATE INDEX idx_periodi_anno_mese ON periodi_marginalita(anno, mese);

-- 7. RLS - accesso completo
ALTER TABLE parametri_fiscali ENABLE ROW LEVEL SECURITY;
ALTER TABLE periodi_marginalita ENABLE ROW LEVEL SECURITY;
ALTER TABLE rimanenze ENABLE ROW LEVEL SECURITY;
ALTER TABLE carichi ENABLE ROW LEVEL SECURITY;
ALTER TABLE dettaglio_carichi ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Accesso completo parametri_fiscali"
    ON parametri_fiscali FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Accesso completo periodi_marginalita"
    ON periodi_marginalita FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Accesso completo rimanenze"
    ON rimanenze FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Accesso completo carichi"
    ON carichi FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Accesso completo dettaglio_carichi"
    ON dettaglio_carichi FOR ALL USING (true) WITH CHECK (true);
