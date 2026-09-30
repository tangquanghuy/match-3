/** Finite visual work only. Persistent idle/status loops never enter this registry. */
export class FiniteVisuals {
  private entries = new Map<object, () => void>();
  private listeners = new Set<() => void>();
  private epoch = 0;
  get generation(): number { return this.epoch; }
  get size(): number { return this.entries.size; }

  begin(cleanup: () => void = () => {}) {
    const key = {};
    const generation = this.epoch;
    this.entries.set(key, cleanup);
    const isActive = () => generation === this.epoch && this.entries.has(key);
    return {
      get active() { return isActive(); },
      finish: () => {
        if (this.entries.delete(key)) this.notify();
      },
    };
  }
  private notify(): void { for (const listener of [...this.listeners]) listener(); }
  cancel(): void {
    const cleanups = [...this.entries.values()];
    this.entries.clear(); this.epoch++;
    for (const cleanup of cleanups) cleanup();
    this.notify();
  }
  async waitForIdle(generation = this.epoch): Promise<void> {
    while (generation === this.epoch && this.entries.size) {
      await new Promise<void>(resolve => {
        const done = () => { this.listeners.delete(done); resolve(); };
        this.listeners.add(done);
      });
    }
  }
  /** Returns false when teardown cancelled the wait, including DOM animation waits. */
  raceCancellation<T>(promise: Promise<T>, generation = this.epoch): Promise<boolean> {
    if (generation !== this.epoch) return Promise.resolve(false);
    return new Promise(resolve => {
      const cancelled = () => { if (generation !== this.epoch) finish(false); };
      const finish = (completed: boolean) => { this.listeners.delete(cancelled); resolve(completed); };
      this.listeners.add(cancelled);
      void promise.then(() => finish(true), () => finish(true));
    });
  }
}
