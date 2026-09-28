// sa-P review round 4: P-R6-chosen-diagonal-transform (weapon:1461 / 8762).
// Native Target Board spell: CreateGems Burning BoardTarget LeftDiagonal | RightDiagonal (Randomize AB-CD) converts
// the diagonal through the player's chosen cell. transform diagonalAnchor 'chosenCell' + prototypeNeedsCell finds
// cell steps inside oneOf branches.
import { describe, it, expect } from 'vitest';
import type { GameEvent } from '@engine/events';
import { castSpell } from '../helpers/gowCast';
import { prototypeNeedsCell } from '@engine/skills/cellChooser';

type Tr = Extract<GameEvent, { type: 'gem-transform' }>;
const burned = (events: readonly GameEvent[]) => events.filter((e): e is Tr => e.type === 'gem-transform')[0]?.changes
  .filter(c => c.to.kind === 'special' && c.to.spec.kind === 'burningGem').map(c => `${c.pos.row},${c.pos.col}`).sort() ?? [];

describe('P-R6-chosen-diagonal-transform', () => {
  it('weapon:1461 asks for a cell (cell step inside the random branch)', () => {
    const r = castSpell({ key: 'weapon:1461' });
    expect(prototypeNeedsCell(r.f.proto!)).toBe(true);
  });
  it('weapon:1461 cell (0,5): converts the 3-cell or the 6-cell diagonal through it, both over 40 seeds', () => {
    const LEFT = ['0,5', '1,6', '2,7'];
    const RIGHT = ['0,5', '1,4', '2,3', '3,2', '4,1', '5,0'].sort();
    const seen = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const cells = burned(castSpell({ key: 'weapon:1461', seed, cell: { row: 0, col: 5 } }).events);
      expect([LEFT.join(' '), RIGHT.join(' ')]).toContain(cells.join(' '));
      seen.add(cells.length === 3 ? 'left' : 'right');
    }
    expect(seen.size).toBe(2);
  });
  it('weapon:1461 cell (3,3): the centre diagonals (8 or 7 cells) are used only when chosen there', () => {
    const cells = burned(castSpell({ key: 'weapon:1461', seed: 1, cell: { row: 3, col: 3 } }).events);
    expect([7, 8]).toContain(cells.length);
    expect(cells).toContain('3,3');
  });
});
