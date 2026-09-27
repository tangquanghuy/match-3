// Rhynax 6001: whole stored-snapshot spell review; the historical guide has an older flat-adjacent wording.
// @ts-expect-error Node fixture typings are absent from the browser TypeScript build.
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ExtensionRegistry } from '@engine/registry';
import { registerSkillLibrary } from '@engine/skills/library';
import { TurnEngine } from '@engine/TurnEngine';
import { FixedTargetChooser } from '@engine/skills/targetChooser';
import { BaseColor, PlayerSide } from '@engine/types';
import { damageFixture } from '../helpers/damageFixture';
import { TROOPS } from '../../src/data/troops';
import { spellDescription } from '../../src/data/combatText';

const troop = TROOPS.find(t => t.id === 6001)!;
const english = JSON.parse(fs.readFileSync('data/raw/troops.gow.en.json', 'utf8')).troops.find((t: { id: number }) => t.id === 6001);
const nativeRow = JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json', 'utf8')).spells.find((s: { Id: number }) => s.Id === 7132);
const native = JSON.parse(nativeRow.RawData ?? nativeRow.data);
const guide = fs.readFileSync('artifacts/gow-skill-audit/gold-primary-sources/official-brian-guide.html', 'utf8');
const registry = new ExtensionRegistry(); registerSkillLibrary(registry.prototypes);
function setup(magic = 11, center = 11, side = PlayerSide.Left, armor = 0) {
  const fixture = damageFixture(0, 0, Array.from({ length: 4 }, () => ({ armor })));
  fixture.caster.skillId = '7132';
  fixture.caster.manaCost = fixture.caster.mana = 10;
  fixture.caster.colors = [BaseColor.Green, BaseColor.Brown];
  fixture.caster.magic = magic;
  if (side === PlayerSide.Right) {
    fixture.state.teams.Left.characters = fixture.enemies;
    fixture.state.teams.Right.characters = [fixture.caster];
    fixture.state.activePlayer = side;
  }
  const engine = new TurnEngine(fixture.state, fixture.ctx.rng, fixture.ctx.nextGemId, registry);
  engine.skullChance = 0;
  engine.setTargetChooser(new FixedTargetChooser(10 + center));
  return { ...fixture, cast: () => engine.castSkill(fixture.caster.id) };
}

describe('Rhynax / troop 6001: one chosen normal-splash wave, full stored-snapshot review', () => {
  it('checks the independent English clause, original step, entity binding, localized text and versioned historical guide', () => {
    expect(english.Id).toBe(6001);
    expect(english.SpellId).toBe(7132);
    expect(english.stats.spell.desc).toBe('Deal [Magic + 2] splash damage to an Enemy.');
    expect(native).toMatchObject({ Id: 7132, Cost: 10, Target: 'Enemy', SpellSteps: [
      { Type: 'SplashHighDamage', Target: 'FromTarget', Amount: 2, SpellPowerMultiplier: 1, Primarypower: true },
    ] });
    expect(native.SpellSteps).toHaveLength(1);
    expect(troop.spell.id).toBe(7132);
    expect(troop.manaCost).toBe(10);
    expect(troop.manaColors).toEqual(['Green', 'Brown']);
    expect(registry.prototypes.get('7132')).toEqual({ segments: [
      { kind: 'damage', target: 'enemyChosen', scaling: { base: 2, mult: 1 }, range: 'splash', splashRatio: .5 },
    ] });
    expect(spellDescription(7132, troop.spell.description)).toContain('溅射伤害');
    const section = guide.slice(guide.indexOf('<h2>Rhynax</h2>'), guide.indexOf('<h2>Rhynax</h2>') + 4200);
    expect(section).toContain('(Cost:10');
    expect(section).toContain('Green</font><font color="brown">Brown');
    expect(section).toContain('1 damage to adjacent enemies'); // Older guide wording, NOT evidence for modern fractional amount.
  });
  for (const magic of [0, 1, 11, 20]) for (const armor of [0, 10]) for (const pos of [0, 1, 2, 3]) {
    it(`M=${magic}, armour=${armor}, chosen slot=${pos}: only living adjacent slots receive floor(half)`, () => {
      const f = setup(magic, pos, PlayerSide.Left, armor);
      const events = f.cast();
      const amount = magic + 2;
      const dealt = f.enemies.map((_, i) => i === pos ? amount : Math.abs(i - pos) === 1 ? Math.floor(amount / 2) : 0);
      expect(f.enemies.map(e => 1000 - e.hp)).toEqual(dealt.map(v => Math.max(0, v - armor)));
      expect(f.enemies.map(e => e.armor)).toEqual(dealt.map(v => Math.max(0, armor - v)));
      expect(events.filter(e => e.type === 'skill-damage').map(e => e.targetId)).toEqual(
        [pos, pos - 1, pos + 1].filter(i => i >= 0 && i < 4 && dealt[i] > 0).map(i => i + 10));
      expect(events.filter(e => e.type === 'skill-cast')).toHaveLength(1);
      expect(events.some(e => e.type === 'extra-turn' || e.type === 'gem-destroy' || e.type === 'status-apply')).toBe(false);
      expect(f.caster.mana).toBe(0);
      expect(f.state.actionLog).toHaveLength(1);
      expect(f.state.activePlayer).toBe(PlayerSide.Right);
    });
  }
  it('primary death still resolves the two adjacent hits; no extra damage to a fourth enemy', () => {
    const f = setup(11, 1);
    f.enemies[1].hp = 1;
    f.cast();
    expect(f.enemies.map(e => e.hp)).toEqual([994, 994, 1000]); // Defeated target leaves the formation.
  });
  it('barrier on the primary absorbs only its own hit', () => {
    const f = setup(11, 1);
    f.enemies[1].statuses = [{ id: 'barrier', turns: 3 }];
    const events = f.cast();
    expect(f.enemies.map(e => e.hp)).toEqual([994, 1000, 994, 1000]);
    expect(f.enemies[1].statuses).toEqual([]);
    expect(events.filter(e => e.type === 'skill-damage').map(e => e.targetId)).toEqual([10, 12]);
  });
  it('works on the opposing active side, spends mana and the turn with no extra turn', () => {
    const f = setup(11, 2, PlayerSide.Right);
    const events = f.cast();
    expect(f.enemies.map(e => e.hp)).toEqual([1000, 994, 987, 994]);
    expect(f.caster.mana).toBe(0);
    expect(f.state.activePlayer).toBe(PlayerSide.Left);
    expect(events.some(e => e.type === 'extra-turn')).toBe(false);
  });
  for (const mode of ['silence', 'low-mana'] as const) it(`${mode}: invalid cast leaves board, mana and turn intact`, () => {
    const f = setup();
    if (mode === 'silence') f.caster.statuses = [{ id: 'silence', turns: 3 }];
    else f.caster.mana = 9;
    expect(f.cast()).toEqual([]);
    expect(f.caster.mana).toBe(mode === 'silence' ? 10 : 9);
    expect(f.state.activePlayer).toBe(PlayerSide.Left);
    expect(f.state.actionLog).toHaveLength(0);
    expect(f.enemies.every(e => e.hp === 1000)).toBe(true);
  });
  it('web suppresses Magic while retaining the native +2 base damage', () => {
    const f = setup(11, 1);
    f.caster.statuses = [{ id: 'web', turns: 3 }];
    f.cast();
    expect(f.enemies.map(e => e.hp)).toEqual([999, 998, 999, 1000]);
  });
});



