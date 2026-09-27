import rulesJson from '../../data/gowLifeRules.json';
import type { EffectSegment, SkillPrototype } from './prototypes';
import type { LifeMode } from './effects/buff';

/** Source-backed modes in depth-first hp-buff order; does not certify other clauses. */
export const GOW_LIFE_RULES = rulesJson as Readonly<Record<number, readonly LifeMode[]>>;
const correctedPrototypes = new WeakMap<SkillPrototype, Map<number, SkillPrototype>>();

/** Shared correction for curated/override troops and numeric/equipped weapon aliases.
 * No custom spell IDs are in the source table. Theft, devour, random stats and
 * traits deliberately remain outside this direct-buff correction's scope.
 */
export function applyGowLifeRule(id: number, proto: SkillPrototype): SkillPrototype {
  const modes = GOW_LIFE_RULES[id];
  if (!modes) return proto;
  const cached = correctedPrototypes.get(proto)?.get(id);
  if (cached) return cached;
  let index = 0;
  const convert = (segments: EffectSegment[]): EffectSegment[] => segments.map(segment => {
    if (segment.kind === 'choose' || segment.kind === 'oneOf') {
      return { ...segment, options: segment.options.map(convert) };
    }
    if (segment.kind !== 'buff' || segment.stat !== 'hp') return segment;
    const lifeMode = modes[index++];
    if (!lifeMode) throw new Error(`Life rule ${id}: more hp segments than reviewed modes`);
    return { ...segment, lifeMode };
  });
  const corrected = { ...proto, segments: convert(proto.segments) };
  if (index !== modes.length) throw new Error(`Life rule ${id}: hp segment count changed; review required`);
  const entries = correctedPrototypes.get(proto) ?? new Map<number, SkillPrototype>();
  entries.set(id, corrected);
  correctedPrototypes.set(proto, entries);
  return corrected;
}
