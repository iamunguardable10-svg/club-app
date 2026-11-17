-- Load with short history (2026-11-17): one rule for the app and the nightly
-- summary. Mirrors `loadBasis` and the ratio in
-- src/shared/data/loadCalculations.ts:
-- - only rated entries up to today count (load above 0; filled-in days and
--   future entries make no history);
-- - stage: regular from 30 days of history and 8 rated days in the last 28,
--   provisional from 14 days and 4 rated days, otherwise building;
-- - the ratio from day 14 on (index >= 13) and only with a chronic load of at
--   least 1 AU a day; no ratio while building;
-- - chronic_full stays (older app versions read it) and means "regular".
-- Additive: one nullable column (null = written before the stage existed,
-- the app falls back to chronic_full), one new function, the nightly refresh
-- replaced with the same signature, existing rows recomputed once.

alter table public.load_summaries add column if not exists basis text
  check (basis in ('building', 'provisional', 'regular'));

create or replace function app.load_basis_summary(p_person uuid, p_today date)
returns table (acwr double precision, chronic_full boolean, basis text)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_first date;
  v_loads double precision[];
  v_n integer;
  v_rated integer;
  v_basis text;
  v_acute double precision;
  v_chronic double precision;
  v_la constant double precision := 2.0 / (7 + 1);
  v_lc constant double precision := 2.0 / (28 + 1);
  v_ratio double precision;
begin
  -- `< 'Infinity'` also leaves out NaN (it sorts above every number).
  select min(e.date) into v_first from public.load_entries e
    where e.person_id = p_person and e.date <= p_today and e.load > 0 and e.load < 'Infinity'::numeric;
  if v_first is null then
    return query select null::double precision, false, 'building'::text;
    return;
  end if;

  select count(distinct e.date) into v_rated from public.load_entries e
    where e.person_id = p_person and e.date <= p_today and e.date > p_today - 28 and e.load > 0 and e.load < 'Infinity'::numeric;
  v_n := p_today - v_first + 1;
  v_basis := case when v_n >= 30 and v_rated >= 8 then 'regular'
                  when v_n >= 14 and v_rated >= 4 then 'provisional'
                  else 'building' end;
  if v_basis = 'building' then
    return query select null::double precision, false, v_basis;
    return;
  end if;

  select array_agg(coalesce(l.total, 0)::double precision order by d.day)
  into v_loads
  from generate_series(v_first, p_today, interval '1 day') as d (day)
  left join (
    select e.date, sum(e.load) as total from public.load_entries e
    where e.person_id = p_person and e.load > 0 and e.load < 'Infinity'::numeric group by e.date
  ) l on l.date = d.day::date;

  select avg(x) into v_acute from unnest(v_loads[1:least(7, v_n)]) as x;
  select avg(x) into v_chronic from unnest(v_loads[1:least(28, v_n)]) as x;
  for i in 1..v_n loop
    v_acute := v_la * v_loads[i] + (1 - v_la) * v_acute;
    v_chronic := v_lc * v_loads[i] + (1 - v_lc) * v_chronic;
  end loop;

  v_ratio := case when v_n - 1 >= 13 and v_chronic >= 1 then floor(v_acute / v_chronic * 100 + 0.5) / 100 end;
  return query select v_ratio, v_basis = 'regular', v_basis;
end $$;

create or replace function app.refresh_load_summaries(p_today date default (now() at time zone 'Europe/Berlin')::date)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
begin
  insert into public.load_summaries (person_id, acwr, chronic_full, basis, updated_at)
  select p.id, s.acwr, s.chronic_full, s.basis, now()
  from public.people p
  cross join lateral app.load_basis_summary(p.id, p_today) s
  where app.person_has_load(p.id) and app.health_active(p.id)
    and exists (select 1 from public.load_entries e where e.person_id = p.id)
  on conflict (person_id) do update
    set acwr = excluded.acwr, chronic_full = excluded.chronic_full, basis = excluded.basis, updated_at = excluded.updated_at;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke all on function app.load_basis_summary(uuid, date), app.refresh_load_summaries(date) from public, anon, authenticated;

-- Recompute the stored lights once with the new rule (the nightly job would at 00:15).
select app.refresh_load_summaries();
