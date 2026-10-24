export const STORAGE_KEYS = {
  anonymousId: "candor:anonymous-id",
  topics: "candor:selected-topics",
  dailyDropEnabled: "candor:daily-drop-enabled",
  dailyDropTime: "candor:daily-drop-time",
  reading: "candor:reading-stats",
  installPromptSeen: "candor:install-prompt-seen",
  gameAttempts: "candor:game-attempts"
} as const;

export type LocalGameAttempt = {
  day: string;
  story_id: string;
  source_id?: string;
  source_key: string;
  round_id?: string | null;
  card_position?: number;
  mode?: "scored" | "practice";
  guessed_lean: "left" | "center" | "right";
  correct_lean: "left" | "center" | "right";
  is_correct: boolean;
  input_method?: "swipe" | "tap" | "drag" | "keyboard";
  response_ms?: number;
  synced: boolean;
};

export type ReadingStats = {
  streak: number;
  lastReadDate: string | null;
  totalStoriesRead: number;
  /** Spot the Lean scored answers only. */
  gameCorrectCount: number;
  /** Spot the Lean scored answers only. */
  gameTotalCount: number;
  freezesAvailable: number;
  freezesUsedTotal: number;
  createdAt: string | null;
  readByDate: Record<string, string[]>;
};

const EMPTY_STATS: ReadingStats = {
  streak: 0,
  lastReadDate: null,
  totalStoriesRead: 0,
  gameCorrectCount: 0,
  gameTotalCount: 0,
  freezesAvailable: 0,
  freezesUsedTotal: 0,
  createdAt: null,
  readByDate: {}
};

type ServerUser = {
  streak_count: number;
  last_read_date: string | null;
  total_stories_read: number;
  game_correct_count: number;
  game_total_count: number;
  freezes_available: number;
  freezes_used_total: number;
  created_at: string;
};

export function getOrCreateAnonymousId() {
  if (typeof window === "undefined") return null;
  const existing = localStorage.getItem(STORAGE_KEYS.anonymousId);
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(existing ?? "")) {
    return existing;
  }
  const anonymousId = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : fallbackUuid();
  localStorage.setItem(STORAGE_KEYS.anonymousId, anonymousId);
  return anonymousId;
}

function fallbackUuid() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

export function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function yesterdayKey() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return localDateKey(yesterday);
}

export function readReadingStats(): ReadingStats {
  if (typeof window === "undefined") return EMPTY_STATS;
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEYS.reading) ?? "null");
    if (!parsed || typeof parsed !== "object") return EMPTY_STATS;
    return {
      streak: Number.isFinite(parsed.streak) ? parsed.streak : 0,
      lastReadDate: typeof parsed.lastReadDate === "string" ? parsed.lastReadDate : null,
      totalStoriesRead: Number.isFinite(parsed.totalStoriesRead) ? parsed.totalStoriesRead : 0,
      gameCorrectCount: Number.isFinite(parsed.gameCorrectCount) ? parsed.gameCorrectCount : 0,
      gameTotalCount: Number.isFinite(parsed.gameTotalCount) ? parsed.gameTotalCount : 0,
      freezesAvailable: Number.isFinite(parsed.freezesAvailable) ? parsed.freezesAvailable : 0,
      freezesUsedTotal: Number.isFinite(parsed.freezesUsedTotal) ? parsed.freezesUsedTotal : 0,
      createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : null,
      readByDate: parsed.readByDate && typeof parsed.readByDate === "object" ? parsed.readByDate : {}
    };
  } catch {
    return EMPTY_STATS;
  }
}

function saveReadingStats(stats: ReadingStats) {
  localStorage.setItem(STORAGE_KEYS.reading, JSON.stringify(stats));
  window.dispatchEvent(new CustomEvent("candor:reading-updated", { detail: stats }));
}

