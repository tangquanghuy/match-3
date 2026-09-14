import { BoardModel } from './BoardModel';
import type { Gem, CellPos, GemType, BaseColor } from './types';
import type { SeededRNG } from './rng';
import { colorGem, specialGem, ALL_BASE_COLORS } from './types';
import type { SpecialGemKind } from './types';

/**
 * 风暴（Storm）掉落加成：风暴激活时对应色新宝石的权重倍率（其余色权重 1）。
 * 官方实测火风暴下新宝石约 27.1% 为对应色（正常 14.3% = 1/7）≈ ×1.9；
 * 引擎加权后对应色概率 = 1.9/(5+1.9) ≈ 27.5%，与实测吻合。可调常量。
 * 查证来源见 DECISIONS.md「风暴（Storm）全局掉落修正」。
 */
export const STORM_DROP_WEIGHT = 1.9;

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
  /**
   * 补充时生成特殊宝石的概率（0～1，默认 0 = 关闭）。
   * 自然掉落暂不启用（任务书：留配置开关）；只掉可匹配的特殊宝石，
   * 避免不可匹配的炸弹/许愿淤积棋盘。关闭时不消耗额外随机数，不影响既有确定性。
   */
  specialSpawnChance = 0;

  /** 可自然掉落的特殊宝石（都是可匹配的） */
  private static readonly SPAWNABLE_SPECIALS: readonly SpecialGemKind[] = [
    'doomSkull',
    'web',
    'lightningRow',
    'lightningCol',
    'hourglass',
  ];

  constructor(
    private rng: SeededRNG,
    private nextGemId: () => number,
  ) {}

  /**
   * 对棋盘施加重力并补充顶部。直接修改传入的 board。
   * @param skullChance 补充时生成骷髅宝石的概率（默认 0，本阶段三消主线不掺骷髅；战斗阶段调高）
   * @param stormWeights 风暴掉落权重（颜色 → 权重，>1 的色更容易掉落）。
   *                     缺省/空表时颜色分布与旧版完全一致（均匀 pick，随机数消耗序列不变）。
   */
  apply(board: BoardModel, skullChance = 0, stormWeights?: ReadonlyMap<BaseColor, number>): GravityResult {
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
        const gemType = this.randomGemType(skullChance, stormWeights);
        const gem: Gem = { id: this.nextGemId(), type: gemType };
        const to: CellPos = { row, col };
        board.set(to, gem);
        spawns.push({ gemId: gem.id, to, gemType });
      }
    }

    return { moves, spawns };
  }

  private randomGemType(skullChance: number, stormWeights?: ReadonlyMap<BaseColor, number>): GemType {
    if (this.specialSpawnChance > 0 && this.rng.next() < this.specialSpawnChance) {
      return specialGem(this.rng.pick(GravitySystem.SPAWNABLE_SPECIALS));
    }
    if (skullChance > 0 && this.rng.next() < skullChance) {
      return { kind: 'skull', variant: 'normal' };
    }
    return colorGem(this.pickColor(stormWeights));
  }

  /**
   * 按权重挑一种颜色。无风暴（缺省/空表）走旧版均匀 pick——不进加权分支，
   * 保证既有对局的随机数消耗序列逐字节不变（回归护栏）。
   * 加权实现：每色权重（风暴色 ×STORM_DROP_WEIGHT，其余 1）累计后按一次 rng.next() 落点取色，
   * 与旧版同样只消耗一个随机数。
   */
  private pickColor(stormWeights?: ReadonlyMap<BaseColor, number>): BaseColor {
    if (!stormWeights || stormWeights.size === 0) return this.rng.pick(ALL_BASE_COLORS);
    let total = 0;
    for (const color of ALL_BASE_COLORS) total += stormWeights.get(color) ?? 1;
    let roll = this.rng.next() * total;
    for (const color of ALL_BASE_COLORS) {
      roll -= stormWeights.get(color) ?? 1;
      if (roll < 0) return color;
    }
    return ALL_BASE_COLORS[ALL_BASE_COLORS.length - 1];
  }
}
