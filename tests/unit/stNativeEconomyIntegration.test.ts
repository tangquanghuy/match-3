import {describe, expect, it} from 'vitest';
import {BoardModel} from '../../src/engine/BoardModel';
import {createGameState} from '../../src/engine/GameState';
import {TurnEngine} from '../../src/engine/TurnEngine';
import {SeededRNG} from '../../src/engine/rng';
import {BaseColor, PlayerSide, colorGem} from '../../src/engine/types';
import {FixedColorChooser} from '../../src/engine/skills/colorChooser';
import {FixedTargetChooser} from '../../src/engine/skills/targetChooser';
import type {GameEvent} from '../../src/engine/events';
import {BattleSession} from '../../src/session/BattleSession';
import {mapRequestToTeams} from '../../src/session/combatantMapping';
import {BATTLE_SCHEMA_VERSION, RULESET_VERSION} from '../../src/session/contract';
import type {BattleRequest, CombatantSnapshot} from '../../src/session/contract';
import {prepareStBattle} from '../../src/sillytavern/battleRuntime';
import {compileEnemyBlueprint} from '../../src/sillytavern/enemyBlueprint';
import {PORTRAITS, savePortrait} from '../../src/sillytavern/portraits';
import {beginReplay, completeReplay, createSave, emptyRoot, recordEncounter, settleSave, validateSave} from '../../src/sillytavern/save';

// Independent literals from troops.json and the native spell descriptions, not adaptedPrototype.
// Level 20, difficulty 1. These are mechanism samples, not whole-source acceptance credit.
const SOURCE = {
  6005: {spell: 7005, magic: 13, cost: 10, traits: ['merchant', 'firelink', 'alert']},
  6093: {spell: 7163, magic: 9, cost: 10, traits: ['humanbond', 'merchant', 'alert']},
  6062: {spell: 7062, magic: 5, cost: 10, traits: ['divinebond', 'waterheart', 'waterlink']},
  6310: {spell: 7460, magic: 8, cost: 16, traits: ['ogrefury', 'huge', 'pillageandplunder']},
  6353: {spell: 7505, magic: 10, cost: 11, traits: ['roguebond', 'greedy', 'stealthy']},
  6717: {spell: 8087, magic: 12, cost: 13, traits: ['greedy', 'fast', 'agile']},
} as const;
type SourceId = keyof typeof SOURCE;
const SIDES = [PlayerSide.Left, PlayerSide.Right] as const;
const other = (side: PlayerSide) => side === PlayerSide.Left ? PlayerSide.Right : PlayerSide.Left;

