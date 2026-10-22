create table if not exists public.app_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

insert into public.app_config (key, value)
values ('current_day', 'day1')
on conflict (key) do nothing;

alter table public.app_config enable row level security;
revoke all on table public.app_config from public, anon, authenticated;
grant select, insert, update, delete on table public.app_config to service_role;

comment on table public.app_config is
  'Server-only application settings. current_day selects the published content folder.';

-- Example publish switch:
-- update public.app_config
-- set value = 'day2', updated_at = now()
-- where key = 'current_day';
