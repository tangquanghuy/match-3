import { describe, expect, it } from 'vitest';
import { BoardModel } from '@engine/BoardModel';
import { createGameState } from '@engine/GameState';
import { MatchResolver } from '@engine/MatchResolver';
import { SeededRNG } from '@engine/rng';
import { TurnEngine } from '@engine/TurnEngine';
import {
  BaseColor, PlayerSide, colorGem, specialGem, SPECIAL_MATCH_COLOR, STATUS_GEM_EFFECTS,
} from '@engine/types';
import type { Character, GemType, StatusGemKind } from '@engine/types';
import type { GameEvent } from '@engine/events';

function actor(id: number): Character {
  return {
    id, name: `C${id}`, hp: 1000, maxHp: 1000, attack: 0, armor: 0, magic: 10,
    colors: Object.values(BaseColor), mana: 6, manaCost: 1000, skillId: 'none',
    statuses: [], defeated: false,
  };
}

// Unmatchable filler isolates each special effect from incidental refill matches.
// No engine helpers, random source or cascade resolver are mocked.
function fixture(prepare?: (board: BoardModel, right: Character[]) => void, seed = 1) {
  const board = new BoardModel();
  let nextId = 100;
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      board.set({ row, col }, { id: nextId++, type: specialGem('stoneBlock') });
    }
  }
  const left = [actor(1), actor(2)];
  const right = [actor(11), actor(12)];
  prepare?.(board, right);
  const state = createGameState(board, { player: PlayerSide.Left, characters: left }, {
    player: PlayerSide.Right, characters: right,
  });
  const engine = new TurnEngine(state, new SeededRNG(seed), () => nextId++);
  return { board, state, engine, left, right };
}

type Fixture = ReturnType<typeof fixture>;
type OwnedCase = {
  name: string;
  gem: GemType;
  effect: 'status' | 'mana' | 'drain' | 'wish' | 'gold';
  enemy?: boolean;
  status?: string;
};
const cases: OwnedCase[] = [
  { name: 'angel', gem: specialGem('angelGem'), effect: 'status', status: 'blessed' },
  { name: 'wish', gem: specialGem('wish'), effect: 'wish' },
  { name: 'good gargoyle', gem: specialGem('gargoyleGem', 1), effect: 'status' },
  { name: 'booty', gem: specialGem('bootyGem'), effect: 'gold' },
  { name: 'web', gem: specialGem('web'), effect: 'status', enemy: true, status: 'web' },
  { name: 'evil gargoyle', gem: specialGem('gargoyleGem', 2), effect: 'status', enemy: true },
  { name: 'enchanted', gem: specialGem('enchantedGem'), effect: 'status', status: 'enchanted' },
  { name: 'lycanthropy', gem: specialGem('lycanthropyGem'), effect: 'status', enemy: true, status: 'lycanthropy' },
  { name: 'spirit', gem: specialGem('spiritGem', undefined, BaseColor.Purple), effect: 'drain', enemy: true },
  { name: 'candy', gem: specialGem('candyGem', undefined, BaseColor.Red), effect: 'mana' },
  { name: 'giant', gem: specialGem('giantGem', undefined, BaseColor.Red), effect: 'mana' },
  ...Object.entries(STATUS_GEM_EFFECTS).map(([kind, spec]): OwnedCase => ({
    name: kind, gem: specialGem(kind as StatusGemKind), effect: 'status',
    enemy: spec.side === 'enemy', status: spec.statusId,
  })),
];

