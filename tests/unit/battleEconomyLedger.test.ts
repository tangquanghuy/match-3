import { describe, expect, it } from 'vitest';
import { BoardModel } from '../../src/engine/BoardModel';
import { createGameState } from '../../src/engine/GameState';
import type { BattleEconomy, GameState } from '../../src/engine/GameState';
import {
  creditUncappedEconomy, enableBattleEconomyAudit, exportBattleEconomyAudit,
  forfeitPlayerEconomy, restoreBattleEconomyAudit,
} from '../../src/engine/battleEconomyLedger';
import type { BattleEconomyAudit, EconomyAuditContext, EconomyCurrency } from '../../src/engine/battleEconomyLedger';
import { battleGoldCap, creditGoldForSide, debitGoldForSide, goldForSide, setGoldForSide } from '../../src/engine/battleGold';
import { battleSoulCap, creditBattleSouls } from '../../src/engine/battleSouls';
import { creditBattleMaps } from '../../src/engine/battleMaps';
import { PlayerSide } from '../../src/engine/types';

const L = PlayerSide.Left;
const R = PlayerSide.Right;
function stateWith(economy: Partial<BattleEconomy> = {}, enemyGold = 0, audit = true): GameState {
  const state = createGameState(new BoardModel(), { player: L, characters: [] }, { player: R, characters: [] });
  Object.assign(state.economy, economy);
  state.enemyGold = enemyGold;
  if (audit) enableBattleEconomyAudit(state);
  return state;
}
function snapshot(state: GameState): BattleEconomyAudit {
  const audit = exportBattleEconomyAudit(state);
  if (!audit) throw new Error('test fixture must enable audit');
  return audit;
}
function action(state: GameState): void {
  state.actionLog.push({ index: state.actionLog.length, side: L, action: { type: 'cast', characterId: 42 }, outcome: 'held' });
}
function theftContext(state: GameState, side = L): EconomyAuditContext {
  return { source: 'skill-theft', side, actorId: 42, transferId: state.economyAudit!.entries.length + 1 };
}
function transfer(state: GameState, requested: number, side = L): void {
  const context = theftContext(state, side);
  const actual = debitGoldForSide(state, side === L ? R : L, requested, { ...context, operation: 'steal-debit' });
  creditGoldForSide(state, side, actual, { ...context, operation: 'steal-credit' });
}
function transferredAudit(): BattleEconomyAudit {
  const state = stateWith({}, 50);
  action(state);
  transfer(state, 10);
  return snapshot(state);
}

