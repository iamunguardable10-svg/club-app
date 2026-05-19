drop policy if exists "sessions_delete_allowed" on public.sessions;

create policy "sessions_delete_allowed"
on public.sessions for delete
to authenticated
using (public.can_manage_session(id));
