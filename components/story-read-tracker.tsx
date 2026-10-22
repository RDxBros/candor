"use client";

import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { canOfferStreakFreeze, consumeStreakFreeze, getOrCreateAnonymousId, hasLocalSpotLeanAttempt, localDateKey, markStoryRead, readReadingStats, type ReadingStats } from "../lib/client-storage";
import { isAnonymousUserReady, USER_READY_EVENT } from "./anonymous-user-bootstrap";
import { FreezeIcon } from "./app-icons";
import { Modal } from "./modal";
import { track } from "../lib/analytics";

type DigestContext = { digestHref: string; stories: Array<{ id: string; headline: string; href: string }> };

const GAME_INVITE_CHANCE = 0.25;

export function StoryReadTracker({ storyId, category, contentDay, digestHref, gameHref, minimumReadingTimeMs, children }: {
  storyId: string;
  category: string;
  contentDay: string;
  digestHref: string;
  gameHref?: string;
  minimumReadingTimeMs: number;
  children?: ReactNode;
}) {
  const router = useRouter();
  const sentinelRef = useRef<HTMLDivElement>(null);
  const handled = useRef(false);
  const userReady = useRef(isAnonymousUserReady());
  const reachedEnd = useRef(false);
  const minimumTimeReached = useRef(false);
  const activeReadingMs = useRef(0);
  const activeReadingStartedAt = useRef<number | null>(null);
  const gameInviteTimer = useRef<number | undefined>(undefined);
  const [showFreezePrompt, setShowFreezePrompt] = useState(false);
  const [promptStats, setPromptStats] = useState<ReadingStats | null>(null);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const [nextStory, setNextStory] = useState<DigestContext["stories"][number] | null>(null);
  const [showGameInvite, setShowGameInvite] = useState(false);
  const finishedRef = useRef(false);
  const exitTo = useRef<"digest" | "next" | "other">("other");
  const leftLogged = useRef(false);

  const activeSeconds = useCallback(() => Math.max(0, Math.round((activeReadingMs.current +
    (activeReadingStartedAt.current === null ? 0 : performance.now() - activeReadingStartedAt.current)) / 1000)), []);

  useEffect(() => {
    track("story_opened", { story_id: storyId, category, content_day: contentDay });
    const captureExit = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      const target = new URL(anchor.href, window.location.href);
      if (target.pathname === "/digest") exitTo.current = "digest";
      else if (target.pathname.startsWith("/story/")) exitTo.current = "next";
    };
    document.addEventListener("click", captureExit, true);
    return () => {
      document.removeEventListener("click", captureExit, true);
      if (leftLogged.current) return;
      leftLogged.current = true;
      track("story_left", { story_id: storyId, active_seconds: activeSeconds(), reached_bottom: reachedEnd.current, completed: finishedRef.current, exit_to: exitTo.current });
    };
  }, [activeSeconds, category, contentDay, storyId]);

  useEffect(() => {
    let context: DigestContext | null = null;
    try { context = JSON.parse(sessionStorage.getItem("candor:digest-context") ?? "null"); } catch { /* Ignore stale session data. */ }
    if (context?.digestHref !== digestHref) return;
    const readIds = readReadingStats().readByDate[localDateKey()] ?? [];
    const next = context.stories.find((story) => story.id !== storyId && !readIds.includes(story.id)) ?? null;
    setNextStory(next);
    if (next) router.prefetch(next.href);
  }, [digestHref, router, storyId]);

  const maybeOfferGame = useCallback(async () => {
    if (!gameHref) return;
    const storageKey = `candor:game-invite-considered:${storyId}`;
    if (localStorage.getItem(storageKey)) return;

    if (hasLocalSpotLeanAttempt()) {
      localStorage.setItem(storageKey, "true");
      return;
    }

    const anonymousId = getOrCreateAnonymousId();
    if (anonymousId) {
      try {
        const response = await fetch(`/api/game-attempts?anonymous_id=${encodeURIComponent(anonymousId)}&played=1`, { cache: "no-store" });
        if (response.ok) {
          const payload = await response.json() as { played?: boolean };
          if (payload.played) {
            localStorage.setItem(storageKey, "true");
            return;
          }
        }
      } catch {
        // A failed eligibility check must not interfere with story completion.
      }
    }

    localStorage.setItem(storageKey, "true");

    const randomValue = new Uint32Array(1);
    crypto.getRandomValues(randomValue);
    if (randomValue[0] / 0xffffffff >= GAME_INVITE_CHANCE) return;

    gameInviteTimer.current = window.setTimeout(() => {
      if (!document.querySelector(".modal-backdrop")) setShowGameInvite(true);
    }, 350);
  }, [gameHref, storyId]);

  const finishStory = useCallback((preserveStreak = false) => {
    const wasRead = readReadingStats().readByDate[localDateKey()]?.includes(storyId) ?? false;
    const stats = markStoryRead(storyId, preserveStreak);
    sessionStorage.removeItem(`candor:story-time:${storyId}`);
    let context: DigestContext | null = null;
    try { context = JSON.parse(sessionStorage.getItem("candor:digest-context") ?? "null"); } catch { /* Ignore stale session data. */ }
    const readIds = stats.readByDate[localDateKey()] ?? [];
    const next = context?.digestHref === digestHref
      ? context.stories.find((story) => story.id !== storyId && !readIds.includes(story.id)) ?? null
      : null;
    setNextStory(next);
    if (next) router.prefetch(next.href);
    setFinished(true);
    finishedRef.current = true;
    if (!wasRead) track("story_completed", { story_id: storyId, active_seconds: activeSeconds(), content_day: contentDay });
    void maybeOfferGame();
  }, [activeSeconds, contentDay, digestHref, maybeOfferGame, router, storyId]);

  useEffect(() => () => {
    if (gameInviteTimer.current) window.clearTimeout(gameInviteTimer.current);
  }, []);

  const recordOrOfferFreeze = useCallback(() => {
    if (handled.current || !userReady.current || !reachedEnd.current || !minimumTimeReached.current) return;
    const stats = readReadingStats();
    if (stats.readByDate[localDateKey()]?.includes(storyId)) { handled.current = true; finishStory(); return; }
    handled.current = true;
    if (canOfferStreakFreeze(stats)) {
      setPromptStats(stats);
      setShowFreezePrompt(true);
      return;
    }
    finishStory();
  }, [finishStory, storyId]);

  useEffect(() => {
    const onReady = () => { userReady.current = true; recordOrOfferFreeze(); };
    window.addEventListener(USER_READY_EVENT, onReady);
    return () => {
      window.removeEventListener(USER_READY_EVENT, onReady);
    };
  }, [recordOrOfferFreeze, storyId]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      reachedEnd.current = true;
      recordOrOfferFreeze();
      observer.disconnect();
    }, { threshold: 0.2 });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [recordOrOfferFreeze]);

  useEffect(() => {
    const storageKey = `candor:story-time:${storyId}`;
    if (readReadingStats().readByDate[localDateKey()]?.includes(storyId)) {
      minimumTimeReached.current = true;
      sessionStorage.removeItem(storageKey);
      recordOrOfferFreeze();
      return;
    }

    let timer: number | undefined;
    const savedTime = Number(sessionStorage.getItem(storageKey));
    activeReadingMs.current = Number.isFinite(savedTime) ? Math.min(savedTime, minimumReadingTimeMs) : 0;

    function persistTime() {
      sessionStorage.setItem(storageKey, String(Math.min(activeReadingMs.current, minimumReadingTimeMs)));
    }

    function pauseTimer() {
      if (activeReadingStartedAt.current !== null) {
        activeReadingMs.current += performance.now() - activeReadingStartedAt.current;
        activeReadingStartedAt.current = null;
      }
      if (timer !== undefined) window.clearTimeout(timer);
      timer = undefined;
      persistTime();
    }

    function startTimer() {
      if (minimumTimeReached.current || document.visibilityState !== "visible") return;
      activeReadingStartedAt.current = performance.now();
      const remaining = Math.max(0, minimumReadingTimeMs - activeReadingMs.current);
      timer = window.setTimeout(() => {
        if (activeReadingStartedAt.current !== null) {
          activeReadingMs.current += performance.now() - activeReadingStartedAt.current;
          activeReadingStartedAt.current = null;
        }
        minimumTimeReached.current = true;
        sessionStorage.setItem(storageKey, String(minimumReadingTimeMs));
        recordOrOfferFreeze();
      }, remaining);
    }

    function onVisibilityChange() {
      if (document.visibilityState === "hidden") pauseTimer();
      else startTimer();
    }

    startTimer();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      pauseTimer();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [minimumReadingTimeMs, recordOrOfferFreeze, storyId]);

  async function applyFreeze() {
    setApplying(true);
    setError(null);
    if (!await consumeStreakFreeze()) {
      setError("We couldn’t apply the freeze. You can try again or continue without it.");
      setApplying(false);
      return;
    }
    finishStory(true);
    setShowFreezePrompt(false);
  }

  function continueWithoutFreeze() { finishStory(); setShowFreezePrompt(false); }

  function continueReading() {
    exitTo.current = nextStory ? "next" : "digest";
    router.push(nextStory?.href ?? digestHref.replace(/^\/digest/, "/complete"));
  }

  function startGame() {
    if (!gameHref) return;
    setShowGameInvite(false);
    router.push(gameHref);
  }

  return <>
    <div ref={sentinelRef} className="story-end-sentinel" aria-hidden="true" />
    {showFreezePrompt ? <Modal className="streak-freeze-modal" labelId="freeze-title" descriptionId="freeze-description">
        <div className="freeze-symbol" aria-hidden="true"><FreezeIcon /></div>
        <h2 id="freeze-title">Protect your streak?</h2>
        <p id="freeze-description">Use a freeze to protect your {promptStats?.streak ?? 0}-day streak? In Spot the Lean, you’ve answered {promptStats?.gameCorrectCount ?? 0} of {promptStats?.gameTotalCount ?? 0} correctly overall.</p>
        {error ? <p className="freeze-error" role="alert">{error}</p> : null}
        <div className="freeze-actions">
          <button className="primary-button" type="button" disabled={applying} onClick={applyFreeze}>{applying ? "Applying…" : "Use my freeze"}</button>
          <button className="text-button" type="button" disabled={applying} onClick={continueWithoutFreeze}>Reset my streak</button>
        </div>
    </Modal> : null}
    {showGameInvite ? <Modal
      className="game-invite-modal"
      labelId="game-invite-title"
      descriptionId="game-invite-description"
      onDismiss={() => setShowGameInvite(false)}
    >
      <p className="eyebrow">Quick challenge</p>
      <h2 id="game-invite-title">Think you can spot the lean?</h2>
      <p id="game-invite-description">The outlet stays hidden. Read the framing, make your call, and see how sharp your instinct is.</p>
      <button className="primary-button" type="button" onClick={startGame}>Try the guessing game</button>
      <button className="text-button game-invite-dismiss" type="button" onClick={() => setShowGameInvite(false)}>Maybe later</button>
    </Modal> : null}
    {!showFreezePrompt ? (
      <div className="next-story-action" data-locked={!finished}>
        <p>{finished ? (nextStory ? "Continue your digest" : "That was the final story in today’s digest.") : "Read the article before proceeding"}</p>
        <button className="primary-button" type="button" disabled={!finished} onClick={continueReading}>
          {nextStory ? "Next unread story" : "Complete digest"}
        </button>
      </div>
    ) : null}
    {children}
  </>;
}
