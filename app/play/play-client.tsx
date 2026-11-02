"use client";

import Link from "next/link";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { track } from "../../lib/analytics";
import { localDateKey } from "../../lib/client-storage";
import type { Lean } from "../../lib/lean-game-pool";
import type { PlayRound } from "../../lib/play-schedule";
import {
  applyPlayAnswer, buildPlayShareText, consecutivePlayStreak, daysBetween,
  normalizeStoredRound, playRoundStorageKey, type PlayStoredRound
} from "../../lib/play-client";
import styles from "./play.module.css";

type Screen = "landing" | "round" | "reveal" | "result";
type Drag = { active: boolean; x: number; y: number; pointerId: number | null; startX: number; startY: number };
type PlayEventBase = { round: number; ref: string; is_returning: boolean; days_since_first_play: number };

const EMPTY_STATE: PlayStoredRound = { answers: [], completed: false, score: 0 };
const SWIPE_THRESHOLD = 76;
const FIRST_PLAY_KEY = "candor:play:first-date";
const LEANS: Lean[] = ["left", "center", "right"];

function titleCase(value: string) { return value.charAt(0).toUpperCase() + value.slice(1); }
function formatStoryDate(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date);
}
function scoreLine(score: number) { return score === 3 ? "Perfect read." : score === 2 ? "Solid round." : score === 1 ? "You caught one." : "A tricky one."; }
function reducedMotion() { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; }

function ArrowIcon({ direction }: { direction: Lean }) {
  const path = direction === "left" ? "M19 12H5M11 6l-6 6 6 6" : direction === "center" ? "M12 19V5M6 11l6-6 6 6" : "M5 12h14M13 6l6 6-6 6";
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={path} /></svg>;
}
function CheckIcon({ correct }: { correct: boolean }) {
  return correct
    ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>
    : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>;
}
function CloseIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>;
}
function BoltIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7z" /></svg>;
}

