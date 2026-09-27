// Independent expectations from official 4.5 patch notes, Sirrian, 2019-08-28.
// This shared-rule suite is not whole-skill acceptance.
// @ts-expect-error Node fixture
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CombatResolver } from '@engine/CombatResolver';
import { PlayerSide } from '@engine/types';
import { attachPassives } from '@engine/traits';
import { damageEffect } from '@engine/skills/effects/damage';
import { reflectDamageAmount, hasStatus } from '@engine/skills/effects/status';
import { damageFixture } from '../helpers/damageFixture';

const notes = JSON.parse(fs.readFileSync('artifacts/gow-skill-audit/gold-primary-sources/official-reflect-4-5.json', 'utf8'));
const original = notes.post_stream.posts.find((p: { post_number: number }) => p.post_number === 1);
const cases = [[1, 1], [3, 1], [5, 2], [13, 6], [15, 7], [16, 8]] as const;
describe('Official 4.5 Reflect rule: independent floor, minimum, damage source and resistance audit', () => {
  it('preserves the actual primary-source author and explicit rule clauses', () => {
    expect(original.username).toBe('Sirrian');
    expect(original.cooked).toContain('Reflect damage is rounded down');
    expect(original.cooked).toContain('Reflect only applies if an Enemy deals damage');
    expect(original.cooked).toContain('Allies dealing damage will not trigger Reflect');
    expect(original.cooked).toContain('damage reduction traits such as Armored or Spell Armor will not apply');
  });
  for (const [damage, reflected] of cases) {
    it('helper: incoming ' + damage + ' reflects ' + reflected, () => {
      expect(reflectDamageAmount(damage)).toBe(reflected);
    });
    for (const side of [PlayerSide.Left, PlayerSide.Right]) {
      it(side + ' spell damage ' + damage + ' reflects ' + reflected + ' ignoring caster Spell Block', () => {
        const f = damageFixture(); const target = f.enemies[0];
        if (side === PlayerSide.Right) {
          f.state.teams.Left.characters = f.enemies; f.state.teams.Right.characters = [f.caster];
        }
        target.statuses = [{ id: 'reflect', turns: 3 }]; f.caster.armor = 2;
        f.caster.traitIds = ['spellblock']; attachPassives(f.caster);
        const ev = damageEffect({ targets: [target], scaling: { base: damage, mult: 0 } }).apply(f.ctx);
        expect(ev.filter(e => e.type === 'skill-damage').map(e => [e.casterId, e.targetId, e.damage])).toEqual([[0, 10, damage], [10, 0, reflected]]);
        expect(target.hp).toBe(1000 - damage);
        expect(f.caster.armor).toBe(Math.max(0, 2 - reflected));
        expect(f.caster.hp).toBe(1000 - Math.max(0, reflected - 2));
        expect(hasStatus(target, 'reflect')).toBe(false);
      });
    }
    it('skull damage ' + damage + ' uses the same official floor', () => {
      const f = damageFixture(); f.caster.attack = damage; f.enemies[0].statuses = [{ id: 'reflect', turns: 3 }];
      const ev = new CombatResolver().resolveSkullDamage(f.state.teams.Left, f.state.teams.Right, 3).events;
      expect(ev.filter(e => e.type === 'skull-damage').map(e => [e.targetId, e.damage])).toEqual([[10, damage], [0, reflected]]);
      expect(hasStatus(f.enemies[0], 'reflect')).toBe(false);
    });
  }
  for (const self of [false, true]) for (const range of ['single', 'all', 'scatter', 'splash'] as const) {
    it((self ? 'self' : 'ally') + ' damage / ' + range + ' neither triggers nor consumes Reflect', () => {
      const f = damageFixture(); const target = self ? f.caster : f.enemies[0];
      if (!self) { f.state.teams.Right.characters = f.enemies.slice(1); f.state.teams.Left.characters.push(target); }
      target.statuses = [{ id: 'reflect', turns: 3 }];
      const ev = damageEffect({ targets: [target], scaling: { base: 13, mult: 0 }, range }).apply(f.ctx);
      expect(ev.some(e => e.type === 'status-expire' && e.statusId === 'reflect')).toBe(false);
      expect(hasStatus(target, 'reflect')).toBe(true);
      expect(ev.filter(e => e.type === 'skill-damage').every(e => e.casterId === f.caster.id)).toBe(true);
    });
  }
  it('zero incoming damage leaves Reflect in place', () => {
    const f = damageFixture(); const target = f.enemies[0]; target.statuses = [{ id: 'reflect', turns: 3 }];
    expect(damageEffect({ targets: [target], scaling: { base: 0, mult: 0 } }).apply(f.ctx)).toEqual([]);
    expect(hasStatus(target, 'reflect')).toBe(true);
  });
  it('a barrier-blocked incoming hit leaves Reflect in place', () => {
    const f = damageFixture(); const target = f.enemies[0]; target.statuses = [{ id: 'reflect', turns: 3 }, { id: 'barrier', turns: 3 }];
    const ev = damageEffect({ targets: [target], scaling: { base: 13, mult: 0 } }).apply(f.ctx);
    expect(ev.filter(e => e.type === 'skill-damage')).toEqual([]);
    expect(hasStatus(target, 'reflect')).toBe(true); expect(hasStatus(target, 'barrier')).toBe(false);
  });
});


