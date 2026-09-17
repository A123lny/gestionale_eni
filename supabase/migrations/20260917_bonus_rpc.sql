-- Bonus venduto: le funzioni.
--
-- registra_vendita_bonus e' SECURITY DEFINER per un motivo solo: deve poter
-- scrivere in bonus_movimenti, dove il dipendente non ha permesso di scrittura.
-- Proprio perche' bypassa la RLS, ogni controllo e' esplicito qui dentro, e
-- i due dati che contano - CHI vende e A QUANTO - non arrivano dal client.

-- 1) La regola configurata, in un colpo solo -------------------------------
create or replace function public.bonus_regola_corrente()
  returns jsonb
  language sql
  stable
  security definer
  set search_path = public
as $$
  select jsonb_build_object(
    'modo',       coalesce((select valore #>> '{}' from public.impostazioni_app
                            where chiave = 'bonus_modo'), 'percentuale'),
    'euro_pezzo', coalesce((select (valore #>> '{}')::numeric from public.impostazioni_app
                            where chiave = 'bonus_euro_pezzo'), 0),
    'fasce',      coalesce((select jsonb_agg(jsonb_build_object(
                                'da_prezzo', da_prezzo, 'percentuale', percentuale)
                                order by da_prezzo)
                            from public.bonus_fasce), '[]'::jsonb)
  );
$$;

grant execute on function public.bonus_regola_corrente() to authenticated;

-- 2) Il bonus di una riga --------------------------------------------------
-- Stessa aritmetica di js/lib/bonus-calcoli.js: la fascia si sceglie sul
-- PREZZO DEL PEZZO, estremo inferiore incluso; l'ultima fascia e' aperta.
create or replace function public.bonus_riga_calcola(p_prezzo numeric, p_quantita integer)
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
  if p_prezzo is null or p_quantita is null or p_prezzo <= 0 or p_quantita <= 0 then
    return jsonb_build_object('bonus', 0, 'regola_modo', null, 'regola_valore', 0);
  end if;

  v_regola := public.bonus_regola_corrente();
  v_modo   := v_regola ->> 'modo';

  if v_modo = 'euro' then
    -- greatest(..., 0): l'importo al pezzo sta in impostazioni_app, dove non
    -- si puo' mettere un vincolo. Un valore negativo salvato per errore
    -- trasformerebbe il bonus in un addebito. Stessa difesa in
    -- js/lib/bonus-calcoli.js, per non rompere la parita'.
    v_euro := coalesce((v_regola ->> 'euro_pezzo')::numeric, 0);
    return jsonb_build_object(
      'bonus',         greatest(round(v_euro * p_quantita, 2), 0),
      'regola_modo',   'euro',
      'regola_valore', v_euro);
  end if;

  if v_modo = 'percentuale' then
    -- la fascia con il da_prezzo piu' alto fra quelli <= prezzo
    select (f ->> 'percentuale')::numeric into v_perc
    from jsonb_array_elements(v_regola -> 'fasce') as f
    where (f ->> 'da_prezzo')::numeric <= p_prezzo
    order by (f ->> 'da_prezzo')::numeric desc
    limit 1;

    if v_perc is null then
      return jsonb_build_object('bonus', 0, 'regola_modo', 'percentuale', 'regola_valore', 0);
    end if;

    return jsonb_build_object(
      'bonus',         greatest(round(p_prezzo * p_quantita * v_perc / 100, 2), 0),
      'regola_modo',   'percentuale',
      'regola_valore', v_perc);
  end if;

  return jsonb_build_object('bonus', 0, 'regola_modo', null, 'regola_valore', 0);
end;
$$;

grant execute on function public.bonus_riga_calcola(numeric, integer) to authenticated;

-- 3) La vendita dal portale dipendente -------------------------------------
create or replace function public.registra_vendita_bonus(
    p_magazzino_id uuid,
    p_quantita     integer,
    p_metodo       text)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_staff    uuid;
  v_art      public.magazzino%rowtype;
  v_calc     jsonb;
  v_imponib  numeric(10,2);
  v_oggi     date := current_date;
  v_vendita  jsonb;
  v_mov_id   uuid;
