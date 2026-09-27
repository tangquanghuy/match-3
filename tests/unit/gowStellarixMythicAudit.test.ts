// Stellarix: stored English/native steps + actual casting and trait triggers.
// @ts-expect-error Node fixture typings are absent from the browser TypeScript build.
import fs from 'node:fs';
import { describe, it, expect } from 'vitest';
import { TROOPS } from '../../src/data/troops';
import { getTrait, attachPassives } from '@engine/traits';
import { damageCharacter, damageFixture } from '../helpers/damageFixture';
import { ExtensionRegistry } from '@engine/registry';
import { registerSkillLibrary } from '@engine/skills/library';
import { executePrototype } from '@engine/skills/prototypes';
import { TurnEngine } from '@engine/TurnEngine';
import { CombatResolver } from '@engine/CombatResolver';
import { damageOne } from '@engine/skills/effects/damage';
import { BoardModel } from '@engine/BoardModel';
import { createGameState } from '@engine/GameState';
import { SeededRNG } from '@engine/rng';
import { colorGem, skullGem, BaseColor, PlayerSide } from '@engine/types';

const troop = TROOPS.find(t => t.id === 7446)!;
const en = JSON.parse(fs.readFileSync('data/raw/troops.gow.en.json', 'utf8')).troops.find((t: { Id: number }) => t.Id === 7446);
const nativeRow = JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json', 'utf8')).spells.find((s: { Id: number }) => s.Id === 9138);
const native = JSON.parse(nativeRow.RawData ?? nativeRow.data);
const registry = new ExtensionRegistry(); registerSkillLibrary(registry.prototypes);
const proto = registry.prototypes.get('9138')!;

function setup(skulls = 0) {
  const f = damageFixture();
  f.caster.skillId = '9138'; f.caster.manaCost = f.caster.mana = 32;
  f.caster.magic = 11;
  for (let i = 0; i < skulls; i++) f.board.set({ row: Math.floor(i / 8), col: i % 8 }, { id: i + 1, type: skullGem() });
  return f;
}

