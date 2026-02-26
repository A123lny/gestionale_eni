-- ============================================================
-- MIGRAZIONE 003: Sistema Buoni (Cartacei + Digitali)
-- Data: 2026-02-26
-- ============================================================

-- Estensione per hashing password bcrypt
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- TABELLA: BUONI_CARTACEI
-- Buoni cartacei stampabili con barcode EAN-13
-- Uso singolo, tagli 5/10/20/50 EUR
-- ============================================================
CREATE TABLE IF NOT EXISTS buoni_cartacei (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    codice_ean VARCHAR(13) UNIQUE NOT NULL,
    taglio DECIMAL(10,2) NOT NULL CHECK (taglio IN (5.00, 10.00, 20.00, 50.00)),
    stato VARCHAR(20) DEFAULT 'attivo' CHECK (stato IN ('attivo', 'utilizzato', 'annullato')),
    lotto VARCHAR(30),
    -- Quando viene utilizzato
    vendita_id UUID REFERENCES vendite(id),
    utilizzato_at TIMESTAMPTZ,
    utilizzato_da UUID REFERENCES personale(id),
    -- Chi lo ha creato
    creato_da UUID REFERENCES personale(id),
    creato_nome VARCHAR(150),
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_buoni_cartacei_ean ON buoni_cartacei(codice_ean);
CREATE INDEX IF NOT EXISTS idx_buoni_cartacei_stato ON buoni_cartacei(stato);
CREATE INDEX IF NOT EXISTS idx_buoni_cartacei_lotto ON buoni_cartacei(lotto);
CREATE INDEX IF NOT EXISTS idx_buoni_cartacei_taglio ON buoni_cartacei(taglio);

-- ============================================================
-- TABELLA: CLIENTI_PORTALE
-- Account clienti per accesso area digitale (email + password)
-- ============================================================
CREATE TABLE IF NOT EXISTS clienti_portale (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    cliente_id UUID REFERENCES clienti(id),
    email VARCHAR(200) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    nome_display VARCHAR(200) NOT NULL,
    saldo DECIMAL(10,2) DEFAULT 0.00 NOT NULL CHECK (saldo >= 0),
    attivo BOOLEAN DEFAULT true,
    ultimo_accesso TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clienti_portale_email ON clienti_portale(email);
CREATE INDEX IF NOT EXISTS idx_clienti_portale_cliente ON clienti_portale(cliente_id);
CREATE INDEX IF NOT EXISTS idx_clienti_portale_attivo ON clienti_portale(attivo);

CREATE TRIGGER trg_clienti_portale_updated
    BEFORE UPDATE ON clienti_portale
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- TABELLA: MOVIMENTI_SALDO
-- Registro movimenti wallet digitale (ricariche + utilizzi)
-- ============================================================
CREATE TABLE IF NOT EXISTS movimenti_saldo (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    cliente_portale_id UUID NOT NULL REFERENCES clienti_portale(id),
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('ricarica', 'pagamento', 'rimborso', 'rettifica')),
    importo DECIMAL(10,2) NOT NULL,
    saldo_dopo DECIMAL(10,2) NOT NULL,
    riferimento_tipo VARCHAR(30),
    riferimento_id UUID,
    descrizione VARCHAR(300),
    operatore_id UUID REFERENCES personale(id),
    operatore_nome VARCHAR(150),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_movimenti_saldo_cliente ON movimenti_saldo(cliente_portale_id);
CREATE INDEX IF NOT EXISTS idx_movimenti_saldo_tipo ON movimenti_saldo(tipo);
CREATE INDEX IF NOT EXISTS idx_movimenti_saldo_created ON movimenti_saldo(created_at DESC);

-- ============================================================
-- TABELLA: PRENOTAZIONI_LAVAGGIO
-- Prenotazioni lavaggi dal portale cliente
-- ============================================================
CREATE TABLE IF NOT EXISTS prenotazioni_lavaggio (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    cliente_portale_id UUID NOT NULL REFERENCES clienti_portale(id),
    data_richiesta DATE NOT NULL,
    fascia_oraria VARCHAR(30) CHECK (fascia_oraria IN ('mattina', 'pomeriggio', 'qualsiasi')),
    tipo_lavaggio VARCHAR(50) NOT NULL,
    prezzo_previsto DECIMAL(10,2),
    veicolo VARCHAR(100),
    note TEXT,
    stato VARCHAR(20) DEFAULT 'in_attesa' CHECK (stato IN (
        'in_attesa', 'confermata', 'completata', 'rifiutata', 'annullata'
    )),
    lavaggio_id UUID REFERENCES lavaggi(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prenotazioni_cliente ON prenotazioni_lavaggio(cliente_portale_id);
CREATE INDEX IF NOT EXISTS idx_prenotazioni_data ON prenotazioni_lavaggio(data_richiesta);
CREATE INDEX IF NOT EXISTS idx_prenotazioni_stato ON prenotazioni_lavaggio(stato);

CREATE TRIGGER trg_prenotazioni_updated
    BEFORE UPDATE ON prenotazioni_lavaggio
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- MODIFICHE TABELLA VENDITE
-- Aggiungere colonne per buoni e wallet
-- ============================================================
ALTER TABLE vendite ADD COLUMN IF NOT EXISTS importo_buono DECIMAL(10,2) DEFAULT 0;
ALTER TABLE vendite ADD COLUMN IF NOT EXISTS buono_cartaceo_id UUID REFERENCES buoni_cartacei(id);
ALTER TABLE vendite ADD COLUMN IF NOT EXISTS cliente_portale_id UUID REFERENCES clienti_portale(id);
ALTER TABLE vendite ADD COLUMN IF NOT EXISTS importo_wallet DECIMAL(10,2) DEFAULT 0;

-- Aggiornare constraint metodo_pagamento
ALTER TABLE vendite DROP CONSTRAINT IF EXISTS vendite_metodo_pagamento_check;
ALTER TABLE vendite ADD CONSTRAINT vendite_metodo_pagamento_check
    CHECK (metodo_pagamento IN (
        'contanti', 'pos', 'misto',
        'buono_cartaceo', 'buono_cartaceo_misto',
        'wallet_digitale', 'wallet_misto'
    ));

-- ============================================================
-- RLS POLICIES
-- ============================================================
ALTER TABLE buoni_cartacei ENABLE ROW LEVEL SECURITY;
ALTER TABLE clienti_portale ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimenti_saldo ENABLE ROW LEVEL SECURITY;
ALTER TABLE prenotazioni_lavaggio ENABLE ROW LEVEL SECURITY;

CREATE POLICY "buoni_cartacei_all" ON buoni_cartacei FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "clienti_portale_all" ON clienti_portale FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "movimenti_saldo_all" ON movimenti_saldo FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "prenotazioni_lavaggio_all" ON prenotazioni_lavaggio FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- RPC: Login cliente con email + password
-- Usa pgcrypto per verifica bcrypt
-- ============================================================
CREATE OR REPLACE FUNCTION login_cliente(p_email TEXT, p_password TEXT)
RETURNS JSON AS $$
DECLARE
    v_record clienti_portale%ROWTYPE;
BEGIN
    SELECT * INTO v_record
    FROM clienti_portale
    WHERE email = LOWER(TRIM(p_email))
    AND attivo = true;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Credenziali non valide');
    END IF;

    IF v_record.password_hash = crypt(p_password, v_record.password_hash) THEN
        UPDATE clienti_portale SET ultimo_accesso = NOW() WHERE id = v_record.id;
        RETURN json_build_object(
            'success', true,
            'id', v_record.id,
            'email', v_record.email,
            'nome', v_record.nome_display,
            'saldo', v_record.saldo,
            'cliente_id', v_record.cliente_id
        );
    ELSE
        RETURN json_build_object('success', false, 'error', 'Credenziali non valide');
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- RPC: Crea account cliente (lato operatore)
-- ============================================================
CREATE OR REPLACE FUNCTION crea_cliente_portale(
    p_email TEXT,
    p_password TEXT,
    p_nome TEXT,
    p_cliente_id UUID DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    v_id UUID;
BEGIN
    IF LENGTH(TRIM(p_password)) < 6 THEN
        RETURN json_build_object('success', false, 'error', 'Password deve essere almeno 6 caratteri');
    END IF;

    IF EXISTS (SELECT 1 FROM clienti_portale WHERE email = LOWER(TRIM(p_email))) THEN
        RETURN json_build_object('success', false, 'error', 'Email gia registrata');
    END IF;

    INSERT INTO clienti_portale (email, password_hash, nome_display, cliente_id)
    VALUES (LOWER(TRIM(p_email)), crypt(p_password, gen_salt('bf', 10)), TRIM(p_nome), p_cliente_id)
    RETURNING id INTO v_id;

    RETURN json_build_object('success', true, 'id', v_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- RPC: Ricarica saldo cliente (operazione atomica)
-- ============================================================
CREATE OR REPLACE FUNCTION ricarica_saldo(
    p_cliente_portale_id UUID,
    p_importo DECIMAL,
    p_descrizione TEXT,
    p_operatore_id UUID,
    p_operatore_nome TEXT
)
RETURNS JSON AS $$
DECLARE
    v_nuovo_saldo DECIMAL;
BEGIN
    IF p_importo <= 0 THEN
        RETURN json_build_object('success', false, 'error', 'Importo deve essere positivo');
    END IF;

    UPDATE clienti_portale
    SET saldo = saldo + p_importo
    WHERE id = p_cliente_portale_id AND attivo = true
    RETURNING saldo INTO v_nuovo_saldo;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Cliente non trovato');
    END IF;

    INSERT INTO movimenti_saldo (
        cliente_portale_id, tipo, importo, saldo_dopo,
        descrizione, operatore_id, operatore_nome
    ) VALUES (
        p_cliente_portale_id, 'ricarica', p_importo, v_nuovo_saldo,
        COALESCE(p_descrizione, 'Ricarica saldo'), p_operatore_id, p_operatore_nome
    );

    RETURN json_build_object('success', true, 'nuovo_saldo', v_nuovo_saldo);
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- RPC: Deduci saldo cliente (per acquisti/lavaggi)
-- Con lock riga per evitare race condition
-- ============================================================
CREATE OR REPLACE FUNCTION deduci_saldo(
    p_cliente_portale_id UUID,
    p_importo DECIMAL,
    p_descrizione TEXT,
    p_riferimento_tipo TEXT DEFAULT NULL,
    p_riferimento_id UUID DEFAULT NULL,
    p_operatore_id UUID DEFAULT NULL,
    p_operatore_nome TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    v_saldo_attuale DECIMAL;
    v_nuovo_saldo DECIMAL;
BEGIN
    IF p_importo <= 0 THEN
        RETURN json_build_object('success', false, 'error', 'Importo deve essere positivo');
    END IF;

    SELECT saldo INTO v_saldo_attuale
    FROM clienti_portale
    WHERE id = p_cliente_portale_id AND attivo = true
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Cliente non trovato');
    END IF;

    IF v_saldo_attuale < p_importo THEN
        RETURN json_build_object('success', false, 'error', 'Saldo insufficiente', 'saldo_attuale', v_saldo_attuale);
    END IF;

    UPDATE clienti_portale
    SET saldo = saldo - p_importo
    WHERE id = p_cliente_portale_id
    RETURNING saldo INTO v_nuovo_saldo;

    INSERT INTO movimenti_saldo (
        cliente_portale_id, tipo, importo, saldo_dopo,
        riferimento_tipo, riferimento_id,
        descrizione, operatore_id, operatore_nome
    ) VALUES (
        p_cliente_portale_id, 'pagamento', -p_importo, v_nuovo_saldo,
        p_riferimento_tipo, p_riferimento_id,
        COALESCE(p_descrizione, 'Pagamento'), p_operatore_id, p_operatore_nome
    );

    RETURN json_build_object('success', true, 'nuovo_saldo', v_nuovo_saldo);
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- RPC: Cambia password cliente
-- ============================================================
CREATE OR REPLACE FUNCTION cambia_password_cliente(
    p_cliente_portale_id UUID,
    p_vecchia_password TEXT,
    p_nuova_password TEXT
)
RETURNS JSON AS $$
DECLARE
    v_hash TEXT;
BEGIN
    IF LENGTH(TRIM(p_nuova_password)) < 6 THEN
        RETURN json_build_object('success', false, 'error', 'Password deve essere almeno 6 caratteri');
    END IF;

    SELECT password_hash INTO v_hash
    FROM clienti_portale
    WHERE id = p_cliente_portale_id AND attivo = true;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Account non trovato');
    END IF;

    IF v_hash != crypt(p_vecchia_password, v_hash) THEN
        RETURN json_build_object('success', false, 'error', 'Password attuale non corretta');
    END IF;

    UPDATE clienti_portale
    SET password_hash = crypt(p_nuova_password, gen_salt('bf', 10))
    WHERE id = p_cliente_portale_id;

    RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
