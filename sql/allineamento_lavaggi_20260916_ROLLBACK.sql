-- allineamento_lavaggi_20260916_ROLLBACK.sql
-- Annulla allineamento_lavaggi_20260916.sql e riporta i dati com'erano.
--
-- Riconosce cosa toccare da DUE marcatori distinti nelle note:
--   'ALLINEAMENTO 20260916 CREATA'      -> vendita nata dall'allineamento: si cancella
--   'ALLINEAMENTO 20260916 CONVERTITA'  -> vendita preesistente passata a fattura:
--                                          si riporta a 'contanti'
--
-- Due marcatori e non uno perche' una vendita convertita che non aveva note
-- sarebbe finita con una stringa identica a quella delle create, rendendo
-- impossibile distinguerle.
--
-- Le vendite convertite avevano tutte importo_contanti = totale e
-- importo_pos = 0 (verificato prima dell'intervento), quindi il ripristino
-- e' esatto senza tabelle di appoggio.

begin;

-- ============================================================
-- 0. Annulla le correzioni delle anomalie preesistenti (A0)
-- ============================================================

-- 0a) Ripristina le vendite doppie messe in 'annullata'
do $$
declare n int;
begin
  with upd as (
    update public.vendite
       set stato = 'completata',
           note = nullif(regexp_replace(note, '( \| )?ALLINEAMENTO 20260916 DOPPIONE$', ''), '')
     where note like '%ALLINEAMENTO 20260916 DOPPIONE'
    returning 1
  )
  select count(*) into n from upd;
  raise notice 'Vendite doppie ripristinate: %', n;
end $$;

-- 0b) Ripristina i prezzi originali dei lavaggi dal backup
do $$
declare n int;
begin
  if not exists (
    select 1 from information_schema.tables
     where table_schema='public' and table_name='lavaggi_backup_20260916'
  ) then
    raise notice 'Nessun lavaggi_backup_20260916: niente prezzi da ripristinare';
    return;
  end if;
  with upd as (
    update public.lavaggi l
       set prezzo = b.prezzo_originale
      from public.lavaggi_backup_20260916 b
     where l.id = b.id
    returning 1
  )
  select count(*) into n from upd;
  raise notice 'Prezzi lavaggio ripristinati: %', n;
end $$;


-- ============================================================
-- 1. Riporta a 'contanti' le vendite convertite
-- ============================================================
do $$
declare n int;
begin
  with upd as (
    update public.vendite
       set metodo_pagamento = 'contanti',
           importo_contanti = totale,
           importo_pos      = 0,
           note = nullif(regexp_replace(note, '( \| )?ALLINEAMENTO 20260916 CONVERTITA$', ''), '')
     where note like '%ALLINEAMENTO 20260916 CONVERTITA'
    returning 1
  )
  select count(*) into n from upd;
  raise notice 'Ripristinate a contanti: % vendite', n;
end $$;


-- ============================================================
-- 2. Cancella le vendite create dall'allineamento (righe incluse)
-- ============================================================
delete from public.vendite_dettaglio
 where vendita_id in (
   select id from public.vendite
    where note = 'ALLINEAMENTO 20260916 CREATA' and lavaggio_id is not null
 );

do $$
declare n int;
begin
  with del as (
    delete from public.vendite
     where note = 'ALLINEAMENTO 20260916 CREATA' and lavaggio_id is not null
    returning 1
  )
  select count(*) into n from del;
  raise notice 'Cancellate: % vendite create dall''allineamento', n;
end $$;


-- ============================================================
-- 3. Azzera stato_pagamento sui lavaggi del periodo
-- (esteso al 15/09: copre anche allineamento_..._estensione_14_15.sql)
-- (prima dell'allineamento era NULL su tutto lo storico)
-- ============================================================
update public.lavaggi
   set stato_pagamento = null
 where data between date '2026-08-01' and date '2026-09-15'
   and stato_pagamento is not null;


-- ============================================================
-- 3bis. Ripristina i totali delle casse dal backup
--
-- Da backup e NON per ricalcolo: su 9 giornate (1-13 agosto) il
-- venduto_lavaggi salvato divergeva da quello ricavabile dalle vendite,
-- perche' all'epoca il campo si scriveva a mano. Un ricalcolo li
-- cambierebbe invece di riportarli come erano.
-- ============================================================
do $$
declare n int;
begin
  if not exists (
    select 1 from information_schema.tables
     where table_schema='public' and table_name='cassa_backup_20260916'
  ) then
    raise exception 'Manca cassa_backup_20260916: impossibile ripristinare le casse';
  end if;

  with upd as (
    update public.cassa k
       set venduto_lavaggi = b.venduto_lavaggi,
           totale_venduto  = b.totale_venduto,
           totale_crediti  = b.totale_crediti,
           differenza      = b.differenza,
           updated_at      = now()
      from public.cassa_backup_20260916 b
     where k.id = b.id
    returning 1
  )
  select count(*) into n from upd;
  raise notice 'Casse ripristinate dal backup: %', n;
end $$;

-- La tabella di backup NON viene cancellata: resta come traccia.
-- Per rimuoverla, a mente fredda:  drop table public.cassa_backup_20260916;


-- ============================================================
-- 4. Verifica: nessun residuo dei marcatori
-- ============================================================
do $$
declare resid int;
begin
  select count(*) into resid
    from public.vendite
   where note like '%ALLINEAMENTO 20260916%';
  if resid > 0 then
    raise exception 'Rollback incompleto: % vendite ancora marcate', resid;
  end if;
  raise notice 'Rollback completato: dati come prima dell''allineamento.';
end $$;

commit;
