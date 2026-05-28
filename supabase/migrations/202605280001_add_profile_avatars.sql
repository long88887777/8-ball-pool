alter table public.profiles
  add column if not exists avatar_kind text not null default 'default',
  add column if not exists avatar_id text,
  add column if not exists avatar_url text;

alter table public.profiles
  drop constraint if exists profiles_avatar_kind_check;

alter table public.profiles
  add constraint profiles_avatar_kind_check
  check (avatar_kind in ('default', 'uploaded'));

update public.profiles
set avatar_kind = 'default',
    avatar_id = coalesce(avatar_id, 'default-01')
where avatar_kind = 'default'
  and avatar_id is null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-avatars',
  'profile-avatars',
  true,
  1048576,
  array['image/png', 'image/webp', 'image/jpeg']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users can upload own profile avatars" on storage.objects;
create policy "Users can upload own profile avatars"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'profile-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can update own profile avatars" on storage.objects;
create policy "Users can update own profile avatars"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'profile-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'profile-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Anyone can read profile avatars" on storage.objects;
create policy "Anyone can read profile avatars"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'profile-avatars');
