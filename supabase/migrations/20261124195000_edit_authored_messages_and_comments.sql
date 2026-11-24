alter table public.messages add column edited_at timestamptz;
alter table public.post_comments add column edited_at timestamptz;
alter table public.profile_comments add column edited_at timestamptz;
alter table public.community_profile_comments add column edited_at timestamptz;

create function public.edit_my_chat_text(p_kind text,p_id text,p_body text)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); content text := btrim(p_body); revision timestamptz := clock_timestamp();
begin
 if actor is null then raise exception 'Please log in first.' using errcode='42501'; end if;
 if content is null or length(content)=0 or length(content)>(case when p_kind in ('profile','community-profile') then 1000 else 4000 end) then
  raise exception 'Enter valid text within the character limit.';
 end if;
 case p_kind
  when 'message' then
   update public.messages m set body=content,edited_at=revision
   where m.id=p_id::bigint and m.author_id=actor and m.unsent_at is null
     and exists(select 1 from public.thread_members tm where tm.thread_id=m.thread_id and tm.user_id=actor);
  when 'post' then
   update public.post_comments c set body=content,edited_at=revision
   where c.id=p_id::uuid and c.author_id=actor and exists(
    select 1 from public.posts p where p.id=c.post_id and not p.removed
     and (public.is_community_member(p.community_id) or public.can_moderate_community(p.community_id))
   );
  when 'profile' then
   update public.profile_comments set body=content,edited_at=revision where id=p_id::uuid and author_id=actor;
  when 'community-profile' then
   update public.community_profile_comments set body=content,edited_at=revision
   where id=p_id::uuid and author_id=actor
     and (public.is_community_member(community_id) or public.can_moderate_community(community_id));
  else raise exception 'Unknown content type.';
 end case;
 if not found then raise exception 'Only the author can edit this content while it is available.' using errcode='42501'; end if;
 return revision;
end;
$$;
revoke execute on function public.edit_my_chat_text(text,text,text) from public,anon;
grant execute on function public.edit_my_chat_text(text,text,text) to authenticated;
