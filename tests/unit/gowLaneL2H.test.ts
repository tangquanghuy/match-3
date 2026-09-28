// sa-H lane L2 (random branches / random statuses) review round 8: seed sweeps for the cases the four
// standard golden scenarios cannot show (per-target rolls, PrefNotPrev with a lone enemy, chances, branch weights).
import { describe, it, expect } from 'vitest';
import { castSpell, setupCast, summarize, type CastOpts } from '../helpers/gowCast';
import { RANDOM_NEGATIVE_STATUS_POOL, RANDOM_POSITIVE_STATUS_POOL } from '@engine/skills/effects/status';
import { FixedBranchChooser } from '@engine/skills/branchChooser';
import { BaseColor } from '@engine/types';
const choose = (o: CastOpts, branch: number) => { const f = setupCast(o); f.engine.setBranchChooser(new FixedBranchChooser(branch)); return summarize(f, f.cast()).order; };
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

describe('sa-H L2 B02', () => {
  it('troop:6232 1 sure + 4 x 50% random status rolls on the damaged enemy', () => {
    const counts = [0, 0, 0, 0, 0, 0];
    for (let seed = 1; seed <= SEEDS; seed++) {
      // statuses applied = rolls; count status-apply lines, duplicates of the same id still emit a line
      const f = setupCast({ key: 'troop:6232', seed }); const ev = f.cast();
      const n = ev.filter(e => e.type === 'status-apply' && e.targetId === 11).length;
      expect(n).toBeGreaterThanOrEqual(1); expect(n).toBeLessThanOrEqual(5); counts[n]++;
    }
    within(counts[1] / SEEDS, 1 / 16, '1'); within(counts[3] / SEEDS, 6 / 16, '3'); within(counts[5] / SEEDS, 1 / 16, '5');
  });
  it('troop:7147 random status on every enemy only when the target dies', () => {
    expect(orderOf({ key: 'troop:7147' }).some(l => l.startsWith('status'))).toBe(false);
    const o = orderOf({ key: 'troop:7147', enemies: [{ hp: 900, maxHp: 900 }, { hp: 1, maxHp: 1, armor: 0 }, { hp: 900, maxHp: 900 }] });
    expect(statusesOn(o, 'E10').length).toBe(1); expect(statusesOn(o, 'E12').length).toBe(1); expect(statusesOn(o, 'E11').length).toBe(0);
  });
  it('troop:7737 Choose: A = -[M+2] Attack + Curse, B = -[M+2] random Skill + Death Mark', () => {
    expect(choose({ key: 'troop:7737' }, 0)).toEqual(['buff E11 attack-12', 'status E11 +curse']);
    const seen = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) {
      const o = choose({ key: 'troop:7737', seed, enemies: [{}, { hp: 900, maxHp: 900, armor: 30, attack: 30, magic: 30 }] }, 1);
      expect(o[1]).toBe('status E11 +death-mark'); seen.add(o[0].replace(/-?\d+$/, ''));
      expect(o[0]).toMatch(/-12$/);
    }
    expect([...seen].sort()).toEqual(['buff E11 armor', 'buff E11 attack', 'buff E11 hp', 'buff E11 magic']);
  });
  it('troop:7881 -[M+1] Attack from enemies of the chosen colour, then 1/2 Purple | 1/2 Terror', () => {
    const enemies = [{ colors: [BaseColor.Blue] }, { colors: [BaseColor.Red] }, { colors: [BaseColor.Blue, BaseColor.Green] }];
    let terror = 0;
    for (let seed = 1; seed <= SEEDS; seed++) {
      const o = orderOf({ key: 'troop:7881', seed, enemies });
      expect(o.slice(0, 2)).toEqual(['buff E10 attack-11', 'buff E12 attack-11']);
      expect(o[2]).toMatch(/^convert Blue x\d+ -> (Purple|terrorGem) x\d+$/);
      if (o[2].includes('terrorGem')) terror++;
    }
    within(terror / SEEDS, 0.5, 'terror');
  });
  it('troop:6947 -[M+1] Attack then three independent random statuses', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const f = setupCast({ key: 'troop:6947', seed }); const ev = f.cast();
      expect(ev.filter(e => e.type === 'status-apply' && e.targetId === 11).length).toBe(3);
    }
  });
});
