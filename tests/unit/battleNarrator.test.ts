import { describe, it, expect, vi } from 'vitest';
import { BattleNarrator, isTreasureGnome } from '../../src/render/BattleNarrator';
import type { NarrationClip } from '../../src/render/NarrationCatalog';
import { NARRATION_CLIPS } from '../../src/render/NarrationCatalog';
import { BaseColor, PlayerSide, colorGem } from '../../src/engine/types';
import type { Character } from '../../src/engine/types';
import type { GameEvent } from '../../src/engine/events';
import { createGameState } from '../../src/engine/GameState';
import { BoardModel } from '../../src/engine/BoardModel';

const L = PlayerSide.Left, R = PlayerSide.Right;
function character(id: number, props: Partial<Character> = {}): Character {
  return { id, name: `C${id}`, maxHp: 100, hp: 100, armor: 0, attack: 10, magic: 10,
    colors: [BaseColor.Red], mana: 0, manaCost: 20, skillId: 'none', statuses: [], defeated: false, ...props };
}
function setup(left = [character(1)], right = [character(2), character(3)], active = L, roll = 0) {
  const state = createGameState(new BoardModel(), { player: L, characters: left }, { player: R, characters: right });
  state.activePlayer = active;
  let time = 0;
  const sink = { playNarration: vi.fn((_clip: NarrationClip, _interrupt?: boolean) => true), preloadNarration: vi.fn(),
    isNarrationBusy: vi.fn(() => false), stopNarration: vi.fn() };
  const random = vi.fn(() => roll);
  const director = new BattleNarrator(sink, random, () => time);
  director.start(state);
  const speak = (events: GameEvent[]) => { const plan = director.prepare(events); plan?.play(); return plan; };
  const pool = () => sink.playNarration.mock.calls.at(-1)?.[0]?.pool;
  return { director, sink, random, speak, pool, state, advance: (ms = 80000) => { time += ms; } };
}
const hit = (props: Partial<Extract<GameEvent, {type: 'skull-damage'}>> = {}): GameEvent =>
  ({ type: 'skull-damage', attackerId: 1, targetId: 2, damage: 40, resultingHp: 60, resultingArmor: 0, ...props });
const spell = (targetId = 2, damage = 40, hp = 60): GameEvent =>
  ({ type: 'skill-damage', casterId: 1, targetId, range: 'all', damage, resultingHp: hp, resultingArmor: 0 });
const match = (count: number, chainCount = 1): GameEvent => ({ type: 'elimination', chainCount, shape: count >= 4 ? 'line4plus' : 'line3',
  cells: Array.from({ length: count }, (_, col) => ({pos: {row: 0, col}, gemId: col + 1, gemType: colorGem(BaseColor.Red)})) });
const status = (statusId: string, targetId = 2): GameEvent => ({ type: 'status-apply', statusId, targetId, turns: 3 });

