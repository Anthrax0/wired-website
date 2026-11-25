alter table public.threads drop constraint wired_direct_members_valid;
alter table public.threads add constraint wired_direct_members_valid check (
  kind <> 'dm' or direct_archived or (
    direct_member_low is not null and direct_member_high is not null
    and direct_member_low < direct_member_high
  )
);

create unique index wired_active_direct_pair_by_scope
  on public.threads (direct_member_low, direct_member_high, community_id) nulls not distinct
  where kind = 'dm' and not direct_archived;

alter table public.global_notifications
  add column community_id uuid references public.communities(id) on delete cascade;

update public.global_notifications n set community_id = t.community_id
from public.threads t where n.thread_id = t.id and t.community_id is not null
  and n.notification_type = 'global_chat_request';

create function private.wired_active_community_member(p_community uuid, p_user uuid)
returns boolean language sql stable set search_path = '' as $$
  select exists (
    select 1 from public.community_members m
    where m.community_id = p_community and m.user_id = p_user
      and (not coalesce(m.banned, false) or m.banned_until <= now())
  ) and not exists (
    select 1 from public.community_bans b
    where b.community_id = p_community and b.user_id = p_user
      and (b.expires_at is null or b.expires_at > now())
  );
$$;

create or replace function public.is_thread_member(tid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.thread_members m join public.threads t on t.id = m.thread_id
    where m.thread_id = tid and m.user_id = auth.uid()
      and (t.community_id is null or t.kind = 'community'
        or private.wired_active_community_member(t.community_id, m.user_id))
  );
$$;

