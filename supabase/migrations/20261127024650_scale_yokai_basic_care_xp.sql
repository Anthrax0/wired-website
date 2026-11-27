CREATE OR REPLACE FUNCTION public.care_for_pet(p_pet_id uuid, p_action text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_xp integer;
  v_points integer;
  v_rarity text;
  v_level integer;
  v_last_action timestamptz;
begin
  if v_user_id is null then raise exception 'Please log in first.'; end if;
  if p_action not in ('feed','play','rest','groom','bond') then
    raise exception 'That pet activity is not available.';
  end if;

  select p.level,s.rarity into v_level,v_rarity from public.user_pets p join public.pet_species s on s.id=p.species_id
    where p.id = p_pet_id and p.owner_id = v_user_id
    for update of p;
  if not found then raise exception 'You can only care for your own pets.'; end if;

  select max(created_at) into v_last_action
    from public.pet_actions
    where user_id = v_user_id and pet_id = p_pet_id and action_type = p_action;
  if v_last_action is not null and v_last_action > now() - interval '15 minutes' then
    raise exception 'Your pet needs a little breather. Try that activity again in a moment!';
  end if;

  v_xp := 1 + (v_level - 1) / 5;
  v_points:=public.yokai_balanced_care_points(v_rarity,v_level);

  insert into public.pet_actions(user_id,pet_id,action_type,xp_awarded,points_awarded)
  values(v_user_id,p_pet_id,p_action,v_xp,v_points);

  update public.user_pets set
    xp = xp + v_xp,
    happiness = case
      when p_action = 'play' then least(100,happiness+12)
      when p_action in ('groom','bond') then least(100,happiness+7)
      when p_action = 'feed' then least(100,happiness+5)
      else least(100,happiness+3) end,
    hunger = case when p_action = 'feed' then least(100,hunger+30)
                  when p_action = 'play' then greatest(0,hunger-5) else hunger end,
    energy = case when p_action = 'play' then greatest(0,energy-10)
                  when p_action = 'rest' then least(100,energy+30) else energy end,
    updated_at = now()
  where id = p_pet_id and owner_id = v_user_id;

  insert into public.global_wallet_transactions(user_id,amount,transaction_type,source_id,description)
  values(
    v_user_id, v_points, 'earn',
    'pet-care:' || p_pet_id::text || ':' || gen_random_uuid()::text,
    'Pet care reward: ' || p_action || ' companion'
  );

  return p_pet_id;
end;
$function$;
