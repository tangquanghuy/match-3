import { BoardModel } from './BoardModel';
import { MatchResolver } from './MatchResolver';
import type { MatchGroup } from './MatchResolver';
import { ManaDistributor } from './ManaDistributor';
import { bigTierOf } from './comboBias';
import { canCastSkill, canGainMana } from './skills/effects/status';
import { skillChoices, selectSkillBranch } from './skills/branchChooser';
import { prototypeChosenTargetMode } from './skills/targetChooser';
import { candidatesFor } from './skills/targeting';
import { MatchState } from './types';
import type { BaseColor, BattleAction, CellPos, Character, PlayerSide } from './types';
import type { GameState } from './GameState';
import type { ExtensionRegistry } from './registry';
import type { SeededRNG } from './rng';

/**
 * 战斗 AI 决策（敌方回合 + 玩家自动战斗共用同一套逻辑）。
 *
 * 纯逻辑：只读 GameState，不改棋盘/队伍；平局用传入的种子化 RNG 打破（只在确有
 * 多个并列候选时才消耗一次随机数），同输入同输出。
 *
 * 优先级（用户裁定 2026-09-28）：
 *   1. 能打出 4 连及以上 / L / T 的交换（争额外回合）。5 连、L/T 高于普通 4 连；
 *      同档比消除格数，再比法力有用度；
 *   2. 施放技能：己方按队伍顺序第一个引擎会受理的角色（存活、满法力、未沉默、
 *      未用尽「一场一次」，且技能的分支/手动选目标有合法候选）；
 *   3. 骷髅匹配（骷髅越多越好）；
 *   4. 法力有用度最高的颜色匹配（按己方存活未满角色的剩余法力缺口加权）；
 *   5. 任意合法交换。
 *
 * 只评估交换当下形成的匹配组，不做连锁前瞻（连锁取决于补充随机数，前瞻既贵又不公平）。
 */

/** 决策理由：便于测试断言与调试日志 */
export type AiDecisionReason = 'big-match' | 'cast' | 'skull' | 'mana' | 'any';

export interface AiDecision {
  action: BattleAction;
  reason: AiDecisionReason;
}

export interface AiPolicyInput {
  state: GameState;
  /** 为哪一方决策（Right = 敌方 AI，Left = 玩家自动战斗） */
  side: PlayerSide;
  rng: SeededRNG;
  /** 技能注册表：「一场一次」与分支/选目标预检用；缺省时只做法力/沉默校验 */
  registry?: Pick<ExtensionRegistry, 'prototypes' | 'skills'>;
  /** false = 只选交换（施法被引擎拒绝后的回退） */
  allowCast?: boolean;
}

/** 单个候选交换的评估结果 */
export interface SwapEvaluation {
  from: CellPos;
  to: CellPos;
  /** 大消档位：2 = 5 连或 L/T，1 = 普通 4 连，0 = 只有 3 连 */
  bigTier: 0 | 1 | 2;
  /** 本次交换当下形成的匹配组覆盖的格数（去重前按组累加） */
  cells: number;
  /** 骷髅组内的格数 */
  skulls: number;
  /** 法力有用度：Σ 颜色组产出法力 × 该色剩余缺口 */
  usefulness: number;
}

const resolver = new MatchResolver();

/**
 * 列出并评估某方视角下的全部合法交换（只试右/下相邻对，覆盖所有相邻对）。
 * 在一份棋盘副本上原地交换→评估→换回，不改传入的 state。
 */
export function evaluateSwaps(state: GameState, side: PlayerSide): SwapEvaluation[] {
  const deficits = colorDeficits(state.teams[side].characters);
  const board = state.board.clone();
  const result: SwapEvaluation[] = [];
  for (let row = 0; row < BoardModel.ROWS; row++) {
    for (let col = 0; col < BoardModel.COLS; col++) {
      const a: CellPos = { row, col };
      const neighbors: CellPos[] = [{ row, col: col + 1 }, { row: row + 1, col }];
      for (const b of neighbors) {
        if (!BoardModel.inBounds(b)) continue;
        board.swap(a, b);
        const groups = resolver.findMatches(board);
        board.swap(a, b);
        if (groups.length === 0) continue;
        result.push({ from: a, to: b, ...scoreGroups(groups, deficits) });
      }
    }
  }
  return result;
}

/** 某方当前是否存在能打出 4 连及以上 / L / T 的交换（模拟统计用） */
export function hasBigMatchSwap(state: GameState, side: PlayerSide): boolean {
  return evaluateSwaps(state, side).some((s) => s.bigTier > 0);
}

/**
 * 己方按队伍顺序第一个可被引擎受理的施法者；没有则 null。
 * 复刻 TurnEngine.castSkillAction 的前置校验（不消耗随机数、不改状态）。
 */
export function firstCastableCharacter(
  state: GameState,
  side: PlayerSide,
  registry?: Pick<ExtensionRegistry, 'prototypes' | 'skills'>,
): Character | null {
  if (state.state !== MatchState.AwaitingInput || state.activePlayer !== side) return null;
  for (const ch of state.teams[side].characters) {
    if (engineWouldAcceptCast(state, ch, registry)) return ch;
  }
  return null;
}

