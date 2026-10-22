import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const mapping = JSON.parse(await readFile(path.join(root, "supabase", "source-id-map.json"), "utf8"));
const values = mapping.map((item) => `  (${sql(item.story_id)}, ${sql(item.source_key)}, '${item.source_id}'::uuid)`).join(",\n");

function sql(value) { return `'${String(value).replaceAll("'", "''")}'`; }

const migration = `-- Run this once in Supabase SQL Editor after the original schema.
-- Existing rows are mapped, never dropped. The final query lists anything that needs manual mapping.

create table if not exists public.game_rounds (
  id uuid primary key default gen_random_uuid(),
  anonymous_id uuid not null references public.users(anonymous_id) on delete cascade,
  game_type text not null default 'lean_guess',
  mode text not null default 'scored' check (mode in ('scored', 'practice')),
  card_pairs jsonb not null check (jsonb_typeof(card_pairs) = 'array'),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.game_attempts add column if not exists source_id uuid;
alter table public.game_attempts add column if not exists mode text not null default 'scored';
alter table public.game_attempts add column if not exists round_id uuid references public.game_rounds(id) on delete set null;
alter table public.game_attempts drop constraint if exists game_attempts_mode_check;
alter table public.game_attempts add constraint game_attempts_mode_check check (mode in ('scored', 'practice'));
update public.game_attempts set mode = 'scored' where mode is null;

create temporary table source_id_migration_map (
  story_id text not null,
  source_key text not null,
  source_id uuid not null,
  primary key (story_id, source_key)
) on commit drop;

insert into source_id_migration_map (story_id, source_key, source_id) values
${values};

update public.game_attempts as attempt
set source_id = mapping.source_id
from source_id_migration_map as mapping
where attempt.source_id is null
  and attempt.story_id = mapping.story_id
  and lower(trim(attempt.source_key)) = mapping.source_key;

alter table public.game_attempts drop constraint if exists game_attempts_anonymous_id_story_id_source_key_game_type_key;
create unique index if not exists game_attempts_scored_source_unique
  on public.game_attempts (anonymous_id, game_type, story_id, source_id)
  where mode = 'scored' and source_id is not null;
create index if not exists game_attempts_round_idx on public.game_attempts (round_id, created_at);

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

alter table public.game_rounds enable row level security;
alter table public.source_link_clicks enable row level security;
alter table public.badges enable row level security;
revoke all on table public.game_rounds, public.source_link_clicks, public.badges from anon, authenticated;
grant select, insert, update on table public.game_rounds to service_role;
grant select, insert on table public.source_link_clicks, public.badges to service_role;
grant select, insert, update on table public.game_attempts to service_role;

create or replace function public.record_game_attempt_v2(
  target_anonymous_id uuid,
  target_story_id text,
  target_source_id uuid,
  target_source_key text,
  target_round_id uuid,
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
  if target_mode = 'practice' then
    target_round_id := null;
  end if;

  insert into public.game_attempts (
    anonymous_id, story_id, source_id, source_key, round_id, mode,
    game_type, difficulty, guessed_lean, correct_lean, is_correct
  ) values (
    target_anonymous_id, target_story_id, target_source_id, target_source_key, target_round_id,
    target_mode, target_game_type, target_difficulty, target_guessed_lean,
    target_correct_lean, target_guessed_lean = target_correct_lean
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

revoke all on function public.record_game_attempt_v2(uuid, text, uuid, text, uuid, text, text, text, text, text) from public;
grant execute on function public.record_game_attempt_v2(uuid, text, uuid, text, uuid, text, text, text, text, text) to service_role;

-- Rows returned here were deliberately preserved and need a manual source_id assignment.
select id, anonymous_id, story_id, source_key, created_at
from public.game_attempts
where source_id is null
order by created_at;
`;

await writeFile(path.join(root, "supabase", "badges-and-source-ids.sql"), migration, "utf8");
console.log(`Wrote migration with ${mapping.length} source mappings.`);
