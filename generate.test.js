import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildRequestBody,
  buildUserPrompt,
  usesLeanComparison,
  runBatch,
  validateGeneratedKeywords,
  validateStory
} from "./generate.js";
import { DEFAULT_GEMINI_MODEL, getGeminiModel } from "./gemini-config.js";
import { SYSTEM_INSTRUCTION } from "./system-instruction.js";

const STORY = {
  id: "good-story",
  topics: ["sports_&_gaming"],
  lean_comparison: false,
  headline: "A test story",
  sources: [
    { source_id: "10000000-0000-4000-8000-000000000001", outlet: "Source A", bias_label: "left", excerpt: "Shared fact and framing A." },
    { source_id: "10000000-0000-4000-8000-000000000002", outlet: "Source B", bias_label: "center", excerpt: "Shared fact and framing B." },
    { source_id: "10000000-0000-4000-8000-000000000003", outlet: "Source C", bias_label: "right", excerpt: "Shared fact and framing C." }
  ]
};

test("Gemini entry points share a supported stable default with an environment override", () => {
  const original = process.env.GEMINI_MODEL;
  try {
    delete process.env.GEMINI_MODEL;
    assert.equal(DEFAULT_GEMINI_MODEL, "gemini-3.8-flash");
    assert.equal(getGeminiModel(), DEFAULT_GEMINI_MODEL);
    process.env.GEMINI_MODEL = "gemini-test-override";
    assert.equal(getGeminiModel(), "gemini-test-override");
  } finally {
    if (original === undefined) delete process.env.GEMINI_MODEL;
    else process.env.GEMINI_MODEL = original;
  }
});

test("generation mode and schema branch on lean_comparison", () => {
  const generalBody = buildRequestBody(STORY);
  assert.equal(usesLeanComparison(STORY), false);
  assert.deepEqual(generalBody.generationConfig.responseSchema.required, ["what_happened"]);
  assert.equal(buildUserPrompt(STORY).includes("bias_label"), false);

  const technologyStory = { ...STORY, topics: ["technology"] };
  const technologyBody = buildRequestBody(technologyStory);
  assert.equal(usesLeanComparison(technologyStory), false);
  assert.deepEqual(technologyBody.generationConfig.responseSchema.required, ["what_happened"]);
  assert.equal(buildUserPrompt(technologyStory).includes("bias_label"), false);

  const newsStory = {
    ...STORY,
    topics: ["news_&_society"],
    lean_comparison: true,
    sources: STORY.sources.map((source, index) => ({
      ...source,
      bias_label: ["left", "center", "right"][index]
    }))
  };
  const newsBody = buildRequestBody(newsStory);
  assert.equal(usesLeanComparison(newsStory), true);
  assert.equal(newsBody.system_instruction.parts[0].text, SYSTEM_INSTRUCTION);
  assert.deepEqual(newsBody.generationConfig.responseSchema.required, [
    "what_happened",
    "whats_different",
    "keywords"
  ]);
  assert.deepEqual(newsBody.generationConfig.responseSchema.properties.keywords.items.required, [
    "source_name", "bias_label", "terms", "explanation"
  ]);
  assert.match(buildUserPrompt(newsStory), /Every selected term for a source must appear together in one complete source sentence of about 40 words or fewer/);
  assert.match(buildUserPrompt(newsStory), /bias_label: left/);

  const missingBias = structuredClone(newsStory);
  delete missingBias.sources[0].bias_label;
  assert.throws(() => validateStory(missingBias), /needs a non-empty bias_label/);

  const noComparison = structuredClone(newsStory);
  noComparison.lean_comparison = false;
  noComparison.sources = noComparison.sources.slice(0, 2).map(({ bias_label: _bias, ...source }) => source);
  assert.doesNotThrow(() => validateStory(noComparison));
  assert.deepEqual(buildRequestBody(noComparison).generationConfig.responseSchema.required, ["what_happened"]);
  assert.equal(buildUserPrompt(noComparison).includes("bias_label"), false);

  const twoSourceGeneralStory = { ...STORY, sources: STORY.sources.slice(0, 2) };
  assert.doesNotThrow(() => validateStory(twoSourceGeneralStory));
  assert.doesNotThrow(() => validateStory(STORY));

  const oneSourceGeneralStory = { ...STORY, sources: STORY.sources.slice(0, 1) };
  assert.throws(() => validateStory(oneSourceGeneralStory), /two or three entries/);

  const fourSourceGeneralStory = {
    ...STORY,
    sources: [...STORY.sources, { source_id: "10000000-0000-4000-8000-000000000004", outlet: "Source D", excerpt: "Another account." }]
  };
  assert.throws(() => validateStory(fourSourceGeneralStory), /two or three entries/);

  const twoSourceNewsStory = { ...newsStory, sources: newsStory.sources.slice(0, 2) };
  assert.throws(() => validateStory(twoSourceNewsStory), /exactly three sources/);

  const duplicateLeanNewsStory = structuredClone(newsStory);
  duplicateLeanNewsStory.sources[1].bias_label = "left";
  assert.throws(() => validateStory(duplicateLeanNewsStory), /exactly one left, one center, and one right/);

  const validGameContent = {
    keywords: newsStory.sources.map((source) => ({
      source_name: source.outlet,
      terms: ["Shared fact"],
      explanation: `“Shared fact” is the phrase selected for ${source.bias_label} framing.`
    }))
  };
  assert.doesNotThrow(() => validateGeneratedKeywords(validGameContent, newsStory));
  const invisibleTerm = structuredClone(validGameContent);
  invisibleTerm.keywords[0].terms = ["not visible"];
  assert.throws(() => validateGeneratedKeywords(invisibleTerm, newsStory), /not visible and explained/);

});

