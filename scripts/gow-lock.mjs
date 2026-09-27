/**
 * Advisory file locks for unattended parallel GoW review/fix agents.
 *   node scripts/gow-lock.mjs acquire --name <lock> --owner <agent> [--wait 600]   # exit 0 when held
 *   node scripts/gow-lock.mjs release --name <lock> --owner <agent>
 *   node scripts/gow-lock.mjs list
 * Lock names: a source path (src/engine/skills/effects/status.ts), or the special names
 *   "verify"  - held by the coordinator during full verification; nobody edits src/ or tests/ while it exists
 *   "reviews" - data/audit/gow-skill-reviews.json merge
 * Locks older than 45 minutes are stale and may be taken over (the takeover is logged).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'tasks/active/gow-skill-shards/locks');
const args = process.argv.slice(2);
const opt = n => { const i = args.indexOf(`--${n}`); return i < 0 ? null : args[i + 1]; };
const STALE_MS = 10 * 60 * 1000; // v2: per-file locks held <=5 min; older = abandoned
const file = name => path.join(dir, name.replace(/[\\/:]/g, '__') + '.lock');
const log = line => fs.appendFileSync(path.join(dir, 'locks.log'), `${new Date().toISOString()} ${line}\n`);
const sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
fs.mkdirSync(dir, { recursive: true });

function tryAcquire(name, owner) {
  const f = file(name);
  try {
    const fd = fs.openSync(f, 'wx');
    fs.writeFileSync(fd, JSON.stringify({ name, owner, at: new Date().toISOString() }));
    fs.closeSync(fd); log(`acquire ${name} ${owner}`); return true;
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    let held; try { held = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return false; }
    if (held.owner === owner) return true;
    if (Date.now() - Date.parse(held.at) > STALE_MS) { fs.unlinkSync(f); log(`stale-takeover ${name} from ${held.owner} by ${owner}`); return tryAcquire(name, owner); }
    return false;
  }
}
const cmd = args[0], name = opt('name'), owner = opt('owner');
if (cmd === 'acquire') {
  const deadline = Date.now() + Number(opt('wait') ?? 600) * 1000;
  while (!tryAcquire(name, owner)) {
    if (Date.now() > deadline) { console.error(`lock ${name} busy: ${fs.readFileSync(file(name), 'utf8')}`); process.exit(2); }
    sleep(5000);
  }
  console.log(`held ${name}`);
} else if (cmd === 'release') {
  const f = file(name);
  if (fs.existsSync(f) && JSON.parse(fs.readFileSync(f, 'utf8')).owner === owner) { fs.unlinkSync(f); log(`release ${name} ${owner}`); }
  console.log(`released ${name}`);
} else if (cmd === 'list') {
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.lock'))) console.log(fs.readFileSync(path.join(dir, f), 'utf8'));
} else { console.error('acquire|release|list'); process.exit(1); }
