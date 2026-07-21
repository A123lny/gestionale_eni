-- ============================================================
-- GESTIONALE STAZIONE ENI - Codici progressivi atomici
-- Fix: duplicate key su lavaggi_codice_key (e stessa classe di
-- bug latente su vendite, crediti, manutenzioni, resi)
-- Eseguire su Supabase SQL Editor
-- ============================================================
--
-- PROBLEMA
-- La vecchia generaCodice() lato client ordinava i codici come
-- TESTO (.order('codice', {ascending:false})). Con codici a
-- lunghezza variabile 'LAV999' > 'LAV1000', quindi superata quota
-- 999 il massimo restava per sempre LAV999 e veniva rigenerato
-- all'infinito LAV1000, gia' presente -> violazione dell'unique.
-- In piu' SELECT-max e INSERT erano due round-trip separati,
-- senza lock: due salvataggi simultanei ottenevano lo stesso codice.
--
-- SOLUZIONE
-- Tabella contatore + INSERT ... ON CONFLICT DO UPDATE ... RETURNING,
-- una singola istruzione atomica. Stesso pattern gia' in uso per la
-- fatturazione (get_prossimo_numero_documento, migration 010).
--
-- NOTA: il numero viene consumato anche se l'INSERT a valle fallisce,
-- quindi la numerazione puo' presentare salti. Accettato: e' un
-- identificativo interno, non un numero con valore fiscale.
-- ============================================================


-- ============================================================
-- 1. TABELLA CONTATORE
-- ============================================================
CREATE TABLE IF NOT EXISTS codici_progressivo (
    prefisso      TEXT PRIMARY KEY,
    ultimo_numero INT NOT NULL DEFAULT 0,
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE codici_progressivo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Accesso completo codici_progressivo" ON codici_progressivo;
CREATE POLICY "Accesso completo codici_progressivo"
    ON codici_progressivo FOR ALL USING (true) WITH CHECK (true);


-- ============================================================
-- 2. RPC ATOMICA
-- Al primo utilizzo di un prefisso il contatore viene inizializzato
-- (seed) col massimo NUMERICO gia' presente in tabella, cosi' la
-- numerazione riprende da dove si era interrotta e non ricomincia da 1.
--
-- SECURITY DEFINER: il seed deve poter leggere tutte le righe della
-- tabella di destinazione. Se RLS la nascondesse, il MAX tornerebbe 0
-- e si rigenererebbero codici gia' esistenti. Il rischio dei diritti
-- elevati e' contenuto dalla whitelist sotto: la funzione accetta solo
-- coppie prefisso/tabella note e la sola colonna 'codice'.
-- ============================================================
CREATE OR REPLACE FUNCTION get_prossimo_codice(
    p_prefisso TEXT,
    p_tabella  TEXT,
    p_colonna  TEXT DEFAULT 'codice'
)
RETURNS TEXT AS $$
DECLARE
    v_tabella_attesa TEXT;
    v_max            INT;
    v_numero         INT;
BEGIN
    -- --- Whitelist: p_tabella arriva dal client (anon key) ---
    v_tabella_attesa := CASE p_prefisso
        WHEN 'LAV' THEN 'lavaggi'
        WHEN 'CRE' THEN 'crediti'
        WHEN 'VEN' THEN 'vendite'
        WHEN 'MAN' THEN 'manutenzioni'
        WHEN 'RES' THEN 'resi'
        ELSE NULL
    END;

    IF v_tabella_attesa IS NULL OR v_tabella_attesa <> p_tabella THEN
        RAISE EXCEPTION 'Coppia prefisso/tabella non ammessa: % / %', p_prefisso, p_tabella;
    END IF;

    IF p_colonna <> 'codice' THEN
        RAISE EXCEPTION 'Colonna non ammessa: %', p_colonna;
    END IF;

    -- --- Seed una tantum dal massimo numerico esistente ---
    -- I codici fuori pattern producono NULL dal CAST e vengono
    -- ignorati da MAX: voluto.
    IF NOT EXISTS (SELECT 1 FROM codici_progressivo WHERE prefisso = p_prefisso) THEN
        EXECUTE format(
            'SELECT COALESCE(MAX(CAST(SUBSTRING(%I FROM %L) AS INT)), 0) FROM %I',
            p_colonna,
            '^' || p_prefisso || '([0-9]+)$',
            p_tabella
        ) INTO v_max;

        INSERT INTO codici_progressivo(prefisso, ultimo_numero)
            VALUES (p_prefisso, v_max)
            ON CONFLICT (prefisso) DO NOTHING;
    END IF;

    -- --- Incremento atomico ---
    -- Istruzione singola: Postgres prende un row lock e serializza
    -- i chiamanti concorrenti.
    INSERT INTO codici_progressivo(prefisso, ultimo_numero)
        VALUES (p_prefisso, 1)
        ON CONFLICT (prefisso) DO UPDATE
        SET ultimo_numero = codici_progressivo.ultimo_numero + 1,
            updated_at    = NOW()
        RETURNING ultimo_numero INTO v_numero;

    -- Padding a 3 cifre per preservare il formato storico (LAV001),
    -- ma SENZA troncare oltre le 999: LPAD in PostgreSQL taglia a
    -- destra se la stringa supera la lunghezza richiesta
    -- (LPAD('1001',3,'0') = '100'), percio' la lunghezza target e' il
    -- massimo tra 3 e le cifre effettive.
    -- codice e' VARCHAR(10): con prefisso a 3 lettere restano 7 cifre.
    RETURN p_prefisso || LPAD(v_numero::TEXT, GREATEST(3, LENGTH(v_numero::TEXT)), '0');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ============================================================
-- 3. NOTA SU genera_codice()
-- La funzione genera_codice() dichiarata nella migration 001 NON
-- risulta presente sul database (errore 42883 al primo tentativo di
-- commentarla): quella migration non e' mai stata applicata cosi'
-- com'e'. Era comunque codice morto - mai chiamata via .rpc() - e il
-- suo MAX+1 non era atomico. Nessuna azione necessaria.
-- ============================================================
