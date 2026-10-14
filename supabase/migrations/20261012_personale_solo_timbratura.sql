-- 20261012_personale_solo_timbratura.sql
-- Laura Cervellini deve comparire SOLO nelle Timbrature.
--
-- Il problema da risolvere non e' aggiungerla all'anagrafica (quello e' un
-- insert), ma impedire che compaia in tutto il resto. Due strade portano una
-- persona in giro per l'app:
--
--   1. la vista `personale_login`, che elenca per la schermata di accesso
--      TUTTI quelli con attivo = true, anche chi non ha un account Auth;
--   2. `ENI.API.getPersonale()`, usata da Gestione Personale, Turni, Ferie,
--      Buste Paga, Bonus e Timbrature.
--
-- Qui si chiude la prima (la vista). La seconda si filtra nel client, in
-- api.js, in un punto solo: cosi' anche un modulo scritto domani la esclude
-- senza doversene ricordare.
--
-- Laura NON ha `auth_user_id`, quindi non ha modo di accedere: le sue
-- timbrature le inserisce il super admin da Timbrature -> Timbratura manuale.
-- Il `pin` qui sotto non e' una credenziale (la password vera sta in
-- auth.users): la colonna e' NOT NULL e va riempita, quindi ci va un valore
-- non numerico che nessun PIN a 6 cifre puo' mai uguagliare.
--
-- Additivo: la colonna ha default false, quindi su tutti gli altri non cambia
-- niente e l'app in produzione la ignora finche' non si pubblica il client.

alter table public.personale
  add column if not exists solo_timbratura boolean not null default false;

-- `create or replace` (non drop + create) perche' mantiene proprietario e
-- permessi: la vista e' leggibile da anon, serve alla schermata di login
-- prima che qualcuno sia autenticato.
create or replace view public.personale_login as
  select nome_completo,
         username::text || '@staff.titanwash.local'::text as email_tecnica,
         attivo
    from public.personale
   where attivo is true
     and solo_timbratura is false;

insert into public.personale (username, nome_completo, ruolo, pin, attivo, solo_timbratura)
select 'laura', 'Laura Cervellini', 'Cassiere', '------', true, true
where not exists (select 1 from public.personale where username = 'laura');

-- Verifica: Laura c'e' in anagrafica ma non nella lista di accesso.
-- select nome_completo, solo_timbratura from public.personale where username = 'laura';
-- select * from public.personale_login where nome_completo = 'Laura Cervellini';  -- deve dare 0 righe
