-- ============================================================
-- Gestione Personale — Richieste Ferie / Permessi
-- Tabella + RLS. Eseguire nel SQL Editor di Supabase.
-- MCP in sola lettura: applicare a mano.
-- ============================================================

-- 1) Funzioni helper RLS (SECURITY DEFINER: evitano ricorsione con la RLS di personale)
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.personale
    where auth_user_id = auth.uid() and super_admin = true
  );
$$;

create or replace function public.current_personale_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.personale
  where auth_user_id = auth.uid()
  limit 1;
$$;

-- 2) Tabella richieste ferie/permessi
create table if not exists public.richieste_ferie (
  id             uuid primary key default gen_random_uuid(),
  personale_id   uuid not null references public.personale(id) on delete cascade,
  tipo           varchar not null default 'ferie'
                   check (tipo in ('ferie', 'permesso', 'malattia')),
  data_inizio    date not null,
  data_fine      date not null,
  giornata_intera boolean not null default true,
  ora_inizio     time,          -- valorizzati se giornata_intera = false (permesso a ore)
  ora_fine       time,
  motivo         text,
  stato          varchar not null default 'in_attesa'
                   check (stato in ('in_attesa', 'approvata', 'rifiutata')),
  note_risposta  text,          -- nota del Super Admin su approvazione/rifiuto
  gestita_da     uuid references public.personale(id),
  gestita_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint chk_periodo check (data_fine >= data_inizio)
);

create index if not exists idx_richieste_ferie_personale on public.richieste_ferie(personale_id);
create index if not exists idx_richieste_ferie_stato on public.richieste_ferie(stato);
create index if not exists idx_richieste_ferie_data on public.richieste_ferie(data_inizio);

-- 3) RLS
alter table public.richieste_ferie enable row level security;

-- SELECT: il Super Admin vede tutto; ogni dipendente solo le proprie
drop policy if exists ferie_select on public.richieste_ferie;
create policy ferie_select on public.richieste_ferie
  for select
  using ( public.is_super_admin() or personale_id = public.current_personale_id() );

-- INSERT: il Super Admin per chiunque; il dipendente solo per se stesso
drop policy if exists ferie_insert on public.richieste_ferie;
create policy ferie_insert on public.richieste_ferie
  for insert
  with check ( public.is_super_admin() or personale_id = public.current_personale_id() );

-- UPDATE: solo il Super Admin (approva/rifiuta/modifica)
drop policy if exists ferie_update on public.richieste_ferie;
create policy ferie_update on public.richieste_ferie
  for update
  using ( public.is_super_admin() )
  with check ( public.is_super_admin() );

-- DELETE: il Super Admin sempre; il dipendente può cancellare una propria richiesta ancora "in_attesa"
drop policy if exists ferie_delete on public.richieste_ferie;
create policy ferie_delete on public.richieste_ferie
  for delete
  using (
    public.is_super_admin()
    or (personale_id = public.current_personale_id() and stato = 'in_attesa')
  );
