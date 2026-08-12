-- ROLLBACK di 20260812_1b_01_lockdown_staff.sql
-- Riapre l'accesso (policy permissiva USING true) sulle stesse tabelle,
-- in caso la blindatura rompa qualcosa. Da applicare con apply_migration.js.
-- Nota: riapre via policy permissiva; la RLS resta accesa ma non filtra,
-- ripristinando di fatto il comportamento aperto precedente.

do $$
declare
  t text;
  pol record;
  tabelle text[] := array[
    'accise_storico','buoni_cartacei','carichi_carburante','cassa','categorie_tesoreria',
    'chiusure_mensili_carburante','clienti','codici_progressivo','coefficiente_monofase_mensile',
    'config_carburanti','conguagli_eni','crediti','dashboard_giornaliero','export_bancari_log',
    'fatturazione_progressivo','fatture','fatture_acquisto_gasolio','fatture_movimenti','fatture_righe',
    'giacenze_iniziali','import_eni_log','impostazioni_fatturazione','lavaggi','log_attivita',
    'magazzino','manutenzioni','movimenti_banca','pagamenti_programmati','pagamenti_ricorrenti',
    'parametri_fiscali','personale','prezzi_cliente','prezzi_pompa','prodotti_carburante',
    'resi','resi_dettaglio','rimborsi_stato','smac_riepilogo','vendite','vendite_dettaglio',
    'vendite_giornaliere','vendite_per_prodotto'
  ];
begin
  foreach t in array tabelle loop
    for pol in
      select policyname from pg_policies where schemaname='public' and tablename=t
    loop
      execute format('drop policy if exists %I on public.%I', pol.policyname, t);
    end loop;
    execute format(
      'create policy all_open on public.%I for all to public '
      'using (true) with check (true)', t
    );
  end loop;
end $$;
