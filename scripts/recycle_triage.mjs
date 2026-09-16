#!/usr/bin/env node
/**
 * 放弃桶回收 triage（用户裁定 2026-09-17：能做的都要做）。
 *
 * 把 curated 批次里全部 skipped 条目捞出，按「理由是否已被新原语作废」分类：
 *   - 燃烧宝石/状态宝石族 → 波A 13 颗已落地，理由过时
 *   - 散射 → SOP §伤害已有裁定（全体散射=range:'all'，单体制溅射=dmgSplash）
 *   - 几率子句 → chance/chanceBoost 已落地
 *   - 伤害区间 → rangeSpec {min,max} 已落地
 *   - 状态族 → STATUS_WHITELIST 16 种已可组装
 *   - 风暴 → createStorm/stormPresent 已落地
 *   - 经济 → gainGold/Souls/Gems + battleGold/Souls/Gems 来源已落地
 * 输出 worklist（按族分组、带 desc），供人工逐条组装。禁止自动猜测语义——本脚本只做分拣。
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CURATED = path.join(ROOT, 'src', 'engine', 'skills', 'curated');

// —— 1. 收集 skipped ——
const files = readFileSync(path.join(CURATED, 'index.ts'), 'utf8')
  .match(/BATCH_\d+/g) ?? [];
const batchFiles = [...new Set(files)].map((n) => {
  const num = n.replace('BATCH_', '').padStart(2, '0');
  return path.join(CURATED, `batch-${num}.ts`);
});

const skipped = [];
for (const f of batchFiles) {
  if (!readFileSync) break;
  let src;
  try { src = readFileSync(f, 'utf8'); } catch { continue; }
  const batch = path.basename(f, '.ts').replace('batch-', '');
  // 匹配 { id: 123, reason: '...' }（含跨行）
  const re = /\{\s*id:\s*(\d+)\s*,\s*reason:\s*'((?:[^'\\]|\\.)*)'\s*\}/g;
  let m;
  while ((m = re.exec(src))) {
    skipped.push({ id: Number(m[1]), batch, reason: m[2].replace(/\\'/g, "'") });
  }
}

const troops = JSON.parse(readFileSync(path.join(ROOT, 'src', 'data', 'troops.json'), 'utf8'));
const spellById = new Map();
for (const t of troops) {
  if (t.spell && !spellById.has(t.spell.id)) spellById.set(t.spell.id, { ...t.spell, troop: t.name });
}

// —— 2. 分类（只做分拣，不做语义猜测；一类可多重命中，优先级从上到下取第一主类） ——
const FAMILIES = [
  { key: 'statusGem', re: /(燃烧|冻结|冰冻|诅咒|流血|毒|死亡标记|恐怖|缠绕|激怒|愤怒|沉没|下潜|妖火|精灵火|妖仙|打昏|击晕|屏障)宝石/ },
  { key: 'scatter', re: /散射/ },
  { key: 'chance', re: /几率|概率/ },
  { key: 'range', re: /\[\s*\(?魔法[^]*?\)\s*\+\s*\d+\s*\]?\s*–\s*\[/, alt: /点伤害.*–|–.*点伤害|[0-9]+\s*[-–]\s*[0-9]+\s*(颗|点|名)/ },
  { key: 'storm', re: /风暴/ },
  { key: 'economy', re: /金币|黄金|灵魂(?!.*幽魂)/ },
  { key: 'states', re: /出血|流血|疾病|诅咒|死亡标记|魅惑|狂怒|猎人标记|屏障|下潜|失眠|恐怖|妖火/ },
  { key: 'classicGems', re: /炸弹|末日骷髅|厄运骷髅|织网|蛛网|闪电|通配|万能牌|许愿|沙漏|赃物|战利品/ },
  { key: 'steal', re: /窃取|减攻|减甲|减魔|耗尽法力/ },
];

function classify(reason, desc) {
  const hits = [];
  for (const f of FAMILIES) {
    if (f.re.test(desc) || (f.alt && f.alt.test(desc)) || f.re.test(reason)) hits.push(f.key);
  }
  return hits;
}

const worklist = [];
for (const s of skipped) {
  const sp = spellById.get(s.id);
  if (!sp) { worklist.push({ ...s, desc: '(desc 缺失)', troop: '', families: ['orphan'] }); continue; }
  worklist.push({ id: s.id, batch: s.batch, reason: s.reason, name: sp.name, troop: sp.troop, desc: sp.description, families: classify(s.reason, sp.description) });
}

const byFamily = {};
for (const w of worklist) {
  for (const f of w.families) {
    (byFamily[f] = byFamily[f] || []).push(w);
  }
}

console.log(`skipped 总数: ${skipped.length}`);
for (const [f, list] of Object.entries(byFamily)) {
  console.log(`  ${f}: ${list.length}`);
}
const noFamily = worklist.filter((w) => w.families.length === 0);
console.log(`  (无新族命中，理由维持): ${noFamily.length}`);

// —— 3. 输出 worklist md ——
mkdirSync(path.join(ROOT, 'artifacts', 'recycle'), { recursive: true });
let md = `# 放弃桶回收 worklist（${new Date().toLocaleString('zh-CN')}，共 ${skipped.length} 条）\n\n`;
md += `> 用户裁定：能做的都要做。燃烧宝石/散射/几率/区间理由已过时；特殊宝石族按波A 词表回收。\n`;
md += `> 本文件只做分拣；组装必须逐条人工读 desc（spell-assembler.md SOP），拿不准继续 SKIP。\n\n`;
for (const [f, list] of Object.entries(byFamily)) {
  md += `## ${f}（${list.length}）\n\n`;
  for (const w of list.sort((a, b) => a.id - b.id)) {
    md += `- **${w.id}** ${w.name}（${w.troop}｜原批次 ${w.batch}）\n  - 原 reason：${w.reason}\n  - desc：${w.desc}\n`;
  }
  md += '\n';
}
md += `## 其它（无新族命中，理由维持）(${noFamily.length})\n\n`;
for (const w of noFamily.sort((a, b) => a.id - b.id)) {
  md += `- **${w.id}** ${w.name}（${w.troop}｜原批次 ${w.batch}）理由：${w.reason}\n  - desc：${w.desc}\n`;
}
writeFileSync(path.join(ROOT, 'artifacts', 'recycle', 'worklist.md'), md, 'utf8');
console.log('worklist → artifacts/recycle/worklist.md');