create function public.wired_request_direct_chat(p_actor uuid, p_peer uuid, p_thread uuid, p_community uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  chat public.threads%rowtype;
  actor_present boolean;
  peer_present boolean;
  initial_request boolean := false;
begin
  if p_actor is null or p_peer is null or p_actor = p_peer then
    raise exception 'Choose another member to invite.';
  end if;
  if private.wired_chat_pair_blocked(p_actor, p_peer) then
    raise exception 'Messaging is unavailable for this connection.';
  end if;

  if p_thread is not null then
    select * into chat from public.threads where id = p_thread for update;
    if not found or chat.direct_archived or (
      chat.kind <> 'dm' and (
        chat.kind <> 'group' or chat.direct_member_low is null
        or least(p_actor, p_peer) <> chat.direct_member_low
        or greatest(p_actor, p_peer) <> chat.direct_member_high
      )
    ) then raise exception 'This private chat has changed. Reopen it and try again.'; end if;
    p_community := chat.community_id;
  end if;

  if p_community is not null and (
    not private.wired_active_community_member(p_community, p_actor)
    or not private.wired_active_community_member(p_community, p_peer)
  ) then raise exception 'Both members must belong to this community.'; end if;

  if p_thread is null then
    loop
      select * into chat from public.threads
      where kind = 'dm' and community_id is not distinct from p_community and not direct_archived
        and direct_member_low = least(p_actor, p_peer)
        and direct_member_high = greatest(p_actor, p_peer)
      for update;
      exit when found;

      insert into public.threads (kind, created_by, community_id, direct_member_low, direct_member_high)
      values ('dm', p_actor, p_community, least(p_actor, p_peer), greatest(p_actor, p_peer))
      on conflict (direct_member_low, direct_member_high, community_id)
        where kind = 'dm' and not direct_archived do nothing
      returning * into chat;
      exit when found;
    end loop;
  end if;

  select exists (select 1 from public.thread_members where thread_id = chat.id and user_id = p_actor),
         exists (select 1 from public.thread_members where thread_id = chat.id and user_id = p_peer)
  into actor_present, peer_present;

  if p_thread is null and actor_present and peer_present then
    update public.thread_members set hidden_at = null where thread_id = chat.id and user_id = p_actor;
    return jsonb_build_object('id', chat.id);
  end if;

  if p_thread is not null and not actor_present then
    raise exception 'You are no longer a member of this chat.';
  end if;
  if p_thread is not null and peer_present then
    raise exception 'This member is already in the chat.';
  end if;

  if exists (
    select 1 from public.global_notifications n where n.thread_id = chat.id
      and n.notification_type = 'global_chat_request' and n.request_status = 'pending'
      and (n.recipient_id = p_peer or (
        p_peer in (chat.direct_member_low, chat.direct_member_high)
        and n.recipient_id = p_actor and n.actor_id = p_peer
      ))
  ) then
    return jsonb_build_object('request_sent', true, 'pending', true);
  end if;

  if not actor_present then
    if peer_present then
      raise exception 'Ask the remaining member to invite you back to this chat.';
    end if;
    if p_community is null and not exists (select 1 from public.friend_requests f where f.status = 'accepted'
        and (f.sender_id, f.recipient_id) in ((p_actor, p_peer), (p_peer, p_actor)))
      and 2 <> (select count(*) from public.profile_follows f
        where (f.follower_id, f.following_id) in ((p_actor, p_peer), (p_peer, p_actor))) then
      raise exception 'You can only chat with confirmed friends or mutual global followers.';
    end if;
    initial_request := true;
  elsif p_peer not in (chat.direct_member_low, chat.direct_member_high) then
    if (p_community is null and not exists (
      select 1 from public.profile_follows where follower_id = p_peer and following_id = p_actor
    )) or (p_community is not null and not exists (
      select 1 from public.community_profile_follows
      where community_id = p_community and follower_id = p_peer and following_id = p_actor
    )) then
      raise exception 'You can only invite members who follow your profile.';
    end if;
    if (case when p_community is null then 999 else 50 end) <= (
      select count(*) from (
        select user_id from public.thread_members where thread_id = chat.id
        union select recipient_id from public.global_notifications where thread_id = chat.id
          and notification_type = 'global_chat_request' and request_status = 'pending'
        union select chat.direct_member_low
        union select chat.direct_member_high
      ) occupants
    ) then raise exception 'All chat spaces are reserved.'; end if;
  end if;

  insert into public.global_notifications
    (recipient_id, actor_id, thread_id, notification_type, request_status, direct_start, community_id)
  values (p_peer, p_actor, chat.id, 'global_chat_request', 'pending', initial_request, p_community);

  return jsonb_build_object('request_sent', true);
end;
$$;

revoke execute on function public.wired_request_direct_chat(uuid, uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.wired_request_direct_chat(uuid, uuid, uuid, uuid) to service_role;

create or replace function public.wired_request_direct_chat(p_actor uuid, p_peer uuid, p_thread uuid default null)
returns jsonb language sql security definer set search_path = '' as $$
  select public.wired_request_direct_chat(p_actor, p_peer, p_thread, null::uuid);
$$;

drop index public.wired_active_direct_pair;

create or replace function public.wired_respond_chat_request(p_user uuid, p_thread uuid, p_notification uuid, p_status text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  chat public.threads%rowtype;
  invitation public.global_notifications%rowtype;
begin
  if p_status is null or p_status not in ('accepted', 'declined') then
    raise exception 'Choose accept or decline.';
  end if;
  select * into chat from public.threads where id = p_thread for update;
  if not found or chat.direct_archived then raise exception 'Chat not found.'; end if;
  select * into invitation from public.global_notifications
  where id = p_notification and thread_id = p_thread and recipient_id = p_user
    and notification_type = 'global_chat_request' for update;
  if not found then raise exception 'This chat request is no longer available.'; end if;
  if invitation.request_status = p_status then
    return jsonb_build_object('ok', true, 'status', p_status, 'thread_id', p_thread, 'community_id', chat.community_id);
  end if;
  if invitation.request_status is distinct from 'pending' then
    raise exception 'This chat request is no longer available.';
  end if;

  if p_status = 'accepted' then
    if private.wired_chat_pair_blocked(p_user, invitation.actor_id) then
      raise exception 'Messaging is unavailable for this connection.';
    end if;
    if chat.community_id is not null and (
      not private.wired_active_community_member(chat.community_id, p_user)
      or not private.wired_active_community_member(chat.community_id, invitation.actor_id)
    ) then raise exception 'Both members must still belong to the community.'; end if;

    if invitation.direct_start then
      if chat.kind <> 'dm' or exists (select 1 from public.thread_members where thread_id = p_thread) then
        raise exception 'This chat request is no longer available.';
      end if;
      insert into public.thread_members (thread_id, user_id, added_by)
      values (p_thread, invitation.actor_id, invitation.actor_id);
    elsif not exists (
      select 1 from public.thread_members where thread_id = p_thread and user_id = invitation.actor_id
    ) then
      raise exception 'The person who invited you is no longer in this chat.';
    end if;

    if not exists (select 1 from public.thread_members where thread_id = p_thread and user_id = p_user)
      and (select count(*) from public.thread_members where thread_id = p_thread)
        >= (case when chat.community_id is null then 999 else 50 end) then
      raise exception 'This chat has reached its member limit.';
    end if;

    insert into public.thread_members (thread_id, user_id, added_by)
    values (p_thread, p_user, invitation.actor_id)
    on conflict (thread_id, user_id) do update set hidden_at = null;

    if chat.kind = 'dm' and p_user not in (chat.direct_member_low, chat.direct_member_high) then
      update public.threads set kind = 'group' where id = p_thread;
    end if;
  end if;

  update public.global_notifications set request_status = p_status, read_at = now()
  where id = invitation.id;
  return jsonb_build_object('ok', true, 'status', p_status, 'thread_id', p_thread, 'community_id', chat.community_id);
end;
$$;

create function private.wired_notify_private_community_message()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.community_notifications
    (community_id, recipient_id, actor_id, thread_id, notification_type, details)
  select t.community_id, m.user_id, new.author_id, t.id, 'community_chat', left(new.body, 160)
  from public.threads t join public.thread_members m on m.thread_id = t.id
  where t.id = new.thread_id and t.kind in ('dm', 'group') and t.community_id is not null
    and m.user_id <> new.author_id and m.hidden_at is null
    and private.wired_active_community_member(t.community_id, m.user_id)
    and not private.wired_chat_pair_blocked(new.author_id, m.user_id);
  return new;
end;
$$;

create trigger wired_private_community_message_notice after insert on public.messages
  for each row execute function private.wired_notify_private_community_message();
