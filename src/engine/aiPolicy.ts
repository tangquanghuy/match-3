import { BoardModel } from './BoardModel';
import { ALL_BASE_COLORS, colorGem, isSameMatchType, skullGem } from './types';
import { AiColorChooser } from './skills/colorChooser';
import { choiceRuleOf } from './skills/gowChoiceRules';
import { sameGemType, transformOutput } from './skills/gemChoiceScore';
import { MatchResolver } from './MatchResolver';
import type { MatchGroup } from './MatchResolver';
import { ManaDistributor } from './ManaDistributor';
import { MAX_ACTIVE_TEAM_SIZE } from './teamRoster';
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
 *   Special case: cast WangFeng first when a summon slot is open.
 *   2. Cast ready non-generators before generators (team order within each group).
 *      Defer deterministic conversions that gift an opponent a big swap without a big match or extra turn.
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
// The community troop WangFeng's spell (see WANGFENG_SPELL_ID in communityTroops).
const WANGFENG_SKILL_ID = '20013';

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

/** WangFeng's summon takes precedence while a field slot is available. */
function readyWangfengWithOpenSlot(
  state: GameState, side: PlayerSide,
  registry?: Pick<ExtensionRegistry, 'prototypes' | 'skills'>,
): Character | null {
  if (state.state !== MatchState.AwaitingInput || state.activePlayer !== side) return null;
  const team = state.teams[side].characters;
  if (team.length >= MAX_ACTIVE_TEAM_SIZE) return null;
  return team.find(ch => ch.skillId === WANGFENG_SKILL_ID && engineWouldAcceptCast(state, ch, registry)) ?? null;
}

/** Cast ready non-generators before generators, preserving team order within each group. */
export function firstCastableCharacter(
  state: GameState,
  side: PlayerSide,
  registry?: Pick<ExtensionRegistry, 'prototypes' | 'skills'>,
): Character | null {
  if (state.state !== MatchState.AwaitingInput || state.activePlayer !== side) return null;
  const summon = readyWangfengWithOpenSlot(state, side, registry);
  if (summon) return summon;
  const team = state.teams[side].characters;
  const castable = team.filter(ch => engineWouldAcceptCast(state, ch, registry)
    && !giftsOpponentBigMatch(state, ch, registry));
  // Full-mana allies should spend their skills before a generator refills them.
  // If only generators are ready, preserve team order to avoid circular deferral.
  return castable.find(ch => ch.role !== 'Generator' && ch.role !== '\u4f9b\u9b54')
    ?? castable[0] ?? null;
}

/** Skip a deterministic conversion that creates an opponent 4+/L/T move without a big match or extra turn. */
function giftsOpponentBigMatch(
  state: GameState, caster: Character,
  registry?: Pick<ExtensionRegistry, 'prototypes' | 'skills'>,
): boolean {
  if (!registry || registry.skills.has(caster.skillId)) return false;
  let proto = registry.prototypes.get(caster.skillId);
  if (!proto) return false;
  const choices = skillChoices(proto);
  if (choices) {
    const selected = selectSkillBranch(proto, choices.labels.length ? 0 : null);
    if (!selected) return false;
    proto = selected;
  }
  if (proto.segments.some(seg => seg.kind === 'extraTurn' && !seg.ifCond
    && !seg.ifTargetDied && (seg.chance === undefined || seg.chance >= 1) && !seg.chanceBoost)) return false;
  const transforms = proto.segments.filter(seg => seg.kind === 'gem' && seg.params.op === 'transform');
  if (!transforms.length || proto.segments.some(seg => seg.kind === 'oneOf'
    || seg.kind === 'gem' && seg.params.op !== 'transform')) return false;
  const color = new AiColorChooser().choose(state, caster.id, choiceRuleOf(proto), proto);
  const board = state.board.clone();
  let changed = false;
  for (const seg of transforms) {
    if (seg.kind !== 'gem' || seg.params.op !== 'transform') continue;
    const params = seg.params;
    // Random/subset/conditional effects cannot be predicted without advancing battle RNG.
    if (seg.ifCond || seg.chance !== undefined || seg.chanceBoost || params.count || params.countModifier
      || params.diagonal || params.diagonalAnchor || params.tiers
      || params.spiritColorFromSource || params.from === 'ANY' || params.from === 'CELL'
      || (!params.from && !params.fromSpecial)) return false;
    if ((params.from === 'CHOSEN' || params.to === 'CHOSEN') && !color) return false;
    const output = transformOutput(params, caster, color ?? undefined);
    const source = params.from === 'CHOSEN' ? colorGem(color!)
      : params.from === 'SKULL' ? skullGem()
        : ALL_BASE_COLORS.includes(params.from as BaseColor) ? colorGem(params.from as BaseColor) : null;
    if (!output || (!source && !params.fromSpecial)) return false;
    board.forEach((gem, pos) => {
      if (!gem || sameGemType(gem.type, output)) return;
      const matchesSource = params.fromSpecial
        ? gem.type.kind === 'special' && gem.type.spec.kind === params.fromSpecial
        : isSameMatchType(gem.type, source!);
      if (matchesSource) {
        board.get(pos)!.type = output;
        changed = true;
      }
    });
  }
  // Any immediate match will resolve and refill before the opponent moves; that board is unknown.
  if (!changed || resolver.findMatches(board).length > 0) return false;
  for (let row = 0; row < BoardModel.ROWS; row++) for (let col = 0; col < BoardModel.COLS; col++) {
    const a = { row, col };
    for (const b of [{ row: row + 1, col }, { row, col: col + 1 }]) {
      if (!BoardModel.inBounds(b)) continue;
      board.swap(a, b);
      const big = resolver.findMatches(board).some(group => bigTierOf(group) > 0);
      board.swap(a, b);
      if (big) return true;
    }
  }
  return false;
}

/** Choose one action by priority; returns null if no cast or legal swap remains. */
export function chooseAiAction(input: AiPolicyInput): AiDecision | null {
  const { state, side, rng } = input;
  if (input.allowCast !== false) {
    const summon = readyWangfengWithOpenSlot(state, side, input.registry);
    if (summon) return { action: { type: 'cast', characterId: summon.id }, reason: 'cast' };
  }
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
