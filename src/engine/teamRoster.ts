import type { GameState } from './GameState';
import type { GameEvent, SummonEvent } from './events';
import { PlayerSide } from './types';
import type { QueuedSummon, Team } from './types';

export const MAX_ACTIVE_TEAM_SIZE = 4;

/** Lazily create the FIFO summon queue so legacy Team literals remain valid. */
export function summonQueueOf(team: Team): QueuedSummon[] {
  if (!team.summonQueue) team.summonQueue = [];
  return team.summonQueue;
}

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
 * Remove defeated active characters and promote queued summons FIFO to the bottom.
 * Promotion events are inserted immediately after their corresponding defeat event.
 */
export function resolveDefeatEvents(state: GameState, produced: readonly GameEvent[]): GameEvent[] {
  const resolved: GameEvent[] = [];
  for (const event of produced) {
    resolved.push(event);
    if (event.type !== 'defeat') continue;

    const found = findActiveCharacter(state, event.characterId);
    if (!found) continue;
    found.team.characters.splice(found.index, 1);

    const queued = summonQueueOf(found.team).shift();
    if (!queued) continue;

    queued.character.defeated = false;
    found.team.characters.push(queued.character);
    const promotion: SummonEvent = {
      type: 'summon',
      player: found.side,
      slot: found.team.characters.length - 1,
      troopId: queued.troopId,
      characterId: queued.character.id,
      destination: 'field',
      fromQueue: true,
    };
    resolved.push(promotion);
  }
  return resolved;
}
