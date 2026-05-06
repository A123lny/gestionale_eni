-- ============================================================
-- Elimina tutte le bozze RIEPILOGATIVA_ENI di aprile 2026
-- Eseguire nell'editor SQL di Supabase
-- ============================================================

-- STEP 1: PREVIEW (eseguire da solo per vedere cosa verra' cancellato)
SELECT id, numero_formattato, cliente_id, totale, stato
FROM fatture
WHERE tipo = 'RIEPILOGATIVA_ENI'
  AND stato = 'BOZZA'
  AND mese_riferimento = 4
  AND anno_riferimento = 2026
ORDER BY numero_formattato;

-- ============================================================
-- STEP 2: ELIMINAZIONE (eseguire dopo aver verificato la preview)
-- Selezionare e lanciare TUTTO il blocco BEGIN..COMMIT insieme
-- ============================================================

BEGIN;

-- 2a. Cancella movimenti dettaglio
DELETE FROM fatture_movimenti
WHERE fattura_id IN (
    SELECT id FROM fatture
    WHERE tipo = 'RIEPILOGATIVA_ENI'
      AND stato = 'BOZZA'
      AND mese_riferimento = 4
      AND anno_riferimento = 2026
);

-- 2b. Cancella righe fattura
DELETE FROM fatture_righe
WHERE fattura_id IN (
    SELECT id FROM fatture
    WHERE tipo = 'RIEPILOGATIVA_ENI'
      AND stato = 'BOZZA'
      AND mese_riferimento = 4
      AND anno_riferimento = 2026
);

-- 2c. Cancella le fatture
DELETE FROM fatture
WHERE tipo = 'RIEPILOGATIVA_ENI'
  AND stato = 'BOZZA'
  AND mese_riferimento = 4
  AND anno_riferimento = 2026;

COMMIT;

-- Se qualcosa va storto prima del COMMIT, lancia: ROLLBACK;
