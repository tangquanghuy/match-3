/**
 * 寻宝（Gems of War Treasure Hunt）。
 *
 * 口径取自 Infinity Plus Two 帮助（2025-06-19）与 2016 年社区核对过的奖励表：
 *  - 消耗 1 张藏宝图开局，8×8，起始 8 步；
 *  - 三连及以上合成高一档，合成物留在棋盘上，其余空位下落补新；
 *  - 四连不耗步，五连及以上（含 L/T）净加 1 步，同一手只结算一次；
 *  - 金库不能再合成，也不能手动交换；
 *  - 步数归零后，棋盘上每件东西在自己的奖池里随机开出一项；
 *  - 每走 15 步，结束时额外一颗随机特质石。
 * 宝石钥匙在本作记入金钥匙（没有单独的钥匙库存）。
 */
import { HuntBoardTrace } from '../../engine/HuntBoard';
import type { GameEvent } from '../../engine/events';
import { SeededRNG } from '../../engine/rng';
import { STONE_COLORS } from '../data/materials';
import type { MetaSave, TreasureHuntState } from '../state/schema';
import { fail, type MetaFailure } from '../types';
import { earn, earnMaterials, spendMaterials } from './wallet';

export const HUNT_SIZE = 8;
export const HUNT_CELLS = HUNT_SIZE * HUNT_SIZE;
export const HUNT_START_TURNS = 8;
const VAULT = 7;
const EMPTY = -1;

export const LOOT_NAMES = ['铜币', '银币', '金币', '钱袋', '褐箱', '绿箱', '红箱', '金库'] as const;

export const LOOT_LADDER: readonly { name: string; reward: string }[] = [
  { name: '铜币', reward: '1 黄金' },
  { name: '银币', reward: '3 黄金' },
  { name: '金币', reward: '10 黄金' },
  { name: '钱袋', reward: '30 黄金或 3 灵魂' },
  { name: '褐箱', reward: '80 黄金、8 灵魂或 2 荣耀' },
  { name: '绿箱', reward: '200 黄金、20 灵魂、6 荣耀或 1 宝石' },
  { name: '红箱', reward: '500 黄金、50 灵魂、15 荣耀、2 宝石或 2 金钥匙' },
  { name: '金库', reward: '1250 黄金、125 灵魂、40 荣耀、3 宝石、6 金钥匙或 2 金钥匙' },
];

type Option = { gold?: number; souls?: number; gems?: number; glory?: number; goldKeys?: number };

const OPTIONS: readonly (readonly Option[])[] = [
  [{ gold: 1 }],
  [{ gold: 3 }],
  [{ gold: 10 }],
  [{ gold: 30 }, { souls: 3 }],
  [{ gold: 80 }, { souls: 8 }, { glory: 2 }],
  [{ gold: 200 }, { souls: 20 }, { glory: 6 }, { gems: 1 }],
  [{ gold: 500 }, { souls: 50 }, { glory: 15 }, { gems: 2 }, { goldKeys: 2 }],
  [{ gold: 1250 }, { souls: 125 }, { glory: 40 }, { gems: 3 }, { goldKeys: 6 }, { goldKeys: 2 }],
];

/** 每个结算物件的宝石期望，供预算模型按实测终盘构成估算。 */
export const HUNT_EXPECTED_GEMS = OPTIONS.map(pool => pool.reduce((sum, option) => sum + (option.gems ?? 0), 0) / pool.length);

export interface HuntGrant {
  gold: number;
  souls: number;
  gems: number;
  glory: number;
  goldKeys: number;
  traitstones: Record<string, number>;
}

export interface HuntMoveOk {
  ok: true;
  cells: number[];
  turns: number;
  moves: number;
  rng: number;
  over: boolean;
  best: number;
  shuffled: boolean;
  grant: HuntGrant | null;
  events: GameEvent[];
}

function at(row: number, col: number): number {
  return row * HUNT_SIZE + col;
}

function findGroups(cells: readonly number[]): number[][] {
  const runs: number[][] = [];
  const take = (ids: number[]) => {
    let start = 0;
    for (let i = 1; i <= ids.length; i++) {
      const same = i < ids.length
        && cells[ids[i]!] === cells[ids[start]!]
        && cells[ids[start]!]! >= 0
        && cells[ids[start]!]! < VAULT;
      if (!same) {
        if (i - start >= 3) runs.push(ids.slice(start, i));
        start = i;
      }
    }
  };
  for (let row = 0; row < HUNT_SIZE; row++) {
    const ids: number[] = [];
    for (let col = 0; col < HUNT_SIZE; col++) ids.push(at(row, col));
    take(ids);
  }
  for (let col = 0; col < HUNT_SIZE; col++) {
    const ids: number[] = [];
    for (let row = 0; row < HUNT_SIZE; row++) ids.push(at(row, col));
    take(ids);
  }
  if (runs.length === 0) return [];
  const parent = new Map<number, number>();
  const find = (x: number): number => {
    let root = parent.get(x) ?? x;
    while (root !== (parent.get(root) ?? root)) root = parent.get(root) ?? root;
    parent.set(x, root);
    return root;
  };
  const union = (a: number, b: number) => {
    const pa = find(a);
    const pb = find(b);
    if (pa !== pb) parent.set(pa, pb);
  };
  for (const run of runs) {
    for (const id of run) if (!parent.has(id)) parent.set(id, id);
    for (let i = 1; i < run.length; i++) union(run[0]!, run[i]!);
  }
  const groups = new Map<number, number[]>();
  for (const id of parent.keys()) {
    const root = find(id);
    const list = groups.get(root) ?? [];
    list.push(id);
    groups.set(root, list);
  }
  return [...groups.values()];
}

