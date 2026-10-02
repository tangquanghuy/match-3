/**
 * 战斗桥接（M2）——存档 + 出敌计划 → 会话契约的 BattleRequest。
 *
 * 依赖方向：meta → session/engine 单向；session 契约零改动（计划 §3.1）。
 * 三个职责：
 *  1. 快照组装：玩家部队只带**已解锁**的特质（养成进度真实影响战斗）；
 *     敌人按遭遇计划的训练进度带特质与 tier 标。
 *  2. 注册表兜底：技能库只覆盖已核对的 647+ 条法术，未收录法术注册
 *     `fallbackPrototype()`（仅扣法力，需求 11.4）——1798 张全量内容都可出战。
 *  3. 会话校验：产出的 request 用 `session/validateRequest` 全量过一遍，
 *     校验口径与真实嵌入模式一致（knownSkillIds = 注册表键集）。
 */
import { characterName, characterPortrait } from '../state/character';
import { getTroopById, knownTroopTypes, type TroopData } from '../../data/troops';
import { enemyEncounterStats, enemyTraitCount, enemyLevel } from '../data/enemyDifficulty';
import { troopStatsAtLevel } from '../../data/leveling';
import { BaseColor } from '../../engine/types';
import type { TeamPreset, TroopRecord } from '../state/schema';
import type { MetaSave } from '../state/schema';
import { BATTLE_SCHEMA_VERSION, RULESET_VERSION } from '../../session/contract';
import type { BattleRequest, CombatantSnapshot } from '../../session/contract';
import { validateBattleRequest } from '../../session/validateRequest';
import { ExtensionRegistry } from '../../engine/registry';
import { fallbackPrototype } from '../../engine/skills/prototypes';
import { registerSkillLibrary } from '../../engine/skills/library';
import { CATALOG_WEAPONS } from '../data/weaponCatalog';
import { fail, type MetaFailure } from '../types';
import { activeTeam, immortalTeamIssue, validateTeam } from './teamRules';
import { equippedBannerOf } from './banners';
import { combatManaMastery, toEngineMastery } from './manaMastery';
import { getRecord, rarityTierOf } from './troopProgress';
import { teamPower } from './combatPower';
import { kingdomBonusOf } from './kingdomOps';
import type { KingdomStatBonus } from './kingdomOps';
import { equippedClassOf, equippedWeaponOf, heroStatsOf } from './hero';
import { allyStatBonus, heroStatBonus, heroTraitCodes, selectedTalents } from './talents';
import { dynamicTraitCodes } from '../../engine/traits';
import { CLASSES } from '../data/classes';

/** 职业天赋/专属特质的中文显示名（code → nameZh；详情面板对库外 code 的兜底） */
const TRAIT_DISPLAY_NAMES: Readonly<Record<string, string>> = Object.fromEntries(
  CLASSES.flatMap((c) => [
    ...c.trees.flatMap((t) => t.talents.map((x) => [x.code, x.nameZh ?? x.name] as const)),
    ...c.perks.map((x) => [x.code, x.nameZh ?? x.name] as const),
  ]),
);

/** 主角卡面特质 = 已解锁的职业专属特质（3 槽顺序；天赋不上卡面——用户裁定 2026-09-19） */
function heroDisplayTraitIds(save: MetaSave): string[] {
  const cls = equippedClassOf(save);
  if (!cls) return [];
  const state = save.hero.classTraits[cls.id];
  if (!state) return [];
  return cls.perks
    .map((perk, i) => (state[i] ? perk.code : null))
    .filter((code): code is string => !!code);
}
import { KNOWN_TRAIT_CODES } from '../data/traitIndex';
import { temperingLevelOf } from './forgeOps';
import type { EncounterEnemy, EncounterPlan } from './encounter';

/**
 * 会话校验用的特质白名单：兵种已实现 code + 动态天赋/职业特质 + 静态效果天赋 code。
 * 静态天赋（如督军 ferocity）行为在快照期由 heroStatBonus 算进四维，引擎会安全忽略，
 * 但校验必须放行，否则入侵/竞技场会把带天赋的主角队拦下。
 */
export function metaKnownTraitIds(): Set<string> {
  return new Set([
    ...KNOWN_TRAIT_CODES,
    ...dynamicTraitCodes(),
    ...CLASSES.flatMap((c) => [
      ...c.trees.flatMap((t) => t.talents.map((x) => x.code)),
      ...c.perks.map((p) => p.code),
    ]),
  ]);
}

