alter table public.threads
  add column direct_member_low uuid,
  add column direct_member_high uuid,
  add column direct_archived boolean not null default false;

alter table public.global_notifications
  add column direct_start boolean not null default false;

alter table public.threads drop constraint threads_kind_check;
alter table public.threads add constraint threads_kind_check
  check (kind in ('dm', 'group', 'community'));

-- Recover the original pair even when one membership has already been deleted.
with identities as (
  select t.id, t.created_at, array(
    select u from (
      select t.created_by as u
      union select user_id from public.thread_members where thread_id = t.id
      union select author_id from public.messages where thread_id = t.id
      union select recipient_id from public.global_notifications
        where thread_id = t.id and notification_type = 'global_chat_request'
          and actor_id = t.created_by
    ) participants where u is not null order by u
  ) as members,
  (select count(*) from public.thread_members where thread_id = t.id and hidden_at is null) active,
  (select max(id) from public.messages where thread_id = t.id) last_message
  from public.threads t where t.kind = 'dm' and t.community_id is null
), ranked as (
  select *, row_number() over (
    partition by members order by active desc, last_message desc nulls last, created_at, id
  ) as pair_rank from identities
)
update public.threads t
set direct_member_low = case when cardinality(r.members) = 2 then r.members[1] end,
    direct_member_high = case when cardinality(r.members) = 2 then r.members[2] end,
    direct_archived = cardinality(r.members) <> 2 or r.pair_rank > 1
from ranked r where r.id = t.id;

alter table public.threads add constraint wired_direct_members_valid check (
  kind <> 'dm' or community_id is not null or direct_archived
  or (direct_member_low is not null and direct_member_high is not null
    and direct_member_low < direct_member_high)
);

create unique index wired_active_direct_pair on public.threads (direct_member_low, direct_member_high)
  where kind = 'dm' and community_id is null and not direct_archived;

-- Retire obsolete invitations while preserving the notification records.
with requests as (
  select n.id, t.direct_archived, row_number() over (
    partition by n.thread_id,
      case when t.kind = 'dm' and n.recipient_id in (t.direct_member_low, t.direct_member_high)
           then t.direct_member_low else n.recipient_id end
    order by n.created_at, n.id
  ) as request_rank
  from public.global_notifications n join public.threads t on t.id = n.thread_id
  where n.notification_type = 'global_chat_request' and n.request_status = 'pending'
)
update public.global_notifications n set request_status = 'declined', read_at = coalesce(n.read_at, now())
from requests r where n.id = r.id and (r.direct_archived or r.request_rank > 1);

-- Migrate hidden sender placeholders from the previous initial-request flow.
with placeholders as (
  update public.global_notifications n set direct_start = true
  from public.threads t
  where t.id = n.thread_id and t.kind = 'dm' and not t.direct_archived
    and n.notification_type = 'global_chat_request' and n.request_status = 'pending'
    and exists (select 1 from public.thread_members m where m.thread_id = t.id
      and m.user_id = n.actor_id and m.hidden_at is not null)
    and not exists (select 1 from public.thread_members m where m.thread_id = t.id and m.user_id <> n.actor_id)
  returning n.thread_id, n.actor_id
)
delete from public.thread_members m using placeholders p
where m.thread_id = p.thread_id and m.user_id = p.actor_id;

create unique index wired_pending_chat_request on public.global_notifications (thread_id, recipient_id)
  where notification_type = 'global_chat_request' and request_status = 'pending';

create function private.wired_chat_pair_blocked(p_first uuid, p_second uuid)
returns boolean language sql stable set search_path = '' as $$
  select exists (
    select 1 from public.wired_user_blocks b
    where (b.blocker_id, b.blocked_id) in ((p_first, p_second), (p_second, p_first))
  ) or exists (
    select 1 from public.blocks b
    where (b.blocker_id, b.blocked_id) in ((p_first, p_second), (p_second, p_first))
  );
$$;

