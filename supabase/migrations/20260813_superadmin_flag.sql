-- 20260813_superadmin_flag.sql
-- Aggiunge il contrassegno "super_admin" su personale e lo attiva per Andrea.
-- Additivo: la colonna ha default false; l'app in produzione la ignora (nessun
-- cambiamento finche' non si pubblica il client nuovo). Nessuna modifica alle
-- regole RLS (il ruolo DB di Andrea resta 'Admin', quindi accessi invariati).

alter table public.personale
  add column if not exists super_admin boolean not null default false;

update public.personale set super_admin = true where username = 'andrea';
