"use client";

import { useRouter } from "next/navigation";
import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { getOrCreateAnonymousId } from "../lib/client-storage";
import type { FactOpinionAnswer, FactOpinionItem, FactOpinionRound, FactOpinionStoryOption } from "../lib/fact-opinion-content";
import type { TopicValue } from "../lib/topics";
import { shuffledFactOpinionItems } from "../lib/fact-opinion-content";
import {
  emptyPlacements,
  factOpinionCanCheck,
  factOpinionPracticeStorageKey,
  factOpinionScoredStorageKey,
  orderedFactOpinionResults,
  placeFactOpinionCard,
  scoreFactOpinionRound,
  type FactOpinionPlacements
} from "../lib/fact-opinion-game";
import { BackIcon, CheckIcon, ChevronDownIcon, XIcon } from "./app-icons";
import { analyticsContext, track, VisibleTimer } from "../lib/analytics";

type StoredState = {
  contentRoundId: string;
  itemOrder: string[];
  placements: FactOpinionPlacements;
  selectedId: string | null;
  locked: boolean;
  saved: boolean;
  roundId: string | null;
  practiceRoundId: string | null;
  attemptMeta?: Record<string, { input_method: "tap" | "drag" | "keyboard"; response_ms: number }>;
  moves?: number;
};

type DragState = {
  id: string;
  pointerId: number;
  x: number;
  y: number;
  left: number;
  top: number;
  width: number;
  height: number;
} | null;

function createUuid() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

function contains(rect: DOMRect | undefined, x: number, y: number) {
  return Boolean(rect && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom);
}

function PlacedCardChip({ item, expanded, onReturn, onView }: {
  item: FactOpinionItem;
  expanded: boolean;
  onReturn: () => void;
  onView: (returnFocus: HTMLButtonElement) => void;
}) {
  const bodyRef = useRef<HTMLButtonElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [truncated, setTruncated] = useState(false);

  useLayoutEffect(() => {
    const text = textRef.current;
    if (!text) return;
    if (expanded) { setTruncated(false); return; }
    const measure = () => setTruncated(text.scrollHeight > text.clientHeight + 1 || text.scrollWidth > text.clientWidth + 1);
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(text);
    return () => observer?.disconnect();
  }, [expanded, item.text]);

  return <div className="fact-opinion-placed-chip" data-full={expanded}>
    <button
      ref={bodyRef}
      className="fact-opinion-chip-body"
      type="button"
      aria-label={`Move back to tray: ${item.text}`}
      onClick={onReturn}
    ><span ref={textRef}>{item.text}</span></button>
    {!expanded && truncated ? <button
      className="fact-opinion-chip-view"
      type="button"
      aria-label="View full sentence"
      onClick={() => bodyRef.current && onView(bodyRef.current)}
    >View</button> : null}
  </div>;
}

