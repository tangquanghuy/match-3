/**
 * 阵营突袭 · 领地征服（2026-09-29 重做）。
 *
 * 本周目标王国的领土是一张 4×3 的地块图，从西侧边境向东推进，攻陷王城为一轮：
 *  - 只能进攻边境列或与己方地块相邻的敌方地块；
 *  - 每块地都有特性，占领后给之后**所有**阵营突袭战斗叠加战区加成（军营 +攻击、城塞 +护甲、
 *    粮仓 +生命、圣坛 +法力精通、瞭望塔让敌人残血开战、村落 +少量生命）；
 *  - 敌军每 4 场战斗发动一次反扑，夺回一块与敌占区接壤的己方地块——拖得越久丢得越多；
 *  - 王城只向「内应」开门：出战队伍中至少 2 名目标王国部队才能进攻；
 *  - 编入目标王国部队仍有阵营加成（每名全队攻击 +2 / 生命 +10）。
 * 核心决策：绕路吃加成，还是直取王城。
 */
import { KINGDOM_ORDER, kingdomTroopPool } from '../../data/kingdoms';
import { fnv1a32 } from '../../data/hash';
import { EVENT_WEEKLY_PLAY_REWARD_CAP } from '../../data/events';
import { getTroopById } from '../../../data/troops';
import { BaseColor } from '../../../engine/types';
import type { MaterialDelta } from '../../data/materials';
import { fail } from '../../types';
import { earn, earnMaterials } from '../wallet';
import { pickEnemies, type EnemyTier } from '../encounter';
import { activeTeam } from '../teamRules';
import {
  EVENT_BASE_LEVEL, EVENT_POINTS_CAP, addMastery, buffSnapshot, int, isObj, pickN, rngOf,
  type EventModeImpl, type EventProgressLine, type ModeCtx,
} from './common';

export type DistrictKind = 'village' | 'barracks' | 'fort' | 'shrine' | 'watchtower' | 'granary' | 'capital';

export interface District {
  x: number;
  y: number;
  kind: DistrictKind;
  owner: 'enemy' | 'player';
}

export interface FactionState {
  v: 1;
  round: number;
  districts: District[];
  /** 距下次反扑剩余战斗数 */
  counterIn: number;
  captures: number;
  conquered: number;
}

export const FACTION_COLS = 4;
export const FACTION_ROWS = 3;
export const FACTION_COUNTER_EVERY = 4;
export const FACTION_CAPITAL_MIN_MATCH = 2;
export const FACTION_BUFF_ATTACK_PER = 2;
export const FACTION_BUFF_HP_PER = 10;

export const DISTRICT_INFO: Record<DistrictKind, { name: string; bonus: string; tiers: EnemyTier[]; levelBonus: number }> = {
  village: { name: '村落', bonus: '全队生命 +4%', tiers: ['elite', 'minion', 'minion'], levelBonus: 0 },
  barracks: { name: '军营', bonus: '全队攻击 +3', tiers: ['elite', 'minion', 'minion', 'minion'], levelBonus: 1 },
  fort: { name: '城塞', bonus: '全队护甲 +5', tiers: ['elite', 'elite', 'minion'], levelBonus: 2 },
  shrine: { name: '圣坛', bonus: '全色法力精通 +20', tiers: ['elite', 'minion', 'minion'], levelBonus: 1 },
  watchtower: { name: '瞭望塔', bonus: '敌人以 90% 生命开战', tiers: ['minion', 'minion', 'minion', 'elite'], levelBonus: 0 },
  granary: { name: '粮仓', bonus: '全队生命 +12%', tiers: ['elite', 'minion', 'minion'], levelBonus: 0 },
  capital: { name: '王城', bonus: '攻陷即完成本轮征服', tiers: ['boss', 'elite', 'elite', 'elite'], levelBonus: 4 },
};

export const FACTION_CAPITAL_REWARD = { glory: 40 } as const;

function kingdomOf(ctx: ModeCtx): string {
  const k = ctx.theme.kingdom ?? KINGDOM_ORDER[0]!;
  return kingdomTroopPool(k).length ? k : KINGDOM_ORDER[0]!;
}

