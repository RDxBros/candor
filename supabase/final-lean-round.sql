begin;

alter table public.game_attempts
  add column if not exists card_position integer;

with scored_round_cards as (
  select
    gr.id as round_id,
    pair.value->>'story_id' as story_id,
    pair.value->>'source_id' as source_id,
    row_number() over (
      partition by gr.id, pair.value->>'story_id'
      order by pair.ordinality
    )::integer as card_position
  from public.game_rounds as gr
  cross join lateral jsonb_array_elements(gr.card_pairs) with ordinality as pair(value, ordinality)
  where gr.mode = 'scored'
),
scored_positions as (
  select ga.id, scored_round_cards.card_position
  from public.game_attempts as ga
  join scored_round_cards
    on scored_round_cards.round_id = ga.round_id
    and scored_round_cards.story_id = ga.story_id
    and scored_round_cards.source_id = ga.source_id::text
  where ga.mode = 'scored'
)
update public.game_attempts as ga
set card_position = scored_positions.card_position
from scored_positions
where ga.id = scored_positions.id;

with practice_sources as (
  select
    anonymous_id,
    practice_round_id,
    story_id,
    coalesce(source_id::text, source_key) as source_identity,
    min(created_at) as first_seen
  from public.game_attempts
  where mode = 'practice'
  group by anonymous_id, practice_round_id, story_id, coalesce(source_id::text, source_key)
),
ranked_practice_sources as (
  select
    anonymous_id,
    practice_round_id,
    story_id,
    source_identity,
    (
      (row_number() over (
        partition by anonymous_id, practice_round_id, story_id
        order by first_seen, source_identity
      ) - 1) % 3 + 1
    )::integer as card_position
  from practice_sources
),
practice_positions as (
  select ga.id, ranked_practice_sources.card_position
  from public.game_attempts as ga
  join ranked_practice_sources
    on ranked_practice_sources.anonymous_id = ga.anonymous_id
    and ranked_practice_sources.practice_round_id = ga.practice_round_id
    and ranked_practice_sources.story_id = ga.story_id
    and ranked_practice_sources.source_identity = coalesce(ga.source_id::text, ga.source_key)
  where ga.mode = 'practice'
)
update public.game_attempts as ga
set card_position = practice_positions.card_position
from practice_positions
where ga.id = practice_positions.id;

with legacy_sources as (
  select
    anonymous_id,
    mode,
    coalesce(round_id::text, practice_round_id::text, 'legacy') as round_identity,
    story_id,
    coalesce(source_id::text, source_key) as source_identity,
    min(created_at) as first_seen
  from public.game_attempts
  where card_position is null
  group by anonymous_id, mode, coalesce(round_id::text, practice_round_id::text, 'legacy'),
    story_id, coalesce(source_id::text, source_key)
),
ranked_legacy_sources as (
  select
    anonymous_id,
    mode,
    round_identity,
    story_id,
    source_identity,
    (
      (row_number() over (
        partition by anonymous_id, mode, round_identity, story_id
        order by first_seen, source_identity
      ) - 1) % 3 + 1
    )::integer as card_position
  from legacy_sources
),
legacy_positions as (
  select ga.id, ranked_legacy_sources.card_position
  from public.game_attempts as ga
  join ranked_legacy_sources
    on ranked_legacy_sources.anonymous_id = ga.anonymous_id
    and ranked_legacy_sources.mode = ga.mode
    and ranked_legacy_sources.round_identity = coalesce(ga.round_id::text, ga.practice_round_id::text, 'legacy')
    and ranked_legacy_sources.story_id = ga.story_id
    and ranked_legacy_sources.source_identity = coalesce(ga.source_id::text, ga.source_key)
  where ga.card_position is null
)
update public.game_attempts as ga
set card_position = legacy_positions.card_position
from legacy_positions
where ga.id = legacy_positions.id;

do $$
begin
  if exists (
    select 1 from public.game_attempts
    where card_position is null or card_position not between 1 and 3
  ) then
    raise exception 'Could not assign a valid card_position to every existing game attempt';
  end if;
end;
$$;

alter table public.game_attempts
  alter column card_position set not null;
alter table public.game_attempts
  drop constraint if exists game_attempts_card_position_check;
alter table public.game_attempts
  add constraint game_attempts_card_position_check check (card_position between 1 and 3);

drop function if exists public.record_game_attempt_v2(uuid, text, uuid, text, uuid, text, text, text, text, text);

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
    raise exception 'card_position must be between 1 and 3';
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

  if target_mode = 'scored' then
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
