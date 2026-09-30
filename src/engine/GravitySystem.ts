import { BoardModel } from './BoardModel';
import { COMBO_CLUMP, comboStreakFade, extraTurnStreakOf, hasBigHolePattern, refillScore } from './comboBias';
import type { Gem, CellPos, GemType, BaseColor, ActionLogEntry } from './types';
import type { SeededRNG } from './rng';
import { colorGem, specialGem, ALL_BASE_COLORS } from './types';
import type { SpecialGemKind, SpecialGemSpec } from './types';

/** Storm-color weight is a project tuning value, not an official published drop rate.
 * Within the six-color draw the chosen color gets 1.9 / (5 + 1.9) ~= 27.5%.
 * Its unconditional board-spawn rate additionally depends on skull/special odds.
 * The Steam discussion gives a different hypothetical 7-gem model, not a measured rate.
 */
export const STORM_DROP_WEIGHT = 1.9;

/**
 * 骷髅系风暴的掉落参数（TurnEngine 由 Team.storm.dropKind 换算，GravitySystem 只认数值）：
 * - kind 'skull'：chance = 加成后的骷髅生成概率（骸骨风暴 = skullChance × STORM_DROP_WEIGHT）；
 * - kind 'doomSkull' | 'uberDoomSkull'：chance = 骷髅判定前的一次额外掉落判定概率
 *   （官方未公开末日系掉率，设计值取"可感知但克制"，可调）。
 */
export interface SkullDropBoost {
  kind: 'skull' | 'doomSkull' | 'uberDoomSkull';
  chance: number;
}

/** 末日风暴：末日骷髅从顶部掉落的概率（官方未公开数值，设计值） */
export const STORM_DOOMSKULL_DROP = 0.04;
/** 超级末日风暴：至尊末日骷髅从顶部掉落的概率（官方未公开数值，设计值） */
export const STORM_UBER_DOOMSKULL_DROP = 0.02;

