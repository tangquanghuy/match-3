/**
 * 缺口统计（一次性分析，参照 _analyze_* 系列）。
 *
 * 两个问题：
 *   1. 被动特质：219 个已实现 code 之外，还有多少个 code / 多少次兵种出场没覆盖，
 *      各卡在什么机制上。
 *   2. 技能：1798 条技能里，现有零件（builders.ts 词汇表）能表达多少，
 *      配不了的各缺什么机制 —— 按「补一个机制能解锁多少条」排序，给出优先级。
 *
 * 用法: node scripts/_gap_analysis.mjs
 * 输出: 控制台报告 + artifacts/gap-analysis.txt
 */
import fs from 'node:fs';

const raw = JSON.parse(fs.readFileSync('data/raw/troops.gow.zh.json', 'utf8'));
const troops = JSON.parse(fs.readFileSync('src/data/troops.json', 'utf8'));
const traitsOut = JSON.parse(fs.readFileSync('src/data/traits.json', 'utf8'));

const lines = [];
const out = (s = '') => { lines.push(s); console.log(s); };

/* ============================================================
 * 第一部分 · 被动特质缺口
 * ============================================================ */

// 全库特质 code 清单（code → { name, description, troops 次数, 示例兵种 }）
const traitInfo = new Map();
for (const r of raw.troops) {
  for (const t of r.stats?.traits ?? []) {
    if (!traitInfo.has(t.code)) traitInfo.set(t.code, { name: t.name, description: t.description, troops: 0, sample: r.name });
    traitInfo.get(t.code).troops += 1;
  }
}

const implemented = new Set(traitsOut.map((t) => t.code));
const unimplemented = [...traitInfo.entries()].filter(([code]) => !implemented.has(code));
const implementedTroops = traitsOut.reduce((s, t) => s + (traitInfo.get(t.code)?.troops ?? 0), 0);
const totalAppearances = [...traitInfo.values()].reduce((s, v) => s + v.troops, 0);

out('============================================================');
out('第一部分 · 被动特质缺口');
out('============================================================');
out(`全库特质 code 总数: ${traitInfo.size}，合计 ${totalAppearances} 次兵种出场`);
out(`已实现: ${implemented.size} 个 code，${implementedTroops} 次出场 (${Math.round(implementedTroops / totalAppearances * 100)}%)`);
out(`未实现: ${unimplemented.length} 个 code，${unimplemented.reduce((s, [, v]) => s + v.troops, 0)} 次出场`);

// 缺口归类（按当前引擎状态校准：反弹/闪避/阵亡/施法响应/4-5连钩子已存在，不再是缺口）
const TRAIT_BUCKETS = [
  ['缺状态机制（疾病/狼化/死亡标记/出血/猎人标记/诅咒/风暴/下潮…）',
    /疾病|狼化|死亡标记|吞噬|法力燃烧|法力耗尽|法力窃取|恐怖|出血|猎人标记|受诅|下潮|狂怒|法印|风暴|诅咒|祝福|惑乱|迷惑|催眠|石化|变羊|嘲讽/],
  ['缺特殊宝石（织网/幽魂/沙漏/厄运/炸弹/通配/许愿…）',
    /织网|幽魂|沙漏|厄运|炸弹|巨石|末日宝石|燃烧宝石|闪电宝石|通配|许愿/],
  ['缺召唤钩子（身亡时召唤/战歌）', /召唤|身亡时[，,]?(获得|召唤)/],
  ['缺条件光环（配对4/5时全族…）', /配对.*(盟友|获得)/],
  ['战斗外模式/经济类（淘宝模式/灵魂/黄金/英里/赏金）', /淘宝|灵魂|黄金|英里|赏金|金币/],
  ['晋升度/PVE模式条件（魔头/高塔）', /晋升|稀有度|魔头|高塔/],
];
const traitByBucket = new Map();
const traitRest = [];
for (const [code, v] of unimplemented) {
  const bucket = TRAIT_BUCKETS.find(([, re]) => re.test(v.description));
  if (bucket) {
    if (!traitByBucket.has(bucket[0])) traitByBucket.set(bucket[0], []);
    traitByBucket.get(bucket[0]).push([code, v]);
  } else {
    traitRest.push([code, v]);
  }
}
out('');
out('-- 未实现特质按卡点分布（code 数 / 出场次数）--');
const sortedBuckets = [...traitByBucket.entries()].sort((a, b) => {
  const sum = (list) => list.reduce((s, [, v]) => s + v.troops, 0);
  return sum(b[1]) - sum(a[1]);
});
for (const [name, list] of sortedBuckets) {
  const codes = list.length;
  const apps = list.reduce((s, [, v]) => s + v.troops, 0);
  out(`  ${name.padEnd(46)} ${String(codes).padStart(4)} 个 / ${String(apps).padStart(5)} 次`);
}
{
  const codes = traitRest.length;
  const apps = traitRest.reduce((s, [, v]) => s + v.troops, 0);
  out(`  ${'其它（句式未归类，需人工判读）'.padEnd(44)} ${String(codes).padStart(4)} 个 / ${String(apps).padStart(5)} 次`);
}
out('');
out('-- 各卡点高频示例（code / 出场次数 / 描述截断）--');
for (const [name, list] of sortedBuckets) {
  out(`[${name}]`);
  for (const [code, v] of list.slice(0, 4)) {
    out(`   ${code}  ${String(v.troops).padStart(3)}次  ${v.description.slice(0, 46)}`);
  }
}

