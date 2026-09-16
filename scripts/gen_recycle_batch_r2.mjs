#!/usr/bin/env node
/**
 * 回收批 R2 生成器：五新原语（献祭/随机状态/兵种转化/藏宝图/特定兵种在场）+ 状态宝石族回收。
 * desc 从 troops.json 逐字拉取；build 人工拼装（SOP）。
 * 裁定依据：spell-rules §11（2026-09-17 用户裁定「能做的都要做」）。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const troops = JSON.parse(readFileSync(path.join(ROOT, 'src', 'data', 'troops.json'), 'utf8'));
const descById = new Map();
for (const t of troops) if (t.spell) descById.set(t.spell.id, t.spell.description);

/** 兵种族引用清单（内联进批次文件） */
const REFS = {
  dragons: troops.filter((t) => (t.troopTypes || []).includes('Dragon')).map((t) => t.referenceName),
  wraiths: troops.filter((t) => (t.name || '').includes('怨灵')).map((t) => t.referenceName),
  urska: troops.filter((t) => (t.troopTypes || []).includes('Urska')).map((t) => t.referenceName),
};

const ENTRIES = [
  { id: 7261, build: `skill(inflictRandom('enemyChosen'), randomStat('allyRandom', 1, 1))` },
  { id: 7279, build: `skill(\n      dmg('enemyChosen', 5),\n      inflictRandom('enemyChosen'),\n      gainMaps(1, 0, { chance: 0.2 }),\n    )` },
  { id: 7343, build: `skill(\n      sacrifice('allyOthers'),\n      dmg('enemyAll', 12, 0, { range: 'all', modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'sacrificedStat', stat: 'attack' } } }),\n      { ...summonRef('Abhorath'), chance: 0.3 },\n    )` },
  { id: 7413, build: `skill(\n      dmg('enemyAll', 9, 1, { range: 'all' }),\n      oneOf(\n        [transformTroopRandom('enemyRandom', WRAITH_REFS)],\n        [mana('allyAll', 3, 0)],\n      ),\n    )` },
  { id: 7420, build: `skill(\n      createSkulls(8, 0, { modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'battleMaps' } } }),\n      gainMaps(1, 0, { chance: 0.2 }),\n    )` },
  { id: 7466, build: `skill(\n      createSkulls(5, 0, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'battleMaps' } } }),\n      explodeRandomGems(1, 0.5),\n    )` },
  { id: 7704, build: `skill(\n      sacrifice('allyOthers'),\n      dmg('enemyAll', 1, 0.5, { range: 'all', modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'sacrificedStat', stat: 'hp' } } }),\n      summonRandom(URSKA_REFS),\n    )` },
  { id: 7780, build: `skill(\n      heal('allyOthers', 1),\n      armor('allyOthers', 5, 0),\n      attack('allyOthers', 3, 0),\n      mana('allyOthers', 2, 0),\n      sacrifice('allySelf'),\n    )` },
  { id: 8555, build: `skill(dmg('enemyChosen', 2), gainMaps(1), summonRef('Parrot'))` },
  { id: 8704, build: `skill(\n      dmg('enemyChosen', 3),\n      { ...inflictRandom('enemyAll'), ifTargetDied: true },\n    )` },
  { id: 8535, build: `skill(\n      dmg('enemyLast', 1),\n      inflict('bleed', 'enemyLast', { stacks: 2, ifCond: { kind: 'troopPresent', side: 'ally', name: '尔福·哈利干' } }),\n    )` },
  { id: 8841, build: `skill(\n      explodeRandomGems(1, 0),\n      dmgSplash('enemyChosen', 6),\n      inflict('barrier', 'allyFirstN', { n: 2, ifCond: { kind: 'troopPresent', side: 'ally', name: '梁帝' } }),\n    )` },
  { id: 8939, build: `skill(dmg('enemyChosen', 3, 1, {\n      modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'enemyStatusCount', statusId: 'web' } },\n      condBonus: { n: 10, cond: { kind: 'troopPresent', side: 'ally', name: '丝绸女王' } },\n    }))` },
  { id: 9002, build: `skill(\n      dmg('enemyAll', 2, 1, { range: 'all', modifier: { mod: { kind: 'multiplier', a: 3 }, sources: [{ kind: 'boardSpecial', gem: 'bootyGem' }, { kind: 'battleMaps' }] } }),\n      createSpecialGems({ kind: 'bootyGem' }, 3),\n      gainMaps(2),\n    )` },
  { id: 9779, build: `skill(\n      dmg('enemyChosen', 1, 1, { drain: true }),\n      transformToSpecial(BaseColor.Purple, 'bleedGem', { count: 4 }),\n    )` },
  { id: 9786, build: `skill(\n      dmg('enemyChosen', 3, 1, { modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'boardSpecial', gem: 'bleedGem' } } }),\n      { ...transformToSpecial(BaseColor.Green, 'bleedGem'), ifTargetDied: true },\n    )` },
  { id: 9871, build: `skill(createGems(BaseColor.Green, 5), transformToSpecial(BaseColor.Green, 'poisonGem'))` },
  { id: 9873, build: `skill(oneOf(\n      [dmgSplash('enemyRandom', 4, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'boardSpecial', gem: 'poisonGem' } } })],\n      [transformToSpecial(BaseColor.Yellow, 'poisonGem')],\n    ))` },
  { id: 9874, build: `skill(\n      heal('allyRandomN', 1, 0, { n: 2 }),\n      transformToSpecial(BaseColor.Green, 'submergeGem', { count: 5 }),\n    )` },
  { id: 9939, build: `skill(\n      dmg('enemyAll', 2, 1, { range: 'all', condMult: { times: 2, cond: { kind: 'targetStatus', statusId: 'entangle' } } }),\n      transformToSpecial(BaseColor.Brown, 'entangleGem'),\n    )` },
];

