import { describe, it, expect } from 'vitest';
import {
  parseScalings,
  evaluateScaling,
  constantScaling,
  buildSkillMetadata,
} from '@engine/skills/scaling';

describe('parseScalings 魔法标记解析', () => {
  it('[魔法 + N] → base=N, mult=1', () => {
    const { scalings } = parseScalings('对 1 名敌人造成 [魔法 + 2] 点伤害。');
    expect(scalings).toEqual([{ base: 2, mult: 1 }]);
  });

  it('[魔法]（无加值）→ base=0, mult=1', () => {
    const { scalings } = parseScalings('对 1 个敌人造成 [魔法] 点伤害。');
    expect(scalings).toEqual([{ base: 0, mult: 1 }]);
  });

  it('[(魔法 x M) + N] → base=N, mult=M（支持小数）', () => {
    const { scalings } = parseScalings('获得 [(魔法 x 1.5) + 3] 点护甲值。');
    expect(scalings).toEqual([{ base: 3, mult: 1.5 }]);
  });

  it('[(魔法 x 2) + 7] → base=7, mult=2', () => {
    const { scalings } = parseScalings('对一名敌人造成 [(魔法 x 2) + 7] 点伤害。');
    expect(scalings).toEqual([{ base: 7, mult: 2 }]);
  });

  it('[(魔法 / D) + N] → base=N, mult=1/D', () => {
    const { scalings } = parseScalings('给予所有盟友 [(魔法 / 2) + 3] 点生命值。');
    expect(scalings).toEqual([{ base: 3, mult: 0.5 }]);
  });

  it('[(魔法 / 2)]（无加值）→ base=0, mult=0.5', () => {
    const { scalings } = parseScalings('将所有敌人的随机一项技能值降低 [(魔法 / 2)] 点。');
    expect(scalings).toEqual([{ base: 0, mult: 0.5 }]);
  });

  it('[(魔法 / 4) + 1] → mult=0.25', () => {
    const { scalings } = parseScalings('爆破其法力颜色 [(魔法 / 4) + 1] 颗宝石。');
    expect(scalings).toEqual([{ base: 1, mult: 0.25 }]);
  });

  it('伤害区间 [low] – [high] → 按序两个规格（需求 1.5）', () => {
    const { scalings } = parseScalings(
      '对 1 名敌人造成 [(魔法 / 2) + 4] – [魔法 + 8] 点伤害。',
    );
    expect(scalings).toEqual([
      { base: 4, mult: 0.5 },
      { base: 8, mult: 1 },
    ]);
  });

  it('多个魔法标记按出现顺序产出（伤害额 + 护甲额）', () => {
    const { scalings } = parseScalings(
      '对敌人造成 [魔法 + 2] 点伤害，并获得 [魔法 + 5] 点护甲。',
    );
    expect(scalings).toEqual([
      { base: 2, mult: 1 },
      { base: 5, mult: 1 },
    ]);
  });
});

describe('parseScalings 二级修饰', () => {
  it('[xN] → multiplier', () => {
    const { modifier } = parseScalings('每摧毁一颗紫色宝石，则创造 4 颗骷髅头。 [x4]');
    expect(modifier).toEqual({ kind: 'multiplier', a: 4 });
  });

  it('[N:M] → ratio', () => {
    const { modifier } = parseScalings('移除所有紫色宝石以增强伤害效果。 [2:1]');
    expect(modifier).toEqual({ kind: 'ratio', a: 2, b: 1 });
  });

  it('缩放与二级修饰共存', () => {
    const { scalings, modifier } = parseScalings(
      '对一名随机敌人造成 [魔法 + 3] 点伤害，伤害值因被移除的宝石数而增强。 [3:1]',
    );
    expect(scalings).toEqual([{ base: 3, mult: 1 }]);
    expect(modifier).toEqual({ kind: 'ratio', a: 3, b: 1 });
  });
});

describe('parseScalings 边界', () => {
  it('无任何标记 → 空规格、无修饰', () => {
    const res = parseScalings('随机爆破一颗宝石，摧毁其周围的其他宝石。');
    expect(res.scalings).toEqual([]);
    expect(res.modifier).toBeUndefined();
  });

  it('纯函数：多次调用结果一致（正则 lastIndex 不泄漏）', () => {
    const desc = '对 1 名敌人造成 [魔法 + 2] 点伤害。 [x2]';
    const a = parseScalings(desc);
    const b = parseScalings(desc);
    expect(a).toEqual(b);
  });
});

describe('evaluateScaling 求值', () => {
  it('base + magic*mult 并四舍五入', () => {
    expect(evaluateScaling({ base: 2, mult: 1 }, 12)).toBe(14);
    expect(evaluateScaling({ base: 7, mult: 2 }, 5)).toBe(17);
  });

  it('除数缩放四舍五入', () => {
    // 3 + 13*0.5 = 9.5 → 10
    expect(evaluateScaling({ base: 3, mult: 0.5 }, 13)).toBe(10);
    // 1 + 10*0.25 = 3.5 → 4
    expect(evaluateScaling({ base: 1, mult: 0.25 }, 10)).toBe(4);
  });

  it('magic=0 时等于 base', () => {
    expect(evaluateScaling({ base: 8, mult: 1 }, 0)).toBe(8);
  });

  it('结果非负（不会为负）', () => {
    expect(evaluateScaling({ base: 0, mult: 1 }, 0)).toBe(0);
    expect(evaluateScaling(constantScaling(0), 0)).toBe(0);
  });

  it('常数规格与 magic 无关', () => {
    expect(evaluateScaling(constantScaling(8), 20)).toBe(8);
  });
});

describe('buildSkillMetadata', () => {
  it('带缩放 → parsed=true 且保留原文', () => {
    const desc = '对 1 名敌人造成 [魔法 + 2] 点伤害。';
    const meta = buildSkillMetadata(desc);
    expect(meta.parsed).toBe(true);
    expect(meta.raw).toBe(desc);
    expect(meta.scalings).toEqual([{ base: 2, mult: 1 }]);
  });

  it('仅二级修饰也算 parsed', () => {
    const meta = buildSkillMetadata('摧毁一列。 [x4]');
    expect(meta.parsed).toBe(true);
    expect(meta.modifier).toEqual({ kind: 'multiplier', a: 4 });
  });

  it('无任何标记 → parsed=false 且保留原文（回退用）', () => {
    const desc = '随机爆破一颗宝石，摧毁其周围的其他宝石。';
    const meta = buildSkillMetadata(desc);
    expect(meta.parsed).toBe(false);
    expect(meta.raw).toBe(desc);
    expect(meta.scalings).toEqual([]);
  });
});
