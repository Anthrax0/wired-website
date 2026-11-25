create function private.wired_enforce_yokai_ownership_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.owner_id is not distinct from old.owner_id then
    return new;
  end if;

  -- Serialize adoptions and incoming transfers for the same owner.
  perform 1 from public.profiles where id = new.owner_id for no key update;
  if (select count(*) from public.user_pets where owner_id = new.owner_id) >= 5 then
    raise exception 'You can own up to 5 yokai companions. Free a spot before adding another.';
  end if;
  return new;
end;
$$;

create trigger wired_yokai_ownership_limit
before insert or update of owner_id on public.user_pets
for each row execute function private.wired_enforce_yokai_ownership_limit();

CREATE OR REPLACE FUNCTION public.adopt_pet(p_species_slug text, p_nickname text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
 v_user_id uuid := auth.uid();
 v_species public.pet_species%rowtype;
 v_pet_count integer;
 v_adoption_count integer;
 v_balance bigint;
 v_cost integer;
 v_pet_id uuid := gen_random_uuid();
 v_nickname text;
begin
 if v_user_id is null then raise exception 'Please log in to adopt a pet.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(v_user_id::text,0));
 perform 1 from public.profiles where id=v_user_id for no key update;
 select * into v_species from public.pet_species where slug=p_species_slug and active=true;
 if not found then raise exception 'That pet is not available.'; end if;
 select count(*) into v_pet_count from public.user_pets where owner_id=v_user_id;
 if v_pet_count>=5 then raise exception 'You can own up to 5 yokai companions. Free a spot before adopting another.'; end if;
 select count(*) into v_adoption_count from public.global_wallet_transactions
 where user_id=v_user_id and source_id like 'pet:%' and transaction_type='purchase';
 v_cost:=case when v_species.rarity='common' and v_pet_count=0 and v_adoption_count=0 then 0 else v_species.adoption_cost end;
 if v_cost>0 then
  select coalesce(sum(amount),0) into v_balance from public.global_wallet_transactions where user_id=v_user_id;
  if v_balance<v_cost then raise exception 'You need % more WIRED points to adopt this pet.',(v_cost-v_balance); end if;
  insert into public.global_wallet_transactions(user_id,amount,transaction_type,source_id,description)
  values(v_user_id,-v_cost,'purchase','pet:'||v_pet_id::text,'Adopted '||v_species.name);
 end if;
 v_nickname:=left(coalesce(nullif(trim(p_nickname),''),v_species.name),24);
 insert into public.user_pets(id,owner_id,species_id,nickname) values(v_pet_id,v_user_id,v_species.id,v_nickname);
 return v_pet_id;
end;
$function$;
