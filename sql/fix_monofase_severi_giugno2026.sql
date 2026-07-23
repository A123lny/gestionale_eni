-- ============================================================
-- CORREZIONE monofase Giugno 2026 - clienti "Severi*"
--
-- Situazione: per omonimia una nota "Monofase" era finita sulla
-- fattura 243/2026 (Wonder Lab di Severi Andrea) invece che sulla
-- 238/2026 (Severi Srl).
--
-- Questo script:
--   1) RIMUOVE la nota monofase dalla fattura 243/2026 (Wonder Lab)
--   2) INSERISCE la nota monofase sulla fattura 238/2026 (Severi Srl)
--
-- Punta alle fatture per NUMERO esatto: nessuna ambiguita'.
-- Le note sono categoria NOTA / importo 0: il totale non cambia.
-- Eseguire nel pannello Supabase -> SQL Editor.
-- ============================================================

-- ---------- 1) RIMUOVI la nota dalla fattura sbagliata (243/2026) ----------
DELETE FROM fatture_righe r
USING fatture fa
WHERE r.fattura_id = fa.id
  AND fa.numero_formattato = '243/2026'
  AND r.categoria = 'NOTA'
  AND r.descrizione ILIKE 'Monofase%';

-- ---------- 2) INSERISCI la nota sulla fattura giusta (238/2026 - Severi Srl) ----------
WITH f AS (
    SELECT id FROM fatture WHERE numero_formattato = '238/2026' LIMIT 1
),
litri AS (
    SELECT COALESCE(SUM(r.quantita), 0) AS l
    FROM fatture_righe r JOIN f ON r.fattura_id = f.id
    WHERE r.categoria = 'CARBURANTE'
),
coeff AS (
    SELECT coefficiente_monofase AS c
    FROM coefficiente_monofase_mensile
    WHERE mese_riferimento = DATE '2026-06-01' LIMIT 1
),
ord AS (
    SELECT COALESCE(MAX(r.ordine), -1) + 1 AS o
    FROM fatture_righe r JOIN f ON r.fattura_id = f.id
)
INSERT INTO fatture_righe (fattura_id, ordine, descrizione, quantita, unita_misura, prezzo_unitario, importo, categoria)
SELECT f.id,
       ord.o,
       'Monofase Giugno € ' || replace(to_char(ROUND((litri.l * coeff.c)::numeric, 2), 'FM999999990.00'), '.', ','),
       0, '', 0, 0, 'NOTA'
FROM f, litri, coeff, ord
WHERE coeff.c IS NOT NULL
  AND litri.l > 0
  AND NOT EXISTS (
      SELECT 1 FROM fatture_righe r2
      WHERE r2.fattura_id = f.id
        AND r2.categoria = 'NOTA'
        AND r2.descrizione ILIKE 'Monofase%'
  );

-- ---------- 3) VERIFICA (esegui dopo, deve mostrare la nota su 238 e NULL su 243) ----------
SELECT fa.numero_formattato, c.nome_ragione_sociale,
       (SELECT string_agg(r.descrizione, ' || ')
          FROM fatture_righe r
         WHERE r.fattura_id = fa.id AND r.categoria = 'NOTA') AS note_presenti
FROM fatture fa
JOIN clienti c ON c.id = fa.cliente_id
WHERE fa.numero_formattato IN ('238/2026', '243/2026')
ORDER BY fa.numero_formattato;