describe('battle narrator: attribution and action-level selection', () => {
  it.each([[4, L, 'match4.ally'], [5, R, 'match5.enemy']] as const)('match %i / %s', (count, active, pool) => {
    const x = setup(undefined, undefined, active);
    x.speak([match(count), {type: 'turn-end', nextPlayer: active === L ? R : L}]);
    expect(x.pool()).toBe(pool);
  });
  it('surge uses the credited side, not the next active turn', () => {
    const x = setup();
    x.speak([{type: 'mana-gain', color: BaseColor.Red, player: R, characterId: 2, amount: 6, surge: true},
      {type: 'turn-end', nextPlayer: L}]);
    expect(x.pool()).toBe('mana_surge.enemy');
  });
  it('chooses just one highest-priority event and an idempotent timeline callback', () => {
    const x = setup();
    const plan = x.speak([match(4), hit(), status('silence')]);
    plan?.play();
    expect(x.pool()).toBe('heavy.ally');
    expect(x.sink.playNarration).toHaveBeenCalledTimes(1);
    expect(x.sink.preloadNarration).toHaveBeenCalledTimes(1);
  });
  it('makes one chance roll even with many candidates; no retry on a failed roll', () => {
    const x = setup(undefined, undefined, L, .99);
    expect(x.speak([match(4), match(4), status('silence'), hit()])).toBeNull();
    expect(x.random).toHaveBeenCalledTimes(1);
    expect(x.sink.playNarration).not.toHaveBeenCalled();
  });
  it('victory preempts heavy damage even when audio is busy and chance fails', () => {
    const x = setup(undefined, undefined, L, .99);
    x.sink.isNarrationBusy.mockReturnValue(true);
    x.speak([hit(), {type: 'game-over', winner: L}]);
    expect(x.pool()).toBe('victory.overwhelming');
    expect(x.sink.playNarration.mock.calls[0][1]).toBe(true);
    expect(x.speak([hit()])).toBeNull();
  });
  it('ordinary commentary never interrupts active speech', () => {
    const x = setup(); x.sink.isNarrationBusy.mockReturnValue(true);
    expect(x.speak([hit()])).toBeNull();
  });
  it('enforces global and shared heavy-family cooldowns', () => {
    const x = setup(); x.speak([hit()]); x.advance(15000);
    expect(x.speak([spell(3)])).toBeNull();
    x.advance(8000); x.speak([spell(3, 40, 20)]);
    expect(x.pool()).toBe('spell_heavy.ally');
    expect(x.speak([match(5)])).toBeNull();
  });
  it('avoids immediate repetition and keeps a clip on cooldown for 75s', () => {
    const x = setup(); x.speak([hit()]); const first = x.sink.playNarration.mock.calls[0][0].id;
    x.advance(23000); x.speak([hit({targetId: 3})]);
    expect(x.sink.playNarration.mock.calls[1][0].id).not.toBe(first);
    const y = setup(); y.speak([spell()]); y.advance(23000);
    expect(y.speak([spell(3)])).toBeNull();
  });
  it('uses the highest cascade tier and not four-match for four cascades', () => {
    const x = setup(); x.speak([match(3, 1), match(3, 3), match(3, 5)]);
    expect(x.pool()).toBe('grand_cascade.ally');
  });
  it('keeps extra turns distinct from natural four/five matches', () => {
    const x = setup(); x.speak([match(4), {type: 'extra-turn', player: L, source: 'match'}]);
    expect(x.pool()).toBe('match4.ally');
    const y = setup(); y.speak([{type: 'extra-turn', player: R, source: 'skill'}]);
    expect(y.pool()).toBe('extra_turn.enemy');
  });
});

