import { describe, expect, it } from 'vitest';
import { BoardModel } from '../../src/engine/BoardModel';
import { BoardGenerator } from '../../src/engine/boardGen';
import { TurnEngine } from '../../src/engine/TurnEngine';
import { createGameState } from '../../src/engine/GameState';
import type { GameState } from '../../src/engine/GameState';
import { SeededRNG } from '../../src/engine/rng';
import { ExtensionRegistry } from '../../src/engine/registry';
import { chooseAiAction } from '../../src/engine/aiPolicy';
import { enableBattleEconomyAudit, exportBattleEconomyAudit } from '../../src/engine/battleEconomyLedger';
import type { BattleEconomyAudit, BattleEconomyBalances } from '../../src/engine/battleEconomyLedger';
import { PlayerSide, BaseColor, colorGem, skullGem, specialGem } from '../../src/engine/types';
import type { Character, GemType } from '../../src/engine/types';
import type { GameEvent } from '../../src/engine/events';
import { registerDynamicTraits } from '../../src/engine/traits';
import { PVP_DYNAMIC_DEFS } from '../../src/meta/data/talentDefs';
import { registerSkillLibrary } from '../../src/engine/skills/library';
import type { SkillPrototype } from '../../src/engine/skills/prototypes';
import { CELL, dmg, explodeAt, gainGold, gainSouls, gainGems, gainMaps, spendGold } from '../../src/engine/skills/builders';
import { BattleSession } from '../../src/session/BattleSession';
import { mapRequestToTeams } from '../../src/session/combatantMapping';
import { BATTLE_SCHEMA_VERSION, RULESET_VERSION } from '../../src/session/contract';
import type { BattleRequest, CombatantSnapshot } from '../../src/session/contract';
import { prepareStBattle } from '../../src/sillytavern/battleRuntime';

const ZERO: BattleEconomyBalances = { leftGold: 0, rightGold: 0, souls: 0, gems: 0, maps: 0 };
const other = (side: PlayerSide) => side === PlayerSide.Left ? PlayerSide.Right : PlayerSide.Left;

function character(id: number, overrides: Partial<Character> = {}): Character {
  return {
    id, name: `Audit ${id}`, maxHp: 500, hp: 500, attack: 5, armor: 0, magic: 0,
    colors: [BaseColor.Red], manaCost: 10, mana: 10, skillId: 'audit-idle',
    statuses: [], defeated: false, ...overrides,
  };
}

function stableBoard(nextId: () => number): BoardModel {
  const board = new BoardModel();
  const palette = [BaseColor.Green, BaseColor.Blue, BaseColor.Yellow, BaseColor.Purple];
  for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
    board.set({ row, col }, { id: nextId(), type: colorGem(palette[(row + col) % 4]!) });
  }
  return board;
}

function registryWith(prototypes: Record<string, SkillPrototype> = {}): ExtensionRegistry {
  const registry = new ExtensionRegistry();
  registerSkillLibrary(registry.prototypes);
  registry.prototypes.set('audit-idle', { segments: [dmg('enemyFront', 0, 0)] });
  for (const [id, prototype] of Object.entries(prototypes)) registry.prototypes.set(id, prototype);
  return registry;
}

function harness(options: {
  audit?: boolean;
  active?: PlayerSide;
  left?: Character[];
  right?: Character[];
  registry?: ExtensionRegistry;
  layout?: (board: BoardModel, gem: (type: GemType) => { id: number; type: GemType }) => void;
  configure?: (engine: TurnEngine) => void;
} = {}) {
  let gid = 1000;
  const id = () => gid++;
  const board = stableBoard(id);
  options.layout?.(board, type => ({ id: id(), type }));
  const state = createGameState(board,
    { player: PlayerSide.Left, characters: options.left ?? [character(0)] },
    { player: PlayerSide.Right, characters: options.right ?? [character(4)] },
    options.active ?? PlayerSide.Left);
  const rng = new SeededRNG(11);
  const registry = options.registry ?? registryWith();
  const engine = new TurnEngine(state, rng, id, registry, engine => {
    engine.skullChance = 0;
    if (options.audit !== false) engine.enableEconomyAudit();
    options.configure?.(engine);
  });
  return { board, state, rng, engine, registry, initial: engine.takeInitialEvents() };
}