/** 按槽位开关过滤到客户端已实现的特质 code（未实现 code 不进快照，避免假特质过校验） */
function knownTraits(troop: TroopData, enabled: (index: number) => boolean): string[] {
  return troop.traits.filter((t, i) => enabled(i) && KNOWN_TRAIT_CODES.has(t.code)).map((t) => t.code);
}

/** 卡面展示槽：已解锁的特质都画出来（引擎未实现的也出图标）。 */
function displayTraits(troop: TroopData, enabled: (index: number) => boolean): string[] {
  return troop.traits.filter((_, i) => enabled(i)).map((t) => t.code);
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
    rarityIdx: rarityTierOf(troop, rec),
    portraitUrl: troop.artUrl ?? `/static/portraits/${troop.portrait}.webp`,
    stats: { hp: stats.health, attack: stats.attack, armor: stats.armor, magic: stats.magic },
    troopTypes: [...troop.troopTypes],
    kingdom: troop.kingdom ?? undefined,
    ...(troop.kingdomId != null ? { kingdomId: troop.kingdomId } : {}),
    manaColors: [...troop.manaColors],
    manaCost: troop.manaCost,
    traitIds: knownTraits(troop, (i) => rec.traits[i]),
    skillId: String(troop.spell.id),
    spellName: troop.spell.name,
    spellDescription: troop.spell.description,
    traitNames: Object.fromEntries(troop.traits.map((t) => [t.code, t.name])),
    displayTraitIds: displayTraits(troop, (i) => rec.traits[i]),
  };
}

/** Enemy snapshots share exactly the same enabled slots for runtime and card display. */
export function enemyToSnapshot(troop: TroopData, enemy: EncounterEnemy, index: number): CombatantSnapshot {
  const stats = enemyEncounterStats(troop, enemy.level, enemy.statMultiplier);
  const count = Number.isFinite(enemy.traitCount) ? Math.min(3, Math.max(0, Math.floor(enemy.traitCount!))) : enemyTraitCount(enemy.level);
  return {
    externalId: `e${index}-${troop.id}`,
    templateId: String(troop.id),
    name: troop.name,
    levelLabel: `Lv.${enemyLevel(enemy.level)}`,
    rarityIdx: troop.rarityIdx,
    portraitUrl: troop.artUrl ?? `/static/portraits/${troop.portrait}.webp`,
    tier: enemy.tier,
    stats: { hp: stats.health, attack: stats.attack, armor: stats.armor, magic: stats.magic },
    troopTypes: [...troop.troopTypes],
    kingdom: troop.kingdom ?? undefined,
    ...(troop.kingdomId != null ? { kingdomId: troop.kingdomId } : {}),
    manaColors: [...troop.manaColors],
    manaCost: troop.manaCost,
    // Engine and display follow the same explicit NPC training policy.
    traitIds: knownTraits(troop, i => i < count),
    skillId: String(troop.spell.id),
    spellName: troop.spell.name,
    spellDescription: troop.spell.description,
    traitNames: Object.fromEntries(troop.traits.map((t) => [t.code, t.name])),
    displayTraitIds: displayTraits(troop, i => i < count),
  };
}

export function encounterPower(enemies: readonly EncounterEnemy[]): number {
  return teamPower(enemies.flatMap((enemy, index) => {
    const troop = getTroopById(enemy.troopId);
    return troop ? [enemyToSnapshot(troop, enemy, index)] : [];
  }));
}

/**
 * meta 桥接专用注册表：全量技能库 + 主角武器原型 + 未收录法术的兜底原型。
 * 武器原型来自 curated W 系批次（`weaponCatalog.CATALOG_WEAPONS`，`gw_*` 命名空间），
 * 注册在兜底循环之前，永远不会被 fallbackPrototype 覆盖。
 * headless 驱动与未来战斗层挂载共用同一份（App.init 的注入模式）。
 *
 * 2026-09-19 窗口 M：首批 20 把自造 `w_*`（meta 层手写 builders DSL 原型）已整表退役，
 * 原先那个循环随之删除——主角武器原型现在与 718 目录同一个来源。
 */
