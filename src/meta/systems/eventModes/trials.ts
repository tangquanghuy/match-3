/**
 * 职业试炼 · 本周八道规则挑战（2026-09-29 重做）。
 *
 * 每周从挑战池抽 8 道试炼，每道都改写战斗规则（孤身、玻璃大炮、巨人猎手、车轮战、法力潮汐…），
 * 并配 3 个星级目标（胜利 / 主角存活 / 回合数 / 无人阵亡…）。星级只增不减，**新拿到的星**
 * 才给大额积分，所以玩法是「针对规则调整编队、一次拿满三星」，而不是反复刷同一场：
 *  - 积分 = 30（胜利保底）+ 50 × 本场新获得的星数；
 *  - 主角必须出战并装备已解锁职业；职业经验 ×2，本场三星全达成 ×3。
 */
import { fnv1a32 } from '../../data/hash';
import { KINGDOM_ORDER, kingdomTroopPool } from '../../data/kingdoms';
import { BaseColor } from '../../../engine/types';
import type { BattleResult } from '../../../session/contract';
import { fail } from '../../types';
import { pickEnemies, type EnemyTier } from '../encounter';
import {
  EVENT_BASE_LEVEL, addBanner, addMastery, buffSnapshot, int, isObj, pickN, rngOf,
  type EventModeImpl, type ModeCtx,
} from './common';

export type TrialGoal =
  | { kind: 'win' }
  | { kind: 'heroAlive' }
  | { kind: 'heroHp'; pct: number }
  | { kind: 'noLoss' }
  | { kind: 'maxLoss'; n: number }
  | { kind: 'turns'; n: number };

export interface TrialDef {
  id: string;
  name: string;
  rule: string;
  enemies: EnemyTier[];
  goals: [TrialGoal, TrialGoal, TrialGoal];
}

export const TRIAL_POOL: readonly TrialDef[] = [
  { id: 'solo', name: '孤身试炼', rule: '只有主角出战；主角四维 ×1.8', enemies: ['elite', 'minion'],
    goals: [{ kind: 'win' }, { kind: 'heroHp', pct: 0.5 }, { kind: 'turns', n: 12 }] },
  { id: 'duo', name: '双人同行', rule: '主角与编队中第一名部队出战；两人攻击 +30%、生命 +30%', enemies: ['elite', 'minion', 'minion'],
    goals: [{ kind: 'win' }, { kind: 'noLoss' }, { kind: 'turns', n: 14 }] },
  { id: 'glass', name: '玻璃大炮', rule: '全队攻击 +60%，生命上限 -50%', enemies: ['elite', 'elite', 'minion'],
    goals: [{ kind: 'win' }, { kind: 'maxLoss', n: 1 }, { kind: 'turns', n: 10 }] },
  { id: 'fortress', name: '铁壁阵线', rule: '全队护甲 +25，攻击 -40%', enemies: ['elite', 'elite', 'minion'],
    goals: [{ kind: 'win' }, { kind: 'heroAlive' }, { kind: 'noLoss' }] },
  { id: 'tide', name: '法力潮汐', rule: '双方匹配任意颜色宝石时法力 +2', enemies: ['elite', 'elite', 'minion'],
    goals: [{ kind: 'win' }, { kind: 'noLoss' }, { kind: 'turns', n: 10 }] },
  { id: 'giant', name: '巨人猎手', rule: '敌方只有一名首领，但四维 ×2.5', enemies: ['boss'],
    goals: [{ kind: 'win' }, { kind: 'heroAlive' }, { kind: 'turns', n: 12 }] },
  { id: 'horde', name: '车轮战', rule: '敌方四名精英轮番上阵', enemies: ['elite', 'elite', 'elite', 'elite'],
    goals: [{ kind: 'win' }, { kind: 'heroAlive' }, { kind: 'maxLoss', n: 1 }] },
  { id: 'bleed', name: '背水一战', rule: '我方以 50% 生命开战，攻击 +30%', enemies: ['elite', 'minion', 'minion'],
    goals: [{ kind: 'win' }, { kind: 'noLoss' }, { kind: 'heroHp', pct: 0.3 }] },
  { id: 'surge', name: '涌动之潮', rule: '我方全色法力精通 +100（3 消半数翻倍）；敌方攻击 +30%', enemies: ['elite', 'elite', 'minion'],
    goals: [{ kind: 'win' }, { kind: 'heroAlive' }, { kind: 'turns', n: 12 }] },
  { id: 'path', name: '职业之道', rule: '主角攻击 +12、魔法 +10；部队攻击 -25%', enemies: ['elite', 'elite', 'minion'],
    goals: [{ kind: 'win' }, { kind: 'heroAlive' }, { kind: 'heroHp', pct: 0.5 }] },
];

