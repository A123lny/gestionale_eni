-- Cassa: una sola chiusura per data.
-- Impedisce fisicamente i doppioni creati da salvataggi in parallelo da più PC
-- (che poi rompevano la lettura con .single()). Verificato: nessun doppione esistente.
ALTER TABLE public.cassa ADD CONSTRAINT cassa_data_unique UNIQUE (data);
