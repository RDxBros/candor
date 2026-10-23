create extension if not exists pgcrypto;

create table if not exists public.users (
  anonymous_id uuid primary key,
  streak_count integer not null default 0 check (streak_count >= 0),
  last_read_date date,
  total_stories_read integer not null default 0 check (total_stories_read >= 0),
  game_correct_count integer not null default 0 check (game_correct_count >= 0),
  game_total_count integer not null default 0 check (game_total_count >= 0),
  freezes_available integer not null default 0 check (freezes_available >= 0),
  freezes_used_total integer not null default 0 check (freezes_used_total >= 0),
  freezes_granted_total integer not null default 0 check (freezes_granted_total >= 0),
  is_internal boolean default false,
  created_at timestamptz not null default now(),
  check (game_correct_count <= game_total_count)
);

comment on column public.users.game_correct_count is 'Spot the Lean scored answers correct. Do not use for other game types.';
comment on column public.users.game_total_count is 'Spot the Lean scored answers attempted. Do not use for other game types.';
-- Later cleanup: rename these two columns to lean_guess_correct_count and
-- lean_guess_total_count once a coordinated API/client migration is worthwhile.

alter table public.users add column if not exists freezes_available integer not null default 0;
alter table public.users add column if not exists freezes_used_total integer not null default 0;
alter table public.users add column if not exists freezes_granted_total integer not null default 0;
alter table public.users add column if not exists is_internal boolean default false;

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  story_id text not null,
  anonymous_id uuid not null references public.users(anonymous_id) on delete cascade,
  display_text varchar(500) not null check (char_length(trim(display_text)) between 1 and 500),
  created_at timestamptz not null default now(),
  flag_count integer not null default 0 check (flag_count >= 0)
);

create table if not exists public.comment_reports (
  comment_id uuid not null references public.comments(id) on delete cascade,
  anonymous_id uuid not null references public.users(anonymous_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, anonymous_id)
);

