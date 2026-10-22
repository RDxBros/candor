import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const componentPaths = [
  "../components/spot-lean-preview.tsx",
  "../components/fact-opinion-preview.tsx"
] as const;

test("game previews are lightweight inline SVGs with accessible descriptions", async () => {
  for (const path of componentPaths) {
    const url = new URL(path, import.meta.url);
    const [source, details] = await Promise.all([readFile(url, "utf8"), stat(url)]);
    assert.ok(details.size < 5 * 1024, `${path} must remain under 5 KB`);
    assert.match(source, /<svg aria-hidden="true"/);
    assert.match(source, /<figcaption>/);
    assert.doesNotMatch(source, /<img|\.gif|<video|framer-motion|gsap/i);
  }
});

test("preview content is invented and placement uses the reserved slots", async () => {
  const [spot, fact, leanEntry, factEntry, home] = await Promise.all([
    readFile(new URL("../components/spot-lean-preview.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/fact-opinion-preview.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/lean-game-entry.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/fact-opinion-entry.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/home-gate.tsx", import.meta.url), "utf8")
  ]);
  assert.match(spot, />Left</);
  assert.match(spot, />Right</);
  assert.match(spot, />Center</);
  assert.match(fact, /The library extended its weekend hours\./);
  assert.match(fact, /The new schedule is too crowded\./);
  assert.match(leanEntry, /preview=\{<SpotLeanPreview \/>\}/);
  assert.doesNotMatch(leanEntry, /previewAfterAction/);
  assert.match(factEntry, /preview=\{<FactOpinionPreview \/>\}/);
  assert.doesNotMatch(home, /FactOpinionPreview/);
  assert.match(home, /home-preview-slot" aria-hidden="true"/);
});

test("preview playback pauses for hidden tabs, offscreen content and reduced motion", async () => {
  const [hook, styles] = await Promise.all([
    readFile(new URL("../components/use-preview-activity.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8")
  ]);
  assert.match(hook, /new IntersectionObserver/);
  assert.match(hook, /entry\.isIntersecting/);
  assert.match(hook, /document\.hidden/);
  assert.match(hook, /visibilitychange/);
  assert.match(styles, /\.game-preview\[data-running="true"\][\s\S]*animation-play-state:\s*running/);
  assert.match(styles, /@media \(max-width: 480px\) and \(max-height: 700px\)[\s\S]*\.game-entry-preview[\s\S]*height:\s*140px/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.game-preview \.spot-preview-card[\s\S]*animation:\s*none !important/);
  assert.match(styles, /spot-preview-swipe 6\.6s/);
});
