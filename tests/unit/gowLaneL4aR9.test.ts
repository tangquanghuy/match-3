/**
 * Lane L4a review round 9 (sa-A): table-driven checks for behaviour the default scenarios do not show.
 */
import { describe, expect, it } from 'vitest';
import { BaseColor, colorGem, skullGem } from '@engine/types';
import { castSpell, reviewBoard, withCells, type BoardFn } from '../helpers/gowCast';

type Cells = { cells: { pos: { row: number; col: number }; gemType: { kind: string; color?: string } }[] };
/** four colours without pre-made matches, none of them `skip` */
const noColour = (skip: BaseColor): BoardFn => {
  const rest = [BaseColor.Red, BaseColor.Green, BaseColor.Yellow, BaseColor.Purple, BaseColor.Blue, BaseColor.Brown].filter(c => c !== skip).slice(0, 4);
  return (r, c) => colorGem(rest[(2 * r + c) % 4]);
};
const skullBoard: BoardFn = (r, c) => (r < 4 ? skullGem() : reviewBoard(r, c));
void skullBoard;

describe('L4a R9 B01', () => {
  // troop:7114 RedAhriman (8657) / weapon:1276 (8152): ExplodeColor FromTarget ; Damage@FromManaColorEnemy.
  const enemies = [{ colors: [BaseColor.Blue] }, { colors: [BaseColor.Red] }, { colors: [BaseColor.Blue, BaseColor.Green] }, { colors: [BaseColor.Purple] }];
  it.each([['troop:7114', 12], ['weapon:1276', 11]] as const)('%s damages only enemies using the chosen colour', (key, dmg) => {
    const r = castSpell({ key, enemies, color: BaseColor.Blue });
    const hits = r.summary.order.filter(o => o.startsWith('dmg '));
    expect(hits).toEqual([`dmg E10 ${dmg} (all)`, `dmg E12 ${dmg} (all)`]);
  });
  // weapon:1098 Eggsplosion (7223): ExplodeColor 4 FromTarget ; Heal@Self 4+M.
  it('weapon:1098 explodes only around chosen-colour gems and heals self 14', () => {
    const r = castSpell({ key: 'weapon:1098', board: withCells(noColour(BaseColor.Blue), { '3,3': colorGem(BaseColor.Blue) }), color: BaseColor.Blue });
    expect(r.summary.order[0]).toBe('explode 9');
    expect(r.summary.order).toContain('buff C hp+14');
  });
  // troop:7404 HauntedDoll (9054): ExplodeColor Purple 1+M ; Heal@Self 1000 ; CauseTerror@AllEnemies.
  it('troop:7404 explodes Purple gems only', () => {
    const none = castSpell({ key: 'troop:7404', board: noColour(BaseColor.Purple) });
    expect(none.summary.order.some(o => o.startsWith('explode'))).toBe(false);
    expect(none.summary.order).toContain('buff C hp+100');
    const one = castSpell({ key: 'troop:7404', board: withCells(noColour(BaseColor.Purple), { '3,3': colorGem(BaseColor.Purple) }) });
    const ev = one.events.find(e => e.type === 'gem-explode') as unknown as Cells;
    expect(ev.cells).toHaveLength(9);
    expect(ev.cells.map(c => `${c.pos.row},${c.pos.col}`)).toContain('3,3');
    expect(one.summary.order.filter(o => /^status E1\d \+terror$/.test(o))).toHaveLength(4);
  });
});

describe('L4a R9 B02', () => {
  // troop:7402 (9052): ExplodeGems Block3x1 ; CauseEntangle@RandomEnemy ; CauseWeb@FromPrevious.
  it('troop:7402 entangles and webs the same random enemy', () => {
    const targets = new Set<string>();
    for (let seed = 1; seed <= 10; seed++) {
      const o = castSpell({ key: 'troop:7402', seed }).summary.order.filter(x => x.startsWith('status '));
      expect(o).toHaveLength(2);
      const [a, b] = o.map(x => x.split(' ')[1]);
      expect(o[0]).toMatch(/\+entangle$/); expect(o[1]).toMatch(/\+web$/);
      expect(b).toBe(a); targets.add(a);
    }
    expect(targets.size).toBeGreaterThan(1);
  });
  // troop:6536 (7730) ExplodeGems 4 / weapon:1064 (7071) ExplodeGems 1: colourless, Skulls eligible (R013-5).
  it.each([['troop:6536'], ['weapon:1064']] as const)('%s random explosion can centre on Skulls', (key) => {
    const r = castSpell({ key, board: (rr, c) => (rr < 7 ? skullGem() : reviewBoard(rr, c)) });
    const ev = r.events.find(e => e.type === 'gem-explode') as unknown as Cells;
    expect(ev.cells.some(c => c.gemType.kind === 'skull')).toBe(true);
  });
  it('troop:6536 steals 8 Life only from a Divine target', () => {
    const plain = castSpell({ key: 'troop:6536', board: noColour(BaseColor.Purple) });
    expect(plain.summary.order.some(o => o.startsWith('dmg '))).toBe(false);
    const div = castSpell({ key: 'troop:6536', board: noColour(BaseColor.Purple), enemies: [{}, { troopTypes: ['Divine'], armor: 0 }, {}, {}] });
    expect(div.summary.order).toContain('dmg E11 8');
  });
});

