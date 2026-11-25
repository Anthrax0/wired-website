create schema if not exists wired_private;
grant usage on schema wired_private to authenticated;

create table wired_private.community_presence (
  community_id uuid not null references public.communities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_seen timestamptz not null,
  primary key (community_id, user_id)
);
alter table wired_private.community_presence enable row level security;
create index community_presence_recent_idx on wired_private.community_presence (community_id, last_seen);

create function wired_private.community_activity(p_community_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  viewer uuid := auth.uid();
  seen_at timestamptz := statement_timestamp();
  joined boolean;
  online_count bigint;
  active_count bigint;
begin
  if viewer is null or not exists (
    select 1 from public.communities c
    where c.id = p_community_id
  ) or exists (
    select 1 from public.community_bans b
    where b.community_id = p_community_id and b.user_id = viewer
      and (b.expires_at is null or b.expires_at > seen_at)
  ) or exists (
    select 1 from public.community_members m
    where m.community_id = p_community_id and m.user_id = viewer and m.banned is true
      and (m.banned_until is null or m.banned_until > seen_at)
  ) then
    return null;
  end if;

  select exists (
    select 1 from public.community_members m
    where m.community_id = p_community_id and m.user_id = viewer
  ) or exists (
    select 1 from public.communities c where c.id = p_community_id and c.owner_id = viewer
  ) into joined;

  if joined then
    insert into wired_private.community_presence as presence (community_id, user_id, last_seen)
    values (p_community_id, viewer, seen_at)
    on conflict (community_id, user_id) do update set last_seen = excluded.last_seen
    where presence.last_seen < excluded.last_seen - interval '15 seconds';
  elsif not exists (
    select 1 from public.communities c
    where c.id = p_community_id and c.visibility = 'public' and c.discoverable is true
  ) then
    return null;
  end if;

  select count(*) filter (where p.last_seen >= seen_at - interval '75 seconds'), count(*)
    into online_count, active_count
  from wired_private.community_presence p
  join public.communities c on c.id = p.community_id
  left join public.community_members m on m.community_id = p.community_id and m.user_id = p.user_id
  where p.community_id = p_community_id and p.last_seen >= seen_at - interval '24 hours'
    and (m.user_id is not null or c.owner_id = p.user_id)
    and (m.banned is not true or m.banned_until <= seen_at)
    and not exists (
      select 1 from public.community_bans b where b.community_id = p.community_id and b.user_id = p.user_id
        and (b.expires_at is null or b.expires_at > seen_at)
    )
    and not exists (
      select 1 from public.wired_user_blocks b
      where (b.blocker_id = viewer and b.blocked_id = p.user_id)
         or (b.blocker_id = p.user_id and b.blocked_id = viewer)
    );

  return jsonb_build_object('online', online_count, 'active_today', active_count);
end
$$;
revoke all on function wired_private.community_activity(uuid) from public, anon, authenticated;
grant execute on function wired_private.community_activity(uuid) to authenticated;

create function public.get_community_activity(p_community_id uuid)
returns jsonb language sql security invoker set search_path = '' as $$
  select wired_private.community_activity(p_community_id);
$$;
revoke all on function public.get_community_activity(uuid) from public, anon, authenticated;
grant execute on function public.get_community_activity(uuid) to authenticated;