/** 连消倾向补充的落点上下文 */
interface ComboContext {
  board: BoardModel;
  pos: CellPos;
  /** 有效强度：> 0 同色加权，< 0 同色减权（打散） */
  bias: number;
}

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

  /**
   * 自然掉落的特殊宝石加权池（战斗规则 specialDrops，活动深化批）。缺省 null = 旧白名单
   * 均匀 pick；给出时按 weight 一次 rng.next() 落点取样（与旧路径同样只消耗一个随机数）。
   */
  specialPool: readonly { gem: SpecialGemSpec; weight: number }[] | null = null;

  /**
   * 可自然掉落的特殊宝石（都是可匹配的）。
   * 状态搬运宝石族（GEMS-SEMANTICS-2 A/B 组波A：burningGem/freezeGem/…/barrierGem）
   * **有意不入白名单**——官方先例是"战役期间偶尔掉落"，本作无战役系统，只由技能创造；
   * 不可匹配类（炸弹/许愿/死亡标记）也永不入表，避免淤积棋盘。
   */
  private static readonly SPAWNABLE_SPECIALS: readonly SpecialGemKind[] = [
    'doomSkull',
    'web',
    'lightningRow',
    'lightningCol',
    'hourglass',
  ];

  /** 连消倾向的行动内记忆：当前行动序号，及本次行动是否已出现过大消空洞 */
  private comboActionIndex = -1;
  private comboBigClearSeen = false;

  constructor(
    private rng: SeededRNG,
    private nextGemId: () => number,
  ) {}

  /**
   * 对棋盘施加重力并补充顶部。直接修改传入的 board。
   * @param skullChance 补充时生成骷髅宝石的概率（默认 0，本阶段三消主线不掺骷髅；战斗阶段调高）
   * @param stormWeights 风暴掉落权重（颜色 → 权重，>1 的色更容易掉落）。
   *                     缺省/空表时颜色分布与旧版完全一致（均匀 pick，随机数消耗序列不变）。
   * @param skullDrop 骷髅系风暴的掉落修正（骸骨/末日/超级末日，见 SkullDropBoost）。
   *                  缺省时不进骷髅系分支——随机数消耗序列与旧版一致（回归护栏）。
   * @param comboBias 连消倾向强度（见 comboBias.ts；0 = 关闭，走旧路径，随机数/id 序列逐字节不变）。
   * @param actionLog 本场行动日志（只读；连消倾向的连段护栏据此判断下一个决策点属于谁）。
   */
  apply(
    board: BoardModel,
    skullChance = 0,
    stormWeights?: ReadonlyMap<BaseColor, number>,
    skullDrop?: SkullDropBoost,
    comboBias = 0,
    actionLog?: readonly ActionLogEntry[],
  ): GravityResult {
    // 连消倾向开启时走两段式：先让全部列落定，再逐列补充——补充色要看左右邻列
    // 落定后的真实邻居。关闭时保持旧的逐列交错路径（随机数与 id 消耗序列逐字节不变）。
    if (comboBias > 0) {
      // 本次行动是否已打出过大消（→ 行动结束后同一方还会拿到额外回合）：看落定前的空洞形状，
      // 按行动序号（actionLog 长度）分段记忆。技能炸出的整行/方块也会命中——只会让倾向更保守。
      const actionIndex = actionLog?.length ?? 0;
      if (actionIndex !== this.comboActionIndex) {
        this.comboActionIndex = actionIndex;
        this.comboBigClearSeen = false;
      }
      if (!this.comboBigClearSeen && hasBigHolePattern(board)) this.comboBigClearSeen = true;
      // 这次补充决定的是「下一个决策点」的棋盘：没打出大消 → 轮到对手的新回合（满额倾向）；
      // 已打出大消 → 还是行动方，其连段 +1（按护栏表衰减/打散）。
      const nextStreak = this.comboBigClearSeen ? extraTurnStreakOf(actionLog) + 1 : 0;
      return this.applyWithComboBias(board, skullChance, stormWeights, skullDrop, comboBias * comboStreakFade(nextStreak));
    }

    const moves: GemMove[] = [];
    const spawns: GemSpawn[] = [];

    for (let col = 0; col < BoardModel.COLS; col++) {
      const writeRow = this.settleColumn(board, col, moves);

      // 4. 顶部剩余空格补充新宝石（writeRow 及以上）
      for (let row = writeRow; row >= 0; row--) {
        const gemType = this.randomGemType(skullChance, stormWeights, skullDrop);
        const gem: Gem = { id: this.nextGemId(), type: gemType };
        const to: CellPos = { row, col };
        board.set(to, gem);
        spawns.push({ gemId: gem.id, to, gemType });
      }
    }

    return { moves, spawns };
  }

  /**
   * 单列重力（步骤 1-3）：现存宝石保序落到底部，记录移动。
   * @returns 落定后最高的空行号（-1 = 该列已满）
   */
  /** Shared gravity-only pass. Modes may supply their own refill economy. */
  settle(board: BoardModel): GemMove[] {
    const moves: GemMove[] = [];
    for (let col = 0; col < BoardModel.COLS; col++) this.settleColumn(board, col, moves);
    return moves;
  }

  private settleColumn(board: BoardModel, col: number, moves: GemMove[]): number {
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
    return writeRow;
  }

  /**
   * 连消倾向补充（comboBias > 0）：全部列先落定，再按列序、每列自底向上补充
   * （与默认路径同一 id 分配顺序）。
   *   1. 逐格选色时按「邻居同色」轻度加权（COMBO_CLUMP × 强度，见 pickComboColor）；
   *   2. 同一批空位试掷 1 + round(|强度|) 份补充，按 refillScore 取最好的一份
   *      （强度 < 0 时取最差的一份 = 打散）。所有试掷都走同一条种子化 RNG，仍确定性。
   */
  private applyWithComboBias(
    board: BoardModel,
    skullChance: number,
    stormWeights: ReadonlyMap<BaseColor, number> | undefined,
    skullDrop: SkullDropBoost | undefined,
    strength: number,
  ): GravityResult {
    const moves: GemMove[] = [];
    const spawns: GemSpawn[] = [];
    const tops: number[] = [];
    for (let col = 0; col < BoardModel.COLS; col++) tops.push(this.settleColumn(board, col, moves));
    const cells: CellPos[] = [];
    for (let col = 0; col < BoardModel.COLS; col++) {
      for (let row = tops[col]; row >= 0; row--) cells.push({ row, col });
    }
    if (cells.length === 0) return { moves, spawns };

    const tries = 1 + Math.round(Math.abs(strength));
    const clump = COMBO_CLUMP * strength;
    let best: GemType[] = [];
    let bestScore = -Infinity;
    for (let attempt = 0; attempt < tries; attempt++) {
      // 每份试掷都从同一批空位起步，不读上一份留下的临时宝石
      if (attempt > 0) for (const to of cells) board.set(to, null);
      // 逐格落子（选色要看已落下的邻居），临时 id 为负，定稿时统一换真实 id
      const types = cells.map((to, i) => {
        const gemType = this.randomGemType(skullChance, stormWeights, skullDrop, { board, pos: to, bias: clump });
        board.set(to, { id: -1 - i, type: gemType });
        return gemType;
      });
      if (tries === 1) { best = types; break; }
      const score = strength > 0 ? refillScore(board) : -refillScore(board, true);
      if (score > bestScore) {
        bestScore = score;
        best = types;
      }
    }
    cells.forEach((to, i) => {
      const gem: Gem = { id: this.nextGemId(), type: best[i] };
      board.set(to, gem);
      spawns.push({ gemId: gem.id, to, gemType: gem.type });
    });
    return { moves, spawns };
  }

  private randomGemType(
    skullChance: number,
    stormWeights?: ReadonlyMap<BaseColor, number>,
    skullDrop?: SkullDropBoost,
    combo?: ComboContext,
  ): GemType {
    if (this.specialSpawnChance > 0 && this.rng.next() < this.specialSpawnChance) {
      const pool = this.specialPool;
      if (pool && pool.length > 0) {
        const total = pool.reduce((s, p) => s + Math.max(0, p.weight), 0);
        let roll = this.rng.next() * total;
        let pick = pool[pool.length - 1]!.gem;
        for (const p of pool) {
          roll -= Math.max(0, p.weight);
          if (roll < 0) { pick = p.gem; break; }
        }
        return specialGem(pick.kind, pick.tier, pick.color);
      }
      return specialGem(this.rng.pick(GravitySystem.SPAWNABLE_SPECIALS));
    }
    // 末日/超级末日风暴：骷髅判定前先掷一次末日骷髅掉落。仅风暴激活时才消耗这次
    // 随机数，无骷髅风暴的既有对局随机数序列逐字节不变（回归护栏）。
    if (skullDrop && skullDrop.kind !== 'skull' && this.rng.next() < skullDrop.chance) {
      return specialGem(skullDrop.kind);
    }
    // 骸骨风暴：骷髅判定阈值整体抬升（skullChance × STORM_DROP_WEIGHT），消耗随机数次数不变
    const effectiveSkullChance = skullDrop?.kind === 'skull' ? skullDrop.chance : skullChance;
    if (effectiveSkullChance > 0 && this.rng.next() < effectiveSkullChance) {
      return { kind: 'skull', variant: 'normal' };
    }
    return colorGem(combo ? this.pickComboColor(stormWeights, combo) : this.pickColor(stormWeights));
  }

  /**
   * 连消倾向选色：在风暴权重之上，按落点邻居的同色情况加权（仍只消耗一个随机数）。
   *   亲和度 = 相邻同色数（左/右/下）+ 0.5 × 隔一格同色数（左二/右二/下二）；
   *   权重 = 风暴权重 × (1 + bias × 亲和度)；bias < 0（长连段护栏）时为 风暴权重 / (1 + |bias| × 亲和度)。
   * 同色成团 → 两连/隔空两连变多 → 玩家更常看到「补一颗成 4/5 连」的机会，也更常出连锁；
   * bias = 0 时退化为均匀分布（该路径不会被调用，见 apply）。
   */
  private pickComboColor(stormWeights: ReadonlyMap<BaseColor, number> | undefined, combo: ComboContext): BaseColor {
    const { board, pos, bias } = combo;
    const colorAt = (row: number, col: number): BaseColor | null => {
      if (row < 0 || row >= BoardModel.ROWS || col < 0 || col >= BoardModel.COLS) return null;
      const gem = board.get({ row, col });
      return gem && gem.type.kind === 'color' ? gem.type.color : null;
    };
    const near = [colorAt(pos.row, pos.col - 1), colorAt(pos.row, pos.col + 1), colorAt(pos.row + 1, pos.col)];
    const far = [colorAt(pos.row, pos.col - 2), colorAt(pos.row, pos.col + 2), colorAt(pos.row + 2, pos.col)];
    const weights = ALL_BASE_COLORS.map((color) => {
      let affinity = 0;
      for (const c of near) if (c === color) affinity += 1;
      for (const c of far) if (c === color) affinity += 0.5;
      const lean = bias >= 0 ? 1 + bias * affinity : 1 / (1 - bias * affinity);
      return (stormWeights?.get(color) ?? 1) * lean;
    });
    const total = weights.reduce((a, b) => a + b, 0);
    let roll = this.rng.next() * total;
    for (let i = 0; i < ALL_BASE_COLORS.length; i++) {
      roll -= weights[i];
      if (roll < 0) return ALL_BASE_COLORS[i];
    }
    return ALL_BASE_COLORS[ALL_BASE_COLORS.length - 1];
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
