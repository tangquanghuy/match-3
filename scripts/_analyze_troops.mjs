// 临时分析脚本：统计 troops 数据的战斗维度分布，为缺口分析提供事实依据。用完即删。
import fs from 'node:fs';

const raw = JSON.parse(fs.readFileSync('tests/unit/troops.zh.json', 'utf8'));
const troops = raw.troops;

const out = [];
const log = (s) => out.push(s);

log(`总兵种数: ${troops.length}`);

// 稀有度分布
const rarity = {};
for (const t of troops) rarity[t.RarityIdx] = (rarity[t.RarityIdx] ?? 0) + 1;
log(`\n稀有度(rarity_idx)分布: ${JSON.stringify(rarity)}`);

// 角色定位分布
const roles = {};
for (const t of troops) for (const r of (t._TroopRole_parsed ?? [])) roles[r] = (roles[r] ?? 0) + 1;
log(`\n角色定位(role)分布: ${JSON.stringify(roles)}`);

// 种族分布
const types = {};
for (const t of troops) {
  for (const k of [t.TroopType, t.TroopType2]) if (k) types[k] = (types[k] ?? 0) + 1;
}
log(`\n种族(troop_type)种类数: ${Object.keys(types).length}`);
log(`种族分布: ${JSON.stringify(types)}`);

// 法力颜色数量分布（1/2/3/4 色）
const manaColorCount = {};
const colorFreq = {};
for (const t of troops) {
  const cs = t.mana_colors ?? [];
  manaColorCount[cs.length] = (manaColorCount[cs.length] ?? 0) + 1;
  for (const c of cs) colorFreq[c] = (colorFreq[c] ?? 0) + 1;
}
log(`\n法力颜色数量分布: ${JSON.stringify(manaColorCount)}`);
log(`各颜色出现频次: ${JSON.stringify(colorFreq)}`);

// 数值范围
const stat = (key) => {
  const vals = troops.map((t) => t[key]).filter((v) => typeof v === 'number');
  const min = Math.min(...vals), max = Math.max(...vals);
  const avg = (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1);
  return `min=${min} max=${max} avg=${avg}`;
};
log(`\n数值范围:`);
for (const k of ['Attack', 'Armor', 'Health', 'Magic', 'ManaCost']) log(`  ${k}: ${stat(k)}`);

// 特质频次
const traitFreq = {};
for (const t of troops) for (const tr of (t._Traits_parsed ?? [])) traitFreq[tr] = (traitFreq[tr] ?? 0) + 1;
const traitSorted = Object.entries(traitFreq).sort((a, b) => b[1] - a[1]);
log(`\n不同特质(trait)总数: ${traitSorted.length}`);
log(`Top 30 高频特质: ${JSON.stringify(traitSorted.slice(0, 30))}`);

// 技能描述的机制模式
const descs = troops.map((t) => t?.stats?.spell?.desc ?? '').filter(Boolean);
const countPat = (re) => descs.filter((d) => re.test(d)).length;
log(`\n技能总数(有描述): ${descs.length}`);
log(`技能机制模式频次:`);
log(`  含[魔法+N]缩放: ${countPat(/魔法/)}`);
log(`  含[N:M]移除增伤: ${countPat(/\[\d+:\d+\]/)}`);
log(`  含[xN]倍率: ${countPat(/\[x\d+\]/)}`);
log(`  造成伤害: ${countPat(/伤害/)}`);
log(`  创造/转化宝石: ${countPat(/创造|转换|转化/)}`);
log(`  摧毁行/列/区域: ${countPat(/摧毁|爆破|爆炸/)}`);
log(`  治疗/护甲/增益: ${countPat(/生命值|护甲值|攻击力|魔法值/)}`);

// 状态效果关键词
const statuses = ['燃烧', '中毒', '眩晕', '沉默', '冰冻', '纠缠', '织网', '妖火', '诅咒', '致命一击', '护盾', '屏障', '荆棘', '法力耗尽', '定身', '狂暴', '祝福', '闪避'];
log(`\n状态效果关键词出现频次(技能+特质描述):`);
const allText = troops.flatMap((t) => [t?.stats?.spell?.desc ?? '', ...(t?.stats?.traits ?? []).map((x) => x.description ?? '')]);
for (const s of statuses) {
  const n = allText.filter((d) => d.includes(s)).length;
  if (n > 0) log(`  ${s}: ${n}`);
}

fs.writeFileSync('scripts/_troops_report.txt', out.join('\n'), 'utf8');
console.log(out.join('\n'));
