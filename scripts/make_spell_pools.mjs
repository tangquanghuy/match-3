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

/**
 * 增量模式（`--incremental`，窗口 E · 2026-09-16）：
 *   - 跳过 curated 批次已处理（spells + skipped）的 spellId，只为剩余技能建池；
 *   - 池文件编号从现有最大批次号+1 起（不覆盖既有 pool-XX.json）；
 *   - NOT_DOING 关键词随引擎能力更新（2026-09-16 特殊状态批 + 窗口C 十种宝石落地后，
 *     死亡标记/猎人标记/诅咒/魅惑/疾病 与 八种特殊宝石关键词移出筛除；仍排除未实现状态/宝石）。
 * 无参数时保持原行为（全量重建池 01 起）。
 */
const INCREMENTAL = process.argv.includes('--incremental');

/** DECISIONS.md「不做」清单关键词（只用于筛除，命中即不进人工池） */
const NOT_DOING = [
  /黄金|灵魂|英里|赏金/, // 元经济
  /晋升|稀有度|魔头|首领|高塔/, // 晋升度/PVE 条件
  // 特殊宝石：窗口 C 已实现十种（bomb/doomSkull/uberDoomSkull/web/lightningRow/lightningCol/
  // wildcard/wish/hourglass/ghost），相关关键词不再筛除；仍排除未实现的宝石家族：
  /毒宝石|天使宝石|元素星|流血宝石|恶魔传送门|鬼魂宝石|赃物宝石|龙宝石|红色龙|棕色龙|蓝龙|黄龙|石像鬼宝石|灵力宝石|恐怖宝石|许愿石|愤怒宝石|冰冻宝石|腐烂宝石|妖仙宝石|蛛网宝石|缠绕宝石|巨石/,
  // 缺失状态：死亡标记/猎人标记/诅咒/魅惑/疾病 已落地（2026-09-16）不再筛除；仍排除：
  /石化|狼化|法印|吞噬|惑乱|迷惑|催眠|沉睡|恐怖|妖火|附魔|赐福|祝福|反射|激怒|恐惧|沉没|混乱/,
  /拉到首位|移到(队|最)|隐匿/, // 位置操作
  /正面增益/, // 驱散敌方增益
  /法力消耗的|四分之一的?法力|相当于其法力/, // 比例法力
  /随机发生任何情况/, // 混沌技能（DECISIONS 建议永久排除）
];

/** 已处理的 spellId（curated 批次 spells + skipped；增量模式用） */
function processedIds() {
  const ids = new Set();
  const dir = 'src/engine/skills/curated';
  for (const f of fs.readdirSync(dir)) {
    if (!/^batch-\d+\.ts$/.test(f)) continue;
    const text = fs.readFileSync(`${dir}/${f}`, 'utf8');
    for (const m of text.matchAll(/^\s*(?:\{ )?id: (\d+),/gm)) ids.add(Number(m[1]));
  }
  return ids;
}

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
const done = INCREMENTAL ? processedIds() : new Set();
let alreadyProcessed = 0;
for (const t of troops) {
  const desc = t.spell?.description ?? '';
  if (INCREMENTAL && done.has(t.spell.id)) { alreadyProcessed += 1; continue; }
  const hit = NOT_DOING.find((re) => re.test(desc));
  if (hit) {
    excluded.push(t);
    continue;
  }
  pools.push(t);
}
pools.sort((a, b) => difficulty(a) - difficulty(b) || a.spell.id - b.spell.id);

let firstPool = 1;
if (INCREMENTAL) {
  // 池编号接着 curated 批次号走：跳过既有 pool-XX.json 与 batch-33 这类回收批号
  const used = new Set([
    ...fs.readdirSync('src/engine/skills/curated')
      .map((f) => /^batch-(\d+)\.ts$/.exec(f)?.[1])
      .filter(Boolean)
      .map(Number),
    ...fs.readdirSync('scripts/curated-pools')
      .map((f) => /^pool-(\d+)\.json$/.exec(f)?.[1])
      .filter(Boolean)
      .map(Number),
  ]);
  firstPool = 1;
  while (used.has(firstPool)) firstPool += 1;
}

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
    `scripts/curated-pools/pool-${String(firstPool + i).padStart(2, '0')}.json`,
    JSON.stringify(payload, null, 1),
    'utf8',
  );
}

const lines = [
  `技能总数: ${troops.length}`,
  INCREMENTAL ? `增量模式：curated 已处理 ${alreadyProcessed} 条（跳过）` : '',
  `筛除（不做清单关键词）: ${excluded.length}`,
  `进入人工核对池: ${pools.length}，共 ${batchCount} 批 × ~${BATCH_SIZE} 条（池号 ${firstPool} 起）`,
].filter(Boolean);
fs.writeFileSync('scripts/curated-pools/screen.txt', lines.join('\n'), 'utf8');
console.log(lines.join('\n'));