function buildMap(ctx: ModeCtx, round: number): District[] {
  const rng = rngOf(fnv1a32(`faction-map-${ctx.weekStart}-${round}`));
  const kinds = pickN(rng, ['village', 'village', 'village', 'barracks', 'barracks', 'fort', 'fort', 'shrine', 'watchtower', 'granary', 'village'] as DistrictKind[], 11);
  const out: District[] = [];
  for (let x = 0; x < FACTION_COLS; x++) {
    for (let y = 0; y < FACTION_ROWS; y++) {
      const capital = x === FACTION_COLS - 1 && y === 1;
      out.push({ x, y, kind: capital ? 'capital' : kinds.pop()!, owner: 'enemy' });
    }
  }
  return out;
}

const adjacent = (a: District, b: District): boolean => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;

/** 当前可进攻的地块 */
export function factionTargets(state: FactionState): District[] {
  const mine = state.districts.filter((d) => d.owner === 'player');
  return state.districts.filter((d) => d.owner === 'enemy' && (d.x === 0 || mine.some((m) => adjacent(m, d))));
}

function districtOf(state: FactionState, action: string | undefined): District | undefined {
  const m = action?.match(/^tile:(\d)-(\d)$/);
  return m ? state.districts.find((d) => d.x === Number(m[1]) && d.y === Number(m[2])) : undefined;
}

/** 编队中来自目标王国的部队数 */
export function factionMatchCount(save: ModeCtx['save'], kingdom: string): number {
  let match = 0;
  for (const member of activeTeam(save)?.members ?? []) {
    if (member.kind !== 'troop') continue;
    if (getTroopById(member.troopId)?.kingdom === kingdom) match += 1;
  }
  return match;
}

/** 已占领地块汇总出的战区加成 */
export function factionBonuses(state: FactionState): { attack: number; armor: number; hpPct: number; mastery: number; enemyHp: number } {
  const owned = state.districts.filter((d) => d.owner === 'player');
  const n = (k: DistrictKind): number => owned.filter((d) => d.kind === k).length;
  return {
    attack: n('barracks') * 3,
    armor: n('fort') * 5,
    hpPct: n('granary') * 0.12 + n('village') * 0.04,
    mastery: n('shrine') * 20,
    enemyHp: n('watchtower') > 0 ? Math.max(0.7, 1 - 0.1 * n('watchtower')) : 1,
  };
}

export function factionLevel(state: FactionState, d: District): number {
  const owned = state.districts.filter((x) => x.owner === 'player').length;
  return EVENT_BASE_LEVEL + (state.round - 1) * 9 + owned * 2 + DISTRICT_INFO[d.kind].levelBonus + d.x;
}