const HEADER_IMPORTS = `import { skill, dmg, dmgSplash, heal, armor, attack, mana, inflict, randomStat,
  createGems, createSkulls, createSpecialGems, transformToSpecial, explodeRandomGems,
  oneOf, summonRef, summonRandom, sacrifice, inflictRandom, transformTroopRandom,
  gainMaps } from '../builders';
import { BaseColor } from '../../types';
import type { CuratedBatch } from './index';

// 兵种族引用池（生成器从 troops.json 内联）
const WRAITH_REFS = ${JSON.stringify(REFS.wraiths)};
const URSKA_REFS = ${JSON.stringify(REFS.urska)};`;

const rows = ENTRIES.map(({ id, build }) => {
  const desc = descById.get(id);
  if (!desc) throw new Error(`spell ${id} 无 desc`);
  const q = `'${desc.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  return `  {\n    id: ${id},\n    desc: ${q},\n    build: ${build},\n  },`;
}).join('\n');

const skippedNote = `
const SKIPPED: { id: number; reason: string }[] = [
  // 五族复核后仍弃（理由更新，详见 artifacts/recycle/worklist.md）：
  // 7373 跨段随机目标绑定（「转化为它」指回前段随机敌）；7425 「指定敌人的法力颜色」动态色不支持；
  // 7438/8744 方括号 [2:1]/[x3] 无归属段（数值不明）；7440 转化以强化效果的时序拿不准；
  // 9793 「受流血宝石加成」无 [xN] 倍率标注；9861 「随机减少随机技能点数」无此原语。
];`;

const out = `/**
 * 放弃桶回收批 R2（2026-09-17 用户裁定：献祭/兵种转化/随机状态/藏宝图/特定兵种在场五原语落地；
 * 加上状态宝石族（波A）清尾）。核对者：窗口 G，${ENTRIES.length} 条。裁定依据 spell-rules §11。
 * 原批次 skipped 对应条目已同步剪除。
 */
${HEADER_IMPORTS}
${skippedNote}

const SPELLS: CuratedBatch['spells'] = [
${rows}
];

export const BATCH_R2: CuratedBatch = { batch: 'R2', spells: SPELLS, skipped: SKIPPED };
`;

writeFileSync(path.join(ROOT, 'src', 'engine', 'skills', 'curated', 'batch-r2.ts'), out, 'utf8');
console.log(`batch-r2.ts 生成：${ENTRIES.length} 条（wraiths=${REFS.wraiths.length} urska=${REFS.urska.length} dragons=${REFS.dragons.length}）`);
