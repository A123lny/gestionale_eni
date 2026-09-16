-- allineamento_lavaggi_20260916.sql
-- Allinea i lavaggi del periodo 2026-08-01 .. 2026-09-12 a quanto e' realmente
-- accaduto, su richiesta esplicita dell'utente (2026-09-16).
--
-- ATTENZIONE: modifica scritture contabili GIA' CHIUSE.
-- Rollback disponibile: sql/allineamento_lavaggi_20260916_ROLLBACK.sql
--
-- PREREQUISITO: aver gia' lanciato 20260916_lavaggi_pagamento.sql
-- (senza, il vincolo su vendite.metodo_pagamento rifiuta 'fattura'
--  e la colonna lavaggi.stato_pagamento non esiste).
--
-- COSA FA
--   A) crea 53 vendite per i lavaggi pagati sul momento che non ne avevano
--      nessuna (1.107 EUR), metodo 'contanti' come da comportamento storico
--   B) converte 38 vendite di clienti ad addebito mensile da 'contanti' a
--      'fattura' (1.116 EUR): restano nel venduto, escono dai contanti
--
-- COSA NON FA
--   - non tocca la tabella cassa: i totali salvati delle giornate chiuse
--     restano quelli. Per vederli aggiornati va riaperta e risalvata la
--     singola giornata dal modulo Cassa.
--   - non fa quadrare le casse: verificato in anticipo, 0 giornate quadrano
--     prima e 0 dopo, l'errore assoluto passa da 6.883 a 7.073 EUR.
--   - non tocca il doppione VEN846/VEN848 (stesso lavaggio LAV1128,
--     30 EUR due volte): va deciso a mano.
--
-- Tutto in UNA transazione: se qualcosa fallisce non resta nulla a meta'.

begin;

-- ============================================================
-- Controllo prerequisiti: meglio fermarsi subito che a meta'
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
-- A) Vendite mancanti per i lavaggi pagati sul momento
-- Le nuove vendite portano note = 'ALLINEAMENTO 20260916' per essere
-- riconoscibili a colpo d'occhio e annullabili in blocco.
-- ============================================================
do $$
declare
  r          record;
  v_codice   text;
  v_vendita  public.vendite%rowtype;
  n          int := 0;
  tot        numeric := 0;
begin
  for r in
    select l.id, l.codice, l.data, l.prezzo, l.tipo_lavaggio, l.nome_cliente
      from public.lavaggi l
      left join public.vendite v on v.lavaggio_id = l.id and v.stato <> 'annullata'
      left join public.clienti c on c.id = l.cliente_id
     where l.stato = 'Completato'
       and l.data between date '2026-08-01' and date '2026-09-12'
       and v.id is null
       and coalesce(c.modalita_pagamento, 'Cash') <> 'Addebito_Mese'
     order by l.data, l.codice
  loop
    v_codice := public.get_prossimo_codice('VEN', 'vendite', 'codice');

    insert into public.vendite (
      codice, data, ora, operatore_id, operatore_nome, subtotale, sconto_globale,
      sconto_globale_tipo, totale, metodo_pagamento, importo_contanti, importo_pos,
      importo_buono, importo_wallet, resto, stato, note, lavaggio_id, note_lavaggio
    ) values (
      v_codice, r.data, '12:00:00', null, 'Allineamento',
      r.prezzo, 0, 'fisso', r.prezzo, 'contanti',
      r.prezzo, 0, 0, 0, 0, 'completata',
      'ALLINEAMENTO 20260916', r.id,
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

    update public.lavaggi set stato_pagamento = 'contanti' where id = r.id;

    n := n + 1;
    tot := tot + r.prezzo;
  end loop;

  raise notice 'A) vendite create: % per % EUR', n, tot;
end $$;


-- ============================================================
-- B) Corporate: da 'contanti' a 'fattura'
-- Il ricavo resta nel venduto, l'importo esce dai contanti di giornata
-- e in Cassa entra fra i crediti (voce "Lavaggi a fine mese").
-- ============================================================
do $$
declare
  n   int;
  tot numeric;
begin
  with target as (
    select v.id, v.totale
      from public.lavaggi l
      join public.vendite v on v.lavaggio_id = l.id and v.stato <> 'annullata'
      join public.clienti c on c.id = l.cliente_id
     where c.modalita_pagamento = 'Addebito_Mese'
       and l.data between date '2026-08-01' and date '2026-09-12'
  ),
  upd as (
    update public.vendite v
       set metodo_pagamento = 'fattura',
           importo_contanti = 0,
           importo_pos      = 0,
           note = coalesce(nullif(v.note, '') || ' | ', '') || 'ALLINEAMENTO 20260916'
      from target t
     where v.id = t.id
    returning t.totale
  )
  select count(*), coalesce(sum(totale), 0) into n, tot from upd;

  raise notice 'B) vendite convertite a fattura: % per % EUR', n, tot;
end $$;

-- stato_pagamento sui lavaggi corporate corrispondenti
update public.lavaggi l
   set stato_pagamento = 'fattura'
  from public.clienti c
 where c.id = l.cliente_id
   and c.modalita_pagamento = 'Addebito_Mese'
   and l.stato = 'Completato'
   and l.data between date '2026-08-01' and date '2026-09-12';


-- ============================================================
-- Verifica finale: nel periodo non deve restare nessun lavaggio
-- completato senza vendita (esclusi i corporate, che ora sono a fattura).
-- ============================================================
do $$
declare
  rimasti int;
begin
  select count(*) into rimasti
    from public.lavaggi l
    left join public.vendite v on v.lavaggio_id = l.id and v.stato <> 'annullata'
    left join public.clienti c on c.id = l.cliente_id
   where l.stato = 'Completato'
     and l.data between date '2026-08-01' and date '2026-09-12'
     and v.id is null
     and coalesce(c.modalita_pagamento, 'Cash') <> 'Addebito_Mese';

  if rimasti > 0 then
    raise exception 'Allineamento incompleto: % lavaggi ancora senza vendita', rimasti;
  end if;
  raise notice 'Allineamento completato. Nessun lavaggio scoperto nel periodo.';
end $$;

commit;
