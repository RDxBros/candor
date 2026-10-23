"use client";

import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { automaticGuessTransition, resumeLockedStory, storySegment } from "../lib/lean-game-flow";
import { buildPracticeStoryRound, buildStoryRound, roundUsesEveryAvailableExcerpt, type StoredSourceOrders } from "../lib/lean-game-rounds";
import type { Lean, LeanGameCard } from "../lib/lean-game-pool";
import type { TopicValue } from "../lib/topics";
import { gameModeEffects, practiceResultPresentation, practiceRoundStorageKey, practiceStoryBreakdown, previousPracticeStoriesKey, scoredRoundStorageKey } from "../lib/practice-mode";
import {
  getOrCreateAnonymousId,
  markLocalGameAttemptSynced,
  readLocalGameAttempts,
  recordGameAttempt,
  saveLocalGameAttempt
} from "../lib/client-storage";
import { CheckIcon, XIcon } from "./app-icons";
import { BadgeUnlockCelebration } from "./badge-unlock-celebration";
import { analyticsContext, track, VisibleTimer } from "../lib/analytics";

type RoundPhase = "guess" | "reveal";

type Attempt = {
  story_id: string;
  source_id?: string;
  source_key: string;
  round_id?: string | null;
  practice_round_id?: string | null;
  card_position?: number;
  mode?: "scored" | "practice";
  guessed_lean: Lean;
  correct_lean: Lean;
  is_correct: boolean;
  input_method?: "swipe" | "tap" | "drag" | "keyboard";
  response_ms?: number;
};

type StoredRound = {
  roundId?: string | null;
  cardKeys?: string[];
  currentIndex?: number;
  phase?: RoundPhase;
};

type StoredPracticeRound = StoredRound & {
  practiceRoundId: string;
  attempts: Attempt[];
};

type DragState = { active: boolean; x: number; y: number; pointerId: number | null };

const SWIPE_THRESHOLD = 76;

function sourceKey(outlet: string) { return outlet.trim().toLowerCase(); }
function cardKey(card: Pick<LeanGameCard, "storyId" | "sourceId">) { return `${card.storyId}:${card.sourceId}`; }
function createGameUuid() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}
function attemptKey(attempt: Attempt, cards: LeanGameCard[]) {
  if (attempt.source_id) return `${attempt.story_id}:${attempt.source_id}`;
  const matched = cards.find((card) => card.storyId === attempt.story_id && sourceKey(card.outlet) === attempt.source_key);
  return matched ? cardKey(matched) : `${attempt.story_id}:${attempt.source_key}`;
}
function titleCase(lean: Lean) { return lean[0].toUpperCase() + lean.slice(1); }
function orderStorageKey(anonymousId: string, storyId: string) { return `candor:lean-story-order:${anonymousId}:${storyId}`; }
function legacyPairStorageKey(anonymousId: string, storyId: string) { return `candor:lean-story-pair:${anonymousId}:${storyId}`; }

function readStoredOrders(anonymousId: string, storyIds: string[]): StoredSourceOrders {
  return Object.fromEntries(storyIds.flatMap((storyId) => {
    try {
      const sourceIds = JSON.parse(
        localStorage.getItem(orderStorageKey(anonymousId, storyId)) ??
        localStorage.getItem(legacyPairStorageKey(anonymousId, storyId)) ??
        "null"
      );
      return Array.isArray(sourceIds) ? [[storyId, sourceIds]] : [];
    } catch { return []; }
  }));
}

