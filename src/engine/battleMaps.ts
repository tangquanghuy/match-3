import type { GameState } from './GameState';

/** Shared by engine collection and authoritative settlement; inventory is not capped. */
export const BATTLE_MAP_LIMIT = 2;

export function clampBattleMaps(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(BATTLE_MAP_LIMIT, Math.max(0, Math.floor(value))) : 0;
}

/** Only actual grants produce events and count toward map-scaled skills. */
export function creditBattleMaps(state: Pick<GameState, 'economy'>, amount: number): number {
  const before = clampBattleMaps(state.economy.maps);
  const added = Math.min(clampBattleMaps(amount), BATTLE_MAP_LIMIT - before);
  state.economy.maps = before + added;
  return added;
}
