-- 20260812_1b_01_lockdown_staff.sql
-- Fase 1b-A: chiude il buco pubblico.
-- Accende la RLS su tutte le tabelle staff/finanziarie e sostituisce le policy
-- permissive (USING true) con un'unica regola: puo' operare SOLO chi ha fatto
-- login come staff (public.is_staff()). Non cambia cosa puo' fare un operatore
-- gia' loggato (la granularita' per ruolo arriva nella 1b-B): rischio minimo.
--
-- ESCLUSE di proposito (restano com'erano, si sistemano dopo):
--   - print_queue            -> usata dal print-server (chiave dedicata), Fase successiva
--   - clienti_portale        -> portale clienti, Fase 1c
--   - movimenti_saldo        -> portale clienti, Fase 1c
--   - listino_lavaggi        -> letta dal portale clienti, Fase 1c
--   - prenotazioni_lavaggio  -> scritta dal portale clienti, Fase 1c
--
-- NB: le RPC SECURITY DEFINER (get_prossimo_codice, ricarica_saldo, ...) girano
--     come proprietario e continuano a bypassare la RLS: restano funzionanti.
--     La vista personale_login gira come proprietario: l'elenco nomi al login
--     resta visibile anche prima dell'accesso.
-- Applicare in transazione (apply_migration.js): errore => ROLLBACK.

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
    -- 1) rimuove tutte le policy esistenti su questa tabella
    for pol in
      select policyname from pg_policies where schemaname='public' and tablename=t
    loop
      execute format('drop policy if exists %I on public.%I', pol.policyname, t);
    end loop;

    -- 2) accende la RLS
    execute format('alter table public.%I enable row level security', t);

    -- 3) unica policy: solo staff autenticato, per ogni operazione
    execute format(
      'create policy staff_all on public.%I for all to authenticated '
      'using (public.is_staff()) with check (public.is_staff())', t
    );
  end loop;
end $$;
