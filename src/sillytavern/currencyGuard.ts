/**
 * 通用币 guard logic, independent of tavern globals so it can be tested. The card script entry
 * (currencyGuardEntry.ts) wires it to MVU and tavern events; see currencySeal.ts for the rules.
 */
import { reconcileCurrencyInPlace, sealCurrencyInPlace, sealedCurrency } from './currencySeal';
import type { CurrencyCheck } from './currencySeal';

export interface GuardMvuData { stat_data?: Record<string, unknown>; [key: string]: unknown }
export interface CurrencyGuardDeps {
  /** Index of the latest chat floor, or undefined without a chat. */
  latestId(): number | undefined;
  /** A floor's MVU data (a copy); undefined or without stat_data when the floor has none. */
  read(id: number): GuardMvuData | undefined;
  write(id: number, data: GuardMvuData): Promise<void>;
  /** True while a reply is generating or MVU is updating; periodic checks then wait. */
  busy(): boolean;
  log?(message: string): void;
}

export interface CurrencyGuard {
  /** Check the latest floor and write it back when needed. `force` ignores busy (generation start). */
  checkLatest(force?: boolean): Promise<CurrencyCheck | 'skipped'>;
  /** MVU update started: the base of the new floor. Put a hand-edited balance back before commands apply. */
  onUpdateStarted(variables: GuardMvuData | undefined): void;
  /** MVU update ended: the AI's result is legitimate, seal it. */
  onUpdateEnded(variables: GuardMvuData | undefined): void;
  /** The chat changed: check its earlier floors again on the next check. */
  chatChanged(): void;
}

export function createCurrencyGuard(deps: CurrencyGuardDeps): CurrencyGuard {
  let checking = false; let anchored = false;
  /** Latest intact seal on floors at or below `from`. */
  const earlier = (from: number) => (): number | undefined => {
    for (let id = from; id >= 0; id--) {
      const stat = deps.read(id)?.stat_data;
      const value = stat ? sealedCurrency(stat) : undefined;
      if (value !== undefined) return value;
    }
    return undefined;
  };
  return {
    async checkLatest(force = false) {
      if (checking || (!force && deps.busy())) return 'skipped';
      const id = deps.latestId(); if (id === undefined || id < 0) return 'skipped';
      checking = true;
      try {
        const data = deps.read(id); const stat = data?.stat_data;
        if (!data || !stat) return 'skipped';
        const result = reconcileCurrencyInPlace(stat, earlier(id - 1));
        if (result !== 'ok' && result !== 'no-bag') {
          await deps.write(id, data);
          deps.log?.(`[通用币校验] 楼层 ${id}：${result}`);
        }
        // Once per chat: when no earlier floor carries a seal yet (first install), seal the nearest
        // earlier floor too, so deleting the latest seal falls back to it instead of a new baseline.
        if (result !== 'no-bag' && !anchored) {
          anchored = true;
          if (earlier(id - 1)() === undefined) {
            for (let previous = id - 1; previous >= 0; previous--) {
              const earlierData = deps.read(previous); const earlierStat = earlierData?.stat_data;
              if (!earlierData || !earlierStat) continue;
              if (reconcileCurrencyInPlace(earlierStat) === 'baseline') await deps.write(previous, earlierData);
              break;
            }
          }
        }
        return result;
      } finally { checking = false; }
    },
    onUpdateStarted(variables) {
      const stat = variables?.stat_data; if (!stat) return;
      // Only an intact seal is trusted here; a missing seal is handled by the floor checks.
      if (sealedCurrency(stat) === undefined) return;
      const result = reconcileCurrencyInPlace(stat);
      if (result === 'restored') deps.log?.('[通用币校验] 变量更新前已回写');
    },
    onUpdateEnded(variables) {
      const stat = variables?.stat_data; if (stat) sealCurrencyInPlace(stat);
    },
    chatChanged() { anchored = false; },
  };
}
