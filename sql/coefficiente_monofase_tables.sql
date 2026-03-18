-- ============================================================
-- TITANWASH - Tabelle per Coefficiente Monofase Gasolio
-- Eseguire su Supabase SQL Editor
-- ============================================================

-- 1. Tabella fatture acquisto gasolio
CREATE TABLE fatture_acquisto_gasolio (
    id                      BIGSERIAL PRIMARY KEY,
    mese_riferimento        DATE NOT NULL,
    numero_progressivo      INTEGER NOT NULL,
    data_fattura            DATE NOT NULL,
    imponibile_fattura      DECIMAL(12,2) NOT NULL,
    litri_commerciali       INTEGER NOT NULL,
    litri_fiscali           INTEGER DEFAULT 0,
    accisa_per_litro        DECIMAL(6,5) NOT NULL DEFAULT 0.59320,
    monofase_iva_imponibile DECIMAL(12,4),
    monofase_iva_accisa     DECIMAL(12,6),
    totale_monofase         DECIMAL(12,6),
    monofase_media_per_lt   DECIMAL(8,4),
    created_at              TIMESTAMPTZ DEFAULT now(),

    UNIQUE(mese_riferimento, numero_progressivo),
    CHECK(numero_progressivo BETWEEN 1 AND 25),
    CHECK(litri_commerciali > 0)
);

-- 2. Tabella coefficiente monofase mensile
CREATE TABLE coefficiente_monofase_mensile (
    id                          BIGSERIAL PRIMARY KEY,
    mese_riferimento            DATE NOT NULL UNIQUE,
    anno                        INTEGER NOT NULL,
    mese                        INTEGER NOT NULL,
    nome_mese                   VARCHAR(20) NOT NULL,
    totale_imponibile           DECIMAL(12,2),
    totale_litri_commerciali    INTEGER,
    totale_monofase_iva_imp     DECIMAL(12,4),
    totale_monofase_iva_accisa  DECIMAL(12,6),
    totale_monofase             DECIMAL(12,6),
    coefficiente_monofase       DECIMAL(8,4),
    numero_fatture              INTEGER DEFAULT 0,
    stato                       VARCHAR(20) DEFAULT 'aperto',
    data_chiusura               TIMESTAMPTZ,
    created_at                  TIMESTAMPTZ DEFAULT now(),

    CHECK(mese BETWEEN 1 AND 12),
    CHECK(stato IN ('aperto', 'chiuso'))
);

-- 3. Indici per performance
CREATE INDEX idx_fatture_mese ON fatture_acquisto_gasolio(mese_riferimento);
CREATE INDEX idx_coeff_mese ON coefficiente_monofase_mensile(mese_riferimento);
CREATE INDEX idx_coeff_anno_mese ON coefficiente_monofase_mensile(anno, mese);

-- 4. RLS (Row Level Security) - abilita e consenti accesso autenticato
ALTER TABLE fatture_acquisto_gasolio ENABLE ROW LEVEL SECURITY;
ALTER TABLE coefficiente_monofase_mensile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Accesso completo fatture_acquisto_gasolio"
    ON fatture_acquisto_gasolio FOR ALL
    USING (true) WITH CHECK (true);

CREATE POLICY "Accesso completo coefficiente_monofase_mensile"
    ON coefficiente_monofase_mensile FOR ALL
    USING (true) WITH CHECK (true);
