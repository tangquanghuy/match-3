// rulings/R004 status durations (sa-L5, 2026-09-28): shared cumulative self-cleanse for
// negatives, no hard turn cap, positive statuses end on their own trigger.
import { describe, it, expect } from 'vitest';
import { ExtensionRegistry } from '@engine/registry';
import { registerSkillLibrary } from '@engine/skills/library';
import { TurnEngine } from '@engine/TurnEngine';
import { CombatResolver } from '@engine/CombatResolver';
import { FixedTargetChooser } from '@engine/skills/targetChooser';
import { applyStatus, tickStatuses, hasStatus } from '@engine/skills/effects/status';
import { BaseColor, PlayerSide, type Character } from '@engine/types';
import type { SeededRNG } from '@engine/rng';
import { damageFixture, damageCharacter } from '../helpers/damageFixture';

const registry = new ExtensionRegistry(); registerSkillLibrary(registry.prototypes);
const rng = (v: number) => ({ next: () => v, nextInt: () => 0 }) as unknown as SeededRNG;
const ids = (c: Character) => c.statuses.map((s) => s.id);

function castSetup(side: PlayerSide) {
  const f = damageFixture();
  Object.assign(f.caster, { skillId: '8403', mana: 12, manaCost: 12, colors: [BaseColor.Blue, BaseColor.Purple], magic: 5 });
  const other = side === PlayerSide.Left ? PlayerSide.Right : PlayerSide.Left;
  f.state.teams[side].characters = [f.caster]; f.state.teams[other].characters = f.enemies; f.state.activePlayer = side;
  const engine = new TurnEngine(f.state, f.ctx.rng, f.ctx.nextGemId, registry); engine.skullChance = 0;
  engine.setTargetChooser(new FixedTargetChooser(12));
  return { ...f, engine };
}

describe('R004 negative statuses: shared cumulative self-cleanse, no cap', () => {
  it('one roll per owner turn; success removes every recoverable negative, Poison stays', () => {
    const c = damageCharacter(1);
    for (const id of ['stun', 'burning', 'frozen', 'poison', 'death-mark']) applyStatus(c, { id, turns: 3 });
    let draws = 0;
    tickStatuses(c, { next: () => { draws++; return 0.99; } } as unknown as SeededRNG);
    // 1 shared recovery roll + Poison 50% roll + Death Mark grace (no roll on first tick)
    expect(draws).toBe(2);
    expect(c.statuses.every((s) => s.id === 'poison' || s.recoveryChance === 20)).toBe(true);
    expect(c.statuses.map((s) => s.turns)).toEqual([3, 3, 3, 3, 3]);
    const ev = tickStatuses(c, rng(0.19));
    expect(ids(c)).toEqual(['poison']);
    expect(ev.filter((e) => e.type === 'status-expire').length).toBe(4);
  });
  it('Poison never self-cleanses even at roll 0, and gaining Poison resets the shared chance', () => {
    const c = damageCharacter(1);
    applyStatus(c, { id: 'poison', turns: 3 });
    for (let i = 0; i < 12; i++) tickStatuses(c, rng(0.9));
    expect(hasStatus(c, 'poison')).toBe(true);
    applyStatus(c, { id: 'silence', turns: 3 });
    tickStatuses(c, rng(0.99)); tickStatuses(c, rng(0.99));
    expect(c.statuses.find((s) => s.id === 'silence')!.recoveryChance).toBe(30);
    applyStatus(c, { id: 'poison', turns: 3 });
    expect(c.statuses.find((s) => s.id === 'silence')!.recoveryChance).toBeUndefined();
  });
  it('re-applying a present negative resets; Bleed stacks 2-4 do not, the 5th does (official Bleed entry)', () => {
    const c = damageCharacter(1);
    applyStatus(c, { id: 'silence', turns: 3 });
    tickStatuses(c, rng(0.99));
    expect(c.statuses[0].recoveryChance).toBe(20);
    applyStatus(c, { id: 'silence', turns: 3 });
    expect(c.statuses[0].recoveryChance).toBeUndefined();
    const b = damageCharacter(2);
    applyStatus(b, { id: 'bleed', turns: 3 });
    tickStatuses(b, rng(0.99));
    for (let i = 0; i < 3; i++) applyStatus(b, { id: 'bleed', turns: 3 });
    expect([b.statuses[0].magnitude, b.statuses[0].recoveryChance]).toEqual([4, 20]);
    applyStatus(b, { id: 'bleed', turns: 3 });
    expect(b.statuses[0].recoveryChance).toBeUndefined();
  });
  it('Cursed grows by 5% per turn from a 10% start; chance caps at 100% (certain cleanse)', () => {
    const c = damageCharacter(1);
    applyStatus(c, { id: 'curse', turns: 3 });
    tickStatuses(c, rng(0.99)); tickStatuses(c, rng(0.99));
    expect(c.statuses[0].recoveryChance).toBe(20);
    const d = damageCharacter(2);
    applyStatus(d, { id: 'stun', turns: 3 });
    for (let i = 0; i < 9; i++) tickStatuses(d, rng(0.999));
    expect(d.statuses[0].recoveryChance).toBe(100);
    tickStatuses(d, rng(0.999));
    expect(d.statuses).toEqual([]);
  });
});