function balances(state: GameState): BattleEconomyBalances {
  return { leftGold: state.economy.gold, rightGold: state.enemyGold ?? 0,
    souls: state.economy.souls, gems: state.economy.gems, maps: state.economy.maps };
}

/** Reconcile public output against every actual pool, independently of the writer helpers. */
function checkedAudit(state: GameState): BattleEconomyAudit {
  const audit = exportBattleEconomyAudit(state);
  expect(audit).toBeDefined();
  if (!audit) throw new Error('Expected an enabled economy audit');
  const running = { ...audit.initial };
  audit.entries.forEach((entry, index) => {
    const key = entry.currency === 'gold'
      ? entry.account === PlayerSide.Left ? 'leftGold' : 'rightGold'
      : entry.currency;
    expect(entry.sequence).toBe(index + 1);
    if (entry.currency === 'gold') expect([PlayerSide.Left, PlayerSide.Right]).toContain(entry.account);
    else expect(entry.account).toBe('shared');
    expect(entry.before).toBe(running[key]);
    expect(entry.after - entry.before).toBe(entry.delta);
    running[key] += entry.delta;
  });
  expect(running).toEqual(audit.final);
  expect(audit.final).toEqual(balances(state));
  return audit;
}

function snapshot(externalId: string, skillId: string, traitIds?: string[]): CombatantSnapshot {
  return { externalId, name: externalId, skillId, traitIds,
    stats: { hp: 500, attack: 5, armor: 0, magic: 0 }, manaCost: 10, manaColors: [BaseColor.Red] };
}

function request(playerTeam: CombatantSnapshot[], enemyTeam: CombatantSnapshot[], seed = 11): BattleRequest {
  return { schemaVersion: BATTLE_SCHEMA_VERSION, rulesetVersion: RULESET_VERSION,
    battleId: 'economy-engine-audit', requestId: 'economy-engine-audit-request', seed, playerTeam, enemyTeam };
}

function combatSnapshot(state: GameState) {
  return { ...state, economyAudit: undefined,
    board: Array.from({ length: 8 }, (_, row) => Array.from({ length: 8 }, (_, col) => state.board.get({ row, col }))) };
}

