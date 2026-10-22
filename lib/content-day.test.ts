import assert from "node:assert/strict";
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
