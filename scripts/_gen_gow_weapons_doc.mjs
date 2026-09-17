// 生成 design/GOW-WEAPONS.md 的 §4 目录表与统计表（替换标记 <!--TABLE:CATALOG--> / <!--TABLE:STATS-->）
// 用法：node scripts/_gen_gow_weapons_doc.mjs
import fs from 'node:fs';

const json = JSON.parse(fs.readFileSync('artifacts/gow-weapons.json', 'utf8'));
const W = json.weapons;
const doc = 'design/GOW-WEAPONS.md';

const CN = { Red: '红', Blue: '蓝', Green: '绿', Yellow: '黄', Purple: '紫', Brown: '棕' };
const MASTERY_CN = { Fire: '火', Water: '水', Earth: '地', Nature: '自然', Air: '空气', Magic: '魔法' };
const colorTxt = (w) => w.colors.length === 6 ? '**全六色**' : w.colors.map(c => CN[c] || c).join('/');

function parseUnlock(u) {
  if (!u) return { type: 'unknown' };
  if (/Special Events/i.test(u)) return { type: 'event' };
  const m = u.match(/^(.*?)\s+Mastery\s+(\d+)/i);
  if (!m) return { type: 'unknown', raw: u };
  const colors = m[1].split(/\s+/).filter(Boolean);
  if (colors.length === 1 && /^all$/i.test(colors[0])) return { type: 'all', level: +m[2] };
  return { type: 'mastery', colors, level: +m[2] };
}

const groups = { mastery: [], dual: [], all: [], event: [], unknown: [] };
for (const w of W) {
  const p = parseUnlock(w.unlock);
  w._p = p;
  if (p.type === 'mastery') (p.colors.length > 1 ? groups.dual : groups.mastery).push(w);
  else groups[p.type]?.push(w);
}
const sortName = (a, b) => a.name.localeCompare(b.name);
groups.mastery.sort((a, b) => (a._p.colors[0] + a._p.level).localeCompare(b._p.colors[0] + b._p.level) || a.manaCost - b.manaCost || sortName(a, b));
groups.dual.sort((a, b) => a._p.level - b._p.level || sortName(a, b));
groups.all.sort((a, b) => a._p.level - b._p.level || sortName(a, b));
groups.event.sort(sortName);

const esc = (s) => String(s).replace(/\|/g, '\\|');
const row = (w) => `| ${esc(w.name)} | ${w.rarity || '?'} | ${w.manaCost ?? '?'} | ${colorTxt(w)} | ${esc(w.spell || '')} |`;
const head = '| 名称 | 稀有度 | 费用 | 颜色 | 法术 |\n|---|---|---|---|---|';

let catalog = '';
const G = [
  ['单精通解锁（成长线，按精通色与等级排序）', groups.mastery],
  ['双精通解锁（进阶顶端，按等级排序）', groups.dual],
  ['全精通解锁（ALL Mastery）', groups.all],
  ['特殊活动 / 武器包', groups.event],
];
for (const [title, arr] of G) {
  if (!arr.length) continue;
  catalog += `\n**${title}（${arr.length} 把）**\n\n${head}\n${arr.map(row).join('\n')}\n`;
}
if (groups.unknown.length) catalog += `\n**未识别解锁条件（${groups.unknown.length} 把）**\n\n${head}\n${groups.unknown.map(row).join('\n')}\n`;

// ---- 统计 ----
const by = (fn) => { const m = {}; for (const w of W) { const k = fn(w); (m[k] ||= []).push(w); } return m; };
const pct = (n) => `${n}（${Math.round(n / W.length * 100)}%）`;
const cost = (arr) => { const c = arr.map(w => w.manaCost).sort((a, b) => a - b); return `${(c.reduce((s, x) => s + x, 0) / c.length).toFixed(1)}（${c[0]}~${c[c.length - 1]}）`; };

let stats = '| 维度 | 分布 |\n|---|---|\n';
const rarity = by(w => w.rarity);
stats += `| 稀有度（数量/费用均值(区间)） | ${Object.entries(rarity).map(([k, v]) => `${k}：${pct(v.length)}，${cost(v)}`).join('；')} |\n`;
const cc = { 1: 0, 2: 0, 6: 0 };
for (const w of W) cc[w.colors.length] = (cc[w.colors.length] || 0) + 1;
stats += `| 颜色组合 | 单色 ${pct(cc[1] || 0)}；双色 ${pct(cc[2] || 0)}；全六色 ${pct(cc[6] || 0)} |\n`;
const perColor = by(w => w.colors[0]);
stats += `| 主色分布 | ${Object.entries(perColor).sort().map(([k, v]) => `${CN[k] || k} ${v.length}`).join('；')} |\n`;
stats += `| 解锁渠道 | 单精通 ${groups.mastery.length}；双精通 ${groups.dual.length}；全精通 ${groups.all.length}；活动/武器包 ${groups.event.length} |\n`;
stats += `| 费用 | 全体 ${cost(W)}；最低 ${Math.min(...W.map(w => w.manaCost))}（低费档 4~9 共 ${W.filter(w => w.manaCost <= 9).length} 把）；高费 18~20 共 ${W.filter(w => w.manaCost >= 18).length} 把 |\n`;

const fam = [
  ['伤害（Deal/damage）', /deal|damage/i], ['真实伤害', /true damage/i], ['随机分摊伤害', /randomly split/i],
  ['治疗/回复（Life）', /(restore|life)/i], ['护甲增益', /armor/i], ['攻击增益', /attack/i], ['魔力增益', /\bmagic\b/i],
  ['创造宝石', /create/i], ['转换/变形', /(transform|convert)/i], ['摧毁/引爆', /(destroy|explode)/i],
  ['状态（毒/燃/冻/沉默/缠绕/眩晕/吞噬等）', /(poison|burn|freeze|silence|entangle|stun|devour|death mark|disease|curse)/i],
  ['法力操作（偷取/燃尽/驱蓝）', /(mana|drain)/i], ['额外回合', /extra turn/i], ['净化 Cleanse', /cleanse/i],
  ['窃取属性', /steal/i], ['增幅比（Ratio/Boost）', /(ratio|boost)/i], ['条件倍率（double/triple/bonus）', /(double|triple|bonus|more damage)/i],
];
// 先剥掉 [X+Magic] 公式括号再匹配，避免把公式当效果
const bare = (w) => (w.spell || '').replace(/\[[^\]]*\]/g, '');
stats += `| 效果家族（一法术可跨族，计数为出现次数） | ${fam.map(([k, re]) => `${k} ${W.filter(w => re.test(bare(w))).length}`).join('；')} |\n`;

const gen = (name, content) => `<!--TABLE:${name}:START-->\n${content.trim()}\n<!--TABLE:${name}:END-->`;
const repl = (src, name, content) =>
  new RegExp(`<!--TABLE:${name}:START-->[\\s\\S]*?<!--TABLE:${name}:END-->`).test(src)
    ? src.replace(new RegExp(`<!--TABLE:${name}:START-->[\\s\\S]*?<!--TABLE:${name}:END-->`), gen(name, content))
    : src.replace(`<!--TABLE:${name}-->`, gen(name, content));

let out = fs.readFileSync(doc, 'utf8');
out = repl(out, 'CATALOG', catalog);
out = repl(out, 'STATS', stats);
fs.writeFileSync(doc, out);
console.log('doc updated:', doc, '| groups:', Object.entries(groups).map(([k, v]) => `${k}:${v.length}`).join(' '));
