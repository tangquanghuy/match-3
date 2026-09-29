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

describe('sa-Q2 B02: harness-leak items (fixed on main: fresh templates) + Doomclaw', () => {
  it('troop:6047 Black Beast: devour the chosen ally, heal to full, 6 Skulls', () => {
    const { f, summary: s } = castSpell({ key: 'troop:6047' });
    expect(s.order[0]).toMatch(/^dmg A1 \d+ devoured$/);
    expect(f.caster.hp).toBe(f.caster.maxHp);
    expect(s.gems.created.skull).toBe(6);
  });
  it('troop:6326 Princess Elspeth: 11 gems of the chosen ally colour, ally killed, knight summoned', () => {
    const { summary: s } = castSpell({ key: 'troop:6326' });
    expect(s.gems.created.Blue).toBe(11);
    expect(s.units.A1).toContain('DEAD');
    expect(s.summons.length).toBe(1);
  });
  it('troop:7625 Mantichoras: 3 true hits (prefer not previous), 8 mana drain each, doubled on a poisoned enemy', () => {
    const poisoned = { hp: 500, maxHp: 500, mana: 30, statuses: [{ id: 'poison', turns: 99 }] as never };
    const { summary: s } = castSpell({ key: 'troop:7625', enemies: [poisoned, { hp: 500, maxHp: 500, mana: 30 }] });
    const dmg = s.order.filter(x => x.startsWith('dmg '));
    expect(dmg.length).toBe(3);
    expect(dmg.every(x => x.endsWith(' 13'))).toBe(true);
    const drains = s.order.filter(x => x.startsWith('buff '));
    expect(drains.filter(x => x.startsWith('buff E10')).every(x => x.endsWith('mana-16'))).toBe(true);
    expect(drains.filter(x => x.startsWith('buff E11')).every(x => x.endsWith('mana-8'))).toBe(true);
  });
  it('troop:6410 Doomclaw: separate 25% devours of the NEXT enemy below then above (not the whole column)', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) {
      const { summary: s } = castSpell({ key: 'troop:6410', target: 12, seed });
      expect(s.order[0]).toBe('dmg E12 18');
      s.order.filter(x => x.endsWith('devoured')).forEach(x => seen.add(x.split(' ')[1]));
      const dev = s.order.filter(x => x.endsWith('devoured')).map(x => x.split(' ')[1]);
      if (dev.length === 2) expect(dev).toEqual(['E13', 'E11']);
    }
    expect([...seen].sort()).toEqual(['E11', 'E13']); // E10 (two above) never devoured
  });
});
