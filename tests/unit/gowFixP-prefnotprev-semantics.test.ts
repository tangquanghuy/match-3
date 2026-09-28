// sa-P fix round A: P-prefnotprev-semantics (rulings/R007 §3).
// Native RandomPrefNotPrev{Enemy,Ally} avoids only the immediately previous target; when that target is the only one
// alive it may be hit again. R006-C3 (prefer not-yet-hit) applies only to chains without that native step (8160).
import { describe, it, expect } from 'vitest';
import { castSpell } from '../helpers/gowCast';
import type { GameEvent } from '@engine/events';

const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);
const E4 = [0, 1, 2, 3].map(() => ({ hp: 5000, maxHp: 5000, armor: 0 }));
/** Primary target of every spell damage wave (splash centre = the hit with index 0 / fromId caster). */
const centres = (ev: GameEvent[], _casterId: number) => ev.filter((e) => e.type === 'skill-damage' && !e.skullBurst
  && (e.range !== 'splash' || !e.chainIndex)).map((e) => (e as { targetId: number }).targetId);
const noConsecutive = (xs: number[]) => xs.every((x, i) => i === 0 || x !== xs[i - 1]);
const repeatsEarlier = (xs: number[]) => xs.some((x, i) => i >= 2 && xs.slice(0, i - 1).includes(x) && new Set(xs.slice(0, i)).size < 4);

describe('P-prefnotprev-semantics: enemy damage chains', () => {
  for (const [key, waves] of [['troop:6866', 6], ['troop:7576', 4], ['troop:7581', 5]] as const) {
    it(`${key}: ${waves} waves never hit the same enemy twice in a row, and can return to an earlier target while an unhit enemy lives`, () => {
      let returned = false;
      for (const seed of SEEDS) {
        const r = castSpell({ key, seed, enemies: E4 });
        const c = centres(r.events, r.f.caster.id);
        expect(c).toHaveLength(waves);
        expect(noConsecutive(c)).toBe(true);
        if (repeatsEarlier(c)) returned = true;
      }
      expect(returned).toBe(true);
    });
  }
  it('troop:6870 spell 8294 (chance-gated splash waves): executed waves never repeat the previous centre', () => {
    for (const seed of SEEDS) {
      const c = centres(castSpell({ key: 'troop:6870', seed, enemies: E4 }).events, 0);
      expect(c.length).toBeGreaterThanOrEqual(1);
      expect(noConsecutive(c)).toBe(true);
    }
  });
  it('troop:6866: one enemy alive -> every wave hits it (repeat allowed)', () => {
    const r = castSpell({ key: 'troop:6866', enemies: [{ hp: 5000, maxHp: 5000, armor: 0 }] });
    expect(centres(r.events, r.f.caster.id)).toEqual([10, 10, 10, 10, 10, 10]);
  });
  it('troop:6770 spell 8160 (3 x plain RandomEnemy, R006-C3): 3 distinct centres on 4 enemies', () => {
    for (const seed of SEEDS) {
      const r = castSpell({ key: 'troop:6770', seed, enemies: E4 });
      expect(new Set(centres(r.events, r.f.caster.id)).size).toBe(3);
    }
  });
  it('weapon:1142 spell 7338 (targeting mode): consecutive steps differ; step 3 may hit step 1 target', () => {
    let returned = false;
    for (const seed of SEEDS) {
      const r = castSpell({ key: 'weapon:1142', seed, enemies: E4 });
      const order = r.events.filter((e) => e.type === 'status-apply' || e.type === 'skill-damage').map((e) => (e as { targetId: number }).targetId);
      expect(order).toHaveLength(4);
      expect(noConsecutive(order)).toBe(true);
      if (order[2] === order[0] || order[3] === order[1] || order[3] === order[0]) returned = true;
    }
    expect(returned).toBe(true);
  });
});

describe('P-prefnotprev-semantics: ally chains (RandomAlly then RandomPrefNotPrevAlly)', () => {
  const buffs = (ev: GameEvent[], stat: string) => {
    const m = new Map<number, number>();
    for (const e of ev) if (e.type === 'buff' && e.stat === stat && e.amount > 0) m.set(e.targetId, (m.get(e.targetId) ?? 0) + e.amount);
    return m;
  };
  it('troop:7628 spell 9528: 3 x +2 Magic over 3 allies; consecutive picks differ, first and third may coincide (+4)', () => {
    let doubled = false;
    for (const seed of SEEDS) {
      const r = castSpell({ key: 'troop:7628', seed });
      const m = buffs(r.events, 'magic');
      expect([...m.values()].reduce((a, b) => a + b, 0)).toBe(6);
      if ([...m.values()].includes(4)) doubled = true;
    }
    expect(doubled).toBe(true);
  });
  it('troop:7628 spell 9528: caster alone -> all three steps hit the caster (+6)', () => {
    const r = castSpell({ key: 'troop:7628', allies: [] });
    expect(buffs(r.events, 'magic').get(0)).toBe(6);
  });
  it('troop:7830 spell 9874: caster alone -> Life +1 twice', () => {
    const r = castSpell({ key: 'troop:7830', allies: [] });
    expect(buffs(r.events, 'hp').get(0)).toBe(2);
  });
  it('troop:6627 spell 7945: second Submerged (PrefNotPrevAlly after Self) never lands on the caster while allies live', () => {
    for (const seed of SEEDS) {
      const r = castSpell({ key: 'troop:6627', seed });
      const sub = r.events.filter((e) => e.type === 'status-apply' && e.statusId === 'submerged').map((e) => (e as { targetId: number }).targetId);
      expect(sub[0]).toBe(0);
      expect(sub.slice(1).every((id) => id !== 0)).toBe(true);
    }
  });
});