function source(id: SourceId, externalId: string) {
  const portrait = PORTRAITS.find(p => p.troopId === id)!;
  const bp = compileEnemyBlueprint({
    portrait: savePortrait({manaColors: portrait.manaColors, rank: portrait.rank, form: portrait.form, role: portrait.role}, portrait),
    externalId, level: 20, difficulty: 1,
  });
  expect(bp.snapshot).toMatchObject({skillId: `st:${SOURCE[id].spell}`, manaCost: SOURCE[id].cost, stats: {magic: SOURCE[id].magic}});
  expect(bp.snapshot.traitIds).toEqual(SOURCE[id].traits.map(code => `st:${code}`));
  return bp;
}
function dummy(externalId: string): CombatantSnapshot {
  return {externalId, name: externalId, stats: {hp: 1000, armor: 0, attack: 0, magic: 0}, manaColors: [BaseColor.Blue], manaCost: 99, skillId: 'gw_KnightsSword'};
}
function quietBoard() {
  const board = new BoardModel();
  // No skulls, Yellow or Blue. Replacing Purple with either output color preserves
  // the layout, isolating a real transformation from incidental cascades.
  const colors = [BaseColor.Red, BaseColor.Green, BaseColor.Purple, BaseColor.Brown];
  for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
    board.set({row, col}, {id: row * 8 + col, type: colorGem(colors[(row * 2 + col) % 4]!)});
  }
  return board;
}
function request(playerTeam: CombatantSnapshot[], enemyTeam: CombatantSnapshot[], seed = 7): BattleRequest {
  return {schemaVersion: BATTLE_SCHEMA_VERSION, rulesetVersion: RULESET_VERSION,
    battleId: 'st-native-economy', requestId: 'st-native-economy-request', seed, playerTeam, enemyTeam};
}
function battle(input: BattleRequest, board = quietBoard(), native = false) {
  const runtime = prepareStBattle(input);
  const mapped = mapRequestToTeams(input);
  const state = createGameState(board, mapped.playerTeam, mapped.enemyTeam);
  const rng = new SeededRNG(input.seed);
  let nextId = 1000;
  const engine = new TurnEngine(state, rng, () => nextId++, runtime.registry,
    native ? engine => engine.enableEconomyAudit() : runtime.configureEngine);
  const session = new BattleSession({request: input, idMap: mapped.idMap, engine});
  const unit = (externalId: string) => {
    const id = mapped.idMap.internalIdOf(externalId);
    return [...state.teams[PlayerSide.Left].characters, ...state.teams[PlayerSide.Right].characters].find(c => c.id === id)!;
  };
  const turn = (side: PlayerSide) => {
    if (state.activePlayer !== side) session.passTurn();
    expect(state.activePlayer).toBe(side);
    expect(session.isFinished()).toBe(false);
  };
  const cast = (side: PlayerSide, externalId: string, targetId?: string, color = BaseColor.Purple) => {
    turn(side);
    const caster = unit(externalId);
    // Only Mana is primed. All economy, damage, casualties and winner changes
    // must come from accepted BattleSession actions and original source recipes.
    caster.mana = caster.manaCost;
    engine.setColorChooser(new FixedColorChooser(color));
    if (targetId) engine.setTargetChooser(new FixedTargetChooser(unit(targetId).id));
    const before = state.actionLog.length;
    const events = session.resolve({type: 'cast', characterId: caster.id});
    expect(events.length).toBeGreaterThan(0);
    expect(state.actionLog).toHaveLength(before + 1);
    expect(caster.mana).toBe(0);
    return events;
  };
  return {request: input, state, engine, session, unit, turn, cast};
}
function oriented(side: PlayerSide, subjects: CombatantSnapshot[], opponents: CombatantSnapshot[], seed = 7) {
  return battle(side === PlayerSide.Left ? request(subjects, opponents, seed) : request(opponents, subjects, seed));
}
function balances(run: ReturnType<typeof battle>) {
  return {left: run.state.economy.gold, right: run.state.enemyGold ?? 0};
}
function expectedGold(side: PlayerSide, own: number, enemy = 0) {
  return side === PlayerSide.Left ? {left: own, right: enemy} : {left: enemy, right: own};
}
function goldEvents(events: readonly GameEvent[]) {
  return events.filter(e => e.type === 'economy-gain' && e.currency === 'gold');
}
function damages(events: readonly GameEvent[]) {
  return events.filter(e => e.type === 'skill-damage').map(e => e.damage);
}

