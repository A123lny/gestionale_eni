-- ============================================================
-- 013 — Voci ricorrenti in fattura per cliente
-- Permette di configurare per ogni cliente delle righe extra che
-- vengono aggiunte automaticamente durante l'import mensile ENI.
-- Esempio: forniture accessori non tracciate da ENI (lubrificanti,
-- AdBlue sfuso, ricariche, gadget) con importo fisso o variabile.
-- ============================================================

ALTER TABLE clienti
    ADD COLUMN IF NOT EXISTS voci_ricorrenti_fattura JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN clienti.voci_ricorrenti_fattura IS
    'Array di voci aggiunte automaticamente alle fatture riepilogative ENI di questo cliente. Schema elemento: {descrizione, importo, categoria (ACCESSORIO|ALTRO), unita_misura, quantita}';
