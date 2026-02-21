-- ============================================================
-- GESTIONALE ENI - Migrazione 002: Refactor Cassa
-- Data: 2026-02-20
-- ============================================================

-- 1. Aggiunge fondo_cassa e totale_spese alla tabella cassa
ALTER TABLE cassa
    ADD COLUMN IF NOT EXISTS fondo_cassa   DECIMAL(10,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS totale_spese  DECIMAL(10,2) DEFAULT 0;

-- 2. Rimuove colonne POS fisse (BSI e Carisp)
ALTER TABLE cassa
    DROP COLUMN IF EXISTS pos_bsi_terminale1,
    DROP COLUMN IF EXISTS pos_bsi_terminale2,
    DROP COLUMN IF EXISTS pos_bsi_pos1,
    DROP COLUMN IF EXISTS pos_bsi_smac,
    DROP COLUMN IF EXISTS pos_carisp_terminale1,
    DROP COLUMN IF EXISTS pos_carisp_terminale2;

-- 3. Aggiunge colonne JSONB per POS dinamici (BSI diviso per categoria)
ALTER TABLE cassa
    ADD COLUMN IF NOT EXISTS pos_bsi_carburante    JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS pos_bsi_lavaggi       JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS pos_bsi_accessori     JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS pos_carisp            JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS carta_azzurra         JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS altri_pagamenti_carta JSONB DEFAULT '[]'::jsonb;

-- 4. Nuova tabella: spese giornaliere in contanti
CREATE TABLE IF NOT EXISTS spese_cassa (
    id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    data                DATE NOT NULL,
    descrizione         VARCHAR(200) NOT NULL,
    importo             DECIMAL(10,2) NOT NULL CHECK (importo > 0),
    categoria           VARCHAR(50) DEFAULT 'Varie'
                        CHECK (categoria IN (
                            'Fornitore', 'Utenze', 'Carburante',
                            'Manutenzione', 'Personale', 'Varie', 'Altro'
                        )),
    note                TEXT,
    utente_inserimento  UUID REFERENCES personale(id),
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spese_cassa_data ON spese_cassa(data);
CREATE INDEX IF NOT EXISTS idx_spese_cassa_created ON spese_cassa(created_at DESC);