function Countdown({ target, fallback }: { target: number | null; fallback: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!target) return;
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [target]);
  if (!target) return fallback;
  const remaining = Math.max(0, target - now);
  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  return `Next round in ${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function DailyLeanGame({
  round, refSource, nextUnlockAt, hasFutureScheduledRound, comingSoon
}: {
  round: PlayRound | null;
  refSource: string;
  nextUnlockAt: number | null;
  hasFutureScheduledRound: boolean;
  comingSoon: boolean;
}) {
  const [screen, setScreen] = useState<Screen>("landing");
  const [stored, setStored] = useState<PlayStoredRound>(EMPTY_STATE);
  const [ready, setReady] = useState(false);
  const [isReturning, setIsReturning] = useState(false);
  const [daysSinceFirstPlay, setDaysSinceFirstPlay] = useState(0);
  const [streak, setStreak] = useState(0);
  const [drag, setDrag] = useState<Drag>({ active: false, x: 0, y: 0, pointerId: null, startX: 0, startY: 0 });
  const [thresholdLean, setThresholdLean] = useState<Lean | null>(null);
  const [outgoingLean, setOutgoingLean] = useState<Lean | null>(null);
  const [screenExiting, setScreenExiting] = useState(false);
  const thresholdRef = useRef<Lean | null>(null);
  const eventBase = useMemo<PlayEventBase | null>(() => round && ready ? {
    round: round.round, ref: refSource, is_returning: isReturning, days_since_first_play: daysSinceFirstPlay
  } : null, [round, ready, refSource, isReturning, daysSinceFirstPlay]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has("ref")) {
      url.searchParams.delete("ref");
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }
    if (!round) { setReady(true); return; }
    const today = localDateKey();
    const first = localStorage.getItem(FIRST_PLAY_KEY);
    setIsReturning(Boolean(first));
    if (!first) localStorage.setItem(FIRST_PLAY_KEY, today);
    setDaysSinceFirstPlay(daysBetween(first ?? today, today));
    let restored: PlayStoredRound | null = null;
    try { restored = normalizeStoredRound(JSON.parse(localStorage.getItem(playRoundStorageKey(round.round)) ?? "null")); } catch { restored = null; }
    const state = restored ?? EMPTY_STATE;
    setStored(state);
    setScreen(state.completed ? "result" : state.answers.length ? "round" : "landing");
    const completed: number[] = [];
    for (let number = 1; number <= round.round; number += 1) {
      try {
        const candidate = normalizeStoredRound(JSON.parse(localStorage.getItem(playRoundStorageKey(number)) ?? "null"));
        if (candidate?.completed) completed.push(number);
      } catch { /* Ignore malformed device state. */ }
    }
    setStreak(consecutivePlayStreak(completed, state.completed ? round.round : round.round - 1));
    setReady(true);
  }, [round]);

  useEffect(() => {
    if (screen === "landing" && eventBase) track("play_landing_viewed", eventBase);
  }, [screen, eventBase]);

  const persist = useCallback((state: PlayStoredRound) => {
    if (!round) return;
    localStorage.setItem(playRoundStorageKey(round.round), JSON.stringify(state));
    setStored(state);
  }, [round]);

  function transitionTo(next: Screen) {
    setScreenExiting(true);
    window.setTimeout(() => {
      setScreen(next);
      setScreenExiting(false);
    }, reducedMotion() ? 0 : 150);
  }

  function startRound() {
    if (!eventBase) return;
    track("play_round_started", eventBase);
    transitionTo("round");
  }

  const choose = useCallback((lean: Lean) => {
    if (!round || stored.completed || outgoingLean || stored.answers.length >= round.cards.length) return;
    const card = round.cards[stored.answers.length];
    const next = applyPlayAnswer(stored, lean, card.biasLabel);
    persist(next);
    setOutgoingLean(lean);
    setThresholdLean(lean);
    const delay = reducedMotion() ? 0 : 200;
    window.setTimeout(() => {
      setOutgoingLean(null);
      setThresholdLean(null);
      setDrag({ active: false, x: 0, y: 0, pointerId: null, startX: 0, startY: 0 });
      if (next.completed) {
        setStreak((value) => value + 1);
        if (eventBase) track("play_round_completed", { ...eventBase, score: next.score });
        setScreen("reveal");
      }
    }, delay);
  }, [round, stored, outgoingLean, persist, eventBase]);

  function leanForDrag(x: number, y: number): Lean | null {
    if (y <= -SWIPE_THRESHOLD && Math.abs(y) > Math.abs(x) * 0.8) return "center";
    if (Math.abs(x) >= SWIPE_THRESHOLD && Math.abs(x) > Math.abs(y) * 0.85) return x < 0 ? "left" : "right";
    return null;
  }

  function onPointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (outgoingLean) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ active: true, x: 0, y: 0, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY });
  }
  function onPointerMove(event: ReactPointerEvent<HTMLElement>) {
    if (!drag.active || drag.pointerId !== event.pointerId) return;
    const x = event.clientX - drag.startX;
    const y = event.clientY - drag.startY;
    const lean = leanForDrag(x, y);
    if (lean && thresholdRef.current !== lean && typeof navigator.vibrate === "function") navigator.vibrate(10);
    thresholdRef.current = lean;
    setThresholdLean(lean);
    setDrag((value) => ({ ...value, x, y }));
  }
  function onPointerEnd(event: ReactPointerEvent<HTMLElement>) {
    if (!drag.active || drag.pointerId !== event.pointerId) return;
    const lean = leanForDrag(drag.x, drag.y);
    thresholdRef.current = null;
    if (lean) choose(lean);
    else {
      setThresholdLean(null);
      setDrag({ active: false, x: 0, y: 0, pointerId: null, startX: 0, startY: 0 });
    }
  }
  function onPointerCancel() {
    thresholdRef.current = null;
    setThresholdLean(null);
    setDrag({ active: false, x: 0, y: 0, pointerId: null, startX: 0, startY: 0 });
  }

  async function share() {
    if (!round || !eventBase) return;
    const text = buildPlayShareText(round.round, stored.answers, round.cards.map((card) => card.biasLabel), window.location.origin);
    if (typeof navigator.share === "function") {
      try { await navigator.share({ text }); track("play_share_tapped", { ...eventBase, method: "native" }); return; }
      catch (error) { if ((error as DOMException)?.name === "AbortError") return; }
    }
    try { await navigator.clipboard.writeText(text); track("play_share_tapped", { ...eventBase, method: "clipboard" }); }
    catch { /* Sharing is optional; keep the result usable. */ }
  }

  if (!ready) return <main id="main-content" className={styles.shell} aria-busy="true" />;
  if (comingSoon || !round) return <ComingSoon />;
  const currentIndex = Math.min(stored.answers.length, round.cards.length - 1);
  const current = round.cards[currentIndex];
  const cardStyle = {
    "--drag-x": `${drag.x}px`, "--drag-y": `${drag.y}px`, "--drag-rotate": `${Math.max(-12, Math.min(12, drag.x / 22))}deg`,
    "--lean-shadow": thresholdLean ? `var(--play-${thresholdLean})` : "var(--play-ink)"
  } as CSSProperties;

  if (screen === "landing") return <Landing round={round} onStart={startRound} exiting={screenExiting} />;
  if (screen === "round") return <main id="main-content" className={`${styles.shell} ${styles.roundScreen}`}>
    <Header round={round.round} streak={streak} />
    <section className={styles.roundIntro}>
      <h1>Who wrote this?</h1>
      <div className={styles.progress} aria-label={`${stored.answers.length + 1} of 3 excerpts`}>
        {round.cards.map((card, index) => <span key={card.sourceId} data-filled={index < stored.answers.length} />)}
      </div>
      <div className={styles.storyPill}>Story: {round.headline}</div>
    </section>
    <section className={styles.cardStage} aria-label={`Excerpt ${stored.answers.length + 1} of 3`}>
      <div className={styles.stackCard} /><div className={styles.stackCard} />
      <article
        className={styles.swipeCard}
        data-dragging={drag.active}
        data-outgoing={outgoingLean ?? undefined}
        style={cardStyle}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerCancel}
      >
        {thresholdLean ? <span className={styles.leanStamp} data-lean={thresholdLean}>{titleCase(thresholdLean)}</span> : null}
        <p>{current.gameExcerpt}</p>
        <div className={styles.lockRow}><span>Outlet hidden until reveal</span><span aria-hidden="true">▣</span></div>
      </article>
    </section>
    <div className={styles.leanButtons} aria-label="Choose the outlet lean">
      {LEANS.map((lean) => <button key={lean} type="button" data-lean={lean} data-active={thresholdLean === lean} onClick={() => choose(lean)}><ArrowIcon direction={lean} /><span>{titleCase(lean)}</span></button>)}
    </div>
    <p className={styles.gestureHint}>Swipe the card or tap a button</p>
  </main>;
  if (screen === "reveal") return <Reveal round={round} stored={stored} exiting={screenExiting} onResult={() => transitionTo("result")} />;
  return <Result
    round={round}
    stored={stored}
    streak={streak}
    nextUnlockAt={nextUnlockAt}
    hasFutureScheduledRound={hasFutureScheduledRound}
    onShare={share}
    onFullApp={() => eventBase && track("play_full_app_tapped", eventBase)}
  />;
}

function Header({ round, streak }: { round: number; streak?: number }) {
  return <header className={styles.header}><strong>candor</strong>{streak ? <span className={styles.streakChip}><BoltIcon /> {streak}-day streak</span> : <span>#{round}</span>}</header>;
}

function Landing({ round, onStart, exiting }: { round: PlayRound; onStart: () => void; exiting: boolean }) {
  return <main id="main-content" className={`${styles.shell} ${styles.landing}`} data-screen-exiting={exiting}>
    <Header round={round.round} />
    <section className={styles.hero}>
      <h1>Spot the Lean</h1>
      <p>One story. Three outlets. Can you tell who leans which way?</p>
    </section>
    <div className={styles.cardFan} aria-hidden="true">
      <span /><span /><div><small>Round story</small><strong>{round.headline}</strong><i><b /><b /><b /></i></div><em>Round #{round.round}</em>
    </div>
    <div className={styles.roundDate}>Published {formatStoryDate(round.originalDate)}</div>
    <ol className={styles.howList}>
      <li><span>1</span><b>Read three excerpts from the same story.</b></li>
      <li><span>2</span><b>Swipe left, up or right to call its lean.</b></li>
      <li><span>3</span><b>Reveal the outlets and what gave them away.</b></li>
    </ol>
    <button type="button" className={styles.primaryAction} onClick={onStart}><span>Play round #{round.round}</span><span aria-hidden="true">→</span></button>
    <Link className={styles.candorLink} href="/">What is Candor?</Link>
  </main>;
}

function Reveal({ round, stored, onResult, exiting }: { round: PlayRound; stored: PlayStoredRound; onResult: () => void; exiting: boolean }) {
  return <main id="main-content" className={`${styles.shell} ${styles.revealScreen}`} data-screen-exiting={exiting}>
    <Header round={round.round} />
    <section className={styles.scoreCard} aria-live="polite"><div><span>Your score</span><strong>{scoreLine(stored.score)}</strong></div><b>{stored.score}<small>/3</small></b></section>
    <section className={styles.revealList} aria-label="Outlet reveal">
      {round.cards.map((card, index) => {
        const correct = stored.answers[index] === card.biasLabel;
        return <article key={card.sourceId} style={{ "--stagger": `${index * 60}ms` } as CSSProperties}>
          <div><span className={styles.leanChip} data-lean={card.biasLabel}>{titleCase(card.biasLabel)}</span><strong>{card.outlet}</strong><span className={styles.resultIcon} data-correct={correct} role="img" aria-label={correct ? "Correct" : "Missed"}><CheckIcon correct={correct} /></span></div>
          {card.explanation ? <p><b>The tell:</b> {card.explanation}</p> : null}
        </article>;
      })}
    </section>
    <button type="button" className={styles.primaryAction} onClick={onResult}>See your result</button>
    <Link className={styles.candorLink} href={`/story/${encodeURIComponent(round.storyId)}?day=${encodeURIComponent(round.cards[0].day)}`}>Read all 3 articles</Link>
  </main>;
}

function Result({ round, stored, streak, nextUnlockAt, hasFutureScheduledRound, onShare, onFullApp }: {
  round: PlayRound; stored: PlayStoredRound; streak: number; nextUnlockAt: number | null; hasFutureScheduledRound: boolean;
  onShare: () => void; onFullApp: () => void;
}) {
  return <main id="main-content" className={`${styles.shell} ${styles.resultScreen}`}>
    <Link href="/" className={styles.closeButton} aria-label="Close and open Candor"><CloseIcon /></Link>
    <section className={styles.resultIntro}>
      <span>Round complete</span><h1>Streak goes to {streak}.</h1>
      <div className={styles.streakWeek} role="img" aria-label={`${streak}-round streak`}>
        {Array.from({ length: 7 }, (_, index) => <i key={index} data-filled={index < Math.min(streak, 7)} data-current={index === Math.min(streak, 7) - 1} />)}
      </div>
    </section>
    <section className={styles.resultTile}>
      <div className={styles.resultMarks}><span /><span /></div>
      <div><small>Spot the Lean #{round.round}</small><strong>{stored.score} out of 3</strong><p>{scoreLine(stored.score)}</p></div>
      <button type="button" onClick={onShare}><span aria-hidden="true">↥</span> Share your score</button>
    </section>
    <p className={styles.countdown}><Countdown target={nextUnlockAt} fallback={hasFutureScheduledRound ? "New rounds coming soon" : "New rounds coming soon"} /></p>
    <Link href="/" className={styles.fullAppLink} onClick={onFullApp}><span><b>Want the whole story?</b><small>Try the full Candor app</small></span><span aria-hidden="true">→</span></Link>
  </main>;
}

function ComingSoon() {
  return <main id="main-content" className={`${styles.shell} ${styles.comingSoon}`}>
    <header className={styles.header}><strong>candor</strong><span>Spot the Lean</span></header>
    <section><span className={styles.soonBadge}>Coming soon</span><h1>A fresh way to read between the lines.</h1><p>The first reviewed Spot the Lean round is on its way.</p></section>
    <Link className={styles.primaryAction} href="/">Explore Candor</Link>
  </main>;
}
