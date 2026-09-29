/**
 * 世界事件 · 庆典棋盘（2026-09-29 重做）。
 *
 * 战斗不直接给物资，而是给「骰子」；物资要在 20 格的庆典环形棋盘上掷骰走出来：
 *  - 每场胜利 +1 骰；护送商队（高难）再 +1；队伍中有 ≥2 名本周加成种族部队再 +1；
 *  - 格子：物资 / 大丰收 / 金币 / 宝箱 / 灯会（下一格奖励翻倍）/ 陷阱（物资 -2）/
 *    商队（得一枚「定向骰」，可自选点数）/ 传送门（直达下一个大丰收）；
 *  - 经过或停在起点 = 绕场一圈，物资 +6；
 *  - 里程碑按累计物资结算。
 * 核心决策：什么时候用定向骰去踩大丰收、躲陷阱、接灯会翻倍。
 */
import { fnv1a32 } from '../../data/hash';
import { getTroopById } from '../../../data/troops';
import { fail } from '../../types';
import { earn } from '../wallet';
import { activeTeam } from '../teamRules';
import { KINGDOM_ORDER, kingdomTroopPool } from '../../data/kingdoms';
import { pickEnemies } from '../encounter';
import {
  EVENT_BASE_LEVEL, int, isObj, pickN, rngOf, str,
  type EventModeImpl, type ModeCtx,
} from './common';

export type BoardTile = 'start' | 'supply' | 'harvest' | 'gold' | 'chest' | 'lantern' | 'trap' | 'caravan' | 'portal';

export const BOARD_SIZE = 20;
export const BOARD_LAP_BONUS = 6;

export const TILE_INFO: Record<BoardTile, { name: string; desc: string }> = {
  start: { name: '起点', desc: `绕场一圈：物资 +${BOARD_LAP_BONUS}` },
  supply: { name: '物资', desc: '物资 +3' },
  harvest: { name: '大丰收', desc: '物资 +6' },
  gold: { name: '金币', desc: '黄金 +300' },
  chest: { name: '宝箱', desc: '随机：灵魂 +500 / 黄金 +500 / 骰子 +1' },
  lantern: { name: '灯会', desc: '下一次落点奖励翻倍' },
  trap: { name: '陷阱', desc: '物资 -2' },
  caravan: { name: '商队', desc: '获得一枚定向骰（可自选 1~6 点）' },
  portal: { name: '传送门', desc: '传送到前方最近的大丰收并领取' },
};

export interface WorldState {
  v: 1;
  board: BoardTile[];
  pos: number;
  dice: number;
  lucky: number;
  laps: number;
  supplies: number;
  doubleNext: boolean;
  rolls: number;
  wins: number;
  last: { roll: number; tile: BoardTile; text: string } | null;
}

function buildBoard(weekStart: number): BoardTile[] {
  const rng = rngOf(fnv1a32(`world-board-${weekStart >>> 0}`));
  const middle: BoardTile[] = [
    'supply', 'supply', 'supply', 'supply', 'supply', 'supply', 'supply', 'harvest', 'harvest',
    'gold', 'gold', 'chest', 'lantern', 'lantern', 'trap', 'trap', 'caravan', 'caravan', 'portal',
  ];
  return ['start', ...pickN(rng, middle, middle.length)];
}

/** 本场胜利获得的骰子数 */
export function worldDiceFor(ctx: ModeCtx, choice: string | undefined): { dice: number; matches: number } {
  const race = ctx.theme.bonusRace;
  const matches = race ? (activeTeam(ctx.save)?.members ?? []).filter((m) => m.kind === 'troop' && getTroopById(m.troopId)?.troopTypes.includes(race)).length : 0;
  return { dice: 1 + (choice === 'escort' ? 1 : 0) + (matches >= 2 ? 1 : 0), matches };
}

function worldLevel(state: WorldState, choice: string | undefined): number {
  const stage = Math.min(state.wins, 12);
  return EVENT_BASE_LEVEL + stage * 3 + (choice === 'escort' ? 5 : 0);
}

