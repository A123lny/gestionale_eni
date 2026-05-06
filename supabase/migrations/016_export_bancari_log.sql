-- ============================================================
-- 016 — Log export bancari (RID/RIBA)
-- Traccia ogni esportazione effettuata verso la banca per evitare
-- doppi caricamenti. Una riga per coppia (tipo, mese, anno).
-- ============================================================

CREATE TABLE IF NOT EXISTS export_bancari_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo            VARCHAR(10) NOT NULL CHECK (tipo IN ('RID', 'RIBA')),
    mese            INT NOT NULL,
    anno            INT NOT NULL,
    prima_export_at TIMESTAMPTZ DEFAULT NOW(),
    ultima_export_at TIMESTAMPTZ DEFAULT NOW(),
    num_export      INT DEFAULT 1,
    num_disposizioni INT,
    totale          DECIMAL(12,2),
    banca_iban      TEXT,
    fatture_ids     UUID[],
    UNIQUE (tipo, mese, anno)
);

CREATE INDEX IF NOT EXISTS idx_export_log_periodo ON export_bancari_log(anno, mese, tipo);

ALTER TABLE export_bancari_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Accesso completo export_bancari_log" ON export_bancari_log;
CREATE POLICY "Accesso completo export_bancari_log"
    ON export_bancari_log FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE export_bancari_log IS
    'Log delle esportazioni RIBA/RID verso la banca. Una riga per coppia (tipo, mese, anno). num_export viene incrementato a ogni riscarica.';
