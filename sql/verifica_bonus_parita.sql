-- Verifica che il bonus calcolato in SQL coincida con quello calcolato in
-- JavaScript. SOLO LETTURA: non scrive niente.
--
-- Da lanciare nel SQL Editor DOPO aver configurato le fasce 0->3%, 10->5%,
-- 30->7% e la modalita' 'percentuale'. Confrontare riga per riga con
-- l'output di:  node test/test-bonus-calcoli.js --parita
select
    c.prezzo,
    c.quantita,
    (public.bonus_riga_calcola(c.prezzo, c.quantita) ->> 'bonus')::numeric   as bonus_sql,
    (public.bonus_riga_calcola(c.prezzo, c.quantita) ->> 'regola_valore')::numeric as perc_sql
from (values
    -- estremi delle fasce
    (9.99::numeric,  1),
    (10.00,          1),
    (10.50,          1),
    (12.00,          3),
    (25.00,          1),
    (29.99,          1),
    (30.00,          1),
    (50.00,          1),
    (13.33,          7),
    (8.00,           1),
    -- mezzi centesimi: e' QUI che i due calcoli divergevano di un centesimo.
    -- Senza queste righe la verifica darebbe verde su una parita' inesistente.
    (30.50,          1),
    (7.25,          10),
    (13.70,          3),
    (10.50,          9),
    (10.95,          6),
    (10.10,          9)
) as c(prezzo, quantita)
order by c.prezzo, c.quantita;
