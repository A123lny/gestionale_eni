-- ============================================================
-- DIAGNOSTICA: perche' la riga monofase non viene inserita?
-- Esegui questa query e guarda i valori restituiti.
-- ============================================================
SELECT
    -- Quante fatture ENI di Severi per Giugno 2026 esistono (deve essere 1)
    (SELECT count(*)
       FROM fatture fa
       JOIN clienti c ON c.id = fa.cliente_id
      WHERE c.nome_ragione_sociale ILIKE '%severi%'
        AND fa.tipo = 'RIEPILOGATIVA_ENI'
        AND fa.mese_riferimento = 6
        AND fa.anno_riferimento = 2026)                       AS fatture_severi_giugno,

    -- Nome esatto del cliente in rubrica (per verificare il match)
    (SELECT string_agg(DISTINCT c.nome_ragione_sociale, ' | ')
       FROM clienti c
      WHERE c.nome_ragione_sociale ILIKE '%severi%')          AS clienti_severi,

    -- Litri carburante presenti sulla fattura (deve essere ~2388,75)
    (SELECT COALESCE(SUM(r.quantita), 0)
       FROM fatture_righe r
       JOIN fatture fa ON fa.id = r.fattura_id
       JOIN clienti c  ON c.id = fa.cliente_id
      WHERE c.nome_ragione_sociale ILIKE '%severi%'
        AND fa.tipo = 'RIEPILOGATIVA_ENI'
        AND fa.mese_riferimento = 6 AND fa.anno_riferimento = 2026
        AND r.categoria = 'CARBURANTE')                       AS litri_carburante,

    -- Coefficiente monofase di Giugno 2026 (NULL = non ancora caricato!)
    (SELECT coefficiente_monofase
       FROM coefficiente_monofase_mensile
      WHERE mese_riferimento = DATE '2026-06-01' LIMIT 1)     AS coeff_giugno,

    -- Tutti i mesi per cui esiste un coefficiente (per capire cosa c'e')
    (SELECT string_agg(mese_riferimento::text || '=' || COALESCE(coefficiente_monofase::text,'NULL'), ' | ' ORDER BY mese_riferimento)
       FROM coefficiente_monofase_mensile)                    AS coeff_disponibili;
