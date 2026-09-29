-- Cassa: litri venduti al prezzo precedente (campo facoltativo)
--
-- Il venduto carburante arriva dallo scontrino della sera, che valorizza tutti
-- i litri della giornata al prezzo esposto al momento della stampa. Se il
-- prezzo e' cambiato DURANTE la giornata, i litri venduti prima del cambio
-- risultano contati al prezzo sbagliato: su 4.000 litri e 5 centesimi di
-- variazione sono 200 EUR di differenza di cassa che non corrispondono a
-- nessun ammanco.
--
-- Queste colonne permettono all'operatore di indicare, SOLO nei giorni in cui
-- il prezzo e' cambiato, quanti litri erano gia' stati venduti al prezzo
-- precedente. Il prezzo vecchio non serve memorizzarlo: si ricava dalla cassa
-- chiusa del giorno prima (euro / litri).
--
-- Tutte NULL di default: la cassa continua a funzionare esattamente come prima
-- se il campo non viene compilato.

alter table public.cassa
    add column if not exists super_sp_litri_prezzo_prec    numeric(10,2),
    add column if not exists diesel_litri_prezzo_prec      numeric(10,2),
    add column if not exists diesel_plus_litri_prezzo_prec numeric(10,2);

comment on column public.cassa.super_sp_litri_prezzo_prec is
    'Litri di benzina gia'' venduti al prezzo del giorno precedente, quando il prezzo e'' cambiato in giornata. Facoltativo.';
comment on column public.cassa.diesel_litri_prezzo_prec is
    'Litri di gasolio gia'' venduti al prezzo del giorno precedente, quando il prezzo e'' cambiato in giornata. Facoltativo.';
comment on column public.cassa.diesel_plus_litri_prezzo_prec is
    'Litri di Diesel Plus gia'' venduti al prezzo del giorno precedente, quando il prezzo e'' cambiato in giornata. Facoltativo.';

-- Solo non-negativi. NON si vincola "<= litri totali" di proposito: la cassa
-- salva la bozza a ogni tasto, e chi digitasse questo campo prima dei litri
-- totali si vedrebbe fallire l'autosalvataggio. Il limite e' applicato nel
-- calcolo (vendutoProdotto in js/lib/cassa-quadratura.js), dove non blocca nulla.
alter table public.cassa drop constraint if exists cassa_litri_prezzo_prec_check;
alter table public.cassa add constraint cassa_litri_prezzo_prec_check check (
        coalesce(super_sp_litri_prezzo_prec, 0)    >= 0
    and coalesce(diesel_litri_prezzo_prec, 0)      >= 0
    and coalesce(diesel_plus_litri_prezzo_prec, 0) >= 0
);
