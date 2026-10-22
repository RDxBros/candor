import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("migration protects events and analytics queries exclude internal users", async () => {
  const [migration, queries] = await Promise.all([
    readFile(new URL("../supabase/event-logging.sql", import.meta.url), "utf8"),
    readFile(new URL("../docs/testing-analytics.sql", import.meta.url), "utf8")
  ]);
  assert.match(migration, /is_internal boolean default false/i);
  assert.match(migration, /alter table public\.events enable row level security/i);
  assert.match(migration, /revoke all on table public\.events from anon, authenticated/i);
  assert.ok((queries.match(/public\.events_external/gi) ?? []).length >= 10);
  assert.match(queries, /game_attempts ga join public\.users u using\(anonymous_id\)/i);
});

test("comment event instrumentation never forwards display text", async () => {
  const source = await readFile(new URL("../app/api/comments/route.ts", import.meta.url), "utf8");
  const eventCall = source.match(/logServerEvent\(\{[^;]+eventName:\s*"comment_posted"[^;]+\}\)/s)?.[0] ?? "";
  assert.ok(eventCall);
  assert.doesNotMatch(eventCall, /displayText|display_text/);
});

test("analysis views exclude internal events and deny browser client roles", async () => {
  const [migration, queries] = await Promise.all([
    readFile(new URL("../supabase/analytics-views.sql", import.meta.url), "utf8"),
    readFile(new URL("../docs/testing-analytics.sql", import.meta.url), "utf8")
  ]);
  assert.match(migration, /create or replace view public\.events_external[\s\S]*security_invoker\s*=\s*true/i);
  assert.match(migration, /coalesce\(u\.is_internal,\s*false\)\s*=\s*false/i);
  assert.match(migration, /not \(e\.properties @> '\{"internal": true\}'::jsonb\)/i);
  assert.match(migration, /revoke all on table public\.events_external from public, anon, authenticated/i);
  assert.match(migration, /revoke all on table public\.user_timeline from public, anon, authenticated/i);
  assert.match(migration, /has_table_privilege\('anon',[\s\S]*raise exception/i);
  assert.doesNotMatch(queries, /from public\.events e join public\.users u/i);
  assert.ok((queries.match(/public\.events_external/gi) ?? []).length >= 12);
  assert.match(queries, /share_sources_visible/);
  assert.match(queries, /completion_rate/);
  assert.match(queries, /share_bottom_without_whats_different/);
});