create table if not exists public.game_rounds (
  id uuid primary key default gen_random_uuid(),
  anonymous_id uuid not null references public.users(anonymous_id) on delete cascade,
  game_type text not null default 'lean_guess',
  mode text not null default 'scored' check (mode in ('scored', 'practice')),
  card_pairs jsonb not null check (jsonb_typeof(card_pairs) = 'array'),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.game_attempts (
  id uuid primary key default gen_random_uuid(),
  anonymous_id uuid not null references public.users(anonymous_id) on delete cascade,
  story_id text,
  source_id uuid,
  source_key text,
  content_id text,
  content_round_id text,
  round_id uuid references public.game_rounds(id) on delete set null,
  practice_round_id uuid,
  card_position integer not null check (card_position between 1 and 6),
  mode text not null default 'scored' check (mode in ('scored', 'practice')),
  game_type text not null,
  difficulty text,
  guessed_lean text check (guessed_lean in ('left', 'center', 'right')),
  correct_lean text check (correct_lean in ('left', 'center', 'right')),
  placement text check (placement in ('fact', 'opinion')),
  correct_answer text check (correct_answer in ('fact', 'opinion')),
  is_correct boolean not null,
  input_method text check (input_method is null or input_method in ('swipe', 'tap', 'drag', 'keyboard')),
  response_ms integer check (response_ms is null or response_ms between 0 and 300000),
  created_at timestamptz not null default now()
);

alter table public.game_attempts add column if not exists practice_round_id uuid;
alter table public.game_attempts add column if not exists content_id text;
alter table public.game_attempts add column if not exists content_round_id text;
alter table public.game_attempts add column if not exists placement text;
alter table public.game_attempts add column if not exists correct_answer text;
alter table public.game_attempts drop constraint if exists game_attempts_practice_round_check;
alter table public.game_attempts add constraint game_attempts_practice_round_check check (
  (mode = 'scored' and practice_round_id is null) or
  (mode = 'practice' and practice_round_id is not null)
);

create unique index if not exists game_attempts_scored_source_unique
  on public.game_attempts (anonymous_id, game_type, story_id, source_id)
  where mode = 'scored' and source_id is not null;
create unique index if not exists game_attempts_scored_content_unique
  on public.game_attempts (anonymous_id, game_type, content_id)
  where mode = 'scored' and content_id is not null;
create index if not exists game_attempts_practice_round_idx
  on public.game_attempts (anonymous_id, practice_round_id, created_at)
  where mode = 'practice';

create table if not exists public.source_link_clicks (
  anonymous_id uuid not null references public.users(anonymous_id) on delete cascade,
  story_id text not null,
  source_id uuid not null,
  lean text not null check (lean in ('left', 'center', 'right')),
  clicked_at timestamptz not null default now(),
  primary key (anonymous_id, story_id, source_id)
);

create table if not exists public.badges (
  anonymous_id uuid not null references public.users(anonymous_id) on delete cascade,
  badge_id text not null check (badge_id in ('explorer', 'sharp_eye')),
  earned_at timestamptz not null default now(),
  primary key (anonymous_id, badge_id)
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  anonymous_id uuid not null references public.users(anonymous_id) on delete cascade,
  event_name text not null,
  properties jsonb not null default '{}'::jsonb check (jsonb_typeof(properties) = 'object'),
  client_local_date date,
  session_id text,
  created_at timestamptz not null default now()
);
create index if not exists events_user_created_idx on public.events (anonymous_id, created_at);
create index if not exists events_name_created_idx on public.events (event_name, created_at);

create index if not exists comments_story_created_idx
  on public.comments (story_id, created_at desc);
create index if not exists game_attempts_user_story_idx
  on public.game_attempts (anonymous_id, story_id, created_at);

alter table public.users enable row level security;
alter table public.comments enable row level security;
alter table public.comment_reports enable row level security;
alter table public.game_attempts enable row level security;
alter table public.game_rounds enable row level security;
alter table public.source_link_clicks enable row level security;
alter table public.badges enable row level security;
alter table public.events enable row level security;

-- The app's server-side service role bypasses RLS. No browser-facing policies are
-- created because privileged credentials never leave the Next.js server.
revoke all on table public.users from anon, authenticated;
revoke all on table public.comments from anon, authenticated;
revoke all on table public.comment_reports from anon, authenticated;
revoke all on table public.game_attempts from anon, authenticated;
revoke all on table public.game_rounds from anon, authenticated;
revoke all on table public.source_link_clicks from anon, authenticated;
revoke all on table public.badges from anon, authenticated;
revoke all on table public.events from anon, authenticated;
grant usage on schema public to service_role;
grant select, insert, update on table public.users to service_role;
grant select, insert, update on table public.comments to service_role;
grant select, insert on table public.comment_reports to service_role;
grant select, insert on table public.game_attempts to service_role;
grant select, insert, update on table public.game_rounds to service_role;
grant select, insert on table public.source_link_clicks to service_role;
grant select, insert on table public.badges to service_role;
grant select, insert on table public.events to service_role;

create or replace function public.flag_comment(target_id uuid)
returns integer
language sql
security definer
set search_path = public
as $$
  update public.comments
  set flag_count = flag_count + 1
  where id = target_id
  returning flag_count;
$$;

revoke all on function public.flag_comment(uuid) from public;
grant execute on function public.flag_comment(uuid) to service_role;

create or replace function public.consume_streak_freeze(target_id uuid)
returns table (freezes_available integer, freezes_used_total integer)
language sql
security definer
set search_path = public
as $$
  update public.users
  set
    freezes_available = freezes_available - 1,
    freezes_used_total = freezes_used_total + 1
  where anonymous_id = target_id and freezes_available > 0
  returning users.freezes_available, users.freezes_used_total;
$$;

revoke all on function public.consume_streak_freeze(uuid) from public;
grant execute on function public.consume_streak_freeze(uuid) to service_role;

create or replace function public.report_comment_once(target_comment_id uuid, target_anonymous_id uuid)
returns table (flag_count integer, already_reported boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer;
begin
  insert into public.comment_reports (comment_id, anonymous_id)
  values (target_comment_id, target_anonymous_id)
  on conflict do nothing;

  get diagnostics inserted_count = row_count;
  if inserted_count = 0 then
    return query
      select comments.flag_count, true
      from public.comments
      where comments.id = target_comment_id;
    return;
  end if;

  return query
    update public.comments
    set flag_count = comments.flag_count + 1
    where comments.id = target_comment_id
    returning comments.flag_count, false;
end;
$$;

revoke all on function public.report_comment_once(uuid, uuid) from public;
grant execute on function public.report_comment_once(uuid, uuid) to service_role;

create or replace function public.record_game_attempt(
  target_anonymous_id uuid,
  target_story_id text,
  target_source_key text,
  target_game_type text,
  target_difficulty text,
  target_guessed_lean text,
  target_correct_lean text,
  target_input_method text default null,
  target_response_ms integer default null
)
returns table (
  id uuid,
  story_id text,
  source_key text,
  game_type text,
  difficulty text,
  guessed_lean text,
  correct_lean text,
  is_correct boolean,
  created_at timestamptz,
  was_created boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  attempt public.game_attempts%rowtype;
begin
  insert into public.game_attempts (
    anonymous_id, story_id, source_key, game_type, difficulty, guessed_lean, correct_lean, is_correct
  ) values (
    target_anonymous_id,
    target_story_id,
    target_source_key,
    target_game_type,
    target_difficulty,
    target_guessed_lean,
    target_correct_lean,
    target_guessed_lean = target_correct_lean
  )
  -- The function's RETURNS TABLE fields are also PL/pgSQL variables. Omitting
  -- the conflict target avoids ambiguous references such as story_id while the
  -- table's unique constraint still prevents duplicate attempts.
  on conflict do nothing
  returning game_attempts.* into attempt;

  if attempt.id is null then
      select ga.* into attempt
      from public.game_attempts as ga
      where ga.anonymous_id = target_anonymous_id
        and ga.story_id = target_story_id
        and ga.source_key = target_source_key
        and ga.game_type = target_game_type;

    return query select attempt.id, attempt.story_id, attempt.source_key, attempt.game_type,
      attempt.difficulty, attempt.guessed_lean, attempt.correct_lean, attempt.is_correct,
      attempt.created_at, false;
    return;
  end if;

  update public.users
  set
    game_total_count = game_total_count + 1,
    game_correct_count = game_correct_count + case when attempt.is_correct then 1 else 0 end
  where users.anonymous_id = target_anonymous_id;

  return query select attempt.id, attempt.story_id, attempt.source_key, attempt.game_type,
    attempt.difficulty, attempt.guessed_lean, attempt.correct_lean, attempt.is_correct,
    attempt.created_at, true;
end;
$$;

revoke all on function public.record_game_attempt(uuid, text, text, text, text, text, text) from public;
grant execute on function public.record_game_attempt(uuid, text, text, text, text, text, text) to service_role;

-- The v1 function predates source IDs and practice isolation. The app uses v2
-- for scored attempts and a direct, stat-free insert for practice attempts.
drop function if exists public.record_game_attempt(uuid, text, text, text, text, text, text);

create or replace function public.record_game_attempt_v2(
  target_anonymous_id uuid,
  target_story_id text,
  target_source_id uuid,
  target_source_key text,
  target_round_id uuid,
  target_card_position integer,
  target_mode text,
  target_game_type text,
  target_difficulty text,
  target_guessed_lean text,
  target_correct_lean text
)
returns setof public.game_attempts
language plpgsql
security definer
set search_path = public
as $$
declare
  attempt public.game_attempts%rowtype;
begin
  if target_mode = 'practice' then target_round_id := null; end if;

  insert into public.game_attempts (
    anonymous_id, story_id, source_id, source_key, round_id, card_position, mode,
    game_type, difficulty, guessed_lean, correct_lean, is_correct, input_method, response_ms
  ) values (
    target_anonymous_id, target_story_id, target_source_id, target_source_key,
    target_round_id, target_card_position, target_mode, target_game_type, target_difficulty,
    target_guessed_lean, target_correct_lean, target_guessed_lean = target_correct_lean,
    target_input_method, case when target_response_ms is null then null else least(target_response_ms, 300000) end
  )
  on conflict do nothing
  returning * into attempt;

  if attempt.id is null and target_mode = 'scored' then
    select ga.* into attempt
    from public.game_attempts as ga
    where ga.anonymous_id = target_anonymous_id
      and ga.story_id = target_story_id
      and ga.source_id = target_source_id
      and ga.game_type = target_game_type
      and ga.mode = 'scored';
    return next attempt;
    return;
  end if;

  if target_mode = 'scored' and target_game_type = 'lean_guess' then
    update public.users
    set game_total_count = game_total_count + 1,
        game_correct_count = game_correct_count + case when attempt.is_correct then 1 else 0 end
    where users.anonymous_id = target_anonymous_id;
  end if;

  return next attempt;
end;
$$;

revoke all on function public.record_game_attempt_v2(uuid, text, uuid, text, uuid, integer, text, text, text, text, text, text, integer) from public;
grant execute on function public.record_game_attempt_v2(uuid, text, uuid, text, uuid, integer, text, text, text, text, text, text, integer) to service_role;

-- Daily-drop web push tables. Kept in sync with supabase/reminders.sql.
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
create table if not exists public.reminders_sent (
  anonymous_id uuid not null references public.users(anonymous_id) on delete cascade,
  local_date date not null,
  content_day text not null,
  sent_at timestamptz not null default now(),
  result text not null check (result in ('pending', 'sent', 'expired', 'failed')),
  primary key (anonymous_id, local_date)
);
create index if not exists push_subscriptions_user_created_idx on public.push_subscriptions (anonymous_id, created_at desc);
create index if not exists reminders_sent_day_idx on public.reminders_sent (local_date, sent_at);
alter table public.push_subscriptions enable row level security;
alter table public.reminders_sent enable row level security;
revoke all on table public.push_subscriptions from public, anon, authenticated;
revoke all on table public.reminders_sent from public, anon, authenticated;
grant select, insert, update, delete on table public.push_subscriptions to service_role;
grant select, insert, update, delete on table public.reminders_sent to service_role;

create or replace function public.eligible_reminder_subscriptions(
  target_content_day text,
  target_anonymous_id uuid default null
)
returns table (id uuid, anonymous_id uuid, endpoint text, p256dh text, auth text, created_at timestamptz, failure_count integer)
language sql security definer set search_path = public
as $$
  with latest_reads as (
    select distinct on (e.anonymous_id) e.anonymous_id, e.properties->>'content_day' as content_day
    from public.events e where e.event_name = 'story_completed'
    order by e.anonymous_id, e.created_at desc
  ), latest_subscriptions as (
    select distinct on (ps.anonymous_id) ps.id, ps.anonymous_id, ps.endpoint, ps.p256dh, ps.auth, ps.created_at, ps.failure_count
    from public.push_subscriptions ps
    where target_anonymous_id is null or ps.anonymous_id = target_anonymous_id
    order by ps.anonymous_id, ps.created_at desc
  )
  select ls.* from latest_subscriptions ls
  join public.users u on u.anonymous_id = ls.anonymous_id
  join latest_reads lr on lr.anonymous_id = ls.anonymous_id
  where u.total_stories_read > 0
    and lr.content_day ~ '^day[0-9]+$' and target_content_day ~ '^day[0-9]+$'
    and substring(lr.content_day from 4)::integer < substring(target_content_day from 4)::integer;
$$;
revoke all on function public.eligible_reminder_subscriptions(text, uuid) from public, anon, authenticated;
grant execute on function public.eligible_reminder_subscriptions(text, uuid) to service_role;
