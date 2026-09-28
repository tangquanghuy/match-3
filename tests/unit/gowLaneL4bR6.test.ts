// sa-B lane review round 6 (lane L4b, board create / convert).
// Real TurnEngine.castSkill through tests/helpers/gowCast.ts; each row has its own entity and expected values.
import { describe, it, expect } from 'vitest';
import { castSpell, setupCast, summarize, DEFAULT_ENEMIES } from '../helpers/gowCast';
import { BaseColor } from '@engine/types';

const dmgs = (o: string[]) => o.filter(x => x.startsWith('dmg'));
type Cell = { kind: string; color?: string; spec?: { kind: string; tier?: number; color?: string } } | undefined;
type Board = { board: { get(p: { row: number; col: number }): { type: unknown } | null } };
const cells = (f: Board): Cell[] => {
  const out: Cell[] = [];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) out.push(f.board.get({ row: r, col: c })?.type as Cell);
  return out;
};
const KILL = [0, 1, 2, 3].map(() => ({ hp: 1, maxHp: 1, armor: 0 }));

describe('L4b R6 B01', () => {
  it('troop:7350: Death Marked target takes double [Magic + 2] = 24; otherwise 12; 2 Death Mark Gems', () => {
    const marked = DEFAULT_ENEMIES.map(e => ({ ...e, statuses: [{ id: 'death-mark', turns: 99 }] as never }));
    expect(dmgs(castSpell({ key: 'troop:7350', enemies: marked }).summary.order)).toEqual(['dmg E11 24']);
    const s = castSpell({ key: 'troop:7350' }).summary;
    expect(dmgs(s.order)).toEqual(['dmg E11 12']);
    expect(s.gems.created.deathMarkGem).toBe(2);
  });
  it('troop:7084: 10 Skulls only when the target dies', () => {
    expect(castSpell({ key: 'troop:7084' }).summary.order.some(x => x.includes('skull x10'))).toBe(false);
    expect(castSpell({ key: 'troop:7084', enemies: KILL }).summary.order.some(x => x.endsWith('-> skull x10'))).toBe(true);
  });
  it('troop:7106: 16 to all, 3 x4 Wildcards', () => {
    const { f, summary } = castSpell({ key: 'troop:7106' });
    expect(dmgs(summary.order)).toEqual(['dmg E10 16 (all)', 'dmg E11 16 (all)', 'dmg E12 16 (all)', 'dmg E13 16 (all)']);
    const w = cells(f).filter(t => t?.spec?.kind === 'wildcard');
    expect(w).toHaveLength(3);
    expect(w.every(t => t?.spec?.tier === 4)).toBe(true);
  });
});

describe('L4b R6 B02', () => {
  it('weapon:1685: 23 to all (1.75x10+5 rounded); 3 Bleed/Terror/Poison each, 6 each when an enemy dies', () => {
    const s = castSpell({ key: 'weapon:1685' }).summary;
    expect(dmgs(s.order)).toEqual(['dmg E10 23 (all)', 'dmg E11 23 (all)', 'dmg E12 23 (all)', 'dmg E13 23 (all)']);
    expect(s.order.filter(x => x.startsWith('convert')).map(x => x.split('-> ')[1])).toEqual(['bleedGem x3', 'terrorGem x3', 'poisonGem x3']);
    const k = castSpell({ key: 'weapon:1685', enemies: KILL }).summary;
    expect(k.order.filter(x => x.startsWith('convert')).map(x => x.split('-> ')[1]))
      .toEqual(['bleedGem x3', 'bleedGem x3', 'terrorGem x3', 'terrorGem x3', 'poisonGem x3', 'poisonGem x3']);
  });
  it('troop:7381: 12 to all; 5 Gargoyle Gems mixing Good (tier 1) and Evil (tier 2)', () => {
    const tiers = new Set<number | undefined>();
    for (const seed of [1, 2, 3, 4, 5, 42]) {
      const { f, summary } = castSpell({ key: 'troop:7381', seed });
      expect(dmgs(summary.order)).toEqual(['dmg E10 12 (all)', 'dmg E11 12 (all)', 'dmg E12 12 (all)', 'dmg E13 12 (all)']);
      const g = cells(f).filter(t => t?.spec?.kind === 'gargoyleGem');
      expect(g.length).toBeLessThanOrEqual(5);
      for (const t of g) { expect([1, 2]).toContain(t?.spec?.tier); tiers.add(t?.spec?.tier); }
    }
    expect([...tiers].sort()).toEqual([1, 2]);
  });
  it('troop:7587: 13 damage; three independent single Daemonic Portal creates (native), not one uniform 1-3 roll', () => {
    const s = castSpell({ key: 'troop:7587' }).summary;
    expect(dmgs(s.order)).toEqual(['dmg E11 13']);
    expect(s.order.filter(x => x.endsWith('-> daemonicPortalGem x1'))).toHaveLength(3);
  });
});

