-- Read-only live-project audit. Run in Supabase SQL Editor and inspect both result sets.
select
  c.relname as object_name,
  case c.relkind when 'r' then 'table' when 'v' then 'view' else c.relkind::text end as object_type,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'users', 'comments', 'comment_reports', 'game_attempts', 'game_rounds',
    'source_link_clicks', 'badges', 'events', 'app_config', 'push_subscriptions', 'reminders_sent',
    'events_external', 'user_timeline', 'reminder_events_external'
  )
order by c.relkind, c.relname;

select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
  and table_name in (
    'users', 'comments', 'comment_reports', 'game_attempts', 'game_rounds',
    'source_link_clicks', 'badges', 'events', 'app_config', 'push_subscriptions', 'reminders_sent',
    'events_external', 'user_timeline', 'reminder_events_external'
  )
order by table_name, grantee, privilege_type;

select schemaname, tablename, policyname, roles, cmd
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
-- Fail loudly if the two server-only reminder tables are exposed in any way.
do $$
declare
  checked_role text;
  checked_table text;
  checked_privilege text;
begin
  if not (select relrowsecurity from pg_class where oid = 'public.push_subscriptions'::regclass)
    or not (select relrowsecurity from pg_class where oid = 'public.reminders_sent'::regclass) then
    raise exception 'Reminder tables must have RLS enabled';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename in ('push_subscriptions', 'reminders_sent')
  ) then
    raise exception 'Reminder tables must have no RLS policies';
  end if;
  foreach checked_role in array array['anon', 'authenticated'] loop
    foreach checked_table in array array['public.push_subscriptions', 'public.reminders_sent'] loop
      foreach checked_privilege in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
        if has_table_privilege(checked_role, checked_table, checked_privilege) then
          raise exception '% unexpectedly has % on %', checked_role, checked_privilege, checked_table;
        end if;
      end loop;
    end loop;
  end loop;
end
$$;
