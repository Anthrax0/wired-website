create function public.set_community_member_ban(
 p_community_id uuid,p_user_id uuid,p_banned boolean,p_banned_until timestamptz,p_reason text
)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); reason text := btrim(p_reason);
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
 update public.community_members m
 set banned=p_banned,banned_until=case when p_banned then p_banned_until else null end
 where m.community_id=p_community_id and m.user_id=p_user_id and m.role<>'owner'
   and m.user_id<>actor and not exists(
    select 1 from public.communities c where c.id=m.community_id and c.owner_id=m.user_id
   )
   and (m.role<>'mod' or exists(
    select 1 from public.communities c where c.id=m.community_id and c.owner_id=actor
   ));
 if not found then raise exception 'You cannot change this member’s ban.' using errcode='42501'; end if;
 insert into public.moderation_actions(community_id,actor_id,target_user_id,action,details)
 values(p_community_id,actor,p_user_id,case when p_banned then 'ban_member' else 'unban_member' end,
  case when not p_banned then 'Ban lifted' when p_banned_until is null then 'Permanent ban'
       else 'Temporary ban until '||p_banned_until::text end||' · '||reason);
end;
$$;
revoke execute on function public.set_community_member_ban(uuid,uuid,boolean,timestamptz,text) from public,anon;
grant execute on function public.set_community_member_ban(uuid,uuid,boolean,timestamptz,text) to authenticated;
