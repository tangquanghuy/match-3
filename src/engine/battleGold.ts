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
export function creditGoldForSide(state: GameState, side: PlayerSide, amount: number): void {
  setGoldForSide(state, side, goldForSide(state, side) + amount);
}
