import { describe, expect, it } from 'vitest';
import { BoardModel } from '@engine/BoardModel';
import { createGameState } from '@engine/GameState';
import { TurnEngine } from '@engine/TurnEngine';
import { ExtensionRegistry } from '@engine/registry';
import { SeededRNG } from '@engine/rng';
import { BaseColor, PlayerSide } from '@engine/types';
import type { Character } from '@engine/types';
import { resolveModifierCount } from '@engine/skills/effects/secondary';

function char(id: number, hp = 30): Character {
  return { id, name: String(id), hp, maxHp: 30, armor: 0, magic: 0, attack: 1,
    manaCost: 2, mana: 2, colors: [BaseColor.Red], skillId: 'kill', statuses: [], defeated: false };
}
function fixture() {
  const caster = char(0), first = char(4, 1), second = char(5), ally = char(1);
  const state = createGameState(new BoardModel(),
    { player: PlayerSide.Left, characters: [caster, ally] },
    { player: PlayerSide.Right, characters: [first, second] });
  const rng = new SeededRNG(1);
  const registry = new ExtensionRegistry();
  registry.prototypes.set('kill', { segments: [{ kind: 'damage', target: 'enemyFront', scaling: { base: 10, mult: 0 } }] });
  const engine = new TurnEngine(state, rng, () => 100, registry);
  engine.skullChance = 0;
  return { caster, first, second, ally, state, rng, engine };
}

describe('native CountEnemyDeaths/CountAllyDeaths across battle actions', () => {
  it('keeps cast kills in the battle tally for the next action without re-counting on a pass', () => {
    const f = fixture();
    expect(f.engine.castSkill(f.caster.id).some(e => e.type === 'defeat' && e.characterId === f.first.id)).toBe(true);
    expect(f.state.battleDeaths).toEqual({ Left: 0, Right: 1 });
    f.engine.passTurn();
    expect(f.state.battleDeaths).toEqual({ Left: 0, Right: 1 });
    const ctx = { state: f.state, casterId: 0, rng: f.rng, nextGemId: () => 100 };
    expect(resolveModifierCount({ kind: 'countEnemyDeaths' }, ctx)).toBe(1);
    expect(resolveModifierCount({ kind: 'countAllyDeaths' }, ctx)).toBe(0);
    const enemyCtx = { ...ctx, casterId: 5 };
    expect(resolveModifierCount({ kind: 'countAllyDeaths' }, enemyCtx)).toBe(1);
  });

  it('includes previous actions and new deaths in the same cast, including side reversal', () => {
    const f = fixture();
    f.state.battleDeaths = { Left: 3, Right: 2 };
    const ctx = { state: f.state, casterId: 0, rng: f.rng, nextGemId: () => 100,
      castTracking: { destroyed: [], transformed: 0, drainedMana: 0, enemyDeaths: 2, allyDeaths: 1 } };
    expect(resolveModifierCount({ kind: 'countEnemyDeaths' }, ctx)).toBe(4);
    expect(resolveModifierCount({ kind: 'countAllyDeaths' }, ctx)).toBe(4);
    expect(resolveModifierCount({ kind: 'countEnemyDeaths' }, { ...ctx, casterId: 4 })).toBe(5);
  });

  it('counts damage-over-time deaths triggered by passTurn outside a spell', () => {
    const f = fixture();
    f.first.statuses.push({ id: 'burning', turns: 3, magnitude: 3, recoveryChance: 0 });
    f.engine.passTurn();
    expect(f.state.battleDeaths).toEqual({ Left: 0, Right: 1 });
    const ctx = { state: f.state, casterId: 0, rng: f.rng, nextGemId: () => 100 };
    expect(resolveModifierCount({ kind: 'countEnemyDeaths' }, ctx)).toBe(1);
  });
});