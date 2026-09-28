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
