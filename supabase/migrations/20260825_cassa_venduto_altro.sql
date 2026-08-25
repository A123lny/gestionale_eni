-- Cassa: colonna "Altro / Varie" per il venduto negozio.
-- Raccoglie la categoria "Altro" del modulo Vendite e ogni categoria
-- senza campo dedicato, così nessuna vendita viene persa nella quadratura.
ALTER TABLE public.cassa ADD COLUMN IF NOT EXISTS venduto_altro numeric DEFAULT 0;
