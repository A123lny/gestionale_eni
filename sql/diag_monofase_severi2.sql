-- Elenca TUTTE le fatture ENI Giugno 2026 dei clienti "Severi*"
-- con litri carburante e le eventuali note gia' presenti.
-- Serve a: 1) individuare quella di "Severi Srl" (n. 238/2026)
--          2) vedere se una nota "Monofase" e' finita sulla fattura sbagliata.
SELECT
    fa.numero_formattato,
    c.nome_ragione_sociale,
    fa.stato,
    (SELECT COALESCE(SUM(r.quantita),0)
       FROM fatture_righe r
      WHERE r.fattura_id = fa.id AND r.categoria = 'CARBURANTE')          AS litri_carburante,
    (SELECT string_agg(r.descrizione, ' || ')
       FROM fatture_righe r
      WHERE r.fattura_id = fa.id AND r.categoria = 'NOTA')                AS note_presenti
FROM fatture fa
JOIN clienti c ON c.id = fa.cliente_id
WHERE c.nome_ragione_sociale ILIKE '%severi%'
  AND fa.tipo = 'RIEPILOGATIVA_ENI'
  AND fa.mese_riferimento = 6
  AND fa.anno_riferimento = 2026
ORDER BY c.nome_ragione_sociale;