describe('economy audit through public engine actions', () => {
  it.each([PlayerSide.Left, PlayerSide.Right])('credits the non-acting %s pickpocket holder, event and ledger actor', holderSide => {
    const actorSide = other(holderSide);
    const holderId = holderSide === PlayerSide.Left ? 0 : 4;
    const f = harness({ active: actorSide,
      left: [character(0, { traitIds: holderSide === PlayerSide.Left ? ['pickpocket'] : [] })],
      right: [character(4, { traitIds: holderSide === PlayerSide.Right ? ['pickpocket'] : [] })],
      layout(board, gem) {
        board.set({ row: 7, col: 0 }, gem(skullGem()));
        board.set({ row: 7, col: 2 }, gem(skullGem()));
        board.set({ row: 6, col: 1 }, gem(skullGem()));
      },
    });
    expect(f.state.activePlayer).toBe(actorSide);
    const events = f.engine.resolveAction({ type: 'swap', from: { row: 7, col: 1 }, to: { row: 6, col: 1 } });
    expect(events).toContainEqual(expect.objectContaining({ type: 'skull-damage', targetId: holderId, hpLoss: 5 }));
    expect(events.filter(e => e.type === 'economy-gain')).toEqual([
      { type: 'economy-gain', currency: 'gold', amount: 10, side: holderSide },
    ]);
    expect(balances(f.state)).toEqual({ ...ZERO, [holderSide === PlayerSide.Left ? 'leftGold' : 'rightGold']: 10 });
    expect(checkedAudit(f.state).entries).toEqual([expect.objectContaining({
      source: 'trait', currency: 'gold', operation: 'gain', side: holderSide, account: holderSide,
      actorId: holderId, requested: 10, before: 0, after: 10, delta: 10,
    })]);
  });

  it('records construction-time match economy before initial events are consumed, exactly once', () => {
    const f = harness({ left: [character(0, { traitIds: ['omenofdeath', 'greedy'] })],
      layout(board, gem) {
        board.set({ row: 0, col: 7 }, gem(skullGem()));
        for (let col = 0; col < 4; col++) board.set({ row: 7, col }, gem(colorGem(BaseColor.Blue)));
        board.set({ row: 7, col: 4 }, gem(colorGem(BaseColor.Green)));
      },
    });
    expect(f.state.actionLog).toEqual([]);
    expect(f.initial.some(e => e.type === 'gem-explode')).toBe(true);
    expect(f.initial.filter(e => e.type === 'economy-gain')).toContainEqual({ type: 'economy-gain', currency: 'gold', amount: 4, side: PlayerSide.Left });
    const audit = checkedAudit(f.state);
    expect(audit.initial).toEqual(ZERO);
    expect(audit.entries).toContainEqual(expect.objectContaining({ source: 'match', actionIndex: 0, delta: 4 }));
    expect(audit.entries).toContainEqual(expect.objectContaining({ source: 'trait', actionIndex: 0, delta: 2 }));
    expect(f.engine.takeInitialEvents()).toEqual([]);
    f.engine.enableEconomyAudit();
    enableBattleEconomyAudit(f.state);
    expect(checkedAudit(f.state)).toEqual(audit);
  });

  it.each([PlayerSide.Left, PlayerSide.Right])('records actual Booty destruction by a %s spell', side => {
    const registry = registryWith({ 'audit-booty': { segments: [explodeAt(CELL)] } });
    const f = harness({ active: side, registry,
      left: [character(0, { skillId: 'audit-booty' })], right: [character(4, { skillId: 'audit-booty' })],
      layout(board, gem) { board.set({ row: 0, col: 0 }, gem(specialGem('bootyGem'))); },
    });
    f.engine.setCellChooser({ choose: () => ({ row: 0, col: 0 }) });
    const events = f.engine.resolveAction({ type: 'cast', characterId: side === PlayerSide.Left ? 0 : 4 });
    expect(events).toContainEqual(expect.objectContaining({ type: 'special-gem-trigger', kind: 'bootyGem' }));
    expect(events).toContainEqual({ type: 'economy-gain', currency: 'gold', amount: 10, side });
    expect(checkedAudit(f.state).entries.filter(e => e.source === 'booty-gem')).toEqual([
      expect.objectContaining({ side, account: side, currency: 'gold', delta: 10 }),
    ]);
    expect(balances(f.state)[side === PlayerSide.Left ? 'rightGold' : 'leftGold']).toBe(0);
  });

  it.each(['destroy', 'remove'] as const)('uses the explicit destruction owner and preserves %s semantics', mode => {
    const f = harness();
    const pos = { row: 0, col: 0 };
    f.board.set(pos, null);
    const events: GameEvent[] = [];
    // The public clear-settlement boundary accepts already removed gems, as the skill pipe does.
    f.engine.resolveBoardChange([{ pos, gemType: specialGem('bootyGem') }], events, PlayerSide.Right, mode);
    const gains = events.filter(e => e.type === 'economy-gain');
    const booty = checkedAudit(f.state).entries.filter(e => e.source === 'booty-gem');
    if (mode === 'destroy') {
      expect(gains).toContainEqual({ type: 'economy-gain', currency: 'gold', amount: 10, side: PlayerSide.Right });
      expect(booty).toEqual([expect.objectContaining({ account: PlayerSide.Right, side: PlayerSide.Right, delta: 10 })]);
    } else {
      expect(gains).toEqual([]);
      expect(events.some(e => e.type === 'special-gem-trigger')).toBe(false);
      expect(booty).toEqual([]);
      expect(balances(f.state)).toEqual(ZERO);
    }
  });

  it('records PvP terminal grants beyond the multiplied cap once, without inventing gain events', () => {
    registerDynamicTraits(PVP_DYNAMIC_DEFS);
    const registry = registryWith({
      'audit-cap': { segments: [gainGold(900), gainGold(1)] },
      'audit-finish': { segments: [dmg('enemyFront', 10000, 0)] },
    });
    const f = harness({ registry,
      left: [character(0, { skillId: 'audit-cap', traitIds: ['merchant', 'bloodandglory'] }), character(1, { skillId: 'audit-finish' })],
      configure(engine) { engine.pvpMode = true; },
    });
    f.engine.resolveAction({ type: 'cast', characterId: 0 });
    expect(f.state.economy.gold).toBe(625);
    expect(checkedAudit(f.state).entries).toContainEqual(expect.objectContaining({ source: 'skill-gain', requested: 1, before: 625, after: 625, delta: 0, cap: 625, multiplier: 1.25 }));
    f.engine.passTurn();
    const terminal = f.engine.resolveAction({ type: 'cast', characterId: 1 });
    expect(f.state.winner).toBe(PlayerSide.Left);
    expect(f.state.economy.gold).toBe(626);
    expect(terminal.filter(e => e.type === 'economy-gain')).toEqual([]);
    const audit = checkedAudit(f.state);
    expect(audit.entries.filter(e => e.source === 'pvp-bonus')).toEqual([
      expect.objectContaining({ currency: 'gold', operation: 'bonus', side: PlayerSide.Left, account: PlayerSide.Left, actorId: 0, before: 625, after: 626, delta: 1 }),
    ]);
    expect(f.engine.passTurn()).toEqual([]);
    expect(f.engine.surrender(PlayerSide.Left)).toEqual([]);
    expect(checkedAudit(f.state)).toEqual(audit);
  });

  it.each([PlayerSide.Left, PlayerSide.Right])('surrender by %s forfeits only player/shared pools and retains enemy Gold', side => {
    const registry = registryWith({
      'audit-fund': { segments: [gainGold(20), gainSouls(7), gainGems(3), gainMaps(2)] },
      'audit-enemy-fund': { segments: [gainGold(17)] },
    });
    const f = harness({ registry, left: [character(0, { skillId: 'audit-fund' })], right: [character(4, { skillId: 'audit-enemy-fund' })],
      configure(engine) { engine.pvpMode = true; },
    });
    f.engine.resolveAction({ type: 'cast', characterId: 0 });
    f.engine.resolveAction({ type: 'cast', characterId: 4 });
    expect(balances(f.state)).toEqual({ leftGold: 20, rightGold: 17, souls: 7, gems: 3, maps: 2 });
    expect(f.engine.surrender(side)).toEqual([{ type: 'game-over', winner: other(side), reason: 'surrender' }]);
    expect(balances(f.state)).toEqual({ ...ZERO, rightGold: 17 });
    const audit = checkedAudit(f.state);
    expect(audit.entries.filter(e => e.source === 'surrender').map(e => ({ currency: e.currency, account: e.account, side: e.side, operation: e.operation, delta: e.delta }))).toEqual([
      { currency: 'gold', account: PlayerSide.Left, side, operation: 'forfeit', delta: -20 },
      { currency: 'souls', account: 'shared', side, operation: 'forfeit', delta: -7 },
      { currency: 'gems', account: 'shared', side, operation: 'forfeit', delta: -3 },
      { currency: 'maps', account: 'shared', side, operation: 'forfeit', delta: -2 },
    ]);
    expect(audit.entries.some(e => e.source === 'pvp-bonus')).toBe(false);
    expect(f.engine.surrender(side)).toEqual([]);
    expect(checkedAudit(f.state)).toEqual(audit);
  });
});

