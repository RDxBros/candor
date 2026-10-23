import assert from "node:assert/strict";
import test from "node:test";
import { prepareAnalyticsProperties, validateAnalyticsProperties } from "./analytics-schema.ts";

test("unknown event names are always rejected", () => {
  assert.equal(validateAnalyticsProperties("invented", {}, "strict").ok, false);
  assert.equal(validateAnalyticsProperties("invented", {}, "sanitize").ok, false);
});

test("development/test strict mode rejects unknown keys and invalid known values", () => {
  assert.deepEqual(validateAnalyticsProperties("filter_used", { category: "sports_&_gaming", secret: "do not store" }, "strict"), { ok: false, error: "invalid_properties", key: "secret" });
  assert.deepEqual(validateAnalyticsProperties("extend_tapped", { confirmed: "yes" }, "strict"), { ok: false, error: "invalid_properties", key: "confirmed" });
});

test("production mode strips offending keys and retains valid properties", () => {
  const warnings: Array<[string, string]> = [];
  const result = prepareAnalyticsProperties("game_completed", {
    game_type: "lean_guess", mode: "scored", answers_count: 3, correct_count: 2,
    duration_ms: 1200, moves: "private dropped value", unknown: "another dropped value"
  }, "production", (name, key) => warnings.push([name, key]));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.properties, { game_type: "lean_guess", mode: "scored", answers_count: 3, correct_count: 2, duration_ms: 1200 });
  assert.deepEqual(result.droppedKeys.sort(), ["moves", "unknown"]);
  assert.equal(JSON.stringify(result.properties).includes("private dropped value"), false);
  assert.equal(JSON.stringify(result.properties).includes("another dropped value"), false);
  const stored: unknown[] = [];
  stored.push(result.properties);
  assert.equal(JSON.stringify(stored).includes("private dropped value"), false);
  assert.equal(JSON.stringify(stored).includes("another dropped value"), false);
  assert.deepEqual(warnings, [["game_completed", "moves"], ["game_completed", "unknown"]]);
});

test("development and test environments reject the whole event", () => {
  for (const environment of ["development", "test"] as const) {
    const stored: unknown[] = [];
    const result = prepareAnalyticsProperties("filter_used", { category: "technology", extra: "secret" }, environment);
    if (result.ok) stored.push(result.properties);
    assert.equal(result.ok, false);
    assert.equal(stored.length, 0);
  }
});

test("section_visible accepts only the two allowed section names", () => {
  assert.equal(validateAnalyticsProperties("section_visible", { story_id: "story-1", section: "sources" }, "strict").ok, true);
  assert.equal(validateAnalyticsProperties("section_visible", { story_id: "story-1", section: "whats_different" }, "strict").ok, true);
  assert.deepEqual(validateAnalyticsProperties("section_visible", { story_id: "story-1", section: "summary" }, "strict"), { ok: false, error: "invalid_properties", key: "section" });
  assert.deepEqual(validateAnalyticsProperties("section_visible", { story_id: "story-1", section: "sources", scroll_y: 400 }, "strict"), { ok: false, error: "invalid_properties", key: "scroll_y" });
});
test("round_selected accepts topic_fallback only as a boolean", () => {
  const base = { game_type: "lean_guess", story_id: "story-1", mode: "scored", topic_fallback: false };
  assert.equal(validateAnalyticsProperties("round_selected", base, "strict").ok, true);
  assert.deepEqual(validateAnalyticsProperties("round_selected", { ...base, topic_fallback: "false" }, "strict"), { ok: false, error: "invalid_properties", key: "topic_fallback" });
  assert.deepEqual(validateAnalyticsProperties("game_started", { game_type: "lean_guess", mode: "scored", topic_fallback: false }, "strict"), { ok: false, error: "invalid_properties", key: "topic_fallback" });
});

test("reminder events use the strict allowlist", () => {
  assert.equal(validateAnalyticsProperties("reminder_toggled", { enabled: true, result: "subscribed" }, "strict").ok, true);
  assert.equal(validateAnalyticsProperties("reminder_sent", { content_day: "day2", result: "sent" }, "strict").ok, true);
  assert.equal(validateAnalyticsProperties("reminder_opened", { content_day: "day2" }, "strict").ok, true);
  assert.deepEqual(validateAnalyticsProperties("reminder_toggled", { enabled: true, result: "maybe" }, "strict"), { ok: false, error: "invalid_properties", key: "result" });
  assert.deepEqual(validateAnalyticsProperties("reminder_sent", { content_day: "day2", result: "pending" }, "strict"), { ok: false, error: "invalid_properties", key: "result" });
  assert.deepEqual(validateAnalyticsProperties("reminder_opened", { content_day: "day2", endpoint: "secret" }, "strict"), { ok: false, error: "invalid_properties", key: "endpoint" });
});
