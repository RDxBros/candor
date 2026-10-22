import { randomUUID } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.argv[2] ?? "stories");
const mappingPath = path.resolve(process.argv[3] ?? path.join("supabase", "source-id-map.json"));
const mapping = new Map();
const knownSourceIds = new Map();
let changedFiles = 0;

async function filesIn(folder) {
  const entries = await readdir(folder, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(folder, entry.name);
    if (entry.isDirectory()) files.push(...await filesIn(target));
    else if (entry.isFile() && entry.name.endsWith(".json") && !entry.name.endsWith("_output.json")) files.push(target);
  }
  return files.sort();
}

for (const file of await filesIn(root)) {
  const story = JSON.parse(await readFile(file, "utf8"));
  if (!Array.isArray(story.sources)) continue;
  const storyId = typeof story.id === "string" && story.id.trim()
    ? story.id.trim()
    : `${path.basename(path.dirname(file))}-${path.parse(file).name}`;
  let changed = false;
  for (const source of story.sources) {
    if (!source.source_id) {
      source.source_id = randomUUID();
      changed = true;
    }
    const sourceKey = String(source.outlet ?? source.source_name ?? "").trim().toLowerCase();
    const identityKey = `${storyId}\u0000${sourceKey}`;
    const knownId = knownSourceIds.get(identityKey);
    if (knownId && knownId !== source.source_id) {
      source.source_id = knownId;
      changed = true;
    } else if (!knownId) {
      knownSourceIds.set(identityKey, source.source_id);
    }
    mapping.set(identityKey, {
      story_id: storyId,
      source_key: sourceKey,
      source_id: source.source_id
    });
  }
  if (changed) {
    await writeFile(file, `${JSON.stringify(story, null, 2)}\n`, "utf8");
    changedFiles += 1;
  }
}

const rows = [...mapping.values()];
await writeFile(mappingPath, `${JSON.stringify(rows, null, 2)}\n`, "utf8");
console.log(`Updated ${changedFiles} story files. Wrote ${rows.length} mappings to ${mappingPath}.`);
