-- ============================================================
-- Turni — supporto turno spezzato (secondo periodo orario).
-- Eseguire nel SQL Editor di Supabase.
-- ============================================================

alter table public.turni add column if not exists ora_inizio_2 time;
alter table public.turni add column if not exists ora_fine_2 time;
