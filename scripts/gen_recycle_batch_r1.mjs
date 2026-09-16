#!/usr/bin/env node
/**
 * 回收批生成器（一次性）：按下方手工拼装表生成 src/engine/skills/curated/batch-R1.ts。
 * desc 一律从 troops.json 逐字拉取（SOP §7 对号入座锚，杜绝手抄错字）；
 * build 为人工读懂后手写的组装器调用（spell-assembler.md SOP），机器不猜语义。
 *
 * 本批口径（用户裁定 2026-09-17「放弃桶能做的都要做」）：
 *   - 裸伤害句式（「造成…点(真实/散射)伤害」无目标词）= 对 1 名敌人 enemyChosen；
 *     散射为类型词 → 溅射链（dmgSplash / dmg range:'splash'）。数据内证据：
 *     凡全体目标必明写「所有敌人」（散射族 40 条无一例外），见 spell-rules §0 新增行。
 *   - 燃烧宝石等 13 颗状态宝石（波A 已落地）、几率子句（chance）、伤害区间（rangeSpec）
 *     均为已实现原语，原放弃理由作废。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** 手工拼装表：id → build 源码（imports 手动维护于 HEADER_IMPORTS） */
const ENTRIES = [
  { id: 7007, build: `skill(dmgSplash('enemyChosen', 3), createSpecialGems({ kind: 'bomb' }, 2))` },
  { id: 7035, build: `skill(\n      dmgSplash('enemyChosen', 4, 1, { modifier: { mod: { kind: 'ratio', a: 2, b: 1 }, source: { kind: 'enemyStatSum', stat: 'armor' } } }),\n      steal('enemyRandom', 'mana', 'mana', 4, 0),\n    )` },
  { id: 7265, build: `skill(\n      dmg('enemyChosen', 6, 1, { range: 'splash', trueDamage: true }),\n      reduce('enemyAll', 'mana', 7),\n    )` },
  { id: 7470, build: `skill(dmg('enemyChosen', 8, 0, {\n      trueDamage: true,\n      range: 'splash',\n      modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, sources: [{ kind: 'allyStatSum', stat: 'armor' }, { kind: 'enemyStatSum', stat: 'armor' }] },\n    }))` },
  { id: 7792, build: `skill(\n      dmgSplash('enemyChosen', 10, 1, { modifier: { mod: { kind: 'multiplier', a: 8 }, source: { kind: 'allyStatusCount', statusId: 'rage' } } }),\n      inflict('rage', 'allyAll'),\n      attack('allyAll', 6),\n    )` },
  { id: 8459, build: `skill(\n      destroyChosenCol(),\n      dmgSplash('enemyChosen', 7),\n      oneOf([extraTurn()], [mana('allySelf', 12, 0)]),\n    )` },
  { id: 8586, build: `skill(\n      destroyColor(CHOSEN),\n      dmg('enemyChosen', 10, 1, { trueDamage: true, range: 'splash', modifier: { mod: { kind: 'multiplier', a: 10 }, source: { kind: 'destroyedGems' } } }),\n    )` },
  { id: 8656, build: `skill(dmg('allyRandomN', 3, 0.5, {\n      range: 'splash',\n      n: 2,\n      modifier: { mod: { kind: 'multiplier', a: 3 }, sources: [{ kind: 'alliesOfColor', color: BaseColor.Blue }, { kind: 'teamSize', side: 'enemy' }] },\n    }))` },
  { id: 8678, build: `skill(dmgSplash('enemyChosen', 8, 1, { modifier: { mod: { kind: 'multiplier', a: 4 }, sources: [{ kind: 'boardGems', color: BaseColor.Purple }, { kind: 'alliesOfColor', color: BaseColor.Purple }] } }))` },
  { id: 8827, build: `skill(\n      dmgSplash('enemyChosen', 22, 2),\n      transformToSpecial(CHOSEN, 'uberDoomSkull', { count: 8 }),\n    )` },
  { id: 8934, build: `skill(dmg('enemyChosen', 5, 1, { trueDamage: true, range: 'splash', condMult: { times: 2, cond: { kind: 'stormPresent' } } }))` },
  { id: 9175, build: `skill(\n      dmgSplash('enemyChosen', 20, 1, { modifier: { mod: { kind: 'multiplier', a: 10 }, source: { kind: 'enemyStatusCount', statusId: 'web' } } }),\n      createGems(BaseColor.Purple, 10),\n    )` },
  { id: 9493, build: `skill(dmgSplash('enemyChosen', 8, 1, { modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardGems', color: BaseColor.Green } } }))` },
  { id: 9673, build: `skill(\n      dmgSplash('enemyChosen', 4, 1, { modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, sources: [{ kind: 'boardGems', color: BaseColor.Red }, { kind: 'boardSkulls' }] } }),\n      inflict('burning', 'enemyRandom'),\n    )` },
  { id: 9710, build: `skill(\n      dmgSplash('enemyChosen', 6),\n      inflict('burning', 'enemyRandomN', { nRange: { min: 1, max: 2 } }),\n    )` },
  // —— 伤害区间族（rangeSpec 已落地）——
  { id: 7213, build: `skill(\n      dmg('enemyRandom', 0, 0, { rangeSpec: { min: scale(5, 0.5), max: scale(10, 1) } }),\n      randomStat('allySelf', 12, 0),\n      extraTurn({ chance: 0.5 }),\n    )` },
  { id: 8203, build: `skill(\n      dmg('enemyChosen', 0, 0, {\n        rangeSpec: { min: scale(1, 0.5), max: scale(3, 1) },\n        modifier: { mod: { kind: 'ratio', a: 3, b: 1 }, sources: [{ kind: 'selfStat', stat: 'attack' }, { kind: 'selfStat', stat: 'hp' }, { kind: 'selfStat', stat: 'armor' }] },\n      }),\n      inflict('rage', 'allySelf', { ifTargetDied: true }),\n    )` },
  { id: 8410, build: `skill(dmg('enemyRandomN', 0, 0, { n: 6, rangeSpec: { min: scale(1, 0.625), max: scale(2, 1.25) } }))` },
  { id: 8563, build: `skill(dmg('enemyRandomN', 0, 0, {\n      n: 4,\n      rangeSpec: { min: scale(1, 0.5), max: scale(3, 1) },\n      modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, sources: [{ kind: 'boardGems', color: BaseColor.Red }, { kind: 'boardGems', color: BaseColor.Purple }] },\n    }))` },
  { id: 8624, build: `skill(dmg('enemyRandom', 0, 0, {\n      rangeSpec: { min: scale(1, 0.5), max: scale(2, 1) },\n      modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, sources: [{ kind: 'boardGems', color: BaseColor.Green }, { kind: 'teamSize', side: 'ally' }] },\n    }))` },
  { id: 8625, build: `skill(\n      inflict('burning', 'enemyRandomN', { nRange: { min: 2, max: 4 } }),\n      armor('allySelf', 1, 1, { modifier: { mod: { kind: 'multiplier', a: 2 }, sources: [{ kind: 'boardGems', color: BaseColor.Red }, { kind: 'teamSize', side: 'ally' }] } }),\n    )` },
  { id: 8735, build: `skill(dmg('enemyFront', 0, 0, { rangeSpec: { min: scale(1, 0.5), max: scale(2, 1) } }))` },
  { id: 9064, build: `skill(\n      dmg('enemyAll', 2, 1, { range: 'all', modifier: { mod: { kind: 'ratio', a: 1, b: 1 }, sources: [{ kind: 'boardGems', color: BaseColor.Blue }, { kind: 'boardGems', color: BaseColor.Purple }] } }),\n      createGems(BaseColor.Purple, 9, 0, { countRange: { min: 9, max: 13 } }),\n    )` },
];

