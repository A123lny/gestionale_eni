-- ============================================================
-- Migration 005: Buoni incassati in Cassa
-- Aggiunge colonne per tracciare buoni cartacei Titanwash e
-- wallet digitale come forme di incasso nella chiusura giornaliera
-- ============================================================

ALTER TABLE cassa
    ADD COLUMN IF NOT EXISTS incasso_buoni_cartacei DECIMAL(10,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS incasso_wallet_digitale DECIMAL(10,2) DEFAULT 0;
