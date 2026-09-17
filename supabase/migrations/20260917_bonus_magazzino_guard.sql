-- Bonus venduto: solo il gestore puo' accendere o spegnere il bonus
--
-- La policy su magazzino e' `for all ... using (is_staff()) with check (is_staff())`,
-- cioe' tutto il personale puo' sia modificare un articolo esistente sia crearne
-- uno nuovo. Va bene per prezzi e scorte, non per bonus_attivo: senza questo
-- blocco un cassiere potrebbe accendersi il bonus su un articolo costoso
-- (in un update su uno esistente, o creandone uno da zero con bonus_attivo
-- gia' a true) e vendersolo per incassare. La RLS non sa distinguere per
-- colonna, quindi il controllo sta in un trigger, agganciato sia
-- all'inserimento che alla modifica.
--
-- File separato di proposito: la migration dello schema potrebbe essere gia'
-- stata lanciata, e questa deve poter arrivare dopo senza rilanciare quella.

create or replace function public.blocca_bonus_attivo_non_gestore()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  -- In inserimento OLD non esiste: leggerlo solleverebbe un errore, quindi i
  -- due casi vanno distinti. Coprire solo l'update lascerebbe la strada aperta
  -- a chi crea un articolo nuovo con il bonus gia' acceso.
  if tg_op = 'INSERT' then
    if new.bonus_attivo is true and not public.is_super_admin() then
      raise exception 'Solo il gestore puo'' creare un articolo con il bonus attivo';
    end if;
    return new;
  end if;

  if new.bonus_attivo is distinct from old.bonus_attivo
     and not public.is_super_admin() then
    raise exception 'Solo il gestore puo'' attivare o disattivare il bonus su un articolo';
  end if;
  return new;
end;
$$;

drop trigger if exists magazzino_bonus_attivo_guard on public.magazzino;
create trigger magazzino_bonus_attivo_guard
  before insert or update on public.magazzino
  for each row
  execute function public.blocca_bonus_attivo_non_gestore();
