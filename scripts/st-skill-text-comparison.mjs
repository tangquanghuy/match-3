// 生成酒馆敌人技能／特质的「原版文本 ↔ 酒馆适配后文本」对照表。
// 用法：node scripts/st-skill-text-comparison.mjs
// 输出：docs/sillytavern-skill-text-comparison.md（按技能 ID）与 data/audits/st-skill-text-comparison.csv（可在表格软件里筛选）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mdPath = path.join(root, 'docs/sillytavern-skill-text-comparison.md');
const csvPath = path.join(root, 'data/audits/st-skill-text-comparison.csv');
const traitCsvPath = path.join(root, 'data/audits/st-trait-text-comparison.csv');

const bundle = await build({ stdin: { contents: `
import {TROOPS,SOURCE_TROOPS} from './src/data/troops';
import {adaptedAbilityDescription,adaptedTraitDescription} from './src/sillytavern/enemyBlueprint';
import {abilityDisplayName} from './src/sillytavern/abilityName';
import {abilityDisplayText} from './src/sillytavern/abilityDisplay';
import {PORTRAITS} from './src/sillytavern/portraits';
const EXAMPLE_MAGIC=10;const skills=new Map();const traits=new Map();
for(const t of TROOPS){
 const source=SOURCE_TROOPS.find(s=>s.id===t.id)??t;
 const rank=PORTRAITS.find(p=>p.troopId===t.id)?.rank??'未映射';
 let row=skills.get(t.spell.id);
 if(!row){
  let adapted;try{adapted=adaptedAbilityDescription(t.spell.id);}catch(e){adapted={name:'',description:'',support:'unsupported',diagnostics:[{message:e instanceof Error?e.message:String(e)}]};}
  row={id:t.spell.id,sourceName:source.spell.name,sourceDescription:source.spell.description,adaptedName:adapted.name?abilityDisplayName(adapted.name):'',adaptedDescription:adapted.description,display:adapted.description?abilityDisplayText(adapted.description,EXAMPLE_MAGIC):'',support:adapted.support,diagnostics:(adapted.diagnostics??[]).map(d=>d.message??d.path??JSON.stringify(d)),manaCost:t.manaCost,troops:[],ranks:new Set()};
  skills.set(t.spell.id,row);
 }
 row.troops.push(t.name);row.ranks.add(rank);
 for(const tr of t.traits){
  if(traits.has(tr.code)){traits.get(tr.code).troops++;continue;}
  const src=source.traits.find(x=>x.code===tr.code)??tr;
  let adapted;try{adapted=adaptedTraitDescription(tr.code);}catch(e){adapted=undefined;}
  traits.set(tr.code,{code:tr.code,sourceName:src.name,sourceDescription:src.description,adaptedDescription:adapted?.description??'',support:adapted?.support??'unsupported',troops:1});
 }
}
export default {skills:[...skills.values()].map(r=>({...r,ranks:[...r.ranks]})).sort((a,b)=>a.id-b.id),traits:[...traits.values()].sort((a,b)=>a.code.localeCompare(b.code))};
`, resolveDir: root, loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', write: false,
  loader: { '.png': 'empty', '.webp': 'empty', '.wav': 'empty', '.mp3': 'empty', '.css': 'empty' },
  define: { 'import.meta.env.BASE_URL': '"/"', 'import.meta.env.DEV': 'false' } });
const { default: data } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

const SUPPORT = { full: '完整', partial: '部分', unsupported: '未识别', empty: '无效果' };
const cell = v => String(v ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
const csv = v => `"${String(v ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;

const count = (list, key) => list.reduce((m, r) => (m[r[key]] = (m[r[key]] ?? 0) + 1, m), {});
const skillSupport = count(data.skills, 'support');
const traitSupport = count(data.traits, 'support');

const md = [
  '# 敌人技能：原版与酒馆适配文本对照',
  '',
  `由 \`node scripts/st-skill-text-comparison.mjs\` 生成，请勿手改；技能或适配规则变动后重新运行。共 ${data.skills.length} 个不同主动技能（来自 ${data.skills.reduce((n, r) => n + r.troops.length, 0)} 个原版单位），${data.traits.length} 个特质。`,
  '',
  '## 怎么读',
  '',
  '- **原版名称／原版说明**：三消原游戏里这个技能的中文名和说明（`src/data/troops` 的来源数据）。',
  '- **酒馆名称**：程序按效果段拼出的名称（前两段效果名用“·”连接，超过两段加“等”），不使用原版名，避免把原游戏世界观带进剧情。末尾的机制指纹已去掉。',
  '- **游戏内显示（魔力 10 示例）**：玩家在卡面上实际看到的文字，这里按施放者魔力 10 代入；实际战斗按敌人自己的魔力计算。依赖棋盘或状态的部分（如“具有「燃烧」的敌人数”）保留为公式。',
  '- **酒馆说明（模板）**：程序按实际执行的效果逐段生成的原始模板，“魔力”指施放者当前魔力，`max(0,round(x))` 表示四舍五入且不低于 0。',
  '- **识别**：完整＝所有效果段都有中文说明；部分／未识别＝有效果段没能翻译，说明里会缺内容，需要排查。',
  '- 技能效果本身（数值、目标、条件）沿用原版执行，两列文字不同不代表效果被改。个别技能因引擎适配有差异，见各审查文档。',
  '- 掉落倾向＝原版“风暴”：持续数回合，使补充宝石偏向某种颜色或骷髅。',
  '',
  `识别统计：技能 ${Object.entries(skillSupport).map(([k, v]) => `${SUPPORT[k] ?? k} ${v}`).join('、')}；特质 ${Object.entries(traitSupport).map(([k, v]) => `${SUPPORT[k] ?? k} ${v}`).join('、')}。`,
  '',
  `特质对照见 \`data/audits/st-trait-text-comparison.csv\`；技能 CSV 版本见 \`data/audits/st-skill-text-comparison.csv\`（含单位名，可在表格软件中筛选）。`,
  '',
  '## 主动技能',
  '',
  '| 技能 ID | 原版名称 | 原版说明 | 酒馆名称 | 游戏内显示（魔力 10 示例） | 酒馆说明（模板） | 法力 | 档位 | 识别 | 使用单位数 |',
  '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ...data.skills.map(r => `| ${r.id} | ${cell(r.sourceName)} | ${cell(r.sourceDescription)} | ${cell(r.adaptedName)} | ${cell(r.display)} | ${cell(r.adaptedDescription)} | ${r.manaCost} | ${cell(r.ranks.join('/'))} | ${SUPPORT[r.support] ?? r.support} | ${r.troops.length} |`),
  '',
];
fs.writeFileSync(mdPath, md.join('\n'), 'utf8');

fs.mkdirSync(path.dirname(csvPath), { recursive: true });
const bom = '\uFEFF';
fs.writeFileSync(csvPath, bom + [
  ['技能ID', '原版名称', '原版说明', '酒馆名称', '游戏内显示（魔力10示例）', '酒馆说明（模板）', '法力', '档位', '识别', '诊断', '使用单位'].map(csv).join(','),
  ...data.skills.map(r => [r.id, r.sourceName, r.sourceDescription, r.adaptedName, r.display, r.adaptedDescription, r.manaCost, r.ranks.join('/'), SUPPORT[r.support] ?? r.support, r.diagnostics.join('；'), r.troops.join('、')].map(csv).join(',')),
].join('\r\n'), 'utf8');
fs.writeFileSync(traitCsvPath, bom + [
  ['特质代码', '原版名称', '原版说明', '酒馆说明', '识别', '使用单位数'].map(csv).join(','),
  ...data.traits.map(r => [r.code, r.sourceName, r.sourceDescription, r.adaptedDescription, SUPPORT[r.support] ?? r.support, r.troops].map(csv).join(',')),
].join('\r\n'), 'utf8');
console.log(`skills ${data.skills.length}, traits ${data.traits.length}`, skillSupport, traitSupport);
