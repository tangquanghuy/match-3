import { describe, expect, it } from 'vitest';
import { EVENT_ARCANE_STONES, EVENT_MILESTONES, WEEK_MS } from '../../src/meta/data/events';
import { newSave } from '../../src/meta/state/schema';
import { migrateSave } from '../../src/meta/state/save';
import { ensureEventWeek, eventModeState } from '../../src/meta/systems/events';
import { rewardRaidHighTier, rewardTowerHighTier } from '../../src/meta/systems/eventHighTierRewards';
import { eventBattle, fakeResult, settleEvent } from './helpers/eventDriver';
const WEEK = 1_700_000_000_000 - (1_700_000_000_000 % WEEK_MS);
const fresh = () => { const s = newSave({ now: 0, starterTroopIds: [6000, 6097, 6457] }); s.hero.level = 20; return s; };

describe('高阶活动奖励按真实难度结算', () => {
  it('普通里程碑基础材料翻倍，既有圣辉3颗不变，零秘法积分奖励', () => {
    const sum = (prefix: string) => Object.values(EVENT_MILESTONES).flat().reduce((n, row) => n + Object.entries(row.mats?.traitstones ?? {}).filter(([key]) => key.startsWith(prefix)).reduce((m, [, a]) => m + (a ?? 0), 0), 0);
    expect(sum('minor:')).toBe(88);
    expect(sum('major:')).toBe(64);
    expect(sum('runic:')).toBe(54);
    expect(sum('celestial')).toBe(3);
    expect(sum('arcane:')).toBe(0);
  });
  it('普通讨伐额度已用尽不妨碍Lv50首领奖励；打伤不等于击破', () => {
    const s = fresh(); const w = ensureEventWeek(s, WEEK, 'raidBoss'); w.playRewards = 4;
    const raid = eventModeState(s, WEEK, 'raidBoss'); raid.tier = 11; raid.hp = raid.max;
    const out = eventBattle(s, 'raidBoss', WEEK);
    expect(out.plan.enemies[0]!.level).toBe(50);
    settleEvent(s, out, fakeResult(out, false), WEEK);
    expect(w.eventData.arcaneRaidKills ?? 0).toBe(0);
    const retry = eventBattle(s, 'raidBoss', WEEK);
    settleEvent(s, retry, undefined, WEEK);
    expect(w.eventData.arcaneRaidKills).toBe(1);
    for (const key of EVENT_ARCANE_STONES.raidBoss) expect(s.materials.traitstones[key]).toBe(2);
    expect(s.materials.traitstones.celestial ?? 0).toBe(0);
  });
  it('低难不耗独立额度；秘法4次、Lv80圣辉2次独立限额，存读档防重复', () => {
    let s = fresh(); let w = ensureEventWeek(s, WEEK, 'raidBoss');
    expect(rewardRaidHighTier(s, w, 47, 10)).toEqual([]);
    expect(w.eventData.arcaneRaidKills ?? 0).toBe(0);
    for (let tier = 11; tier <= 15; tier++) rewardRaidHighTier(s, w, 50 + (tier - 11) * 3, tier);
    for (const key of EVENT_ARCANE_STONES.raidBoss) expect(s.materials.traitstones[key]).toBe(8);
    for (let tier = 21; tier <= 24; tier++) rewardRaidHighTier(s, w, 80 + (tier - 21) * 3, tier);
    expect(s.materials.traitstones.celestial).toBe(2);
    s = migrateSave(JSON.parse(JSON.stringify(s))); w = ensureEventWeek(s, WEEK, 'raidBoss');
    expect(rewardRaidHighTier(s, w, 80, 21)).toEqual([]);
    expect(s.materials.traitstones.celestial).toBe(2);
    w = ensureEventWeek(s, WEEK + WEEK_MS, 'raidBoss');
    expect(rewardRaidHighTier(s, w, 80, 21)).toHaveLength(1);
    expect(s.materials.traitstones.celestial).toBe(3);
  });
  it('塔阈值由高层战斗兑现，非战斗层阈值延至下一场；重刷不重复', () => {
    const s = fresh(); const w = ensureEventWeek(s, WEEK, 'towerOfDoom');
    expect(rewardTowerHighTier(s, w, 15)).toEqual([]);
    rewardTowerHighTier(s, w, 17); // 16若是营地，17层战胜时兑现
    for (const key of EVENT_ARCANE_STONES.towerOfDoom) expect(s.materials.traitstones[key]).toBe(1);
    expect(rewardTowerHighTier(s, w, 17)).toEqual([]);
    rewardTowerHighTier(s, w, 21);
    rewardTowerHighTier(s, w, 25);
    for (const key of EVENT_ARCANE_STONES.towerOfDoom) expect(s.materials.traitstones[key]).toBe(6);
    expect(s.materials.traitstones.celestial).toBe(1);
    expect(rewardTowerHighTier(s, w, 25)).toEqual([]);
  });
  it('真实登塔战斗路径可触发全部高层奖励，低层胜利和高层失败不发', () => {
    const s = fresh(); const w = ensureEventWeek(s, WEEK, 'towerOfDoom');
    let reached = 0;
    for (let i = 0; i < 40 && reached < 25; i++) {
      const out = eventBattle(s, 'towerOfDoom', WEEK);
      // 在同一真实高层计划上模拟失败；独立存档不影响后面的成功路径。
      if (reached >= 15) {
        const failed = migrateSave(JSON.parse(JSON.stringify(s)));
        const before = JSON.stringify(failed.materials.traitstones);
        const ledger = { ...ensureEventWeek(failed, WEEK, 'towerOfDoom').eventData };
        settleEvent(failed, out, fakeResult(out, false), WEEK);
        const after = ensureEventWeek(failed, WEEK, 'towerOfDoom').eventData;
        for (const floor of [16, 20, 25]) expect(after[`arcaneTower${floor}`]).toBe(ledger[`arcaneTower${floor}`]);
        expect(JSON.stringify(failed.materials.traitstones)).toBe(before);
      }
      settleEvent(s, out, undefined, WEEK);
      reached = w.eventData.floorBest ?? 0;
      if (reached < 16) expect(w.eventData.arcaneTower16 ?? 0).toBe(0);
    }
    expect(reached).toBe(25);
    expect(w.eventData).toMatchObject({ arcaneTower16: 1, arcaneTower20: 1, arcaneTower25: 1 });
    // 原高层奖励各 6 + 三区通关材料各 3；独立奖励叠加。
    for (const key of EVENT_ARCANE_STONES.towerOfDoom) expect(s.materials.traitstones[key]).toBe(9);
    // 结算总圣辉包含已有积分里程碑，检查高难结算行的来源由独立账本保证。
    expect(s.materials.traitstones.celestial).toBeGreaterThanOrEqual(1);
  });
});
