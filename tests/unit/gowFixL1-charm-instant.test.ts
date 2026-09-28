// R008: Charm is a temporary negative status (same family as Silence), auto-recovering per R004.
// Closes L1-charm-instant as "no difference": the engine keeps charm as a lasting status.
import { describe, it, expect } from 'vitest';
import { applyStatus, tickStatuses, isCharmed } from '@engine/skills/effects/status';
import type { SeededRNG } from '@engine/rng';
import { damageCharacter } from '../helpers/damageFixture';

const rngOf = (v: number) => ({ next: () => v }) as unknown as SeededRNG;

describe('R008 charm = auto-recovering negative status (R004)', () => {
  it('charm persists without a hard turn cap while the recovery roll misses', () => {
    const c = damageCharacter(10, {});
    applyStatus(c, { id: 'charm', turns: 1 });
    for (let i = 0; i < 5; i++) tickStatuses(c, rngOf(0.999));
    expect(isCharmed(c)).toBe(true);
    // shared cumulative chance: 10% then +10% per missed turn
    expect(c.statuses.find(s => s.id === 'charm')?.recoveryChance).toBe(60);
  });

  it('a successful recovery roll removes charm together with silence', () => {
    const c = damageCharacter(10, {});
    applyStatus(c, { id: 'charm', turns: 1 });
    applyStatus(c, { id: 'silence', turns: 1 });
    const ev = tickStatuses(c, rngOf(0));
    expect(c.statuses.map(s => s.id)).toEqual([]);
    expect(ev.filter(e => e.type === 'status-expire').length).toBe(2);
  });

  it('gaining charm resets the accumulated recovery chance of other negatives', () => {
    const c = damageCharacter(10, {});
    applyStatus(c, { id: 'silence', turns: 1 });
    tickStatuses(c, rngOf(0.999));
    expect(c.statuses.find(s => s.id === 'silence')?.recoveryChance).toBe(20);
    applyStatus(c, { id: 'charm', turns: 1 });
    expect(c.statuses.find(s => s.id === 'silence')?.recoveryChance).toBeUndefined();
  });

  it('Blessed blocks charm like any other negative status', () => {
    const c = damageCharacter(10, {});
    applyStatus(c, { id: 'blessed', turns: 1 });
    expect(applyStatus(c, { id: 'charm', turns: 1 })).toEqual([expect.objectContaining({ type: 'status-blocked' })]);
    expect(isCharmed(c)).toBe(false);
  });
});
