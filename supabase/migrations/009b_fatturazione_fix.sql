-- ============================================================
-- FIX: Aggiornamenti post-009_fatturazione.sql
-- Usa IF NOT EXISTS / IF EXISTS per idempotenza
-- ============================================================

-- Aggiorna CHECK modalita_pagamento (aggiunge FINE_MESE)
ALTER TABLE fatture DROP CONSTRAINT IF EXISTS fatture_modalita_pagamento_check;
ALTER TABLE fatture ADD CONSTRAINT fatture_modalita_pagamento_check
    CHECK (modalita_pagamento IN ('RIBA','RID_SDD','BONIFICO','CONTANTI','FINE_MESE'));

ALTER TABLE clienti DROP CONSTRAINT IF EXISTS clienti_modalita_pagamento_fattura_check;
ALTER TABLE clienti ADD CONSTRAINT clienti_modalita_pagamento_fattura_check
    CHECK (modalita_pagamento_fattura IN ('RIBA','RID_SDD','BONIFICO','CONTANTI','FINE_MESE'));

-- IBAN multipli emittente (array JSON: [{banca, iban}])
ALTER TABLE impostazioni_fatturazione ADD COLUMN IF NOT EXISTS iban_lista JSONB DEFAULT '[]'::JSONB;