function applyServerUser(user: ServerUser, current = readReadingStats()) {
  const next: ReadingStats = {
    ...current,
    streak: user.streak_count,
    lastReadDate: user.last_read_date,
    totalStoriesRead: Math.max(current.totalStoriesRead, user.total_stories_read),
    gameCorrectCount: Math.max(current.gameCorrectCount, user.game_correct_count),
    gameTotalCount: Math.max(current.gameTotalCount, user.game_total_count),
    freezesAvailable: user.freezes_available,
    freezesUsedTotal: user.freezes_used_total,
    createdAt: user.created_at
  };
  saveReadingStats(next);
  return next;
}

function readAllLocalGameAttempts(): LocalGameAttempt[] {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEYS.gameAttempts) ?? "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function hasLocalSpotLeanAttempt() {
  return readAllLocalGameAttempts().some((attempt) => attempt.mode !== "practice");
}

function writeAllLocalGameAttempts(attempts: LocalGameAttempt[]) {
  localStorage.setItem(STORAGE_KEYS.gameAttempts, JSON.stringify(attempts));
}

export function readLocalGameAttempts(storyId: string) {
  return readAllLocalGameAttempts().filter((attempt) =>
    attempt.story_id === storyId && attempt.mode !== "practice");
}

export function saveLocalGameAttempt(attempt: Omit<LocalGameAttempt, "synced">) {
  // This legacy local cache and its optimistic counters belong to Spot the Lean only.
  // Practice owns separate session state and must never enter the scored cache
  // or its optimistic accuracy counters.
  if (attempt.mode === "practice") return { ...attempt, synced: false };
  const attempts = readAllLocalGameAttempts();
  const existing = attempts.find((item) =>
    item.story_id === attempt.story_id && (attempt.source_id
      ? item.source_id === attempt.source_id || (!item.source_id && item.source_key === attempt.source_key)
      : item.source_key === attempt.source_key)
  );
  if (existing) return existing;

  const saved = { ...attempt, synced: false };
  attempts.push(saved);
  writeAllLocalGameAttempts(attempts);

  const stats = readReadingStats();
  saveReadingStats({
    ...stats,
    gameCorrectCount: stats.gameCorrectCount + (attempt.is_correct ? 1 : 0),
    gameTotalCount: stats.gameTotalCount + 1
  });
  return saved;
}

export function markLocalGameAttemptSynced(storyId: string, sourceKey: string, sourceId?: string) {
  const attempts = readAllLocalGameAttempts().map((attempt) =>
    attempt.story_id === storyId && (sourceId
      ? attempt.source_id === sourceId || (!attempt.source_id && attempt.source_key === sourceKey)
      : attempt.source_key === sourceKey)
      ? { ...attempt, synced: true }
      : attempt
  );
  writeAllLocalGameAttempts(attempts);
}

export async function syncUserStats(stats = readReadingStats()) {
  const anonymousId = getOrCreateAnonymousId();
  if (!anonymousId) return false;
  try {
    const response = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        anonymous_id: anonymousId,
        streak_count: stats.streak,
        last_read_date: stats.lastReadDate,
        total_stories_read: stats.totalStoriesRead,
        game_correct_count: stats.gameCorrectCount,
        game_total_count: stats.gameTotalCount
      })
    });
    if (!response.ok) return null;
    const payload = await response.json();
    return payload.user ? applyServerUser(payload.user, stats) : stats;
  } catch {
    return null;
  }
}

export async function initializeUser() {
  const anonymousId = getOrCreateAnonymousId();
  if (!anonymousId) return null;
  try {
    const response = await fetch(`/api/users?anonymous_id=${encodeURIComponent(anonymousId)}`, { cache: "no-store" });
    if (response.ok) {
      const payload = await response.json();
      return payload.user ? applyServerUser(payload.user) : readReadingStats();
    }
    if (response.status === 404) return syncUserStats();
    return null;
  } catch {
    return null;
  }
}

