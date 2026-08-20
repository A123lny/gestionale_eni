-- ============================================================
-- Schedulazione avviso Telegram "carburante da ordinare"
-- Da eseguire nel SQL Editor di Supabase (una volta).
-- Sostituisci PROJECT_REF e CRON_SECRET con i tuoi valori.
--
-- Nota fuso: pg_cron usa UTC. San Marino è UTC+2 (estate) / UTC+1 (inverno).
-- '30 7 * * *' = 07:30 UTC ≈ 09:30 in estate / 08:30 in inverno.
-- ============================================================

-- 1) Estensioni necessarie (di solito già attive su Supabase)
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2) (Ri)crea il job giornaliero
select cron.unschedule('telegram-ordine-carburante-daily')
where exists (select 1 from cron.job where jobname = 'telegram-ordine-carburante-daily');

select cron.schedule(
  'telegram-ordine-carburante-daily',
  '30 7 * * *',
  $$
    select net.http_post(
      url := 'https://PROJECT_REF.supabase.co/functions/v1/telegram-ordine-carburante?key=CRON_SECRET',
      headers := '{"Content-Type":"application/json"}'::jsonb
    );
  $$
);

-- Per vedere i job:      select * from cron.job;
-- Per rimuoverlo:        select cron.unschedule('telegram-ordine-carburante-daily');
