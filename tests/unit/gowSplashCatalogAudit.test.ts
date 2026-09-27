// @ts-expect-error node types are not installed in this project
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TROOPS } from '../../src/data/troops';
import { SKILL_LIBRARY } from '../../src/engine/skills/library';
import type { EffectSegment } from '../../src/engine/skills/prototypes';
import { spellDescription } from '../../src/data/combatText';

type NativeStep = { Type: string };
type SourceTroop = { id: number; stats: { spell: { id: number; desc: string } } };
const source: SourceTroop[] = JSON.parse(fs.readFileSync('data/raw/troops.gow.en.json', 'utf8')).troops;
const native = new Map<number, NativeStep[]>(JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json', 'utf8')).spells
  .filter((s: { RawData?: string }) => s.RawData)
  .map((s: { Id: number; RawData: string }) => [s.Id, JSON.parse(s.RawData).SpellSteps]));
const flatten = (ss: EffectSegment[]): EffectSegment[] => ss.flatMap(s => s.kind === 'oneOf' || s.kind === 'choose' ? s.options.flatMap(flatten) : [s]);
const installed = source.filter(t => TROOPS.some(x => x.id === t.id) && (/splash/i.test(t.stats.spell.desc)
  || native.get(t.stats.spell.id)?.some(s => /Splash/.test(s.Type))));
const ratioFromNative = (s: NativeStep) => /Heavy/.test(s.Type) ? 0.75 : /High/.test(s.Type) ? 0.5 : 0.25;
const textKinds = (text: string) => [...text.matchAll(/(?:(轻度|重度)(?:真实)?|真实(轻度|重度))?溅射/g)]
  .map(m => (m[1] ?? m[2]) === '轻度' ? 0.25 : (m[1] ?? m[2]) === '重度' ? 0.75 : 0.5);
const unique = (xs: number[]) => [...new Set(xs)].sort();

describe('every installed official splash troop: independent source audit', () => {
  it('covers all 64 source troops, excluding community skills and uninstalled entries', () => {
    expect(installed).toHaveLength(64);
  });
  it.each(installed.map(t => [t.id, t.stats.spell.id, t] as const))('troop %i / spell %i preserves source splash types and UI text', (_id, spellId, sourceTroop) => {
    const original = native.get(spellId)?.filter(s => /Splash/.test(s.Type)) ?? [];
    const expected = original.length ? original.map(ratioFromNative)
      : [...sourceTroop.stats.spell.desc.matchAll(/(?:(light|heavy)\s+)?splash/gi)]
        .map(m => m[1]?.toLowerCase() === 'light' ? 0.25 : m[1]?.toLowerCase() === 'heavy' ? 0.75 : 0.5);
    const prototype = SKILL_LIBRARY[spellId];
    expect(prototype).toBeDefined();
    const splash = flatten(prototype.segments).filter(s => s.kind === 'damage' && s.range === 'splash');
    expect(splash.length).toBeGreaterThan(0);
    const ratios = splash.map(s => s.kind === 'damage' ? s.splashRatio ?? 0.5 : 0);
    expect(unique(ratios)).toEqual(unique(expected));
    if (unique(expected).length > 1) expect(ratios).toEqual(expected); // Obsidius: heavy THEN light.
    if (original.length) expect(splash.every(s => s.kind === 'damage' && !!s.trueDamage === /^True/.test(original[0].Type))).toBe(true);
    const displayed = TROOPS.find(t => t.id === sourceTroop.id)!.spell.description;
    expect(unique(textKinds(displayed))).toEqual(unique(expected));
    expect(displayed).not.toMatch(/光轻度|轻量轻度|轻度轻度|重度重度/);
    expect(spellDescription(spellId, displayed)).toBe(displayed);
  });
  it('restores omitted splash text, fixes the enemy-side translation, and uses native Mechataur light damage', () => {
    const text = (id: number) => TROOPS.find(t => t.spell.id === id)!.spell.description;
    expect(text(8819)).toContain('真实溅射伤害');
    expect(text(8494)).toContain('真实重度溅射伤害');
    expect(text(8656)).toContain('2 名随机敌人');
    expect(text(8485)).toContain('轻度溅射伤害');
  });
});

