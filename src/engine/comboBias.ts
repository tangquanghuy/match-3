import { BoardModel } from './BoardModel';
import { MatchResolver } from './MatchResolver';
import type { MatchGroup } from './MatchResolver';
import type { ActionLogEntry, CellPos } from './types';

/**
 * 「连消倾向」（combo bias）：让 4/5 连机会与连锁更常见、又不白送的棋盘生成调参。
 *
 * 口径（用户裁定）：开局棋盘明显多给 4/5 连；之后新落下的宝石只**轻微**提高 4/5 连概率，
 * 不是全程大量送大消。
 *
 * 补充（GravitySystem）与开局（BoardGenerator）共用这里的评估函数与设计值。
 * 引擎默认全部关闭（强度 0，随机数序列与旧版逐字节一致）；App 实战开启。
 * 设计值由 tests/unit/battleSimulation.test.ts 的 AI 对 AI 模拟调定（基线/调参对比见该测试）。
 *
 * 机制（补充，强度 s = comboBias × 连段护栏系数）：
 *   1. 逐格选色按「邻居同色」加权（COMBO_CLUMP × s），同色更容易成团；
 *   2. 同一批空位试掷 1 + round(|s|) 份补充，按 refillScore 取最好的一份：
 *      留下能打出 4 连 / 5 连 / L / T 的交换最好，普通连锁次之，**补充后立刻成 4+ 的最差**
 *      （大消要靠行动方自己找，不白送额外回合）；
 *   3. 连段护栏：这份补充决定的是下一个决策点的棋盘。本次行动还没打出大消 → 轮到对手的
 *      新回合，满额倾向；已打出大消 → 还是行动方，按 COMBO_STREAK_FADE 衰减并转为打散，
 *      4/5 连机会集中在每个回合开头，而不是让一方连着滚雪球。
 */

/**
 * 实战补充强度（TurnEngine.comboBias）：后续新宝石适度提高 4/5 连机会。
 * 强度 7 = 每次补充试掷 8 份取最好的一份 + 同色成团系数 COMBO_CLUMP × 7。
 * 节奏调参（用户：平均每场行动数 ~38 → ~30）：与 BATTLE_SKULL_CHANCE 0.2、开局 70%/90%、
 * 新的法力涌动规则一起，AI 对 AI 模拟 300 场约 30 次行动/场（battleSimulation.test.ts）。
 */
export const BATTLE_COMBO_BIAS = 7;

/** 实战骷髅落率（开局与补充共用）：骷髅是主要伤害来源，0.16 → 0.2 缩短对局 */
export const BATTLE_SKULL_CHANCE = 0.2;

/**
 * 实战开局强度（BoardGenerator 第 4 参）：> 0 时先按 SETUP_SHARE_* 抽本局开局档位
 * （≥2 处 / 恰 1 处 / 0 处 4+ 交换），再最多试 1 + round(强度) 张合规开局，取第一张落在该档的。
 * 改动前的自然分布：53% 的开局一处 4+ 交换都没有，只有 17% 有 ≥2 处。
 */
export const BATTLE_SETUP_BIAS = 30;

/** 开局有 ≥2 处 4+ 交换的目标占比（原 60%，节奏调参上调到 70%）。 */
export const SETUP_SHARE_TWO_PLUS = 0.7;

/** 开局有 ≥1 处 4+ 交换的目标占比（原 80%，上调到 90%；其余 10% 为一处都没有）。 */
export const SETUP_SHARE_ONE_PLUS = 0.9;

/** 开局档位：2 = ≥2 处 4+ 交换，1 = 恰 1 处，0 = 没有。roll ∈ [0,1)。 */
export function setupBucketFor(roll: number): 0 | 1 | 2 {
  return roll < SETUP_SHARE_TWO_PLUS ? 2 : roll < SETUP_SHARE_ONE_PLUS ? 1 : 0;
}

/**
 * 连段护栏系数表。下标 = 下一个决策点时行动方已连续获得的额外回合数；超出表长取最后一项。
 * 负值 = 反向（在试掷里取最差的一份 + 同色减权），用于打断长连段。
 */
export const COMBO_STREAK_FADE: readonly number[] = [1, -0.5, -1];

/** 逐格选色的邻居同色加权系数（乘以有效强度）。 */
export const COMBO_CLUMP = 0.5;

/** 试掷评分里「能打出 5 连 / L / T」相对普通 4 连的额外加分。 */
export const COMBO_TIER2_BONUS = 0.5;

const resolver = new MatchResolver();

/** 一个匹配组的大消档位：2 = 5 连或 L/T，1 = 4 连，0 = 3 连。 */
export function bigTierOf(group: MatchGroup): 0 | 1 | 2 {
  if (group.shape === 'line3') return 0;
  return group.shape === 'line4plus' && group.cells.length < 5 ? 1 : 2;
}