describe('L4b R6 B03', () => {
  const ONE = DEFAULT_ENEMIES.map((e, i) => (i === 1 ? { ...e } : { ...e, hp: 0, defeated: true })) as never;
  it('R007-3 chains: a lone survivor takes every RandomPrefNotPrev hit (7216 x2, 1684 x3, 7340 x3)', () => {
    expect(dmgs(castSpell({ key: 'troop:7216', enemies: ONE }).summary.order)).toEqual(['dmg E11 13', 'dmg E11 13']);
    expect(dmgs(castSpell({ key: 'weapon:1684', enemies: ONE }).summary.order)).toEqual(['dmg E11 12', 'dmg E11 12', 'dmg E11 12']);
    expect(dmgs(castSpell({ key: 'troop:7340', enemies: ONE }).summary.order)).toEqual(['dmg E11 16', 'dmg E11 16', 'dmg E11 16']);
  });
  it('R007-3: third hit only avoids the second target, so it may return to the first', () => {
    const TWO = DEFAULT_ENEMIES.map((e, i) => (i < 2 ? { ...e, hp: 99, maxHp: 99 } : { ...e, hp: 0, defeated: true })) as never;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const d = dmgs(castSpell({ key: 'troop:7340', enemies: TWO, seed }).summary.order).map(x => x.split(' ')[1]);
      expect(d).toHaveLength(3);
      expect(d[1]).not.toBe(d[0]);
      expect(d[2]).not.toBe(d[1]);
    }
  });
  it('troop:7216: 3 Evil (tier 2) Gargoyle Gems; weapon:1684 +3 Bleed only on a kill', () => {
    const { f } = castSpell({ key: 'troop:7216' });
    const g = cells(f).filter(t => t?.spec?.kind === 'gargoyleGem');
    expect(g).toHaveLength(3);
    expect(g.every(t => t?.spec?.tier === 2)).toBe(true);
    expect(castSpell({ key: 'weapon:1684' }).summary.order.filter(x => x.endsWith('-> bleedGem x3'))).toHaveLength(1);
    expect(castSpell({ key: 'weapon:1684', enemies: KILL }).summary.order.filter(x => x.endsWith('-> bleedGem x3'))).toHaveLength(2);
  });
  it('troop:6449: triple [Magic + 3] vs Burning = 39; 10 Red only on kill', () => {
    const burn = DEFAULT_ENEMIES.map(e => ({ ...e, statuses: [{ id: 'burning', turns: 99 }] as never }));
    expect(dmgs(castSpell({ key: 'troop:6449', enemies: burn }).summary.order)).toEqual(['dmg E11 39']);
    expect(castSpell({ key: 'troop:6449' }).summary.order.some(x => x.includes('-> Red x10'))).toBe(false);
    expect(castSpell({ key: 'troop:6449', enemies: KILL }).summary.order.some(x => x.endsWith('-> Red x10'))).toBe(true);
  });
  it('x3 Wildcard ranges: 7506 1-3, 7340 3-6, all tier 3; 7849 4-10 Blue(row)/Yellow(col) Lightning', () => {
    // created counts come from the cast events (cascades may consume the gems afterwards)
    const seen = { a: new Set<number>(), b: new Set<number>(), l: new Set<number>() };
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      const a = castSpell({ key: 'troop:7506', seed }).summary.gems.created.wildcard;
      expect(a).toBeGreaterThanOrEqual(1); expect(a).toBeLessThanOrEqual(3); seen.a.add(a);
      const b = castSpell({ key: 'troop:7340', seed }).summary.gems.created.wildcard;
      expect(b).toBeGreaterThanOrEqual(3); expect(b).toBeLessThanOrEqual(6); seen.b.add(b);
      const c = castSpell({ key: 'troop:7849', seed }).summary.gems.created;
      const l = (c.lightningRow ?? 0) + (c.lightningCol ?? 0);
      expect(l).toBeGreaterThanOrEqual(4); expect(l).toBeLessThanOrEqual(10); seen.l.add(l);
    }
    expect(seen.a.size).toBeGreaterThan(1); expect(seen.b.size).toBeGreaterThan(1); expect(seen.l.size).toBeGreaterThan(1);
    const w = cells(castSpell({ key: 'troop:7340' }).f).filter(t => t?.spec?.kind === 'wildcard');
    expect(w.length).toBeGreaterThan(0);
    expect(w.every(t => t?.spec?.tier === 3)).toBe(true);
  });
});

