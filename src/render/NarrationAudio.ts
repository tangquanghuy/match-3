import type { NarrationClip } from './NarrationCatalog';
import { encodedAudio } from './audioBank';

/**
 * 解说播放：同一时刻只有一条。编码字节进战斗前已全部下载进 audioBank，
 * 这里只做本地解码（毫秒级），解码结果留一个小缓存。
 */
export class NarrationAudio {
  private buffers = new Map<string, Promise<AudioBuffer>>();
  private source: AudioBufferSourceNode | null = null;
  private generation = 0;
  private disposed = false;
  private busy = false;
  private idleWaiters = new Set<() => void>();

  constructor(
    private ctx: AudioContext,
    private bus: AudioNode,
    private enabled: () => boolean,
    private onSpeaking: (speaking: boolean) => void,
    private onClip: (clip: NarrationClip | null) => void = () => {},
  ) {}

  isBusy(): boolean { return this.busy; }

  whenIdle(): Promise<void> {
    return this.busy ? new Promise(resolve => this.idleWaiters.add(resolve)) : Promise.resolve();
  }

  /** 提前解码（选中台词到开口之间的空档） */
  preload(clip: NarrationClip): void {
    if (!this.disposed && this.enabled()) void this.decode(clip);
  }

  private decode(clip: NarrationClip): Promise<AudioBuffer> {
    const existing = this.buffers.get(clip.id);
    if (existing) return existing;
    const pending = this.ctx.decodeAudioData(encodedAudio(clip.url));
    this.buffers.set(clip.id, pending);
    while (this.buffers.size > 16) this.buffers.delete(this.buffers.keys().next().value!);
    return pending;
  }

  /** Returns whether accepted, not whether a blocked browser actually emitted sound. */
  play(clip: NarrationClip, interrupt = false): boolean {
    if (this.disposed || this.ctx.state !== 'running' || !this.enabled()) return false;
    if (this.busy && !interrupt) return false;
    this.stop();
    const ticket = this.generation;
    this.busy = true;
    void this.decode(clip).then((buffer) => {
      if (ticket !== this.generation || this.disposed) return;
      if (!this.enabled() || this.ctx.state !== 'running') { this.stop(); return; }
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(this.bus);
      source.onended = () => { if (ticket === this.generation) this.stop(); };
      this.source = source;
      source.start();
      this.onSpeaking(true);
      this.onClip(clip);
    }).catch((error: unknown) => {
      if (ticket === this.generation) this.stop();
      throw error;
    });
    return true;
  }

  stop(): void {
    this.generation++;
    const source = this.source;
    this.source = null;
    if (source) {
      source.onended = null;
      try { source.stop(); source.disconnect(); } catch { /* Already ended. */ }
    }
    this.busy = false;
    this.onSpeaking(false);
    this.onClip(null);
    for (const resolve of this.idleWaiters) resolve();
    this.idleWaiters.clear();
  }

  dispose(): void {
    this.disposed = true;
    this.stop();
    this.buffers.clear();
  }
}
