alter table public.user_pets add column xp_bonus_hundredths integer not null default 0
  check (xp_bonus_hundredths between 0 and 99);

create function private.yokai_xp_with_rarity(p_pet uuid, p_owner uuid, p_base_xp integer)
returns integer language plpgsql set search_path = '' as $$
declare
  bonus_percent integer;
  bonus_hundredths bigint;
begin
  select case lower(s.rarity)
      when 'uncommon' then 3 when 'rare' then 6 when 'epic' then 9
      when 'legendary' then 12 when 'mythical' then 15 else 0 end,
    p.xp_bonus_hundredths
  into bonus_percent, bonus_hundredths
  from public.user_pets p join public.pet_species s on s.id = p.species_id
  where p.id = p_pet and p.owner_id = p_owner
  for update of p;
  if not found then return null; end if;
  if bonus_percent = 0 then return p_base_xp; end if;

  bonus_hundredths := bonus_hundredths + p_base_xp::bigint * bonus_percent;
  update public.user_pets set xp_bonus_hundredths = bonus_hundredths % 100 where id = p_pet;
  return p_base_xp + bonus_hundredths / 100;
end
$$;
revoke all on function private.yokai_xp_with_rarity(uuid,uuid,integer) from public, anon, authenticated;

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

  v_xp := private.yokai_xp_with_rarity(p_pet_id, v_user_id, v_xp);
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