export const factionMode: EventModeImpl<FactionState> = {
  init(ctx) {
    return { v: 1, round: 1, districts: buildMap(ctx, 1), counterIn: FACTION_COUNTER_EVERY, captures: 0, conquered: 0 };
  },

  sanitize(raw) {
    if (!isObj(raw) || raw.v !== 1 || !Array.isArray(raw.districts) || raw.districts.length !== FACTION_COLS * FACTION_ROWS) return null;
    const districts: District[] = [];
    for (const d of raw.districts) {
      if (!isObj(d) || !(typeof d.kind === 'string' && d.kind in DISTRICT_INFO)) return null;
      districts.push({ x: int(d.x, 0, 0, FACTION_COLS - 1), y: int(d.y, 0, 0, FACTION_ROWS - 1), kind: d.kind as DistrictKind, owner: d.owner === 'player' ? 'player' : 'enemy' });
    }
    return { v: 1, round: int(raw.round, 1, 1), districts, counterIn: int(raw.counterIn, FACTION_COUNTER_EVERY, 1, FACTION_COUNTER_EVERY),
      captures: int(raw.captures, 0, 0), conquered: int(raw.conquered, 0, 0) };
  },

  ready(ctx, state, action) {
    const d = districtOf(state, action);
    if (d?.kind === 'capital' && factionMatchCount(ctx.save, kingdomOf(ctx)) < FACTION_CAPITAL_MIN_MATCH) {
      return `王城只向内应开门：出战队伍需至少 ${FACTION_CAPITAL_MIN_MATCH} 名${kingdomOf(ctx)}部队`;
    }
    return null;
  },

  plan(ctx, state, seed, action) {
    const targets = factionTargets(state);
    const d = districtOf(state, action) ?? (action === undefined ? targets.find((t) => t.kind !== 'capital') : undefined);
    if (!d || !targets.includes(d)) return fail('INVALID', '请在领地图上选择一块可进攻的地块');
    const kingdom = kingdomOf(ctx);
    const enemies = pickEnemies(kingdom, factionLevel(state, d), DISTRICT_INFO[d.kind].tiers, rngOf(seed));
    return { kingdom, enemies, choice: `tile:${d.x}-${d.y}` };
  },

  modify(ctx, state, outcome) {
    const match = factionMatchCount(ctx.save, kingdomOf(ctx));
    const b = factionBonuses(state);
    for (const snap of outcome.request.playerTeam) {
      buffSnapshot(snap, { attack: FACTION_BUFF_ATTACK_PER * match + b.attack, hp: FACTION_BUFF_HP_PER * match, armor: b.armor });
      if (b.hpPct) buffSnapshot(snap, { hpPct: b.hpPct });
    }
    if (b.mastery) addMastery(outcome, Object.values(BaseColor) as BaseColor[], b.mastery);
    if (b.enemyHp < 1) for (const snap of outcome.request.enemyTeam) snap.initialHp = Math.max(1, Math.round(snap.stats.hp * b.enemyHp));
  },

  points(_ctx, state, plan, _result, victory) {
    if (!victory) return 0;
    const d = districtOf(state, plan.source.kind === 'event' ? plan.source.choice : undefined);
    return Math.min(EVENT_POINTS_CAP, d?.kind === 'capital' ? 120 : d?.kind === 'fort' ? 110 : 100);
  },

  progress(ctx, state, plan, _result, victory) {
    const lines: EventProgressLine[] = [];
    const d = districtOf(state, plan.source.kind === 'event' ? plan.source.choice : undefined);
    if (!d) return lines;
    if (victory && d.owner === 'enemy') {
      d.owner = 'player';
      state.captures += 1;
      if (d.kind === 'capital') {
        state.conquered += 1;
        const week = ctx.week;
        if (week.playRewards < EVENT_WEEKLY_PLAY_REWARD_CAP.factionAssault) {
          const mats: MaterialDelta = { traitstones: { 'runic:green': 1, 'runic:brown': 1 }, ingots: { epic: 1 } };
          earn(ctx.save, FACTION_CAPITAL_REWARD);
          earnMaterials(ctx.save, mats);
          week.playRewards += 1;
          lines.push({ label: `攻陷王城 · 第 ${state.round} 轮征服完成！`, deltas: { ...FACTION_CAPITAL_REWARD }, mats, note: '领地重整，下一轮守军更强' });
        } else {
          lines.push({ label: `攻陷王城 · 第 ${state.round} 轮征服完成！`, deltas: {}, note: '本周征服奖励已领满，积分与印记仍正常获得' });
        }
        state.round += 1;
        state.districts = buildMap(ctx, state.round);
        state.counterIn = FACTION_COUNTER_EVERY;
        return lines;
      }
      lines.push({ label: `占领${DISTRICT_INFO[d.kind].name}`, deltas: {}, note: `战区加成：${DISTRICT_INFO[d.kind].bonus}` });
    } else if (!victory) {
      lines.push({ label: `${DISTRICT_INFO[d.kind].name}进攻受挫`, deltas: {} });
    }
    state.counterIn -= 1;
    if (state.counterIn <= 0) {
      state.counterIn = FACTION_COUNTER_EVERY;
      // 反扑：夺回一块与敌占区接壤的己方地块（优先价值高的）
      const enemyTiles = state.districts.filter((x) => x.owner === 'enemy');
      const border = state.districts.filter((x) => x.owner === 'player' && enemyTiles.some((e) => adjacent(e, x)));
      const value: Record<DistrictKind, number> = { barracks: 5, fort: 5, shrine: 4, granary: 4, watchtower: 3, village: 1, capital: 0 };
      const lost = border.sort((a, b) => value[b.kind] - value[a.kind] || b.x - a.x)[0];
      if (lost) {
        lost.owner = 'enemy';
        lines.push({ label: `敌军反扑 · 失去${DISTRICT_INFO[lost.kind].name}`, deltas: {}, note: `${DISTRICT_INFO[lost.kind].bonus} 失效` });
      }
    } else {
      lines.push({ label: `敌军反扑倒计时 ${state.counterIn} 场`, deltas: {} });
    }
    return lines;
  },

  nextLevel(_ctx, state) {
    const t = factionTargets(state)[0];
    return t ? factionLevel(state, t) : EVENT_BASE_LEVEL;
  },

  summary(_ctx, state) {
    const owned = state.districts.filter((d) => d.owner === 'player').length;
    return `第 ${state.round} 轮 · 占领 ${owned}/${state.districts.length} · 反扑 ${state.counterIn} 场后`;
  },
};
