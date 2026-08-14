-- ============================================================
-- Impostazioni App: tabella key-value per feature toggle globali
-- Uso attuale: elenco moduli disabilitati (nascosti dal menu).
-- Lettura: tutto lo staff (serve a costruire il menu).
-- Scrittura: solo Super Admin (personale.super_admin = true).
-- Additiva e sicura: non tocca alcun dato esistente.
-- ============================================================

create table if not exists public.impostazioni_app (
    chiave         text primary key,
    valore         jsonb not null default '{}'::jsonb,
    aggiornato_at  timestamptz not null default now()
);

alter table public.impostazioni_app enable row level security;

-- Lettura: qualsiasi membro dello staff autenticato
drop policy if exists impostazioni_app_select on public.impostazioni_app;
create policy impostazioni_app_select on public.impostazioni_app
    for select to authenticated
    using (public.is_staff());

-- Inserimento: solo Super Admin
drop policy if exists impostazioni_app_ins on public.impostazioni_app;
create policy impostazioni_app_ins on public.impostazioni_app
    for insert to authenticated
    with check (exists (
        select 1 from public.personale p
        where p.auth_user_id = auth.uid() and p.super_admin = true
    ));

-- Aggiornamento: solo Super Admin
drop policy if exists impostazioni_app_upd on public.impostazioni_app;
create policy impostazioni_app_upd on public.impostazioni_app
    for update to authenticated
    using (exists (
        select 1 from public.personale p
        where p.auth_user_id = auth.uid() and p.super_admin = true
    ))
    with check (exists (
        select 1 from public.personale p
        where p.auth_user_id = auth.uid() and p.super_admin = true
    ));

-- Cancellazione: solo Super Admin (per completezza; l'app usa upsert)
drop policy if exists impostazioni_app_del on public.impostazioni_app;
create policy impostazioni_app_del on public.impostazioni_app
    for delete to authenticated
    using (exists (
        select 1 from public.personale p
        where p.auth_user_id = auth.uid() and p.super_admin = true
    ));

-- Seed: Crediti nascosto da subito (non sovrascrive se la riga esiste gia')
insert into public.impostazioni_app (chiave, valore)
values ('moduli_disabilitati', '["crediti"]'::jsonb)
on conflict (chiave) do nothing;
