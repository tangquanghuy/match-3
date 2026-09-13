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
import { colorGem, skullGem, isSameMatchType, posKey } from '../../types';
import type { BaseColor, CellPos, Gem, GemType } from '../../types';
import type {
  GameEvent,
  GemCreateEvent,
  GemTransformEvent,
  GemClearEvent,
} from '../../events';
import type { ScalingSpec } from '../scaling';
import { evaluateScaling } from '../scaling';
import type { EffectContext, EffectPrimitive, DestroyedGem } from './context';
import { casterMagic } from './context';

/**
 * 颜色规格：具体基础色，或占位符 'CHOSEN'（运行时由 ctx.chosenColor 解析，需求 2）。
 * 无法解析（chosenColor 为空）时，宝石段安全跳过。
 */
export type ColorSpec = BaseColor | 'CHOSEN';

/** 把 ColorSpec 解析为具体基础色；'CHOSEN' 取 ctx.chosenColor，缺省返回 null */
function resolveColor(spec: ColorSpec, ctx: EffectContext): BaseColor | null {
  if (spec === 'CHOSEN') return ctx.chosenColor ?? null;
  return spec;
}

// —— 创造 / 转化 ——

/** 创造：指定颜色（可为 'CHOSEN'）或骷髅宝石 */
export interface CreateGemParams {
  op: 'create';
  gem: { kind: 'color'; color: ColorSpec } | { kind: 'skull' };
  /** 数量缩放规格（按施法者魔力求值；至少产出 0） */
  count: ScalingSpec;
}

/** 转化：某颜色 → 另一颜色（均可为 'CHOSEN'） */
export interface TransformGemParams {
  op: 'transform';
  from: ColorSpec;
  to: ColorSpec;
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
  | { kind: 'randomGems'; count: ScalingSpec; include?: 'color' | 'all' }
  | { kind: 'cell'; cell: CellPos | 'CELL' };

/** 清除操作：destroy=仅目标本身；explode=目标并入每颗 8 邻格 */
export interface ClearGemParams {
  op: 'clear';
  mode: 'destroy' | 'explode';
  target: ClearTarget;
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

function gemTypeOf(spec: CreateGemParams['gem'], ctx: EffectContext): GemType | null {
  if (spec.kind === 'skull') return skullGem();
  const color = resolveColor(spec.color, ctx);
  return color === null ? null : colorGem(color);
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

function doCreate(params: CreateGemParams, ctx: EffectContext): GameEvent[] {
  const board = ctx.state.board;
  const gemType = gemTypeOf(params.gem, ctx);
  if (gemType === null) return [];

  const n = evaluateScaling(params.count, casterMagic(ctx));
  if (n <= 0) return [];

  const events: GameEvent[] = [];

  // 1. 优先填空格 → gem-create
  const slots = pickN(emptyCells(board), n, ctx);
  const spawns: GemCreateEvent['spawns'] = [];
  for (const pos of slots) {
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
      if (gem && !isSameMatchType(gem.type, gemType)) convertible.push(pos);
    });
    const targets = pickN(convertible, remaining, ctx);
    const changes: GemTransformEvent['changes'] = [];
    for (const pos of targets) {
      const gem = board.get(pos)!;
      const from = gem.type;
      gem.type = gemType;
      changes.push({ pos, gemId: gem.id, from, to: gemType });
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
  const from = resolveColor(params.from, ctx);
  const to = resolveColor(params.to, ctx);
  if (from === null || to === null || from === to) return [];
  const fromType = colorGem(from);
  const toType = colorGem(to);
  const changes: GemTransformEvent['changes'] = [];
  board.forEach((gem, pos) => {
    if (gem && isSameMatchType(gem.type, fromType)) {
      const prev = gem.type;
      gem.type = toType;
      changes.push({ pos, gemId: gem.id, from: prev, to: toType });
    }
  });
  if (changes.length === 0) return [];
  const events: GameEvent[] = [{ type: 'gem-transform', changes }];
  ctx.resolveBoardChange?.([], events);
  return events;
}

// —— 清除（destroy / explode） ——

/**
 * 解析目标集为一组格子（去重、限界）。无法解析（选色/选行列/选格缺失）时返回 null，调用方安全跳过。
 */
function resolveTargetCells(target: ClearTarget, ctx: EffectContext): CellPos[] | null {
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
      const n = evaluateScaling(target.count, casterMagic(ctx));
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
    case 'randomGems': {
      const n = evaluateScaling(target.count, casterMagic(ctx));
      if (n <= 0) return [];
      const pool: CellPos[] = [];
      board.forEach((gem, pos) => {
        if (!gem) return;
        if (target.include === 'color' && gem.type.kind !== 'color') return;
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
  const targetCells = resolveTargetCells(params.target, ctx);
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
    destroyed.push({ gemType: gem.type });
    board.set(pos, null);
  }
  if (cells.length === 0) return [];

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
