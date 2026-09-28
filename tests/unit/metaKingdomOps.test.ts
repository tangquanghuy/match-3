import { describe, it, expect } from 'vitest';
import { troopStatsAtLevel } from '../../src/data/leveling';
import { getTroopById } from '../../src/data/troops';
import {
  buildBattleRequest,
  kingdomBonusOf,
  kingdomBonusStat,
  KINGDOM_ORDER,
  kingdomUpgradeCost,
  KINGDOM_MAX_LEVEL,
  KINGDOM_UPGRADE_COSTS,
  newSave,
  planQuestEncounter,
  setExploreTier,
  kingdomNodeState,
  upgradeKingdom,
  exploreUnlocked,
} from '../../src/meta';

const KINGDOM = '破碎尖塔';
const LATER = KINGDOM_ORDER[5]; // 推进序第 6 个王国（解锁门槛 > 1）

const save = () => newSave({ now: 0, starterTroopIds: [6000, 6097, 6457] });

describe('王国黄金升级', () => {
  it('成本表递增、末级 4 万（对齐计划口径）', () => {
    expect(KINGDOM_UPGRADE_COSTS).toHaveLength(9);
    expect(kingdomUpgradeCost(1)).toBe(1000);
    expect(kingdomUpgradeCost(9)).toBe(40000);
    for (let lv = 1; lv < 9; lv++) {
      expect(kingdomUpgradeCost(lv + 1)).toBeGreaterThan(kingdomUpgradeCost(lv));
    }
  });

  it('升级扣黄金并写回等级；黄金不足原子拒绝', () => {
    const s = save();
    const r = upgradeKingdom(s, KINGDOM);
    expect(r).toEqual({ ok: true, level: 2, cost: 1000 });
    expect(s.currencies.gold).toBe(1000);
    expect(s.kingdoms[KINGDOM]?.level).toBe(2);

    const fail = upgradeKingdom(s, KINGDOM); // 1000 < 下级 2000
    expect(fail).toMatchObject({ ok: false, code: 'INSUFFICIENT' });
    expect(s.kingdoms[KINGDOM]?.level).toBe(2);
  });

  it('满级 10 级后再升 → MAXED', () => {
    const s = save();
    s.kingdoms[KINGDOM] = { level: KINGDOM_MAX_LEVEL, questsDone: 0, exploreTier: 0, lastTributeAt: 0 };
    expect(upgradeKingdom(s, KINGDOM)).toMatchObject({ ok: false, code: 'MAXED' });
  });

  it('10 级加成聚合：满级王国给绑定属性 +1，并进战斗快照', () => {
    const s = save();
    expect(kingdomBonusStat(KINGDOM)).toBe('health'); // 推进序第 0 位
    s.kingdoms[KINGDOM] = { level: 10, questsDone: 0, exploreTier: 0, lastTributeAt: 0 };
    const bonus = kingdomBonusOf(s);
    expect(bonus).toEqual({ health: 1, armor: 0, attack: 0, magic: 0 });

    // 桥接接线：玩家快照 hp +1，敌人不吃加成
    const troop = getTroopById(6000)!;
    const baseline = troopStatsAtLevel(troop, 1);
    const outcome = buildBattleRequest(s, planQuestEncounter(KINGDOM, 1, 7));
    if (!outcome.ok) throw new Error(outcome.message);
    // 新手队主角在第一位，6000 在第二位
    expect(outcome.request.playerTeam[1]!.stats.hp).toBe(baseline.health + 1);
  });
});

describe('探索与地图节点状态', () => {
  it('任务链 8 关全通才解锁 HARD / VERY HARD；档位 1~6', () => {
    const s = save();
    expect(exploreUnlocked(s, KINGDOM)).toBe(false);
    expect(setExploreTier(s, KINGDOM, 1)).toMatchObject({ ok: false, code: 'PREREQ_LOCKED' });
    s.kingdoms[KINGDOM] = { level: 1, questsDone: 8, exploreTier: 0, lastTributeAt: 0 };
    expect(exploreUnlocked(s, KINGDOM)).toBe(true);
    expect(setExploreTier(s, KINGDOM, 3)).toEqual({ ok: true, tier: 3 });
    expect(s.kingdoms[KINGDOM]?.exploreTier).toBe(3);
    expect(setExploreTier(s, KINGDOM, 6)).toEqual({ ok: true, tier: 6 });
    expect(setExploreTier(s, KINGDOM, 7)).toMatchObject({ ok: false, code: 'INVALID' });
  });

  it('节点状态：主角等级门槛、任务进度、进贡气泡、探索标记', () => {
    const s = save();
    // 10 级王国进贡概率 50%/小时，12 小时全 miss 概率仅 0.02%——「有气泡可收」才稳定成立
    s.kingdoms[KINGDOM] = { level: 10, questsDone: 0, exploreTier: 0, lastTributeAt: 0 };
    const first = kingdomNodeState(s, KINGDOM, 24 * 3_600_000);
    expect(first).toMatchObject({
      kingdom: KINGDOM,
      unlockLevel: 1,
      locked: false,
      questsDone: 0,
      nextNode: 1,
      exploreUnlocked: false,
      tributeHours: 12, // lastTributeAt 0 → 离线久远，封顶 12
    });
    expect(first.tributeHits).toBeGreaterThan(0);

    const later = kingdomNodeState(s, LATER, 0);
    expect(later.locked).toBe(true);
    expect(later.unlockLevel).toBeGreaterThan(1);
    expect(later.nextNode).toBeNull();
    expect(later.tributeHours).toBe(0);

    s.kingdoms[KINGDOM]!.questsDone = 8;
    expect(kingdomNodeState(s, KINGDOM, 0).nextNode).toBeNull();
    expect(kingdomNodeState(s, KINGDOM, 0).exploreUnlocked).toBe(true);
  });
});
