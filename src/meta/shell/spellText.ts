/**
 * 法术/技能文案渲染（troop 详情 / 主角武器库 / 编队详情三处共用）。
 *
 * - `[魔法+N]`、`[(魔法/2)+N]`、`[(魔法×1.5)+N]`、`[魔法/N]`、`[魔法-N]` 一律
 *   按当前魔力求值并高亮；`interactive` 时渲染成按钮，点击弹出计算过程；
 *   尾部 `[1:1]`、`[x8]` 等增强比标注剥除（小样同款规则）。
 * - 数据文案来自 troops.json 机器翻译，偶有 CJK 间多余空格与病句：
 *   显示层做无侵入清洗（PHRASE_FIXES 只做显示替换，数据以 troops.json 为准，
 *   病句源头应随 build_troops 管道修正）。
 */

export interface Formula {
  expr: string;
  value: number;
  unit: string;
}

export interface SpellRender {
  html: string;
  formulas: Formula[];
}

import { normalizeCombatText } from '../../data/combatText';
export const normalizeText = normalizeCombatText;

export function evalMagicExpr(inner: string, magic: number): number | null {
  const expr = inner.replace(/\s+/g, '').replace(/×/g, 'x').replace(/Ｘ/g, 'x');
  let m = expr.match(/^魔法\+([\d.]+)$/);
  if (m) return magic + Number(m[1]);
  if (/^魔法$/.test(expr)) return magic;
  m = expr.match(/^魔法\/([\d.]+)$/) || expr.match(/^\(魔法\/([\d.]+)\)$/);
  if (m) return Math.floor(magic / Number(m[1]));
  m = expr.match(/^\(魔法\/([\d.]+)\)\+([\d.]+)$/);
  if (m) return Math.floor(magic / Number(m[1]) + Number(m[2]));
  m = expr.match(/^\(魔法[x*]([\d.]+)\)\+([\d.]+)$/);
  if (m) return Math.floor(magic * Number(m[1]) + Number(m[2]));
  m = expr.match(/^\(魔法-([\d.]+)\)$/);
  if (m) return Math.max(0, magic - Number(m[1]));
  return null;
}

export function isScalingTag(inner: string): boolean {
  const c = inner.replace(/\s+/g, '');
  return /^\d+:\d+$/.test(c) || /^x\d+$/i.test(c);
}

export function renderSpell(desc: string, magic: number, opts: { interactive?: boolean } = {}): SpellRender {
  const interactive = opts.interactive ?? true;
  const clean = normalizeText(desc ?? '');
  if (!clean) return { html: '', formulas: [] };
  const formulas: Formula[] = [];
  const unit = '点(?:真实)?(?:伤害|生命值|生命|护甲值|护甲|攻击力|攻击|法力值|法力|魔力值)?';
  const mark = (value: number, suffix: string): string =>
    interactive
      ? `<button type="button" class="spell-stat" aria-expanded="false">${value} ${suffix}</button>`
      : `<b>${value}${suffix ? ' ' + suffix : ''}</b>`;

  let text = clean.replace(/\s*\[([^[]]+)\]\s*$/g, (all, inner: string) => (isScalingTag(inner) ? '' : all));
  text = text.replace(new RegExp('\\[([^\\[\\]]+)\\](\\s*)(' + unit + ')', 'g'), (all, inner: string, sp: string, u: string) => {
    if (isScalingTag(inner)) return sp + u;
    const value = evalMagicExpr(inner, magic);
    if (value == null) return all;
    formulas.push({ expr: inner.trim(), value, unit: u });
    return mark(value, u);
  });
  text = text.replace(/\[([^[]]+)\]/g, (all, inner: string) => {
    if (isScalingTag(inner)) return '';
    const value = evalMagicExpr(inner, magic);
    if (value == null) return all;
    formulas.push({ expr: inner.trim(), value, unit: '' });
    return mark(value, '');
  });
  return { html: text.trim(), formulas };
}

export function formulaRule(expr: string): string {
  const compact = expr.replace(/\s+/g, '').replace(/×/g, 'x');
  let m = compact.match(/^魔法\+([\d.]+)$/);
  if (m) return '魔力 + ' + m[1];
  if (/^魔法$/.test(compact)) return '魔力';
  m = compact.match(/^魔法\/([\d.]+)$/) || compact.match(/^\(魔法\/([\d.]+)\)$/);
  if (m) return '魔力 ÷ ' + m[1];
  m = compact.match(/^\(魔法\/([\d.]+)\)\+([\d.]+)$/);
  if (m) return `魔力 ÷ ${m[1]} + ${m[2]}`;
  m = compact.match(/^\(魔法[x*]([\d.]+)\)\+([\d.]+)$/);
  if (m) return `魔力 × ${m[1]} + ${m[2]}`;
  m = compact.match(/^\(魔法-([\d.]+)\)$/);
  if (m) return `魔力 − ${m[1]}`;
  return expr;
}

export function formulaKind(unit: string): string {
  if (/伤害/.test(unit)) return '伤害';
  if (/生命/.test(unit)) return '生命';
  if (/护甲/.test(unit)) return '护甲';
  if (/攻击/.test(unit)) return '攻击';
  if (/魔力|魔法/.test(unit)) return '魔力';
  if (/法力/.test(unit)) return '法力';
  return '效果';
}

export function formulaParts(expr: string, magic: number): { rows: Array<{ label: string; value: string }>; total: number | null } {
  const compact = expr.replace(/\s+/g, '').replace(/×/g, 'x').replace(/Ｘ/g, 'x');
  let m = compact.match(/^魔法\+([\d.]+)$/);
  if (m) {
    return {
      rows: [{ label: '魔力', value: String(magic) }, { label: '技能加成', value: '+' + m[1] }],
      total: magic + Number(m[1]),
    };
  }
  if (/^魔法$/.test(compact)) return { rows: [{ label: '魔力', value: String(magic) }], total: magic };
  m = compact.match(/^魔法\/([\d.]+)$/) || compact.match(/^\(魔法\/([\d.]+)\)$/);
  if (m) {
    const half = Math.floor(magic / Number(m[1]));
    return { rows: [{ label: '魔力', value: String(magic) }, { label: `÷ ${m[1]}`, value: String(half) }], total: half };
  }
  m = compact.match(/^\(魔法\/([\d.]+)\)\+([\d.]+)$/);
  if (m) {
    const half = Math.floor(magic / Number(m[1]));
    const rows = [{ label: '魔力', value: String(magic) }, { label: `÷ ${m[1]}`, value: String(half) }];
    if (Number(m[2])) rows.push({ label: '技能加成', value: '+' + m[2] });
    return { rows, total: Math.floor(magic / Number(m[1]) + Number(m[2])) };
  }
  m = compact.match(/^\(魔法[x*]([\d.]+)\)\+([\d.]+)$/);
  if (m) {
    const scaled = Math.floor(magic * Number(m[1]));
    const rows = [{ label: '魔力', value: String(magic) }, { label: `× ${m[1]}`, value: String(scaled) }];
    if (Number(m[2])) rows.push({ label: '技能加成', value: '+' + m[2] });
    return { rows, total: Math.floor(magic * Number(m[1]) + Number(m[2])) };
  }
  m = compact.match(/^\(魔法-([\d.]+)\)$/);
  if (m) {
    return {
      rows: [{ label: '魔力', value: String(magic) }, { label: '技能减免', value: '−' + m[1] }],
      total: Math.max(0, magic - Number(m[1])),
    };
  }
  const direct = evalMagicExpr(expr, magic);
  return { rows: [{ label: '当前值', value: direct == null ? '—' : String(direct) }], total: direct };
}
