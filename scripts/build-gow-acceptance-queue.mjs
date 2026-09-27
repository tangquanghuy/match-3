import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { nativeBranchKeys } from './lib/gow-whole-skill-reviews.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const digest = p => createHash('sha256').update(fs.readFileSync(path.join(root, p))).digest('hex');
const ledgerPath = 'artifacts/gow-skill-audit/ledger.json';
const reviewsPath = 'data/audit/gow-skill-reviews.json';
const outputPath = 'artifacts/gow-skill-audit/acceptance-queue.json';
const reportPath = 'docs/gow-skill-acceptance-queue.md';
const ledger = read(ledgerPath);
const reviews = read(reviewsPath).reviews;
const originals = ledger.rows.filter(r => r.kind === 'weapon' || !ledger.exclusions.customEntityIds.includes(r.entityId));
if (originals.length !== 2518 || originals.filter(r => r.kind === 'troop').length !== 1800 || originals.filter(r => r.kind === 'weapon').length !== 718) throw new Error('Scope changed: explicitly reconcile the complete roster.');
if (new Set(originals.map(r => r.key)).size !== originals.length) throw new Error('Duplicate entity key');
const reviewMap = new Map();
for (const review of reviews) {
  if (reviewMap.has(review.key)) throw new Error(`Duplicate review: ${review.key}`);
  reviewMap.set(review.key, review);
}
const preferred = ['troop:6000', 'troop:6004', 'weapon:1008', 'weapon:1023', 'weapon:1254', 'weapon:1365'];
const rows = originals.map(row => {
  const review = reviewMap.get(row.key);
  const accepted = row.acceptance.accepted === true && row.wholeSkillReview?.eligible === true;
  // An evidence-blocked draft stays visible with its reasons, but never stalls independent reviews.
  const awaitingRepair = !accepted && (row.confirmedDifferences.length > 0 || row.compilerMetadata?.fidelity === 'partial');
  const awaitingEvidence = !accepted && !awaitingRepair && review?.decision === 'draft' && (review.pendingReasons?.length ?? 0) > 0;
  const priority = accepted ? 5 : awaitingRepair || awaitingEvidence ? 4 : preferred.includes(row.key) ? 0 : review ? 1 : 3;
  const steps = (row.source.native?.SpellSteps ?? []).flatMap((s, i) => s.Type === 'None' ? [] : [String(i)]);
  return {
    key: row.key, kind: row.kind, entityId: row.entityId, name: row.name, referenceName: row.referenceName, spellId: row.spellId,
    state: accepted ? 'accepted' : awaitingRepair ? 'awaiting-repair' : awaitingEvidence ? 'awaiting-evidence' : review ? 'review-in-progress' : 'queued', priority, decision: review?.decision ?? null,
    source: { english: row.source.entityPath, native: row.source.nativePath, authority: row.source.authority },
    sourceClauseIds: row.sourceClauses.map(c => c.id), nativeStepIds: steps,
    remainingDimensions: ledger.acceptanceDimensions.filter(d => !['verified', 'not-applicable'].includes(review?.dimensions?.[d]?.status)),
    remainingClauses: row.sourceClauses.filter(c => !['verified', 'excluded'].includes(review?.clauseReviews?.find(x => x.id === c.id)?.status)).map(c => c.id),
    remainingNativeSteps: steps.filter(id => !['verified', 'excluded'].includes(review?.nativeStepReviews?.find(x => x.id === id)?.status)),
    remainingBranches: nativeBranchKeys(row).filter(id => review?.branchReviews?.find(b => b.id === id)?.status !== 'verified'),
    pendingReasons: review?.pendingReasons ?? ['逐条阅读英文与原始步骤，并独立核对实际执行；尚未开始整项复核。'],
    gateFailures: row.wholeSkillReview?.failures ?? ['whole-review-not-started'],
    confirmedDifferences: row.confirmedDifferences,
    testPaths: [...new Set(Object.values(review?.dimensions ?? {}).flatMap(d => d.tests ?? []))],
  };
}).sort((a, b) => a.priority - b.priority || a.remainingNativeSteps.length - b.remainingNativeSteps.length || a.remainingClauses.length - b.remainingClauses.length || a.kind.localeCompare(b.kind) || a.entityId - b.entityId);
rows.forEach((row, i) => { row.sequence = i + 1; });
const accepted = rows.filter(r => r.state === 'accepted').length;
const queue = {
  schemaVersion: 1,
  objective: '全部原版部队与武器技能逐实体语义核对，修复差异并完成整项最终验收。',
  scope: 'stored-gow-snapshot', inputHashes: { ledger: digest(ledgerPath), reviews: digest(reviewsPath) }, fingerprint: ledger.fingerprint,
  completion: { accepted, total: 2518, percentage: Number((accepted / 2518 * 100).toFixed(2)), complete: accepted === 2518 && ledger.summary.complete === true },
  customExcluded: ledger.exclusions.customEntityIds, currentEntity: rows.find(r => !['accepted', 'awaiting-evidence', 'awaiting-repair'].includes(r.state))?.key ?? null,
  rule: '队列只安排工作，不写入复核结论，不生成测试预期，不授予签收；签收沿用全量审计门槛。共享规则须保留独立来源与每实体适用证据。', rows,
};
const json = JSON.stringify(queue, null, 2) + '\n';
const first = rows.find(r => !['accepted', 'awaiting-evidence', 'awaiting-repair'].includes(r.state));
const report = [
  '# GoW 全量技能验收执行队列', '',
  `目标：逐个核对 **1,800 个原版部队技能 + 718 个武器技能 = 2,518 项**，修复差异后整项签收。${ledger.exclusions.customEntityIds.length} 个自设部队单列。`, '',
  '依据为仓库保存的原版英文/native快照及逐项共享规则证据，不声称已核对官方实时最新版。', '',
  `当前整项签收：**${accepted} / 2,518（${(accepted / 2518 * 100).toFixed(2)}%）**；已有复核记录：**${reviews.length}**。队列建立不增加签收数。`, '',
  '## 执行顺序', '',
  '1. Evidence-blocked drafts and source conflicts stay queued separately; review independent entities one by one with source and real-cast evidence.',
  '2. 修复已确认差异，核对来源冲突与partial武器。',
  '3. 剩余实体按固定顺序逐条核对；共享技能仍分别确认实体费用、颜色、绑定、特质与实际施法。',
  '4. 每批修复后重跑全量测试/类型检查，生成同指纹凭证，再通过整项门槛；全部2,518项通过才结束目标。', '',
  '## 当前下一项', '', `**${first?.key ?? '全部完成'} ${first?.name ?? ''} / 技能 ${first?.spellId ?? ''}**`, '',
  `待核对维度：${first?.remainingDimensions.join('、') ?? '无'}。`, '',
  '火枪手重点：法术减伤/妖火/反射分数取整、隐匿选敌与取消施法、反射和死亡/复活顺序。先找原版依据，再编写边界预期；以当前实现行为作为预期不构成独立核对。', '',
  '## 每项的验收流程', '',
  '- 阅读原版英文所有子句和native所有有效步骤/分支，明确费用、颜色、对象、公式、倍率、概率及执行顺序。',
  '- 核对实际注册原型、编译结果、执行器和用户可见描述；相关特质、状态、宝石与回合规则一起检查。',
  '- 为每条行为和边界记录来源、结论与测试；真实战斗入口必须覆盖。',
  '- 未实装模式/晋升度只逐条排除并写理由，普通技能部分继续验收。',
  '- 明确剩余问题，逐一处理后提交accept；脚本验证凭证和结构，语义由助手逐项阅读核实。', '',
  '## 文件和命令', '',
  '- 完整逐实体队列：`artifacts/gow-skill-audit/acceptance-queue.json`（含顺序、来源、未决维度/子句/步骤/分支、门槛失败原因）。',
  '- 语义复核记录：`data/audit/gow-skill-reviews.json`。',
  '- 刷新队列：`node scripts/build-gow-acceptance-queue.mjs`。',
  '- 一致性检查：`node scripts/build-gow-acceptance-queue.mjs --check`。',
  '- 修复后先运行`node scripts/verify-gow-snapshot.mjs`，再运行`node scripts/audit-gow-skills.mjs --check`，最后刷新队列。', '',
  '## 优先项摘要', '',
  '| 顺序 | 实体 | 技能ID | 状态 | 待核对维度数 |', '|---:|---|---:|---|---:|',
  ...rows.slice(0, 20).map(r => `| ${r.sequence} | ${r.key} ${r.name} | ${r.spellId} | ${r.state} | ${r.remainingDimensions.length} |`), '',
].join('\n');
if (process.argv.includes('--check')) {
  if (!fs.existsSync(path.join(root, outputPath)) || fs.readFileSync(path.join(root, outputPath), 'utf8') !== json || !fs.existsSync(path.join(root, reportPath)) || fs.readFileSync(path.join(root, reportPath), 'utf8') !== report) {
    console.error('Acceptance queue is stale; rebuild it after refreshing the ledger.'); process.exitCode = 1;
  } else console.log(`Queue current: ${rows.length} entities, ${accepted} accepted; next ${queue.currentEntity}`);
} else {
  fs.writeFileSync(path.join(root, outputPath), json); fs.writeFileSync(path.join(root, reportPath), report);
  console.log(`Queue written: ${rows.length} entities, ${accepted} accepted; next ${queue.currentEntity}`);
}
