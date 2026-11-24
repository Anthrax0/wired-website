insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('chat-voice-clips','chat-voice-clips',false,5242880,array['audio/webm','audio/ogg','audio/mp4']);

alter table public.messages add column voice_path text;
alter table public.messages add constraint voice_clip_body
 check (voice_path is null or body='Voice clip' or unsent_at is not null);
create unique index messages_voice_path_key on public.messages(voice_path) where voice_path is not null;

create policy "Only the server can attach voice clips" on public.messages
 as restrictive for insert to authenticated with check (voice_path is null);

create policy "Thread members can upload their own voice clips" on storage.objects
 for insert to authenticated with check (
  bucket_id='chat-voice-clips' and (storage.foldername(name))[2]=(select auth.uid())::text
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(webm|ogg|m4a)$'
  and exists (
   select 1 from public.thread_members tm
   where tm.user_id=(select auth.uid()) and tm.thread_id::text=(storage.foldername(name))[1]
  )
 );

create policy "Thread members can read sent voice clips" on storage.objects
 for select to authenticated using (
  bucket_id='chat-voice-clips' and exists (
   select 1 from public.messages m
   where m.voice_path=name and m.unsent_at is null and public.is_thread_member(m.thread_id)
  )
 );

create function public.send_my_voice_clip(p_thread_id uuid,p_path text)
returns public.messages language plpgsql security definer set search_path = '' as $$
declare sender uuid := auth.uid(); sent public.messages;
begin
 if sender is null or not public.is_thread_member(p_thread_id) then
  raise exception 'You do not have access to this chat.' using errcode='42501';
 end if;
 if p_path is null or (storage.foldername(p_path))[1] is distinct from p_thread_id::text
     or (storage.foldername(p_path))[2] is distinct from sender::text
     or not exists(select 1 from storage.objects where bucket_id='chat-voice-clips' and name=p_path and owner_id=sender::text) then
  raise exception 'Upload your voice clip before sending it.' using errcode='42501';
 end if;
 select * into sent from public.messages where voice_path=p_path and author_id=sender;
 if found then return sent; end if;
 insert into public.messages(thread_id,author_id,body,voice_path)
 values(p_thread_id,sender,'Voice clip',p_path)
 on conflict (voice_path) where voice_path is not null do nothing returning * into sent;
 if sent.id is null then
  select * into sent from public.messages where voice_path=p_path and author_id=sender;
 end if;
 return sent;
end;
$$;
revoke execute on function public.send_my_voice_clip(uuid,text) from public,anon;
grant execute on function public.send_my_voice_clip(uuid,text) to authenticated;