describe('L4b R6 B04', () => {
  it('troop:6516: +6 Attack all allies; [Magic + 6] = 16 to Daemon, then again to Undead (Daemon+Undead hit twice); 2 Angel Gems', () => {
    const team = DEFAULT_ENEMIES.map((e, i) => ({ ...e, troopTypes: [['Daemon'], ['Human'], ['Undead'], ['Daemon', 'Undead']][i] }));
    const s = castSpell({ key: 'troop:6516', enemies: team }).summary;
    expect(dmgs(s.order)).toEqual(['dmg E10 16 (all)', 'dmg E13 16 (all)', 'dmg E12 16 (all)', 'dmg E13 16 (all)']);
    expect(s.gems.created.angelGem).toBe(2);
    expect(dmgs(castSpell({ key: 'troop:6516' }).summary.order)).toEqual([]);
  });
  it('troop:6745: 28 Armor, 56 with 13+ Skulls (R003)', () => {
    const skulls = (r: number, c: number) => (r * 8 + c < 13 ? { kind: 'skull' } : { kind: 'color', color: [BaseColor.Green, BaseColor.Yellow, BaseColor.Purple][(r + c) % 3] }) as never;
    expect(castSpell({ key: 'troop:6745' }).summary.order[0]).toBe('buff C armor+28');
    expect(castSpell({ key: 'troop:6745', board: skulls }).summary.order[0]).toBe('buff C armor+56');
  });
  it('troop:7339: 17 damage, move to front, 3 x2 Wildcards', () => {
    const { f, summary } = castSpell({ key: 'troop:7339' });
    expect(summary.order.slice(0, 2)).toEqual(['dmg E11 17', 'move C front']);
    const w = cells(f).filter(t => t?.spec?.kind === 'wildcard');
    expect(w).toHaveLength(3);
    expect(w.every(t => t?.spec?.tier === 2)).toBe(true);
  });
  const doomTeam = DEFAULT_ENEMIES.map((e, i) => ({ ...e, troopTypes: i === 3 ? ['Doom'] : ['Human'] }));
  const shields: [string, BaseColor][] = [['weapon:1592', BaseColor.Blue], ['weapon:1593', BaseColor.Green], ['weapon:1594', BaseColor.Red],
    ['weapon:1595', BaseColor.Yellow], ['weapon:1596', BaseColor.Purple], ['weapon:1597', BaseColor.Brown]];
  for (const [key, col] of shields) {
    it(`${key}: 12 Armor to chosen ally; 3 ${col} -> Giant ${col} only if the enemy team has a Doom`, () => {
      const plain = castSpell({ key });
      expect(plain.summary.order[0]).toBe('buff A1 armor+12');
      expect(cells(plain.f).some(t => t?.spec?.kind === 'giantGem')).toBe(false);
      const doom = castSpell({ key, enemies: doomTeam });
      const g = doom.summary.order.find(x => x.includes('giantGem'));
      expect(g).toBe(`convert ${col} x3 -> giantGem/${col} x3`);
    });
  }
});

describe('L4b R6 B04 order equivalence (R001)', () => {
  it('troop:7333: native Attack-then-Armor vs runtime Armor-then-Attack is unobservable: both +11, independent stats; 4 Brown -> Entangle', () => {
    const s = castSpell({ key: 'troop:7333' }).summary;
    expect([...s.order.slice(0, 2)].sort()).toEqual(['buff C armor+11', 'buff C attack+11']);
    expect(s.order[2]).toBe('convert Brown x4 -> entangleGem x4');
  });
});

describe('L4b R6 B05', () => {
  const colourBoard = (first: number, col: BaseColor) => (r: number, c: number) =>
    (r * 8 + c < first ? { kind: 'color', color: col } : { kind: 'color', color: [BaseColor.Green, BaseColor.Yellow, BaseColor.Purple, BaseColor.Blue][(r + 2 * c) % 4] }) as never;
  it('troop:7129: +11 Attack/Life/Armor; 9 Skulls only with 13+ Red Gems (R003)', () => {
    expect(castSpell({ key: 'troop:7129', board: colourBoard(12, BaseColor.Red) }).summary.order.some(x => x.includes('skull x9'))).toBe(false);
    expect(castSpell({ key: 'troop:7129', board: colourBoard(13, BaseColor.Red) }).summary.order.some(x => x.endsWith('-> skull x9'))).toBe(true);
  });
  it('troop:6126: 13 scatter total; +8 Magic only when an enemy dies', () => {
    const s = castSpell({ key: 'troop:6126' }).summary;
    expect(dmgs(s.order).reduce((a, x) => a + Number(x.split(' ')[2]), 0)).toBe(13);
    expect(s.order.some(x => x.startsWith('buff C magic'))).toBe(false);
    expect(castSpell({ key: 'troop:6126', enemies: KILL }).summary.order).toContain('buff C magic+8');
  });
  it('scatter totals: 7232 42 then 8 chosen-colour Uber Doomskulls; 7836 37 then 13 Lightning (row/col mix)', () => {
    const a = castSpell({ key: 'troop:7232' }).summary;
    expect(dmgs(a.order).reduce((t, x) => t + Number(x.split(' ')[2]), 0)).toBe(42);
    expect(a.gems.created.uberDoomSkull).toBe(8);
    const b = castSpell({ key: 'troop:7836' }).summary;
    expect(dmgs(b.order).reduce((t, x) => t + Number(x.split(' ')[2]), 0)).toBe(37);
    expect((b.gems.created.lightningRow ?? 0) + (b.gems.created.lightningCol ?? 0)).toBe(13);
    expect(b.gems.created.lightningRow).toBeGreaterThan(0); expect(b.gems.created.lightningCol).toBeGreaterThan(0);
  });
  it('troop:7393: kills the chosen enemy outright; 6 Curse, 6 Giant Yellow, 6 Faerie Fire', () => {
    const s = castSpell({ key: 'troop:7393' }).summary;
    expect(s.order.slice(0, 2)).toEqual(['dmg E11 910', 'defeat E11']);
    expect(s.order.filter(x => x.startsWith('convert')).map(x => x.split('-> ')[1])).toEqual(['curseGem x6', 'giantGem/Yellow x6', 'faerieFireGem x6']);
  });
});

