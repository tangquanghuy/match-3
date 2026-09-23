/**
 * 宝石操作效果原语（战斗技能系统 · 需求 7）。
 *
 * 三类操作：
 *   - create：创造指定颜色/骷髅宝石（数量可由缩放求值；满盘时转化现有宝石）
 *   - transform：把某颜色全部转化为另一颜色
 *   - clear：清除一组目标宝石，分两种模式：
 *       · destroy（摧毁）：只清目标本身
 *       · explode（爆破）：目标 ∪ 每颗的 8 邻格 一起清（"辐射一圈"）
 *     目标集由 ClearTarget 描述：整行/列、指定色、全部色、骷髅、随机 N 颗、以某格为中心、玩家选行列。
 *
 * clear 后被清宝石交回引擎结算法力/骷髅 → 重力补充 → 连锁（ctx.resolveBoardChange，需求 7.3/7.5）。
 * 事件：create→gem-create、transform→gem-transform、destroy→gem-destroy、explode→gem-explode。
 * 纯逻辑：无 pixi/gsap/dom；随机经 ctx.rng（需求 12.1, 12.2）。
 */
import { BoardModel } from '../../BoardModel';
import { reshuffle } from '../../boardUtils';
import { colorGem, skullGem, isSameMatchType, posKey, specialGem, ALL_BASE_COLORS } from '../../types';
import type { BaseColor, CellPos, Gem, GemType, SpecialGemKind, SpecialGemSpec } from '../../types';
import { PlayerSide } from '../../types';
import type {
  GameEvent,
  GemCreateEvent,
  GemTransformEvent,
  GemClearEvent,
} from '../../events';
import type { ScalingSpec } from '../scaling';
import { evaluateScaling } from '../scaling';
import type { EffectContext, EffectPrimitive, DestroyedGem } from './context';
import { casterMagic, findCharacter, findSide } from './context';
import { evaluateWithModifier, modifierBonus } from './secondary';
import type { ModifierSpec } from './secondary';

/**
 * 颜色规格：具体基础色，或运行时占位符——
 *   'CHOSEN'：释放时由玩家/AI 选色（ctx.chosenColor 解析，需求 2）；
 *   'CASTER'：施法者的军队法力颜色（取施法者首个关联色，「该军队法力颜色的宝石」）；
 *   'SKULL'：骷髅端点（仅 transform 用：「将所有棕色宝石转换成骷髅头」「骷髅转换成X色」）；
 *   'ENEMY_MOST_USED'/'ALLY_MOST_USED'（R11 批）：敌方/己方队伍**已用法力最多**的颜色
 *   （「敌人使用最多的颜色宝石」，官方 MostUsedManaEnemy/Ally；聚合口径见 mostUsedManaColor）。
 * 无法解析（占位符无值）时，宝石段安全跳过。
 */
export type ColorSpec =
  | BaseColor
  | 'CHOSEN'
  | 'CASTER'
  | 'SKULL'
  | 'ENEMY'
  | 'LAST_TARGET'
  | 'ENEMY_MOST_USED'
  | 'ALLY_MOST_USED'
  /** 本次释放手动选定目标的法力色之一（R22 批，8188「创建 10 颗与盟友的法力颜色相同的
   *  宝石」——该咒语的首段即创造段、无前序 chosen 段，直接读 ctx.chosenTargetId（其候选
   *  集由同技能后段 allyChosen 驱动）；未选目标/无色 → null 整段跳过）。 */
  | 'CHOSEN_TARGET';

/**
 * 某方「已用法力最多」的颜色（R11 批，官方 MostUsedManaEnemy / MostUsedManaAlly）：
 * 从行动日志聚合该方全部施法行动——每次施法按施法者 manaCost 均摊到其法力色上计账
 * （官方口径是「使用/收集最多的法力色」；引擎无逐色法力流水，以此为确定性代理，
 * 用当前 manaCost 快照，平行批 R12 的 LAST_TARGET chosenTargetId 回退同款权衡）。
 * 平局取 ALL_BASE_COLORS 固定序更前者；该方尚无施法记录 → null（调用段安全跳过）。
 */
export function mostUsedManaColor(
  state: import('../../GameState').GameState,
  side: PlayerSide,
): BaseColor | null {
  const tally = new Map<BaseColor, number>();
  for (const entry of state.actionLog) {
    if (entry.side !== side) continue;
    const action = entry.action;
    if (action.type !== 'cast') continue;
    const caster = state.teams[side].characters.find((c) => c.id === action.characterId);
    if (!caster || caster.colors.length === 0) continue;
    const share = caster.manaCost / caster.colors.length;
    for (const color of caster.colors) {
      tally.set(color, (tally.get(color) ?? 0) + share);
    }
  }
  let best: BaseColor | null = null;
  let bestN = 0;
  for (const color of ALL_BASE_COLORS) {
    const n = tally.get(color) ?? 0;
    if (n > bestN) {
      bestN = n;
      best = color;
    }
  }
  return best;
}

