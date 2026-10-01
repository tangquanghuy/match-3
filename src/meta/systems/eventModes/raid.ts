import { rewardRaidHighTier } from '../eventHighTierRewards';
/**
 * 突袭首领 · 阶段血池 + 轮换出战（2026-09-29 重做；2026-09-30 深化批：首领原型机制 + 战术补给）。
 *
 * 与其它活动的区别在于「同一个目标反复打，比的是阵容深度」：
 *  - 一只固定首领 + 护卫，血池跨战斗保留（胜败都计伤害），见底 = 讨伐，刷新更强的下一阶；
 *  - 血池分三阶段：傲慢（>66%，首领护甲 +40%）→ 狂怒（33~66%，攻击 +30%，开局激怒）→
 *    绝境（≤33%，攻击 +50%，护卫 +20% 并增派一名精英，开局召唤末日风暴）；
 *  - 首领原型（按周与阶轮换）：熔岩巨像 / 亡者之主 / 雷霆巨龙 / 蛛母 / 霜龙——每种都有自己的
 *    棋盘机制（火山、末日骷髅、闪电、织网、冻结宝石），而且这些宝石双方都能利用；
 *  - 破绽：首领受伤掉落破绽色巨人宝石（+5 法力并引爆周围），破绽色部队攻击 +30%——正反馈闭环；
 *  - 战术补给：每次出击后三选一，下一场生效（冻结首领 / 全队 35% 法力 / 猎首标记 / 预置破绽巨人宝石 / 全色涌动）；
 *  - 战损疲劳：参战过的部队在本阶段内「疲惫」，再次上场攻击 -40%；跨阶段或讨伐后解除；主角不疲劳；
 *  - 额外奖励：单场重创（≥15% 血池）低概率钻石；亲手讨伐 50% 藏宝图。
 */
import '../../data/eventTraits';
import { KINGDOM_ORDER, kingdomTroopPool } from '../../data/kingdoms';
import { fnv1a32 } from '../../data/hash';
import { EVENT_DIFFICULTY, EVENT_RAID_POOL_POINTS, EVENT_WEEKLY_PLAY_REWARD_CAP } from '../../data/events';
import { enemyLevel } from '../../data/enemyDifficulty';
import { weakGiantCode } from '../../data/eventTraits';
import { getTroopById } from '../../../data/troops';
import { BaseColor } from '../../../engine/types';
import { STAT_LIMITS } from '../../../session/validateRequest';
import type { MaterialDelta } from '../../data/materials';
import { fail } from '../../types';
import { earn, earnMaterials } from '../wallet';
import { pickEnemies, type EncounterEnemy, type EncounterPlan } from '../encounter';
import { SPECIAL_TUNING } from '../specialEncounters';
import type { BattleResult } from '../../../session/contract';
import {
  EVENT_POINTS_CAP, addMastery, addRules, buffSnapshot, enemyExternalId, injectTraits, injectTraitsOn, int, isObj, memberKey,
  pickN, rngOf, str, strArr,
  type EventModeImpl, type EventProgressLine,
} from './common';

export type RaidArchetype = 'lava' | 'lich' | 'tempest' | 'brood' | 'frost';
export type RaidSupply = 'frost' | 'ink' | 'mark' | 'giant' | 'surge';

export interface RaidState {
  v: 1;
  tier: number;
  kingdom: string;
  /** [首领, 护卫, 护卫, 绝境增援] 的部队 id */
  lineup: number[];
  hp: number;
  max: number;
  slain: number;
  /** 本阶段已参战（疲惫）的成员键：部队 id */
  fatigue: string[];
  /** 疲劳所属阶段（阶段变化即清空） */
  fatiguePhase: number;
  bestHit: number;
  attempts: number;
  /** 本阶首领原型 */
  archetype: RaidArchetype;
  /** 待选的战术补给（三选一） */
  offer: RaidSupply[] | null;
  /** 已选、下一场生效的补给 */
  supply: RaidSupply | null;
}

