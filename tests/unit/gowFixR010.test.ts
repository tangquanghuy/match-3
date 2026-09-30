// sa-P review round 2: R010 (Remove: no mana, no special-gem trigger) — coverage only, behaviour unchanged.
// Removed special gems do not fire (bomb, uber doom skull, mana potion); the same gems destroyed normally do.
import { describe, it, expect } from 'vitest';
import { setupCast, castSpell } from '../helpers/gowCast';
import { specialGem, type GemType } from '@engine/types';
import type { GameEvent } from '@engine/events';

function settle(mode: 'remove' | 'destroy', gem: GemType) {
  const f = setupCast({ key: 'troop:6052' });
  const pos = { row: 3, col: 3 };
  f.board.set(pos, null);
  const events: GameEvent[] = [];
  const mana0 = f.units.map((u) => u.mana);
  f.engine.resolveBoardChange([{ gemType: gem, pos }], events, f.side, mode);
  const directClear = events.findIndex((e) => e.type === 'gravity');
  const head = directClear < 0 ? events : events.slice(0, directClear);
  return { f, head, events, mana0 };
}

describe('R010: removed special gems do not trigger', () => {
  for (const kind of ['bomb', 'uberDoomSkull', 'manaPotionGem'] as const) {
    it(`${kind}: remove -> no trigger, no explosion, no mana; destroy -> trigger`, () => {
      const removed = settle('remove', specialGem(kind));
      expect(removed.head.filter((e) => e.type === 'special-gem-trigger' || e.type === 'gem-explode' || e.type === 'mana-gain')).toEqual([]);
      const destroyed = settle('destroy', specialGem(kind));
      expect(destroyed.events.some((e) => e.type === 'special-gem-trigger' || e.type === 'gem-explode')).toBe(true);
    });
  }
  it('Doomskull destroy retains five damage without an inherent explosion; remove gives no damage', () => {
    const removed = settle('remove', specialGem('doomSkull'));
    const destroyed = settle('destroy', specialGem('doomSkull'));
    for (const result of [removed, destroyed]) {
      expect(result.head.filter(e => e.type === 'special-gem-trigger' || e.type === 'gem-explode')).toEqual([]);
    }
    expect(removed.head.filter(e => e.type === 'skill-damage')).toEqual([]);
    expect(destroyed.head.filter(e => e.type === 'skill-damage')).toEqual([expect.objectContaining({ damage: 5 })]);
  });
  it('gem clear segment in remove mode forwards mode "remove" to the engine (real cast troop:6052, no mana)', () => {
    const r = castSpell({ key: 'troop:6052' });
    const before = r.events.findIndex((e) => e.type === 'elimination');
    const spell = before < 0 ? r.events : r.events.slice(0, before);
    expect(spell.some((e) => e.type === 'gem-destroy' && (e as { removed?: boolean }).removed === true)).toBe(true);
    expect(spell.some((e) => e.type === 'mana-gain' || e.type === 'special-gem-trigger')).toBe(false);
  });
});
