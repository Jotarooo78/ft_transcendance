export type ListeningSnapshot = { positionMs: number; listenedMsTotal: number };
export type ClockReading = { nowMs: number; positionMs: number; playing: boolean; discontinuity?: boolean };

export class ListeningClock {
  private previous: ClockReading | null = null;
  private total = 0;

  sample(reading: ClockReading): ListeningSnapshot {
    if (!Number.isFinite(reading.nowMs) || reading.nowMs < 0 || !Number.isFinite(reading.positionMs) ||
      reading.positionMs < 0 || reading.positionMs > Number.MAX_SAFE_INTEGER) throw new Error("Invalid audio clock reading");
    const previous = this.previous;
    if (previous?.playing && !reading.discontinuity) {
      const elapsed = reading.nowMs - previous.nowMs, advance = reading.positionMs - previous.positionMs;
      // Discard suspended intervals and jumps. The 250 ms tolerance detects
      // sampling jitter; it never adds credit beyond elapsed time or audio advance.
      if (elapsed >= 0 && elapsed <= 2500 && advance >= 0 && advance <= elapsed + 250) {
        this.total = Math.min(Number.MAX_SAFE_INTEGER, this.total + Math.min(elapsed, advance));
      }
    }
    this.previous = { ...reading };
    return this.snapshot();
  }

  snapshot(): ListeningSnapshot {
    return { positionMs: Math.floor(this.previous?.positionMs ?? 0), listenedMsTotal: Math.floor(this.total) };
  }

  reset() { this.previous = null; this.total = 0; }
}
