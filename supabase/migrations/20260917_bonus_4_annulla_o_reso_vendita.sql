-- Bonus venduto: tre correzioni emerse dalla revisione finale del branch
--
-- Difetti che nessuna revisione di singola task poteva vedere, perche' stanno
-- sul confine fra i pezzi. DA LANCIARE DOPO le altre tre migration del bonus
-- (20260917_bonus_1_schema.sql, 20260917_bonus_2_rpc.sql,
-- 20260917_bonus_3_tutti_articoli.sql).

-- 1) Bonus venduto: annullamenti e resi tolgono il bonus (CRITICO) ---------
--
-- Il progetto prevedeva che la riga bonus sparisse con la vendita, e per questo
-- vendita_id ha "on delete cascade". Ma ne' annullaVendita ne' salvaReso
-- CANCELLANO la vendita: ne cambiano lo stato ad 'annullata', 'reso_totale' o
-- 'reso_parziale'. La cascata quindi non scattava mai, e un dipendente poteva
-- registrare una vendita, incassare il bonus e poi annullarla o renderla
-- tenendosi i soldi, senza aver messo niente in cassa.
--
-- Anche il reso PARZIALE toglie tutto il bonus, non una parte: la vendita non e'
-- piu' quella su cui il bonus era stato calcolato, e pagare in proporzione
-- richiederebbe di indovinare quali pezzi sono tornati indietro. Se una parte e'
-- rimasta venduta davvero, il gestore riconosce quel pezzo con "aggiungi riga a
-- mano" dalla scheda Bonus. Cosi' non si paga mai piu' del dovuto.
--
-- Nota: se la vendita apparteneva a un mese gia' chiuso, il periodo NON si
-- ricalcola da solo qui dentro - e' voluto, ed e' esattamente il caso che fa
-- comparire l'avviso "il maturato non corrisponde più ai movimenti" nella
-- scheda del gestore.

create or replace function public.togli_bonus_vendita_annullata_o_resa()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  -- Guardia sul PASSAGGIO verso uno di questi tre stati, non su ogni update di
  -- una vendita che gia' ci si trova: senza "old.stato is distinct from
  -- new.stato" un aggiornamento qualsiasi di una vendita gia' annullata (es.
  -- una nota corretta a mano) ripeterebbe la delete ad ogni salvataggio.
  if new.stato in ('annullata', 'reso_totale', 'reso_parziale')
     and old.stato is distinct from new.stato then
    delete from public.bonus_movimenti where vendita_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists vendite_bonus_annullamento on public.vendite;
drop trigger if exists vendite_bonus_annullamento_o_reso on public.vendite;
create trigger vendite_bonus_annullamento_o_reso
  after update on public.vendite
  for each row
  execute function public.togli_bonus_vendita_annullata_o_resa();

-- 2) "Ricalcola" su un periodo forzato dice "fatto" e non fa niente --------
--
-- L'UPDATE aveva "and forzato is false", corretto, ma la funzione restituiva
-- comunque le somme ricalcolate anche quando l'UPDATE non toccava nessuna
-- riga: l'interfaccia mostrava sempre "Periodo ricalcolato", il gestore
-- premeva, leggeva "fatto", e l'avviso rosso restava li' senza spiegazione.
-- Ora la funzione dice anche QUANTE righe ha aggiornato.

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
  v_righe   integer;
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
  get diagnostics v_righe = row_count;

  -- aggiornato = false quando il periodo e' forzato a mano: chi ha premuto deve
  -- sapere che non e' cambiato niente, invece di vedere "fatto" e l'avviso che resta.
  return jsonb_build_object('venduto', v_venduto, 'bonus_totale', v_bonus,
                            'aggiornato', v_righe > 0);
end;
$$;

grant execute on function public.ricalcola_periodo_bonus(uuid, integer, integer) to authenticated;

-- 3) Un cliente del portale puo' leggere come e' pagato il personale --------
--
-- bonus_regola_corrente() e bonus_riga_calcola() sono SECURITY DEFINER e
-- concesse a tutti gli "authenticated", che include i clienti del portale.
-- Bypassano quindi is_staff() e permettono a un cliente di sapere la
-- modalita' del bonus, l'importo al pezzo e tutte le fasce. Aggiungiamo una
-- guardia in testa a entrambe: il resto del corpo resta identico a com'e' in
-- 20260917_bonus_2_rpc.sql.
--
-- bonus_regola_corrente era "language sql": per aggiungere la guardia va
-- convertita in plpgsql, conservando lo stesso valore di ritorno.

create or replace function public.bonus_regola_corrente()
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'Operazione riservata al personale';
  end if;

  return jsonb_build_object(
    'modo',       coalesce((select valore #>> '{}' from public.impostazioni_app
                            where chiave = 'bonus_modo'), 'percentuale'),
    'euro_pezzo', coalesce((select (valore #>> '{}')::numeric from public.impostazioni_app
                            where chiave = 'bonus_euro_pezzo'), 0),
    'fasce',      coalesce((select jsonb_agg(jsonb_build_object(
                                'da_prezzo', da_prezzo, 'percentuale', percentuale)
                                order by da_prezzo)
                            from public.bonus_fasce), '[]'::jsonb)
  );
end;
$$;

grant execute on function public.bonus_regola_corrente() to authenticated;

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
  if not public.is_staff() then
    raise exception 'Operazione riservata al personale';
  end if;

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
