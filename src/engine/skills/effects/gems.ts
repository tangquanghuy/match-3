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
import { colorGem, skullGem, isSameMatchType, posKey, specialGem } from '../../types';
import type { BaseColor, CellPos, Gem, GemType, SpecialGemKind, SpecialGemSpec } from '../../types';
import type {
  GameEvent,
  GemCreateEvent,
  GemTransformEvent,
  GemClearEvent,
} from '../../events';
import type { ScalingSpec } from '../scaling';
import { evaluateScaling } from '../scaling';
import type { EffectContext, EffectPrimitive, DestroyedGem } from './context';
import { casterMagic, findCharacter } from './context';
import { evaluateWithModifier } from './secondary';
import type { ModifierSpec } from './secondary';

/**
 * 颜色规格：具体基础色，或运行时占位符——
 *   'CHOSEN'：释放时由玩家/AI 选色（ctx.chosenColor 解析，需求 2）；
 *   'CASTER'：施法者的军队法力颜色（取施法者首个关联色，「该军队法力颜色的宝石」）；
 *   'SKULL'：骷髅端点（仅 transform 用：「将所有棕色宝石转换成骷髅头」「骷髅转换成X色」）。
 * 无法解析（占位符无值）时，宝石段安全跳过。
 */
export type ColorSpec = BaseColor | 'CHOSEN' | 'CASTER' | 'SKULL';

/** 把 ColorSpec 解析为具体基础色；占位符取 ctx，缺省返回 null（'SKULL' 无对应基色） */
function resolveColor(spec: ColorSpec, ctx: EffectContext): BaseColor | null {
  if (spec === 'CHOSEN') return ctx.chosenColor ?? null;
  if (spec === 'SKULL') return null;
  if (spec === 'CASTER') {
    return findCharacter(ctx.state, ctx.casterId)?.colors[0] ?? null;
  }
  return spec;
}

/** 转化端点 → 目标宝石类型（'SKULL' → 骷髅；基色/占位符 → 色宝石；无法解析 → null） */
function transformEndpoint(spec: ColorSpec, ctx: EffectContext): GemType | null {
  if (spec === 'SKULL') return skullGem();
  const color = resolveColor(spec, ctx);
  return color === null ? null : colorGem(color);
}

/** doTransform 的端点解析：优先特殊宝石端点（「将所有红色宝石转换成极度末日骷髅头」） */
function transformEndpointOf(params: TransformGemParams, side: 'from' | 'to', ctx: EffectContext): GemType | null {
  const special = side === 'from' ? params.fromSpecial : params.toSpecial;
  if (special) return specialGem(special);
  return transformEndpoint(side === 'from' ? params.from : params.to, ctx);
}

// —— 创造 / 转化 ——

/** 创造宝石类型：指定颜色（可占位符）/ 骷髅 / 混合多色（逐颗随机取色）/ 特殊宝石（窗口 C spec） */
export type CreateGemSpec =
  | { kind: 'color'; color: ColorSpec }
  | { kind: 'skull' }
  | { kind: 'mix'; colors: ColorSpec[] }
  | { kind: 'special'; spec: SpecialGemSpec };

export interface CreateGemParams {
  op: 'create';
  gem: CreateGemSpec;
  /** 数量缩放规格（按施法者魔力求值；至少产出 0） */
  count: ScalingSpec;
  /** 二次缩放（如「每摧毁一颗紫色宝石，则创造 4 颗骷髅头 [x4]」） */
  modifier?: ModifierSpec;
}

/** 转化：某颜色 → 另一颜色（均可为 'CHOSEN'/'SKULL'）；端点亦可为特殊宝石种类 */
export interface TransformGemParams {
  op: 'transform';
  from: ColorSpec;
  to: ColorSpec;
  /** to 端点为特殊宝石时给出（优先于 to 的基色解析） */
  toSpecial?: SpecialGemKind;
  /** from 端点为特殊宝石时给出（优先于 from） */
  fromSpecial?: SpecialGemKind;
}

// —— 清除目标集（destroy / explode 共用） ——

