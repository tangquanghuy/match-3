/**
 * 战斗桥接（M2）——存档 + 出敌计划 → 会话契约的 BattleRequest。
 *
 * 依赖方向：meta → session/engine 单向；session 契约零改动（计划 §3.1）。
 * 三个职责：
 *  1. 快照组装：玩家部队只带**已解锁**的特质（养成进度真实影响战斗）；
 *     敌人带全部特质与 tier 标（AI 满配，对齐 GoW 敌方行为）。
 *  2. 注册表兜底：技能库只覆盖已核对的 647+ 条法术，未收录法术注册
 *     `fallbackPrototype()`（仅扣法力，需求 11.4）——1798 张全量内容都可出战。
 *  3. 会话校验：产出的 request 用 `session/validateRequest` 全量过一遍，
 *     校验口径与真实嵌入模式一致（knownSkillIds = 注册表键集）。
 */
import { getTroopById, knownTroopTypes, type TroopData } from '../../data/troops';
import { troopStatsAtLevel } from '../../data/leveling';
import { BaseColor } from '../../engine/types';
import type { TroopRecord } from '../state/schema';
import type { MetaSave } from '../state/schema';
import { BATTLE_SCHEMA_VERSION, RULESET_VERSION } from '../../session/contract';
import type { BattleRequest, CombatantSnapshot } from '../../session/contract';
import { validateBattleRequest } from '../../session/validateRequest';
import { ExtensionRegistry } from '../../engine/registry';
import { fallbackPrototype } from '../../engine/skills/prototypes';
import { registerSkillLibrary } from '../../engine/skills/library';
import { fail, type MetaFailure } from '../types';
import { activeTeam } from './teamRules';
import { getRecord } from './troopProgress';
import { kingdomBonusOf } from './kingdomOps';
import type { KingdomStatBonus } from './kingdomOps';
import { activeTalentCodes, equippedWeaponOf, heroStatsOf } from './hero';
import { WEAPONS } from '../data/weapons';
import { KNOWN_TRAIT_CODES } from '../data/traitIndex';
import type { EncounterEnemy, EncounterPlan } from './encounter';

/**
 * 已实现特质白名单（见 data/traitIndex.ts；与 App 的校验口径同源）。
 * troops.json 引用 785 种 code、引擎实现其中 361 种：快照组装时把未实现 code
 * 过滤掉（引擎本就安全忽略），既保住严格校验的意义，也不放行「假特质」。
 */

/** 按槽位开关过滤到客户端已实现的特质 code */
function knownTraits(troop: TroopData, enabled: (index: number) => boolean): string[] {
  return troop.traits.filter((t, i) => enabled(i) && KNOWN_TRAIT_CODES.has(t.code)).map((t) => t.code);
}

/** 玩家部队 → 战斗快照（养成等级决定四维；特质只带已解锁槽；statBonus = 王国 10 级加成） */
export function troopToSnapshot(
  troop: TroopData,
  rec: TroopRecord,
  externalId: string,
  statBonus?: KingdomStatBonus,
): CombatantSnapshot {
  const stats = troopStatsAtLevel(troop, rec.level);
  if (statBonus) {
    stats.health += statBonus.health;
    stats.armor += statBonus.armor;
    stats.attack += statBonus.attack;
    stats.magic += statBonus.magic;
  }
  return {
    externalId,
    templateId: String(troop.id),
    name: troop.name,
    levelLabel: `Lv.${rec.level}`,
    stats: { hp: stats.health, attack: stats.attack, armor: stats.armor, magic: stats.magic },
    troopTypes: [...troop.troopTypes],
    manaColors: [...troop.manaColors],
    manaCost: troop.manaCost,
    traitIds: knownTraits(troop, (i) => rec.traits[i]),
    skillId: String(troop.spell.id),
  };
}

function enemyToSnapshot(troop: TroopData, enemy: EncounterEnemy, index: number): CombatantSnapshot {
  const stats = troopStatsAtLevel(troop, enemy.level);
  return {
    externalId: `e${index}-${troop.id}`,
    templateId: String(troop.id),
    name: troop.name,
    levelLabel: `Lv.${enemy.level}`,
    tier: enemy.tier,
    stats: { hp: stats.health, attack: stats.attack, armor: stats.armor, magic: stats.magic },
    troopTypes: [...troop.troopTypes],
    manaColors: [...troop.manaColors],
    manaCost: troop.manaCost,
    // 敌人满配特质（AI 无养成概念），同样只带已实现 code
    traitIds: knownTraits(troop, () => true),
    skillId: String(troop.spell.id),
  };
}

/**
 * meta 桥接专用注册表：全量技能库 + 主角武器原型 + 未收录法术的兜底原型。
 * 武器原型是 meta 层自有的真实技能（data/weapons.ts，builders DSL），
 * 注册在兜底循环之前，永远不会被 fallbackPrototype 覆盖。
 * headless 驱动与未来战斗层挂载共用同一份（App.init 的注入模式）。
 */
