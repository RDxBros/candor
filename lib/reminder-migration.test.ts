import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("database enforces one reminder per user and Eastern local date", async () => {
  const sql = await readFile(new URL("../supabase/reminders.sql", import.meta.url), "utf8");
  assert.match(sql, /primary key \(anonymous_id, local_date\)/i);
  assert.match(sql, /enable row level security/gi);
  assert.match(sql, /revoke all on table public\.push_subscriptions from public, anon, authenticated/i);
  assert.match(sql, /revoke all on table public\.reminders_sent from public, anon, authenticated/i);
  assert.match(sql, /tablename in \('push_subscriptions', 'reminders_sent'\)/i);
  assert.match(sql, /array\['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'\]/i);
});

test("cron schedules both UTC hours and keeps its secret in Vault", async () => {
  const sql = await readFile(new URL("../supabase/reminders-cron.sql", import.meta.url), "utf8");
  assert.match(sql, /'0 15 \* \* \*'/);
  assert.match(sql, /'0 16 \* \* \*'/);
  assert.match(sql, /vault\.decrypted_secrets/);
  assert.doesNotMatch(sql, /REPLACE_WITH|YOUR-PRODUCTION|Bearer [A-Za-z0-9_-]{24,}/);
  assert.match(sql, /Missing Vault secret: candor_cron_secret/);
});


test("recipient SQL uses the latest completed story and an earlier content day", async () => {
  const sql = await readFile(new URL("../supabase/reminders.sql", import.meta.url), "utf8");
  assert.match(sql, /distinct on \(e\.anonymous_id\)[\s\S]*event_name = 'story_completed'[\s\S]*order by e\.anonymous_id, e\.created_at desc/i);
  assert.match(sql, /u\.total_stories_read > 0/i);
  assert.match(sql, /substring\(lr\.content_day from 4\)::integer < substring\(target_content_day from 4\)::integer/i);
});
test("security audit fails on reminder policies or browser-role grants", async () => {
  const sql = await readFile(new URL("../supabase/security-audit.sql", import.meta.url), "utf8");
  assert.match(sql, /public\.push_subscriptions/);
  assert.match(sql, /public\.reminders_sent/);
  assert.match(sql, /must have RLS enabled/);
  assert.match(sql, /must have no RLS policies/);
  assert.match(sql, /has_table_privilege\(checked_role, checked_table, checked_privilege\)/);
});
