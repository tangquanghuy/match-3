/** One durable identity per actor; cache reads, never rewrite it on a cold start. */
export class PlayerIdentity {
  private current: string | null = null;
  private loaded = false;
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly storage: {
    read(): Promise<string | undefined>;
    write(playerId: string): Promise<void>;
  }) {}

  get value(): string | null { return this.current; }

  bind(playerId?: string): Promise<void> {
    const run = this.queue.then(async () => {
      if (!this.loaded) {
        this.current = await this.storage.read() ?? null;
        this.loaded = true;
      }
      if (!playerId) return;
      if (this.current) {
        if (this.current !== playerId) throw new Error('Player actor identity mismatch');
        return;
      }
      // Do not expose an identity until its durable write has succeeded.
      await this.storage.write(playerId);
      this.current = playerId;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }
}
