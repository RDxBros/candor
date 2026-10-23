"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getOrCreateAnonymousId, readLocalGameAttempts, STORAGE_KEYS } from "../lib/client-storage";
import { LEAN_GAME_CONFIG } from "../lib/config";
import { normalizeGameTopics, scopeGameStories, topicFallbackNotice } from "../lib/game-topic-scope";
import type { TopicValue } from "../lib/topics";
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

export function LeanGameEntry({ stories, preferredStoryId, dayOverride }: {
  stories: Array<{ id: string; category: string }>;
  preferredStoryId?: string;
  dayOverride?: string;
}) {
  const [playedStoryIds, setPlayedStoryIds] = useState<Set<string> | null>(null);
  const [scoreSummary, setScoreSummary] = useState<{ correct: number; total: number } | null>(null);
  const [selectedTopics, setSelectedTopics] = useState<TopicValue[] | null>(null);
  const storyIds = useMemo(() => stories.map((story) => story.id), [stories]);

  useEffect(() => { track("screen_viewed", { screen: "game_home", game_type: "lean_guess" }); }, []);

  useEffect(() => {
    try {
      setSelectedTopics(normalizeGameTopics(JSON.parse(localStorage.getItem(STORAGE_KEYS.topics) ?? "[]")));
    } catch {
      setSelectedTopics([]);
    }
  }, []);

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

  const played = playedStoryIds ?? new Set<string>();
  const scoredScope = selectedTopics === null ? null : scopeGameStories({ stories, selectedTopics, playedStoryIds: played, mode: "scored" });
  const practiceScope = selectedTopics === null ? null : scopeGameStories({ stories, selectedTopics, playedStoryIds: played, mode: "practice" });
  const scopedStoryIds = scoredScope?.stories.map((story) => story.id) ?? [];
  const practiceStoryIds = practiceScope?.stories.map((story) => story.id) ?? [];

  function gameHref(mode: "scored" | "practice", ids: string[], topicFallback: boolean) {
    const params = new URLSearchParams({ mode });
    if (dayOverride) params.set("day", dayOverride);
    if (selectedTopics?.length) params.set("topics", selectedTopics.join(","));
    if (topicFallback) params.set("topic_fallback", "1");
    if (preferredStoryId && ids.includes(preferredStoryId)) params.set("story", preferredStoryId);
    return `/game/spot-the-lean?${params.toString()}`;
  }

  const scoredHref = gameHref("scored", scopedStoryIds, scoredScope?.topicFallback ?? false);
  const practiceHref = gameHref("practice", practiceStoryIds, practiceScope?.topicFallback ?? false);
  const remaining = playedStoryIds === null || selectedTopics === null
    ? null
    : scopedStoryIds.filter((storyId) => !playedStoryIds.has(storyId)).length;
  const poolEmpty = stories.length === 0;
  const fallbackCopy = topicFallbackNotice(scoredScope?.reason ?? null);
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
      {fallbackCopy ? <p className="muted-copy game-topic-fallback">{fallbackCopy}</p> : null}
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
