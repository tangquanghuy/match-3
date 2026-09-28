// sa-P review round 4: P-R6-chosen-cell-counts (weapon:1525 / 8965, troop:6712 / 8070).
// Native Target Board spells count around the player's chosen cell at step 0 (R001):
//  - 8965 CountGems Yellow Diagonals -> bless random ally x counter -> DestroyGems Diagonals: the X through the cell
//    (diagonalGems anchor 'chosenCell' + area:x center 'CELL').
//  - 8070 CountGems Skull Block3x3 -> deathmark random enemies x counter -> ExplodeGems SingleGem -> Armor -> Attack
//    (chosenCellBlockGems skulls, death marks before the explosion).
import { describe, it, expect } from 'vitest';
import { BaseColor, colorGem, skullGem, type GemType } from '@engine/types';
import { castSpell, sixColourBoard, withCells } from '../helpers/gowCast';

const col = (color: BaseColor): GemType => colorGem(color);
const skull: GemType = skullGem();
const blue = () => col(BaseColor.Blue);

describe('P-R6-chosen-cell-counts', () => {
  it('weapon:1525 cell (0,0): destroys the 8-cell corner diagonal, blesses once per Yellow on it, bless before destroy', () => {
    const board = withCells(() => blue(), { '0,0': col(BaseColor.Yellow), '2,2': col(BaseColor.Yellow), '0,2': col(BaseColor.Yellow) });
    const r = castSpell({ key: 'weapon:1525', cell: { row: 0, col: 0 }, board });
    const destroy = r.events.find(e => e.type === 'gem-destroy');
    expect(destroy && destroy.type === 'gem-destroy' ? destroy.cells.map(c => `${c.pos.row},${c.pos.col}`).sort() : [])
      .toEqual(['0,0', '1,1', '2,2', '3,3', '4,4', '5,5', '6,6', '7,7']);
    const blesses = r.events.filter(e => e.type === 'status-apply' && e.statusId === 'blessed');
    expect(blesses).toHaveLength(2); // (0,0) + (2,2); (0,2) is off the X
    expect(r.events.findIndex(e => e.type === 'status-apply')).toBeLessThan(r.events.findIndex(e => e.type === 'gem-destroy'));
  });
  it('troop:6712: death marks = skulls in the chosen 3x3, applied before the explosion', () => {
    const board = withCells(sixColourBoard, { '3,3': skull, '2,2': skull, '4,4': skull, '0,0': skull });
    const r = castSpell({ key: 'troop:6712', seed: 1, cell: { row: 3, col: 3 }, board });
    const order = r.summary.order;
    const marks = order.filter(s => s.endsWith('+death-mark'));
    expect(marks).toHaveLength(3); // (0,0) is outside the block
    const firstMark = order.findIndex(s => s.endsWith('+death-mark'));
    expect(firstMark).toBeLessThan(order.findIndex(s => s.startsWith('explode')));
    const buffs = order.filter(s => s.startsWith('buff C'));
    expect(buffs[0]).toMatch(/^buff C armor\+/);
    expect(buffs[1]).toMatch(/^buff C attack\+/);
  });
  it('troop:6712: enemies killed by the skull damage still were in the random death-mark pool', () => {
    const board = withCells(sixColourBoard, { '3,3': skull, '3,4': skull, '3,2': skull });
    const r = castSpell({ key: 'troop:6712', seed: 3, cell: { row: 3, col: 3 }, board,
      enemies: [{ hp: 1, maxHp: 1, armor: 0 }, {}, {}, {}] });
    expect(r.summary.order.filter(s => s.endsWith('+death-mark'))).toHaveLength(3);
  });
});
