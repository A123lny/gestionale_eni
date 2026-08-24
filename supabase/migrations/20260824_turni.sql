-- ============================================================
-- Gestione Personale — Turni (pianificazione settimanale)
-- Tabella + RLS. Eseguire nel SQL Editor di Supabase.
-- Richiede le funzioni is_super_admin() e current_personale_id()
-- gia' create dalla migration richieste_ferie.
-- ============================================================

create table if not exists public.turni (
  id           uuid primary key default gen_random_uuid(),
  personale_id uuid not null references public.personale(id) on delete cascade,
  data         date not null,
  tipo         varchar not null default 'turno',   -- 'turno' | 'riposo' | 'mattina' | 'pomeriggio' | 'notte' | ...
  ora_inizio   time,
  ora_fine     time,
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (personale_id, data)   -- un turno per persona al giorno (permette l'upsert)
);

create index if not exists idx_turni_data on public.turni(data);
create index if not exists idx_turni_personale on public.turni(personale_id);

alter table public.turni enable row level security;

-- SELECT: Super Admin tutto; il dipendente (in futuro) solo i propri turni
drop policy if exists turni_select on public.turni;
create policy turni_select on public.turni
  for select
  using ( public.is_super_admin() or personale_id = public.current_personale_id() );

-- INSERT/UPDATE/DELETE: solo il Super Admin (pianifica lui i turni)
drop policy if exists turni_insert on public.turni;
create policy turni_insert on public.turni
  for insert with check ( public.is_super_admin() );

drop policy if exists turni_update on public.turni;
create policy turni_update on public.turni
  for update using ( public.is_super_admin() ) with check ( public.is_super_admin() );

drop policy if exists turni_delete on public.turni;
create policy turni_delete on public.turni
  for delete using ( public.is_super_admin() );
