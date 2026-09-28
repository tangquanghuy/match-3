/**
 * 王国推进口径：每级开一国（Lv.42 全开）、敌人基数跟随解锁等级、迷雾三态、
 * 等级收益轨道、主角经验曲线（50 级前平缓、之后陡峭）。
 */
import { describe, expect, it } from 'vitest';
import {
  ALL_KINGDOMS_UNLOCK_LEVEL,
  KINGDOM_ORDER,
  kingdomBaseLevel,
  kingdomsUnlockedAt,
  kingdomsUnlockedBetween,
  kingdomUnlockLevel,
  questEnemyLevel,
} from '../../src/meta/data/kingdoms';
import { heroXpToNext, heroXpTotalTo } from '../../src/meta/data/classes';
import {
  FOG_SCOUT_LEVELS,
  kingdomFogOf,
  kingdomLevelTrack,
  kingdomNodeState,
  upgradeKingdom,
} from '../../src/meta/systems/kingdomOps';
import { newSave } from '../../src/meta/state/schema';

describe('王国解锁：每升一级开一个王国', () => {
  it('推进序第 n 个王国在 Lv.n+1 开放，Lv.42 全部开放', () => {
    expect(kingdomUnlockLevel('破碎尖塔')).toBe(1);
    KINGDOM_ORDER.forEach((k, i) => expect(kingdomUnlockLevel(k)).toBe(i + 1));
    expect(ALL_KINGDOMS_UNLOCK_LEVEL).toBe(KINGDOM_ORDER.length);
    expect(kingdomsUnlockedAt(1)).toEqual(['破碎尖塔']);
    expect(kingdomsUnlockedAt(10)).toHaveLength(10);
    expect(kingdomsUnlockedAt(ALL_KINGDOMS_UNLOCK_LEVEL)).toHaveLength(KINGDOM_ORDER.length);
    for (let lv = 2; lv <= ALL_KINGDOMS_UNLOCK_LEVEL; lv++) {
      expect(kingdomsUnlockedBetween(lv - 1, lv).length).toBeGreaterThanOrEqual(1);
    }
    expect(kingdomsUnlockedBetween(4, 7)).toEqual(KINGDOM_ORDER.slice(4, 7));
  });

  it('敌人基数 = 解锁等级：刚开放的王国第 1 关与冒险者同级，第 8 关高 7 级', () => {
    for (const k of KINGDOM_ORDER) {
      expect(kingdomBaseLevel(k)).toBe(Math.min(kingdomUnlockLevel(k), 50));
      expect(questEnemyLevel(k, 8) - questEnemyLevel(k, 1)).toBe(7);
    }
  });

  it('未开放王国不能升级', () => {
    const s = newSave({ now: 0 });
    s.currencies.gold = 1_000_000;
    expect(upgradeKingdom(s, KINGDOM_ORDER[5]!)).toMatchObject({ ok: false, code: 'PREREQ_LOCKED' });
    s.hero.level = 6;
    expect(upgradeKingdom(s, KINGDOM_ORDER[5]!)).toMatchObject({ ok: true, level: 2 });
  });
});

describe('迷雾', () => {
  it('已开放 / 未来 3 级内开放 = 已探明 / 更远 = 迷雾', () => {
    const lv = 5;
    KINGDOM_ORDER.forEach((k, i) => {
      const need = i + 1;
      const fog = kingdomFogOf(lv, k);
      if (need <= lv) expect(fog).toBe('open');
      else if (need <= lv + FOG_SCOUT_LEVELS) expect(fog).toBe('scouted');
      else expect(fog).toBe('hidden');
    });
    const s = newSave({ now: 0 });
    s.hero.level = lv;
    expect(kingdomNodeState(s, KINGDOM_ORDER[6]!, 0).fog).toBe('scouted');
    expect(kingdomNodeState(s, KINGDOM_ORDER[20]!, 0)).toMatchObject({ fog: 'hidden', locked: true, tributeReady: false });
  });
});

describe('王国等级收益轨道', () => {
  it('1~10 级：进贡几率与产出递增，精通 = 等级，10 级才有全体属性加成', () => {
    const track = kingdomLevelTrack();
    expect(track).toHaveLength(10);
    expect(track[0]).toMatchObject({ level: 1, cost: 0, mastery: 1, statBonus: false });
    for (let i = 1; i < track.length; i++) {
      expect(track[i]!.tributeChance).toBeGreaterThan(track[i - 1]!.tributeChance);
      expect(track[i]!.tributeScale).toBeGreaterThan(track[i - 1]!.tributeScale);
      expect(track[i]!.cost).toBeGreaterThan(0);
    }
    expect(track.filter((p) => p.statBonus).map((p) => p.level)).toEqual([10]);
  });
});

describe('主角经验曲线', () => {
  it('单调递增；前 50 级比旧曲线平缓，50 级后更陡', () => {
    const old = (lv: number) => Math.max(10, Math.round((80 * Math.pow(lv, 1.35)) / 10) * 10);
    for (let lv = 1; lv < 100; lv++) expect(heroXpToNext(lv + 1)).toBeGreaterThan(heroXpToNext(lv));
    for (const lv of [5, 10, 20, 30, 40]) expect(heroXpToNext(lv)).toBeLessThan(old(lv));
    for (const lv of [60, 75, 90]) expect(heroXpToNext(lv)).toBeGreaterThan(old(lv));
    let oldTotal = 0;
    for (let lv = 1; lv < ALL_KINGDOMS_UNLOCK_LEVEL; lv++) oldTotal += old(lv);
    expect(heroXpTotalTo(ALL_KINGDOMS_UNLOCK_LEVEL)).toBeLessThan(oldTotal);
  });

  it('按同级主线一场约 40×等级+320 经验估算：新手期约 1 场 1 级，全王国开放时约 5~6 场 1 级', () => {
    const battles = (lv: number) => heroXpToNext(lv) / (40 * lv + 320);
    expect(battles(3)).toBeLessThan(1);
    expect(battles(42)).toBeGreaterThan(4.5);
    expect(battles(42)).toBeLessThan(7);
    expect(battles(99)).toBeGreaterThan(20);
  });
});
