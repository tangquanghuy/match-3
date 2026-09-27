import { describe, expect, it, vi } from 'vitest';
import { executePrototype, type SkillPrototype } from '@engine/skills/prototypes';
import type { TargetMode } from '@engine/skills/targeting';
import { BaseColor } from '@engine/types';
import { damageFixture } from '../helpers/damageFixture';
const modes: TargetMode[] = ['lastTarget', 'lastTargets', 'lastTargetFirst', 'lastTargetLast', 'lastDamaged'];
describe('cross-segment target modes retain race, kingdom and target-condition filters', () => {
  for (const mode of modes) for (const filter of ['color', 'race', 'kingdom'] as const) for (const match of [false, true])
    it(`${mode} ${filter} matching=${match}: cached targets are filtered without reselecting`, () => {
      const f = damageFixture();
      for (const e of f.enemies) {
        e.colors = [match ? BaseColor.Yellow : BaseColor.Red];
        e.troopTypes = match ? ['Divine'] : ['Human'];
        e.kingdom = match ? 'K' : 'Other';
      }
      const proto: SkillPrototype = { segments: [
        { kind: 'damage', target: 'enemyAll', scaling: { base: 1, mult: 0 }, range: 'all' },
        { kind: 'buff', target: mode, stat: 'attack', scaling: { base: 3, mult: 0 },
          ...(filter === 'color' ? { ifCond: { kind: 'targetColor' as const, color: BaseColor.Yellow } } :
            filter === 'race' ? { targetRace: 'Divine' } : { targetKingdom: 'K' }) },
      ] };
      const rng = vi.spyOn(f.ctx.rng, 'nextInt');
      const ev = executePrototype(proto, f.ctx);
      const expected = !match ? [] : ['lastTargets', 'lastDamaged'].includes(mode) ? [10, 11, 12, 13] : mode === 'lastTargetLast' ? [13] : [10];
      expect(ev.filter(e => e.type === 'buff').map(e => e.type === 'buff' ? e.targetId : -1)).toEqual(expected);
      expect(rng).not.toHaveBeenCalled();
      for (const e of f.enemies) expect(e.attack).toBe(expected.includes(e.id) ? 20 : 17);
    });
});
