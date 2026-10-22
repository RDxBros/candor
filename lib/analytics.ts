"use client";

import { getOrCreateAnonymousId, localDateKey } from "./client-storage.ts";
import type { AnalyticsEventName } from "./analytics-schema.ts";

const SESSION_KEY = "candor:analytics-session-id";
const warned = new Set<string>();
const pending: Array<[AnalyticsEventName, Record<string, string | number | boolean>]> = [];
let waitingForUser = false;

export function createAnalyticsSessionId(cryptoApi: Pick<Crypto, "randomUUID" | "getRandomValues"> | undefined = globalThis.crypto) {
  if (typeof cryptoApi?.randomUUID === "function") return cryptoApi.randomUUID();
  if (typeof cryptoApi?.getRandomValues === "function") {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0"));
    return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
  }
  return `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function warnOnce(kind: string) {
  if (process.env.NODE_ENV === "production" || warned.has(kind)) return;
  warned.add(kind);
  console.warn(`[analytics] ${kind}`);
}

export function analyticsContext() {
  if (typeof window === "undefined") return { session_id: null, client_local_date: null };
  let sessionId: string | null = null;
  try {
    sessionId = sessionStorage.getItem(SESSION_KEY);
    if (!sessionId) {
      sessionId = createAnalyticsSessionId();
      sessionStorage.setItem(SESSION_KEY, sessionId);
    }
  } catch {
    sessionId = createAnalyticsSessionId();
  }
  return { session_id: sessionId, client_local_date: localDateKey() };
}

export function track(eventName: AnalyticsEventName, properties: Record<string, string | number | boolean> = {}) {
  try {
    if (sessionStorage.getItem("candor:user-ready") !== "1") {
      pending.push([eventName, properties]);
      if (!waitingForUser) {
        waitingForUser = true;
        window.addEventListener("candor:user-ready", () => {
          waitingForUser = false;
          for (const [queuedName, queuedProperties] of pending.splice(0)) track(queuedName, queuedProperties);
        }, { once: true });
      }
      return;
    }
    const anonymousId = getOrCreateAnonymousId();
    if (!anonymousId) return;
    const payload = JSON.stringify({ anonymous_id: anonymousId, event_name: eventName, properties, ...analyticsContext() });
    if (typeof navigator.sendBeacon === "function") {
      const queued = navigator.sendBeacon("/api/events", new Blob([payload], { type: "application/json" }));
      if (queued) return;
    }
    void fetch("/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: payload, keepalive: true }).catch(() => warnOnce("network failure"));
  } catch { warnOnce("client failure"); }
}

export class VisibleTimer {
  private elapsed = 0;
  private started: number | null = null;
  private readonly capMs: number;
  private readonly now: () => number;
  constructor(capMs = 300_000, now = () => performance.now()) {
    this.capMs = capMs;
    this.now = now;
    if (typeof document !== "undefined" && !document.hidden) this.started = this.now();
  }
  pause(now = this.now()) { if (this.started !== null) this.elapsed += now - this.started; this.started = null; }
  resume(now = this.now()) { if (this.started === null && typeof document !== "undefined" && !document.hidden) this.started = now; }
  value(now = this.now()) { return Math.min(this.capMs, Math.max(0, Math.round(this.elapsed + (this.started === null ? 0 : now - this.started)))); }
}

