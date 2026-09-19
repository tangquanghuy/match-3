/**
 * 职业数据完整性（classes.json 生成产物的护栏）：
 * 结构、王国映射、效果编译词表、特质别名必须指向已实现引擎特质、中文文案覆盖。
 * 生成器 = scripts/build_classes.mjs；本文件保证「重新生成后语义不漂移」。
 */
import { describe, it, expect } from 'vitest';
// @ts-expect-error - node:fs 运行时可用，仅类型声明缺失
import fs from 'node:fs';
import {
  CHAMPION_TIERS,
  CLASSES,
  classByKingdom,
  classById,
  KNOWN_TRAIT_CODES,
} from '../../src/meta';
import { allKingdoms } from '../../src/meta';

const raw = JSON.parse(fs.readFileSync('src/meta/data/classes.json', 'utf8')) as {
  classes: Array<{
    id: string;
    perks: Array<{ code: string; implemented: boolean }>;
    trees: Array<{ talents: Array<{ code: string; effect: { kind: string; code?: string } }> }>;
  }>;
  summary: { talents: Record<string, number> };
};

describe('职业数据完整性（38 官方职业）', () => {
  it('38 职业、字段齐备、王国映射一一对应且都在 troops.json 王国集合内', () => {
    expect(CLASSES).toHaveLength(38);
    const kingdomSet = new Set<string>();
    for (const cls of CLASSES) {
      expect(cls.id).toBeTruthy();
      expect(cls.name).not.toBe(cls.nameEn); // 中文名必须已翻译
      expect(cls.kingdom).toBeTruthy();
      expect(cls.troopType).toBeTruthy();
      expect(cls.baseStats.health).toBeGreaterThan(0);
      expect(cls.trees).toHaveLength(3);
      expect(cls.perks).toHaveLength(3);
      kingdomSet.add(cls.kingdom);
      expect(allKingdoms()).toContain(cls.kingdom);
    }
    // 一王国一职业（任务链解锁语义）
    expect(kingdomSet.size).toBe(38);
  });

  it('每棵树恰好 7 条对应 7 档；树内档位 code 不重复', () => {
    expect([...CHAMPION_TIERS]).toEqual([1, 5, 10, 20, 40, 70, 100]);
    for (const cls of CLASSES) {
      for (const tree of cls.trees) {
        expect(tree.talents).toHaveLength(7);
        expect(new Set(tree.talents.map((t) => t.code)).size).toBe(7);
        for (const t of tree.talents) {
          expect(t.nameZh).toBeTruthy();
          expect(t.descriptionZh).toBeTruthy();
          expect(t.effect).toBeTruthy();
        }
      }
    }
  });

  it('效果编译只产出已知 kind；trait 别名必须指向引擎已实现特质', () => {
    const KINDS = new Set([
      'selfStat',
      'selfStatIfPosition',
      'selfStatIfWeapon',
      'selfStatPerAlly',
      'alliesStat',
      'xpBonus',
      'pvp',
      'trait',
      'unimplemented',
    ]);
    for (const cls of CLASSES) {
      for (const tree of cls.trees) {
        for (const t of tree.talents) {
          expect(KINDS.has(t.effect.kind)).toBe(true);
          if (t.effect.kind === 'trait') {
            expect(KNOWN_TRAIT_CODES.has(t.effect.code!)).toBe(true);
          }
        }
      }
    }
  });

  it('v2 天赋覆盖面审计（生成器裁定不回退）：可生效天赋 ≥ 55 族', () => {
    const c = raw.summary.talents;
    const usable =
      (c.selfStat ?? 0) +
      (c.selfStatIfPosition ?? 0) +
      (c.selfStatIfWeapon ?? 0) +
      (c.selfStatPerAlly ?? 0) +
      (c.alliesStat ?? 0) +
      (c.trait ?? 0) +
      (c.xpBonus ?? 0);
    expect(usable).toBeGreaterThanOrEqual(399); // 21+19+1+18 族在 38 职业的槽位展开
    expect(c.pvp ?? 0).toBeGreaterThanOrEqual(2);
  });

  it('职业特质：implemented 标志与引擎 TRAIT_LIBRARY 一致', () => {
    for (const cls of raw.classes) {
      for (const perk of cls.perks) {
        expect(perk.implemented).toBe(KNOWN_TRAIT_CODES.has(perk.code));
      }
    }
    const total = raw.classes.flatMap((c) => c.perks);
    expect(total.filter((p) => p.implemented)).toHaveLength(76);
    expect(total.filter((p) => !p.implemented)).toHaveLength(38);
  });

  it('每个职业的中文名可查、id 与官方 HeroClassCode 一致', () => {
    for (const cls of raw.classes) {
      expect(classById(cls.id)?.name).toBeTruthy();
    }
    // 抽查官方映射锚点
    expect(classByKingdom('破碎尖塔')?.id).toBe('warrior');
    expect(classByKingdom('剑锋崖')?.id).toBe('knight');
    expect(classById('warrior')?.nameEn).toBe('Warlord');
    expect(classById('maskedlord')?.nameEn).toBe('Sentinel');
  });
});
