import { describe, it, expect } from 'vitest';
import { getTroopById } from '../../src/data/troops';
import { troopStatsAtLevel } from '../../src/data/leveling';
import {
  ascend,
  decompose,
  getRecord,
  grantTroop,
  levelCapFor,
  levelCapOf,
  levelUp,
  newSave,
  rarityTierOf,
  soulCostForLevel,
  totalSoulCost,
  troopStatsOf,
  unlockTrait,
} from '../../src/meta';
import { ascensionCopiesNeeded, decomposeYield } from '../../src/meta/data/economy';
import { stoneColorKeyOf } from '../../src/meta/data/materials';
import { BaseColor } from '../../src/engine/types';

const OGRE = 6000; // 食人魔：破碎尖塔 Common（rarityIdx 0）
const LEGEND = 6169; // 德拉古力斯：Legendary（rarityIdx 5）

const save = (starter = OGRE) => newSave({ now: 0, starterTroopIds: [starter], currencies: { gold: 50000, souls: 50000 } });

describe('等级上限（官方口径 15/16/17/18/19/20）', () => {
  it('按稀有度档与升阶数取上限，封顶 20', () => {
    expect(levelCapFor(0, 0)).toBe(15);
    expect(levelCapFor(0, 1)).toBe(16);
    expect(levelCapFor(3, 0)).toBe(18);
    expect(levelCapFor(5, 0)).toBe(20);
    expect(levelCapFor(5, 3)).toBe(20);
  });

  it('升阶提档：食人魔升一阶后上限 16、稀有度档 +1', () => {
    const s = save();
    grantTroop(s, OGRE, 6); // 5 张升阶 + 本体已在册
    const r = ascend(s, OGRE);
    expect(r).toMatchObject({ ok: true, ascension: 1, copiesConsumed: 5 });
    const troop = getTroopById(OGRE)!;
    const rec = getRecord(s, OGRE)!;
    expect(levelCapOf(troop, rec)).toBe(16);
    expect(rarityTierOf(troop, rec)).toBe(1);
  });
});

describe('灵魂成本曲线（设计值单源）', () => {
  it('逐级成本单调递增；1→2 级恰好是基础值', () => {
    expect(soulCostForLevel(0, 2)).toBe(30);
    expect(soulCostForLevel(0, 3)).toBe(70);
    for (let lv = 2; lv < 20; lv++) {
      expect(soulCostForLevel(0, lv + 1)).toBeGreaterThan(soulCostForLevel(0, lv));
    }
  });

  it('总消耗 = 逐级求和；高稀有度更贵（升阶不改成本表）', () => {
    const total = totalSoulCost(0, 1, 5);
    expect(total).toBe(30 + 70 + 120 + 170); // 就近取 5 的设计锚点
    expect(totalSoulCost(0, 1, 5)).toBe(
      [2, 3, 4, 5].reduce((sum, lv) => sum + soulCostForLevel(0, lv), 0),
    );
    expect(totalSoulCost(5, 1, 5)).toBeGreaterThan(total);
  });
});

describe('升级（灵魂）', () => {
  it('正常升级：扣灵魂、记录 from/to 与总耗', () => {
    const s = save();
    const cost = totalSoulCost(0, 1, 5);
    const r = levelUp(s, OGRE, 5);
    expect(r).toEqual({ ok: true, from: 1, to: 5, soulsSpent: cost });
    expect(getRecord(s, OGRE)!.level).toBe(5);
    expect(s.currencies.souls).toBe(50000 - cost);
  });

  it('超过稀有度上限 → AT_CAP（升阶可提升）', () => {
    const s = save();
    expect(levelUp(s, OGRE, 16)).toMatchObject({ ok: false, code: 'AT_CAP' });
  });

  it('灵魂不足 → INSUFFICIENT 且存档不动', () => {
    const s = newSave({ now: 0, starterTroopIds: [OGRE], currencies: { souls: 10 } });
    const r = levelUp(s, OGRE, 3);
    expect(r).toMatchObject({ ok: false, code: 'INSUFFICIENT' });
    expect(getRecord(s, OGRE)!.level).toBe(1);
    expect(s.currencies.souls).toBe(10);
  });

  it('非法目标（回退/非整数）→ INVALID', () => {
    const s = save();
    expect(levelUp(s, OGRE, 1)).toMatchObject({ ok: false, code: 'INVALID' });
    expect(levelUp(s, OGRE, 2.5)).toMatchObject({ ok: false, code: 'INVALID' });
  });
});

describe('升阶（同名卡 5/10/25，不耗本体）', () => {
  it('副本不足 → NEED_COPIES；凑够 5 张后成功（本体不动）', () => {
    const s = save();
    expect(ascensionCopiesNeeded(0)).toBe(5);
    expect(ascend(s, OGRE)).toMatchObject({ ok: false, code: 'NEED_COPIES' });
    grantTroop(s, OGRE, 5);
    const r = ascend(s, OGRE);
    expect(r).toMatchObject({ ok: true, ascension: 1, copiesConsumed: 5 });
    expect(getRecord(s, OGRE)!.copies).toBe(0);
  });

  it('三阶满阶后 → MAXED', () => {
    const s = save();
    grantTroop(s, OGRE, 40); // 5+10+25
    for (let i = 0; i < 3; i++) {
      expect(ascend(s, OGRE)).toMatchObject({ ok: true });
    }
    expect(ascend(s, OGRE)).toMatchObject({ ok: false, code: 'MAXED' });
    expect(getRecord(s, OGRE)!.ascension).toBe(3);
  });

  it('Legendary 基础卡升阶不再提上限（仍封顶 20）', () => {
    const s = save(LEGEND);
    grantTroop(s, LEGEND, 6);
    const r = ascend(s, LEGEND);
    expect(r).toMatchObject({ ok: true, newCap: 20 });
  });
});

