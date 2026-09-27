/** Group source spell shapes for human review; grouping never grants entity acceptance. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const queuePath = 'artifacts/gow-skill-audit/acceptance-queue.json';
const ledgerPath = 'artifacts/gow-skill-audit/ledger.json';
const outputPath = 'artifacts/gow-skill-audit/review-cohorts.json';
const reportPath = 'docs/gow-skill-review-cohorts.md';
const queue = read(queuePath);
const ledger = read(ledgerPath);
if (queue.fingerprint !== ledger.fingerprint || queue.completion.total !== 2518 || queue.rows.length !== 2518) {
  throw new Error('Refresh the ledger and acceptance queue before grouping.');
}
const sourceRows = new Map(ledger.rows.map(row => [row.key, row]));
const groups = new Map();
const blocked = { 'awaiting-evidence': 0, 'awaiting-repair': 0 };
const excluded = new Set(['accepted', ...Object.keys(blocked)]);
for (const item of queue.rows) {
  if (Object.hasOwn(blocked, item.state)) blocked[item.state]++;
  if (excluded.has(item.state)) continue;
  const source = sourceRows.get(item.key);
  if (!source || source.spellId !== item.spellId) throw new Error(`Ledger/queue binding mismatch: ${item.key}`);
  const native = source.source.native;
  // Only the ordered operation types and top-level target form a cohort. All numeric
  // values, nested targets, colours, descriptions and actual battle paths stay per entity.
  const shape = { target: native?.Target ?? null, stepTypes: (native?.SpellSteps ?? []).map(s => s.Type) };
  const signature = JSON.stringify(shape);
  const members = groups.get(signature) ?? [];
  members.push({
    key: item.key, kind: item.kind, name: item.referenceName, spellId: item.spellId,
    state: item.state, sourceText: source.source.englishDescription,
    nativeCost: native?.Cost ?? null, nativeSteps: native?.SpellSteps ?? [],
    bindingChecks: source.bindingChecks, remainingDimensions: item.remainingDimensions,
    remainingClauses: item.remainingClauses, remainingNativeSteps: item.remainingNativeSteps,
    remainingBranches: item.remainingBranches,
  });
  groups.set(signature, members);
}
const cohorts = [...groups.entries()].map(([signature, members]) => ({
  shape: JSON.parse(signature), count: members.length, members,
})).sort((a, b) => b.count - a.count || a.shape.stepTypes.length - b.shape.stepTypes.length || a.members[0].key.localeCompare(b.members[0].key));
const active = cohorts.reduce((n, group) => n + group.count, 0);
const shared = cohorts.filter(group => group.count > 1);
const summary = {
  queuedForReview: active, accepted: queue.completion.accepted, awaitingEvidence: blocked['awaiting-evidence'],
  awaitingRepair: blocked['awaiting-repair'], cohortCount: cohorts.length,
  sharedCohorts: shared.length, membersInSharedCohorts: shared.reduce((n, group) => n + group.count, 0),
};
if (Object.values({ active, ...blocked }).reduce((a, b) => a + b, queue.completion.accepted) !== 2518) {
  throw new Error('Review states do not cover all original entities.');
}
const output = {
  schemaVersion: 1, fingerprint: ledger.fingerprint,
  inputHashes: { ledger: sha(fs.readFileSync(path.join(root, ledgerPath))), queue: sha(fs.readFileSync(path.join(root, queuePath))) },
  rule: '同目标及同顺序原生步骤仅用于发现可复用的共享规则。文本、公式、参数、绑定、真实施法、证据和签收始终逐实体处理；此文件不写入验收结论。',
  summary, cohorts,
};
const json = JSON.stringify(output, null, 2) + '\n';
const markdown = [
  '# GoW 技能同构复核工作台', '',
  '按原版快照的顶层目标及有序原生步骤类型分组；**同组不等于技能相同，更不等于自动签收**。先核实共享规则，再对组内每个实体分别检查文本、参数、费用/颜色、绑定、分支、真实施法及独立证据。', '',
  `当前同指纹整项签收 **${summary.accepted}/2,518**；可推进 **${active}** 项，待证据 **${summary.awaitingEvidence}** 项，待修复 **${summary.awaitingRepair}** 项。`,
  `可推进项分成 **${cohorts.length}** 组；其中 **${summary.membersInSharedCohorts}** 项处于 **${summary.sharedCohorts}** 个多人组。`, '',
  '优先批次（按可复用实体数排序，原生细节请参阅 `artifacts/gow-skill-audit/review-cohorts.json`）：', '',
  '| 顺位 | 顶层目标 | 有序步骤类型 | 实体数 | 前三个独立实体 |', '|---:|---|---|---:|---|',
  ...cohorts.slice(0, 40).map((g, i) => `| ${i + 1} | ${g.shape.target ?? '—'} | ${g.shape.stepTypes.join(' → ') || '—'} | ${g.count} | ${g.members.slice(0, 3).map(m => m.key).join('、')} |`), '',
  '验收入口：`node scripts/verify-gow-snapshot.mjs` → `node scripts/build-gow-acceptance-queue.mjs` → `node scripts/build-gow-review-cohorts.mjs`。需逐实体真实施法测试和同指纹全量通过，分组报告只负责安排复核次序。', '',
].join('\n');
if (process.argv.includes('--check')) {
  if (!fs.existsSync(path.join(root, outputPath)) || fs.readFileSync(path.join(root, outputPath), 'utf8') !== json ||
    !fs.existsSync(path.join(root, reportPath)) || fs.readFileSync(path.join(root, reportPath), 'utf8') !== markdown) {
    throw new Error('Review cohort output is stale. Rebuild after refreshing ledger and queue.');
  }
  console.log(`Cohorts current: ${summary.cohortCount}, ${summary.membersInSharedCohorts} shared-shape members, ${summary.accepted} accepted.`);
} else {
  fs.writeFileSync(path.join(root, outputPath), json);
  fs.writeFileSync(path.join(root, reportPath), markdown);
  console.log(`Cohorts written: ${summary.cohortCount}, ${summary.membersInSharedCohorts} shared-shape members, ${summary.accepted} accepted.`);
}
