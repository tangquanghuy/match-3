/**
 * 天赋树与职业特质（主角系统 v2）——官方口径的选配式天赋。
 *
 * 结构：每职业 3 棵树 × 7 档（冠军等级 1/5/10/20/40/70/100），每档**选 1** 条
 * （三树七档选一），可随时改配、免费；未选档位不生效。
 * 效果消费（谁在哪儿算）：
 *  - selfStat/selfStatIfPosition/selfStatIfWeapon/selfStatPerAlly → 快照期主角自身四维加成
 *    （battleBridge 组装时调用 heroStatBonus）；
 *  - alliesStat → 快照期玩家侧全队四维加成（按种族/颜色/全体筛选，含主角自身）；
 *  - trait 别名 → 主角快照 traitIds（走引擎既有特质管线， battleBridge 过滤已实现集）；
 *  - xpBonus → 结算期主角经验加成（settlement 调用 xpBonusPct）；
 *  - pvp → 无 PvP 模式，不适用；unimplemented → 未实现，不产出任何数值（审计见 classes.json）。
 * 职业特质：3 槽按职业配色消耗特质石，顺序解锁，已实现的 code 同样进主角 traitIds。
 */
import { TRAIT_LIBRARY, registerDynamicTraits } from '../../engine/traits';
import type { MetaSave } from '../state/schema';
import { fail, type MetaFailure } from '../types';
import { spendMaterials } from './wallet';
import { heroTraitCost, type HeroTraitCost } from '../data/heroTraitCosts';
import { stoneName } from '../data/materials';
import { PVP_DYNAMIC_DEFS, PERK_DYNAMIC_DEFS, TALENT_DYNAMIC_CODES, TALENT_DYNAMIC_DEFS } from '../data/talentDefs';
import {
  CHAMPION_TIERS,
  classById,
  tierUnlocked,
  type ClassDef,
  type TalentDef,
  type TalentEffect,
} from '../data/classes';
import { classLevelOf, equippedClassOf } from './hero';

const KNOWN_CODES: ReadonlySet<string> = new Set(TRAIT_LIBRARY.map((t) => t.code));

// 动态特质定义注册（幂等）：56 条天赋 + 38 条职业特质 + 2 条 PvP 天赋的定义在导入时
// 注册进引擎，getTrait 按 静态库 → 动态注册 回落查询——引擎全部既有钩子对天赋 code
// 零改动生效。
registerDynamicTraits([...TALENT_DYNAMIC_DEFS, ...PERK_DYNAMIC_DEFS, ...PVP_DYNAMIC_DEFS]);

/** 天赋是否已有真实战斗效果（静态别名/效果编译 或 本批动态定义） */
export function hasTalentEffect(talent: { code: string; effect: TalentEffect }): boolean {
  return talent.effect.kind !== 'unimplemented' || TALENT_DYNAMIC_CODES.has(talent.code);
}

/** 某职业的天赋选取槽（长度恒 7，稀疏位为 null） */
export function talentPicksOf(save: MetaSave, classId: string): (string | null)[] {
  const picks = save.hero.talentPicks[classId];
  if (!picks || picks.length !== 7) return [null, null, null, null, null, null, null];
  return picks;
}

/** 档位上选的天赋定义（未选/未知 code → null） */
export function pickedTalentAt(save: MetaSave, classId: string, tierIndex: number): TalentDef | null {
  const code = talentPicksOf(save, classId)[tierIndex];
  if (!code) return null;
  const def = classById(classId);
  for (const tree of def?.trees ?? []) {
    const talent = tree.talents[tierIndex];
    if (talent && talent.code === code) return talent;
  }
  return null;
}

/**
 * 档位选取：覆盖式（同档重选即改配，官方免费改配口径）。
 * 校验：职业已解锁且已装备？——选取只要求**已解锁**（官方允许战前配天赋；
 * 但选取作用于装备职业的出战，故未装备时也允许预配）。
 */
export function pickTalent(
  save: MetaSave,
  classId: string,
  tierIndex: number,
  talentCode: string,
): { ok: true; classId: string; tierIndex: number } | MetaFailure {
  const def = classById(classId);
  if (!def) return fail('INVALID', `未知职业：${classId}`);
  if (!save.hero.unlockedClasses.includes(classId)) {
    return fail('PREREQ_LOCKED', `职业「${def.name}」未解锁`);
  }
  if (tierIndex < 0 || tierIndex >= CHAMPION_TIERS.length) return fail('INVALID', '天赋档位越界');
  if (!tierUnlocked(classLevelOf(save, classId), tierIndex)) {
    return fail('PREREQ_LOCKED', `天赋第 ${tierIndex + 1} 档需要冠军等级 ${CHAMPION_TIERS[tierIndex]}`);
  }
  const talent = def.trees.map((t) => t.talents[tierIndex]).find((t) => t && t.code === talentCode);
  if (!talent) return fail('INVALID', `「${def.name}」第 ${tierIndex + 1} 档没有天赋 ${talentCode}`);
  const picks = [...talentPicksOf(save, classId)];
  picks[tierIndex] = talentCode;
  save.hero.talentPicks[classId] = picks;
  return { ok: true, classId, tierIndex };
}

