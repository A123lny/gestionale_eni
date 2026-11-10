-- Mandato SDD generato dal gestionale, non piu' scritto a mano
--
-- Prima il codice mandato (clienti.mandate_id) si digitava nella scheda
-- cliente: 62 clienti RID non l'avevano e finivano esclusi dal file banca.
-- Da qui in poi:
--   - il codice lo assegna SOLO il database, serie nuova RSM-SDD-000001,
--     RSM-SDD-000002, ... (prefisso diverso dalla vecchia serie C43SF4...,
--     quindi un codice nuovo non puo' mai coincidere con uno gia' dato);
--   - una volta assegnato NON si cambia e non si svuota piu';
--   - nuovo cliente RID (o cliente che passa a RID) -> codice in automatico;
--   - clienti gia' RID senza mandato -> pulsante "Genera mandato" (RPC sotto),
--     anche senza data firma: il codice va scritto sul modulo da far firmare;
--   - nuova colonna mandato_data_firma: finisce in <DtOfSgntr> del file RID.
--     Il file parte solo per chi ha codice E data firma.
--
-- DATI: nessun mandato esistente viene toccato. Unico riempimento: ai 21
-- clienti che hanno gia' un mandato si mette data firma 2012-01-02, che e'
-- esattamente la data che il file RID invia oggi per tutti -> file identico.
--
-- Compatibile col JS vecchio ancora in cache: quello rimanda mandate_id
-- uguale a prima (nessun cambio, accettato) o null per chi non ce l'ha.
--
-- Per una correzione straordinaria da SQL Editor (solo amministratore):
--   begin; set local app.mandato_auto = 'on'; update ...; commit;
-- (il blocco "non modificabile" resta comunque attivo su un codice esistente).

-- ------------------------------------------------------------------
-- 0. CONTROLLO DOPPIONI (sola lettura): due schede con lo stesso mandato.
--    Deve restituire ZERO righe tra i clienti attivi, altrimenti l'indice
--    univoco del punto 4 fallisce: lanciare prima
--    20261110_mandato_sdd_doppioni.sql.
-- ------------------------------------------------------------------
-- select c.mandate_id, c.id, c.nome_ragione_sociale, c.p_iva_coe, c.attivo,
--        (select count(*) from public.fatture f where f.cliente_id = c.id) as n_fatture
--   from public.clienti c
--  where c.mandate_id in (select mandate_id from public.clienti
--                          where mandate_id is not null
--                          group by mandate_id having count(*) > 1)
--  order by c.mandate_id, c.nome_ragione_sociale;

-- ------------------------------------------------------------------
-- 1. Data firma + contatore
-- ------------------------------------------------------------------
alter table public.clienti add column if not exists mandato_data_firma date;

update public.clienti
   set mandato_data_firma = date '2012-01-02'
 where mandate_id is not null
   and mandato_data_firma is null;

create sequence if not exists public.mandato_sdd_seq start 1;

create or replace function public._prossimo_mandato_sdd()
  returns text
  language sql
  security definer
  set search_path = public
as $$
  select 'RSM-SDD-' || lpad(nextval('public.mandato_sdd_seq')::text, 6, '0');
$$;

revoke all on function public._prossimo_mandato_sdd() from public, anon, authenticated;

-- ------------------------------------------------------------------
-- 2. Guardia sul codice mandato
-- ------------------------------------------------------------------
create or replace function public.clienti_mandato_guardia()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_auto boolean := coalesce(current_setting('app.mandato_auto', true), '') = 'on';
begin
  -- Un mandato gia' assegnato non si cambia e non si svuota.
  if tg_op = 'UPDATE'
     and old.mandate_id is not null
     and new.mandate_id is distinct from old.mandate_id then
    raise exception 'Il codice mandato SDD non e'' modificabile (cliente %)', old.nome_ragione_sociale;
  end if;

  -- Un codice nuovo lo scrive solo il gestionale.
  if new.mandate_id is not null
     and (tg_op = 'INSERT' or old.mandate_id is null)
     and not v_auto then
    raise exception 'Il codice mandato SDD viene generato dal gestionale, non si inserisce a mano';
  end if;

  -- Nuovo cliente RID, o cliente che passa a RID: codice in automatico.
  -- I clienti gia' RID senza codice si generano col pulsante (RPC sotto).
  if new.mandate_id is null
     and new.modalita_pagamento_fattura = 'RID_SDD'
     and (tg_op = 'INSERT' or old.modalita_pagamento_fattura is distinct from 'RID_SDD') then
    new.mandate_id := public._prossimo_mandato_sdd();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_clienti_mandato on public.clienti;
create trigger trg_clienti_mandato
  before insert or update on public.clienti
  for each row execute function public.clienti_mandato_guardia();

-- ------------------------------------------------------------------
-- 3. Pulsante "Genera mandato"
-- ------------------------------------------------------------------
create or replace function public.genera_mandato_sdd(p_cliente_id uuid, p_data_firma date)
  returns text
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_cli    public.clienti%rowtype;
  v_codice text;
begin
  if not public.is_staff() then
    raise exception 'Non autorizzato';
  end if;
  -- p_data_firma puo' essere null: il codice serve PRIMA della firma, perche'
  -- va scritto sul modulo SEPA. Senza data il cliente resta fuori dal file RID.
  if p_data_firma > current_date then
    raise exception 'La data firma non puo'' essere nel futuro';
  end if;

  select * into v_cli from public.clienti where id = p_cliente_id for update;
  if not found then
    raise exception 'Cliente non trovato';
  end if;
  if v_cli.mandate_id is not null then
    raise exception 'Il cliente ha gia'' il mandato %', v_cli.mandate_id;
  end if;

  v_codice := public._prossimo_mandato_sdd();

  perform set_config('app.mandato_auto', 'on', true);
  update public.clienti
     set mandate_id = v_codice,
         mandato_data_firma = p_data_firma
   where id = p_cliente_id;
  perform set_config('app.mandato_auto', 'off', true);

  return v_codice;
end;
$$;

revoke all on function public.genera_mandato_sdd(uuid, date) from public, anon;
grant execute on function public.genera_mandato_sdd(uuid, date) to authenticated;

-- ------------------------------------------------------------------
-- 4. Codice univoco tra i clienti ATTIVI
--    Le schede doppie (Studio Biagioli, Solution) vanno disattivate PRIMA
--    con 20261110_mandato_sdd_doppioni.sql: la scheda disattivata tiene il
--    suo mandato (non si cancella), e l'indice impedisce di riattivarla
--    finche' l'altra e' attiva. I codici nuovi vengono dal contatore,
--    quindi sono comunque tutti diversi.
-- ------------------------------------------------------------------
create unique index if not exists clienti_mandate_id_uniq
  on public.clienti (mandate_id)
  where mandate_id is not null and attivo;
