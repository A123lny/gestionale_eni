-- ============================================================
-- 012: Campi per export RIBA/RID + impostazioni emittente bancario
-- ============================================================

-- 1. Nuovi campi anagrafica clienti per export bancario
ALTER TABLE clienti ADD COLUMN IF NOT EXISTS mandate_id VARCHAR(50);
ALTER TABLE clienti ADD COLUMN IF NOT EXISTS banca_appoggio VARCHAR(100);
ALTER TABLE clienti ADD COLUMN IF NOT EXISTS abi_banca VARCHAR(10);
ALTER TABLE clienti ADD COLUMN IF NOT EXISTS cab_banca VARCHAR(10);

-- 2. Campi emittente per generazione file bancari
ALTER TABLE impostazioni_fatturazione ADD COLUMN IF NOT EXISTS abi_emittente VARCHAR(10);
ALTER TABLE impostazioni_fatturazione ADD COLUMN IF NOT EXISTS cab_emittente VARCHAR(10);
ALTER TABLE impostazioni_fatturazione ADD COLUMN IF NOT EXISTS codice_cbi VARCHAR(20);
ALTER TABLE impostazioni_fatturazione ADD COLUMN IF NOT EXISTS codice_creditore_sdd VARCHAR(50);
ALTER TABLE impostazioni_fatturazione ADD COLUMN IF NOT EXISTS codice_fiscale_emittente VARCHAR(20);
