create function public.issue_community_strike(
 p_community_id uuid,p_user_id uuid,p_reason text
)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); reason text := btrim(p_reason);
begin
 if actor is null or not public.can_moderate_community(p_community_id) then
  raise exception 'Only community staff can issue a strike.' using errcode='42501';
 end if;
 if reason is null or length(reason) not between 1 and 500 then
  raise exception 'Enter a strike reason between 1 and 500 characters.';
 end if;
 if not exists(
  select 1 from public.community_members m
  join public.communities c on c.id=m.community_id
  where m.community_id=p_community_id and m.user_id=p_user_id
    and m.role<>'owner' and m.user_id<>actor and m.user_id<>c.owner_id
    and (m.role<>'mod' or c.owner_id=actor)
 ) then
  raise exception 'You cannot issue a strike to this member.' using errcode='42501';
 end if;
 insert into public.moderation_actions(community_id,actor_id,target_user_id,action,details)
 values(p_community_id,actor,p_user_id,'issue_strike',reason);
 insert into public.community_notifications(community_id,recipient_id,actor_id,notification_type,details)
 values(p_community_id,p_user_id,actor,'community_moderation','Strike issued · '||reason);
end;
$$;
revoke execute on function public.issue_community_strike(uuid,uuid,text) from public,anon;
grant execute on function public.issue_community_strike(uuid,uuid,text) to authenticated;
