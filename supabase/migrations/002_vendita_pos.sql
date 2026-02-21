-- ============================================================
-- MIGRAZIONE 002: Sistema POS Vendita
-- Aggiunge barcode a magazzino, nuove categorie, tabelle vendite/resi
-- Data: 2026-02-21
-- ============================================================

-- ============================================================
-- STEP 1: Aggiungere colonna barcode a magazzino
-- ============================================================
ALTER TABLE magazzino ADD COLUMN IF NOT EXISTS barcode VARCHAR(50);
CREATE INDEX IF NOT EXISTS idx_magazzino_barcode ON magazzino(barcode);

-- ============================================================
-- STEP 2: Aggiornare categorie magazzino
-- Rimuovere il vecchio CHECK e aggiungere il nuovo
-- ============================================================
ALTER TABLE magazzino DROP CONSTRAINT IF EXISTS magazzino_categoria_check;
ALTER TABLE magazzino ADD CONSTRAINT magazzino_categoria_check
    CHECK (categoria IN (
        'Accessori', 'Tergicristalli', 'Catene', 'Profumatori',
        'Uso interno', 'Oli e lubrificanti', 'Bar', 'Detailing',
        'AdBlue', 'Altro'
    ));

-- Migrare le vecchie categorie verso le nuove
UPDATE magazzino SET categoria = 'Accessori' WHERE categoria = 'Shop';
UPDATE magazzino SET categoria = 'Oli e lubrificanti' WHERE categoria = 'Olio';

