-- ============================================================
-- 014 — Tracking invio email per fattura
-- Sostituisce l'hack di scrittura della data di invio nel campo
-- "note" della fattura. Permette di filtrare le fatture
-- gia' spedite, mostrare un badge in elenco, e correlare invii
-- via messageId per debug futuro.
-- ============================================================

ALTER TABLE fatture
    ADD COLUMN IF NOT EXISTS email_inviata_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS email_message_id TEXT;

COMMENT ON COLUMN fatture.email_inviata_at IS
    'Timestamp del primo invio email. Null = mai inviata. Riassegnato anche su re-invio.';
COMMENT ON COLUMN fatture.email_message_id IS
    'Message-ID restituito dal server SMTP. Utile per correlare bounce / debug.';

CREATE INDEX IF NOT EXISTS idx_fatture_email_inviata_at ON fatture(email_inviata_at);
