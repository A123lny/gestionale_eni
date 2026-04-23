-- ============================================================
-- GESTIONALE STAZIONE ENI - Modulo FATTURAZIONE
-- Regime monofase sammarinese (no IVA esposta)
-- Eseguire su Supabase SQL Editor
-- ============================================================

-- ============================================================
-- 1. ESTENSIONE TABELLA CLIENTI
-- Campi fiscali e di fatturazione
-- ============================================================
ALTER TABLE clienti
    ADD COLUMN IF NOT EXISTS sede_legale_indirizzo   VARCHAR(200),
    ADD COLUMN IF NOT EXISTS sede_legale_cap         VARCHAR(10),
    ADD COLUMN IF NOT EXISTS sede_legale_comune      VARCHAR(100),
    ADD COLUMN IF NOT EXISTS sede_legale_provincia   VARCHAR(10),
    ADD COLUMN IF NOT EXISTS sede_legale_nazione     VARCHAR(5) DEFAULT 'SM',
    ADD COLUMN IF NOT EXISTS codice_destinatario_sdi VARCHAR(10),
    ADD COLUMN IF NOT EXISTS pec                     VARCHAR(200),
    ADD COLUMN IF NOT EXISTS iban                    VARCHAR(40),
    ADD COLUMN IF NOT EXISTS modalita_pagamento_fattura VARCHAR(20)
        CHECK (modalita_pagamento_fattura IN ('RIBA','RID_SDD','BONIFICO','CONTANTI','FINE_MESE')),
    ADD COLUMN IF NOT EXISTS scadenza_giorni         INT DEFAULT 30,
    ADD COLUMN IF NOT EXISTS applica_monofase        BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS rif_amministrazione     VARCHAR(100),
    ADD COLUMN IF NOT EXISTS alias_import_eni        TEXT[] DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN IF NOT EXISTS id_cliente_eni          VARCHAR(30),
    ADD COLUMN IF NOT EXISTS note_fatturazione       TEXT;

CREATE INDEX IF NOT EXISTS idx_clienti_alias_eni ON clienti USING GIN (alias_import_eni);
CREATE INDEX IF NOT EXISTS idx_clienti_id_eni ON clienti(id_cliente_eni) WHERE id_cliente_eni IS NOT NULL;