const skullHeavy: BoardFn = (rr, c) => (rr < 7 ? skullGem() : reviewBoard(rr, c));
describe('L4a R9 B03', () => {
  // troop:6075 (7145) ExplodeGems 3+M / weapon:1440 (8696) ExplodeGems 3 / troop:6487 (7674) ExplodeGems 2: Skulls eligible.
  it.each([['troop:6075'], ['weapon:1440'], ['troop:6487']] as const)('%s random explosion can centre on Skulls', (key) => {
    const ev = castSpell({ key, board: skullHeavy }).events.find(e => e.type === 'gem-explode') as unknown as Cells;
    expect(ev.cells.some(c => c.gemType.kind === 'skull')).toBe(true);
  });
  // troop:6041 (7041): ExplodeGems SingleGem ; Damage@RandomEnemy 1+M ; CauseBurning@FromPrevious 30%.
  it('troop:6041 burns only the random enemy it damaged', () => {
    let burned = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const o = castSpell({ key: 'troop:6041', seed }).summary.order;
      const hit = o.find(x => x.startsWith('dmg '))!.split(' ')[1];
      const st = o.filter(x => x.startsWith('status '));
      for (const s of st) expect(s).toBe(`status ${hit} +burning`);
      burned += st.length;
    }
    expect(burned).toBeGreaterThan(2); expect(burned).toBeLessThan(20);
  });
});

describe('L4a R9 B04', () => {
  // troop:6721 (8091): Damage@RandomEnemy 3+M ; Damage@RandomPrefNotPrevEnemy 3+M ; CreateGems Bomb 2.
  it('troop:6721 hits a lone survivor twice (PrefNotPrev), two different enemies otherwise', () => {
    const lone = castSpell({ key: 'troop:6721', board: noColour(BaseColor.Purple), enemies: [{ hp: 900, maxHp: 900, armor: 0 }] });
    expect(lone.summary.order.filter(o => o.startsWith('dmg '))).toEqual(['dmg E10 13', 'dmg E10 13']);
    for (let seed = 1; seed <= 8; seed++) {
      const hits = castSpell({ key: 'troop:6721', seed, board: noColour(BaseColor.Purple) }).summary.order.filter(o => o.startsWith('dmg ')).map(o => o.split(' ')[1]);
      expect(hits).toHaveLength(2); expect(hits[0]).not.toBe(hits[1]);
    }
  });
  // troop:6471 (7649): ExplodeGems 18, Skulls eligible.
  it('troop:6471 random explosions can centre on Skulls', () => {
    const ev = castSpell({ key: 'troop:6471', board: skullHeavy }).events.find(e => e.type === 'gem-explode') as unknown as Cells;
    expect(ev.cells.some(c => c.gemType.kind === 'skull')).toBe(true);
  });
  // troop:7364 (9004): ExplodeGems SingleGem ; DestroyGems RowAndColumn (one cross) ; CreateGems Booty 3.
  it('troop:7364 destroys the chosen cross in one step', () => {
    const r = castSpell({ key: 'troop:7364', board: noColour(BaseColor.Purple), cell: { row: 3, col: 3 } });
    const destroys = r.events.filter(e => e.type === 'gem-destroy') as unknown as Cells[];
    expect(destroys).toHaveLength(1);
    const cells = destroys[0].cells.map(c => c.pos);
    expect(cells.every(p => p.row === 3 || p.col === 3)).toBe(true);
    expect(cells.length).toBeGreaterThanOrEqual(12);
  });
});

describe('L4a R9 B05', () => {
  // troop:7725 (9725): ExplodeGems 2 ; ExplodeGems 1 @50% ; ExplodeGems 1 @25% ; Damage@FrontEnemy (M/2)+4.
  it('troop:7725 explodes 2 gems plus 50% and 25% extra single explosions, then hits the front enemy for 9', () => {
    const counts = new Map<number, number>();
    for (let seed = 1; seed <= 60; seed++) {
      const o = castSpell({ key: 'troop:7725', seed, board: noColour(BaseColor.Purple) }).summary.order;
      const ex = o.filter(x => x.startsWith('explode ')).length;
      counts.set(ex, (counts.get(ex) ?? 0) + 1);
      expect(o).toContain('dmg E10 9');
    }
    expect([...counts.keys()].every(k => k >= 1 && k <= 3)).toBe(true);
    expect(counts.size).toBeGreaterThan(1);
  });
  // troop:6943 (8424): ExplodeGems Block1x3 + Block3x1 on the chosen cell ; IncreaseArmor 1+M ; CauseBarrier.
  it('troop:6943 explodes the 5-cell cross around the chosen cell', () => {
    const r = castSpell({ key: 'troop:6943', board: noColour(BaseColor.Purple), cell: { row: 4, col: 5 } });
    const ev = r.events.find(e => e.type === 'gem-explode') as unknown as Cells;
    expect(ev.cells.map(c => `${c.pos.row},${c.pos.col}`).sort()).toEqual(['3,5', '4,4', '4,5', '4,6', '5,5']);
    expect(r.summary.order).toContain('buff C armor+11');
    expect(r.summary.order).toContain('status C +barrier');
  });
  // troop:7447/7448/7449 (9168-9170): CreateGems Giant<C> 8 [AddForCursed on AllEnemies] = <C> giantGem (R009).
  it.each([['troop:7447', BaseColor.Blue], ['troop:7448', BaseColor.Green], ['troop:7449', BaseColor.Red]] as const)('%s creates 8 %s Giant Gems only if an enemy is Cursed', (key, color) => {
    const cursed = [{}, {}, { statuses: [{ id: 'curse', turns: 99 }] }, {}] as never;
    const r = castSpell({ key, enemies: cursed });
    expect(r.summary.order.some(o => /^(create|convert .* ->) giantGem\//.test(o) && o.endsWith(`giantGem/${color} x8`))).toBe(true);
    expect(r.summary.order).toContain('buff C hp+16 max+16');
    expect(castSpell({ key }).summary.order.some(o => o.includes('giantGem'))).toBe(false);
  });
});