function daysBetween(from: string, to: string) {
  const fromDate = new Date(`${from}T12:00:00`);
  const toDate = new Date(`${to}T12:00:00`);
  return Math.round((toDate.getTime() - fromDate.getTime()) / 86_400_000);
}

export function canOfferStreakFreeze(stats = readReadingStats()) {
  if (!stats.lastReadDate || stats.freezesAvailable < 1) return false;
  return daysBetween(stats.lastReadDate, localDateKey()) === 2;
}

export async function consumeStreakFreeze() {
  const anonymousId = getOrCreateAnonymousId();
  if (!anonymousId) return null;
  try {
    const response = await fetch("/api/users/freeze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ anonymous_id: anonymousId })
    });
    if (!response.ok) return null;
    const payload = await response.json();
    const current = readReadingStats();
    const next = {
      ...current,
      freezesAvailable: payload.freeze.freezes_available,
      freezesUsedTotal: payload.freeze.freezes_used_total
    };
    saveReadingStats(next);
    return next;
  } catch {
    return null;
  }
}

export async function recordGameAttempt(input: {
  day: string;
  storyId: string;
  sourceId: string;
  sourceKey: string;
  roundId: string;
  cardPosition: number;
  guessedLean: string;
  inputMethod: "swipe" | "tap" | "keyboard";
  responseMs: number;
}) {
  const anonymousId = getOrCreateAnonymousId();
  if (!anonymousId) return null;
  try {
    const response = await fetch("/api/game-attempts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        anonymous_id: anonymousId,
        day: input.day,
        story_id: input.storyId,
        source_id: input.sourceId,
        source_key: input.sourceKey,
        round_id: input.roundId,
        card_position: input.cardPosition,
        mode: "scored",
        guessed_lean: input.guessedLean
        ,input_method: input.inputMethod,
        response_ms: input.responseMs
      })
    });
    if (!response.ok) {
      console.error(`Unable to save Spot the Lean attempt (${response.status}).`);
      return null;
    }
    const payload = await response.json();
    if (payload.user) applyServerUser(payload.user);
    return payload.attempt;
  } catch (error) {
    console.error("Unable to save Spot the Lean attempt.", error);
    return null;
  }
}

export function markStoryRead(storyId: string, preserveStreak = false) {
  const current = readReadingStats();
  const today = localDateKey();
  const alreadyRead = current.readByDate[today]?.includes(storyId) ?? false;
  if (alreadyRead) return current;

  let streak = current.streak;
  if (current.lastReadDate !== today) {
    const continues = current.lastReadDate === yesterdayKey() ||
      (preserveStreak && current.lastReadDate && daysBetween(current.lastReadDate, today) === 2);
    streak = continues ? Math.max(1, current.streak + 1) : 1;
  }

  const next: ReadingStats = {
    streak,
    lastReadDate: today,
    totalStoriesRead: current.totalStoriesRead + 1,
    gameCorrectCount: current.gameCorrectCount,
    gameTotalCount: current.gameTotalCount,
    freezesAvailable: current.freezesAvailable,
    freezesUsedTotal: current.freezesUsedTotal,
    createdAt: current.createdAt,
    readByDate: {
      ...current.readByDate,
      [today]: [...(current.readByDate[today] ?? []), storyId]
    }
  };
  saveReadingStats(next);
  void syncUserStats(next);
  window.dispatchEvent(new CustomEvent("candor:story-completed", { detail: { storyId } }));
  return next;
}

export function updateGameStats(correct: number, total: number) {
  // Spot the Lean only. Fact or Opinion derives accuracy from its scored attempts.
  const current = readReadingStats();
  const next = {
    ...current,
    gameCorrectCount: Math.max(0, Math.min(Math.trunc(correct), Math.trunc(total))),
    gameTotalCount: Math.max(0, Math.trunc(total))
  };
  saveReadingStats(next);
  void syncUserStats(next);
  return next;
}
