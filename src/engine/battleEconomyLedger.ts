import type { GameState } from './GameState';
import { PlayerSide } from './types';

export type EconomyCurrency = 'gold' | 'souls' | 'gems' | 'maps';
export type EconomyAccount = PlayerSide | 'shared';
export type EconomySource = 'skill-gain' | 'skill-spend' | 'skill-theft' | 'trait' | 'match' | 'booty-gem' | 'pvp-bonus' | 'surrender' | 'direct';
export type EconomyOperation = 'gain' | 'spend' | 'steal-debit' | 'steal-credit' | 'forfeit' | 'bonus';
export interface EconomyAuditContext {
  source: EconomySource;
  side: PlayerSide;
  actorId?: number;
  operation?: EconomyOperation;
  transferId?: number;
}
export interface BattleEconomyBalances {
  leftGold: number;
  rightGold: number;
  souls: number;
  gems: number;
  maps: number;
}
export interface BattleEconomyEntry extends EconomyAuditContext {
  sequence: number;
  actionIndex: number;
  currency: EconomyCurrency;
  account: EconomyAccount;
  operation: EconomyOperation;
  requested: number;
  before: number;
  after: number;
  delta: number;
  multiplier?: number;
  cap?: number;
}
export interface BattleEconomyAudit {
  version: 1;
  initial: BattleEconomyBalances;
  final: BattleEconomyBalances;
  entries: BattleEconomyEntry[];
}
export interface EconomyChange extends EconomyAuditContext {
  currency: EconomyCurrency;
  account: EconomyAccount;
  requested: number;
  before: number;
  after: number;
  multiplier?: number;
  cap?: number;
}
type AuditState = Partial<Pick<GameState, 'economyAudit' | 'actionLog'>>;
const BALANCE_KEYS = ['leftGold', 'rightGold', 'souls', 'gems', 'maps'] as const;
const CURRENCIES: readonly unknown[] = ['gold', 'souls', 'gems', 'maps'];
const SOURCES: readonly unknown[] = ['skill-gain', 'skill-spend', 'skill-theft', 'trait', 'match', 'booty-gem', 'pvp-bonus', 'surrender', 'direct'];
const OPERATIONS: readonly unknown[] = ['gain', 'spend', 'steal-debit', 'steal-credit', 'forfeit', 'bonus'];
const ENTRY_KEYS = ['sequence', 'actionIndex', 'currency', 'account', 'source', 'side', 'actorId', 'operation', 'transferId', 'requested', 'before', 'after', 'delta', 'multiplier', 'cap'];

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function integer(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
function amount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER;
}
function validSide(value: unknown): value is PlayerSide {
  return value === PlayerSide.Left || value === PlayerSide.Right;
}
function validBalances(value: unknown): value is BattleEconomyBalances {
  return object(value) && Object.keys(value).length === BALANCE_KEYS.length && BALANCE_KEYS.every(key => integer(value[key]));
}
function balanceKey(currency: EconomyCurrency, account: EconomyAccount): keyof BattleEconomyBalances {
  if (currency === 'gold') {
    if (!validSide(account)) throw new Error('黄金流水缺少阵营账户');
    return account === PlayerSide.Left ? 'leftGold' : 'rightGold';
  }
  if (!CURRENCIES.includes(currency) || account !== 'shared') throw new Error('原生共享资源流水账户有误');
  return currency;
}
function balances(state: Pick<GameState, 'economy' | 'enemyGold'>): BattleEconomyBalances {
  return { leftGold: state.economy.gold, rightGold: state.enemyGold ?? 0, souls: state.economy.souls, gems: state.economy.gems, maps: state.economy.maps };
}

/** Opt-in only; enabling twice preserves the opening snapshot and existing entries. */
export function enableBattleEconomyAudit(state: GameState): void {
  if (state.economyAudit) return;
  const initial = balances(state);
  if (!validBalances(initial)) throw new Error('战斗经济流水初始余额有误');
  state.economyAudit = { version: 1, initial: { ...initial }, final: { ...initial }, entries: [] };
}
/** Gold belongs to each side; all other native reward pools remain shared. */
export function economyAccount(currency: EconomyCurrency, side: PlayerSide): EconomyAccount {
  if (!validSide(side) || !CURRENCIES.includes(currency)) throw new Error('战斗经济流水账户有误');
  return currency === 'gold' ? side : 'shared';
}

