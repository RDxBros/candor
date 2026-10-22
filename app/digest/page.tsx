import Link from "next/link";
import { DigestClient } from "../../components/digest-client";
import { getStories } from "../../lib/stories";
import { parseSelectedTopics } from "../../lib/topics";
import { StreakBadge } from "../../components/streak-badge";
import { HeaderMenu } from "../../components/header-menu";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SearchParams = Promise<{
  day?: string | string[];
  topics?: string | string[];
  extra?: string | string[];
}>;

export default async function DigestPage({ searchParams }: { searchParams: SearchParams }) {
  const query = await searchParams;
  const requestedDay = Array.isArray(query.day) ? query.day[0] : query.day;
  const selected = parseSelectedTopics(query.topics);
  const includeExtras = (Array.isArray(query.extra) ? query.extra[0] : query.extra) === "1";
  const { day, stories } = await getStories(requestedDay);
  const filtered = stories.filter((story) => selected.includes(story.category));
  const extraStories = stories.filter((story) => !selected.includes(story.category)).slice(0, 5);
  const digestStories = filtered.map(({ id, headline, category }) => ({ id, headline, category }));
  const digestExtras = extraStories.map(({ id, headline, category }) => ({ id, headline, category }));
  const interestsHref = day === "day1" ? "/?edit=1" : `/?day=${day}&edit=1`;

  return (
    <main id="main-content" className="screen digest-screen">
      <header className="brand-header digest-header">
        <div className="brand-cluster"><Link className="wordmark" href="/">Candor</Link><StreakBadge /></div>
        <nav className="header-actions desktop-header-actions" aria-label="Digest actions">
          <Link className="text-action" href="/game/badges">Badges</Link>
          <Link className="text-action" href="/game">Games</Link>
          <Link className="text-action" href={interestsHref}>Edit interests</Link>
        </nav>
        <HeaderMenu interestsHref={interestsHref} />
      </header>

      <section className="digest-intro">
        <h1>Today&apos;s drop</h1>
      </section>

      {selected.length === 0 ? (
        <section className="empty-state">
          <h2>Choose your interests first</h2>
          <p>Your digest will appear here once you select at least two topics.</p>
          <Link className="primary-button inline-button" href={interestsHref}>
            Choose interests
          </Link>
        </section>
      ) : filtered.length === 0 ? (
        <section className="empty-state">
          <h2>No stories yet</h2>
          <p>There are no stories for your selected interests in this day’s folder.</p>
        </section>
      ) : (
        <DigestClient
          day={day}
          selected={selected}
          stories={digestStories}
          extraStories={digestExtras}
          includeExtras={includeExtras}
        />
      )}
    </main>
  );
}

