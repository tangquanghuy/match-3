import { describe, it, expect } from 'vitest';
import { registerSkillLibrary } from '@engine/skills/library';
import { ExtensionRegistry } from '@engine/registry';
import { MAX_ACTIVE_TEAM_SIZE } from '@engine/teamRoster';
import { implementedTraitIds } from '@engine/traits';
import { knownTroopTypes } from '../../src/data/troops';
import {
  BATTLE_SCHEMA_VERSION,
  RULESET_VERSION,
  loadStandaloneRequest,
  mapRequestToTeams,
  resizeRequestTeams,
  validateBattleRequest,
} from '@session/index';

/** 与 App 相同的口径：注册表里已有的技能才算已注册。 */
function knownSkillIds(): Set<string> {
  const registry = new ExtensionRegistry();
  registerSkillLibrary(registry.prototypes);
  return new Set([...registry.skills.keys(), ...registry.prototypes.keys()]);
}

/** 与 main.ts 相同口径：已实现的特质才算已注册 */
function knownTraitIds(): Set<string> {
  return new Set(implementedTraitIds());
}

const validateOpts = () => ({
  knownSkillIds: knownSkillIds(),
  knownTraitIds: knownTraitIds(),
  knownTroopTypes: knownTroopTypes(),
});

describe('独立模式战斗配置（需求 2.5）', () => {
  it('随包配置能通过宿主 request 的同一套校验', () => {
    const request = loadStandaloneRequest(validateOpts());
    expect(request.schemaVersion).toBe(BATTLE_SCHEMA_VERSION);
    expect(request.rulesetVersion).toBe(RULESET_VERSION);
    expect(request.playerTeam).toHaveLength(MAX_ACTIVE_TEAM_SIZE);
    expect(request.enemyTeam).toHaveLength(MAX_ACTIVE_TEAM_SIZE);
  });

  it('配置里每个技能都真的注册过，不会带着空效果技能进场', () => {
    const known = knownSkillIds();
    const request = loadStandaloneRequest({ knownSkillIds: known, knownTraitIds: knownTraitIds(), knownTroopTypes: knownTroopTypes() });
    for (const c of [...request.playerTeam, ...request.enemyTeam]) {
      // fixture 全部显式给出 skillId（config 不用分拣），非空断言满足类型收窄
      expect(known.has(c.skillId!)).toBe(true);
    }
  });

  it('技能未注册时加载失败并指出字段', () => {
    expect(() => loadStandaloneRequest({ knownSkillIds: new Set(), knownTraitIds: knownTraitIds(), knownTroopTypes: knownTroopTypes() }))
      .toThrow(/playerTeam\[0\]\.skillId/);
  });

  it('每名角色都带显式立绘，externalId 全场唯一', () => {
    const request = loadStandaloneRequest(validateOpts());
    const all = [...request.playerTeam, ...request.enemyTeam];
    for (const c of all) {
      expect(c.portraitUrl).toMatch(/^https:\/\//);
    }
    expect(new Set(all.map((c) => c.externalId)).size).toBe(all.length);
  });

  it('裁剪到 3v3 后仍是合法 request', () => {
    const known = knownSkillIds();
    const full = loadStandaloneRequest({ knownSkillIds: known, knownTraitIds: knownTraitIds(), knownTroopTypes: knownTroopTypes() });
    const three = resizeRequestTeams(full, 3);

    expect(three.playerTeam).toHaveLength(3);
    expect(three.enemyTeam).toHaveLength(3);
    expect(validateBattleRequest(three, { knownSkillIds: known, knownTraitIds: knownTraitIds(), knownTroopTypes: knownTroopTypes() }).ok).toBe(true);
    // 原对象不被修改
    expect(full.playerTeam).toHaveLength(MAX_ACTIVE_TEAM_SIZE);
  });

  it('只裁不补：请求人数超过配置时按实际人数走', () => {
    const full = loadStandaloneRequest(validateOpts());
    const bigger = resizeRequestTeams(full, 9);
    expect(bigger.playerTeam).toHaveLength(MAX_ACTIVE_TEAM_SIZE);
    expect(bigger).toBe(full); // 无需裁剪时原样返回
  });

  it('裁剪后的配置能映射成引擎队伍，内部 id 连续', () => {
    const three = resizeRequestTeams(loadStandaloneRequest(validateOpts()), 3);
    const { playerTeam, enemyTeam, idMap } = mapRequestToTeams(three);

    expect(playerTeam.characters.map((c) => c.id)).toEqual([0, 1, 2]);
    expect(enemyTeam.characters.map((c) => c.id)).toEqual([4, 5, 6]);
    // 角色数值来自配置而不是写死的占位值
    expect(playerTeam.characters[0].name).toBe(three.playerTeam[0].name);
    expect(playerTeam.characters[0].skillId).toBe(three.playerTeam[0].skillId);
    expect(idMap.externalIdOf(0)).toBe(three.playerTeam[0].externalId);
  });
});
