-- Run once in Supabase SQL Editor before deploying the /play feedback form.
create type public.play_feedback_reason as enum ('different_lean', 'unrepresentative_excerpt', 'other');

create table public.play_feedback (
  id uuid primary key default gen_random_uuid(),
  round integer not null check (round between 1 and 10000),
  excerpt_index integer not null check (excerpt_index between 0 and 2),
  outlet_slug text not null check (char_length(outlet_slug) between 1 and 100),
  current_lean text not null check (current_lean in ('left', 'center', 'right')),
  suggested_lean text check (suggested_lean is null or suggested_lean in ('left', 'center', 'right')),
  reason public.play_feedback_reason not null,
  note text check (note is null or char_length(note) <= 280),
  device_id uuid not null references public.users(anonymous_id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint play_feedback_reason_shape check ((reason = 'different_lean' and suggested_lean is not null and suggested_lean <> current_lean) or (reason <> 'different_lean' and suggested_lean is null)),
  constraint play_feedback_one_per_excerpt unique (device_id, round, excerpt_index)
);
create index play_feedback_device_recent_idx on public.play_feedback (device_id, created_at desc);

-- Serialize submissions per device so simultaneous requests cannot bypass the limit.
create function public.limit_play_feedback() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.device_id::text, 0));
  if (select count(*) from public.play_feedback
      where device_id = new.device_id and created_at >= now() - interval '1 hour') >= 12 then
    raise exception 'Feedback rate limit reached' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger play_feedback_rate_limit before insert on public.play_feedback
for each row execute function public.limit_play_feedback();
revoke all on function public.limit_play_feedback() from public, anon, authenticated;

alter table public.play_feedback enable row level security;
revoke all on table public.play_feedback from public, anon, authenticated;
grant select, insert on table public.play_feedback to service_role;

-- Aggregate only. The private note and device_id are never in this view.
create view public.play_feedback_summary with (security_invoker = true) as
select round, outlet_slug, current_lean, reason, suggested_lean, count(*)::integer as submissions
from public.play_feedback
group by round, outlet_slug, current_lean, reason, suggested_lean;
revoke all on table public.play_feedback_summary from public, anon, authenticated;
grant select on table public.play_feedback_summary to service_role;

do $$
begin
  if not (select relrowsecurity from pg_class where oid = 'public.play_feedback'::regclass)
     or exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'play_feedback')
     or has_table_privilege('anon', 'public.play_feedback', 'SELECT')
     or has_table_privilege('anon', 'public.play_feedback', 'INSERT')
     or has_table_privilege('authenticated', 'public.play_feedback', 'SELECT')
     or has_table_privilege('authenticated', 'public.play_feedback', 'INSERT')
     or has_table_privilege('anon', 'public.play_feedback_summary', 'SELECT')
     or has_table_privilege('authenticated', 'public.play_feedback_summary', 'SELECT') then
    raise exception 'Play feedback must remain server-only';
  end if;
end
$$;