-- ============================================================
-- 2. IMPOSTAZIONI FATTURAZIONE (singleton)
-- Dati emittente fattura (Cervellini Andrea)
-- ============================================================
CREATE TABLE IF NOT EXISTS impostazioni_fatturazione (
    id                        UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    ragione_sociale_emittente VARCHAR(200) NOT NULL,
    indirizzo                 VARCHAR(200),
    cap                       VARCHAR(10),
    comune                    VARCHAR(100),
    provincia                 VARCHAR(10),
    nazione                   VARCHAR(5) DEFAULT 'SM',
    coe_piva                  VARCHAR(30),
    iban_default              VARCHAR(40),
    logo_base64               TEXT,
    timbro_base64             TEXT,
    firma_base64              TEXT,
    scadenza_default_giorni   INT DEFAULT 30,
    note_piede_pagina         TEXT,
    singleton                 BOOLEAN DEFAULT true UNIQUE,
    updated_at                TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE impostazioni_fatturazione ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Accesso completo impostazioni_fatturazione"
    ON impostazioni_fatturazione FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- 3. PROGRESSIVO FATTURE (annuale atomico)
-- ============================================================
CREATE TABLE IF NOT EXISTS fatturazione_progressivo (
    anno            INT PRIMARY KEY,
    ultimo_numero   INT NOT NULL DEFAULT 0,
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE fatturazione_progressivo ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Accesso completo fatturazione_progressivo"
    ON fatturazione_progressivo FOR ALL USING (true) WITH CHECK (true);

-- RPC atomica per ottenere prossimo numero progressivo
CREATE OR REPLACE FUNCTION get_prossimo_numero_fattura(p_anno INT)
RETURNS INT AS $$
DECLARE
    v_numero INT;
BEGIN
    INSERT INTO fatturazione_progressivo(anno, ultimo_numero)
        VALUES (p_anno, 1)
        ON CONFLICT (anno) DO UPDATE
        SET ultimo_numero = fatturazione_progressivo.ultimo_numero + 1,
            updated_at = NOW()
        RETURNING ultimo_numero INTO v_numero;
    RETURN v_numero;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 4. LOG IMPORT ENI
-- Previene doppi import, traccia esecuzioni
-- ============================================================
CREATE TABLE IF NOT EXISTS import_eni_log (
    id                      UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    mese                    INT NOT NULL CHECK (mese BETWEEN 1 AND 12),
    anno                    INT NOT NULL,
    file_saldi_nome         VARCHAR(200),
    file_consuntivi_nome    VARCHAR(200),
    righe_saldi             INT DEFAULT 0,
    righe_consuntivi        INT DEFAULT 0,
    fatture_generate        INT DEFAULT 0,
    clienti_non_associati   INT DEFAULT 0,
    note                    TEXT,
    utente_id               UUID REFERENCES personale(id),
    created_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_import_eni_anno_mese ON import_eni_log(anno, mese);

ALTER TABLE import_eni_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Accesso completo import_eni_log"
    ON import_eni_log FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- 5. FATTURE
-- Documento fiscale emesso
-- ============================================================
CREATE TABLE IF NOT EXISTS fatture (
    id                      UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    numero                  INT NOT NULL,
    anno                    INT NOT NULL,
    numero_formattato       VARCHAR(30) NOT NULL,
    data_emissione          DATE NOT NULL,
    data_scadenza           DATE,
    cliente_id              UUID NOT NULL REFERENCES clienti(id),
    tipo                    VARCHAR(20) NOT NULL CHECK (tipo IN ('MANUALE','RIEPILOGATIVA_ENI')),
    mese_riferimento        INT CHECK (mese_riferimento BETWEEN 1 AND 12),
    anno_riferimento        INT,
    totale                  DECIMAL(12,2) NOT NULL DEFAULT 0,
    monofase_coefficiente   DECIMAL(8,4),
    monofase_importo        DECIMAL(12,2),
    monofase_mese           INT,
    monofase_anno           INT,
    modalita_pagamento      VARCHAR(20) CHECK (modalita_pagamento IN ('RIBA','RID_SDD','BONIFICO','CONTANTI','FINE_MESE')),
    iban_beneficiario       VARCHAR(40),
    stato                   VARCHAR(20) DEFAULT 'BOZZA' CHECK (stato IN ('BOZZA','EMESSA','PAGATA','ANNULLATA')),
    pdf_url                 TEXT,
    note                    TEXT,
    rif_amministrazione     VARCHAR(100),
    import_eni_log_id       UUID REFERENCES import_eni_log(id) ON DELETE SET NULL,
    utente_creazione        UUID REFERENCES personale(id),
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(anno, numero)
);

CREATE INDEX IF NOT EXISTS idx_fatture_cliente ON fatture(cliente_id);
CREATE INDEX IF NOT EXISTS idx_fatture_anno_mese ON fatture(anno_riferimento, mese_riferimento);
CREATE INDEX IF NOT EXISTS idx_fatture_stato ON fatture(stato);
CREATE INDEX IF NOT EXISTS idx_fatture_data ON fatture(data_emissione);

ALTER TABLE fatture ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Accesso completo fatture"
    ON fatture FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- 6. FATTURE_RIGHE
-- Righe aggregate della fattura (compaiono sul PDF pag.1)
-- ============================================================
CREATE TABLE IF NOT EXISTS fatture_righe (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    fattura_id      UUID NOT NULL REFERENCES fatture(id) ON DELETE CASCADE,
    ordine          INT DEFAULT 0,
    descrizione     VARCHAR(300) NOT NULL,
    quantita        DECIMAL(12,3) DEFAULT 1,
    unita_misura    VARCHAR(10) DEFAULT 'pz',
    prezzo_unitario DECIMAL(12,4) DEFAULT 0,
    importo         DECIMAL(12,2) NOT NULL DEFAULT 0,
    categoria       VARCHAR(20) CHECK (categoria IN ('CARBURANTE','LAVAGGIO','ACCESSORIO','ALTRO')),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fatture_righe_fattura ON fatture_righe(fattura_id);

ALTER TABLE fatture_righe ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Accesso completo fatture_righe"
    ON fatture_righe FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- 7. FATTURE_MOVIMENTI
-- Dettaglio analitico importato dal file consuntivi ENI
-- ============================================================
CREATE TABLE IF NOT EXISTS fatture_movimenti (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    fattura_id      UUID NOT NULL REFERENCES fatture(id) ON DELETE CASCADE,
    data_movimento  TIMESTAMPTZ NOT NULL,
    scontrino       VARCHAR(50),
    id_transazione  VARCHAR(50),
    targa           VARCHAR(50),
    autista         VARCHAR(100),
    num_carta       VARCHAR(50),
    prodotto        VARCHAR(100),
    tipo_servizio   VARCHAR(20),
    prezzo_unitario DECIMAL(12,4),
    volume          DECIMAL(12,3),
    importo         DECIMAL(12,2) NOT NULL DEFAULT 0,
    categoria       VARCHAR(20) CHECK (categoria IN ('CARBURANTE','LAVAGGIO','ACCESSORIO','ALTRO')),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fatture_mov_fattura ON fatture_movimenti(fattura_id);
CREATE INDEX IF NOT EXISTS idx_fatture_mov_data ON fatture_movimenti(data_movimento);

ALTER TABLE fatture_movimenti ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Accesso completo fatture_movimenti"
    ON fatture_movimenti FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- 8. STORAGE BUCKET (eseguire da dashboard o via API)
-- Per logo/timbro/firma/PDF fatture
-- ============================================================
-- Creare manualmente bucket: 'fatturazione' con public access

-- ============================================================
-- FINE MIGRAZIONE
-- ============================================================