create function public.wired_request_direct_chat(p_actor uuid, p_peer uuid, p_thread uuid default null)
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

  if p_thread is null then
    loop
      select * into chat from public.threads
      where kind = 'dm' and community_id is null and not direct_archived
        and direct_member_low = least(p_actor, p_peer)
        and direct_member_high = greatest(p_actor, p_peer)
      for update;
      exit when found;

      insert into public.threads (kind, created_by, direct_member_low, direct_member_high)
      values ('dm', p_actor, least(p_actor, p_peer), greatest(p_actor, p_peer))
      on conflict (direct_member_low, direct_member_high)
        where kind = 'dm' and community_id is null and not direct_archived do nothing
      returning * into chat;
      exit when found;
    end loop;
  else
    select * into chat from public.threads where id = p_thread for update;
    if not found or chat.direct_archived or chat.community_id is not null or (
      chat.kind <> 'dm' and (
        chat.direct_member_low is null or least(p_actor, p_peer) <> chat.direct_member_low
        or greatest(p_actor, p_peer) <> chat.direct_member_high
      )
    ) then
      raise exception 'This direct chat has changed. Reopen the conversation and try again.';
    end if;
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
    if not exists (select 1 from public.friend_requests f where f.status = 'accepted'
        and (f.sender_id, f.recipient_id) in ((p_actor, p_peer), (p_peer, p_actor)))
      and 2 <> (select count(*) from public.profile_follows f
        where (f.follower_id, f.following_id) in ((p_actor, p_peer), (p_peer, p_actor))) then
      raise exception 'You can only chat with confirmed friends or mutual global followers.';
    end if;
    initial_request := true;
  elsif p_peer not in (chat.direct_member_low, chat.direct_member_high) then
    if not exists (select 1 from public.profile_follows where follower_id = p_peer and following_id = p_actor) then
      raise exception 'You can only invite members who follow your profile.';
    end if;
    if 999 <= (
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
    (recipient_id, actor_id, thread_id, notification_type, request_status, direct_start)
  values (p_peer, p_actor, chat.id, 'global_chat_request', 'pending', initial_request);

  return jsonb_build_object('request_sent', true);
end;
$$;

create function public.wired_respond_chat_request(p_user uuid, p_thread uuid, p_notification uuid, p_status text)
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
    return jsonb_build_object('ok', true, 'status', p_status, 'thread_id', p_thread);
  end if;
  if invitation.request_status is distinct from 'pending' then
    raise exception 'This chat request is no longer available.';
  end if;

  if p_status = 'accepted' then
    if private.wired_chat_pair_blocked(p_user, invitation.actor_id) then
      raise exception 'Messaging is unavailable for this connection.';
    end if;
    if chat.community_id is not null and 2 <> (
      select count(*) from public.community_members where community_id = chat.community_id
        and user_id in (p_user, invitation.actor_id) and not banned
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
  return jsonb_build_object('ok', true, 'status', p_status, 'thread_id', p_thread);
end;
$$;

revoke execute on function public.wired_request_direct_chat(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.wired_respond_chat_request(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.wired_request_direct_chat(uuid, uuid, uuid) to service_role;
grant execute on function public.wired_respond_chat_request(uuid, uuid, uuid, text) to service_role;

create or replace function public.wired_prevent_blocked_direct_message()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  chat public.threads%rowtype;
  peer uuid;
begin
  select * into chat from public.threads where id = new.thread_id;
  if chat.kind = 'dm' then
    if chat.direct_archived then raise exception 'This archived chat is read-only.'; end if;
    peer := case when new.author_id = chat.direct_member_low
      then chat.direct_member_high else chat.direct_member_low end;
    if private.wired_chat_pair_blocked(new.author_id, peer) then
      raise exception 'Messaging is unavailable for this connection.';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.wired_leave_chat_with_notice(p_thread uuid, p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  chat public.threads%rowtype;
  uname text;
begin
  select * into chat from public.threads where id = p_thread for update;
  if not exists (select 1 from public.thread_members where thread_id = p_thread and user_id = p_user) then
    return;
  end if;
  if not chat.direct_archived and (
    chat.kind <> 'dm' or not private.wired_chat_pair_blocked(chat.direct_member_low, chat.direct_member_high)
  ) then
    select username into uname from public.profiles where id = p_user;
    insert into public.messages (thread_id, author_id, body)
    values (p_thread, p_user, coalesce(uname, 'Member') || ' has left the chat.');
  end if;
  update public.global_notifications set request_status = 'declined', read_at = coalesce(read_at, now())
  where thread_id = p_thread and actor_id = p_user and notification_type = 'global_chat_request'
    and request_status = 'pending';
  delete from public.thread_members where thread_id = p_thread and user_id = p_user;
end;
$$;

revoke execute on function public.wired_leave_chat_with_notice(uuid, uuid) from public, anon, authenticated;
grant execute on function public.wired_leave_chat_with_notice(uuid, uuid) to service_role;

revoke update on public.global_notifications from public, anon, authenticated;
grant update (read_at, chat_read_at) on public.global_notifications to authenticated;
