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
    'source_link_clicks', 'badges', 'events', 'app_config',
    'events_external', 'user_timeline'
  )
order by c.relkind, c.relname;

select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
  and table_name in (
    'users', 'comments', 'comment_reports', 'game_attempts', 'game_rounds',
    'source_link_clicks', 'badges', 'events', 'app_config',
    'events_external', 'user_timeline'
  )
order by table_name, grantee, privilege_type;

select schemaname, tablename, policyname, roles, cmd
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