/** A complete session uses real 9783 immediate theft and 8087 deferred native spell chains. */
function nativeBattle(audit: boolean, side: PlayerSide) {
  const mine = [snapshot('fund', 'audit-fund'), snapshot('immediate', '9783'), snapshot('deferred', '8087'), snapshot('finish', 'audit-spend-finish')];
  const enemy = [snapshot('opponent', 'audit-enemy-fund')];
  const input = request(side === PlayerSide.Left ? mine : enemy, side === PlayerSide.Left ? enemy : mine);
  const teams = mapRequestToTeams(input);
  for (const team of [teams.playerTeam, teams.enemyTeam]) for (const char of team.characters) char.mana = char.manaCost;
  let gid = 1000;
  const id = () => gid++;
  const board = stableBoard(id);
  const state = createGameState(board, teams.playerTeam, teams.enemyTeam, side);
  const rng = new SeededRNG(input.seed);
  const registry = registryWith({
    'audit-fund': { segments: [gainGold(20), gainSouls(7), gainGems(3), gainMaps(2)] },
    'audit-enemy-fund': { segments: [gainGold(30)] },
    'audit-spend-finish': { segments: [spendGold(), dmg('enemyFront', 1000, 0, {
      modifier: { mod: { kind: 'multiplier', a: 1 }, source: { kind: 'goldSpent' } },
    })] },
  });
  const engine = new TurnEngine(state, rng, id, registry, engine => {
    engine.skullChance = 0;
    if (audit) engine.enableEconomyAudit();
  });
  engine.setTargetChooser({ choose: () => side === PlayerSide.Left ? 4 : 0 });
  const session = new BattleSession({ request: input, idMap: teams.idMap, engine });
  const cast = (externalId: string) => {
    const internalId = teams.idMap.internalIdOf(externalId)!;
    const owner = externalId === 'opponent' ? other(side) : side;
    if (state.activePlayer !== owner) session.passTurn();
    expect(state.activePlayer).toBe(owner);
    const events = session.resolve({ type: 'cast', characterId: internalId });
    expect(events.some(e => e.type === 'skill-cast')).toBe(true);
    return events;
  };
  cast('fund');
  cast('opponent');
  const immediate = cast('immediate');
  const afterImmediate = balances(state);
  const deferred = cast('deferred');
  const afterDeferred = balances(state);
  const terminal = cast('finish');
  expect(session.isFinished()).toBe(true);
  const result = session.buildResult();
  expect(session.buildResult()).toBe(result);
  return { state, rng: rng.getState(), events: session.recordedEvents(), result, immediate, deferred, terminal, afterImmediate, afterDeferred, teams };
}

