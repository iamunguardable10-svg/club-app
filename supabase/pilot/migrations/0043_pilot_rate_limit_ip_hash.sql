-- Rate limits (0042) follow-up: never keep a plain IP address. The caller key
-- for anonymous calls is a hash of the client IP, with the header it came
-- from, so the rows say "same caller again" without saying who (2026-10-14).

create or replace function app.rate_caller() returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  v_headers json := nullif(current_setting('request.headers', true), '')::json;
  v_source text;
  v_ip text;
begin
  if auth.uid() is not null then
    return 'user:' || auth.uid()::text;
  end if;
  if v_headers is null then
    return null;
  end if;
  if nullif(v_headers ->> 'cf-connecting-ip', '') is not null then
    v_source := 'cf'; v_ip := v_headers ->> 'cf-connecting-ip';
  elsif nullif(v_headers ->> 'x-real-ip', '') is not null then
    v_source := 'real'; v_ip := v_headers ->> 'x-real-ip';
  elsif nullif(btrim(split_part(v_headers ->> 'x-forwarded-for', ',', 1)), '') is not null then
    v_source := 'xff'; v_ip := btrim(split_part(v_headers ->> 'x-forwarded-for', ',', 1));
  else
    return 'ip:unknown';
  end if;
  return 'ip:' || v_source || ':' || left(encode(sha256(convert_to(v_ip, 'UTF8')), 'hex'), 32);
end $$;

revoke all on function app.rate_caller() from public, anon, authenticated;

-- Rows from 0042 hold plain addresses; start them over with hashed keys.
update app.rate_windows set caller = 'legacy:' || left(encode(sha256(convert_to(caller, 'UTF8')), 'hex'), 32)
where caller like 'ip:%' and caller !~ '^ip:(cf|real|xff):';
