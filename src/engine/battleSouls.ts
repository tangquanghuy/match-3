import type { GameState } from './GameState';
import { recordEconomyChange } from './battleEconomyLedger';
import type { EconomyAuditContext } from './battleEconomyLedger';
import { PlayerSide } from './types';

/** Only the in-battle pool is capped; settlement bonuses/kill rewards are separate. */
export const BATTLE_SOUL_BASE_CAP = 200;
/** Trait-enhanced cap; settlement bonuses are paid separately. */
export function battleSoulCap(state: GameState): number {
  return Math.floor(BATTLE_SOUL_BASE_CAP * (1 + (state.battleSoulGainRatio ?? 0)));
}
/** Actual souls credited during battle, retaining the native shared pool and upper clamp. */
export function creditBattleSouls(state: GameState, amount: number, context: EconomyAuditContext = { source: 'direct', side: PlayerSide.Left }): number {
  const before = state.economy.souls;
  const requested = Math.max(0, amount);
  const multiplier = 1 + (state.battleSoulGainRatio ?? 0);
  const cap = battleSoulCap(state);
  const after = Math.min(cap, before + Math.floor(requested * multiplier));
  recordEconomyChange(state, { ...context, currency: 'souls', account: 'shared', requested, before, after, multiplier, cap });
  state.economy.souls = after;
  return Math.max(0, after - before);
}