/** 清除档位选取（免费改配的一半：取消） */
export function clearTalent(
  save: MetaSave,
  classId: string,
  tierIndex: number,
): { ok: true; classId: string; tierIndex: number } | MetaFailure {
  if (!classById(classId)) return fail('INVALID', `未知职业：${classId}`);
  if (tierIndex < 0 || tierIndex >= CHAMPION_TIERS.length) return fail('INVALID', '天赋档位越界');
  const picks = [...talentPicksOf(save, classId)];
  picks[tierIndex] = null;
  save.hero.talentPicks[classId] = picks;
  return { ok: true, classId, tierIndex };
}

/** 当前装备职业已生效的天赋列表（按档位序） */
export function selectedTalents(save: MetaSave): TalentDef[] {
  const def = equippedClassOf(save);
  if (!def) return [];
  const level = classLevelOf(save, def.id);
  const picks = talentPicksOf(save, def.id);
  const out: TalentDef[] = [];
  for (let tier = 0; tier < 7; tier++) {
    if (!tierUnlocked(level, tier)) continue;
    const code = picks[tier];
    if (!code) continue;
    const talent = def.trees.map((t) => t.talents[tier]).find((t) => t && t.code === code);
    if (talent) out.push(talent);
  }
  return out;
}

/** 当前装备职业已解锁的职业特质 code（过滤到引擎已实现集合） */
export function activePerkCodes(save: MetaSave): string[] {
  const def = equippedClassOf(save);
  if (!def) return [];
  const state = save.hero.classTraits[def.id];
  if (!state) return [];
  return def.perks
    .filter((p, i) => state[i] && (p.implemented || TALENT_DYNAMIC_CODES.has(p.code)))
    .map((p) => p.code);
}

/** 当前装备职业已解锁特质槽的状态（供 UI 渲染；未装备职业返回 null） */
export function heroTraitSlots(save: MetaSave): { def: ClassDef; state: [boolean, boolean, boolean] } | null {
  const def = equippedClassOf(save);
  if (!def) return null;
  return { def, state: save.hero.classTraits[def.id] ?? [false, false, false] };
}

/** Shared read-only quote: UI and server use the same recipe and prerequisites. */
export function heroTraitQuote(save: MetaSave, classId: string, slot: number) {
  const def = classById(classId);
  const cost = heroTraitCost(classId, slot);
  if (!def || !cost) return null;
  const perk = def.perks[slot - 1]!;
  const state = save.hero.classTraits[classId] ?? [false, false, false];
  const rows = Object.entries(cost.stones).map(([key, required]) => {
    const owned = save.materials.traitstones[key] ?? 0;
    return { key, required, owned, short: Math.max(0, required - owned) };
  });
  const reason = !save.hero.unlockedClasses.includes(classId) ? '职业尚未解锁'
    : state[slot - 1] ? '该特质已解锁'
    : slot > 1 && !state[slot - 2] ? '请先解锁前一个特质'
    : !perk.implemented && !TALENT_DYNAMIC_CODES.has(perk.code) ? '该特质暂未开放'
    : rows.some(row => row.short > 0) ? '特质石不足' : '';
  return { def, perk, cost, rows, reason, canUnlock: !reason, unlocked: !!state[slot - 1] };
}

/** Explicit classId pins the confirmation to its subject even if equipment changes. */
export function unlockHeroTrait(
  save: MetaSave,
  slot: number,
  classId: string | null = save.hero.classId,
): { ok: true; slot: number; cost: HeroTraitCost } | MetaFailure {
  if (!classId) return fail('INVALID', '未装备职业');
  const quote = heroTraitQuote(save, classId, slot);
  if (!quote) return fail('INVALID', '职业或特质槽位无效');
  if (quote.unlocked) return fail('ALREADY_UNLOCKED', '该特质已解锁');
  if (quote.reason && quote.reason !== '特质石不足') return fail('PREREQ_LOCKED', quote.reason);
  if (!quote.canUnlock) return fail('INSUFFICIENT', quote.rows.filter(r => r.short > 0)
    .map(r => `${stoneName(r.key)}还差 ${r.short}`).join('；'));
  const paid = spendMaterials(save, { traitstones: quote.cost.stones });
  if (!paid.ok) return paid;
  const state = [...(save.hero.classTraits[classId] ?? [false, false, false])] as [boolean, boolean, boolean];
  state[slot - 1] = true;
  save.hero.classTraits[classId] = state;
  return { ok: true, slot, cost: quote.cost };
}

