begin;

alter table public.game_attempts
  add column if not exists mode text;

update public.game_attempts
set mode = 'scored'
where mode is null;

alter table public.game_attempts
  alter column mode set default 'scored',
  alter column mode set not null;

alter table public.game_attempts
  drop constraint if exists game_attempts_mode_check;
alter table public.game_attempts
  add constraint game_attempts_mode_check check (mode in ('scored', 'practice'));

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'game_attempts'
      and column_name = 'practice_round_id'
  ) then
    alter table public.game_attempts add column practice_round_id uuid;
    -- Practice did not exist before this migration, so every historical row is
    -- a scored attempt even if an earlier schema default was edited manually.
    update public.game_attempts set mode = 'scored';
  end if;
end;
$$;

alter table public.game_attempts
  drop constraint if exists game_attempts_practice_round_check;
alter table public.game_attempts
  add constraint game_attempts_practice_round_check check (
    (mode = 'scored' and practice_round_id is null) or
    (mode = 'practice' and practice_round_id is not null)
  );

alter table public.game_attempts
  drop constraint if exists game_attempts_anonymous_id_story_id_source_key_game_type_key;
drop index if exists public.game_attempts_scored_source_unique;
create unique index game_attempts_scored_source_unique
  on public.game_attempts (anonymous_id, game_type, story_id, source_id)
  where mode = 'scored' and source_id is not null;

create index if not exists game_attempts_practice_round_idx
  on public.game_attempts (anonymous_id, practice_round_id, created_at)
  where mode = 'practice';

drop function if exists public.record_game_attempt(uuid, text, text, text, text, text, text);

commit;