/** 走 steps 格并结算落点 */
function move(ctx: ModeCtx, state: WorldState, steps: number, seed: number): string {
  const parts: string[] = [];
  const before = state.pos;
  state.pos = (state.pos + steps) % BOARD_SIZE;
  if (before + steps >= BOARD_SIZE) {
    state.laps += 1;
    state.supplies += BOARD_LAP_BONUS;
    parts.push(`绕场一圈 物资 +${BOARD_LAP_BONUS}`);
  }
  let tile = state.board[state.pos]!;
  if (tile === 'portal') {
    let p = state.pos;
    for (let i = 1; i <= BOARD_SIZE; i++) {
      const q = (state.pos + i) % BOARD_SIZE;
      if (state.board[q] === 'harvest') { p = q; break; }
    }
    if (p < state.pos) { state.laps += 1; state.supplies += BOARD_LAP_BONUS; parts.push(`穿越起点 物资 +${BOARD_LAP_BONUS}`); }
    state.pos = p;
    tile = state.board[p]!;
    parts.push('传送门');
  }
  const mult = state.doubleNext && tile !== 'lantern' ? 2 : 1;
  if (tile !== 'lantern') state.doubleNext = false;
  const rng = rngOf(fnv1a32(`world-chest-${ctx.weekStart}-${state.rolls}-${seed}`));
  switch (tile) {
    case 'start': break;
    case 'supply': state.supplies += 3 * mult; parts.push(`物资 +${3 * mult}`); break;
    case 'harvest': state.supplies += 6 * mult; parts.push(`大丰收 物资 +${6 * mult}`); break;
    case 'gold': earn(ctx.save, { gold: 300 * mult }); parts.push(`黄金 +${300 * mult}`); break;
    case 'chest': {
      const r = rng.nextInt(3);
      if (r === 0) { earn(ctx.save, { souls: 500 * mult }); parts.push(`宝箱 灵魂 +${500 * mult}`); }
      else if (r === 1) { earn(ctx.save, { gold: 500 * mult }); parts.push(`宝箱 黄金 +${500 * mult}`); }
      else { state.dice += mult; parts.push(`宝箱 骰子 +${mult}`); }
      break;
    }
    case 'lantern': state.doubleNext = true; parts.push('灯会 下一次落点翻倍'); break;
    case 'trap': { const loss = Math.min(state.supplies, 2); state.supplies -= loss; parts.push(`陷阱 物资 -${loss}`); break; }
    case 'caravan': state.lucky += mult; parts.push(`商队 定向骰 +${mult}`); break;
    case 'portal': break;
  }
  const text = parts.join(' · ') || TILE_INFO[tile].name;
  state.last = { roll: steps, tile, text };
  return text;
}

export const worldMode: EventModeImpl<WorldState> = {
  init(ctx) {
    return { v: 1, board: buildBoard(ctx.weekStart), pos: 0, dice: 0, lucky: 0, laps: 0, supplies: 0, doubleNext: false, rolls: 0, wins: 0, last: null };
  },

  sanitize(raw, ctx) {
    if (!isObj(raw) || raw.v !== 1) return null;
    const last = isObj(raw.last) && typeof raw.last.tile === 'string' && raw.last.tile in TILE_INFO
      ? { roll: int(raw.last.roll, 1, 1, 6), tile: raw.last.tile as BoardTile, text: str(raw.last.text, '') } : null;
    return {
      v: 1, board: buildBoard(ctx.weekStart), pos: int(raw.pos, 0, 0, BOARD_SIZE - 1), dice: int(raw.dice, 0, 0), lucky: int(raw.lucky, 0, 0),
      laps: int(raw.laps, 0, 0), supplies: int(raw.supplies, 0, 0), doubleNext: raw.doubleNext === true, rolls: int(raw.rolls, 0, 0),
      wins: int(raw.wins, 0, 0), last,
    };
  },

  plan(_ctx, state, seed, action) {
    const choice = action === 'escort' ? 'escort' : 'survey';
    const rng = rngOf(seed);
    let kingdom = KINGDOM_ORDER[rng.nextInt(KINGDOM_ORDER.length)]!;
    if (kingdomTroopPool(kingdom).length === 0) kingdom = KINGDOM_ORDER[0]!;
    return { kingdom, enemies: pickEnemies(kingdom, worldLevel(state, choice), ['elite', 'minion', 'minion'], rng), choice };
  },

  modify() { /* 世界事件不改战斗面板：收益全在棋盘上 */ },

  points(_ctx, _state, plan, _result, victory) {
    if (!victory) return 0;
    return plan.source.kind === 'event' && plan.source.choice === 'escort' ? 120 : 100;
  },

  progress(ctx, state, plan, _result, victory) {
    if (!victory) return [];
    const choice = plan.source.kind === 'event' ? plan.source.choice : undefined;
    const { dice, matches } = worldDiceFor(ctx, choice);
    state.dice += dice;
    state.wins += 1;
    return [{ label: `庆典骰子 +${dice}`, deltas: {}, note: `回到活动页掷骰前进${matches >= 2 ? ' · 加成种族 +1' : ''}${choice === 'escort' ? ' · 护送 +1' : ''}` }];
  },

  act(ctx, state, action, seed) {
    if (action === 'roll') {
      if (state.dice <= 0) return fail('INSUFFICIENT', '没有骰子：赢下活动战斗获得');
      state.dice -= 1;
      state.rolls += 1;
      const roll = 1 + rngOf(fnv1a32(`world-roll-${ctx.weekStart}-${state.rolls}-${seed}`)).nextInt(6);
      return { ok: true, message: `掷出 ${roll} 点 · ${move(ctx, state, roll, seed)}` };
    }
    const m = action.match(/^lucky:([1-6])$/);
    if (m) {
      if (state.lucky <= 0) return fail('INSUFFICIENT', '没有定向骰');
      state.lucky -= 1;
      state.rolls += 1;
      const roll = Number(m[1]);
      return { ok: true, message: `定向骰 ${roll} 点 · ${move(ctx, state, roll, seed)}` };
    }
    return fail('INVALID', '未知操作');
  },

  nextLevel: (_ctx, state) => worldLevel(state, 'survey'),

  summary: (_ctx, state) => `物资 ${state.supplies} · 骰子 ${state.dice}${state.lucky ? ` + 定向 ${state.lucky}` : ''} · 第 ${state.laps + 1} 圈`,

  metric: (_ctx, state) => ({ label: '物资', value: state.supplies }),
};
