/**
 * 入侵 · 三路兵线防守（2026-09-29 重做）。
 *
 * 敌军分多支兵团沿山道 / 河谷 / 平原三路压向王都。每一场战斗 = 截击其中一支：
 *  - 截击成功，该兵团被歼灭；无论胜败，**其余兵团都向王都推进一步**；
 *  - 兵团抵达王都会劫掠城防（掠袭骑 -1，攻城锤 / 督军 -2）；城防归零 = 城破，本波重来；
 *  - 三类兵团：掠袭骑（快、弱）、攻城锤（慢、每两场才动一步、强）、督军（首领带队，
 *    同路兵团攻击 +15%）；
 *  - 远距截击「先机」：敌人以 85% 生命开战且积分 +20；城下决战「背水」：全队护甲 +8；
 *  - 本波全部歼灭 = 守土成功（周额内发守土奖励），城防回满，下一波更多更强。
 * 核心决策：先打眼前的快骑，还是先拔掉远处的攻城锤与督军。
 */
import { kingdomTroopPool, KINGDOM_ORDER } from '../../data/kingdoms';
import { fnv1a32 } from '../../data/hash';
import { EVENT_DEFENSE_REWARD, EVENT_WEEKLY_PLAY_REWARD_CAP } from '../../data/events';
import { getTroopById } from '../../../data/troops';
import type { MaterialDelta } from '../../data/materials';
import { fail } from '../../types';
import { earn, earnMaterials } from '../wallet';
import { repairLegacyRandomEnemyRoster, pickEnemies, type EnemyTier, type EncounterEnemy } from '../encounter';
import { SPECIAL_INFO, applySpecialEncounter, specialEncounterPlan } from '../specialEncounters';
import {
  EVENT_BASE_LEVEL, EVENT_POINTS_CAP, addRules, buffSnapshot, injectTraits, protectEventBoss, int, isObj, pickN, rngOf, strArr,
  type EventModeImpl, type EventProgressLine, type ModeCtx,
} from './common';

export type SquadKind = 'raider' | 'siege' | 'warlord' | 'shaman' | 'caravan';

export interface Squad {
  id: number;
  lane: number;
  /** 离王都的步数（0 = 已抵达） */
  dist: number;
  kind: SquadKind;
  troops: number[];
}

export interface InvasionState {
  v: 1;
  wave: number;
  city: number;
  squads: Squad[];
  nextId: number;
  /** 本波已进行的战斗数（攻城锤按奇偶步进） */
  tick: number;
  repelled: number;
  fallen: number;
  /** 城防点（每胜 +1，守土 +2） */
  defense: number;
  /** 已建城防（本周永久） */
  built: DefenseId[];
  /** 可重复购置的战备补给：每场消耗一份 */
  readiness: number;
}

export type DefenseId = 'arrow' | 'oil' | 'catapult' | 'wall' | 'chapel';

export const DEFENSES: Record<DefenseId, { name: string; desc: string; cost: number; icon: string }> = {
  arrow: { name: '箭塔', desc: '开局冻结第一名敌人 3 回合', cost: 2, icon: 'status:frozen' },
  oil: { name: '油锅', desc: '开局把 3 颗红色宝石变成燃烧宝石', cost: 2, icon: 'gem:status/burningGem' },
  catapult: { name: '投石机', desc: '开局把 2 颗棕色宝石变成炸弹', cost: 2, icon: 'gem:special/bomb' },
  wall: { name: '城墙', desc: '全队护甲 +6', cost: 3, icon: 'relic-iron_bulwark' },
  chapel: { name: '圣堂', desc: '回合开始 20% 几率创造屏障宝石', cost: 3, icon: 'gem:status/barrierGem' },
};

/** 城门坚守的回合数 */
export const INVASION_HOLD_TURNS = 7;

export const INVASION_LANES = ['山道', '河谷', '平原'] as const;
export const INVASION_CITY_MAX = 3;
export const INVASION_MAX_DIST = 4;
export const INVASION_READINESS_MAX = 3;