export const RAID_PHASES = [
  { name: '傲慢', desc: '首领护甲 +40%' },
  { name: '狂怒', desc: '首领攻击 +30%，开局激怒' },
  { name: '绝境', desc: '首领攻击 +50%，护卫 +20%，增派一名精英，开局召唤末日风暴' },
] as const;

export const RAID_ARCHETYPES: Record<RaidArchetype, { name: string; desc: string; icon: string; boss: string[]; guard: string[] }> = {
  lava: { name: '熔岩巨像', desc: '回合开始 50% 创造火山宝石；骷髅伤害 -20%', icon: 'gem:special/volcanoGem', boss: ['ev_boss_lava', 'ev_boss_magma_skin'], guard: [] },
  lich: { name: '亡者之主', desc: '回合开始 40% 把骷髅变成末日骷髅；护卫 35% 复活、身亡留下末日骷髅', icon: 'gem:special/doomSkull', boss: ['ev_boss_lich'], guard: ['ev_guard_undying', 'ev_guard_bonepile'] },
  tempest: { name: '雷霆巨龙', desc: '开局雷电风暴；回合开始 40% 把黄色宝石变成闪电', icon: 'gem:special/lightningCol', boss: ['ev_boss_tempest'], guard: [] },
  brood: { name: '蛛母', desc: '回合开始 60% 把紫色宝石变成织网宝石；骷髅攻击使目标中毒', icon: 'gem:special/web', boss: ['ev_boss_broodmother', 'ev_boss_venomfang'], guard: [] },
  frost: { name: '霜龙', desc: '开局寒冰风暴；回合开始 40% 把蓝色宝石变成冻结宝石', icon: 'gem:status/freezeGem', boss: ['ev_boss_frostwyrm'], guard: [] },
};

export const RAID_SUPPLIES: Record<RaidSupply, { name: string; desc: string; icon: string }> = {
  frost: { name: '冰封卷轴', desc: '开局冻结首领 3 回合', icon: 'status:frozen' },
  ink: { name: '战前动员', desc: '全队以 35% 法力开战', icon: 'status:enchanted' },
  mark: { name: '猎首标记', desc: '开局给首领挂猎人标记（对应特质双倍伤害）', icon: 'status:marked' },
  giant: { name: '破绽情报', desc: '开局棋盘预置 3 颗破绽色巨人宝石', icon: 'gem:special/giantGemRed' },
  surge: { name: '法力涌泉', desc: '全色法力精通 +40（3 消也可能涌动翻倍）', icon: 'relic-surge_orb' },
};

export const RAID_FATIGUE_ATTACK = -0.4;
export const RAID_WEAKNESS_ATTACK = 0.3;
/** 单场重创门槛（占血池比例）与彩头 */
export const RAID_HEAVY_HIT = 0.15;
const COLORS = Object.values(BaseColor) as BaseColor[];
const ARCHETYPES = Object.keys(RAID_ARCHETYPES) as RaidArchetype[];
const SUPPLIES = Object.keys(RAID_SUPPLIES) as RaidSupply[];

/** 本周破绽色（每周确定） */
export function raidWeakColor(weekStart: number): BaseColor {
  return COLORS[fnv1a32(`raid-weak-${weekStart >>> 0}`) % COLORS.length]!;
}

/** 第 tier 阶首领原型（每周、每阶确定） */
export function raidArchetypeOf(weekStart: number, tier: number): RaidArchetype {
  return ARCHETYPES[fnv1a32(`raid-arch-${weekStart >>> 0}-${tier}`) % ARCHETYPES.length]!;
}

/** 首领第 tier 阶（1 起）的敌人等级与血池 */
export function raidTierLevel(tier: number): number {
  return enemyLevel(EVENT_DIFFICULTY.base + (Math.max(Math.floor(tier), 1) - 1) * EVENT_DIFFICULTY.step);
}
export function raidPoolOf(tier: number): number {
  const t = Math.max(Math.floor(tier), 1);
  const pool = raidTierLevel(t) * EVENT_DIFFICULTY.raidPoolPerLevel * Math.pow(EVENT_DIFFICULTY.raidPoolGrowth, t - 1);
  return Math.min(STAT_LIMITS.hp.max, Math.round(pool));
}

