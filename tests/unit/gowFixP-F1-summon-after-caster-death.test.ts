// P-F1-summon-after-caster-death: Sunbird (troop:6387, spell 7542) native
// Damage@Self 1, Damage@Self 10000, SummoningNoError 6387 = the caster really dies and a fresh
// Sunbird is summoned onto the caster's side. The summon must still resolve the caster side
// after the caster left the roster in the same cast.
import { describe, it, expect } from 'vitest';
import { BoardModel } from '@engine/BoardModel';
import { createGameState } from '@engine/GameState';
import { SeededRNG } from '@engine/rng';
import { ExtensionRegistry } from '@engine/registry';
import { registerSkillLibrary } from '@engine/skills/library';
import { TurnEngine } from '@engine/TurnEngine';
import { FixedTargetChooser } from '@engine/skills/targetChooser';
import { BaseColor, PlayerSide, colorGem } from '@engine/types';
import type { SkillPrototype } from '@engine/skills/prototypes';
import { dmg, summonRef } from '@engine/skills/builders';
import { damageCharacter } from '../helpers/damageFixture';
import { troopToSummonTemplate } from '../../src/data/troops';

const registry = new ExtensionRegistry();
registerSkillLibrary(registry.prototypes);

function setup(spellId: string, allies = 1) {
  const board = new BoardModel(); let id = 1;
  const cols = [BaseColor.Blue, BaseColor.Yellow, BaseColor.Purple, BaseColor.Brown];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) board.set({ row: r, col: c }, { id: id++, type: colorGem(cols[(r + c) % 4]) });
  const caster = damageCharacter(0, { skillId: spellId, mana: 12, manaCost: 12, magic: 10 });
  const mates = Array.from({ length: allies - 1 }, (_, i) => damageCharacter(1 + i, {}));
  const foes = [0, 1, 2, 3].map(i => damageCharacter(10 + i, { mana: 0 }));
  const state = createGameState(board, { player: PlayerSide.Left, characters: [caster, ...mates] }, { player: PlayerSide.Right, characters: foes });
  let gid = 5000;
  const engine = new TurnEngine(state, new SeededRNG(42), () => gid++, registry);
  engine.skullChance = 0;
  engine.setSummonResolver(ref => troopToSummonTemplate(ref));
  engine.setTargetChooser(new FixedTargetChooser(11));
  return { state, caster, cast: () => engine.castSkill(0) };
}

describe('P-F1-summon-after-caster-death', () => {
  it('synthetic self-kill + summon: a fresh Sunbird lands on the caster side', () => {
    const proto = {
      id: 'test-sunbird', name: 'x', manaCost: 12,
      segments: [dmg('allySelf', 0, 0, { execute: true }), summonRef('Sunbird', 6387)],
    } as unknown as SkillPrototype;
    registry.prototypes.set('test-sunbird', proto);
    const f = setup('test-sunbird', 2);
    const ev = f.cast();
    expect(ev.some(e => e.type === 'defeat' && e.characterId === 0)).toBe(true);
    const summon = ev.find(e => e.type === 'summon');
    expect(summon && summon.type === 'summon' ? summon.player : null).toBe(PlayerSide.Left);
    const left = f.state.teams[PlayerSide.Left].characters;
    expect(left.some(c => c.id === 0)).toBe(false);
    const bird = left.find(c => c.name && c.id !== 1);
    expect(bird?.statuses).toEqual([]);
    expect(bird?.mana).toBe(0);
  });

  it('spell 7542 (Sunbird): native self-kill then SummoningNoError 6387', () => {
    const f = setup('7542', 2);
    const ev = f.cast();
    expect(ev.some(e => e.type === 'defeat' && e.characterId === 0)).toBe(true);
    const summon = ev.find(e => e.type === 'summon');
    expect(summon && summon.type === 'summon' ? [summon.player, summon.troopId] : null).toEqual([PlayerSide.Left, 6387]);
  });
});