/* ============================================================
 * 第二部分 · 技能缺口
 * ============================================================ */

out('');
out('============================================================');
out('第二部分 · 技能组合配置缺口');
out('============================================================');

// 当前已手写的 5 个
const CONFIGURED = new Set(['7004', '7155', '7132', '7062', '7063']);

// 现有零件已支持的关键词（builders.ts / effects/* 词汇表；织网→entangle、下潜→submerged）
const SUPPORTED = [
  ['伤害', /造成.*伤害|点伤害|散射伤害|真实伤害/],
  ['创造宝石/骷髅', /创造.*颗|创造.*宝石|创造.*骷髅|创建.*颗|创建.*宝石/],
  ['转化', /转换成|转化成|转换为/],
  ['摧毁/爆破', /摧毁|爆破|移除.*宝石|消除.*宝石/],
  ['治疗/增益', /获得.*生命|恢复.*生命|给予.*生命|获得.*护甲|获得.*攻击|获得.*魔法|获得.*技能值|获得.*点护甲|获得.*点攻击/],
  ['法力操作', /获得.*法力|充满法力|获得法力/],
  ['施加状态', /中毒|燃烧|妖火|沉默|冰冻|冻结|眩晕|纠缠|缠绕|织网|屏障|下潜/],
  ['净化', /净化|移除.*(负面|状态)/],
  ['额外回合', /额外回合|再来一次/],
  ['召唤', /召唤/],
];

// 现有零件覆盖不了的机制 → 缺口标签
const MISSING = [
  ['二次缩放[xN]/[N:M]未接通', null], // 用 meta.modifier 单独判
  ['敌方削弱（减攻/减甲/减魔/耗蓝）', /减除|耗掉|减半|损失.*点(攻击|护甲|魔法|法力)|使其法力值?减|耗尽/],
  ['窃取', /窃取|偷取|偷走/],
  ['特殊宝石（炸弹/厄运/织网/幽魂/沙漏/通配…）', /炸弹|厄运|织网宝石|幽魂宝石|沙漏|巨石|末日宝石|闪电宝石|通配|许愿宝石/],
  ['诅咒状态', /诅咒/],
  ['概率子句（有N%几率…）', /\d+%\s*的?几率/],
  ['死亡/阵亡条件触发', /身亡|如果.*死亡|死亡时|阵亡时/],
  ['元经济（黄金/灵魂）', /黄金|灵魂/],
  ['随机属性获得（N点随机技能值）', /随机技能值/],
  ['比例法力（法力消耗的N分之一）', /法力消耗的|四分之一的?法力|相当于其法力/],
  ['动态颜色（按军队法力色/混合色）', /该军队法力颜色|该军队的法力|自身法力颜色|混合/],
  ['驱散敌方增益', /消除.*敌人的?正面增益|移除.*(敌方|敌人).*(增益|强化)/],
  ['法力燃烧/耗蓝', /法力燃烧|烧尽|耗尽/],
  ['伤害区间（[低]–[高]/N-M颗）', /\]\s*[–—-]\s*\[|\d+\s*[-–]\s*\d+\s*颗/],
  ['晋升度/魔头条件', /晋升|稀有度|魔头|首领/],
  ['其它缺失状态（疾病/出血/猎人标记/死亡标记/魅惑/风暴…）', /疾病|出血|猎人标记|风暴|法印|狼化|吞噬|惑乱|迷惑|催眠|石化|死亡标记|魅惑|沉睡/],
  ['隐匿/位置操作', /隐匿|拉到首位|移到/],
  ['种族条件翻倍（若盟友是X族…）', /若盟友是一名|如果盟友是一名|若敌人是个|如果敌人是/],
];

