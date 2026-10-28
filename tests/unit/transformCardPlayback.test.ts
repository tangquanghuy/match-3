import { describe, expect, it, vi } from 'vitest';
import source from '../../src/render/App.ts?raw';
import { CharacterCard, TeamView } from '@render/TeamView';
import { BoardModel } from '@engine/BoardModel';
import { createGameState } from '@engine/GameState';
import { TurnEngine } from '@engine/TurnEngine';
import { SeededRNG } from '@engine/rng';
import { BaseColor, PlayerSide, snapshotCharacterForm, type Character } from '@engine/types';
import type { GameEvent } from '@engine/events';
import { transformTroopEffect } from '@engine/skills/effects/summon';
import { troopToSummonTemplate } from '../../src/data/troops';

// Run the actual App branches without constructing the canvas/audio application in Node.
const summonBranch = source.slice(source.indexOf("      case 'summon': {"), source.indexOf("      case 'troop-reposition': {"));
const transformBranch = source.slice(source.indexOf("      case 'troop-transform': {"), source.indexOf("      case 'economy-gain': {"));
const play = new Function('ev', 'state', 'resolveTroopPortrait', 'battleTroopOf',
  `switch (ev.type) { ${summonBranch} ${transformBranch} }`);

function character(id = 4): Character {
  return { ...troopToSummonTemplate('BabyDragon')!, id, statuses: [], defeated: false };
}

function cardFor(char: Character) {
  const card = Object.create(CharacterCard.prototype) as CharacterCard;
  const photo = { style: { backgroundImage: '' } };
  const fields = {
    char, displayedMana: char.mana, shownVersion: 0,
    atkEl: { textContent: '', parentElement: null }, magicEl: { textContent: '' }, brEl: { innerHTML: '' },
    el: { classList: { toggle: vi.fn(), remove: vi.fn(), add: vi.fn() }, setAttribute: vi.fn(),
      querySelector: vi.fn(() => ({ querySelector: () => photo })) },
    gemEl: { innerHTML: '', appendChild: vi.fn(), querySelector: vi.fn(() => ({})) }, gemManaEl: {},
    renderMana: vi.fn(), renderStatuses: vi.fn(), renderTraitRow: vi.fn(),
    syncStatusVisuals: vi.fn(), floatText: vi.fn(),
  };
  Object.assign(card, fields);
  Object.defineProperty(card, 'charId', { value: char.id });
  return { card, fields, photo, current: () => (card as unknown as { char: Character }).char };
}

function playback(char: Character) {
  const display = cardFor(char);
  const midpoints: (() => void)[] = [];
  display.card.transformFlip = vi.fn(callback => { midpoints.push(callback); });
  const view = { addCharacterCard: vi.fn((form: Character) => {
    display.card.presentForm(form, form.portraitUrl ?? '/resolved.webp');
    return display.card;
  }) };
  const app = { cardOfChar: () => display.card, viewOf: () => view, portraitById: new Map(),
    removeAllStatusPersist: vi.fn(), audio: { play: vi.fn() }, cardCenterInOverlay: vi.fn(() => null),
    playFrameFX: vi.fn(), portraitFor: vi.fn(() => { throw new Error('unexpected final-state portrait lookup'); }),
    idMap: { snapshotOf: vi.fn() } };
  const state = createGameState(new BoardModel(), { player: PlayerSide.Left, characters: [char] },
    { player: PlayerSide.Right, characters: [] });
  return { ...display, midpoints, view, state, app,
    play: (event: GameEvent) => play.call(app, event, state, () => '/resolved.webp', () => undefined) };
}

