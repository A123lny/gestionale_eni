-- Bonus venduto ai dipendenti: schema
--
-- Il dipendente registra dal proprio portale la vendita di un articolo a
-- bonus; la vendita nasce da li' e gli accredita un importo in euro. La
-- regola (euro al pezzo, oppure percentuale a fasce di PREZZO DEL PEZZO) e'
-- unica per tutti gli articoli e sta nelle impostazioni.
--
-- Non tocca nessun dato esistente: aggiunge una colonna facoltativa a
-- magazzino e tre tabelle nuove.

-- 1) Chi e' il dipendente collegato ------------------------------------------
-- Accanto alle esistenti is_staff() / staff_role(). SECURITY DEFINER per lo
-- stesso motivo delle altre: la usa la RLS e non deve ricorrere su se stessa.
create or replace function public.current_staff_id()
  returns uuid
  language sql
  stable
  security definer
  set search_path = public
as $$
  select id from public.personale
  where auth_user_id = auth.uid() and attivo is true
  limit 1;
$$;

grant execute on function public.current_staff_id() to authenticated;

-- Chi e' il gestore. ATTENZIONE: non esiste nessun ruolo chiamato 'Super Admin'.
-- I valori reali di personale.ruolo sono 'Admin', 'Cassiere' e 'Lavaggi'; il
-- gestore si riconosce dal flag booleano personale.super_admin. Una policy che
-- confrontasse staff_role() con 'Super Admin' non corrisponderebbe MAI, e
-- bloccherebbe il gestore invece degli altri.
create or replace function public.is_super_admin()
  returns boolean
  language sql
  stable
  security definer
  set search_path = public
as $$
  select exists (
    select 1 from public.personale
    where auth_user_id = auth.uid() and attivo is true and super_admin is true
  );
$$;

grant execute on function public.is_super_admin() to authenticated;

-- 2) Quali articoli danno bonus ----------------------------------------------
alter table public.magazzino
    add column if not exists bonus_attivo boolean not null default false;

comment on column public.magazzino.bonus_attivo is
    'L''articolo da'' bonus al dipendente che lo vende. Il COME si paga sta nelle impostazioni, uguale per tutti.';

create index if not exists magazzino_bonus_attivo_idx
    on public.magazzino (bonus_attivo) where bonus_attivo;

-- 3) Le fasce di prezzo (solo in modalita' percentuale) ----------------------
create table if not exists public.bonus_fasce (
    id           uuid primary key default gen_random_uuid(),
    da_prezzo    numeric(10,2) not null check (da_prezzo >= 0),
    percentuale  numeric(5,2)  not null check (percentuale > 0 and percentuale <= 100),
    created_at   timestamptz not null default now(),
    unique (da_prezzo)
);

comment on table public.bonus_fasce is
    'Fasce di prezzo del singolo pezzo. Si memorizza solo l''inizio: due estremi memorizzati possono divergere, uno no. La fascia arriva fino al da_prezzo della successiva, esclusa; l''ultima e'' aperta.';

-- 4) I movimenti: una riga per vendita a bonus -------------------------------
create table if not exists public.bonus_movimenti (
    id               uuid primary key default gen_random_uuid(),
    personale_id     uuid not null references public.personale(id),
    vendita_id       uuid references public.vendite(id) on delete cascade,
    magazzino_id     uuid references public.magazzino(id),
    nome_prodotto    text not null,
    quantita         integer not null check (quantita >= 1),
    prezzo_unitario  numeric(10,2) not null check (prezzo_unitario >= 0),
    imponibile       numeric(10,2) not null check (imponibile >= 0),
    regola_modo      text not null check (regola_modo in ('euro','percentuale')),
    regola_valore    numeric(10,2) not null default 0,
    bonus_calcolato  numeric(10,2) not null default 0,
    anno             integer not null,
    mese             integer not null check (mese between 1 and 12),
    modificato_da    uuid references public.personale(id),
    modificato_at    timestamptz,
    created_at       timestamptz not null default now()
);

comment on column public.bonus_movimenti.vendita_id is
    'Null quando la riga e'' stata aggiunta a mano dal gestore. on delete cascade: annullata la vendita, sparisce il bonus.';
comment on column public.bonus_movimenti.regola_modo is
    'Come era configurato il bonus QUEL giorno. Cambiare la regola domani non riscrive il passato.';

create index if not exists bonus_movimenti_periodo_idx
    on public.bonus_movimenti (personale_id, anno, mese);
create index if not exists bonus_movimenti_vendita_idx
    on public.bonus_movimenti (vendita_id);

-- 5) La chiusura mensile -----------------------------------------------------
create table if not exists public.bonus_periodi (
    id            uuid primary key default gen_random_uuid(),
    personale_id  uuid not null references public.personale(id),
    anno          integer not null,
    mese          integer not null check (mese between 1 and 12),
    venduto       numeric(10,2) not null default 0,
    bonus_totale  numeric(10,2) not null default 0,
    forzato       boolean not null default false,
    stato         text not null default 'da_pagare' check (stato in ('da_pagare','pagato')),
    pagato_at     timestamptz,
    pagato_da     uuid references public.personale(id),
    note          text,
    updated_at    timestamptz not null default now(),
    unique (personale_id, anno, mese)
);

comment on table public.bonus_periodi is
    'Solo i mesi CHIUSI. Il mese in corso si calcola al volo dai movimenti. Una volta creata, la riga non si ricalcola da sola: la aggiorna solo un gesto del gestore.';
comment on column public.bonus_periodi.forzato is
    'true se il totale e'' stato scritto a mano: da li'' in poi il ricalcolo non lo tocca.';

-- 6) RLS ---------------------------------------------------------------------
alter table public.bonus_fasce      enable row level security;
alter table public.bonus_movimenti  enable row level security;
alter table public.bonus_periodi    enable row level security;

-- Le fasce: tutti gli staff leggono (al dipendente serve per vedere la regola),
-- scrive solo chi puo' toccare le impostazioni, cioe' il super admin.
drop policy if exists bonus_fasce_lettura on public.bonus_fasce;
create policy bonus_fasce_lettura on public.bonus_fasce
    for select to authenticated using (public.is_staff());

drop policy if exists bonus_fasce_scrittura on public.bonus_fasce;
create policy bonus_fasce_scrittura on public.bonus_fasce
    for all to authenticated
    using (public.is_super_admin())
    with check (public.is_super_admin());

-- I movimenti: il dipendente vede SOLO i propri e non scrive mai.
-- L'unica strada per lui e' la funzione registra_vendita_bonus.
drop policy if exists bonus_movimenti_propri on public.bonus_movimenti;
create policy bonus_movimenti_propri on public.bonus_movimenti
    for select to authenticated
    using (personale_id = public.current_staff_id());

drop policy if exists bonus_movimenti_gestore on public.bonus_movimenti;
create policy bonus_movimenti_gestore on public.bonus_movimenti
    for all to authenticated
    using (public.is_super_admin())
    with check (public.is_super_admin());

-- I periodi: stesso schema.
drop policy if exists bonus_periodi_propri on public.bonus_periodi;
create policy bonus_periodi_propri on public.bonus_periodi
    for select to authenticated
    using (personale_id = public.current_staff_id());

drop policy if exists bonus_periodi_gestore on public.bonus_periodi;
create policy bonus_periodi_gestore on public.bonus_periodi
    for all to authenticated
    using (public.is_super_admin())
    with check (public.is_super_admin());