/** 当前阶段（0/1/2） */
export function raidPhaseOf(hp: number, max: number): number {
  if (max <= 0) return 0;
  const pct = hp / max;
  return pct > 2 / 3 ? 0 : pct > 1 / 3 ? 1 : 2;
}

/** 突袭单场积分：按伤害占血池比例折算（打空一条 ≈ 400 分），有伤害至少 10 分 */
export function raidPointsFor(damage: number, poolMax: number): number {
  if (damage <= 0 || poolMax <= 0) return 0;
  return Math.min(EVENT_POINTS_CAP, Math.max(10, Math.round((damage / poolMax) * EVENT_RAID_POOL_POINTS)));
}

function offerSupplies(state: RaidState, weekStart: number): void {
  state.offer = pickN(rngOf(fnv1a32(`raid-offer-${weekStart >>> 0}-${state.tier}-${state.attempts}`)), SUPPLIES, 3);
}

function spawnBoss(state: RaidState, weekStart: number): void {
  const seed = fnv1a32(`raid-${weekStart >>> 0}-${state.tier}`);
  const rng = rngOf(seed);
  let kingdom = KINGDOM_ORDER[seed % KINGDOM_ORDER.length]!;
  if (kingdomTroopPool(kingdom).length === 0) kingdom = KINGDOM_ORDER[0]!;
  const picked = pickEnemies(kingdom, raidTierLevel(state.tier), ['boss', 'elite', 'elite', 'elite'], rng);
  state.kingdom = kingdom;
  state.lineup = picked.map((e) => e.troopId);
  state.max = raidPoolOf(state.tier);
  state.hp = state.max;
  state.fatigue = [];
  state.fatiguePhase = 0;
  state.archetype = raidArchetypeOf(weekStart, state.tier);
}

function bossDamage(state: RaidState, plan: EncounterPlan, result: BattleResult): number {
  const boss = result.combatants.find((c) => c.side === 'enemy' && c.externalId === `e0-${plan.enemies[0]?.troopId}`);
  const start = plan.source.kind === 'event' ? plan.source.bossStartHp ?? state.hp : state.hp;
  return boss ? Math.max(0, Math.min(start, start - Math.max(0, boss.hp))) : 0;
}

const isSupply = (v: unknown): v is RaidSupply => typeof v === 'string' && v in RAID_SUPPLIES;

