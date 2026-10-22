"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { localDateKey, readReadingStats, type ReadingStats } from "../lib/client-storage";
import { StreakBadge } from "./streak-badge";
import { HeaderMenu } from "./header-menu";
import { track } from "../lib/analytics";

type CompletionClientProps = {
  day: string;
  topics: string;
  requiredStoryIds: string[];
  extraCount: number;
  extrasAlreadyIncluded: boolean;
};

export function CompletionClient({ day, topics, requiredStoryIds, extraCount, extrasAlreadyIncluded }: CompletionClientProps) {
  const router = useRouter();
  const [stats, setStats] = useState<ReadingStats | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    const refreshStats = () => {
      const next = readReadingStats();
      const readIds = next.readByDate[localDateKey()] ?? [];
      if (!requiredStoryIds.every((id) => readIds.includes(id))) {
        const params = new URLSearchParams({ topics });
        if (day !== "day1") params.set("day", day);
        if (extrasAlreadyIncluded) params.set("extra", "1");
        router.replace(`/digest?${params.toString()}`);
        return;
      }
      setStats(next);
    };
    refreshStats();
    window.addEventListener("candor:reading-updated", refreshStats);
    return () => window.removeEventListener("candor:reading-updated", refreshStats);
  }, [day, extrasAlreadyIncluded, requiredStoryIds, router, topics]);

  const readToday = stats?.readByDate[localDateKey()]?.length ?? 0;
  const interestsHref = day === "day1" ? "/?edit=1" : `/?day=${day}&edit=1`;
  function unlockExtras() {
    track("extend_tapped", { confirmed: true });
    const params = new URLSearchParams({ topics, extra: "1" });
    if (day !== "day1") params.set("day", day);
    router.push(`/digest?${params.toString()}`);
  }

  if (!stats) return <main id="main-content" className="screen">
    <header className="brand-header">
      <Link className="wordmark" href="/">Candor</Link>
      <nav className="header-actions desktop-header-actions" aria-label="Main navigation">
        <Link className="text-action" href="/game/badges">Badges</Link>
        <Link className="text-action" href="/game">Games</Link>
      </nav>
      <HeaderMenu interestsHref={interestsHref} />
    </header>
    <section className="centered-state"><p className="muted-copy">Checking today’s progress…</p></section>
  </main>;

  return (
    <main id="main-content" className="screen completion-screen">
      <header className="brand-header">
        <div className="brand-cluster"><Link className="wordmark" href="/">Candor</Link><StreakBadge /></div>
        <nav className="header-actions desktop-header-actions" aria-label="Main navigation">
          <Link className="text-action" href="/game/badges">Badges</Link>
          <Link className="text-action" href="/game">Games</Link>
        </nav>
        <HeaderMenu interestsHref={interestsHref} />
      </header>
      <section className="completion-copy">
        <p className="date-line">{day.replace(/^day/i, "Day ")}</p>
        <h1>You’re caught up</h1>
      </section>

      <dl className="completion-stats">
        <div><dt>Current streak</dt><dd>{stats.streak} {stats.streak === 1 ? "day" : "days"}</dd></div>
        <div>
          <dt>Streak freeze</dt>
          <dd>{stats.freezesAvailable} available</dd>
        </div>
        <div><dt>Read today</dt><dd>{readToday}</dd></div>
        <div><dt>All-time reads</dt><dd>{Math.max(stats.totalStoriesRead, readToday)}</dd></div>
      </dl>

      {!extrasAlreadyIncluded && extraCount > 0 ? (
        <section className="extra-gate">
          {!confirming ? (
            <button className="secondary-button" type="button" onClick={() => { track("extend_tapped", { confirmed: false }); setConfirming(true); }}>
              Read up to {Math.min(5, extraCount)} more
            </button>
          ) : (
            <div className="extra-confirm" role="group" aria-label="Confirm extra stories">
              <p>These are outside your selected interests. Add them to today’s reading?</p>
              <button className="primary-button" type="button" onClick={unlockExtras}>Yes, show me more</button>
              <button className="text-button" type="button" onClick={() => setConfirming(false)}>Not today</button>
            </div>
          )}
        </section>
      ) : null}

      <div className="completion-actions">
        <Link className="text-action" href="/?edit=1">Adjust tomorrow’s interests</Link>
      </div>
    </main>
  );
}
