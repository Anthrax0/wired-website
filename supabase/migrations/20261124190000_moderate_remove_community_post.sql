create function public.moderate_remove_community_post(
  p_community_id uuid, p_post_id uuid, p_report_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  was_removed boolean;
  closed_reports integer;
begin
  if actor is null or not public.can_moderate_community(p_community_id) then
    raise exception 'Only this community’s staff can remove its posts.' using errcode='42501';
  end if;

  select removed into was_removed
  from public.posts where id=p_post_id and community_id=p_community_id
  for update;
  if not found then raise exception 'Post not found in this community.'; end if;

  if p_report_id is not null and not exists (
    select 1 from public.reports where id=p_report_id and target_type='post' and target_id=p_post_id::text
  ) then
    raise exception 'Report does not match this post.';
  end if;

  if not was_removed then
    update public.posts set removed=true where id=p_post_id and community_id=p_community_id;
  end if;
  update public.reports set status='resolved'
  where target_type='post' and target_id=p_post_id::text and status='open';
  get diagnostics closed_reports = row_count;

  if not was_removed or closed_reports>0 then
    insert into public.moderation_actions(community_id,actor_id,action,details)
    values (p_community_id,actor,
      case when p_report_id is null then 'remove_post' else 'remove_reported_post' end,
      'Post '||p_post_id::text||' removed'||
        case when closed_reports>0 then ' · '||closed_reports::text||' open report(s) resolved' else '' end);
  end if;
end;
$$;

revoke execute on function public.moderate_remove_community_post(uuid,uuid,uuid) from public,anon;
grant execute on function public.moderate_remove_community_post(uuid,uuid,uuid) to authenticated;
