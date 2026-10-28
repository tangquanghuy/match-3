import type { GameState } from './GameState';
import { recordEconomyChange } from './battleEconomyLedger';
import type { EconomyAuditContext } from './battleEconomyLedger';
import { PlayerSide } from './types';

/** Shared by engine collection and authoritative settlement; inventory is not capped. */
export const BATTLE_MAP_LIMIT = 2;

export function clampBattleMaps(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(BATTLE_MAP_LIMIT, Math.max(0, Math.floor(value))) : 0;
}

type MapEconomyState = Pick<GameState, 'economy'> & Partial<Pick<GameState, 'economyAudit' | 'actionLog'>>;
/** Only actual grants produce events and count toward map-scaled skills. */
export function creditBattleMaps(state: MapEconomyState, amount: number, context: EconomyAuditContext = { source: 'direct', side: PlayerSide.Left }): number {
  const before = clampBattleMaps(state.economy.maps);
  const added = Math.min(clampBattleMaps(amount), BATTLE_MAP_LIMIT - before);
  const after = before + added;
  recordEconomyChange(state, { ...context, currency: 'maps', account: 'shared',
    requested: Number.isFinite(amount) ? Math.max(0, amount) : 0,
    before: state.economy.maps, after, cap: BATTLE_MAP_LIMIT });
  state.economy.maps = after;
  return added;
}
