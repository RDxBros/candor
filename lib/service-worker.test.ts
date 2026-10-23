import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("service worker uses a deploy-specific cache version and purges only old Candor caches", async () => {
  const [worker, config, registration] = await Promise.all([
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
    readFile(new URL("../next.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/pwa-register.tsx", import.meta.url), "utf8")
  ]);

  assert.match(config, /VERCEL_DEPLOYMENT_ID/);
  assert.match(config, /NEXT_PUBLIC_CANDOR_SW_VERSION/);
  assert.match(registration, /sw\.js\?v=/);
  assert.match(registration, /updateViaCache: "none"/);
  assert.match(registration, /registration\.update\(\)/);
  assert.match(worker, /searchParams\.get\("v"\)/);
  assert.match(worker, /key\.startsWith\(CACHE_PREFIX\)/);
  assert.doesNotMatch(worker, /candor-(?:shell|data)-v\d+/);
});

test("navigations and API reads use the network before an offline cache fallback", async () => {
  const worker = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
  const networkFirst = worker.slice(
    worker.indexOf("async function networkFirst"),
    worker.indexOf('self.addEventListener("install"')
  );

  assert.ok(networkFirst.indexOf("await fetch(request)") < networkFirst.indexOf("await cache.match(request)"));
  assert.match(worker, /url\.pathname === "\/api\/stories" \? networkFirst\(request, DATA_CACHE\) : fetch\(request\)/);
  assert.match(worker, /request\.mode === "navigate"[\s\S]*networkFirst\(request, DATA_CACHE, "\/offline"\)/);
  assert.doesNotMatch(worker, /const SHELL = \[[^\]]*"\/"/);
});
