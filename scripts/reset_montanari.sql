-- Reset saldo e storico Roberto Montanari
-- Eseguire da Supabase → SQL Editor

-- 1. Elimina tutti i movimenti_saldo
DELETE FROM movimenti_saldo
WHERE cliente_portale_id = (
    SELECT id FROM clienti_portale
    WHERE nome_display ILIKE '%montanari%'
    LIMIT 1
);

-- 2. Azzera il saldo
UPDATE clienti_portale
SET saldo = 0
WHERE nome_display ILIKE '%montanari%';
