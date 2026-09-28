// sa-B lane review round 6 (lane L4b, board create / convert).
// Real TurnEngine.castSkill through tests/helpers/gowCast.ts; each row has its own entity and expected values.
import { describe, it, expect } from 'vitest';
import { castSpell, DEFAULT_ENEMIES } from '../helpers/gowCast';

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
