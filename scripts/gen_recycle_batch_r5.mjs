#!/usr/bin/env node
/**
 * 回收批 R5 生成器：六原语回收（位置/分摊/跨段绑定/召唤区间/once-per-battle/否定条件）。
 * 新裁定见 spell-rules §12（2026-09-17 用户裁定：位置要做、分摊要做、其他要做）。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const troops = JSON.parse(readFileSync(path.join(ROOT, 'src', 'data', 'troops.json'), 'utf8'));
const descById = new Map();
for (const t of troops) if (t.spell) descById.set(t.spell.id, t.spell.description);

const E = [];
const add = (id, build) => E.push({ id, build });

// —— 跨段绑定（'lastTarget' 目标模式：「再使他…」不再漂移）——
add(7043, `skill(dmg('enemyRandom', 5), inflict('silence', 'lastTarget'))`);
add(7363, `skill(\n      dmg('enemyRandom', 3),\n      inflict('burning', 'lastTarget'),\n      createSpecialGems({ kind: 'burningGem' }, 3),\n    )`);
add(7371, `skill(\n      inflict('stun', 'enemyRandom'),\n      inflict('poison', 'lastTarget'),\n      inflict('disease', 'lastTarget'),\n    )`);
add(7431, `skill(\n      inflict('frozen', 'enemyRandom'),\n      inflict('web', 'lastTarget'),\n      mana('allySelf', 0, 0, { halve: true, ifCond: { kind: 'boardAtLeast', color: BaseColor.Blue, n: 13 } }),\n    )`);
add(9051, `skill(\n      trueDmg('enemyRandom', 2),\n      inflict('poison', 'lastTarget'),\n      reduce('lastTarget', 'mana', 5),\n    )`);

// —— 分摊（{N}：掷一次总额均分给前 N 名存活敌人）——
add(7061, `skill(\n      dmg('enemyFront', 0, 0, {\n        rangeSpec: { min: scale(4, 0.5), max: scale(8, 1) },\n        split: 2,\n        modifier: { mod: { kind: 'ratio', a: 2, b: 1 }, source: { kind: 'selfStat', stat: 'missingHp' } },\n      }),\n      dmg('allySelf', 2, 0),\n      attack('allySelf', 4),\n    )`);
add(7640, `skill(\n      dmg('enemyFront', 0, 0, { rangeSpec: { min: scale(4, 0.5), max: scale(8, 1) }, split: 2 }),\n      extraTurn({ ifTargetDied: true }),\n    )`);
add(8960, `skill(dmg('enemyFront', 0, 0, { rangeSpec: { min: scale(1, 0.5), max: scale(3, 1) }, split: 2 }))`);

// —— 位置（reposition / shuffleTeam）——
add(7774, `skill(\n      trueDmg('enemyChosen', 1),\n      reposition('enemyChosen', 'back'),\n      inflict('submerged', 'allySelf'),\n    )`);
add(8020, `skill(\n      dmg('enemyLast', 4),\n      inflict('stun', 'enemyLast'),\n      reposition('enemyLast', 'front'),\n    )`);
add(8483, `skill(\n      armor('allySelf', 1, 1),\n      inflict('barrier', 'allySelf'),\n      reposition('enemyRandom', 'back'),\n    )`);
add(8695, `skill(\n      dmg('enemyChosen', 4, 1.5),\n      inflict('entangle', 'enemyChosen'),\n      reposition('enemyChosen', 'front'),\n    )`);
add(9131, `skill(\n      reposition('enemyRandom', 'back'),\n      inflict('stun', 'lastTarget'),\n      reposition('allySelf', 'front'),\n      attack('allySelf', 1, 2),\n      heal('allySelf', 1, 2),\n      armor('allySelf', 1, 2),\n    )`);
add(9187, `skill(\n      destroyChosenCol(),\n      dmg('enemyLast', 3),\n      inflict('stun', 'enemyLast'),\n      reposition('allySelf', 'front'),\n      reposition('enemyLast', 'front'),\n    )`);
add(8027, `skill(dmgSplash('enemyChosen', 12), shuffleTeam('enemy'))`);
add(9343, `skill(\n      createGems(BaseColor.Yellow, 8, 0, { countRange: { min: 8, max: 11 } }),\n      shuffleTeam('enemy'),\n    )`);
add(8666, `skill(\n      shuffleBoard(),\n      shuffleTeam('enemy'),\n      extraTurn({ chance: 0.07, chanceBoost: { mod: { kind: 'multiplier', a: 7 }, source: { kind: 'boardGems', color: BaseColor.Brown } } }),\n    )`);

// —— 召唤数量区间 ——
add(8546, `skill(\n      summonRef('DragonSpirit', undefined, { countRange: { min: 1, max: 3 } }),\n      explodeRandomGems(10, 0, 'all', undefined, { ifCond: { kind: 'troopPresent', side: 'ally', name: '龙魂' } }),\n    )`);
add(8559, `skill(\n      createGems(BaseColor.Yellow, 5),\n      transformToSpecial(BaseColor.Yellow, 'doomSkull'),\n      summonRef('Warg', undefined, { countRange: { min: 1, max: 3 } }),\n    )`);
add(8654, `skill(\n      reduce('enemyAll', 'mana', 7),\n      inflict('faerie-fire', 'enemyAll'),\n      inflict('burning', 'enemyAll'),\n      summonRef('Nightmare', undefined, { countRange: { min: 1, max: 3 } }),\n    )`);

// —— once-per-battle ——
add(8598, `skillOnce(\n      inflict('poison', 'enemyAll'),\n      steal('enemyAll', 'mana', 'mana', 7),\n      destroySkulls(),\n    )`);

// —— 否定条件 ——
add(7457, `skill(\n      trueDmg('enemyRandom', 3),\n      mana('allySelf', 0, 0, {\n        chance: 0.06,\n        ifCond: { kind: 'not', cond: { kind: 'boardAtLeast', color: BaseColor.Purple, n: 1 } },\n        modifier: { mod: { kind: 'multiplier', a: 1 }, source: { kind: 'selfStat', stat: 'manaCost' } },\n      }),\n    )`);
add(8824, `skill(\n      armor('allySelf', 4, 0),\n      extraTurn({\n        chance: 0.07,\n        ifCond: { kind: 'not', cond: { kind: 'boardAtLeast', color: BaseColor.Blue, n: 1 } },\n        chanceBoost: { mod: { kind: 'multiplier', a: 7 }, source: { kind: 'boardGems', color: BaseColor.Blue } },\n      }),\n    )`);

const rows = E.map(({ id, build }) => {
  const desc = descById.get(id);
  if (!desc) throw new Error(`spell ${id} 无 desc`);
  const q = `'${desc.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  return `  {\n    id: ${id},\n    desc: ${q},\n    build: ${build},\n  },`;
}).join('\n');

const out = `/**
 * 放弃桶回收批 R5（2026-09-17 用户裁定：位置要做、分摊要做、其他要做）。
 * 核对者：窗口 G，${E.length} 条。六原语见 spell-rules §12：
 * reposition/shuffleTeam（位置）、dmg split（分摊 {N}）、'lastTarget' 目标模式（跨段绑定）、
 * summon countRange（召唤数量区间）、skillOnce/oncePerBattle、'not' 条件 + selfStat manaCost。
 */
import { skill, dmg, dmgSplash, trueDmg, heal, armor, attack, mana, inflict, reduce, steal,
  createGems, createSpecialGems, transformToSpecial, explodeRandomGems, destroyChosenCol,
  destroySkulls, shuffleBoard, summonRef, extraTurn, reposition, shuffleTeam,
  skillOnce, scale } from '../builders';
import { BaseColor } from '../../types';
import type { CuratedBatch } from './index';

const SKIPPED: { id: number; reason: string }[] = [];

const SPELLS: CuratedBatch['spells'] = [
${rows}
];

export const BATCH_R5: CuratedBatch = { batch: 'R5', spells: SPELLS, skipped: SKIPPED };
`;

writeFileSync(path.join(ROOT, 'src', 'engine', 'skills', 'curated', 'batch-r5.ts'), out, 'utf8');
console.log(`batch-r5.ts 生成：${E.length} 条`);