describe('battle narrator: damage and mechanics', () => {
  it('narrates enemy heavy hits as harm to the player', () => {
    const x = setup(); x.speak([hit({attackerId: 2, targetId: 1})]); expect(x.pool()).toBe('heavy.enemy');
  });
  it('chooses spell and area damage lines independently of skull attacks', () => {
    const x = setup(); x.speak([spell()]); expect(x.pool()).toBe('spell_heavy.ally');
    const y = setup(); const plan = y.speak([spell(2, 30, 70), spell(3, 30, 70)]);
    expect(y.pool()).toBe('aoe_heavy.ally'); expect(plan?.eventIndex).toBe(1);
  });
  it('accumulates repeated hits without treating one victim as an area attack', () => {
    const x = setup(); const p = x.speak([spell(2, 20, 80), spell(2, 20, 60)]);
    expect(x.pool()).toBe('spell_heavy.ally'); expect(p?.eventIndex).toBe(1);
  });
  it('does not count a blocked hit or exaggerated overkill as heavy damage', () => {
    const x = setup(); expect(x.speak([spell(2, 0, 100)])).toBeNull();
    const y = setup(undefined, [character(2, {hp: 1})]);
    expect(y.speak([spell(2, 9999, 0)])).toBeNull();
  });
  it('self-harm including own armor breaking is not praised', () => {
    const x = setup([character(1, {armor: 10})]);
    expect(x.speak([hit({targetId: 1, damage: 50})])).toBeNull();
  });
  it('excludes Strike again when that victim dies later in the same action', () => {
    const x = setup(); x.random.mockReturnValueOnce(0).mockReturnValue(.5);
    x.speak([hit(), hit({damage: 60, resultingHp: 0}), {type: 'defeat', characterId: 2}]);
    expect(x.sink.playNarration.mock.calls[0][0].id).not.toContain('202609260007');
  });
  it.each(['silence', 'frozen', 'stun', 'entangle', 'web', 'poison', 'burning', 'curse', 'death_mark'])('%s is attributed to its perpetrator', (id) => {
    const x = setup(); x.speak([status(id)]); expect(x.pool()).toBe(`${id}.ally`);
    const y = setup(); y.speak([status(id, 1)]); expect(y.pool()).toBe(`${id}.enemy`);
  });
  it('status refreshes and damage-over-time ticks remain silent', () => {
    const x = setup(); x.speak([status('poison')]); x.advance();
    expect(x.speak([status('poison'), {type: 'status-tick', targetId: 2, statusId: 'poison', damage: 40}])).toBeNull();
  });
  it('barrier uses the recipient side', () => {
    const x = setup(); x.speak([status('barrier', 1)]); expect(x.pool()).toBe('barrier.ally');
  });
  it('distinguishes hostile transform from friendly self transformation', () => {
    const x = setup(); x.speak([{type: 'troop-transform', targetId: 1, name: 'New', sourceSide: R}]);
    expect(x.pool()).toBe('transform.enemy');
    const y = setup(); y.speak([{type: 'troop-transform', targetId: 1, name: 'New', sourceSide: L}]);
    expect(y.pool()).toBe('transform_self.ally');
  });
  it('uses devour only for explicitly confirmed successful devouring', () => {
    const x = setup(); x.speak([{type: 'skill-damage', casterId: 1, targetId: 2, range: 'single',
      damage: 100, resultingHp: 0, resultingArmor: 0, devoured: true}]);
    expect(x.pool()).toBe('devour.ally');
    const y = setup(); y.speak([spell(2, 100, 0)]); expect(y.pool()).toBe('spell_heavy.ally');
  });
});

