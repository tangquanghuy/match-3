/** Side-owned battle Gold. economy.gold remains the Left reward API, not a shared pool. */
import type { GameState } from './GameState';
import { PlayerSide } from './types';
export function goldForSide(state: GameState, side: PlayerSide): number {
  return side === PlayerSide.Left ? state.economy.gold : state.enemyGold ?? 0;
}
export function setGoldForSide(state: GameState, side: PlayerSide, amount: number): void {
  const value = Math.max(0, amount);
  if (side === PlayerSide.Left) state.economy.gold = value;
  else state.enemyGold = value;
}
/** In-battle balance cap. Spending gold frees room to earn it again. */
export const BATTLE_GOLD_BASE_CAP = 500;
export function battleGoldMultiplier(state: GameState, side: PlayerSide): number {
  return 1 + (state.battleGoldGainRatios?.[side] ?? 0);
}
export function battleGoldCap(state: GameState, side: PlayerSide): number {
  return Math.floor(BATTLE_GOLD_BASE_CAP * battleGoldMultiplier(state, side));
}
export function remainingBattleGold(state: GameState, side: PlayerSide): number {
  return Math.max(0, battleGoldCap(state, side) - goldForSide(state, side));
}
/** Returns the amount actually credited, for truthful economy-gain events. */
export function creditGoldForSide(state: GameState, side: PlayerSide, amount: number): number {
  const gained = Math.min(Math.floor(Math.max(0, amount) * battleGoldMultiplier(state, side)), remainingBattleGold(state, side));
  if (gained > 0) setGoldForSide(state, side, goldForSide(state, side) + gained);
  return gained;
}
