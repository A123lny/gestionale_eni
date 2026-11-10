-- ============================================================
-- Turni — permesso a ore (fascia di permesso dentro una giornata).
-- Ferie, malattia e permesso a giornata intera usano solo turni.tipo
-- (nessun vincolo sulla colonna): qui servono solo le ore del permesso.
-- Eseguire nel SQL Editor di Supabase PRIMA di pubblicare turni.js v13.
-- ============================================================

alter table public.turni add column if not exists permesso_inizio time;
alter table public.turni add column if not exists permesso_fine time;