export function buildMetaRegistry(extraSkillIds: Iterable<string>): ExtensionRegistry {
  const registry = new ExtensionRegistry();
  registerSkillLibrary(registry.prototypes);
  for (const weapon of WEAPONS) {
    registry.prototypes.set(weapon.id, weapon.skill);
  }
  for (const id of extraSkillIds) {
    if (!registry.prototypes.has(id)) registry.prototypes.set(id, fallbackPrototype());
  }
  return registry;
}

export interface BridgeOutcome {
  ok: true;
  request: BattleRequest;
  plan: EncounterPlan;
  /** externalId → 出敌条目（结算按它对账击杀奖励） */
  enemyByExternalId: Map<string, EncounterEnemy>;
  /** 本场可用注册表（含兜底原型），驱动 TurnEngine 或注入战斗层 */
  registry: ExtensionRegistry;
}

/** 组一场战斗请求。队伍非法 / 主角占位 / 敌我内容异常都返回显式失败。 */
export function buildBattleRequest(save: MetaSave, plan: EncounterPlan): BridgeOutcome | MetaFailure {
  if (plan.enemies.length === 0) return fail('INVALID', '出敌计划为空');

  const team = activeTeam(save);
  if (!team) return fail('NO_TEAM', '没有可用队伍：先在编队页保存一支 3~4 人队');

  const playerTeam: CombatantSnapshot[] = [];
  const statBonus = kingdomBonusOf(save);
  const weapon = equippedWeaponOf(save);
  const talentCodes = activeTalentCodes(save);
  const heroBase = heroStatsOf(save);
  for (const [position, member] of team.members.entries()) {
    if (member.kind === 'hero') {
      // 主角快照（M5）：武器=唯一施法手段，无武器时 skillId 'none'（注册表兜底，仅扣法力）；
      // 王国 10 级加成对主角同样生效（全体部队口径）
      playerTeam.push({
        externalId: `p${position}-hero`,
        name: '法露特',
        levelLabel: `Lv.${save.hero.level}`,
        stats: {
          hp: heroBase.health + statBonus.health,
          attack: heroBase.attack + statBonus.attack,
          armor: heroBase.armor + statBonus.armor,
          magic: heroBase.magic + statBonus.magic,
        },
        troopTypes: ['Human'],
        manaColors: weapon?.manaColors.length ? [...weapon.manaColors] : [BaseColor.Brown],
        // 会话校验要求耗蓝 1~100：无武器按「1 蓝耗的空施法」处理（skillId 'none' 走兜底原型）
        manaCost: weapon?.manaCost ?? 1,
        traitIds: talentCodes,
        skillId: weapon?.id ?? 'none',
      });
      continue;
    }
    if (member.kind !== 'troop') continue;
    const troop = getTroopById(member.troopId);
    const rec = getRecord(save, member.troopId);
    if (!troop || !rec) {
      return fail('NOT_OWNED', `队伍第 ${position + 1} 号位的部队不在收藏中`);
    }
    playerTeam.push(troopToSnapshot(troop, rec, `p${position}-${troop.id}`, statBonus));
  }

  const enemyByExternalId = new Map<string, EncounterEnemy>();
  const enemyTeam: CombatantSnapshot[] = [];
  for (const [index, enemy] of plan.enemies.entries()) {
    const troop = getTroopById(enemy.troopId);
    if (!troop) return fail('UNKNOWN_TROOP', `出敌计划引用了不存在的部队 id ${enemy.troopId}`);
    const snapshot = enemyToSnapshot(troop, enemy, index);
    enemyByExternalId.set(snapshot.externalId, enemy);
    enemyTeam.push(snapshot);
  }

  const sourceTag = plan.source.kind === 'quest' ? `q${plan.source.node}` : `x${plan.source.tier}`;
  const request: BattleRequest = {
    schemaVersion: BATTLE_SCHEMA_VERSION,
    battleId: `meta-${plan.seed}`,
    requestId: `meta-${plan.seed}-${sourceTag}`,
    rulesetVersion: RULESET_VERSION,
    seed: plan.seed,
    playerTeam,
    enemyTeam,
  };

  const registry = buildMetaRegistry(
    [...playerTeam, ...enemyTeam].map((s) => s.skillId as string),
  );
  const check = validateBattleRequest(request, {
    knownSkillIds: new Set([...registry.skills.keys(), ...registry.prototypes.keys()]),
    knownTraitIds: KNOWN_TRAIT_CODES,
    knownTroopTypes: knownTroopTypes(),
  });
  if (!check.ok) {
    const first = check.issues[0];
    return fail('INVALID', `战斗请求未过会话校验：${first ? `${first.code} ${first.message}` : '未知问题'}`);
  }

  return { ok: true, request, plan, enemyByExternalId, registry };
}
