import type { GameState } from './GameState';

/** Only the in-battle pool is capped; settlement bonuses/kill rewards are separate. */
export const BATTLE_SOUL_BASE_CAP = 200;
/** Trait-enhanced cap; settlement bonuses are paid separately. */
export function battleSoulCap(state: GameState): number {
  return Math.floor(BATTLE_SOUL_BASE_CAP * (1 + (state.battleSoulGainRatio ?? 0)));
}
/** Actual souls credited during battle, for truthful events and repeated casts at the cap. */
export function creditBattleSouls(state: GameState, amount: number): number {
  const before = state.economy.souls;
  state.economy.souls = Math.min(battleSoulCap(state),
    before + Math.floor(Math.max(0, amount) * (1 + (state.battleSoulGainRatio ?? 0))));
  return Math.max(0, state.economy.souls - before);
}