test("batch generation recurses, skips reviewed output, and continues after malformed input", async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "candor-batch-test-"));
  const category = path.join(folder, "category");
  await mkdir(category);

  await writeFile(path.join(category, "good.json"), JSON.stringify(STORY), "utf8");
  await writeFile(
    path.join(category, "api-fail.json"),
    JSON.stringify({ ...STORY, id: "api-fail", headline: "Trigger API failure" }),
    "utf8"
  );
  await writeFile(path.join(category, "bad.json"), "{not-json", "utf8");
  await writeFile(
    path.join(category, "reviewed.json"),
    JSON.stringify({ ...STORY, id: "reviewed-story" }),
    "utf8"
  );
  await writeFile(
    path.join(category, "reviewed_output.json"),
    JSON.stringify({ reviewed_by_human: true, marker: "keep-me" }),
    "utf8"
  );

  const originalFetch = globalThis.fetch;
  let apiCalls = 0;
  globalThis.fetch = async (_url, options) => {
    apiCalls += 1;
    const request = JSON.parse(options.body);
    const prompt = request.contents[0].parts[0].text;
    if (prompt.includes("Headline: Trigger API failure")) {
      return new Response(
        JSON.stringify({ error: { status: "UNAVAILABLE", message: "Mock API outage" } }),
        {
          status: 503,
          headers: { "Content-Type": "application/json", "Retry-After": "0" }
        }
      );
    }
    const generated = {
      what_happened: "A neutral summary.",
      whats_different: "The sources emphasized different details.",
      keywords: [
        { source_name: "Source A", bias_label: "left", terms: ["term A"] },
        { source_name: "Source B", bias_label: "center", terms: ["term B"] },
        { source_name: "Source C", bias_label: "right", terms: ["term C"] }
      ]
    };
    return new Response(
      JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(generated) }] } }] }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  try {
    const totals = await runBatch(folder, "test-key");
    assert.deepEqual(totals, { generated: 1, skipped: 1, failed: 2 });
    assert.equal(apiCalls, 6);

    const output = JSON.parse(await readFile(path.join(category, "good_output.json"), "utf8"));
    assert.equal(output.id, "good-story");
    assert.equal(output.generated.what_happened, "A neutral summary.");
    assert.equal("whats_different" in output.generated, false);
    assert.equal("keywords" in output.generated, false);
    assert.equal(output.reviewed_by_human, false);

    const reviewed = JSON.parse(
      await readFile(path.join(category, "reviewed_output.json"), "utf8")
    );
    assert.equal(reviewed.marker, "keep-me");
  } finally {
    globalThis.fetch = originalFetch;
    await rm(folder, { recursive: true, force: true });
  }
});
