import { KINGDOM_ORDER } from '../../src/meta/data/kingdoms';
import { KNOWN_TRAIT_CODES } from '../../src/meta/data/traitIndex';
import { describe, it, expect } from 'vitest';
import { troopStatsAtLevel } from '../../src/data/leveling';
import { stoneColorKeyOf } from '../../src/meta/data/materials';
import { BaseColor } from '../../src/engine/types';
import { getTroopById, knownTroopTypes } from '../../src/data/troops';
import { validateBattleRequest } from '../../src/session/validateRequest';
import { TRAIT_LIBRARY } from '../../src/engine/traits';
import {
  buildBattleRequest,
  buildMetaRegistry,
  getRecord,
  newSave,
  planExploreEncounter,
  planQuestEncounter,
  setTeamPreset,
  troopToSnapshot,
  unlockTrait,
} from '../../src/meta';

const KINGDOM = '破碎尖塔';
const OGRE = 6000; // 食人魔（普通，特质 frenzy/big/ogrefury）

const save = () => newSave({ now: 0, starterTroopIds: [6000, 6097, 6457] });

describe('troopToSnapshot（养成进度进战斗）', () => {
  it('只带已解锁的特质槽', () => {
    const s = save();
    const troop = getTroopById(OGRE)!;
    const rec = getRecord(s, OGRE)!;
    expect(troopToSnapshot(troop, rec, 'x').traitIds).toEqual([]);
    const colorKey = stoneColorKeyOf(troop.manaColors[0] ?? BaseColor.Brown);
    s.materials.traitstones = { [`minor:${colorKey}`]: 10, [`major:${colorKey}`]: 4 };
    unlockTrait(s, OGRE, 1);
    expect(troopToSnapshot(troop, rec, 'x').traitIds).toEqual(['frenzy']);
  });

  it('四维取当前等级曲线；等级标签可读', () => {
    const s = save();
    const troop = getTroopById(OGRE)!;
    const rec = getRecord(s, OGRE)!;
    const snap = troopToSnapshot(troop, rec, 'x');
    const stats = troopStatsAtLevel(troop, rec.level);
    expect(snap.stats).toEqual({ hp: stats.health, attack: stats.attack, armor: stats.armor, magic: stats.magic });
    expect(snap.levelLabel).toBe('Lv.1');
    expect(snap.skillId).toBe(String(troop.spell.id));
  });
});

describe('buildMetaRegistry（未收录法术兜底）', () => {
  it('技能库条目正常注册；未知 id 注册为仅扣法力的空原型', () => {
    const registry = buildMetaRegistry(['7004', '999999']);
    expect(registry.prototypes.get('7004')!.segments.length).toBeGreaterThan(0);
    expect(registry.prototypes.get('999999')!.segments).toEqual([]);
  });
});