export const SQUAD_INFO: Record<SquadKind, { name: string; desc: string; damage: number; tiers: EnemyTier[]; levelBonus: number }> = {
  raider: { name: '掠袭骑', desc: '每场推进 1 步，抵达王都城防 -1', damage: 1, tiers: ['minion', 'minion', 'minion'], levelBonus: 0 },
  siege: { name: '攻城锤', desc: '每两场推进 1 步，抵达王都城防 -2', damage: 2, tiers: ['elite', 'elite', 'minion'], levelBonus: 2 },
  warlord: { name: '督军', desc: '每场推进 1 步，同路兵团攻击 +15%，抵达王都城防 -2', damage: 2, tiers: ['boss', 'elite', 'minion'], levelBonus: 4 },
  shaman: { name: '萨满团', desc: '每场推进 1 步，每回合为全队补 2 法力并制造诅咒宝石，抵达王都城防 -1', damage: 1, tiers: ['elite', 'minion', 'minion'], levelBonus: 1 },
  caravan: { name: '辎重队', desc: '满载宝物的地精车队，两步后离开地图——截住它！', damage: 0, tiers: ['minion', 'elite', 'elite'], levelBonus: 0 },
};

/** 兵团特质（敌方）：lead = 队首，all = 全员 */
const SQUAD_TRAITS: Partial<Record<SquadKind, { code: string; on: 'lead' | 'all' }[]>> = {
  raider: [{ code: 'ev_inv_raider', on: 'all' }],
  siege: [{ code: 'ev_inv_ram', on: 'all' }],
  warlord: [{ code: 'ev_inv_warlord', on: 'lead' }],
  shaman: [{ code: 'ev_inv_shaman', on: 'lead' }],
};

export const SQUAD_TRAIT_DESC: Partial<Record<SquadKind, string>> = {
  raider: '15% 闪避骷髅',
  siege: '骷髅伤害 -20%，身亡留下 2 颗炸弹',
  warlord: '开局屏障，盟友身亡时攻击 +3',
  shaman: '每回合全队 +2 法力，35% 制造诅咒宝石',
  caravan: SPECIAL_INFO.gnomeParty.blurb,
};

function caravanPlan(ctx: ModeCtx, state: InvasionState, squad: { id: number }) {
  return specialEncounterPlan('gnomeParty', kingdomOf(ctx), invasionSquadLevel(state.wave, 'caravan'), rngOf(fnv1a32(`inv-caravan-${ctx.weekStart}-${squad.id}`)), state.wave >= 3 ? 1 : 0);
}

/** 第 wave 波的兵团编成 */
function waveComposition(wave: number): SquadKind[] {
  if (wave <= 1) return ['raider', 'raider', 'siege'];
  if (wave === 2) return ['raider', 'raider', 'siege', 'warlord'];
  return (['raider', 'raider', 'siege', 'warlord', 'raider', 'siege'] as SquadKind[]).slice(0, Math.min(6, 3 + Math.ceil(wave / 2)));
}

/** 兵团基础等级：每波 +4 级（第 8 波起按 +3 继续上浮） */
export function invasionSquadLevel(wave: number, kind: SquadKind): number {
  const w = Math.max(1, wave);
  const base = w <= 7 ? EVENT_BASE_LEVEL + (w - 1) * 4 : EVENT_BASE_LEVEL + 24 + (w - 7) * 3;
  return base + SQUAD_INFO[kind].levelBonus;
}

function kingdomOf(ctx: ModeCtx): string {
  const k = ctx.theme.kingdom ?? KINGDOM_ORDER[0]!;
  return kingdomTroopPool(k).length ? k : KINGDOM_ORDER[0]!;
}