export const TRIALS_PER_WEEK = 8;
export const TRIAL_STAR_POINTS = 50;
export const TRIAL_WIN_POINTS = 30;
export const TRIAL_POINTS_CAP = 240;

export interface TrialsState {
  v: 1;
  /** 本周 8 道试炼（TRIAL_POOL id，顺序 = 难度递增） */
  trials: string[];
  /** 试炼 id → 已达成星位（三位布尔） */
  stars: Record<string, [boolean, boolean, boolean]>;
  attempts: number;
  /** 最近一场的新星数（结算 → 职业经验倍率用） */
  lastPerfect: boolean;
}

export function goalText(g: TrialGoal): string {
  switch (g.kind) {
    case 'win': return '获得胜利';
    case 'heroAlive': return '主角存活';
    case 'heroHp': return `主角剩余生命 ≥ ${Math.round(g.pct * 100)}%`;
    case 'noLoss': return '无人阵亡';
    case 'maxLoss': return `阵亡不超过 ${g.n} 名`;
    case 'turns': return `${g.n} 回合内获胜`;
  }
}

export function trialById(id: string): TrialDef | undefined {
  return TRIAL_POOL.find((t) => t.id === id);
}

export function trialLevel(index: number): number {
  return EVENT_BASE_LEVEL + index * 4;
}

/** 按战果判定三星（败场全灭） */
export function evaluateGoals(def: TrialDef, result: BattleResult): [boolean, boolean, boolean] {
  const victory = result.winner === 'player';
  const players = result.combatants.filter((c) => c.side === 'player');
  const hero = players.find((c) => c.externalId.endsWith('-hero'));
  const lost = players.filter((c) => c.defeated || c.hp <= 0).length;
  const check = (g: TrialGoal): boolean => {
    if (!victory) return false;
    switch (g.kind) {
      case 'win': return true;
      case 'heroAlive': return !!hero && !hero.defeated && hero.hp > 0;
      case 'heroHp': return !!hero && hero.maxHp > 0 && hero.hp / hero.maxHp >= g.pct;
      case 'noLoss': return lost === 0;
      case 'maxLoss': return lost <= g.n;
      case 'turns': return result.turns <= g.n;
    }
  };
  return [check(def.goals[0]), check(def.goals[1]), check(def.goals[2])];
}

function trialOf(state: TrialsState, action: string | undefined): { def: TrialDef; index: number } | null {
  const id = action?.match(/^trial:(\w+)$/)?.[1] ?? (action === undefined ? state.trials.find((t) => !(state.stars[t] ?? []).every(Boolean)) ?? state.trials[0] : undefined);
  const index = id ? state.trials.indexOf(id) : -1;
  const def = id ? trialById(id) : undefined;
  return def && index >= 0 ? { def, index } : null;
}

export function trialStarCount(state: TrialsState): number {
  return Object.values(state.stars).reduce((n, s) => n + s.filter(Boolean).length, 0);
}

