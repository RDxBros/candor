import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("internal mode is persisted, stripped from the URL and synced once per session", async () => {
  const source = await readFile(new URL("../components/anonymous-user-bootstrap.tsx", import.meta.url), "utf8");
  assert.match(source, /searchParams\.get\("internal"\) === "1"/);
  assert.match(source, /localStorage\.setItem\("candor_internal", "1"\)/);
  assert.match(source, /searchParams\.delete\("internal"\)/);
  assert.match(source, /history\.replaceState/);
  assert.match(source, /sessionStorage\.getItem\("candor:internal-synced"\)/);
});

test("story completion analytics reuses the read tracker and is guarded against rereads", async () => {
  const source = await readFile(new URL("../components/story-read-tracker.tsx", import.meta.url), "utf8");
  assert.match(source, /if \(!wasRead\) track\("story_completed"/);
  assert.match(source, /reachedEnd\.current && !minimumTimeReached\.current|!reachedEnd\.current \|\| !minimumTimeReached\.current/);
  assert.equal((source.match(/track\("story_completed"/g) ?? []).length, 1);
});

test("scored game completion is logged server-side only", async () => {
  const [leanClient, leanServer, factClient, factServer] = await Promise.all([
    readFile(new URL("../components/lean-guessing-game.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/game-rounds/[id]/complete/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/fact-opinion-game.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/fact-opinion/attempts/route.ts", import.meta.url), "utf8")
  ]);
  assert.match(leanServer, /eventName: "game_completed"/);
  assert.match(factServer, /eventName: "game_completed"/);
  assert.doesNotMatch(leanClient, /mode: "scored"[^\n]+game_completed|game_completed[^\n]+mode: "scored"/);
  assert.doesNotMatch(factClient, /track\("game_completed"/);
});