function spawnWave(ctx: ModeCtx, state: InvasionState): void {
  const rng = rngOf(fnv1a32(`inv-wave-${ctx.weekStart}-${state.wave}-${state.fallen}`));
  const kingdom = kingdomOf(ctx);
  const kinds = waveComposition(state.wave);
  // 三路轮流分配（每 3 支一轮随机排列），兵力摊开到三条路上
  const lanes: number[] = [];
  while (lanes.length < kinds.length) lanes.push(...pickN(rng, [0, 1, 2], 3));
  // 第 2 波起：萨满团替换一支掠袭骑；50% 出现辎重队
  if (state.wave >= 2) {
    const r = kinds.indexOf('raider');
    if (r >= 0 && rng.next() < 0.6) kinds[r] = 'shaman';
    if (rng.next() < 0.5) kinds.push('caravan');
  }
  while (lanes.length < kinds.length) lanes.push(...pickN(rng, [0, 1, 2], 3));
  state.squads = kinds.map((kind, i) => {
    const lane = lanes[i]!;
    const dist = kind === 'raider' || kind === 'shaman' ? 3 : kind === 'caravan' ? 2 : INVASION_MAX_DIST;
    const id = state.nextId++;
    const troops = kind === 'caravan'
      ? caravanPlan(ctx, state, { id }).enemies.map((e) => e.troopId)
      : pickEnemies(kingdom, invasionSquadLevel(state.wave, kind), SQUAD_INFO[kind].tiers, rng).map((e) => e.troopId);
    return { id, lane, dist, kind, troops };
  });
  state.tick = 0;
  state.city = INVASION_CITY_MAX;
}

function squadOf(state: InvasionState, action: string | undefined): Squad | undefined {
  const m = action?.match(/^(?:squad|hold):(\d+)$/);
  return m ? state.squads.find((s) => s.id === Number(m[1])) : undefined;
}

const isHold = (action: string | undefined): boolean => !!action?.startsWith('hold:');
const isDefense = (v: unknown): v is DefenseId => typeof v === 'string' && v in DEFENSES;

/** 该兵团可以城门坚守（兵临城下、非辎重队） */
export function squadHoldable(squad: Squad): boolean {
  return squad.dist <= 1 && squad.kind !== 'caravan';
}

/** 该兵团受督军鼓舞（同路存在另一支督军） */
export function squadInspired(state: InvasionState, squad: Squad): boolean {
  return squad.kind !== 'warlord' && state.squads.some((s) => s.kind === 'warlord' && s.lane === squad.lane);
}

