import { describe, expect, it } from 'vitest';
import { newSave } from '../../src/meta/state/schema';
import { ALL_CATALOG_WEAPONS, anyWeaponById } from '../../src/meta/data/weaponCatalog';
import { acquireFilterKind, acquireOf, acquireProgress, CLASS_WEAPON_WINS, gemBuyCost, listedInGemShop } from '../../src/meta/data/weaponAcquire';
import { claimWeapon, canUseWeapon, forgeCatalogWeapon } from '../../src/meta/systems/hero';
import { classByKingdom } from '../../src/meta/data/classes';
import { findRecipe } from '../../src/meta/data/soulforge';
import { KINGDOM_ORDER } from '../../src/meta/data/kingdoms';
import { affixUnlockedCount, affixUnlockLevels, temperingMaxLevel } from '../../src/meta/systems/forge';

const save = () => newSave({ now: 0, starterTroopIds: [6000, 6097, 6457] });

it('直购定价与稀有度一致，并明显高于宝石箱单抽', () => {
  expect(['Rare', 'UltraRare', 'Epic', 'Legendary', 'Mythic', 'Doomed'].map(gemBuyCost)).toEqual([900, 1600, 2400, 4000, 4000, 6000]);
});

describe('武器获取途径（官方 MasteryRequirement 接线）', () => {
  it('718 把都有一行条件，不再落「暂无」或「官方：」', () => {
    const kinds = new Map<string, number>();
    for (const weapon of ALL_CATALOG_WEAPONS) {
      const acquire = acquireOf(weapon);
      expect(acquire.label.includes('暂无')).toBe(false);
      expect(acquire.label.includes('官方')).toBe(false);
      expect(acquire.label.includes('解锁该职业后领取')).toBe(false);
      expect(acquire.label.includes('王国武器包')).toBe(false);
      expect(acquire.label.includes('活动武器')).toBe(false);
      expect(acquire.label.includes('\n')).toBe(false);
      if (acquire.kind === 'class') expect(acquire.label).toMatch(/^.+专属 · 职业 250 胜解锁$/);
      if (acquire.kind === 'buy' && acquire.kingdom) {
        expect(acquire.label).toBe(`宝石商店 · 通关${acquire.kingdom}后购买`);
        expect(acquireFilterKind(acquire)).toBe('kingdom');
      }
      if (acquire.kind === 'buy' && !acquire.kingdom) {
        expect(acquire.label).toMatch(/^宝石商店 · [\d,]+ 宝石$/);
        expect(acquireFilterKind(acquire)).toBe('buy');
      }
      kinds.set(acquire.kind, (kinds.get(acquire.kind) ?? 0) + 1);
    }
    expect(kinds.get('starter')).toBe(22);
    expect(kinds.get('class')).toBe(38);
    expect(kinds.get('mastery')).toBeGreaterThan(80);
    expect(kinds.get('forge')).toBe(12);
    expect(kinds.get('kingdom') ?? 0).toBe(0);
    expect((kinds.get('buy') ?? 0) + (kinds.get('placeholder') ?? 0)).toBeGreaterThan(500);
  });

  it('起始 / 精通 / 职业 / 熔炉 / 商店 口径与官方字段对齐', () => {
    expect(acquireOf(anyWeaponById('gw_KnightsSword')!).kind).toBe('starter');
    expect(acquireOf(anyWeaponById('gw_FalchionOfKings')!).kind).toBe('mastery');
    expect(acquireOf(anyWeaponById('gw_FalchionOfKings')!).masteryNeed).toBe(8);
    expect(acquireOf(anyWeaponById('gw_FalchionOfKings')!).label).toBe('水之精通 8');
    const serve = acquireOf(anyWeaponById('gw_ServeAndProtect')!);
    expect(serve.kind).toBe('class');
    expect(serve.classId).toBe(classByKingdom('剑锋崖')?.id);
    expect(serve.label).toMatch(/专属 · 职业 250 胜解锁$/);
    expect(acquireOf(anyWeaponById('gw_Dragonator8000')!).label).toBe('机械师专属 · 职业 250 胜解锁');
    expect(acquireOf(anyWeaponById('gw_Dawnbringer')!).kind).toBe('forge');
    expect(findRecipe('gw_Dawnbringer')).toBeTruthy();
    for (const id of ['gw_RopeDart', 'gw_EarthsFury']) {
      const weapon = anyWeaponById(id)!;
      expect(acquireOf(weapon).kind).toBe('forge');
      expect(listedInGemShop(save(), weapon)).toBe(false);
      expect(findRecipe(id)).toBeTruthy();
      expect(claimWeapon(save(), id)).toMatchObject({ ok: false, code: 'INVALID' });
    }
    expect(acquireOf(anyWeaponById('gw_ShatteredBlade')!).kind).toBe('buy');
    expect(acquireOf(anyWeaponById('gw_ShatteredBlade')!).gems).toBe(2_400);
    expect(acquireOf(anyWeaponById('gw_ShatteredBlade')!).kingdom).toBeUndefined();
    const aegis = acquireOf(anyWeaponById('gw_WhiteAegis')!);
    expect(aegis.kind).toBe('buy');
    expect(aegis.kingdom).toBe('白盔国');
    expect(aegis.label).toBe('宝石商店 · 通关白盔国后购买');
    expect(acquireFilterKind(aegis)).toBe('kingdom');
    expect(acquireOf(anyWeaponById('gw_CrudeClub')!).kind).toBe('mastery');
    expect(acquireOf(anyWeaponById('gw_CrudeClub')!).label).toBe('火之精通 6');
    expect(acquireOf(anyWeaponById('gw_GoldenCog')!).label).toBe('火·空气精通 8');
    expect(acquireOf(anyWeaponById('gw_PrismaticOrb')!).label).toBe('全系精通 21');
    expect(acquireOf(anyWeaponById('gw_ImperialJewel')!).label).toBe('全系精通 32');
  });

  it('个人与王国精通合计达标后可免费领取', () => {
    const s = save();
    const blade = anyWeaponById('gw_FalchionOfKings')!;
    expect(acquireProgress(s, acquireOf(blade)).ready).toBe(false);
    expect(claimWeapon(s, blade.id)).toMatchObject({ ok: false, code: 'PREREQ_LOCKED' });
    s.hero.level = 16;
    s.kingdoms['风暴峡湾'] = { level: 10, questsDone: 8, exploreTier: 0, lastTributeAt: 0 };
    expect(acquireProgress(s, acquireOf(blade)).ready).toBe(true);
    expect(claimWeapon(s, blade.id)).toEqual({ ok: true, weaponId: blade.id });
    expect(canUseWeapon(s, blade)).toBe(true);
    expect(claimWeapon(s, blade.id)).toMatchObject({ ok: false, code: 'INVALID' });
  });

  it('全系精通 21 可通过王国成长在 100 级前解锁', () => {
    const s = save();
    const orb = anyWeaponById('gw_PrismaticOrb')!;
    s.hero.level = KINGDOM_ORDER.length;
    for (const kingdom of KINGDOM_ORDER) {
      s.kingdoms[kingdom] = { level: 5, questsDone: 8, exploreTier: 0, lastTributeAt: 0 };
    }
    expect(acquireProgress(s, acquireOf(orb)).ready).toBe(true);
    expect(claimWeapon(s, orb.id)).toMatchObject({ ok: true, weaponId: orb.id });
  });

  it('职业神话在解锁对应职业且满 250 胜后可领取', () => {
    const s = save();
    const weapon = anyWeaponById('gw_ServeAndProtect')!;
    const cls = classByKingdom('剑锋崖')!;
    expect(claimWeapon(s, weapon.id)).toMatchObject({ ok: false, code: 'PREREQ_LOCKED' });
    s.hero.unlockedClasses.push(cls.id);
    expect(claimWeapon(s, weapon.id)).toMatchObject({ ok: false, code: 'PREREQ_LOCKED' });
    expect(acquireProgress(s, acquireOf(weapon)).short).toBe(`0/${CLASS_WEAPON_WINS} 胜`);
    s.hero.classWins[cls.id] = CLASS_WEAPON_WINS;
    expect(claimWeapon(s, weapon.id)).toEqual({ ok: true, weaponId: weapon.id });
  });

  it('王国包未通关不上宝石商店，通关后扣宝石购买；熔炉不能用领取绕过', () => {
    const s = save();
    const aegis = anyWeaponById('gw_WhiteAegis')!;
    const acquire = acquireOf(aegis);
    const cost = acquire.gems ?? 0;
    expect(listedInGemShop(s, aegis)).toBe(false);
    expect(claimWeapon(s, aegis.id)).toMatchObject({ ok: false, code: 'PREREQ_LOCKED' });
    s.kingdoms['白盔国'] = { level: 1, questsDone: 8, exploreTier: 0, lastTributeAt: 0 };
    expect(listedInGemShop(s, aegis)).toBe(true);
    s.currencies.gems = cost - 1;
    expect(claimWeapon(s, aegis.id)).toMatchObject({ ok: false, code: 'INSUFFICIENT' });
    s.currencies.gems = cost;
    expect(claimWeapon(s, aegis.id)).toEqual({ ok: true, weaponId: aegis.id });
    expect(s.currencies.gems).toBe(0);
    expect(claimWeapon(s, 'gw_Dawnbringer')).toMatchObject({ ok: false, code: 'INVALID' });
  });

  it('无王国门槛的宝石商店直购扣宝石，灵魂不动；余额不足拒绝', () => {
    const s = save();
    const weapon = anyWeaponById('gw_ShatteredBlade')!;
    const acquire = acquireOf(weapon);
    expect(acquire.kind).toBe('buy');
    expect(acquire.kingdom).toBeUndefined();
    const cost = acquire.gems ?? 0;
    s.currencies.gems = cost - 1;
    const souls = s.currencies.souls;
    expect(claimWeapon(s, weapon.id)).toMatchObject({ ok: false, code: 'INSUFFICIENT' });
    expect(s.currencies.souls).toBe(souls);
    s.currencies.gems = cost;
    expect(claimWeapon(s, weapon.id)).toEqual({ ok: true, weaponId: weapon.id });
    expect(s.currencies.gems).toBe(0);
    expect(s.currencies.souls).toBe(souls);
    expect(s.hero.unlockedWeapons).toContain(weapon.id);
  });

  it('转入熔炉的活动武器只能锻造，成功后按配方扣费', () => {
    const s = save();
    const id = 'gw_RopeDart';
    const recipe = findRecipe(id)!;
    s.currencies.gems = 10_000;
    s.currencies.souls = recipe.souls;
    s.currencies.gold = recipe.gold;
    expect(claimWeapon(s, id)).toMatchObject({ ok: false, code: 'INVALID' });
    expect(forgeCatalogWeapon(s, id, 19)).toMatchObject({ ok: false, code: 'PREREQ_LOCKED' });
    expect(forgeCatalogWeapon(s, id, 20)).toEqual({ ok: true, weaponId: id });
    expect(s.currencies.souls).toBe(0);
    expect(s.currencies.gold).toBe(0);
    expect(s.currencies.gems).toBe(10_000);
    expect(s.hero.unlockedWeapons).toContain(id);
  });
});

