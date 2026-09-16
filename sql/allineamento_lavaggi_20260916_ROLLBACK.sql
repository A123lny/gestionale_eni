-- allineamento_lavaggi_20260916_ROLLBACK.sql
-- Annulla allineamento_lavaggi_20260916.sql e riporta i dati esattamente
-- com'erano prima.
--
-- Riconosce cosa toccare dal marcatore 'ALLINEAMENTO 20260916' nel campo note:
--   - vendite create dall'allineamento  -> note = 'ALLINEAMENTO 20260916'
--     e metodo 'contanti'  => si cancellano
--   - vendite convertite                -> note che FINISCE con il marcatore
--     e metodo 'fattura'   => si riportano a 'contanti'
--
-- Le 38 vendite convertite avevano tutte importo_contanti = totale e
-- importo_pos = 0 (verificato prima dell'intervento), quindi il ripristino
-- e' esatto senza bisogno di una tabella di appoggio.

begin;

-- ============================================================
-- 1. Riporta a 'contanti' le vendite convertite a fattura
-- ============================================================
do $$
declare n int;
begin
  with upd as (
    update public.vendite
       set metodo_pagamento = 'contanti',
           importo_contanti = totale,
           importo_pos      = 0,
           note = nullif(regexp_replace(note, '( \| )?ALLINEAMENTO 20260916$', ''), '')
     where metodo_pagamento = 'fattura'
       and note like '%ALLINEAMENTO 20260916'
       and lavaggio_id is not null
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
    where note = 'ALLINEAMENTO 20260916' and lavaggio_id is not null
 );

do $$
declare n int;
begin
  with del as (
    delete from public.vendite
     where note = 'ALLINEAMENTO 20260916' and lavaggio_id is not null
    returning 1
  )
  select count(*) into n from del;
  raise notice 'Cancellate: % vendite create dall''allineamento', n;
end $$;


-- ============================================================
-- 3. Azzera stato_pagamento sui lavaggi del periodo
-- (prima dell'allineamento era NULL su tutto lo storico)
-- ============================================================
update public.lavaggi
   set stato_pagamento = null
 where data between date '2026-08-01' and date '2026-09-12'
   and stato_pagamento is not null;


-- ============================================================
-- 4. Verifica: nessun residuo del marcatore
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
