#!/usr/bin/env node
/**
 * 回收批 R4 生成器：几率/状态/经典宝石三大族二次过筛（~60 条）。
 * 新裁定（spell-rules §11 追加）：
 *   - selfStatus 条件（「若自身身处狂怒状态」）
 *   - 并列数值段共用单一 scaling（「获得 [M+1] 点护甲值和攻击力」两段同值）
 *   - 裸「爆破/摧毁一颗宝石」= 随机一颗（与裸伤害句式同理）
 *   - 「有 N% 几率自毁」= sacrifice('allySelf', { chance: N })
 * desc 从 troops.json 逐字拉取；build 人工拼装（SOP）。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const troops = JSON.parse(readFileSync(path.join(ROOT, 'src', 'data', 'troops.json'), 'utf8'));
const descById = new Map();
for (const t of troops) if (t.spell) descById.set(t.spell.id, t.spell.description);
const SPIDERS = troops.filter((t) => (t.name || '').includes('蜘蛛')).map((t) => t.referenceName);

const E = [];
const add = (id, build) => E.push({ id, build });

add(7014, `skill(\n      destroySpecialGems('web'),\n      dmg('enemyWeakest', 1, 1, { modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'destroyedGems' } } }),\n    )`);
add(7376, `skill(\n      dmg('enemyChosen', 1),\n      dmg('enemyAll', 1, 1, { range: 'all', ifCond: { kind: 'targetColor', color: BaseColor.Yellow } }),\n      inflict('burning', 'enemyAll', { ifCond: { kind: 'targetColor', color: BaseColor.Yellow } }),\n    )`);
add(7524, `skill(\n      explodeChosenRow(),\n      dmg('enemyAll', 4, 1, { range: 'all', condBonus: { n: 9, cond: { kind: 'selfStatus', statusId: 'rage' } } }),\n    )`);
add(7533, `skill(inflict('web', 'enemyRandom'), summonRandom(SPIDER_REFS))`);
add(7593, `skill(inflict('faerie-fire', 'enemyChosen'), extraTurn())`);
add(7668, `skill(\n      drainMana('enemyChosen'),\n      inflict('stun', 'enemyChosen'),\n      inflict('silence', 'enemyChosen'),\n      dmg('enemyChosenAndBelow', 6, 1, { range: 'all' }),\n    )`);
add(7712, `skill(\n      dmg('enemyChosenAndBelow', 5, 1, {\n        range: 'all',\n        modifier: { mod: { kind: 'multiplier', a: 8 }, sources: [{ kind: 'alliesOfRace', race: 'Merfolk' }, { kind: 'allyStatusCount', statusId: 'submerged' }] },\n      }),\n      inflict('submerged', 'allyAll', { ifCond: { kind: 'targetColor', color: BaseColor.Blue } }),\n      inflict('silence', 'enemyAll', { ifCond: { kind: 'targetColor', color: BaseColor.Blue } }),\n    )`);
add(7742, `skill(dmg('enemyChosen', 4, 1, { condMult: { times: 2, cond: { kind: 'targetStatus', statusId: 'rage' } } }))`);
add(7811, `skill(\n      dmg('enemyChosenAndBelow', 3, 1, { range: 'all' }),\n      inflict('burning', 'enemyChosenAndBelow'),\n      inflict('faerie-fire', 'enemyChosenAndBelow'),\n    )`);
add(7814, `skill(\n      inflict('charm', 'enemyChosen'),\n      transformTroopRandom('enemyChosen', ['Succubus', 'Incubus'], { chance: 0.4 }),\n    )`);
add(7956, `skill(\n      destroyRandomGems(1, 1),\n      inflict('burning', 'enemyRandom'),\n      oneOf([summonRef('AngryMob')], [dmg('enemyFront', 1, 1)]),\n    )`);
add(7968, `skill(\n      mana('allyAll', 4),\n      { ...oneOf([dmgAll(1)], [explodeRandomGems(8, 0)], [heal('allyAll', 1, 1)]), chance: 0.5 },\n    )`);
add(8173, `skill(\n      inflict('silence', 'enemyChosen'),\n      destroyRandomGems(1, 0.25, 'color', 'LAST_TARGET'),\n      extraTurn(),\n    )`);
add(8215, `skill(\n      inflict('curse', 'enemyHealthiest'),\n      inflict('death-mark', 'enemyHealthiest'),\n      destroyRandomGems(1, 1, 'color', 'LAST_TARGET'),\n    )`);
add(8218, `skill(\n      dmg('enemyChosen', 3, 1, { modifier: { mod: { kind: 'ratio', a: 2, b: 1 }, sources: [{ kind: 'boardGems', color: BaseColor.Blue }, { kind: 'boardGems', color: BaseColor.Red }] } }),\n      oneOf([inflict('frozen', 'enemyChosen')], [inflict('burning', 'enemyChosen')]),\n    )`);
add(8229, `skill(\n      dmg('enemyChosen', 4, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'boardGems', color: BaseColor.Red } } }),\n      transformTroop('allySelf', 'BeastmasterTorbern', { chance: 0.15 }),\n    )`);
add(8230, `skill(\n      explodeRandomGems(1, 0.5, 'color', BaseColor.Red),\n      inflict('rage', 'allySelf'),\n      transformTroop('allySelf', 'BeastmasterTorbern', { chance: 0.2 }),\n    )`);
add(8231, `skill(\n      dmg('enemyChosen', 4, 1, { condMult: { times: 3, cond: { kind: 'boardAtLeast', color: BaseColor.Red, n: 13 } } }),\n      createGems(BaseColor.Red, 8, 0, { ifCond: { kind: 'boardAtLeast', color: BaseColor.Red, n: 13 } }),\n      transformTroop('allySelf', 'BeastmasterTorbern', { chance: 0.25 }),\n    )`);
add(8236, `skill(\n      dmg('enemyChosen', 3, 1, {\n        modifier: { mod: { kind: 'multiplier', a: 5 }, source: { kind: 'enemyStatusCount', statusId: 'poison' } },\n        condMult: { times: 2, cond: { kind: 'targetColor', color: BaseColor.Blue } },\n      }),\n      dmg('enemyRandom', 3, 1, {\n        modifier: { mod: { kind: 'multiplier', a: 5 }, source: { kind: 'enemyStatusCount', statusId: 'poison' } },\n        condMult: { times: 2, cond: { kind: 'targetColor', color: BaseColor.Blue } },\n      }),\n    )`);
add(8241, `skill(\n      dmg('enemyChosen', 3, 1, {\n        modifier: { mod: { kind: 'multiplier', a: 5 }, source: { kind: 'allyStatusCount', statusId: 'rage' } },\n        condMult: { times: 2, cond: { kind: 'targetColor', color: BaseColor.Brown } },\n      }),\n      dmg('enemyRandom', 3, 1, {\n        modifier: { mod: { kind: 'multiplier', a: 5 }, source: { kind: 'allyStatusCount', statusId: 'rage' } },\n        condMult: { times: 2, cond: { kind: 'targetColor', color: BaseColor.Brown } },\n      }),\n    )`);
add(8249, `skill(oneOf(\n      [createSkulls(7, 0, { countRange: { min: 7, max: 10 } })],\n      [createSpecialGems({ kind: 'doomSkull' }, 6, 0, { countRange: { min: 6, max: 8 } })],\n      [summonRef('ChaosHound')],\n    ))`);
add(8250, `skill(oneOf(\n      [drainMana('enemyChosen')],\n      [steal('enemyChosen', 'attack', 'attack', 1, 1)],\n      [inflict('silence', 'enemyChosen')],\n    ))`);
add(8280, `skill(\n      dmg('enemyAll', 4, 0.5, { range: 'all' }),\n      extraTurn({ chance: 0.25, chanceBoost: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardGems', color: BaseColor.Brown } } }),\n      mana('allySelf', 0, 0, { halve: true, chance: 0.25, chanceBoost: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardGems', color: BaseColor.Brown } } }),\n    )`);
add(8281, `skill(\n      inflict('barrier', 'allySelf'),\n      armor('allySelf', 1, 1),\n      extraTurn({ chance: 0.25, chanceBoost: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardGems', color: BaseColor.Brown } } }),\n      mana('allySelf', 0, 0, { halve: true, chance: 0.25, chanceBoost: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardGems', color: BaseColor.Brown } } }),\n    )`);
add(8371, `skill(\n      dmg('enemyChosen', 3),\n      transformTroopRandom('enemyChosen', WRAITH_REFS, { chance: 0.5, ifCond: { kind: 'targetRace', race: 'Daemon' } }),\n    )`);
add(8405, `skill(\n      explodeColor(BaseColor.Red),\n      dmg('enemyFront', 2, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'selfStat', stat: 'armor' } } }),\n      sacrifice('allySelf', { chance: 0.15 }),\n    )`);
add(8407, `skill(\n      oneOf([dmg('enemyChosen', 3, 3)], [dmg('enemyChosen', 3, 1)]),\n      sacrifice('allySelf', { chance: 0.15 }),\n    )`);
add(8415, `skill(\n      dmg('enemyFront', 4, 1, { modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, source: { kind: 'selfStat', stat: 'attack' } } }),\n      inflict('bleed', 'enemyFront', { stacks: 2, ifCond: { kind: 'selfStatus', statusId: 'rage' } }),\n    )`);
add(8433, `skill(dmg('enemyFirstN', 4, 1, {\n      n: 2,\n      modifier: { mod: { kind: 'multiplier', a: 5 }, sources: [{ kind: 'enemyStatusCount', statusId: 'burning' }, { kind: 'enemyStatusCount', statusId: 'faerie-fire' }] },\n    }))`);
add(8458, `skill(\n      dmg('enemyFirstN', 2, 1, { n: 2 }),\n      inflict('stun', 'enemyFirstN', { n: 2 }),\n      oneOf([extraTurn()], [armor('allySelf', 12, 0)]),\n    )`);
add(8547, `skill(\n      dmg('enemyChosen', 7, 1.5),\n      dmg('enemyChosen', 0, 0, { execute: true, chance: 0, chanceBoost: { mod: { kind: 'multiplier', a: 1 }, source: { kind: 'selfStat', stat: 'magic' } } }),\n      { ...summonRef('Lemure'), ifTargetDied: true },\n    )`);
add(8572, `skill(\n      dmg('enemyLastN', 1, 1, { n: 2 }),\n      inflictRandom('enemyLastN'),\n      inflict('poison', 'enemyLastN', { n: 2 }),\n    )`);
add(8710, `skill(transformToSpecial(CHOSEN, 'burningGem'))`);
add(8712, `skill(dmgSplash('enemyChosen', 3, 1, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'boardSpecial', gem: 'burningGem' } } }))`);
add(8746, `skill(dmg('enemyChosen', 3), transformToSpecial(BaseColor.Red, 'burningGem', { count: 3 }))`);
add(8757, `skill(dmgSplash('enemyChosen', 2), createSpecialGems({ kind: 'burningGem' }, 3))`);
add(8760, `skill(dmg('enemyChosen', 2, 1, {\n      modifier: { mod: { kind: 'multiplier', a: 3 }, sources: [{ kind: 'boardSpecial', gem: 'burningGem' }, { kind: 'allyStatusCount', statusId: 'burning' }, { kind: 'enemyStatusCount', statusId: 'burning' }] },\n    }))`);
add(8787, `skill(\n      inflict('rage', 'allyAll'),\n      attack('allyAll', 1, 1),\n      createMix(['SKULL', BaseColor.Yellow], 22),\n    )`);
add(8850, `skill(\n      dmg('enemyAll', 6, 2, { range: 'all', modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'boardSkulls' } } }),\n      transformToSpecial('SKULL', 'doomSkull', { count: 5 }),\n      extraTurn({ chance: 0.1, chanceBoost: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'boardSkulls' } } }),\n    )`);
add(8901, `skill(transformToSpecial(CHOSEN, 'uberDoomSkull'))`);
add(8903, `skill(\n      inflict('faerie-fire', 'enemyChosen'),\n      dmg('enemyChosen', 3, 0.8, { modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'enemyStatusCount', statusId: 'bleed' } } }),\n    )`);
add(8945, `skill(\n      armor('allySelf', 1, 1),\n      attack('allySelf', 1, 1),\n      transformToSpecial(BaseColor.Brown, 'entangleGem', { count: 4 }),\n    )`);
add(8963, `skill(\n      dmg('enemyRandomN', 6, 1, { n: 3 }),\n      createSpecialGems({ kind: 'wildcard', tier: 3 }, 3, 0, { countRange: { min: 3, max: 6 } }),\n    )`);
add(8970, `skill(\n      armor('allyRandomN', 3, 0, { n: 2 }),\n      extraTurn({ chance: 0.07, chanceBoost: { mod: { kind: 'multiplier', a: 7 }, source: { kind: 'boardGems', color: BaseColor.Yellow } } }),\n    )`);
add(8974, `skill(\n      createSpecialGems({ kind: 'deathMarkGem' }, 2),\n      extraTurn({ chance: 0.07, chanceBoost: { mod: { kind: 'multiplier', a: 7 }, source: { kind: 'boardGems', color: BaseColor.Purple } } }),\n    )`);
add(9003, `skill(\n      createSpecialGems({ kind: 'bootyGem' }, 2),\n      extraTurn({ chance: 0.07, chanceBoost: { mod: { kind: 'multiplier', a: 7 }, source: { kind: 'boardGems', color: BaseColor.Blue } } }),\n    )`);
add(9024, `skill(\n      dmg('enemyAll', 1, 1, { range: 'all', modifier: { mod: { kind: 'multiplier', a: 3 }, source: { kind: 'boardSpecial', gem: 'faerieFireGem' } } }),\n      summonRef('SummerKnight'),\n    )`);
add(9053, `skill(createSpecialGems({ kind: 'faerieFireGem' }, 1), dmg('enemyLast', 3))`);
add(9054, `skill(\n      explodeRandomGems(1, 1),\n      heal('allySelf', 0, 0, { full: true }),\n      inflict('terror', 'enemyAll'),\n    )`);
add(9056, `skill(dmg('enemyChosen', 2), inflict('terror', 'enemyChosen'))`);
add(9057, `skill(createGems(BaseColor.Blue, 7, 0, { modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'enemyStatusCount', statusId: 'terror' } } }))`);
add(9058, `skill(\n      dmg('enemyChosen', 4, 1, { condMult: { times: 2, cond: { kind: 'targetStatus', statusId: 'terror' } } }),\n      inflict('terror', 'enemyChosen'),\n    )`);
add(9059, `skill(\n      transform(BaseColor.Red, BaseColor.Purple),\n      transformToSpecial(BaseColor.Blue, 'doomSkull'),\n      inflict('terror', 'enemyHealthiest'),\n    )`);
add(9067, `skill(\n      inflict('terror', 'enemyChosen'),\n      steal('enemyChosen', 'attack', 'attack', 1, 1),\n      reduce('enemyChosen', 'mana', 7),\n    )`);
add(9069, `skill(\n      createSpecialGems({ kind: 'wish' }, 2),\n      extraTurn(),\n      oneOf(\n        [trueDmg('enemyLastN', 1, 1, { n: 2 })],\n        [heal('allyAll', 1, 1)],\n        [explodeRandomGems(1, 1, 'color', BaseColor.Brown)],\n      ),\n    )`);
add(9126, `skill(\n      dmg('enemyChosen', 4),\n      inflict('frozen', 'enemyChosenAndBelow', { chance: 0.5 }),\n    )`);
add(9163, `skill(transformToSpecial(BaseColor.Green, 'terrorGem'), dmg('enemyRandom', 2))`);
add(9164, `skill(\n      attack('allySelf', 1, 1),\n      heal('allySelf', 1, 1),\n      transformToSpecial(BaseColor.Purple, 'terrorGem', { count: 1 }),\n    )`);
add(9179, `skill(\n      trueDmg('enemyFront', 3),\n      extraTurn({ chance: 0.25, chanceBoost: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardGems', color: BaseColor.Brown } } }),\n      mana('allySelf', 0, 0, { halve: true, chance: 0.25, chanceBoost: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardGems', color: BaseColor.Brown } } }),\n    )`);

const HEADER_IMPORTS = `import type { CuratedBatch } from './index';
import { skill, dmg, dmgSplash, dmgAll, trueDmg, heal, armor, attack, mana, inflict,
  inflictRandom, reduce, steal, drainMana, createGems, createSkulls, createSpecialGems,
  createMix, transform, transformToSpecial, explodeRandomGems, explodeColor, explodeChosenRow,
  destroySpecialGems, destroyRandomGems, oneOf, summonRef, summonRandom, extraTurn, sacrifice, transformTroop,
  transformTroopRandom, CHOSEN } from '../builders';
import { BaseColor } from '../../types';
// 蜘蛛族引用池（生成器从 troops.json 内联）
const SPIDER_REFS = ${JSON.stringify(SPIDERS)};
const WRAITH_REFS = ${JSON.stringify(troops.filter((t) => (t.name || '').includes('怨灵')).map((t) => t.referenceName))};`;

const rows = E.map(({ id, build }) => {
  const desc = descById.get(id);
  if (!desc) throw new Error(`spell ${id} 无 desc`);
  const q = `'${desc.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  return `  {\n    id: ${id},\n    desc: ${q},\n    build: ${build},\n  },`;
}).join('\n');

const out = `/**
 * 放弃桶回收批 R4（2026-09-17 用户裁定「接着做」）：几率/状态/经典宝石三大族二次过筛。
 * 核对者：窗口 G，${E.length} 条。新增裁定见 spell-rules §11 追加（selfStatus 条件、
 * 并列段共用 scaling、裸单颗宝石操作=随机、自毁=sacrifice allySelf）。
 */
${HEADER_IMPORTS}

const SKIPPED: { id: number; reason: string }[] = [];

const SPELLS: CuratedBatch['spells'] = [
${rows}
];

export const BATCH_R4: CuratedBatch = { batch: 'R4', spells: SPELLS, skipped: SKIPPED };
`;

writeFileSync(path.join(ROOT, 'src', 'engine', 'skills', 'curated', 'batch-r4.ts'), out, 'utf8');
console.log(`batch-r4.ts 生成：${E.length} 条`);