/** 把 ColorSpec 解析为具体基础色；占位符取 ctx，缺省返回 null（'SKULL' 无对应基色） */
function resolveColor(spec: ColorSpec, ctx: EffectContext): BaseColor | null {
  if (spec === 'CHOSEN') return ctx.chosenColor ?? null;
  if (spec === 'SKULL') return null;
  if (spec === 'CASTER') {
    return findCharacter(ctx.state, ctx.casterId)?.colors[0] ?? null;
  }
  if (spec === 'CHOSEN_TARGET') {
    // R22 批：手动选定目标（任意阵营）的一种法力色（多色 rng 掷选）
    if (ctx.chosenTargetId === undefined) return null;
    const char = findCharacter(ctx.state, ctx.chosenTargetId);
    if (!char || char.colors.length === 0) return null;
    return char.colors[ctx.rng.nextInt(char.colors.length)];
  }
  // 「指定/该敌人的一种法力颜色」（2026-09-17 回收批）：随机存活敌方 / 跨段追踪目标，
  // 多法力色时 rng 掷选其一（确定性）。LAST_TARGET 无跨段追踪时回退到玩家选定的敌人
  // （「选择一名敌人。摧毁其法力颜色的宝石」——清除段本身是首段，追踪尚无主目标）。
  if (spec === 'ENEMY' || spec === 'LAST_TARGET') {
    let char = undefined;
    if (spec === 'LAST_TARGET') {
      const last = ctx.castTracking?.lastTarget;
      if (last) {
        char = findCharacter(ctx.state, last.id);
      } else if (ctx.chosenTargetId !== undefined) {
        char = findCharacter(ctx.state, ctx.chosenTargetId);
      }
    } else {
      const mySide = findSide(ctx.state, ctx.casterId);
      if (mySide === null) return null;
      const enemySide = mySide === PlayerSide.Left ? PlayerSide.Right : PlayerSide.Left;
      const alive = ctx.state.teams[enemySide].characters.filter((c) => !c.defeated && c.colors.length > 0);
      char = alive[ctx.rng.nextInt(alive.length)];
    }
    if (!char || char.colors.length === 0) return null;
    return char.colors[ctx.rng.nextInt(char.colors.length)];
  }
  // 「敌人/自身队伍使用最多的颜色宝石」（R11 批，官方 MostUsedManaEnemy/Ally）：
  // 行动日志聚合（见 mostUsedManaColor）；无施法记录 → null，宝石段安全跳过。
  if (spec === 'ENEMY_MOST_USED' || spec === 'ALLY_MOST_USED') {
    const mySide = findSide(ctx.state, ctx.casterId);
    if (mySide === null) return null;
    const targetSide = spec === 'ALLY_MOST_USED'
      ? mySide
      : mySide === PlayerSide.Left ? PlayerSide.Right : PlayerSide.Left;
    return mostUsedManaColor(ctx.state, targetSide);
  }
  return spec;
}

/** 转化端点 → 目标宝石类型（'SKULL' → 骷髅；基色/占位符 → 色宝石；无法解析 → null） */
function transformEndpoint(spec: ColorSpec, ctx: EffectContext): GemType | null {
  if (spec === 'SKULL') return skullGem();
  const color = resolveColor(spec, ctx);
  return color === null ? null : colorGem(color);
}

/** doTransform 的端点解析：优先特殊宝石端点（「将所有红色宝石转换成极度末日骷髅头」）。
 *  from 侧遇 'ANY'/'CELL'/缺省返回 null（由 doTransform 按「不限来源 / 选定单格」分支
 *  处理，不走这里）。toSpecial 亦接受 spec 形态 { kind, tier?, color? }（K-B 收官轮，
 *  带档通配/恶石像鬼 tier 端点）——kind 字符串与对象两形态运行时等价。 */
function transformEndpointOf(params: TransformGemParams, side: 'from' | 'to', ctx: EffectContext): GemType | null {
  const special = side === 'from' ? params.fromSpecial : params.toSpecial;
  if (special) {
    return typeof special === 'string'
      ? specialGem(special)
      : specialGem(special.kind, special.tier, special.color);
  }
  const spec = side === 'from' ? params.from : params.to;
  if (spec === undefined || spec === 'ANY' || spec === 'CELL') return null;
  return transformEndpoint(spec, ctx);
}

// —— 创造 / 转化 ——

/** 创造宝石类型：指定颜色（可占位符）/ 骷髅 / 混合多色（逐颗随机取色）/ 特殊宝石（窗口 C spec）
 *  / 混合特殊宝石（原语 Wave3 批：官方 CreateGems2Colors 双特殊端点，逐颗 rng 掷选） */
export type CreateGemSpec =
  | { kind: 'color'; color: ColorSpec }
  | { kind: 'skull' }
  | { kind: 'mix'; colors: ColorSpec[] }
  | { kind: 'special'; spec: SpecialGemSpec }
  | { kind: 'mixSpecial'; specs: SpecialGemSpec[] }
  /**
   * 混合创造·通用形态（R22 批，官方 CreateGems「a mix of …」句式）：entries 逐颗放回均匀
   * 掷选，端点可为颜色占位符 / 'SKULL'（骷髅）/ 特殊宝石 spec——
   *   8880「创造 24 颗混合紫色和骷髅头的宝石」= entries ['Purple','SKULL']
   *   9780「创造 14 颗绿色和流血宝石混合体」= entries ['Green',{kind:'bleedGem'}]
   * 任一颜色端点无法解析 → 整段跳过（与 mix 同护栏）。
   */
  | { kind: 'mixAny'; entries: (ColorSpec | 'SKULL' | SpecialGemSpec)[] };

