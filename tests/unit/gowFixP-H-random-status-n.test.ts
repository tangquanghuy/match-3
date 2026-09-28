// sa-P round 9: P-H-random-status-n. RandomStatusSegment carries n / nRange so FirstN / LastN random statuses
// roll one status per unit. troop:6809 (8212, native RandomPositiveStatusEffect@FirstTwoAllies) and
// troop:7047 (8572, RandomStatusEffect@LastTwoEnemies; was split into enemySecondLast + enemyLastN).
import { describe, it, expect } from 'vitest';
import { castSpell } from '../helpers/gowCast';
import { inflictRandom } from '@engine/skills/builders';

const clean = { hp: 500, maxHp: 500, armor: 0, statuses: [] };
const ids = (xs: { id: string }[]) => xs.map((s) => s.id);

describe('P-H-random-status-n', () => {
  it('inflictRandom keeps n / nRange', () => {
    expect(inflictRandom('enemyLastN', { n: 2 }).n).toBe(2);
    expect(inflictRandom('allyFirstN', { nRange: { min: 1, max: 3 } }).nRange).toEqual({ min: 1, max: 3 });
  });

  it('troop:6809 status branch: caster and A1 (first 2 allies) each roll one positive status, A2 none', () => {
    let hits = 0;
    for (let seed = 1; seed <= 80; seed++) {
      const r = castSpell({ key: 'troop:6809', seed, caster: { statuses: [] }, allies: [{ ...clean }, { ...clean }], enemies: [clean, clean, clean, clean] });
      const [a1, a2] = r.f.allies;
      if (r.f.caster.statuses.length === 0) { expect(a1.statuses).toEqual([]); continue; }
      hits++;
      expect(a1.statuses.length).toBe(1);
      expect(a2.statuses).toEqual([]);
    }
    expect(hits).toBeGreaterThan(0);
  });

  it('troop:7047: last 2 enemies each roll one random status (plus Poison), first 2 untouched', () => {
    let nonPoison = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const r = castSpell({ key: 'troop:7047', seed, enemies: [clean, clean, clean, clean] });
      const [e0, e1, e2, e3] = r.f.enemies;
      expect(e0.statuses).toEqual([]);
      expect(e1.statuses).toEqual([]);
      for (const e of [e2, e3]) {
        expect(ids(e.statuses)).toContain('poison');
        if (ids(e.statuses).some((s) => s !== 'poison')) nonPoison++;
      }
    }
    expect(nonPoison).toBeGreaterThan(20);
  });

  it('troop:7047 lone enemy: one random roll, still poisoned', () => {
    const r = castSpell({ key: 'troop:7047', seed: 3, enemies: [clean] });
    expect(ids(r.f.enemies[0].statuses)).toContain('poison');
  });
});
