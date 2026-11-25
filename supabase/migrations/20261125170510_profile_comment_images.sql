alter table public.profile_comments
  add column has_image boolean not null default false,
  drop constraint profile_comments_body_check,
  add constraint profile_comments_body_check
    check (char_length(body) <= 1000 and (char_length(body) >= 1 or has_image));

alter table public.community_profile_comments
  add column has_image boolean not null default false,
  drop constraint community_profile_comments_body_check,
  add constraint community_profile_comments_body_check
    check (char_length(btrim(body)) <= 1000 and (char_length(btrim(body)) >= 1 or has_image));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-comment-media', 'profile-comment-media', false, 10485760,
        array['image/jpeg','image/png','image/webp','image/gif']);

create policy "Members upload their own comment images"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'profile-comment-media'
  and (storage.foldername(name))[1] in ('profile', 'community-profile')
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and cardinality(storage.foldername(name)) = 2
  and storage.filename(name) ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
);

create policy "Members read accessible comment images"
on storage.objects for select to authenticated
using (
  bucket_id = 'profile-comment-media' and (
    (storage.foldername(name))[2] = (select auth.uid())::text
    or (
      case when storage.filename(name) ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then
        case (storage.foldername(name))[1]
          when 'profile' then exists (
            select 1 from public.profile_comments c
            where c.id = storage.filename(objects.name)::uuid and c.has_image
              and objects.name = 'profile/' || c.author_id || '/' || c.id
          )
          when 'community-profile' then exists (
            select 1 from public.community_profile_comments c
            where c.id = storage.filename(objects.name)::uuid and c.has_image
              and objects.name = 'community-profile/' || c.author_id || '/' || c.id
          )
          else false
        end
      else false end
    )
  )
);

create policy "Authors remove their own comment images"
on storage.objects for delete to authenticated
using (
  bucket_id = 'profile-comment-media'
  and (storage.foldername(name))[2] = (select auth.uid())::text
);
