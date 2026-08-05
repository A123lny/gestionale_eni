-- ============================================================
-- 019 - RICEVUTE MANUALI
-- Permette di emettere una ricevuta dal form manuale anche a un
-- intestatario non presente in anagrafica (cliente occasionale).
-- ============================================================

-- Il cliente diventa opzionale
ALTER TABLE fatture ALTER COLUMN cliente_id DROP NOT NULL;

-- Intestazione libera (usata solo quando cliente_id è NULL)
ALTER TABLE fatture ADD COLUMN IF NOT EXISTS intestatario_nome VARCHAR(200);
ALTER TABLE fatture ADD COLUMN IF NOT EXISTS intestatario_indirizzo TEXT;
ALTER TABLE fatture ADD COLUMN IF NOT EXISTS intestatario_cf VARCHAR(30);

-- Un documento deve sempre avere un intestatario: anagrafica o libero
ALTER TABLE fatture DROP CONSTRAINT IF EXISTS fatture_intestatario_check;
ALTER TABLE fatture ADD CONSTRAINT fatture_intestatario_check
    CHECK (cliente_id IS NOT NULL OR intestatario_nome IS NOT NULL);

COMMENT ON COLUMN fatture.intestatario_nome IS 'Nominativo libero per documenti senza anagrafica cliente (ricevute occasionali)';
