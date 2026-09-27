// Source-snapshot anchored, narrow acceptance of two formerly skipped weapon clauses.
// @ts-expect-error Native files are test fixtures
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error Original-data source parser
import { indexNativeSpells } from '../../scripts/lib/gow-native-source.mjs';
import { registerSkillLibrary } from '@engine/skills/library';
import { ExtensionRegistry } from '@engine/registry';
import { TurnEngine } from '@engine/TurnEngine';
import { PlayerSide, BaseColor } from '@engine/types';
import { damageFixture } from '../helpers/damageFixture';
import weapons from '../../src/data/weapons.json';
import metadata from '../../src/data/weapon-skill-meta.json';
import { stormChangePlan } from '@render/StormIndicator';

const native = indexNativeSpells(JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json', 'utf8')).spells);
const english = JSON.parse(fs.readFileSync('artifacts/gowhead-weapons/weapons.json', 'utf8')).weapons;
const registry = new ExtensionRegistry();
registerSkillLibrary(registry.prototypes);
function fixture(id: number, side = PlayerSide.Left) {
  const f = damageFixture();
  const weapon = weapons.find(w => w.spell.id === id)!;
  f.caster.skillId = `gw_${weapon.referenceName}`;
  f.caster.manaCost = f.caster.mana = weapon.manaCost;
  if (side === PlayerSide.Right) {
    f.state.teams[PlayerSide.Right].characters = [f.caster];
    f.state.teams[PlayerSide.Left].characters = f.enemies;
    f.state.activePlayer = side;
  }
  const engine = new TurnEngine(f.state, f.ctx.rng, f.ctx.nextGemId, registry);
  engine.skullChance = 0;
  engine.setTargetChooser({ choose: () => 11 });
  return { ...f, weapon, engine, cast: () => engine.castSkill(f.caster.id) };
}

describe('weapon clauses 7755 and 8153, source and equipped cast', () => {
  it('anchors Hope\u2019s Crescent to native multiplier, English wording and equipped alias', () => {
    expect(english.find((w: { SpellId: number }) => w.SpellId === 7755).stats.spell.desc)
      .toContain("If the Enemy's Life is greater, deal triple damage.");
    expect(native.get(7755).raw).toMatchObject({ Cost: 15, Target: 'Enemy', SpellSteps: [
      { Type: 'DecreaseArmor', Target: 'FromTarget', Amount: 10001 },
      { Type: 'Damage', Target: 'FromTarget', SpellPowerMultiplier: 1, Amount: 5,
        StatusModifier: 'MultiplyForMoreLifeOnTarget', StatusAmount: 3 },
    ] });
    const f = fixture(7755);
    expect(f.weapon.manaColors).toEqual([BaseColor.Green, BaseColor.Red]);
    expect(registry.prototypes.get('7755')).toEqual(registry.prototypes.get(f.caster.skillId));
    expect(registry.prototypes.get('7755')?.segments).toMatchObject([
      { kind: 'reduce', target: 'enemyChosen', drainAll: true },
      { kind: 'damage', target: 'lastTarget', condMult: { times: 3,
        cond: { kind: 'targetStatBeatsCaster', stat: 'hp' } } },
    ]);
    expect(metadata['7755'].fidelity).toBe('full');
    expect(metadata['7755'].skippedClauses).toEqual([]);
  });
  for (const side of [PlayerSide.Left, PlayerSide.Right])
    for (const [enemyHp, expectedDamage] of [[501, 48], [500, 16], [499, 16]] as const)
      it(`7755 ${side} enemy HP=${enemyHp}: eliminate selected armor then damage at strict HP boundary`, () => {
        const f = fixture(7755, side);
        f.caster.hp = 500;
        f.enemies[0].armor = 37;
        f.enemies[1].armor = 23;
        f.enemies[1].hp = enemyHp;
        const ev = f.cast();
        expect(f.enemies[1].armor).toBe(0);
        expect(f.enemies[1].hp).toBe(enemyHp - expectedDamage);
        expect(f.enemies[0].armor).toBe(37);
        expect(f.enemies[0].hp).toBe(1000);
        expect(ev.filter(e => e.type === 'skill-damage')).toMatchObject([
          { targetId: 11, damage: expectedDamage },
        ]);
        expect(f.caster.mana).toBe(0);
      });
  it('7755 never casts if mana is below 15', () => {
    const f = fixture(7755);
    f.caster.mana = 14;
    f.enemies[1].armor = 23;
    expect(f.cast()).toEqual([]);
    expect(f.enemies[1].armor).toBe(23);
  });
  it('anchors Thunderbird to original RemoveStorm step and equipped aliases', () => {
    expect(english.find((w: { SpellId: number }) => w.SpellId === 8153).stats.spell.desc)
      .toContain('Then remove the Storm.');
    expect(native.get(8153).raw).toMatchObject({ Cost: 14, SpellSteps: [
      { Type: 'TrueDamage', Target: 'FromTarget', Amount: 4 },
      { Type: 'TrueDamage', Target: 'AllEnemies', StatusModifier: 'AddForAnyStorm', StatusAmount: 15 },
      { Type: 'RemoveStorm' },
    ] });
    const f = fixture(8153);
    expect(f.weapon.manaColors).toEqual([BaseColor.Yellow]);
    expect(registry.prototypes.get('8153')).toEqual(registry.prototypes.get(f.caster.skillId));
    expect(registry.prototypes.get('8153')?.segments.map(s => s.kind))
      .toEqual(['damage', 'damage', 'removeStorm']);
    expect(metadata['8153'].fidelity).toBe('full');
    expect(metadata['8153'].skippedClauses).toEqual([]);
  });
  for (const side of [PlayerSide.Left, PlayerSide.Right])
    for (const stormSide of [null, PlayerSide.Left, PlayerSide.Right] as const)
      it(`8153 caster=${side}, storm=${stormSide}: damage branch then clears the global storm`, () => {
        const f = fixture(8153, side);
        f.enemies[1].armor = 30;
        if (stormSide) f.state.teams[stormSide].storm = { color: BaseColor.Blue, turns: 4, troopId: 15 };
        const ev = f.cast();
        const dmg = ev.filter(e => e.type === 'skill-damage');
        expect(dmg.map(e => e.type === 'skill-damage' ? [e.targetId, e.damage] : []))
          .toEqual(stormSide ? [[11, 15], [10, 15], [11, 15], [12, 15], [13, 15]] : [[11, 15]]);
        expect(f.enemies[1].armor).toBe(30);
        expect(f.enemies[1].hp).toBe(stormSide ? 970 : 985);
        expect(f.state.teams.Left.storm).toBeUndefined();
        expect(f.state.teams.Right.storm).toBeUndefined();
        const changes = ev.filter(e => e.type === 'storm-change');
        expect(changes).toEqual(stormSide ? [expect.objectContaining({
          type: 'storm-change', player: stormSide, color: null, reason: 'removed', prevColor: BaseColor.Blue,
        })] : []);
        if (changes.length) expect(ev.findIndex(e => e.type === 'storm-change'))
          .toBeGreaterThan(ev.length - 1 - [...ev].reverse().findIndex(e => e.type === 'skill-damage'));
        expect(f.caster.mana).toBe(0);
      });
});

// Terminal color=null must reach the existing presentation hide path.
describe('Thunderbird storm removal presentation', () => {
  for (const side of [PlayerSide.Left, PlayerSide.Right]) it('hides the removed storm for ' + side, () => {
    const f = fixture(8153, side);
    f.state.teams[side].storm = { color: BaseColor.Green, turns: 4, troopId: 15 };
    const change = f.cast().find(e => e.type === 'storm-change');
    expect(change?.type).toBe('storm-change');
    if (change?.type === 'storm-change') expect(stormChangePlan(change)).toMatchObject({ action: 'hide', player: side, color: null, reason: 'removed' });
  });
});
