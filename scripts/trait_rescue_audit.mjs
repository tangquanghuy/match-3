#!/usr/bin/env node
/**
 * 特质缺口可救性审查（窗口 G，2026-09-17 用户裁定「特质缺口能做的做」）。
 *
 * 对 424 个未实现 code 按可救性分层：
 *   T1 免疫类（statusImmunities 机制已实现，只差 traits.json 数据行 → 纯数据批）
 *   T2 死亡钩子族（onDeath/onEnemyDeath：死亡召唤基建已有，加变体）
 *   T3 骷髅命中共（onSkullDamage 施加状态：结算点已有）
 *   T4 宝石创造钩子族（onDeath/onTurnStart 创造特殊宝石：创造管线已有）
 *   T5 条件光环残余（onBigMatch/colorMatch 族已实现，黄金/灵魂除外=范围外）
 *   X 范围外（元经济/晋升度/淘宝模式）
 *   O 其他（需人工逐条判读）
 * 输出 artifacts/recycle/traits-rescue-plan.md（下一批特质执行的作业单）。
 */
import fs from 'node:fs';

const raw = JSON.parse(fs.readFileSync('data/raw/troops.gow.zh.json', 'utf8'));
const traitsOut = JSON.parse(fs.readFileSync('src/data/traits.json', 'utf8'));
const implemented = new Set(traitsOut.map((t) => t.code));

// 全量 code → { n(出场), desc样例, troops样例 }
const universe = new Map();
const troopsList = raw.troops || [];
for (const t of troopsList) {
  for (const tr of t.stats?.traits ?? []) {
    if (!universe.has(tr.code)) universe.set(tr.code, { n: 0, desc: tr.description || '', troop: t.name || '' });
    universe.get(tr.code).n += 1;
  }
}

const IMMU_HINTS = [
  ['猎人标记', 'marked'], ['死亡标记', 'death-mark'], ['击晕', 'stun'], ['眩晕', 'stun'],
  ['缠绕', 'entangle'], ['蛛网', 'web'], ['织网', 'web'], ['冻结', 'frozen'], ['冰冻', 'frozen'],
  ['沉默', 'silence'], ['中毒', 'poison'], ['疾病', 'disease'], ['狼化', 'lycanthropy'],
  ['魅惑', 'charm'], ['诅咒', 'curse'], ['恐怖', 'terror'], ['下潜', 'submerged'],
  ['法力燃烧', 'mana-burn'], ['燃烧', 'burning'], ['妖火', 'faerie-fire'],
];

const tiers = { T1: [], T2: [], T3: [], T4: [], T5: [], X: [], O: [] };
let count = 0;
for (const [code, info] of universe) {
  if (implemented.has(code)) continue;
  count += 1;
  const d = info.desc || '';
  const row = { code, n: info.n, desc: d.slice(0, 60) };
  if (/淘宝|赏金|英里|晋升|魔头|高塔/.test(d)) tiers.X.push(row);
  else if (/免疫/.test(d)) {
    const hit = IMMU_HINTS.find(([zh]) => d.includes(zh));
    (hit ? tiers.T1 : tiers.O).push({ ...row, statusId: hit ? hit[1] : '' });
  } else if (/在敌人身亡时|敌人身亡时|一名敌人身亡/.test(d)) tiers.T2.push(row);
  else if (/在自身身亡时|身亡时|死亡时/.test(d) && /召唤/.test(d)) tiers.T2.push(row);
  else if (/在自身身亡时|身亡时|死亡时/.test(d) && /创造|宝石/.test(d)) tiers.T4.push(row);
  else if (/在造成骷髅头伤害时|骷髅头伤害时/.test(d)) tiers.T3.push(row);
  else if (/在配对 4 或 5 颗|在配对骷髅头时/.test(d) && /黄金|灵魂/.test(d)) tiers.X.push(row);
  else if (/在配对 4 或 5 颗|在配对骷髅头时|在配对.{0,6}宝石时/.test(d)) tiers.T5.push(row);
  else tiers.O.push(row);
}

let md = `# 特质缺口可救性作业单（窗口 G 生成于 ${new Date().toLocaleString('zh-CN')}）\n\n`;
md += `> 未实现 ${count} code。分层：T1 免疫类=纯数据批（statusImmunities 机制已实现，改 build_traits.mjs 生成规则即可）；\n`;
md += `> T2 死亡钩子/T3 骷髅命中共/T4 宝石创造钩子=traits.ts 加触发变体；T5 条件光环残余；X=范围外（元经济/晋升度，用户已裁定不做）；O=需人工判读。\n\n`;
const labels = {
  T1: 'T1 免疫类（纯数据批，优先做）',
  T2: 'T2 死亡钩子族（敌人身亡/自身身亡 → 获益/召唤）',
  T3: 'T3 骷髅命中共（骷髅伤害施加状态）',
  T4: 'T4 宝石创造钩子族（身亡/回合开始创造特殊宝石）',
  T5: 'T5 条件光环残余（非经济类）',
  X: 'X 范围外（元经济/晋升度——用户裁定不做）',
  O: 'O 需人工判读',
};
for (const [k, list] of Object.entries(tiers)) {
  md += `## ${labels[k]}（${list.length}）\n\n`;
  for (const r of list.sort((a, b) => b.n - a.n)) {
    md += `- **${r.code}**（${r.n}次）${r.desc}${r.statusId ? ` → statusImmunities: ['${r.statusId}']` : ''}\n`;
  }
  md += '\n';
}
fs.writeFileSync('artifacts/recycle/traits-rescue-plan.md', md, 'utf8');
console.log(`未实现 ${count} code：T1=${tiers.T1.length} T2=${tiers.T2.length} T3=${tiers.T3.length} T4=${tiers.T4.length} T5=${tiers.T5.length} X=${tiers.X.length} O=${tiers.O.length}`);
console.log('→ artifacts/recycle/traits-rescue-plan.md');
