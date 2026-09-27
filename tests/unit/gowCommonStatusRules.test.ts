import { describe, expect, it } from 'vitest';
import { BaseColor, PlayerSide } from '@engine/types';
import type { Character, Team } from '@engine/types';
import { applyBuffGain } from '@engine/skills/effects/buff';
import { devourEffect } from '@engine/skills/effects/devour';
import { applyStatus, tickStatuses, tickTeamStatuses } from '@engine/skills/effects/status';
import { grantStat, neutralPassives } from '@engine/traits';
import { CombatResolver } from '@engine/CombatResolver';
import { BoardModel } from '@engine/BoardModel';
import { createGameState } from '@engine/GameState';
import { SeededRNG } from '@engine/rng';

function character(id: number): Character {
  return { id, name: String(id), maxHp: 50, hp: 50, armor: 10, attack: 10,
    magic: 10, colors: [BaseColor.Red], manaCost: 20, mana: 0,
    skillId: 'none', statuses: [], defeated: false };
}
const team = (player: PlayerSide, characters: Character[]): Team => ({ player, characters });

describe('Lycanthropy shared status transformation', () => {
  it('uses separate recovery and 15% rolls, replaces the character with a Beast template, and keeps the slot and id', () => {
    const victim = character(42);
    victim.statuses.push({ id: 'lycanthropy', turns: 3 }, { id: 'burning', turns: 3 });
    let rolls = 0;
    // R004: one shared recovery roll for all recoverable negatives, then the 15% roll.
    const rng = { next: () => [0.9, 0.14][rolls++], nextInt: () => 0 } as unknown as SeededRNG;
    const beast = { ...character(99), name: 'BeastFixture', attack: 31, hp: 15,
      colors: [BaseColor.Green], skillId: 'beast-spell', troopTypes: ['Beast'] };
    const { id: _id, defeated: _defeated, statuses: _statuses, ...template } = beast;
    const team = [victim];
    const events = tickTeamStatuses(team, rng, PlayerSide.Left, () => template);
    expect(team[0]).toBe(victim);
    expect(victim.id).toBe(42);
    expect([victim.name, victim.hp, victim.attack, victim.mana, victim.skillId]).toEqual(['BeastFixture', 15, 31, 0, 'beast-spell']);
    expect(victim.statuses).toEqual([]);
    expect(events.some(e => e.type === 'troop-transform' && e.targetId === 42 && e.sourceSide === PlayerSide.Left)).toBe(true);
    expect(events.some(e => e.type === 'status-tick' && e.statusId === 'burning')).toBe(false);
  });

  it('a naturally cleansed status does not transform; an absent catalogue does not fabricate a transformation', () => {
    const first = character(1);
    first.statuses.push({ id: 'lycanthropy', turns: 3 });
    const cleansed = tickStatuses(first, { next: () => 0 } as SeededRNG, () => { throw new Error('unexpected'); });
    expect(cleansed.some(e => e.type === 'troop-transform')).toBe(false);
    expect(first.statuses).toEqual([]);
    const second = character(2);
    second.statuses.push({ id: 'lycanthropy', turns: 3 });
    const events = tickStatuses(second, { next: () => 0.11 } as SeededRNG);
    expect(events.some(e => e.type === 'troop-transform')).toBe(false);
    expect(second.name).toBe('2');
  });
});

