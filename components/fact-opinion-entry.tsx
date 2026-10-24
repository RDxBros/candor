"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FACT_OPINION_CONFIG } from "../lib/config";
import { getOrCreateAnonymousId, STORAGE_KEYS } from "../lib/client-storage";
import type { FactOpinionRound, FactOpinionStoryOption } from "../lib/fact-opinion-content";
import { orderedFactOpinionStories } from "../lib/fact-opinion-game";
import { normalizeGameTopics, scopeGameStories, topicFallbackNotice } from "../lib/game-topic-scope";
import { topicLabel, type TopicValue } from "../lib/topics";
import { ArrowIcon, BackIcon, CheckIcon } from "./app-icons";
import { GameEntryShell } from "./game-entry-shell";
import { FactOpinionPreview } from "./fact-opinion-preview";
import { track } from "../lib/analytics";

type Attempt = { content_round_id: string; is_correct: boolean };
type PickerMode = "scored" | "practice";

export function FactOpinionEntry({ rounds, stories, dayOverride, initialPickerMode }: {
  rounds: FactOpinionRound[];
  stories: FactOpinionStoryOption[];
  dayOverride?: string;
  initialPickerMode?: PickerMode;
}) {
  const [attempts, setAttempts] = useState<Attempt[] | null>(null);
  const [pickerMode, setPickerMode] = useState<PickerMode | null>(initialPickerMode ?? null);
  const [visibleCount, setVisibleCount] = useState<number>(FACT_OPINION_CONFIG.picker_page_size);
  const [selectedTopics, setSelectedTopics] = useState<TopicValue[] | null>(null);

  useEffect(() => { track("screen_viewed", { screen: pickerMode ? "game_picker" : "game_home", game_type: "fact_opinion" }); }, [pickerMode]);

  useEffect(() => {
    try {
      setSelectedTopics(normalizeGameTopics(JSON.parse(localStorage.getItem(STORAGE_KEYS.topics) ?? "[]")));
    } catch {
      setSelectedTopics([]);
    }
  }, []);

  useEffect(() => {
    const anonymousId = getOrCreateAnonymousId();
    if (!anonymousId) { setAttempts([]); return; }
    void fetch(`/api/fact-opinion/attempts?anonymous_id=${encodeURIComponent(anonymousId)}`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`Progress failed with ${response.status}`)))
      .then((payload: { attempts?: Attempt[] }) => setAttempts(payload.attempts ?? []))
      .catch((error) => { console.error("Unable to load Fact or Opinion progress:", error); setAttempts([]); });
  }, []);

  const played = useMemo(() => new Set((attempts ?? []).map((attempt) => attempt.content_round_id)), [attempts]);
  const storyPlayed = (story: FactOpinionStoryOption) => story.roundIds.every((roundId) => played.has(roundId));
  const playedStoryIds = new Set(stories.filter(storyPlayed).map((story) => story.id));
  const scoredScope = selectedTopics === null ? null : scopeGameStories({ stories, selectedTopics, playedStoryIds, mode: "scored" });
  const practiceScope = selectedTopics === null ? null : scopeGameStories({ stories, selectedTopics, playedStoryIds, mode: "practice" });
  const pickerScope = pickerMode === "practice" ? practiceScope : scoredScope;
  const remainingStories = attempts === null || selectedTopics === null
    ? null
    : (scoredScope?.stories ?? []).filter((story) => !storyPlayed(story)).length;
  const total = attempts?.length ?? 0;
  const correct = attempts?.filter((attempt) => attempt.is_correct).length ?? 0;
  const accuracy = total ? Math.round((correct / total) * 100) : 0;
  const orderedStories = orderedFactOpinionStories(pickerScope?.stories ?? [], played);
  const visibleStories = orderedStories.slice(0, visibleCount);
  const fallbackCopy = topicFallbackNotice(pickerScope?.reason ?? scoredScope?.reason ?? null);

  function openPicker(nextMode: PickerMode) {
    setVisibleCount(FACT_OPINION_CONFIG.picker_page_size);
    setPickerMode(nextMode);
  }

  function gameHref(story: FactOpinionStoryOption, requestedMode: PickerMode) {
    const actualMode = requestedMode === "scored" && storyPlayed(story) ? "practice" : requestedMode;
    const params = new URLSearchParams({ mode: actualMode, story: story.id });
    if (dayOverride) params.set("day", dayOverride);
    if (selectedTopics?.length) params.set("topics", selectedTopics.join(","));
    if (pickerScope?.topicFallback) params.set("topic_fallback", "1");
    return `/game/fact-or-opinion?${params}`;
  }

  if (pickerMode) return <section className="fact-opinion-picker" aria-labelledby="fact-opinion-picker-title">
    <button className="fact-opinion-picker-back" type="button" onClick={() => setPickerMode(null)}>
      <BackIcon /><span>Back</span>
    </button>
    <h1 id="fact-opinion-picker-title">Pick a story</h1>
    {fallbackCopy ? <p className="muted-copy game-topic-fallback">{fallbackCopy}</p> : null}
    {pickerMode === "practice" ? <p className="fact-opinion-picker-note">Practice rounds don&apos;t count toward your stats.</p> : null}
    <ul className="fact-opinion-story-list">
      {visibleStories.map((story) => {
        const isPlayed = attempts !== null && storyPlayed(story);
        return <li key={story.id}>
          <Link className="fact-opinion-story-row" href={gameHref(story, pickerMode)}>
            <span className="fact-opinion-story-accent" aria-hidden="true" />
            <span className="fact-opinion-story-copy">
              <span className="fact-opinion-category">{topicLabel(story.category)}</span>
              <strong>{story.headline}</strong>
            </span>
            <span className={`fact-opinion-status-chip${isPlayed ? " is-played" : ""}`}>
              {isPlayed ? <><CheckIcon />Played</> : "New"}
            </span>
            <ArrowIcon className="fact-opinion-story-arrow" />
          </Link>
        </li>;
      })}
    </ul>
    {visibleCount < orderedStories.length ? <button
      className="secondary-button fact-opinion-show-more"
      type="button"
      onClick={() => setVisibleCount((count) => count + FACT_OPINION_CONFIG.picker_page_size)}
    >Show more</button> : null}
  </section>;

  const stats = total >= FACT_OPINION_CONFIG.stats_min_answers ? <p className="lean-entry-stats" aria-label={`${accuracy}% Fact or Opinion accuracy across ${total} scored answers`}>
    <strong>{accuracy}% accuracy</strong><span aria-hidden="true">·</span><span>{total} scored answers</span>
  </p> : null;
  const poolEmpty = !rounds.length || !stories.length;
  const action = poolEmpty ? <div className="empty-state lean-entry-empty">
    <h2>No reviewed rounds yet</h2>
    <p>Fact or Opinion rounds will appear here after their content is reviewed.</p>
  </div> : remainingStories === 0 ? <div className="lean-entry-action lean-entry-exhausted">
    <h2>You&apos;ve played every scored story</h2>
    <button className="primary-button" type="button" onClick={() => openPicker("practice")}>Practice</button>
    <p>Practice rounds don&apos;t count toward your stats.</p>
  </div> : <div className="lean-entry-action">
    {fallbackCopy ? <p className="muted-copy game-topic-fallback">{fallbackCopy}</p> : null}
    <div className="lean-play-cta">
      <button className="primary-button" type="button" disabled={remainingStories === null} onClick={() => openPicker("scored")}>Play</button>
    </div>
    <p className="lean-stories-remaining">{remainingStories === null ? "Checking new stories…" : remainingStories === 1 ? "1 new story left" : `${remainingStories} new stories left`}</p>
    <button className="lean-practice-link fact-opinion-practice-link" type="button" onClick={() => openPicker("practice")}>Just practicing? Try an unscored round.</button>
  </div>;

  return <GameEntryShell
    title={FACT_OPINION_CONFIG.title}
    hook={FACT_OPINION_CONFIG.hook}
    stats={stats}
    preview={<FactOpinionPreview />}
    action={action}
    steps={[
      { label: "Read a sentence" },
      { label: "Drag or tap Fact or Opinion" },
      { label: "Check your answers" }
    ]}
  />;
}
