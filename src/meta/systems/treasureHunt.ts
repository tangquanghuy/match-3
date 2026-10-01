/**
 * 寻宝（Gems of War Treasure Hunt）。
 *
 * 玩法：消耗 1 张藏宝图，8×8 棋盘、起始 8 步；三连升级，四连不耗步，五连净加一步。
 * 金库不再合成或交换；步数归零后，按最终棋盘逐件累计固定货币奖励。
 * 红箱、金库各额外抽一次特质石（最多一颗），不替代货币，不按已走步数赠石。
 * 奖励为本项目配置，非 GOW 官方奖励表。
 */
import { HuntBoardTrace } from '../../engine/HuntBoard';
import type { GameEvent } from '../../engine/events';
import { SeededRNG } from '../../engine/rng';
import { ARCANE_STONE_KEYS, STONE_COLORS, type TraitstoneTier } from '../data/materials';
import type { HuntSoftCap, MetaSave, TreasureHuntState } from '../state/schema';
import { fail, type MetaFailure } from '../types';
import { earn, earnMaterials, spendMaterials } from './wallet';
import { createHuntSoftCap, hydrateHuntSoftCap, huntComboBias, observeHuntProgress } from './huntPacing';

export const HUNT_SIZE = 8;
export const HUNT_CELLS = HUNT_SIZE * HUNT_SIZE;
export const HUNT_START_TURNS = 8;
const VAULT = 7;
const EMPTY = -1;

export const LOOT_NAMES = ['铜币', '银币', '金币', '钱袋', '褐箱', '绿箱', '红箱', '金库'] as const;

type Option = { gold?: number; souls?: number; gems?: number; glory?: number; goldKeys?: number };

/** 每件终盘宝物同时获得全部所列货币；不是随机抽取其中一项。 */
export const HUNT_FIXED_REWARDS: readonly Readonly<Option>[] = [
  { gold: 25 },
  { gold: 75 },
  { gold: 250 },
  { gold: 500, souls: 50 },
  { gold: 2_000, souls: 150, glory: 30 },
  { gold: 10_000, souls: 500, glory: 100, gems: 20 },
  { gold: 50_000, souls: 1_500, glory: 300, gems: 100 },
  { gold: 200_000, souls: 5_000, glory: 1_000, gems: 300 },
];

/** 每个红箱/金库独立一次，万分比；剩余79.5%不附送材料，货币照常全部到账。
 * 对照宝石宝箱当前基础概率，独立配置避免未来抽卡调参隐式改变寻宝经济。
 */
export const HUNT_STONE_DROPS: readonly { tier: Exclude<TraitstoneTier, 'minor'>; weight: number }[] = [
  { tier: 'major', weight: 1_000 },
  { tier: 'runic', weight: 800 },
  { tier: 'arcane', weight: 200 },
  { tier: 'celestial', weight: 50 },
];
export const HUNT_STONE_BASE = 10_000;
const STONE_LABELS = { major: '高级石', runic: '符文石', arcane: '秘法石', celestial: '圣辉石' };
export const HUNT_STONE_ODDS_TEXT = HUNT_STONE_DROPS
  .map(row => `${STONE_LABELS[row.tier]} ${row.weight / HUNT_STONE_BASE * 100}%`).join('、');

export const LOOT_LADDER: readonly { name: string; reward: string }[] = HUNT_FIXED_REWARDS.map((reward, tier) => ({
  name: LOOT_NAMES[tier]!,
  reward: ([['gold', '黄金'], ['souls', '灵魂'], ['glory', '荣耀'], ['gems', '宝石']] as const)
    .filter(([key]) => (reward[key] ?? 0) > 0)
    .map(([key, label]) => `${reward[key]!.toLocaleString('en-US')} ${label}`).join(' + '),
}));

/** 每个结算物件的宝石收益，供预算模型按实测终盘构成估算。 */
export const HUNT_EXPECTED_GEMS = HUNT_FIXED_REWARDS.map(reward => reward.gems ?? 0);

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
  softCap: HuntSoftCap;
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

/** 基础补充自然随机（匹配强度 0），独立于 BATTLE_COMBO_BIAS。
 * 仅达到本局随机软上限后，由 fill 做负向择优；触发前每格只抽一次。 */
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

/** Size of the line/L/T created at a swapped cell, without allocating match groups. */
function swapMatchSize(cells: readonly number[], index: number): number {
  const tier = cells[index]!;
  if (tier < 0 || tier >= VAULT) return 0;
  const row = Math.floor(index / HUNT_SIZE), col = index % HUNT_SIZE;
  let horizontal = 1, vertical = 1;
  for (let c = col - 1; c >= 0 && cells[at(row, c)] === tier; c--) horizontal++;
  for (let c = col + 1; c < HUNT_SIZE && cells[at(row, c)] === tier; c++) horizontal++;
  for (let r = row - 1; r >= 0 && cells[at(r, col)] === tier; r--) vertical++;
  for (let r = row + 1; r < HUNT_SIZE && cells[at(r, col)] === tier; r++) vertical++;
  return horizontal >= 3 && vertical >= 3 ? horizontal + vertical - 1 : Math.max(horizontal, vertical);
}

