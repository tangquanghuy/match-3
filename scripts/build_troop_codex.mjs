#!/usr/bin/env node
/**
 * 军队图鉴注册表生成器（窗口 G，用户裁定：一兵种一技能+三特质一一对应，可查询可自由组装）。
 *
 * 对官方全库 1827 兵种逐个生成图鉴条目：
 *   { 编码 id/referenceName/fileBase, 名称, 王国, 种族, 描述,
 *     立绘(本地路径+官方URL), 技能(spellId/名称/描述/是否已组装),
 *     特质[3]（code/名称/是否已实现）, 绑定状态 full|spellOnly|partial|none }
 * 产出：
 *   data/raw/gow-2026-09-18/troop-codex.json   —— 全量可查询注册表
 *   artifacts/recycle/troop-codex-report.md    —— 绑定统计与缺口清单
 * 数据源全部为生成态事实：curated 批文件（技能）、traits.json（特质）、portraits manifest（立绘）。
 */
import fs from 'node:fs';

const troopsZh = JSON.parse(fs.readFileSync('src/data/troops.json', 'utf8'));
const traitsImpl = new Map(JSON.parse(fs.readFileSync('src/data/traits.json', 'utf8')).map((t) => [t.code, t]));
const portraits = JSON.parse(fs.readFileSync('data/raw/gow-2026-09-18/portraits/manifest.json', 'utf8'));
const enTroops = JSON.parse(fs.readFileSync('data/raw/gow-2026-09-18/troops.en.json', 'utf8')).troops;
const enBySpell = new Map();
for (const t of enTroops) {
  if (t.SpellId) enBySpell.set(t.SpellId, { name: t.name_localized || t.Name, desc: t.stats?.spell?.desc || '' });
}

// 已组装技能 id（curated 批 + overrides）
const spellAssembled = new Set();
for (const f of fs.readdirSync('src/engine/skills/curated')) {
  if (!f.endsWith('.ts')) continue;
  const src = fs.readFileSync(`src/engine/skills/curated/${f}`, 'utf8');
  for (const m of src.matchAll(/\n    id: (\d+),/g)) spellAssembled.add(Number(m[1]));
}
const libSrc = fs.readFileSync('src/engine/skills/library.ts', 'utf8');
for (const m of libSrc.matchAll(/(?:^|\n)\s{2}(\d{4}): skill\(/g)) spellAssembled.add(Number(m[1]));

const codex = [];
const stats = { full: 0, spellOnly: 0, partial: 0, none: 0 };
const missingSpellTroops = [];
const traitGap = new Map();

for (const t of troopsZh) {
  const sid = t.spell?.id;
  const spellDone = sid ? spellAssembled.has(sid) : false;
  const fileBase = t.portrait || t.referenceName;
  const traitList = (t.traits || []).map((tc) => ({
    code: tc.code,
    name: tc.name,
    implemented: traitsImpl.has(tc.code),
  }));
  const traitsOk = traitList.length > 0 && traitList.every((x) => x.implemented);
  const binding = spellDone && traitsOk ? 'full' : spellDone ? 'spellOnly' : traitsOk ? 'partial' : 'none';
  stats[binding] += 1;
  if (!spellDone) missingSpellTroops.push(`${t.id} ${t.name}`);
  for (const x of traitList) {
    if (!x.implemented) traitGap.set(x.code + '|' + x.name, (traitGap.get(x.code + '|' + x.name) || 0) + 1);
  }
  const portraitFile = portraits[fileBase] ? `data/raw/gow-2026-09-18/portraits/${fileBase}.webp` : null;
  codex.push({
    id: t.id,
    code: t.referenceName,
    name: t.name,
    kingdom: t.kingdom,
    troopTypes: t.troopTypes,
    rarity: t.rarity,
    description: t.description,
    fileBase,
    portrait: { official: `https://gowhead.com/assets/troops/${fileBase}.webp`, local: portraitFile, downloaded: !!portraits[fileBase] },
    spell: { id: sid, name: t.spell?.name, desc: t.spell?.description, en: enBySpell.get(sid)?.desc || '', assembled: spellDone },
    traits: traitList,
    traitsImplemented: traitList.filter((x) => x.implemented).map((x) => x.code),
    binding,
  });
}

// 统计
const byBinding = { full: 0, spellOnly: 0, partial: 0, none: 0 };
for (const c of codex) byBinding[c.binding] += 1;
const traitGapList = [...traitGap.entries()].map(([k, n]) => ({ code: k.split('|')[0], name: k.split('|')[1], troops: n })).sort((a, b) => b.troops - a.troops);

fs.mkdirSync('data/raw/gow-2026-09-18', { recursive: true });
fs.writeFileSync('data/raw/gow-2026-09-18/troop-codex.json', JSON.stringify({ generatedAt: new Date().toISOString(), stats: byBinding, codex }, null, 1), 'utf8');

let md = `# 军队图鉴绑定审计（${new Date().toLocaleString('zh-CN')}）\n\n`;
md += `| 绑定状态 | 兵种数 |\n|---|---|\n`;
md += `| ✅ full（技能已组装+特质全实现） | ${byBinding.full} |\n| 技能就绪（spellOnly，缺特质） | ${byBinding.spellOnly} |\n| 特质就绪（partial，缺技能） | ${byBinding.partial} |\n| none | ${byBinding.none} |\n\n`;
md += `## 缺技能兵种（${missingSpellTroops.length}）\n\n`;
for (const x of missingSpellTroops) md += `- ${x}\n`;
md += `\n## 缺口特质 code（${traitGapList.length}）\n\n`;
for (const x of traitGapList) md += `- **${x.code}** ${x.name}：${x.troops} 兵种\n`;
fs.writeFileSync('artifacts/recycle/troop-codex-report.md', md, 'utf8');
console.log(JSON.stringify({ codex: codex.length, ...byBinding, 缺技能兵种: missingSpellTroops.length, 缺口特质code: traitGapList.length }));
console.log('→ data/raw/gow-2026-09-18/troop-codex.json + artifacts/recycle/troop-codex-report.md');
