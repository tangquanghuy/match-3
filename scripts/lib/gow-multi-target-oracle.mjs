/** A bounded source-text oracle for multi-victim damage. A matching clause is NOT whole-skill acceptance. */
const words = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
const number = '(\\d+|one|two|three|four|five|six)';
export const MULTI_TARGET_MODES = new Set(['enemyAll', 'enemyFirstN', 'enemyLastN', 'enemyRandomN', 'enemyWeakestN']);
export function sourceMultiTargetCount(text, target) {
  if (target === 'enemyAll') return /all enemies|each enemy/i.test(text) ? 4 : null;
  const order = target === 'enemyFirstN' ? 'first' : target === 'enemyLastN' ? 'last' :
    target === 'enemyRandomN' ? 'random' : target === 'enemyWeakestN' ? 'weakest' : null;
  if (!order) return null;
  const re = target === 'enemyFirstN' || target === 'enemyLastN'
    ? new RegExp(`\\b${order}\\s+${number}\\s+enemies`, 'i')
    : new RegExp(`\\b${number}\\s+${order}\\s+enemies`, 'i');
  const hit = re.exec(text.replace(/\s+/g, ' '));
  return hit ? (words[hit[1].toLowerCase()] ?? Number(hit[1])) : null;
}
export function sourceMultiTargetSegments(row) {
  if (!row.runtime?.prototype || !row.source?.native?.SpellSteps) return [];
  return row.runtime.prototype.segments.flatMap(s => s.kind === 'choose' ? s.options.flat() : [s]).filter(s => s.kind === 'damage' && MULTI_TARGET_MODES.has(s.target)
    && (!s.range || s.range === 'single') && !s.ifCond && !s.targetRace && !s.targetKingdom && s.chance === undefined
    && sourceMultiTargetCount(row.source.englishDescription, s.target) > 1
    && (sourceMultiTargetCount(row.source.englishDescription, s.target) <= 4
      || (s.target === 'enemyRandomN' && s.randomWaves === sourceMultiTargetCount(row.source.englishDescription, s.target)
        && row.source.native.SpellSteps.filter(step => /Damage/.test(step.Type ?? '')
          && /Random.*Enemy/.test(step.Target ?? '')).length === s.randomWaves)));
}