export interface CreateGemParams {
  op: 'create';
  gem: CreateGemSpec;
  /** 数量缩放规格（按施法者魔力求值；至少产出 0） */
  count: ScalingSpec;
  /**
   * 数量区间（引擎原语批：「创造 8-12 颗紫色宝石」）：给出时忽略 count，
   * 在 [min, max] 内均匀掷选（种子化，每段一次）。
   */
  countRange?: { min: number; max: number };
  /** 二次缩放（如「每摧毁一颗紫色宝石，则创造 4 颗骷髅头 [x4]」） */
  modifier?: ModifierSpec;
}

/**
 * 转化来源端点：颜色/占位符之外——
 *   'ANY' = 不限来源（任意非目标类型宝石，定量转换用）；
 *   'CELL'（原语 Wave4 批，9638 Shining Light「Choose a Gem. Convert it…」官方步骤
 *   BoardTarget SingleGem + Color1 FromTarget）= 选定单格那颗宝石（ctx.chosenCell，
 *   既有 CellPicker 管线）。
 */
export type TransformFrom = ColorSpec | 'ANY' | 'CELL';

/** 转化：某颜色 → 另一颜色（均可为 'CHOSEN'/'SKULL'）；端点亦可为特殊宝石种类 */
export interface TransformGemParams {
  op: 'transform';
  /** 来源端点；'ANY' = 不限色（排除已是目标类型的宝石）。缺省按 'ANY' 处理（既有构造器恒显式传入） */
  from?: TransformFrom;
  to: ColorSpec;
  /**
   * to 端点为特殊宝石时给出（优先于 to 的基色解析）。
   * kind 字符串 = 既有形态（无档宝石）；K-B 收官轮起亦可为 spec 形态 `{ kind, tier?, color? }`
   * （对齐 createSpecialGems 的 SpecialGemSpec——带档通配 x3 / 恶石像鬼等 tier 端点，
   * 8966「Convert a selected Mana Gem into a x3 Wildcard」）。两种形态运行时等价。
   */
  toSpecial?: SpecialGemKind | SpecialGemSpec;
  /** from 端点为特殊宝石时给出（优先于 from）——特殊↔特殊（Wave4，8801 石块端点）。
   *  池匹配按 kind 精确对位（石块/石像鬼等不可匹配宝石 isSameMatchType 恒 false） */
  fromSpecial?: SpecialGemKind;
  /**
   * toSpecial 的 tier 掷签（原语 Wave4 批，8801「Convert 4 Stone Blocks to either Good
   * or Evil Gargoyle Gems」官方 Randomize AB-CD 两分支 = 整段一次掷签、本次转换的
   * 所有宝石同 tier）。仅与 toSpecial 同用；目标集为空时不掷（零事件零 rng 护栏）。
   */
  tiers?: [number, number];
  /**
   * 定量转换（引擎原语批）：随机转换 N 颗（种子化、不放回）；缺省 = 全部匹配。
   * 「将一颗宝石转换成炸弹宝石」「将 2 颗紫色宝石转换成X」。
   */
  count?: ScalingSpec;
  /**
   * 转换颗数的二次缩放（batch-r28，官方 ConvertGems UseCounterForAmount——9545
   * 「将 3 颗黄色宝石转换成紫色龙宝石，诅咒敌人数量增加 [1:1]」= 3 + 被诅咒敌人数）：
   * 给出时转换颗数 = evaluateScaling(count) + modifierBonus(countModifier)。
   */
  countModifier?: ModifierSpec;
}

// —— 清除目标集（destroy / explode 共用） ——

/**
 * 面积形状（2026-09-17 回收批 R12）：以中心格为锚的固定形状格集合。
 *   - square5：5x5 方块（官方 BoardTarget Block5x5，「摧毁一整块大小为 5x5 的宝石」）
 *   - square3：3x3 方块（官方 Block3x3，「爆破 3x3 阵型的宝石」）
 *   - cross3 ：3x3 十字（官方 Block1x3 + Block3x1，「以 3x3 交叉队列方式爆破」= 横竖各 3 格）
 *   - x      ：两条对角线（官方 X 形状，「以 X 形状摧毁宝石」= 沿过中心的两条对角线清全程）
 *   - circle5：5x5 圆（R13 批，官方 BoardTarget Circle，「摧毁 5x5 圈宝石」= 以中心格为
 *     圆心、半径 2.5 格的圆内格集合，几何判定 dx²+dy² ≤ 2.5²，8x8 中心处 21 格圆角盘）
 *   - row3  ：一行三格（R22 批，官方 Block1x3 单排——7000/9052「爆破/摧毁一颗宝石和其两侧
 *     的宝石」= 以中心格为锚的横向 1x3）
 * 中心格缺省 = 棋盘几何中心（8x8 取 floor((N-1)/2)=3），可显式给格、'CELL'（玩家点选）或
 * 'RANDOM'（R22 批：随机取一颗有宝石的格为锚——「(爆破)一颗宝石和其两侧的宝石」裸单颗口径）。
 */