describe('battle economy audit opt-in and native pools', () => {
  it('keeps legacy helpers audit-free and maps compatible with economy-only fixtures', () => {
    const state = stateWith({}, 30, false);
    state.battleGoldGainRatios = { [L]: 1, [R]: 0 };
    state.battleSoulGainRatio = 0.5;
    expect(creditGoldForSide(state, L, 3)).toBe(6);
    expect(creditGoldForSide(state, R, 3)).toBe(3);
    expect(creditBattleSouls(state, 3)).toBe(4);
    expect(creditBattleMaps({ economy: state.economy }, 1.9)).toBe(1);
    expect(debitGoldForSide(state, R, 5, { source: 'skill-spend', side: R })).toBe(5);
    setGoldForSide(state, L, 1.5);
    expect(state.economy).toEqual({ gold: 1.5, souls: 4, gems: 0, maps: 1 });
    expect(state.enemyGold).toBe(28);
    expect(exportBattleEconomyAudit(state)).toBeUndefined();
    expect(Object.hasOwn(state, 'economyAudit')).toBe(false);
  });

  it('captures actual opening pools, defaults missing enemy Gold to zero, and enables once', () => {
    const state = stateWith({ gold: 11, souls: 12, gems: 13, maps: 1 }, 0, false);
    delete state.enemyGold;
    enableBattleEconomyAudit(state);
    const audit = state.economyAudit;
    creditGoldForSide(state, L, 4);
    enableBattleEconomyAudit(state);
    expect(state.economyAudit).toBe(audit);
    expect(snapshot(state).initial).toEqual({ leftGold: 11, rightGold: 0, souls: 12, gems: 13, maps: 1 });
    expect(audit!.initial).not.toBe(audit!.final);
    expect(audit!.entries).toHaveLength(1);
  });

  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects malformed opening balance %s before enabling', value => {
    const state = stateWith({ gold: value }, 0, false);
    expect(() => enableBattleEconomyAudit(state)).toThrow();
    expect(state.economyAudit).toBeUndefined();
  });

  it('uses direct defaults and actual native accounts for each helper', () => {
    const state = stateWith();
    creditGoldForSide(state, R, 3);
    creditBattleSouls(state, 4);
    creditBattleMaps(state, 1);
    expect(snapshot(state).entries).toMatchObject([
      { sequence: 1, actionIndex: 0, currency: 'gold', account: R, side: R, source: 'direct', operation: 'gain', requested: 3, delta: 3 },
      { sequence: 2, currency: 'souls', account: 'shared', side: L, source: 'direct', delta: 4 },
      { sequence: 3, currency: 'maps', account: 'shared', side: L, source: 'direct', delta: 1 },
    ]);
  });

  it('retains actor metadata and action indexes without retaining the caller context object', () => {
    const state = stateWith();
    action(state);
    const context: EconomyAuditContext = { source: 'trait', side: R, actorId: 42 };
    creditBattleSouls(state, 1, context);
    context.actorId = 99;
    action(state);
    creditGoldForSide(state, R, 1, { source: 'booty-gem', side: R });
    expect(snapshot(state).entries).toMatchObject([
      { actionIndex: 1, actorId: 42, source: 'trait', side: R, account: 'shared' },
      { actionIndex: 2, source: 'booty-gem', side: R, account: R },
    ]);
  });

  it('audits maps through the compatible partial state, including missing actionLog', () => {
    const state = stateWith();
    action(state);
    creditGoldForSide(state, L, 1);
    const partial: Pick<GameState, 'economy'> & Partial<Pick<GameState, 'economyAudit' | 'actionLog'>> = {
      economy: state.economy, economyAudit: state.economyAudit,
    };
    creditBattleMaps(partial, 1, { source: 'skill-gain', side: R, actorId: 7 });
    creditBattleMaps({ ...partial, actionLog: state.actionLog }, 2);
    expect(snapshot(state).entries.slice(1)).toMatchObject([
      { actionIndex: 1, account: 'shared', side: R, actorId: 7, delta: 1 },
      { actionIndex: 1, account: 'shared', side: L, requested: 2, delta: 1 },
    ]);
  });
});

