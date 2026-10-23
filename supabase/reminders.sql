-- Daily-drop web push storage. Run once in the Supabase SQL editor.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  anonymous_id uuid not null references public.users(anonymous_id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  last_success_at timestamptz,
  last_failure_at timestamptz,
  failure_count integer not null default 0 check (failure_count >= 0)
);
create index if not exists push_subscriptions_user_created_idx
  on public.push_subscriptions (anonymous_id, created_at desc);

create table if not exists public.reminders_sent (
  anonymous_id uuid not null references public.users(anonymous_id) on delete cascade,
  local_date date not null,
  content_day text not null,
  sent_at timestamptz not null default now(),
  result text not null check (result in ('pending', 'sent', 'expired', 'failed')),
  primary key (anonymous_id, local_date)
);
create index if not exists reminders_sent_day_idx on public.reminders_sent (local_date, sent_at);

alter table public.push_subscriptions enable row level security;
alter table public.reminders_sent enable row level security;
revoke all on table public.push_subscriptions from public, anon, authenticated;
revoke all on table public.reminders_sent from public, anon, authenticated;
grant select, insert, update, delete on table public.push_subscriptions to service_role;
grant select, insert, update, delete on table public.reminders_sent to service_role;

comment on table public.push_subscriptions is 'Server-only Web Push endpoints. Browser roles have no access.';
comment on table public.reminders_sent is 'Database-enforced one-reminder-per-user-per-Eastern-local-date ledger.';

do $
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
    raise exception 'Reminder tables must not have client RLS policies';
  end if;

  foreach checked_role in array array['anon', 'authenticated'] loop
    foreach checked_table in array array['public.push_subscriptions', 'public.reminders_sent'] loop
      foreach checked_privilege in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
        if has_table_privilege(checked_role, checked_table, checked_privilege) then
          raise exception '% must not have % on %', checked_role, checked_privilege, checked_table;
        end if;
      end loop;
    end loop;
  end loop;
end
$;

create or replace function public.eligible_reminder_subscriptions(
  target_content_day text,
  target_anonymous_id uuid default null
)
returns table (
  id uuid,
  anonymous_id uuid,
  endpoint text,
  p256dh text,
  auth text,
  created_at timestamptz,
  failure_count integer
)
language sql
security definer
set search_path = public
as $$
  with latest_reads as (
    select distinct on (e.anonymous_id)
      e.anonymous_id,
      e.properties->>'content_day' as content_day
    from public.events e
    where e.event_name = 'story_completed'
    order by e.anonymous_id, e.created_at desc
  ), latest_subscriptions as (
    select distinct on (ps.anonymous_id)
      ps.id, ps.anonymous_id, ps.endpoint, ps.p256dh, ps.auth, ps.created_at, ps.failure_count
    from public.push_subscriptions ps
    where target_anonymous_id is null or ps.anonymous_id = target_anonymous_id
    order by ps.anonymous_id, ps.created_at desc
  )
  select ls.id, ls.anonymous_id, ls.endpoint, ls.p256dh, ls.auth, ls.created_at, ls.failure_count
  from latest_subscriptions ls
  join public.users u on u.anonymous_id = ls.anonymous_id
  join latest_reads lr on lr.anonymous_id = ls.anonymous_id
  where u.total_stories_read > 0
    and lr.content_day ~ '^day[0-9]+$'
    and target_content_day ~ '^day[0-9]+$'
    and substring(lr.content_day from 4)::integer < substring(target_content_day from 4)::integer;
$$;
revoke all on function public.eligible_reminder_subscriptions(text, uuid) from public, anon, authenticated;
grant execute on function public.eligible_reminder_subscriptions(text, uuid) to service_role;
