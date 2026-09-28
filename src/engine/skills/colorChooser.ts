/**
 * 选色机制（技能编写与演出 · 需求 2）。
 *
 * 《Gems of War》大量技能含"指定颜色/选定的颜色"——这是一个运行时输入，而非配置期常量：
 *   - 玩家方释放时从棋盘现存颜色中选一个（表现层交互，注入 FixedColorChooser）；
 *   - AI 方按确定性策略自动选（棋盘现存数量最多的颜色，平局取固定序更前者）。
 *
 * 技能配置里用占位符 'CHOSEN'（见 builders.ts）；释放时 TurnEngine 调用本模块得到具体颜色，
 * 写入 EffectContext.chosenColor，宝石原语遇 'CHOSEN' 时取它。无可选颜色返回 null → 安全跳过。
 *
 * 纯逻辑：无 pixi/gsap/dom 依赖；确定性（同棋盘同结果，需求 2.3, 2.7）。
 */
import { ALL_BASE_COLORS } from '../types';
import type { BaseColor } from '../types';
import type { GameState } from '../GameState';
import { colorAllowed, type ChoiceRule } from './gowChoiceRules';

/** 选色器：为一次技能释放选定一个颜色；无可选颜色返回 null。
 *  rule = 原生 spell Target 限制（Not<X>OrSkullGems 等，见 gowChoiceRules.ts）；AI 选色器遵守。 */
export interface ColorChooser {
  choose(state: GameState, casterId: number, rule?: ChoiceRule): BaseColor | null;
}

/** 统计棋盘上各基础色的现存数量 */
export function countBoardColors(state: GameState): Map<BaseColor, number> {
  const counts = new Map<BaseColor, number>();
  state.board.forEach((gem) => {
    if (gem && gem.type.kind === 'color') {
      counts.set(gem.type.color, (counts.get(gem.type.color) ?? 0) + 1);
    }
  });
  return counts;
}

/**
 * AI 选色策略（确定性，需求 2.3）：选棋盘现存数量最多的颜色；
 * 平局取 ALL_BASE_COLORS 固定序更靠前者；棋盘无任何颜色宝石 → null。
 */
export class AiColorChooser implements ColorChooser {
  choose(state: GameState, _casterId: number, rule?: ChoiceRule): BaseColor | null {
    const counts = countBoardColors(state);
    let best: BaseColor | null = null;
    let bestN = 0;
    // 按 ALL_BASE_COLORS 固定序遍历，保证平局取更前者（严格大于才替换）
    for (const color of ALL_BASE_COLORS) {
      // P-chooser-native-restrictions：原生 Not<X>OrSkullGems 等目标限制下不可选的颜色跳过
      if (!colorAllowed(rule, color)) continue;
      const n = counts.get(color) ?? 0;
      if (n > bestN) {
        bestN = n;
        best = color;
      }
    }
    return best;
  }
}

/** 固定选色：玩家已选定某色时用（表现层注入） */
export class FixedColorChooser implements ColorChooser {
  constructor(private color: BaseColor) {}
  choose(): BaseColor | null {
    return this.color;
  }
}

/** 判断一个技能原型是否含需要选色（'CHOSEN'）的宝石段，供 TurnEngine 决定是否调用选色器。
 *  R11 批扩展两处检测（AiColorChooser 无随机消耗，检测扩面不改既有技能的随机序列）：
 *   1. oneOf 分支内的宝石段（「转化为紫色宝石或恐惧宝石」二选一支里的 'CHOSEN' 端点）；
 *   2. 任意段的 ifCond targetColor 'CHOSEN'（「对所有使用该颜色的敌人…」动态色条件）。 */
export function prototypeNeedsColor(proto: { segments: readonly unknown[] }): boolean {
  for (const seg of proto.segments as ReadonlyArray<Record<string, unknown>>) {
    if (seg.kind === 'oneOf') {
      for (const branch of (seg.options ?? []) as ReadonlyArray<Record<string, unknown>>) {
        if (prototypeNeedsColor({ segments: Array.isArray(branch) ? branch : [branch] })) return true;
      }
      continue;
    }
    // 动态色条件（R11 批）：ifCond（含嵌套 not/anyOf/allOf）里出现 targetColor 'CHOSEN'
    if (segmentIfCondNeedsColor(seg)) return true;
    // P-R2-chosen-color-modifier: a count source { kind: 'boardGems', color: 'CHOSEN' } anywhere in the segment
    // (modifier / params.modifier / countModifier / chanceBoost, source / sources / sourceGroups)
    if (modifierSourceNeedsColor(seg)) return true;
    if (seg.kind !== 'gem') continue;
    const params = seg.params as {
      op?: string;
      gem?: { kind?: string; color?: unknown; colors?: unknown[] };
      from?: unknown;
      to?: unknown;
      target?: { kind?: string; color?: unknown };
    } | undefined;
    if (!params) continue;
    if (params.op === 'create') {
      if (params.gem?.kind === 'color' && params.gem.color === 'CHOSEN') return true;
      if (params.gem?.kind === 'mix' && (params.gem.colors ?? []).includes('CHOSEN')) return true;
    } else if (params.op === 'transform') {
      if (params.from === 'CHOSEN' || params.to === 'CHOSEN') return true;
    } else if (params.op === 'clear') {
      if (params.target?.kind === 'color' && params.target.color === 'CHOSEN') return true;
      if (params.target?.kind === 'randomGems' && params.target.color === 'CHOSEN') return true;
    }
  }
  return false;
}

/** P-R2-chosen-color-modifier: recursive search for a boardGems source reading the chosen colour. */
function modifierSourceNeedsColor(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(modifierSourceNeedsColor);
  if (!node || typeof node !== 'object') return false;
  const o = node as Record<string, unknown>;
  if (o.kind === 'boardGems' && o.color === 'CHOSEN') return true;
  return Object.values(o).some(modifierSourceNeedsColor);
}

/** 递归检查一段的 ifCond 是否依赖 'CHOSEN'（targetColor / not / anyOf / allOf 嵌套） */
function segmentIfCondNeedsColor(seg: Record<string, unknown>): boolean {
  const condNeeds = (cond: Record<string, unknown> | undefined): boolean => {
    if (!cond) return false;
    if (cond.kind === 'targetColor') return cond.color === 'CHOSEN';
    if (cond.kind === 'not') return condNeeds(cond.cond as Record<string, unknown>);
    if (cond.kind === 'anyOf' || cond.kind === 'allOf') {
      return ((cond.of ?? []) as Record<string, unknown>[]).some(condNeeds);
    }
    return false;
  };
  return condNeeds(seg.ifCond as Record<string, unknown> | undefined);
}
