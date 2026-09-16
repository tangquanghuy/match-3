#!/usr/bin/env node
/** 回收批 R3 生成器：随机状态阵营分池（盟友正面/敌方负面）+ 敌方颜色占位符（ENEMY/LAST_TARGET）。 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const troops = JSON.parse(readFileSync(path.join(ROOT, 'src', 'data', 'troops.json'), 'utf8'));
const descById = new Map();
for (const t of troops) if (t.spell) descById.set(t.spell.id, t.spell.description);

const ENTRIES = [
  { id: 7521, build: `skill(\n      heal('allyAll', 1, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'boardGems', color: BaseColor.Brown } } }),\n      inflictRandom('allyRandom'),\n    )` },
  { id: 7994, build: `skill(\n      dmg('enemyChosen', 4),\n      inflictRandom('allyAll'),\n    )` },
  { id: 8428, build: `skill(\n      reduce('enemyChosen', 'attack', 1, 1),\n      inflictRandom('enemyChosen', { times: 3 }),\n    )` },
  { id: 7425, build: `skill(\n      createGems('ENEMY', 7),\n      { ...transformTroop('enemyRandom', 'GiantToadstool'), chance: 0.2 },\n    )` },
  { id: 9957, build: `skill(\n      steal('enemyChosen', 'mana', 'mana', 6, 0),\n      transformToSpecial('LAST_TARGET', 'poisonGem'),\n    )` },
];

const rows = ENTRIES.map(({ id, build }) => {
  const desc = descById.get(id);
  if (!desc) throw new Error(`spell ${id} 无 desc`);
  const q = `'${desc.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  return `  {\n    id: ${id},\n    desc: ${q},\n    build: ${build},\n  },`;
}).join('\n');

const out = `/**
 * 放弃桶回收批 R3（2026-09-17 用户裁定补充：随机状态按目标阵营分池——盟友正面/敌方负面；
 * 敌方颜色动态取色占位符 'ENEMY'（随机存活敌人的一种法力色）与 'LAST_TARGET'（跨段该敌人））。
 * 核对者：窗口 G，${ENTRIES.length} 条。裁定依据 spell-rules §11 补充。
 */
import { skill, dmg, heal, reduce, steal, inflictRandom,
  createGems, transformToSpecial, transformTroop } from '../builders';
import { BaseColor } from '../../types';
import type { CuratedBatch } from './index';

const SKIPPED: { id: number; reason: string }[] = [];

const SPELLS: CuratedBatch['spells'] = [
${rows}
];

export const BATCH_R3: CuratedBatch = { batch: 'R3', spells: SPELLS, skipped: SKIPPED };
`;

writeFileSync(path.join(ROOT, 'src', 'engine', 'skills', 'curated', 'batch-r3.ts'), out, 'utf8');
console.log(`batch-r3.ts 生成：${ENTRIES.length} 条`);
