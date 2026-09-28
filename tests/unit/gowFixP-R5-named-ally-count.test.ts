// sa-P review round 4: P-R5-named-ally-count (troop:7173 / 8744).
// Native 0:CountArmyTroop 7172 @AllAllies 300 -> ConvertGems Purple>Doomskull -> CreateGems Doomskull
// UseCounterForAmount -> Summoning 7172: 3 extra Doomskulls PER Eldritch Minion ally (counted before the summon).
// New modifier source alliesNamed {name, atCastStart} (secondary.ts) replaces the boolean troopPresent.
import { describe, it, expect } from 'vitest';
import type { GameEvent } from '@engine/events';
import { castSpell } from '../helpers/gowCast';
import { resolveModifierCount } from '@engine/skills/effects/secondary';

const MINION = '邪老爪牙';
type GemT = { kind: string; spec?: { kind: string }; color?: string };
const isDoom = (t: GemT) => t.kind === 'special' && t.spec?.kind === 'doomSkull';
// Doomskulls made by the create step (createSpecialGems converts non-Purple cells), excluding the Purple conversion
const createdDoom = (events: readonly GameEvent[]) => {
  let n = 0;
  for (const e of events) {
    if (e.type === 'elimination') break;
    if (e.type === 'gem-create') n += e.spawns.filter(s => isDoom(s.gemType as GemT)).length;
    if (e.type === 'gem-transform') n += e.changes.filter(c => isDoom(c.to as GemT) && (c.from as GemT).color !== 'Purple').length;
  }
  return n;
};

describe('P-R5-named-ally-count', () => {
  for (const n of [0, 1, 2, 3]) {
    it(`troop:7173: ${n} Eldritch Minion allies -> ${3 * n} created Doomskulls`, () => {
      const allies = Array.from({ length: n }, () => ({ name: MINION }));
      const r = castSpell({ key: 'troop:7173', allies });
      expect(createdDoom(r.events)).toBe(3 * n);
      // the minion summoned by this cast is not counted (native count at step 0); team full at 3 allies
      expect(r.events.filter(e => e.type === 'summon')).toHaveLength(n < 3 ? 1 : 0);
    });
  }
  for (const n of [0, 1, 2]) {
    it(`troop:7115: ${n} Despond allies -> each enemy loses ${3 + 3 * n} Magic`, () => {
      const r = castSpell({ key: 'troop:7115', allies: Array.from({ length: n }, () => ({ name: '沮丧' })) });
      const lost = r.events.filter(e => e.type === 'buff' && e.targetId === 10 && e.stat === 'magic')
        .reduce((a, e) => a + (e as { amount: number }).amount, 0);
      expect(lost).toBe(-(3 + 3 * n));
    });
  }
  it('alliesNamed counts only the named allies of the caster side', () => {
    const r = castSpell({ key: 'troop:7173', allies: [{ name: MINION }, { name: 'X' }], enemies: [{ name: MINION }] });
    const ctx = { state: r.f.state, casterId: r.f.caster.id } as never;
    expect(resolveModifierCount({ kind: 'alliesNamed', name: MINION }, ctx)).toBe(2); // 1 + this cast's summon
  });
});
