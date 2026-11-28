create function wired_private.community_member_directory(p_community_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  with community as (
    select c.id, c.owner_id
    from public.communities c
    where c.id = p_community_id
      and auth.uid() is not null
      and (c.owner_id = auth.uid() or exists (
        select 1 from public.community_members m
        where m.community_id = c.id and m.user_id = auth.uid()
      ))
  ), members as (
    select m.user_id, m.role::text as role, m.joined_at
    from public.community_members m
    join community c on c.id = m.community_id
    union all
    select c.owner_id, 'owner', null
    from community c
    where c.owner_id is not null and not exists (
      select 1 from public.community_members m
      where m.community_id = c.id and m.user_id = c.owner_id
    )
  ), visible as (
    select m.* from members m
    where not exists (
      select 1 from public.community_members banned
      where banned.community_id = p_community_id and banned.user_id = m.user_id
        and banned.banned is true
        and (banned.banned_until is null or banned.banned_until > statement_timestamp())
    ) and not exists (
      select 1 from public.community_bans banned
      where banned.community_id = p_community_id and banned.user_id = m.user_id
        and (banned.expires_at is null or banned.expires_at > statement_timestamp())
    ) and not exists (
      select 1 from public.wired_user_blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = m.user_id)
         or (b.blocker_id = m.user_id and b.blocked_id = auth.uid())
    )
  )
  select case when exists (select 1 from visible where user_id = auth.uid()) then
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', m.user_id,
        'role', case when m.user_id = c.owner_id then 'owner' else m.role end,
        'username', coalesce(nullif(local.nickname, ''), p.username),
        'avatar_url', coalesce(nullif(local.avatar_url, ''), p.avatar_url),
        'online', coalesce(presence.last_seen >= statement_timestamp() - interval '75 seconds', false),
        'following', f.following_id is not null
      ) order by m.joined_at desc nulls last, m.user_id)
      from visible m
      cross join community c
      left join public.profiles p on p.id = m.user_id
      left join public.community_profiles local on local.community_id = c.id and local.user_id = m.user_id
      left join wired_private.community_presence presence on presence.community_id = c.id and presence.user_id = m.user_id
      left join public.community_profile_follows f
        on f.community_id = c.id and f.follower_id = auth.uid() and f.following_id = m.user_id
    ), '[]'::jsonb)
  end;
$$;
revoke all on function wired_private.community_member_directory(uuid) from public, anon, authenticated;
grant execute on function wired_private.community_member_directory(uuid) to authenticated;

create function public.get_community_member_directory(p_community_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select wired_private.community_member_directory(p_community_id);
$$;
revoke all on function public.get_community_member_directory(uuid) from public, anon, authenticated;
grant execute on function public.get_community_member_directory(uuid) to authenticated;
