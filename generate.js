import { access, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getGeminiModel } from "./gemini-config.js";
import { SYSTEM_INSTRUCTION } from "./system-instruction.js";

const MODEL = getGeminiModel();
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`;
const OUTPUT_SUFFIX = "_output.json";
const MAX_API_ATTEMPTS = readPositiveInteger("GEMINI_MAX_ATTEMPTS", 5);
const RETRY_BASE_MS = readPositiveInteger("GEMINI_RETRY_BASE_MS", 2_000);
const RETRY_MAX_MS = 30_000;

const NEWS_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    what_happened: {
      type: "STRING",
      description: "A concise, neutral 3-5 sentence summary of agreed core facts."
    },
    whats_different: {
      type: "STRING",
      description: "A 2-4 sentence comparison of differences in focus, emphasis, or omission."
    },
    keywords: {
      type: "ARRAY",
      description: "One or two representative verbatim phrases per source. Every phrase must appear exactly in the same source sentence of about 40 words or fewer and in the explanation.",
      items: {
        type: "OBJECT",
        properties: {
          source_name: { type: "STRING" },
          bias_label: { type: "STRING" },
          terms: {
            type: "ARRAY",
            description: "One or two short verbatim phrases that appear together in one source sentence of about 40 words or fewer and in the explanation.",
            items: { type: "STRING" }
          },
          explanation: {
            type: "STRING",
            description: "One concise sentence that repeats every listed term verbatim and explains what those exact phrases suggest about this source's stated lean, without claiming they prove accuracy or ideology."
          }
        },
        required: ["source_name", "bias_label", "terms", "explanation"]
      }
    }
  },
  required: ["what_happened", "whats_different", "keywords"]
};

const SUMMARY_SYSTEM_INSTRUCTION =
  "Write a single, concise neutral summary (3-5 sentences) combining the key facts from all provided source excerpts. Do not mention political leaning, do not compare sources against each other, do not generate a 'what's different' section. Just state what happened, drawing on all sources for a complete picture.";

const SUMMARY_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    what_happened: {
      type: "STRING",
      description: "A single concise, neutral 3-5 sentence summary combining the key facts."
    }
  },
  required: ["what_happened"]
};

function readPositiveInteger(name, fallback) {
  const value = Number.parseInt(process.env[name] || "", 10);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function isRetryableStatus(status) {
  return status === 408 || status === 429 || status >= 500;
}

function retryDelayMs(response, failedAttempt) {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter !== null) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;

    const retryDate = Date.parse(retryAfter);
    if (Number.isFinite(retryDate)) return Math.max(0, retryDate - Date.now());
  }

  const exponentialDelay = Math.min(
    RETRY_BASE_MS * 2 ** (failedAttempt - 1),
    RETRY_MAX_MS
  );
  const jitter = 0.8 + Math.random() * 0.4;
  return Math.round(exponentialDelay * jitter);
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function outputPathFor(inputPath) {
  const parsed = path.parse(inputPath);
  return path.join(parsed.dir, `${parsed.name}${OUTPUT_SUFFIX}`);
}

function usesLeanComparison(story) {
  return story.lean_comparison === true;
}

async function findStoryFiles(folderPath) {
  const entries = await readdir(folderPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const entryPath = path.join(folderPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await findStoryFiles(entryPath)));
    } else if (
      entry.isFile() &&
      path.extname(entry.name).toLowerCase() === ".json" &&
      !entry.name.toLowerCase().endsWith(OUTPUT_SUFFIX)
    ) {
      files.push(entryPath);
    }
  }

  return files;
}

function validateStory(story) {
  if (!story || typeof story !== "object" || Array.isArray(story)) {
    throw new Error("the file must contain a JSON object");
  }
  if (typeof story.headline !== "string" || !story.headline.trim()) {
    throw new Error("headline must be a non-empty string");
  }
  if (!Array.isArray(story.topics) || !story.topics.every((topic) => typeof topic === "string")) {
    throw new Error("topics must be an array of strings");
  }
  if (!Array.isArray(story.sources) || story.sources.length < 2 || story.sources.length > 3) {
    throw new Error("sources must contain two or three entries");
  }
  if (typeof story.lean_comparison !== "boolean") {
    throw new Error("lean_comparison must be true or false");
  }
  if (usesLeanComparison(story) && story.sources.length !== 3) {
    throw new Error("lean comparison stories must contain exactly three sources");
  }

  const sourceIds = new Set();
  story.sources.forEach((source, index) => {
    if (typeof source.source_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(source.source_id)) {
      throw new Error(`source ${index + 1} needs a valid source_id`);
    }
    if (sourceIds.has(source.source_id)) throw new Error("source_id values must be unique within a story");
    sourceIds.add(source.source_id);
    const sourceName = source?.source_name || source?.outlet;
    if (typeof sourceName !== "string" || !sourceName.trim()) {
      throw new Error(`source ${index + 1} needs a non-empty outlet or source_name`);
    }
    if (typeof source.excerpt !== "string" || !source.excerpt.trim()) {
      throw new Error(`source ${index + 1} needs a non-empty excerpt`);
    }
    if (source.bias_label != null && typeof source.bias_label !== "string") {
      throw new Error(`source ${index + 1} bias_label must be a string when present`);
    }
    if (
      usesLeanComparison(story) &&
      (typeof source.bias_label !== "string" || !source.bias_label.trim())
    ) {
      throw new Error(
        `source ${index + 1} needs a non-empty bias_label when lean_comparison is true`
      );
    }
  });

  if (usesLeanComparison(story)) {
    const labels = story.sources.map((source) => source.bias_label.trim().toLowerCase());
    const requiredLabels = ["left", "center", "right"];
    if (
      new Set(labels).size !== requiredLabels.length ||
      !requiredLabels.every((label) => labels.includes(label))
    ) {
      throw new Error(
        "lean comparison stories must include exactly one left, one center, and one right source"
      );
    }
  }
}

async function ensureSourceIds(story, inputPath) {
  if (!story || typeof story !== "object" || !Array.isArray(story.sources)) return false;
  let changed = false;
  for (const source of story.sources) {
    if (typeof source.source_id !== "string" || !source.source_id.trim()) {
      source.source_id = randomUUID();
      changed = true;
    }
  }
  if (changed) await writeFile(inputPath, `${JSON.stringify(story, null, 2)}\n`, "utf8");
  return changed;
}

function buildUserPrompt(story) {
  const leanComparison = usesLeanComparison(story);
  const sources = story.sources
    .map((source, index) => {
      const sourceName = source.source_name || source.outlet;
      const biasLine = leanComparison
        ? `\nbias_label: ${source.bias_label}`
        : "";
      return `Source ${index + 1}\nsource_name: ${sourceName}${biasLine}\nexcerpt:\n${source.excerpt}`;
    })
    .join("\n\n---\n\n");

  if (leanComparison) {
    return `Compare the three source excerpts below about one story. Base every statement only on the supplied text. Return the three requested sections in the provided JSON fields. For each keywords item, choose only one or two short verbatim terms from that source. Every selected term for a source must appear together in one complete source sentence of about 40 words or fewer, and must also appear verbatim in the explanation. The explanation must quote every selected term and explain what those exact phrases suggest about the source's supplied bias_label.\n\nHeadline: ${story.headline}\n\n${sources}`;
  }

  return `Base the summary only on the supplied excerpts.\n\nHeadline: ${story.headline}\n\n${sources}`;
}