describe('R004 positive statuses end on their trigger, not on a timer', () => {
  it('Enraged / Reflect / Submerged / Blessed / Barrier / Enchanted survive turn starts', () => {
    const c = damageCharacter(1);
    c.statuses = ['enraged', 'reflect', 'submerged', 'blessed', 'barrier', 'enchanted'].map((id) => ({ id, turns: 1 }));
    for (let i = 0; i < 5; i++) tickStatuses(c, rng(0));
    expect(ids(c)).toEqual(['enraged', 'reflect', 'submerged', 'blessed', 'barrier', 'enchanted']);
  });
  for (const side of [PlayerSide.Left, PlayerSide.Right]) {
    it(`${side}: casting ends the caster's Submerged/Blessed/Enchanted before the spell body; Enraged/Reflect stay`, () => {
      const f = castSetup(side);
      f.caster.statuses = ['submerged', 'blessed', 'enchanted', 'enraged', 'reflect'].map((id) => ({ id, turns: 3 }));
      const ev = f.engine.castSkill(0);
      const expired = ev.filter((e) => e.type === 'status-expire' && e.targetId === 0).map((e) => e.type === 'status-expire' && e.statusId);
      expect(expired).toEqual(['enchanted', 'submerged', 'blessed']);
      // Blessed was gone before the body, so the spell's self Barrier lands.
      expect(ids(f.caster)).toEqual(['enraged', 'reflect', 'barrier']);
      expect(f.enemies[2].hp).toBe(1000 - 8);
    });
  }
  it('front troop dealing skull damage ends its Enraged, Submerged and Blessed; defender Reflect is consumed', () => {
    const a = damageCharacter(1, { attack: 10 }), d = damageCharacter(2);
    a.statuses = ['enraged', 'submerged', 'blessed', 'reflect'].map((id) => ({ id, turns: 3 }));
    d.statuses = [{ id: 'reflect', turns: 3 }];
    new CombatResolver().resolveSkullDamage({ player: PlayerSide.Left, characters: [a] }, { player: PlayerSide.Right, characters: [d] }, 3);
    expect(d.hp).toBe(1000 - 15);
    expect(ids(a)).toEqual(['reflect']);
    expect(ids(d)).toEqual([]);
  });
  it('no skull damage (Entangled front troop, or target Barrier absorbs) keeps the attacker statuses', () => {
    const a = damageCharacter(1), d = damageCharacter(2);
    a.statuses = [{ id: 'entangle', turns: 3 }, { id: 'submerged', turns: 3 }, { id: 'enraged', turns: 3 }];
    new CombatResolver().resolveSkullDamage({ player: PlayerSide.Left, characters: [a] }, { player: PlayerSide.Right, characters: [d] }, 3);
    expect(ids(a)).toEqual(['entangle', 'submerged', 'enraged']);
    const b = damageCharacter(3), e = damageCharacter(4, { statuses: [{ id: 'barrier', turns: 3 }] });
    b.statuses = [{ id: 'blessed', turns: 3 }];
    new CombatResolver().resolveSkullDamage({ player: PlayerSide.Left, characters: [b] }, { player: PlayerSide.Right, characters: [e] }, 3);
    expect(ids(b)).toEqual(['blessed']);
    expect(ids(e)).toEqual([]);
  });
});
