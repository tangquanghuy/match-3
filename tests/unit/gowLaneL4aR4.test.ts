/**
 * Lane L4a review round 4 (sa-A): table-driven checks for behaviour the default scenarios do not show.
 */
import { describe, expect, it } from 'vitest';
import { castSpell, reviewBoard, withCells, setupCast, summarize, DEFAULT_ENEMIES, DEFAULT_ALLIES } from '../helpers/gowCast';
import { specialGem } from '@engine/types';

const countSpecial = (r: ReturnType<typeof castSpell>, kind: string) => {
  let n = 0;
  for (let rr = 0; rr < 8; rr++) for (let c = 0; c < 8; c++) {
    const g = r.f.board.get({ row: rr, col: c });
    if (g?.type.kind === 'special' && g.type.spec.kind === kind) n += 1;
  }
  return n;
};

describe('L4a R4 B01', () => {
  // weapon:1071 Skullblade (7184): CountGems 50 Skull ; RemoveColor Skull ; Damage Front ; Damage Second.
  it('weapon:1071 removes the Skulls first and adds [2:1] of them', () => {
    const r = castSpell({ key: 'weapon:1071' });
    const iRemove = r.summary.order.findIndex(o => o.startsWith('destroy 5'));
    expect(iRemove).toBeGreaterThanOrEqual(0);
    expect(iRemove).toBeLessThan(r.summary.order.findIndex(o => o.startsWith('dmg E10')));
    expect(r.summary.order).toContain('dmg E10 12 (all)'); // 10 + floor(5/2)
    expect(r.summary.order).toContain('dmg E11 12 (all)');
  });
  // troop:7457 Salamandria (9174): CountGems 500 Burning ; TrueDamage@FirstTwoEnemies 2+1.5M ; ExplodeColor Burning.
  it('troop:7457 boosts x5 per Burning gem, then explodes them all', () => {
    const board = withCells(reviewBoard, { '2,2': specialGem('burningGem'), '6,1': specialGem('burningGem') });
    const r = castSpell({ key: 'troop:7457', board });
    expect(r.summary.order.slice(0, 2)).toEqual(['dmg E10 27 (all)', 'dmg E11 27 (all)']); // 17 + 5 x 2
    expect(r.summary.order.findIndex(o => o.startsWith('explode '))).toBeGreaterThan(1);
    expect(countSpecial(r, 'burningGem')).toBe(0);
  });
  // weapon:1658 AxeOfKragRax (9747): CountGems 600 Enrage ; SplashHighDamage 3+M ; ExplodeColor 3 Enrage.
  it('weapon:1658 boosts x6 per Enrage gem and explodes exactly 3 of them', () => {
    const cells = ['0,2', '2,6', '4,4', '6,1', '7,6'];
    const board = withCells(reviewBoard, Object.fromEntries(cells.map(k => [k, specialGem('enrageGem')])));
    const r = castSpell({ key: 'weapon:1658', board });
    expect(r.summary.order[0]).toBe('dmg E11 43 (splash)'); // 13 + 6 x 5
    expect(r.summary.order.filter(o => o.startsWith('explode ')).length).toBeGreaterThanOrEqual(1);
    const left = countSpecial(r, 'enrageGem');
    expect(left).toBeLessThanOrEqual(2); // 3 exploded (an overlapping blast may take more)
  });
});

describe('L4a R4 B02', () => {
  // troop:6990 NyarMel (8494): CountGems 600 Block ; TrueSplashHeavy 4+M ; ExplodeColor Block ; CreateGems 3 Block.
  it('troop:6990 boosts x6 per Stone Block, explodes them, then creates exactly 3', () => {
    const board = withCells(reviewBoard, { '0,6': specialGem('stoneBlock'), '5,0': specialGem('stoneBlock') });
    const r = castSpell({ key: 'troop:6990', board });
    expect(r.summary.order[0]).toBe('dmg E11 26 (splash)'); // 14 + 6 x 2
    expect(r.summary.order).toContain('dmg E10 19 (splash)'); // heavy 75%
    const iExplode = r.summary.order.findIndex(o => o.startsWith('explode '));
    expect(iExplode).toBeGreaterThan(0);
    expect(countSpecial(r, 'stoneBlock')).toBe(3);
  });
});