describe('summon and transform card playback', () => {
  it('plays each complete form at its flip midpoint and restores the engine binding at action end', () => {
    const actual = character();
    const f = playback(actual);
    const rng = new SeededRNG(49);
    const ctx = { state: f.state, casterId: actual.id, rng, nextGemId: () => 1, resolveSummonRef: troopToSummonTemplate };
    const first = transformTroopEffect({ targets: [actual], ref: 'Emperina', fullMana: true }).apply(ctx)[0];
    const second = transformTroopEffect({ targets: [actual], ref: 'BabyDragon' }).apply(ctx)[0];
    actual.hp = 1; actual.mana = 2; actual.statuses = [{ id: 'poison', turns: 2 }];
    const terminal = structuredClone(actual);
    f.play(first);
    expect(f.midpoints).toHaveLength(1);
    f.midpoints.shift()!();
    if (first.type !== 'troop-transform' || second.type !== 'troop-transform') throw new Error('missing form');
    expect(f.current()).toEqual(first.form);
    expect(f.card.shownStats().stats).toMatchObject({ hp: first.form!.hp, manaCost: first.form!.manaCost, mana: first.form!.mana, statuses: [] });
    expect(f.photo.style.backgroundImage).toBe("url('/resolved.webp')");
    expect(f.current().colors).toEqual(first.form!.colors);
    expect(f.current().traitNames).toEqual(first.form!.traitNames);
    f.play(second);
    expect(f.current()).toEqual(first.form);
    f.midpoints.shift()!();
    expect(f.current()).toEqual(second.form);
    expect(f.fields.renderTraitRow).toHaveBeenCalledTimes(2);
    expect(actual).toEqual(terminal);
    expect(first.form).not.toBe(f.current());
    const view = Object.create(TeamView.prototype);
    Object.assign(view, { cards: new Map([[actual.id, f.card]]), team: f.state.teams.Left });
    view.refreshAll();
    expect(f.current()).toBe(actual);
    expect(f.card.shownStats().stats).toMatchObject({ hp: 1, mana: 2, statuses: [{ id: 'poison', turns: 2 }] });
    expect(actual).toEqual(terminal);
  });

  it('creates a living summon from its event even after the actor transformed and died off-field', () => {
    const actual = character(9);
    actual.portraitUrl = '/summoned.webp';
    const form = snapshotCharacterForm(actual);
    const f = playback(actual);
    actual.name = 'later form'; actual.hp = 0; actual.defeated = true; actual.portraitUrl = '/later.webp';
    f.state.teams.Left.characters = [];
    f.play({ type: 'summon', characterId: actual.id, troopId: 6001, destination: 'field', player: PlayerSide.Left, slot: 0, form });
    expect(f.view.addCharacterCard).toHaveBeenCalledWith(form, { portrait: '/summoned.webp', troopName: form.name });
    expect(f.card.shownStats().stats).toMatchObject({ hp: form.hp, defeated: false });
    expect(f.photo.style.backgroundImage).toBe("url('/summoned.webp')");
    expect(f.current()).not.toBe(form);
    f.current().colors.push(BaseColor.Brown);
    expect(form.colors).not.toEqual(f.current().colors);
    expect(actual).toMatchObject({ name: 'later form', hp: 0, defeated: true, portraitUrl: '/later.webp' });
  });

  it('does not use a later portrait when the event form has no explicit portrait', () => {
    const actual = character(); actual.portraitUrl = '/final.webp';
    const f = playback(actual);
    const form = { ...snapshotCharacterForm(actual), portraitUrl: undefined };
    f.play({ type: 'troop-transform', targetId: actual.id, name: form.name, form });
    f.midpoints.shift()!();
    expect(f.photo.style.backgroundImage).toBe("url('/resolved.webp')");
    expect(actual.portraitUrl).toBe('/final.webp');
  });

  it('keeps legacy queue summons off the field', () => {
    const f = playback(character());
    f.play({ type: 'summon', characterId: 4, troopId: 1, destination: 'queue', player: PlayerSide.Left, slot: 0 });
    expect(f.view.addCharacterCard).not.toHaveBeenCalled();
  });

  it('captures trait/environment summons at the shared TurnEngine enqueue outlet', () => {
    const actual = character(); actual.portraitUrl = '/trait.webp';
    const state = createGameState(new BoardModel(), { player: PlayerSide.Left, characters: [] },
      { player: PlayerSide.Right, characters: [] });
    const engine = new TurnEngine(state, new SeededRNG(1), () => 1);
    const enqueue = engine as unknown as { enqueueSummon(c: Character, troopId: number, side: PlayerSide): GameEvent[] };
    const event = enqueue.enqueueSummon(actual, 6001, PlayerSide.Left)[0];
    expect(event).toMatchObject({ type: 'summon', form: { id: 4, portraitUrl: '/trait.webp', defeated: false } });
    actual.hp = 0; actual.defeated = true; actual.portraitUrl = '/later.webp';
    expect(event.type === 'summon' && event.form).toMatchObject({ hp: character().hp, portraitUrl: '/trait.webp', defeated: false });
  });
});
