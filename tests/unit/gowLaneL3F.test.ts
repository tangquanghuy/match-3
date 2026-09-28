/**
 * Lane L3 review (sa-F, round 7): table-driven checks for behaviour the default scenarios do not show.
 */
import { describe, expect, it } from 'vitest';
import { castSpell } from '../helpers/gowCast';
import { BaseColor } from '@engine/types';
import type { Character } from '@engine/types';
type E = Partial<Character>;
const st = (...ids: string[]) => ids.map(id => ({ id, turns: 3 })) as Character['statuses'];
const en = (extra: E = {}): E => ({ hp: 100, maxHp: 100, armor: 0, mana: 0, colors: [BaseColor.Red], ...extra });
const order = (r: ReturnType<typeof castSpell>) => r.summary.order;

describe('sa-F B01: counted status mana / extra turn', () => {
  it('troop:6454 Hind (7632): 2 Mana per Entangled enemy, counted before the kill; 4 Entangled = 100% extra turn', () => {
    const r = castSpell({ key: 'troop:6454', target: 10, enemies: [en({ hp: 1, maxHp: 1, statuses: st('entangle') }), en({ statuses: st('entangle') }), en()] });
    expect(order(r)[0]).toBe('buff C mana+4');
    expect(order(r)).toContain('defeat E10');
    const all = castSpell({ key: 'troop:6454', enemies: [0, 1, 2, 3].map(() => en({ statuses: st('entangle') })) });
    expect(order(all)[0]).toBe('buff C mana+8');
    expect(all.summary.extraTurn).toBe('skill');
    const none = castSpell({ key: 'troop:6454', enemies: [en(), en()] });
    expect(order(none).filter(o => o.includes('mana') || o.startsWith('extra-turn'))).toEqual([]);
  });
  it('weapon:1211 StoneAegis (7806): 8 Attack and 2 Mana per enemy Barrier, no base', () => {
    const r = castSpell({ key: 'weapon:1211', enemies: [en({ statuses: st('barrier') }), en({ statuses: st('barrier') }), en()] });
    expect(order(r).filter(o => o.includes('attack') || o.includes('mana'))).toEqual([
      'buff C attack+16', 'buff A1 attack+16', 'buff A2 attack+16', 'buff C mana+4', 'buff A1 mana+4', 'buff A2 mana+4']);
  });
  it('troop:6897 ArachnaeanWatcher (8358): Life 1 + Magic + 6 per Webbed enemy; quarter Mana to the other allies only', () => {
    const r = castSpell({ key: 'troop:6897', enemies: [en({ statuses: st('web') }), en({ statuses: st('web') }), en()] });
    expect(order(r)[0]).toBe('buff C hp+23 max+23');
    expect(order(r).filter(o => o.includes('mana')).map(o => o.split(' ')[1])).toEqual(['A1', 'A2']);
  });
  it('troop:7806 SetauriSkulk (9847): a Bleeding target killed by the true damage still counts', () => {
    const r = castSpell({ key: 'troop:7806', target: 10, enemies: [en({ hp: 1, maxHp: 1, statuses: st('bleed') }), en({ statuses: st('bleed') }), en()] });
    expect(order(r)[0]).toBe('buff C mana+4');
    expect(order(r)).toContain('defeat E10');
  });
  it('troop:7074 HelgorTheGuardian (8602): 1-3 Red Mana Potions; 50% extra turn only when an enemy is Burning', () => {
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const burning = seeds.map(seed => castSpell({ key: 'troop:7074', seed, enemies: [en({ statuses: st('burning') }), en()] }));
    const extra = burning.filter(r => r.summary.extraTurn === 'skill').length;
    expect(extra).toBeGreaterThan(0);
    expect(extra).toBeLessThan(seeds.length);
    for (const r of burning) {
      const potions = order(r).find(o => o.includes('manaPotionGem/Red'));
      expect(potions).toMatch(/-> manaPotionGem\/Red x[123]$/);
    }
    const cold = seeds.map(seed => castSpell({ key: 'troop:7074', seed, enemies: [en(), en()] }));
    expect(cold.every(r => r.summary.extraTurn === null)).toBe(true);
  });
});