describe('collection caps, rounding and released capacity', () => {
  it('floors after applying the side-specific multiplier, then clips against the balance cap', () => {
    const state = stateWith({ gold: 747 });
    state.battleGoldGainRatios = { [L]: 0.5, [R]: 1 };
    expect(battleGoldCap(state, L)).toBe(750);
    expect(battleGoldCap(state, R)).toBe(1000);
    expect(creditGoldForSide(state, L, 1.5)).toBe(2);
    expect(creditGoldForSide(state, L, 3)).toBe(1);
    expect(creditGoldForSide(state, L, 3)).toBe(0);
    expect(creditGoldForSide(state, R, 3)).toBe(6);
    expect(snapshot(state).entries).toMatchObject([
      { requested: 1.5, before: 747, after: 749, delta: 2, multiplier: 1.5, cap: 750 },
      { requested: 3, before: 749, after: 750, delta: 1 },
      { requested: 3, before: 750, after: 750, delta: 0 },
      { requested: 3, account: R, multiplier: 2, cap: 1000, delta: 6 },
    ]);
  });

  it('uses the Left soul ratio for the shared pool even when Right acts', () => {
    const state = stateWith({ souls: 298 });
    state.battleSoulGainRatio = 0.5;
    expect(battleSoulCap(state)).toBe(300);
    const context: EconomyAuditContext = { source: 'skill-gain', side: R, actorId: 9 };
    expect(creditBattleSouls(state, 1, context)).toBe(1);
    expect(creditBattleSouls(state, 4, context)).toBe(1);
    expect(creditBattleSouls(state, 4, context)).toBe(0);
    expect(snapshot(state).entries).toMatchObject([
      { account: 'shared', side: R, multiplier: 1.5, cap: 300, delta: 1 },
      { requested: 4, delta: 1 }, { requested: 4, delta: 0 },
    ]);
  });

  it('records every clipped or nonpositive attempt without inventing a reward', () => {
    const state = stateWith({ gold: 500, souls: 200, maps: 2 });
    for (const amount of [5, 0, -5]) {
      expect(creditGoldForSide(state, L, amount)).toBe(0);
      expect(creditBattleSouls(state, amount)).toBe(0);
      expect(creditBattleMaps(state, amount)).toBe(0);
      expect(creditUncappedEconomy(state, 'gems', amount <= 0 ? amount : 0, { source: 'direct', side: L })).toBe(0);
    }
    const audit = snapshot(state);
    expect(audit.entries).toHaveLength(12);
    expect(audit.entries.every(entry => entry.delta === 0)).toBe(true);
    expect(audit.entries.map(entry => entry.sequence)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
    expect(audit.final).toEqual(audit.initial);
  });

  it('spending actual Gold releases capacity and does not double-record the private writes', () => {
    const state = stateWith({ gold: 500 }, 77);
    expect(debitGoldForSide(state, L, 80, { source: 'skill-spend', side: L, actorId: 42 })).toBe(80);
    expect(creditGoldForSide(state, L, 100)).toBe(80);
    expect(snapshot(state).entries).toMatchObject([
      { operation: 'spend', requested: 80, before: 500, after: 420, delta: -80 },
      { operation: 'gain', requested: 100, before: 420, after: 500, delta: 80 },
    ]);
    expect(state.enemyGold).toBe(77);
  });

  it('debits only available Gold, supports spending all, and records empty spend attempts', () => {
    const state = stateWith({ gold: 9 }, 11);
    const context: EconomyAuditContext = { source: 'skill-spend', side: L };
    expect(debitGoldForSide(state, L, 20, context)).toBe(9);
    expect(debitGoldForSide(state, L, 20, context)).toBe(0);
    expect(debitGoldForSide(state, L, -1, context)).toBe(0);
    expect(debitGoldForSide(state, R, Infinity, { ...context, side: R })).toBe(11);
    expect(snapshot(state).entries).toMatchObject([
      { requested: 20, delta: -9 }, { requested: 20, delta: 0 },
      { requested: 0, delta: 0 }, { requested: 11, delta: -11, account: R },
    ]);
  });

  it('keeps the setter uncapped and records direct increases, reductions, clamps and unchanged writes', () => {
    const state = stateWith({ gold: 500 });
    setGoldForSide(state, L, 450);
    expect(creditGoldForSide(state, L, 100)).toBe(50);
    setGoldForSide(state, R, 900);
    setGoldForSide(state, R, -5);
    setGoldForSide(state, R, 0);
    expect(snapshot(state).entries).toMatchObject([
      { source: 'direct', operation: 'spend', requested: 50, delta: -50 },
      { source: 'direct', operation: 'gain', delta: 50 },
      { source: 'direct', operation: 'gain', account: R, requested: 900, delta: 900 },
      { source: 'direct', operation: 'spend', account: R, requested: 900, delta: -900 },
      { source: 'direct', operation: 'gain', account: R, requested: 0, delta: 0 },
    ]);
  });

  it('retains the native map floor and records fractional requests and full-cap attempts', () => {
    const state = stateWith();
    expect(creditBattleMaps(state, 0.9)).toBe(0);
    expect(creditBattleMaps(state, 1.9)).toBe(1);
    expect(creditBattleMaps(state, 99)).toBe(1);
    expect(creditBattleMaps(state, Infinity)).toBe(0);
    expect(snapshot(state).entries.map(entry => [entry.requested, entry.delta])).toEqual([[0.9, 0], [1.9, 1], [99, 1], [0, 0]]);
  });
});

describe('uncapped bonuses and native surrender', () => {
  it('bypasses multipliers and collection caps, retaining each actual account', () => {
    const state = stateWith({ gold: 500, souls: 200, maps: 2 }, 500);
    state.battleGoldGainRatios = { [L]: 1, [R]: 1 };
    state.battleSoulGainRatio = 1;
    const context: EconomyAuditContext = { source: 'pvp-bonus', side: R, operation: 'bonus' };
    for (const currency of ['gold', 'souls', 'gems', 'maps'] as const) {
      expect(creditUncappedEconomy(state, currency, 1000, context)).toBe(1000);
    }
    expect(state.economy).toEqual({ gold: 500, souls: 1200, gems: 1000, maps: 1002 });
    expect(state.enemyGold).toBe(1500);
    expect(snapshot(state).entries.map(entry => [entry.currency, entry.account, entry.delta, entry.cap, entry.multiplier]))
      .toEqual([['gold', R, 1000, undefined, undefined], ['souls', 'shared', 1000, undefined, undefined], ['gems', 'shared', 1000, undefined, undefined], ['maps', 'shared', 1000, undefined, undefined]]);
  });

  it('truthfully records native above-cap behavior rather than silently changing it', () => {
    const state = stateWith();
    const bonus: EconomyAuditContext = { source: 'pvp-bonus', side: L, operation: 'bonus' };
    creditUncappedEconomy(state, 'gold', 600, bonus);
    creditUncappedEconomy(state, 'souls', 250, bonus);
    creditUncappedEconomy(state, 'maps', 5, bonus);
    expect(creditGoldForSide(state, L, 1)).toBe(0);
    expect(creditBattleSouls(state, 1)).toBe(0);
    expect(creditBattleMaps(state, 1)).toBe(0);
    expect(snapshot(state).entries.slice(3)).toMatchObject([
      { currency: 'gold', before: 600, after: 600, delta: 0 },
      { currency: 'souls', before: 250, after: 200, delta: -50 },
      { currency: 'maps', before: 5, after: 2, delta: -3 },
    ]);
  });

  it.each([L, R])('forfeits only player pools when %s acts and records repeated zero forfeits', side => {
    const state = stateWith({ gold: 10, souls: 20, gems: 30, maps: 1 }, 400);
    forfeitPlayerEconomy(state, side);
    forfeitPlayerEconomy(state, side);
    expect(state.economy).toEqual({ gold: 0, souls: 0, gems: 0, maps: 0 });
    expect(state.enemyGold).toBe(400);
    const audit = snapshot(state);
    expect(audit.entries.map(entry => entry.delta)).toEqual([-10, -20, -30, -1, 0, 0, 0, 0]);
    expect(audit.entries.every(entry => entry.source === 'surrender' && entry.side === side && entry.operation === 'forfeit')).toBe(true);
    expect(audit.entries[0]!.account).toBe(L);
    expect(audit.entries.slice(1, 4).every(entry => entry.account === 'shared')).toBe(true);
  });
});

describe('Gold theft transfer integrity', () => {
  it.each([L, R])('links the unique actual debit to the trait-enhanced credit for %s', side => {
    const state = stateWith({ gold: 40 }, 40);
    state.battleGoldGainRatios = { [L]: 1, [R]: 1 };
    action(state);
    transfer(state, 10, side);
    expect(goldForSide(state, side)).toBe(60);
    expect(goldForSide(state, side === L ? R : L)).toBe(30);
    expect(snapshot(state).entries).toMatchObject([
      { sequence: 1, actionIndex: 1, source: 'skill-theft', side, actorId: 42, operation: 'steal-debit', transferId: 1, requested: 10, delta: -10 },
      { sequence: 2, actionIndex: 1, side, actorId: 42, operation: 'steal-credit', transferId: 1, requested: 10, delta: 20, multiplier: 2 },
    ]);
  });

  it('links the raw debit instead of requiring equal final deltas when the credit clips', () => {
    const state = stateWith({ gold: 995 }, 10);
    state.battleGoldGainRatios = { [L]: 1, [R]: 0 };
    transfer(state, 4);
    expect(snapshot(state).entries.map(entry => [entry.requested, entry.delta])).toEqual([[4, -4], [4, 5]]);
  });

  it('credits only the available amount from an oversized debit request', () => {
    const state = stateWith({}, 7);
    transfer(state, 100);
    expect(snapshot(state).entries).toMatchObject([
      { requested: 100, delta: -7 }, { requested: 7, delta: 7 },
    ]);
  });

  it('accepts a deferred debit with no credit and survives a JSON restore', () => {
    const state = stateWith({}, 50);
    const context = theftContext(state);
    debitGoldForSide(state, R, 12, { ...context, operation: 'steal-debit' });
    const saved = snapshot(state);
    expect(saved.entries).toHaveLength(1);
    expect(saved.final).toMatchObject({ leftGold: 0, rightGold: 38 });
    expect(restoreBattleEconomyAudit(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
  });

  it('rejects fabricated, missing and reused transfer IDs before mutating either pool or ledger', () => {
    const state = stateWith({}, 40);
    const fake: EconomyAuditContext = { source: 'skill-theft', side: L, actorId: 42, operation: 'steal-credit', transferId: 1 };
    expect(() => creditGoldForSide(state, L, 10, fake)).toThrow();
    expect(snapshot(state).entries).toHaveLength(0);
    transfer(state, 10);
    const before = snapshot(state);
    expect(() => creditGoldForSide(state, L, 10, fake)).toThrow(/重复/);
    expect(() => creditGoldForSide(state, L, 10, { ...fake, transferId: undefined })).toThrow();
    expect(snapshot(state)).toEqual(before);
    expect(state.economy.gold).toBe(10);
  });

  it('rejects an oversized theft credit before writing, while leaving the deferred debit valid', () => {
    const state = stateWith({}, 9);
    const context = theftContext(state);
    debitGoldForSide(state, R, 30, { ...context, operation: 'steal-debit' });
    expect(() => creditGoldForSide(state, L, 30, { ...context, operation: 'steal-credit' })).toThrow();
    expect(snapshot(state).entries).toHaveLength(1);
    expect(state.economy.gold).toBe(0);
    expect(state.enemyGold).toBe(0);
  });

  it.each([
    ['future debit ID', (audit: BattleEconomyAudit) => { audit.entries[0]!.transferId = 2; }],
    ['credit without ID', (audit: BattleEconomyAudit) => { delete audit.entries[1]!.transferId; }],
    ['credit referencing itself', (audit: BattleEconomyAudit) => { audit.entries[1]!.transferId = 2; }],
    ['actor mismatch', (audit: BattleEconomyAudit) => { audit.entries[1]!.actorId = 99; }],
    ['side mismatch', (audit: BattleEconomyAudit) => { audit.entries[1]!.side = R; }],
    ['action mismatch', (audit: BattleEconomyAudit) => { audit.entries[1]!.actionIndex = 2; }],
    ['wrong source', (audit: BattleEconomyAudit) => { audit.entries[1]!.source = 'direct'; }],
    ['inflated raw credit', (audit: BattleEconomyAudit) => { const entry = audit.entries[1]!; entry.requested = 11; entry.after = 11; entry.delta = 11; audit.final.leftGold = 11; }],
  ] as const)('rejects restored theft with %s', (_name, tamper) => {
    const audit = transferredAudit();
    tamper(audit);
    expect(() => restoreBattleEconomyAudit(audit)).toThrow();
  });

  it('rejects duplicate credit even when sequence, arithmetic and final balance are consistent', () => {
    const audit = transferredAudit();
    const first = audit.entries[1]!;
    audit.entries.push({ ...first, sequence: 3, before: first.after, after: first.after + first.delta });
    audit.final.leftGold += first.delta;
    expect(() => restoreBattleEconomyAudit(audit)).toThrow(/重复/);
  });
});

describe('restore validation, independent export and missed-write detection', () => {
  it('exports and restores independent opening, final and entry objects', () => {
    const state = stateWith();
    creditGoldForSide(state, L, 5);
    const exported = snapshot(state);
    const restored = restoreBattleEconomyAudit(exported);
    exported.initial.leftGold = 123;
    exported.final.leftGold = 123;
    exported.entries[0]!.actorId = 123;
    restored.entries[0]!.after = 456;
    expect(snapshot(state)).toMatchObject({ initial: { leftGold: 0 }, final: { leftGold: 5 }, entries: [{ after: 5 }] });
    expect(state.economyAudit!.entries[0]!.actorId).toBeUndefined();
    expect(restored.initial.leftGold).toBe(0);
    expect(restored.final.leftGold).toBe(5);
    expect(restored.entries[0]!.actorId).toBeUndefined();
  });

  it('continues numbering and balances after restoring a live audit', () => {
    const state = stateWith();
    creditGoldForSide(state, L, 5);
    state.economyAudit = restoreBattleEconomyAudit(JSON.parse(JSON.stringify(snapshot(state))));
    creditBattleSouls(state, 3);
    expect(snapshot(state).entries.map(entry => entry.sequence)).toEqual([1, 2]);
    expect(snapshot(state).final).toMatchObject({ leftGold: 5, souls: 3 });
  });

  it.each(['gold', 'souls', 'gems', 'maps', 'enemyGold'] as const)('detects an unrecorded write to %s on export', pool => {
    const state = stateWith();
    if (pool === 'enemyGold') state.enemyGold = 1;
    else state.economy[pool] = 1;
    expect(() => exportBattleEconomyAudit(state)).toThrow(/遗漏/);
  });

  it('rejects a discontinuous subsequent write before changing the balance or appending an entry', () => {
    const state = stateWith();
    creditGoldForSide(state, L, 10);
    state.economy.gold = 20;
    expect(() => creditGoldForSide(state, L, 5)).toThrow(/连续/);
    expect(state.economy.gold).toBe(20);
    expect(state.economyAudit!.entries).toHaveLength(1);
    expect(state.economyAudit!.final.leftGold).toBe(10);
  });

  it('validates every pool before surrender so missed writes cause no partial forfeit', () => {
    const state = stateWith({ gold: 10, souls: 10 });
    state.economy.souls = 20;
    expect(() => forfeitPlayerEconomy(state, L)).toThrow(/遗漏/);
    expect(state.economy.gold).toBe(10);
    expect(state.economy.souls).toBe(20);
    expect(state.economyAudit!.entries).toHaveLength(0);
  });

  it.each([
    ['version', (audit: BattleEconomyAudit) => { Object.assign(audit, { version: 2 }); }],
    ['extra root field', (audit: BattleEconomyAudit) => { Object.assign(audit, { rewards: [] }); }],
    ['extra entry field', (audit: BattleEconomyAudit) => { Object.assign(audit.entries[0]!, { invented: true }); }],
    ['fractional balance', (audit: BattleEconomyAudit) => { audit.initial.leftGold = 0.5; }],
    ['unsafe balance', (audit: BattleEconomyAudit) => { audit.final.leftGold = Number.MAX_SAFE_INTEGER + 1; }],
    ['negative request', (audit: BattleEconomyAudit) => { audit.entries[0]!.requested = -1; }],
    ['nonfinite request', (audit: BattleEconomyAudit) => { audit.entries[0]!.requested = Infinity; }],
    ['nonfinite multiplier', (audit: BattleEconomyAudit) => { audit.entries[0]!.multiplier = NaN; }],
    ['negative multiplier', (audit: BattleEconomyAudit) => { audit.entries[0]!.multiplier = -1; }],
    ['fractional cap', (audit: BattleEconomyAudit) => { audit.entries[0]!.cap = 500.5; }],
    ['mismatched cap', (audit: BattleEconomyAudit) => { audit.entries[0]!.cap = 1000; }],
    ['invalid actor', (audit: BattleEconomyAudit) => { audit.entries[0]!.actorId = 0.5; }],
    ['unknown source', (audit: BattleEconomyAudit) => { Object.assign(audit.entries[0]!, { source: 'invented' }); }],
    ['unknown operation', (audit: BattleEconomyAudit) => { Object.assign(audit.entries[0]!, { operation: 'invented' }); }],
    ['unknown currency', (audit: BattleEconomyAudit) => { Object.assign(audit.entries[0]!, { currency: 'invented' }); }],
    ['invalid side', (audit: BattleEconomyAudit) => { Object.assign(audit.entries[0]!, { side: 'shared' }); }],
    ['wrong gold account', (audit: BattleEconomyAudit) => { audit.entries[0]!.account = 'shared'; }],
    ['fake shared ownership', (audit: BattleEconomyAudit) => { audit.entries[1]!.account = R; }],
    ['sequence gap', (audit: BattleEconomyAudit) => { audit.entries[0]!.sequence = 2; }],
    ['decreasing action index', (audit: BattleEconomyAudit) => { audit.entries[1]!.actionIndex = 0; }],
    ['broken before chain', (audit: BattleEconomyAudit) => { audit.entries[0]!.before = 1; audit.entries[0]!.delta = 4; }],
    ['inconsistent delta', (audit: BattleEconomyAudit) => { audit.entries[0]!.delta = 99; }],
    ['inflated credit with consistent totals', (audit: BattleEconomyAudit) => { const entry = audit.entries[0]!; entry.after = 6; entry.delta = 6; audit.final.leftGold = 6; }],
    ['inconsistent final balance', (audit: BattleEconomyAudit) => { audit.final.gems = 1; }],
    ['transfer ID on ordinary credit', (audit: BattleEconomyAudit) => { audit.entries[0]!.transferId = 1; }],
    ['truncated entries', (audit: BattleEconomyAudit) => { audit.entries.pop(); }],
  ] as const)('rejects %s', (_name, tamper) => {
    const state = stateWith();
    action(state);
    creditGoldForSide(state, L, 5);
    creditBattleSouls(state, 3);
    const audit = snapshot(state);
    tamper(audit);
    expect(() => restoreBattleEconomyAudit(audit)).toThrow();
  });

  it.each([undefined, null, [], {}, { version: 1, initial: {}, final: {}, entries: [] }])('rejects malformed audit %j', value => {
    expect(() => restoreBattleEconomyAudit(value)).toThrow();
  });

  it('rejects runtime overflow and invalid requests without changing the audit or balance', () => {
    const state = stateWith({ gems: Number.MAX_SAFE_INTEGER });
    const context: EconomyAuditContext = { source: 'direct', side: L };
    expect(() => creditUncappedEconomy(state, 'gems', 1, context)).toThrow();
    expect(() => creditGoldForSide(state, L, NaN)).toThrow();
    expect(() => setGoldForSide(state, L, 1.5)).toThrow();
    expect(snapshot(state).entries).toHaveLength(0);
    expect(state.economy.gold).toBe(0);
    expect(state.economy.gems).toBe(Number.MAX_SAFE_INTEGER);
  });

  it.each(['gold', 'souls', 'gems', 'maps'] as const)('replays ordinary debit/bonus signs for %s without accepting tampered totals', (currency: EconomyCurrency) => {
    const state = stateWith();
    creditUncappedEconomy(state, currency, 7, { source: 'pvp-bonus', side: L, operation: 'bonus' });
    const audit = snapshot(state);
    audit.entries[0]!.operation = 'spend';
    expect(() => restoreBattleEconomyAudit(audit)).toThrow();
  });
});