begin
  -- CHI vende lo decide la sessione, non il client
  v_staff := public.current_staff_id();
  if v_staff is null then
    raise exception 'Utente non riconosciuto: rifai il login';
  end if;

  if p_metodo is null or p_metodo not in ('contanti','pos') then
    raise exception 'Metodo di pagamento non valido: usa contanti o pos';
  end if;

  if p_quantita is null or p_quantita < 1 then
    raise exception 'La quantita'' deve essere almeno 1';
  end if;

  select * into v_art from public.magazzino where id = p_magazzino_id;
  if not found then
    raise exception 'Articolo non trovato';
  end if;
  if v_art.attivo is not true then
    raise exception 'Articolo non attivo';
  end if;
  if v_art.bonus_attivo is not true then
    raise exception 'Questo articolo non da'' bonus';
  end if;
  if coalesce(v_art.giacenza, 0) < p_quantita then
    raise exception 'Giacenza insufficiente: ne restano %', coalesce(v_art.giacenza, 0);
  end if;

  -- A QUANTO si vende lo decide il magazzino, non il client: niente sconti
  v_imponib := round(v_art.prezzo_vendita * p_quantita, 2);
  v_calc    := public.bonus_riga_calcola(v_art.prezzo_vendita, p_quantita);

  -- Vendita atomica: codice, testata, righe, scarico giacenza
  v_vendita := public.salva_vendita(
    jsonb_build_object(
      'data',             v_oggi,
      'ora',              to_char(now(), 'HH24:MI:SS'),
      'operatore_id',     v_staff,
      'operatore_nome',   (select nome_completo from public.personale where id = v_staff),
      'subtotale',        v_imponib,
      'totale',           v_imponib,
      'metodo_pagamento', p_metodo,
      'importo_contanti', case when p_metodo = 'contanti' then v_imponib else 0 end,
      'importo_pos',      case when p_metodo = 'pos'      then v_imponib else 0 end,
      'resto',            0,
      'stato',            'completata',
      'note',             'Bonus venduto'),
    jsonb_build_array(jsonb_build_object(
      'prodotto_id',     v_art.id,
      'codice_prodotto', v_art.codice,
      'barcode',         v_art.barcode,
      'nome_prodotto',   v_art.nome_prodotto,
      'categoria',       v_art.categoria,
      'quantita',        p_quantita,
      'prezzo_unitario', v_art.prezzo_vendita,
      'sconto',          0,
      'totale_riga',     v_imponib)),
    'VEN');

  insert into public.bonus_movimenti (
    personale_id, vendita_id, magazzino_id, nome_prodotto, quantita,
    prezzo_unitario, imponibile, regola_modo, regola_valore, bonus_calcolato,
    anno, mese)
  values (
    v_staff, (v_vendita ->> 'id')::uuid, v_art.id, v_art.nome_prodotto, p_quantita,
    v_art.prezzo_vendita, v_imponib,
    coalesce(v_calc ->> 'regola_modo', 'percentuale'),
    (v_calc ->> 'regola_valore')::numeric,
    (v_calc ->> 'bonus')::numeric,
    extract(year from v_oggi)::int, extract(month from v_oggi)::int)
  returning id into v_mov_id;

  return v_vendita || jsonb_build_object(
    'bonus_movimento_id', v_mov_id,
    'bonus',              (v_calc ->> 'bonus')::numeric);
end;
$$;

grant execute on function public.registra_vendita_bonus(uuid, integer, text) to authenticated;

-- 4) Ri-somma di un periodo -------------------------------------------------
-- Non si chiama da sola: la invocano le correzioni del gestore e il pulsante
-- dell'avviso. Un periodo forzato a mano non viene toccato.
create or replace function public.ricalcola_periodo_bonus(
    p_personale_id uuid, p_anno integer, p_mese integer)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_venduto numeric(10,2);
  v_bonus   numeric(10,2);
begin
  if not public.is_super_admin() then
    raise exception 'Operazione riservata al gestore';
  end if;

  select coalesce(sum(imponibile), 0), coalesce(sum(bonus_calcolato), 0)
    into v_venduto, v_bonus
  from public.bonus_movimenti
  where personale_id = p_personale_id and anno = p_anno and mese = p_mese;

  update public.bonus_periodi
     set venduto = v_venduto, bonus_totale = v_bonus, updated_at = now()
   where personale_id = p_personale_id and anno = p_anno and mese = p_mese
     and forzato is false;

  return jsonb_build_object('venduto', v_venduto, 'bonus_totale', v_bonus);
end;
$$;

grant execute on function public.ricalcola_periodo_bonus(uuid, integer, integer) to authenticated;