describe('buildBattleRequest（存档 → BattleRequest）', () => {
  it('starter 队打任务 1 关：请求过会话校验，字段齐全', () => {
    const s = save();
    const plan = planQuestEncounter(KINGDOM, 1, 7);
    const outcome = buildBattleRequest(s, plan);
    if (!outcome.ok) throw new Error(outcome.message);

    expect(outcome.request.seed).toBe(7);
    expect(outcome.request.battleId).toBe('meta-7');
    expect(outcome.request.requestId).toBe('meta-7-q1');
    expect(outcome.request.playerTeam).toHaveLength(4);
    expect(outcome.request.enemyTeam).toHaveLength(plan.enemies.length);

    // externalId 唯一；敌人都带 tier；结算对账表键值一致
    const ids = [
      ...outcome.request.playerTeam.map((c) => c.externalId),
      ...outcome.request.enemyTeam.map((c) => c.externalId),
    ];
    expect(new Set(ids).size).toBe(ids.length);
    for (const [i, snapshot] of outcome.request.enemyTeam.entries()) {
      expect(snapshot.tier).toBe(plan.enemies[i]!.tier);
      expect(outcome.enemyByExternalId.get(snapshot.externalId)).toEqual(plan.enemies[i]);
    }
    // 初级敌人没有自动全开特质
    const enemyWithTraits = outcome.request.enemyTeam.find((c) => (c.traitIds?.length ?? 0) > 0);
    expect(enemyWithTraits).toBeUndefined();

    // 与真实嵌入模式同口径的会话校验（三个白名单与桥接内部一致）
    const check = validateBattleRequest(outcome.request, {
      knownSkillIds: new Set([
        ...outcome.registry.skills.keys(),
        ...outcome.registry.prototypes.keys(),
      ]),
      knownTraitIds: new Set(TRAIT_LIBRARY.map((t) => t.code)),
      knownTroopTypes: knownTroopTypes(),
    });
    expect(check.ok).toBe(true);
  });

  it.each([
    [0, 8, 0], [9, 7, 0], [9, 8, 0],
    [10, 6, 0], [10, 7, 1], [10, 8, 2],
    [KINGDOM_ORDER.length - 1, 1, 0],
    [KINGDOM_ORDER.length - 1, 7, 1],
    [KINGDOM_ORDER.length - 1, 8, 2],
  ])('王国序号 %s 第 %s 关：战斗与卡面均只启用 %s 个特质槽', (index, node, count) => {
    const plan = planQuestEncounter(KINGDOM_ORDER[index]!, node, 42);
    const outcome = buildBattleRequest(save(), plan);
    if (!outcome.ok) throw new Error(outcome.message);
    for (const [i, snapshot] of outcome.request.enemyTeam.entries()) {
      const enemy = plan.enemies[i]!;
      const enabled = getTroopById(enemy.troopId)!.traits.slice(0, count).map(t => t.code);
      expect(snapshot.displayTraitIds).toEqual(enabled);
      expect(snapshot.traitIds).toEqual(enabled.filter(code => KNOWN_TRAIT_CODES.has(code)));
      expect(outcome.enemyByExternalId.get(snapshot.externalId)!.traitCount).toBe(count);
    }
  });

  it('探索计划也可桥接（requestId 带 x 档位）', () => {
    const outcome = buildBattleRequest(save(), planExploreEncounter(KINGDOM, 3, 9));
    if (!outcome.ok) throw new Error(outcome.message);
    expect(outcome.request.requestId).toBe('meta-9-x3');
    expect(outcome.request.enemyTeam).toHaveLength(4);
  });

  it('编队含主角 → 主角快照正常组装（M5 转正，旧 HERO_UNAVAILABLE 占位移除）', () => {
    const s = save();
    const r = setTeamPreset(s, 0, {
      name: '混编',
      members: [{ kind: 'hero' }, { kind: 'troop', troopId: 6000 }, { kind: 'troop', troopId: 6097 }, { kind: 'troop', troopId: 6457 }],
      bannerKingdomId: null,
    });
    expect(r.ok).toBe(true);
    const outcome = buildBattleRequest(s, planQuestEncounter(KINGDOM, 1, 7));
    if (!outcome.ok) throw new Error(outcome.message);
    expect(outcome.request.playerTeam).toHaveLength(4);
    const hero = outcome.request.playerTeam.find((c) => c.externalId.endsWith('-hero'))!;
    expect(hero.name).toBe('主角');
    // 新档默认装备官方开局武器「骑士之剑」（自造 w_* 假数据已整表退役）
    expect(hero.skillId).toBe('gw_KnightsSword');
  });

  it('寒冰阔剑等目录武器的 gw_* 键在战斗注册表里可执行，不是空兜底', () => {
    const registry = buildMetaRegistry(['gw_IcyGlaive', 'gw_KnightsSword']);
    expect(registry.prototypes.get('gw_IcyGlaive')!.segments.length).toBeGreaterThan(0);
    expect(registry.prototypes.get('gw_KnightsSword')!.segments.length).toBeGreaterThan(0);
  });

  it('没有预设队 → NO_TEAM', () => {
    const outcome = buildBattleRequest(newSave({ now: 0 }), planQuestEncounter(KINGDOM, 1, 7));
    expect(outcome).toMatchObject({ ok: false, code: 'NO_TEAM' });
  });
});