const spellBuckets = new Map(); // 标签组合 key → 列表
let noEffectDetected = [];

function classifySpell(t) {
  const desc = t.spell?.description ?? '';
  const meta = t.spell?.meta;
  const missing = new Set();
  for (const [name, re] of MISSING) {
    if (name.startsWith('二次缩放')) continue;
    if (re && re.test(desc)) missing.add(name);
  }
  if (meta?.modifier) missing.add('二次缩放效果（[xN]/[N:M] 未接通）');
  // 已支持操作：至少命中一个才算有可配的效果
  const supportedHits = SUPPORTED.filter(([, re]) => re.test(desc)).map(([n]) => n);
  return { missing: [...missing], supportedHits, desc };
}

const stats = {
  configured: [],
  expressible: [],
  constantOnly: [],
  blocked: [],
  noEffect: [],
};
for (const t of troops) {
  const key = String(t.spell?.id ?? '');
  const { missing, supportedHits } = classifySpell(t);
  if (CONFIGURED.has(key)) { stats.configured.push(t); continue; }
  if (supportedHits.length === 0 && missing.length === 0) { stats.noEffect.push(t); continue; }
  if (missing.length === 0) {
    // 无方括号 → 数值全是自由文本常数，生成器要按操作逐个正则抽数，风险略高，单独计数
    const meta = t.spell?.meta;
    (meta?.scalings?.length ? stats.expressible : stats.constantOnly).push(t);
    continue;
  }
  stats.blocked.push({ t, missing });
}

out(`技能总数: ${troops.length}`);
out(`  已手写配置:            ${String(stats.configured.length).padStart(5)}`);
out(`  现有零件可直接配置:    ${String(stats.expressible.length).padStart(5)}   （含方括号缩放，数值可直接来自 meta）`);
out(`  可配置但数值是自由文本: ${String(stats.constantOnly.length).padStart(5)}   （"造成 8 点伤害"这类常数，需逐操作抽数）`);
out(`  缺机制被卡住:          ${String(stats.blocked.length).padStart(5)}`);
out(`  未识别出任何效果:      ${String(stats.noEffect.length).padStart(5)}`);
out('');
out(`>> 第一波（现有零件 + 已配置）即可覆盖: ${stats.configured.length + stats.expressible.length + stats.constantOnly.length} / ${troops.length} 条 (${Math.round((stats.configured.length + stats.expressible.length + stats.constantOnly.length) / troops.length * 100)}%)`);

// 机制需求排名：缺某机制的技能数；以及「只缺这一个」的数量（补它就解锁）
out('');
out('-- 缺什么机制（按卡住技能数排序）--');
out('   机制                                          卡住   只缺它一个=补完即解锁');
const mechDemand = new Map();
for (const { missing } of stats.blocked) {
  for (const m of missing) mechDemand.set(m, (mechDemand.get(m) ?? 0) + 1);
}
const mechOnly = new Map();
for (const { missing } of stats.blocked) {
  if (missing.length === 1) mechOnly.set(missing[0], (mechOnly.get(missing[0]) ?? 0) + 1);
}
for (const [m, n] of [...mechDemand.entries()].sort((a, b) => b[1] - a[1])) {
  out(`   ${m.padEnd(44)} ${String(n).padStart(5)}   ${String(mechOnly.get(m) ?? 0).padStart(5)}`);
}

// 组合分布前 10
out('');
out('-- 缺口组合 Top 10 --');
for (const [missing, list] of [...stats.blocked.reduce((map, item) => {
  const k = item.missing.join(' + ');
  (map.get(k) ?? map.set(k, []).get(k)).push(item);
  return map;
}, new Map()).entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 10)) {
  out(`   ${String(list.length).padStart(4)} 条  ${missing}`);
}

// 样例
out('');
out('-- 各缺口样例（兵种 / 技能名 / 描述）--');
const seen = new Set();
for (const { t, missing } of stats.blocked) {
  const m = missing[0];
  if (seen.has(m)) continue;
  if ((mechDemand.get(m) ?? 0) < 3) continue;
  seen.add(m);
  out(`   [${m}] ${t.name}「${t.spell.name}」: ${t.spell.description.slice(0, 52)}`);
}

fs.writeFileSync('artifacts/gap-analysis.txt', '\uFEFF' + lines.join('\n'), 'utf8');
console.log('\n(报告已写入 artifacts/gap-analysis.txt)');
