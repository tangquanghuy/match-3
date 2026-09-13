import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { skill, dmg, heal, createGems, inflict, extraTurn } from '@engine/skills/builders';
import type { EffectSegment } from '@engine/skills/prototypes';
import { BaseColor } from '@engine/types';
import type { TargetMode } from '@engine/skills/targeting';

const ENEMY_MODES: TargetMode[] = ['enemyFront', 'enemyAll', 'enemyRandom', 'enemyWeakest'];
const ALLY_MODES: TargetMode[] = ['allySelf', 'allyAll', 'allyFront'];

/** 生成任意合法效果段 */
const segArb: fc.Arbitrary<EffectSegment> = fc.oneof(
  fc.tuple(fc.constantFrom(...ENEMY_MODES), fc.integer({ min: 0, max: 20 }), fc.integer({ min: 0, max: 3 }))
    .map(([t, b, m]) => dmg(t, b, m)),
  fc.tuple(fc.constantFrom(...ALLY_MODES), fc.integer({ min: 0, max: 20 }))
    .map(([t, b]) => heal(t, b)),
  fc.tuple(fc.constantFrom(BaseColor.Red, BaseColor.Blue, BaseColor.Green), fc.integer({ min: 1, max: 12 }))
    .map(([c, n]) => createGems(c, n)),
  fc.constantFrom('poison', 'burning', 'silence', 'frozen')
    .map((id) => inflict(id, 'enemyFront')),
  fc.constant(extraTurn()),
);

const KNOWN_KINDS = new Set(['damage', 'buff', 'gem', 'status', 'extraTurn', 'summon']);

describe('构造器属性（需求 1.2, 1.3）', () => {
  it('任意 builder 产出段的 kind 合法且必填字段完备', () => {
    fc.assert(
      fc.property(segArb, (seg) => {
        expect(KNOWN_KINDS.has(seg.kind)).toBe(true);
        if (seg.kind === 'damage' || seg.kind === 'buff') {
          expect(seg.target).toBeTruthy();
          expect(typeof seg.scaling.base).toBe('number');
          expect(typeof seg.scaling.mult).toBe('number');
        }
        if (seg.kind === 'buff') expect(seg.stat).toBeTruthy();
        if (seg.kind === 'status') {
          expect(seg.statusId).toBeTruthy();
          expect(seg.turns).toBeGreaterThan(0);
        }
        if (seg.kind === 'gem') expect(seg.params.op).toBeTruthy();
      }),
    );
  });

  it('skill(...) 的 segments 顺序恒等于入参顺序', () => {
    fc.assert(
      fc.property(fc.array(segArb, { minLength: 0, maxLength: 6 }), (segs) => {
        const proto = skill(...segs);
        expect(proto.segments).toEqual(segs);
        expect(proto.segments.map((s) => s.kind)).toEqual(segs.map((s) => s.kind));
      }),
    );
  });
});
