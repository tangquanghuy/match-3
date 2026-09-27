import type { GameState } from './GameState';
import type { GameEvent } from './events';
import { PlayerSide } from './types';
import type { Team } from './types';

export const MAX_ACTIVE_TEAM_SIZE = 4;

/** Find a character on the active field. Queued summons are intentionally excluded. */
function findActiveCharacter(state: GameState, characterId: number): {
  side: PlayerSide;
  team: Team;
  index: number;
} | null {
  for (const side of [PlayerSide.Left, PlayerSide.Right]) {
    const team = state.teams[side];
    const index = team.characters.findIndex((char) => char.id === characterId);
    if (index >= 0) return { side, team, index };
  }
  return null;
}

/**
 * Remove defeated (or fled) active characters. Survivors close ranks automatically;
 * later summons enter at the new team tail. A full four-unit team has no summon bench.
 */
export function resolveDefeatEvents(state: GameState, produced: readonly GameEvent[]): GameEvent[] {
  const resolved: GameEvent[] = [];
  for (const event of produced) {
    resolved.push(event);
    if (event.type !== 'defeat' && event.type !== 'flee') continue;
    const found = findActiveCharacter(state, event.characterId);
    if (!found) continue;
    found.team.characters.splice(found.index, 1);
  }
  return resolved;
}
