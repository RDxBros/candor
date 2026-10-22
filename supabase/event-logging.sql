-- Run once in the Supabase SQL editor before enabling the testing analytics.
alter table public.users add column if not exists is_internal boolean default false;

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

alter table public.events enable row level security;
revoke all on table public.events from anon, authenticated;
grant select, insert on table public.events to service_role;

alter table public.game_attempts add column if not exists input_method text;
alter table public.game_attempts add column if not exists response_ms integer;
alter table public.game_attempts drop constraint if exists game_attempts_input_method_check;
alter table public.game_attempts add constraint game_attempts_input_method_check
  check (input_method is null or input_method in ('swipe', 'tap', 'drag', 'keyboard'));
alter table public.game_attempts drop constraint if exists game_attempts_response_ms_check;
alter table public.game_attempts add constraint game_attempts_response_ms_check
  check (response_ms is null or response_ms between 0 and 300000);

drop function if exists public.record_game_attempt_v2(uuid, text, uuid, text, uuid, integer, text, text, text, text, text);
create or replace function public.record_game_attempt_v2(
  target_anonymous_id uuid, target_story_id text, target_source_id uuid,
  target_source_key text, target_round_id uuid, target_card_position integer,
  target_mode text, target_game_type text, target_difficulty text,
  target_guessed_lean text, target_correct_lean text,
  target_input_method text default null, target_response_ms integer default null
)
returns setof public.game_attempts
language plpgsql security definer set search_path = public
as $$
declare attempt public.game_attempts%rowtype;
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
  ) on conflict do nothing returning * into attempt;
  if attempt.id is null and target_mode = 'scored' then
    select ga.* into attempt from public.game_attempts ga
    where ga.anonymous_id = target_anonymous_id and ga.story_id = target_story_id
      and ga.source_id = target_source_id and ga.game_type = target_game_type and ga.mode = 'scored';
    return next attempt; return;
  end if;
  if target_mode = 'scored' and target_game_type = 'lean_guess' then
    update public.users set game_total_count = game_total_count + 1,
      game_correct_count = game_correct_count + case when attempt.is_correct then 1 else 0 end
    where anonymous_id = target_anonymous_id;
  end if;
  return next attempt;
end;
$$;
revoke all on function public.record_game_attempt_v2(uuid,text,uuid,text,uuid,integer,text,text,text,text,text,text,integer) from public;
grant execute on function public.record_game_attempt_v2(uuid,text,uuid,text,uuid,integer,text,text,text,text,text,text,integer) to service_role;

