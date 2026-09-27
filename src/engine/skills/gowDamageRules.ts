import rulesJson from '../../data/gowDamageRules.json';
import type { EffectSegment, SkillPrototype } from './prototypes';

export interface GowDamageRule { scatter?: boolean; splash?: number[] }
export const GOW_DAMAGE_RULES: Readonly<Record<number, GowDamageRule>> = rulesJson;
// Catalog and battle aliases collect independently, but must share prototype identity.
const correctedPrototypes = new WeakMap<SkillPrototype, Map<number, SkillPrototype>>();

/** Final registration correction, shared by curated troops, legacy overrides and weapons.
 * The explicit source ledger corrects historical all=Scatter mistranslations without
 * touching unrelated damage/heal/boost clauses or editing generated source anchors.
 */
export function applyGowDamageRule(id: number, proto: SkillPrototype): SkillPrototype {
  const rule = GOW_DAMAGE_RULES[id];
  if (!rule) return proto;
  const cached = correctedPrototypes.get(proto)?.get(id);
  if (cached) return cached;
  let splashIndex = 0;
  const convert = (segments: EffectSegment[]): EffectSegment[] => segments.map(segment => {
    if (segment.kind === 'oneOf' || segment.kind === 'choose') return { ...segment, options: segment.options.map(convert) };
    if (segment.kind !== 'damage') return segment;
    if (segment.range === 'splash' && rule.splash) {
      const ratio = rule.splash[Math.min(splashIndex++, rule.splash.length - 1)];
      return { ...segment, splashRatio: ratio };
    }
    if (rule.scatter && !segment.drain && (segment.range === 'all' || segment.splitRandom)) {
      const { splitRandom: _legacy, ...rest } = segment;
      return { ...rest, range: 'scatter' };
    }
    return segment;
  });
  const corrected = { ...proto, segments: convert(proto.segments) };
  const entries = correctedPrototypes.get(proto) ?? new Map<number, SkillPrototype>();
  entries.set(id, corrected);
  correctedPrototypes.set(proto, entries);
  return corrected;
}
