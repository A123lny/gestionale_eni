-- allineamento_lavaggi_20260916.sql
-- Allinea TUTTI i lavaggi del periodo 2026-08-01 .. 2026-09-12, cosi' che
-- l'incasso della sezione Lavaggi torni identico al venduto lavaggi in Cassa.
-- Richiesto esplicitamente dall'utente il 2026-09-16.
--
-- ATTENZIONE: modifica scritture contabili GIA' CHIUSE.
-- Rollback: sql/allineamento_lavaggi_20260916_ROLLBACK.sql
--
-- PREREQUISITO: aver gia' lanciato 20260916_lavaggi_pagamento.sql
-- (senza, il vincolo su vendite.metodo_pagamento rifiuta 'fattura'
--  e la colonna lavaggi.stato_pagamento non esiste).
--
-- COSA FA
--   A) crea la vendita mancante per OGNI lavaggio completato del periodo (109):
--        - cliente ad addebito differito -> metodo 'fattura', incassato 0
--          (il ricavo conta nel venduto, i soldi arrivano con la fattura)
--        - tutti gli altri               -> metodo 'contanti'
--   B) converte le 38 vendite corporate gia' esistenti da 'contanti' a 'fattura'
--
--   Al termine, per ogni giornata:  somma lavaggi = venduto lavaggi in Cassa.
--
-- COSA NON FA
--   - non tocca le fatture: verificato che non esistono trigger ne' foreign key
--     verso vendite/lavaggi, e che il modulo Fatturazione non legge da queste
--     tabelle. Numero di controllo pre-intervento: 74 fatture, 29.532,27 EUR
--     nel periodo 01/08-16/09.
--   - non tocca la tabella cassa: i totali salvati delle giornate chiuse restano
--     quelli. Per vederli aggiornati va riaperta e risalvata la singola giornata.
--   - non fa quadrare le casse (verificato: 0 quadrano prima, 0 dopo).
--   - non tocca il doppione VEN846/VEN848 (stesso lavaggio LAV1128, 30 EUR due
--     volte, 14/08 Dr.ssa Marchi): va deciso a mano.
--
-- Tutto in UNA transazione: se qualcosa fallisce non resta nulla a meta'.

begin;

-- ============================================================
-- Prerequisiti: meglio fermarsi subito che a meta' strada
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'vendite_metodo_pagamento_check'
       and pg_get_constraintdef(oid) like '%fattura%'
  ) then
    raise exception 'Lancia prima 20260916_lavaggi_pagamento.sql: il vincolo non ammette ''fattura''';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema='public' and table_name='lavaggi' and column_name='stato_pagamento'
  ) then
    raise exception 'Lancia prima 20260916_lavaggi_pagamento.sql: manca lavaggi.stato_pagamento';
  end if;
end $$;


-- ============================================================
-- A) Vendita mancante per OGNI lavaggio completato del periodo
-- Marcatore 'ALLINEAMENTO 20260916 CREATA' per riconoscerle e annullarle.
-- ============================================================
do $$
declare
  r          record;
  v_codice   text;
  v_vendita  public.vendite%rowtype;
  v_metodo   text;
  n_cont     int := 0;  tot_cont numeric := 0;
  n_fatt     int := 0;  tot_fatt numeric := 0;
begin
  for r in
    select l.id, l.codice, l.data, l.prezzo, l.tipo_lavaggio, l.nome_cliente,
           (c.modalita_pagamento in ('Addebito_Mese','Addebito_30gg','Addebito_60gg','Bonifico_Anticipato'))
             as differito
      from public.lavaggi l
      left join public.vendite v on v.lavaggio_id = l.id and v.stato <> 'annullata'
      left join public.clienti c on c.id = l.cliente_id
     where l.stato = 'Completato'
       and l.data between date '2026-08-01' and date '2026-09-12'
       and v.id is null
     order by l.data, l.codice
  loop
    v_metodo := case when coalesce(r.differito, false) then 'fattura' else 'contanti' end;
    v_codice := public.get_prossimo_codice('VEN', 'vendite', 'codice');

    insert into public.vendite (
      codice, data, ora, operatore_id, operatore_nome, subtotale, sconto_globale,
      sconto_globale_tipo, totale, metodo_pagamento, importo_contanti, importo_pos,
      importo_buono, importo_wallet, resto, stato, note, lavaggio_id, note_lavaggio
    ) values (
      v_codice, r.data, '12:00:00', null, 'Allineamento',
      r.prezzo, 0, 'fisso', r.prezzo, v_metodo,
      case when v_metodo = 'contanti' then r.prezzo else 0 end, 0, 0, 0, 0,
      'completata', 'ALLINEAMENTO 20260916 CREATA', r.id,
      r.codice || ' - ' || coalesce(r.nome_cliente, 'Walk-in')
    )
    returning * into v_vendita;

    insert into public.vendite_dettaglio (
      vendita_id, prodotto_id, codice_prodotto, nome_prodotto, categoria,
      quantita, prezzo_unitario, sconto, sconto_tipo, totale_riga
    ) values (
      v_vendita.id, null, r.codice,
      r.tipo_lavaggio || case when coalesce(r.nome_cliente,'Walk-in') <> 'Walk-in'
                              then ' - ' || r.nome_cliente else '' end,
      'Lavaggi', 1, r.prezzo, 0, 'fisso', r.prezzo
    );

    update public.lavaggi set stato_pagamento = v_metodo where id = r.id;

    if v_metodo = 'fattura' then
      n_fatt := n_fatt + 1;  tot_fatt := tot_fatt + r.prezzo;
    else
      n_cont := n_cont + 1;  tot_cont := tot_cont + r.prezzo;
    end if;
  end loop;

  raise notice 'A) create % vendite contanti (% EUR) e % a fattura (% EUR)',
    n_cont, tot_cont, n_fatt, tot_fatt;