describe('ST native in-battle economy through real source sessions', () => {
  for (const side of SIDES) {
    it.each([
      {id: 6005 as const, raw: 16, credited: 20},
      {id: 6093 as const, raw: 14, credited: 17},
    ])(`source $id generates Gold on ${side}, including native Merchant rounding`, ({id, raw, credited}) => {
      const run = oriented(side, [source(id, 'producer').snapshot], [dummy('target')]);
      expect(balances(run)).toEqual({left: 0, right: 0});
      const events = run.cast(side, 'producer');
      expect(goldEvents(events)).toEqual([{type: 'economy-gain', currency: 'gold', amount: credited, side}]);
      expect(balances(run)).toEqual(expectedGold(side, credited));
      expect(run.state.economyAudit!.entries).toEqual([expect.objectContaining({
        source: 'skill-gain', side, account: side, currency: 'gold', requested: raw,
        before: 0, after: credited, delta: credited, multiplier: 1.25, cap: 625,
      })]);
      expect(run.state.economy.souls).toBe(0);
    });

    it(`source 6062 keeps native Souls shared and attributes its gain to ${side}`, () => {
      const run = oriented(side, [source(6062, 'valkyrie').snapshot], [dummy('target')]);
      const events = run.cast(side, 'valkyrie');
      expect(events.filter(e => e.type === 'economy-gain')).toEqual([{type: 'economy-gain', currency: 'souls', amount: 6, side}]);
      expect(balances(run)).toEqual({left: 0, right: 0});
      expect(run.state.economy.souls).toBe(6);
      expect(run.state.economyAudit!.entries).toEqual([expect.objectContaining({
        source: 'skill-gain', currency: 'souls', account: 'shared', side, requested: 6, delta: 6,
      })]);
    });

    it.each([
      {supplyCasts: 0, supplied: 0, stolen: 0, damage: 14},
      {supplyCasts: 1, supplied: 17, stolen: 17, damage: 31},
      {supplyCasts: 3, supplied: 51, stolen: 50, damage: 64},
      {supplyCasts: 4, supplied: 68, stolen: 50, damage: 64},
    ])(`source 6717 on ${side}: steal from real supply $supplied, then boost damage and credit`, ({supplyCasts, supplied, stolen, damage}) => {
      const run = oriented(side, [source(6717, 'jack').snapshot], [source(6093, 'finley').snapshot, dummy('target')]);
      for (let n = 0; n < supplyCasts; n++) run.cast(other(side), 'finley');
      expect(balances(run)).toEqual(expectedGold(side, 0, supplied));
      const before = run.state.economyAudit!.entries.length;
      const events = run.cast(side, 'jack', 'target');
      expect(damages(events)).toEqual([damage]);
      expect(run.unit('target').hp).toBe(1000 - damage);
      expect(balances(run)).toEqual(expectedGold(side, stolen, supplied - stolen));
      if (stolen === 0) {
        expect(goldEvents(events)).toEqual([]);
        expect(run.state.economyAudit!.entries.slice(before)).toEqual([]);
      } else {
        expect(goldEvents(events)).toEqual([{type: 'economy-gain', currency: 'gold', amount: stolen, side}]);
        expect(events.findIndex(e => e.type === 'skill-damage')).toBeLessThan(events.findIndex(e => e.type === 'economy-gain'));
        expect(run.state.economyAudit!.entries.slice(before)).toEqual([
          expect.objectContaining({source: 'skill-theft', operation: 'steal-debit', side, account: other(side), before: supplied, after: supplied - stolen, delta: -stolen}),
          expect.objectContaining({source: 'skill-gain', account: side, side, before: 0, after: stolen, delta: stolen}),
        ]);
      }
    });

    it.each([
      {seed: 7, supply: false, initial: 0, final: 0, damage: 12, branch: 'empty-spend'},
      {seed: 7, supply: true, initial: 17, final: 0, damage: 29, branch: 'spend'},
      {seed: 1, supply: true, initial: 17, final: 117, damage: 12, branch: 'gain'},
    ])(`source 6310 on ${side}: native $branch branch consumes its own supply or generates 80 base Gold`, ({seed, supply, initial, final, damage, branch}) => {
      const run = oriented(side, [source(6093, 'finley').snapshot, source(6310, 'gog').snapshot], [dummy('target')], seed);
      if (supply) run.cast(side, 'finley');
      expect(balances(run)).toEqual(expectedGold(side, initial));
      const before = run.state.economyAudit!.entries.length;
      const events = run.cast(side, 'gog', 'target');
      expect(damages(events)).toEqual([damage]);
      expect(run.unit('target').hp).toBe(1000 - damage);
      expect(balances(run)).toEqual(expectedGold(side, final));
      expect(run.state.economyAudit!.entries.slice(before)).toEqual([expect.objectContaining(
        branch === 'gain'
          ? {source: 'skill-gain', side, account: side, requested: 80, before: 17, after: 117, delta: 100, multiplier: 1.25}
          : {source: 'skill-spend', operation: 'spend', side, account: side, requested: initial, before: initial, after: 0, delta: initial === 0 ? 0 : -initial},
      )]);
    });

    it(`rejects an underfunded Mana cast on ${side} without fabricating Gold or audit entries`, () => {
      const run = oriented(side, [source(6005, 'alchemist').snapshot], [dummy('target')]);
      run.turn(side);
      const caster = run.unit('alchemist');
      caster.mana = 9;
      const before = structuredClone({log: run.state.actionLog, audit: run.state.economyAudit, events: run.session.recordedEvents()});
      expect(run.session.resolve({type: 'cast', characterId: caster.id})).toEqual([]);
      expect({log: run.state.actionLog, audit: run.state.economyAudit, events: run.session.recordedEvents()}).toEqual(before);
      expect(caster.mana).toBe(9);
      expect(balances(run)).toEqual({left: 0, right: 0});
    });
  }
});

