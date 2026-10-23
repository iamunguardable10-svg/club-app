-- Profile photos (2026-10-23, docs/goal-2026-10-pilot-ready.md, piece 3).
--
-- Everyone may add a photo of themselves: a small square picture the app
-- makes in the browser (about 256 px). It is shown in the club's own lists
-- (absent and late, players, staff) and nowhere else.
--
-- The picture lives in the private storage bucket `avatars` as
-- `<club>/<person>.jpg`; only people of that club may read it (through a
-- short-lived signed link), and only the person themselves may put, replace
-- or remove it. `people.photo_at` says that there is one and when it
-- changed, so the app knows to show it and to fetch the new one.

alter table public.people add column if not exists photo_at timestamptz;

grant select (photo_at) on public.people to authenticated;
-- `people_update_self` (0002) keeps this to one's own row.
grant update (photo_at) on public.people to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 524288, array['image/jpeg', 'image/webp', 'image/png'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- `<club>/<person>.<ext>` → the club, if the name has that form.
create or replace function app.avatar_club(p_name text) returns uuid
language plpgsql immutable set search_path = '' as $$
declare
  v_parts text[] := string_to_array(p_name, '/');
begin
  if array_length(v_parts, 1) <> 2 or v_parts[1] !~ '^[0-9a-f-]{36}$' then return null; end if;
  return v_parts[1]::uuid;
end $$;

create or replace function app.may_read_avatar(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.avatar_club(p_name) is not null and app.avatar_club(p_name) in (select app.my_club_ids())
$$;

-- Only one's own picture, in one's own club's folder.
create or replace function app.may_write_avatar(p_name text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_parts text[] := string_to_array(p_name, '/');
  v_file text;
begin
  if app.avatar_club(p_name) is null then return false; end if;
  v_file := v_parts[2];
  if v_file !~ '^[0-9a-f-]{36}\.(jpg|webp|png)$' then return false; end if;
  return exists (
    select 1 from public.people p
    where p.id = split_part(v_file, '.', 1)::uuid
      and p.club_id = app.avatar_club(p_name)
      and app.is_me(p.id)
  );
end $$;

grant execute on function app.avatar_club(text), app.may_read_avatar(text), app.may_write_avatar(text) to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'avatars_read') then
    create policy avatars_read on storage.objects for select to authenticated
      using (bucket_id = 'avatars' and (app.may_read_avatar(name) or app.may_write_avatar(name)));
    create policy avatars_add on storage.objects for insert to authenticated
      with check (bucket_id = 'avatars' and app.may_write_avatar(name));
    create policy avatars_change on storage.objects for update to authenticated
      using (bucket_id = 'avatars' and app.may_write_avatar(name))
      with check (bucket_id = 'avatars' and app.may_write_avatar(name));
    create policy avatars_remove on storage.objects for delete to authenticated
      using (bucket_id = 'avatars' and app.may_write_avatar(name));
  end if;
end $$;
