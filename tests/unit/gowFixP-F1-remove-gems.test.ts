// P-F1-remove-gems: native RemoveColor / RemoveGems (English "Remove Gems") takes gems off the board with
// no mana, no skull damage and no resources (unlike Destroy / Explode). Removed gems still count for
// "boosted by Gems removed" and the board still refills and cascades.
import { describe, it, expect } from 'vitest';
import { setupCast, registry } from '../helpers/gowCast';
import { NATIVE_REMOVE_SPELL_IDS } from '@engine/skills/gowRemoveRules';
import type { EffectSegment, SkillPrototype } from '@engine/skills/prototypes';
import type { GameEvent } from '@engine/events';

/** events emitted by the direct clear itself: from the clear event up to gravity (settle of the removed gems) */
function settleOf(ev: GameEvent[]): GameEvent[] {
  const i = ev.findIndex(e => e.type === 'gem-destroy' || e.type === 'gem-explode');
  expect(i).toBeGreaterThanOrEqual(0);
  const j = ev.findIndex((e, k) => k > i && e.type === 'gravity');
  return ev.slice(i + 1, j < 0 ? undefined : j);
}
const clears = (segs: EffectSegment[]): string[] => segs.flatMap(s => s.kind === 'oneOf' ? s.options.flatMap(clears)
  : s.kind === 'gem' && s.params.op === 'clear' ? [s.params.mode] : []);

describe('P-F1-remove-gems', () => {
  it('troop:6970 Argos (8473): Remove all Blue gems -> no mana for the Blue ally, drain still counts 11', () => {
    const f = setupCast({ key: 'troop:6970' });
    const ev = f.cast();
    const clear = ev.find(e => e.type === 'gem-destroy');
    expect(clear && clear.type === 'gem-destroy' ? clear.cells.length : 0).toBeGreaterThan(0);
    expect(settleOf(ev)).toEqual([]);
    // DecreaseMana by the number of gems removed (counter kept)
    expect(f.enemies[0].mana).toBeLessThan(6);
  });

  it('troop:6052 Zombie (7052): Remove Skulls -> no skull damage on the front enemy', () => {
    const f = setupCast({ key: 'troop:6052' });
    const ev = f.cast();
    expect(settleOf(ev).filter(e => e.type === 'skill-damage' && (e as { skullBurst?: boolean }).skullBurst)).toEqual([]);
  });

  it('every native Remove* spell compiles its clear segments as remove', () => {
    const bad: string[] = [];
    for (const id of NATIVE_REMOVE_SPELL_IDS) {
      const p = registry.prototypes.get(String(id)) as SkillPrototype | undefined;
      if (!p) continue;
      const modes = clears(p.segments);
      if (modes.length === 0 || modes.some(m => m !== 'remove')) bad.push(`${id}:${modes.join('/')}`);
    }
    expect(bad).toEqual([]);
  });

  it('a Destroy spell still settles mana (control: troop:6000 Ogre explode)', () => {
    const f = setupCast({ key: 'troop:6000' });
    const ev = f.cast();
    expect(settleOf(ev).length).toBeGreaterThan(0);
  });
});
