-- Run this once in Supabase SQL Editor after the original schema.
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
  ('swift_kelce_touchdown', 'fox news', '9c416fc8-171a-41ee-93c6-e9af4f73b3bf'::uuid),
  ('swift_kelce_touchdown', 'cleveland.com', '4c9654ed-accc-4877-bfcf-01b506652c50'::uuid),
  ('swift_kelce_touchdown', 'yahoo', 'a77854e9-dc00-46b5-bae6-472f60ca75cb'::uuid),
  ('culture_&_entertainment-002', 'fox news', '210c96f6-8ee5-47da-b48d-46b0dbec9ac3'::uuid),
  ('culture_&_entertainment-002', 'cleveland.com', '0ccca495-2499-4170-b3fa-8178609f2df4'::uuid),
  ('brain_discovery', 'the times', '0ff540d6-8bef-4415-9b89-b5f5befcabf1'::uuid),
  ('brain_discovery', 'science daily', '72a90b42-828a-4d68-8d3e-ef9402473b03'::uuid),
  ('brain_discovery', 'stanford medicine', '1cd242be-a1ab-4ab3-b08d-e73fe7147993'::uuid),
  ('paramount_warner_merger', 'cnbc', '78731c44-4c8a-4624-ad39-73dbb84be292'::uuid),
  ('paramount_warner_merger', 'nbc news', 'b2b91960-ef87-4e7c-a45c-6daaa4a3e5cb'::uuid),
  ('paramount_warner_merger', 'deadline', '476b5f08-a2f9-41ee-9ae7-2bfc3f25a407'::uuid),
  ('un_report_us_war_crimes_iran', 'cnbc news', '00a2158c-842b-4913-9198-c7776fc4dec0'::uuid),
  ('un_report_us_war_crimes_iran', 'reuters', '1670bd67-68ea-462e-920b-011dd5443945'::uuid),
  ('un_report_us_war_crimes_iran', 'new york post', '1fe5f1f4-e0fc-40a9-a6c8-a5d7d3d5e16b'::uuid),
  ('White_House_Media_Bans', 'huffpost', '3a82e064-c4dc-4f16-828b-a35eb38a798b'::uuid),
  ('White_House_Media_Bans', 'united press international', '5b82b45a-4a65-40dc-bf38-7d5a39f4b26a'::uuid),
  ('White_House_Media_Bans', 'new york post', '57054f77-cbf5-4520-bd76-74306515f47a'::uuid),
  ('US_Denmark_Greenland_Deal', 'associated press', '8b8a28da-d7cc-4881-8fc2-de0205cae7f1'::uuid),
  ('US_Denmark_Greenland_Deal', 'the hill', '8d9b98f7-75c9-412a-b9db-0f702c538a0e'::uuid),
  ('US_Denmark_Greenland_Deal', 'new york post', 'afe74ec7-8966-46f6-8839-8fd754e3aa11'::uuid),
  ('bills_vs_lions', 'yahoo news', 'c710501e-d85d-4a27-9398-62c937286341'::uuid),
  ('bills_vs_lions', 'suaragurut.id', '074eedd0-4396-4e6c-a8cc-4aa20c200e94'::uuid),
  ('bills_vs_lions', 'espn', '4e576aa1-4632-4801-bbba-7f629ac8a583'::uuid),
  ('mbappe_signs_with_on', 'new york times', '4963d290-23f8-4686-91e4-62ff357d0efb'::uuid),
  ('mbappe_signs_with_on', 'the guardian', '26d2cd2a-d06d-4303-8140-9391e1497e75'::uuid),
  ('mbappe_signs_with_on', 'espn', 'd8768ada-c499-4843-bbe6-0f794b8f1769'::uuid),
  ('jose_ramirez', 'mlb.com', '8d823c55-6bf0-4d46-a0be-441e197740fc'::uuid),
  ('jose_ramirez', 'yahoo sports', '4e981a35-d26b-4d87-acdf-ebcfd6b90837'::uuid),
  ('jose_ramirez', 'espn', '37f726d6-1964-481b-ba65-70c13667b0bc'::uuid),
  ('openai_rogue_agents', 'gizmodo', 'ff4e29f3-4c20-4e21-ae5c-6b690c405a04'::uuid),
  ('openai_rogue_agents', 'reuters', '62f65ae9-1907-49d6-97fc-3afc2ec8588f'::uuid),
  ('removemacai_tool', 'the verge', '9c7e2a7d-0966-49f2-9e03-59053d754957'::uuid),
  ('removemacai_tool', 'macrumors', 'f3fa3d2d-e625-40bc-bd8d-10a64cb66ac7'::uuid),
  ('crazy-rich-asians-series', 'bbc news', 'feff5987-6815-48ba-a9fa-c34fbfb96065'::uuid),
  ('crazy-rich-asians-series', 'cnn', '8573e022-057e-45f3-a87d-c83cac842f46'::uuid),
  ('marvel-television-announcements', 'deadline', '21da305f-c095-40f8-9a2a-d800866ed8a6'::uuid),
  ('marvel-television-announcements', 'variety', '850e90dc-7e21-4f4b-be3a-7ddf50cadab7'::uuid),
  ('plank-record-grandmother', 'abc news', '983fe549-2777-49f0-a5e6-eca66402c134'::uuid),
  ('plank-record-grandmother', 'fox news', '65d28303-8a71-4826-b1b3-82b58d67d6a8'::uuid),
  ('trump_account_claims', 'pennlive.com', '0bb3d119-876e-4134-bc2f-5e13b916fd8d'::uuid),
  ('trump_account_claims', 'the hill', '85b94cf0-3ae7-4e68-b72d-de107c112729'::uuid),
  ('mortgage_rates_rise', 'reuters', 'ea6cee3a-ea54-42ae-9526-e179f98fe429'::uuid),
  ('mortgage_rates_rise', 'cnbc news', '63cfe33a-4922-4d9f-a64a-c5e01d7b9eb6'::uuid),
  ('US_Denmark_Greenland_security_deal', 'associated press', 'beed1576-e520-40c5-9b58-8b84e38f070a'::uuid),
  ('US_Denmark_Greenland_security_deal', 'the hill', '5b7f14a6-864f-4f4f-b7e6-04d14c15616f'::uuid),
  ('US_Denmark_Greenland_security_deal', 'new york post', 'b03e7579-108a-489c-8cad-fdb3936470a3'::uuid),
  ('news_&_society-002', 'huffpost', 'd2b3821e-5c18-40b8-9afc-ac41222eac8d'::uuid),
  ('news_&_society-002', 'united press international', '968ef1a7-a901-4ba9-be46-f1c65c8fd599'::uuid),
  ('news_&_society-002', 'new york post', 'ec263589-b19e-4b88-b2a2-c981b0661183'::uuid),
  ('news_&_society-003', 'huffpost', 'a73b0874-b530-4667-8b4a-d7c58a80e54f'::uuid),
  ('news_&_society-003', 'united press international', '424ef897-548f-4b86-abfc-944e751f518a'::uuid),
  ('news_&_society-003', 'new york post', 'e846476f-28d4-4035-a8a8-1fa2ad34540a'::uuid),
  ('ronaldo_leaves_portugal_camp', 'ny times', '235e43b4-b1ed-4b89-ae79-a82cd35593ab'::uuid),
  ('ronaldo_leaves_portugal_camp', 'the guardian', 'bf1b95d5-d145-4caa-8721-dcc59a96423a'::uuid),
  ('ronaldo_leaves_portugal_camp', 'espn', '194dd600-0d30-4a92-81fc-b78dc67bfef9'::uuid),
  ('man_city_115_charges', 'yahoo sports', 'c8c056e2-9522-4212-be7d-af459d3b071c'::uuid),
  ('man_city_115_charges', 'nbc news', 'e90f7daf-817c-4231-a4f3-4e300c5422ec'::uuid),
  ('man_city_115_charges', 'espn', '97f30a2c-d924-4577-8974-56206bf6d96f'::uuid),
  ('jose_ramirez', 'ny post', '6b63bc31-8adc-46f5-b4a9-bbfec7e8a128'::uuid),
  ('jose_ramirez', 'ny times', '3afdc287-64c2-4c8b-8b96-26f590807c73'::uuid),
  ('jose_ramirez', 'usa today', '22608415-1bac-4252-ae67-2c4798709f82'::uuid),
  ('spacex_rebrand', 'forbes', '9156aa05-4e6b-48b7-9645-7e0fed7be54d'::uuid),
  ('spacex_rebrand', 'wccftech', '1ada3d4b-4202-4032-a1bf-66a841387871'::uuid),
  ('spacex_rebrand', 'fox business', 'd0c6ada4-05dc-4798-983f-81a3f37b6033'::uuid),
  ('openai_safety_employee_quits', 'reuters', 'f1d8211d-68ed-4f03-a3f2-ead3ac3be41e'::uuid),
  ('openai_safety_employee_quits', 'the guardian', '86478af5-f8d4-4c55-a8a0-e01337f4111b'::uuid);

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