/** Replay one entry, including the native rounding/cap calculation and theft linkage. */
function validateEntry(raw: unknown, running: BattleEconomyBalances, entries: readonly BattleEconomyEntry[], creditedTransfers?: Set<number>): BattleEconomyEntry {
  if (!object(raw) || raw.sequence !== entries.length + 1 || !integer(raw.actionIndex)
    || raw.actionIndex < (entries[entries.length - 1]?.actionIndex ?? 0)
    || !CURRENCIES.includes(raw.currency) || !validSide(raw.side) || !SOURCES.includes(raw.source)
    || !OPERATIONS.includes(raw.operation) || !amount(raw.requested) || !integer(raw.before)
    || !integer(raw.after) || !Number.isSafeInteger(raw.delta) || raw.delta !== raw.after - raw.before
    || Object.keys(raw).some(key => !ENTRY_KEYS.includes(key))) throw new Error('战斗经济流水条目有误');
  if (raw.actorId !== undefined && !Number.isSafeInteger(raw.actorId)) throw new Error('战斗经济流水角色有误');
  if (raw.cap !== undefined && !integer(raw.cap)) throw new Error('战斗经济流水上限有误');
  if (raw.multiplier !== undefined && (typeof raw.multiplier !== 'number' || !Number.isFinite(raw.multiplier) || raw.multiplier < 0)) throw new Error('战斗经济流水倍率有误');
  const entry = raw as unknown as BattleEconomyEntry;
  const key = balanceKey(entry.currency, entry.account);
  if (running[key] !== entry.before) throw new Error('战斗经济流水余额不连续');
  const theft = entry.operation === 'steal-debit' || entry.operation === 'steal-credit';
  const debit = entry.operation === 'spend' || entry.operation === 'steal-debit' || entry.operation === 'forfeit';
  if (entry.currency === 'gold') {
    const owner = entry.operation === 'forfeit' ? PlayerSide.Left
      : entry.operation === 'steal-debit' ? (entry.side === PlayerSide.Left ? PlayerSide.Right : PlayerSide.Left) : entry.side;
    if (entry.account !== owner) throw new Error('战斗经济流水阵营有误');
  }
  if (entry.transferId !== undefined && (!integer(entry.transferId) || entry.transferId < 1 || !theft)) throw new Error('战斗经济流水转移引用有误');
  if (theft) {
    if (entry.currency !== 'gold' || entry.source !== 'skill-theft' || entry.transferId === undefined) throw new Error('窃取流水缺少黄金扣款引用');
    if (entry.operation === 'steal-debit') {
      if (entry.transferId !== entry.sequence) throw new Error('窃取扣款流水引用有误');
    } else {
      const origin = entries[entry.transferId - 1];
      if (!origin || origin.operation !== 'steal-debit' || origin.transferId !== origin.sequence
        || origin.currency !== entry.currency || origin.account === entry.account || origin.side !== entry.side
        || origin.actorId !== entry.actorId || origin.actionIndex !== entry.actionIndex
        || entry.requested !== -origin.delta || entry.cap === undefined || entry.multiplier === undefined) throw new Error('窃取入账流水引用或额度有误');
      const credited = creditedTransfers ? creditedTransfers.has(entry.transferId)
        : entries.some(previous => previous.operation === 'steal-credit' && previous.transferId === entry.transferId);
      if (credited) throw new Error('窃取扣款重复入账');
    }
  }
  let expected: number;
  if (debit) {
    if (entry.cap !== undefined || entry.multiplier !== undefined) throw new Error('扣款流水包含入账倍率或上限');
    expected = entry.before - Math.min(entry.before, entry.requested);
    if (entry.operation === 'forfeit' && (entry.source !== 'surrender' || entry.requested !== entry.before || entry.after !== 0)) throw new Error('放弃奖励流水有误');
  } else if (entry.cap !== undefined) {
    if (entry.currency === 'maps') {
      if (entry.cap !== 2 || entry.multiplier !== undefined) throw new Error('藏宝图流水上限有误');
      const before = Math.min(entry.cap, entry.before);
      expected = before + Math.min(Math.floor(entry.requested), entry.cap - before);
    } else {
      if ((entry.currency !== 'gold' && entry.currency !== 'souls') || entry.multiplier === undefined
        || entry.cap !== Math.floor((entry.currency === 'gold' ? 500 : 200) * entry.multiplier)) throw new Error('战斗经济流水倍率与上限不一致');
      const gain = Math.floor(entry.requested * entry.multiplier);
      // Souls retain their native upper clamp, including balances from uncapped bonuses.
      expected = entry.currency === 'souls' ? Math.min(entry.cap, entry.before + gain)
        : entry.before + Math.min(gain, Math.max(0, entry.cap - entry.before));
    }
  } else {
    if (entry.multiplier !== undefined) throw new Error('战斗经济流水倍率缺少上限');
    expected = entry.before + entry.requested;
  }
  if (entry.after !== expected) throw new Error('战斗经济流水实际变更与请求不一致');
  if (entry.operation === 'steal-credit') creditedTransfers?.add(entry.transferId!);
  return entry;
}