export type AreaShape = 'square5' | 'square3' | 'cross3' | 'x' | 'circle5' | 'row3';

/**
 * 清除目标集描述。产出一组"目标格"，再由 clear 模式决定是否辐射一圈。
 *   - lines：固定整行/整列（rows/cols）
 *   - chosenLine：玩家选定一枚宝石，取其所在整行/整列（起点 = ctx.chosenCell）
 *   - randomLines：随机 N 行 / N 列
 *   - color：某颜色全部（可 'CHOSEN'）
 *   - allColors：全部颜色宝石（不含骷髅）
 *   - skulls：全部骷髅
 *   - randomGems：随机 N 颗宝石（可限定仅颜色/含骷髅/仅普通骷髅/指定特殊宝石；双色并集池）
 *   - cell：以某格为中心（cell 可 'CELL'）；本身即单格，靠 explode 辐射成片
 *   - area：固定形状格集合（面积原语批）——形状本身即完整目标集，**不再辐射**
 *   - chosenCross：选定宝石的行+列（R22 批，7253「选择一颗宝石，摧毁其行和列」）
 *   - lastDestroyedLine：前序 clear 段辐射前锚定格所在整行/整列（W05，7217「爆破一颗宝石，并摧毁该行」）
 */
export type ClearTarget =
  | { kind: 'lines'; rows?: number[]; cols?: number[] }
  | { kind: 'chosenLine'; orientation: 'row' | 'col' }
  | { kind: 'randomLines'; orientation: 'row' | 'col'; count: ScalingSpec }
  | { kind: 'color'; color: ColorSpec }
  | { kind: 'allColors' }
  | { kind: 'skulls' }
  | { kind: 'special'; gem: SpecialGemKind }
  | { kind: 'randomGems'; count: ScalingSpec; include?: 'color' | 'all' | 'skull'; color?: ColorSpec; colors?: ColorSpec[]; special?: SpecialGemKind; countRange?: { min: number; max: number } }
  | { kind: 'cell'; cell: CellPos | 'CELL' }
  | { kind: 'area'; shape: AreaShape; center?: CellPos | 'CELL' | 'RANDOM' }
  | { kind: 'chosenCross' }
  | { kind: 'lastDestroyedLine'; orientation: 'row' | 'col' };

/** 清除操作：destroy=仅目标本身；explode=目标并入每颗 8 邻格 */
export interface ClearGemParams {
  op: 'clear';
  mode: 'destroy' | 'explode';
  target: ClearTarget;
  /** 二次缩放（随机 N 行列/颗的数量因来源而增强：「爆破 [M+1] 颗宝石，数量因X而增强」） */
  modifier?: ModifierSpec;
}

export type GemParams = CreateGemParams | TransformGemParams | ClearGemParams;

// —— 工具 ——

function emptyCells(board: BoardModel): CellPos[] {
  const cells: CellPos[] = [];
  board.forEach((gem, pos) => {
    if (gem === null) cells.push(pos);
  });
  return cells;
}

