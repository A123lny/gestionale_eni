-- Cassa: colonna "Incasso Crediti (rientri)".
-- Registra i rientri di crediti pregressi (dal modulo Vendite, categoria "Incasso Credito").
-- Viene sottratta dal totale crediti: non è una vendita, è un credito che rientra.
ALTER TABLE public.cassa ADD COLUMN IF NOT EXISTS incasso_crediti numeric DEFAULT 0;
