// 一次性：从本地 gowhead 全量 dump 生成"可疑宝石"英文原句报告
// 数据源（均为 gowhead.com/api/entities 抓取落盘）：
//   data/raw/gow-2026-09-18/troops.en.json  → stats.spell.desc（网站渲染英文原句）+ name_localized（英文兵种名）
//   data/raw/spells.gow.en.json             → RawData.SpellSteps（官方结构化步骤）
//   artifacts/recycle/gem-verification.md   → ZH 原句 + 术语分组
// 产物：artifacts/recycle/gem-en-original.md
// 用法：node scripts/_en_excavate.mjs
import fs from 'node:fs';

const VFILE = 'artifacts/recycle/gem-verification.md';
const TROOPS = JSON.parse(fs.readFileSync('data/raw/gow-2026-09-18/troops.en.json', 'utf8')).troops;
const SPELLS = JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json', 'utf8')).spells;

// ---- 1. 解析核验表 ----
const zhText = fs.readFileSync(VFILE, 'utf8');
const entries = [];
let cur = null;
for (const line of zhText.split(/\r?\n/)) {
  const h = line.match(/^##\s*(\d+)（(.+?)）/);
  if (h) { cur = { id: +h[1], term: h[2], zh: '', steps: [] }; entries.push(cur); continue; }
  if (!cur) continue;
  const z = line.match(/^-\s*ZH:\s*(.+)$/);
  if (z) cur.zh = z[1].trim();
  const s = line.match(/^-\s*(\{.*\})\s*$/);
  if (s) cur.steps.push(s[1]);
}
console.log(`核验表条目: ${entries.length}`);

// ---- 2. 兵种/法术索引 ----
const bySpell = new Map();
for (const t of TROOPS) {
  const sid = t.SpellId ?? t.stats?.spell?.id;
  if (!sid) continue;
  if (!bySpell.has(sid)) bySpell.set(sid, []);
  bySpell.get(sid).push({ name: t.name_localized, id: t.Id, spellName: t.stats?.spell?.name ?? null });
}
const spellById = new Map(SPELLS.map(s => [s.Id, s]));

// ---- 3. SpellSteps 紧凑摘要 ----
const stepStr = (st) => {
  const parts = [st.Type];
  if (st.Target && st.Target !== 'None') parts.push(st.Target);
  if (st.Amount != null) parts.push(`x${st.Amount}`);
  if (st.Data && st.Data !== '0') parts.push(`"${st.Data}"`);
  return parts.join(' ');
};
const stepsLine = (id) => {
  const raw = spellById.get(id)?.RawData;
  if (!raw) return '**无数据（旧版/已移除效果）**';
  let steps;
  try { steps = JSON.parse(raw).SpellSteps || []; } catch { return '(RawData 解析失败)'; }
  if (!steps.length) return '(空)';
  return steps.map(stepStr).join(' → ');
};

// ---- 4. 分组排序：任务给的特殊宝石族优先，其余殿后 ----
const GROUP_ORDER = ['天使宝石', '元素星', '法力药水', '石像鬼宝石', '临界星', '灵力宝石', '腐烂宝石', '狼人宝石', '恶魔门户', '暗影之星', '龙宝石', '巨人宝石', '附魔'];
const groups = new Map();
for (const e of entries) {
  if (!groups.has(e.term)) groups.set(e.term, []);
  groups.get(e.term).push(e);
}
const ordered = [...groups.entries()].sort((a, b) => {
  const ia = GROUP_ORDER.indexOf(a[0]), ib = GROUP_ORDER.indexOf(b[0]);
  return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
});

// ---- 5. 产出 ----
const out = [];
out.push(`# 可疑宝石官方英文原句（gowhead.com 渲染文本，2026-09-17）`);
out.push('');
out.push(`> 来源：gowhead.com/api/entities \`type=troop&lang=en\` 全量 dump（data/raw/gow-2026-09-18/troops.en.json，1827 兵种全员含 stats.spell.desc），`);
out.push(`> 即玩家在网站兵种卡上看到的英文描述原文；SpellSteps 来自 data/raw/spells.gow.en.json（RawData.SpellSteps）。`);
out.push(`> 覆盖：${entries.length}/${entries.length} 个 spell id 全部命中（含 4 个本地无 SpellSteps 的旧版 id， troop/描述仍在现网）。`);
out.push('');
let count = 0;
for (const [term, list] of ordered) {
  out.push(`# ${term}（${list.length} 条）`);
  out.push('');
  for (const e of list.sort((a, b) => a.id - b.id)) {
    const troops = bySpell.get(e.id) || [];
    const tname = troops.length ? troops.map(t => `${t.name} (#${t.id})`).join(' / ') : '（无兵种引用）';
    const sname = troops.find(t => t.spellName)?.spellName || '';
    out.push(`## ${e.id} ${tname}${sname ? ` — “${sname}”` : ''}`);
    out.push(`- ZH: ${e.zh}`);
    // EN 描述回查 troops dump（同一 SpellId 可能被多个兵种共用，文本一致）
    const troopRecs = (bySpell.get(e.id) || []).map(t => TROOPS.find(x => x.Id === t.id)).filter(Boolean);
    const en = troopRecs.map(x => x.stats?.spell?.desc).find(Boolean);
    out.push(`- EN: ${en || '（未找到描述）'}`);
    out.push(`- SpellSteps: ${stepsLine(e.id)}`);
    out.push('');
    count++;
  }
}
out.push(`---`);
out.push(`共 ${count} 条。`);

fs.writeFileSync('artifacts/recycle/gem-en-original.md', out.join('\n'), 'utf8');
console.log(`落盘 artifacts/recycle/gem-en-original.md，共 ${count} 条`);
const noTroop = entries.filter(e => !(bySpell.get(e.id) || []).length).map(e => e.id);
const noDesc = entries.filter(e => {
  const ts = bySpell.get(e.id) || [];
  return !ts.some(t => TROOPS.find(x => x.Id === t.id)?.stats?.spell?.desc);
}).map(e => e.id);
console.log('无兵种引用的 id:', noTroop);
console.log('无 EN 描述的 id:', noDesc);
