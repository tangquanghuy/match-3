import { describe, it, expect } from 'vitest';
import { BoardModel } from '../../src/engine/BoardModel';
import { createGameState } from '../../src/engine/GameState';
import { SeededRNG } from '../../src/engine/rng';
import { BaseColor, PlayerSide } from '../../src/engine/types';
import type { Character } from '../../src/engine/types';
import { devourEffect } from '../../src/engine/skills/effects/devour';
import { transformTroopEffect } from '../../src/engine/skills/effects/summon';

function setup(blocked = false) {
  const make = (id: number): Character => ({id, name: 'C', maxHp: 30, hp: 30, armor: 0,
    attack: 10, magic: 10, colors: [BaseColor.Red], manaCost: 10, mana: 0, skillId: 'none', defeated: false, statuses: []});
  const caster = make(1), target = make(2);
  if (blocked) target.statuses.push({id: 'barrier', turns: 3});
  const state = createGameState(new BoardModel(), {player: PlayerSide.Left, characters: [caster]},
    {player: PlayerSide.Right, characters: [target]});
  return {caster, target, ctx: {state, casterId: 1, rng: new SeededRNG(42), nextGemId: () => 0}};
}
describe('authoritative narration metadata', () => {
  it('marks actual lethal devour, not a blocked attempt', () => {
    const x = setup(); const events = devourEffect({targets: [x.target], chance: 1}).apply(x.ctx);
    expect(events.find(e => e.type === 'skill-damage')).toMatchObject({devoured: true, resultingHp: 0});
    const y = setup(true); const blocked = devourEffect({targets: [y.target], chance: 1}).apply(y.ctx);
    expect(y.target.hp).toBe(30);
    expect(blocked.some(e => e.type === 'skill-damage' && e.devoured)).toBe(false);
  });
  it('records the caster side even when transforming the opposing side', () => {
    const x = setup(); const events = transformTroopEffect({targets: [x.target], copyOf: [x.caster]}).apply(x.ctx);
    expect(events[0]).toMatchObject({type: 'troop-transform', targetId: 2, sourceSide: PlayerSide.Left});
  });
});
