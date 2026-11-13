-- Age 16 for health consent, exactly enough (audit 2026-11, variant b, Ben
-- 2026-11-13). Until now, everyone born in the year that is 16 years ago
-- counted as 16 for the whole year, so a 15-year-old could consent for
-- themselves. Now that year also asks the birth month: 16 counts from the
-- month after the birth month (no day is asked, so the birthday month itself
-- still needs a parent). Without a month, that year counts as under 16.
-- Additive: two new columns, functions replaced with the same signatures,
-- one new overload of record_access_consent and save_my_birth_year.

alter table public.people add column if not exists birth_month smallint check (birth_month between 1 and 12);
alter table app.access_consent add column if not exists birth_month smallint check (birth_month between 1 and 12);

create or replace function app.is_16(p_year integer, p_month integer) returns boolean
language sql stable set search_path = '' as $$
  select p_year is not null and p_year >= 1900 and (
    p_year < extract(year from current_date)::integer - 16
    or (p_year = extract(year from current_date)::integer - 16 and p_month is not null and p_month < extract(month from current_date)::integer))
$$;

create or replace function app.health_active(p_person uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.consents c join public.people p on p.id=c.person_id
    where c.person_id=p_person and c.withdrawn_at is null and c.version='2026-10-08'
      and (c.kind='parent_health' or (c.kind='health' and app.is_16(p.birth_year, p.birth_month))))
$$;

-- Coaches may see the month next to the year (same rule as the year).
create or replace view public.person_birth_years with (security_barrier=true) as
  select p.id as person_id, p.birth_year, p.birth_month from public.people p
  where app.is_me(p.id) or app.coach_sees_athlete(p.id,'viewRoster');

create or replace function public.record_access_consent(p_version text, p_birth_year integer, p_health boolean, p_staff_16 boolean, p_birth_month integer) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Not signed in.' using errcode='insufficient_privilege'; end if;
  if p_version is distinct from '2026-10-08' then raise exception 'Please accept the current terms and privacy policy.' using errcode='check_violation'; end if;
  if not coalesce(p_staff_16,false) and (p_birth_year is null or p_birth_year < 1900 or p_birth_year > extract(year from current_date)::integer) then
    raise exception 'Enter a valid birth year.' using errcode='check_violation';
  end if;
  if p_birth_month is not null and p_birth_month not between 1 and 12 then
    raise exception 'Enter a valid birth month.' using errcode='check_violation';
  end if;
  if coalesce(p_health,false) and not app.is_16(p_birth_year, p_birth_month) then
    raise exception 'A parent must consent for players under 16.' using errcode='check_violation';
  end if;
  if exists(select 1 from public.people where user_id=auth.uid() and birth_year is not null and birth_year is distinct from p_birth_year) and p_birth_year is not null then
    raise exception 'Contact the operator to correct your birth year.' using errcode='check_violation';
  end if;
  if exists(select 1 from public.people where user_id=auth.uid() and birth_month is not null and birth_month is distinct from p_birth_month) and p_birth_month is not null then
    raise exception 'Contact the operator to correct your birth year.' using errcode='check_violation';
  end if;
  if not exists(select 1 from public.consents where user_id=auth.uid() and kind='terms' and version=p_version) then
    insert into public.consents(user_id,kind,version) values(auth.uid(),'terms',p_version);
  end if;
  insert into app.access_consent(user_id,birth_year,birth_month,health,staff_16)
    values(auth.uid(),p_birth_year,p_birth_month,coalesce(p_health,false),coalesce(p_staff_16,false))
    on conflict(user_id) do update set birth_year=coalesce(excluded.birth_year,app.access_consent.birth_year),
      birth_month=coalesce(excluded.birth_month,app.access_consent.birth_month),health=excluded.health,staff_16=excluded.staff_16;
