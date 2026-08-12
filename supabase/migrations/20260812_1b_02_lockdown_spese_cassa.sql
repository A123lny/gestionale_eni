-- 20260812_1b_02_lockdown_spese_cassa.sql
-- Fix: spese_cassa era stata dimenticata nella lista 1b-A ed era rimasta aperta.
-- Applica la stessa regola staff-only. Applicare con apply_migration.js.

do $$
declare
  pol record;
begin
  for pol in select policyname from pg_policies where schemaname='public' and tablename='spese_cassa' loop
    execute format('drop policy if exists %I on public.spese_cassa', pol.policyname);
  end loop;
  alter table public.spese_cassa enable row level security;
  create policy staff_all on public.spese_cassa for all to authenticated
    using (public.is_staff()) with check (public.is_staff());
end $$;