/** Record before the raw write so a rejected audit leaves balances unchanged. */
export function recordEconomyChange(state: AuditState, change: EconomyChange): void {
  const audit = state.economyAudit;
  if (!audit) return;
  const entry: BattleEconomyEntry = {
    ...change, operation: change.operation ?? 'gain', sequence: audit.entries.length + 1,
    actionIndex: state.actionLog?.length ?? audit.entries[audit.entries.length - 1]?.actionIndex ?? 0,
    delta: change.after - change.before,
  };
  validateEntry(entry, audit.final, audit.entries);
  audit.entries.push(entry);
  audit.final[balanceKey(entry.currency, entry.account)] = entry.after;
}

/** Native gems/PvP grants bypass collection caps and collection trait multipliers. */
export function creditUncappedEconomy(state: GameState, currency: EconomyCurrency, amount: number, context: EconomyAuditContext): number {
  const account = economyAccount(currency, context.side);
  const before = currency === 'gold' ? (context.side === PlayerSide.Left ? state.economy.gold : state.enemyGold ?? 0) : state.economy[currency];
  const actual = Math.max(0, amount);
  const after = before + actual;
  recordEconomyChange(state, { ...context, currency, account, requested: actual, before, after });
  if (currency === 'gold' && context.side === PlayerSide.Right) state.enemyGold = after;
  else state.economy[currency] = after;
  return actual;
}
/** Surrender clears only the player pools, even when Right is the acting side. */
export function forfeitPlayerEconomy(state: GameState, side: PlayerSide): void {
  // Validate all four changes first so malformed input never causes a partial forfeit.
  if (state.economyAudit) exportBattleEconomyAudit(state);
  for (const currency of ['gold', 'souls', 'gems', 'maps'] as const) {
    const before = state.economy[currency];
    recordEconomyChange(state, { currency, account: economyAccount(currency, PlayerSide.Left), source: 'surrender', side, operation: 'forfeit', requested: before, before, after: 0 });
    state.economy[currency] = 0;
  }
}

/** Restore a detached snapshot only after replaying every balance and transfer. */
export function restoreBattleEconomyAudit(value: unknown): BattleEconomyAudit {
  if (!object(value) || value.version !== 1 || !validBalances(value.initial) || !validBalances(value.final)
    || !Array.isArray(value.entries) || Object.keys(value).some(key => !['version', 'initial', 'final', 'entries'].includes(key))) throw new Error('战斗经济流水格式有误');
  const running = { ...value.initial };
  const final = value.final;
  const entries: BattleEconomyEntry[] = [];
  const creditedTransfers = new Set<number>();
  for (const raw of value.entries) {
    const entry = validateEntry(raw, running, entries, creditedTransfers);
    running[balanceKey(entry.currency, entry.account)] = entry.after;
    entries.push({ ...entry });
  }
  if (BALANCE_KEYS.some(key => running[key] !== final[key])) throw new Error('战斗经济流水终值不一致');
  return { version: 1, initial: { ...value.initial }, final: { ...final }, entries };
}
/** Reconcile all actual pools before exporting; callers receive an independent snapshot. */
export function exportBattleEconomyAudit(state: GameState): BattleEconomyAudit | undefined {
  const audit = state.economyAudit;
  if (!audit) return undefined;
  const actual = balances(state);
  if (BALANCE_KEYS.some(key => actual[key] !== audit.final[key])) throw new Error('战斗经济流水遗漏余额变更');
  return restoreBattleEconomyAudit(audit);
}
