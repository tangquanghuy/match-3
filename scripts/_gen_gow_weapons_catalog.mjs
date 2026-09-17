// 生成 design/GOW-WEAPONS-CATALOG.md —— 每把武器一张设计卡（中文）
// 数据：artifacts/gow-weapons.json + scripts/_gow_zh.mjs（人工翻译映射）
// 用法：node scripts/_gen_gow_weapons_catalog.mjs
import fs from 'node:fs';
import { ZH, ZH_PACK_ONLY, ZH_CLASS_WEAPONS, ZH_BUYABLE, KINGDOM_ZH, MASTERY, norm } from './_gow_zh.mjs';

const data = JSON.parse(fs.readFileSync('artifacts/gow-weapons.json', 'utf8'));
const W = data.weapons;
const OUT = 'design/GOW-WEAPONS-CATALOG.md';

const RARITY_ZH = { Common: '普通', Rare: '稀有', 'Ultra Rare': '超稀有', Epic: '史诗', Legendary: '传说', Mythic: '神话' };
const COLOR_ZH = { Red: '红', Blue: '蓝', Green: '绿', Yellow: '黄', Purple: '紫', Brown: '棕' };
const MASTERY_NAME = { Fire: '火', Water: '水', Earth: '地', Nature: '自然', Air: '空气', Magic: '魔法', ALL: '全' };

// 武器包归属：英文武器名 → 王国（来自官方帖 55952，已并入 supplements）
const PACK = {};
for (const [k, v] of Object.entries(data.supplements.weaponPackByKingdom)) {
  if (k.startsWith('_')) continue;
  PACK[norm(v.replace(' ★', '').replace(/（.*/, ''))] = k;
}

function parseUnlock(u) {
  if (!u) return { type: 'unknown' };
  if (/Special Events/i.test(u)) return { type: 'event' };
  const m = u.match(/^(.*?)\s+Mastery\s+(\d+)/i);
  if (!m) return { type: 'unknown', raw: u };
  const colors = m[1].split(/\s+/).filter(Boolean);
  if (colors.length === 1 && /^all$/i.test(colors[0])) return { type: 'all', level: +m[2] };
  return { type: 'mastery', colors, level: +m[2] };
}

function unlockZh(w) {
  const p = parseUnlock(w.unlock);
  if (p.type === 'mastery' && p.colors.length === 1) return `${MASTERY_NAME[p.colors[0]]}之精通 ${p.level} 级`;
  if (p.type === 'mastery') return `${p.colors.map(c => MASTERY_NAME[c]).join('·')} 双精通 ${p.level} 级`;
  if (p.type === 'all') return `六系全精通 ${p.level} 级`;
  if (p.type === 'event') {
    const k = PACK[norm(w.name)];
    if (k) return `特殊活动 · $4.99 王国武器包（${KINGDOM_ZH[k] || k}）`;
    if (/^warandpeace$/.test(norm(w.name))) return 'Khazial 后续战役任务线（2019 年官方移入灵魂熔炉，特例）';
    return '特殊活动（活动商店 / 限时礼包）';
  }
  return `未知（${w.unlock || '—'}）`;
}

// 类型标签（剥掉公式括号后匹配）
const FAM = [
  ['真实伤害', /true damage/], ['直伤', /(deal|damage)/], ['随机分摊', /randomly split/],
  ['生命回复', /(restore|life)/], ['护甲增益', /armor/], ['攻击增益', /attack/], ['魔力增益', /\bmagic\b/],
  ['创造宝石', /create/], ['转换宝石', /(convert|transform)/], ['摧毁/引爆', /(destroy|explode)/],
  ['中毒', /poison/], ['燃烧', /burn/], ['缠绕', /entangle/], ['沉默', /silence/], ['吞噬', /devour/],
  ['法力操作', /mana/], ['额外回合', /extra turn/], ['净化', /cleanse/], ['窃取属性', /steal/],
  ['增幅比', /(ratio|boost)/], ['条件/概率', /\b(if|when|chance|more damage)\b/],
];
function tags(w) {
  const s = (w.spell || '').replace(/\[[^\]]*\]/g, ' ').toLowerCase();
  const out = FAM.filter(([, re]) => re.test(s)).map(([k]) => k);
  return out.slice(0, 4).join('·') || '—';
}

const card = (w) => {
  const key = norm(w.name);
  const zh = ZH[key];
  const colors = w.colors.map(c => COLOR_ZH[c] || c).join('/');
  const rarity = RARITY_ZH[w.rarity] || w.rarity || '？';
  const L = [];
  L.push(`#### ${zh ? zh[0] : '【待译】'} ${w.name}`);
  L.push(`- ${rarity} ｜ 法力 ${w.manaCost ?? '？'} ｜ ${colors}色 ｜ 素材 #${w.imageId ?? '—'}`);
  L.push(`- 解锁：${unlockZh(w)}`);
  if (zh) L.push(`- 效果：${zh[1]}`);
  else L.push('- 效果：【待补】');
  if (w.spell) L.push(`- 原文：${w.spell}`);
  L.push(`- 类型：${tags(w)}`);
  return L.join('\n');
};

const unknownZh = [];
for (const w of W) if (!ZH[norm(w.name)]) unknownZh.push(w.name);

// ---- 分组 ----
const groups = { mastery: [], dual: [], all: [], event: [] };
for (const w of W) {
  const p = parseUnlock(w.unlock);
  if (p.type === 'mastery') (p.colors.length > 1 ? groups.dual : groups.mastery).push(w);
  else if (p.type === 'all') groups.all.push(w);
  else if (p.type === 'event') groups.event.push(w);
}
const byLevel = (a, b) => parseUnlock(a.unlock).level - parseUnlock(b.unlock).level || a.manaCost - b.manaCost;
groups.dual.sort(byLevel); groups.all.sort(byLevel);

