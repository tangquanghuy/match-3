/**
 * 选色机制（技能编写与演出 · 需求 2）。
 *
 * 《Gems of War》大量技能含"指定颜色/选定的颜色"——这是一个运行时输入，而非配置期常量：
 *   - 玩家方释放时从棋盘现存颜色中选一个（表现层交互，注入 FixedColorChooser）；
 *   - AI 方按技能效果和双方需用颜色选色，平局取固定序更前者。
 *
 * 技能配置里用占位符 'CHOSEN'（见 builders.ts）；释放时 TurnEngine 调用本模块得到具体颜色，
 * 写入 EffectContext.chosenColor，宝石原语遇 'CHOSEN' 时取它。无可选颜色返回 null → 安全跳过。
 *
 * 纯逻辑：无 pixi/gsap/dom 依赖；确定性（同棋盘同结果，需求 2.3, 2.7）。
 */
import { ALL_BASE_COLORS, PlayerSide, colorGem, isSameMatchType, skullGem } from '../types';
import type { BaseColor } from '../types';
import type { GameState } from '../GameState';
import type { SkillPrototype } from './prototypes';
import { colorAllowed, type ChoiceRule } from './gowChoiceRules';
import { casterSide, compareChoiceScores, manaNeeds, sameGemType, teamColorCounts, transformOutput, transformedMatchScore } from './gemChoiceScore';

/** 选色器：为一次技能释放选定一个颜色；无可选颜色返回 null。
 *  rule = 原生 spell Target 限制（Not<X>OrSkullGems 等，见 gowChoiceRules.ts）；AI 选色器遵守。 */
export interface ColorChooser {
  choose(state: GameState, casterId: number, rule?: ChoiceRule, proto?: SkillPrototype): BaseColor | null;
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
 * AI 选色策略：转化优先己方有用的四/五连，其次其他四/五连与己方即时匹配；
 * 摧毁优先己方缺法力的颜色，按颜色影响敌人的技能优先敌方用色；无可选颜色返回 null。
 */
export class AiColorChooser implements ColorChooser {
  choose(state: GameState, casterId: number, rule?: ChoiceRule, proto?: SkillPrototype): BaseColor | null {
    const counts = countBoardColors(state);
    const side = casterSide(state, casterId);
    const caster = side ? state.teams[side].characters.find(ch => ch.id === casterId) : undefined;
    const needs = side ? manaNeeds(state.teams[side].characters) : new Map<BaseColor, number>();
    const enemySide = side === PlayerSide.Left ? PlayerSide.Right : PlayerSide.Left;
    const enemyColors = teamColorCounts(state.teams[enemySide].characters);
    const targetsEnemyColor = proto?.segments.some(seg =>
      'target' in seg && typeof seg.target === 'string' && seg.target.startsWith('enemy')
      && seg.ifCond?.kind === 'targetColor' && seg.ifCond.color === 'CHOSEN') ?? false;
    const destroysChosenColor = proto?.segments.some(seg => seg.kind === 'gem' && seg.params.op === 'clear'
      && (seg.params.target.kind === 'color' && seg.params.target.color === 'CHOSEN'
        || seg.params.target.kind === 'randomGems' && seg.params.target.color === 'CHOSEN')) ?? false;
    let best: BaseColor | null = null;
    let bestScore: readonly number[] = [-1];
    for (const color of ALL_BASE_COLORS) {
      if (!colorAllowed(rule, color)) continue;
      const n = counts.get(color) ?? 0;
      if (n === 0) continue;
      let matchScore: readonly number[] = [0, 0, 0, 0];
      for (const seg of proto?.segments ?? []) {
        if (seg.kind !== 'gem' || seg.params.op !== 'transform') continue;
        const params = seg.params;
        if (params.count || params.diagonal || params.from !== 'CHOSEN' && params.to !== 'CHOSEN') continue;
        const output = transformOutput(params, caster, color);
        if (!output) continue;
        const source = params.from === 'CHOSEN' ? colorGem(color)
          : params.from === 'SKULL' ? skullGem()
            : ALL_BASE_COLORS.includes(params.from as BaseColor) ? colorGem(params.from as BaseColor) : null;
        if (!source && !params.fromSpecial || source && sameGemType(source, output)) continue;
        const changes: { row: number; col: number }[] = [];
        state.board.forEach((gem, pos) => {
          if (gem && !sameGemType(gem.type, output) && (params.fromSpecial
            ? gem.type.kind === 'special' && gem.type.spec.kind === params.fromSpecial
            : isSameMatchType(gem.type, source!))) changes.push(pos);
        });
        const score = transformedMatchScore(state.board, changes, output, needs);
        if (compareChoiceScores(score, matchScore) > 0) matchScore = score;
      }
      const affected = targetsEnemyColor ? enemyColors.get(color) ?? 0 : needs.get(color) ?? 0;
      const score = matchScore[0]! > 0 ? [matchScore[0]! + 2, ...matchScore.slice(1), n]
        : destroysChosenColor ? [affected > 0 ? 2 : 1, affected, n]
          : [1, n];
      if (compareChoiceScores(score, bestScore) > 0) {
        bestScore = score;
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
