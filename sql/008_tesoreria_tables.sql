-- ============================================================
-- TITANWASH - Tabelle Tesoreria (Cash Flow)
-- Gestione flussi di cassa, movimenti banca, pagamenti
-- ============================================================

-- 1. Categorie Tesoreria
CREATE TABLE IF NOT EXISTS categorie_tesoreria (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    nome text NOT NULL UNIQUE,
    tipo text NOT NULL CHECK (tipo IN ('entrata', 'uscita', 'entrambi')),
    icona text,
    ordine integer DEFAULT 0,
    created_at timestamptz DEFAULT now()
);

-- Categorie predefinite
INSERT INTO categorie_tesoreria (nome, tipo, icona, ordine) VALUES
    ('Affitto', 'uscita', '🏠', 1),
    ('Stipendi', 'uscita', '👷', 2),
    ('Utenze', 'uscita', '💡', 3),
    ('Tasse/Contributi', 'uscita', '🏛️', 4),
    ('Assicurazioni', 'uscita', '🛡️', 5),
    ('Fornitori', 'uscita', '📦', 6),
    ('Manutenzione', 'uscita', '🔧', 7),
    ('Carburante (acquisto)', 'uscita', '⛽', 8),
    ('Incassi giornalieri', 'entrata', '💰', 9),
    ('Bonifici clienti', 'entrata', '🏦', 10),
    ('Rimborsi', 'entrata', '↩️', 11),
    ('Altro', 'entrambi', '📋', 99)
ON CONFLICT (nome) DO NOTHING;

-- 2. Movimenti Banca (importati da CSV/Excel)
CREATE TABLE IF NOT EXISTS movimenti_banca (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    data_operazione date NOT NULL,
    data_valuta date,
    descrizione text NOT NULL,
    importo numeric(12,2) NOT NULL,
    saldo_progressivo numeric(12,2),
    banca text NOT NULL CHECK (banca IN ('carisp', 'bsi')),
    categoria text,
    hash_movimento text NOT NULL UNIQUE,
    file_origine text,
    created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_movimenti_banca_data ON movimenti_banca(data_operazione);
CREATE INDEX IF NOT EXISTS idx_movimenti_banca_banca ON movimenti_banca(banca);
CREATE INDEX IF NOT EXISTS idx_movimenti_banca_hash ON movimenti_banca(hash_movimento);

-- 3. Pagamenti Ricorrenti
CREATE TABLE IF NOT EXISTS pagamenti_ricorrenti (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    descrizione text NOT NULL,
    importo numeric(12,2) NOT NULL,
    tipo text NOT NULL CHECK (tipo IN ('entrata', 'uscita')),
    frequenza text NOT NULL CHECK (frequenza IN ('mensile', 'trimestrale', 'semestrale', 'annuale')),
    giorno_scadenza integer NOT NULL CHECK (giorno_scadenza BETWEEN 1 AND 31),
    mese_riferimento integer[],
    categoria text,
    attivo boolean DEFAULT true,
    data_inizio date NOT NULL,
    data_fine date,
    note text,
    created_at timestamptz DEFAULT now()
);

-- 4. Pagamenti Programmati (one-time)
CREATE TABLE IF NOT EXISTS pagamenti_programmati (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    descrizione text NOT NULL,
    importo numeric(12,2) NOT NULL,
    tipo text NOT NULL CHECK (tipo IN ('entrata', 'uscita')),
    data_scadenza date NOT NULL,
    stato text DEFAULT 'programmato' CHECK (stato IN ('programmato', 'pagato', 'annullato')),
    categoria text,
    note text,
    data_pagamento date,
    created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pagamenti_programmati_scadenza ON pagamenti_programmati(data_scadenza);
CREATE INDEX IF NOT EXISTS idx_pagamenti_programmati_stato ON pagamenti_programmati(stato);

-- RLS policies (permetti tutto per anon, come nelle altre tabelle del progetto)
ALTER TABLE categorie_tesoreria ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimenti_banca ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagamenti_ricorrenti ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagamenti_programmati ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for categorie_tesoreria" ON categorie_tesoreria;
DROP POLICY IF EXISTS "Allow all for movimenti_banca" ON movimenti_banca;
DROP POLICY IF EXISTS "Allow all for pagamenti_ricorrenti" ON pagamenti_ricorrenti;
DROP POLICY IF EXISTS "Allow all for pagamenti_programmati" ON pagamenti_programmati;

CREATE POLICY "Allow all for categorie_tesoreria" ON categorie_tesoreria FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for movimenti_banca" ON movimenti_banca FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for pagamenti_ricorrenti" ON pagamenti_ricorrenti FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for pagamenti_programmati" ON pagamenti_programmati FOR ALL USING (true) WITH CHECK (true);
