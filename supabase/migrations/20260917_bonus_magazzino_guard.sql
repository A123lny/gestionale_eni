-- Bonus venduto: solo il gestore puo' accendere o spegnere il bonus
--
-- La policy UPDATE su magazzino e' is_staff(), cioe' tutto il personale puo'
-- modificare un articolo. Va bene per prezzi e scorte, non per bonus_attivo:
-- senza questo blocco un cassiere potrebbe accendersi il bonus su un articolo
-- costoso, vendersolo e incassare. La RLS non sa distinguere per colonna,
-- quindi il controllo sta in un trigger.
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
  if new.bonus_attivo is distinct from old.bonus_attivo
     and not public.is_super_admin() then
    raise exception 'Solo il gestore puo'' attivare o disattivare il bonus su un articolo';
  end if;
  return new;
end;
$$;

drop trigger if exists magazzino_bonus_attivo_guard on public.magazzino;
create trigger magazzino_bonus_attivo_guard
  before update on public.magazzino
  for each row
  execute function public.blocca_bonus_attivo_non_gestore();
