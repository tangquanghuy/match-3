/**
 * Approve observed behaviour = sign off. Lane-local golden files, replayed by tests/unit/gowCastGolden.test.ts.
 *   npx vite-node scripts/gow-golden.ts show    --keys k1,k2                   # the 4 scenario lines (L10 R10 L0 K)
 *   npx vite-node scripts/gow-golden.ts approve --lane L4a --by sa-L4a --keys k1,k2 [--note ".."] [--waive "k:clause:c2:boss"]
 *        -> writes tasks/active/gow-skill-shards/lane-<L>/golden.json and appends accept lines (test = gowCastGolden)
 *   npx vite-node scripts/gow-golden.ts diff    [--lane L4a]                   # golden entries whose behaviour changed
 *   npx vite-node scripts/gow-golden.ts drop    --lane L4a --keys k1           # remove (behaviour no longer approved)
 * Approve only after comparing the lines with English + native steps; add a hand-written test only for cases the
 * standard scenarios cannot show (specific boards, thresholds, immunity...), and list that file with --test.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { scenarioLines } from '../tests/helpers/gowCast';

const root = process.cwd();
const args = process.argv.slice(2);
const opt = (n: string) => { const i = args.indexOf(`--${n}`); return i < 0 ? null : args[i + 1]; };
const list = (s: string | null) => (s ?? '').split(',').map(x => x.trim()).filter(Boolean);
const base = path.join(root, 'tasks/active/gow-skill-shards');
const file = (lane: string) => path.join(base, `lane-${lane}`, 'golden.json');
type Entry = { lines: Record<string, string>; by: string; at: string };
const load = (lane: string): Record<string, Entry> => fs.existsSync(file(lane)) ? JSON.parse(fs.readFileSync(file(lane), 'utf8')) : {};
const save = (lane: string, g: Record<string, Entry>) => { fs.mkdirSync(path.dirname(file(lane)), { recursive: true });
  fs.writeFileSync(file(lane), JSON.stringify(Object.fromEntries(Object.entries(g).sort(([a], [b]) => a.localeCompare(b))), null, 1) + '\n'); };
const lanes = () => fs.readdirSync(base).filter(d => d.startsWith('lane-') && fs.existsSync(path.join(base, d, 'golden.json'))).map(d => d.slice(5));

const cmd = args[0];
if (cmd === 'show') {
  for (const k of list(opt('keys'))) { console.log(k); for (const [s, l] of Object.entries(scenarioLines(k))) console.log(`  ${s.padEnd(3)} ${l}`); }
} else if (cmd === 'approve') {
  const lane = opt('lane'), by = opt('by'), keys = list(opt('keys'));
  if (!lane || !by || !keys.length) throw new Error('approve --lane L --by NAME --keys k1,k2');
  const g = load(lane); const at = new Date().toISOString();
  for (const k of keys) g[k] = { lines: scenarioLines(k), by, at };
  save(lane, g);
  const tests = ['tests/unit/gowCastGolden.test.ts', ...list(opt('test'))].join(',');
  // accept lines are written AFTER the golden entries, so reviewedAt is later than any earlier change log entry
  const extra = [...(opt('note') ? ['--note', opt('note')!] : []), ...(opt('waive') ? ['--waive', opt('waive')!] : [])];
  for (const t of tests.split(',')) if (!fs.existsSync(path.join(root, t))) throw new Error(`missing test ${t}`);
  execFileSync(process.execPath, ['scripts/gow-signoff.mjs', 'accept', '--lane', lane, '--by', by, '--test', tests.split(',')[0], '--keys', keys.join(','), ...extra], { stdio: 'inherit', cwd: root });
  if (tests.split(',').length > 1) console.log(`note: extra tests ${tests.split(',').slice(1).join(',')} must also stay green; list them in issues/progress`);
  console.log(`golden approved ${keys.length} in lane-${lane}`);
} else if (cmd === 'lock-accepted') {
  // Lock the current behaviour of every ledger-accepted entity (no new signoff lines) into lane-accepted-base.
  const ledger = JSON.parse(fs.readFileSync(path.join(root, 'artifacts/gow-skill-audit/ledger.json'), 'utf8'));
  const g = load('accepted-base'); const at = new Date().toISOString(); let n = 0;
  for (const r of ledger.rows) if (r.acceptance?.accepted && !g[r.key]) { g[r.key] = { lines: scenarioLines(r.key), by: 'coord (accepted before golden)', at }; n++; }
  save('accepted-base', g); console.log(`locked ${n} accepted entities`);
} else if (cmd === 'diff') {
  let n = 0;
  for (const lane of opt('lane') ? [opt('lane')!] : lanes()) for (const [k, e] of Object.entries(load(lane))) {
    const now = scenarioLines(k);
    for (const s of Object.keys(e.lines)) if (e.lines[s] !== now[s as keyof typeof now]) { n++; console.log(`${lane} ${k} ${s}\n  was ${e.lines[s]}\n  now ${now[s as keyof typeof now]}`); }
  }
  console.log(`${n} changed scenario lines`);
} else if (cmd === 'drop') {
  const lane = opt('lane')!; const g = load(lane); for (const k of list(opt('keys'))) delete g[k]; save(lane, g); console.log('dropped');
} else { console.error('show | approve | diff | drop'); process.exitCode = 1; }
