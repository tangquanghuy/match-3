/** Tracks complete HTTP requests, including body reads. Short requests stay unobtrusive. */
export class NetworkActivity {
  private pending = 0;
  private visible = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly listeners = new Set<(waiting: boolean) => void>();

  constructor(private readonly delayMs = 450) {}

  subscribe(listener: (waiting: boolean) => void): () => void {
    this.listeners.add(listener);
    listener(this.visible);
    return () => { this.listeners.delete(listener); };
  }

  async track<T>(request: () => Promise<T>): Promise<T> {
    if (++this.pending === 1) {
      this.timer = setTimeout(() => { this.timer = undefined; this.setVisible(true); }, this.delayMs);
    }
    try {
      return await request();
    } finally {
      if (--this.pending === 0) {
        clearTimeout(this.timer);
        this.timer = undefined;
        this.setVisible(false);
      }
    }
  }

  private setVisible(value: boolean): void {
    if (this.visible === value) return;
    this.visible = value;
    for (const listener of this.listeners) listener(value);
  }
}

export const networkActivity = new NetworkActivity();
