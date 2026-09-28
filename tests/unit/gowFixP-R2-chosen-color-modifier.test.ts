// sa-P review round 2: P-R2-chosen-color-modifier.
// prototypeNeedsColor also detects a count source { kind: 'boardGems', color: 'CHOSEN' }, so troop:6704 8060
// (native CountGems FromTarget ; CreateGems Red UseCounterForAmount) asks for a colour and creates one Red per gem of it.
import { describe, it, expect } from 'vitest';
import { BaseColor } from '@engine/types';
import { prototypeNeedsColor } from '@engine/skills/colorChooser';
import { castSpell, reviewBoard } from '../helpers/gowCast';

describe('P-R2-chosen-color-modifier', () => {
  it('detects boardGems CHOSEN in a modifier source', () => {
    const seg = { kind: 'gem', params: { op: 'create', gem: { kind: 'color', color: 'Red' }, count: { base: 0, mult: 0 },
      modifier: { mod: { kind: 'multiplier', a: 1 }, source: { kind: 'boardGems', color: 'CHOSEN' } } } };
    expect(prototypeNeedsColor({ segments: [seg] })).toBe(true);
    expect(prototypeNeedsColor({ segments: [{ ...seg, params: { ...seg.params, modifier: undefined } }] })).toBe(false);
  });
  it('troop:6704 8060: chosen Blue -> converts as many gems to Red as there are Blue gems', () => {
    let blue = 0;
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) { const g = reviewBoard(r, c); if (g && g.kind === 'color' && g.color === BaseColor.Blue) blue++; }
    const r = castSpell({ key: 'troop:6704', color: BaseColor.Blue });
    const conv = r.summary.order.find((s) => s.startsWith('convert') && s.includes('-> Red'));
    expect(conv).toBeDefined();
    expect(conv!.endsWith(`Red x${blue}`)).toBe(true);
  });
});
