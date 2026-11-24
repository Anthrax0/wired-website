create table public.community_featured_posts (
  post_id uuid primary key references public.posts(id) on delete cascade,
  featured_at timestamptz not null default now()
);
alter table public.community_featured_posts enable row level security;
revoke all on public.community_featured_posts from public, anon, authenticated;
grant select, delete on public.community_featured_posts to authenticated;
grant insert (post_id) on public.community_featured_posts to authenticated;

create policy "Members read featured posts" on public.community_featured_posts
  for select to authenticated using (
    exists (select 1 from public.posts p where p.id = post_id
      and (public.is_community_member(p.community_id) or public.can_moderate_community(p.community_id)))
  );
create policy "Community staff feature posts" on public.community_featured_posts
  for insert to authenticated with check (
    exists (select 1 from public.posts p where p.id = post_id and public.can_moderate_community(p.community_id))
  );
create policy "Community staff unfeature posts" on public.community_featured_posts
  for delete to authenticated using (
    exists (select 1 from public.posts p where p.id = post_id and public.can_moderate_community(p.community_id))
  );

create table public.community_saved_posts (
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  saved_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
create index community_saved_posts_post_id_idx on public.community_saved_posts(post_id);
alter table public.community_saved_posts enable row level security;
revoke all on public.community_saved_posts from public, anon, authenticated;
grant select, delete on public.community_saved_posts to authenticated;
grant insert (post_id) on public.community_saved_posts to authenticated;

create policy "Members read their saved visible posts" on public.community_saved_posts
  for select to authenticated using (
    user_id = (select auth.uid()) and exists (
      select 1 from public.posts p where p.id = post_id and public.is_community_member(p.community_id)
    )
  );
create policy "Members save visible community posts" on public.community_saved_posts
  for insert to authenticated with check (
    user_id = (select auth.uid()) and exists (
      select 1 from public.posts p where p.id = post_id and public.is_community_member(p.community_id)
    )
  );
create policy "Members remove their saved posts" on public.community_saved_posts
  for delete to authenticated using (user_id = (select auth.uid()));
