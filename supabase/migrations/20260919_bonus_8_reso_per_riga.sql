-- Bonus venduto: tre correzioni emerse dalla revisione del 19/09/2026
--
-- DA LANCIARE DOPO le altre sette migration del bonus.
-- Aggiunge una colonna (nessun dato esistente viene toccato: al momento
-- bonus_movimenti e' vuota) e sostituisce due inneschi.

-- 1) Sapere a quale riga di scontrino appartiene ogni bonus --------------
--
-- Serve per il reso: finche' una vendita era un articolo solo, cancellare il
-- bonus "di quella vendita" era corretto. Ora uno scontrino ha piu' righe, e
-- il cliente che riporta indietro il deodorante da 2 EUR non deve far perdere
-- al dipendente anche il bonus dell'olio e delle spazzole.
alter table public.bonus_movimenti
    add column if not exists vendita_dettaglio_id uuid
        references public.vendite_dettaglio(id) on delete cascade;

comment on column public.bonus_movimenti.vendita_dettaglio_id is
    'La riga di scontrino che ha generato questo bonus. Null per le righe aggiunte a mano dal gestore e per i movimenti nati prima del 19/09/2026.';

create index if not exists bonus_movimenti_dettaglio_idx
    on public.bonus_movimenti (vendita_dettaglio_id);

-- 2) L'innesco che crea il bonus: tre correzioni -------------------------
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
  v_quota   numeric;
  v_importo numeric(10,2);
  v_bonus   numeric(10,2);
  v_data    date;
begin
  -- CHI ha venduto lo decide la sessione, non vendite.operatore_id che lo
  -- scrive il browser e puo' non corrispondere.
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

  if v_vend.lavaggio_id is not null then
    return new;
  end if;
  if v_vend.stato is distinct from 'completata' then
    return new;
  end if;

  -- CORREZIONE A: "Incasso Credito" non e' una vendita.
  -- E' il rientro di un debito pregresso (il gestionale lo dice a chiare
  -- lettere e la cassa lo esclude dal venduto, sottraendolo dai crediti).
  -- Senza questa riga, registrare 400 EUR che un cliente restituisce
  -- fruttava 40 EUR di premio a chi batteva il tasto. Oggi quei rientri li
  -- registra solo il gestore, che e' gia' escluso, ma gli altri due Admin
  -- non lo sono.
  if new.categoria in ('Lavaggi', 'Incasso Credito') then
    return new;
  end if;

  -- bonus_movimenti.quantita e' un intero con vincolo >= 1, mentre in vendita
  -- la quantita' e' numerica. Una frazione farebbe fallire l'inserimento e,
  -- da dentro un innesco, si porterebbe dietro tutta la vendita.
  if new.quantita is null or new.quantita < 1 or new.quantita <> trunc(new.quantita) then
    return new;
  end if;

  -- CORREZIONE B: lo sconto sull'intero scontrino.
  -- totale_riga contiene solo lo sconto di QUELLA riga; lo sconto globale
  -- vive sulla testata. Senza tenerne conto, un carrello da 100 EUR scontato
  -- a 50 pagava il bonus su 100 - e con uno sconto pari al totale si pagava
  -- il premio su una vendita incassata zero. Si ripartisce in proporzione:
  -- ogni riga contribuisce per la sua quota di sconto.
  v_quota := 1;
  if coalesce(v_vend.subtotale, 0) > 0 and v_vend.totale is not null then
    v_quota := v_vend.totale / v_vend.subtotale;
    if v_quota < 0 then v_quota := 0; end if;
    if v_quota > 1 then v_quota := 1; end if;   -- maggiorazioni: non gonfiano il bonus
  end if;

  v_importo := round(coalesce(new.totale_riga, 0) * v_quota, 2);
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
    personale_id, vendita_id, vendita_dettaglio_id, magazzino_id, nome_prodotto,
    quantita, prezzo_unitario, imponibile, regola_modo, regola_valore,
    bonus_calcolato, anno, mese)
  values (
    v_staff, v_vend.id, new.id, new.prodotto_id, new.nome_prodotto,
    new.quantita::int, round(coalesce(new.prezzo_unitario, 0), 2), v_importo,
    coalesce(v_calc ->> 'regola_modo', 'percentuale'),
    (v_calc ->> 'regola_valore')::numeric,
    v_bonus,
    extract(year from v_data)::int, extract(month from v_data)::int);

  return new;

exception
  -- Al banco il registratore di cassa viene prima del bonus: qualunque cosa
  -- vada storta qui, la vendita deve concludersi.
  when others then
    return new;
end;
$$;

-- 3) Il reso toglie il bonus SOLO della riga resa ------------------------
--
-- Decisione del gestore, 19/09/2026. Nota: se di una riga da 3 pezzi ne torna
-- indietro 1, il bonus di quella riga se ne va tutto - "solo di quell'articolo"
-- vuol dire la riga, non il singolo pezzo. Riconoscere la parte rimasta
-- venduta e' un gesto del gestore ("aggiungi riga a mano"), come per il resto
-- del modulo: cosi' non si paga mai piu' del dovuto.
create or replace function public.togli_bonus_riga_resa()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  if new.vendita_dettaglio_id is not null then
    delete from public.bonus_movimenti
    where vendita_dettaglio_id = new.vendita_dettaglio_id;
  end if;
  return new;
end;
$$;

drop trigger if exists resi_dettaglio_bonus on public.resi_dettaglio;
create trigger resi_dettaglio_bonus
  after insert on public.resi_dettaglio
  for each row
  execute function public.togli_bonus_riga_resa();

-- 4) L'innesco sulla vendita non fa piu' piazza pulita su un reso parziale
--
-- Annullamento e reso TOTALE cancellano tutto, ed e' giusto: la vendita
-- intera non esiste piu'. Il reso PARZIALE invece non deve toccare le righe
-- rimaste: ci ha gia' pensato l'innesco qui sopra, riga per riga.
-- Ordine: salvaReso inserisce prima resi_dettaglio e solo dopo aggiorna lo
-- stato della vendita, quindi quando arriva qui il lavoro e' gia' fatto.
create or replace function public.togli_bonus_vendita_annullata_o_resa()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  -- Guardia sul PASSAGGIO verso uno di questi stati, non su ogni update di
  -- una vendita che gia' ci si trova: senza, un aggiornamento qualsiasi di
  -- una vendita gia' annullata ripeterebbe la delete ad ogni salvataggio.
  if new.stato in ('annullata', 'reso_totale')
     and old.stato is distinct from new.stato then
    delete from public.bonus_movimenti where vendita_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists vendite_bonus_annullamento_o_reso on public.vendite;
create trigger vendite_bonus_annullamento_o_reso
  after update on public.vendite
  for each row
  execute function public.togli_bonus_vendita_annullata_o_resa();
