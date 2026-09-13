import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  parseScalings,
  evaluateScaling,
  type ScalingSpec,
} from '@engine/skills/scaling';

describe('缩放求值属性（需求 1.3）', () => {
  it('任意 spec 与 magic≥0，求值恒为非负整数', () => {
    fc.assert(
      fc.property(
        fc.record({
          base: fc.integer({ min: -20, max: 40 }),
          mult: fc.double({ min: 0, max: 3, noNaN: true }),
        }),
        fc.integer({ min: 0, max: 30 }),
        (spec: ScalingSpec, magic: number) => {
          const v = evaluateScaling(spec, magic);
          expect(v).toBeGreaterThanOrEqual(0);
          expect(Number.isInteger(v)).toBe(true);
        },
      ),
    );
  });

  it('base≥0 时对 magic 单调不减（mult≥0）', () => {
    fc.assert(
      fc.property(
        fc.record({
          base: fc.integer({ min: 0, max: 40 }),
          mult: fc.double({ min: 0, max: 3, noNaN: true }),
        }),
        fc.integer({ min: 0, max: 15 }),
        fc.integer({ min: 0, max: 15 }),
        (spec: ScalingSpec, m1: number, m2: number) => {
          const lo = Math.min(m1, m2);
          const hi = Math.max(m1, m2);
          expect(evaluateScaling(spec, hi)).toBeGreaterThanOrEqual(
            evaluateScaling(spec, lo),
          );
        },
      ),
    );
  });
});

describe('parseScalings 纯函数属性（需求 1.6）', () => {
  // 生成器：拼装含随机魔法标记的描述文本，避免中文文本干扰解析
  const magicToken = fc.oneof(
    fc.integer({ min: 0, max: 40 }).map((n) => `[魔法 + ${n}]`),
    fc.constant('[魔法]'),
    fc
      .tuple(fc.constantFrom(1.5, 2, 3), fc.integer({ min: 0, max: 20 }))
      .map(([m, n]) => `[(魔法 x ${m}) + ${n}]`),
    fc
      .tuple(fc.constantFrom(2, 3, 4), fc.integer({ min: 0, max: 20 }))
      .map(([d, n]) => `[(魔法 / ${d}) + ${n}]`),
  );

  it('相同输入产出相同结果（确定性、lastIndex 不泄漏）', () => {
    fc.assert(
      fc.property(fc.array(magicToken, { minLength: 0, maxLength: 5 }), (tokens) => {
        const desc = `技能 ${tokens.join(' 和 ')} 效果。`;
        expect(parseScalings(desc)).toEqual(parseScalings(desc));
      }),
    );
  });

  it('解析出的规格数量等于文本中魔法标记数量', () => {
    fc.assert(
      fc.property(fc.array(magicToken, { minLength: 0, maxLength: 6 }), (tokens) => {
        const desc = `造成 ${tokens.join(' 再 ')} 。`;
        const { scalings } = parseScalings(desc);
        expect(scalings.length).toBe(tokens.length);
      }),
    );
  });

  it('每个解析出的规格求值非负（跨随机文本）', () => {
    fc.assert(
      fc.property(
        fc.array(magicToken, { minLength: 1, maxLength: 4 }),
        fc.integer({ min: 0, max: 30 }),
        (tokens, magic) => {
          const { scalings } = parseScalings(tokens.join(' '));
          for (const s of scalings) {
            expect(evaluateScaling(s, magic)).toBeGreaterThanOrEqual(0);
          }
        },
      ),
    );
  });
});
