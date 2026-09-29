/**
 * 突袭首领 · 阶段血池 + 轮换出战（2026-09-29 重做）。
 *
 * 与其它活动的区别在于「同一个目标反复打，比的是阵容深度」：
 *  - 一只固定首领 + 护卫，血池跨战斗保留（胜败都计伤害），见底 = 讨伐，刷新更强的下一阶；
 *  - 血池分三阶段：傲慢（>66%，首领护甲 +40%）→ 狂怒（33~66%，攻击 +30%）→ 绝境（≤33%，攻击 +50%，
 *    护卫 +20% 并增派一名精英）——每次跨阶段都是不同的打法；
 *  - 战损疲劳：参战过的部队在本阶段内「疲惫」，再次上场攻击 -40%；跨阶段或讨伐后解除——
 *    逼玩家轮换整个收藏，而不是一套队伍打到底；主角不疲劳；
 *  - 每周破绽色：法力色含破绽色的部队攻击 +30%，按破绽色配队能显著加快讨伐。
 */
import { KINGDOM_ORDER, kingdomTroopPool } from '../../data/kingdoms';
import { fnv1a32 } from '../../data/hash';
import { EVENT_DIFFICULTY, EVENT_RAID_POOL_POINTS, EVENT_WEEKLY_PLAY_REWARD_CAP } from '../../data/events';
import { enemyLevel } from '../../data/enemyDifficulty';
import { getTroopById } from '../../../data/troops';
import { BaseColor } from '../../../engine/types';
import { STAT_LIMITS } from '../../../session/validateRequest';
import type { MaterialDelta } from '../../data/materials';
import { earn, earnMaterials } from '../wallet';
import { pickEnemies, type EncounterEnemy, type EncounterPlan } from '../encounter';
import type { BattleResult } from '../../../session/contract';
import {
  EVENT_POINTS_CAP, buffSnapshot, int, isObj, memberKey, rngOf, str, strArr,
  type EventModeImpl, type EventProgressLine,
} from './common';

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
}

export const RAID_PHASES = [
  { name: '傲慢', desc: '首领护甲 +40%' },
  { name: '狂怒', desc: '首领攻击 +30%' },
  { name: '绝境', desc: '首领攻击 +50%，护卫 +20%，增派一名精英' },
] as const;

export const RAID_FATIGUE_ATTACK = -0.4;
export const RAID_WEAKNESS_ATTACK = 0.3;
const COLORS = Object.values(BaseColor) as BaseColor[];

/** 本周破绽色（每周确定） */
export function raidWeakColor(weekStart: number): BaseColor {
  return COLORS[fnv1a32(`raid-weak-${weekStart >>> 0}`) % COLORS.length]!;
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
}

function bossDamage(state: RaidState, plan: EncounterPlan, result: BattleResult): number {
  const boss = result.combatants.find((c) => c.side === 'enemy' && c.externalId === `e0-${plan.enemies[0]?.troopId}`);
  const start = plan.source.kind === 'event' ? plan.source.bossStartHp ?? state.hp : state.hp;
  return boss ? Math.max(0, Math.min(start, start - Math.max(0, boss.hp))) : 0;
}

export const raidMode: EventModeImpl<RaidState> = {
  init(ctx) {
    const state: RaidState = { v: 1, tier: 1, kingdom: '', lineup: [], hp: 0, max: 0, slain: 0, fatigue: [], fatiguePhase: 0, bestHit: 0, attempts: 0 };
    spawnBoss(state, ctx.weekStart);
    return state;
  },

  sanitize(raw) {
    if (!isObj(raw) || raw.v !== 1) return null;
    const lineup = (Array.isArray(raw.lineup) ? raw.lineup : []).filter((n): n is number => Number.isInteger(n) && !!getTroopById(n));
    if (lineup.length < 3) return null;
    const max = int(raw.max, 0, 1, STAT_LIMITS.hp.max);
    return {
      v: 1, tier: int(raw.tier, 1, 1), kingdom: str(raw.kingdom, KINGDOM_ORDER[0]!), lineup,
      hp: int(raw.hp, max, 0, max), max, slain: int(raw.slain, 0, 0), fatigue: strArr(raw.fatigue),
      fatiguePhase: int(raw.fatiguePhase, 0, 0, 2), bestHit: int(raw.bestHit, 0, 0), attempts: int(raw.attempts, 0, 0),
    };
  },

  plan(_ctx, state) {
    const phase = raidPhaseOf(state.hp, state.max);
    const level = raidTierLevel(state.tier);
    const count = phase === 2 ? 4 : 3;
    const enemies: EncounterEnemy[] = state.lineup.slice(0, count).map((troopId, i) => ({
      troopId, level, tier: i === 0 ? 'boss' : 'elite', traitCount: 3,
    }));
    return { kingdom: state.kingdom, enemies, choice: `phase:${phase}` };
  },

  modify(ctx, state, outcome) {
    const phase = raidPhaseOf(state.hp, state.max);
    const weak = raidWeakColor(ctx.weekStart);
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
      } else if (phase === 2) {
        buffSnapshot(snap, { attackPct: 0.2, armorPct: 0.2, hpPct: 0.2 });
      }
    });
  },

  points(_ctx, state, plan, result) {
    return raidPointsFor(bossDamage(state, plan, result), state.max);
  },

  progress(ctx, state, plan, result) {
    const lines: EventProgressLine[] = [];
    const damage = bossDamage(state, plan, result);
    const phaseBefore = raidPhaseOf(state.hp, state.max);
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
    lines.push({ label: `首领伤害 +${damage}`, deltas: {}, note: `血池 ${state.hp} / ${state.max}` });
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
      state.slain += 1;
      state.tier += 1;
      spawnBoss(state, ctx.weekStart);
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
    return lines;
  },

  nextLevel: (_ctx, state) => raidTierLevel(state.tier),

  summary(_ctx, state) {
    const phase = raidPhaseOf(state.hp, state.max);
    return `第 ${state.tier} 阶 · ${RAID_PHASES[phase]!.name} · 首领 ${state.max ? Math.round((state.hp / state.max) * 100) : 100}%`;
  },
};