/**
 * 棋盘上最好的相邻交换能打出的大消档位（0 = 没有 4+ 交换；找到 2 档即停）。
 * 原地交换→检测→换回，返回时棋盘不变。
 */
export function bestSwapTier(board: BoardModel): 0 | 1 | 2 {
  let best: 0 | 1 | 2 = 0;
  for (let row = 0; row < BoardModel.ROWS; row++) {
    for (let col = 0; col < BoardModel.COLS; col++) {
      const a: CellPos = { row, col };
      for (const b of [{ row, col: col + 1 }, { row: row + 1, col }]) {
        if (!BoardModel.inBounds(b)) continue;
        board.swap(a, b);
        for (const group of resolver.findMatches(board)) {
          const tier = bigTierOf(group);
          if (tier > best) best = tier;
        }
        board.swap(a, b);
        if (best === 2) return best;
      }
    }
  }
  return best;
}

/**
 * 棋盘上能打出 4+（4 连 / 5 连 / L / T）的不同相邻交换数，数到 cap 即停。
 * 原地交换→检测→换回，返回时棋盘不变。
 */
export function bigSwapCount(board: BoardModel, cap = 2): number {
  let count = 0;
  for (let row = 0; row < BoardModel.ROWS; row++) {
    for (let col = 0; col < BoardModel.COLS; col++) {
      const a: CellPos = { row, col };
      for (const b of [{ row, col: col + 1 }, { row: row + 1, col }]) {
        if (!BoardModel.inBounds(b)) continue;
        board.swap(a, b);
        const big = resolver.findMatches(board).some((group) => bigTierOf(group) > 0);
        board.swap(a, b);
        if (big && ++count >= cap) return count;
      }
    }
  }
  return count;
}

/**
 * 当前行动之前，行动方已连续获得的额外回合数。actionLog 末项是正在结算的这次行动
 * （beginActionLog 已登记、outcome 尚未回填），向前数同一方 outcome = 'extra-turn' 的连续项。
 */
export function extraTurnStreakOf(actionLog: readonly ActionLogEntry[] | undefined): number {
  if (!actionLog || actionLog.length === 0) return 0;
  const side = actionLog[actionLog.length - 1].side;
  let streak = 0;
  for (let i = actionLog.length - 2; i >= 0; i--) {
    const entry = actionLog[i];
    if (entry.side !== side || entry.outcome !== 'extra-turn') break;
    streak++;
  }
  return streak;
}

/** 护栏系数：nextStreak = 下一个决策点时行动方的连段长度。 */
export function comboStreakFade(nextStreak: number): number {
  return COMBO_STREAK_FADE[Math.min(Math.max(0, nextStreak), COMBO_STREAK_FADE.length - 1)];
}

/**
 * 落定前的空洞里是否有大消的形状：一行/一列连续 ≥4 个空格，或某空格同时处在横竖两条
 * ≥3 的空格段上（L/T）。一次交换形成的两个匹配组不会拼出这种形状，因此首轮判定准确；
 * 连锁/技能清除偶有误判，只会让连消倾向提前收敛（更保守）。
 */
export function hasBigHolePattern(board: BoardModel): boolean {
  const empty = (row: number, col: number) => BoardModel.inBounds({ row, col }) && board.get({ row, col }) === null;
  const runLen = (row: number, col: number, dr: number, dc: number): number => {
    let r = row;
    let c = col;
    while (empty(r - dr, c - dc)) { r -= dr; c -= dc; }
    let len = 0;
    while (empty(r, c)) { len++; r += dr; c += dc; }
    return len;
  };
  for (let row = 0; row < BoardModel.ROWS; row++) {
    for (let col = 0; col < BoardModel.COLS; col++) {
      if (!empty(row, col)) continue;
      const h = runLen(row, col, 0, 1);
      const v = runLen(row, col, 1, 0);
      if (h >= 4 || v >= 4 || (h >= 3 && v >= 3)) return true;
    }
  }
  return false;
}

/**
 * 一份试掷补充的好坏（越大越好）：
 *   - 补充后立刻成匹配（连锁）：含 4+/L/T → -1（不白送自动额外回合）；普通三连 → 0.5（连锁是好手感）；
 *   - 不成匹配：能打出 5 连/L/T 的交换 → 1 + COMBO_TIER2_BONUS，4 连 → 1，都没有 → 0。
 * anti（打散模式，调用方取负后比大小）：连锁与 4+ 机会都算 1（最差），让长连段尽快断掉。
 */
export function refillScore(board: BoardModel, anti = false): number {
  const pending = resolver.findMatches(board);
  if (pending.length > 0) return anti ? 1 : pending.some((g) => g.shape !== 'line3') ? -1 : 0.5;
  const tier = bestSwapTier(board);
  if (anti) return tier > 0 ? 1 : 0;
  return tier === 0 ? 0 : tier === 1 ? 1 : 1 + COMBO_TIER2_BONUS;
}
