import assert from "node:assert/strict";
import test from "node:test";
import {
  COMPARISON_STORY_MINIMUM_MS,
  minimumStoryTimeMs,
  STANDARD_STORY_MINIMUM_MS
} from "./reading-requirements.ts";

test("story timing is 10 seconds normally and 15 seconds when What's different is shown", () => {
  assert.equal(minimumStoryTimeMs(false), STANDARD_STORY_MINIMUM_MS);
  assert.equal(minimumStoryTimeMs(false), 10_000);
  assert.equal(minimumStoryTimeMs(true), COMPARISON_STORY_MINIMUM_MS);
  assert.equal(minimumStoryTimeMs(true), 15_000);
});
