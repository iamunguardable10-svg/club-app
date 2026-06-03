-- Normalize legacy coach-calendar session type values to canonical sessions.session_type values.
-- Current schema allows s_and_c / other; athlete-load types use strength / individual separately.

update public.sessions
set session_type = 's_and_c'
where session_type = 'strength';

update public.sessions
set session_type = 'other'
where session_type = 'individual';
