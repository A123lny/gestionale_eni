-- ============================================================
-- FIX: Rinomina colonne impostazioni_fatturazione
-- Eseguire SOLO se hai già eseguito 009_fatturazione.sql
-- Se non l'hai ancora eseguito, usa direttamente 009 aggiornato
-- ============================================================

-- Rinomina partita_iva -> coe_piva
ALTER TABLE impostazioni_fatturazione RENAME COLUMN partita_iva TO coe_piva;

-- Rimuovi codice_fiscale emittente
ALTER TABLE impostazioni_fatturazione DROP COLUMN IF EXISTS codice_fiscale;

-- Rinomina url -> base64 per immagini
ALTER TABLE impostazioni_fatturazione RENAME COLUMN logo_url TO logo_base64;
ALTER TABLE impostazioni_fatturazione RENAME COLUMN timbro_url TO timbro_base64;
ALTER TABLE impostazioni_fatturazione RENAME COLUMN firma_url TO firma_base64;

-- Rimuovi codice_fiscale da clienti (non serve a San Marino)
ALTER TABLE clienti DROP COLUMN IF EXISTS codice_fiscale;

-- Aggiorna CHECK modalita_pagamento su fatture e clienti (aggiunge FINE_MESE)
ALTER TABLE fatture DROP CONSTRAINT IF EXISTS fatture_modalita_pagamento_check;
ALTER TABLE fatture ADD CONSTRAINT fatture_modalita_pagamento_check
    CHECK (modalita_pagamento IN ('RIBA','RID_SDD','BONIFICO','CONTANTI','FINE_MESE'));

ALTER TABLE clienti DROP CONSTRAINT IF EXISTS clienti_modalita_pagamento_fattura_check;
ALTER TABLE clienti ADD CONSTRAINT clienti_modalita_pagamento_fattura_check
    CHECK (modalita_pagamento_fattura IN ('RIBA','RID_SDD','BONIFICO','CONTANTI','FINE_MESE'));

-- IBAN multipli emittente (array JSON: [{banca, iban}])
ALTER TABLE impostazioni_fatturazione ADD COLUMN IF NOT EXISTS iban_lista JSONB DEFAULT '[]'::JSONB;
