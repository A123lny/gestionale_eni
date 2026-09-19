-- Bonus venduto: interruttore generale del modulo
--
-- Il gestore vuole poterlo accendere quando e' pronto, non appena il codice
-- va in produzione. L'interruttore sta in Impostazioni -> Bonus venduto.
--
-- UNA SOLA VERITA': si riusa l'elenco 'moduli_disabilitati' di
-- impostazioni_app, quello che gia' decide quali voci compaiono nel menu.
-- L'interruttore ci mette (o toglie) 'bonus-venduto' e 'bonus-gestione', e
-- questo innesco legge lo stesso elenco.
--
-- Perche' serve anche qui e non basta nascondere il menu: senza questo
-- controllo, a modulo "spento" ogni vendita continuerebbe a creare movimenti.
-- Riaccendendolo, il gestore si troverebbe un maturato da pagare accumulato in
-- un periodo in cui credeva che il bonus non esistesse.
--
-- DA LANCIARE DOPO le altre otto migration del bonus.
-- Non tocca nessun dato: sostituisce una funzione.
--
-- NOTA: l'elenco assente o vuoto significa "tutto acceso", che e' il
-- comportamento storico dei moduli opzionali. Per partire spento basta
-- spegnere l'interruttore una volta: il valore sta sul database, quindi vale
-- subito anche per l'app pubblicata.

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
  -- Interruttore generale: modulo spento, nessun bonus matura.
  -- jsonb_exists invece dell'operatore ? per non litigare con i client che
  -- scambiano il punto interrogativo per un segnaposto di parametro.
  if exists (
    select 1 from public.impostazioni_app
    where chiave = 'moduli_disabilitati'
      and jsonb_exists(valore, 'bonus-venduto')
  ) then
    return new;
  end if;

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

  -- "Incasso Credito" e' il rientro di un debito, non una vendita: il
  -- gestionale lo dichiara e la cassa lo esclude dal venduto.
  if new.categoria in ('Lavaggi', 'Incasso Credito') then
    return new;
  end if;

  -- bonus_movimenti.quantita e' un intero con vincolo >= 1, mentre in vendita
  -- la quantita' e' numerica. Una frazione farebbe fallire l'inserimento e,
  -- da dentro un innesco, si porterebbe dietro tutta la vendita.
  if new.quantita is null or new.quantita < 1 or new.quantita <> trunc(new.quantita) then
    return new;
  end if;

  -- Lo sconto sull'intero scontrino vive sulla testata, non sulle righe: si
  -- ripartisce in proporzione, cosi' il bonus si paga su quello che il
  -- cliente ha davvero lasciato.
  v_quota := 1;
  if coalesce(v_vend.subtotale, 0) > 0 and v_vend.totale is not null then
    v_quota := v_vend.totale / v_vend.subtotale;
    if v_quota < 0 then v_quota := 0; end if;
    if v_quota > 1 then v_quota := 1; end if;
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
