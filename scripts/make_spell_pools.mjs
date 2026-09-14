/**
 * 技能分池脚本（窗口 B · 人工核对组装的工作切片器）。
 *
 * ⚠️ 本脚本**不做任何语义判定**（那是人工核对的事）。它只做两件机械事：
 *   1. 筛除：按 DECISIONS.md「不做」清单的关键词把确定 blocked 的兵种剔除
 *      （只会多剔不会少剔——宁可漏掉几条可做的，也不把没希望的塞进人工池）；
 *   2. 排序分池：把剩下的按「疑似难度」从易到难排序，切成 BATCH_SIZE 条一批，
 *      写入 scripts/curated-pools/pool-XX.json，供核对 agent 逐条组装。
 *
 * 用法: node scripts/make_spell_pools.mjs
 * 输出: scripts/curated-pools/pool-XX.json + scripts/curated-pools/screen.txt（筛选统计）
 */
import fs from 'node:fs';

const BATCH_SIZE = 40;
const troops = JSON.parse(fs.readFileSync('src/data/troops.json', 'utf8'));

/** DECISIONS.md「不做」清单关键词（只用于筛除，命中即不进人工池） */
const NOT_DOING = [
  /黄金|灵魂|英里|赏金/, // 元经济
  /晋升|稀有度|魔头|首领|高塔/, // 晋升度/PVE 条件
  /炸弹宝石|厄运宝石|织网宝石|幽魂宝石|沙漏宝石|通配宝石|许愿宝石|闪电宝石|巨石|末日宝石|燃烧宝石/, // 特殊宝石
  /死亡标记|猎人标记|诅咒|风暴|魅惑|石化|疾病|狼化|法印|吞噬|惑乱|迷惑|催眠|沉睡/, // 缺失状态
  /拉到首位|移到(队|最)|隐匿/, // 位置操作
  /正面增益/, // 驱散敌方增益
  /法力消耗的|四分之一的?法力|相当于其法力/, // 比例法力
  /随机发生任何情况/, // 混沌技能（DECISIONS 建议永久排除）
];

/** 疑似难度打分（越低越先做）。仅是排程启发，不判语义。 */
function difficulty(t) {
  const d = t.spell.description ?? '';
  let s = 0;
  s += Math.min(10, Math.floor(d.length / 18)); // 长描述更难
  s += (d.match(/[。；;&&\n]/g) ?? []).length; // 子句多更难
  if ((t.spell.meta?.scalings ?? []).length === 0) s += 2; // 全自由文本常数
  if (t.spell.meta?.modifier) s += 1; // 带二次缩放
  if (/召唤/.test(d)) s += 1;
  if (/\[\(/.test(d)) s += 1; // 复合缩放
  return s;
}

const pools = [];
const excluded = [];
for (const t of troops) {
  const desc = t.spell?.description ?? '';
  const hit = NOT_DOING.find((re) => re.test(desc));
  if (hit) {
    excluded.push(t);
    continue;
  }
  pools.push(t);
}
pools.sort((a, b) => difficulty(a) - difficulty(b) || a.spell.id - b.spell.id);

fs.mkdirSync('scripts/curated-pools', { recursive: true });
const batchCount = Math.ceil(pools.length / BATCH_SIZE);
for (let i = 0; i < batchCount; i++) {
  const slice = pools.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);
  const payload = slice.map((t) => ({
    troopId: t.id,
    troop: t.name,
    spellId: t.spell.id,
    spellName: t.spell.name,
    desc: t.spell.description,
    scalings: t.spell.meta?.scalings ?? [],
    modifier: t.spell.meta?.modifier ?? null,
  }));
  fs.writeFileSync(
    `scripts/curated-pools/pool-${String(i + 1).padStart(2, '0')}.json`,
    JSON.stringify(payload, null, 1),
    'utf8',
  );
}

const lines = [
  `技能总数: ${troops.length}`,
  `筛除（不做清单关键词）: ${excluded.length}`,
  `进入人工核对池: ${pools.length}，共 ${batchCount} 批 × ~${BATCH_SIZE} 条`,
];
fs.writeFileSync('scripts/curated-pools/screen.txt', lines.join('\n'), 'utf8');
console.log(lines.join('\n'));