/** 从若干候选位随机取 n 个（不放回，种子化） */
function pickN<T>(items: T[], n: number, ctx: EffectContext): T[] {
  const pool = items.slice();
  const chosen: T[] = [];
  const k = Math.min(n, pool.length);
  for (let i = 0; i < k; i++) {
    const idx = ctx.rng.nextInt(pool.length);
    chosen.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return chosen;
}

/** 在 [min, max] 内均匀掷选一个整数（种子化；区间非法时夹取为单点）。每段至多掷一次 */
export function rollInRange(range: { min: number; max: number }, ctx: EffectContext): number {
  const lo = Math.max(0, Math.floor(Math.min(range.min, range.max)));
  const hi = Math.max(lo, Math.floor(Math.max(range.min, range.max)));
  return lo + ctx.rng.nextInt(hi - lo + 1);
}

function allRows(): number[] {
  return Array.from({ length: BoardModel.ROWS }, (_, i) => i);
}
function allCols(): number[] {
  return Array.from({ length: BoardModel.COLS }, (_, i) => i);
}
function cellsOfRow(row: number): CellPos[] {
  return allCols().map((col) => ({ row, col }));
}
function cellsOfCol(col: number): CellPos[] {
  return allRows().map((row) => ({ row, col }));
}

// —— 创造 ——

/** 创造型宝石的每颗取色：单一类型直接解析；混合型逐颗从候选色随机取（种子化）；特殊宝石按 spec 构造；
 *  混合特殊宝石（Wave3）逐颗从候选 spec 里**放回均匀**掷选（官方 CreateGems2Colors 善/恶石像鬼
 *  「创造 3 颗石像鬼宝石」= 每颗独立 50/50，8795 Frozen Time 官方步骤） */
function pickCreateGemType(spec: CreateGemSpec, ctx: EffectContext): GemType | null {
  if (spec.kind === 'skull') return skullGem();
  if (spec.kind === 'special') return specialGem(spec.spec.kind, spec.spec.tier, spec.spec.color);
  if (spec.kind === 'mixSpecial') {
    if (spec.specs.length === 0) return null;
    const picked = spec.specs[ctx.rng.nextInt(spec.specs.length)];
    return specialGem(picked.kind, picked.tier, picked.color);
  }
  if (spec.kind === 'mixAny') {
    // R22 批：通用混合创造（色/骷髅/特殊宝石逐颗掷选）。先解析全部颜色端点（按位对齐），
    // 任一失败 → 整段跳过；'SKULL'/特殊宝石端点无需解析。
    if (spec.entries.length === 0) return null;
    const resolvedByEntry: (BaseColor | null | undefined)[] = spec.entries.map((e) => {
      if (typeof e !== 'string') return undefined; // 特殊宝石 spec 端点
      if (e === 'SKULL') return undefined;
      return resolveColor(e, ctx);
    });
    if (resolvedByEntry.some((r) => r === null)) return null;
    const idx = ctx.rng.nextInt(spec.entries.length);
    const pick = spec.entries[idx];
    if (typeof pick === 'string') {
      if (pick === 'SKULL') return skullGem();
      return colorGem(resolvedByEntry[idx] as BaseColor);
    }
    return specialGem(pick.kind, pick.tier, pick.color);
  }
  const colors = spec.kind === 'mix' ? spec.colors : [spec.color];
  if (colors.length === 0) return null;
  const resolved = colors.map((c) => resolveColor(c, ctx));
  if (resolved.some((c) => c === null)) return null; // 任一占位符无法解析 → 整段跳过
  const pool = resolved as BaseColor[];
  const color = pool.length === 1 ? pool[0] : pool[ctx.rng.nextInt(pool.length)];
  return colorGem(color);
}

function doCreate(params: CreateGemParams, ctx: EffectContext): GameEvent[] {
  const board = ctx.state.board;
  // 骷髅/单色可提前判跳过；混合色逐颗取色，先确认全部占位符可解析
  const probe = pickCreateGemType(params.gem, ctx);
  if (probe === null) return [];

  // 数量区间（「创造 8-12 颗」）优先于缩放规格；两者互斥，缺省走缩放（旧路径随机序列不变）
  const n = params.countRange
    ? rollInRange(params.countRange, ctx)
    : evaluateWithModifier(evaluateScaling(params.count, casterMagic(ctx)), params.modifier, ctx);
  if (n <= 0) return [];

  const events: GameEvent[] = [];

  // 1. 优先填空格 → gem-create；首颗落格记入跨段追踪（batch-r28，surroundingGems
  //    位置锚来源——8804「宝石附近或下方每有一颗绿色宝石」的锚=刚创造的宝石）
  const slots = pickN(emptyCells(board), n, ctx);
  const spawns: GemCreateEvent['spawns'] = [];
  for (const pos of slots) {
    const gemType = pickCreateGemType(params.gem, ctx)!;
    const gem: Gem = { id: ctx.nextGemId(), type: gemType };
    board.set(pos, gem);
    spawns.push({ pos, gemId: gem.id, gemType: gem.type });
  }
  if (spawns.length > 0) {
    events.push({ type: 'gem-create', spawns });
    if (ctx.castTracking) ctx.castTracking.lastCreatedCell = spawns[0].pos;
  }

  // 2. 空格不够 → 把剩余数量的随机现存（非目标类型）宝石就地转化为目标类型 → gem-transform
  const remaining = n - spawns.length;
  if (remaining > 0) {
    const convertible: CellPos[] = [];
    board.forEach((gem, pos) => {
      if (gem && probe && !isSameMatchType(gem.type, probe)) convertible.push(pos);
    });
    const targets = pickN(convertible, remaining, ctx);
    const changes: GemTransformEvent['changes'] = [];
    for (const pos of targets) {
      const gem = board.get(pos)!;
      const from = gem.type;
      const to = pickCreateGemType(params.gem, ctx)!;
      gem.type = to;
      changes.push({ pos, gemId: gem.id, from, to });
    }
    if (changes.length > 0) {
      events.push({ type: 'gem-transform', changes });
      // 满盘就地转化路径（烟雾/满盘对局）：「创造」的宝石即首个转化格，同作位置锚
      if (spawns.length === 0 && ctx.castTracking) ctx.castTracking.lastCreatedCell = changes[0].pos;
    }
  }

  if (events.length === 0) return [];
  ctx.resolveBoardChange?.([], events);
  return events;
}
// —— 转化 ——

/** 宝石类型精确相等（ANY 来源排除「已是目标类型」用；isSameMatchType 对不可匹配宝石恒 false） */
function gemTypeEquals(a: GemType, b: GemType): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'color' && b.kind === 'color') return a.color === b.color;
  if (a.kind === 'skull' && b.kind === 'skull') return true;
  if (a.kind === 'special' && b.kind === 'special') {
    // 六色族（spec.color）参与实例相等：蓝龙与红龙不是同一目标类型（波B）
    return a.spec.kind === b.spec.kind && a.spec.tier === b.spec.tier && a.spec.color === b.spec.color;
  }
  return false;
}

