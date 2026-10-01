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
  /** 本段文案里出现过的术语条目（按首次出现排序、去重） */
  terms: TermEntry[];
}

import { normalizeCombatText } from '../../data/combatText';
import { TERM_PATTERN, termEntryOf, type TermEntry } from '../../data/termGlossary';
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

/** 生成术语 span（span 而非 button：描述可能渲染在 <button>（竞技场 draft 卡）里，嵌套 button 是非法 HTML） */
function termSpan(alias: string, entry: TermEntry): string {
  return `<span class="spell-term" role="button" tabindex="0" aria-expanded="false" data-term="${entry.id}">${alias}</span>`;
}

/**
 * 术语高亮：把文本里的已知术语（状态/特殊宝石/战斗词，见 data/termGlossary）包成
 * `.spell-term` 按钮，点击弹出术语解释面板（shell/termTip.ts）。
 *
 * 按 HTML 标签切分后只处理顶层文本节点：`<button>`/`<b>`/`<span>` 内部的文本
 * 一律跳过——数值按钮内部嵌套术语会出现双箭头和点击冲突（先公式后术语两通道
 * 叠加时的边界），术语与公式尾缀相邻的拆分由 renderSpell 的 mark 负责处。
 * 不受 interactive 开关限制——术语解释是静态内容，非交互场景同样可点。
 */
export function applyTermMarkup(text: string, terms?: TermEntry[]): string {
  if (!text) return text;
  const SKIP_TAGS = new Set(['button', 'b', 'span']);
  let depth = 0;
  return text
    .split(/(<[^>]*>)/)
    .map((seg) => {
      if (!seg) return seg;
      if (seg.startsWith('<')) {
        const m = seg.match(/^<(\/?)([a-zA-Z][a-zA-Z0-9-]*)/);
        if (m && SKIP_TAGS.has(m[2].toLowerCase())) {
          depth += m[1] ? -1 : 1;
          if (depth < 0) depth = 0;
        }
        return seg;
      }
      if (depth > 0) return seg;
      return seg.replace(TERM_PATTERN, (alias: string) => {
        const entry = termEntryOf(alias);
        if (!entry) return alias;
        if (terms && !terms.includes(entry)) terms.push(entry);
        return termSpan(alias, entry);
      });
    })
    .join('');
}

/** 数值按钮尾缀里若含术语别名，拆成「数值按钮 + 术语 span」两段（避免按钮内嵌套） */
function mark(value: number, suffix: string, interactive: boolean, terms?: TermEntry[]): string {
  const m = suffix.match(TERM_PATTERN);
  const termHit = m && termEntryOf(m[0]);
  let head = suffix;
  let rest = '';
  if (m && termHit) {
    const idx = suffix.indexOf(m[0]);
    head = suffix.slice(0, idx);
    rest = applyTermMarkup(suffix.slice(idx), terms);
  }
  const label = `${value}${head ? ' ' + head : ''}`;
  return interactive
    ? `<button type="button" class="spell-stat" aria-expanded="false">${label}</button>${rest}`
    : `<b>${label}</b>${rest}`;
}

export function renderSpell(desc: string, magic: number, opts: { interactive?: boolean } = {}): SpellRender {
  const interactive = opts.interactive ?? true;
  const clean = normalizeText(desc ?? '');
  if (!clean) return { html: '', formulas: [], terms: [] };
  const formulas: Formula[] = [];
  const terms: TermEntry[] = [];
  const unit = '点(?:真实)?(?:伤害|生命值|生命|护甲值|护甲|攻击力|攻击|法力值|法力|魔力值)?';

  let text = clean.replace(/\s*\[([^[]]+)\]\s*$/g, (all, inner: string) => (isScalingTag(inner) ? '' : all));
  text = text.replace(new RegExp('\\[([^\\[\\]]+)\\](\\s*)(' + unit + ')', 'g'), (all, inner: string, sp: string, u: string) => {
    if (isScalingTag(inner)) return sp + u;
    const value = evalMagicExpr(inner, magic);
    if (value == null) return all;
    formulas.push({ expr: inner.trim(), value, unit: u });
    return mark(value, u, interactive, terms);
  });
  text = text.replace(/\[([^[]]+)\]/g, (all, inner: string) => {
    if (isScalingTag(inner)) return '';
    const value = evalMagicExpr(inner, magic);
    if (value == null) return all;
    formulas.push({ expr: inner.trim(), value, unit: '' });
    return mark(value, '', interactive, terms);
  });
  return { html: applyTermMarkup(text, terms).trim(), formulas, terms };
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
