/**
 * Lane L4a review round 8 (sa-A): table-driven checks for behaviour the default scenarios do not show.
 */
import { describe, expect, it } from 'vitest';
import { BaseColor, colorGem, skullGem } from '@engine/types';
import { castSpell, setupCast, summarize, reviewBoard, type BoardFn } from '../helpers/gowCast';

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

/** exactly n gems of `color` (first n cells), the rest cycle four other colours without pre-made matches */
const exactly = (color: BaseColor, n: number): BoardFn => {
  const rest = [BaseColor.Red, BaseColor.Green, BaseColor.Yellow, BaseColor.Purple, BaseColor.Blue, BaseColor.Brown].filter(c => c !== color).slice(0, 4);
  return (r, c) => (r * 8 + c < n ? colorGem(color) : colorGem(rest[(2 * r + c) % 4]));
};
const allBlue = (n: number) => exactly(BaseColor.Blue, n);
const allBrown = (n: number) => exactly(BaseColor.Brown, n);
const skullBoard: BoardFn = (r, c) => (r < 4 ? skullGem() : reviewBoard(r, c));

describe('L4a R8 B02', () => {
  // troop:6077 Behemoth (7147): Damage@AllEnemies 5+M ; DestroyGems 12 (any gem, Skulls are Gems: R013-5).
  it('troop:6077 random destroy can take Skulls', () => {
    const r = castSpell({ key: 'troop:6077', board: skullBoard });
    const d = r.summary.order.find(o => o.startsWith('destroy '))!;
    expect(d).toMatch(/^destroy 12 /);
    expect(d).toContain('skull');
  });
  // weapon:1055 Butcher's Knife (7121): Damage@LastEnemy 6+M ; ExplodeGems [AddForKill 1] (any gem).
  it('weapon:1055 explodes one gem only on a kill, Skulls eligible', () => {
    expect(castSpell({ key: 'weapon:1055' }).summary.order.some(o => o.startsWith('explode'))).toBe(false);
    const k = castSpell({ key: 'weapon:1055', enemies: [{}, {}, {}, { hp: 1, maxHp: 1, armor: 0 }], board: skullBoard });
    expect(k.summary.order).toContain('defeat E13');
    expect(k.summary.order.some(o => o.startsWith('explode '))).toBe(true);
  });
  // troop:6342 Penguin (7494): Damage 3+M [MultiplyFor10BlueGems 3 = 13+ Blue, R003] ; StormBlue.
  // troop:6347 Troglodyte (7499): same with Brown ; StormBrown.
  it.each([
    ['troop:6342', allBlue, 'Blue'],
    ['troop:6347', allBrown, 'Brown'],
  ] as const)('%s triples at 13 %s-like gems, not at 12', (key, mk, storm) => {
    expect(castSpell({ key, board: mk(13) }).summary.order[0]).toBe('dmg E11 39');
    expect(castSpell({ key, board: mk(12) }).summary.order[0]).toBe('dmg E11 13');
    expect(castSpell({ key }).summary.order).toContain(`storm ${storm} set`);
  });
  // weapon:1160 Ice Staff (7578): Damage 4+M [MultiplyForStormBlue 2] ; StormBlue.
  it('weapon:1160 doubles only under an Icestorm', () => {
    const f = setupCast({ key: 'weapon:1160' }); f.engine.debugSetStorm(BaseColor.Blue, f.side);
    expect(summarize(f, f.cast()).order[0]).toBe('dmg E11 28');
    const g = setupCast({ key: 'weapon:1160' }); g.engine.debugSetStorm(BaseColor.Red, g.side);
    expect(summarize(g, g.cast()).order[0]).toBe('dmg E11 14');
  });
});
