import { BoardModel } from './BoardModel';
import { DOOMSKULL_BONUS_DAMAGE, UBER_DOOMSKULL_BONUS_DAMAGE, matchJoinKey, posKey } from './types';
import type { BaseColor, CellPos, GemType } from './types';

/** 匹配形状（需求 7） */
export type MatchShape = 'line3' | 'line4plus' | 'L' | 'T';

/**
 * 一个消除组的结算类别（特殊宝石引入后，组的归属不再等于"组内第一个宝石的类型"）：
 *   - color：颜色组。通配按解析色计入；manaMultiplier 为组内通配倍率**相加**合计
 *     （官方 Heroic Gems 口径：同一次匹配多颗通配倍率相加，x2+x3=x5；无通配 = 1）
 *   - skull：骷髅族组（普通骷髅/末日骷髅/至尊末日骷髅）。bonusDamage 为末日族加伤合计
 *   - wildOnly：全通配组。无归属色，只消除不结算（3 颗通配互连且无颜色可依附的极小概率局面）
 */
export type MatchSettle =
  | { kind: 'color'; color: BaseColor; manaMultiplier: number }
  | { kind: 'skull'; bonusDamage: number }
  | { kind: 'wildOnly' };

/** 一个消除组：一组将被一起消除的格子，附带形状与结算类别 */
export interface MatchGroup {
  cells: CellPos[];
  shape: MatchShape;
  /** 该组首个格子的宝石类型（事件元数据用；法力/骷髅结算看 settle） */
  gemType: GemType;
  /** 结算类别（颜色归属、通配倍率、末日骷髅计数） */
  settle: MatchSettle;
}

/** 一条连续的直线段（中间结果） */
interface LineRun {
  cells: CellPos[];
  orientation: 'horizontal' | 'vertical';
}

/**
 * 匹配解析器（需求 6, 7）。
 * 检测棋盘上所有 ≥3 连续同类的直线段，合并共享格子的段为单一消除组，并判定形状。
 *
 * 匹配性按 `matchJoinKey` 的 run 级连接键判定（逐对比较不足以表达通配语义）：
 *   - 通配加入任意颜色 run（含纯通配前缀），但不与骷髅族相连；
 *   - 末日骷髅与普通骷髅同族；织网/沙漏/闪电/状态搬运族（GEMS-SEMANTICS-2）按各自归属色；
 *   - 炸弹/许愿/幽魂/死亡标记宝石不可匹配，截断任何 run。
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
      let runCells: CellPos[] = [];
      // 当前 run 的连接键：色名 / 'skull'；null = 纯通配前缀（尚未定色）
      let runKey: string | null = null;

      const flush = (): void => {
        if (runCells.length >= 3) runs.push({ cells: runCells, orientation });
        runCells = [];
        runKey = null;
      };

      for (let i = 0; i < inner; i++) {
        const pos = this.posAt(orientation, o, i);
        const gem = board.get(pos);
        const key = gem ? matchJoinKey(gem.type) : null;

        if (key === null) {
          // 空格或不可匹配宝石（炸弹/许愿）：截断
          flush();
          continue;
        }
        if (key === 'wildcard') {
          if (runKey === 'skull') {
            // 通配不与骷髅族相连：骷髅 run 到此为止，通配开启新的待定 run
            flush();
            runCells = [pos];
            continue;
          }
          runCells.push(pos);
          continue;
        }
        // 颜色 / 骷髅键
        if (runKey === null) {
          if (runCells.length > 0 && key === 'skull') {
            // 纯通配前缀不能并入骷髅 run（通配不匹配骷髅）
            flush();
          }
          runKey = key;
          runCells.push(pos);
          continue;
        }
        if (runKey === key) {
          runCells.push(pos);
          continue;
        }
        flush();
        runKey = key;
        runCells = [pos];
      }
      flush();
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
      result.push({
        cells,
        shape,
        gemType: firstGem.type,
        settle: this.resolveSettle(board, cells),
      });
    }
    return result;
  }

  /**
   * 解析一个消除组的结算类别：颜色归属（组内首个非通配颜色）、通配倍率相加、末日骷髅计数。
   * 官方口径（Heroic Gems，DECISIONS 四项拍板②）：同一次匹配中多颗通配的倍率**相加**
   * （x2+x3=x5；单颗 x2 仍是 ×2），因此累加器从 0 起，结算时无通配回落 1。
   * 骷髅族与颜色不会混在一组（共享格的宝石只可能属于一侧），极小概率的交叉通配局面
   * （一个通配同时被红蓝两个方向依附）按扫描序首个颜色计，全部消除的宝石数计法力量。
   */
  private resolveSettle(board: BoardModel, cells: CellPos[]): MatchSettle {
    let color: BaseColor | null = null;
    let multiplier = 0;
    let skullish = false;
    let bonusDamage = 0;

    for (const cell of cells) {
      const gem = board.get(cell);
      if (!gem) continue;
      const t = gem.type;
      if (t.kind === 'color') {
        if (color === null) color = t.color;
      } else if (t.kind === 'skull') {
        skullish = true;
      } else if (t.kind === 'special') {
        switch (t.spec.kind) {
          case 'wildcard':
            // 官方相加口径：x2+x3=x5（乘法旧口径为 ×6，已按拍板改）
            multiplier += t.spec.tier ?? 2;
            break;
          case 'doomSkull':
            skullish = true;
            bonusDamage += DOOMSKULL_BONUS_DAMAGE;
            break;
          case 'uberDoomSkull':
            skullish = true;
            bonusDamage += UBER_DOOMSKULL_BONUS_DAMAGE;
            break;
          default: {
            // 织网/沙漏/闪电/状态搬运族（GEMS-SEMANTICS-2）：凡 matchJoinKey 归属基色的
            // 特殊宝石都计入组归属色；不可匹配类（炸弹/许愿/幽魂/死亡标记）键为 null，保守跳过
            const c = matchJoinKey(t);
            if (color === null && c !== null && c !== 'skull' && c !== 'wildcard') color = c as BaseColor;
            break;
          }
        }
      }
    }

    if (skullish) return { kind: 'skull', bonusDamage };
    if (color !== null) {
      return { kind: 'color', color, manaMultiplier: Math.max(1, multiplier) };
    }
    return { kind: 'wildOnly' };
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