function buildRequestBody(story) {
  const leanComparison = usesLeanComparison(story);
  return {
    system_instruction: {
      parts: [{ text: leanComparison ? SYSTEM_INSTRUCTION : SUMMARY_SYSTEM_INSTRUCTION }]
    },
    contents: [{ role: "user", parts: [{ text: buildUserPrompt(story) }] }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
      responseSchema: leanComparison ? NEWS_RESPONSE_SCHEMA : SUMMARY_RESPONSE_SCHEMA
    }
  };
}

async function readResponsePayload(response) {
  const body = await response.text();
  try {
    return JSON.parse(body);
  } catch {
    throw new Error(`Gemini returned a non-JSON HTTP response (${response.status}): ${body.slice(0, 300)}`);
  }
}

function describeApiError(response, payload) {
  const apiError = payload.error || {};
  const details = Array.isArray(apiError.details)
    ? apiError.details
        .map((detail) => detail.reason || detail.errorInfo?.reason || detail.message)
        .filter(Boolean)
        .join(", ")
    : "";
  const description = [apiError.status, apiError.message || response.statusText, details]
    .filter(Boolean)
    .join(": ");
  return `Gemini API request failed (${response.status}): ${description}`;
}

function validateGeneratedKeywords(generated, story) {
  if (!Array.isArray(generated.keywords) || generated.keywords.length !== story.sources.length) {
    throw new Error("Gemini output must include one keywords item for every source");
  }
  for (const source of story.sources) {
    const sourceName = source.source_name || source.outlet;
    const item = generated.keywords.find((keyword) =>
      typeof keyword?.source_name === "string" && keyword.source_name.trim().toLowerCase() === sourceName.trim().toLowerCase()
    );
    if (!item || !Array.isArray(item.terms) || item.terms.length < 1 || item.terms.length > 2 ||
      typeof item.explanation !== "string" || !item.explanation.trim()) {
      throw new Error(`Gemini game content is incomplete for ${sourceName}`);
    }
    for (const term of item.terms) {
      if (typeof term !== "string" || !term.trim() ||
        !source.excerpt.toLowerCase().includes(term.trim().toLowerCase()) ||
        !item.explanation.toLowerCase().includes(term.trim().toLowerCase())) {
        throw new Error(`Gemini game term ${JSON.stringify(term)} is not visible and explained for ${sourceName}`);
      }
    }
    const terms = item.terms.map((term) => term.trim().toLowerCase());
    const snippet = typeof source.game_snippet === "string" && source.game_snippet.trim()
      ? source.game_snippet.trim()
      : [...new Intl.Segmenter("en", { granularity: "sentence" }).segment(source.excerpt)]
        .map(({ segment }) => segment.trim())
        .find((sentence) => terms.every((term) => sentence.toLowerCase().includes(term)));
    if (!snippet || snippet.split(/\s+/u).filter(Boolean).length > 40 ||
      !terms.every((term) => snippet.toLowerCase().includes(term))) {
      throw new Error(`Gemini game terms for ${sourceName} must fit together in one complete source sentence of 40 words or fewer`);
    }
  }
}