export const raidMode: EventModeImpl<RaidState> = {
  init(ctx) {
    const state: RaidState = {
      v: 1, tier: 1, kingdom: '', lineup: [], hp: 0, max: 0, slain: 0, fatigue: [], fatiguePhase: 0, bestHit: 0, attempts: 0,
      archetype: 'lava', offer: null, supply: null,
    };
    spawnBoss(state, ctx.weekStart);
    offerSupplies(state, ctx.weekStart);
    return state;
  },

  sanitize(raw, ctx) {
    if (!isObj(raw) || raw.v !== 1) return null;
    const lineup = (Array.isArray(raw.lineup) ? raw.lineup : []).filter((n): n is number => Number.isInteger(n) && !!getTroopById(n));
    if (lineup.length < 3) return null;
    const max = int(raw.max, 0, 1, STAT_LIMITS.hp.max);
    const tier = int(raw.tier, 1, 1);
    const offer = Array.isArray(raw.offer) ? raw.offer.filter(isSupply) : [];
    return {
      v: 1, tier, kingdom: str(raw.kingdom, KINGDOM_ORDER[0]!), lineup,
      hp: int(raw.hp, max, 0, max), max, slain: int(raw.slain, 0, 0), fatigue: strArr(raw.fatigue),
      fatiguePhase: int(raw.fatiguePhase, 0, 0, 2), bestHit: int(raw.bestHit, 0, 0), attempts: int(raw.attempts, 0, 0),
      archetype: typeof raw.archetype === 'string' && raw.archetype in RAID_ARCHETYPES ? raw.archetype as RaidArchetype : raidArchetypeOf(ctx.weekStart, tier),
      offer: offer.length ? offer : null,
      supply: isSupply(raw.supply) ? raw.supply : null,
    };
  },

  plan(_ctx, state) {
    const phase = raidPhaseOf(state.hp, state.max);
    const level = raidTierLevel(state.tier);
    const count = phase === 2 ? 4 : 3;
    const enemies: EncounterEnemy[] = state.lineup.slice(0, count).map((troopId, i) => ({
      troopId, level, tier: i === 0 ? 'boss' : 'elite', traitCount: 3,
    }));
    const boss = enemyExternalId(0, state.lineup[0]!);
    return {
      kingdom: state.kingdom, enemies, choice: `phase:${phase}`,
      bonus: [
        { id: 'raid-heavy', label: '重创首领的彩头', when: { kind: 'damageAtLeast', target: boss, from: state.hp, min: Math.ceil(state.max * RAID_HEAVY_HIT) }, chance: 0.2, deltas: { gems: SPECIAL_TUNING.gems } },
        { id: 'raid-slay', label: '首领宝库的藏宝图', when: { kind: 'damageAtLeast', target: boss, from: state.hp, min: state.hp }, chance: 0.5, mats: { treasureMaps: 1 } },
      ],
    };
  },

  modify(ctx, state, outcome) {
    const phase = raidPhaseOf(state.hp, state.max);
    const weak = raidWeakColor(ctx.weekStart);
    const arch = RAID_ARCHETYPES[state.archetype];
    for (const snap of outcome.request.playerTeam) {
      const key = memberKey(snap.externalId);
      let attackPct = 0;
      if (key !== 'hero' && state.fatiguePhase === phase && state.fatigue.includes(key)) attackPct += RAID_FATIGUE_ATTACK;
      if (snap.manaColors.includes(weak)) attackPct += RAID_WEAKNESS_ATTACK;
      if (attackPct !== 0) buffSnapshot(snap, { attackPct });
    }
    outcome.request.enemyTeam.forEach((snap, i) => {
      if (i === 0) {
        snap.eventTarget = 'boss';
        snap.stats.hp = Math.max(1, Math.min(STAT_LIMITS.hp.max, state.max));
        snap.initialHp = Math.max(1, Math.min(snap.stats.hp, state.hp));
        if (outcome.plan.source.kind === 'event') outcome.plan.source.bossStartHp = snap.initialHp;
        if (phase === 0) buffSnapshot(snap, { armorPct: 0.4 });
        if (phase === 1) buffSnapshot(snap, { attackPct: 0.3 });
        if (phase === 2) buffSnapshot(snap, { attackPct: 0.5 });
        injectTraitsOn(snap, [...arch.boss, weakGiantCode(weak), ...(phase === 1 ? ['ev_phase_rage'] : phase === 2 ? ['ev_phase_doom'] : [])]);
      } else {
        if (phase === 2) buffSnapshot(snap, { attackPct: 0.2, armorPct: 0.2, hpPct: 0.2 });
        if (arch.guard.length) injectTraitsOn(snap, arch.guard);
      }
    });
    // 战术补给（下一场生效）
    const req = outcome.request;
    switch (state.supply) {
      case 'frost': injectTraits(req.playerTeam, [{ code: 'ev_sup_frost', on: 'lead' }]); break;
      case 'ink': injectTraits(req.playerTeam, [{ code: 'ev_sup_ink', on: 'lead' }]); break;
      case 'mark': injectTraits(req.playerTeam, [{ code: 'ev_sup_mark', on: 'lead' }]); break;
      case 'giant': addRules(outcome, { board: { preset: [{ gem: { kind: 'giantGem', color: weak }, count: 3 }] } }); break;
      case 'surge': addMastery(outcome, COLORS, 40); break;
      default: break;
    }
  },

  points(_ctx, state, plan, result) {
    return raidPointsFor(bossDamage(state, plan, result), state.max);
  },

  progress(ctx, state, plan, result) {
    const lines: EventProgressLine[] = [];
    const damage = bossDamage(state, plan, result);
    const phaseBefore = raidPhaseOf(state.hp, state.max);
    const used = state.supply;
    state.supply = null;
    state.attempts += 1;
    state.bestHit = Math.max(state.bestHit, damage);
    // 疲劳：本场参战的部队记入当前阶段
    if (state.fatiguePhase !== phaseBefore) { state.fatigue = []; state.fatiguePhase = phaseBefore; }
    for (const c of result.combatants) {
      if (c.side !== 'player') continue;
      const key = memberKey(c.externalId);
      if (key !== 'hero' && !state.fatigue.includes(key)) state.fatigue.push(key);
    }
    state.hp = Math.max(0, state.hp - damage);
    lines.push({ label: `首领伤害 +${damage}`, deltas: {}, note: `血池 ${state.hp} / ${state.max}${used ? ` · 已用补给「${RAID_SUPPLIES[used].name}」` : ''}` });
    if (state.hp <= 0) {
      const tier = state.tier;
      const week = ctx.week;
      if (week.playRewards < EVENT_WEEKLY_PLAY_REWARD_CAP.raidBoss) {
        const mats: MaterialDelta = { ingots: { epic: 2, ...(tier >= 3 ? { legendary: 1 } : {}) } };
        const glory = 30 + 20 * tier;
        earn(ctx.save, { glory });
        earnMaterials(ctx.save, mats);
        week.playRewards += 1;
        lines.push({ label: `讨伐成功 · 第 ${tier} 阶首领倒下！`, deltas: { glory }, mats, note: '全员疲劳解除，下一只首领血更厚' });
      } else {
        lines.push({ label: `讨伐成功 · 第 ${tier} 阶首领倒下！`, deltas: {}, note: '本周讨伐奖励已领满，积分与印记仍正常获得' });
      }
      lines.push(...rewardRaidHighTier(ctx.save, ctx.week, raidTierLevel(tier), tier));
      state.slain += 1;
      state.tier += 1;
      spawnBoss(state, ctx.weekStart);
      lines.push({ label: `新首领：${RAID_ARCHETYPES[state.archetype].name}`, deltas: {}, note: RAID_ARCHETYPES[state.archetype].desc });
    } else {
      const phaseAfter = raidPhaseOf(state.hp, state.max);
      if (phaseAfter !== phaseBefore) {
        state.fatigue = [];
        state.fatiguePhase = phaseAfter;
        lines.push({ label: `首领进入「${RAID_PHASES[phaseAfter]!.name}」阶段`, deltas: {}, note: `${RAID_PHASES[phaseAfter]!.desc} · 全员疲劳解除` });
      } else {
        lines.push({ label: '参战部队进入疲惫', deltas: {}, note: '本阶段再次上场攻击 -40%，换一批部队继续讨伐' });
      }
    }
    offerSupplies(state, ctx.weekStart);
    lines.push({ label: '战术补给已送达', deltas: {}, note: '回到活动页三选一，下一场生效' });
    return lines;
  },

  act(_ctx, state, action) {
    const [verb, arg] = action.split(':');
    if (verb !== 'supply') return fail('INVALID', '未知操作');
    if (!state.offer) return fail('INVALID', '没有待选的补给');
    if (arg === 'skip') { state.offer = null; return { ok: true, message: '放弃了这批补给' }; }
    const pick = state.offer[Number(arg)];
    if (!pick) return fail('INVALID', '无效选项');
    state.supply = pick;
    state.offer = null;
    return { ok: true, message: `已装备补给「${RAID_SUPPLIES[pick].name}」：下一场生效` };
  },

  nextLevel: (_ctx, state) => raidTierLevel(state.tier),

  summary(_ctx, state) {
    const phase = raidPhaseOf(state.hp, state.max);
    return `第 ${state.tier} 阶 ${RAID_ARCHETYPES[state.archetype].name} · ${RAID_PHASES[phase]!.name} · 首领 ${state.max ? Math.round((state.hp / state.max) * 100) : 100}%`;
  },
};
