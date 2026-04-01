-- ============================================================
-- CHIUSURE MENSILI CARBURANTE
-- Snapshot mensile per ogni prodotto carburante
-- Permette conteggio margini per mese e ripartenza pulita
-- ============================================================

CREATE TABLE IF NOT EXISTS chiusure_mensili_carburante (
    id                  BIGSERIAL PRIMARY KEY,
    prodotto_id         TEXT NOT NULL REFERENCES prodotti_carburante(id),
    anno                INTEGER NOT NULL,
    mese                INTEGER NOT NULL CHECK(mese BETWEEN 1 AND 12),
    -- Inventario
    giacenza_inizio     DECIMAL(12,2) DEFAULT 0,
    giacenza_teorica    DECIMAL(12,2) DEFAULT 0,
    giacenza_reale      DECIMAL(12,2) DEFAULT 0,
    scarto              DECIMAL(12,2) DEFAULT 0,
    costo_medio         DECIMAL(10,6) DEFAULT 0,
    -- Movimenti del mese
    litri_caricati      DECIMAL(12,2) DEFAULT 0,
    litri_venduti       DECIMAL(12,2) DEFAULT 0,
    -- Economico
    margine_totale      DECIMAL(12,2) DEFAULT 0,
    margine_medio_lt    DECIMAL(10,6) DEFAULT 0,
    pc_maturato         DECIMAL(12,2) DEFAULT 0,
    -- Meta
    note                TEXT,
    created_at          TIMESTAMPTZ DEFAULT now(),
    UNIQUE(prodotto_id, anno, mese)
);

CREATE INDEX IF NOT EXISTS idx_chiusure_mensili_periodo ON chiusure_mensili_carburante(anno, mese);
CREATE INDEX IF NOT EXISTS idx_chiusure_mensili_prodotto ON chiusure_mensili_carburante(prodotto_id, anno, mese);

ALTER TABLE chiusure_mensili_carburante ENABLE ROW LEVEL SECURITY;
CREATE POLICY "full_access_chiusure_mensili" ON chiusure_mensili_carburante FOR ALL USING (true) WITH CHECK (true);
