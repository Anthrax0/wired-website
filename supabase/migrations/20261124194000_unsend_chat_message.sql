alter table public.messages add column unsent_at timestamptz;

create function public.unsend_my_message(p_thread_id uuid,p_message_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare sender uuid := auth.uid();
begin
  if sender is null or not exists (
    select 1 from public.thread_members where thread_id=p_thread_id and user_id=sender
  ) then
    raise exception 'You do not have access to this chat.' using errcode='42501';
  end if;

  update public.messages
  set body='Message unsent',unsent_at=now()
  where id=p_message_id and thread_id=p_thread_id and author_id=sender and unsent_at is null;

  if not found and not exists (
    select 1 from public.messages
    where id=p_message_id and thread_id=p_thread_id and author_id=sender and unsent_at is not null
  ) then
    raise exception 'You can only unsend messages you sent.' using errcode='42501';
  end if;
end;
$$;

revoke execute on function public.unsend_my_message(uuid,bigint) from public,anon;
grant execute on function public.unsend_my_message(uuid,bigint) to authenticated;