/** 按优先级给出一次行动；无合法交换且无可施法角色时返回 null（引擎会自行洗牌兜底） */
export function chooseAiAction(input: AiPolicyInput): AiDecision | null {
  const { state, side, rng } = input;
  const swaps = evaluateSwaps(state, side);

  // 1. 大消：档位 → 格数 → 有用度
  const big = swaps.filter((s) => s.bigTier > 0);
  if (big.length > 0) {
    return swapDecision(pickBest(big, [(s) => s.bigTier, (s) => s.cells, (s) => s.usefulness], rng), 'big-match');
  }

  // 2. 施法
  if (input.allowCast !== false) {
    const caster = firstCastableCharacter(state, side, input.registry);
    if (caster) return { action: { type: 'cast', characterId: caster.id }, reason: 'cast' };
  }

  if (swaps.length === 0) return null;

  // 3. 骷髅：骷髅数 → 格数 → 有用度
  const skulls = swaps.filter((s) => s.skulls > 0);
  if (skulls.length > 0) {
    return swapDecision(pickBest(skulls, [(s) => s.skulls, (s) => s.cells, (s) => s.usefulness], rng), 'skull');
  }

  // 4. 己方需要的颜色：有用度 → 格数
  const useful = swaps.filter((s) => s.usefulness > 0);
  if (useful.length > 0) {
    return swapDecision(pickBest(useful, [(s) => s.usefulness, (s) => s.cells], rng), 'mana');
  }

  // 5. 任意合法交换（仍偏好消得多的）
  return swapDecision(pickBest(swaps, [(s) => s.cells], rng), 'any');
}

// —— 内部 ——

function swapDecision(s: SwapEvaluation, reason: AiDecisionReason): AiDecision {
  return { action: { type: 'swap', from: { ...s.from }, to: { ...s.to } }, reason };
}

/** 按键序逐级取最大；仍并列时用 RNG 挑一个（只有一个候选时不消耗随机数） */
function pickBest<T>(items: T[], keys: ((item: T) => number)[], rng: SeededRNG): T {
  let pool = items;
  for (const key of keys) {
    let best = -Infinity;
    for (const item of pool) best = Math.max(best, key(item));
    pool = pool.filter((item) => key(item) === best);
    if (pool.length === 1) return pool[0];
  }
  return pool.length === 1 ? pool[0] : pool[rng.nextInt(pool.length)];
}

/** 每种颜色的剩余法力缺口：存活、未满、可充能且关联该色的己方角色缺口之和 */
function colorDeficits(team: readonly Character[]): Map<BaseColor, number> {
  const deficits = new Map<BaseColor, number>();
  for (const ch of team) {
    if (ch.defeated || !canGainMana(ch)) continue;
    const need = ch.manaCost - ch.mana;
    if (need <= 0) continue;
    for (const color of new Set(ch.colors)) deficits.set(color, (deficits.get(color) ?? 0) + need);
  }
  return deficits;
}

function scoreGroups(
  groups: readonly MatchGroup[],
  deficits: ReadonlyMap<BaseColor, number>,
): Omit<SwapEvaluation, 'from' | 'to'> {
  let bigTier: 0 | 1 | 2 = 0;
  let cells = 0;
  let skulls = 0;
  let usefulness = 0;
  for (const g of groups) {
    cells += g.cells.length;
    const tier = bigTierOf(g);
    if (tier > bigTier) bigTier = tier;
    const settle = g.settle;
    if (settle.kind === 'skull') {
      skulls += g.cells.length;
    } else if (settle.kind === 'color') {
      const amount = g.cells.length * settle.manaMultiplier;
      usefulness += amount * (deficits.get(settle.color) ?? 0);
      for (const bonus of settle.bonusColors ?? []) usefulness += deficits.get(bonus) ?? 0;
    } else if (settle.kind === 'starOnly') {
      for (const bonus of settle.bonusColors) usefulness += deficits.get(bonus) ?? 0;
    }
  }
  return { bigTier, cells, skulls, usefulness };
}

/** 与 TurnEngine.castSkillAction 同序的前置校验（法力 → 沉默 → 一场一次 → 分支 → 选目标候选） */
function engineWouldAcceptCast(
  state: GameState,
  ch: Character,
  registry?: Pick<ExtensionRegistry, 'prototypes' | 'skills'>,
): boolean {
  if (ch.defeated) return false;
  if (!ManaDistributor.isSkillCastable(ch.mana, ch.manaCost)) return false;
  if (!canCastSkill(ch)) return false;
  if (!registry) return true;
  let proto = registry.prototypes.get(ch.skillId);
  if (proto?.oncePerBattle && state.actionLog.some((entry) => entry.skillId === ch.skillId)) return false;
  if (proto && !registry.skills.has(ch.skillId)) {
    // AI 分支选择器恒取第 0 支（AiBranchChooser）；结构非法的分支原型引擎会拒绝
    const choice = skillChoices(proto);
    if (choice) {
      const selected = selectSkillBranch(proto, choice.labels.length ? 0 : null);
      if (!selected) return false;
      proto = selected;
    }
    const mode = prototypeChosenTargetMode(proto);
    if (mode && candidatesFor(mode, state, ch.id).length === 0) return false;
  }
  return true;
}