describe('Reflect damage participates in Barrier protection, but never recursively reflects', () => {
  it('preserves the official general Barrier protection rule used for the reflected recipient', () => {
    const statusPage = fs.readFileSync('artifacts/gow-skill-audit/gold-primary-sources/official-status-effects.html', 'utf8');
    expect(statusPage).toContain('Protects from one instance or turn of damage (including Spells and Skulls)');
  });
  for (const side of [PlayerSide.Left, PlayerSide.Right]) {
    for (const skull of [false, true]) {
      it(side + (skull ? ' skull' : ' spell') + ': source Barrier absorbs only the reflected hit', () => {
        const f = damageFixture(); const victim = f.enemies[0];
        if (side === PlayerSide.Right) { f.state.teams.Left.characters = f.enemies; f.state.teams.Right.characters = [f.caster]; }
        f.caster.attack = 13; f.caster.hp = 1; f.caster.armor = 0;
        f.caster.statuses = [{ id: 'barrier', turns: 3 }, { id: 'reflect', turns: 3 }];
        victim.statuses = [{ id: 'reflect', turns: 3 }];
        const ev = skull
          ? new CombatResolver().resolveSkullDamage(f.state.teams[side], f.state.teams[side === PlayerSide.Left ? PlayerSide.Right : PlayerSide.Left], 3).events
          : damageEffect({ targets: [victim], scaling: { base: 13, mult: 0 } }).apply(f.ctx);
        expect(victim.hp).toBe(987); expect(f.caster.hp).toBe(1); expect(f.caster.defeated).toBe(false);
        expect(ev.filter(e => e.type === 'skill-damage' || e.type === 'skull-damage').map(e => [e.targetId, e.damage])).toEqual([[10, 13]]);
        expect(ev.filter(e => e.type === 'status-expire').map(e => [e.targetId, e.statusId])).toEqual([[0, 'barrier'], [10, 'reflect']]);
        expect(hasStatus(f.caster, 'reflect')).toBe(true); expect(hasStatus(victim, 'reflect')).toBe(false);
        expect(ev.some(e => e.type === 'defeat')).toBe(false);
      });
      it(side + (skull ? ' skull' : ' spell') + ': unblocked reflection does not rebound again', () => {
        const f = damageFixture(); const victim = f.enemies[0];
        if (side === PlayerSide.Right) { f.state.teams.Left.characters = f.enemies; f.state.teams.Right.characters = [f.caster]; }
        f.caster.attack = 13; f.caster.statuses = [{ id: 'reflect', turns: 3 }]; victim.statuses = [{ id: 'reflect', turns: 3 }];
        const ev = skull
          ? new CombatResolver().resolveSkullDamage(f.state.teams[side], f.state.teams[side === PlayerSide.Left ? PlayerSide.Right : PlayerSide.Left], 3).events
          : damageEffect({ targets: [victim], scaling: { base: 13, mult: 0 } }).apply(f.ctx);
        expect(ev.filter(e => e.type === 'skill-damage' || e.type === 'skull-damage').map(e => [e.targetId, e.damage])).toEqual([[10, 13], [0, 6]]);
        expect(f.caster.hp).toBe(994); expect(victim.hp).toBe(987); expect(hasStatus(f.caster, 'reflect')).toBe(true);
      });
    }
    it(side + ': friendly skull damage cannot activate or consume Reflect', () => {
      const f = damageFixture(); const ally = f.enemies[0];
      f.state.teams[side].characters = [f.caster, ally];
      f.state.teams[side === PlayerSide.Left ? PlayerSide.Right : PlayerSide.Left].characters = f.enemies.slice(1);
      f.caster.attack = 13; f.caster.statuses = [{ id: 'charm', turns: 3 }]; ally.statuses = [{ id: 'reflect', turns: 3 }];
      const ev = new CombatResolver().resolveSkullDamage(f.state.teams[side], f.state.teams[side === PlayerSide.Left ? PlayerSide.Right : PlayerSide.Left], 3).events;
      expect(ev.filter(e => e.type === 'skull-damage').map(e => [e.targetId, e.damage])).toEqual([[10, 13]]);
      expect(f.caster.hp).toBe(1000); expect(ally.hp).toBe(987); expect(hasStatus(ally, 'reflect')).toBe(true);
    });
  }
});