function extractGenerated(payload, story) {
  const text = payload.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || "")
    .join("")
    .trim();

  if (!text) {
    const reason = payload.promptFeedback?.blockReason || "No text candidate returned";
    throw new Error(`Gemini returned no usable output: ${reason}`);
  }

  let generated;
  try {
    generated = JSON.parse(text);
  } catch {
    throw new Error("Gemini returned text that was not valid JSON");
  }

  if (typeof generated.what_happened !== "string") {
    throw new Error("Gemini output did not match the expected generated fields");
  }

  if (!usesLeanComparison(story)) {
    return { what_happened: generated.what_happened };
  }

  if (
    typeof generated.whats_different !== "string" ||
    !Array.isArray(generated.keywords)
  ) {
    throw new Error("Gemini output did not match the expected news comparison fields");
  }
  validateGeneratedKeywords(generated, story);
  return {
    what_happened: generated.what_happened,
    whats_different: generated.whats_different,
    keywords: generated.keywords
  };
}

async function generateStory(story, apiKey) {
  for (let attempt = 1; attempt <= MAX_API_ATTEMPTS; attempt += 1) {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify(buildRequestBody(story))
    });
    const payload = await readResponsePayload(response);

    if (response.ok) return extractGenerated(payload, story);

    const errorMessage = describeApiError(response, payload);
    if (!isRetryableStatus(response.status) || attempt === MAX_API_ATTEMPTS) {
      throw new Error(errorMessage);
    }

    const delayMs = retryDelayMs(response, attempt);
    console.warn(
      `  Temporary API error (${response.status}); retrying in ${(delayMs / 1_000).toFixed(1)}s ` +
        `(attempt ${attempt + 1}/${MAX_API_ATTEMPTS}).`
    );
    await wait(delayMs);
  }

  throw new Error("Gemini request exhausted all retry attempts");
}

async function hasReviewedOutput(outputPath) {
  try {
    await access(outputPath);
  } catch {
    return false;
  }

  try {
    const output = JSON.parse(await readFile(outputPath, "utf8"));
    return output.reviewed_by_human === true;
  } catch (error) {
    console.warn(`  Warning: existing output is unreadable and will be replaced on success: ${error.message}`);
    return false;
  }
}

async function processFile(inputPath, rootFolder, apiKey, position, total) {
  const relativePath = path.relative(rootFolder, inputPath);
  const outputPath = outputPathFor(inputPath);
  console.log(`[${position}/${total}] ${relativePath}`);

  try {
    const story = JSON.parse(await readFile(inputPath, "utf8"));
    if (await ensureSourceIds(story, inputPath)) console.log("  Added permanent source IDs.");
    validateStory(story);
    if (await hasReviewedOutput(outputPath)) {
      console.log("  Skipped: paired output is already human-reviewed.");
      return "skipped";
    }
    const mode = usesLeanComparison(story) ? "lean comparison" : "neutral summary";
    console.log(`  Generating ${mode} with ${MODEL}...`);
    const generated = await generateStory(story, apiKey);
    const output = {
      id: story.id ?? path.parse(inputPath).name,
      generated,
      reviewed_by_human: false
    };
    await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
    console.log(`  Saved: ${path.relative(rootFolder, outputPath)}`);
    return "generated";
  } catch (error) {
    console.error(`  Failed: ${error.message}`);
    return "failed";
  }
}

async function runBatch(folderPath, apiKey) {
  const rootFolder = path.resolve(folderPath);
  const folderStats = await stat(rootFolder).catch(() => null);
  if (!folderStats?.isDirectory()) {
    throw new Error(`Not a readable folder: ${rootFolder}`);
  }
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set. See README.md for PowerShell setup.");
  }

  const files = await findStoryFiles(rootFolder);
  console.log(`Found ${files.length} story file${files.length === 1 ? "" : "s"} in ${rootFolder}.`);

  const totals = { generated: 0, skipped: 0, failed: 0 };
  for (const [index, inputPath] of files.entries()) {
    const result = await processFile(inputPath, rootFolder, apiKey, index + 1, files.length);
    totals[result] += 1;
  }

  console.log(`Done: ${totals.generated} generated, ${totals.skipped} skipped, ${totals.failed} failed.`);
  return totals;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1) {
    throw new Error("Usage: node generate.js <day-folder>");
  }

  const totals = await runBatch(args[0], process.env.GEMINI_API_KEY);
  if (totals.failed > 0) process.exitCode = 1;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  });
}

export {
  buildRequestBody,
  buildUserPrompt,
  findStoryFiles,
  usesLeanComparison,
  outputPathFor,
  runBatch,
  validateGeneratedKeywords,
  validateStory
};
