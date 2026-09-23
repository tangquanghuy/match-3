import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resetBattlePrefs,
  setSkipCastConfirm,
  skipCastConfirm,
} from '../../src/render/battlePrefs';

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

describe('battle cast confirmation preference', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { localStorage: storageStub() });
    resetBattlePrefs();
  });

  afterEach(() => {
    resetBattlePrefs();
    vi.unstubAllGlobals();
  });

  it('defaults to showing confirmation and persists both toggle directions', () => {
    expect(skipCastConfirm()).toBe(false);

    setSkipCastConfirm(true);
    expect(skipCastConfirm()).toBe(true);
    expect(window.localStorage.getItem('battle.skipCastConfirm')).toBe('1');

    setSkipCastConfirm(false);
    expect(skipCastConfirm()).toBe(false);
    expect(window.localStorage.getItem('battle.skipCastConfirm')).toBe('0');
  });

  it('keeps the setting available in memory when localStorage rejects writes', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => { throw new Error('blocked'); },
        setItem: () => { throw new Error('blocked'); },
        removeItem: () => { throw new Error('blocked'); },
      },
    });

    setSkipCastConfirm(true);
    expect(skipCastConfirm()).toBe(true);
  });
});