describe('battle narrator: encounter and lifecycle', () => {
  it('only identifies the actual treasure gnome', () => {
    expect(isTreasureGnome(character(2, {name: 'Goblin', skillId: '123'}))).toBe(false);
    expect(isTreasureGnome(character(2, {skillId: 'skill_7684'}))).toBe(true);
    const x = setup(undefined, [character(2, {skillId: '7684'})]);
    x.director.announceEncounter(); x.director.announceEncounter();
    expect(x.pool()).toBe('treasure.appear'); expect(x.sink.playNarration).toHaveBeenCalledTimes(1);
  });
  it('announces treasure summoned onto field, not while queued', () => {
    const x = setup();
    const ev: GameEvent = {type: 'summon', characterId: 9, troopId: 6497, slot: 0, player: R, destination: 'queue'};
    expect(x.speak([ev])).toBeNull();
    x.speak([{...ev, destination: 'field', fromQueue: true}]); expect(x.pool()).toBe('treasure.appear');
    x.director.announceEncounter(); expect(x.sink.playNarration).toHaveBeenCalledTimes(1);
  });
  it.each(['flee', 'defeat'] as const)('treasure %s has its own cue', (type) => {
    const x = setup(undefined, [character(2, {skillId: '7684'})]);
    x.speak([type === 'defeat' ? {type, characterId: 2} : {type, characterId: 2, player: R, hp: 100, armor: 0}]); expect(x.pool()).toBe(type === 'flee' ? 'treasure.fled' : 'treasure.defeated');
  });
  it('ordinary unit flee is not whole-party retreat', () => {
    const x = setup(); expect(x.speak([{type: 'flee', characterId: 1, player: L, hp: 100, armor: 0}])).toBeNull();
    x.director.retreat(); expect(x.pool()).toBe('retreat.costly');
  });
  it('selects costly victory and actual total defeat correctly', () => {
    const x = setup(); x.speak([{type: 'defeat', characterId: 1}, {type: 'game-over', winner: L}]);
    expect(x.pool()).toBe('victory.costly');
    const y = setup(); y.speak([{type: 'defeat', characterId: 1}, {type: 'game-over', winner: R}]);
    expect(y.pool()).toBe('defeat.total');
    const z = setup(); z.speak([{type: 'flee', characterId: 1, player: L, hp: 100, armor: 0}, {type: 'game-over', winner: R}]);
    expect(z.pool()).toBe('defeat.crushing');
  });
  it('a disposed or restarted battle never plays a stale plan', () => {
    const x = setup(); const p = x.director.prepare([hit()]); x.director.dispose(); p?.play();
    expect(x.sink.playNarration).not.toHaveBeenCalled();
    x.director.start(x.state); const q = x.director.prepare([hit()]); x.director.start(x.state); q?.play();
    expect(x.sink.playNarration).not.toHaveBeenCalled();
  });
  it('every active catalog entry has a bundled URL', () => {
    expect(NARRATION_CLIPS).toHaveLength(84);
    expect(NARRATION_CLIPS.every(c => !!c.url && c.duration > 0)).toBe(true);
  });
});


describe('encouragement only for a genuine ongoing advantage', () => {
  it('a non-final enemy defeat can trigger the new pool once per action', () => {
    const x = setup();
    x.speak([hit({damage: 100, resultingHp: 0}), {type: 'defeat', characterId: 2}]);
    expect(x.pool()).toBe('encourage.ally');
    expect(x.sink.playNarration).toHaveBeenCalledTimes(1);
  });
  it('has a 45 percent chance and never interrupts active narration', () => {
    const x = setup(undefined, undefined, L, .46);
    expect(x.speak([{type: 'defeat', characterId: 2}])).toBeNull();
    const y = setup(); y.sink.isNarrationBusy.mockReturnValue(true);
    expect(y.speak([{type: 'defeat', characterId: 2}])).toBeNull();
  });
  it('respects 45-second family cooldown even if another opponent later falls', () => {
    const x = setup([character(1), character(4)], [character(2), character(3), character(5)]);
    x.speak([{type: 'defeat', characterId: 2}]);
    expect(x.pool()).toBe('encourage.ally');
    x.advance(20000);
    expect(x.speak([{type: 'defeat', characterId: 3}])).toBeNull();
  });
  it('does not rally for allied losses, enemy flee, duplicate death, being outnumbered or the last kill', () => {
    const x = setup();
    expect(x.speak([{type: 'defeat', characterId: 1}])).toBeNull();
    const y = setup();
    expect(y.speak([{type: 'flee', characterId: 2, player: R, hp: 100, armor: 0}])).toBeNull();
    const z = setup(undefined, [character(2)]);
    expect(z.speak([{type: 'defeat', characterId: 2}])).toBeNull();
    const outnumbered = setup(undefined, [character(2), character(3), character(4)]);
    expect(outnumbered.speak([{type: 'defeat', characterId: 2}])).toBeNull();
    const repeated = setup(); repeated.speak([{type: 'defeat', characterId: 2}]); repeated.advance();
    expect(repeated.speak([{type: 'defeat', characterId: 2}])).toBeNull();
  });
  it('victory wins over encouragement even if a death event was queued earlier', () => {
    const x = setup(); x.speak([{type: 'defeat', characterId: 2}, {type: 'game-over', winner: L}]);
    expect(x.pool()).toBe('victory.overwhelming');
  });
});
