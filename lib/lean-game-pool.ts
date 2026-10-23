import { resolveGameContent, type GameContentIssue } from "./game-content";
import { isAvailableGameDay, isGameStoryEligible, qualifyingStoryExcerpts } from "./lean-game-pool-rules";
import { getAllStories } from "./stories";

export type Lean = "left" | "center" | "right";

export type LeanGameCard = {
  day: string;
  storyId: string;
  category: string;
  sourceId: string;
  headline: string;
  outlet: string;
  biasLabel: Lean;
  excerpt: string;
  gameExcerpt: string;
  explanation: string;
  terms: string[];
};

export type LeanGamePoolIssue = {
  id: string;
  issue: GameContentIssue | "missing-source-id";
};

export function cardsForGameStory(entry: Awaited<ReturnType<typeof getAllStories>>[number], logIssues = true) {
  if (!isGameStoryEligible({
    category: entry.story.category,
    leanComparison: entry.story.lean_comparison,
    gameEligible: entry.story.game_eligible,
    sourceCount: entry.story.sources.length
  })) return { cards: [] as LeanGameCard[], issues: [] as LeanGamePoolIssue[] };

  const keywords = entry.story.generated?.keywords ?? [];
  const issues: LeanGamePoolIssue[] = [];
  const cards = entry.story.sources.flatMap((source) => {
    const bias = source.bias_label?.toLowerCase();
    const keyword = keywords.find((item) => item.source_name.trim().toLowerCase() === source.outlet.trim().toLowerCase());
    const result = keyword ? resolveGameContent({
      keyword,
      outlet: source.outlet,
      sourceExcerpt: source.excerpt,
      gameSnippet: source.game_snippet
    }) : { ok: false as const, issue: "missing-keyword-content" as const };
    const id = `${entry.story.id}:${source.source_id || source.outlet}`;

    if (!source.source_id || (bias !== "left" && bias !== "center" && bias !== "right") || !result.ok) {
      const issue = !source.source_id ? "missing-source-id" : result.ok ? "missing-keyword-content" : result.issue;
      issues.push({ id, issue });
      if (logIssues) console.warn(`[lean-game] Excluding ${id}: ${issue}.`);
      return [];
    }

    return [{
      day: entry.day,
      storyId: entry.story.id,
      category: entry.story.category,
      sourceId: source.source_id,
      headline: entry.story.headline,
      outlet: source.outlet,
      biasLabel: bias,
      excerpt: source.excerpt,
      gameExcerpt: result.gameExcerpt,
      explanation: result.explanation,
      terms: result.terms
    } satisfies LeanGameCard];
  });

  const uniqueCards = new Set(cards.map((card) => card.sourceId)).size === cards.length &&
    new Set(cards.map((card) => card.outlet.trim().toLowerCase())).size === cards.length;
  return { cards: uniqueCards ? qualifyingStoryExcerpts(cards) : [], issues };
}

const loggedPoolCounts = new Set<string>();

export async function buildLeanGamePool(
  currentDay: string,
  options: { logIssues?: boolean; requestBound?: boolean; forceLog?: boolean } = {}
) {
  const entries = await getAllStories({ requestBound: options.requestBound });
  const resolved = entries
    .filter((entry) => isAvailableGameDay(entry.day, currentDay))
    .map((entry) => cardsForGameStory(entry, options.logIssues !== false));
  const cards = resolved.flatMap((entry) => entry.cards);
  const storySizes = new Map<string, number>();
  for (const card of cards) storySizes.set(`${card.day}:${card.storyId}`, (storySizes.get(`${card.day}:${card.storyId}`) ?? 0) + 1);
  const counts = {
    threeExcerptStories: [...storySizes.values()].filter((count) => count === 3).length,
    twoExcerptStories: [...storySizes.values()].filter((count) => count === 2).length
  };
  if (
    process.env.NODE_ENV === "development" &&
    options.logIssues !== false &&
    (options.forceLog || !loggedPoolCounts.has(currentDay))
  ) {
    loggedPoolCounts.add(currentDay);
    console.info(`[lean-game] ${currentDay}: ${counts.threeExcerptStories} stories have 3 usable excerpts; ${counts.twoExcerptStories} stories have 2.`);
  }
  return { cards, issues: resolved.flatMap((entry) => entry.issues), counts };
}
