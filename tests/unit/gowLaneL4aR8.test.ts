/**
 * Lane L4a review round 8 (sa-A): table-driven checks for behaviour the default scenarios do not show.
 */
import { describe, expect, it } from 'vitest';
import { BaseColor } from '@engine/types';
import { castSpell, setupCast, summarize } from '../helpers/gowCast';

describe('L4a R8 B01', () => {
  // weapon:1578 Frostbound (9300): CreateGems2Colors 16 Ghost>Freeze ; ExplodeGems 1 (spell Target None = random gem).
  it('weapon:1578 creates 16 Ghost/Freeze Gems and explodes one random gem (no chosen cell)', () => {
    const r = castSpell({ key: 'weapon:1578' });
    const c = r.summary.gems.created;
    expect((c.ghost ?? 0) + (c.freezeGem ?? 0)).toBe(16);
    expect(c.ghost).toBeGreaterThan(0); expect(c.freezeGem).toBeGreaterThan(0);
    expect(r.summary.order.filter(o => o.startsWith('explode ')).length).toBeGreaterThanOrEqual(1);
    const centres = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) {
      const ev = castSpell({ key: 'weapon:1578', seed }).events.find(e => e.type === 'gem-explode') as unknown as { cells: { pos: { row: number; col: number } }[] };
      centres.add(JSON.stringify(ev.cells.map(p => `${p.pos.row},${p.pos.col}`).sort()));
    }
    expect(centres.size).toBeGreaterThan(1); // not always the same (chosen) cell
  });
  // troop:7594 CrestedAva (9473): Damage@FromTarget 2+M [Tower x Ascension: R000 waived] ;
  // DecreaseSpellPower@FromTarget [AddForAnyStorm 5] ; StormRandom.
  it('troop:7594 removes 5 Magic from the target only when a Storm is already present', () => {
    const f = setupCast({ key: 'troop:7594' });
    f.engine.debugSetStorm(BaseColor.Red, f.side);
    const magic0 = f.enemies[1].magic;
    const s = summarize(f, f.cast());
    expect(s.order[0]).toBe('dmg E11 12');
    expect(f.enemies[1].magic).toBe(Math.max(0, magic0 - 5));
    const r = castSpell({ key: 'troop:7594' });
    expect(r.f.enemies[1].magic).toBe(magic0);
    expect(r.summary.order.some(o => /^storm \w+ set$/.test(o))).toBe(true);
  });
  // troop:6476 OwlRider (7663): Damage@WeakestEnemy 3+M ; DestroyColor Purple [AddForKill].
  it('troop:6476 destroys Purple only on a kill', () => {
    expect(castSpell({ key: 'troop:6476' }).summary.order.some(o => o.startsWith('destroy'))).toBe(false);
    const r = castSpell({ key: 'troop:6476', enemies: [{}, {}, { hp: 5, maxHp: 5, armor: 0 }, {}] });
    expect(r.summary.order).toContain('defeat E12');
    expect(r.summary.order.find(o => o.startsWith('destroy'))).toMatch(/^destroy \d+ \(Purple x\d+\)$/);
  });
});
