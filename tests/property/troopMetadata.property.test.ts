import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { buildSkillMetadata } from '@engine/skills/scaling';
import { TROOPS } from '../../src/data/troops';

/**
 * 元数据构建确定性属性测试（需求 2.5）。
 *
 * 构建脚本从技能描述预解析元数据；同一输入 dump 多次构建须产出一致结果。
 * 由于 buildSkillMetadata 是构建脚本内联逻辑的运行时同源实现，
 * 对其做「同输入同输出、幂等」的属性验证，等价于验证构建确定性。
 */

describe('元数据构建确定性（需求 2.5）', () => {
  it('buildSkillMetadata 对任意描述文本是纯函数（同输入同输出）', () => {
    // 拼装含随机魔法/修饰标记的描述，覆盖 parsed=true/false 两类
    const token = fc.oneof(
      fc.integer({ min: 0, max: 40 }).map((n) => `[魔法 + ${n}]`),
      fc.constant('[魔法]'),
      fc
        .tuple(fc.constantFrom(1.5, 2, 3), fc.integer({ min: 0, max: 20 }))
        .map(([m, n]) => `[(魔法 x ${m}) + ${n}]`),
      fc.integer({ min: 2, max: 6 }).map((n) => `[x${n}]`),
      fc.tuple(fc.integer({ min: 1, max: 5 }), fc.integer({ min: 1, max: 5 })).map(([a, b]) => `[${a}:${b}]`),
      fc.constant('纯文本无标记'),
    );
    fc.assert(
      fc.property(fc.array(token, { minLength: 0, maxLength: 6 }), (tokens) => {
        const desc = `技能 ${tokens.join('，')} 。`;
        const a = buildSkillMetadata(desc);
        const b = buildSkillMetadata(desc);
        expect(a).toEqual(b);
      }),
    );
  });

  it('对真实数据集抽样：重复构建产出一致 meta（幂等）', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: TROOPS.length - 1 }), (idx) => {
        const desc = TROOPS[idx].spell.description;
        // 再次构建应与 troops.json 内已固化的 meta 完全一致
        expect(buildSkillMetadata(desc)).toEqual(TROOPS[idx].spell.meta);
      }),
    );
  });

  it('全量数据集：每条技能重复构建都稳定一致', () => {
    for (const t of TROOPS) {
      const again = buildSkillMetadata(t.spell.description);
      expect(again).toEqual(t.spell.meta);
    }
  });
});
