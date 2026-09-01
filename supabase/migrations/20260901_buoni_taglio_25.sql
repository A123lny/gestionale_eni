-- Buoni cartacei: aggiunge il taglio da 25 € ai valori ammessi dal vincolo.
-- Senza questo, l'inserimento di un buono da 25 viene rifiutato dal CHECK.
ALTER TABLE public.buoni_cartacei DROP CONSTRAINT IF EXISTS buoni_cartacei_taglio_check;
ALTER TABLE public.buoni_cartacei ADD CONSTRAINT buoni_cartacei_taglio_check
  CHECK (taglio = ANY (ARRAY[5.00, 10.00, 20.00, 25.00, 50.00]));
