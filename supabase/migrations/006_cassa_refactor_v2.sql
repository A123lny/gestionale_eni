-- ============================================================
-- Migration 006: Cassa Refactor V2
-- 4TSCARD crediti, fondo informativo, buoni ENI desc, audit
-- Date: 2026-03-03
-- ============================================================

-- 1. 4TSCARD: slot dinamici per addebiti tessere fidelity (CREDITI)
ALTER TABLE cassa
    ADD COLUMN IF NOT EXISTS crediti_4tscard JSONB DEFAULT '[]'::jsonb;

-- 2. Descrizione buoni ENI carburante
ALTER TABLE cassa
    ADD COLUMN IF NOT EXISTS crediti_buoni_eni_desc TEXT DEFAULT NULL;

-- 3. Versione formula per distinguere vecchia (1: fondo sottratto) da nuova (2: fondo informativo)
ALTER TABLE cassa
    ADD COLUMN IF NOT EXISTS formula_versione SMALLINT DEFAULT 1;

-- 4. Timestamp modifica per audit trail
ALTER TABLE cassa
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- 5. Indice per query su modifiche
CREATE INDEX IF NOT EXISTS idx_cassa_updated ON cassa(updated_at);
