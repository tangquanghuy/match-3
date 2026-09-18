/**
 * 武器淬炼 + 熔炉锻造 · 纯逻辑测试（design/WEAPON-FORGE-DESIGN.md §2/§3 设计值的守卫）。
 */
import { describe, it, expect } from 'vitest';
import {
  MAX_TEMPERING_LEVEL,
  temperingCost,
  affixUnlockedCount,
  temperWeapon,
  forgeWeapon,
  forgeTierUnlockLevel,
} from '../../src/meta/systems/forge';
import { SOULFORGE_RECIPES, findRecipe, recipesOfTier } from '../../src/meta/data/soulforge';

describe('淬炼消耗表（设计值 §2）', () => {
  it('每级消耗 = 钢锭基数 × ceil(下一级/2) + 黄金 200×下一级', () => {
    // Common 基数 2：0→1 级 = ceil(1/2)=1 → 2 锭 200 金
    expect(temperingCost('Common', 0)).toEqual({ ingots: 2, gold: 200, scrolls: 0 });
    // Epic 基数 32：4→5 级 = ceil(5/2)=3 → 96 锭 1000 金
    expect(temperingCost('Epic', 4)).toEqual({ ingots: 96, gold: 1000, scrolls: 0 });
    // Legendary 基数 64：19→20 级 = 10 → 640 锭 4000 金
    expect(temperingCost('Legendary', 19)).toEqual({ ingots: 640, gold: 4000, scrolls: 0 });
  });

  it('Doomed 系不耗普通钢锭，改为每级 1 熔铸符卷', () => {
    expect(temperingCost('Doomed', 0)).toEqual({ ingots: 0, gold: 200, scrolls: 1 });
    expect(temperingCost('Doomed', 9)).toEqual({ ingots: 0, gold: 2000, scrolls: 1 });
  });

  it('钢锭基数随稀有度阶梯递增', () => {
    const ladder = ['Common', 'Uncommon', 'Rare', 'UltraRare', 'Epic', 'Legendary', 'Mythic'];
    const bases = ladder.map((r) => temperingCost(r, 0).ingots);
    for (let i = 1; i < bases.length; i++) expect(bases[i]).toBeGreaterThan(bases[i - 1]);
  });
});

describe('词缀解锁档', () => {
  it('普通武器 5/10/15/20 级解锁 4 条', () => {
    expect(affixUnlockedCount('Rare', 0)).toBe(0);
    expect(affixUnlockedCount('Rare', 4)).toBe(0);
    expect(affixUnlockedCount('Rare', 5)).toBe(1);
    expect(affixUnlockedCount('Rare', 15)).toBe(3);
    expect(affixUnlockedCount('Rare', 20)).toBe(4);
  });

  it('Doomed 武器 4/8/12/16/20 级解锁 5 条', () => {
    expect(affixUnlockedCount('Doomed', 4)).toBe(1);
    expect(affixUnlockedCount('Doomed', 7)).toBe(1);
    expect(affixUnlockedCount('Doomed', 8)).toBe(2);
    expect(affixUnlockedCount('Doomed', 20)).toBe(5);
  });
});

describe('淬炼校验（issues 汇总风格）', () => {
  const base = { owned: true, rarity: 'Rare', ingots: 9999, gold: 999999, scrolls: 0 };

  it('成功：返回新等级与实收消耗', () => {
    const r = temperWeapon({ ...base, currentLevel: 2 });
    expect(r).toEqual({ ok: true, level: 3, cost: { ingots: 16, gold: 600, scrolls: 0 } });
  });

  it('未拥有 / 已满级 → 汇总问题', () => {
    const r = temperWeapon({ ...base, owned: false, currentLevel: MAX_TEMPERING_LEVEL });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.issues.map((i) => i.code)).toEqual(['NOT_OWNED', 'MAX_LEVEL']);
    }
  });

  it('材料不足 → 逐项列出缺口（钢锭/黄金）', () => {
    const r = temperWeapon({ ...base, ingots: 3, gold: 100 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.issues.map((i) => i.code)).toEqual(['MISSING_INGOTS', 'MISSING_GOLD']);
    }
  });

  it('Doomed 武器检查符卷缺口', () => {
    const r = temperWeapon({ ...base, rarity: 'Doomed', currentLevel: 0, scrolls: 0 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.map((i) => i.code)).toContain('MISSING_SCROLLS');
  });
});

describe('熔炉（Soulforge）', () => {
  const recipe = SOULFORGE_RECIPES[0].recipe;

  it('配方表：全部 id 可回查、档位字段合法', () => {
    for (const s of SOULFORGE_RECIPES) {
      expect(findRecipe(s.recipe.weaponId)?.weaponId).toBe(s.recipe.weaponId);
      expect([1, 2]).toContain(s.recipe.tier);
    }
    expect(recipesOfTier(2).length).toBeGreaterThan(0);
  });

  it('档位解锁等级（设计值 20/40）', () => {
    expect(forgeTierUnlockLevel(1)).toBe(20);
    expect(forgeTierUnlockLevel(2)).toBe(40);
  });

  it('锻造成功：返回武器 id', () => {
    const r = forgeWeapon({ recipe, heroLevel: 20, owned: false, souls: recipe.souls, ingots: recipe.ingots });
    expect(r).toEqual({ ok: true, weaponId: recipe.weaponId });
  });

  it('档位未解锁 / 已拥有 / 材料不足 → 汇总问题', () => {
    const r = forgeWeapon({ recipe, heroLevel: 10, owned: true, souls: 0, ingots: 0 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.issues.map((i) => i.code)).toEqual([
        'TIER_LOCKED',
        'ALREADY_OWNED',
        'MISSING_SOULS',
        'MISSING_INGOTS',
      ]);
    }
  });

  it('Doomed 配方检查符卷', () => {
    const doomed = findRecipe('DoomedTome');
    expect(doomed?.scrolls).toBe(25);
    const r = forgeWeapon({ recipe: doomed, heroLevel: 40, owned: false, souls: doomed!.souls, ingots: doomed!.ingots, scrolls: 0 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.map((i) => i.code)).toContain('MISSING_SCROLLS');
  });

  it('配方不存在 → BAD_RECIPE', () => {
    const r = forgeWeapon({ recipe: null, heroLevel: 40, owned: false, souls: 0, ingots: 0 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.map((i) => i.code)).toEqual(['BAD_RECIPE']);
  });
});