const MASTERY_ORDER = ['Fire', 'Water', 'Earth', 'Nature', 'Air', 'Magic'];
let doc = `# GoW 主角武器 · 全量逐把设计卡（中文）

> 生成于 2026-09-17，数据管线：\`node scripts/_gen_gow_weapons_catalog.mjs\`（源：artifacts/gow-weapons.json + scripts/_gow_zh.mjs）。
> 每张卡字段：**稀有度 ｜ 法力费用 ｜ 颜色 ｜ 素材编号** → **解锁条件** → **效果（中文）** → **原文** → **类型标签**。
> 术语约定：\`[2+魔力]\` = 基数 2 + 主角魔力值（随主角成长缩放，武器本身无独立等级）；\`增幅比 3:1\` = 每满足一个条件单位（如每消除 1 颗对应色宝石）效果 +3；\`真实伤害\` = 无视护甲与减伤；\`素材 #7068\` = 官方原图床 gameguide/images/7068.jpg，可作本项目美术参考。
> 数据可信度：§1~§4 = 官方目录逐把解析（已考证）；§5~§7 = 名称与获取渠道已考证（官方论坛/官方帖），效果数值待逐页补全。

**目录**：单精通线 ${groups.mastery.length} 把 ｜ 双精通线 ${groups.dual.length} 把 ｜ 全精通 ${groups.all.length} 把 ｜ 活动/武器包 ${groups.event.length} 把 ｜ 包独有 ${Object.keys(ZH_PACK_ONLY).length} 把 ｜ 职业神话 ${Object.keys(ZH_CLASS_WEAPONS).length} 把（已验证） ｜ 直购神话 ${Object.keys(ZH_BUYABLE).length} 把
${unknownZh.length ? `\n> ⚠ 缺翻译：${unknownZh.join('、')}\n` : ''}
`;

// §1 单精通线：按色分组
doc += `\n## §1 单精通解锁线（${groups.mastery.length} 把 · 六色成长阶梯）\n`;
const MASTERY_COLOR = { Fire: '红', Water: '蓝', Earth: '棕', Nature: '绿', Air: '黄', Magic: '紫' };
for (const mc of MASTERY_ORDER) {
  const arr = groups.mastery.filter(w => parseUnlock(w.unlock).colors[0] === mc).sort(byLevel);
  if (!arr.length) continue;
  doc += `\n### ${MASTERY_NAME[mc]}之精通（${MASTERY_COLOR[mc]}色武器，${arr.length} 把）\n\n`;
  doc += arr.map(card).join('\n\n') + '\n';
}

doc += `\n## §2 双精通解锁线（${groups.dual.length} 把 · 进阶顶端）\n\n`;
doc += groups.dual.map(card).join('\n\n') + '\n';

doc += `\n## §3 全精通解锁（${groups.all.length} 把 · 战略级）\n\n`;
doc += groups.all.map(card).join('\n\n') + '\n';

doc += `\n## §4 特殊活动 / 王国武器包（${groups.event.length} 把）\n\n`;
doc += groups.event.slice().sort((a, b) => a.name.localeCompare(b.name)).map(card).join('\n\n') + '\n';

// §5 包独有（效果待补）
doc += `\n## §5 王国武器包独有（${Object.keys(ZH_PACK_ONLY).length} 把 · 官方目录未收，效果待补）\n\n`;
doc += `> 官方帖 55952（2019-06）确认的 $4.99 包武器中，以下 6 把不在官方 game-guide 目录里；法术数值需在游戏内/wiki 逐把页补全。\n\n`;
for (const [k, [zh, kingdom]] of Object.entries(ZH_PACK_ONLY)) {
  doc += `#### ${zh}（${kingdom}）\n- 稀有度/法力/颜色：【待补】\n- 解锁：$4.99 王国武器包，随该王国活动返场（永不进灵魂熔炉）\n- 效果：【待补】\n\n`;
}

// §6 职业神话武器
doc += `\n## §6 职业专属神话武器（${Object.keys(ZH_CLASS_WEAPONS).length} 把已验证 / 全 37 把）\n\n`;
doc += `> 解锁规则（已考证）：带该职业出战取得 **250 场胜利**；职业武器一律**单色**（官方 2018-09 裁定）；颜色 = 该职业的武器绑定色。以下为多来源交叉验证的名录，效果数值需逐职业页补全（/wiki/{Class}_(Hero_Class)）。\n\n`;
for (const [k, [zh, cls, note]] of Object.entries(ZH_CLASS_WEAPONS)) {
  doc += `#### ${zh}（${cls}）\n- 稀有度：神话 ｜ 法力/颜色：【待补】\n- 解锁：装备对应职业取得 250 场胜利\n- 效果：【待补】\n`;
  if (note) doc += `- 备注：${note}\n`;
  doc += '\n';
}

// §7 直购神话
doc += `\n## §7 直购神话主角武器（样本）\n\n`;
for (const [k, [zh, note]] of Object.entries(ZH_BUYABLE)) {
  doc += `#### ${zh} Dawnbringer\n- 稀有度：神话 ｜ 三色（法力/数值待补）\n- 解锁：130 万灵魂直购\n- 备注：${note}\n`;
}

fs.writeFileSync(OUT, doc);
console.log('cards:', W.length, '| sections: 7 | missing zh:', unknownZh.length ? unknownZh.join(',') : 'none');
