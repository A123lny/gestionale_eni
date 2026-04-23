-- ============================================================
-- 010: Tipo Fornitore + Numerazione Ricevute separata
-- ============================================================

-- 1. Aggiungere tipo Fornitore ai clienti
ALTER TABLE clienti DROP CONSTRAINT IF EXISTS clienti_tipo_check;
ALTER TABLE clienti ADD CONSTRAINT clienti_tipo_check
    CHECK (tipo IN ('Corporate', 'Privato', 'Fornitore'));

-- 2. Aggiungere tipo_documento alle fatture (FATTURA o RICEVUTA)
ALTER TABLE fatture ADD COLUMN IF NOT EXISTS tipo_documento VARCHAR(20) DEFAULT 'FATTURA'
    CHECK (tipo_documento IN ('FATTURA', 'RICEVUTA'));

-- 3. Aggiornare progressivo per supportare due sequenze (fatture + ricevute)
-- Aggiungiamo colonna tipo_documento alla PK
ALTER TABLE fatturazione_progressivo ADD COLUMN IF NOT EXISTS tipo_documento VARCHAR(20) DEFAULT 'FATTURA';
-- Rimuoviamo PK originale (solo anno) e la ricreiamo composita
ALTER TABLE fatturazione_progressivo DROP CONSTRAINT IF EXISTS fatturazione_progressivo_pkey;
ALTER TABLE fatturazione_progressivo ADD PRIMARY KEY (anno, tipo_documento);

-- 4. Aggiornare unique su fatture per includere tipo_documento
ALTER TABLE fatture DROP CONSTRAINT IF EXISTS fatture_anno_numero_key;
DO $$ BEGIN
    ALTER TABLE fatture ADD CONSTRAINT fatture_anno_numero_tipo_key UNIQUE (anno, numero, tipo_documento);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- 5. RPC per numero ricevuta (parallela a fattura)
CREATE OR REPLACE FUNCTION get_prossimo_numero_documento(p_anno INT, p_tipo VARCHAR DEFAULT 'FATTURA')
RETURNS INT AS $$
DECLARE
    v_numero INT;
BEGIN
    INSERT INTO fatturazione_progressivo(anno, tipo_documento, ultimo_numero)
        VALUES (p_anno, p_tipo, 1)
        ON CONFLICT (anno, tipo_documento) DO UPDATE
        SET ultimo_numero = fatturazione_progressivo.ultimo_numero + 1,
            updated_at = NOW()
        RETURNING ultimo_numero INTO v_numero;
    RETURN v_numero;
END;
$$ LANGUAGE plpgsql;