function matchBoard(length: number) {
  const board = quietBoard();
  for (let col = 0; col < length; col++) board.set({row: 0, col}, {id: col, type: colorGem(col === 1 ? BaseColor.Red : BaseColor.Blue)});
  board.set({row: 0, col: length}, {id: length, type: colorGem(BaseColor.Red)});
  board.set({row: 1, col: 1}, {id: 9, type: colorGem(BaseColor.Blue)});
  return board;
}
describe('ST restores native automatic four/five-match Gold', () => {
  for (const side of SIDES) {
    it.each([3, 4, 5])(`real swap on ${side}, length %i: ST matches native rewards plus source 6353 Greedy`, length => {
      const bandit = source(6353, 'bandit').snapshot;
      const input = side === PlayerSide.Left ? request([bandit], [dummy('target')], 20261022) : request([dummy('target')], [bandit], 20261022);
      const play = (native: boolean) => {
        const run = battle(input, matchBoard(length), native);
        run.turn(side);
        const events = run.session.resolve({type: 'swap', from: {row: 0, col: 1}, to: {row: 1, col: 1}});
        expect(run.state.actionLog).toHaveLength(1);
        expect(run.session.recordedEvents().length).toBeGreaterThan(0);
        return {run, events};
      };
      const native = play(true);
      const st = play(false);
      const amount = length === 3 ? 0 : length + 2;
      expect(balances(st.run)).toEqual(expectedGold(side, amount));
      expect(st.run.state.economy).toEqual(native.run.state.economy);
      expect(st.events).toEqual(native.events);
      expect(goldEvents(st.events)).toEqual(length === 3 ? [] : [
        {type: 'economy-gain', currency: 'gold', amount: length, side},
        {type: 'economy-gain', currency: 'gold', amount: 2, side},
      ]);
      expect(st.run.state.economyAudit!.entries.filter(e => e.source === 'match')).toEqual(length === 3 ? [] : [expect.objectContaining({account: side, side, requested: length, delta: length})]);
    });
  }
});

