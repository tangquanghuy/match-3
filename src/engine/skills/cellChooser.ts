/**
 * 选定宝石格机制（技能编写与演出 · 需求 2B）。
 *
 * 与 Color/TargetChooser 同一套路：技能里"引爆你选定的宝石"用宝石段占位 'CELL'（见 gems.ts），
 * 释放时由施法方决定具体格子：
 *   - 玩家方：点棋盘一格（表现层注入 FixedCellChooser）；
 *   - AI 方：按确定性策略自动选有用的转化或摧毁目标；无技能收益时选靠近中心的非空格。
 *
 * 纯逻辑：无 pixi/gsap/dom；确定性（需求 2B.7）。
 *
 * 注：摧毁/爆破"整行/整列"的技能也复用这套选格器——玩家点选一枚宝石，
 * 引擎再以该格所在行/列为目标（见 gems.ts 的 chosenLine 目标集）。无需另一套选行列 UI。
 */
import { BoardModel } from '../BoardModel';
import { ALL_BASE_COLORS, matchJoinKey } from '../types';
import type { BaseColor, CellPos } from '../types';
import type { GameState } from '../GameState';
import type { SeededRNG } from '../rng';
import type { SkillPrototype } from './prototypes';
import type { ClearGemParams } from './effects/gems';
import { colorAllowed, type ChoiceRule } from './gowChoiceRules';
import { casterSide, compareChoiceScores, manaNeeds, sameGemType, transformOutput, transformedMatchScore } from './gemChoiceScore';

/** 格子选择器：为一次技能释放返回一个棋盘坐标；无可选格返回 null。
 *  rule = 原生 spell Target 限制（ManaGemsOnly / <X>Gems / Not<X>Gems，见 gowChoiceRules.ts）；AI 选格器遵守。 */
export interface CellChooser {
  choose(state: GameState, casterId: number, rng: SeededRNG, rule?: ChoiceRule, proto?: SkillPrototype, chosenColor?: BaseColor): CellPos | null;
}

function clearFootprint(params: ClearGemParams, selected: CellPos): CellPos[] {
  const target = params.target;
  let cells: CellPos[];
  if (target.kind === 'cell' && target.cell === 'CELL') cells = [selected];
  else if (target.kind === 'chosenLine') cells = Array.from({ length: 8 }, (_, i) => target.orientation === 'row'
    ? { row: selected.row, col: i } : { row: i, col: selected.col });
  else if (target.kind === 'chosenCross') cells = [
    ...Array.from({ length: 8 }, (_, col) => ({ row: selected.row, col })),
    ...Array.from({ length: 8 }, (_, row) => ({ row, col: selected.col })),
  ];
  else if (target.kind === 'area' && target.center === 'CELL') {
    cells = [];
    if (target.shape === 'x') {
      for (let row = 0; row < BoardModel.ROWS; row++) {
        const delta = row - selected.row;
        cells.push({ row, col: selected.col + delta }, { row, col: selected.col - delta });
      }
    }
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
      const near = Math.abs(dr) <= 1 && Math.abs(dc) <= 1;
      const include = target.shape === 'square5' || target.shape === 'circle5' && dr * dr + dc * dc <= 6.25
        || target.shape === 'square3' && near || target.shape === 'cross3' && near && (dr === 0 || dc === 0)
        || target.shape === 'row3' && dr === 0 && Math.abs(dc) <= 1;
      if (include) cells.push({ row: selected.row + dr, col: selected.col + dc });
    }
  } else return [selected];
  if (params.mode === 'explode' && target.kind !== 'area') {
    cells = cells.flatMap(pos => Array.from({ length: 9 }, (_, i) => ({
      row: pos.row + Math.floor(i / 3) - 1, col: pos.col + i % 3 - 1,
    })));
  }
  const seen = new Set<string>();
  return cells.filter(pos => {
    const key = `${pos.row},${pos.col}`;
    if (!BoardModel.inBounds(pos) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * AI 选格策略：优先转化出己方有用的四/五连，其次其他四/五连、己方有用的即时匹配；
 * 摧毁优先己方缺法力的颜色。平局按中心距离、行列顺序取值；无合规格返回 null。
 */
export class AiCellChooser {
  choose(state: GameState, casterId: number, _rng: SeededRNG, rule?: ChoiceRule, proto?: SkillPrototype, chosenColor?: BaseColor): CellPos | null {
    const board = state.board;
    const cx = (BoardModel.ROWS - 1) / 2;
    const cy = (BoardModel.COLS - 1) / 2;
    const side = casterSide(state, casterId);
    const caster = side ? state.teams[side].characters.find(ch => ch.id === casterId) : undefined;
    const needs = side ? manaNeeds(state.teams[side].characters) : new Map<BaseColor, number>();
    let best: CellPos | null = null;
    let bestScore: readonly number[] = [-Infinity];
    board.forEach((gem, pos) => {
      if (!gem) return;
      // P-chooser-native-restrictions：ManaGemsOnly 只选普通法力（颜色）宝石；颜色限制同选色器
      if (rule?.manaGemsOnly && gem.type.kind !== 'color') return;
      if (rule && gem.type.kind === 'color' && !colorAllowed(rule, gem.type.color)) return;
      const d = Math.abs(pos.row - cx) + Math.abs(pos.col - cy);
      let matchScore: readonly number[] = [0, 0, 0, 0];
      let clearedMana = 0, clearedCount = 0, transformable = false;
      for (const seg of proto?.segments ?? []) {
        if (seg.kind !== 'gem') continue;
        if (seg.params.op === 'transform' && seg.params.from === 'CELL') {
          const output = transformOutput(seg.params, caster, chosenColor);
          if (output && !sameGemType(gem.type, output)) {
            transformable = true;
            matchScore = transformedMatchScore(board, [pos], output, needs);
          }
        } else if (seg.params.op === 'clear') {
          const target = seg.params.target;
          const selected = target.kind === 'cell' && target.cell === 'CELL'
            || target.kind === 'area' && target.center === 'CELL'
            || target.kind === 'chosenLine' || target.kind === 'chosenCross';
          if (!selected) continue;
          for (const cell of clearFootprint(seg.params, pos)) {
            const hit = board.get(cell);
            if (!hit) continue;
            clearedCount++;
            const key = matchJoinKey(hit.type);
            if (ALL_BASE_COLORS.includes(key as BaseColor)) clearedMana += needs.get(key as BaseColor) ?? 0;
          }
        }
      }
      const score = matchScore[0]! > 0 ? [matchScore[0]! + 2, ...matchScore.slice(1), -d]
        : clearedCount > 0 ? [clearedMana > 0 ? 2 : 1, clearedMana, clearedCount, -d]
          : transformable ? [1, 0, 0, -d] : [0, -d];
      if (compareChoiceScores(score, bestScore) > 0) {
        bestScore = score;
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
