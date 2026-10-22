begin;

comment on column public.users.game_correct_count is 'Spot the Lean scored answers correct. Do not use for other game types.';
comment on column public.users.game_total_count is 'Spot the Lean scored answers attempted. Do not use for other game types.';
-- Later cleanup: rename these two columns to lean_guess_correct_count and
-- lean_guess_total_count once a coordinated API/client migration is worthwhile.

alter table public.game_attempts add column if not exists content_id text;
alter table public.game_attempts add column if not exists content_round_id text;
alter table public.game_attempts add column if not exists placement text;
alter table public.game_attempts add column if not exists correct_answer text;

alter table public.game_attempts alter column story_id drop not null;
alter table public.game_attempts alter column source_key drop not null;
alter table public.game_attempts alter column guessed_lean drop not null;
alter table public.game_attempts alter column correct_lean drop not null;

alter table public.game_attempts drop constraint if exists game_attempts_card_position_check;
alter table public.game_attempts add constraint game_attempts_card_position_check check (card_position between 1 and 6);
alter table public.game_attempts drop constraint if exists game_attempts_placement_check;
alter table public.game_attempts add constraint game_attempts_placement_check check (placement is null or placement in ('fact', 'opinion'));
alter table public.game_attempts drop constraint if exists game_attempts_correct_answer_check;
alter table public.game_attempts add constraint game_attempts_correct_answer_check check (correct_answer is null or correct_answer in ('fact', 'opinion'));
alter table public.game_attempts drop constraint if exists game_attempts_fact_opinion_shape_check;
alter table public.game_attempts add constraint game_attempts_fact_opinion_shape_check check (
  game_type <> 'fact_opinion' or (
    content_id is not null and content_round_id is not null and
    placement is not null and correct_answer is not null and
    story_id is null and source_id is null and source_key is null and
    guessed_lean is null and correct_lean is null
  )
);

create unique index if not exists game_attempts_scored_content_unique
  on public.game_attempts (anonymous_id, game_type, content_id)
  where mode = 'scored' and content_id is not null;
create index if not exists game_attempts_content_round_idx
  on public.game_attempts (anonymous_id, game_type, content_round_id, created_at);

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
  if target_card_position not between 1 and 3 then
    raise exception 'Spot the Lean card_position must be between 1 and 3';
  end if;

  insert into public.game_attempts (
    anonymous_id, story_id, source_id, source_key, round_id, card_position, mode,
    game_type, difficulty, guessed_lean, correct_lean, is_correct
  ) values (
    target_anonymous_id, target_story_id, target_source_id, target_source_key,
    target_round_id, target_card_position, target_mode, target_game_type, target_difficulty,
    target_guessed_lean, target_correct_lean, target_guessed_lean = target_correct_lean
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

revoke all on function public.record_game_attempt_v2(uuid, text, uuid, text, uuid, integer, text, text, text, text, text) from public;
grant execute on function public.record_game_attempt_v2(uuid, text, uuid, text, uuid, integer, text, text, text, text, text) to service_role;

commit;