function gamePassage(card: LeanGameCard) { return card.gameExcerpt.trim(); }
function explanationFor(card: LeanGameCard) { return card.explanation.trim(); }
function escapeRegExp(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function HighlightedPassage({ text, terms, startDelay }: { text: string; terms: string[]; startDelay: number }) {
  const uniqueTerms = [...new Set(terms.map((term) => term.trim()).filter(Boolean))]
    .filter((term) => text.toLocaleLowerCase().includes(term.toLocaleLowerCase()))
    .sort((a, b) => b.length - a.length);
  if (!uniqueTerms.length) return <>{text}</>;
  const matcher = new RegExp(`(${uniqueTerms.map(escapeRegExp).join("|")})`, "giu");
  return <>{text.split(matcher).map((part, index) => index % 2 ? (
    <mark className="keyword-highlight" style={{ "--highlight-delay": `${startDelay + Math.min(index * 55, 220)}ms` } as CSSProperties} key={`${part}-${index}`}>
      {part}
    </mark>
  ) : part)}</>;
}

function consecutiveCorrect(round: LeanGameCard[], attempts: Record<string, Attempt>, beforeIndex: number) {
  let combo = 0;
  for (let index = beforeIndex - 1; index >= 0; index -= 1) {
    const attempt = attempts[cardKey(round[index])];
    if (!attempt?.is_correct) break;
    combo += 1;
  }
  return combo;
}

export function LeanGuessingGame({ cards, currentDay, preferredStoryId, mode, selectedTopics, topicFallback, dayOverride }: {
  cards: LeanGameCard[];
  currentDay: string;
  preferredStoryId?: string;
  mode: "scored" | "practice";
  selectedTopics: TopicValue[];
  topicFallback: boolean;
  dayOverride?: string;
}) {
  const router = useRouter();
  const [round, setRound] = useState<LeanGameCard[] | null>(null);
  const [roundId, setRoundId] = useState<string | null>(null);
  const [practiceRoundId, setPracticeRoundId] = useState<string | null>(null);
  const [attempts, setAttempts] = useState<Record<string, Attempt>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [phase, setPhase] = useState<RoundPhase>("guess");
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [bullseyeEarned, setBullseyeEarned] = useState(false);
  const [drag, setDrag] = useState<DragState>({ active: false, x: 0, y: 0, pointerId: null });
  const dragOrigin = useRef({ x: 0, y: 0 });
  const cardElement = useRef<HTMLElement | null>(null);
  const pendingWrites = useRef<Array<Promise<unknown>>>([]);
  const completedRound = useRef<string | null>(null);
  const cardTimer = useRef<VisibleTimer | null>(null);
  const roundTimer = useRef<VisibleTimer | null>(null);
  const practiceStarted = useRef(false);
  const practiceCompleted = useRef(false);
  const resultScreenLogged = useRef(false);

  useEffect(() => {
    roundTimer.current = new VisibleTimer(86_400_000);
    track("screen_viewed", { screen: "game_round", game_type: "lean_guess" });
    const visibility = () => document.hidden ? roundTimer.current?.pause() : roundTimer.current?.resume();
    document.addEventListener("visibilitychange", visibility);
    return () => document.removeEventListener("visibilitychange", visibility);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function initializeRound() {
      const anonymousId = getOrCreateAnonymousId() ?? "visitor";
      const storyIds = [...new Set(cards.map((card) => card.storyId))];

      if (mode === "practice") {
        const storageKey = practiceRoundStorageKey(currentDay, anonymousId);
        const cardMap = new Map(cards.map((card) => [cardKey(card), card]));
        let stored: StoredPracticeRound | null = null;
        try { stored = JSON.parse(sessionStorage.getItem(storageKey) ?? "null") as StoredPracticeRound | null; } catch { /* Start fresh below. */ }
        let roundCards = stored?.cardKeys?.flatMap((id) => cardMap.get(id) ?? []) ?? [];
        if (!roundUsesEveryAvailableExcerpt(roundCards, cards) || !stored?.practiceRoundId) {
          let previousStoryIds: string[] = [];
          try { previousStoryIds = JSON.parse(sessionStorage.getItem(previousPracticeStoriesKey(currentDay, anonymousId)) ?? "[]"); } catch { /* No prior round. */ }
          const selected = buildPracticeStoryRound({ cards, previousStoryIds });
          roundCards = selected.round;
          const nextPracticeRoundId = createGameUuid();
          stored = { practiceRoundId: nextPracticeRoundId, cardKeys: roundCards.map(cardKey), currentIndex: 0, phase: "guess", attempts: [] };
          sessionStorage.setItem(previousPracticeStoriesKey(currentDay, anonymousId), JSON.stringify(selected.storyIds));
          sessionStorage.setItem(storageKey, JSON.stringify(stored));
        }
        const restoredAttempts = Object.fromEntries((stored.attempts ?? []).map((attempt) => [attemptKey(attempt, cards), attempt]));
        let restoredIndex = Math.max(0, Math.min(Number(stored.currentIndex) || 0, roundCards.length));
        let restoredPhase: RoundPhase = stored.phase === "reveal" ? "reveal" : "guess";
        if (restoredPhase === "guess" && restoredIndex < roundCards.length) {
          const resumed = resumeLockedStory(roundCards, restoredIndex, (index) => Boolean(restoredAttempts[cardKey(roundCards[index])]));
          restoredIndex = resumed.index;
          restoredPhase = resumed.phase;
        }
        if (!cancelled) {
          setAttempts(restoredAttempts);
          setRound(roundCards);
          setRoundId(null);
          setPracticeRoundId(stored.practiceRoundId);
          setCurrentIndex(restoredIndex);
          setPhase(restoredPhase);
        }
        return;
      }

      const localAttempts = storyIds.flatMap((storyId) => readLocalGameAttempts(storyId));
      const remoteAttempts = await Promise.all(storyIds.map(async (storyId) => {
        try {
          const response = await fetch(`/api/game-attempts?anonymous_id=${encodeURIComponent(anonymousId)}&story_id=${encodeURIComponent(storyId)}`, { cache: "no-store" });
          if (!response.ok) return [] as Attempt[];
          return (await response.json() as { attempts?: Attempt[] }).attempts ?? [];
        } catch { return [] as Attempt[]; }
      }));
      if (cancelled) return;

      const merged = Object.fromEntries([...remoteAttempts.flat(), ...localAttempts].map((attempt) => [
        attemptKey(attempt, cards), attempt
      ])) as Record<string, Attempt>;
      const storageKey = scoredRoundStorageKey(currentDay, anonymousId);
      const cardMap = new Map(cards.map((card) => [cardKey(card), card]));
      let roundCards: LeanGameCard[] = [];
      let storedRoundId: string | null = null;
      let storedIndex = 0;
      let storedPhase: RoundPhase = "guess";

      try {
        const stored = JSON.parse(localStorage.getItem(storageKey) ?? "null") as StoredRound | null;
        if (stored?.cardKeys) roundCards = stored.cardKeys.flatMap((id) => cardMap.get(id) ?? []);
        if (roundUsesEveryAvailableExcerpt(roundCards, cards)) {
          storedRoundId = stored?.roundId ?? null;
          storedIndex = Math.max(0, Math.min(Number(stored?.currentIndex) || 0, roundCards.length));
          storedPhase = stored?.phase === "reveal" ? "reveal" : "guess";
        } else {
          roundCards = [];
          localStorage.removeItem(storageKey);
        }
      } catch { localStorage.removeItem(storageKey); }

      if (!roundCards.length) {
        const playedStoryIds = new Set(Object.values(merged)
          .filter((attempt) => attempt.mode !== "practice")
          .map((attempt) => attempt.story_id));
        const selected = buildStoryRound({
          cards,
          playedStoryIds,
          userSeed: anonymousId,
          currentDay,
          preferredStoryId,
          storedOrders: readStoredOrders(anonymousId, storyIds)
        });
        roundCards = selected.round;
        for (const [storyId, sourceIds] of Object.entries(selected.selectedOrders)) {
          localStorage.setItem(orderStorageKey(anonymousId, storyId), JSON.stringify(sourceIds));
        }
      }

      if (storedPhase === "guess" && storedIndex < roundCards.length) {
        const resumed = resumeLockedStory(roundCards, storedIndex, (index) => Boolean(merged[cardKey(roundCards[index])]));
        storedIndex = resumed.index;
        storedPhase = resumed.phase;
      }

      if (roundCards.length && !storedRoundId && anonymousId !== "visitor") {
        try {
          const response = await fetch("/api/game-rounds", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ anonymous_id: anonymousId, current_day: currentDay, selected_topics: selectedTopics, topic_fallback: topicFallback, card_pairs: roundCards.map((card) => ({ day: card.day, story_id: card.storyId, source_id: card.sourceId })), analytics: analyticsContext() })
          });
          if (response.ok) storedRoundId = (await response.json() as { round_id?: string }).round_id ?? null;
        } catch (error) { console.error("Unable to start scored round:", error); }
      }

      const state = { roundId: storedRoundId, cardKeys: roundCards.map(cardKey), currentIndex: storedIndex, phase: storedPhase };
      localStorage.setItem(storageKey, JSON.stringify(state));
      setAttempts(merged);
      setRound(roundCards);
      setRoundId(storedRoundId);
      setPracticeRoundId(null);
      setCurrentIndex(storedIndex);
      setPhase(storedPhase);
    }
    void initializeRound();
    return () => { cancelled = true; };
  }, [cards, currentDay, preferredStoryId, mode, selectedTopics, topicFallback]);

  const current = round?.[currentIndex] ?? null;
  const currentAttempt = current ? attempts[cardKey(current)] : undefined;
  const passage = useMemo(() => current ? gamePassage(current) : "", [current]);
  const roundFinished = Boolean(round && currentIndex >= round.length);
  const answeredCount = round?.filter((card) => attempts[cardKey(card)]).length ?? 0;
  const correctCount = round?.filter((card) => attempts[cardKey(card)]?.is_correct).length ?? 0;
  const revealed = phase === "reveal";
  const visibleCombo = revealed && round ? consecutiveCorrect(round, attempts, currentIndex + 1) : 0;
  const playedStoryIds = new Set(Object.values(attempts)
    .filter((attempt) => attempt.mode !== "practice")
    .map((attempt) => attempt.story_id));
  const hasAnotherScoredStory = mode === "scored" && cards.some((card) => !playedStoryIds.has(card.storyId));

  useEffect(() => {
    cardTimer.current = new VisibleTimer();
    const visibility = () => document.hidden ? cardTimer.current?.pause() : cardTimer.current?.resume();
    document.addEventListener("visibilitychange", visibility);
    return () => document.removeEventListener("visibilitychange", visibility);
  }, [current?.storyId, current?.sourceId]);

  useEffect(() => {
    if (mode !== "practice" || !round?.length || practiceStarted.current) return;
    practiceStarted.current = true;
    track("round_selected", { game_type: "lean_guess", story_id: round[0].storyId, mode: "practice", topic_fallback: topicFallback });
    track("game_started", { game_type: "lean_guess", mode: "practice" });
  }, [mode, round, topicFallback]);

  useEffect(() => {
    if (mode !== "practice" || !roundFinished || practiceCompleted.current || !round) return;
    practiceCompleted.current = true;
    track("game_completed", { game_type: "lean_guess", mode: "practice", answers_count: round.length, correct_count: correctCount, duration_ms: roundTimer.current?.value() ?? 0 });
  }, [correctCount, mode, round, roundFinished]);

  useEffect(() => {
    if (!roundFinished || resultScreenLogged.current) return;
    resultScreenLogged.current = true;
    track("screen_viewed", { screen: "game_result", game_type: "lean_guess" });
  }, [roundFinished]);

  useEffect(() => {
    if (!round || !current || phase !== "guess" || !currentAttempt) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const transition = automaticGuessTransition(round, currentIndex, reducedMotion);
    const timer = window.setTimeout(() => {
      persistProgress(transition.index, transition.phase);
      setCurrentIndex(transition.index);
      setPhase(transition.phase);
      setDrag({ active: false, x: 0, y: 0, pointerId: null });
    }, transition.delay);
    return () => window.clearTimeout(timer);
  }, [current, currentAttempt, currentIndex, phase, round]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development" || !current) return;
    const frame = window.requestAnimationFrame(() => {
      const element = cardElement.current;
      if (element && element.scrollHeight > element.clientHeight + 1) {
        console.warn(`[lean-game] Layout overflow for ${current.storyId}:${current.sourceId} at ${window.innerWidth}x${window.innerHeight}. Add a shorter verbatim game_snippet.`);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [current, revealed]);

  function persistProgress(nextIndex: number, nextPhase: RoundPhase) {
    if (!round) return;
    const anonymousId = getOrCreateAnonymousId() ?? "visitor";
    if (mode === "practice") {
      if (!practiceRoundId) return;
      sessionStorage.setItem(practiceRoundStorageKey(currentDay, anonymousId), JSON.stringify({
        practiceRoundId,
        cardKeys: round.map(cardKey),
        currentIndex: nextIndex,
        phase: nextPhase,
        attempts: Object.values(attempts)
      } satisfies StoredPracticeRound));
      return;
    }
    localStorage.setItem(scoredRoundStorageKey(currentDay, anonymousId), JSON.stringify({
      roundId,
      cardKeys: round.map(cardKey),
      currentIndex: nextIndex,
      phase: nextPhase
    }));
  }

  useEffect(() => {
    if (!gameModeEffects(mode).evaluatesBadges || !round || answeredCount !== round.length || !roundId || completedRound.current === roundId) return;
    completedRound.current = roundId;
    const anonymousId = getOrCreateAnonymousId();
    if (!anonymousId) return;
    void Promise.allSettled(pendingWrites.current).then(async () => {
      try {
        const response = await fetch(`/api/game-rounds/${encodeURIComponent(roundId)}/complete`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ anonymous_id: anonymousId, duration_ms: roundTimer.current?.value() ?? 0, analytics: analyticsContext() })
        });
        if (!response.ok) throw new Error(`Round completion failed with ${response.status}`);
        const payload = await response.json() as { newlyEarned?: { badge_id?: string } | null };
        setBullseyeEarned(payload.newlyEarned?.badge_id === "sharp_eye");
      } catch (error) { console.error("Unable to evaluate round badge:", error); }
    });
  }, [answeredCount, mode, round, roundId]);

  async function savePracticeAttempt(attempt: Attempt, card: LeanGameCard, remainingRetries = 2): Promise<unknown> {
    try {
      const anonymousId = getOrCreateAnonymousId();
      if (!anonymousId || !practiceRoundId) return null;
      const response = await fetch("/api/practice-attempts", {
        method: "POST",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          anonymous_id: anonymousId,
          day: card.day,
          story_id: card.storyId,
          source_id: card.sourceId,
          source_key: attempt.source_key,
          guessed_lean: attempt.guessed_lean,
          practice_round_id: practiceRoundId,
          card_position: attempt.card_position
          ,input_method: attempt.input_method,
          response_ms: attempt.response_ms
        })
      });
      if (!response.ok) throw new Error(`Practice save failed with ${response.status}`);
      return response.json();
    } catch (error) {
      if (remainingRetries > 0) {
        await new Promise((resolve) => window.setTimeout(resolve, remainingRetries === 2 ? 600 : 1600));
        return savePracticeAttempt(attempt, card, remainingRetries - 1);
      }
      console.error("Unable to save practice attempt after retries:", error);
      return null;
    }
  }

  function choose(guessedLean: Lean, inputMethod: "swipe" | "tap" | "keyboard") {
    if (!current || revealed || currentAttempt || (mode === "scored" ? !roundId : !practiceRoundId)) return;
    const key = cardKey(current);
    const cardPosition = round ? storySegment(round, currentIndex).position + 1 : 1;
    const attempt: Attempt = {
      story_id: current.storyId,
      source_id: current.sourceId,
      source_key: sourceKey(current.outlet),
      round_id: mode === "scored" ? roundId : null,
      practice_round_id: mode === "practice" ? practiceRoundId : null,
      card_position: cardPosition,
      mode,
      guessed_lean: guessedLean,
      correct_lean: current.biasLabel,
      is_correct: guessedLean === current.biasLabel
      ,input_method: inputMethod,
      response_ms: cardTimer.current?.value() ?? 0
    };
    const nextAttempts = { ...attempts, [key]: attempt };
    if (gameModeEffects(mode).updatesStats) saveLocalGameAttempt({ day: current.day, ...attempt });
    setAttempts(nextAttempts);
    setDrag({ active: false, x: 0, y: 0, pointerId: null });
    setSyncMessage(null);
    if (mode === "practice") {
      const anonymousId = getOrCreateAnonymousId() ?? "visitor";
      sessionStorage.setItem(practiceRoundStorageKey(currentDay, anonymousId), JSON.stringify({
        practiceRoundId: practiceRoundId!, cardKeys: round?.map(cardKey) ?? [], currentIndex, phase, attempts: Object.values(nextAttempts)
      } satisfies StoredPracticeRound));
    }
    const write = mode === "practice"
      ? savePracticeAttempt(attempt, current)
      : recordGameAttempt({ day: current.day, storyId: current.storyId, sourceId: current.sourceId, sourceKey: attempt.source_key, roundId: roundId!, cardPosition, guessedLean, inputMethod, responseMs: attempt.response_ms ?? 0 })
        .then((saved) => {
          if (saved) markLocalGameAttemptSynced(current.storyId, attempt.source_key, current.sourceId);
          else setSyncMessage("Your answer is saved on this device and will sync when the connection returns.");
        });
    pendingWrites.current.push(write);
  }

  function advance() {
    if (!round || !current || !currentAttempt || phase !== "reveal") return;
    const segment = storySegment(round, currentIndex);
    const nextIndex = currentIndex + 1;
    const nextPhase: RoundPhase = nextIndex <= segment.end ? "reveal" : "guess";
    persistProgress(nextIndex, nextPhase);
    setCurrentIndex(nextIndex);
    setPhase(nextPhase);
    setDrag({ active: false, x: 0, y: 0, pointerId: null });
  }

  function finishRound() {
    const anonymousId = getOrCreateAnonymousId() ?? "visitor";
    if (mode === "practice") sessionStorage.removeItem(practiceRoundStorageKey(currentDay, anonymousId));
    else localStorage.removeItem(scoredRoundStorageKey(currentDay, anonymousId));
    router.push("/game");
  }

  function startNextRound(nextMode: "scored" | "practice") {
    const anonymousId = getOrCreateAnonymousId() ?? "visitor";
    if (mode === "practice") sessionStorage.removeItem(practiceRoundStorageKey(currentDay, anonymousId));
    else localStorage.removeItem(scoredRoundStorageKey(currentDay, anonymousId));
    const params = new URLSearchParams({ mode: nextMode, round: createGameUuid() });
    if (dayOverride) params.set("day", dayOverride);
    if (selectedTopics.length) params.set("topics", selectedTopics.join(","));
    if (topicFallback) params.set("topic_fallback", "1");
    router.push(`/game/spot-the-lean?${params.toString()}`);
  }

  function practiceAgain() {
    const anonymousId = getOrCreateAnonymousId() ?? "visitor";
    const previousStoryIds = [...new Set((round ?? []).map((card) => card.storyId))];
    const selected = buildPracticeStoryRound({ cards, previousStoryIds });
    const nextPracticeRoundId = createGameUuid();
    const nextState: StoredPracticeRound = {
      practiceRoundId: nextPracticeRoundId,
      cardKeys: selected.round.map(cardKey), currentIndex: 0, phase: "guess", attempts: []
    };
    sessionStorage.setItem(previousPracticeStoriesKey(currentDay, anonymousId), JSON.stringify(selected.storyIds));
    sessionStorage.setItem(practiceRoundStorageKey(currentDay, anonymousId), JSON.stringify(nextState));
    setRound(selected.round);
    setPracticeRoundId(nextPracticeRoundId);
    setRoundId(null);
    setAttempts({});
    setCurrentIndex(0);
    setPhase("guess");
    setBullseyeEarned(false);
    practiceStarted.current = false;
    practiceCompleted.current = false;
    resultScreenLogged.current = false;
    roundTimer.current = new VisibleTimer(86_400_000);
    completedRound.current = null;
  }

  function onPointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (revealed || currentAttempt) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragOrigin.current = { x: event.clientX, y: event.clientY };
    setDrag({ active: true, x: 0, y: 0, pointerId: event.pointerId });
  }
  function onPointerMove(event: ReactPointerEvent<HTMLElement>) {
    if (!drag.active || drag.pointerId !== event.pointerId) return;
    setDrag((value) => ({ ...value, x: event.clientX - dragOrigin.current.x, y: event.clientY - dragOrigin.current.y }));
  }
  function onPointerEnd(event: ReactPointerEvent<HTMLElement>) {
    if (!drag.active || drag.pointerId !== event.pointerId) return;
    const horizontal = Math.abs(drag.x) >= SWIPE_THRESHOLD && Math.abs(drag.x) > Math.abs(drag.y) * 0.85;
    const upward = drag.y <= -SWIPE_THRESHOLD && Math.abs(drag.y) > Math.abs(drag.x) * 0.8;
    setDrag({ active: false, x: 0, y: 0, pointerId: null });
    if (horizontal) choose(drag.x < 0 ? "left" : "right", "swipe");
    else if (upward) choose("center", "swipe");
  }

  if (!round) return <section className="lean-game game-placeholder" aria-hidden="true"><div className="loading-line loading-label" /><div className="loading-line loading-copy" /></section>;
  if (!round.length) return <section className="game-round-result empty-state"><p className="eyebrow">{mode === "practice" ? "Practice" : "You’re all caught up!"}</p><h2>{mode === "practice" ? "No eligible stories yet" : "No new stories available"}</h2><p>{mode === "practice" ? "Practice will be available when the story pool has eligible framing excerpts." : "You have played every eligible story currently in the pool."}</p><button className="primary-button" type="button" onClick={finishRound}>Done</button></section>;
  if (mode === "scored" && !roundId) return <section className="game-round-result empty-state"><p className="eyebrow">Round not started</p><h2>Couldn’t start this round</h2><p>Your cards are still selected, but scoring requires a secure round from the server.</p><button className="primary-button" type="button" onClick={() => window.location.reload()}>Try again</button></section>;
  const practicePresentation = practiceResultPresentation();
  const practiceBreakdown = round ? practiceStoryBreakdown(round, (card) => Boolean(attempts[cardKey(card)]?.is_correct)) : [];
  if (roundFinished) return <section className="game-round-result">
    <p className="eyebrow">{mode === "practice" ? practicePresentation.label : "Round complete!"}</p><h2>{correctCount}/{round.length} correct</h2>
    {mode === "practice" ? <p>{practicePresentation.note}</p> : null}
    {mode === "scored" ? <p>{correctCount === round.length ? "Perfect round!" : correctCount >= Math.ceil(round.length / 2) ? "Nice read! Your framing instincts are getting sharper." : "Good practice! Every excerpt builds your eye for framing."}</p> : null}
    <div className="round-result-meter" aria-label={`${correctCount} of ${round.length} correct`}>{round.map((card) => <span key={cardKey(card)} data-correct={attempts[cardKey(card)]?.is_correct} />)}</div>
    {mode === "practice" ? <ul className="practice-story-breakdown" aria-label="Practice results by story">{practiceBreakdown.map((story) => <li key={story.storyId}><span>{story.headline}</span><strong>{story.correct}/{story.total}</strong></li>)}</ul> : null}
    {mode === "practice" ? <div className="practice-result-actions"><button className="primary-button" type="button" onClick={practiceAgain}>Practice again</button><button className="secondary-button" type="button" onClick={finishRound}>Done</button></div> : <div className="practice-result-actions"><button className="primary-button" type="button" disabled={!hasAnotherScoredStory} onClick={() => startNextRound("scored")}>Another story</button><button className="secondary-button" type="button" onClick={() => startNextRound("practice")}>Practice</button></div>}
    {mode === "scored" && bullseyeEarned ? <BadgeUnlockCelebration badgeId="sharp_eye" onDismiss={() => setBullseyeEarned(false)} /> : null}
  </section>;
  if (!current) return null;

  const attempt = attempts[cardKey(current)];
  const segment = storySegment(round, currentIndex);
  const excerptInStory = segment.position;
  const cardStyle = drag.active ? { transform: `translate3d(${drag.x}px, ${drag.y}px, 0) rotate(${drag.x / 28}deg)`, "--drag-x": `${drag.x}`, "--drag-y": `${drag.y}` } as CSSProperties : undefined;
  const actionLabel = currentIndex < segment.end ? "Next explanation" : "See round results";
  const autoAdvancing = !revealed && Boolean(currentAttempt);

  return <section className="lean-game lean-round" aria-labelledby="lean-game-title">
    <div className="round-progress" aria-label={`${answeredCount} of ${round.length} excerpts answered`}>
      <div className="round-progress-copy"><span>{answeredCount}/{round.length} answered</span>{visibleCombo > 1 ? <strong>{visibleCombo} correct in a row!</strong> : null}</div>
      <div className="round-progress-track" aria-hidden="true"><span style={{ width: `${(answeredCount / round.length) * 100}%` }} /></div>
    </div>

    <header className="story-pair-header">
      <h1>{current.headline}</h1>
    </header>

    <div className="swipe-stage" data-revealed={revealed}>
      {!revealed && !currentAttempt ? <div className="swipe-direction-hints" aria-hidden="true"><span data-direction="left">← Left</span><span data-direction="center">↑ Center</span><span data-direction="right">Right →</span></div> : null}
      <article ref={cardElement} className="game-swipe-card" data-revealed={revealed} data-correct={revealed ? attempt?.is_correct : undefined} data-dragging={drag.active} data-lean={current.biasLabel} style={cardStyle} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd}>
        <header className="swipe-card-header">
          <div><span className="eyebrow">Excerpt {excerptInStory + 1} of {segment.total}</span></div>
          {revealed ? <div className="revealed-outlet"><span>Outlet shown</span><strong id="lean-game-title">{current.outlet}</strong></div> : <span className="swipe-card-cue">{currentAttempt ? `You picked ${titleCase(currentAttempt.guessed_lean)}` : "Swipe or tap"}</span>}
        </header>
        <blockquote className="swipe-card-excerpt">{revealed ? <HighlightedPassage text={passage} terms={current.terms} startDelay={attempt?.is_correct ? 520 : 260} /> : passage}</blockquote>
        {revealed && attempt ? <div className="swipe-card-reveal">
          <span className="round-answer-badge" data-correct={attempt.is_correct}>{attempt.is_correct ? <CheckIcon /> : <XIcon />}{attempt.is_correct ? "Correct!" : "Not quite"}</span>
          <p>You chose <strong>{titleCase(attempt.guessed_lean)}</strong>. This source is <span className="lean-label" data-lean={current.biasLabel}>{titleCase(current.biasLabel)}</span></p>
          <p className="swipe-card-explanation">{explanationFor(current)}</p>
        </div> : null}
      </article>
    </div>

    <div className="game-bottom-actions">
      {!revealed && !currentAttempt ? <div className="guess-options round-guess-options" aria-label="Choose the source lean">
        {(["left", "center", "right"] as Lean[]).map((lean) => <button key={lean} type="button" data-lean={lean} onClick={(event) => choose(lean, event.detail === 0 ? "keyboard" : "tap")}>{titleCase(lean)}</button>)}
      </div> : autoAdvancing ? <p className="game-auto-advance" role="status">{currentIndex === segment.end ? "Preparing answers" : "Next excerpt"}</p> : <button className="primary-button round-next-button" type="button" onClick={advance}>{actionLabel}</button>}
      {syncMessage ? <p className="game-sync-note" role="status">{syncMessage}</p> : null}
    </div>
    {mode === "scored" && bullseyeEarned ? <BadgeUnlockCelebration badgeId="sharp_eye" onDismiss={() => setBullseyeEarned(false)} /> : null}
  </section>;
}
