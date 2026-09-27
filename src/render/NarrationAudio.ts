import type { NarrationClip } from './NarrationCatalog';

/** One voice at a time, lazy decoding, bounded cache, cancellation across async loads. */
export class NarrationAudio {
  private requests = new Set<AbortController>();
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  private source: AudioBufferSourceNode | null = null;
  private generation = 0;
  private disposed = false;
  private busy = false;
  private idleWaiters = new Set<() => void>();
  private deadline: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private ctx: AudioContext,
    private bus: AudioNode,
    private enabled: () => boolean,
    private onSpeaking: (speaking: boolean) => void,
  ) {}

  isBusy(): boolean { return this.busy; }

  whenIdle(): Promise<void> {
    return this.busy ? new Promise(resolve => this.idleWaiters.add(resolve)) : Promise.resolve();
  }

  preload(clip: NarrationClip): void {
    if (!this.disposed && this.enabled()) void this.load(clip);
  }

  private load(clip: NarrationClip): Promise<AudioBuffer | null> {
    const existing = this.buffers.get(clip.id);
    if (existing) return existing;
    const controller = new AbortController();
    this.requests.add(controller);
    const timeout = setTimeout(() => controller.abort(), 8000);
    const pending = (async () => {
      try {
        const response = await fetch(clip.url, { signal: controller.signal });
        if (!response.ok || this.disposed) return null;
        const bytes = await response.arrayBuffer();
        if (this.disposed) return null;
        return await this.ctx.decodeAudioData(bytes);
      } catch { return null; }
      finally { clearTimeout(timeout); this.requests.delete(controller); }
    })();
    this.buffers.set(clip.id, pending);
    // Eviction only drops our reference; an in-flight selected clip can still finish safely.
    while (this.buffers.size > 16) this.buffers.delete(this.buffers.keys().next().value!);
    void pending.then((buffer) => {
      if (!buffer && this.buffers.get(clip.id) === pending) this.buffers.delete(clip.id);
    });
    return pending;
  }

  /** Returns whether accepted, not whether a blocked/failed browser actually emitted sound. */
  play(clip: NarrationClip, interrupt = false): boolean {
    if (this.disposed || this.ctx.state !== 'running' || !this.enabled()) return false;
    if (this.busy && !interrupt) return false;
    this.stop();
    const ticket = this.generation;
    this.busy = true;
    // A slow download must not speak about an old turn several seconds later.
    this.deadline = setTimeout(() => {
      if (ticket === this.generation) this.stop();
    }, interrupt ? 6000 : 1800);
    void this.load(clip).then((buffer) => {
      if (ticket !== this.generation || this.disposed) return;
      if (!buffer || !this.enabled() || this.ctx.state !== 'running') { this.stop(); return; }
      if (this.deadline) clearTimeout(this.deadline);
      this.deadline = null;
      try {
        const source = this.ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(this.bus);
        source.onended = () => { if (ticket === this.generation) this.stop(); };
        this.source = source;
        this.onSpeaking(true);
        source.start();
      } catch { this.stop(); }
    });
    return true;
  }

  stop(): void {
    this.generation++;
    if (this.deadline) clearTimeout(this.deadline);
    this.deadline = null;
    const source = this.source;
    this.source = null;
    if (source) {
      source.onended = null;
      try { source.stop(); source.disconnect(); } catch { /* Already ended. */ }
    }
    this.busy = false;
    this.onSpeaking(false);
    for (const resolve of this.idleWaiters) resolve();
    this.idleWaiters.clear();
  }

  dispose(): void {
    this.disposed = true;
    this.stop();
    this.buffers.clear();
    for (const request of this.requests) request.abort();
    this.requests.clear();
  }
}
