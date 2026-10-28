import { describe, expect, it } from 'vitest';
import { evaluateScaling, type ScalingSpec } from '../../src/engine/skills/scaling';
import { BaseColor } from '../../src/engine/types';
import type { SkillPrototype } from '../../src/engine/skills/prototypes';
import { registerSkillLibrary, SKILL_LIBRARY } from '../../src/engine/skills/library';
import { renderSpell } from '../../src/meta/shell/spellText';
import { describeAdaptedAbility } from '../../src/sillytavern/abilityDescription';
import { abilityDisplayText } from '../../src/sillytavern/abilityDisplay';

const damage = (scaling: ScalingSpec): SkillPrototype => ({ segments: [{ kind: 'damage', target: 'enemyChosen', scaling }] });
const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const codeFormula = /\b(?:max|min|round|floor)\s*\(/;

describe('abilityDisplayText engine scaling semantics', () => {
  it.each([
    { base: 4, mult: 0.5, magic: 5 },
    { base: 3, mult: 1.5, magic: 5 },
    { base: 0, mult: 1 / 3, magic: 5 },
    { base: -8, mult: 1, magic: 5 },
    { base: 0.5, mult: 0, magic: 5 },
    { base: -0.5, mult: 0, magic: 5 },
    { base: 0.1, mult: -1.5, magic: 5 },
    { base: 0.5, mult: 1e-7, magic: 5 },
    { base: -1e-7, mult: 1, magic: 0.5 },
    { base: 1e21, mult: 0, magic: 0 },
  ])('matches evaluateScaling for $base + $mult × $magic', ({ base, mult, magic }) => {
    const spec = { base, mult };
    const mechanical = describeAdaptedAbility(damage(spec)).description;
    const display = abilityDisplayText(mechanical, magic);
    expect(display).toBe(`1. 对选定的一名敌人造成${evaluateScaling(spec, magic)}点伤害`);
    expect(display).not.toMatch(codeFormula);
  });

  it.each([
    ['[(魔法 / 2) + 4]', 7], ['[魔法/2]', 3], ['[(魔法×1.5)+3]', 11],
    ['[魔法 + 3]', 8], ['[魔法]', 5], ['[(魔法-8)]', 0],
    ['[(魔法 x 1.5)]', 8], ['[魔法 - 2.5]', 3], ['[魔法×-0.5+4]', 2],
  ])('resolves native %s with engine round before native rendering', (formula, value) => {
    const text = abilityDisplayText(`造成 ${formula} 点真实伤害。`, 5);
    expect(text).toBe(`造成 ${value} 点真实伤害。`);
    const rendered = renderSpell(escapeHtml(text), 5, { interactive: false });
    expect(rendered.html).toContain(String(value));
    expect(rendered.html).toContain('data-term="truedamage"');
    expect(rendered.formulas).toEqual([]);
  });

  it('rounds the complete base plus scaling sum, rather than rounding its parts', () => {
    expect(abilityDisplayText('max(0,round(0.5×魔力+0.5))', 1)).toBe('1');
    expect(abilityDisplayText('[(魔法/2)+0.5]', 1)).toBe('1');
    // The native floor path is explicitly different for the regression case.
    expect(renderSpell('造成 [(魔法/2)+4] 点伤害。', 5, { interactive: false }).formulas[0].value).toBe(6);
    expect(abilityDisplayText('[(魔法/2)+4]', 5)).toBe('7');
  });
});

describe('abilityDisplayText rules and integration', () => {
  it('resolves exact inner scalings inside nested rules and retains floor/cap order', () => {
    const source = '数值=max(0,max(0,round(0.5×魔力+4))+min(floor((自身护甲+自身生命)×34/100),max(0,8)))';
    expect(abilityDisplayText(source, 5)).toBe('数值为取较大值（0,7+取较小值（向下取整（（自身护甲+自身生命）×34/100）,取较大值（0,8）））');
  });

  it('does not reinterpret unsupported expressions or discard their grouping', () => {
    const source = 'max(0,round((魔力+3)/2))；max(0,round(目标生命×0.5))；[魔法/(2+1)]；[魔法/0]';
    const text = abilityDisplayText(source, 5);
    expect(text).toBe('取较大值（0,四舍五入（（魔力+3）/2））；取较大值（0,四舍五入（目标生命×0.5））；（魔法/(2+1)，按当前魔力计算）；（魔法/0，按当前魔力计算）');
    expect(text).not.toMatch(codeFormula);
    expect(renderSpell(escapeHtml(text), 5, { interactive: false }).formulas).toEqual([]);
  });

  it('retains random ranges, every branch, board modifiers and conditional notes', () => {
    const prototype: SkillPrototype = { segments: [{ kind: 'choose', labels: ['伤害', '宝石'], options: [
      [{ kind: 'damage', target: 'enemyAll', scaling: { base: 4, mult: 0.5 }, rangeSpec: { min: { base: 4, mult: 0.5 }, max: { base: 8, mult: 1 } }, modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'boardGems', color: BaseColor.Red }, max: 8 }, condMult: { cond: { kind: 'selfHpDamaged' }, times: 2 } }],
      [{ kind: 'gem', params: { op: 'create', gem: { kind: 'color', color: BaseColor.Blue }, count: { base: 0, mult: 0.5 } } }],
    ] }] };
    const text = abilityDisplayText(describeAdaptedAbility(prototype).description, 5);
    expect(text).toContain('由施放者选择一个分支');
    expect(text).toContain('区间随机整数[7,13]');
    expect(text).toContain('分支1');
    expect(text).toContain('分支2');
    expect(text).toContain('向下取整');
    expect(text).toContain('红');
    expect(text).toContain('数值最后×2');
    expect(text).toContain('3颗蓝色宝石');
    expect(text).not.toMatch(codeFormula);
  });

  it('keeps mechanical descriptions, coverage, diagnostics and fingerprints unchanged', () => {
    const prototype = damage({ base: 3, mult: 1.5 });
    const original = describeAdaptedAbility(prototype);
    const snapshot = structuredClone(original);
    expect(original.description).toContain('max(0,round(1.5×魔力+3))');
    expect(original.name).toMatch(/〔[0-9a-z]{7}〕$/);
    expect(abilityDisplayText(original.description, 5)).toContain('11点伤害');
    expect(abilityDisplayText(original.description, 7)).toContain('14点伤害');
    expect(original).toEqual(snapshot);
    expect(describeAdaptedAbility(prototype)).toEqual(snapshot);
  });

  it('returns plain text for caller escaping and native term normalization', () => {
    const text = abilityDisplayText('<img src=x onerror="alert(1)"> 获得屏障，造成[魔法+2]点真实伤害，纠缠敌人。 [x3]', 5);
    expect(text).toContain('<img src=x onerror="alert(1)">');
    expect(text).toContain('缠绕');
    expect(text).not.toContain('[x3]');
    const rendered = renderSpell(escapeHtml(text), 5, { interactive: false });
    expect(rendered.html).not.toContain('<img');
    expect(rendered.html).toContain('&lt;img');
    expect(rendered.html).toContain('data-term="barrier"');
    expect(rendered.html).toContain('data-term="truedamage"');
    expect(rendered.html).not.toContain('spell-stat');
  });

  it('preserves unknown text, handles empty text and is stable across repeat calls', () => {
    expect(abilityDisplayText('', 5)).toBe('');
    expect(abilityDisplayText('  获得一个额外回合。  ', 5)).toBe('获得一个额外回合。');
    expect(abilityDisplayText('【未解析项】 [未知标记]', 5)).toBe('【未解析项】 [未知标记]');
    const once = abilityDisplayText('数值=max(0,round(0.5×魔力+4))+floor((自身护甲)/3)', 5);
    expect(abilityDisplayText(once, 5)).toBe(once);
    expect(abilityDisplayText('数值=max(0,round(0.5×魔力+4))+floor((自身护甲)/3)', 5)).toBe(once);
  });

  it.each([NaN, Infinity, -Infinity])('keeps invalid magic %s symbolic without NaN or Infinity', magic => {
    const text = abilityDisplayText('max(0,round(0.5×魔力+4)) / [(魔法/2)+4]', magic);
    expect(text).not.toMatch(/NaN|Infinity/);
    expect(text).toContain('四舍五入');
    expect(text).not.toMatch(codeFormula);
    expect(renderSpell(escapeHtml(text), magic, { interactive: false }).formulas).toEqual([]);
  });

  it('formats the actual troop and weapon catalogue without leaking formula code', () => {
    const registry = new Map<string, SkillPrototype>();
    registerSkillLibrary(registry);
    const prototypes = [...Object.values(SKILL_LIBRARY), ...[...registry].filter(([id]) => /^\d+$/.test(id)).map(([, prototype]) => prototype)];
    expect(prototypes.length).toBeGreaterThan(2100);
    for (const prototype of prototypes) {
      const description = describeAdaptedAbility(prototype).description;
      const text = abilityDisplayText(description, 5);
      expect(text).not.toMatch(codeFormula);
      expect(text).not.toContain('数值=');
      expect(abilityDisplayText(text, 5)).toBe(text);
    }
  });
});

