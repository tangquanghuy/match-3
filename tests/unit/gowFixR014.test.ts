// R014 (user ruling 2026-09-28): troop:7000 Baihu (8503) counts Yellow gems BEFORE creating 3 Yellow;
// the native CountSet 1 is not added. Damage = 3 + Magic + floor(yellowAtCastStart / 2).
import { describe, it, expect } from 'vitest';
import { BaseColor, colorGem } from '@engine/types';
import { castSpell, sixColourBoard, withCells } from '../helpers/gowCast';

const firstDmg = (r: ReturnType<typeof castSpell>) => Number(r.summary.order.find(s => s.startsWith('dmg E'))!.split(' ')[2]);
const yellowOn = (board: (r: number, c: number) => unknown) => {
  let n = 0;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const g = board(r, c) as { kind?: string; color?: BaseColor } | null;
    if (g?.kind === 'color' && g.color === BaseColor.Yellow) n++;
  }
  return n;
};

describe('R014 troop:7000 count before create', () => {
  it('damage uses the Yellow count at cast start; the 3 created gems and CountSet 1 do not count', () => {
    const boards = [
      sixColourBoard,
      withCells(sixColourBoard, { '0,0': colorGem(BaseColor.Yellow), '0,1': colorGem(BaseColor.Yellow) }),
      withCells(sixColourBoard, { '0,0': colorGem(BaseColor.Yellow), '0,1': colorGem(BaseColor.Yellow), '0,2': colorGem(BaseColor.Yellow) }),
    ];
    const res = boards.map(b => ({ y: yellowOn(b), d: firstDmg(castSpell({ key: 'troop:7000', board: b })) }));
    const base = res[0].d - Math.floor(res[0].y / 2);
    for (const { y, d } of res) expect(d).toBe(base + Math.floor(y / 2));
  });
});
