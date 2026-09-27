import { BoardModel } from './BoardModel';
import { MatchResolver } from './MatchResolver';
import { SeededRNG } from './rng';
import { colorGem, skullGem, ALL_BASE_COLORS } from './types';
import type { Gem, CellPos, GemType } from './types';
import { bestSwapTier } from './comboBias';

/**
 * 初始棋盘生成（需求 3）。
 * 保证：(1) 无预成匹配；(2) 至少存在一个合法交换。
 */
export class BoardGenerator {
  private resolver = new MatchResolver();

  constructor(
    private rng: SeededRNG,
    private nextGemId: () => number,
    /** 初始棋盘骷髅占比（0 = 纯颜色）。Gems of War 风格下骷髅为常驻成分 */
    private skullChance = 0,
    /**
     * 开局「连消倾向」（0 = 关闭，随机数序列与旧版逐字节一致）。> 0 时最多试
     * 1 + round(setupBias) 张合规开局，优先有 4+ 交换的那张；App 实战用 BATTLE_SETUP_BIAS。
     */
    private setupBias = 0,
  ) {}

  generate(): BoardModel {
    // 开局连消倾向：合规开局最多试 1 + round(setupBias) 张，优先留下有 4+ 交换的那张；
    // 都没有则用第一张合规开局。setupBias = 0 时首张合规即返回（与旧版一致）。
    const tries = this.setupBias > 0 ? 1 + Math.round(this.setupBias) : 1;
    let firstValid: BoardModel | null = null;
    let validCount = 0;
    // 反复生成直到满足两个条件。8x8 6 色下通常一两次即成。
    for (let attempt = 0; attempt < 200; attempt++) {
      const board = this.fillWithoutMatches();
      if (!this.hasLegalSwap(board)) continue;
      if (tries === 1 || bestSwapTier(board) > 0) return board;
      firstValid ??= board;
      if (++validCount >= tries) return firstValid;
    }
    // 极端兜底：返回一个无匹配棋盘（合法交换检测失败概率极低）
    return firstValid ?? this.fillWithoutMatches();
  }

  /** 该类型的"匹配键"（同色或同为骷髅视为同键） */
  private matchKey(type: GemType): string {
    return type.kind === 'skull' ? 'skull' : type.kind === 'color' ? type.color : 'other';
  }

  /** 逐格填充，且避免在放置时立即形成 ≥3 连（需求 3.1） */
  private fillWithoutMatches(): BoardModel {
    const board = new BoardModel();
    for (let row = 0; row < BoardModel.ROWS; row++) {
      for (let col = 0; col < BoardModel.COLS; col++) {
        // 排除会与左侧两格或上方两格形成三连的"匹配键"
        const forbidden = new Set<string>();

        const left1 = col >= 1 ? board.get({ row, col: col - 1 }) : null;
        const left2 = col >= 2 ? board.get({ row, col: col - 2 }) : null;
        if (left1 && left2 && this.matchKey(left1.type) === this.matchKey(left2.type)) {
          forbidden.add(this.matchKey(left1.type));
        }

        const up1 = row >= 1 ? board.get({ row: row - 1, col }) : null;
        const up2 = row >= 2 ? board.get({ row: row - 2, col }) : null;
        if (up1 && up2 && this.matchKey(up1.type) === this.matchKey(up2.type)) {
          forbidden.add(this.matchKey(up1.type));
        }

        const gemType = this.pickGemType(forbidden);
        const gem: Gem = { id: this.nextGemId(), type: gemType };
        board.set({ row, col }, gem);
      }
    }
    return board;
  }

  /** 在不触发三连的候选里挑一个类型：先决定是否骷髅，再回退颜色 */
  private pickGemType(forbidden: Set<string>): GemType {
    const skullOk = !forbidden.has('skull');
    if (skullOk && this.skullChance > 0 && this.rng.next() < this.skullChance) {
      return skullGem();
    }
    const candidates = ALL_BASE_COLORS.filter((c) => !forbidden.has(c));
    if (candidates.length === 0) {
      return skullOk ? skullGem() : colorGem(this.rng.pick(ALL_BASE_COLORS));
    }
    return colorGem(this.rng.pick(candidates));
  }

  /** 是否存在至少一个合法交换（在 clone 上试遍所有相邻交换，需求 3.2） */
  private hasLegalSwap(board: BoardModel): boolean {
    for (let row = 0; row < BoardModel.ROWS; row++) {
      for (let col = 0; col < BoardModel.COLS; col++) {
        const a: CellPos = { row, col };
        // 仅试右、下两个方向，覆盖所有相邻对
        const neighbors: CellPos[] = [
          { row, col: col + 1 },
          { row: row + 1, col },
        ];
        for (const b of neighbors) {
          if (!BoardModel.inBounds(b)) continue;
          const trial = board.clone();
          trial.swap(a, b);
          if (this.resolver.hasAnyMatch(trial)) return true;
        }
      }
    }
    return false;
  }
}
