import type { GameState } from './GameState';

/** Only the in-battle pool is capped; settlement bonuses/kill rewards are separate. */
export const BATTLE_SOUL_BASE_CAP = 300;
/** Actual base souls gained, for truthful events and repeated casts at the cap. */
export function creditBattleSouls(state: GameState, amount: number): number {
  const before = state.economy.souls;
  state.economy.souls = Math.min(BATTLE_SOUL_BASE_CAP, before + Math.max(0, amount));
  return Math.max(0, state.economy.souls - before);
}