function victory(input: BattleRequest) {
  const run = battle(input);
  run.cast(PlayerSide.Right, 'enemy-alchemist'); // 16 base * Merchant 1.25 = 20 Right Gold.
  run.cast(PlayerSide.Left, 'finley'); // floor(14 * Merchant 1.25) = 17 Left Gold.
  run.cast(PlayerSide.Left, 'valkyrie', undefined, BaseColor.Yellow); // Six native shared Souls.
  expect(balances(run)).toEqual({left: 17, right: 20});
  const first = run.cast(PlayerSide.Left, 'jack', 'enemy-alchemist');
  expect(damages(first)).toEqual([34]); // 12 Magic + 2 + 20 actually stolen.
  expect(run.unit('enemy-alchemist')).toMatchObject({hp: 2, armor: 0, defeated: false});
  expect(balances(run)).toEqual({left: 42, right: 0}); // Merchant also multiplies Jack's credit to 25.
  const last = run.cast(PlayerSide.Left, 'jack', 'enemy-alchemist');
  expect(damages(last)).toEqual([14]); // No Gold left to steal; real unboosted killing blow.
  expect(run.session.isFinished()).toBe(true);
  const result = run.session.buildResult();
  expect(result.winner).toBe('player');
  expect(result.defeatedExternalIds).toEqual(['enemy-alchemist']);
  expect(result.economy).toEqual({gold: 42, souls: 6, gems: 0});
  expect(result.economyAudit!.initial).toEqual({leftGold: 0, rightGold: 0, souls: 0, gems: 0, maps: 0});
  expect(result.economyAudit!.final).toEqual({leftGold: 42, rightGold: 0, souls: 6, gems: 0, maps: 0});
  return {...run, result, events: [...run.session.recordedEvents()]};
}
describe('real economic victories settle and replay only fragments plus explicit story grants', () => {
  it.each([false, true])('explicit story grant = %s; native balances never become persistent rewards', explicit => {
    const enemy = source(6005, 'enemy-alchemist');
    const input = request([source(6093, 'finley').snapshot, source(6717, 'jack').snapshot, source(6062, 'valkyrie').snapshot], [enemy.snapshot]);
    const story = victory(input);
    const encounter = recordEncounter(input, [{sourceId: enemy.sourceId, abilityId: enemy.abilityId, abilityName: '炼金术', rank: 0, enemyExternalId: 'enemy-alchemist'}], 'normal', 'economic-encounter');
    const save = createSave(emptyRoot(), {hostId: 'host', characterId: 'hero', chatId: 'economy'}, 'economy-save', 1);
    const fragment = {kind: 'fragment', id: 'enemy:6005', name: '炼金术灵魂碎片', quantity: 1};
    const storyGrant = {kind: 'currency' as const, id: 'gems', name: '宝石', quantity: 5};
    const settlement = {kind: 'story' as const, encounter, request: input, result: story.result, events: story.events, ...(explicit ? {storyGrants: [storyGrant]} : {})};
    const receipt = settleSave(save, settlement);
    expect(receipt.grants).toEqual(explicit ? [fragment, storyGrant] : [fragment]);
    const expectedBalances = explicit ? {'currency:gems': 5} : {};
    expect(save.balances).toEqual(expectedBalances);
    expect(save.sources).toEqual([expect.objectContaining({sourceId: 'enemy:6005', wins: 1})]);
    const afterStory = structuredClone(save);
    expect(settleSave(save, settlement)).toEqual(receipt);
    expect(save).toEqual(afterStory);

    const ticket = beginReplay(save, encounter.id, input.playerTeam, {battleId: 'economic-replay', requestId: 'economic-replay-request'});
    // Reload the durable ticket before actually running the replay session.
    const restored = validateSave(JSON.parse(JSON.stringify(save)));
    expect(restored.pendingReplay).toEqual(ticket);
    const replay = victory(restored.pendingReplay!.request);
    const replayReceipt = completeReplay(restored, replay.result, replay.events);
    expect(replayReceipt.kind).toBe('replay');
    expect(replayReceipt.grants).toEqual([fragment]);
    expect(replayReceipt.result.economy).toEqual({gold: 42, souls: 6, gems: 0});
    expect(restored.balances).toEqual(expectedBalances);
    expect(restored.pendingReplay).toBeUndefined();
    expect(restored.sources).toEqual([expect.objectContaining({sourceId: 'enemy:6005', wins: 2})]);
    expect(restored.settlements).toHaveLength(2);
    const afterReplay = structuredClone(restored);
    expect(completeReplay(restored, replay.result, replay.events)).toEqual(replayReceipt);
    expect(restored).toEqual(afterReplay);
    expect(validateSave(JSON.parse(JSON.stringify(restored)))).toEqual(restored);
    expect(() => completeReplay(restored, {...replay.result, economy: {...replay.result.economy!, gold: 43}}, replay.events)).toThrow();
    expect(restored).toEqual(afterReplay);
  });
});

