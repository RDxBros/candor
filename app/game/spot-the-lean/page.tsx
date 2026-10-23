import Link from "next/link";
import { LeanGameEntry } from "../../../components/lean-game-entry";
import { LeanGameLoader } from "../../../components/lean-game-loader";
import { StreakBadge } from "../../../components/streak-badge";
import { HeaderMenu } from "../../../components/header-menu";
import { resolveContentDay } from "../../../lib/content-day";
import { buildLeanGamePool } from "../../../lib/lean-game-pool";
import { filterStoriesForTopics } from "../../../lib/game-topic-scope";
import { parseSelectedTopics } from "../../../lib/topics";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SearchParams = Promise<{ story?: string | string[]; day?: string | string[]; debug?: string | string[]; mode?: string | string[]; round?: string | string[]; topics?: string | string[]; topic_fallback?: string | string[] }>;

export default async function SpotTheLeanPage({ searchParams }: { searchParams: SearchParams }) {
  const query = await searchParams;
  const requestedDay = Array.isArray(query.day) ? query.day[0] : query.day;
  const currentDay = await resolveContentDay(requestedDay);
  const preferredStoryId = Array.isArray(query.story) ? query.story[0] : query.story;
  const requestedMode = Array.isArray(query.mode) ? query.mode[0] : query.mode;
  const roundToken = Array.isArray(query.round) ? query.round[0] : query.round;
  const mode = requestedMode === "scored" || requestedMode === "practice" ? requestedMode : null;
  const showDebug = process.env.NODE_ENV === "development" && (Array.isArray(query.debug) ? query.debug[0] : query.debug) === "1";
  const interestsHref = requestedDay ? `/?day=${encodeURIComponent(requestedDay)}&edit=1` : "/?edit=1";
  const { cards: allCards, issues: devIssues } = await buildLeanGamePool(currentDay);
  const selectedTopics = parseSelectedTopics(query.topics);
  const topicFallback = (Array.isArray(query.topic_fallback) ? query.topic_fallback[0] : query.topic_fallback) === "1";
  const storyRecords = [...new Map(allCards.map((card) => [card.storyId, { id: card.storyId, category: card.category }])).values()];
  const cards = mode ? filterStoriesForTopics(allCards.map((card) => ({ ...card, id: card.storyId })), selectedTopics, topicFallback) : allCards;

  return (
    <main id="main-content" className={`screen game-screen spot-lean-screen${mode ? "" : " spot-lean-home-screen"}`}>
      <header className="brand-header">
        <div className="brand-cluster">
          <Link className="wordmark" href="/">Candor</Link>
          <StreakBadge />
        </div>
        <nav className="header-actions desktop-header-actions" aria-label="Game navigation">
          <Link className="text-action" href="/game/badges">Badges</Link>
          <Link className="text-action" href="/game">All games</Link>
        </nav>
        <HeaderMenu interestsHref={interestsHref} />
      </header>

      {mode ? <LeanGameLoader key={roundToken ?? `${mode}-current`} cards={cards} currentDay={currentDay} preferredStoryId={preferredStoryId} mode={mode} selectedTopics={selectedTopics} topicFallback={topicFallback} dayOverride={requestedDay} /> :
        <LeanGameEntry stories={storyRecords} preferredStoryId={preferredStoryId} dayOverride={requestedDay} />}
      {showDebug && devIssues.length ? <details className="game-dev-issues">
        <summary>Excluded game excerpts ({devIssues.length})</summary>
        <ul>{devIssues.map((item) => <li key={`${item.id}:${item.issue}`}><code>{item.id}</code>: {item.issue}</li>)}</ul>
      </details> : null}
    </main>
  );
}
