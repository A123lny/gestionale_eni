-- ============================================================
-- Migration 007: Cassa V3
-- Banconote per taglio, Super senza Piombo, cleanup carburanti
-- Date: 2026-03-05
-- ============================================================

-- 1. Banconote per taglio (sostituzione campo singolo contanti_banconote)
ALTER TABLE cassa
    ADD COLUMN IF NOT EXISTS banconote_5    SMALLINT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS banconote_10   SMALLINT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS banconote_20   SMALLINT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS banconote_50   SMALLINT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS banconote_100  SMALLINT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS banconote_200  SMALLINT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS banconote_500  SMALLINT DEFAULT 0;

-- 2. Rinomina benzina95 -> super senza piombo (colonne nuove, vecchie restano per storico)
ALTER TABLE cassa
    ADD COLUMN IF NOT EXISTS super_sp_litri DECIMAL(10,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS super_sp_euro  DECIMAL(10,2) DEFAULT 0;
