-- ============================================================
-- Gestione Personale — Disponibilità settimanali (lato dipendente)
-- Tabella + RLS. Eseguire nel SQL Editor di Supabase.
-- Richiede is_super_admin() e current_personale_id() (migration ferie).
-- ============================================================

create table if not exists public.disponibilita (
  id           uuid primary key default gen_random_uuid(),
  personale_id uuid not null references public.personale(id) on delete cascade,
  data         date not null,
  disponibile  boolean not null default true,
  fascia       varchar not null default 'indifferente',  -- mattina|pomeriggio|notte|indifferente
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (personale_id, data)
);

create index if not exists idx_disponibilita_data on public.disponibilita(data);
create index if not exists idx_disponibilita_personale on public.disponibilita(personale_id);

alter table public.disponibilita enable row level security;

drop policy if exists disp_select on public.disponibilita;
create policy disp_select on public.disponibilita for select
  using ( public.is_super_admin() or personale_id = public.current_personale_id() );

drop policy if exists disp_insert on public.disponibilita;
create policy disp_insert on public.disponibilita for insert
  with check ( public.is_super_admin() or personale_id = public.current_personale_id() );

drop policy if exists disp_update on public.disponibilita;
create policy disp_update on public.disponibilita for update
  using ( public.is_super_admin() or personale_id = public.current_personale_id() )
  with check ( public.is_super_admin() or personale_id = public.current_personale_id() );

drop policy if exists disp_delete on public.disponibilita;
create policy disp_delete on public.disponibilita for delete
  using ( public.is_super_admin() or personale_id = public.current_personale_id() );
