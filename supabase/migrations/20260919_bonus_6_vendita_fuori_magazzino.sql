-- ############################################################
-- ##  NON RILANCIARE QUESTA MIGRATION.                      ##
-- ##                                                         ##
-- ##  E' stata applicata il 19/09/2026 e subito dopo disfatta ##
-- ##  dalla 20260919_bonus_7_dalle_vendite.sql, che ha tolto  ##
-- ##  registra_vendita_bonus_libera insieme all'altra RPC di  ##
-- ##  vendita: dal 19/09 le vendite si registrano SOLO dal     ##
-- ##  modulo Vendite.                                          ##
-- ##                                                           ##
-- ##  Rilanciandola si rimetterebbe in piedi l'unico percorso   ##
-- ##  in cui il prezzo di vendita arriva dal browser invece che ##
-- ##  dal listino. Resta qui solo come storia di cos'e' stato   ##
-- ##  fatto. Il BONUS_PREZZO_MAX citato sotto non esiste piu'.  ##
-- ############################################################

-- Bonus venduto: vendere al banco una cosa che in magazzino non c'e' ancora
--
-- Chiesto dal gestore il 19/09/2026: arriva merce nuova, il cliente la compra
-- prima che qualcuno l'abbia caricata, e il dipendente non deve restare fermo.
-- Regola sua, testuale: "lo puo' aggiungere nel venduto, ma non appare in
-- magazzino finche' non lo si carica, e gli rimane a lui come vendita".
--
-- Quindi: nasce la vendita (i soldi entrano in cassa) e nasce il movimento
-- bonus intestato a chi ha venduto, ma NON nasce nessun articolo di magazzino
-- e NESSUNA giacenza si muove. La riga di vendita ha prodotto_id nullo, e
-- salva_vendita salta da sola lo scarico quando quel campo manca.
--
-- Funzione SEPARATA da registra_vendita_bonus apposta: quella garantisce che
-- il prezzo lo decida il magazzino e non il client, ed e' una garanzia che
-- deve restare intatta. Qui il prezzo lo scrive per forza il dipendente,
-- perche' l'articolo non esiste ancora: e' l'unico punto del modulo dove
-- succede, ed e' per questo che c'e' un tetto.
--
-- TETTO: 100 EUR al pezzo, deciso dal gestore. Non e' sfiducia, e' il tasto
-- sbagliato: chi batte 1200 invece di 12,00 si ritroverebbe un bonus gonfiato
-- e, molto peggio, una vendita fantasma da 1.200 EUR nella cassa di giornata,
-- da inseguire poi a mano. Stesso limite anche nel browser
-- (BONUS_PREZZO_MAX in js/modules/bonus-venduto.js): quello spegne il
-- pulsante, questo e' la rete sotto.
--
-- DA LANCIARE DOPO le altre cinque migration del bonus.
-- Non tocca nessun dato e non modifica nessuna funzione esistente.

create or replace function public.registra_vendita_bonus_libera(
    p_nome     text,
    p_prezzo   numeric,
    p_quantita integer,
    p_metodo   text)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_staff    uuid;
  v_nome     text;
  v_calc     jsonb;
  v_imponib  numeric(10,2);
  -- Il database gira in UTC: current_date fra mezzanotte e le 02:00 italiane
  -- e' ancora ieri, e il movimento finirebbe nel mese precedente, che puo'
  -- essere gia' chiuso e pagato.
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

  v_nome := nullif(btrim(coalesce(p_nome, '')), '');
  if v_nome is null then
    raise exception 'Scrivi il nome di quello che hai venduto';
  end if;
  if length(v_nome) > 120 then
    raise exception 'Il nome e'' troppo lungo: massimo 120 caratteri';
  end if;

  if p_quantita is null or p_quantita < 1 then
    raise exception 'La quantita'' deve essere almeno 1';
  end if;
  -- Stessa logica del tetto sul prezzo: 99 pezzi di una cosa non ancora
  -- caricata sono gia' tanti, 999 sono una battitura.
  if p_quantita > 99 then
    raise exception 'Troppi pezzi per un articolo non ancora in magazzino: massimo 99';
  end if;

  if p_prezzo is null or p_prezzo <= 0 then
    raise exception 'Scrivi il prezzo di vendita';
  end if;
  if p_prezzo > 100 then
    raise exception 'Prezzo troppo alto per una vendita al banco (massimo 100 €): se e'' giusto, caricalo prima in magazzino';
  end if;

  v_imponib := round(p_prezzo * p_quantita, 2);
  v_calc    := public.bonus_riga_calcola(p_prezzo, p_quantita);

  -- Vendita atomica. prodotto_id nullo: nessun articolo da collegare, e
  -- salva_vendita non tocca nessuna giacenza.
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
      'note',             'Bonus venduto · fuori magazzino'),
    jsonb_build_array(jsonb_build_object(
      'prodotto_id',     null,
      'codice_prodotto', null,
      'barcode',         null,
      'nome_prodotto',   v_nome,
      'categoria',       null,
      'quantita',        p_quantita,
      'prezzo_unitario', p_prezzo,
      'sconto',          0,
      'totale_riga',     v_imponib)),
    'VEN');

  -- magazzino_id nullo + vendita_id valorizzato = venduta al banco senza
  -- articolo. Le righe aggiunte a mano dal gestore hanno il contrario
  -- (vendita_id nullo), quindi le due cose restano distinguibili senza
  -- bisogno di una colonna nuova.
  insert into public.bonus_movimenti (
    personale_id, vendita_id, magazzino_id, nome_prodotto, quantita,
    prezzo_unitario, imponibile, regola_modo, regola_valore, bonus_calcolato,
    anno, mese)
  values (
    v_staff, (v_vendita ->> 'id')::uuid, null, v_nome, p_quantita,
    p_prezzo, v_imponib,
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

grant execute on function public.registra_vendita_bonus_libera(text, numeric, integer, text) to authenticated;
