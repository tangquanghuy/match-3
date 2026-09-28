// sa-P round 9: R015. Native colourless random DestroyGems / ExplodeGems ("Destroy 6 Gems", "Explode 4 Gems") pick any
// gem on the board, Skulls included (R013-5: Skulls are Gems). Coloured steps keep include 'color'.
import { describe, it, expect } from 'vitest';
import { castSpell } from '../helpers/gowCast';
import { skullGem } from '@engine/types';
import type { GameEvent } from '@engine/events';

const allSkulls = () => skullGem();
const skillPhase = (ev: GameEvent[]) => { const i = ev.findIndex((e) => e.type === 'elimination'); return i < 0 ? ev : ev.slice(0, i); };
const firstOf = (ev: GameEvent[], type: 'gem-destroy' | 'gem-explode') =>
  skillPhase(ev).find((e) => e.type === type) as Extract<GameEvent, { type: 'gem-destroy' | 'gem-explode' }> | undefined;

describe('R015: colourless random gem destroy / explode includes Skulls', () => {
  it('troop:6064 (DestroyGems 6) on an all-Skull board destroys 6 Skulls', () => {
    const e = firstOf(castSpell({ key: 'troop:6064', board: allSkulls }).events, 'gem-destroy');
    expect(e?.cells).toHaveLength(6);
    expect(e!.cells.every((c) => c.gemType.kind === 'skull')).toBe(true);
  });
  it('weapon:1157 (DestroyGems M/2+1) on an all-Skull board destroys Skulls', () => {
    const e = firstOf(castSpell({ key: 'weapon:1157', board: allSkulls }).events, 'gem-destroy');
    expect(e?.cells.length).toBe(6); // magic 10 -> 10 / 2 + 1
  });
  for (const k of ['troop:6607', 'troop:7165', 'weapon:1484', 'weapon:1529']) it(`${k} (ExplodeGems) explodes on an all-Skull board`, () => {
    const e = firstOf(castSpell({ key: k, board: allSkulls }).events, 'gem-explode');
    expect(e?.cells.length ?? 0).toBeGreaterThan(0);
  });
});
