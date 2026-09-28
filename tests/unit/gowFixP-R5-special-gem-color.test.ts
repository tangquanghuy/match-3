// sa-P review round 4: P-R5-special-gem-color (weapon:1647 / 9649).
// Closed by P-R3-dragon-gem-count: boardSpecial {gem:'dragonGem', color:Green} counts only GREEN Dragon Gems.
import { describe, it, expect } from 'vitest';
import { BaseColor, type GemType } from '@engine/types';
import { castSpell, sixColourBoard, withCells } from '../helpers/gowCast';
const dragon = (color: BaseColor): GemType => ({ kind: 'special', spec: { kind: 'dragonGem', color } } as unknown as GemType);
const scatterTotal = (r: ReturnType<typeof castSpell>) => r.summary.order.filter(s => s.startsWith('dmg E'))
  .reduce((a, s) => a + Number(s.split(' ')[2]), 0);
describe('P-R5-special-gem-color', () => {
  it('weapon:1647: a Blue Dragon Gem adds nothing, a Green one adds +4', () => {
    const base = scatterTotal(castSpell({ key: 'weapon:1647', board: sixColourBoard }));
    const blue = scatterTotal(castSpell({ key: 'weapon:1647', board: withCells(sixColourBoard, { '0,0': dragon(BaseColor.Blue) }) }));
    const green = scatterTotal(castSpell({ key: 'weapon:1647', board: withCells(sixColourBoard, { '0,0': dragon(BaseColor.Green) }) }));
    expect(blue).toBe(base);
    expect(green).toBe(base + 4);
  });
});
