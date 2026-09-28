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

/** P-R5-summon-id-reuse: remember the ids of units about to leave a roster so they are never reused. */
export function noteRetiredCharIds(state: GameState, chars: readonly { id: number }[]): void {
  let hw = state.charIdHighWater ?? 0;
  for (const c of chars) if (c.id > hw) hw = c.id;
  if (hw > (state.charIdHighWater ?? 0)) state.charIdHighWater = hw;
}

/** Drop defeated entries from a team, recording their ids first (P-R5-summon-id-reuse). */
export function pruneDefeated(state: GameState, team: Team): void {
  noteRetiredCharIds(state, team.characters.filter((c) => c.defeated));
  team.characters = team.characters.filter((c) => !c.defeated);
}

/**
 * Next character id: max(living + queued ids, retired high-water) + 1 (P-R5-summon-id-reuse).
 * Monotonic, so a unit that died this cast keeps a unique id (castTracking.lastTarget / events stay unambiguous).
 */
export function allocateCharId(state: GameState): number {
  let max = state.charIdHighWater ?? 0;
  for (const side of [PlayerSide.Left, PlayerSide.Right]) {
    const team = state.teams[side];
    for (const c of team.characters) if (c.id > max) max = c.id;
    for (const q of team.summonQueue ?? []) if (q.character.id > max) max = q.character.id;
  }
  state.charIdHighWater = max + 1;
  return max + 1;
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
    noteRetiredCharIds(state, [found.team.characters[found.index]]);
    found.team.characters.splice(found.index, 1);
  }
  return resolved;
}