function doTransform(params: TransformGemParams, ctx: EffectContext): GameEvent[] {
  const board = ctx.state.board;
  const toType = transformEndpointOf(params, 'to', ctx);
  if (toType === null) return [];
  // from = 'ANY'/缺省 → 不限来源（「将一颗宝石转换成炸弹宝石」）；否则解析来源端点。
  // from = 'CELL'（Wave4，9638）→ 选定单格那颗宝石，不走端点类型解析。
  const fromAny = params.from === undefined || params.from === 'ANY';
  const fromCell = params.from === 'CELL';
  const fromType = fromAny || fromCell ? null : transformEndpointOf(params, 'from', ctx);
  if (!fromAny && !fromCell && fromType === null) return [];
  if (!fromAny && !fromCell && params.from === params.to && !params.toSpecial && !params.fromSpecial) return [];

  // 收集匹配来源的宝石格；'ANY' 时排除「已是目标类型」的宝石（转了等于没转）
  const pool: CellPos[] = [];
  if (fromCell) {
    // 选定单格端点（9638「Choose a Gem. Convert it」）：只收 ctx.chosenCell 一格；
    // 未选格 / 该格无宝石 / 已是目标类型 → 安全跳过
    const cell = ctx.chosenCell;
    const gem = cell ? board.get(cell) : undefined;
    if (cell && gem && !gemTypeEquals(gem.type, toType)) pool.push(cell);
  } else {
    board.forEach((gem, pos) => {
      if (!gem) return;
      if (params.fromSpecial !== undefined) {
        // 特殊→特殊（Wave4，8801 石块→善恶石像鬼）：按 kind 精确对位——石块等
        // 不可匹配宝石 matchJoinKey 为 null，isSameMatchType 恒 false，走不了匹配键管线
        if (!(gem.type.kind === 'special' && gem.type.spec.kind === params.fromSpecial)) return;
      } else if (fromType !== null) {
        if (!isSameMatchType(gem.type, fromType)) return;
      } else if (gemTypeEquals(gem.type, toType)) {
        return;
      }
      pool.push(pos);
    });
  }
  // 定量转换：随机取 N 颗（种子化、不放回）；缺省 = 全部（既有全棋盘转化路径不变）。
  // countModifier（batch-r28，9545 UseCounterForAmount）：颗数 = 一次缩放 + 二次缩放加成
  const targets = params.count
    ? pickN(
      pool,
      Math.max(0,
        evaluateScaling(params.count, casterMagic(ctx))
        + (params.countModifier ? modifierBonus(params.countModifier, ctx) : 0)),
      ctx,
    )
    : pool;
  if (targets.length === 0) return [];

  // '善或恶' tier 掷签（Wave4，8801 官方 AB-CD 分支语义）：目标集非空才掷、整段一次，
  // 本次转换的所有宝石取同一 tier；仅对特殊宝石端点生效（基色端点忽略该字段）
  let finalTo = toType;
  if (params.tiers !== undefined && params.tiers.length > 0 && toType.kind === 'special') {
    const tier = params.tiers[ctx.rng.nextInt(params.tiers.length)];
    finalTo = specialGem(toType.spec.kind, tier, toType.spec.color);
  }

  const changes: GemTransformEvent['changes'] = [];
  for (const pos of targets) {
    const gem = board.get(pos)!;
    const prev = gem.type;
    gem.type = finalTo;
    changes.push({ pos, gemId: gem.id, from: prev, to: finalTo });
  }
  if (changes.length === 0) return [];
  if (ctx.castTracking) ctx.castTracking.transformed += changes.length;
  const events: GameEvent[] = [{ type: 'gem-transform', changes }];
  ctx.resolveBoardChange?.([], events);
  return events;
}

// —— 清除（destroy / explode） ——

/**
 * 解析目标集为一组格子（去重、限界）。无法解析（选色/选行列/选格缺失）时返回 null，调用方安全跳过。
 */
