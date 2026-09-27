// Atlanta 6085: independent stored English/native clauses, historical official guide, real-cast boundary tests.
// @ts-expect-error Node fixture typings are absent from the browser TypeScript build.
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ExtensionRegistry } from '@engine/registry';
import { registerSkillLibrary } from '@engine/skills/library';
import { TurnEngine } from '@engine/TurnEngine';
import { BaseColor, PlayerSide } from '@engine/types';
import { damageFixture } from '../helpers/damageFixture';
import { TROOPS } from '../../src/data/troops';
import { spellDescription } from '../../src/data/combatText';

const troop = TROOPS.find(t => t.id === 6085)!;
const english = JSON.parse(fs.readFileSync('data/raw/troops.gow.en.json', 'utf8')).troops.find((t: { Id: number }) => t.Id === 6085);
const nativeRow = JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json', 'utf8')).spells.find((s: { Id: number }) => s.Id === 7155);
const native = JSON.parse(nativeRow.RawData ?? nativeRow.data);
const guide = fs.readFileSync('artifacts/gow-skill-audit/gold-primary-sources/official-brian-guide.html', 'utf8');
const registry = new ExtensionRegistry(); registerSkillLibrary(registry.prototypes);
function setup(magic = 11, armor = 0, count = 4, side = PlayerSide.Left) {
  const f = damageFixture(0, 0, Array.from({ length: count }, () => ({ armor })));
  f.caster.skillId = '7155'; f.caster.manaCost = f.caster.mana = 12;
  f.caster.magic = magic; f.caster.colors = [BaseColor.Yellow, BaseColor.Purple];
  if (side === PlayerSide.Right) {
    f.state.teams.Left.characters = f.enemies;
    f.state.teams.Right.characters = [f.caster];
    f.state.activePlayer = side;
  }
  const engine = new TurnEngine(f.state, f.ctx.rng, f.ctx.nextGemId, registry);
  engine.skullChance = 0;
  return { ...f, cast: () => engine.castSkill(f.caster.id) };
}
describe('Atlanta 6085: stored snapshot whole-skill Rain of Arrows', () => {
  it('cross-checks English, sole native step, catalogue, final override and older official wording', () => {
    expect(english.SpellId).toBe(7155);
    expect(english.stats.spell.desc).toBe('Deal [Magic + 2] damage to all Enemies.');
    expect(native).toMatchObject({ Id: 7155, Cost: 12, Target: 'None', SpellSteps: [
      { Type: 'Damage', Target: 'AllEnemies', Amount: 2, SpellPowerMultiplier: 1, Primarypower: true },
    ] });
    expect(native.SpellSteps).toHaveLength(1);
    expect(troop.spell.id).toBe(7155);
    expect(troop.manaCost).toBe(12);
    expect(troop.manaColors).toEqual(['Yellow', 'Purple']);
    expect(registry.prototypes.get('7155')).toEqual({ segments: [
      { kind: 'damage', target: 'enemyAll', scaling: { base: 2, mult: 1 }, range: 'all' },
    ] });
    expect(spellDescription(7155, troop.spell.description)).toContain('所有敌人');
    const section = guide.slice(guide.indexOf('<h2>Atlanta</h2>'), guide.indexOf('<h2>Atlanta</h2>') + 6200);
    expect(section).toContain('Deal [2+Magic] damage to all enemies.');
    expect(section).toContain('(Cost:13'); // Historical version; native snapshot cost is 12.
  });
  for (const magic of [0, 1, 11, 20]) for (const armor of [0, 5, 30]) for (const count of [1, 2, 4]) {
    it(`M=${magic}, armor=${armor}, enemies=${count}: one ordinary Magic+2 hit per living enemy`, () => {
      const f = setup(magic, armor, count);
      const events = f.cast();
      const amount = magic + 2;
      expect(f.enemies.map(e => e.armor)).toEqual(Array(count).fill(Math.max(0, armor - amount)));
      expect(f.enemies.map(e => e.hp)).toEqual(Array(count).fill(1000 - Math.max(0, amount - armor)));
      expect(events.filter(e => e.type === 'skill-damage').map(e => e.targetId)).toEqual(f.enemies.map(e => e.id));
      expect(events.filter(e => e.type === 'skill-cast')).toHaveLength(1);
      expect(events.some(e => e.type === 'extra-turn' || e.type === 'status-apply' || e.type === 'gem-destroy')).toBe(false);
      expect(f.caster.mana).toBe(0);
      expect(f.state.activePlayer).toBe(PlayerSide.Right);
      expect(f.state.actionLog).toHaveLength(1);
    });
  }
  it('hits every initially alive enemy even if an earlier enemy dies', () => {
    const f = setup(); f.enemies[0].hp = 1;
    const events = f.cast();
    expect(f.state.teams.Right.characters.some(e => e.id === 10)).toBe(false);
    expect(f.state.teams.Right.characters.map(e => e.hp)).toEqual([987, 987, 987]);
    expect(events.filter(e => e.type === 'skill-damage').map(e => e.targetId)).toEqual([10, 11, 12, 13]);
  });
  it('a barrier absorbs its own hit, without shielding the other targets', () => {
    const f = setup(); f.enemies[1].statuses = [{ id: 'barrier', turns: 3 }];
    f.cast();
    expect(f.enemies.map(e => e.hp)).toEqual([987, 1000, 987, 987]);
    expect(f.enemies[1].statuses).toEqual([]);
  });
  it('web removes the magic bonus while retaining the native +2', () => {
    const f = setup(); f.caster.statuses = [{ id: 'web', turns: 3 }];
    f.cast(); expect(f.enemies.map(e => e.hp)).toEqual([998, 998, 998, 998]);
  });
  it('right-side real cast spends mana and its turn', () => {
    const f = setup(11, 0, 4, PlayerSide.Right);
    const events = f.cast();
    expect(f.enemies.map(e => e.hp)).toEqual([987, 987, 987, 987]);
    expect(f.caster.mana).toBe(0);
    expect(f.state.activePlayer).toBe(PlayerSide.Left);
    expect(events.some(e => e.type === 'extra-turn')).toBe(false);
  });
  for (const mode of ['silence', 'low-mana'] as const) it(`${mode}: blocked cast spends neither turn nor mana`, () => {
    const f = setup();
    if (mode === 'silence') f.caster.statuses = [{ id: 'silence', turns: 3 }]; else f.caster.mana = 11;
    expect(f.cast()).toEqual([]);
    expect(f.caster.mana).toBe(mode === 'silence' ? 12 : 11);
    expect(f.state.activePlayer).toBe(PlayerSide.Left);
    expect(f.enemies.map(e => e.hp)).toEqual([1000, 1000, 1000, 1000]);
  });
});