describe('official status shared-rule regression', () => {
  it('Entangle blocks positive Attack gain from spells and traits, but permits reductions and gains after removal', () => {
    const troop = character(1);
    troop.statuses.push({ id: 'entangle', turns: 3 });
    expect(applyBuffGain(troop, 'attack', 4)).toBe(0);
    expect(grantStat(troop, 'attack', 4)).toBe(0);
    expect(troop.attack).toBe(10);
    expect(applyBuffGain(troop, 'attack', -2)).toBe(-2);
    troop.statuses = [];
    expect(grantStat(troop, 'attack', 4)).toBe(4);
    expect(troop.attack).toBe(12);
  });

  it('a Blessed troop rejects Devour before the random draw, and cannot grant growth', () => {
    const caster = character(1), target = character(2);
    target.statuses.push({ id: 'blessed', turns: 3 });
    const state = createGameState(new BoardModel(), team(PlayerSide.Left, [caster]), team(PlayerSide.Right, [target]));
    let draws = 0;
    const rng = { next: () => { draws++; return 0; } } as SeededRNG;
    const events = devourEffect({ targets: [target], chance: 1 }).apply({ state, casterId: caster.id, rng, nextGemId: () => 0 });
    expect(events).toEqual([]);
    expect(draws).toBe(0);
    expect(caster.attack).toBe(10);
    expect(target.defeated).toBe(false);
  });

  it('blocked Devour produces no growth even if the target has Barrier', () => {
    const caster = character(1), target = character(2);
    target.statuses.push({ id: 'barrier', turns: 3 });
    const state = createGameState(new BoardModel(), team(PlayerSide.Left, [caster]), team(PlayerSide.Right, [target]));
    devourEffect({ targets: [target], chance: 1 }).apply({ state, casterId: caster.id, rng: new SeededRNG(1), nextGemId: () => 0 });
    expect(target.defeated).toBe(false);
    expect(caster.attack).toBe(10);
    expect(caster.hp).toBe(50);
  });

  it('Devour gains the victim current stats, bypasses spell mitigation, and never gains Magic', () => {
    const caster = character(1), target = character(2);
    caster.hp = 25;
    target.attack = 17;
    target.armor = 23;
    target.hp = 8;
    target.magic = 99;
    target.passive = { ...neutralPassives(), spellDamageTaken: 0 };
    const state = createGameState(new BoardModel(), team(PlayerSide.Left, [caster]), team(PlayerSide.Right, [target]));
    const events = devourEffect({ targets: [target], chance: 1 }).apply({ state, casterId: caster.id, rng: new SeededRNG(1), nextGemId: () => 0 });
    expect(target.defeated).toBe(true);
    expect(events.some(e => e.type === 'skill-damage' && e.targetId === target.id && e.devoured)).toBe(true);
    expect([caster.attack, caster.armor, caster.magic, caster.hp, caster.maxHp]).toEqual([27, 33, 10, 33, 58]);
  });

  it('Devour observes Entangle on both attacker and victim', () => {
    const caster = character(1), target = character(2);
    caster.statuses.push({ id: 'entangle', turns: 2 });
    target.statuses.push({ id: 'entangle', turns: 2 });
    target.armor = 4;
    target.hp = 9;
    const state = createGameState(new BoardModel(), team(PlayerSide.Left, [caster]), team(PlayerSide.Right, [target]));
    devourEffect({ targets: [target], chance: 1 }).apply({ state, casterId: caster.id, rng: new SeededRNG(1), nextGemId: () => 0 });
    expect(caster.attack).toBe(10);
    expect(caster.armor).toBe(14);
    expect(caster.magic).toBe(10);
    expect([caster.hp, caster.maxHp]).toEqual([59, 59]);
  });

  it('Barrier consumes itself on Devour and prevents defeat, growth and magic changes', () => {
    const caster = character(1), target = character(2);
    target.statuses.push({ id: 'barrier', turns: 2 });
    target.armor = 33;
    const state = createGameState(new BoardModel(), team(PlayerSide.Left, [caster]), team(PlayerSide.Right, [target]));
    const events = devourEffect({ targets: [target], chance: 1 }).apply({ state, casterId: caster.id, rng: new SeededRNG(1), nextGemId: () => 0 });
    expect(target.defeated).toBe(false);
    expect(target.statuses.some(status => status.id === 'barrier')).toBe(false);
    expect(events.some(event => event.type === 'defeat')).toBe(false);
    expect([caster.attack, caster.armor, caster.magic, caster.maxHp]).toEqual([10, 10, 10, 50]);
  });
  it('Death Mark skips the first owner-turn death roll and may kill on the second', () => {
    const target = character(5);
    applyStatus(target, { id: 'death-mark', turns: 4 });
    const first = tickStatuses(target); // No RNG: verify the first turn's grace deterministically.
    expect(first.some(e => e.type === 'defeat')).toBe(false);
    expect(target.statuses[0].graceTicks).toBe(0);
    const scripted = { next: (() => { let i = 0; return () => i++ === 0 ? 0.5 : 0; })() } as SeededRNG;
    const events = tickStatuses(target, scripted); // Miss cleanse, hit 10% death roll.
    expect(events).toContainEqual({ type: 'defeat', characterId: target.id });
  });

  it('Curse itself rolls cumulative recovery at 10%, then +5% (15%) on the next turn (R004)', () => {
    const target = character(3);
    target.statuses.push({ id: 'curse', turns: 5 });
    tickStatuses(target, { next: () => 0.12 } as SeededRNG);
    expect(target.statuses[0].recoveryChance).toBe(15);
    const events = tickStatuses(target, { next: () => 0.12 } as SeededRNG);
    expect(target.statuses).toEqual([]);
    expect(events).toContainEqual({ type: 'status-expire', targetId: 3, statusId: 'curse' });
  });

  it('Curse bypasses ordinary Devour immunity, but never Invulnerable immunity', () => {
    const caster = character(1), immune = character(2), invulnerable = character(3);
    immune.traitIds = ['indigestible'];
    immune.passive = { ...neutralPassives(), devourImmunity: true };
    immune.statuses.push({ id: 'curse', turns: 3 });
    invulnerable.traitIds = ['invulnerable'];
    invulnerable.statuses.push({ id: 'curse', turns: 3 });
    const state = createGameState(new BoardModel(), team(PlayerSide.Left, [caster]), team(PlayerSide.Right, [immune, invulnerable]));
    const events = devourEffect({ targets: [immune, invulnerable], chance: 1 }).apply({ state, casterId: caster.id, rng: new SeededRNG(1), nextGemId: () => 0 });
    expect(immune.defeated).toBe(true);
    expect(invulnerable.defeated).toBe(false);
    expect(events.some(e => e.type === 'defeat' && e.characterId === immune.id)).toBe(true);
  });

  it('Barrier absorbs ordinary skull damage but not lethal skull damage; Invulnerable blocks lethal', () => {
    const attacker = character(1), defender = character(2);
    attacker.passive = { ...neutralPassives(), skullLethalChance: 1 };
    defender.statuses.push({ id: 'barrier', turns: 3 });
    const rng = { next: () => 0 } as SeededRNG;
    const resolve = () => new CombatResolver().resolveSkullDamage(team(PlayerSide.Left, [attacker]), team(PlayerSide.Right, [defender]), 3, rng);
    expect(resolve().events).toContainEqual({ type: 'defeat', characterId: defender.id });
    expect(defender.defeated).toBe(true);
    defender.defeated = false;
    defender.hp = 50;
    defender.statuses = [{ id: 'barrier', turns: 3 }];
    defender.traitIds = ['invulnerable'];
    expect(resolve().events.some(e => e.type === 'defeat')).toBe(false);
    expect(defender.defeated).toBe(false);
  });

  it('stunning suppresses lethal skull traits during actual combat and cleansing restores them', () => {
    const attacker = character(1), defender = character(2);
    attacker.passive = { ...neutralPassives(), skullLethalChance: 1 };
    attacker.statuses.push({ id: 'stun', turns: 3 });
    const rng = { next: () => 0 } as SeededRNG;
    CombatResolver.prototype.resolveSkullDamage.call(new CombatResolver(), team(PlayerSide.Left, [attacker]), team(PlayerSide.Right, [defender]), 3, rng);
    expect(defender.defeated).toBe(false);
    attacker.statuses = [];
    CombatResolver.prototype.resolveSkullDamage.call(new CombatResolver(), team(PlayerSide.Left, [attacker]), team(PlayerSide.Right, [defender]), 3, rng);
    expect(defender.defeated).toBe(true);
  });
});