function SentenceSheet({ item, onClose }: {
  item: FactOpinionItem;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
      if (event.key === "Tab") { event.preventDefault(); closeRef.current?.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return <div className="fact-opinion-sheet-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="fact-opinion-sentence-sheet" role="dialog" aria-modal="true" aria-labelledby="full-sentence-title">
      <p className="eyebrow" id="full-sentence-title">Full sentence</p>
      <p>{item.text}</p>
      <button ref={closeRef} className="secondary-button" type="button" onClick={onClose}>Close</button>
    </section>
  </div>;
}

export function FactOpinionGame({ rounds, story, currentDay, mode, selectedTopics, topicFallback, dayOverride }: {
  rounds: FactOpinionRound[];
  story: FactOpinionStoryOption;
  currentDay: string;
  mode: "scored" | "practice";
  selectedTopics: TopicValue[];
  topicFallback: boolean;
  dayOverride?: string;
}) {
  const router = useRouter();
  const [initializing, setInitializing] = useState(true);
  const [round, setRound] = useState<FactOpinionRound | null>(null);
  const [order, setOrder] = useState<string[]>([]);
  const [placements, setPlacements] = useState<FactOpinionPlacements>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveDelayed, setSaveDelayed] = useState(false);
  const [roundId, setRoundId] = useState<string | null>(null);
  const [practiceRoundId, setPracticeRoundId] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState>(null);
  const [announcement, setAnnouncement] = useState("");
  const [viewingItem, setViewingItem] = useState<FactOpinionItem | null>(null);
  const [expandedResults, setExpandedResults] = useState<Set<string>>(new Set());
  const [attemptMeta, setAttemptMeta] = useState<Record<string, { input_method: "tap" | "drag" | "keyboard"; response_ms: number }>>({});
  const [moves, setMoves] = useState(0);
  const dragOrigin = useRef({ x: 0, y: 0 });
  const trayRef = useRef<HTMLElement>(null);
  const factRef = useRef<HTMLElement>(null);
  const opinionRef = useRef<HTMLElement>(null);
  const sheetReturnFocus = useRef<HTMLButtonElement | null>(null);
  const saveStarted = useRef(false);
  const justDragged = useRef(false);
  const itemTimers = useRef<Record<string, VisibleTimer>>({});
  const roundTimer = useRef<VisibleTimer | null>(null);
  const practiceStarted = useRef(false);

  useEffect(() => {
    roundTimer.current = new VisibleTimer(86_400_000);
    track("screen_viewed", { screen: "game_round", game_type: "fact_opinion" });
    const visibility = () => {
      for (const timer of Object.values(itemTimers.current)) document.hidden ? timer.pause() : timer.resume();
      document.hidden ? roundTimer.current?.pause() : roundTimer.current?.resume();
    };
    document.addEventListener("visibilitychange", visibility);
    return () => document.removeEventListener("visibilitychange", visibility);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function initialize() {
      const anonymousId = getOrCreateAnonymousId() ?? "visitor";
      const storageKey = mode === "scored" ? factOpinionScoredStorageKey(currentDay, anonymousId, story.id) : factOpinionPracticeStorageKey(currentDay, anonymousId, story.id);
      let restored: StoredState | null = null;
      try { restored = JSON.parse((mode === "scored" ? localStorage : sessionStorage).getItem(storageKey) ?? "null") as StoredState | null; } catch { /* Start clean. */ }
      const restoredRound = rounds.find((candidate) => candidate.id === restored?.contentRoundId);
      if (restored && restoredRound && restored.itemOrder.length === restoredRound.items.length && new Set(restored.itemOrder).size === restored.itemOrder.length) {
        if (!cancelled) {
          setRound(restoredRound); setOrder(restored.itemOrder); setPlacements(restored.placements);
          setSelectedId(restored.selectedId); setLocked(restored.locked); setSaved(Boolean(restored.saved)); setRoundId(restored.roundId); setPracticeRoundId(restored.practiceRoundId);
          setAttemptMeta(restored.attemptMeta ?? {}); setMoves(restored.moves ?? 0);
          itemTimers.current = Object.fromEntries(restored.itemOrder.map((id) => [id, new VisibleTimer()]));
          setInitializing(false);
        }
        return;
      }
      if (!rounds.length) {
        if (!cancelled) setInitializing(false);
        return;
      }
      let candidates = rounds;
      if (mode === "scored" && anonymousId !== "visitor") {
        try {
          const response = await fetch(`/api/fact-opinion/attempts?anonymous_id=${encodeURIComponent(anonymousId)}`, { cache: "no-store" });
          const payload = response.ok ? await response.json() as { attempts?: Array<{ content_round_id: string }> } : {};
          const played = new Set((payload.attempts ?? []).map((attempt) => attempt.content_round_id));
          candidates = rounds.filter((candidate) => !played.has(candidate.id));
        } catch (error) { console.error("Unable to check played Fact or Opinion rounds:", error); }
      }
      const chosen = candidates[Math.floor(Math.random() * candidates.length)];
      if (!chosen) {
        if (!cancelled) setInitializing(false);
        return;
      }
      const itemOrder = shuffledFactOpinionItems(chosen.items).map((item) => item.id);
      let serverRoundId: string | null = null;
      const nextPracticeRoundId = mode === "practice" ? createUuid() : null;
      if (mode === "scored" && anonymousId !== "visitor") {
        try {
          const response = await fetch("/api/fact-opinion/rounds", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ anonymous_id: anonymousId, content_round_id: chosen.id, item_order: itemOrder, current_day: currentDay, selected_topics: selectedTopics, topic_fallback: topicFallback, analytics: analyticsContext() })
          });
          if (response.ok) serverRoundId = (await response.json() as { round_id?: string }).round_id ?? null;
        } catch (error) { console.error("Unable to start Fact or Opinion round:", error); }
      }
      if (cancelled) return;
      setRound(chosen); setOrder(itemOrder); setPlacements(emptyPlacements(chosen)); setRoundId(serverRoundId); setPracticeRoundId(nextPracticeRoundId);
      itemTimers.current = Object.fromEntries(itemOrder.map((id) => [id, new VisibleTimer()]));
      setInitializing(false);
    }
    void initialize().catch((error) => {
      console.error("Unable to initialize Fact or Opinion round:", error);
      if (!cancelled) setInitializing(false);
    });
    return () => { cancelled = true; };
  }, [currentDay, mode, rounds, selectedTopics, story.id, topicFallback]);

  useEffect(() => {
    if (!round) return;
    const anonymousId = getOrCreateAnonymousId() ?? "visitor";
    const state: StoredState = { contentRoundId: round.id, itemOrder: order, placements, selectedId, locked, saved, roundId, practiceRoundId, attemptMeta, moves };
    const storage = mode === "scored" ? localStorage : sessionStorage;
    const key = mode === "scored" ? factOpinionScoredStorageKey(currentDay, anonymousId, story.id) : factOpinionPracticeStorageKey(currentDay, anonymousId, story.id);
    storage.setItem(key, JSON.stringify(state));
  }, [attemptMeta, currentDay, locked, mode, moves, order, placements, practiceRoundId, round, roundId, saved, selectedId, story.id]);

  useEffect(() => {
    if (mode !== "practice" || !round || practiceStarted.current) return;
    practiceStarted.current = true;
    track("round_selected", { game_type: "fact_opinion", story_id: story.id, mode: "practice", topic_fallback: topicFallback });
    track("game_started", { game_type: "fact_opinion", mode: "practice" });
  }, [mode, round, story.id, topicFallback]);

  useEffect(() => {
    if (!locked || saved || !round || saveStarted.current) return;
    if ((mode === "scored" && !roundId) || (mode === "practice" && !practiceRoundId)) return;
    saveStarted.current = true;
    void saveAnswers();
    // Saving is deliberately driven by the locked snapshot, including after a refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked, mode, practiceRoundId, round, roundId, saved]);

  const itemMap = useMemo(() => new Map(round?.items.map((item) => [item.id, item]) ?? []), [round]);
  const canCheck = Boolean(round && factOpinionCanCheck(round, placements));
  const score = round ? scoreFactOpinionRound(round, placements) : 0;
  const unplacedIds = order.filter((id) => placements[id] == null);

  useEffect(() => {
    if (!locked || !round) return;
    track("screen_viewed", { screen: "game_result", game_type: "fact_opinion" });
    setExpandedResults(new Set(order.filter((id) => itemMap.get(id)?.answer !== placements[id])));
  }, [itemMap, locked, order, placements, round]);

  function place(itemId: string, destination: FactOpinionAnswer | null, inputMethod: "tap" | "drag" | "keyboard" = "tap") {
    if (!round || locked) return;
    const previous = placements[itemId];
    if (destination !== null && !attemptMeta[itemId]) {
      setAttemptMeta((current) => ({ ...current, [itemId]: { input_method: inputMethod, response_ms: itemTimers.current[itemId]?.value() ?? 0 } }));
    }
    if (previous !== destination) setMoves((value) => value + 1);
    setPlacements((current) => placeFactOpinionCard(current, itemId, destination));
    setSelectedId(null);
    const item = itemMap.get(itemId);
    setAnnouncement(`${item?.text ?? "Card"} moved to ${destination ?? "the tray"}.`);
  }

  function placeSelected(destination: FactOpinionAnswer, inputMethod: "tap" | "keyboard") {
    if (selectedId) place(selectedId, destination, inputMethod);
  }

  function onPointerDown(event: ReactPointerEvent<HTMLButtonElement>, id: string) {
    if (locked || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = event.currentTarget.getBoundingClientRect();
    dragOrigin.current = { x: event.clientX, y: event.clientY };
    setDrag({
      id,
      pointerId: event.pointerId,
      x: 0,
      y: 0,
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height
    });
  }

  function onPointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!drag || drag.pointerId !== event.pointerId) return;
    setDrag({ ...drag, x: event.clientX - dragOrigin.current.x, y: event.clientY - dragOrigin.current.y });
  }

  function onPointerEnd(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const moved = Math.hypot(drag.x, drag.y) >= 10;
    const point = { x: event.clientX, y: event.clientY };
    const destination = contains(factRef.current?.getBoundingClientRect(), point.x, point.y) ? "fact" :
      contains(opinionRef.current?.getBoundingClientRect(), point.x, point.y) ? "opinion" : undefined;
    setDrag(null);
    justDragged.current = moved;
    if (moved && destination) place(drag.id, destination, "drag");
  }

  async function saveAnswers(remainingRetries = 2): Promise<void> {
    if (!round) return;
    try {
      const anonymousId = getOrCreateAnonymousId();
      if (!anonymousId) return;
      const response = await fetch("/api/fact-opinion/attempts", {
        method: "POST", keepalive: true, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          anonymous_id: anonymousId, current_day: currentDay, content_round_id: round.id, item_order: order,
          placements, mode, round_id: mode === "scored" ? roundId : null,
          practice_round_id: mode === "practice" ? practiceRoundId : null,
          attempt_meta: attemptMeta,
          duration_ms: roundTimer.current?.value() ?? 0,
          moves,
          analytics: analyticsContext()
        })
      });
      if (!response.ok) throw new Error(`Save failed with ${response.status}`);
      setSaveDelayed(false);
      setSaved(true);
    } catch (error) {
      if (remainingRetries > 0) {
        await new Promise((resolve) => window.setTimeout(resolve, remainingRetries === 2 ? 700 : 1800));
        return saveAnswers(remainingRetries - 1);
      }
      console.error("Unable to save Fact or Opinion answers after retries:", error);
      setSaveDelayed(true);
      saveStarted.current = false;
      window.setTimeout(() => {
        if (saveStarted.current) return;
        saveStarted.current = true;
        void saveAnswers();
      }, 5000);
    }
  }

  function checkAnswers() {
    if (!canCheck || locked || (mode === "scored" && !roundId) || (mode === "practice" && !practiceRoundId)) return;
    setLocked(true);
    setSelectedId(null);
    setAnnouncement(`${score} of 6 correct. Answers are now locked.`);
  }

  function clearRoundState() {
    const anonymousId = getOrCreateAnonymousId() ?? "visitor";
    const storage = mode === "scored" ? localStorage : sessionStorage;
    const key = mode === "scored" ? factOpinionScoredStorageKey(currentDay, anonymousId, story.id) : factOpinionPracticeStorageKey(currentDay, anonymousId, story.id);
    storage.removeItem(key);
  }

  function finish() { if (saved) clearRoundState(); router.push("/game"); }
  function playAgain() {
    if (!saved) return;
    clearRoundState();
    const params = new URLSearchParams({ mode, story: story.id, round: createUuid() });
    if (dayOverride) params.set("day", dayOverride);
    if (selectedTopics.length) params.set("topics", selectedTopics.join(","));
    if (topicFallback) params.set("topic_fallback", "1");
    router.push(`/game/fact-or-opinion?${params}`);
  }

  function closeSentenceSheet() {
    setViewingItem(null);
    setAnnouncement("Closed full sentence.");
    window.setTimeout(() => sheetReturnFocus.current?.focus(), 0);
  }

  if (initializing) return <section className="empty-state fact-opinion-empty" role="status"><p>Opening the round…</p></section>;
  if (!round) return <section className="empty-state fact-opinion-empty"><h1>No round available</h1><p>{mode === "scored" ? "You may have played every reviewed round." : "No reviewed practice rounds are available yet."}</p></section>;

  const resultOrder = orderedFactOpinionResults(round, placements, order);

  return <section className={`fact-opinion-game${locked ? " is-results" : " is-playing"}`} aria-label="Fact or Opinion round">
    <header className="fact-opinion-round-head">
      <button className="fact-opinion-round-back" type="button" onClick={() => router.back()}><BackIcon />Back</button>
    </header>
    <p className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</p>

    {!locked ? <div className="fact-opinion-play-layout" data-complete={unplacedIds.length === 0}>
      <p className="fact-opinion-cards-left">{unplacedIds.length} left</p>
      <section className="fact-opinion-active-area" ref={trayRef} aria-label="Sentence to sort">
        {unplacedIds.length ? <div className="fact-opinion-card-list">
          {unplacedIds.map((id) => {
            const item = itemMap.get(id)!;
            const selected = selectedId === id;
            return <button
              className="fact-opinion-card fact-opinion-list-card"
              data-selected={selected}
              data-dragging={drag?.id === id}
              type="button"
              key={id}
              aria-label={`${item.text}. ${selected ? "Selected" : "Select this card"}`}
              aria-pressed={selected}
              onClick={() => {
                if (justDragged.current) { justDragged.current = false; return; }
                if (!drag) {
                  setSelectedId((current) => current === id ? null : id);
                  setAnnouncement(selected ? "Sentence deselected." : "Sentence selected. Choose Fact or Opinion.");
                }
              }}
              onPointerDown={(event) => onPointerDown(event, id)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerEnd}
              onPointerCancel={() => setDrag(null)}
            >
              <span>{item.text}</span>
            </button>;
          })}
        </div> : <button className="primary-button fact-opinion-check" type="button" disabled={!canCheck || (mode === "scored" ? !roundId : !practiceRoundId)} onClick={checkAnswers}>Check answers</button>}
      </section>

      <div className="fact-opinion-bins" aria-label="Answer boxes">
        {(["fact", "opinion"] as const).map((answer) => <section
          key={answer}
          className="fact-opinion-bin"
          data-empty={!order.some((id) => placements[id] === answer)}
          ref={answer === "fact" ? factRef : opinionRef}
          aria-labelledby={`${answer}-bin-title`}
        >
          <button className="fact-opinion-zone-action" type="button" disabled={!selectedId} onClick={(event) => placeSelected(answer, event.detail === 0 ? "keyboard" : "tap")}>
            <strong id={`${answer}-bin-title`}>{answer === "fact" ? "Fact" : "Opinion"}</strong>
          </button>
          <div className="fact-opinion-chip-list">
            {order.filter((id) => placements[id] === answer).map((id) => {
              const item = itemMap.get(id)!;
              return <PlacedCardChip
                key={id}
                item={item}
                expanded={unplacedIds.length === 0}
                onReturn={() => place(id, null)}
                onView={(returnFocus) => {
                  sheetReturnFocus.current = returnFocus;
                  setViewingItem(item);
                  setAnnouncement(`Showing full sentence: ${item.text}`);
                }}
              />;
            })}
          </div>
        </section>)}
      </div>
      {drag && itemMap.get(drag.id) ? <div
        className="fact-opinion-drag-overlay"
        aria-hidden="true"
        style={{
          left: drag.left,
          top: drag.top,
          width: drag.width,
          minHeight: drag.height,
          transform: `translate3d(${drag.x}px, ${drag.y}px, 0)`
        } as CSSProperties}
      >{itemMap.get(drag.id)?.text}</div> : null}
    </div> : <section className="fact-opinion-results" aria-labelledby="fact-opinion-result-title">
      <div className="fact-opinion-result-summary">
        {mode === "practice" ? <span className="fact-opinion-practice-tag">Practice</span> : null}
        <h2 id="fact-opinion-result-title">{score} of 6 correct</h2>
        {mode === "practice" ? <p>Practice rounds don&apos;t count toward your stats.</p> : null}
      </div>
      <div className="fact-opinion-result-list">
        {resultOrder.map((id) => {
          const item = itemMap.get(id)!;
          const correct = item.answer === placements[id];
          const expanded = expandedResults.has(id);
          return <article className="fact-opinion-result-row" data-correct={correct} key={id}>
            <button
              className="fact-opinion-result-toggle"
              type="button"
              aria-expanded={expanded}
              aria-controls={`fact-opinion-result-${id}`}
              onClick={() => setExpandedResults((current) => {
                const next = new Set(current);
                if (next.has(id)) next.delete(id); else next.add(id);
                return next;
              })}
            >
              <span className="fact-opinion-result-icon" aria-hidden="true">{correct ? <CheckIcon /> : <XIcon />}</span>
              <span>{item.text}</span>
              <span className="fact-opinion-result-chevron" aria-hidden="true"><ChevronDownIcon /></span>
            </button>
            {expanded ? <div className="fact-opinion-result-detail" id={`fact-opinion-result-${id}`}>
              <span className="answer-chip">{item.answer === "fact" ? "Fact" : "Opinion"}</span>
              <p>{item.explanation}</p>
            </div> : null}
          </article>;
        })}
      </div>
      {!saved ? <p className="muted-copy fact-opinion-save-status" role="status">{saveDelayed ? "Saved on this device. Syncing when the connection returns." : "Saving this round…"}</p> : null}
      <div className="fact-opinion-result-actions">
        <button className="secondary-button" type="button" disabled={!saved && !saveDelayed} onClick={finish}>Done</button>
        <button className="primary-button" type="button" disabled={!saved} onClick={playAgain}>Play again</button>
      </div>
    </section>}

    {viewingItem ? <SentenceSheet item={viewingItem} onClose={closeSentenceSheet} /> : null}
  </section>;
}
