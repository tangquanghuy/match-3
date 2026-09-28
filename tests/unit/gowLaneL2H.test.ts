// sa-H lane L2 (random branches / random statuses) review round 8: seed sweeps for the cases the four
// standard golden scenarios cannot show (per-target rolls, PrefNotPrev with a lone enemy, chances, branch weights).
import { describe, it, expect } from 'vitest';
import { castSpell, type CastOpts } from '../helpers/gowCast';
import { RANDOM_NEGATIVE_STATUS_POOL, RANDOM_POSITIVE_STATUS_POOL } from '@engine/skills/effects/status';
const SEEDS = 300;
const orderOf = (o: CastOpts) => { const s = castSpell(o).summary; const i = s.order.indexOf('~cascade~'); return i < 0 ? s.order : s.order.slice(0, i); };
const statusesOn = (order: string[], who: string) => order.filter(l => l.startsWith(`status ${who} +`)).map(l => l.split('+')[1]);
const within = (got: number, share: number, label: string) => { expect(got, label).toBeGreaterThan(share * 0.6); expect(got, label).toBeLessThan(share * 1.4); };
const ONE_ENEMY = [{ hp: 900, maxHp: 900, armor: 0 }];

describe('sa-H L2 B01', () => {
  it('troop:6658 every ally (caster included) gets one positive status', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const o = orderOf({ key: 'troop:6658', seed });
      for (const w of ['C', 'A1', 'A2']) { const s = statusesOn(o, w); expect(s.length).toBe(1); expect(RANDOM_POSITIVE_STATUS_POOL).toContain(s[0]); }
    }
  });
  it('troop:7047 each of the last 2 enemies rolls its own random status, then both are Poisoned', () => {
    let differ = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const o = orderOf({ key: 'troop:7047', seed });
      const a = statusesOn(o, 'E12'), b = statusesOn(o, 'E13');
      expect(a.length).toBe(2); expect(b.length).toBe(2); expect(a[1]).toBe('poison'); expect(b[1]).toBe('poison');
      expect(RANDOM_NEGATIVE_STATUS_POOL).toContain(a[0]); expect(RANDOM_NEGATIVE_STATUS_POOL).toContain(b[0]);
      if (a[0] !== b[0]) differ++;
      expect(statusesOn(o, 'E10').length + statusesOn(o, 'E11').length).toBe(0);
    }
    expect(differ).toBeGreaterThan(70);
    // a lone enemy is both "last 2": one random status + Poison, not two random statuses
    const o = orderOf({ key: 'troop:7047', enemies: ONE_ENEMY });
    expect(statusesOn(o, 'E10').length).toBe(2);
  });
  it('troop:6706 second hit is RandomPrefNotPrev: never the first target while others live; repeats a lone enemy', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const hits = orderOf({ key: 'troop:6706', seed }).filter(l => l.startsWith('dmg ')).map(l => l.split(' ')[1]);
      expect(hits.length).toBe(2); expect(hits[0]).not.toBe(hits[1]);
    }
    const o = orderOf({ key: 'troop:6706', enemies: ONE_ENEMY });
    expect(o.filter(l => l === 'dmg E10 11').length).toBe(2);
    expect(statusesOn(o, 'E10').length).toBe(2);
  });
  it('troop:6159 Treasure Map with 20% chance', () => {
    let maps = 0;
    for (let seed = 1; seed <= SEEDS; seed++) if (castSpell({ key: 'troop:6159', seed }).summary.economy.maps) maps++;
    within(maps / SEEDS, 0.2, 'maps');
  });
  it('troop:6659 ABC-DEF: 1/2 enemy branch, 1/2 ally branch; second status 50%', () => {
    const t = { e1: 0, e2: 0, a1: 0, a2: 0 };
    for (let seed = 1; seed <= SEEDS; seed++) {
      const o = orderOf({ key: 'troop:6659', seed });
      expect(o.filter(l => l.startsWith('dmg ')).length).toBe(4);
      const e = statusesOn(o, 'E11').length, a = statusesOn(o, 'A2').length;
      expect(e === 0 || a === 0).toBe(true);
      if (e === 1) t.e1++; if (e === 2) t.e2++; if (a === 1) t.a1++; if (a === 2) t.a2++;
    }
    for (const [k, v] of Object.entries(t)) within(v / SEEDS, 0.25, `6659 ${k}`);
  });
});
