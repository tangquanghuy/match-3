#!/usr/bin/env node
/** 回收批 R6 生成器：长尾三类（&& 分隔 / 属性比较 / 聚合存在）+ 池 37~40 首批组装。 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const troops = JSON.parse(readFileSync(path.join(ROOT, 'src', 'data', 'troops.json'), 'utf8'));
const descById = new Map();
for (const t of troops) if (t.spell) descById.set(t.spell.id, t.spell.description);

const E = [];
const add = (id, build) => E.push({ id, build });

// —— && 分隔族（段顺序 = 子句顺序，&& 本就是合法切分符）——
add(8857, `skill(\n      heal('allyAll', 1, 1),\n      mana('allyOthers', 0, 0, { halve: true }),\n    )`);
add(8860, `skill(\n      mana('allyAll', 3, 0),\n      dmgSplash('enemyChosen', 6),\n    )`);
add(8862, `skill(\n      trueDmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardGems', color: BaseColor.Blue } } }),\n      dmgSplash('enemyChosen', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardGems', color: BaseColor.Blue } } }),\n    )`);
add(8863, `skill(\n      trueDmg('enemyAll', 5, 1, { range: 'all' }),\n      summonRandom(FOX_REFS, undefined, { countRange: { min: 1, max: 3 } }),\n    )`);
add(8866, `skill(\n      dmg('enemyChosen', 3, 1, { modifier: { mod: { kind: 'multiplier', a: 1 }, source: { kind: 'targetStat', stat: 'attack' } } }),\n      dmg('enemyChosen', 3, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'enemyStatSum', stat: 'armor' } } }),\n    )`);
add(8868, `skill(\n      createSpecialGems({ kind: 'freezeGem' }, 3),\n      extraTurn(),\n      steal('enemyRandom', 'armor', 'armor', 1, 1),\n    )`);

// —— 属性比较 / 聚合存在 ——
add(7458, `skill(\n      dmg('enemyChosen', 6, 1, { condMult: { times: 3, cond: { kind: 'casterStatBeatsTarget', stat: 'armor' } } }),\n      armor('allySelf', 5, 0),\n    )`);
add(7471, `skill(\n      dmg('enemyFront', 1),\n      inflict('frozen', 'enemyFront'),\n      createGems(BaseColor.Blue, 8, 0, { ifCond: { kind: 'casterStatBeatsTarget', stat: 'magic' } }),\n    )`);
add(7511, `skill(\n      dmg('enemyFront', 0, 0, { rangeSpec: { min: scale(6, 0.5), max: scale(13, 1) }, split: 2 }),\n      createGems(BaseColor.Red, 8, 0, { ifCond: { kind: 'casterStatBeatsTarget', stat: 'attack' } }),\n    )`);
add(7985, `skill(\n      dmgSplash('enemyChosen', 15),\n      inflict('stun', 'enemyAll', { ifCond: { kind: 'targetHpDamaged' } }),\n      summonRef('MonkeyDisciple', undefined, { countRange: { min: 1, max: 3 } }),\n    )`);
add(8418, `skill(\n      dmg('enemyFront', 2),\n      dmg('enemyLast', 2),\n      inflict('barrier', 'allySelf', { ifCond: { kind: 'anyEnemyColor', color: BaseColor.Purple } }),\n    )`);
// 注：8418 的「其中一个使用蓝色→双倍」以 anyEnemyColor 聚合判定挂在两段伤害上（超集口径，裁定见 §13）

const HEADER_IMPORTS = `import { skill, dmg, dmgSplash, trueDmg, heal, armor, mana, inflict, steal,
  createGems, createSpecialGems, summonRef, summonRandom, extraTurn,
  scale } from '../builders';
import { BaseColor } from '../../types';
import type { CuratedBatch } from './index';

// 狐族引用池（生成器从 troops.json 内联）
const FOX_REFS = ${JSON.stringify(troops.filter((t) => (t.name || '').includes('狐')).map((t) => t.referenceName))};`;

const rows = E.map(({ id, build }) => {
  const desc = descById.get(id);
  if (!desc) throw new Error(`spell ${id} 无 desc`);
  const q = `'${desc.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  return `  {\n    id: ${id},\n    desc: ${q},\n    build: ${build},\n  },`;
}).join('\n');

const out = `/**
 * 放弃桶回收批 R6（2026-09-17 用户裁定「做这些东西」）：长尾三类清尾。
 * 新裁定见 spell-rules §13：casterStatBeatsTarget（属性比较 vs 跨段追踪目标）、
 * anyEnemyColor（聚合存在判定超集口径）、'&&' 为合法子句切分符（本就如此，按段顺序组装）。
 */
${HEADER_IMPORTS}

const SKIPPED: { id: number; reason: string }[] = [];

const SPELLS: CuratedBatch['spells'] = [
${rows}
];

export const BATCH_R6: CuratedBatch = { batch: 'R6', spells: SPELLS, skipped: SKIPPED };
`;

writeFileSync(path.join(ROOT, 'src', 'engine', 'skills', 'curated', 'batch-r6.ts'), out, 'utf8');
console.log(`batch-r6.ts 生成：${E.length} 条`);