function assertOwnership(f: Fixture, events: GameEvent[], test: OwnedCase, side = PlayerSide.Right) {
  const allies = f.state.teams[side].characters;
  const foes = f.state.teams[side === PlayerSide.Right ? PlayerSide.Left : PlayerSide.Right].characters;
  const targets = test.enemy ? foes : allies;
  const others = test.enemy ? allies : foes;
  const ids = targets.map(c => c.id);
  expect(events.some(e => e.type === 'special-gem-trigger' && test.gem.kind === 'special'
    && e.kind === test.gem.spec.kind)).toBe(true);
  if (test.effect === 'status') {
    const applied = events.filter(e => e.type === 'status-apply');
    expect(applied.length).toBeGreaterThan(0);
    expect(applied.every(e => ids.includes(e.targetId))).toBe(true);
    if (test.status) expect(applied.every(e => e.statusId === test.status)).toBe(true);
    expect(targets.some(c => c.statuses.length > 0)).toBe(true);
    expect(others.every(c => c.statuses.length === 0)).toBe(true);
  } else if (test.effect === 'mana' || test.effect === 'drain') {
    const buffs = events.filter((e): e is Extract<GameEvent, { type: 'buff' }> => e.type === 'buff' && e.stat === 'mana');
    const gains = events.filter(e => e.type === 'mana-gain');
    const recipients = test.effect === 'drain'
      ? buffs.filter(e => e.amount < 0).map(e => e.targetId)
      : [...buffs.map(e => e.targetId), ...gains.map(e => e.characterId)];
    expect(recipients.length).toBeGreaterThan(0);
    expect(recipients.every(id => ids.includes(id))).toBe(true);
    expect(targets.some(c => test.effect === 'drain' ? c.mana < 6 : c.mana > 6)).toBe(true);
    if (test.effect === 'drain') {
      // Destroying/matching the spirit's color also grants ordinary mana to its owner.
      expect(gains.every(e => allies.some(c => c.id === e.characterId))).toBe(true);
      expect(buffs.filter(e => e.amount < 0).every(e => foes.some(c => c.id === e.targetId))).toBe(true);
    } else expect(others.every(c => c.mana === 6)).toBe(true);
  } else if (test.effect === 'wish') {
    const wish = events.find(e => e.type === 'special-gem-trigger' && e.kind === 'wish');
    expect(wish?.type === 'special-gem-trigger' && wish.wish).toBeTruthy();
    if (wish?.type !== 'special-gem-trigger' || !wish.wish) throw new Error('Missing wish');
    // These seeds select a one-side wish; the existing both-side outcome is tested separately.
    expect(wish.wish.option).toBeLessThan(4);
    expect(wish.wish.targetIds.length).toBeGreaterThan(0);
    expect(wish.wish.targetIds.every(id => ids.includes(id))).toBe(true);
    expect(targets.some(c => c.mana === c.manaCost)).toBe(true);
    expect(others.every(c => c.mana === 6)).toBe(true);
  } else {
    const gold = events.filter((e): e is Extract<GameEvent, { type: 'economy-gain' }> => e.type === 'economy-gain' && e.currency === 'gold');
    expect(gold).toContainEqual({ type: 'economy-gain', currency: 'gold', amount: 10, side });
    expect(gold.every(e => e.side === side)).toBe(true);
    const total = gold.reduce((sum, e) => sum + e.amount, 0);
    expect(f.state.economy.gold).toBe(side === PlayerSide.Left ? total : 0);
    expect(f.state.enemyGold).toBe(side === PlayerSide.Right ? total : 0);
  }
}

function clear(f: Fixture, gem: GemType, side: PlayerSide, mode: 'destroy' | 'explode' | 'remove') {
  const pos = { row: 7, col: 3 };
  f.board.set(pos, { id: 9000, type: gem });
  const removed = f.board.get(pos)!;
  f.board.set(pos, null);
  const events: GameEvent[] = [{
    type: mode === 'explode' ? 'gem-explode' : 'gem-destroy',
    cells: [{ pos, gemId: removed.id, gemType: removed.type }],
  }];
  f.engine.resolveBoardChange([{ gemType: removed.type, pos }], events, side, mode);
  return events;
}