// ---------------------------------------------------------------------------
// 战斗快照期加成（battleBridge 消费）
// ---------------------------------------------------------------------------

export interface StatBonus {
  health: number;
  attack: number;
  armor: number;
  magic: number;
}

const ZERO: StatBonus = { health: 0, attack: 0, armor: 0, magic: 0 };

function addInto(target: StatBonus, stat: string, amount: number): void {
  if (stat === 'all') {
    target.health += amount;
    target.attack += amount;
    target.armor += amount;
    target.magic += amount;
    return;
  }
  if (stat === 'health' || stat === 'attack' || stat === 'armor' || stat === 'magic') {
    target[stat] += amount;
  }
}

/**
 * 主角自身加成：selfStat 系天赋之和。
 * @param position 主角站位（0 起；0 = 首位）
 * @param teamSize 玩家侧队伍人数（3~4，判定「末位」用）
 * @param weaponType 当前武器类型（无武器/未标注为 null）
 * @param allyTypeCounts 玩家侧各兵种类型的盟友计数（含主角；「每有一名X盟友」按计数乘）
 */
export function heroStatBonus(
  save: MetaSave,
  position: number,
  teamSize: number,
  weaponType: string | null,
  allyTypeCounts: ReadonlyMap<string, number>,
): StatBonus {
  const bonus = { ...ZERO };
  for (const talent of selectedTalents(save)) {
    const e = talent.effect as TalentEffect;
    switch (e.kind) {
      case 'selfStat':
        addInto(bonus, e.stat, e.amount);
        break;
      case 'selfStatIfPosition':
        if ((e.position === 'first' && position === 0) || (e.position === 'last' && position === teamSize - 1)) {
          addInto(bonus, e.stat, e.amount);
        }
        break;
      case 'selfStatIfWeapon':
        if (weaponType !== null && weaponType === e.weaponType) addInto(bonus, e.stat, e.amount);
        break;
      case 'selfStatPerAlly':
        addInto(bonus, e.stat, e.amount * (allyTypeCounts.get(e.troopType) ?? 0));
        break;
      default:
        break;
    }
  }
  return bonus;
}

/**
 * 单个友方成员的全队静态加成份额：alliesStat 系天赋按 scope 筛选后的合计。
 * 主角也是友方成员（scope 命中判断用主角的 troopTypes/manaColors）。
 */
export function allyStatBonus(effects: readonly TalentDef[], troopTypes: readonly string[], manaColors: readonly string[]): StatBonus {
  const bonus = { ...ZERO };
  for (const talent of effects) {
    const e = talent.effect as TalentEffect;
    if (e.kind !== 'alliesStat') continue;
    let hit: boolean;
    if (e.scope.kind === 'all') hit = true;
    else if (e.scope.kind === 'color') hit = manaColors.includes(e.scope.color);
    else hit = troopTypes.includes(e.scope.troopType);
    if (!hit) continue;
    for (const [stat, amount] of Object.entries(e.stats)) addInto(bonus, stat, amount as number);
  }
  return bonus;
}

/**
 * 主角快照应携带的特质 code。三层来源：
 *  1. 引擎可执行的天赋（trait 别名 / 动态定义 / PvP 类）——真实战斗行为；
 *  2. 静态效果天赋（selfStat/alliesStat 等）——行为在快照期由 meta 计算（heroStatBonus/
 *     allyStatBonus），code 进快照仅供引擎安全忽略 + **卡面特质图标行显示**（玩家天赋
 *     对标兵种特质的可视化口径）；
 *  3. 已解锁职业特质（implemented 或动态定义）。
 */
export function heroTraitCodes(save: MetaSave): string[] {
  const codes: string[] = [];
  for (const talent of selectedTalents(save)) {
    const e = talent.effect as TalentEffect;
    if (e.kind === 'trait' && KNOWN_CODES.has(e.code)) {
      codes.push(e.code);
      continue;
    }
    if (e.kind === 'unimplemented' && TALENT_DYNAMIC_CODES.has(talent.code)) {
      codes.push(talent.code);
      continue;
    }
    if (e.kind === 'pvp') {
      codes.push(talent.code); // pvpBonus/pvpEconomyGain 已注册，无 pvpMode 时引擎惰性
      continue;
    }
    // 静态效果族：引擎无此 code（安全忽略），快照携带只为卡面图标展示
    codes.push(talent.code);
  }
  codes.push(...activePerkCodes(save));
  return [...new Set(codes)];
}

/** 结算期主角经验加成（百分比合计，0 表示无） */
export function xpBonusPct(save: MetaSave): number {
  let pct = 0;
  for (const talent of selectedTalents(save)) {
    const e = talent.effect as TalentEffect;
    if (e.kind === 'xpBonus') pct += e.pct;
  }
  return pct;
}
