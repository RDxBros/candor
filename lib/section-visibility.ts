export class ForegroundSectionTimer {
  private readonly thresholdMs: number;
  private elapsedMs = 0;
  private startedAt: number | null = null;
  private intersecting = false;
  private hidden = true;
  private fired = false;

  constructor(thresholdMs = 1000) {
    this.thresholdMs = thresholdMs;
  }

  private advance(now: number) {
    if (this.startedAt === null) return;
    this.elapsedMs += Math.max(0, now - this.startedAt);
    this.startedAt = now;
  }

  private sync(now: number) {
    this.startedAt = !this.fired && this.intersecting && !this.hidden ? now : null;
  }

  setIntersection(intersecting: boolean, hidden: boolean, now: number) {
    this.advance(now);
    this.intersecting = intersecting;
    this.hidden = hidden;
    this.sync(now);
  }

  setHidden(hidden: boolean, now: number) {
    this.advance(now);
    this.hidden = hidden;
    this.sync(now);
  }

  remaining(now: number) {
    if (this.fired || this.hidden || !this.intersecting) return null;
    const activeMs = this.elapsedMs + (this.startedAt === null ? 0 : Math.max(0, now - this.startedAt));
    return Math.max(0, this.thresholdMs - activeMs);
  }

  consume(now: number) {
    if (this.fired || this.hidden || !this.intersecting) return false;
    this.advance(now);
    if (this.elapsedMs < this.thresholdMs) return false;
    this.fired = true;
    this.startedAt = null;
    return true;
  }
}