export const invasionMode: EventModeImpl<InvasionState> = {
  init(ctx) {
    const state: InvasionState = { v: 1, wave: 1, city: INVASION_CITY_MAX, squads: [], nextId: 1, tick: 0, repelled: 0, fallen: 0, defense: 0, built: [], readiness: 0 };
    spawnWave(ctx, state);
    return state;
  },

  sanitize(raw) {
    if (!isObj(raw) || raw.v !== 1 || !Array.isArray(raw.squads)) return null;
    const squads: Squad[] = [];
    for (const s of raw.squads) {
      if (!isObj(s) || !(typeof s.kind === 'string' && s.kind in SQUAD_INFO)) return null;
      const troops = (Array.isArray(s.troops) ? s.troops : []).filter((n): n is number => Number.isInteger(n) && !!getTroopById(n));
      if (troops.length === 0) return null;
      squads.push({ id: int(s.id, 0, 0), lane: int(s.lane, 0, 0, 2), dist: int(s.dist, 1, 1, INVASION_MAX_DIST), kind: s.kind as SquadKind, troops: repairLegacyRandomEnemyRoster(troops, fnv1a32(`inv-legacy-${s.id}-${raw.wave}`)) });
    }
    return {
      v: 1, wave: int(raw.wave, 1, 1), city: int(raw.city, INVASION_CITY_MAX, 1, INVASION_CITY_MAX), squads,
      nextId: int(raw.nextId, squads.length + 1, 1), tick: int(raw.tick, 0, 0), repelled: int(raw.repelled, 0, 0), fallen: int(raw.fallen, 0, 0),
      defense: int(raw.defense, 0, 0), built: strArr(raw.built).filter(isDefense), readiness: int(raw.readiness, 0, 0, INVASION_READINESS_MAX),
    };
  },

  ready(_ctx, state, action) {
    if (isHold(action)) {
      const squad = squadOf(state, action);
      if (!squad || !squadHoldable(squad)) return '只有兵临城下（距王都 1 步）的兵团可以城门坚守';
    }
    return null;
  },

  plan(ctx, state, _seed, action) {
    const squad = squadOf(state, action) ?? (action === undefined ? [...state.squads].sort((a, b) => a.dist - b.dist)[0] : undefined);
    if (!squad) return fail('INVALID', '请先在兵线图上选择要截击的兵团');
    if (isHold(action) && !squadHoldable(squad)) return fail('INVALID', '该兵团还没兵临城下');
    if (squad.kind === 'caravan') {
      const sp = caravanPlan(ctx, state, squad);
      return { kingdom: kingdomOf(ctx), enemies: sp.enemies, choice: `squad:${squad.id}`, bonus: sp.bonus };
    }
    const level = invasionSquadLevel(state.wave, squad.kind);
    const enemies: EncounterEnemy[] = squad.troops.map((troopId, i) => ({ troopId, level, tier: SQUAD_INFO[squad.kind].tiers[i] ?? 'minion' }));
    return { kingdom: kingdomOf(ctx), enemies, choice: `${isHold(action) ? 'hold' : 'squad'}:${squad.id}` };
  },

  modify(_ctx, state, outcome) {
    const choice = outcome.plan.source.kind === 'event' ? outcome.plan.source.choice : undefined;
    const squad = squadOf(state, choice);
    if (!squad) return;
    const req = outcome.request;
    const far = squad.dist >= 3;
    const gates = squad.dist <= 1;
    const inspired = squadInspired(state, squad);
    for (const snap of req.enemyTeam) {
      snap.eventTarget = 'tower';
      if (inspired) buffSnapshot(snap, { attackPct: 0.15 });
      if (far) snap.initialHp = Math.max(1, Math.round(snap.stats.hp * 0.85));
    }
    if (gates) for (const snap of req.playerTeam) buffSnapshot(snap, { armor: 8 });
    // 兵团特质 / 辎重队遭遇
    if (squad.kind === 'warlord') protectEventBoss(req.enemyTeam[0]);
    if (squad.kind === 'caravan') applySpecialEncounter('gnomeParty', outcome);
    else injectTraits(req.enemyTeam, SQUAD_TRAITS[squad.kind] ?? []);
    if (squad.kind === 'shaman') addRules(outcome, { turnStart: [{ side: 'enemy', mana: { amount: 2 } }] });
    // 战备补给在下一场入侵战斗生效，战后消耗。
    if (state.readiness > 0) for (const snap of req.playerTeam) buffSnapshot(snap, { armor: 4, attack: 2 });
    // 城防建设
    for (const id of state.built) {
      if (id === 'wall') for (const snap of req.playerTeam) buffSnapshot(snap, { armor: 6 });
      else injectTraits(req.playerTeam, [{ code: `ev_def_${id}`, on: 'lead' }]);
    }
    // 城门坚守：守住 N 回合即胜
    if (isHold(choice)) addRules(outcome, { turnLimit: { turns: INVASION_HOLD_TURNS, onExpire: 'playerWins' } });
  },

  points(_ctx, state, plan, _result, victory) {
    if (!victory) return 0;
    const squad = squadOf(state, plan.source.kind === 'event' ? plan.source.choice : undefined);
    return Math.min(EVENT_POINTS_CAP, 100 + (squad && squad.dist >= 3 ? 20 : 0));
  },

  progress(ctx, state, plan, _result, victory) {
    const lines: EventProgressLine[] = [];
    const target = squadOf(state, plan.source.kind === 'event' ? plan.source.choice : undefined);
    if (!target) return lines;
    const held = isHold(plan.source.kind === 'event' ? plan.source.choice : undefined);
    if (state.readiness > 0) state.readiness -= 1;
    if (victory) {
      state.defense += 1;
      if (held) {
        target.dist = INVASION_MAX_DIST;
        lines.push({ label: `城门坚守成功 · ${SQUAD_INFO[target.kind].name}被击退`, deltas: {}, note: `退回 ${INVASION_MAX_DIST} 步外 · 城防点 +1` });
      } else {
        state.squads = state.squads.filter((s) => s.id !== target.id);
        lines.push({ label: `歼灭${INVASION_LANES[target.lane]}的${SQUAD_INFO[target.kind].name}`, deltas: {}, note: `${target.dist >= 3 ? '远距截击 · 先机 · ' : ''}城防点 +1` });
      }
    } else {
      lines.push({ label: `截击${SQUAD_INFO[target.kind].name}失败`, deltas: {}, note: '兵团仍在原地' });
    }
    // 其余兵团推进
    state.tick += 1;
    const raided: string[] = [];
    for (const s of state.squads) {
      if ((!victory || held) && s.id === target.id) continue;
      if (s.kind === 'siege' && state.tick % 2 === 1) continue;
      s.dist -= 1;
      if (s.dist <= 0) {
        if (s.kind === 'caravan') { raided.push('辎重队带着宝物离开了战场'); continue; }
        state.city -= SQUAD_INFO[s.kind].damage;
        raided.push(`${SQUAD_INFO[s.kind].name}劫掠王都（城防 -${SQUAD_INFO[s.kind].damage}）`);
      }
    }
    state.squads = state.squads.filter((s) => s.dist > 0);
    for (const r of raided) lines.push({ label: r, deltas: {} });

    if (state.city <= 0) {
      state.fallen += 1;
      lines.push({ label: '王都失守！', deltas: {}, note: `第 ${state.wave} 波重新来袭，城防回满` });
      spawnWave(ctx, state);
      return lines;
    }
    if (state.squads.every((s) => s.kind === 'caravan')) {
      state.squads = [];
      state.repelled += 1;
      state.defense += 2;
      const week = ctx.week;
      if (week.playRewards < EVENT_WEEKLY_PLAY_REWARD_CAP.invasion) {
        const mats: MaterialDelta = { traitstones: { 'runic:red': 4, 'runic:blue': 4 } };
        earn(ctx.save, EVENT_DEFENSE_REWARD);
        earnMaterials(ctx.save, mats);
        week.playRewards += 1;
        lines.push({ label: `守土成功 · 第 ${state.wave} 波击退！`, deltas: { ...EVENT_DEFENSE_REWARD }, mats, note: `城防剩余 ${state.city} / ${INVASION_CITY_MAX}` });
      } else {
        lines.push({ label: `守土成功 · 第 ${state.wave} 波击退！`, deltas: {}, note: '本周守土奖励已领满，积分与印记仍正常获得' });
      }
      state.wave += 1;
      spawnWave(ctx, state);
      lines.push({ label: `第 ${state.wave} 波敌军逼近`, deltas: {}, note: `${state.squads.length} 支兵团 · 敌人更强` });
    } else {
      const next = [...state.squads].sort((a, b) => a.dist - b.dist)[0]!;
      lines.push({ label: `敌军推进 · 城防 ${state.city} / ${INVASION_CITY_MAX}`, deltas: {}, note: `最近的${SQUAD_INFO[next.kind].name}距王都 ${next.dist} 步` });
    }
    return lines;
  },

  act(_ctx, state, action) {
    if (action === 'supply') {
      if (state.readiness >= INVASION_READINESS_MAX) return fail('SOLD_OUT', '战备补给已储满');
      if (state.defense < 2) return fail('INSUFFICIENT', '城防点不足（需要 2）');
      state.defense -= 2;
      state.readiness += 1;
      return { ok: true, message: `战备补给 +1（${state.readiness}/${INVASION_READINESS_MAX}），下一场入侵战斗全队攻击 +2、护甲 +4` };
    }
    if (action === 'repair') {
      if (state.city >= INVASION_CITY_MAX) return fail('SOLD_OUT', '王都城防已满');
      if (state.defense < 2) return fail('INSUFFICIENT', '城防点不足（需要 2）');
      state.defense -= 2;
      state.city += 1;
      return { ok: true, message: `修缮王都：城防 ${state.city}/${INVASION_CITY_MAX}` };
    }
    const m = action.match(/^build:(\w+)$/);
    if (!m) return fail('INVALID', '未知操作');
    const id = m[1];
    if (!isDefense(id)) return fail('INVALID', '未知城防');
    if (state.built.includes(id)) return fail('SOLD_OUT', '该城防已建成');
    const cost = DEFENSES[id].cost;
    if (state.defense < cost) return fail('INSUFFICIENT', `城防点不足（需要 ${cost}）`);
    state.defense -= cost;
    state.built.push(id);
    return { ok: true, message: `建成${DEFENSES[id].name}：${DEFENSES[id].desc}` };
  },

  nextLevel(_ctx, state) {
    const next = [...state.squads].sort((a, b) => a.dist - b.dist)[0];
    return invasionSquadLevel(state.wave, next?.kind ?? 'raider');
  },

  summary: (_ctx, state) => `第 ${state.wave} 波 · 城防 ${state.city}/${INVASION_CITY_MAX} · 敌军 ${state.squads.length} 支`,
};
