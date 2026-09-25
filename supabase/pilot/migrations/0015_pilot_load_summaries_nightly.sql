-- Traffic lights computed on the server every night (piece 9, 2026-09-25).
--
-- Coach roles that may only see the traffic light read `load_summaries`.
-- Until now only the athlete's own app wrote that row (after a change, and
-- once a day when opened), so an athlete who did not open the app left the
-- coach with an old value although the EWMA moves every day. Now the server
-- recomputes every athlete of a team with load at night.
--
-- The formula is exactly the one in src/shared/data/loadCalculations.ts:
-- daily loads from the first entry to today (days without load = 0), EWMA
-- with λ = 2/(N+1) for N = 7 and 28, started from the mean of the first 7 and
-- 28 days, ratio from day 8 on (index ≥ 7) when chronic > 0, rounded like
-- Math.round(x·100)/100, "chronic full" from day 28 (index ≥ 27).

create or replace function app.load_summary(p_person uuid, p_today date)
returns table (acwr double precision, chronic_full boolean)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_first date;
  v_loads double precision[];
  v_n integer;
  v_acute double precision;
  v_chronic double precision;
  v_la constant double precision := 2.0 / (7 + 1);
  v_lc constant double precision := 2.0 / (28 + 1);
  v_ratio double precision;
begin
  select min(e.date) into v_first from public.load_entries e where e.person_id = p_person and e.date <= p_today;
  if v_first is null then
    return query select null::double precision, false;
    return;
  end if;

  select array_agg(coalesce(l.total, 0)::double precision order by d.day)
  into v_loads
  from generate_series(v_first, p_today, interval '1 day') as d (day)
  left join (
    select e.date, sum(e.load) as total from public.load_entries e where e.person_id = p_person group by e.date
  ) l on l.date = d.day::date;
  v_n := array_length(v_loads, 1);

  select avg(x) into v_acute from unnest(v_loads[1:least(7, v_n)]) as x;
  select avg(x) into v_chronic from unnest(v_loads[1:least(28, v_n)]) as x;
  for i in 1..v_n loop
    v_acute := v_la * v_loads[i] + (1 - v_la) * v_acute;
    v_chronic := v_lc * v_loads[i] + (1 - v_lc) * v_chronic;
  end loop;

  v_ratio := case when v_n - 1 >= 7 and v_chronic > 0 then floor(v_acute / v_chronic * 100 + 0.5) / 100 end;
  return query select v_ratio, v_n - 1 >= 27;
end $$;

-- Every athlete of a team with load; rows of athletes without load stay as
-- they are (nobody reads them while load is off).
create or replace function app.refresh_load_summaries(p_today date default (now() at time zone 'Europe/Berlin')::date)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
begin
  insert into public.load_summaries (person_id, acwr, chronic_full, updated_at)
  select p.id, s.acwr, s.chronic_full, now()
  from public.people p
  cross join lateral app.load_summary(p.id, p_today) s
  where app.person_has_load(p.id)
    and exists (select 1 from public.load_entries e where e.person_id = p.id)
  on conflict (person_id) do update
    set acwr = excluded.acwr, chronic_full = excluded.chronic_full, updated_at = excluded.updated_at;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke all on function app.load_summary(uuid, date), app.refresh_load_summaries(date) from public, anon, authenticated;

-- 00:15 UTC, after midnight in Germany.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('club-os-load-summaries', '15 0 * * *', 'select app.refresh_load_summaries()');
  end if;
end $$;