function resolveTargetCells(target: ClearTarget, ctx: EffectContext, modifier?: ModifierSpec): CellPos[] | null {
  const board = ctx.state.board;

  switch (target.kind) {
    case 'lines': {
      const cells: CellPos[] = [];
      for (const r of target.rows ?? []) if (r >= 0 && r < BoardModel.ROWS) cells.push(...cellsOfRow(r));
      for (const c of target.cols ?? []) if (c >= 0 && c < BoardModel.COLS) cells.push(...cellsOfCol(c));
      return cells;
    }
    case 'chosenLine': {
      // 与"选一枚宝石"同一套选择器：以玩家点选的宝石格为起点，取其所在整行/整列。
      if (ctx.chosenCell === undefined) return null;
      return target.orientation === 'row' ? cellsOfRow(ctx.chosenCell.row) : cellsOfCol(ctx.chosenCell.col);
    }
    case 'randomLines': {
      const n = evaluateWithModifier(evaluateScaling(target.count, casterMagic(ctx)), modifier, ctx);
      if (n <= 0) return [];
      const idxs = pickN(target.orientation === 'row' ? allRows() : allCols(), n, ctx);
      const cells: CellPos[] = [];
      for (const i of idxs) cells.push(...(target.orientation === 'row' ? cellsOfRow(i) : cellsOfCol(i)));
      return cells;
    }
    case 'color': {
      const color = resolveColor(target.color, ctx);
      if (color === null) return null;
      const t = colorGem(color);
      const cells: CellPos[] = [];
      board.forEach((gem, pos) => { if (gem && isSameMatchType(gem.type, t)) cells.push(pos); });
      return cells;
    }
    case 'allColors': {
      const cells: CellPos[] = [];
      board.forEach((gem, pos) => { if (gem && gem.type.kind === 'color') cells.push(pos); });
      return cells;
    }
    case 'skulls': {
      const cells: CellPos[] = [];
      board.forEach((gem, pos) => { if (gem && gem.type.kind === 'skull') cells.push(pos); });
      return cells;
    }
    case 'special': {
      // 按特殊宝石种类全量清除（「摧毁所有末日骷髅头」）；末日族与普通骷髅分属不同 kind
      const cells: CellPos[] = [];
      board.forEach((gem, pos) => { if (gem && gem.type.kind === 'special' && gem.type.spec.kind === target.gem) cells.push(pos); });
      return cells;
    }
    case 'randomGems': {
      // 数量区间（「爆破 1-2 颗宝石」）优先于缩放规格；缺省走缩放（旧路径随机序列不变）
      const n = target.countRange
        ? rollInRange(target.countRange, ctx)
        : evaluateWithModifier(evaluateScaling(target.count, casterMagic(ctx)), modifier, ctx);
      if (n <= 0) return [];
      // 可选限定色：「爆破 [魔法 + 1] 颗紫色宝石」从紫色的池子里随机取；可选限定特殊宝石种类；
      // colors（R22 批，8429「绿色或紫色宝石」）：双色并集池（逐颗任一命中即入池）——
      // 仅支持基色端点，占位符无法解析时整段跳过。
      let colorFilters: GemType[] | null = null;
      if (target.colors !== undefined) {
        const resolved: GemType[] = [];
        for (const c of target.colors) {
          const r = resolveColor(c, ctx);
          if (r === null) return null;
          resolved.push(colorGem(r));
        }
        colorFilters = resolved;
      }
      const colorFilter = colorFilters === null && target.color !== undefined ? resolveColor(target.color, ctx) : null;
      if (target.color !== undefined && colorFilters === null && colorFilter === null) return null;
      const singleFilter = colorFilter === null ? null : colorGem(colorFilter);
      const pool: CellPos[] = [];
      board.forEach((gem, pos) => {
        if (!gem) return;
        if (target.special !== undefined && !(gem.type.kind === 'special' && gem.type.spec.kind === target.special)) return;
        if (target.include === 'color' && gem.type.kind !== 'color') return;
        // include 'skull'（R22 批，7136/8504）：仅普通骷髅（末日族属 special kind，不在池内）
        if (target.include === 'skull' && gem.type.kind !== 'skull') return;
        if (colorFilters !== null) {
          if (!colorFilters.some((t) => isSameMatchType(gem.type, t))) return;
        } else if (singleFilter && !isSameMatchType(gem.type, singleFilter)) return;
        pool.push(pos);
      });
      return pickN(pool, n, ctx);
    }
    case 'cell': {
      const cell = target.cell === 'CELL' ? ctx.chosenCell : target.cell;
      return cell ? [cell] : null;
    }
    case 'chosenCross': {
      // 选定宝石的行+列（R22 批，7253「选择一颗紫色宝石，摧毁其行和列」）：以玩家点选格为
      // 锚取整行∪整列（锚格重复出现按后续去重收口）。未选格 → 安全跳过。
      if (ctx.chosenCell === undefined) return null;
      return [...cellsOfRow(ctx.chosenCell.row), ...cellsOfCol(ctx.chosenCell.col)];
    }
    case 'lastDestroyedLine': {
      const anchor = ctx.castTracking?.lastClearedAnchor;
      if (!anchor) return null;
      return target.orientation === 'row' ? cellsOfRow(anchor.row) : cellsOfCol(anchor.col);
    }
    case 'area': {
      // 面积形状（原语批 R12）：形状格集合按中心格生成；越界格剔除（贴边中心时自动收边）。
      // center 'RANDOM'（R22 批）：随机取一颗有宝石的格为锚（「一颗宝石和其两侧的宝石」）。
      let center: CellPos | null;
      if (target.center === undefined) {
        center = { row: Math.floor((BoardModel.ROWS - 1) / 2), col: Math.floor((BoardModel.COLS - 1) / 2) };
      } else if (target.center === 'CELL') {
        center = ctx.chosenCell ?? null;
      } else if (target.center === 'RANDOM') {
        const occupied: CellPos[] = [];
        board.forEach((gem, pos) => { if (gem) occupied.push(pos); });
        center = occupied.length > 0 ? occupied[ctx.rng.nextInt(occupied.length)] : null;
      } else {
        center = target.center;
      }
      if (!center) return null;
      const cells: CellPos[] = [];
      const push = (row: number, col: number) => {
        const pos = { row, col };
        if (BoardModel.inBounds(pos)) cells.push(pos);
      };
      switch (target.shape) {
        case 'square5':
          for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) push(center.row + dr, center.col + dc);
          break;
        case 'square3':
          for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) push(center.row + dr, center.col + dc);
          break;
        case 'cross3':
          // 官方 Block1x3 + Block3x1：横竖各 3 格的十字（5 格）
          for (let dc = -1; dc <= 1; dc++) push(center.row, center.col + dc);
          for (let dr = -1; dr <= 1; dr++) push(center.row + dr, center.col);
          break;
        case 'x':
          // 过中心的两条对角线（全板长）：r-c 定值线 ∪ r+c 定值线
          for (let r = 0; r < BoardModel.ROWS; r++) {
            push(r, center.col + (r - center.row));
            push(r, center.col - (r - center.row));
          }
          break;
        case 'circle5':
          // 官方 BoardTarget=Circle（R13 批）：圆心=中心格、半径 2.5 格的圆内格集合
          //（dx²+dy² ≤ 2.5²=6.25；dr/dc 为整数，中心处 21 格——5x5 去掉四个角）。
          for (let dr = -2; dr <= 2; dr++) {
            for (let dc = -2; dc <= 2; dc++) {
              if (dr * dr + dc * dc <= 6.25) push(center.row + dr, center.col + dc);
            }
          }
          break;
        case 'row3':
          // 一行三格（R22 批，官方 Block1x3 单排）：中心格 + 同行左右各一格
          push(center.row, center.col - 1);
          push(center.row, center.col);
          push(center.row, center.col + 1);
          break;
      }
      return cells;
    }
    default: {
      const _exhaustive: never = target;
      return _exhaustive;
    }
  }
}

