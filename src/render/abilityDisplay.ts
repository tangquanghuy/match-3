import { evaluateScaling, type ScalingSpec } from '../engine/skills/scaling';
import { isScalingTag, normalizeText } from '../meta/shell/spellText';

// DescriptionWriter uses String(number), which can include exponent notation.
// Recognize only its linear scalings; never evaluate arbitrary expressions.
const UNSIGNED = String.raw`(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?`;
const NUMBER = `[+-]?${UNSIGNED}`;
const MECHANICAL = new RegExp(`^(?:(${NUMBER})×)?魔力([+-]${UNSIGNED})?$`, 'i');
const CONSTANT = new RegExp(`^${NUMBER}$`, 'i');
const NATIVE = new RegExp(`^(?:魔法(?:([x*/])(${NUMBER}))?|\\(魔法([x*/])(${NUMBER})\\))([+-]${UNSIGNED})?$`, 'i');

function mechanicalScaling(expression: string): ScalingSpec | undefined {
  const compact = expression.replace(/\s+/g, '');
  if (CONSTANT.test(compact)) return { base: Number(compact), mult: 0 };
  const match = MECHANICAL.exec(compact);
  return match ? { base: Number(match[2] ?? 0), mult: Number(match[1] ?? 1) } : undefined;
}

function nativeScaling(expression: string): ScalingSpec | undefined {
  let compact = expression.replace(/\s+/g, '').replace(/[×Ｘ]/g, 'x');
  // Only unwrap parentheses enclosing the whole simple expression. Removing
  // parentheses across an addition/division could change the calculation.
  const wrapped = /^\(([^()]*)\)$/.exec(compact);
  if (wrapped) compact = wrapped[1];
  const match = NATIVE.exec(compact);
  if (!match) return undefined;
  const op = match[1] ?? match[3];
  const factor = Number(match[2] ?? match[4] ?? 1);
  if (op === '/' && factor === 0) return undefined;
  return { base: Number(match[5] ?? 0), mult: op === '/' ? 1 / factor : factor };
}

/** Preserve grouping and rounding order for rules requiring battlefield state. */
function readableRules(text: string): string {
  const names: Record<string, string> = { floor: '向下取整', round: '四舍五入', min: '取较小值', max: '取较大值' };
  let depth = 0, ruleDepth: number | undefined;
  return text.replace(/\b(floor|round|min|max)\s*\(|[()]/g, (token: string, name: string | undefined) => {
    if (name) {
      depth++;
      ruleDepth ??= depth;
      return names[name] + '（';
    }
    if (token === '(') {
      depth++;
      return ruleDepth === undefined ? token : '（';
    }
    const withinRule = ruleDepth !== undefined;
    if (depth === ruleDepth) ruleDepth = undefined;
    depth = Math.max(0, depth - 1);
    return withinRule ? '）' : token;
  }).replaceAll('数值=', '数值为');
}

/**
 * Player text for unit.spellDescription + unit.magic. Pass the result through
 * renderSpell(escapeHtml(text), magic, { interactive: false }) for native markup.
 *
 * Uses the engine's round/clamp, never the native renderer's floor evaluator.
 * Only recognized linear base scalings are resolved; target/board modifiers
 * remain Chinese rules, rather than claiming to be final damage or rewards.
 * Mechanical descriptions, diagnostic coverage, names and fingerprints stay intact.
 * Returns plain text; the caller owns HTML escaping.
 */
export function abilityDisplayText(description: string, magic: number): string {
  const resolve = (spec: ScalingSpec | undefined): number | undefined => {
    if (!spec || !Number.isFinite(magic) || !Number.isFinite(spec.base) || !Number.isFinite(spec.mult)) return undefined;
    const value = evaluateScaling(spec, magic);
    return Number.isFinite(value) ? value : undefined;
  };
  // Resolve inner mechanical scalings first: a bracketed random interval can
  // contain several complete formulas and must not swallow them as one token.
  const mechanical = description.replace(/\bmax\s*\(\s*0\s*,\s*round\s*\(\s*([^()]*)\s*\)\s*\)/g,
    (all: string, inner: string) => {
      const value = resolve(mechanicalScaling(inner));
      return value === undefined ? all : String(value);
    });
  const resolved = mechanical.replace(/\[([^\x5b\x5d]*)\]/g, (all: string, inner: string) => {
    if (isScalingTag(inner)) return '';
    const value = resolve(nativeScaling(inner));
    if (value !== undefined) return String(value);
    // Unresolved magic brackets must not reach renderSpell's floor evaluator.
    return /魔法|魔力/.test(inner) ? `（${inner}，按当前魔力计算）` : all;
  });
  return normalizeText(readableRules(resolved)).trim();
}
