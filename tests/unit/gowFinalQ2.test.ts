// sa-Q2 final wrap-up: issued skills of lanes L1 / L3 / L4b / L5 / L6 / L7 re-checked after the fixed primitives
// (sa-P fix rounds) and rulings R010-R016. Each case pins the behaviour the acceptance was based on.
import { describe, it, expect } from 'vitest';
import { castSpell } from '../helpers/gowCast';

const has = (order: string[], s: string) => order.some(x => x === s || x.startsWith(s));

describe('sa-Q2 B01: Remove* family (P-F1-remove-gems, R010) + Sunbird rebirth', () => {
  it('troop:6076 Goblin King: counted before remove, 8 + floor(11/2) Life, goblin summon, extra turn', () => {
    const { summary: s } = castSpell({ key: 'troop:6076' });
    expect(s.order[0]).toBe('buff C hp+13 max+13');
    expect(has(s.order, 'destroy 11 (Blue x11)')).toBe(true);
    expect(s.summons.length).toBe(1);
    expect(s.extraTurn).toBe('skill');
  });
  it('troop:6207 Spirit Fox: drain 7 -> true damage 1+10+floor(9/2) -> remove Yellow (native order)', () => {
    const { summary: s } = castSpell({ key: 'troop:6207' });
    expect(s.order.slice(0, 3)).toEqual(['buff E11 mana-7', 'dmg E11 15', 'destroy 9 (Yellow x9)']);
  });
  it('troop:6328 Krystenax: 4+10+floor(11/2) to all enemies before the remove, Silver Drakon summoned', () => {
    const { summary: s } = castSpell({ key: 'troop:6328' });
    expect(s.order.slice(0, 4)).toEqual(['dmg E10 19 (all)', 'dmg E11 19 (all)', 'dmg E12 19 (all)', 'dmg E13 19 (all)']);
    expect(s.summons).toEqual(['troop:6321']);
  });
  it('troop:6970 Argos: remove chosen colour, dispel front enemy, drain mana by the removed count', () => {
    const { summary: s } = castSpell({ key: 'troop:6970', enemies: [{ hp: 600, maxHp: 600, mana: 30, colors: [], statuses: [{ id: 'rage', turns: 99 }] as never }] });
    expect(s.order[0]).toBe('destroy 11 (Blue x11)');
    expect(has(s.order, 'buff E10 mana-11')).toBe(true);
    expect(s.units.E10).toContain('-rage');
  });
  it('troop:6387 Sunbird: caster really dies, a fresh Sunbird is summoned (P-F1-summon-after-caster-death)', () => {
    const { summary: s } = castSpell({ key: 'troop:6387' });
    expect(s.units.C).toContain('DEAD');
    expect(s.summons).toEqual(['troop:6387']);
  });
});
