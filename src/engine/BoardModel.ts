import type { Gem, CellPos } from './types';

/**
 * 棋盘模型（需求 1）。
 * 8x8 网格，每格最多一个宝石。纯数据结构，不涉及渲染。
 */
export class BoardModel {
  static readonly ROWS = 8;
  static readonly COLS = 8;

  /** grid[row][col]，null 表示空格（仅在解析中间态出现） */
  private grid: (Gem | null)[][];

  constructor() {
    this.grid = Array.from({ length: BoardModel.ROWS }, () =>
      Array.from({ length: BoardModel.COLS }, () => null as Gem | null),
    );
  }

  /** 坐标是否在棋盘范围内 */
  static inBounds(pos: CellPos): boolean {
    return (
      pos.row >= 0 &&
      pos.row < BoardModel.ROWS &&
      pos.col >= 0 &&
      pos.col < BoardModel.COLS
    );
  }

  get(pos: CellPos): Gem | null {
    return this.grid[pos.row][pos.col];
  }

  set(pos: CellPos, gem: Gem | null): void {
    this.grid[pos.row][pos.col] = gem;
  }

  /** 交换两个格子的内容（需求 4） */
  swap(a: CellPos, b: CellPos): void {
    const tmp = this.grid[a.row][a.col];
    this.grid[a.row][a.col] = this.grid[b.row][b.col];
    this.grid[b.row][b.col] = tmp;
  }

  /** 两格是否正交相邻（上下左右，曼哈顿距离为 1，需求 4.1, 4.2） */
  isAdjacent(a: CellPos, b: CellPos): boolean {
    const dr = Math.abs(a.row - b.row);
    const dc = Math.abs(a.col - b.col);
    return dr + dc === 1;
  }

  /** 棋盘是否每格都有宝石（需求 1.4 不变量校验） */
  isFull(): boolean {
    for (let r = 0; r < BoardModel.ROWS; r++) {
      for (let c = 0; c < BoardModel.COLS; c++) {
        if (this.grid[r][c] === null) return false;
      }
    }
    return true;
  }

  /** 深拷贝（用于规则推演，不污染真实状态，如检测合法交换） */
  clone(): BoardModel {
    const copy = new BoardModel();
    for (let r = 0; r < BoardModel.ROWS; r++) {
      for (let c = 0; c < BoardModel.COLS; c++) {
        const gem = this.grid[r][c];
        // 宝石是值对象，浅拷贝其引用即可；但为避免别名共享，复制为新对象
        copy.grid[r][c] = gem ? { id: gem.id, type: gem.type } : null;
      }
    }
    return copy;
  }

  /** 遍历所有格子 */
  forEach(fn: (gem: Gem | null, pos: CellPos) => void): void {
    for (let r = 0; r < BoardModel.ROWS; r++) {
      for (let c = 0; c < BoardModel.COLS; c++) {
        fn(this.grid[r][c], { row: r, col: c });
      }
    }
  }
}
