-- ============================================================
-- MONOFASE: via il tetto di 25 fatture al mese
--
-- Il 04/11/2026 la sincronizzazione del coefficiente monofase si rompeva con:
--
--   new row for relation "fatture_acquisto_gasolio" violates check constraint
--   "fatture_acquisto_gasolio_numero_progressivo_check"
--
-- La sincronizzazione crea una riga per ogni carico di gasolio del mese,
-- numerandole 1, 2, 3..., e il vincolo ammetteva solo da 1 a 25. Ottobre 2026
-- ha avuto 27 carichi: al ventiseiesimo il database rifiutava la riga.
--
-- Il 25 non era un limite di legge ne' di calcolo: era un numero scritto
-- quando i carichi erano sei al mese (febbraio 6, maggio 9, luglio 22,
-- ottobre 27). La stazione e' cresciuta e l'ha raggiunto.
--
-- Il danno vero non era l'errore rosso ma quello che restava dopo: ottobre
-- calcolato su 25 carichi su 27, cioe' 45.053 litri e 15.974,60 euro di
-- monofase mancanti da una dichiarazione fiscale.
--
-- Qui il minimo resta 1 - un progressivo zero o negativo e' un errore, non una
-- stazione che cresce - e il massimo diventa 200, che non e' un tetto di
-- lavoro ma una rete: serve solo a fermare un numero assurdo (una cifra
-- sbagliata a mano, un ciclo impazzito). Duecento carichi di gasolio in un
-- mese vorrebbero dire quasi sette al giorno.
--
-- Non si cancella e non si modifica nessun dato: si tocca solo il vincolo.
-- L'unicita' (mese_riferimento, numero_progressivo) resta dov'e': e' quella
-- che impedisce due righe numero 7 nello stesso mese.
--
-- Dopo questa migration basta premere "Risincronizza" sul mese di ottobre:
-- le righe si ricostruiscono dai carichi, che sono tutti al loro posto in
-- Marginalita' Carburante, e il coefficiente passa da 0,3430 a 0,3440.
-- ============================================================

alter table public.fatture_acquisto_gasolio
  drop constraint if exists fatture_acquisto_gasolio_numero_progressivo_check;

alter table public.fatture_acquisto_gasolio
  add constraint fatture_acquisto_gasolio_numero_progressivo_check
  check (numero_progressivo >= 1 and numero_progressivo <= 200);
