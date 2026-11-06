"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { track } from "../../lib/analytics";
import { localDateKey } from "../../lib/client-storage";
import type { Lean } from "../../lib/lean-game-pool";
import type { PlayRound } from "../../lib/play-schedule";
import { PLAY_FINAL_ROUND_MESSAGE, PLAY_SCORE_LINES } from "../../lib/play-copy";
import { playFeedbackStorageKey, type PlayFeedbackReason } from "../../lib/play-feedback";
import { PlayFeedbackSheet } from "./play-feedback-sheet";
import {
  applyPlayAnswer, buildPlayShareText, consecutivePlayStreak, daysBetween, formatPlayCountdown,
  initialPlayScreen, normalizeStoredRound, playResultMarks, playRoundStorageKey, playStreakLabel, type PlayStoredRound
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
function escapeRegExp(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function HighlightedPassage({ text, terms }: { text: string; terms: string[] }) {
  const matches = [...new Set(terms.map((term) => term.trim()).filter(Boolean))]
    .filter((term) => text.toLocaleLowerCase().includes(term.toLocaleLowerCase()))
    .sort((a, b) => b.length - a.length);
  if (!matches.length) return <>{text}</>;
  const matcher = new RegExp(`(${matches.map(escapeRegExp).join("|")})`, "giu");
  return <>{text.split(matcher).map((part, index) => index % 2
    ? <mark className={styles.keywordHighlight} key={index} style={{ "--highlight-delay": `${Math.min(index * 55, 220)}ms` } as CSSProperties}>{part}</mark>
    : part)}</>;
}
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

function Countdown({ target, nextRound, onExpire }: { target: number | null; nextRound: number | null; onExpire: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  const expiredTarget = useRef<number | null>(null);
  useEffect(() => {
    if (!target) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    const onVisible = () => { if (!document.hidden) setNow(Date.now()); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [target]);
  useEffect(() => {
    if (target && now >= target && expiredTarget.current !== target) {
      expiredTarget.current = target;
      onExpire();
    }
  }, [target, now, onExpire]);
  if (!target || !nextRound) return PLAY_FINAL_ROUND_MESSAGE;
  return <span role="timer" aria-live="off">{formatPlayCountdown(nextRound, target, now)}</span>;
}

export function DailyLeanGame({
  round, roundDateLabel, refSource, nextUnlockAt, nextRoundNumber, hasFutureScheduledRound, comingSoon
}: {
  round: PlayRound | null;
  roundDateLabel: string | null;
  refSource: string;
  nextUnlockAt: number | null;
  nextRoundNumber: number | null;
  hasFutureScheduledRound: boolean;
  comingSoon: boolean;
}) {
  const router = useRouter();
  const [screen, setScreen] = useState<Screen>("landing");
  const [explanationIndex, setExplanationIndex] = useState(0);
  const [stored, setStored] = useState<PlayStoredRound>(EMPTY_STATE);
  const [ready, setReady] = useState(false);
  const [isReturning, setIsReturning] = useState(false);
  const [daysSinceFirstPlay, setDaysSinceFirstPlay] = useState(0);
  const [streak, setStreak] = useState(0);
  const [drag, setDrag] = useState<Drag>({ active: false, x: 0, y: 0, pointerId: null, startX: 0, startY: 0 });
  const [thresholdLean, setThresholdLean] = useState<Lean | null>(null);
  const [outgoingLean, setOutgoingLean] = useState<Lean | null>(null);
  const [screenExiting, setScreenExiting] = useState(false);
  const [shareState, setShareState] = useState<"idle" | "copied">("idle");
  const [shareText, setShareText] = useState<string | null>(null);
  const [feedbackIndex, setFeedbackIndex] = useState<number | null>(null);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState<number[]>([]);
  const [intentAnswer, setIntentAnswer] = useState<"yes" | "maybe" | "no" | null>(null);
  const [streakSaved, setStreakSaved] = useState(false);
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
    let first: string | null = null;
    try {
      first = localStorage.getItem(FIRST_PLAY_KEY);
      if (!first) localStorage.setItem(FIRST_PLAY_KEY, today);
      localStorage.setItem("candor:play:storage-check", "1");
      setStreakSaved(true);
    } catch { setStreakSaved(false); }
    setIsReturning(Boolean(first));
    setDaysSinceFirstPlay(daysBetween(first ?? today, today));
    let restored: PlayStoredRound | null = null;
    try { restored = normalizeStoredRound(JSON.parse(localStorage.getItem(playRoundStorageKey(round.round)) ?? "null")); } catch { restored = null; }
    const state = restored ?? EMPTY_STATE;
    setStored(state);
    setScreen(initialPlayScreen(state));
    const completed: number[] = [];
    for (let number = 1; number <= round.round; number += 1) {
      try {
        const candidate = normalizeStoredRound(JSON.parse(localStorage.getItem(playRoundStorageKey(number)) ?? "null"));
        if (candidate?.completed) completed.push(number);
      } catch { /* Ignore malformed device state. */ }
    }
    setStreak(consecutivePlayStreak(completed, state.completed ? round.round : round.round - 1));
    try {
      const prior = localStorage.getItem(`candor:play:intent:${round.round}`);
      setIntentAnswer(prior === "yes" || prior === "maybe" || prior === "no" ? prior : null);
      setFeedbackSubmitted(round.cards.flatMap((_, index) => localStorage.getItem(playFeedbackStorageKey(round.round, index)) === "1" ? [index] : []));
    } catch { setIntentAnswer(null); setFeedbackSubmitted([]); }
    setReady(true);
  }, [round]);

  useEffect(() => {
    if (screen === "landing" && eventBase) track("play_landing_viewed", eventBase);
  }, [screen, eventBase]);

  const persist = useCallback((state: PlayStoredRound) => {
    if (!round) return;
    try { localStorage.setItem(playRoundStorageKey(round.round), JSON.stringify(state)); }
    catch { setStreakSaved(false); }
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
    if (stored.completed) { setScreen("result"); return; }
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
        setScreen("result");
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
    setShareText(null);
    if (typeof navigator.share === "function") {
      try { await navigator.share({ text }); track("play_share_tapped", { ...eventBase, method: "native" }); return; }
      catch (error) { if ((error as DOMException)?.name === "AbortError") return; }
    }
    try {
      await navigator.clipboard.writeText(text);
      track("play_share_tapped", { ...eventBase, method: "clipboard" });
      setShareState("copied");
      window.setTimeout(() => setShareState("idle"), 2_500);
      return;
    } catch { /* Clipboard unavailable; show the text for manual copy. */ }
    setShareState("idle");
    setShareText(text);
  }

  function answerIntent(answer: "yes" | "maybe" | "no") {
    if (!round || intentAnswer) return;
    setIntentAnswer(answer);
    try { localStorage.setItem(`candor:play:intent:${round.round}`, answer); } catch { /* Session state still works. */ }
    track("play_intent_answered", { round: round.round, answer });
  }

  if (!ready) return <main id="main-content" className={styles.shell} aria-busy="true" />;
  if (comingSoon || !round) return <ComingSoon />;
  const currentIndex = Math.min(stored.answers.length, round.cards.length - 1);
  const current = round.cards[currentIndex];
  const cardStyle = {
    "--drag-x": `${drag.x}px`, "--drag-y": `${drag.y}px`, "--drag-rotate": `${Math.max(-12, Math.min(12, drag.x / 22))}deg`,
    "--lean-shadow": thresholdLean ? `var(--play-${thresholdLean})` : "var(--play-ink)"
  } as CSSProperties;

  if (screen === "landing") return <Landing round={round} roundDateLabel={roundDateLabel} completed={stored.completed} onStart={startRound} exiting={screenExiting} onAbout={() => track("play_about_opened", { from: "landing" })} />;
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
  if (screen === "reveal") return <><Reveal round={round} stored={stored} index={explanationIndex} exiting={screenExiting}
    onNext={() => explanationIndex < round.cards.length - 1 ? setExplanationIndex(explanationIndex + 1) : transitionTo("result")}
    onResult={() => transitionTo("result")} feedbackSent={feedbackSubmitted.includes(explanationIndex)}
    onDisagree={() => { setFeedbackIndex(explanationIndex); track("play_disagree_opened", { round: round.round, excerpt_index: explanationIndex }); }}
    onAbout={() => track("play_about_opened", { from: "reveal" })} />
    {feedbackIndex !== null ? <PlayFeedbackSheet round={round.round} excerptIndex={feedbackIndex} currentLean={round.cards[feedbackIndex].biasLabel}
      onClose={() => setFeedbackIndex(null)} onSubmitted={(reason: PlayFeedbackReason) => {
        setFeedbackSubmitted((current) => [...new Set([...current, feedbackIndex])]);
        track("play_disagree_submitted", { round: round.round, excerpt_index: feedbackIndex, reason });
      }} onAlreadySubmitted={() => setFeedbackSubmitted((current) => [...new Set([...current, feedbackIndex])])} /> : null}</>;
  return <Result
    round={round}
    stored={stored}
    streak={streak}
    nextUnlockAt={nextUnlockAt}
    nextRoundNumber={nextRoundNumber}
    hasFutureScheduledRound={hasFutureScheduledRound}
    onShare={share}
    shareState={shareState}
    shareText={shareText}
    intentAnswer={intentAnswer}
    onIntent={answerIntent}
    streakSaved={streakSaved}
    onExplanations={() => { setExplanationIndex(0); transitionTo("reveal"); }}
    onFullApp={() => eventBase && track("play_full_app_tapped", eventBase)}
    onCountdownExpired={() => {
      if (new URL(window.location.href).searchParams.has("preview_round")) router.replace("/play");
      else router.refresh();
    }}
  />;
}

function Header({ round, streak }: { round: number; streak?: number }) {
  return <header className={styles.header}><strong>candor</strong>{streak ? <span className={styles.streakChip}><BoltIcon /> {streak}-day streak</span> : <span>#{round}</span>}</header>;
}

function Landing({ round, roundDateLabel, completed, onStart, exiting, onAbout }: { round: PlayRound; roundDateLabel: string | null; completed: boolean; onStart: () => void; exiting: boolean; onAbout: () => void }) {
  return <main id="main-content" className={`${styles.shell} ${styles.landing}`} data-screen-exiting={exiting}>
    <Header round={round.round} />
    <section className={styles.hero}>
      <h1>Spot the Lean</h1>
      <p>One story. Three outlets.</p>
    </section>
    <div className={styles.cardFan} aria-hidden="true">
      <span /><span /><div><small>Round story</small><strong>{round.headline}</strong><i><b /><b /><b /></i></div><em>Round #{round.round}</em>
    </div>
    {roundDateLabel ? <div className={styles.roundDate}>{roundDateLabel}</div> : null}
    <ol className={styles.howList}>
      <li><span>1</span><b>Three excerpts, one story.</b></li>
      <li><span>2</span><b>Swipe to call each lean.</b></li>
      <li><span>3</span><b>Reveal the outlets and tells.</b></li>
    </ol>
    <div className={styles.landingActions}>
      <button type="button" className={styles.primaryAction} onClick={onStart}><span>{completed ? "See your result" : "Play today’s round"}</span><span aria-hidden="true">→</span></button>
      <p className={styles.accountNote}>No account needed</p>
      <Link className={styles.candorLink} href="/" onClick={onAbout}>What is Candor?</Link>
    </div>
  </main>;
}

function Reveal({ round, stored, index, onNext, onResult, exiting, feedbackSent, onDisagree, onAbout }: {
  round: PlayRound; stored: PlayStoredRound; index: number; onNext: () => void; onResult: () => void; exiting: boolean;
  feedbackSent: boolean; onDisagree: () => void; onAbout: () => void;
}) {
  const card = round.cards[index];
  const correct = stored.answers[index] === card.biasLabel;
  return <main id="main-content" className={`${styles.shell} ${styles.revealScreen}`} data-screen-exiting={exiting}>
    <Header round={round.round} />
    <p className={styles.explanationProgress}>Excerpt {index + 1} of {round.cards.length}</p>
    <article className={styles.explanationCard} key={card.sourceId} aria-live="polite" style={{ "--highlight-color": `var(--play-${card.biasLabel})` } as CSSProperties}>
      <div className={styles.explanationHeader}><span className={styles.leanChip} data-lean={card.biasLabel}>{titleCase(card.biasLabel)}</span><strong>{card.outlet}</strong></div>
      <blockquote><HighlightedPassage text={card.gameExcerpt} terms={card.terms} /></blockquote>
      <p className={styles.explanationOutcome}><span className={styles.resultIcon} data-correct={correct} aria-hidden="true"><CheckIcon correct={correct} /></span>You said {titleCase(stored.answers[index])}</p>
      {feedbackSent ? <p className={styles.feedbackSent}>Feedback sent</p> :
        <button type="button" className={styles.disagreeAction} onClick={onDisagree}>Disagree with this rating?</button>}
      {card.explanation ? <p className={styles.explanationTell}><b>The tell:</b> {card.explanation}</p> : null}
    </article>
    <button type="button" className={styles.primaryAction} onClick={onNext}>{index < round.cards.length - 1 ? "Next explanation" : "Back to results"}</button>
    {index < round.cards.length - 1 ? <button type="button" className={styles.explanationSkip} onClick={onResult}>Back to results</button> : null}
    <Link href="/" className={styles.explanationSkip} onClick={onAbout}>What is Candor?</Link>
  </main>;
}

function Result({ round, stored, streak, nextUnlockAt, nextRoundNumber, hasFutureScheduledRound, onShare, shareState, shareText, intentAnswer, onIntent, streakSaved, onExplanations, onFullApp, onCountdownExpired }: {
  round: PlayRound; stored: PlayStoredRound; streak: number; nextUnlockAt: number | null; nextRoundNumber: number | null; hasFutureScheduledRound: boolean;
  onShare: () => void; shareState: "idle" | "copied"; shareText: string | null; intentAnswer: "yes" | "maybe" | "no" | null;
  onIntent: (answer: "yes" | "maybe" | "no") => void; streakSaved: boolean;
  onExplanations: () => void; onFullApp: () => void; onCountdownExpired: () => void;
}) {
  const marks = playResultMarks(stored.answers, round.cards.map((card) => card.biasLabel));
  return <main id="main-content" className={`${styles.shell} ${styles.resultScreen}`}>
    <header className={styles.resultHeader}>
      <strong>candor</strong>
      <div className={styles.resultHeaderActions}>
        <span className={styles.resultStreak}><BoltIcon /> {playStreakLabel(round.round, streak)}</span>
        <Link href="/" className={styles.closeButton} aria-label="Close and open Candor"><CloseIcon /></Link>
      </div>
    </header>
    <section className={styles.resultIntro}>
      <span>Round complete</span><h1 aria-live="polite">{stored.score} out of {round.cards.length}.</h1>
      <p>{PLAY_SCORE_LINES[stored.score]}</p>
    </section>
    <section className={styles.resultTile}>
      <div className={styles.resultMarks} role="img" aria-label={marks.map((mark, index) => `Excerpt ${index + 1}: ${mark.correct ? `${mark.lean}, right` : "missed"}`).join("; ")}>
        {marks.map((mark, index) => <span key={round.cards[index].sourceId} data-lean={mark.lean} data-correct={mark.correct} />)}
      </div>
      <ol className={styles.resultBreakdown}>{round.cards.map((card, index) => <li key={card.sourceId}><span>Excerpt {index + 1}</span><b>{stored.answers[index] === card.biasLabel ? "✓ Right" : "× Missed"}</b></li>)}</ol>
      <button type="button" className={styles.explanationsAction} onClick={onExplanations}>View explanations <span aria-hidden="true">→</span></button>
    </section>
    <button type="button" className={styles.resultShare} onClick={onShare}><span aria-hidden="true">{shareState === "copied" ? "✓" : "↥"}</span> {shareState === "copied" ? "Copied!" : "Share your score"}</button>
    {intentAnswer ? null : <section className={styles.intentQuestion} aria-label="Would you play again tomorrow?">
      <p>Would you play again tomorrow?</p>
      <div>{(["yes", "maybe", "no"] as const).map((answer) => <button key={answer} type="button" onClick={() => onIntent(answer)}>{titleCase(answer)}</button>)}</div>
    </section>}
    {streakSaved ? <p className={styles.streakSaved}>Streak saved on this device</p> : null}
    {shareText ? <p className={styles.shareFallback}>{shareText}</p> : null}
    <div className={styles.countdown}><p><Countdown target={nextUnlockAt} nextRound={nextRoundNumber} onExpire={onCountdownExpired} /></p>{round.round === 1 && nextRoundNumber === 2 && hasFutureScheduledRound && nextUnlockAt ? <small>Round #2 tomorrow.</small> : null}</div>
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
