// 基础技能可编译范围调研（只统计、不实现）。
// 目标：为"技能编译器"划定第一批要做的效果类型，给出每类频次 + 真实样本，
// 并按"目标范围（单体/群体/随机/最弱…）"细分，便于评估工作量与优先级。
// 用法: node scripts/_analyze_simple_skills.mjs
import fs from 'node:fs';

const troops = JSON.parse(fs.readFileSync('src/data/troops.json', 'utf8'));
const spells = troops
  .map((t) => ({ name: t.spell?.name ?? '', desc: (t.spell?.description ?? '').trim() }))
  .filter((x) => x.desc);
const N = spells.length;

const out = [];
const log = (s) => out.push(s);
const pct = (n) => `${((n / N) * 100).toFixed(1)}%`;

// —— 目标范围识别（伤害/减益类，判断打谁） ——
function enemyScope(s) {
  if (/(所有敌人|全体敌人|每个敌人|所有.{0,3}敌军)/.test(s)) return '群体';
  if (/(最弱|最虚弱)/.test(s)) return '最弱';
  if (/最健康/.test(s)) return '最健康';
  if (/最后一名敌人/.test(s)) return '末位';
  if (/前\s*\d+\s*名敌人/.test(s)) return '前N';
  if (/(散射|溅射|周围|相邻|其下方|上下)/.test(s)) return '溅射/多目标';
  if (/随机.{0,4}敌人/.test(s)) return '随机单体';
  if (/(1\s*名敌人|一名敌人|1\s*个敌人|一个敌人|第\s*1\s*名|第\s*一名|一名随机|敌人|敌方|目标)/.test(s)) return '指定单体';
  return '其他';
}

// —— 各效果类别的匹配器（在整条描述上判断"是否含该效果"） ——
const CATS = [
  ['直接伤害', (s) => /伤害/.test(s)],
  ['· 群体伤害', (s) => /伤害/.test(s) && /(所有敌人|全体敌人|每个敌人)/.test(s)],
  ['· 散射/溅射', (s) => /伤害/.test(s) && /(散射|溅射|周围|相邻|其下方)/.test(s)],
  ['· 真实/穿透伤害', (s) => /(真实伤害|穿透|无视护甲)/.test(s)],
  ['宝石·创造', (s) => /(创造|创建)/.test(s) && /(宝石|骷髅|头)/.test(s)],
  ['宝石·转化', (s) => /(转换|转化|变为|变成).{0,6}(宝石|颜色|色)/.test(s)],
  ['宝石·爆破/摧毁', (s) => /(摧毁|爆破|移除)/.test(s) && /(宝石|一行|一列|骷髅)/.test(s)],
  ['· 摧毁整行/列', (s) => /(摧毁|爆破|移除).{0,4}(一行|一列|整行|整列|\d\s*行|\d\s*列)/.test(s)],
  ['· 摧毁指定色', (s) => /(摧毁|爆破|移除).{0,8}(所有|全部).{0,4}(色|颜色).{0,3}宝石/.test(s) || /(摧毁|爆破|移除)所有.{0,3}宝石/.test(s)],
  ['治疗/加生命', (s) => /生命值/.test(s) && /(恢复|治疗|获得|给予|增加|提供|为.{0,6}增加)/.test(s)],
  ['加护甲', (s) => /护甲/.test(s) && /(获得|给予|增加|提供)/.test(s)],
  ['加攻击力', (s) => /攻击力/.test(s) && /(获得|给予|增加|提供)/.test(s)],
  ['加法力', (s) => /法力值/.test(s) && /(获得|给予|增加|提供)/.test(s)],
  ['加魔法值', (s) => /魔法值/.test(s) && /(获得|给予|增加|提供)/.test(s)],
  ['净化(驱散自身负面)', (s) => /净化/.test(s)],
  ['消除敌方正面增益', (s) => /消除.{0,6}正面增益/.test(s)],
  ['额外回合', (s) => /(额外回合|额外的回合|多一回合|多一个回合|再来一回合|再来一次|额外的一回合)/.test(s)],
  ['召唤', (s) => /召唤/.test(s)],
  ['状态·燃烧', (s) => /燃烧/.test(s)],
  ['状态·中毒', (s) => /中毒/.test(s)],
  ['状态·沉默', (s) => /沉默/.test(s)],
  ['状态·冰冻', (s) => /(冰冻|冻结)/.test(s)],
  ['状态·眩晕', (s) => /(眩晕|击晕)/.test(s)],
  ['状态·诅咒', (s) => /诅咒/.test(s)],
  ['状态·屏障(己)', (s) => /屏障/.test(s)],
];

log(`技能总数: ${N}`);
log(`\n================ 各效果类别出现频次（整库） ================`);
for (const [label, fn] of CATS) {
  const n = spells.filter((x) => fn(x.desc)).length;
  log(`  ${label.padEnd(22)} ${String(n).padStart(4)}  ${pct(n)}`);
}

// —— 伤害技能按目标范围细分 ——
log(`\n================ 伤害技能 · 目标范围细分 ================`);
const dmg = spells.filter((x) => /伤害/.test(x.desc));
const scopeCount = {};
for (const x of dmg) {
  const sc = enemyScope(x.desc);
  scopeCount[sc] = (scopeCount[sc] ?? 0) + 1;
}
for (const [k, v] of Object.entries(scopeCount).sort((a, b) => b[1] - a[1])) {
  log(`  ${k.padEnd(14)} ${String(v).padStart(4)}  ${pct(v)}`);
}

// —— 每类给几个真实样本 ——
function samplesFor(fn, k = 5) {
  const arr = [];
  for (const x of spells) {
    if (fn(x.desc)) {
      arr.push(`「${x.name}」${x.desc}`);
      if (arr.length >= k) break;
    }
  }
  return arr;
}

const SAMPLE_CATS = [
  ['指定单体伤害', (s) => /伤害/.test(s) && enemyScope(s) === '指定单体'],
  ['群体伤害', (s) => /伤害/.test(s) && /(所有敌人|全体敌人)/.test(s)],
  ['随机单体伤害', (s) => /伤害/.test(s) && enemyScope(s) === '随机单体'],
  ['宝石·创造', (s) => /(创造|创建)/.test(s) && /(宝石|骷髅)/.test(s)],
  ['宝石·转化', (s) => /(转换|转化).{0,6}(宝石|颜色|色)/.test(s)],
  ['宝石·爆破整行列', (s) => /(摧毁|爆破|移除).{0,4}(一行|一列|\d\s*行|\d\s*列)/.test(s)],
  ['治疗', (s) => /生命值/.test(s) && /(恢复|治疗|给予|获得)/.test(s)],
  ['净化', (s) => /净化/.test(s)],
  ['消除敌方增益', (s) => /消除.{0,6}正面增益/.test(s)],
];
for (const [label, fn] of SAMPLE_CATS) {
  log(`\n== 样本: ${label} ==`);
  for (const s of samplesFor(fn)) log(`  ${s}`);
}

fs.writeFileSync('scripts/_simple_skills_report.txt', out.join('\n'), 'utf8');
console.log(out.join('\n'));
