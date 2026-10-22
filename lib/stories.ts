import { promises as fs } from "node:fs";
import path from "node:path";
import { connection } from "next/server";
import { resolveContentDay } from "./content-day";
import { isTopicValue, type TopicValue } from "./topics";

export type StorySource = {
  source_id: string;
  outlet: string;
  bias_label?: string;
  excerpt: string;
  url?: string;
  game_snippet?: string;
};

export type GeneratedContent = {
  what_happened?: string;
  whats_different?: string;
  keywords?: Array<{
    source_name: string;
    bias_label: string;
    terms: string[];
    game_excerpt?: string;
    explanation?: string;
  }>;
};

export type Story = {
  id: string;
  date: string;
  topics: string[];
  lean_comparison: boolean;
  game_eligible?: boolean;
  headline: string;
  sources: StorySource[];
  category: TopicValue;
  generated: GeneratedContent | null;
};

type StoryFile = Omit<Story, "category" | "generated">;

const jsonCache = new Map<string, { mtimeMs: number; size: number; value: unknown }>();

async function readJsonCached(file: string) {
  const stats = await fs.stat(file);
  const cached = jsonCache.get(file);
  if (cached && cached.mtimeMs === stats.mtimeMs && cached.size === stats.size) return cached.value;
  const value = JSON.parse(await fs.readFile(file, "utf8"));
  jsonCache.set(file, { mtimeMs: stats.mtimeMs, size: stats.size, value });
  return value;
}

async function collectJsonFiles(folder: string): Promise<string[]> {
  let entries;
  try {
    entries = await fs.readdir(folder, { withFileTypes: true });
  } catch {
    return [];
  }

  const files: string[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const entryPath = path.join(folder, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectJsonFiles(entryPath)));
    } else if (
      entry.isFile() &&
      entry.name.toLowerCase().endsWith(".json") &&
      !entry.name.toLowerCase().endsWith("_output.json")
    ) {
      files.push(entryPath);
    }
  }
  return files;
}

async function readGenerated(inputPath: string): Promise<GeneratedContent | null> {
  const parsed = path.parse(inputPath);
  const outputPath = path.join(parsed.dir, `${parsed.name}_output.json`);
  try {
    const output = await readJsonCached(outputPath) as Record<string, unknown>;
    const generated = output.generated ?? output;
    if (!generated || typeof generated !== "object" || typeof (generated as GeneratedContent).what_happened !== "string") return null;
    const content = generated as GeneratedContent;
    return {
      what_happened: content.what_happened,
      whats_different:
        typeof content.whats_different === "string" ? content.whats_different : undefined,
      keywords: Array.isArray(content.keywords)
        ? content.keywords.filter((item) =>
          item && typeof item.source_name === "string" && typeof item.bias_label === "string" &&
          Array.isArray(item.terms) && item.terms.every((term) => typeof term === "string")
        ).map((item) => ({
          ...item,
          game_excerpt: typeof item.game_excerpt === "string" ? item.game_excerpt : undefined,
          explanation: typeof item.explanation === "string" ? item.explanation : undefined
        }))
        : undefined
    };
  } catch {
    return null;
  }
}

async function hydrateStory(file: string): Promise<Story | null> {
  const raw = await readJsonCached(file) as StoryFile;
  const categoryName = path.basename(path.dirname(file));
  if (!isTopicValue(categoryName) || !raw.headline || !Array.isArray(raw.sources)) return null;

  return {
    id: raw.id?.trim() || `${categoryName}-${path.parse(file).name}`,
    date: raw.date,
    topics: Array.isArray(raw.topics) ? raw.topics : [],
    lean_comparison: raw.lean_comparison === true,
    game_eligible: typeof raw.game_eligible === "boolean" ? raw.game_eligible : undefined,
    headline: raw.headline,
    sources: raw.sources,
    category: categoryName,
    generated: await readGenerated(file)
  };
}

export async function getStories(dayOverride?: string): Promise<{ day: string; stories: Story[] }> {
  await connection();
  const day = await resolveContentDay(dayOverride);
  const dayFolder = path.join(process.cwd(), "stories", day);
  const files = await collectJsonFiles(dayFolder);
  const stories: Story[] = [];

  for (const file of files) {
    try {
      const story = await hydrateStory(file);
      if (story) stories.push(story);
    } catch (error) {
      console.error(`Skipping malformed story file ${file}:`, error);
    }
  }

  stories.sort((a, b) => a.category.localeCompare(b.category) || a.headline.localeCompare(b.headline));
  return { day, stories };
}

export async function getAllStories(
  options: { requestBound?: boolean } = {}
): Promise<Array<{ day: string; story: Story }>> {
  if (options.requestBound !== false) await connection();
  const storiesRoot = path.join(process.cwd(), "stories");
  let entries;
  try {
    entries = await fs.readdir(storiesRoot, { withFileTypes: true });
  } catch {
    return [];
  }

  const results: Array<{ day: string; story: Story }> = [];
  const dayFolders = entries
    .filter((entry) => entry.isDirectory() && /^day[\w-]+$/i.test(entry.name))
    .sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true }));

  for (const entry of dayFolders) {
    const files = await collectJsonFiles(path.join(storiesRoot, entry.name));
    for (const file of files) {
      try {
        const story = await hydrateStory(file);
        if (story) results.push({ day: entry.name, story });
      } catch (error) {
        console.error(`Skipping malformed story file ${file}:`, error);
      }
    }
  }

  return results;
}

export async function getStory(id: string, dayOverride?: string) {
  await connection();
  const day = await resolveContentDay(dayOverride);
  const files = await collectJsonFiles(path.join(process.cwd(), "stories", day));

  for (const file of files) {
    try {
      const raw = await readJsonCached(file) as StoryFile;
      const categoryName = path.basename(path.dirname(file));
      const candidateId = raw.id?.trim() || `${categoryName}-${path.parse(file).name}`;
      if (candidateId !== id) continue;
      return { day, story: await hydrateStory(file) };
    } catch (error) {
      console.error(`Skipping malformed story file ${file}:`, error);
    }
  }

  return { day, story: null };
}
