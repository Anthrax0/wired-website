create table public.community_profile_titles (
  community_id uuid not null,
  user_id uuid not null,
  title text not null check (char_length(title) between 1 and 40 and title = btrim(title) and title ~ '[^[:space:]]'),
  created_at timestamptz not null default now(),
  primary key (community_id, user_id, title),
  foreign key (community_id, user_id)
    references public.community_members (community_id, user_id) on delete cascade
);

alter table public.community_profile_titles enable row level security;

revoke all on public.community_profile_titles from public, anon, authenticated;
grant select, delete on public.community_profile_titles to authenticated;
grant insert (community_id, user_id, title) on public.community_profile_titles to authenticated;

create policy "View titles on visible community profiles"
on public.community_profile_titles for select to authenticated
using (
  public.wired_can_interact_with(user_id)
  and (
    public.is_community_member(community_id)
    or exists (
      select 1 from public.communities c
      where c.id = community_id and (c.visibility = 'public' or c.owner_id = (select auth.uid()))
    )
  )
);

create policy "Community staff can assign titles"
on public.community_profile_titles for insert to authenticated
with check (
  exists (
    select 1 from public.community_members staff
    where staff.community_id = community_profile_titles.community_id
      and staff.user_id = (select auth.uid())
      and staff.role in ('owner', 'mod')
      and not staff.banned and (staff.banned_until is null or staff.banned_until <= now())
  )
  and public.wired_can_interact_with(user_id)
  and exists (
    select 1 from public.community_members member
    where member.community_id = community_profile_titles.community_id
      and member.user_id = community_profile_titles.user_id
      and not member.banned and (member.banned_until is null or member.banned_until <= now())
  )
);

create policy "Community staff can remove titles"
on public.community_profile_titles for delete to authenticated
using (
  exists (
    select 1 from public.community_members staff
    where staff.community_id = community_profile_titles.community_id
      and staff.user_id = (select auth.uid())
      and staff.role in ('owner', 'mod')
      and not staff.banned and (staff.banned_until is null or staff.banned_until <= now())
  )
);
