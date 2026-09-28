/**
 * 选定宝石格机制（技能编写与演出 · 需求 2B）。
 *
 * 与 Color/TargetChooser 同一套路：技能里"引爆你选定的宝石"用宝石段占位 'CELL'（见 gems.ts），
 * 释放时由施法方决定具体格子：
 *   - 玩家方：点棋盘一格（表现层注入 FixedCellChooser）；
 *   - AI 方：按确定性策略自动选（默认棋盘中心最近的非空格），用种子化 RNG 打破平局。
 *
 * 纯逻辑：无 pixi/gsap/dom；确定性（需求 2B.7）。
 *
 * 注：摧毁/爆破"整行/整列"的技能也复用这套选格器——玩家点选一枚宝石，
 * 引擎再以该格所在行/列为目标（见 gems.ts 的 chosenLine 目标集）。无需另一套选行列 UI。
 */
import { BoardModel } from '../BoardModel';
import type { CellPos } from '../types';
import type { GameState } from '../GameState';
import type { SeededRNG } from '../rng';
import { colorAllowed, type ChoiceRule } from './gowChoiceRules';

/** 格子选择器：为一次技能释放返回一个棋盘坐标；无可选格返回 null。
 *  rule = 原生 spell Target 限制（ManaGemsOnly / <X>Gems / Not<X>Gems，见 gowChoiceRules.ts）；AI 选格器遵守。 */
export interface CellChooser {
  choose(state: GameState, casterId: number, rng: SeededRNG, rule?: ChoiceRule): CellPos | null;
}

/**
 * AI 选格策略（确定性）：选离棋盘中心最近的非空格（有原生目标限制时只在合规格中选）；
 * 平局按 (row,col) 字典序取更前者。全空棋盘 / 无合规格 → null。
 */
export class AiCellChooser {
  choose(state: GameState, _casterId: number, _rng: SeededRNG, rule?: ChoiceRule): CellPos | null {
    const board = state.board;
    const cx = (BoardModel.ROWS - 1) / 2;
    const cy = (BoardModel.COLS - 1) / 2;
    let best: CellPos | null = null;
    let bestScore = Infinity;
    board.forEach((gem, pos) => {
      if (!gem) return;
      // P-chooser-native-restrictions：ManaGemsOnly 只选普通法力（颜色）宝石；颜色限制同选色器
      if (rule?.manaGemsOnly && gem.type.kind !== 'color') return;
      if (rule && gem.type.kind === 'color' && !colorAllowed(rule, gem.type.color)) return;
      const d = Math.abs(pos.row - cx) + Math.abs(pos.col - cy);
      // 严格小于才替换；forEach 按行列升序 → 平局取字典序更前者
      if (d < bestScore) {
        bestScore = d;
        best = { row: pos.row, col: pos.col };
      }
    });
    return best;
  }
}

/** 固定选格：玩家已点选某格时用（表现层注入） */
export class FixedCellChooser {
  constructor(private cell: CellPos) {}
  choose(): CellPos | null {
    return { row: this.cell.row, col: this.cell.col };
  }
}

/**
 * 判断一个技能原型是否需要玩家"点选一枚宝石"（→ ctx.chosenCell）。
 * 覆盖三类段，都以选定的宝石格为起点：
 *   - clear 的 cell 且 cell='CELL'：以该格为中心（destroy 单格 / explode 3x3）
 *   - clear 的 chosenLine：取该格所在的整行 / 整列
 *   - transform 且 from='CELL'（原语 Wave4 批，9638「Choose a Gem. Convert it」）：
 *     转换选定单格那颗宝石
 */
export function prototypeNeedsCell(proto: { segments: readonly unknown[] }): boolean {
  for (const seg of proto.segments as ReadonlyArray<Record<string, unknown>>) {
    // P-R6-chosen-diagonal-transform: a Target Board spell whose cell step sits inside a random branch (8762
    // Randomize AB-CD) still picks the cell before the cast
    if (seg.kind === 'oneOf' && Array.isArray(seg.options)
      && (seg.options as unknown[][]).some((opt) => prototypeNeedsCell({ segments: opt }))) return true;
    if (seg.kind !== 'gem') continue;
    const params = seg.params as { op?: string; target?: Record<string, unknown>; from?: unknown } | undefined;
    if (params?.op === 'clear') {
      const target = params.target;
      if (!target) continue;
      if (target.kind === 'cell' && target.cell === 'CELL') return true;
      if (target.kind === 'area' && target.center === 'CELL') return true;
      if (target.kind === 'chosenLine') return true;
      if (target.kind === 'chosenCross') return true;
    }
    if (params?.op === 'transform' && params.from === 'CELL') return true;
    if (params?.op === 'transform' && (params as { diagonalAnchor?: string }).diagonalAnchor === 'chosenCell') return true;
  }
  return false;
}
