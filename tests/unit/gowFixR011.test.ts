// sa-P review round 2: R011 (Blessed blocks negative statuses only).
// Blessed units still receive positive statuses (Barrier, Enchanted, Reflect, Enraged, Submerged);
// negatives (Poison, Silence, Frozen, Stun, Charm, ...) stay blocked; Curse still cancels Blessed.
import { describe, it, expect } from 'vitest';
import { applyStatus, hasStatus } from '@engine/skills/effects/status';
import type { Character } from '@engine/types';
import { castSpell } from '../helpers/gowCast';
import { damageCharacter } from '../helpers/damageFixture';

const blessedUnit = () => damageCharacter(1, { statuses: [{ id: 'blessed', turns: 99 }] as Character['statuses'] });

describe('R011: applyStatus on a Blessed unit', () => {
  for (const id of ['barrier', 'enchanted', 'reflect', 'enraged', 'rage', 'submerged']) {
    it(`positive ${id} is applied`, () => {
      const u = blessedUnit();
      expect(applyStatus(u, { id, turns: 99 })).toEqual([expect.objectContaining({ type: 'status-apply', statusId: id })]);
      expect(hasStatus(u, id)).toBe(true);
      expect(hasStatus(u, 'blessed')).toBe(true);
    });
  }
  for (const id of ['poison', 'silence', 'frozen', 'stun', 'burning', 'bleed', 'entangle', 'web', 'disease', 'charm', 'mana-burn', 'death-mark', 'marked', 'terror', 'faerie-fire']) {
    it(`negative ${id} is blocked`, () => {
      const u = blessedUnit();
      expect(applyStatus(u, { id, turns: 3 })).toEqual([]);
      expect(hasStatus(u, id)).toBe(false);
    });
  }
  it('Curse still cancels Blessed (both removed)', () => {
    const u = blessedUnit();
    applyStatus(u, { id: 'curse', turns: 3 });
    expect(hasStatus(u, 'blessed')).toBe(false);
    expect(hasStatus(u, 'curse')).toBe(false);
  });
});

describe('R011: troop:7700 Gormungandr spell 9661 (Bless and Enchant self on kill)', () => {
  it('K scenario: caster ends Blessed AND Enchanted', () => {
    const r = castSpell({ key: 'troop:7700', enemies: [0, 1, 2, 3].map(() => ({ hp: 1, maxHp: 1, armor: 0 })) });
    expect(r.summary.order).toEqual(expect.arrayContaining(['status C +blessed', 'status C +enchanted']));
    expect(hasStatus(r.f.caster, 'blessed')).toBe(true);
    expect(hasStatus(r.f.caster, 'enchanted')).toBe(true);
  });
  it('troop:7666 spell 9594: Elemental ally is Blessed and then gets Barrier', () => {
    const r = castSpell({ key: 'troop:7666', target: 1, allies: [{ troopTypes: ['Elemental'] }, {}] });
    expect(r.f.allies[0].statuses.map((s) => s.id)).toEqual(['blessed', 'barrier']);
  });
  it('troop:6966 spell 8469: Fey ally is Blessed and then Enchanted', () => {
    const r = castSpell({ key: 'troop:6966', target: 1, allies: [{ troopTypes: ['Fey'] }, {}] });
    expect(r.f.allies[0].statuses.map((s) => s.id)).toEqual(['blessed', 'enchanted']);
  });
});
