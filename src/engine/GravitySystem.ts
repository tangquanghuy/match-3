import { BoardModel } from './BoardModel';
import type { Gem, CellPos, GemType } from './types';
import type { SeededRNG } from './rng';
import { colorGem, ALL_BASE_COLORS } from './types';

/** 重力造成的单个宝石移动（需求 8.3） */
export interface GemMove {
  gemId: number;
  from: CellPos;
  to: CellPos;
}

/** 补充生成的单个新宝石（需求 8.4） */
export interface GemSpawn {
  gemId: number;
  to: CellPos;
  gemType: GemType;
}

/** 重力 + 补充的结果 */
export interface GravityResult {
  moves: GemMove[];
  spawns: GemSpawn[];
}

/**
 * 重力与补充系统（需求 8.1-8.4）。
 * - 重力：每列中现存宝石下落填补空格（保持原有相对顺序）。
 * - 补充：列顶剩余空格用新生成的宝石填满。
 */
export class GravitySystem {
  constructor(
    private rng: SeededRNG,
    private nextGemId: () => number,
  ) {}

  /**
   * 对棋盘施加重力并补充顶部。直接修改传入的 board。
   * @param skullChance 补充时生成骷髅宝石的概率（默认 0，本阶段三消主线不掺骷髅；战斗阶段调高）
   */
  apply(board: BoardModel, skullChance = 0): GravityResult {
    const moves: GemMove[] = [];
    const spawns: GemSpawn[] = [];

    for (let col = 0; col < BoardModel.COLS; col++) {
      // 1. 自底向上收集该列现存宝石（保序），同时记录其原始行号
      const survivors: { gem: Gem; fromRow: number }[] = [];
      for (let row = BoardModel.ROWS - 1; row >= 0; row--) {
        const gem = board.get({ row, col });
        if (gem !== null) survivors.push({ gem, fromRow: row });
      }

      // 2. 清空该列
      for (let row = 0; row < BoardModel.ROWS; row++) {
        board.set({ row, col }, null);
      }

      // 3. 从底部回填现存宝石，记录移动（仅当行号变化时才算移动）
      let writeRow = BoardModel.ROWS - 1;
      for (const { gem, fromRow } of survivors) {
        const to: CellPos = { row: writeRow, col };
        board.set(to, gem);
        if (fromRow !== writeRow) {
          moves.push({ gemId: gem.id, from: { row: fromRow, col }, to });
        }
        writeRow--;
      }

      // 4. 顶部剩余空格补充新宝石（writeRow 及以上）
      for (let row = writeRow; row >= 0; row--) {
        const gemType = this.randomGemType(skullChance);
        const gem: Gem = { id: this.nextGemId(), type: gemType };
        const to: CellPos = { row, col };
        board.set(to, gem);
        spawns.push({ gemId: gem.id, to, gemType });
      }
    }

    return { moves, spawns };
  }

  private randomGemType(skullChance: number): GemType {
    if (skullChance > 0 && this.rng.next() < skullChance) {
      return { kind: 'skull', variant: 'normal' };
    }
    return colorGem(this.rng.pick(ALL_BASE_COLORS));
  }
}
