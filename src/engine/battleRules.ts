/**
 * 战斗规则（活动深化批 2026-09-30）：宿主可按场下发的「棋盘/回合/胜负」规则。
 *
 * 引擎侧口径（内部 numeric id、PlayerSide）；宿主 DTO（externalId、player/enemy）见
 * session/contract.ts 的 BattleRules，由 session 层 engineRulesOf 翻译。
 *
 * 全部字段可选；未下发规则时引擎不进任何新分支、不消耗随机数（既有对局逐字节不变）。
 *
 *  - skullChance / colorWeights / specialDrops：补充掉落（骷髅率覆盖、基色权重、特殊宝石自然掉落池）
 *  - preset：开局棋盘预置特殊宝石（applyBoardPreset，在 createGameState 之前改写生成棋盘）
 *  - turnLimit：回合上限，按「我方回合」计（额外回合不计）；到期 playerWins = 坚守成功、
 *    enemyWins = 限时未完成
 *  - killTargets：指定敌人全部**阵亡**即胜（逃跑不算击杀）
 *  - turnStart：某方回合开始时补法力 / 创造宝石（可 every N 回合一次）
 */
import { BoardModel } from './BoardModel';
import { MatchResolver } from './MatchResolver';
import { hasLegalSwap } from './boardUtils';
import type { SeededRNG } from './rng';
import {
  BaseColor, PlayerSide, matchJoinKey, specialGem,
  type CellPos, type SpecialGemKind, type SpecialGemSpec,
} from './types';

export interface RuleGemSpec {
  gem: SpecialGemSpec;
  count: number;
  /** 0~1，缺省必定 */
  chance?: number;
}

export interface RuleTurnStart {
  side: PlayerSide;
  /** 每 N 个该方回合触发一次（该方第 1、1+N、1+2N… 回合），缺省 1 */
  every?: number;
  mana?: {
    amount: number;
    /** 指定单位（内部 id）；缺省 = 该方全体存活 */
    targets?: readonly number[];
    /** 只给关联这些颜色的单位；缺省不限 */
    colors?: readonly BaseColor[];
  };
  createGems?: readonly RuleGemSpec[];
}

export interface EngineBattleRules {
  skullChance?: number;
  colorWeights?: Partial<Record<BaseColor, number>>;
  specialDrops?: { chance: number; pool: readonly { gem: SpecialGemSpec; weight: number }[] };
  preset?: readonly { gem: SpecialGemSpec; count: number; onColor?: BaseColor }[];
  turnLimit?: { turns: number; onExpire: 'playerWins' | 'enemyWins' };
  killTargets?: readonly number[];
  turnStart?: readonly RuleTurnStart[];
}

export type RuleEndReason = 'turn-limit' | 'objective';

/** 全部特殊宝石 kind（规则校验白名单）；Record 保证与 SpecialGemKind 联合同步 */
const KIND_TABLE: Record<SpecialGemKind, true> = {
  doomSkull: true, uberDoomSkull: true, bomb: true, web: true, lightningRow: true, lightningCol: true,
  wildcard: true, wish: true, hourglass: true, bootyGem: true, ghost: true,
  burningGem: true, freezeGem: true, curseGem: true, bleedGem: true, poisonGem: true, deathMarkGem: true,
  terrorGem: true, entangleGem: true, enrageGem: true, submergeGem: true, faerieFireGem: true, stunGem: true,
  barrierGem: true, dragonGem: true, giantGem: true, spiritGem: true, manaPotionGem: true, candyGem: true,
  elementalStar: true, umbralStar: true, angelGem: true, daemonicPortalGem: true, gargoyleGem: true,
  stoneBlock: true, lycanthropyGem: true, decayGem: true, volcanoGem: true, trapGem: true,
  enchantedGem: true, mimicGem: true,
};
export const RULE_GEM_KINDS: ReadonlySet<string> = new Set(Object.keys(KIND_TABLE));
/** 六色族：规格必须带 color */
export const RULE_COLORED_GEM_KINDS: ReadonlySet<string> = new Set(['dragonGem', 'giantGem', 'spiritGem', 'manaPotionGem', 'candyGem']);

const ALL_COLORS = Object.values(BaseColor) as BaseColor[];

/**
 * 开局预置特殊宝石：在生成好的棋盘上把若干普通色宝石就地换成特殊宝石。
 * 选格规则：可匹配宝石优先落在同色格（不改变原有的「无现成三连」性质），
 * 不可匹配宝石落在任意普通色格；落子后若造出现成三连或盘面无合法交换则撤回换格。
 * 返回实际放置的格位（测试/表现用）。无 preset 时不消耗随机数。
 */
export function applyBoardPreset(
  board: BoardModel,
  preset: EngineBattleRules['preset'],
  rng: SeededRNG,
): CellPos[] {
  if (!preset || preset.length === 0) return [];
  const resolver = new MatchResolver();
  const placed: CellPos[] = [];
  const used = new Set<string>();
  for (const entry of preset) {
    const type = specialGem(entry.gem.kind, entry.gem.tier, entry.gem.color);
    const join = matchJoinKey(type);
    const want = entry.onColor ?? (join && (ALL_COLORS as string[]).includes(join) ? join as BaseColor : undefined);
    for (let n = 0; n < entry.count; n++) {
      const cells: CellPos[] = [];
      board.forEach((gem, pos) => {
        if (!gem || gem.type.kind !== 'color' || used.has(`${pos.row},${pos.col}`)) return;
        if (want && gem.type.color !== want) return;
        cells.push(pos);
      });
      // 洗牌后逐个试，直到找到不破坏棋盘性质的格位
      for (let i = cells.length - 1; i > 0; i--) {
        const j = rng.nextInt(i + 1);
        [cells[i], cells[j]] = [cells[j]!, cells[i]!];
      }
      for (const pos of cells) {
        const before = board.get(pos)!;
        board.set(pos, { id: before.id, type });
        if (!resolver.hasAnyMatch(board) && hasLegalSwap(board)) {
          used.add(`${pos.row},${pos.col}`);
          placed.push(pos);
          break;
        }
        board.set(pos, before);
      }
    }
  }
  return placed;
}

/** 规则回合开始项在该方第 turnNumber（1 起）回合是否触发 */
export function turnStartDue(entry: RuleTurnStart, turnNumber: number): boolean {
  const every = Math.max(1, Math.floor(entry.every ?? 1));
  return (turnNumber - 1) % every === 0;
}

/** 棋盘行列数（校验层引用，避免 session 依赖 BoardModel 细节） */
export const RULE_BOARD_CELLS = BoardModel.ROWS * BoardModel.COLS;
