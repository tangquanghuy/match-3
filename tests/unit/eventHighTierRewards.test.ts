import { battleIncomeView } from '../../src/meta/screens/resultScreen';
import { describe, expect, it } from 'vitest';
import { EVENT_ARCANE_STONES, EVENT_MILESTONES, EVENT_SHARED_GOALS, WEEK_MS } from '../../src/meta/data/events';
import { newSave } from '../../src/meta/state/schema';
import { migrateSave } from '../../src/meta/state/save';
import { ensureEventWeek, eventModeState } from '../../src/meta/systems/events';
import { rewardRaidHighTier, rewardTowerHighTier } from '../../src/meta/systems/eventHighTierRewards';
import { eventBattle, fakeResult, settleEvent } from './helpers/eventDriver';
const WEEK = 1_700_000_000_000 - (1_700_000_000_000 % WEEK_MS);
const fresh = () => { const s = newSave({ now: 0, starterTroopIds: [6000, 6097, 6457] }); s.hero.level = 20; return s; };

describe('高阶活动奖励按真实难度结算', () => {
  it('same tower battle exposes milestone gems and shared weekly payout actually credited, never replayed', () => {
    const s = fresh();
    const w = ensureEventWeek(s, WEEK, 'towerOfDoom');
    w.points = EVENT_MILESTONES.towerOfDoom[4]!.points - 1;
    w.wins = EVENT_SHARED_GOALS[0]!.wins - 1;
    w.claimed = [0, 1, 2, 3];
    for (const i of w.claimed) w.eventData[`gemPaid${i}`] = EVENT_MILESTONES.towerOfDoom[i]!.gems ?? 0;
    const out = eventBattle(s, 'towerOfDoom', WEEK);
    const before = { ...s.currencies };
    const beforeEpic = s.materials.ingots.epic ?? 0;
    const result = fakeResult(out);
    const detail = settleEvent(s, out, result, WEEK);
    expect(w.claimed).toContain(4);
    expect(detail.lines.some(l => l.key === 'event-milestone' && l.mats?.traitstones?.['runic:purple'])).toBe(true);
    expect(detail.lines.some(l => l.key === 'event-milestone' && l.mats?.ingots?.epic === EVENT_SHARED_GOALS[0]!.epicIngots)).toBe(true);
    expect(detail.lines.some(l => l.key === 'event-milestone' && l.deltas.gems === EVENT_MILESTONES.towerOfDoom[4]!.gems)).toBe(true);
    const view = battleIncomeView(detail);
    for (const key of ['gold', 'souls', 'gems'] as const) expect(view[key]).toBe(s.currencies[key] - before[key]);
    expect(view.materials.find(m => m.key === 'ingot:epic')?.amount).toBe(s.materials.ingots.epic! - beforeEpic);
    expect(s.materials.traitstones.celestial ?? 0).toBe(0);
    const replay = settleEvent(s, out, result, WEEK);
    expect(battleIncomeView(replay).gems).toBe(0);
    expect(battleIncomeView(replay).materials).toEqual([]);
    expect(s.currencies.gems - before.gems).toBe(view.gems);
  });
  it('普通里程碑材料全部翻倍，零秘法积分奖励', () => {
    const sum = (prefix: string) => Object.values(EVENT_MILESTONES).flat().reduce((n, row) => n + Object.entries(row.mats?.traitstones ?? {}).filter(([key]) => key.startsWith(prefix)).reduce((m, [, a]) => m + (a ?? 0), 0), 0);
    expect(sum('minor:')).toBe(176);
    expect(sum('major:')).toBe(128);
    expect(sum('runic:')).toBe(108);
    expect(sum('celestial')).toBe(0);
    expect(sum('arcane:')).toBe(0);
    for (const [typeId, milestones] of Object.entries(EVENT_MILESTONES)) {
      expect(milestones.at(-1)?.mats?.traitstones?.celestial ?? 0, typeId).toBe(0);
    }
    expect(EVENT_MILESTONES.towerOfDoom[4]?.mats?.traitstones?.celestial ?? 0).toBe(0);
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
    for (const key of EVENT_ARCANE_STONES.raidBoss) expect(s.materials.traitstones[key]).toBe(4);
    expect(s.materials.traitstones.celestial ?? 0).toBe(0);
  });
  it('低难不耗独立额度；秘法4次、Lv80圣辉2次独立限额，存读档防重复', () => {
    let s = fresh(); let w = ensureEventWeek(s, WEEK, 'raidBoss');
    expect(rewardRaidHighTier(s, w, 47, 10)).toEqual([]);
    expect(w.eventData.arcaneRaidKills ?? 0).toBe(0);
    for (let tier = 11; tier <= 15; tier++) rewardRaidHighTier(s, w, 50 + (tier - 11) * 3, tier);
    for (const key of EVENT_ARCANE_STONES.raidBoss) expect(s.materials.traitstones[key]).toBe(16);
    for (let tier = 21; tier <= 24; tier++) rewardRaidHighTier(s, w, 80 + (tier - 21) * 3, tier);
    expect(s.materials.traitstones.celestial).toBe(4);
    s = migrateSave(JSON.parse(JSON.stringify(s))); w = ensureEventWeek(s, WEEK, 'raidBoss');
    expect(rewardRaidHighTier(s, w, 80, 21)).toEqual([]);
    expect(s.materials.traitstones.celestial).toBe(4);
    w = ensureEventWeek(s, WEEK + WEEK_MS, 'raidBoss');
    expect(rewardRaidHighTier(s, w, 80, 21)).toHaveLength(1);
    expect(s.materials.traitstones.celestial).toBe(6);
  });
  it('塔阈值由高层战斗兑现，非战斗层阈值延至下一场；重刷不重复', () => {
    const s = fresh(); const w = ensureEventWeek(s, WEEK, 'towerOfDoom');
    expect(rewardTowerHighTier(s, w, 15)).toEqual([]);
    rewardTowerHighTier(s, w, 17); // 16若是营地，17层战胜时兑现
    for (const key of EVENT_ARCANE_STONES.towerOfDoom) expect(s.materials.traitstones[key]).toBe(2);
    expect(rewardTowerHighTier(s, w, 17)).toEqual([]);
    rewardTowerHighTier(s, w, 21);
    rewardTowerHighTier(s, w, 25);
    for (const key of EVENT_ARCANE_STONES.towerOfDoom) expect(s.materials.traitstones[key]).toBe(12);
    expect(s.materials.traitstones.celestial).toBe(2);
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
    // 高层奖励与三区首领通关材料均翻倍。
    for (const key of EVENT_ARCANE_STONES.towerOfDoom) expect(s.materials.traitstones[key]).toBe(18);
    // 结算总圣辉包含已有积分里程碑，检查高难结算行的来源由独立账本保证。
    expect(s.materials.traitstones.celestial).toBeGreaterThanOrEqual(1);
  });
});
