-- 20260812_1b_02_rls_per_ruolo.sql
-- Fase 1b-B: visibilita' (SELECT) per ruolo, applicata dal database.
-- Sostituisce la policy unica staff_all (tutto a ogni staff) con:
--   - SELECT ristretto per ruolo (secondo la matrice RUOLI di config.js)
--   - INSERT/UPDATE/DELETE: aperti a qualsiasi staff loggato (is_staff())
--     -> le scritture NON sono ristrette per ruolo in questa fase (scelta di
--        sicurezza: evita di rompere flussi che toccano piu' tabelle insieme;
--        la restrizione in scrittura si potra' aggiungere dopo, con test).
--
-- Tabelle "viste da tutti" (clienti, lavaggi, dashboard_giornaliero,
-- vendite_giornaliere): restano con staff_all (non toccate qui).
-- Tabelle portale (clienti_portale, movimenti_saldo, listino_lavaggi,
-- prenotazioni_lavaggio) e print_queue: fuori (Fase 1c).
--
-- personale: eccezione -> Admin vede tutti, ogni altro vede SOLO la propria
--            riga (serve al login per leggere ruolo/nome).

do $$
declare
  r record;
begin
  for r in
    -- Admin + Cassiere
    select t, 'public.staff_role() = any (array[''Admin'',''Cassiere''])' as sel
      from unnest(array[
        'cassa','spese_cassa','crediti','vendite','vendite_dettaglio',
        'resi','resi_dettaglio','magazzino','buoni_cartacei'
      ]) as t
    union all
    -- Solo Admin
    select t, 'public.staff_role() = ''Admin''' as sel
      from unnest(array[
        'accise_storico','carichi_carburante','categorie_tesoreria','chiusure_mensili_carburante',
        'codici_progressivo','coefficiente_monofase_mensile','config_carburanti','conguagli_eni',
        'export_bancari_log','fatturazione_progressivo','fatture','fatture_acquisto_gasolio',
        'fatture_movimenti','fatture_righe','giacenze_iniziali','import_eni_log',
        'impostazioni_fatturazione','log_attivita','manutenzioni','movimenti_banca',
        'pagamenti_programmati','pagamenti_ricorrenti','parametri_fiscali','prezzi_cliente',
        'prezzi_pompa','prodotti_carburante','rimborsi_stato','smac_riepilogo','vendite_per_prodotto'
      ]) as t
    union all
    -- personale: Admin tutti, gli altri solo la propria riga
    select 'personale', 'public.staff_role() = ''Admin'' or auth_user_id = auth.uid()'
  loop
    execute format('drop policy if exists staff_all on public.%I', r.t);
    execute format('drop policy if exists staff_select on public.%I', r.t);
    execute format('drop policy if exists staff_ins on public.%I', r.t);
    execute format('drop policy if exists staff_upd on public.%I', r.t);
    execute format('drop policy if exists staff_del on public.%I', r.t);

    execute format('create policy staff_select on public.%I for select to authenticated using (%s)', r.t, r.sel);
    execute format('create policy staff_ins on public.%I for insert to authenticated with check (public.is_staff())', r.t);
    execute format('create policy staff_upd on public.%I for update to authenticated using (public.is_staff()) with check (public.is_staff())', r.t);
    execute format('create policy staff_del on public.%I for delete to authenticated using (public.is_staff())', r.t);
  end loop;
end $$;
