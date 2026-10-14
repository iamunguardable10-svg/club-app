-- Rate limits (0042) follow-up: room for shared addresses (2026-10-15).
--
-- Before signing in, callers are counted per IP. A whole team often joins at
-- once from the same gym Wi-Fi, and mobile networks put many phones behind
-- one address (carrier NAT). 30 previews per 10 minutes could stop the 12th
-- player of a team evening. The guessing protection does not depend on
-- these numbers (codes and links are far too long to try out), so the
-- per-IP budgets are raised to what a crowded club evening needs. Signed-in
-- callers keep their own, per-account count in the same buckets.

create or replace function public.join_code_preview(p_code text)
returns table (club_name text, team_name text, usable boolean)
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform app.rate_check('join_code_preview', 300, 600);
  return query select * from app.join_code_preview_unlimited(p_code);
end $$;

create or replace function public.founding_code_usable(p_code text) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform app.rate_check('founding_code', 30, 3600);
  return app.founding_code_usable_unlimited(p_code);
end $$;

create or replace function public.invite_preview(p_token uuid)
returns table (kind text, club_name text, team_name text, first_name text, last_name text, role_name text, usable boolean)
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform app.rate_check('invite_preview', 120, 600);
  return query select * from app.invite_preview_unlimited(p_token);
end $$;

create or replace function public.parent_consent_preview(p_token text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform app.rate_check('parent_consent', 60, 3600);
  return app.parent_consent_preview_unlimited(p_token);
end $$;

create or replace function public.confirm_parent_consent(p_token text, p_name text, p_email text, p_guardian boolean, p_version text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform app.rate_check('parent_consent', 60, 3600);
  return app.confirm_parent_consent_unlimited(p_token, p_name, p_email, p_guardian, p_version);
end $$;

create or replace function public.withdraw_parent_consent(p_token text) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform app.rate_check('parent_consent', 60, 3600);
  return app.withdraw_parent_consent_unlimited(p_token);
end $$;
