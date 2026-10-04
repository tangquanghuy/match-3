/** Render readable, Chinese-priority troop audit without raw native-step dumps. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'artifacts/gowhead-troop-audit/approval-921');
const review = JSON.parse(fs.readFileSync(path.join(dir, 'approved.json'), 'utf8'));
const troops = new Map(JSON.parse(fs.readFileSync(path.join(root, 'src/data/troops.json'), 'utf8')).map(t => [t.id, t]));
const name = x => troops.get(x.id)?.name ?? x.referenceName;
const field = (value) => {
  if (value === 'spell.description') return '技能说明';
  if (value === 'spell.name') return '技能名称';
  if (value === 'name') return '部队名称';
  const m = /^traits\.(\d+)\.(name|description)$/.exec(value);
  return m ? `第 ${Number(m[1]) + 1} 项特质${m[2] === 'name' ? '名称' : '说明'}` : value;
};
const title = x => `${name(x)}（${x.id}）·${field(x.field)}`;
const brief = x => (x.reason.split(/[。；;]/u).find(v => v.trim()) ?? x.reason).trim().replace(/\bGowhead\b/gu, 'gowhead');
const suggestion = x => {
  if (x.local.includes('狐人') && x.gowheadZh.includes('狼族')) return '将“狐人”核对为“狼族”，战斗中的兵种判定未变。';
  if (x.local.includes('海族')) return '统一 Merfolk 族群的中文名称，战斗对象未变。';
  if (x.local.includes('巨人宝石')) return '校对宝石名称“巨型宝石”，避免误读成巨人兵种。';
  if (x.field === 'name' || x.field === 'spell.name' || x.field.endsWith('.name')) return '只需核对并统一显示名称。';
  return brief(x);
};
const c = review.counts;
const summary = [
  '# 部队中文差异：复核结论', '',
  '> 中文是优先核对的来源，但明显的漏译、错译、对象串行不能直接当作改战斗代码的依据。来源之间冲突时，先单列疑点，再查玩法证据；蜜蜂女王是用户指定的中文口径特例。', '',
  `已按 ID 和字段核对 **${review.reviewed}/921 条**；比对项目当前数据与技能实现，未用旧中英快照。`, '',
  '| 结论 | 条数 | 怎么处理 |', '|---|---:|---|',
  `| 本轮已修复的功能差异 | **${c.functional_fix}** | 见下方具体处理 |`,
  `| 中文来源疑似漏译、误译或与现行实装冲突 | **${c.source_zh_suspect}** | 暂不按来源中文重写战斗，逐项核实 |`,
  `| 项目自身中文显示需要修 | ${c.translation_fix} | 核对并修中文名称或说明 |`,
  `| 语义相同／种族统一译名 | ${c.equivalent} | 不因这个差异改功能 |`,
  `| 中文含糊、数据不足 | ${c.uncertain} | 保留疑点 |`,
  '', '## 你指出的两处，我复核后的结论', '',
  '- **萨梯音乐家（6253）：两份中文都写“随机两名”，这一点确实没有差异。** 战斗代码实际选前两名，英文也写前两名；“随机”可能是共同误译，先核对来源文案，不列战斗功能问题。',
  '- **暗影之刃（6307）：来源中文“没有一颗紫色宝石”明显可疑。** 其后又带 `[x6]`；英文、项目中文与当前回蓝代码均为每颗紫色宝石增加 6% 几率。不应反过来修改已实装的概率机制。',
  '- **同类例子：** 符文王牌（7229）和正义塔罗（7526）的“没有蓝色宝石”和 `[x7]` 也互相冲突，已移出功能修复清单。', '',
  '## 本轮修复的功能差异', '',
  '- **食松露大王（6759）：** 已调整为先伤害、后造宝石；用施法开始时快照保留中毒／疾病人数，受伤阵亡者仍计入造石。人数加成对象仍保持英文和原生步骤的造石口径。',
  '- **蜜蜂女王（6863）：** 按用户明确给出的公式，额外回合基础 40%，造石后的板面每颗棕色宝石再加 1 个百分点；返还半数法力仍为独立 40%。代码及中文说明均已更新。', '',
  '## 功能差异处理记录', '',
  ...review.findings.functional_fix.map(x => `- **${title(x)}**：${x.reason.trim().replace(/[。；;\s]+$/u, '')}。`), '',
  `## 来源中文待核对（${c.source_zh_suspect} 项）`, '',
  '这些条目此前被当作战斗问题；复核后暂不依据存疑的中文单独改战斗。请在 [`逐项对照.md`](./逐项对照.md) 中按部队名看每项的具体原因、项目中文及来源中文。', '',
  '## 阅读与范围', '',
  '- `逐项对照.md`：功能问题、来源中文待核、项目中文显示差异、待确认事项逐项列明。',
  '- `approved.csv`：全部 921 条可筛选；`approved.json`：机器读取与证据路径。',
  '- 本轮已修复上述两项战斗功能并更新蜜蜂女王中文；审核时的原文仍作为快照保留。Wargare 种族在项目统一显示为“狐人”，对照源中文“狼族”的 40 条不再列入待修文案。',
];fs.writeFileSync(path.join(dir, 'approved.md'), summary.join('\n') + '\n');
const details = ['# 部队中文差异：逐项对照', '', '**优先核对来源中文，但明显错译、截断和机制冲突须单列，不直接按错译修改战斗。** 证据路径见 `approved.json`。', ''];
const satyr = review.findings.equivalent.find(x => x.id === 6253 && x.field === 'spell.description');
if (!satyr) throw Error('Satyr Musician reviewed entry missing');
details.push('## 特别复核：两份中文已经一致', '', `### ${title(satyr)}`, '', `- **审核时项目显示：** ${satyr.local}`, `- **gowhead 中文：** ${satyr.gowheadZh}`, `- **结论：** ${satyr.reason}`, '');
for (const [key, heading] of [
  ['functional_fix', '已修复的战斗功能差异'],
  ['source_zh_suspect', '来源中文疑似有误，暂不改战斗'],
  ['translation_fix', '中文显示需要修，战斗功能正确'],
  ['uncertain', '中文要求尚待核实'],
  ['source_conflict', '尚待按中文裁决'],
]) {
  if (!c[key]) continue;
  details.push(`## ${heading}（${c[key]} 项）`, '');
  for (const x of review.findings[key]) {
    details.push(`### ${title(x)}`, '', `- **审核时项目显示：** ${x.local}`, `- **gowhead 中文：** ${x.gowheadZh}`);
    if (x.id === 6863) details.push('- **结论：** 已按用户给定 1:1 公式实装：造石后每颗棕宝石增加额外回合几率 1 个百分点，返还半数法力维持独立 40%。');
    else if (x.id === 6759) details.push('- **结论：** 已修复为先伤害再造石；造石使用施法开始时的中毒／疾病人数，确保伤害击杀仍计入。人数加成对象沿用英文／原生步骤的造石口径。');
    else if (key === 'source_zh_suspect') details.push(`- **复核：** ${x.reason}`);
    else if (key === 'translation_fix') details.push(`- **处理：** ${suggestion(x)}`);
    else if (key === 'uncertain') details.push(`- **待确认：** ${brief(x)}。`);
    else details.push(`- **问题：** ${brief(x)}。`);
    details.push('');
  }
}
fs.writeFileSync(path.join(dir, '逐项对照.md'), details.join('\n') + '\n');
