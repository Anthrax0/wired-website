create schema wired_profile_moderation;
grant usage on schema wired_profile_moderation to authenticated;

create function wired_profile_moderation.can_submit_in(p_community uuid, p_member uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and not exists (
      select 1 from public.community_bans b where b.community_id = p_community
        and b.user_id in (auth.uid(), p_member)
        and (b.expires_at is null or b.expires_at > now())
    )
    and exists (
      select 1 from public.communities c where c.id = p_community
        and (c.owner_id = auth.uid() or exists (
          select 1 from public.community_members m where m.community_id = c.id
            and m.user_id = auth.uid() and not coalesce(m.banned, false)
        ))
        and (c.owner_id = p_member or exists (
          select 1 from public.community_members m where m.community_id = c.id
            and m.user_id = p_member and not coalesce(m.banned, false)
        ))
    )
$$;

create function wired_profile_moderation.can_review(p_scope text, p_community uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select case when p_scope = 'app' then public.is_wired_staff()
    when p_scope = 'community' then auth.uid() is not null
      and not exists (
        select 1 from public.community_bans b where b.community_id = p_community
          and b.user_id = auth.uid() and (b.expires_at is null or b.expires_at > now())
      )
      and exists (
        select 1 from public.communities c where c.id = p_community
          and (c.owner_id = auth.uid() or exists (
            select 1 from public.community_members m where m.community_id = c.id
              and m.user_id = auth.uid() and m.role in ('owner', 'mod') and not coalesce(m.banned, false)
          ))
      )
    else false end
$$;
revoke all on function wired_profile_moderation.can_submit_in(uuid, uuid),
  wired_profile_moderation.can_review(text, uuid) from public, anon, authenticated;
grant execute on function wired_profile_moderation.can_submit_in(uuid, uuid),
  wired_profile_moderation.can_review(text, uuid) to authenticated;

create table public.member_profile_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  member_id uuid not null references public.profiles(id) on delete cascade,
  community_id uuid references public.communities(id) on delete cascade,
  scope text not null check (scope in ('app', 'community')),
  reason text not null check (char_length(btrim(reason)) between 1 and 1500),
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now(),
  check (reporter_id <> member_id),
  check (scope <> 'community' or community_id is not null)
);
alter table public.member_profile_reports enable row level security;
revoke all on public.member_profile_reports from public, anon, authenticated;
grant insert (member_id, community_id, scope, reason),
  select, update (status) on public.member_profile_reports to authenticated;

create unique index member_profile_reports_open_dedup
  on public.member_profile_reports (reporter_id, member_id, scope, community_id)
  nulls not distinct where status = 'open';
create index member_profile_reports_inbox
  on public.member_profile_reports (scope, community_id, created_at desc) where status = 'open';

create policy submit_member_profile_report on public.member_profile_reports
  for insert to authenticated with check (
    reporter_id = (select auth.uid())
    and (community_id is null or wired_profile_moderation.can_submit_in(community_id, member_id))
  );
create policy review_member_profile_reports on public.member_profile_reports
  for select to authenticated using (
    member_id <> (select auth.uid()) and wired_profile_moderation.can_review(scope, community_id)
  );
create policy resolve_member_profile_reports on public.member_profile_reports
  for update to authenticated using (
    status = 'open' and member_id <> (select auth.uid())
      and wired_profile_moderation.can_review(scope, community_id)
  ) with check (
    status = 'resolved' and member_id <> (select auth.uid())
      and wired_profile_moderation.can_review(scope, community_id)
  );