CREATE OR REPLACE FUNCTION public.invoke_yokai_skill(p_pet_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
 v_uid uuid := auth.uid();
 v_pet public.user_pets%rowtype;
 v_name text; v_skill text; v_rarity text;
 v_last timestamptz;
 v_xp integer; v_points integer;
 v_energy integer := 0; v_happiness integer := 0; v_fullness integer := 0;
 v_roll integer;
begin
 if v_uid is null then raise exception 'Please log in first.'; end if;
 select * into v_pet from public.user_pets where id=p_pet_id and owner_id=v_uid for update;
 if not found then raise exception 'You can only invoke a skill for a yokai you own.'; end if;
 select name,ability_name,rarity into v_name,v_skill,v_rarity from public.pet_species where id=v_pet.species_id and active=true;
 if v_name is null then raise exception 'This yokai skill is unavailable.'; end if;
 select max(created_at) into v_last from public.pet_actions where pet_id=p_pet_id and user_id=v_uid and action_type='skill';
 if v_last is not null and v_last>now()-interval '1 hours' then
   raise exception 'Skill recharging. Try again after %.',to_char(v_last+interval '1 hours','HH24:MI UTC');
 end if;
 v_roll:=floor(random()*100)::integer;
 v_xp:=case when v_name in ('Shinigami','Oni','Gashadokuro','Onryō','Yatagarasu') then 22 else 12 end;
 v_points:=case when v_name in ('Kitsune','Zashiki-warashi','Amabie','Bakeneko','Nurarihyon') then 14 else 6 end;
 if v_roll<20 then v_xp:=v_xp+8;end if;
 v_points:=public.yokai_balanced_skill_points(v_rarity,1);
 if v_name in ('Yeti','Yuki-onna','Nurikabe','Komainu','Tengu') then v_energy:=24;
 elsif v_name in ('Jorogumo','Kappa','Kamaitachi','Ushi-oni','Sasquatch') then v_happiness:=18;
 elsif v_name in ('Kodama','Nekomata','Kasa-obake','Rokurokubi','Futakuchi-onna') then v_fullness:=16;
 else v_happiness:=8; end if;
 v_xp := private.yokai_xp_with_rarity(p_pet_id, v_uid, v_xp);
 insert into public.pet_actions(user_id,pet_id,action_type,xp_awarded,points_awarded)
 values(v_uid,p_pet_id,'skill',v_xp,v_points);
 update public.user_pets set xp=xp+v_xp,level=floor((xp+v_xp)::numeric/100)::integer+1,
 happiness=least(100,happiness+v_happiness),hunger=least(100,hunger+v_fullness),
 energy=least(100,energy+v_energy),updated_at=now()
 where id=p_pet_id;
 insert into public.global_wallet_transactions(user_id,amount,transaction_type,source_id,description)
 values(v_uid,v_points,'earn','yokai-skill:'||p_pet_id::text||':'||gen_random_uuid()::text,'Yokai skill: '||v_skill);
 return jsonb_build_object('skill',v_skill,'xp',v_xp,'points',v_points,'energy',v_energy,'happiness',v_happiness,'fullness',v_fullness,'critical',v_roll<20,'cooldown_seconds',3600);
end;
$function$;

CREATE OR REPLACE FUNCTION public.invoke_evolved_yokai_skill(p_pet_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_uid uuid:=auth.uid(); v_pet public.user_pets%rowtype; v_species public.pet_species%rowtype;
v_last timestamptz; v_skill text; v_xp integer:=24; v_points integer:=18; v_roll integer;
begin
 if v_uid is null then raise exception 'Please log in first.'; end if;
 select * into v_pet from public.user_pets where id=p_pet_id and owner_id=v_uid for update;
 if not found then raise exception 'You can only invoke skills for yokai you own.'; end if;
 select * into v_species from public.pet_species where id=v_pet.species_id and active=true;
 if not found then raise exception 'This yokai is unavailable.'; end if;
 if v_pet.level < coalesce(v_species.evolution_level,5) then raise exception 'This skill unlocks when your yokai evolves.'; end if;
 select max(created_at) into v_last from public.pet_actions where pet_id=p_pet_id and user_id=v_uid and action_type='evolved_skill';
 if v_last is not null and v_last>now()-interval '3 hours' then raise exception 'Awakened skill is recharging.'; end if;
 v_skill:=coalesce(nullif(v_species.evolved_name,''),v_species.name)||' — Awakened Dominion';
 v_roll:=floor(random()*100)::integer;
 if v_roll<20 then v_xp:=v_xp+10;end if;
 v_points:=public.yokai_balanced_skill_points(v_species.rarity,2);
 v_xp := private.yokai_xp_with_rarity(p_pet_id, v_uid, v_xp);
 insert into public.pet_actions(user_id,pet_id,action_type,xp_awarded,points_awarded) values(v_uid,p_pet_id,'evolved_skill',v_xp,v_points);
 update public.user_pets set xp=xp+v_xp,level=floor((xp+v_xp)::numeric/100)::integer+1,happiness=least(100,happiness+16),energy=least(100,energy+12),updated_at=now() where id=p_pet_id;
 insert into public.global_wallet_transactions(user_id,amount,transaction_type,source_id,description)
 values(v_uid,v_points,'earn','yokai-awakened-skill:'||p_pet_id::text||':'||gen_random_uuid()::text,'Awakened yokai skill: '||v_skill);
 return jsonb_build_object('skill',v_skill,'xp',v_xp,'points',v_points,'happiness',16,'energy',12,'critical',v_roll<20,'cooldown_seconds',10800);
end;$function$;

CREATE OR REPLACE FUNCTION public.invoke_ascendant_yokai_skill(p_pet_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_uid uuid:=auth.uid();v_pet public.user_pets%rowtype;v_species public.pet_species%rowtype;v_last timestamptz;v_skill text;v_xp integer:=42;v_points integer:=32;v_roll integer;
begin
 if v_uid is null then raise exception 'Please log in first.';end if;
 select * into v_pet from public.user_pets where id=p_pet_id and owner_id=v_uid for update;
 if not found then raise exception 'You can only invoke skills for yokai you own.';end if;
 select * into v_species from public.pet_species where id=v_pet.species_id and active=true;
 if not found then raise exception 'This yokai is unavailable.';end if;
 if v_pet.level<45 then raise exception 'Ascendant skill unlocks at level 45.';end if;
 select max(created_at) into v_last from public.pet_actions where pet_id=p_pet_id and user_id=v_uid and action_type='ascendant_skill';
 if v_last>now()-interval '5 hours' then raise exception 'Ascendant skill is recharging.';end if;
 v_skill:=v_species.third_evolved_name||' — Sovereign Eclipse';
 v_roll:=floor(random()*100)::integer;
 if v_roll<20 then v_xp:=v_xp+15;end if;
 v_points:=public.yokai_balanced_skill_points(v_species.rarity,3);
 v_xp := private.yokai_xp_with_rarity(p_pet_id, v_uid, v_xp);
 insert into public.pet_actions(user_id,pet_id,action_type,xp_awarded,points_awarded) values(v_uid,p_pet_id,'ascendant_skill',v_xp,v_points);
 update public.user_pets set xp=xp+v_xp,level=floor((xp+v_xp)::numeric/100)::integer+1,happiness=least(100,happiness+22),hunger=least(100,hunger+12),energy=least(100,energy+22),updated_at=now() where id=p_pet_id;
 insert into public.global_wallet_transactions(user_id,amount,transaction_type,source_id,description) values(v_uid,v_points,'earn','yokai-ascendant-skill:'||p_pet_id::text||':'||gen_random_uuid()::text,'Ascendant yokai skill: '||v_skill);
 return jsonb_build_object('skill',v_skill,'xp',v_xp,'points',v_points,'happiness',22,'energy',22,'fullness',12,'critical',v_roll<20,'cooldown_seconds',18000);
end;$function$;

CREATE OR REPLACE FUNCTION public.invoke_eternal_yokai_skill(p_pet_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_uid uuid:=auth.uid();v_pet public.user_pets%rowtype;v_species public.pet_species%rowtype;v_last timestamptz;v_skill text;v_xp integer:=65;v_points integer:=55;v_roll integer;
begin
 if v_uid is null then raise exception 'Please log in first.';end if;
 select * into v_pet from public.user_pets where id=p_pet_id and owner_id=v_uid for update;
 if not found then raise exception 'You can only invoke skills for yokai you own.';end if;
 select * into v_species from public.pet_species where id=v_pet.species_id and active=true;
 if not found then raise exception 'This yokai is unavailable.';end if;
 if v_pet.level<coalesce(v_species.fourth_evolution_level,90) then raise exception 'Eternal skill unlocks at level 90.';end if;
 select max(created_at) into v_last from public.pet_actions where pet_id=p_pet_id and user_id=v_uid and action_type='eternal_skill';
 if v_last>now()-interval '7 hours' then raise exception 'Eternal skill is recharging.';end if;
 v_skill:=v_species.fourth_evolved_name||' — Veilbreaker';
 v_roll:=floor(random()*100)::integer;
 if v_roll<20 then v_xp:=v_xp+20;end if;
 v_points:=public.yokai_balanced_skill_points(v_species.rarity,4);
 v_xp := private.yokai_xp_with_rarity(p_pet_id, v_uid, v_xp);
 insert into public.pet_actions(user_id,pet_id,action_type,xp_awarded,points_awarded) values(v_uid,p_pet_id,'eternal_skill',v_xp,v_points);
 update public.user_pets set xp=xp+v_xp,level=floor((xp+v_xp)::numeric/100)::integer+1,happiness=least(100,happiness+30),hunger=least(100,hunger+20),energy=least(100,energy+30),updated_at=now() where id=p_pet_id;
 insert into public.global_wallet_transactions(user_id,amount,transaction_type,source_id,description) values(v_uid,v_points,'earn','yokai-eternal-skill:'||p_pet_id::text||':'||gen_random_uuid()::text,'Eternal yokai skill: '||v_skill);
 return jsonb_build_object('skill',v_skill,'xp',v_xp,'points',v_points,'happiness',30,'energy',30,'fullness',20,'critical',v_roll<20,'cooldown_seconds',25200);
end;$function$;

CREATE OR REPLACE FUNCTION wired_duel.yokai_duel_action(p_action text, p_id uuid, p_pet uuid, p_target uuid, p_turn integer, p_move integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := auth.uid();
  duel wired_duel.yokai_duels;
  fighter jsonb;
  bot_fighter jsonb;
  usage_day date;
  winner_pet uuid;
  reward_xp integer;
  reward_points integer;
  sender boolean;
  a integer;
  b integer;
  a_crit boolean;
  b_crit boolean;
  a_damage integer;
  b_damage integer;
  power numeric[] := array[1,1.3,1.8,2.5,3.5];
begin
  if actor is null then raise exception 'Sign in to battle.'; end if;

  update wired_duel.yokai_duels d set
    status = 'finished', updated_at = clock_timestamp(),
    reason = case when d.status = 'pending' then 'Invitation expired' else 'Turn timed out' end,
    winner = case when d.challenger_move is not null then d.challenger
                  when d.opponent_move is not null then d.opponent end
  where actor in (d.challenger, d.opponent) and d.status in ('pending', 'active')
    and d.deadline <= clock_timestamp();

  if p_action = 'start_bot' then
    fighter := wired_duel.yokai_duel_fighter(p_pet, actor);
    if fighter is null then raise exception 'Choose a companion you own.'; end if;
    select wired_duel.species_fighter(s.id, (fighter->>'level')::integer, null)
      into bot_fighter from public.pet_species s where s.id = p_target and s.active;
    if bot_fighter is null then raise exception 'Choose an available bot opponent.'; end if;
    perform wired_duel.consume_daily_duel(actor, (clock_timestamp() at time zone 'UTC')::date, true);
    insert into wired_duel.yokai_duels
      (challenger, challenger_pet, challenger_fighter, challenger_hp, opponent_fighter, opponent_hp, status, deadline)
    values (actor, p_pet, fighter, (fighter->>'hp')::integer, bot_fighter,
      (bot_fighter->>'hp')::integer, 'active', clock_timestamp() + interval '45 seconds')
    on conflict do nothing;
    if not found then raise exception 'Finish your active bot duel first.'; end if;
    return '{}'::jsonb;
  end if;

  if p_action = 'invite' then
    if p_target is null or p_target = actor
      or not exists (select 1 from public.profiles where id = p_target)
      or private.yokai_pound_blocked(actor, p_target) then
      raise exception 'This member is unavailable for a duel.';
    end if;
    fighter := wired_duel.yokai_duel_fighter(p_pet, actor);
    if fighter is null then raise exception 'Choose a companion you own.'; end if;
    insert into wired_duel.yokai_duels (challenger, opponent, challenger_pet, challenger_fighter, challenger_hp)
    values (actor, p_target, p_pet, fighter, (fighter->>'hp')::integer)
    on conflict do nothing;
    if not found then raise exception 'You already have an open duel with this member.'; end if;
    return '{}'::jsonb;
  end if;

  if p_action = 'list' then
    return coalesce((
      select jsonb_agg(to_jsonb(row_data)) from (
        select d.id, d.challenger, d.opponent, d.challenger_fighter, d.opponent_fighter,
          d.challenger_hp, d.opponent_hp, d.status, d.turn, d.deadline, d.winner, d.reason, d.history,
          case when d.challenger = actor then d.challenger_ready else d.opponent_ready end ready,
          case when d.challenger = actor then d.challenger_move else d.opponent_move end my_move,
          case when d.challenger = actor then d.opponent_move is not null else d.challenger_move is not null end opponent_locked,
          d.reward_xp, d.reward_points, d.opponent is null as is_bot,
          cp.username challenger_name, coalesce(op.username, 'Bot: ' || (d.opponent_fighter->>'name')) opponent_name
        from wired_duel.yokai_duels d
        join public.profiles cp on cp.id = d.challenger
        left join public.profiles op on op.id = d.opponent
        where actor in (d.challenger, d.opponent)
          and (d.opponent is null or not private.yokai_pound_blocked(d.challenger, d.opponent))
        order by (d.status = 'active') desc, (d.status = 'pending') desc, d.updated_at desc, d.id
        limit 20
      ) row_data
    ), '[]'::jsonb);
  end if;

  select * into duel from wired_duel.yokai_duels d where d.id = p_id
    and actor in (d.challenger, d.opponent) for update;
  if not found or (duel.opponent is not null and private.yokai_pound_blocked(duel.challenger, duel.opponent)) then
    raise exception 'Duel unavailable.';
  end if;
  if duel.status = 'finished' or duel.deadline <= clock_timestamp() then return '{}'::jsonb; end if;
  sender := actor = duel.challenger;

  if p_action = 'accept' and duel.status = 'pending' and not sender then
    perform 1 from public.user_pets where id in (duel.challenger_pet, p_pet) order by id for share;
    fighter := wired_duel.yokai_duel_fighter(p_pet, actor);
    if fighter is null then raise exception 'Choose a companion you own.'; end if;
    duel.challenger_fighter := wired_duel.yokai_duel_fighter(duel.challenger_pet, duel.challenger);
    if duel.challenger_fighter is null then
      update wired_duel.yokai_duels set status = 'finished', reason = 'Challenger companion unavailable',
        updated_at = clock_timestamp() where id = duel.id;
      return '{}'::jsonb;
    end if;
    usage_day := (clock_timestamp() at time zone 'UTC')::date;
    perform wired_duel.consume_daily_duel(least(duel.challenger, duel.opponent), usage_day, false);
    perform wired_duel.consume_daily_duel(greatest(duel.challenger, duel.opponent), usage_day, false);
    update wired_duel.yokai_duels set status = 'active', opponent_pet = p_pet,
      challenger_fighter = duel.challenger_fighter, challenger_hp = (duel.challenger_fighter->>'hp')::integer,
      opponent_fighter = fighter, opponent_hp = (fighter->>'hp')::integer,
      deadline = clock_timestamp() + interval '45 seconds', updated_at = clock_timestamp() where id = duel.id;
  elsif p_action = 'leave' then
    update wired_duel.yokai_duels set status = 'finished', updated_at = clock_timestamp(),
      reason = case when duel.status = 'active' then 'Forfeit'
                    when sender then 'Invitation canceled' else 'Invitation declined' end,
      winner = case when duel.status = 'active' then
        case when sender then duel.opponent else duel.challenger end end where id = duel.id;
  elsif p_action = 'move' and duel.status = 'active' then
    if p_turn is distinct from duel.turn then return '{}'::jsonb; end if;
    fighter := case when sender then duel.challenger_fighter else duel.opponent_fighter end;
    if p_move is null or p_move < 0 or p_move > (fighter->>'tier')::integer + 1 then
      raise exception 'This move is unavailable.';
    end if;
    if sender then
      if duel.challenger_move is not null then return '{}'::jsonb; end if;
      if p_move >= 2 and duel.challenger_ready[p_move - 1] > duel.turn then raise exception 'Skill recharging.'; end if;
      duel.challenger_move := p_move;
    else
      if duel.opponent_move is not null then return '{}'::jsonb; end if;
      if p_move >= 2 and duel.opponent_ready[p_move - 1] > duel.turn then raise exception 'Skill recharging.'; end if;
      duel.opponent_move := p_move;
    end if;
    a := duel.challenger_move;
    b := duel.opponent_move;
    if duel.opponent is null then
      select coalesce(max(skill), 1) into b
      from generate_series(2, (duel.opponent_fighter->>'tier')::integer + 1) as moves(skill)
      where duel.opponent_ready[skill - 1] <= duel.turn;
    end if;

    if a is null or b is null then
      update wired_duel.yokai_duels set challenger_move = a, opponent_move = b,
        updated_at = clock_timestamp() where id = duel.id;
      return '{}'::jsonb;
    end if;

    a_crit := a >= 2 and random() * 100 < (duel.challenger_fighter->>'crit')::integer;
    b_crit := b >= 2 and random() * 100 < (duel.opponent_fighter->>'crit')::integer;
    a_damage := case when a = 0 then 0 else round((duel.challenger_fighter->>'attack')::integer * power[a]
      * (case when a_crit then 1.5 else 1 end) * (case when b = 0 then 0.5 else 1 end)) end;
    b_damage := case when b = 0 then 0 else round((duel.opponent_fighter->>'attack')::integer * power[b]
      * (case when b_crit then 1.5 else 1 end) * (case when a = 0 then 0.5 else 1 end)) end;
    duel.challenger_hp := greatest(0, duel.challenger_hp - b_damage);
    duel.opponent_hp := greatest(0, duel.opponent_hp - a_damage);
    if a >= 2 then duel.challenger_ready[a - 1] := duel.turn + a; end if;
    if b >= 2 then duel.opponent_ready[b - 1] := duel.turn + b; end if;
    if duel.challenger_hp = 0 or duel.opponent_hp = 0 or duel.turn = 50 then
      duel.status := 'finished';
      duel.reason := case when duel.challenger_hp = 0 or duel.opponent_hp = 0 then 'Knockout' else 'Round limit' end;
      duel.winner := case when duel.challenger_hp > 0 and duel.opponent_hp = 0 then duel.challenger
                          when duel.opponent_hp > 0 and duel.challenger_hp = 0 then duel.opponent end;
    end if;
    if duel.reason = 'Knockout' and duel.winner is not null then
      winner_pet := case when duel.winner = duel.challenger then duel.challenger_pet else duel.opponent_pet end;
      reward_xp := case when duel.opponent is null then 10 else 20 end;
      reward_points := case when duel.opponent is null then 5 else 10 end;
      reward_xp := private.yokai_xp_with_rarity(winner_pet, duel.winner, reward_xp);
      if reward_xp is not null and wired_duel.award_knockout(duel.id, duel.winner, winner_pet, reward_xp, reward_points) then
        duel.reward_xp := reward_xp;
        duel.reward_points := reward_points;
      end if;
    end if;
    update wired_duel.yokai_duels set
      reward_xp = duel.reward_xp, reward_points = duel.reward_points,
      challenger_hp = duel.challenger_hp, opponent_hp = duel.opponent_hp,
      challenger_move = null, opponent_move = null, challenger_ready = duel.challenger_ready, opponent_ready = duel.opponent_ready,
      status = duel.status, reason = duel.reason, winner = duel.winner, turn = duel.turn + 1,
      deadline = clock_timestamp() + interval '45 seconds', updated_at = clock_timestamp(),
      history = duel.history || jsonb_build_array(jsonb_build_object('turn', duel.turn,
        'a', a, 'b', b, 'a_crit', a_crit, 'b_crit', b_crit, 'a_damage', a_damage, 'b_damage', b_damage))
    where id = duel.id;
  else
    raise exception 'This action is unavailable.';
  end if;
  return '{}'::jsonb;
end
$function$;