describe('特质解锁（特质石+黄金，裁定②修订 2026-09-19）', () => {
  const primary = stoneColorKeyOf(getTroopById(OGRE)!.manaColors[0] ?? BaseColor.Brown);
  const key = (tier: string): string => `${tier}:${primary}`;

  it('槽位号非法 / 前置未解锁 / 已解锁', () => {
    const s = save();
    s.materials.traitstones = { [key('minor')]: 99, [key('major')]: 99, [key('runic')]: 99, celestial: 99 };
    expect(unlockTrait(s, OGRE, 0)).toMatchObject({ ok: false, code: 'BAD_SLOT' });
    expect(unlockTrait(s, OGRE, 4)).toMatchObject({ ok: false, code: 'BAD_SLOT' });
    expect(unlockTrait(s, OGRE, 2)).toMatchObject({ ok: false, code: 'PREREQ_LOCKED' });
    expect(unlockTrait(s, OGRE, 1)).toMatchObject({ ok: true, slot: 1 });
    expect(unlockTrait(s, OGRE, 1)).toMatchObject({ ok: false, code: 'ALREADY_UNLOCKED' });
  });

  it('特质 1 = minor×8 + 黄金 2000；特质 2 加 major/runic；特质 3 加 celestial；同名卡零消耗', () => {
    const s = save();
    s.materials.traitstones = {
      [key('minor')]: 30,
      [key('major')]: 16,
      [key('runic')]: 6,
      celestial: 2,
    };
    const r1 = unlockTrait(s, OGRE, 1);
    expect(r1).toMatchObject({ ok: true, cost: { gold: 2000, stones: { [key('minor')]: 8 } } });
    expect(s.currencies.gold).toBe(48000);
    expect(s.materials.traitstones[key('minor')]).toBe(22);
    expect(getRecord(s, OGRE)!.copies).toBe(0); // 同名卡不再消耗

    const r2 = unlockTrait(s, OGRE, 2);
    expect(r2).toMatchObject({
      ok: true,
      cost: { gold: 5000, stones: { [key('minor')]: 12, [key('major')]: 6, [key('runic')]: 2 } },
    });
    expect(s.materials.traitstones[key('major')]).toBe(10);

    const r3 = unlockTrait(s, OGRE, 3);
    expect(r3).toMatchObject({ ok: true, cost: { gold: 12000, stones: { [key('major')]: 10, [key('runic')]: 4, celestial: 2 } } });
    expect(getRecord(s, OGRE)!.traits).toEqual([true, true, true]);
    expect(s.materials.traitstones.celestial).toBe(0);
  });

  it('特质石不足 / 黄金不足（素材回滚）→ 整笔不动', () => {
    const s = save();
    s.materials.traitstones[key('minor')] = 3; // 少于 8
    expect(unlockTrait(s, OGRE, 1)).toMatchObject({ ok: false, code: 'INSUFFICIENT' });
    expect(getRecord(s, OGRE)!.traits).toEqual([false, false, false]);

    const s2 = newSave({ now: 0, starterTroopIds: [OGRE], currencies: { gold: 100 } });
    s2.materials.traitstones[key('minor')] = 50;
    expect(unlockTrait(s2, OGRE, 1)).toMatchObject({ ok: false, code: 'INSUFFICIENT' });
    expect(s2.materials.traitstones[key('minor')]).toBe(50); // 素材回滚
    expect(s2.currencies.gold).toBe(100);
    expect(getRecord(s2, OGRE)!.traits).toEqual([false, false, false]);
  });
});

describe('分解与入册', () => {
  it('本体不可拆；locked 整卡保护', () => {
    const s = save();
    expect(decompose(s, OGRE, 1)).toMatchObject({ ok: false, code: 'NEED_COPIES' });
    getRecord(s, OGRE)!.locked = true;
    grantTroop(s, OGRE, 3);
    expect(decompose(s, OGRE, 1)).toMatchObject({ ok: false, code: 'LOCKED' });
  });

  it('拆副本按稀有度给黄金+灵魂（批量求和）', () => {
    const s = save();
    grantTroop(s, OGRE, 2); // copies 2
    const y = decomposeYield(0); // { gold: 25, souls: 5 }
    const r = decompose(s, OGRE, 2);
    expect(r).toEqual({ ok: true, count: 2, gained: { gold: y.gold * 2, souls: y.souls * 2 } });
    expect(getRecord(s, OGRE)!.copies).toBe(0);
    expect(s.currencies.gold).toBe(50000 + y.gold * 2);
  });

  it('grantTroop：首次入册 copies=0，重复累加；悬空 id 拒绝', () => {
    const s = save();
    expect(getRecord(s, OGRE)!.copies).toBe(0);
    grantTroop(s, OGRE, 1);
    expect(getRecord(s, OGRE)!.copies).toBe(1);
    expect(grantTroop(s, 123456, 1)).toBeNull();
  });
});

describe('四维桥接', () => {
  it('troopStatsOf 与 leveling 曲线一致（升阶只改上限不改当前四维）', () => {
    const s = save();
    const troop = getTroopById(OGRE)!;
    const rec = getRecord(s, OGRE)!;
    expect(troopStatsOf(troop, rec)).toEqual(troopStatsAtLevel(troop, 1));
    levelUp(s, OGRE, 5);
    expect(troopStatsOf(troop, rec)).toEqual(troopStatsAtLevel(troop, 5));
  });
});