end $$;


-- ============================================================
-- B) Corporate gia' registrati: da 'contanti' a 'fattura'
-- Il ricavo resta nel venduto, l'importo esce dai contanti di giornata.
-- Marcatore 'ALLINEAMENTO 20260916 CONVERTITA', distinto da quello delle
-- create: senza due marcatori diversi una vendita senza note finirebbe
-- indistinguibile e il rollback non saprebbe cosa cancellare.
-- ============================================================
do $$
declare
  n int; tot numeric;
begin
  with target as (
    select v.id, v.totale
      from public.lavaggi l
      join public.vendite v on v.lavaggio_id = l.id and v.stato <> 'annullata'
      join public.clienti c on c.id = l.cliente_id
     where c.modalita_pagamento in ('Addebito_Mese','Addebito_30gg','Addebito_60gg','Bonifico_Anticipato')
       and l.data between date '2026-08-01' and date '2026-09-12'
       and v.metodo_pagamento <> 'fattura'
       and coalesce(v.note, '') not like '%ALLINEAMENTO 20260916%'
  ),
  upd as (
    update public.vendite v
       set metodo_pagamento = 'fattura',
           importo_contanti = 0,
           importo_pos      = 0,
           note = coalesce(nullif(v.note, '') || ' | ', '') || 'ALLINEAMENTO 20260916 CONVERTITA'
      from target t
     where v.id = t.id
    returning t.totale
  )
  select count(*), coalesce(sum(totale), 0) into n, tot from upd;

  raise notice 'B) convertite a fattura: % vendite per % EUR', n, tot;
end $$;

-- stato_pagamento sui lavaggi corporate corrispondenti
update public.lavaggi l
   set stato_pagamento = 'fattura'
  from public.clienti c
 where c.id = l.cliente_id
   and c.modalita_pagamento in ('Addebito_Mese','Addebito_30gg','Addebito_60gg','Bonifico_Anticipato')
   and l.stato = 'Completato'
   and l.data between date '2026-08-01' and date '2026-09-12';


-- ============================================================
-- C) Aggiornamento della tabella cassa
--
-- Le giornate chiuse hanno i totali CONGELATI al momento della chiusura:
-- non si aggiornano da soli quando cambiano le vendite. Qui li riallineiamo.
--
-- C0) Backup obbligatorio. NON si puo' ricalcolare all'indietro: su 9 delle
--     35 giornate (1-13 agosto) il venduto_lavaggi salvato diverge da quello
--     ricavabile dalle vendite, perche' all'epoca il campo si scriveva a mano
--     e non era ancora in sola lettura. Senza backup il rollback sostituirebbe
--     quei valori con un ricalcolo, cioe' li cambierebbe invece di ripristinarli.
-- ============================================================
create table if not exists public.cassa_backup_20260916 as
select id, data, venduto_lavaggi, crediti_lavaggi_fattura,
       totale_venduto, totale_crediti, totale_incassato, differenza,
       now() as salvato_il
  from public.cassa
 where data between date '2026-08-01' and date '2026-09-12'
   and stato = 'chiusa';

do $$
declare n int;
begin
  select count(*) into n from public.cassa_backup_20260916;
  if n = 0 then
    raise exception 'Backup cassa vuoto: mi fermo invece di procedere alla cieca';
  end if;
  raise notice 'C0) backup di % giornate in cassa_backup_20260916', n;
end $$;