describe('native spell chains, reconciliation and audit transparency', () => {
  it.each([PlayerSide.Left, PlayerSide.Right])('preserves full %s session events, RNG and balances with auditing enabled', side => {
    const baseline = nativeBattle(false, side);
    const audited = nativeBattle(true, side);
    expect(exportBattleEconomyAudit(baseline.state)).toBeUndefined();
    expect(baseline.result.economyAudit).toBeUndefined();
    expect(audited.events).toEqual(baseline.events);
    expect(audited.rng).toBe(baseline.rng);
    expect(combatSnapshot(audited.state)).toEqual(combatSnapshot(baseline.state));
    const { economyAudit, ...auditedResult } = audited.result;
    expect(auditedResult).toEqual(baseline.result);
    const audit = checkedAudit(audited.state);
    expect(economyAudit).toEqual(audit);
    expect(audit.initial).toEqual(ZERO);
    expect(audited.afterImmediate).toEqual({ leftGold: 25, rightGold: 25, souls: 7, gems: 3, maps: 2 });
    expect(audited.afterDeferred).toEqual({ ...ZERO, [side === PlayerSide.Left ? 'leftGold' : 'rightGold']: 50, souls: 7, gems: 3, maps: 2 });
    expect(audit.final).toEqual({ ...ZERO, souls: 7, gems: 3, maps: 2 });
    const immediateActor = audited.teams.idMap.internalIdOf('immediate');
    const deferredActor = audited.teams.idMap.internalIdOf('deferred');
    const finishActor = audited.teams.idMap.internalIdOf('finish');
    const immediateEntries = audit.entries.filter(e => e.actorId === immediateActor);
    expect(immediateEntries).toEqual([
      expect.objectContaining({ source: 'skill-theft', operation: 'steal-debit', side, account: other(side), delta: -5 }),
      expect.objectContaining({ source: 'skill-theft', operation: 'steal-credit', side, account: side, delta: 5 }),
    ]);
    expect(immediateEntries[1]!.transferId).toBe(immediateEntries[0]!.sequence);
    expect(audit.entries.filter(e => e.actorId === deferredActor)).toEqual([
      expect.objectContaining({ source: 'skill-theft', operation: 'steal-debit', side, account: other(side), delta: -25 }),
      expect.objectContaining({ source: 'skill-gain', operation: 'gain', side, account: side, delta: 25 }),
    ]);
    expect(audited.deferred.filter(e => e.type === 'skill-damage').map(e => e.damage)).toEqual([27]);
    const deferredDamageIndex = audited.deferred.findIndex(e => e.type === 'skill-damage');
    const deferredGainIndex = audited.deferred.findIndex(e => e.type === 'economy-gain');
    expect(deferredGainIndex).toBeGreaterThan(deferredDamageIndex);
    expect(audit.entries.filter(e => e.actorId === finishActor)).toEqual([
      expect.objectContaining({ source: 'skill-spend', operation: 'spend', side, account: side, requested: 50, delta: -50 }),
    ]);
    expect(audited.terminal.filter(e => e.type === 'skill-damage').map(e => e.damage)).toEqual([1050]);
    expect(audit.entries.filter(e => e.currency !== 'gold').map(e => [e.currency, e.account, e.side, e.delta])).toEqual([
      ['souls', 'shared', side, 7], ['gems', 'shared', side, 3], ['maps', 'shared', side, 2],
    ]);
  });

  it('exports detached entries and detects an unrecorded balance write', () => {
    const f = nativeBattle(true, PlayerSide.Left);
    const original = checkedAudit(f.state);
    const detached = checkedAudit(f.state);
    detached.entries[0]!.after = 999999;
    detached.final.gems = 999999;
    expect(checkedAudit(f.state)).toEqual(original);
    // Inject a missed write into a disposable copy, never into the running engine.
    const missedWrite = { ...f.state, economy: { ...f.state.economy, gems: f.state.economy.gems + 1 } };
    expect(() => exportBattleEconomyAudit(missedWrite)).toThrow('流水遗漏余额变更');
    expect(checkedAudit(f.state)).toEqual(original);
  });
});

