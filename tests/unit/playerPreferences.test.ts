import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioManager } from '../../src/render/AudioManager';
import {
  DEFAULT_PLAYER_PREFERENCES,
  PLAYER_PREFERENCES_KEY,
  applyPlayerPreferences,
  getPlayerPreferences,
  resetPlayerPreferences,
  setPlayerPreferences,
} from '../../src/preferences/playerPreferences';

function storageStub(initial: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(initial));
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

class FakeParam {
  value = 0;
  setValueAtTime(): void {}
  exponentialRampToValueAtTime(): void {}
}

function wireAudio(manager: AudioManager): { created: () => number; bus: { gain: FakeParam } } {
  let nodeCount = 0;
  const bus = { gain: new FakeParam(), connect: () => {} };
  const context = {
    currentTime: 0,
    createGain: () => {
      nodeCount += 1;
      return { gain: new FakeParam(), connect: () => {} };
    },
    createOscillator: () => {
      nodeCount += 1;
      return {
        type: '' as OscillatorType,
        frequency: new FakeParam(),
        connect: () => {},
        start: () => {},
        stop: () => {},
      };
    },
  };
  const slots = manager as unknown as Record<string, unknown>;
  slots.ctx = context;
  slots.sfxBus = bus;
  slots.master = { gain: new FakeParam() };
  return { created: () => nodeCount, bus };
}

describe('player preferences', () => {
  const dataset: Record<string, string> = {};

  beforeEach(() => {
    vi.stubGlobal('window', {
      localStorage: storageStub(),
      matchMedia: () => ({ matches: false }),
    });
    vi.stubGlobal('document', { documentElement: { dataset } });
    for (const key of Object.keys(dataset)) delete dataset[key];
    resetPlayerPreferences();
  });

  afterEach(() => {
    resetPlayerPreferences();
    vi.unstubAllGlobals();
  });

  it('persists sound and motion choices with a clamped volume', () => {
    expect(getPlayerPreferences()).toEqual(DEFAULT_PLAYER_PREFERENCES);

    setPlayerPreferences({
      soundEffectsEnabled: false,
      soundEffectsVolume: 1.7,
      reducedMotion: true,
    });

    expect(getPlayerPreferences()).toEqual({
      soundEffectsEnabled: false,
      soundEffectsVolume: 1,
      reducedMotion: true,
    });
    expect(JSON.parse(window.localStorage.getItem(PLAYER_PREFERENCES_KEY)!)).toMatchObject({
      soundEffectsEnabled: false,
      soundEffectsVolume: 1,
      reducedMotion: true,
    });
    expect(dataset.motion).toBe('reduced');
    expect(dataset.soundEffects).toBe('off');
  });

  it('also honors the operating-system reduced-motion preference', () => {
    vi.stubGlobal('window', {
      localStorage: storageStub(),
      matchMedia: () => ({ matches: true }),
    });
    applyPlayerPreferences();
    expect(dataset.motion).toBe('reduced');
  });

  it('recovers from damaged storage and keeps same-session choices when writes are blocked', () => {
    vi.stubGlobal('window', {
      localStorage: storageStub({ [PLAYER_PREFERENCES_KEY]: '{broken' }),
      matchMedia: () => ({ matches: false }),
    });
    expect(getPlayerPreferences()).toEqual(DEFAULT_PLAYER_PREFERENCES);

    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => { throw new Error('blocked'); },
        setItem: () => { throw new Error('blocked'); },
        removeItem: () => { throw new Error('blocked'); },
      },
      matchMedia: () => ({ matches: false }),
    });
    setPlayerPreferences({ reducedMotion: true, soundEffectsEnabled: false });
    expect(getPlayerPreferences()).toMatchObject({ reducedMotion: true, soundEffectsEnabled: false });
    expect(dataset.motion).toBe('reduced');
  });

  it('makes AudioManager consume the shared mute and volume values at playback time', () => {
    const manager = new AudioManager();
    const { created, bus } = wireAudio(manager);

    setPlayerPreferences({ soundEffectsEnabled: false, soundEffectsVolume: 0.35 });
    manager.play('swap');
    expect(created()).toBe(0);
    expect(bus.gain.value).toBe(0.35);

    setPlayerPreferences({ soundEffectsEnabled: true });
    manager.play('swap');
    expect(created()).toBe(2);
    expect(bus.gain.value).toBe(0.35);
  });
});