/**
 * 清除目标集描述。产出一组"目标格"，再由 clear 模式决定是否辐射一圈。
 *   - lines：固定整行/整列（rows/cols）
 *   - chosenLine：玩家选定一枚宝石，取其所在整行/整列（起点 = ctx.chosenCell）
 *   - randomLines：随机 N 行 / N 列
 *   - color：某颜色全部（可 'CHOSEN'）
 *   - allColors：全部颜色宝石（不含骷髅）
 *   - skulls：全部骷髅
 *   - randomGems：随机 N 颗宝石（可限定仅颜色/含骷髅）
 *   - cell：以某格为中心（cell 可 'CELL'）；本身即单格，靠 explode 辐射成片
 */
export type ClearTarget =
  | { kind: 'lines'; rows?: number[]; cols?: number[] }
  | { kind: 'chosenLine'; orientation: 'row' | 'col' }
  | { kind: 'randomLines'; orientation: 'row' | 'col'; count: ScalingSpec }
  | { kind: 'color'; color: ColorSpec }
  | { kind: 'allColors' }
  | { kind: 'skulls' }
  | { kind: 'special'; gem: SpecialGemKind }
  | { kind: 'randomGems'; count: ScalingSpec; include?: 'color' | 'all'; color?: ColorSpec; special?: SpecialGemKind }
  | { kind: 'cell'; cell: CellPos | 'CELL' };

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

/** 创造型宝石的每颗取色：单一类型直接解析；混合型逐颗从候选色随机取（种子化）；特殊宝石按 spec 构造 */
function pickCreateGemType(spec: CreateGemSpec, ctx: EffectContext): GemType | null {
  if (spec.kind === 'skull') return skullGem();
  if (spec.kind === 'special') return specialGem(spec.spec.kind, spec.spec.tier);
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

  const n = evaluateWithModifier(evaluateScaling(params.count, casterMagic(ctx)), params.modifier, ctx);
  if (n <= 0) return [];

  const events: GameEvent[] = [];

  // 1. 优先填空格 → gem-create
  const slots = pickN(emptyCells(board), n, ctx);
  const spawns: GemCreateEvent['spawns'] = [];
  for (const pos of slots) {
    const gemType = pickCreateGemType(params.gem, ctx)!;
    const gem: Gem = { id: ctx.nextGemId(), type: gemType };
    board.set(pos, gem);
    spawns.push({ pos, gemId: gem.id, gemType: gem.type });
  }
  if (spawns.length > 0) events.push({ type: 'gem-create', spawns });

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
    if (changes.length > 0) events.push({ type: 'gem-transform', changes });
  }

  if (events.length === 0) return [];
  ctx.resolveBoardChange?.([], events);
  return events;
}
// —— 转化 ——

function doTransform(params: TransformGemParams, ctx: EffectContext): GameEvent[] {
  const board = ctx.state.board;
  const fromType = transformEndpointOf(params, 'from', ctx);
  const toType = transformEndpointOf(params, 'to', ctx);
  if (fromType === null || toType === null || (params.from === params.to && !params.toSpecial && !params.fromSpecial)) return [];
  const changes: GemTransformEvent['changes'] = [];
  board.forEach((gem, pos) => {
    if (gem && isSameMatchType(gem.type, fromType)) {
      const prev = gem.type;
      gem.type = toType;
      changes.push({ pos, gemId: gem.id, from: prev, to: toType });
    }
  });
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
      const n = evaluateWithModifier(evaluateScaling(target.count, casterMagic(ctx)), modifier, ctx);
      if (n <= 0) return [];
      // 可选限定色：「爆破 [魔法 + 1] 颗紫色宝石」从紫色的池子里随机取；可选限定特殊宝石种类
      const colorFilter = target.color === undefined ? null : resolveColor(target.color, ctx);
      if (target.color !== undefined && colorFilter === null) return null;
      const filterType = colorFilter === null ? null : colorGem(colorFilter);
      const pool: CellPos[] = [];
      board.forEach((gem, pos) => {
        if (!gem) return;
        if (target.special !== undefined && !(gem.type.kind === 'special' && gem.type.spec.kind === target.special)) return;
        if (target.include === 'color' && gem.type.kind !== 'color') return;
        if (filterType && !isSameMatchType(gem.type, filterType)) return;
        pool.push(pos);
      });
      return pickN(pool, n, ctx);
    }
    case 'cell': {
      const cell = target.cell === 'CELL' ? ctx.chosenCell : target.cell;
      return cell ? [cell] : null;
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
  const positions = params.mode === 'explode' ? radiate(targetCells) : targetCells;

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
