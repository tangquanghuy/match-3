/** Compare native snapshot damage steps with the final registered prototype; never signs off an entire skill. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = name => path.join(root, name);
const ledgerPath = 'artifacts/gow-skill-audit/ledger.json';
const outputPath = 'artifacts/gow-skill-audit/damage-family-check.json';
const docPath = 'docs/gow-damage-family-check.md';
const ledger = JSON.parse(fs.readFileSync(file(ledgerPath), 'utf8'));
const ratios = { SplashDamage: .25, SplashHighDamage: .5, SplashHeavyDamage: .75,
  TrueSplashDamage: .25, TrueSplashHighDamage: .5, TrueSplashHeavyDamage: .75 };
const isNative = type => Object.hasOwn(ratios, type) || type === 'ScatterDamage' || type === 'TrueScatterDamage';
const flatten = segments => (segments ?? []).flatMap(s => [s, ...(s.options ?? []).flatMap(flatten)]);
const targetNames = { FromTarget: 'enemyChosen', AllEnemies: 'enemyAll', RandomEnemy: 'enemyRandom', FrontEnemy: 'enemyFront' };
const customIds = new Set(ledger.exclusions.customEntityIds);
const checked = [];
for (const row of ledger.rows) {
  if ((row.kind !== 'troop' && row.kind !== 'weapon') || (row.kind === 'troop' && customIds.has(row.entityId))) continue;
  const original = (row.source.native?.SpellSteps ?? []).filter(s => isNative(s.Type));
  const runtime = flatten(row.runtime.prototype?.segments).filter(s => s.kind === 'damage' && (s.range === 'splash' || s.range === 'scatter' || s.splitRandom));
  if (!original.length && !runtime.length) continue;
  const findings = [];
  let state = 'basic-shape-matched';
  if (!original.length || !runtime.length) {
    state = !original.length ? 'source-shape-needs-review' : 'source-runtime-conflict';
    findings.push(!original.length ? '原始步骤无专用溅射／散射类型，组装结果有；需结合原文及相邻伤害步骤核对' : '原始步骤有溅射／散射，组装结果缺少');
  } else if (original.length !== 1 || runtime.length !== 1) {
    state = 'complex-needs-review';
    findings.push(`原始 ${original.length} 段、组装 ${runtime.length} 段；需复核多段、重复抽签与顺序`);
  } else {
    const source = original[0], actual = runtime[0];
    const expectedRange = Object.hasOwn(ratios, source.Type) ? 'splash' : 'scatter';
    if (actual.range !== expectedRange && !(expectedRange === 'scatter' && actual.splitRandom)) findings.push(`范围应为 ${expectedRange}，实际 ${actual.range ?? '未指定'}`);
    if (expectedRange === 'splash' && actual.splashRatio !== ratios[source.Type]) findings.push(`邻位比率应为 ${ratios[source.Type]}，实际 ${actual.splashRatio ?? '未指定'}`);
    if (!!actual.trueDamage !== source.Type.startsWith('True')) findings.push('真实伤害标记不一致');
    const nativeTarget = source.Target ?? row.source.native?.Target;
    if (targetNames[nativeTarget] && actual.target !== targetNames[nativeTarget]) findings.push(`目标应为 ${targetNames[nativeTarget]}，实际 ${actual.target}`);
    if (nativeTarget === 'SecondLastEnemy' && (actual.target !== 'enemyLastN' || actual.n !== 2)) findings.push('倒数第二目标不一致');
    if (findings.length) state = 'source-runtime-conflict';
    if (!findings.length && !targetNames[nativeTarget] && nativeTarget !== 'SecondLastEnemy') {
      state = 'complex-needs-review';
      findings.push(`目标 ${nativeTarget ?? '未指定'} 未纳入单段目标自动对照`);
    }
  }
  checked.push({ key: row.key, spellId: row.spellId, state, findings,
    native: original.map(s => ({ type: s.Type, target: s.Target ?? row.source.native?.Target })),
    runtime: runtime.map(s => ({ range: s.range, target: s.target, n: s.n, splashRatio: s.splashRatio, trueDamage: !!s.trueDamage, randomWaves: s.randomWaves, splashChances: s.splashChances })) });
}
const counts = Object.fromEntries(['basic-shape-matched', 'complex-needs-review', 'source-shape-needs-review', 'source-runtime-conflict'].map(s => [s, checked.filter(c => c.state === s).length]));
const result = { schemaVersion: 1, ledgerFingerprint: ledger.fingerprint,
  ledgerHash: createHash('sha256').update(fs.readFileSync(file(ledgerPath))).digest('hex'),
  rule: '只比较原始步骤与账本记录的最终组装段的单段范围、溅射比率、穿透伤害和基础目标。多段与原文呈现差异留待人工复核；本报告不验证数值、施法实战或任何完整技能。',
  summary: { scopedEntities: checked.length, ...counts }, rows: checked };
const json = JSON.stringify(result, null, 2) + '\n';
const pending = checked.filter(c => c.state !== 'basic-shape-matched');
const md = [ '# 溅射／散射机制族：原始步骤与组装段核对', '',
  `来源：仓库保存的原始步骤快照及账本所记录的技能原型（已排除自设部队）；非实时重新编译工作树；账本指纹 \`${ledger.fingerprint}\`。这不是 GoW 实时版本核验。`, '',
  `涉及 ${checked.length} 项：单段基础形状相符 ${counts['basic-shape-matched']}；多段待复核 ${counts['complex-needs-review']}；来源步骤形态待解释 ${counts['source-shape-needs-review']}；直接冲突 ${counts['source-runtime-conflict']}。`, '',
  '基础形状仅核范围、邻位比率、真实伤害与简单目标，不涵盖数值、施法实战和整项签收。多段须对照原文逐段检查重复选敌、顺序、展开段数。', '',
  '| 类型 | 实体 | 技能 ID | 待核点 |', '|---|---|---:|---|',
  ...pending.map(r => `| ${r.state} | ${r.key} | ${r.spellId} | ${r.findings.join('；')} |`), '',
  `逐实体对照：\`${outputPath}\`。复跑：\`node scripts/check-gow-damage-family.mjs\`；检查是否过期：\`node scripts/check-gow-damage-family.mjs --check\`。`, '' ].join('\n');
if (process.argv.includes('--check')) {
  if (!fs.existsSync(file(outputPath)) || fs.readFileSync(file(outputPath), 'utf8') !== json || !fs.existsSync(file(docPath)) || fs.readFileSync(file(docPath), 'utf8') !== md) throw new Error('伤害族对照过期，请重建');
} else {
  fs.writeFileSync(file(outputPath), json);
  fs.writeFileSync(file(docPath), md);
}
console.log(`溅射／散射族：${checked.length} 项；基础形状相符 ${counts['basic-shape-matched']}，多段待复核 ${counts['complex-needs-review']}，步骤形态待解释 ${counts['source-shape-needs-review']}，直接冲突 ${counts['source-runtime-conflict']}`);
