/**
 * Native RemoveColor / RemoveGems (English "Remove ... Gems"), P-F1-remove-gems.
 *
 * Removing takes gems off the board with no mana, no skull damage and no resources, unlike
 * Destroy / Explode (community.gemsofwar.com t/1807, t/82191, t/16857). Removed gems still count
 * for "boosted by Gems removed" (castTracking.destroyed) and the board still refills and cascades.
 *
 * Source: the stored native SpellSteps of each spell (data/raw/spells.gow.en.json via the audit
 * ledger, 2026-09-28). Every listed spell has Remove* as its only gem-clearing native step type
 * (no Destroy* / Explode*), so every clear segment of the compiled prototype is switched to
 * mode 'remove'. Applied at registration like gowDamageRules; curated sources stay unchanged.
 */
import type { EffectSegment, SkillPrototype } from './prototypes';

export const NATIVE_REMOVE_SPELL_IDS: ReadonlySet<number> = new Set([
  7010, 7017, 7024, 7027, 7046, 7052, 7054, 7059, 7102, 7103, 7104, 7105, 7109, 7116, 7124, 7137, 7146, 7160,
  7184, 7230, 7286, 7308, 7349, 7352, 7360, 7383, 7478, 7577, 7596, 7601, 7645, 7964, 8010, 8268, 8322, 8323,
  8324, 8325, 8326, 8327, 8328, 8329, 8330, 8331, 8332, 8333, 8334, 8335, 8336, 8337, 8338, 8339, 8340, 8341,
  8342, 8343, 8344, 8345, 8346, 8347, 8348, 8349, 8350, 8351, 8352, 8353, 8354, 8419, 8464, 8468, 8473, 8507,
  8511, 8525, 8549, 8586, 8598, 8642, 8807, 8819, 8861, 8875, 8932, 8976, 9111,
]);

const corrected = new WeakMap<SkillPrototype, SkillPrototype>();

export function applyGowRemoveRule(id: number, proto: SkillPrototype): SkillPrototype {
  if (!NATIVE_REMOVE_SPELL_IDS.has(id)) return proto;
  const cached = corrected.get(proto);
  if (cached) return cached;
  const convert = (segments: EffectSegment[]): EffectSegment[] => segments.map(segment => {
    if (segment.kind === 'oneOf' || segment.kind === 'choose') return { ...segment, options: segment.options.map(convert) };
    if (segment.kind !== 'gem' || segment.params.op !== 'clear' || segment.params.mode === 'remove') return segment;
    return { ...segment, params: { ...segment.params, mode: 'remove' } };
  });
  const out = { ...proto, segments: convert(proto.segments) };
  corrected.set(proto, out);
  return out;
}
