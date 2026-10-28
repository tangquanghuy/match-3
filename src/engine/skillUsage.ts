import type {GameState} from './GameState';
import type {Character, PlayerSide} from './types';

/** An accepted cast belongs to one individual and one spell, regardless of allies using it. */
export function hasCharacterCastSkill(
 state:Pick<GameState, 'actionLog'>,
 side:PlayerSide,
 character:Pick<Character, 'id'|'skillId'>,
):boolean {
 return state.actionLog.some(entry=>entry.side===side && entry.skillId===character.skillId
  && entry.action.type==='cast' && entry.action.characterId===character.id);
}
