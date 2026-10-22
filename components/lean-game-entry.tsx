"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getOrCreateAnonymousId, readLocalGameAttempts } from "../lib/client-storage";
import { LEAN_GAME_CONFIG } from "../lib/config";
import { GameEntryShell } from "./game-entry-shell";
import { SpotLeanPreview } from "./spot-lean-preview";
import { track } from "../lib/analytics";

type ScoredAttempt = {
  story_id: string;
  source_id?: string;
  source_key: string;
  is_correct: boolean;
};

function attemptKey(attempt: ScoredAttempt) {
  return `${attempt.story_id}:${attempt.source_id ?? attempt.source_key}`;
}

export function LeanGameEntry({ storyIds, currentDay, preferredStoryId }: {
  storyIds: string[];
  currentDay: string;
  preferredStoryId?: string;
}) {
  const [playedStoryIds, setPlayedStoryIds] = useState<Set<string> | null>(null);
  const [scoreSummary, setScoreSummary] = useState<{ correct: number; total: number } | null>(null);

  useEffect(() => { track("screen_viewed", { screen: "game_home", game_type: "lean_guess" }); }, []);

  useEffect(() => {
    let cancelled = false;
    const anonymousId = getOrCreateAnonymousId();
    async function loadProgress() {
      const played = new Set<string>();
      for (const storyId of storyIds) {
        if (readLocalGameAttempts(storyId).length) played.add(storyId);
      }
      let remoteAttempts: ScoredAttempt[] = [];
      if (anonymousId) {
        const remote = await Promise.all(storyIds.map(async (storyId) => {
          try {
            const response = await fetch(`/api/game-attempts?anonymous_id=${encodeURIComponent(anonymousId)}&story_id=${encodeURIComponent(storyId)}`, { cache: "no-store" });
            if (!response.ok) return [] as ScoredAttempt[];
            const payload = await response.json() as { attempts?: ScoredAttempt[] };
            return payload.attempts ?? [];
          } catch { return [] as ScoredAttempt[]; }
        }));
        remoteAttempts = remote.flat();
        remoteAttempts.forEach((attempt) => played.add(attempt.story_id));
      }
      if (!cancelled) {
        const uniqueAttempts = [...new Map(remoteAttempts.map((attempt) => [attemptKey(attempt), attempt])).values()];
        setPlayedStoryIds(played);
        setScoreSummary({
          correct: uniqueAttempts.filter((attempt) => attempt.is_correct).length,
          total: uniqueAttempts.length
        });
      }
    }
    void loadProgress();
    return () => { cancelled = true; };
  }, [storyIds]);

  const baseParams = useMemo(() => {
    const params = new URLSearchParams({ day: currentDay });
    if (preferredStoryId) params.set("story", preferredStoryId);
    return params;
  }, [currentDay, preferredStoryId]);
  const scoredHref = `/game/spot-the-lean?${new URLSearchParams([...baseParams, ["mode", "scored"]]).toString()}`;
  const practiceHref = `/game/spot-the-lean?${new URLSearchParams([...baseParams, ["mode", "practice"]]).toString()}`;
  const remaining = playedStoryIds === null ? null : storyIds.filter((storyId) => !playedStoryIds.has(storyId)).length;
  const poolEmpty = storyIds.length === 0;
  const showStats = Boolean(scoreSummary && scoreSummary.total >= LEAN_GAME_CONFIG.stats_min_answers);
  const accuracy = showStats && scoreSummary ? Math.round((scoreSummary.correct / scoreSummary.total) * 100) : null;

  const stats = showStats && scoreSummary ? <p className="lean-entry-stats" aria-label={`${accuracy}% accuracy across ${scoreSummary.total} scored answers`}>
      <strong>{accuracy}% accuracy</strong><span aria-hidden="true">·</span><span>{scoreSummary.total} scored answers</span>
    </p> : null;
  const action = poolEmpty ? <div className="empty-state lean-entry-empty">
      <h2>No eligible stories yet</h2>
      <p>Stories will appear here when their framing and keyword data are ready.</p>
    </div> : remaining === 0 ? <div className="lean-entry-action lean-entry-exhausted">
      <h2>You&apos;ve played every scored story</h2>
      <Link className="primary-button" href={practiceHref}>Practice</Link>
      <p>Practice rounds don&apos;t count toward stats.</p>
    </div> : <div className="lean-entry-action">
      <div className="lean-play-cta">
        <Link className="primary-button" aria-disabled={remaining === null} href={scoredHref}>Play</Link>
      </div>
      <p className="lean-stories-remaining">{remaining === null ? "Checking new stories…" : remaining === 1 ? "1 new story left" : `${remaining} new stories left`}</p>
      <Link className="lean-practice-link" href={practiceHref}>Just practicing? Try an unscored round.</Link>
    </div>;
  return <GameEntryShell
    title="Spot the Lean"
    hook="Read the excerpts, guess the outlet's lean, then see what gave it away."
    stats={stats}
    preview={<SpotLeanPreview />}
    action={action}
    steps={[
      { label: "Read an excerpt" },
      { label: "Swipe or tap Left, Center or Right", cues: <span className="lean-direction-cues" aria-hidden="true"><span>← Left</span><span>↑ Center</span><span>Right →</span></span> },
      { label: "See which outlets they were and what gave them away" }
    ]}
  />;
}
