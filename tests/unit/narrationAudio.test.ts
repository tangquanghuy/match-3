import { afterEach, describe, expect, it, vi } from 'vitest';
import { NarrationAudio } from '../../src/render/NarrationAudio';
import type { NarrationClip } from '../../src/render/NarrationCatalog';

const clip: NarrationClip = {id: 'first', pool: 'heavy.ally', url: '/first.mp3', duration: 5};
const other: NarrationClip = {...clip, id: 'second', url: '/second.mp3'};
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function setup() {
  vi.useFakeTimers();
  const sources: {start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>; connect: ReturnType<typeof vi.fn>; onended: (() => void) | null}[] = [];
  const ctx = {state: 'running', decodeAudioData: vi.fn(async () => ({})), createBufferSource: vi.fn(() => {
    const node = {start: vi.fn(), stop: vi.fn(), disconnect: vi.fn(), connect: vi.fn(), onended: null};
    sources.push(node); return node;
  })};
  let enabled = true;
  const speaking = vi.fn();
  const fetcher = vi.fn(async () => ({ok: true, arrayBuffer: async () => new ArrayBuffer(1)}));
  vi.stubGlobal('fetch', fetcher);
  const audio = new NarrationAudio(ctx as unknown as AudioContext, {} as AudioNode, () => enabled, speaking);
  return {audio, ctx, sources, speaking, fetcher, mute: () => { enabled = false; }};
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('narration audio', () => {
  it('loads lazily, caches decoded audio, never overlaps ordinary clips', async () => {
    const x = setup(); expect(x.fetcher).not.toHaveBeenCalled();
    expect(x.audio.play(clip)).toBe(true); expect(x.audio.play(other)).toBe(false);
    await flush(); expect(x.sources[0].start).toHaveBeenCalledTimes(1);
    expect(x.speaking).toHaveBeenLastCalledWith(true);
    x.sources[0].onended?.(); expect(x.audio.isBusy()).toBe(false);
    expect(x.speaking).toHaveBeenLastCalledWith(false);
    x.audio.play(clip); await flush(); expect(x.fetcher).toHaveBeenCalledTimes(1);
    x.audio.dispose();
  });
  it('important commentary interrupts and disconnects the previous source', async () => {
    const x = setup(); x.audio.play(clip); await flush(); x.audio.play(other, true); await flush();
    expect(x.sources).toHaveLength(2); expect(x.sources[0].stop).toHaveBeenCalled();
    expect(x.sources[0].disconnect).toHaveBeenCalled(); expect(x.sources[0].onended).toBeNull();
    x.audio.dispose();
  });
  it('cancels a pending clip when stopped or interrupted', async () => {
    const x = setup(); let resolve!: (r: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(r => {resolve = r;})));
    x.audio.play(clip); x.audio.stop();
    resolve({ok: true, arrayBuffer: async () => new ArrayBuffer(1)} as Response); await flush();
    expect(x.sources).toHaveLength(0); expect(x.audio.isBusy()).toBe(false); x.audio.dispose();
  });
  it('suppresses a clip after mute or context suspension during loading', async () => {
    const x = setup(); x.audio.play(clip); x.mute(); await flush();
    expect(x.sources).toHaveLength(0); expect(x.audio.isBusy()).toBe(false);
    expect(x.audio.play(other)).toBe(false); x.audio.dispose();
    const y = setup(); y.ctx.state = 'suspended'; expect(y.audio.play(clip)).toBe(false); y.audio.dispose();
  });
  it('drops late loads instead of narrating an old turn', async () => {
    const x = setup(); let resolve!: (r: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(r => {resolve = r;})));
    x.audio.play(clip); vi.advanceTimersByTime(1801);
    resolve({ok: true, arrayBuffer: async () => new ArrayBuffer(1)} as Response); await flush();
    expect(x.sources).toHaveLength(0); expect(x.audio.isBusy()).toBe(false); x.audio.dispose();
  });
  it('retries failed requests and decoding without leaving the player busy', async () => {
    const x = setup(); x.fetcher.mockRejectedValueOnce(new Error('network'));
    x.audio.play(clip); await flush(); expect(x.audio.isBusy()).toBe(false);
    x.audio.play(clip); await flush(); expect(x.sources).toHaveLength(1); x.audio.stop();
    x.ctx.decodeAudioData.mockRejectedValueOnce(new Error('decode'));
    x.audio.play(other); await flush(); expect(x.audio.isBusy()).toBe(false); x.audio.dispose();
  });
  it('dispose aborts outstanding requests and prevents further playback', async () => {
    const x = setup(); let signal: AbortSignal | undefined;
    vi.stubGlobal('fetch', vi.fn((_url: string, opts: RequestInit) => {
      signal = opts.signal as AbortSignal;
      return new Promise<Response>((_resolve, reject) => signal!.addEventListener('abort', () => reject(new Error('aborted'))));
    }));
    x.audio.preload(clip); x.audio.dispose(); await flush();
    expect(signal?.aborted).toBe(true); expect(x.audio.play(other, true)).toBe(false);
    expect(x.sources).toHaveLength(0);
  });
  it('waits for the actual final sample before releasing a result voice', async () => {
    const x = setup(); x.audio.play(clip, true);
    const finished = vi.fn(); void x.audio.whenIdle().then(finished);
    await flush(); vi.advanceTimersByTime(1000); await flush();
    expect(finished).not.toHaveBeenCalled();
    expect(x.sources[0].stop).not.toHaveBeenCalled();
    x.sources[0].onended?.(); await flush();
    expect(finished).toHaveBeenCalledTimes(1);
    x.audio.dispose();
  });
  it('releases result waiters on download failure, timeout or explicit mute', async () => {
    const x = setup(); x.audio.play(clip, true);
    const finished = vi.fn(); void x.audio.whenIdle().then(finished);
    x.audio.stop(); await flush();
    expect(finished).toHaveBeenCalledTimes(1); x.audio.dispose();
  });
  it('bounds the cache rather than retaining all recordings', async () => {
    const x = setup();
    for (let i = 0; i < 18; i++) x.audio.preload({...clip, id: `clip-${i}`});
    await flush(); expect(x.fetcher).toHaveBeenCalledTimes(18);
    x.audio.preload({...clip, id: 'clip-0'}); await flush(); expect(x.fetcher).toHaveBeenCalledTimes(19);
    x.audio.dispose();
  });
});
