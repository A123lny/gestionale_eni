-- ============================================================
-- MIGRAZIONE 003: Servizi Extra Lavaggi
-- ============================================================

-- Aggiunge colonna per servizi extra (JSONB array)
-- Formato: [{"nome": "Disinfettante/germicida", "prezzo": 10.00}, ...]
ALTER TABLE lavaggi ADD COLUMN IF NOT EXISTS servizi_extra JSONB DEFAULT '[]'::jsonb;
