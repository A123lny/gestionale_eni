-- ROLLBACK di 20260812_1b_02_rls_per_ruolo.sql
-- Ripristina la policy unica staff_all (ogni staff loggato vede e scrive tutto)
-- sulle tabelle toccate dalla 1b-B. Torna cioe' allo stato post-1b-A.

do $$
declare
  t text;
  tabelle text[] := array[
    'cassa','spese_cassa','crediti','vendite','vendite_dettaglio','resi','resi_dettaglio',
    'magazzino','buoni_cartacei',
    'accise_storico','carichi_carburante','categorie_tesoreria','chiusure_mensili_carburante',
    'codici_progressivo','coefficiente_monofase_mensile','config_carburanti','conguagli_eni',
    'export_bancari_log','fatturazione_progressivo','fatture','fatture_acquisto_gasolio',
    'fatture_movimenti','fatture_righe','giacenze_iniziali','import_eni_log',
    'impostazioni_fatturazione','log_attivita','manutenzioni','movimenti_banca',
    'pagamenti_programmati','pagamenti_ricorrenti','parametri_fiscali','personale','prezzi_cliente',
    'prezzi_pompa','prodotti_carburante','rimborsi_stato','smac_riepilogo','vendite_per_prodotto'
  ];
begin
  foreach t in array tabelle loop
    execute format('drop policy if exists staff_select on public.%I', t);
    execute format('drop policy if exists staff_ins on public.%I', t);
    execute format('drop policy if exists staff_upd on public.%I', t);
    execute format('drop policy if exists staff_del on public.%I', t);
    execute format('drop policy if exists staff_all on public.%I', t);
    execute format('create policy staff_all on public.%I for all to authenticated using (public.is_staff()) with check (public.is_staff())', t);
  end loop;
end $$;
