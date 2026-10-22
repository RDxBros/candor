import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the games library renders a decorative logo for every catalog game", async () => {
  const [page, logos] = await Promise.all([
    readFile(new URL("../app/game/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/game-logo.tsx", import.meta.url), "utf8")
  ]);

  assert.match(page, /<GameLogo gameId=\{game\.id\} \/>/);
  assert.match(logos, /spot-the-lean/);
  assert.match(logos, /fact-or-opinion/);
  assert.match(logos, /game-logo-question-dot/);
  assert.match(logos, /aria-hidden="true"/);
  assert.match(logos, /focusable="false"/);
});
