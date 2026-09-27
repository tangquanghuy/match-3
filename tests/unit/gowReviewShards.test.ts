import { afterAll, expect, test } from 'vitest';
// @ts-expect-error project intentionally omits Node type declarations
import fs from 'node:fs';
// @ts-expect-error project intentionally omits Node type declarations
import os from 'node:os';
// @ts-expect-error project intentionally omits Node type declarations
import path from 'node:path';
// @ts-expect-error project intentionally omits Node type declarations
import { spawnSync } from 'node:child_process';
declare const process: { execPath: string };

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gow-review-shards-'));
const script = path.resolve('scripts/gow-review-shards.mjs');
const base = path.join(root, 'artifacts/gow-skill-audit');
fs.mkdirSync(base, { recursive: true });
const rows = Array.from({ length: 2518 }, (_, i) => ({ key: `troop:${i + 1}`, spellId: i + 1000, name: `T${i}`, referenceName: `T${i}` }));
const ledger = { fingerprint: 'test-fingerprint', rows: rows.map(r => ({ key: r.key, spellId: r.spellId, acceptance: { accepted: r.key === 'troop:1' } })) };
const queue = { fingerprint: ledger.fingerprint, completion: { total: 2518 }, rows };
for (const [name, value] of Object.entries({ ledger, 'acceptance-queue': queue,
  'verification-receipt': { fingerprint: ledger.fingerprint, testExitCode: 0, typecheckExitCode: 0, failed: 0 } })) {
  fs.writeFileSync(path.join(base, `${name}.json`), JSON.stringify(value));
}
const call = (...args: string[]) => spawnSync(process.execPath, [script, args[0], '--root', root, ...args.slice(1)], { encoding: 'utf8' });
const status = () => JSON.parse(fs.readFileSync(path.join(root, 'tasks/active/gow-skill-shards/STATUS.json'), 'utf8'));
afterAll(() => {
  const target = fs.realpathSync(root);
  const parent = fs.realpathSync(os.tmpdir());
  if (!target.startsWith(parent + path.sep)) throw new Error('Unexpected test cleanup target');
  fs.rmSync(target, { recursive: true, force: true });
});

test('fixed 5-item shards cover roster once, permit 10-item claims, and never count reports as acceptance', () => {
  expect(call('init').status).toBe(0);
  const m = JSON.parse(fs.readFileSync(path.join(root, 'tasks/active/gow-skill-shards/manifest.json'), 'utf8'));
  expect(m.shards).toHaveLength(504);
  expect(m.shards.flatMap((s: { members: Array<{ key: string }> }) => s.members.map(x => x.key))).toEqual(rows.map(r => r.key));
  expect(m.shards.at(-1).members).toHaveLength(3);
  expect(call('claim', '--worker', 'window-a', '--count', '2').status).toBe(0);
  expect(call('claim', '--worker', 'window-b', '--count', '1').status).toBe(0);
  expect(status().shards.filter((s: { worker: string }) => s.worker === 'window-a').map((s: { id: string }) => s.id)).toEqual(['S0001', 'S0002']);
  expect(status().shards.find((s: { id: string }) => s.id === 'S0003').worker).toBe('window-b');
  expect(call('report', '--shard', 'S0001', '--worker', 'window-b', '--state', 'reviewed').status).not.toBe(0);
  expect(call('report', '--shard', 'S0001', '--worker', 'window-a', '--state', 'reviewed').status).toBe(0);
  expect(status().summary.accepted).toBe(1);
  expect(status().summary.workerReviewedShards).toBe(1);
  expect(call('release', '--shard', 'S0001', '--worker', 'window-a').status).toBe(0);
  expect(call('init').status).toBe(0);
  expect(status().shards.find((s: { id: string }) => s.id === 'S0001').state).toBe('reviewed');
  ledger.fingerprint = 'stale';
  fs.writeFileSync(path.join(base, 'ledger.json'), JSON.stringify(ledger));
  expect(call('status').status).toBe(0);
  expect(status().receiptValid).toBe(false);
  expect(status().summary.accepted).toBe(0);
});
