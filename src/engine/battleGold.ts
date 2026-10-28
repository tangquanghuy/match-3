/** Side-owned battle Gold. economy.gold remains the Left reward API, not a shared pool. */
import type { GameState } from './GameState';
import { recordEconomyChange } from './battleEconomyLedger';
import type { EconomyAuditContext } from './battleEconomyLedger';
import { PlayerSide } from './types';
export function goldForSide(state: GameState, side: PlayerSide): number {
  return side === PlayerSide.Left ? state.economy.gold : state.enemyGold ?? 0;
}
function writeGoldForSide(state: GameState, side: PlayerSide, value: number): void {
  if (side === PlayerSide.Left) state.economy.gold = value;
  else state.enemyGold = value;
}
export function setGoldForSide(state: GameState, side: PlayerSide, amount: number): void {
  const before = goldForSide(state, side);
  const after = Math.max(0, amount);
  recordEconomyChange(state, { source: 'direct', side, operation: after < before ? 'spend' : 'gain',
    currency: 'gold', account: side, requested: Math.abs(after - before), before, after });
  writeGoldForSide(state, side, after);
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
/** Returns the actual credit; even clipped attempts are recorded when auditing is enabled. */
export function creditGoldForSide(state: GameState, side: PlayerSide, amount: number, context: EconomyAuditContext = { source: 'direct', side }): number {
  const before = goldForSide(state, side);
  const requested = Math.max(0, amount);
  const multiplier = battleGoldMultiplier(state, side);
  const cap = battleGoldCap(state, side);
  const gained = Math.min(Math.floor(requested * multiplier), Math.max(0, cap - before));
  const after = before + gained;
  recordEconomyChange(state, { ...context, currency: 'gold', account: side, requested, before, after, multiplier, cap });
  if (gained > 0) writeGoldForSide(state, side, after);
  return gained;
}
/** Debit the account's available Gold; theft context identifies the acting side separately. */
export function debitGoldForSide(state: GameState, accountSide: PlayerSide, amount: number, context: EconomyAuditContext): number {
  const before = goldForSide(state, accountSide);
  // Spending all uses Infinity in existing skill primitives; the finite balance is the request.
  const requested = amount === Infinity ? before : Math.max(0, amount);
  const actual = Math.min(before, requested);
  const after = before - actual;
  recordEconomyChange(state, { ...context, operation: context.operation ?? 'spend', currency: 'gold', account: accountSide, requested, before, after });
  if (actual > 0) writeGoldForSide(state, accountSide, after);
  return actual;
}
