import type { ListeningSnapshot } from "./listening-clock.ts";
import type { PlaybackSession, ProgressPayload } from "./playback.ts";

export class PlaybackRequestError extends Error {
  readonly retryable: boolean;
  constructor(retryable: boolean, message: string) { super(message); this.retryable = retryable; }
}
export type TrackingStatus = { state: "opening" | "saving" | "saved" | "closed" | "error"; message: string; canRetry: boolean };
type Options = { open: () => Promise<PlaybackSession>; progress: (id: string, input: ProgressPayload) => Promise<PlaybackSession>;
  close: (id: string) => Promise<PlaybackSession>; isCurrent: () => boolean; notify: (status: TrackingStatus) => void;
  delay?: () => Promise<void> };

export class PlaybackQueue {
  private options: Options;
  private session: PlaybackSession | null = null;
  private latest: ListeningSnapshot | null = null;
  private pending: ProgressPayload | null = null;
  private acknowledged: ListeningSnapshot = { positionMs: 0, listenedMsTotal: 0 };
  private nextSequence = 1;
  private started = false;
  private stopped = false;
  private blocked = false;
  private detached = false;
  private terminal = false;
  private closed = false;
  private opening: Promise<void> | null = null;
  private worker: Promise<void> | null = null;

  constructor(options: Options) { this.options = options; }

  private current() {
    if (this.stopped || !this.options.isCurrent()) { this.stopped = true; this.latest = null; this.pending = null; return false; }
    return true;
  }
  private notify(state: TrackingStatus["state"], message: string, canRetry = false) {
    if (!this.detached && this.current()) this.options.notify({ state, message, canRetry });
  }
  start(snapshot: ListeningSnapshot): Promise<void> {
    if (this.started) { this.offer(snapshot); return this.opening ?? Promise.resolve(); }
    if (!this.current()) return Promise.resolve();
    this.started = true; this.latest = { ...snapshot };
    this.notify("opening", "Starting listening history…");
    this.opening = (async () => {
      try {
        const session = await this.options.open();
        if (!this.current()) return;
        this.session = session;
        await this.pump();
      } catch {
        this.blocked = true;
        // Opening is not idempotent: a lost reply may already have created a session.
        this.notify("error", "Listening history could not be started or confirmed. Audio can continue.");
      }
    })();
    return this.opening;
  }
  offer(snapshot: ListeningSnapshot) {
    if (this.terminal || this.closed || !this.current()) return;
    this.latest = { ...snapshot };
    if (this.started) void this.pump();
  }
  async finish(snapshot: ListeningSnapshot): Promise<void> {
    if (!this.terminal) this.latest = { ...snapshot };
    this.terminal = true;
    if (!this.started || !this.current()) return;
    await this.opening;
    while (this.session && !this.blocked && !this.closed && this.current()) await this.pump();
  }
  detach(snapshot: ListeningSnapshot) { this.detached = true; void this.finish(snapshot); }
  retry() { if (!this.session || !this.current() || this.closed) return; this.blocked = false; void this.pump(); }

  private async attempt(operation: () => Promise<PlaybackSession>): Promise<PlaybackSession> {
    for (let attempt = 0; ; attempt++) {
      if (!this.current()) throw new PlaybackRequestError(false, "Account changed.");
      try { return await operation(); }
      catch (error) {
        if (!this.current() || attempt >= 2 || (error instanceof PlaybackRequestError && !error.retryable)) throw error;
        await (this.options.delay?.() ?? new Promise(resolve => setTimeout(resolve, 150)));
      }
    }
  }
  private pump(): Promise<void> {
    if (this.worker) return this.worker;
    if (!this.session || this.blocked || this.closed || !this.current()) return Promise.resolve();
    this.worker = this.run().finally(() => {
      this.worker = null;
      // A reading may arrive between run returning and this completion callback.
      if (this.session && !this.blocked && !this.closed && this.current() && (this.latest || this.terminal)) void this.pump();
    });
    return this.worker;
  }
  private async run() {
    while (this.session && this.current()) {
      if (!this.pending && this.latest) {
        const snapshot = this.latest; this.latest = null;
        if (snapshot.positionMs !== this.acknowledged.positionMs || snapshot.listenedMsTotal !== this.acknowledged.listenedMsTotal) {
          this.pending = { sequence: this.nextSequence, ...snapshot };
        }
      }
      if (this.pending) {
        const payload = this.pending, id = this.session.id;
        this.notify("saving", "Saving listening progress…");
        try {
          const confirmed = await this.attempt(() => this.options.progress(id, payload));
          if (!this.current()) return;
          if (confirmed.id !== id || confirmed.lastSequence < payload.sequence) throw new PlaybackRequestError(false, "Mismatched progress response.");
          this.session = confirmed; this.acknowledged = payload; this.nextSequence = payload.sequence + 1; this.pending = null;
          this.notify("saved", "Listening progress saved.");
        } catch {
          this.blocked = true; this.notify("error", "Listening progress could not be saved. Audio can continue.", true); return;
        }
        continue;
      }
      if (this.terminal && !this.closed) {
        const id = this.session.id;
        this.notify("saving", "Saving the end of this listening session…");
        try {
          const confirmed = await this.attempt(() => this.options.close(id));
          if (!this.current()) return;
          if (confirmed.id !== id || confirmed.endedAt === null) throw new PlaybackRequestError(false, "Mismatched close response.");
          this.session = confirmed; this.closed = true; this.notify("closed", "Listening session saved.");
        } catch {
          this.blocked = true; this.notify("error", "The end of this listening session could not be saved. Audio can continue.", true);
        }
      }
      return;
    }
  }
}