-- C) Riallinea venduto_lavaggi e crediti_lavaggi_fattura, e ricalcola i totali.
-- totale_incassato NON si tocca: i soldi fisicamente contati sono quelli.
-- I totali si aggiornano per DIFFERENZA sui valori salvati, senza ricostruire
-- l'intera formula: e' gia' stato verificato che su tutte e 35 le giornate
-- differenza == totale_venduto - totale_incassato - totale_crediti al centesimo.
do $$
declare n int;
begin
  with nuovi as (
    select k.id,
           coalesce((
             select sum(vd.totale_riga)
               from public.vendite v
               join public.vendite_dettaglio vd on vd.vendita_id = v.id
              where v.data = k.data and v.stato = 'completata'
                and vd.categoria = 'Lavaggi'
           ), 0) as new_lavaggi,
           coalesce((
             select sum(v.totale)
               from public.vendite v
              where v.data = k.data and v.stato = 'completata'
                and v.metodo_pagamento = 'fattura'
           ), 0) as new_fattura
      from public.cassa k
     where k.data between date '2026-08-01' and date '2026-09-12'
       and k.stato = 'chiusa'
  ),
  upd as (
    update public.cassa k
       set venduto_lavaggi         = n.new_lavaggi,
           crediti_lavaggi_fattura = n.new_fattura,
           totale_venduto = k.totale_venduto
                            - coalesce(k.venduto_lavaggi, 0) + n.new_lavaggi,
           totale_crediti = k.totale_crediti
                            - coalesce(k.crediti_lavaggi_fattura, 0) + n.new_fattura,
           differenza = (k.totale_venduto - coalesce(k.venduto_lavaggi, 0) + n.new_lavaggi)
                        - k.totale_incassato
                        - (k.totale_crediti - coalesce(k.crediti_lavaggi_fattura, 0) + n.new_fattura),
           updated_at = now()
      from nuovi n
     where k.id = n.id
    returning 1
  )
  select count(*) into n from upd;
  raise notice 'C) casse aggiornate: %', n;
end $$;


-- ============================================================
-- VERIFICA: per ogni giornata del periodo, la somma dei lavaggi
-- completati deve essere identica al venduto lavaggi che la Cassa
-- legge dalle vendite. E' il senso dell'intera operazione.
-- ============================================================
do $$
declare
  r        record;
  scostati int := 0;
begin
  for r in
    select l.data,
           round(sum(l.prezzo), 2) as tot_lavaggi,
           round(coalesce((
             select sum(vd.totale_riga)
               from public.vendite v
               join public.vendite_dettaglio vd on vd.vendita_id = v.id
              where v.data = l.data and v.stato = 'completata'
                and v.lavaggio_id is not null and vd.categoria = 'Lavaggi'
           ), 0), 2) as tot_cassa
      from public.lavaggi l
     where l.stato = 'Completato'
       and l.data between date '2026-08-01' and date '2026-09-12'
     group by l.data
  loop
    if abs(r.tot_lavaggi - r.tot_cassa) > 0.01 then
      raise warning 'Giornata % ancora scostata: lavaggi % vs vendite %',
        r.data, r.tot_lavaggi, r.tot_cassa;
      scostati := scostati + 1;
    end if;
  end loop;

  if scostati > 0 then
    raise exception 'Allineamento non riuscito su % giornate: ROLLBACK', scostati;
  end if;
  raise notice 'OK: su tutte le giornate del periodo lavaggi e vendite coincidono.';
end $$;

-- Seconda verifica: il campo venduto_lavaggi scritto in cassa deve essere
-- uguale alla somma dei lavaggi di quella giornata. E' il numero che l'utente
-- vede a schermo, ed e' l'obiettivo dichiarato dell'operazione.
do $$
declare
  r        record;
  scostati int := 0;
begin
  for r in
    select k.data,
           round(coalesce(k.venduto_lavaggi, 0), 2) as in_cassa,
           round(coalesce((
             select sum(l.prezzo) from public.lavaggi l
              where l.data = k.data and l.stato = 'Completato'
           ), 0), 2) as tot_lavaggi
      from public.cassa k
     where k.data between date '2026-08-01' and date '2026-09-12'
       and k.stato = 'chiusa'
  loop
    if abs(r.in_cassa - r.tot_lavaggi) > 0.01 then
      raise warning 'Cassa % : venduto_lavaggi % vs lavaggi del giorno %',
        r.data, r.in_cassa, r.tot_lavaggi;
      scostati := scostati + 1;
    end if;
  end loop;

  if scostati > 0 then
    raise exception 'Cassa non allineata su % giornate: ROLLBACK', scostati;
  end if;
  raise notice 'OK: in tutte le casse il venduto lavaggi e'' uguale ai lavaggi del giorno.';
end $$;

commit;
