-- Run this once in the Supabase SQL Editor for an existing Candor project.
-- It replaces only the game-attempt function; no rows are deleted or reset.

create or replace function public.record_game_attempt(
  target_anonymous_id uuid,
  target_story_id text,
  target_source_key text,
  target_game_type text,
  target_difficulty text,
  target_guessed_lean text,
  target_correct_lean text
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
