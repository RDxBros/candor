import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ForegroundSectionTimer } from "./section-visibility.ts";

test("section visibility requires 50 percent for one foreground second and fires once", () => {
  const timer = new ForegroundSectionTimer(1000);
  timer.setIntersection(false, false, 0);
  assert.equal(timer.remaining(2000), null);
  timer.setIntersection(true, false, 2000);
  assert.equal(timer.consume(2999), false);
  assert.equal(timer.consume(3000), true);
  assert.equal(timer.consume(5000), false);
});

test("section visibility does not count time while the tab is hidden", () => {
  const timer = new ForegroundSectionTimer(1000);
  timer.setIntersection(true, false, 0);
  timer.setHidden(true, 400);
  assert.equal(timer.remaining(5000), null);
  timer.setHidden(false, 5000);
  assert.equal(timer.consume(5599), false);
  assert.equal(timer.consume(5600), true);
});

test("only always-visible political sections receive visibility tracking", async () => {
  const [component, page] = await Promise.all([
    readFile(new URL("../components/tracked-visible-section.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/story/[id]/page.tsx", import.meta.url), "utf8")
  ]);
  assert.match(component, /new IntersectionObserver/);
  assert.match(component, /intersectionRatio >= 0\.5/);
  assert.match(component, /visibilitychange/);
  assert.match(component, /track\("section_visible"/);
  assert.equal((page.match(/<TrackedVisibleSection/g) ?? []).length, 2);
  assert.match(page, /\) : story\.generated\?\.what_happened \? \([\s\S]*<TrackedDetails/);
});
