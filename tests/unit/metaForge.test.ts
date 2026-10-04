/**
 * 武器淬炼 + 熔炉锻造 · 纯逻辑测试（design/WEAPON-FORGE-DESIGN.md §2/§3 设计值的守卫）。
 */
import { describe, it, expect } from 'vitest';
import {
  MAX_TEMPERING_LEVEL,
  temperingMaxLevel,
  affixUnlockLevels,
  temperingCost,
  affixUnlockedCount,
  temperWeapon,
  forgeWeapon,
  forgeTierUnlockLevel,
} from '../../src/meta/systems/forge';
import { SOULFORGE_RECIPES, findRecipe, recipesOfTier } from '../../src/meta/data/soulforge';
import { newSave, planQuestEncounter, buildBattleRequest } from '../../src/meta';
import { forgeCatalogWeapon, equipWeapon, equippedWeaponOf } from '../../src/meta/systems/hero';
import { setTeamPreset } from '../../src/meta/systems/teamRules';

describe('武器淬炼：普通武器 +5…+10，每级消耗目标等级枚钢锭', () => {
  it('各档上限及满级总量', () => {
    const caps: Record<string, number> = { Common: 5, Uncommon: 5, Rare: 6, UltraRare: 7,
      Epic: 8, Legendary: 9, Mythic: 10, Doomed: 10 };
    for (const [rarity, cap] of Object.entries(caps)) {
      expect(temperingMaxLevel(rarity)).toBe(cap);
      const costs = Array.from({ length: cap }, (_, n) => temperingCost(rarity, n));
      expect(costs.map(c => rarity === 'Doomed' ? c.scrolls : c.ingots)).toEqual(Array.from({ length: cap }, (_, n) => n + 1));
      expect(costs.reduce((sum, c) => sum + (rarity === 'Doomed' ? c.scrolls : c.ingots), 0)).toBe(cap * (cap + 1) / 2);
      expect(costs.every(c => c.gold === 0)).toBe(true);
    }
    expect(MAX_TEMPERING_LEVEL).toBe(10);
  });

  it('+6 起逐级解锁词缀，受稀有度上限约束', () => {
    expect(affixUnlockLevels('Common')).toEqual([]);
    expect(affixUnlockLevels('Rare')).toEqual([6]);
    expect(affixUnlockLevels('Epic')).toEqual([6, 7, 8]);
    expect(affixUnlockedCount('Rare', 5)).toBe(0);
    expect(affixUnlockedCount('Rare', 6)).toBe(1);
    expect(affixUnlockedCount('Doomed', 7)).toBe(2);
    expect(affixUnlockedCount('Doomed', 10)).toBe(5);
  });
});

describe('淬炼校验（issues 汇总风格）', () => {
  const base = { owned: true, rarity: 'Rare', ingots: 9999, gold: 999999, scrolls: 0 };

  it('成功：返回新等级与实收消耗', () => {
    const r = temperWeapon({ ...base, currentLevel: 2 });
    expect(r).toEqual({ ok: true, level: 3, cost: { ingots: 3, gold: 0, scrolls: 0 } });
  });

  it('未拥有 / 已满级 → 汇总问题', () => {
    const r = temperWeapon({ ...base, owned: false, currentLevel: temperingMaxLevel('Rare') });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.issues.map((i) => i.code)).toEqual(['NOT_OWNED', 'MAX_LEVEL']);
    }
  });

  it('材料不足 → 显示钢锭缺口', () => {
    const r = temperWeapon({ ...base, ingots: 0, gold: 0 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.issues.map((i) => i.code)).toEqual(['MISSING_INGOTS']);
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
    const r = forgeWeapon({ recipe, heroLevel: 20, owned: false, souls: recipe.souls, gold: recipe.gold, ingots: recipe.ingots });
    expect(r).toEqual({ ok: true, weaponId: recipe.weaponId });
  });

  it('档位未解锁 / 已拥有 / 材料不足 → 汇总问题', () => {
    const r = forgeWeapon({ recipe, heroLevel: 10, owned: true, souls: 0, gold: 0, ingots: 0 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.issues.map((i) => i.code)).toEqual([
        'TIER_LOCKED',
        'ALREADY_OWNED',
        'MISSING_SOULS',
        'MISSING_GOLD',
      ]);
    }
  });

  it('Doomed 配方走黄金档（符卷通道二期）', () => {
    const doomed = findRecipe('gw_DoomedTome');
    expect(doomed?.rarity).toBe('Doomed');
    const r = forgeWeapon({ recipe: doomed, heroLevel: 40, owned: false, souls: doomed!.souls, gold: 0 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.map((i) => i.code)).toContain('MISSING_GOLD');
  });

  it('配方不存在 → BAD_RECIPE', () => {
    const r = forgeWeapon({ recipe: null, heroLevel: 40, owned: false, souls: 0, gold: 0, ingots: 0 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.map((i) => i.code)).toEqual(['BAD_RECIPE']);
  });
});

describe('锻造 → 装备 → 桥接全链（目录武器真实进战斗）', () => {
  it('锻造 gw_Eggsplosion → 解锁+原子扣费 → 装备 → 主角快照用其法术/法力色，注册表有原型', () => {
    const save = newSave({ now: 0, starterTroopIds: [6000, 6097, 6457] });
    save.hero.level = 20;
    save.currencies.souls = 50_000;
    save.currencies.gold = 50_000;
    // 主角编入 1 号位（默认队全是部队）
    setTeamPreset(save, 0, { name: 'x', members: [{ kind: 'hero' }, { kind: 'troop', troopId: 6000 }, { kind: 'troop', troopId: 6097 }], bannerKingdomId: null });
    const forged = forgeCatalogWeapon(save, 'gw_Eggsplosion');
    expect(forged).toEqual({ ok: true, weaponId: 'gw_Eggsplosion' });
    expect(save.hero.unlockedWeapons).toContain('gw_Eggsplosion');
    expect(save.currencies.souls).toBe(30_000);
    expect(save.currencies.gold).toBe(35_000);

    const eq = equipWeapon(save, 'gw_Eggsplosion');
    expect(eq).toEqual({ ok: true, weaponId: 'gw_Eggsplosion' });
    const equipped = equippedWeaponOf(save)!;
    expect(equipped.id).toBe('gw_Eggsplosion');
    expect(equipped.manaColors.length).toBeGreaterThan(0);

    const plan = planQuestEncounter('破碎尖塔', 1, 7);
    const outcome = buildBattleRequest(save, plan);
    if (!outcome.ok) throw new Error(outcome.message);
    const hero = outcome.request.playerTeam.find((c) => c.externalId.endsWith('-hero'))!;
    expect(hero.skillId).toBe('gw_Eggsplosion');
    expect(hero.manaColors).toEqual(equipped.manaColors);
    expect(outcome.registry.prototypes.get('gw_Eggsplosion')!.segments.length).toBeGreaterThan(0);
  });

  it('未锻造的目录武器不可装备（装备不送所有权）', () => {
    const save = newSave({ now: 0, starterTroopIds: [6000, 6097, 6457] });
    save.hero.level = 20;
    const r = equipWeapon(save, 'gw_Dawnbringer');
    expect(r.ok).toBe(false);
    expect(save.hero.unlockedWeapons).not.toContain('gw_Dawnbringer');
  });
});
