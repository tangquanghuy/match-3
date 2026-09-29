import { afterEach, describe, expect, it, vi } from 'vitest';
import { NarrationAudio } from '../../src/render/NarrationAudio';
import type { NarrationClip } from '../../src/render/NarrationCatalog';
import { registerAudioForTest, resetAudioBankForTest } from '../../src/render/audioBank';

const clip: NarrationClip = {id: 'first', pool: 'heavy.ally', url: '/first.mp3', duration: 5};
const other: NarrationClip = {...clip, id: 'second', url: '/second.mp3'};
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function setup() {
  registerAudioForTest(clip.url, new ArrayBuffer(1));
  registerAudioForTest(other.url, new ArrayBuffer(1));
  const sources: {start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>; connect: ReturnType<typeof vi.fn>; onended: (() => void) | null}[] = [];
  const ctx = {state: 'running', decodeAudioData: vi.fn(async () => ({})), createBufferSource: vi.fn(() => {
    const node = {start: vi.fn(), stop: vi.fn(), disconnect: vi.fn(), connect: vi.fn(), onended: null};
    sources.push(node); return node;
  })};
  let enabled = true;
  const speaking = vi.fn();
  const caption = vi.fn();
  const audio = new NarrationAudio(ctx as unknown as AudioContext, {} as AudioNode, () => enabled, speaking, caption);
  return {audio, ctx, sources, speaking, caption, mute: () => { enabled = false; }};
}
afterEach(() => { resetAudioBankForTest(); });

describe('narration audio', () => {
  it('decodes preloaded bytes, caches decoded audio, never overlaps ordinary clips', async () => {
    const x = setup();
    expect(x.audio.play(clip)).toBe(true); expect(x.audio.play(other)).toBe(false);
    await flush(); expect(x.sources[0].start).toHaveBeenCalledTimes(1);
    expect(x.speaking).toHaveBeenLastCalledWith(true);
    x.sources[0].onended?.(); expect(x.audio.isBusy()).toBe(false);
    expect(x.speaking).toHaveBeenLastCalledWith(false);
    x.audio.play(clip); await flush(); expect(x.ctx.decodeAudioData).toHaveBeenCalledTimes(1);
    x.audio.dispose();
  });
  it('throws when a clip was not preloaded instead of staying silent', () => {
    const x = setup();
    expect(() => x.audio.play({...clip, id: 'missing', url: '/missing.mp3'})).toThrow(/解说未预载/);
    x.audio.dispose();
  });
  it('important commentary interrupts and disconnects the previous source', async () => {
    const x = setup(); x.audio.play(clip); await flush(); x.audio.play(other, true); await flush();
    expect(x.sources).toHaveLength(2); expect(x.sources[0].stop).toHaveBeenCalled();
    expect(x.sources[0].disconnect).toHaveBeenCalled(); expect(x.sources[0].onended).toBeNull();
    x.audio.dispose();
  });
  it('cancels a pending clip when stopped before decoding finishes', async () => {
    const x = setup(); let resolve!: (b: AudioBuffer) => void;
    x.ctx.decodeAudioData.mockImplementationOnce(() => new Promise(r => { resolve = r as never; }));
    x.audio.play(clip); x.audio.stop();
    resolve({} as AudioBuffer); await flush();
    expect(x.sources).toHaveLength(0); expect(x.audio.isBusy()).toBe(false); x.audio.dispose();
  });
  it('suppresses a clip after mute or context suspension', async () => {
    const x = setup(); x.audio.play(clip); x.mute(); await flush();
    expect(x.sources).toHaveLength(0); expect(x.audio.isBusy()).toBe(false);
    expect(x.audio.play(other)).toBe(false); x.audio.dispose();
    const y = setup(); y.ctx.state = 'suspended'; expect(y.audio.play(clip)).toBe(false); y.audio.dispose();
  });
  it('dispose prevents further playback', () => {
    const x = setup(); x.audio.dispose();
    expect(x.audio.play(other, true)).toBe(false); expect(x.sources).toHaveLength(0);
  });
  it('waits for the actual final sample before releasing a result voice', async () => {
    const x = setup(); x.audio.play(clip, true);
    const finished = vi.fn(); void x.audio.whenIdle().then(finished);
    await flush();
    expect(finished).not.toHaveBeenCalled();
    expect(x.sources[0].stop).not.toHaveBeenCalled();
    x.sources[0].onended?.(); await flush();
    expect(finished).toHaveBeenCalledTimes(1);
    x.audio.dispose();
  });
  it('releases result waiters on explicit stop', async () => {
    const x = setup(); x.audio.play(clip, true);
    const finished = vi.fn(); void x.audio.whenIdle().then(finished);
    x.audio.stop(); await flush();
    expect(finished).toHaveBeenCalledTimes(1); x.audio.dispose();
  });
  it('bounds the decoded cache rather than retaining all recordings', async () => {
    const x = setup();
    for (let i = 0; i < 18; i++) {
      registerAudioForTest(`/clip-${i}.mp3`, new ArrayBuffer(1));
      x.audio.preload({...clip, id: `clip-${i}`, url: `/clip-${i}.mp3`});
    }
    await flush(); expect(x.ctx.decodeAudioData).toHaveBeenCalledTimes(18);
    x.audio.preload({...clip, id: 'clip-0', url: '/clip-0.mp3'}); await flush();
    expect(x.ctx.decodeAudioData).toHaveBeenCalledTimes(19);
    x.audio.dispose();
  });
});

describe('captions follow actual audio, not selection or guessed duration', () => {
  it('preload is silent; caption starts after source.start and clears at natural end', async () => {
    const x = setup();
    x.audio.preload(clip); await flush();
    expect(x.caption).not.toHaveBeenCalled();
    x.audio.play(clip);
    expect(x.caption.mock.calls.filter(([value]) => value !== null)).toHaveLength(0);
    await flush();
    expect(x.caption).toHaveBeenLastCalledWith(clip);
    expect(x.sources[0].start.mock.invocationCallOrder[0]).toBeLessThan(x.caption.mock.invocationCallOrder.at(-1)!);
    x.sources[0].onended?.();
    expect(x.caption).toHaveBeenLastCalledWith(null);
    x.audio.dispose();
  });
  it('interruption replaces captions; a stale completion cannot hide the current line', async () => {
    const x = setup(); x.audio.play(clip); await flush();
    const ended = x.sources[0].onended;
    x.audio.play(other, true); await flush();
    expect(x.caption).toHaveBeenLastCalledWith(other);
    ended?.();
    expect(x.caption).toHaveBeenLastCalledWith(other);
    x.audio.stop(); expect(x.caption).toHaveBeenLastCalledWith(null);
    x.audio.dispose();
  });
});
