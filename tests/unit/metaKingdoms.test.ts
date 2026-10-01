import { describe, it, expect } from 'vitest';
import { TROOPS } from '../../src/data/troops';
import { COMMUNITY_KINGDOM } from '../../src/data/communityTroops';
import {
  allKingdoms,
  EXPLORE_TEAM_SIZES,
  exploreEnemyLevel,
  exploreNodeLabel,
  exploreTierForNode,
  KINGDOM_ORDER,
  kingdomBaseLevel,
  kingdomQuestRewardTroop,
  kingdomTroopPool,
  QUESTS_PER_KINGDOM,
  QUEST_TEAM_SIZES,
  questEnemyLevel,
} from '../../src/meta';

describe('王国元数据首版（kingdoms.ts）', () => {
  it('42 个常规王国全部入表，异界王国不进入推进序', () => {
    const dataKingdoms = new Set(TROOPS.map((t) => t.kingdom).filter((k): k is string => !!k && k !== COMMUNITY_KINGDOM));
    expect(allKingdoms().length).toBe(dataKingdoms.size);
    expect(new Set(allKingdoms())).toEqual(dataKingdoms);
  });

  it('推进序稳定：破碎尖塔第一（其 6000 是全数据最小兵种 id），基数等级单调不减且封顶 50', () => {
    expect(KINGDOM_ORDER[0]).toBe('破碎尖塔');
    expect(kingdomBaseLevel('破碎尖塔')).toBe(1);
    for (let i = 1; i < KINGDOM_ORDER.length; i++) {
      expect(kingdomBaseLevel(KINGDOM_ORDER[i])).toBeGreaterThanOrEqual(
        kingdomBaseLevel(KINGDOM_ORDER[i - 1]),
      );
    }
    expect(kingdomBaseLevel(KINGDOM_ORDER[KINGDOM_ORDER.length - 1])).toBeLessThanOrEqual(50);
  });

  it('任务/探索敌人等级表（设计值）', () => {
    expect(questEnemyLevel('破碎尖塔', 1)).toBe(1);
    expect(questEnemyLevel('破碎尖塔', 8)).toBe(8);
    expect(exploreEnemyLevel('破碎尖塔', 1)).toBe(11);
    expect(exploreEnemyLevel('破碎尖塔', 5)).toBe(40);
    expect(exploreEnemyLevel('破碎尖塔', 6)).toBe(50);
  });

  it('出战一律 4 人队；Hard 1~3 / Very Hard 1~3 映射到探索档 1~6', () => {
    expect([...QUEST_TEAM_SIZES]).toEqual([4, 4, 4, 4, 4, 4, 4, 4]);
    expect([...EXPLORE_TEAM_SIZES]).toEqual(Array(12).fill(4));
    expect(exploreTierForNode('hard', 1)).toBe(1);
    expect(exploreTierForNode('hard', 3)).toBe(3);
    expect(exploreTierForNode('veryHard', 1)).toBe(4);
    expect(exploreTierForNode('veryHard', 3)).toBe(6);
    expect(exploreNodeLabel(2)).toBe('探索 · 难度 2');
    expect(exploreNodeLabel(5)).toBe('探索 · 难度 5');
  });

  it('任务 4/8 关奖励取该王国普通卡（按 id 序第 1/2 张）', () => {
    const reward4 = kingdomQuestRewardTroop('破碎尖塔', 4);
    const troop4 = TROOPS.find((t) => t.id === reward4);
    expect(troop4).toMatchObject({ kingdom: '破碎尖塔', rarityIdx: 0 });
    const reward8 = kingdomQuestRewardTroop('破碎尖塔', 8);
    expect(reward8).not.toBeNull();
    const troop8 = TROOPS.find((t) => t.id === reward8);
    expect(troop8).toMatchObject({ kingdom: '破碎尖塔', rarityIdx: 0 });
  });

  it('每个王国都能给出任务奖励与兵种池（稀有度带过滤生效）', () => {
    for (const kingdom of allKingdoms()) {
      expect(kingdomQuestRewardTroop(kingdom, 4)).not.toBeNull();
      expect(kingdomTroopPool(kingdom).length).toBeGreaterThan(0);
      for (const troop of kingdomTroopPool(kingdom, { min: 4, max: 5 })) {
        expect(troop.rarityIdx).toBeGreaterThanOrEqual(4);
      }
    }
    expect(QUESTS_PER_KINGDOM).toBe(8);
  });
});