-- ============================================================
-- STEP 3: Tabella VENDITE (transazioni / scontrini)
-- ============================================================
CREATE TABLE vendite (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    codice VARCHAR(20) UNIQUE NOT NULL,

    data DATE NOT NULL DEFAULT CURRENT_DATE,
    ora TIME NOT NULL DEFAULT CURRENT_TIME,

    -- Operatore
    operatore_id UUID REFERENCES personale(id),
    operatore_nome VARCHAR(150),

    -- Totali
    subtotale DECIMAL(10,2) NOT NULL DEFAULT 0,
    sconto_globale DECIMAL(10,2) DEFAULT 0,
    sconto_globale_tipo VARCHAR(12) DEFAULT 'fisso'
        CHECK (sconto_globale_tipo IN ('fisso', 'percentuale')),
    totale DECIMAL(10,2) NOT NULL DEFAULT 0,

    -- Pagamento
    metodo_pagamento VARCHAR(20) NOT NULL
        CHECK (metodo_pagamento IN ('contanti', 'pos', 'misto')),
    importo_contanti DECIMAL(10,2) DEFAULT 0,
    importo_pos DECIMAL(10,2) DEFAULT 0,
    resto DECIMAL(10,2) DEFAULT 0,

    -- Stato
    stato VARCHAR(20) DEFAULT 'completata'
        CHECK (stato IN ('completata', 'annullata', 'reso_parziale', 'reso_totale')),

    note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_vendite_data ON vendite(data);
CREATE INDEX idx_vendite_stato ON vendite(stato);
CREATE INDEX idx_vendite_operatore ON vendite(operatore_id);
CREATE INDEX idx_vendite_codice ON vendite(codice);

-- ============================================================
-- STEP 4: Tabella VENDITE_DETTAGLIO (righe dello scontrino)
-- ============================================================
CREATE TABLE vendite_dettaglio (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    vendita_id UUID NOT NULL REFERENCES vendite(id) ON DELETE CASCADE,

    -- Prodotto (snapshot al momento della vendita)
    prodotto_id UUID REFERENCES magazzino(id),
    codice_prodotto VARCHAR(50),
    barcode VARCHAR(50),
    nome_prodotto VARCHAR(200) NOT NULL,
    categoria VARCHAR(50),

    -- Importi
    quantita INT NOT NULL DEFAULT 1,
    prezzo_unitario DECIMAL(10,2) NOT NULL,
    sconto DECIMAL(10,2) DEFAULT 0,
    sconto_tipo VARCHAR(12) DEFAULT 'fisso'
        CHECK (sconto_tipo IN ('fisso', 'percentuale')),
    totale_riga DECIMAL(10,2) NOT NULL,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_vendite_dettaglio_vendita ON vendite_dettaglio(vendita_id);
CREATE INDEX idx_vendite_dettaglio_prodotto ON vendite_dettaglio(prodotto_id);

-- ============================================================
-- STEP 5: Tabella RESI
-- ============================================================
CREATE TABLE resi (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    codice VARCHAR(20) UNIQUE NOT NULL,

    vendita_id UUID NOT NULL REFERENCES vendite(id),
    vendita_codice VARCHAR(20),
    data DATE NOT NULL DEFAULT CURRENT_DATE,
    ora TIME NOT NULL DEFAULT CURRENT_TIME,

    -- Operatore
    operatore_id UUID REFERENCES personale(id),
    operatore_nome VARCHAR(150),

    -- Importi
    totale_reso DECIMAL(10,2) NOT NULL,
    metodo_rimborso VARCHAR(20) NOT NULL
        CHECK (metodo_rimborso IN ('contanti', 'pos')),

    note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE resi_dettaglio (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    reso_id UUID NOT NULL REFERENCES resi(id) ON DELETE CASCADE,
    vendita_dettaglio_id UUID REFERENCES vendite_dettaglio(id),

    prodotto_id UUID REFERENCES magazzino(id),
    nome_prodotto VARCHAR(200) NOT NULL,
    quantita_resa INT NOT NULL DEFAULT 1,
    prezzo_unitario DECIMAL(10,2) NOT NULL,
    totale_riga DECIMAL(10,2) NOT NULL,

    -- Se il prodotto va rimesso in stock
    riassortito BOOLEAN DEFAULT true,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_resi_vendita ON resi(vendita_id);
CREATE INDEX idx_resi_data ON resi(data);
CREATE INDEX idx_resi_dettaglio_reso ON resi_dettaglio(reso_id);

-- ============================================================
-- STEP 6: Nuove colonne cassa per categorie extra
-- ============================================================
ALTER TABLE cassa ADD COLUMN IF NOT EXISTS venduto_tergicristalli DECIMAL(10,2) DEFAULT 0;
ALTER TABLE cassa ADD COLUMN IF NOT EXISTS venduto_catene DECIMAL(10,2) DEFAULT 0;
ALTER TABLE cassa ADD COLUMN IF NOT EXISTS venduto_profumatori DECIMAL(10,2) DEFAULT 0;
ALTER TABLE cassa ADD COLUMN IF NOT EXISTS venduto_detailing DECIMAL(10,2) DEFAULT 0;
ALTER TABLE cassa ADD COLUMN IF NOT EXISTS venduto_uso_interno DECIMAL(10,2) DEFAULT 0;
ALTER TABLE cassa ADD COLUMN IF NOT EXISTS venduto_oli DECIMAL(10,2) DEFAULT 0;

-- Colonne per totale POS vendita (contanti e pos dal modulo vendita)
ALTER TABLE cassa ADD COLUMN IF NOT EXISTS pos_vendita_contanti DECIMAL(10,2) DEFAULT 0;
ALTER TABLE cassa ADD COLUMN IF NOT EXISTS pos_vendita_pos DECIMAL(10,2) DEFAULT 0;

-- ============================================================
-- STEP 7: Trigger updated_at per vendite (consistenza)
-- ============================================================
-- vendite sono immutabili (no update), ma per sicurezza:
-- Non servono trigger aggiuntivi.

-- ============================================================
-- STEP 8: RLS Policy (se Supabase ha RLS attivo)
-- Abilitare accesso anon a nuove tabelle
-- ============================================================
ALTER TABLE vendite ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendite_dettaglio ENABLE ROW LEVEL SECURITY;
ALTER TABLE resi ENABLE ROW LEVEL SECURITY;
ALTER TABLE resi_dettaglio ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vendite_all" ON vendite FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "vendite_dettaglio_all" ON vendite_dettaglio FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "resi_all" ON resi FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "resi_dettaglio_all" ON resi_dettaglio FOR ALL USING (true) WITH CHECK (true);