describe('special gems use the matching/destruction owner while activeLeft', () => {
  for (const mode of ['destroy', 'explode'] as const) {
    it.each(cases)(`Right ${mode}: $name`, test => {
      const f = fixture();
      expect(f.state.activePlayer).toBe(PlayerSide.Left);
      const events = clear(f, test.gem, PlayerSide.Right, mode);
      assertOwnership(f, events, test);
      expect(f.state.activePlayer).toBe(PlayerSide.Left);
    });
  }

  it.each(cases)('remove skips $name effects, resources and mana', test => {
    const f = fixture();
    const before = structuredClone({ left: f.left, right: f.right, economy: f.state.economy });
    const events = clear(f, test.gem, PlayerSide.Right, 'remove');
    expect(events.filter(e => ['special-gem-trigger', 'status-apply', 'buff', 'mana-gain', 'economy-gain'].includes(e.type))).toEqual([]);
    expect({ left: f.left, right: f.right, economy: f.state.economy }).toEqual(before);
    expect(f.state.enemyGold).toBe(0);
    expect(events.some(e => e.type === 'refill')).toBe(true);
  });

  it.each(cases.slice(0, 4))('Right opening omen -> match -> lightning -> $name', test => {
    const f = fixture((board, right) => {
      right[0].traitIds = ['omenofstone'];
      const put = (row: number, col: number, type: GemType) => board.set({ row, col }, { id: 8000 + row * 8 + col, type });
      put(7, 0, colorGem(BaseColor.Blue));
      put(7, 1, colorGem(BaseColor.Brown));
      put(6, 1, colorGem(BaseColor.Blue));
      put(7, 2, colorGem(BaseColor.Blue));
      put(7, 3, specialGem('lightningRow'));
      put(7, 4, test.gem);
      expect(new MatchResolver().findMatches(board)).toEqual([]);
    });
    const events = f.engine.takeInitialEvents();
    expect(f.state.activePlayer).toBe(PlayerSide.Left);
    expect(events[0].type).toBe('gem-explode');
    expect(events.some(e => e.type === 'elimination')).toBe(true);
    expect(events.some(e => e.type === 'special-gem-trigger' && e.kind === 'lightningRow')).toBe(true);
    assertOwnership(f, events, test);
    expect(f.engine.takeInitialEvents()).toEqual([]);
  });

  const matchCases = cases.filter(test => test.gem.kind === 'special'
    && (SPECIAL_MATCH_COLOR[test.gem.spec.kind] !== undefined
      || ['candyGem', 'giantGem', 'spiritGem'].includes(test.gem.spec.kind)));
  it.each(matchCases)('Right cascade match: $name', test => {
    const f = fixture();
    if (test.gem.kind !== 'special') throw new Error('Expected special');
    const color = test.gem.spec.color ?? SPECIAL_MATCH_COLOR[test.gem.spec.kind]!;
    for (let col = 0; col < 3; col++) {
      f.board.set({ row: 7, col }, { id: 8000 + col, type: col === 0 ? test.gem : colorGem(color) });
    }
    const events: GameEvent[] = [];
    // Public board-change path runs the real match resolver with the explicit owner.
    f.engine.resolveBoardChange([], events, PlayerSide.Right);
    expect(events.some(e => e.type === 'elimination')).toBe(true);
    assertOwnership(f, events, test);
    expect(f.state.activePlayer).toBe(PlayerSide.Left);
  });

  it('preserves Left beneficiary for ordinary active-side destruction', () => {
    const f = fixture();
    const test = cases[0];
    assertOwnership(f, clear(f, test.gem, PlayerSide.Left, 'destroy'), test, PlayerSide.Left);
  });

  it('preserves the trap exception: Right destruction still attacks Left', () => {
    const f = fixture(undefined, 1);
    const events = clear(f, specialGem('trapGem'), PlayerSide.Right, 'destroy');
    const applied = events.filter(e => e.type === 'status-apply');
    expect(applied.length).toBe(2);
    expect(applied.every(e => f.left.some(c => c.id === e.targetId))).toBe(true);
    expect(f.left.every(c => c.statuses.length === 1)).toBe(true);
    expect(f.right.every(c => c.statuses.length === 0)).toBe(true);
  });

  it('preserves the wish option that fills both teams', () => {
    // Find a seed whose first draw is the documented fifth option, without mocking RNG.
    let seed = 1;
    while (new SeededRNG(seed).next() < 0.8) seed++;
    const f = fixture(undefined, seed);
    const events = clear(f, specialGem('wish'), PlayerSide.Right, 'destroy');
    const wish = events.find(e => e.type === 'special-gem-trigger' && e.kind === 'wish');
    expect(wish?.type === 'special-gem-trigger' && wish.wish?.option).toBe(4);
    expect([...f.left, ...f.right].every(c => c.mana === c.manaCost)).toBe(true);
  });

  it.each([PlayerSide.Right, PlayerSide.Left])('hourglass only registers an extra turn for the active owner (%s)', side => {
    const f = fixture();
    clear(f, specialGem('hourglass'), side, 'destroy');
    // Internal marker is inspected only for this deferred effect; all triggering goes through the public path.
    const pending = (f.engine as unknown as { pendingExtraTurnSource: string | null }).pendingExtraTurnSource;
    expect(pending).toBe(side === PlayerSide.Left ? 'destroy' : null);
  });
});
