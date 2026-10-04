import { afterEach, expect, it, vi } from 'vitest';
import { gsap } from 'gsap';
import { startBackgroundTicker } from '../../src/render/backgroundTicker';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

it('shares a single background clock and stops when the last scene releases it', () => {
  vi.useFakeTimers();
  const tick = vi.spyOn(gsap.ticker, 'tick').mockImplementation(() => {});
  const smoothing = vi.spyOn(gsap.ticker, 'lagSmoothing');
  const stopBattle = startBackgroundTicker();
  const stopHunt = startBackgroundTicker();
  expect(smoothing).toHaveBeenCalledWith(0);
  vi.advanceTimersByTime(300);
  expect(tick).toHaveBeenCalledTimes(3);
  stopBattle();
  vi.advanceTimersByTime(100);
  expect(tick).toHaveBeenCalledTimes(4);
  stopHunt();
  stopHunt();
  vi.advanceTimersByTime(300);
  expect(tick).toHaveBeenCalledTimes(4);
  expect(smoothing).toHaveBeenLastCalledWith(500, 33);
});
