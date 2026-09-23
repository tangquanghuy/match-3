/**
 * M10 王国主线页的读模型锁（`TASK-META §9.5` 验收 1~4、6 的可测部分）。
 * 屏层只是这些纯函数的消费方，所以断言打在函数上。
 */
import { describe, it, expect } from 'vitest';
import {
  EXPLORE_TEAM_SIZES,
  exploreEnemyLevel,
  exploreLineupPreview,
  kingdomNodeState,
  kingdomQuestRewardTroop,
  newSave,
  questEnemyLevel,
  questLineupPreview,
  questNodeUnlocked,
  questPreviewSeed,
  QUESTS_PER_KINGDOM,
  QUEST_TEAM_SIZES,
  setExploreTier,
} from '../../src/meta';
import { getTroopById } from '../../src/data/troops';

const KINGDOM = '破碎尖塔';
const save = () => newSave({ now: 0, starterTroopIds: [6000, 6097, 6457] });

describe('M10 王国主线页 · 读模型', () => {
  it('验收 1：8 关状态与 questsDone 严格一致，只能打下一关', () => {
    const s = save();
    s.hero.level = 20;
    s.kingdoms[KINGDOM] = { level: 1, questsDone: 3, exploreTier: 0, lastTributeAt: 0 };
    const state = kingdomNodeState(s, KINGDOM, 0);
    expect(state.questsDone).toBe(3);
    expect(state.nextNode).toBe(4);
    for (let node = 1; node <= QUESTS_PER_KINGDOM; node++) {
      expect(questNodeUnlocked(s, KINGDOM, node)).toBe(node === 4);
    }
    // 全通后没有下一关，探索开放
    s.kingdoms[KINGDOM]!.questsDone = QUESTS_PER_KINGDOM;
    const full = kingdomNodeState(s, KINGDOM, 0);
    expect(full.nextNode).toBeNull();
    expect(full.exploreUnlocked).toBe(true);
  });

  it('验收 2：阵容预览同参可复现，且与实战 seed 无关（种子 = fnv1a32("quest-王国-关号")）', () => {
    const a = questLineupPreview(KINGDOM, 5);
    const b = questLineupPreview(KINGDOM, 5);
    expect(b).toEqual(a);
    // 队伍规模与等级由关号决定
    expect(a).toHaveLength(QUEST_TEAM_SIZES[4]!);
    expect(a.every((e) => e.level === questEnemyLevel(KINGDOM, 5))).toBe(true);
    // 不同关 / 不同王国 → 不同种子
    expect(questPreviewSeed(KINGDOM, 5)).toBe(questPreviewSeed(KINGDOM, 5));
    expect(questPreviewSeed(KINGDOM, 5)).not.toBe(questPreviewSeed(KINGDOM, 6));
    expect(questPreviewSeed(KINGDOM, 5)).not.toBe(questPreviewSeed('阿达纳', 5));
    // 第 7/8 关按分层规则压首领
    expect(questLineupPreview(KINGDOM, 8).some((e) => e.tier === 'boss')).toBe(true);
    // 越界抛错（屏层据此落到"阵容待定"而不是崩）
    expect(() => questLineupPreview(KINGDOM, 9)).toThrow(RangeError);
  });

  it('验收 3：第 4 / 8 关的部队奖励可解析出真实部队名', () => {
    for (const node of [4, 8] as const) {
      const id = kingdomQuestRewardTroop(KINGDOM, node);
      expect(id).not.toBeNull();
      expect(getTroopById(id!)?.name).toBeTruthy();
    }
  });

  it('验收 4：Hard / Very Hard 档位 1~6 即时持久化，敌人等级随档爬升', () => {
    const s = save();
    s.hero.level = 20;
    s.kingdoms[KINGDOM] = { level: 1, questsDone: QUESTS_PER_KINGDOM, exploreTier: 0, lastTributeAt: 0 };
    const ok = setExploreTier(s, KINGDOM, 4);
    expect(ok).toEqual({ ok: true, tier: 4 });
    expect(s.kingdoms[KINGDOM]!.exploreTier).toBe(4);
    expect(exploreEnemyLevel(KINGDOM, 6)).toBeGreaterThan(exploreEnemyLevel(KINGDOM, 1));
    expect(EXPLORE_TEAM_SIZES.every((size) => size === 4)).toBe(true);
    expect(exploreLineupPreview(KINGDOM, 4)).toHaveLength(4);
    expect(setExploreTier(s, KINGDOM, 7)).toMatchObject({ ok: false, code: 'INVALID' });
    s.kingdoms[KINGDOM]!.questsDone = 0;
    expect(setExploreTier(s, KINGDOM, 2)).toMatchObject({ ok: false, code: 'PREREQ_LOCKED' });
  });

  it('验收 6：未解锁王国的节点状态是锁态且不抛（直链访问要能显示锁态页）', () => {
    const s = save(); // 主角 Lv.1
    const locked = kingdomNodeState(s, '荆棘森林', 0);
    expect(locked.locked).toBe(true);
    expect(locked.nextNode).toBeNull();
    expect(locked.exploreUnlocked).toBe(false);
    expect(locked.unlockLevel).toBeGreaterThan(1);
    // 锁态下进贡不产出（地图角标也据此不显示）
    expect(locked.tributeReady).toBe(false);
  });
});
