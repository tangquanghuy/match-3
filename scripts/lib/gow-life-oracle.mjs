/** Narrow independent native-step oracle for DIRECT hp-buff modes, not whole-skill acceptance.
 * Repeated native steps may collapse into one conditional/target-count segment;
 * when all modes agree this does not certify count, order, scaling or targeting.
 */
export function nativeLifeModes(native, count, spellId) {
  if (!count) return [];
  const types = (native?.SpellSteps ?? []).filter(s => ['IncreaseHealth', 'IncreaseAllStats', 'Heal'].includes(s.Type));
  const modes = [...new Set(types.map(s => s.Type === 'Heal' ? 'heal' : 'gain'))];
  if (modes.length === 1) return Array(count).fill(modes[0]);
  if ([7025, 7161].includes(spellId) && count === 2) return ['gain', 'heal'];
  return null;
}
