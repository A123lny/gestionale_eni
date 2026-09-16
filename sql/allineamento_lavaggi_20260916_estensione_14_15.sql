-- allineamento_lavaggi_20260916_estensione_14_15.sql
-- Estende l'allineamento al 13-15 settembre, giornate escluse dal primo
-- intervento perche' le casse del 14 e 15 non erano state compilate.
--
-- PREREQUISITO: aver gia' lanciato 20260916_lavaggi_pagamento.sql
--               e allineamento_lavaggi_20260916.sql
--
-- COSA FA
--   A) crea 5 vendite mancanti:
--        14/09  LAV1291, LAV1292, LAV1293  Ippo/Zonzini   -> fattura, 90 EUR
--        15/09  LAV1302 (PRIVATO), LAV1303 (Walk-in)      -> contanti, 44 EUR
--   B) converte a 'fattura' le 3 vendite corporate gia' esistenti:
--        VEN999 (Ippo/Zonzini), VEN1000 (Areauto-Guerra), VEN1002 (Passion Car)
--
-- COSA NON FA
--   - non tocca la tabella cassa: il 14/09 e' ancora 'aperta' e il 15/09 non
--     esiste. Quando le compilerai, la Cassa leggera' il venduto lavaggi dal
--     vivo dalle vendite, quindi prendera' da sola i valori corretti.
--   - nessun doppione e nessun importo discordante in queste giornate:
--     verificato prima di scrivere lo script.
--
-- Usa gli STESSI marcatori del primo allineamento, cosi' il rollback esistente
-- annulla anche questo intervento.

begin;

-- ============================================================
-- A) Vendite mancanti (metodo dedotto dall'anagrafica cliente)
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
       and l.data between date '2026-09-13' and date '2026-09-15'
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
       and l.data between date '2026-09-13' and date '2026-09-15'
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

update public.lavaggi l
   set stato_pagamento = 'fattura'
  from public.clienti c
 where c.id = l.cliente_id
   and c.modalita_pagamento in ('Addebito_Mese','Addebito_30gg','Addebito_60gg','Bonifico_Anticipato')
   and l.stato = 'Completato'
   and l.data between date '2026-09-13' and date '2026-09-15';

update public.lavaggi l
   set stato_pagamento = 'contanti'
  from public.vendite v
 where v.lavaggio_id = l.id and v.stato <> 'annullata'
   and v.metodo_pagamento = 'contanti'
   and l.stato = 'Completato'
   and l.data between date '2026-09-13' and date '2026-09-15'
   and l.stato_pagamento is null;


-- ============================================================
-- VERIFICA: per ogni giornata, lavaggi == vendite lavaggi.
-- Se una sola non torna, ROLLBACK di tutto.
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
           ), 0), 2) as tot_vendite
      from public.lavaggi l
     where l.stato = 'Completato'
       and l.data between date '2026-09-13' and date '2026-09-15'
     group by l.data
  loop
    if abs(r.tot_lavaggi - r.tot_vendite) > 0.01 then
      raise warning 'Giornata % scostata: lavaggi % vs vendite %',
        r.data, r.tot_lavaggi, r.tot_vendite;
      scostati := scostati + 1;
    end if;
  end loop;

  if scostati > 0 then
    raise exception 'Allineamento non riuscito su % giornate: ROLLBACK', scostati;
  end if;
  raise notice 'OK: 14 e 15 settembre allineati, lavaggi e vendite coincidono.';
end $$;

commit;
