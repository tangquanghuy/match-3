#!/usr/bin/env node
/**
 * 兵种完整度审计（用户裁定：一个兵种 = 一个技能 + 三套特质，缺一即弃兵）。
 * 输出：全 1798 兵种的技能/特质覆盖矩阵 + 缺口聚合（技能 id 缺口、特质 code 缺口）。
 */
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const troops = JSON.parse(fs.readFileSync('src/data/troops.json', 'utf8'));
const traits = JSON.parse(fs.readFileSync('src/data/traits.json', 'utf8'));
const implTraits = new Set(traits.map((t) => t.code));

// 已组装技能 id（从 curated 批文件提取）
const spellAssembled = new Set();
for (const f of fs.readdirSync('src/engine/skills/curated')) {
  if (!f.endsWith('.ts')) continue;
  const src = fs.readFileSync(`src/engine/skills/curated/${f}`, 'utf8');
  for (const m of src.matchAll(/\n    id: (\d+),/g)) spellAssembled.add(Number(m[1]));
}
// overrides
const libSrc = fs.readFileSync('src/engine/skills/library.ts', 'utf8');
for (const m of libSrc.matchAll(/(?:^|\n)\s{2}(\d{4}): skill\(/g)) spellAssembled.add(Number(m[1]));

const noSpell = [];
const spellOk = [];
const traitMissing = new Map(); // code → 次数
let full = 0;
for (const t of troops) {
  const sid = t.spell?.id;
  const spellDone = sid && spellAssembled.has(sid);
  if (spellDone) spellOk.push(t);
  else noSpell.push({ id: t.id, name: t.name, sid, ref: t.referenceName });
  for (const tc of t.traits || []) {
    if (!implTraits.has(tc.code)) {
      traitMissing.set(tc.code, (traitMissing.get(tc.code) || 0) + 1);
    }
  }
  if (spellDone && (t.traits || []).every((tc) => implTraits.has(tc.code))) full += 1;
}

const missTraits = [...traitMissing.entries()].sort((a, b) => b[1] - a[1]);
const report = {
  troops: troops.length,
  完整兵种: full,
  缺技能: noSpell.length,
  缺特质: troops.length - full - noSpell.length,
  缺口特质code数: missTraits.length,
};
console.log(JSON.stringify(report, null, 1));
console.log('缺口特质 code（按出场排序 top 40）:');
for (const [code, n] of missTraits.slice(0, 40)) console.log(`  ${code}: ${n} 兵种`);

let md = `# 兵种完整度审计（${new Date().toLocaleString('zh-CN')}）\n\n`;
md += `- 兵种总数 ${troops.length}；完整（技能+全特质齐）**${full}**\n`;
md += `- 缺技能兵种 **${noSpell.length}**（对应未组装 spell ${new Set(noSpell.map((x) => x.sid)).size} 个）\n`;
md += `- 缺特质 code **${missTraits.length}** 个\n\n`;
md += `## 缺技能兵种清单\n\n`;
for (const x of noSpell) md += `- ${x.id} ${x.name}（spell ${x.sid}，${x.ref}）\n`;
md += `\n## 缺口特质 code（按出场排序）\n\n`;
for (const [code, n] of missTraits) md += `- ${code}：${n} 兵种\n`;
fs.writeFileSync('artifacts/recycle/troop-completeness.md', md);
fs.writeFileSync('artifacts/recycle/troop-completeness.json', JSON.stringify({ noSpell, missTraits }, null, 1));
console.log('→ artifacts/recycle/troop-completeness.md');
