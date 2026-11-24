insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-images', 'chat-images', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

alter table public.messages add column image_path text;
alter table public.messages add constraint chat_image_message
 check (image_path is null or (
  voice_path is null and (body in ('Photo', 'GIF') or unsent_at is not null)
 ));
create unique index messages_image_path_key on public.messages (image_path)
 where image_path is not null;

create policy "Only the server can attach chat images" on public.messages
 as restrictive for insert to authenticated with check (image_path is null);

create policy "Thread members can upload their own chat images" on storage.objects
 for insert to authenticated with check (
  bucket_id = 'chat-images'
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp|gif)$'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and exists (
   select 1 from public.thread_members tm
   where tm.user_id = (select auth.uid()) and tm.thread_id::text = (storage.foldername(name))[1]
  )
 );

create policy "Thread members can read sent chat images" on storage.objects
 for select to authenticated using (
  bucket_id = 'chat-images' and exists (
   select 1 from public.messages m
   where m.image_path = name and m.unsent_at is null and public.is_thread_member(m.thread_id)
  )
 );

create function public.send_my_chat_image(p_thread_id uuid, p_path text)
returns public.messages language plpgsql security definer set search_path = '' as $$
declare
 sender uuid := auth.uid();
 sent public.messages;
begin
 if sender is null or not public.is_thread_member(p_thread_id) then
  raise exception 'You do not have access to this chat.' using errcode = '42501';
 end if;
 if p_path is null or (storage.foldername(p_path))[1] is distinct from p_thread_id::text
     or (storage.foldername(p_path))[2] is distinct from sender::text
     or not exists (
      select 1 from storage.objects
      where bucket_id = 'chat-images' and name = p_path and owner_id = sender::text
     ) then
  raise exception 'Upload your attachment before sending it.' using errcode = '42501';
 end if;
 insert into public.messages (thread_id, author_id, body, image_path)
 values (p_thread_id, sender, case when p_path like '%.gif' then 'GIF' else 'Photo' end, p_path)
 on conflict (image_path) where image_path is not null do nothing returning * into sent;
 if sent.id is null then
  select * into sent from public.messages where image_path = p_path and author_id = sender;
 end if;
 return sent;
end;
$$;

revoke execute on function public.send_my_chat_image(uuid,text) from public,anon;
grant execute on function public.send_my_chat_image(uuid,text) to authenticated;