it('Wand of Stars is a mythic collection recipe with five tempering affixes', () => {
  const weapon = anyWeaponById('gw_WandOfStars')!;
  const recipe = findRecipe(weapon.id)!;
  expect(weapon.rarity).toBe('Mythic');
  expect(weapon.rarityIdx).toBe(5);
  expect(acquireOf(weapon).kind).toBe('forge');
  expect(listedInGemShop(save(), weapon)).toBe(false);
  expect(recipe).toMatchObject({ tier: 2, rarity: 'Mythic', gold: 3_000_000, souls: 1_800_000 });
  expect(temperingMaxLevel(weapon.rarity)).toBe(10);
  expect(affixUnlockLevels(weapon.rarity)).toEqual([6, 7, 8, 9, 10]);
  expect([5, 6, 7, 8, 9, 10].map(level => affixUnlockedCount(weapon.rarity, level))).toEqual([0, 1, 2, 3, 4, 5]);
  expect(weapon.affixes).toHaveLength(5);
  expect(weapon.affixes[3]?.description).toBe('获得 2 点护甲');
  expect(weapon.affixes[4]?.description).toBe('摧毁一颗非骷髅的随机宝石');

  const s = save();
  s.currencies.gems = 10_000;
  s.currencies.gold = recipe.gold;
  s.currencies.souls = recipe.souls - 1;
  expect(claimWeapon(s, weapon.id)).toMatchObject({ ok: false, code: 'INVALID' });
  expect(forgeCatalogWeapon(s, weapon.id, 40)).toMatchObject({ ok: false, code: 'INSUFFICIENT' });
  expect(s.currencies.gold).toBe(recipe.gold);
  s.currencies.souls = recipe.souls;
  expect(forgeCatalogWeapon(s, weapon.id, 39)).toMatchObject({ ok: false, code: 'PREREQ_LOCKED' });
  expect(forgeCatalogWeapon(s, weapon.id, 40)).toEqual({ ok: true, weaponId: weapon.id });
  expect(s.currencies.gold).toBe(0);
  expect(s.currencies.souls).toBe(0);
  expect(s.currencies.gems).toBe(10_000);
});