export function hasMatch(cells: readonly number[]): boolean {
  return findGroups(cells).length > 0;
}

export function hasLegalMove(cells: readonly number[]): boolean {
  for (let i = 0; i < HUNT_CELLS; i++) {
    if (cells[i] === VAULT) continue;
    const row = Math.floor(i / HUNT_SIZE);
    const col = i % HUNT_SIZE;
    const neighbors = [col + 1 < HUNT_SIZE ? i + 1 : -1, row + 1 < HUNT_SIZE ? i + HUNT_SIZE : -1];
    for (const j of neighbors) {
      if (j < 0 || cells[j] === VAULT) continue;
      const trial = cells.slice();
      const tmp = trial[i]!;
      trial[i] = trial[j]!;
      trial[j] = tmp;
      if (findGroups(trial).length > 0) return true;
    }
  }
  return false;
}

function rollDrop(rng: SeededRNG): number {
  const n = rng.nextInt(100);
  if (n < 72) return 0;
  if (n < 94) return 1;
  if (n < 99) return 2;
  return 3;
}

function fall(cells: number[]): void {
  for (let col = 0; col < HUNT_SIZE; col++) {
    const stack: number[] = [];
    for (let row = HUNT_SIZE - 1; row >= 0; row--) {
      const value = cells[at(row, col)]!;
      if (value >= 0) stack.push(value);
    }
    for (let k = 0; k < HUNT_SIZE; k++) {
      cells[at(HUNT_SIZE - 1 - k, col)] = k < stack.length ? stack[k]! : EMPTY;
    }
  }
}

function fill(cells: number[], rng: SeededRNG): void {
  for (let i = 0; i < HUNT_CELLS; i++) {
    if (cells[i]! < 0) cells[i] = rollDrop(rng);
  }
}

function resolve(cells: number[], rng: SeededRNG, prefer: number, trace: HuntBoardTrace): number {
  let best = 0;
  let hot = prefer;
  for (let guard = 0; guard < 30; guard++) {
    const groups = findGroups(cells);
    if (groups.length === 0) break;
    for (const group of groups) best = Math.max(best, group.length);
    const merges: { indices: number[]; keep: number; tier: number }[] = [];
    for (const group of groups) {
      const keep = group.includes(hot) ? hot : group.reduce((a, b) => (a > b ? a : b));
      const tier = Math.min(VAULT, cells[keep]! + 1);
      merges.push({ indices: group, keep, tier });
      for (const id of group) cells[id] = EMPTY;
      cells[keep] = tier;
      hot = keep;
    }
    trace.merge(merges, guard + 1);
    fall(cells);
    fill(cells, rng);
    trace.refill(cells, guard + 1);
    hot = -1;
  }
  return best;
}

function turnDelta(best: number): number {
  if (best >= 5) return 1;
  if (best >= 4) return 0;
  return -1;
}

function reshuffle(cells: number[], rng: SeededRNG): boolean {
  for (let attempt = 0; attempt < 40; attempt++) {
    for (let i = HUNT_CELLS - 1; i > 0; i--) {
      const j = rng.nextInt(i + 1);
      const tmp = cells[i]!;
      cells[i] = cells[j]!;
      cells[j] = tmp;
    }
    if (findGroups(cells).length === 0 && hasLegalMove(cells)) return true;
  }
  return false;
}

export function createOpeningBoard(rng: SeededRNG): number[] {
  for (let attempt = 0; attempt < 60; attempt++) {
    // Fill without creating a starting match. Rejecting entire weighted boards
    // almost always exhausted the old retries and produced the same checkerboard.
    const cells: number[] = [];
    const weights = [58, 28, 11, 3];
    for (let i = 0; i < HUNT_CELLS; i++) {
      const choices = weights.map((weight, tier) => {
        const horizontal = i % HUNT_SIZE >= 2 && cells[i - 1] === tier && cells[i - 2] === tier;
        const vertical = i >= HUNT_SIZE * 2 && cells[i - HUNT_SIZE] === tier && cells[i - HUNT_SIZE * 2] === tier;
        return horizontal || vertical ? 0 : weight;
      });
      let roll = rng.nextInt(choices.reduce((sum, weight) => sum + weight, 0));
      for (let tier = 0; tier < choices.length; tier++) {
        roll -= choices[tier]!;
        if (roll < 0) { cells.push(tier); break; }
      }
    }
    if (hasLegalMove(cells)) return cells;
  }
  return Array.from({ length: HUNT_CELLS }, (_, i) => ((Math.floor(i / HUNT_SIZE) + (i % HUNT_SIZE)) % 2 === 0 ? 0 : 1));
}

