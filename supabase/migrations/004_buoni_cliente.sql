-- ============================================================
-- Migration 004: Associazione buoni cartacei a cliente
-- Aggiunge FK cliente_id alla tabella buoni_cartacei
-- ============================================================

-- Colonna nullable per compatibilità con buoni già generati
ALTER TABLE buoni_cartacei
  ADD COLUMN IF NOT EXISTS cliente_id UUID REFERENCES clienti(id);

-- Indice per ricerche rapide per cliente
CREATE INDEX IF NOT EXISTS idx_buoni_cartacei_cliente
  ON buoni_cartacei(cliente_id);
