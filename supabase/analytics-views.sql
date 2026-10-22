-- Run after supabase/event-logging.sql.
-- These views are server/admin analysis surfaces only. Browser client roles receive no privileges.

create or replace view public.events_external
with (security_invoker = true)
as
select e.*
from public.events e
join public.users u using (anonymous_id)
where coalesce(u.is_internal, false) = false
  and not (e.properties @> '{"internal": true}'::jsonb);

create or replace view public.user_timeline
with (security_invoker = true)
as
select anonymous_id, created_at, event_name, session_id, properties
from public.events_external;

revoke all on table public.events_external from public, anon, authenticated;
revoke all on table public.user_timeline from public, anon, authenticated;
grant select on table public.events_external, public.user_timeline to service_role;

-- Fail the migration if either browser-facing role can select these analysis views.
do $$
begin
  if has_table_privilege('anon', 'public.events_external', 'select')
    or has_table_privilege('authenticated', 'public.events_external', 'select')
    or has_table_privilege('anon', 'public.user_timeline', 'select')
    or has_table_privilege('authenticated', 'public.user_timeline', 'select') then
    raise exception 'Analytics views must not be readable by client roles';
  end if;
end
$$;
