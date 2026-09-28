/**
 * sa-R6: cast each key with seeds 1..N and tally distinct spell-phase outcomes (random branch distribution).
 *   npx vite-node tasks/active/gow-skill-shards/lane-L2/tools/r6branches.ts t6583,w1563 [N=200] ['{"magic":0}']
 */
import { castSpell } from '../../../../../tests/helpers/gowCast';
const expand = (k: string) => k.replace(/^t(\d+)$/, 'troop:$1').replace(/^w(\d+)$/, 'weapon:$1');
const [keys, nArg, json] = process.argv.slice(2);
const n = Number(nArg ?? 200); const o = json ? JSON.parse(json) : {};
for (const key of keys.split(',').map(expand)) {
  const tally = new Map<string, number>();
  for (let seed = 1; seed <= n; seed++) {
    const s = castSpell({ key, seed, ...o }).summary;
    // strip target ids / numbers that vary only with random targets? keep full line but cut cascade part
    const i = s.order.indexOf('~cascade~');
    const line = (i < 0 ? s.order : s.order.slice(0, i)).join(' ; ').replace(/convert [^;]*? -> /g, 'convert * -> ').replace(/destroy (\d+) \([^)]*\)/g, 'destroy $1')
      + (s.extraTurn && s.extraTurn !== 'match' ? `  extra:${s.extraTurn}` : '');
    tally.set(line, (tally.get(line) ?? 0) + 1);
  }
  console.log(`== ${key} (${n} seeds, ${tally.size} outcomes)`);
  for (const [l, c] of [...tally].sort((a, b) => b[1] - a[1]).slice(0, 24)) console.log(`  ${String(c).padStart(4)}  ${l.slice(0, 300)}`);
}
