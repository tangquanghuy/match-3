import { describe, expect, it } from 'vitest';
import { BoardModel } from '@engine/BoardModel';
import { createGameState } from '@engine/GameState';
import { SeededRNG } from '@engine/rng';
import { BaseColor, PlayerSide } from '@engine/types';
import type { Character, Team } from '@engine/types';
import type { EffectContext } from '@engine/skills/effects/context';
import { executePrototype } from '@engine/skills/prototypes';
import { skill, dmg, dmgAll, dmgSplash } from '@engine/skills/builders';
import { candidatesFor, selectTargets } from '@engine/skills/targeting';
import { isUntargetable } from '@engine/skills/effects/status';
import { attachPassives } from '@engine/traits';

// Source: official status help: Submerged avoids whole-team spell damage,
// including damage split randomly amongst all troops. It is not Stealthy.
function char(id: number, submerged = false): Character {
  return { id, name: `C${id}`, hp: 100, maxHp: 100, armor: 0, attack: 1,
    magic: 0, mana: 0, manaCost: 10, colors: [BaseColor.Red], skillId: 'fixture',
    statuses: submerged ? [{ id: 'submerged', turns: 3 }] : [], defeated: false };
}
function fixture(seed = 7, submergedIds = [4]) {
  const board = new BoardModel();
  const left: Team = { player: PlayerSide.Left, characters: [char(0)] };
  const right: Team = { player: PlayerSide.Right,
    characters: [4, 5, 6, 7].map(id => char(id, submergedIds.includes(id))) };
  const state = createGameState(board, left, right);
  const ctx: EffectContext = { state, casterId: 0, rng: new SeededRNG(seed), nextGemId: () => 1000 };
  const cast = (...segments: Parameters<typeof skill>) => executePrototype(skill(...segments), ctx);
  return { state, ctx, cast, enemies: right.characters };
}
const hits = (events: ReturnType<typeof executePrototype>) => events.filter(e => e.type === 'skill-damage');

describe('GoW official Submerged whole-team damage rule', () => {
  it('remains eligible for chosen, random and front single-target spells', () => {
    const f = fixture(7, [4, 5, 6, 7]);
    expect(isUntargetable(f.enemies[0])).toBe(false);
    expect(candidatesFor('enemyChosen', f.state, 0).map(c => c.id)).toEqual([4, 5, 6, 7]);
    expect(selectTargets('enemyFront', f.state, 0, f.ctx.rng).map(c => c.id)).toEqual([4]);
    f.ctx.chosenTargetId = 4;
    expect(hits(f.cast(dmg('enemyChosen', 10, 0))).map(e => e.targetId)).toEqual([4]);
    expect(f.enemies[0].hp).toBe(90);
  });
  it('whole-team spells skip only submerged defenders, with no barrier consumption or reflected hits', () => {
    const f = fixture(7, [4, 6]);
    f.enemies[0].statuses.push({ id: 'barrier', turns: 3 }, { id: 'reflect', turns: 3 });
    const events = f.cast(dmgAll(20, 0));
    expect(hits(events).map(e => [e.targetId, e.damage])).toEqual([[5, 20], [7, 20]]);
    expect(f.enemies.map(c => c.hp)).toEqual([100, 80, 100, 80]);
    expect(f.enemies[0].statuses.map(s => s.id)).toEqual(['submerged', 'barrier', 'reflect']);
    expect(f.state.teams[PlayerSide.Left].characters[0].hp).toBe(100);
  });
  it('random scatter consumes each assigned share but does not redistribute submerged shares', () => {
    const baseline = fixture(13, []);
    const sheltered = fixture(13, [5]);
    const segment = dmg('enemyAll', 48, 0, { range: 'scatter' });
    const before = hits(baseline.cast(segment));
    const after = hits(sheltered.cast(segment));
    expect(before.find(e => e.targetId === 5)?.damage).toBeGreaterThan(0);
    expect(after.find(e => e.targetId === 5)).toBeUndefined();
    expect(after).toEqual(before.filter(e => e.targetId !== 5));
    expect(sheltered.enemies[1].hp).toBe(100);
  });
  it('one-target, positional subset and splash are still permitted, even if their presentation range is all', () => {
    const f = fixture(7, [4, 5, 6]);
    const waves = f.cast(dmg('enemyRandomN', 9, 0, { range: 'all', randomWaves: 2, n: 2 }));
    expect(hits(waves)).toHaveLength(2);
    const below = f.cast(dmg('enemyFirstN', 8, 0, { n: 2 }));
    expect(hits(below).map(e => e.targetId)).toEqual([4, 5]);
    const splash = f.cast(dmgSplash('enemyChosen', 12, 0));
    expect(hits(splash)).toHaveLength(0); // no chosen target yet
    f.ctx.chosenTargetId = 5;
    expect(hits(f.cast(dmgSplash('enemyChosen', 12, 0))).map(e => e.targetId)).toEqual([5, 4, 6]);
  });
  it('Stealthy is independently unselectable; Submerged remains selectable in a mixed roster', () => {
    const f = fixture(7, [4]);
    f.enemies[1].traitIds = ['stealthy'];
    attachPassives(f.enemies[1]);
    expect(isUntargetable(f.enemies[1])).toBe(true);
    expect(candidatesFor('enemyChosen', f.state, 0).map(c => c.id)).toEqual([4, 6, 7]);
    expect(selectTargets('enemyChosen', f.state, 0, f.ctx.rng, 1, 4).map(c => c.id)).toEqual([4]);
  });
});
