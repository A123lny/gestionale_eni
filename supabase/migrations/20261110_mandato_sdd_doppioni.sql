-- Schede cliente doppie con lo stesso mandato SDD: disattiva quella non usata.
-- DA LANCIARE PRIMA di 20261110_mandato_sdd_auto.sql.
--
-- Deciso il 10/11/2026 guardando le fatture di ciascuna scheda:
--   Studio Biagioli: resta "Studio biagioli srl" (1f12..., fatture da luglio
--     a novembre); si disattiva "STUDIO BIAGIOLI SRL" (6f73..., ultima a giugno).
--     L'import ENI trova comunque il cliente: stesso nome a meno delle maiuscole.
--   Solution: resta "Stolfi Marco Solution Srl" (7983..., 2 fatture, una RID);
--     si disattiva "Solution S.r.l." (d1ac..., nessuna fattura). Il suo alias
--     ENI passa alla scheda che resta, cosi' l'import la trova con entrambi i nomi.
--
-- Non si cancella niente: le fatture restano collegate alla scheda
-- disattivata, che resta visibile nello storico.

begin;

-- Alias "solution s.r.l." anche sulla scheda che resta (se non c'e' gia')
update public.clienti
   set alias_import_eni = array_append(coalesce(alias_import_eni, '{}'), 'solution s.r.l.')
 where id = '798316a9-7186-4fad-8761-fdf9744d077f'
   and not ('solution s.r.l.' = any(coalesce(alias_import_eni, '{}')));

update public.clienti
   set attivo = false
 where id in ('6f73a279-e728-4f28-9de2-fad0fe731c74',   -- STUDIO BIAGIOLI SRL
              'd1acd04a-2c7f-42e8-b159-13883b28a1d2');  -- Solution S.r.l.

-- Controllo: deve restituire 0 righe
select mandate_id, count(*)
  from public.clienti
 where mandate_id is not null and attivo
 group by mandate_id
having count(*) > 1;

commit;
