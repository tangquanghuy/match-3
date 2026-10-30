/**
 * 通用币 seal (user decision 2026-10-30, plan A): every legitimate change to `人物.背包.通用币` is
 * sealed in a program-only field next to it; a balance that no longer matches its seal was edited
 * by hand (e.g. in the variable manager) and is silently put back to the sealed value.
 *
 * Legitimate writers: the AI's MVU updates (sealed when the update ends), the 三消 weapon shop
 * (sealed in the same write), and the first value seen in a chat (baseline). The key lives in the
 * client script, so this only stops casual edits, not someone reading the code.
 *
 * The seal sits in the same floor's stat_data, so regenerating or deleting a floor rolls the money
 * and its seal back together. The "当前变量" world book entry outputs a whitelist of fields, so the
 * AI never sees it.
 */
export const CURRENCY_SEAL_FIELD = '通用币校验';
/** Heartbeat `{version, at}` set on the tavern window by the guard script. */
export const CURRENCY_GUARD_FLAG = '__match3CurrencyGuard__';
const GUARD_STALE_MS = 10_000;
/** The weapon shop only checks and seals 通用币 while the card's guard script is running. */
export function currencyGuardActive(host: object, now = Date.now()): boolean {
  const beat = (host as Record<string, unknown>)[CURRENCY_GUARD_FLAG];
  return object(beat) && typeof beat['at'] === 'number' && now - beat['at'] < GUARD_STALE_MS;
}

const SALT = 'match3-currency-seal-v1:创世回廊:通用币';
type Stat = Record<string, unknown>;
export interface CurrencySealRecord { 值: number; 码: string }

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** cyrb53: small, synchronous string hash (MVU event handlers stay synchronous). */
function cyrb53(text: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export function currencySeal(value: number): string {
  return cyrb53(`${SALT}|${value}`, 7) + cyrb53(`${value}|${SALT}`, 13);
}

/** The value as the card's MVU schema stores it (`z.coerce.number().transform(Math.floor)`). */
function normalized(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.floor(n) : 0;
}

function bag(stat: Stat): Record<string, unknown> | undefined {
  const hero = stat['人物']; const value = object(hero) ? hero['背包'] : undefined;
  return object(value) ? value : undefined;
}

/**
 * Balance after the card's schema has run. A legacy `金币` field is merged into 通用币 by the
 * schema after MVU's update-ended handlers, so count it here to seal the final value.
 */
export function currencyBalance(stat: Stat): number | undefined {
  const b = bag(stat); if (!b) return undefined;
  return normalized(b['通用币']) + (Object.hasOwn(b, '金币') ? normalized(b['金币']) : 0);
}

/** Sealed value when the stored seal is intact, otherwise undefined. */
export function sealedCurrency(stat: Stat): number | undefined {
  const record = stat[CURRENCY_SEAL_FIELD];
  if (!object(record) || typeof record['码'] !== 'string' || !Number.isSafeInteger(record['值'])) return undefined;
  const value = record['值'] as number;
  return currencySeal(value) === record['码'] ? value : undefined;
}

/** Seal the current balance in place (no-op without a bag). Returns whether the record changed. */
export function sealCurrencyInPlace(stat: Stat): boolean {
  const balance = currencyBalance(stat); if (balance === undefined) return false;
  const previous = stat[CURRENCY_SEAL_FIELD];
  if (object(previous) && previous['值'] === balance && previous['码'] === currencySeal(balance)) return false;
  stat[CURRENCY_SEAL_FIELD] = { 值: balance, 码: currencySeal(balance) } satisfies CurrencySealRecord;
  return true;
}

/** ok: nothing changed. sealed: seal rewritten, balance kept. restored: balance put back. */
export type CurrencyCheck = 'ok' | 'sealed' | 'restored' | 'baseline' | 'no-bag';

/**
 * Check one floor's stat data in place.
 * - intact seal, matching balance: ok;
 * - intact seal, different balance: hand-edited, put the sealed value back;
 * - missing or broken seal: use the latest intact seal from earlier floors (`earlier`), or, when
 *   the chat has none yet, accept the current balance as the baseline.
 * The legacy `金币` field is folded into 通用币 when restoring, as the schema would.
 */
export function reconcileCurrencyInPlace(stat: Stat, earlier?: () => number | undefined): CurrencyCheck {
  const b = bag(stat); const balance = currencyBalance(stat);
  if (!b || balance === undefined) return 'no-bag';
  let trusted = sealedCurrency(stat);
  if (trusted === undefined) {
    trusted = earlier?.();
    if (trusted === undefined) { sealCurrencyInPlace(stat); return 'baseline'; }
  }
  if (trusted === balance) return sealCurrencyInPlace(stat) ? 'sealed' : 'ok';
  b['通用币'] = trusted; delete b['金币'];
  sealCurrencyInPlace(stat);
  return 'restored';
}
