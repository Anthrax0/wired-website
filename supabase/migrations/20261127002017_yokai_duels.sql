create schema wired_duel;
create table wired_duel.yokai_duels (
  id uuid primary key default gen_random_uuid(),
  challenger uuid not null references public.profiles(id) on delete cascade,
  opponent uuid not null references public.profiles(id) on delete cascade,
  challenger_pet uuid not null,
  challenger_fighter jsonb not null,
  opponent_fighter jsonb,
  challenger_hp integer not null,
  opponent_hp integer,
  challenger_move integer,
  opponent_move integer,
  challenger_ready integer[] not null default array[1,1,1,1],
  opponent_ready integer[] not null default array[1,1,1,1],
  status text not null default 'pending',
  turn integer not null default 1,
  deadline timestamptz not null default (now() + interval '5 minutes'),
  winner uuid,
  reason text,
  history jsonb not null default '[]',
  updated_at timestamptz not null default now(),
  check (challenger <> opponent)
);
alter table wired_duel.yokai_duels enable row level security;
revoke all on wired_duel.yokai_duels from public, anon, authenticated;
create unique index yokai_duels_open_pair on wired_duel.yokai_duels
  (least(challenger, opponent), greatest(challenger, opponent))
  where status in ('pending', 'active');
create index yokai_duels_challenger on wired_duel.yokai_duels (challenger, updated_at desc);
create index yokai_duels_opponent on wired_duel.yokai_duels (opponent, updated_at desc);

create function wired_duel.yokai_duel_fighter(p_pet uuid, p_owner uuid)
returns jsonb language sql set search_path = '' as $$
  select jsonb_build_object(
    'name', coalesce(nullif(btrim(p.nickname), ''), s.name),
    'species', s.name, 'slug', s.slug, 'level', p.level, 'rarity', s.rarity,
    'tier', stats.tier, 'crit', 4 + stats.rarity,
    'hp', round((100 + p.level * 3 + (stats.tier - 1) * 12) * (1 + (stats.rarity - 1) * 0.02)),
    'attack', round((12 + p.level * 0.45 + (stats.tier - 1) * 2) * (1 + (stats.rarity - 1) * 0.02)),
    'skill', s.ability_name
  )
  from public.user_pets p join public.pet_species s on s.id = p.species_id
  cross join lateral (
    select coalesce(array_position(array['common','uncommon','rare','epic','legendary','mythical'], lower(s.rarity)), 1) rarity,
      case when p.level >= 90 then 4 when p.level >= 45 then 3 when p.level >= 15 then 2 else 1 end tier
  ) stats
  where p.id = p_pet and p.owner_id = p_owner
$$;
revoke all on function wired_duel.yokai_duel_fighter(uuid, uuid) from public, anon, authenticated;

create function wired_duel.yokai_duel_action(p_action text, p_id uuid, p_pet uuid, p_target uuid, p_turn integer, p_move integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  duel wired_duel.yokai_duels;
  fighter jsonb;
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
          cp.username challenger_name, op.username opponent_name
        from wired_duel.yokai_duels d
        join public.profiles cp on cp.id = d.challenger
        join public.profiles op on op.id = d.opponent
        where actor in (d.challenger, d.opponent)
          and not private.yokai_pound_blocked(d.challenger, d.opponent)
        order by (d.status = 'active') desc, (d.status = 'pending') desc, d.updated_at desc, d.id
        limit 20
      ) row_data
    ), '[]'::jsonb);
  end if;

  select * into duel from wired_duel.yokai_duels d where d.id = p_id
    and actor in (d.challenger, d.opponent) for update;
  if not found or private.yokai_pound_blocked(duel.challenger, duel.opponent) then
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
    update wired_duel.yokai_duels set status = 'active',
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
    update wired_duel.yokai_duels set
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
$$;
revoke all on function wired_duel.yokai_duel_action(text,uuid,uuid,uuid,integer,integer) from public, anon, authenticated;
grant usage on schema wired_duel to authenticated;
grant execute on function wired_duel.yokai_duel_action(text,uuid,uuid,uuid,integer,integer) to authenticated;

create function public.yokai_duel(p_action text, p_id uuid default null, p_pet uuid default null,
  p_target uuid default null, p_turn integer default null, p_move integer default null)
returns jsonb language sql security invoker set search_path = '' as $$
  select wired_duel.yokai_duel_action(p_action,p_id,p_pet,p_target,p_turn,p_move)
$$;
revoke all on function public.yokai_duel(text,uuid,uuid,uuid,integer,integer) from public, anon, authenticated;
grant execute on function public.yokai_duel(text,uuid,uuid,uuid,integer,integer) to authenticated;