/** 把一组格并入其 8 邻格（爆破辐射一圈）；限界、去重 */
function radiate(cells: CellPos[]): CellPos[] {
  const seen = new Set<string>();
  const out: CellPos[] = [];
  const add = (pos: CellPos) => {
    if (!BoardModel.inBounds(pos)) return;
    const k = posKey(pos);
    if (seen.has(k)) return;
    seen.add(k);
    out.push(pos);
  };
  for (const c of cells) {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) add({ row: c.row + dr, col: c.col + dc });
    }
  }
  return out;
}

function doClear(params: ClearGemParams, ctx: EffectContext): GameEvent[] {
  const targetCells = resolveTargetCells(params.target, ctx, params.modifier);
  if (targetCells === null) return []; // 选色/选行列/选格缺失，安全跳过
  if (ctx.castTracking && targetCells.length > 0 && params.target.kind !== 'lastDestroyedLine') {
    const anchor = targetCells[0];
    ctx.castTracking.lastClearedAnchor = { row: anchor.row, col: anchor.col };
  }
  // explode 辐射一圈；area 形状本身即完整目标集（官方 BoardTarget Block5x5 等是精确格集合，
  // 再辐射会越出官方形状），故只按 mode 区分事件类型、不做 8 邻扩展。
  const positions =
    params.mode === 'explode' && params.target.kind !== 'area' ? radiate(targetCells) : targetCells;

  const board = ctx.state.board;
  const cells: GemClearEvent['cells'] = [];
  const destroyed: DestroyedGem[] = [];
  const seen = new Set<string>();
  for (const pos of positions) {
    const k = posKey(pos);
    if (seen.has(k)) continue;
    seen.add(k);
    const gem = board.get(pos);
    if (!gem) continue;
    cells.push({ pos, gemId: gem.id, gemType: gem.type });
    destroyed.push({ gemType: gem.type, pos });
    board.set(pos, null);
  }
  if (cells.length === 0) return [];

  // 记入跨段追踪：后续段的二次缩放来源「因被摧毁的 X 色宝石而增强」读这里
  if (ctx.castTracking) ctx.castTracking.destroyed.push(...destroyed);

  // 事件按模式区分，供表现层放不同动画；两者都结算法力/骷髅 + 重力连锁
  const events: GameEvent[] =
    params.mode === 'explode'
      ? [{ type: 'gem-explode', cells }]
      : [{ type: 'gem-destroy', cells }];
  ctx.resolveBoardChange?.(destroyed, events);
  return events;
}

/**
 * 构建宝石操作原语（需求 7.1–7.5）。
 */
export function gemEffect(params: GemParams): EffectPrimitive {
  return {
    apply(ctx: EffectContext): GameEvent[] {
      switch (params.op) {
        case 'create':
          return doCreate(params, ctx);
        case 'transform':
          return doTransform(params, ctx);
        case 'clear':
          return doClear(params, ctx);
        default: {
          const _exhaustive: never = params;
          return _exhaustive;
        }
      }
    },
  };
}

/**
 * 打乱板面（引擎原语批 ·「Shuffle the Board」）：复用 boardUtils.reshuffle——同一组宝石
 * （id 与类型不变）重排到「无预成匹配且存在合法交换」的布局，发既有 reshuffle 事件
 * （moves 携带 from→to，表现层按 id 做洗牌动画，与死局重排同一演出路径）。
 * 洗牌可能摆出现成三连：交回 ctx.resolveBoardChange 结算连锁（与死局重排后 runCascades
 * 同一条规则——三连就该被消掉，不滞留）。非满盘（部分逻辑单测/在途解析）安全跳过：
 * reshuffle 按全部格位写入，缺格会丢宝石。
 */
export function shuffleBoardEffect(): EffectPrimitive {
  return {
    apply(ctx: EffectContext): GameEvent[] {
      const board = ctx.state.board;
      if (!board.isFull()) return [];
      const moves = reshuffle(board, ctx.rng);
      const events: GameEvent[] = [{ type: 'reshuffle', moves }];
      ctx.resolveBoardChange?.([], events);
      return events;
    },
  };
}
