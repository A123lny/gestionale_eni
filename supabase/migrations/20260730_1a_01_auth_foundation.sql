-- 20260730_1a_01_auth_foundation.sql
-- Fase 1a: fondamenta per Supabase Auth.
-- NON blinda ancora le tabelle (quello e' la Fase 1b): aggiunge solo i
-- "ganci" (colonne di collegamento, funzioni helper, vista elenco nomi).
-- Applicare dentro una transazione (BEGIN/COMMIT) via connessione diretta.

-- 1) Colonne di collegamento all'utente Auth ---------------------------------
alter table public.personale
  add column if not exists auth_user_id uuid unique references auth.users(id) on delete set null;

alter table public.clienti_portale
  add column if not exists auth_user_id uuid unique references auth.users(id) on delete set null;

-- 2) Funzioni helper per la RLS (SECURITY DEFINER: bypassano la RLS,
--    evitano ricorsione; search_path fisso per sicurezza) ------------------
create or replace function public.is_staff()
  returns boolean
  language sql
  stable
  security definer
  set search_path = public
as $$
  select exists (
    select 1 from public.personale
    where auth_user_id = auth.uid() and attivo is true
  );
$$;

create or replace function public.staff_role()
  returns text
  language sql
  stable
  security definer
  set search_path = public
as $$
  select ruolo from public.personale
  where auth_user_id = auth.uid() and attivo is true
  limit 1;
$$;

create or replace function public.current_cliente_id()
  returns uuid
  language sql
  stable
  security definer
  set search_path = public
as $$
  select id from public.clienti_portale
  where auth_user_id = auth.uid() and attivo is true
  limit 1;
$$;

-- Le helper devono essere eseguibili dagli utenti (le usera' la RLS in 1b)
grant execute on function public.is_staff() to authenticated, anon;
grant execute on function public.staff_role() to authenticated, anon;
grant execute on function public.current_cliente_id() to authenticated, anon;

-- 3) Vista per l'elenco nomi al login ----------------------------------------
--    Nessun segreto: solo nome + email tecnica. Il PIN NON compare.
create or replace view public.personale_login as
  select nome_completo,
         (username || '@staff.titanwash.local') as email_tecnica,
         attivo
  from public.personale
  where attivo is true;

grant select on public.personale_login to anon, authenticated;
