-- ============================================================
-- 017 — SMAC riepilogo mensile
-- Importazione del report mensile aggregato della carta SMAC
-- (San Marino) per riconciliazione contabile contro
-- venduto carburante e fatture emesse.
--
-- Il file CSV SMAC e' aggregato a livello mensile (una riga per
-- categoria, non transazionale), quindi una sola tabella con una
-- riga per (mese, anno).
-- ============================================================

CREATE TABLE IF NOT EXISTS smac_riepilogo (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mese            INT NOT NULL CHECK (mese BETWEEN 1 AND 12),
    anno            INT NOT NULL CHECK (anno BETWEEN 2020 AND 2100),
    data_inizio     DATE NOT NULL,
    data_fine       DATE NOT NULL,

    -- Sezione principale (carte fisiche)
    fis_num_ricarica         INT DEFAULT 0,
    fis_num_pagamento        INT DEFAULT 0,
    fis_num_fisco            INT DEFAULT 0,
    fis_num_totale           INT DEFAULT 0,
    fis_imp_ricarica         DECIMAL(12,2) DEFAULT 0,
    fis_imp_pagamento        DECIMAL(12,2) DEFAULT 0,
    fis_imp_pagamento_netto  DECIMAL(12,2) DEFAULT 0,
    fis_imp_fisco            DECIMAL(12,2) DEFAULT 0,
    fis_imp_totale           DECIMAL(12,2) DEFAULT 0,
    fis_sconto_ricarica      DECIMAL(12,2) DEFAULT 0,
    fis_sconto_pagamento     DECIMAL(12,2) DEFAULT 0,

    -- Sezione DEMATERIALIZZATE (carte digitali)
    dem_num_ricarica   INT DEFAULT 0,
    dem_num_pagamento  INT DEFAULT 0,
    dem_num_fisco      INT DEFAULT 0,
    dem_num_totale     INT DEFAULT 0,
    dem_imp_ricarica   DECIMAL(12,2) DEFAULT 0,
    dem_imp_pagamento  DECIMAL(12,2) DEFAULT 0,
    dem_imp_fisco      DECIMAL(12,2) DEFAULT 0,
    dem_imp_totale     DECIMAL(12,2) DEFAULT 0,

    -- Metadati import
    file_nome    VARCHAR(200),
    file_hash    VARCHAR(64),
    note         TEXT,
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE (mese, anno)
);

CREATE INDEX IF NOT EXISTS idx_smac_riepilogo_periodo ON smac_riepilogo(anno, mese);

ALTER TABLE smac_riepilogo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Accesso completo smac_riepilogo" ON smac_riepilogo;
CREATE POLICY "Accesso completo smac_riepilogo"
    ON smac_riepilogo FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE smac_riepilogo IS
    'Riepilogo mensile transato carta SMAC (San Marino). Una riga per (mese, anno). Importato da CSV aggregato. La somma fis_imp_ricarica + dem_imp_ricarica entra nel verdetto contabile contro (Venduto carburante - Fatture).';
