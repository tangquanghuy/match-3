import { describe, it, expect } from 'vitest';
import { TROOPS, getTroopByRef } from '../../src/data/troops';
import { buildSkillMetadata } from '@engine/skills/scaling';

/**
 * 技能元数据管线测试（需求 2.1/2.2/2.3/2.4）。
 *
 * 断言构建脚本写入 troops.json 的 spell.meta 与运行时 buildSkillMetadata 等价，
 * 并覆盖若干已知技能的具体 meta 值。
 */

describe('troops.json 技能元数据（构建期预解析）', () => {
  it('每条技能都携带 meta，且 raw 与 description 一致（需求 2.2）', () => {
    for (const t of TROOPS) {
      expect(t.spell.meta).toBeDefined();
      expect(t.spell.meta.raw).toBe(t.spell.description);
      expect(Array.isArray(t.spell.meta.scalings)).toBe(true);
      expect(typeof t.spell.meta.parsed).toBe('boolean');
    }
  });

  it('meta 与运行时 buildSkillMetadata 完全一致（构建/运行同源，需求 2.1）', () => {
    for (const t of TROOPS) {
      expect(t.spell.meta).toEqual(buildSkillMetadata(t.spell.description));
    }
  });

  it('parsed 标记与 scalings/modifier 一致（需求 2.3）', () => {
    for (const t of TROOPS) {
      const m = t.spell.meta;
      const expected = m.scalings.length > 0 || m.modifier !== undefined;
      expect(m.parsed).toBe(expected);
    }
  });
});

describe('已知技能的 meta 断言', () => {
  it('犀首兽 杀戮节庆：[魔法 + 2] → base=2,mult=1，parsed', () => {
    const rhynax = getTroopByRef('Rhynax');
    expect(rhynax).toBeDefined();
    expect(rhynax!.spell.meta.scalings).toEqual([{ base: 2, mult: 1 }]);
    expect(rhynax!.spell.meta.parsed).toBe(true);
    expect(rhynax!.spell.meta.modifier).toBeUndefined();
  });

  it('瓦尔基里 英灵再世：[魔法 + 1] → base=1,mult=1，parsed', () => {
    const valkyrie = getTroopByRef('Valkyrie');
    expect(valkyrie).toBeDefined();
    expect(valkyrie!.spell.meta.scalings).toEqual([{ base: 1, mult: 1 }]);
    expect(valkyrie!.spell.meta.parsed).toBe(true);
  });

  it('食人魔 泰山压顶：无缩放标记 → scalings 空、parsed=false，保留原文（需求 2.3）', () => {
    const ogre = getTroopByRef('Ogre');
    expect(ogre).toBeDefined();
    expect(ogre!.spell.meta.scalings).toEqual([]);
    expect(ogre!.spell.meta.parsed).toBe(false);
    expect(ogre!.spell.meta.raw).toBe(ogre!.spell.description);
  });
});
