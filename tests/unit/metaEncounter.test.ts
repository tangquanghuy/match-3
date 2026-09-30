import { planTutorialEncounter } from '../../src/meta/systems/encounter';
import { describe, it, expect } from 'vitest';
import { getTroopById } from '../../src/data/troops';
import {
  newSave,
  nextQuestNode,
  planExploreEncounter,
  planQuestEncounter,
  QUESTS_PER_KINGDOM,
  QUEST_TEAM_SIZES,
  questEnemyLevel,
  questNodeUnlocked,
  exploreEnemyLevel,
} from '../../src/meta';
import type { MetaSave } from '../../src/meta';

const KINGDOM = '破碎尖塔';

function kingdomWith(done: number): MetaSave {
  const save = newSave({ now: 0, starterTroopIds: [6000, 6097, 6457] });
  save.kingdoms[KINGDOM] = { level: 1, questsDone: done, exploreTier: 0, lastTributeAt: 0 };
  return save;
}

describe('出敌生成器（同 seed 可复现）', () => {
  it('同 seed 两次计划完全一致；不同 seed 不同', () => {
    const a = planQuestEncounter(KINGDOM, 1, 42);
    const b = planQuestEncounter(KINGDOM, 1, 42);
    expect(b).toEqual(a);
    const c = planQuestEncounter(KINGDOM, 1, 43);
    expect(c.enemies).not.toEqual(a.enemies);
  });

  it('任务 1 关：4 名杂兵、同级、全部属于本王国且不重复', () => {
    const plan = planQuestEncounter(KINGDOM, 1, 7);
    expect(plan.source).toEqual({ kind: 'quest', node: 1 });
    expect(plan.enemies).toHaveLength(QUEST_TEAM_SIZES[0]);
    const ids = new Set<number>();
    for (const enemy of plan.enemies) {
      expect(enemy.tier).toBe('minion');
      expect(enemy.level).toBe(questEnemyLevel(KINGDOM, 1));
      expect(ids.has(enemy.troopId)).toBe(false);
      ids.add(enemy.troopId);
      const troop = getTroopById(enemy.troopId);
      expect(troop).toBeTruthy();
      expect(troop!.kingdom).toBe(KINGDOM);
    }
  });

  it('任务 8 关：精英群 + 首领压阵', () => {
    const plan = planQuestEncounter(KINGDOM, 8, 7);
    expect(plan.enemies).toHaveLength(4);
    expect(plan.enemies.map((e) => e.tier)).toEqual(['elite', 'elite', 'elite', 'boss']);
    expect(plan.enemies.every((e) => getTroopById(e.troopId))).toBe(true);
  });

  it('Hard 3 / Very Hard 2：精英带队与首领压阵；等级按档爬升', () => {
    const t3 = planExploreEncounter(KINGDOM, 3, 11);
    expect(t3.source).toEqual({ kind: 'explore', tier: 3 });
    expect(t3.enemies.map((e) => e.tier)).toEqual(['elite', 'minion', 'minion', 'minion']);
    const t5 = planExploreEncounter(KINGDOM, 5, 11);
    expect(t5.enemies).toHaveLength(4);
    expect(t5.enemies.at(-1)!.tier).toBe('boss');
    expect(t5.enemies[0]!.level).toBe(exploreEnemyLevel(KINGDOM, 5));
    expect(planExploreEncounter(KINGDOM, 6, 11).enemies).toHaveLength(4);
  });

  it('越界抛 RangeError', () => {
    expect(() => planQuestEncounter(KINGDOM, 0, 1)).toThrow(RangeError);
    expect(() => planQuestEncounter(KINGDOM, 9, 1)).toThrow(RangeError);
    expect(() => planExploreEncounter(KINGDOM, 7, 1)).toThrow(RangeError);
  });
});

describe('任务线性推进校验', () => {
  it('新档只能打第 1 关', () => {
    const save = newSave({ now: 0, starterTroopIds: [6000, 6097, 6457] });
    expect(questNodeUnlocked(save, KINGDOM, 1)).toBe(true);
    expect(questNodeUnlocked(save, KINGDOM, 2)).toBe(false);
    expect(questNodeUnlocked(save, KINGDOM, 0)).toBe(false);
    expect(questNodeUnlocked(save, KINGDOM, 9)).toBe(false);
    expect(nextQuestNode(save, KINGDOM)).toBe(1);
  });

  it('打过 3 关后解锁第 4 关；全通返回 null', () => {
    const save = kingdomWith(3);
    expect(questNodeUnlocked(save, KINGDOM, 3)).toBe(false);
    expect(questNodeUnlocked(save, KINGDOM, 4)).toBe(true);
    expect(nextQuestNode(save, KINGDOM)).toBe(4);
    expect(nextQuestNode(kingdomWith(QUESTS_PER_KINGDOM), KINGDOM)).toBeNull();
  });
});


describe('固定新手敌队', () => {
  it('不同 seed 保持堡垒大门、食人魔、火枪手、普通女祭司的队序', () => {
    for (const seed of [0, 1, 42, 999999]) {
      const plan = planTutorialEncounter(KINGDOM, seed);
      expect(plan.enemies.map(enemy => enemy.troopId)).toEqual([6097, 6000, 6004, 6028]);
      expect(plan.enemies.map(enemy => getTroopById(enemy.troopId)!.name))
        .toEqual(['堡垒大门', '食人魔', '火枪手', '女祭司']);
      expect(plan.enemies.every(enemy => enemy.level === 3 && enemy.traitCount === 0)).toBe(true);
    }
  });
});