function adjacent(a: number, b: number): boolean {
  if (a < 0 || b < 0 || a >= HUNT_CELLS || b >= HUNT_CELLS || a === b) return false;
  const ar = Math.floor(a / HUNT_SIZE);
  const ac = a % HUNT_SIZE;
  const br = Math.floor(b / HUNT_SIZE);
  const bc = b % HUNT_SIZE;
  return Math.abs(ar - br) + Math.abs(ac - bc) === 1;
}

export function applyMove(state: TreasureHuntState, from: number, to: number): HuntMoveOk | MetaFailure {
  if (!adjacent(from, to)) return fail('INVALID', '只能和相邻的交换');
  if (state.cells[from] === VAULT || state.cells[to] === VAULT) return fail('INVALID', '金库不能移动');
  const cells = state.cells.slice();
  const tmp = cells[from]!;
  cells[from] = cells[to]!;
  cells[to] = tmp;
  if (findGroups(cells).length === 0) return fail('INVALID', '这样换不成一组');
  const rng = new SeededRNG(1);
  rng.setState(state.rng);
  const trace = new HuntBoardTrace(state.cells);
  trace.swap(from, to);
  const best = resolve(cells, rng, to, trace);
  const turns = Math.max(0, state.turns + turnDelta(best));
  const moves = state.moves + 1;
  let over = turns === 0;
  let shuffled = false;
  if (!over && !hasLegalMove(cells)) {
    shuffled = true;
    if (!reshuffle(cells, rng)) over = true;
    trace.reshuffle(cells);
  }
  return {
    ok: true,
    cells,
    turns,
    moves,
    rng: rng.getState(),
    over,
    best,
    shuffled,
    grant: null,
    events: trace.events,
  };
}

function emptyGrant(): HuntGrant {
  return { gold: 0, souls: 0, gems: 0, glory: 0, goldKeys: 0, traitstones: {} };
}

function addOption(grant: HuntGrant, option: Option): void {
  grant.gold += option.gold ?? 0;
  grant.souls += option.souls ?? 0;
  grant.gems += option.gems ?? 0;
  grant.glory += option.glory ?? 0;
  grant.goldKeys += option.goldKeys ?? 0;
}

function rollStone(rng: SeededRNG): string {
  const color = STONE_COLORS[rng.nextInt(STONE_COLORS.length)]!.key;
  const n = rng.nextInt(100);
  if (n < 4) return 'celestial';
  if (n < 16) return `runic:${color}`;
  if (n < 40) return `major:${color}`;
  return `minor:${color}`;
}

export function rollRewards(cells: readonly number[], moves: number, rng: SeededRNG): HuntGrant {
  const grant = emptyGrant();
  for (const tier of cells) {
    if (tier < 0 || tier > VAULT) continue;
    const pool = OPTIONS[tier]!;
    addOption(grant, pool[rng.nextInt(pool.length)]!);
  }
  const stones = Math.floor(moves / 15);
  for (let i = 0; i < stones; i++) {
    const key = rollStone(rng);
    grant.traitstones[key] = (grant.traitstones[key] ?? 0) + 1;
  }
  return grant;
}

export function stonesFromMoves(moves: number): number {
  return Math.floor(moves / 15);
}

export function beginHunt(save: MetaSave, seed: number): { ok: true; state: TreasureHuntState } | MetaFailure {
  if (save.treasureHunt && save.treasureHunt.turns > 0) return { ok: true, state: save.treasureHunt };
  const paid = spendMaterials(save, { treasureMaps: 1 });
  if (!paid.ok) return paid;
  const rng = new SeededRNG(seed);
  const state: TreasureHuntState = {
    cells: createOpeningBoard(rng),
    turns: HUNT_START_TURNS,
    moves: 0,
    rng: rng.getState(),
  };
  save.treasureHunt = state;
  return { ok: true, state };
}

export function commitMove(save: MetaSave, from: number, to: number): HuntMoveOk | MetaFailure {
  const hunt = save.treasureHunt;
  if (!hunt || hunt.turns <= 0) return fail('INVALID', '还没有开始的寻宝');
  const played = applyMove(hunt, from, to);
  if (!played.ok) return played;
  if (played.over) {
    const rng = new SeededRNG(1);
    rng.setState(played.rng);
    const grant = rollRewards(played.cells, played.moves, rng);
    pay(save, grant);
    save.treasureHunt = null;
    return { ...played, grant };
  }
  save.treasureHunt = {
    cells: played.cells,
    turns: played.turns,
    moves: played.moves,
    rng: played.rng,
  };
  return played;
}

function pay(save: MetaSave, grant: HuntGrant): void {
  earn(save, {
    gold: grant.gold,
    souls: grant.souls,
    gems: grant.gems,
    glory: grant.glory,
    goldKeys: grant.goldKeys,
  });
  if (Object.keys(grant.traitstones).length > 0) earnMaterials(save, { traitstones: grant.traitstones });
}