function stRequest(): BattleRequest {
  const input = request([snapshot('hero', 'gw_KnightsSword', ['omenofdeath'])], [snapshot('enemy', 'gw_KnightsSword')], 20261022);
  input.playerTeam[0]!.stats = { hp: 120, attack: 9, armor: 0, magic: 9 };
  input.enemyTeam[0]!.stats = { hp: 75, attack: 6, armor: 0, magic: 4 };
  input.playerTeam[0]!.manaCost = 3;
  input.enemyTeam[0]!.manaCost = 3;
  return input;
}

function stBattle(audit: boolean, openingMatch = 4, complete = true) {
  const input = stRequest();
  // Real preparation and its availability gate run for both comparison arms.
  const runtime = prepareStBattle(input);
  const teams = mapRequestToTeams(input);
  const rng = new SeededRNG(input.seed);
  let gid = 1000;
  const id = () => gid++;
  const board = new BoardGenerator(rng, id).generate();
  const opening = stableBoard(id);
  for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) board.set({ row, col }, opening.get({ row, col }));
  board.set({ row: 0, col: 7 }, { id: id(), type: skullGem() });
  for (let col = 0; col < openingMatch; col++) board.set({ row: 7, col }, { id: id(), type: colorGem(BaseColor.Blue) });
  board.set({ row: 7, col: openingMatch }, { id: id(), type: colorGem(BaseColor.Green) });
  const state = createGameState(board, teams.playerTeam, teams.enemyTeam);
  let configuredBeforeOpening = false;
  const engine = new TurnEngine(state, rng, id, runtime.registry, engine => {
    runtime.configureEngine(engine);
    expect(exportBattleEconomyAudit(state)).toEqual({ version: 1, initial: ZERO, final: ZERO, entries: [] });
    configuredBeforeOpening = true;
    // ST always opts in. Remove only its still-empty audit to model the previous
    // unaudited runtime; retain the real preparation, rules, resolvers and balances.
    if (!audit) delete state.economyAudit;
  });
  const session = new BattleSession({ request: input, engine, idMap: teams.idMap });
  const initial = [...session.recordedEvents()];
  expect(configuredBeforeOpening).toBe(true);
  expect(initial.some(e => e.type === 'gem-explode')).toBe(true);
  expect(initial).toContainEqual(expect.objectContaining({
    type: 'elimination',
    shape: 'line4plus',
    cells: Array.from({ length: openingMatch }, (_, col) => expect.objectContaining({
      pos: { row: 7, col }, gemType: colorGem(BaseColor.Blue),
    })),
  }));
  if (complete) {
    for (let step = 0; step < 300 && !session.isFinished(); step++) {
      const choice = chooseAiAction({ state, side: state.activePlayer, rng, registry: runtime.registry });
      if (!choice || !session.resolve(choice.action).length) session.passTurn();
    }
    expect(session.isFinished()).toBe(true);
  }
  return { state, initial, events: [...session.recordedEvents()], rng: rng.getState(), result: complete ? session.buildResult() : undefined };
}

