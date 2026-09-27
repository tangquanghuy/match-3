import { describe, expect, it, vi } from 'vitest';
import { FiniteVisuals } from '@render/FiniteVisuals';
describe('finite visual drain', () => {
  it('waits for every concurrent finite effect, not just the first', async () => {
    const visuals = new FiniteVisuals();
    const first = visuals.begin(), second = visuals.begin();
    let done = false;
    const wait = visuals.waitForIdle().then(() => { done = true; });
    first.finish(); await Promise.resolve(); expect(done).toBe(false);
    second.finish(); await wait; expect(done).toBe(true);
  });
  it('includes async preload and a child spawned at projectile arrival', async () => {
    const visuals = new FiniteVisuals();
    const preload = visuals.begin();
    let done = false;
    const wait = visuals.waitForIdle().then(() => { done = true; });
    const child = visuals.begin(); preload.finish();
    await Promise.resolve(); expect(done).toBe(false);
    child.finish(); await wait; expect(done).toBe(true);
  });
  it('finish is idempotent and completed tokens are inactive', () => {
    const visuals = new FiniteVisuals(); const token = visuals.begin();
    expect(token.active).toBe(true); token.finish(); token.finish();
    expect(token.active).toBe(false); expect(visuals.size).toBe(0);
  });
  it('cancel cleans up, invalidates delayed preload, and releases all waits', async () => {
    const visuals = new FiniteVisuals(), cleanup = vi.fn();
    const token = visuals.begin(cleanup), epoch = visuals.generation;
    const wait = visuals.waitForIdle();
    const domWait = visuals.raceCancellation(new Promise<void>(() => {}));
    visuals.cancel(); await wait;
    expect(await domWait).toBe(false); expect(cleanup).toHaveBeenCalledOnce();
    expect(token.active).toBe(false); expect(visuals.generation).toBe(epoch + 1);
    expect(await visuals.raceCancellation(Promise.resolve(), epoch)).toBe(false);
  });
  it('normal DOM completion does not cancel independent persistent effects', async () => {
    const visuals = new FiniteVisuals();
    expect(await visuals.raceCancellation(Promise.resolve())).toBe(true);
    expect(visuals.size).toBe(0);
  });
  it('old completion never removes new-generation work', () => {
    const visuals = new FiniteVisuals(); const old = visuals.begin(); visuals.cancel();
    const current = visuals.begin(); old.finish();
    expect(visuals.size).toBe(1); expect(current.active).toBe(true); current.finish();
  });
});
