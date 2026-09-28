// sa-B lane review round 6 (lane L4b, board create / convert).
// Real TurnEngine.castSkill through tests/helpers/gowCast.ts; each row has its own entity and expected values.
import { describe, it, expect } from 'vitest';
import { castSpell, DEFAULT_ENEMIES } from '../helpers/gowCast';
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
