/** A sprite strip driven by the same timeline as the board, not a second CSS clock.
 * Completion is terminal: a delayed asset decode must never replay an old explosion. */
export class FramePlaybackClock {
  private value = 0;
  private listeners = new Set<(progress: number) => void>();
  get progress(): number { return this.value; }
  get done(): boolean { return this.value >= 1; }

  subscribe(listener: (progress: number) => void): () => void {
    if (!this.done) this.listeners.add(listener);
    listener(this.value);
    return () => { this.listeners.delete(listener); };
  }

  advance(progress: number): void {
    if (this.done) return;
    this.value = Math.max(this.value, Math.min(1, Math.max(0, progress)));
    for (const listener of [...this.listeners]) listener(this.value);
    if (this.done) this.listeners.clear();
  }

  finish(): void { this.advance(1); }
}
