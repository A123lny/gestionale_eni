-- 20260812_a4_salva_fattura.sql
-- A4 (fattura): salvataggio ATOMICO della fattura.
-- Numero progressivo + testata (fatture) + righe (fatture_righe) + movimenti
-- (fatture_movimenti) in UNA transazione: o tutto o niente. Evita fatture
-- "a meta'" e numeri fiscali sprecati (in caso di errore il numero torna libero).
-- Replica la logica del client: numero generato solo se assente, numero_formattato
-- con prefisso 'R' per le RICEVUTE. SECURITY INVOKER (resta soggetta a RLS).

create or replace function public.salva_fattura(p_fattura jsonb, p_righe jsonb, p_movimenti jsonb)
  returns jsonb
  language plpgsql
  security invoker
  set search_path = public
as $$
declare
  v_anno    int;
  v_tipo    text;
  v_numero  int;
  v_prefisso text;
  v_payload jsonb;
  v_fattura public.fatture%rowtype;
begin
  v_payload := p_fattura;

  -- 1) Numero progressivo (solo se non gia' fornito), dentro la transazione
  if (p_fattura->>'numero') is null then
    v_anno := coalesce((p_fattura->>'anno')::int,
                       extract(year from (p_fattura->>'data_emissione')::date)::int);
    v_tipo := coalesce(p_fattura->>'tipo_documento', 'FATTURA');
    v_numero := public.get_prossimo_numero_documento(v_anno, v_tipo);
    v_prefisso := case when v_tipo = 'RICEVUTA' then 'R' else '' end;
    v_payload := v_payload || jsonb_build_object(
      'numero', v_numero,
      'anno', v_anno,
      'tipo_documento', v_tipo,
      'numero_formattato', v_prefisso || v_numero::text || '/' || v_anno::text
    );
  end if;

  -- 2) Testata (id/created_at/updated_at usano i default; tipi coerciti)
  insert into public.fatture (
    numero, anno, numero_formattato, data_emissione, data_scadenza, cliente_id, tipo,
    mese_riferimento, anno_riferimento, totale, monofase_coefficiente, monofase_importo,
    monofase_mese, monofase_anno, modalita_pagamento, iban_beneficiario, stato, pdf_url,
    note, rif_amministrazione, import_eni_log_id, utente_creazione, tipo_documento,
    email_inviata_at, email_message_id, intestatario_nome, intestatario_indirizzo, intestatario_cf
  )
  select numero, anno, numero_formattato, data_emissione, data_scadenza, cliente_id, tipo,
         mese_riferimento, anno_riferimento, totale, monofase_coefficiente, monofase_importo,
         monofase_mese, monofase_anno, modalita_pagamento, iban_beneficiario, stato, pdf_url,
         note, rif_amministrazione, import_eni_log_id, utente_creazione, tipo_documento,
         email_inviata_at, email_message_id, intestatario_nome, intestatario_indirizzo, intestatario_cf
  from jsonb_populate_record(null::public.fatture, v_payload)
  returning * into v_fattura;

  -- 3) Righe (ordine = valore fornito o indice, come il client)
  if p_righe is not null and jsonb_typeof(p_righe) = 'array' and jsonb_array_length(p_righe) > 0 then
    insert into public.fatture_righe (
      fattura_id, ordine, descrizione, quantita, unita_misura, prezzo_unitario, importo, categoria
    )
    select v_fattura.id,
           coalesce((r.elem->>'ordine')::int, (r.idx - 1)::int),
           pr.descrizione, pr.quantita, pr.unita_misura, pr.prezzo_unitario, pr.importo, pr.categoria
    from jsonb_array_elements(p_righe) with ordinality as r(elem, idx),
         lateral jsonb_populate_record(null::public.fatture_righe, r.elem) as pr;
  end if;

  -- 4) Movimenti
  if p_movimenti is not null and jsonb_typeof(p_movimenti) = 'array' and jsonb_array_length(p_movimenti) > 0 then
    insert into public.fatture_movimenti (
      fattura_id, data_movimento, scontrino, id_transazione, targa, autista, num_carta,
      prodotto, tipo_servizio, prezzo_unitario, volume, importo, categoria
    )
    select v_fattura.id, pm.data_movimento, pm.scontrino, pm.id_transazione, pm.targa, pm.autista,
           pm.num_carta, pm.prodotto, pm.tipo_servizio, pm.prezzo_unitario, pm.volume, pm.importo, pm.categoria
    from jsonb_populate_recordset(null::public.fatture_movimenti, p_movimenti) pm;
  end if;

  return to_jsonb(v_fattura);
end;
$$;

grant execute on function public.salva_fattura(jsonb, jsonb, jsonb) to authenticated;