describe('ST native opening economy and audit transparency', () => {
  it.each([4, 5])('audits native opening %i-match Gold before the first action', length => {
    const f = stBattle(true, length, false);
    const gains=f.initial.filter(e=>e.type==='economy-gain');
    expect(gains).toContainEqual(expect.objectContaining({currency:'gold',amount:length>=5?5:4}));
    const audit=checkedAudit(f.state);
    expect(audit.initial).toEqual(ZERO);
    expect(audit.final.leftGold+audit.final.rightGold).toBeGreaterThanOrEqual(length>=5?5:4);
    expect(audit.entries.some(entry=>entry.source==='match')).toBe(true);
  });

  it('preserves a complete legal ST battle, including opening events, RNG, balances and final result', () => {
    const baseline = stBattle(false);
    const audited = stBattle(true);
    expect(exportBattleEconomyAudit(baseline.state)).toBeUndefined();
    expect(audited.initial).toEqual(baseline.initial);
    expect(audited.events).toEqual(baseline.events);
    expect(audited.rng).toBe(baseline.rng);
    expect(combatSnapshot(audited.state)).toEqual(combatSnapshot(baseline.state));
    expect(audited.result).toBeDefined();
    const { economyAudit, ...result } = audited.result!;
    expect(result).toEqual(baseline.result);
    expect(economyAudit).toEqual(checkedAudit(audited.state));
    expect(economyAudit!.entries.some(entry=>entry.source==='match')).toBe(true);
    expect(economyAudit!.final).toEqual(balances(audited.state));
  });

  it.each(['st:7037', '7037', 'gw_SkeletonKey'])('accepts the native economic ability %s before constructing a battle', skillId => {
    const input = stRequest();
    input.playerTeam[0]!.skillId = skillId;
    const before = structuredClone(input);
    expect(() => prepareStBattle(input)).not.toThrow();
    expect(input).toEqual(before);
  });

  it.each(['soulverdict', 'st:soulverdict', 'goldenhoard', 'st:goldenhoard'])('accepts the native economic trait %s', traitId => {
    const input = stRequest();
    input.playerTeam[0]!.traitIds = [traitId];
    const before = structuredClone(input);
    expect(() => prepareStBattle(input)).not.toThrow();
    expect(input).toEqual(before);
  });
});