export function buildMetaRegistry(extraSkillIds: Iterable<string>): ExtensionRegistry {
  const registry = new ExtensionRegistry();
  registerSkillLibrary(registry.prototypes);
  // 目录武器装备池（有编译原型的那些；mana-only 占位不可装备、不注册）
  for (const weapon of CATALOG_WEAPONS) {
    if (weapon.skill) registry.prototypes.set(weapon.id, weapon.skill);
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

/**
 * 玩家出战队的战斗快照（当前预设队：主角/旗帜/王国加成/天赋全生效）。
 * buildBattleRequest 与入侵 PvP 共用（镜像对手单独走 enemyToSnapshot）。
 */
export function buildPlayerSnapshots(
  save: MetaSave,
  chosenTeam?: TeamPreset,
): { ok: true; playerTeam: CombatantSnapshot[]; team: TeamPreset } | MetaFailure {
  const team = chosenTeam ?? activeTeam(save);
  if (!team) return fail('NO_TEAM', '没有可用队伍：先在编队页保存一支 4 人队');

  const immortalIssue = immortalTeamIssue(team.members);
  if (immortalIssue) return fail('INVALID', immortalIssue.message);
  if (!chosenTeam) {
    const validation = validateTeam(save, team);
    if (!validation.ok) return fail('INVALID', validation.issues[0]!.message);
  }

  const playerTeam: CombatantSnapshot[] = [];
  const statBonus = kingdomBonusOf(save);
  const weapon = equippedWeaponOf(save);
  const heroClass = equippedClassOf(save);
  const talentEffects = selectedTalents(save);
  const talentCodes = heroTraitCodes(save);
  const heroBase = heroStatsOf(save);
  // 天赋加成的作用对象判定：全队种族计数（含主角采纳的职业类型）——
  // 「每有一名X盟友」按计数乘，「全队静态」按类型/颜色命中
  const allyTypeCounts = new Map<string, number>();
  const countType = (type: string): void => {
    allyTypeCounts.set(type, (allyTypeCounts.get(type) ?? 0) + 1);
  };
  if (heroClass) countType(heroClass.troopType);
  for (const member of team.members.values()) {
    if (member.kind !== 'troop') continue;
    const troop = getTroopById(member.troopId);
    if (!troop) continue; // 缺收藏的成员在下方主循环显式报错
    for (const type of troop.troopTypes) countType(type);
  }

  for (const [position, member] of team.members.entries()) {
    if (member.kind === 'hero') {
      // 主角快照（M5/v2）：武器=唯一施法手段，无武器时 skillId 'none'（注册表兜底，仅扣法力）；
      // 王国 10 级加成对主角同样生效（全体部队口径）；天赋走 heroStatBonus（自身系）+
      // allyStatBonus（全队系对主角的份额）；装备职业后主角采纳该职业兵种类型
      const heroTalent = heroStatBonus(
        save,
        position,
        team.members.length,
        weapon?.weaponType ?? null,
        allyTypeCounts,
      );
      const heroAura = allyStatBonus(
        talentEffects,
        heroClass ? [heroClass.troopType] : ['Human'],
        weapon?.manaColors.length ? [...weapon.manaColors] : [BaseColor.Brown],
      );
      const displayTraitIds = heroDisplayTraitIds(save);
      playerTeam.push({
        externalId: `p${position}-hero`,
        name: save.character?.portrait === 'legacy' ? '主角' : characterName(save.character),
        levelLabel: `Lv.${save.hero.level}`,
        portraitUrl: save.character?.portrait === 'legacy' ? '/static/troops/hero.webp' : characterPortrait(save.character),
        stats: {
          hp: heroBase.health + statBonus.health + heroTalent.health + heroAura.health,
          attack: heroBase.attack + statBonus.attack + heroTalent.attack + heroAura.attack,
          armor: heroBase.armor + statBonus.armor + heroTalent.armor + heroAura.armor,
          magic: heroBase.magic + statBonus.magic + heroTalent.magic + heroAura.magic,
        },
        troopTypes: [heroClass?.troopType ?? 'Human'],
        manaColors: weapon?.manaColors.length ? [...weapon.manaColors] : [BaseColor.Brown],
        // 会话校验要求耗蓝 1~100：无武器按「1 蓝耗的空施法」处理（skillId 'none' 走兜底原型）
        manaCost: weapon?.manaCost ?? 1,
        traitIds: talentCodes,
        displayTraitIds,
        spellName: weapon?.name,
        spellDescription: weapon?.description,
        traitNames: TRAIT_DISPLAY_NAMES,
        skillId: weapon?.id ?? 'none',
        // 淬炼等级（素材批 F2）：引擎 tempering 来源 modifier 按它计数
        ...(weapon ? { temperingLevel: temperingLevelOf(save, weapon.id) } : {}),
      });
      continue;
    }
    if (member.kind !== 'troop') continue;
    const troop = getTroopById(member.troopId);
    const rec = getRecord(save, member.troopId);
    if (!troop || !rec) {
      return fail('NOT_OWNED', `队伍第 ${position + 1} 号位的部队不在收藏中`);
    }
    const snapshot = troopToSnapshot(troop, rec, `p${position}-${troop.id}`, statBonus);
    // 天赋「全队静态加成」（alliesStat）：按种族/颜色/全体筛选后加到该部队
    const aura = allyStatBonus(talentEffects, troop.troopTypes, troop.manaColors);
    snapshot.stats.hp += aura.health;
    snapshot.stats.attack += aura.attack;
    snapshot.stats.armor += aura.armor;
    snapshot.stats.magic += aura.magic;
    playerTeam.push(snapshot);
  }
  return { ok: true, playerTeam, team };
}

/** 组一场战斗请求。队伍非法 / 主角占位 / 敌我内容异常都返回显式失败。 */
export function buildBattleRequest(save: MetaSave, plan: EncounterPlan): BridgeOutcome | MetaFailure {
  if (plan.enemies.length === 0) return fail('INVALID', '出敌计划为空');

  const built = buildPlayerSnapshots(save);
  if (!built.ok) return built;
  const playerTeam = built.playerTeam;

  const enemyByExternalId = new Map<string, EncounterEnemy>();
  const enemyTeam: CombatantSnapshot[] = [];
  for (const [index, enemy] of plan.enemies.entries()) {
    const troop = getTroopById(enemy.troopId);
    if (!troop) return fail('UNKNOWN_TROOP', `出敌计划引用了不存在的部队 id ${enemy.troopId}`);
    const snapshot = enemyToSnapshot(troop, enemy, index);
    enemyByExternalId.set(snapshot.externalId, enemy);
    enemyTeam.push(snapshot);
  }

  const sourceTag = plan.source.kind === 'quest'
    ? `q${plan.source.node}`
    : plan.source.kind === 'event'
      ? `ev-${plan.source.typeId}-${plan.source.weekStart}`
      : `x${plan.source.tier}`;
  const request: BattleRequest = {
    schemaVersion: BATTLE_SCHEMA_VERSION,
    battleId: `meta-${plan.seed}`,
    requestId: `meta-${plan.seed}-${sourceTag}`,
    rulesetVersion: RULESET_VERSION,
    seed: plan.seed,
    playerTeam,
    enemyTeam,
  };
  // 玩家旗帜（M6）：出战预设队装备了已解锁旗帜 → 契约带加成（官方语义：匹配 ±N 法力）
  const banner = equippedBannerOf(save, built.team);
  if (banner && Object.keys(banner.boosts).length > 0) {
    request.playerBanner = { boosts: { ...banner.boosts } };
  }
  const mastery = toEngineMastery(combatManaMastery(save));
  if (Object.keys(mastery).length > 0) request.playerManaMastery = mastery;

  const registry = buildMetaRegistry(
    [...playerTeam, ...enemyTeam].map((s) => s.skillId as string),
  );
  const check = validateBattleRequest(request, {
    knownSkillIds: new Set([...registry.skills.keys(), ...registry.prototypes.keys()]),
    knownTraitIds: metaKnownTraitIds(),
    knownTroopTypes: knownTroopTypes(),
  });
  if (!check.ok) {
    const first = check.issues[0];
    return fail('INVALID', `战斗请求未过会话校验：${first ? `${first.code} ${first.message}` : '未知问题'}`);
  }

  return { ok: true, request, plan, enemyByExternalId, registry };
}

/**
 * 活动 modify 之后的复核（活动深化批）：玩法会改写快照、注入特质与战斗规则，
 * 下发前再过一遍会话校验，坏规则在出战前就失败而不是进场后静默失真。
 */
export function revalidateOutcome(outcome: BridgeOutcome): MetaFailure | null {
  const check = validateBattleRequest(outcome.request, {
    knownSkillIds: new Set([...outcome.registry.skills.keys(), ...outcome.registry.prototypes.keys()]),
    knownTraitIds: metaKnownTraitIds(),
    knownTroopTypes: knownTroopTypes(),
  });
  if (check.ok) return null;
  const first = check.issues[0];
  return fail('INVALID', `活动战斗请求未过会话校验：${first ? `${first.path} ${first.message}` : '未知问题'}`);
}
