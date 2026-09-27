// sa-L76 helper: native RandomEnemy + RandomPrefNotPrevEnemy damage chains vs prototype enemyRandomN.
const l = require('../../../../artifacts/gow-skill-audit/ledger.json');
for (const r of l.rows) {
  const steps = r.source?.native?.SpellSteps ?? [];
  const pnp = steps.filter(s => s.Target === 'RandomPrefNotPrevEnemy' && /Damage/.test(s.Type)).length;
  if (!pnp) continue;
  const segs = r.runtime?.prototype?.segments ?? [];
  const rn = segs.filter(s => s.target === 'enemyRandomN');
  const flag = rn.some(s => s.randomWaves === undefined && s.range !== 'splash') ? 'NO-WAVES' : '';
  console.log(`${r.key}\t${r.spellId}\tpnp=${pnp}\t${segs.map(s => `${s.kind}:${s.target}${s.n ? '/n' + s.n : ''}${s.randomWaves ? '/w' + s.randomWaves : ''}${s.range ? '/' + s.range : ''}`).join(' ')}\t${flag}\tacc=${!!r.acceptance?.accepted}`);
}