/** Lower is calmer: suppress automatic bonus chains first, then future 4/5 opportunities. */
function refillMatchScore(cells: number[]): number {
  const groups = findGroups(cells);
  if (groups.length) {
    const best = Math.max(...groups.map(group => group.length));
    return (best >= 5 ? 10_000 : best >= 4 ? 5_000 : 0)
      + groups.length * 200 + groups.reduce((sum, group) => sum + group.length * 10, 0);
  }
  let opportunities = 0;
  for (let a = 0; a < HUNT_CELLS; a++) {
    if (cells[a] === VAULT) continue;
    for (const b of [a % HUNT_SIZE < HUNT_SIZE - 1 ? a + 1 : -1, a + HUNT_SIZE < HUNT_CELLS ? a + HUNT_SIZE : -1]) {
      if (b < 0 || cells[b] === VAULT || cells[a] === cells[b]) continue;
      const av = cells[a]!, bv = cells[b]!;
      cells[a] = bv; cells[b] = av;
      const best = Math.max(swapMatchSize(cells, a), swapMatchSize(cells, b));
      opportunities += best >= 5 ? 2 : best >= 4 ? 1 : 0;
      cells[a] = av; cells[b] = bv;
    }
  }
  return opportunities;
}

/** Post-cap only: downweight neighboring duplicates rather than manufacturing matches.
 * Every low-tier treasure keeps nonzero weight; nothing is removed from the pool. */
function rollCoolingDrop(cells: readonly number[], index: number, rng: SeededRNG, pressure: number): number {
  const row = Math.floor(index / HUNT_SIZE), col = index % HUNT_SIZE;
  const neighbors = [row > 0 ? index - HUNT_SIZE : -1, row < HUNT_SIZE - 1 ? index + HUNT_SIZE : -1,
    col > 0 ? index - 1 : -1, col < HUNT_SIZE - 1 ? index + 1 : -1];
  const weights = [72, 22, 5, 1].map((weight, tier) => {
    const same = neighbors.filter(i => i >= 0 && cells[i] === tier).length;
    return weight / (1 + pressure * same);
  });
  let roll = rng.next() * weights.reduce((sum, weight) => sum + weight, 0);
  for (let tier = 0; tier < weights.length; tier++) {
    roll -= weights[tier]!;
    if (roll < 0) return tier;
  }
  return 3;
}

function fill(cells: number[], rng: SeededRNG, cap: HuntSoftCap): void {
  const empty = cells.flatMap((tier, i) => tier < 0 ? [i] : []);
  if (!empty.length) return;
  const pressure = -huntComboBias(cap);
  // Before the threshold this is exactly one draw per empty cell, without scoring.
  if (pressure === 0) {
    for (const i of empty) cells[i] = rollDrop(rng);
    return;
  }
  let best: number[] = [], bestScore = Infinity;
  // Post-cap trials use neighboring-duplicate downweighting. Existing pieces never change.
  // Bounded effort: at most 11 candidates, only after the single soft threshold.
  for (let attempt = 0; attempt < 1 + pressure * 2; attempt++) {
    // Clear the previous trial, so later empty slots do not bias earlier draws.
    for (const i of empty) cells[i] = EMPTY;
    for (const i of empty) cells[i] = rollCoolingDrop(cells, i, rng, pressure);
    const score = refillMatchScore(cells);
    if (score < bestScore) {
      best = empty.map(i => cells[i]!);
      bestScore = score;
      if (score === 0) break;
    }
  }
  empty.forEach((i, j) => { cells[i] = best[j]!; });
}

function resolve(cells: number[], rng: SeededRNG, prefer: number, trace: HuntBoardTrace, cap: HuntSoftCap): number {
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
    observeHuntProgress(cap, cells);
    fall(cells);
    fill(cells, rng, cap);
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

/** 寻宝开局不安排四/五连：只排除现成匹配及死盘，首个可走盘立即采用。
 * 不接入 BATTLE_SETUP_BIAS，不按大消机会筛盘；自然形成的四/五连机会仍保留。 */
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
  const softCap = hydrateHuntSoftCap(state.softCap, state.rng, state.cells);
  const best = resolve(cells, rng, to, trace, softCap);
  if (softCap.peak >= softCap.target) softCap.activeMoves = Math.min(Number.MAX_SAFE_INTEGER, softCap.activeMoves + 1);
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
    softCap,
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

function rollStone(rng: SeededRNG): string | null {
  let roll = rng.nextInt(HUNT_STONE_BASE);
  for (const row of HUNT_STONE_DROPS) {
    roll -= row.weight;
    if (roll >= 0) continue;
    if (row.tier === 'celestial') return 'celestial';
    if (row.tier === 'arcane') return rng.pick(ARCANE_STONE_KEYS);
    return `${row.tier}:${rng.pick(STONE_COLORS).key}`;
  }
  return null;
}

/** moves 保留调用兼容；奖励仅由终盘宝物决定，长局不额外堆叠特质石。 */
export function rollRewards(cells: readonly number[], _moves: number, rng: SeededRNG): HuntGrant {
  const grant = emptyGrant();
  for (const tier of cells) {
    if (!Number.isInteger(tier) || tier < 0 || tier > VAULT) continue;
    addOption(grant, HUNT_FIXED_REWARDS[tier]!);
    if (tier < 6) continue;
    const key = rollStone(rng);
    if (key) grant.traitstones[key] = (grant.traitstones[key] ?? 0) + 1;
  }
  return grant;
}

export function beginHunt(save: MetaSave, seed: number): { ok: true; state: TreasureHuntState } | MetaFailure {
  if (save.treasureHunt && save.treasureHunt.turns > 0) {
    const current = save.treasureHunt;
    current.softCap = hydrateHuntSoftCap(current.softCap, current.rng, current.cells);
    return { ok: true, state: current };
  }
  const paid = spendMaterials(save, { treasureMaps: 1 });
  if (!paid.ok) return paid;
  const rng = new SeededRNG(seed);
  const state: TreasureHuntState = {
    cells: createOpeningBoard(rng),
    turns: HUNT_START_TURNS,
    moves: 0,
    rng: rng.getState(),
    softCap: createHuntSoftCap(seed),
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
    softCap: played.softCap,
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