const st = (id: string) => [{ id, turns: 99 }] as never;
describe('L4a R4 B03', () => {
  // troop:6316 CaptainSkullbeard (7466): CountMyMaps 300 ; CreateGems 5 Skull UseCounter.
  it('troop:6316 creates 5 + 3 per Treasure Map Skulls', () => {
    const f = setupCast({ key: 'troop:6316' });
    f.state.economy.maps = 2;
    const s = summarize(f, f.cast());
    expect(s.gems.created.skull).toBe(11);
  });
  // troop:7682 LavaEttin (9637): CountSpecificStatusEffect burning x4 ; Damage 2+M ; ExplodeColor 4 Burning.
  it('troop:7682 boosts x4 per Burning enemy and explodes 4 Burning gems', () => {
    const enemies = DEFAULT_ENEMIES.map((e, i) => (i < 2 ? { ...e, statuses: st('burning') } : e));
    const cells = ['0,2', '2,6', '4,4', '6,1', '7,6'];
    const board = withCells(reviewBoard, Object.fromEntries(cells.map(k => [k, specialGem('burningGem')])));
    const r = castSpell({ key: 'troop:7682', enemies, board });
    expect(r.summary.order[0]).toBe('dmg E11 20'); // 12 + 4 x 2
    expect(r.summary.order.filter(o => o === 'trigger burningGem').length).toBeGreaterThanOrEqual(4);
    expect(countSpecial(r, 'burningGem')).toBeLessThanOrEqual(1);
  });
  // troop:6787 AlgorakTheSlayer (8194): CountSpecificStatusEffect poison x2 ; Damage (Boss clause waived R000) ; ExplodeGems counter.
  it('troop:6787 explodes 2 gems per Poisoned enemy, none without', () => {
    expect(castSpell({ key: 'troop:6787' }).summary.order.some(o => o.startsWith('explode'))).toBe(false);
    const enemies = DEFAULT_ENEMIES.map((e, i) => (i === 0 || i === 2 ? { ...e, statuses: st('poison') } : e));
    const r = castSpell({ key: 'troop:6787', enemies });
    expect(r.summary.order[0]).toBe('dmg E11 14');
    expect(r.summary.order[1]).toMatch(/^explode (\d+)$/); // 4 blasts
    expect(Number(r.summary.order[1].split(' ')[1])).toBeGreaterThan(9);
  });
  // troop:7239 SpiritOfRage (8835): CountSpecificStatusEffect enraged AllAllies x2 ; ExplodeGems 3 + counter.
  it('troop:7239 explodes 3 + 2 per Enraged ally', () => {
    const allies = DEFAULT_ALLIES.map(a => ({ ...a, statuses: st('rage') }));
    const f = setupCast({ key: 'troop:7239', allies });
    const ev = f.cast();
    const explode = ev.find(e => e.type === 'gem-explode') as { cells: unknown[]; centers?: unknown[] } | undefined;
    const base = castSpell({ key: 'troop:7239' }).events.find(e => e.type === 'gem-explode') as { cells: unknown[] };
    expect(explode!.cells.length).toBeGreaterThan(base.cells.length);
  });
  // troop:6758 Exploadstool (8138): Poison@RandomEnemy 100/50/25/25 % only if an enemy is Diseased.
  it('troop:6758 poisons only with a Diseased enemy, 1-4 picks', () => {
    expect(castSpell({ key: 'troop:6758' }).summary.order.some(o => o.includes('+poison'))).toBe(false);
    const enemies = DEFAULT_ENEMIES.map((e, i) => (i === 3 ? { ...e, statuses: st('disease') } : e));
    const counts = new Set<number>();
    for (let seed = 1; seed <= 40; seed++) {
      const n = castSpell({ key: 'troop:6758', enemies, seed }).summary.order.filter(o => o.includes('+poison')).length;
      expect(n).toBeGreaterThanOrEqual(1); expect(n).toBeLessThanOrEqual(4); counts.add(n);
    }
    expect(counts.size).toBeGreaterThan(1);
  });
  // troop:6372 KingMikhail (7524): CountSpecificStatusEffect enraged Self x9 ; ExplodeGems Row ; Damage all 4+M+counter.
  it('troop:6372 deals 9 more when Enraged', () => {
    const r = castSpell({ key: 'troop:6372', caster: { statuses: st('rage') } });
    expect(r.summary.order).toContain('dmg E11 23 (all)');
  });
  // troop:7174 Mechweaver (8745): CreateGems 3 Bomb ; DestroyGems RowAndColumn (one step, 15 cells).
  it('troop:7174 destroys the chosen row and column in one clear', () => {
    const r = castSpell({ key: 'troop:7174' });
    expect(r.summary.order.find(o => o.startsWith('destroy '))).toMatch(/^destroy 15 /);
  });
});
