import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { selectContentDay } from "./content-day-shared.ts";

test("day overrides are ignored when deployment overrides are disabled", () => {
  assert.equal(selectContentDay("day2", "day1", false), "day1");
});

test("valid day overrides work only when explicitly allowed", () => {
  assert.equal(selectContentDay("day2", "day1", true), "day2");
  assert.equal(selectContentDay("../day9", "day1", true), "day1");
  assert.equal(selectContentDay("day-preview", "day1", true), "day1");
});

test("development instrumentation avoids the request-bound Next cache", async () => {
  const instrumentation = await readFile(new URL("../instrumentation.ts", import.meta.url), "utf8");
  const contentDay = await readFile(new URL("./content-day.ts", import.meta.url), "utf8");

  assert.match(instrumentation, /getCurrentDayForInstrumentation/);
  assert.doesNotMatch(instrumentation, /await getCurrentDay\(\)/);
  assert.match(contentDay, /getCurrentDayForInstrumentation[\s\S]*readCurrentDayFromSource\(\)/);
});
