-- ============================================================
-- Elimina buoni cartacei "da stampare" (stato = 'attivo')
-- associati al cliente NUTRIGEA
-- Data: 2026-07-02
-- ============================================================
-- ATTENZIONE: elimina SOLO i buoni in stato 'attivo' (mai utilizzati).
-- I buoni gia' utilizzati vengono preservati per integrita' referenziale
-- con la tabella vendite.
-- ============================================================


-- ------------------------------------------------------------
-- STEP 1: ANTEPRIMA - controlla quali buoni verranno eliminati
-- ------------------------------------------------------------
-- Lancia PRIMA questa query per verificare i risultati.
-- Se il conteggio ti torna, procedi con lo STEP 2.
SELECT
    c.id                    AS cliente_id,
    c.nome_ragione_sociale  AS cliente,
    b.id                    AS buono_id,
    b.codice_ean,
    b.taglio,
    b.stato,
    b.lotto,
    b.created_at
FROM buoni_cartacei b
JOIN clienti c ON c.id = b.cliente_id
WHERE c.nome_ragione_sociale ILIKE '%nutrigea%'
  AND b.stato = 'attivo'
ORDER BY b.created_at DESC;

-- Conteggio riassuntivo per taglio
SELECT
    b.taglio,
    COUNT(*)          AS quanti,
    SUM(b.taglio)     AS valore_totale_eur
FROM buoni_cartacei b
JOIN clienti c ON c.id = b.cliente_id
WHERE c.nome_ragione_sociale ILIKE '%nutrigea%'
  AND b.stato = 'attivo'
GROUP BY b.taglio
ORDER BY b.taglio;


-- ------------------------------------------------------------
-- STEP 2: ELIMINAZIONE - esegui dentro transazione
-- ------------------------------------------------------------
-- Se lo STEP 1 conferma i risultati attesi, lancia questo blocco.
-- Ricordati di fare COMMIT alla fine (oppure ROLLBACK se sbagliato).

BEGIN;

DELETE FROM buoni_cartacei
WHERE stato = 'attivo'
  AND cliente_id IN (
      SELECT id FROM clienti
      WHERE nome_ragione_sociale ILIKE '%nutrigea%'
  );

-- Controlla quante righe sono state eliminate:
-- Supabase mostra il conteggio nell'output della query.

-- Se il conteggio e' quello atteso:
COMMIT;

-- Se qualcosa non torna, invece del COMMIT lancia:
-- ROLLBACK;


-- ------------------------------------------------------------
-- STEP 3: VERIFICA POST-ELIMINAZIONE
-- ------------------------------------------------------------
-- Deve restituire 0 righe.
SELECT COUNT(*) AS residui_attivi
FROM buoni_cartacei b
JOIN clienti c ON c.id = b.cliente_id
WHERE c.nome_ragione_sociale ILIKE '%nutrigea%'
  AND b.stato = 'attivo';

-- Riepilogo buoni superstiti del cliente (utilizzati/annullati)
SELECT
    b.stato,
    COUNT(*)      AS quanti,
    SUM(b.taglio) AS totale_eur
FROM buoni_cartacei b
JOIN clienti c ON c.id = b.cliente_id
WHERE c.nome_ragione_sociale ILIKE '%nutrigea%'
GROUP BY b.stato
ORDER BY b.stato;
