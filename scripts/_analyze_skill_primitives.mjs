// 技能机制原语频次分析：把 1798 条技能描述拆到可实现的"原子操作"，
// 统计每个原语覆盖多少技能，为底层机制的分批实现提供事实依据。
// 用法: node scripts/_analyze_skill_primitives.mjs
import fs from 'node:fs';

const troops = JSON.parse(fs.readFileSync('src/data/troops.json', 'utf8'));
const spells = troops.map((t) => t.spell?.description ?? '').filter(Boolean);
const N = spells.length;

const out = [];
const log = (s) => out.push(s);
const count = (re) => spells.filter((d) => re.test(d)).length;
const pct = (n) => `${((n / N) * 100).toFixed(1)}%`;
const row = (label, re) => {
  const n = count(re);
  log(`  ${label.padEnd(22)} ${String(n).padStart(4)}  ${pct(n)}`);
  return n;
};

log(`技能总数: ${N}`);

log(`\n== 伤害类 ==`);
row('造成伤害(泛)', /伤害/);
row('· 单体/指定敌人', /对敌方|对目标|对.*敌人|首个敌人|随机一个敌人/);
row('· 全体敌人', /所有敌人|全体敌人|每个敌人/);
row('· 溅射/相邻', /相邻|溅射|附近|周围.*敌人/);
row('· 真实/穿透伤害', /真实伤害|穿透|无视护甲/);

log(`\n== 宝石操作类 ==`);
row('创造宝石', /创造/);
row('转化宝石', /转换|转化|变成|变为/);
row('摧毁(爆破/爆炸)', /摧毁|爆破|爆炸/);
row('· 摧毁整行/整列', /一行|一列|整行|整列|该行|该列/);
row('· 区域(3x3等)', /区域|范围|周围/);
row('· 摧毁指定色', /所有.*宝石|该颜色|指定颜色/);

log(`\n== 增益(自身/友方) ==`);
row('加攻击力', /攻击力/);
row('加生命值/治疗', /生命值|治疗|恢复/);
row('加护甲', /护甲/);
row('加法力', /法力/);
row('加魔法', /魔法值/);

log(`\n== 状态效果(施加敌方/己方) ==`);
const statuses = [
  '燃烧', '中毒', '妖火', '流血',
  '眩晕', '沉默', '冰冻', '纠缠', '定身', '缠绕',
  '织网', '诅咒', '法力耗尽', '致命一击',
  '屏障', '护盾', '荆棘', '狂暴', '祝福', '闪避', '魔免', '无敌',
];
for (const s of statuses) {
  const n = spells.filter((d) => d.includes(s)).length;
  if (n > 0) log(`  ${s.padEnd(22)} ${String(n).padStart(4)}  ${pct(n)}`);
}

log(`\n== 缩放/条件 ==`);
row('[魔法+N] 缩放', /魔法/);
row('额外回合/再来一次', /额外|再来|再一次/);
row('召唤', /召唤/);
row('按数量/翻倍缩放', /翻倍|双倍|每.*点|每一?个/);

// 目标措辞样本（帮助设计 TargetSelector）
log(`\n== 目标措辞样本(前15条含"敌"的独特片段) ==`);
const seen = new Set();
for (const d of spells) {
  const m = d.match(/[对向].{0,8}(敌|目标)[^，。]{0,10}/);
  if (m && !seen.has(m[0])) {
    seen.add(m[0]);
    log(`  ${m[0]}`);
    if (seen.size >= 15) break;
  }
}

fs.writeFileSync('scripts/_skill_primitives_report.txt', out.join('\n'), 'utf8');
console.log(out.join('\n'));
