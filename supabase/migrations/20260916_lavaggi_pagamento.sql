-- 20260916_lavaggi_pagamento.sql
-- Fix disallineamento Lavaggi <-> Cassa.
--
-- PROBLEMA: al completamento di un lavaggio un popup chiedeva "vuoi registrare
-- anche come vendita?". Solo il "Si'" faceva entrare il lavaggio in Cassa.
-- Risultato nel 2026: 388 lavaggi pagati sul momento (7.846 EUR) mai entrati in
-- cassa, e 176 lavaggi di clienti ad addebito mensile (4.752 EUR) registrati
-- come contanti mai incassati (che poi vengono anche fatturati a fine mese).
--
-- SOLUZIONE: il metodo di pagamento non si chiede piu' "se" ma "come".
--   - cliente ad addebito differito -> vendita automatica con metodo 'fattura':
--     il ricavo conta nel venduto, l'importo va tra i crediti, il cassetto quadra
--   - tutti gli altri -> popup con due soli pulsanti, Contanti o POS
--
-- Migration ADDITIVA: allarga un vincolo e aggiunge due colonne.
-- Nessun dato esistente viene modificato.

-- ============================================================
-- 1. vendite.metodo_pagamento: ammettere 'fattura'
-- Serve per le vendite da lavaggio dei clienti ad addebito differito:
-- hanno totale > 0 ma importo_contanti/pos/buono/wallet tutti a 0, perche'
-- i soldi non entrano nel cassetto oggi.
-- ============================================================
alter table public.vendite
  drop constraint if exists vendite_metodo_pagamento_check;

alter table public.vendite
  add constraint vendite_metodo_pagamento_check
  check (metodo_pagamento in (
    'contanti', 'pos', 'misto',
    'buono_cartaceo', 'buono_cartaceo_misto',
    'wallet_digitale', 'wallet_misto',
    'fattura'
  ));

-- ============================================================
-- 2. lavaggi.stato_pagamento
-- Come e' stato incassato quel lavaggio. 'da_incassare' e' il caso in cui
-- l'operatore ha chiuso il popup senza scegliere: prima spariva in silenzio,
-- ora resta visibile e recuperabile.
-- I lavaggi gia' esistenti restano NULL: storico invariato.
-- ============================================================
alter table public.lavaggi
  add column if not exists stato_pagamento text;

alter table public.lavaggi
  drop constraint if exists lavaggi_stato_pagamento_check;

alter table public.lavaggi
  add constraint lavaggi_stato_pagamento_check
  check (stato_pagamento is null or stato_pagamento in (
    'contanti', 'pos', 'fattura', 'da_incassare'
  ));

create index if not exists idx_lavaggi_stato_pagamento
  on public.lavaggi (stato_pagamento)
  where stato_pagamento = 'da_incassare';

-- ============================================================
-- 3. cassa.crediti_lavaggi_fattura
-- Colonna in sola lettura alimentata dalle vendite del giorno con metodo
-- 'fattura'. Entra nel totale crediti, cosi' la quadratura
-- (venduto - incassato - crediti) torna anche con i lavaggi da fatturare.
-- ============================================================
alter table public.cassa
  add column if not exists crediti_lavaggi_fattura numeric default 0;

-- ============================================================
-- 4. Verifica: se manca qualcosa la migration fallisce.
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'vendite_metodo_pagamento_check'
       and pg_get_constraintdef(oid) like '%fattura%'
  ) then
    raise exception 'Il vincolo vendite_metodo_pagamento_check non ammette ''fattura''';
  end if;

  if not exists (
    select 1 from information_schema.columns
     where table_schema='public' and table_name='lavaggi' and column_name='stato_pagamento'
  ) then
    raise exception 'Colonna lavaggi.stato_pagamento mancante';
  end if;

  if not exists (
    select 1 from information_schema.columns
     where table_schema='public' and table_name='cassa' and column_name='crediti_lavaggi_fattura'
  ) then
    raise exception 'Colonna cassa.crediti_lavaggi_fattura mancante';
  end if;

  raise notice 'Lavaggi/Cassa: vincolo allargato e 2 colonne aggiunte. Storico invariato.';
end $$;
