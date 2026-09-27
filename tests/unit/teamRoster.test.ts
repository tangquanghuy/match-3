import { describe, expect, it } from 'vitest';
import { BoardModel } from '@engine/BoardModel';
import { CombatResolver } from '@engine/CombatResolver';
import { createGameState } from '@engine/GameState';
import { resolveDefeatEvents } from '@engine/teamRoster';
import { BaseColor, PlayerSide } from '@engine/types';
import type { Character, Team } from '@engine/types';

function makeChar(id: number, defeated = false): Character {
  return {
    id,
    name: `C${id}`,
    maxHp: 20,
    hp: defeated ? 0 : 20,
    attack: 4,
    armor: 0,
    magic: 3,
    colors: [BaseColor.Red],
    manaCost: 8,
    mana: 0,
    skillId: 'none',
    statuses: [],
    defeated,
  };
}

function makeTeam(side: PlayerSide, ids: number[]): Team {
  return { player: side, characters: ids.map((id) => makeChar(id)) };
}

describe('official four-slot summon roster', () => {
  it('removes a defeated card and leaves the surviving troops to close ranks', () => {
    const left = makeTeam(PlayerSide.Left, [0, 1, 2, 3]);
    const state = createGameState(new BoardModel(), left, makeTeam(PlayerSide.Right, [20]));
    left.characters[1].defeated = true;

    const events = resolveDefeatEvents(state, [{ type: 'defeat', characterId: 1 }]);

    expect(left.characters.map((character) => character.id)).toEqual([0, 2, 3]);
    expect(events).toEqual([{ type: 'defeat', characterId: 1 }]);
  });

  it('closes ranks in order across consecutive defeats', () => {
    const left = makeTeam(PlayerSide.Left, [0, 1, 2, 3]);
    const state = createGameState(new BoardModel(), left, makeTeam(PlayerSide.Right, [20]));
    left.characters[0].defeated = true;
    left.characters[2].defeated = true;

    resolveDefeatEvents(state, [
      { type: 'defeat', characterId: 0 },
      { type: 'defeat', characterId: 2 },
    ]);

    expect(left.characters.map((character) => character.id)).toEqual([1, 3]);
  });

  it('counts a team with no active troops as wiped out even if legacy queue data exists', () => {
    const team: Team = {
      player: PlayerSide.Left,
      characters: [],
      summonQueue: [{ character: makeChar(10), troopId: 6010 }],
    };
    expect(CombatResolver.isWipedOut(team)).toBe(true);
  });
});
