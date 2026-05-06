-- ============================================================
-- Fix scadenze fatture aprile 2026 secondo la nuova regola
--   RID_SDD  -> 15 del mese successivo al mese_riferimento
--   altro    -> ultimo giorno del mese successivo al mese_riferimento
-- Esempio per fatture aprile (mese_riferimento=4, anno=2026):
--   RID  -> 15/05/2026
--   altri -> 31/05/2026
-- ============================================================

-- STEP 1: PREVIEW (vedere cosa cambia, NON modifica nulla)
SELECT
    numero_formattato,
    cliente_id,
    modalita_pagamento,
    data_emissione,
    data_scadenza AS scadenza_attuale,
    CASE
        WHEN modalita_pagamento = 'RID_SDD'
            THEN (make_date(anno_riferimento, mese_riferimento, 1) + interval '1 month' + interval '14 days')::date
        ELSE (make_date(anno_riferimento, mese_riferimento, 1) + interval '2 months' - interval '1 day')::date
    END AS scadenza_nuova
FROM fatture
WHERE tipo = 'RIEPILOGATIVA_ENI'
  AND stato = 'EMESSA'
  AND mese_riferimento = 4
  AND anno_riferimento = 2026
ORDER BY numero_formattato;

-- ============================================================
-- STEP 2: UPDATE (eseguire dopo aver verificato la preview)
-- ============================================================

BEGIN;

UPDATE fatture
SET data_scadenza = CASE
        WHEN modalita_pagamento = 'RID_SDD'
            THEN (make_date(anno_riferimento, mese_riferimento, 1) + interval '1 month' + interval '14 days')::date
        ELSE (make_date(anno_riferimento, mese_riferimento, 1) + interval '2 months' - interval '1 day')::date
    END,
    updated_at = NOW()
WHERE tipo = 'RIEPILOGATIVA_ENI'
  AND stato = 'EMESSA'
  AND mese_riferimento = 4
  AND anno_riferimento = 2026;

COMMIT;

-- Verifica finale
SELECT numero_formattato, modalita_pagamento, data_emissione, data_scadenza
FROM fatture
WHERE tipo = 'RIEPILOGATIVA_ENI'
  AND stato = 'EMESSA'
  AND mese_riferimento = 4
  AND anno_riferimento = 2026
ORDER BY numero_formattato;