export const trialsMode: EventModeImpl<TrialsState> = {
  init(ctx) {
    const rng = rngOf(fnv1a32(`trials-${ctx.weekStart >>> 0}`));
    return { v: 1, trials: pickN(rng, TRIAL_POOL.map((t) => t.id), TRIALS_PER_WEEK), stars: {}, attempts: 0, lastPerfect: false };
  },

  sanitize(raw, ctx) {
    if (!isObj(raw) || raw.v !== 1) return null;
    const base = trialsMode.init(ctx);
    const stars: TrialsState['stars'] = {};
    if (isObj(raw.stars)) {
      for (const [id, s] of Object.entries(raw.stars)) {
        if (base.trials.includes(id) && Array.isArray(s)) stars[id] = [s[0] === true, s[1] === true, s[2] === true];
      }
    }
    return { v: 1, trials: base.trials, stars, attempts: int(raw.attempts, 0, 0), lastPerfect: raw.lastPerfect === true };
  },

  plan(_ctx: ModeCtx, state, seed, action) {
    const t = trialOf(state, action);
    if (!t) return fail('INVALID', '请选择一道试炼');
    const rng = rngOf(seed);
    let kingdom = KINGDOM_ORDER[fnv1a32(`trial-k-${t.def.id}`) % KINGDOM_ORDER.length]!;
    if (kingdomTroopPool(kingdom).length === 0) kingdom = KINGDOM_ORDER[0]!;
    const enemies = pickEnemies(kingdom, trialLevel(t.index), t.def.enemies, rng)
      .map((e) => (t.def.id === 'giant' ? { ...e, statMultiplier: 2.5 } : e));
    return { kingdom, enemies, choice: `trial:${t.def.id}` };
  },

  modify(_ctx, state, outcome) {
    const t = trialOf(state, outcome.plan.source.kind === 'event' ? outcome.plan.source.choice : undefined);
    if (!t) return;
    const req = outcome.request;
    const isHero = (id: string): boolean => id.endsWith('-hero');
    const all = Object.values(BaseColor) as BaseColor[];
    switch (t.def.id) {
      case 'solo':
        req.playerTeam = req.playerTeam.filter((s) => isHero(s.externalId));
        for (const s of req.playerTeam) buffSnapshot(s, { attackPct: 0.8, armorPct: 0.8, hpPct: 0.8, magicPct: 0.8 });
        break;
      case 'duo': {
        const troop = req.playerTeam.find((s) => !isHero(s.externalId));
        req.playerTeam = req.playerTeam.filter((s) => isHero(s.externalId) || s === troop);
        for (const s of req.playerTeam) buffSnapshot(s, { attackPct: 0.3, hpPct: 0.3 });
        break;
      }
      case 'glass': for (const s of req.playerTeam) buffSnapshot(s, { attackPct: 0.6, hpPct: -0.5 }); break;
      case 'fortress': for (const s of req.playerTeam) { buffSnapshot(s, { armor: 25 }); buffSnapshot(s, { attackPct: -0.4 }); } break;
      case 'tide': {
        const boosts = Object.fromEntries(all.map((c) => [c, 2]));
        addBanner(outcome, boosts);
        addBanner(outcome, boosts, 'enemy');
        break;
      }
      case 'bleed': for (const s of req.playerTeam) { buffSnapshot(s, { attackPct: 0.3 }); s.initialHp = Math.max(1, Math.round((s.initialHp ?? s.stats.hp) * 0.5)); } break;
      case 'surge':
        addMastery(outcome, all, 100);
        for (const s of req.enemyTeam) buffSnapshot(s, { attackPct: 0.3 });
        break;
      case 'path':
        for (const s of req.playerTeam) {
          if (isHero(s.externalId)) buffSnapshot(s, { attack: 12, magic: 10 });
          else buffSnapshot(s, { attackPct: -0.25 });
        }
        break;
      default: break;
    }
  },

  ready(_ctx, state, action) {
    return trialOf(state, action) ? null : '请选择一道试炼';
  },

  points(_ctx, state, plan, result, victory) {
    if (!victory) return 0;
    const t = trialOf(state, plan.source.kind === 'event' ? plan.source.choice : undefined);
    if (!t) return 0;
    const got = evaluateGoals(t.def, result);
    const before = state.stars[t.def.id] ?? [false, false, false];
    const fresh = got.filter((g, i) => g && !before[i]).length;
    return Math.min(TRIAL_POINTS_CAP, TRIAL_WIN_POINTS + TRIAL_STAR_POINTS * fresh);
  },

  progress(_ctx, state, plan, result) {
    const t = trialOf(state, plan.source.kind === 'event' ? plan.source.choice : undefined);
    if (!t) return [];
    state.attempts += 1;
    const got = evaluateGoals(t.def, result);
    const before = state.stars[t.def.id] ?? [false, false, false];
    state.stars[t.def.id] = [before[0] || got[0], before[1] || got[1], before[2] || got[2]];
    state.lastPerfect = got.every(Boolean);
    const fresh = got.filter((g, i) => g && !before[i]).length;
    return [{
      label: `${t.def.name} · ${got.filter(Boolean).length} 星`,
      deltas: {},
      note: t.def.goals.map((g, i) => `${got[i] ? '★' : '☆'}${goalText(g)}`).join('  ') + (fresh ? ` · 新星 +${fresh}` : ''),
    }];
  },

  nextLevel(_ctx, state) {
    const t = trialOf(state, undefined);
    return trialLevel(t?.index ?? 0);
  },

  summary: (_ctx, state) => `星级 ${trialStarCount(state)} / ${TRIALS_PER_WEEK * 3} · 已挑战 ${state.attempts} 次`,
};