describe('L4b R6 B06', () => {
  it('troop:7219: splash 13/6/6 (SplashHighDamage); 1-2 Gargoyle Gems, Good or Evil tiers', () => {
    const tiers = new Set<number | undefined>(); const counts = new Set<number>();
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 42]) {
      const { f, summary } = castSpell({ key: 'troop:7219', seed });
      expect(dmgs(summary.order)).toEqual(['dmg E11 13 (splash)', 'dmg E10 6 (splash)', 'dmg E12 6 (splash)']);
      const n = summary.gems.created.gargoyleGem; counts.add(n);
      expect(n).toBeGreaterThanOrEqual(1); expect(n).toBeLessThanOrEqual(2);
      for (const t of cells(f).filter(t => t?.spec?.kind === 'gargoyleGem')) tiers.add(t?.spec?.tier);
    }
    expect([...counts].sort()).toEqual([1, 2]);
    expect([...tiers].sort()).toEqual([1, 2]);
  });
  it('troop:7689: 10 true damage to all, 20 in Southwild; 6 Yellow -> Green Dragon Gems (R009)', () => {
    const s = castSpell({ key: 'troop:7689' }).summary;
    expect(dmgs(s.order)).toEqual(['dmg E10 10 (all)', 'dmg E11 10 (all)', 'dmg E12 10 (all)', 'dmg E13 10 (all)']);
    expect(s.order).toContain('convert Yellow x6 -> dragonGem/Green x6');
    const f = setupCast({ key: 'troop:7689' });
    (f.state as { region?: string }).region = 'Southwild';
    expect(dmgs(summarize(f, f.cast()).order)[0]).toBe('dmg E10 20 (all)');
  });
  const ONE = DEFAULT_ENEMIES.map((e, i) => (i === 1 ? { ...e } : { ...e, hp: 0, defeated: true })) as never;
  it('weapon:1524: RandomEnemy then RandomPrefNotPrev true damage 12 (lone survivor hit twice); 5 Bombs', () => {
    expect(dmgs(castSpell({ key: 'weapon:1524', enemies: ONE }).summary.order)).toEqual(['dmg E11 12', 'dmg E11 12']);
    const s = castSpell({ key: 'weapon:1524' }).summary;
    expect(s.gems.created.bomb).toBe(5);
  });
  it('troop:7487: 24 true to the chosen enemy and 24 to a random one that is never the chosen while others live', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const d = dmgs(castSpell({ key: 'troop:7487', seed }).summary.order);
      expect(d[0]).toBe('dmg E11 24');
      expect(d[1]).not.toBe('dmg E11 24');
    }
    expect(dmgs(castSpell({ key: 'troop:7487', enemies: ONE }).summary.order)).toEqual(['dmg E11 24', 'dmg E11 24']);
  });
  it('troop:6120: steals up to 13 Armor then 13 true damage; 1-2 Bombs', () => {
    const s = castSpell({ key: 'troop:6120' }).summary;
    expect(s.order.slice(0, 3)).toEqual(['buff E11 armor-10', 'buff C armor+10', 'dmg E11 13']);
    const n = new Set([1, 2, 3, 4, 5, 6, 7, 8].map(seed => castSpell({ key: 'troop:6120', seed }).summary.gems.created.bomb));
    expect([...n].sort()).toEqual([1, 2]);
  });
  it('weapon:1639: 7 Submerge, +4 when an enemy dies', () => {
    expect(castSpell({ key: 'weapon:1639' }).summary.gems.created.submergeGem).toBe(7);
    expect(castSpell({ key: 'weapon:1639', enemies: KILL }).summary.gems.created.submergeGem).toBe(11);
  });
});
