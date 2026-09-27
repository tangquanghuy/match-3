import { describe, expect, it } from 'vitest';
import { planPresentation } from '../helpers/presentationBudget';
import type { GameEvent, SkillDamageEvent } from '@engine/events';
import { BaseColor, PlayerSide, colorGem } from '@engine/types';

const damage: SkillDamageEvent = { type: 'skill-damage', casterId: 0, targetId: 4,
  range: 'single', damage: 10, resultingHp: 90, resultingArmor: 0 };
const cells = [0, 1, 2].map(col => ({ pos: { row: 7, col }, gemId: col + 1, gemType: colorGem(BaseColor.Red) }));

describe('whole-action presentation budget (real timeline construction)', () => {
  it('includes damage, subsequent explosion, mana, gravity, refill AND later cascades/traits', () => {
    const prefix: GameEvent[] = [
      { type: 'skill-cast', characterId: 0, skillId: 'audit' }, damage,
    ];
    const continuation: GameEvent[] = [
      { type: 'gem-explode', cells },
      { type: 'mana-gain', color: BaseColor.Red, amount: 3, characterId: 0, player: PlayerSide.Left },
      { type: 'gravity', chainCount: 1, moves: [{ gemId: 5, from: { row: 0, col: 0 }, to: { row: 7, col: 0 } }] },
      { type: 'refill', chainCount: 1, spawns: [{ gemId: 6, gemType: colorGem(BaseColor.Green), to: { row: 0, col: 0 } }] },
      { type: 'elimination', chainCount: 2, cells, shape: 'line3' },
      { type: 'mana-gain', color: BaseColor.Red, amount: 3, characterId: 0, player: PlayerSide.Left },
      { type: 'buff', targetId: 0, stat: 'hp', amount: 1, source: 'trait' },
    ];
    const attackOnly = planPresentation(prefix);
    const full = planPresentation([...prefix, ...continuation]);
    // Whole-action accounting includes the actual concurrent envelope, not a fixed
    // minimum based on the previous (serial) implementation.
    expect(full.timelineMs).toBeGreaterThan(attackOnly.timelineMs);
    expect(full.timelineMs).toBeGreaterThan(planPresentation([...prefix, ...continuation.slice(0, 4)]).timelineMs);
    // This clear is fully covered by the preceding damage's concurrent window.
    // Occupancy attribution must not double-count an overlapped segment.
    expect(full.stageMs['gem-clear']).toBe(0);
    expect(planPresentation([{ type: 'gem-explode', cells }]).timelineMs).toBeGreaterThan(0);
    expect(full.stageMs['board-and-cascades']).toBeGreaterThan(0);
    expect(full.stageMs.mana).toBeGreaterThan(0);
    // Trait feedback is included but completely covered by the independent board lane.
    expect(full.stageMs['trait-buff']).toBe(0);
    expect(planPresentation([continuation.at(-1)!]).timelineMs).toBeGreaterThan(0);
    expect(Object.values(full.stageMs).reduce((n, ms) => n + ms, 0)).toBeCloseTo(full.timelineMs, 3);
  });

  it('keeps simultaneous group hits grouped rather than multiplying their hold by four', () => {
    const events: GameEvent[] = [0, 1, 2, 3].map(i => ({ ...damage, targetId: 4 + i, range: 'all' }));
    expect(planPresentation(events).timelineMs).toBeCloseTo(planPresentation(events.slice(0, 1)).timelineMs, 3);
  });

  it('distinguishes lightweight trait buffs from skill armor effects', () => {
    const events: Extract<GameEvent, { type: 'buff' }>[] = [0, 1, 2, 3].map(targetId => ({ type: 'buff', targetId, stat: 'armor', amount: 1 }));
    const traits = events.map(e => ({ ...e, source: 'trait' as const }));
    expect(planPresentation(traits).timelineMs).toBeLessThan(planPresentation(events).timelineMs);
  });

  it('does not truncate repeated status ticks at the first affected character', () => {
    const events: GameEvent[] = [4, 5, 6, 7].flatMap(targetId => [
      { type: 'status-tick', targetId, statusId: 'poison', damage: 1 } as const,
      { type: 'status-tick', targetId, statusId: 'burning', damage: 3 } as const,
    ]);
    const full = planPresentation(events);
    expect(full.stageMs.status).toBeCloseTo(full.timelineMs, 3);
    // All targets dispatch in the shared status envelope, not one envelope per card.
    expect(full.timelineMs).toBeCloseTo(planPresentation(events.slice(0, 2)).timelineMs, 3);
  });
});

