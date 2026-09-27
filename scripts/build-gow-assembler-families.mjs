/** 按最终组装原型的机制族、原版步骤和部队种族建立复核索引；只安排复核，不代替逐项签收。 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const sha = file => createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
const ledgerPath = 'artifacts/gow-skill-audit/ledger.json';
const queuePath = 'artifacts/gow-skill-audit/acceptance-queue.json';
const troopPath = 'src/data/troops.json';
const outPath = 'artifacts/gow-skill-audit/assembler-families.json';
const docPath = 'docs/gow-skill-assembler-families.md';
const ledger = read(ledgerPath), queue = read(queuePath);
if (queue.fingerprint !== ledger.fingerprint || queue.rows.length !== 2518) throw new Error('验收队列与总账不一致，请先刷新验收队列');
const byKey = new Map(ledger.rows.map(row => [row.key, row]));
const byId = new Map(read(troopPath).map(t => [t.id, t]));
const families = new Map();
const index = [];
const flat = segments => (segments ?? []).flatMap(s => [s, ...(s.options ?? []).flatMap(flat)]);
const add = (tags, name) => tags.add(name);
const tagsFor = proto => {
  const tags = new Set();
  for (const s of flat(proto?.segments)) {
    switch (s.kind) {
      case 'damage': {
        const mode = s.range === 'splash' ? '溅射' : s.range === 'scatter' || s.splitRandom ? '随机散射' : s.split ? '均分' : s.range === 'all' ? '全体' : '单体／逐目标';
        add(tags, `伤害／${mode}`);
        if (s.trueDamage) add(tags, '伤害／真实伤害');
        if (s.manaBurn) add(tags, '伤害／法力燃烧');
        if (s.drain) add(tags, '伤害／生命汲取');
        if (s.execute) add(tags, '伤害／即杀');
        break;
      }
      case 'gem': add(tags, `棋盘／${s.params?.op === 'clear' ? (s.params.mode === 'explode' ? '爆破' : '摧毁') : s.params?.op === 'create' ? '创造' : s.params?.op === 'transform' ? '转换' : s.params?.op ?? '未知'}`); break;
      case 'status': case 'randomStatus': add(tags, '状态／施加'); break;
      case 'cleanse': case 'dispel': add(tags, '状态／净化驱散'); break;
      case 'buff': case 'randomStat': add(tags, s.stat === 'mana' ? '法力／给予' : '属性／增益或治疗'); break;
      case 'reduce': add(tags, s.stat === 'mana' ? '法力／减除或窃取' : '属性／削弱'); break;
      case 'summon': case 'summonCopy': add(tags, '身份／召唤与复制'); break;
      case 'transformTroop': case 'devour': case 'sacrifice': case 'selfRevive': add(tags, '身份／变形吞噬牺牲复活'); break;
      case 'extraTurn': add(tags, '回合／额外回合'); break;
      case 'storm': case 'removeStorm': case 'shuffleBoard': add(tags, '棋盘／风暴重排'); break;
      case 'reposition': case 'swapPositions': case 'shuffleTeam': add(tags, '站位／调位'); break;
      case 'gainEconomy': case 'stealGold': case 'spendEconomy': add(tags, '资源／金币灵魂等'); break;
      case 'oneOf': case 'choose': add(tags, '分支／随机或选择'); break;
      default: add(tags, `其他／${s.kind}`);
    }
    if (s.ifCond || s.condMult || s.condBonus || s.chance || s.chanceBoost || s.ifTargetDied || s.raceDouble || s.modifier || s.modifiers?.length || s.params?.modifier) add(tags, '复合／概率条件与增强');
    if (s.ifTargetDied) add(tags, '复合／击杀后效果');
  }
  if (proto?.oncePerBattle) add(tags, '回合／每战一次');
  if (!tags.size) add(tags, '未装配有效效果');
  return [...tags].sort();
};
for (const q of queue.rows) {
  const row = byKey.get(q.key);
  if (!row || q.spellId !== row.spellId) throw new Error(`绑定错位: ${q.key}`);
  const tags = tagsFor(row.runtime?.prototype);
  const native = (row.source.native?.SpellSteps ?? []).filter(s => s.Type !== 'None').map(s => s.Type);
  const types = q.kind === 'troop' ? byId.get(q.entityId)?.troopTypes ?? [] : [];
  const item = { key: q.key, name: q.name, spellId: q.spellId, kind: q.kind, tags, troopTypes: types, nativeSteps: native, state: q.state };
  index.push(item);
  for (const tag of tags) {
    const list = families.get(tag) ?? []; list.push(item); families.set(tag, list);
  }
}
if (index.length !== 2518 || new Set(index.map(i => i.key)).size !== index.length) throw new Error('不完整或重复的实体');
const groups = [...families.entries()].map(([name, members]) => {
  const originalSteps = new Map(), tribes = new Map();
  for (const m of members) {
    const signature = m.nativeSteps.join(' → ') || '—';
    originalSteps.set(signature, (originalSteps.get(signature) ?? 0) + 1);
    for (const tribe of m.troopTypes) tribes.set(tribe, (tribes.get(tribe) ?? 0) + 1);
  }
  const rank = m => [...m.entries()].sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0]));
  return { name, count: members.length, accepted: members.filter(m => m.state === 'accepted').length,
    troops: members.filter(m => m.kind === 'troop').length, weapons: members.filter(m => m.kind === 'weapon').length,
    originalStepShapes: rank(originalSteps).map(([shape,count]) => ({shape,count})),
    troopTypes: rank(tribes).map(([type,count]) => ({type,count})),
    keys: members.map(m => m.key), examples: members.slice(0,3).map(({key,name}) => ({key,name})) };
}).sort((a,b) => b.count-a.count || a.name.localeCompare(b.name));
const output = { schemaVersion: 1, fingerprint: ledger.fingerprint,
  inputHashes: Object.fromEntries([ledgerPath,queuePath,troopPath].map(p => [p,sha(p)])),
  rule: '按最终组装原型建立多标签机制族索引，交叉列原版步骤类型与部队种族。组别仅用于安排共享规则和批次；每名部队、每把武器的原文、数值、目标、分支、实战和来源仍须逐项独立验收。',
  summary: { scope: index.length, accepted: queue.completion.accepted, families: groups.length, unassembled: index.filter(m => m.tags.includes('未装配有效效果')).length },
  families: groups, rows: index };
const json = JSON.stringify(output,null,2)+'\n';
const md = [`# 技能组装器 × 原版步骤 × 族系：分项验收索引`, '',
  '按最终注册的技能组装原型归类，交叉展示原版步骤和部队种族；**同一技能可进入多个机制族，不可把各组人数相加**。此表不自动签收任何实体；族系只是定位入口，优先按机制族核实公共原语，再逐实体核对原文、参数、费用、颜色、12 维度与真实施法。', '',
  `总范围 ${index.length}（部队 1800、武器 718），同指纹整项验收 ${queue.completion.accepted}；按组装结果分 ${groups.length} 个机制族；无有效装配 ${output.summary.unassembled}。`, '',
  '| 机制族 | 涉及实体（部队／武器） | 已签收 | 主要原版步骤形状 | 主要部队种族 |', '|---|---:|---:|---|---|',
  ...groups.map(g => `| ${g.name} | ${g.count}（${g.troops}／${g.weapons}） | ${g.accepted} | ${g.originalStepShapes.slice(0,2).map(x => `${x.shape} ×${x.count}`).join('；')} | ${g.troopTypes.slice(0,3).map(x => `${x.type} ×${x.count}`).join('；') || '—'} |`), '',
  '完整逐实体索引：`artifacts/gow-skill-audit/assembler-families.json`（每项含族类、原始步骤、有序 ID 与当前签收状态）。原版同构批次：`artifacts/gow-skill-audit/review-cohorts.json`。',
  '生成与校验：`node scripts/build-gow-assembler-families.mjs` / `node scripts/build-gow-assembler-families.mjs --check`。',
  '注意：组装器只能保证段的类型和编译执行；它不能证明该段选对目标、公式、参数、先后顺序或完整表达了原版效果。共享原语测试通过后，签收仍以 `data/audit/gow-skill-reviews.json` 的逐实体证据为准。', '' ].join('\n');
if (process.argv.includes('--check')) {
  if (!fs.existsSync(path.join(root,outPath)) || fs.readFileSync(path.join(root,outPath),'utf8') !== json || !fs.existsSync(path.join(root,docPath)) || fs.readFileSync(path.join(root,docPath),'utf8') !== md) throw new Error('机制族索引过期，请重建');
  console.log(`机制族索引有效: ${groups.length} 族 / ${index.length} 实体 / 已签收 ${queue.completion.accepted}`);
} else {
  fs.writeFileSync(path.join(root,outPath),json); fs.writeFileSync(path.join(root,docPath),md);
  console.log(`机制族索引已写入: ${groups.length} 族 / ${index.length} 实体 / 已签收 ${queue.completion.accepted}`);
}
