create table wired_duel.online_presence (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  seen_at timestamptz not null
);
alter table wired_duel.online_presence enable row level security;
revoke all on wired_duel.online_presence from public, anon, authenticated;
create index on wired_duel.online_presence (seen_at);

alter table wired_duel.yokai_duels
  add column requested_species uuid,
  add column requested_level integer check (requested_level between 1 and 99);

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
  draw_base_xp integer;
  reward_points integer;
  sender boolean;
  matched_member uuid;
  a integer;
  b integer;
  a_crit boolean;
  b_crit boolean;
  a_damage integer;
  b_damage integer;
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

  if p_action = 'match_online' then
    if p_turn is null or p_turn not between 1 and 99 or not exists (
      select 1 from public.pet_species where id = p_target and active
    ) then raise exception 'Choose an available species and a level from 1 to 99.'; end if;
    fighter := wired_duel.yokai_duel_fighter(p_pet, actor);
    if fighter is null then raise exception 'Choose a companion you own.'; end if;
    perform pg_advisory_xact_lock(hashtextextended('wired-online-duel:' || actor::text, 0));
    if exists (select 1 from wired_duel.yokai_duels x where x.challenger = actor
      and x.requested_species is not null and x.status = 'pending') then
      raise exception 'You already have an online challenge pending.';
    end if;
    insert into wired_duel.yokai_duels
      (challenger, opponent, challenger_pet, challenger_fighter, challenger_hp, requested_species, requested_level)
    select actor, p.user_id, p_pet, fighter, (fighter->>'hp')::integer, p_target, p_turn
    from wired_duel.online_presence p
    where p.user_id <> actor and p.seen_at > clock_timestamp() - interval '45 seconds'
      and not private.yokai_pound_blocked(actor, p.user_id)
      and exists (select 1 from public.user_pets u where u.owner_id = p.user_id
        and u.species_id = p_target and u.level = p_turn)
      and not exists (select 1 from wired_duel.yokai_duels x
        where (x.challenger, x.opponent) in ((actor, p.user_id), (p.user_id, actor))
          and (x.status in ('pending', 'active') or (x.requested_species is not null
            and x.reason = 'Invitation declined' and x.updated_at > clock_timestamp() - interval '5 minutes')))
    order by random()
    limit 1
    on conflict do nothing
    returning opponent into matched_member;
    if matched_member is null then raise exception 'No online member is available with a matching Yokai.'; end if;
    return jsonb_build_object('member', (select username from public.profiles where id = matched_member));
  end if;

  if p_action = 'list' then
    insert into wired_duel.online_presence as presence (user_id, seen_at)
      values (actor, clock_timestamp())
      on conflict (user_id) do update set seen_at = excluded.seen_at
      where presence.seen_at < excluded.seen_at - interval '10 seconds';
    return coalesce((
      select jsonb_agg(to_jsonb(row_data)) from (
        select d.id, d.challenger, d.opponent, d.challenger_fighter, d.opponent_fighter,
          d.challenger_hp, d.opponent_hp, d.status, d.turn, d.deadline, d.winner, d.reason, d.history,
          case when d.status = 'finished' then
            case when d.reason in ('Invitation expired', 'Turn timed out') then d.deadline else d.updated_at end
          end as finished_at,
          case when d.challenger = actor then d.challenger_ready else d.opponent_ready end ready,
          case when d.challenger = actor then d.challenger_move else d.opponent_move end my_move,
          case when d.challenger = actor then d.opponent_move is not null else d.challenger_move is not null end opponent_locked,
          case when d.winner is null and d.opponent = actor then d.opponent_draw_xp else d.reward_xp end as reward_xp,
          case when d.winner is null and d.opponent = actor then d.opponent_draw_points else d.reward_points end as reward_points,
          d.opponent is null as is_bot, d.requested_species, d.requested_level,
          case when d.opponent = actor and d.status = 'pending' and d.requested_species is not null then (
            select u.id from public.user_pets u where u.owner_id = actor
              and u.species_id = d.requested_species and u.level = d.requested_level order by u.id limit 1
          ) end as matching_pet_id,
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
    if duel.requested_species is not null and not exists (
      select 1 from public.user_pets u where u.id = p_pet and u.owner_id = actor
        and u.species_id = duel.requested_species and u.level = duel.requested_level
    ) then raise exception 'Choose a Yokai that matches the requested species and level.'; end if;
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
    if p_move = 0 and (duel.history->-1->>case when sender then 'a' else 'b' end)::integer = 0 then
      raise exception 'Guard cannot be used two rounds in a row.';
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
      select move into b
      from generate_series(1, (duel.opponent_fighter->>'tier')::integer + 1) as moves(move)
      where move = 1 or duel.opponent_ready[move - 1] <= duel.turn
      order by random()
      limit 1;
    end if;

    if a is null or b is null then
      update wired_duel.yokai_duels set challenger_move = a, opponent_move = b,
        updated_at = clock_timestamp() where id = duel.id;
      return '{}'::jsonb;
    end if;

    a_crit := a >= 2 and b <> 0 and random() * 100 < (duel.challenger_fighter->>'crit')::integer;
    b_crit := b >= 2 and a <> 0 and random() * 100 < (duel.opponent_fighter->>'crit')::integer;
    a_damage := wired_duel.damage_for_move(duel.challenger_fighter, a, a_crit, b = 0);
    b_damage := wired_duel.damage_for_move(duel.opponent_fighter, b, b_crit, a = 0);
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
      reward_xp := case when duel.opponent is null then
        wired_duel.bot_win_base_xp(duel.challenger_fighter->>'rarity', duel.opponent_fighter->>'rarity')
        else 20 end;
      reward_points := case when duel.opponent is null then 5 else 10 end;
      reward_xp := private.yokai_xp_with_rarity(winner_pet, duel.winner, reward_xp);
      if reward_xp is not null and wired_duel.award_duel_reward(duel.id, duel.winner, winner_pet, reward_xp, reward_points) then
        duel.reward_xp := reward_xp;
        duel.reward_points := reward_points;
      end if;
    elsif duel.reason = 'Round limit' or (duel.challenger_hp = 0 and duel.opponent_hp = 0) then
      draw_base_xp := case when duel.opponent is null then
        wired_duel.bot_win_base_xp(duel.challenger_fighter->>'rarity', duel.opponent_fighter->>'rarity') / 2
        else 10 end;
      reward_points := case when duel.opponent is null then 2 else 5 end;
      perform 1 from public.user_pets where id in (duel.challenger_pet, duel.opponent_pet) order by id for update;
      reward_xp := private.yokai_xp_with_rarity(duel.challenger_pet, duel.challenger, draw_base_xp);
      if reward_xp is not null and wired_duel.award_duel_reward(duel.id, duel.challenger, duel.challenger_pet, reward_xp, reward_points) then
        duel.reward_xp := reward_xp;
        duel.reward_points := reward_points;
      end if;
      if duel.opponent is not null then
        reward_xp := private.yokai_xp_with_rarity(duel.opponent_pet, duel.opponent, draw_base_xp);
        if reward_xp is not null and wired_duel.award_duel_reward(duel.id, duel.opponent, duel.opponent_pet, reward_xp, reward_points) then
          duel.opponent_draw_xp := reward_xp;
          duel.opponent_draw_points := reward_points;
        end if;
      end if;
    end if;
    update wired_duel.yokai_duels set
      reward_xp = duel.reward_xp, reward_points = duel.reward_points,
      opponent_draw_xp = duel.opponent_draw_xp, opponent_draw_points = duel.opponent_draw_points,
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
