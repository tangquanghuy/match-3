/** Read-only inspection + local save backup + auditable, account-specific D1 mail SQL.
 * Run BEFORE releasing new Explore 7-12 first-clear gems so old records are not mixed with new grants.
 * Never calls the gameplay load endpoint. This script only prepares SQL; execute it after checking the backups.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const worker = join(root, 'worker');
const token = readFileSync(join(worker, '.admin-read-token'), 'utf8').trim();
if (!/^[A-Za-z0-9_-]{32,128}$/.test(token)) throw new Error('Missing admin read token');
const wrangler = join(worker, 'node_modules/wrangler/bin/wrangler.js');
const response = execFileSync(process.execPath, [wrangler, 'd1', 'execute', 'gems-meta', '--remote',
  '--command', 'SELECT player_id FROM accounts ORDER BY player_id', '--json'],
{ cwd: worker, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
const existing = execFileSync(process.execPath, [wrangler, 'd1', 'execute', 'gems-meta', '--remote',
  '--command', "SELECT id FROM system_mail_campaigns WHERE id LIKE '2026-10-09-explore-high-tier-gems-v1-%' LIMIT 1", '--json'],
{ cwd: worker, encoding: 'utf8' });
if (JSON.parse(existing)[0]?.results?.length) throw new Error('Backfill already sent; do not create another set of recipient mails');
if (!readFileSync(join(root, 'src/meta/data/economy.ts'), 'utf8').includes('EXPLORE_HIGH_TIER_FIRST_CLEAR_GEMS = 150;'))
  throw new Error('First-clear gem amount has changed; review backfill script');
const accounts = JSON.parse(response)[0]?.results;
if (!Array.isArray(accounts) || accounts.length === 0) throw new Error('No accounts returned');
const job = new Date().toISOString().replace(/[:.]/g, '-');
const destination = join(worker, 'artifacts', `explore-first-clear-${job}`);
mkdirSync(join(destination, 'backups'), { recursive: true });
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const batches = new Map();
const audit = [];
let offset = 0;
const workers = Array.from({ length: 6 }, async () => {
  while (offset < accounts.length) {
    const index = offset++;
    const { player_id: playerId } = accounts[index];
    if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(playerId)) throw new Error('Unexpected player ID');
    let answer;
    for (let retry = 0; retry < 3; retry++) {
      try {
        const res = await fetch(`https://match.rown.dpdns.org/api/admin/player/${playerId}`, {
          headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000),
        });
        if (!res.ok) throw new Error(`inspect ${res.status}`);
        answer = await res.json();
        if (answer?.account?.player_id !== playerId) throw new Error('Account mismatch');
        break;
      } catch (error) { if (retry === 2) throw error; await new Promise(r => setTimeout(r, (retry + 1) * 700)); }
    }
    if (!answer.save) continue; // account has not created a character yet
    const clears = Object.entries(answer.save.kingdoms ?? {}).flatMap(([kingdom, state]) =>
      [...new Set(state?.clearedExploreTiers ?? [])].filter(tier => Number.isInteger(tier) && tier >= 7 && tier <= 12)
        .map(tier => ({ kingdom, tier })));
    if (!clears.length) continue;
    const raw = JSON.stringify(answer, null, 2) + '\n';
    const backup = join(destination, 'backups', `${playerId}.json`);
    writeFileSync(backup, raw, { flag: 'wx' });
    const sha256 = createHash('sha256').update(raw).digest('hex');
    audit.push({ playerId, clears, gems: clears.length * 150, backup: `${playerId}.json`, sha256, inspectedAt: answer.inspectedAt });
    const ids = batches.get(clears.length) ?? [];
    ids.push(playerId);
    batches.set(clears.length, ids);
  }
});
await Promise.all(workers);
audit.sort((a, b) => a.playerId.localeCompare(b.playerId));
const sql = [`-- Backfill only historic E7-12 first clears in the locally backed up production saves.`,
  `-- ${job}: ${accounts.length} accounts inspected, ${audit.length} saves backed up, ${audit.reduce((sum, row) => sum + row.gems, 0)} gems total.`,
  `-- Existing first clears ALREADY paid their kingdom Arcane stone; do not duplicate stones.`,
  `-- Review audit.json and SHA256 backups before running this file.`, ''];
for (const [count, playerIds] of [...batches].sort((a, b) => a[0] - b[0])) {
  const id = `2026-10-09-explore-high-tier-gems-v1-${count}`;
  sql.push(`INSERT OR IGNORE INTO system_mail_campaigns (id, title, body, sent_at, currencies_json, materials_json, class_xp) VALUES (` +
    `${quote(id)}, ${quote('探索 7～12 首通宝石补发')}, ` +
    `${quote(`你此前已首通探索难度 7～12 中的 ${count} 个王国·难度档位。每档补发 150 宝石，共 ${count * 150} 宝石。对应秘法石在首通时已发放，本次不重复发放。请在邮件附件领取宝石。`)}, ` +
    `unixepoch('now') * 1000, ${quote(JSON.stringify({ gems: count * 150 }))}, '{}', 0);`);
  for (const playerId of playerIds.sort()) sql.push(`INSERT OR IGNORE INTO system_mail_recipients (campaign_id, player_id, sent_at) ` +
    `SELECT id, ${quote(playerId)}, sent_at FROM system_mail_campaigns WHERE id = ${quote(id)};`);
  sql.push('');
}
writeFileSync(join(destination, 'audit.json'), JSON.stringify({ job, inspectedAccounts: accounts.length, recipients: audit }, null, 2) + '\n', { flag: 'wx' });
writeFileSync(join(destination, 'backfill.sql'), sql.join('\n'), { flag: 'wx' });
console.log(JSON.stringify({ destination, inspected: accounts.length, affected: audit.length,
  clears: audit.reduce((n, row) => n + row.clears.length, 0), gems: audit.reduce((n, row) => n + row.gems, 0) }));
