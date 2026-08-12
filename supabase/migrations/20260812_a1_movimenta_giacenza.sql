-- 20260812_a1_movimenta_giacenza.sql
-- A1: giacenza magazzino aggiornata in modo ATOMICO lato DB.
-- Sostituisce il "leggi-calcola-riscrivi" lato client (che perde aggiornamenti
-- se due postazioni operano insieme) con una singola operazione:
--   giacenza = greatest(0, giacenza + delta)
-- delta negativo = vendita/scarico, positivo = reso/annullo/carico manuale.
-- Mantiene il comportamento attuale: la giacenza non scende sotto zero.
-- SECURITY INVOKER: resta soggetta alla RLS (solo staff loggato puo' scrivere).

create or replace function public.movimenta_giacenza(p_prodotto_id uuid, p_delta numeric)
  returns numeric
  language plpgsql
  security invoker
  set search_path = public
as $$
declare
  v_nuova numeric;
begin
  update public.magazzino
     set giacenza = greatest(0, coalesce(giacenza, 0) + p_delta),
         ultima_movimentazione = now()
   where id = p_prodotto_id
   returning giacenza into v_nuova;
  return v_nuova;  -- NULL se il prodotto non esiste
end;
$$;

grant execute on function public.movimenta_giacenza(uuid, numeric) to authenticated;
