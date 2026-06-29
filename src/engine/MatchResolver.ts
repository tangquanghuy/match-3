import { BoardModel } from './BoardModel';
import { isSameMatchType, posKey } from './types';
import type { CellPos, GemType } from './types';

/** 匹配形状（需求 7） */
export type MatchShape = 'line3' | 'line4plus' | 'L' | 'T';

/** 一个消除组：一组将被一起消除的格子，附带形状与代表类型 */
export interface MatchGroup {
  cells: CellPos[];
  shape: MatchShape;
  /** 该组的宝石类型（同色或骷髅）。用于结算法力/伤害 */
  gemType: GemType;
}

/** 一条连续的直线段（中间结果） */
interface LineRun {
  cells: CellPos[];
  orientation: 'horizontal' | 'vertical';
}

/**
 * 匹配解析器（需求 6, 7）。
 * 检测棋盘上所有 ≥3 连续同色（或同骷髅）的直线段，
 * 合并共享格子的段为单一消除组，并判定形状。
 */
export class MatchResolver {
  /** 检测棋盘上的全部消除组 */
  findMatches(board: BoardModel): MatchGroup[] {
    const runs: LineRun[] = [
      ...this.scanLines(board, 'horizontal'),
      ...this.scanLines(board, 'vertical'),
    ];

    if (runs.length === 0) return [];

    // 用并查集合并共享格子的段（需求 6.3）
    return this.mergeRuns(board, runs);
  }

  /** 棋盘上是否存在任意匹配（用于交换合法性判断、初始棋盘校验） */
  hasAnyMatch(board: BoardModel): boolean {
    return this.findMatches(board).length > 0;
  }

  /** 扫描某一方向的所有 ≥3 连续同类段 */
  private scanLines(
    board: BoardModel,
    orientation: 'horizontal' | 'vertical',
  ): LineRun[] {
    const runs: LineRun[] = [];
    const outer = orientation === 'horizontal' ? BoardModel.ROWS : BoardModel.COLS;
    const inner = orientation === 'horizontal' ? BoardModel.COLS : BoardModel.ROWS;

    for (let o = 0; o < outer; o++) {
      let runStart = 0;
      for (let i = 1; i <= inner; i++) {
        const prevPos = this.posAt(orientation, o, i - 1);
        const curPos = i < inner ? this.posAt(orientation, o, i) : null;

        const prevGem = board.get(prevPos);
        const curGem = curPos ? board.get(curPos) : null;

        const continues =
          curGem !== null &&
          prevGem !== null &&
          isSameMatchType(prevGem.type, curGem.type);

        if (!continues) {
          const len = i - runStart;
          if (len >= 3 && prevGem !== null) {
            const cells: CellPos[] = [];
            for (let k = runStart; k < i; k++) {
              cells.push(this.posAt(orientation, o, k));
            }
            runs.push({ cells, orientation });
          }
          runStart = i;
        }
      }
    }
    return runs;
  }

  private posAt(
    orientation: 'horizontal' | 'vertical',
    outer: number,
    inner: number,
  ): CellPos {
    return orientation === 'horizontal'
      ? { row: outer, col: inner }
      : { row: inner, col: outer };
  }

  /** 合并共享格子的直线段为消除组，并判定形状 */
  private mergeRuns(board: BoardModel, runs: LineRun[]): MatchGroup[] {
    // 并查集：以 run 索引为节点；共享格子的 run 归为一组
    const parent = runs.map((_, i) => i);
    const find = (x: number): number => {
      while (parent[x] !== x) {
        parent[x] = parent[parent[x]];
        x = parent[x];
      }
      return x;
    };
    const union = (a: number, b: number): void => {
      parent[find(a)] = find(b);
    };

    // 建立格子 -> run 索引的映射，发现冲突即 union
    const cellToRun = new Map<string, number>();
    runs.forEach((run, idx) => {
      for (const cell of run.cells) {
        const key = posKey(cell);
        const existing = cellToRun.get(key);
        if (existing !== undefined) {
          union(existing, idx);
        } else {
          cellToRun.set(key, idx);
        }
      }
    });

    // 按根聚合 run
    const groupsByRoot = new Map<number, LineRun[]>();
    runs.forEach((run, idx) => {
      const root = find(idx);
      const arr = groupsByRoot.get(root) ?? [];
      arr.push(run);
      groupsByRoot.set(root, arr);
    });

    const result: MatchGroup[] = [];
    for (const groupRuns of groupsByRoot.values()) {
      // 收集去重后的格子
      const cellMap = new Map<string, CellPos>();
      let hasH = false;
      let hasV = false;
      let maxLineLen = 0;
      for (const run of groupRuns) {
        if (run.orientation === 'horizontal') hasH = true;
        else hasV = true;
        maxLineLen = Math.max(maxLineLen, run.cells.length);
        for (const cell of run.cells) {
          cellMap.set(posKey(cell), cell);
        }
      }
      const cells = [...cellMap.values()];
      const shape = this.classifyShape(hasH, hasV, maxLineLen);

      // 代表类型：取组内第一个格子的宝石类型
      const firstGem = board.get(cells[0]);
      if (firstGem === null) continue; // 理论不会发生
      result.push({ cells, shape, gemType: firstGem.type });
    }
    return result;
  }

  /** 形状判定（需求 7） */
  private classifyShape(hasH: boolean, hasV: boolean, maxLineLen: number): MatchShape {
    if (hasH && hasV) {
      // 水平与垂直段交汇 → L 或 T。
      // 本阶段统一区分：交汇即视为 L/T 型（均授予额外回合）。
      // 简化：用 'T' 表示所有交叉型；后续可按交汇点位置细分 L/T。
      return 'T';
    }
    if (maxLineLen >= 4) return 'line4plus';
    return 'line3';
  }
}

/** 该形状是否授予额外回合（需求 7.2, 7.3） */
export function grantsExtraTurn(shape: MatchShape): boolean {
  return shape === 'line4plus' || shape === 'L' || shape === 'T';
}
