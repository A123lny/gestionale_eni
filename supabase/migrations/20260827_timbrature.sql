-- Timbrature: eventi entrata/uscita dei dipendenti (base per ore lavorate e presenze).
create table if not exists public.timbrature (
    id            uuid primary key default gen_random_uuid(),
    personale_id  uuid not null references public.personale(id) on delete cascade,
    tipo          varchar not null check (tipo in ('entrata','uscita')),
    ts            timestamptz not null default now(),
    data          date not null default ((now() at time zone 'Europe/Rome')::date),
    origine       varchar not null default 'qr',
    note          text,
    creato_da     uuid,
    created_at    timestamptz not null default now()
);

create index if not exists idx_timbrature_pers_data on public.timbrature(personale_id, data);
create index if not exists idx_timbrature_data on public.timbrature(data);

alter table public.timbrature enable row level security;

-- Il dipendente vede le proprie; il super admin vede tutte.
create policy timb_select on public.timbrature for select
    using (is_super_admin() or personale_id = current_personale_id());

-- Il dipendente può timbrare solo sé stesso; il super admin può inserire per chiunque (correzioni).
create policy timb_insert on public.timbrature for insert
    with check (personale_id = current_personale_id() or is_super_admin());

-- Modifiche/cancellazioni: solo super admin (correzioni manuali).
create policy timb_update on public.timbrature for update
    using (is_super_admin()) with check (is_super_admin());
create policy timb_delete on public.timbrature for delete
    using (is_super_admin());
