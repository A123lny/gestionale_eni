-- Bonus venduto: vale su TUTTO il magazzino
--
-- Cambio di perimetro deciso dal gestore: il bonus non si accende piu' articolo
-- per articolo, vale su tutta la merce. Restano fuori solo il carburante, che
-- non sta in questa tabella, e i servizi di Lavaggio, che hanno gia' il proprio
-- modulo e la propria strada verso la cassa.
--
-- DA LANCIARE DOPO 20260917_bonus_1_schema.sql e 20260917_bonus_2_rpc.sql.
--
-- La migration 20260917_bonus_magazzino_guard.sql non esiste piu': creava un
-- trigger che questo file toglie immediatamente dopo, quindi lanciarla sarebbe
-- stato lavoro sprecato. Il "drop trigger if exists" qui sotto resta comunque
-- dov'era, cosi' se il gestore l'avesse gia' lanciata prima di questa
-- correzione il trigger viene disfatto lo stesso.
-- Non tocca nessun dato: sostituisce una funzione e toglie un trigger.
--
-- ATTENZIONE: rilanciare 20260917_bonus_2_rpc.sql DOPO questa riporta indietro
-- il vecchio comportamento (di nuovo il controllo su bonus_attivo): dal
-- portale non sarebbe piu' vendibile niente, perche' bonus_attivo non lo
-- mette a true nessuno dall'interfaccia.

-- 1) Via il trigger: non c'e' piu' nessun interruttore da proteggere ---------
drop trigger if exists magazzino_bonus_attivo_guard on public.magazzino;
drop function if exists public.blocca_bonus_attivo_non_gestore();

-- 2) La colonna resta ma non la legge piu' nessuno ---------------------------
comment on column public.magazzino.bonus_attivo is
    'NON PIU'' USATA dal 17/09/2026: il bonus vale su tutto il magazzino. Colonna lasciata sul database perche'' togliere una colonna in produzione non si disfa. Non usarla per decidere chi da'' bonus.';

-- 3) La funzione di vendita: niente piu' controllo su bonus_attivo -----------
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
  -- Il database gira in UTC: current_date fra mezzanotte e le 02:00 italiane
  -- e' ancora ieri, e il movimento finirebbe nel mese precedente, che puo'
  -- essere gia' chiuso e pagato. Stesso pattern di 20260827_timbrature.sql.
  v_oggi     date := (now() at time zone 'Europe/Rome')::date;
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

  -- for update: senza il lock due chiamate in parallelo leggono la stessa
  -- giacenza e passano entrambe il controllo. movimenta_giacenza non solleva
  -- errore quando la scorta non basta, fa greatest(0, ...) in silenzio: si
  -- pagherebbe il bonus due volte per un pezzo solo.
  select * into v_art from public.magazzino where id = p_magazzino_id for update;
  if not found then
    raise exception 'Articolo non trovato';
  end if;
  if v_art.attivo is not true then
    raise exception 'Articolo non attivo';
  end if;
  -- I lavaggi hanno il loro modulo e la loro strada verso la cassa: venderli
  -- anche da qui creerebbe due registrazioni per la stessa vendita.
  if v_art.categoria = 'Lavaggi' then
    raise exception 'I lavaggi si registrano dal modulo Lavaggi, non da qui';
  end if;
  if coalesce(v_art.prezzo_vendita, 0) <= 0 then
    raise exception 'Questo articolo non ha un prezzo di vendita';
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
      'ora',              to_char(now() at time zone 'Europe/Rome', 'HH24:MI:SS'),
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
