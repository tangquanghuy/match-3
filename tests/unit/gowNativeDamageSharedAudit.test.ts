/** Shared damage-kind gate: independent native snapshot vs final troop/weapon registrations.
 * Shape checks do not grant any of the 2,518 entities a whole-skill signoff. */
// @ts-expect-error Node fixture typings are absent from the browser build.
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SKILL_LIBRARY } from '@engine/skills/library';
import { collectWeaponCurated } from '@engine/skills/curated';
import { executePrototype, type EffectSegment, type SkillPrototype } from '@engine/skills/prototypes';
import { damageFixture } from '../helpers/damageFixture';
import weapons from '../../src/data/weapons.json';
import { TROOPS } from '../../src/data/troops';
import rules from '../../src/data/gowDamageRules.json';

const spells = JSON.parse(fs.readFileSync(new URL('../../data/raw/spells.gow.en.json', import.meta.url), 'utf8')).spells as
  { Id: number; data?: string; RawData?: string }[];
const raw = new Map(spells.filter(s => s.data || s.RawData).map(s => [s.Id, JSON.parse(s.RawData ?? s.data!) as
  { SpellSteps: { Type: string }[] }]));
const installed = new Set([...TROOPS.map(t => t.spell.id), ...weapons.map(w => w.spell.id)]);
const nativeTiers: Record<string, number> = {
  SplashDamage: .25, SplashHighDamage: .5, SplashHeavyDamage: .75,
  TrueSplashDamage: .25, TrueSplashHighDamage: .5, TrueSplashHeavyDamage: .75,
};
const candidates = [...raw].filter(([id, spell]) => installed.has(id) && spell.SpellSteps.some(s =>
  Object.hasOwn(nativeTiers, s.Type) || s.Type === 'ScatterDamage' || s.Type === 'TrueScatterDamage'));
const flatten = (segments: EffectSegment[]): EffectSegment[] => segments.flatMap(s =>
  s.kind === 'choose' || s.kind === 'oneOf' ? s.options.flatMap(flatten) : [s]);
const registered: Record<number, SkillPrototype> = { ...SKILL_LIBRARY, ...Object.fromEntries(collectWeaponCurated().byId) };

describe('GoW native damage kinds: shared rule cross-check (not full skill acceptance)', () => {
  it('indexes every installed snapshot spell with native splash or scatter steps', () => {
    expect(candidates).toHaveLength(203);
    for (const [id, native] of candidates) {
      const segment = flatten(registered[id]?.segments ?? []).filter(s => s.kind === 'damage');
      const expectedTiers = [...new Set(native.SpellSteps.filter(s => Object.hasOwn(nativeTiers, s.Type)).map(s => nativeTiers[s.Type]))];
      const actualTiers = [...new Set(segment.filter(s => s.range === 'splash').map(s => s.splashRatio ?? .5))];
      expect(actualTiers.sort(), `spell ${id}: native splash tiers`).toEqual(expectedTiers.sort());
      expect(segment.some(s => s.range === 'scatter'), `spell ${id}: native scatter`).toBe(
        native.SpellSteps.some(s => s.Type === 'ScatterDamage' || s.Type === 'TrueScatterDamage'));
      const correction = (rules as Record<string, { splash?: number[]; scatter?: boolean }>)[String(id)] as { splash?: number[]; scatter?: boolean } | undefined;
      if (expectedTiers.length) {
        expect(correction?.splash, `spell ${id}: correction ledger tiers`).toEqual(native.SpellSteps
          .filter(s => Object.hasOwn(nativeTiers, s.Type)).map(s => nativeTiers[s.Type]));
      }
    }
  });
  it('weapon 8521 keeps heavy splash rather than normal, and light splash is 25%', () => {
    for (const [id, base, ratio] of [[8521, 3, .75], [8999, 3, .25], [9383, 3, .25]] as const) {
      const proto = registered[id];
      const { ctx, caster, enemies } = damageFixture();
      caster.magic = 11;
      // Weapon 9383 has an optional reposition condition; the fixture lacks that ally.
      executePrototype(proto, ctx);
      const expected = (id === 9383 ? 2 : 1) * caster.magic + base;
      expect(1000 - enemies[1].hp, `spell ${id} centre`).toBe(expected);
      expect(1000 - enemies[0].hp, `spell ${id} neighbour`).toBe(Math.floor(expected * ratio));
      expect(1000 - enemies[2].hp, `spell ${id} neighbour`).toBe(Math.floor(expected * ratio));
    }
  });
  it('weapon 8702 distributes one scatter pool and 8703 centres one splash, not first+last double hits', () => {
    const scatter = damageFixture();
    executePrototype(registered[8702], scatter.ctx);
    expect(scatter.enemies.reduce((n, enemy) => n + 1000 - enemy.hp, 0)).toBe(38); // 2×11+16
    const splash = damageFixture();
    executePrototype(registered[8703], splash.ctx);
    expect(splash.enemies.map(e => 1000 - e.hp)).toEqual([9, 19, 9, 0]); // 11+8, 50% floored
  });
});
