import Link from "next/link";
import { FactOpinionEntry } from "../../../components/fact-opinion-entry";
import { FactOpinionLoader } from "../../../components/fact-opinion-loader";
import { HeaderMenu } from "../../../components/header-menu";
import { StreakBadge } from "../../../components/streak-badge";
import { resolveContentDay } from "../../../lib/content-day";
import { loadFactOpinionContent } from "../../../lib/fact-opinion-content-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type SearchParams = Promise<{ day?: string | string[]; mode?: string | string[]; story?: string | string[]; round?: string | string[] }>;

export default async function FactOpinionPage({ searchParams }: { searchParams: SearchParams }) {
  const query = await searchParams;
  const requestedDay = Array.isArray(query.day) ? query.day[0] : query.day;
  const currentDay = await resolveContentDay(requestedDay);
  const requestedMode = Array.isArray(query.mode) ? query.mode[0] : query.mode;
  const mode = requestedMode === "scored" || requestedMode === "practice" ? requestedMode : null;
  const selectedStoryId = Array.isArray(query.story) ? query.story[0] : query.story;
  const { rounds, stories } = await loadFactOpinionContent(currentDay);
  const selectedStory = stories.find((story) => story.id === selectedStoryId);
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
    /> : <FactOpinionEntry rounds={rounds} stories={stories} currentDay={currentDay} />}
  </main>;
}
