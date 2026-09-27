// Source-anchored branch repairs. Not full-entity signoff or latest-version certification.
// @ts-expect-error Node fixtures
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error Extracted native source parser
import { indexNativeSpells } from '../../scripts/lib/gow-native-source.mjs';
import { ExtensionRegistry } from '@engine/registry';
import { registerSkillLibrary } from '@engine/skills/library';
import { TurnEngine } from '@engine/TurnEngine';
import { executePrototype } from '@engine/skills/prototypes';
import { BaseColor, PlayerSide } from '@engine/types';
import { damageCharacter, damageFixture } from '../helpers/damageFixture';
import weapons from '../../src/data/weapons.json';
const native = indexNativeSpells(JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json', 'utf8')).spells);
const english = JSON.parse(fs.readFileSync('artifacts/gowhead-weapons/weapons.json', 'utf8')).weapons;
const registry = new ExtensionRegistry(); registerSkillLibrary(registry.prototypes);
function fixture(id: number, side: PlayerSide) {
  const f = damageFixture(); const w = weapons.find(w => w.spell.id === id)!;
  f.caster.skillId = `gw_${w.referenceName}`; f.caster.mana = f.caster.manaCost = w.manaCost;
  if (side === PlayerSide.Right) {
    f.state.teams.Left.characters = f.enemies; f.state.teams.Right.characters = [f.caster];
    f.state.activePlayer = side;
  }
  const engine = new TurnEngine(f.state, f.ctx.rng, f.ctx.nextGemId, registry); engine.skullChance = 0;
  engine.setTargetChooser({ choose: () => 11 });
  return { ...f, engine, cast: () => engine.castSkill(f.caster.id), proto: registry.prototypes.get(f.caster.skillId)! };
}
const source = (id: number) => english.find((w: { SpellId: number }) => w.SpellId === id).stats.spell.desc;
describe('7754 Boss branch, 7815 Yellow bonus, 9378 dispel (scoped)', () => {
  it('7754 native explicitly checks selected Boss type before armor steal and conditional Death Mark', () => {
    expect(source(7754)).toContain('If enemy is a Boss, Death Mark all other enemies.');
    expect(native.get(7754).raw.SpellSteps).toMatchObject([
      { Type: 'CountArmyType', Target: 'FromTarget', Data: 'boss' },
      { Type: 'StealArmor', Target: 'FromTarget', Amount: 10001 },
      { Type: 'CauseSpecificStatusEffectConditional', Target: 'AllEnemies', Data: 'deathmark', UseCounterForAmount: true },
    ]);
  });
  for (const side of [PlayerSide.Left, PlayerSide.Right]) for (const boss of [false, true])
    it(`7754 ${side} selected Boss=${boss}: steal selected armor and mark only others`, () => {
      const f = fixture(7754, side); f.enemies[1].armor = 21; f.caster.armor = 3;
      f.enemies[1].troopTypes = boss ? ['Boss'] : ['Knight'];
      f.enemies[3].troopTypes = ['Boss']; // Another Boss is not the condition's subject.
      f.cast(); expect(f.caster.armor).toBe(24); expect(f.enemies[1].armor).toBe(0);
      expect(f.enemies[1].statuses.some(s => s.id === 'death-mark')).toBe(false);
      for (const e of [f.enemies[0], f.enemies[2], f.enemies[3]])
        expect(e.statuses.some(s => s.id === 'death-mark')).toBe(boss);
    });
  it('7754 has no extra target if the selected Boss is the sole survivor', () => {
    const f = fixture(7754, PlayerSide.Left); f.enemies[1].troopTypes = ['Boss'];
    for (const e of [f.enemies[0], f.enemies[2], f.enemies[3]]) { e.defeated = true; e.hp = 0; }
    const ev = f.cast(); expect(ev.filter(e => e.type === 'status-apply')).toEqual([]);
  });
  it('7815 native represents base hit, Yellow bonus and Divine bonus as ordered damage steps', () => {
    expect(source(7815)).toContain('If they use Yellow Mana, deal 10 more.');
    expect(native.get(7815).raw.SpellSteps).toMatchObject([
      { Type: 'CountManaCost', Target: 'FromTarget' },
      { Type: 'Damage', Amount: 4, SpellPowerMultiplier: 1, UseCounterForAmount: true },
      { Type: 'Damage', StatusModifier: 'AddForYellowTarget', StatusAmount: 10 },
      { Type: 'Damage', StatusModifier: 'AddForDivine', StatusAmount: 10 },
    ]);
  });
  for (const side of [PlayerSide.Left, PlayerSide.Right]) for (const yellow of [false, true]) for (const divine of [false, true])
    it(`7815 ${side} Yellow=${yellow} Divine=${divine}: independently stack both native bonuses`, () => {
      const f = fixture(7815, side); const target = f.enemies[1];
      target.colors = yellow ? [BaseColor.Yellow] : [BaseColor.Red]; target.troopTypes = divine ? ['Divine'] : ['Human'];
      target.manaCost = 17; target.armor = 7;
      const ev = f.cast(); const amounts = [32, ...(yellow ? [10] : []), ...(divine ? [10] : [])];
      expect(ev.filter(e => e.type === 'skill-damage').map(e => e.type === 'skill-damage' ? e.damage : 0)).toEqual(amounts);
      expect(target.armor).toBe(0); expect(target.hp).toBe(1000 - amounts.reduce((a, b) => a + b, 0) + 7);
      expect(f.enemies[0].hp).toBe(1000); expect(f.caster.mana).toBe(0);
    });
  it('7815 retains native separate-hit semantics when Barrier absorbs base damage', () => {
    const f = fixture(7815, PlayerSide.Left); const t = f.enemies[1];
    t.colors = [BaseColor.Yellow]; t.troopTypes = ['Divine']; t.statuses = [{ id: 'barrier', turns: 3 }];
    const ev = f.cast(); expect(t.hp).toBe(980);
    expect(ev.filter(e => e.type === 'skill-damage')).toHaveLength(2);
  });
  it('7815 does not retarget conditional bonus hits after base hit kills the chosen target', () => {
    const f = fixture(7815, PlayerSide.Left); const t = f.enemies[1];
    t.hp = 1; t.colors = [BaseColor.Yellow]; t.troopTypes = ['Divine'];
    const ev = f.cast(); expect(t.defeated).toBe(true); expect(f.enemies[0].hp).toBe(1000);
    expect(ev.filter(e => e.type === 'skill-damage')).toHaveLength(1);
  });
  it('9378 independently contains Dispel before CreateGems in native source', () => {
    expect(source(9378)).toMatch(/^Dispel all Enemies, and create 9 Burning Gems/);
    expect(native.get(9378).raw.SpellSteps).toMatchObject([
      { Type: 'CountArmyTroop', Data: '7571' }, { Type: 'CountMax', Amount: 5 },
      { Type: 'Dispel', Target: 'AllEnemies' }, { Type: 'CreateGems', Color1: 'Burning', Amount: 9 },
    ]);
  });
  for (const side of [PlayerSide.Left, PlayerSide.Right]) for (const present of [false, true])
    it(`9378 ${side} Immortal present=${present}: dispel positive statuses before creating 9 or 14 gems`, () => {
      const f = fixture(9378, side); const positives = ['barrier', 'blessed', 'enchanted', 'enraged', 'rage', 'reflect', 'submerged'];
      for (const e of f.enemies) e.statuses = [...positives, 'poison', 'disease'].map(id => ({ id, turns: 10, recoveryChance: 0 }));
      if (present) f.state.teams[side].characters.push(damageCharacter(1, { name: '\u6c38\u751f\u795e\u5929\u754c' }));
      const ev = f.cast();
      for (const e of f.enemies) {
        expect(e.statuses.some(s => positives.includes(s.id))).toBe(false);
        expect(e.statuses.map(s => s.id)).toEqual(expect.arrayContaining(['poison', 'disease']));
      }
      const count = ev.filter(e => e.type === 'gem-transform').flatMap(e => e.type === 'gem-transform' ? e.changes : [])
        .filter(c => c.to.kind === 'special' && c.to.spec.kind === 'burningGem').length;
      expect(count).toBe(present ? 14 : 9);
      expect(ev.findIndex(e => e.type === 'gem-transform')).toBeGreaterThan(ev.findIndex(e => e.type === 'status-expire'));
    });
  it('9378 prototype entry without board resolution emits the same dispel and creation order', () => {
    const f = fixture(9378, PlayerSide.Left);
    f.enemies[1].statuses = [{ id: 'barrier', turns: 3 }];
    const ev = executePrototype(f.proto, f.ctx);
    expect(ev[0]).toMatchObject({ type: 'status-expire', targetId: 11, statusId: 'barrier' });
    expect(ev.some(e => e.type === 'gem-transform')).toBe(true);
  });
});
