/** Fixed five-entity review shards. Per-shard claims are atomic; acceptance always comes from ledger. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const command = args[0] ?? 'status';
const opt = name => { const i = args.indexOf(`--${name}`); return i < 0 ? null : args[i + 1]; };
const root = path.resolve(opt('root') ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
const rel = 'tasks/active/gow-skill-shards';
const base = path.join(root, rel);
const stateDir = path.join(base, 'state');
const claimsDir = path.join(base, 'claims');
const manifestPath = path.join(base, 'manifest.json');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  fs.writeFileSync(temp, value, 'utf8');
  fs.renameSync(temp, file);
};
const stamp = () => new Date().toISOString();
const idOf = n => `S${String(n).padStart(4, '0')}`;
const claimPath = id => path.join(claimsDir, `${id}.json`);
const statePath = id => path.join(stateDir, `${id}.json`);
const shardPage = (id, prefix) => path.join(base, `${prefix}-${id}.md`);
const loadState = id => fs.existsSync(statePath(id)) ? read(statePath(id)) : { state: 'queued' };
const loadClaim = id => {
  if (!fs.existsSync(claimPath(id))) return null;
  try { return read(claimPath(id)); } catch (error) {
    // Another process may have reserved the file but not finished writing metadata yet.
    if (error instanceof SyntaxError || error.code === 'ENOENT') return { worker: 'claim-pending' };
    throw error;
  }
};
const manifest = () => read(manifestPath);
const worker = opt('worker');
const checkWorker = () => { if (!worker || !/^[\w.-]{1,48}$/.test(worker)) throw new Error('Specify --worker with a stable identifier (letters, numbers, _ . -).'); };
const checkId = id => { if (!manifest().shards.some(s => s.id === id)) throw new Error(`Unknown shard: ${id}`); };
const owned = id => { checkWorker(); checkId(id); if (loadClaim(id)?.worker !== worker) throw new Error(`${id} is not claimed by ${worker}`); };
const hash = text => createHash('sha256').update(text).digest('hex');

function initialize() {
  const queue = read(path.join(root, 'artifacts/gow-skill-audit/acceptance-queue.json'));
  const ledger = read(path.join(root, 'artifacts/gow-skill-audit/ledger.json'));
  if (queue.fingerprint !== ledger.fingerprint || queue.rows.length !== 2518 || queue.completion.total !== 2518)
    throw new Error('Refresh ledger and acceptance queue first.');
  const keys = queue.rows.map(r => r.key);
  if (new Set(keys).size !== 2518) throw new Error('Duplicate entity key in queue');
  const byKey = new Map(ledger.rows.map(r => [r.key, r]));
  const members = queue.rows.map(r => {
    if (byKey.get(r.key)?.spellId !== r.spellId) throw new Error(`Queue/ledger binding mismatch: ${r.key}`);
    return { key: r.key, spellId: r.spellId, name: r.name, referenceName: r.referenceName };
  });
  const rosterHash = hash(JSON.stringify(members.map(m => [m.key, m.spellId]).sort((a, b) => a[0].localeCompare(b[0]))));
  let output;
  if (fs.existsSync(manifestPath)) {
    output = manifest();
    if (output.rosterHash !== rosterHash || output.shardSize !== 5) throw new Error('Roster/size changed; keep the existing manifest and reconcile explicitly.');
  } else {
    const shards = [];
    for (let i = 0; i < members.length; i += 5) shards.push({ id: idOf(shards.length + 1), members: members.slice(i, i + 5) });
    output = { schemaVersion: 1, scope: 'stored-gow-snapshot', shardSize: 5, rosterHash,
      baselineFingerprint: queue.fingerprint, entities: members.length, shards };
    write(manifestPath, JSON.stringify(output, null, 2) + '\n');
  }
  const checked = output.shards.flatMap(s => s.members.map(m => m.key));
  if (checked.length !== 2518 || new Set(checked).size !== 2518) throw new Error('Manifest does not partition all 2518 entities exactly once.');
  for (const shard of output.shards) {
    const page = shardPage(shard.id, 'TASK');
    if (fs.existsSync(page) || fs.existsSync(shardPage(shard.id, 'DONE'))) continue;
    write(page, [
      `# 技能验收分片 ${shard.id}（${shard.members.length} 项）`, '',
      '> 本页分工固定，不随每次验收队列重排；状态与签收实时读取账本及本片记录。本页的“核对完成”不等于整项签收。',
      '> 总任务：[技能核对任务书](../TASK-GOW-SKILL-REVIEW.md) · [操作指南](../../../docs/gow-skill-review-operator-guide.md) · [分片状态](STATUS.md)。', '',
      '| 实体 | 技能 ID | 参考名称 |', '|---|---:|---|',
      ...shard.members.map(m => `| \`${m.key}\` ${m.name.replaceAll('|', '\\|')} | ${m.spellId} | ${m.referenceName.replaceAll('|', '\\|')} |`), '',
      '## 交付要求', '',
      '1. 每项原版英文子句／原始步骤／分支与最终原型逐条对照，复用同构测试但保留独立 ID／预期／真实施法证据。',
      '2. 差异先记录复现和影响范围；共享引擎／生成器的修复交协调窗口串行合并。',
      '3. 单独更新本片状态；汇总窗口合并到 `data/audit/gow-skill-reviews.json` 后运行同指纹全量验证，只有账本 `acceptance.accepted` 才计入签收。', '',
    ].join('\n'));
  }
  console.log(`Partition ready: ${output.shards.length} shards / ${output.entities} entities; each 5 except last.`);
  publish();
}

function publish() {
  const m = manifest();
  const ledger = read(path.join(root, 'artifacts/gow-skill-audit/ledger.json'));
  const receiptFile = path.join(root, 'artifacts/gow-skill-audit/verification-receipt.json');
  const receipt = fs.existsSync(receiptFile) ? read(receiptFile) : null;
  const verified = !!receipt && ledger.fingerprint === receipt.fingerprint && receipt.testExitCode === 0 && receipt.typecheckExitCode === 0 && receipt.failed === 0;
  const rows = new Map(ledger.rows.map(r => [r.key, r]));
  const shards = m.shards.map(s => {
    const accepted = s.members.filter(x => verified && rows.get(x.key)?.acceptance?.accepted === true).length;
    const progress = loadState(s.id), claim = loadClaim(s.id);
    return { id: s.id, size: s.members.length, accepted, remaining: s.members.length - accepted,
      state: accepted === s.members.length ? 'accepted' : progress.state, worker: claim?.worker ?? null, updatedAt: progress.updatedAt ?? null,
      note: progress.note ?? '', keys: s.members.map(x => x.key) };
  });
  // Only a current matching verification receipt can promote/demote a shard page.
  if (verified) for (const s of shards) {
    const from = shardPage(s.id, s.remaining === 0 ? 'TASK' : 'DONE');
    const to = shardPage(s.id, s.remaining === 0 ? 'DONE' : 'TASK');
    if (!fs.existsSync(from)) continue;
    if (fs.existsSync(to)) throw new Error(`Both TASK and DONE pages exist for ${s.id}`);
    fs.renameSync(from, to);
  }
  const summary = { entities: m.entities, accepted: shards.reduce((n, s) => n + s.accepted, 0),
    remaining: shards.reduce((n, s) => n + s.remaining, 0), totalShards: shards.length,
    fullyAcceptedShards: shards.filter(s => s.remaining === 0).length,
    claimedShards: shards.filter(s => s.worker).length,
    workerReviewedShards: shards.filter(s => s.state === 'reviewed').length,
    needsRepairShards: shards.filter(s => s.state === 'needs-repair').length };
  const workers = Object.values(shards.reduce((out, s) => {
    const owner = s.worker ?? (s.state !== 'queued' ? loadState(s.id).worker : null);
    if (!owner) return out;
    const w = out[owner] ?? { worker: owner, claimedShards: 0, assignedEntities: 0, reviewedShards: 0, accepted: 0 };
    w.claimedShards += Number(!!s.worker); w.assignedEntities += s.size;
    w.reviewedShards += Number(s.state === 'reviewed'); w.accepted += s.accepted; out[owner] = w;
    return out;
  }, {}));
  const result = { schemaVersion: 1, generatedAt: stamp(), manifestRosterHash: m.rosterHash,
    ledgerFingerprint: ledger.fingerprint, receiptFingerprint: receipt?.fingerprint ?? null,
    receiptValid: verified, summary, workers, shards };
  write(path.join(base, 'STATUS.json'), JSON.stringify(result, null, 2) + '\n');
  const active = shards.filter(s => s.worker || s.state !== 'queued').slice(0, 50);
  write(path.join(base, 'STATUS.md'), [
    '# GoW 技能验收：分片实时状态', '',
    `> 最近刷新 ${result.generatedAt}。${verified ? '账本与全量凭证指纹一致' : '账本／凭证指纹不一致；签收暂记 0，先重跑全量验证' }。`,
    `原版实体 **${summary.accepted} / ${summary.entities} 整项签收**；${summary.remaining} 待签收。` +
    ` 固定 ${summary.totalShards} 片（5 项／片，末片可不足）；${summary.claimedShards} 片已认领；${summary.workerReviewedShards} 片人工核对完毕；${summary.needsRepairShards} 片待修；${summary.fullyAcceptedShards} 片已全部签收。`, '',
    '本表的「人工核对完毕」与「整项签收」严格分开；签收数字属于最近一次账本／测试凭证快照，源码或证据变更后由协调窗口重跑全量验证。全部分片及逐实体键见 [STATUS.json](STATUS.json)；未完成分片为 `TASK-Sxxxx.md`，整片签收后为 `DONE-Sxxxx.md`。', '',
    '## 窗口进度', '',
    '| 窗口 | 已认领片 | 分配实体 | 人工核对完毕片 | 整项签收 |', '|---|---:|---:|---:|---:|',
    ...workers.map(w => `| ${w.worker} | ${w.claimedShards} | ${w.assignedEntities} | ${w.reviewedShards} | ${w.accepted} |`), '',
    '## 已认领／处理中／待修／已签收片（最多显示 50 片）', '',
    '| 分片 | 负责人 | 工单状态 | 整项签收 | 实体键 |', '|---|---|---|---:|---|',
    ...active.map(s => `| [${s.id}](${fs.existsSync(shardPage(s.id, 'DONE')) ? 'DONE' : 'TASK'}-${s.id}.md) | ${s.worker ?? '—'} | ${s.state} | ${s.accepted}/${s.size} | ${s.keys.join('、')} |`), '',
    `其他未认领片：${shards.filter(s => !s.worker && s.state === 'queued').length}；用 \`node scripts/gow-review-shards.mjs status\` 单次刷新，或 \`node scripts/gow-review-shards.mjs watch --interval 5\` 每 5 秒刷新。`, '',
  ].join('\n'));
  console.log(`Status: ${summary.accepted}/${summary.entities} accepted, ${summary.claimedShards} claimed, ${summary.workerReviewedShards} worker-reviewed, receipt ${verified ? 'valid' : 'stale'}.`);
}

function claim() {
  checkWorker();
  const count = Number(opt('count') ?? 1);
  if (![1, 2].includes(count)) throw new Error('Use --count 1 (5 items) or 2 (10 items).');
  const m = manifest(), ledger = read(path.join(root, 'artifacts/gow-skill-audit/ledger.json'));
  const rows = new Map(ledger.rows.map(r => [r.key, r]));
  const taken = [];
  for (const shard of m.shards) {
    if (taken.length >= count) break;
    if (fs.existsSync(claimPath(shard.id)) || ['reviewed', 'ready-for-merge', 'needs-repair'].includes(loadState(shard.id).state) ||
        shard.members.every(x => rows.get(x.key)?.acceptance?.accepted === true)) continue;
    fs.mkdirSync(claimsDir, { recursive: true });
    try {
      const fd = fs.openSync(claimPath(shard.id), 'wx');
      try { fs.writeFileSync(fd, JSON.stringify({ worker, claimedAt: stamp() }) + '\n'); } finally { fs.closeSync(fd); }
      taken.push(shard.id);
    } catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
  if (taken.length !== count) {
    for (const id of taken) fs.unlinkSync(claimPath(id));
    throw new Error(`Only ${taken.length} free shards found; assignment not changed.`);
  }
  for (const id of taken) write(statePath(id), JSON.stringify({ state: 'reviewing', worker, updatedAt: stamp() }, null, 2) + '\n');
  console.log(`Assigned to ${worker}: ${taken.join(', ')} (${taken.map(id => m.shards.find(s => s.id === id).members.length).reduce((a, b) => a + b, 0)} items).`);
  publish();
}

function report() {
  const id = opt('shard'), state = opt('state');
  owned(id);
  if (!['reviewing', 'needs-repair', 'ready-for-merge', 'reviewed'].includes(state)) throw new Error('Invalid --state');
  const previous = loadState(id);
  write(statePath(id), JSON.stringify({ ...previous, state, worker, updatedAt: stamp(), note: opt('note') ?? previous.note ?? '' }, null, 2) + '\n');
  publish();
}
function release() {
  const id = opt('shard'); owned(id);
  fs.unlinkSync(claimPath(id));
  if (loadState(id).state === 'reviewing') write(statePath(id), JSON.stringify({ ...loadState(id), state: 'queued', updatedAt: stamp() }, null, 2) + '\n');
  console.log(`Released ${id} by ${worker}; recorded state remains ${loadState(id).state}.`);
  publish();
}
try {
  if (command === 'init') initialize();
  else if (command === 'status') publish();
  else if (command === 'claim') claim();
  else if (command === 'report') report();
  else if (command === 'release') release();
  else if (command === 'watch') {
    const seconds = Number(opt('interval') ?? 5);
    if (!Number.isInteger(seconds) || seconds < 2) throw new Error('Specify --interval in seconds, at least 2.');
    publish(); setInterval(() => { try { publish(); } catch (e) { console.error(e.message); } }, seconds * 1000);
  } else throw new Error('Usage: init | claim --worker NAME --count 1|2 | report --shard S0001 --worker NAME --state STATE [--note TEXT] | release --shard S0001 --worker NAME | status | watch --interval 5');
} catch (error) { console.error(error.message); process.exitCode = 1; }
