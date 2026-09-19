-- Bonus venduto: la fascia si sceglie sul TOTALE della vendita
--
-- Cambio di regola deciso dal gestore il 19/09/2026, provando il modulo: la
-- percentuale non dipende piu' dal prezzo del singolo pezzo ma dal totale
-- della vendita (prezzo x quantita').
--
-- Con le fasce 0->3%, 10->5%, 30->7%, tre flaconi da 12 EUR:
--   prima: 12 EUR sta nella fascia da 10 -> 5% su 36 EUR -> 1,80
--   ora:   36 EUR sta nella fascia da 30 -> 7% su 36 EUR -> 2,52
-- Conseguenza voluta e detta al gestore: gli stessi tre flaconi venduti a tre
-- clienti diversi restano tre vendite da 12 EUR e pagano meno di una sola
-- vendita da 36.
--
-- DA LANCIARE DOPO le altre quattro migration del bonus. Cambia SOLO la riga
-- che sceglie la fascia: tutto il resto della funzione e' identico a
-- 20260917_bonus_4_annulla_o_reso_vendita.sql, guardia is_staff() compresa.
--
-- I movimenti gia' registrati NON si toccano: ogni riga si porta dietro la
-- percentuale con cui e' nata (bonus_movimenti.regola_valore), quindi cambiare
-- la regola oggi non riscrive il passato. Le correzioni si fanno a mano dalla
-- scheda Bonus in Gestione Personale.
--
-- ATTENZIONE: la stessa aritmetica vive in js/lib/bonus-calcoli.js
-- (fasciaPerImporto, chiamata con prezzo x quantita'). Le due devono restare
-- gemelle, o il dipendente vede un'anteprima diversa da quello che incassa.

create or replace function public.bonus_riga_calcola(p_prezzo numeric, p_quantita integer)
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path = public
as $$
declare
  v_regola  jsonb;
  v_modo    text;
  v_euro    numeric;
  v_perc    numeric;
  v_totale  numeric;
begin
  if not public.is_staff() then
    raise exception 'Operazione riservata al personale';
  end if;

  if p_prezzo is null or p_quantita is null or p_prezzo <= 0 or p_quantita <= 0 then
    return jsonb_build_object('bonus', 0, 'regola_modo', null, 'regola_valore', 0);
  end if;

  v_regola := public.bonus_regola_corrente();
  v_modo   := v_regola ->> 'modo';

  if v_modo = 'euro' then
    -- greatest(..., 0): l'importo al pezzo sta in impostazioni_app, dove non
    -- si puo' mettere un vincolo. Un valore negativo salvato per errore
    -- trasformerebbe il bonus in un addebito. Stessa difesa in
    -- js/lib/bonus-calcoli.js, per non rompere la parita'.
    v_euro := coalesce((v_regola ->> 'euro_pezzo')::numeric, 0);
    return jsonb_build_object(
      'bonus',         greatest(round(v_euro * p_quantita, 2), 0),
      'regola_modo',   'euro',
      'regola_valore', v_euro);
  end if;

  if v_modo = 'percentuale' then
    -- IL CAMBIO: la fascia si cerca sul totale, non sul prezzo unitario.
    v_totale := p_prezzo * p_quantita;

    -- la fascia con il da_prezzo piu' alto fra quelli <= totale
    select (f ->> 'percentuale')::numeric into v_perc
    from jsonb_array_elements(v_regola -> 'fasce') as f
    where (f ->> 'da_prezzo')::numeric <= v_totale
    order by (f ->> 'da_prezzo')::numeric desc
    limit 1;

    if v_perc is null then
      return jsonb_build_object('bonus', 0, 'regola_modo', 'percentuale', 'regola_valore', 0);
    end if;

    return jsonb_build_object(
      'bonus',         greatest(round(v_totale * v_perc / 100, 2), 0),
      'regola_modo',   'percentuale',
      'regola_valore', v_perc);
  end if;

  return jsonb_build_object('bonus', 0, 'regola_modo', null, 'regola_valore', 0);
end;
$$;

grant execute on function public.bonus_riga_calcola(numeric, integer) to authenticated;