end $$;
-- The old signature (no month) stays for older app versions; it means "no month".
create or replace function public.record_access_consent(p_version text, p_birth_year integer default null, p_health boolean default false, p_staff_16 boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.record_access_consent(p_version, p_birth_year, p_health, p_staff_16, null::integer);
end $$;

create or replace function app.signup_consent() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_birth integer; v_month integer;
begin
  if new.raw_user_meta_data->>'legal_version' = '2026-10-08' then
    v_birth := (new.raw_user_meta_data->>'birth_year')::integer;
    v_month := (new.raw_user_meta_data->>'birth_month')::integer;
    if v_birth is not null and (v_birth<1900 or v_birth>extract(year from current_date)::integer) then
      raise exception 'Enter a valid birth year.' using errcode='check_violation';
    end if;
    if v_month is not null and v_month not between 1 and 12 then v_month := null; end if;
    insert into public.consents(user_id,kind,version) values(new.id,'terms','2026-10-08');
    insert into app.access_consent(user_id,birth_year,birth_month,health,staff_16) values(new.id,v_birth,v_month,
      coalesce((new.raw_user_meta_data->>'health_consent')::boolean,false) and app.is_16(v_birth, v_month),
      coalesce((new.raw_user_meta_data->>'staff_16')::boolean,false));
  end if;
  return new;
end $$;

create or replace function app.apply_player_consent(p_person uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v app.access_consent;
begin
  select * into v from app.access_consent where user_id=auth.uid();
  update public.people set birth_year=coalesce(birth_year,v.birth_year), birth_month=coalesce(birth_month,v.birth_month)
    where id=p_person and user_id=auth.uid();
  if v.health and not app.health_active(p_person) then
    insert into public.consents(person_id,kind,version) values(p_person,'health','2026-10-08');
  end if;
end $$;

create or replace function public.give_health_consent(p_person uuid, p_version text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_year integer; v_month integer;
begin
  if not app.is_me(p_person) then raise exception 'You can only change your own consent.' using errcode='insufficient_privilege'; end if;
  select birth_year, birth_month into v_year, v_month from public.people where id=p_person for update;
  if not app.is_16(v_year, v_month) then
    raise exception 'A parent must consent for players under 16.' using errcode='check_violation'; end if;
  if p_version is distinct from '2026-10-08' then raise exception 'Please accept the current terms and privacy policy.' using errcode='check_violation'; end if;
  if not app.health_active(p_person) then insert into public.consents(person_id,kind,version) values(p_person,'health',p_version); end if;
end $$;

-- Renamed into app by 0042 (the public one adds the rate limit).
create or replace function app.create_parent_consent_token_unlimited(p_person uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v_token text; v_year integer; v_month integer;
begin
  if not app.is_me(p_person) then raise exception 'You can only change your own consent.' using errcode='insufficient_privilege'; end if;
  select birth_year, birth_month into v_year, v_month from public.people where id=p_person for update;
  if v_year is null or app.is_16(v_year, v_month) then
    raise exception 'Parental consent links are for players under 16.' using errcode='check_violation'; end if;
  update app.parent_tokens set used_at=now() where person_id=p_person and used_at is null;
  v_token := encode(extensions.gen_random_bytes(32),'hex');
  insert into app.parent_tokens(token_hash,person_id) values(sha256(convert_to(v_token,'UTF8')),p_person);
  return v_token;
end $$;

create or replace function public.save_my_birth_year(p_person uuid, p_year integer, p_month integer) returns void
language plpgsql security definer set search_path = '' as $$
declare v_year integer; v_month integer;
begin
  if not app.is_me(p_person) then raise exception 'You can only change your own consent.' using errcode='insufficient_privilege'; end if;
  select birth_year, birth_month into v_year, v_month from public.people where id=p_person for update;
  if p_year is null or p_year<1900 or p_year>extract(year from current_date)::integer then raise exception 'Enter a valid birth year.' using errcode='check_violation'; end if;
  if p_month is not null and p_month not between 1 and 12 then raise exception 'Enter a valid birth month.' using errcode='check_violation'; end if;
  if v_year is not null and v_year<>p_year then raise exception 'Contact the operator to correct your birth year.' using errcode='check_violation'; end if;
  if v_month is not null and p_month is not null and v_month<>p_month then raise exception 'Contact the operator to correct your birth year.' using errcode='check_violation'; end if;
  update public.people set birth_year=p_year, birth_month=coalesce(birth_month,p_month) where id=p_person;
end $$;

revoke all on function app.is_16(integer,integer),
  public.record_access_consent(text,integer,boolean,boolean,integer),
  public.save_my_birth_year(uuid,integer,integer) from public, anon, authenticated;
grant execute on function public.record_access_consent(text,integer,boolean,boolean,integer),
  public.save_my_birth_year(uuid,integer,integer) to authenticated;
revoke all on public.person_birth_years from public, anon, authenticated;
grant select on public.person_birth_years to authenticated;
