-- Bonus venduto: il bonus nasce dalle vendite, non piu' da una sua schermata
--
-- Cambio deciso dal gestore il 19/09/2026: il dipendente registra la vendita
-- dal modulo Vendite, come qualsiasi altra vendita, e nella sua sezione
-- "Bonus venduto" se la ritrova gia' col bonus calcolato. Una sola strada per
-- registrare una vendita, nessun doppione possibile.
--
-- Effetto collaterale importante: sparisce l'anteprima calcolata dal browser,
-- e con lei il rischio piu' serio del modulo (la stessa aritmetica in due
-- posti che possono divergere di un centesimo). Ora il bonus lo calcola solo
-- il database, al momento del salvataggio.
--
-- DA LANCIARE DOPO le altre sei migration del bonus.
-- Non tocca nessun dato esistente. Vale da qui in avanti: le vendite gia'
-- registrate non generano niente.

-- 1) Il bonus di un importo gia' scontato --------------------------------
-- Serve una funzione che parta dall'importo invece che da prezzo x quantita':
-- il totale della riga di vendita ha gia' lo sconto dentro, ed e' su quello
-- che si paga il bonus - sulla cifra che il cliente ha davvero lasciato, non
-- sul prezzo di listino.
-- Niente grant: la usa solo l'innesco qui sotto, non va esposta via API.
create or replace function public.bonus_calcola_importo(
    p_importo numeric, p_quantita integer)
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path = public
as $$
declare
  v_regola jsonb;
  v_modo   text;
  v_euro   numeric;
  v_perc   numeric;
begin
  if p_importo is null or p_importo <= 0 or p_quantita is null or p_quantita <= 0 then
    return jsonb_build_object('bonus', 0, 'regola_modo', null, 'regola_valore', 0);
  end if;

  v_regola := public.bonus_regola_corrente();
  v_modo   := v_regola ->> 'modo';

  if v_modo = 'euro' then
    -- A euro fissi conta il numero di pezzi, non l'importo.
    v_euro := coalesce((v_regola ->> 'euro_pezzo')::numeric, 0);
    return jsonb_build_object(
      'bonus',         greatest(round(v_euro * p_quantita, 2), 0),
      'regola_modo',   'euro',
      'regola_valore', v_euro);
  end if;

  if v_modo = 'percentuale' then
    -- La fascia cade sul totale della riga: e' la scelta del gestore, "articolo
    -- per articolo", cioe' ogni riga dello scontrino fa storia a se'.
    select (f ->> 'percentuale')::numeric into v_perc
    from jsonb_array_elements(v_regola -> 'fasce') as f
    where (f ->> 'da_prezzo')::numeric <= p_importo
    order by (f ->> 'da_prezzo')::numeric desc
    limit 1;

    if v_perc is null then
      return jsonb_build_object('bonus', 0, 'regola_modo', 'percentuale', 'regola_valore', 0);
    end if;

    return jsonb_build_object(
      'bonus',         greatest(round(p_importo * v_perc / 100, 2), 0),
      'regola_modo',   'percentuale',
      'regola_valore', v_perc);
  end if;

  return jsonb_build_object('bonus', 0, 'regola_modo', null, 'regola_valore', 0);
end;
$$;

-- 2) L'innesco: ogni riga di vendita genera il suo bonus -----------------
create or replace function public.crea_bonus_da_riga_vendita()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_staff   uuid;
  v_vend    public.vendite%rowtype;
  v_calc    jsonb;
  v_importo numeric(10,2);
  v_bonus   numeric(10,2);
  v_data    date;
begin
  -- CHI ha venduto lo decide la sessione. vendite.operatore_id lo scrive il
  -- browser e puo' non corrispondere (e' gia' successo: una scheda che si
  -- credeva il gestore mentre la sessione valeva quella di un cassiere).
  -- Qui si parla di soldi dovuti a una persona: vale l'identita' vera.
  v_staff := public.current_staff_id();
  if v_staff is null then
    return new;
  end if;

  -- Il titolare non si autopaga un premio.
  if exists (select 1 from public.personale
             where id = v_staff and super_admin is true) then
    return new;
  end if;

  select * into v_vend from public.vendite where id = new.vendita_id;
  if not found then
    return new;
  end if;

  -- I lavaggi hanno il loro modulo e generano una vendita per conto loro:
  -- erano esclusi dal bonus fin dall'inizio e restano esclusi.
  if v_vend.lavaggio_id is not null then
    return new;
  end if;
  if v_vend.stato is distinct from 'completata' then
    return new;
  end if;
  if new.categoria = 'Lavaggi' then
    return new;
  end if;

  -- bonus_movimenti.quantita e' un intero con vincolo >= 1, mentre in vendita
  -- la quantita' e' numerica. Una frazione farebbe fallire l'inserimento e,
  -- da dentro un innesco, si porterebbe dietro tutta la vendita: meglio
  -- nessun bonus che una vendita rifiutata al banco.
  if new.quantita is null or new.quantita < 1 or new.quantita <> trunc(new.quantita) then
    return new;
  end if;

  -- Il totale della riga ha gia' lo sconto dentro.
  v_importo := round(coalesce(new.totale_riga, 0), 2);
  if v_importo <= 0 then
    return new;
  end if;

  v_calc  := public.bonus_calcola_importo(v_importo, new.quantita::int);
  v_bonus := coalesce((v_calc ->> 'bonus')::numeric, 0);
  if v_bonus <= 0 then
    return new;
  end if;

  v_data := coalesce(v_vend.data, (now() at time zone 'Europe/Rome')::date);

  insert into public.bonus_movimenti (
    personale_id, vendita_id, magazzino_id, nome_prodotto, quantita,
    prezzo_unitario, imponibile, regola_modo, regola_valore, bonus_calcolato,
    anno, mese)
  values (
    v_staff, v_vend.id, new.prodotto_id, new.nome_prodotto, new.quantita::int,
    round(coalesce(new.prezzo_unitario, 0), 2), v_importo,
    coalesce(v_calc ->> 'regola_modo', 'percentuale'),
    (v_calc ->> 'regola_valore')::numeric,
    v_bonus,
    extract(year from v_data)::int, extract(month from v_data)::int);

  return new;

exception
  -- Al banco il registratore di cassa viene prima del bonus: qualunque cosa
  -- vada storta qui, la vendita deve concludersi. La riga mancante il gestore
  -- la aggiunge a mano dalla scheda Bonus.
  when others then
    return new;
end;
$$;

drop trigger if exists vendite_dettaglio_bonus on public.vendite_dettaglio;
create trigger vendite_dettaglio_bonus
  after insert on public.vendite_dettaglio
  for each row
  execute function public.crea_bonus_da_riga_vendita();

-- 3) Via le due strade vecchie -------------------------------------------
-- Non le chiama piu' nessuno: lasciarle in piedi vorrebbe dire lasciare una
-- seconda via per registrare la stessa vendita, cioe' il doppione che questo
-- lavoro serve a eliminare.
drop function if exists public.registra_vendita_bonus(uuid, integer, text);
drop function if exists public.registra_vendita_bonus_libera(text, numeric, integer, text);
