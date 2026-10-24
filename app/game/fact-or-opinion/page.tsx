import Link from "next/link";
import { FactOpinionEntry } from "../../../components/fact-opinion-entry";
import { FactOpinionLoader } from "../../../components/fact-opinion-loader";
import { HeaderMenu } from "../../../components/header-menu";
import { StreakBadge } from "../../../components/streak-badge";
import { resolveContentDay } from "../../../lib/content-day";
import { loadFactOpinionContent } from "../../../lib/fact-opinion-content-server";
import { filterStoriesForTopics } from "../../../lib/game-topic-scope";
import { parseSelectedTopics } from "../../../lib/topics";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type SearchParams = Promise<{ day?: string | string[]; mode?: string | string[]; story?: string | string[]; round?: string | string[]; pick?: string | string[]; topics?: string | string[]; topic_fallback?: string | string[] }>;

export default async function FactOpinionPage({ searchParams }: { searchParams: SearchParams }) {
  const query = await searchParams;
  const requestedDay = Array.isArray(query.day) ? query.day[0] : query.day;
  const currentDay = await resolveContentDay(requestedDay);
  const requestedMode = Array.isArray(query.mode) ? query.mode[0] : query.mode;
  const mode = requestedMode === "scored" || requestedMode === "practice" ? requestedMode : null;
  const requestedPickerMode = Array.isArray(query.pick) ? query.pick[0] : query.pick;
  const initialPickerMode = requestedPickerMode === "scored" || requestedPickerMode === "practice" ? requestedPickerMode : undefined;
  const selectedStoryId = Array.isArray(query.story) ? query.story[0] : query.story;
  const { rounds, stories } = await loadFactOpinionContent(currentDay);
  const selectedTopics = parseSelectedTopics(query.topics);
  const topicFallback = (Array.isArray(query.topic_fallback) ? query.topic_fallback[0] : query.topic_fallback) === "1";
  const scopedStories = mode ? filterStoriesForTopics(stories, selectedTopics, topicFallback) : stories;
  const selectedStory = scopedStories.find((story) => story.id === selectedStoryId);
  const selectedRounds = selectedStory ? rounds.filter((round) => round.story_id === selectedStory.id) : [];

  const isPlaying = Boolean(mode && selectedStory);
  return <main id="main-content" className={`screen game-screen fact-opinion-screen${isPlaying ? " fact-opinion-round-screen" : ""}`}>
    {!isPlaying ? <header className="brand-header">
      <div className="brand-cluster"><Link className="wordmark" href="/">Candor</Link><StreakBadge /></div>
      <nav className="header-actions desktop-header-actions" aria-label="Game navigation">
        <Link className="text-action" href="/game/badges">Badges</Link>
        <Link className="text-action" href="/game">All games</Link>
      </nav>
      <HeaderMenu />
    </header> : null}
    {mode && selectedStory ? <FactOpinionLoader
      key={`${mode}-${selectedStory.id}-${Array.isArray(query.round) ? query.round[0] : query.round ?? "current"}`}
      rounds={selectedRounds}
      story={selectedStory}
      currentDay={currentDay}
      mode={mode}
      selectedTopics={selectedTopics}
      topicFallback={topicFallback}
      dayOverride={requestedDay}
    /> : <FactOpinionEntry rounds={rounds} stories={stories} dayOverride={requestedDay} initialPickerMode={initialPickerMode} />}
  </main>;
}