const HEADER_IMPORTS = `import { skill, dmg, dmgSplash, reduce, steal, attack, armor, mana, inflict, createGems,
  createSpecialGems, transformToSpecial, destroyChosenCol, destroyColor, oneOf,
  extraTurn, randomStat, scale, CHOSEN } from '../builders';
import { BaseColor } from '../../types';`;

// —— 拉取 desc（逐字） ——
const troops = JSON.parse(readFileSync(path.join(ROOT, 'src', 'data', 'troops.json'), 'utf8'));
const descById = new Map();
for (const t of troops) if (t.spell) descById.set(t.spell.id, t.spell.description);

const rows = ENTRIES.map(({ id, build }) => {
  const desc = descById.get(id);
  if (!desc) throw new Error(`spell ${id} 在 troops.json 无 desc`);
  const q = `'${desc.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  return `  {\n    id: ${id},\n    desc: ${q},\n    build: ${build},\n  },`;
}).join('\n');

const out = `/**
 * 放弃桶回收批 R1（用户裁定 2026-09-17「能做的都要做」；scatter+range 族 23 条）。
 * 核对者：窗口 G。原批次 skipped 的对应条目已同步剪除。
 *
 * 本批新裁定（已同步 spell-rules §0 / spell-assembler §3）：
 *   - 裸伤害句式（无目标词的「造成…点(真实/散射)伤害」）= 对 1 名敌人（enemyChosen），
 *     散射为类型词 → 溅射链。数据内证据：散射族凡全体必明写「所有敌人」（40/40）。
 *   - 燃烧宝石（burningGem，波A）、几率子句（chance）、伤害区间（rangeSpec）原语均已落地，
 *     相关放弃理由作废。
 */
${HEADER_IMPORTS}
import type { CuratedBatch } from './index';

const SKIPPED: { id: number; reason: string }[] = [];

const SPELLS: CuratedBatch['spells'] = [
${rows}
];

export const BATCH_R1: CuratedBatch = { batch: 'R1', spells: SPELLS, skipped: SKIPPED };
`;

writeFileSync(path.join(ROOT, 'src', 'engine', 'skills', 'curated', 'batch-r1.ts'), out, 'utf8');
console.log(`batch-r1.ts 生成：${ENTRIES.length} 条`);