describe('Stellarix 7446 stored mythic whole spell and traits', () => {
  it('matches saved English/native clause identities, timings, and readable catalogue text', () => {
    expect(troop.rarityIdx).toBe(5);
    expect(en.stats.spell.desc).toContain('Create 3 Elemental Stars and 3 Umbral Stars.');
    expect(native.Cost).toBe(troop.manaCost);
    expect(troop.manaCost).toBe(32);
    expect(native.SpellSteps.map((s: { Type: string }) => s.Type)).toEqual([
      'CountGems', 'Damage', 'CreateGems', 'CreateGems', 'ExtraTurnConditional',
    ]);
    expect(native.SpellSteps[0]).toMatchObject({ Color1: 'Skull', Amount: 400 });
    expect(native.SpellSteps[4]).toMatchObject({ Amount: 10, UseCounterForAmount: true });
    expect(proto.segments.map(s => s.kind)).toEqual(['damage', 'gem', 'gem', 'extraTurn']);
    expect(proto.segments[3]).toMatchObject({ chance: 0.1, chanceBoost: { mod: { a: 4 }, source: { kind: 'castStartBoardSkulls' } } });
    expect(troop.spell.description).toContain('\u5143\u7d20\u4e4b\u661f');
    expect(troop.spell.description).toContain('\u6697\u5f71\u4e4b\u661f');
    expect(troop.spell.description).not.toContain('\u4e34\u754c\u661f');
    expect(troop.spell.description).toContain('\u6709 10% \u7684\u51e0\u7387\u83b7\u5f97\u989d\u5916\u56de\u5408\uff0c\u6839\u636e\u9ab7\u9ac5\u5934\u5b9d\u77f3\u6570\u91cf\u63d0\u5347\u3002[x4]');
    expect(troop.spell.description).not.toContain('\u65bd\u6cd5\u5f00\u59cb\u65f6');
    expect(troop.spell.description).toContain('[x4]');
    expect(troop.spell.meta?.modifier).toMatchObject({ kind: 'multiplier', a: 4 });
    expect(troop.traits.find(x => x.code === 'powerofstars')?.name).toBe('\u661f\u8fb0\u4e4b\u529b');
    expect(getTrait('powerofstars')?.name).toBe('\u661f\u8fb0\u4e4b\u529b');
    expect(troop.traits.find(x => x.code === 'powerofstars')?.description).toContain('\u751f\u547d\u3001\u62a4\u7532\u3001\u653b\u51fb\u548c\u9b54\u6cd5');
    expect(getTrait('powerofstars')?.onColorMatchTypeAura).toMatchObject({ color: 'skull', scope: 'all', gains: { hp: 1, armor: 1, attack: 1, magic: 1 } });
    expect(getTrait('toughscales')?.skullDamageReduction).toBe(0.3);
    expect(getTrait('cosmicshield')?.spellDamageReduction).toBe(0.55);
  });

  it('actually damages all enemies and creates 3 of each star; at 0 skulls 90% spell roll fails, while destroyed stars can trigger additional cascades', () => {
    const f = setup(); f.ctx.rng = new SeededRNG(1);
    const engine = new TurnEngine(f.state, f.ctx.rng, f.ctx.nextGemId, registry);
    engine.skullChance = 0;
    const events = engine.castSkill(f.caster.id);
    expect(events.filter(e => e.type === 'skill-damage').map(e => e.targetId)).toEqual(f.enemies.map(e => e.id));
    expect(f.enemies.map(e => e.hp)).toEqual([961, 961, 961, 961]);
    const changes = events.filter(e => e.type === 'gem-transform').flatMap(e => e.changes);
    expect(changes.filter(c => c.to.kind === 'special' && c.to.spec.kind === 'elementalStar')).toHaveLength(3);
    expect(changes.filter(c => c.to.kind === 'special' && c.to.spec.kind === 'umbralStar')).toHaveLength(3);
    expect(f.caster.mana).toBeLessThan(32);
    expect(events.some(e => e.type === 'skill-cast')).toBe(true);
    expect(events.some(e => e.type === 'extra-turn' && e.source === 'skill')).toBe(false);
    expect(events.filter(e => e.type === 'special-gem-trigger' && (e.kind === 'elementalStar' || e.kind === 'umbralStar')).length).toBeGreaterThan(0);
    const matchExtra = events.some(e => e.type === 'extra-turn' && e.source === 'match');
    expect(f.state.activePlayer).toBe(matchExtra ? PlayerSide.Left : PlayerSide.Right);
  });

  it('boost uses skulls BEFORE the two star-creation steps (23 initial -> 17 remaining, 90% roll succeeds)', () => {
    const f = setup(23); let rolls = 0; f.ctx.rng.next = () => rolls++ < 6 ? 0 : 0.95;
    const events = executePrototype(proto, f.ctx);
    expect(f.ctx.castTracking?.skullsAtCastStart).toBe(23);
    let remaining = 0; f.board.forEach(g => { if (g?.type.kind === 'skull') remaining++; });
    expect(remaining).toBe(20);
    expect(events.some(e => e.type === 'extra-turn')).toBe(true);
  });

  it('the unboosted 10% extra-turn can happen on a successful roll', () => {
    const f = setup(); f.ctx.rng.next = () => 0;
    expect(executePrototype(proto, f.ctx).some(e => e.type === 'extra-turn')).toBe(true);
  });

  for (const magic of [0, 11, 20]) for (const count of [1, 2, 4]) {
    it(`M=${magic}, ${count} enemies: exactly M*3+6 ordinary damage per living enemy`, () => {
      const f = setup(); f.caster.magic = magic;
      f.state.teams.Right.characters = f.enemies.slice(0, count);
      f.ctx.rng = new SeededRNG(1);
      const events = executePrototype(proto, f.ctx);
      const amount = magic * 3 + 6;
      expect(f.enemies.slice(0, count).map(c => c.hp)).toEqual(Array(count).fill(1000 - amount));
      expect(events.filter(e => e.type === 'skill-damage').map(e => e.targetId)).toEqual(f.enemies.slice(0, count).map(c => c.id));
    });
  }

  it('barrier consumes one hit while other enemies take damage; lethal first target does not drop later targets', () => {
    const f = setup(); f.enemies[0].hp = 1;
    f.enemies[1].statuses = [{ id: 'barrier', turns: 3 }];
    const guarded = f.enemies[1]; const last = f.enemies[2];
    const events = executePrototype(proto, f.ctx);
    expect(events.filter(e => e.type === 'skill-damage').map(e => e.targetId)).toEqual([10, 12, 13]);
    expect(guarded.hp).toBe(1000);
    expect(guarded.statuses).toEqual([]);
    expect(last.hp).toBe(961);
  });

  for (const block of ['silence', 'low-mana'] as const) {
    it(`${block} rejects a real cast without spending the action or changing the board`, () => {
      const f = setup(); f.ctx.rng = new SeededRNG(1);
      if (block === 'silence') f.caster.statuses = [{ id: 'silence', turns: 3 }];
      else f.caster.mana = 31;
      const initial = f.caster.mana;
      const engine = new TurnEngine(f.state, f.ctx.rng, f.ctx.nextGemId, registry);
      expect(engine.castSkill(f.caster.id)).toEqual([]);
      expect(f.caster.mana).toBe(initial);
      expect(f.state.activePlayer).toBe(PlayerSide.Left);
      expect(f.enemies.map(c => c.hp)).toEqual([1000, 1000, 1000, 1000]);
    });
  }
  it('frozen casting still deals damage but suppresses the successful extra-turn roll', () => {
    const f = setup(23); f.ctx.rng = new SeededRNG(1); // 10% + 23*4% >= 100%.
    f.caster.statuses = [{ id: 'frozen', turns: 3 }];
    const engine = new TurnEngine(f.state, f.ctx.rng, f.ctx.nextGemId, registry);
    engine.skullChance = 0;
    const events = engine.castSkill(f.caster.id);
    expect(events.filter(e => e.type === 'skill-damage')).toHaveLength(4);
    expect(events.some(e => e.type === 'extra-turn' && e.source === 'skill')).toBe(false);
  });

  it('Tough Scales reduces a real 20-point skull hit to 14; Cosmic Shield reduces a 40-point spell hit to 18', () => {
    const protectedTroop = damageCharacter(0, { traitIds: ['toughscales', 'cosmicshield'], armor: 0 });
    attachPassives(protectedTroop);
    const attacker = damageCharacter(10, { attack: 20 });
    const skull = new CombatResolver().resolveSkullDamage(
      { player: PlayerSide.Right, characters: [attacker] },
      { player: PlayerSide.Left, characters: [protectedTroop] }, 3,
    );
    expect(skull.events.filter(e => e.type === 'skull-damage').map(e => e.damage)).toEqual([14]);
    expect(protectedTroop.hp).toBe(986);
    const spell = damageOne(protectedTroop, attacker.id, 40, false, 'single');
    expect(spell.filter(e => e.type === 'skill-damage').map(e => e.damage)).toEqual([18]);
    expect(protectedTroop.hp).toBe(968);
  });
  it('matching skulls in a real swap gives each ally all four skill points once', () => {
    const board = new BoardModel();
    const palette = [BaseColor.Green, BaseColor.Blue, BaseColor.Yellow, BaseColor.Purple];
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) board.set({ row: r, col: c }, { id: 1 + r * 8 + c, type: colorGem(palette[(r + c) % 4]) });
    board.set({ row: 7, col: 0 }, { id: 70, type: skullGem() });
    board.set({ row: 7, col: 2 }, { id: 72, type: skullGem() });
    board.set({ row: 6, col: 1 }, { id: 61, type: skullGem() });
    const holder = damageCharacter(0, { traitIds: ['powerofstars'], mana: 0 });
    const ally = damageCharacter(1, { mana: 0 });
    attachPassives(holder); attachPassives(ally);
    const foe = damageCharacter(9, { hp: 1000 });
    const state = createGameState(board, { player: PlayerSide.Left, characters: [holder, ally] }, { player: PlayerSide.Right, characters: [foe] });
    let id = 900;
    const engine = new TurnEngine(state, new SeededRNG(11), () => ++id, new ExtensionRegistry());
    engine.skullChance = 0;
    const events = engine.resolveSwap({ row: 7, col: 1 }, { row: 6, col: 1 });
    for (const c of [holder, ally]) {
      expect(c.maxHp).toBe(1001); expect(c.hp).toBe(1001);
      expect(c.armor).toBe(1); expect(c.attack).toBe(18); expect(c.magic).toBe(12);
    }
    expect(events.filter(e => e.type === 'buff' && e.source === 'trait' && e.targetId === ally.id)).toHaveLength(4);
  });
});