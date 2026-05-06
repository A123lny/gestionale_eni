-- ============================================================
-- 015 — Codice SIA per generazione RIBA (.car CBI)
-- Distinto dal codice CBI usato in RID (XML SEPA SDD).
-- Tipico valore: 'C43SF' (5 char). Lo usa il tracciato CBI .car
-- nei record header, footer e record 14 di ogni disposizione.
-- ============================================================

ALTER TABLE impostazioni_fatturazione
    ADD COLUMN IF NOT EXISTS codice_sia VARCHAR(10);

COMMENT ON COLUMN impostazioni_fatturazione.codice_sia IS
    'Codice SIA emittente per RIBA (5 char). Distinto da codice_cbi (8 char) usato in RID.';

-- Backfill default per record esistenti
UPDATE impostazioni_fatturazione
SET codice_sia = 'C43SF'
WHERE codice_sia IS NULL OR codice_sia = '';
