create table public.community_bans (
 community_id uuid not null references public.communities(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 former_role text not null,
 expires_at timestamptz,
 primary key (community_id,user_id)
);
alter table public.community_bans enable row level security;
revoke all on public.community_bans from public,anon,authenticated;
grant select on public.community_bans to authenticated;
create policy "Members see own ban and staff see community bans" on public.community_bans
 for select to authenticated using (user_id=(select auth.uid()) or public.can_moderate_community(community_id));

create function public.check_community_reentry()
returns trigger language plpgsql security definer set search_path = '' as $$
declare cid uuid;
begin
 if tg_table_name='thread_members' then
  select community_id into cid from public.threads where id=new.thread_id;
 else
  cid:=new.community_id;
 end if;
 if cid is null then return new; end if;
 if tg_table_name='community_join_requests' and to_jsonb(new)->>'status' not in ('pending','approved') then return new; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(cid::text||':'||new.user_id::text,0));
 if exists(select 1 from public.community_bans where community_id=cid and user_id=new.user_id
           and (expires_at is null or expires_at>now())) then
  raise exception 'This member is banned from the community.' using errcode='42501';
 end if;
 return new;
end;
$$;
revoke execute on function public.check_community_reentry() from public,anon,authenticated;
create trigger block_banned_community_members
 before insert or update of community_id,user_id on public.community_members
 for each row execute function public.check_community_reentry();
create trigger block_banned_join_requests
 before insert or update of community_id,user_id,status on public.community_join_requests
 for each row execute function public.check_community_reentry();
create trigger block_banned_community_chat_members
 before insert or update of thread_id,user_id on public.thread_members
 for each row execute function public.check_community_reentry();

insert into public.community_bans(community_id,user_id,former_role,expires_at)
select m.community_id,m.user_id,m.role,m.banned_until
from public.community_members m join public.communities c on c.id=m.community_id
where m.banned and m.role<>'owner' and m.user_id<>c.owner_id
  and (m.banned_until is null or m.banned_until>now());
delete from public.thread_members tm using public.threads t,public.community_bans b
 where t.id=tm.thread_id and b.community_id=t.community_id and b.user_id=tm.user_id;
update public.community_join_requests r set status='cancelled'
from public.community_members m
where m.banned and m.role<>'owner' and r.community_id=m.community_id and r.user_id=m.user_id
  and r.status in ('pending','approved');
delete from public.community_members m using public.communities c
where c.id=m.community_id and m.banned and m.role<>'owner' and m.user_id<>c.owner_id;

create or replace function public.set_community_member_ban(
 p_community_id uuid,p_user_id uuid,p_banned boolean,p_banned_until timestamptz,p_reason text
)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); reason text := btrim(p_reason); owner_id uuid; target_role text;
begin
 if actor is null or not public.can_moderate_community(p_community_id) then
  raise exception 'Only community staff can change a ban.' using errcode='42501';
 end if;
 if p_banned is null or reason is null or length(reason) not between 1 and 500 then
  raise exception 'Enter a reason between 1 and 500 characters.';
 end if;
 if p_banned and p_banned_until is not null and
    (p_banned_until<=now() or p_banned_until>now()+interval '366 days') then
  raise exception 'Choose a future ban end time within one year.';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_community_id::text||':'||p_user_id::text,0));
 select c.owner_id into owner_id from public.communities c where c.id=p_community_id;
 if p_banned then
  select m.role into target_role from public.community_members m
  where m.community_id=p_community_id and m.user_id=p_user_id for update;
 else
  select b.former_role into target_role from public.community_bans b
  where b.community_id=p_community_id and b.user_id=p_user_id;
 end if;
 if target_role is null or target_role='owner' or p_user_id in (actor,owner_id)
  or target_role='mod' and actor<>owner_id then
  raise exception 'You cannot change this member’s ban.' using errcode='42501';
 end if;
 if p_banned then
  insert into public.community_bans(community_id,user_id,former_role,expires_at)
  values(p_community_id,p_user_id,target_role,p_banned_until)
  on conflict (community_id,user_id) do update set former_role=excluded.former_role,expires_at=excluded.expires_at;
  delete from public.community_members where community_id=p_community_id and user_id=p_user_id;
  delete from public.thread_members tm using public.threads t
  where t.id=tm.thread_id and t.community_id=p_community_id and tm.user_id=p_user_id;
  update public.community_join_requests set status='cancelled',reviewed_by=actor,reviewed_at=now()
  where community_id=p_community_id and user_id=p_user_id and status in ('pending','approved');
 else
  delete from public.community_bans where community_id=p_community_id and user_id=p_user_id;
 end if;
 insert into public.moderation_actions(community_id,actor_id,target_user_id,action,details)
 values(p_community_id,actor,p_user_id,case when p_banned then 'ban_member' else 'unban_member' end,
  case when not p_banned then 'Ban lifted' when p_banned_until is null then 'Permanent ban'
       else 'Temporary ban until '||p_banned_until::text end||' · '||reason);
end;
$$;
