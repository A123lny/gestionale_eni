-- 20260812_a4_salva_vendita.sql
-- A4 (vendita): salvataggio ATOMICO della vendita.
-- Codice progressivo + testata (vendite) + righe (vendite_dettaglio) + scarico
-- giacenza, tutto in UNA transazione: o va a buon fine tutto, o niente resta.
-- Elimina il rischio di "vendita a meta'" (testata senza righe, giacenza non
-- aggiornata, ecc.). Buono e scalo saldo restano gestiti dal client dopo (con
-- errori gia' resi visibili), non in questa funzione.
-- SECURITY INVOKER: resta soggetta alla RLS (solo staff loggato).

create or replace function public.salva_vendita(p_vendita jsonb, p_dettagli jsonb, p_prefisso text)
  returns jsonb
  language plpgsql
  security invoker
  set search_path = public
as $$
declare
  v_codice  text;
  v_vendita public.vendite%rowtype;
  d         record;
begin
  -- 1) codice progressivo atomico (stessa transazione della vendita)
  v_codice := public.get_prossimo_codice(p_prefisso, 'vendite', 'codice');

  -- 2) testata: id e created_at usano i default; i tipi vengono coerciti
  --    da jsonb_populate_record. Le colonne non presenti nel jsonb -> NULL.
  insert into public.vendite (
    codice, data, ora, operatore_id, operatore_nome, subtotale, sconto_globale,
    sconto_globale_tipo, totale, metodo_pagamento, importo_contanti, importo_pos,
    importo_buono, buono_cartaceo_id, cliente_portale_id, importo_wallet, resto,
    stato, note, lavaggio_id, note_lavaggio
  )
  select codice, data, ora, operatore_id, operatore_nome, subtotale, sconto_globale,
         sconto_globale_tipo, totale, metodo_pagamento, importo_contanti, importo_pos,
         importo_buono, buono_cartaceo_id, cliente_portale_id, importo_wallet, resto,
         stato, note, lavaggio_id, note_lavaggio
  from jsonb_populate_record(null::public.vendite, p_vendita || jsonb_build_object('codice', v_codice))
  returning * into v_vendita;

  -- 3) righe dettaglio (vendita_id impostato qui)
  insert into public.vendite_dettaglio (
    vendita_id, prodotto_id, codice_prodotto, barcode, nome_prodotto, categoria,
    quantita, prezzo_unitario, sconto, sconto_tipo, totale_riga
  )
  select v_vendita.id, prodotto_id, codice_prodotto, barcode, nome_prodotto, categoria,
         quantita, prezzo_unitario, sconto, sconto_tipo, totale_riga
  from jsonb_populate_recordset(null::public.vendite_dettaglio, p_dettagli);

  -- 4) scarico giacenza (riusa la funzione atomica movimenta_giacenza)
  for d in select * from jsonb_to_recordset(p_dettagli) as x(prodotto_id uuid, quantita numeric)
  loop
    if d.prodotto_id is not null then
      perform public.movimenta_giacenza(d.prodotto_id, -d.quantita);
    end if;
  end loop;

  return to_jsonb(v_vendita);
end;
$$;

grant execute on function public.salva_vendita(jsonb, jsonb, text) to authenticated;
